// Studio looks: quick lighting passes for clips. The export applies them exactly (LOOKS in
// scripts/render_clip.py); the editor's preview shows them with close CSS filters.
export const LOOKS = [
  ['none', 'Original'],
  ['clean', 'Clean'],
  ['warm', 'Warm'],
  ['cool', 'Cool'],
  ['bright', 'Bright'],
  ['punchy', 'Punchy'],
  ['film', 'Film'],
  ['soft', 'Soft'],
  ['mono', 'Black and white'],
];

const CSS = {
  none: { b: 1, c: 1, s: 1, sepia: 0, hue: 0 },
  clean: { b: 1, c: 1.06, s: 1.06, sepia: 0, hue: 0 },
  warm: { b: 1.01, c: 1.04, s: 1.08, sepia: 0.16, hue: -4 },
  cool: { b: 1, c: 1.04, s: 1, sepia: 0, hue: 8 },
  bright: { b: 1.1, c: 0.98, s: 1, sepia: 0, hue: 0 },
  punchy: { b: 1, c: 1.16, s: 1.18, sepia: 0, hue: 0 },
  film: { b: 1.04, c: 0.9, s: 0.88, sepia: 0.12, hue: 0 },
  soft: { b: 1.04, c: 0.9, s: 0.94, sepia: 0, hue: 0 },
  mono: { b: 1, c: 1.1, s: 0, sepia: 0, hue: 0 },
};

/** A CSS filter that looks close to the export for this look. */
export function lookFilter(look) {
  if (!look) return undefined;
  const p = CSS[look.preset || 'none'] || CSS.none;
  const k = look.strength ?? 1;
  const mix = (v, id) => 1 + (v - id) * k;
  const light = look.light || 0;
  const f = `brightness(${(mix(p.b, 1) + light * 0.16).toFixed(3)}) contrast(${(mix(p.c, 1) - light * 0.08).toFixed(3)}) saturate(${mix(p.s, 1).toFixed(3)}) sepia(${(p.sepia * k).toFixed(3)}) hue-rotate(${(p.hue * k).toFixed(1)}deg)`;
  return f === 'brightness(1.000) contrast(1.000) saturate(1.000) sepia(0.000) hue-rotate(0.0deg)' ? undefined : f;
}

export const hasLook = (look) => Boolean(look && ((look.preset && look.preset !== 'none') || look.light > 0 || look.blur > 0));
