import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/data/auth";
import { db } from "@/lib/db";

/**
 * Gate for the whole seller area.
 *
 * A layout renders before its page, so an unauthorised visitor never reaches
 * the page body. This is for a clean, explanatory UI - the DAL guards in
 * lib/data/* remain the real enforcement, and they are what protect Server
 * Actions, which no layout can intercept.
 */
export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/seller/dashboard");

  const seller = await db.sellerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  // No shop yet: send them to the one page that can create one.
  if (!seller) redirect("/seller/start");

  return <>{children}</>;
}
