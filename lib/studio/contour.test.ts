import { describe, expect, it } from "vitest";

import { largestOutline, traceOutlines, traceRings } from "./contour";
import { signedArea, type Mask } from "./types";

/** Build a mask from ASCII art. '#' is foreground, anything else background. */
function maskFrom(rows: string[]): Mask {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8Array(width * height);

  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error("ragged mask rows in test fixture");
    [...row].forEach((ch, x) => {
      data[y * width + x] = ch === "#" ? 1 : 0;
    });
  });

  return { data, width, height };
}

const ALL = { minAreaPx: 0 };

describe("traceRings", () => {
  it("traces a single pixel as one unit square wound positively", () => {
    const rings = traceRings(maskFrom(["#"]));
    expect(rings).toHaveLength(1);
    // Positive winding is the convention the rest of the pipeline relies on to
    // tell an outer boundary from a hole without any containment test.
    expect(signedArea(rings[0]!)).toBe(1);
  });

  it("traces a solid block as one ring enclosing its full area", () => {
    const rings = traceRings(maskFrom(["###", "###", "###"]));
    expect(rings).toHaveLength(1);
    expect(signedArea(rings[0]!)).toBe(9);
  });

  it("finds an empty mask has no boundary at all", () => {
    expect(traceRings(maskFrom(["...", "..."]))).toHaveLength(0);
  });

  it("gives a hole the opposite winding to its outer ring", () => {
    const rings = traceRings(maskFrom(["###", "#.#", "###"]));
    expect(rings).toHaveLength(2);

    const areas = rings.map(signedArea).sort((a, b) => b - a);
    expect(areas[0]).toBe(9); // outer boundary, positive
    expect(areas[1]).toBe(-1); // hole, negative
  });

  it("traces two separated blobs as two rings", () => {
    const rings = traceRings(maskFrom(["#.#", "#.#"]));
    expect(rings).toHaveLength(2);
    expect(rings.every((r) => signedArea(r) > 0)).toBe(true);
  });
});

describe("traceOutlines", () => {
  it("nests a hole under the outer ring that contains it", () => {
    const outlines = traceOutlines(maskFrom(["###", "#.#", "###"]), ALL);

    expect(outlines).toHaveLength(1);
    expect(outlines[0]!.holes).toHaveLength(1);
    expect(signedArea(outlines[0]!.outer)).toBe(9);
    expect(signedArea(outlines[0]!.holes[0]!)).toBe(-1);
  });

  it("keeps two blobs separate, each without holes", () => {
    const outlines = traceOutlines(maskFrom(["#.#", "#.#"]), ALL);
    expect(outlines).toHaveLength(2);
    expect(outlines.every((o) => o.holes.length === 0)).toBe(true);
  });

  it("returns outlines largest first", () => {
    const outlines = traceOutlines(maskFrom(["##.#", "##.."]), ALL);
    expect(outlines).toHaveLength(2);
    expect(Math.abs(signedArea(outlines[0]!.outer))).toBeGreaterThan(
      Math.abs(signedArea(outlines[1]!.outer)),
    );
  });

  it("discards speckle below the minimum area", () => {
    // Thresholding a photo leaves single-pixel noise; without this each speck
    // becomes its own solid in the exported STL.
    const withNoise = maskFrom(["####.", "####.", "####.", "####.", "....#"]);

    expect(traceOutlines(withNoise, ALL)).toHaveLength(2);
    expect(traceOutlines(withNoise, { minAreaPx: 4 })).toHaveLength(1);
  });

  it("attributes a hole to the smallest ring containing it", () => {
    // A solid island sitting inside a hole, with its own hole in turn. The
    // innermost hole must attach to the island, not to the outer shape.
    const nested = maskFrom([
      "#######",
      "#.....#",
      "#.###.#",
      "#.#.#.#",
      "#.###.#",
      "#.....#",
      "#######",
    ]);

    const outlines = traceOutlines(nested, ALL);
    expect(outlines).toHaveLength(2);

    const [outer, island] = outlines;
    expect(outer!.holes).toHaveLength(1);
    expect(island!.holes).toHaveLength(1);
    // The island's hole is the 1px centre.
    expect(Math.abs(signedArea(island!.holes[0]!))).toBe(1);
  });
});

describe("largestOutline", () => {
  it("returns null when nothing survives tracing", () => {
    expect(largestOutline(maskFrom(["..", ".."]))).toBeNull();
  });

  it("picks the dominant shape", () => {
    const outline = largestOutline(maskFrom(["##.#", "##.."]), ALL);
    expect(signedArea(outline!.outer)).toBe(4);
  });
});
