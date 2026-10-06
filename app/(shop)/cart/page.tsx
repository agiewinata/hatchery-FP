import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CartQtyForm, RemoveFromCartForm } from "@/components/cart-controls";
import { EmptyState, Price } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/auth";
import { getCart } from "@/lib/data/cart";
import { formatIdr, FREE_SHIPPING_THRESHOLD_IDR, shippingFor } from "@/lib/money";

export const metadata = { title: "Your cart" };

export default async function CartPage() {
  // Real check, in the page. proxy.ts already redirects signed-out visitors,
  // but that is a convenience and must not be the thing we rely on.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/cart");

  const cart = await getCart();

  if (cart.lines.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="font-display text-3xl font-bold">Your cart</h1>
        <EmptyState
          title="Nothing in here yet"
          action={
            <Button asChild>
              <Link href="/products">Browse charms</Link>
            </Button>
          }
        >
          Add a charm, a pin or a print and it will show up here.
        </EmptyState>
      </div>
    );
  }

  const shipping = shippingFor(cart.subtotalIdr);
  const total = cart.subtotalIdr + shipping;
  const awayFromFreeShipping = FREE_SHIPPING_THRESHOLD_IDR - cart.subtotalIdr;

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold">Your cart</h1>

      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <ul className="divide-y divide-border/70 border-y border-border/70">
          {cart.lines.map((line) => (
            <li key={line.productId} className="flex gap-4 py-5">
              <Link
                href={`/products/${line.slug}`}
                className="relative size-20 shrink-0 overflow-hidden rounded-md bg-paper ring-1 ring-border"
              >
                {line.imageUrl && (
                  <Image
                    src={line.imageUrl}
                    alt={line.title}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
              </Link>

              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link href={`/products/${line.slug}`} className="font-medium hover:text-enamel">
                    {line.title}
                  </Link>
                  <Price idr={line.lineTotalIdr} className="font-medium" />
                </div>

                <p className="text-xs text-muted-foreground">
                  {line.sellerName} &middot; {formatIdr(line.unitPriceIdr)} each
                </p>

                {line.problem && (
                  <p role="alert" className="text-sm text-destructive">
                    {line.problem}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <CartQtyForm productId={line.productId} qty={line.qty} />
                  <RemoveFromCartForm productId={line.productId} />
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit space-y-4 rounded-lg bg-paper p-6 ring-1 ring-border">
          <h2 className="font-display text-lg font-semibold">Summary</h2>

          <dl className="space-y-2 text-sm">
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

          {awayFromFreeShipping > 0 && (
            <p className="text-xs text-muted-foreground">
              Spend {formatIdr(awayFromFreeShipping)} more for free shipping.
            </p>
          )}

          {cart.hasProblems ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Fix the flagged items above before checking out.
            </p>
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link href="/checkout">Checkout</Link>
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            Prices are re-checked at checkout, so this total is always current.
          </p>
        </aside>
      </div>
    </div>
  );
}
