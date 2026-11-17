# Architecture

## Shape
Electron app (own window) → local Node daemon (HTTP on localhost) → Python venv (Whisper,
face tracking) + ffmpeg/yt-dlp. UI is a Vite web app loaded by Electron; same code runs in
a browser for dev.

```
ui/ (React/Vite)  --HTTP-->  daemon (Node)  --spawn-->  python scripts/*.py
                                    \--spawn--> ffmpeg / yt-dlp
data/  projects/  config.local.json   (local only, gitignored)
```

## Modules (mirror VGP, rename domains)
- `youtube.js` — list owner's channel videos (yt-dlp flat-playlist) + download by URL.
- `sermon.js` — (NEW) detect sermon start/end in a full service video via transcript + Claude.
- `analyze.js` — extractWav, transcribeWav (word timestamps), findSpeakers/fingerprints.
- `clips.js` — propose N clip cuts from transcript (start phrase, summary, end phrase).
- `crop.js` — (NEW) face-track the speaker → per-frame crop x → smooth → ffmpeg crop to 9:16.
- `captions.js` — burn live captions (word-by-word) per saved theme.
- `render.js` — final 1080x1920 export (VGP render pipeline adapted).
- `themes.js` — (NEW) theme tokens + import-from-URL (colors/fonts extraction).
- `settings.js` / `looks.js` / `history.js` / `library.js` — as in VGP.

## Data
- `config.local.json` — keys, channel, folders, default look/theme.
- `data/hosts.json`, `data/looks.json`, `data/themes.json`, `data/music/`.
- `projects/<id>/` — source, audio.wav, transcript, clips, exports.
- `episodes/<id>/` — full service videos (VGP FS2 layout).

## Export
Default `final.mp4` 1080x1920. Optional wide/square copies later (VGP CL21).

## Auto-center crop (new)
1. Run Python face detection per frame (or sampled) on the 16:9 source → (x_center, y) per frame.
2. Smooth with a moving average / spring; clamp to valid crop window for 9:16.
3. Generate an ffmpeg crop filter with interpolated x (or use a crop expression). Prefer
   producing a crop-offset CSV and using ffmpeg's `crop` with `x='...'` expression, or
   re-encode via Python/OpenCV if ffmpeg expr is too limited.
4. Keep the speaker's face in the upper third (rule of thirds) for vertical.

## Theme import from URL (new)
Fetch the URL, parse CSS for custom properties / computed styles, extract dominant colors
and font-family declarations; present as a candidate theme; user confirms. Use a headless
browser (Playwright) or cheerio + css. Store as a theme in `data/themes.json`.