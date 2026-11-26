import assert from "node:assert/strict";
import {
  crc16Nordic,
  parseFirmwareZip,
  FirmwareFormatError,
  decodeNativeDownload,
  isFirmwareSourceCurrent,
  endEllipsis,
  middleEllipsis,
  resetFirmwareSourceState,
  selectFirmwareDownloadTransport,
  splitFirmwareName,
  fetchReleases,
  getStableRelease,
  isRepeaterAsset,
} from "./firmware";

assert.ok(isRepeaterAsset("RAK_4631_repeater-2026.9.2-lusofw-6ad664c.zip"));
for (const name of ["RAK_4631_companion_radio_ble-2026.9.2.zip", "Heltec_t114_room_server-2026.9.2.zip", "Xiao_nrf52_sensor-2026.9.2.zip"]) {
  assert.ok(!isRepeaterAsset(name), name);
}

assert.deepEqual(splitFirmwareName("RAK_4631_repeater-2026.9.2-lusofw-6ad664c.zip"), { board: "RAK 4631 repeater", version: "2026.9.2" });
assert.deepEqual(splitFirmwareName("Heltec_t114_repeater_v1.12.0-abc.zip"), { board: "Heltec t114 repeater", version: "1.12.0" });
assert.deepEqual(splitFirmwareName("custom_build.zip"), { board: "custom build", version: null });
for (const name of [
  "RAK_4631_repeater-2026.9.2-rc2-lusofw-6ad664c.zip",
  "RAK_4631_repeater-2026.9.2-rc2.zip",
]) {
  assert.deepEqual(splitFirmwareName(name), { board: "RAK 4631 repeater", version: "2026.9.2-rc2" });
}

/** Minimal stored/deflate ZIP builder mirroring the adafruit-nrfutil layout. */
function buildZip(entries: Array<{ name: string; data: Uint8Array; deflate?: boolean }>): ArrayBuffer {
  const u16 = (v: number): Uint8Array => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v: number): Uint8Array =>
    new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  const concat = (parts: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  };
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const header = concat([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0), // flags
      u16(entry.deflate ? 8 : 0), // method
      u16(0), // mod time
      u16(0), // mod date
      u32(0), // crc32 (streamed layout; reader ignores it)
      u32(entry.data.length), // compressed
      u32(entry.data.length), // uncompressed
      u16(nameBytes.length),
      u16(0), // extra length
    ]);
    chunks.push(header, nameBytes, entry.data);
    central.push(
      concat([
        u32(0x02014b50),
        u16(20), // version made by
        u16(20), // version needed
        u16(0), // flags
        u16(entry.deflate ? 8 : 0), // method
        u16(0), // mod time
        u16(0), // mod date
        u32(0), // crc32
        u32(entry.data.length), // compressed
        u32(entry.data.length), // uncompressed
        u16(nameBytes.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // disk number
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // local header offset
      ]),
      nameBytes,
    );
    offset += header.length + nameBytes.length + entry.data.length;
  }
  const centralStart = offset;
  const centralBytes = concat(central);
  chunks.push(
    centralBytes,
    concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(entries.length),
      u16(entries.length),
      u32(centralBytes.length),
      u32(centralStart),
      u16(0),
    ]),
  );
  const out = concat(chunks);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

function makeManifest(deviceType = 82, deviceRevision = 65535, crc?: number): Uint8Array {
  const app = new TextEncoder().encode("firmware image bytes");
  const manifest = {
    manifest: {
      application: {
        bin_file: "firmware.bin",
        dat_file: "firmware.dat",
        init_packet_data: {
          application_version: 1,
          device_revision: deviceRevision,
          device_type: deviceType,
          firmware_crc16: crc ?? crc16Nordic(app),
          softdevice_req: [182],
        },
      },
      dfu_version: 0.5,
    },
  };
  return new TextEncoder().encode(JSON.stringify(manifest));
}

function makePackage(
  deviceType?: number,
  deviceRevision?: number,
  deflate?: boolean,
): ArrayBuffer {
  const app = new TextEncoder().encode("firmware image bytes");
  const dat = new TextEncoder().encode("init-packet");
  return buildZip([
    { name: "manifest.json", data: makeManifest(deviceType, deviceRevision) },
    { name: "firmware.dat", data: dat, deflate },
    { name: "firmware.bin", data: app, deflate },
  ]);
}

async function rejected(buffer: ArrayBuffer, why: string): Promise<void> {
  await assert.rejects(
    parseFirmwareZip("pkg.zip", buffer),
    (error: unknown) => error instanceof FirmwareFormatError,
    why,
  );
}

export function runFirmwareTests(): void {
  assert.equal(
    selectFirmwareDownloadTransport(true),
    "capacitor",
    "native firmware downloads must bypass WebView CORS with Capacitor HTTP",
  );
  assert.equal(
    selectFirmwareDownloadTransport(false),
    "fetch",
    "browser firmware downloads must retain fetch",
  );
  assert.deepEqual(
    [...new Uint8Array(decodeNativeDownload("UEsDBA=="))],
    [0x50, 0x4b, 0x03, 0x04],
    "Capacitor native HTTP base64 payloads must decode to ZIP bytes",
  );
  assert.equal(
    isFirmwareSourceCurrent("lusofw", "meshcore"),
    false,
    "release results from a previous source must not repopulate the new source",
  );
  assert.equal(
    middleEllipsis("abcdefghijklmnopqrstuvwxyz", 11),
    "abcd...wxyz",
    "long firmware file names must retain both useful ends",
  );
  assert.equal(middleEllipsis("firmware.zip", 20), "firmware.zip", "short names must remain unchanged");
  assert.equal(
    endEllipsis("abcdefghijklmnopqrstuvwxyz.zip", 12),
    "abcd... .zip",
    "long firmware names must keep the extension readable",
  );
  resetFirmwareSourceState();
}

async function runFirmwarePackageTests(): Promise<void> {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify([
      { id: 3, tag_name: "v2.0.0-rc2", name: null, published_at: "2026-11-20", prerelease: true, assets: [] },
      { id: 2, tag_name: "v1.9.0", name: null, published_at: "2026-11-19", prerelease: false, assets: [] },
      { id: 1, tag_name: "v1.8.0", name: null, published_at: "2026-11-18", prerelease: false, assets: [] },
    ].map((release) => ({ ...release, assets: [
      { id: release.id, name: `repeater-${release.tag_name}.zip`, size: 1, browser_download_url: "https://example.com/firmware.zip" },
    ] }))));
    const releases = await fetchReleases("example/firmware", () => true);
    assert.deepEqual(releases.map((release) => release.prerelease), [true, false, false]);
    assert.equal(getStableRelease(releases)?.tagName, "v1.9.0", "skip a newer prerelease when selecting stable");
    assert.equal(getStableRelease(releases.slice(1))?.tagName, "v1.9.0");
    assert.equal(getStableRelease(releases.slice(0, 1)), undefined, "prereleases must never receive the stable badge");
    assert.equal(getStableRelease([]), undefined);

    globalThis.fetch = async () => new Response(JSON.stringify([
      { id: 5, tag_name: "room-server-v1.18.0", prerelease: false, assets: [
        { id: 50, name: "Heltec_t114_room_server-v1.18.0.zip", size: 1, browser_download_url: "https://example.com/room.zip" },
      ] },
      { id: 4, tag_name: "repeater-v1.19.0-rc2", prerelease: true, assets: [
        { id: 40, name: "Heltec_t114_repeater-v1.19.0-rc2.zip", size: 1, browser_download_url: "https://example.com/rc.zip" },
      ] },
      { id: 3, tag_name: "companion-v1.18.0", prerelease: false, assets: [] },
      { id: 2, tag_name: "repeater-v1.18.0", prerelease: false, assets: [
        { id: 20, name: "Heltec_t114_repeater-v1.18.0.zip", size: 1, browser_download_url: "https://example.com/stable.zip" },
      ] },
      { id: 1, tag_name: "repeater-v1.17.0", prerelease: false, assets: [
        { id: 10, name: "Heltec_t114_repeater-v1.17.0.bin", size: 1, browser_download_url: "https://example.com/old.bin" },
      ] },
    ]));
    const repeaterReleases = await fetchReleases("meshcore-dev/MeshCore", isRepeaterAsset);
    assert.deepEqual(repeaterReleases.map((release) => release.tagName), ["repeater-v1.19.0-rc2", "repeater-v1.18.0"]);
    assert.equal(getStableRelease(repeaterReleases)?.tagName, "repeater-v1.18.0");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Accepted profile: stored entries, device type 82, revision 65535.
  const image = await parseFirmwareZip("pkg.zip", makePackage());
  assert.equal(image.manifest.deviceType, 82);
  assert.equal(image.manifest.deviceRevision, 65535);
  assert.equal(image.sizeBytes, "firmware image bytes".length);

  await rejected(makePackage(82, 0), "revision 0 must be rejected");
  await rejected(makePackage(82, 1), "revision 1 must be rejected");
  await rejected(makePackage(83, 65535), "unknown device type must be rejected");
  await rejected(makePackage(82, 65535, true), "deflated required entries must be rejected");

  // Strict entry set: exactly manifest.json, firmware.dat, firmware.bin.
  const app = new TextEncoder().encode("firmware image bytes");
  const dat = new TextEncoder().encode("init-packet");
  const required = [
    { name: "manifest.json", data: makeManifest() },
    { name: "firmware.dat", data: dat },
    { name: "firmware.bin", data: app },
  ];
  await rejected(
    buildZip([...required, { name: "firmware.bin", data: app }]),
    "a duplicate required entry must be rejected",
  );
  await rejected(
    buildZip([...required, { name: "README.txt", data: dat }]),
    "an extra entry must be rejected",
  );
  await rejected(
    buildZip([...required, { name: "dir/", data: new Uint8Array(0) }]),
    "a directory entry must be rejected",
  );
  await rejected(
    buildZip([{ name: "sub/manifest.json", data: makeManifest() }, required[1], required[2]]),
    "a path-bearing name must be rejected",
  );
  await rejected(
    buildZip([{ name: "..\\firmware.bin", data: app }, required[0], required[1]]),
    "a backslash path must be rejected",
  );

  // ZephCore packages use zephyr.dat/zephyr.bin; mixing the two naming schemes is rejected.
  const zephyr = await parseFirmwareZip(
    "zephyr.zip",
    buildZip([required[0], { name: "zephyr.bin", data: app }, { name: "zephyr.dat", data: dat }]),
  );
  assert.equal(zephyr.sizeBytes, app.length);
  await rejected(
    buildZip([required[0], required[1], { name: "zephyr.bin", data: app }]),
    "mixed firmware.dat and zephyr.bin must be rejected",
  );
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("firmware.test.ts")) {
  void runFirmwarePackageTests().then(
    () => {
      runFirmwareTests();
      console.log("firmware tests passed");
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
