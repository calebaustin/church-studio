// What kinds of clips this church tends to keep. Learned from every clip kept, exported or skipped, so new picks
// that look like the ones they usually keep get a star. It never changes a clip's score.
import { getProject, listProjects } from './projects.js';

const lenBucket = (c) => { const d = c.end - c.start; return d < 35 ? 'short' : d < 50 ? 'medium' : d < 65 ? 'long' : 'extra-long'; };
/** The traits we compare: its kind, its length, and what the offline scoring noticed about it. */
export function traits(c) {
  const out = [`kind:${c.category || 'Key point'}`, `len:${lenBucket(c)}`];
  for (const r of c.reasons || []) if (r.length < 40 && !r.startsWith('Lands on')) out.push(`why:${r}`);
  return out;
}

/** Keep and skip counts per trait, across all projects. */
export async function tasteProfile() {
  const counts = new Map(); let kept = 0; let total = 0;
  for (const p of await listProjects()) {
    const full = await getProject(p.id).catch(() => null);
    for (const c of full?.clips || []) {
      const keep = c.status === 'kept' || c.status === 'exported' || Boolean(c.export);
      const skip = c.status === 'skipped';
      if (!keep && !skip) continue;
      total++; if (keep) kept++;
      for (const t of traits(c)) { const v = counts.get(t) || { keep: 0, n: 0 }; v.n++; if (keep) v.keep++; counts.set(t, v); }
    }
  }
  return { counts, kept, total, base: total ? kept / total : 0 };
}

/**
 * Mark the clips that look like the ones usually kept (`taste: true`), with the trait that stands out most.
 * Needs at least 8 decisions so a handful of choices don't decide it.
 */
export function markTaste(clips, profile) {
  if (!profile || profile.total < 8 || profile.kept < 3) return clips;
  return clips.map((c) => {
    let lift = 0; let n = 0; let best = null;
    for (const t of traits(c)) {
      const v = profile.counts.get(t); if (!v || v.n < 3) continue;
      const rate = (v.keep + 1) / (v.n + 2); // a little smoothing so one choice can't swing it
      const d = rate - profile.base; lift += d; n++;
      if (!best || d > best.d) best = { t, d };
    }
    const avg = n ? lift / n : 0;
    return avg > 0.12 && best?.d > 0.15 ? { ...c, taste: true, tasteWhy: best.t.replace(/^(kind|len|why):/, '') } : { ...c, taste: false };
  });
}
