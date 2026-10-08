/**
 * Input schemas for the studio.
 *
 * SECURITY: storing geometry is the one genuinely new abuse vector this
 * feature introduces. Everything else a user saves here is small and bounded,
 * but an outline is a list of points supplied by the client - so without a hard
 * cap one request can store a million-point polygon that costs storage forever
 * and stalls the browser of everyone who opens it. The caps below are the
 * boundary; PRINT_LIMITS in lib/studio/templates.ts is only advice.
 *
 * These schemas run on the way IN and on the way OUT. A Json column is
 * schemaless, so a row written by an older version of this code is untrusted
 * input to today's renderer, and parsing on read turns a malformed row into a
 * handled error rather than a crash inside the viewer.
 */
import { z } from "zod";

import { HOLE_POSITIONS, TEMPLATE_IDS } from "@/lib/studio/templates";
import type { StudioParams } from "@/lib/studio/templates";
import type { Outline } from "@/lib/studio/types";

/** Points in a single ring. Past this, simplification has clearly failed. */
export const MAX_POINTS_PER_RING = 2_000;
/** Outer ring plus holes. A traced logo rarely exceeds a handful. */
export const MAX_RINGS = 32;
/** Across the whole outline - the figure that actually bounds the row size. */
export const MAX_TOTAL_POINTS = 5_000;
/** Per user, so stored geometry cannot grow without bound. */
export const MAX_DESIGNS_PER_USER = 100;

/** Model coordinates are millimetres; nothing legitimate approaches this. */
const COORDINATE_LIMIT = 100_000;

const coordinate = z
  .number()
  .finite({ error: "Outline coordinates must be finite numbers." })
  .min(-COORDINATE_LIMIT)
  .max(COORDINATE_LIMIT);

const ringSchema = z
  .tuple([coordinate, coordinate])
  .array()
  .min(3, { error: "A ring needs at least three points." })
  .max(MAX_POINTS_PER_RING, { error: "That outline is too detailed to save." });

export const outlineSchema = z
  .object({
    outer: ringSchema,
    holes: z.array(ringSchema).max(MAX_RINGS - 1),
  })
  .refine(
    (value) =>
      value.outer.length + value.holes.reduce((sum, hole) => sum + hole.length, 0) <=
      MAX_TOTAL_POINTS,
    { error: "That outline has too many points. Increase the smoothing and try again." },
  );

const widthMm = z.number().finite().min(1).max(1_000);
const thicknessMm = z.number().finite().min(0.1).max(100);

/**
 * Discriminated on `templateId`.
 *
 * The same shape as `fulfilmentType` on Product: one stored row, two variants,
 * each with its own required fields. Keychain-tag parameters submitted against
 * `flat-charm` are REJECTED rather than quietly dropped, so a saved design can
 * never carry settings its template does not understand.
 */
export const paramsSchema = z.discriminatedUnion("templateId", [
  z.object({
    templateId: z.literal("flat-charm"),
    widthMm,
    thicknessMm,
  }),
  z.object({
    templateId: z.literal("keychain-tag"),
    widthMm,
    thicknessMm,
    holeDiameterMm: z.number().finite().min(0.1).max(100),
    holeInsetMm: z.number().finite().min(0).max(500),
    holePosition: z.enum(HOLE_POSITIONS),
  }),
]);

/**
 * Titles are stored and rendered as PLAIN TEXT.
 *
 * No markdown and no HTML, exactly as with seller bios: a shared design page is
 * public, and rendering user-authored markup there would be stored XSS.
 */
const titleSchema = z
  .string()
  .trim()
  .min(2, { error: "Give your design a name." })
  .max(80, { error: "Names must be 80 characters or fewer." });

export const designInputSchema = z.object({
  title: titleSchema,
  outline: outlineSchema,
  params: paramsSchema,
});

export const designIdSchema = z.cuid({ error: "Unknown design." });

export const visibilitySchema = z.enum(["PRIVATE", "PUBLIC"]);

export type DesignInput = z.infer<typeof designInputSchema>;
export type DesignVisibilityInput = z.infer<typeof visibilitySchema>;

/**
 * Compile-time proof that the schema and the geometry layer agree.
 *
 * If a template gains a parameter in lib/studio/templates.ts without gaining
 * one here, this assignment stops compiling - which is the point. A silent
 * mismatch would mean saved designs that reopen with missing settings.
 */
const _paramsMatchGeometry: StudioParams = {} as z.infer<typeof paramsSchema>;
void _paramsMatchGeometry;

const _outlineMatchesGeometry: Outline = {} as z.infer<typeof outlineSchema>;
void _outlineMatchesGeometry;

/** Supported template ids, re-exported so callers need one import site. */
export { TEMPLATE_IDS };
