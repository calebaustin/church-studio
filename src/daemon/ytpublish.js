// Post the sermon to YouTube as its own video: just the sermon part of the livestream, titled the church's way
// ("In Remembrance | Chris Parker 11.15.2026"), added to a playlist like "Sunday Sermons".
// YouTube's own "Clips" (the scissors on youtube.com) can't be made through YouTube's API, so the sermon is uploaded
// as a regular video instead, which is what most churches post anyway.
import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { file, getProject, updateProject } from './projects.js';
import { loadConfig, saveConfig } from './config.js';
import { run, tool } from './tools.js';
import * as store from './social/store.js';
import { googleToken } from './social/providers.js';

const CHUNK = 8 * 1024 * 1024; // a multiple of 256 KB, as YouTube asks

/** "M.D.YYYY", the way the church writes sermon dates in titles. */
export const titleDate = (d) => { const x = new Date(d); return Number.isNaN(x.getTime()) ? '' : `${x.getMonth() + 1}.${x.getDate()}.${x.getFullYear()}`; };

/**
 * Pull the sermon title, preacher and date out of a livestream title like
 * "In Remembrance | Chris Parker 11.15.2026" or "Sunday, November 8 - Sunday Worship".
 */
export function parseSermonTitle(t) {
  const s = String(t || '').trim();
  const date = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  let when = null;
  if (date) { const y = Number(date[3]) < 100 ? 2000 + Number(date[3]) : Number(date[3]); when = new Date(y, Number(date[1]) - 1, Number(date[2])); }
  // "November 8" or "Nov 8, 2026" (the year comes from the stream when it's missing).
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const named = !when && s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
  if (named) when = new Date(Number(named[3]) || new Date().getFullYear(), MONTHS.indexOf(named[1].toLowerCase()), Number(named[2]));
  const parts = s.split(/\s+[|•–—-]\s+/);
  if (parts.length >= 2) {
    const preacher = parts[1].replace(date?.[0] || '\u0000', '').trim().replace(/[,|]+$/, '');
    // A second part that reads like a name (two or three capitalized words), not "Sunday Worship".
    const nameLike = /^([A-Z][a-z'.-]+)(\s[A-Z][a-z'.-]+){1,2}$/.test(preacher) && !/worship|service|sunday|morning|live|stream/i.test(preacher);
    return { title: parts[0].trim(), preacher: nameLike ? preacher : '', date: when };
  }
  return { title: s.replace(date?.[0] || '\u0000', '').trim(), preacher: '', date: when };
}

/** What the sermon's YouTube title is made of, from what we know, then what was used last time. */
export async function sermonParts(projectId) {
  const p = await getProject(projectId);
  if (!p) throw new Error('Not found');
  const cfg = await loadConfig();
  const parsed = parseSermonTitle(p.title);
  let pd = parsed.date;
  // A year guessed for "November 8" should match the stream's year.
  if (pd && p.uploadedOn && !/\d{4}/.test(p.title)) pd = new Date(new Date(p.uploadedOn).getFullYear(), pd.getMonth(), pd.getDate());
  // The sermon's Sunday: the date in the title, then the day it was preached on YouTube, then the Sunday before it came in.
  const made = new Date(p.created);
  const sunday = new Date(made.getFullYear(), made.getMonth(), made.getDate() - made.getDay());
  const date = p.preachedOn || (pd ? pd.toISOString() : null) || p.uploadedOn || sunday.toISOString();
  // A service title ("Sunday, November 8 - Sunday Worship") isn't the sermon's title: use the blog's title if
  // there is one, or leave it to type.
  const serviceLike = /\b(sunday|worship|service|livestream|live stream|morning)\b/i.test(parsed.title);
  let title = p.sermonTitle || (serviceLike ? '' : parsed.title);
  if (!title) { try { const { loadDraft } = await import('./writing.js'); title = (await loadDraft(projectId))?.title || ''; } catch { /* no writing yet */ } }
  return {
    title,
    preacher: p.preacher || parsed.preacher || cfg.youtubeSermon?.preacher || '',
    date,
    pattern: cfg.youtubeSermon?.pattern || '{title} | {preacher} {date}',
    playlist: cfg.youtubeSermon?.playlist ?? 'Sunday Sermons',
    privacy: cfg.youtubeSermon?.privacy || 'public',
    uploaded: p.youtubeUpload || null,
  };
}

/** Fill the pattern: {title}, {preacher}, {date}. Missing pieces drop out cleanly. */
export function formatSermonTitle({ title, preacher, date }, pattern = '{title} | {preacher} {date}') {
  return pattern.replace('{title}', title || '').replace('{preacher}', preacher || '').replace('{date}', date ? titleDate(date) : '')
    .replace(/\s+\|\s*$/, '').replace(/\|\s+\|/g, '|').replace(/\s{2,}/g, ' ').trim().slice(0, 100);
}

async function api(token, url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { authorization: `Bearer ${token}`, ...(opts.body && typeof opts.body === 'string' ? { 'content-type': 'application/json' } : {}), ...(opts.headers || {}) } });
  const text = await r.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : {};
  if (!r.ok && r.status !== 308) {
    const reason = body?.error?.errors?.[0]?.reason || '';
    if (r.status === 403 && /insufficient|forbidden/i.test(reason + (body?.error?.message || ''))) throw new Error('YouTube needs one more permission to add to playlists. Reconnect YouTube in Social › Accounts, then try again.');
    if (reason === 'quotaExceeded' || reason === 'uploadLimitExceeded') throw new Error('YouTube’s daily upload limit for this app was reached. Try again tomorrow.');
    throw new Error(`YouTube: ${body?.error?.message || r.statusText}`);
  }
  return { status: r.status, body, headers: r.headers };
}

/** Find the playlist by name, or make it. */
async function playlistId(token, name) {
  let page = '';
  do {
    const { body } = await api(token, `https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50${page ? `&pageToken=${page}` : ''}`);
    const hit = (body.items || []).find((x) => x.snippet?.title?.trim().toLowerCase() === name.trim().toLowerCase());
    if (hit) return hit.id;
    page = body.nextPageToken || '';
  } while (page);
  const { body } = await api(token, 'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', { method: 'POST', body: JSON.stringify({ snippet: { title: name }, status: { privacyStatus: 'public' } }) });
  return body.id;
}

/**
 * Upload the sermon. body: { accountId, title, description, privacy, playlist, preacher, date, sermonTitle }.
 * Resumable upload in 8 MB pieces, so a long sermon shows real progress and a dropped connection doesn't start over.
 */
export async function publishSermon(projectId, body, ctx) {
  const p = await getProject(projectId);
  if (!p?.sourceFile) throw new Error('This sermon has no video on this Mac.');
  const account = await store.getAccount(body.accountId, { withCredentials: true });
  if (!account || account.platform !== 'youtube' || account.kind !== 'api') throw new Error('Connect your YouTube channel in Social › Accounts first.');
  // Remember the choices for next Sunday.
  const cfg = await loadConfig();
  await saveConfig({ youtubeSermon: { ...(cfg.youtubeSermon || {}), preacher: body.preacher || cfg.youtubeSermon?.preacher || '', playlist: body.playlist ?? 'Sunday Sermons', privacy: body.privacy || 'public', accountId: body.accountId } });
  await updateProject(projectId, (x) => { if (body.preacher) x.preacher = body.preacher; if (body.date) x.preachedOn = body.date; if (body.sermonTitle) x.sermonTitle = body.sermonTitle; });

  // Just the sermon: a sermon-only download already is; otherwise cut it out (no re-encode, so it's quick).
  let src = file(projectId, p.sourceFile); let temp = null;
  const r = p.sermon;
  if (!p.range && r && r.end > r.start && (r.end - r.start) < (p.media?.duration || Infinity) - 5) {
    ctx.progress(1, 'Cutting out the sermon…');
    temp = file(projectId, 'youtube-upload.mp4');
    await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', String(r.start), '-to', String(r.end), '-i', src, '-c', 'copy', '-movflags', '+faststart', temp], { signal: ctx.signal });
    src = temp;
  }
  try {
    let { token, creds, refreshed } = await googleToken(account.credentials);
    if (refreshed) await store.saveAccount({ id: account.id, credentials: creds });
    const size = statSync(src).size;
    const meta = {
      snippet: { title: String(body.title || p.title).slice(0, 100), description: String(body.description || '').slice(0, 5000), categoryId: '29' },
      status: { privacyStatus: ['public', 'unlisted', 'private'].includes(body.privacy) ? body.privacy : 'public', selfDeclaredMadeForKids: false },
    };
    ctx.progress(2, 'Starting the upload…');
    const init = await api(token, 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST', body: JSON.stringify(meta), headers: { 'x-upload-content-length': String(size), 'x-upload-content-type': 'video/mp4' },
    });
    const uploadUrl = init.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube didn’t start the upload. Try again.');
    const fd = openSync(src, 'r'); let sent = 0; let video = null; const began = Date.now();
    try {
      while (sent < size) {
        if (ctx.signal?.aborted) throw new Error('Cancelled');
        const len = Math.min(CHUNK, size - sent); const buf = Buffer.alloc(len);
        readSync(fd, buf, 0, len, sent);
        const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-length': String(len), 'content-range': `bytes ${sent}-${sent + len - 1}/${size}` }, body: buf, signal: ctx.signal });
        if (res.status === 308) { const range = res.headers.get('range'); sent = range ? Number(range.split('-')[1]) + 1 : sent + len; }
        else if (res.ok) { video = await res.json(); sent = size; }
        else { const t = await res.text(); throw new Error(`YouTube upload stopped: ${t.slice(0, 200)}`); }
        const secs = (Date.now() - began) / 1000;
        ctx.transfer?.(sent, size, secs > 0 ? sent / secs : 0);
        ctx.progress(2 + 90 * (sent / size), 'Uploading to YouTube…');
      }
    } finally { closeSync(fd); }
    if (!video?.id) throw new Error('YouTube didn’t confirm the upload. Check YouTube Studio before trying again.');
    let playlistNote = null;
    if (body.playlist?.trim()) {
      ctx.progress(95, `Adding it to “${body.playlist}”…`);
      try {
        const pid = await playlistId(token, body.playlist);
        await api(token, 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', { method: 'POST', body: JSON.stringify({ snippet: { playlistId: pid, resourceId: { kind: 'youtube#video', videoId: video.id } } }) });
      } catch (e) { playlistNote = e.message; }
    }
    const url = `https://www.youtube.com/watch?v=${video.id}`;
    await updateProject(projectId, (x) => { x.youtubeUpload = { id: video.id, url, title: meta.snippet.title, at: new Date().toISOString(), playlist: playlistNote ? null : body.playlist || null }; });
    ctx.progress(100, 'On YouTube');
    return { url, id: video.id, playlistNote };
  } finally {
    if (temp && existsSync(temp)) await rm(temp, { force: true });
  }
}
