import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/data/auth";
import { db } from "@/lib/db";

/**
 * Gate for the seller DASHBOARD.
 *
 * Note the `(dashboard)` route group: it exists so this gate covers
 * /seller/dashboard/* but NOT /seller/start.
 *
 * When this layout sat directly at app/(shop)/seller/, it wrapped
 * /seller/start too - and since the gate redirects a user with no shop TO
 * /seller/start, that page redirected to itself forever. The page whose whole
 * job is creating a shop cannot live behind a gate that requires already
 * having one. Route groups do not appear in the URL, so this costs nothing.
 *
 * As ever, this is for a clean UI rather than for security: the DAL guards in
 * lib/data/* are the real enforcement, and they are what protect Server
 * Actions, which no layout can intercept.
 */
// The route type is still "/seller": route groups are stripped from URLs, so
// Next names this layout after its path segment, even though the group means it
// only wraps the pages inside it.
export default async function SellerDashboardLayout({ children }: LayoutProps<"/seller">) {
  const user = await getCurrentUser();

  // Fallback only - proxy.ts already redirects signed-out visitors, with the
  // originally requested path preserved in ?next=.
  if (!user) redirect("/login?next=/seller/dashboard");

  const seller = await db.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  // No shop yet: send them to the one page that can create one. Safe now,
  // because /seller/start is outside this group.
  if (!seller) redirect("/seller/start");

  return <>{children}</>;
}
