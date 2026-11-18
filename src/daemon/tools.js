// Finds and runs the outside programs the daemon leans on: ffmpeg, ffprobe, yt-dlp, Python.
// Resolution order (first that exists wins):
//   1. <NAME>_PATH env override
//   2. tools bundled in the packaged app (SC_RESOURCES/bin, SC_RESOURCES/sc-media)
//   3. npm-bundled static ffmpeg/ffprobe (dev)
//   4. the project .venv (yt-dlp, python)
//   5. Homebrew / system folders (a Finder-launched app doesn't inherit the shell PATH)
// Code lives in ROOT; user data lives in HOME (Application Support when packaged).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HOME = process.env.SC_HOME || ROOT;
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
  };
}

/**
 * Run a program and collect its output. Rejects on a non-zero exit with the tail of stderr.
 * `onStderr`/`onStdout` stream chunks (used for progress). `signal` lets a job cancel it.
 */
export function run(cmd, args, { cwd = ROOT, input, onStderr, onStdout, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      env: childEnv(),
    });
    let stdout = '';
    let stderr = '';
    const abort = () => child.kill('SIGTERM');
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
    child.on('error', (err) => reject(new Error(`Could not start ${path.basename(cmd)}: ${err.message}`)));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
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
    const mods = JSON.parse(stdout.trim());
    for (const [m, ok] of Object.entries(mods)) {
      out.push({ name: `python: ${m}`, ok, required: true, path: '.venv', version: ok ? 'installed' : '', error: ok ? undefined : 'Run scripts/setup.sh' });
    }
  } catch { /* python missing already reported */ }
  return out;
}
