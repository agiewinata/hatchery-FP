/**
 * Browser-side image decoding for the studio.
 *
 * Lives under components/ rather than lib/studio/ on purpose: everything in
 * lib/studio is pure and node-testable, and this needs canvas. Keeping the
 * boundary sharp is what lets the geometry be tested without a DOM.
 *
 * SECURITY NOTE: the image never leaves the browser. There is no upload, so no
 * server-side image parsing, no stored user imagery, and nothing for the
 * magic-byte checks in lib/upload.ts to guard - decoding happens inside the
 * browser's own sandboxed image decoder and only the traced outline is ever
 * sent anywhere.
 */

export interface DecodedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Refuse absurd files before handing them to the decoder. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Longest edge the pipeline works at.
 *
 * Downscaling is not cosmetic. Tracing is O(pixels) and emits a vertex per
 * pixel boundary, so a 4000x3000 photo would mean twelve million samples and an
 * outline with hundreds of thousands of points - slow to trace, slow to render,
 * and far past the size cap the saved design is allowed to be. 512px keeps
 * detail well beyond what a 50mm charm can reproduce anyway.
 */
export const MAX_TRACE_DIMENSION = 512;

export class ImageDecodeError extends Error {}

export async function decodeImageFile(
  file: File,
  maxDimension = MAX_TRACE_DIMENSION,
): Promise<DecodedImage> {
  if (file.size === 0) throw new ImageDecodeError("That file is empty.");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageDecodeError(
      `Images must be ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB or smaller.`,
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Covers a renamed non-image, a corrupt file, and SVG in browsers that
    // refuse to rasterise it from a bare blob.
    throw new ImageDecodeError("That file could not be read as a PNG, JPEG, WebP or GIF.");
  }

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new ImageDecodeError("This browser cannot read image pixels.");

    // Preserve transparency: the default canvas is transparent black, and a PNG
    // sticker's cut-out background is exactly the signal the tracer wants.
    context.drawImage(bitmap, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    return { data: imageData.data, width, height };
  } finally {
    bitmap.close();
  }
}
