import assert from "node:assert/strict";
import {
  FILE_CHAR_UUIDS,
  ProxyFileError,
  ProxyFiles,
  checkUpload,
  crc32,
  fitsProxyStorage,
  isValidProxyFileName,
  parseListEntry,
  storageBytesNeeded,
  toProxyFileName,
  type GattLink,
} from "./proxyFiles";

const view = (bytes: number[]): DataView => new DataView(new Uint8Array(bytes).buffer);
const be32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

/** In-memory proxy mirroring docs/gatt.md; same rules as proxy/src/gdfu_file.c. */
class FakeProxy implements GattLink {
  files = new Map<string, Uint8Array>();
  total = 64 * 1024;
  lastError = 0;
  private data = new Uint8Array(0);
  private upload: { name: string; size: number; crc: number; replace: boolean; buf: number[] } | null = null;
  private download: Uint8Array | null = null;

  get used(): number {
    return [...this.files.values()].reduce((n, f) => n + Math.ceil(f.length / 4096) * 4096, 0);
  }

  async readCharacteristic(uuid: string): Promise<DataView> {
    if (uuid === FILE_CHAR_UUIDS.storage) {
      return view([...be32(this.total), ...be32(this.used), 0, this.files.size]);
    }
    if (uuid === FILE_CHAR_UUIDS.status) {
      const done = this.upload?.buf.length ?? 0;
      return view([this.upload ? 1 : this.download ? 2 : 0, this.lastError, ...be32(done), ...be32(this.upload?.size ?? this.download?.length ?? 0)]);
    }
    if (uuid === FILE_CHAR_UUIDS.data) {
      return new DataView(this.data.slice().buffer);
    }
    throw new Error(`unexpected read ${uuid}`);
  }

  async writeCharacteristic(uuid: string, value: ArrayBuffer): Promise<void> {
    const p = new Uint8Array(value);
    if (uuid === FILE_CHAR_UUIDS.data) {
      const off = (p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]) >>> 0;
      if (!this.upload || off !== this.upload.buf.length) {
        this.lastError ||= this.upload ? 8 : 11;
      } else {
        this.upload.buf.push(...p.subarray(4));
      }
      return;
    }
    assert.equal(uuid, FILE_CHAR_UUIDS.command);
    if (p[0] !== 3) this.lastError = 0;
    const name = (at: number): string => new TextDecoder().decode(p.subarray(at + 1, at + 1 + p[at]));
    const fail = (e: number): void => { this.lastError ||= e; };
    switch (p[0]) {
      case 1: {
        const i = p[1] << 8 | p[2];
        const e = [...this.files.entries()][i];
        this.data = e ? new Uint8Array([1, ...be32(e[1].length), ...new TextEncoder().encode(e[0])]) : new Uint8Array([0]);
        break;
      }
      case 2: {
        const size = (p[1] << 24 | p[2] << 16 | p[3] << 8 | p[4]) >>> 0;
        const crc = (p[5] << 24 | p[6] << 16 | p[7] << 8 | p[8]) >>> 0;
        const n = name(10);
        if (this.upload || this.download) fail(2);
        else if (!isValidProxyFileName(n)) fail(3);
        else if (!fitsProxyStorage({ totalBytes: this.total, usedBytes: this.used, fileCount: 0 }, size)) fail(4);
        else if (this.files.has(n) && p[9] === 0) fail(5);
        else this.upload = { name: n, size, crc, replace: p[9] === 1, buf: [] };
        break;
      }
      case 3: {
        const u = this.upload;
        if (!u) fail(11);
        else if (u.buf.length !== u.size) fail(10);
        else if (((crc32(Uint8Array.from(u.buf)) ^ 0xffffffff) >>> 0) !== u.crc) fail(9);
        else this.files.set(u.name, Uint8Array.from(u.buf));
        if (u) this.upload = null;
        break;
      }
      case 4: this.upload = null; break;
      case 5:
        if (!this.files.delete(name(1))) fail(6);
        break;
      case 6: {
        const f = this.files.get(name(1));
        if (f) this.download = f;
        else fail(6);
        break;
      }
      case 7: {
        const off = (p[1] << 24 | p[2] << 16 | p[3] << 8 | p[4]) >>> 0;
        this.data = this.download ? this.download.slice(off, off + p[5]) : new Uint8Array(0);
        if (!this.download) fail(6);
        break;
      }
      case 8: this.download = null; break;
      default: fail(1);
    }
  }
}

function bytes(n: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);
}

export async function runProxyFilesTests(): Promise<void> {
  // pure helpers
  assert.equal(((crc32(new TextEncoder().encode("123456789")) ^ 0xffffffff) >>> 0), 0xcbf43926);
  assert.ok(isValidProxyFileName("fw-1.2.zip"));
  assert.ok(!isValidProxyFileName("fw.bin"));
  assert.ok(!isValidProxyFileName(".zip"));
  assert.ok(!isValidProxyFileName("a b.zip"));
  assert.equal(toProxyFileName("My FW v1.zip"), "My_FW_v1.zip");
  assert.equal(toProxyFileName(".hidden"), "hidden.zip");
  assert.ok(isValidProxyFileName(toProxyFileName("x".repeat(200))));
  assert.equal(storageBytesNeeded(1), 4 * 4096);
  assert.equal(parseListEntry(view([0])), null);
  assert.deepEqual(parseListEntry(view([1, 0, 0, 1, 0, 97, 46, 122, 105, 112])), { size: 256, name: "a.zip" });

  const storage = { totalBytes: 8 * 4096, usedBytes: 4096, fileCount: 1 };
  assert.equal(checkUpload(storage, [], "a.zip", 4096).ok, true); // 1+3 blocks <= 7 free
  const tooBig = checkUpload(storage, [], "a.zip", 5 * 4096);
  assert.equal(tooBig.ok, false);
  const replaceNoRoom = checkUpload(storage, [{ name: "a.zip", size: 4096 }], "a.zip", 5 * 4096);
  assert.equal(replaceNoRoom.ok === false && replaceNoRoom.reason.key === "errReplaceNoRoom", true);
  const replaceOk = checkUpload(storage, [{ name: "a.zip", size: 4096 }], "a.zip", 4096);
  assert.deepEqual(replaceOk, { ok: true, replaces: true });
  assert.equal(checkUpload(storage, [], "bad.bin", 1).ok, false);

  // client against the fake proxy
  const proxy = new FakeProxy();
  const files = new ProxyFiles(proxy);
  assert.deepEqual(await files.list(), []);

  const a = bytes(1000); // 7 chunks
  const progress: number[] = [];
  await files.upload("a.zip", a, false, { onProgress: (d) => progress.push(d) });
  assert.equal(progress.at(-1), 1000);
  assert.deepEqual(await files.list(), [{ name: "a.zip", size: 1000 }]);
  assert.deepEqual(Array.from(await files.download("a.zip")), Array.from(a));
  assert.equal((await files.storage()).fileCount, 1);

  // duplicate without replace is refused; with replace succeeds
  await assert.rejects(files.upload("a.zip", bytes(10), false), (e) => e instanceof ProxyFileError && e.code === 5);
  await files.upload("a.zip", bytes(10), true);
  assert.equal((await files.list())[0].size, 10);

  // no space is refused by the proxy even if the app check is bypassed
  await assert.rejects(files.upload("big.zip", bytes(64 * 1024), false), (e) => e instanceof ProxyFileError && e.code === 4);
  assert.equal(proxy.files.has("big.zip"), false);

  // a chunk error mid-upload surfaces and aborts
  const flaky = new FakeProxy();
  const orig = flaky.writeCharacteristic.bind(flaky);
  let writes = 0;
  flaky.writeCharacteristic = async (uuid, value) => {
    if (uuid === FILE_CHAR_UUIDS.data && ++writes === 3) return; // dropped chunk
    return orig(uuid, value);
  };
  await assert.rejects(new ProxyFiles(flaky).upload("x.zip", bytes(2000), false), ProxyFileError);
  assert.equal(flaky.files.size, 0);

  // delete, then missing
  await files.remove("a.zip");
  assert.deepEqual(await files.list(), []);
  await assert.rejects(files.remove("a.zip"), (e) => e instanceof ProxyFileError && e.code === 6);
  await assert.rejects(files.download("a.zip"), (e) => e instanceof ProxyFileError && e.code === 6);
}

void runProxyFilesTests().then(() => console.log("proxyFiles tests passed"));

void (async () => {
  const { combineFileLocations } = await import("./proxyFiles");
  assert.deepEqual(
    combineFileLocations(
      [
        { name: "phone only.zip", blob: new Blob(["a"]) },
        { name: "shared.zip", blob: new Blob(["bb"]) },
      ],
      [
        { name: "proxy-only.zip", size: 3 },
        { name: "shared.zip", size: 2 },
      ],
    ),
    [
      { name: "phone_only.zip", offline: true, onProxy: false, offlineName: "phone only.zip", size: 1, conflict: false },
      { name: "proxy-only.zip", offline: false, onProxy: true, offlineName: null, size: 3, conflict: false },
      { name: "shared.zip", offline: true, onProxy: true, offlineName: "shared.zip", size: 2, conflict: false },
    ],
  );

  // Two phone files that normalize to one proxy name are ambiguous: both stay
  // visible with their own names, neither is silently dropped, both conflict.
  const rows = combineFileLocations(
    [
      { name: "My FW.zip", blob: new Blob(["a"]) },
      { name: "My_FW.zip", blob: new Blob(["bb"]) },
      { name: "other.zip", blob: new Blob(["c"]) },
    ],
    [],
  );
  assert.equal(rows.length, 3, "colliding phone files must not collapse into one row");
  const clashing = rows.filter((row) => row.name === "My_FW.zip");
  assert.deepEqual(clashing.map((row) => row.offlineName).sort(), ["My FW.zip", "My_FW.zip"]);
  assert.ok(clashing.every((row) => row.conflict), "every colliding row is flagged");
  assert.equal(rows.find((row) => row.name === "other.zip")?.conflict, false);

  // A proxy file under the contested name stays one proxy row; each phone
  // copy still conflicts so neither can overwrite it.
  const withProxy = combineFileLocations(
    [
      { name: "My FW.zip", blob: new Blob(["a"]) },
      { name: "My_FW.zip", blob: new Blob(["bb"]) },
    ],
    [{ name: "My_FW.zip", size: 9 }],
  );
  assert.ok(withProxy.filter((row) => row.offline).every((row) => row.conflict));
  assert.ok(withProxy.every((row) => row.onProxy), "the proxy copy is shown on every row");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

void (async () => {
  const { getProxyStorageIfSupported } = await import("./proxyFiles");
  const storage = await getProxyStorageIfSupported({
    readCharacteristic: async (uuid) => {
      assert.equal(uuid, FILE_CHAR_UUIDS.storage);
      return view([...be32(8192), ...be32(1024), 0, 1]);
    },
    writeCharacteristic: async () => undefined,
  });
  assert.deepEqual(storage, { totalBytes: 8192, usedBytes: 1024, fileCount: 1 });
  assert.equal(
    await getProxyStorageIfSupported({
      readCharacteristic: async () => { throw new Error("characteristic unavailable"); },
      writeCharacteristic: async () => undefined,
    }),
    null,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

assert.equal(
  new ProxyFileError(12).message,
  "uploaded file is not a supported GFSK firmware package",
  "package validation errors must explain the accepted upload policy",
);
