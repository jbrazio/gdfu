"use client";

/** Target discovery card: poll DISCOVERY, list targets, select one. */

import RadarIcon from "@mui/icons-material/Radar";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { CardTitle } from "@/components/CardTitle";
import { SignalStrength } from "@/components/SignalStrength";
import type { DiscoveredTarget } from "@/lib/bluetooth";
import { useT } from "@/lib/i18n";

const PROFILE_LABEL: Record<number, string> = { 1: "433 MHz", 2: "868 MHz" };
const hexId = (id: number): string => `0x${id.toString(16).padStart(8, "0")}`;

export function TargetSection({
  connected,
  targets,
  selectedTarget,
  discovering,
  dfuActive,
  onSelect,
  onStartDiscovery,
}: {
  connected: boolean;
  targets: DiscoveredTarget[];
  selectedTarget: DiscoveredTarget | null;
  discovering: boolean;
  dfuActive: boolean;
  onSelect: (target: DiscoveredTarget) => void;
  onStartDiscovery: () => void;
}): React.ReactElement {
  const t = useT();
  // Remember a finished scan so an empty result can say so instead of showing nothing.
  const [scanned, setScanned] = useState(false);
  useEffect(() => {
    if (discovering) setScanned(true);
  }, [discovering]);
  useEffect(() => {
    if (!connected) setScanned(false);
  }, [connected]);

  const hasResults = targets.length > 0;
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Stack spacing={2}>
        <CardTitle
          step={2}
          icon={<RadarIcon color="primary" />}
          title={t("targetsTitle")}
          help={selectedTarget ? t("targetSelected", { id: hexId(selectedTarget.targetId) }) : t("targetsHelp")}
          trailing={
            connected && !discovering && (hasResults || scanned) ? (
              <Button size="small" color="inherit" startIcon={<RefreshIcon />} sx={{ flexShrink: 0, whiteSpace: "nowrap" }} onClick={onStartDiscovery} disabled={discovering || dfuActive}>
                {t("scanAgain")}
              </Button>
            ) : undefined
          }
        />
        {!connected && (
          <Typography variant="body2" color="text.secondary">
            {t("connectProxyFirst")}
          </Typography>
        )}
        {connected && !hasResults && !scanned && (
          <Button variant="contained" size="large" fullWidth startIcon={<SearchIcon />} onClick={onStartDiscovery} disabled={discovering || dfuActive}>
            {t("discoverTargets")}
          </Button>
        )}
        {connected && discovering && (
          <Stack spacing={0.75}>
            <LinearProgress sx={{ height: 4, borderRadius: 2 }} />
            {!hasResults && (
              <Typography variant="caption" color="text.secondary">
                {t("listening")}
              </Typography>
            )}
          </Stack>
        )}
        {connected && scanned && !discovering && !hasResults && <Alert severity="info">{t("noTargets")}</Alert>}
        {hasResults && (
          <List disablePadding sx={{ display: "grid", gap: 1 }} role="radiogroup" aria-label={t("targetsTitle")}>
            {targets.map((target) => {
              const selected = selectedTarget?.targetId === target.targetId;
              return (
                <ListItemButton
                  key={target.targetId}
                  selected={selected}
                  disabled={dfuActive}
                  onClick={() => onSelect(target)}
                  role="radio"
                  aria-checked={selected}
                  sx={{
                    border: 1,
                    borderColor: selected ? "primary.main" : "divider",
                    borderRadius: 1,
                    gap: 1.5,
                    py: 1,
                  }}
                >
                  <Radio checked={selected} tabIndex={-1} size="small" sx={{ p: 0 }} slotProps={{ input: { "aria-hidden": true } }} />
                  <ListItemText
                    primary={hexId(target.targetId)}
                    secondary={`${PROFILE_LABEL[target.profile] ?? t("profileN", { n: target.profile })} · ${target.rssi} dBm`}
                    slotProps={{ primary: { sx: { fontFamily: "monospace", fontWeight: 600 } } }}
                  />
                  <SignalStrength rssi={target.rssi} />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </Stack>
    </Paper>
  );
}
