# Church Studio

A Mac app that turns a sermon into short, captioned clips and helps you post them.
No login, no cloud, no API keys required.

## Run it

```sh
scripts/setup.sh        # once: Python venv + npm packages (ffmpeg comes bundled via npm)
npm start               # build the UI and open the app
npm run dev             # hot reload: UI + daemon + Electron
npm test                # engine tests (no network)
```

## Package it as one app

```sh
scripts/build-app.sh    # -> dist/release/Church Studio-<version>-arm64.dmg
```

The `.app` contains everything: a frozen Python media engine (`sc-media`: Whisper, OpenCV, Pillow,
yt-dlp), static ffmpeg/ffprobe, fonts, the UI and the local daemon. Nothing else needs installing.
Data lives in `~/Library/Application Support/Church Studio`. The Whisper model downloads once on first
transcription. The build is unsigned, so the first launch needs right-click > Open.

## How it works

1. **Add a sermon.** Pick from your channel or paste a link. Before downloading, the app reads YouTube's
   captions and finds the sermon. "Just the sermon" downloads at full speed, then keeps only that part.
2. **Transcribe** with faster-whisper on this Mac (word timings).
3. **Confirm the sermon** on a timeline and scene strip.
4. **Clips** are suggested by offline scoring tuned for preaching. An optional AI helper can rerank them.
5. **Edit:** live preview, word cuts, trims, pause trimming (you pick the length), a movable themed hook, the
   caption theme editor built in, logo and end card, edit templates, undo/redo, and a save prompt when leaving.
   Framing: a Follow closely to Smooth glide slider, "click the speaker" hints that improve tracking over time,
   timestamp cues (cut or glide), fixed, whole frame or three stack (blurred or solid background).
6. **Export:** 9:16, 4:5, 1:1 or 16:9; 720p to 4K; H.264 or HEVC. Saves to Downloads, then asks where you want it.
7. **Social:** post now, schedule, or draft. See `docs/SOCIAL.md`.

The home screen is a dashboard: weekly goal, quick actions, what's up next, your channel's latest services,
and a summary of clips and posts.

More tools:
- **Writing:** blog post, email summary, small group guide and social captions written from the sermon's own
  words, with an SEO and readability check. Optional AI polish keeps every fact from the sermon.
- **Graphics:** quote cards, series art, announcements (with QR codes) and thumbnails in your colors.
  Saved graphics can go into a clip as a corner logo or an end card.
- **Brand library:** a normal folder in Documents (Photos, Logos, Graphics, Brand, Writing) that every tool uses.
- **Workspaces:** separate brands or ministries, each with its own settings, sermons, accounts and library.
- **My App:** your setup at a glance, plus ideas based on your sermon topics.

Name ideas and icon mockups: `docs/NAMING.md`.

## Layout

```
electron/        window + preload
src/daemon/      local HTTP daemon on 127.0.0.1:4317 (job queue, media, social)
src/ui/          React + Vite UI (liquid glass, light and dark themes)
scripts/         setup.sh, build-app.sh, transcribe.py, render_clip.py, list_fonts.py, sc_media.py
assets/fonts/    Montserrat (OFL) for captions
docs/            plan, architecture, social hub, UI guide
```

## Notes
- Settings and optional AI keys: `config.local.json`. Social credentials are encrypted in `data/social/`.
- Speaker tracking uses OpenCV face detection (`opencv-python-headless<5`). YuNet/YOLO is the next upgrade.
- Captions are drawn in Python (Pillow), so ffmpeg doesn't need libass.
- UI follows `docs/ui-ux-guide.md`: tokens only, one button system, plain copy.
