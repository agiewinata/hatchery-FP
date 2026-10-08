"use client";

/**
 * Share, unshare, delete, and admin takedown.
 *
 * Each is a form posting to a Server Action, never a link: these are mutations,
 * and a mutation on a GET can be triggered by a prefetch or an <img> tag. Same
 * reasoning as SignOutButton.
 *
 * What is rendered here is a convenience only. Every one of these actions
 * re-checks ownership (or admin) inside lib/data/studio.ts, so hiding a button
 * is never what keeps someone out.
 */
import { useActionState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { idleState } from "@/lib/actions/result";
import {
  deleteDesignAction,
  setDesignVisibilityAction,
  unpublishDesignAction,
} from "@/lib/actions/studio";

export function ShareToggle({
  designId,
  isPublic,
  shareUrl,
}: {
  designId: string;
  isPublic: boolean;
  shareUrl: string;
}) {
  const [state, action] = useActionState(setDesignVisibilityAction, idleState);

  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="designId" value={designId} />
        <input type="hidden" name="visibility" value={isPublic ? "PRIVATE" : "PUBLIC"} />

        <SubmitButton variant={isPublic ? "outline" : "default"} size="sm" pendingLabel="Saving...">
          {isPublic ? "Stop sharing" : "Share with a link"}
        </SubmitButton>

        <p className="text-xs text-muted-foreground">
          {isPublic
            ? "Anyone with the link can view and download this."
            : "Only you can see this design."}
        </p>
      </form>

      {isPublic && (
        <p className="truncate rounded-md bg-secondary px-3 py-2 font-mono text-xs">{shareUrl}</p>
      )}

      <FormMessage state={state} />
    </div>
  );
}

export function DeleteDesign({ designId }: { designId: string }) {
  const [state, action] = useActionState(deleteDesignAction, idleState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="designId" value={designId} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="Deleting...">
        Delete this design
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function UnpublishDesign({ designId }: { designId: string }) {
  const [state, action] = useActionState(unpublishDesignAction, idleState);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="designId" value={designId} />
      <SubmitButton variant="outline" size="sm" pendingLabel="Removing...">
        Unpublish
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
