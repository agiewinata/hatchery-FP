import Link from "next/link";

import { SellerApprovalForm } from "@/components/seller-approval-form";
import { EmptyState } from "@/components/storefront";
import { listSellersForReview } from "@/lib/data/admin";

export const metadata = { title: "Sellers" };

/**
 * Seller review.
 *
 * New shops start unapproved and cannot publish, so this queue is what lets
 * anything reach the storefront. Suspending is reversible and leaves order
 * history intact - deleting a shop mid-order would orphan real purchases.
 */
export default async function AdminSellersPage() {
  const sellers = await listSellersForReview();

  const pending = sellers.filter((s) => !s.isApproved);
  const approved = sellers.filter((s) => s.isApproved);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-bold">Sellers</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          New shops cannot publish until approved. Suspending hides a shop and returns its live
          listings to drafts.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">
          Waiting for review{pending.length > 0 && ` (${pending.length})`}
        </h2>

        {pending.length === 0 ? (
          <EmptyState title="Nothing to review">
            New shops will appear here as they sign up.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {pending.map((seller) => (
              <li key={seller.id} className="rounded-lg bg-paper p-5 ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-56 flex-1">
                    <p className="font-medium">{seller.displayName}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      /sellers/{seller.slug} &middot; {seller.user.email}
                      {!seller.user.emailVerified && " (email not confirmed)"}
                    </p>
                    {seller.location && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{seller.location}</p>
                    )}
                    {seller.bio && (
                      <p className="measure mt-2 text-sm whitespace-pre-line text-muted-foreground">
                        {seller.bio}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground tabular">
                      {seller._count.products}{" "}
                      {seller._count.products === 1 ? "listing" : "listings"} prepared
                    </p>
                  </div>

                  <SellerApprovalForm
                    sellerId={seller.id}
                    isApproved={false}
                    canApprove={seller.user.emailVerified}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {approved.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Approved</h2>
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {approved.map((seller) => (
              <li key={seller.id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-48 flex-1">
                  <Link href={`/sellers/${seller.slug}`} className="font-medium hover:text-enamel">
                    {seller.displayName}
                  </Link>
                  <p className="text-sm text-muted-foreground">{seller.user.email}</p>
                </div>

                <span className="text-sm text-muted-foreground tabular">
                  {seller._count.products} listings
                </span>

                <SellerApprovalForm sellerId={seller.id} isApproved canApprove />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
