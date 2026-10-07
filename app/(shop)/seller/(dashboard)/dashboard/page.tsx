import Link from "next/link";

import { Price } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { requireSeller } from "@/lib/data/auth";
import { listOwnProducts } from "@/lib/data/products";
import { getOwnEarnings } from "@/lib/data/sellers";
import { listSellerFulfilment } from "@/lib/data/orders";

export const metadata = { title: "Your shop" };

/**
 * Seller overview.
 *
 * requireSeller() throws if the visitor has no seller profile, which Next
 * renders as an error boundary. proxy.ts has already redirected signed-out
 * visitors, but this check is the one that actually enforces access.
 */
export default async function SellerDashboardPage() {
  const { seller } = await requireSeller();

  const [products, earnings, toShip] = await Promise.all([
    listOwnProducts(),
    getOwnEarnings(),
    listSellerFulfilment(),
  ]);

  const live = products.filter((p) => p.status === "ACTIVE").length;
  const drafts = products.filter((p) => p.status === "DRAFT").length;
  const awaiting = toShip.filter((i) => i.status === "AWAITING_SELLER_SHIPMENT").length;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{seller.displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {seller.isApproved ? (
              <Link href={`/sellers/${seller.slug}`} className="underline hover:text-enamel">
                View your public page
              </Link>
            ) : (
              "Awaiting admin approval. You can prepare listings now; they go public once approved."
            )}
          </p>
        </div>

        <Button asChild>
          <Link href="/seller/dashboard/products/new">Add a product</Link>
        </Button>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-paper p-5 ring-1 ring-border">
          <dt className="text-sm text-muted-foreground">Live listings</dt>
          <dd className="font-display mt-1 text-2xl font-bold tabular">{live}</dd>
        </div>
        <div className="rounded-lg bg-paper p-5 ring-1 ring-border">
          <dt className="text-sm text-muted-foreground">Drafts</dt>
          <dd className="font-display mt-1 text-2xl font-bold tabular">{drafts}</dd>
        </div>
        <div className="rounded-lg bg-paper p-5 ring-1 ring-border">
          <dt className="text-sm text-muted-foreground">Parcels to send</dt>
          <dd className="font-display mt-1 text-2xl font-bold tabular">{awaiting}</dd>
        </div>
        <div className="rounded-lg bg-paper p-5 ring-1 ring-border">
          <dt className="text-sm text-muted-foreground">Available to withdraw</dt>
          <dd className="font-display mt-1 text-2xl font-bold">
            <Price idr={earnings.available} />
          </dd>
        </div>
      </dl>

      <nav className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/seller/dashboard/products">Your listings</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/seller/dashboard/orders">Orders to fulfil</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/seller/dashboard/earnings">Earnings</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/seller/dashboard/profile">Edit your page</Link>
        </Button>
      </nav>
    </div>
  );
}
