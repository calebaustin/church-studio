# Build plan

Sizes: S = 1-2h, M = one session, L = multi-session. Planning only; Claude Code implements.

## Phase 0 — Scaffold (S)
- Electron + Vite + Node daemon skeleton; copy VGP folder layout.
- Gitignore `data/`, `projects/`, `episodes/`, `config.local.json`, `.venv/`.
- `scripts/setup.ps1` (Windows) + `scripts/setup.sh` (mac) installing ffmpeg, node, python venv,
  faster-whisper, yt-dlp.

## Phase 1 — Settings & keys onboarding (M)  [do first]
- Settings screen listing each required/optional key with: what it's for, where to get it
  (link), where it's stored (`config.local.json`), test button.
- No keys required for core flow: heuristic clip picking + Whisper + yt-dlp + ffmpeg run
  locally. LLM keys (Anthropic/OpenAI/Gemini/Ollama) only if user enables AI picking.
- YouTube Data API (optional, channel enrichment), SteamGridDB (optional). See `docs/KEYS.md`.
- On first run, show a welcome modal walking through keys.

## Phase 2 — Media ingest (M)
- Settings: YouTube channel URL (owner's channel).
- Screen: list recent uploads (yt-dlp flat-playlist), search/filter, select one.
- Download selected video (up to 1080p) into `episodes/<id>/source.mp4` (VGP FS2 pattern).
- Also allow pasting a local file path.

## Phase 3 — Sermon detection (M)
- Extract audio → Whisper (word timestamps).
- Ask Claude to find the sermon segment: start phrase, end phrase, confidence. User confirms/adjusts.

## Phase 4 — Clip proposals (M)  [no-LLM by default; LLM optional]
- Default engine: clipsmith heuristic (`select_heuristic`) — rule-based scoring, works offline
  with zero keys. Sermon-adapted criteria (key point, illustration, story, application, quote).
- Optional enhancement: LLM ranking (Claude/Ollama/Gemini) from clipsmith + shorts-generator
  (virality prompt, chunking, dedupe). User picks provider in Settings; "none" = heuristic.
- Each proposal shows: score, length, why, hook/start phrase, summary, end phrase.

## Phase 5 — Clip editor (L)
- Cut by sentence/word, trim edges, tighten pauses (VGP CL1-CL3).
- Caption style from saved theme; live preview matching export (VGP CL5/CL7).
- Undo/redo (VGP CL10).

## Phase 6 — Auto-center 9:16 crop (M)
- MVP: reuse `AI-Youtube-Shorts-Generator` `local/clipper.py` (Haar cascade face tracking +
  smoothing 0.15) — simplest, no model download.
- Upgrade: swap face detector to YOLO person detection (`Autocrop-vertical-main`) for better
  tracking of a moving speaker; keep the smoothing + letterbox fallback.
- Preview uses the same crop math.

## Phase 7 — Export (M)
- 1080x1920 with burned captions, cropped video. VGP render.js adapted.
- Export folder + naming pattern (VGP CL16).

## Phase 8 — Theming & liquid glass (M)
- Light theme tokens; liquid-glass panels.
- Settings page: save an app theme + save multiple video themes (caption/look presets).
- Theme editor: colors, fonts, radius, glass strength.
- Import theme from URL deferred to later; v1 ships manual editing + built-in themes.
- Save/apply looks (VGP CL12).

## Phase 9 — Polish (ongoing)
- Clip library, duplicate, search (VGP CL14/CL15).
- Daily check (optional, VGP CL43).