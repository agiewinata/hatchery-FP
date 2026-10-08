/**
 * Shared geometry types for the studio.
 *
 * Deliberately plain data: no classes, no Three.js types, nothing that cannot
 * be serialised to JSON. The whole pipeline is pure functions over these, which
 * is what lets the maths be unit-tested with no DOM, no WebGL and no database.
 *
 * SECURITY/ARCHITECTURE: nothing under lib/studio/ may import Three.js. The same
 * discipline as lib/errors.ts importing nothing - the viewer component converts
 * these arrays into a BufferGeometry, but the maths never knows Three exists.
 */

/** A 2D point. A tuple rather than {x,y} because outlines are stored as JSON. */
export type Vec2 = readonly [number, number];

/** A closed ring of points. The closing edge is implied, never duplicated. */
export type Ring = readonly Vec2[];

/**
 * A traced silhouette: one outer boundary and any enclosed holes.
 *
 * This is the saved artifact. Geometry is regenerated from it deterministically,
 * which is why the source image never has to be stored.
 */
export interface Outline {
  outer: Ring;
  holes: readonly Ring[];
}

/** A binary foreground mask. 1 = foreground, 0 = background. */
export interface Mask {
  data: Uint8Array;
  width: number;
  height: number;
}

/** An indexed triangle mesh. Positions are flat triples: x,y,z,x,y,z,... */
export interface Mesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Signed area via the shoelace formula.
 *
 * The SIGN is what matters: it encodes winding direction, which is how outer
 * rings are told apart from holes without any containment maths.
 */
export function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Even-odd ray casting. Used to decide which outer ring a hole belongs to. */
export function pointInRing(point: Vec2, ring: Ring): boolean {
  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const crosses = yi > py !== yj > py;
    if (crosses && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }

  return inside;
}

/** Axis-aligned bounds of a ring. Returns null for an empty ring. */
export function boundsOf(ring: Ring): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (ring.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}
