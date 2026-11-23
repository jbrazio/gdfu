"use client";

/**
 * Firmware library card: GitHub releases (Lusofw + MeshCore repeater),
 * offline saved images (IndexedDB), and local file import — all validated
 * through parseFirmwareZip before selection.
 */

import MemoryIcon from "@mui/icons-material/Memory";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Radio from "@mui/material/Radio";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CardTitle } from "@/components/CardTitle";
import { formatSize } from "@/components/StorageManager";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  FIRMWARE_SOURCES,
  deleteOfflineImage,
  downloadReleaseAsset,
  fetchReleases,
  getStableRelease,
  listOfflineImages,
  isFirmwareSourceCurrent,
  parseFirmwareZip,
  resetFirmwareSourceState,
  saveImageOffline,
  splitFirmwareName,
  type FirmwareImage,
  type RemoteRelease,
  type ImageOrigin,
  type StoredImage,
} from "@/lib/firmware";
import { useErrorText, useT, type MessageKey } from "@/lib/i18n";

const ORIGIN_LABEL: Record<ImageOrigin, MessageKey> = {
  lusofw: "sourceLusofw",
  meshcore: "sourceCommunity",
  import: "originImport",
  proxy: "originProxy",
};

const label = (name: string): string => {
  const { board, version } = splitFirmwareName(name);
  return version ? `${board} ${version}` : board;
};

export function FirmwareSection({
  image,
  onImage,
  disabled,
}: {
  image: FirmwareImage | null;
  onImage: (image: FirmwareImage | null) => void;
  disabled: boolean;
}): React.ReactElement {
  const t = useT();
  const errorText = useErrorText();
  const [sourceId, setSourceId] = useState<string>(FIRMWARE_SOURCES[0].id);
  const [releases, setReleases] = useState<RemoteRelease[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [offline, setOffline] = useState<StoredImage[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sourceIdRef = useRef(sourceId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const source = FIRMWARE_SOURCES.find((entry) => entry.id === sourceId) ?? FIRMWARE_SOURCES[0];

  const resetSource = useCallback((): void => {
    const state = resetFirmwareSourceState();
    setReleases(state.releases);
    setSelectedRelease(state.selectedRelease);
    setSelectedAsset(state.selectedAsset);
    setError(state.error);
    setBusy(state.busy);
    onImage(null);
  }, [onImage]);

  const refreshOffline = useCallback(async () => {
    try {
      setOffline(await listOfflineImages());
    } catch (cause) {
      setError(cause);
    }
  }, []);

  useEffect(() => {
    void refreshOffline();
  }, [refreshOffline]);

  const loadReleases = useCallback(async () => {
    const requestedSourceId = sourceId;
    setBusy(t("fetchingReleases"));
    setError(null);
    try {
      const result = await fetchReleases(source.repo, source.assetFilter);
      if (!isFirmwareSourceCurrent(requestedSourceId, sourceIdRef.current)) {
        return;
      }
      setReleases(result);
      setSelectedRelease((getStableRelease(result) ?? result[0])?.tagName ?? "");
      setSelectedAsset("");
    } catch (cause) {
      if (!isFirmwareSourceCurrent(requestedSourceId, sourceIdRef.current)) {
        return;
      }
      setError(cause);
      setReleases([]);
    } finally {
      if (isFirmwareSourceCurrent(requestedSourceId, sourceIdRef.current)) {
        setBusy(null);
      }
    }
  }, [source, sourceId, t]);

  const stableRelease = getStableRelease(releases);
  const release = releases.find((entry) => entry.tagName === selectedRelease) ?? null;
  const asset =
    release?.assets.find((entry) => entry.name === selectedAsset) ?? release?.assets[0] ?? null;

  const validateAndSelect = useCallback(
    async (name: string, buffer: ArrayBuffer): Promise<void> => {
      try {
        setBusy(t("validating", { name }));
        const parsed = await parseFirmwareZip(name, buffer);
        onImage(parsed);
        setError(null);
      } catch (cause) {
        onImage(null);
        setError(cause);
      } finally {
        setBusy(null);
      }
    },
    [onImage, t],
  );

  const handleDownload = useCallback(async () => {
    if (!asset) {
      return;
    }
    try {
      setDownloading(true);
      const buffer = await downloadReleaseAsset(asset.downloadUrl);
      setDownloading(false);
      await saveImageOffline(asset.name, buffer, source.id);
      await refreshOffline();
      await validateAndSelect(asset.name, buffer);
    } catch (cause) {
      setError(cause);
    } finally {
      setDownloading(false);
      setBusy(null);
    }
  }, [asset, refreshOffline, source.id, validateAndSelect]);

  const handleFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        await validateAndSelect(file.name, buffer);
      } catch (cause) {
        setError(cause);
      }
    },
    [validateAndSelect],
  );

  const handleSaveOffline = useCallback(async () => {
    if (!image?.raw) {
      return;
    }
    try {
      await saveImageOffline(image.name, await image.raw.arrayBuffer(), "import");
      await refreshOffline();
    } catch (cause) {
      setError(cause);
    }
  }, [image, refreshOffline]);

  const handleDeleteOffline = useCallback(
    async (name: string) => {
      try {
        await deleteOfflineImage(name);
        if (image?.name === name) {
          onImage(null);
        }
        await refreshOffline();
      } catch (cause) {
        setError(cause);
      }
    },
    [image, onImage, refreshOffline],
  );

  const saved = offline.some((entry) => entry.name === image?.name);
  // An imported file that isn't saved yet still shows as the selected row, with a save button.
  const rows: { name: string; size: number; savedAt: number | null; origin?: ImageOrigin }[] = [
    ...(image && !saved ? [{ name: image.name, size: image.raw?.size ?? image.sizeBytes, savedAt: null, origin: "import" as const }] : []),
    ...offline.map((entry) => ({ name: entry.name, size: entry.blob.size, savedAt: entry.savedAt, origin: entry.origin })),
  ];

  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Stack spacing={2}>
        <CardTitle
          step={3}
          icon={<MemoryIcon color="primary" />}
          title={t("firmwareTitle")}
          help={image ? t("firmwareSelected", { name: label(image.name) }) : t("firmwareHelp")}
          trailing={
            <Button
              size="small"
              color="inherit"
              startIcon={<UploadFileIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
            >
              {t("importFile")}
            </Button>
          }
        />
        <input ref={fileInputRef} type="file" accept=".zip" hidden onChange={(event) => void handleFile(event)} />

        {rows.length > 0 && (
          <Stack spacing={1}>
            <Typography variant="subtitle2">{t("offlineLibrary")}</Typography>
            <List disablePadding sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 1 }} role="radiogroup" aria-label={t("offlineLibrary")}>
              {rows.map((row) => {
                const selected = image?.name === row.name;
                const stored = offline.find((entry) => entry.name === row.name);
                const { board, version } = splitFirmwareName(row.name);
                return (
                  <ListItem
                    key={row.name}
                    disablePadding
                    secondaryAction={
                      stored ? (
                        <IconButton
                          edge="end"
                          aria-label={t("deleteItem", { name: row.name })}
                          disabled={disabled}
                          onClick={() => void handleDeleteOffline(row.name)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      ) : (
                        <IconButton edge="end" color="primary" aria-label={t("saveOffline")} disabled={disabled} onClick={() => void handleSaveOffline()}>
                          <SaveAltIcon fontSize="small" />
                        </IconButton>
                      )
                    }
                    sx={{ border: 1, borderColor: selected ? "primary.main" : "divider", borderRadius: 1 }}
                  >
                    <ListItemButton
                      selected={selected}
                      disabled={disabled}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        if (stored) {
                          void (async () => validateAndSelect(stored.name, await stored.blob.arrayBuffer()))();
                        }
                      }}
                      sx={{ gap: 1.5, py: 1, borderRadius: 1 }}
                    >
                      <Radio checked={selected} tabIndex={-1} size="small" sx={{ p: 0 }} slotProps={{ input: { "aria-hidden": true } }} />
                      <ListItemText
                        primary={board}
                        secondary={
                          <>
                            {row.origin && (
                              <Typography component="span" variant="caption" color="primary" sx={{ display: "block", fontWeight: 600 }}>
                                {t(ORIGIN_LABEL[row.origin])}
                              </Typography>
                            )}
                            {[version, formatSize(row.size), row.savedAt === null ? t("notSaved") : new Date(row.savedAt).toLocaleDateString()].filter(Boolean).join(" · ")}
                          </>
                        }
                        slotProps={{ primary: { noWrap: true, title: row.name, sx: { fontWeight: 600 } } }}
                        sx={{ minWidth: 0 }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Stack>
        )}

        <Stack spacing={1.5}>
          {rows.length > 0 && <Typography variant="subtitle2">{t("downloadFirmware")}</Typography>}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
              <InputLabel id="fw-source-label">{t("source")}</InputLabel>
              <Select
                labelId="fw-source-label"
                label={t("source")}
                value={sourceId}
                onChange={(event) => {
                  sourceIdRef.current = event.target.value;
                  resetSource();
                  setSourceId(event.target.value);
                }}
                disabled={disabled}
              >
                {FIRMWARE_SOURCES.map((entry) => (
                  <MenuItem key={entry.id} value={entry.id}>
                    {t(ORIGIN_LABEL[entry.id])}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {releases.length > 0 && (
              <IconButton aria-label={t("refresh")} onClick={() => void loadReleases()} disabled={disabled || busy !== null}>
                <RefreshIcon />
              </IconButton>
            )}
          </Stack>
          {releases.length === 0 && (
            <Button
              variant={rows.length > 0 ? "outlined" : "contained"}
              size="large"
              fullWidth
              onClick={() => void loadReleases()}
              disabled={disabled || busy !== null}
            >
              {t("listReleases")}
            </Button>
          )}

          {releases.length > 0 && (
            <>
              <FormControl size="small" fullWidth>
                <InputLabel id="fw-release-label">{t("release")}</InputLabel>
                <Select
                  labelId="fw-release-label"
                  label={t("release")}
                  value={selectedRelease}
                  onChange={(event) => {
                    setSelectedRelease(event.target.value);
                    setSelectedAsset("");
                  }}
                  disabled={disabled}
                >
                  {releases.map((entry) => (
                    <MenuItem key={entry.id} value={entry.tagName}>
                      {entry === stableRelease ? t("stableRelease", { tag: entry.tagName }) : entry.tagName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth disabled={!release || release.assets.length === 0}>
                <InputLabel id="fw-asset-label">{t("asset")}</InputLabel>
                <Select
                  labelId="fw-asset-label"
                  label={t("asset")}
                  value={asset?.name ?? ""}
                  onChange={(event) => setSelectedAsset(event.target.value)}
                  disabled={disabled}
                  renderValue={(name) => splitFirmwareName(name).board}
                >
                  {(release?.assets ?? []).map((entry) => (
                    <MenuItem key={entry.id} value={entry.name}>
                      <ListItemText primary={splitFirmwareName(entry.name).board} secondary={formatSize(entry.size)} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={() => void handleDownload()}
                disabled={disabled || !asset || busy !== null || downloading}
              >
                {downloading ? t("downloadingFirmware") : t("download")}
              </Button>
            </>
          )}
        </Stack>

        {(busy || downloading) && (
          <Stack spacing={0.75}>
            <LinearProgress sx={{ height: 4, borderRadius: 2 }} aria-label={busy ?? t("downloadingFirmware")} />
            {busy && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {busy}
              </Typography>
            )}
          </Stack>
        )}
        {error != null && (
          <Alert severity="error" onClose={() => setError(null)}>
            {errorText(error)}
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
