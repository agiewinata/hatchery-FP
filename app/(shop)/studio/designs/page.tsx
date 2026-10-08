import Link from "next/link";

import { EmptyState } from "@/components/storefront";
import { Button } from "@/components/ui/button";
import { listOwnDesigns } from "@/lib/data/studio";
import { MAX_DESIGNS_PER_USER } from "@/lib/validation/studio";

export const metadata = { title: "Your designs" };

const TEMPLATE_LABELS: Record<string, string> = {
  "flat-charm": "Flat charm",
  "keychain-tag": "Keychain tag",
};

/**
 * The maker's own designs.
 *
 * listOwnDesigns() scopes by the session's user id, so this cannot return
 * anyone else's work regardless of what the request contains.
 */
export default async function StudioDesignsPage() {
  const designs = await listOwnDesigns();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Your designs</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {designs.length} of {MAX_DESIGNS_PER_USER} saved
          </p>
        </div>
        <Button asChild>
          <Link href="/studio">New design</Link>
        </Button>
      </header>

      {designs.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          action={
            <Button asChild>
              <Link href="/studio">Open the studio</Link>
            </Button>
          }
        >
          Trace an image into a 3D model and save it here to come back to it later.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border/70 border-y border-border/70">
          {designs.map((design) => (
            <li key={design.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-48 flex-1">
                {/* Plain text: titles are user-authored and never rendered as markup. */}
                <Link
                  href={`/studio/designs/${design.id}`}
                  className="font-medium hover:text-enamel"
                >
                  {design.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {TEMPLATE_LABELS[design.templateId] ?? design.templateId}
                  {" · edited "}
                  {design.updatedAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              <span
                className={
                  design.visibility === "PUBLIC"
                    ? "rounded-full bg-ink px-2.5 py-0.5 text-xs text-primary-foreground"
                    : "rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                }
              >
                {design.visibility === "PUBLIC" ? "Shared" : "Private"}
              </span>

              <div className="flex items-center gap-2">
                {design.visibility === "PUBLIC" && (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/designs/${design.slug}`}>View link</Link>
                  </Button>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/studio/designs/${design.id}`}>Edit</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
