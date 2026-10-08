import { describe, expect, it } from "vitest";

import { largestOutline } from "./contour";
import {
  douglasPeucker,
  perpendicularDistance,
  removeCollinear,
  simplifyOutline,
  simplifyRing,
} from "./simplify";
import { signedArea, type Mask, type Vec2 } from "./types";

function maskFrom(rows: string[]): Mask {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      data[y * width + x] = ch === "#" ? 1 : 0;
    }),
  );
  return { data, width, height };
}

/** A closed ring of `n` points on a circle, in pixel-ish coordinates. */
const circle = (n: number, r = 100): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [r * Math.cos(a), r * Math.sin(a)] as Vec2;
  });

describe("perpendicularDistance", () => {
  it("measures to the line for a point beside the segment", () => {
    expect(perpendicularDistance([0, 5], [-10, 0], [10, 0])).toBeCloseTo(5);
  });

  it("clamps to an endpoint for a point beyond the segment", () => {
    // Not the infinite line: a point past the end is 5 away from the end,
    // not 0 away from the line's extension.
    expect(perpendicularDistance([15, 0], [-10, 0], [10, 0])).toBeCloseTo(5);
  });

  it("falls back to point distance on a degenerate segment", () => {
    expect(perpendicularDistance([3, 4], [0, 0], [0, 0])).toBeCloseTo(5);
  });

  it("is zero on the line", () => {
    expect(perpendicularDistance([0, 0], [-10, 0], [10, 0])).toBeCloseTo(0);
  });
});

describe("removeCollinear", () => {
  it("collapses a straight run to its corners", () => {
    // Exactly what a traced edge looks like: a straight line of unit steps.
    const ring: Vec2[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [3, 2],
      [0, 2],
    ];
    expect(removeCollinear(ring)).toEqual([
      [0, 0],
      [3, 0],
      [3, 2],
      [0, 2],
    ]);
  });

  it("leaves a shape with no redundant points alone", () => {
    const triangle: Vec2[] = [
      [0, 0],
      [4, 0],
      [0, 3],
    ];
    expect(removeCollinear(triangle)).toEqual(triangle);
  });

  it("treats the ring as closed when judging the first and last points", () => {
    // [5,0] is collinear between [0,0] and [10,0] only if the ring wraps.
    const ring: Vec2[] = [
      [5, 0],
      [10, 0],
      [10, 5],
      [0, 5],
      [0, 0],
    ];
    expect(removeCollinear(ring)).not.toContainEqual([5, 0]);
  });

  it("refuses to collapse below a triangle", () => {
    // Every point of a degenerate sliver is collinear; returning 0 points
    // would hand an empty ring to the triangulator.
    const sliver: Vec2[] = [
      [0, 0],
      [5, 0],
      [10, 0],
    ];
    expect(removeCollinear(sliver).length).toBeGreaterThanOrEqual(3);
  });

  it("passes through rings too short to simplify", () => {
    expect(removeCollinear([[0, 0]])).toEqual([[0, 0]]);
  });
});

describe("douglasPeucker", () => {
  it("always keeps the first and last points", () => {
    const line: Vec2[] = [
      [0, 0],
      [5, 0.01],
      [10, 0],
    ];
    const result = douglasPeucker(line, 1);
    expect(result[0]).toEqual([0, 0]);
    expect(result.at(-1)).toEqual([10, 0]);
  });

  it("drops a point within tolerance of its neighbours' line", () => {
    const line: Vec2[] = [
      [0, 0],
      [5, 0.4],
      [10, 0],
    ];
    expect(douglasPeucker(line, 1)).toHaveLength(2);
  });

  it("keeps a point that deviates beyond tolerance", () => {
    const line: Vec2[] = [
      [0, 0],
      [5, 4],
      [10, 0],
    ];
    expect(douglasPeucker(line, 1)).toHaveLength(3);
  });

  it("never grows the point count as tolerance rises", () => {
    const noisy = circle(200);
    let previous = Infinity;

    for (const tolerance of [0, 0.5, 1, 2, 4, 8, 16]) {
      const length = douglasPeucker(noisy, tolerance).length;
      expect(length).toBeLessThanOrEqual(previous);
      previous = length;
    }
  });

  it("handles inputs too short to simplify", () => {
    expect(douglasPeucker([], 1)).toEqual([]);
    expect(douglasPeucker([[0, 0]], 1)).toEqual([[0, 0]]);
  });

  it("does not overflow the stack on a long polyline", () => {
    // Iterative, not recursive: a traced ring can carry tens of thousands of
    // points and an unbalanced split would blow a recursive implementation.
    const long: Vec2[] = Array.from({ length: 50_000 }, (_, i) => [
      i,
      Math.sin(i / 500) * 100,
    ]);

    const started = Date.now();
    expect(() => douglasPeucker(long, 0.5)).not.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("is only quadratic when every point survives, which real input avoids", () => {
    // Worth recording rather than leaving as a trap. On a pure zigzag of
    // amplitude 1, no point is within tolerance until tolerance exceeds that
    // amplitude, so nothing is discarded and the scan runs over every
    // remaining span - 8k such points take ~2s. Once tolerance clears the
    // amplitude the whole run collapses on the first pass.
    //
    // Real outlines do not reach the bad case: the trace is capped at 512px by
    // MAX_TRACE_DIMENSION, removeCollinear runs first, and simplifyRing skips
    // Douglas-Peucker altogether at tolerance 0.
    const zigzag: Vec2[] = Array.from({ length: 2_000 }, (_, i) => [i, i % 2]);

    expect(douglasPeucker(zigzag, 0.9)).toHaveLength(1_992); // barely anything dropped
    expect(douglasPeucker(zigzag, 1.0)).toHaveLength(2); // clears the amplitude
  });
});

describe("simplifyRing", () => {
  it("keeps a ring closable - never fewer than three points", () => {
    for (const tolerance of [0, 1, 10, 100, 1_000]) {
      expect(simplifyRing(circle(64), tolerance).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("reduces a blocky traced ring dramatically", () => {
    // The whole reason this module exists. A traced 40x40 square arrives with
    // one vertex per pixel boundary and must come out as roughly a rectangle.
    const square = maskFrom(Array.from({ length: 40 }, () => "#".repeat(40)));
    const traced = largestOutline(square, { minAreaPx: 0 })!;

    expect(traced.outer.length).toBeGreaterThan(100);
    expect(simplifyRing(traced.outer, 1)).toHaveLength(4);
  });

  it("never grows the point count as tolerance rises", () => {
    const ring = circle(256);
    let previous = Infinity;

    for (const tolerance of [0, 1, 2, 5, 10, 25, 50]) {
      const length = simplifyRing(ring, tolerance).length;
      expect(length).toBeLessThanOrEqual(previous);
      previous = length;
    }
  });

  it("preserves winding, which is how holes are told from outlines", () => {
    const ring = circle(128);
    const before = Math.sign(signedArea(ring));
    expect(Math.sign(signedArea(simplifyRing(ring, 5)))).toBe(before);

    const reversed = [...ring].reverse();
    expect(Math.sign(signedArea(simplifyRing(reversed, 5)))).toBe(-before);
  });

  it("keeps the shape roughly intact at a modest tolerance", () => {
    const ring = circle(128, 100);
    const simplified = simplifyRing(ring, 2);

    expect(simplified.length).toBeLessThan(ring.length);
    // Area should survive within a few percent; a wildly different area means
    // the ring was mangled rather than smoothed.
    const ratio = Math.abs(signedArea(simplified)) / Math.abs(signedArea(ring));
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });

  it("returns the collapsed ring unchanged at zero tolerance", () => {
    const triangle: Vec2[] = [
      [0, 0],
      [10, 0],
      [0, 10],
    ];
    expect(simplifyRing(triangle, 0)).toEqual(triangle);
  });
});

describe("simplifyOutline", () => {
  it("simplifies the outer ring and every hole", () => {
    const donut = maskFrom([
      "########",
      "########",
      "##....##",
      "##....##",
      "##....##",
      "##....##",
      "########",
      "########",
    ]);
    const traced = largestOutline(donut, { minAreaPx: 0 })!;
    const simplified = simplifyOutline(traced, 1);

    expect(simplified.outer).toHaveLength(4);
    expect(simplified.holes).toHaveLength(1);
    expect(simplified.holes[0]).toHaveLength(4);
  });

  it("drops a hole that simplification would degenerate", () => {
    // A hole reduced below three points cannot be triangulated, so it must be
    // discarded rather than passed on to earcut.
    const outline = {
      outer: circle(64, 100),
      holes: [
        [
          [0, 0],
          [1, 0],
          [2, 0],
        ] as Vec2[],
      ],
    };
    const simplified = simplifyOutline(outline, 50);
    expect(simplified.holes.every((hole) => hole.length >= 3)).toBe(true);
  });

  it("preserves the opposite winding of outer ring and hole", () => {
    const donut = maskFrom([
      "######",
      "######",
      "##..##",
      "##..##",
      "######",
      "######",
    ]);
    const simplified = simplifyOutline(largestOutline(donut, { minAreaPx: 0 })!, 1);

    expect(signedArea(simplified.outer)).toBeGreaterThan(0);
    expect(signedArea(simplified.holes[0]!)).toBeLessThan(0);
  });
});
