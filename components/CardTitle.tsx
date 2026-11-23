import Badge from "@mui/material/Badge";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactElement, ReactNode } from "react";

export function CardTitle({
  icon,
  title,
  help,
  trailing,
  step,
  variant = "h6",
}: {
  icon: ReactElement;
  title: string;
  help: string;
  trailing?: ReactNode;
  /** Step in the update flow (1–4); drawn as a badge on the icon tile, matching the tutorial. */
  step?: number;
  variant?: "h6" | "subtitle2";
}): ReactElement {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
        <Badge
          badgeContent={step}
          color="primary"
          overlap="rectangular"
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
          sx={{ "& .MuiBadge-badge": { fontWeight: 700, fontSize: "0.7rem", minWidth: 18, height: 18, px: 0.5 } }}
        >
          <Stack
            sx={{
              alignItems: "center",
              backgroundColor: "action.selected",
              borderRadius: 1.5,
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            {icon}
          </Stack>
        </Badge>
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography variant={variant} sx={{ lineHeight: 1.2, fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.3 }}>
            {help}
          </Typography>
        </Stack>
      </Stack>
      {trailing}
    </Stack>
  );
}
