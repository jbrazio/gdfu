# GDFU Application

## GDFU ecosystem

### About GDFU

GDFU updates firmware on nRF52840 targets over a GFSK radio link. The application connects to an ESP32 proxy over BLE. The proxy sends the firmware to the target bootloader, so the phone or computer stays near the proxy rather than the target.

### Projects

| Project | Role |
| --- | --- |
| [GDFU Application](https://github.com/jbrazio/gdfu) | Web and mobile client for discovering targets and managing firmware updates |
| [GDFU Proxy](https://github.com/jbrazio/gdfu-proxy) | ESP32 firmware bridging BLE to the GFSK radio link |
| [GDFU Bootloader](https://github.com/jbrazio/gdfu-bootloader) | nRF52840 bootloader receiving and installing target firmware |

### How it works

```text
Application ── BLE ── Proxy ── GFSK radio ── Target bootloader
```

1. Install the GDFU bootloader on a supported target and the proxy firmware on a supported ESP32 board.
2. Set the proxy and target to the same radio profile. Use hardware suited to that frequency and follow local radio regulations.
3. Put the target into DFU mode, open the application, and connect to the proxy.
4. Select the discovered target and a compatible firmware package, then start the update and monitor its progress.

## About this module

GDFU Application is the web and mobile client for the ecosystem. It connects to a GDFU proxy over BLE, discovers target bootloaders, validates firmware packages, and manages updates over the proxy's GFSK radio link.

The UI uses Next.js 14 with a static web export and Capacitor 8 wrappers for Android and iOS. The DFU logic uses a shared transport interface for browser and native BLE access.

### Key features

- Proxy connection, firmware version and capabilities, storage information, and RSSI monitoring.
- Radio-profile and TX-power configuration with re-read verification.
- Target discovery with stale entries filtered out.
- Firmware-package validation, including device compatibility, Nordic CRC-16, and non-empty payload checks.
- Transfer progress, cancellation, recovery handling, and persistent error messages.
- Local package storage and proxy file management.

### Supported platforms

| Platform | BLE access | Requirements |
| --- | --- | --- |
| Web | Web Bluetooth | A compatible browser, such as Chrome/Edge on desktop or Android; HTTPS or localhost |
| Android | Native Capacitor BLE plugin | Android device with BLE; Android SDK/JDK for native builds |
| iOS | Native Capacitor BLE plugin | iOS device with BLE; macOS and Xcode for native builds |

Browser BLE availability depends on the browser and operating system. Use the native app where Web Bluetooth is unavailable. Compatible proxy and target boards are listed in the [proxy](https://github.com/jbrazio/gdfu-proxy#supported-hardware) and [bootloader](https://github.com/jbrazio/gdfu-bootloader#supported-hardware) READMEs.

#### Radio profiles

The application sets the proxy's radio profile. The proxy handles the GFSK radio link.

| Profile ID | Frequency | Default |
| --- | --- | --- |
| `1` | 433.175 MHz | Yes |
| `2` | 864.1 MHz | No |

Both profiles use GFSK at 80 kbps, 28 kHz deviation, 187.2 kHz RX bandwidth, and a 32-bit preamble. The proxy profile must match the target bootloader's build-time profile and the radio hardware's frequency band.

### Documentation

- [BLE protocol](https://github.com/jbrazio/gdfu-proxy/blob/dev/docs/PROTOCOL_BLE.md).
- [GDFU RF protocol](https://github.com/jbrazio/gdfu-bootloader/blob/dev/docs/PROTOCOL_DFU_GFSK.md).

- [BLE transports, characteristic UUIDs, and payload parsers](lib/bluetooth.ts).
- [DFU session and transfer logic](lib/dfu.ts).
- [Firmware-package loading and validation](lib/firmware.ts) and [compatibility tests](lib/compatibility.test.ts).
- [Radio frame codec tests](lib/codec.test.ts) and [proxy file management](lib/proxyFiles.ts).
- [Proxy BLE interface](https://github.com/jbrazio/gdfu-proxy#ble-interface) and [bootloader protocol implementation](https://github.com/jbrazio/gdfu-bootloader/tree/dev/src/radio).

Use a compatible Nordic DFU ZIP package containing `manifest.json` and its referenced `.dat` and `.bin` payloads. The package must match the selected target; validation rules are implemented in the files linked above.

### Build and run

Requires Node.js 22 or later and npm. Native builds also require the relevant Android or iOS toolchain.

```bash
npm ci                  # install locked dependencies and enable the version hook
npm run dev             # development server at http://localhost:3000
npm run build           # static web export in out/
```

Serve the web export over HTTPS for Web Bluetooth outside localhost.

For Android:

```bash
npm run android         # build web assets and sync the Android project; does not compile an APK
npx cap open android    # build/install using Android Studio
npm run run:android     # alternatively, build web assets and run on a connected device
```

For iOS, on macOS with Xcode:

```bash
npm run ios             # build web assets, sync, and compile with xcodebuild
npm run run:ios         # build web assets, sync, and run on a selected device
```

Installing on an iOS device requires signing; select your team under **Signing & Capabilities** in Xcode and do not commit that change. For firmware flashing instructions, see the proxy and bootloader READMEs.

### Testing

```bash
npm test                # protocol, DFU, package, UI helper, and asset checks
npm run typecheck       # TypeScript validation
npm run lint            # Next.js lint checks
```

To test the complete update path, run the application on a BLE-capable device, connect to a proxy, select a discovered target and compatible package, and complete an update. Unit tests do not validate native permissions, BLE connectivity, or the physical radio link.

## Versioning and releases

Versions use CalVer `YYYY.M.N`. `N` is the build number (Android `versionCode`, iOS `CFBundleVersion`), assigned by CI on each merge and always increasing. The repository holds no version. Local builds take it from the nearest build tag, e.g. `2026.11.38-2-g1a2b3c4` two commits after build 38.

User-facing changes go in the `[Unreleased]` section of [CHANGELOG.md](CHANGELOG.md). Each merge to `master` is built once and sent to internal and closed testers. Production is a manual promotion of an existing build.

## Licensing

MIT. See [LICENSE](LICENSE). Dependencies, including Next.js, React, Capacitor, and the BLE plugin, keep their own licenses.
