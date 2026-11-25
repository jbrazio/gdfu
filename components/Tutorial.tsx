import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import MobileStepper from "@mui/material/MobileStepper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState, type ReactElement } from "react";
import { useLocale, useT, type MessageKey } from "@/lib/i18n";

const SEEN_KEY = "tutorialSeen";
export const SHOW_TUTORIAL_EVENT = "gdfu:show-tutorial";

type Page = { image: string; title: MessageKey; body: MessageKey; links?: [MessageKey, string][] };

// Setup slides use shared illustrations; app slides use per-locale card close-ups
// cropped from the store screenshot captures (light mode).
const PAGES: Page[] = [
  { image: "00-overview.webp", title: "tutorialOverviewTitle", body: "tutorialOverviewBody" },
  {
    image: "00-proxy-flash.webp",
    title: "tutorialFlashProxyTitle",
    body: "tutorialFlashProxyBody",
    links: [
      // ponytail: /releases, not /releases/latest — every release is still a pre-release.
      ["tutorialDownloadProxy", "https://github.com/jbrazio/gdfu-proxy/releases"],
      ["tutorialWebFlasher", "https://www.meshcore.pt/tools/flasher"],
    ],
  },
  {
    image: "00-bootloader.webp",
    title: "tutorialFlashBootloaderTitle",
    body: "tutorialFlashBootloaderBody",
    links: [
      ["tutorialDownloadBootloader", "https://github.com/jbrazio/gdfu-bootloader/releases"],
      ["tutorialBootloaderFlasher", "https://www.meshcore.pt/tools/bootloader"],
    ],
  },
  { image: "01-proxy", title: "tutorialProxyTitle", body: "tutorialProxyBody" },
  { image: "02-targets", title: "tutorialTargetTitle", body: "tutorialTargetBody" },
  { image: "03-firmware", title: "tutorialFirmwareTitle", body: "tutorialFirmwareBody" },
  { image: "04-update", title: "tutorialUpdateTitle", body: "tutorialUpdateBody" },
];

/** First-run walkthrough; shown once, then remembered in localStorage. */
export function Tutorial(): ReactElement {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // After mount: the static export has no localStorage at build time.
  useEffect(() => setOpen(!localStorage.getItem(SEEN_KEY)), []);

  // About (in the layout, outside this tree) reopens it via a window event.
  useEffect(() => {
    const show = (): void => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(SHOW_TUTORIAL_EVENT, show);
    return () => window.removeEventListener(SHOW_TUTORIAL_EVENT, show);
  }, []);

  const close = (): void => {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  };
  const last = step === PAGES.length - 1;
  const page = PAGES[step];

  return (
    <Dialog fullScreen open={open} onClose={close} aria-labelledby="tutorial-title">
      <Stack
        sx={{
          height: "100%",
          width: "100%",
          maxWidth: 520,
          mx: "auto",
          p: 2,
          pt: "calc(16px + env(safe-area-inset-top))",
          pb: "calc(8px + env(safe-area-inset-bottom))",
        }}
      >
        <Box
          component="img"
          src={page.image.endsWith(".webp") ? `/tutorial/${page.image}` : `/tutorial/${locale}/${page.image}.webp`}
          alt=""
          sx={{ flex: 1, minHeight: 0, width: "100%", objectFit: "contain", borderRadius: 3 }}
        />
        <Typography id="tutorial-title" variant="h6" sx={{ mt: 2, fontWeight: 700 }}>
          {step + 1}. {t(page.title)}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, minHeight: page.links ? 0 : "6lh", whiteSpace: "pre-line" }}>
          {t(page.body)}
        </Typography>
        {page.links && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            {page.links.map(([label, href]) => (
              <Button
                key={href}
                href={href}
                target="_blank"
                rel="noopener"
                variant="outlined"
                size="small"
                fullWidth
                endIcon={<OpenInNewIcon />}
              >
                {t(label)}
              </Button>
            ))}
          </Stack>
        )}
        <MobileStepper
          variant="dots"
          position="static"
          steps={PAGES.length}
          activeStep={step}
          sx={{ background: "none", px: 0 }}
          backButton={
            <Button onClick={step ? () => setStep(step - 1) : close}>{step ? t("back") : t("tutorialSkip")}</Button>
          }
          nextButton={
            <Button variant="contained" onClick={last ? close : () => setStep(step + 1)}>
              {last ? t("tutorialDone") : t("tutorialNext")}
            </Button>
          }
        />
      </Stack>
    </Dialog>
  );
}
