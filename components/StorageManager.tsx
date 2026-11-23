"use client";

/** Proxy storage page: location state and transfers for validated firmware ZIPs. */

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import MemoryIcon from "@mui/icons-material/Memory";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import StorageIcon from "@mui/icons-material/Storage";
import UploadIcon from "@mui/icons-material/Upload";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { CardTitle } from "@/components/CardTitle";
import type { GdfuBle } from "@/lib/bluetooth";
import {
  listOfflineImages,
  parseFirmwareZip,
  saveImageOffline,
  splitFirmwareName,
  type StoredImage,
} from "@/lib/firmware";
import {
  ProxyFiles,
  checkUpload,
  combineFileLocations,
  type FileLocation,
  type ProxyFileEntry,
  type ProxyStorage,
} from "@/lib/proxyFiles";
import { AppError, useErrorText, useT } from "@/lib/i18n";

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} kB`;
}

export function StorageManager({
  ble,
  onClose,
  onStorage,
}: {
  ble: RefObject<GdfuBle | null>;
  onClose: () => void;
  onStorage: (storage: ProxyStorage | null) => void;
}): React.ReactElement {
  const t = useT();
  const errorText = useErrorText();
  const [storage, setStorage] = useState<ProxyStorage | null>(null);
  const [files, setFiles] = useState<ProxyFileEntry[]>([]);
  const [offline, setOffline] = useState<StoredImage[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancel = useRef<AbortController | null>(null);

  const client = useCallback((): ProxyFiles => {
    if (!ble.current) {
      throw new AppError("proxyNotConnected");
    }
    return new ProxyFiles(ble.current);
  }, [ble]);

  const refresh = useCallback(async (): Promise<void> => {
    const proxy = client();
    const [nextStorage, nextFiles, nextOffline] = await Promise.all([
      proxy.storage(),
      proxy.list(),
      listOfflineImages(),
    ]);
    setStorage(nextStorage);
    setFiles(nextFiles);
    setOffline(nextOffline);
    onStorage(nextStorage);
  }, [client, onStorage]);

  const run = useCallback(
    async (label: string, task: (signal: AbortSignal) => Promise<void>): Promise<void> => {
      cancel.current = new AbortController();
      setBusy(label);
      setProgress(null);
      setError(null);
      setNotice(null);
      try {
        await task(cancel.current.signal);
        await refresh();
      } catch (cause) {
        setError(cause);
        await refresh().catch(() => undefined);
      } finally {
        cancel.current = null;
        setBusy(null);
        setProgress(null);
      }
    },
    [refresh],
  );

  useEffect(() => {
    void run(t("readingStorage"), async () => undefined);
    return () => cancel.current?.abort();
  }, [run, t]);

  const upload = (location: FileLocation): Promise<void> =>
    run(t("uploading", { name: location.name }), async (signal) => {
      if (location.conflict) {
        throw new AppError("conflictError", { offlineName: location.offlineName ?? "", name: location.name });
      }
      if (!location.offlineName) {
        throw new AppError("downloadFirst");
      }
      const stored = offline.find((entry) => entry.name === location.offlineName);
      if (!stored) {
        throw new AppError("phoneCopyGone");
      }
      const buffer = await stored.blob.arrayBuffer();
      await parseFirmwareZip(stored.name, buffer);
      const proxy = client();
      const [fresh, current] = [await proxy.storage(), await proxy.list()];
      const check = checkUpload(fresh, current, location.name, buffer.byteLength);
      if (!check.ok) {
        throw new AppError("cannotUpload", { name: location.name, reason: check.reason });
      }
      await proxy.upload(location.name, new Uint8Array(buffer), check.replaces, {
        signal,
        onProgress: (done, total) => setProgress((done / total) * 100),
      });
      setNotice(t("uploaded", { name: location.name }));
    });

  const download = (location: FileLocation): Promise<void> =>
    run(t("downloading", { name: location.name }), async (signal) => {
      const bytes = await client().download(location.name, {
        signal,
        onProgress: (done, total) => setProgress((done / total) * 100),
      });
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      await parseFirmwareZip(location.name, buffer);
      await saveImageOffline(location.name, buffer, "proxy");
      setNotice(t("savedToPhone", { name: location.name }));
    });

  const remove = (location: FileLocation): Promise<void> =>
    window.confirm(t("confirmRemove", { name: location.name }))
      ? run(t("removing", { name: location.name }), () => client().remove(location.name))
      : Promise.resolve();

  const locations = useMemo(() => combineFileLocations(offline, files), [files, offline]);
  const usedPct = useMemo(
    () => (storage && storage.totalBytes > 0 ? (storage.usedBytes / storage.totalBytes) * 100 : 0),
    [storage],
  );

  return (
    <Stack spacing={2} sx={{ maxWidth: 720, mx: "auto", p: 2, pb: 6 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <IconButton aria-label={t("back")} onClick={onClose} disabled={busy !== null && progress !== null}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6">{t("proxyStorage")}</Typography>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <CardTitle
            icon={<StorageIcon color="primary" fontSize="small" />}
            title={t("proxySpace")}
            help={t("proxySpaceHelp")}
            variant="subtitle2"
          />
          <LinearProgress variant="determinate" value={usedPct} sx={{ height: 6, borderRadius: 3 }} />
          <Typography variant="body2" color="text.secondary">
            {storage
              ? t("storageSummary", {
                  used: formatSize(storage.usedBytes),
                  total: formatSize(storage.totalBytes),
                  free: formatSize(Math.max(0, storage.totalBytes - storage.usedBytes)),
                  files: t(storage.fileCount === 1 ? "filesOne" : "filesOther", { count: storage.fileCount }),
                })
              : "—"}
          </Typography>
        </Stack>
      </Paper>

      {busy && (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">{busy}</Typography>
          <LinearProgress variant={progress === null ? "indeterminate" : "determinate"} value={progress ?? 0} />
          {progress !== null && (
            <Button size="small" onClick={() => cancel.current?.abort()}>
              {t("cancel")}
            </Button>
          )}
        </Stack>
      )}

      {notice && (
        <Snackbar open autoHideDuration={4000} onClose={() => setNotice(null)}>
          <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert>
        </Snackbar>
      )}
      {error != null && (
        <Snackbar open autoHideDuration={6000} onClose={() => setError(null)}>
          <Alert severity="error" onClose={() => setError(null)}>{errorText(error)}</Alert>
        </Snackbar>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack sx={{ mb: 1 }}>
          <CardTitle
            icon={<MemoryIcon color="primary" fontSize="small" />}
            title={t("firmwareFiles")}
            help={t("firmwareFilesHelp")}
            variant="subtitle2"
          />
        </Stack>
        {locations.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("noFiles")}
          </Typography>
        ) : (
          <List disablePadding sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 1 }}>
            {locations.map((location) => {
              const shownName = location.conflict ? (location.offlineName ?? location.name) : location.name;
              const { board, version } = splitFirmwareName(shownName);
              return (
                <ListItem
                  key={`${location.name}|${location.offlineName ?? ""}`}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 1, py: 1, pl: 1.5, pr: 0.5, gap: 1 }}
                >
                  <ListItemText
                    primary={board}
                    secondary={
                      <>
                        {location.conflict
                          ? t("conflictSecondary", { size: formatSize(location.size), name: location.name })
                          : [version, formatSize(location.size)].filter(Boolean).join(" · ")}
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                          {location.offline && (
                            <Chip size="small" variant="outlined" color="primary" icon={<PhoneAndroidIcon />} label={t("onPhoneTag")} />
                          )}
                          {location.onProxy && (
                            <Chip size="small" variant="outlined" color="primary" icon={<StorageIcon />} label={t("onProxyTag")} />
                          )}
                        </Stack>
                      </>
                    }
                    slotProps={{
                      primary: { noWrap: true, title: shownName, sx: { fontWeight: 600 } },
                      secondary: { component: "div" },
                    }}
                    sx={{ minWidth: 0 }}
                  />
                  {location.onProxy && !location.offline && (
                    <IconButton
                      color="primary"
                      aria-label={t("downloadToPhone", { name: location.name })}
                      disabled={busy !== null}
                      onClick={() => void download(location)}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  )}
                  {location.onProxy ? (
                    <IconButton
                      aria-label={t("removeFromProxy", { name: location.name })}
                      disabled={busy !== null}
                      onClick={() => void remove(location)}
                    >
                      <DeleteOutlinedIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    <IconButton
                      color="primary"
                      aria-label={location.conflict ? t("uploadConflict", { name: location.offlineName ?? location.name }) : t("uploadToProxy", { name: location.name })}
                      disabled={busy !== null || location.conflict}
                      onClick={() => void upload(location)}
                    >
                      <UploadIcon fontSize="small" />
                    </IconButton>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </Paper>
    </Stack>
  );
}
