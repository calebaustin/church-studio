// Finds and runs the outside programs the daemon leans on: ffmpeg, ffprobe, yt-dlp, Python.
// Pattern from VGP Clips (src/tools.js), extended for macOS: an Electron app launched from
// Finder does not inherit the shell PATH, so Homebrew folders are searched explicitly.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = process.env.SC_DATA_DIR || path.join(ROOT, 'data');
export const PROJECTS_DIR = path.join(ROOT, 'projects');
export const SCRIPTS_DIR = path.join(ROOT, 'scripts');

const EXTRA_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
const found = new Map();

export function venvBin(name) {
  const dir = process.platform === 'win32' ? 'Scripts' : 'bin';
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return path.join(ROOT, '.venv', dir, exe);
}

/** Resolve a tool: env override, then the project venv, then Homebrew/system folders, then PATH. */
export function tool(name) {
  if (found.has(name)) return found.get(name);
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [
    process.env[`${name.toUpperCase().replace(/-/g, '_')}_PATH`],
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
 * Run a program and collect its output. Rejects on a non-zero exit with the tail of stderr.
 * `onStderr`/`onStdout` stream chunks (used for progress). `signal` lets a job cancel it.
 */
export function run(cmd, args, { cwd = ROOT, input, onStderr, onStdout, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, PATH: [...EXTRA_BIN_DIRS, process.env.PATH].join(path.delimiter), PYTHONUNBUFFERED: '1' },
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
    ['yt-dlp', tool('yt-dlp'), ['--version'], true],
    ['python', python(), ['--version'], true],
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
  // Python packages the pipeline needs.
  try {
    const { stdout } = await run(python(), ['-c',
      'import importlib.util as u, json; print(json.dumps({m: bool(u.find_spec(m)) for m in ["faster_whisper","cv2","numpy","PIL"]}))']);
    const mods = JSON.parse(stdout.trim());
    for (const [m, ok] of Object.entries(mods)) {
      out.push({ name: `python: ${m}`, ok, required: true, path: '.venv', version: ok ? 'installed' : '', error: ok ? undefined : 'Run scripts/setup.sh' });
    }
  } catch { /* python missing already reported */ }
  return out;
}
