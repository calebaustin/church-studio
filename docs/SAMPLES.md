# What to reuse from each sample

## clipsmith-main.zip — 2nd MOST VALUABLE (no-LLM mode)
FastAPI app that turns a YouTube video into captioned 9:16 clips; runs on a laptop, no GPU.
Key value: **works without an LLM** — `AI_PROVIDER=none` gives rule-based scoring
(`selector.select_heuristic`), so the whole pipeline can run offline with zero keys.
Reuse:
- `app/selector.py` — `to_sentences`, `within`, `select` (AI or heuristic fallback), `select_heuristic`
  (hook-word scoring, keyword boosting, non-overlap dedupe), `_fit`, `_dedupe`. Directly
  supports "process on its own" with no LLM. AI providers: Ollama (local Qwen), Gemini, Claude.
- `app/trim.py` — silence detection (ffmpeg silencedetect) + filler spans + keep_segments +
  remap_words (pause/filler removal). Reuse for "tighten pauses".
- `app/render.py` — reframing (Haar face tracking, facecam detection), ASS caption burn-in,
  ASPECTS (9:16/1:1/16:9), STYLES, ffmpeg filter graph. Reuse for captioned export.
- `app/source.py` — YouTube download + caption track selection + json3 parsing + Whisper fallback
  (word timestamps), local file ingest.
- `app/config.py` — paths, settings, `ai_provider()` auto-detection, `missing_tools()`.
- `app/main.py` — FastAPI server, job queue, upload, progress, media serving.
- `app/local_llm.py` — Ollama client (optional, free, offline).
- `app/youtube.py` — YouTube Data API OAuth upload + scheduling.
Notes: UI is basic; keep our liquid-glass UI. Reuse its no-LLM heuristic as the default
clip-proposal engine; LLM becomes optional enhancement.

## AI-Youtube-Shorts-Generator-main.zip — MOST VALUABLE (closest to our pipeline)
End-to-end "long video → ranked vertical shorts" with two modes (API or local).
Reuse heavily:
- `shorts_generator/highlights.py` — virality framework + prompt, content-type detection,
  long-video chunking with overlap, score-based dedupe (>50% overlap), top-N selection.
  Directly maps to our "propose multiple clip cuts with summary/start phrase/end phrase".
- `shorts_generator/pipeline.py` — orchestrator pattern (download → transcribe → highlights → crop).
- `shorts_generator/local/transcriber.py` — faster-whisper with SRT cache, VAD options, device resolve.
- `shorts_generator/local/downloader.py` — yt-dlp download + local file support + cache by video id.
- `shorts_generator/local/clipper.py` — cut subclip with ffmpeg + OpenCV face-tracking reframe
  with smoothing (Haar cascade, largest face, smoothing 0.15). Reuse for our 9:16 crop MVP.
- `shorts_generator/local/llm.py` — OpenAI/Gemini backend selector (reusable for Claude/OpenAI).
- `shorts_generator/config.py` — env-based config pattern (adapt to config.local.json).
- `main.py` + `--output-json` — CLI + JSON output for automation.
Notes: API mode uses MuAPI (paid). We'll use local mode only (no login, user keys). Reuse the
pluggable `llm_fn` to route through Claude Code CLI or Anthropic API.



Samples are in `Build Samples/`. Zips are not checked into the app; extract as needed.

## vgp-clips-main.zip — PRIMARY TEMPLATE (reuse pipeline, not UI)
Local clip finisher (Node server + Python whisper + ffmpeg + yt-dlp). Closest to our app.
Reuse:
- `scripts/setup.ps1`, `scripts/transcribe.py`, `scripts/voices.py` — one-time setup, Whisper.
- `src/server.js`, `src/tools.js` (run, venvBin, tool, loadConfig, probe) — daemon helpers.
- `src/episodes.js` — addEpisodeUrl (yt-dlp download), recentEpisodes (channel listing),
  transcribeEpisode, labelEpisodeSpeakers.
- `src/fetch.js` — searchTrailers (yt-dlp ytsearch), downloadTrailer, searchLogos/downloadLogo.
- `src/analyze.js` — extractWav, transcribeWav with word timing, findSpeakers.
- `src/project.js`, `src/folders.js`, `src/library.js`, `src/looks.js`, `src/settings.js`,
  `src/history.js`, `src/timeline.js`, `src/render.js`, `src/finish.js`, `src/overlays.js`,
  `src/layout.js`, `src/ai.js` — clip data model, looks, undo, export pipeline.
- `docs/BUILD-PLAN.md` — feature roadmap format to mirror.
Notes: UI is dark/generic AI; replace with light liquid-glass. Keep its module boundaries.

## OpenCreator-master.zip — desktop shell + download engine
Electron desktop app (own window) with a local daemon, managed yt-dlp, YouTube connection.
Reuse:
- `apps/desktop` — Electron main/preload/packaging (own window, tray, notifications).
- `apps/daemon/src/creator/download/executor.ts`, `probe-parser.ts`, `resume.ts` — robust
  download pipeline with progress/resume.
- `apps/daemon/src/creator/templates/video-download.ts` — probe→download two-stage template.
- `apps/daemon/src/platform-connections/youtube.ts` + youtube-browser-* tests — YouTube
  connection pattern (can be replaced by API-key + yt-dlp for no-login).
- `apps/daemon/runtime/yt-dlp` — managed yt-dlp runtime layout.
- Subtitle render (`creator/krillin/subtitle-*.ts`) — burn-in captions reference.
Notes: Huge monorepo; cherry-pick, don't fork wholesale.

## liquidglass-main.zip — UI look
`@ybouane/liquidglass`: WebGL refraction/blur glass panels over any HTML element.
Reuse `src/LiquidGlass.ts`, `GlassRenderer.ts`, `HtmlCapture.ts`, `shaders.ts`, `defaults.ts`.
Use for cards/panels/sidebars. Light theme: keep backgrounds light, glass tint low.

## Autocrop-vertical-main.zip — auto vertical crop (KEY for 9:16)
Smart cropper (YOLOv8 person detection + PySceneDetect + OpenCV) converting horizontal video
to vertical: per-scene TRACK (crop on subject) or LETTERBOX. Reuse heavily:
- `main.py`: `detect_scenes`, `analyze_scene_content` (YOLO person + Haar face),
  `decide_cropping_strategy`, `calculate_crop_box`, `get_video_properties`,
  `is_variable_frame_rate`, `normalize_to_cfr`, `run_ffmpeg_with_progress`, `has_audio_stream`,
  `get_stream_start_time`, encoder helpers (`detect_hw_encoder`, `resolve_encoder`,
  `build_encoder_args`).
- Frame-by-frame OpenCV → rawvideo pipe → ffmpeg encoding (frame-accurate, no drift).
- Audio extraction with start-time offset + merge.
Reuse for our `crop.py`: detect the speaking person, compute crop x per frame, smooth across
frames (sample is per-scene; extend with moving-average/spring over frame-level centers for a
moving speaker). Keep letterbox fallback when multiple people are too spread out.
Requirements: opencv-python, scenedetect, ultralytics, torch, tqdm. Model yolov8n.pt
(auto-downloaded).

## whisper-main.zip — transcription engine
OpenAI Whisper reference. We'll use `faster-whisper` (VGP) but keep Whisper's model list
and language support as reference. Reuse model-card.md for key docs.

## cargan-master.zip / descript-audio-codec-main.zip — audio (optional)
Audio super-resolution / codec research. Only relevant if we add audio cleanup to sermon
clips. Skip for MVP; revisit for "clean up sermon audio" feature.

## web-audio-engine-master.zip — audio (optional)
Web Audio API engine. Only if we add in-browser audio preview/editing. Skip for MVP.

## Images in Build Samples (IMG_0802/0804/0805)
Screenshots of reference UI. Review manually for layout ideas; not code.

## What NO sample covers (new work)
- Auto-center/smooth-crop of a 16:9 source into 9:16 tracking a moving speaker.
- Sermon-segment detection inside a full service video.
- Theme import from a URL (extract colors + fonts from a site).
Implement these as new modules.