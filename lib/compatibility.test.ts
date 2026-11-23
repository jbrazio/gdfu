import assert from "node:assert/strict";
import {
  normalizeRssi,
  normalizeDiscoveredProxy,
  signalStrength,
  shouldStopDiscovery,
  selectBleTransport,
  nativeBleReadiness,
  isTargetProfileCompatible,
  shouldReportDisconnect,
  proxyScanOptions,
  GDFU_SERVICE_UUID,
  type DiscoveredTarget,
  type RadioConfig,
} from "./bluetooth";

const target: DiscoveredTarget = {
  targetId: 0x01020304,
  profile: 1,
  rssi: -80,
  ttlSeconds: 5,
};

const radio: RadioConfig = {
  profile: 1,
  freqHz: 433_100_000,
  txPowerDbm: 10,
  bitrateBps: 80_000,
  deviationHz: 28_000,
  rxBwHz: 187_200,
};

export function runCompatibilityTests(): void {
  assert.equal(
    selectBleTransport({ native: true, webBluetooth: true }),
    "capacitor",
    "native runtimes must use the Capacitor BLE transport even when Web Bluetooth exists",
  );
  assert.equal(
    selectBleTransport({ native: false, webBluetooth: true }),
    "web",
    "browsers with Web Bluetooth must use the web transport",
  );
  assert.equal(
    nativeBleReadiness({ initialized: false }),
    "permissions",
    "failed native BLE initialization must block the app for permissions",
  );
  assert.equal(
    nativeBleReadiness({ initialized: true }),
    "ready",
    "disabled Bluetooth must not block the native app",
  );
  assert.deepEqual(
    proxyScanOptions(),
    { services: [GDFU_SERVICE_UUID] },
    "proxy scan must filter only by GDFU service UUID, not advertised name",
  );
  assert.deepEqual(
    normalizeDiscoveredProxy({ device: { deviceId: "01:02" }, localName: "GFSK DFU Bench", rssi: -61 }),
    { deviceId: "01:02", name: "GFSK DFU Bench", rssi: -61 },
    "native scan results must expose selectable proxy data",
  );
  assert.deepEqual(
    normalizeDiscoveredProxy({ device: { deviceId: "03:04" } }),
    { deviceId: "03:04", name: "Unnamed proxy", rssi: null },
    "missing advertised names and RSSI must remain readable",
  );
  assert.equal(
    nativeBleReadiness({ initialized: "unavailable" }),
    "unavailable",
    "unsupported native BLE must not be presented as a permission problem",
  );
  assert.equal(normalizeRssi("-74"), -74, "native RSSI string must parse to dBm");
  assert.equal(normalizeRssi("unknown"), null, "invalid native RSSI must not render an indicator");
  assert.equal(signalStrength(-91), "weak", "RSSI below -90 dBm must be weak");
  assert.equal(signalStrength(-90), "medium", "RSSI at -90 dBm must be medium");
  assert.equal(signalStrength(-75), "strong", "RSSI at -75 dBm must be strong");
  assert.equal(shouldStopDiscovery(4_999), false, "target discovery must keep running before five seconds");
  assert.equal(shouldStopDiscovery(5_000), true, "target discovery must stop after five seconds");
  assert.equal(isTargetProfileCompatible(target, radio), true, "matching profiles must be allowed");
  assert.equal(
    isTargetProfileCompatible(target, { ...radio, profile: 2 }),
    false,
    "mismatched target and proxy profiles must be blocked before DFU",
  );
  assert.equal(
    shouldReportDisconnect(true),
    true,
    "unexpected GATT disconnect must be reported",
  );
  assert.equal(
    shouldReportDisconnect(false),
    false,
    "user-requested disconnect must not show a proxy error",
  );
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("compatibility.test.ts")) {
  runCompatibilityTests();
  console.log("compatibility tests passed");
}
