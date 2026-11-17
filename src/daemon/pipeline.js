// Clip proposal orchestration: heuristic first (always), optional AI re-rank on top.
import { getProject, getTranscript, updateProject } from './projects.js';
import { loadConfig } from './config.js';
import { proposeHeuristic } from './clips.js';
import { providerReady, rerank } from './ai.js';

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
  const useAI = providerReady(cfg);
  // Ask the heuristic for extra candidates when an AI will choose among them.
  const heur = proposeHeuristic(transcript.words, { start: range.start, end: range.end, count: useAI ? count * 3 : count, min, max, prompt });
  let clips = heur.slice(0, count);
  let method = 'heuristic';
  let warning = null;

  if (useAI && heur.length) {
    ctx.progress(40, `Asking ${cfg.llmProvider} to rank the best moments…`);
    try {
      const words = transcript.words;
      const cands = heur.map((c) => ({
        ...c,
        text: words.filter((w) => w.start >= c.start && w.end <= c.end).map((w) => w.w).join(' '),
      }));
      const ranked = await rerank(cfg, cands, { title: project.title, count });
      if (ranked.length) { clips = ranked; method = cfg.llmProvider; } else warning = 'The AI returned no clips; kept the offline picks.';
    } catch (e) {
      warning = `AI ranking failed (${e.message.slice(0, 160)}); kept the offline picks.`;
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
