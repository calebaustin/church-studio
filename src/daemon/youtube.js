// YouTube ingest with yt-dlp: list the owner's channel (uploads + past livestreams) and
// download one video into a project. No login and no API key needed.
import { copyFile, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, tool, probe, pyCommand } from './tools.js';

const ytdlp = (args, opts) => run(...pyCommand('yt-dlp', args), opts).catch((e) => { throw Object.assign(new Error(plainYtError(e.message)), { stdout: e.stdout }); });

/** yt-dlp's errors in plain words, without its "report this issue on GitHub" advice. */
export function plainYtError(msg) {
  const m = String(msg || '');
  if (/CERTIFICATE_VERIFY_FAILED|SSL: |certificate verify failed/i.test(m)) return 'Couldn’t make a secure connection to YouTube. Update Church Studio to the newest version and try again.';
  if (/does not exist|HTTP Error 404|This channel is not available|Unable to recognize tab page|not a valid URL/i.test(m)) return 'YouTube doesn’t know that channel. Check the link or handle.';
  if (/Sign in to confirm|not a bot/i.test(m)) return 'YouTube asked to confirm this isn’t a robot. Wait a few minutes and try again.';
  if (/getaddrinfo|Name or service not known|nodename nor servname|Failed to resolve|timed out|Network is unreachable|Connection refused|Temporary failure/i.test(m)) return 'Couldn’t reach YouTube. Check your internet connection and try again.';
  if (/Cancelled/.test(m)) return 'Cancelled';
  const line = (m.match(/ERROR:\s*(.*)/) || [null, m])[1]
    .replace(/^\[[^\]]+\]\s*[^:]*:\s*/, '')
    .replace(/;?\s*please report this issue[\s\S]*$/i, '')
    .replace(/Confirm you are on the latest version[\s\S]*$/i, '')
    .trim();
  return line.slice(0, 220) || 'YouTube didn’t answer the way we expected. Try again in a minute.';
}
import { createProject, deleteProject, file, getProject, updateProject } from './projects.js';
import { existsSync } from 'node:fs';
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
/**
 * When a livestream has no captions yet, how long until YouTube likely adds them. YouTube makes automatic captions
 * after a stream ends, usually within a few hours (longer streams take longer).
 */
export function captionWait(info, hasCaptions, now = Date.now()) {
  if (hasCaptions) return {};
  if (info.live_status === 'is_live' || info.is_live) return { live: true, captionNote: 'This stream is still live. YouTube adds captions after it ends.' };
  const wasLive = info.live_status === 'was_live' || info.live_status === 'post_live' || info.was_live;
  if (!wasLive) return { captionNote: 'This video has no captions, so the sermon can\'t be found ahead of time. Set the start and end yourself, or download it all.' };
  const started = Number(info.release_timestamp || info.timestamp || 0) * 1000;
  const ended = started ? started + Number(info.duration || 0) * 1000 : 0;
  const since = ended ? (now - ended) / 3600000 : null;
  // Roughly 2 hours, plus an hour for every hour of stream; past that it may not get captions at all.
  const expect = 2 + Math.ceil(Number(info.duration || 0) / 3600);
  const left = since == null ? null : Math.max(0, Math.ceil(expect - since));
  if (left === 0) return { captionWait: 0, captionNote: 'YouTube hasn\'t added captions to this stream yet. They usually come within a few hours, so try again later, or set the start and end yourself.' };
  return { captionWait: left, captionNote: `This stream ended ${since != null ? (since < 1 ? 'less than an hour' : `about ${Math.round(since)} hour${Math.round(since) === 1 ? '' : 's'}`) + ' ago' : 'recently'}. YouTube usually adds captions within a few hours. Try again in about ${left ?? 3} hour${left === 1 ? '' : 's'}, or set the start and end yourself.` };
}

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
      sermon, captions: words.length > 0, ...captionWait(info, words.length > 0),
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
    const m = [...chunk.matchAll(/PROGRESS\s+([\d.]+)%(?:\|(\S*)\|(\S*)\|(\S*)\|(\S*))?/g)].pop();
    if (m) {
      // Bytes, total and speed from yt-dlp ("NA" when it doesn't know yet). The bar follows the bytes, so it
      // always matches "10.5 MB of 371.7 MB"; yt-dlp's own percent can drift on livestream recordings.
      const n = (x) => (x && x !== 'NA' && Number.isFinite(Number(x)) ? Number(x) : 0);
      const got = n(m[2]); const total = n(m[3]) || n(m[4]);
      const p = total > 0 ? Math.min(100, (got / total) * 100) : Number(m[1]) || 0;
      // The video is nearly all of the size, so it gets nearly all of the bar; the audio is the last sliver.
      if (phase === 0) report(p * (part ? 0.88 : 0.93), 'Downloading video');
      else report((part ? 88 : 93) + p * 0.04, 'Downloading audio');
      if (m[2] !== undefined) ctx.transfer(got, total, n(m[5]));
      ctx.detail({ Part: phase === 0 ? 'Video (1 of 2)' : 'Audio (2 of 2)', From: 'YouTube' });
    }
    if (/\[Merger\]|Merging formats/.test(chunk)) report(part ? 91 : 96, 'Putting video and audio together');
  };
  try { await ytdlp([
    '--no-playlist', '--no-warnings', '--newline', '--ffmpeg-location', tool('ffmpeg'),
    // YouTube slows each connection down, so fetch several pieces at once (livestream recordings come in
    // many small pieces) and ask for whole files in 10 MB chunks, which it serves at full speed.
    '--concurrent-fragments', '4', '--http-chunk-size', '10M',
    '-f', 'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b',
    '--merge-output-format', 'mp4',
    '--progress-template', 'download:PROGRESS %(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s',
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
export async function importLocalFile(filePath, ctx, kind = 'sermon') {
  const st = await stat(filePath).catch(() => null);
  if (!st?.isFile()) throw new Error('File not found.');
  const title = path.basename(filePath).replace(/\.[^.]+$/, '');
  const project = await createProject({ title, kind: ['sermon', 'short', 'lyric', 'wide'].includes(kind) ? kind : 'sermon' });
  ctx.progress(5, 'Copying the file into the project…');
  const ext = path.extname(filePath).toLowerCase() || '.mp4';
  const dest = file(project.id, `source${ext}`);
  await copyFile(filePath, dest);
  return finishIngest(project.id, dest, ctx);
}

/** Swap in a new video or recording for an existing project. Its clips stay; it needs transcribing again. */
export async function replaceSource(id, filePath, ctx) {
  const st = await stat(filePath).catch(() => null);
  if (!st?.isFile()) throw new Error('File not found.');
  ctx.progress(5, 'Copying the file into the project…');
  const ext = path.extname(filePath).toLowerCase() || '.mp4';
  const dest = file(id, `source-${Date.now().toString(36)}${ext}`);
  await copyFile(filePath, dest);
  // A shared project arrives with its transcript but no video: keep the transcript and its clips.
  const before = await getProject(id);
  const keep = Boolean(before?.needsMedia && existsSync(file(id, 'transcript.json')));
  await updateProject(id, (p) => { p.status = 'ready'; p.blank = false; });
  const out = await finishIngest(id, dest, ctx);
  if (keep) await updateProject(id, (p) => { p.status = 'transcribed'; delete p.needsMedia; });
  return out;
}

const fmtDur = (t) => { t = Math.round(t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

export async function finishIngest(id, source, ctx) {
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
