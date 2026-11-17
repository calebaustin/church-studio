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
      <p className="muted" style={{ fontSize: 15 }}>Pick a sermon from your YouTube channel. Sermon Clips transcribes it, finds the sermon inside
        the service, proposes short moments worth sharing, and exports each one as a vertical video with live captions
        and a camera that follows the speaker.</p>
      <div className="stack small">
        <div className="row"><span className="chip ok">✓</span>No account or login</div>
        <div className="row"><span className="chip ok">✓</span>No API keys needed — it works fully offline</div>
        <div className="row"><span className="chip ok">✓</span>Your videos never leave this computer</div>
      </div>
    </>,
    <>
      <h2>Connect your channel</h2>
      <p className="muted">Paste your church's YouTube channel so the app can list your services and sermons. This only reads public
        videos — no Google sign-in.</p>
      <label className="field">Channel URL or handle
        <input className="input" autoFocus value={channel} placeholder="@yourchurch" onChange={(e) => setChannel(e.target.value)} />
      </label>
      <p className="muted small">You can also skip this and paste single video links or open files from your Mac.</p>
    </>,
    <>
      <h2>Optional: an AI helper</h2>
      <p className="muted">Clip picking runs on offline rules tuned for preaching (stories, application, quotable lines, scripture).
        If you'd like, an AI can re-rank those picks and write titles — using a free local model (Ollama) or your own key
        for Claude, OpenAI or Gemini.</p>
      <div className="keycard small">
        <strong>Where keys are stored</strong>
        <span className="muted">In <span className="mono">config.local.json</span> in the app folder on this Mac. It's never uploaded or committed.
          Each key card in Settings shows step-by-step how to get the key and a Test button.</span>
      </div>
    </>,
  ];
  return (
    <div className="scrim">
      <div className="glass strong modal stack" style={{ gap: 16 }}>
        <div className="row" style={{ gap: 6 }}>
          {steps.map((_, i) => <span key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'rgba(20,24,33,.1)' }} />)}
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
