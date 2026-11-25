"use client";

/** Header info button that opens the About dialog: identity, credits, app licence and third-party licences. */

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { ThemeProvider } from "@mui/material/styles";
import { useState } from "react";
import { SHOW_TUTORIAL_EVENT } from "@/components/Tutorial";
import { useT } from "@/lib/i18n";
import { theme } from "@/theme";

const WEBSITE = "https://meshcore.pt";
const AUTHOR = "João Brázio (kasvoton)";
const THANKS = "Miguel Santos (Mike05), Mast3Rij0, César Coelho, Miguel Bento, José Alves";
const credits: { name: string; license: string }[] = JSON.parse(process.env.NEXT_PUBLIC_CREDITS ?? "[]");
// One line per licence: "MIT: next, react, …" (Object.groupBy is ES2024; reduce keeps older WebViews happy).
const byLicence = Object.entries(
  credits.reduce<Record<string, string[]>>((acc, c) => ((acc[c.license] ??= []).push(c.name), acc), {}),
);

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{title}</Typography>
      {children}
    </Box>
  );
}

export function About({ version }: { version: string }): React.ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <ThemeProvider theme={theme}>
      <IconButton edge="end" color="inherit" aria-label={t("about")} onClick={() => setOpen(true)} sx={{ ml: 0.5 }}>
        <InfoOutlinedIcon />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} scroll="paper" fullWidth maxWidth="xs" aria-labelledby="about-title">
        <DialogContent sx={{ pt: 3, pb: 1 }}>
          <Box sx={{ textAlign: "center", pb: 2 }}>
            <Box component="img" src="/brand.png" alt="" sx={{ width: 72, height: 72, borderRadius: 4, display: "block", mx: "auto", mb: 1.5 }} />
            <Typography id="about-title" variant="h6" component="h2">GFSK DFU</Typography>
            <Typography variant="body2" color="text.secondary">{t("version", { version })}</Typography>
            <Typography variant="body2" sx={{ mt: 1.5 }}>{t("aboutBody")}</Typography>
            <Link href={WEBSITE} target="_blank" rel="noopener" variant="body2">meshcore.pt</Link>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>{t("appLicence")}</Typography>
            <Accordion disableGutters elevation={0} sx={{ bgcolor: "transparent", "&::before": { display: "none" } }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon fontSize="small" />}
                sx={{ minHeight: 0, justifyContent: "center", "& .MuiAccordionSummary-content": { flexGrow: 0, my: 0.5 } }}
              >
                <Typography variant="caption" color="primary">{t("openSourceLicences")}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ textAlign: "left", p: 0 }}>
                {byLicence.map(([licence, names]) => (
                  <Typography key={licence} variant="caption" component="p" color="text.secondary">
                    <b>{licence}</b>: {names.join(", ")}
                  </Typography>
                ))}
              </AccordionDetails>
            </Accordion>
          </Box>
          <Divider />
          <Section title={t("creditAuthor")}>
            <Typography variant="body1">{AUTHOR}</Typography>
          </Section>
          <Section title={t("specialThanks")}>
            <Typography variant="body1">{THANKS}</Typography>
          </Section>
        </DialogContent>
        <DialogActions sx={{ bgcolor: "background.default", borderTop: 1, borderColor: "divider", px: 2, py: 1.5 }}>
          <Button
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(SHOW_TUTORIAL_EVENT));
            }}
          >
            {t("showTutorial")}
          </Button>
          <Button onClick={() => setOpen(false)}>{t("close")}</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
