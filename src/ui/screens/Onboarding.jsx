import { useState } from 'react';
import { CalendarDays, Clapperboard, Globe, PenLine, Shapes } from 'lucide-react';
import { useApp } from '../App.jsx';
import { WebsiteSetup } from '../components/Jumpstart.jsx';

const STARTS = [
  ['library', 'Videos and clips', 'Turn Sunday’s sermon into captioned clips.', Clapperboard, 1],
  ['calendar', 'Calendar and posts', 'Plan posts and campaigns around church events.', CalendarDays, 2],
  ['writing', 'Writing', 'Blogs, emails and newsletters from the sermon.', PenLine, 3],
  ['graphics', 'Design', 'Graphics and slides with your brand already in them.', Shapes, 4],
];

/** First run, in three short steps: what this is, a quick jumpstart, and one place to start. */
export default function Onboarding() {
  const { config, saveConfig, go } = useApp();
  const [step, setStep] = useState(0);
  const [site, setSite] = useState(config.churchInfo?.website || '');
  const [channel, setChannel] = useState(config.youtubeChannel || '');
  const [jump, setJump] = useState(false);
  const saveBasics = async () => {
    const patch = {};
    if (site.trim()) patch.churchInfo = { ...(config.churchInfo || {}), website: site.trim() };
    if (channel.trim()) patch.youtubeChannel = channel.trim();
    if (Object.keys(patch).length) await saveConfig(patch);
  };
  const start = async (name) => { await saveConfig({ onboarded: true }); go({ name }); };
  return (
    <div className="scrim">
      <div className="glass strong modal stack" style={{ gap: 16, width: 'min(620px, calc(100vw - 32px))' }}>
        <div className="row" style={{ gap: 6 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--line-strong)' }} />)}
        </div>
        {step === 0 && (
          <>
            <span className="welcome-mark" aria-hidden="true">CS</span>
            <h1>Welcome to Church Studio.</h1>
            <p className="muted" style={{ fontSize: 15, margin: 0 }}>One place on this Mac for everything your church shares. Start with Sunday’s sermon and turn it into clips, posts, writing and graphics.</p>
            <span className="hint">No account. Works offline. Your files stay on this computer.</span>
          </>
        )}
        {step === 1 && (
          <>
            <h2>Make it yours in a minute</h2>
            <p className="muted" style={{ margin: 0 }}>Share your church website and Church Studio pulls in your logo, colors, fonts and details. You see it before anything is saved.</p>
            <label className="field">Church website<input className="input" autoFocus value={site} placeholder="yourchurch.org" onChange={(e) => setSite(e.target.value)} /></label>
            <label className="field">YouTube channel <span className="hint">Optional</span><input className="input" value={channel} placeholder="@yourchurch" onChange={(e) => setChannel(e.target.value)} /></label>
          </>
        )}
        {step === 2 && (
          <>
            <h2>Where would you like to start?</h2>
            <p className="muted" style={{ margin: 0 }}>Pick one. Each tool shows you around the first time you open it.</p>
            <div className="start-choices">
              {STARTS.map(([id, label, about, Icon, tone]) => (
                <button key={id} className="cn-card" onClick={() => start(id)}>
                  <span className={`cn-icon tone tone-${tone}`}><Icon size={18} /></span>
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}><strong className="small">{label}</strong><span className="muted" style={{ fontSize: 12 }}>{about}</span></span>
                </button>
              ))}
            </div>
            <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => start('home')}>Just show me around</button>
          </>
        )}
        <div className="row between" style={{ marginTop: 4 }}>
          {step > 0 ? <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <div className="row">
            {step === 0 && <button className="btn primary" onClick={() => setStep(1)}>Get started</button>}
            {step === 1 && (
              <>
                <button className="btn" onClick={async () => { await saveBasics(); setStep(2); }}>{site.trim() || channel.trim() ? 'Continue' : 'Skip'}</button>
                <button className="btn primary" disabled={!site.trim()} onClick={async () => { await saveBasics(); setJump(true); }}><Globe size={15} />Set up from my website</button>
              </>
            )}
          </div>
        </div>
      </div>
      {jump && <WebsiteSetup onClose={() => { setJump(false); setStep(2); }} stayHere />}
    </div>
  );
}
