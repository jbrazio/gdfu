"use client";

/** Proxy link status shared between the connection card and the app header. */

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { SignalStrength } from "@/components/SignalStrength";
import type { ConnectionState } from "@/lib/bluetooth";
import { useT } from "@/lib/i18n";

interface ProxyStatusValue {
  connection: ConnectionState;
  rssi: number | null;
  /** gFSK RSSI of the selected target, as last reported by discovery. */
  fskRssi: number | null;
}

const INITIAL: ProxyStatusValue = { connection: "disconnected", rssi: null, fskRssi: null };
const StatusContext = createContext<ProxyStatusValue>(INITIAL);
const SetStatusContext = createContext<(patch: Partial<ProxyStatusValue>) => void>(() => undefined);

export function ProxyStatusProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<ProxyStatusValue>(INITIAL);
  const value = useMemo(() => status, [status]);
  const patchStatus = useCallback((patch: Partial<ProxyStatusValue>) => setStatus((s) => ({ ...s, ...patch })), []);
  return (
    <SetStatusContext.Provider value={patchStatus}>
      <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
    </SetStatusContext.Provider>
  );
}

export const useSetProxyStatus = (): ((patch: Partial<ProxyStatusValue>) => void) => useContext(SetStatusContext);

function LabelledSignal({ label, rssi }: { label: string; rssi: number }): React.ReactElement {
  return (
    <Stack sx={{ alignItems: "center" }}>
      <SignalStrength rssi={rssi} onDark />
      <Box
        component="span"
        sx={{
          fontSize: 9,
          lineHeight: 1,
          fontWeight: 600,
          color: "inherit",
        }}
      >
        {label}
      </Box>
    </Stack>
  );
}

export function HeaderProxyStatus(): React.ReactElement {
  const { connection, rssi, fskRssi } = useContext(StatusContext);
  const t = useT();
  const showBle = connection === "connected" && rssi !== null;
  const showFsk = connection === "connected" && fskRssi !== null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", ml: "auto" }}>
      {showBle && <LabelledSignal label="BLE" rssi={rssi} />}
      {showFsk && <LabelledSignal label="FSK" rssi={fskRssi} />}
      {(showBle || showFsk) && (
        <Divider
          orientation="vertical"
          flexItem
          sx={{ my: 1, borderColor: "currentColor", opacity: 0.4 }}
        />
      )}
      <Chip
        size="small"
        label={
          t(connection)
        }
        color={connection === "connected" ? "success" : "error"}
        sx={{ borderRadius: 1 }}
      />
    </Stack>
  );
}
