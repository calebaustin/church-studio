import { useEffect, useRef, useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { useApp, applyAppTheme, activeAppTheme } from '../App.jsx';
import { api, desktop, openLink, fmt } from '../api.js';
import VideoThemeEditor from '../components/VideoThemeEditor.jsx';
import ColorField from '../components/ColorField.jsx';
import ChurchInfoFields from '../components/ChurchInfoFields.jsx';
import { AppLogo, Connections, Credits, Feedback, YourTools } from './SettingsMore.jsx';
import { mdToHtml } from '../markdown.js';
import { Download, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';

const SECTIONS = [
  ['menu', 'Your tools'],
  ['connections', 'Connections'],
  ['youtube', 'YouTube channel'],
  ['ai', 'AI helper'],
  ['clips', 'Transcription & clips'],
  ['export', 'Exports'],
  ['app-theme', 'App theme'],
  ['video-themes', 'Caption themes'],
  ['church', 'Church info'],
  ['tools', 'Helper programs'],
  ['updates', 'Updates'],
  ['feedback', 'Send feedback'],
  ['credits', 'Thank you'],
];

export default function Settings({ section: initial }) {
  const [section, setSection] = useState(initial === 'start' ? 'menu' : initial || 'menu');
  return (
    <div className="page settings">
      <nav className="glass">
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={section === id ? 'on' : ''} onClick={() => setSection(id)}>{label}</button>
        ))}
      </nav>
      <div className="stack" style={{ gap: 18 }}>
        {section === 'menu' && <YourTools />}
        {section === 'connections' && <Connections />}
        {section === 'feedback' && <Feedback />}
        {section === 'credits' && <Credits />}
        {section === 'tools' && <Tools />}
        {section === 'youtube' && <YouTube />}
        {section === 'ai' && <AIKeys />}
        {section === 'clips' && <ClipDefaults />}
        {section === 'export' && <ExportSettings />}
        {section === 'app-theme' && <AppTheme />}
        {section === 'video-themes' && <VideoThemes />}
        {section === 'church' && <section className="glass strong panel stack"><h2>Church info</h2><p className="muted">Printed guides and notes show this in the footer, next to your logo.</p><ChurchInfoFields /></section>}
        {section === 'church' && <AppLogo />}
        {section === 'updates' && <Updates />}
      </div>
    </div>
  );
}

function Saved({ at }) {
  if (!at) return null;
  return <span className="chip ok"><span className="dot" />Saved</span>;
}

function Tools() {
  const { trackJob, onJobFinished } = useApp();
  const [tools, setTools] = useState(null);
  const load = () => api.get('/api/tools').then((r) => setTools(r.tools.filter((t) => t.name !== 'python: numpy')));
  useEffect(() => { load(); }, []);
  useEffect(() => onJobFinished((j) => { if (j.kind === 'repair') load(); }), [onJobFinished]);
  const repair = async (name) => { const { job } = await api.post('/api/tools/repair', { name }); trackJob(job); };
  const allOk = tools?.every((t) => t.ok);
  return (
    <section className="glass strong panel stack" style={{ gap: 14 }}>
      <div className="row between">
        <h2>Tools</h2>
        {tools && <span className={`chip ${allOk ? 'ok' : 'warn'}`}><span className="dot" />{allOk ? 'Everything is ready' : 'Something needs attention'}</span>}
      </div>
      <p className="muted">These helpers do the work behind the scenes, all on this Mac.</p>
      <div className="stack" style={{ gap: 8 }}>
        {!tools && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
        {tools?.map((t) => (
          <div key={t.name} className="feed-item">
            <span className={`feed-icon ${t.ok ? 'ok' : 'warn'}`}><span className="dot" /></span>
            <div className="stack grow" style={{ gap: 0 }}>
              <strong>{t.title}</strong>
              <span className="muted small">{t.about}</span>
            </div>
            {t.ok ? <span className="chip ok"><span className="dot" />Online</span>
              : <button className="btn sm accent" onClick={() => repair(t.name.replace('python: ', ''))}>Repair</button>}
          </div>
        ))}
      </div>
      <button className="btn sm ghost" onClick={() => repair('yt-dlp')}>Update the YouTube downloader</button>
      <span className="hint">YouTube changes often. If downloads stop working, update the downloader.</span>
    </section>
  );
}

function ChannelPreview({ info }) {
  const subs = info.followers == null ? null : info.followers >= 1000 ? `${(info.followers / 1000).toFixed(info.followers >= 10000 ? 0 : 1)}K subscribers` : `${info.followers} subscribers`;
  return (
    <div className="yt-card">
      <div className="yt-banner" style={info.banner ? { backgroundImage: `url(${info.banner})` } : undefined} />
      <div className="yt-head">
        {info.avatar ? <img className="yt-avatar" src={info.avatar} alt="" /> : <span className="yt-avatar" />}
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <strong className="yt-name truncate">{info.name}</strong>
          <span className="muted small">{[info.handle, subs].filter(Boolean).join(' · ')}</span>
          {info.description && <span className="muted small yt-desc">{info.description}</span>}
        </div>
        <a className="btn sm" href={info.url} target="_blank" rel="noreferrer">Open on YouTube</a>
      </div>
      {info.videos?.length > 0 && (
        <div className="yt-videos">
          {info.videos.map((v) => (
            <a key={v.id} className="yt-video" href={v.url} target="_blank" rel="noreferrer">
              <span className="yt-thumb"><img src={v.thumb} alt="" loading="lazy" />{v.duration && <span className="yt-dur num">{fmt(v.duration)}</span>}</span>
              <span className="small truncate2">{v.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function YouTube() {
  const { config, saveConfig } = useApp();
  const [channel, setChannel] = useState(config.youtubeChannel);
  const [saved, setSaved] = useState(null);
  const [state, setState] = useState(null); // {busy} | {info} | {error}
  const look = async (save) => {
    setState({ busy: true });
    try {
      if (save) { await saveConfig({ youtubeChannel: channel.trim() }); setSaved(Date.now()); }
      const r = await api.get(`/api/youtube/channel-info?channel=${encodeURIComponent(channel.trim())}`);
      setState({ info: r.info });
      if (save) api.get('/api/youtube/channel?refresh=1').catch(() => {});
    } catch (e) { setState({ error: e.message }); }
  };
  useEffect(() => { if (config.youtubeChannel) look(false); }, []);
  return (
    <section className="glass strong panel stack">
      <h2>Your YouTube channel</h2>
      <p className="muted">Paste your church's channel link or handle.</p>
      <label className="field">Channel URL or handle
        <input className="input" value={channel} placeholder="https://www.youtube.com/@yourchurch or @yourchurch" onChange={(e) => setChannel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && channel.trim()) look(true); }} />
      </label>
      <div className="row">
        <button className="btn primary" onClick={() => look(true)} disabled={!channel.trim() || state?.busy}>{state?.busy ? 'Looking it up…' : 'Save & check'}</button>
        <Saved at={saved} />
      </div>
      {state?.busy && <div className="yt-card"><div className="skeleton" style={{ height: 180 }} /></div>}
      {state?.error && <div className="banner bad">{state.error}</div>}
      {state?.info && (
        <>
          <span className="small muted">Is this your channel? If not, check the link or handle above.</span>
          <ChannelPreview info={state.info} />
        </>
      )}
    </section>
  );
}

const PROVIDERS = [
  { id: 'none', name: 'Off', note: 'Offline scoring. Free, private, no key.', badge: 'Recommended' },
  { id: 'ollama', name: 'Ollama', note: 'Local model on this Mac. Free, no key.' },
  { id: 'anthropic', name: 'Claude', note: 'Anthropic API key.' },
  { id: 'openai', name: 'OpenAI', note: 'OpenAI API key.' },
  { id: 'gemini', name: 'Gemini', note: 'Google AI Studio key.' },
];

function SecretField({ guide, value, onSave }) {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState(null);
  return (
    <div className="keycard">
      <div className="row between">
        <h3>{guide.name}</h3>
        {value ? <span className="chip ok"><span className="dot" />Saved</span> : <span className="chip">Not set</span>}
      </div>
      <p className="muted small">{guide.purpose}</p>
      <ol className="small">{guide.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <div className="row">
        <input className="input mono" type="password" autoComplete="off" spellCheck={false} placeholder={value || 'Paste key'} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn primary" disabled={!draft.trim()} onClick={async () => { await onSave(draft.trim()); setDraft(''); setState('saved'); }}>Save</button>
        {value && <button className="btn ghost danger" onClick={async () => { await onSave(''); setState('removed'); }}>Remove</button>}
      </div>
      <div className="row between small">
        <button className="btn ghost sm" onClick={() => openLink(guide.link)}>Get a key ↗</button>
        <span className="muted">Saved on this Mac only{state ? ` · ${state}` : ''}</span>
      </div>
    </div>
  );
}

function AIKeys() {
  const { config, saveConfig, keyGuide } = useApp();
  const [test, setTest] = useState(null);
  const [models, setModels] = useState({ ollamaUrl: config.ollamaUrl, ollamaModel: config.ollamaModel, anthropicModel: config.anthropicModel, openaiModel: config.openaiModel, geminiModel: config.geminiModel });
  const p = config.llmProvider;
  const runTest = async () => {
    setTest({ busy: true });
    try {
      await saveConfig(models);
      const r = await api.post('/api/ai/test');
      setTest(r.ok ? { ok: true, msg: `Working. Sample title: “${r.sample}”` } : { ok: false, msg: r.error });
    } catch (e) { setTest({ ok: false, msg: e.message }); }
  };
  const modelField = { anthropic: 'anthropicModel', openai: 'openaiModel', gemini: 'geminiModel', ollama: 'ollamaModel' }[p];
  return (
    <>
      <section className="glass strong panel stack">
        <h2>AI helper (optional)</h2>
        <p className="muted">Off by default. When on, it reranks clips and writes titles.</p>
        <div className="provider-grid">
          {PROVIDERS.map((x) => (
            <div key={x.id} className={`provider ${p === x.id ? 'on' : ''}`} onClick={() => { setTest(null); saveConfig({ llmProvider: x.id }); }}>
              <div className="row between"><strong>{x.name}</strong>{x.badge && <span className="chip ok">{x.badge}</span>}</div>
              <span className="muted small">{x.note}</span>
            </div>
          ))}
        </div>
        {p === 'ollama' && (
          <div className="keycard">
            <h3>Ollama (local, free)</h3>
            <ol className="small">
              <li>Install Ollama from ollama.com and open it.</li>
              <li>Open Terminal and paste: <span className="mono">ollama pull {models.ollamaModel || 'qwen3:4b'}</span></li>
              <li>Press Save and test.</li>
            </ol>
            <div className="grid2">
              <label className="field">Server<input className="input mono" value={models.ollamaUrl} onChange={(e) => setModels({ ...models, ollamaUrl: e.target.value })} /></label>
              <label className="field">Model<input className="input mono" value={models.ollamaModel} onChange={(e) => setModels({ ...models, ollamaModel: e.target.value })} /></label>
            </div>
            <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => openLink('https://ollama.com/download')}>Download Ollama ↗</button>
          </div>
        )}
        {p !== 'none' && p !== 'ollama' && (
          <label className="field">Model <span className="hint">Leave as is unless you know you want a different one.</span>
            <input className="input" value={models[modelField] || ''} onChange={(e) => setModels({ ...models, [modelField]: e.target.value })} />
          </label>
        )}
        {p !== 'none' && (
          <div className="row">
            <button className="btn" onClick={runTest} disabled={test?.busy}>{test?.busy ? 'Testing…' : 'Save and test'}</button>
            {test && !test.busy && <span className={`chip ${test.ok ? 'ok' : 'bad'}`} style={{ height: 'auto', padding: '4px 10px' }}>{test.msg}</span>}
          </div>
        )}
      </section>
      {keyGuide.filter((g) => g.provider && g.provider === p).map((g) => (
        <section key={g.field} className="glass panel stack">
          <SecretField guide={g} value={config[g.field]} onSave={(v) => saveConfig({ [g.field]: v })} />
        </section>
      ))}
    </>
  );
}

const WHISPER = [
  ['base', 'Base (fastest, best for Intel Macs)'],
  ['small', 'Small (recommended on Apple Silicon)'],
  ['medium', 'Medium (more accurate)'],
  ['large-v3-turbo', 'Large (most accurate, slowest)'],
];

function ClipDefaults() {
  const { config, saveConfig } = useApp();
  const [v, setV] = useState({ whisperModel: config.whisperModel, clipCount: config.clipCount, clipMin: config.clipMin, clipMax: config.clipMax });
  const [saved, setSaved] = useState(null);
  return (
    <section className="glass strong panel stack">
      <h2>Transcription & clips</h2>
      <label className="field">Transcription model
        <select className="input" value={v.whisperModel} onChange={(e) => setV({ ...v, whisperModel: e.target.value })}>
          {WHISPER.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="grid2">
        <label className="field">Clips to propose<input className="input" type="number" min="1" max="30" value={v.clipCount} onChange={(e) => setV({ ...v, clipCount: e.target.value })} /></label>
        <div />
        <label className="field">Shortest clip (seconds)<input className="input" type="number" min="5" max="120" value={v.clipMin} onChange={(e) => setV({ ...v, clipMin: e.target.value })} /></label>
        <label className="field">Longest clip (seconds)<input className="input" type="number" min="10" max="180" value={v.clipMax} onChange={(e) => setV({ ...v, clipMax: e.target.value })} /></label>
      </div>
      <div className="row"><button className="btn primary" onClick={async () => { await saveConfig(v); setSaved(Date.now()); }}>Save</button><Saved at={saved} /></div>
    </section>
  );
}

const NAME_TOKENS = [
  ['{date}', 'Today, like 2026-11-18'],
  ['{title}', 'The clip title'],
  ['{sermon}', 'The sermon name'],
  ['{n}', 'Clip number, like 03'],
  ['{preset}', 'Where it goes, like vertical'],
];
function sampleName(pattern) {
  return (pattern || '{date} - {title}')
    .replaceAll('{date}', new Date().toISOString().slice(0, 10)).replaceAll('{title}', 'Grace you can’t earn')
    .replaceAll('{sermon}', 'Sunday Worship').replaceAll('{n}', '03').replaceAll('{preset}', 'vertical');
}

/** File-name field with clickable tokens, suggestions after typing "{", and a live example. */
export function NamePattern({ value, onChange }) {
  const ref = useRef(null);
  const [suggest, setSuggest] = useState(false);
  const insert = (tok) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start).replace(/\{[a-z]*$/, '');
    const next = before + tok + value.slice(end);
    onChange(next);
    setSuggest(false);
    requestAnimationFrame(() => { el?.focus(); const p = (before + tok).length; el?.setSelectionRange(p, p); });
  };
  return (
    <div className="stack" style={{ gap: 6, position: 'relative' }}>
      <input ref={ref} className="input" value={value} onChange={(e) => { onChange(e.target.value); setSuggest(/\{[a-z]*$/.test(e.target.value.slice(0, e.target.selectionStart))); }}
        onBlur={() => setTimeout(() => setSuggest(false), 150)} aria-label="File name pattern" />
      {suggest && (
        <div className="glass strong" style={{ position: 'absolute', top: 44, left: 0, zIndex: 10, padding: 6, display: 'grid', gap: 2, minWidth: 280 }}>
          {NAME_TOKENS.map(([t, d]) => (
            <button key={t} className="btn ghost sm" style={{ justifySelf: 'stretch', justifyContent: 'space-between' }} onMouseDown={(e) => { e.preventDefault(); insert(t); }}>
              <span className="mono">{t}</span><span className="muted small">{d}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row wrap" style={{ gap: 6 }}>
        {NAME_TOKENS.map(([t, d]) => <button key={t} className="chip accent" style={{ border: 0, cursor: 'pointer' }} title={d} onClick={() => insert(t)}>{t}</button>)}
      </div>
      <span className="hint">Example: <strong style={{ color: 'var(--ink)' }}>{sampleName(value)}.mp4</strong></span>
    </div>
  );
}

function ExportSettings() {
  const { config, saveConfig } = useApp();
  const [v, setV] = useState({ exportFolder: config.exportFolder, exportPattern: config.exportPattern });
  const [saved, setSaved] = useState(null);
  return (
    <section className="glass strong panel stack" style={{ gap: 14 }}>
      <h2>Exports</h2>
      <label className="field">Save exports to
        <div className="row">
          <input className="input" value={v.exportFolder} placeholder="Downloads" onChange={(e) => setV({ ...v, exportFolder: e.target.value })} />
          {desktop?.pickFolder && <button className="btn" onClick={async () => { const f = await desktop.pickFolder(); if (f) setV({ ...v, exportFolder: f }); }}>Choose…</button>}
        </div>
      </label>
      <div className="stack" style={{ gap: 6 }}>
        <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>File name</span>
        <NamePattern value={v.exportPattern} onChange={(x) => setV({ ...v, exportPattern: x })} />
      </div>
      <div className="row"><button className="btn primary" onClick={async () => { await saveConfig(v); setSaved(Date.now()); }}>Save changes</button><Saved at={saved} /></div>
    </section>
  );
}

const TOKEN_LABELS = [
  ['--bg', 'Background'], ['--bg-2', 'Background blend'], ['--ink', 'Text'], ['--accent', 'Main color (buttons)'], ['--accent-2', 'Highlight color'],
];
const hexToRgb = (hex) => { const h = hex.replace('#', ''); return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`; };
const rgbToHex = (rgb = '255, 255, 255') => `#${rgb.split(',').map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
const lum = (hex) => { const [r, g, b] = hexToRgb(hex).split(',').map((n) => { const c = Number(n) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const NEW_LIGHT = { name: 'My light theme', mode: 'light', tokens: { '--bg': '#F2F0EC', '--bg-2': '#EAF0F7', '--ink': '#16181F', '--accent': '#3D6BFF', '--accent-2': '#FF8A5B', '--glass-rgb': '255, 255, 255', '--radius': '20px', '--glass-blur': '18px', '--glass-tint': '0.55', '--font-sans': "-apple-system, 'SF Pro Text', system-ui, sans-serif", '--font-display': "'Avenir Next', -apple-system, system-ui, sans-serif" } };
const NEW_DARK = { name: 'My dark theme', mode: 'dark', tokens: { ...NEW_LIGHT.tokens, '--bg': '#10131F', '--bg-2': '#1B1530', '--ink': '#EEF0F8', '--accent': '#7C9BFF', '--accent-2': '#FFA37A', '--glass-rgb': '34, 39, 60' } };

function Swatch({ t, on, onClick }) {
  return (
    <button className={`swatch ${on ? 'on' : ''}`} style={{ background: `linear-gradient(135deg, ${t.tokens['--bg']}, ${t.tokens['--bg-2']})`, color: t.tokens['--ink'] }} onClick={onClick} aria-pressed={on}>
      <strong>{t.name}</strong>
      <div className="bars"><i style={{ background: t.tokens['--accent'] }} /><i style={{ background: t.tokens['--accent-2'] }} /><i style={{ background: `rgb(${t.tokens['--glass-rgb']})` }} /></div>
    </button>
  );
}

function AppTheme() {
  const { config, saveConfig, themes, reloadThemes, toast } = useApp();
  const [editing, setEditing] = useState(null); // a theme draft or null
  const light = themes.app.filter((t) => t.mode !== 'dark');
  const dark = themes.app.filter((t) => t.mode === 'dark');
  const restore = () => applyAppTheme(activeAppTheme(config, themes));
  const preview = (d) => applyAppTheme(d);
  const setToken = (k, v) => { const next = { ...editing, tokens: { ...editing.tokens, [k]: v } }; setEditing(next); preview(next); };
  const px = (k, d) => parseFloat(editing.tokens[k] ?? d);
  const start = (t, fresh) => { const d = structuredClone(fresh ? (t.mode === 'dark' ? NEW_DARK : NEW_LIGHT) : t); if (!fresh && t.builtin) { d.name = `${t.name} (mine)`; } setEditing(d); preview(d); };
  const save = async () => {
    const { theme } = await api.post('/api/themes/app', { ...editing, id: editing.builtin ? undefined : editing.id });
    await reloadThemes();
    await saveConfig(theme.mode === 'dark' ? { appThemeDark: theme.id } : { appTheme: theme.id });
    setEditing(null);
    toast({ text: `Saved “${theme.name}”.` });
  };
  const ratio = editing ? contrast(editing.tokens['--ink'], editing.tokens['--bg']) : 0;
  return (
    <>
      <section className="glass strong panel stack" style={{ gap: 16 }}>
        <h2>App theme</h2>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>Appearance</span>
          <div className="seg" role="radiogroup" aria-label="Appearance">
            {[['light', 'Light'], ['dark', 'Dark'], ['system', 'Match my Mac']].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={config.appearance === k} className={config.appearance === k ? 'on' : ''} onClick={() => saveConfig({ appearance: k })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="stack">
          <h3>Light theme</h3>
          <div className="theme-swatches">
            {light.map((t) => <Swatch key={t.id} t={t} on={t.id === config.appTheme} onClick={() => saveConfig({ appTheme: t.id, ...(config.appearance === 'dark' ? { appearance: 'light' } : {}) })} />)}
            <button className="swatch new" onClick={() => start({ mode: 'light' }, true)}><span className="row"><Plus size={16} />Create custom theme</span></button>
          </div>
        </div>
        <div className="stack">
          <h3>Dark theme</h3>
          <div className="theme-swatches">
            {dark.map((t) => <Swatch key={t.id} t={t} on={t.id === config.appThemeDark} onClick={() => saveConfig({ appThemeDark: t.id, ...(config.appearance === 'light' ? { appearance: 'dark' } : {}) })} />)}
            <button className="swatch new" onClick={() => start({ mode: 'dark' }, true)}><span className="row"><Plus size={16} />Create custom theme</span></button>
          </div>
        </div>
        <div className="row wrap">
          <button className="btn sm" onClick={() => start(activeAppTheme(config, themes), false)}>Edit the current theme</button>
          <label className="row small"><input type="checkbox" checked={config.refraction !== false} onChange={(e) => saveConfig({ refraction: e.target.checked })} /> Liquid refraction on glass panels</label>
        </div>
      </section>
      {editing && (
        <section className="glass panel stack" style={{ gap: 14 }}>
          <div className="row between"><h3>Custom theme</h3><span className="chip accent">{editing.mode === 'dark' ? 'Dark' : 'Light'} theme · previewing live</span></div>
          <label className="field">Name<input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
          <div className="token-grid">
            {TOKEN_LABELS.map(([k, label]) => (
              <ColorField key={k} label={label} value={editing.tokens[k]} onChange={(c) => setToken(k, c)} />
            ))}
            <ColorField label="Glass color" value={rgbToHex(editing.tokens['--glass-rgb'])} onChange={(c) => setToken('--glass-rgb', hexToRgb(c))} />
          </div>
          {ratio < 4.5 && <div className="banner bad"><AlertTriangle size={16} />Text on this background is hard to read (contrast {ratio.toFixed(1)}:1, aim for 4.5:1). Make the text or background lighter/darker.</div>}
          <div className="token-grid">
            <label className="field">Corner radius · {px('--radius', 20)}px<input type="range" min="8" max="32" value={px('--radius', 20)} onChange={(e) => setToken('--radius', `${e.target.value}px`)} /></label>
            <label className="field">Glass blur · {px('--glass-blur', 18)}px<input type="range" min="0" max="40" value={px('--glass-blur', 18)} onChange={(e) => setToken('--glass-blur', `${e.target.value}px`)} /></label>
            <label className="field">Glass strength · {Math.round(px('--glass-tint', 0.55) * 100)}%<input type="range" min="0.15" max="0.95" step="0.05" value={px('--glass-tint', 0.55)} onChange={(e) => setToken('--glass-tint', e.target.value)} /></label>
            <label className="field">Heading font
              <select className="input" value={editing.tokens['--font-display']} onChange={(e) => setToken('--font-display', e.target.value)}>
                <option value="'Avenir Next', -apple-system, system-ui, sans-serif">Avenir Next</option>
                <option value="'Montserrat', -apple-system, system-ui, sans-serif">Montserrat</option>
                <option value="-apple-system, system-ui, sans-serif">SF Pro (system)</option>
                <option value="Georgia, 'Times New Roman', serif">Georgia</option>
                <option value="Futura, -apple-system, sans-serif">Futura</option>
                <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica Neue</option>
              </select>
            </label>
          </div>
          <div className="row">
            <button className="btn primary" onClick={save}>Save theme</button>
            <button className="btn ghost" onClick={() => { setEditing(null); restore(); }}>Cancel</button>
          </div>
        </section>
      )}
    </>
  );
}

function VideoThemes() {
  const { config, saveConfig, themes } = useApp();
  return (
    <section className="glass strong panel stack">
      <div className="row between">
        <h2>Video themes</h2>
        <span className="muted small">Caption styles for your clips.</span>
      </div>
      <VideoThemeEditor
        selectedId={config.videoTheme}
        onPick={(id) => saveConfig({ videoTheme: id })}
        pickLabel="Default for new clips"
        themes={themes}
      />
    </section>
  );
}

/** Changelog markdown -> one card per version. */
function Changelog({ text, current }) {
  const parts = text.split(/^## /m).slice(1).map((chunk) => {
    const [head, ...rest] = chunk.split('\n');
    const [version, date] = head.split(' · ');
    return { version: version.trim(), date: date?.trim(), body: rest.join('\n').trim() };
  });
  return (
    <div className="changelog">
      {parts.map((p) => (
        <article key={p.version} className="cl-entry">
          <div className="cl-side">
            <span className="cl-version">{p.version}</span>
            {p.date && <span className="muted small">{p.date}</span>}
            {p.version === current && <span className="chip ok">You have this</span>}
          </div>
          <div className="prose cl-body" dangerouslySetInnerHTML={{ __html: mdToHtml(p.body.replace(/^### /gm, '### ')) }} />
        </article>
      ))}
    </div>
  );
}

function Updates() {
  const { config, saveConfig, trackJob, toast } = useApp();
  const [ver, setVer] = useState(null);
  const [check, setCheck] = useState(null);
  const [log, setLog] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get('/api/version').then((v) => { setVer(v); if (v.last) setCheck(v.last); });
    api.get('/api/changelog').then((r) => setLog(r.text));
  }, []);
  const run = async () => {
    setBusy(true);
    try { setCheck(await api.post('/api/updates/check')); saveConfig({ lastUpdateCheck: new Date().toISOString() }); } catch (e) { setCheck({ error: e.message }); }
    setBusy(false);
  };
  const download = async () => {
    try { const r = await api.post('/api/updates/download'); trackJob?.(r.job); toast({ text: 'Downloading the update. It opens when it is ready.' }); } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  return (
    <>
      <section className="glass strong panel stack" style={{ gap: 14 }}>
        <div className="row between wrap">
          <div className="stack" style={{ gap: 2 }}>
            <h2>Updates</h2>
            <span className="muted">You have Church Studio <strong className="num">{ver?.version || '…'}</strong>.</span>
          </div>
          <button className="btn primary" disabled={busy} onClick={run}><RefreshCw size={15} className={busy ? 'spin' : ''} />{busy ? 'Checking…' : 'Check for updates'}</button>
        </div>
        {check?.error && <div className="banner bad">{check.error}</div>}
        {check && !check.error && !check.available && <div className="banner info"><ShieldCheck size={16} />{check.message || 'You have the latest version.'}</div>}
        {check?.available && (
          <div className="update-card">
            <div className="row between wrap">
              <div className="stack" style={{ gap: 2 }}><span className="eyebrow">Update available</span><h3 style={{ margin: 0 }}>Church Studio {check.latest}</h3></div>
              <button className="btn primary" disabled={!check.asset} onClick={download}><Download size={15} />Download update</button>
            </div>
            {check.notes?.map((n) => (
              <div key={n.version} className="prose" dangerouslySetInnerHTML={{ __html: mdToHtml(n.notes) }} />
            ))}
            <span className="muted small">The download opens when it's done. Drag Church Studio into Applications and choose Replace. Your sermons, designs and settings stay as they are.</span>
          </div>
        )}
        <label className="switch"><input type="checkbox" checked={config.autoUpdateCheck !== false} onChange={(e) => saveConfig({ autoUpdateCheck: e.target.checked })} />Check once a day when the app opens</label>
        {ver?.upgrade?.upgraded && <span className="muted small"><Sparkles size={12} /> Updated from {ver.upgrade.from}. Your settings were backed up first.</span>}
      </section>
      <section className="glass panel stack" style={{ gap: 14 }}>
        <h2>What's new</h2>
        {log ? <Changelog text={log} current={ver?.version} /> : <div className="skeleton" style={{ height: 200 }} />}
      </section>
    </>
  );
}
