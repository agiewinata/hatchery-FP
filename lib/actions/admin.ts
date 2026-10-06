"use server";

/**
 * Admin actions. Each delegates to lib/data/admin.ts, which calls
 * requireAdmin() itself - so the authorization check cannot be skipped by
 * reaching the action directly.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { setSellerApproval } from "@/lib/data/admin";

import { runAction, type ActionState } from "./result";

const approvalSchema = z.object({
  sellerId: z.cuid(),
  // Arrives as a form value, so it is a string on the wire.
  isApproved: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function setSellerApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = approvalSchema.safeParse({
      sellerId: formData.get("sellerId"),
      isApproved: formData.get("isApproved"),
    });
    if (!parsed.success) return { ok: false, error: "Unknown seller." };

    await setSellerApproval(parsed.data.sellerId, parsed.data.isApproved);

    revalidatePath("/admin/sellers");
    revalidatePath("/products");

    return {
      ok: true,
      message: parsed.data.isApproved
        ? "Seller approved. Their listings can go public now."
        : "Seller suspended and their live listings moved back to drafts.",
    };
  });
}
