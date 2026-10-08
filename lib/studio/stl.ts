/**
 * Binary STL export, plus the mesh checks that belong immediately before it.
 *
 * STL is a bag of loose triangles with no topology whatsoever - it does not
 * record which triangles share an edge, so a mesh with holes in it exports
 * perfectly happily and only fails much later, in the slicer, as "non-manifold"
 * or as a print with missing walls. Writing the file is therefore the last
 * moment at which a broken solid can still be caught cheaply, which is why the
 * validators live here rather than somewhere more abstract.
 *
 * Layout (little-endian): 80-byte header, uint32 triangle count, then 50 bytes
 * per triangle - 3 floats of normal, 9 floats of vertices, 1 uint16 attribute.
 */
import type { Mesh } from "./types";

export const STL_HEADER_BYTES = 80;
export const STL_TRIANGLE_BYTES = 50;

export function triangleCount(mesh: Mesh): number {
  return mesh.indices.length / 3;
}

/** Exact byte length of the file `toBinaryStl` would produce. */
export function stlByteLength(mesh: Mesh): number {
  return STL_HEADER_BYTES + 4 + triangleCount(mesh) * STL_TRIANGLE_BYTES;
}

function vertexAt(mesh: Mesh, index: number): [number, number, number] {
  return [
    mesh.positions[index * 3]!,
    mesh.positions[index * 3 + 1]!,
    mesh.positions[index * 3 + 2]!,
  ];
}

/**
 * Is the mesh a closed, consistently-oriented surface?
 *
 * Checks that every DIRECTED edge appears exactly once. That is a stricter test
 * than counting undirected edges: a mesh where one triangle is wound backwards
 * still has every edge shared by two faces, but it is not consistently
 * oriented, and its normals will point inward in patches.
 */
export function isWatertight(mesh: Mesh): boolean {
  const seen = new Set<string>();

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;

    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = `${from}>${to}`;
      if (seen.has(key)) return false; // directed edge used twice
      seen.add(key);
    }
  }

  // Every directed edge must have its opposite present, or there is a boundary.
  for (const key of seen) {
    const [from, to] = key.split(">");
    if (!seen.has(`${to}>${from}`)) return false;
  }

  return true;
}

/**
 * Signed volume via the divergence theorem.
 *
 * Positive means the faces point outward. A solid that is inside-out passes
 * every watertightness check yet prints as a hollow shell with inverted walls,
 * so the sign is worth asserting separately from the topology.
 */
export function signedVolume(mesh: Mesh): number {
  let total = 0;

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [ax, ay, az] = vertexAt(mesh, mesh.indices[i]!);
    const [bx, by, bz] = vertexAt(mesh, mesh.indices[i + 1]!);
    const [cx, cy, cz] = vertexAt(mesh, mesh.indices[i + 2]!);

    total +=
      ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }

  return total / 6;
}

/** Write a binary STL. `header` is truncated to 80 bytes and never parsed back. */
export function toBinaryStl(mesh: Mesh, header = "Keychain Studio"): ArrayBuffer {
  const count = triangleCount(mesh);
  const buffer = new ArrayBuffer(stlByteLength(mesh));
  const view = new DataView(buffer);

  // Header. Some tools treat a leading "solid" as a signal that the file is
  // ASCII, so the text must never start with it.
  const headerBytes = new TextEncoder().encode(header).slice(0, STL_HEADER_BYTES);
  new Uint8Array(buffer, 0, STL_HEADER_BYTES).set(headerBytes);

  view.setUint32(STL_HEADER_BYTES, count, true);

  let offset = STL_HEADER_BYTES + 4;

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [ax, ay, az] = vertexAt(mesh, mesh.indices[i]!);
    const [bx, by, bz] = vertexAt(mesh, mesh.indices[i + 1]!);
    const [cx, cy, cz] = vertexAt(mesh, mesh.indices[i + 2]!);

    // Face normal from the winding, normalised. A degenerate triangle yields a
    // zero-length cross product; write zeroes rather than NaN, which some
    // slicers reject outright.
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;

    const length = Math.hypot(nx, ny, nz);
    if (length > 0) {
      nx /= length;
      ny /= length;
      nz /= length;
    } else {
      nx = ny = nz = 0;
    }

    for (const value of [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }

    view.setUint16(offset, 0, true); // attribute byte count, unused
    offset += 2;
  }

  return buffer;
}
