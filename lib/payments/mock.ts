/**
 * Mock gateway for local development and automated tests.
 *
 * Implements the SAME interface as Xendit, so the checkout flow, the webhook
 * route, the order state machine and the earnings ledger are all exercised for
 * real - only the hosted payment page is simulated. That means switching to
 * Xendit later is a config change, not a code change.
 *
 * It is NOT a security hole in production: lib/env.ts refuses to boot with
 * PAYMENT_PROVIDER=MOCK when NODE_ENV=production.
 */
import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentGateway,
  VerifyWebhookInput,
  WebhookVerdict,
} from "./types";

/**
 * The mock callback is authenticated too, using BETTER_AUTH_SECRET as the
 * shared token. Keeping the auth step real means the development flow exercises
 * the same code path as production rather than skipping it.
 */
function mockToken(): string {
  return createHash("sha256").update(`mock-callback:${env.BETTER_AUTH_SECRET}`).digest("hex");
}

function secureEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export const mockGateway: PaymentGateway = {
  provider: "MOCK",

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const invoiceId = `mock_inv_${input.orderNumber}`;

    // Send the buyer to our own simulated payment page, which offers "pay" and
    // "fail" buttons and then posts a callback to the real webhook route.
    const url = new URL("/dev/pay", env.BETTER_AUTH_URL);
    url.searchParams.set("order", input.orderNumber);
    url.searchParams.set("amount", String(input.amountIdr));

    return {
      provider: "MOCK",
      redirectUrl: url.toString(),
      invoiceId,
    };
  },

  verifyWebhook({ headers, rawBody }: VerifyWebhookInput): WebhookVerdict {
    const presented = headers.get("x-callback-token");
    if (!presented) {
      return { kind: "invalid", reason: "Missing x-callback-token header." };
    }
    if (!secureEquals(presented, mockToken())) {
      return { kind: "invalid", reason: "Callback token does not match." };
    }

    let body: { id?: unknown; external_id?: unknown; status?: unknown; amount?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { kind: "invalid", reason: "Body is not valid JSON." };
    }

    const invoiceId = body.id;
    const orderNumber = body.external_id;
    const status = body.status;
    const amount = body.amount;

    if (typeof invoiceId !== "string" || typeof orderNumber !== "string") {
      return { kind: "invalid", reason: "Callback is missing id or external_id." };
    }
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return { kind: "invalid", reason: "Callback is missing a numeric amount." };
    }
    if (status !== "PAID" && status !== "EXPIRED" && status !== "FAILED") {
      return { kind: "ignored", reason: `Status ${String(status)} needs no action.` };
    }

    return {
      kind: "payment",
      eventId: `${invoiceId}:${status}`,
      invoiceId,
      orderNumber,
      outcome: status,
      amountIdr: Math.trunc(amount),
      raw: body,
    };
  },
};

/** The token the dev payment page must present. Server-side only. */
export const getMockCallbackToken = mockToken;
