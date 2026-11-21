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
  // tiny | base | small | medium | large-v3-turbo. Intel Macs start on the faster Base model.
  whisperModel: process.arch === 'arm64' ? 'small' : 'base',
  clipCount: 8,
  clipMin: 25,
  clipMax: 60,
  exportFolder: '',
  exportPattern: '{date} - {title}',
  appearance: 'system', // light | dark | system
  appTheme: 'olive',
  appThemeDark: 'olive-night',
  refraction: true, // liquid-glass displacement on panels
  menuBar: true, // the small Church Studio panel in the Mac menu bar
  videoTheme: 'soft-pill',
  exportOptions: { preset: 'vertical', resolution: '1080', quality: 'high', fps: 30, codec: 'h264', captions: true, hook: true, after: 'reveal' },
  trackOnKeep: true,
  weeklyGoal: 5, // clips posted per week, shown on the dashboard
  brandColors: ['#2B7F5F', '#D9A441', '#1B2440', '#F4EFE6', '#8FB8A8'], // brand kit, used by Graphics
  brandFonts: { heading: 'Montserrat', body: 'Montserrat' },
  brandColorsSet: false, // the brand checklist: colors were chosen on purpose
  brandFontsSet: false,
  socialLinks: {}, // { facebook, instagram, youtube, ... } found by Jumpstart or added by hand
  backupAuto: false, // a weekly backup, kept four deep
  backupLibrary: false, // include the brand library in backups
  backupFolder: '', // empty means Documents/Church Studio Backups
  lastBackup: null,
  teamFolder: '', // a synced cloud folder where shared projects go
  seasonsOff: [], // church seasons this church doesn't mark, like Advent or Lent
  blogFeed: '', // the church blog's RSS or Atom feed, for Inspiration
  jumpstart: null, // { at, website } when the website setup ran
  dismissed: {}, // setup checklists the user closed
  toolIntros: {}, // tools whose first-visit hello was put away
  churchInfo: { name: '', pastor: '' /* the minister's name */, address: '', website: '', phone: '', email: '', times: '' }, // printed footers
  appLogo: '', // brand library path of the logo for the sidebar; empty means the first in Logos
  logoKinds: {}, // { 'Logos/file.png': 'full' | 'light' | 'dark' | 'icon' | 'wordmark' }
  calendarFeeds: [], // church calendar links (.ics): [{ id, name, url }] from Planning Center, Subsplash, Tithe.ly, Google...
  calendarIcal: '', // older single link; moved into calendarFeeds by the 0.4.1 migration
  lastCalendarFetch: null,
  notify: { jobs: true, reminders: true }, // Mac notifications
  toolOrder: [], // sidebar order (tool ids); empty means the default order
  toolsOff: [], // tools the person turned off
  planHidden: [], // content plan pieces set aside: they stay as ideas but don't count toward the ring
  autoUpdateCheck: true,
  lastUpdateCheck: null,
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
