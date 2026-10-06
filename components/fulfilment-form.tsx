"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { idleState } from "@/lib/actions/result";
import { advanceOrderItemAction } from "@/lib/actions/seller";

import type { OrderItemStatus } from "@/lib/generated/prisma/enums";

/**
 * Advance one order item to a named status.
 *
 * The target is a hidden field, but that is safe: canTransition() decides
 * whether this actor may make this exact move, and the actor is derived from
 * the session rather than the form. Forging the field yields a 403.
 */
export function AdvanceForm({
  orderItemId,
  to,
  label,
  withTracking = false,
}: {
  orderItemId: string;
  to: OrderItemStatus;
  label: string;
  withTracking?: boolean;
}) {
  const [state, action] = useActionState(advanceOrderItemAction, idleState);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <input type="hidden" name="to" value={to} />

      {withTracking && (
        <Input
          name="trackingNumber"
          placeholder="Tracking number (optional)"
          className="w-52 bg-paper"
          aria-label="Tracking number"
        />
      )}

      <SubmitButton size="sm" pendingLabel="Saving...">
        {label}
      </SubmitButton>

      <FormMessage state={state} />
    </form>
  );
}
