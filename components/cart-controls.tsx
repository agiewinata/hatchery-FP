"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { removeFromCartAction, setCartQtyAction } from "@/lib/actions/cart";
import { idleState } from "@/lib/actions/result";
import { MAX_QTY_PER_ITEM } from "@/lib/money";

/** Change the quantity of one cart line. */
export function CartQtyForm({ productId, qty }: { productId: string; qty: number }) {
  const [state, action] = useActionState(setCartQtyAction, idleState);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <Input
        name="qty"
        type="number"
        min={0}
        max={MAX_QTY_PER_ITEM}
        defaultValue={qty}
        aria-label="Quantity"
        className="w-16 bg-paper tabular"
      />
      <SubmitButton variant="secondary" size="sm" pendingLabel="...">
        Update
      </SubmitButton>
      {!state.ok && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Remove a cart line. A form, because removal is a mutation. */
export function RemoveFromCartForm({ productId }: { productId: string }) {
  const [, action] = useActionState(removeFromCartAction, idleState);

  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="Removing...">
        Remove
      </SubmitButton>
    </form>
  );
}
