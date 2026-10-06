/**
 * Input schemas for seller profiles, addresses, checkout and payouts.
 */
import { z } from "zod";

import { slugSchema } from "./product";

/** Route segments a seller slug must never shadow. */
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "account",
  "cart",
  "checkout",
  "dev",
  "login",
  "logout",
  "new",
  "orders",
  "products",
  "register",
  "seller",
  "sellers",
  "settings",
]);

export const sellerProfileSchema = z.object({
  slug: slugSchema.refine((s) => !RESERVED_SLUGS.has(s), {
    error: "That handle is reserved. Please choose another.",
  }),

  displayName: z
    .string()
    .trim()
    .min(2, { error: "Enter the name you want buyers to see." })
    .max(60, { error: "Display names must be 60 characters or fewer." }),

  /**
   * Stored and rendered as PLAIN TEXT. We deliberately do not accept markdown
   * or HTML here: rendering seller-authored markup is a stored-XSS vector, and
   * a bio does not need formatting enough to justify a sanitiser.
   */
  bio: z
    .string()
    .trim()
    .max(1_000, { error: "Keep your bio to 1000 characters or fewer." })
    .optional()
    .or(z.literal("")),

  location: z.string().trim().max(80).optional().or(z.literal("")),

  // http(s) only: a javascript: or data: URL in an href is an XSS payload.
  websiteUrl: z
    .url({ error: "Enter a full URL, including https://" })
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
      error: "Only http:// and https:// links are allowed.",
    })
    .max(300)
    .optional()
    .or(z.literal("")),

  instagram: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9._]*$/, { error: "Enter just the handle, without the @." })
    .optional()
    .or(z.literal("")),
});

export type SellerProfileInput = z.infer<typeof sellerProfileSchema>;

/** Indonesian shipping address. */
export const addressSchema = z.object({
  recipient: z
    .string()
    .trim()
    .min(2, { error: "Who should we address the parcel to?" })
    .max(80),

  phone: z
    .string()
    .trim()
    .min(7, { error: "Enter a contact phone number." })
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, { error: "Phone numbers may contain digits, spaces, + - ( ) only." }),

  line1: z.string().trim().min(5, { error: "Enter the street address." }).max(160),
  line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().min(2, { error: "Enter the city." }).max(80),
  province: z.string().trim().min(2, { error: "Enter the province." }).max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, { error: "Indonesian postal codes are 5 digits." }),
  country: z.literal("ID").default("ID"),
});

export type AddressInput = z.infer<typeof addressSchema>;

/** Checkout: the address, and nothing else. Prices come from the database. */
export const checkoutSchema = z.object({
  address: addressSchema,
});

/** Seller payout request. */
export const payoutRequestSchema = z.object({
  amountIdr: z.coerce
    .number()
    .int({ error: "Enter a whole number of rupiah." })
    .min(50_000, { error: "The minimum payout is Rp 50.000." }),
  bankName: z.string().trim().min(2, { error: "Enter your bank name." }).max(60),
  bankAccount: z
    .string()
    .trim()
    .min(6, { error: "Enter your account number." })
    .max(34)
    .regex(/^[0-9-]+$/, { error: "Account numbers may contain digits and hyphens only." }),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

/** Advancing an order item. The target status is validated against the state machine too. */
export const orderStatusChangeSchema = z.object({
  orderItemId: z.cuid(),
  to: z.enum([
    "IN_PRODUCTION",
    "PRINTED",
    "PACKED",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ]),
  trackingNumber: z.string().trim().max(60).optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

/** Auth forms. Mirrors the server-side password policy in lib/auth.ts. */
export const credentialsSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase().max(254),
  password: z
    .string()
    .min(12, { error: "Use at least 12 characters - a passphrase works well." })
    .max(128, { error: "Passwords must be 128 characters or fewer." }),
});

export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2, { error: "Enter your name." }).max(80),
});

export const emailOnlySchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase().max(254),
});
