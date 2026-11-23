/**
 * GDFU DFU session driver: drives the proxy through the exact sequence the
 * hardware-verified Python client (scripts/flasher_async.py) uses:
 *
 *   ABORT (clear stale session) -> SELECT_TARGET (retry while discovery
 *   repopulates) -> START_DFU (Nordic start packet, LE) -> wait STREAMING ->
 *   INIT (first DATA write, with response) -> stream 192-byte chunks
 *   (without response, 8-chunk flow window keyed on confirmedBytes) ->
 *   FINISH_DFU -> boot verify (wait out the target's reboot window; the
 *   MAC-derived beacon ID must stay gone — re-appearance means the image
 *   did not start).
 *
 * Progress and flow control use STATUS notifications. This matches the
 * hardware-verified Python client and immediately refills the proxy queue after
 * each RF ACK without adding GATT-read latency.
 */

import { AppError, type Message, type MessageKey } from "@/lib/i18n";
import {
  GDFU_CHAR_UUIDS,
  GdfuBle,
  ProxyState,
  parseDiscovery,
  type DiscoveredTarget,
  type ProxyStatusFrame,
} from "./bluetooth";

/** Matches GDFU_MAX_PAYLOAD on the proxy and docs/PROTOCOL_DFU_GFSK.md RF payload bound. */
export const CHUNK_SIZE = 192;
/** Proxy buffers 8 RF chunks (docs/PROTOCOL_BLE.md flow-control section). */
export const MAX_QUEUE_CHUNKS = 8;
const STATUS_FALLBACK_POLL_MS = 250;
/** Boot-verify budget: reboot window + beacon interval + image boot margin. */
export const BOOT_VERIFY_TIMEOUT_MS = 20000;
const DISCOVERY_POLL_MS = 1000;

/** Nordic dfu_start_packet_t, packed little-endian "<B3xIII" (flasher). */
export function encodeStartPayload(appSize: number): ArrayBuffer {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  view.setUint8(0, 0x04); // application-only update mode
  view.setUint32(4, 0, true); // SoftDevice size
  view.setUint32(8, 0, true); // bootloader size
  // Word-aligned size: the final chunk is 0xFF-padded to a flash word.
  view.setUint32(12, (appSize + 3) & ~3, true); // application size
  return buffer;
}

export function encodeCommand(command: number, payload?: ArrayBuffer): ArrayBuffer {
  const body = payload ?? new ArrayBuffer(0);
  const buffer = new ArrayBuffer(1 + body.byteLength);
  new Uint8Array(buffer)[0] = command;
  new Uint8Array(buffer, 1).set(new Uint8Array(body));
  return buffer;
}

export const Command = {
  SelectTarget: 0x01,
  StartDfu: 0x02,
  Abort: 0x03,
  ResetRadio: 0x04,
  FinishDfu: 0x05,
} as const;

/** Word-align the final chunk with 0xFF padding exactly like the flasher. */
function alignChunk(bytes: Uint8Array): Uint8Array {
  if (bytes.length % 4 === 0) {
    return bytes;
  }
  const aligned = new Uint8Array(bytes.length + (4 - (bytes.length % 4)));
  aligned.set(bytes);
  aligned.fill(0xff, bytes.length);
  return aligned;
}

export type DfuPhase =
  | "idle"
  | "selecting"
  | "starting"
  | "init"
  | "streaming"
  | "finishing"
  | "success"
  | "failed"
  | "cancelled";

/** Progress snapshot surfaced to the UI on every poll tick. */
export interface DfuProgress {
  phase: DfuPhase;
  bleDeliveredBytes: number;
  confirmedBytes: number;
  totalBytes: number;
  /** Failure cause (AppError when known); render with useErrorText. */
  error: unknown;
}

/** Protocol error code as a translatable message (dfuErr0–14). */
export function errorText(code: number): Message {
  return code >= 0 && code <= 14
    ? { key: `dfuErr${code}` as MessageKey }
    : { key: "errUnknown", params: { code } };
}

/**
 * Bootloaders before code 14 NACK every rejected START with code 2, mostly
 * because a failed run's session is still open (30 s idle timeout). The app
 * already blocks real profile mismatches before START, so say that instead.
 */
export function startErrorText(code: number): Message {
  return code === 2 ? errorText(14) : errorText(code);
}

export interface DfuSessionOptions {
  target: DiscoveredTarget;
  /** Nordic init packet (device type, SoftDevice list, image CRC16). */
  initData: Uint8Array;
  /** Application image bytes (word-aligned tail applied per chunk). */
  appData: Uint8Array;
  onProgress: (progress: DfuProgress) => void;
  /** Test seam: budget for the post-FINISH boot verify (default 20 s). */
  bootVerifyTimeoutMs?: number;
}

export class DfuFailure extends AppError {}
export class DfuCancelledError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function u32be(value: number): ArrayBuffer {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, false);
  return buffer;
}

/** Copy a byte range into a standalone ArrayBuffer for GATT writes. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.length);
  new Uint8Array(out).set(bytes);
  return out;
}

export class DfuSession {
  private cancelled = false;
  private statusFrames: ProxyStatusFrame[] = [];
  private statusChanged: (() => void) | null = null;

  constructor(
    private readonly ble: GdfuBle,
    private readonly options: DfuSessionOptions,
  ) {}

  cancel(): void {
    this.cancelled = true;
  }

  private progress(
    phase: DfuPhase,
    confirmedBytes: number,
    bleDeliveredBytes: number,
    error: unknown = null,
  ): void {
    this.options.onProgress({
      phase,
      bleDeliveredBytes,
      confirmedBytes,
      totalBytes: this.options.appData.length,
      error,
    });
  }

  private throwIfCancelled(): void {
    if (this.cancelled) {
      throw new DfuCancelledError();
    }
  }

  private onStatus(frame: ProxyStatusFrame): void {
    this.statusFrames.push(frame);
    this.statusChanged?.();
    this.statusChanged = null;
  }

  /** Wait for a STATUS notification matching predicate, terminal error, or timeout. */
  private async waitForStatus(
    predicate: (frame: ProxyStatusFrame) => boolean,
    timeoutMs: number,
  ): Promise<ProxyStatusFrame | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      this.throwIfCancelled();
      const frame = this.statusFrames.shift();
      if (frame) {
        if (frame.state === ProxyState.Error || predicate(frame)) {
          return frame;
        }
        continue;
      }
      await Promise.race([
        new Promise<void>((resolve) => {
          this.statusChanged = resolve;
        }),
        sleep(Math.min(STATUS_FALLBACK_POLL_MS, Math.max(0, deadline - Date.now()))),
      ]);
      if (this.statusFrames.length === 0) {
        const polled = await this.ble.readStatus();
        if (polled) {
          this.onStatus(polled);
        }
      }
    }
    return null;
  }

  async run(): Promise<void> {
    const { target, initData, appData } = this.options;
    const totalBytes = appData.length;
    let unsubscribe: () => Promise<void> = async () => undefined;
    try {
      unsubscribe = await this.ble.subscribeStatus((frame) => this.onStatus(frame));
      // 1. Clear any stale session so SELECT_TARGET is accepted.
      this.progress("selecting", 0, 0);
      await this.ble.writeCharacteristic(GDFU_CHAR_UUIDS.command, encodeCommand(Command.Abort));
      const idle = await this.waitForStatus(
        (frame) => frame.state === ProxyState.Idle && frame.lastError === 0,
        5000,
      );
      if (!idle || idle.state !== ProxyState.Idle) {
        throw new DfuFailure(
          idle ? "errProxyNotIdle" : "errProxyUnreachable",
        );
      }

      // 2. Select target. The requested target may have rebooted since
      //    discovery and gone silent for good (bootloader session over). Before
      //    selecting, re-read DISCOVERY and verify the target is still live
      //    (TTL > 0); if it is not,
      //    fail fast with the reason instead of hammering SELECT.
      const discovery = parseDiscovery(
        await this.ble.readCharacteristic(GDFU_CHAR_UUIDS.discovery),
      );
      const live = discovery.find((entry) => entry.targetId === target.targetId);
      if (!live || live.ttlSeconds <= 0) {
        throw new DfuFailure(
          "errTargetGone",
          { id: `0x${target.targetId.toString(16).padStart(8, "0")}` },
        );
      }
      let selected = false;
      for (let attempt = 0; attempt < 12 && !selected; attempt += 1) {
        this.throwIfCancelled();
        await this.ble.writeCharacteristic(
          GDFU_CHAR_UUIDS.command,
          encodeCommand(Command.SelectTarget, u32be(target.targetId)),
        );
        const frame = await this.waitForStatus(
          (status) =>
            status.state === ProxyState.Idle ||
            status.state === ProxyState.Streaming ||
            status.state === ProxyState.Error,
          3000,
        );
        if (frame && frame.state !== ProxyState.Error) {
          selected = true;
        } else {
          await sleep(500);
        }
      }
      if (!selected) {
        throw new DfuFailure(
          "errTargetNotSelectable",
          { id: `0x${target.targetId.toString(16).padStart(8, "0")}` },
        );
      }

      // 3. START_DFU with Nordic start packet; target erases flash.
      this.progress("starting", 0, 0);
      await this.ble.writeCharacteristic(
        GDFU_CHAR_UUIDS.command,
        encodeCommand(Command.StartDfu, encodeStartPayload(totalBytes)),
      );
      const streaming = await this.waitForStatus(
        (frame) => frame.state === ProxyState.Streaming,
        25000,
      );
      if (!streaming || streaming.state !== ProxyState.Streaming) {
        throw streaming ? new DfuFailure("errStartFailed", { reason: startErrorText(streaming.lastError) }) : new DfuFailure("errStartTimeout");
      }

      // 4. INIT packet: first DATA write, with response, wait for confirm.
      this.progress("init", 0, 0);
      await this.ble.writeCharacteristic(GDFU_CHAR_UUIDS.dataStream, toArrayBuffer(initData));
      const initAck = await this.waitForStatus(
        (frame) => frame.confirmedBytes >= initData.byteLength,
        5000,
      );
      if (!initAck || initAck.state === ProxyState.Error) {
        throw initAck ? new DfuFailure("errInitRejected", { reason: errorText(initAck.lastError) }) : new DfuFailure("errInitNoAck");
      }
      const baseConfirmed = initData.byteLength;

      // 5. Stream chunks with the 8-chunk proxy flow window.
      let sentBytes = 0;
      let confirmed = baseConfirmed;
      await this.ble.setWriteQueueEnabled(false);
      try {
        this.progress("streaming", baseConfirmed, 0);
        while (confirmed - baseConfirmed < totalBytes) {
          this.throwIfCancelled();
          const burst: Promise<void>[] = [];
          while (
            sentBytes < totalBytes &&
            sentBytes - (confirmed - baseConfirmed) < MAX_QUEUE_CHUNKS * CHUNK_SIZE
          ) {
            const end = Math.min(sentBytes + CHUNK_SIZE, totalBytes);
            const chunk = alignChunk(appData.subarray(sentBytes, end));
            burst.push(
              this.ble.writeCharacteristic(
                GDFU_CHAR_UUIDS.dataStream,
                toArrayBuffer(chunk),
                true,
              ),
            );
            sentBytes = end;
          }
          await Promise.all(burst);
          const frame = await this.waitForStatus((status) => status.confirmedBytes > confirmed, 6000);
          if (!frame) {
            throw new DfuFailure(
              "errStalled",
              { sent: confirmed - baseConfirmed, total: totalBytes },
            );
          }
          if (frame.state === ProxyState.Error) {
            throw new DfuFailure("errTarget", { reason: errorText(frame.lastError) });
          }
          confirmed = Math.max(confirmed, frame.confirmedBytes);
          this.progress("streaming", confirmed, sentBytes);
        }
      } finally {
        await this.ble.setWriteQueueEnabled(true);
      }

      // 6. FINISH_DFU: CRC16 postvalidation and bank activation on target.
      this.progress("finishing", confirmed, sentBytes);
      await this.ble.writeCharacteristic(GDFU_CHAR_UUIDS.command, encodeCommand(Command.FinishDfu));
      const finished = await this.waitForStatus(
        (frame) => frame.state === ProxyState.Idle && frame.lastError === 0,
        15000,
      );
      if (!finished || finished.state !== ProxyState.Idle) {
        throw finished ? new DfuFailure("errPostvalidation", { reason: errorText(finished.lastError) }) : new DfuFailure("errFinishNoAck");
      }

      // 7. Boot verify. The proxy's IDLE only proves the target ACKed FINISH
      // (CRC validated + image activated); the target then spends up to
      // the bootloader's GDFU_FINISH_ACK_WINDOW_MS (12 s) re-ACKing lost
      // retries before it resets. The beacon ID is MAC-derived, so it
      // survives that reboot: an image that
      // fails to start drops the target back into the bootloader and the same
      // ID reappears in DISCOVERY. The pre-session entry has long drained by
      // now (START's ~9 s erase wait + streaming exceed the proxy's 15 s
      // discovery TTL), so any live entry is a fresh post-reboot beacon.
      const verifyDeadline =
        Date.now() + (this.options.bootVerifyTimeoutMs ?? BOOT_VERIFY_TIMEOUT_MS);
      while (Date.now() < verifyDeadline) {
        this.throwIfCancelled();
        try {
          const entries = parseDiscovery(
            await this.ble.readCharacteristic(GDFU_CHAR_UUIDS.discovery),
          );
          const beacon = entries.find(
            (entry) => entry.targetId === target.targetId && entry.ttlSeconds > 0,
          );
          if (beacon) {
            throw new DfuFailure(
              "errBootFallback",
            );
          }
        } catch (error) {
          if (error instanceof DfuFailure) {
            throw error;
          }
          // Transient GATT churn: keep polling; a dropped link must not fail a
          // transfer the target has already validated.
        }
        await sleep(Math.min(DISCOVERY_POLL_MS, Math.max(0, verifyDeadline - Date.now())));
      }
      this.progress("success", confirmed, sentBytes);
    } catch (error) {
      // Best-effort abort. A failed transfer must not leave proxy or target
      // state active while the phone remains connected.
      try {
        await this.ble.writeCharacteristic(GDFU_CHAR_UUIDS.command, encodeCommand(Command.Abort));
        await this.waitForStatus((frame) => frame.state === ProxyState.Idle, 5000);
      } catch {
        // Proxy may be unreachable; disconnect recovery handles it.
      }
      if (error instanceof DfuCancelledError) {
        this.progress("cancelled", 0, 0);
        return;
      }
      this.progress("failed", 0, 0, error);
      throw error;
    } finally {
      try {
        await unsubscribe();
      } catch {
        // Disconnect may already have removed the notification subscription.
      }
      this.statusFrames = [];
      this.statusChanged = null;
    }
  }
}
