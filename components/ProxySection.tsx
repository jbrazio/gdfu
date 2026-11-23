"use client";

/** Proxy connection card: connect/disconnect, capabilities, radio config. */

import BluetoothIcon from "@mui/icons-material/Bluetooth";
import BluetoothDisabledIcon from "@mui/icons-material/BluetoothDisabled";
import BluetoothSearchingIcon from "@mui/icons-material/BluetoothSearching";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import RouterIcon from "@mui/icons-material/Router";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import { CardTitle } from "@/components/CardTitle";
import { useSetProxyStatus } from "@/components/ProxyStatus";
import { SignalStrength } from "@/components/SignalStrength";
import { formatSize } from "@/components/StorageManager";
import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import {
  GDFU_CHAR_UUIDS,
  isNativeBleRuntime,
  parseRadioConfig,
  parseVersionCaps,
  encodeRadioConfig,
  type ConnectionState,
  type DiscoveredProxy,
  type ProxyVersionCaps,
  type RadioConfig,
} from "@/lib/bluetooth";
import type { GdfuBle } from "@/lib/bluetooth";
import { getProxyStorageIfSupported, type ProxyStorage } from "@/lib/proxyFiles";
import { useErrorText, useT } from "@/lib/i18n";

const PROFILE_LABEL: Record<number, string> = {
  1: "433 MHz",
  2: "868 MHz",
};

const TX_POWER_MIN = 10;
const TX_POWER_MAX = 22;

export function ProxySection({
  connection,
  ble,
  nativeRuntime,
  proxies,
  scanningProxies,
  proxyError,
  nativeBleUnavailable,
  onConnect,
  onScanProxies,
  onSelectProxy,
  onDisconnect,
  onManageStorage,
  storage,
  onStorage,
  onRadioConfig,
  dfuActive,
}: {
  connection: ConnectionState;
  dfuActive: boolean;
  ble: RefObject<GdfuBle | null>;
  nativeRuntime: boolean;
  proxies: DiscoveredProxy[];
  scanningProxies: boolean;
  proxyError: unknown;
  nativeBleUnavailable: boolean;
  onConnect: () => Promise<void>;
  onScanProxies: () => Promise<void>;
  onSelectProxy: (deviceId: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onManageStorage: () => void;
  storage: ProxyStorage | null;
  onStorage: (storage: ProxyStorage | null) => void;
  onRadioConfig: (config: RadioConfig | null) => void;
}): React.ReactElement {
  const t = useT();
  const errorText = useErrorText();
  const [caps, setCaps] = useState<ProxyVersionCaps | null>(null);
  const [release, setRelease] = useState<string | null>(null);
  const [config, setConfig] = useState<RadioConfig | null>(null);
  const [configError, setConfigError] = useState<unknown>(null);
  const [bleUnsupported, setBleUnsupported] = useState(false);
  const [rssi, setRssi] = useState<number | null>(null);

  useEffect(() => {
    if (!isNativeBleRuntime() && typeof navigator !== "undefined" && !("bluetooth" in navigator)) {
      setBleUnsupported(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    const client = ble.current;
    if (!client?.isConnected) {
      return;
    }
    const [capsRaw, releaseRaw, configRaw, supportedStorage] = await Promise.all([
      client.readCharacteristic(GDFU_CHAR_UUIDS.versionCaps),
      client.readCharacteristic(GDFU_CHAR_UUIDS.release).catch(() => null),
      client.readCharacteristic(GDFU_CHAR_UUIDS.radioConfig),
      getProxyStorageIfSupported(client),
    ]);
    onStorage(supportedStorage);
    const parsedCaps = parseVersionCaps(capsRaw);
    const parsedConfig = parseRadioConfig(configRaw);
    setCaps(parsedCaps);
    setRelease(releaseRaw ? new TextDecoder().decode(releaseRaw) : null);
    setConfig(parsedConfig);
    onRadioConfig(parsedConfig);
  }, [ble, onRadioConfig, onStorage]);

  useEffect(() => {
    if (connection === "connected") {
      void refresh();
    } else {
      setCaps(null);
      setRelease(null);
      setConfig(null);
      setRssi(null);
      onStorage(null);
      onRadioConfig(null);
    }
  }, [connection, onRadioConfig, onStorage, refresh]);

  const setProxyStatus = useSetProxyStatus();
  useEffect(() => {
    setProxyStatus({ connection, rssi: connection === "connected" ? rssi : null });
  }, [connection, rssi, setProxyStatus]);

  useEffect(() => {
    if (connection !== "connected") {
      return;
    }
    let cancelled = false;
    const pollRssi = async (): Promise<void> => {
      try {
        const value = await ble.current?.readRssi();
        if (!cancelled && value !== null && value !== undefined) {
          setRssi(value);
        }
      } catch {
        // Keep the most recent valid signal indicator.
      }
    };
    if (!dfuActive) void pollRssi();
    const timer = setInterval(() => void pollRssi(), dfuActive ? 10000 : 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ble, connection, dfuActive]);

  const applyTxPower = useCallback(
    async (power: number) => {
      setConfigError(null);
      const client = ble.current;
      if (!client?.isConnected) {
        return;
      }
      try {
        await client.writeCharacteristic(GDFU_CHAR_UUIDS.txPower, new Uint8Array([power]).buffer);
        const updated = parseRadioConfig(await client.readCharacteristic(GDFU_CHAR_UUIDS.radioConfig));
        setConfig(updated);
        onRadioConfig(updated);
      } catch (error) {
        setConfigError(error);
      }
    },
    [ble, onRadioConfig],
  );

  const profiles = [1, 2].filter((profile) => !caps || (caps.profilesMask & (1 << (profile - 1))) !== 0);

  const applyProfile = useCallback(
    async (profile: number) => {
      setConfigError(null);
      const client = ble.current;
      const current = config;
      if (!client?.isConnected || !current) {
        return;
      }
      try {
        await client.writeCharacteristic(
          GDFU_CHAR_UUIDS.radioConfig,
          encodeRadioConfig({ ...current, profile }),
        );
        const raw = await client.readCharacteristic(GDFU_CHAR_UUIDS.radioConfig);
        const updated = parseRadioConfig(raw);
        setConfig(updated);
        onRadioConfig(updated);
      } catch (error) {
        setConfigError(error);
      }
    },
    [ble, config, onRadioConfig],
  );

  const connected = connection === "connected";
  const locked = !connected || dfuActive;
  // ponytail: proxy firmware accepts 10–22 dBm; keep an out-of-range current value selectable.
  const powers = [...new Set([...Array.from({ length: TX_POWER_MAX - TX_POWER_MIN + 1 }, (_, i) => TX_POWER_MIN + i), ...(config ? [config.txPowerDbm] : [])])].sort((a, b) => a - b);
  const firmware = release ?? (caps ? `v${caps.firmwareVersion}` : null);

  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Stack spacing={2}>
        <CardTitle
          step={1}
          icon={<RouterIcon color="primary" />}
          title={t("proxyTitle")}
          help={connected && firmware ? t("proxyFirmware", { version: firmware }) : t("proxyHelp")}
          trailing={
            connected ? (
              <Button size="small" color="inherit" startIcon={<BluetoothDisabledIcon />} onClick={() => void onDisconnect()}>
                {t("disconnect")}
              </Button>
            ) : undefined
          }
        />
        {bleUnsupported && <Alert severity="warning">{t("webBleUnavailable")}</Alert>}
        {nativeBleUnavailable && <Alert severity="error">{t("bleUnavailable")}</Alert>}
        {proxyError != null && <Alert severity="error">{errorText(proxyError)}</Alert>}
        {!connected &&
          (nativeRuntime ? (
            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={<BluetoothSearchingIcon />}
              onClick={() => void onScanProxies()}
              disabled={connection !== "disconnected" || scanningProxies || nativeBleUnavailable}
            >
              {scanningProxies ? t("scanning") : connection === "connecting" ? t("connecting") : t("scanProxies")}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="large"
              fullWidth
              startIcon={<BluetoothIcon />}
              onClick={() => void onConnect()}
              disabled={connection !== "disconnected" || bleUnsupported}
            >
              {connection === "connecting" ? t("connecting") : t("connectProxy")}
            </Button>
          ))}
        {nativeRuntime && proxies.length > 0 && connection === "disconnected" && (
          <List dense disablePadding>
            {proxies.map((proxy) => (
              <ListItem key={proxy.deviceId} disablePadding>
                <ListItemButton onClick={() => void onSelectProxy(proxy.deviceId)}>
                  <ListItemText primary={proxy.name} secondary={proxy.deviceId} />
                  {proxy.rssi !== null && <SignalStrength rssi={proxy.rssi} />}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}

        {config && (
          <Stack spacing={2}>
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={1} useFlexGap>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel id="profile-label">{t("profile")}</InputLabel>
                  <Select
                    labelId="profile-label"
                    label={t("profile")}
                    value={String(config.profile)}
                    onChange={(event) => void applyProfile(Number(event.target.value))}
                    disabled={locked}
                  >
                    {profiles.map((profile) => (
                      <MenuItem key={profile} value={String(profile)}>
                        {PROFILE_LABEL[profile] ?? t("profileN", { n: profile })}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel id="tx-power-label">{t("txPower")}</InputLabel>
                  <Select
                    labelId="tx-power-label"
                    label={t("txPower")}
                    value={String(config.txPowerDbm)}
                    onChange={(event) => void applyTxPower(Number(event.target.value))}
                    disabled={locked}
                  >
                    {powers.map((power) => (
                      <MenuItem key={power} value={String(power)}>
                        {power} dBm
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t("radioInfo", { freq: (config.freqHz / 1_000_000).toFixed(3), bw: (config.rxBwHz / 1_000).toFixed(1) })}
              </Typography>
            </Stack>
            {storage && (
              <Stack spacing={0.75}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Stack>
                    <Typography variant="subtitle2">{t("proxyStorage")}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t("storageBytes", { used: formatSize(storage.usedBytes), total: formatSize(storage.totalBytes) })}
                    </Typography>
                  </Stack>
                  <Button size="small" endIcon={<ChevronRightIcon />} onClick={onManageStorage} disabled={locked}>
                    {t("manageStorage")}
                  </Button>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={storage.totalBytes > 0 ? (storage.usedBytes / storage.totalBytes) * 100 : 0}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Stack>
            )}
            {configError != null && <Alert severity="error">{errorText(configError)}</Alert>}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
