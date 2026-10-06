import Link from "next/link";
import { redirect } from "next/navigation";

import { SellerProfileForm } from "@/components/seller-profile-form";
import { getCurrentUser } from "@/lib/data/auth";
import { getOwnSellerProfile } from "@/lib/data/sellers";

export const metadata = { title: "Sell your work" };

export default async function SellerStartPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/seller/start");

  // Already a seller: send them to the dashboard rather than a second signup.
  const existing = await getOwnSellerProfile();
  if (existing) redirect("/seller/dashboard");

  // A storefront is a public, money-handling identity, so we insist the email
  // is real before creating one.
  if (!user.emailVerified) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="font-display text-3xl font-bold">Confirm your email first</h1>
        <p className="text-muted-foreground">
          We need a working email address before you can open a shop, so we can reach you about
          orders. Check your inbox for the confirmation link we sent when you signed up.
        </p>
        <p className="text-sm text-muted-foreground">
          In development the link is printed in the server terminal.
        </p>
        <Link href="/" className="inline-block text-sm underline hover:text-enamel">
          Back to the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="max-w-xl">
        <h1 className="font-display text-3xl font-bold">Sell your work</h1>
        <p className="measure mt-3 text-muted-foreground">
          Upload artwork and we print and ship it for you, or list things you already have in stock
          and post them yourself. You can do both from one shop.
        </p>
      </div>

      <SellerProfileForm submitLabel="Open my shop" />
    </div>
  );
}
