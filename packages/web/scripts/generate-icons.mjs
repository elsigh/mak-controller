import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../public");

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header, data])));
  return Buffer.concat([len, header, data, crc]);
}

function encodePng(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function roundedRect(px, py, size, radius) {
  const x = Math.max(0, Math.min(1, (px - (0.5 - size / 2)) / size));
  const y = Math.max(0, Math.min(1, (py - (0.5 - size / 2)) / size));
  const nx = x * size;
  const ny = y * size;
  const r = radius;
  const inside =
    (nx >= r && nx <= size - r) ||
    (ny >= r && ny <= size - r) ||
    (nx - r) ** 2 + (ny - r) ** 2 <= r * r ||
    (nx - (size - r)) ** 2 + (ny - r) ** 2 <= r * r ||
    (nx - r) ** 2 + (ny - (size - r)) ** 2 <= r * r ||
    (nx - (size - r)) ** 2 + (ny - (size - r)) ** 2 <= r * r;
  const inBox = px >= 0.5 - size / 2 && px <= 0.5 + size / 2 && py >= 0.5 - size / 2 && py <= 0.5 + size / 2;
  return inBox && inside;
}

function stamp(px, py, x0, y0, x1, y1, width) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (len * len)));
  const cx = x0 + dx * t;
  const cy = y0 + dy * t;
  return Math.hypot(px - cx, py - cy) <= width;
}

function circle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) <= r;
}

function ring(px, py, cx, cy, r, width) {
  const d = Math.hypot(px - cx, py - cy);
  return Math.abs(d - r) <= width;
}

function letterM(px, py, left, top, w, h, stroke) {
  const x = (px - left) / w;
  const y = (py - top) / h;
  return (
    stamp(x, y, 0.08, 0.88, 0.08, 0.14, stroke) ||
    stamp(x, y, 0.08, 0.14, 0.5, 0.62, stroke) ||
    stamp(x, y, 0.5, 0.62, 0.92, 0.14, stroke) ||
    stamp(x, y, 0.92, 0.14, 0.92, 0.88, stroke)
  );
}

function letterG(px, py, left, top, w, h, stroke) {
  const x = (px - left) / w;
  const y = (py - top) / h;
  const cx = 0.5;
  const cy = 0.5;
  const r = 0.36;
  const ang = Math.atan2(y - cy, x - cx);
  const onArc = ring(x, y, cx, cy, r, stroke) && !(ang > -0.35 && ang < 0.55);
  const bar = stamp(x, y, 0.48, 0.5, 0.86, 0.5, stroke);
  const stem = stamp(x, y, 0.86, 0.5, 0.86, 0.78, stroke);
  return onArc || bar || stem || circle(x, y, 0.14, 0.5, stroke);
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const badge = 0.78;
  const radius = badge * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;
      const i = (y * size + x) * 4;
      pixels[i] = 9;
      pixels[i + 1] = 8;
      pixels[i + 2] = 7;
      pixels[i + 3] = 255;

      if (!roundedRect(px, py, badge, radius)) continue;
      const t = (px + py) / 2;
      pixels[i] = Math.round(mix(245, 255, t));
      pixels[i + 1] = Math.round(mix(165, 106, t));
      pixels[i + 2] = Math.round(mix(36, 42, t));

      const stroke = 0.11;
      const ink =
        letterM(px, py, 0.2, 0.28, 0.28, 0.44, stroke) ||
        letterG(px, py, 0.5, 0.28, 0.3, 0.44, stroke);
      if (ink) {
        pixels[i] = 9;
        pixels[i + 1] = 8;
        pixels[i + 2] = 7;
      }
    }
  }
  return encodePng(size, size, pixels);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon-192.png"), drawIcon(192));
writeFileSync(join(outDir, "icon-512.png"), drawIcon(512));
writeFileSync(join(outDir, "apple-touch-icon.png"), drawIcon(180));
writeFileSync(join(outDir, "apple-touch-icon-precomposed.png"), drawIcon(180));
console.log("wrote MakGrill PWA icons to", outDir);
