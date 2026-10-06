import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartForm } from "@/components/add-to-cart-form";
import { FulfilmentNote, Price } from "@/components/storefront";
import { getPublicProduct } from "@/lib/data/products";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getPublicProduct(slug);
  if (!product) return { title: "Not found" };

  return {
    title: product.title,
    description: product.description.slice(0, 160),
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;

  // A bracketed route segment is user input. getPublicProduct only matches
  // ACTIVE products from APPROVED sellers, so a draft cannot be reached by
  // guessing its URL.
  const product = await getPublicProduct(slug);
  if (!product) notFound();

  const soldOut =
    product.fulfilmentType === "SELLER_STOCKED" && (product.stockQty ?? 0) === 0;

  return (
    <article className="grid gap-10 md:grid-cols-2 md:gap-14">
      <div className="space-y-3">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-paper ring-1 ring-border">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              sizes="(min-width: 768px) 45vw, 92vw"
              className="object-cover"
              priority
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              No image yet
            </div>
          )}
        </div>

        {product.images.length > 1 && (
          <ul className="grid grid-cols-4 gap-3">
            {product.images.slice(1, 5).map((image) => (
              <li
                key={image.url}
                className="relative aspect-square overflow-hidden rounded-md bg-paper ring-1 ring-border"
              >
                <Image
                  src={image.url}
                  alt={image.alt ?? product.title}
                  fill
                  sizes="20vw"
                  className="object-cover"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h1 className="font-display text-3xl leading-tight font-bold">{product.title}</h1>

        <Link
          href={`/sellers/${product.seller.slug}`}
          className="mt-2 inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          by {product.seller.displayName}
        </Link>

        <Price idr={product.priceIdr} className="mt-6 block text-2xl" />

        <FulfilmentNote type={product.fulfilmentType} className="mt-2" />

        {product.fulfilmentType === "SELLER_STOCKED" && !soldOut && (
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {product.stockQty} in stock
          </p>
        )}

        <div className="mt-8">
          {soldOut ? (
            <p className="rounded-md bg-secondary px-4 py-3 text-sm">
              This one is sold out. The artist may restock it &mdash;{" "}
              <Link href={`/sellers/${product.seller.slug}`} className="underline">
                see their other work
              </Link>
              .
            </p>
          ) : (
            <AddToCartForm
              productId={product.id}
              maxQty={
                product.fulfilmentType === "SELLER_STOCKED"
                  ? (product.stockQty ?? 1)
                  : undefined
              }
            />
          )}
        </div>

        {/* Plain text, deliberately: seller-authored markup is a stored-XSS vector. */}
        <div className="mt-10 border-t border-border/70 pt-6">
          <h2 className="font-display text-base font-semibold">About this item</h2>
          <p className="measure mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        </div>
      </div>
    </article>
  );
}
