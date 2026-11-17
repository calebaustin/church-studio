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
      if (pct != null) job.progress = Math.max(0, Math.min(100, Math.round(pct)));
      if (message) job.message = message;
    },
    log(line) {
      job.log.push(line);
      if (job.log.length > 200) job.log.shift();
    },
  };
  try {
    job.result = await job.fn(ctx);
    job.status = 'done';
    job.progress = 100;
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

export function cancel(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'queued') job.status = 'cancelled';
  if (job.status === 'running') job.controller.abort();
  return view(job);
}

export function view(job) {
  if (!job) return null;
  const { fn, controller, ...rest } = job;
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
