/**
 * UI strings: en-GB (default) here, other locales in ./locales. Locale comes from the browser /
 * WebView languages; the static export renders en-GB, then switches after
 * hydration (useSyncExternalStore server snapshot) to avoid mismatches.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { de } from "./locales/de";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { ko } from "./locales/ko";
import { ptBR } from "./locales/pt-BR";
import { ptPT } from "./locales/pt-PT";
import { zhHans } from "./locales/zh-Hans";

const enGB = {
  // page
  proxyDisconnected: "Proxy disconnected. Scan and reconnect to try again.",
  targetExpired: "Selected target expired; rediscover and select it again.",
  profileMismatch: "Target uses profile {target}; proxy is set to profile {proxy}.",
  bleSetupTitle: "Bluetooth setup required",
  bleSetupBody: "Allow Nearby devices permission to scan for and connect to the GFSK DFU proxy.",
  openSettings: "Open app settings",
  version: "Version {version}",
  about: "About",
  close: "Close",
  showTutorial: "Show tutorial",
  aboutBody: "Long-range firmware updates for nRF52840 devices over GFSK.",
  creditAuthor: "Author",
  specialThanks: "Special thanks to",
  appLicence: "Released under the MIT Licence.",
  openSourceLicences: "Open-source licences",
  // shared
  cancel: "Cancel",
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
  signalWeak: "Weak signal",
  signalMedium: "Medium signal",
  signalStrong: "Strong signal",
  selectedItem: "Selected item",
  // DFU
  phaseIdle: "Idle",
  phaseSelecting: "Selecting target",
  phaseStarting: "Negotiating (flash erase)",
  phaseInit: "Sending init packet",
  phaseStreaming: "Transferring firmware",
  phaseFinishing: "Validating image",
  phaseSuccess: "Update complete",
  phaseFailed: "Failed",
  phaseCancelled: "Cancelled",
  updateTitle: "Update",
  updateHelp: "Send the firmware to the device over the air.",
  startUpdate: "Start update",
  retryUpdate: "Try again",
  cancelUpdate: "Cancel update",
  targetLabel: "Target",
  dfuBytes: "{confirmed} of {total} sent",
  remaining: "{time} left",
  tookTime: "Took {time}.",
  keepNear: "Keep the phone near the proxy until the update finishes.",
  dfuValidating: "All firmware sent. Waiting for the device to validate the image and restart; this can take up to 40 seconds.",
  dfuCancelled: "Update cancelled. The device keeps its current firmware.",
  dfuSuccess: "Firmware flashed and verified. The target has rebooted into the new application.",
  // firmware
  firmwareTitle: "Firmware",
  firmwareHelp: "Download or import a firmware ZIP.",
  firmwareSelected: "Selected {name}",
  notSaved: "not saved",
  originImport: "Imported file",
  originProxy: "Copied from proxy",
  downloadFirmware: "Download",
  refresh: "Refresh",
  stableRelease: "{tag} (stable)",
  source: "Source",
  sourceLusofw: "LusoFW (meshcore.pt)",
  sourceCommunity: "Community (meshcore.io)",
  listReleases: "List releases",
  importFile: "Import ZIP",
  release: "Release",
  asset: "Board",
  download: "Download",
  downloadingFirmware: "Downloading firmware",
  fetchingReleases: "Fetching releases…",
  validating: "Validating {name}…",
  saveOffline: "Save on this device",
  offlineLibrary: "Saved on this device",
  deleteItem: "Delete {name}",
  // proxy
  proxyTitle: "Proxy",
  proxyHelp: "Connect to proxy and choose radio profile.",
  proxyFirmware: "Firmware {version}",
  webBleUnavailable: "Web Bluetooth is unavailable in this browser.",
  bleUnavailable: "Bluetooth Low Energy is unavailable on this device.",
  scanning: "Scanning…",
  scanProxies: "Scan proxies",
  connectProxy: "Connect proxy",
  disconnect: "Disconnect",
  radioInfo: "Frequency {freq} MHz · BW {bw} kHz",
  profile: "Profile",
  profileN: "Profile {n}",
  txPower: "TX power",
  proxyStorage: "Proxy storage",
  storageBytes: "{used} of {total} used",
  manageStorage: "Manage storage",
  // targets
  targetsTitle: "Targets",
  targetsHelp: "Pick the device to update.",
  discoverTargets: "Discover targets",
  listening: "Listening for bootloader beacons…",
  targetSelected: "Selected {id}",
  scanAgain: "Scan again",
  connectProxyFirst: "Connect the proxy first to find targets.",
  noTargets: "No targets found. Check the device is in bootloader mode on the same profile as the proxy, then scan again.",
  // storage manager
  proxyNotConnected: "Proxy not connected",
  readingStorage: "Reading storage",
  uploading: "Uploading {name}",
  conflictError: "{offlineName} shares the proxy name {name} with another phone file; rename or delete one first",
  downloadFirst: "Download this file to phone storage before uploading it to the proxy",
  phoneCopyGone: "This phone copy is no longer available",
  cannotUpload: "Cannot upload {name}: {reason}",
  uploaded: "Uploaded {name}",
  downloading: "Downloading {name}",
  savedToPhone: "Saved {name} to phone storage",
  confirmRemove: "Remove {name} from proxy storage?",
  removing: "Removing {name}",
  back: "Back",
  proxySpace: "Proxy space",
  proxySpaceHelp: "Review available proxy storage before transfer.",
  storageSummary: "{used} used of {total} · {free} free · {files}",
  filesOne: "{count} file",
  filesOther: "{count} files",
  firmwareFiles: "Firmware files",
  firmwareFilesHelp: "Transfer validated firmware between phone and proxy.",
  noFiles: "No firmware files. Save one offline on the main page, or download one from the proxy.",
  removeFromProxy: "Remove {name} from proxy",
  uploadConflict: "{name} cannot be uploaded: its proxy name conflicts with another phone file",
  uploadToProxy: "Upload {name} to proxy",
  downloadToPhone: "Download {name} to phone storage",
  conflictSecondary: "{size} · same proxy name as another phone file ({name}); rename or delete one to upload",
  onPhoneTag: "Phone",
  onProxyTag: "Proxy",
  // tutorial
  tutorialSkip: "Skip",
  tutorialNext: "Next",
  tutorialDone: "Get started",
  tutorialOverviewTitle: "How it works",
  tutorialOverviewBody:
    "This app talks to an ESP32 proxy (such as a Heltec V3) over Bluetooth. The proxy relays the firmware over a long-range GFSK radio link to an nRF52 repeater (such as a SenseCAP Solar P1) running the GDFU bootloader. Set up both once, as shown next.",
  tutorialFlashProxyTitle: "Flash the proxy",
  tutorialFlashProxyBody:
    "1. Download the proxy firmware for your board (the …-merged.bin file).\n2. On a computer, open the meshcore.pt web flasher in Chrome or Edge.\n3. Pick Custom firmware, choose ESP32 (.bin) and select the file.\n4. Connect the board by USB, then Continue to install and pick its serial port.",
  tutorialFlashBootloaderTitle: "Install the repeater bootloader",
  tutorialFlashBootloaderBody:
    "1. Download the bootloader update for your board (the update-…_nosd.uf2 file).\n2. Connect the repeater to a computer by USB.\n3. Double-press the reset button: a USB drive appears.\n4. Copy the .uf2 file onto the drive; the board reboots on its own.\nAlternatively, use the meshcore.pt bootloader flasher.",
  tutorialDownloadProxy: "Proxy firmware",
  tutorialDownloadBootloader: "Bootloader",
  tutorialWebFlasher: "Web flasher",
  tutorialBootloaderFlasher: "Bootloader flasher",
  tutorialProxyTitle: "Connect to the BLE proxy",
  tutorialProxyBody:
    "Power on the ESP32 proxy and tap Scan proxies. Pick your proxy from the list, then choose the radio profile and TX power; changes apply straight away.",
  tutorialTargetTitle: "Select a target",
  tutorialTargetBody:
    "Put the nRF52 device in bootloader mode and tap Discover targets. Pick your target from the list; the signal bars show link quality. The target must use the same profile as the proxy.",
  tutorialFirmwareTitle: "Download the firmware",
  tutorialFirmwareBody:
    "Choose a source and tap List releases, then pick a release and your board and tap Download; downloads are saved on this device for use without internet. You can also tap Import ZIP to use a file you already have.",
  tutorialUpdateTitle: "Start the update",
  tutorialUpdateBody:
    "Check that proxy, target and firmware are all ticked and tap Start update. Keep the phone near the proxy until it finishes; the target reboots into the new firmware on its own.",
  // errors raised in lib/ (AppError keys)
  errUnknown: "Unknown error {code}",
  errFileUnknown: "Proxy file error {code}",
  dfuErr0: "no error",
  dfuErr1: "unsupported protocol version",
  dfuErr2: "profile mismatch or invalid configuration",
  dfuErr3: "wrong or missing target",
  dfuErr4: "wrong or expired session",
  dfuErr5: "malformed frame or CRC mismatch",
  dfuErr6: "sequence or offset mismatch",
  dfuErr7: "retry budget exhausted or timeout",
  dfuErr8: "image metadata/board/range invalid",
  dfuErr9: "image hash/CRC invalid",
  dfuErr10: "image metadata or board mismatch",
  dfuErr11: "flash failure",
  dfuErr12: "cancelled",
  dfuErr13: "radio transport failure",
  dfuErr14: "target busy with previous session; retry in ~30 s",
  fileErr1: "invalid file command",
  fileErr2: "proxy busy (DFU or another transfer in progress)",
  fileErr3: "invalid file name",
  fileErr4: "not enough free space on the proxy",
  fileErr5: "a file with that name already exists",
  fileErr6: "file not found on the proxy",
  fileErr7: "proxy storage I/O error",
  fileErr8: "upload chunk out of order",
  fileErr9: "uploaded file failed its CRC check",
  fileErr10: "upload incomplete",
  fileErr11: "no upload in progress",
  fileErr12: "uploaded file is not a supported GFSK firmware package",
  errProxyNotIdle: "proxy did not return to IDLE after ABORT",
  errProxyUnreachable: "proxy unreachable during ABORT",
  errTargetGone: "target {id} is no longer beaconing; rediscover targets",
  errTargetNotSelectable: "target {id} not selectable",
  errStartFailed: "START failed: {reason}",
  errStartTimeout: "target did not enter STREAMING (flash erase timeout)",
  errInitRejected: "INIT rejected: {reason}",
  errInitNoAck: "INIT not acknowledged",
  errStalled: "RF transfer stalled at {sent}/{total} bytes",
  errTarget: "target error: {reason}",
  errPostvalidation: "postvalidation failed: {reason}",
  errFinishNoAck: "FINISH not acknowledged (postvalidation timeout)",
  errBootFallback: "target fell back into its bootloader: the new image did not start",
  errZipDuplicate: "duplicate zip entry {name}",
  errZipTruncated: "truncated zip entry",
  errZipDeflated: "zip entry {name} must be stored, not deflated",
  errZipMethod: "unsupported zip method {method} in {name}",
  errNotZip: "not a zip file",
  errPackageEntries: "package must contain exactly manifest.json and the .dat and .bin files it names",
  errManifestJson: "manifest.json is not valid JSON",
  errManifestInit: "manifest.json lacks application init packet data",
  errCrcMismatch: "image CRC16 mismatch: manifest {expected}, computed {actual}",
  errDeviceType: "unsupported device type {value} (supported: {supported})",
  errDeviceRevision: "unsupported device revision {value} (supported: {supported})",
  errFirmwareEmpty: "the firmware image (.bin) is empty",
  errRateLimit: "GitHub API rate limit reached; retry later",
  errReleasesHttp: "GitHub releases fetch failed: HTTP {status}",
  errDownloadBinary: "download failed: native response was not binary data",
  errDownloadHttp: "download failed: HTTP {status}",
  errDbOpen: "IndexedDB open failed",
  errDbWrite: "IndexedDB write failed",
  errDbRead: "IndexedDB read failed",
  errDbDelete: "IndexedDB delete failed",
  errBadFileName: "name must be 1-59 letters, digits, . _ - and end in .zip",
  errReplaceNoRoom: "not enough free space to replace it; delete the old copy first",
  errNeedsSpace: "needs {needed} B, {free} B free",
  errMalformedStatus: "proxy returned a malformed file status",
  errNoFileStorage: "this proxy firmware has no file storage; update the proxy",
  errMalformedStorage: "proxy returned malformed storage info",
  errUploadCancelled: "upload cancelled",
  errDownloadCancelled: "download cancelled",
  errShortBlock: "proxy returned a short file block",
  errNoCharacteristic: "characteristic {uuid} not available; connect first",
  errSelectProxyFirst: "select a discovered proxy before connecting",
  errNotConnected: "not connected",
  errNativeScan: "native proxy scanning is unavailable in this browser",
  errNativeSelect: "native proxy selection is unavailable in this browser",
};

export type MessageKey = keyof typeof enGB;

export const MESSAGES = {
  "en-GB": enGB,
  "pt-PT": ptPT,
  "pt-BR": ptBR,
  "zh-Hans": zhHans,
  fr,
  de,
  ko,
  es,
} satisfies Record<
  string,
  Record<MessageKey, string>
>;
export type Locale = keyof typeof MESSAGES;
export type Translate = (key: MessageKey, params?: Params) => string;

/** First supported language wins (pt-BR vs pt-PT by region, any zh as Simplified); else en-GB. */
export function pickLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const [base, region] = language.toLowerCase().split("-");
    if (base === "pt") return region === "br" ? "pt-BR" : "pt-PT";
    if (base === "en") return "en-GB";
    if (base === "zh") return "zh-Hans";
    if (base in MESSAGES) return base as Locale;
  }
  return "en-GB";
}

/** Param values may be nested messages (e.g. an error code's reason), translated recursively. */
export type Params = Record<string, string | number | Message>;
export type Message = { key: MessageKey; params?: Params };

export function translate(locale: Locale, key: MessageKey, params: Params = {}): string {
  return MESSAGES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === "object" ? translate(locale, value.key, value.params) : String(value);
  });
}

/** Error with a message key; .message stays en-GB for logs, UI translates via useErrorText. */
export class AppError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly params?: Params,
  ) {
    super(translate("en-GB", key, params));
  }
}

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
};
const browserLocale = (): Locale =>
  pickLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
const serverLocale = (): Locale => "en-GB";

export const useLocale = (): Locale => useSyncExternalStore(subscribe, browserLocale, serverLocale);

export function useT(): Translate {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);
}

/** Translated text for anything caught: AppError by key, other errors (platform/native) as-is. */
export function useErrorText(): (error: unknown) => string {
  const t = useT();
  return useCallback(
    (error: unknown) =>
      error instanceof AppError ? t(error.key, error.params) : error instanceof Error ? error.message : String(error),
    [t],
  );
}
