// Local daemon: JSON API + media streaming + the built UI, on 127.0.0.1 only.
// All heavy work happens here (via the job queue); the UI stays thin.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, PROJECTS_DIR, toolStatus } from './tools.js';
import { loadConfig, saveConfig, mask, KEY_GUIDE } from './config.js';
import * as jobs from './jobs.js';
import { listProjects, getProject, updateProject, deleteProject, getTranscript, projectDir } from './projects.js';
import { listChannel, downloadToProject, importLocalFile, scoutVideo } from './youtube.js';
import { transcribeProject } from './transcribe.js';
import { proposeClips } from './pipeline.js';
import { exportClip, trackClip, revealInFinder, EXPORT_PRESETS, moveExport, downloadsDir } from './render.js';
import { listThemes, saveTheme, deleteTheme, refreshSystemFonts, bundledFontDir } from './themes.js';
import { makeThumbs } from './thumbs.js';
import { testProvider } from './ai.js';
import { binTranscript } from './sermon.js';
import * as social from './social/hub.js';
import * as socialStore from './social/store.js';

const PORT = Number(process.env.SC_PORT || 4317);
const HOST = '127.0.0.1';
const UI_DIR = path.join(ROOT, 'dist', 'ui');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, re, keys, handler });
};

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 5_000_000) throw new HttpError(413, 'Body too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function requireProject(id) {
  const p = await getProject(id).catch(() => null);
  if (!p) throw new HttpError(404, 'Project not found');
  return p;
}

// ---------------------------------------------------------------- settings
route('GET', '/api/health', () => ({ ok: true, version: '0.1.0' }));
route('GET', '/api/config', async () => ({ config: mask(await loadConfig()), keyGuide: KEY_GUIDE }));
route('PUT', '/api/config', async (_p, b) => ({ config: mask(await saveConfig(b)) }));
route('GET', '/api/tools', async () => ({ tools: await toolStatus() }));
route('POST', '/api/ai/test', async (_p, b) => {
  const cfg = { ...(await loadConfig()) };
  if (b.provider) cfg.llmProvider = b.provider;
  if (cfg.llmProvider === 'none') throw new HttpError(400, 'Pick an AI helper first.');
  try { return await testProvider(cfg); } catch (e) { return { ok: false, error: e.message }; }
});

// ---------------------------------------------------------------- themes
route('GET', '/api/themes', () => listThemes());
route('POST', '/api/fonts/refresh', async () => { await refreshSystemFonts(); return listThemes(); });
route('GET', '/api/export/presets', () => ({ presets: EXPORT_PRESETS }));
route('POST', '/api/themes/:kind', async ({ kind }, b) => ({ theme: await saveTheme(kind, b) }));
route('DELETE', '/api/themes/:kind/:id', async ({ kind, id }) => { await deleteTheme(kind, id); return { ok: true }; });

// ---------------------------------------------------------------- youtube
let channelCache = { key: '', at: 0, items: [] };
route('GET', '/api/youtube/channel', async (_p, _b, url) => {
  const cfg = await loadConfig();
  const channel = url.searchParams.get('channel') || cfg.youtubeChannel;
  if (!channel) throw new HttpError(400, 'Add your YouTube channel in Settings first.');
  if (url.searchParams.get('refresh') || channelCache.key !== channel || Date.now() - channelCache.at > 10 * 60_000) {
    channelCache = { key: channel, at: Date.now(), items: await listChannel(channel) };
  }
  return { channel, items: channelCache.items };
});

route('POST', '/api/youtube/scout', async (_p, b) => {
  if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(b.url || '')) throw new HttpError(400, 'Paste a YouTube link.');
  try { return await scoutVideo(b.url); } catch (e) { throw new HttpError(502, `Couldn't read that video: ${e.message.slice(-200)}`); }
});

// ---------------------------------------------------------------- projects
route('GET', '/api/projects', async () => ({ projects: await listProjects() }));

route('POST', '/api/projects', async (_p, b) => {
  if (b.url) {
    if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(b.url)) throw new HttpError(400, 'Paste a YouTube link.');
    const range = b.start != null && b.end != null ? { start: Number(b.start), end: Number(b.end) } : null;
    const job = jobs.enqueue({ kind: 'download', label: b.title ? `Download “${b.title}”` : 'Download video', key: `dl:${b.url}:${range ? range.start : ''}` },
      (ctx) => downloadToProject(b.url, ctx, null, range));
    return { job: jobs.view(job) };
  }
  if (b.file) {
    const job = jobs.enqueue({ kind: 'import', label: `Import ${path.basename(b.file)}` }, (ctx) => importLocalFile(b.file, ctx));
    return { job: jobs.view(job) };
  }
  throw new HttpError(400, 'Send a YouTube url or a local file path.');
});

route('GET', '/api/projects/:id', async ({ id }) => {
  const project = await requireProject(id);
  return { project, jobs: jobs.listJobs({ projectId: id }) };
});

route('PATCH', '/api/projects/:id', async ({ id }, b) => {
  await requireProject(id);
  const project = await updateProject(id, (p) => {
    if (typeof b.title === 'string') p.title = b.title.slice(0, 200);
    if (b.sermon) p.sermon = { ...p.sermon, ...b.sermon };
    if (Array.isArray(b.clips)) p.clips = b.clips;
    if ('videoTheme' in b) p.videoTheme = b.videoTheme;
  });
  return { project };
});

route('DELETE', '/api/projects/:id', async ({ id }) => { await requireProject(id); await deleteProject(id); return { ok: true }; });

route('GET', '/api/projects/:id/transcript', async ({ id }) => {
  const project = await requireProject(id);
  const t = await getTranscript(id);
  if (!t) throw new HttpError(404, 'No transcript yet');
  return { words: t.words, model: t.model, bins: binTranscript(t.words, project.media?.duration) };
});

const projectJob = (kind, label, fn) => async ({ id }, b) => {
  const project = await requireProject(id);
  const job = jobs.enqueue({ kind, label: `${label}: ${project.title}`, projectId: id, key: `${kind}:${id}:${b.clipId || ''}` }, (ctx) => fn(id, b, ctx, project));
  return { job: jobs.view(job) };
};

route('POST', '/api/projects/:id/download', projectJob('download', 'Download', (id, _b, ctx, p) => {
  if (!p.sourceUrl) throw new Error('This project came from a local file.');
  return downloadToProject(p.sourceUrl, ctx, p);
}));
route('POST', '/api/projects/:id/thumbs', projectJob('thumbs', 'Scene strip', (id, _b, ctx) => makeThumbs(id, ctx)));
route('POST', '/api/projects/:id/transcribe', projectJob('transcribe', 'Transcribe', (id, b, ctx) => transcribeProject(id, b, ctx)));
route('POST', '/api/projects/:id/propose', projectJob('propose', 'Find clips', (id, b, ctx) => proposeClips(id, b, ctx)));

route('POST', '/api/projects/:id/clips', async ({ id }, b) => {
  await requireProject(id);
  const start = Number(b.start);
  const end = Number(b.end);
  if (!(end > start)) throw new HttpError(400, 'End must be after start');
  const clip = {
    id: randomUUID().slice(0, 8), start, end, title: b.title || 'New clip', summary: '', hook: '', score: null,
    category: 'Manual', reasons: ['Added by you'], startPhrase: '', endPhrase: '', hashtags: ['sermon'],
    cutWords: [], tightenPauses: false, crop: { mode: 'auto' }, videoTheme: null, status: 'kept', source: 'manual',
  };
  const project = await updateProject(id, (p) => { p.clips.push(clip); });
  return { clip, project };
});

const clipJob = (kind, label, fn) => async ({ id, cid }, b = {}) => {
  const project = await requireProject(id);
  const clip = project.clips.find((c) => c.id === cid);
  if (!clip) throw new HttpError(404, 'Clip not found');
  const job = jobs.enqueue({ kind, label: `${label} “${clip.title.slice(0, 40)}”`, projectId: id, key: `${kind}:${id}:${cid}` }, (ctx) => fn(id, cid, ctx, b));
  return { job: jobs.view(job) };
};
/** Export result plus what the celebration toast needs. */
async function exportWithInfo(id, cid, ctx, options) {
  const r = await exportClip(id, cid, { options }, ctx);
  const p = await getProject(id);
  const c = p.clips.find((x) => x.id === cid);
  return { ...r, after: options.after || 'reveal', projectId: id, clipId: cid, title: c?.title, thumb: c?.export?.thumb ? `/media/${encodeURIComponent(id)}/${c.export.thumb}` : null, bytes: c?.export?.bytes };
}
route('POST', '/api/projects/:id/clips/:cid/track', clipJob('track', 'Track speaker in', (id, cid, ctx) => trackClip(id, cid, ctx)));
route('POST', '/api/projects/:id/clips/:cid/preview', clipJob('preview', 'Preview', (id, cid, ctx) => exportClip(id, cid, { preview: true }, ctx)));
route('POST', '/api/projects/:id/clips/:cid/export', clipJob('export', 'Export', (id, cid, ctx, b) => exportWithInfo(id, cid, ctx, b.options || {})));

route('POST', '/api/projects/:id/clips/:cid/move', async ({ id, cid }, b) => {
  try { return await moveExport(id, cid, String(b.folder || '')); } catch (e) { throw new HttpError(400, e.message); }
});
route('GET', '/api/export/defaults', () => ({ folder: downloadsDir() }));

route('POST', '/api/projects/:id/export-all', async ({ id }, b) => {
  const project = await requireProject(id);
  const chosen = project.clips.filter((c) => c.status === 'kept' || c.status === 'exported');
  if (!chosen.length) throw new HttpError(400, 'Keep at least one clip first.');
  const out = chosen.map((c) => jobs.view(jobs.enqueue(
    { kind: 'export', label: `Export “${c.title.slice(0, 40)}”`, projectId: id, key: `export:${id}:${c.id}` },
    (ctx) => exportWithInfo(id, c.id, ctx, b.options || {}),
  )));
  return { jobs: out };
});

route('POST', '/api/reveal', async (_p, b) => {
  const cfg = await loadConfig();
  const target = path.resolve(String(b.path || ''));
  const allowed = [PROJECTS_DIR, cfg.exportFolder, downloadsDir()].filter(Boolean).map((d) => path.resolve(d));
  let ok = allowed.some((d) => target.startsWith(d + path.sep));
  if (!ok) { // any file this app exported, wherever the user chose to save it
    for (const summary of await listProjects()) {
      const p = await getProject(summary.id);
      if (p?.clips.some((c) => [c.export, ...(c.exports || [])].some((e) => e?.file && path.resolve(e.file) === target))) { ok = true; break; }
    }
  }
  if (!ok || !existsSync(target)) throw new HttpError(400, 'Not an export file');
  await revealInFinder(target);
  return { ok: true };
});

// ---------------------------------------------------------------- social hub
route('GET', '/api/social/platforms', () => ({ platforms: social.catalog() }));
route('GET', '/api/social/accounts', async () => ({ accounts: await socialStore.listAccounts() }));
route('POST', '/api/social/accounts', async (_p, b) => {
  try { return { account: await social.connectAccount(b) }; } catch (e) { throw new HttpError(400, e.message); }
});
route('POST', '/api/social/accounts/:aid/verify', async ({ aid }) => ({ account: await social.verifyAccount(aid) }));
route('PATCH', '/api/social/accounts/:aid', async ({ aid }, b) => ({ account: await socialStore.saveAccount({ id: aid, label: String(b.label || '').slice(0, 80) }) }));
route('DELETE', '/api/social/accounts/:aid', async ({ aid }) => { await socialStore.deleteAccount(aid); return { ok: true }; });
route('POST', '/api/social/youtube/auth', (_p, b) => {
  try { return social.startGoogleAuth(b, `http://127.0.0.1:${PORT}`); } catch (e) { throw new HttpError(400, e.message); }
});
route('GET', '/api/social/posts', async () => ({ posts: await socialStore.listPosts() }));
route('POST', '/api/social/posts', async (_p, b) => {
  try { return { post: await social.createPost(b) }; } catch (e) { throw new HttpError(400, e.message); }
});
route('PATCH', '/api/social/posts/:pid', async ({ pid }, b) => {
  try { return { post: await social.editPost(pid, b) }; } catch (e) { throw new HttpError(400, e.message); }
});
route('DELETE', '/api/social/posts/:pid', async ({ pid }) => { await socialStore.removePost(pid); return { ok: true }; });
route('POST', '/api/social/posts/:pid/publish', async ({ pid }) => ({ post: await social.publishNow(pid) }));
route('POST', '/api/social/posts/:pid/retry', async ({ pid }) => ({ post: await social.retryPost(pid) }));
route('POST', '/api/social/posts/:pid/done/:aid', async ({ pid, aid }, b) => ({ post: await social.markManualDone(pid, aid, b.url) }));
route('POST', '/api/social/reveal', async (_p, b) => {
  const target = path.resolve(String(b.path || ''));
  const posts = await socialStore.listPosts();
  if (!posts.some((p) => p.media?.file && path.resolve(p.media.file) === target) || !existsSync(target)) throw new HttpError(400, 'Not a post video');
  await revealInFinder(target);
  return { ok: true };
});
/** Every exported clip across projects, ready to attach to a post. */
route('GET', '/api/social/media', async () => {
  const out = [];
  for (const summary of await listProjects()) {
    const p = await getProject(summary.id);
    for (const c of p?.clips || []) {
      if (!c.export?.file || !existsSync(c.export.file)) continue;
      out.push({
        projectId: p.id, clipId: c.id, sermon: p.title, title: c.title, summary: c.summary, hashtags: c.hashtags || [],
        file: c.export.file, thumb: c.export.thumb ? `/media/${encodeURIComponent(p.id)}/${c.export.thumb}` : null,
        length: c.export.length, at: c.export.at, bytes: statSync(c.export.file).size,
      });
    }
  }
  return { media: out.sort((a, b) => String(b.at).localeCompare(String(a.at))) };
});

// ---------------------------------------------------------------- dashboard
/** Everything the home dashboard needs in one call: exports, posts, sermons, work in progress. */
route('GET', '/api/stats', async () => {
  const projects = [];
  const exports = [];
  let kept = 0;
  let proposed = 0;
  for (const summary of await listProjects()) {
    const p = await getProject(summary.id);
    if (!p) continue;
    projects.push({ ...summary, proposed: p.clips.filter((c) => c.status === 'proposed').length, sermon: p.sermon ? { start: p.sermon.start, end: p.sermon.end } : null });
    for (const c of p.clips) {
      if (c.status === 'kept' || c.status === 'exported') kept++;
      if (c.status === 'proposed') proposed++;
      for (const e of c.exports?.length ? c.exports : c.export ? [c.export] : []) {
        exports.push({ at: e.at, length: e.length, projectId: p.id, clipId: c.id, title: c.title, sermon: p.title, thumb: e.thumb ? `/media/${encodeURIComponent(p.id)}/${e.thumb}` : null });
      }
    }
  }
  const posts = await socialStore.listPosts();
  const accounts = await socialStore.listAccounts();
  return {
    projects, exports: exports.sort((a, b) => String(b.at).localeCompare(String(a.at))), kept, proposed,
    posts: posts.map(({ id, title, caption, status, scheduledAt, publishedAt, created, destinations, media }) => ({
      id, title, caption, status, scheduledAt, publishedAt, created, destinations: destinations.map((d) => ({ platform: d.platform, status: d.status })),
      thumb: media?.projectId && media?.clipId ? exports.find((e) => e.clipId === media.clipId)?.thumb || null : null,
    })),
    accounts: accounts.length,
  };
});

// ---------------------------------------------------------------- jobs
route('GET', '/api/jobs', (_p, _b, url) => ({ jobs: jobs.listJobs({ projectId: url.searchParams.get('projectId') || undefined }) }));
route('GET', '/api/jobs/:jid', ({ jid }) => {
  const j = jobs.getJob(jid);
  if (!j) throw new HttpError(404, 'Job not found');
  return { job: j };
});
route('DELETE', '/api/jobs/:jid', ({ jid }) => ({ job: jobs.cancel(jid) }));

// ---------------------------------------------------------------- static + media
function streamFile(req, res, file) {
  const st = statSync(file);
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}

function safeJoin(base, rel) {
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

const server = http.createServer(async (req, res) => {
  // Only answer to our own origin (blocks DNS-rebinding pages from driving the daemon).
  const host = (req.headers.host || '').toLowerCase();
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(403); return res.end('Forbidden'); }
  const url = new URL(req.url, `http://${host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const b = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await body(req) : {};
        return send(res, 200, await r.handler(params, b, url));
      }
      throw new HttpError(404, 'Not found');
    }
    if (url.pathname.startsWith('/fonts/')) { // bundled caption fonts for the preview's @font-face
      const f = safeJoin(bundledFontDir, decodeURIComponent(url.pathname.slice(7)));
      if (!f || !existsSync(f)) throw new HttpError(404, 'No such font');
      res.setHeader('cache-control', 'max-age=86400');
      return streamFile(req, res, f);
    }
    if (url.pathname === '/oauth/google/callback') {
      const page = (title, msg) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px -apple-system,system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#EEF2F8;color:#141821"><div style="background:#fff;padding:32px 40px;border-radius:22px;box-shadow:0 12px 32px -12px rgba(30,40,80,.25);max-width:460px"><h2 style="margin:0 0 8px">${title}</h2><p style="color:#5E6676;margin:0">${msg}</p></div>`;
      const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      try {
        const a = await social.finishGoogleAuth(Object.fromEntries(url.searchParams));
        return res.end(page('YouTube connected', `“${esc(a.name)}” is ready in Sermon Clips. You can close this tab.`));
      } catch (e) {
        return res.end(page('Couldn’t connect YouTube', esc(e.message)));
      }
    }
    const ex = url.pathname.match(/^\/exports\/([^/]+)\/([^/]+)$/);
    if (ex) { // the exported video for a clip, wherever it was saved
      const p = await getProject(decodeURIComponent(ex[1])).catch(() => null);
      const c = p?.clips.find((x) => x.id === decodeURIComponent(ex[2]));
      if (!c?.export?.file || !existsSync(c.export.file)) throw new HttpError(404, 'No export');
      return streamFile(req, res, c.export.file);
    }
    if (url.pathname.startsWith('/media/')) {
      const [, , id, ...rest] = url.pathname.split('/');
      const file = safeJoin(projectDir(decodeURIComponent(id)), decodeURIComponent(rest.join('/')));
      if (!file || !existsSync(file) || !statSync(file).isFile()) throw new HttpError(404, 'No such media');
      return streamFile(req, res, file);
    }
    // Built UI (production). In dev, Vite serves the UI and proxies /api + /media here.
    if (!existsSync(UI_DIR)) { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('Sermon Clips daemon is running. Build the UI with: npm run build'); }
    let file = safeJoin(UI_DIR, `.${url.pathname}`);
    if (!file || !existsSync(file) || statSync(file).isDirectory()) file = path.join(UI_DIR, 'index.html');
    return streamFile(req, res, file);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    return send(res, status, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  social.startScheduler().catch((e) => console.error('[social] scheduler failed to start', e));
  console.log(`Sermon Clips daemon on http://${HOST}:${PORT}`);
  process.send?.({ ready: true, port: PORT });
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
