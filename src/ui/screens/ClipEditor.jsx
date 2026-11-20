import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, Download, Zap, Plus, Trash2, Crosshair, Play, Pause, Send, FolderOpen, Save, MousePointerClick, Bookmark, X, ScissorsLineDashed, CalendarDays, ChevronDown } from 'lucide-react';
import { useApp, useHelperFocus } from '../App.jsx';
import { api, fmt, media } from '../api.js';
import CaptionOverlay, { findFont } from '../components/CaptionOverlay.jsx';
import ExportDialog from '../components/ExportDialog.jsx';
import Scrubber from '../components/Scrubber.jsx';
import Modal from '../components/Modal.jsx';
import LibraryPicker from '../components/LibraryPicker.jsx';
import { CaptionStyleFields, ColorRow, HookStyleFields } from '../components/VideoThemeEditor.jsx';
import { keepSegments, keptLength } from '../captions.js';
import { sampleTrack, cueX, clampX } from '../framing.js';
import ColorField from '../components/ColorField.jsx';
import AudioCleanup from '../components/AudioCleanup.jsx';
import Popover from '../components/Popover.jsx';
import { useChurchEvents } from '../components/ChurchEvents.jsx';
import { LOOKS, hasLook, lookFilter } from '../studioLook.js';

const FILLERS = new Set(['um', 'uh', 'uhm', 'umm', 'er', 'erm', 'ah']);
const FRAME_W = 340;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Undo/redo over a clip's editable state. */
function useHistory(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  const set = useCallback((next) => setState((s) => ({ past: [...s.past.slice(-80), s.present], present: typeof next === 'function' ? next(s.present) : next, future: [] })), []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1), future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback((v) => setState({ past: [], present: v, future: [] }), []);
  return { clip: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

/** Whole-frame and three-stack previews: draw the video into a canvas over a blurred or solid background. */
function CanvasFrame({ video, mode, bg, gap, width, height, colors, split, filter }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    let last = null; // the frame time drawn last: while paused, nothing new to draw
    const ctx = ref.current.getContext('2d');
    const draw = () => {
      const v = video.current;
      const key = v ? `${v.currentTime}:${v.videoWidth}:${v.seeking}:${v.readyState}` : 'none';
      if (key === last && (!v || v.paused)) { raf = requestAnimationFrame(draw); return; }
      last = key;
      if (mode === 'lyric') {
        // Slowly moving soft color, matching the export.
        const t = (v?.currentTime || 0);
        const cols = (colors?.length ? colors : ['#2B7F5F', '#D9A441', '#1B2440']).slice(0, 3);
        ctx.filter = 'none';
        ctx.fillStyle = cols[2] || cols[0]; ctx.fillRect(0, 0, width, height);
        cols.forEach((c, i) => {
          const cx = width * (0.5 + 0.38 * Math.sin(t * 0.21 + i * 2.1)); const cy = height * (0.5 + 0.4 * Math.cos(t * 0.17 + i * 1.7));
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.55);
          g.addColorStop(0, c); g.addColorStop(1, `${c}00`);
          ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
        });
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, width, height);
      } else if (v && v.videoWidth && mode === 'split') {
        // Two speakers, matching the export: one crop on top, one below.
        const W = width; const H = height; const g = (gap ?? 8) * (W / 1080);
        const ph = (H - g) / 2; const vw = v.videoWidth; const vh = v.videoHeight;
        const cw = Math.min(vw, (vh * W) / ph);
        ctx.filter = 'none'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        (split || [0.3, 0.7]).forEach((cx, k) => {
          const x0 = Math.max(0, Math.min(vw - cw, cx * vw - cw / 2));
          ctx.drawImage(v, x0, 0, cw, vh, 0, k ? ph + g : 0, W, ph);
        });
      } else if (v && v.videoWidth) {
        const W = width;
        const H = height;
        const ar = v.videoWidth / v.videoHeight;
        ctx.filter = 'none';
        if (bg?.type === 'color') { ctx.fillStyle = bg.color || '#000'; ctx.fillRect(0, 0, W, H); } else {
          const amt = bg?.blur ?? 0.6;
          ctx.filter = `blur(${Math.max(1, 18 * amt)}px) brightness(${0.9 - 0.25 * amt})`;
          // A little larger than the frame, so the blur doesn't fade at the edges.
          const o = H * 0.06; const cw = (H + 2 * o) * ar;
          ctx.drawImage(v, (W - cw) / 2, -o, cw, H + 2 * o);
          ctx.filter = 'none';
          if (mode === 'stack3') { // same background above and below, like the export
            ctx.save(); ctx.translate(0, H); ctx.scale(1, -1);
            ctx.drawImage(ref.current, 0, 0, W, H / 2, 0, 0, W, H / 2);
            ctx.restore();
          }
        }
        const g = (gap ?? 18) * (W / 1080);
        const ph = W / ar;
        if (mode === 'stack3') {
          const y0 = (H - (3 * ph + 2 * g)) / 2;
          for (let k = 0; k < 3; k++) ctx.drawImage(v, 0, y0 + k * (ph + g), W, ph);
        } else ctx.drawImage(v, 0, (H - ph) / 2, W, ph);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [mode, bg?.type, bg?.color, bg?.blur, gap, width, height, colors?.join(), split?.join()]);
  return <canvas ref={ref} className="preview-canvas" width={width} height={height} style={filter ? { filter } : undefined} />;
}

/** "Help find the speaker": click the preacher's face in a few frames. Saved for future clips too. */
function SpeakerHelper({ project, clip, onClose, onDone }) {
  const [frames, setFrames] = useState(null);
  const [points, setPoints] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    api.post(`/api/projects/${project.id}/clips/${clip.id}/frames`, { count: 6 }).then((r) => setFrames(r.frames)).catch((e) => setError(e.message));
  }, []);
  const click = (i, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPoints({ ...points, [i]: { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } });
  };
  const done = Object.keys(points).length;
  const save = async () => {
    const anchors = Object.entries(points).filter(([, p]) => p).map(([i, p]) => ({ t: frames[i].t, x: +p.x.toFixed(4), y: +p.y.toFixed(4) }));
    await api.post('/api/speaker/hints', { points: anchors });
    onDone(anchors);
  };
  return (
    <Modal onClose={onClose} width={820} label="Help find the speaker">
      <h2>Click the speaker's face</h2>
      <p className="muted">One click per picture. Skip any where they're not in the shot. Your clicks also help future clips.</p>
      {error && <div className="banner bad">{error}</div>}
      {!frames && !error && <div className="face-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '16/9' }} />)}</div>}
      {frames && (
        <div className="face-grid">
          {frames.map((f, i) => (
            <div key={f.url} className={`face-cell ${points[i] !== undefined ? 'done' : ''}`} onClick={(e) => click(i, e)}>
              <img src={f.url} alt={`Frame at ${fmt(f.t)}`} />
              {points[i] && <span className="pin" style={{ left: `${points[i].x * 100}%`, top: `${points[i].y * 100}%` }} />}
              <button className="btn sm skip" onClick={(e) => { e.stopPropagation(); setPoints({ ...points, [i]: null }); }}>{points[i] === null ? 'Skipped' : 'Not in shot'}</button>
            </div>
          ))}
        </div>
      )}
      <div className="row between">
        <span className="muted small">{done} of {frames?.length || 6} done</span>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!Object.values(points).some(Boolean)} onClick={save}>Use these</button>
        </div>
      </div>
    </Modal>
  );
}

export default function ClipEditor({ project, transcript, clipId, onSelect, patch, jobs, onMore }) {
  const { themes, config, trackJob, onJobFinished, go, setGuard, confirmLeave, toast, reloadThemes } = useApp();
  const original = project.clips.find((c) => c.id === clipId) || project.clips[0];
  const h = useHistory(original);
  const clip = h.clip;
  const [saved, setSaved] = useState(original);
  const [tab, setTab] = useState('words');
  const [track, setTrack] = useState(null);
  const video = useRef(null);
  const [rel, setRel] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [helping, setHelping] = useState(false);
  const [selCue, setSelCue] = useState(null);
  const [templates, setTemplates] = useState({ last: null, templates: [] });
  const [offerLast, setOfferLast] = useState(false);
  const [hints, setHints] = useState(null);
  const [libPick, setLibPick] = useState(null); // 'overlay' | 'endCard'
  const drag = useRef(null);

  // Caption theme being edited live for this clip.
  const baseTheme = themes.video.find((t) => t.id === (clip.videoTheme || project.videoTheme || config.videoTheme)) || themes.video[0];
  const [themeDraft, setThemeDraft] = useState(baseTheme);
  const [themeDirty, setThemeDirty] = useState(false);
  useEffect(() => { if (!themeDirty) setThemeDraft(baseTheme); }, [baseTheme?.id, themes]);
  const setTheme = (p) => { setThemeDraft((d) => ({ ...d, ...p })); setThemeDirty(true); };

  useEffect(() => {
    h.reset(original); setSaved(original); setRel(0); setTrack(null); setSelCue(null); setThemeDirty(false);
    api.get('/api/edit-templates').then((t) => { setTemplates(t); setOfferLast(Boolean(t.last) && !original?.edited); }).catch(() => {});
  }, [original?.id]);
  useEffect(() => { api.get('/api/speaker').then(setHints).catch(() => {}); }, []);

  // ---- saving
  const merged = (cl) => project.clips.map((c) => (c.id === cl.id ? { ...c, ...cl, export: c.export, exports: c.exports, preview: c.preview, status: c.status === 'proposed' ? 'kept' : c.status } : c));
  const dirty = !same(clip, saved) || themeDirty;
  const save = async () => {
    let next = { ...clip, edited: true };
    if (themeDirty) {
      const body = { ...themeDraft, id: themeDraft.builtin ? undefined : themeDraft.id, name: themeDraft.builtin ? `${themeDraft.name} (edited)` : themeDraft.name };
      const { theme } = await api.post('/api/themes/video', body);
      await reloadThemes();
      next = { ...next, videoTheme: theme.id };
      setThemeDirty(false);
    }
    await patch({ clips: merged(next) });
    h.reset(next);
    setSaved(next);
  };
  const discard = () => { h.reset(saved); setThemeDraft(baseTheme); setThemeDirty(false); };
  const latest = useRef({});
  latest.current = { dirty, save, discard };
  useEffect(() => {
    setGuard({ dirty: () => latest.current.dirty, save: () => latest.current.save(), discard: () => latest.current.discard() });
    return () => setGuard(null);
  }, []);
  // Moving to another clip saves this one first, so nothing is lost while flipping through.
  const selectClip = async (id) => { if (latest.current.dirty) await latest.current.save(); onSelect(id); };

  // ---- speaker track
  const loadTrack = useCallback(() => {
    fetch(media(project.id, `tracks/${clip.id}.json`)).then((r) => (r.ok ? r.json() : null)).then(setTrack).catch(() => setTrack(null));
  }, [project.id, clip?.id]);
  useEffect(() => { if (clip) loadTrack(); }, [clip?.id]);
  useEffect(() => onJobFinished((j) => { if (j.kind === 'track' && j.status === 'done') loadTrack(); }), [onJobFinished, loadTrack]);

  // ---- words, cuts, playback
  const words = transcript.words;
  const len = clip.end - clip.start;
  const keep = useMemo(() => keepSegments(words, clip), [words, clip.start, clip.end, clip.cutWords, clip.tightenPauses, clip.pauseMax]);
  const outLen = keptLength(keep);
  const cut = useMemo(() => new Set(clip.cutWords || []), [clip.cutWords]);
  const capWords = useMemo(() => words
    .map((w, i) => ({ ...w, i }))
    .filter((w) => w.end > clip.start && w.start < clip.end && !cut.has(w.i))
    .map((w) => ({ w: w.w, start: w.start - clip.start, end: w.end - clip.start })), [words, clip.start, clip.end, cut]);

  useEffect(() => {
    let raf;
    const tick = () => {
      const v = video.current;
      if (v) {
        let r = v.currentTime - clip.start;
        if (r >= len - 0.02 || r < -0.5) { v.pause(); v.currentTime = clip.start + (keep[0]?.[0] || 0); r = keep[0]?.[0] || 0; }
        else if (!keep.some(([s, e]) => r >= s && r < e)) {
          const next = keep.find(([s]) => s > r);
          if (next) { v.currentTime = clip.start + next[0]; r = next[0]; } else v.pause();
        }
        setRel(r);
        setPlaying(!v.paused);
      }
      // Playing: follow every frame. Paused: check a few times a second, which is plenty for seeks.
      if (v && v.paused) { raf = setTimeout(() => { raf = requestAnimationFrame(tick); }, 120); } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(raf); };
  }, [clip.start, clip.end, keep]);
  useEffect(() => { if (video.current) video.current.currentTime = clip.start + (keep[0]?.[0] || 0); }, [clip.id]);
  const seekRel = (t) => { if (video.current) video.current.currentTime = clip.start + Math.max(0, Math.min(len, t)); };
  const outTime = useMemo(() => {
    let acc = 0;
    for (const [s, e] of keep) { if (rel < e) return acc + Math.max(0, rel - s); acc += e - s; }
    return acc;
  }, [rel, keep]);
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) v.play(); else v.pause(); };

  useEffect(() => {
    const on = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); latest.current.save(); return; }
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? h.redo : h.undo)(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const font = findFont(themes, themeDraft?.font);
  const set = (p) => h.set((c) => ({ ...c, ...p }));
  // The helper chat sees this clip; a picked hook, title or caption lands here (and Undo takes it back).
  useHelperFocus({ kind: 'clip', id: project.id, clipId: clip.id }, (field, value) => {
    if (!['hook', 'title', 'summary'].includes(field)) return false;
    set({ [field]: value });
    return true;
  });

  // ---- framing
  // Wide (16:9) clips preview in a wide frame showing the whole shot, just like the export.
  const wide = clip.format === 'wide';
  const FW = wide ? 560 : FRAME_W;
  const A = (project.media?.width || 16) / (project.media?.height || 9);
  const FH = wide ? FW * 9 / 16 : FW * 16 / 9;
  const VW = FH * A;
  const crop = clip.crop || { mode: 'auto', smooth: 0 };
  const mode = crop.mode || 'auto';
  const smooth = crop.smooth ?? (crop.motion === 'glide' ? 1 : 0);
  const frac = Math.min(1, FW / VW);
  const cues = crop.cues || [];
  let x = 0.5;
  if (mode === 'manual') x = crop.x ?? 0.5;
  if (mode === 'cues') x = cueX(cues, rel, crop.x ?? 0.5);
  if (mode === 'auto' && track) {
    const f = sampleTrack(track.follow || track.x, track.fps, rel);
    const g = sampleTrack(track.glide || track.x, track.fps, rel);
    x = f * (1 - smooth) + g * smooth;
  }
  x = clampX(x, frac);
  const left = Math.min(0, Math.max(-(VW - FW), -(x * VW - FW / 2)));
  const canvasMode = mode === 'fit' || mode === 'stack3' || mode === 'split' || mode === 'lyric' || !project.media?.width;
  const setCrop = (p) => set({ crop: { ...crop, ...p } });
  const addCue = () => {
    const t = Math.round(rel * 10) / 10;
    const next = [...cues.filter((c) => Math.abs(c.t - t) > 0.05), { t, x: Math.round(x * 1000) / 1000, move: cues.length ? 'glide' : 'cut', dur: 1.5 }].sort((a, b) => a.t - b.t);
    setCrop({ mode: 'cues', cues: next });
    setSelCue(next.findIndex((c) => c.t === t));
  };
  const updateCue = (i, p) => setCrop({ cues: cues.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const removeCue = (i) => { setCrop({ cues: cues.filter((_, k) => k !== i) }); setSelCue(null); };
  const canDrag = !wide && (mode === 'manual' || (mode === 'cues' && selCue != null && cues[selCue]));
  const onPointerDown = (e) => { drag.current = { x0: e.clientX, start: x, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || !canDrag) return;
    const dx = e.clientX - d.x0;
    if (Math.abs(dx) > 4) d.moved = true;
    if (!d.moved) return;
    const nx = Math.round(clampX(d.start - dx / VW, frac) * 1000) / 1000;
    if (mode === 'manual') setCrop({ x: nx }); else updateCue(selCue, { x: nx });
  };
  const onPointerUp = () => { const d = drag.current; drag.current = null; if (!d?.moved) toggle(); };

  const busyKind = (k) => jobs.some((j) => j.kind === k && j.key?.endsWith(clip.id));
  const run = async (kind) => {
    try {
      await save();
      const { job } = await api.post(`/api/projects/${project.id}/clips/${clip.id}/${kind}`);
      trackJob(job);
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const current = project.clips.find((c) => c.id === clip.id);
  const idx = project.clips.findIndex((c) => c.id === clip.id);
  // The clips being worked on: kept and exported ones, plus this one if it isn't kept yet.
  const working = project.clips.filter((c) => c.status === 'kept' || c.status === 'exported' || c.id === clip.id);
  const wi = working.findIndex((c) => c.id === clip.id);
  const [exportAll, setExportAll] = useState(false);

  // ---- edit templates
  const applySettings = (st) => {
    const { exportOptions, ...rest } = st || {};
    h.set((c) => ({ ...c, ...rest, crop: { ...(c.crop || {}), ...(rest.crop || {}) } }));
    setOfferLast(false);
    toast({ text: 'Edit settings applied. Save to keep them.' });
  };
  const saveTemplate = async () => {
    const name = prompt('Name this edit template', 'My edit settings');
    if (!name) return;
    const { cues: _c, anchors: _a, x: _x, ...cropStyle } = crop;
    const exportOptions = templates.last?.exportOptions || config.exportOptions;
    const settings = { crop: cropStyle, videoTheme: clip.videoTheme || null, captions: clip.captions !== false, tightenPauses: Boolean(clip.tightenPauses), pauseMax: clip.pauseMax ?? 0.45, hookY: clip.hookY ?? null, overlay: clip.overlay || null, endCard: clip.endCard || null, introCard: clip.introCard || null, exportOptions };
    await api.post('/api/edit-templates', { name, settings });
    setTemplates(await api.get('/api/edit-templates'));
    toast({ text: `Saved template “${name}”.` });
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {exporting && <ExportDialog project={project} clips={[current || clip]} beforeExport={save} onClose={() => setExporting(false)} />}
      {exportAll && <ExportDialog project={project} clips={working} beforeExport={save} onClose={() => setExportAll(false)} />}
      {libPick && <LibraryPicker folder={libPick === 'overlay' ? 'Logos' : 'Graphics'} title={libPick === 'overlay' ? 'Pick a logo' : libPick === 'introCard' ? 'Pick an intro card' : 'Pick an end card'} onClose={() => setLibPick(null)}
        onPick={(i) => { if (libPick === 'overlay') set({ overlay: { rel: i.rel, corner: 'tr', size: 0.18, opacity: 1 } }); else if (libPick === 'introCard') set({ introCard: { rel: i.rel, seconds: 2.5, motion: 'fade' } }); else set({ endCard: { rel: i.rel, seconds: 3, motion: 'fade' } }); setLibPick(null); }} />}
      {helping && <SpeakerHelper project={project} clip={clip} onClose={() => setHelping(false)} onDone={async (anchors) => {
        setHelping(false);
        const next = { ...clip, crop: { ...crop, mode: 'auto', anchors } };
        h.set(next);
        await patch({ clips: merged(next) });
        setSaved(next);
        setHints(await api.get('/api/speaker'));
        const { job } = await api.post(`/api/projects/${project.id}/clips/${clip.id}/track`);
        trackJob(job);
      }} />}

      {(project.blank || project.needsMedia) && (
        <div className="banner info">
          <span className="grow">{project.needsMedia ? 'This project was shared without its video. Add the video from your computer to preview and export clips. The transcript and clips stay.' : 'Started from scratch. Add text pop-ups and color now, or bring in a video or recording to work from.'}</span>
          {window.desktop?.pickMedia && <button className="btn sm primary" onClick={async () => {
            const f = await window.desktop.pickMedia();
            if (!f) return;
            const { job } = await api.post(`/api/projects/${project.id}/source`, { file: f });
            trackJob(job);
            toast({ text: 'Adding it now. Transcribe it next to get captions.' });
          }}><Plus size={13} />Add a video or recording</button>}
        </div>
      )}
      <div className="glass panel stack" style={{ padding: 12, gap: 10 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            {onMore && <button className="btn ghost sm" onClick={async () => { if (latest.current.dirty) await latest.current.save(); onMore(); }}><ScissorsLineDashed size={14} />Cut more clips</button>}
            <span className="muted small">Clip {wi + 1} of {working.length} · changes save when you switch</span>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn sm" disabled={!working.length} onClick={async () => { if (latest.current.dirty) await latest.current.save(); setExportAll(true); }}><Download size={13} />Export all {working.length}</button>
            <button className="btn sm" onClick={async () => { if (latest.current.dirty) await latest.current.save(); go({ name: 'social', compose: { projectId: project.id, clipId: clip.id } }); }}><Send size={13} />Schedule</button>
            <button className="btn sm ghost" onClick={async () => { await latest.current.save(); toast({ text: 'Saved for later. Your clips are waiting in Videos.', celebrate: true }); go({ name: 'library' }); }}><Bookmark size={13} />Save for later</button>
          </div>
        </div>
        <div className="clip-strip">
          <button className="btn icon sm" aria-label="Previous clip" disabled={wi <= 0} onClick={() => selectClip(working[wi - 1].id)}>‹</button>
          <div className="clip-strip-list" role="tablist" aria-label="Kept clips">
            {working.map((c, i) => (
              <button key={c.id} role="tab" aria-selected={c.id === clip.id} className={`clip-pill ${c.id === clip.id ? 'on' : ''}`} onClick={() => c.id !== clip.id && selectClip(c.id)}>
                <strong>{i + 1}. {c.title}</strong>
                <span>{Math.round(c.end - c.start)}s · {c.export ? 'Exported' : c.edited ? 'Edited' : 'Not edited yet'}</span>
              </button>
            ))}
          </div>
          <button className="btn icon sm" aria-label="Next clip" disabled={wi >= working.length - 1} onClick={() => selectClip(working[wi + 1].id)}>›</button>
        </div>
      </div>

      <div className="glass panel row between wrap" style={{ padding: 12 }}>
        <strong className="truncate" style={{ minWidth: 0 }}>{clip.title}</strong>
        <div className="row wrap">
          <button className="btn ghost sm" disabled={!h.canUndo} onClick={h.undo} title="Undo (⌘Z)"><Undo2 size={15} />Undo</button>
          <button className="btn ghost sm" disabled={!h.canRedo} onClick={h.redo} title="Redo (⇧⌘Z)"><Redo2 size={15} />Redo</button>
          <select className="input" style={{ width: 'auto', minHeight: 30 }} value="" onChange={(e) => {
            const v = e.target.value;
            if (v === '__save') saveTemplate();
            else if (v === '__last') applySettings(templates.last);
            else { const t = templates.templates.find((x2) => x2.id === v); if (t) applySettings(t.settings); }
            e.target.value = '';
          }} aria-label="Edit templates">
            <option value="">Templates</option>
            {templates.last && <option value="__last">Use last export's settings</option>}
            {templates.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="__save">Save current as template…</option>
          </select>
          <button className="btn sm" disabled={busyKind('preview')} onClick={() => run('preview')}><Zap size={14} />{busyKind('preview') ? 'Rendering…' : 'Quick render'}</button>
          <button className={`btn sm ${dirty ? 'accent' : ''}`} disabled={!dirty} onClick={save} title="Save (⌘S)"><Save size={14} />{dirty ? 'Save' : 'Saved'}</button>
          <button className="btn primary" disabled={busyKind('export')} onClick={() => setExporting(true)}><Download size={15} />{busyKind('export') ? 'Exporting…' : current?.export ? 'Export again…' : 'Export…'}</button>
        </div>
      </div>

      {offerLast && (
        <div className="banner info">
          <Bookmark size={16} /><span className="grow">Use the settings from your last export (framing, captions, trims)?</span>
          <button className="btn sm primary" onClick={() => applySettings(templates.last)}>Use them</button>
          <button className="btn icon sm" aria-label="Not now" onClick={() => setOfferLast(false)}><X size={14} /></button>
        </div>
      )}

      <div className={`editor ${wide ? 'wide' : ''}`}>
        <div className="stack sticky-col">
          <div className={`vframe ${canDrag ? 'draggable' : ''}`} style={{ width: FW, aspectRatio: wide ? '16 / 9' : undefined }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            title={canDrag ? 'Drag sideways to aim the frame. Click to play or pause.' : 'Click to play or pause'}>
            <video ref={video} src={media(project.id, project.sourceFile)} preload="auto" playsInline
              style={canvasMode && !(wide && project.media?.width) ? { opacity: 0, width: 2, height: 2 } : { ...(wide ? { height: FH, width: FW, left: 0, objectFit: 'contain' } : { height: FH, width: VW, left }), filter: lookFilter(clip.look) }} />
            {canvasMode && !(wide && project.media?.width) && <CanvasFrame video={video} mode={project.media?.width ? mode : 'lyric'} colors={config.brandColors} bg={crop.bg} gap={crop.gap} split={crop.split} width={FW} height={Math.round(FH)} filter={lookFilter(clip.look)} />}
            {clip.look?.blur > 0 && project.media?.width > 0 && (wide || ['auto', 'manual', 'cues'].includes(mode)) && <div className="look-blur" style={{ backdropFilter: `blur(${(2 + clip.look.blur * 8).toFixed(1)}px)`, WebkitBackdropFilter: `blur(${(2 + clip.look.blur * 8).toFixed(1)}px)` }} aria-hidden="true" />}
            {(clip.popups || []).map((p) => <PopupPreview key={p.id} p={p} t={outTime} still={!playing} frameWidth={FW} accent={config.brandColors?.[1]} />)}
            {themeDraft && (
              <CaptionOverlay theme={themeDraft} font={font} words={clip.captions !== false ? capWords : []} t={rel} frameWidth={FW}
                hook={clip.hook} showHook={outTime < (themeDraft.hookDuration ?? 3.5) || tab === 'text'} hookY={clip.hookY} onHookDrag={(y) => set({ hookY: +y.toFixed(3) })} />
            )}
            {clip.overlay?.rel && (
              <img alt="" src={`/library/${clip.overlay.rel.split('/').map(encodeURIComponent).join('/')}`} style={{
                position: 'absolute', width: `${(clip.overlay.size ?? 0.18) * 100}%`, opacity: clip.overlay.opacity ?? 1, pointerEvents: 'none', zIndex: 3,
                ...(['tl', 'bl'].includes(clip.overlay.corner || 'tr') ? { left: '4.5%' } : { right: '4.5%' }),
                ...(['tl', 'tr'].includes(clip.overlay.corner || 'tr') ? { top: '6.5%' } : { bottom: '10.5%' }),
              }} />
            )}
            {clip.introCard?.rel && outTime < (clip.introCard.seconds ?? 2.5) && (() => {
              const r = Math.max(0, Math.min(1, ((clip.introCard.seconds ?? 2.5) - outTime) / 0.4)); const m = clip.introCard.motion || 'fade';
              return <img alt="" src={`/library/${clip.introCard.rel.split('/').map(encodeURIComponent).join('/')}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 4, pointerEvents: 'none', opacity: r, transform: m === 'slide' ? `translateY(${-(1 - r) * 12}%)` : m === 'zoom' ? `scale(${1 + (1 - r) * 0.06})` : 'none' }} />;
            })()}
            {clip.endCard?.rel && outTime >= outLen - (clip.endCard.seconds ?? 3) && (
              <img alt="" src={`/library/${clip.endCard.rel.split('/').map(encodeURIComponent).join('/')}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 4, pointerEvents: 'none' }} />
            )}
            {!playing && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--white)', fontSize: 46, textShadow: '0 4px 20px rgba(var(--shade-rgb), .4)', pointerEvents: 'none' }}>▶︎</div>}
          </div>
          <div className="transport" style={{ width: FW }}>
            <button className="btn icon sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <Scrubber value={Math.min(rel, len)} max={len} onChange={seekRel} words={capWords} marks={mode === 'cues' ? cues.map((c, i) => ({ t: c.t, on: i === selCue })) : []} label="Clip position" />
            <span className="mono num" style={{ flex: 'none' }}>{fmt(outTime)}/{fmt(outLen)}</span>
          </div>
          {mode === 'auto' && !track && !busyKind('track') && <p className="muted small" style={{ width: FW }}>Showing the center until the speaker is found.</p>}
          {current?.export && (
            <div className="banner info" style={{ width: FW, flexWrap: 'wrap' }}>
              <span>Exported {new Date(current.export.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              <button className="btn sm" onClick={() => api.post('/api/reveal', { path: current.export.file })}><FolderOpen size={13} />Show</button>
              <button className="btn sm" onClick={() => go({ name: 'social', compose: { projectId: project.id, clipId: clip.id } })}><Send size={13} />Post</button>
            </div>
          )}
        </div>

        <section className="glass strong panel">
          <div className="tabs">
            {[['words', 'Words & trim'], ['text', 'Title & hook'], ['look', 'Captions'], ['crop', 'Framing'], ['popups', 'Pop-ups'], ['gfx', 'Graphics'], ['sound', 'Sound']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === 'words' && <WordsTab words={words} clip={clip} set={set} cut={cut} rel={rel} outLen={outLen} seek={(t) => { video.current.currentTime = t; }} />}

          {tab === 'text' && (
            <div className="stack" style={{ gap: 14 }}>
              <label className="field">Title<input className="input" value={clip.title} onChange={(e) => set({ title: e.target.value })} /></label>
              <label className="field">On-screen hook <span className="hint">Shown at the start. Drag it in the preview to move it.</span>
                <input className="input" value={clip.hook || ''} placeholder="You can't earn this." onChange={(e) => set({ hook: e.target.value })} />
              </label>
              {clip.hook && themeDraft && (
                <>
                  <div className="row between"><h3>Hook style</h3><span className="muted small">Part of the “{themeDraft.name}” caption theme</span></div>
                  <HookStyleFields draft={themeDraft} set={setTheme} />
                  {clip.hookY != null && <button className="btn ghost sm" onClick={() => set({ hookY: null })}>Use the theme's position</button>}
                </>
              )}
              <hr className="hairline" />
              <label className="field">Post caption<textarea className="input" value={clip.summary || ''} onChange={(e) => set({ summary: e.target.value })} /></label>
              <label className="field">Hashtags <span className="hint">Comma separated</span>
                <input className="input" value={(clip.hashtags || []).join(', ')} onChange={(e) => set({ hashtags: e.target.value.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean) })} />
              </label>
            </div>
          )}

          {tab === 'look' && (
            <div className="stack" style={{ gap: 14 }}>
              <div className="row between wrap">
                <label className="switch"><input type="checkbox" checked={clip.captions !== false} onChange={(e) => set({ captions: e.target.checked })} />Captions {clip.captions !== false ? 'on' : 'off'}</label>
                <select className="input" style={{ width: 'auto' }} value={clip.videoTheme || ''} onChange={(e) => { set({ videoTheme: e.target.value || null }); setThemeDirty(false); }}>
                  <option value="">Default theme ({themes.video.find((t) => t.id === (project.videoTheme || config.videoTheme))?.name})</option>
                  {themes.video.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {clip.captions !== false && themeDraft && (
                <>
                  <CaptionStyleFields draft={themeDraft} set={setTheme} />
                  <div className="row wrap">
                    <button className="btn primary sm" disabled={!themeDirty} onClick={async () => {
                      const name = themeDraft.builtin ? prompt('Name this caption template', `${themeDraft.name} (mine)`) : themeDraft.name;
                      if (!name) return;
                      const { theme } = await api.post('/api/themes/video', { ...themeDraft, id: themeDraft.builtin ? undefined : themeDraft.id, name });
                      await reloadThemes();
                      setThemeDirty(false);
                      set({ videoTheme: theme.id });
                      toast({ text: `Saved caption template “${theme.name}”.` });
                    }}><Save size={14} />Save caption template</button>
                    <button className="btn sm" onClick={() => patch({ videoTheme: clip.videoTheme || themeDraft.id })}>Use for every clip in this sermon</button>
                    {themeDirty && <button className="btn ghost sm" onClick={() => { setThemeDraft(baseTheme); setThemeDirty(false); }}>Reset style</button>}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'gfx' && (
            <div className="stack" style={{ gap: 14 }}>
              <div className="keycard">
                <div className="row between"><strong>Logo in the corner</strong>
                  {clip.overlay?.rel ? <button className="btn ghost sm danger" onClick={() => set({ overlay: null })}>Remove</button> : <button className="btn sm" onClick={() => setLibPick('overlay')}>Pick a logo</button>}
                </div>
                {clip.overlay?.rel && (
                  <>
                    <span className="muted small truncate">{clip.overlay.rel.split('/').pop()}</span>
                    <div className="seg">{[['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']].map(([k, l]) => <button key={k} className={(clip.overlay.corner || 'tr') === k ? 'on' : ''} onClick={() => set({ overlay: { ...clip.overlay, corner: k } })}>{l}</button>)}</div>
                    <div className="token-grid">
                      <label className="field">Size · {Math.round((clip.overlay.size ?? 0.18) * 100)}%<input type="range" min="0.06" max="0.5" step="0.01" value={clip.overlay.size ?? 0.18} onChange={(e) => set({ overlay: { ...clip.overlay, size: Number(e.target.value) } })} /></label>
                      <label className="field">Opacity · {Math.round((clip.overlay.opacity ?? 1) * 100)}%<input type="range" min="0.2" max="1" step="0.05" value={clip.overlay.opacity ?? 1} onChange={(e) => set({ overlay: { ...clip.overlay, opacity: Number(e.target.value) } })} /></label>
                    </div>
                  </>
                )}
              </div>
              <div className="keycard">
                <div className="row between"><strong>Intro card</strong>
                  {clip.introCard?.rel ? <button className="btn ghost sm danger" onClick={() => set({ introCard: null })}>Remove</button> : <button className="btn sm" onClick={() => setLibPick('introCard')}>Pick a graphic</button>}
                </div>
                <span className="hint">A full-screen graphic for the first seconds, like your series title. It moves out as the clip begins.</span>
                {clip.introCard?.rel && (
                  <>
                    <label className="field">Shows for the first · {(clip.introCard.seconds ?? 2.5).toFixed(1)}s
                      <input type="range" min="1" max="6" step="0.5" value={clip.introCard.seconds ?? 2.5} onChange={(e) => set({ introCard: { ...clip.introCard, seconds: Number(e.target.value) } })} />
                    </label>
                    <div className="seg sm">{[['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom']].map(([k, l]) => <button key={k} className={(clip.introCard.motion || 'fade') === k ? 'on' : ''} onClick={() => set({ introCard: { ...clip.introCard, motion: k } })}>{l}</button>)}</div>
                  </>
                )}
              </div>
              <div className="keycard">
                <div className="row between"><strong>End card</strong>
                  {clip.endCard?.rel ? <button className="btn ghost sm danger" onClick={() => set({ endCard: null })}>Remove</button> : <button className="btn sm" onClick={() => setLibPick('endCard')}>Pick a graphic</button>}
                </div>
                <span className="hint">A full-screen graphic for the last few seconds, like “Join us Sunday”. Make one in Design.</span>
                {clip.endCard?.rel && (
                  <label className="field">Shows for the last · {(clip.endCard.seconds ?? 3).toFixed(1)}s
                    <input type="range" min="1" max="8" step="0.5" value={clip.endCard.seconds ?? 3} onChange={(e) => set({ endCard: { ...clip.endCard, seconds: Number(e.target.value) } })} />
                  </label>
                )}
                {clip.endCard?.rel && <div className="seg sm">{[['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom']].map(([k, l]) => <button key={k} className={(clip.endCard.motion || 'fade') === k ? 'on' : ''} onClick={() => set({ endCard: { ...clip.endCard, motion: k } })}>{l}</button>)}</div>}
                <button className="btn ghost sm" onClick={() => go({ name: 'graphics' })}>Make one in Design</button>
              </div>
            </div>
          )}

          {tab === 'popups' && <PopupsTab clip={clip} set={set} now={outTime} len={outLen} />}

          {tab === 'sound' && (
            <div className="stack" style={{ gap: 12 }}>
              <div className="row between wrap">
                <h3>Clean up the sound</h3>
                {clip.audioCleanup === undefined && project.audioCleanup && <span className="chip">Using the sermon's setting</span>}
              </div>
              <AudioCleanup value={clip.audioCleanup === undefined ? project.audioCleanup : clip.audioCleanup} onChange={(v) => set({ audioCleanup: v })} source={{ projectId: project.id }} compact />
              <span className="hint">Applies when you preview or export this clip.</span>
            </div>
          )}

          {tab === 'crop' && (
            <div className="stack" style={{ gap: 14 }}>
              {wide && project.media?.width > 0 && <div className="keycard small muted">Wide clips keep the whole shot, just like the export.</div>}
              {!(wide && project.media?.width > 0) && (<>
              <div className="choices">
                {[['auto', 'Follow speaker', 'Moves with the preacher.'],
                  ['cues', 'By timestamp', 'Cut or glide where you choose.'],
                  ['manual', 'Fixed', 'One steady frame.'],
                  ['fit', 'Whole frame', 'Full shot on a background.'],
                  ['stack3', 'Three stack', 'The full shot, three times.'],
                  ['split', 'Two speakers', 'One person on top, one below.'],
                  ['lyric', 'Moving color', 'No video. Captions on your brand colors.']].filter(([m]) => project.media?.width || m === 'lyric').map(([m, t, d]) => (
                  <button key={m} className={`choice ${mode === m ? 'on' : ''}`} onClick={() => setCrop({ mode: m, ...(m === 'manual' && crop.x == null ? { x } : {}) })}>
                    <span className="t"><span className="radio" />{t}</span><span className="d">{d}</span>
                  </button>
                ))}
              </div>

              {mode === 'auto' && (
                <div className="keycard">
                  <div className="row between wrap">
                    <strong>Movement</strong>
                    {busyKind('track') ? <span className="chip warn">Finding the speaker…</span>
                      : track ? <span className={`chip ${track.info?.fallback ? 'warn' : 'ok'}`}>{track.info?.fallback ? 'No steady face found' : `Found in ${track.info?.found} of ${track.info?.samples} checks`}</span>
                        : <span className="chip">Not found yet</span>}
                  </div>
                  <div className="stack" style={{ gap: 4 }}>
                    <input type="range" min="0" max="1" step="0.05" value={smooth} onChange={(e) => setCrop({ smooth: Number(e.target.value), motion: undefined })} aria-label="Follow closely to smooth glide" />
                    <div className="row between small muted"><span>Follow closely</span><span>Smooth glide</span></div>
                  </div>
                  <div className="row wrap">
                    <button className="btn sm" disabled={busyKind('track')} onClick={() => run('track')}><Crosshair size={14} />{track ? 'Find again' : 'Find the speaker'}</button>
                    <button className="btn sm" onClick={() => setHelping(true)}><MousePointerClick size={14} />Help find the speaker</button>
                    <button className="btn ghost sm" onClick={() => { setCrop({ mode: 'cues', cues: [{ t: 0, x, move: 'cut', dur: 1.5 }] }); setSelCue(0); }}>Fine-tune with cues</button>
                  </div>
                  {(crop.anchors?.length || hints?.count) ? (
                    <span className="hint">{crop.anchors?.length ? `${crop.anchors.length} clicks on this clip. ` : ''}{hints?.count ? `${hints.count} saved hints help every clip. ` : ''}
                      {hints?.count > 0 && <a href="#" onClick={async (e) => { e.preventDefault(); setHints(await api.del('/api/speaker/hints')); }}>Clear saved hints</a>}
                    </span>
                  ) : null}
                </div>
              )}

              {mode === 'cues' && (
                <div className="keycard">
                  <div className="row between"><strong>Cues</strong><button className="btn primary sm" onClick={addCue}><Plus size={14} />Add cue at {fmt(rel)}</button></div>
                  <Scrubber value={Math.min(rel, len)} max={len} onChange={seekRel} words={capWords} marks={cues.map((c, i) => ({ t: c.t, on: i === selCue }))} height={10} label="Pick a moment" />
                  <span className="hint">Scrub to a word, add a cue, then drag the picture to aim it.</span>
                  {!cues.length && <p className="muted small">No cues yet.</p>}
                  {cues.map((c, i) => (
                    <div key={i} className="row wrap" style={{ padding: '6px 8px', borderRadius: 12, background: selCue === i ? 'var(--accent-soft)' : 'transparent' }} onClick={() => setSelCue(i)}>
                      <button className="btn sm num" title="Jump here" onClick={() => seekRel(c.t)}>{fmt(c.t)}.{Math.round((c.t % 1) * 10)}</button>
                      {i === 0 ? <span className="chip">Opening</span> : (
                        <div className="seg">
                          <button className={c.move !== 'glide' ? 'on' : ''} onClick={() => updateCue(i, { move: 'cut' })}>Cut</button>
                          <button className={c.move === 'glide' ? 'on' : ''} onClick={() => updateCue(i, { move: 'glide' })}>Glide</button>
                        </div>
                      )}
                      {i > 0 && c.move === 'glide' && (
                        <label className="row small">over<input className="input num" style={{ width: 70, minHeight: 30 }} type="number" min="0.2" max="10" step="0.1" value={c.dur ?? 1.5} onChange={(e) => updateCue(i, { dur: Number(e.target.value) })} />s</label>
                      )}
                      <input type="range" aria-label="Framing position" min="0" max="1" step="0.005" style={{ width: 120 }} value={c.x} onChange={(e) => updateCue(i, { x: Number(e.target.value) })} />
                      <button className="btn ghost sm" onClick={() => updateCue(i, { t: Math.round(rel * 10) / 10 })}>Move to playhead</button>
                      <button className="btn icon sm danger" aria-label="Delete cue" onClick={(e) => { e.stopPropagation(); removeCue(i); }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}

              {mode === 'manual' && (
                <label className="field">Position · {Math.round((crop.x ?? 0.5) * 100)}% <span className="hint">Or drag the picture.</span>
                  <input type="range" min="0" max="1" step="0.005" value={crop.x ?? 0.5} onChange={(e) => setCrop({ x: Number(e.target.value) })} />
                </label>
              )}

              {canvasMode && (
                <div className="keycard">
                  <strong>Background</strong>
                  <div className="seg">
                    <button className={(crop.bg?.type || 'blur') === 'blur' ? 'on' : ''} onClick={() => setCrop({ bg: { ...(crop.bg || {}), type: 'blur' } })}>Blurred video</button>
                    <button className={crop.bg?.type === 'color' ? 'on' : ''} onClick={() => setCrop({ bg: { ...(crop.bg || {}), type: 'color', color: crop.bg?.color || '#111111' } })}>Solid color</button>
                  </div>
                  {crop.bg?.type === 'color'
                    ? <ColorField label="Background color" value={crop.bg.color || '#111111'} onChange={(c) => setCrop({ bg: { ...crop.bg, color: c } })} />
                    : <label className="field">Blur · {Math.round((crop.bg?.blur ?? 0.6) * 100)}%<input type="range" min="0.1" max="1" step="0.05" value={crop.bg?.blur ?? 0.6} onChange={(e) => setCrop({ bg: { ...(crop.bg || { type: 'blur' }), blur: Number(e.target.value) } })} /></label>}
                  {mode === 'split' && (
                    <div className="keycard stack" style={{ gap: 8 }}>
                      <strong className="small">Who goes where</strong>
                      {[0, 1].map((k) => (
                        <label key={k} className="field small">{k ? 'Bottom person' : 'Top person'} · {Math.round((crop.split?.[k] ?? [0.3, 0.7][k]) * 100)}% across
                          <input type="range" min="0" max="1" step="0.01" value={crop.split?.[k] ?? [0.3, 0.7][k]} onChange={(e) => { const sp = [...(crop.split || [0.3, 0.7])]; sp[k] = Number(e.target.value); setCrop({ split: sp }); }} />
                        </label>
                      ))}
                      <div className="row wrap" style={{ gap: 6 }}>
                        <button className="btn sm" onClick={() => setCrop({ split: [...(crop.split || [0.3, 0.7])].reverse() })}>Swap top and bottom</button>
                        <label className="field small" style={{ minWidth: 160 }}>Line between · {crop.gap ?? 8}px<input type="range" min="0" max="40" value={crop.gap ?? 8} onChange={(e) => setCrop({ gap: Number(e.target.value) })} /></label>
                      </div>
                      <span className="hint">Great for interviews, panels and two hosts. Slide each one until that person is centered.</span>
                    </div>
                  )}
                  {mode === 'stack3' && <label className="field">Space between · {crop.gap ?? 18}px<input type="range" min="0" max="60" value={crop.gap ?? 18} onChange={(e) => setCrop({ gap: Number(e.target.value) })} /></label>}
                </div>
              )}
              </>)}
              {project.media?.width > 0 && mode !== 'lyric' && <StudioLook look={clip.look} blurOk={wide || ['auto', 'manual', 'cues'].includes(mode)} onChange={(look) => set({ look })} />}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function WordsTab({ words, clip, set, cut, rel, outLen, seek }) {
  const firstIn = words.findIndex((w) => w.end > clip.start);
  let lastIn = words.findIndex((w) => w.start >= clip.end);
  lastIn = lastIn < 0 ? words.length - 1 : lastIn - 1;
  const lo = Math.max(0, firstIn - 30);
  const hi = Math.min(words.length - 1, lastIn + 30);
  const toggleCut = (i) => {
    const next = new Set(cut);
    if (next.has(i)) next.delete(i); else next.add(i);
    set({ cutWords: [...next].sort((a, b) => a - b) });
  };
  const nudge = (edge, dir) => {
    if (edge === 'start') {
      const i = Math.max(0, Math.min(lastIn - 1, firstIn + dir));
      set({ start: Math.max(0, words[i].start - 0.12) });
    } else {
      const i = Math.max(firstIn + 1, Math.min(words.length - 1, lastIn + dir));
      set({ end: words[i].end + 0.3 });
    }
  };
  const fillers = () => {
    const next = new Set(cut);
    for (let i = firstIn; i <= lastIn; i++) if (FILLERS.has(words[i].w.toLowerCase().replace(/[^a-z]/g, ''))) next.add(i);
    set({ cutWords: [...next].sort((a, b) => a - b) });
  };
  const absNow = clip.start + rel;
  const pauseMax = clip.pauseMax ?? 0.45;
  return (
    <div className="stack">
      <div className="nudge-bar">
        <div className="row"><span className="small" style={{ fontWeight: 600 }}>Start</span><button className="btn sm" onClick={() => nudge('start', -1)}>◀ Earlier</button><button className="btn sm" onClick={() => nudge('start', 1)}>Later ▶</button></div>
        <div className="row"><span className="small" style={{ fontWeight: 600 }}>End</span><button className="btn sm" onClick={() => nudge('end', -1)}>◀ Earlier</button><button className="btn sm" onClick={() => nudge('end', 1)}>Later ▶</button></div>
      </div>
      <div className="row wrap">
        <label className="row small"><input type="checkbox" checked={Boolean(clip.tightenPauses)} onChange={(e) => set({ tightenPauses: e.target.checked })} />Trim pauses</label>
        {clip.tightenPauses && (
          <label className="row small muted">longer than <strong className="num" style={{ color: 'var(--ink)', width: 40 }}>{pauseMax.toFixed(2)}s</strong>
            <input type="range" min="0.2" max="1.5" step="0.05" value={pauseMax} onChange={(e) => set({ pauseMax: Number(e.target.value) })} style={{ width: 120 }} aria-label="Shortest pause to trim" />
          </label>
        )}
        <button className="btn sm" onClick={fillers}>Cut “um” and “uh”</button>
        <button className="btn ghost sm" disabled={!cut.size} onClick={() => set({ cutWords: [] })}>Restore all words</button>
        <span className="chip accent num">{fmt(outLen)} long</span>
      </div>
      <hr className="hairline" />
      <p className="muted small">Click a word to cut it. Click a grey word to extend the clip. Double-click to jump there.</p>
      <div className="words">
        {words.slice(lo, hi + 1).map((w, k) => {
          const i = lo + k;
          const out = i < firstIn || i > lastIn;
          const now = absNow >= w.start && absNow < w.end;
          return (
            <span key={i} className={`wd ${out ? 'out' : ''} ${cut.has(i) ? 'cut' : ''} ${now ? 'now' : ''}`}
              onClick={() => { if (i < firstIn) set({ start: Math.max(0, w.start - 0.12) }); else if (i > lastIn) set({ end: w.end + 0.3 }); else toggleCut(i); }}
              onDoubleClick={() => seek(w.start)}>{w.w} </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- studio look
/** A quick lighting pass, tucked in one card so the Framing tab stays simple. */
function StudioLook({ look, blurOk, onChange }) {
  const [open, setOpen] = useState(hasLook(look));
  const l = { preset: 'none', strength: 1, light: 0, blur: 0, ...(look || {}) };
  const set = (p) => { const n = { ...l, ...p }; onChange(hasLook(n) ? n : null); };
  const summary = [LOOKS.find(([k]) => k === l.preset)?.[1], l.light > 0 && 'lighting lift', l.blur > 0 && 'background blur'].filter((x) => x && x !== 'Original').join(' · ');
  return (
    <div className="keycard stack" style={{ gap: 10 }}>
      <button className="row between photo-edits-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="stack" style={{ gap: 0, textAlign: 'left' }}><strong className="small">Studio look</strong><span className="muted" style={{ fontSize: 12 }}>{summary || 'Color, lighting and a soft background'}</span></span>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--fast) var(--ease)' }} />
      </button>
      {open && (
        <>
          <div className="look-grid">{LOOKS.map(([k, label]) => <button key={k} className={`pill-choice ${l.preset === k ? 'on' : ''}`} onClick={() => set({ preset: k })}>{label}</button>)}</div>
          {l.preset !== 'none' && <label className="field small">Look strength · {Math.round(l.strength * 100)}%<input type="range" min="0.1" max="1" step="0.05" value={l.strength} onChange={(e) => set({ strength: Number(e.target.value) })} /></label>}
          <label className="field small">Lighting lift · {Math.round(l.light * 100)}%<input type="range" min="0" max="1" step="0.05" value={l.light} onChange={(e) => set({ light: Number(e.target.value) })} /><span className="hint">Brightens faces and shadows without blowing out bright spots.</span></label>
          {blurOk && <label className="field small">Background blur · {Math.round(l.blur * 100)}%<input type="range" min="0" max="1" step="0.05" value={l.blur} onChange={(e) => set({ blur: Number(e.target.value) })} /><span className="hint">Softens the edges of the frame and keeps the middle sharp, where the speaker is.</span></label>}
          {hasLook(l) && <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => onChange(null)}>Back to original</button>}
          <span className="hint">The preview is close. The export applies it exactly, under your captions and graphics.</span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- text pop-ups
const onColorHex = (hex) => { const h = String(hex).replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#141821' : '#FFFFFF'; };
const PSTYLES = [['pill', 'Pill'], ['lower', 'Lower third'], ['plain', 'Plain']];
const PPOS = [['top', 'Top'], ['middle', 'Middle'], ['lower', 'Lower']];
const PTRANS = [['fade', 'Fade'], ['slide', 'Slide up'], ['pop', 'Pop']];

/** How a pop-up looks at time t: hidden, coming in, showing, or going out. Matches the export. */
function popupState(p, t) {
  if (t < p.start || t > p.end) return null;
  const d = p.transition === 'pop' ? 0.18 : 0.35;
  const r = Math.max(0, Math.min(1, (t - p.start) / d, (p.end - t) / d));
  return { r, dy: p.transition === 'slide' ? (1 - r) * 46 : 0, scale: p.transition === 'pop' ? 0.85 + 0.15 * r : 1 };
}

/** Each shape's starting colors. A pop-up's own colors and size override these. Mirrors popup_image() in render_clip.py. */
export const POPUP_LOOK = {
  pill: { color: '#141821', bg: '#FFFFFF', bgOpacity: 0.92, size: 50 },
  lower: { color: '#FFFFFF', bg: '#0C0E14', bgOpacity: 0.78, size: 44 },
  plain: { color: '#FFFFFF', bg: null, bgOpacity: 0, size: 50 },
};
const hexA = (hex, a) => { const h = String(hex || '#000000').replace('#', '').padEnd(6, '0'); return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`; };

function PopupPreview({ p, t, frameWidth, accent, still }) {
  const st = popupState(p, t);
  if (!st) return null;
  // Paused: show it fully, so a new pop-up never looks hidden at the start of its fade.
  const s = still ? { r: 1, dy: 0, scale: 1 } : st;
  const k = frameWidth / 1080;
  const top = { top: '12%', middle: '44%', lower: '70%' }[p.position || 'lower'];
  const style = p.style || 'pill';
  const base = POPUP_LOOK[style] || POPUP_LOOK.pill;
  const bg = style === 'plain' ? undefined : hexA(p.bg || base.bg, p.bgOpacity ?? base.bgOpacity);
  return (
    <div className={`popup-prev ${style}`} style={{
      top, opacity: s.r, transform: `translate(${style === 'lower' ? '0' : '-50%'}, ${s.dy * k}px) scale(${s.scale})`,
      left: style === 'lower' ? '6%' : '50%', fontSize: (p.size || base.size) * k, '--pa': p.accent || accent || 'var(--accent-2)',
      color: p.color || base.color, background: bg, textTransform: p.uppercase ? 'uppercase' : undefined,
    }}>{String(p.text || '').split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>
  );
}

function PopupsTab({ clip, set, now, len }) {
  const { config } = useApp();
  const list = clip.popups || [];
  const cal = useChurchEvents();
  const [pickEvent, setPickEvent] = useState(false);
  const save = (next) => set({ popups: next });
  const up = (id, patch) => save(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = (text = 'Your text here') => {
    const start = +Math.min(Math.max(0, now), Math.max(0, len - 1)).toFixed(1);
    save([...list, { id: Math.random().toString(36).slice(2, 8), text, start, end: +Math.min(len, start + 4).toFixed(1), position: 'lower', style: 'pill', transition: 'fade' }]);
  };
  const eventText = (e) => `${e.title}\n${new Date(e.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}${e.allDay ? '' : ` · ${new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}`;
  const upcoming = cal.events.filter((e) => new Date(e.start) >= new Date()).slice(0, 12);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="stack" style={{ gap: 0 }}><h3>Text pop-ups</h3><span className="small muted">Short text that comes in and out, like a name, a verse or an event.</span></div>
        <div className="row" style={{ gap: 6 }}>
          {cal.linked && (
            <div style={{ position: 'relative' }}>
              <button className="btn sm" data-pop-trigger onClick={() => setPickEvent(!pickEvent)}><CalendarDays size={13} />From calendar</button>
              <Popover open={pickEvent} onClose={() => setPickEvent(false)} align="right" width={300}>
                <div className="pop-list">
                  {upcoming.length ? upcoming.map((e) => <button key={e.id} className="pop-item" onClick={() => { add(eventText(e)); setPickEvent(false); }}>{e.title}<span className="pop-hint">{new Date(e.start).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></button>) : <div className="pop-empty">No upcoming events.</div>}
                </div>
              </Popover>
            </div>
          )}
          <button className="btn primary sm" onClick={() => add()}><Plus size={13} />Add at {fmt(now)}</button>
        </div>
      </div>
      {!list.length && <div className="keycard small muted">Play to the moment you want, then press Add. Pop-ups show in the preview and the export.</div>}
      {list.map((p) => (
        <div key={p.id} className="keycard stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <textarea className="input grow" rows={2} value={p.text} onChange={(e) => up(p.id, { text: e.target.value })} aria-label="Pop-up text" />
            <button className="rt-btn" aria-label="Remove pop-up" title="Remove" onClick={() => save(list.filter((x) => x.id !== p.id))}><Trash2 size={14} /></button>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            <label className="field small">Starts<div className="row" style={{ gap: 4 }}><input className="input num" style={{ width: 70 }} type="number" step="0.1" min="0" max={len} value={p.start} onChange={(e) => up(p.id, { start: Number(e.target.value) })} /><button className="btn ghost sm" onClick={() => up(p.id, { start: +now.toFixed(1) })}>Now</button></div></label>
            <label className="field small">Ends<div className="row" style={{ gap: 4 }}><input className="input num" style={{ width: 70 }} type="number" step="0.1" min="0" max={len} value={p.end} onChange={(e) => up(p.id, { end: Number(e.target.value) })} /><button className="btn ghost sm" onClick={() => up(p.id, { end: +now.toFixed(1) })}>Now</button></div></label>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="seg sm">{PSTYLES.map(([k, l]) => <button key={k} className={(p.style || 'pill') === k ? 'on' : ''} onClick={() => up(p.id, { style: k })}>{l}</button>)}</div>
            <div className="seg sm">{PPOS.map(([k, l]) => <button key={k} className={(p.position || 'lower') === k ? 'on' : ''} onClick={() => up(p.id, { position: k })}>{l}</button>)}</div>
            <div className="seg sm">{PTRANS.map(([k, l]) => <button key={k} className={(p.transition || 'fade') === k ? 'on' : ''} onClick={() => up(p.id, { transition: k })}>{l}</button>)}</div>
          </div>
          <details className="pop-style">
            <summary className="small">Colors and size</summary>
            {(() => {
              const base = POPUP_LOOK[p.style || 'pill'] || POPUP_LOOK.pill;
              const brand = config.brandColors || [];
              return (
                <div className="stack" style={{ gap: 10, paddingTop: 10 }}>
                  {brand.length > 0 && (
                    <div className="row wrap" style={{ gap: 6 }}>
                      <span className="small muted">Brand looks</span>
                      {brand.slice(0, 5).map((c) => (
                        <button key={c} className="swatch-btn" title={`Background ${c}`} style={{ background: c }} onClick={() => up(p.id, { bg: c, bgOpacity: 0.94, color: onColorHex(c), style: p.style === 'plain' ? 'pill' : p.style })} />
                      ))}
                    </div>
                  )}
                  <div className="token-grid">
                    <ColorRow label="Text" color={p.color || base.color} onColor={(v) => up(p.id, { color: v })} />
                    {(p.style || 'pill') !== 'plain' && <ColorRow label="Background" color={p.bg || base.bg} opacity={p.bgOpacity ?? base.bgOpacity} onColor={(v) => up(p.id, { bg: v })} onOpacity={(v) => up(p.id, { bgOpacity: v })} />}
                    {p.style === 'lower' && <ColorRow label="Accent bar" color={p.accent || brand[1] || '#D9A441'} onColor={(v) => up(p.id, { accent: v })} />}
                    <label className="field">Size · {p.size || base.size}<input type="range" min="28" max="110" value={p.size || base.size} onChange={(e) => up(p.id, { size: Number(e.target.value) })} /></label>
                    <label className="row small" style={{ alignSelf: 'end' }}><input type="checkbox" checked={Boolean(p.uppercase)} onChange={(e) => up(p.id, { uppercase: e.target.checked })} />ALL CAPS</label>
                  </div>
                  {(p.color || p.bg || p.size || p.uppercase || p.accent) && <button className="btn ghost sm" onClick={() => up(p.id, { color: null, bg: null, bgOpacity: null, size: null, uppercase: false, accent: null })}>Reset look</button>}
                </div>
              );
            })()}
          </details>
          {p.end <= p.start && <span className="small" style={{ color: 'var(--bad)' }}>End needs to be after the start.</span>}
        </div>
      ))}
    </div>
  );
}
