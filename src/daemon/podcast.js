// A podcast episode from a sermon: the sermon's audio (with its cleanup), optional intro and outro
// music from the brand library's Audio folder, leveled to podcast loudness, with episode details,
// cover art from the primary logo, and show notes saved next to it.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run, tool } from './tools.js';
import { file, getProject, updateProject } from './projects.js';
import { loadConfig } from './config.js';
import { audioFilter } from './audio.js';
import { libraryFile } from './library.js';
import { downloadsDir } from './render.js';
import { outline } from './writing.js';

const safe = (t) => String(t).replace(/[/\\:*?"<>|]+/g, '-').slice(0, 100);

export async function exportPodcast(projectId, { intro = null, outro = null, format = 'mp3', whole = false, title = '' } = {}, ctx) {
  const project = await getProject(projectId);
  if (!project?.sourceFile) throw new Error('This project has no recording yet.');
  const cfg = await loadConfig();
  const range = !whole && project.sermon?.confirmed ? project.sermon : null;
  const start = range ? range.start : 0;
  const len = range ? range.end - range.start : project.media?.duration || 0;
  const introFile = intro ? await libraryFile(intro) : null;
  const outroFile = outro ? await libraryFile(outro) : null;
  const logoRel = cfg.appLogo;
  const logo = logoRel ? await libraryFile(logoRel) : null;
  const cover = logo && /\.(png|jpe?g)$/i.test(logo) ? logo : null;

  const name = (title || project.title).trim();
  const ext = format === 'm4a' ? 'm4a' : 'mp3';
  const folder = cfg.exportFolder && existsSync(cfg.exportFolder) ? cfg.exportFolder : downloadsDir();
  await mkdir(folder, { recursive: true });
  const out = path.join(folder, `${new Date().toISOString().slice(0, 10)} - ${safe(name)} (podcast).${ext}`);

  // Inputs: sermon audio, then the intro and outro if chosen, then cover art.
  const args = ['-y', '-loglevel', 'error', '-progress', 'pipe:2', '-ss', String(start), '-t', String(len), '-i', file(projectId, project.sourceFile)];
  if (introFile) args.push('-i', introFile);
  if (outroFile) args.push('-i', outroFile);
  if (cover && ext === 'mp3') args.push('-i', cover);
  const clean = audioFilter(project.audioCleanup);
  const norm = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const parts = [`[0:a]${clean ? `${clean},` : ''}${norm}[main]`];
  const order = [];
  let k = 1;
  if (introFile) { parts.push(`[${k}:a]${norm}[intro]`); order.push('[intro]'); k++; }
  order.push('[main]');
  if (outroFile) { parts.push(`[${k}:a]${norm}[outro]`); order.push('[outro]'); k++; }
  parts.push(`${order.join('')}concat=n=${order.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
  args.push('-filter_complex', parts.join(';'), '-map', '[aout]');
  if (cover && ext === 'mp3') args.push('-map', `${k}:v`, '-c:v', 'mjpeg', '-disposition:v', 'attached_pic', '-metadata:s:v', 'title=Cover');
  const church = cfg.churchInfo?.name || '';
  const meta = { title: name, artist: church, album_artist: church, album: project.series || (church ? `${church} sermons` : 'Sermons'), date: new Date().getFullYear(), genre: 'Podcast', comment: 'Made with Church Studio' };
  for (const [key, v] of Object.entries(meta)) if (v) args.push('-metadata', `${key}=${v}`);
  args.push(...(ext === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '128k', '-id3v2_version', '3'] : ['-c:a', 'aac', '-b:a', '128k']), out);

  ctx.progress(2, 'Making the episode…');
  const total = len + (introFile ? 30 : 0) + (outroFile ? 30 : 0);
  await run(tool('ffmpeg'), args, {
    signal: ctx.signal,
    onStderr: (chunk) => {
      const m = [...String(chunk).matchAll(/out_time_ms=(\d+)/g)].pop();
      if (m && total) ctx.progress(Math.min(96, (Number(m[1]) / 1e6 / total) * 96), 'Making the episode…');
    },
  });

  // Show notes: a summary and the scripture, ready to paste into a podcast host.
  ctx.progress(97, 'Writing show notes…');
  let notes = `${name}\n\n`;
  try {
    const o = await outline(projectId);
    if (o.quotes?.[0]) notes += `${o.quotes[0]}\n\n`;
    if (o.points?.length) notes += `In this message:\n${[...new Set(o.points.map((p) => p.heading))].map((h) => `- ${h}`).join("\n")}\n\n`;
    if (o.refs?.length) notes += `Scripture: ${o.refs.join(', ')}\n\n`;
  } catch { /* no transcript: just the title */ }
  if (project.sourceUrl) notes += `Watch the full service: ${project.sourceUrl}\n`;
  if (church) notes += `${church}${cfg.churchInfo?.website ? ` · ${cfg.churchInfo.website}` : ''}\n`;
  const notesFile = out.replace(/\.[a-z0-9]+$/, ' show notes.txt');
  await writeFile(notesFile, notes);
  await updateProject(projectId, (p) => { p.podcasts = [{ file: out, notes: notesFile, at: new Date().toISOString() }, ...(p.podcasts || [])].slice(0, 10); });
  ctx.progress(100, `Saved ${path.basename(out)}`);
  return { file: out, notes: notesFile, projectId };
}
