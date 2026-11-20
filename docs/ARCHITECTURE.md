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

## The sermon as the hub
A transcribed sermon (a project) is the hub that everything made from it points back to. `src/daemon/links.js` reads
and writes those links, reusing fields the app already stored, so older work keeps its links without a migration:

| Item | Tied by |
|---|---|
| Clips, transcript, podcast | live inside the project |
| Writing from the sermon | saved under the sermon's own id |
| Standalone writing | `draft.source.projectId` |
| Designs | `design.source.projectId` |
| Posts | `post.sermonId`, or the sermon of the attached clip or design (`media.projectId`) |
| Campaigns | `campaign.projectId` |

The project's last step is the **Sermon page** (`components/ContentPlan.jsx`, data from `GET /api/projects/:id/plan`):
the sermon at a glance (main idea, passages that open the transcript at that spot, points, themes, series), the
sermon plan, and everything tied to it, with "Link something" (`GET /api/links/candidates`, `PUT /api/links`).
`components/SermonPicker.jsx` ("From sermon") sits in the design editor, standalone writing and the post composer.
Search adds the sermon's name to tied items, and the helper's sermon links open the Sermon page.
