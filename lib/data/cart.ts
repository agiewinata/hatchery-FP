/**
 * Cart.
 *
 * The cart stores ONLY a product id and a quantity. It never stores a price.
 * Prices are re-read from the database every time the cart is displayed and
 * again at checkout, so:
 *   - a price edited in the browser changes nothing;
 *   - a cart left open for a week cannot be checked out at last week's price.
 */
import "server-only";

import { db } from "@/lib/db";
import { formatIdr, MAX_QTY_PER_ITEM, splitLine } from "@/lib/money";

import { ForbiddenError, requireUser } from "./auth";

export interface CartLine {
  productId: string;
  slug: string;
  title: string;
  /** Live price, read now - not what it was when the item was added. */
  unitPriceIdr: number;
  qty: number;
  lineTotalIdr: number;
  imageUrl: string | null;
  fulfilmentType: "PRINT_ON_DEMAND" | "SELLER_STOCKED";
  sellerName: string;
  /** Set when the line cannot currently be purchased. */
  problem: string | null;
}

export interface CartView {
  lines: CartLine[];
  subtotalIdr: number;
  /** True when at least one line has a problem; blocks checkout. */
  hasProblems: boolean;
}

/**
 * The cart as it can actually be bought right now.
 *
 * Unavailable lines are reported rather than silently dropped, so a buyer
 * understands why their total changed.
 */
export async function getCart(): Promise<CartView> {
  const user = await requireUser();

  const rows = await db.cartItem.findMany({
    where: { userId: user.id },
    select: {
      qty: true,
      product: {
        select: {
          id: true,
          slug: true,
          title: true,
          priceIdr: true,
          status: true,
          stockQty: true,
          fulfilmentType: true,
          artworkUrl: true,
          images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
          seller: { select: { displayName: true, isApproved: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const lines: CartLine[] = rows.map(({ qty, product: p }) => {
    let problem: string | null = null;

    if (p.status !== "ACTIVE" || !p.seller.isApproved) {
      problem = "No longer for sale.";
    } else if (p.fulfilmentType === "SELLER_STOCKED") {
      if ((p.stockQty ?? 0) === 0) problem = "Out of stock.";
      else if ((p.stockQty ?? 0) < qty) problem = `Only ${p.stockQty} left.`;
    }

    return {
      productId: p.id,
      slug: p.slug,
      title: p.title,
      unitPriceIdr: p.priceIdr,
      qty,
      lineTotalIdr: p.priceIdr * qty,
      imageUrl: p.images[0]?.url ?? p.artworkUrl ?? null,
      fulfilmentType: p.fulfilmentType,
      sellerName: p.seller.displayName,
      problem,
    };
  });

  return {
    lines,
    subtotalIdr: lines
      .filter((l) => !l.problem)
      .reduce((sum, l) => sum + l.lineTotalIdr, 0),
    hasProblems: lines.some((l) => l.problem !== null),
  };
}

export async function getCartCount(): Promise<number> {
  const user = await requireUser();
  const result = await db.cartItem.aggregate({
    where: { userId: user.id },
    _sum: { qty: true },
  });
  return result._sum.qty ?? 0;
}

/**
 * Add to cart, or increase the quantity if already present.
 *
 * Re-checks that the product is genuinely purchasable: a product id alone is
 * not permission to buy, since ids are discoverable.
 */
export async function addToCart(productId: string, qty: number) {
  const user = await requireUser();

  const product = await db.product.findFirst({
    where: { id: productId, status: "ACTIVE", seller: { isApproved: true } },
    select: { id: true, stockQty: true, fulfilmentType: true, priceIdr: true },
  });

  if (!product) throw new ForbiddenError("That product is not available.");

  const existing = await db.cartItem.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
    select: { qty: true },
  });

  const newQty = Math.min((existing?.qty ?? 0) + qty, MAX_QTY_PER_ITEM);

  if (product.fulfilmentType === "SELLER_STOCKED" && newQty > (product.stockQty ?? 0)) {
    throw new ForbiddenError(
      (product.stockQty ?? 0) === 0
        ? "That item is out of stock."
        : `Only ${product.stockQty} of that item are left.`,
    );
  }

  // Validates the arithmetic bounds as a side effect.
  splitLine({ unitPriceIdr: product.priceIdr, qty: newQty });

  await db.cartItem.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    create: { userId: user.id, productId, qty: newQty },
    update: { qty: newQty },
  });

  return { qty: newQty };
}

/** Set an exact quantity, or remove the line when qty is 0. */
export async function setCartQty(productId: string, qty: number) {
  const user = await requireUser();

  if (qty <= 0) {
    await db.cartItem.deleteMany({ where: { userId: user.id, productId } });
    return;
  }

  // Scoped delete/update by userId: one buyer cannot edit another's cart.
  const result = await db.cartItem.updateMany({
    where: { userId: user.id, productId },
    data: { qty: Math.min(qty, MAX_QTY_PER_ITEM) },
  });

  if (result.count === 0) throw new ForbiddenError("That item is not in your cart.");
}

export async function removeFromCart(productId: string) {
  const user = await requireUser();
  await db.cartItem.deleteMany({ where: { userId: user.id, productId } });
}

export async function clearCart(userId: string) {
  await db.cartItem.deleteMany({ where: { userId } });
}

/** Convenience for the cart badge and empty states. */
export function describeCart(view: CartView): string {
  if (view.lines.length === 0) return "Your cart is empty.";
  return `${view.lines.length} item${view.lines.length === 1 ? "" : "s"}, ${formatIdr(view.subtotalIdr)}`;
}
