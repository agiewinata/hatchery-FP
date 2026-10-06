"use client";

import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { setSellerApprovalAction } from "@/lib/actions/admin";
import { idleState } from "@/lib/actions/result";

/**
 * Approve or suspend a seller.
 *
 * `canApprove` only controls what is rendered. setSellerApproval() re-checks
 * that the seller has a confirmed email address, so posting this form directly
 * cannot approve an unreachable shop.
 */
export function SellerApprovalForm({
  sellerId,
  isApproved,
  canApprove,
}: {
  sellerId: string;
  isApproved: boolean;
  canApprove: boolean;
}) {
  const [state, action] = useActionState(setSellerApprovalAction, idleState);

  if (!isApproved && !canApprove) {
    return <span className="text-xs text-muted-foreground">Waiting on email confirmation</span>;
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="sellerId" value={sellerId} />
      <input type="hidden" name="isApproved" value={isApproved ? "false" : "true"} />

      <SubmitButton variant={isApproved ? "ghost" : "default"} size="sm" pendingLabel="Saving...">
        {isApproved ? "Suspend" : "Approve"}
      </SubmitButton>

      <FormMessage state={state} />
    </form>
  );
}
