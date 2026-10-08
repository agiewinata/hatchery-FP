"use client";

/**
 * Read-only view of a saved design.
 *
 * Used on the public share page, where there is nothing to edit. It rebuilds
 * the mesh from the stored outline and parameters - the same deterministic
 * pipeline the editor runs - which is why a shared link renders identically
 * for a stranger without the original image existing anywhere.
 */
import dynamic from "next/dynamic";
import { useCallback, useMemo } from "react";

import { buildGeometry } from "@/lib/studio/geometry";
import { stlByteLength, toBinaryStl, triangleCount } from "@/lib/studio/stl";
import { toGeometryParams, type StudioParams } from "@/lib/studio/templates";
import type { Outline } from "@/lib/studio/types";

const ModelViewer = dynamic(() => import("./model-viewer"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-80 w-full place-items-center rounded-lg bg-paper text-sm text-muted-foreground ring-1 ring-border">
      Loading the 3D preview...
    </div>
  ),
});

export function DesignPreview({
  outline,
  params,
  title,
}: {
  outline: Outline;
  params: StudioParams;
  title: string;
}) {
  const built = useMemo(() => {
    try {
      return { mesh: buildGeometry(outline, toGeometryParams(params)), error: null };
    } catch (error) {
      return {
        mesh: null,
        error: error instanceof Error ? error.message : "This design could not be rebuilt.",
      };
    }
  }, [outline, params]);

  const download = useCallback(() => {
    if (!built.mesh) return;

    const blob = new Blob([toBinaryStl(built.mesh, "Keychain Studio")], { type: "model/stl" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(title || "design").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.stl`;
    anchor.click();

    URL.revokeObjectURL(url);
  }, [built.mesh, title]);

  if (!built.mesh) {
    return (
      <div className="grid h-80 place-items-center rounded-lg border border-dashed border-border bg-paper/50 px-6 text-center text-sm text-muted-foreground">
        {built.error ?? "This design could not be rebuilt."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[28rem]">
        <ModelViewer mesh={built.mesh} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <div className="flex gap-1.5">
            <dt>Size</dt>
            <dd className="tabular text-foreground">
              {params.widthMm} mm wide &times; {params.thicknessMm} mm thick
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Triangles</dt>
            <dd className="tabular text-foreground">{triangleCount(built.mesh)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>STL</dt>
            <dd className="tabular text-foreground">
              {(stlByteLength(built.mesh) / 1024).toFixed(0)} KB
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={download}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Download STL
        </button>
      </div>
    </div>
  );
}
