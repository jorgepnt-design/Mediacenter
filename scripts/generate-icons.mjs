/**
 * Erzeugt alle PWA-Icons und iOS-Splashscreens ohne externe Abhaengigkeiten.
 * Gezeichnet wird mit 3x-Supersampling, kodiert wird als PNG (zlib aus Node).
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------- PNG encoder ------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // Filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------- Zeichnen -------------------------------- */

const SS = 3; // Supersampling-Faktor

const mix = (a, b, t) => a + (b - a) * t;

function insideRoundedRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx;
  const dy = y - cy;
  if (x >= r && x <= w - r) return y >= 0 && y <= h;
  if (y >= r && y <= h - r) return x >= 0 && x <= w;
  return dx * dx + dy * dy <= r * r;
}

function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * Das Markenzeichen: ein offener Kreisring (Konvertieren) mit Pfeilspitze
 * und einem Play-Dreieck in der Mitte.
 */
function glyphAlpha(u, v, scale) {
  // u,v in -0.5..0.5 relativ zur Icon-Kante
  const x = u / scale;
  const y = v / scale;
  const r = Math.hypot(x, y);
  const angle = Math.atan2(y, x); // -PI..PI

  // Ring mit Luecke zwischen -75deg und +5deg
  const gapFrom = (-78 * Math.PI) / 180;
  const gapTo = (8 * Math.PI) / 180;
  const inGap = angle > gapFrom && angle < gapTo;
  if (!inGap && r <= 0.46 && r >= 0.355) return true;

  // Pfeilspitze am Ende des Rings (oben rechts)
  const tipA = { x: Math.cos(gapTo) * 0.3, y: Math.sin(gapTo) * 0.3 };
  const tipB = { x: Math.cos(gapTo) * 0.52, y: Math.sin(gapTo) * 0.52 };
  const tipC = { x: Math.cos(gapTo + 0.42) * 0.41, y: Math.sin(gapTo + 0.42) * 0.41 };
  if (insideTriangle(x, y, tipA.x, tipA.y, tipB.x, tipB.y, tipC.x, tipC.y)) return true;

  // Play-Dreieck
  if (insideTriangle(x, y, -0.13, -0.21, -0.13, 0.21, 0.22, 0)) return true;

  return false;
}

function render({ size, radius, glyphScale, background, solid }) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bgHits = 0;
      let glyphHits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          if (solid || insideRoundedRect(fx, fy, size, size, radius)) bgHits += 1;
          if (glyphAlpha(fx / size - 0.5, fy / size - 0.5, glyphScale)) glyphHits += 1;
        }
      }
      const samples = SS * SS;
      const bgA = bgHits / samples;
      const glyphA = glyphHits / samples;
      const t = (x / size + y / size) / 2;
      const base = background
        ? background
        : [mix(0x3a, 0x16, t), mix(0x8e, 0x3b, t), mix(0xff, 0xa8, t)];
      const i = (y * size + x) * 4;
      px[i] = Math.round(mix(base[0], 255, glyphA));
      px[i + 1] = Math.round(mix(base[1], 255, glyphA));
      px[i + 2] = Math.round(mix(base[2], 255, glyphA));
      px[i + 3] = Math.round(Math.max(bgA, glyphA) * 255);
    }
  }
  return encodePng(size, size, px);
}

function renderSplash(width, height) {
  const px = Buffer.alloc(width * height * 4);
  const logo = Math.round(Math.min(width, height) * 0.34);
  const ox = Math.round((width - logo) / 2);
  const oy = Math.round((height - logo) / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      px[i] = 0x0b;
      px[i + 1] = 0x12;
      px[i + 2] = 0x20;
      px[i + 3] = 255;
      if (x >= ox && x < ox + logo && y >= oy && y < oy + logo) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy += 1) {
          for (let sx = 0; sx < SS; sx += 1) {
            const fx = (x - ox + (sx + 0.5) / SS) / logo - 0.5;
            const fy = (y - oy + (sy + 0.5) / SS) / logo - 0.5;
            if (glyphAlpha(fx, fy, 0.92)) hits += 1;
          }
        }
        const a = hits / (SS * SS);
        px[i] = Math.round(mix(0x0b, 0x59, a) + a * 0x6d);
        px[i + 1] = Math.round(mix(0x12, 0xa6, a));
        px[i + 2] = Math.round(mix(0x20, 0xff, a));
      }
    }
  }
  return encodePng(width, height, px);
}

function write(path, buffer) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  console.log(`${path} – ${(buffer.length / 1024).toFixed(1)} kB`);
}

write('public/icons/icon-192.png', render({ size: 192, radius: 42, glyphScale: 0.92 }));
write('public/icons/icon-512.png', render({ size: 512, radius: 112, glyphScale: 0.92 }));
write(
  'public/icons/icon-maskable-512.png',
  render({ size: 512, radius: 0, glyphScale: 0.62, solid: true }),
);
write(
  'public/icons/apple-touch-icon.png',
  render({ size: 180, radius: 0, glyphScale: 0.86, solid: true }),
);
write('public/icons/favicon.png', render({ size: 64, radius: 14, glyphScale: 0.94 }));

for (const [w, h] of [
  [1290, 2796],
  [1179, 2556],
  [1170, 2532],
  [1125, 2436],
]) {
  write(`public/splash/splash-${w}x${h}.png`, renderSplash(w, h));
}
