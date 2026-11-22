import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Settings as SettingsIcon, HardDrive, LayoutDashboard, MonitorPlay, UserRound, Search } from 'lucide-react';
import { enabledTools, isOn } from './tools.js';
import SideCards from './components/SideCards.jsx';
import { maybeNote } from './encourage.js';
import NextSteps from './components/NextSteps.jsx';
import NotificationsWallet, { NotificationsButton } from './components/Notifications.jsx';
import { api, fmt as fmtClock } from './api.js';
import Library from './screens/Library.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Writing from './screens/Writing.jsx';
import AllProjects from './screens/AllProjects.jsx';
import Graphics from './screens/Graphics.jsx';
import BrandLibrary from './screens/BrandLibrary.jsx';
import CalendarScreen from './screens/CalendarScreen.jsx';
import SearchPalette from './components/SearchPalette.jsx';
import MyApp from './screens/MyApp.jsx';
import Project from './screens/Project.jsx';
import Settings from './screens/Settings.jsx';
import Social from './screens/Social.jsx';
import Onboarding from './screens/Onboarding.jsx';
import JobsTray from './components/JobsTray.jsx';
import { Toasts } from './components/Toasts.jsx';
import Modal from './components/Modal.jsx';
import UpdateReady from './components/UpdateReady.jsx';
import HelperBubble from './components/HelperBubble.jsx';

// Where the background color sits on each screen. It glides between spots as you move around.
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

/**
 * Tell the helper chat what this page is working on, and how to use a suggestion here.
 * focus: { kind: 'design'|'clip'|'project'|'writing'|'campaign', id, clipId, part, selectedText }.
 * apply(field, value): put a picked suggestion on the page; return false if it can't.
 */
export function useHelperFocus(focus, apply) {
  const { setHelperFocus } = useApp();
  const applyRef = useRef(apply); applyRef.current = apply;
  const key = focus ? JSON.stringify(focus) : '';
  useEffect(() => {
    if (!focus) return undefined;
    setHelperFocus(focus, (f, v) => (applyRef.current ? applyRef.current(f, v) : false));
    return () => setHelperFocus(null, null);
  }, [key]);
}

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Apply an app theme's base tokens; the stylesheet derives the rest. */
export function applyAppTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.tokens || {})) root.style.setProperty(k, v);
  root.dataset.mode = theme.mode === 'dark' ? 'dark' : 'light';
}

/** Which theme is showing right now, given the appearance setting. */
export function activeAppTheme(config, themes) {
  const dark = config.appearance === 'dark' || (config.appearance !== 'light' && systemDark());
  const id = dark ? config.appThemeDark : config.appTheme;
  const fallback = themes.app.find((t) => t.mode === (dark ? 'dark' : 'light')) || themes.app[0];
  return themes.app.find((t) => t.id === id) || fallback;
}

/** The church's logo for the sidebar: the one picked in Settings, else the first in Logos. */
export function useChurchLogo(config) {
  const [logo, setLogo] = useState(null);
  useEffect(() => {
    if (!config) return;
    api.get('/api/library').then((l) => {
      const logos = l.items.filter((i) => i.folder === 'Logos' && i.kind === 'image');
      setLogo(logos.find((i) => i.rel === config.appLogo) || logos[0] || null);
    }).catch(() => setLogo(null));
  }, [config?.appLogo, config == null]);
  return logo;
}

export default function App() {
  const [route, setRoute] = useState({ name: 'home' });
  const [searching, setSearching] = useState(false);
  // ⌘K (Ctrl+K) opens search from anywhere.
  useEffect(() => {
    const key = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching((v) => !v); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const [config, setConfig] = useState(null);
  const [keyGuide, setKeyGuide] = useState([]);
  const [themes, setThemes] = useState({ app: [], video: [], fonts: [], systemFonts: [] });
  const [jobs, setJobs] = useState([]);
  const jobsRef = useRef([]);
  jobsRef.current = jobs;
  const [toasts, setToasts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [wallet, setWallet] = useState(false);
  const [needsYou, setNeedsYou] = useState(0);
  const [error, setError] = useState(null);
  const [, setSchemeTick] = useState(0);
  const listeners = useRef(new Set());
  // Unsaved-changes guard: a screen registers { dirty(), save(), discard() }; leaving asks first.
  const guard = useRef(null);
  const [leaveAsk, setLeaveAsk] = useState(null);
  const [nextInfo, showNext] = useState(null); // the "What's next?" page after finishing something
  const setGuard = useCallback((g) => { guard.current = g; }, []);
  const confirmLeave = useCallback(() => new Promise((resolve) => {
    if (!guard.current?.dirty()) return resolve(true);
    setLeaveAsk({ resolve });
  }), []);
  const go = useCallback(async (r) => { if (await confirmLeave()) setRoute(r); }, [confirmLeave]);
  const lastStatus = useRef(new Map());
  // The menu bar panel asks for a screen here.
  useEffect(() => window.desktop?.onGo?.((r) => { if (r?.name) go(r); }), [go]);

  const reloadConfig = useCallback(async () => {
    const r = await api.get('/api/config');
    setConfig(r.config);
    setKeyGuide(r.keyGuide);
    return r.config;
  }, []);
  const reloadThemes = useCallback(async () => {
    const t = await api.get('/api/themes');
    setThemes(t);
    return t;
  }, []);

  useEffect(() => {
    Promise.all([reloadConfig(), reloadThemes()]).catch((e) => setError(e.message));
  }, [reloadConfig, reloadThemes]);

  // Follow the system light/dark switch live when appearance = system.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => setSchemeTick((n) => n + 1);
    mq?.addEventListener('change', on);
    return () => mq?.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    if (config && themes.app.length) applyAppTheme(activeAppTheme(config, themes));
  });

  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    // Good moments (an export, a post, a finished draft) sometimes carry a word of encouragement.
    const note = t.celebrate ? maybeNote(t.kind === 'export' ? 0.6 : 0.34) : null;
    setToasts((ts) => [...ts.slice(-3), { id, ...t, ...(note ? { note } : {}) }]);
    // Keep a short history of only the big things someone might have missed: finished exports, downloads
    // and transcripts, failed work, updates, and "working locally" banners (marked keep: true).
    const text = t.kind === 'export' ? `Clip exported: ${t.result?.title || 'your clip'}` : t.text;
    if (text && (t.keep || t.kind === 'export')) setNotes((ns) => [{ id, text, kind: t.kind, at: Date.now(), action: t.action || (t.kind === 'export' && t.result?.file ? { label: 'Show in Finder', run: () => api.post('/api/reveal', { path: t.result.file }) } : null), read: false }, ...ns].slice(0, 30));
    return id;
  }, []);
  const dismissToast = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  // AI status: "Working with Claude", or "Working locally" (no helper, or it ran out of usage).
  const [ai, setAi] = useState(null);
  const seenNotice = useRef(null);
  useEffect(() => {
    let live = true;
    const poll = () => api.get('/api/ai-status').then((st) => {
      if (!live) return;
      setAi(st);
      if (st.notice && seenNotice.current !== null && st.notice.id !== seenNotice.current) toast({ text: st.notice.text, keep: true });
      seenNotice.current = st.notice?.id ?? 0;
    }).catch(() => {});
    poll();
    const id = setInterval(() => { if (!document.hidden) poll(); }, 60000);
    const off = (() => { listeners.current.add(poll); return () => listeners.current.delete(poll); })();
    return () => { live = false; clearInterval(id); off(); };
  }, [config?.llmProvider, toast]);

  // Once a day: is there a newer version? Quiet unless there is.
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!config || config.autoUpdateCheck === false) return;
    const last = config.lastUpdateCheck ? Date.parse(config.lastUpdateCheck) : 0;
    if (Date.now() - last < 20 * 3600_000) return;
    api.post('/api/updates/check').then((r) => {
      api.put('/api/config', { lastUpdateCheck: new Date().toISOString() }).catch(() => {});
      if (r.available) {
        setUpdate(r);
        toast({ keep: true, text: `Church Studio ${r.latest} is ready to download.`, action: { label: 'See what\'s new', run: () => setRoute({ name: 'settings', section: 'updates' }) } });
      }
    }).catch(() => {});
  }, [config == null]);

  // Job polling: fast while something runs. Finished jobs notify subscribers once.
  useEffect(() => {
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        const { jobs: list } = await api.get('/api/jobs');
        if (stop) return;
        setJobs(list);
        for (const j of list) {
          const prev = lastStatus.current.get(j.id);
          if (prev && prev !== j.status && ['done', 'error', 'cancelled'].includes(j.status)) {
            listeners.current.forEach((fn) => fn(j));
          }
          lastStatus.current.set(j.id, j.status);
        }
        const busy = list.some((j) => j.status === 'running' || j.status === 'queued');
        timer = setTimeout(tick, busy ? 900 : 3500);
      } catch {
        timer = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  // Social posts that need a hand-off show as a badge on the nav.
  const seenDue = useRef(new Set());
  useEffect(() => {
    const load = () => api.get('/api/social/posts').then((r) => {
      const due = r.posts.filter((p) => p.status === 'needs-you');
      setNeedsYou(due.length);
      // A post you post by hand just came due: one reminder per post.
      for (const p of due) {
        if (seenDue.current.has(p.id)) continue;
        if (seenDue.current.size) notify('reminders', 'A post is ready for you', p.title || p.caption?.slice(0, 80) || 'Open Social to post it.');
        seenDue.current.add(p.id);
      }
      if (!seenDue.current.size) seenDue.current.add('_');
    }).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [route.name]);

  const onJobFinished = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  // Mac notifications: only when Church Studio isn't the app in front, and only for long work.
  const notify = useCallback((kind, title, body) => {
    if (!window.desktop?.notify || document.hasFocus()) return;
    if (configRef.current?.notify?.[kind] === false) return;
    window.desktop.notify({ title, body });
  }, []);
  const configRef = useRef(config); configRef.current = config;
  useEffect(() => onJobFinished((j) => {
    const done = j.status === 'done';
    const names = { 'export-joined': 'Joined video saved', transcribe: 'Transcript ready', download: 'Download finished', import: 'Recording added', export: 'Clip exported', 'clean-audio': 'Clean audio saved', update: 'Update downloaded' };
    if (done && names[j.kind]) notify('jobs', names[j.kind], j.label.replace(/^[^:]+:\s*/, ''));
    if (j.status === 'error' && names[j.kind]) notify('jobs', `${j.label} didn't finish`, (j.error || '').slice(0, 120));
  }), [onJobFinished, notify]);

  // Celebrate finished exports; report failures plainly.
  useEffect(() => onJobFinished((j) => {
    if (j.kind === 'export' && j.status === 'done') {
      toast({ kind: 'export', result: j.result, sticky: true, celebrate: true });
      // When the last export of a batch is done, suggest what to make next.
      const r = j.result || {};
      const busy = jobsRef.current.some((x) => x.kind === 'export' && x.id !== j.id && (x.status === 'running' || x.status === 'queued'));
      if (!busy) showNext({ kind: 'clip', projectId: r.projectId, clipId: r.clipId, title: r.title, thumb: r.thumb, quote: r.hook || r.title });
    }
    if (j.status === 'done' && (j.kind === 'download' || j.kind === 'import') && j.result?.projectId) {
      const r = j.result;
      const what = r.range ? `Sermon downloaded (${fmtClock(r.range.start)} to ${fmtClock(r.range.end)})` : j.kind === 'import' ? (r.height ? 'Video added' : 'Recording added') : 'Video downloaded';
      toast({ keep: true, text: `${what}. ${r.summary || ''}`.trim(), duration: 9000, action: { label: 'Open', run: () => setRoute({ name: 'project', id: r.projectId }) } });
    }
    if (j.status === 'done' && j.kind === 'export-joined') toast({ keep: true, celebrate: true, text: `Joined ${j.result?.clips || ''} clips into one video.`, duration: 9000, action: { label: 'Show', run: () => api.post('/api/reveal', { path: j.result?.file }) } });
    if (j.status === 'done' && j.kind === 'transcribe') toast({ keep: true, text: `Transcribed ${j.result?.words?.toLocaleString() || ''} words. Check the sermon range next.`, duration: 7000 });
    if (j.status === 'error' && ['export', 'export-joined', 'download', 'transcribe'].includes(j.kind)) toast({ keep: true, kind: 'error', text: `${j.label} didn't finish: ${j.error?.slice(0, 160)}`, duration: 9000 });
  }), [onJobFinished, toast]);

  // What the helper chat is looking at (set by the open editor), and how to use a suggestion there.
  const [helperFocus, setHelperFocusState] = useState(null);
  const helperApply = useRef(null);
  const setHelperFocus = useCallback((f, apply) => { setHelperFocusState(f); helperApply.current = apply || null; }, []);
  // Which page an AI helper is working on right now ('design', 'writing', 'clip'), for the working wave.
  const [aiWorking, setAiWorking] = useState(null);
  // Open the helper with a question from another screen: askHelper('today' | 'tips').
  const [helperAsk, setHelperAsk] = useState(null);
  const askHelper = useCallback((kind) => setHelperAsk({ kind, at: Date.now() }), []);

  // A downloaded update: ask, big and clear, to quit and replace the app.
  const [updateReady, setUpdateReady] = useState(null);
  useEffect(() => onJobFinished((j) => {
    if (j.kind !== 'update' || j.status !== 'done') return;
    const info = j.result || {};
    setUpdateReady(info);
    setNotes((ns) => [{ id: `upd${Date.now()}`, text: `Church Studio ${info.version || ''} is downloaded and ready to install.`, kind: 'update', at: Date.now(), action: { label: 'How to install', run: () => setUpdateReady(info) }, read: false }, ...ns].slice(0, 30));
  }), [onJobFinished]);

  const trackJob = useCallback((job) => {
    if (!job) return;
    lastStatus.current.set(job.id, job.status);
    setJobs((js) => [job, ...js.filter((j) => j.id !== job.id)]);
  }, []);

  const saveConfig = useCallback(async (patch) => {
    const r = await api.put('/api/config', patch);
    setConfig(r.config);
    return r.config;
  }, []);

  // Their church, front and center: logo in the sidebar.
  const [logoTick, setLogoTick] = useState(0);
  const logo = useChurchLogo(config ? { ...config, _t: logoTick } : null);

  const value = { route, go, showNext, logo, refreshLogo: () => setLogoTick((n) => n + 1), setGuard, confirmLeave, config, saveConfig, reloadConfig, keyGuide, themes, reloadThemes, jobs, trackJob, onJobFinished, toast, helperFocus, setHelperFocus, helperApply, ai, aiWorking, setAiWorking, helperAsk, askHelper };

  if (error) {
    return (
      <div className="app"><div className="backdrop" />
        <div className="main" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="glass strong panel stack" style={{ maxWidth: 520 }}>
            <h2>The local engine isn't answering</h2>
            <p className="muted">{error}</p>
            <p className="muted small">Quit Church Studio and open it again. If you run it from Terminal, use <span className="mono">npm start</span>.</p>
          </div>
        </div>
      </div>
    );
  }

  const nav = [
    ['home', 'Dashboard', LayoutDashboard, route.name === 'home'],
    ...(config ? enabledTools(config) : []).map((t) => [t.id, t.label, t.icon, route.name === t.id || (t.id === 'library' && route.name === 'project' && route.step !== 'plan') || (t.id === 'projects' && route.name === 'project' && route.step === 'plan') || (t.id === 'calendar' && route.name === 'inspiration')]),
  ];
  const bottomNav = [
    ['me', 'My App', UserRound, route.name === 'me'],
    ['settings', 'Settings', SettingsIcon, route.name === 'settings'],
  ];

  return (
    <Ctx.Provider value={value}>
      <div className="backdrop" aria-hidden="true" />
      <div className={`shell ${config?.refraction === false ? '' : 'refract'}`}>
        <aside className="sidebar glass">
          <div className="side-drag" />
          <div className="brand">
            {logo && <img className="brand-logo" src={logo.url} alt="" />}
            <span>Church Studio</span>
          </div>
          <button className="side-search" onClick={() => setSearching(true)} title="Search everything (⌘K)"><Search size={14} /><span className="grow" style={{ textAlign: 'left' }}>Search</span><kbd>⌘K</kbd></button>
          <nav className="side-nav" aria-label="Main">
            {nav.map(([name, label, Icon, on]) => (
              <button key={name} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => go({ name })}>
                <Icon size={18} aria-hidden="true" /><span className="grow">{label}</span>
                {name === 'social' && needsYou > 0 && <span className="badge" aria-label={`${needsYou} posts need you`}>{needsYou}</span>}
              </button>
            ))}
          </nav>
          <div className="grow" />
          {config && <SideCards />}
          <nav className="side-nav side-bottom" aria-label="You">
            <NotificationsButton items={notes} onOpen={() => { setWallet(true); setNotes((ns) => ns.map((n) => ({ ...n, read: true }))); }} />
            {bottomNav.map(([name, label, Icon, on]) => (
              <button key={name} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => go({ name })}>
                <Icon size={18} aria-hidden="true" /><span className="grow">{label}</span>
                {name === 'settings' && update && <span className="badge" aria-label="Update available">1</span>}
              </button>
            ))}
          </nav>
          <button className={`side-foot small ${ai?.active ? 'ai-on' : ''}`} onClick={() => go({ name: 'settings', section: 'ai' })}
            title={ai?.active ? `Clip picks and writing help use ${ai.name}. Everything else runs on this Mac.` : ai?.degraded ? `${ai.name} is paused after a usage problem. Everything runs on this Mac for now.` : 'No account, no cloud. Everything runs on this Mac.'}>
            {ai?.active ? <span className="status-dot" aria-hidden="true" /> : <HardDrive size={13} aria-hidden="true" />}
            <span className="grow">{ai?.active ? `Working with ${ai.name}` : 'Working locally'}</span>
          </button>
        </aside>
        <main className="main">
          <div className="top-drag" />
          {!config ? null : route.name === 'settings' ? <Settings section={route.section} key={route.section || 's'} />
            : route.name === 'social' && route.campaign ? <CalendarScreen campaign={route.campaign} key={`camp${route.campaign.event?.id || route.campaign.projectId || ''}`} />
            : route.name === 'social' ? <Social compose={route.compose} caption={route.caption} key={route.compose?.clipId || route.compose?.design?.id || route.compose?.projectId || route.caption || 'social'} />
              : route.name === 'project' ? <Project id={route.id} initialStep={route.clip ? 'edit' : route.step} initialClip={route.clip} initialTime={route.t} key={route.id + (route.step || '') + (route.clip || '') + (route.t ?? '')} />
                : route.name === 'library' ? <Library openPicker={route.pick} key={route.pick ? 'pick' : 'lib'} />
                  : route.name === 'writing' ? <Writing project={route.project} kind={route.kind} key={(route.project || 'w') + (route.kind || '')} />
                    : route.name === 'projects' ? <AllProjects />
                    : route.name === 'graphics' ? <Graphics image={route.image} design={route.design} event={route.event} eventMode={route.eventMode} quote={route.quote} make={route.make} campaignId={route.campaignId} key={route.image || route.design || (route.event && `${route.event.id}${route.eventMode || ''}`) || route.quote || (route.make && `${route.make.projectId}${route.make.template}`) || 'g'} />
                      : route.name === 'assets' ? <BrandLibrary section={route.section} key={route.section || 'b'} />
                        : route.name === 'calendar' || route.name === 'inspiration' ? <CalendarScreen tab={route.name === 'inspiration' ? 'inspiration' : route.tab} campaign={route.campaign} key={`cal${route.tab || ''}${route.name}${route.campaign ? JSON.stringify(route.campaign).length : ''}`} />
                        : route.name === 'me' ? <MyApp section={route.section} key={route.section || 'me'} />
                  : <Dashboard />}
        </main>
      </div>
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
      <JobsTray />
      <HelperBubble ai={ai} />
      <Toasts toasts={toasts} dismiss={dismissToast} />
      {leaveAsk && (
        <Modal label="Unsaved changes" width={440} onClose={() => { leaveAsk.resolve(false); setLeaveAsk(null); }}>
          <h2>Save your changes?</h2>
          <p className="muted">You changed this clip and haven't saved yet.</p>
          <div className="row between" style={{ marginTop: 8 }}>
            <button className="btn ghost" onClick={() => { leaveAsk.resolve(false); setLeaveAsk(null); }}>Keep editing</button>
            <div className="row">
              <button className="btn danger" onClick={() => { guard.current?.discard?.(); leaveAsk.resolve(true); setLeaveAsk(null); }}>Discard changes</button>
              <button className="btn primary" onClick={async () => { await guard.current?.save?.(); leaveAsk.resolve(true); setLeaveAsk(null); }}>Save</button>
            </div>
          </div>
        </Modal>
      )}
      {wallet && notes.length > 0 && <NotificationsWallet items={notes} onClose={() => setWallet(false)} onDismiss={(id) => setNotes((ns) => ns.filter((n) => n.id !== id))} onDismissAll={() => { setNotes([]); setWallet(false); }} />}
      {updateReady && <UpdateReady info={updateReady} onClose={() => setUpdateReady(null)} />}
      {nextInfo && <NextSteps info={nextInfo} onClose={() => showNext(null)} />}
      {config && !config.onboarded && <Onboarding />}
    </Ctx.Provider>
  );
}
