/**
 * Payment gateway callback.
 *
 * Register this URL in the Xendit dashboard:
 *   <your-domain>/api/webhooks/payment
 *
 * This is the ONLY code path that can mark an order paid. The buyer is also
 * redirected back to us after paying, but that redirect is mere navigation -
 * a user can type it, so it confers nothing.
 *
 * Defence in depth, in order:
 *   1. Authenticate the caller (constant-time token comparison) BEFORE parsing
 *      the body, so unauthenticated input never reaches a parser.
 *   2. Deduplicate on a unique constraint, because gateways retry.
 *   3. Cross-check the amount against our own stored total.
 *   4. Only then mutate anything.
 *
 * Status codes matter here: a gateway retries on 5xx, so we return 200 for
 * "received and understood, nothing to do" and reserve 401 for a failed
 * authentication (which should NOT be retried into a different result).
 */
import { paymentGateway } from "@/lib/payments";

import { confirmPayment } from "@/lib/data/orders";

export async function POST(request: Request) {
  // Read the body as raw text. Some providers sign the exact bytes, and for
  // all of them we want to authenticate before trusting any structure.
  const rawBody = await request.text();

  const verdict = paymentGateway.verifyWebhook({
    headers: request.headers,
    rawBody,
  });

  if (verdict.kind === "invalid") {
    // Deliberately terse: do not tell an attacker which check failed.
    console.warn(`[webhook] rejected: ${verdict.reason}`);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (verdict.kind === "ignored") {
    return Response.json({ ok: true, ignored: verdict.reason }, { status: 200 });
  }

  try {
    const result = await confirmPayment({
      provider: paymentGateway.provider,
      eventId: verdict.eventId,
      invoiceId: verdict.invoiceId,
      orderNumber: verdict.orderNumber,
      outcome: verdict.outcome,
      amountIdr: verdict.amountIdr,
      raw: verdict.raw,
    });

    if (!result.handled) {
      // A duplicate, an unknown order, or a mismatched amount. All are logged
      // and acknowledged with 200 so the provider stops retrying - retrying
      // would not change the outcome.
      console.warn(`[webhook] not applied: ${result.reason}`);
      return Response.json({ ok: true, note: result.reason }, { status: 200 });
    }

    return Response.json({ ok: true, status: result.status }, { status: 200 });
  } catch (error) {
    // A genuine server fault: return 5xx so the gateway retries later.
    console.error("[webhook] processing failed", error);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}

/**
 * Reject everything else explicitly. Without this, a GET would fall through to
 * a 405 from the framework, but being explicit documents the intent.
 */
export function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
