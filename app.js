/* Pocket Translator — app shell. Everything runs on the phone: OCR (Tesseract), translation and speech (transformers.js in worker.js). */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("pt." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("pt." + k, JSON.stringify(v)); } catch (_) {} }
};
/* Languages: tess = OCR data, speech = phone recognizer code, whisper = Whisper code, mul = en-mul target token, pack = translation route to English */
const LANGS = {
  zh:  { name: "Chinese (Simplified)",  tess: "chi_sim", speech: "zh-CN", whisper: "zh", toEn: "zh-en",      fromEn: "en-zh",      prefix: "",             script: /[\u3400-\u9fff]/ },
  zht: { name: "Chinese (Traditional)", tess: "chi_tra", speech: "zh-TW", whisper: "zh", toEn: "zh-en",      fromEn: "en-mul",     prefix: ">>cmn_Hant<<", script: /[\u3400-\u9fff]/ },
  ja:  { name: "Japanese",   tess: "jpn", speech: "ja-JP", whisper: "ja", toEn: "ja-en",      fromEn: "en-mul",     prefix: ">>jpn<<", script: /[\u3040-\u30ff\u3400-\u9fff]/ },
  ko:  { name: "Korean",     tess: "kor", speech: "ko-KR", whisper: "ko", toEn: "ko-en",      fromEn: "en-mul",     prefix: ">>kor<<", script: /[\uac00-\ud7af]/ },
  es:  { name: "Spanish",    tess: "spa", speech: "es-ES", whisper: "es", toEn: "ROMANCE-en", fromEn: "en-ROMANCE", prefix: ">>es<<",  script: /[A-Za-z\u00c0-\u024f]/ },
  fr:  { name: "French",     tess: "fra", speech: "fr-FR", whisper: "fr", toEn: "ROMANCE-en", fromEn: "en-ROMANCE", prefix: ">>fr<<",  script: /[A-Za-z\u00c0-\u024f]/ },
  it:  { name: "Italian",    tess: "ita", speech: "it-IT", whisper: "it", toEn: "ROMANCE-en", fromEn: "en-ROMANCE", prefix: ">>it<<",  script: /[A-Za-z\u00c0-\u024f]/ },
  pt:  { name: "Portuguese", tess: "por", speech: "pt-BR", whisper: "pt", toEn: "ROMANCE-en", fromEn: "en-ROMANCE", prefix: ">>pt<<",  script: /[A-Za-z\u00c0-\u024f]/ },
  de:  { name: "German",     tess: "deu", speech: "de-DE", whisper: "de", toEn: "de-en",      fromEn: "en-de",      prefix: "",        script: /[A-Za-z\u00c0-\u024f]/ },
  nl:  { name: "Dutch",      tess: "nld", speech: "nl-NL", whisper: "nl", toEn: "nl-en",      fromEn: "en-mul",     prefix: ">>nld<<", script: /[A-Za-z\u00c0-\u024f]/ },
  tr:  { name: "Turkish",    tess: "tur", speech: "tr-TR", whisper: "tr", toEn: "tr-en",      fromEn: "en-mul",     prefix: ">>tur<<", script: /[A-Za-z\u00c0-\u024f\u011f\u0131\u015f]/ },
  id:  { name: "Indonesian", tess: "ind", speech: "id-ID", whisper: "id", toEn: "id-en",      fromEn: "en-id",      prefix: "",        script: /[A-Za-z]/ },
  vi:  { name: "Vietnamese", tess: "vie", speech: "vi-VN", whisper: "vi", toEn: "vi-en",      fromEn: "en-vi",      prefix: "",        script: /[A-Za-z\u00c0-\u024f\u1ea0-\u1ef9]/ },
  ru:  { name: "Russian",    tess: "rus", speech: "ru-RU", whisper: "ru", toEn: "ru-en",      fromEn: "en-mul",     prefix: ">>rus<<", script: /[\u0400-\u04ff]/ },
  el:  { name: "Greek",      tess: "ell", speech: "el-GR", whisper: "el", toEn: "mul-en",     fromEn: "en-mul",     prefix: ">>ell<<", script: /[\u0370-\u03ff]/ },
  ar:  { name: "Arabic",     tess: "ara", speech: "ar-SA", whisper: "ar", toEn: "ar-en",      fromEn: "en-mul",     prefix: ">>ara<<", script: /[\u0600-\u06ff]/ },
  hi:  { name: "Hindi",      tess: "hin", speech: "hi-IN", whisper: "hi", toEn: "hi-en",      fromEn: "en-hi",      prefix: "",        script: /[\u0900-\u097f]/ },
  th:  { name: "Thai",       tess: "tha", speech: "th-TH", whisper: "th", toEn: "th-en",      fromEn: "en-mul",     prefix: ">>tha<<", script: /[\u0e00-\u0e7f]/ },
};
const WHISPER_NAMES = Object.fromEntries(Object.values(LANGS).map(l => [l.whisper, l.name.replace(/ \(.*\)/, "")]));
WHISPER_NAMES.en = "English";
let lang = store.get("lang", "zh"); if (!LANGS[lang]) lang = "zh";
function L() { return LANGS[lang]; }
function fillLangSelects() {
  const opts = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  $("camLang").innerHTML = opts; $("sayLang").innerHTML = opts;
  $("spokenLang").innerHTML = `<option value="auto">Detect language</option>` + opts;
  $("camLang").value = lang; $("sayLang").value = lang; $("spokenLang").value = lang;
}
function setLang(k, from) {
  if (!LANGS[k]) return; const changed = k !== lang; lang = k; store.set("lang", k);
  if (from !== "cam") $("camLang").value = k; if (from !== "say") $("sayLang").value = k; if (from !== "spoken" && $("spokenLang").value !== "auto") $("spokenLang").value = k;
  $("sayBtn").textContent = "Translate to " + L().name.replace(/ \(.*\)/, "");
  if (changed) { restartOcr(); renderPacks(); if (typeof autoStock === "function") autoStock(); }
}
const CJK = /[㐀-鿿豈-﫿]/;
let toastT;
function toast(msg, ms = 2800) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ---------- Worker RPC ---------- */
let worker, seq = 0; const pending = new Map(); const progressHandlers = new Set();
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker("worker.js", { type: "module" });
  worker.onmessage = (ev) => {
    const d = ev.data;
    if (d.type === "progress" || d.type === "loaded") { progressHandlers.forEach(h => h(d)); return; }
    if (d.type === "ready") return;
    const p = pending.get(d.id); if (!p) return; pending.delete(d.id);
    d.ok ? p.resolve(d.result) : p.reject(new Error(d.error));
  };
  worker.onerror = (e) => { console.error(e); toast("The translation engine hit an error. Reload the app."); };
  return worker;
}
function call(msg) { ensureWorker(); return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); worker.postMessage({ id, ...msg }); }); }

/* ---------- Packs ---------- */
/* A language pack = OCR data + its to-English model + its from-English model. "asr" is the shared offline listening model. */
const HF = "https://huggingface.co/";
const MODEL_IDS = { "zh-en": "Xenova/opus-mt-zh-en", "ja-en": "Xenova/opus-mt-ja-en", "ko-en": "Xenova/opus-mt-ko-en", "ROMANCE-en": "Xenova/opus-mt-ROMANCE-en", "de-en": "Xenova/opus-mt-de-en", "nl-en": "Xenova/opus-mt-nl-en", "tr-en": "Xenova/opus-mt-tr-en", "id-en": "Xenova/opus-mt-id-en", "vi-en": "Xenova/opus-mt-vi-en", "ru-en": "Xenova/opus-mt-ru-en", "ar-en": "Xenova/opus-mt-ar-en", "hi-en": "Xenova/opus-mt-hi-en", "th-en": "Xenova/opus-mt-th-en", "mul-en": "Xenova/opus-mt-mul-en", "en-zh": "Xenova/opus-mt-en-zh", "en-ROMANCE": "Xenova/opus-mt-en-ROMANCE", "en-de": "Xenova/opus-mt-en-de", "en-id": "Xenova/opus-mt-en-id", "en-vi": "Xenova/opus-mt-en-vi", "en-hi": "Xenova/opus-mt-en-hi", "en-mul": "Xenova/opus-mt-en-mul", "asr": "onnx-community/whisper-base" };
const probeUrl = m => HF + MODEL_IDS[m] + "/resolve/main/onnx/decoder_model_merged_quantized.onnx";
const packState = {}; // model or ocr:xxx -> no | busy | ok
const stateOf = k => packState[k] || (store.get("pack." + k) ? "ok" : "no");
function partsFor(k) { const l = LANGS[k]; return ["ocr:" + l.tess, l.toEn, l.fromEn]; }
function langPackState(k) { const st = partsFor(k).map(stateOf); return st.every(s => s === "ok") ? "ok" : st.some(s => s === "busy") ? "busy" : "no"; }
async function probePacks() {
  try {
    const names = await caches.keys(); const tc = names.find(n => n.startsWith("transformers"));
    const c = tc ? await caches.open(tc) : null;
    for (const m of Object.keys(MODEL_IDS)) { if (packState[m] === "busy") continue; if (c && await c.match(probeUrl(m))) { packState[m] = "ok"; store.set("pack." + m, true); } else if (!store.get("pack." + m)) packState[m] = "no"; }
  } catch (_) {}
  renderPacks();
}
function sizeFor(k) { const l = LANGS[k]; const n = new Set([l.toEn, l.fromEn]).size; return n * 115 + 3; }
function renderPacks() {
  const list = $("packList");
  const others = Object.keys(LANGS).filter(k => k !== lang && (langPackState(k) !== "no"));
  const rows = [
    ["lang:" + lang, { name: L().name + " pack", desc: "Camera reading, listening and Say it for " + L().name + ". About " + sizeFor(lang) + " MB." }],
    ["asr", { name: "Offline listening", desc: "Understands speech with no signal and detects the language by itself. Shared by every language. About 80 MB." }],
    ...others.map(k => ["lang:" + k, { name: LANGS[k].name + " pack", desc: "About " + sizeFor(k) + " MB." }]),
  ];
  const sig = rows.map(r => r[0]).join(",");
  if (list.dataset.sig !== sig) {
    list.dataset.sig = sig;
    list.innerHTML = rows.map(([k, d]) => `<div class="pack" data-pack="${k}"><span class="n">${esc(d.name)}</span><span class="st"></span><span class="d">${esc(d.desc)}</span><span class="bar"><i></i></span></div>`).join("");
    list.querySelectorAll(".pack").forEach(el => el.addEventListener("click", () => { const k = el.dataset.pack; if (stateFor(k) === "no") loadPack(k).catch(() => {}); }));
  }
  list.querySelectorAll(".pack").forEach(el => {
    const k = el.dataset.pack, st = el.querySelector(".st"), s = stateFor(k);
    st.classList.toggle("ok", s === "ok");
    st.textContent = s === "ok" ? "Ready" : s === "busy" ? "Downloading" : "Tap to download";
    if (s !== "busy") el.querySelector(".bar i").style.width = s === "ok" ? "100%" : "0";
  });
  const cur = stateFor("lang:" + lang), asr = stateFor("asr");
  const all = cur === "ok" && asr === "ok", any = cur === "busy" || asr === "busy";
  const pill = $("packsBtn"); pill.classList.toggle("ready", all); pill.classList.toggle("busy", any);
  $("packsLabel").textContent = all ? "Offline ready" : any ? "Downloading" : "Get packs";
  $("dlAll").textContent = "Download for " + L().name.replace(/ \(.*\)/, "");
  $("dlAll").disabled = all || any;
}
function stateFor(k) { return k.startsWith("lang:") ? langPackState(k.slice(5)) : stateOf(k); }
const progressParts = {};
progressHandlers.add(d => {
  if (d.type === "progress") {
    if (packState[d.pack] !== "ok") packState[d.pack] = "busy";
    progressParts[d.pack] = d.total ? d.loaded / d.total : 0;
    document.querySelectorAll(".pack").forEach(el => {
      const k = el.dataset.pack; const parts = k.startsWith("lang:") ? partsFor(k.slice(5)) : [k];
      if (!parts.includes(d.pack)) return;
      const pct = parts.reduce((s, p) => s + (stateOf(p) === "ok" ? 1 : (progressParts[p] || 0)), 0) / parts.length * 100;
      el.querySelector(".bar i").style.width = pct.toFixed(1) + "%";
    });
    renderPacks();
  }
  if (d.type === "loaded") { packState[d.pack] = "ok"; store.set("pack." + d.pack, true); renderPacks(); }
});
async function loadPart(p) {
  if (stateOf(p) === "ok" && !(p.startsWith("ocr:"))) return;
  packState[p] = "busy"; renderPacks();
  try {
    if (p.startsWith("ocr:")) await getOcrFor(p.slice(4)); else await call({ type: "load", pack: p });
    packState[p] = "ok"; store.set("pack." + p, true);
  } catch (e) { packState[p] = "no"; throw e; } finally { renderPacks(); }
}
async function loadPack(k) {
  const parts = k.startsWith("lang:") ? partsFor(k.slice(5)) : [k];
  try { for (const p of parts) await loadPart(p); }
  catch (e) { console.error(e); toast(navigator.onLine ? "Download failed: " + e.message : "You're offline. Connect to WiFi to download packs.", 4000); throw e; }
}
$("packsBtn").onclick = () => { $("packsModal").classList.add("on"); probePacks(); };
$("closePacks").onclick = () => $("packsModal").classList.remove("on");
$("packsModal").addEventListener("click", e => { if (e.target === $("packsModal")) $("packsModal").classList.remove("on"); });
$("dlAll").onclick = async () => { try { await loadPack("lang:" + lang); await loadPack("asr"); } catch (_) {} };

/* ---------- Translation routing ---------- */
async function toEnglish(texts, langKey) {
  const l = LANGS[langKey] || L();
  if (stateOf(l.toEn) !== "ok" && !navigator.onLine) throw new Error("pack:" + langKey);
  return call({ type: "translate", pack: l.toEn, texts });
}
async function fromEnglish(text, langKey) {
  const l = LANGS[langKey] || L();
  if (stateOf(l.fromEn) !== "ok" && !navigator.onLine) throw new Error("pack:" + langKey);
  const r = await call({ type: "translate", pack: l.fromEn, texts: [text], prefix: l.prefix });
  return r[0] || "";
}
function packErrorText(e) { const m = /^pack:(.+)$/.exec(e.message); return m ? `The ${(LANGS[m[1]] || { name: m[1] }).name} pack isn't downloaded. Connect to WiFi once and open Packs.` : e.message; }

/* ---------- Views ---------- */
let view = "camera";
function showView(v) {
  view = v; store.set("view", v);
  document.querySelectorAll(".view").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  if (v === "camera") startCamera(); else stopCamera();
  if (v !== "listen" && listening) stopListening();
}
document.querySelectorAll(".nav button").forEach(b => b.onclick = () => showView(b.dataset.v));

/* ---------- Camera ---------- */
const video = $("video"), overlay = $("overlay"), camSheet = $("camSheet"), camChip = $("camChip");
let stream = null, facing = store.get("facing", "environment"), camTimer = null, ocrWorker = null, ocrLang = "", ocrBusy = false, frozen = false, lastKey = "";
const work = document.createElement("canvas");
let ocrLoading = null, ocrLoadingLang = "", retiring = [];
function getOcr() { return getOcrFor(L().tess); }
function getOcrFor(want) {
  if (ocrWorker && ocrLang === want) return Promise.resolve(ocrWorker);
  if (ocrLoading && ocrLoadingLang === want) return ocrLoading;
  ocrLoadingLang = want;
  ocrLoading = (ocrLoading || Promise.resolve()).catch(() => {}).then(() => createOcr(want)).finally(() => { if (ocrLoadingLang === want) ocrLoading = null; });
  return ocrLoading;
}
async function createOcr(want) {
  if (ocrWorker && ocrLang === want) return ocrWorker;
  if (ocrWorker) { const old = ocrWorker; ocrWorker = null; if (ocrBusy) retiring.push(old); else old.terminate().catch(() => {}); ocrBusy = false; }
  const pk = "ocr:" + want;
  const w = await Tesseract.createWorker(want === "eng" ? "eng" : want + "+eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
    langPath: "tessdata", gzip: true,
    logger: m => { if (m.status && /loading|initializ/i.test(m.status) && packState[pk] !== "ok") { packState[pk] = "busy"; } }
  });
  await w.setParameters({ preserve_interword_spaces: "1" });
  ocrWorker = w; ocrLang = want; packState[pk] = "ok"; store.set("pack." + pk, true); renderPacks(); lastKey = "";
  if (want !== L().tess) { /* loaded for a pack download, not the current language: let the current one come back on demand */ }
  return w;
}
function restartOcr() { if (view === "camera" && stream) { getOcr().then(() => loopCamera()).catch(() => { camChip.textContent = "Reader not downloaded"; }); } }
async function startCamera() {
  if (stream || !navigator.mediaDevices) return;
  camChip.textContent = "Starting camera";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; await video.play().catch(() => {});
    camChip.textContent = "Point at any text"; camChip.classList.remove("hot");
    frozen = false; $("freezeBtn").classList.remove("on");
    getOcr().then(() => loopCamera()).catch(() => { camChip.textContent = "Reader not downloaded"; toast(navigator.onLine ? "Downloading the camera reader…" : "Connect to WiFi once to download the camera reader for " + L().name + ".", 4000); });
    if (stateOf(L().toEn) !== "ok" && navigator.onLine) loadPart(L().toEn).catch(() => {});
  } catch (e) {
    camChip.textContent = "Camera blocked";
    camSheet.innerHTML = `<div class="empty">Allow camera access for this app in your phone settings, then come back.</div>`;
  }
}
function stopCamera() { clearTimeout(camTimer); camTimer = null; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; } }
function loopCamera() { clearTimeout(camTimer); if (view !== "camera" || !stream) return; camTimer = setTimeout(async () => { await scanFrame(); loopCamera(); }, 350); }
async function scanFrame() {
  if (ocrBusy || frozen || !ocrWorker || video.readyState < 2 || document.hidden) return;
  ocrBusy = true;
  try {
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    const scale = Math.min(1, 1100 / Math.max(vw, vh));
    work.width = Math.round(vw * scale); work.height = Math.round(vh * scale);
    const ctx = work.getContext("2d", { willReadFrequently: true });
    ctx.filter = "grayscale(1) contrast(1.25)"; ctx.drawImage(video, 0, 0, work.width, work.height);
    const myLang = lang, w = ocrWorker;
    const { data } = await Promise.race([w.recognize(work), new Promise((_, rej) => setTimeout(() => rej(new Error("ocr timeout")), 12000))]);
    if (w !== ocrWorker) return;
    const l = LANGS[myLang];
    const lines = (data.lines || []).map(x => ({ text: x.text.replace(/\s+/g, " ").trim(), conf: x.confidence, bbox: x.bbox }))
      .filter(x => x.conf > 45 && x.text.replace(/[^\p{L}\p{N}]/gu, "").length >= 1);
    drawBoxes(lines, work.width, work.height);
    const key = myLang + "|" + lines.map(x => x.text).join("|");
    if (!lines.length) { camChip.textContent = "Point at any text"; camChip.classList.remove("hot"); return; }
    if (key === lastKey) return; lastKey = key;
    const foreign = lines.filter(x => l.script.test(x.text) && !(l.toEn === "zh-en" && !CJK.test(x.text)));
    camChip.textContent = foreign.length ? l.name.replace(/ \(.*\)/, "") + " detected" : "Text found"; camChip.classList.toggle("hot", foreign.length > 0);
    renderLines(lines.map(x => ({ src: x.text, en: foreign.includes(x) ? "…" : x.text })));
    if (!foreign.length) return;
    try {
      const en = await toEnglish(foreign.map(x => l.toEn === "zh-en" ? x.text.replace(/\s+/g, "") : x.text), myLang);
      if (lastKey !== key) return;
      let i = 0; renderLines(lines.map(x => ({ src: x.text, en: foreign.includes(x) ? (en[i++] || "") : x.text })));
    } catch (e) { renderLines(lines.map(x => ({ src: x.text, en: foreign.includes(x) ? packErrorText(e) : x.text }))); }
  } catch (e) { if (!/ocr timeout/.test(e.message)) console.error(e); } finally { ocrBusy = false; while (retiring.length) retiring.pop().terminate().catch(() => {}); }
}
function drawBoxes(lines, w, h) {
  const r = overlay.getBoundingClientRect(); overlay.width = r.width * devicePixelRatio; overlay.height = r.height * devicePixelRatio;
  const ctx = overlay.getContext("2d"); ctx.clearRect(0, 0, overlay.width, overlay.height);
  const s = Math.max(overlay.width / w, overlay.height / h), ox = (overlay.width - w * s) / 2, oy = (overlay.height - h * s) / 2;
  ctx.lineWidth = 2 * devicePixelRatio; ctx.strokeStyle = "rgba(79,227,209,.95)"; ctx.fillStyle = "rgba(79,227,209,.14)";
  for (const l of lines) { const b = l.bbox; const x = ox + b.x0 * s, y = oy + b.y0 * s, bw = (b.x1 - b.x0) * s, bh = (b.y1 - b.y0) * s; ctx.fillRect(x, y, bw, bh); ctx.strokeRect(x, y, bw, bh); }
}
function renderLines(items) {
  camSheet.innerHTML = items.map(it => `<div class="line"><div class="en">${esc(it.en)}</div>${it.en !== it.src ? `<div class="src">${esc(it.src)}</div>` : ""}</div>`).join("");
}
$("flipBtn").onclick = () => { facing = facing === "environment" ? "user" : "environment"; store.set("facing", facing); stopCamera(); startCamera(); };
$("freezeBtn").onclick = () => { frozen = !frozen; $("freezeBtn").classList.toggle("on", frozen); camChip.textContent = frozen ? "Paused" : "Point at any text"; if (frozen) video.pause(); else video.play().catch(() => {}); };
$("camLang").onchange = () => setLang($("camLang").value, "cam");
document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); else if (view === "camera") startCamera(); });

/* ---------- Listen ---------- */
const transcriptEl = $("transcript"), micBtn = $("micBtn"), listenStatus = $("listenStatus"), spokenLang = $("spokenLang");
let listenMode = store.get("listenMode", "live"), listening = false, recog = null, liveEl = null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
spokenLang.onchange = () => { if (spokenLang.value === "auto") store.set("spokenAuto", true); else { store.set("spokenAuto", false); setLang(spokenLang.value, "spoken"); } };
function setListenMode(m) {
  if (m === "live" && !SR) { toast("Live listening isn't available in this browser. Using offline."); m = "offline"; }
  listenMode = m; store.set("listenMode", m);
  document.querySelectorAll("#listenMode button").forEach(b => b.classList.toggle("on", b.dataset.m === m));
  spokenLang.querySelector('option[value="auto"]').hidden = (m === "live");
  if (m === "live" && spokenLang.value === "auto") spokenLang.value = lang;
  if (m === "offline" && store.get("spokenAuto", true)) spokenLang.value = "auto";
  listenStatus.textContent = m === "live" ? "Live: streams words as they're spoken (needs signal). Hold to listen." : "Offline: works with no signal and detects the language. Hold to listen.";
}
document.querySelectorAll("#listenMode button").forEach(b => b.onclick = () => setListenMode(b.dataset.m));
function addUtterance(src, en, live) {
  if (transcriptEl.querySelector(".empty")) transcriptEl.innerHTML = "";
  const d = document.createElement("div"); d.className = "utt" + (live ? " live" : "");
  d.innerHTML = `<div class="en">${esc(en || "…")}</div><div class="src">${esc(src || "")}</div>`;
  transcriptEl.appendChild(d); transcriptEl.scrollTop = transcriptEl.scrollHeight; return d;
}
function updateUtterance(el, src, en, final) { el.querySelector(".en").textContent = en || "…"; el.querySelector(".src").textContent = src || ""; if (final) el.classList.remove("live"); transcriptEl.scrollTop = transcriptEl.scrollHeight; }
async function translateHeard(text, langKey) {
  try { const r = await toEnglish([text], langKey); return r[0] || ""; } catch (e) { return packErrorText(e); }
}
/* Live mode: the phone's speech recognizer streams words as they are spoken. */
let liveDebounce = null, liveText = "";
function startLive() {
  const lk = lang, l = L();
  recog = new SR(); recog.lang = l.speech; recog.continuous = true; recog.interimResults = true; recog.maxAlternatives = 1;
  liveEl = null; liveText = "";
  recog.onresult = (ev) => {
    let interim = "", finals = [];
    for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) finals.push(r[0].transcript); else interim += r[0].transcript; }
    for (const f of finals) {
      const el = liveEl || addUtterance(f, "", true); liveEl = null; liveText = "";
      updateUtterance(el, f, "…", false);
      translateHeard(f.trim(), lk).then(en => updateUtterance(el, f, en, true));
    }
    if (interim.trim()) {
      liveText = interim.trim(); if (!liveEl) liveEl = addUtterance(liveText, "", true); else updateUtterance(liveEl, liveText, liveEl.querySelector(".en").textContent, false);
      clearTimeout(liveDebounce);
      liveDebounce = setTimeout(async () => { const snap = liveText, el = liveEl; if (!el) return; const en = await translateHeard(snap, lk); if (el && liveText === snap) updateUtterance(el, snap, en, false); }, 700);
    }
    listenStatus.textContent = "Listening: " + l.name;
  };
  recog.onerror = (e) => {
    if (e.error === "not-allowed") { listenStatus.textContent = "Microphone blocked. Allow it in your phone settings."; listenStatus.classList.add("err"); stopListening(); }
    else if (e.error === "network") { toast("No signal for live mode. Switching to offline."); stopListening(); setListenMode("offline"); }
    else if (e.error !== "no-speech" && e.error !== "aborted") console.warn(e.error);
  };
  recog.onend = () => { if (listening && listenMode === "live") { try { recog.start(); } catch (_) {} } };
  recog.start();
}
/* Offline mode: capture raw audio and run Whisper on the phone in chunks. */
let audioCtx = null, procNode = null, srcNode = null, micStream = null, chunks = [], chunkLen = 0, asrQueue = Promise.resolve();
const TARGET_SR = 16000;
function downsample(buf, from) {
  if (from === TARGET_SR) return buf;
  const ratio = from / TARGET_SR, n = Math.round(buf.length / ratio), out = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++) { const nxt = Math.round((i + 1) * ratio); let s = 0, c = 0; for (; o < nxt && o < buf.length; o++) { s += buf[o]; c++; } out[i] = c ? s / c : 0; }
  return out;
}
async function startOffline() {
  if (stateOf("asr") !== "ok") {
    if (!navigator.onLine) { listenStatus.textContent = 'The "Offline listening" pack isn\'t downloaded. Connect to WiFi once and open Packs.'; listenStatus.classList.add("err"); stopListening(); return; }
    listenStatus.textContent = "Downloading the offline listening pack…"; loadPack("asr").catch(() => {});
  }
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)(); await audioCtx.resume();
  srcNode = audioCtx.createMediaStreamSource(micStream);
  procNode = audioCtx.createScriptProcessor(4096, 1, 1);
  chunks = []; chunkLen = 0;
  procNode.onaudioprocess = (e) => { const d = downsample(e.inputBuffer.getChannelData(0), audioCtx.sampleRate); chunks.push(new Float32Array(d)); chunkLen += d.length; if (chunkLen >= TARGET_SR * 6) flushChunk(false); };
  srcNode.connect(procNode); procNode.connect(audioCtx.destination);
  listenStatus.textContent = "Listening offline. Speech is processed every few seconds.";
}
function flushChunk(final) {
  if (!chunkLen) return;
  const all = new Float32Array(chunkLen); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  chunks = []; chunkLen = 0;
  const rms = Math.sqrt(all.reduce((s, v) => s + v * v, 0) / all.length); if (rms < 0.004) return;
  const el = addUtterance("", "…", true);
  asrQueue = asrQueue.then(async () => {
    try {
      const forced = spokenLang.value === "auto" ? null : (LANGS[spokenLang.value] || L()).whisper;
      const r = await call({ type: "asr", audio: all, task: "transcribe", language: forced });
      const src = r.text;
      if (!src || /^[\s.,!?。，！？]*$/.test(src)) { el.remove(); return; }
      updateUtterance(el, src, "…", false);
      listenStatus.textContent = (WHISPER_NAMES[r.language] || r.language) + " detected" + (final ? "" : ". Still listening.");
      const en = r.language === "en" ? src : (await call({ type: "asr", audio: all, task: "translate", language: r.language })).text;
      updateUtterance(el, src, en, true);
    } catch (e) { console.error(e); updateUtterance(el, "", "Couldn't process that bit.", true); }
  });
}
function stopOffline() {
  if (procNode) { try { procNode.disconnect(); srcNode.disconnect(); } catch (_) {} }
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (audioCtx) audioCtx.close().catch(() => {});
  flushChunk(true); procNode = srcNode = audioCtx = micStream = null;
}
async function startListening() {
  if (listening) return; listening = true; micBtn.classList.add("on"); listenStatus.classList.remove("err");
  try { if (listenMode === "live") startLive(); else await startOffline(); }
  catch (e) { listening = false; micBtn.classList.remove("on"); listenStatus.textContent = /denied|permission|allowed/i.test(e.message) ? "Microphone blocked. Allow it in your phone settings." : "Couldn't start the microphone: " + e.message; listenStatus.classList.add("err"); }
  if (stateOf(L().toEn) !== "ok" && navigator.onLine) loadPart(L().toEn).catch(() => {});
}
function stopListening() {
  if (!listening) return; listening = false; micBtn.classList.remove("on");
  if (recog) { try { recog.onend = null; recog.stop(); } catch (_) {} recog = null; }
  if (liveEl) { liveEl.classList.remove("live"); liveEl = null; }
  stopOffline();
  if (!listenStatus.classList.contains("err")) listenStatus.textContent = "Hold to listen, or tap once to keep listening";
}
let pressedAt = 0;
micBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); micBtn.setPointerCapture(e.pointerId); pressedAt = Date.now(); if (listening) { stopListening(); pressedAt = 0; return; } startListening(); });
micBtn.addEventListener("pointerup", () => { if (pressedAt && Date.now() - pressedAt > 450) stopListening(); pressedAt = 0; });
micBtn.addEventListener("pointercancel", () => { if (pressedAt) stopListening(); pressedAt = 0; });

/* ---------- Say it ---------- */
const sayText = $("sayText"), sayOut = $("sayOut"), sayStatus = $("sayStatus"), sayActions = $("sayActions");
let lastOut = "", lastOutLang = "zh";
$("sayLang").onchange = () => setLang($("sayLang").value, "say");
$("phrases").addEventListener("click", e => { const b = e.target.closest(".chip2"); if (b) { sayText.value = b.textContent; $("sayBtn").click(); } });
$("sayBtn").onclick = async () => {
  const t = sayText.value.trim(); if (!t) { sayStatus.textContent = "Type something first."; return; }
  const lk = lang, l = L();
  $("sayBtn").disabled = true; sayStatus.classList.remove("err");
  sayStatus.textContent = stateOf(l.fromEn) === "ok" ? "Translating…" : (navigator.onLine ? "Downloading the pack first (one time)…" : "");
  try {
    lastOut = (await fromEnglish(t, lk)).trim(); lastOutLang = lk;
    let py = ""; if (l.toEn === "zh-en") { try { py = window.pinyinPro ? pinyinPro.pinyin(lastOut) : ""; } catch (_) {} }
    sayOut.innerHTML = `<div class="zh">${esc(lastOut)}</div>${py ? `<div class="py">${esc(py)}</div>` : ""}`;
    sayActions.hidden = false; sayStatus.textContent = "";
    $("speakBtn").hidden = !("speechSynthesis" in window);
  } catch (e) { sayStatus.textContent = packErrorText(e); sayStatus.classList.add("err"); }
  finally { $("sayBtn").disabled = false; }
};
$("speakBtn").onclick = () => {
  if (!lastOut || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const code = (LANGS[lastOutLang] || L()).speech;
  const u = new SpeechSynthesisUtterance(lastOut); u.lang = code; u.rate = 0.9;
  const v = speechSynthesis.getVoices().find(v => v.lang.replace("_", "-").toLowerCase().startsWith(code.slice(0, 2).toLowerCase())); if (v) u.voice = v;
  speechSynthesis.speak(u);
  if (!v) sayStatus.textContent = "No " + (LANGS[lastOutLang] || L()).name + " voice on this phone. Show the screen instead.";
};
const fs = $("fullscreenText");
$("bigBtn").onclick = () => { fs.textContent = lastOut; fs.style.display = "flex"; };
fs.onclick = () => { fs.style.display = "none"; };

/* ---------- Boot ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e));
const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
$("installHint").textContent = standalone ? "Installed. Packs stay on this phone as long as the app stays on your home screen."
  : /iPhone|iPad/.test(navigator.userAgent) ? "To install: tap Share in Safari, then \"Add to Home Screen\". Do this before downloading packs so they stay on the phone."
  : "To install: open the browser menu and choose \"Install app\" or \"Add to Home screen\".";
window.addEventListener("online", renderPacks); window.addEventListener("offline", renderPacks);
fillLangSelects(); setLang(lang); setListenMode(listenMode);
/* First open: stock the current language and offline listening by itself, with a progress strip on the main screen. */
const strip = $("strip");
function stripProgress() {
  const parts = [...partsFor(lang), "asr"];
  const pct = parts.reduce((t, p) => t + (stateOf(p) === "ok" ? 1 : (progressParts[p] || 0)), 0) / parts.length * 100;
  $("stripBar").style.width = pct.toFixed(1) + "%"; $("stripPct").textContent = pct.toFixed(0) + "%";
  $("stripLabel").textContent = "Downloading " + L().name.replace(/ \(.*\)/, "") + " pack";
}
progressHandlers.add(d => { if (strip.classList.contains("on")) stripProgress(); });
let stocking = false;
async function autoStock() {
  if (!navigator.onLine || stocking) return;
  stocking = true; try { await autoStockInner(); } finally { stocking = false; }
}
async function autoStockInner() {
  const need = langPackState(lang) !== "ok" || stateOf("asr") !== "ok";
  if (!need) return;
  strip.classList.add("on"); stripProgress();
  try { await loadPack("lang:" + lang); await loadPack("asr"); stripProgress(); $("stripLabel").textContent = "Ready to use offline"; setTimeout(() => strip.classList.remove("on"), 2500); }
  catch (_) { $("stripLabel").textContent = "Download paused. Open Packs to retry."; setTimeout(() => strip.classList.remove("on"), 4000); }
}
probePacks().then(() => {
  showView(store.get("view", "camera"));
  autoStock();
  if (!standalone && !store.get("seenInstall")) { store.set("seenInstall", true); toast(/iPhone|iPad/.test(navigator.userAgent) ? "Tap Share, then Add to Home Screen, to keep this as an app." : "Use your browser menu to install this as an app.", 6000); }
});
})();
