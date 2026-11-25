import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// Precompute CRC32 table for valid PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Add filter byte 0 before each scanline
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Signed distance to a rounded rectangle centered inside [0..w, 0..h]
 */
function roundedBoxSdf(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const hw = (x1 - x0) * 0.5 - r;
  const hh = (y1 - y0) * 0.5 - r;
  const dx = Math.max(Math.abs(px - cx) - hw, 0);
  const dy = Math.max(Math.abs(py - cy) - hh, 0);
  return Math.hypot(dx, dy) - r;
}

/**
 * Generate an antialiased rounded rectangle PNG (for cards, chat bubbles, badges).
 */
export function createRoundedRectPng({
  width,
  height,
  radius = 24,
  bgRgba = [255, 255, 255, 255],
  borderRgba = null,
  borderWidth = 0,
  outPath
}) {
  const rgba = Buffer.alloc(width * height * 4);
  const [br, bg, bb, ba] = bgRgba;
  const [sr, sg, sb, sa] = borderRgba || [0, 0, 0, 0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = roundedBoxSdf(x + 0.5, y + 0.5, 0, 0, width, height, radius);
      const idx = (y * width + x) * 4;
      if (dist >= 0.75) {
        continue; // transparent outside
      }
      const edgeAlpha = dist > -0.75 ? (0.75 - dist) / 1.5 : 1.0;

      let r = br, g = bg, b = bb, a = ba;
      if (borderWidth > 0 && borderRgba && dist > -borderWidth - 0.75) {
        const innerMix = Math.min(1, Math.max(0, (dist + borderWidth + 0.75) / 1.5));
        r = Math.round(br * (1 - innerMix) + sr * innerMix);
        g = Math.round(bg * (1 - innerMix) + sg * innerMix);
        b = Math.round(bb * (1 - innerMix) + sb * innerMix);
        a = Math.round(ba * (1 - innerMix) + sa * innerMix);
      }

      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = Math.round(a * edgeAlpha);
    }
  }

  writeFileSync(outPath, encodeRgbaPng(width, height, rgba));
  return outPath;
}

/**
 * Generate a circular alpha mask PNG (white opaque circle on transparent background).
 */
export function createCircleMaskPng({ size, outPath }) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.5 - 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
      if (dist >= 0.75) continue;
      const alpha = dist > -0.75 ? (0.75 - dist) / 1.5 : 1.0;
      const idx = (y * size + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
      rgba[idx + 3] = Math.round(255 * alpha);
    }
  }

  writeFileSync(outPath, encodeRgbaPng(size, size, rgba));
  return outPath;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/**
 * Generate a crisp X/Twitter Verified Blue Badge PNG with white checkmark.
 */
export function createVerifiedBadgePng({ size = 44, outPath }) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.44;

  // Checkmark segments in normalized coordinates
  const ax = size * 0.28, ay = size * 0.52;
  const bx = size * 0.44, by = size * 0.67;
  const cx2 = size * 0.72, cy2 = size * 0.35;
  const strokeR = size * 0.065;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const angle = Math.atan2(py - cy, px - cx);
      // Subtle 8-point badge wave
      const wave = 1 + 0.06 * Math.cos(8 * angle);
      const dist = Math.hypot(px - cx, py - cy) - r * wave;
      if (dist >= 0.75) continue;

      const edgeAlpha = dist > -0.75 ? (0.75 - dist) / 1.5 : 1.0;
      const d1 = distToSegment(px, py, ax, ay, bx, by);
      const d2 = distToSegment(px, py, bx, by, cx2, cy2);
      const checkDist = Math.min(d1, d2) - strokeR;

      const idx = (y * size + x) * 4;
      if (checkDist < 0.75) {
        const checkMix = checkDist > -0.75 ? (0.75 - checkDist) / 1.5 : 1.0;
        // Blend Twitter Blue (#1D9BF0) and White (#FFFFFF)
        rgba[idx] = Math.round(29 * (1 - checkMix) + 255 * checkMix);
        rgba[idx + 1] = Math.round(155 * (1 - checkMix) + 255 * checkMix);
        rgba[idx + 2] = Math.round(240 * (1 - checkMix) + 255 * checkMix);
      } else {
        rgba[idx] = 29;
        rgba[idx + 1] = 155;
        rgba[idx + 2] = 240;
      }
      rgba[idx + 3] = Math.round(255 * edgeAlpha);
    }
  }

  writeFileSync(outPath, encodeRgbaPng(size, size, rgba));
  return outPath;
}
