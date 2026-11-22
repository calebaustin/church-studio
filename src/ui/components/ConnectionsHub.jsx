// Connections: everything Church Studio is connected to, in one place. Your social pages (handle, view, sign in),
// your church calendar, and accounts set up for automatic posting. The same panel shows in My App, Social › Accounts
// and Settings, so they always match.
import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, LogIn, LogOut, Pencil } from 'lucide-react';
import { desktop, openLink } from '../api.js';
import { useApp } from '../App.jsx';
import { Connections as CalendarConnections } from '../screens/SettingsMore.jsx';

// Sites Church Studio can sign in to and post through, and how a handle becomes a link.
export const SITES = [
  ['instagram', 'Instagram', (h) => `https://www.instagram.com/${h}`],
  ['facebook', 'Facebook', (h) => `https://www.facebook.com/${h}`],
  ['youtube', 'YouTube', (h) => `https://www.youtube.com/@${h}`],
  ['tiktok', 'TikTok', (h) => `https://www.tiktok.com/@${h}`],
  ['x', 'X', (h) => `https://x.com/${h}`],
  ['linkedin', 'LinkedIn', (h) => `https://www.linkedin.com/company/${h}`],
  ['threads', 'Threads', (h) => `https://www.threads.com/@${h}`],
];
const linkFor = (k, v) => { const s = String(v || '').trim(); if (!s) return ''; if (/^https?:\/\//.test(s)) return s.replace(/^http:/, 'https:'); const site = SITES.find((x) => x[0] === k); return site ? site[2](s.replace(/^@/, '')) : ''; };
const short = (u) => u.replace(/^https:\/\/(www\.)?/, '');

/** Which sites Church Studio is signed in to (from its saved browser session). Refreshes when the app comes back into focus. */
export function useSignedIn() {
  const [status, setStatus] = useState({});
  const load = useCallback(() => { desktop?.webStatus?.().then((s) => setStatus(s || {})).catch(() => {}); }, []);
  useEffect(() => { load(); window.addEventListener('focus', load); return () => window.removeEventListener('focus', load); }, [load]);
  return [status, load];
}

/** Social pages: type your handle, view the page, and sign Church Studio in so it can post there for you. */
export function SocialLogins() {
  const { config, saveConfig, toast } = useApp();
  const links = { ...(config.socialLinks || {}), ...(config.youtubeChannel && !config.socialLinks?.youtube ? { youtube: config.youtubeChannel } : {}) };
  const [editing, setEditing] = useState(null);
  const [val, setVal] = useState('');
  const [signedIn, reload] = useSignedIn();
  const canSignIn = Boolean(desktop?.webLogin);
  const save = (k) => {
    const v = val.trim();
    saveConfig({ socialLinks: { ...(config.socialLinks || {}), [k]: v }, ...(k === 'youtube' && v ? { youtubeChannel: linkFor('youtube', v) } : {}) });
    setEditing(null);
  };
  return (
    <section className="glass panel stack" style={{ gap: 12 }}>
      <div className="stack" style={{ gap: 2 }}>
        <h3>Your pages</h3>
        <span className="small muted">Add your handle to view each page here. Sign in once and Church Studio can post there for you, no developer setup needed. Sign-ins stay on this Mac.</span>
      </div>
      <div className="conn-list">
        {SITES.map(([k, label]) => {
          const url = linkFor(k, links[k]);
          const on = signedIn[k];
          return (
            <div key={k} className="conn-row">
              <strong className="small">{label}</strong>
              {editing === k ? (
                <form className="row grow" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); save(k); }}>
                  <input className="input" autoFocus value={val} placeholder={`@handle or ${label} link`} onChange={(e) => setVal(e.target.value)} />
                  <button className="btn sm primary">Save</button>
                </form>
              ) : (
                <span className="row grow" style={{ gap: 6, minWidth: 0 }}>
                  {url ? <span className="small muted truncate" title={url}>{short(url)}</span> : <button className="btn ghost sm" onClick={() => { setVal(''); setEditing(k); }}>Add your handle</button>}
                  {url && <button className="rt-btn" title="Change handle" aria-label={`Change ${label} handle`} onClick={() => { setVal(links[k] || ''); setEditing(k); }}><Pencil size={13} /></button>}
                </span>
              )}
              <span className="row" style={{ gap: 6 }}>
                {url && <button className="btn sm" onClick={() => (desktop?.openWeb ? desktop.openWeb(url, `${label} · ${config.churchInfo?.name || 'Your page'}`) : openLink(url))}><ExternalLink size={13} />View</button>}
                {canSignIn && (on
                  ? <><span className="chip ok"><Check size={11} />Signed in</span><button className="rt-btn" title={`Sign Church Studio out of ${label}`} aria-label={`Sign out of ${label}`} onClick={async () => { await desktop.webLogout(k); reload(); toast({ text: `Signed out of ${label}.` }); }}><LogOut size={13} /></button></>
                  : <button className="btn sm" title={`Sign in to ${label} in a Church Studio window`} onClick={() => desktop.webLogin(k)}><LogIn size={13} />Log in</button>)}
              </span>
            </div>
          );
        })}
      </div>
      {!canSignIn && <span className="hint">Signing in works in the Church Studio app.</span>}
      {canSignIn && <span className="hint">Password autofill from your Mac doesn't reach these windows. If you'd rather sign in with your own browser, you can drag any clip from Church Studio straight into it.</span>}
    </section>
  );
}

/** Everything connected: pages and sign-ins, the church calendar, and (where given) automatic posting accounts. */
export default function ConnectionsHub({ apiAccounts = null }) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <SocialLogins />
      {apiAccounts}
      <CalendarConnections />
    </div>
  );
}
