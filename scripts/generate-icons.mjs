import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter None
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToPolyEdge(px, py, poly) {
  let minDist = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distToSegment(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function renderFlashIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const scale = maskable ? 0.68 : 0.88;

  // Bolt polygon normalized around [-1, 1]
  const rawBolt = [
    [0.09, -0.59],
    [-0.36, 0.06],
    [-0.02, 0.06],
    [-0.09, 0.59],
    [0.36, -0.06],
    [0.02, -0.06],
  ];
  const bolt = rawBolt.map(([nx, ny]) => [
    cx + nx * (size * 0.5 * scale),
    cy + ny * (size * 0.5 * scale),
  ]);

  const ringRadius = size * 0.28 * scale;
  const ringHalfWidth = size * 0.018 * scale;
  const cornerRadius = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded rect alpha for non-maskable icons
      let alpha = 1;
      if (!maskable && cornerRadius > 0) {
        const dx = Math.max(0, Math.abs(x + 0.5 - cx) - (size / 2 - cornerRadius));
        const dy = Math.max(0, Math.abs(y + 0.5 - cy) - (size / 2 - cornerRadius));
        const cornerDist = Math.hypot(dx, dy) - cornerRadius;
        if (cornerDist > 0.75) alpha = 0;
        else if (cornerDist > -0.75) alpha = 1 - (cornerDist + 0.75) / 1.5;
      }

      if (alpha <= 0) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
        continue;
      }

      // Background dark obsidian #0B0B0D with subtle radial warmth
      const distCenter = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const glow = Math.max(0, 1 - distCenter / (size * 0.65));
      let r = 11 + Math.round(14 * glow);
      let g = 11 + Math.round(9 * glow);
      let b = 13 + Math.round(8 * glow);

      // Subtle shutter aperture ring
      const ringDiff = Math.abs(distCenter - ringRadius);
      if (ringDiff < ringHalfWidth + 1) {
        const ringAlpha = Math.max(0, Math.min(1, ringHalfWidth + 1 - ringDiff)) * 0.35;
        r = Math.round(r * (1 - ringAlpha) + 255 * ringAlpha);
        g = Math.round(g * (1 - ringAlpha) + 90 * ringAlpha);
        b = Math.round(b * (1 - ringAlpha) + 31 * ringAlpha);
      }

      // Flash bolt fill (#FF5A1F -> #FFB800 gradient) with crisp anti-aliased edge
      const px = x + 0.5;
      const py = y + 0.5;
      const inside = pointInPoly(px, py, bolt);
      const edgeDist = distToPolyEdge(px, py, bolt);
      const signedDist = inside ? -edgeDist : edgeDist;
      const boltAlpha = Math.max(0, Math.min(1, 0.5 - signedDist));

      if (boltAlpha > 0) {
        const t = Math.max(0, Math.min(1, (py - (cy - size * 0.3)) / (size * 0.6)));
        const br = 255;
        const bg = Math.round(142 - 52 * t);
        const bb = Math.round(45 - 14 * t);
        r = Math.round(r * (1 - boltAlpha) + br * boltAlpha);
        g = Math.round(g * (1 - boltAlpha) + bg * boltAlpha);
        b = Math.round(b * (1 - boltAlpha) + bb * boltAlpha);
      }

      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = Math.round(255 * alpha);
    }
  }

  return encodePNG(size, size, rgba);
}

const outDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), renderFlashIcon(192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), renderFlashIcon(512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), renderFlashIcon(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderFlashIcon(180, true));

console.log('Generated PWA PNG icons in public/');
