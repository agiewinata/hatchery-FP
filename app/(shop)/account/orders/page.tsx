import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState, Price } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/auth";
import { listOwnOrders } from "@/lib/data/orders";
import { STATUS_LABELS } from "@/lib/orders/transitions";

export const metadata = { title: "Your orders" };

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/orders");

  const orders = await listOwnOrders();

  if (orders.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="font-display text-3xl font-bold">Your orders</h1>
        <EmptyState
          title="No orders yet"
          action={
            <Button asChild>
              <Link href="/products">Browse charms</Link>
            </Button>
          }
        >
          Once you buy something, you can follow it from production to your door here.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold">Your orders</h1>

      <ul className="divide-y divide-border/70 border-y border-border/70">
        {orders.map((order) => {
          // Summarise the whole order by its least-advanced item: that is the
          // thing the buyer is actually waiting on.
          const statuses = new Set(order.items.map((i) => i.status));
          const itemCount = order.items.reduce((sum, i) => sum + i.qty, 0);

          return (
            <li key={order.orderNumber} className="flex flex-wrap items-center gap-4 py-5">
              <div className="flex-1">
                <Link
                  href={`/account/orders/${order.orderNumber}`}
                  className="font-medium tabular hover:text-enamel"
                >
                  {order.orderNumber}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {order.createdAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {" · "}
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                {[...statuses].map((status) => STATUS_LABELS[status]).join(", ")}
              </div>

              <Price idr={order.totalIdr} className="w-28 text-right font-medium" />

              <Button asChild variant="outline" size="sm">
                <Link href={`/account/orders/${order.orderNumber}`}>Track</Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
