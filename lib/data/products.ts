/**
 * Product Data Access Layer.
 *
 * Public catalog reads and seller-scoped writes live together here so that the
 * difference between "anyone may read this" and "only the owner may touch this"
 * is visible side by side.
 *
 * Two rules hold throughout:
 *  1. Reads return DTOs with only the fields the UI needs. No Prisma row ever
 *     escapes this module.
 *  2. Every seller write is scoped by `sellerId` taken from the SESSION, never
 *     from the request. A seller passing someone else's product id gets zero
 *     rows affected rather than someone else's data.
 */
import "server-only";

import { db } from "@/lib/db";
import type { FulfilmentType, ProductCategory, ProductStatus } from "@/lib/generated/prisma/enums";
import type { CatalogQuery } from "@/lib/validation/product";
import { toProductData, type ProductInput } from "@/lib/validation/product";

import { ForbiddenError, requireSeller } from "./auth";

const PAGE_SIZE = 12;

/** What a catalog card needs, and nothing more. */
export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  priceIdr: number;
  category: ProductCategory;
  fulfilmentType: FulfilmentType;
  imageUrl: string | null;
  /** Null means unlimited (print-on-demand). 0 means sold out. */
  stockQty: number | null;
  seller: { slug: string; displayName: string };
}

const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  priceIdr: true,
  category: true,
  fulfilmentType: true,
  stockQty: true,
  artworkUrl: true,
  images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
  seller: { select: { slug: true, displayName: true } },
} as const;

type CardRow = {
  id: string;
  slug: string;
  title: string;
  priceIdr: number;
  category: ProductCategory;
  fulfilmentType: FulfilmentType;
  stockQty: number | null;
  artworkUrl: string | null;
  images: { url: string }[];
  seller: { slug: string; displayName: string };
};

function toCard(row: CardRow): ProductCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    priceIdr: row.priceIdr,
    category: row.category,
    fulfilmentType: row.fulfilmentType,
    imageUrl: row.images[0]?.url ?? row.artworkUrl ?? null,
    stockQty: row.stockQty,
    seller: row.seller,
  };
}

export interface CatalogResult {
  products: ProductCard[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Public catalog. Only ACTIVE products from APPROVED sellers are ever visible,
 * so an unapproved seller cannot publish to the storefront by guessing a URL.
 */
export async function listCatalog(query: CatalogQuery): Promise<CatalogResult> {
  const where = {
    status: "ACTIVE" as ProductStatus,
    seller: { isApproved: true },
    ...(query.category ? { category: query.category } : {}),
    ...(query.fulfilment ? { fulfilmentType: query.fulfilment } : {}),
    // Prisma parameterises these; `contains` is not string concatenation into
    // SQL, so a quote or a `--` in the search box is just text.
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" as const } },
            { description: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy =
    query.sort === "price-asc"
      ? ({ priceIdr: "asc" } as const)
      : query.sort === "price-desc"
        ? ({ priceIdr: "desc" } as const)
        : ({ createdAt: "desc" } as const);

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      select: CARD_SELECT,
      orderBy,
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.product.count({ where }),
  ]);

  return {
    products: rows.map(toCard),
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function listFeatured(limit = 8): Promise<ProductCard[]> {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", seller: { isApproved: true } },
    select: CARD_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toCard);
}

export interface ProductDetail extends ProductCard {
  description: string;
  images: { url: string; alt: string | null }[];
  seller: { slug: string; displayName: string; bio: string | null; avatarUrl: string | null };
}

/** Public product page. Returns null (not an error) when not publicly visible. */
export async function getPublicProduct(slug: string): Promise<ProductDetail | null> {
  const row = await db.product.findFirst({
    where: { slug, status: "ACTIVE", seller: { isApproved: true } },
    select: {
      ...CARD_SELECT,
      description: true,
      images: { select: { url: true, alt: true }, orderBy: { sortOrder: "asc" } },
      seller: { select: { slug: true, displayName: true, bio: true, avatarUrl: true } },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    priceIdr: row.priceIdr,
    category: row.category,
    fulfilmentType: row.fulfilmentType,
    stockQty: row.stockQty,
    description: row.description,
    imageUrl: row.images[0]?.url ?? row.artworkUrl ?? null,
    images: row.images,
    seller: row.seller,
  };
}

// ===========================================================================
// Seller-scoped writes
// ===========================================================================

/**
 * The seller's own listings, including drafts.
 *
 * Scoped by the session's seller id, so this query cannot return anyone else's
 * products even if the caller tampers with pagination or filters.
 */
export async function listOwnProducts() {
  const { seller } = await requireSeller();

  return db.product.findMany({
    where: { sellerId: seller.id },
    select: {
      id: true,
      slug: true,
      title: true,
      priceIdr: true,
      status: true,
      category: true,
      fulfilmentType: true,
      stockQty: true,
      updatedAt: true,
      images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      _count: { select: { orderItems: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** One of the seller's own products, for the edit form. Null if not theirs. */
export async function getOwnProduct(productId: string) {
  const { seller } = await requireSeller();

  // The `sellerId` term is the authorization check. Without it this would be
  // an IDOR: any seller could load any product by id.
  return db.product.findFirst({
    where: { id: productId, sellerId: seller.id },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      category: true,
      priceIdr: true,
      status: true,
      fulfilmentType: true,
      artworkUrl: true,
      stockQty: true,
      images: { select: { id: true, url: true, alt: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
    },
  });
}

async function assertSlugAvailable(slug: string, exceptProductId?: string) {
  const clash = await db.product.findUnique({ where: { slug }, select: { id: true } });
  if (clash && clash.id !== exceptProductId) {
    throw new ForbiddenError("A product with that web address already exists.");
  }
}

/**
 * Create a listing. New products start as DRAFT regardless of what the caller
 * asks for; publishing is a separate, approval-gated action.
 */
export async function createProduct(input: ProductInput, slug: string) {
  const { seller } = await requireSeller();
  await assertSlugAvailable(slug);

  return db.product.create({
    data: {
      ...toProductData(input),
      slug,
      sellerId: seller.id,
      status: "DRAFT",
    },
    select: { id: true, slug: true },
  });
}

export async function updateProduct(productId: string, input: ProductInput, slug: string) {
  const { seller } = await requireSeller();
  await assertSlugAvailable(slug, productId);

  // updateMany (not update) so the sellerId scope is part of the WHERE clause.
  // A mismatched owner yields count 0 instead of updating another seller's row.
  const result = await db.product.updateMany({
    where: { id: productId, sellerId: seller.id },
    data: { ...toProductData(input), slug },
  });

  if (result.count === 0) throw new ForbiddenError("That product is not yours to edit.");
  return { id: productId, slug };
}

/**
 * Publish or unpublish. Publishing requires an approved seller; an unapproved
 * seller may still edit drafts, they just cannot make them public.
 */
export async function setProductStatus(productId: string, status: ProductStatus) {
  const { seller } = await requireSeller();

  if (status === "ACTIVE" && !seller.isApproved) {
    throw new ForbiddenError("Your seller account is awaiting approval, so you cannot publish yet.");
  }

  const result = await db.product.updateMany({
    where: { id: productId, sellerId: seller.id },
    data: { status },
  });

  if (result.count === 0) throw new ForbiddenError("That product is not yours to change.");
}

/** Attach an uploaded image. The URL has already been produced by our own uploader. */
export async function addProductImage(productId: string, url: string, alt: string | null) {
  const { seller } = await requireSeller();

  const owned = await db.product.findFirst({
    where: { id: productId, sellerId: seller.id },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!owned) throw new ForbiddenError("That product is not yours.");
  if (owned._count.images >= 8) {
    throw new ForbiddenError("A product can have at most 8 images.");
  }

  return db.productImage.create({
    data: { productId, url, alt, sortOrder: owned._count.images },
    select: { id: true, url: true },
  });
}

export async function deleteProductImage(imageId: string) {
  const { seller } = await requireSeller();

  // Nested scoping: the image is only deletable through its product's owner.
  const result = await db.productImage.deleteMany({
    where: { id: imageId, product: { sellerId: seller.id } },
  });

  if (result.count === 0) throw new ForbiddenError("That image is not yours.");
}
