"use client";

import { createTheme } from "@mui/material/styles";

/**
 * MUI-first theme; custom palette only, no custom component classes.
 * Light/dark follow the OS setting via a CSS media query — no JS switching.
 */
export const theme = createTheme({
  components: {
    // Sentence-case buttons ("Connect proxy"), like current Android/iOS apps.
    MuiButton: {
      styleOverrides: { root: { textTransform: "none", fontWeight: 600 } },
    },
    // Long firmware names: cap menu height and wrap instead of clipping.
    MuiMenu: {
      styleOverrides: { paper: { maxHeight: "50vh" } },
    },
    // Edge-to-edge on Android: lift toasts above the navigation bar.
    MuiSnackbar: {
      styleOverrides: { root: { marginBottom: "env(safe-area-inset-bottom)" } },
    },
    MuiMenuItem: {
      styleOverrides: { root: { whiteSpace: "normal", overflowWrap: "anywhere" } },
    },
  },
  cssVariables: { colorSchemeSelector: "media" },
  colorSchemes: {
    // Brand palette from the store graphics: navy #0e1821, mint #2ce8be, off-white #fafbfc.
    light: {
      palette: {
        // Mint darkened to pass 4.5:1 on light surfaces.
        primary: { main: "#0e8167" },
        success: { main: "#0e8167" },
        error: { main: "#c62828" },
        // Tint of the graphic's grey-blue #aab9c5; cards sit on the brand off-white.
        background: { default: "#d4dce2", paper: "#fafbfc" },
        text: { primary: "#0e1821" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#2ce8be" },
        success: { main: "#2ce8be" },
        error: { main: "#ef5350" },
        // Cards one step lighter than the page (header bar is #20303d) so they read as surfaces.
        background: { default: "#0e1821", paper: "#16222d" },
      },
    },
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
});
