"use client";

import { useActionState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { idleState } from "@/lib/actions/result";
import { saveSellerProfileAction } from "@/lib/actions/seller";

export interface SellerProfileDefaults {
  slug: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  instagram: string | null;
}

export function SellerProfileForm({
  defaults,
  submitLabel,
}: {
  defaults?: SellerProfileDefaults;
  submitLabel: string;
}) {
  const [state, action] = useActionState(saveSellerProfileAction, idleState);

  return (
    <form action={action} className="max-w-xl space-y-5">
      <Field
        name="displayName"
        label="Shop name"
        hint="The name buyers will see on your work."
        state={state}
      >
        {(props) => (
          <Input
            {...props}
            defaultValue={defaults?.displayName ?? ""}
            required
            className="bg-paper"
          />
        )}
      </Field>

      <Field
        name="slug"
        label="Your handle"
        hint="Your page will be at /sellers/your-handle. Lowercase letters, numbers and hyphens."
        state={state}
      >
        {(props) => (
          <Input
            {...props}
            defaultValue={defaults?.slug ?? ""}
            required
            placeholder="mira-santoso"
            className="bg-paper"
          />
        )}
      </Field>

      <Field
        name="bio"
        label="About you"
        hint="Plain text. Tell buyers what you make and how you make it."
        state={state}
      >
        {(props) => (
          <Textarea {...props} defaultValue={defaults?.bio ?? ""} rows={5} className="bg-paper" />
        )}
      </Field>

      <Field name="location" label="Where you are (optional)" state={state}>
        {(props) => (
          <Input
            {...props}
            defaultValue={defaults?.location ?? ""}
            placeholder="Bandung, Indonesia"
            className="bg-paper"
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="websiteUrl" label="Website (optional)" state={state}>
          {(props) => (
            <Input
              {...props}
              type="url"
              defaultValue={defaults?.websiteUrl ?? ""}
              placeholder="https://"
              className="bg-paper"
            />
          )}
        </Field>

        <Field name="instagram" label="Instagram (optional)" hint="Just the handle." state={state}>
          {(props) => (
            <Input
              {...props}
              defaultValue={defaults?.instagram ?? ""}
              placeholder="yourhandle"
              className="bg-paper"
            />
          )}
        </Field>
      </div>

      <FormMessage state={state} />

      <SubmitButton pendingLabel="Saving...">{submitLabel}</SubmitButton>
    </form>
  );
}
