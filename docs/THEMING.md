# Theming — light, liquid glass, customizable

## Look & feel
- Light base. White/near-white surfaces, soft shadows, generous radius.
- Liquid-glass panels via `@ybouane/liquidglass` (WebGL refraction/blur) for cards, sidebars,
  modals. Keep `blurAmount` low (0.1-0.25) and tint low so it stays light, not dark.
- Typography: system UI + one accent font; themeable.
- Motion: subtle; respect `prefers-reduced-motion`.

## Theme tokens
CSS variables for: `--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--accent-2`,
`--glass-blur`, `--radius`, `--shadow`, `--font-sans`, `--font-display`.

## Customization
- Theme editor: pick colors, fonts, radius, glass strength; live preview.
- Save as named theme in `data/themes.json`; apply per clip as part of a "look" (VGP CL12).

## Themes: app vs video (settings page)
Settings page has two sections:
1. **App theme** — the UI look (light/dark/glass strength, accent colors, fonts, radius).
   Save as a named app theme; one active at a time. Default "Sermon Light".
2. **Video themes** — caption/look presets used when burning captions (font, size, color,
   outline, position, highlight color, caption words-at-a-time). Save many; apply per clip
   or per project. Mirrors VGP "looks" but supports multiple saved themes.
Automatic theme import from a URL is deferred (revisit later); v1 ships manual editing plus
a small set of built-in themes.

## Import theme from a URL (deferred)
User pastes a URL; app fetches the page, extracts:
- CSS custom properties (`--*`) and computed styles for body/headings.
- Dominant colors (cluster hex values).
- Font families referenced.
Present as a candidate theme; user confirms/edits before saving.
Implementation: fetch HTML + linked CSS (cheerio + css parser) OR Playwright for computed
styles. Prefer cheerio first; fall back to Playwright for JS-rendered sites.

## VGP clips contrast
VGP is dark and generic AI. Here: light, glassy, themeable. Reuse VGP's data model for
looks/fonts, swap the visual layer.