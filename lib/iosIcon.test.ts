import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectory = `${root}ios/AppIcon.appiconset`;
const compiledDirectory = `${root}ios/App/App/Assets.xcassets/AppIcon.appiconset`;
const manifest = JSON.parse(
  readFileSync(`${compiledDirectory}/Contents.json`, "utf8"),
) as { images: { filename?: string }[] };

assert.equal(existsSync(sourceDirectory), false, "unused source AppIcon catalogue must not exist");
assert.ok(
  manifest.images.some((image) => image.filename === "AppIcon-iphone-60x60@2x.png"),
  "Xcode AppIcon catalogue must include iPhone 8 icon",
);
assert.ok(existsSync(`${compiledDirectory}/AppIcon-iphone-60x60@2x.png`));
