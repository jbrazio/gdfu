"use client";

/**
 * GFSK DFU — single-workflow screen:
 *   1. Connect to the ESP32 BLE proxy (Web Bluetooth).
 *   2. Discover nearby nRF52 bootloader targets over GFSK.
 *   3. Pick a firmware image (GitHub release, offline library, local file).
 *   4. Run the DFU with live BLE/RF progress.
 */

import { App } from "@capacitor/app";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ThemeProvider } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProxySection } from "@/components/ProxySection";
import { TargetSection } from "@/components/TargetSection";
import { FirmwareSection } from "@/components/FirmwareSection";
import { DfuSection } from "@/components/DfuSection";
import { StorageManager } from "@/components/StorageManager";
import { Tutorial } from "@/components/Tutorial";
import { useSetProxyStatus } from "@/components/ProxyStatus";
import {
  ConnectionState,
  GdfuBle,
  DISCOVERY_DURATION_MS,
  GDFU_CHAR_UUIDS,
  fixNativeBleReadiness,
  getNativeBleReadiness,
  isNativeBleRuntime,
  isTargetProfileCompatible,
  parseDiscovery,
  type DiscoveredProxy,
  type DiscoveredTarget,
  type NativeBleReadiness,
  type RadioConfig,
} from "@/lib/bluetooth";
import { DfuSession, type DfuProgress } from "@/lib/dfu";
import type { FirmwareImage } from "@/lib/firmware";
import type { ProxyStorage } from "@/lib/proxyFiles";
import { AppError, useT } from "@/lib/i18n";
import { theme } from "@/theme";

export default function Home() {
  const t = useT();
  const nativeRuntime = isNativeBleRuntime();
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [targets, setTargets] = useState<DiscoveredTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<DiscoveredTarget | null>(null);
  const [ackRssi, setAckRssi] = useState<number | null>(null);
  const [image, setImage] = useState<FirmwareImage | null>(null);
  const [progress, setProgress] = useState<DfuProgress | null>(null);
  const [sessionError, setSessionError] = useState<unknown>(null);
  const [radioConfig, setRadioConfig] = useState<RadioConfig | null>(null);
  const [nativeBleStatus, setNativeBleStatus] = useState<NativeBleReadiness | null>(null);
  const [proxies, setProxies] = useState<DiscoveredProxy[]>([]);
  const [scanningProxies, setScanningProxies] = useState(false);
  const [proxyError, setProxyError] = useState<unknown>(null);
  const [resetKey, setResetKey] = useState(0);
  const [view, setView] = useState<"main" | "storage">("main");
  const [proxyStorage, setProxyStorage] = useState<ProxyStorage | null>(null);

  const bleRef = useRef<GdfuBle | null>(null);
  const sessionRef = useRef<DfuSession | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const discoverTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const discoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proxyScanTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connected = connection === "connected";

  const stopDiscovery = useCallback((): void => {
    setDiscovering(false);
    if (discoverTimer.current) {
      clearInterval(discoverTimer.current);
      discoverTimer.current = null;
    }
    if (discoverTimeout.current) {
      clearTimeout(discoverTimeout.current);
      discoverTimeout.current = null;
    }
  }, []);

  const refreshNativeBleStatus = useCallback(async (): Promise<void> => {
    if (nativeRuntime) {
      setNativeBleStatus(await getNativeBleReadiness());
    }
  }, [nativeRuntime]);

  useEffect(() => {
    void refreshNativeBleStatus();
    if (!nativeRuntime) {
      return;
    }
    let listener: Awaited<ReturnType<typeof App.addListener>> | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void refreshNativeBleStatus();
      }
    }).then((value) => {
      listener = value;
    });
    // Android back: close an open MUI menu/dialog (Escape) before leaving the app.
    let backListener: Awaited<ReturnType<typeof App.addListener>> | undefined;
    void App.addListener("backButton", ({ canGoBack }) => {
      const focused = document.activeElement;
      if (focused?.closest(".MuiModal-root")) {
        focused.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    }).then((value) => {
      backListener = value;
    });
    return () => {
      void listener?.remove();
      void backListener?.remove();
    };
  }, [nativeRuntime, refreshNativeBleStatus]);

  const handleFixNativeBle = useCallback(async (): Promise<void> => {
    if (nativeBleStatus === "permissions") {
      await fixNativeBleReadiness();
    }
  }, [nativeBleStatus]);

  const createBle = useCallback((): GdfuBle => {
    const ble = new GdfuBle({
      onConnectionChanged: setConnection,
      onStatus: (frame) => frame.ackRssi !== null && setAckRssi(frame.ackRssi),
      onUnexpectedDisconnect: () => {
        stopDiscovery();
        sessionRef.current?.cancel();
        sessionRef.current = null;
        setTargets([]);
        setSelectedTarget(null);
        setProxies([]);
        setScanningProxies(false);
        setProxyError(new AppError("proxyDisconnected"));
        setProxyStorage(null);
        setRadioConfig(null);
        setProgress(null);
        setSessionError(null);
        setView("main");
      },
    });
    bleRef.current = ble;
    return ble;
  }, [stopDiscovery]);

  const stopProxyScan = useCallback(async (): Promise<void> => {
    if (proxyScanTimeout.current) {
      clearTimeout(proxyScanTimeout.current);
      proxyScanTimeout.current = null;
    }
    setScanningProxies(false);
    await bleRef.current?.stopProxyScan();
  }, []);

  // Fresh start for everything below the proxy card (scan/connect clicks).
  const resetSession = useCallback((): void => {
    stopDiscovery();
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setTargets([]);
    setSelectedTarget(null);
    setImage(null);
    setProgress(null);
    setSessionError(null);
    setRadioConfig(null);
    setProxyStorage(null);
    setProxyError(null);
    setView("main");
    setResetKey((key) => key + 1); // remounts firmware/DFU cards, dropping their local state
  }, [stopDiscovery]);

  const handleConnect = useCallback(async () => {
    resetSession();
    const ble = createBle();
    await ble.requestAndConnect();
  }, [createBle, resetSession]);

  const handleScanProxies = useCallback(async (): Promise<void> => {
    const ble = bleRef.current ?? createBle();
    resetSession();
    setProxies([]);
    setScanningProxies(true);
    try {
      await ble.scanProxies(setProxies);
      proxyScanTimeout.current = setTimeout(() => void stopProxyScan(), DISCOVERY_DURATION_MS);
    } catch (error) {
      setScanningProxies(false);
      setProxyError(error);
    }
  }, [createBle, resetSession, stopProxyScan]);

  const handleSelectProxy = useCallback(async (deviceId: string): Promise<void> => {
    const ble = bleRef.current;
    if (!ble) {
      return;
    }
    setProxyError(null);
    try {
      await stopProxyScan();
      await ble.connectProxy(deviceId);
    } catch (error) {
      setProxyError(error);
    }
  }, [stopProxyScan]);

  useEffect(() => () => void stopProxyScan(), [stopProxyScan]);

  const handleDisconnect = useCallback(async () => {
    setView("main");
    setProxyStorage(null);
    stopDiscovery();
    await stopProxyScan();
    sessionRef.current?.cancel();
    setTargets([]);
    setSelectedTarget(null);
    await bleRef.current?.disconnect();
  }, [stopDiscovery, stopProxyScan]);

  const startDiscovery = useCallback((): void => {
    const ble = bleRef.current;
    if (!ble || discovering) {
      return;
    }
    setDiscovering(true);
    const poll = async (): Promise<void> => {
      try {
        const raw = await ble.readCharacteristic(GDFU_CHAR_UUIDS.discovery);
        setTargets(parseDiscovery(raw));
      } catch {
        // Transient GATT errors during connection churn; next tick retries.
      }
    };
    void poll();
    discoverTimer.current = setInterval(poll, 1000);
    discoverTimeout.current = setTimeout(stopDiscovery, DISCOVERY_DURATION_MS);
  }, [discovering, stopDiscovery]);

  const handleStartDfu = useCallback(async () => {
    const ble = bleRef.current;
    if (!ble || !selectedTarget || !image) {
      return;
    }
    stopDiscovery();
    setSessionError(null);
    const session = new DfuSession(ble, {
      target: selectedTarget,
      initData: image.initData,
      appData: image.appData,
      onProgress: (value) => {
        if (sessionRef.current !== session) {
          return;
        }
        setProgress(value);
        if (value.phase === "success" || value.phase === "failed" || value.phase === "cancelled") {
          sessionRef.current = null;
        }
      },
    });
    sessionRef.current = session;
    try {
      await session.run();
    } catch (error) {
      if (sessionRef.current === session) {
        setSessionError(error);
      }
    }
  }, [selectedTarget, image, stopDiscovery]);

  const handleCancelDfu = useCallback(() => {
    sessionRef.current?.cancel();
  }, []);

  // Header FSK bar: newest reading wins. Discovery refreshes clear the ACK
  // value; during DFU discovery is stopped and ACK RSSI from the proxy takes over.
  const setProxyStatus = useSetProxyStatus();
  useEffect(() => setAckRssi(null), [targets, selectedTarget]);
  const fskRssi = selectedTarget
    ? (ackRssi ?? (targets.find((x) => x.targetId === selectedTarget.targetId) ?? selectedTarget).rssi)
    : null;
  useEffect(() => setProxyStatus({ fskRssi }), [fskRssi, setProxyStatus]);

  // DFU is blocked when the selected target went stale (TTL expired) or the
  // selected target band differs from the proxy's active profile. The proxy
  // enforces both again over RF.
  const incompatibility = useMemo(() => {
    if (!selectedTarget) {
      return null;
    }
    if (selectedTarget.ttlSeconds <= 0) {
      return t("targetExpired");
    }
    if (radioConfig && !isTargetProfileCompatible(selectedTarget, radioConfig)) {
      return t("profileMismatch", { target: selectedTarget.profile, proxy: radioConfig.profile });
    }
    return null;
  }, [radioConfig, selectedTarget, t]);

  // Warn before closing/reloading during an active update (web); the
  // Capacitor Android app keeps running in the background.
  const dfuActive = useMemo(
    () => progress !== null && !["success", "failed", "cancelled"].includes(progress.phase),
    [progress],
  );

  useEffect(() => stopDiscovery, [stopDiscovery]);

  useEffect(() => {
    if (!dfuActive) {
      return;
    }
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dfuActive]);

  const canStart = useMemo(
    () =>
      connected &&
      selectedTarget !== null &&
      image !== null &&
      (progress === null || ["success", "failed", "cancelled"].includes(progress.phase)) &&
      incompatibility === null,
    [connected, selectedTarget, image, progress, incompatibility],
  );

  if (nativeRuntime && nativeBleStatus === "permissions") {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Stack sx={{ minHeight: "100dvh", p: 2, justifyContent: "center" }}>
          <Paper sx={{ maxWidth: 520, mx: "auto", p: 3 }} variant="outlined">
            <Stack spacing={2}>
              <Typography variant="h5">{t("bleSetupTitle")}</Typography>
              <Typography>{t("bleSetupBody")}</Typography>
              <Button variant="contained" onClick={() => void handleFixNativeBle()}>
                {t("openSettings")}
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </ThemeProvider>
    );
  }

  if (view === "storage" && connected) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <StorageManager ble={bleRef} onClose={() => setView("main")} onStorage={setProxyStorage} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Tutorial />
      <Stack spacing={2} sx={{ maxWidth: 720, mx: "auto", p: 2, pb: 6 }}>
        <ProxySection
          connection={connection}
          ble={bleRef}
          nativeRuntime={nativeRuntime}
          proxies={proxies}
          scanningProxies={scanningProxies}
          proxyError={proxyError}
          nativeBleUnavailable={nativeBleStatus === "unavailable"}
          onConnect={handleConnect}
          onScanProxies={handleScanProxies}
          onSelectProxy={handleSelectProxy}
          onDisconnect={handleDisconnect}
          onManageStorage={() => setView("storage")}
          storage={proxyStorage}
          onStorage={setProxyStorage}
          onRadioConfig={setRadioConfig}
          dfuActive={dfuActive}
        />
        <TargetSection
          connected={connected}
          targets={targets}
          selectedTarget={selectedTarget}
          discovering={discovering}
          dfuActive={dfuActive}
          onSelect={setSelectedTarget}
          onStartDiscovery={startDiscovery}
        />
        <FirmwareSection key={`fw-${resetKey}`} image={image} onImage={setImage} disabled={dfuActive} />
        <DfuSection
          key={`dfu-${resetKey}`}
          canStart={canStart}
          active={dfuActive}
          progress={progress}
          sessionError={sessionError}
          image={image}
          target={selectedTarget}
          connected={connected}
          incompatibility={incompatibility}
          onStart={handleStartDfu}
          onCancel={handleCancelDfu}
        />
        <Typography component="footer" variant="caption" color="text.secondary" align="center">
          {t("version", { version: process.env.NEXT_PUBLIC_RELEASE_VERSION ?? "unknown" })}
        </Typography>
      </Stack>
    </ThemeProvider>
  );
}
