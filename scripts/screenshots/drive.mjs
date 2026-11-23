// Drives the app's WebView over the Chrome DevTools protocol with real touch taps (visible ripples),
// and writes when each step starts so edit-video.py can caption it.
// Usage: node drive.mjs <devtools http url> <marks.json>
import { writeFile } from "node:fs/promises";

const [devtools, marksPath] = process.argv.slice(2);
const pages = await (await fetch(`${devtools}/json`)).json();
const page = pages.find((p) => p.type === "page");
if (!page) throw new Error("no WebView page found; is the app in the foreground?");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((ok, fail) => {
  const n = ++id;
  pending.set(n, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const js = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? expression);
  return r.result.value;
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const start = Date.now();
const marks = [];
const mark = (step) => { marks.push({ step, t: (Date.now() - start) / 1000 }); console.log(step, marks.at(-1).t); };

// Centre of the first visible element matching selector whose text matches re.
const find = (selector, re) => js(`(() => {
  const re = ${re};
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => re.test(e.textContent) && e.getClientRects().length && !e.disabled && e.getAttribute("aria-disabled") !== "true");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
const waitFor = async (selector, re, timeout = 20000) => {
  for (const until = Date.now() + timeout; Date.now() < until; await sleep(200)) {
    const p = await find(selector, re);
    if (p) return p;
  }
  throw new Error(`timed out waiting for ${selector} ${re}`);
};
const tap = async (selector, re) => {
  const { x, y } = await waitFor(selector, re);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await sleep(90);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(400);
};
// Smooth-scroll card n under the header, like a person swiping.
const showCard = async (n) => {
  await js(`(() => { const el = document.querySelectorAll("main .MuiPaper-root")[${n}]; window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" }); })()`);
  await sleep(1100);
};

await waitFor("button", /scan proxies/i);
await sleep(1500);
mark("proxy");
await tap("button", /scan proxies/i);
await tap(".MuiListItemButton-root", /GFSK DFU/);
await waitFor("button", /disconnect/i);
await sleep(2500);

mark("targets");
await showCard(1);
await tap("button", /discover targets/i);
await waitFor("[role=radio]", /0x1f3a9c07/i, 10000);
await sleep(5500); // let the scan finish
await tap("[role=radio]", /0x1f3a9c07/i);
await sleep(2000);

mark("firmware");
await showCard(2);
await tap("button", /list releases/i);
await sleep(1500);
await tap("button", /^download$/i);
await waitFor("[role=radio]", /RAK 4631 repeater/i);
await sleep(2500);

mark("update");
await showCard(3);
await sleep(1500);
await js("window.__slow = 10");
await tap("button", /start update/i);
mark("transfer");
await sleep(800);
await js(`window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })`);
await waitFor("button", /start update/i, 120000); // button returns once the run is over
mark("done");
await js(`window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })`);
await sleep(5000);
mark("end");
await writeFile(marksPath, JSON.stringify(marks, null, 2));
ws.close();
