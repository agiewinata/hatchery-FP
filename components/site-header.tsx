import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { getCartCount } from "@/lib/data/cart";
import { getCurrentUser } from "@/lib/data/auth";
import { db } from "@/lib/db";

/**
 * Site header.
 *
 * A Server Component, so the signed-in state is read on the server and no user
 * record is shipped to the browser to decide what to render.
 *
 * Hiding a link is a convenience, never a control: /admin and /seller enforce
 * their own access regardless of whether their links are shown here.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();

  // Only ask for the extras once we know somebody is signed in.
  const [cartCount, sellerSlug] = user
    ? await Promise.all([
        getCartCount(),
        db.sellerProfile
          .findUnique({ where: { userId: user.id }, select: { slug: true } })
          .then((s) => s?.slug ?? null),
      ])
    : [0, null];

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-shell/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight whitespace-nowrap"
        >
          Keychain
        </Link>

        <nav className="flex flex-1 items-center gap-5 text-sm" aria-label="Main">
          <Link href="/products" className="hover:text-enamel">
            Browse
          </Link>
          {sellerSlug ? (
            <Link href="/seller/dashboard" className="hover:text-enamel">
              Your shop
            </Link>
          ) : (
            <Link href="/seller/start" className="hover:text-enamel">
              Sell your work
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <>
              <Link href="/admin/production" className="hover:text-enamel">
                Production
              </Link>
              <Link href="/admin/sellers" className="hover:text-enamel">
                Sellers
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <Link href="/cart" className="hover:text-enamel">
            Cart
            {cartCount > 0 && (
              <span className="ml-1.5 rounded-full bg-enamel px-1.5 py-0.5 text-xs text-white tabular">
                {cartCount}
              </span>
            )}
          </Link>

          {user ? (
            <>
              <Link href="/account/orders" className="hover:text-enamel">
                Orders
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-enamel">
                Sign in
              </Link>
              <Button asChild size="sm">
                <Link href="/register">Create account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/70">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted-foreground">
        <p>
          Keychain is a student project. Payments run through Xendit in sandbox mode, so no real
          money changes hands.
        </p>
      </div>
    </footer>
  );
}
