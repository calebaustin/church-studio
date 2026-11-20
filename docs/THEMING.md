# Theming: light, liquid glass, customizable

## Look and feel
- Light by default, with a full dark mode. Soft shadows, generous radius.
- The standard palette is **Olive** (light) and **Olive Night** (dark): a warm off-white leaning olive, leaf
  green `#4A7C59`, and a clay accent `#C08A4E`. Natural and calm.
- The background is one still color with a faint frosted grain and a soft light from the top. No moving
  color blobs. Panels sit on it as mostly solid cards (glass blur stays for menus and pop-ups over content).
- **Night** is the true dark option: neutral grays with no tint.
- Every color in the stylesheet goes through a token. Fixed colors (white, shadows, the video stage, the
  checkerboard, snapping guides) are named once at the top of `styles.css`; rules use `var(--…)` or
  `rgba(var(--shade-rgb), a)` / `rgba(var(--sheen-rgb), a)`. The only literal colors left are the hue strip
  in the color picker. Colors that end up in videos and designs (caption styles, template palettes) are data,
  not theme.

## Motion
- Springs live as CSS tokens (`--spring-snappy`, `--spring-bouncy`, `--spring-soft`, `--spring-glide`, each
  with a `--d-*` duration), sampled from real spring physics (Fluid, MIT). Use them instead of plain ease.
- Press: scale down fast (90ms), release on the bouncy spring. Hover lifts stay small.
- The chosen item in `.seg`, `.tabs` and `.side-nav` gets one gliding highlight, placed by `src/ui/motion.js`.
  Keep the chosen child's class as `on` and a direct child of the row, and it works on its own.
- Animate only `transform`, `translate`, `scale` and `opacity`. Nothing loops; idle stays near 0% CPU.
- `prefers-reduced-motion` turns animations off.
- Motion is subtle and respects `prefers-reduced-motion`.

## Tokens
All colors come from CSS variables in `src/ui/styles.css`: `--bg`, `--ink`, `--accent`, `--accent-2`,
`--glass-rgb`, `--radius`, `--glass-blur`, `--glass-tint`, `--font-sans`, `--font-display`, plus derived
tokens (`--text`, `--muted`, `--line`, `--surface`, `--tone-1` to `--tone-6`, and so on). Never hard-code colors
in components; icons, tiles and badges use the tone tokens so they follow the user's theme.

## Two kinds of theme
1. **App themes** change the app's look. Several are built in; users can make their own.
2. **Caption themes** style the captions and hook burned into clips. Users can save many and pick one per clip.
