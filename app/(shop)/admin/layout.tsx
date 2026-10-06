import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/auth";

/**
 * Gate for the admin area.
 *
 * Renders a plain 'no access' page rather than redirecting, and deliberately
 * does not reveal whether the page exists or what it does. As with the seller
 * area, the authoritative checks live in the DAL (requireAdmin) so that Server
 * Actions are protected independently of this layout.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/production");

  if (user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">No access</h1>
        <p className="text-sm text-muted-foreground">
          This area is for platform staff.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back to the shop</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
