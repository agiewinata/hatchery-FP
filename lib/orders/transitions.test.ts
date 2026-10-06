import { describe, expect, it } from "vitest";

import {
  canTransition,
  flowFor,
  isTerminal,
  nextStatus,
  PRINT_ON_DEMAND_FLOW,
  SELLER_STOCKED_FLOW,
  statusAfterPayment,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  type Actor,
} from "./transitions";

import type { OrderItemStatus } from "@/lib/generated/prisma/enums";

const ALL_STATUSES: OrderItemStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "IN_PRODUCTION",
  "PRINTED",
  "PACKED",
  "AWAITING_SELLER_SHIPMENT",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

describe("happy path: print-on-demand", () => {
  it("walks the whole flow one step at a time", () => {
    for (let i = 0; i < PRINT_ON_DEMAND_FLOW.length - 1; i++) {
      const from = PRINT_ON_DEMAND_FLOW[i]!;
      const to = PRINT_ON_DEMAND_FLOW[i + 1]!;
      // SYSTEM is allowed everywhere a human is, for setup purposes; pick the
      // actor the step actually names.
      const actor: Actor = to === "PAID" ? "SYSTEM" : "ADMIN";
      expect(canTransition({ from, to, fulfilmentType: "PRINT_ON_DEMAND", actor }), `${from} -> ${to}`).toEqual({
        ok: true,
      });
    }
  });
});

describe("happy path: seller-stocked", () => {
  it("walks the whole flow one step at a time", () => {
    const actors: Actor[] = ["SYSTEM", "SYSTEM", "SELLER", "SELLER"];
    for (let i = 0; i < SELLER_STOCKED_FLOW.length - 1; i++) {
      const from = SELLER_STOCKED_FLOW[i]!;
      const to = SELLER_STOCKED_FLOW[i + 1]!;
      expect(
        canTransition({ from, to, fulfilmentType: "SELLER_STOCKED", actor: actors[i]! }),
        `${from} -> ${to}`,
      ).toEqual({ ok: true });
    }
  });
});

describe("only the payment webhook can mark an item paid", () => {
  it.each<Actor>(["ADMIN", "SELLER", "BUYER"])("rejects %s setting PAID", (actor) => {
    const result = canTransition({
      from: "PENDING_PAYMENT",
      to: "PAID",
      fulfilmentType: "PRINT_ON_DEMAND",
      actor,
    });
    expect(result.ok).toBe(false);
  });

  it("allows SYSTEM", () => {
    expect(
      canTransition({
        from: "PENDING_PAYMENT",
        to: "PAID",
        fulfilmentType: "PRINT_ON_DEMAND",
        actor: "SYSTEM",
      }).ok,
    ).toBe(true);
  });
});

describe("steps cannot be skipped", () => {
  it("refuses PAID -> SHIPPED for print-on-demand (would skip production)", () => {
    const result = canTransition({
      from: "PAID",
      to: "SHIPPED",
      fulfilmentType: "PRINT_ON_DEMAND",
      actor: "ADMIN",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/skip/i);
  });

  it("refuses PAID -> DELIVERED", () => {
    expect(
      canTransition({
        from: "PAID",
        to: "DELIVERED",
        fulfilmentType: "SELLER_STOCKED",
        actor: "ADMIN",
      }).ok,
    ).toBe(false);
  });
});

describe("orders cannot move backwards", () => {
  it("refuses SHIPPED -> PACKED", () => {
    const result = canTransition({
      from: "SHIPPED",
      to: "PACKED",
      fulfilmentType: "PRINT_ON_DEMAND",
      actor: "ADMIN",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/backwards/i);
  });
});

describe("terminal states are terminal", () => {
  it.each(TERMINAL_STATUSES)("nothing can leave %s", (from) => {
    for (const to of ALL_STATUSES) {
      if (to === from) continue;
      const result = canTransition({
        from,
        to,
        fulfilmentType: "PRINT_ON_DEMAND",
        actor: "ADMIN",
      });
      expect(result.ok, `${from} -> ${to} must be rejected`).toBe(false);
    }
  });
});

describe("fulfilment paths do not leak into each other", () => {
  it("a print-on-demand item cannot await seller shipment", () => {
    expect(
      canTransition({
        from: "PAID",
        to: "AWAITING_SELLER_SHIPMENT",
        fulfilmentType: "PRINT_ON_DEMAND",
        actor: "SYSTEM",
      }).ok,
    ).toBe(false);
  });

  it("a seller-stocked item cannot enter production", () => {
    expect(
      canTransition({
        from: "PAID",
        to: "IN_PRODUCTION",
        fulfilmentType: "SELLER_STOCKED",
        actor: "ADMIN",
      }).ok,
    ).toBe(false);
  });
});

describe("administrative exits", () => {
  it("admin may cancel an unpaid item", () => {
    expect(
      canTransition({
        from: "PENDING_PAYMENT",
        to: "CANCELLED",
        fulfilmentType: "PRINT_ON_DEMAND",
        actor: "ADMIN",
      }).ok,
    ).toBe(true);
  });

  it("a seller may not cancel", () => {
    expect(
      canTransition({
        from: "PAID",
        to: "CANCELLED",
        fulfilmentType: "SELLER_STOCKED",
        actor: "SELLER",
      }).ok,
    ).toBe(false);
  });

  it("refunding something never paid for is refused", () => {
    const result = canTransition({
      from: "PENDING_PAYMENT",
      to: "REFUNDED",
      fulfilmentType: "PRINT_ON_DEMAND",
      actor: "ADMIN",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/never paid/i);
  });

  it("refunding a paid item is allowed", () => {
    expect(
      canTransition({
        from: "SHIPPED",
        to: "REFUNDED",
        fulfilmentType: "PRINT_ON_DEMAND",
        actor: "ADMIN",
      }).ok,
    ).toBe(true);
  });
});

describe("a no-op is not a transition", () => {
  it("rejects from === to", () => {
    const result = canTransition({
      from: "PACKED",
      to: "PACKED",
      fulfilmentType: "PRINT_ON_DEMAND",
      actor: "ADMIN",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/already/i);
  });
});

describe("helpers", () => {
  it("statusAfterPayment branches on fulfilment type", () => {
    expect(statusAfterPayment("PRINT_ON_DEMAND")).toBe("PAID");
    expect(statusAfterPayment("SELLER_STOCKED")).toBe("AWAITING_SELLER_SHIPMENT");
  });

  it("nextStatus follows the flow and stops at the end", () => {
    expect(nextStatus("PAID", "PRINT_ON_DEMAND")).toBe("IN_PRODUCTION");
    expect(nextStatus("PAID", "SELLER_STOCKED")).toBe("AWAITING_SELLER_SHIPMENT");
    expect(nextStatus("DELIVERED", "PRINT_ON_DEMAND")).toBeNull();
    expect(nextStatus("CANCELLED", "SELLER_STOCKED")).toBeNull();
  });

  it("isTerminal agrees with TERMINAL_STATUSES", () => {
    for (const s of ALL_STATUSES) {
      expect(isTerminal(s)).toBe((TERMINAL_STATUSES as readonly OrderItemStatus[]).includes(s));
    }
  });

  it("flowFor returns the right path", () => {
    expect(flowFor("PRINT_ON_DEMAND")).toBe(PRINT_ON_DEMAND_FLOW);
    expect(flowFor("SELLER_STOCKED")).toBe(SELLER_STOCKED_FLOW);
  });

  it("every status has a human-readable label", () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_LABELS[s], s).toBeTruthy();
    }
  });
});
