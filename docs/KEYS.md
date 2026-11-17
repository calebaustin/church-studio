# API keys & where to store them

No login. The app stores all secrets in `config.local.json` at the project root (gitignored).
Settings screen shows each key, a "how to get it" link, and a test button.

## Required for core flow
None. yt-dlp + Whisper run locally without keys.

## Optional keys
0. **LLM for highlight ranking** (pick one)
   - Claude Code CLI (recommended, no key) — default.
   - Ollama (no key, local) — install Ollama + `ollama pull qwen3.5:4b`; fully offline.
   - Anthropic API key — https://console.anthropic.com.
   - OpenAI API key — https://platform.openai.com/api-keys.
   - Gemini API key — https://aistudio.google.com/apikey.
   Stored as `anthropicApiKey` / `openaiApiKey` / `geminiApiKey` / `llmProvider`.
1. **Anthropic API key** (only if not using Claude Code CLI)
   - Get at https://console.anthropic.com → API Keys.
   - Stored as `anthropicApiKey`. Used for clip proposals + caption fixes.
   - Alternative: install Claude Code CLI and sign in (`claude` then `/login`); no key needed.
2. **YouTube Data API v3 key** (optional enrichment for listing/searching the owner's channel)
   - Google Cloud Console → create project → enable "YouTube Data API v3" → Credentials →
     Create API key. Restrict to your IP if possible.
   - Stored as `youtubeApiKey`. Core listing uses yt-dlp on the channel URL, so this is only
     for richer metadata/search.
3. **SteamGridDB key** (optional, for logos of non-Steam games)
   - https://www.steamgriddb.com/profile/preferences/api → generate key.
   - Stored as `steamGridDbKey`. Steam logos need no key.

## Storage
`config.local.json` example:
```json
{
  "youtubeChannel": "https://www.youtube.com/@YourChannel/videos",
  "youtubeApiKey": "",
  "anthropicApiKey": "",
  "steamGridDbKey": "",
  "exportFolder": "",
  "exportPattern": "{date} - {game} - {title}",
  "theme": "default-light"
}
```
Never commit this file. Onboarding modal must instruct the user to create it via Settings.