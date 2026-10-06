import { AdvanceForm } from "@/components/fulfilment-form";
import { EmptyState } from "@/components/storefront";
import { listSellerFulfilment } from "@/lib/data/orders";
import { STATUS_LABELS } from "@/lib/orders/transitions";

import type { AddressInput } from "@/lib/validation/seller";

export const metadata = { title: "Orders to fulfil" };

/**
 * The seller's own parcels.
 *
 * Only items belonging to this seller appear: listSellerFulfilment scopes by
 * the session's seller id. Buyers' addresses are shown because the seller needs
 * them to post the parcel - and only for their own orders.
 */
export default async function SellerOrdersPage() {
  const items = await listSellerFulfilment();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Orders to fulfil</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          These are items you hold in stock and post yourself. Anything we print is handled by us.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nothing to send">
          When someone buys one of your stocked items, it will appear here with their address.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const address = item.order.shippingAddress as AddressInput;

            return (
              <li key={item.id} className="rounded-lg bg-paper p-5 ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{item.titleSnapshot}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground tabular">
                      Order {item.order.orderNumber} &middot; quantity {item.qty}
                    </p>
                  </div>

                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>

                <address className="mt-4 text-sm leading-relaxed text-muted-foreground not-italic">
                  {address.recipient}
                  <br />
                  {address.line1}
                  {address.line2 && (
                    <>
                      <br />
                      {address.line2}
                    </>
                  )}
                  <br />
                  {address.city}, {address.province}{" "}
                  <span className="tabular">{address.postalCode}</span>
                  <br />
                  {address.phone}
                </address>

                <div className="mt-5 border-t border-border/70 pt-4">
                  {item.status === "AWAITING_SELLER_SHIPMENT" ? (
                    <AdvanceForm
                      orderItemId={item.id}
                      to="SHIPPED"
                      label="Mark as shipped"
                      withTracking
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Shipped
                      {item.trackingNumber && (
                        <>
                          {" · "}
                          <span className="tabular">{item.trackingNumber}</span>
                        </>
                      )}
                      . Waiting for the buyer to confirm it arrived.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
