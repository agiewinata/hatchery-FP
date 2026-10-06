"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { checkoutAction } from "@/lib/actions/checkout";
import { idleState } from "@/lib/actions/result";

/**
 * Checkout.
 *
 * The only thing this form sends is a shipping address. There is no price,
 * quantity or total field - deliberately. The server reads the cart and the
 * product table and computes the amount itself, so there is nothing here for
 * an attacker to tamper with.
 */
export function CheckoutForm({ payButtonLabel }: { payButtonLabel: string }) {
  const [state, action] = useActionState(checkoutAction, idleState);

  return (
    <form action={action} className="space-y-5">
      <Field name="recipient" label="Recipient name" state={state}>
        {(props) => <Input {...props} autoComplete="name" required className="bg-paper" />}
      </Field>

      <Field name="phone" label="Phone number" hint="So the courier can reach you." state={state}>
        {(props) => <Input {...props} type="tel" autoComplete="tel" required className="bg-paper" />}
      </Field>

      <Field name="line1" label="Address" state={state}>
        {(props) => (
          <Input {...props} autoComplete="address-line1" required className="bg-paper" />
        )}
      </Field>

      <Field name="line2" label="Apartment, unit (optional)" state={state}>
        {(props) => <Input {...props} autoComplete="address-line2" className="bg-paper" />}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="city" label="City" state={state}>
          {(props) => (
            <Input {...props} autoComplete="address-level2" required className="bg-paper" />
          )}
        </Field>

        <Field name="province" label="Province" state={state}>
          {(props) => (
            <Input {...props} autoComplete="address-level1" required className="bg-paper" />
          )}
        </Field>
      </div>

      <Field name="postalCode" label="Postal code" hint="Five digits." state={state}>
        {(props) => (
          <Input
            {...props}
            inputMode="numeric"
            autoComplete="postal-code"
            required
            className="max-w-32 bg-paper tabular"
          />
        )}
      </Field>

      <FormMessage state={state} />

      <SubmitButton size="lg" className="w-full" pendingLabel="Taking you to payment...">
        {payButtonLabel}
      </SubmitButton>
    </form>
  );
}
