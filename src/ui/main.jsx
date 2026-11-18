import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Sliders show a filled track up to the thumb. Kept in sync for every range input in the app.
function syncRange(el) {
  const min = Number(el.min || 0); const max = Number(el.max || 100);
  el.style.setProperty('--fill', `${((Number(el.value) - min) / (max - min || 1)) * 100}%`);
}
const syncAll = () => document.querySelectorAll('input[type="range"]').forEach(syncRange);
document.addEventListener('input', (e) => { if (e.target?.type === 'range') syncRange(e.target); }, true);
new MutationObserver(syncAll).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'min', 'max'] });

createRoot(document.getElementById('root')).render(<App />);
