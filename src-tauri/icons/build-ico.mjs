// Rebuilds icon.ico with the simple drawing (icon-small.svg, no stroke on the cover) for
// the 16 and 24 px layers, where the full one blurs. Run after `npx tauri icon`:
//   npx tauri icon src-tauri/icons/icon-small.svg -o <temp dir>
//   node src-tauri/icons/build-ico.mjs <temp dir>/icon.ico
import { readFileSync, writeFileSync } from 'node:fs';

const SMALL = [16, 24];

/** The PNG layers of an .ico, by size. */
function layers(path) {
  const ico = readFileSync(path);
  const result = new Map();
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const entry = 6 + i * 16;
    const size = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    result.set(ico[entry] || 256, ico.subarray(offset, offset + size));
  }
  return result;
}

const target = new URL('icon.ico', import.meta.url);
const full = layers(target);
const small = layers(process.argv[2]);
for (const size of SMALL) full.set(size, small.get(size));

const sizes = [...full.keys()].sort((a, b) => a - b);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  const png = full.get(size);
  header[entry] = size % 256;
  header[entry + 1] = size % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
writeFileSync(target, Buffer.concat([header, ...sizes.map((size) => full.get(size))]));
