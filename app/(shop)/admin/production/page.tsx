import Image from "next/image";
import Link from "next/link";

import { AdvanceForm } from "@/components/fulfilment-form";
import { EmptyState } from "@/components/storefront";
import { requireAdmin } from "@/lib/data/auth";
import { listProductionQueue } from "@/lib/data/orders";
import { nextStatus, STATUS_LABELS } from "@/lib/orders/transitions";

import type { AddressInput } from "@/lib/validation/seller";

export const metadata = { title: "Production queue" };

/**
 * The print-on-demand production queue.
 *
 * This is the platform's own work: artwork an artist uploaded, which we print
 * and post. requireAdmin() is the access control - the nav link to this page is
 * hidden from non-admins, but hiding a link is cosmetic, and this check is what
 * actually matters.
 *
 * Each row advances exactly one step. The button offers only the next legal
 * status, and canTransition() rejects anything else server-side, so the queue
 * cannot skip from paid straight to shipped.
 */
export default async function ProductionQueuePage() {
  await requireAdmin();

  const items = await listProductionQueue();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Production queue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paid print-on-demand orders, oldest first. Each item moves one step at a time.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nothing to print">
          Paid print-on-demand orders will queue up here.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const address = item.order.shippingAddress as AddressInput;
            const next = nextStatus(item.status, "PRINT_ON_DEMAND");

            return (
              <li key={item.id} className="rounded-lg bg-paper p-5 ring-1 ring-border">
                <div className="flex flex-wrap gap-5">
                  {item.product.artworkUrl && (
                    <a
                      href={item.product.artworkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative size-20 shrink-0 overflow-hidden rounded-md bg-shell ring-1 ring-border"
                      title="Open the artwork at full size"
                    >
                      <Image
                        src={item.product.artworkUrl}
                        alt={`Artwork for ${item.titleSnapshot}`}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </a>
                  )}

                  <div className="min-w-56 flex-1">
                    <p className="font-medium">{item.titleSnapshot}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground tabular">
                      Order {item.order.orderNumber} &middot; print {item.qty}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Artist{" "}
                      <Link
                        href={`/sellers/${item.seller.slug}`}
                        className="underline hover:text-enamel"
                      >
                        {item.seller.displayName}
                      </Link>
                    </p>
                  </div>

                  <div className="text-sm">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                      {STATUS_LABELS[item.status]}
                    </span>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Paid{" "}
                      {item.createdAt.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </div>

                <address className="mt-4 text-sm leading-relaxed text-muted-foreground not-italic">
                  {address.recipient}, {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}, {address.city},{" "}
                  {address.province} <span className="tabular">{address.postalCode}</span>
                </address>

                <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border/70 pt-4">
                  {next ? (
                    <AdvanceForm
                      orderItemId={item.id}
                      to={next}
                      label={`Mark ${STATUS_LABELS[next].toLowerCase()}`}
                      withTracking={next === "SHIPPED"}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing further to do here.</p>
                  )}

                  <AdvanceForm orderItemId={item.id} to="CANCELLED" label="Cancel" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
