/**
 * Magic-byte detection tests.
 *
 * The attacks these guard against: a script or HTML file renamed to .png, and
 * an SVG (which is XML and can carry <script>) presented as an image.
 */
import { describe, expect, it } from "vitest";

import { detectImageKind } from "./upload";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

describe("recognises real image formats", () => {
  it("detects PNG", () => {
    expect(detectImageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe(
      "png",
    );
  });

  it("detects JPEG", () => {
    expect(detectImageKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("jpeg");
  });

  it("detects GIF87a and GIF89a", () => {
    expect(detectImageKind(ascii("GIF87a..."))).toBe("gif");
    expect(detectImageKind(ascii("GIF89a..."))).toBe("gif");
  });

  it("detects WebP", () => {
    // "RIFF" + 4 size bytes + "WEBP"
    const webp = new Uint8Array(16);
    webp.set(ascii("RIFF"), 0);
    webp.set(ascii("WEBP"), 8);
    expect(detectImageKind(webp)).toBe("webp");
  });
});

describe("rejects things that are not images", () => {
  it("REJECTS an SVG, even though browsers render it as an image", () => {
    // SVG is XML and can contain <script>. Accepting it would be stored XSS.
    expect(detectImageKind(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it("REJECTS an SVG with an XML declaration first", () => {
    expect(detectImageKind(ascii('<?xml version="1.0"?><svg onload="alert(1)">'))).toBeNull();
  });

  it("REJECTS HTML", () => {
    expect(detectImageKind(ascii("<!DOCTYPE html><html><script>"))).toBeNull();
  });

  it("REJECTS a Windows executable", () => {
    expect(detectImageKind(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
  });

  it("REJECTS an ELF binary", () => {
    expect(detectImageKind(bytes(0x7f, 0x45, 0x4c, 0x46))).toBeNull();
  });

  it("REJECTS a ZIP (which is what a .docx or .jar really is)", () => {
    expect(detectImageKind(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
  });

  it("REJECTS a shell script", () => {
    expect(detectImageKind(ascii("#!/bin/sh\nrm -rf /"))).toBeNull();
  });

  it("REJECTS a PHP file", () => {
    expect(detectImageKind(ascii('<?php system($_GET["c"]); ?>'))).toBeNull();
  });
});

describe("rejects near-misses rather than guessing", () => {
  it("rejects a RIFF container that is not WebP (a WAV file)", () => {
    const wav = new Uint8Array(16);
    wav.set(ascii("RIFF"), 0);
    wav.set(ascii("WAVE"), 8);
    expect(detectImageKind(wav)).toBeNull();
  });

  it("rejects a truncated PNG signature", () => {
    expect(detectImageKind(bytes(0x89, 0x50, 0x4e))).toBeNull();
  });

  it("rejects a PNG signature that appears later in the file", () => {
    // A polyglot: harmless bytes first, PNG magic at an offset. Only the start
    // of the file is authoritative.
    expect(detectImageKind(bytes(0x00, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBeNull();
  });

  it("rejects empty input", () => {
    expect(detectImageKind(new Uint8Array())).toBeNull();
  });

  it("rejects a GIF with a bad version digit", () => {
    expect(detectImageKind(ascii("GIF88a..."))).toBeNull();
  });
});
