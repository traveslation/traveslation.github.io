/* Traveslation. Everything runs on the phone: OCR (Tesseract), translation (Bergamot), offline speech (Whisper). */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("tv." + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem("tv." + k, JSON.stringify(v)); } catch (_) {} }
};
let toastT; const toast = (m, ms = 2800) => { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); };

/* ---------------- Languages ---------------- */
const LANGS = {
  zh:  { name: "Chinese", label: "Chinese 简体", tess: "chi_sim", speech: "zh-CN", whisper: "zh", mt: "zh", script: /[㐀-鿿]/, cjk: true, glossary: true },
  zht: { name: "Chinese (Traditional)", label: "Chinese 繁體", tess: "chi_tra", speech: "zh-TW", whisper: "zh", mt: "zh_hant", script: /[㐀-鿿]/, cjk: true, glossary: true },
  ja:  { name: "Japanese", label: "Japanese 日本語", tess: "jpn", speech: "ja-JP", whisper: "ja", mt: "ja", script: /[぀-ヿ㐀-鿿]/, cjk: true },
  ko:  { name: "Korean", label: "Korean 한국어", tess: "kor", speech: "ko-KR", whisper: "ko", mt: "ko", script: /[가-힯]/, cjk: true },
  es:  { name: "Spanish", label: "Spanish Español", tess: "spa", speech: "es-ES", whisper: "es", mt: "es", script: /[A-Za-zÀ-ɏ]/ },
  fr:  { name: "French", label: "French Français", tess: "fra", speech: "fr-FR", whisper: "fr", mt: "fr", script: /[A-Za-zÀ-ɏ]/ },
  it:  { name: "Italian", label: "Italian Italiano", tess: "ita", speech: "it-IT", whisper: "it", mt: "it", script: /[A-Za-zÀ-ɏ]/ },
  pt:  { name: "Portuguese", label: "Portuguese Português", tess: "por", speech: "pt-BR", whisper: "pt", mt: "pt", script: /[A-Za-zÀ-ɏ]/ },
  de:  { name: "German", label: "German Deutsch", tess: "deu", speech: "de-DE", whisper: "de", mt: "de", script: /[A-Za-zÀ-ɏ]/ },
  nl:  { name: "Dutch", label: "Dutch Nederlands", tess: "nld", speech: "nl-NL", whisper: "nl", mt: "nl", script: /[A-Za-zÀ-ɏ]/ },
  tr:  { name: "Turkish", label: "Turkish Türkçe", tess: "tur", speech: "tr-TR", whisper: "tr", mt: "tr", script: /[A-Za-zÀ-ɏğış]/ },
  id:  { name: "Indonesian", label: "Indonesian", tess: "ind", speech: "id-ID", whisper: "id", mt: "id", script: /[A-Za-z]/ },
  vi:  { name: "Vietnamese", label: "Vietnamese Tiếng Việt", tess: "vie", speech: "vi-VN", whisper: "vi", mt: "vi", script: /[A-Za-zÀ-ɏẠ-ỹ]/ },
  ru:  { name: "Russian", label: "Russian Русский", tess: "rus", speech: "ru-RU", whisper: "ru", mt: "ru", script: /[Ѐ-ӿ]/ },
  el:  { name: "Greek", label: "Greek Ελληνικά", tess: "ell", speech: "el-GR", whisper: "el", mt: "el", script: /[Ͱ-Ͽ]/ },
  ar:  { name: "Arabic", label: "Arabic العربية", tess: "ara", speech: "ar-SA", whisper: "ar", mt: "ar", script: /[؀-ۿ]/ },
  hi:  { name: "Hindi", label: "Hindi हिन्दी", tess: "hin", speech: "hi-IN", whisper: "hi", mt: "hi", script: /[ऀ-ॿ]/ },
  th:  { name: "Thai", label: "Thai ไทย", tess: "tha", speech: "th-TH", whisper: "th", mt: "th", script: /[฀-๿]/ },
};
const PACK_MB = { zh: 73, zht: 74, ja: 74, ko: 75, es: 52, fr: 52, it: 53, pt: 52, de: 51, nl: 52, tr: 30, id: 30, vi: 42, ru: 49, el: 30, ar: 51, hi: 30, th: 51 };
let lang = store.get("lang", "zh"); if (!LANGS[lang]) lang = "zh";
const L = () => LANGS[lang];
const toEnPair = k => (LANGS[k] || L()).mt + "-en", fromEnPair = k => "en-" + (LANGS[k] || L()).mt;
let autoLang = store.get("autoLang", true);
function renderLangSelect() {
  $("lang").innerHTML = `<option value="auto">${autoLang ? "Auto · " + esc(L().label) : "Detect language"}</option>` + Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");
  $("lang").value = autoLang ? "auto" : lang;
}
renderLangSelect();
$("lang").onchange = () => { const v = $("lang").value; if (v === "auto") { autoLang = true; store.set("autoLang", true); renderLangSelect(); toast("Detecting the language from what the camera sees"); } else { autoLang = false; store.set("autoLang", false); setLang(v); renderLangSelect(); } };
function setLang(k) {
  if (!LANGS[k] || k === lang) return; lang = k; store.set("lang", k);
  regions.length = 0; transCache.clear(); restartOcr(); renderSuggestions(); renderLangSelect(); autoStock(); updateReady();
}
/* Language detection from recognized text: script first, then word and letter cues for Latin-script languages. */
const LATIN_CUES = {
  es: { chars: /[ñ¿¡]/g, words: /\b(el|la|los|las|de|del|con|y|pollo|carne|cerdo|arroz|salida|entrada|baños|precio|menú|por favor|gracias)\b/gi },
  fr: { chars: /[èêçœ]/g, words: /\b(le|les|des|du|au|aux|et|avec|poulet|porc|riz|sortie|secours|interdit|fumer|entrée|toilettes|prix|merci|s'il|vous)\b/gi },
  it: { chars: /[àèéìòù]/g, words: /\b(il|lo|gli|di|con|e|pollo|maiale|riso|uscita|entrata|bagno|prezzo|menù|grazie|della|alla)\b/gi },
  pt: { chars: /[ãõç]/g, words: /\b(o|a|os|as|de|do|da|com|e|frango|porco|arroz|saída|entrada|banheiro|preço|obrigado|não)\b/gi },
  de: { chars: /[äöüß]/g, words: /\b(der|die|das|und|mit|hähnchen|schwein|reis|ausgang|eingang|toilette|preis|danke|bitte|nicht)\b/gi },
  nl: { chars: /(ij)/g, words: /\b(de|het|een|en|met|kip|varken|rijst|uitgang|ingang|toilet|prijs|dank|niet|van)\b/gi },
  tr: { chars: /[ışğçöüİ]/g, words: /\b(ve|ile|tavuk|et|pilav|çıkış|giriş|tuvalet|fiyat|teşekkür|lütfen|bir)\b/gi },
  id: { chars: /(ng|ny)/g, words: /\b(dan|dengan|ayam|daging|nasi|keluar|masuk|toilet|harga|terima kasih|tidak|yang)\b/gi },
  vi: { chars: /[đơưăâêôạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g, words: /\b(và|với|gà|thịt|cơm|lối ra|lối vào|nhà vệ sinh|giá|cảm ơn|không)\b/gi },
};
function detectLangFromText(text) {
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0370-\u03ff]/.test(text)) return "el";
  if (/[\u3400-\u9fff]/.test(text)) return lang === "zht" ? "zht" : "zh";
  const latin = text.replace(/[^\p{L}\s']/gu, " ");
  if (latin.replace(/\s/g, "").length < 6) return null;
  let best = null, bestScore = 0, second = 0;
  for (const [k, c] of Object.entries(LATIN_CUES)) { const sc = (latin.match(c.chars) || []).length * 2 + (latin.match(c.words) || []).length * 3; if (sc > bestScore) { second = bestScore; bestScore = sc; best = k; } else if (sc > second) second = sc; }
  return bestScore >= 3 && bestScore > second ? best : null;
}
let detectVotes = { k: null, n: 0 };
function considerAutoLang(lines) {
  if (!autoLang || !lines.length) return;
  const text = lines.map(l => l.text).join(" ");
  const k = detectLangFromText(text); if (!k) return;
  if (k === lang) { detectVotes = { k, n: 0 }; return; }
  detectVotes = detectVotes.k === k ? { k, n: detectVotes.n + 1 } : { k, n: 1 };
  if (detectVotes.n >= 2) { detectVotes = { k, n: 0 }; setHint(LANGS[k].name + " detected", 2200); setLang(k); }
}

/* ---------------- Sheets ---------------- */
const sheetwrap = $("sheetwrap"), sheet = $("sheet");
function openSheet(html, onOpen) { sheet.innerHTML = `<div class="grab"></div><button class="close" id="sheetClose" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` + html; sheetwrap.classList.add("on"); $("sheetClose").onclick = closeSheet; onOpen && onOpen(); }
function closeSheet() { sheetwrap.classList.remove("on"); sheet.innerHTML = ""; }
sheetwrap.addEventListener("click", e => { if (e.target === sheetwrap) closeSheet(); });

/* ---------------- Resources ---------------- */
const res = { ocr: "no", toEn: "no", fromEn: "no", asr: "no" }; // no | busy | ok
const progress = { ocr: 0, toEn: 0, fromEn: 0, asr: 0 };
let ocrWorker = null, ocrLang = "", ocrLoading = null;
async function getOcr(want) {
  want = want || L().tess;
  if (ocrWorker && ocrLang === want) return ocrWorker;
  if (ocrLoading && ocrLoading.lang === want) return ocrLoading.p;
  const p = (async () => {
    if (ocrLoading && ocrLoading.lang !== want) { try { await ocrLoading.p; } catch (_) {} }
    if (ocrWorker) { const old = ocrWorker; ocrWorker = null; old.terminate().catch(() => {}); }
    res.ocr = "busy"; updateReady();
    const w = await Tesseract.createWorker(want + "+eng", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1", langPath: "tessdata", gzip: true,
      logger: m => { if (m.status === "loading language traineddata" && m.progress != null) { progress.ocr = m.progress; stripProgress(); } }
    });
    await w.setParameters({ preserve_interword_spaces: "1" });
    ocrWorker = w; ocrLang = want; res.ocr = "ok"; progress.ocr = 1; store.set("ocr." + want, true); updateReady();
    return w;
  })();
  ocrLoading = { lang: want, p }; try { return await p; } catch (e) { res.ocr = "no"; updateReady(); throw e; } finally { if (ocrLoading && ocrLoading.p === p) ocrLoading = null; }
}
async function loadMT(dir, k) {
  k = k || lang; const pair = dir === "toEn" ? toEnPair(k) : fromEnPair(k);
  if (MT.isLoaded(pair)) { if (k === lang) res[dir] = "ok"; return; }
  if (k === lang) { res[dir] = "busy"; updateReady(); }
  try { await MT.load(pair, p => { if (k === lang) { progress[dir] = p; stripProgress(); } }); if (k === lang) { res[dir] = "ok"; progress[dir] = 1; } }
  catch (e) { if (k === lang) res[dir] = "no"; throw e; } finally { updateReady(); }
}
let asrWorker = null, asrSeq = 0; const asrPending = new Map();
function getAsrWorker() {
  if (asrWorker) return asrWorker;
  asrWorker = new Worker("asr-worker.js", { type: "module" });
  asrWorker.onmessage = ev => { const d = ev.data; if (d.type === "progress") { if (d.total) { progress.asr = d.loaded / d.total; stripProgress(); } return; } if (d.type === "loaded") { res.asr = "ok"; progress.asr = 1; store.set("asr", true); updateReady(); return; } const p = asrPending.get(d.id); if (!p) return; asrPending.delete(d.id); d.ok ? p.resolve(d.result) : p.reject(new Error(d.error)); };
  return asrWorker;
}
function asrCall(msg) { getAsrWorker(); return new Promise((resolve, reject) => { const id = ++asrSeq; asrPending.set(id, { resolve, reject }); asrWorker.postMessage({ id, ...msg }); }); }
async function loadAsr() { if (res.asr === "ok") return; res.asr = "busy"; updateReady(); try { await asrCall({ type: "load" }); res.asr = "ok"; } catch (e) { res.asr = "no"; throw e; } finally { updateReady(); } }

/* First open: stock the current language, with one progress strip. */
const strip = $("strip"); let stocking = false;
function stripProgress() {
  const parts = ["ocr", "toEn", "fromEn", "asr"];
  const pct = parts.reduce((t, p) => t + (res[p] === "ok" ? 1 : progress[p] || 0), 0) / parts.length * 100;
  $("stripBar").style.width = pct.toFixed(1) + "%"; $("stripPct").textContent = pct.toFixed(0) + "%";
}
async function autoStock() {
  if (stocking) return; stocking = true;
  try {
    const need = res.ocr !== "ok" || res.toEn !== "ok" || res.fromEn !== "ok" || res.asr !== "ok";
    if (!need) return;
    const offline = !navigator.onLine;
    strip.classList.add("on"); $("stripLabel").textContent = "Getting " + L().name + " ready"; stripProgress();
    try {
      await Promise.all([getOcr().catch(e => { if (!offline) throw e; }), loadMT("toEn").catch(e => { if (!offline) throw e; }), loadMT("fromEn").catch(e => { if (!offline) throw e; })]);
      loadAsr().catch(() => {});
      $("stripLabel").textContent = res.toEn === "ok" ? "Ready to use offline" : "Connect to WiFi once to finish setup"; stripProgress();
      setTimeout(() => strip.classList.remove("on"), 2500);
    } catch (e) { console.error(e); $("stripLabel").textContent = "Setup paused: " + (navigator.onLine ? e.message : "no connection"); setTimeout(() => strip.classList.remove("on"), 4500); }
  } finally { stocking = false; updateReady(); }
}
function updateReady() {
  const pill = $("readyBtn"), lbl = $("readyLabel");
  const core = res.ocr === "ok" && res.toEn === "ok" && res.fromEn === "ok";
  const busy = Object.values(res).includes("busy");
  pill.classList.toggle("warn", !core && !busy); pill.classList.toggle("busy", busy);
  lbl.textContent = core ? "Ready offline" : busy ? "Setting up" : "Not ready";
}

/* ---------------- Translation helpers ---------------- */
const transCache = new Map();
const G = window.GLOSSARY || { signs: {}, dishes: {}, phrases: {} };
function glossaryLookup(text) {
  if (!L().glossary) return null;
  const t = text.replace(/\s+/g, "");
  if (G.dishes[t]) return { en: G.dishes[t].en, dish: G.dishes[t], key: t };
  if (G.signs[t]) return { en: G.signs[t] };
  // longest dish key contained in the text (menus often add a size or a marker)
  let best = null; for (const k of Object.keys(G.dishes)) if (k.length >= 3 && t.includes(k) && (!best || k.length > best.length)) best = k;
  if (best) return { en: G.dishes[best].en, dish: G.dishes[best], key: best, partial: true };
  return null;
}
async function toEnglish(texts) {
  const out = texts.map(t => transCache.get(t) ?? null), need = [];
  texts.forEach((t, i) => { if (out[i] == null) { const g = glossaryLookup(t); if (g) { out[i] = g.en; transCache.set(t, g.en); } else need.push(i); } });
  if (need.length) {
    const src = need.map(i => L().cjk ? texts[i].replace(/\s+(?=[㐀-鿿])|(?<=[㐀-鿿])\s+/g, "") : texts[i]);
    const r = await MT.translate(L().mt, "en", src);
    need.forEach((i, k) => { const v = tidy(r[k]); out[i] = v; transCache.set(texts[i], v); });
  }
  return out;
}
async function fromEnglish(text) {
  const hit = (G.phrases && Object.values(G.phrases).flat().find(p => Array.isArray(p) && p[0].toLowerCase() === text.trim().toLowerCase()));
  if (hit && L().glossary) return hit[1];
  const r = await MT.translate("en", L().mt, [text]); return r[0];
}
function tidy(s) { return String(s || "").replace(/^\s*[-–—]\s*/, "").replace(/\s+/g, " ").trim(); }
function parsePrice(text) {
  const m = /(?:¥|￥|RMB|人民币|\$|€|£|₩|฿|₫|₹)\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:元|块|yuan|RMB|¥|￥|€|\$)/i.exec(text);
  if (m) { const num = m[1] || m[2]; const unit = /每人|每位|\/位|\/人|per person/i.test(text) ? "per person" : /每份|\/份|per serving/i.test(text) ? "per serving" : ""; return { value: num.replace(",", "."), display: "¥" + num.replace(",", "."), unit, certain: true, raw: m[0] }; }
  if (camMode === "menu") { const t = /(?:^|\s)(\d{1,4})\s*$/.exec(text); if (t) return { value: t[1], display: "¥" + t[1], unit: "", certain: false, raw: t[1] }; }
  return null;
}

/* ---------------- Camera pipeline ---------------- */
const video = $("video"), overlay = $("overlay"), stage = $("stage"), hint = $("hint");
let stream = null, frozen = false, camMode = store.get("camMode", "text"), ocrBusy = false, ocrTimer = null, raf = null;
const regions = []; let regionSeq = 0; window.__regions = regions; window.__state = () => ({ ocr: !!ocrWorker, rs: video.readyState, busy: ocrBusy, res: { ...res }, stream: !!stream, timer: !!ocrTimer, view });
const work = document.createElement("canvas"); const thumbA = document.createElement("canvas"), thumbB = document.createElement("canvas");
const TW = 48, TH = 27; let prevThumb = null, motionAcc = { x: 0, y: 0 };
function setHint(t, ms = 2000) { hint.textContent = t; hint.classList.toggle("on", !!t); clearTimeout(setHint.t); if (t && ms) setHint.t = setTimeout(() => hint.classList.remove("on"), ms); }
async function startCamera() {
  if (stream || !navigator.mediaDevices) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; await video.play().catch(() => {});
    frozen = false; $("freezeBtn").classList.remove("on");
    getOcr().then(() => loopOcr()).catch(() => setHint("Camera reader isn't ready yet", 3000));
    if (!raf) renderLoop();
  } catch (e) { setHint("Allow camera access in Settings, then come back", 0); }
}
function stopCamera() { clearTimeout(ocrTimer); ocrTimer = null; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; } if (raf) { cancelAnimationFrame(raf); raf = null; } }
function restartOcr() { if (view === "camera" && stream) getOcr().then(() => loopOcr()).catch(() => {}); }
function loopOcr() { clearTimeout(ocrTimer); if (view !== "camera" || !stream) return; ocrTimer = setTimeout(async () => { await scanFrame(); loopOcr(); }, 120); }
$("freezeBtn").onclick = () => { frozen = !frozen; $("freezeBtn").classList.toggle("on", frozen); if (frozen) video.pause(); else video.play().catch(() => {}); $("liveLabel").textContent = frozen ? "Paused" : "Live translation"; $("liveChip").classList.toggle("off", frozen); };
$("modeMenu").onclick = () => { camMode = camMode === "menu" ? "text" : "menu"; menuAutoOff = camMode === "text"; store.set("camMode", camMode); $("modeMenu").classList.toggle("on", camMode === "menu"); regions.forEach(r => { r.pending = true; }); setHint(camMode === "menu" ? "Menu mode: tap a dish to explore and order" : "Text mode: English replaces the text in view", 1800); };
$("modeMenu").classList.toggle("on", camMode === "menu");

function textSim(a, b) {
  if (a === b) return 1; const la = a.length, lb = b.length; if (!la || !lb) return 0;
  // bigram overlap (characters), fast and script-agnostic
  const grams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  if (la < 2 || lb < 2) return a[0] === b[0] ? 0.6 : 0;
  const ga = grams(a), gb = grams(b); let inter = 0; for (const [g, n] of ga) if (gb.has(g)) inter += Math.min(n, gb.get(g));
  return 2 * inter / ((la - 1) + (lb - 1));
}
const norm = s => s.replace(/\s+/g, " ").replace(/(?<=[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af])\s+(?=[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af¥￥\d])/g, "").trim();
async function scanFrame() {
  if (ocrBusy || frozen || !ocrWorker || video.readyState < 2 || document.hidden) return;
  ocrBusy = true;
  try {
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    const scale = Math.min(1, 1100 / Math.max(vw, vh));
    work.width = Math.round(vw * scale); work.height = Math.round(vh * scale);
    const ctx = work.getContext("2d", { willReadFrequently: true });
    ctx.filter = "grayscale(1) contrast(1.2)"; ctx.drawImage(video, 0, 0, work.width, work.height);
    const myLang = lang, w = ocrWorker, motionBefore = { ...motionAcc };
    const { data } = await Promise.race([w.recognize(work), new Promise((_, rej) => setTimeout(() => rej(new Error("ocr timeout")), 9000))]);
    if (w !== ocrWorker || myLang !== lang) return;
    const l = L();
    const lines = (data.lines || []).map(x => ({ raw: x.text.replace(/\s+/g, " ").trim(), conf: x.confidence, b: x.bbox }))
      .filter(x => x.conf > 50 && x.raw.replace(/[^\p{L}\p{N}]/gu, "").length >= 1 && (autoLang || l.script.test(x.raw) || /[A-Za-z]{2,}|\d/.test(x.raw)))
      .map(x => ({ text: norm(x.raw.replace(/[|_~^`]+/g, "")), conf: x.conf, box: { x: x.b.x0 / work.width, y: x.b.y0 / work.height, w: (x.b.x1 - x.b.x0) / work.width, h: (x.b.y1 - x.b.y0) / work.height } }))
      .filter(x => x.text.length >= 1 && x.box.w > 0.02 && x.box.h > 0.012);
    // motion that happened while OCR ran: shift the fresh boxes forward so they line up with the current view
    const dx = motionAcc.x - motionBefore.x, dy = motionAcc.y - motionBefore.y; lines.forEach(x => { x.box.x += dx; x.box.y += dy; });
    matchRegions(lines);
    autoMenu();
    considerAutoLang(lines);
    const small = (data.lines || []).filter(x => x.confidence > 30 && x.confidence <= 50).length;
    if (!lines.length) setHint(small ? "Move closer or hold steady" : "", small ? 1500 : 0);
    await translatePending();
  } catch (e) { if (!/ocr timeout/.test(e.message)) console.error(e); } finally { ocrBusy = false; }
}
let menuAutoOff = false;
function autoMenu() {
  if (camMode === "menu" || menuAutoOff) return;
  const dishy = regions.filter(r => r.seen >= 2 && (parsePriceAny(r.text) || (r.meta && r.meta.dish))).length;
  if (dishy >= 2) { camMode = "menu"; store.set("camMode", "menu"); $("modeMenu").classList.add("on"); regions.forEach(r => { r.pending = true; }); setHint("Looks like a menu. Tap a dish to explore and order", 2600); }
}
function parsePriceAny(text) { return /(?:¥|￥|RMB|\$|€|£|₩|฿|₫|₹)\s*\d|\d+(?:[.,]\d{1,2})?\s*(?:元|块|yuan|RMB)/i.test(text); }
function matchRegions(lines) {
  const now = performance.now(); const used = new Set();
  for (const r of regions) {
    let best = null, bestScore = 0;
    lines.forEach((ln, i) => {
      if (used.has(i)) return;
      const sim = textSim(r.text, ln.text); if (sim < 0.55) return;
      const dcx = Math.abs((r.box.x + r.box.w / 2) - (ln.box.x + ln.box.w / 2)), dcy = Math.abs((r.box.y + r.box.h / 2) - (ln.box.y + ln.box.h / 2));
      if (dcx > 0.35 || dcy > 0.25) return;
      const score = sim * 2 - (dcx + dcy); if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best != null) {
      const ln = lines[best]; used.add(best);
      const k = 0.55; r.box = { x: r.box.x + (ln.box.x - r.box.x) * k, y: r.box.y + (ln.box.y - r.box.y) * k, w: r.box.w + (ln.box.w - r.box.w) * k, h: r.box.h + (ln.box.h - r.box.h) * k };
      r.seen++; r.miss = 0; r.lastSeen = now;
      if (ln.text !== r.text && ln.conf > r.conf + 6 && !r.edited) { r.text = ln.text; r.conf = ln.conf; r.en = null; r.pending = true; r.meta = null; }
      else if (ln.conf > r.conf) r.conf = ln.conf;
    } else { r.miss++; }
  }
  lines.forEach((ln, i) => { if (!used.has(i)) regions.push({ id: ++regionSeq, text: ln.text, conf: ln.conf, box: ln.box, seen: 1, miss: 0, lastSeen: now, created: now, en: null, pending: true, alpha: 0 }); });
  for (let i = regions.length - 1; i >= 0; i--) { const r = regions[i]; if (r.miss >= 2 || (r.seen < 2 && r.miss >= 1)) regions.splice(i, 1); }
}
async function translatePending() {
  const todo = regions.filter(r => r.pending && !r.inflight); if (!todo.length) return;
  todo.forEach(r => r.inflight = true);
  try {
    const srcs = todo.map(r => { const p = parsePrice(r.text); r.price = p; return p ? r.text.replace(p.raw, "").replace(/[:：\-–—·]+\s*$/, "").trim() || r.text : r.text; });
    const ens = await toEnglish(srcs.map(s => s || " "));
    todo.forEach((r, i) => { r.srcName = srcs[i]; r.en = ens[i] || r.text; r.meta = glossaryLookup(srcs[i]); r.pending = false; r.inflight = false; });
  } catch (e) { todo.forEach(r => { r.inflight = false; }); if (!navigator.onLine && res.toEn !== "ok") setHint("Connect to WiFi once to finish the " + L().name + " pack", 3000); }
}
/* Global motion estimate between frames so overlays follow a pan until the next recognition lands. */
function estimateMotion() {
  if (!video.videoWidth || frozen) return;
  thumbB.width = TW; thumbB.height = TH; const c = thumbB.getContext("2d", { willReadFrequently: true }); c.drawImage(video, 0, 0, TW, TH);
  const cur = c.getImageData(0, 0, TW, TH).data;
  if (prevThumb) {
    const R = 3; let best = { dx: 0, dy: 0, sad: Infinity }, zero = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      let sad = 0, n = 0;
      for (let y = R; y < TH - R; y += 1) for (let x = R; x < TW - R; x += 1) { const i = ((y * TW) + x) * 4, j = (((y + dy) * TW) + (x + dx)) * 4; sad += Math.abs(cur[i] - prevThumb[j]); n++; }
      sad /= n; if (dx === 0 && dy === 0) zero = sad; if (sad < best.sad) best = { dx, dy, sad };
    }
    if ((best.dx || best.dy) && best.sad < zero * 0.8) { const mx = best.dx / TW, my = best.dy / TH; motionAcc.x += mx; motionAcc.y += my; regions.forEach(r => { r.box.x += mx; r.box.y += my; }); }
  }
  prevThumb = cur;
}
/* Overlay renderer */
let lastMotion = 0;
function renderLoop() {
  raf = requestAnimationFrame(renderLoop);
  const now = performance.now();
  if (now - lastMotion > 45) { lastMotion = now; try { estimateMotion(); } catch (_) {} }
  const r = overlay.getBoundingClientRect(); const W = Math.round(r.width * devicePixelRatio), H = Math.round(r.height * devicePixelRatio);
  if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
  const ctx = overlay.getContext("2d"); ctx.clearRect(0, 0, W, H);
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9; const s = Math.max(W / vw, H / vh), ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
  const toPx = b => ({ x: ox + b.x * vw * s, y: oy + b.y * vh * s, w: b.w * vw * s, h: b.h * vh * s });
  const dpr = devicePixelRatio;
  for (const rg of regions) {
    const target = rg.en ? 1 : 0; rg.alpha += (target - rg.alpha) * 0.25; if (rg.alpha < 0.03) continue;
    const b = toPx(rg.box); rg.px = drawCard(ctx, b, rg, dpr, W);
  }
}
function drawCard(ctx, b, rg, dpr, W) {
  if (camMode !== "menu") return drawLabel(ctx, b, rg, dpr, W);
  const pad = 10 * dpr, isMenu = true;
  const title = rg.en || "", sub = rg.srcName && rg.srcName !== rg.en ? rg.srcName + (isMenu ? " · Tap to explore" : "") : (isMenu ? "Tap to explore" : "");
  let fs = Math.max(13 * dpr, Math.min(22 * dpr, b.h * 0.62));
  ctx.font = `600 ${fs}px ${getComputedStyle(document.body).getPropertyValue("--display")}`;
  const priceTxt = rg.price ? rg.price.display : "";
  const maxW = Math.min(W - 2 * pad, Math.max(b.w + 2 * pad, 150 * dpr));
  let tw = ctx.measureText(title).width; const pw = priceTxt ? ctx.measureText(priceTxt).width + 14 * dpr : 0;
  while (tw + pw + 2 * pad > maxW && fs > 11 * dpr) { fs -= dpr; ctx.font = `600 ${fs}px ${getComputedStyle(document.body).getPropertyValue("--display")}`; tw = ctx.measureText(title).width; }
  const showSub = !!sub && b.h > 24 * dpr; const subFs = Math.max(10 * dpr, fs * 0.6);
  const cw = Math.max(Math.min(maxW, tw + pw + 2 * pad), isMenu ? Math.min(W - 2 * pad, b.w + 2 * pad) : 0);
  const ch = fs * 1.25 + (showSub ? subFs * 1.3 : 0) + 2 * pad * 0.8;
  let x = b.x - pad * 0.5, y = b.y + b.h / 2 - ch / 2; x = Math.max(pad * 0.5, Math.min(x, W - cw - pad * 0.5));
  ctx.globalAlpha = rg.alpha * 0.96;
  ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = 10 * dpr; ctx.shadowOffsetY = 2 * dpr;
  ctx.fillStyle = "#FBF9F2"; roundRect(ctx, x, y, cw, ch, 10 * dpr); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#14201B"; ctx.textBaseline = "top";
  ctx.font = `600 ${fs}px ${getComputedStyle(document.body).getPropertyValue("--display")}`;
  ctx.fillText(title, x + pad, y + pad * 0.8, cw - 2 * pad - pw);
  if (priceTxt) { ctx.textAlign = "right"; ctx.fillText(priceTxt + (isMenu ? " +" : ""), x + cw - pad, y + pad * 0.8); ctx.textAlign = "left"; }
  if (showSub) { ctx.fillStyle = "#6B746E"; ctx.font = `400 ${subFs}px ${getComputedStyle(document.body).getPropertyValue("--cjk")}`; ctx.fillText(sub, x + pad, y + pad * 0.8 + fs * 1.25, cw - 2 * pad); }
  ctx.globalAlpha = 1;
  return { x, y, w: cw, h: ch };
}
/* Text mode: a flat label that replaces the original text in place. */
function drawLabel(ctx, b, rg, dpr, W) {
  const title = rg.en || ""; if (!title) return null;
  const padX = 6 * dpr, padY = 3 * dpr, font = getComputedStyle(document.body).getPropertyValue("--display");
  let fs = Math.max(11 * dpr, Math.min(26 * dpr, b.h * 0.72));
  ctx.font = `600 ${fs}px ${font}`; let tw = ctx.measureText(title).width;
  const maxW = W - 2 * padX;
  while (tw + 2 * padX > Math.max(b.w * 1.6, 120 * dpr) && fs > 10 * dpr) { fs -= dpr; ctx.font = `600 ${fs}px ${font}`; tw = ctx.measureText(title).width; }
  const cw = Math.min(maxW, Math.max(b.w, tw + 2 * padX)), ch = Math.max(b.h, fs * 1.2 + 2 * padY);
  let x = b.x + b.w / 2 - cw / 2, y = b.y + b.h / 2 - ch / 2; x = Math.max(padX, Math.min(x, W - cw - padX));
  ctx.globalAlpha = rg.alpha * 0.97;
  ctx.shadowColor = "rgba(0,0,0,.12)"; ctx.shadowBlur = 6 * dpr; ctx.shadowOffsetY = 1 * dpr;
  ctx.fillStyle = "#FBF9F2"; roundRect(ctx, x, y, cw, ch, 6 * dpr); ctx.fill(); ctx.shadowColor = "transparent";
  ctx.fillStyle = "#14201B"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(title, x + cw / 2, y + ch / 2, cw - 2 * padX); ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.globalAlpha = 1;
  return { x, y, w: cw, h: ch };
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
overlay.addEventListener("pointerdown", e => {
  const r = overlay.getBoundingClientRect(); const x = (e.clientX - r.left) * devicePixelRatio, y = (e.clientY - r.top) * devicePixelRatio;
  const hit = [...regions].reverse().find(rg => rg.px && x >= rg.px.x && x <= rg.px.x + rg.px.w && y >= rg.px.y && y <= rg.px.y + rg.px.h);
  if (hit) openRegion(hit); else if (regions.length === 0) setHint("Point at text to translate it", 1500);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); else if (view === "camera") startCamera(); });

/* Region detail sheet: evidence stays separate from typical background information. */
function openRegion(rg) {
  const isMenu = camMode === "menu"; const dish = rg.meta && rg.meta.dish; const orig = rg.srcName || rg.text;
  const price = rg.price ? `${rg.price.display}${rg.price.unit ? " " + rg.price.unit : ""}${rg.price.certain ? "" : " (price association uncertain)"}` : "Price not readable";
  openSheet(`
    <div class="eyebrow">${isMenu ? "From the live menu" : "What it says"}</div>
    <h2>${esc(rg.en || "…")}</h2>
    <div class="sub"><span class="cjk">${esc(orig)}</span>${rg.price ? ` · ${esc(rg.price.display)}` : ""}</div>
    <div class="hr"></div>
    ${isMenu ? `
    <div class="kv"><div class="eyebrow">Listed on the menu</div><p>${dish && dish.listed && dish.listed.length ? esc(dish.listed.join(", ")) + " (from the dish name)" : "Only the name is readable here."} · ${esc(price)}</p></div>
    <div class="kv"><div class="eyebrow">Typical preparation</div><p>${dish ? esc(dish.prep) + (dish.spicy ? " Usually spicy." : "") : "No glossary entry for this dish. The translation above is machine-made; ask staff what's in it."}</p></div>
    <div class="kv"><div class="eyebrow">Check with the restaurant</div><p>Typical ingredients only. Ask staff to confirm allergens or substitutions.</p></div>
    <button class="btn ghost" id="askIngr"><svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/></svg>Help me ask about ingredients</button>
    <div class="qty"><span style="font-weight:600">Quantity</span><div class="ctl"><button id="qMinus">−</button><span id="qVal">1</span><button id="qPlus">+</button></div></div>
    <button class="btn" id="addOrder">Add to your order${rg.price ? " · " + esc(rg.price.display) : ""}</button>
    ` : `
    <div class="kv"><div class="eyebrow">Recognized text</div><p class="cjk" style="font-family:var(--cjk)">${esc(rg.text)}</p></div>
    <button class="btn ghost" id="askThis">Ask about this in conversation</button>
    <button class="btn soft" id="savePhrase">Save this phrase</button>
    `}
    <button class="btn ghost" id="editText">Correct the recognized text</button>
  `, () => {
    let q = 1; const qv = $("qVal");
    if (isMenu) {
      $("qMinus").onclick = () => { q = Math.max(1, q - 1); qv.textContent = q; };
      $("qPlus").onclick = () => { q++; qv.textContent = q; };
      $("addOrder").onclick = () => { addToOrder({ zh: orig, en: rg.en, price: rg.price ? rg.price.value : null, priceCertain: !!(rg.price && rg.price.certain), unit: rg.price ? rg.price.unit : "", qty: q }); closeSheet(); toast("Added to your order"); };
      $("askIngr").onclick = () => { closeSheet(); goConversation("restaurant", [["What is in " + rg.en + "?", null, orig], ["Does this contain nuts?", null], ["Is this dish spicy?", "这道菜辣吗？"]]); };
    } else {
      $("askThis").onclick = () => { closeSheet(); goConversation(null, [["What does this mean: " + rg.en + "?", null, orig]]); };
      $("savePhrase").onclick = () => { saveItem("phrases", { en: rg.en, zh: orig }); toast("Saved to Phrases"); };
    }
    $("editText").onclick = () => editRegion(rg);
  });
}
function editRegion(rg) {
  openSheet(`<div class="eyebrow">Correct the text</div><h2>What does it actually say?</h2><textarea id="editTa" style="font-family:var(--cjk)">${esc(rg.text)}</textarea><button class="btn" id="editOk">Translate again</button>`, () => {
    $("editOk").onclick = async () => { const v = $("editTa").value.trim(); if (!v) return; rg.text = norm(v); rg.edited = true; rg.conf = 100; rg.en = null; rg.pending = true; rg.meta = null; closeSheet(); await translatePending(); openRegion(rg); };
  });
}
$("askBtn").onclick = () => {
  const items = regions.filter(r => r.en).slice(0, 8);
  openSheet(`<div class="eyebrow">Ask about what's in view</div><h2>Numbered, so you can point.</h2>
    ${items.length ? `<div class="list">${items.map((r, i) => `<div class="item"><div class="n"><div><b>${i + 1}.</b> ${esc(r.en)}</div><div class="cjk">${esc(r.srcName || r.text)}</div></div><button data-i="${i}">Ask</button></div>`).join("")}</div>` : `<div class="empty">Nothing readable in view yet. Point at the text and try again.</div>`}
    <p class="sub">Each item is a label as read. The app doesn't see what a button or control does; ask staff when it matters.</p>`, () => {
    sheet.querySelectorAll(".item button").forEach(b => b.onclick = () => { const r = items[+b.dataset.i]; closeSheet(); goConversation(null, [["What does this mean: " + r.en + "?", null, r.srcName || r.text], ["Which one is the entrance?", "哪一个是入口？"], ["Is this price per person?", "这个价格是每人的吗？"]]); });
  });
};

/* ---------------- Order ---------------- */
let order = store.get("order", []);
function saveOrder() { store.set("order", order); renderOrderBar(); renderConvCtx(); }
function addToOrder(it) { const ex = order.find(o => o.zh === it.zh); if (ex) ex.qty += it.qty; else order.push({ id: Date.now(), confirmed: false, mods: "", ...it }); saveOrder(); }
function orderSubtotal() { if (!order.length || order.some(o => o.price == null || !o.priceCertain)) return null; return order.reduce((s, o) => s + parseFloat(o.price) * o.qty, 0); }
function renderOrderBar() {
  const n = order.reduce((s, o) => s + o.qty, 0); $("orderbar").classList.toggle("on", n > 0 && view === "camera");
  const sub = orderSubtotal(); $("orderCount").textContent = `Your order · ${n} item${n === 1 ? "" : "s"}` + (sub != null ? ` · ¥${sub % 1 ? sub.toFixed(2) : sub}` : "");
  const badge = document.querySelector('.nav button[data-v="conv"] .badge'); if (badge) badge.remove();
  if (n) { const b = document.createElement("span"); b.className = "badge"; b.textContent = n; document.querySelector('.nav button[data-v="conv"]').prepend(b); }
}
function orderCardText() { return order.map(o => `${o.zh} × ${o.qty}${o.mods ? "（" + o.mods + "）" : ""}`).join("\n"); }
function openOrder() {
  const sub = orderSubtotal();
  openSheet(`<div class="eyebrow">Your order</div><h2>${order.length ? "Ready to show." : "Nothing yet."}</h2>
    <div class="card" id="orderLines">${order.map(o => `<div class="orderline" data-id="${o.id}"><div class="n"><div>${esc(o.en)}</div><div class="cjk">${esc(o.zh)}${o.mods ? " · " + esc(o.mods) : ""}</div></div><div class="ctl row" style="gap:0;border:1px solid var(--line);border-radius:10px"><button class="qm" style="width:36px;height:36px;border:0;background:transparent">−</button><span style="min-width:22px;text-align:center;font-weight:600">${o.qty}</span><button class="qp" style="width:36px;height:36px;border:0;background:transparent">+</button></div><div class="p">${o.price != null ? "¥" + o.price + (o.priceCertain ? "" : "?") : "—"}</div></div>`).join("") || `<div class="empty">Tap a dish in the camera view to add it.</div>`}</div>
    <p class="sub">${sub != null ? `Estimated subtotal ¥${sub % 1 ? sub.toFixed(2) : sub}. Service charges, tea or rice may be extra.` : order.length ? "Subtotal shown only when every price is readable and certain." : ""}</p>
    ${order.length ? `<button class="btn" id="showCard">Show order card to staff</button><button class="btn ghost" id="toConv">Talk to staff about it</button><button class="btn soft" id="saveMeal">Save this meal</button><button class="link" id="clearOrder">Clear order</button>` : ""}`, () => {
    sheet.querySelectorAll(".orderline").forEach(el => { const o = order.find(x => x.id == el.dataset.id); el.querySelector(".qm").onclick = () => { o.qty--; if (o.qty <= 0) order = order.filter(x => x !== o); saveOrder(); openOrder(); }; el.querySelector(".qp").onclick = () => { o.qty++; saveOrder(); openOrder(); }; });
    if (!order.length) return;
    $("showCard").onclick = showOrderCard;
    $("toConv").onclick = () => { closeSheet(); goConversation("restaurant"); };
    $("saveMeal").onclick = () => { saveItem("orders", { title: order.map(o => o.en).join(", "), items: order.map(o => ({ ...o })), date: new Date().toISOString() }); toast("Meal saved"); };
    $("clearOrder").onclick = () => { order = []; saveOrder(); closeSheet(); };
  });
}
function showOrderCard() {
  openSheet(`<div class="eyebrow">Order card · 点菜单</div>
    <div class="bigcard"><div class="zh">${order.map(o => `${esc(o.zh)} <span style="color:var(--green)">× ${o.qty}</span>${o.mods ? `<div style="font-size:60%;color:var(--muted)">${esc(o.mods)}</div>` : ""}`).join("<br>")}</div><div class="en">${order.map(o => `${esc(o.en)} × ${o.qty}`).join(" · ")}</div></div>
    <p class="sub">Hand the phone over. Prices are as read from the menu; staff confirm the total.</p>
    <button class="btn ghost" id="speakOrder">Play it out loud</button>`, () => { $("speakOrder").onclick = () => speak(order.map(o => `${o.zh}，${numZh(o.qty)}份`).join("。")); });
}
const numZh = n => ["零", "一", "两", "三", "四", "五", "六", "七", "八", "九", "十"][n] || String(n);
$("orderView").onclick = openOrder;

/* ---------------- Conversation ---------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let scenario = store.get("scenario", "restaurant"), turns = [], shortTurns = false, listening = null;
const SCEN = { restaurant: "Restaurant", hotel: "Hotel", transport: "Transport", shopping: "Shopping", directions: "Directions" };
$("scenario").innerHTML = Object.entries(SCEN).map(([k, v]) => `<button data-s="${k}" class="${k === scenario ? "on" : ""}">${v}</button>`).join("");
$("scenario").querySelectorAll("button").forEach(b => b.onclick = () => { scenario = b.dataset.s; store.set("scenario", scenario); $("scenario").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); pinned = null; renderSuggestions(); renderConvCtx(); });
let pinned = null;
function goConversation(scen, suggestions) { if (scen) { scenario = scen; store.set("scenario", scen); $("scenario").querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.s === scen)); } pinned = suggestions || null; showView("conv"); renderSuggestions(); renderConvCtx(); }
function renderConvCtx() {
  const n = order.reduce((s, o) => s + o.qty, 0); const ctx = $("convCtx"); ctx.hidden = !(n && scenario === "restaurant");
  $("convCtxD").textContent = `${n} selected item${n === 1 ? "" : "s"} · Confirm with staff`; $("convEyebrow").textContent = SCEN[scenario] + " conversation";
  ctx.onclick = openOrder;
}
function renderSuggestions() {
  const box = $("sugg"); const list = [];
  if (pinned) list.push(...pinned);
  else {
    if (scenario === "restaurant" && order.length) list.push(["I'd like to order: " + order.map(o => `${o.en} × ${o.qty}`).join(", ") + ".", "我想点：" + orderCardText().replace(/\n/g, "，") + "。"]);
    const last = [...turns].reverse().find(t => t.who === "them");
    if (last && /米饭|rice/i.test(last.src + " " + last.tr)) list.push(["Yes, two bowls of rice, please.", "好的，请来两碗米饭。"]);
    if (last && /辣|spicy/i.test(last.src + " " + last.tr)) list.push(["A little spicy is fine.", "微辣就可以。"]);
    (G.phrases[scenario] || []).slice(0, 6).forEach(p => { if (list.length < 3 && !list.find(x => x[0] === p[0])) list.push(p); });
  }
  box.innerHTML = list.slice(0, 3).map((p, i) => `<button data-i="${i}"><svg viewBox="0 0 24 24"><path d="M4 5h16v10H9l-5 4z"/></svg><span>${esc(p[0])}</span></button>`).join("");
  box.querySelectorAll("button").forEach(b => b.onclick = () => sayEnglish(list[+b.dataset.i][0], list[+b.dataset.i][1], list[+b.dataset.i][2]));
}
function addTurn(t) { turns.push(t); renderTurns(); return t; }
function renderTurns() {
  const box = $("turns");
  box.innerHTML = turns.map((t, i) => `<div class="turn ${t.who === "me" ? "me" : ""} ${t.live ? "live" : ""}" data-i="${i}">
    <div class="who">${t.who === "me" ? "You · English" : "Staff · " + esc(L().name)}</div>
    ${t.who === "me" ? `<div class="tr">${esc(t.src)}</div><div class="src">${esc(t.tr || "…")}</div>` : `<div class="src">${esc(t.src || "…")}</div><div class="tr">${esc(t.tr || "…")}</div>`}
    ${t.live ? "" : `<div class="acts"><button data-a="play">Play</button><button data-a="edit">Edit</button>${t.who === "them" ? `<button data-a="repeat">Ask to repeat</button>` : `<button data-a="save">Save</button>`}</div>`}
  </div>`).join("") || `<div class="empty">Tap Speak English to talk, or Listen when they reply.</div>`;
  box.querySelectorAll(".turn .acts button").forEach(b => b.onclick = () => { const t = turns[+b.closest(".turn").dataset.i]; const a = b.dataset.a;
    if (a === "play") speak(t.who === "me" ? t.tr : t.src);
    if (a === "edit") editTurn(t);
    if (a === "repeat") sayEnglish("Please repeat slowly.", "请慢一点再说一遍。");
    if (a === "save") { saveItem("phrases", { en: t.src, zh: t.tr }); toast("Saved to Phrases"); }
  });
  $("convCol").scrollTop = $("convCol").scrollHeight;
}
function editTurn(t) {
  openSheet(`<div class="eyebrow">Correct the ${t.who === "me" ? "English" : "transcript"}</div><h2>What was actually said?</h2><textarea id="editTa" ${t.who === "them" ? 'style="font-family:var(--cjk)"' : ""}>${esc(t.src)}</textarea><button class="btn" id="editOk">Translate again</button>`, () => {
    $("editOk").onclick = async () => { const v = $("editTa").value.trim(); if (!v) return; t.src = v; t.edited = true; t.tr = "…"; renderTurns(); closeSheet();
      try { t.tr = t.who === "me" ? await fromEnglish(v) : (await toEnglish([v]))[0]; } catch (e) { t.tr = "(translation unavailable offline)"; } renderTurns(); renderSuggestions(); };
  });
}
async function sayEnglish(text, zhKnown, extraZh) {
  const t = addTurn({ who: "me", src: text, tr: zhKnown || "", live: !zhKnown });
  if (!zhKnown) { try { t.tr = await fromEnglish(text); } catch (e) { t.tr = "(translation unavailable offline)"; } }
  if (extraZh && !t.tr.includes(extraZh)) t.tr = t.tr.replace(/[?？。]$/, "") + "：" + extraZh;
  t.live = false; renderTurns(); speak(t.tr); pinned = null; renderSuggestions();
}
$("typedSend").onclick = () => { const v = $("typedText").value.trim(); if (!v) return; $("typedText").value = ""; sayEnglish(v); };
$("typedText").addEventListener("keydown", e => { if (e.key === "Enter") $("typedSend").click(); });
function speak(text) {
  if (!text || !window.speechSynthesis) { $("convStatus").textContent = "Spoken playback isn't available here. Show the screen instead."; return; }
  speechSynthesis.cancel(); const code = L().speech; const u = new SpeechSynthesisUtterance(text); u.lang = code; u.rate = 0.9;
  const v = speechSynthesis.getVoices().find(v => v.lang.replace("_", "-").toLowerCase().startsWith(code.slice(0, 2).toLowerCase())); if (v) u.voice = v;
  speechSynthesis.speak(u); if (!v) $("convStatus").textContent = `No ${L().name} voice on this phone. Show the screen instead.`;
}
/* Speak English: your side. Live recognizer in English, then translate. */
let recog = null;
function stopRecog() { if (recog) { try { recog.onend = null; recog.stop(); } catch (_) {} recog = null; } listening = null; $("speakBtn").classList.remove("on"); $("listenBtn").classList.remove("on"); stopOfflineCapture(); }
function startRecog(code, who) {
  if (!SR) { if (who === "them") return startOfflineCapture(); $("convStatus").textContent = "Speech input isn't available in this browser. Type instead."; return; }
  stopRecog(); listening = who; (who === "me" ? $("speakBtn") : $("listenBtn")).classList.add("on");
  recog = new SR(); recog.lang = code; recog.continuous = who === "them" && !shortTurns; recog.interimResults = true;
  let liveT = null;
  recog.onresult = async ev => {
    let interim = "", finals = [];
    for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) finals.push(r[0].transcript.trim()); else interim += r[0].transcript; }
    if (interim.trim()) { if (!liveT) liveT = addTurn({ who, src: interim.trim(), tr: "", live: true }); else { liveT.src = interim.trim(); renderTurns(); } }
    for (const f of finals) {
      if (!f) continue; const t = liveT || addTurn({ who, src: f, tr: "", live: true }); liveT = null; t.src = f;
      if (who === "me") { stopRecog(); try { t.tr = await fromEnglish(f); } catch (e) { t.tr = "(translation unavailable offline)"; } t.live = false; renderTurns(); speak(t.tr); }
      else { try { t.tr = (await toEnglish([f]))[0]; } catch (e) { t.tr = "(translation unavailable offline)"; } t.live = false; renderTurns(); if (shortTurns) stopRecog(); }
      renderSuggestions();
    }
  };
  recog.onerror = e => { if (e.error === "not-allowed") { $("convStatus").textContent = "Microphone blocked. Allow it in Settings."; stopRecog(); } else if (e.error === "network") { $("convStatus").textContent = "No signal for live speech. Switching to offline listening."; stopRecog(); if (who === "them") startOfflineCapture(); } else if (e.error !== "no-speech" && e.error !== "aborted") console.warn(e.error); };
  recog.onend = () => { if (listening === who && recog && recog.continuous) { try { recog.start(); } catch (_) {} } else if (listening === who) stopRecog(); };
  recog.start(); $("convStatus").textContent = who === "me" ? "Listening to you…" : "Listening to them…";
}
$("speakBtn").onclick = () => listening === "me" ? stopRecog() : startRecog("en-US", "me");
$("listenBtn").onclick = () => listening === "them" ? stopRecog() : startRecog(L().speech, "them");
/* Offline capture → Whisper */
let audioCtx = null, procNode = null, srcNode = null, micStream = null, chunks = [], chunkLen = 0, asrQueue = Promise.resolve();
function downsample(buf, from) { if (from === 16000) return buf; const ratio = from / 16000, n = Math.round(buf.length / ratio), out = new Float32Array(n); for (let i = 0, o = 0; i < n; i++) { const nxt = Math.round((i + 1) * ratio); let s = 0, c = 0; for (; o < nxt && o < buf.length; o++) { s += buf[o]; c++; } out[i] = c ? s / c : 0; } return out; }
async function startOfflineCapture() {
  if (res.asr !== "ok") { $("convStatus").textContent = navigator.onLine ? "Getting offline listening ready…" : "Offline listening pack isn't downloaded yet."; if (navigator.onLine) loadAsr().catch(() => {}); if (!navigator.onLine) return; }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)(); await audioCtx.resume();
    srcNode = audioCtx.createMediaStreamSource(micStream); procNode = audioCtx.createScriptProcessor(4096, 1, 1); chunks = []; chunkLen = 0;
    procNode.onaudioprocess = e => { const d = downsample(e.inputBuffer.getChannelData(0), audioCtx.sampleRate); chunks.push(new Float32Array(d)); chunkLen += d.length; if (chunkLen >= 16000 * 6) flushChunk(); };
    srcNode.connect(procNode); procNode.connect(audioCtx.destination);
    listening = "them"; $("listenBtn").classList.add("on"); $("convStatus").textContent = "Listening offline. Speech is processed every few seconds.";
  } catch (e) { $("convStatus").textContent = "Microphone blocked. Allow it in Settings."; }
}
function flushChunk() {
  if (!chunkLen) return; const all = new Float32Array(chunkLen); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; } chunks = []; chunkLen = 0;
  const rms = Math.sqrt(all.reduce((s, v) => s + v * v, 0) / all.length); if (rms < 0.004) return;
  const t = addTurn({ who: "them", src: "", tr: "", live: true });
  asrQueue = asrQueue.then(async () => { try { const r = await asrCall({ type: "asr", audio: all, task: "transcribe", language: autoLang ? null : L().whisper }); if (autoLang && r.language && r.language !== L().whisper) { const k = Object.keys(LANGS).find(x => LANGS[x].whisper === r.language); if (k) { setHint(LANGS[k].name + " detected", 2000); setLang(k); } } if (!r.text) { turns = turns.filter(x => x !== t); renderTurns(); return; } t.src = r.text; renderTurns(); t.tr = (await toEnglish([r.text]))[0]; t.live = false; renderTurns(); renderSuggestions(); } catch (e) { t.src = ""; t.tr = "Couldn't process that bit."; t.live = false; renderTurns(); } });
}
function stopOfflineCapture() { if (procNode) { try { procNode.disconnect(); srcNode.disconnect(); } catch (_) {} } if (micStream) micStream.getTracks().forEach(x => x.stop()); if (audioCtx) audioCtx.close().catch(() => {}); if (chunkLen) flushChunk(); procNode = srcNode = audioCtx = micStream = null; }
/* Confirm details and rescue */
$("confirmBtn").onclick = () => {
  const prices = turns.filter(t => t.who === "them").flatMap(t => (t.src.match(/\d+(?:\.\d+)?\s*(?:元|块)|[¥￥]\s*\d+(?:\.\d+)?/g) || []));
  const sub = orderSubtotal();
  const rows = [];
  if (order.length) rows.push(["Order · 点的菜", order.map(o => `${o.en} × ${o.qty}`).join(", "), orderCardText().replace(/\n/g, "，")]);
  if (sub != null) rows.push(["Menu subtotal · 菜单小计", `¥${sub}`, `${sub}元`]);
  prices.forEach(p => rows.push(["Price mentioned · 提到的价格", p, p]));
  openSheet(`<div class="eyebrow">Confirm the details · 确认一下</div><h2>Let's check before we finish.</h2>
    ${rows.length ? `<div class="bigcard">${rows.map(r => `<div style="margin-bottom:12px"><div class="eyebrow" style="font-family:var(--body)">${esc(r[0])}</div><div class="zh" style="font-size:clamp(20px,5.5vw,28px)">${esc(r[2])}</div><div class="en">${esc(r[1])}</div></div>`).join("")}</div>` : `<div class="empty">Nothing to confirm yet. Order dishes or have a conversation first.</div>`}
    <p class="sub">States: ${order.length ? "order items are <b>proposed</b> until staff confirm" : ""}${prices.length ? " · mentioned prices are <b>mentioned</b>, not agreed" : ""}. Silence isn't a yes.</p>
    <button class="btn" id="askTotal">Ask: Is that the total price?</button>
    <button class="btn ghost" id="markOk">Staff confirmed · 已确认</button>`, () => {
    $("askTotal").onclick = () => { closeSheet(); sayEnglish("Is that the total price?", "这是总价吗？"); };
    $("markOk").onclick = () => { order.forEach(o => o.confirmed = true); saveOrder(); closeSheet(); toast("Marked as confirmed by staff"); };
  });
};
$("rescueBtn").onclick = () => {
  shortTurns = true; stopRecog(); const r = G.phrases.reset; addTurn({ who: "me", src: r[0], tr: r[1] }); speak(r[1]);
  pinned = G.phrases.clarify.slice(0, 3); renderSuggestions(); $("convStatus").textContent = "Short turns on: one sentence at a time. Type numbers and names when you can.";
};

/* ---------------- Saved ---------------- */
let savedTab = "places";
function saveItem(kind, it) { const all = store.get("saved." + kind, []); all.unshift({ id: Date.now(), ...it }); store.set("saved." + kind, all); if (view === "saved") renderSaved(); }
$("savedTabs").querySelectorAll("button").forEach(b => b.onclick = () => { savedTab = b.dataset.t; $("savedTabs").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); renderSaved(); });
function renderSaved() {
  const all = store.get("saved." + savedTab, []); const box = $("savedList");
  if (!all.length) { box.innerHTML = `<div class="empty">${savedTab === "places" ? "Save your hotel and the places you'll go, in the local script, so you can show a driver." : savedTab === "phrases" ? "Phrases you save from conversations and the camera show here." : "Meals you save from your order show here."}</div>`; return; }
  box.innerHTML = all.map(it => `<div class="item" data-id="${it.id}"><div class="n"><div>${esc(it.title || it.en || it.name)}</div><div class="cjk">${esc(it.zh || it.address || (it.items ? it.items.map(o => o.zh + "×" + o.qty).join("，") : ""))}</div></div><button data-a="show">Show</button><button data-a="del" style="background:transparent;color:var(--muted)">✕</button></div>`).join("");
  box.querySelectorAll(".item").forEach(el => { const it = all.find(x => x.id == el.dataset.id);
    el.querySelector('[data-a="del"]').onclick = () => { store.set("saved." + savedTab, all.filter(x => x !== it)); renderSaved(); };
    el.querySelector('[data-a="show"]').onclick = () => {
      if (savedTab === "orders") { order = it.items.map(o => ({ ...o })); saveOrder(); showOrderCard(); return; }
      const zh = it.zh || it.address || "";
      openSheet(`<div class="eyebrow">${esc(it.title || it.en || it.name)}</div><div class="bigcard"><div class="zh">${esc(zh)}</div><div class="en">${esc(it.en || it.name || "")}</div></div><button class="btn ghost" id="sp">Play it out loud</button>`, () => { $("sp").onclick = () => speak(zh); });
    };
  });
}
$("savedAdd").onclick = () => {
  openSheet(`<div class="eyebrow">Save for the trip</div><h2>A place or a phrase.</h2>
    <div class="seg" id="addKind"><button data-k="place" class="on">Place</button><button data-k="phrase">Phrase</button></div>
    <input type="text" id="addName" placeholder="Name (e.g. Hotel)">
    <textarea id="addZh" placeholder="Address or text in the local script (paste from a booking)" style="font-family:var(--cjk)"></textarea>
    <button class="btn ghost" id="addTranslate">Translate my English into ${esc(L().name)}</button>
    <button class="btn" id="addOk">Save</button>`, () => {
    let kind = "place"; $("addKind").querySelectorAll("button").forEach(b => b.onclick = () => { kind = b.dataset.k; $("addKind").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); $("addZh").placeholder = kind === "place" ? "Address in the local script (paste from a booking)" : "The phrase in the local script, or leave empty and translate"; });
    $("addTranslate").onclick = async () => { const n = $("addName").value.trim(); if (!n) return; $("addTranslate").disabled = true; try { $("addZh").value = await fromEnglish(n); } catch (e) { toast("Translation isn't ready offline yet"); } $("addTranslate").disabled = false; };
    $("addOk").onclick = () => { const n = $("addName").value.trim(), z = $("addZh").value.trim(); if (!n && !z) return; if (kind === "place") saveItem("places", { name: n, address: z }); else saveItem("phrases", { en: n, zh: z }); closeSheet(); savedTab = kind === "place" ? "places" : "phrases"; $("savedTabs").querySelectorAll("button").forEach(x => x.classList.toggle("on", x.dataset.t === savedTab)); renderSaved(); };
  });
};

/* ---------------- Readiness & packs ---------------- */
$("readyBtn").onclick = openReadiness;
async function openReadiness() {
  const voice = !!(window.speechSynthesis && speechSynthesis.getVoices().find(v => v.lang.replace("_", "-").toLowerCase().startsWith(L().speech.slice(0, 2).toLowerCase())));
  const rows = [["Live camera translation", "cam"], [`English ↔ ${L().name} translation`, "mt"], ["Speech recognition", "sr"], ["Spoken translations", "tts"], ["Saved places and phrases", "saved"]];
  const otherLangs = Object.keys(LANGS).filter(k => k !== lang);
  openSheet(`<div class="eyebrow">Trip preparation</div><h2>Ready for ${esc(L().name === "Chinese" ? "China" : L().name)}</h2><p class="sub">Each check runs the real engine, not just a file check.</p>
    <div class="ready" id="readyRows">${rows.map(r => `<div><span>${esc(r[0])}</span><span class="st" id="rc-${r[1]}">Checking…</span></div>`).join("")}</div>
    <div class="card" id="readyNote"><div class="t">Checking…</div><div class="d"></div></div>
    <button class="btn" id="readyRun">Run the checks again</button>
    <div class="hr"></div>
    <div class="eyebrow">Other languages</div>
    <div class="packs" id="packs">${otherLangs.map(k => `<div class="pack" data-k="${k}"><span class="n">${esc(LANGS[k].label)}</span><span class="st">…</span><span class="d">Camera, conversation and phrases. About ${PACK_MB[k]} MB.</span><span class="bar"><i></i></span></div>`).join("")}</div>
    <button class="btn ghost" id="dlAll">Download every language (about ${Object.values(PACK_MB).reduce((a, b) => a + b, 0)} MB)</button>`, async () => {
    $("readyRun").onclick = () => { autoStock(); runChecks(); };
    runChecks();
    const packEls = sheet.querySelectorAll(".pack");
    for (const el of packEls) { const k = el.dataset.k; const ok = (await MT.isCached(toEnPair(k))) && (await MT.isCached(fromEnPair(k))) && store.get("ocr." + LANGS[k].tess); const st = el.querySelector(".st"); st.textContent = ok ? "Ready" : "Tap to download"; st.classList.toggle("ok", !!ok); if (ok) el.querySelector(".bar i").style.width = "100%"; el.onclick = () => { if (!ok) downloadLang(k, el); }; }
    $("dlAll").onclick = async () => { for (const el of packEls) { if (!el.querySelector(".st").classList.contains("ok")) await downloadLang(el.dataset.k, el).catch(() => {}); } };
  });
  async function runChecks() {
    const set = (id, txt, cls) => { const e = $("rc-" + id); if (!e) return; e.textContent = txt; e.className = "st " + (cls || ""); };
    // camera reader: recognise a rendered sample
    try { const w = await getOcr(); const c = document.createElement("canvas"); c.width = 320; c.height = 80; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 320, 80); x.fillStyle = "#000"; x.font = `bold 44px ${getComputedStyle(document.body).getPropertyValue("--cjk")}`; x.fillText(L().cjk ? "出口 EXIT" : "EXIT 24", 20, 58); const r = await w.recognize(c); set("cam", /\S/.test(r.data.text) ? "Ready offline" : "Reader loaded, test unclear", "ok"); } catch (e) { set("cam", "Needs download", "no"); }
    try { const a = await MT.translate(L().mt, "en", [L().cjk ? "出口" : "hola"]); const b = await MT.translate("en", L().mt, ["Thank you"]); set("mt", a[0] && b[0] ? "Ready offline" : "Incomplete", a[0] && b[0] ? "ok" : "no"); } catch (e) { set("mt", "Needs download", "no"); }
    set("sr", res.asr === "ok" ? "Ready offline" : SR ? "Live only (needs signal)" : "Typed input only", res.asr === "ok" ? "ok" : "");
    set("tts", voice ? "Ready" : "Voice required", voice ? "ok" : "no");
    try { localStorage.setItem("tv.__t", "1"); localStorage.removeItem("tv.__t"); set("saved", "Ready offline", "ok"); } catch (e) { set("saved", "Storage blocked", "no"); }
    const all = ["cam", "mt", "saved"].every(id => $("rc-" + id) && $("rc-" + id).classList.contains("ok"));
    const note = $("readyNote"); if (!note) return;
    note.querySelector(".t").textContent = all ? "You can go offline." : "Not ready yet.";
    note.querySelector(".d").textContent = all ? "Downloaded language resources are ready." + (voice ? "" : ` For spoken playback, add a ${L().name} voice in Settings › Accessibility › Spoken Content › Voices.`) : navigator.onLine ? "Setup is still running or failed. Tap Run the checks again." : "Connect to WiFi once to finish downloading.";
  }
  async function downloadLang(k, el) {
    const st = el.querySelector(".st"), bar = el.querySelector(".bar i"); st.textContent = "Downloading"; let p1 = 0, p2 = 0, p3 = 0; const upd = () => bar.style.width = ((p1 + p2 + p3) / 3 * 100).toFixed(0) + "%";
    try {
      await MT.load(toEnPair(k), p => { p1 = p; upd(); }); await MT.unload(toEnPair(k)); p1 = 1;
      await MT.load(fromEnPair(k), p => { p2 = p; upd(); }); await MT.unload(fromEnPair(k)); p2 = 1;
      const r = await fetch("tessdata/" + LANGS[k].tess + ".traineddata.gz"); if (!r.ok) throw new Error("reader data"); await r.arrayBuffer(); store.set("ocr." + LANGS[k].tess, true); p3 = 1; upd();
      st.textContent = "Ready"; st.classList.add("ok"); el.onclick = null;
    } catch (e) { st.textContent = "Failed, tap to retry"; toast(navigator.onLine ? "Download failed: " + e.message : "You're offline."); throw e; }
  }
}

/* ---------------- Views & boot ---------------- */
let view = "camera";
function showView(v) {
  view = v; store.set("view", v);
  document.querySelectorAll(".view").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  if (v === "camera") startCamera(); else stopCamera();
  if (v !== "conv") stopRecog();
  if (v === "saved") renderSaved();
  if (v === "conv") { renderSuggestions(); renderConvCtx(); renderTurns(); }
  renderOrderBar();
}
document.querySelectorAll(".nav button").forEach(b => b.onclick = () => showView(b.dataset.v));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e));
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};
MT.on(ev => { if (ev.type === "loaded") { if (ev.pair === toEnPair()) res.toEn = "ok"; if (ev.pair === fromEnPair()) res.fromEn = "ok"; updateReady(); } });
(async () => {
  if (store.get("asr")) { /* cached before; mark ready lazily when the worker confirms */ }
  renderOrderBar(); updateReady();
  showView(store.get("view", "camera"));
  autoStock();
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!standalone && !store.get("seenInstall")) { store.set("seenInstall", true); setTimeout(() => toast(/iPhone|iPad/.test(navigator.userAgent) ? "Tap Share, then Add to Home Screen, to keep this as an app." : "Use your browser menu to install this as an app.", 6000), 1500); }
})();
})();
