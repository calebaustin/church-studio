// Background job queue. Heavy work (download, transcribe, render) runs one at a time so a
// laptop stays responsive; the UI polls /api/jobs for progress.
import { randomUUID } from 'node:crypto';

const jobs = new Map();
const queue = [];
let running = null;

/**
 * Queue a job. `fn(ctx)` gets { progress(pct, message), log(line), signal } and returns a result.
 * `key` dedupes: a second identical request while one is queued/running returns the same job.
 */
export function enqueue({ kind, label, projectId = null, key = null }, fn) {
  if (key) {
    const existing = [...jobs.values()].find((j) => j.key === key && (j.status === 'queued' || j.status === 'running'));
    if (existing) return existing;
  }
  const job = {
    id: randomUUID().slice(0, 8), kind, label, projectId, key,
    status: 'queued', progress: 0, message: 'Waiting…', log: [], result: null, error: null,
    created: Date.now(), started: null, finished: null,
    controller: new AbortController(), fn,
  };
  jobs.set(job.id, job);
  queue.push(job);
  pump();
  return job;
}

async function pump() {
  if (running || queue.length === 0) return;
  const job = queue.shift();
  if (job.status === 'cancelled') return pump();
  running = job;
  job.status = 'running';
  job.started = Date.now();
  const ctx = {
    signal: job.controller.signal,
    progress(pct, message) {
      if (pct != null) {
        const p = Math.max(0, Math.min(100, pct));
        if (p >= job.progress) job.progress = Math.round(p); // never jump backwards
        // Time left: from how fast progress has moved since the first real step.
        const now = Date.now();
        if (!job._t0 && p > 1) { job._t0 = now; job._p0 = p; }
        if (job._t0 && p > job._p0 + 2 && now - job._t0 > 4000) {
          const rate = (p - job._p0) / (now - job._t0);
          const raw = (100 - p) / rate / 1000;
          job.eta = Math.round(job.eta ? job.eta * 0.7 + raw * 0.3 : raw);
        }
      }
      if (message) job.message = message;
    },
    log(line) {
      job.log.push(line);
      if (job.log.length > 200) job.log.shift();
    },
    /** Extra facts shown when someone hovers the task (stage, model, words so far…). null removes one. */
    detail(fields) {
      const d = { ...(job.details || {}) };
      for (const [k, v] of Object.entries(fields || {})) { if (v == null || v === '') delete d[k]; else d[k] = String(v); }
      job.details = d;
    },
    /**
     * A file transfer: bytes so far and the total (if known). Fills in speed, size and an honest time left
     * from the transfer rate. rate: bytes a second when the tool reports its own.
     */
    transfer(got, total, rate) {
      const now = Date.now(); const t = job._tr || (job._tr = { t: now, g: got, speed: 0 });
      if (rate > 0) t.speed = t.speed ? t.speed * 0.6 + rate * 0.4 : rate;
      else if (now - t.t >= 700) { const inst = Math.max(0, (got - t.g) / ((now - t.t) / 1000)); t.speed = t.speed ? t.speed * 0.6 + inst * 0.4 : inst; t.t = now; t.g = got; }
      ctx.detail({ Speed: t.speed > 0 ? rateText(t.speed) : null, Downloaded: total ? `${bytesText(got)} of ${bytesText(total)}` : bytesText(got) });
      if (total && t.speed > 0) job.eta = Math.max(0, Math.round((total - got) / t.speed));
    },
  };
  try {
    job.result = await job.fn(ctx);
    job.status = 'done';
    job.progress = 100;
    job.eta = 0;
    job.message = job.message?.startsWith('Waiting') ? 'Done' : job.message;
  } catch (e) {
    job.status = job.controller.signal.aborted ? 'cancelled' : 'error';
    job.error = e.message;
    job.message = job.status === 'cancelled' ? 'Cancelled' : 'Failed';
    console.error(`[job ${job.id} ${job.kind}]`, e.message);
  } finally {
    job.finished = Date.now();
    running = null;
    pump();
  }
}

export const bytesText = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
export const rateText = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : `${Math.round(b / 1e3)} KB/s`);

export function cancel(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'queued') job.status = 'cancelled';
  if (job.status === 'running') job.controller.abort();
  return view(job);
}

export function view(job) {
  if (!job) return null;
  const { fn, controller, _t0, _p0, _tr, ...rest } = job;
  return rest;
}

export function getJob(id) {
  return view(jobs.get(id));
}

export function listJobs({ projectId } = {}) {
  const cutoff = Date.now() - 1000 * 60 * 60;
  return [...jobs.values()]
    .filter((j) => (!projectId || j.projectId === projectId) && (!j.finished || j.finished > cutoff))
    .sort((a, b) => b.created - a.created)
    .map(view);
}
