"use server";

/**
 * Checkout.
 *
 * The only thing this action accepts from the browser is a shipping address.
 * Quantities come from the server-side cart, prices come from the product
 * table, and the total is computed inside the checkout transaction. There is
 * deliberately no way for the client to influence the amount charged.
 */
import { redirect } from "next/navigation";

import { attachGatewayInvoice, createOrderFromCart } from "@/lib/data/orders";
import { env } from "@/lib/env";
import { paymentGateway } from "@/lib/payments";
import { addressSchema } from "@/lib/validation/seller";

import { fieldErrors, runAction, type ActionState } from "./result";

export async function checkoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let redirectTo: string | null = null;

  const state = await runAction(async () => {
    const parsed = addressSchema.safeParse({
      recipient: formData.get("recipient"),
      phone: formData.get("phone"),
      line1: formData.get("line1"),
      line2: formData.get("line2") ?? "",
      city: formData.get("city"),
      province: formData.get("province"),
      postalCode: formData.get("postalCode"),
      country: "ID",
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    // Creates the order and reserves stock. No money has moved yet.
    const order = await createOrderFromCart(parsed.data);

    const checkout = await paymentGateway.createCheckout({
      orderNumber: order.orderNumber,
      // Server-computed total, straight from the row we just wrote.
      amountIdr: order.totalIdr,
      payerEmail: order.payerEmail,
      description: `Keychain order ${order.orderNumber}`,
      items: order.items,
      successRedirectUrl: new URL(
        `/account/orders/${order.orderNumber}?paid=1`,
        env.BETTER_AUTH_URL,
      ).toString(),
      failureRedirectUrl: new URL(
        `/account/orders/${order.orderNumber}?failed=1`,
        env.BETTER_AUTH_URL,
      ).toString(),
    });

    await attachGatewayInvoice(order.id, checkout.provider, checkout.invoiceId);

    redirectTo = checkout.redirectUrl;
    return { ok: true };
  });

  // redirect() throws, so it must happen outside the try/catch in runAction -
  // otherwise the control-flow exception would be swallowed and reported as an
  // unexpected error.
  if (redirectTo) redirect(redirectTo);

  return state;
}
