import Link from "next/link";
import { notFound } from "next/navigation";

import { CharmRail, EmptyState, ProductCard } from "@/components/storefront";
import { getPublicPortfolio } from "@/lib/data/sellers";

export async function generateMetadata({ params }: PageProps<"/sellers/[slug]">) {
  const { slug } = await params;
  const seller = await getPublicPortfolio(slug);
  if (!seller) return { title: "Not found" };

  return {
    title: seller.displayName,
    description: seller.bio?.slice(0, 160) ?? `Work by ${seller.displayName}.`,
  };
}

/**
 * The artist portfolio.
 *
 * Public: no sign-in, because this is the artist's shop window and they will
 * link to it from elsewhere. It shows only what is safe to publish - the DAL
 * query deliberately omits the owner's email, balance and payout history.
 */
export default async function SellerPage({ params }: PageProps<"/sellers/[slug]">) {
  const { slug } = await params;

  const seller = await getPublicPortfolio(slug);
  if (!seller) notFound();

  const printed = seller.products.filter((p) => p.fulfilmentType === "PRINT_ON_DEMAND").length;
  const stocked = seller.products.length - printed;

  return (
    <div className="space-y-12">
      <header className="border-b border-border/70 pb-8">
        <h1 className="font-display text-4xl leading-tight font-bold">{seller.displayName}</h1>

        {seller.location && (
          <p className="mt-1 text-sm text-muted-foreground">{seller.location}</p>
        )}

        {/* Plain text: we store and render bios without markup on purpose. */}
        {seller.bio && (
          <p className="measure mt-5 whitespace-pre-line leading-relaxed text-muted-foreground">
            {seller.bio}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {seller.websiteUrl && (
            <a
              href={seller.websiteUrl}
              // noopener/noreferrer: an external page must not get a handle on
              // our window or our URL.
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline hover:text-enamel"
            >
              {new URL(seller.websiteUrl).host}
            </a>
          )}
          {seller.instagram && (
            <a
              href={`https://instagram.com/${seller.instagram}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline hover:text-enamel"
            >
              @{seller.instagram}
            </a>
          )}
          <span className="text-muted-foreground">
            Selling here since{" "}
            {seller.joinedAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </span>
        </div>
      </header>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-bold">
            {seller.products.length === 1 ? "One piece" : `${seller.products.length} pieces`}
          </h2>

          {seller.products.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {printed > 0 && `${printed} printed to order`}
              {printed > 0 && stocked > 0 && ", "}
              {stocked > 0 && `${stocked} shipped by the artist`}
            </p>
          )}
        </div>

        {seller.products.length > 0 ? (
          <CharmRail>
            {seller.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </CharmRail>
        ) : (
          <EmptyState
            title="Nothing listed yet"
            action={
              <Link href="/products" className="text-sm underline hover:text-enamel">
                Browse other artists
              </Link>
            }
          >
            {seller.displayName} has not published anything for sale yet.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
