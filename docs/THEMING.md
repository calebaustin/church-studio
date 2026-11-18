# Theming: light, liquid glass, customizable

## Look and feel
- Light by default, with a full dark mode. Soft shadows, generous radius.
- Glass panels are CSS (backdrop blur and saturation) with an optional refraction filter.
- Motion is subtle and respects `prefers-reduced-motion`.

## Tokens
All colors come from CSS variables in `src/ui/styles.css`: `--bg`, `--ink`, `--accent`, `--accent-2`,
`--glass-rgb`, `--radius`, `--glass-blur`, `--glass-tint`, `--font-sans`, `--font-display`, plus derived
tokens (`--text`, `--muted`, `--line`, `--surface`, `--tone-1` to `--tone-6`, and so on). Never hard-code colors
in components; icons, tiles and badges use the tone tokens so they follow the user's theme.

## Two kinds of theme
1. **App themes** change the app's look. Several are built in; users can make their own.
2. **Caption themes** style the captions and hook burned into clips. Users can save many and pick one per clip.
