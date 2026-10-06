/**
 * Generates placeholder artwork PNGs for the seed products.
 *
 * Written as real PNGs rather than SVGs on purpose: serving SVG through
 * next/image would require `dangerouslyAllowSVG`, which weakens the upload
 * defences in lib/upload.ts for the sake of demo data. A tiny PNG encoder is
 * the cheaper trade.
 *
 *   node scripts/make-seed-images.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SIZE = 600;

/** CRC32, as PNG requires for every chunk. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function png(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  // 10..12 = compression, filter, interlace, all 0

  // Each scanline is prefixed with a filter-type byte (0 = none).
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgb(x, y);
      const i = y * stride + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));

/**
 * Each placeholder is a soft two-colour field with a single off-centre disc -
 * enough to read as "a charm with art on it" at thumbnail size without
 * pretending to be real artwork.
 */
function artwork(fromHex, toHex, cx, cy) {
  const from = hex(fromHex);
  const to = hex(toHex);
  const paper = hex("#ffffff");

  return (x, y) => {
    const nx = x / SIZE;
    const ny = y / SIZE;

    // Diagonal wash.
    let colour = mix(from, to, (nx + ny) / 2);

    // The disc, with a soft edge.
    const dx = nx - cx;
    const dy = ny - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const edge = 0.26;
    if (dist < edge) {
      colour = mix(paper, colour, Math.pow(dist / edge, 2.2) * 0.55);
    }

    // A quiet border so the tile has an edge against the card.
    if (nx < 0.012 || ny < 0.012 || nx > 0.988 || ny > 0.988) {
      colour = mix(colour, hex("#15312a"), 0.18);
    }

    return colour;
  };
}

const IMAGES = {
  // Mira: cooler greens and brass.
  "fox.png": artwork("#2f5d4e", "#a8803c", 0.38, 0.42),
  "market.png": artwork("#15312a", "#d81e73", 0.62, 0.38),
  "rain.png": artwork("#3f6f7a", "#c3d2cd", 0.45, 0.55),
  "komodo.png": artwork("#4e7c6c", "#e9ede8", 0.55, 0.45),
  // Deni: warmer, print-shop inks.
  "warung.png": artwork("#a8803c", "#15312a", 0.42, 0.58),
  "bemo.png": artwork("#d81e73", "#2f5d4e", 0.5, 0.4),
  "transit.png": artwork("#15312a", "#c3d2cd", 0.6, 0.5),
  "kretek.png": artwork("#8a3b2a", "#a8803c", 0.4, 0.5),
};

const outDir = path.join(process.cwd(), "public", "seed");
mkdirSync(outDir, { recursive: true });

for (const [name, rgb] of Object.entries(IMAGES)) {
  const buffer = png(SIZE, SIZE, rgb);
  writeFileSync(path.join(outDir, name), buffer);
  console.log(`  ${name.padEnd(14)} ${(buffer.length / 1024).toFixed(1)} KB`);
}

console.log(`\nWrote ${Object.keys(IMAGES).length} placeholder images to public/seed/`);
