import assert from "node:assert/strict";
import test from "node:test";

import { DfuSession, encodeStartPayload, startErrorText, type DfuProgress } from "./dfu";
import { translate } from "./i18n";
import { GDFU_CHAR_UUIDS, ProxyState, type GdfuBle, type ProxyStatusFrame } from "./bluetooth";

const target = { targetId: 1, profile: 1, rssi: -60, ttlSeconds: 5 };
const initData = new Uint8Array([1, 2, 3, 4]);
const appData = new Uint8Array(192);

class FakeBle {
  readonly writes: { uuid: string; withoutResponse: boolean }[] = [];
  private statusListener: ((frame: ProxyStatusFrame) => void) | null = null;
  statusReads = 0;
  queueEnabled = true;

  constructor(private readonly appBytes = 192) {}

  async setWriteQueueEnabled(enabled: boolean): Promise<void> {
    this.queueEnabled = enabled;
  }

  async writeCharacteristic(
    uuid: string,
    value: ArrayBuffer,
    withoutResponse = false,
  ): Promise<void> {
    this.writes.push({ uuid, withoutResponse });
    const command = new Uint8Array(value)[0];
    if (uuid === GDFU_CHAR_UUIDS.command) {
      const state = command === 2 ? ProxyState.Streaming : ProxyState.Idle;
      const confirmed = command === 5 ? this.appBytes + 4 : 0;
      queueMicrotask(() =>
        this.emit({
          state,
          acceptedBytes: confirmed,
          confirmedBytes: confirmed,
          lastError: 0,
          ackRssi: null,
        }),
      );
      return;
    }
    if (uuid === GDFU_CHAR_UUIDS.dataStream && !withoutResponse) {
      queueMicrotask(() =>
        this.emit({
          state: ProxyState.Streaming,
          acceptedBytes: 4,
          confirmedBytes: 4,
          lastError: 0,
          ackRssi: null,
        }),
      );
      return;
    }
    if (uuid === GDFU_CHAR_UUIDS.dataStream && withoutResponse) {
      const dataWrites = this.writes.filter((w) => w.uuid === GDFU_CHAR_UUIDS.dataStream).length;
      const confirmed = Math.min(4 + dataWrites * 192, 4 + this.appBytes);
      queueMicrotask(() =>
        this.emit({
          state: ProxyState.Streaming,
          acceptedBytes: confirmed,
          confirmedBytes: confirmed,
          lastError: 0,
          ackRssi: null,
        }),
      );
    }
  }

  async readCharacteristic(uuid: string): Promise<DataView> {
    if (uuid === GDFU_CHAR_UUIDS.discovery) {
      return new DataView(new Uint8Array([1, 0, 0, 0, 1, 1, 196, 0, 5]).buffer);
    }
    throw new Error(`unexpected read ${uuid}`);
  }

  async readStatus(): Promise<ProxyStatusFrame> {
    this.statusReads += 1;
    return {
      state: ProxyState.Idle,
      acceptedBytes: 0,
      confirmedBytes: 0,
      lastError: 0,
      ackRssi: null,
    };
  }

  async subscribeStatus(onFrame: (frame: ProxyStatusFrame) => void): Promise<() => void> {
    this.statusListener = onFrame;
    return () => {
      this.statusListener = null;
    };
  }

  private emit(frame: ProxyStatusFrame): void {
    this.statusListener?.(frame);
  }
}

/** Live discovery entry for target id 1, as read before the session starts. */
const liveDiscovery = () => new DataView(new Uint8Array([1, 0, 0, 0, 1, 1, 196, 0, 5]).buffer);
const emptyDiscovery = () => new DataView(new Uint8Array([0]).buffer);

/** Live for the pre-SELECT check, then `after` for every boot-verify poll. */
function discoveryAfterSelection(after: () => DataView): (ble: FakeBle) => void {
  return (ble) => {
    let reads = 0;
    ble.readCharacteristic = async (uuid) => {
      if (uuid !== GDFU_CHAR_UUIDS.discovery) {
        throw new Error(`unexpected read ${uuid}`);
      }
      return reads++ === 0 ? liveDiscovery() : after();
    };
  };
}

test("DfuSession advances transfer from STATUS notifications without polling", async () => {
  const ble = new FakeBle();
  discoveryAfterSelection(emptyDiscovery)(ble);
  const progress: DfuProgress[] = [];
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    bootVerifyTimeoutMs: 150,
    onProgress: (value) => progress.push(value),
  });

  await session.run();

  assert.equal(ble.statusReads, 0);
  assert.equal(progress.at(-1)?.phase, "success");
  assert.deepEqual(
    ble.writes
      .filter((write) => write.uuid === GDFU_CHAR_UUIDS.dataStream)
      .map((write) => write.withoutResponse),
    [false, true],
  );
});

test("DfuSession disables the BLE write queue while streaming and restores it after", async () => {
  const ble = new FakeBle();
  discoveryAfterSelection(emptyDiscovery)(ble);
  const streamingQueueStates: boolean[] = [];
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    bootVerifyTimeoutMs: 150,
    onProgress: (value) => {
      if (value.phase === "streaming") {
        streamingQueueStates.push(ble.queueEnabled);
      }
    },
  });

  await session.run();

  assert.ok(streamingQueueStates.length > 0);
  assert.ok(streamingQueueStates.every((enabled) => !enabled));
  assert.equal(ble.queueEnabled, true);
});

test("DfuSession reports success only after the target's reboot window", async () => {
  const ble = new FakeBle();
  // Target stopped beaconing when the session started; entry drained by FINISH.
  discoveryAfterSelection(emptyDiscovery)(ble);
  const phases: DfuProgress[] = [];
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    bootVerifyTimeoutMs: 150,
    onProgress: (value) => phases.push(value),
  });

  const startedAt = Date.now();
  await session.run();

  // Success is held back through the whole reboot-verify window.
  assert.ok(Date.now() - startedAt >= 150);
  assert.equal(phases.at(-1)?.phase, "success");
  assert.ok(phases.filter((value) => value.phase === "finishing").length >= 1);
});

test("DfuSession fails when the target falls back into its bootloader", async () => {
  const ble = new FakeBle();
  // Same target ID beaconing again after the reboot: the image did not start.
  discoveryAfterSelection(liveDiscovery)(ble);
  const phases: DfuProgress[] = [];
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    bootVerifyTimeoutMs: 150,
    onProgress: (value) => phases.push(value),
  });

  await assert.rejects(session.run(), /fell back into its bootloader/);
  assert.equal(phases.at(-1)?.phase, "failed");
});

test("encodeStartPayload word-aligns the image size like the flasher", () => {
  const start = encodeStartPayload(193);
  assert.equal(new DataView(start).getUint32(12, true), 196);
  assert.equal(new DataView(encodeStartPayload(192)).getUint32(12, true), 192);
});

test("DfuSession reports failed phase when subscribeStatus throws", async () => {
  const ble = new FakeBle();
  ble.subscribeStatus = async () => {
    throw new Error("CCCD write failed");
  };
  const progress: DfuProgress[] = [];
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    onProgress: (value) => progress.push(value),
  });

  await assert.rejects(session.run(), /CCCD write failed/);
  assert.equal(progress.at(-1)?.phase, "failed");
});

test("DfuSession aborts proxy after an unsuccessful transfer", async () => {
  const ble = new FakeBle();
  ble.readCharacteristic = async () => {
    throw new Error("target discovery read failed");
  };
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    onProgress: () => undefined,
  });

  await assert.rejects(session.run(), /target discovery read failed/);

  const aborts = ble.writes.filter(
    (write) => write.uuid === GDFU_CHAR_UUIDS.command && !write.withoutResponse,
  );
  assert.equal(
    aborts.length,
    2,
    "failure must clear both initial stale state and failed session state",
  );
});

test("DfuSession preserves transfer failure when notification cleanup loses connection", async () => {
  const ble = new FakeBle();
  ble.readCharacteristic = async () => {
    throw new Error("target discovery read failed");
  };
  ble.subscribeStatus = async () => {
    return async () => {
      throw new Error("Not connected to device.");
    };
  };
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    onProgress: () => undefined,
  });

  await assert.rejects(session.run(), /target discovery read failed/);
});

test("DfuSession emits streaming progress only when confirmedBytes advances", async () => {
  const appData = new Uint8Array(4 * 192);
  const ble = new FakeBle(appData.length);
  discoveryAfterSelection(emptyDiscovery)(ble);
  const phases: DfuProgress[] = [];
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    bootVerifyTimeoutMs: 150,
    onProgress: (value) => phases.push(value),
  });

  await session.run();

  const confirmed = phases
    .filter((value) => value.phase === "streaming")
    .map((value) => value.confirmedBytes);
  assert.deepEqual(confirmed, [...new Set(confirmed)]);
});

test("DfuSession reads STATUS after notification silence", async () => {
  const ble = new FakeBle();
  ble.readStatus = async () => {
    ble.statusReads += 1;
    return {
      state: ProxyState.Streaming,
      acceptedBytes: 0,
      confirmedBytes: 1,
      lastError: 0,
      ackRssi: null,
    };
  };
  const session = new DfuSession(ble as unknown as GdfuBle, {
    target,
    initData,
    appData,
    onProgress: () => undefined,
  });
  const waitForStatus = (
    session as unknown as {
      waitForStatus(
        predicate: (frame: { confirmedBytes: number }) => boolean,
        timeoutMs: number,
      ): Promise<{ confirmedBytes: number } | null>;
    }
  ).waitForStatus.bind(session);

  const frame = await waitForStatus((status) => status.confirmedBytes === 1, 300);

  assert.equal(frame?.confirmedBytes, 1);
  assert.equal(ble.statusReads, 1);
});

test("START rejection code 2 reads as busy target, not profile mismatch", () => {
  assert.match(translate("en-GB", startErrorText(2).key), /busy with previous session/);
  assert.match(translate("en-GB", startErrorText(14).key), /busy with previous session/);
  assert.match(translate("en-GB", startErrorText(3).key), /wrong or missing target/);
});
