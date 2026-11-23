/**
 * GATT plumbing for the GFSK DFU proxy plus the transport abstraction.
 *
 * The proxy contract (docs/PROTOCOL_BLE.md) is a single service with seven
 * characteristics. Two transports implement the same surface:
 *  - WebBluetoothTransport: navigator.bluetooth (Chrome/Edge desktop+Android)
 *  - CapacitorBleTransport: @capacitor-community/bluetooth-le (Android APK)
 * The UI selects whichever is available; DFU logic never sees the difference.
 */

import { Capacitor } from "@capacitor/core";
import { BleClient, numbersToDataView } from "@capacitor-community/bluetooth-le";
import { AppError } from "@/lib/i18n";

export const GDFU_SERVICE_UUID = "7e4c2a10-8b31-4f9d-a600-000000000000";

export const GDFU_CHAR_UUIDS = {
  versionCaps: "7e4c2a10-8b31-4f9d-a600-000000000001",
  release: "7e4c2a10-8b31-4f9d-a600-000000000002",
  radioConfig: "7e4c2a10-8b31-4f9d-a600-000000000010",
  txPower: "7e4c2a10-8b31-4f9d-a600-000000000011",
  discovery: "7e4c2a10-8b31-4f9d-a600-000000000020",
  command: "7e4c2a10-8b31-4f9d-a600-000000000030",
  dataStream: "7e4c2a10-8b31-4f9d-a600-000000000031",
  status: "7e4c2a10-8b31-4f9d-a600-000000000032",
} as const;

export const GDFU_FILE_CHAR_UUIDS = {
  command: "7e4c2a10-8b31-4f9d-a600-000000000040",
  data: "7e4c2a10-8b31-4f9d-a600-000000000041",
  status: "7e4c2a10-8b31-4f9d-a600-000000000042",
  storage: "7e4c2a10-8b31-4f9d-a600-000000000043",
} as const;

/** Proxy states reported by the STATUS characteristic. */
export const ProxyState = {
  Idle: 0x01,
  Busy: 0x02,
  Streaming: 0x03,
  Error: 0x04,
} as const;
export type ProxyStateValue = (typeof ProxyState)[keyof typeof ProxyState];

/** STATUS payload: [state:1][accepted:4][confirmed:4][last_error:1][ack_rssi:1, newer proxies], big-endian. */
export interface ProxyStatusFrame {
  state: number;
  acceptedBytes: number;
  confirmedBytes: number;
  lastError: number;
  /** gFSK RSSI (dBm) of the target's last ACK/NACK; null when none yet or the proxy predates it. */
  ackRssi: number | null;
}

export function parseStatus(raw: DataView): ProxyStatusFrame | null {
  if (raw.byteLength < 10) {
    return null;
  }
  const be = (offset: number): number =>
    ((raw.getUint8(offset) << 24) |
      (raw.getUint8(offset + 1) << 16) |
      (raw.getUint8(offset + 2) << 8) |
      raw.getUint8(offset + 3)) >>>
    0;
  return {
    state: raw.getUint8(0),
    acceptedBytes: be(1),
    confirmedBytes: be(5),
    lastError: raw.getUint8(9),
    ackRssi: raw.byteLength > 10 && raw.getInt8(10) !== 0 ? raw.getInt8(10) : null,
  };
}

/** One discovered target from the TARGET_DISCOVERY characteristic. */
export interface DiscoveredTarget {
  targetId: number;
  profile: number;
  rssi: number;
  ttlSeconds: number;
}

export function parseDiscovery(raw: DataView): DiscoveredTarget[] {
  const count = raw.getUint8(0);
  const targets: DiscoveredTarget[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = 1 + i * 8;
    if (base + 8 > raw.byteLength) {
      break;
    }
    targets.push({
      targetId: raw.getUint32(base, false),
      profile: raw.getUint8(base + 4),
      rssi: raw.getInt8(base + 5),
      ttlSeconds: raw.getUint16(base + 6, false),
    });
  }
  return targets;
}

/** VERSION_CAPS payload: [proto:1][fw:3][profiles_mask:2][max_chunk:2]. */
export interface ProxyVersionCaps {
  protocolVersion: number;
  firmwareVersion: string;
  profilesMask: number;
  maxBleChunk: number;
}

export function parseVersionCaps(raw: DataView): ProxyVersionCaps | null {
  if (raw.byteLength < 8) {
    return null;
  }
  const fw = [raw.getUint8(1), raw.getUint8(2), raw.getUint8(3)];
  return {
    protocolVersion: raw.getUint8(0),
    firmwareVersion: `${fw[0]}.${fw[1]}.${fw[2]}`,
    profilesMask: raw.getUint16(4, false),
    maxBleChunk: raw.getUint16(6, false),
  };
}

/** RADIO_CONFIG payload, all big-endian (docs/PROTOCOL_BLE.md). */
export interface RadioConfig {
  profile: number;
  freqHz: number;
  txPowerDbm: number;
  bitrateBps: number;
  deviationHz: number;
  rxBwHz: number;
}

/** A target can only receive DFU on the proxy's active compile-time RF profile. */
export function isTargetProfileCompatible(target: DiscoveredTarget, radio: RadioConfig): boolean {
  return target.profile === radio.profile;
}

export function parseRadioConfig(raw: DataView): RadioConfig | null {
  if (raw.byteLength < 18) {
    return null;
  }
  return {
    profile: raw.getUint8(0),
    freqHz: raw.getUint32(1, false),
    txPowerDbm: raw.getUint8(5),
    bitrateBps: raw.getUint32(6, false),
    deviationHz: raw.getUint32(10, false),
    rxBwHz: raw.getUint32(14, false),
  };
}

export function encodeRadioConfig(config: RadioConfig): ArrayBuffer {
  const buf = new ArrayBuffer(18);
  const view = new DataView(buf);
  view.setUint8(0, config.profile);
  view.setUint32(1, config.freqHz, false);
  view.setUint8(5, config.txPowerDbm);
  view.setUint32(6, config.bitrateBps, false);
  view.setUint32(10, config.deviationHz, false);
  view.setUint32(14, config.rxBwHz, false);
  return buf;
}

/** Connection-state observer contract shared with the UI layer. */
export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface GdfuBleEvents {
  onConnectionChanged: (state: ConnectionState) => void;
  onStatus: (frame: ProxyStatusFrame) => void;
  onUnexpectedDisconnect: () => void;
}

/**
 * Transport-neutral GATT surface. Values cross the boundary as ArrayBuffers;
 * notifications are forwarded verbatim for payload-specific parsing.
 */
export interface BleTransport {
  isConnected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  read(uuid: string): Promise<DataView>;
  write(uuid: string, value: ArrayBuffer, withoutResponse: boolean): Promise<void>;
  readRssi(): Promise<number | null>;
  /** Start STATUS notifications; returns an unsubscribe function. */
  subscribeStatus(onFrame: (frame: ProxyStatusFrame) => void): Promise<() => Promise<void>>;
}

export function hasWebBluetooth(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function selectBleTransport({
  native,
  webBluetooth,
}: {
  native: boolean;
  webBluetooth: boolean;
}): "capacitor" | "web" {
  return native || !webBluetooth ? "capacitor" : "web";
}

export function isNativeBleRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

export type NativeBleReadiness = "ready" | "permissions" | "unavailable";

export function nativeBleReadiness({
  initialized,
}: {
  initialized: boolean | "unavailable";
}): NativeBleReadiness {
  if (initialized === "unavailable") {
    return "unavailable";
  }
  return initialized ? "ready" : "permissions";
}

/** Requests native BLE permissions and reports whether BLE can be used. */
export async function getNativeBleReadiness(): Promise<NativeBleReadiness> {
  try {
    await BleClient.initialize({ androidNeverForLocation: true });
    return nativeBleReadiness({ initialized: true });
  } catch (error) {
    return nativeBleReadiness({
      initialized: /permission denied/i.test(error instanceof Error ? error.message : String(error))
        ? false
        : "unavailable",
    });
  }
}

export async function fixNativeBleReadiness(): Promise<void> {
  await BleClient.openAppSettings();
}

export const DISCOVERY_DURATION_MS = 5_000;

export function proxyScanOptions(): { services: string[] } {
  return { services: [GDFU_SERVICE_UUID] };
}

export function signalStrength(rssi: number): "weak" | "medium" | "strong" {
  return rssi >= -75 ? "strong" : rssi >= -90 ? "medium" : "weak";
}

export function normalizeRssi(value: string | number): number | null {
  const rssi = Number(value);
  return Number.isFinite(rssi) ? rssi : null;
}

export function shouldStopDiscovery(elapsedMs: number): boolean {
  return elapsedMs >= DISCOVERY_DURATION_MS;
}

export function shouldReportDisconnect(unexpected: boolean): boolean {
  return unexpected;
}

export interface DiscoveredProxy {
  deviceId: string;
  name: string;
  rssi: number | null;
}

export function normalizeDiscoveredProxy(result: {
  device: { deviceId: string; name?: string };
  localName?: string;
  rssi?: number;
}): DiscoveredProxy {
  return {
    deviceId: result.device.deviceId,
    name: result.localName ?? result.device.name ?? "Unnamed proxy",
    rssi: result.rssi ?? null,
  };
}

export class WebBluetoothTransport implements BleTransport {
  private server: BluetoothRemoteGATTServer | null = null;
  private chars: Map<string, BluetoothRemoteGATTCharacteristic> = new Map();
  private disconnectExpected = false;

  constructor(private readonly events: GdfuBleEvents) {}

  get isConnected(): boolean {
    return this.server?.connected ?? false;
  }

  async connect(): Promise<void> {
    this.disconnectExpected = false;
    this.events.onConnectionChanged("connecting");
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "GFSK DFU" }, { namePrefix: "GDFU" }],
        optionalServices: [GDFU_SERVICE_UUID],
      });
      device.addEventListener("gattserverdisconnected", () => {
        const unexpected = !this.disconnectExpected;
        this.disconnectExpected = false;
        this.chars.clear();
        this.server = null;
        this.events.onConnectionChanged("disconnected");
        if (shouldReportDisconnect(unexpected)) {
          this.events.onUnexpectedDisconnect();
        }
      });
      this.server = await device.gatt!.connect();
      const service = await this.server.getPrimaryService(GDFU_SERVICE_UUID);
      for (const [name, uuid] of Object.entries(GDFU_CHAR_UUIDS)) {
        try {
          this.chars.set(uuid, await service.getCharacteristic(uuid));
        } catch (error) {
          if (name !== "release") throw error;
        }
      }
      // File management is absent on older proxy firmware; connect anyway.
      for (const uuid of Object.values(GDFU_FILE_CHAR_UUIDS)) {
        try {
          this.chars.set(uuid, await service.getCharacteristic(uuid));
        } catch {
          break;
        }
      }
      this.events.onConnectionChanged("connected");
    } catch (error) {
      this.events.onConnectionChanged("disconnected");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.disconnectExpected = true;
    this.server?.disconnect();
    this.server = null;
    this.chars.clear();
    this.events.onConnectionChanged("disconnected");
  }

  private char(uuid: string): BluetoothRemoteGATTCharacteristic {
    const characteristic = this.chars.get(uuid);
    if (!characteristic) {
      throw new AppError("errNoCharacteristic", { uuid });
    }
    return characteristic;
  }

  async read(uuid: string): Promise<DataView> {
    return this.char(uuid).readValue();
  }

  async write(uuid: string, value: ArrayBuffer, withoutResponse: boolean): Promise<void> {
    const characteristic = this.char(uuid);
    if (withoutResponse) {
      await characteristic.writeValueWithoutResponse(value);
    } else {
      await characteristic.writeValueWithResponse(value);
    }
  }

  async readRssi(): Promise<number | null> {
    return null;
  }

  async subscribeStatus(onFrame: (frame: ProxyStatusFrame) => void): Promise<() => Promise<void>> {
    const characteristic = this.char(GDFU_CHAR_UUIDS.status);
    const listener = (event: Event): void => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      const frame = parseStatus(target.value as DataView);
      if (frame) {
        onFrame(frame);
        this.events.onStatus(frame);
      }
    };
    characteristic.addEventListener("characteristicvaluechanged", listener);
    await characteristic.startNotifications();
    return async () => {
      characteristic.removeEventListener("characteristicvaluechanged", listener);
      await characteristic.stopNotifications();
    };
  }
}

export class CapacitorBleTransport implements BleTransport {
  private deviceId: string | null = null;
  private scanResults = new Map<string, DiscoveredProxy>();
  private disconnectExpected = false;
  private scanning = false;

  constructor(private readonly events: GdfuBleEvents) {}

  get isConnected(): boolean {
    return this.deviceId !== null;
  }

  async connect(): Promise<void> {
    throw new AppError("errSelectProxyFirst");
  }

  async scan(onResult: (proxies: DiscoveredProxy[]) => void): Promise<void> {
    await BleClient.initialize({ androidNeverForLocation: true });
    await this.stopScan();
    this.scanResults.clear();
    this.scanning = true;
    await BleClient.requestLEScan(
      proxyScanOptions(),
      (result) => {
        const proxy = normalizeDiscoveredProxy(result);
        this.scanResults.set(proxy.deviceId, proxy);
        onResult(this.proxies);
      },
    );
  }

  get proxies(): DiscoveredProxy[] {
    return [...this.scanResults.values()];
  }

  async stopScan(): Promise<void> {
    if (this.scanning) {
      await BleClient.stopLEScan();
      this.scanning = false;
    }
  }

  async connectProxy(deviceId: string): Promise<void> {
    this.disconnectExpected = false;
    this.events.onConnectionChanged("connecting");
    try {
      await this.stopScan();
      this.deviceId = deviceId;
      await BleClient.connect(this.deviceId, () => {
        const unexpected = !this.disconnectExpected;
        this.disconnectExpected = false;
        this.deviceId = null;
        this.events.onConnectionChanged("disconnected");
        if (shouldReportDisconnect(unexpected)) {
          this.events.onUnexpectedDisconnect();
        }
      });
      this.events.onConnectionChanged("connected");
    } catch (error) {
      this.deviceId = null;
      this.events.onConnectionChanged("disconnected");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.stopScan();
    this.disconnectExpected = true;
    if (this.deviceId !== null) {
      await BleClient.disconnect(this.deviceId);
    }
    this.deviceId = null;
    this.events.onConnectionChanged("disconnected");
  }

  async read(uuid: string): Promise<DataView> {
    if (this.deviceId === null) {
      throw new AppError("errNotConnected");
    }
    return BleClient.read(this.deviceId, GDFU_SERVICE_UUID, uuid);
  }

  async write(uuid: string, value: ArrayBuffer, withoutResponse: boolean): Promise<void> {
    if (this.deviceId === null) {
      throw new AppError("errNotConnected");
    }
    const data = numbersToDataView(Array.from(new Uint8Array(value)));
    if (withoutResponse) {
      await BleClient.writeWithoutResponse(this.deviceId, GDFU_SERVICE_UUID, uuid, data);
    } else {
      await BleClient.write(this.deviceId, GDFU_SERVICE_UUID, uuid, data);
    }
  }

  async readRssi(): Promise<number | null> {
    if (this.deviceId === null) {
      return null;
    }
    return normalizeRssi(await BleClient.readRssi(this.deviceId));
  }

  async setWriteQueueEnabled(enabled: boolean): Promise<void> {
    // iOS only: Android resolves each write in onCharacteristicWrite and
    // pre-13 BluetoothGatt refuses overlapping writes, so its serialised
    // path must stay. iOS dispatches writes on the main queue and gains
    // back-to-back dispatch without the JS round trip.
    if (Capacitor.getPlatform() !== "ios") {
      return;
    }
    if (enabled) {
      BleClient.enableQueue();
    } else {
      BleClient.disableQueue();
    }
  }

  async subscribeStatus(onFrame: (frame: ProxyStatusFrame) => void): Promise<() => Promise<void>> {
    if (this.deviceId === null) {
      throw new AppError("errNotConnected");
    }
    const deviceId = this.deviceId;
    await BleClient.startNotifications(
      deviceId,
      GDFU_SERVICE_UUID,
      GDFU_CHAR_UUIDS.status,
      (raw) => {
        const frame = parseStatus(raw);
        if (frame) {
          onFrame(frame);
          this.events.onStatus(frame);
        }
      },
    );
    return () => BleClient.stopNotifications(deviceId, GDFU_SERVICE_UUID, GDFU_CHAR_UUIDS.status);
  }
}

/**
 * Facade over the selected transport exposing exactly the proxy surface.
 * All encode/decode of characteristic payloads lives above this class.
 */
export class GdfuBle {
  private transport: BleTransport;

  constructor(
    private readonly events: GdfuBleEvents,
    transport?: BleTransport,
  ) {
    this.transport =
      transport ??
      (selectBleTransport({
        native: isNativeBleRuntime(),
        webBluetooth: hasWebBluetooth(),
      }) === "web"
        ? new WebBluetoothTransport(events)
        : new CapacitorBleTransport(events));
  }

  get isConnected(): boolean {
    return this.transport.isConnected;
  }

  async requestAndConnect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  async scanProxies(onResult: (proxies: DiscoveredProxy[]) => void): Promise<void> {
    if (!(this.transport instanceof CapacitorBleTransport)) {
      throw new AppError("errNativeScan");
    }
    await this.transport.scan(onResult);
  }

  get discoveredProxies(): DiscoveredProxy[] {
    return this.transport instanceof CapacitorBleTransport ? this.transport.proxies : [];
  }

  async stopProxyScan(): Promise<void> {
    if (this.transport instanceof CapacitorBleTransport) {
      await this.transport.stopScan();
    }
  }

  async connectProxy(deviceId: string): Promise<void> {
    if (!(this.transport instanceof CapacitorBleTransport)) {
      throw new AppError("errNativeSelect");
    }
    await this.transport.connectProxy(deviceId);
  }

  async readCharacteristic(uuid: string): Promise<DataView> {
    return this.transport.read(uuid);
  }

  async readRssi(): Promise<number | null> {
    return this.transport.readRssi();
  }

  /**
   * Streaming DATA writes are latency-critical on iOS, where the plugin queue
   * serialises every write into a full WebView bridge round trip. Disabling it
   * lets a refill burst reach CoreBluetooth back-to-back; only the DFU session
   * uses this, around its streaming phase.
   */
  async setWriteQueueEnabled(enabled: boolean): Promise<void> {
    if (this.transport instanceof CapacitorBleTransport) {
      await this.transport.setWriteQueueEnabled(enabled);
    }
  }

  async writeCharacteristic(
    uuid: string,
    value: ArrayBuffer,
    withoutResponse = false,
  ): Promise<void> {
    await this.transport.write(uuid, value, withoutResponse);
  }

  async readStatus(): Promise<ProxyStatusFrame | null> {
    return parseStatus(await this.transport.read(GDFU_CHAR_UUIDS.status));
  }

  /** Exposed for future notification use; DFU currently polls STATUS. */
  async subscribeStatus(onFrame: (frame: ProxyStatusFrame) => void): Promise<() => Promise<void>> {
    return this.transport.subscribeStatus(onFrame);
  }
}
