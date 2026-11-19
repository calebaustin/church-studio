import { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Flame, PenLine, Send, Shapes, Wand2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { isOn } from '../tools.js';

const DAY = 86400000;
const PERIODS = [['week', 'Week', 7], ['month', 'Month', 30], ['quarter', 'Quarter', 91], ['year', 'Year', 365]];

/** Everything made, for the activity page and the dashboard card. */
export function useActivity() {
  const [d, setD] = useState(null);
  useEffect(() => {
    Promise.all([
      api.get('/api/stats').catch(() => null),
      api.get('/api/writing').catch(() => ({ drafts: [] })),
      api.get('/api/designs').catch(() => ({ designs: [] })),
    ]).then(([stats, w, ds]) => setD({
      clips: (stats?.exports || []).map((e) => e.at),
      posts: (stats?.posts || []).filter((p) => p.publishedAt).map((p) => p.publishedAt),
      writing: (w.drafts || []).map((x) => x.updated),
      designs: (ds.designs || []).map((x) => x.updated),
      videos: (stats?.projects || []).map((p) => p.created),
    }));
  }, []);
  return d;
}

export const KINDS = [
  ['clips', 'Clips shared', Clapperboard, 'library'],
  ['videos', 'Videos brought in', Wand2, 'library'],
  ['posts', 'Posts published', Send, 'social'],
  ['writing', 'Pieces written', PenLine, 'writing'],
  ['designs', 'Designs made', Shapes, 'graphics'],
];
const inLast = (dates, days) => dates.filter((t) => t && Date.now() - Date.parse(t) < days * DAY).length;

/** Totals and weekly averages for a period, with a small chart for each kind of work. */
export default function Activity() {
  const { config } = useApp();
  const d = useActivity();
  const [period, setPeriod] = useState('month');
  const days = PERIODS.find((p) => p[0] === period)[2];
  const kinds = KINDS.filter((k) => isOn(config, k[3]));
  const buckets = useMemo(() => {
    const n = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 13 : 12;
    const size = period === 'week' || period === 'month' ? DAY : period === 'quarter' ? 7 * DAY : 30.4 * DAY;
    return { n, size };
  }, [period]);
  if (!d) return <section className="glass panel"><div className="skeleton" style={{ height: 160 }} /></section>;
  const total = kinds.reduce((a, k) => a + inLast(d[k[0]], days), 0);
  return (
    <section id="activity" className="glass strong panel stack" style={{ gap: 14 }}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="row" style={{ gap: 8 }}><Flame size={20} style={{ color: 'var(--accent-2)' }} />Your activity</h2>
          <span className="muted small">{total ? `${total} things made in the last ${period}. Keep going.` : `Nothing yet this ${period}. One small thing counts.`}</span>
        </div>
        <div className="seg sm">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
      </div>
      <div className="activity-grid">
        {kinds.map(([k, label, Icon]) => {
          const dates = d[k];
          const count = inLast(dates, days);
          const perWeek = count / (days / 7);
          const bars = Array.from({ length: buckets.n }, (_, i) => {
            const end = Date.now() - (buckets.n - 1 - i) * buckets.size;
            return dates.filter((t) => { const x = Date.parse(t); return x > end - buckets.size && x <= end; }).length;
          });
          const max = Math.max(1, ...bars);
          return (
            <div key={k} className="activity-card">
              <span className="row small muted" style={{ gap: 6 }}><Icon size={14} />{label}</span>
              <strong className="num">{count}</strong>
              <span className="small muted">{period === 'week' ? `${dates.length} all time` : `${perWeek < 1 ? perWeek.toFixed(1) : Math.round(perWeek)} a week on average`}</span>
              <div className="act-bars" aria-hidden="true">{bars.map((v, i) => <i key={i} style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: v ? 1 : 0.3 }} />)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
