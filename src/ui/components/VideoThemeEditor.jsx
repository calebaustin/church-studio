import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, Check, Heart, MessageCircle, Send, Bookmark, Music2, ThumbsUp, Repeat2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import CaptionOverlay, { findFont } from './CaptionOverlay.jsx';
import ColorField from './ColorField.jsx';
import FontMenu from './FontMenu.jsx';

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

/** Rough stand-ins for where each app draws its own buttons and text, to check captions stay clear. */
function AppOverlay({ app }) {
  if (!app) return null;
  const icons = {
    tiktok: [[Heart, '12K'], [MessageCircle, '231'], [Bookmark, '1K'], [Send, 'Share']],
    reels: [[Heart, '12K'], [MessageCircle, '231'], [Send, ''], [Bookmark, '']],
    shorts: [[ThumbsUp, '12K'], [MessageCircle, '231'], [Repeat2, 'Remix'], [Send, 'Share']],
  }[app];
  return (
    <div className="app-overlay" aria-hidden="true">
      <div className="ao-side">{icons.map(([I, n], i) => <span key={i}><I size={18} />{n && <small>{n}</small>}</span>)}</div>
      <div className="ao-bottom">
        <strong>@yourchurch</strong>
        <span>Sunday's message in 60 seconds…</span>
        {app !== 'shorts' && <span className="row" style={{ gap: 4 }}><Music2 size={11} />Original audio</span>}
      </div>
    </div>
  );
}

export function ThemePreview({ theme, font, width = 230, hook = null, app = null }) {
  const { words, t } = useSampleWords();
  return (
    <div className="vframe" style={{ width, background: 'linear-gradient(160deg,#8a93a6,#3a4152 55%,#1a1f2b)' }} aria-label="Caption preview">
      <svg className="podium-art" viewBox="0 0 100 178" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="pd-wood" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#6b5444" /><stop offset="1" stopColor="#3a2c24" /></linearGradient>
          <linearGradient id="pd-coat" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4a5468" /><stop offset="1" stopColor="#262c3a" /></linearGradient>
          <radialGradient id="pd-light" cx="0.5" cy="0.25" r="0.6"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="100" height="178" fill="url(#pd-light)" />
        <circle cx="50" cy="70" r="11" fill="#d9b9a0" />
        <path d="M28 120 Q30 88 50 85 Q70 88 72 120 Z" fill="url(#pd-coat)" />
        <path d="M30 108 L70 108 L66 112 L34 112 Z" fill="#7d6452" />
        <path d="M34 112 L66 112 L62 178 L38 178 Z" fill="url(#pd-wood)" />
        <rect x="45" y="124" width="10" height="10" rx="2" fill="#c9a96e" opacity=".6" />
        <rect x="0" y="170" width="100" height="8" fill="#1a1f2b" opacity=".6" />
      </svg>
      <CaptionOverlay theme={theme} font={font} words={words} t={t} frameWidth={width} hook={hook} showHook={Boolean(hook)} />
      <AppOverlay app={app} />
    </div>
  );
}

function ColorRow({ label, color, opacity, onColor, onOpacity, hint }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
      <div className="color-row">
        <ColorField label="" value={color || '#ffffff'} onChange={onColor} />
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
  const { themes } = useApp();
  const current = findFont(themes, value);
  const options = [
    ...themes.fonts.map((f) => ({ value: f.id, label: f.bundled ? `${f.name} (built in)` : f.name, css: f.css, weight: f.weight, group: 'Recommended' })),
    ...(themes.systemFonts || []).map((f) => ({ value: f.id, label: f.name, css: f.css, weight: f.weight, group: 'Installed on this Mac' })),
  ];
  if (current && !options.some((o) => o.value === value)) options.unshift({ value, label: current.name, css: current.css, group: 'Current' });
  return <FontMenu label="Font" value={value} onChange={onChange} options={options} />;
}

/** All caption style controls. Used in Settings and live in the clip editor. */
export function CaptionStyleFields({ draft, set }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <FontPicker value={draft.font} onChange={(id) => set({ font: id })} />
      <div className="stack" style={{ gap: 6 }}>
        <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>How the spoken word stands out</span>
        <div className="seg">
          {[['color', 'Color'], ['pill', 'Pill'], ['box', 'Box behind line']].map(([k, l]) => (
            <button key={k} className={draft.highlight === k ? 'on' : ''} onClick={() => set({ highlight: k })}>{l}</button>
          ))}
        </div>
      </div>
      <div className="token-grid">
        <ColorRow label="Spoken words" color={draft.color} opacity={draft.colorOpacity} onColor={(v) => set({ color: v })} onOpacity={(v) => set({ colorOpacity: v })} />
        <ColorRow label="Word being said" color={draft.active} opacity={draft.activeOpacity} onColor={(v) => set({ active: v })} onOpacity={(v) => set({ activeOpacity: v })} />
        <div className="stack" style={{ gap: 4 }}>
          <label className="row small" style={{ fontWeight: 600, color: 'var(--ink)' }}>
            <input type="checkbox" checked={draft.future != null} onChange={(e) => set({ future: e.target.checked ? draft.color : null, futureOpacity: e.target.checked ? 0.45 : 1 })} />
            Different look for upcoming words
          </label>
          {draft.future != null && <ColorRow label="Upcoming words" color={draft.future} opacity={draft.futureOpacity} onColor={(v) => set({ future: v })} onOpacity={(v) => set({ futureOpacity: v })} />}
        </div>
        {draft.highlight !== 'color'
          ? <ColorRow label={draft.highlight === 'pill' ? 'Pill' : 'Box'} color={draft.boxColor} opacity={draft.boxOpacity} onColor={(v) => set({ boxColor: v })} onOpacity={(v) => set({ boxOpacity: v })} />
          : <ColorRow label="Outline" color={draft.outlineColor} opacity={draft.outlineOpacity} onColor={(v) => set({ outlineColor: v })} onOpacity={(v) => set({ outlineOpacity: v })} />}
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
    </div>
  );
}

/** On-screen hook style. Part of the caption theme so every clip using it matches. */
export function HookStyleFields({ draft, set }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>Hook shape</span>
        <div className="seg">
          {[['pill', 'Pill'], ['box', 'Box'], ['none', 'Text only']].map(([k, l]) => <button key={k} className={(draft.hookShape || 'pill') === k ? 'on' : ''} onClick={() => set({ hookShape: k })}>{l}</button>)}
        </div>
      </div>
      <div className="token-grid">
        <ColorRow label="Hook text" color={draft.hookColor || '#11141C'} onColor={(v) => set({ hookColor: v })} />
        {(draft.hookShape || 'pill') !== 'none' && <ColorRow label="Hook background" color={draft.hookBg || '#FFFFFF'} opacity={draft.hookBgOpacity ?? 0.94} onColor={(v) => set({ hookBg: v })} onOpacity={(v) => set({ hookBgOpacity: v })} />}
        <label className="field">Hook size · {draft.hookSize ?? 58}<input type="range" min="30" max="110" value={draft.hookSize ?? 58} onChange={(e) => set({ hookSize: Number(e.target.value) })} /></label>
        <label className="field">Shows for · {(draft.hookDuration ?? 3.5).toFixed(1)}s<input type="range" min="1" max="10" step="0.5" value={draft.hookDuration ?? 3.5} onChange={(e) => set({ hookDuration: Number(e.target.value) })} /></label>
        <label className="field">Default position · {Math.round((draft.hookY ?? 0.13) * 100)}% down<input type="range" min="0.05" max="0.9" step="0.01" value={draft.hookY ?? 0.13} onChange={(e) => set({ hookY: Number(e.target.value) })} /></label>
        <label className="row small" style={{ alignSelf: 'end' }}><input type="checkbox" checked={Boolean(draft.hookUppercase)} onChange={(e) => set({ hookUppercase: e.target.checked })} />ALL CAPS</label>
      </div>
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
  const [app, setApp] = useState(null);
  const [tab, setTab] = useState('captions');
  useEffect(() => { if (editingId !== 'new') { setDraft(base); setDirty(false); } }, [base?.id]);
  if (!draft) return null;
  const font = findFont(themes, draft.font);
  const set = (patch) => { setDirty(true); setDraft({ ...draft, ...patch }); };
  const startCustom = () => {
    setEditingId('new');
    setDraft({ ...BLANK, ...base, id: undefined, builtin: false, name: 'My custom theme' });
    setDirty(true);
  };
  const save = async (asNew) => {
    const { theme } = await api.post('/api/themes/video', { ...draft, id: asNew || draft.builtin ? undefined : draft.id });
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
        <button className="btn sm accent" onClick={startCustom}><Plus size={14} />Create custom theme</button>
      </div>
      {isNew && <div className="banner info">New theme, starting from “{base?.name}”. Change anything, then save it.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
        <div className="stack sticky-col">
          <ThemePreview theme={draft} font={font} width={250} app={app} hook={tab === 'hook' ? 'Your hook goes here' : null} />
          <span className="small muted">See what it looks like on:</span>
          <div className="seg sm fit-seg" style={{ width: 250 }} aria-label="Preview with app buttons">
            {[[null, 'Plain'], ['tiktok', 'TikTok'], ['reels', 'Reels'], ['shorts', 'Shorts']].map(([k, l]) => <button key={l} className={app === k ? 'on' : ''} onClick={() => setApp(k)}>{l}</button>)}
          </div>
          {onPick && !isNew && <button className="btn" disabled={draft.id === selectedId} onClick={() => onPick(draft.id)}>{draft.id === selectedId ? 'Default for new clips' : pickLabel}</button>}
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <label className="field">Theme name<input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <div className="tabs" role="tablist" aria-label="Part of this theme">
            <button role="tab" aria-selected={tab === 'captions'} className={tab === 'captions' ? 'on' : ''} onClick={() => setTab('captions')}>Captions</button>
            <button role="tab" aria-selected={tab === 'hook'} className={tab === 'hook' ? 'on' : ''} onClick={() => setTab('hook')}>On-screen hook</button>
          </div>
          {tab === 'captions' ? <CaptionStyleFields draft={draft} set={set} /> : <HookStyleFields draft={draft} set={set} />}
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
