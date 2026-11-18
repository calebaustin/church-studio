// Scene strip: small frames every few seconds so a long service is easy to scan for the sermon.
// Decodes keyframes only (-skip_frame nokey), so a 90-minute video takes seconds, not minutes.
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { run, tool } from './tools.js';
import { file, getProject, projectDir, updateProject } from './projects.js';

export function thumbInterval(duration) {
  if (duration > 2 * 3600) return 15;
  if (duration > 3600) return 10;
  if (duration > 1200) return 5;
  return 2;
}

export async function makeThumbs(id, ctx) {
  const p = await getProject(id);
  if (!p?.sourceFile) throw new Error('The video is not downloaded yet.');
  const dir = path.join(projectDir(id), 'thumbs');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const every = thumbInterval(p.media?.duration || 0);
  const total = Math.ceil((p.media?.duration || 1) / every);
  ctx?.progress(2, 'Making the scene strip…');
  await run(tool('ffmpeg'), [
    '-loglevel', 'error', '-skip_frame', 'nokey', '-i', file(id, p.sourceFile), '-an',
    '-vf', `fps=1/${every},scale=256:-2`, '-fps_mode', 'vfr', '-q:v', '5', path.join(dir, 't%05d.jpg'),
  ], {
    signal: ctx?.signal,
    onStderr: () => {},
  });
  const count = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).length;
  await updateProject(id, (x) => { x.thumbs = { every, count, version: Date.now() }; });
  ctx?.progress(100, `Scene strip ready (${count} frames)`);
  return { every, count, total };
}
