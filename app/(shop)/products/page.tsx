import Link from "next/link";

import { CharmRail, EmptyState, ProductCard } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCatalog } from "@/lib/data/products";
import { catalogQuerySchema, PRODUCT_CATEGORIES } from "@/lib/validation/product";

export const metadata = {
  title: "Browse",
  description: "Acrylic charms, enamel pins, stickers and memorabilia by independent artists.",
};

const CATEGORY_LABELS: Record<(typeof PRODUCT_CATEGORIES)[number], string> = {
  KEYCHAIN: "Keychains",
  ENAMEL_PIN: "Pins",
  STICKER: "Stickers",
  ACRYLIC_STAND: "Standees",
  POSTER: "Prints",
  MEMORABILIA: "Memorabilia",
  OTHER: "Other",
};

const SORT_LABELS = {
  newest: "Newest",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
} as const;

export default async function CatalogPage({ searchParams }: PageProps<"/products">) {
  const raw = await searchParams;

  // Search params are user input. Parsed with defaults rather than trusted, so
  // ?page=-1 or ?sort=<script> become harmless defaults instead of errors.
  const parsed = catalogQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : catalogQuerySchema.parse({});

  const { products, total, page, pageCount } = await listCatalog(query);

  /** Build a link that keeps the current filters and changes only one of them. */
  const linkWith = (changes: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...query, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value === undefined || value === "" || (key === "page" && value === 1)) continue;
      if (key === "sort" && value === "newest") continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `/products?${qs}` : "/products";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-bold">Browse</h1>
        <p className="text-sm text-muted-foreground tabular">
          {total} {total === 1 ? "item" : "items"}
        </p>
      </div>

      <form action="/products" className="flex flex-wrap gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query.q ?? ""}
          placeholder="Search charms, pins, prints"
          className="max-w-xs bg-paper"
          aria-label="Search products"
        />
        {/* Preserve the active filters when searching. */}
        {query.category && <input type="hidden" name="category" value={query.category} />}
        {query.fulfilment && <input type="hidden" name="fulfilment" value={query.fulfilment} />}
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="space-y-3 border-y border-border/70 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={linkWith({ category: undefined, page: 1 })}
            className={filterClass(!query.category)}
          >
            Everything
          </Link>
          {PRODUCT_CATEGORIES.map((category) => (
            <Link
              key={category}
              href={linkWith({ category, page: 1 })}
              className={filterClass(query.category === category)}
            >
              {CATEGORY_LABELS[category]}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={linkWith({ fulfilment: undefined, page: 1 })}
            className={filterClass(!query.fulfilment)}
          >
            Any maker
          </Link>
          <Link
            href={linkWith({ fulfilment: "PRINT_ON_DEMAND", page: 1 })}
            className={filterClass(query.fulfilment === "PRINT_ON_DEMAND")}
          >
            Printed by us
          </Link>
          <Link
            href={linkWith({ fulfilment: "SELLER_STOCKED", page: 1 })}
            className={filterClass(query.fulfilment === "SELLER_STOCKED")}
          >
            Shipped by the artist
          </Link>

          <span className="ml-auto flex items-center gap-2">
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <Link
                key={value}
                href={linkWith({ sort: value, page: 1 })}
                className={filterClass(query.sort === value)}
              >
                {label}
              </Link>
            ))}
          </span>
        </div>
      </div>

      {products.length > 0 ? (
        <>
          <CharmRail>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </CharmRail>

          {pageCount > 1 && (
            <nav className="flex items-center justify-between pt-4" aria-label="Pagination">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={linkWith({ page: page - 1 })}>Previous</Link>
                </Button>
              ) : (
                <span />
              )}

              <p className="text-sm text-muted-foreground tabular">
                Page {page} of {pageCount}
              </p>

              {page < pageCount ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={linkWith({ page: page + 1 })}>Next</Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      ) : (
        <EmptyState
          title="Nothing matches that"
          action={
            <Button asChild variant="outline">
              <Link href="/products">Clear filters</Link>
            </Button>
          }
        >
          Try a different search, or clear the filters to see everything.
        </EmptyState>
      )}
    </div>
  );
}

function filterClass(active: boolean): string {
  return active
    ? "rounded-full bg-ink px-3 py-1 text-sm text-primary-foreground"
    : "rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground";
}
