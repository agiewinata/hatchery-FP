import { notFound } from "next/navigation";

import { SellerProfileForm } from "@/components/seller-profile-form";
import { getOwnSellerProfile } from "@/lib/data/sellers";

export const metadata = { title: "Edit your page" };

export default async function SellerProfilePage() {
  const profile = await getOwnSellerProfile();
  if (!profile) notFound();

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold">Edit your page</h1>
      <SellerProfileForm defaults={profile} submitLabel="Save changes" />
    </div>
  );
}
