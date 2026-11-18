import { useEffect, useRef, useState } from 'react';
import { AudioLines, Building2, CloudSun, Headphones, Mic, Pause, Play, Smartphone, Zap, Ban } from 'lucide-react';
import { api } from '../api.js';

const ICONS = { voice: Mic, room: Building2, far: AudioLines, outside: CloudSun, hum: Zap, phone: Smartphone };
let presetCache = null;

/**
 * Pick an audio cleanup preset and how strong it is, then hear a before and after sample.
 * value: { preset, amount } or null. source: { projectId } or { file }.
 */
export default function AudioCleanup({ value, onChange, source, compact = false }) {
  const [presets, setPresets] = useState(presetCache || []);
  const [sample, setSample] = useState(null); // { before, after, key }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(null);
  const audio = useRef(null);
  const preset = value?.preset || 'none';
  const amount = value?.amount ?? 0.5;
  const key = `${preset}:${amount}:${source?.projectId || source?.file || ''}`;

  useEffect(() => { if (!presetCache) api.get('/api/audio/presets').then((r) => { presetCache = r.presets; setPresets(r.presets); }).catch(() => {}); }, []);
  useEffect(() => () => audio.current?.pause(), []);

  const listen = async (which) => {
    setError(null);
    if (playing === which) { audio.current?.pause(); setPlaying(null); return; }
    let s = sample;
    if (!s || s.key !== key) {
      setBusy(true);
      try { s = { ...(await api.post('/api/audio/preview', { ...source, preset, amount, at: sample?.start })), key }; setSample(s); } catch (e) { setError(e.message); setBusy(false); return; }
      setBusy(false);
    }
    const el = audio.current;
    const t = el && !el.paused ? el.currentTime : 0;
    el.src = s[which];
    el.currentTime = t;
    await el.play().catch(() => {});
    setPlaying(which);
  };
  const set = (p) => { audio.current?.pause(); setPlaying(null); onChange(p); };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className={`ac-grid ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Audio cleanup">
        <button role="radio" aria-checked={preset === 'none'} className={`ac-tile ${preset === 'none' ? 'on' : ''}`} onClick={() => set(null)}>
          <Ban size={16} aria-hidden="true" /><strong>Leave as is</strong>
        </button>
        {presets.map((p) => {
          const Icon = ICONS[p.id] || Headphones;
          return (
            <button key={p.id} role="radio" aria-checked={preset === p.id} className={`ac-tile ${preset === p.id ? 'on' : ''}`} title={p.about} onClick={() => set({ preset: p.id, amount })}>
              <Icon size={16} aria-hidden="true" /><strong>{p.name}</strong>
              {!compact && <span className="small muted">{p.about}</span>}
            </button>
          );
        })}
      </div>
      {preset !== 'none' && (
        <label className="field">Strength · {amount < 0.34 ? 'Light' : amount < 0.67 ? 'Medium' : 'Strong'}
          <input type="range" min="0" max="1" step="0.05" value={amount} onChange={(e) => set({ preset, amount: Number(e.target.value) })} />
        </label>
      )}
      {preset !== 'none' && source && (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted">Hear it:</span>
          <button className={`btn sm ${playing === 'before' ? 'on' : ''}`} disabled={busy} onClick={() => listen('before')}>{playing === 'before' ? <Pause size={13} /> : <Play size={13} />}Before</button>
          <button className={`btn sm ${playing === 'after' ? 'primary' : ''}`} disabled={busy} onClick={() => listen('after')}>{playing === 'after' ? <Pause size={13} /> : <Play size={13} />}After</button>
          {busy && <span className="small muted">Making a sample…</span>}
        </div>
      )}
      {error && <span className="small" style={{ color: 'var(--bad)' }}>{error}</span>}
      <audio ref={audio} onEnded={() => setPlaying(null)} hidden />
    </div>
  );
}
