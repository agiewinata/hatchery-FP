/**
 * Payment gateway abstraction.
 *
 * Two implementations satisfy this interface: `MOCK` (local development, no
 * account needed) and `XENDIT` (real). Keeping them behind one interface means
 * the checkout flow, the webhook route and the tests are written once, and the
 * entire payment path can be demonstrated before Xendit registration completes.
 *
 * All amounts are WHOLE RUPIAH integers - the same unit Xendit uses, so no
 * scaling happens anywhere near money.
 */
import type { PaymentProvider } from "@/lib/generated/prisma/enums";

export interface CheckoutLineItem {
  name: string;
  quantity: number;
  priceIdr: number;
}

export interface CreateCheckoutInput {
  /** Our own reference. Becomes the gateway's `external_id`. */
  orderNumber: string;
  /** Server-computed total. Never supplied by the browser. */
  amountIdr: number;
  payerEmail: string;
  description: string;
  items: CheckoutLineItem[];
  successRedirectUrl: string;
  failureRedirectUrl: string;
}

export interface CreateCheckoutResult {
  provider: PaymentProvider;
  /** Where to send the buyer to pay. */
  redirectUrl: string;
  /** The gateway's invoice id, stored for reconciliation. */
  invoiceId: string;
}

/** Normalised payment outcome, independent of provider vocabulary. */
export type PaymentOutcome = "PAID" | "EXPIRED" | "FAILED";

/**
 * The result of inspecting an incoming webhook.
 *
 * `invalid` MUST produce a 401 and change nothing. `ignored` is a well-formed
 * but uninteresting event (a status we do not act on) and should return 200 so
 * the provider stops retrying.
 */
export type WebhookVerdict =
  | { kind: "invalid"; reason: string }
  | { kind: "ignored"; reason: string }
  | {
      kind: "payment";
      /**
       * Stable, unique id for THIS event (not just this invoice). Used as the
       * idempotency key, so a replayed delivery is a no-op while a genuine
       * later state change is still processed.
       */
      eventId: string;
      invoiceId: string;
      orderNumber: string;
      outcome: PaymentOutcome;
      /** What the provider says was paid. Cross-checked against our own total. */
      amountIdr: number;
      raw: unknown;
    };

export interface VerifyWebhookInput {
  headers: Headers;
  /** The raw request body, exactly as received. */
  rawBody: string;
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  /**
   * Authenticate and parse a callback. Synchronous and pure so it is trivially
   * testable - no network, no database.
   */
  verifyWebhook(input: VerifyWebhookInput): WebhookVerdict;
}
