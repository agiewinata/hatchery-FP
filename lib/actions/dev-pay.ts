"use server";

/**
 * Simulated payment, for local development only.
 *
 * This posts a callback to our REAL webhook route, carrying the mock gateway's
 * token. That means the development flow exercises the genuine code path -
 * token authentication, idempotency, amount cross-check and the fulfilment
 * branch - rather than quietly calling confirmPayment() and skipping the
 * checks that matter most.
 *
 * It refuses to run unless PAYMENT_PROVIDER is MOCK, and lib/env.ts refuses to
 * boot a production deployment with MOCK selected. So this cannot be reached
 * in production even if the route is requested.
 */
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/data/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getMockCallbackToken } from "@/lib/payments/mock";

import { runAction, type ActionState } from "./result";

export async function simulatePaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let destination: string | null = null;

  const state = await runAction(async () => {
    if (env.PAYMENT_PROVIDER !== "MOCK") {
      return { ok: false, error: "Simulated payments are disabled." };
    }

    const user = await requireUser();
    const orderNumber = String(formData.get("orderNumber") ?? "");
    const outcome = String(formData.get("outcome") ?? "");

    if (outcome !== "PAID" && outcome !== "EXPIRED") {
      return { ok: false, error: "Choose whether the payment succeeds or fails." };
    }

    // Scoped by buyerId: even this dev helper will not let one user settle
    // another user's order.
    const order = await db.order.findFirst({
      where: { orderNumber, buyerId: user.id },
      select: { orderNumber: true, totalIdr: true, gatewayInvoiceId: true },
    });

    if (!order) return { ok: false, error: "That order is not yours." };

    const response = await fetch(new URL("/api/webhooks/payment", env.BETTER_AUTH_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The same header a real gateway would send.
        "x-callback-token": getMockCallbackToken(),
      },
      body: JSON.stringify({
        id: order.gatewayInvoiceId ?? `mock_inv_${order.orderNumber}`,
        external_id: order.orderNumber,
        status: outcome,
        // The honest amount. Change this by hand to watch the cross-check
        // reject a mismatched payment.
        amount: order.totalIdr,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: `The webhook rejected the callback (HTTP ${response.status}).` };
    }

    destination = `/account/orders/${order.orderNumber}`;
    return { ok: true };
  });

  if (destination) redirect(destination);
  return state;
}
