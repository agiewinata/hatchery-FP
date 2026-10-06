import { notFound } from "next/navigation";

import { SimulatePaymentForm } from "@/components/simulate-payment-form";
import { getCurrentUser } from "@/lib/data/auth";
import { env } from "@/lib/env";
import { formatIdr } from "@/lib/money";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export const metadata = { title: "Simulated payment" };

/**
 * Stands in for the hosted payment page while Xendit registration is pending.
 *
 * Returns 404 unless PAYMENT_PROVIDER is MOCK, and lib/env.ts will not let a
 * production deployment select MOCK - so this page cannot exist in production.
 */
export default async function DevPayPage({ searchParams }: PageProps<"/dev/pay">) {
  if (env.PAYMENT_PROVIDER !== "MOCK") notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { order: orderNumber } = await searchParams;
  if (typeof orderNumber !== "string") notFound();

  // Scoped to the buyer, like every other order read.
  const order = await db.order.findFirst({
    where: { orderNumber, buyerId: user.id },
    select: { orderNumber: true, totalIdr: true, paymentStatus: true },
  });

  if (!order) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="space-y-6 rounded-lg bg-paper p-8 ring-1 ring-border">
        <div>
          <p className="text-xs text-muted-foreground">Simulated payment page</p>
          <h1 className="font-display mt-1 text-2xl font-bold">
            {formatIdr(order.totalIdr)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            Order {order.orderNumber}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          This stands in for the Xendit hosted invoice. Either choice posts a real callback to the
          webhook, so the token check, the amount cross-check and the idempotency guard all run
          exactly as they would in production.
        </p>

        {order.paymentStatus === "PAID" ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm">
            This order is already paid.
          </p>
        ) : (
          <SimulatePaymentForm orderNumber={order.orderNumber} />
        )}
      </div>
    </main>
  );
}
