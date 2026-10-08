import Link from "next/link";

import { EmptyState } from "@/components/storefront";
import { UnpublishDesign } from "@/components/studio/design-controls";
import { listPublicDesignsForReview } from "@/lib/data/studio";

export const metadata = { title: "Shared designs" };

/**
 * Moderation for publicly shared studio designs.
 *
 * Publishing user-authored content with no way to take it down is a gap, so
 * this exists even though the surface is small: titles are the only free text,
 * and no user imagery is stored at all.
 *
 * requireAdmin() runs inside listPublicDesignsForReview(). The admin layout
 * also gates this route, but that is for a clean UI - the DAL check is what
 * actually protects the action.
 */
export default async function AdminDesignsPage() {
  const designs = await listPublicDesignsForReview();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Shared designs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Designs their makers have published to a public link. Unpublishing hides the link and
          keeps the maker&apos;s work; nothing is deleted.
        </p>
      </div>

      {designs.length === 0 ? (
        <EmptyState title="Nothing shared yet">
          Designs appear here once a maker shares one with a link.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border/70 border-y border-border/70">
          {designs.map((design) => (
            <li key={design.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-48 flex-1">
                {/* Plain text: a title is user-authored. */}
                <Link href={`/designs/${design.slug}`} className="font-medium hover:text-enamel">
                  {design.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {design.user.email}
                  {" · "}
                  {design.createdAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              <UnpublishDesign designId={design.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
