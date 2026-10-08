/**
 * Outline + parameters to a watertight triangle mesh.
 *
 * THE DECISION THAT SHAPES THIS FILE: the keyring hole is punched as an extra
 * POLYGON HOLE before triangulation, never as a boolean subtract. Triangulating
 * a polygon with holes is something earcut already does, so no CSG library is
 * needed - and every CSG library worth using is WebAssembly, which this app's
 * Content-Security-Policy forbids (`script-src` carries no `wasm-unsafe-eval`).
 * That one choice is what keeps the whole feature inside the existing CSP.
 *
 * Output must be WATERTIGHT or a slicer will refuse it: every directed edge
 * appears exactly once across the mesh, which is the invariant the tests assert.
 */
import earcut from "earcut";

import { perpendicularDistance } from "./simplify";
import { boundsOf, pointInRing, signedArea, type Mesh, type Outline, type Vec2 } from "./types";

/** Where the keyring hole sits. Top-centre is the usual choice for a charm. */
export type HolePosition =
  | "top-center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface GeometryParams {
  /** Overall width of the finished piece. Height follows from the aspect ratio. */
  widthMm: number;
  thicknessMm: number;
  /** Omit for a plain extruded charm; supply to punch a keyring hole. */
  hole?: {
    diameterMm: number;
    /** Distance from the bounding box edges to the hole's centre. */
    insetMm: number;
    position: HolePosition;
  };
}

/** Segment count for a generated hole. 32 reads as round at charm scale. */
const HOLE_SEGMENTS = 32;

function ensureWinding(ring: readonly Vec2[], wantPositive: boolean): Vec2[] {
  const positive = signedArea(ring) > 0;
  return positive === wantPositive ? [...ring] : [...ring].reverse();
}

export interface TransformedOutline {
  outer: Vec2[];
  holes: Vec2[][];
  widthMm: number;
  heightMm: number;
}

/**
 * Map a traced outline from image pixels into centred millimetres.
 *
 * Flips Y, because image coordinates grow downward and model coordinates grow
 * upward - without this every exported model is mirrored, which is the kind of
 * bug nobody notices until a batch of prints comes out backwards.
 */
export function transformOutline(outline: Outline, widthMm: number): TransformedOutline {
  const bounds = boundsOf(outline.outer);
  if (!bounds) throw new Error("Cannot build geometry from an empty outline.");

  const pixelWidth = bounds.maxX - bounds.minX;
  const pixelHeight = bounds.maxY - bounds.minY;
  if (pixelWidth <= 0 || pixelHeight <= 0) {
    throw new Error("Outline has no area to extrude.");
  }

  const scale = widthMm / pixelWidth;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  const toModel = (ring: readonly Vec2[]): Vec2[] =>
    ring.map(([x, y]) => [(x - cx) * scale, -(y - cy) * scale] as Vec2);

  // The Y flip reverses winding, so re-establish the convention earcut expects:
  // outer counter-clockwise, holes clockwise.
  return {
    outer: ensureWinding(toModel(outline.outer), true),
    holes: outline.holes
      .map((hole) => ensureWinding(toModel(hole), false))
      .filter((hole) => hole.length >= 3),
    widthMm,
    heightMm: pixelHeight * scale,
  };
}

/** A clockwise circle, ready to be used as a polygon hole. */
export function circleRing(
  centerX: number,
  centerY: number,
  radius: number,
  segments = HOLE_SEGMENTS,
): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    // Negative angle so the ring is wound clockwise, matching hole convention.
    const angle = (-2 * Math.PI * i) / segments;
    points.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]);
  }
  return points;
}

/** Where a hole's centre lands for a given position and inset. Exported so the
 *  printability check reasons about exactly the same point the mesh uses. */
export function holeCenter(
  shape: TransformedOutline,
  inset: number,
  position: HolePosition,
): Vec2 {
  const halfWidth = shape.widthMm / 2;
  const halfHeight = shape.heightMm / 2;

  switch (position) {
    case "top-center":
      return [0, halfHeight - inset];
    case "top-left":
      return [-halfWidth + inset, halfHeight - inset];
    case "top-right":
      return [halfWidth - inset, halfHeight - inset];
    case "bottom-left":
      return [-halfWidth + inset, -halfHeight + inset];
    case "bottom-right":
      return [halfWidth - inset, -halfHeight + inset];
  }
}

/** Shortest distance from a point to any edge of a ring. */
function distanceToRing(point: Vec2, ring: readonly Vec2[]): number {
  let shortest = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = perpendicularDistance(point, ring[i]!, ring[(i + 1) % ring.length]!);
    if (d < shortest) shortest = d;
  }
  return shortest;
}

/**
 * Would a circular hole here sit entirely within solid material?
 *
 * Three conditions, and all are needed. Being inside the outer ring is not
 * enough on a CONCAVE shape, where a corner position can land in the notch and
 * fall outside the material entirely; and a hole that merely overlaps an edge
 * would hand earcut a ring that is not properly contained, which produces a
 * non-manifold mesh rather than an error.
 *
 * `clearanceMm` is extra material demanded beyond the hole itself.
 */
export function holeFits(
  shape: TransformedOutline,
  center: Vec2,
  radius: number,
  clearanceMm = 0,
): boolean {
  const required = radius + clearanceMm;

  if (!pointInRing(center, shape.outer)) return false;
  if (distanceToRing(center, shape.outer) < required) return false;

  for (const hole of shape.holes) {
    if (pointInRing(center, hole)) return false;
    if (distanceToRing(center, hole) < required) return false;
  }

  return true;
}

/**
 * Add the template's generated features (currently: the keyring hole).
 *
 * A hole that would not sit in solid material is DROPPED rather than added, so
 * that `buildGeometry` can promise a watertight mesh unconditionally - a
 * preview must never become corrupt mid-drag. The user is told about it
 * separately by `checkPrintability`, which is where advice belongs.
 */
export function applyTemplateFeatures(
  shape: TransformedOutline,
  params: GeometryParams,
): TransformedOutline {
  if (!params.hole) return shape;

  const center = holeCenter(shape, params.hole.insetMm, params.hole.position);
  const radius = params.hole.diameterMm / 2;

  if (!holeFits(shape, center, radius)) return shape;

  return { ...shape, holes: [...shape.holes, circleRing(center[0], center[1], radius)] };
}

/**
 * Extrude a transformed outline into a closed solid.
 *
 * Vertex layout: every ring vertex exists twice, once on the top face and once
 * directly below it on the bottom face. Index `i` is the top copy, `i + count`
 * the bottom one - which keeps the wall indexing arithmetic trivial.
 */
export function extrude(shape: TransformedOutline, thicknessMm: number): Mesh {
  const rings = [shape.outer, ...shape.holes];

  const flat: number[] = [];
  const holeIndices: number[] = [];
  let vertexCount = 0;

  rings.forEach((ring, ringIndex) => {
    if (ringIndex > 0) holeIndices.push(vertexCount);
    for (const [x, y] of ring) flat.push(x, y);
    vertexCount += ring.length;
  });

  const capIndices = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2);
  if (capIndices.length === 0) {
    throw new Error("Triangulation produced no faces; the outline may be degenerate.");
  }

  const half = thicknessMm / 2;
  const positions = new Float32Array(vertexCount * 2 * 3);

  for (let i = 0; i < vertexCount; i++) {
    const x = flat[i * 2]!;
    const y = flat[i * 2 + 1]!;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = half;

    const bottom = (vertexCount + i) * 3;
    positions[bottom] = x;
    positions[bottom + 1] = y;
    positions[bottom + 2] = -half;
  }

  const indices: number[] = [];

  // Top face: earcut's winding follows its input, which is counter-clockwise,
  // so these already face +Z.
  for (let i = 0; i < capIndices.length; i += 3) {
    indices.push(capIndices[i]!, capIndices[i + 1]!, capIndices[i + 2]!);
  }

  // Bottom face: the same triangles, reversed so they face -Z.
  for (let i = 0; i < capIndices.length; i += 3) {
    indices.push(
      capIndices[i + 2]! + vertexCount,
      capIndices[i + 1]! + vertexCount,
      capIndices[i]! + vertexCount,
    );
  }

  // Side walls. Each ring edge becomes a quad joining the two faces. A hole's
  // clockwise winding flips its walls inward automatically, so holes need no
  // special case here.
  let offset = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = offset + i;
      const b = offset + ((i + 1) % ring.length);
      indices.push(a, a + vertexCount, b + vertexCount);
      indices.push(a, b + vertexCount, b);
    }
    offset += ring.length;
  }

  return { positions, indices: new Uint32Array(indices) };
}

/** The whole pipeline: outline + parameters to a printable solid. */
export function buildGeometry(outline: Outline, params: GeometryParams): Mesh {
  const shape = applyTemplateFeatures(transformOutline(outline, params.widthMm), params);
  return extrude(shape, params.thicknessMm);
}

/** Finished size, for display and for printability checks. */
export function sizeOf(outline: Outline, params: GeometryParams) {
  const shape = transformOutline(outline, params.widthMm);
  return { widthMm: shape.widthMm, heightMm: shape.heightMm, depthMm: params.thicknessMm };
}
