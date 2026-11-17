import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Library from './screens/Library.jsx';
import Project from './screens/Project.jsx';
import Settings from './screens/Settings.jsx';
import Social from './screens/Social.jsx';
import Onboarding from './screens/Onboarding.jsx';
import JobsTray from './components/JobsTray.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function applyAppTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.tokens || {})) root.style.setProperty(k, v);
  const dark = theme.tokens?.['--text'] && parseInt(theme.tokens['--text'].slice(1, 3), 16) > 128;
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.style.setProperty('--surface-strong', dark ? 'rgba(60,64,90,.75)' : 'rgba(255,255,255,.82)');
}

export default function App() {
  const [route, setRoute] = useState({ name: 'library' });
  const [config, setConfig] = useState(null);
  const [keyGuide, setKeyGuide] = useState([]);
  const [themes, setThemes] = useState({ app: [], video: [], fonts: [] });
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState(null);
  const listeners = useRef(new Set());
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

  useEffect(() => {
    if (!config || !themes.app.length) return;
    applyAppTheme(themes.app.find((t) => t.id === config.appTheme) || themes.app[0]);
  }, [config?.appTheme, themes]);

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

  const onJobFinished = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

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

  const value = { route, go: setRoute, config, saveConfig, reloadConfig, keyGuide, themes, reloadThemes, jobs, trackJob, onJobFinished };

  if (error) {
    return (
      <div className="app"><div className="backdrop"><i /><i /><i /></div>
        <div className="main" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="glass strong panel" style={{ maxWidth: 520 }}>
            <h2>Can't reach the local engine</h2>
            <p className="muted" style={{ marginTop: 8 }}>{error}</p>
            <p className="muted small" style={{ marginTop: 8 }}>Run <span className="mono">npm run daemon</span> or restart the app.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={value}>
      <div className="backdrop" aria-hidden="true"><i /><i /><i /></div>
      <div className={`app ${config?.refraction === false ? '' : 'refract'}`}>
        <header className="topbar">
          <div className="brand"><span className="brand-mark" />Sermon Clips</div>
          <nav className="nav glass">
            <button className={route.name === 'library' || route.name === 'project' ? 'on' : ''} onClick={() => setRoute({ name: 'library' })}>Library</button>
            <button className={route.name === 'social' ? 'on' : ''} onClick={() => setRoute({ name: 'social' })}>Social</button>
            <button className={route.name === 'settings' ? 'on' : ''} onClick={() => setRoute({ name: 'settings' })}>Settings</button>
          </nav>
          <div className="spacer" />
          <span className="chip ok" title="No account, no cloud: everything runs on this Mac"><span className="dot" />Offline · on this Mac</span>
        </header>
        <main className="main">
          {!config ? null : route.name === 'settings' ? <Settings section={route.section} />
            : route.name === 'social' ? <Social compose={route.compose} key={route.compose?.clipId || 'social'} />
            : route.name === 'project' ? <Project id={route.id} key={route.id} />
              : <Library />}
        </main>
      </div>
      <JobsTray />
      {config && !config.onboarded && <Onboarding />}
    </Ctx.Provider>
  );
}
