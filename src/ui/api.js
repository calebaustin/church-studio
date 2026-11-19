// Thin client for the local daemon. Same origin in production and via the Vite proxy in dev.
async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  get: (u) => call('GET', u),
  post: (u, b = {}) => call('POST', u, b),
  put: (u, b) => call('PUT', u, b),
  patch: (u, b) => call('PATCH', u, b),
  del: (u) => call('DELETE', u),
};

export const media = (projectId, rel) => `/media/${encodeURIComponent(projectId)}/${rel.split('/').map(encodeURIComponent).join('/')}`;

export function fmt(t) {
  if (t == null || Number.isNaN(t)) return '–';
  t = Math.max(0, t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export const desktop = typeof window !== 'undefined' ? window.desktop : null;

export function openLink(url) {
  if (desktop?.openExternal) desktop.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

/** Subtle time-left text from a job's estimate (seconds). */
export function fmtEta(sec) {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 45) return 'Less than a minute left';
  if (sec < 90) return 'About a minute left';
  if (sec < 3600) return `About ${Math.round(sec / 60)} min left`;
  return `About ${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min left`;
}

/** A file size people can read: KB, MB, then GB with one decimal once it passes 1 GB. */
export function sizeLabel(bytes) {
  const mb = (bytes || 0) / 1048576;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  if (bytes > 0 && mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return '0 KB';
}
