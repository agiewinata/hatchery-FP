/**
 * Order fulfilment state machine.
 *
 * A deliberately PURE module: no database, no session, no I/O. That means the
 * rules below can be exhaustively unit-tested, and the admin print queue, the
 * seller "mark shipped" action and the payment webhook all share one definition
 * of what a legal transition is. Divergent copies of this logic is how orders
 * end up in impossible states.
 *
 * Enforced invariants:
 *   - You may only move FORWARD, one step at a time, along your own
 *     fulfilment path. No skipping (e.g. PAID -> SHIPPED for a print-on-demand
 *     item would skip production entirely).
 *   - Only the SYSTEM (payment webhook) may mark an item PAID. No human action,
 *     admin included, can mark an order paid without money arriving.
 *   - Terminal states are terminal.
 *   - Each step names exactly who may perform it.
 */
import type { FulfilmentType, OrderItemStatus } from "@/lib/generated/prisma/enums";

/** Who is attempting the transition. SYSTEM means our own trusted server code. */
export type Actor = "SYSTEM" | "ADMIN" | "SELLER" | "BUYER";

/**
 * The platform prints and ships these, so the production steps are ours.
 */
export const PRINT_ON_DEMAND_FLOW = [
  "PENDING_PAYMENT",
  "PAID",
  "IN_PRODUCTION",
  "PRINTED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
] as const satisfies readonly OrderItemStatus[];

/**
 * The seller ships these themselves, so there is no production stage.
 */
export const SELLER_STOCKED_FLOW = [
  "PENDING_PAYMENT",
  "PAID",
  "AWAITING_SELLER_SHIPMENT",
  "SHIPPED",
  "DELIVERED",
] as const satisfies readonly OrderItemStatus[];

/** States from which nothing further can happen. */
export const TERMINAL_STATUSES = ["DELIVERED", "CANCELLED", "REFUNDED"] as const satisfies
  readonly OrderItemStatus[];

/**
 * Who may advance INTO each status.
 *
 * `PAID` is SYSTEM-only: that is the whole point of trusting the webhook and
 * nothing else. `DELIVERED` includes BUYER so a buyer can confirm receipt.
 */
const ALLOWED_ACTORS: Record<OrderItemStatus, readonly Actor[]> = {
  PENDING_PAYMENT: ["SYSTEM"],
  // Only the payment webhook. Never a person.
  PAID: ["SYSTEM"],
  // Platform-run production queue.
  IN_PRODUCTION: ["ADMIN"],
  PRINTED: ["ADMIN"],
  PACKED: ["ADMIN"],
  // Set by the system when a seller-stocked item is paid for.
  AWAITING_SELLER_SHIPMENT: ["SYSTEM"],
  // Platform ships print-on-demand; the seller ships their own stock.
  SHIPPED: ["ADMIN", "SELLER"],
  DELIVERED: ["ADMIN", "SELLER", "BUYER"],
  // Administrative exits.
  CANCELLED: ["ADMIN"],
  REFUNDED: ["ADMIN"],
};

export function flowFor(fulfilmentType: FulfilmentType): readonly OrderItemStatus[] {
  return fulfilmentType === "PRINT_ON_DEMAND" ? PRINT_ON_DEMAND_FLOW : SELLER_STOCKED_FLOW;
}

export function isTerminal(status: OrderItemStatus): boolean {
  return (TERMINAL_STATUSES as readonly OrderItemStatus[]).includes(status);
}

export interface TransitionRequest {
  from: OrderItemStatus;
  to: OrderItemStatus;
  fulfilmentType: FulfilmentType;
  actor: Actor;
}

export type TransitionResult = { ok: true } | { ok: false; reason: string };

/**
 * The single authority on whether a status change is legal.
 *
 * Callers MUST treat a `false` result as a hard failure and write nothing.
 */
export function canTransition({
  from,
  to,
  fulfilmentType,
  actor,
}: TransitionRequest): TransitionResult {
  if (from === to) {
    return { ok: false, reason: `Item is already ${from}.` };
  }

  if (isTerminal(from)) {
    return { ok: false, reason: `${from} is a final state and cannot be changed.` };
  }

  const permittedActors = ALLOWED_ACTORS[to];
  if (!permittedActors.includes(actor)) {
    return { ok: false, reason: `A ${actor.toLowerCase()} may not set an item to ${to}.` };
  }

  // Administrative exits may happen from any non-terminal state, but a refund
  // only makes sense once money has actually been taken.
  if (to === "CANCELLED") return { ok: true };
  if (to === "REFUNDED") {
    return from === "PENDING_PAYMENT"
      ? { ok: false, reason: "Cannot refund an order that was never paid." }
      : { ok: true };
  }

  const flow = flowFor(fulfilmentType);
  const fromIndex = flow.indexOf(from);
  const toIndex = flow.indexOf(to);

  if (fromIndex === -1) {
    return {
      ok: false,
      reason: `${from} is not part of the ${fulfilmentType} fulfilment path.`,
    };
  }
  if (toIndex === -1) {
    return {
      ok: false,
      reason: `${to} is not a valid step for a ${fulfilmentType} item.`,
    };
  }
  if (toIndex < fromIndex) {
    return { ok: false, reason: `Cannot move an order backwards (${from} -> ${to}).` };
  }
  if (toIndex > fromIndex + 1) {
    return {
      ok: false,
      reason: `Cannot skip fulfilment steps (${from} -> ${to}). Next step is ${flow[fromIndex + 1]}.`,
    };
  }

  return { ok: true };
}

/** The next status in an item's path, or null at the end of the flow. */
export function nextStatus(
  current: OrderItemStatus,
  fulfilmentType: FulfilmentType,
): OrderItemStatus | null {
  if (isTerminal(current)) return null;
  const flow = flowFor(fulfilmentType);
  const index = flow.indexOf(current);
  if (index === -1 || index === flow.length - 1) return null;
  return flow[index + 1] ?? null;
}

/** The status an item enters when its payment is confirmed. */
export function statusAfterPayment(fulfilmentType: FulfilmentType): OrderItemStatus {
  return fulfilmentType === "PRINT_ON_DEMAND" ? "PAID" : "AWAITING_SELLER_SHIPMENT";
}

/** Human-readable labels for the buyer-facing tracker. */
export const STATUS_LABELS: Record<OrderItemStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Payment confirmed",
  IN_PRODUCTION: "In production",
  PRINTED: "Printed",
  PACKED: "Packed",
  AWAITING_SELLER_SHIPMENT: "Awaiting seller shipment",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};
