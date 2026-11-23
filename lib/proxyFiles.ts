/**
 * Proxy file management (docs/gatt.md "File management"): codecs, the upload
 * sanity checks, and a client over the GATT surface. The proxy stores validated
 * firmware ZIPs as a cache; DFU never reads them.
 */

import { AppError, type Message, type MessageKey } from "@/lib/i18n";
import { GDFU_FILE_CHAR_UUIDS, type GdfuBle } from "@/lib/bluetooth";

export const FILE_CHAR_UUIDS = GDFU_FILE_CHAR_UUIDS;

export const MAX_FILE_CHUNK = 160;
export const MAX_FILE_NAME = 63;
/** Mirrors proxy/src/gdfu_file.h: 4 KiB blocks plus spare blocks for metadata. */
export const STORAGE_BLOCK = 4096;
export const STORAGE_RESERVE_BLOCKS = 3;

const Cmd = {
  ListEntry: 1,
  UploadBegin: 2,
  UploadFinish: 3,
  UploadAbort: 4,
  Delete: 5,
  DownloadBegin: 6,
  DownloadRead: 7,
  DownloadEnd: 8,
} as const;


export class ProxyFileError extends AppError {
  constructor(readonly code: number) {
    super(code >= 1 && code <= 12 ? (`fileErr${code}` as MessageKey) : "errFileUnknown", { code });
  }
}

export interface ProxyStorage {
  totalBytes: number;
  usedBytes: number;
  fileCount: number;
}

export interface ProxyFileEntry {
  name: string;
  size: number;
}

export interface FileLocation {
  name: string;
  offline: boolean;
  onProxy: boolean;
  /** Original IndexedDB key; null for a proxy-only file. */
  offlineName: string | null;
  size: number;
  /**
   * True when another phone file normalizes to the same proxy name. Such rows
   * must not be uploaded: the proxy cannot tell them apart.
   */
  conflict: boolean;
}

/**
 * Merge locations by the proxy-safe name used as the wire/storage key. Phone
 * files that normalize to the same name are kept as separate rows, each marked
 * `conflict`, instead of silently overwriting one another.
 */
export function combineFileLocations(
  offline: ReadonlyArray<{ name: string; blob: Blob }>,
  proxy: ReadonlyArray<ProxyFileEntry>,
): FileLocation[] {
  const phoneByName = new Map<string, Array<{ name: string; blob: Blob }>>();
  for (const entry of offline) {
    const key = toProxyFileName(entry.name);
    phoneByName.set(key, [...(phoneByName.get(key) ?? []), entry]);
  }
  const proxyByName = new Map(proxy.map((entry) => [entry.name, entry]));
  const names = new Set([...phoneByName.keys(), ...proxyByName.keys()]);
  const rows: FileLocation[] = [];
  for (const name of names) {
    const phones = phoneByName.get(name) ?? [];
    const onProxy = proxyByName.get(name);
    if (phones.length === 0) {
      rows.push({
        name,
        offline: false,
        onProxy: true,
        offlineName: null,
        size: onProxy?.size ?? 0,
        conflict: false,
      });
      continue;
    }
    for (const phone of phones) {
      rows.push({
        name,
        offline: true,
        onProxy: onProxy !== undefined,
        offlineName: phone.name,
        size: onProxy?.size ?? phone.blob.size,
        conflict: phones.length > 1,
      });
    }
  }
  return rows.sort(
    (a, b) => a.name.localeCompare(b.name) || (a.offlineName ?? "").localeCompare(b.offlineName ?? ""),
  );
}

export interface ProxyFileStatus {
  op: number;
  lastError: number;
  transferred: number;
  total: number;
}

export function parseStorage(raw: DataView): ProxyStorage | null {
  if (raw.byteLength < 10) {
    return null;
  }
  return {
    totalBytes: raw.getUint32(0, false),
    usedBytes: raw.getUint32(4, false),
    fileCount: raw.getUint16(8, false),
  };
}

export function parseFileStatus(raw: DataView): ProxyFileStatus | null {
  if (raw.byteLength < 10) {
    return null;
  }
  return {
    op: raw.getUint8(0),
    lastError: raw.getUint8(1),
    transferred: raw.getUint32(2, false),
    total: raw.getUint32(6, false),
  };
}

/** `[present:1][size:4][name]`; null marks the end of the list. */
export function parseListEntry(raw: DataView): ProxyFileEntry | null {
  if (raw.byteLength < 6 || raw.getUint8(0) === 0) {
    return null;
  }
  const bytes = new Uint8Array(raw.buffer, raw.byteOffset + 5, raw.byteLength - 5);
  return { size: raw.getUint32(1, false), name: new TextDecoder().decode(bytes) };
}

export function isValidProxyFileName(name: string): boolean {
  return (
    name.length >= 5 &&
    name.length <= MAX_FILE_NAME &&
    /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name) &&
    name.toLowerCase().endsWith(".zip")
  );
}

/** Maps an offline library name to a legal proxy name (spaces etc. become `_`). */
export function toProxyFileName(name: string): string {
  const base = name.replace(/\.zip$/i, "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  const stem = (base || "firmware").slice(0, MAX_FILE_NAME - 4);
  return `${stem}.zip`;
}

export function storageBytesNeeded(size: number): number {
  return (
    Math.ceil(size / STORAGE_BLOCK) * STORAGE_BLOCK + STORAGE_RESERVE_BLOCKS * STORAGE_BLOCK
  );
}

export function fitsProxyStorage(storage: ProxyStorage, size: number): boolean {
  return (
    size > 0 &&
    storage.usedBytes <= storage.totalBytes &&
    storageBytesNeeded(size) <= storage.totalBytes - storage.usedBytes
  );
}

export type UploadCheck = { ok: true; replaces: boolean } | { ok: false; reason: Message };

/**
 * Pre-flight for one upload. The proxy re-checks everything; this exists so the
 * user learns why before any bytes move. Replacing needs room for the new copy
 * while the old one still exists (the proxy keeps the old file until the
 * upload verifies).
 */
export function checkUpload(
  storage: ProxyStorage,
  files: ProxyFileEntry[],
  name: string,
  size: number,
): UploadCheck {
  if (!isValidProxyFileName(name)) {
    return { ok: false, reason: { key: "errBadFileName" } };
  }
  const existing = files.find((file) => file.name === name);
  if (!fitsProxyStorage(storage, size)) {
    const free = Math.max(0, storage.totalBytes - storage.usedBytes);
    return {
      ok: false,
      reason: existing
        ? { key: "errReplaceNoRoom" }
        : { key: "errNeedsSpace", params: { needed: storageBytesNeeded(size), free } },
    };
  }
  return { ok: true, replaces: existing !== undefined };
}

export function crc32(bytes: Uint8Array, seed = 0xffffffff): number {
  let crc = seed;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return crc >>> 0;
}

function crc32Final(bytes: Uint8Array): number {
  return (crc32(bytes) ^ 0xffffffff) >>> 0;
}

function frame(command: number, body: number[] = []): ArrayBuffer {
  return new Uint8Array([command, ...body]).buffer;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function nameField(name: string): number[] {
  const bytes = new TextEncoder().encode(name);
  return [bytes.length, ...bytes];
}

export function encodeUploadBegin(
  name: string,
  size: number,
  crc: number,
  replace: boolean,
): ArrayBuffer {
  return frame(Cmd.UploadBegin, [...u32(size), ...u32(crc), replace ? 1 : 0, ...nameField(name)]);
}

/** Subset of GdfuBle the file client needs; lets tests supply a fake proxy. */
export interface GattLink {
  readCharacteristic(uuid: string): Promise<DataView>;
  writeCharacteristic(uuid: string, value: ArrayBuffer, withoutResponse?: boolean): Promise<void>;
}

export interface TransferOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Chunk writes between STATUS reads: a failed chunk is sticky on the proxy. */
const STATUS_CHECK_EVERY = 32;

/** `null` is the compatibility signal for proxies without the 0040–0043 group. */
export async function getProxyStorageIfSupported(link: GattLink): Promise<ProxyStorage | null> {
  try {
    const storage = parseStorage(await link.readCharacteristic(FILE_CHAR_UUIDS.storage));
    return storage;
  } catch {
    return null;
  }
}

export class ProxyFiles {
  constructor(private readonly link: GattLink | GdfuBle) {}

  private async status(): Promise<ProxyFileStatus> {
    const status = parseFileStatus(await this.link.readCharacteristic(FILE_CHAR_UUIDS.status));
    if (!status) {
      throw new AppError("errMalformedStatus");
    }
    return status;
  }

  private async send(body: ArrayBuffer): Promise<void> {
    await this.link.writeCharacteristic(FILE_CHAR_UUIDS.command, body);
    const { lastError } = await this.status();
    if (lastError !== 0) {
      throw new ProxyFileError(lastError);
    }
  }

  async storage(): Promise<ProxyStorage> {
    let raw: DataView;
    try {
      raw = await this.link.readCharacteristic(FILE_CHAR_UUIDS.storage);
    } catch {
      throw new AppError("errNoFileStorage");
    }
    const storage = parseStorage(raw);
    if (!storage) {
      throw new AppError("errMalformedStorage");
    }
    return storage;
  }

  async list(): Promise<ProxyFileEntry[]> {
    const files: ProxyFileEntry[] = [];
    for (let index = 0; index < 0xffff; index += 1) {
      await this.send(frame(Cmd.ListEntry, [index >> 8, index & 0xff]));
      const entry = parseListEntry(await this.link.readCharacteristic(FILE_CHAR_UUIDS.data));
      if (!entry) {
        break;
      }
      files.push(entry);
    }
    return files;
  }

  async remove(name: string): Promise<void> {
    await this.send(frame(Cmd.Delete, nameField(name)));
  }

  async upload(
    name: string,
    data: Uint8Array,
    replace: boolean,
    { onProgress, signal }: TransferOptions = {},
  ): Promise<void> {
    await this.send(encodeUploadBegin(name, data.length, crc32Final(data), replace));
    try {
      let sent = 0;
      let chunks = 0;
      while (sent < data.length) {
        if (signal?.aborted) {
          throw new AppError("errUploadCancelled");
        }
        const chunk = data.subarray(sent, sent + MAX_FILE_CHUNK);
        const packet = new Uint8Array(4 + chunk.length);
        packet.set(u32(sent));
        packet.set(chunk, 4);
        await this.link.writeCharacteristic(FILE_CHAR_UUIDS.data, packet.buffer);
        sent += chunk.length;
        chunks += 1;
        onProgress?.(sent, data.length);
        if (chunks % STATUS_CHECK_EVERY === 0) {
          const { lastError } = await this.status();
          if (lastError !== 0) {
            throw new ProxyFileError(lastError);
          }
        }
      }
      await this.send(frame(Cmd.UploadFinish));
    } catch (error) {
      await this.link
        .writeCharacteristic(FILE_CHAR_UUIDS.command, frame(Cmd.UploadAbort))
        .catch(() => undefined);
      throw error;
    }
  }

  async download(name: string, { onProgress, signal }: TransferOptions = {}): Promise<Uint8Array> {
    await this.send(frame(Cmd.DownloadBegin, nameField(name)));
    try {
      const { total } = await this.status();
      const out = new Uint8Array(total);
      let received = 0;
      while (received < total) {
        if (signal?.aborted) {
          throw new AppError("errDownloadCancelled");
        }
        const want = Math.min(MAX_FILE_CHUNK, total - received);
        await this.send(frame(Cmd.DownloadRead, [...u32(received), want]));
        const raw = await this.link.readCharacteristic(FILE_CHAR_UUIDS.data);
        if (raw.byteLength !== want) {
          throw new AppError("errShortBlock");
        }
        out.set(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), received);
        received += want;
        onProgress?.(received, total);
      }
      return out;
    } finally {
      await this.link
        .writeCharacteristic(FILE_CHAR_UUIDS.command, frame(Cmd.DownloadEnd))
        .catch(() => undefined);
    }
  }
}
