import { useEffect, useState } from 'react';
import { CalendarDays, Check, ExternalLink, Heart, MessageSquareHeart, RefreshCw, Send, Star } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, openLink } from '../api.js';
import ToolPicker from '../components/ToolPicker.jsx';

// ---------------------------------------------------------------- your tools
export function YourTools() {
  const { config, saveConfig } = useApp();
  return (
    <>
    <section className="glass strong panel stack" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2>Your tools</h2>
        <p className="muted" style={{ margin: 0 }}>Turn off what you don't use and drag the rest into the order you like. The menu and dashboard follow along.</p>
      </div>
      <ToolPicker order={config.toolOrder} off={config.toolsOff} onChange={(v) => saveConfig({ toolOrder: v.order, toolsOff: v.off })} />
      <span className="hint">Turning a tool off only hides it. Nothing you made is deleted.</span>
    </section>
    <section className="glass panel stack" style={{ gap: 10 }}>
      <h3>Notifications</h3>
      <p className="muted small" style={{ margin: 0 }}>A Mac notification, only while Church Studio is in the background.</p>
      <label className="switch"><input type="checkbox" checked={config.notify?.jobs !== false} onChange={(e) => saveConfig({ notify: { ...config.notify, jobs: e.target.checked } })} />When a transcript, download or export finishes</label>
      <label className="switch"><input type="checkbox" checked={config.notify?.reminders !== false} onChange={(e) => saveConfig({ notify: { ...config.notify, reminders: e.target.checked } })} />When a post you share by hand is due</label>
    </section>
    </>
  );
}

// ---------------------------------------------------------------- app logo (Church info)
export function AppLogo() {
  const { config, saveConfig, logo, go } = useApp();
  const [logos, setLogos] = useState(null);
  useEffect(() => { api.get('/api/library').then((l) => setLogos(l.items.filter((i) => i.folder === 'Logos' && i.kind === 'image'))).catch(() => setLogos([])); }, []);
  return (
    <section className="glass panel stack" style={{ gap: 12 }}>
      <h3>Your logo in the app</h3>
      <p className="muted small" style={{ margin: 0 }}>Shows at the top of the menu and in the Dock, with a small CS badge in the corner.</p>
      {logos && !logos.length && <div className="row between wrap"><span className="small muted">Add your logo to Logos in the brand library first.</span><button className="btn sm" onClick={() => go({ name: 'assets' })}>Open brand library</button></div>}
      {logos?.length > 0 && (
        <div className="row wrap" style={{ gap: 8 }}>
          {logos.map((l) => (
            <button key={l.rel} className={`logo-pick ${logo?.rel === l.rel ? 'on' : ''}`} onClick={() => saveConfig({ appLogo: l.rel })} aria-label={l.name} title={l.name}>
              <img src={l.url} alt="" />{logo?.rel === l.rel && <Check size={13} className="logo-check" />}
            </button>
          ))}
        </div>
      )}
      <label className="switch"><input type="checkbox" checked={config.dockLogo !== false} onChange={(e) => saveConfig({ dockLogo: e.target.checked })} />Show my logo in the Dock</label>
    </section>
  );
}

// ---------------------------------------------------------------- connections
const PCO_STEPS = [
  ['Open Planning Center developer settings', 'https://api.planningcenteronline.com/oauth/applications'],
  ['Under Personal Access Tokens, choose Create one now', null],
  ['Name it Church Studio and press Submit', null],
  ['Copy the Application ID and the Secret into the boxes below', null],
];

export function Connections() {
  const { config, saveConfig, toast } = useApp();
  const [appId, setAppId] = useState(config.pcoAppId || '');
  const [secret, setSecret] = useState('');
  const [ical, setIcal] = useState(config.calendarIcal || '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [request, setRequest] = useState('');
  useEffect(() => { api.get('/api/calendar/events').then(setStatus).catch(() => {}); }, []);
  const saveAndTest = async (patch) => {
    setBusy(true);
    try {
      await saveConfig(patch);
      const r = await api.post('/api/calendar/refresh');
      setStatus(r);
      toast({ text: `Connected. Found ${r.events.length} upcoming event${r.events.length === 1 ? '' : 's'}.` });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  const sendRequest = async () => {
    try {
      const r = await api.post('/api/feedback', { kind: 'connection', text: request });
      if (r.url) openLink(r.url);
      else toast({ text: 'Thanks. Your request was sent.' });
      setRequest('');
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const pcoOn = Boolean(config.pcoAppId && config.pcoSecret);
  return (
    <>
      <section className="glass strong panel stack" style={{ gap: 14 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2>Church calendar</h2>
          <p className="muted" style={{ margin: 0 }}>Bring in your events to see them next to your social posts and to make quick graphics. We check once a week, on Monday mornings, and you can refresh anytime.</p>
        </div>
        {status?.fetched && (
          <div className="keycard row between wrap">
            <span className="row small"><CalendarDays size={15} />{status.events.length} upcoming events from {status.source}. Updated {new Date(status.fetched).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}.</span>
            <button className="btn sm" disabled={busy} onClick={() => saveAndTest({})}><RefreshCw size={13} className={busy ? 'spin' : ''} />Refresh now</button>
          </div>
        )}
      </section>

      <section className="glass panel stack" style={{ gap: 12 }}>
        <div className="row between"><h3>Planning Center</h3>{pcoOn && <span className="chip ok"><Check size={12} />Connected</span>}</div>
        <ol className="steps-list small">
          {PCO_STEPS.map(([t, link], k) => <li key={k}>{link ? <button className="linkish" onClick={() => openLink(link)}>{t}<ExternalLink size={12} /></button> : t}</li>)}
        </ol>
        <div className="token-grid">
          <label className="field">Application ID<input className="input mono" value={appId} onChange={(e) => setAppId(e.target.value.trim())} autoComplete="off" /></label>
          <label className="field">Secret<input className="input mono" type="password" value={secret} placeholder={pcoOn ? 'Saved. Paste a new one to change it.' : ''} onChange={(e) => setSecret(e.target.value.trim())} autoComplete="off" /></label>
        </div>
        <label className="switch"><input type="checkbox" checked={config.calendarPublicOnly !== false} onChange={(e) => saveConfig({ calendarPublicOnly: e.target.checked })} />Only events shown in Church Center</label>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary sm" disabled={busy || !appId || (!secret && !pcoOn)} onClick={() => saveAndTest({ pcoAppId: appId, ...(secret ? { pcoSecret: secret } : {}) })}>{busy ? 'Checking…' : pcoOn ? 'Save and check' : 'Connect'}</button>
          {pcoOn && <button className="btn ghost sm" onClick={() => { saveConfig({ pcoAppId: '', pcoSecret: '' }); setAppId(''); setSecret(''); }}>Disconnect</button>}
        </div>
        <span className="hint">Church Studio only reads your calendar. The token stays on this Mac.</span>
      </section>

      <section className="glass panel stack" style={{ gap: 12 }}>
        <div className="row between"><h3>Any calendar link</h3>{config.calendarIcal && <span className="chip ok"><Check size={12} />Connected</span>}</div>
        <p className="muted small" style={{ margin: 0 }}>Works with Subsplash, Tithe.ly, Google Calendar, Outlook and most church software. Look for a link called iCal, ICS or Subscribe.</p>
        <div className="row wrap small" style={{ gap: 12 }}>
          <button className="linkish" onClick={() => openLink('https://support.tithe.ly/hc/en-us/articles/31815197173271')}>Tithe.ly: find your iCal link<ExternalLink size={12} /></button>
          <button className="linkish" onClick={() => openLink('https://support.subsplash.com/s/article/How-do-I-add-an-iCal-feed-to-my-app')}>Subsplash: calendar feeds<ExternalLink size={12} /></button>
          <button className="linkish" onClick={() => openLink('https://support.google.com/calendar/answer/37648')}>Google Calendar: secret address<ExternalLink size={12} /></button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" value={ical} placeholder="https://… .ics" onChange={(e) => setIcal(e.target.value.trim())} aria-label="Calendar link" />
          <button className="btn sm" disabled={busy || !/^(https?|webcal):\/\//i.test(ical)} onClick={() => saveAndTest({ calendarIcal: ical })}>Connect</button>
          {config.calendarIcal && <button className="btn ghost sm" onClick={() => { saveConfig({ calendarIcal: '' }); setIcal(''); }}>Remove</button>}
        </div>
      </section>

      <section className="glass panel stack" style={{ gap: 10 }}>
        <h3>Use something different?</h3>
        <p className="muted small" style={{ margin: 0 }}>Tell us which church software you use and we'll look at adding it.</p>
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" value={request} placeholder="Like Breeze, Rock RMS or Pushpay" onChange={(e) => setRequest(e.target.value)} aria-label="Church software name" />
          <button className="btn sm" disabled={!request.trim()} onClick={sendRequest}><Send size={13} />Request it</button>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- feedback
export function Feedback() {
  const { toast } = useApp();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const send = async () => {
    try {
      const r = await api.post('/api/feedback', { kind: 'feedback', stars, text, name });
      if (r.url) openLink(r.url);
      setSent(true);
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  if (sent) return <section className="glass strong panel stack"><h2>Thank you.</h2><p className="muted">Every note helps make Church Studio better for churches.</p><button className="btn sm" onClick={() => { setSent(false); setStars(0); setText(''); }}>Send another</button></section>;
  return (
    <section className="glass strong panel stack" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2>Send feedback</h2>
        <p className="muted" style={{ margin: 0 }}>What's working? What would help your church? No account needed.</p>
      </div>
      <div className="row" style={{ gap: 4 }} role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="star-btn" onMouseEnter={() => setHover(n)} onClick={() => setStars(n)}>
            <Star size={26} fill={(hover || stars) >= n ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us anything" aria-label="Your feedback" />
      <label className="field">Your name or church <span className="hint">Optional</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button className="btn primary" disabled={!stars && !text.trim()} onClick={send}><MessageSquareHeart size={15} />Send feedback</button>
    </section>
  );
}

// ---------------------------------------------------------------- thank you (credits)
const CREDITS = [
  ['Electron', 'The app window and Mac features.', 'MIT', 'https://www.electronjs.org'],
  ['React', 'Every screen you see.', 'MIT', 'https://react.dev'],
  ['Vite', 'Builds the screens.', 'MIT', 'https://vite.dev'],
  ['FFmpeg', 'Cuts, joins, encodes and cleans up audio and video.', 'LGPL / GPL', 'https://ffmpeg.org'],
  ['faster-whisper', 'Fast, private transcription.', 'MIT', 'https://github.com/SYSTRAN/faster-whisper'],
  ['Whisper', 'The speech recognition model.', 'MIT', 'https://github.com/openai/whisper'],
  ['OpenCV', 'Finds the speaker for the crop.', 'Apache 2.0', 'https://opencv.org'],
  ['NumPy', 'The math behind the crop.', 'BSD', 'https://numpy.org'],
  ['Pillow', 'Draws the captions.', 'MIT-CMU', 'https://python-pillow.org'],
  ['Lucide', 'The icons.', 'ISC', 'https://lucide.dev'],
  ['jsPDF', 'PDF export for designs.', 'MIT', 'https://github.com/parallax/jsPDF'],
  ['PptxGenJS', 'PowerPoint export for slides.', 'MIT', 'https://gitbrent.github.io/PptxGenJS'],
  ['node-qrcode', 'QR codes on graphics.', 'MIT', 'https://github.com/soldair/node-qrcode'],
  ['Anthropic SDK', 'The optional Claude helper.', 'MIT', 'https://github.com/anthropics/anthropic-sdk-typescript'],
  ['Montserrat', 'The default typeface.', 'SIL OFL 1.1', 'https://github.com/JulietaUla/Montserrat'],
  ['Caveat', 'The CS mark.', 'SIL OFL 1.1', 'https://github.com/googlefonts/caveat'],
];
const IDEAS = [
  ['clipsmith', 'Offline clip scoring and word timing.'],
  ['AI-Youtube-Shorts-Generator', 'The speaker-following crop.'],
  ['LightPost', 'Safe storage for social logins and a posting queue.'],
  ['cohesive-colors', 'Blending colors so they work together.'],
  ['claude-blog', 'Writing that never invents facts.'],
  ['DeckCraft', 'Slide deck features.'],
];

export function Credits() {
  return (
    <>
      <section className="glass strong panel stack" style={{ gap: 6 }}>
        <span className="welcome-mark" aria-hidden="true">Thank you</span>
        <p className="muted" style={{ margin: 0 }}>Church Studio stands on the work of generous open-source communities. These projects ask to be credited, and we're glad to.</p>
      </section>
      <div className="credit-grid">
        {CREDITS.map(([name, what, license, url], k) => (
          <button key={name} className="glass credit" onClick={() => openLink(url)}>
            <span className="type-badge" style={{ width: 32, height: 32, '--t': `var(--tone-${(k % 6) + 1})` }}><Heart size={15} /></span>
            <strong>{name}</strong>
            <span className="small muted">{what}</span>
            <span className="chip">{license}</span>
          </button>
        ))}
      </div>
      <section className="glass panel stack" style={{ gap: 8 }}>
        <h3>Ideas we learned from</h3>
        <p className="muted small" style={{ margin: 0 }}>Patterns adapted from these MIT, BSD and Apache projects.</p>
        <div className="row wrap" style={{ gap: 6 }}>{IDEAS.map(([n, w]) => <span key={n} className="chip" title={w}>{n}</span>)}</div>
      </section>
    </>
  );
}
