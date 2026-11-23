import type { Metadata, Viewport } from "next";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import { About } from "@/components/About";
import { HeaderProxyStatus, ProxyStatusProvider } from "@/components/ProxyStatus";
import "./globals.css";

const releaseVersion = process.env.NEXT_PUBLIC_RELEASE_VERSION ?? "unknown";

// Navy of public/brand.png (splash, page background in dark mode).
const brandBackground = "#0e1821";
// Header bar: slate navy in both schemes so it stands apart from the page; status bar matches it.
const headerBackground = "#20303d";

export const metadata: Metadata = {
  title: `GFSK DFU ${releaseVersion}`,
  description: "Update nRF52840 devices over long distances, far beyond standard BLE or Wi-Fi OTA range",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: headerBackground,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body>
        <ProxyStatusProvider>
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <AppBar
            component="header"
            position="fixed"
            elevation={0}
            sx={{
              backgroundImage: "none",
              backgroundColor: headerBackground,
              color: "#fafbfc",
              borderBottom: `1px solid ${brandBackground}`,
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            <Toolbar sx={{ minHeight: 56 }}>
              <Box component="img" src="/brand.png" alt="GFSK DFU" sx={{ width: 40, height: 40, borderRadius: 1.5 }} />
              <HeaderProxyStatus />
              <About version={releaseVersion} />
            </Toolbar>
          </AppBar>
          <Box sx={{ height: "calc(56px + env(safe-area-inset-top))" }} />
          <Box component="main" sx={{ flex: 1, pb: "env(safe-area-inset-bottom)" }}>
            {children}
          </Box>
        </Box>
        </ProxyStatusProvider>
      </body>
    </html>
  );
}
