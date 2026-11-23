import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const png = readFileSync("android/app/src/main/res/drawable-nodpi/splash_icon.png");

assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(png.readUInt32BE(16), 1024);
assert.equal(png.readUInt32BE(20), 1024);
assert.equal(png[25], 6, "splash icon needs transparent padding for Android's circular mask");

let offset = 8;
const idat: Buffer[] = [];
while (offset < png.length) {
  const length = png.readUInt32BE(offset);
  const type = png.subarray(offset + 4, offset + 8).toString("ascii");
  if (type === "IDAT") {
    idat.push(png.subarray(offset + 8, offset + 8 + length));
  }
  offset += length + 12;
}
const pixels = inflateSync(Buffer.concat(idat));
const pixel = (x: number, y: number): Buffer => {
  const row = y * (1 + 1024 * 4);
  assert.equal(pixels[row], 0, "splash PNG rows must be directly readable");
  return pixels.subarray(row + 1 + x * 4, row + 5 + x * 4);
};

assert.equal(pixel(0, 0)[3], 0, "corner must stay transparent outside Android's mask");
assert.deepEqual(
  [...pixel(205, 337)],
  [250, 251, 252, 255],
  "visible logo pixels must retain their source color",
);
