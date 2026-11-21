// Settings › Backups and sharing: backups, a team folder in Google Drive, Dropbox, OneDrive or iCloud,
// and sharing one project with a teammate.
import { useEffect, useState } from 'react';
import Toggle from './Toggle.jsx';
import { Cloud, Download, FolderOpen, HardDriveDownload, RotateCcw, Share2, Users, CalendarClock, Images, Film } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, desktop, sizeLabel } from '../api.js';
import Modal, { ModalHead } from './Modal.jsx';

const when = (d) => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Backups() {
  const { config, saveConfig, toast, trackJob } = useApp();
  const [data, setData] = useState(null);
  const [team, setTeam] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(Boolean(config.backupLibrary));
  const load = () => { api.get('/api/backups').then(setData).catch(() => {}); api.get('/api/team').then(setTeam).catch(() => {}); };
  useEffect(load, [config.backupFolder, config.teamFolder]);
  const backup = async () => {
    setBusy(true);
    try { const r = await api.post('/api/backups', { includeLibrary: lib }); toast({ text: `Backed up (${sizeLabel(r.bytes)}).`, action: { label: 'Show', run: () => api.post('/api/backups/reveal', { file: r.file }) } }); load(); } catch (e) { toast({ kind: 'error', text: e.message }); }
    setBusy(false);
  };
  const restore = async (b) => {
    if (!window.confirm(`Restore “${b.name}”? It opens as a new workspace, so nothing here is replaced.`)) return;
    try { const r = await api.post('/api/backups/restore', { file: b.file }); toast({ text: `Restored as “${r.workspace.name}”. Switch to it in My App.` }); } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const pickFolder = async (key) => { const f = await desktop?.pickFolder?.(); if (f) await saveConfig({ [key]: f }); };
  const importFile = async (file) => {
    try { const r = await api.post('/api/projects/import', { file }); toast({ text: `“${r.title}” is in your projects${r.needsMedia ? '. Add its video to make new clips.' : '.'}` }); } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const clouds = data?.clouds || [];
  return (
    <>
      <section className="glass strong panel stack" style={{ gap: 14 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="stack" style={{ gap: 2 }}><h2>Backups</h2><span className="muted small">Settings, transcripts, clips, writing, designs, posts and campaigns. Videos aren’t included because they’re large; keep your originals or bring them back from YouTube. Keys and passwords are never saved in a backup.</span></div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn primary" disabled={busy} onClick={backup}><HardDriveDownload size={15} />{busy ? 'Backing up…' : 'Back up now'}</button>
          <Toggle checked={lib} onChange={(e) => { setLib(e.target.checked); saveConfig({ backupLibrary: e.target.checked }); }} icon={Images} label="Include the brand library" small />
          <Toggle checked={Boolean(config.backupAuto)} onChange={(e) => saveConfig({ backupAuto: e.target.checked })} icon={CalendarClock} label="Back up every week" small />
          {config.lastBackup && <span className="muted small">Last backup {when(config.lastBackup)}</span>}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="field-label">Save backups to</span>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className={`pill-choice ${!config.backupFolder ? 'on' : ''}`} onClick={() => saveConfig({ backupFolder: '' })}>Documents</button>
            {clouds.map((c) => <button key={c.path} className={`pill-choice ${config.backupFolder?.startsWith(c.path) ? 'on' : ''}`} onClick={() => saveConfig({ backupFolder: `${c.path}/${'Church Studio Backups'}` })}><Cloud size={12} style={{ marginRight: 4 }} />{c.label}</button>)}
            {desktop?.pickFolder && <button className="btn sm ghost" onClick={() => pickFolder('backupFolder')}><FolderOpen size={13} />Choose…</button>}
          </div>
          {data && <span className="hint truncate" title={data.folder}>{data.folder.replace(/^\/Users\/[^/]+/, '~')}</span>}
          {clouds.length > 0 && <span className="hint">Saving to a cloud folder keeps a copy off this Mac. Weekly backups keep the newest four.</span>}
        </div>
        {data?.backups?.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            {data.backups.slice(0, 6).map((b) => (
              <div key={b.file} className="insp-row">
                <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">{when(b.made)}</strong><span className="muted small">{sizeLabel(b.bytes)}</span></div>
                <button className="btn sm ghost" onClick={() => api.post('/api/backups/reveal', { file: b.file })}><FolderOpen size={13} />Show</button>
                <button className="btn sm" onClick={() => restore(b)}><RotateCcw size={13} />Restore</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass strong panel stack" style={{ gap: 14 }}>
        <div className="stack" style={{ gap: 2 }}><h2 className="row" style={{ gap: 8 }}><Users size={18} />Team folder</h2><span className="muted small">Share projects with your team through a folder that Google Drive, Dropbox, OneDrive or iCloud keeps in sync. Share a project there, and teammates see it here to bring in. No accounts needed.</span></div>
        <div className="row wrap" style={{ gap: 6 }}>
          {clouds.map((c) => <button key={c.path} className={`pill-choice ${config.teamFolder?.startsWith(c.path) ? 'on' : ''}`} onClick={() => saveConfig({ teamFolder: `${c.path}/Church Studio Team` })}><Cloud size={12} style={{ marginRight: 4 }} />{c.label}</button>)}
          {desktop?.pickFolder && <button className="btn sm ghost" onClick={() => pickFolder('teamFolder')}><FolderOpen size={13} />Choose…</button>}
          {config.teamFolder && <button className="btn sm ghost" onClick={() => saveConfig({ teamFolder: '' })}>Turn off</button>}
        </div>
        {!clouds.length && <span className="hint">Install Google Drive, Dropbox or OneDrive for Mac, or turn on iCloud Drive, and its folder shows up here.</span>}
        {config.teamFolder && <span className="hint truncate">{config.teamFolder.replace(/^\/Users\/[^/]+/, '~')}</span>}
        {team?.files?.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Shared with the team</span>
            {team.files.map((f) => (
              <div key={f.file} className="insp-row">
                <div className="stack grow" style={{ gap: 0, minWidth: 0 }}><strong className="small truncate">{f.name}</strong><span className="muted small">{when(f.modified)} · {sizeLabel(f.bytes)}</span></div>
                <button className="btn sm" onClick={() => importFile(f.file)}><Download size={13} />Bring in</button>
              </div>
            ))}
          </div>
        )}
        {config.teamFolder && team && !team.files.length && <span className="muted small">Nothing shared yet. Use Share on any project.</span>}
        {desktop?.pickFiles && <button className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={async () => { const [f] = await desktop.pickFiles({ name: 'Church Studio project', extensions: ['zip'], multi: false }); if (f) importFile(f); }}><Share2 size={13} />Bring in a project file…</button>}
      </section>
    </>
  );
}

/** Share one project: to the team folder, or as a file in Downloads to send. */
export function ShareProject({ project, onClose }) {
  const { config, toast } = useApp();
  const [media, setMedia] = useState(false);
  const [busy, setBusy] = useState(null);
  const share = async (team) => {
    setBusy(team ? 'team' : 'file');
    try {
      const r = await api.post(`/api/projects/${project.id}/share`, { includeMedia: media, team });
      toast({ text: team ? 'Shared to the team folder. Teammates will see it in Settings › Backups and sharing.' : `Saved ${r.name} to Downloads.`, action: { label: 'Show', run: () => api.post('/api/backups/reveal', { file: r.file }) } });
      onClose();
    } catch (e) { toast({ kind: 'error', text: e.message }); setBusy(null); }
  };
  return (
    <Modal onClose={onClose} width={500} label="Share project"
      footer={<>
        <button className="btn" disabled={Boolean(busy)} onClick={() => share(false)}><Download size={14} />{busy === 'file' ? 'Saving…' : 'Save a file'}</button>
        {config.teamFolder && <button className="btn primary" disabled={Boolean(busy)} onClick={() => share(true)}><Users size={14} />{busy === 'team' ? 'Sharing…' : 'Share to team folder'}</button>}
      </>}>
      <ModalHead title="Share project" sub={`“${project.title}” with its transcript, clips, writing and designs.`} />
      <Toggle checked={media} onChange={(e) => setMedia(e.target.checked)} icon={Film} label={`Include the video${project.media?.duration ? ' (larger file)' : ''}`} small />
      {!config.teamFolder && <span className="hint">Set a team folder in Settings › Backups and sharing to share through Google Drive, Dropbox, OneDrive or iCloud.</span>}
    </Modal>
  );
}
