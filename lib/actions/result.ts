/**
 * Shared result shape and error handling for Server Actions.
 *
 * Why a wrapper: Server Actions are public POST endpoints. If one throws, Next
 * returns a generic error to the client in production but logs the real one -
 * which is correct, yet gives the user nothing useful. This wrapper converts
 * our own typed errors into friendly messages while making sure an unexpected
 * error never leaks a stack trace, a query or a database message to the
 * browser.
 */
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/auth";
import { CheckoutError } from "@/lib/data/orders";
import { MoneyError } from "@/lib/money";

export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Initial state for useActionState. */
export const idleState: ActionState = { ok: true };

export function fieldErrors(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): ActionState {
  const map: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    (map[key] ??= []).push(issue.message);
  }
  return {
    ok: false,
    error: "Please check the highlighted fields.",
    fieldErrors: map,
  };
}

/**
 * Run an action body, mapping known errors to messages a user can act on.
 *
 * Anything unrecognised becomes a deliberately vague message: an unexpected
 * error is exactly the case where the details are most likely to be sensitive.
 */
export async function runAction(body: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: "Please sign in and try again." };
    }
    if (error instanceof ForbiddenError) {
      // ForbiddenError messages are written to be safe to show.
      return { ok: false, error: error.message };
    }
    if (error instanceof CheckoutError || error instanceof MoneyError) {
      return { ok: false, error: error.message };
    }

    // Log the real error server-side; tell the user nothing specific.
    console.error("[action] unexpected error", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
