// Audio cleanup with plain ffmpeg filters. No AI, no models, nothing to download.
// Each preset is a short chain tuned for one common church recording problem. "Amount" (0 to 1)
// scales how hard the chain works, so a light touch stays natural and a strong one rescues more.
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, probe, run, tool } from './tools.js';
import { downloadsDir } from './render.js';

export const AUDIO_PRESETS = [
  { id: 'voice', name: 'Clear voice', about: 'A light cleanup for most recordings. Softens hiss and evens out the volume.' },
  { id: 'room', name: 'Loud room', about: 'Turns down crowd noise, air handling and some echo around the speaker.' },
  { id: 'far', name: 'Far from the mic', about: 'Lifts a quiet, distant voice and makes words easier to hear.' },
  { id: 'outside', name: 'Recorded outside', about: 'Cuts wind rumble and traffic noise.' },
  { id: 'hum', name: 'Hum or buzz', about: 'Removes the low electrical hum from cables, lights and speakers.' },
  { id: 'phone', name: 'Phone or laptop', about: 'Warms up thin audio and tames harsh, tinny sounds.' },
];

const f = (n, d = 1) => Number(n).toFixed(d);
const lerp = (a, b, t) => a + (b - a) * t;

/** The ffmpeg -af chain for a cleanup setting, or null for none. */
export function audioFilter(setting) {
  if (!setting?.preset || setting.preset === 'none') return null;
  const a = Math.max(0, Math.min(1, Number(setting.amount ?? 0.5)));
  const finish = [
    `acompressor=threshold=${f(lerp(-18, -24, a))}dB:ratio=${f(lerp(2, 4, a))}:attack=15:release=250:makeup=2`,
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ];
  const denoise = (lo, hi, floor) => `afftdn=nr=${f(lerp(lo, hi, a))}:nf=${floor}:tn=1`;
  const chains = {
    voice: ['highpass=f=75', denoise(3, 12, -40), ...finish],
    room: [`highpass=f=${Math.round(lerp(80, 130, a))}`, denoise(6, 24, -30),
      `equalizer=f=320:t=q:w=1.2:g=${f(lerp(-1.5, -5, a))}`, `equalizer=f=3200:t=q:w=1.4:g=${f(lerp(0.5, 2.5, a))}`, ...finish],
    far: ['highpass=f=70', denoise(4, 14, -35), `equalizer=f=3000:t=q:w=1.2:g=${f(lerp(2, 6, a))}`,
      `speechnorm=e=${f(lerp(3, 10, a))}:r=0.0005:l=1`, ...finish],
    outside: [`highpass=f=${Math.round(lerp(110, 220, a))}`, denoise(8, 26, -25), `lowpass=f=${Math.round(lerp(13000, 8500, a))}`, ...finish],
    hum: ['highpass=f=40', ...[60, 120, 180, 240].slice(0, a > 0.5 ? 4 : 3).map((hz) => `bandreject=f=${hz}:t=q:w=${f(lerp(12, 6, a))}:mix=${f(lerp(0.5, 1, a), 2)}`),
      denoise(2, 8, -40), ...finish],
    phone: [`highpass=f=${Math.round(lerp(90, 120, a))}`, `equalizer=f=220:t=q:w=1:g=${f(lerp(1, 4, a))}`,
      `equalizer=f=4500:t=q:w=1.5:g=${f(lerp(-1, -5, a))}`, `deesser=i=${f(lerp(0.2, 0.6, a), 2)}`, denoise(3, 12, -38), ...finish],
  };
  const chain = chains[setting.preset];
  return chain ? chain.join(',') : null;
}

const PREVIEW_DIR = path.join(DATA_DIR, 'cache', 'audio-preview');
export const previewDir = () => PREVIEW_DIR;

/**
 * Two short versions of the same moment, before and after, to compare.
 * Starts a little into the recording, where someone is likely talking.
 */
export async function previewCleanup({ source, at = null, length = 12, preset, amount }) {
  if (!source || !existsSync(source)) throw new Error('Pick an audio or video file first.');
  await mkdir(PREVIEW_DIR, { recursive: true });
  // Keep the cache small.
  for (const n of (await readdir(PREVIEW_DIR)).sort().slice(0, -12)) await rm(path.join(PREVIEW_DIR, n), { force: true });
  const info = await probe(source);
  if (!info.hasAudio) throw new Error('That file has no sound.');
  const start = at != null ? Math.max(0, Number(at)) : Math.min(Math.max(0, info.duration * 0.25), Math.max(0, info.duration - length));
  const stamp = Date.now().toString(36);
  const base = ['-y', '-loglevel', 'error', '-ss', f(start, 2), '-t', String(length), '-i', source, '-vn', '-ac', '1'];
  const before = path.join(PREVIEW_DIR, `${stamp}-before.m4a`);
  const after = path.join(PREVIEW_DIR, `${stamp}-after.m4a`);
  await run(tool('ffmpeg'), [...base, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', before]);
  const af = audioFilter({ preset, amount });
  await run(tool('ffmpeg'), [...base, ...(af ? ['-af', af] : []), '-c:a', 'aac', '-b:a', '160k', after]);
  return { start, before: `/audio-preview/${path.basename(before)}`, after: `/audio-preview/${path.basename(after)}` };
}

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.aiff', '.aif', '.caf', '.opus', '.wma']);
export const isAudioFile = (p) => AUDIO_EXT.has(path.extname(p).toLowerCase());

/** Save a cleaned copy next to Downloads. Video keeps its picture; only the sound changes. */
export async function cleanFile(source, setting, ctx) {
  if (!existsSync(source)) throw new Error('File not found.');
  const af = audioFilter(setting);
  if (!af) throw new Error('Pick a cleanup preset first.');
  const info = await probe(source);
  if (!info.hasAudio) throw new Error('That file has no sound.');
  const ext = path.extname(source).toLowerCase();
  const audioOnly = !info.width;
  const outExt = audioOnly ? (ext === '.wav' || ext === '.aiff' || ext === '.aif' ? '.wav' : '.m4a') : (ext === '.mov' ? '.mov' : '.mp4');
  const name = `${path.basename(source, ext)} (clean)${outExt}`;
  const dest = path.join(downloadsDir(), name);
  ctx.progress(2, 'Cleaning up the audio…');
  const codec = outExt === '.wav' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '192k'];
  await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-progress', 'pipe:2', '-i', source,
    ...(audioOnly ? ['-vn'] : ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy']), '-af', af, ...codec, dest], {
    signal: ctx.signal,
    onStderr: (chunk) => {
      const m = [...String(chunk).matchAll(/out_time_ms=(\d+)/g)].pop();
      if (m && info.duration) ctx.progress(Math.min(99, (Number(m[1]) / 1e6 / info.duration) * 100), 'Cleaning up the audio…');
    },
  });
  const size = (await stat(dest)).size;
  ctx.progress(100, `Saved ${name}`);
  return { file: dest, name, bytes: size };
}
