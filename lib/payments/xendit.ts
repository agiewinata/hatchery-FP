/**
 * Xendit gateway (Invoice API).
 *
 * We use the hosted-invoice REDIRECT flow rather than an embedded/popup
 * checkout. Two reasons, both security:
 *   - No card data ever touches our server or our DOM, so PCI scope stays with
 *     Xendit.
 *   - No third-party script needs to be whitelisted in our Content Security
 *     Policy, so the CSP can stay strict (no `unsafe-inline`, no extra origins).
 *
 * Deliberately implemented with `fetch` rather than an SDK: it is a single POST
 * and one HMAC-free token comparison, so a dependency would add supply-chain
 * surface for no benefit, and this way every byte we send is visible here.
 */
import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentGateway,
  PaymentOutcome,
  VerifyWebhookInput,
  WebhookVerdict,
} from "./types";

const XENDIT_API = "https://api.xendit.co/v2/invoices";

/** Invoices expire so an abandoned cart cannot be paid days later at a stale price. */
const INVOICE_DURATION_SECONDS = 60 * 60 * 24;

/**
 * Constant-time string comparison.
 *
 * `timingSafeEqual` requires equal-length buffers and throws otherwise - and
 * the length check itself would leak the secret's length. Hashing both sides to
 * a fixed 32 bytes first removes both problems, and comparing digests is
 * equivalent to comparing the inputs for this purpose.
 */
function secureEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Xendit invoice statuses we care about, mapped to our own vocabulary. */
function mapStatus(status: unknown): PaymentOutcome | null {
  switch (status) {
    // SETTLED is the post-settlement notification for an already-paid invoice.
    case "PAID":
    case "SETTLED":
      return "PAID";
    case "EXPIRED":
      return "EXPIRED";
    case "FAILED":
      return "FAILED";
    default:
      // PENDING and anything unrecognised: nothing to do.
      return null;
  }
}

/** Narrow an unknown JSON body without trusting any of it. */
interface XenditCallbackBody {
  id?: unknown;
  external_id?: unknown;
  status?: unknown;
  amount?: unknown;
  paid_amount?: unknown;
}

export const xenditGateway: PaymentGateway = {
  provider: "XENDIT",

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    // HTTP Basic: secret key as the username, empty password.
    const authorization = `Basic ${Buffer.from(`${env.XENDIT_SECRET_KEY}:`).toString("base64")}`;

    const response = await fetch(XENDIT_API, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_id: input.orderNumber,
        // Server-computed. The browser never influences this number.
        amount: input.amountIdr,
        payer_email: input.payerEmail,
        description: input.description,
        currency: "IDR",
        invoice_duration: INVOICE_DURATION_SECONDS,
        success_redirect_url: input.successRedirectUrl,
        failure_redirect_url: input.failureRedirectUrl,
        items: input.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.priceIdr,
        })),
      }),
      // Never cache a payment request.
      cache: "no-store",
    });

    if (!response.ok) {
      // Log the status but not the body: Xendit errors can echo request detail.
      throw new Error(
        `Xendit invoice creation failed with HTTP ${response.status}. Check XENDIT_SECRET_KEY.`,
      );
    }

    const data = (await response.json()) as { id?: unknown; invoice_url?: unknown };

    if (typeof data.id !== "string" || typeof data.invoice_url !== "string") {
      throw new Error("Xendit returned an invoice without an id or invoice_url.");
    }

    return {
      provider: "XENDIT",
      redirectUrl: data.invoice_url,
      invoiceId: data.id,
    };
  },

  verifyWebhook({ headers, rawBody }: VerifyWebhookInput): WebhookVerdict {
    // --- 1. Authenticate the caller -------------------------------------
    // Xendit signs callbacks with a static token in this header. Without this
    // check, anyone who discovered the webhook URL could mark orders paid.
    const presented = headers.get("x-callback-token");
    if (!presented) {
      return { kind: "invalid", reason: "Missing x-callback-token header." };
    }
    if (!secureEquals(presented, env.XENDIT_CALLBACK_TOKEN)) {
      return { kind: "invalid", reason: "Callback token does not match." };
    }

    // --- 2. Parse (only after authenticating) ---------------------------
    let body: XenditCallbackBody;
    try {
      body = JSON.parse(rawBody) as XenditCallbackBody;
    } catch {
      return { kind: "invalid", reason: "Body is not valid JSON." };
    }

    const invoiceId = body.id;
    const orderNumber = body.external_id;
    if (typeof invoiceId !== "string" || typeof orderNumber !== "string") {
      return { kind: "invalid", reason: "Callback is missing id or external_id." };
    }

    const outcome = mapStatus(body.status);
    if (!outcome) {
      return { kind: "ignored", reason: `Status ${String(body.status)} needs no action.` };
    }

    // Prefer paid_amount (what actually arrived) over amount (what was asked).
    const rawAmount = body.paid_amount ?? body.amount;
    if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount)) {
      return { kind: "invalid", reason: "Callback is missing a numeric amount." };
    }

    return {
      kind: "payment",
      // Scope the idempotency key to the invoice AND the status, so a PAID
      // followed by a SETTLED are two distinct events while a retry of either
      // is a no-op.
      eventId: `${invoiceId}:${String(body.status)}`,
      invoiceId,
      orderNumber,
      outcome,
      amountIdr: Math.trunc(rawAmount),
      raw: body,
    };
  },
};

/** Exported for unit testing the comparison in isolation. */
export const __testing = { secureEquals, mapStatus };
