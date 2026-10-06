import Link from "next/link";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout-form";
import { Price } from "@/components/storefront";
import { getCurrentUser } from "@/lib/data/auth";
import { getCart } from "@/lib/data/cart";
import { env } from "@/lib/env";
import { formatIdr, shippingFor } from "@/lib/money";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout");

  const cart = await getCart();

  // Nothing to pay for, or something is wrong: send them back rather than
  // letting them start a payment that cannot complete.
  if (cart.lines.length === 0) redirect("/cart");
  if (cart.hasProblems) redirect("/cart");

  const shipping = shippingFor(cart.subtotalIdr);
  const total = cart.subtotalIdr + shipping;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Checkout</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link href="/cart" className="underline hover:text-enamel">
            Back to cart
          </Link>
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="font-display mb-5 text-lg font-semibold">Where should it go?</h2>
          <CheckoutForm payButtonLabel={`Pay ${formatIdr(total)}`} />
        </section>

        <aside className="h-fit space-y-4 rounded-lg bg-paper p-6 ring-1 ring-border">
          <h2 className="font-display text-lg font-semibold">Your order</h2>

          <ul className="space-y-3 text-sm">
            {cart.lines.map((line) => (
              <li key={line.productId} className="flex justify-between gap-4">
                <span>
                  {line.title}
                  <span className="text-muted-foreground tabular"> &times;{line.qty}</span>
                </span>
                <Price idr={line.lineTotalIdr} className="shrink-0" />
              </li>
            ))}
          </ul>

          <dl className="space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>
                <Price idr={cart.subtotalIdr} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd>{shipping === 0 ? "Free" : <Price idr={shipping} />}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-medium">
              <dt>Total</dt>
              <dd>
                <Price idr={total} />
              </dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground">
            {env.PAYMENT_PROVIDER === "XENDIT"
              ? "You will be taken to Xendit to pay. Card details never touch this site."
              : "Payments are in simulation mode, so no money will be taken."}
          </p>
        </aside>
      </div>
    </div>
  );
}
