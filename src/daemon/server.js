// Local daemon: JSON API + media streaming + the built UI, on 127.0.0.1 only.
// All heavy work happens here (via the job queue); the UI stays thin.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, PROJECTS_DIR, toolStatus, repairTool, run, tool } from './tools.js';
import { loadConfig, saveConfig, mask, KEY_GUIDE } from './config.js';
import * as jobs from './jobs.js';
import { listProjects, getProject, updateProject, deleteProject, getTranscript, projectDir, createProject, file as fileOf, setTranscriptWord, replaceTranscriptWords } from './projects.js';
import { channelDetails, listChannel, downloadToProject, importLocalFile, replaceSource, scoutVideo } from './youtube.js';
import { transcribeProject } from './transcribe.js';
import { proposeClips } from './pipeline.js';
import { exportClip, exportJoined, trackClip, revealInFinder, EXPORT_PRESETS, moveExport, downloadsDir, sampleFrames } from './render.js';
import * as prefs from './prefs.js';
import * as workspaces from './workspaces.js';
import * as jumpstart from './jumpstart.js';
import * as inspiration from './inspiration.js';
import * as campaigns from './campaigns.js';
import * as search from './search.js';
import * as backup from './backup.js';
import * as blog from './blog.js';
import * as photos from './photos.js';
import * as library from './library.js';
import * as links from './links.js';
import { traySummary } from './tray.js';
import { startFresh } from './reset.js';
import * as writing from './writing.js';
import * as voice from './voice.js';
import * as designs from './designs.js';
import * as updates from './updates.js';
import * as finder from './finder.js';
import * as combine from './combine.js';
import { WORKSPACE } from './tools.js';
import { toSentences, backgroundOf, keywords as topKeywords } from './text.js';
import { listThemes, saveTheme, deleteTheme, refreshSystemFonts, bundledFontDir } from './themes.js';
import { makeThumbs } from './thumbs.js';
import * as audio from './audio.js';
import * as transcripts from './transcripts.js';
import { exportPodcast } from './podcast.js';
import { contentPlan } from './hub.js';
import * as insights from './insights.js';
import * as churchCal from './calendar.js';
import { aiStatus, providerReady, resetAiStatus, testProvider } from './ai.js';
import { appleStatus, csHelperStatus, deleteCsModel, downloadCsModel, imagePlayground } from './localai.js';
import { deleteChat, getChat, helperChat, helperContext, listChats, runPass, saveChat, whatToday } from './helper.js';
import { binTranscript } from './sermon.js';
import * as social from './social/hub.js';
import * as socialStore from './social/store.js';

const PORT = Number(process.env.SC_PORT || 4317);
const HOST = '127.0.0.1';
const UI_DIR = path.join(ROOT, 'dist', 'ui');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
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
/** A route that writes its own streamed response (newline-delimited JSON) instead of returning a value. */
const streamRoute = (method, pattern, handler) => { route(method, pattern, handler); routes[routes.length - 1].stream = true; };

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 150_000_000) throw new HttpError(413, 'Body too large');
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
route('PUT', '/api/config', async (_p, b) => { if (['llmProvider', 'anthropicApiKey', 'openaiApiKey', 'geminiApiKey', 'ollamaUrl', 'ollamaModel'].some((k) => k in b)) resetAiStatus(); return { config: mask(await saveConfig(b)) }; });
route('GET', '/api/tools', async () => ({ tools: await toolStatus() }));
route('POST', '/api/tools/repair', (_p, b) => ({ job: jobs.view(jobs.enqueue({ kind: 'repair', label: 'Repairing a helper', key: `repair:${b.name}` }, (ctx) => repairTool(String(b.name || ''), ctx))) }));
// ---- AI helpers that run on this Mac (Apple Intelligence, CS Helper) and the helper chat
route('GET', '/api/ai/local', async () => ({ apple: await appleStatus(true), cshelper: await csHelperStatus() }));
route('POST', '/api/ai/cshelper/download', () => ({ job: jobs.view(jobs.enqueue({ kind: 'cshelper', label: 'Download CS Helper', key: 'cshelper' }, (ctx) => downloadCsModel(ctx))) }));
route('DELETE', '/api/ai/cshelper', async () => { await deleteCsModel(); return { ok: true }; });
route('POST', '/api/helper/context', async (_p, b) => helperContext(b.focus || {}));
route('POST', '/api/helper/today', async () => whatToday());
// Make a picture with Apple's Image Playground, then keep it in the Brand library (Graphics).
route('POST', '/api/ai/image-playground', async (_p, b) => {
  const source = b.sourceRel ? await library.libraryFile(b.sourceRel).catch(() => null) : null;
  const file = await imagePlayground({ prompt: String(b.prompt || '').slice(0, 300), source });
  if (!file) return { cancelled: true };
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
  const tmp = path.join(os.tmpdir(), `Image Playground ${stamp}${path.extname(file) || '.png'}`);
  await copyFile(file, tmp);
  const [dest] = await library.importFiles([tmp], 'Graphics');
  await rm(tmp, { force: true });
  const rel = `Graphics/${path.basename(dest)}`;
  return { rel, url: `/library/Graphics/${encodeURIComponent(path.basename(dest))}` };
});
route('GET', '/api/helper/chats', async () => ({ chats: await listChats() }));
route('GET', '/api/helper/chats/:cid', async ({ cid }) => { const c = await getChat(cid); if (!c) throw new HttpError(404, 'That chat is gone.'); return { chat: c }; });
route('PUT', '/api/helper/chats', async (_p, b) => ({ chat: await saveChat(b) }));
route('DELETE', '/api/helper/chats/:cid', async ({ cid }) => { await deleteChat(cid); return { ok: true }; });
route('POST', '/api/helper/pass', async (_p, b) => runPass({ focus: b.focus || {}, pass: b.pass }));
streamRoute('POST', '/api/helper/chat', async (_p, b, res, req) => {
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
  const ac = new AbortController();
  req.on('close', () => { if (!res.writableEnded) ac.abort(); });
  const line = (o) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };
  try {
    const r = await helperChat({ focus: b.focus || {}, messages: b.messages || [], signal: ac.signal, onDelta: (d, full) => (d == null ? line({ replace: full }) : line({ delta: d })) });
    line({ done: true, text: r.text, refs: r.refs, actions: r.actions });
  } catch (e) { line({ error: e.message }); }
  res.end();
});

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

route('GET', '/api/youtube/channel-info', async (_p, _b, url) => {
  const cfg = await loadConfig();
  const channel = url.searchParams.get('channel') || cfg.youtubeChannel;
  if (!channel) throw new HttpError(400, 'Add your YouTube channel first.');
  try { return { info: await channelDetails(channel) }; } catch (e) { throw new HttpError(502, e.message); }
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
    const job = jobs.enqueue({ kind: 'import', label: `Import ${path.basename(b.file)}` }, (ctx) => importLocalFile(b.file, ctx, b.kind));
    return { job: jobs.view(job) };
  }
  throw new HttpError(400, 'Send a YouTube url or a local file path.');
});

// Several videos made into one (one after another, side by side or stacked), then a project like any other.
route('POST', '/api/projects/combine', async (_p, b) => {
  const files = (b.files || []).map((f) => (typeof f === 'string' ? { path: f } : f)).filter((f) => f?.path);
  if (files.length < 2) throw new HttpError(400, 'Pick at least two videos.');
  const kind = b.kind || (b.shape === 'wide' ? 'wide' : 'short');
  const job = jobs.enqueue({ kind: 'import', label: b.layout === 'sequence' ? `Combine ${files.length} videos` : b.layout === 'stack' ? `Stack ${files.length} videos` : `Put ${files.length} videos side by side` },
    (ctx) => combine.combineFiles(files, { layout: b.layout, shape: b.shape, title: b.title, kind }, ctx));
  return { job: jobs.view(job) };
});

// A project started from scratch: 30 seconds of silence, one clip, ready for text, color and pop-ups.
// A video or recording can be added later.
route('POST', '/api/projects/blank', async (_p, b) => {
  const kind = ['short', 'lyric', 'wide'].includes(b.kind) ? b.kind : 'short';
  const seconds = Math.max(5, Math.min(600, Number(b.seconds) || 30));
  const project = await createProject({ title: String(b.title || 'Untitled video').slice(0, 120), kind });
  const src = fileOf(project.id, 'source.m4a');
  await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(seconds), '-c:a', 'aac', src]);
  const { writeFile: wf } = await import('node:fs/promises');
  await wf(fileOf(project.id, 'transcript.json'), JSON.stringify({ words: [], segments: [], duration: seconds, scripture: 1 }));
  const p = await updateProject(project.id, (x) => {
    x.sourceFile = 'source.m4a'; x.media = { duration: seconds, width: 0, height: 0, fps: 30, hasAudio: true }; x.status = 'transcribed'; x.blank = true;
    x.sermon = { start: 0, end: seconds, confidence: 1, method: 'whole', confirmed: true, reasons: ['Started from scratch'] };
    x.clips = [{ id: randomUUID().slice(0, 8), start: 0, end: seconds, title: x.title, summary: '', hook: '', score: null, category: 'From scratch', reasons: [], startPhrase: '', endPhrase: '',
      hashtags: [], cutWords: [], tightenPauses: false, crop: { mode: 'lyric', smooth: 0 }, format: kind === 'wide' ? 'wide' : 'vertical', videoTheme: null, status: 'kept', source: 'blank', captions: false }];
  });
  return { project: p };
});

// Add or replace the video or recording behind a project (used by projects started from scratch).
route('POST', '/api/projects/:id/source', async ({ id }, b) => {
  await requireProject(id);
  const job = jobs.enqueue({ kind: 'import', label: `Add ${path.basename(String(b.file || 'file'))}`, projectId: id }, (ctx) => replaceSource(id, String(b.file || ''), ctx));
  return { job: jobs.view(job) };
});

route('GET', '/api/projects/:id', async ({ id }) => {
  const project = await requireProject(id);
  return { project, jobs: jobs.listJobs({ projectId: id }) };
});

route('PATCH', '/api/projects/:id', async ({ id }, b) => {
  await requireProject(id);
  const project = await updateProject(id, (p) => {
    if (typeof b.title === 'string') p.title = b.title.slice(0, 200);
    // Finding the sermon makes a sermon recording a Sermon (a project type of its own).
    if (b.sermon) { p.sermon = { ...p.sermon, ...b.sermon }; if (b.sermon.confirmed && (p.kind === 'sermon' || !p.kind) && p.isSermon !== false) p.isSermon = true; }
    if (typeof b.isSermon === 'boolean') p.isSermon = b.isSermon;
    if (Array.isArray(b.clips)) p.clips = b.clips;
    if ('videoTheme' in b) p.videoTheme = b.videoTheme;
    if (typeof b.series === 'string') p.series = b.series.trim().slice(0, 80) || null;
  });
  return { project };
});

route('DELETE', '/api/projects/:id', async ({ id }) => { await requireProject(id); await deleteProject(id); return { ok: true }; });

route('PUT', '/api/projects/:id/transcript/words', async ({ id }, b) => {
  await requireProject(id);
  try { return { from: Math.min(Number(b.from), Number(b.to)), words: await replaceTranscriptWords(id, Number(b.from), Number(b.to), b.text) }; } catch (e) { throw new HttpError(400, e.message); }
});
route('PUT', '/api/projects/:id/transcript/word', async ({ id }, b) => {
  await requireProject(id);
  try { return { word: await setTranscriptWord(id, Number(b.index), b.text) }; } catch (e) { throw new HttpError(400, e.message); }
});
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
// Audio cleanup: presets, a before/after sample, and a cleaned copy of any file.
// Church calendar (Planning Center or a calendar link), refreshed weekly.
route('GET', '/api/calendar/events', () => churchCal.cachedEvents());
route('POST', '/api/calendar/refresh', async () => { try { return await churchCal.refreshEvents(); } catch (e) { throw new HttpError(400, e.message); } });
route('GET', '/api/audio/presets', () => ({ presets: audio.AUDIO_PRESETS }));
route('POST', '/api/audio/preview', async (_p, b) => {
  const source = b.projectId ? fileOf(b.projectId, (await requireProject(b.projectId)).sourceFile) : String(b.file || '');
  try { return await audio.previewCleanup({ source, at: b.at, preset: b.preset, amount: b.amount }); } catch (e) { throw new HttpError(400, e.message); }
});
route('POST', '/api/audio/clean', (_p, b) => ({ job: jobs.view(jobs.enqueue({ kind: 'clean-audio', label: `Clean up ${path.basename(String(b.file || ''))}` }, (ctx) => audio.cleanFile(String(b.file || ''), { preset: b.preset, amount: b.amount }, ctx))) }));
route('PUT', '/api/projects/:id/audio', async ({ id }, b) => {
  await requireProject(id);
  const v = b?.preset && b.preset !== 'none' ? { preset: String(b.preset), amount: Math.max(0, Math.min(1, Number(b.amount ?? 0.5))) } : null;
  return { project: await updateProject(id, (p) => { if (b.clipId) { const c = p.clips.find((x) => x.id === b.clipId); if (c) c.audioCleanup = v; } else p.audioCleanup = v; }) };
});
route('GET', '/api/projects/:id/transcript/text', async ({ id }, _b, url) => { await requireProject(id); try { return { text: await transcripts.transcriptText(id, url.searchParams.get('format') || 'txt') }; } catch (e) { throw new HttpError(400, e.message); } });
route('GET', '/api/projects/:id/transcript/paragraphs', async ({ id }, _b, url) => { await requireProject(id); try { return await transcripts.transcriptParagraphs(id, url.searchParams.get('whole') === '1'); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/projects/:id/transcript/save', async ({ id }, b) => { await requireProject(id); try { return await transcripts.saveTranscript(id, b.format); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/projects/:id/transcribe', projectJob('transcribe', 'Transcribe', async (id, b, ctx) => {
  const r = await transcribeProject(id, b, ctx);
  queueDigest(id).catch(() => {});
  return r;
}));
// With an AI helper on, a sermon's digest is made right after it's transcribed, so the Sermon page and writing have it early.
async function queueDigest(id) {
  const cfg = await loadConfig();
  const p = await getProject(id);
  if (!p || !providerReady(cfg) || ['short', 'lyric', 'wide'].includes(p.kind) || await writing.savedDigest(id)) return;
  jobs.enqueue({ kind: 'digest', label: `Sermon summary: ${p.title}`, projectId: id, key: `digest:${id}` }, async (ctx) => {
    ctx.progress(2, 'Reading the sermon…');
    await writing.makeDigest(id, { signal: ctx.signal, onProgress: (k, n) => { ctx.progress(4 + (k / n) * 94, `Summing up part ${k + 1} of ${n}…`); ctx.detail({ Part: `${k + 1} of ${n}` }); } });
    ctx.progress(100, 'Sermon summary ready');
    return {};
  });
}
route('POST', '/api/projects/:id/digest', async ({ id }) => {
  await requireProject(id);
  const cfg = await loadConfig();
  if (!providerReady(cfg)) throw new HttpError(400, 'Turn on an AI helper in Settings first.');
  await queueDigest(id);
  return { ok: true };
});
route('POST', '/api/projects/:id/propose', projectJob('propose', 'Find clips', (id, b, ctx) => proposeClips(id, b, ctx)));

route('POST', '/api/projects/:id/clips', async ({ id }, b) => {
  await requireProject(id);
  const start = Number(b.start);
  const end = Number(b.end);
  if (!(end > start)) throw new HttpError(400, 'End must be after start');
  const clip = {
    id: randomUUID().slice(0, 8), start, end, title: b.title || 'New clip', summary: '', hook: '', score: null,
    category: 'Manual', reasons: ['Added by you'], startPhrase: '', endPhrase: '', hashtags: ['sermon'],
    cutWords: [], tightenPauses: false, crop: { mode: 'auto', smooth: 0 }, videoTheme: null, status: 'kept', source: 'manual',
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
  return { ...r, after: options.after || 'reveal', projectId: id, clipId: cid, title: c?.title, hook: c?.hook || null, thumb: c?.export?.thumb ? `/media/${encodeURIComponent(id)}/${c.export.thumb}` : null, bytes: c?.export?.bytes };
}
route('POST', '/api/projects/:id/clips/:cid/track', clipJob('track', 'Track speaker in', (id, cid, ctx) => trackClip(id, cid, ctx)));
route('POST', '/api/projects/:id/clips/:cid/preview', clipJob('preview', 'Preview', (id, cid, ctx) => exportClip(id, cid, { preview: true }, ctx)));
route('POST', '/api/projects/:id/clips/:cid/export', clipJob('export', 'Export', (id, cid, ctx, b) => exportWithInfo(id, cid, ctx, b.options || {})));

route('POST', '/api/projects/:id/clips/:cid/move', async ({ id, cid }, b) => {
  try { return await moveExport(id, cid, String(b.folder || '')); } catch (e) { throw new HttpError(400, e.message); }
});
route('GET', '/api/export/defaults', () => ({ folder: downloadsDir() }));
route('POST', '/api/projects/:id/clips/:cid/frames', async ({ id, cid }, b) => ({ frames: await sampleFrames(id, cid, Math.min(9, Number(b.count) || 6)) }));
route('GET', '/api/speaker', () => prefs.speakerPrior());
route('POST', '/api/speaker/hints', async (_p, b) => prefs.addSpeakerHints(Array.isArray(b.points) ? b.points : []));
route('DELETE', '/api/speaker/hints', () => prefs.resetSpeakerHints());
route('GET', '/api/edit-templates', () => prefs.listTemplates());
route('POST', '/api/edit-templates', async (_p, b) => ({ template: await prefs.saveTemplate(b.name, b.settings) }));
route('DELETE', '/api/edit-templates/:tid', async ({ tid }) => { await prefs.deleteTemplate(tid); return { ok: true }; });

// Scripture references written the standard way: "first corinthians ten sixteen" -> "1 Corinthians 10:16".
route('POST', '/api/scripture/normalize', async (_p, b) => {
  const { normalizeText, extractRefs } = await import('./scripture.js');
  const text = normalizeText(String(b.text || ''));
  return { text, refs: extractRefs(text, 4) };
});
route('GET', '/api/index', () => insights.sermonIndex());
route('GET', '/api/gaps', () => insights.gapReport());
route('POST', '/api/gaps/save', async () => {
  const cfg = await loadConfig();
  const md = insights.gapMarkdown(await insights.gapReport(), cfg.churchInfo?.name || '');
  const out = path.join(downloadsDir(), `Content report ${new Date().toISOString().slice(0, 10)}.md`);
  const { writeFile: wf } = await import('node:fs/promises');
  await wf(out, md);
  return { file: out };
});
// ---- the sermon as the hub: tie designs, writing, posts and campaigns to a sermon
route('GET', '/api/links/sermons', async () => ({ sermons: await links.sermonChoices() }));
route('GET', '/api/links/candidates', async () => ({ items: await links.linkCandidates() }));
route('GET', '/api/links/of', async (_p, _b, url) => ({ projectId: await links.linkOf(url.searchParams.get('kind'), url.searchParams.get('id')) }));
route('PUT', '/api/links', async (_p, b) => { const r = await links.setLink(b.kind, b.id, b.projectId || null); search.invalidateSearch(); return r; });
route('GET', '/api/projects/:id/plan', async ({ id }) => { await requireProject(id); return contentPlan(id); });
route('POST', '/api/projects/:id/podcast', async ({ id }, b) => {
  const project = await requireProject(id);
  return { job: jobs.view(jobs.enqueue({ kind: 'podcast', label: `Podcast: ${project.title.slice(0, 50)}`, projectId: id, key: `podcast:${id}` }, (ctx) => exportPodcast(id, b || {}, ctx))) };
});
route('POST', '/api/projects/:id/export-joined', async ({ id }, b) => {
  const project = await requireProject(id);
  const ids = (Array.isArray(b.clipIds) ? b.clipIds : []).filter((cid) => project.clips.some((c) => c.id === cid));
  if (ids.length < 2) throw new HttpError(400, 'Pick at least two clips to join.');
  return { job: jobs.view(jobs.enqueue({ kind: 'export-joined', label: `Join ${ids.length} clips: ${project.title.slice(0, 40)}`, projectId: id, key: `join:${id}` }, (ctx) => exportJoined(id, ids, b.options || {}, ctx))) };
});
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
route('GET', '/api/social/messages', async () => {
  // One place for comments and mentions from every connected account that allows reading them.
  const prov = await import('./social/providers.js');
  const out = []; const problems = []; const sources = [];
  for (const a of await socialStore.listAccounts()) {
    if (!['youtube', 'facebook', 'instagram', 'mastodon'].includes(a.platform)) continue;
    sources.push(a.platform);
    try {
      const full = await socialStore.getAccount(a.id, { withCredentials: true });
      let items = [];
      if (a.platform === 'youtube') {
        const channelId = (a.url || '').match(/channel\/([\w-]+)/)?.[1];
        if (!channelId) continue;
        const r = await prov.youtubeComments(full.credentials, channelId);
        if (r.credentials) await socialStore.saveAccount({ id: a.id, credentials: r.credentials });
        items = r.items;
      } else if (a.platform === 'facebook') items = await prov.facebookComments(full.credentials);
      else if (a.platform === 'instagram') items = await prov.instagramComments(full.credentials);
      else if (a.platform === 'mastodon') items = await prov.mastodonMentions(full.credentials);
      out.push(...items.map((m) => ({ ...m, account: a.label, platform: a.platform })));
    } catch (e) { problems.push({ account: a.label, platform: a.platform, error: e.message }); }
  }
  return { messages: out.sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 150), problems, sources: [...new Set(sources)] };
});
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

// ---------------------------------------------------------------- backups, portable projects, cloud folders
route('GET', '/api/backups', async () => ({ ...(await backup.listBackups()), clouds: await backup.cloudFolders() }));
route('POST', '/api/backups', async (_p, b) => { try { return await backup.backupNow({ includeLibrary: Boolean(b.includeLibrary) }); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/backups/restore', async (_p, b) => { try { return await backup.restoreBackup(String(b.file || '')); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/backups/reveal', async (_p, b) => { const f = path.resolve(String(b.file || '')); if (!existsSync(f) || !/(Backup|\.churchstudio\.zip$|Backups$)/.test(f)) throw new HttpError(400, 'Not a backup'); await revealInFinder(f); return { ok: true }; });
route('POST', '/api/projects/:id/share', async ({ id }, b) => { try { return await backup.exportProject(id, { includeMedia: Boolean(b.includeMedia), folder: b.team ? (await loadConfig()).teamFolder || null : null }); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/projects/import', async (_p, b) => { try { return await backup.importProject(String(b.file || '')); } catch (e) { throw new HttpError(400, e.message); } });
route('GET', '/api/team', async () => backup.teamFolder());

// ---------------------------------------------------------------- search, tags, archive
route('GET', '/api/search', async (_p, _b, u) => search.search(u?.searchParams?.get('q') || ''));
route('PUT', '/api/finder/tags', async (_p, b) => { const tags = await finder.setTags(String(b.key || ''), b.tags); search.invalidateSearch(); return { tags }; });
route('POST', '/api/finder/archive', async (_p, b) => finder.archive(String(b.key || ''), Boolean(b.on)));

// ---------------------------------------------------------------- campaigns
route('GET', '/api/campaigns', async () => ({ campaigns: await campaigns.listCampaigns() }));
route('POST', '/api/campaigns/draft', async (_p, b) => { try { return await campaigns.draftCampaign(b || {}); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/campaigns', async (_p, b) => { try { return { campaign: await campaigns.createCampaign(b || {}) }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/campaigns/:cid/repeat', async ({ cid }, b) => { try { return { campaign: await campaigns.repeatCampaign(cid, b || {}) }; } catch (e) { throw new HttpError(400, e.message); } });
route('DELETE', '/api/campaigns/:cid', async ({ cid }) => campaigns.deleteCampaign(cid));
route('POST', '/api/campaigns/:cid/items', async ({ cid }, b) => { try { return { campaign: await campaigns.linkItem(cid, b || {}) }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/campaigns/:cid/unlink', async ({ cid }, b) => { try { return { campaign: await campaigns.unlinkItem(cid, String(b.key || '')) }; } catch (e) { throw new HttpError(400, e.message); } });

// ---------------------------------------------------------------- inspiration, blog, photo notes
route('GET', '/api/inspiration', async (_p, _b, q) => inspiration.inspiration({ period: q?.searchParams?.get('period') || 'quarter' }));
route('GET', '/api/seasons', async () => ({ seasons: await inspiration.seasonDays() }));
route('GET', '/api/inspiration/year', async (_p, _b, q) => inspiration.yearInReview(Number(q?.searchParams?.get('year')) || new Date().getFullYear()));
route('POST', '/api/blog/sync', async (_p, b) => { try { return await blog.syncBlog({ url: b.url || null }); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/blog/forget', async () => blog.forgetBlog());
route('POST', '/api/blog/voice', async (_p, b) => blog.setBlogVoice(b?.on !== false));
route('GET', '/api/library/notes', async () => ({ notes: await photos.loadNotes() }));
route('PUT', '/api/library/notes', async (_p, b) => ({ note: await photos.setNote(String(b.rel || ''), b) }));
route('POST', '/api/library/notes/suggest', async (_p, b) => { try { return await photos.suggestNote(String(b.rel || '')); } catch (e) { throw new HttpError(400, e.message); } });

// ---------------------------------------------------------------- jumpstart (settings file, website setup)
route('GET', '/api/jumpstart/parts', () => ({ parts: Object.entries(jumpstart.PARTS).map(([id, p]) => ({ id, label: p.label, about: p.about })) }));
route('POST', '/api/jumpstart/export', async (_p, b) => { try { return await jumpstart.exportSettings(b); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/jumpstart/read', async (_p, b) => { try { return await jumpstart.readPackage(String(b.file || '')); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/jumpstart/import', async (_p, b) => { try { return await jumpstart.importPackage(String(b.file || ''), b); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/jumpstart/scan', async (_p, b) => { try { return { found: await jumpstart.scanWebsite(b.website) }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/jumpstart/apply', async (_p, b) => jumpstart.applyScan(b.found || {}, b.keep || {}));
route('POST', '/api/jumpstart/reveal', async (_p, b) => {
  const f = path.resolve(String(b.file || ''));
  if (!/Jumpstart.*\.zip$/.test(path.basename(f)) || !existsSync(f)) throw new HttpError(400, 'Not a Jumpstart file');
  await revealInFinder(f);
  return { ok: true };
});

// ---------------------------------------------------------------- workspaces
// Start fresh: everything saved goes to the Trash, then the engine restarts as on the first day.
route('POST', '/api/start-fresh', async (_p, b) => {
  if (b?.confirm !== 'start fresh') throw new HttpError(400, 'Confirm first.');
  const r = await startFresh();
  setTimeout(() => process.exit(75), 300);
  return { ok: true, ...r, restarting: true };
});
route('GET', '/api/workspaces', () => workspaces.listWorkspaces());
route('POST', '/api/workspaces', async (_p, b) => { try { return { workspace: await workspaces.createWorkspace(b) }; } catch (e) { throw new HttpError(400, e.message); } });
route('PATCH', '/api/workspaces/:wid', async ({ wid }, b) => ({ workspace: await workspaces.renameWorkspace(wid, b.name) }));
route('POST', '/api/workspaces/:wid/switch', async ({ wid }) => {
  await workspaces.switchWorkspace(wid);
  // Restart so every path points at the new workspace. Electron restarts the engine on exit code 75.
  setTimeout(() => process.exit(75), 300);
  return { ok: true, restarting: true };
});

// ---------------------------------------------------------------- brand library
route('GET', '/api/library', () => library.listLibrary());
route('POST', '/api/library/open', async (_p, b) => {
  const root = await library.ensureLibrary();
  const target = b.folder && library.FOLDERS.includes(b.folder) ? path.join(root, b.folder) : root;
  if (process.platform === 'darwin') await import('./tools.js').then((t) => t.run('/usr/bin/open', [target]));
  return { ok: true, root };
});
route('POST', '/api/library/reveal', async (_p, b) => {
  const f = await library.libraryFile(String(b.rel || ''));
  if (!f) throw new HttpError(404, 'Not in the library');
  await revealInFinder(f);
  return { ok: true };
});
route('POST', '/api/library/save', async (_p, b) => { try { return await library.saveDataUrl(b.folder || 'Graphics', b.name, b.dataUrl); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/library/move', async (_p, b) => { try { return { rel: await library.moveFile(String(b.rel || ''), String(b.folder || '')) }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/library/rename', async (_p, b) => { try { return { rel: await library.renameFile(String(b.rel || ''), b.name) }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/library/erase', async (_p, b) => { try { return { removed: await library.eraseFile(String(b.rel || '')) }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/library/trash', async (_p, b) => { try { return await library.trashFile(String(b.rel || '')); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/library/replace', async (_p, b) => { try { return await library.replaceFile(String(b.rel || ''), String(b.file || '')); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/library/import', async (_p, b) => {
  const files = await library.importFiles(Array.isArray(b.paths) ? b.paths : [], b.folder);
  const root = await library.libraryRoot();
  const rels = files.map((f) => path.relative(root, f).split(path.sep).join('/'));
  // With the AI helper on, new pictures get a few searchable tags right away (worked out on this Mac).
  if ((await loadConfig()).llmProvider !== 'none' && b.folder !== 'Logos') photos.autoTag(rels).catch(() => {});
  return { files, rels };
});
// Add tags to pictures in bulk (all untagged ones, or the ones named).
route('POST', '/api/library/auto-tag', async (_p, b) => {
  const rels = Array.isArray(b.rels) && b.rels.length ? b.rels : (await library.listLibrary()).items.filter((i) => i.kind === 'image' && i.folder !== 'Logos').map((i) => i.rel);
  return { job: jobs.view(jobs.enqueue({ kind: 'tag', label: 'Tag brand photos', key: 'auto-tag' }, (ctx) => photos.autoTag(rels, { untaggedOnly: b.all !== true, ctx }))) };
});

// ---------------------------------------------------------------- writing
route('GET', '/api/writing', async () => ({ drafts: await writing.listDrafts() }));
route('POST', '/api/writing', async (_p, b) => { try { return await writing.newDraft(b || {}); } catch (e) { throw new HttpError(400, e.message); } });
route('GET', '/api/writing/audiences', async () => ({ audiences: writing.AUDIENCES.map(([id, label, about]) => ({ id, label, about })) }));
route('POST', '/api/writing/rewrite', async (_p, b) => { try { return await writing.rewriteFor(b.text, b.audience); } catch (e) { throw new HttpError(400, e.message); } });
// Brand voice
route('GET', '/api/brand-voice', async () => ({ voice: await voice.loadVoice() }));
route('PUT', '/api/brand-voice', async (_p, b) => ({ voice: await voice.updateVoice(b || {}) }));
route('POST', '/api/brand-voice/samples', async (_p, b) => { try { return { sample: await voice.addSample(b || {}) }; } catch (e) { throw new HttpError(400, e.message); } });
route('DELETE', '/api/brand-voice/samples/:sid', async ({ sid }) => ({ voice: await voice.removeSample(sid) }));
route('POST', '/api/brand-voice/score', async (_p, b) => voice.scoreVoice(String(b.text || ''), await voice.loadVoice()));
route('GET', '/api/writing/:id', async ({ id }) => ({ draft: await writing.loadDraft(id), trashed: await finder.isTrashed(`writing:${id}`) }));
route('POST', '/api/writing/:id/generate', async ({ id }) => { try { return { draft: await writing.saveDraft(id, await writing.generate(id)) }; } catch (e) { throw new HttpError(400, e.message); } });
route('PUT', '/api/writing/:id', async ({ id }, b) => ({ draft: await writing.saveDraft(id, b) }));
route('POST', '/api/writing/:id/suggest', async ({ id }, b) => { try { return await writing.suggest(id, b || {}); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/writing/:id/ai-write', async ({ id }, b) => { try { return await writing.aiWrite(id, String(b.kind || ''), { days: b.days }); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/writing/:id/rewrite', async ({ id }, b) => { try { return await writing.rewriteBlog(id, b || {}); } catch (e) { throw new HttpError(400, e.message); } });
// The same rewrite, streamed: each section as it is written, then the finished post.
streamRoute('POST', '/api/writing/:id/rewrite-stream', async ({ id }, b, res, req) => {
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
  const ac = new AbortController();
  req.on('close', () => { if (!res.writableEnded) ac.abort(); });
  const line = (o) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };
  try {
    const r = await writing.rewriteBlog(id, { ...(b || {}), signal: ac.signal, onPartial: (md) => line({ partial: md }) });
    line({ done: true, ...r });
  } catch (e) { line({ error: e.message }); }
  res.end();
});
route('POST', '/api/writing/:id/devotional', async ({ id }, b) => { try { return await writing.devotional(id, b.days); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/writing/:id/polish', async ({ id }, b) => { try { return await writing.polish(id, b.kind, b.text); } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/writing/:id/save-file', async ({ id }, b) => {
  const p = await getProject(id);
  const r = await library.saveText('Writing', `${b.name || p?.title || 'Draft'}`, String(b.text || ''));
  await revealInFinder(r.file);
  return r;
});

route('GET', '/api/ai-status', async () => aiStatus(await loadConfig()));

// ---------------------------------------------------------------- all projects (finder)
route('GET', '/api/finder', () => finder.finder());
route('POST', '/api/finder/folders', async (_p, b) => ({ folder: await finder.createFolder(b.name) }));
route('PATCH', '/api/finder/folders/:fid', async ({ fid }, b) => ({ folder: await finder.updateFolder(fid, b) }));
route('DELETE', '/api/finder/folders/:fid', async ({ fid }) => { await finder.deleteFolder(fid); return { ok: true }; });
route('POST', '/api/finder/folders/:fid/items', async ({ fid }, b) => { await finder.addToFolder(fid, String(b.key)); return { ok: true }; });
route('POST', '/api/finder/folders/:fid/remove', async ({ fid }, b) => { await finder.removeFromFolder(fid, String(b.key)); return { ok: true }; });
route('POST', '/api/finder/reveal', async (_p, b) => { try { await revealInFinder(await finder.locate(String(b.key))); return { ok: true }; } catch (e) { throw new HttpError(404, e.message); } });
route('GET', '/api/finder/folder-list', async () => ({ folders: await finder.folderList() }));
route('POST', '/api/finder/move', async (_p, b) => { try { await finder.moveToFolder(String(b.key), b.folderId || null); return { ok: true }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/finder/rename', async (_p, b) => { try { return { name: await finder.renameItem(String(b.key), b.name) }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/finder/source', async (_p, b) => { const f = await finder.sourceOf(String(b.key)); return { file: f ? f.split('/').pop() : null }; });
route('POST', '/api/finder/delete-source', async (_p, b) => { try { return { removed: await finder.deleteSource(String(b.key)) }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/finder/delete-item', async (_p, b) => { try { await finder.deleteItem(String(b.key)); return { ok: true }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/finder/star', async (_p, b) => { await finder.star(String(b.key), Boolean(b.on)); return { ok: true }; });
route('POST', '/api/finder/trash', async (_p, b) => { try { await finder.trashItem(String(b.key)); return { ok: true }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/finder/restore', async (_p, b) => { await finder.restoreItem(String(b.key)); return { ok: true }; });
route('POST', '/api/finder/delete', async (_p, b) => { try { await finder.deleteForever(String(b.key)); return { ok: true }; } catch (e) { throw new HttpError(400, e.message); } });
route('POST', '/api/finder/empty-trash', async () => { await finder.emptyTrash(); return { ok: true }; });

// ---------------------------------------------------------------- updates
route('GET', '/api/version', async () => ({ version: updates.VERSION, repo: updates.UPDATE_REPO, last: updates.lastUpdateCheck(), upgrade }));
route('POST', '/api/updates/check', async () => { try { return await updates.checkForUpdate(); } catch (e) { throw new HttpError(502, `Couldn't reach the update server. ${e.message}`); } });
route('POST', '/api/updates/download', () => ({ job: jobs.view(jobs.enqueue({ kind: 'update', label: 'Download update', key: 'update' }, (ctx) => updates.downloadUpdate(ctx))) }));
route('POST', '/api/feedback', async (_p, b) => { try { return await updates.sendFeedback(b || {}); } catch (e) { throw new HttpError(400, e.message); } });
route('GET', '/api/changelog', async () => ({ text: await updates.changelog(), version: updates.VERSION }));

// ---------------------------------------------------------------- sermon stills (header images)
route('GET', '/api/projects/:id/stills', async ({ id }) => {
  try {
    const { times, project } = await writing.stillTimes(id);
    if (!project.sourceFile) return { stills: [] };
    const dir = path.join(projectDir(id), 'stills');
    await mkdir(dir, { recursive: true });
    const out = [];
    for (const t of times) {
      const name = `s${Math.round(t)}.jpg`;
      if (!existsSync(path.join(dir, name))) await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', String(t), '-i', fileOf(id, project.sourceFile), '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', path.join(dir, name)]);
      out.push({ t, url: `/media/${encodeURIComponent(id)}/stills/${name}` });
    }
    return { stills: out };
  } catch (e) { throw new HttpError(400, e.message); }
});
route('POST', '/api/projects/:id/stills', async ({ id }, b) => {
  const project = await getProject(id);
  if (!project?.sourceFile) throw new HttpError(400, 'The video is not downloaded.');
  const t = Math.max(0, Number(b.t) || 0);
  const tmp = path.join(projectDir(id), 'stills', `full-${Math.round(t)}.jpg`);
  await mkdir(path.dirname(tmp), { recursive: true });
  await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', String(t), '-i', fileOf(id, project.sourceFile), '-frames:v', '1', '-vf', 'scale=1920:-2', '-q:v', '2', tmp]);
  const mm = `${Math.floor(t / 60)}-${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const r = await library.saveDataUrl('Photos', `${project.title} still ${mm}`, `data:image/jpeg;base64,${(await readFile(tmp)).toString('base64')}`);
  await rm(tmp, { force: true });
  return { rel: r.rel, url: `/library/${r.rel.split('/').map(encodeURIComponent).join('/')}` };
});

// ---------------------------------------------------------------- designs (Graphics)
route('GET', '/api/designs', async () => {
  const trashed = new Set((await finder.finder()).trash.map((t) => t.key));
  return { designs: (await designs.listDesigns()).filter((d) => !trashed.has(`design:${d.id}`)) };
});
route('GET', '/api/designs/:id', async ({ id }) => { const d = await designs.getDesign(id); if (!d) throw new HttpError(404, 'Design not found'); return { design: d }; });
route('PUT', '/api/designs/:id', async ({ id }, b) => ({ design: await designs.saveDesign(id, b) }));
route('DELETE', '/api/designs/:id', async ({ id }) => { await designs.deleteDesign(id); return { ok: true }; });
route('GET', '/api/outline/:id', async ({ id }) => { try { return { outline: await writing.outline(id) }; } catch (e) { throw new HttpError(400, e.message); } });
// Export every page of a design into the brand library (Graphics/<name>/), or one file (PDF, PPTX).
route('POST', '/api/designs/export', async (_p, b) => {
  return library.saveExport(String(b.name || 'Design'), b.files || [], b.folder || 'Graphics');
});

// ---------------------------------------------------------------- ideas (My App)
route('GET', '/api/ideas', async () => {
  const tally = new Map();
  const sermons = [];
  for (const summary of (await listProjects()).slice(0, 12)) {
    const t = await getTranscript(summary.id).catch(() => null);
    if (!t) continue;
    const sentences = toSentences(t.words);
    for (const k of topKeywords(sentences.map((x) => x.text).join(' '), backgroundOf(sentences), 6)) tally.set(k, (tally.get(k) || 0) + 1);
    sermons.push({ id: summary.id, title: summary.title });
  }
  return { topics: [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 12), sermons, workspace: { id: WORKSPACE.id, name: WORKSPACE.name } };
});

// ---------------------------------------------------------------- dashboard
/** Everything the home dashboard needs in one call: exports, posts, sermons, work in progress. */
// The menu bar panel's summary (only built when the panel opens).
route('GET', '/api/tray', async () => traySummary());
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
        if (r.stream) return r.handler(params, b, res, req);
        return send(res, 200, await r.handler(params, b, url));
      }
      throw new HttpError(404, 'Not found');
    }
    if (url.pathname.startsWith('/library/')) { // brand library files (images for previews and graphics)
      const f = await library.libraryFile(decodeURIComponent(url.pathname.slice(9)));
      if (!f) throw new HttpError(404, 'Not in the library');
      return streamFile(req, res, f);
    }
    if (url.pathname.startsWith('/audio-preview/')) { // before/after samples for audio cleanup
      const f = safeJoin(audio.previewDir(), decodeURIComponent(url.pathname.slice(15)));
      if (!f || !existsSync(f)) throw new HttpError(404, 'Preview expired');
      return streamFile(req, res, f);
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
        return res.end(page('YouTube connected', `“${esc(a.name)}” is ready in Church Studio. You can close this tab.`));
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
    if (!existsSync(UI_DIR)) { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('Church Studio engine is running. Build the UI with: npm run build'); }
    let file = safeJoin(UI_DIR, `.${url.pathname}`);
    if (!file || !existsSync(file) || statSync(file).isDirectory()) file = path.join(UI_DIR, 'index.html');
    return streamFile(req, res, file);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    return send(res, status, { error: e.message });
  }
});

// Back up and migrate data once when the app version changes, before serving anything.
let upgrade = { upgraded: false };
try { upgrade = await updates.prepareUpgrade(); if (upgrade.upgraded) console.log(`Updated ${upgrade.from} -> ${upgrade.to}. Backup: ${upgrade.backup}`); } catch (e) { console.error('Upgrade check failed:', e.message); }

server.listen(PORT, HOST, () => {
  social.startScheduler().catch((e) => console.error('[social] scheduler failed to start', e));
  churchCal.refreshIfDue(); setInterval(() => churchCal.refreshIfDue(), 3600_000).unref();
  appleStatus().catch(() => {}); // know early whether Apple Intelligence is ready
  setTimeout(() => backup.backupIfDue(), 3 * 60_000).unref(); // weekly backup, once things settle
  console.log(`Church Studio engine on http://${HOST}:${PORT}`);
  process.send?.({ ready: true, port: PORT });
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
