import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generatePngBuffer(width, height, isMaskable = false) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = createChunk("IHDR", ihdrData);

  // Generate pixels
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2;
  const cornerR = width * 0.22;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pOffset = rowOffset + 1 + x * 4;

      // Base background gradient: Deep Teal (#144a42 to #0a2a25)
      const gradT = (x + y) / (width + height);
      let red = Math.round(20 * (1 - gradT) + 10 * gradT);
      let green = Math.round(74 * (1 - gradT) + 42 * gradT);
      let blue = Math.round(66 * (1 - gradT) + 37 * gradT);
      let alpha = 255;

      if (!isMaskable) {
        // Rounded corner mask
        const dx = Math.max(0, Math.abs(x - cx) - (width / 2 - cornerR));
        const dy = Math.max(0, Math.abs(y - cy) - (height / 2 - cornerR));
        if (dx * dx + dy * dy > cornerR * cornerR) {
          alpha = 0;
        }
      }

      // Draw emblem in center (80% safe zone for maskable, slightly larger for normal)
      const distFromCenter = Math.hypot(x - cx, y - cy);
      const emblemRadius = r * (isMaskable ? 0.45 : 0.55);

      if (distFromCenter < emblemRadius && alpha > 0) {
        // Inner gold circle
        const circleR = emblemRadius * 0.9;
        if (distFromCenter < circleR) {
          // Gold gradient (#f5c26b to #d49228)
          const gT = (x - (cx - circleR)) / (circleR * 2);
          red = Math.round(245 * (1 - gT) + 212 * gT);
          green = Math.round(194 * (1 - gT) + 146 * gT);
          blue = Math.round(107 * (1 - gT) + 40 * gT);

          // Center chai glass / rupee mark silhouette (#144a42)
          const markDist = Math.hypot(x - cx, y - cy);
          if (markDist < circleR * 0.48) {
            red = 20;
            green = 74;
            blue = 66;
          }
        }
      }

      raw[pOffset] = red;
      raw[pOffset + 1] = green;
      raw[pOffset + 2] = blue;
      raw[pOffset + 3] = alpha;
    }
  }

  const idat = createChunk("IDAT", zlib.deflateSync(raw, { level: 9 }));
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const publicDir = path.resolve("public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, "pwa-192x192.png"), generatePngBuffer(192, 192, false));
fs.writeFileSync(path.join(publicDir, "pwa-512x512.png"), generatePngBuffer(512, 512, false));
fs.writeFileSync(path.join(publicDir, "pwa-maskable-512x512.png"), generatePngBuffer(512, 512, true));
fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), generatePngBuffer(180, 180, false));

console.log("PNG icons generated successfully!");
