# Descript comparison (Nov 22, 2026)

Same sermon ("In Remembrance", Chris Parker, 11.15.2026, 32:30) through Descript's Underlord and through Church Studio with
CS Helper. Inputs live in `../Samples/Descript Data` (not in the repo).

## Transcripts
- Ours: 5,472 words in 4 min 12 s (Whisper small). Descript: 5,647.
- Whisper dropped every "um/uh" (0 vs 70) and most stumbles (15 vs 54), so "Cut um and uh" found nothing, and the filler
  sounds stayed in the audio inside neighboring words' timing. It also skipped words once ("God is still [in control]").
- Fix in progress: a verbatim prompt (`VERBATIM` in transcribe.js) makes Whisper keep fillers and stumbles with near-normal
  punctuation (5.1 vs 5.4 sentence ends per 100 words on a 3-minute test). Fillers are stored apart in
  `transcript.fillers` so every reader of `words` is unchanged; `keepSegments` cuts them by time when `clip.cutFillers`.
  Not yet run on a full sermon.

## Clips
Descript: 9 clips, 40-72 s, each with a headline title, a "why it works" paragraph and a 1-5 star score. Their text files
include a lead-in sentence before the real cut.

| | Before | After this session |
|---|---|---|
| Overlap with Descript's 9 | 5 | 4 |
| Socks-and-keychain story (their #2/#4) | missed | found, one 70 s clip |
| Thanksgiving humor (their #1) | missed | missed |
| Score spread | 70-90 | 79-83 (worse) |
| Reasons | repeated the instructions | repeat the new rubric words (still generic) |

Causes found: story lines barely scored; the helper read only the first 600 characters (never the payoff); the helper
pool was the top 24 by offline score, often from one stretch. Changed: story/payoff/rhythm features and story arcs in
clips.js, room for longer story clips, `spread()` pool across the sermon, head + tail text for the helper, an
editor-style rubric.

## Next
1. Reasons and scores from CS Helper: ask for a 1-5 rating per rubric item (hook, stands alone, payoff, feeling) and
   compute the score ourselves; ask the reason to quote the clip's key line. Likely fixes bunching and generic text.
2. Relatable humor (Thanksgiving) needs the helper to see it: consider a second pass over the "spread" pool only.
3. Run the verbatim transcriber on the full sermon; check captions and the Cut stumbles button.
4. Combine videos: engine + dialog built, not yet run end to end.
5. Descript editor ideas (screenshots): filler words underlined in the transcript, Edit for clarity with an intensity
   slider, Remove retakes, Shorten word gaps (we have Trim pauses), waveform and progress-bar elements, audio effects,
   a timeline with word labels and Split, highlight reel from the best clips.
