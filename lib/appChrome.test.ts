import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const layout = readFileSync("app/layout.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const theme = readFileSync("theme.ts", "utf8");
const androidActivity = readFileSync("android/app/src/main/java/pt/meshcore/gdfu/MainActivity.java", "utf8");
const androidTheme = readFileSync("android/app/src/main/res/values/styles.xml", "utf8");
const androidSplashTheme = readFileSync("android/app/src/main/res/values-v31/styles.xml", "utf8");

assert.match(layout, /viewportFit: "cover"/);
assert.match(layout, /<AppBar\s+component="header"\s+position="fixed"\s+elevation=\{0\}/);
assert.match(layout, /paddingTop: "env\(safe-area-inset-top\)"/);
assert.match(layout, /height: "calc\(56px \+ env\(safe-area-inset-top\)\)"/);
assert.doesNotMatch(globals, /background:/);
assert.doesNotMatch(theme, /MuiCssBaseline/);
assert.match(theme, /default: "#0e1821", paper: "#16222d"/);
assert.match(layout, /backgroundColor: headerBackground/);
assert.match(layout, /themeColor: headerBackground/);
assert.match(androidActivity, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/);
assert.match(androidTheme, /<item name="android:statusBarColor">@android:color\/transparent<\/item>/);
assert.match(androidTheme, /<item name="android:navigationBarColor">@android:color\/transparent<\/item>/);
assert.match(androidSplashTheme, /windowSplashScreenAnimatedIcon">@drawable\/splash_icon/);
assert.match(androidSplashTheme, /windowSplashScreenBackground">#0e1821/);
assert.match(layout, /<Box component="img" src="\/brand\.png" alt="GFSK DFU"/);
assert.match(layout, /brandBackground = "#0e1821"/);
assert.match(layout, /<HeaderProxyStatus \/>\s*<About version=\{releaseVersion\} \/>/);
assert.ok(existsSync("public/brand.png"), "header logo must be exported as a static asset");
assert.ok(
  readFileSync("public/brand.png").length > 10_000,
  "header logo must preserve full GFSK DFU mark",
);
assert.match(layout, /<HeaderProxyStatus \/>/);
