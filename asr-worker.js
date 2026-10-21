// Offline speech recognition (Whisper) in a worker, via transformers.js. Used when the phone's live recognizer is unavailable or has no signal.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";
env.allowLocalModels = false; env.useBrowserCache = true; env.backends.onnx.wasm.numThreads = 1;
const ID = "onnx-community/whisper-base";
let pipeP = null; const files = {};
function progress(p) {
  if (!p || !p.file) return;
  if (p.status === "progress") files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
  if (p.status === "done") files[p.file] = { loaded: files[p.file]?.total || 1, total: files[p.file]?.total || 1 };
  let loaded = 0, total = 0; for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
  self.postMessage({ type: "progress", loaded, total });
}
function load() { return pipeP || (pipeP = pipeline("automatic-speech-recognition", ID, { dtype: { encoder_model: "q8", decoder_model_merged: "q8" }, progress_callback: progress }).then(p => { self.postMessage({ type: "loaded" }); return p; }).catch(e => { pipeP = null; throw e; })); }
async function detectLanguage(p, audio) {
  const feats = await p.processor(audio); const gc = p.model.generation_config;
  const out = await p.model.generate({ inputs: feats.input_features, decoder_input_ids: [[gc.decoder_start_token_id]], max_new_tokens: 1 });
  const ids = typeof out.tolist === "function" ? out.tolist()[0] : Array.from(out.data); const tok = Number(ids[ids.length - 1]);
  const hit = Object.entries(gc.lang_to_id || {}).find(([, v]) => Number(v) === tok); return hit ? hit[0].replace(/[<|>]/g, "") : null;
}
async function asr(audio, task, language) {
  const p = await load(); let lang = language || null;
  if (!lang) { try { lang = await detectLanguage(p, audio); } catch (e) { console.warn(e); } }
  const out = await p(audio, { task: task || "transcribe", chunk_length_s: 30, stride_length_s: 5, return_timestamps: false, language: lang || "en" });
  return { text: (out && out.text ? out.text : "").trim(), language: lang || "en" };
}
self.onmessage = async (ev) => {
  const { id, type } = ev.data;
  try {
    let result;
    if (type === "load") { await load(); result = true; }
    else if (type === "asr") result = await asr(ev.data.audio, ev.data.task, ev.data.language);
    else throw new Error("unknown " + type);
    self.postMessage({ id, ok: true, result });
  } catch (e) { self.postMessage({ id, ok: false, error: (e && e.message) || String(e) }); }
};
