// Motion that makes the app feel alive, with nothing running while it sits still.
//
// 1. Sliding indicators. Every segmented picker (.seg), tab row (.tabs) and the sidebar (.side-nav) gets
//    one highlight that glides to the chosen item on a spring, instead of jumping, and stretches a little
//    along the way like liquid (ideas from Fluid's Pill Tabs and Spring Switch, MIT). It moves by
//    translate and scale only, so the GPU runs it even while the next screen is drawing. The CSS draws
//    it; this file measures where it should go.
// 2. Tab content follows. When a tab row changes, the panel under it slides in from the side you moved
//    toward, so switching tabs always feels the same everywhere.
//
// Work happens only when the page changes (a MutationObserver batched to one frame), never on a timer.

const SEL = '.seg, .tabs, .side-nav';
const state = new WeakMap();
const watched = new WeakSet();
const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// The same spring as --spring-snappy in styles.css.
const SNAPPY = 'linear(0, 0.045, 0.151, 0.283, 0.421, 0.551, 0.665, 0.76, 0.836, 0.895, 0.938, 0.969, 0.99, 1.003, 1.011, 1.014, 1.015, 1.014, 1.013, 1.011, 1.009, 1.007, 1.005, 1.004, 1.002, 1.002, 1.001, 1, 1)';
let resize = null;

function place(c) {
  const on = c.querySelector(':scope > .on');
  const prev = state.get(c);
  if (!on || !on.offsetWidth) {
    if (prev?.shown) { c.style.setProperty('--ind-o', '0'); state.set(c, { ...prev, shown: false }); }
    return;
  }
  const x = on.offsetLeft, y = on.offsetTop, w = on.offsetWidth, h = on.offsetHeight;
  if (prev && prev.on === on && prev.x === x && prev.y === y && prev.w === w && prev.h === h && prev.shown) return;
  const first = !prev || !prev.shown;
  if (first) c.setAttribute('data-ind-still', '');
  c.style.setProperty('--ind-x', `${x}px`); c.style.setProperty('--ind-y', `${y}px`);
  c.style.setProperty('--ind-w', `${w}px`); c.style.setProperty('--ind-h', `${h}px`);
  c.style.setProperty('--ind-o', '1');
  c.setAttribute('data-ind', '');
  if (first) requestAnimationFrame(() => requestAnimationFrame(() => c.removeAttribute('data-ind-still')));
  const moved = prev && prev.on && prev.on !== on && prev.on.isConnected;
  if (moved && !reduce()) {
    // A liquid stretch along the way it travels, bigger for longer trips.
    const dist = Math.hypot(x - prev.x, y - prev.y);
    const k = Math.min(0.22, 0.05 + dist / 1400);
    const vertical = Math.abs(y - prev.y) > Math.abs(x - prev.x);
    const peak = vertical ? `${1 - k * 0.35} ${1 + k}` : `${1 + k} ${1 - k * 0.35}`;
    const pseudo = c.classList.contains('tabs') ? '::after' : '::before';
    try { c.animate([{ scale: '1 1' }, { scale: peak, offset: 0.32 }, { scale: '1 1' }], { duration: 360, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', pseudoElement: pseudo }); } catch { /* older engines just glide */ }
    // A new tab was picked: bring its panel in from that side.
    if (c.classList.contains('tabs') || c.getAttribute('role') === 'tablist') {
      const panel = c.nextElementSibling;
      const dx = x + y >= prev.x + prev.y ? 14 : -14;
      panel?.animate?.([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: SNAPPY });
    }
  }
  state.set(c, { on, x, y, w, h, shown: true });
  if (!watched.has(c)) { watched.add(c); resize?.observe(c); }
}

let queued = false;
function update() {
  queued = false;
  for (const c of document.querySelectorAll(SEL)) place(c);
}
const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

export function startMotion() {
  if (typeof window === 'undefined' || !window.MutationObserver) return;
  resize = window.ResizeObserver ? new ResizeObserver(schedule) : null;
  new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  schedule();
}
