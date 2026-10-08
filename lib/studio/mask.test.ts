import { describe, expect, it } from "vitest";

import { at, buildMask, coverage, hasTransparency, luminance } from "./mask";

/** Build RGBA bytes from per-pixel [r,g,b,a] tuples. */
function rgbaFrom(pixels: [number, number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  });
  return out;
}

const OPAQUE_BLACK: [number, number, number, number] = [0, 0, 0, 255];
const OPAQUE_WHITE: [number, number, number, number] = [255, 255, 255, 255];
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

describe("luminance", () => {
  it("weights channels perceptually rather than averaging them", () => {
    // Rec. 709: green dominates, blue barely registers. A flat average would
    // make these three equal and threshold saturated artwork wrongly.
    expect(luminance(255, 0, 0)).toBeCloseTo(54.2, 1);
    expect(luminance(0, 255, 0)).toBeCloseTo(182.4, 1);
    expect(luminance(0, 0, 255)).toBeCloseTo(18.4, 1);
  });
});

describe("hasTransparency", () => {
  it("is false when every pixel is fully opaque", () => {
    expect(hasTransparency(rgbaFrom([OPAQUE_BLACK, OPAQUE_WHITE]))).toBe(false);
  });

  it("is true as soon as one pixel is not", () => {
    expect(hasTransparency(rgbaFrom([OPAQUE_BLACK, CLEAR]))).toBe(true);
  });
});

describe("buildMask", () => {
  it("rejects a byte length that does not match the dimensions", () => {
    expect(() => buildMask(rgbaFrom([OPAQUE_BLACK]), 2, 2)).toThrow(/Expected 16 bytes/);
  });

  it("reads an image with transparency by its alpha channel", () => {
    // Both pixels are black; only alpha separates them. Reading by luminance
    // here would mark the transparent one as foreground too.
    const mask = buildMask(rgbaFrom([OPAQUE_BLACK, CLEAR]), 2, 1);
    expect(at(mask, 0, 0)).toBe(true);
    expect(at(mask, 1, 0)).toBe(false);
  });

  it("reads a fully opaque image by darkness", () => {
    const mask = buildMask(rgbaFrom([OPAQUE_BLACK, OPAQUE_WHITE]), 2, 1);
    expect(at(mask, 0, 0)).toBe(true);
    expect(at(mask, 1, 0)).toBe(false);
  });

  it("inverts foreground and background on request", () => {
    const mask = buildMask(rgbaFrom([OPAQUE_BLACK, OPAQUE_WHITE]), 2, 1, {
      alphaThreshold: 128,
      luminanceThreshold: 128,
      invert: true,
    });
    expect(at(mask, 0, 0)).toBe(false);
    expect(at(mask, 1, 0)).toBe(true);
  });

  it("produces an empty mask from a fully transparent image", () => {
    const mask = buildMask(rgbaFrom([CLEAR, CLEAR, CLEAR, CLEAR]), 2, 2);
    expect(coverage(mask)).toBe(0);
  });

  it("produces a full mask from a fully black opaque image", () => {
    const mask = buildMask(rgbaFrom([OPAQUE_BLACK, OPAQUE_BLACK]), 2, 1);
    expect(coverage(mask)).toBe(1);
  });
});

describe("at", () => {
  it("reads outside the image as background so boundaries close", () => {
    const mask = buildMask(rgbaFrom([OPAQUE_BLACK]), 1, 1);
    expect(at(mask, 0, 0)).toBe(true);
    expect(at(mask, -1, 0)).toBe(false);
    expect(at(mask, 0, -1)).toBe(false);
    expect(at(mask, 1, 0)).toBe(false);
    expect(at(mask, 0, 1)).toBe(false);
  });
});
