# UI/UX Guide for Modern Apps

*Written Nov 17, 2026 from the Minister To Minister theme (v2.11.0) and its docs. It takes what M to M has proven and turns it into a guide you can hand to a person or an AI for a new app.*

**How to use this:** copy this file into the new app's repo (for example `docs/ui-ux-guide.md`) and point its CLAUDE.md at it. Section 1 says what to change for the new app. Everything after that applies as written unless the new app has a real reason to differ. Where a rule came from a real M to M mistake, it says so, because those are the rules most worth keeping.

---

## 1. Fill these in for the new app

Change these first. Everything else is built on them.

| Item | M to M value | Church Studio |
|---|---|---|
| App name and how it's written | "Minister To Minister" in full first, "M to M" after; lowercase in browser tabs and emails | "Church Studio" everywhere |
| Who it's for | Tired ministers who've been marketed to too much | Church media volunteers and pastors with a few minutes a week |
| One-sentence promise | "You have something to share. Share it here, minister to minister." | "Pick a service. Get captioned vertical clips of the best moments." |
| Primary color | Violet `#5b3df5` | Per theme: `--accent` (Olive `#4A7C59`) |
| Accent color | Gold `#ffb21e` | Per theme: `--accent-2` (Olive `#C08A4E`) |
| Ink (dark text and dark panels) | `#16132b` | `--ink` (Olive `#20251D`) |
| Background / surface | `#ffffff` / `#f6f4ff` (faint lavender) | `--bg` / glass from `--glass-rgb` |
| Heading font / body font | Space Grotesk / Inter | Avenir Next / SF Pro (system) |
| Corner radius / base text size | 16px / 17px | 20px / 15px (desktop app) |
| Code prefix for classes and tokens | `mpm-` | none (tokens are `--bg`, `--ink`, …; see `src/ui/styles.css`) |
| Words that must never be used | "organization," "customer base," "content" (say church, ministry, resources) | "content," "leverage," "AI-powered"; no em dashes in UI copy |

**Church Studio notes:** this is a desktop app (Electron), so phone-first rules apply to the window at its minimum
width (1080px) rather than 390px. Themes set only base tokens; everything else is derived in `src/ui/styles.css`,
and dark themes set `mode: 'dark'`.

The rest of this guide writes tokens as `--app-…` and classes as `.app-…`. Swap in the new prefix.

---

## 2. Principles

These are the ideas behind every decision below. When a rule doesn't cover a case, fall back to these.

1. **Plain and warm beats clever.** The interface should read like a helpful friend wrote it. No hype, no jargon, no dark patterns.
2. **Phone first, for real.** Most people arrive from a shared link on a phone. Design the 390px screen first, then let it grow. Primary actions live in thumb reach.
3. **One system, no exceptions.** Every button hovers the same way. Every card has the same corner. Every color comes from a token. Plugins and third-party widgets get pulled into the system, not left looking different.
4. **Nothing disappears on interaction.** A button never loses its fill or text on hover. A layout never jumps when content loads. A tap always shows a response.
5. **Calm motion with a purpose.** Motion tells you what happened (it saved, it opened, it's loading). It's quick, it can be interrupted, and it switches off for people who ask for reduced motion.
6. **Own art, not stock.** Illustrations are built from the app's own shapes in its own colors. Generic "AI-looking" art was rejected on M to M and shouldn't come back.
7. **Never leave people stuck.** Every empty screen, error and dead end offers a next step.
8. **Respect people's time and money.** Don't add steps, gates or requirements the person doesn't need. (On M to M: anyone can buy, guest checkout included; nobody needs a church card or a treasurer.)

---

## 3. Voice and copy

### Tone
Write like one person talking to another over coffee: warm, plain, honest, a little encouraging, never salesy. Short sentences are fine. Hype and jargon aren't.

- Use flowing prose for welcome screens, onboarding and emails. Bullets are fine for UI, checklists and settings.
- Say what will happen, in the person's words: "Save for later," not "Add to wishlist collection."
- Name things the way your users already name them. On M to M that meant "resources" for products and "your shop" for a vendor's store.
- If the app touches faith content, **always capitalize pronouns for God or Jesus** (He, Him, His, the One), including placeholder and sample text.

### Microcopy patterns

| Moment | Do | Avoid |
|---|---|---|
| Primary button | Verb + object: "Start selling," "Save changes," "Send message" | "Submit," "OK," "Click here" |
| Empty state | What this space is for + one action: "Nothing saved yet. Tap the bookmark on anything you like and it'll wait here." | "No items found." |
| Error | What happened + how to fix it, no blame: "That email doesn't look right. Check for a typo?" | "Invalid input." |
| Login error | One generic message for wrong email or password (it's also safer) | Saying which one was wrong |
| Waiting/pending | Say what's happening and what comes next: "Pending approval. We'll email you as soon as you're approved." | A bare spinner |
| Confirmation of a risky action | Name the thing and the consequence: "Delete 'Easter Series'? This can't be undone." | "Are you sure?" |
| Success | Short, then get out of the way (a toast) | A modal that must be dismissed |

### Editing existing copy
Keep the owner's wording and the page's existing format unless asked to rewrite. Fix what was asked, flag anything else, and let the owner decide. (A rewrite that didn't match the "How It Works" format was rejected on M to M.)

---

## 4. Design tokens

All color, type, spacing, radius, shadow and motion values come from tokens. Components read only tokens, never raw hex values. This is what let M to M try six full palettes from one settings panel without touching a component.

### 4.1 Color: six base colors

```css
:root {
  --app-primary:    #5b3df5; /* main actions, links, selected states */
  --app-accent:     #ffb21e; /* highlights, focus rings, offset shadows, badges */
  --app-ink:        #16132b; /* headings and darkest text */
  --app-bg:         #ffffff; /* page background */
  --app-surface:    #f6f4ff; /* cards, inputs, panels */
  --app-dark:       #16132b; /* dark bands, toasts, footer */

  --app-on-primary: #ffffff; /* text on primary */
  --app-on-accent:  #111111; /* text on accent (gold needs dark text) */
  --app-on-dark:    #ffffff; /* text on dark */
}
```

### 4.2 Color: derived (never set by hand)
Everything else is mixed from the base six, so changing a base color updates the whole app.

```css
:root {
  --app-text:          color-mix(in srgb, var(--app-ink) 84%, var(--app-bg));
  --app-muted:         color-mix(in srgb, var(--app-ink) 60%, var(--app-bg));
  --app-border:        color-mix(in srgb, var(--app-ink) 13%, var(--app-bg));
  --app-primary-hover: color-mix(in srgb, var(--app-primary) 80%, var(--app-ink));
  --app-primary-soft:  color-mix(in srgb, var(--app-primary) 11%, var(--app-surface));
  --app-accent-soft:   color-mix(in srgb, var(--app-accent) 16%, var(--app-surface));
  --app-alt:           color-mix(in srgb, var(--app-primary) 5%, var(--app-bg)); /* alternate section bands */
  --app-on-dark-muted: color-mix(in srgb, var(--app-on-dark) 70%, var(--app-dark));
}
```

**Status colors** (keep them few, and pair each with an icon and words, never color alone):

| Role | Fill | Border/icon | Text |
|---|---|---|---|
| Danger | `#f9d6d1` | `#c0392b` | `#8f2318` |
| Success | primary-soft or a green tint | primary or green | ink |
| Warning / attention | accent-soft | accent | ink |

**Color rules**
- Primary is for action. If everything is violet, nothing stands out. One primary button per view.
- Accent is for emphasis: a badge, a focus ring, an offset shadow, a key number. Not for body text on white (it fails contrast).
- Body text uses `--app-text`, not pure ink, so it's easier on the eyes. Headings use ink.
- **Keep art colors and UI colors the same.** M to M ended up with two golds (`#ffb21e` in CSS, `#F0B144` in art) and two inks (`#16132b` vs `#17152B`). Pick one of each on day one and use it everywhere.
- Every text/background pair must pass WCAG AA (4.5:1 for body text, 3:1 for large text and icons).

**Dark mode:** redefine the six base colors under `@media (prefers-color-scheme: dark)` (and a manual `[data-theme="dark"]` override); the derived tokens follow on their own. Dark bg ≈ ink, surface a step lighter, primary lightened until it passes on the dark bg, accent unchanged.

### 4.3 Typography

```css
:root {
  --app-font-heading: "Space Grotesk", system-ui, sans-serif;
  --app-font-body:    "Inter", system-ui, sans-serif;
  --app-base-size:    17px;
}
html { font-size: var(--app-base-size); }
body { font-family: var(--app-font-body); line-height: 1.65; color: var(--app-text); }
h1, h2, h3, h4 { font-family: var(--app-font-heading); color: var(--app-ink); letter-spacing: -0.01em; }
```

Use fluid sizes so type scales smoothly between phone and desktop:

| Role | Size | Notes |
|---|---|---|
| Hero / display | `clamp(2.3rem, 5vw, 3.9rem)` | line-height ~1.05, letter-spacing -0.02em, max-width ~20ch |
| Page title (h1) | `clamp(2.1rem, 4.6vw, 3.4rem)` | line-height ~1.06 |
| Section title (h2) | `clamp(1.6rem, 2.6vw, 2.25rem)` | line-height ~1.15 |
| Card / panel title (h3) | `clamp(1.15rem, 1rem + .6vw, 1.4rem)` | |
| Lead paragraph | 1.1–1.15rem | max-width ~52–62ch |
| Body | 1rem (17px) | line-height 1.65 |
| Small / meta | 0.85–0.9rem | muted color |
| Eyebrow | 0.78rem, 700, uppercase, letter-spacing 0.12em, primary color | the small label above a title; accent color on dark backgrounds |
| Numbers that change | `font-variant-numeric: tabular-nums` | prices, counters, totals |

Keep reading lines between 50 and 75 characters. Base size stays at least 16px so phones don't zoom into inputs.

### 4.4 Spacing and layout

- **Base unit:** 4px. Common steps: 4, 8, 12, 16, 20, 24, 32, 48, 64, 88.
- **Section padding:** `clamp(48px, 7vw, 88px)` top and bottom. Tighter sections: 28–40px.
- **Gaps between big columns:** `clamp(28px, 5vw, 64px)`.
- **Content width:** about 1120–1200px for pages; ~62ch for reading text.
- **Side gutter on phones:** at least 16px, and use `env(safe-area-inset-*)` so nothing hides under a notch or home bar.
- **Grids that adapt on their own:** `grid-template-columns: repeat(auto-fill, minmax(220–250px, 1fr))`. Always use `minmax(0, 1fr)` for columns that hold text, so long words can't blow out the layout.

### 4.5 Radius

```css
:root {
  --app-radius:      16px;                          /* cards, panels, modals */
  --app-radius-sm:   calc(var(--app-radius) * 0.6); /* inputs, small media, notices (~10px) */
  --app-radius-pill: 999px;                         /* buttons, chips, search fields, segmented controls */
}
```

Pills for anything you tap; rounded rectangles for anything that holds content.

### 4.6 Shadow and depth

```css
:root {
  --app-shadow:    0 1px 2px color-mix(in srgb, var(--app-ink) 8%, transparent),
                   0 8px 24px -12px color-mix(in srgb, var(--app-ink) 22%, transparent);
  --app-shadow-lg: 0 2px 4px color-mix(in srgb, var(--app-ink) 6%, transparent),
                   0 24px 48px -20px color-mix(in srgb, var(--app-ink) 35%, transparent);
}
```

- Cards rest flat with a 1px border and pick up `--app-shadow` on hover.
- Floating things (menus, popovers, toasts, command palette) use `--app-shadow-lg`.
- **Signature move: the gold offset shadow.** A hard, unblurred shadow in the accent color (`box-shadow: 12px 14px 0 var(--app-accent)`) behind a thick ink outline. Use it for illustrations and one hero element per screen at most. It's the app's personality; overuse makes it noise.

### 4.7 Motion tokens

```css
:root {
  --app-fast:     160ms;                         /* hovers, presses, small toggles */
  --app-med:      260ms;                         /* menus, toasts, panels opening */
  --app-ease-out: cubic-bezier(.2, .8, .2, 1);   /* things arriving */
  --app-ease-in:  cubic-bezier(.5, 0, .75, 0);   /* things leaving */
}
```

Entrance reveals on scroll use 0.7–0.8s with `cubic-bezier(.2, .7, .2, 1)` and can stagger with a small delay per item. See section 8.

---

## 5. Layout and navigation

### Breakpoints

| Name | Width | What changes |
|---|---|---|
| Small phone | ≤ 380px | Logo shrinks (24px tall), tightest spacing |
| Phone | ≤ 767px | Bottom tab bar appears, single column, back-to-top hidden |
| Tablet | 768–1023px | Header collapses to logo + menu button; two-column grids |
| Small desktop | 1024–1199px | Full menu on one row (no wrapping), long labels shortened or hidden |
| Desktop | ≥ 1200px | Full layout |

Test at **390px** and **1280px** at minimum, plus 768px and 1024px for anything with a header or a grid.

### Header
- Sticky on scroll, surface background, 1px bottom border.
- Logo on the left keeps a minimum width (M to M's logo was once squeezed to zero on every phone; give it `min-width` and let the menu area be only as wide as its button).
- At ≤ 1023px the menu collapses behind a button; the opened menu drops down full-width with `--app-shadow-lg` and the `--app-med` drop-in.
- Account menu: "Log in" when signed out; an avatar or name with a dropdown when signed in.

### Mobile tab bar (≤ 767px)
The most-used actions live in a bottom bar, in thumb reach.

- Up to 5 items, each an icon over a short label (0.7rem, 600 weight). Never icon-only.
- Each item at least 52px tall. The current one gets `aria-current="page"` and the primary color; the rest are muted.
- Translucent surface (`surface` at 94% with `backdrop-filter: blur(10px)`), 1px top border, padded by the safe-area insets.
- Add bottom padding to `body` equal to the bar's height plus the safe area, and lift anything else fixed to the bottom (toasts, floating cart, chat bubble) above it.
- Hide it on full-screen flows (onboarding, checkout, a coming-soon page).

### Role bar
If some users have a second role (M to M's vendors), give them a slim, colored bar under the header with their few role-specific links and status ("Pending approval"). On phones, fold it into one button with a dropdown. **Watch for text overflowing this bar**; it happened on M to M.

### Page anatomy
Most pages follow the same order: eyebrow → title → lead paragraph → primary action(s) → content sections that alternate between `bg` and `alt` bands → one dark call-to-action band near the end → footer. Similar pages should share a format; pick one well-made page as the model and match it.

---

## 6. Components

Each component lists its states. Build all states, not just the resting one.

### 6.1 Buttons

**Base:** inline-flex, centered, 8px gap for an icon, body font at 0.95rem / 600, line-height 1.2, padding `11px 20px` (large: `14px 24px`, 1rem), 1.5px border, pill radius, no uppercase.

**Families** (use `.app-btn` plus exactly one):

| Family | Resting | Hover / focus |
|---|---|---|
| `--primary` | primary fill, white text | `--app-primary-hover` fill |
| `--accent` | gold fill, dark text | gold mixed 15% toward ink |
| `--outline` | transparent, primary border and text | primary fill, white text |
| `--ghost` | transparent, ink text, border color | primary-soft fill, primary border |
| `--on-dark` | transparent, white text, faint white border | 10% white fill, solid white border |
| `--icon` | 40×40 square-ish, primary-soft fill, primary icon | primary fill, white icon |
| danger | pale red fill, red text | deeper red tint, red border |

**One hover system for every button**, yours and any third-party widget's:
- Hover: lift 1px (`translateY(-1px)`) and pick up a soft shadow (`0 10px 20px -14px` ink at ~55%).
- Press: settle back (`translateY(0) scale(.98)`), shadow off.
- Focus (keyboard): 3px accent outline, 2px offset.
- Transition: colors at 150ms, shadow at 200ms, transform at 150ms.
- Reduced motion: no transform; colors still change.
- **The fill and text never disappear on hover.** On M to M, violet buttons went blank and white buttons didn't react at all. Both are now forbidden. A white/ghost button must visibly change.

**Rules**
- One primary button per view. Secondary actions are outline or ghost.
- Buttons wrap their text and stay centered rather than cutting text off. No fixed widths on labels.
- Don't make them oversized (a past M to M bug). The large size is for heroes only.
- On touch screens every button is at least 44px tall.
- Disabled: 50% opacity, `cursor: not-allowed`, no hover. Prefer explaining why it's disabled next to it.
- Loading: keep the button's size, swap the label for a spinner plus "Saving…", and block double taps.
- Keep a small automated check that lists any button whose hover loses its fill, hides its text, or does nothing. Run it after any button or color change.

### 6.2 Links
Primary color, hover to primary-hover. Inline text links are underlined (offset 3px). Standalone "see all" links are 600 weight with a trailing arrow that slides 3px right on hover. Menu links get an underline that grows from 0 to full width on hover and stays on the current page.

### 6.3 Inputs and forms
- Inputs: surface background, 1px border, small radius, at least 44–48px tall, padding ~10–14px, 16px+ text.
- Focus: primary border plus a 2px outline in primary at 30% (1px offset). Never remove focus styling without a replacement.
- Labels sit above the field (600 weight, 0.88rem, ink). Never placeholder-as-label.
- Help text under the field in muted 0.85–0.9rem. Errors replace help text, in danger text with an icon, and say how to fix it.
- Validate on blur or submit, not on every keystroke. Keep what the person typed when there's an error.
- Search fields and selects in toolbars use the pill shape with a leading icon.
- Ask only for what you need. (M to M's checkout dropped street address, apartment, city and company because downloads don't ship.)
- Required legal checkboxes (agreements, "I have the right to sell this") are unticked by default, store who agreed and when, and say plainly what they mean.

### 6.4 Chips and segmented controls
- **Chips:** pill, 4–6px × 12–14px padding, 0.8–0.88rem / 600, primary-soft fill, ink text. Hover keeps the fill and adds a 1px inset primary ring. Selected: solid primary fill, white text. In a scrolling row they don't shrink (`flex: none`) and the scrollbar is hidden.
- **Segmented control** (e.g. New / Popular): a pill track in `alt` with a 1px border and 3px padding; buttons are transparent and muted; the selected one turns surface-colored with a tiny shadow and ink text.

### 6.5 Cards
- Surface background, 1px border, `--app-radius`, overflow hidden.
- Hover: lift 2px and gain `--app-shadow`; any image inside zooms gently (scale 1.03–1.045 over 0.6s) within its frame.
- Make the whole card clickable by stretching the title link over it (`a::after { content: ""; position: absolute; inset: 0; }`), and keep any inner buttons above that layer.
- Media at a fixed aspect ratio (covers 5:2, products 4:3 or 1:1) so grids don't jump while images load.
- Watch masonry or uneven grids for gaps; M to M had tile-layout bugs. Prefer a regular grid unless masonry is the point.

### 6.6 Notices and banners
Flex row, icon then text, 10px gap, 12–14px padding, small radius, 0.9rem. Tinted by status (primary-soft for info, accent-soft for attention, pale red for errors). A notice that blocks progress says what to do next.

### 6.7 Toasts
For quick confirmations ("Saved," "Removed — Undo").
- Bottom-center, max width `min(92vw, 420px)`, stacked with 8px gaps, above the tab bar on phones.
- Ink background, white text, 14px radius, `--app-shadow-lg`.
- An optional single action button in accent (at least 40px tall), usually "Undo."
- Enter: fade up 10px over `--app-med` with ease-out. Leave: fade down 8px over `--app-fast` with ease-in.
- Auto-dismiss after ~4–6 seconds, pause on hover, and announce in an `aria-live="polite"` region.

### 6.8 Modals, sheets and the command palette
- **Scrim:** ink at 45% with a 3px blur, fading in over `--app-fast`.
- **Modal panel:** surface, 18px radius, `--app-shadow-lg`, width `min(640px, calc(100vw - 32px))`, dropping in over `--app-med`.
- On phones prefer a **bottom sheet** to a centered modal.
- Lock page scroll while open, trap focus inside, close on Escape and on scrim tap, and return focus to what opened it.
- **Command palette / quick search** (Cmd+K or Ctrl+K): a modal with one large input, results below, keyboard hints shown as small `kbd` chips. Good for any app with lots of things to find.

### 6.9 Search
- Suggestions appear as you type (after ~2 characters, debounced ~150–250ms).
- While waiting, show 44px skeleton rows with a shimmer, not a spinner.
- Show popular searches when the field is empty, and "Did you mean…" for near misses.
- A "See all results" row at the end. An empty result says so kindly and suggests something to try.

### 6.10 Loading
- **Skeletons** shaped like the real content, in `alt` with a moving highlight (`linear-gradient` at 200% width, 1.1s linear loop).
- Reserve space for anything that loads late (images, embeds) so the page doesn't jump.
- Spinners only inside buttons or very small areas.

### 6.11 Empty states
Centered, ~40px vertical padding, a large icon (2.6rem, primary) or a small illustration, one line saying what goes here, and one button to get started. Never a blank area.

### 6.12 Progress checklists
For onboarding ("Getting started"):
- A card with an eyebrow, a title, and a thin progress meter (10px tall, pill, primary on primary-soft, width animating over 0.6s).
- Each step: a round check (28px), a bold label, one line of help, and a "Go" button on the right (it drops under the text on phones).
- Done steps fill the check with primary, mute and strike through the label, and keep the row so progress is visible.
- The whole checklist hides itself once everything is done.

### 6.13 Avatars and profile headers
A cover banner (`clamp(150px, 22vw, 260px)` tall) with the avatar overlapping its bottom edge, white ring around the avatar. Never show internal usernames publicly; show the display name and role.

### 6.14 Icons
One icon set only (M to M uses Bootstrap Icons). Icons sit at the text's size or 1.3rem in the tab bar, inherit the text color, and always come with a visible label or an `aria-label`.

---

## 7. Illustration and imagery

The art is what makes the app feel like itself. It is built, not generated.

**The "sticker card" style**
- A white card with a **4px ink outline**, a large radius (~26px), tilted about 3°, sitting on a **hard gold offset shadow** (`12px 14px 0` accent).
- An optional top "window bar" in primary-soft with three small ink dots and a short label.
- Inside: big simple shapes in brand colors (a gold circle "sun," a primary icon, small round "floats" with a letter or icon, a tilted ink "sign" with a word or two). Every shape gets the same 4px ink outline.
- Aspect ratio 5:4 or 4:3, max width ~420px (smaller on phones, and placed above the text there).
- With reduced motion, the tilt stays still (no wobble animation).

**Patterns and covers** are made from the app's own UI shapes: pills, arches, offset shadows, dots, in brand colors. That's how M to M's 48 shop covers were made after generic art was rejected.

**Rules**
- No stock photos of smiling people, no generic gradients-with-blobs, no "AI-looking" art.
- Never redraw existing art without being asked.
- Use one gold and one ink in art and CSS (see 4.2).
- Every meaningful image has alt text that says what it shows; decorative art gets `alt=""`.
- Social share images are 1200×630 and use the same style.

---

## 8. Motion

**When to animate:** to show something arrived, changed, or is waiting. **When not to:** keyboard-driven actions, things people do dozens of times a minute, and anything that slows them down.

| What | How |
|---|---|
| Button hover / press | 1px lift, then `scale(.98)` on press. 150ms. |
| Card hover | 2px lift, shadow, image zoom 1.03–1.045 over 0.6s |
| Icons inside cards | nudge up 2px and rotate −6° on hover, 250ms |
| Menu link | underline grows 0→100% over 250ms |
| Header on page load | drops in 8px, fades in, 0.6s, once |
| Content on scroll | fades in from 22px below, 0.7–0.8s, staggered a little per item; only when JS is on and reduced motion is off |
| Menus, dropdowns, palette | drop in over `--app-med`, ease-out |
| Toasts | in over `--app-med` ease-out; out over `--app-fast` ease-in |
| Progress meter | width over 0.6s ease-out |

**Rules**
- Animate only `transform` and `opacity` where you can (they stay smooth); avoid animating size, position or blur.
- Leaving is faster than arriving.
- Gate scroll reveals behind a class the script adds (e.g. `html.app-motion`), so content is visible if the script fails.
- `@media (prefers-reduced-motion: reduce)`: cut animations and transitions to almost nothing, remove hover zooms and lifts, keep color changes.

---

## 9. Accessibility (WCAG 2.1 AA as the floor)

- **Contrast:** 4.5:1 for body text, 3:1 for large text, icons and borders that carry meaning. Check hover and focus states too; M to M had hover-contrast bugs.
- **Keyboard:** everything works with Tab, Enter, Space and Escape, in a sensible order. Visible focus everywhere (3px accent outline on buttons).
- **Touch targets:** at least 44×44px on touch screens (`@media (pointer: coarse)`), 52px in the tab bar.
- **Labels:** every input has a real label; icon-only buttons have `aria-label`; the current nav item has `aria-current="page"`.
- **Never color alone:** status gets an icon and words.
- **Live regions:** toasts and inline save confirmations announce politely.
- **Zoom:** layout survives 200% zoom and 400% reflow at 320px wide without sideways scrolling.
- **Motion:** honor reduced motion everywhere (section 8).
- **Language:** plain words, short sentences. Good for everyone, essential for some.

---

## 10. Key flows

### First run and onboarding
- Let people look around before signing up when you can (M to M lets anyone browse and buy as a guest).
- Ask for the minimum at signup. Optional personalization ("pick up to 3 interests") comes right after, and is skippable.
- Give new users a "Getting started" checklist (6.12) instead of a tour that blocks the screen.
- Keep onboarding material somewhere they can come back to (M to M's Handbook).

### Approval or waiting states
If a person must wait on someone (approval, review): show the status where they'll see it (the role bar said "Pending approval"), send an email when it changes, and let them do useful things meanwhile.

### Soft-open / limited mode
When a feature isn't ready (M to M's "sales open" switch), don't show broken buttons. Replace the action with a clear, friendly alternative ("Opening soon — join the waitlist") and hide anything that would lead to a dead end.

### Search and browse
Multiple ways in (category, person, topic), live filtering without full reloads, a count of results, filter chips you can clear one at a time, and an empty state that suggests what to try.

### Saving and undo
Prefer undo over "Are you sure?" for anything reversible. Save happens instantly with a toast and an Undo button. Save only asks for confirmation when the action can't be undone or affects other people.

### Settings
Group into a few plain sections. Save changes automatically or with one clear "Save changes" button per section, never both. Show what each setting does in one line.

### Errors and dead ends
A friendly 404 with the sticker-card art, a search box, and two or three useful links. Server errors say something went wrong on our side, that their work is safe (if it is), and offer a retry.

---

## 11. Notifications and email

- Every email shares the app's look: header with logo, brand fonts with safe fallbacks, one primary button, a short branded footer. Build them from a small set of reusable blocks (button, cover image, panel, heading, product/item list) with **inline styles only**.
- Email buttons wrap and center rather than cutting text off.
- One email per event per person. Don't double-send (M to M turned off a plugin's duplicate vendor email).
- Show each person only what's theirs (buyers never see a seller's earnings).
- Any "you might also like" blocks are fair: varied, recent first, not one sender dominating.
- Test every email in a local mail catcher (e.g. Mailpit) at desktop and 390px before shipping.
- Push and in-app notifications follow the same voice: what happened, and one tap to see it.

---

## 12. Performance and polish

- Only load scripts and styles on screens that use them (M to M strips plugin files from pages that don't need them).
- Cache-bust assets with a version number, and bump it every release; a missed bump once caused a real "my change isn't showing" bug.
- Lazy-load images below the fold; give every image width and height or an aspect ratio.
- Mobile web polish: no tap-highlight flash, no sticky hover on touch, `100dvh` instead of `100vh`, 16px+ input text so iOS doesn't zoom, `theme-color` meta matched to the header, `overscroll-behavior` on scroll areas inside modals.
- Keep private things private by default: no public usernames, generic login errors, no internal pages in search results.

---

## 13. Lessons from M to M (don't repeat these)

| What went wrong | The rule now |
|---|---|
| Generic, AI-looking cover art | Art is built from the app's own shapes in brand colors |
| A page rewrite didn't match the established format | Match the model page; don't reformat uninvited |
| Violet buttons went blank on hover; white buttons didn't react | One hover system; fill and text never vanish; automated button check |
| Hover states failed contrast | Check contrast for hover and focus, not just resting |
| Oversized buttons | Standard sizes; large only for heroes |
| Masonry tile gaps | Prefer regular grids; test real content |
| Text ran out of room in the role bar | Test longest labels at 390px; let bars wrap or collapse |
| Logo squeezed to zero width on phones | Logo keeps a minimum width; menu area shrinks instead |
| Two golds and two inks between art and CSS | One value per color, shared by art and code |
| Stale CSS and images after an update | Version-based cache-busting, bumped every release |
| Users had to touch the admin back end | Everyone stays inside the app's own UI |

---

## 14. Ship checklist

Run this before calling any screen done.

- [ ] Looks right at 390px, 768px, 1024px and 1280px; no sideways scroll on phones
- [ ] Every color, font, radius and shadow comes from a token
- [ ] One primary action per view; every button hovers, presses and focuses per 6.1
- [ ] Button check passes (no lost fills, hidden text or dead hovers)
- [ ] Loading, empty, error, success and disabled states all built
- [ ] Contrast passes AA in resting, hover and focus states
- [ ] Full keyboard pass; focus visible; Escape closes overlays
- [ ] Touch targets ≥ 44px; nothing hidden under the notch, home bar or tab bar
- [ ] Reduced motion turns off lifts, zooms and reveals
- [ ] Copy follows section 3: plain, warm, verb-first buttons, helpful errors
- [ ] Longest real labels and names tested (and a one-letter name, and a missing image)
- [ ] Images have alt text and reserved space
- [ ] Version bumped so people get the new files
- [ ] What couldn't be tested is written down

---

## 15. Prompt for an AI building the new app

Paste this into the new project's CLAUDE.md (or the first message of a session), after filling in section 1:

> Read `docs/ui-ux-guide.md` before building any screen, and follow it. Use only the tokens in section 4; never hard-code colors, fonts, radii or shadows. Build every new button with `.app-btn` plus one family class and the hover system in 6.1. Design for 390px first. Build loading, empty, error and success states for every screen. Write copy in the voice from section 3. Illustrations use the sticker-card style in section 7; never generic art, and never redraw existing art uninvited. Before saying a screen is done, run the checklist in section 14, screenshot it at 390px and 1280px, and say plainly what you couldn't check.
