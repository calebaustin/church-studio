// Finds and runs the outside programs the daemon leans on: ffmpeg, ffprobe, yt-dlp, Python.
// Resolution order (first that exists wins):
//   1. <NAME>_PATH env override
//   2. tools bundled in the packaged app (SC_RESOURCES/bin, SC_RESOURCES/sc-media)
//   3. npm-bundled static ffmpeg/ffprobe (dev)
//   4. the project .venv (yt-dlp, python)
//   5. Homebrew / system folders (a Finder-launched app doesn't inherit the shell PATH)
// Code lives in ROOT; user data lives in HOME (Application Support when packaged).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Where workspaces are registered: Application Support when packaged, the project folder in dev. */
export const BASE = process.env.SC_HOME || ROOT;
export const APP_NAME = 'Church Studio';
function activeWorkspace() {
  try {
    const reg = JSON.parse(readFileSync(path.join(BASE, 'workspaces.json'), 'utf8'));
    const w = reg.list?.find((x) => x.id === reg.active);
    if (w && existsSync(w.dir)) return w;
  } catch { /* first run: the main workspace */ }
  return { id: 'main', name: 'Main', dir: BASE };
}
/** Each workspace (brand) keeps its own settings, sermons, themes and social accounts. */
export const WORKSPACE = activeWorkspace();
export const HOME = WORKSPACE.dir;
export const RESOURCES = process.env.SC_RESOURCES || null;
export const DATA_DIR = process.env.SC_DATA_DIR || path.join(HOME, 'data');
export const PROJECTS_DIR = path.join(HOME, 'projects');
export const SCRIPTS_DIR = path.join(ROOT, 'scripts');
export const ASSETS_DIR = RESOURCES && existsSync(path.join(RESOURCES, 'assets')) ? path.join(RESOURCES, 'assets') : path.join(ROOT, 'assets');

const EXTRA_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
const found = new Map();
const require = createRequire(import.meta.url);

export function venvBin(name) {
  const dir = process.platform === 'win32' ? 'Scripts' : 'bin';
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return path.join(ROOT, '.venv', dir, exe);
}

function npmStatic(name) {
  try {
    if (name === 'ffmpeg') return require('ffmpeg-static');
    if (name === 'ffprobe') return require('@ffprobe-installer/ffprobe').path;
  } catch { /* not installed */ }
  return null;
}

/** The frozen media helper (PyInstaller) shipped inside the packaged app, if present. */
export function mediaHelper() {
  const p = RESOURCES && path.join(RESOURCES, 'sc-media', 'sc-media');
  return p && existsSync(p) ? p : null;
}

export function tool(name) {
  if (found.has(name)) return found.get(name);
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [
    process.env[`${name.toUpperCase().replace(/-/g, '_')}_PATH`],
    RESOURCES && path.join(RESOURCES, 'bin', exe),
    path.join(ROOT, 'build', 'bin', exe), // dev builds of our own helpers (cs-apple-ai)
    npmStatic(name),
    venvBin(name),
    ...EXTRA_BIN_DIRS.map((d) => path.join(d, exe)),
  ].filter(Boolean);
  const resolved = candidates.find((c) => existsSync(c)) || exe;
  found.set(name, resolved);
  return resolved;
}

export function python() {
  const v = venvBin('python');
  return existsSync(v) ? v : tool('python3');
}

/**
 * Command for one of our Python scripts (transcribe, render_clip) or yt-dlp. In the packaged app
 * these all live in one frozen binary: `sc-media <script> ...args`.
 */
export function pyCommand(script, args) {
  const helper = mediaHelper();
  if (helper) return [helper, [script, ...args]];
  if (script === 'yt-dlp') return [tool('yt-dlp'), args];
  return [python(), [path.join(SCRIPTS_DIR, `${script}.py`), ...args]];
}

/** Env every child gets: our ffmpeg/ffprobe for the Python scripts, unbuffered output. */
export function childEnv() {
  return {
    ...process.env,
    PATH: [...EXTRA_BIN_DIRS, process.env.PATH].join(path.delimiter),
    PYTHONUNBUFFERED: '1',
    FFMPEG_PATH: tool('ffmpeg'),
    FFPROBE_PATH: tool('ffprobe'),
    SC_ASSETS: ASSETS_DIR,
    // The bundled media engine (Python, for yt-dlp and model downloads) was built where trusted certificates
    // live in Homebrew's folder. A Mac without Homebrew doesn't have that file, so every secure download
    // failed there ("CERTIFICATE_VERIFY_FAILED"). Every Mac ships its own list here; point to it.
    ...(!process.env.SSL_CERT_FILE && existsSync(SYSTEM_CERTS) ? { SSL_CERT_FILE: SYSTEM_CERTS } : {}),
  };
}
const SYSTEM_CERTS = '/etc/ssl/cert.pem';

/**
 * Run a program and collect its output. Rejects on a non-zero exit with the tail of stderr.
 * `onStderr`/`onStdout` stream chunks (used for progress). `signal` lets a job cancel it.
 */
const children = new Set();
function killTree(child, sig) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, sig);
    else child.kill(sig);
  } catch { /* already gone */ }
}
// Don't leave helpers running if the daemon goes away.
for (const ev of ['exit', 'SIGINT', 'SIGTERM']) process.on(ev, () => { for (const c of children) killTree(c, 'SIGKILL'); });

export function run(cmd, args, { cwd = ROOT, input, onStderr, onStdout, signal } = {}) {
  return new Promise((resolve, reject) => {
    // Own process group, so Stop also ends helpers it starts (yt-dlp runs ffmpeg for partial downloads).
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      env: childEnv(),
      detached: process.platform !== 'win32',
    });
    children.add(child);
    // Helpers (transcribing, rendering, downloads) run a step below normal priority: just as fast on a
    // quiet Mac, but the app's window and everything else the person is doing stay responsive.
    if (child.pid) { try { os.setPriority(child.pid, 5); } catch { /* fine */ } }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const abort = () => {
      killTree(child, 'SIGTERM');
      setTimeout(() => killTree(child, 'SIGKILL'), 3000).unref();
      // Normally we finish when the child closes; this is only a backstop for a stubborn one.
      setTimeout(() => { if (!settled) { settled = true; reject(new Error('Cancelled')); } }, 4000).unref();
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (d) => {
      stdout += d;
      onStdout?.(String(d));
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      onStderr?.(String(d));
    });
    child.on('error', (err) => { if (!settled) { settled = true; reject(new Error(`Could not start ${path.basename(cmd)}: ${err.message}`)); } });
    child.on('close', (code) => {
      children.delete(child);
      signal?.removeEventListener('abort', abort);
      if (settled) return;
      settled = true;
      if (signal?.aborted) return reject(new Error('Cancelled'));
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(`${path.basename(cmd)} exited ${code}: ${stderr.slice(-1500).trim()}`);
        error.stdout = stdout;
        reject(error);
      }
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

/**
 * JSON printed by a helper program. Some math libraries print a warning first (Intel MKL does on
 * older or emulated Intel chips), so skip any lines before the JSON starts.
 */
export function jsonFrom(stdout) {
  const text = String(stdout).trim();
  try { return JSON.parse(text); } catch { /* look past any warnings */ }
  const at = text.search(/^[[{]/m);
  if (at < 0) throw new Error(`Unexpected output: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(at));
}

export async function probe(file) {
  const { stdout } = await run(tool('ffprobe'), [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]);
  const info = JSON.parse(stdout);
  const video = info.streams.find((s) => s.codec_type === 'video');
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  const [num, den] = (video?.r_frame_rate ?? '30/1').split('/').map(Number);
  return {
    duration: Number(info.format.duration),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: den ? num / den : 30,
    hasAudio: Boolean(audio),
  };
}

/** Which required tools are present, with versions. Shown on the Settings screen. */
export async function toolStatus() {
  const checks = [
    ['ffmpeg', tool('ffmpeg'), ['-version'], true],
    ['ffprobe', tool('ffprobe'), ['-version'], true],
    ['yt-dlp', ...pyCommand('yt-dlp', ['--version']), true],
    ...(mediaHelper() ? [['media engine', mediaHelper(), ['version'], true]] : [['python', python(), ['--version'], true]]),
  ];
  const out = [];
  for (const [name, bin, args, required] of checks) {
    try {
      const { stdout, stderr } = await run(bin, args);
      out.push({ name, ok: true, required, path: bin, version: (stdout || stderr).split('\n')[0].trim() });
    } catch (e) {
      out.push({ name, ok: false, required, path: bin, error: e.message.slice(0, 200) });
    }
  }
  // Python packages the pipeline needs (dev installs only; the packaged helper has them built in).
  if (!mediaHelper()) try {
    const { stdout } = await run(python(), ['-c',
      'import importlib.util as u, json; print(json.dumps({m: bool(u.find_spec(m)) for m in ["faster_whisper","cv2","numpy","PIL"]}))']);
    const mods = jsonFrom(stdout);
    for (const [m, ok] of Object.entries(mods)) {
      out.push({ name: `python: ${m}`, ok, required: true, path: '.venv', version: ok ? 'installed' : '', error: ok ? undefined : 'Missing' });
    }
  } catch { /* python missing already reported */ }
  return out.map((t) => ({ ...t, ...(TOOL_INFO[t.name] || { title: t.name, about: '' }) }));
}

/** Friendly names for the Tools screen: what each helper does, in plain words. */
export const TOOL_INFO = {
  ffmpeg: { title: 'Video engine', about: 'Cuts, joins and encodes video.' },
  ffprobe: { title: 'Video reader', about: 'Reads length, size and frame rate.' },
  'yt-dlp': { title: 'YouTube downloader', about: 'Lists your channel and downloads videos.' },
  'media engine': { title: 'Media engine', about: 'Transcription, speaker tracking and captions.' },
  python: { title: 'Media engine', about: 'Runs transcription, speaker tracking and captions.' },
  'python: faster_whisper': { title: 'Speech to text', about: 'Writes down every word with its timing.' },
  'python: cv2': { title: 'Face finder', about: 'Finds the speaker so the frame can follow them.' },
  'python: PIL': { title: 'Caption drawing', about: 'Draws captions onto each frame.' },
  'python: numpy': { title: 'Math helper', about: 'Used by the media engine.' },
};

/** Try to fix one helper. Packaged builds carry everything, so a repair there means reinstalling. */
export async function repairTool(name, ctx) {
  if (mediaHelper()) throw new Error('This helper ships inside the app. Reinstall Church Studio to repair it.');
  const pip = venvBin('pip');
  if (name === 'ffmpeg' || name === 'ffprobe') {
    ctx?.progress(10, 'Reinstalling the video engine');
    await run('npm', ['rebuild', 'ffmpeg-static', '@ffprobe-installer/darwin-arm64'], { cwd: ROOT, signal: ctx?.signal });
  } else if (name === 'yt-dlp') {
    ctx?.progress(10, 'Updating the YouTube downloader');
    await run(pip, ['install', '-U', 'yt-dlp'], { signal: ctx?.signal });
  } else {
    ctx?.progress(10, 'Reinstalling the media engine');
    await run(pip, ['install', '-r', path.join(SCRIPTS_DIR, 'requirements.txt')], { signal: ctx?.signal });
  }
  found.clear();
  ctx?.progress(100, 'Repaired');
  return { ok: true };
}
