// Export a clip: build the render job (cuts, caption words, theme) and run scripts/render_clip.py.
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run, tool, pyCommand } from './tools.js';
import { file, getProject, getTranscript, updateProject, projectDir } from './projects.js';
import { loadConfig } from './config.js';
import { getVideoTheme, fontFile } from './themes.js';
import { speakerPrior, saveLast, pickEditSettings } from './prefs.js';
import { libraryFile } from './library.js';
import { audioFilter } from './audio.js';

/**
 * Parts of the clip to keep, in seconds from its start. Removes cut words and, when asked,
 * shortens pauses between words to `maxPause` ("tighten pauses").
 */
export function keepSegments(words, clip, { maxPause = clip?.pauseMax ?? 0.45, pad = 0.08, fillers = null } = {}) {
  const len = clip.end - clip.start;
  const cuts = [];
  const cut = new Set(clip.cutWords || []);
  const inClip = words.map((w, i) => ({ ...w, i })).filter((w) => w.end > clip.start && w.start < clip.end);
  // Each run of cut words goes from the end of the last kept word to the start of the next kept one, so the
  // pauses around cut words go too and the clip jumps straight to the next word (no little gaps of air).
  // Keep the tail of the last kept word and the start of the next one so neither sounds clipped.
  const TAIL = 0.12; const LEAD = 0.06;
  for (let k = 0; k < inClip.length; k++) {
    if (!cut.has(inClip[k].i)) continue;
    let j = k; while (j + 1 < inClip.length && cut.has(inClip[j + 1].i)) j++;
    const prev = inClip[k - 1]; const next = inClip[j + 1];
    const from = prev ? Math.min(prev.end + TAIL, inClip[k].start) - clip.start : 0; // at the clip's start: cut from 0
    const to = next ? Math.max(next.start - LEAD, inClip[j].end) - clip.start : clip.end - clip.start; // at its end: cut to the end
    cuts.push([from, to]);
    k = j;
  }
  // "um" and "uh": each one goes with the air around it, keeping the tail of the word before and the start of the next.
  if (clip.cutFillers && fillers?.length) {
    for (const f of fillers) {
      if (f.end <= clip.start || f.start >= clip.end) continue;
      const prev = [...inClip].reverse().find((w) => w.end <= f.start + 0.01 && !cut.has(w.i));
      const next = inClip.find((w) => w.start >= f.end - 0.01 && !cut.has(w.i));
      const from = prev ? Math.min(prev.end + TAIL, f.start) : f.start;
      const to = next ? Math.max(next.start - LEAD, f.end) : f.end;
      cuts.push([from - clip.start, to - clip.start]);
    }
  }
  if (clip.tightenPauses) {
    const kept = inClip.filter((w) => !cut.has(w.i));
    for (let k = 1; k < kept.length; k++) {
      const gap = kept[k].start - kept[k - 1].end;
      if (gap > maxPause) cuts.push([kept[k - 1].end - clip.start + pad, kept[k].start - clip.start - pad]);
    }
  }
  if (!cuts.length) return null;
  cuts.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of cuts) {
    const a = Math.max(0, s);
    const b = Math.min(len, e);
    if (b <= a) continue;
    if (merged.length && a <= merged.at(-1)[1] + 0.01) merged.at(-1)[1] = Math.max(merged.at(-1)[1], b);
    else merged.push([a, b]);
  }
  const keep = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s - pos > 0.05) keep.push([+pos.toFixed(3), +s.toFixed(3)]);
    pos = e;
  }
  if (len - pos > 0.05) keep.push([+pos.toFixed(3), +len.toFixed(3)]);
  return keep;
}

function fileName(pattern, project, clip, index, preset) {
  const date = new Date().toISOString().slice(0, 10);
  const name = pattern
    .replaceAll('{date}', date)
    .replaceAll('{title}', clip.title || `Clip ${index + 1}`)
    .replaceAll('{sermon}', project.title)
    .replaceAll('{n}', String(index + 1).padStart(2, '0'))
    .replaceAll('{preset}', preset || 'vertical');
  return name.replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || `clip-${clip.id}`;
}

/** Export presets: where the clip is going decides its shape. */
export const EXPORT_PRESETS = {
  vertical: { label: 'Reels · Shorts · TikTok (9:16)', w: 1080, h: 1920 },
  portrait: { label: 'Instagram / Facebook feed (4:5)', w: 1080, h: 1350 },
  square: { label: 'Square (1:1)', w: 1080, h: 1080 },
  landscape: { label: 'YouTube / website (16:9)', w: 1920, h: 1080 },
};
const SCALE = { '720': 720 / 1080, '1080': 1, '1440': 1440 / 1080, '2160': 2 };
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/** Normalise user export options into renderer settings. */
export function exportSettings(o = {}) {
  const preset = EXPORT_PRESETS[o.preset] || EXPORT_PRESETS.vertical;
  const k = SCALE[String(o.resolution || '1080')] || 1;
  const quality = { standard: 8, high: 12, max: 20 }[o.quality || 'high'] || 12;
  const areaK = (preset.w * preset.h * k * k) / (1080 * 1920); // keep bits-per-pixel steady
  const fps = [24, 25, 30, 60].includes(Number(o.fps)) ? Number(o.fps) : 30;
  return {
    width: even(preset.w * k), height: even(preset.h * k), fps,
    codec: o.codec === 'hevc' ? 'hevc' : 'h264',
    mbps: Math.round(quality * areaK * (fps === 60 ? 1.5 : 1) * (o.codec === 'hevc' ? 0.6 : 1) * 10) / 10,
  };
}

export async function buildJob(project, clip, { preview = false, trackOnly = false, options = {} } = {}) {
  const transcript = await getTranscript(project.id);
  const words = transcript?.words || [];
  const cut = new Set(clip.cutWords || []);
  const clipWords = words
    .map((w, i) => ({ ...w, i }))
    .filter((w) => w.end > clip.start && w.start < clip.end && !cut.has(w.i) && w.w)
    .map(({ w, start, end }) => ({ w, start, end }));
  const base = await getVideoTheme(clip.videoTheme || project.videoTheme || (await loadConfig()).videoTheme);
  // This clip's own placement of the hook and captions (set by dragging in the preview or with the sliders).
  const pick = (v, d) => (v != null ? v : d);
  const theme = { ...base, hookSize: pick(clip.hookSize, base.hookSize), hookWidth: pick(clip.hookWidth, base.hookWidth), position: pick(clip.capY, base.position), maxWidth: pick(clip.capWidth, base.maxWidth), size: pick(clip.capSize, base.size) };
  const font = await fontFile(theme.font);
  const hookFontRec = clip.hookFont || base.hookFont ? await fontFile(clip.hookFont || base.hookFont) : null;
  // Wide clips render wide, quick renders included, unless an export picks another shape.
  const out = exportSettings({ ...options, preset: options.preset || (clip.format === 'wide' ? 'landscape' : undefined) });
  return {
    source: file(project.id, project.sourceFile),
    start: clip.start, end: clip.end, preview, ...out,
    crop: clip.crop || { mode: 'auto', smooth: 0 },
    look: clip.look || null, // studio look: color preset, strength, lighting lift, background blur
    speakerPrior: (await speakerPrior()).x != null ? { x: (await speakerPrior()).x } : null,
    hookY: clip.hookY ?? null,
    // A thin bar that fills as the clip plays, so viewers see how much is left.
    progressBar: clip.progressBar?.on ? { pos: clip.progressBar.pos === 'top' ? 'top' : 'bottom', color: clip.progressBar.color || (await loadConfig()).brandColors?.[1] || '#FFFFFF' } : null,
    overlay: clip.overlay?.rel ? { ...clip.overlay, file: await libraryFile(clip.overlay.rel) } : null,
    endCard: clip.endCard?.rel ? { ...clip.endCard, file: await libraryFile(clip.endCard.rel) } : null,
    introCard: clip.introCard?.rel ? { ...clip.introCard, file: await libraryFile(clip.introCard.rel) } : null,
    keep: trackOnly ? null : keepSegments(words, clip, { fillers: transcript?.fillers }),
    words: clipWords,
    hook: options.hook === false ? null : clip.hook || null,
    captions: options.captions === false ? false : clip.captions !== false,
    theme: { ...theme, fontFile: font?.file, fontStyle: font?.style, fontIndex: font?.index ?? null,
      ...(hookFontRec?.file ? { hookFontFile: hookFontRec.file, hookFontStyle: hookFontRec.style, hookFontIndex: hookFontRec.index ?? null } : {}) },
    // Audio cleanup: the clip's own setting, else the sermon's.
    audioFilter: audioFilter(clip.audioCleanup !== undefined ? clip.audioCleanup : project.audioCleanup),
    // Text pop-ups (times are in the finished clip) and colors for clips with no picture.
    popups: Array.isArray(clip.popups) ? clip.popups.filter((p) => p.text && p.end > p.start) : [],
    lyric: { colors: (await loadConfig()).brandColors || [] },
  };
}

function runRender(job, ctx, extraArgs = []) {
  return run(...pyCommand('render_clip', [job, ...extraArgs]), {
    signal: ctx.signal,
    onStderr: (chunk) => {
      const m = [...chunk.matchAll(/PROGRESS (\d+) ?([^\n]*)/g)].pop();
      if (m) ctx.progress(Number(m[1]), m[2] ? `${m[2]}… ${m[1]}%` : undefined);
      for (const d of chunk.matchAll(/DETAIL ([^|\n]+)\|([^\n]*)/g)) ctx.detail?.({ [d[1].trim()]: d[2].trim() });
    },
  });
}

/** Camera path only (for the editor preview): projects/<id>/tracks/<clip>.json */
export async function trackClip(projectId, clipId, ctx) {
  const project = await getProject(projectId);
  const clip = project?.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error('Clip not found');
  const dir = path.join(projectDir(projectId), 'tracks');
  await mkdir(dir, { recursive: true });
  const job = await buildJob(project, clip, { trackOnly: true });
  job.trackOut = path.join(dir, `${clip.id}.json`);
  const jobFile = path.join(dir, `${clip.id}.job.json`);
  await writeFile(jobFile, JSON.stringify(job));
  try {
    await runRender(jobFile, ctx, ['--track-only']);
  } finally {
    await rm(jobFile, { force: true });
  }
  return { track: `tracks/${clip.id}.json` };
}

export async function exportClip(projectId, clipId, { preview = false, options = {} } = {}, ctx) {
  const project = await getProject(projectId);
  const index = project?.clips.findIndex((c) => c.id === clipId);
  if (!project || index < 0) throw new Error('Clip not found');
  const clip = project.clips[index];
  const config = await loadConfig();
  const exportsDir = path.join(projectDir(projectId), preview ? 'previews' : 'exports');
  const folder = options.folder || config.exportFolder || downloadsDir();
  const target = !preview && folder && existsSync(folder) ? folder : exportsDir;
  await mkdir(exportsDir, { recursive: true });
  await mkdir(target, { recursive: true });
  const pattern = options.fileName?.trim() || config.exportPattern || '{date} - {title}';
  const presetTag = options.preset && options.preset !== 'vertical' ? ` (${options.preset})` : '';
  const base = preview ? clip.id : `${fileName(pattern, project, clip, index, options.preset)}${pattern.includes('{preset}') ? '' : presetTag}`;
  const out = path.join(target, `${base}.mp4`);
  const thumb = path.join(exportsDir, `${clip.id}.jpg`);
  const job = await buildJob(project, clip, { preview, options });
  Object.assign(job, { out, thumb });
  const jobFile = path.join(exportsDir, `${clip.id}.job.json`);
  await writeFile(jobFile, JSON.stringify(job));
  ctx.progress(1, preview ? 'Rendering preview…' : 'Starting export…');
  let result;
  try {
    const { stdout } = await runRender(jobFile, ctx);
    result = JSON.parse(stdout.trim().split('\n').pop());
  } finally {
    await rm(jobFile, { force: true });
  }
  const rel = (p) => path.relative(projectDir(projectId), p);
  await updateProject(projectId, (p) => {
    const c = p.clips.find((x) => x.id === clipId);
    if (!c) return;
    const info = {
      file: out, rel: out.startsWith(projectDir(projectId)) ? rel(out) : null, thumb: rel(thumb), at: new Date().toISOString(),
      length: result.length, width: result.width, height: result.height, bytes: statSync(out).size,
      preset: options.preset || 'vertical', crop: result,
    };
    if (preview) c.preview = info;
    else {
      c.export = info;
      c.exports = [info, ...(c.exports || []).filter((e) => e.file !== out)].slice(0, 12);
      c.status = 'exported';
    }
  });
  if (!preview) await saveLast(pickEditSettings(clip, options)).catch(() => {});
  ctx.progress(100, preview ? 'Preview ready' : `Exported ${path.basename(out)}`);
  return { file: out, ...result };
}

/**
 * Several clips joined into one video, in order (a series, or two speakers back to back).
 * Each clip renders with the same settings, then they're joined without re-encoding.
 */
export async function exportJoined(projectId, clipIds, options = {}, ctx) {
  const project = await getProject(projectId);
  const clips = clipIds.map((id) => project?.clips.find((c) => c.id === id)).filter(Boolean);
  if (clips.length < 2) throw new Error('Pick at least two clips to join.');
  const config = await loadConfig();
  const tmp = path.join(projectDir(projectId), 'exports', `join-${Date.now().toString(36)}`);
  await mkdir(tmp, { recursive: true });
  const parts = [];
  try {
    for (let i = 0; i < clips.length; i++) {
      const job = await buildJob(project, clips[i], { options });
      const out = path.join(tmp, `${String(i).padStart(2, '0')}.mp4`);
      Object.assign(job, { out, thumb: i === 0 ? path.join(tmp, 'thumb.jpg') : null });
      const jobFile = path.join(tmp, `${i}.job.json`);
      await writeFile(jobFile, JSON.stringify(job));
      const part = {
        ...ctx,
        progress: (pct, msg) => ctx.progress(Math.min(96, ((i + pct / 100) / clips.length) * 96), `Clip ${i + 1} of ${clips.length}: ${msg || 'Rendering'}`),
      };
      await runRender(jobFile, part);
      parts.push(out);
    }
    ctx.progress(97, 'Joining the clips…');
    const list = path.join(tmp, 'list.txt');
    await writeFile(list, parts.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const folder = options.folder || config.exportFolder || downloadsDir();
    await mkdir(folder, { recursive: true });
    const safe = project.title.replace(/[/\\:*?"<>|]+/g, '-').slice(0, 100);
    const date = new Date().toISOString().slice(0, 10);
    const out = path.join(folder, `${date} - ${safe} (${clips.length} clips joined).mp4`);
    await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { signal: ctx.signal });
    await updateProject(projectId, (p) => { p.joined = [{ file: out, at: new Date().toISOString(), clips: clipIds }, ...(p.joined || [])].slice(0, 10); });
    ctx.progress(100, `Saved ${path.basename(out)}`);
    return { file: out, projectId, clips: clips.length };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** A few evenly spread frames from a clip, for the "click the speaker" helper. */
export async function sampleFrames(projectId, clipId, count = 6) {
  const project = await getProject(projectId);
  const clip = project?.clips.find((c) => c.id === clipId);
  if (!clip) throw new Error('Clip not found');
  const dir = path.join(projectDir(projectId), 'tracks', 'frames');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const len = clip.end - clip.start;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = +((len * (i + 0.5)) / count + (Math.random() - 0.5) * (len / count) * 0.6).toFixed(2);
    const name = `f${i}-${Date.now().toString(36)}.jpg`;
    await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', String(clip.start + t), '-i', file(projectId, project.sourceFile),
      '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '4', path.join(dir, name)]);
    out.push({ t, url: `/media/${encodeURIComponent(projectId)}/tracks/frames/${name}` });
  }
  return out;
}

/** Exports go to ~/Downloads unless the user picks a folder. */
export function downloadsDir() {
  const d = path.join(os.homedir(), 'Downloads');
  return existsSync(d) ? d : null;
}

/** Move an exported file to another folder (keeps the name; adds " 2" etc. if taken). */
export async function moveExport(projectId, clipId, folder) {
  if (!folder || !existsSync(folder)) throw new Error('That folder doesn’t exist.');
  const project = await getProject(projectId);
  const clip = project?.clips.find((c) => c.id === clipId);
  const from = clip?.export?.file;
  if (!from || !existsSync(from)) throw new Error('The exported file is missing. Export it again.');
  const ext = path.extname(from);
  const base = path.basename(from, ext);
  let to = path.join(folder, `${base}${ext}`);
  for (let n = 2; existsSync(to) && to !== from; n++) to = path.join(folder, `${base} ${n}${ext}`);
  if (to === from) return { file: from };
  try { await rename(from, to); } catch (e) {
    if (e.code !== 'EXDEV') throw e; // different disk: copy then remove
    await copyFile(from, to);
    await rm(from, { force: true });
  }
  const rel = (p) => (p.startsWith(projectDir(projectId)) ? path.relative(projectDir(projectId), p) : null);
  await updateProject(projectId, (p) => {
    const c = p.clips.find((x) => x.id === clipId);
    for (const e of [c.export, ...(c.exports || [])]) if (e?.file === from) { e.file = to; e.rel = rel(to); }
  });
  return { file: to };
}

export async function revealInFinder(p) {
  if (process.platform === 'darwin') await run('/usr/bin/open', ['-R', p]);
}

export { tool };
