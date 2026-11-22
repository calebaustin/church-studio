// Clip proposal orchestration: heuristic first (always), optional AI re-rank on top.
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { file, getProject, getTranscript, updateProject } from './projects.js';
import { run, tool } from './tools.js';
import { loadConfig } from './config.js';
import { proposeHeuristic } from './clips.js';
import { aiStatus, isUsageError, LOCAL_PROVIDERS, markUsageProblem, PROVIDER_NAMES, rerank } from './ai.js';

export async function proposeClips(id, { prompt = '', count, min, max, replace = true } = {}, ctx) {
  const project = await getProject(id);
  const transcript = await getTranscript(id);
  if (!transcript) throw new Error('Transcribe the video first.');
  const cfg = await loadConfig();
  count = Number(count || cfg.clipCount);
  min = Number(min || cfg.clipMin);
  max = Number(max || cfg.clipMax);
  const range = project.sermon || { start: null, end: null };

  ctx.progress(4, 'Scoring every possible clip…');
  const useAI = aiStatus(cfg).active;
  // Ask the heuristic for extra candidates when an AI will choose among them.
  const heur = proposeHeuristic(transcript.words, { start: range.start, end: range.end, count: useAI ? count * 3 : count, min, max, prompt });
  let clips = heur.slice(0, count);
  let method = 'heuristic';
  let warning = null;

  if (useAI && heur.length) {
    ctx.progress(8, `Asking ${PROVIDER_NAMES[cfg.llmProvider] || cfg.llmProvider} to rank the best moments…`);
    try {
      const words = transcript.words;
      const cands = heur.map((c) => ({
        ...c,
        text: words.filter((w) => w.start >= c.start && w.end <= c.end).map((w) => w.w).join(' '),
      }));
      let ranked;
      if (LOCAL_PROVIDERS.includes(cfg.llmProvider)) {
        // On-device helpers read a few moments at a time: each request stays small and quick, the bar moves after
        // every batch, and a slow Mac never waits on one giant request (that used to look like a freeze at 40%).
        const pool = cands.slice(0, cfg.llmProvider === 'apple' ? 10 : 24);
        const size = cfg.llmProvider === 'apple' ? 5 : 6;
        const started = Date.now(); const budget = 6 * 60_000; const scored = [];
        // The bar spans the helper's whole job (8% to 96%) and keeps moving inside each batch at the pace the
        // batches so far have taken, so it never sits still while the helper reads.
        const span = (k) => 8 + (88 * k) / pool.length;
        let per = 30_000; let tick = null;
        for (let k = 0; k < pool.length; k += size) {
          if (Date.now() - started > budget) { warning = `${PROVIDER_NAMES[cfg.llmProvider]} took a while, so the rest were picked locally.`; break; }
          const part = pool.slice(k, k + size);
          const msg = `${PROVIDER_NAMES[cfg.llmProvider]} is reading moments ${k + 1}-${k + part.length} of ${pool.length}…`;
          const from = span(k); const to = span(k + part.length); const t0 = Date.now();
          ctx.progress(from, msg);
          ctx.detail?.({ Batch: `${Math.floor(k / size) + 1} of ${Math.ceil(pool.length / size)}`, Helper: PROVIDER_NAMES[cfg.llmProvider] });
          clearInterval(tick);
          tick = setInterval(() => { const f = 1 - Math.exp(-(Date.now() - t0) / per); ctx.progress(from + (to - from) * Math.min(0.95, f), msg); }, 1000);
          const signal = ctx.signal ? AbortSignal.any([ctx.signal, AbortSignal.timeout(150_000)]) : AbortSignal.timeout(150_000);
          try { scored.push(...await rerank(cfg, part, { title: project.title, count: part.length, signal })); } catch (e) {
            if (ctx.signal?.aborted) { clearInterval(tick); throw new Error('Cancelled'); }
            if (isUsageError(e)) { clearInterval(tick); throw e; }
            // One slow or confused batch: keep going with the rest.
          }
          per = per * 0.5 + (Date.now() - t0) * 0.5; // learn this Mac's pace
        }
        clearInterval(tick);
        ranked = scored.sort((a, b) => b.score - a.score).slice(0, count);
        // Short of picks? Top up with the offline picks the helper didn't get to.
        for (const h of heur) { if (ranked.length >= count) break; if (!ranked.some((r) => r.start === h.start && r.end === h.end)) ranked.push(h); }
      } else {
        ranked = await rerank(cfg, cands, { title: project.title, count, signal: ctx.signal });
      }
      if (ranked.length) { clips = ranked; method = cfg.llmProvider; } else warning = 'The AI returned no clips; kept the offline picks.';
    } catch (e) {
      if (isUsageError(e)) { markUsageProblem(cfg, e); warning = `${PROVIDER_NAMES[cfg.llmProvider]} is out of usage right now, so clips were picked locally.`; }
      else warning = `AI ranking failed (${e.message.slice(0, 160)}); kept the offline picks.`;
    }
  }

  // Live streams sometimes cut to a full-screen sermon slide. Those clips can still be good, so they're
  // flagged, not dropped: the editor can trim that part (or show the verse as text instead).
  if (project.sourceFile && project.media?.width > 0) {
    ctx.progress(97, 'Checking for full-screen slides…');
    clips = await flagSlides(file(id, project.sourceFile), clips, ctx.signal).catch(() => clips);
  }

  await updateProject(id, (p) => {
    const keep = replace ? p.clips.filter((c) => c.status !== 'proposed') : p.clips;
    const overlaps = (a, b) => !(a.end <= b.start || a.start >= b.end);
    p.clips = [...keep, ...clips.filter((c) => !keep.some((k) => overlaps(k, c)))];
    p.proposalMethod = method;
  });
  ctx.progress(100, `${clips.length} clips proposed (${method === 'heuristic' ? 'offline scoring' : method})`);
  return { count: clips.length, method, warning };
}

/**
 * Mark clips where a slide fills the screen: frames every few seconds, looked at by Apple's Vision framework.
 * A frame with plenty of text and no face is a slide. Adds flags: ['slide'] and the slide moments (clip seconds).
 */
export async function flagSlides(source, clips, signal) {
  const vision = tool('cs-vision');
  if (!existsSync(vision) || !existsSync(source)) return clips;
  const out = [];
  for (const c of clips) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cs-slide-'));
    try {
      const every = 4;
      await run(tool('ffmpeg'), ['-y', '-loglevel', 'error', '-ss', String(c.start), '-t', String(c.end - c.start), '-i', source,
        '-vf', `fps=1/${every},scale=480:-2`, '-q:v', '5', path.join(dir, 'f%03d.jpg')], { signal });
      const frames = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
      if (!frames.length) { out.push(c); continue; }
      const { stdout } = await run(vision, frames.map((f) => path.join(dir, f)), { signal });
      const looks = stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const slides = looks.map((r, k) => ({ t: k * every, slide: (r.faces || 0) === 0 && (r.textChars || 0) >= 25 })).filter((x) => x.slide).map((x) => x.t);
      out.push(slides.length ? { ...c, flags: [...new Set([...(c.flags || []), 'slide'])], slideAt: slides } : c);
    } catch (e) { if (signal?.aborted) throw e; out.push(c); } finally { await rm(dir, { recursive: true, force: true }); }
  }
  return out;
}
