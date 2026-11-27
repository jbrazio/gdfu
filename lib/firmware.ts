import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { AppError } from "@/lib/i18n";

/**
 * Firmware package handling: Nordic DFU zip parsing, validation, GitHub
 * release listing, and offline persistence via IndexedDB.
 *
 * Accepted packages are Nordic DFU zips (Adafruit-nrfutil style) holding
 * exactly manifest.json plus the init packet (.dat) and image (.bin) files
 * that manifest.application names, all stored uncompressed, matching the
 * hardware-verified flasher flow. No third-party zip dependency.
 */

/** Nordic CRC16 (init 0xFFFF, poly 0x1021 reflected variant per nrfutil). */
export function crc16Nordic(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc = ((crc >> 8) & 0xff) | ((crc << 8) & 0xffff);
    crc ^= byte;
    crc ^= (crc & 0xff) >> 4;
    crc ^= ((crc << 8) << 4) & 0xffff;
    crc ^= (((crc & 0xff) << 4) << 1) & 0xffff;
  }
  return crc & 0xffff;
}

export interface DfuManifest {
  dfuVersion: number;
  deviceType: number;
  deviceRevision: number;
  applicationVersion: number;
  softdeviceReq: number[];
  firmwareCrc16: number | null;
}

export interface FirmwareImage {
  name: string;
  initData: Uint8Array;
  appData: Uint8Array;
  manifest: DfuManifest;
  /** CRC16 computed over the image; compared against manifest value. */
  computedCrc16: number;
  sizeBytes: number;
  /** Original zip bytes, when parsed from a single buffer (offline saving). */
  raw?: Blob;
}

export class FirmwareFormatError extends AppError {}

// Longest entry name the proxy accepts.
const MAX_ENTRY_NAME_BYTES = 63;

/**
 * Minimal stored-only zip reader: enough for adafruit-nrfutil output. Entry
 * names are not checked here; parseFirmwareZip validates them against the
 * names that manifest.json declares.
 */
export async function readZipEntries(file: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(file);
  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  // Walk local file headers from the start; nrfutil zips are written
  // sequentially without data descriptors.
  let offset = 0;
  while (offset + 30 <= file.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    // Fatal decoding: the proxy compares raw bytes, so invalid UTF-8 must not become U+FFFD.
    let name: string;
    try {
      name = decoder.decode(new Uint8Array(file, nameStart, nameLength));
    } catch {
      throw new FirmwareFormatError("errPackageEntries");
    }
    // Mirror the proxy: long names are rejected here rather than after a long BLE upload.
    if (nameLength > MAX_ENTRY_NAME_BYTES) {
      throw new FirmwareFormatError("errPackageEntries");
    }
    if (entries.has(name)) {
      throw new FirmwareFormatError("errZipDuplicate", { name });
    }
    const dataStart = nameStart + nameLength + extraLength;
    if (dataStart + compressedSize > file.byteLength) {
      throw new FirmwareFormatError("errZipTruncated");
    }
    // Match the proxy validator: every entry must be uncompressed so the
    // constrained proxy can verify the package without an inflater.
    if (method === 8) {
      throw new FirmwareFormatError("errZipDeflated", { name });
    }
    if (method !== 0) {
      throw new FirmwareFormatError("errZipMethod", { method, name });
    }
    const content = new Uint8Array(file, dataStart, compressedSize).slice();
    entries.set(name, content);
    offset = dataStart + compressedSize;
  }
  if (entries.size === 0) {
    throw new FirmwareFormatError("errNotZip");
  }
  return entries;
}

const KNOWN_DEVICE_TYPES = new Set([82]); // Heltec T114 (PCA10059-style type 0x52)
// GFSK target family shared with the proxy validator (proxy/src/gdfu_file.h).
const KNOWN_DEVICE_REVISIONS = new Set([65535]);

/**
 * The proxy reads these two names with a plain scanner: it rejects escapes and
 * repeated keys, which JSON.parse silently resolves. Require the same here.
 */
function isPlainUniqueString(text: string, key: string, parsed: string): boolean {
  return (
    text.match(new RegExp(`"${key}"\\s*:`, "g"))?.length === 1 &&
    new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*)"`).exec(text)?.[1] === parsed
  );
}

/**
 * Parse and validate a Nordic DFU zip. Throws FirmwareFormatError with a
 * user-facing reason when the package cannot be flashed to the supported
 * target.
 */
export async function parseFirmwareZip(name: string, file: ArrayBuffer): Promise<FirmwareImage> {
  const entries = await readZipEntries(file);
  const manifestRaw = entries.get("manifest.json");
  if (!manifestRaw) {
    throw new FirmwareFormatError("errPackageEntries");
  }
  let manifestText: string;
  let manifestJson: {
    manifest?: {
      application?: {
        bin_file?: unknown;
        dat_file?: unknown;
        init_packet_data?: {
          device_type?: number;
          device_revision?: number;
          application_version?: number;
          firmware_crc16?: number;
          softdevice_req?: number[];
        };
      };
      dfu_version?: number;
    };
  };
  try {
    manifestText = new TextDecoder("utf-8", { fatal: true }).decode(manifestRaw);
    manifestJson = JSON.parse(manifestText);
  } catch {
    throw new FirmwareFormatError("errManifestJson");
  }
  const datName = manifestJson.manifest?.application?.dat_file;
  const binName = manifestJson.manifest?.application?.bin_file;
  // Exactly three entries (manifest.json plus the two named files), pairwise distinct.
  if (
    typeof datName !== "string" ||
    typeof binName !== "string" ||
    !datName ||
    !binName ||
    !isPlainUniqueString(manifestText, "dat_file", datName) ||
    !isPlainUniqueString(manifestText, "bin_file", binName) ||
    new Set([datName, binName, "manifest.json"]).size !== 3 ||
    entries.size !== 3
  ) {
    throw new FirmwareFormatError("errPackageEntries");
  }
  const initData = entries.get(datName);
  const appData = entries.get(binName);
  if (!initData?.length || !appData) {
    throw new FirmwareFormatError("errPackageEntries");
  }
  const packet = manifestJson.manifest?.application?.init_packet_data;
  if (!packet) {
    throw new FirmwareFormatError("errManifestInit");
  }
  const manifest: DfuManifest = {
    dfuVersion: manifestJson.manifest?.dfu_version ?? 0,
    deviceType: packet.device_type ?? -1,
    deviceRevision: packet.device_revision ?? -1,
    applicationVersion: packet.application_version ?? 0,
    softdeviceReq: packet.softdevice_req ?? [],
    firmwareCrc16: packet.firmware_crc16 ?? null,
  };
  const computedCrc16 = crc16Nordic(appData);
  if (manifest.firmwareCrc16 !== null && manifest.firmwareCrc16 !== computedCrc16) {
    throw new FirmwareFormatError("errCrcMismatch", {
      expected: `0x${manifest.firmwareCrc16.toString(16)}`,
      actual: `0x${computedCrc16.toString(16)}`,
    });
  }
  if (!KNOWN_DEVICE_TYPES.has(manifest.deviceType)) {
    throw new FirmwareFormatError("errDeviceType", {
      value: manifest.deviceType,
      supported: [...KNOWN_DEVICE_TYPES].join(", "),
    });
  }
  if (!KNOWN_DEVICE_REVISIONS.has(manifest.deviceRevision)) {
    throw new FirmwareFormatError("errDeviceRevision", {
      value: manifest.deviceRevision,
      supported: [...KNOWN_DEVICE_REVISIONS].join(", "),
    });
  }
  if (appData.length === 0) {
    throw new FirmwareFormatError("errFirmwareEmpty");
  }
  return {
    name,
    initData,
    appData,
    manifest,
    computedCrc16,
    sizeBytes: appData.length,
    raw: new Blob([file]),
  };
}

/** GitHub release metadata subset used by the firmware library UI. */
export interface RemoteRelease {
  id: number;
  tagName: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  assets: {
    id: number;
    name: string;
    size: number;
    downloadUrl: string;
  }[];
}

interface GithubAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
}

interface GithubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  published_at: string;
  prerelease: boolean;
  assets: GithubAsset[];
}

export function selectFirmwareDownloadTransport(native: boolean): "capacitor" | "fetch" {
  return native ? "capacitor" : "fetch";
}

export function middleEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const prefixLength = Math.ceil((maxLength - 3) / 2);
  const suffixLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`;
}

export function endEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const extension = value.slice(value.lastIndexOf("."));
  const suffix = extension.length > 1 ? `... ${extension}` : "...";
  return `${value.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
}

/**
 * "RAK_4631_repeater-2026.9.2-lusofw-6ad664c.zip" → { board: "RAK 4631 repeater", version: "2026.9.2" }.
 * ponytail: relies on release asset naming ("<board>-<x.y.z>…"); other names show in full with no version.
 */
export function splitFirmwareName(name: string): { board: string; version: string | null } {
  const base = name.replace(/\.zip$/i, "");
  const match = /^(.+?)[-_]v?(\d+\.\d+\.\d+(?:-rc\d+)?)/.exec(base);
  return match ? { board: match[1].replaceAll("_", " "), version: match[2] } : { board: base.replaceAll("_", " "), version: null };
}

export function resetFirmwareSourceState(): {
  releases: RemoteRelease[];
  selectedRelease: string;
  selectedAsset: string;
  error: null;
  busy: null;
} {
  return { releases: [], selectedRelease: "", selectedAsset: "", error: null, busy: null };
}

export function isFirmwareSourceCurrent(requestSourceId: string, currentSourceId: string): boolean {
  return requestSourceId === currentSourceId;
}

/** Only repeater builds are flashed over GFSK; drop companion, room server, sensor, etc. */
export function isRepeaterAsset(name: string): boolean {
  return /repeater/i.test(name);
}

/** Repositories served by the in-app firmware library. */
export const FIRMWARE_SOURCES = [
  {
    id: "lusofw",
    label: "LusoFW (meshcore.pt)",
    repo: "Meshcore-Portugal/lusofw",
    assetFilter: isRepeaterAsset,
  },
  {
    id: "meshcore",
    label: "Community (meshcore.io)",
    repo: "meshcore-dev/MeshCore",
    assetFilter: isRepeaterAsset,
  },
] as const;

export function getStableRelease(releases: RemoteRelease[]): RemoteRelease | undefined {
  return releases.find((release) => !release.prerelease);
}

export async function fetchReleases(
  repo: string,
  assetFilter: (name: string) => boolean,
): Promise<RemoteRelease[]> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new FirmwareFormatError("errRateLimit");
    }
    throw new FirmwareFormatError("errReleasesHttp", { status: response.status });
  }
  const releases = (await response.json()) as GithubRelease[];
  return releases.map((release) => ({
    id: release.id,
    tagName: release.tag_name,
    name: release.name ?? release.tag_name,
    publishedAt: release.published_at,
    prerelease: release.prerelease,
    assets: release.assets
      .filter((asset) => asset.name.endsWith(".zip"))
      .filter((asset) => assetFilter(asset.name))
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        size: asset.size,
        downloadUrl: asset.browser_download_url,
      })),
  })).filter((release) => release.assets.length > 0);
}

export function decodeNativeDownload(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  if (typeof data === "string") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }
  throw new FirmwareFormatError("errDownloadBinary");
}

export async function downloadReleaseAsset(url: string): Promise<ArrayBuffer> {
  if (selectFirmwareDownloadTransport(Capacitor.isNativePlatform()) === "capacitor") {
    const response = await CapacitorHttp.get({ url, responseType: "arraybuffer" });
    if (response.status < 200 || response.status >= 300) {
      throw new FirmwareFormatError("errDownloadHttp", { status: response.status });
    }
    return decodeNativeDownload(response.data);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new FirmwareFormatError("errDownloadHttp", { status: response.status });
  }
  return response.arrayBuffer();
}

// --- Offline library (IndexedDB) ------------------------------------------------

const DB_NAME = "gfsk-dfu-library";
const STORE = "images";

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "name" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new AppError("errDbOpen"));
  });
}

/** Where a saved file came from: a FIRMWARE_SOURCES id, a local import, or the proxy. */
export type ImageOrigin = "lusofw" | "meshcore" | "import" | "proxy";

export interface StoredImage {
  name: string;
  blob: Blob;
  savedAt: number;
  /** Absent on files saved before origins were recorded. */
  origin?: ImageOrigin;
}

export async function saveImageOffline(name: string, file: ArrayBuffer, origin: ImageOrigin): Promise<void> {
  const db = await openLibrary();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      name,
      blob: new Blob([file]),
      savedAt: Date.now(),
      origin,
    } satisfies StoredImage);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new AppError("errDbWrite"));
  });
  db.close();
}

export async function listOfflineImages(): Promise<StoredImage[]> {
  const db = await openLibrary();
  const images = await new Promise<StoredImage[]>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredImage[]);
    request.onerror = () => reject(request.error ?? new AppError("errDbRead"));
  });
  db.close();
  return images.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteOfflineImage(name: string): Promise<void> {
  const db = await openLibrary();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new AppError("errDbDelete"));
  });
  db.close();
}

export async function loadOfflineImage(stored: StoredImage): Promise<FirmwareImage> {
  const buffer = await stored.blob.arrayBuffer();
  return parseFirmwareZip(stored.name, buffer);
}
