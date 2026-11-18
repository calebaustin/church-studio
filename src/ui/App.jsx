import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Clapperboard, Send, Settings as SettingsIcon, WifiOff, LayoutDashboard, MonitorPlay, PenLine, Shapes, FolderHeart, UserRound } from 'lucide-react';
import { api, fmt as fmtClock } from './api.js';
import Library from './screens/Library.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Writing from './screens/Writing.jsx';
import Graphics from './screens/Graphics.jsx';
import BrandLibrary from './screens/BrandLibrary.jsx';
import MyApp from './screens/MyApp.jsx';
import Project from './screens/Project.jsx';
import Settings from './screens/Settings.jsx';
import Social from './screens/Social.jsx';
import Onboarding from './screens/Onboarding.jsx';
import JobsTray from './components/JobsTray.jsx';
import { Toasts } from './components/Toasts.jsx';
import Modal from './components/Modal.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

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

export default function App() {
  const [route, setRoute] = useState({ name: 'home' });
  const [config, setConfig] = useState(null);
  const [keyGuide, setKeyGuide] = useState([]);
  const [themes, setThemes] = useState({ app: [], video: [], fonts: [], systemFonts: [] });
  const [jobs, setJobs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [needsYou, setNeedsYou] = useState(0);
  const [error, setError] = useState(null);
  const [, setSchemeTick] = useState(0);
  const listeners = useRef(new Set());
  // Unsaved-changes guard: a screen registers { dirty(), save(), discard() }; leaving asks first.
  const guard = useRef(null);
  const [leaveAsk, setLeaveAsk] = useState(null);
  const setGuard = useCallback((g) => { guard.current = g; }, []);
  const confirmLeave = useCallback(() => new Promise((resolve) => {
    if (!guard.current?.dirty()) return resolve(true);
    setLeaveAsk({ resolve });
  }), []);
  const go = useCallback(async (r) => { if (await confirmLeave()) setRoute(r); }, [confirmLeave]);
  const lastStatus = useRef(new Map());

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
    setToasts((ts) => [...ts.slice(-3), { id, ...t }]);
    return id;
  }, []);
  const dismissToast = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

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
  useEffect(() => {
    const load = () => api.get('/api/social/posts').then((r) => setNeedsYou(r.posts.filter((p) => p.status === 'needs-you').length)).catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [route.name]);

  const onJobFinished = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  // Celebrate finished exports; report failures plainly.
  useEffect(() => onJobFinished((j) => {
    if (j.kind === 'export' && j.status === 'done') {
      toast({ kind: 'export', result: j.result, sticky: true });
    }
    if (j.status === 'done' && (j.kind === 'download' || j.kind === 'import') && j.result?.projectId) {
      const r = j.result;
      const what = r.range ? `Sermon downloaded (${fmtClock(r.range.start)} to ${fmtClock(r.range.end)})` : j.kind === 'import' ? 'Video added' : 'Video downloaded';
      toast({ text: `${what}. ${r.summary || ''}`.trim(), duration: 9000, action: { label: 'Open', run: () => setRoute({ name: 'project', id: r.projectId }) } });
    }
    if (j.status === 'done' && j.kind === 'transcribe') toast({ text: `Transcribed ${j.result?.words?.toLocaleString() || ''} words. Check the sermon range next.`, duration: 7000 });
    if (j.status === 'error' && ['export', 'download', 'transcribe'].includes(j.kind)) toast({ kind: 'error', text: `${j.label} didn't finish: ${j.error?.slice(0, 160)}`, duration: 9000 });
  }), [onJobFinished, toast]);

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

  const value = { route, go, setGuard, confirmLeave, config, saveConfig, reloadConfig, keyGuide, themes, reloadThemes, jobs, trackJob, onJobFinished, toast };

  if (error) {
    return (
      <div className="app"><div className="backdrop"><i /><i /><i /></div>
        <div className="main" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="glass strong panel stack" style={{ maxWidth: 520 }}>
            <h2>The local engine isn't answering</h2>
            <p className="muted">{error}</p>
            <p className="muted small">Quit Sermon Clips and open it again. If you run it from Terminal, use <span className="mono">npm start</span>.</p>
          </div>
        </div>
      </div>
    );
  }

  const nav = [
    ['home', 'Dashboard', LayoutDashboard, route.name === 'home'],
    ['library', 'Sermons', Clapperboard, route.name === 'library' || route.name === 'project'],
    ['social', 'Social', Send, route.name === 'social'],
    ['writing', 'Writing', PenLine, route.name === 'writing'],
    ['graphics', 'Graphics', Shapes, route.name === 'graphics'],
    ['assets', 'Brand library', FolderHeart, route.name === 'assets'],
  ];
  const bottomNav = [
    ['me', 'My App', UserRound, route.name === 'me'],
    ['settings', 'Settings', SettingsIcon, route.name === 'settings'],
  ];

  return (
    <Ctx.Provider value={value}>
      <div className="backdrop" aria-hidden="true"><i /><i /><i /></div>
      <div className={`shell ${config?.refraction === false ? '' : 'refract'}`}>
        <aside className="sidebar glass">
          <div className="side-drag" />
          <div className="brand"><span className="brand-mark" />Sermon Clips</div>
          <nav className="side-nav" aria-label="Main">
            {nav.map(([name, label, Icon, on]) => (
              <button key={name} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => go({ name })}>
                <Icon size={18} aria-hidden="true" /><span className="grow">{label}</span>
                {name === 'social' && needsYou > 0 && <span className="badge" aria-label={`${needsYou} posts need you`}>{needsYou}</span>}
              </button>
            ))}
          </nav>
          <div className="grow" />
          <div className="side-card">
            <strong>New service up?</strong>
            <span className="small" style={{ opacity: 0.75 }}>Grab this week's sermon from your channel.</span>
            <button className="btn accent sm" onClick={() => go({ name: 'library', pick: true })}><MonitorPlay size={14} />Pick a sermon</button>
          </div>
          <nav className="side-nav side-bottom" aria-label="You">
            {bottomNav.map(([name, label, Icon, on]) => (
              <button key={name} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => go({ name })}>
                <Icon size={18} aria-hidden="true" /><span className="grow">{label}</span>
              </button>
            ))}
          </nav>
          <span className="side-foot small" title="No account, no cloud. Everything runs on this Mac."><WifiOff size={13} aria-hidden="true" />Offline, on this Mac</span>
        </aside>
        <main className="main">
          <div className="top-drag" />
          {!config ? null : route.name === 'settings' ? <Settings section={route.section} key={route.section || 's'} />
            : route.name === 'social' ? <Social compose={route.compose} key={route.compose?.clipId || 'social'} />
              : route.name === 'project' ? <Project id={route.id} initialStep={route.step} key={route.id + (route.step || '')} />
                : route.name === 'library' ? <Library openPicker={route.pick} key={route.pick ? 'pick' : 'lib'} />
                  : route.name === 'writing' ? <Writing />
                    : route.name === 'graphics' ? <Graphics image={route.image} key={route.image || 'g'} />
                      : route.name === 'assets' ? <BrandLibrary />
                        : route.name === 'me' ? <MyApp />
                  : <Dashboard />}
        </main>
      </div>
      <JobsTray />
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
      {config && !config.onboarded && <Onboarding />}
    </Ctx.Provider>
  );
}
