import { PayoutForm } from "@/components/payout-form";
import { Price } from "@/components/storefront";
import { getOwnEarnings } from "@/lib/data/sellers";
import { COMMISSION_BASIS_POINTS } from "@/lib/money";

export const metadata = { title: "Earnings" };

const PAYOUT_LABELS = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  PAID: "Paid",
  REJECTED: "Rejected",
} as const;

export default async function EarningsPage() {
  const earnings = await getOwnEarnings();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-bold">Earnings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You keep {100 - COMMISSION_BASIS_POINTS / 100}% of each sale. Earnings become withdrawable
          once the buyer has their order.
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-paper p-5 ring-1 ring-border">
          <dt className="text-sm text-muted-foreground">Available</dt>
          <dd className="font-display mt-1 text-2xl font-bold">
            <Price idr={earnings.available} />
          </dd>
        </div>
        <div className="rounded-lg bg-paper p-5 ring-1 ring-border">
          <dt className="text-sm text-muted-foreground">In transit</dt>
          <dd className="font-display mt-1 text-2xl font-bold">
            <Price idr={earnings.pending} />
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">Paid for, not yet delivered.</p>
        </div>
        <div className="rounded-lg bg-paper p-5 ring-1 ring-border">
          <dt className="text-sm text-muted-foreground">Earned all time</dt>
          <dd className="font-display mt-1 text-2xl font-bold">
            <Price idr={earnings.lifetime} />
          </dd>
        </div>
      </dl>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Request a payout</h2>
        <PayoutForm available={earnings.available} />
      </section>

      {earnings.payouts.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Past requests</h2>
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {earnings.payouts.map((payout) => (
              <li key={payout.id} className="flex items-center gap-4 py-3 text-sm">
                <span className="flex-1">
                  {payout.requestedAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  <span className="text-muted-foreground"> &middot; {payout.bankName}</span>
                </span>
                <Price idr={payout.amountIdr} />
                <span className="w-24 text-right text-muted-foreground">
                  {PAYOUT_LABELS[payout.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
