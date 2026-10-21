// Model worker: runs translation and speech recognition on the phone with transformers.js (ONNX Runtime, WebAssembly).
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";

env.allowLocalModels = false;
env.useBrowserCache = true;           // models are kept in the browser's Cache storage for offline use
env.backends.onnx.wasm.numThreads = 1; // GitHub Pages cannot send the headers multi-threading needs

const T = (id) => ({ task: "translation", id, opts: { dtype: "q8" } });
const MODELS = {
  // to English
  "zh-en": T("Xenova/opus-mt-zh-en"), "ja-en": T("Xenova/opus-mt-ja-en"), "ko-en": T("Xenova/opus-mt-ko-en"),
  "ROMANCE-en": T("Xenova/opus-mt-ROMANCE-en"), // Spanish, French, Italian, Portuguese
  "de-en": T("Xenova/opus-mt-de-en"), "nl-en": T("Xenova/opus-mt-nl-en"), "tr-en": T("Xenova/opus-mt-tr-en"),
  "id-en": T("Xenova/opus-mt-id-en"), "vi-en": T("Xenova/opus-mt-vi-en"), "ru-en": T("Xenova/opus-mt-ru-en"),
  "ar-en": T("Xenova/opus-mt-ar-en"), "hi-en": T("Xenova/opus-mt-hi-en"), "th-en": T("Xenova/opus-mt-th-en"),
  "mul-en": T("Xenova/opus-mt-mul-en"), // fallback for languages without their own model
  // from English
  "en-zh": T("Xenova/opus-mt-en-zh"), "en-ROMANCE": T("Xenova/opus-mt-en-ROMANCE"), "en-de": T("Xenova/opus-mt-en-de"),
  "en-id": T("Xenova/opus-mt-en-id"), "en-vi": T("Xenova/opus-mt-en-vi"), "en-hi": T("Xenova/opus-mt-en-hi"),
  "en-mul": T("Xenova/opus-mt-en-mul"), // fallback, needs a >>lang<< prefix
  "asr":   { task: "automatic-speech-recognition", id: "onnx-community/whisper-base",
             opts: { dtype: { encoder_model: "q8", decoder_model_merged: "q8" } } },
};
const pipes = {};
const loading = {};

function progressFor(pack) {
  const files = {};
  return (p) => {
    if (!p || !p.file) return;
    if (p.status === "progress") files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
    if (p.status === "done") files[p.file] = { loaded: p.total || files[p.file]?.total || 1, total: p.total || files[p.file]?.total || 1 };
    let loaded = 0, total = 0;
    for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
    self.postMessage({ type: "progress", pack, loaded, total, file: p.file, status: p.status });
  };
}

async function load(pack) {
  if (pipes[pack]) return pipes[pack];
  if (loading[pack]) return loading[pack];
  const m = MODELS[pack];
  if (!m) throw new Error("Unknown pack " + pack);
  loading[pack] = pipeline(m.task, m.id, { ...m.opts, progress_callback: progressFor(pack) })
    .then(p => { pipes[pack] = p; delete loading[pack]; self.postMessage({ type: "loaded", pack }); return p; })
    .catch(e => { delete loading[pack]; throw e; });
  return loading[pack];
}

async function translate(pack, texts, prefix) {
  const t = await load(pack);
  const clean = texts.map(s => String(s || "").trim()).filter(Boolean).map(s => prefix ? prefix + " " + s : s);
  if (!clean.length) return [];
  const longest = Math.max(...clean.map(s => s.length));
  const out = await t(clean, { max_new_tokens: Math.min(200, Math.max(16, longest * 3 + 12)), repetition_penalty: 1.15 });
  return (Array.isArray(out) ? out : [out]).map(o => tidy(o.translation_text || ""));
}
function tidy(s) {
  return s.replace(/^>>[a-z_A-Z]+<<\s*/, "")
    .replace(/([.!?,;:…\-–—?])\1{2,}/g, "$1")      // runs of punctuation
    .replace(/(\b[\w'’]+\b)(?:\s+\1\b){2,}/gi, "$1") // the same word repeated over and over
    .replace(/([.!])\s*\?+\s*$/, "$1")               // a stray ? after a full stop
    .replace(/^\s*[-–—]\s*/, "").trim();
}

// Whisper predicts the language token right after <|startoftranscript|>; one decoder step gives us the detected language.
async function detectLanguage(audio) {
  const p = await load("asr");
  const feats = await p.processor(audio);
  const gc = p.model.generation_config;
  const out = await p.model.generate({ inputs: feats.input_features, decoder_input_ids: [[gc.decoder_start_token_id]], max_new_tokens: 1 });
  const ids = typeof out.tolist === "function" ? out.tolist()[0] : Array.from(out.data);
  const tok = Number(ids[ids.length - 1]);
  const hit = Object.entries(gc.lang_to_id || {}).find(([, v]) => Number(v) === tok);
  return hit ? hit[0].replace(/[<|>]/g, "") : null;
}

async function asr(audio, task, language) {
  const p = await load("asr");
  let lang = language || null;
  if (!lang) { try { lang = await detectLanguage(audio); } catch (e) { console.warn("language detection failed", e); } }
  const opts = { task: task || "transcribe", chunk_length_s: 30, stride_length_s: 5, return_timestamps: false, language: lang || "en" };
  const out = await p(audio, opts);
  return { text: (out && out.text) ? out.text.trim() : "", language: lang || "en" };
}

self.onmessage = async (ev) => {
  const { id, type } = ev.data;
  try {
    let result;
    if (type === "load") result = (await load(ev.data.pack), true);
    else if (type === "translate") result = await translate(ev.data.pack, ev.data.texts, ev.data.prefix);
    else if (type === "asr") result = await asr(ev.data.audio, ev.data.task, ev.data.language);
    else if (type === "has") result = Object.keys(pipes);
    else throw new Error("Unknown message " + type);
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: (e && e.message) || String(e) });
  }
};
self.postMessage({ type: "ready" });
