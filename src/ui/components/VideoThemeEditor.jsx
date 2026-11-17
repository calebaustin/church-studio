import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import CaptionOverlay from './CaptionOverlay.jsx';

const SAMPLE = 'Grace is not something you earn. It is something you receive.'.split(' ');

/** Animated sample so a theme can be judged without a video. */
function useSampleWords() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => (x + 0.1) % (SAMPLE.length * 0.38 + 0.8)), 100);
    return () => clearInterval(id);
  }, []);
  const words = useMemo(() => SAMPLE.map((w, i) => ({ w, start: i * 0.38, end: i * 0.38 + 0.34 })), []);
  return { words, t };
}

export function ThemePreview({ theme, font, width = 230, hook }) {
  const { words, t } = useSampleWords();
  return (
    <div className="vframe" style={{ width, background: 'linear-gradient(160deg,#6d7a91,#2b3242 60%,#1a1f2b)' }}>
      <div style={{ position: 'absolute', left: '28%', top: '24%', width: '44%', height: '52%', borderRadius: '45% 45% 30% 30%', background: 'linear-gradient(#c9a58b,#8a6a58)', opacity: 0.55 }} />
      <CaptionOverlay theme={theme} font={font} words={words} t={t} frameWidth={width} hook={hook} showHook={Boolean(hook)} />
    </div>
  );
}

export default function VideoThemeEditor({ selectedId, onPick, pickLabel = 'Use this theme' }) {
  const { themes, reloadThemes } = useApp();
  const [editingId, setEditingId] = useState(selectedId || themes.video[0]?.id);
  const base = themes.video.find((t) => t.id === editingId) || themes.video[0];
  const [draft, setDraft] = useState(base);
  const dirty = useRef(false);
  useEffect(() => { setDraft(base); dirty.current = false; }, [base?.id]);
  if (!draft) return null;
  const font = themes.fonts.find((f) => f.id === draft.font);
  const set = (patch) => { dirty.current = true; setDraft({ ...draft, ...patch }); };
  const save = async (asNew) => {
    const body = { ...draft, id: asNew ? undefined : draft.id, name: asNew && draft.builtin ? `${draft.name} (mine)` : draft.name };
    const { theme } = await api.post('/api/themes/video', body);
    await reloadThemes();
    setEditingId(theme.id);
    onPick?.(theme.id);
  };
  const remove = async () => {
    await api.del(`/api/themes/video/${draft.id}`);
    await reloadThemes();
    setEditingId(themes.video[0].id);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap">
        {themes.video.map((t) => (
          <button key={t.id} className={`btn sm ${t.id === editingId ? 'primary' : ''}`} onClick={() => setEditingId(t.id)}>
            {t.name}{t.id === selectedId ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 22, alignItems: 'start' }}>
        <div className="stack">
          <ThemePreview theme={draft} font={font} />
          {onPick && <button className="btn" disabled={draft.id === selectedId && !dirty.current} onClick={() => onPick(draft.id)}>{draft.id === selectedId ? 'In use' : pickLabel}</button>}
        </div>
        <div className="stack">
          <label className="field">Name<input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <div className="grid2">
            <label className="field">Font
              <select className="input" value={draft.font} onChange={(e) => set({ font: e.target.value })}>
                {themes.fonts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="field">Highlight
              <select className="input" value={draft.highlight} onChange={(e) => set({ highlight: e.target.value })}>
                <option value="color">Color the spoken word</option>
                <option value="box">Soft box behind words</option>
              </select>
            </label>
            <label className="field">Size · {draft.size}<input type="range" min="44" max="120" value={draft.size} onChange={(e) => set({ size: Number(e.target.value) })} /></label>
            <label className="field">Words at a time · {draft.words}<input type="range" min="1" max="6" value={draft.words} onChange={(e) => set({ words: Number(e.target.value) })} /></label>
            <label className="field">Position · {Math.round(draft.position * 100)}% down<input type="range" min="0.2" max="0.88" step="0.01" value={draft.position} onChange={(e) => set({ position: Number(e.target.value) })} /></label>
            <label className="field">Outline · {draft.outline}<input type="range" min="0" max="14" value={draft.outline} onChange={(e) => set({ outline: Number(e.target.value) })} /></label>
            <label className="field">Shadow · {Math.round(draft.shadow * 100)}%<input type="range" min="0" max="0.9" step="0.05" value={draft.shadow} onChange={(e) => set({ shadow: Number(e.target.value) })} /></label>
            <label className="row small" style={{ alignSelf: 'end' }}><input type="checkbox" checked={draft.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} />ALL CAPS</label>
          </div>
          <div className="row wrap" style={{ gap: 18 }}>
            <label className="row small"><input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })} />Text</label>
            <label className="row small"><input type="color" value={draft.active} onChange={(e) => set({ active: e.target.value })} />Spoken word</label>
            <label className="row small"><input type="color" value={draft.outlineColor} onChange={(e) => set({ outlineColor: e.target.value })} />Outline</label>
            <label className="row small"><input type="color" value={draft.boxColor} onChange={(e) => set({ boxColor: e.target.value })} />Box</label>
          </div>
          <div className="row">
            {!draft.builtin && <button className="btn primary" onClick={() => save(false)}>Save</button>}
            <button className={`btn ${draft.builtin ? 'primary' : ''}`} onClick={() => save(true)}>Save as new theme</button>
            {!draft.builtin && <button className="btn ghost danger" onClick={remove}>Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
