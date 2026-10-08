import { describe, expect, it } from "vitest";

import {
  designInputSchema,
  MAX_POINTS_PER_RING,
  MAX_RINGS,
  MAX_TOTAL_POINTS,
  outlineSchema,
  paramsSchema,
} from "./studio";

/** A closed ring of `n` points on a circle - valid geometry, variable size. */
const ring = (n: number, radius = 10): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as [number, number];
  });

const validParams = { templateId: "flat-charm", widthMm: 50, thicknessMm: 3 };

describe("outlineSchema", () => {
  it("accepts a simple outline", () => {
    expect(outlineSchema.safeParse({ outer: ring(8), holes: [] }).success).toBe(true);
  });

  it("requires at least three points in a ring", () => {
    expect(outlineSchema.safeParse({ outer: ring(2), holes: [] }).success).toBe(false);
  });

  it("rejects a ring with too many points", () => {
    // Storing geometry is the new abuse vector: without this cap one request
    // can persist a polygon that costs storage forever and stalls every viewer.
    expect(outlineSchema.safeParse({ outer: ring(MAX_POINTS_PER_RING), holes: [] }).success).toBe(
      true,
    );
    expect(
      outlineSchema.safeParse({ outer: ring(MAX_POINTS_PER_RING + 1), holes: [] }).success,
    ).toBe(false);
  });

  it("rejects too many holes", () => {
    const holes = Array.from({ length: MAX_RINGS }, () => ring(3));
    expect(outlineSchema.safeParse({ outer: ring(4), holes }).success).toBe(false);
  });

  it("rejects an outline whose points sum past the total cap", () => {
    // Each ring is individually legal; together they are not. The per-ring cap
    // alone would let someone store 32 near-maximal rings.
    const holes = Array.from({ length: 10 }, () => ring(600));
    const total = 4 + 10 * 600;
    expect(total).toBeGreaterThan(MAX_TOTAL_POINTS);
    expect(outlineSchema.safeParse({ outer: ring(4), holes }).success).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    for (const bad of [Infinity, -Infinity, NaN]) {
      const outer: [number, number][] = [
        [0, 0],
        [1, 0],
        [bad, 1],
      ];
      expect(outlineSchema.safeParse({ outer, holes: [] }).success).toBe(false);
    }
  });

  it("rejects absurd coordinate magnitudes", () => {
    const outer: [number, number][] = [
      [0, 0],
      [1, 0],
      [1e9, 1],
    ];
    expect(outlineSchema.safeParse({ outer, holes: [] }).success).toBe(false);
  });

  it("rejects a point that is not a pair", () => {
    expect(outlineSchema.safeParse({ outer: [[0, 0], [1, 0], [1, 1, 1]], holes: [] }).success).toBe(
      false,
    );
  });
});

describe("paramsSchema", () => {
  it("accepts a flat charm", () => {
    expect(paramsSchema.safeParse(validParams).success).toBe(true);
  });

  it("accepts a keychain tag with its own fields", () => {
    expect(
      paramsSchema.safeParse({
        templateId: "keychain-tag",
        widthMm: 50,
        thicknessMm: 3,
        holeDiameterMm: 4,
        holeInsetMm: 5,
        holePosition: "top-center",
      }).success,
    ).toBe(true);
  });

  it("rejects keychain-tag parameters without the hole fields", () => {
    expect(
      paramsSchema.safeParse({ templateId: "keychain-tag", widthMm: 50, thicknessMm: 3 }).success,
    ).toBe(false);
  });

  it("rejects hole fields sent against flat-charm", () => {
    // The discriminator earns its keep here: a saved design must never carry
    // settings its own template does not understand.
    const result = paramsSchema.safeParse({
      ...validParams,
      holeDiameterMm: 4,
      holeInsetMm: 5,
      holePosition: "top-center",
    });

    // Extra keys are stripped rather than stored, so flat-charm stays flat.
    expect(result.success).toBe(true);
    expect(result.success && "holeDiameterMm" in result.data).toBe(false);
  });

  it("rejects an unknown template", () => {
    expect(paramsSchema.safeParse({ templateId: "sculpture", widthMm: 50, thicknessMm: 3 }).success).toBe(
      false,
    );
  });

  it("rejects an unknown hole position", () => {
    expect(
      paramsSchema.safeParse({
        templateId: "keychain-tag",
        widthMm: 50,
        thicknessMm: 3,
        holeDiameterMm: 4,
        holeInsetMm: 5,
        holePosition: "middle",
      }).success,
    ).toBe(false);
  });

  it("bounds width and thickness regardless of what the UI allows", () => {
    expect(paramsSchema.safeParse({ ...validParams, widthMm: 0 }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...validParams, widthMm: 5_000 }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...validParams, thicknessMm: 0 }).success).toBe(false);
    expect(paramsSchema.safeParse({ ...validParams, thicknessMm: 500 }).success).toBe(false);
  });
});

describe("designInputSchema", () => {
  const valid = { title: "Fox charm", outline: { outer: ring(8), holes: [] }, params: validParams };

  it("accepts a complete design", () => {
    expect(designInputSchema.safeParse(valid).success).toBe(true);
  });

  it("trims the title and requires something in it", () => {
    const result = designInputSchema.safeParse({ ...valid, title: "  Fox charm  " });
    expect(result.success && result.data.title).toBe("Fox charm");
    expect(designInputSchema.safeParse({ ...valid, title: " " }).success).toBe(false);
  });

  it("caps the title length", () => {
    expect(designInputSchema.safeParse({ ...valid, title: "x".repeat(81) }).success).toBe(false);
  });

  it("stores a title verbatim rather than interpreting it", () => {
    // Titles are rendered as plain text, so markup is data, not a payload -
    // but it must survive unchanged rather than being silently mangled.
    const title = "<script>alert(1)</script>";
    const result = designInputSchema.safeParse({ ...valid, title });
    expect(result.success && result.data.title).toBe(title);
  });

  it("rejects a design with no outline", () => {
    expect(designInputSchema.safeParse({ ...valid, outline: undefined }).success).toBe(false);
  });
});
