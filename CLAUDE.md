# Church Studio

The project lives in `/Users/caleb/Documents/AI Docs/Sermon Clips`. See README.md to run, package and release it,
and `docs/` for architecture, theming, keys, social, naming and releasing.

## What it is
A **local Mac app** (own window, no login) for church media: download a sermon from the church's YouTube
channel, transcribe it, suggest clips, and export captioned 9:16 videos with a speaker-following crop. It also
writes blog posts, emails and small group guides from the sermon, makes graphics and slide decks, and posts or
schedules to social accounts. Visual style: **light liquid glass**, themeable, with dark mode.

**Everything works offline with no AI and no keys.** AI helpers are optional and off by default. Local ones come
first: Apple Intelligence (built into macOS 26, via the Swift bridge in `native/apple-ai`) and CS Helper (Llama 3.2 3B
run by llama.cpp, downloaded in Settings). External AI (Claude, ChatGPT, Gemini, Ollama) is online-only and uses the
person's own account. If a helper fails or a request is too big for it, the app falls back to working locally.
The helper only sees facts gathered in `src/daemon/helper.js` and must never invent church details. See docs/AI.md.

## Non-goals
- No accounts or login. Keys go in Settings and are stored in `config.local.json` (never in git).
- No cloud hosting. Everything runs on the user's Mac.

## Stack
Electron shell, Node engine in `src/daemon`, React + Vite UI in `src/ui`, Python media scripts in `scripts/`
(bundled as `sc-media` when packaged), ffmpeg and yt-dlp.

## UI
Read `docs/ui-ux-guide.md` before building any screen, and follow it. Use only the tokens in
`src/ui/styles.css`; never hard-code colors (use the `--tone-*` tokens for icon and tile colors).
Plain, short copy: no em dashes, no over-explaining.
**Buttons never stretch to fill a panel or grid cell.** They size to their label (`.btn` has `justify-self: start`;
never give a button `width: 100%` or put it where a grid stretches it). Large size (`.btn.lg`) only for one hero action.

## Conventions
- Local data in `data/`, `projects/` and `config.local.json` (all gitignored).
- Heavy work happens in the engine; the UI stays thin.
- Word-level timestamps everywhere captions are burned.
- Undo/redo for clip and design edits.
- Updates must never break saved work: new settings need defaults, and storage changes need a migration in
  `src/daemon/updates.js`. Add a CHANGELOG.md entry for every release.
- Reference material and outside tools are kept outside this folder, never in the repo.
