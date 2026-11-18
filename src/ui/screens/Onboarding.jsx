import { useState } from 'react';
import { useApp } from '../App.jsx';
import { TOOLS } from '../tools.js';
import ToolPicker from '../components/ToolPicker.jsx';

/** First run: what this app does, which kinds of work they do, and their channel. */
export default function Onboarding() {
  const { config, saveConfig, go } = useApp();
  const [step, setStep] = useState(0);
  const [tools, setTools] = useState({ order: config.toolOrder || [], off: config.toolsOff || [] });
  const [channel, setChannel] = useState(config.youtubeChannel || '');
  const wantsChannel = !tools.off.includes('library');
  const steps = ['welcome', 'work', ...(wantsChannel ? ['channel'] : []), 'ai'];
  const at = steps[step];
  const finish = async (section) => {
    await saveConfig({ onboarded: true, toolOrder: tools.order, toolsOff: tools.off, ...(channel.trim() ? { youtubeChannel: channel.trim() } : {}) });
    if (section) go({ name: 'settings', section });
  };
  const last = step === steps.length - 1;
  return (
    <div className="scrim">
      <div className="glass strong modal stack" style={{ gap: 16, width: 'min(680px, calc(100vw - 32px))' }}>
        <div className="row" style={{ gap: 6 }}>
          {steps.map((k, i) => <span key={k} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--line-strong)' }} />)}
        </div>
        {at === 'welcome' && (
          <>
            <span className="welcome-mark" aria-hidden="true">CS</span>
            <h1>Welcome to Church Studio.</h1>
            <p className="muted" style={{ fontSize: 15, margin: 0 }}>Everything your church shares, made in one place on this Mac. Start with Sunday's sermon and turn it into clips, posts, guides and slides.</p>
            <div className="welcome-grid">
              {TOOLS.filter((t) => t.id !== 'projects').map((t, k) => (
                <div key={t.id}>
                  <span className="type-badge" style={{ width: 30, height: 30, '--t': `var(--tone-${(k % 6) + 1})` }}><t.icon size={15} /></span>
                  <strong className="small">{t.work}</strong>
                  <span className="small muted">{t.about}</span>
                </div>
              ))}
            </div>
            <span className="hint">No account. Works offline. Your files never leave this computer.</span>
          </>
        )}
        {at === 'work' && (
          <>
            <h2>What kinds of work do you do?</h2>
            <p className="muted" style={{ margin: 0 }}>Turn off what you don't need. The menu and dashboard will only show what you use.</p>
            <ToolPicker order={tools.order} off={tools.off} onChange={setTools} reorder={false} />
            <span className="hint">You can change this anytime in Settings, under Your tools.</span>
          </>
        )}
        {at === 'channel' && (
          <>
            <h2>Connect your YouTube channel</h2>
            <p className="muted" style={{ margin: 0 }}>Your services will be one click away. You can also open a recording from this Mac anytime.</p>
            <label className="field">Channel URL or handle
              <input className="input" autoFocus value={channel} placeholder="@yourchurch" onChange={(e) => setChannel(e.target.value)} />
            </label>
          </>
        )}
        {at === 'ai' && (
          <>
            <h2>Optional: an AI helper</h2>
            <p className="muted" style={{ margin: 0 }}>Everything works without one. You can add one later to help pick clips and write drafts.</p>
            <div className="keycard small">
              <strong>Where keys are stored</strong>
              <span className="muted">On this Mac only, in <span className="mono">config.local.json</span>.</span>
            </div>
          </>
        )}
        <div className="row between" style={{ marginTop: 8 }}>
          {step > 0 ? <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <div className="row">
            {last && <button className="btn" onClick={() => finish('ai')}>Set up AI helper</button>}
            {!last
              ? <button className="btn primary" disabled={at === 'work' && tools.off.length >= TOOLS.length} onClick={() => setStep(step + 1)}>{at === 'welcome' ? 'Get started' : at === 'channel' && !channel.trim() ? 'Skip' : 'Continue'}</button>
              : <button className="btn primary" onClick={() => finish(null)}>Start without AI</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
