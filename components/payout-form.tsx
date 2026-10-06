"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { idleState } from "@/lib/actions/result";
import { requestPayoutAction } from "@/lib/actions/seller";
import { formatIdr } from "@/lib/money";

/**
 * Request a payout.
 *
 * `max` is a hint only. requestPayoutAction re-reads the balance server-side,
 * because the amount a seller may withdraw is not theirs to assert.
 */
export function PayoutForm({ available }: { available: number }) {
  const [state, action] = useActionState(requestPayoutAction, idleState);

  if (available < 50_000) {
    return (
      <p className="text-sm text-muted-foreground">
        You can request a payout once your available balance reaches {formatIdr(50_000)}.
      </p>
    );
  }

  return (
    <form action={action} className="max-w-md space-y-4">
      <Field
        name="amountIdr"
        label="Amount"
        hint={`Up to ${formatIdr(available)}.`}
        state={state}
      >
        {(props) => (
          <Input
            {...props}
            type="number"
            min={50_000}
            max={available}
            step={1000}
            defaultValue={available}
            required
            className="bg-paper tabular"
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="bankName" label="Bank" state={state}>
          {(props) => <Input {...props} required placeholder="BCA" className="bg-paper" />}
        </Field>

        <Field name="bankAccount" label="Account number" state={state}>
          {(props) => (
            <Input {...props} required inputMode="numeric" className="bg-paper tabular" />
          )}
        </Field>
      </div>

      <FormMessage state={state} />

      <SubmitButton pendingLabel="Requesting...">Request payout</SubmitButton>
    </form>
  );
}
