# Sermon Clips — Claude Code kickoff

You are working in `/Users/caleb/Documents/AI Docs/Sermon Clips`. This is a **planning-only** stage:
do not build the app yet unless asked. Read this file and the docs in `docs/` first.

## What we're building
A **local desktop app** (own window, no browser tab, no login) that downloads a sermon video
from the owner's YouTube channel, transcribes it, proposes short clip cuts, and exports each
cut as a **9:16 vertical** video with live captions and a smooth auto-centered crop of the
wide (16:9) source so the moving speaker stays centered. Visual style: **light, liquid-glass**
(see `docs/THEMING.md`), customizable theme.

**Primary path runs fully offline with no LLM and no API keys.** Clip picking, summaries,
and all media processing work via heuristics + local tools (Whisper, ffmpeg, yt-dlp). LLMs
(Claude/Ollama/Gemini/OpenAI) are an optional enhancement toggle, off by default.

## Non-goals for now
- No auth/login flow. API keys are entered by the user in Settings and stored in
  `config.local.json` (gitignored). See `docs/KEYS.md`.
- No cloud hosting. Everything runs on the user's machine.
- Don't reuse VGP Clips' dark/generic AI look. Reuse its *pipeline*, not its UI.

## Recommended stack (reuse OpenCreator + VGP Clips)
- Shell: **Electron** (OpenCreator pattern) so it lives in its own window, with a local
  Node daemon (VGP pattern) for ffmpeg/Python work.
- Frontend: Vite + React (or keep VGP's server-rendered HTML if simpler). Light theme.
- Glass UI: `@ybouane/liquidglass` (WebGL) for panels/cards; see `docs/THEMING.md`.
- Media: `ffmpeg` + `yt-dlp` (VGP/OpenCreator). Python venv with `faster-whisper`.
- Transcription: faster-whisper (VGP) or openai/whisper. Word-level timestamps required.
- AI for clip proposals: optional enhancement only. Default is no-LLM heuristic (clipsmith
  `select_heuristic`) running fully offline. Optional providers: Ollama (local, free),
  Gemini, Claude, OpenAI — toggled in Settings. No provider = heuristic.
- Face tracking for auto-center crop: reuse `Autocrop-vertical-main` (YOLOv8 + PySceneDetect +
  OpenCV) for person detection + frame pipeline; extend to per-frame smoothing for a moving
  speaker. See `docs/BUILD-PLAN.md` Phase 6.

## Where the samples live
`Build Samples/` (zips). See `docs/SAMPLES.md` for what to take from each.
Most valuable: `AI-Youtube-Shorts-Generator-main.zip` (pipeline + virality ranking + crop).
2nd: `clipsmith-main.zip` (no-LLM heuristic clip picking, trim, render, captions; FastAPI).
Then `vgp-clips-main.zip` (editor/export/looks). Then `Autocrop-vertical-main.zip` (YOLO).

## First things Claude Code should do
1. Read `docs/BUILD-PLAN.md`, `docs/ARCHITECTURE.md`, `docs/SAMPLES.md`, `docs/KEYS.md`,
   `docs/THEMING.md`.
2. Scaffold the repo (Electron + Vite + daemon) WITHOUT implementing features, matching VGP's
   folder layout (`src/`, `scripts/`, `assets/`, `docs/`).
3. Implement the "Settings / API keys" screen first, with the onboarding prompt that teaches
   the user how to get each key and where it's stored (`config.local.json`).
4. Then media pipeline: YouTube listing → download → transcribe → clip propose → export.
5. Keep the UI light + liquid glass from day one; do not copy VGP's dark theme.

## Conventions
- Local data in `data/` and `config.local.json` (gitignored). Project files under `projects/`.
- All heavy work in the Node daemon; UI is thin.
- Word-level timestamps everywhere captions are burned.
- Every export is 1080x1920 (9:16) unless a "wide copy" option is added later.
- Undo/redo for clip edits (VGP CL10 pattern).