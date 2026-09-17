#!/usr/bin/env node
// Draws the dgames app icons and writes them as PNGs. Run: node scripts/make-icons.js
//
// The icons are committed, so this only needs running when the mark changes — it exists so the PNGs are
// reproducible rather than binary files nobody can edit. No dependencies: PNG is a container around a
// zlib stream, and node ships zlib, so the whole encoder is the ~40 lines below.
//
// The mark is a five-pip die face: geometric, so it stays legible at 48px, and it reads as "games"
// without spelling anything, which matters because a launcher icon is rendered at sizes where text dies.
//
// Two shapes are produced. The plain icon draws its own rounded corners. The maskable one must not:
// Android crops a maskable icon to whatever shape the launcher prefers (circle, squircle, teardrop), so
// its background runs to all four edges and the pips stay inside the central 80% safe zone the spec
// guarantees will survive the crop. Shipping only a plain icon is what gives you a rounded square
// letterboxed inside another rounded square on the home screen.
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const NAVY = [0x0b, 0x1a, 0x2b];
const GOLD = [0xff, 0xd5, 0x4a];

// --- PNG encoding ---------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
// rgba: a width*height*4 byte buffer.
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;      // 8 bits per channel
  ihdr[9] = 6;      // colour type 6 = RGBA
  // 10..12 are compression, filter and interlace methods; 0 is the only value defined for each.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;   // filter type 0 (None) for every scanline
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing --------------------------------------------------------------
// Coverage of one pixel by a shape, sampled on a 4x4 grid. Cheap supersampling: circles this size look
// ragged without it, and a ragged icon is the first thing anyone notices on a home screen.
const SS = 4;
function coverage(px, py, inside) {
  let hits = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      if (inside(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)) hits++;
    }
  }
  return hits / (SS * SS);
}
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
// Rounded rectangle covering the whole canvas, corner radius r.
const roundedSquare = (size, r) => (x, y) => {
  const dx = Math.max(r - x, 0, x - (size - r));
  const dy = Math.max(r - y, 0, y - (size - r));
  return dx * dx + dy * dy <= r * r;
};

function draw(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  // A maskable icon is cropped by the launcher, so it must bleed to the edges; a plain one draws its own
  // corners. `pipScale` keeps the pips inside the 80% safe circle when the crop is unknown.
  const bg = maskable ? () => true : roundedSquare(size, size * 0.22);
  const pipScale = maskable ? 0.56 : 0.60;

  // Quincunx: four corners plus the centre, laid out on a 3x3 grid inside the pip area.
  const off = size * pipScale * 0.5;
  const c = size / 2;
  const pipR = size * pipScale * 0.155;
  const pips = [[c - off, c - off], [c + off, c - off], [c, c], [c - off, c + off], [c + off, c + off]]
    .map(([x, y]) => circle(x, y, pipR));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = coverage(x, y, bg);
      if (a === 0) continue;                       // transparent outside the rounded square
      let col = NAVY;
      let pip = 0;
      for (const p of pips) { pip = Math.max(pip, coverage(x, y, p)); if (pip === 1) break; }
      if (pip > 0) col = NAVY.map((n, k) => Math.round(n + (GOLD[k] - n) * pip));
      rgba[i] = col[0]; rgba[i + 1] = col[1]; rgba[i + 2] = col[2];
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const ICONS = [
  ['icons/icon-192.png', 192, { maskable: false }],
  ['icons/icon-512.png', 512, { maskable: false }],
  ['icons/icon-maskable-512.png', 512, { maskable: true }],
  // iOS ignores the manifest and reads <link rel="apple-touch-icon">, which must not be transparent —
  // it composites onto black, so a rounded icon gets black corners. Full bleed, like the maskable one.
  ['icons/apple-touch-icon.png', 180, { maskable: true }],
];

const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
for (const [file, size, opts] of ICONS) {
  const png = draw(size, opts);
  fs.writeFileSync(path.join(root, file), png);
  console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
