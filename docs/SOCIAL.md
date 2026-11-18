# Social hub

Post exported clips to your accounts now, on a schedule, or save drafts. You bring your own credentials,
they're encrypted on this Mac, scheduled posts wait in a queue that survives restarts, and each destination
reports its own result with a retry.

## Direct upload (from this Mac)

| Platform | How it connects | Limits used |
|---|---|---|
| YouTube Shorts | Your own Google “Desktop app” OAuth client; PKCE sign-in in the browser; resumable upload | 3 min, 250 MB |
| Facebook Page | Page access token → Reels API (`video_reels` + `rupload.facebook.com`) | 90 s |
| Instagram Reels | Business/Creator account + token → resumable upload (no public URL needed) | 90 s, 300 MB |
| Telegram | Bot token + channel (bot must be admin) → `sendVideo` | 49 MB |
| Discord | Channel webhook | ~10 MB (auto-compressed) |
| Mastodon | Access token → async media upload + status | 500 chars, ~40 MB |

Clips over a platform's size/length limit are re-encoded/trimmed automatically (cached in `data/social/cache`).

## Guided hand-off
TikTok, X, Threads, LinkedIn, Bluesky and “Instagram (manual)”: their posting APIs need an audited developer
app (TikTok), paid access (X) or a public video URL. Posts to these are planned and scheduled like any other; at post
time they show **Needs you** with *Copy caption → Show video → Open upload page → Mark posted*.

## Behaviour
- Scheduling runs in the daemon: the app must be open. Overdue posts go out when it starts.
- An upload interrupted by a crash is marked failed with a warning to check the platform before retrying.
- Retry only re-sends failed destinations.

## Status
Engine is covered by `test/social.test.js` (mock provider: fitting, now, schedule, retry, hand-off, encryption).
The real platform calls have **not** yet been exercised against live accounts — connect one and post an
unlisted/private test first.
