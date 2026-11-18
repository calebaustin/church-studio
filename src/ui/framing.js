// Camera math for the preview, mirroring scripts/render_clip.py (ease_in_out, cue_path) so the
// live preview frames the speaker exactly like the export.

export const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));

/** Linear interpolation into a track sampled at `fps` (smooth, no 6 fps stepping). */
export function sampleTrack(arr, fps, t) {
  if (!arr?.length) return 0.5;
  const f = Math.max(0, Math.min(arr.length - 1, t * fps));
  const i = Math.floor(f);
  const j = Math.min(arr.length - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * (f - i);
}

/** Position from manual cues at time t (clip-relative seconds). */
export function cueX(cues, t, fallback = 0.5) {
  const list = [...(cues || [])].filter((c) => c.x != null).sort((a, b) => a.t - b.t);
  if (!list.length) return fallback;
  let cur = list[0].x;
  for (const c of list.slice(1)) {
    if (t < c.t) break;
    if (c.move === 'glide') {
      const d = Math.max(0.1, c.dur ?? 1.5);
      const u = (t - c.t) / d;
      if (u < 1) return cur + (c.x - cur) * easeInOut(u);
    }
    cur = c.x;
  }
  return cur;
}

export const clampX = (x, frac) => Math.min(1 - frac / 2, Math.max(frac / 2, x));
