// The menu bar panel: a small, fixed-size Control Center style sheet of glass tiles over the desktop.
// Jump back in, the next seven days, a short checklist and three quick stats. Every tile opens the main window.
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CalendarClock, Check, Clapperboard, FileText, Image as ImageIcon, Mic, Scissors, Send, Sparkles } from 'lucide-react';
import { api } from './api.js';
import { applyAppTheme, activeAppTheme } from './App.jsx';

const KIND_ICON = { sermon: Mic, video: Clapperboard, clip: Scissors, writing: FileText, design: ImageIcon };
const open = (route) => (window.desktop?.openRoute ? window.desktop.openRoute(route) : null);

function Tile({ className = '', onClick, children, label, style }) {
  return (
    <button type="button" className={`tp-tile ${className}`} onClick={onClick} aria-label={label} style={style}>
      {children}
    </button>
  );
}

export default function TrayPanel() {
  const [data, setData] = useState(null);
  const [shown, setShown] = useState(0); // bumps each time the panel opens, to replay the entrance

  const load = useCallback(async () => {
    const [cfg, themes, tray] = await Promise.all([api.get('/api/config'), api.get('/api/themes'), api.get('/api/tray')]).catch(() => [null, null, null]);
    if (cfg && themes?.app?.length) applyAppTheme(activeAppTheme(cfg.config, themes));
    if (tray) setData(tray);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('tray-mode');
    load();
    const off = window.desktop?.onTrayShown?.(() => { setShown((n) => n + 1); load(); });
    const key = (e) => { if (e.key === 'Escape') window.desktop?.trayHide?.(); };
    window.addEventListener('keydown', key);
    return () => { off?.(); window.removeEventListener('keydown', key); };
  }, [load]);

  if (!data) return <div className="tp" />;
  const { week, next, stats, checklist, jumpBack } = data;
  const Kind = KIND_ICON[jumpBack?.kind] || Sparkles;
  const left = checklist.filter((c) => !c.done).length;

  return (
    <div className="tp" key={shown}>
      <Tile className="tp-jump" style={{ '--i': 0 }} label="Jump back in" onClick={() => open(jumpBack?.go || { name: 'home' })}>
        {jumpBack?.thumb ? <img className="tp-thumb" src={jumpBack.thumb} alt="" /> : <span className={`tp-orb lg tone tone-${jumpBack ? 3 : 1}`}><Kind size={22} /></span>}
        <span className="tp-jump-text">
          <span className="tp-label">{jumpBack ? 'Jump back in' : 'Get started'}</span>
          <strong>{jumpBack?.title || 'Start something new'}</strong>
          {jumpBack && <span className="tp-sub">{jumpBack.sub}</span>}
        </span>
        <span className="tp-orb sm plain"><ArrowUpRight size={16} /></span>
      </Tile>

      <Tile className="tp-week" style={{ '--i': 1 }} label="Open the calendar" onClick={() => open({ name: 'calendar' })}>
        <span className="tp-head">
          <span className="tp-label">This week</span>
          {next && <span className="tp-sub">{next.title} · {new Date(next.start).toLocaleDateString('en-US', { weekday: 'short' })}</span>}
        </span>
        <span className="tp-days">
          {week.map((d) => (
            <span key={d.date} className={`tp-day${d.today ? ' today' : ''}`} title={d.events.join(', ')}>
              <span className="tp-letter">{d.letter}</span>
              <span className="tp-num">{d.num}</span>
              <span className="tp-dots">
                {d.events.length > 0 && <i className="ev" />}
                {d.posts > 0 && <i className="po" />}
              </span>
            </span>
          ))}
        </span>
      </Tile>

      <div className="tp-grid">
        <div className="tp-tile tp-list" style={{ '--i': 2 }}>
          <span className="tp-head">
            <span className="tp-label">To do</span>
            <span className="tp-sub">{left ? `${left} left` : 'All done'}</span>
          </span>
          {checklist.length === 0 && <span className="tp-sub tp-empty">Nothing waiting. Nice work.</span>}
          {checklist.map((c) => (
            <button key={c.id} type="button" className={`tp-check${c.done ? ' done' : ''}`} onClick={() => open(c.go)}>
              <span className="tp-box">{c.done && <Check size={12} strokeWidth={3} />}</span>
              <span className="tp-check-label">{c.label}</span>
            </button>
          ))}
        </div>
        <div className="tp-stats">
          <Tile className="tp-stat" style={{ '--i': 3 }} label="Posted this week" onClick={() => open({ name: 'social' })}>
            <span className="tp-orb tone tone-1"><Send size={16} /></span>
            <span><strong className="num">{stats.posted}<small>/{stats.goal}</small></strong><span className="tp-sub">Posted</span></span>
          </Tile>
          <Tile className="tp-stat" style={{ '--i': 4 }} label="Scheduled posts" onClick={() => open({ name: 'calendar' })}>
            <span className="tp-orb tone tone-2"><CalendarClock size={16} /></span>
            <span><strong className="num">{stats.scheduled}</strong><span className="tp-sub">Scheduled</span></span>
          </Tile>
          <Tile className="tp-stat" style={{ '--i': 5 }} label="Clips exported this week" onClick={() => open({ name: 'home' })}>
            <span className="tp-orb tone tone-3"><Scissors size={16} /></span>
            <span><strong className="num">{stats.clips}</strong><span className="tp-sub">Clips made</span></span>
          </Tile>
        </div>
      </div>
    </div>
  );
}
