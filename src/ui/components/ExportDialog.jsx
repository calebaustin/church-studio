import { useEffect, useState } from 'react';
import Toggle from './Toggle.jsx';
import { Download, FolderOpen, Smartphone, Square, RectangleHorizontal, RectangleVertical, Bookmark, Captions, Merge, Type } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, desktop, fmt, sizeLabel } from '../api.js';
import Modal from './Modal.jsx';
import { NamePattern } from '../screens/Settings.jsx';

const PRESETS = [
  ['vertical', 'Reels · Shorts · TikTok', '9:16 vertical', Smartphone, [1080, 1920]],
  ['portrait', 'Instagram / Facebook feed', '4:5 portrait', RectangleVertical, [1080, 1350]],
  ['square', 'Square post', '1:1', Square, [1080, 1080]],
  ['landscape', 'YouTube / website', '16:9 wide, no crop', RectangleHorizontal, [1920, 1080]],
];
const RES = [['720', '720p'], ['1080', '1080p'], ['1440', '1440p'], ['2160', '4K']];
const SCALE = { 720: 720 / 1080, 1080: 1, 1440: 1440 / 1080, 2160: 2 };

/** Mirrors exportSettings() in src/daemon/render.js for the size estimate. */
function estimate(o, seconds) {
  const [w, h] = PRESETS.find((p) => p[0] === o.preset)?.[4] || [1080, 1920];
  const k = SCALE[o.resolution] || 1;
  const q = { standard: 8, high: 12, max: 20 }[o.quality] || 12;
  const mbps = q * ((w * h * k * k) / (1080 * 1920)) * (Number(o.fps) === 60 ? 1.5 : 1) * (o.codec === 'hevc' ? 0.6 : 1);
  return { w: Math.round((w * k) / 2) * 2, h: Math.round((h * k) / 2) * 2, mb: ((mbps + 0.19) * seconds) / 8 };
}

export default function ExportDialog({ project, clips, onClose, beforeExport }) {
  const { config, saveConfig, trackJob, toast } = useApp();
  const [o, setO] = useState({ preset: 'vertical', resolution: '1080', quality: 'high', fps: 30, codec: 'h264', captions: true, hook: true, ...(config.exportOptions || {}), ...(clips.length && clips.every((c) => c.format === 'wide') ? { preset: 'landscape' } : {}) });
  const [folder, setFolder] = useState(config.exportFolder || '');
  const [fileName, setFileName] = useState(config.exportPattern || '{date} - {title}');
  const [remember, setRemember] = useState(true);
  const [join, setJoin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (p) => setO({ ...o, ...p });
  const seconds = clips.reduce((a, c) => a + (c.end - c.start), 0);
  const est = estimate(o, seconds);
  const isWide = o.preset === 'landscape';
  useEffect(() => { if (isWide && o.resolution === '2160') set({ resolution: '1080' }); }, [o.preset]);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await beforeExport?.();
      if (remember) await saveConfig({ exportOptions: o });
      const options = { ...o, folder: folder || null, fileName };
      if (join && clips.length > 1) {
        const { job } = await api.post(`/api/projects/${project.id}/export-joined`, { options, clipIds: clips.map((c) => c.id) });
        trackJob(job);
      } else if (clips.length === 1) {
        const { job } = await api.post(`/api/projects/${project.id}/clips/${clips[0].id}/export`, { options });
        trackJob(job);
      } else {
        const r = await api.post(`/api/projects/${project.id}/export-all`, { options });
        r.jobs.forEach(trackJob);
      }
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const footer = (
    <>
      <div className="stack" style={{ gap: 4 }}>
        {clips.length > 1 && <Toggle checked={join} onChange={(e) => setJoin(e.target.checked)} icon={Merge} label="Join into one video, in this order" small />}
        <Toggle checked={remember} onChange={(e) => setRemember(e.target.checked)} icon={Bookmark} label="Remember these settings" small />
      </div>
      <div className="row">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary lg" disabled={busy} onClick={go}><Download size={16} />{busy ? 'Starting…' : clips.length === 1 ? 'Export clip' : join ? `Join ${clips.length} clips` : `Export ${clips.length} clips`}</button>
      </div>
    </>
  );

  return (
    <Modal onClose={onClose} width={760} label="Export options" footer={footer}>
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow">Export</span>
          <h2>{clips.length === 1 ? clips[0].title : `${clips.length} clips from “${project.title}”`}</h2>
        </div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <h3>Where is it going?</h3>
        <div className="choices">
          {PRESETS.map(([id, t, d, Icon]) => (
            <button key={id} className={`choice ${o.preset === id ? 'on' : ''}`} onClick={() => set({ preset: id })}>
              <span className="t"><Icon size={17} aria-hidden="true" />{t}</span><span className="d">{d}</span>
            </button>
          ))}
        </div>
        {isWide && <span className="hint">Wide copies keep the whole frame (no speaker crop) with captions on top.</span>}
      </div>

      <div className="grid2">
        <div className="stack" style={{ gap: 6 }}>
          <h3>Size</h3>
          <div className="seg">
            {RES.filter(([r]) => !(isWide && r === '2160')).map(([r, l]) => <button key={r} className={o.resolution === r ? 'on' : ''} onClick={() => set({ resolution: r })}>{l}</button>)}
          </div>
          <span className="hint num">{est.w} × {est.h} pixels{o.resolution === '2160' || o.resolution === '1440' ? ' · sharper on big screens, but most phones show 1080p' : ''}</span>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3>Quality</h3>
          <div className="seg">
            {[['standard', 'Standard'], ['high', 'High'], ['max', 'Best']].map(([q, l]) => <button key={q} className={o.quality === q ? 'on' : ''} onClick={() => set({ quality: q })}>{l}</button>)}
          </div>
          <span className="hint num">About {sizeLabel(est.mb * 1048576)}{clips.length > 1 ? ' total' : ''} for {fmt(seconds)}</span>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3>Frame rate</h3>
          <div className="seg">
            {[24, 30, 60].map((f) => <button key={f} className={Number(o.fps) === f ? 'on' : ''} onClick={() => set({ fps: f })}>{f} fps</button>)}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3>Format</h3>
          <div className="seg">
            <button className={o.codec !== 'hevc' ? 'on' : ''} onClick={() => set({ codec: 'h264' })}>MP4 · H.264</button>
            <button className={o.codec === 'hevc' ? 'on' : ''} onClick={() => set({ codec: 'hevc' })}>MP4 · HEVC</button>
          </div>
          <span className="hint">{o.codec === 'hevc' ? 'Smaller files. Great on Apple devices; a few older apps may not play it.' : 'Plays everywhere. The safe choice for social media.'}</span>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 18 }}>
        <Toggle checked={o.captions} onChange={(e) => set({ captions: e.target.checked })} icon={Captions} label="Burn in captions" small />
        <Toggle checked={o.hook} onChange={(e) => set({ hook: e.target.checked })} icon={Type} label="Show the on-screen hook" small />
      </div>

      <div className="grid2">
        <label className="field">Save to
          <div className="row">
            <input className="input" value={folder} placeholder="Downloads" onChange={(e) => setFolder(e.target.value)} />
            {desktop?.pickFolder && <button className="btn" onClick={async () => { const f = await desktop.pickFolder(); if (f) setFolder(f); }}><FolderOpen size={14} />Choose</button>}
          </div>
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600, color: 'var(--ink)' }}>File name</span>
          <NamePattern value={fileName} onChange={setFileName} />
        </div>
      </div>

      {error && <div className="banner bad">{error}</div>}
    </Modal>
  );
}
