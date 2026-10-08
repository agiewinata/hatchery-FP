import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteDesign, ShareToggle } from "@/components/studio/design-controls";
import { StudioEditor } from "@/components/studio/studio-editor";
import { getOwnDesign } from "@/lib/data/studio";
import { env } from "@/lib/env";

export const metadata = { title: "Edit design" };

/**
 * Edit a saved design.
 *
 * getOwnDesign() scopes its query by the session's user id, so another
 * person's design id returns null and becomes a 404 rather than revealing that
 * it exists - the same shape as the seller product editor.
 */
export default async function EditDesignPage({
  params,
}: PageProps<"/studio/designs/[id]">) {
  const { id } = await params;

  const design = await getOwnDesign(id);
  if (!design) notFound();

  const shareUrl = new URL(`/designs/${design.slug}`, env.BETTER_AUTH_URL).toString();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/studio/designs" className="underline hover:text-enamel">
            All designs
          </Link>
        </p>
        {/* Plain text, deliberately: titles are never rendered as markup. */}
        <h1 className="font-display mt-1 text-3xl font-bold">{design.title}</h1>
      </div>

      <StudioEditor
        initialDesign={{
          id: design.id,
          title: design.title,
          outline: design.outline,
          params: design.params,
        }}
      />

      <section className="space-y-5 border-t border-border/70 pt-6">
        <h2 className="font-display text-lg font-semibold">Sharing</h2>
        <ShareToggle
          designId={design.id}
          isPublic={design.visibility === "PUBLIC"}
          shareUrl={shareUrl}
        />
        <DeleteDesign designId={design.id} />
      </section>
    </div>
  );
}
