import { useEffect, useState } from 'react';
import { useApp, applyAppTheme } from '../App.jsx';
import { api, desktop, openLink } from '../api.js';
import VideoThemeEditor from '../components/VideoThemeEditor.jsx';

const SECTIONS = [
  ['start', 'Start here'],
  ['youtube', 'YouTube channel'],
  ['ai', 'AI helper & keys'],
  ['clips', 'Transcription & clips'],
  ['export', 'Export'],
  ['app-theme', 'App theme'],
  ['video-themes', 'Video themes'],
];

export default function Settings({ section: initial }) {
  const [section, setSection] = useState(initial || 'start');
  return (
    <div className="page settings">
      <nav className="glass">
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={section === id ? 'on' : ''} onClick={() => setSection(id)}>{label}</button>
        ))}
      </nav>
      <div className="stack" style={{ gap: 18 }}>
        {section === 'start' && <StartHere go={setSection} />}
        {section === 'youtube' && <YouTube />}
        {section === 'ai' && <AIKeys />}
        {section === 'clips' && <ClipDefaults />}
        {section === 'export' && <ExportSettings />}
        {section === 'app-theme' && <AppTheme />}
        {section === 'video-themes' && <VideoThemes />}
      </div>
    </div>
  );
}

function Saved({ at }) {
  if (!at) return null;
  return <span className="chip ok"><span className="dot" />Saved to config.local.json</span>;
}

function StartHere({ go }) {
  const [tools, setTools] = useState(null);
  const { config } = useApp();
  useEffect(() => { api.get('/api/tools').then((r) => setTools(r.tools)); }, []);
  const ready = tools?.every((t) => t.ok);
  return (
    <>
      <section className="glass strong panel stack">
        <h2>Welcome to Sermon Clips</h2>
        <p className="muted">Everything runs on this Mac. No account, no login, and <b>no API keys are needed</b> —
          downloading, transcription (Whisper), clip picking, auto-centering and captions all work offline.
          Keys are only for the optional AI helper.</p>
        <div className="row wrap" style={{ marginTop: 6 }}>
          <span className={`chip ${config.youtubeChannel ? 'ok' : 'warn'}`}><span className="dot" />{config.youtubeChannel ? 'Channel connected' : 'Add your channel'}</span>
          <span className={`chip ${ready ? 'ok' : 'warn'}`}><span className="dot" />{tools ? (ready ? 'Tools ready' : 'Setup needed') : 'Checking tools…'}</span>
          <span className="chip accent">AI helper: {config.llmProvider === 'none' ? 'off (offline scoring)' : config.llmProvider}</span>
        </div>
        <div className="row wrap" style={{ marginTop: 6 }}>
          {!config.youtubeChannel && <button className="btn primary" onClick={() => go('youtube')}>Add your YouTube channel</button>}
          <button className="btn" onClick={() => go('ai')}>Optional: AI helper</button>
        </div>
      </section>
      <section className="glass panel stack">
        <h3>Local tools</h3>
        <p className="muted small">If anything is missing, run <span className="mono">scripts/setup.sh</span> once in Terminal.</p>
        <div>
          {!tools && <p className="muted">Checking…</p>}
          {tools?.map((t) => (
            <div key={t.name} className="tool-row">
              <span style={{ color: t.ok ? 'var(--ok)' : 'var(--bad)' }}>{t.ok ? '✓' : '✕'}</span>
              <strong>{t.name}</strong>
              <span className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.ok ? t.version : t.error}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function YouTube() {
  const { config, saveConfig } = useApp();
  const [channel, setChannel] = useState(config.youtubeChannel);
  const [saved, setSaved] = useState(null);
  const [test, setTest] = useState(null);
  const save = async () => { await saveConfig({ youtubeChannel: channel.trim() }); setSaved(Date.now()); };
  const check = async () => {
    setTest({ busy: true });
    try {
      await save();
      const r = await api.get('/api/youtube/channel?refresh=1');
      setTest({ ok: true, n: r.items.length, first: r.items[0]?.title });
    } catch (e) { setTest({ ok: false, error: e.message }); }
  };
  return (
    <section className="glass strong panel stack">
      <h2>Your YouTube channel</h2>
      <p className="muted">Paste your church's channel. The app lists recent uploads and past livestreams with yt-dlp — no Google sign-in.</p>
      <label className="field">Channel URL or handle
        <input className="input" value={channel} placeholder="https://www.youtube.com/@yourchurch or @yourchurch" onChange={(e) => setChannel(e.target.value)} />
      </label>
      <div className="row">
        <button className="btn primary" onClick={check} disabled={!channel.trim() || test?.busy}>{test?.busy ? 'Checking…' : 'Save & check'}</button>
        <Saved at={saved} />
      </div>
      {test && !test.busy && (test.ok
        ? <div className="banner info">Found {test.n} videos{test.first ? ` — latest: “${test.first}”` : ''}.</div>
        : <div className="banner">{test.error}</div>)}
      <p className="muted small">Optional: a YouTube Data API key (under “AI helper & keys”) is stored for richer listings later. It isn't required.</p>
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
        <span className="muted">Stored only in <span className="mono">config.local.json</span> on this Mac{state ? ` · ${state}` : ''}</span>
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
      setTest(r.ok ? { ok: true, msg: `Works — sample title: “${r.sample}”` } : { ok: false, msg: r.error });
    } catch (e) { setTest({ ok: false, msg: e.message }); }
  };
  const modelField = { anthropic: 'anthropicModel', openai: 'openaiModel', gemini: 'geminiModel', ollama: 'ollamaModel' }[p];
  return (
    <>
      <section className="glass strong panel stack">
        <h2>AI helper (optional)</h2>
        <p className="muted">Clips are always found by offline scoring first. If you turn on a helper, it only re-ranks those
          candidates and writes titles, hooks and captions. If it fails, the offline picks are kept.</p>
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
              <li>In Terminal run <span className="mono">ollama pull {models.ollamaModel || 'qwen3:4b'}</span>.</li>
              <li>Press Test below.</li>
            </ol>
            <div className="grid2">
              <label className="field">Server<input className="input mono" value={models.ollamaUrl} onChange={(e) => setModels({ ...models, ollamaUrl: e.target.value })} /></label>
              <label className="field">Model<input className="input mono" value={models.ollamaModel} onChange={(e) => setModels({ ...models, ollamaModel: e.target.value })} /></label>
            </div>
            <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => openLink('https://ollama.com/download')}>Download Ollama ↗</button>
          </div>
        )}
        {p !== 'none' && p !== 'ollama' && (
          <label className="field">Model
            <input className="input mono" value={models[modelField] || ''} onChange={(e) => setModels({ ...models, [modelField]: e.target.value })} />
          </label>
        )}
        {p !== 'none' && (
          <div className="row">
            <button className="btn" onClick={runTest} disabled={test?.busy}>{test?.busy ? 'Testing…' : 'Save & test'}</button>
            {test && !test.busy && <span className={`chip ${test.ok ? 'ok' : 'bad'}`} style={{ height: 'auto', padding: '4px 10px' }}>{test.msg}</span>}
          </div>
        )}
      </section>
      <section className="glass panel stack">
        <h3>API keys</h3>
        <p className="muted small">Only needed for the provider you picked. Never sent anywhere except that provider.</p>
        {keyGuide.map((g) => (
          <SecretField key={g.field} guide={g} value={config[g.field]} onSave={(v) => saveConfig({ [g.field]: v })} />
        ))}
      </section>
    </>
  );
}

const WHISPER = [
  ['base', 'Base — fastest, rough'],
  ['small', 'Small — good balance (default)'],
  ['medium', 'Medium — more accurate, slower'],
  ['large-v3-turbo', 'Large v3 Turbo — best, needs time'],
];

function ClipDefaults() {
  const { config, saveConfig } = useApp();
  const [v, setV] = useState({ whisperModel: config.whisperModel, clipCount: config.clipCount, clipMin: config.clipMin, clipMax: config.clipMax });
  const [saved, setSaved] = useState(null);
  return (
    <section className="glass strong panel stack">
      <h2>Transcription & clips</h2>
      <label className="field">Whisper model <span className="hint">Downloaded once, then runs offline. Bigger is more accurate and slower.</span>
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

function ExportSettings() {
  const { config, saveConfig } = useApp();
  const [v, setV] = useState({ exportFolder: config.exportFolder, exportPattern: config.exportPattern });
  const [saved, setSaved] = useState(null);
  return (
    <section className="glass strong panel stack">
      <h2>Export</h2>
      <p className="muted">Every export is 1080 × 1920 (9:16) H.264 with burned-in captions.</p>
      <label className="field">Export folder <span className="hint">Leave empty to keep exports inside each project folder.</span>
        <div className="row">
          <input className="input mono" value={v.exportFolder} placeholder="(project folder)" onChange={(e) => setV({ ...v, exportFolder: e.target.value })} />
          {desktop?.pickFolder && <button className="btn" onClick={async () => { const f = await desktop.pickFolder(); if (f) setV({ ...v, exportFolder: f }); }}>Choose…</button>}
        </div>
      </label>
      <label className="field">File name <span className="hint">Use {'{date}'}, {'{title}'}, {'{sermon}'}, {'{n}'}</span>
        <input className="input mono" value={v.exportPattern} onChange={(e) => setV({ ...v, exportPattern: e.target.value })} />
      </label>
      <div className="row"><button className="btn primary" onClick={async () => { await saveConfig(v); setSaved(Date.now()); }}>Save</button><Saved at={saved} /></div>
    </section>
  );
}

const TOKEN_LABELS = [
  ['--bg', 'Background', 'color'], ['--bg-2', 'Background 2', 'color'], ['--text', 'Text', 'color'], ['--muted', 'Muted text', 'color'],
  ['--accent', 'Accent', 'color'], ['--accent-2', 'Accent 2', 'color'],
];

function AppTheme() {
  const { config, saveConfig, themes, reloadThemes } = useApp();
  const current = themes.app.find((t) => t.id === config.appTheme) || themes.app[0];
  const [draft, setDraft] = useState(() => structuredClone(current));
  useEffect(() => { setDraft(structuredClone(current)); }, [current?.id]);
  const setToken = (k, val) => {
    const next = { ...draft, tokens: { ...draft.tokens, [k]: val } };
    setDraft(next);
    applyAppTheme(next);
  };
  const px = (k, d) => parseFloat(draft.tokens[k] ?? d);
  const save = async (asNew) => {
    const body = { ...draft, id: asNew ? undefined : draft.id, name: asNew ? `${draft.name} copy` : draft.name };
    const { theme } = await api.post('/api/themes/app', body);
    await reloadThemes();
    await saveConfig({ appTheme: theme.id });
  };
  return (
    <>
      <section className="glass strong panel stack">
        <h2>App theme</h2>
        <div className="theme-swatches">
          {themes.app.map((t) => (
            <div key={t.id} className={`swatch ${t.id === config.appTheme ? 'on' : ''}`} style={{ background: `linear-gradient(135deg, ${t.tokens['--bg']}, ${t.tokens['--bg-2']})`, color: t.tokens['--text'] }}
              onClick={() => saveConfig({ appTheme: t.id })}>
              <strong>{t.name}</strong>
              <div className="bars"><i style={{ background: t.tokens['--accent'] }} /><i style={{ background: t.tokens['--accent-2'] }} /><i style={{ background: t.tokens['--muted'] }} /></div>
            </div>
          ))}
        </div>
        <label className="row small"><input type="checkbox" checked={config.refraction !== false} onChange={(e) => saveConfig({ refraction: e.target.checked })} /> Liquid refraction on glass panels</label>
      </section>
      <section className="glass panel stack">
        <div className="row between"><h3>Edit “{draft.name}”</h3>{draft.builtin && <span className="chip">Built-in — saving makes a copy</span>}</div>
        <label className="field">Name<input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <div className="token-grid">
          {TOKEN_LABELS.map(([k, label]) => (
            <label key={k} className="row small"><input type="color" value={draft.tokens[k]} onChange={(e) => setToken(k, e.target.value)} />{label}</label>
          ))}
          <label className="field">Corner radius · {px('--radius', 22)}px<input type="range" min="8" max="32" value={px('--radius', 22)} onChange={(e) => setToken('--radius', `${e.target.value}px`)} /></label>
          <label className="field">Glass blur · {px('--glass-blur', 18)}px<input type="range" min="0" max="40" value={px('--glass-blur', 18)} onChange={(e) => setToken('--glass-blur', `${e.target.value}px`)} /></label>
          <label className="field">Glass tint · {px('--glass-tint', 0.55).toFixed(2)}<input type="range" min="0.1" max="0.9" step="0.05" value={px('--glass-tint', 0.55)} onChange={(e) => setToken('--glass-tint', e.target.value)} /></label>
          <label className="field">Display font
            <select className="input" value={draft.tokens['--font-display']} onChange={(e) => setToken('--font-display', e.target.value)}>
              <option value="'Avenir Next', -apple-system, system-ui, sans-serif">Avenir Next</option>
              <option value="-apple-system, system-ui, sans-serif">SF Pro (system)</option>
              <option value="Georgia, 'Times New Roman', serif">Georgia</option>
              <option value="Futura, -apple-system, sans-serif">Futura</option>
              <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica Neue</option>
            </select>
          </label>
        </div>
        <div className="row">
          {!draft.builtin && <button className="btn primary" onClick={() => save(false)}>Save</button>}
          <button className={`btn ${draft.builtin ? 'primary' : ''}`} onClick={() => save(true)}>Save as new theme</button>
          <button className="btn ghost" onClick={() => { setDraft(structuredClone(current)); applyAppTheme(current); }}>Reset</button>
        </div>
      </section>
    </>
  );
}

function VideoThemes() {
  const { config, saveConfig, themes } = useApp();
  return (
    <section className="glass strong panel stack">
      <div className="row between">
        <h2>Video themes</h2>
        <span className="muted small">Caption looks burned into exports. Pick one per clip or project.</span>
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
