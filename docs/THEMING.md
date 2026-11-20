# Theming: light, liquid glass, customizable

## Look and feel
- Light by default, with a full dark mode. Soft shadows, generous radius.
- The standard palette is **Olive** (light) and **Olive Night** (dark): a warm off-white leaning olive, leaf
  green `#4A7C59`, and a clay accent `#C08A4E`. Natural and calm.
- The background is one still color with a faint frosted grain and a soft light from the top. No moving
  color blobs. Panels sit on it as mostly solid cards (glass blur stays for menus and pop-ups over content).
- Motion is subtle and respects `prefers-reduced-motion`.

## Tokens
All colors come from CSS variables in `src/ui/styles.css`: `--bg`, `--ink`, `--accent`, `--accent-2`,
`--glass-rgb`, `--radius`, `--glass-blur`, `--glass-tint`, `--font-sans`, `--font-display`, plus derived
tokens (`--text`, `--muted`, `--line`, `--surface`, `--tone-1` to `--tone-6`, and so on). Never hard-code colors
in components; icons, tiles and badges use the tone tokens so they follow the user's theme.

## Two kinds of theme
1. **App themes** change the app's look. Several are built in; users can make their own.
2. **Caption themes** style the captions and hook burned into clips. Users can save many and pick one per clip.
