import { useState } from 'react';
import { AudioLines, Clapperboard, Download, FileAudio, Film, Minus, RefreshCw, Scissors, Square, Wand2, X , Upload } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, fmtEta } from '../api.js';
import JobDetails, { jobSpeed, jobSummary } from './JobDetails.jsx';

// Work happens one task at a time. The rest wait in line and start on their own.
const ICONS = { 'youtube-upload': Upload, download: Download, import: FileAudio, transcribe: Wand2, export: Film, 'export-joined': Film, preview: Clapperboard, track: Scissors, 'clean-audio': AudioLines, update: RefreshCw, propose: Wand2 };
const iconFor = (j) => ICONS[j.kind] || RefreshCw;

/** A progress ring with the task's icon in the middle. */
function Ring({ job, size = 46 }) {
  const r = size / 2 - 4; const c = 2 * Math.PI * r;
  const pct = job?.status === 'running' ? (job.progress || 0) / 100 : 0;
  const Icon = job ? iconFor(job) : RefreshCw;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fill" strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <Icon size={size * 0.36} />
    </span>
  );
}

/** Running work, bottom right. One runs while others wait. Shrinks to a ring when minimized. */
export default function JobsTray() {
  const { jobs } = useApp();
  const [mini, setMiniState] = useState(() => { try { return localStorage.getItem('cs-tray-mini') === '1'; } catch { return false; } });
  const setMini = (v) => { setMiniState(v); try { localStorage.setItem('cs-tray-mini', v ? '1' : '0'); } catch { /* fine */ } };
  const running = jobs.find((j) => j.status === 'running');
  const queued = jobs.filter((j) => j.status === 'queued').reverse();
  const stopped = jobs.filter((j) => j.status === 'cancelled' && Date.now() - j.finished < 4000).slice(0, 1);
  if (!running && !queued.length && !stopped.length) return null;
  const top = running || queued[0];

  if (mini) {
    return (
      <div className="tray">
        <button className="tray-mini glass strong" onClick={() => setMini(false)} aria-label={`Show progress: ${top?.label || ''}`} title={top ? `${top.label}\n${jobSummary(top)}` : ''}>
          <Ring job={top} />
          {queued.length > (running ? 0 : 1) && <span className="tray-count">{queued.length - (running ? 0 : 1) + 1}</span>}
        </button>
      </div>
    );
  }
  return (
    <div className="tray" aria-live="polite">
      {stopped.map((j) => <div key={j.id} className="glass strong toast"><span className="small muted">Stopped: {j.label}</span></div>)}
      {top && (
        <div className="glass strong toast tray-card" tabIndex={0} aria-describedby={`job-details-${top.id}`}>
          <div id={`job-details-${top.id}`}><JobDetails job={top} /></div>
          <div className="row between" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 10, minWidth: 0 }}>
              <Ring job={top} size={34} />
              <strong className="truncate" title={top.label}>{top.label}</strong>
            </div>
            <div className="row" style={{ gap: 4, flex: 'none' }}>
              <button className="rt-btn" onClick={() => setMini(true)} aria-label="Minimize" title="Minimize"><Minus size={15} /></button>
              <button className="btn sm danger" onClick={() => api.del(`/api/jobs/${top.id}`)} aria-label={`Stop ${top.label}`}><Square size={11} fill="currentColor" />Stop</button>
            </div>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={top.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${top.status === 'queued' ? 0 : top.progress}%` }} /></div>
          <div className="row between small muted" style={{ gap: 8 }}>
            <span className="truncate">{top.status === 'queued' ? 'Starting soon' : top.message}</span>
            {top.status === 'running' && <span className="num" style={{ flex: 'none', opacity: 0.8 }}>{[jobSpeed(top), fmtEta(top.eta) || `${top.progress}%`].filter(Boolean).join(' · ')}</span>}
          </div>
          {queued.filter((j) => j !== top).length > 0 && (
            <div className="tray-queue">
              <span className="eyebrow">Up next · starts on its own</span>
              {queued.filter((j) => j !== top).slice(0, 4).map((j) => {
                const I = iconFor(j);
                return (
                  <div key={j.id} className="tray-row">
                    <I size={13} className="muted" /><span className="truncate grow small">{j.label}</span>
                    <button className="rt-btn" aria-label={`Remove ${j.label} from the line`} title="Remove" onClick={() => api.del(`/api/jobs/${j.id}`)}><X size={13} /></button>
                  </div>
                );
              })}
              {queued.length > 5 && <span className="small muted">and {queued.length - 5} more</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
