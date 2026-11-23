// Demo-only fake GFSK DFU proxy + GitHub releases, for screenshots and the promo video. Never shipped:
// capture.mjs injects it into a browser page, record-video.sh into a throwaway Android debug build.
// Covers both transports: Web Bluetooth (navigator.bluetooth) and the native Capacitor BluetoothLe plugin.
// Serves the firmware from /demo/firmware.zip (same origin) and fakes the GitHub releases API.
(() => {
  localStorage.setItem("tutorialSeen", "1");
  const FIRMWARE = "RAK_4631_repeater-2026.9.2-lusofw-6ad664c.zip";
  // ponytail: size of the demo ZIP above, only used for the board menu label.
  const FIRMWARE_SIZE = 436717;

  // --- Proxy state machine (GATT layout per lib/bluetooth.ts) ---------------------------------
  const be = (bytes) => new DataView(new Uint8Array(bytes).buffer);
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const base = "7e4c2a10-8b31-4f9d-a600-0000000000";
  const values = {
    [base + "01"]: be([1, 1, 2, 0, 0, 3, 0, 244]),
    [base + "02"]: new DataView(new TextEncoder().encode("2026.11.15").buffer),
    [base + "10"]: be([2, ...u32(864_100_000), 22, ...u32(80_000), ...u32(28_000), ...u32(187_200)]),
    [base + "43"]: be([...u32(1_048_576), ...u32(312_000), 0, 2]),
    // Two bootloader targets on 868 MHz: one strong, one weak.
    [base + "20"]: be([2, 0x1f, 0x3a, 0x9c, 0x07, 2, (-58) & 255, 0, 30, 0xa4, 0x00, 0x12, 0x5e, 2, (-91) & 255, 0, 30]),
  };
  const st = { state: 1, confirmed: 0, err: 0, gone: false, listeners: [] };
  window.__fakeProxy = st;
  const statusView = () => be([st.state, 0, 0, 0, 0, ...u32(st.confirmed), st.err, (-61) & 255]);
  const notify = () => { for (const l of st.listeners) l(statusView()); };
  const files = [[FIRMWARE, 436717], ["Heltec_t114_repeater-2026.8.14-lusofw-1b2c3d4.zip", 444120]];
  let fileData = be([0, 0, 0, 0, 0, 0]);
  const read = (uuid) =>
    uuid === base + "42" ? be(new Array(10).fill(0))
    : uuid === base + "41" ? fileData
    : uuid === base + "32" ? statusView()
    : uuid === base + "20" && st.gone ? be([0])
    : values[uuid] ?? be([0]);
  const write = (uuid, b) => {
    if (uuid === base + "40" && b[0] === 1) {
      const f = files[(b[1] << 8) | b[2]];
      fileData = f ? be([1, ...u32(f[1]), ...new TextEncoder().encode(f[0])]) : be([0, 0, 0, 0, 0, 0]);
    }
    if (uuid === base + "30") {
      const cmd = b[0];
      if (cmd === 3) { st.state = 1; st.confirmed = 0; st.err = 0; }
      if (cmd === 1) st.state = 1;
      if (cmd === 2) { setTimeout(() => { st.state = 3; notify(); }, 600); return; }
      if (cmd === 5) { setTimeout(() => { st.state = 1; st.gone = true; notify(); }, 400); return; }
      setTimeout(notify, 50);
    }
    if (uuid === base + "31") setTimeout(() => { st.confirmed += b.length; notify(); }, window.__slow ?? 40);
  };

  // --- Web Bluetooth ---------------------------------------------------------------------------
  const char = (uuid) => ({
    uuid,
    readValue: async () => read(uuid),
    writeValueWithResponse: async (v) => write(uuid, new Uint8Array(v.buffer ?? v)),
    writeValueWithoutResponse: async (v) => write(uuid, new Uint8Array(v.buffer ?? v)),
    startNotifications: async () => {},
    stopNotifications: async () => {},
    addEventListener(_e, l) { if (uuid === base + "32") st.listeners.push(l.__wrap = (value) => l({ target: { value } })); },
    removeEventListener(_e, l) { st.listeners = st.listeners.filter((x) => x !== l.__wrap); },
  });
  const server = { connected: true, getPrimaryService: async () => ({ getCharacteristic: async (u) => char(u) }), disconnect() { this.connected = false; } };
  navigator.bluetooth = { requestDevice: async () => ({ name: "GFSK DFU 7A3C", addEventListener() {}, gatt: { connect: async () => server } }), getAvailability: async () => true };

  // --- GitHub releases + firmware download ---------------------------------------------------
  const asset = (id, name, size) => ({ id, name, size, browser_download_url: `${location.origin}/demo/${name === FIRMWARE ? "firmware.zip" : "missing.zip"}` });
  const releases = [
    { id: 3, tag_name: "2026.9.2", name: "2026.9.2", published_at: "2026-09-02T10:00:00Z", assets: [asset(31, FIRMWARE, FIRMWARE_SIZE), asset(32, "Xiao_nrf52_repeater-2026.9.2-lusofw-6ad664c.zip", 312000)] },
    { id: 2, tag_name: "2026.8.14", name: "2026.8.14", published_at: "2026-08-14T10:00:00Z", assets: [asset(21, "RAK_4631_repeater-2026.8.14-lusofw-1b2c3d4.zip", 301000)] },
  ];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (url.startsWith("https://api.github.com/")) {
      return new Response(JSON.stringify(releases), { headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  };

  // --- Native Capacitor bridge (BluetoothLe + CapacitorHttp) ---------------------------------
  const cap = window.Capacitor;
  if (!cap?.nativePromise) return;
  const hex = (view) => Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), (n) => n.toString(16).padStart(2, "0")).join("");
  const unhex = (s) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));
  const events = new Map(); // eventName -> Map(callbackId -> callback)
  let nextId = 1;
  const emit = (eventName, data) => { for (const cb of events.get(eventName)?.values() ?? []) cb(data); };
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const DEVICE = "AA:BB:CC:7A:3C:01";
  st.listeners.push((view) => emit(`notification|${DEVICE}|${base}00|${base}32`, { value: hex(view) }));
  const ble = {
    async requestLEScan() {
      await sleep(700);
      emit("onScanResult", { device: { deviceId: DEVICE, name: "GFSK DFU 7A3C" }, localName: "GFSK DFU 7A3C", rssi: -54 });
    },
    async connect() { await sleep(600); },
    read: async ({ characteristic }) => ({ value: hex(read(characteristic)) }),
    write: async ({ characteristic, value }) => write(characteristic, unhex(value)),
    writeWithoutResponse: async ({ characteristic, value }) => write(characteristic, unhex(value)),
    readRssi: async () => ({ value: "-54" }),
    isEnabled: async () => ({ value: true }),
  };
  const zipBase64 = async () => {
    const bytes = new Uint8Array(await (await realFetch("/demo/firmware.zip")).arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const nativePromise = cap.nativePromise.bind(cap);
  const nativeCallback = cap.nativeCallback.bind(cap);
  cap.nativePromise = async (plugin, method, options) => {
    if (plugin === "CapacitorHttp" && String(options?.url).includes("/demo/")) {
      return { status: 200, headers: {}, url: options.url, data: await zipBase64() };
    }
    if (plugin !== "BluetoothLe") return nativePromise(plugin, method, options);
    if (method === "removeListener") { events.get(options.eventName)?.delete(options.callbackId); return; }
    return (await ble[method]?.(options ?? {})) ?? {};
  };
  cap.nativeCallback = (plugin, method, options, callback) => {
    if (plugin !== "BluetoothLe") return nativeCallback(plugin, method, options, callback);
    if (method !== "addListener") throw new Error(`fake BluetoothLe.${method} callback not supported`);
    const id = String(nextId++);
    if (!events.has(options.eventName)) events.set(options.eventName, new Map());
    events.get(options.eventName).set(id, callback);
    return id;
  };
})();
