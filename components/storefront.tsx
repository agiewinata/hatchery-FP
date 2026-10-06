import Image from "next/image";
import Link from "next/link";

import { formatIdr } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A price. Tabular figures so columns of prices align down a page - prices are
 * data, not decoration.
 */
export function Price({ idr, className }: { idr: number; className?: string }) {
  return (
    <span className={cn("tabular", className)}>{formatIdr(idr)}</span>
  );
}

/**
 * The display rail.
 *
 * Charms at an artist-alley table hang from a rail or a grid wall, so the
 * catalog does too: one brass hairline across the top, and each product hangs
 * from its own small ring. This is the single structural metaphor in the
 * design - it appears here, on the hero, and (as a chain) in the order
 * tracker, and nowhere else.
 */
export function CharmRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div className="rule-brass absolute inset-x-0 top-0" aria-hidden="true" />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-10 pt-8 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </ul>
    </div>
  );
}

export interface ProductCardData {
  slug: string;
  title: string;
  priceIdr: number;
  imageUrl: string | null;
  fulfilmentType: "PRINT_ON_DEMAND" | "SELLER_STOCKED";
  stockQty: number | null;
  seller?: { slug: string; displayName: string };
}

/** One charm hanging from the rail. */
export function ProductCard({ product }: { product: ProductCardData }) {
  const soldOut = product.fulfilmentType === "SELLER_STOCKED" && (product.stockQty ?? 0) === 0;
  const lastFew =
    product.fulfilmentType === "SELLER_STOCKED" &&
    (product.stockQty ?? 0) > 0 &&
    (product.stockQty ?? 0) <= 3;

  return (
    <li className="group relative">
      {/* The ring this charm hangs from, sitting on the rail above. */}
      <span
        aria-hidden="true"
        className="absolute -top-8 left-1/2 size-3.5 -translate-x-1/2 rounded-full border-2 border-brass/70"
      />
      <span
        aria-hidden="true"
        className="absolute -top-5 left-1/2 h-5 w-px -translate-x-1/2 bg-brass/40"
      />

      <Link href={`/products/${product.slug}`} className="block focus-visible:outline-none">
        <div
          className={cn(
            "relative aspect-square overflow-hidden rounded-md bg-paper",
            "ring-1 ring-border transition-shadow group-hover:shadow-md",
            "group-focus-visible:ring-2 group-focus-visible:ring-ring",
            soldOut && "opacity-60",
          )}
        >
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.title}
              fill
              sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              No image yet
            </div>
          )}

          {soldOut && (
            <div className="absolute inset-x-0 bottom-0 bg-ink/85 py-1 text-center text-xs text-primary-foreground">
              Sold out
            </div>
          )}
        </div>

        <h3 className="mt-3 text-sm leading-snug font-medium group-hover:text-enamel">
          {product.title}
        </h3>
      </Link>

      <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
        <Price idr={product.priceIdr} />
        {lastFew && (
          <span className="text-xs text-enamel">{product.stockQty} left</span>
        )}
      </div>

      {product.seller && (
        <Link
          href={`/sellers/${product.seller.slug}`}
          className="mt-0.5 block text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {product.seller.displayName}
        </Link>
      )}
    </li>
  );
}

/**
 * An empty screen is an invitation to act, not a dead end - so each one says
 * what to do next.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-paper/50 px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="measure mx-auto mt-2 text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * Says how an item reaches the buyer. Useful information rather than
 * decoration: the two fulfilment paths have genuinely different lead times.
 */
export function FulfilmentNote({
  type,
  className,
}: {
  type: "PRINT_ON_DEMAND" | "SELLER_STOCKED";
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {type === "PRINT_ON_DEMAND"
        ? "Printed to order by us, then shipped. Usually 5 working days."
        : "Shipped by the artist from their own stock."}
    </p>
  );
}
