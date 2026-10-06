"use client";

import { useActionState, useState } from "react";

import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleState } from "@/lib/actions/result";
import { createProductAction, updateProductAction } from "@/lib/actions/seller";
import { PRODUCT_CATEGORIES } from "@/lib/validation/product";

const CATEGORY_LABELS: Record<(typeof PRODUCT_CATEGORIES)[number], string> = {
  KEYCHAIN: "Keychain / acrylic charm",
  ENAMEL_PIN: "Enamel pin",
  STICKER: "Stickers",
  ACRYLIC_STAND: "Acrylic standee",
  POSTER: "Print / poster",
  MEMORABILIA: "Memorabilia",
  OTHER: "Something else",
};

export interface ProductFormDefaults {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: (typeof PRODUCT_CATEGORIES)[number];
  priceIdr: number;
  fulfilmentType: "PRINT_ON_DEMAND" | "SELLER_STOCKED";
  artworkUrl: string | null;
  stockQty: number | null;
}

/** Uploads one image and reports back the URL our own endpoint returned. */
function ImageUploadField({
  label,
  hint,
  name,
  defaultValue,
}: {
  label: string;
  hint: string;
  name: string;
  defaultValue?: string | null;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${name}-file`}>{label}</Label>

      {/* The real value submitted with the form - set only by a successful upload. */}
      <input type="hidden" name={name} value={url} />

      <Input
        id={`${name}-file`}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={busy}
        className="bg-paper"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;

          setBusy(true);
          setStatus("Uploading...");

          const body = new FormData();
          body.set("file", file);
          body.set("prefix", "products");

          const response = await fetch("/api/upload", { method: "POST", body });
          const data = (await response.json()) as { url?: string; error?: string };

          setBusy(false);

          if (!response.ok || !data.url) {
            // The server validates by magic bytes, so this is where a renamed
            // .exe or an SVG gets reported back.
            setStatus(data.error ?? "That upload was rejected.");
            return;
          }

          setUrl(data.url);
          setStatus("Uploaded.");
        }}
      />

      <p className="text-xs text-muted-foreground">{hint}</p>

      {status && (
        <p className="text-xs" role="status">
          {status}
        </p>
      )}

      {url && (
        <p className="truncate text-xs text-muted-foreground">
          Current file: <span className="font-mono">{url}</span>
        </p>
      )}
    </div>
  );
}

export function ProductForm({ defaults }: { defaults?: ProductFormDefaults }) {
  const [state, action] = useActionState(
    defaults ? updateProductAction : createProductAction,
    idleState,
  );

  // Drives which fields are shown. The server enforces the same rule in
  // productInputSchema, so this is presentation only.
  const [fulfilment, setFulfilment] = useState<"PRINT_ON_DEMAND" | "SELLER_STOCKED">(
    defaults?.fulfilmentType ?? "PRINT_ON_DEMAND",
  );

  return (
    <form action={action} className="max-w-xl space-y-5">
      {defaults && <input type="hidden" name="productId" value={defaults.id} />}

      <Field name="title" label="Title" state={state}>
        {(props) => (
          <Input {...props} defaultValue={defaults?.title ?? ""} required className="bg-paper" />
        )}
      </Field>

      <Field
        name="slug"
        label="Web address (optional)"
        hint="Leave blank and we will make one from the title."
        state={state}
      >
        {(props) => (
          <Input {...props} defaultValue={defaults?.slug ?? ""} className="bg-paper" />
        )}
      </Field>

      <Field
        name="description"
        label="Description"
        hint="Size, material, finish, how it ships. Plain text."
        state={state}
      >
        {(props) => (
          <Textarea
            {...props}
            defaultValue={defaults?.description ?? ""}
            rows={6}
            required
            className="bg-paper"
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="category" label="Category" state={state}>
          {(props) => (
            <select
              {...props}
              defaultValue={defaults?.category ?? "KEYCHAIN"}
              className="h-9 w-full rounded-md border border-input bg-paper px-3 text-sm"
            >
              {PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field name="priceIdr" label="Price (Rp)" hint="Whole rupiah." state={state}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1000}
              step={1000}
              defaultValue={defaults?.priceIdr ?? ""}
              required
              className="bg-paper tabular"
            />
          )}
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How does it reach the buyer?</legend>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-paper p-3">
          <input
            type="radio"
            name="fulfilmentType"
            value="PRINT_ON_DEMAND"
            checked={fulfilment === "PRINT_ON_DEMAND"}
            onChange={() => setFulfilment("PRINT_ON_DEMAND")}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">We print and ship it</span>
            <span className="block text-muted-foreground">
              Upload your artwork. We produce it per order and post it. You earn a royalty and hold
              no stock.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-paper p-3">
          <input
            type="radio"
            name="fulfilmentType"
            value="SELLER_STOCKED"
            checked={fulfilment === "SELLER_STOCKED"}
            onChange={() => setFulfilment("SELLER_STOCKED")}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">You ship it yourself</span>
            <span className="block text-muted-foreground">
              You hold the stock and post each order. We tell you when one comes in.
            </span>
          </span>
        </label>
      </fieldset>

      {fulfilment === "PRINT_ON_DEMAND" ? (
        <ImageUploadField
          name="artworkUrl"
          label="Artwork to print"
          hint="PNG, JPEG, WebP or GIF, up to 5MB. SVG files are not accepted."
          defaultValue={defaults?.artworkUrl}
        />
      ) : (
        <Field name="stockQty" label="Units in stock" state={state}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={0}
              defaultValue={defaults?.stockQty ?? 0}
              required
              className="max-w-32 bg-paper tabular"
            />
          )}
        </Field>
      )}

      <FormMessage state={state} />

      <SubmitButton pendingLabel="Saving...">
        {defaults ? "Save changes" : "Save as draft"}
      </SubmitButton>
    </form>
  );
}
