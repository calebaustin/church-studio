import { Square } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../api.js';

/** Running work, bottom right and always inside the window. Every job can be stopped. */
export default function JobsTray() {
  const { jobs } = useApp();
  const recent = jobs.filter((j) => j.status === 'running' || j.status === 'queued'
    || (j.status === 'cancelled' && Date.now() - j.finished < 4000)).slice(0, 4);
  if (!recent.length) return null;
  return (
    <div className="tray" aria-live="polite">
      {recent.map((j) => (
        <div key={j.id} className="glass strong toast">
          <div className="row between" style={{ gap: 8 }}>
            <strong className="truncate grow" title={j.label}>{j.label}</strong>
            {(j.status === 'running' || j.status === 'queued') && (
              <button className="btn sm danger" onClick={() => api.del(`/api/jobs/${j.id}`)} aria-label={`Stop ${j.label}`}><Square size={11} fill="currentColor" />Stop</button>
            )}
          </div>
          {j.status === 'cancelled' ? <span className="muted small">Stopped.</span> : (
            <>
              <div className="progress" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${j.status === 'queued' ? 0 : j.progress}%` }} /></div>
              <span className="muted small truncate">{j.status === 'queued' ? 'Waiting for the current task to finish…' : j.message}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
