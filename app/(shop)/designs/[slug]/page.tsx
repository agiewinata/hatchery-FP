import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DesignPreview } from "@/components/studio/design-preview";
import { getPublicDesign } from "@/lib/data/studio";

export async function generateMetadata({ params }: PageProps<"/designs/[slug]">) {
  const { slug } = await params;
  const design = await getPublicDesign(slug);
  if (!design) return { title: "Not found" };

  return {
    title: design.title,
    description: `A 3D printable design made in the Keychain studio.`,
  };
}

/**
 * A shared design.
 *
 * PUBLIC on purpose, and deliberately NOT under /studio. Adding "/studio" to
 * PRIVATE_PREFIXES would otherwise send every shared link to the login page -
 * the same failure that once hid every artist portfolio, and in the same
 * hard-to-notice direction, because a login page looks like it is working.
 *
 * getPublicDesign() filters on visibility inside the query, so an unpublished
 * design cannot be reached by guessing a slug.
 */
export default async function SharedDesignPage({ params }: PageProps<"/designs/[slug]">) {
  const { slug } = await params;

  const design = await getPublicDesign(slug);
  if (!design) notFound();

  return (
    <div className="space-y-8">
      <header className="border-b border-border/70 pb-6">
        {/* Plain text. A shared page renders user-authored titles as text, never
            as markup - the same rule applied to seller bios. */}
        <h1 className="font-display text-3xl leading-tight font-bold">{design.title}</h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {/*
            Attribution shows a seller's chosen shop name or nothing at all.
            A plain buyer's account name is a real person's name, and they
            shared a shape, not their identity.
          */}
          {design.makerName && design.makerSlug ? (
            <>
              by{" "}
              <Link href={`/sellers/${design.makerSlug}`} className="underline hover:text-enamel">
                {design.makerName}
              </Link>
              {" · "}
            </>
          ) : null}
          Shared{" "}
          {design.createdAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      <DesignPreview outline={design.outline} params={design.params} title={design.title} />

      <section className="rounded-lg bg-paper p-6 ring-1 ring-border">
        <h2 className="font-display text-base font-semibold">Make your own</h2>
        <p className="measure mt-2 text-sm text-muted-foreground">
          Drop in a drawing and the studio traces its outline and extrudes it into a solid you can
          print. Nothing is uploaded - the tracing happens in your browser.
        </p>
        <Button asChild className="mt-4">
          <Link href="/studio">Open the studio</Link>
        </Button>
      </section>
    </div>
  );
}
