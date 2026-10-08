/**
 * Ring simplification.
 *
 * THIS STAGE IS LOAD-BEARING, NOT POLISH. Tracing emits one vertex per pixel
 * boundary, so a 1000px logo arrives here with tens of thousands of points.
 * Left alone that produces an STL no slicer wants to open and a viewer that
 * stutters on every slider drag. Simplification is what makes the output usable
 * at all, which is why it has its own module and its own tests.
 *
 * Two passes, cheapest first:
 *   1. Collinear collapse - a traced edge is a straight run of unit steps, so
 *      this alone removes the large majority of points at zero shape cost.
 *   2. Douglas-Peucker - drops points that sit within `tolerance` of the line
 *      their neighbours already describe.
 */
import type { Ring, Vec2 } from "./types";

/** Perpendicular distance from `p` to the segment `a`-`b`. */
export function perpendicularDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  // Degenerate segment: fall back to point distance rather than dividing by 0.
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);

  // Project onto the segment, clamped, so points beyond an endpoint measure to
  // that endpoint instead of to the infinite line.
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Remove points that lie on the straight line between their neighbours. */
export function removeCollinear(ring: Ring, epsilon = 1e-9): Vec2[] {
  if (ring.length < 3) return [...ring];

  const kept: Vec2[] = [];

  for (let i = 0; i < ring.length; i++) {
    const prev = ring[(i - 1 + ring.length) % ring.length]!;
    const current = ring[i]!;
    const next = ring[(i + 1) % ring.length]!;

    if (perpendicularDistance(current, prev, next) > epsilon) kept.push(current);
  }

  // A perfect rectangle would keep only its 4 corners; anything that collapses
  // below a triangle had no area to begin with.
  return kept.length >= 3 ? kept : [...ring];
}

/**
 * Douglas-Peucker over an OPEN polyline. First and last points are always kept.
 *
 * Iterative rather than recursive: a traced ring can carry tens of thousands of
 * points, which is enough to overflow the call stack on a deeply unbalanced
 * split.
 */
export function douglasPeucker(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;

    let farthest = -1;
    let maxDistance = tolerance;

    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(points[i]!, points[first]!, points[last]!);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }

    if (farthest === -1) continue;

    keep[farthest] = 1;
    stack.push([first, farthest], [farthest, last]);
  }

  const result: Vec2[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]!);
  return result;
}

/**
 * Simplify a CLOSED ring.
 *
 * A closed ring has no natural endpoints, and Douglas-Peucker needs two. Using
 * index 0 and the vertex farthest from it splits the ring at its widest span,
 * which keeps the two chains well-conditioned - splitting at an arbitrary
 * neighbouring pair would let one chain wrap almost the whole shape and lose
 * detail unevenly around it.
 */
export function simplifyRing(ring: Ring, tolerance: number): Vec2[] {
  const collapsed = removeCollinear(ring);
  if (collapsed.length <= 4 || tolerance <= 0) return collapsed;

  const origin = collapsed[0]!;
  let splitIndex = 0;
  let maxDistance = -1;

  for (let i = 1; i < collapsed.length; i++) {
    const d = Math.hypot(collapsed[i]![0] - origin[0], collapsed[i]![1] - origin[1]);
    if (d > maxDistance) {
      maxDistance = d;
      splitIndex = i;
    }
  }

  const first = douglasPeucker(collapsed.slice(0, splitIndex + 1), tolerance);
  const second = douglasPeucker([...collapsed.slice(splitIndex), origin], tolerance);

  // `first` ends on the split vertex and `second` starts on it; `second` ends on
  // the origin, which `first` already starts with. Drop both duplicates.
  const merged = [...first, ...second.slice(1, -1)];

  // Never hand back something that cannot be triangulated.
  return merged.length >= 3 ? merged : collapsed;
}

/** Simplify an outline's outer ring and every hole with one tolerance. */
export function simplifyOutline(
  outline: { outer: Ring; holes: readonly Ring[] },
  tolerance: number,
): { outer: Vec2[]; holes: Vec2[][] } {
  return {
    outer: simplifyRing(outline.outer, tolerance),
    holes: outline.holes
      .map((hole) => simplifyRing(hole, tolerance))
      .filter((hole) => hole.length >= 3),
  };
}
