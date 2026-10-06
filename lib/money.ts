/**
 * Money.
 *
 * Every amount in this application is an INTEGER NUMBER OF RUPIAH. There are no
 * floats and no "cents", for two reasons:
 *
 *   1. Floating point cannot represent decimal money exactly
 *      (0.1 + 0.2 !== 0.3), so totals computed in floats drift.
 *   2. Xendit's API takes whole-rupiah integers. Keeping the database in the
 *      same unit as the gateway means there is no multiply-or-divide step
 *      anywhere near a payment, which is where a x100 error would silently
 *      overcharge or undercharge a buyer.
 *
 * This module is pure - no database, no session - so the arithmetic that decides
 * what a buyer is charged is exhaustively unit-testable.
 */

/** Platform commission, in basis points. 1000 bp = 10%. */
export const COMMISSION_BASIS_POINTS = 1000;

/** Flat domestic shipping, whole rupiah. */
export const SHIPPING_FLAT_IDR = 15_000;

/** Orders at or above this subtotal ship free. */
export const FREE_SHIPPING_THRESHOLD_IDR = 300_000;

/** Guards against absurd quantities being pushed through the cart. */
export const MAX_QTY_PER_ITEM = 20;

export class MoneyError extends Error {}

/** Rejects anything that is not a safe, non-negative whole number of rupiah. */
export function assertValidAmount(value: number, label = "amount"): number {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of rupiah, got ${value}.`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} cannot be negative, got ${value}.`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} is too large to represent exactly.`);
  }
  return value;
}

export interface PricedLine {
  /** Price per unit at the moment of checkout, read from the database. */
  unitPriceIdr: number;
  qty: number;
}

export interface LineTotal extends PricedLine {
  lineTotalIdr: number;
  /** What the platform keeps. */
  commissionIdr: number;
  /** What the seller earns. commissionIdr + sellerEarningsIdr === lineTotalIdr. */
  sellerEarningsIdr: number;
}

/**
 * Split a line total between platform and seller.
 *
 * The commission is floored and the seller receives the remainder, so the two
 * parts always sum to exactly the line total - no rupiah is created or lost to
 * rounding.
 */
export function splitLine(line: PricedLine): LineTotal {
  assertValidAmount(line.unitPriceIdr, "unitPriceIdr");

  if (!Number.isInteger(line.qty) || line.qty < 1) {
    throw new MoneyError(`qty must be a positive whole number, got ${line.qty}.`);
  }
  if (line.qty > MAX_QTY_PER_ITEM) {
    throw new MoneyError(`qty may not exceed ${MAX_QTY_PER_ITEM}, got ${line.qty}.`);
  }

  const lineTotalIdr = assertValidAmount(line.unitPriceIdr * line.qty, "lineTotalIdr");
  const commissionIdr = Math.floor((lineTotalIdr * COMMISSION_BASIS_POINTS) / 10_000);

  return {
    ...line,
    lineTotalIdr,
    commissionIdr,
    sellerEarningsIdr: lineTotalIdr - commissionIdr,
  };
}

export function shippingFor(subtotalIdr: number): number {
  assertValidAmount(subtotalIdr, "subtotalIdr");
  return subtotalIdr >= FREE_SHIPPING_THRESHOLD_IDR ? 0 : SHIPPING_FLAT_IDR;
}

export interface OrderTotals {
  lines: LineTotal[];
  subtotalIdr: number;
  shippingIdr: number;
  totalIdr: number;
}

/**
 * The authoritative order total.
 *
 * SECURITY: callers MUST pass prices they have just read from the database, not
 * figures supplied by the browser. A buyer who edits the price in a form, a
 * request body or local storage changes nothing, because the number they send
 * is never an input to this function.
 */
export function computeOrderTotals(lines: PricedLine[]): OrderTotals {
  if (lines.length === 0) {
    throw new MoneyError("Cannot total an empty order.");
  }

  const priced = lines.map(splitLine);
  const subtotalIdr = priced.reduce((sum, l) => sum + l.lineTotalIdr, 0);
  assertValidAmount(subtotalIdr, "subtotalIdr");

  const shippingIdr = shippingFor(subtotalIdr);

  return {
    lines: priced,
    subtotalIdr,
    shippingIdr,
    totalIdr: subtotalIdr + shippingIdr,
  };
}

/**
 * Does a figure reported by the payment gateway match what we charged?
 *
 * Exact equality: a tolerance would be an invitation to shave rupiah off every
 * order. Used by the webhook before marking anything paid.
 */
export function amountMatches(expectedIdr: number, reportedIdr: number): boolean {
  return Number.isInteger(expectedIdr) && Number.isInteger(reportedIdr) && expectedIdr === reportedIdr;
}

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** Display format, e.g. 45000 -> "Rp 45.000". */
export function formatIdr(amount: number): string {
  // Intl renders "Rp 45.000" with a non-breaking space; normalise it so the
  // output is predictable in tests and in copy.
  return IDR.format(amount).replace(/ /g, " ");
}
