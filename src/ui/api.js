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
