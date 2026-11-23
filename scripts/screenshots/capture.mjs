// Captures app screens for the Play and App Store listings and the tutorial against fake-proxy.js (fake BLE proxy + GitHub releases).
// Usage: npm run build && node scripts/screenshots/capture.mjs <firmware.zip> [outDir]
//   then: python3 scripts/screenshots/frame.py [outDir]
// Needs Playwright (PLAYWRIGHT=/path/to/playwright/index.mjs if not resolvable) and Chromium (CHROMIUM=/path, optional).
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [zipPath, outDir = "/tmp/gdfu-screenshots"] = process.argv.slice(2);
if (!zipPath) throw new Error("usage: capture.mjs <firmware.zip> [outDir]");
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const root = fileURLToPath(new URL("../../out", import.meta.url));
const zip = await readFile(zipPath);
await mkdir(outDir, { recursive: true });

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp" };
const srv = createServer(async (q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  if (p.split("/").includes("..")) { r.writeHead(403); r.end(); return; }
  try {
    const body = await readFile(join(root, p));
    r.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
    r.end(body);
  } catch {
    r.writeHead(404);
    r.end();
  }
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${srv.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
// Button labels per locale, read from the message catalogues so new locales need no edits here.
const LOCALES = ["en-GB", "pt-PT", "pt-BR", "zh-Hans", "fr", "de", "ko", "es"];
const label = async (locale, key) => {
  const file = locale === "en-GB" ? "../../lib/i18n.ts" : `../../lib/locales/${locale}.ts`;
  const src = await readFile(fileURLToPath(new URL(file, import.meta.url)), "utf8");
  return JSON.parse(src.match(new RegExp(`\\n  ${key}: ("(?:[^"\\\\]|\\\\.)*"),`))[1]);
};
const exact = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

// Play phone (also used for the tutorial close-ups), App Store iPhone 6.9" (1320x2868) and iPad 13" (2064x2752).
const DEVICES = [
  { prefix: "", viewport: { width: 405, height: 900 }, deviceScaleFactor: 2 },
  { prefix: "iphone-", viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 },
  { prefix: "ipad-", viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2 },
];

const capture = async (locale, { prefix, viewport, deviceScaleFactor }) => {
  const out = (n) => join(outDir, `${locale}-${prefix}${n}.png`);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, colorScheme: "light", locale });
  await ctx.route("**/demo/firmware.zip", (r) => r.fulfill({ body: zip, contentType: "application/zip" }));
  const pg = await ctx.newPage();
  await pg.addInitScript({ path: fileURLToPath(new URL("fake-proxy.js", import.meta.url)) });
  await pg.goto(url);
  await pg.waitForTimeout(900);
  const card = (i) => pg.locator("main .MuiPaper-root").nth(i);
  const show = async (i) => { await card(i).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64)); await pg.waitForTimeout(200); };
  const bottom = async () => { await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(200); };
  // Tutorial close-up: the card plus a 12px margin, centred so the fixed header stays out of the crop.
  const zoom = async (i, n) => {
    await card(i).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await pg.waitForTimeout(200);
    const r = await card(i).boundingBox();
    await pg.screenshot({ path: out(`zoom-${n}`), clip: { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 } });
  };

  await card(0).getByRole("button").first().click(); // connect proxy
  await pg.waitForTimeout(1200);
  await card(1).getByRole("button").first().click(); // discover targets
  await pg.waitForTimeout(1500);
  await card(1).locator(".MuiListItemButton-root").first().click();
  await card(2).getByRole("button", { name: exact(await label(locale, "listReleases")) }).click();
  await pg.waitForTimeout(800);
  await card(2).getByRole("button", { name: exact(await label(locale, "download")) }).click();
  await pg.waitForTimeout(3000);

  await show(0); await pg.screenshot({ path: out("01-proxy") }); if (!prefix) await zoom(0, "01-proxy");
  await show(1); await pg.screenshot({ path: out("02-targets") }); if (!prefix) await zoom(1, "02-targets");
  await show(2); await pg.screenshot({ path: out("03-firmware") }); if (!prefix) await zoom(2, "03-firmware");
  if (!prefix) await zoom(3, "04-update");

  await pg.evaluate(() => { window.__slow = 120; });
  await card(3).getByRole("button").last().click(); // start update
  await pg.waitForTimeout(9000);
  await bottom(); await pg.screenshot({ path: out("04-update") });
  await pg.evaluate(() => { window.__slow = 1; });
  await pg.waitForTimeout(32000); // transfer finishes, then the app waits out the reboot window
  await bottom(); await pg.screenshot({ path: out("05-success") });
  await ctx.close();
};
// Devices run side by side: the flow is mostly fixed waits.
for (const locale of LOCALES) await Promise.all(DEVICES.map((d) => capture(locale, d)));
await browser.close();
srv.close();
console.log(`captured into ${outDir}`);
