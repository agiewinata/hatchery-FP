"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/form";
import { simulatePaymentAction } from "@/lib/actions/dev-pay";
import { idleState } from "@/lib/actions/result";

export function SimulatePaymentForm({ orderNumber }: { orderNumber: string }) {
  const [state, action] = useActionState(simulatePaymentAction, idleState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderNumber" value={orderNumber} />

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          name="outcome"
          value="PAID"
          className="h-10 w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Pay now
        </button>

        {/* A second submit button with its own value, so one form covers both. */}
        <button
          type="submit"
          name="outcome"
          value="EXPIRED"
          className="text-sm text-muted-foreground underline hover:text-destructive"
        >
          Simulate a failed payment instead
        </button>
      </div>

      <FormMessage state={state} />
    </form>
  );
}
