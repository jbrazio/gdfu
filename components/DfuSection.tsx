"use client";

/** DFU card: readiness checklist, start/cancel, progress with time remaining, result. */

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { CardTitle } from "@/components/CardTitle";
import { formatSize } from "@/components/StorageManager";
import type { DiscoveredTarget } from "@/lib/bluetooth";
import type { DfuProgress } from "@/lib/dfu";
import { splitFirmwareName, type FirmwareImage } from "@/lib/firmware";
import { useErrorText, useT, type MessageKey } from "@/lib/i18n";

const PHASE_LABEL: Record<DfuProgress["phase"], MessageKey> = {
  idle: "phaseIdle",
  selecting: "phaseSelecting",
  starting: "phaseStarting",
  init: "phaseInit",
  streaming: "phaseStreaming",
  finishing: "phaseFinishing",
  success: "phaseSuccess",
  failed: "phaseFailed",
  cancelled: "phaseCancelled",
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/** Checklist row shown before an update can start. */
function Requirement({ done, label, value }: { done: boolean; label: string; value: string | null }): React.ReactElement {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
      {done ? <CheckCircleIcon color="primary" fontSize="small" /> : <RadioButtonUncheckedIcon color="disabled" fontSize="small" />}
      <Typography variant="body2" color="text.secondary" sx={{ width: 72, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" noWrap sx={{ fontWeight: done ? 600 : 400, color: done ? "text.primary" : "text.disabled" }}>
        {value ?? "—"}
      </Typography>
    </Stack>
  );
}

export function DfuSection({
  canStart,
  active,
  progress,
  sessionError,
  image,
  target,
  connected,
  incompatibility,
  onStart,
  onCancel,
}: {
  canStart: boolean;
  active: boolean;
  progress: DfuProgress | null;
  sessionError: unknown;
  image: FirmwareImage | null;
  target: DiscoveredTarget | null;
  connected: boolean;
  incompatibility: string | null;
  onStart: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const t = useT();
  const errorText = useErrorText();
  // Click-to-end stopwatch; frozen at the final value once the run ends.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [endedAt, setEndedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);

  // Freeze only on the active -> inactive transition; between click and the
  // first progress event `active` is still false and must not end the run.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active) {
      setEndedAt(Date.now());
    }
    wasActive.current = active;
  }, [active]);

  const handleStart = (): void => {
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setEndedAt(null);
    onStart();
  };
  const elapsedMs = startedAt === null ? 0 : Math.max(0, (endedAt ?? now) - startedAt);

  const total = progress?.totalBytes ?? image?.sizeBytes ?? 0;
  // confirmedBytes includes the init packet; image progress counts app bytes.
  const imageConfirmed = Math.max(0, (progress?.confirmedBytes ?? 0) - 14);
  const pct = total > 0 ? Math.min(100, (imageConfirmed / total) * 100) : 0;

  const phase = progress?.phase ?? "idle";
  const finished = phase === "success" || phase === "failed" || phase === "cancelled";
  const validating = phase === "finishing";
  const etaMs = active && !validating && pct > 2 && startedAt !== null ? (elapsedMs * (100 - pct)) / pct : null;
  const firmware = image ? splitFirmwareName(image.name) : null;

  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Stack spacing={2}>
        <CardTitle
          step={4}
          icon={<SystemUpdateAltIcon color="primary" />}
          title={t("updateTitle")}
          help={active ? t(PHASE_LABEL[phase]) : t("updateHelp")}
        />

        {!active && !finished && (
          <Stack spacing={1}>
            <Requirement done={connected} label={t("proxyTitle")} value={connected ? t("connected") : null} />
            <Requirement done={target !== null} label={t("targetLabel")} value={target ? `0x${target.targetId.toString(16).padStart(8, "0")}` : null} />
            <Requirement
              done={image !== null}
              label={t("firmwareTitle")}
              value={firmware ? [firmware.board, firmware.version].filter(Boolean).join(" ") : null}
            />
          </Stack>
        )}

        {incompatibility && !active && <Alert severity="warning">{incompatibility}</Alert>}

        {(active || phase === "success") && (
          <Stack spacing={1}>
            <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
              <Typography variant="h4" component="p" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {Math.floor(pct)}%
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {etaMs !== null ? t("remaining", { time: formatElapsed(etaMs) }) : startedAt !== null ? formatElapsed(elapsedMs) : null}
              </Typography>
            </Stack>
            <LinearProgress
              variant={pct > 0 && !validating ? "determinate" : "indeterminate"}
              value={pct}
              color={phase === "success" ? "success" : "primary"}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {t("dfuBytes", { confirmed: formatSize(imageConfirmed), total: formatSize(total) })}
            </Typography>
          </Stack>
        )}

        {validating && (
          <Alert severity="info" icon={<CircularProgress size={20} />} role="status">
            {t("dfuValidating")}
          </Alert>
        )}
        {active && <Alert severity="info" icon={false}>{t("keepNear")}</Alert>}
        {phase === "success" && (
          <Alert severity="success">
            {t("dfuSuccess")} {startedAt !== null && t("tookTime", { time: formatElapsed(elapsedMs) })}
          </Alert>
        )}
        {phase === "cancelled" && <Alert severity="info">{t("dfuCancelled")}</Alert>}
        {(progress?.error ?? sessionError) != null && (
          <Alert severity="error">{errorText(progress?.error ?? sessionError)}</Alert>
        )}

        {active ? (
          <Button variant="outlined" color="error" size="large" fullWidth startIcon={<CloseIcon />} onClick={onCancel}>
            {t("cancelUpdate")}
          </Button>
        ) : (
          <Button variant="contained" size="large" fullWidth startIcon={<SystemUpdateAltIcon />} onClick={handleStart} disabled={!canStart}>
            {phase === "failed" || phase === "cancelled" ? t("retryUpdate") : t("startUpdate")}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
