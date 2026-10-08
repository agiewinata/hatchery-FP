/**
 * Mask to closed contour rings.
 *
 * APPROACH: the contour is the boundary of the union of foreground unit
 * squares. Every edge between a foreground and a background pixel is emitted as
 * a *directed* unit edge with foreground on its left, then the edges are
 * stitched head-to-tail into closed rings.
 *
 * This is exact for a binary mask, and far easier to reason about and to test
 * than marching squares - which has to break ties on its two ambiguous saddle
 * cases, and where a wrong tie-break silently produces self-crossing rings that
 * only show up much later as a corrupt mesh.
 *
 * Winding falls out of the construction and carries real meaning: with image
 * coordinates (y growing downward) and foreground kept on the left, OUTER rings
 * come out with positive signed area and HOLES with negative. So telling a hole
 * from an outline needs no containment test at all, only a sign.
 */
import { at } from "./mask";
import { pointInRing, signedArea, type Mask, type Outline, type Ring, type Vec2 } from "./types";

const key = (x: number, y: number) => `${x},${y}`;

/**
 * All closed boundary rings in the mask, in no particular order.
 *
 * Rings are "blocky" - one vertex per pixel corner - and are expected to be fed
 * through simplifyRing() before anything else uses them.
 */
export function traceRings(mask: Mask): Ring[] {
  /** Directed edges, keyed by their start vertex. A vertex may have several. */
  const edges = new Map<string, Vec2[]>();

  const push = (from: Vec2, to: Vec2) => {
    const k = key(from[0], from[1]);
    const list = edges.get(k);
    if (list) list.push(to);
    else edges.set(k, [to]);
  };

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (!at(mask, x, y)) continue;

      // Each exposed side of this pixel contributes one boundary edge, oriented
      // so the pixel (the foreground) lies to the left of travel.
      if (!at(mask, x, y - 1)) push([x, y], [x + 1, y]);
      if (!at(mask, x + 1, y)) push([x + 1, y], [x + 1, y + 1]);
      if (!at(mask, x, y + 1)) push([x + 1, y + 1], [x, y + 1]);
      if (!at(mask, x - 1, y)) push([x, y + 1], [x, y]);
    }
  }

  const rings: Ring[] = [];

  while (edges.size > 0) {
    const startKey = edges.keys().next().value as string;
    const parts = startKey.split(",");
    const start: Vec2 = [Number(parts[0]), Number(parts[1])];

    const ring: Vec2[] = [];
    let current: Vec2 = start;

    for (;;) {
      const k = key(current[0], current[1]);
      const list = edges.get(k);

      // No outgoing edge left: the loop is closed (or, defensively, exhausted).
      if (!list || list.length === 0) break;

      // At a diagonal pinch a vertex has two outgoing edges. Taking the first
      // is deterministic; documented in the spec rather than hidden, because it
      // can split a figure-of-eight differently than a human would.
      const next = list.shift()!;
      if (list.length === 0) edges.delete(k);

      ring.push(current);
      current = next;

      if (current[0] === start[0] && current[1] === start[1]) break;
    }

    // Degenerate loops carry no area and would only break triangulation.
    if (ring.length >= 3) rings.push(ring);
  }

  return rings;
}

export interface TraceOptions {
  /**
   * Drop rings enclosing fewer than this many pixels.
   *
   * Thresholding a photograph leaves speckle, and every speck would otherwise
   * become its own solid in the exported STL.
   */
  minAreaPx: number;
}

export const DEFAULT_TRACE_OPTIONS: TraceOptions = { minAreaPx: 16 };

/**
 * Group rings into outlines, each an outer boundary plus the holes inside it.
 *
 * Returned largest-first, so callers that only want "the shape" can take the
 * first entry.
 */
export function traceOutlines(
  mask: Mask,
  options: TraceOptions = DEFAULT_TRACE_OPTIONS,
): Outline[] {
  const rings = traceRings(mask).filter((r) => Math.abs(signedArea(r)) >= options.minAreaPx);

  const outlines: { outer: Ring; holes: Ring[] }[] = rings
    .filter((r) => signedArea(r) > 0)
    .map((outer) => ({ outer, holes: [] }));

  for (const hole of rings.filter((r) => signedArea(r) < 0)) {
    // A hole's vertices are interior to its outer ring by construction, so any
    // vertex is a safe probe point.
    const probe = hole[0]!;

    // Nest into the SMALLEST containing outline, so a hole inside an island
    // inside a hole is attributed correctly rather than to the outermost shape.
    let bestIndex = -1;
    let bestArea = Infinity;

    for (let i = 0; i < outlines.length; i++) {
      const area = Math.abs(signedArea(outlines[i]!.outer));
      if (area < bestArea && pointInRing(probe, outlines[i]!.outer)) {
        bestArea = area;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) outlines[bestIndex]!.holes.push(hole);
  }

  return outlines.sort(
    (a, b) => Math.abs(signedArea(b.outer)) - Math.abs(signedArea(a.outer)),
  );
}

/** The dominant shape in the mask, or null if nothing survived tracing. */
export function largestOutline(
  mask: Mask,
  options: TraceOptions = DEFAULT_TRACE_OPTIONS,
): Outline | null {
  return traceOutlines(mask, options)[0] ?? null;
}
