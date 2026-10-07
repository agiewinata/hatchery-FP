import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/product-form";
import { getOwnProduct } from "@/lib/data/products";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
}: PageProps<"/seller/dashboard/products/[id]">) {
  const { id } = await params;

  // getOwnProduct scopes by sellerId, so another seller's id returns null and
  // becomes a 404 rather than exposing their listing.
  const product = await getOwnProduct(id);
  if (!product) notFound();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/seller/dashboard/products" className="underline hover:text-enamel">
            All listings
          </Link>
        </p>
        <h1 className="font-display mt-1 text-3xl font-bold">{product.title}</h1>
      </div>

      <ProductForm defaults={product} />
    </div>
  );
}
