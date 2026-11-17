// YouTube ingest with yt-dlp: list the owner's channel (uploads + past livestreams) and
// download one video into a project. No login and no API key needed.
// Adapted from VGP Clips src/episodes.js (recentEpisodes / addEpisodeUrl).
import { copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { run, tool, probe } from './tools.js';
import { createProject, file, updateProject } from './projects.js';

/** "@church", "youtube.com/@church", ".../channel/UC…" → base channel URL without a tab. */
export function channelBase(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Set your YouTube channel in Settings first.');
  if (s.startsWith('@')) s = `https://www.youtube.com/${s}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!/(^|\.)youtube\.com$/i.test(u.hostname)) throw new Error('That does not look like a YouTube channel URL.');
  u.pathname = u.pathname.replace(/\/(videos|streams|shorts|featured|live|playlists)\/?$/i, '');
  u.search = '';
  return u.toString().replace(/\/$/, '');
}

async function listTab(url, limit, signal) {
  try {
    const { stdout } = await run(tool('yt-dlp'), [
      url, '--flat-playlist', '--playlist-end', String(limit), '-J', '--no-warnings',
    ], { signal });
    return JSON.parse(stdout).entries ?? [];
  } catch (e) {
    if (/does not have a (streams|videos) tab|This channel does not have/i.test(e.message)) return [];
    throw e;
  }
}

export async function listChannel(channel, { limit = 30 } = {}) {
  const base = channelBase(channel);
  const [videos, streams] = await Promise.all([
    listTab(`${base}/videos`, limit),
    listTab(`${base}/streams`, limit),
  ]);
  const seen = new Set();
  return [...streams.map((e) => ({ ...e, _live: true })), ...videos]
    .filter((e) => e.id && !seen.has(e.id) && seen.add(e.id))
    .filter((e) => !e.duration || e.duration > 5 * 60) // sermons, not shorts
    .map((e) => ({
      id: e.id,
      url: `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title,
      duration: e.duration ?? null,
      live: Boolean(e._live),
      uploaded: e.upload_date ?? e.timestamp ?? null,
      thumb: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
    }));
}

function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    return u.searchParams.get('v') || u.pathname.match(/\/(live|shorts|embed)\/([\w-]{6,})/)?.[2] || null;
  } catch {
    return null;
  }
}

/** Create a project for a YouTube URL and download it (≤1080p, H.264 when available). */
export async function downloadToProject(url, ctx, existingProject = null) {
  const bin = tool('yt-dlp');
  let project = existingProject;
  if (!project) {
    ctx.progress(1, 'Reading video details…');
    const { stdout } = await run(bin, ['--no-playlist', '--no-warnings', '--print', 'title', '--skip-download', url], { signal: ctx.signal });
    const id = youtubeId(url);
    project = await createProject({
      title: stdout.trim().split(/\r?\n/)[0] || 'Sermon',
      sourceUrl: url, youtubeId: id,
      thumbnail: id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null,
    });
  }
  await updateProject(project.id, (p) => { p.status = 'downloading'; });
  ctx.progress(3, 'Downloading…');
  const out = file(project.id, 'source.mp4');
  await run(bin, [
    '--no-playlist', '--no-warnings', '--newline',
    '-f', 'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b',
    '--merge-output-format', 'mp4',
    '--progress-template', 'download:PROGRESS %(progress._percent_str)s',
    '-o', out, url,
  ], {
    signal: ctx.signal,
    onStdout: (chunk) => {
      const m = [...chunk.matchAll(/PROGRESS\s+([\d.]+)%/g)].pop();
      if (m) ctx.progress(3 + Number(m[1]) * 0.9, `Downloading… ${Math.round(Number(m[1]))}%`);
    },
  });
  return finishIngest(project.id, out, ctx);
}

/** Use a video file already on this computer. It is copied so the project is self-contained. */
export async function importLocalFile(filePath, ctx) {
  const st = await stat(filePath).catch(() => null);
  if (!st?.isFile()) throw new Error('File not found.');
  const title = path.basename(filePath).replace(/\.[^.]+$/, '');
  const project = await createProject({ title });
  ctx.progress(5, 'Copying video into the project…');
  const ext = path.extname(filePath).toLowerCase() || '.mp4';
  const dest = file(project.id, `source${ext}`);
  await copyFile(filePath, dest);
  return finishIngest(project.id, dest, ctx);
}

async function finishIngest(id, source, ctx) {
  ctx.progress(96, 'Checking the video…');
  const media = await probe(source);
  await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', String(Math.min(60, media.duration * 0.1)), '-i', source,
    '-frames:v', '1', '-vf', 'scale=640:-2', file(id, 'poster.jpg')]).catch(() => {});
  const project = await updateProject(id, (p) => {
    p.sourceFile = path.basename(source);
    p.media = media;
    p.poster = 'poster.jpg';
    p.status = 'ready';
  });
  ctx.progress(100, 'Video ready');
  return { projectId: project.id };
}
