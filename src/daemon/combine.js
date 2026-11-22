// Put several videos together into one, then work with it like any other video: transcribe, find clips,
// caption and export. Three layouts:
//   sequence  one after another, like a Reel made of a few clips
//   side      side by side, like two people talking, each filmed on their own camera
//   stack     one above the other, the same conversation laid out for a vertical video
// Each video can start a little later (trim) so two cameras line up.
import path from 'node:path';
import { createProject, file } from './projects.js';
import { probe, run, tool } from './tools.js';
import { finishIngest } from './youtube.js';

const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const SHAPES = { vertical: [1080, 1920], wide: [1920, 1080], square: [1080, 1080] };

/**
 * The ffmpeg filter that makes one video from the inputs. Pure (no files touched), so it can be tested.
 * inputs: [{ duration, hasAudio, width, height, trim, length }] in order. Returns { filter, duration, size }.
 */
export function combineFilter(inputs, { layout = 'sequence', shape = 'vertical' } = {}) {
  const [W, H] = SHAPES[shape] || SHAPES.vertical;
  const len = (x) => Math.max(0.5, Math.min(x.length || Infinity, (x.duration || 0) - (x.trim || 0)));
  const parts = [];
  // Every input: trimmed, the same frame rate, and audio at the same rate (silence when it has none).
  const fit = (i, w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  inputs.forEach((x, i) => {
    const t0 = x.trim || 0; const d = len(x);
    const [w, h] = layout === 'side' ? [even(W / inputs.length), H] : layout === 'stack' ? [W, even(H / inputs.length)] : [W, H];
    // In a sequence, a video that doesn't match the shape sits on a blurred copy of itself instead of being cropped hard.
    const v = layout === 'sequence'
      ? `[${i}:v]trim=start=${t0}:duration=${d},setpts=PTS-STARTPTS,fps=30,split=2[f${i}][b${i}];[b${i}]${fit(i, W, H)},boxblur=24:2,eq=brightness=-0.08[bb${i}];[f${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[ff${i}];[bb${i}][ff${i}]overlay=(W-w)/2:(H-h)/2[v${i}]`
      : `[${i}:v]trim=start=${t0}:duration=${d},setpts=PTS-STARTPTS,fps=30,${fit(i, w, h)}[v${i}]`;
    parts.push(v);
    parts.push(x.hasAudio
      ? `[${i}:a]atrim=start=${t0}:duration=${d},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${d}[a${i}]`);
  });
  const n = inputs.length;
  const vs = inputs.map((_, i) => `[v${i}]`).join(''); const as = inputs.map((_, i) => `[a${i}]`).join('');
  let duration;
  if (layout === 'sequence') {
    parts.push(`${inputs.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${n}:v=1:a=1[vout][aout]`);
    duration = inputs.reduce((s, x) => s + len(x), 0);
  } else {
    // Side by side or stacked: everyone at once. The shorter videos hold their last frame; the voices mix.
    parts.push(`${vs}${layout === 'side' ? 'hstack' : 'vstack'}=inputs=${n}:shortest=0,scale=${W}:${H},setsar=1[vout]`);
    parts.push(`${as}amix=inputs=${n}:duration=longest:normalize=0,alimiter=limit=0.95[aout]`);
    duration = Math.max(...inputs.map(len));
  }
  return { filter: parts.join(';'), duration, size: [W, H] };
}

/** Combine local video files into a new project. files: [{ path, trim }] in order. */
export async function combineFiles(files, { layout = 'sequence', shape = 'vertical', title, kind = 'short' } = {}, ctx) {
  if (!Array.isArray(files) || files.length < 2) throw new Error('Pick at least two videos.');
  if (files.length > 12) throw new Error('Combine up to 12 videos at a time.');
  if (layout !== 'sequence' && files.length > 4) throw new Error('Side by side and stacked work with up to 4 videos.');
  ctx.progress(2, 'Checking the videos…');
  const inputs = [];
  for (const f of files) {
    const m = await probe(f.path).catch(() => null);
    if (!m?.width) throw new Error(`${path.basename(f.path)} isn't a video Church Studio can read.`);
    inputs.push({ ...m, trim: Math.max(0, Number(f.trim) || 0), length: Number(f.length) || 0 });
  }
  const { filter, duration } = combineFilter(inputs, { layout, shape });
  const name = String(title || '').trim() || (layout === 'sequence' ? `${files.length} videos together` : `${files.length} videos side by side`);
  const project = await createProject({ title: name.slice(0, 120), kind: ['short', 'wide', 'sermon'].includes(kind) ? kind : 'short' });
  const out = file(project.id, 'source.mp4');
  const args = ['-y', '-loglevel', 'error', '-progress', 'pipe:2', '-nostats'];
  for (const f of files) args.push('-i', f.path);
  args.push('-filter_complex', filter, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(duration.toFixed(2)), out);
  const began = Date.now();
  await run(tool('ffmpeg'), args, {
    signal: ctx.signal,
    onStderr: (s) => {
      const m = String(s).match(/out_time_ms=(\d+)/g);
      if (!m) return;
      const t = Number(m.at(-1).split('=')[1]) / 1e6;
      const secs = (Date.now() - began) / 1000;
      ctx.progress(4 + 90 * Math.min(1, t / duration), 'Putting the videos together…');
      ctx.detail?.({ Videos: String(files.length), Position: `${Math.round(t)}s of ${Math.round(duration)}s`, Speed: secs > 2 ? `${(t / secs).toFixed(1)}× real time` : null });
    },
  });
  const r = await finishIngest(project.id, out, ctx);
  return { ...r, projectId: project.id };
}
