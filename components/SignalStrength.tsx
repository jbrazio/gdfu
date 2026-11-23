"use client";

import SignalCellular1BarIcon from "@mui/icons-material/SignalCellular1Bar";
import SignalCellular2BarIcon from "@mui/icons-material/SignalCellular2Bar";
import SignalCellular3BarIcon from "@mui/icons-material/SignalCellular3Bar";
import { signalStrength } from "@/lib/bluetooth";
import { useT } from "@/lib/i18n";

const LABEL = { weak: "signalWeak", medium: "signalMedium", strong: "signalStrong" } as const;
// [light, dark]: each ≥4.5:1 on the light tint #d4dce2 / card #fafbfc and on navy #0e1821.
// Fixed here because the header renders outside the app ThemeProvider.
const COLORS = {
  strong: ["#0a6652", "#2ce8be"],
  medium: ["#9a4a00", "#ffb74d"],
  weak: ["#a61f1f", "#ff6b6b"],
} as const;

/** `onDark`: always use the dark-surface colours (the header bar is dark in both schemes). */
export function SignalStrength({ rssi, onDark = false }: { rssi: number; onDark?: boolean }): React.ReactElement {
  const t = useT();
  const strength = signalStrength(rssi);
  const Icon =
    strength === "strong"
      ? SignalCellular3BarIcon
      : strength === "medium"
        ? SignalCellular2BarIcon
        : SignalCellular1BarIcon;
  const [light, dark] = COLORS[strength];
  return (
    <Icon aria-label={t(LABEL[strength])} sx={{ color: onDark ? dark : light, "@media (prefers-color-scheme: dark)": { color: dark } }} />
  );
}
