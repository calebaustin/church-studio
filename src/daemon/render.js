// Export a clip: build the render job (cuts, caption words, theme) and run scripts/render_clip.py.
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { run, python, tool, SCRIPTS_DIR } from './tools.js';
import { file, getProject, getTranscript, updateProject, projectDir } from './projects.js';
import { loadConfig } from './config.js';
import { getVideoTheme, fontFile } from './themes.js';

/**
 * Parts of the clip to keep, in seconds from its start. Removes cut words and, when asked,
 * shortens pauses between words to `maxPause` (VGP CL3 "tighten pauses").
 */
export function keepSegments(words, clip, { maxPause = 0.45, pad = 0.08 } = {}) {
  const len = clip.end - clip.start;
  const cuts = [];
  const cut = new Set(clip.cutWords || []);
  const inClip = words.map((w, i) => ({ ...w, i })).filter((w) => w.end > clip.start && w.start < clip.end);
  for (const w of inClip) {
    if (cut.has(w.i)) cuts.push([w.start - clip.start, w.end - clip.start]);
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

function fileName(pattern, project, clip, index) {
  const date = new Date().toISOString().slice(0, 10);
  const name = pattern
    .replaceAll('{date}', date)
    .replaceAll('{title}', clip.title || `Clip ${index + 1}`)
    .replaceAll('{sermon}', project.title)
    .replaceAll('{n}', String(index + 1).padStart(2, '0'));
  return name.replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || `clip-${clip.id}`;
}

async function buildJob(project, clip, { preview = false, trackOnly = false } = {}) {
  const transcript = await getTranscript(project.id);
  const words = transcript?.words || [];
  const cut = new Set(clip.cutWords || []);
  const clipWords = words
    .map((w, i) => ({ ...w, i }))
    .filter((w) => w.end > clip.start && w.start < clip.end && !cut.has(w.i))
    .map(({ w, start, end }) => ({ w, start, end }));
  const theme = await getVideoTheme(clip.videoTheme || project.videoTheme || (await loadConfig()).videoTheme);
  const font = fontFile(theme.font);
  return {
    source: file(project.id, project.sourceFile),
    start: clip.start, end: clip.end, fps: 30, width: 1080, height: 1920, preview,
    crop: clip.crop || { mode: 'auto' },
    keep: trackOnly ? null : keepSegments(words, clip),
    words: clipWords,
    hook: clip.hook || null,
    captions: clip.captions !== false,
    theme: { ...theme, fontFile: font?.file, fontStyle: font?.style },
  };
}

function runRender(job, ctx, extraArgs = []) {
  return run(python(), [path.join(SCRIPTS_DIR, 'render_clip.py'), job, ...extraArgs], {
    signal: ctx.signal,
    onStderr: (chunk) => {
      const m = [...chunk.matchAll(/PROGRESS (\d+) ?([^\n]*)/g)].pop();
      if (m) ctx.progress(Number(m[1]), m[2] ? `${m[2]}… ${m[1]}%` : undefined);
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

export async function exportClip(projectId, clipId, { preview = false } = {}, ctx) {
  const project = await getProject(projectId);
  const index = project?.clips.findIndex((c) => c.id === clipId);
  if (!project || index < 0) throw new Error('Clip not found');
  const clip = project.clips[index];
  const config = await loadConfig();
  const exportsDir = path.join(projectDir(projectId), preview ? 'previews' : 'exports');
  const target = !preview && config.exportFolder && existsSync(config.exportFolder) ? config.exportFolder : exportsDir;
  await mkdir(exportsDir, { recursive: true });
  await mkdir(target, { recursive: true });
  const base = preview ? clip.id : fileName(config.exportPattern || '{date} - {title}', project, clip, index);
  const out = path.join(target, `${base}.mp4`);
  const thumb = path.join(exportsDir, `${clip.id}.jpg`);
  const job = await buildJob(project, clip, { preview });
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
    const info = { file: out, rel: out.startsWith(projectDir(projectId)) ? rel(out) : null, thumb: rel(thumb), at: new Date().toISOString(), length: result.length, crop: result };
    if (preview) c.preview = info;
    else { c.export = info; c.status = 'exported'; }
  });
  ctx.progress(100, preview ? 'Preview ready' : `Exported ${path.basename(out)}`);
  return { file: out, ...result };
}

export async function revealInFinder(p) {
  if (process.platform === 'darwin') await run('/usr/bin/open', ['-R', p]);
}

export { tool };
