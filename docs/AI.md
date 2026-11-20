# AI helpers

Church Studio works fully without AI. A helper is optional and off by default. When one is on, tools get
smarter (clip ranking and titles, writing polish and rewrites) and a helper chat appears in the corner.

## The four choices (Settings › AI helper)
| Choice | Runs | Needs | Notes |
|---|---|---|---|
| Off | — | — | Everything offline, heuristics only. |
| Apple Intelligence | On the Mac | macOS 26, Apple silicon, Apple Intelligence turned on | First and recommended. Nothing to download. Text only (no picture descriptions). Small memory, so facts are trimmed hardest. |
| CS Helper | On the Mac | A one-time 2.0 GB download | Meta's Llama 3.2 3B Instruct (Q4_K_M GGUF), run by llama.cpp's `llama-server`. Starts when used, stops after 5 quiet minutes. |
| External AI | Online | The person's own account and key | Claude, ChatGPT (OpenAI), Gemini, or their own Ollama. May cost money. |

Tool welcome cards show a small "Try it with Apple Intelligence!" nudge when the Mac has it and no helper is on.

## How it's wired
- `native/apple-ai/main.swift` → `bin/cs-apple-ai`: a tiny Swift bridge to Apple's Foundation Models. One JSON
  request on stdin (`status` or `ask`), streamed JSON lines out. Built by `scripts/build-apple-ai.sh` (also run by
  `scripts/build-app.sh`). Targets macOS 26; older Macs simply report it unavailable.
- `src/daemon/localai.js`: Apple Intelligence status and asks; CS Helper download (resumable `.part`), the
  `llama-server` lifecycle (free port, health check, idle stop), and chat with optional JSON-schema output.
  The model lives in `<app data>/models/`, shared by all workspaces.
- `src/daemon/ai.js`: one provider switch for everything (`rerank`, `complete`, `describeImage`, `chat`). Local
  providers get trimmed inputs. A request too big for a local model falls back to the offline path without marking
  the helper as down.
- `src/daemon/helper.js`: what the helper knows and may do.
  - `churchFacts`: church info, brand, voice, the next weeks of events, campaigns, recent sermons, themes and series,
    recent designs and writing, trimmed to the model's budget (Apple 4.2k chars, CS Helper 11k, external 24k).
  - `focusOf`: what's on the page (design, clip, project, writing, campaign, or just the screen).
  - `rules`: strict rules. Only Church Studio work; only the given facts; never invent dates, names, quotes or
    Bible references; short answers; name the right tool.
  - `PASS_LIST` / `runPass`: Helper Passes per page (hooks, titles, captions, headlines, openings…). Each returns a
    few options; passes with `apply` can be used on the page.
- Routes: `GET /api/ai/local`, `POST /api/ai/cshelper/download`, `DELETE /api/ai/cshelper`, `POST /api/helper/context`,
  `POST /api/helper/pass`, and `POST /api/helper/chat` (streamed newline-delimited JSON: `delta`, `replace`, `done`, `error`).
- UI: `HelperBubble.jsx` (the corner chat), `AIHelperSettings.jsx`, and `useHelperFocus(focus, apply)` from `App.jsx`.
  An editor calls `useHelperFocus` with what it has open, and an `apply(field, value)` that puts a picked option on the
  page through its normal undo history. Return `true` when applied, a short message string to explain why not, or
  `false`.

## Adding a Helper Pass
1. Add `{ id, label, ask, apply?, maxWords? }` to the right list in `PASS_LIST` (`helper.js`).
2. If it has `apply`, handle that field in the page's `useHelperFocus` apply function.
3. Keep the ask short and concrete, and remind it to use only the facts.

## Licenses
- Llama 3.2 is under the Llama 3.2 Community License and Acceptable Use Policy. The download card says
  "Built with Llama" and links both. People agree to them by downloading.
- llama.cpp is MIT. The Apple bridge is our own code; the Apple-Intelligence-Chat sample (MIT) was the reference.
- RunAnywhere was studied only. Its license needs a paid license for larger organizations, so none of its code is used.

## The CS Helper engine
`scripts/fetch-llama.sh` downloads one pinned llama.cpp release (`TAG`, checked against `SHA`), and copies
`llama-server` plus only the libraries it loads (as real files, no symlinks) into `build/bin/llama`. The packaged
app has them in `Resources/bin/llama`. `scripts/build-app.sh` runs it. To move to a newer llama.cpp, change `TAG`
and `SHA` (from the release asset's digest), run the script, and test a chat and a pass.

## Download and delete (Settings › AI helper › CS Helper)
- Nothing is downloaded unless the person presses **Download CS Helper (2.0 GB)**.
- While downloading: a progress bar and **Pause**. A paused download keeps its `.part` file and offers
  **Resume download**.
- Once downloaded: a "Downloaded · using 2.0 GB on this Mac" strip with **Delete from this Mac**, which asks first,
  frees the space, and turns the helper off if it was on.

## Image Playground (Apple Intelligence)
Apple only creates images for an app that's on screen (`ImageCreator` from a helper process fails with
`backgroundCreationForbidden`). So `native/apple-ai/playground.swift` builds `bin/cs-image-playground`, a small app that
opens Apple's Image Playground window with a prompt (and the selected picture as a starting point), and prints the
chosen file. `POST /api/ai/image-playground` copies it into the Brand library (Graphics) and returns its path.
Prompts come from `imagePrompts()` in `helper.js` (only when Apple Intelligence is the helper and a design is open).

## Scripture
There's no Bible text in the app. The helper may suggest references for writing (it remembers references well),
preferring ones the minister has preached (from the sermon index). `cleanVerses()` strips any verse wording quoted
next to a reference and adds a reminder to check the wording. The rules forbid doctrinal opinions.

## Not done yet
- Picture descriptions with a local model.
