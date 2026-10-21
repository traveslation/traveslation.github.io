/* Service worker: app shell precached; engines and OCR data cached on first use so the app runs with no connection. */
const VERSION = "pt-v3";
const SHELL = ["./", "./index.html", "./app.js", "./worker.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png",
  "./tessdata/eng.traineddata.gz",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  "https://cdn.jsdelivr.net/npm/pinyin-pro@3.26.0/dist/index.min.js",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js"];
const RUNTIME_HOSTS = ["cdn.jsdelivr.net"]; // tesseract core + ONNX runtime wasm land here on first use
// huggingface.co model files are cached by transformers.js itself (its own Cache storage), so they are left alone here.

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(err => console.warn("precache miss", u, err))));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("pt-") && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname.includes("huggingface.co") || url.hostname.includes("hf.co")) return;
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !RUNTIME_HOSTS.includes(url.hostname)) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(e.request, { ignoreSearch: sameOrigin });
    if (hit) {
      // refresh the app shell in the background when online
      if (sameOrigin && /\.(html|js|webmanifest)$|\/$/.test(url.pathname)) e.waitUntil(fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); }).catch(() => {}));
      return hit;
    }
    try {
      const r = await fetch(e.request);
      if (r.ok && (r.type === "basic" || r.type === "cors")) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      if (e.request.mode === "navigate") return (await c.match("./index.html")) || Response.error();
      throw err;
    }
  })());
});
