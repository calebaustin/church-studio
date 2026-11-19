// Social hub engine: create posts, publish now or on schedule, track every destination.
// Scheduling runs inside the daemon, so the app must be open for scheduled posts to go out;
// overdue posts publish as soon as it starts again.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, run, tool, probe } from '../tools.js';
import { PLATFORMS, platform, captionFor } from './platforms.js';
import { PROVIDERS } from './providers.js';
import * as store from './store.js';

const CACHE = path.join(DATA_DIR, 'social', 'cache');

// ------------------------------------------------------------ accounts
export async function connectAccount({ platform: pid, label, credentials }) {
  const p = platform(pid);
  if (!p) throw new Error('Unknown platform');
  if (p.kind === 'manual') {
    return store.saveAccount({ id: store.newId(), platform: pid, kind: 'manual', label: label || p.name, name: label || p.name, status: 'ok', created: new Date().toISOString() });
  }
  for (const f of p.fields) if (!String(credentials?.[f.key] || '').trim()) throw new Error(`${f.label} is required.`);
  const clean = Object.fromEntries(Object.entries(credentials).map(([k, v]) => [k, String(v).trim()]));
  const info = await PROVIDERS[pid].verify(clean);
  return store.saveAccount({
    id: store.newId(), platform: pid, kind: 'api', label: label || info.name, name: info.name, handle: info.handle, url: info.url,
    status: 'ok', verifiedAt: new Date().toISOString(), created: new Date().toISOString(), credentials: info.credentials || clean,
  });
}

export async function verifyAccount(id) {
  const a = await store.getAccount(id, { withCredentials: true });
  if (!a) throw new Error('Account not found');
  if (a.kind === 'manual') return a;
  try {
    const info = await PROVIDERS[a.platform].verify(a.credentials);
    return store.saveAccount({ id, name: info.name, handle: info.handle, url: info.url, status: 'ok', error: null, verifiedAt: new Date().toISOString(), credentials: info.credentials });
  } catch (e) {
    return store.saveAccount({ id, status: 'error', error: e.message });
  }
}

// ------------------------------------------------------------ YouTube OAuth (Desktop client, PKCE, loopback)
const pending = new Map(); // state -> { verifier, clientId, clientSecret, label, redirect, at }

export function startGoogleAuth({ clientId, clientSecret, label }, origin) {
  if (!clientId?.trim() || !clientSecret?.trim()) throw new Error('Paste the OAuth client ID and secret first.');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');
  const redirect = `${origin}/oauth/google/callback`;
  pending.set(state, { verifier, clientId: clientId.trim(), clientSecret: clientSecret.trim(), label, redirect, at: Date.now() });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId.trim(), redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    code_challenge: challenge, code_challenge_method: 'S256', state,
  }).toString();
  return { url: url.toString() };
}

export async function finishGoogleAuth({ code, state, error }) {
  const p = pending.get(state);
  pending.delete(state);
  if (error) throw new Error(`Google said: ${error}`);
  if (!p || Date.now() - p.at > 15 * 60_000) throw new Error('This sign-in link expired. Press Connect again in the app.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirect, grant_type: 'authorization_code', code_verifier: p.verifier }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description || t.error || 'Token exchange failed');
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.');
  const credentials = { clientId: p.clientId, clientSecret: p.clientSecret, refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  const info = await PROVIDERS.youtube.verify(credentials);
  return store.saveAccount({
    id: store.newId(), platform: 'youtube', kind: 'api', label: p.label || info.name, name: info.name, handle: info.handle, url: info.url,
    status: 'ok', verifiedAt: new Date().toISOString(), created: new Date().toISOString(), credentials: info.credentials || credentials,
  });
}

// ------------------------------------------------------------ posts
function rollup(post) {
  const d = post.destinations;
  if (post.status === 'draft' || post.status === 'scheduled') return post.status;
  if (d.some((x) => x.status === 'publishing' || x.status === 'pending')) return 'publishing';
  if (d.some((x) => x.status === 'ready')) return 'needs-you';
  const ok = d.filter((x) => ['published', 'done'].includes(x.status)).length;
  if (ok === d.length) return 'published';
  return ok ? 'partial' : 'failed';
}

/** Check an attached clip, video or design and note its size and length. */
async function resolveMedia(m) {
  if (!m?.file) return null;
  if (m.kind === 'image') {
    // A design: one image, or a folder of pages for a carousel. Shared by hand, not uploaded to video platforms.
    if (!existsSync(m.file)) throw new Error('That design file no longer exists. Pick the design again.');
    return { kind: 'image', file: m.file, designId: m.designId || null, projectId: m.projectId || null, pages: m.pages || 1, thumb: m.thumb || null };
  }
  if (!existsSync(m.file)) throw new Error('That video file no longer exists. Export the clip again.');
  const info = await probe(m.file);
  return { ...m, width: info.width, height: info.height, length: info.duration, bytes: statSync(m.file).size };
}

export async function createPost(body) {
  const accounts = await store.listAccounts();
  const dests = (body.accountIds || []).map((id) => accounts.find((a) => a.id === id)).filter(Boolean)
    .map((a) => ({ accountId: a.id, platform: a.platform, status: 'pending', caption: body.captions?.[a.id] ?? null }));
  const media = await resolveMedia(body.media);
  const when = body.mode === 'schedule' ? new Date(body.scheduledAt) : null;
  if (body.mode === 'schedule' && (Number.isNaN(when?.getTime()) || when < Date.now() - 60_000)) throw new Error('Pick a time in the future.');
  if (body.mode !== 'draft' && !dests.length) throw new Error('Pick at least one account.');
  if (body.mode !== 'draft' && dests.some((d) => platform(d.platform).kind === 'api') && (!media || media.kind === 'image')) throw new Error('Video platforms need a clip attached. Designs can go to accounts you post to by hand.');
  const post = {
    id: store.newId(), title: (body.title || '').slice(0, 200), caption: body.caption || '', hashtags: body.hashtags || [],
    media, destinations: dests, options: body.options || {},
    campaignId: body.campaignId || null, plannedAt: body.plannedAt || null, step: body.step || null,
    status: body.mode === 'draft' ? 'draft' : body.mode === 'schedule' ? 'scheduled' : 'publishing',
    scheduledAt: when ? when.toISOString() : null, created: new Date().toISOString(), publishedAt: null,
  };
  await store.insertPost(post);
  if (body.mode === 'now') queuePublish(post.id);
  return post;
}

export async function editPost(id, body) {
  const accounts = await store.listAccounts();
  const media = 'media' in body ? await resolveMedia(body.media) : undefined;
  return store.updatePost(id, (p) => {
    if (p.status === 'publishing') throw new Error('This post is being published right now.');
    if (media !== undefined) p.media = media;
    for (const k of ['title', 'caption', 'hashtags', 'options', 'plannedAt']) if (k in body) p[k] = body[k];
    if (body.accountIds) {
      p.destinations = body.accountIds.map((aid) => p.destinations.find((d) => d.accountId === aid)
        || { accountId: aid, platform: accounts.find((a) => a.id === aid)?.platform, status: 'pending', caption: null }).filter((d) => d.platform);
    }
    if (body.captions) for (const d of p.destinations) if (aidIn(body.captions, d.accountId)) d.caption = body.captions[d.accountId];
    if (body.mode === 'draft') { p.status = 'draft'; p.scheduledAt = null; }
    if (body.mode === 'schedule') { p.status = 'scheduled'; p.scheduledAt = new Date(body.scheduledAt).toISOString(); }
    return p;
  }).then((p) => { if (body.mode === 'now') return publishNow(id); return p; });
}
const aidIn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export async function publishNow(id) {
  const p = await store.updatePost(id, (x) => { x.status = 'publishing'; x.scheduledAt = x.scheduledAt || null; return x; });
  queuePublish(id);
  return p;
}

export async function retryPost(id) {
  await store.updatePost(id, (p) => {
    for (const d of p.destinations) if (d.status === 'failed') { d.status = 'pending'; d.error = null; }
    p.status = 'publishing';
    return p;
  });
  queuePublish(id);
  return store.getPost(id);
}

export function markManualDone(id, accountId, url) {
  return store.updatePost(id, (p) => {
    const d = p.destinations.find((x) => x.accountId === accountId);
    if (d) { d.status = 'done'; d.url = url || d.url || null; d.at = new Date().toISOString(); }
    p.status = rollup({ ...p, status: 'publishing' });
    if (['published', 'partial'].includes(p.status)) p.publishedAt = p.publishedAt || new Date().toISOString();
    return p;
  });
}

// ------------------------------------------------------------ publishing
let chain = Promise.resolve();
const inFlight = new Set();
function queuePublish(id) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  chain = chain.then(() => publish(id)).catch((e) => console.error('[social]', e)).finally(() => inFlight.delete(id));
}

/** Shrink/trim a clip to a platform's limits; cached per size so it's done once. */
async function fitVideo(file, p, media) {
  const size = statSync(file).size;
  const len = media?.length || (await probe(file)).duration;
  if (size <= p.maxBytes && len <= p.maxSeconds + 0.5) return file;
  await mkdir(CACHE, { recursive: true });
  const dur = Math.min(len, p.maxSeconds);
  const key = createHash('sha1').update(`${file}:${statSync(file).mtimeMs}:${p.maxBytes}:${p.maxSeconds}`).digest('hex').slice(0, 12);
  const out = path.join(CACHE, `${key}.mp4`);
  if (existsSync(out)) return out;
  const videoKbps = Math.max(300, Math.floor((p.maxBytes * 8 * 0.88) / dur / 1000) - 128);
  await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-i', file, '-t', String(dur),
    '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
  return out;
}

async function setDest(id, accountId, patch) {
  return store.updatePost(id, (p) => {
    const d = p.destinations.find((x) => x.accountId === accountId);
    Object.assign(d, patch);
    return p;
  });
}

async function publish(id) {
  let post = await store.getPost(id);
  if (!post) return;
  for (const d of post.destinations) {
    if (!['pending', 'publishing'].includes(d.status)) continue;
    const p = platform(d.platform);
    if (p.kind === 'manual') { await setDest(id, d.accountId, { status: 'ready', at: new Date().toISOString() }); continue; }
    await setDest(id, d.accountId, { status: 'publishing', error: null, message: 'Preparing video…' });
    try {
      const account = await store.getAccount(d.accountId, { withCredentials: true });
      if (!account) throw new Error('This account was disconnected.');
      if (post.media?.kind === 'image') throw new Error(`${p.name} takes video here. Share this design by hand.`);
      if (!post.media?.file || !existsSync(post.media.file)) throw new Error('The video file is missing. Export the clip again.');
      const file = await fitVideo(post.media.file, p, post.media);
      await setDest(id, d.accountId, { message: `Uploading to ${p.name}…` });
      const res = await PROVIDERS[d.platform].publish({
        creds: account.credentials, file, caption: captionFor(post, d, p), title: post.title, post,
        log: (m) => setDest(id, d.accountId, { message: m }).catch(() => {}),
      });
      if (res.credentials) await store.saveAccount({ id: account.id, credentials: res.credentials });
      await setDest(id, d.accountId, { status: 'published', url: res.url, remoteId: res.remoteId, message: null, at: new Date().toISOString() });
    } catch (e) {
      await setDest(id, d.accountId, { status: 'failed', error: e.message, message: null, at: new Date().toISOString() });
    }
  }
  post = await store.updatePost(id, (x) => {
    x.status = rollup({ ...x, status: 'publishing' });
    if (['published', 'partial', 'needs-you'].includes(x.status)) x.publishedAt = x.publishedAt || new Date().toISOString();
    return x;
  });
}

// ------------------------------------------------------------ scheduler
export async function startScheduler() {
  // A crash mid-upload leaves destinations "publishing": mark them so the user checks before retrying.
  for (const p of await store.listPosts()) {
    if (p.destinations.some((d) => d.status === 'publishing')) {
      await store.updatePost(p.id, (x) => {
        for (const d of x.destinations) if (d.status === 'publishing') { d.status = 'failed'; d.error = 'Interrupted while uploading. Check the platform before retrying so it isn’t posted twice.'; }
        x.status = rollup({ ...x, status: 'publishing' });
        return x;
      });
    } else if (p.status === 'publishing') queuePublish(p.id);
  }
  const tick = async () => {
    const now = Date.now();
    for (const p of await store.listPosts()) {
      if (p.status === 'scheduled' && new Date(p.scheduledAt).getTime() <= now) {
        await store.updatePost(p.id, (x) => { x.status = 'publishing'; return x; });
        queuePublish(p.id);
      }
    }
  };
  setInterval(() => tick().catch((e) => console.error('[social scheduler]', e)), 15_000).unref();
  tick().catch(() => {});
}

export const catalog = () => PLATFORMS.map(({ ...p }) => p);
