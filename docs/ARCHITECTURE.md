# Architecture

## Shape
Electron window → local Node engine (HTTP on 127.0.0.1) → Python media engine (Whisper, OpenCV, Pillow)
and ffmpeg / yt-dlp. The UI is a React + Vite app loaded by Electron; the same code runs in a browser for dev.

```
src/ui (React/Vite)  --HTTP-->  src/daemon (Node)  --spawn-->  scripts/*.py (or the bundled sc-media)
                                       \--spawn-->  ffmpeg / yt-dlp
data/  projects/  config.local.json   (local only, never in git)
```

## Engine modules (`src/daemon`)
- `youtube.js`: list the channel, read captions to find the sermon, download all or part of a video.
- `transcribe.js` + `scripts/transcribe.py`: faster-whisper with word timestamps; Bible references tidied by `scripture.js`.
- `sermon.js`: find the sermon inside a full service.
- `clips.js` + `pipeline.js`: offline clip scoring; an optional AI helper can rerank.
- `render.js` + `scripts/render_clip.py`: speaker tracking, framing, captions, export presets.
- `writing.js`: blog post, email, small group guide and captions from the transcript; suggestions and rewrites.
- `designs.js`, `library.js`, `finder.js`: designs, the brand library folder, and All projects.
- `social/`: accounts, encrypted credentials, scheduler, platform uploads.
- `updates.js`: update checks, downloads, backups and data migrations.
- `ai.js`: optional AI helpers and the "working locally" fallback.

## Data
- `config.local.json`: settings and optional keys.
- `data/`: themes, writing drafts, designs, folders, social accounts (encrypted), speaker hints.
- `projects/<id>/`: source video, transcript, clips and their exports.
- Packaged app: all of the above lives in `~/Library/Application Support/Church Studio`.

## Speaker framing
1. Look at the clip about six times a second and detect faces.
2. Pick the speaker with a continuity bias and the user's saved "click the speaker" hints.
3. Turn positions into a smooth camera path (Follow closely to Smooth glide), or follow timestamp cues.
4. Crop each frame to 9:16 (or draw whole frame / three stack layouts) and pipe to ffmpeg.
