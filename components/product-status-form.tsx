"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/form";
import { idleState } from "@/lib/actions/result";
import { setProductStatusAction } from "@/lib/actions/seller";

/**
 * Publish / unpublish a listing.
 *
 * `canPublish` only hides the button. setProductStatus() re-checks approval
 * server-side, so an unapproved seller who posts the form directly is still
 * refused.
 */
export function ProductStatusForm({
  productId,
  status,
  canPublish,
}: {
  productId: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  canPublish: boolean;
}) {
  const [state, action] = useActionState(setProductStatusAction, idleState);

  const next = status === "ACTIVE" ? "DRAFT" : "ACTIVE";
  const label = status === "ACTIVE" ? "Unpublish" : "Publish";

  if (next === "ACTIVE" && !canPublish) {
    return (
      <span className="text-xs text-muted-foreground" title="Your shop is awaiting approval.">
        Not yet publishable
      </span>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="status" value={next} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="...">
        {label}
      </SubmitButton>
      {!state.ok && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
}
