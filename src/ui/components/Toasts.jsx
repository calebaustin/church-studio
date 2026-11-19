import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, FolderOpen, FolderInput, Send, X } from 'lucide-react';
import { api, desktop, sizeLabel } from '../api.js';
import { useApp } from '../App.jsx';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A short confetti burst from the bottom center. Skipped for reduced motion. */
function Confetti({ onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    if (reduced()) { onDone(); return undefined; }
    const c = ref.current;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const colors = [css.getPropertyValue('--accent'), css.getPropertyValue('--accent-2'), '#FFD54A', '#4ACB93', '#FF6FA8', '#FFFFFF'].map((s) => s.trim() || '#fff');
    const parts = Array.from({ length: 170 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight - 90,
      vx: (Math.random() - 0.5) * 15, vy: -(Math.random() * 15 + 9),
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, color: colors[(Math.random() * colors.length) | 0],
    }));
    let raf;
    const t0 = performance.now();
    const frame = (now) => {
      const t = now - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 2600);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (t < 2600) raf = requestAnimationFrame(frame); else onDone();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden="true" style={{ width: '100vw', height: '100vh' }} />;
}

function Toast({ t, dismiss }) {
  const { go } = useApp();
  const [hover, setHover] = useState(false);
  const [confetti, setConfetti] = useState(t.kind === 'export');
  const [file, setFile] = useState(t.result?.file);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (hover || t.sticky) return undefined;
    const id = setTimeout(() => dismiss(t.id), t.duration || 5000);
    return () => clearTimeout(id);
  }, [hover]);
  const r = t.result || {};
  const mb = r.bytes ? sizeLabel(r.bytes) : '';
  return (
    <>
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
      {t.kind === 'export' ? (
        <div className="ink-toast big" role="dialog" aria-label="Your video is ready">
          {r.thumb ? <img className="thumb9" src={r.thumb} alt="" /> : <div className="thumb9" />}
          <div className="stack" style={{ gap: 6 }}>
            <div className="row between">
              <h3 className="row" style={{ gap: 8 }}><CheckCircle2 size={20} aria-hidden="true" />Your video is ready</h3>
              <button className="btn icon sm" aria-label="Close" onClick={() => dismiss(t.id)}><X size={15} /></button>
            </div>
            <span className="truncate" style={{ opacity: 0.85 }}>{r.title}</span>
            <span className="small num" style={{ opacity: 0.7 }}>{[r.width && `${r.width}×${r.height}`, r.length && `${Math.round(r.length)}s`, mb].filter(Boolean).join(' · ')}</span>
            {t.note && <span className="toast-note">{t.note}</span>}
            <span className="small" style={{ opacity: 0.85 }}>{moved ? `Moved to ${file?.split('/').slice(-2, -1)[0]}.` : `Saved to ${file?.split('/').slice(-2, -1)[0] || 'Downloads'}. Where do you want it?`}</span>
            <div className="row wrap" style={{ marginTop: 2 }}>
              <button className="btn sm" onClick={() => { api.post('/api/reveal', { path: file }); dismiss(t.id); }}><FolderOpen size={14} />{moved ? 'Show it' : 'Keep it here'}</button>
              <button className="btn sm" onClick={async () => {
                const folder = desktop?.pickFolder ? await desktop.pickFolder() : prompt('Move to which folder? (full path)');
                if (!folder) return;
                try {
                  const res = await api.post(`/api/projects/${r.projectId}/clips/${r.clipId}/move`, { folder });
                  setFile(res.file); setMoved(true);
                } catch (e) { alert(e.message); }
              }}><FolderInput size={14} />Move to…</button>
              <button className="btn accent sm" onClick={() => { dismiss(t.id); go({ name: 'social', compose: { projectId: r.projectId, clipId: r.clipId } }); }}><Send size={14} />Post it</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="ink-toast" role="status" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          {t.kind === 'error' ? <AlertCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
          <span className="stack" style={{ gap: 2 }}><span>{t.text}</span>{t.note && <span className="toast-note">{t.note}</span>}</span>
          {t.action ? <button className="btn accent sm" onClick={() => { t.action.run(); dismiss(t.id); }}>{t.action.label}</button>
            : <button className="btn icon sm" aria-label="Close" onClick={() => dismiss(t.id)}><X size={14} /></button>}
        </div>
      )}
    </>
  );
}

export function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <Toast key={t.id} t={t} dismiss={dismiss} />)}
    </div>
  );
}
