/* Offline translation engine: Bergamot (Mozilla Firefox Translations) running in a Web Worker.
   Models are served from this site in small parts, stored in Cache storage, and loaded once per session. */
window.MT = (() => {
  const MODELS_BASE = (window.MODELS_BASE || "models/");
  const CACHE = "tv-models-v1";
  let worker = null, seq = 0; const pending = new Map();
  const loaded = new Set(); const loading = new Map();
  const listeners = new Set();

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker("vendor/bergamot/translator-worker.js");
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.error ? p.reject(new Error(e.data.error.message || "translation error")) : p.resolve(e.data.result); };
    worker.onerror = (e) => console.error("MT worker", e);
    return worker;
  }
  function call(name, args, transfer) { ensureWorker(); return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); worker.postMessage({ id, name, args }, transfer || []); }); }
  let initP = null;
  function init() { return initP || (initP = call("initialize", [{ cacheSize: 2000 }])); }

  async function cacheOpen() { try { return await caches.open(CACHE); } catch (_) { return null; } }
  async function fetchPart(url, c) {
    if (c) { const hit = await c.match(url); if (hit) return hit.arrayBuffer(); }
    let r, lastErr;
    for (let attempt = 0; attempt < 3; attempt++) { try { r = await fetch(url, { cache: "no-store" }); if (r.ok) break; lastErr = new Error("Download failed: " + url.split("/").pop()); } catch (e) { lastErr = e; } r = null; await new Promise(res => setTimeout(res, 600 * (attempt + 1))); }
    if (!r) throw lastErr || new Error("Download failed");
    const buf = await r.arrayBuffer();
    if (c) { try { await c.put(url, new Response(buf, { headers: { "Content-Type": "application/octet-stream" } })); } catch (e) { console.warn("cache put", e); } }
    return buf;
  }
  async function gunzip(buf) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser can't unpack language files. Update iOS or use a newer browser.");
    const ds = new DecompressionStream("gzip"); const w = ds.writable.getWriter(); w.write(new Uint8Array(buf)); w.close();
    return new Response(ds.readable).arrayBuffer();
  }
  function emit(ev) { listeners.forEach(l => { try { l(ev); } catch (_) {} }); }

  /* Download a pair's files (progress events), or return them from cache. */
  async function fetchPair(pair, onProgress) {
    const base = MODELS_BASE + pair + "/";
    const c = await cacheOpen();
    const manifest = await (await fetch(base + "manifest.json", { cache: "no-store" }).catch(() => c && c.match(base + "manifest.json"))).json();
    if (c) { try { await c.put(base + "manifest.json", new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } })); } catch (_) {} }
    const entries = Object.entries(manifest.files);
    const total = entries.reduce((s, [, f]) => s + f.size, 0); let done = 0;
    // every part of every file at once, a few at a time
    const jobs = []; for (const [role, f] of entries) f.parts.forEach((p, i) => jobs.push({ role, i, url: base + p }));
    const results = {}; let next = 0;
    async function lane() { while (next < jobs.length) { const j = jobs[next++]; const b = await fetchPart(j.url, c); (results[j.role] ||= [])[j.i] = b; done += b.byteLength; onProgress && onProgress(done / total); } }
    await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, lane));
    const out = {};
    for (const [role, f] of entries) {
      const parts = results[role] || []; const joined = new Uint8Array(f.size); let o = 0; for (const p of parts) { joined.set(new Uint8Array(p), o); o += p.byteLength; }
      if (o !== f.size) throw new Error("Language file is incomplete: " + f.name);
      out[role] = await gunzip(joined.buffer);
    }
    return { manifest, buffers: out };
  }
  async function isCached(pair) {
    const c = await cacheOpen(); if (!c) return false;
    const base = MODELS_BASE + pair + "/";
    const m = await c.match(base + "manifest.json"); if (!m) return false;
    const manifest = await m.json();
    for (const f of Object.values(manifest.files)) for (const p of f.parts) if (!(await c.match(base + p))) return false;
    return true;
  }
  async function load(pair, onProgress) {
    if (loaded.has(pair)) return;
    if (loading.has(pair)) return loading.get(pair);
    const p = (async () => {
      await init();
      const { buffers } = await fetchPair(pair, onProgress);
      const [from, to] = pair.split("-");
      const vocabs = buffers.vocab ? [buffers.vocab] : [buffers.srcVocab, buffers.trgVocab];
      await call("loadTranslationModel", [{ from, to }, { model: buffers.model, shortlist: buffers.lexicalShortlist, vocabs }], [buffers.model, buffers.lexicalShortlist, ...vocabs]);
      loaded.add(pair); emit({ type: "loaded", pair });
    })();
    loading.set(pair, p);
    try { await p; } finally { loading.delete(pair); }
  }
  async function translate(from, to, texts) {
    const pair = from + "-" + to;
    if (!loaded.has(pair)) await load(pair);
    const clean = texts.map(t => String(t || "").trim());
    const idx = clean.map((t, i) => t ? i : -1).filter(i => i >= 0);
    if (!idx.length) return clean.map(() => "");
    const res = await call("translate", [{ models: [{ from, to }], texts: idx.map(i => ({ text: clean[i], html: false })) }]);
    const out = clean.map(() => ""); idx.forEach((i, k) => { out[i] = (res[k].target.text || "").trim(); });
    return out;
  }
  async function prefetch(pair, onProgress) { await fetchPair(pair, onProgress); }
  async function unload(pair) { if (!loaded.has(pair)) return; const [from, to] = pair.split("-"); await call("freeTranslationModel", [{ from, to }]); loaded.delete(pair); }
  async function removeCached(pair) { const c = await cacheOpen(); if (!c) return; const base = MODELS_BASE + pair + "/"; for (const r of await c.keys()) if (r.url.includes(base)) await c.delete(r); }
  return { load, translate, unload, prefetch, isCached, removeCached, isLoaded: p => loaded.has(p), on: l => listeners.add(l) };
})();
