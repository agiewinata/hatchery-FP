/**
 * Image upload validation and storage.
 *
 * Uploads are the classic path from "user input" to "code execution", so the
 * rules here are strict:
 *
 *  1. The file's CONTENT decides its type, not its extension and not the
 *     Content-Type header. Both of those are attacker-chosen.
 *  2. SVG is refused outright. It is XML, it can contain <script>, and browsers
 *     execute it when it is served inline - so an "image" upload would become
 *     stored XSS.
 *  3. Filenames are generated, never taken from the upload. A supplied name can
 *     carry path traversal (../../), a double extension (x.png.html), or
 *     characters that confuse the filesystem.
 *  4. Size is capped before anything is written.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { put } from "@vercel/blob";

import { env } from "./env";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ImageKind = "png" | "jpeg" | "webp" | "gif";

const EXTENSIONS: Record<ImageKind, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  gif: "gif",
};

const MIME_TYPES: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Identify an image by its magic bytes.
 *
 * Returns null for anything unrecognised - including SVG, HTML and scripts
 * renamed to .png, which is precisely the case this exists to catch.
 */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  // PNG: \x89PNG\r\n\x1a\n
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";

  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";

  // GIF: "GIF87a" or "GIF89a"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39)) {
    return "gif";
  }

  // WEBP: "RIFF" .... "WEBP" - both parts required, since RIFF alone is also
  // used by WAV and AVI.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }

  return null;
}

export class UploadError extends Error {}

export interface StoredUpload {
  url: string;
  kind: ImageKind;
  bytes: number;
}

/**
 * Validate and store one uploaded image.
 *
 * `prefix` groups files (e.g. "products"); it is sanitised rather than trusted.
 */
export async function storeImageUpload(file: File, prefix: string): Promise<StoredUpload> {
  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `Images must be ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB or smaller.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Re-check the real size: file.size is reported by the client.
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError("That file is larger than it claimed to be.");
  }

  const kind = detectImageKind(buffer);
  if (!kind) {
    throw new UploadError(
      "That is not a PNG, JPEG, WebP or GIF image. SVG files are not accepted.",
    );
  }

  // Generated name. Nothing from the upload survives into the path.
  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, "").slice(0, 20) || "misc";
  const filename = `${randomUUID()}.${EXTENSIONS[kind]}`;
  const key = `${safePrefix}/${filename}`;

  if (env.UPLOAD_PROVIDER === "BLOB") {
    const blob = await put(key, buffer, {
      access: "public",
      contentType: MIME_TYPES[kind],
      // We already randomised the name; another suffix would only obscure it.
      addRandomSuffix: false,
    });
    return { url: blob.url, kind, bytes: buffer.byteLength };
  }

  // Local development: write under public/uploads. next.config.ts serves this
  // path with Content-Disposition: attachment so nothing can execute in-origin.
  const dir = path.join(process.cwd(), "public", "uploads", safePrefix);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);

  return { url: `/uploads/${key}`, kind, bytes: buffer.byteLength };
}
