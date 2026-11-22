// A small copy of a project's video just for the editor's preview: 480p, with a keyframe every 0.4 seconds.
// Jumping across a cut in the full video waits on the nearest keyframe (often seconds back), which made the
// preview stutter at every cut; in this copy a jump is nearly instant. Exports always use the original.
import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { file, getProject, updateProject } from './projects.js';
import { run, tool } from './tools.js';

export async function makeProxy(id, ctx) {
  const p = await getProject(id);
  if (!p?.sourceFile || !p.media?.width) throw new Error('This project has no video to preview.');
  if (p.proxy && existsSync(file(id, p.proxy))) return { proxy: p.proxy };
  const tmp = file(id, 'preview.tmp.mp4'); const out = file(id, 'preview.mp4');
  const dur = p.media.duration || 1; const began = Date.now();
  ctx.progress(1, 'Making a smooth preview copy…');
  await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-progress', 'pipe:2', '-nostats', '-i', file(id, p.sourceFile),
    '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'fastdecode', '-crf', '30', '-g', '12', '-keyint_min', '12', '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp], {
    signal: ctx.signal,
    onStderr: (s) => {
      const m = String(s).match(/out_time_ms=(\d+)/g); if (!m) return;
      const t = Number(m.at(-1).split('=')[1]) / 1e6; const secs = (Date.now() - began) / 1000;
      ctx.progress(Math.min(99, (t / dur) * 100), 'Making a smooth preview copy…');
      ctx.detail?.({ Position: `${Math.round(t / 60)} of ${Math.round(dur / 60)} min`, Speed: secs > 2 ? `${(t / secs).toFixed(1)}× real time` : null });
    },
  }).catch(async (e) => { await rm(tmp, { force: true }); throw e; });
  await rename(tmp, out);
  await updateProject(id, (x) => { x.proxy = 'preview.mp4'; });
  ctx.progress(100, 'Preview ready');
  return { proxy: 'preview.mp4' };
}
