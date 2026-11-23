/**
 * CI fixture: run the production firmware parser against the shipped OTA
 * package and assert the decoded metadata. Invoked by
 * tests/test_firmware_parser_fixture.py through `npx tsx`.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseFirmwareZip } from "../lib/firmware";

const FIXTURE = "../firmware/Heltec_t114_repeater-2026.9.2-lusofw-6ad664c.zip";

async function main(): Promise<void> {
  const raw = await readFile(FIXTURE);
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const image = await parseFirmwareZip("Heltec_t114_repeater-2026.9.2-lusofw-6ad664c.zip", buffer);
  assert.equal(image.sizeBytes, 444052);
  assert.equal(image.manifest.deviceType, 82);
  assert.equal(image.manifest.softdeviceReq[0], 182);
  assert.equal(image.computedCrc16, 0x72af);
  assert.ok(image.initData.byteLength > 0);
  console.log("fixture ok");
}

void main();
