import Link from "next/link";
import { redirect } from "next/navigation";

import { StudioEditor } from "@/components/studio/studio-editor";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/auth";

export const metadata = {
  title: "Studio",
  description: "Turn a 2D image into a 3D model you can print.",
};

/**
 * The 3D studio.
 *
 * A real check in the page, not inherited from proxy.ts - the proxy redirects
 * signed-out visitors as a convenience, but that is UX and must never be the
 * thing access depends on.
 *
 * Note what this page does NOT do: there is no upload endpoint, no stored
 * image, and no database write. The artwork is decoded, traced and extruded
 * entirely in the browser, so the whole feature adds no new server-side
 * handling of user files.
 */
export default async function StudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/studio");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="font-display text-3xl font-bold">Studio</h1>
          <p className="measure mt-3 text-muted-foreground">
            Drop in a drawing and we will trace its outline and extrude it into a solid you can
            print. Pick a template, set the size, and download an STL.
          </p>
        </div>

        {/* Without this the saved-designs list is reachable only by typing its
            URL: the header links to the editor, and the editor linked nowhere. */}
        <Button asChild variant="outline">
          <Link href="/studio/designs">Your designs</Link>
        </Button>
      </div>

      <StudioEditor />
    </div>
  );
}
