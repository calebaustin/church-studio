import { useEffect, useState } from 'react';
import { CalendarDays, Check, Coffee, ExternalLink, Heart, MessageSquareHeart, RefreshCw, Send, Star } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, openLink } from '../api.js';
import ToolPicker from '../components/ToolPicker.jsx';

// ---------------------------------------------------------------- your tools
export function YourTools() {
  const { config, saveConfig, go } = useApp();
  return (
    <>
    <section className="glass strong panel stack" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2>Your tools</h2>
        <p className="muted" style={{ margin: 0 }}>Turn off what you don't use and drag the rest into the order you like. The menu and dashboard follow along.</p>
      </div>
      <ToolPicker order={config.toolOrder} off={config.toolsOff} onChange={(v) => saveConfig({ toolOrder: v.order, toolsOff: v.off })} />
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="hint">Turning a tool off only hides it. Nothing you made is deleted.</span>
        <button className="btn sm ghost" onClick={async () => { await saveConfig({ onboarded: false }); go({ name: 'home' }); }}>Welcome walkthrough</button>
      </div>
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
const GUIDES = [
  ['Planning Center', 'In Calendar, open Share or Subscribe and copy the iCal feed link. Choose public times only if you like.', 'https://help.planningcenter.com/en/share-events-with-personal-calendars.html'],
  ['Church Center', 'On your Church Center calendar page, open Subscribe and copy the link.', 'https://www.planningcenter.com/changelog/church-center/29674420892827-improved-calendar-feed-for-all-your-events'],
  ['Subsplash', 'Use the public iCal link of the calendar your app shows.', 'https://support.subsplash.com/s/article/How-do-I-add-an-iCal-feed-to-my-app'],
  ['Tithe.ly', 'Calendar Integration, then Export to External Calendar, then copy the iCal link.', 'https://support.tithe.ly/hc/en-us/articles/31815197173271'],
  ['Google Calendar', 'Settings for the calendar, then copy the Public or Secret address in iCal format.', 'https://support.google.com/calendar/answer/37648'],
];

export function Connections() {
  const { config, saveConfig, toast } = useApp();
  const feeds = config.calendarFeeds?.length ? config.calendarFeeds : config.calendarIcal ? [{ id: 'cal', name: 'Church calendar', url: config.calendarIcal }] : [];
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [request, setRequest] = useState('');
  useEffect(() => { api.get('/api/calendar/events').then(setStatus).catch(() => {}); }, []);
  const refresh = async (list) => {
    setBusy(true);
    try {
      if (list) await saveConfig({ calendarFeeds: list, calendarIcal: '' });
      const r = await api.post('/api/calendar/refresh');
      setStatus(r);
      toast({ text: r.problems?.length ? r.problems.join(' ') : `Found ${r.events.length} upcoming event${r.events.length === 1 ? '' : 's'}.`, kind: r.problems?.length ? 'error' : undefined });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  const add = async () => {
    const u = url.trim();
    await refresh([...feeds, { id: Math.random().toString(36).slice(2, 8), name: name.trim() || 'Church calendar', url: u }]);
    setName(''); setUrl('');
  };
  const remove = async (id) => {
    const list = feeds.filter((f) => f.id !== id);
    await saveConfig({ calendarFeeds: list, calendarIcal: '' });
    if (list.length) refresh(); else setStatus(null);
  };
  const sendRequest = async () => {
    try {
      const r = await api.post('/api/feedback', { kind: 'connection', text: request });
      if (r.url) openLink(r.url);
      else toast({ text: 'Thanks. Your request was sent.' });
      setRequest('');
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  return (
    <>
      <section className="glass strong panel stack" style={{ gap: 14 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2>Church calendar</h2>
          <p className="muted" style={{ margin: 0 }}>Add your calendar's iCal link to see events next to your social posts and make quick graphics. We check once a week, on Monday mornings, and you can refresh anytime.</p>
        </div>
        {feeds.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            {feeds.map((f) => (
              <div key={f.id} className="tool-row">
                <span className="type-badge" style={{ width: 30, height: 30 }}><CalendarDays size={15} /></span>
                <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="small">{f.name}</strong><span className="small muted truncate">{f.url}</span></div>
                <button className="btn ghost sm" onClick={() => remove(f.id)}>Remove</button>
              </div>
            ))}
            <div className="row between wrap" style={{ gap: 8 }}>
              <span className="small muted">{status?.fetched ? `${status.events.length} upcoming events. Updated ${new Date(status.fetched).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}.` : 'Not checked yet.'}</span>
              <button className="btn sm" disabled={busy} onClick={() => refresh()}><RefreshCw size={13} className={busy ? 'spin' : ''} />Refresh now</button>
            </div>
          </div>
        )}
        <div className="token-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)' }}>
          <label className="field">Name<input className="input" value={name} placeholder="Church calendar" onChange={(e) => setName(e.target.value)} /></label>
          <label className="field">iCal link<input className="input" value={url} placeholder="https://… or webcal://…" onChange={(e) => setUrl(e.target.value)} /></label>
        </div>
        <button className="btn primary sm" disabled={busy || !/^(https?|webcal):\/\//i.test(url.trim())} onClick={add}>{busy ? 'Checking…' : 'Add calendar'}</button>
        <span className="hint">Church Studio only reads the calendar. The link stays on this Mac.</span>
      </section>

      <section className="glass panel stack" style={{ gap: 10 }}>
        <h3>Where to find your iCal link</h3>
        <div className="stack" style={{ gap: 8 }}>
          {GUIDES.map(([n, how, link]) => (
            <div key={n} className="stack" style={{ gap: 1 }}>
              <button className="linkish" onClick={() => openLink(link)}>{n}<ExternalLink size={12} /></button>
              <span className="small muted">{how}</span>
            </div>
          ))}
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
      <div className="thanks-top">
        <section className="glass strong panel stack" style={{ gap: 6 }}>
          <span className="welcome-mark" aria-hidden="true">Thank you</span>
          <p className="muted" style={{ margin: 0 }}>Church Studio stands on the work of generous open-source communities. These projects ask to be credited, and we're glad to.</p>
        </section>
        <section className="glass panel stack support-card">
          <strong>Has this tool been helpful to you?</strong>
          <span className="small muted">Consider supporting future development. Church Studio is free to use, forever.</span>
          <button className="btn coffee" onClick={() => openLink('https://buymeacoffee.com/calebaustinm')}><Coffee size={15} />Buy me a coffee</button>
        </section>
      </div>
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
