"use client";

/**
 * The studio.
 *
 * Holds all editor state and runs the pure pipeline from lib/studio on every
 * change. Nothing here does maths of its own - that all lives in tested pure
 * modules - so this file is state, layout and wiring only.
 *
 * It works in two modes, and the distinction is the whole point of saving an
 * OUTLINE rather than an image: a new design traces its outline from an
 * uploaded picture, while an existing one arrives with its outline already in
 * hand and needs no picture at all. Both paths converge on the same geometry.
 *
 * Three.js reaches the browser exclusively through the dynamic import below.
 * Importing ModelViewer normally would pull ~600KB into the shared client
 * bundle and slow every storefront page, and Three cannot server-render. Per
 * Next's lazy-loading guide, `ssr: false` only works inside a Client
 * Component, which is why the import sits here rather than in page.tsx.
 */
import dynamic from "next/dynamic";
import { useActionState, useCallback, useMemo, useState } from "react";

import { FormMessage, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/actions/result";
import { saveDesignAction, updateDesignAction } from "@/lib/actions/studio";
import { largestOutline } from "@/lib/studio/contour";
import { buildGeometry, type GeometryParams } from "@/lib/studio/geometry";
import { buildMask, coverage } from "@/lib/studio/mask";
import { simplifyOutline } from "@/lib/studio/simplify";
import { stlByteLength, toBinaryStl, triangleCount } from "@/lib/studio/stl";
import {
  checkPrintability,
  DEFAULT_PARAMS,
  HOLE_POSITIONS,
  PRINT_LIMITS,
  TEMPLATES,
  toGeometryParams,
  type StudioParams,
  type TemplateId,
} from "@/lib/studio/templates";
import type { Mesh, Outline } from "@/lib/studio/types";

import { decodeImageFile, ImageDecodeError, type DecodedImage } from "./decode-image";

const ModelViewer = dynamic(() => import("./model-viewer"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-80 w-full place-items-center rounded-lg bg-paper text-sm text-muted-foreground ring-1 ring-border">
      Loading the 3D preview...
    </div>
  ),
});

export interface InitialDesign {
  id: string;
  title: string;
  outline: Outline;
  params: StudioParams;
}

/** A labelled range with a live numeric readout, keyboard-operable throughout. */
function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground tabular">
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full accent-enamel"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border/70 pt-5 first:border-0 first:pt-0">
      <h2 className="font-display text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function StudioEditor({ initialDesign }: { initialDesign?: InitialDesign }) {
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [fileName, setFileName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** The outline a saved design arrived with. Replaced if a new image is traced. */
  const [storedOutline] = useState<Outline | null>(initialDesign?.outline ?? null);

  const [title, setTitle] = useState(initialDesign?.title ?? "");

  // Trace controls
  const [threshold, setThreshold] = useState(128);
  const [invert, setInvert] = useState(false);
  const [minAreaPx, setMinAreaPx] = useState(32);
  const [tolerance, setTolerance] = useState(1);

  const [params, setParams] = useState<StudioParams>(
    initialDesign?.params ?? DEFAULT_PARAMS["keychain-tag"],
  );

  const [saveState, saveAction] = useActionState(
    initialDesign ? updateDesignAction : saveDesignAction,
    idleState,
  );

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setLoadError(null);

    try {
      setImage(await decodeImageFile(file));
      setFileName(file.name);
    } catch (error) {
      setImage(null);
      setLoadError(
        error instanceof ImageDecodeError ? error.message : "That image could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // --- The pipeline, re-run as the controls move -------------------------

  const maskInfo = useMemo(() => {
    if (!image) return null;
    const mask = buildMask(image.data, image.width, image.height, {
      alphaThreshold: threshold,
      luminanceThreshold: threshold,
      invert,
    });
    return { mask, coverage: coverage(mask) };
  }, [image, threshold, invert]);

  const tracedOutline = useMemo<Outline | null>(() => {
    if (!maskInfo) return null;
    const traced = largestOutline(maskInfo.mask, { minAreaPx });
    if (!traced) return null;

    const simplified = simplifyOutline(traced, tolerance);
    return simplified.outer.length >= 3 ? simplified : null;
  }, [maskInfo, minAreaPx, tolerance]);

  // A freshly traced image wins; otherwise fall back to what was loaded.
  const outline = tracedOutline ?? storedOutline;

  const geometryParams: GeometryParams = useMemo(() => toGeometryParams(params), [params]);

  const built = useMemo<{ mesh: Mesh | null; error: string | null }>(() => {
    if (!outline) return { mesh: null, error: null };
    try {
      return { mesh: buildGeometry(outline, geometryParams), error: null };
    } catch (error) {
      // A degenerate outline rather than a bug. Keep the editor alive, say so.
      return {
        mesh: null,
        error: error instanceof Error ? error.message : "That shape could not be built.",
      };
    }
  }, [outline, geometryParams]);

  const issues = useMemo(
    () => (outline ? checkPrintability(outline, params) : []),
    [outline, params],
  );

  const pointCount = outline
    ? outline.outer.length + outline.holes.reduce((sum, h) => sum + h.length, 0)
    : 0;

  /** What the save action receives. Re-parsed server-side regardless. */
  const serialized = useMemo(
    () => (outline ? JSON.stringify({ title: title.trim(), outline, params }) : ""),
    [outline, title, params],
  );

  const exportStl = useCallback(() => {
    if (!built.mesh) return;

    const blob = new Blob([toBinaryStl(built.mesh, "Keychain Studio")], { type: "model/stl" });
    const url = URL.createObjectURL(blob);

    const base = title.trim() || fileName.replace(/\.[^.]+$/, "") || "charm";
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${base.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.stl`;
    anchor.click();

    URL.revokeObjectURL(url);
  }, [built.mesh, title, fileName]);

  const setShared = (patch: { widthMm?: number; thicknessMm?: number }) =>
    setParams((current) => ({ ...current, ...patch }));

  const switchTemplate = (templateId: TemplateId) =>
    setParams((current) => ({
      ...DEFAULT_PARAMS[templateId],
      // Carry size across, so picking a template does not undo sizing work.
      widthMm: current.widthMm,
      thicknessMm: current.thicknessMm,
    }));

  const heightMm = image
    ? (image.height / image.width) * params.widthMm
    : outline
      ? estimateHeightMm(outline, params.widthMm)
      : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      {/* Preview */}
      <div className="space-y-3">
        <div className="h-[28rem]">
          {built.mesh ? (
            <ModelViewer mesh={built.mesh} />
          ) : (
            <div className="grid h-full place-items-center rounded-lg border border-dashed border-border bg-paper/50 px-6 text-center">
              <div className="space-y-2">
                <p className="font-display text-lg font-semibold">
                  {image ? "Nothing to extrude yet" : "Start with an image"}
                </p>
                <p className="measure text-sm text-muted-foreground">
                  {built.error ??
                    (image
                      ? "No shape was found. Try moving the threshold, or invert it if your artwork is light on a dark background."
                      : "A PNG with a transparent background works best. Dark artwork on white paper works too.")}
                </p>
              </div>
            </div>
          )}
        </div>

        {built.mesh && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt>Size</dt>
              <dd className="tabular text-foreground">
                {params.widthMm.toFixed(0)} &times; {heightMm.toFixed(0)} &times;{" "}
                {params.thicknessMm.toFixed(1)} mm
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Triangles</dt>
              <dd className="tabular text-foreground">{triangleCount(built.mesh)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Outline points</dt>
              <dd className="tabular text-foreground">{pointCount}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>STL</dt>
              <dd className="tabular text-foreground">
                {(stlByteLength(built.mesh) / 1024).toFixed(0)} KB
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-6">
        <Section title="Artwork">
          <div className="space-y-1.5">
            <Label htmlFor="artwork">{initialDesign ? "Replace the outline" : "Image"}</Label>
            <Input
              id="artwork"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={busy}
              className="bg-paper"
              onChange={(event) => void onFile(event.currentTarget.files?.[0])}
            />
            <p className="text-xs text-muted-foreground">
              {initialDesign
                ? "This design already has an outline. Upload only to trace a new one."
                : "Stays in your browser. Nothing is uploaded."}
            </p>
          </div>

          {loadError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          )}
        </Section>

        {image && (
          <Section title="Trace">
            <Slider
              id="threshold"
              label="Threshold"
              value={threshold}
              min={1}
              max={254}
              hint={
                maskInfo
                  ? `${(maskInfo.coverage * 100).toFixed(0)}% of the image is being treated as shape.`
                  : undefined
              }
              onChange={setThreshold}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={invert}
                onChange={(event) => setInvert(event.currentTarget.checked)}
                className="accent-enamel"
              />
              Light artwork on a dark background
            </label>

            <Slider
              id="tolerance"
              label="Smoothing"
              value={tolerance}
              min={0}
              max={6}
              step={0.25}
              hint="Higher drops more outline points. Too high and corners round off."
              onChange={setTolerance}
            />

            <Slider
              id="minArea"
              label="Ignore specks below"
              value={minAreaPx}
              min={0}
              max={400}
              step={8}
              unit=" px"
              hint="Drops stray marks so they do not become separate pieces."
              onChange={setMinAreaPx}
            />
          </Section>
        )}

        <Section title="Template">
          <div className="space-y-2">
            {TEMPLATES.map((template) => (
              <label
                key={template.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-paper p-3"
              >
                <input
                  type="radio"
                  name="templateId"
                  value={template.id}
                  checked={params.templateId === template.id}
                  onChange={() => switchTemplate(template.id)}
                  className="mt-1 accent-enamel"
                />
                <span className="text-sm">
                  <span className="font-medium">{template.label}</span>
                  <span className="block text-muted-foreground">{template.description}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Size">
          <Slider
            id="widthMm"
            label="Width"
            value={params.widthMm}
            min={PRINT_LIMITS.minWidthMm}
            max={PRINT_LIMITS.maxWidthMm}
            unit=" mm"
            onChange={(widthMm) => setShared({ widthMm })}
          />
          <Slider
            id="thicknessMm"
            label="Thickness"
            value={params.thicknessMm}
            min={0.4}
            max={PRINT_LIMITS.maxThicknessMm}
            step={0.2}
            unit=" mm"
            onChange={(thicknessMm) => setShared({ thicknessMm })}
          />

          {params.templateId === "keychain-tag" && (
            <>
              <Slider
                id="holeDiameterMm"
                label="Keyring hole"
                value={params.holeDiameterMm}
                min={1}
                max={12}
                step={0.5}
                unit=" mm"
                onChange={(holeDiameterMm) =>
                  setParams((current) =>
                    current.templateId === "keychain-tag" ? { ...current, holeDiameterMm } : current,
                  )
                }
              />
              <Slider
                id="holeInsetMm"
                label="Hole inset"
                value={params.holeInsetMm}
                min={1}
                max={30}
                step={0.5}
                unit=" mm"
                onChange={(holeInsetMm) =>
                  setParams((current) =>
                    current.templateId === "keychain-tag" ? { ...current, holeInsetMm } : current,
                  )
                }
              />

              <div className="space-y-1.5">
                <Label htmlFor="holePosition">Hole position</Label>
                <select
                  id="holePosition"
                  value={params.holePosition}
                  onChange={(event) =>
                    setParams((current) =>
                      current.templateId === "keychain-tag"
                        ? {
                            ...current,
                            holePosition: event.currentTarget.value as typeof current.holePosition,
                          }
                        : current,
                    )
                  }
                  className="h-9 w-full rounded-md border border-input bg-paper px-3 text-sm"
                >
                  {HOLE_POSITIONS.map((position) => (
                    <option key={position} value={position}>
                      {position.replace("-", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </Section>

        {issues.length > 0 && (
          <div role="status" className="space-y-1 rounded-md bg-secondary px-3 py-2 text-sm">
            <p className="font-medium">Before you print</p>
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        <Section title="Keep it">
          <form action={saveAction} className="space-y-3">
            {initialDesign && <input type="hidden" name="designId" value={initialDesign.id} />}
            <input type="hidden" name="design" value={serialized} />

            <div className="space-y-1.5">
              <Label htmlFor="title">Name</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="Sleeping fox charm"
                maxLength={80}
                className="bg-paper"
              />
            </div>

            <FormMessage state={saveState} />

            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingLabel="Saving...">
                {initialDesign ? "Save changes" : "Save design"}
              </SubmitButton>

              <button
                type="button"
                onClick={exportStl}
                disabled={!built.mesh}
                className="inline-flex h-9 items-center rounded-md border border-input bg-paper px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50"
              >
                Download STL
              </button>
            </div>

            {!outline && (
              <p className="text-xs text-muted-foreground">
                Trace an image before saving.
              </p>
            )}
          </form>
        </Section>
      </div>
    </div>
  );
}

/** Height implied by a stored outline, for the size readout when no image is loaded. */
function estimateHeightMm(outline: Outline, widthMm: number): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [x, y] of outline.outer) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const width = maxX - minX;
  return width > 0 ? ((maxY - minY) / width) * widthMm : 0;
}
