import { describe, expect, it } from "vitest";

import { buildGeometry } from "./geometry";
import {
  isWatertight,
  signedVolume,
  stlByteLength,
  STL_HEADER_BYTES,
  toBinaryStl,
  triangleCount,
} from "./stl";
import type { Mesh, Outline } from "./types";

const SQUARE: Outline = {
  outer: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
  holes: [],
};

const box = () => buildGeometry(SQUARE, { widthMm: 20, thicknessMm: 2 });

describe("toBinaryStl", () => {
  it("writes exactly 84 + 50n bytes", () => {
    const mesh = box();
    const buffer = toBinaryStl(mesh);

    expect(buffer.byteLength).toBe(84 + triangleCount(mesh) * 50);
    expect(buffer.byteLength).toBe(stlByteLength(mesh));
  });

  it("records the triangle count in the header", () => {
    const mesh = box();
    const view = new DataView(toBinaryStl(mesh));

    expect(view.getUint32(STL_HEADER_BYTES, true)).toBe(triangleCount(mesh));
  });

  it("does not begin with 'solid', which would be read as an ASCII STL", () => {
    const header = new TextDecoder().decode(new Uint8Array(toBinaryStl(box()), 0, 5));
    expect(header.toLowerCase()).not.toBe("solid");
  });

  it("truncates an over-long header rather than shifting the payload", () => {
    const mesh = box();
    const buffer = toBinaryStl(mesh, "x".repeat(500));

    expect(buffer.byteLength).toBe(stlByteLength(mesh));
    // The count must still land at byte 80, not be pushed along by the header.
    expect(new DataView(buffer).getUint32(STL_HEADER_BYTES, true)).toBe(triangleCount(mesh));
  });

  it("writes unit-length normals for every face", () => {
    const mesh = box();
    const view = new DataView(toBinaryStl(mesh));

    for (let i = 0; i < triangleCount(mesh); i++) {
      const at = STL_HEADER_BYTES + 4 + i * 50;
      const length = Math.hypot(
        view.getFloat32(at, true),
        view.getFloat32(at + 4, true),
        view.getFloat32(at + 8, true),
      );
      expect(length).toBeCloseTo(1, 5);
    }
  });

  it("round-trips vertex coordinates into the triangle records", () => {
    const mesh = box();
    const view = new DataView(toBinaryStl(mesh));

    // First triangle's first vertex, read back out of the binary payload.
    const at = STL_HEADER_BYTES + 4 + 12;
    const x = view.getFloat32(at, true);
    const y = view.getFloat32(at + 4, true);
    const z = view.getFloat32(at + 8, true);

    const index = mesh.indices[0]!;
    expect(x).toBeCloseTo(mesh.positions[index * 3]!, 4);
    expect(y).toBeCloseTo(mesh.positions[index * 3 + 1]!, 4);
    expect(z).toBeCloseTo(mesh.positions[index * 3 + 2]!, 4);
  });

  it("handles an empty mesh without producing a malformed file", () => {
    const empty: Mesh = { positions: new Float32Array(), indices: new Uint32Array() };
    expect(toBinaryStl(empty).byteLength).toBe(84);
  });
});

describe("isWatertight", () => {
  it("accepts a closed solid", () => {
    expect(isWatertight(box())).toBe(true);
  });

  it("rejects a surface with a boundary", () => {
    // A single triangle: its edges have no opposing partners.
    const sheet: Mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    expect(isWatertight(sheet)).toBe(false);
  });

  it("rejects an inconsistently wound mesh even when every edge is shared", () => {
    // Two triangles sharing an edge in the SAME direction: edge-count alone
    // would call this fine, which is why the check is on directed edges.
    const flipped: Mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 1, 3]),
    };
    expect(isWatertight(flipped)).toBe(false);
  });
});

describe("signedVolume", () => {
  it("is positive for an outward-facing solid", () => {
    expect(signedVolume(box())).toBeGreaterThan(0);
  });

  it("flips sign when the winding is reversed", () => {
    const mesh = box();
    const reversed: Mesh = {
      positions: mesh.positions,
      indices: new Uint32Array(mesh.indices),
    };
    for (let i = 0; i < reversed.indices.length; i += 3) {
      const t = reversed.indices[i]!;
      reversed.indices[i] = reversed.indices[i + 2]!;
      reversed.indices[i + 2] = t;
    }

    expect(signedVolume(reversed)).toBeCloseTo(-signedVolume(mesh), 4);
  });
});
