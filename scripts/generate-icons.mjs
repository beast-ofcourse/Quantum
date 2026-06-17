import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.resolve(__dirname, "..", "src-tauri", "icons");
const SVG_PATH = path.resolve(__dirname, "icon.svg");

const SVG = fs.readFileSync(SVG_PATH, "utf-8");

function render(size) {
  return sharp(Buffer.from(SVG))
    .resize(size, size, { kernel: "mitchell", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function png(size, outputPath) {
  const buf = await render(size);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  console.log(`  ${path.basename(outputPath)}  (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function ico() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const imgs = await Promise.all(sizes.map(s => render(s).then(b => ({ size: s, buf: b }))));
  const count = imgs.length;
  const headerSize = 6 + count * 16;
  let dataOff = headerSize;
  const offsets = imgs.map(i => { const o = dataOff; dataOff += i.buf.length; return o; });

  const total = dataOff;
  const buf = Buffer.alloc(total);
  let off = 0;
  buf.writeUInt16LE(0, off); off += 2;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt16LE(count, off); off += 2;
  for (let i = 0; i < count; i++) {
    const s = imgs[i].size;
    buf[off] = s >= 256 ? 0 : s; off += 1;
    buf[off] = s >= 256 ? 0 : s; off += 1;
    buf[off] = 0; off += 1;
    buf[off] = 0; off += 1;
    buf.writeUInt16LE(1, off); off += 2;
    buf.writeUInt16LE(32, off); off += 2;
    buf.writeUInt32LE(imgs[i].buf.length, off); off += 4;
    buf.writeUInt32LE(offsets[i], off); off += 4;
  }
  for (const img of imgs) {
    img.buf.copy(buf, off);
    off += img.buf.length;
  }
  const p = path.join(ICONS_DIR, "icon.ico");
  fs.writeFileSync(p, buf);
  console.log(`  icon.ico  (${(buf.length / 1024).toFixed(1)} KB)  [${sizes.join(", ")}]`);
}

async function icns() {
  const buf = await render(512);
  const hdr = Buffer.alloc(8);
  hdr.write("icns", 0, 4, "ascii");
  const entryType = Buffer.from("ic09", "ascii");
  const entryHdr = Buffer.alloc(8);
  entryType.copy(entryHdr, 0);
  entryHdr.writeUInt32BE(8 + buf.length, 4);
  const entry = Buffer.concat([entryHdr, buf]);
  hdr.writeUInt32BE(8 + entry.length, 4);
  const p = path.join(ICONS_DIR, "icon.icns");
  fs.writeFileSync(p, Buffer.concat([hdr, entry]));
  console.log(`  icon.icns  (${((8 + entry.length) / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log("Generating DNA helix icons...\n");

  await png(1024, path.join(ICONS_DIR, "icon.png"));
  await png(256, path.join(ICONS_DIR, "128x128@2x.png"));
  await png(128, path.join(ICONS_DIR, "128x128.png"));
  await png(32, path.join(ICONS_DIR, "32x32.png"));

  console.log();
  await ico();
  console.log();
  await icns();

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
