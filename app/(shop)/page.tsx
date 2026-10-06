import Image from "next/image";
import Link from "next/link";

import { CharmRail, ProductCard } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { listFeatured } from "@/lib/data/products";

/**
 * Home.
 *
 * The hero opens with the most characteristic thing in this subject's world: a
 * charm hanging from a ring. No stat tiles, no gradient wash - the product is
 * the interesting object, so it gets the space, and the type sits beside it
 * rather than on top of it.
 */
export default async function HomePage() {
  const featured = await listFeatured(8);
  const hero = featured[0];

  return (
    <div className="space-y-20">
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <div>
          <h1 className="font-display text-5xl leading-[0.95] font-bold tracking-tight sm:text-6xl">
            Small things people keep with them.
          </h1>

          <p className="measure mt-6 text-lg text-muted-foreground">
            Acrylic charms, enamel pins and stickers by independent artists in Indonesia. Some we
            print and ship ourselves. Some come straight from the artist&apos;s own shelf.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/products">Browse everything</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/seller/start">Sell your work</Link>
            </Button>
          </div>
        </div>

        {/* The hanging charm. One ring, one cord, one object. */}
        {hero && (
          <div className="relative mx-auto w-full max-w-sm">
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-0 size-5 -translate-x-1/2 rounded-full border-2 border-brass"
            />
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-4 h-10 w-px -translate-x-1/2 bg-brass/50"
            />

            <Link
              href={`/products/${hero.slug}`}
              className="mt-13 block rotate-[-2.5deg] transition-transform hover:rotate-0"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-paper shadow-lg ring-1 ring-border">
                {hero.imageUrl && (
                  <Image
                    src={hero.imageUrl}
                    alt={hero.title}
                    fill
                    sizes="(min-width: 768px) 24rem, 90vw"
                    className="object-cover"
                    priority
                  />
                )}
              </div>
            </Link>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {hero.title} by {hero.seller.displayName}
            </p>
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-bold">Recently listed</h2>
          <Link href="/products" className="text-sm hover:text-enamel hover:underline">
            See all
          </Link>
        </div>

        {featured.length > 0 ? (
          <CharmRail>
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </CharmRail>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            Nothing is listed yet. Run <code className="font-mono">npm run db:seed</code> to load
            the sample shop.
          </p>
        )}
      </section>
    </div>
  );
}
