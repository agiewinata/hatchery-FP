"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { ActionState } from "@/lib/actions/result";

/**
 * Submit button that disables itself while the action is in flight.
 *
 * Stops double submission, which on a checkout form would mean two orders and
 * two stock reservations.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant,
  size,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size}>
      {pending ? (pendingLabel ?? "Working...") : children}
    </Button>
  );
}

/**
 * Action feedback.
 *
 * `role="status"` for success and `role="alert"` for failure, so screen readers
 * announce the outcome rather than leaving it as a silent colour change.
 */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.ok && !state.message) return null;

  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        state.ok
          ? "bg-secondary text-secondary-foreground"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {state.ok ? state.message : state.error}
    </p>
  );
}

/**
 * One labelled field with its validation errors.
 *
 * Errors are tied to the input with aria-describedby and aria-invalid, so the
 * message is reachable rather than merely visible.
 */
export function Field({
  name,
  label,
  hint,
  state,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  state: ActionState;
  children: (props: {
    id: string;
    name: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const errors = state.ok ? undefined : state.fieldErrors?.[name];
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = errors?.length ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>

      {children({
        id: name,
        name,
        "aria-invalid": Boolean(errors?.length),
        "aria-describedby": describedBy,
      })}

      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      {errors?.length ? (
        <p id={errorId} className="text-xs text-destructive">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
