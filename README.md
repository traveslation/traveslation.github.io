# Traveslator

A travel translator that runs entirely on the phone. Point the camera at a menu or sign and English appears over the original text, live. Tap a dish to understand it and add it to an order. Talk with staff in both directions. Everything works in airplane mode once the language pack is on the phone.

Live at https://traveslator.github.io

## What runs where

| Piece | Engine | Where |
|---|---|---|
| Reading text from the camera | Tesseract.js 5 | on device |
| Translation, both directions | Bergamot (Mozilla Firefox Translations models, int8) | on device |
| Offline speech recognition | Whisper base (int8 ONNX) via transformers.js | on device |
| Live speech | the phone's built-in recognizer | phone, needs signal |
| Spoken playback | the phone's built-in voices | on device |
| Dish and sign glossary, scenario phrases | `glossary.js` | on device |

Translation models are served from this site in small parts (`models/<pair>/`), stored in the browser's Cache storage, and loaded into a Web Worker. The first open downloads the current language pack (about 73 MB for Chinese) and shows one progress bar. Other languages download when picked, or all at once from the readiness screen.

## Adding a language pack

Run `prep_models.py <lang>` (see `tools/`) to fetch the Mozilla model for `<lang>-en` and `en-<lang>`, split it into parts and write `manifest.json`. Copy the folders into `models/`. Add the language to `LANGS` in `app.js` and drop its Tesseract data into `tessdata/`.
