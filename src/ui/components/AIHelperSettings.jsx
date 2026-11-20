// Settings › AI helper. Four choices, local first:
//   Off · Apple Intelligence (built into the Mac) · CS Helper (a local model just for Church Studio) · External AI.
// Everything works with Off. The helpers only make tools smarter and add the helper chat.
import { useEffect, useState } from 'react';
import { Apple, Check, Cloud, Cpu, Download, PowerOff, Trash2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, openLink } from '../api.js';
import Modal, { ModalHead } from './Modal.jsx';

const EXTERNAL = [
  { id: 'anthropic', name: 'Claude', by: 'Anthropic', note: 'Needs an Anthropic API key. You pay Anthropic for what you use.' },
  { id: 'openai', name: 'ChatGPT', by: 'OpenAI', note: 'Needs an OpenAI API key. You pay OpenAI for what you use.' },
  { id: 'gemini', name: 'Gemini', by: 'Google', note: 'Needs a Google AI Studio key. Free up to a limit, then paid.' },
  { id: 'ollama', name: 'Ollama', by: 'Your own server', note: 'For people who already run Ollama. Needs the Ollama app running.' },
];
const gb = (b) => `${(b / 1e9).toFixed(1)} GB`;

export function SecretField({ guide, value, onSave }) {
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

export default function AIHelperSettings() {
  const { config, saveConfig, keyGuide, jobs, trackJob, onJobFinished, toast } = useApp();
  const [local, setLocal] = useState(null);
  const [pickExternal, setPickExternal] = useState(false);
  const [test, setTest] = useState(null);
  const p = config.llmProvider || 'none';
  const external = EXTERNAL.some((x) => x.id === p);
  const load = () => api.get('/api/ai/local').then(setLocal).catch(() => setLocal({ apple: { available: false, reason: 'Could not check.' }, cshelper: {} }));
  useEffect(() => { load(); }, []);
  useEffect(() => onJobFinished((j) => { if (j.kind === 'cshelper') { load(); if (j.status === 'done') { saveConfig({ llmProvider: 'cshelper' }); toast({ celebrate: true, text: 'CS Helper is ready and turned on.' }); } } }), [onJobFinished]);
  const dl = jobs.find((j) => j.kind === 'cshelper' && (j.status === 'running' || j.status === 'queued'));
  const apple = local?.apple; const cs = local?.cshelper || {};

  const choose = (id) => { setTest(null); saveConfig({ llmProvider: id }); };
  const download = async () => { const r = await api.post('/api/ai/cshelper/download'); trackJob(r.job); };
  const remove = async () => { await api.del('/api/ai/cshelper'); if (p === 'cshelper') await saveConfig({ llmProvider: 'none' }); load(); toast({ text: 'CS Helper removed from this Mac.' }); };
  const runTest = async () => {
    setTest({ busy: true });
    try { const r = await api.post('/api/ai/test'); setTest(r.ok ? { ok: true, msg: `Working. Sample title: “${r.sample}”` } : { ok: false, msg: r.error }); } catch (e) { setTest({ ok: false, msg: e.message }); }
  };

  return (
    <>
      <section className="glass strong panel stack">
        <div className="stack" style={{ gap: 2 }}>
          <h2>AI helper</h2>
          <p className="muted">Optional. Everything in Church Studio works with it off. Turn one on and clips, writing and designs get smarter, and a helper chat appears in the corner that knows your church.</p>
        </div>
        <div className="ai-choices">
          <button className={`ai-choice ${p === 'none' ? 'on' : ''}`} onClick={() => choose('none')}>
            <span className="cn-icon tone tone-6"><PowerOff size={17} /></span>
            <span className="stack" style={{ gap: 2 }}><strong>Off</strong><span className="muted small">Church Studio works on its own, fully offline.</span></span>
            {p === 'none' && <Check size={16} className="ai-check" />}
          </button>

          <button className={`ai-choice ${p === 'apple' ? 'on' : ''}`} disabled={apple && !apple.available} onClick={() => choose('apple')}>
            <span className="cn-icon tone tone-1"><Apple size={17} /></span>
            <span className="stack" style={{ gap: 2 }}>
              <strong>Apple Intelligence <span className="chip ok" style={{ marginLeft: 4 }}>Recommended</span></strong>
              <span className="muted small">No download needed. Uses the AI built into your Mac, privately, on this Mac.</span>
              {apple && !apple.available && <span className="small" style={{ color: 'var(--warn)' }}>{apple.reason}</span>}
            </span>
            {p === 'apple' && <Check size={16} className="ai-check" />}
          </button>

          <div className={`ai-choice ${p === 'cshelper' ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => cs.ready && choose('cshelper')} onKeyDown={(e) => e.key === 'Enter' && cs.ready && choose('cshelper')} aria-disabled={!cs.ready}>
            <span className="cn-icon tone tone-2"><Cpu size={17} /></span>
            <span className="stack" style={{ gap: 6 }}>
              <span className="stack" style={{ gap: 2 }}>
                <strong>CS Helper</strong>
                <span className="muted small">Download your own AI that works and thinks only inside Church Studio. It learns your church from what's here: your calendar, sermons, voice and brand. No internet needed once it's downloaded.</span>
              </span>
              {!cs.ready && !dl && (
                <span className="row wrap" style={{ gap: 8 }}>
                  <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); download(); }} disabled={!cs.engine && cs.engine !== undefined}><Download size={14} />Download ({gb(cs.bytes || 2.0e9)})</button>
                  {cs.engine === false && <span className="small muted">Needs the next Church Studio update to run.</span>}
                </span>
              )}
              {dl && <span className="stack" style={{ gap: 4 }}><span className="meter"><i style={{ width: `${dl.progress || 0}%` }} /></span><span className="small muted">{dl.message}</span></span>}
              {cs.model && <button className="btn sm ghost danger" onClick={(e) => { e.stopPropagation(); remove(); }}><Trash2 size={14} />Remove from this Mac</button>}
              <span className="tiny muted">Built with Llama. Uses Meta's Llama 3.2 3B under the <button className="linklike" onClick={(e) => { e.stopPropagation(); openLink(cs.license); }}>Llama 3.2 Community License</button> and <button className="linklike" onClick={(e) => { e.stopPropagation(); openLink(cs.policy); }}>use policy</button>. Downloading it means you agree to them.</span>
            </span>
            {p === 'cshelper' && <Check size={16} className="ai-check" />}
          </div>

          <button className={`ai-choice ${external ? 'on' : ''}`} onClick={() => setPickExternal(true)}>
            <span className="cn-icon tone tone-3"><Cloud size={17} /></span>
            <span className="stack" style={{ gap: 2 }}>
              <strong>External AI{external ? `: ${EXTERNAL.find((x) => x.id === p).name}` : ''}</strong>
              <span className="muted small">Claude, ChatGPT or Gemini. Works only when you're online, and needs your own account with them, which may cost money.</span>
            </span>
            {external && <Check size={16} className="ai-check" />}
          </button>
        </div>
        {p !== 'none' && (
          <div className="row">
            <button className="btn" onClick={runTest} disabled={test?.busy}>{test?.busy ? 'Testing…' : 'Test it'}</button>
            {test && !test.busy && <span className={`chip ${test.ok ? 'ok' : 'bad'}`} style={{ height: 'auto', padding: '4px 10px' }}>{test.msg}</span>}
          </div>
        )}
      </section>

      {external && <ExternalSetup provider={p} />}
      {external && keyGuide.filter((g) => g.provider && g.provider === p).map((g) => (
        <section key={g.field} className="glass panel stack">
          <SecretField guide={g} value={config[g.field]} onSave={(v) => saveConfig({ [g.field]: v })} />
        </section>
      ))}

      {pickExternal && (
        <Modal label="External AI" width={560} onClose={() => setPickExternal(false)}>
          <ModalHead title="Connect an External AI" sub="These run on the company's computers, not your Mac." />
          <div className="ai-warn small">They only work while you're online, and they need your own account with that company. Most charge for what you use or need a paid plan. Your church's details are sent to them when you use the helper.</div>
          <div className="stack" style={{ gap: 8 }}>
            {EXTERNAL.map((x) => (
              <button key={x.id} className={`ai-choice ${p === x.id ? 'on' : ''}`} onClick={() => { choose(x.id); setPickExternal(false); }}>
                <span className="stack" style={{ gap: 2 }}><strong>{x.name} <span className="muted small">· {x.by}</span></strong><span className="muted small">{x.note}</span></span>
                {p === x.id && <Check size={16} className="ai-check" />}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function ExternalSetup({ provider }) {
  const { config, saveConfig } = useApp();
  const field = { anthropic: 'anthropicModel', openai: 'openaiModel', gemini: 'geminiModel', ollama: 'ollamaModel' }[provider];
  const [v, setV] = useState({ ollamaUrl: config.ollamaUrl, [field]: config[field] });
  const save = () => saveConfig(v);
  return (
    <section className="glass panel stack">
      {provider === 'ollama' && (
        <>
          <h3>Ollama</h3>
          <ol className="small">
            <li>Install Ollama from ollama.com and open it.</li>
            <li>Open Terminal and paste: <span className="mono">ollama pull {v[field] || 'qwen3:4b'}</span></li>
            <li>Press Save, then Test it.</li>
          </ol>
          <label className="field">Server<input className="input mono" value={v.ollamaUrl || ''} onChange={(e) => setV({ ...v, ollamaUrl: e.target.value })} /></label>
        </>
      )}
      <label className="field">Model <span className="hint">Leave as is unless you know you want a different one.</span>
        <input className="input" value={v[field] || ''} onChange={(e) => setV({ ...v, [field]: e.target.value })} />
      </label>
      <button className="btn" onClick={save}>Save</button>
    </section>
  );
}
