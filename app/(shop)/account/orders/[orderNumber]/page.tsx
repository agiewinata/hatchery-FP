import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConfirmDeliveryForm } from "@/components/confirm-delivery-form";
import { OrderChain, OrderHistory } from "@/components/order-chain";
import { FulfilmentNote, Price } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/auth";
import { getOwnOrder } from "@/lib/data/orders";

export const metadata = { title: "Track your order" };

/**
 * The order progress tracker.
 *
 * getOwnOrder() scopes its query by buyerId (admins excepted), which is the
 * authorization check: order numbers travel in URLs and get shared, so without
 * that scope anyone signed in could read a stranger's order and their home
 * address.
 */
export default async function OrderTrackerPage({
  params,
  searchParams,
}: PageProps<"/account/orders/[orderNumber]">) {
  const user = await getCurrentUser();
  const { orderNumber } = await params;

  if (!user) redirect(`/login?next=/account/orders/${orderNumber}`);

  const order = await getOwnOrder(orderNumber);
  if (!order) notFound();

  const { paid, failed } = await searchParams;
  const awaitingPayment = order.paymentStatus === "PENDING";

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/account/orders" className="underline hover:text-enamel">
              All orders
            </Link>
          </p>
          <h1 className="font-display mt-1 text-3xl font-bold tabular">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed{" "}
            {order.placedAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {order.paidAt && " · paid"}
          </p>
        </div>

        <Price idr={order.totalIdr} className="text-2xl font-medium" />
      </header>

      {/*
        The redirect back from the gateway is only navigation - a user can type
        it - so these banners describe what we actually know from our own
        records, not what the query string claims.
      */}
      {paid && order.paymentStatus === "PAID" && (
        <p role="status" className="rounded-md bg-secondary px-4 py-3 text-sm">
          Payment confirmed. We will start on it shortly.
        </p>
      )}

      {paid && awaitingPayment && (
        <p role="status" className="rounded-md bg-secondary px-4 py-3 text-sm">
          We have not had confirmation from the payment provider yet. This page updates itself once
          we do &mdash; no need to pay again.
        </p>
      )}

      {(failed || order.paymentStatus === "FAILED" || order.paymentStatus === "EXPIRED") && (
        <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          That payment did not go through, so the order was cancelled and the stock released.
        </p>
      )}

      {awaitingPayment && !paid && !failed && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-secondary px-4 py-3">
          <p className="text-sm">This order is waiting for payment.</p>
          <Button asChild size="sm">
            <Link href={`/dev/pay?order=${order.orderNumber}`}>Pay now</Link>
          </Button>
        </div>
      )}

      <section className="space-y-10">
        {order.items.map((item) => (
          <article key={item.id} className="rounded-lg bg-paper p-6 ring-1 ring-border">
            <div className="flex flex-wrap gap-5">
              <Link
                href={`/products/${item.productSlug}`}
                className="relative size-20 shrink-0 overflow-hidden rounded-md bg-shell ring-1 ring-border"
              >
                {item.imageUrl && (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
              </Link>

              <div className="flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <Link
                    href={`/products/${item.productSlug}`}
                    className="font-medium hover:text-enamel"
                  >
                    {item.title}
                  </Link>
                  <Price idr={item.unitPriceIdr * item.qty} />
                </div>

                <p className="mt-0.5 text-sm text-muted-foreground tabular">
                  Quantity {item.qty}
                </p>

                <FulfilmentNote type={item.fulfilmentType} className="mt-1 text-xs" />

                {item.trackingNumber && (
                  <p className="mt-2 text-sm">
                    Tracking number{" "}
                    <span className="font-medium tabular">{item.trackingNumber}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="mt-7 border-t border-border/70 pt-6">
              <OrderChain status={item.status} fulfilmentType={item.fulfilmentType} />
            </div>

            {item.status === "SHIPPED" && (
              <div className="mt-6 border-t border-border/70 pt-5">
                <ConfirmDeliveryForm orderItemId={item.id} />
              </div>
            )}

            {item.events.length > 1 && (
              <details className="mt-6 border-t border-border/70 pt-5">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Full history
                </summary>
                <div className="mt-4">
                  <OrderHistory events={item.events} />
                </div>
              </details>
            )}
          </article>
        ))}
      </section>

      <section className="grid gap-8 border-t border-border/70 pt-8 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-base font-semibold">Shipping to</h2>
          <address className="mt-2 text-sm leading-relaxed text-muted-foreground not-italic">
            {order.shippingAddress.recipient}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 && (
              <>
                <br />
                {order.shippingAddress.line2}
              </>
            )}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.province}{" "}
            <span className="tabular">{order.shippingAddress.postalCode}</span>
            <br />
            {order.shippingAddress.phone}
          </address>
        </div>

        <div>
          <h2 className="font-display text-base font-semibold">Payment</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>
                <Price idr={order.subtotalIdr} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd>
                {order.shippingIdr === 0 ? "Free" : <Price idr={order.shippingIdr} />}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-medium">
              <dt>Total</dt>
              <dd>
                <Price idr={order.totalIdr} />
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
