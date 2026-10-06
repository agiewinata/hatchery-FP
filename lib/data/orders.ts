/**
 * Orders: checkout, payment confirmation, fulfilment and the progress tracker.
 *
 * The three load-bearing guarantees in this file:
 *
 *  1. TOTALS ARE OURS. Prices are re-read from the database inside the
 *     checkout transaction. Nothing the browser sends influences the amount
 *     charged.
 *  2. ONLY THE WEBHOOK MARKS AN ORDER PAID. The browser is redirected back
 *     from the gateway, but that redirect is just navigation - a user can forge
 *     it, so it grants nothing. `confirmPayment` is reachable only from the
 *     authenticated webhook route.
 *  3. STOCK IS RESERVED AT CHECKOUT, not at payment. Otherwise two buyers can
 *     both pay for the last item. Reservations are released if payment fails
 *     or expires.
 */
import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import type { FulfilmentType, OrderItemStatus } from "@/lib/generated/prisma/enums";
import { amountMatches, computeOrderTotals } from "@/lib/money";
import {
  canTransition,
  statusAfterPayment,
  type Actor,
} from "@/lib/orders/transitions";
import type { AddressInput } from "@/lib/validation/seller";

import { ForbiddenError, requireAdmin, requireSeller, requireUser, type CurrentUser } from "./auth";

/** Human-facing reference, e.g. KM-20261006-7F3A. */
function newOrderNumber(): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // 4 hex chars of real randomness: order numbers appear in URLs, so they must
  // not be guessable by incrementing.
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `KM-${today}-${suffix}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export class CheckoutError extends Error {}

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  totalIdr: number;
  payerEmail: string;
  items: { name: string; quantity: number; priceIdr: number }[];
}

/**
 * Turn the cart into a PENDING order.
 *
 * Runs entirely in one transaction so that stock reservation, order creation
 * and cart clearing either all happen or none do. No payment has been taken at
 * this point - the order exists so the gateway has something to reference.
 */
export async function createOrderFromCart(address: AddressInput): Promise<CreatedOrder> {
  const user = await requireUser();

  return db.$transaction(async (tx) => {
    const cartRows = await tx.cartItem.findMany({
      where: { userId: user.id },
      select: {
        qty: true,
        product: {
          select: {
            id: true,
            title: true,
            priceIdr: true,
            status: true,
            stockQty: true,
            fulfilmentType: true,
            sellerId: true,
            seller: { select: { isApproved: true } },
          },
        },
      },
    });

    if (cartRows.length === 0) throw new CheckoutError("Your cart is empty.");

    // --- Re-validate every line against live data ------------------------
    for (const { product, qty } of cartRows) {
      if (product.status !== "ACTIVE" || !product.seller.isApproved) {
        throw new CheckoutError(`"${product.title}" is no longer for sale.`);
      }
      if (product.fulfilmentType === "SELLER_STOCKED" && (product.stockQty ?? 0) < qty) {
        throw new CheckoutError(
          `"${product.title}" only has ${product.stockQty ?? 0} left. Adjust your cart.`,
        );
      }
    }

    // --- Totals, computed from DB prices ---------------------------------
    const totals = computeOrderTotals(
      cartRows.map((r) => ({ unitPriceIdr: r.product.priceIdr, qty: r.qty })),
    );

    // --- Reserve stock ----------------------------------------------------
    for (const { product, qty } of cartRows) {
      if (product.fulfilmentType !== "SELLER_STOCKED") continue;

      // The `gte` guard makes this a compare-and-set: if another buyer took the
      // last unit between our read and now, count is 0 and we abort rather
      // than overselling.
      const reserved = await tx.product.updateMany({
        where: { id: product.id, stockQty: { gte: qty } },
        data: { stockQty: { decrement: qty } },
      });

      if (reserved.count === 0) {
        throw new CheckoutError(`"${product.title}" just sold out. Please adjust your cart.`);
      }
    }

    // --- Create the order -------------------------------------------------
    let orderNumber = newOrderNumber();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await tx.order.findUnique({
        where: { orderNumber },
        select: { id: true },
      });
      if (!clash) break;
      orderNumber = newOrderNumber();
    }

    const order = await tx.order.create({
      data: {
        orderNumber,
        buyerId: user.id,
        subtotalIdr: totals.subtotalIdr,
        shippingIdr: totals.shippingIdr,
        totalIdr: totals.totalIdr,
        shippingAddress: address,
        paymentProvider: "MOCK", // overwritten below with the active provider
        paymentStatus: "PENDING",
        items: {
          create: cartRows.map((row, index) => ({
            productId: row.product.id,
            sellerId: row.product.sellerId,
            titleSnapshot: row.product.title,
            unitPriceIdr: row.product.priceIdr,
            qty: row.qty,
            fulfilmentType: row.product.fulfilmentType,
            status: "PENDING_PAYMENT" as OrderItemStatus,
            sellerEarningsIdr: totals.lines[index]!.sellerEarningsIdr,
            commissionIdr: totals.lines[index]!.commissionIdr,
            events: {
              create: { status: "PENDING_PAYMENT" as OrderItemStatus, note: "Order placed." },
            },
          })),
        },
      },
      select: { id: true, orderNumber: true, totalIdr: true },
    });

    await tx.cartItem.deleteMany({ where: { userId: user.id } });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      totalIdr: order.totalIdr,
      payerEmail: user.email,
      items: cartRows.map((r) => ({
        name: r.product.title,
        quantity: r.qty,
        priceIdr: r.product.priceIdr,
      })),
    };
  });
}

/** Record which gateway invoice belongs to an order. */
export async function attachGatewayInvoice(
  orderId: string,
  provider: "MOCK" | "XENDIT",
  invoiceId: string,
) {
  await db.order.update({
    where: { id: orderId },
    data: { paymentProvider: provider, gatewayInvoiceId: invoiceId },
  });
}

export interface PaymentConfirmation {
  provider: "MOCK" | "XENDIT";
  eventId: string;
  invoiceId: string;
  orderNumber: string;
  outcome: "PAID" | "EXPIRED" | "FAILED";
  amountIdr: number;
  raw: unknown;
}

export type PaymentResult =
  | { handled: true; status: "paid" | "cancelled" }
  | { handled: false; reason: string };

/**
 * Apply an authenticated payment callback.
 *
 * Callers MUST have verified the callback's authenticity first (see
 * lib/payments/*.verifyWebhook). This function assumes the message is genuine
 * but still refuses to trust its CONTENTS: the amount is cross-checked against
 * our own stored total before anything is marked paid.
 */
export async function confirmPayment(input: PaymentConfirmation): Promise<PaymentResult> {
  // --- Idempotency ------------------------------------------------------
  // The unique (provider, externalId) constraint is the gate. A replayed
  // delivery - which gateways do routinely - loses the race and is a no-op.
  try {
    await db.webhookEvent.create({
      data: {
        provider: input.provider,
        externalId: input.eventId,
        eventType: input.outcome,
        payload: input.raw as object,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { handled: false, reason: "Duplicate delivery; already processed." };
    }
    throw error;
  }

  const order = await db.order.findUnique({
    where: { orderNumber: input.orderNumber },
    select: {
      id: true,
      totalIdr: true,
      paymentStatus: true,
      items: { select: { id: true, fulfilmentType: true, sellerId: true, sellerEarningsIdr: true, productId: true, qty: true, status: true } },
    },
  });

  if (!order) {
    await markWebhookProcessed(input, "Unknown order number.");
    return { handled: false, reason: "Unknown order." };
  }

  // Already settled: nothing to do, but not an error.
  if (order.paymentStatus === "PAID" && input.outcome === "PAID") {
    await markWebhookProcessed(input, null);
    return { handled: false, reason: "Order already paid." };
  }

  if (input.outcome !== "PAID") {
    await releaseOrder(order.id, input.outcome);
    await markWebhookProcessed(input, null);
    return { handled: true, status: "cancelled" };
  }

  // --- Amount cross-check ----------------------------------------------
  // The callback is authentic, but the figure in it is still only a claim.
  // Exact match required - no tolerance.
  if (!amountMatches(order.totalIdr, input.amountIdr)) {
    const reason = `Amount mismatch: expected ${order.totalIdr}, callback reported ${input.amountIdr}.`;
    await markWebhookProcessed(input, reason);
    return { handled: false, reason };
  }

  // --- Mark paid and branch each item onto its fulfilment path ----------
  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        paidAt: new Date(),
        gatewayPayload: input.raw as object,
      },
    });

    for (const item of order.items) {
      const next = statusAfterPayment(item.fulfilmentType);

      await tx.orderItem.update({
        where: { id: item.id },
        data: { status: next },
      });

      // Two events: payment confirmed, then the first fulfilment state. The
      // tracker reads this history, so both steps stay visible to the buyer.
      await tx.orderItemEvent.createMany({
        data: [
          { orderItemId: item.id, status: "PAID", note: "Payment received." },
          ...(next === "PAID"
            ? []
            : [{ orderItemId: item.id, status: next, note: "Waiting for the seller to ship." }]),
        ],
      });

      // Credit the seller. Pending until delivery, then it becomes available.
      await tx.sellerBalance.upsert({
        where: { sellerId: item.sellerId },
        create: {
          sellerId: item.sellerId,
          pendingIdr: item.sellerEarningsIdr,
          lifetimeIdr: item.sellerEarningsIdr,
        },
        update: {
          pendingIdr: { increment: item.sellerEarningsIdr },
          lifetimeIdr: { increment: item.sellerEarningsIdr },
        },
      });
    }
  });

  await markWebhookProcessed(input, null);
  return { handled: true, status: "paid" };
}

async function markWebhookProcessed(input: PaymentConfirmation, error: string | null) {
  await db.webhookEvent.updateMany({
    where: { provider: input.provider, externalId: input.eventId },
    data: { processedAt: new Date(), error },
  });
}

/** Payment failed or expired: cancel the items and give the stock back. */
async function releaseOrder(orderId: string, outcome: "EXPIRED" | "FAILED") {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        items: { select: { id: true, productId: true, qty: true, fulfilmentType: true } },
      },
    });
    if (!order) return;

    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: outcome === "EXPIRED" ? "EXPIRED" : "FAILED" },
    });

    for (const item of order.items) {
      await tx.orderItem.update({ where: { id: item.id }, data: { status: "CANCELLED" } });
      await tx.orderItemEvent.create({
        data: {
          orderItemId: item.id,
          status: "CANCELLED",
          note: outcome === "EXPIRED" ? "Payment window expired." : "Payment failed.",
        },
      });

      // Return the reservation made at checkout.
      if (item.fulfilmentType === "SELLER_STOCKED") {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.qty } },
        });
      }
    }
  });
}

// ===========================================================================
// Reads
// ===========================================================================

export interface TrackedItem {
  id: string;
  title: string;
  qty: number;
  unitPriceIdr: number;
  fulfilmentType: FulfilmentType;
  status: OrderItemStatus;
  trackingNumber: string | null;
  productSlug: string;
  imageUrl: string | null;
  events: { status: OrderItemStatus; note: string | null; createdAt: Date }[];
}

export interface TrackedOrder {
  orderNumber: string;
  placedAt: Date;
  paidAt: Date | null;
  paymentStatus: string;
  subtotalIdr: number;
  shippingIdr: number;
  totalIdr: number;
  shippingAddress: AddressInput;
  items: TrackedItem[];
}

/**
 * One order, for the buyer's tracker.
 *
 * Scoped by buyerId: order numbers appear in URLs, so without this scope any
 * signed-in user could read anyone's order and shipping address by guessing or
 * sharing a link. Admins may read any order.
 */
export async function getOwnOrder(orderNumber: string): Promise<TrackedOrder | null> {
  const user = await requireUser();

  const row = await db.order.findFirst({
    where: {
      orderNumber,
      // The authorization check, expressed as part of the query.
      ...(user.role === "ADMIN" ? {} : { buyerId: user.id }),
    },
    select: {
      orderNumber: true,
      createdAt: true,
      paidAt: true,
      paymentStatus: true,
      subtotalIdr: true,
      shippingIdr: true,
      totalIdr: true,
      shippingAddress: true,
      items: {
        select: {
          id: true,
          titleSnapshot: true,
          qty: true,
          unitPriceIdr: true,
          fulfilmentType: true,
          status: true,
          trackingNumber: true,
          product: {
            select: {
              slug: true,
              artworkUrl: true,
              images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
            },
          },
          events: {
            select: { status: true, note: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!row) return null;

  return {
    orderNumber: row.orderNumber,
    placedAt: row.createdAt,
    paidAt: row.paidAt,
    paymentStatus: row.paymentStatus,
    subtotalIdr: row.subtotalIdr,
    shippingIdr: row.shippingIdr,
    totalIdr: row.totalIdr,
    shippingAddress: row.shippingAddress as AddressInput,
    items: row.items.map((i) => ({
      id: i.id,
      title: i.titleSnapshot,
      qty: i.qty,
      unitPriceIdr: i.unitPriceIdr,
      fulfilmentType: i.fulfilmentType,
      status: i.status,
      trackingNumber: i.trackingNumber,
      productSlug: i.product.slug,
      imageUrl: i.product.images[0]?.url ?? i.product.artworkUrl ?? null,
      events: i.events,
    })),
  };
}

/** The buyer's order list. */
export async function listOwnOrders() {
  const user = await requireUser();

  return db.order.findMany({
    where: { buyerId: user.id },
    select: {
      orderNumber: true,
      createdAt: true,
      totalIdr: true,
      paymentStatus: true,
      items: { select: { status: true, titleSnapshot: true, qty: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Admin print queue: paid print-on-demand items still in production. */
export async function listProductionQueue() {
  await requireAdmin();

  return db.orderItem.findMany({
    where: {
      fulfilmentType: "PRINT_ON_DEMAND",
      status: { in: ["PAID", "IN_PRODUCTION", "PRINTED", "PACKED"] },
    },
    select: {
      id: true,
      titleSnapshot: true,
      qty: true,
      status: true,
      createdAt: true,
      order: { select: { orderNumber: true, shippingAddress: true } },
      seller: { select: { displayName: true, slug: true } },
      product: { select: { artworkUrl: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** The seller's own parcels to send. */
export async function listSellerFulfilment() {
  const { seller } = await requireSeller();

  return db.orderItem.findMany({
    where: {
      sellerId: seller.id,
      status: { in: ["AWAITING_SELLER_SHIPMENT", "SHIPPED"] },
    },
    select: {
      id: true,
      titleSnapshot: true,
      qty: true,
      status: true,
      trackingNumber: true,
      createdAt: true,
      order: { select: { orderNumber: true, shippingAddress: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ===========================================================================
// Fulfilment transitions
// ===========================================================================

/**
 * Advance one order item.
 *
 * The actor is derived from the SESSION and the item's ownership, never from
 * the request - otherwise a buyer could claim to be an admin. `canTransition`
 * then decides whether that actor may make that specific move.
 */
export async function advanceOrderItem(
  orderItemId: string,
  to: OrderItemStatus,
  options: { trackingNumber?: string; note?: string } = {},
) {
  const user = await requireUser();

  const item = await db.orderItem.findUnique({
    where: { id: orderItemId },
    select: {
      id: true,
      status: true,
      fulfilmentType: true,
      sellerId: true,
      sellerEarningsIdr: true,
      productId: true,
      qty: true,
      order: { select: { buyerId: true, paymentStatus: true } },
      seller: { select: { userId: true } },
    },
  });

  if (!item) throw new ForbiddenError("That order item does not exist.");

  const actor = resolveActor(user, {
    sellerUserId: item.seller.userId,
    buyerId: item.order.buyerId,
  });

  const verdict = canTransition({
    from: item.status,
    to,
    fulfilmentType: item.fulfilmentType,
    actor,
  });

  if (!verdict.ok) throw new ForbiddenError(verdict.reason);

  await db.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: orderItemId },
      data: {
        status: to,
        ...(options.trackingNumber ? { trackingNumber: options.trackingNumber } : {}),
      },
    });

    await tx.orderItemEvent.create({
      data: {
        orderItemId,
        status: to,
        note: options.note || null,
        createdById: user.id,
      },
    });

    // Delivered: the seller's pending earnings become withdrawable.
    if (to === "DELIVERED") {
      await tx.sellerBalance.updateMany({
        where: { sellerId: item.sellerId },
        data: {
          pendingIdr: { decrement: item.sellerEarningsIdr },
          availableIdr: { increment: item.sellerEarningsIdr },
        },
      });
    }

    // Cancelled or refunded after payment: give the stock back and reverse the
    // pending credit so a seller is not paid for an undelivered item.
    if (to === "CANCELLED" || to === "REFUNDED") {
      if (item.fulfilmentType === "SELLER_STOCKED") {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.qty } },
        });
      }
      if (item.order.paymentStatus === "PAID") {
        await tx.sellerBalance.updateMany({
          where: { sellerId: item.sellerId },
          data: { pendingIdr: { decrement: item.sellerEarningsIdr } },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: `order.item.${to.toLowerCase()}`,
        entity: "OrderItem",
        entityId: orderItemId,
        metadata: { from: item.status, to, actor },
      },
    });
  });
}

/**
 * Work out what role the current user plays for THIS item.
 *
 * Admin wins, then the owning seller, then the buyer. Anyone else is rejected
 * outright rather than being handed a weaker role.
 */
function resolveActor(
  user: CurrentUser,
  item: { sellerUserId: string; buyerId: string },
): Actor {
  if (user.role === "ADMIN") return "ADMIN";
  if (user.id === item.sellerUserId) return "SELLER";
  if (user.id === item.buyerId) return "BUYER";
  throw new ForbiddenError("That order is not yours.");
}
