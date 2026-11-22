// The extra facts about a long task, shown when someone hovers or focuses its progress card:
// speed and size for downloads, position and pace for transcribing, frames for exports, plus time spent and left.
import { fmtEta } from '../api.js';

const clock = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

/** Rows to show: the task's own details, then progress, time spent and time left. */
export function jobRows(job) {
  if (!job) return [];
  const rows = Object.entries(job.details || {});
  if (job.status === 'running') {
    rows.push(['Progress', `${job.progress}%`]);
    if (job.started) rows.push(['Time spent', clock(Date.now() - job.started)]);
    const left = fmtEta(job.eta);
    if (left) rows.push(['Time left', left.replace(/ left$/, '')]);
  } else if (job.status === 'queued') rows.push(['Status', 'Waiting for the task ahead of it']);
  return rows;
}
/** One line for a tooltip. */
export const jobSummary = (job) => jobRows(job).map(([k, v]) => `${k}: ${v}`).join('\n');
/** The short live figure beside the bar: speed for downloads, else nothing. */
export const jobSpeed = (job) => (job?.status === 'running' && job.details?.Speed) || '';

export default function JobDetails({ job }) {
  const rows = jobRows(job);
  if (!rows.length) return null;
  return (
    <div className="job-details" role="tooltip">
      <span className="eyebrow">Details</span>
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
    </div>
  );
}
