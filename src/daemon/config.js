// Per-computer settings in config.local.json (gitignored). Secrets never leave this machine;
// the API only ever returns them masked.
import { existsSync } from 'node:fs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { HOME } from './tools.js';

export const CONFIG_FILE = path.join(HOME, 'config.local.json');

export const DEFAULTS = {
  onboarded: false,
  youtubeChannel: '',
  youtubeApiKey: '',
  llmProvider: 'none', // none | ollama | anthropic | openai | gemini
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'qwen3:4b',
  anthropicApiKey: '',
  anthropicModel: 'claude-opus-5-5',
  openaiApiKey: '',
  openaiModel: 'gpt-5-mini',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  whisperModel: 'small', // tiny | base | small | medium | large-v3-turbo
  clipCount: 8,
  clipMin: 25,
  clipMax: 60,
  exportFolder: '',
  exportPattern: '{date} - {title}',
  appearance: 'system', // light | dark | system
  appTheme: 'sermon-light',
  appThemeDark: 'midnight-glass',
  refraction: true, // liquid-glass displacement on panels
  videoTheme: 'soft-pill',
  exportOptions: { preset: 'vertical', resolution: '1080', quality: 'high', fps: 30, codec: 'h264', captions: true, hook: true, after: 'reveal' },
  trackOnKeep: true,
  weeklyGoal: 5, // clips posted per week, shown on the dashboard
  brandColors: ['#2B7F5F', '#D9A441', '#1B2440', '#F4EFE6', '#8FB8A8'], // brand kit, used by Graphics
  brandFonts: { heading: 'Montserrat', body: 'Montserrat' },
  dismissed: {}, // setup checklists the user closed
};

/** Fields that hold secrets: masked on read, only overwritten when a new value is sent. */
export const SECRET_FIELDS = ['youtubeApiKey', 'anthropicApiKey', 'openaiApiKey', 'geminiApiKey'];

/** Shown on the Settings screen: what each key is for and how to get it. */
export const KEY_GUIDE = [
  {
    field: 'anthropicApiKey', name: 'Anthropic (Claude) API key', optional: true, provider: 'anthropic',
    purpose: 'For the Claude AI helper.',
    steps: ['Go to console.anthropic.com and sign in.', 'Open Settings → API Keys → Create Key.', 'Copy the key (starts with sk-ant-) and paste it here.'],
    link: 'https://console.anthropic.com/settings/keys',
  },
  {
    field: 'openaiApiKey', name: 'OpenAI API key', optional: true, provider: 'openai',
    purpose: 'For the OpenAI helper.',
    steps: ['Go to platform.openai.com → API keys.', 'Create a new secret key.', 'Paste it here.'],
    link: 'https://platform.openai.com/api-keys',
  },
  {
    field: 'geminiApiKey', name: 'Google Gemini API key', optional: true, provider: 'gemini',
    purpose: 'For the Gemini helper. Has a free tier.',
    steps: ['Go to aistudio.google.com/apikey.', 'Create API key.', 'Paste it here.'],
    link: 'https://aistudio.google.com/apikey',
  },
  {
    field: 'youtubeApiKey', name: 'YouTube Data API v3 key', optional: true,
    purpose: 'Optional. Not needed to list or download videos.',
    steps: ['Open console.cloud.google.com and create a project.', 'APIs & Services → Library → enable "YouTube Data API v3".', 'Credentials → Create credentials → API key. Restrict it to the YouTube Data API.', 'Paste it here.'],
    link: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  },
];

let cache = null;

export async function loadConfig() {
  if (cache) return cache;
  let saved = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      saved = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.error('config.local.json is not valid JSON; using defaults.', e.message);
    }
  }
  cache = { ...DEFAULTS, ...saved };
  return cache;
}

export async function saveConfig(patch) {
  const current = await loadConfig();
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    if (SECRET_FIELDS.includes(k) && typeof v === 'string' && v.includes('•')) continue; // masked echo
    next[k] = typeof DEFAULTS[k] === 'number' ? Number(v) : v;
  }
  const tmp = `${CONFIG_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2));
  await rename(tmp, CONFIG_FILE);
  cache = next;
  return next;
}

export function mask(config) {
  const out = { ...config };
  for (const f of SECRET_FIELDS) {
    const v = out[f];
    out[f] = v ? `${v.slice(0, 6)}••••••${v.slice(-4)}` : '';
  }
  return out;
}
