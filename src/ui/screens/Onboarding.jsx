import { useState } from 'react';
import { useApp } from '../App.jsx';

/** First-run walkthrough: what's local, where settings live, and that keys are optional. */
export default function Onboarding() {
  const { config, saveConfig, go } = useApp();
  const [step, setStep] = useState(0);
  const [channel, setChannel] = useState(config.youtubeChannel || '');
  const finish = async (section) => {
    await saveConfig({ onboarded: true, ...(channel.trim() ? { youtubeChannel: channel.trim() } : {}) });
    if (section) go({ name: 'settings', section });
  };
  const steps = [
    <>
      <h1>Sermon clips, made on this Mac.</h1>
      <p className="muted" style={{ fontSize: 15 }}>Pick a service, get captioned vertical clips of the best moments.</p>
      <div className="stack small">
        <div className="row"><span className="chip ok">✓</span>No account or login</div>
        <div className="row"><span className="chip ok">✓</span>Works offline, no keys</div>
        <div className="row"><span className="chip ok">✓</span>Your videos never leave this computer</div>
      </div>
    </>,
    <>
      <h2>Connect your channel</h2>
      <p className="muted">Your services will be one click away.</p>
      <label className="field">Channel URL or handle
        <input className="input" autoFocus value={channel} placeholder="@yourchurch" onChange={(e) => setChannel(e.target.value)} />
      </label>

    </>,
    <>
      <h2>Optional: an AI helper</h2>
      <p className="muted">Clips are picked offline. You can add an AI helper later to rerank them and write titles.</p>
      <div className="keycard small">
        <strong>Where keys are stored</strong>
        <span className="muted">On this Mac only, in <span className="mono">config.local.json</span>.</span>
      </div>
    </>,
  ];
  return (
    <div className="scrim">
      <div className="glass strong modal stack" style={{ gap: 16 }}>
        <div className="row" style={{ gap: 6 }}>
          {steps.map((_, i) => <span key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--line-strong)' }} />)}
        </div>
        {steps[step]}
        <div className="row between" style={{ marginTop: 8 }}>
          {step > 0 ? <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <div className="row">
            {step === 2 && <button className="btn" onClick={() => finish('ai')}>Set up AI helper</button>}
            {step < 2
              ? <button className="btn primary" onClick={() => setStep(step + 1)}>{step === 1 && !channel.trim() ? 'Skip' : 'Continue'}</button>
              : <button className="btn primary" onClick={() => finish(null)}>Start without AI</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
