import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, Download, Zap, Plus, Trash2, Crosshair, Play, Pause, Send, FolderOpen, Save, MousePointerClick, Bookmark, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, fmt, media } from '../api.js';
import CaptionOverlay, { findFont } from '../components/CaptionOverlay.jsx';
import ExportDialog from '../components/ExportDialog.jsx';
import Scrubber from '../components/Scrubber.jsx';
import Modal from '../components/Modal.jsx';
import LibraryPicker from '../components/LibraryPicker.jsx';
import { CaptionStyleFields, HookStyleFields } from '../components/VideoThemeEditor.jsx';
import { keepSegments, keptLength } from '../captions.js';
import { sampleTrack, cueX, clampX } from '../framing.js';
import ColorField from '../components/ColorField.jsx';

const FILLERS = new Set(['um', 'uh', 'uhm', 'umm', 'er', 'erm', 'ah']);
const FRAME_W = 340;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Undo/redo over a clip's editable state (VGP CL10 pattern). */
function useHistory(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  const set = useCallback((next) => setState((s) => ({ past: [...s.past.slice(-80), s.present], present: typeof next === 'function' ? next(s.present) : next, future: [] })), []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1), future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback((v) => setState({ past: [], present: v, future: [] }), []);
  return { clip: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

/** Whole-frame and three-stack previews: draw the video into a canvas over a blurred or solid background. */
function CanvasFrame({ video, mode, bg, gap, width, height }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const ctx = ref.current.getContext('2d');
    const draw = () => {
      const v = video.current;
      if (v && v.videoWidth) {
        const W = width;
        const H = height;
        const ar = v.videoWidth / v.videoHeight;
        ctx.filter = 'none';
        if (bg?.type === 'color') { ctx.fillStyle = bg.color || '#000'; ctx.fillRect(0, 0, W, H); } else {
          const amt = bg?.blur ?? 0.6;
          ctx.filter = `blur(${Math.max(1, 18 * amt)}px) brightness(${0.9 - 0.25 * amt})`;
          const cw = H * ar;
          ctx.drawImage(v, (W - cw) / 2, 0, cw, H);
          ctx.filter = 'none';
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
  }, [mode, bg?.type, bg?.color, bg?.blur, gap, width, height]);
  return <canvas ref={ref} className="preview-canvas" width={width} height={height} />;
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

export default function ClipEditor({ project, transcript, clipId, onSelect, patch, jobs }) {
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
  const selectClip = async (id) => { if (await confirmLeave()) onSelect(id); };

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
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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

  // ---- framing
  const A = (project.media?.width || 16) / (project.media?.height || 9);
  const FH = FRAME_W * 16 / 9;
  const VW = FH * A;
  const crop = clip.crop || { mode: 'auto', smooth: 0 };
  const mode = crop.mode || 'auto';
  const smooth = crop.smooth ?? (crop.motion === 'glide' ? 1 : 0);
  const frac = Math.min(1, FRAME_W / VW);
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
  const left = Math.min(0, Math.max(-(VW - FRAME_W), -(x * VW - FRAME_W / 2)));
  const canvasMode = mode === 'fit' || mode === 'stack3';
  const setCrop = (p) => set({ crop: { ...crop, ...p } });
  const addCue = () => {
    const t = Math.round(rel * 10) / 10;
    const next = [...cues.filter((c) => Math.abs(c.t - t) > 0.05), { t, x: Math.round(x * 1000) / 1000, move: cues.length ? 'glide' : 'cut', dur: 1.5 }].sort((a, b) => a.t - b.t);
    setCrop({ mode: 'cues', cues: next });
    setSelCue(next.findIndex((c) => c.t === t));
  };
  const updateCue = (i, p) => setCrop({ cues: cues.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const removeCue = (i) => { setCrop({ cues: cues.filter((_, k) => k !== i) }); setSelCue(null); };
  const canDrag = mode === 'manual' || (mode === 'cues' && selCue != null && cues[selCue]);
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
    const settings = { crop: cropStyle, videoTheme: clip.videoTheme || null, captions: clip.captions !== false, tightenPauses: Boolean(clip.tightenPauses), pauseMax: clip.pauseMax ?? 0.45, hookY: clip.hookY ?? null, overlay: clip.overlay || null, endCard: clip.endCard || null, exportOptions };
    await api.post('/api/edit-templates', { name, settings });
    setTemplates(await api.get('/api/edit-templates'));
    toast({ text: `Saved template “${name}”.` });
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {exporting && <ExportDialog project={project} clips={[current || clip]} beforeExport={save} onClose={() => setExporting(false)} />}
      {libPick && <LibraryPicker folder={libPick === 'overlay' ? 'Logos' : 'Graphics'} title={libPick === 'overlay' ? 'Pick a logo' : 'Pick an end card'} onClose={() => setLibPick(null)}
        onPick={(i) => { if (libPick === 'overlay') set({ overlay: { rel: i.rel, corner: 'tr', size: 0.18, opacity: 1 } }); else set({ endCard: { rel: i.rel, seconds: 3 } }); setLibPick(null); }} />}
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

      <div className="glass panel row between wrap" style={{ padding: 12 }}>
        <div className="row grow" style={{ minWidth: 280 }}>
          <button className="btn icon sm" aria-label="Previous clip" disabled={idx <= 0} onClick={() => selectClip(project.clips[idx - 1].id)}>‹</button>
          <select className="input" style={{ maxWidth: 420 }} value={clip.id} onChange={(e) => selectClip(e.target.value)}>
            {project.clips.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {c.title.slice(0, 70)}</option>)}
          </select>
          <button className="btn icon sm" aria-label="Next clip" disabled={idx >= project.clips.length - 1} onClick={() => selectClip(project.clips[idx + 1].id)}>›</button>
        </div>
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

      <div className="editor">
        <div className="stack sticky-col">
          <div className={`vframe ${canDrag ? 'draggable' : ''}`} style={{ width: FRAME_W }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            title={canDrag ? 'Drag sideways to aim the frame. Click to play or pause.' : 'Click to play or pause'}>
            <video ref={video} src={media(project.id, project.sourceFile)} preload="auto" playsInline
              style={canvasMode ? { opacity: 0, width: 2, height: 2 } : { height: FH, width: VW, left }} />
            {canvasMode && <CanvasFrame video={video} mode={mode} bg={crop.bg} gap={crop.gap} width={FRAME_W} height={Math.round(FH)} />}
            {themeDraft && (
              <CaptionOverlay theme={themeDraft} font={font} words={clip.captions !== false ? capWords : []} t={rel} frameWidth={FRAME_W}
                hook={clip.hook} showHook={outTime < (themeDraft.hookDuration ?? 3.5) || tab === 'text'} hookY={clip.hookY} onHookDrag={(y) => set({ hookY: +y.toFixed(3) })} />
            )}
            {clip.overlay?.rel && (
              <img alt="" src={`/library/${clip.overlay.rel.split('/').map(encodeURIComponent).join('/')}`} style={{
                position: 'absolute', width: `${(clip.overlay.size ?? 0.18) * 100}%`, opacity: clip.overlay.opacity ?? 1, pointerEvents: 'none', zIndex: 3,
                ...(['tl', 'bl'].includes(clip.overlay.corner || 'tr') ? { left: '4.5%' } : { right: '4.5%' }),
                ...(['tl', 'tr'].includes(clip.overlay.corner || 'tr') ? { top: '6.5%' } : { bottom: '10.5%' }),
              }} />
            )}
            {clip.endCard?.rel && outTime >= outLen - (clip.endCard.seconds ?? 3) && (
              <img alt="" src={`/library/${clip.endCard.rel.split('/').map(encodeURIComponent).join('/')}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 4, pointerEvents: 'none' }} />
            )}
            {!playing && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 46, textShadow: '0 4px 20px rgba(0,0,0,.4)', pointerEvents: 'none' }}>▶︎</div>}
          </div>
          <div className="transport" style={{ width: FRAME_W }}>
            <button className="btn icon sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <Scrubber value={Math.min(rel, len)} max={len} onChange={seekRel} words={capWords} marks={mode === 'cues' ? cues.map((c, i) => ({ t: c.t, on: i === selCue })) : []} label="Clip position" />
            <span className="mono num" style={{ flex: 'none' }}>{fmt(outTime)}/{fmt(outLen)}</span>
          </div>
          {mode === 'auto' && !track && !busyKind('track') && <p className="muted small" style={{ width: FRAME_W }}>Showing the center until the speaker is found.</p>}
          {current?.export && (
            <div className="banner info" style={{ width: FRAME_W, flexWrap: 'wrap' }}>
              <span>Exported {new Date(current.export.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              <button className="btn sm" onClick={() => api.post('/api/reveal', { path: current.export.file })}><FolderOpen size={13} />Show</button>
              <button className="btn sm" onClick={() => go({ name: 'social', compose: { projectId: project.id, clipId: clip.id } })}><Send size={13} />Post</button>
            </div>
          )}
        </div>

        <section className="glass strong panel">
          <div className="tabs">
            {[['words', 'Words & trim'], ['text', 'Title & hook'], ['look', 'Captions'], ['crop', 'Framing'], ['gfx', 'Graphics']].map(([k, l]) => (
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
                <div className="row between"><strong>End card</strong>
                  {clip.endCard?.rel ? <button className="btn ghost sm danger" onClick={() => set({ endCard: null })}>Remove</button> : <button className="btn sm" onClick={() => setLibPick('endCard')}>Pick a graphic</button>}
                </div>
                <span className="hint">A full-screen graphic for the last few seconds, like “Join us Sunday”. Make one in Graphics.</span>
                {clip.endCard?.rel && (
                  <label className="field">Shows for the last · {(clip.endCard.seconds ?? 3).toFixed(1)}s
                    <input type="range" min="1" max="8" step="0.5" value={clip.endCard.seconds ?? 3} onChange={(e) => set({ endCard: { ...clip.endCard, seconds: Number(e.target.value) } })} />
                  </label>
                )}
                <button className="btn ghost sm" onClick={() => go({ name: 'graphics' })}>Open Graphics</button>
              </div>
            </div>
          )}

          {tab === 'crop' && (
            <div className="stack" style={{ gap: 14 }}>
              <div className="choices">
                {[['auto', 'Follow speaker', 'Moves with the preacher.'],
                  ['cues', 'By timestamp', 'Cut or glide where you choose.'],
                  ['manual', 'Fixed', 'One steady frame.'],
                  ['fit', 'Whole frame', 'Full shot on a background.'],
                  ['stack3', 'Three stack', 'The full shot, three times.']].map(([m, t, d]) => (
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
                  {mode === 'stack3' && <label className="field">Space between · {crop.gap ?? 18}px<input type="range" min="0" max="60" value={crop.gap ?? 18} onChange={(e) => setCrop({ gap: Number(e.target.value) })} /></label>}
                </div>
              )}
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
