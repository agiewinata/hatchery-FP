/**
 * Image pixels to a binary foreground mask.
 *
 * This is the first decision in the pipeline and the one a user notices most:
 * it decides what counts as "the shape" in their image. Everything downstream
 * (tracing, simplification, extrusion) is mechanical once this is settled.
 *
 * Pure: takes raw RGBA bytes, returns a mask. No canvas, no DOM - the caller
 * does the ImageData extraction, so this stays testable in plain node.
 */
import type { Mask } from "./types";

export interface MaskOptions {
  /** 0-255. With transparency present, pixels at or above this are foreground. */
  alphaThreshold: number;
  /** 0-255. For opaque images, pixels at or below this are foreground (dark ink). */
  luminanceThreshold: number;
  /** Swap foreground and background. For light artwork on a dark background. */
  invert: boolean;
}

export const DEFAULT_MASK_OPTIONS: MaskOptions = {
  alphaThreshold: 128,
  luminanceThreshold: 128,
  invert: false,
};

/**
 * Rec. 709 luma. Perceptual weighting matters here: a plain (r+g+b)/3 average
 * reads saturated colours wrongly, so a red logo on white would threshold at a
 * different place than a blue one of the same apparent darkness.
 */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Does this image carry any real transparency?
 *
 * Decides which channel means "shape". A PNG sticker with a cut-out background
 * should be read by its alpha; a photographed sketch on paper has no alpha at
 * all and must be read by darkness instead. Guessing wrong produces either a
 * solid rectangle or nothing.
 */
export function hasTransparency(rgba: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < 255) return true;
  }
  return false;
}

/** Build a binary mask from RGBA bytes. `rgba.length` must be width * height * 4. */
export function buildMask(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: MaskOptions = DEFAULT_MASK_OPTIONS,
): Mask {
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`Expected ${expected} bytes for ${width}x${height} RGBA, got ${rgba.length}.`);
  }

  const useAlpha = hasTransparency(rgba);
  const data = new Uint8Array(width * height);

  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const foreground = useAlpha
      ? rgba[i + 3]! >= options.alphaThreshold
      : luminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) <= options.luminanceThreshold;

    data[p] = (options.invert ? !foreground : foreground) ? 1 : 0;
  }

  return { data, width, height };
}

/** Is (x,y) foreground? Out-of-bounds reads as background, so edges close cleanly. */
export function at(mask: Mask, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
  return mask.data[y * mask.width + x] === 1;
}

/** How much of the image is foreground, 0..1. Used to warn about a bad threshold. */
export function coverage(mask: Mask): number {
  let count = 0;
  for (let i = 0; i < mask.data.length; i++) count += mask.data[i]!;
  return mask.data.length === 0 ? 0 : count / mask.data.length;
}
