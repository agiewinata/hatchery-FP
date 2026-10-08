import { describe, expect, it } from "vitest";

import {
  applyTemplateFeatures,
  buildGeometry,
  circleRing,
  extrude,
  holeFits,
  sizeOf,
  transformOutline,
  type GeometryParams,
} from "./geometry";
import { isWatertight, signedVolume, triangleCount } from "./stl";
import { boundsOf, signedArea, type Outline } from "./types";

/** A 10x10 square in image coordinates, wound positively like a traced outer ring. */
const SQUARE: Outline = {
  outer: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
  holes: [],
};

/** The same square with a 4x4 hole through the middle, wound negatively. */
const DONUT: Outline = {
  outer: SQUARE.outer,
  holes: [
    [
      [3, 3],
      [3, 7],
      [7, 7],
      [7, 3],
    ],
  ],
};

/** A concave shape, to check nothing depends on convexity. */
const L_SHAPE: Outline = {
  outer: [
    [0, 0],
    [10, 0],
    [10, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ],
  holes: [],
};

describe("fixtures", () => {
  it("use the winding convention the tracer produces", () => {
    expect(signedArea(SQUARE.outer)).toBeGreaterThan(0);
    expect(signedArea(DONUT.holes[0]!)).toBeLessThan(0);
    expect(signedArea(L_SHAPE.outer)).toBeGreaterThan(0);
  });
});

describe("transformOutline", () => {
  it("scales to the requested width and centres on the origin", () => {
    const shape = transformOutline(SQUARE, 40);
    const bounds = boundsOf(shape.outer)!;

    expect(bounds.maxX - bounds.minX).toBeCloseTo(40);
    expect(bounds.minX).toBeCloseTo(-20);
    expect(bounds.maxX).toBeCloseTo(20);
    expect(shape.heightMm).toBeCloseTo(40);
  });

  it("keeps the aspect ratio of a non-square outline", () => {
    const wide: Outline = {
      outer: [
        [0, 0],
        [20, 0],
        [20, 5],
        [0, 5],
      ],
      holes: [],
    };
    expect(transformOutline(wide, 40).heightMm).toBeCloseTo(10);
  });

  it("re-establishes earcut winding after flipping Y", () => {
    // Image Y grows downward and model Y grows upward. The flip reverses
    // winding, so without correction every model would come out mirrored.
    const shape = transformOutline(DONUT, 10);
    expect(signedArea(shape.outer)).toBeGreaterThan(0);
    expect(signedArea(shape.holes[0]!)).toBeLessThan(0);
  });

  it("refuses an outline with no area", () => {
    expect(() => transformOutline({ outer: [], holes: [] }, 10)).toThrow(/empty outline/);
  });
});

describe("circleRing", () => {
  it("is wound clockwise so it reads as a hole", () => {
    expect(signedArea(circleRing(0, 0, 5))).toBeLessThan(0);
  });

  it("matches the exact area of an inscribed 32-gon", () => {
    // Inscribed, so slightly smaller than the circle it approximates. Asserting
    // the polygon's own closed form rather than pi*r^2 keeps this exact instead
    // of relying on a tolerance that happens to be wide enough.
    const n = 32;
    const r = 5;
    const exact = 0.5 * n * r * r * Math.sin((2 * Math.PI) / n);

    expect(Math.abs(signedArea(circleRing(0, 0, r, n)))).toBeCloseTo(exact, 10);
    expect(Math.abs(signedArea(circleRing(0, 0, r, n)))).toBeLessThan(Math.PI * r * r);
  });
});

describe("holeFits", () => {
  it("accepts a hole well inside the material", () => {
    const shape = transformOutline(SQUARE, 40);
    expect(holeFits(shape, [0, 10], 2)).toBe(true);
  });

  it("rejects a hole that overlaps the outer edge", () => {
    const shape = transformOutline(SQUARE, 40);
    // Centre is inside, but the radius crosses the boundary at y = 20.
    expect(holeFits(shape, [0, 19], 2)).toBe(false);
  });

  it("rejects a hole that lands in a concave notch", () => {
    // The notch is outside the material even though it is inside the bounding
    // box - the case that produced a non-manifold mesh before this check.
    const shape = transformOutline(L_SHAPE, 30);
    expect(holeFits(shape, [12, -12], 1.5)).toBe(false);
  });

  it("rejects a hole that collides with an existing hole", () => {
    const shape = transformOutline(DONUT, 50);
    expect(holeFits(shape, [0, 0], 2)).toBe(false);
  });

  it("honours a clearance requirement", () => {
    const shape = transformOutline(SQUARE, 40);
    expect(holeFits(shape, [0, 16], 2, 0)).toBe(true);
    expect(holeFits(shape, [0, 16], 2, 3)).toBe(false);
  });
});

describe("extrude", () => {
  const params: GeometryParams = { widthMm: 10, thicknessMm: 2 };

  it("produces a closed, outward-facing solid", () => {
    const mesh = buildGeometry(SQUARE, params);
    expect(isWatertight(mesh)).toBe(true);
    // Positive volume means the faces point outward; a negative one would print
    // as an inside-out shell.
    expect(signedVolume(mesh)).toBeGreaterThan(0);
  });

  it("computes the exact volume of a simple box", () => {
    expect(signedVolume(buildGeometry(SQUARE, params))).toBeCloseTo(10 * 10 * 2, 4);
  });

  it("subtracts a hole's volume rather than filling it", () => {
    // 100mm^2 of outline minus 16mm^2 of hole, 2mm thick.
    expect(signedVolume(buildGeometry(DONUT, params))).toBeCloseTo((100 - 16) * 2, 4);
  });

  it("emits two caps plus two triangles per ring edge", () => {
    const mesh = buildGeometry(SQUARE, params);
    // A quad triangulates to 2 triangles; 2 caps = 4, plus 4 edges * 2 = 8.
    expect(triangleCount(mesh)).toBe(12);
  });

  it("rejects a degenerate outline instead of emitting a broken solid", () => {
    const sliver: Outline = {
      outer: [
        [0, 0],
        [10, 0],
        [0, 0],
      ],
      holes: [],
    };
    expect(() => buildGeometry(sliver, params)).toThrow();
  });
});

describe("watertightness across shapes and templates", () => {
  const cases: [string, Outline, GeometryParams][] = [
    ["plain square", SQUARE, { widthMm: 10, thicknessMm: 2 }],
    ["square, thin", SQUARE, { widthMm: 40, thicknessMm: 1.2 }],
    ["donut", DONUT, { widthMm: 30, thicknessMm: 3 }],
    ["concave L", L_SHAPE, { widthMm: 25, thicknessMm: 2 }],
    [
      "square with keyring hole",
      SQUARE,
      {
        widthMm: 40,
        thicknessMm: 3,
        hole: { diameterMm: 4, insetMm: 5, position: "top-center" },
      },
    ],
    [
      "donut with keyring hole",
      DONUT,
      {
        widthMm: 50,
        thicknessMm: 2.5,
        hole: { diameterMm: 3, insetMm: 4, position: "top-left" },
      },
    ],
    [
      "concave L with keyring hole",
      L_SHAPE,
      {
        widthMm: 30,
        thicknessMm: 2,
        hole: { diameterMm: 3, insetMm: 3, position: "bottom-right" },
      },
    ],
  ];

  it.each(cases)("%s is a closed outward-facing solid", (_name, outline, params) => {
    const mesh = buildGeometry(outline, params);
    expect(isWatertight(mesh)).toBe(true);
    expect(signedVolume(mesh)).toBeGreaterThan(0);
  });
});

describe("applyTemplateFeatures", () => {
  it("adds nothing when no hole is requested", () => {
    const shape = transformOutline(SQUARE, 10);
    expect(applyTemplateFeatures(shape, { widthMm: 10, thicknessMm: 2 }).holes).toHaveLength(0);
  });

  it("adds exactly one clockwise ring for the keyring hole", () => {
    const shape = transformOutline(SQUARE, 40);
    const withHole = applyTemplateFeatures(shape, {
      widthMm: 40,
      thicknessMm: 2,
      hole: { diameterMm: 4, insetMm: 5, position: "top-center" },
    });

    expect(withHole.holes).toHaveLength(1);
    expect(signedArea(withHole.holes[0]!)).toBeLessThan(0);
  });

  it("drops a hole that would fall outside the material", () => {
    // Rather than handing earcut an uncontained ring, which yields a silently
    // non-manifold mesh. The user is told why by checkPrintability.
    const shape = transformOutline(L_SHAPE, 30);
    const result = applyTemplateFeatures(shape, {
      widthMm: 30,
      thicknessMm: 2,
      hole: { diameterMm: 3, insetMm: 3, position: "bottom-right" },
    });

    expect(result.holes).toHaveLength(0);
  });

  it("places the hole at the requested corner", () => {
    const shape = transformOutline(SQUARE, 40);
    const at = (position: "top-center" | "bottom-right") =>
      boundsOf(
        applyTemplateFeatures(shape, {
          widthMm: 40,
          thicknessMm: 2,
          hole: { diameterMm: 4, insetMm: 5, position },
        }).holes[0]!,
      )!;

    // Top-centre sits high and horizontally centred; bottom-right sits low and right.
    expect(at("top-center").maxY).toBeGreaterThan(0);
    expect(at("bottom-right").maxY).toBeLessThan(0);
    expect(at("bottom-right").minX).toBeGreaterThan(0);
  });
});

describe("sizeOf", () => {
  it("reports the finished dimensions", () => {
    expect(sizeOf(SQUARE, { widthMm: 35, thicknessMm: 2.5 })).toEqual({
      widthMm: 35,
      heightMm: 35,
      depthMm: 2.5,
    });
  });
});

describe("extrude (direct)", () => {
  it("is callable without the template layer", () => {
    const mesh = extrude(transformOutline(SQUARE, 10), 2);
    expect(isWatertight(mesh)).toBe(true);
  });
});
