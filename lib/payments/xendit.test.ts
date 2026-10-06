/**
 * Webhook authentication tests.
 *
 * This is the highest-risk code in the app: the webhook is the ONLY thing that
 * can mark an order paid, and it is a public, unauthenticated-by-default
 * endpoint. Every case below is an attack that must fail closed.
 */
import { describe, expect, it } from "vitest";

import { __testing, xenditGateway } from "./xendit";

// Must match vitest.config.mts -> test.env
const VALID_TOKEN = "test-callback-token";

const paidBody = {
  id: "inv_123",
  external_id: "KM-20261006-0001",
  status: "PAID",
  amount: 150_000,
  paid_amount: 150_000,
};

const verify = (body: unknown, token?: string | null) => {
  const headers = new Headers();
  if (token !== null && token !== undefined) headers.set("x-callback-token", token);
  return xenditGateway.verifyWebhook({
    headers,
    rawBody: typeof body === "string" ? body : JSON.stringify(body),
  });
};

describe("callback authentication", () => {
  it("accepts a correctly-tokened PAID callback", () => {
    const verdict = verify(paidBody, VALID_TOKEN);
    expect(verdict.kind).toBe("payment");
    if (verdict.kind === "payment") {
      expect(verdict.orderNumber).toBe("KM-20261006-0001");
      expect(verdict.invoiceId).toBe("inv_123");
      expect(verdict.outcome).toBe("PAID");
      expect(verdict.amountIdr).toBe(150_000);
    }
  });

  it("REJECTS a callback with no token (an attacker who found the URL)", () => {
    const verdict = verify(paidBody, null);
    expect(verdict.kind).toBe("invalid");
  });

  it("REJECTS a callback with a wrong token", () => {
    const verdict = verify(paidBody, "not-the-real-token");
    expect(verdict.kind).toBe("invalid");
  });

  it("REJECTS an empty token", () => {
    expect(verify(paidBody, "").kind).toBe("invalid");
  });

  it("REJECTS a token that is a prefix of the real one", () => {
    expect(verify(paidBody, VALID_TOKEN.slice(0, -1)).kind).toBe("invalid");
  });

  it("treats a trailing-whitespace token as equal (HTTP header values are trimmed)", () => {
    // Documents real behaviour rather than wishing otherwise: the WHATWG
    // Headers class strips leading/trailing whitespace from values, as RFC 9110
    // requires. An attacker gains nothing - they still need the exact secret.
    expect(verify(paidBody, `${VALID_TOKEN} `).kind).toBe("payment");
  });

  it("REJECTS a token with embedded whitespace", () => {
    expect(verify(paidBody, VALID_TOKEN.replace("-", " ")).kind).toBe("invalid");
  });

  it("REJECTS a case-altered token", () => {
    expect(verify(paidBody, VALID_TOKEN.toUpperCase()).kind).toBe("invalid");
  });

  it("does not parse the body before authenticating", () => {
    // Malformed JSON with a bad token must be rejected for the TOKEN, proving
    // we never reach JSON.parse on unauthenticated input.
    const verdict = verify("{ this is not json", "wrong-token");
    expect(verdict.kind).toBe("invalid");
    if (verdict.kind === "invalid") expect(verdict.reason).toMatch(/token/i);
  });
});

describe("payload validation", () => {
  it("rejects malformed JSON even when authenticated", () => {
    const verdict = verify("{ nope", VALID_TOKEN);
    expect(verdict.kind).toBe("invalid");
    if (verdict.kind === "invalid") expect(verdict.reason).toMatch(/json/i);
  });

  it("rejects a callback with no external_id", () => {
    expect(verify({ ...paidBody, external_id: undefined }, VALID_TOKEN).kind).toBe("invalid");
  });

  it("rejects a callback with no invoice id", () => {
    expect(verify({ ...paidBody, id: undefined }, VALID_TOKEN).kind).toBe("invalid");
  });

  it("rejects a non-numeric amount", () => {
    expect(verify({ ...paidBody, amount: "150000", paid_amount: undefined }, VALID_TOKEN).kind).toBe(
      "invalid",
    );
  });

  it("rejects a non-numeric paid_amount", () => {
    // Sent as a raw string because JSON cannot represent NaN - JSON.stringify
    // would silently turn it into null.
    const raw = '{"id":"inv_123","external_id":"KM-1","status":"PAID","paid_amount":"abc"}';
    const headers = new Headers({ "x-callback-token": VALID_TOKEN });
    expect(xenditGateway.verifyWebhook({ headers, rawBody: raw }).kind).toBe("invalid");
  });

  it("falls back to `amount` when paid_amount is null", () => {
    // Xendit omits paid_amount on some settlement callbacks. The webhook route
    // still cross-checks the figure against the stored order total, so this
    // fallback cannot by itself over-credit an order.
    const verdict = verify({ ...paidBody, paid_amount: null }, VALID_TOKEN);
    expect(verdict.kind).toBe("payment");
    if (verdict.kind === "payment") expect(verdict.amountIdr).toBe(150_000);
  });

  it("truncates a fractional amount to whole rupiah", () => {
    const verdict = verify({ ...paidBody, paid_amount: 150_000.9 }, VALID_TOKEN);
    if (verdict.kind === "payment") expect(verdict.amountIdr).toBe(150_000);
  });

  it("prefers paid_amount over amount when they disagree", () => {
    // A buyer who underpays must not be credited the invoice amount.
    const verdict = verify({ ...paidBody, amount: 150_000, paid_amount: 1_000 }, VALID_TOKEN);
    expect(verdict.kind).toBe("payment");
    if (verdict.kind === "payment") expect(verdict.amountIdr).toBe(1_000);
  });
});

describe("status mapping", () => {
  it("treats SETTLED as PAID", () => {
    const verdict = verify({ ...paidBody, status: "SETTLED" }, VALID_TOKEN);
    expect(verdict.kind).toBe("payment");
    if (verdict.kind === "payment") expect(verdict.outcome).toBe("PAID");
  });

  it.each(["EXPIRED", "FAILED"])("maps %s through", (status) => {
    const verdict = verify({ ...paidBody, status }, VALID_TOKEN);
    expect(verdict.kind).toBe("payment");
    if (verdict.kind === "payment") expect(verdict.outcome).toBe(status);
  });

  it("ignores PENDING rather than erroring (so the provider stops retrying)", () => {
    expect(verify({ ...paidBody, status: "PENDING" }, VALID_TOKEN).kind).toBe("ignored");
  });

  it("ignores unrecognised statuses", () => {
    expect(verify({ ...paidBody, status: "SOMETHING_NEW" }, VALID_TOKEN).kind).toBe("ignored");
  });
});

describe("idempotency key", () => {
  it("is stable for identical deliveries, so a replay is a no-op", () => {
    const a = verify(paidBody, VALID_TOKEN);
    const b = verify(paidBody, VALID_TOKEN);
    expect(a.kind).toBe("payment");
    if (a.kind === "payment" && b.kind === "payment") {
      expect(a.eventId).toBe(b.eventId);
    }
  });

  it("differs between PAID and SETTLED for the same invoice", () => {
    const paid = verify(paidBody, VALID_TOKEN);
    const settled = verify({ ...paidBody, status: "SETTLED" }, VALID_TOKEN);
    if (paid.kind === "payment" && settled.kind === "payment") {
      expect(paid.eventId).not.toBe(settled.eventId);
    }
  });
});

describe("secureEquals", () => {
  const { secureEquals } = __testing;

  it("matches identical strings", () => {
    expect(secureEquals("abc", "abc")).toBe(true);
  });

  it("rejects different strings", () => {
    expect(secureEquals("abc", "abd")).toBe(false);
  });

  it("handles different lengths without throwing", () => {
    // timingSafeEqual throws on length mismatch; the sha256 pre-hash is what
    // makes this safe. A throw here would become a 500 on hostile input.
    expect(() => secureEquals("short", "a much longer value")).not.toThrow();
    expect(secureEquals("short", "a much longer value")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(secureEquals("", "")).toBe(true);
    expect(secureEquals("", "x")).toBe(false);
  });
});
