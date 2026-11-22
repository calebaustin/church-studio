// Clip proposal orchestration: heuristic first (always), optional AI re-rank on top.
import { getProject, getTranscript, updateProject } from './projects.js';
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

  ctx.progress(10, 'Scoring every possible clip…');
  const useAI = aiStatus(cfg).active;
  // Ask the heuristic for extra candidates when an AI will choose among them.
  const heur = proposeHeuristic(transcript.words, { start: range.start, end: range.end, count: useAI ? count * 3 : count, min, max, prompt });
  let clips = heur.slice(0, count);
  let method = 'heuristic';
  let warning = null;

  if (useAI && heur.length) {
    ctx.progress(40, `Asking ${PROVIDER_NAMES[cfg.llmProvider] || cfg.llmProvider} to rank the best moments…`);
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
        for (let k = 0; k < pool.length; k += size) {
          if (Date.now() - started > budget) { warning = `${PROVIDER_NAMES[cfg.llmProvider]} took a while, so the rest were picked locally.`; break; }
          const part = pool.slice(k, k + size);
          ctx.progress(40 + Math.round((50 * k) / pool.length), `${PROVIDER_NAMES[cfg.llmProvider]} is reading moments ${k + 1}-${k + part.length} of ${pool.length}…`);
          const signal = ctx.signal ? AbortSignal.any([ctx.signal, AbortSignal.timeout(150_000)]) : AbortSignal.timeout(150_000);
          try { scored.push(...await rerank(cfg, part, { title: project.title, count: part.length, signal })); } catch (e) {
            if (ctx.signal?.aborted) throw new Error('Cancelled');
            if (isUsageError(e)) throw e;
            // One slow or confused batch: keep going with the rest.
          }
        }
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

  await updateProject(id, (p) => {
    const keep = replace ? p.clips.filter((c) => c.status !== 'proposed') : p.clips;
    const overlaps = (a, b) => !(a.end <= b.start || a.start >= b.end);
    p.clips = [...keep, ...clips.filter((c) => !keep.some((k) => overlaps(k, c)))];
    p.proposalMethod = method;
  });
  ctx.progress(100, `${clips.length} clips proposed (${method === 'heuristic' ? 'offline scoring' : method})`);
  return { count: clips.length, method, warning };
}
