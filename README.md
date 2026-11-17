# Sermon Clips

Local macOS desktop app that turns a sermon video into short, captioned, vertical (9:16) clips —
and posts or schedules them to your social accounts. No login, no cloud, no API keys required.

## Run it

```sh
scripts/setup.sh      # once: ffmpeg, Python 3.12 venv (faster-whisper, OpenCV<5, Pillow), npm deps
npm start             # builds the UI and opens the app window
npm run dev           # hot-reload UI + daemon + Electron
npm test              # engine tests (no network)
```

## How it works

1. **Ingest** — pick a video from your channel (yt-dlp lists uploads + past livestreams), paste a link, or open a file.
2. **Transcribe** — faster-whisper with word timestamps, on this Mac (whole service or a known range).
3. **Find the sermon** — longest stretch of continuous speech (songs are slower and repeat), snapped to cue phrases
   like “turn with me to…” / “let's pray”. You confirm or adjust it on a timeline.
4. **Propose clips** — offline scoring tuned for preaching (stories, application, quotable lines, scripture, strong
   openers, complete endings). Optional AI helper (Ollama / Claude / OpenAI / Gemini) only re-ranks and retitles.
5. **Edit** — live 9:16 preview, word-level cuts, trim, tighten pauses, remove “um/uh”, hook text, caption themes, undo/redo.
6. **Export** — 1080×1920 H.264. A smooth camera follows the speaker (face tracking → dead-zone spring → zero-phase
   smoothing); captions are drawn word by word with Pillow (no libass needed). Rendered by `scripts/render_clip.py`.
7. **Social** — post now, schedule, or draft. See `docs/SOCIAL.md`.

## Layout

```
electron/          main window + preload (file pickers)
src/daemon/        local HTTP daemon on 127.0.0.1:4317 (all heavy work, job queue)
  social/          social hub: platforms, providers, encrypted vault, scheduler
src/ui/            React + Vite UI (light liquid glass, themeable)
scripts/           setup.sh, transcribe.py, render_clip.py
data/ projects/ config.local.json   local only, gitignored
```

## Notes
- `config.local.json` holds settings and optional AI keys. Social credentials are AES-256-GCM encrypted in
  `data/social/` with a key in `data/social/credentials.key` — back up `data/` as a whole.
- Face tracking uses OpenCV Haar cascades (pinned `opencv-python-headless<5`; 5.x removed them). YuNet/YOLO is the
  planned upgrade for wide stage shots.
- The liquid-glass look is CSS (`backdrop-filter` + an SVG displacement filter); the `@ybouane/liquidglass` package's
  install script is broken and its per-frame HTML capture is too heavy for an editor.
