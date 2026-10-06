/**
 * Input schemas for seller product management.
 *
 * SECURITY: every Server Action parses its input through one of these before
 * touching the database. Zod is the trust boundary - anything that has not been
 * parsed is still attacker-controlled, however plausible it looks.
 *
 * Note what is NOT here: `sellerId`, `status` transitions that bypass approval,
 * and `id`. Ownership comes from the session via requireSeller(), never from
 * the request body, because a body field is something the caller chooses.
 */
import { z } from "zod";

import { MAX_QTY_PER_ITEM } from "@/lib/money";

export const PRODUCT_CATEGORIES = [
  "KEYCHAIN",
  "ENAMEL_PIN",
  "STICKER",
  "ACRYLIC_STAND",
  "POSTER",
  "MEMORABILIA",
  "OTHER",
] as const;

export const FULFILMENT_TYPES = ["PRINT_ON_DEMAND", "SELLER_STOCKED"] as const;

/** Lowest price we will list, to catch a misplaced decimal point. */
export const MIN_PRICE_IDR = 1_000;
/** Upper bound; also keeps the integer well inside safe range. */
export const MAX_PRICE_IDR = 100_000_000;

/**
 * URL-safe slug. Anchored and character-restricted so it cannot be used for
 * path traversal or to collide with our own routes.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(3, { error: "Slug must be at least 3 characters." })
  .max(80, { error: "Slug must be 80 characters or fewer." })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: "Use lowercase letters, numbers and single hyphens only.",
  });

export const productBaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { error: "Give the product a title of at least 3 characters." })
    .max(120, { error: "Titles must be 120 characters or fewer." }),

  description: z
    .string()
    .trim()
    .min(20, { error: "Describe the product in at least 20 characters." })
    .max(4_000, { error: "Descriptions must be 4000 characters or fewer." }),

  category: z.enum(PRODUCT_CATEGORIES, { error: "Choose a category." }),

  // Coerced because an HTML number input arrives as a string, then forced to a
  // whole rupiah value. Floats are rejected rather than rounded, so a price can
  // never be silently altered.
  priceIdr: z.coerce
    .number({ error: "Enter a price in rupiah." })
    .int({ error: "Price must be a whole number of rupiah." })
    .min(MIN_PRICE_IDR, { error: `Minimum price is Rp ${MIN_PRICE_IDR.toLocaleString("id-ID")}.` })
    .max(MAX_PRICE_IDR, { error: "That price is implausibly high." }),

  fulfilmentType: z.enum(FULFILMENT_TYPES, { error: "Choose how this is fulfilled." }),

  /** Artwork we print from. Required for print-on-demand (enforced below). */
  artworkUrl: z.string().trim().max(2_000).optional().or(z.literal("")),

  /** Units on hand. Only meaningful for seller-stocked items. */
  stockQty: z.coerce
    .number()
    .int({ error: "Stock must be a whole number." })
    .min(0, { error: "Stock cannot be negative." })
    .max(100_000, { error: "That stock level is implausibly high." })
    .optional(),
});

/**
 * Cross-field rules for the two fulfilment models.
 *
 * This is where the discriminator earns its keep: one table, but each variant
 * has its own required fields, and the mismatched field is cleared rather than
 * persisted as misleading data.
 */
export const productInputSchema = productBaseSchema.superRefine((value, ctx) => {
  if (value.fulfilmentType === "PRINT_ON_DEMAND") {
    if (!value.artworkUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["artworkUrl"],
        message: "Upload the artwork we should print.",
      });
    }
  } else {
    if (value.stockQty === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["stockQty"],
        message: "Say how many units you have in stock.",
      });
    }
  }
});

export type ProductInput = z.infer<typeof productInputSchema>;

/**
 * Normalise a parsed product into exactly the columns we persist, clearing the
 * field that does not apply to its fulfilment type.
 */
export function toProductData(input: ProductInput) {
  const isPrintOnDemand = input.fulfilmentType === "PRINT_ON_DEMAND";
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    priceIdr: input.priceIdr,
    fulfilmentType: input.fulfilmentType,
    artworkUrl: isPrintOnDemand ? (input.artworkUrl || null) : null,
    stockQty: isPrintOnDemand ? null : (input.stockQty ?? 0),
  };
}

/** Only these two statuses can be set by a seller; ARCHIVED is the delete. */
export const productStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

/** Catalog browsing. All fields optional - an absent filter means "no filter". */
export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  fulfilment: z.enum(FULFILMENT_TYPES).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc"]).default("newest"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

/** Cart mutations. */
export const cartItemSchema = z.object({
  productId: z.cuid({ error: "Unknown product." }),
  qty: z.coerce
    .number()
    .int({ error: "Quantity must be a whole number." })
    .min(1, { error: "Quantity must be at least 1." })
    .max(MAX_QTY_PER_ITEM, { error: `You can order at most ${MAX_QTY_PER_ITEM} of one item.` }),
});
