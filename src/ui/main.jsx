import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { PresentOut } from './design/Presenter.jsx';
import './styles.css';
import { startMotion } from './motion.js';

// Sliders show a filled track up to the thumb. Kept in sync for every range input in the app.
function syncRange(el) {
  const min = Number(el.min || 0); const max = Number(el.max || 100);
  el.style.setProperty('--fill', `${((Number(el.value) - min) / (max - min || 1)) * 100}%`);
}
const syncAll = () => document.querySelectorAll('input[type="range"]').forEach(syncRange);
document.addEventListener('input', (e) => { if (e.target?.type === 'range') syncRange(e.target); }, true);
new MutationObserver(syncAll).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'min', 'max'] });

// The audience screen for a slide show is its own small page.
// Switches can be dragged as well as clicked. Dragging past halfway sets it on or off.
let drag = null; let swallowClick = false;
document.addEventListener('pointerdown', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.type !== 'checkbox' || !el.closest('.switch')) return;
  drag = { el, x: e.clientX, start: el.checked ? 16 : 0, moved: false };
}, true);
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 3) drag.moved = true;
  if (!drag.moved) return;
  drag.el.classList.add('dragging');
  drag.el.style.setProperty('--knob', `${Math.max(0, Math.min(16, drag.start + dx))}px`);
}, true);
document.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const { el, moved, start, x } = drag;
  drag = null;
  el.classList.remove('dragging');
  if (!moved) return;
  const want = start + (e.clientX - x) > 8;
  swallowClick = true;
  setTimeout(() => { swallowClick = false; if (want !== el.checked) el.click(); }, 0);
}, true);
document.addEventListener('click', (e) => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);

startMotion();
createRoot(document.getElementById('root')).render(location.hash === '#present-out' ? <PresentOut /> : <App />);
