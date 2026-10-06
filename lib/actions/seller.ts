"use server";

/**
 * Seller profile, product management and fulfilment actions.
 */
import { revalidatePath } from "next/cache";

import { requireSeller } from "@/lib/data/auth";
import { advanceOrderItem } from "@/lib/data/orders";
import {
  addProductImage,
  createProduct,
  deleteProductImage,
  setProductStatus,
  updateProduct,
} from "@/lib/data/products";
import { getOwnEarnings, upsertOwnSellerProfile } from "@/lib/data/sellers";
import { db } from "@/lib/db";
import { productInputSchema, productStatusSchema, slugSchema } from "@/lib/validation/product";
import {
  orderStatusChangeSchema,
  payoutRequestSchema,
  sellerProfileSchema,
} from "@/lib/validation/seller";

import { fieldErrors, runAction, type ActionState } from "./result";

/** Turn a title into a candidate slug. The result is still schema-validated. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function saveSellerProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = sellerProfileSchema.safeParse({
      slug: formData.get("slug"),
      displayName: formData.get("displayName"),
      bio: formData.get("bio") ?? "",
      location: formData.get("location") ?? "",
      websiteUrl: formData.get("websiteUrl") ?? "",
      instagram: formData.get("instagram") ?? "",
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    const profile = await upsertOwnSellerProfile(parsed.data);

    revalidatePath("/seller/dashboard");
    revalidatePath(`/sellers/${profile.slug}`);

    return {
      ok: true,
      message: profile.isApproved
        ? "Profile saved."
        : "Profile saved. An admin will review your account before your listings go public.",
    };
  });
}

function readProductForm(formData: FormData) {
  return {
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    priceIdr: formData.get("priceIdr"),
    fulfilmentType: formData.get("fulfilmentType"),
    artworkUrl: formData.get("artworkUrl") ?? "",
    // An empty string must not become 0 stock, so normalise it away.
    stockQty: formData.get("stockQty") === "" ? undefined : formData.get("stockQty"),
  };
}

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = productInputSchema.safeParse(readProductForm(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    const requested = String(formData.get("slug") ?? "").trim();
    const slugCheck = slugSchema.safeParse(requested || slugify(parsed.data.title));
    if (!slugCheck.success) return fieldErrors(slugCheck.error);

    await createProduct(parsed.data, slugCheck.data);

    revalidatePath("/seller/dashboard/products");
    return { ok: true, message: `"${parsed.data.title}" saved as a draft.` };
  });
}

export async function updateProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const productId = String(formData.get("productId") ?? "");
    if (!productId) return { ok: false, error: "Unknown product." };

    const parsed = productInputSchema.safeParse(readProductForm(formData));
    if (!parsed.success) return fieldErrors(parsed.error);

    const requested = String(formData.get("slug") ?? "").trim();
    const slugCheck = slugSchema.safeParse(requested || slugify(parsed.data.title));
    if (!slugCheck.success) return fieldErrors(slugCheck.error);

    // Ownership is enforced inside updateProduct via a sellerId-scoped WHERE.
    await updateProduct(productId, parsed.data, slugCheck.data);

    revalidatePath("/seller/dashboard/products");
    revalidatePath(`/products/${slugCheck.data}`);
    return { ok: true, message: "Changes saved." };
  });
}

export async function setProductStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const productId = String(formData.get("productId") ?? "");
    const parsed = productStatusSchema.safeParse(formData.get("status"));
    if (!productId || !parsed.success) return { ok: false, error: "Unknown product or status." };

    await setProductStatus(productId, parsed.data);

    revalidatePath("/seller/dashboard/products");
    revalidatePath("/products");
    return {
      ok: true,
      message:
        parsed.data === "ACTIVE"
          ? "Published."
          : parsed.data === "DRAFT"
            ? "Moved back to drafts."
            : "Archived.",
    };
  });
}

export async function addProductImageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const productId = String(formData.get("productId") ?? "");
    const url = String(formData.get("url") ?? "");
    const alt = String(formData.get("alt") ?? "").trim();

    if (!productId || !url) return { ok: false, error: "Nothing to attach." };

    // Only accept URLs our own uploader produced. An arbitrary URL here would
    // let a seller point an <img> at any host, leaking visitor IPs and
    // bypassing the next/image allowlist.
    const isOurs =
      url.startsWith("/uploads/") || /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//.test(url);
    if (!isOurs) return { ok: false, error: "That image was not uploaded here." };

    await addProductImage(productId, url, alt || null);

    revalidatePath("/seller/dashboard/products");
    return { ok: true, message: "Image added." };
  });
}

export async function deleteProductImageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const imageId = String(formData.get("imageId") ?? "");
    if (!imageId) return { ok: false, error: "Unknown image." };

    await deleteProductImage(imageId);

    revalidatePath("/seller/dashboard/products");
    return { ok: true, message: "Image removed." };
  });
}

/**
 * Advance an order item. Used by the seller ("mark shipped") and by the admin
 * production queue. The state machine decides whether this actor may make this
 * move; the action does not second-guess it.
 */
export async function advanceOrderItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = orderStatusChangeSchema.safeParse({
      orderItemId: formData.get("orderItemId"),
      to: formData.get("to"),
      trackingNumber: formData.get("trackingNumber") ?? "",
      note: formData.get("note") ?? "",
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    await advanceOrderItem(parsed.data.orderItemId, parsed.data.to, {
      trackingNumber: parsed.data.trackingNumber || undefined,
      note: parsed.data.note || undefined,
    });

    revalidatePath("/seller/dashboard/orders");
    revalidatePath("/admin/production");
    revalidatePath("/account/orders");
    return { ok: true, message: "Order updated." };
  });
}

export async function requestPayoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { user, seller } = await requireSeller();

    const parsed = payoutRequestSchema.safeParse({
      amountIdr: formData.get("amountIdr"),
      bankName: formData.get("bankName"),
      bankAccount: formData.get("bankAccount"),
      note: formData.get("note") ?? "",
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    // Re-read the balance server-side: the amount a seller may withdraw is not
    // theirs to assert.
    const earnings = await getOwnEarnings();
    if (parsed.data.amountIdr > earnings.available) {
      return {
        ok: false,
        error: `You can withdraw at most Rp ${earnings.available.toLocaleString("id-ID")} right now.`,
      };
    }

    await db.$transaction(async (tx) => {
      await tx.payoutRequest.create({
        data: {
          sellerId: seller.id,
          amountIdr: parsed.data.amountIdr,
          bankName: parsed.data.bankName,
          bankAccount: parsed.data.bankAccount,
          note: parsed.data.note || null,
        },
      });

      // Hold the funds immediately so the same balance cannot be requested twice.
      await tx.sellerBalance.updateMany({
        where: { sellerId: seller.id },
        data: { availableIdr: { decrement: parsed.data.amountIdr } },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "payout.requested",
          entity: "SellerProfile",
          entityId: seller.id,
          metadata: { amountIdr: parsed.data.amountIdr },
        },
      });
    });

    revalidatePath("/seller/dashboard/earnings");
    return { ok: true, message: "Payout requested." };
  });
}
