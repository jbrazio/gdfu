import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const splashDirectory = `${root}ios/App/App/Assets.xcassets/Splash.imageset`;
const splashFiles = [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
];

function decodePng(path: string) {
  const png = readFileSync(path);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 2732);
  assert.equal(png.readUInt32BE(20), 2732);
  assert.equal(png[25], 2, "splash must use RGB pixels");

  let offset = 8;
  const chunks: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(chunks));
}

const pixels = splashFiles.map((file) => decodePng(`${splashDirectory}/${file}`));
assert.deepEqual(pixels[1], pixels[0]);
assert.deepEqual(pixels[2], pixels[0]);

const rowLength = 1 + 2732 * 3;
const brandingOffset = 1254 * rowLength + 1 + 1254 * 3;
assert.deepEqual(pixels[0].subarray(1, 4), Buffer.from([16, 26, 35]));
assert.notDeepEqual(
  pixels[0].subarray(brandingOffset, brandingOffset + 3),
  pixels[0].subarray(1, 4),
  "splash must contain GFSK DFU branding",
);
