# Traveslation

An installable travel translator that runs entirely on the phone. Once the language packs are downloaded, it needs no connection.

- **Camera**: point at a sign, menu or label. Text is read in the viewfinder and translated to English as you hold the phone up.
- **Listen**: hold the mic. Live mode streams speech through the phone's own recognizer and translates as it goes. Offline mode detects the language (any of 99) and transcribes and translates on the device.
- **Say it**: type English, get the local language (with pinyin for Chinese), show it full screen or play it out loud.

18 languages for Camera, Live listening and Say it: Chinese (Simplified and Traditional), Japanese, Korean, Spanish, French, Italian, Portuguese, German, Dutch, Turkish, Indonesian, Vietnamese, Russian, Greek, Arabic, Hindi, Thai. Each language is one pack of about 120 to 235 MB, downloaded when you pick it. Offline listening is a shared 80 MB pack.

## Install on iPhone

1. Open the site in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open it from the home screen on WiFi. It downloads the Chinese pack and offline listening by itself on first open (about 320 MB). Other languages download when you pick them.

Keep it on the home screen. iOS clears website storage for sites you have not opened in a week, but not for installed apps.

## How it works

| Piece | Engine | Runs |
|---|---|---|
| Reading text from the camera | Tesseract.js 5, one language file per language plus English | on device |
| Translation, both directions | Helsinki-NLP Opus-MT per language (int8 ONNX) via transformers.js | on device |
| Offline speech and language detection | Whisper base (int8 ONNX) via transformers.js | on device |
| Live speech | the phone's built-in speech recognizer | phone / vendor |
| Pinyin | pinyin-pro | on device |

Model files are fetched from Hugging Face on first use and kept in the browser's cache storage. A service worker caches the app shell, OCR data and runtime so the app opens without a connection.

## Adding languages

Add a row to `LANGS` in `app.js` (OCR data name, speech code, Whisper code, model routes), the model ids to `MODELS` in `worker.js` and `MODEL_IDS` in `app.js`, and drop the Tesseract `.traineddata.gz` file into `tessdata/`.
