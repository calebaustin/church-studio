import { useApp } from '../App.jsx';
import { api } from '../api.js';

export default function JobsTray() {
  const { jobs } = useApp();
  const recent = jobs.filter((j) => j.status === 'running' || j.status === 'queued'
    || (j.finished && Date.now() - j.finished < 6000) || (j.status === 'error' && Date.now() - j.finished < 20000)).slice(0, 4);
  if (!recent.length) return null;
  return (
    <div className="tray">
      {recent.map((j) => (
        <div key={j.id} className="glass strong toast">
          <div className="row between">
            <strong className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.label}</strong>
            {(j.status === 'running' || j.status === 'queued') && (
              <button className="btn ghost sm" onClick={() => api.del(`/api/jobs/${j.id}`)}>Cancel</button>
            )}
          </div>
          {j.status === 'error'
            ? <span className="small" style={{ color: 'var(--bad)' }}>{j.error?.slice(0, 220)}</span>
            : <>
              <div className="progress"><i style={{ width: `${j.status === 'queued' ? 0 : j.progress}%` }} /></div>
              <span className="muted small">{j.status === 'queued' ? 'Waiting for the current task…' : j.message}</span>
            </>}
        </div>
      ))}
    </div>
  );
}
