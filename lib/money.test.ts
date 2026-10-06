import { describe, expect, it } from "vitest";

import {
  amountMatches,
  assertValidAmount,
  COMMISSION_BASIS_POINTS,
  computeOrderTotals,
  FREE_SHIPPING_THRESHOLD_IDR,
  formatIdr,
  MAX_QTY_PER_ITEM,
  MoneyError,
  SHIPPING_FLAT_IDR,
  shippingFor,
  splitLine,
} from "./money";

describe("amount validation", () => {
  it("accepts whole non-negative rupiah", () => {
    expect(assertValidAmount(0)).toBe(0);
    expect(assertValidAmount(45_000)).toBe(45_000);
  });

  it.each([
    ["a fractional amount", 45_000.5],
    ["a negative amount", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects %s", (_label, value) => {
    expect(() => assertValidAmount(value)).toThrow(MoneyError);
  });
});

describe("commission split", () => {
  it("splits 10% and keeps the parts summing to the line total", () => {
    const line = splitLine({ unitPriceIdr: 45_000, qty: 2 });
    expect(line.lineTotalIdr).toBe(90_000);
    expect(line.commissionIdr).toBe(9_000);
    expect(line.sellerEarningsIdr).toBe(81_000);
    expect(line.commissionIdr + line.sellerEarningsIdr).toBe(line.lineTotalIdr);
  });

  it("never creates or destroys a rupiah, for any price", () => {
    // Rounding is the classic place money leaks. Check a wide spread of
    // awkward prices, including ones that do not divide by 10.
    for (const unitPriceIdr of [1, 3, 7, 9, 99, 101, 999, 1_001, 12_345, 45_679]) {
      for (const qty of [1, 2, 3, 7]) {
        const line = splitLine({ unitPriceIdr, qty });
        expect(
          line.commissionIdr + line.sellerEarningsIdr,
          `${unitPriceIdr} x ${qty}`,
        ).toBe(line.lineTotalIdr);
        expect(Number.isInteger(line.commissionIdr)).toBe(true);
        expect(Number.isInteger(line.sellerEarningsIdr)).toBe(true);
      }
    }
  });

  it("floors the commission so the seller is never short-changed", () => {
    // 10% of 5 is 0.5 -> platform takes 0, seller gets 5.
    const line = splitLine({ unitPriceIdr: 5, qty: 1 });
    expect(line.commissionIdr).toBe(0);
    expect(line.sellerEarningsIdr).toBe(5);
  });

  it("uses the declared basis points", () => {
    expect(COMMISSION_BASIS_POINTS).toBe(1000);
    const line = splitLine({ unitPriceIdr: 100_000, qty: 1 });
    expect(line.commissionIdr).toBe(10_000);
  });
});

describe("quantity limits", () => {
  it.each([0, -1, 1.5, Number.NaN])("rejects qty %s", (qty) => {
    expect(() => splitLine({ unitPriceIdr: 1_000, qty })).toThrow(MoneyError);
  });

  it("rejects an absurd quantity", () => {
    expect(() => splitLine({ unitPriceIdr: 1_000, qty: MAX_QTY_PER_ITEM + 1 })).toThrow(
      MoneyError,
    );
  });

  it("allows exactly the maximum", () => {
    expect(splitLine({ unitPriceIdr: 1_000, qty: MAX_QTY_PER_ITEM }).lineTotalIdr).toBe(
      1_000 * MAX_QTY_PER_ITEM,
    );
  });
});

describe("shipping", () => {
  it("charges a flat fee below the threshold", () => {
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_IDR - 1)).toBe(SHIPPING_FLAT_IDR);
  });

  it("is free at exactly the threshold", () => {
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_IDR)).toBe(0);
  });

  it("is free above the threshold", () => {
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_IDR + 50_000)).toBe(0);
  });
});

describe("order totals", () => {
  it("totals a multi-line order", () => {
    const totals = computeOrderTotals([
      { unitPriceIdr: 45_000, qty: 2 },
      { unitPriceIdr: 38_000, qty: 1 },
    ]);
    expect(totals.subtotalIdr).toBe(128_000);
    expect(totals.shippingIdr).toBe(SHIPPING_FLAT_IDR);
    expect(totals.totalIdr).toBe(128_000 + SHIPPING_FLAT_IDR);
  });

  it("total always equals subtotal plus shipping", () => {
    const totals = computeOrderTotals([{ unitPriceIdr: 500_000, qty: 1 }]);
    expect(totals.totalIdr).toBe(totals.subtotalIdr + totals.shippingIdr);
    expect(totals.shippingIdr).toBe(0);
  });

  it("refuses an empty order", () => {
    expect(() => computeOrderTotals([])).toThrow(MoneyError);
  });

  it("propagates a bad line rather than silently coercing it", () => {
    expect(() => computeOrderTotals([{ unitPriceIdr: -5, qty: 1 }])).toThrow(MoneyError);
  });
});

describe("gateway amount cross-check", () => {
  it("accepts an exact match", () => {
    expect(amountMatches(143_000, 143_000)).toBe(true);
  });

  it("REJECTS an underpayment, even by one rupiah", () => {
    // No tolerance: a tolerance is an invitation to shave money off every order.
    expect(amountMatches(143_000, 142_999)).toBe(false);
  });

  it("REJECTS an overpayment", () => {
    expect(amountMatches(143_000, 143_001)).toBe(false);
  });

  it("rejects non-integer figures", () => {
    expect(amountMatches(143_000, 143_000.4)).toBe(false);
  });
});

describe("display formatting", () => {
  it("formats rupiah with thousands separators and no decimals", () => {
    expect(formatIdr(45_000)).toBe("Rp 45.000");
    expect(formatIdr(1_250_000)).toBe("Rp 1.250.000");
  });

  it("formats zero", () => {
    expect(formatIdr(0)).toBe("Rp 0");
  });

  it("uses ordinary spaces so output is predictable", () => {
    expect(formatIdr(45_000)).not.toMatch(/ /);
  });
});
