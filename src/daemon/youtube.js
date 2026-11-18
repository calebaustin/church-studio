// YouTube ingest with yt-dlp: list the owner's channel (uploads + past livestreams) and
// download one video into a project. No login and no API key needed.
import { copyFile, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, tool, probe, pyCommand } from './tools.js';

const ytdlp = (args, opts) => run(...pyCommand('yt-dlp', args), opts);
import { createProject, deleteProject, file, updateProject } from './projects.js';
import { makeThumbs } from './thumbs.js';
import { detectSermon } from './sermon.js';

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
    const { stdout } = await ytdlp([
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

/** The channel page as YouTube shows it: name, handle, subscribers, picture, banner and latest uploads. */
export async function channelDetails(channel) {
  const base = channelBase(channel);
  const { stdout } = await ytdlp([`${base}/videos`, '--flat-playlist', '--playlist-end', '6', '-J', '--no-warnings']);
  const j = JSON.parse(stdout);
  const thumbs = j.thumbnails || [];
  const pickId = (id) => thumbs.find((t) => t.id === id)?.url;
  const square = thumbs.filter((t) => t.width && t.height && Math.abs(t.width - t.height) < 4).sort((a, b) => b.width - a.width)[0]?.url;
  const wide = thumbs.filter((t) => t.width && t.height && t.width > t.height * 2).sort((a, b) => b.width - a.width)[0]?.url;
  return {
    name: j.channel || j.uploader || j.title, handle: j.uploader_id || null, url: j.uploader_url || j.channel_url || base,
    followers: j.channel_follower_count ?? null, description: (j.description || '').slice(0, 280),
    avatar: pickId('avatar_uncropped') || square || thumbs[0]?.url || null, banner: pickId('banner_uncropped') || wide || null,
    videos: (j.entries || []).filter((e) => e.id).slice(0, 4).map((e) => ({ id: e.id, title: e.title, duration: e.duration ?? null, views: e.view_count ?? null, thumb: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`, url: `https://www.youtube.com/watch?v=${e.id}` })),
  };
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
/** YouTube auto-caption json3 -> words with timings. Bracketed tags like [Music] are dropped. */
export function json3Words(data) {
  const words = [];
  for (const ev of data.events || []) {
    if (!ev.segs) continue;
    const base = ev.tStartMs || 0;
    const evEnd = base + (ev.dDurationMs || 0);
    const segs = ev.segs.filter((sg) => sg.utf8 && sg.utf8.trim() && !/^\[.*\]$/.test(sg.utf8.trim()));
    segs.forEach((sg, i) => {
      const start = base + (sg.tOffsetMs || 0);
      const next = segs[i + 1] ? base + (segs[i + 1].tOffsetMs || 0) : Math.min(evEnd, start + 800);
      for (const w of sg.utf8.trim().split(/\s+/)) words.push({ w, start: start / 1000, end: Math.max(start + 120, next) / 1000 });
    });
  }
  return words.sort((a, b) => a.start - b.start);
}

/**
 * Look at a video before downloading it: title, length, chapters, and (from YouTube's own
 * captions) where the sermon probably is. Nothing big is downloaded.
 */
export async function scoutVideo(url) {
  const dir = await mkdtemp(path.join(tmpdir(), 'sc-scout-'));
  try {
    const { stdout } = await ytdlp([
      url, '--no-playlist', '--no-warnings', '--skip-download', '--no-simulate', '--dump-single-json',
      '--write-auto-subs', '--write-subs', '--sub-langs', 'en.*,en', '--sub-format', 'json3', '-o', path.join(dir, 'v.%(ext)s'),
    ]);
    const info = JSON.parse(stdout);
    const subs = (await readdir(dir)).filter((f) => f.endsWith('.json3'));
    let words = [];
    if (subs.length) {
      const pick = subs.find((f) => /\.en\.json3$/.test(f)) || subs[0];
      words = json3Words(JSON.parse(await readFile(path.join(dir, pick), 'utf8')));
    }
    const sermon = words.length > 50 ? detectSermon(words, info.duration) : null;
    if (sermon) {
      delete sermon.bins;
      const near = (t, after) => (after ? words.filter((w) => w.start >= t).slice(0, 14) : words.filter((w) => w.end <= t).slice(-14)).map((w) => w.w).join(' ');
      sermon.startText = near(sermon.start, true);
      sermon.endText = near(sermon.end, false);
    }
    return {
      id: info.id, title: info.title, duration: info.duration, thumb: info.thumbnail,
      chapters: (info.chapters || []).map((c) => ({ title: c.title, start: c.start_time, end: c.end_time })),
      sermon, captions: words.length > 0,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function downloadToProject(url, ctx, existingProject = null, range = null) {
  let project = existingProject;
  if (!project) {
    ctx.progress(1, 'Reading video details…');
    const { stdout } = await ytdlp(['--no-playlist', '--no-warnings', '--print', 'title', '--skip-download', url], { signal: ctx.signal });
    const id = youtubeId(url);
    project = await createProject({
      title: stdout.trim().split(/\r?\n/)[0] || 'Sermon',
      sourceUrl: url, youtubeId: id,
      thumbnail: id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null,
    });
  }
  const part = range && range.end > range.start ? range : (project.range || null);
  if (part) await updateProject(project.id, (p) => { p.range = { start: part.start, end: part.end }; });
  await updateProject(project.id, (p) => { p.status = 'downloading'; });
  ctx.progress(2, part ? 'Starting the sermon download' : 'Starting the download');
  const out = file(project.id, 'source.mp4');
  const full = file(project.id, 'full.mp4');
  // One steady bar across the stages: video stream, audio stream, then joining them.
  let phase = 0; // 0 = video, 1 = audio
  const report = (pct, what) => ctx.progress(Math.min(97, pct), what);
  const parse = (chunk) => {
    if (/Destination: .*\.(m4a|webm|mp3|opus)\s*$/m.test(chunk) || /\[download\] Destination: .*\.f\d+\.(m4a|webm)/.test(chunk)) phase = 1;
    const m = [...chunk.matchAll(/PROGRESS\s+([\d.]+)%/g)].pop();
    if (m) {
      const p = Number(m[1]);
      if (phase === 0) report(3 + p * (part ? 0.78 : 0.82), 'Downloading video');
      else report((part ? 81 : 85) + p * 0.1, 'Downloading audio');
    }
    if (/\[Merger\]|Merging formats/.test(chunk)) report(part ? 91 : 96, 'Putting video and audio together');
  };
  try { await ytdlp([
    '--no-playlist', '--no-warnings', '--newline', '--ffmpeg-location', tool('ffmpeg'),
    '-f', 'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b',
    '--merge-output-format', 'mp4',
    '--progress-template', 'download:PROGRESS %(progress._percent_str)s',
    '-o', part ? full : out, url,
  ], { signal: ctx.signal, onStdout: parse, onStderr: parse });
    if (part) {
      // YouTube serves whole files far faster than ranges, so cut the sermon out locally (no re-encode).
      ctx.progress(93, 'Cutting out the sermon');
      await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, part.start)), '-to', String(part.end),
        '-i', full, '-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', out], { signal: ctx.signal });
      await rm(full, { force: true });
    }
  } catch (e) {
    // Stopped a brand-new download: remove the half-made project instead of leaving it behind.
    if (ctx.signal.aborted && !existingProject) await deleteProject(project.id).catch(() => {});
    throw e;
  }
  return finishIngest(project.id, out, ctx);
}

/** Use a video file already on this computer. It is copied so the project is self-contained. */
export async function importLocalFile(filePath, ctx) {
  const st = await stat(filePath).catch(() => null);
  if (!st?.isFile()) throw new Error('File not found.');
  const title = path.basename(filePath).replace(/\.[^.]+$/, '');
  const project = await createProject({ title });
  ctx.progress(5, 'Copying the file into the project…');
  const ext = path.extname(filePath).toLowerCase() || '.mp4';
  const dest = file(project.id, `source${ext}`);
  await copyFile(filePath, dest);
  return finishIngest(project.id, dest, ctx);
}

const fmtDur = (t) => { t = Math.round(t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

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
  await makeThumbs(id, null).catch((e) => console.error('[thumbs]', e.message));
  const size = (await stat(source)).size;
  const summary = `${project.title}: ${fmtDur(media.duration)}, ${media.height ? `${media.height}p` : 'audio'}, ${(size / 1073741824 >= 1 ? `${(size / 1073741824).toFixed(1)} GB` : `${Math.round(size / 1048576)} MB`)}`;
  ctx.progress(100, project.range ? 'Sermon downloaded' : media.height ? 'Video ready' : 'Recording ready');
  return { projectId: project.id, title: project.title, duration: media.duration, height: media.height, bytes: size, range: project.range || null, summary };
}
