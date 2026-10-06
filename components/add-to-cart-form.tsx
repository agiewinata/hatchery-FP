"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addToCartAction } from "@/lib/actions/cart";
import { idleState } from "@/lib/actions/result";
import { MAX_QTY_PER_ITEM } from "@/lib/money";

/**
 * Add to cart.
 *
 * `max` here is a convenience for the person using the form, not a limit: the
 * server re-checks stock in addToCart(), because any input element can be
 * edited in devtools.
 */
export function AddToCartForm({
  productId,
  maxQty,
}: {
  productId: string;
  maxQty?: number;
}) {
  const [state, action] = useActionState(addToCartAction, idleState);
  const max = Math.min(maxQty ?? MAX_QTY_PER_ITEM, MAX_QTY_PER_ITEM);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />

      <div className="flex items-end gap-3">
        <div className="w-20 space-y-1.5">
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            name="qty"
            type="number"
            min={1}
            max={max}
            defaultValue={1}
            className="bg-paper tabular"
          />
        </div>

        <SubmitButton size="lg" pendingLabel="Adding...">
          Add to cart
        </SubmitButton>
      </div>

      <FormMessage state={state} />
    </form>
  );
}
