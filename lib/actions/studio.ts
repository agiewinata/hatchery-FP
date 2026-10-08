"use server";

/**
 * Studio design actions.
 *
 * Each one guards (inside the DAL function it calls) and Zod-parses before
 * touching the database. A page-level check would protect none of this: a
 * Server Action is its own POST endpoint, reachable without the studio ever
 * rendering.
 *
 * The outline arrives as a JSON string in a hidden field rather than as loose
 * form values, because it is structured data. It is `JSON.parse`d inside a
 * try/catch and then parsed by `designInputSchema` - the parse is the trust
 * boundary, not the fact that our own editor produced it.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  adminUnpublishDesign,
  createDesign,
  deleteDesign,
  setDesignVisibility,
  updateDesign,
} from "@/lib/data/studio";
import { designIdSchema, designInputSchema, visibilitySchema } from "@/lib/validation/studio";

import { fieldErrors, runAction, type ActionState } from "./result";

/** Pull the JSON payload out of the form without trusting its contents. */
function readDesign(formData: FormData) {
  const raw = formData.get("design");
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false as const, error: "Nothing to save." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false as const, error: "That design could not be read." };
  }

  const result = designInputSchema.safeParse(parsed);
  if (!result.success) return { ok: false as const, issues: result.error };

  return { ok: true as const, data: result.data };
}

export async function saveDesignAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let destination: string | null = null;

  const state = await runAction(async () => {
    const design = readDesign(formData);
    if (!design.ok) {
      return design.issues ? fieldErrors(design.issues) : { ok: false, error: design.error };
    }

    const created = await createDesign(design.data);

    revalidatePath("/studio/designs");
    destination = `/studio/designs/${created.id}`;
    return { ok: true };
  });

  // redirect() throws to signal control flow, so it must sit outside the
  // try/catch in runAction - otherwise it is swallowed and reported as an
  // unexpected error. Same reason as in the checkout action.
  if (destination) redirect(destination);

  return state;
}

export async function updateDesignAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const id = designIdSchema.safeParse(formData.get("designId"));
    if (!id.success) return { ok: false, error: "Unknown design." };

    const design = readDesign(formData);
    if (!design.ok) {
      return design.issues ? fieldErrors(design.issues) : { ok: false, error: design.error };
    }

    // Ownership is enforced inside updateDesign by a userId-scoped WHERE.
    await updateDesign(id.data, design.data);

    revalidatePath("/studio/designs");
    revalidatePath(`/studio/designs/${id.data}`);
    return { ok: true, message: "Saved." };
  });
}

export async function setDesignVisibilityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const id = designIdSchema.safeParse(formData.get("designId"));
    const visibility = visibilitySchema.safeParse(formData.get("visibility"));
    if (!id.success || !visibility.success) {
      return { ok: false, error: "Unknown design or visibility." };
    }

    await setDesignVisibility(id.data, visibility.data);

    revalidatePath("/studio/designs");
    revalidatePath(`/studio/designs/${id.data}`);
    return {
      ok: true,
      message:
        visibility.data === "PUBLIC"
          ? "Shared. Anyone with the link can see this design."
          : "Unshared. The link no longer works.",
    };
  });
}

export async function deleteDesignAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let destination: string | null = null;

  const state = await runAction(async () => {
    const id = designIdSchema.safeParse(formData.get("designId"));
    if (!id.success) return { ok: false, error: "Unknown design." };

    await deleteDesign(id.data);

    revalidatePath("/studio/designs");
    destination = "/studio/designs";
    return { ok: true };
  });

  if (destination) redirect(destination);

  return state;
}

/** Admin takedown. requireAdmin lives inside the DAL call, not here. */
export async function unpublishDesignAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const id = designIdSchema.safeParse(formData.get("designId"));
    if (!id.success) return { ok: false, error: "Unknown design." };

    await adminUnpublishDesign(id.data);

    revalidatePath("/admin/designs");
    return { ok: true, message: "Design unpublished." };
  });
}
