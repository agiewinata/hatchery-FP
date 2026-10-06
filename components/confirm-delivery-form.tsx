"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { advanceOrderItemAction } from "@/lib/actions/seller";
import { idleState } from "@/lib/actions/result";

/**
 * Lets a buyer confirm receipt.
 *
 * The state machine permits BUYER -> DELIVERED only from SHIPPED, and the
 * action derives the actor from the session, so this button cannot be reused
 * to advance anything else or to touch somebody else's order.
 */
export function ConfirmDeliveryForm({ orderItemId }: { orderItemId: string }) {
  const [state, action] = useActionState(advanceOrderItemAction, idleState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <input type="hidden" name="to" value="DELIVERED" />
      <input type="hidden" name="note" value="Buyer confirmed delivery." />

      <p className="flex-1 text-sm text-muted-foreground">Has this arrived?</p>

      <SubmitButton variant="outline" size="sm" pendingLabel="Confirming...">
        Yes, it arrived
      </SubmitButton>

      <FormMessage state={state} />
    </form>
  );
}
