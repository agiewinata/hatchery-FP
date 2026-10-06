"use server";

/**
 * Cart actions.
 *
 * Each one begins with a guard (inside the DAL function it calls) and a Zod
 * parse. A page-level check would not protect these: a Server Action is its own
 * POST entry point, reachable without ever rendering the page.
 */
import { revalidatePath } from "next/cache";

import { addToCart, removeFromCart, setCartQty } from "@/lib/data/cart";
import { cartItemSchema } from "@/lib/validation/product";

import { fieldErrors, runAction, type ActionState } from "./result";

export async function addToCartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const parsed = cartItemSchema.safeParse({
      productId: formData.get("productId"),
      qty: formData.get("qty") ?? 1,
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    const { qty } = await addToCart(parsed.data.productId, parsed.data.qty);

    revalidatePath("/cart");
    return { ok: true, message: qty === 1 ? "Added to cart." : `${qty} in cart.` };
  });
}

export async function setCartQtyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const productId = String(formData.get("productId") ?? "");
    const rawQty = Number(formData.get("qty") ?? 0);

    // 0 is a legitimate value here (it removes the line), so this does not go
    // through cartItemSchema, which requires qty >= 1.
    if (!productId) return { ok: false, error: "Unknown product." };
    if (!Number.isInteger(rawQty) || rawQty < 0 || rawQty > 99) {
      return { ok: false, error: "Enter a quantity between 0 and 99." };
    }

    await setCartQty(productId, rawQty);

    revalidatePath("/cart");
    return { ok: true, message: rawQty === 0 ? "Removed." : "Cart updated." };
  });
}

export async function removeFromCartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const productId = String(formData.get("productId") ?? "");
    if (!productId) return { ok: false, error: "Unknown product." };

    await removeFromCart(productId);

    revalidatePath("/cart");
    return { ok: true, message: "Removed from cart." };
  });
}
