import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, Check } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import CaptionOverlay, { findFont } from './CaptionOverlay.jsx';

const SAMPLE = 'God wants what is in our hands, yes, but He wants our hearts first.'.split(' ');

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
    <div className="vframe" style={{ width, background: 'linear-gradient(160deg,#8a93a6,#3a4152 55%,#1a1f2b)' }} aria-label="Caption preview">
      <div style={{ position: 'absolute', left: '30%', top: '30%', width: '40%', height: '58%', borderRadius: '42% 42% 18% 18%', background: 'linear-gradient(#d8c8b8,#6d7a8f 40%,#3b4558)', opacity: 0.8 }} />
      <CaptionOverlay theme={theme} font={font} words={words} t={t} frameWidth={width} hook={hook} showHook={Boolean(hook)} />
    </div>
  );
}

function ColorField({ label, color, opacity, onColor, onOpacity, hint }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
      <div className="color-row">
        <input type="color" aria-label={`${label} color`} value={color || '#ffffff'} onChange={(e) => onColor(e.target.value)} />
        {onOpacity && (
          <>
            <input type="range" aria-label={`${label} opacity`} min="0" max="1" step="0.05" value={opacity ?? 1} onChange={(e) => onOpacity(Number(e.target.value))} />
            <span className="small muted num" style={{ width: 38 }}>{Math.round((opacity ?? 1) * 100)}%</span>
          </>
        )}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function FontPicker({ value, onChange }) {
  const { themes, reloadThemes } = useApp();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const sys = (themes.systemFonts || []).filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  const curated = themes.fonts.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  const current = findFont(themes, value);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>Font</span>
      <div className="row">
        <input className="input" placeholder={`Search ${themes.fonts.length + (themes.systemFonts?.length || 0)} fonts`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn icon" title="Look for newly installed fonts" aria-label="Refresh system fonts" disabled={busy}
          onClick={async () => { setBusy(true); await api.post('/api/fonts/refresh'); await reloadThemes(); setBusy(false); }}>
          <RefreshCw size={15} />
        </button>
      </div>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} size={6} style={{ height: 'auto' }}>
        {!curated.some((f) => f.id === value) && !sys.some((f) => f.id === value) && current && <option value={current.id}>{current.name}</option>}
        <optgroup label="Recommended">
          {curated.map((f) => <option key={f.id} value={f.id}>{f.name}{f.bundled ? ' (built in)' : ''}</option>)}
        </optgroup>
        <optgroup label="Installed on this Mac">
          {sys.slice(0, 600).map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.name}</option>)}
        </optgroup>
      </select>
      <span className="hint" style={{ fontFamily: current?.css, fontWeight: current?.weight, fontSize: 16, color: 'var(--ink)' }}>{current?.name}: God wants what is in our hands</span>
    </div>
  );
}

const BLANK = {
  name: 'My theme', font: 'montserrat-semibold', size: 72, color: '#FFFFFF', colorOpacity: 1, active: '#FFD54A', activeOpacity: 1,
  future: null, futureOpacity: 1, outline: 4, outlineColor: '#000000', outlineOpacity: 1, shadow: 0.3, position: 0.7, words: 3,
  uppercase: false, highlight: 'color', boxColor: '#FFFFFF', boxOpacity: 0.92, align: 'center', maxWidth: 0.86, lineHeight: 1.15,
};

export default function VideoThemeEditor({ selectedId, onPick, pickLabel = 'Use this theme' }) {
  const { themes, reloadThemes, toast } = useApp();
  const [editingId, setEditingId] = useState(selectedId || themes.video[0]?.id);
  const base = themes.video.find((t) => t.id === editingId) || themes.video[0];
  const [draft, setDraft] = useState(base);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (editingId !== 'new') { setDraft(base); setDirty(false); } }, [base?.id]);
  if (!draft) return null;
  const font = findFont(themes, draft.font);
  const set = (patch) => { setDirty(true); setDraft({ ...draft, ...patch }); };
  const startCustom = () => {
    setEditingId('new');
    setDraft({ ...BLANK, ...base, ...{ id: undefined, builtin: false, name: 'My custom theme' } });
    setDirty(true);
  };
  const save = async (asNew) => {
    const body = { ...draft, id: asNew || draft.builtin ? undefined : draft.id };
    const { theme } = await api.post('/api/themes/video', body);
    await reloadThemes();
    setEditingId(theme.id);
    setDirty(false);
    onPick?.(theme.id);
    toast({ text: `Saved “${theme.name}”.` });
  };
  const remove = async () => {
    if (!confirm(`Delete the theme “${draft.name}”? Clips using it will switch to the default. This can't be undone.`)) return;
    await api.del(`/api/themes/video/${draft.id}`);
    await reloadThemes();
    setEditingId(themes.video[0].id);
  };
  const isNew = editingId === 'new';

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row wrap">
        {themes.video.map((t) => (
          <button key={t.id} className={`btn sm ${t.id === editingId ? 'primary' : ''}`} onClick={() => setEditingId(t.id)}>
            {t.id === selectedId && <Check size={13} aria-label="In use" />}{t.name}
          </button>
        ))}
        <button className={`btn sm accent`} onClick={startCustom}><Plus size={14} />Create custom theme</button>
      </div>
      {isNew && <div className="banner info">You're building a new theme, starting from “{base?.name}”. Change anything, then save it.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
        <div className="stack" style={{ position: 'sticky', top: 0 }}>
          <ThemePreview theme={draft} font={font} />
          {onPick && !isNew && <button className="btn" disabled={draft.id === selectedId} onClick={() => onPick(draft.id)}>{draft.id === selectedId ? 'In use' : pickLabel}</button>}
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <label className="field">Theme name<input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <FontPicker value={draft.font} onChange={(id) => set({ font: id })} />

          <div className="stack" style={{ gap: 6 }}>
            <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>How the spoken word stands out</span>
            <div className="seg">
              {[['color', 'Color the word'], ['pill', 'Pill behind the word'], ['box', 'Box behind the line']].map(([k, l]) => (
                <button key={k} className={draft.highlight === k ? 'on' : ''} onClick={() => set({ highlight: k })}>{l}</button>
              ))}
            </div>
          </div>

          <div className="token-grid">
            <ColorField label="Spoken words" color={draft.color} opacity={draft.colorOpacity} onColor={(v) => set({ color: v })} onOpacity={(v) => set({ colorOpacity: v })} />
            <ColorField label="Word being said" color={draft.active} opacity={draft.activeOpacity} onColor={(v) => set({ active: v })} onOpacity={(v) => set({ activeOpacity: v })} />
            <div className="stack" style={{ gap: 4 }}>
              <label className="row small" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                <input type="checkbox" checked={draft.future != null} onChange={(e) => set({ future: e.target.checked ? draft.color : null, futureOpacity: e.target.checked ? 0.45 : 1 })} />
                Different look for upcoming words
              </label>
              {draft.future != null && (
                <ColorField label="Upcoming words" color={draft.future} opacity={draft.futureOpacity} onColor={(v) => set({ future: v })} onOpacity={(v) => set({ futureOpacity: v })} hint="Lower the opacity to fade words that haven't been said yet." />
              )}
            </div>
            {draft.highlight !== 'color'
              ? <ColorField label={draft.highlight === 'pill' ? 'Pill' : 'Box'} color={draft.boxColor} opacity={draft.boxOpacity} onColor={(v) => set({ boxColor: v })} onOpacity={(v) => set({ boxOpacity: v })} />
              : <ColorField label="Outline" color={draft.outlineColor} opacity={draft.outlineOpacity} onColor={(v) => set({ outlineColor: v })} onOpacity={(v) => set({ outlineOpacity: v })} />}
          </div>

          <div className="token-grid">
            <label className="field">Size · {draft.size}<input type="range" min="36" max="130" value={draft.size} onChange={(e) => set({ size: Number(e.target.value) })} /></label>
            <label className="field">Words on screen · up to {draft.words}<input type="range" min="1" max="8" value={draft.words} onChange={(e) => set({ words: Number(e.target.value) })} /></label>
            <label className="field">Position · {Math.round(draft.position * 100)}% down<input type="range" min="0.08" max="0.9" step="0.01" value={draft.position} onChange={(e) => set({ position: Number(e.target.value) })} /></label>
            <label className="field">Text width · {Math.round((draft.maxWidth ?? 0.86) * 100)}%<input type="range" min="0.4" max="0.95" step="0.01" value={draft.maxWidth ?? 0.86} onChange={(e) => set({ maxWidth: Number(e.target.value) })} /></label>
            <label className="field">Line spacing · {(draft.lineHeight ?? 1.12).toFixed(2)}<input type="range" min="0.9" max="1.6" step="0.02" value={draft.lineHeight ?? 1.12} onChange={(e) => set({ lineHeight: Number(e.target.value) })} /></label>
            {draft.highlight === 'color' && <label className="field">Outline thickness · {draft.outline}<input type="range" min="0" max="14" value={draft.outline} onChange={(e) => set({ outline: Number(e.target.value) })} /></label>}
            <label className="field">Shadow · {Math.round(draft.shadow * 100)}%<input type="range" min="0" max="0.9" step="0.05" value={draft.shadow} onChange={(e) => set({ shadow: Number(e.target.value) })} /></label>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>Alignment</span>
              <div className="seg">
                <button className={draft.align !== 'left' ? 'on' : ''} onClick={() => set({ align: 'center' })}>Centered</button>
                <button className={draft.align === 'left' ? 'on' : ''} onClick={() => set({ align: 'left' })}>Left</button>
              </div>
            </div>
            <label className="row small" style={{ alignSelf: 'end' }}><input type="checkbox" checked={draft.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} />ALL CAPS</label>
          </div>

          <div className="row wrap">
            {isNew || draft.builtin
              ? <button className="btn primary" onClick={() => save(true)}>{isNew ? 'Save new theme' : 'Save as my theme'}</button>
              : <>
                <button className="btn primary" disabled={!dirty} onClick={() => save(false)}>Save changes</button>
                <button className="btn" onClick={() => save(true)}>Save as a copy</button>
              </>}
            {(dirty || isNew) && <button className="btn ghost" onClick={() => { setEditingId(base?.id); setDraft(base); setDirty(false); }}>Discard</button>}
            {!draft.builtin && !isNew && <button className="btn ghost danger" onClick={remove}><Trash2 size={14} />Delete</button>}
          </div>
          {draft.builtin && !isNew && <span className="hint">Built-in themes stay as they are. Saving makes your own copy.</span>}
        </div>
      </div>
    </div>
  );
}
