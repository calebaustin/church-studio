import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { api, fmt, media } from '../api.js';
import { Undo2, Redo2, Download, Zap, Plus, Trash2, Crosshair, Play, Pause, Send, FolderOpen } from 'lucide-react';
import CaptionOverlay, { findFont } from '../components/CaptionOverlay.jsx';
import ExportDialog from '../components/ExportDialog.jsx';
import { keepSegments, keptLength } from '../captions.js';
import { sampleTrack, cueX, clampX } from '../framing.js';

const FILLERS = new Set(['um', 'uh', 'uhm', 'umm', 'er', 'erm', 'ah']);
const FRAME_W = 340;

/** Undo/redo over a clip's editable state (VGP CL10 pattern). */
function useHistory(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  const set = useCallback((next) => setState((s) => ({ past: [...s.past.slice(-80), s.present], present: typeof next === 'function' ? next(s.present) : next, future: [] })), []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1), future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback((v) => setState({ past: [], present: v, future: [] }), []);
  return { clip: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

export default function ClipEditor({ project, transcript, clipId, onSelect, patch, start, jobs }) {
  const { themes, config, trackJob, onJobFinished, go } = useApp();
  const original = project.clips.find((c) => c.id === clipId) || project.clips[0];
  const h = useHistory(original);
  const clip = h.clip;
  const [tab, setTab] = useState('words');
  const [track, setTrack] = useState(null);
  const video = useRef(null);
  const [rel, setRel] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selCue, setSelCue] = useState(null);
  const drag = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => { h.reset(original); setRel(0); setTrack(null); }, [original?.id]);

  // Edits merge into the stored clip without touching render results.
  const merged = (cl) => project.clips.map((c) => (c.id === cl.id ? { ...c, ...cl, export: c.export, exports: c.exports, preview: c.preview, status: c.status === 'proposed' ? 'kept' : c.status } : c));
  const flush = async () => { clearTimeout(saveTimer.current); if (clip !== original) await patch({ clips: merged(clip) }); };
  // Persist edits (debounced). The project file is the source of truth.
  useEffect(() => {
    if (!clip || clip === original) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      patch({ clips: merged(clip) });
    }, 450);
    return () => clearTimeout(saveTimer.current);
  }, [clip]);

  // Load the speaker track if one exists.
  const loadTrack = useCallback(() => {
    fetch(media(project.id, `tracks/${clip.id}.json`)).then((r) => (r.ok ? r.json() : null)).then(setTrack).catch(() => setTrack(null));
  }, [project.id, clip?.id]);
  useEffect(() => { if (clip) loadTrack(); }, [clip?.id]);
  useEffect(() => onJobFinished((j) => { if (j.kind === 'track' && j.status === 'done') loadTrack(); }), [onJobFinished, loadTrack]);

  const words = transcript.words;
  const keep = useMemo(() => keepSegments(words, clip), [words, clip.start, clip.end, clip.cutWords, clip.tightenPauses]);
  const outLen = keptLength(keep);
  const cut = useMemo(() => new Set(clip.cutWords || []), [clip.cutWords]);
  const capWords = useMemo(() => words
    .map((w, i) => ({ ...w, i }))
    .filter((w) => w.end > clip.start && w.start < clip.end && !cut.has(w.i))
    .map((w) => ({ w: w.w, start: w.start - clip.start, end: w.end - clip.start })), [words, clip.start, clip.end, cut]);

  // Playback: play the source, jumping over cuts, looping inside the clip.
  useEffect(() => {
    let raf;
    const tick = () => {
      const v = video.current;
      if (v) {
        let r = v.currentTime - clip.start;
        const len = clip.end - clip.start;
        if (r >= len - 0.02 || r < -0.5) { v.pause(); v.currentTime = clip.start + (keep[0]?.[0] || 0); r = keep[0]?.[0] || 0; }
        else if (!keep.some(([s, e]) => r >= s && r < e)) {
          const next = keep.find(([s]) => s > r);
          if (next) { v.currentTime = clip.start + next[0]; r = next[0]; } else { v.pause(); }
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

  // Output time <-> clip-relative time across the kept segments.
  const outTime = useMemo(() => {
    let acc = 0;
    for (const [s, e] of keep) { if (rel < e) return acc + Math.max(0, rel - s); acc += e - s; }
    return acc;
  }, [rel, keep]);
  const seekOut = (t) => {
    let acc = 0;
    for (const [s, e] of keep) {
      if (t <= acc + (e - s)) { video.current.currentTime = clip.start + s + (t - acc); return; }
      acc += e - s;
    }
  };

  // Keyboard: space play/pause, cmd-z / shift-cmd-z undo/redo.
  useEffect(() => {
    const on = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? h.redo : h.undo)(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) v.play(); else v.pause(); };

  const theme = themes.video.find((t) => t.id === (clip.videoTheme || project.videoTheme || config.videoTheme)) || themes.video[0];
  const font = findFont(themes, theme?.font);
  const set = (patchObj) => h.set((c) => ({ ...c, ...patchObj }));

  // Crop position for the preview.
  const A = (project.media?.width || 16) / (project.media?.height || 9);
  const FH = FRAME_W * 16 / 9;
  const VW = FH * A;
  const mode = clip.crop?.mode || 'auto';
  const motion = clip.crop?.motion || 'glide';
  const frac = Math.min(1, FRAME_W / VW);
  const cues = clip.crop?.cues || [];
  let x = 0.5;
  if (mode === 'manual') x = clip.crop.x ?? 0.5;
  if (mode === 'cues') x = cueX(cues, rel, clip.crop?.x ?? 0.5);
  if (mode === 'auto' && track) x = sampleTrack((motion === 'follow' ? track.follow : track.glide) || track.x, track.fps, rel);
  x = clampX(x, frac);
  const left = Math.min(0, Math.max(-(VW - FRAME_W), -(x * VW - FRAME_W / 2)));
  const videoStyle = mode === 'fit'
    ? { width: FRAME_W, height: FRAME_W / A, left: 0, top: (FH - FRAME_W / A) / 2 }
    : { height: FH, width: VW, left };

  const setCrop = (p) => set({ crop: { mode, motion, ...clip.crop, ...p } });
  const addCue = () => {
    const t = Math.round(rel * 10) / 10;
    const next = [...cues.filter((c) => Math.abs(c.t - t) > 0.05), { t, x: Math.round(x * 1000) / 1000, move: cues.length ? 'glide' : 'cut', dur: 1.5 }].sort((a, b) => a.t - b.t);
    setCrop({ mode: 'cues', cues: next });
    setSelCue(next.findIndex((c) => c.t === t));
  };
  const updateCue = (i, p) => setCrop({ cues: cues.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const removeCue = (i) => { setCrop({ cues: cues.filter((_, k) => k !== i) }); setSelCue(null); };

  // Drag the picture sideways to aim the frame (fixed position, or the selected cue).
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
    try { const { job } = await api.post(`/api/projects/${project.id}/clips/${clip.id}/${kind}`); trackJob(job); } catch (e) { alert(e.message); }
  };
  const current = project.clips.find((c) => c.id === clip.id);
  const idx = project.clips.findIndex((c) => c.id === clip.id);

  return (
    <div className="stack" style={{ gap: 16 }}>
      {exporting && <ExportDialog project={project} clips={[current || clip]} beforeExport={flush} onClose={() => setExporting(false)} />}
      <div className="glass panel row between wrap" style={{ padding: 12 }}>
        <div className="row grow" style={{ minWidth: 280 }}>
          <button className="btn sm" disabled={idx <= 0} onClick={() => onSelect(project.clips[idx - 1].id)}>‹</button>
          <select className="input" style={{ maxWidth: 420 }} value={clip.id} onChange={(e) => onSelect(e.target.value)}>
            {project.clips.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {c.title.slice(0, 70)}</option>)}
          </select>
          <button className="btn sm" disabled={idx >= project.clips.length - 1} onClick={() => onSelect(project.clips[idx + 1].id)}>›</button>
        </div>
        <div className="row">
          <button className="btn ghost sm" disabled={!h.canUndo} onClick={h.undo} title="Undo (⌘Z)"><Undo2 size={15} />Undo</button>
          <button className="btn ghost sm" disabled={!h.canRedo} onClick={h.redo} title="Redo (⇧⌘Z)"><Redo2 size={15} />Redo</button>
          <button className="btn sm" disabled={busyKind('preview')} onClick={() => run('preview')}><Zap size={14} />{busyKind('preview') ? 'Rendering…' : 'Quick render'}</button>
          <button className="btn primary" disabled={busyKind('export')} onClick={() => setExporting(true)}><Download size={15} />{busyKind('export') ? 'Exporting…' : current?.export ? 'Export again…' : 'Export…'}</button>
        </div>
      </div>

      <div className="editor">
        <div className="stack" style={{ position: 'sticky', top: 0 }}>
          <div className={`vframe ${canDrag ? 'draggable' : ''}`} style={{ width: FRAME_W }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            title={canDrag ? 'Drag sideways to aim the frame. Click to play or pause.' : 'Click to play or pause'}>
            <video ref={video} src={media(project.id, project.sourceFile)} style={videoStyle} preload="auto" playsInline />
            {clip.captions !== false && theme && (
              <CaptionOverlay theme={theme} font={font} words={capWords} t={rel} frameWidth={FRAME_W} hook={clip.hook} showHook={outTime < 3.5} />
            )}
            {!playing && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 46, textShadow: '0 4px 20px rgba(0,0,0,.4)', pointerEvents: 'none' }}>▶︎</div>}
          </div>
          <div className="transport" style={{ width: FRAME_W }}>
            <button className="btn sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min="0" max={outLen} step="0.01" value={Math.min(outTime, outLen)} onChange={(e) => seekOut(Number(e.target.value))} />
            <span className="mono">{fmt(outTime)} / {fmt(outLen)}</span>
          </div>
          <p className="muted small" style={{ width: FRAME_W }}>
            {mode === 'auto' && !track ? 'Showing center until the speaker is found.' : ''}
            {current?.preview && <> · <a href={media(project.id, `previews/${clip.id}.mp4`) + `?v=${encodeURIComponent(current.preview.at)}`} target="_blank" rel="noreferrer">Open last quick render</a></>}
          </p>
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
            {[['words', 'Words & trim'], ['text', 'Title & post'], ['look', 'Captions'], ['crop', 'Framing']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'words' && <WordsTab words={words} clip={clip} set={set} cut={cut} rel={rel} outLen={outLen} seek={(t) => { video.current.currentTime = t; }} />}
          {tab === 'text' && <TextTab clip={clip} set={set} />}
          {tab === 'look' && (
            <div className="stack">
              <label className="row"><input type="checkbox" checked={clip.captions !== false} onChange={(e) => set({ captions: e.target.checked })} />Burn in live captions</label>
              <label className="field">Caption theme
                <select className="input" value={clip.videoTheme || ''} onChange={(e) => set({ videoTheme: e.target.value || null })}>
                  <option value="">Default ({themes.video.find((t) => t.id === (project.videoTheme || config.videoTheme))?.name})</option>
                  {themes.video.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <div className="row">
                <button className="btn sm" onClick={() => patch({ videoTheme: theme.id })}>Use “{theme.name}” for every clip in this sermon</button>
                <button className="btn ghost sm" onClick={() => go({ name: 'settings', section: 'video-themes' })}>Edit themes…</button>
              </div>
              <p className="muted small">The preview uses the same fonts, sizes and grouping as the export.</p>
            </div>
          )}
          {tab === 'crop' && (
            <div className="stack" style={{ gap: 14 }}>
              
              <div className="choices">
                {[['auto', 'Follow speaker', 'Moves with the preacher.'],
                  ['cues', 'By timestamp', 'Cut or glide at moments you pick.'],
                  ['manual', 'Fixed', 'One steady frame.'],
                  ['fit', 'Whole frame', 'Full shot, blurred edges.']].map(([m, t, d]) => (
                  <button key={m} className={`choice ${mode === m ? 'on' : ''}`} onClick={() => setCrop({ mode: m, ...(m === 'manual' && clip.crop?.x == null ? { x } : {}) })}>
                    <span className="t"><span className="radio" />{t}</span><span className="d">{d}</span>
                  </button>
                ))}
              </div>
              {mode === 'auto' && (
                <div className="keycard">
                  <div className="row between wrap">
                    <strong>Movement</strong>
                    {busyKind('track') ? <span className="chip warn">Finding the speaker…</span>
                      : track ? <span className={`chip ${track.info?.fallback ? 'warn' : 'ok'}`}>{track.info?.fallback ? 'No steady face found, so it stays centred' : `Speaker found in ${track.info?.found} of ${track.info?.samples} checks`}</span>
                        : <span className="chip">Not checked yet</span>}
                  </div>
                  <div className="seg">
                    <button className={motion === 'glide' ? 'on' : ''} onClick={() => setCrop({ motion: 'glide' })}>Smooth glide</button>
                    <button className={motion === 'follow' ? 'on' : ''} onClick={() => setCrop({ motion: 'follow' })}>Follow closely</button>
                  </div>
                  <span className="hint">{motion === 'glide'
                    ? 'One slow move from start to finish.'
                    : 'Keeps up with lots of walking.'}</span>
                  {track && (motion === 'follow' ? track.follow : track.glide) && <PathSpark x={(motion === 'follow' ? track.follow : track.glide) || track.x} frac={track.cropFrac} />}
                  <div className="row">
                    <button className="btn sm" disabled={busyKind('track')} onClick={() => run('track')}><Crosshair size={14} />{track ? 'Find the speaker again' : 'Find the speaker'}</button>
                    <button className="btn ghost sm" onClick={() => { setCrop({ mode: 'cues', cues: [{ t: 0, x, move: 'cut', dur: 1.5 }] }); setSelCue(0); }}>Fine-tune with cues</button>
                  </div>
                </div>
              )}
              {mode === 'cues' && (
                <div className="keycard">
                  <div className="row between"><strong>Cues</strong><button className="btn primary sm" onClick={addCue}><Plus size={14} />Add cue at {fmt(rel)}</button></div>
                  <span className="hint">Add a cue, then drag the picture to aim it.</span>
                  <div className="cue-track" aria-hidden="true">
                    {cues.map((c, i) => <i key={i} className={selCue === i ? 'sel' : ''} style={{ left: `${(c.t / (clip.end - clip.start)) * 100}%` }} onClick={() => { setSelCue(i); video.current.currentTime = clip.start + c.t; }} />)}
                    <b style={{ left: `${(rel / (clip.end - clip.start)) * 100}%` }} />
                  </div>
                  {!cues.length && <p className="muted small">No cues yet.</p>}
                  {cues.map((c, i) => (
                    <div key={i} className="row wrap" style={{ padding: '6px 8px', borderRadius: 12, background: selCue === i ? 'var(--accent-soft)' : 'transparent' }} onClick={() => setSelCue(i)}>
                      <button className="btn sm num" title="Jump here" onClick={() => { video.current.currentTime = clip.start + c.t; }}>{fmt(c.t)}.{Math.round((c.t % 1) * 10)}</button>
                      {i === 0 ? <span className="chip">Opening framing</span> : (
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
                <label className="field">Position · {Math.round((clip.crop?.x ?? 0.5) * 100)}% <span className="hint">Or drag the picture.</span>
                  <input type="range" min="0" max="1" step="0.005" value={clip.crop?.x ?? 0.5} onChange={(e) => setCrop({ x: Number(e.target.value) })} />
                </label>
              )}
              
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PathSpark({ x, frac }) {
  const w = 420;
  const hgt = 46;
  const pts = x.map((v, i) => `${(i / Math.max(1, x.length - 1)) * w},${hgt - v * hgt}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${hgt}`} style={{ width: '100%', height: hgt, background: 'var(--field)', borderRadius: 10 }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <title>Where the 9:16 frame sits across the wide video over time (crop is {Math.round(frac * 100)}% of the width)</title>
    </svg>
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
  return (
    <div className="stack">
      <div className="row wrap between">
        <div className="row"><span className="small" style={{ width: 40 }}>Start</span><button className="btn sm" onClick={() => nudge('start', -1)}>◀ earlier</button><button className="btn sm" onClick={() => nudge('start', 1)}>later ▶</button></div>
        <div className="row"><span className="small" style={{ width: 30 }}>End</span><button className="btn sm" onClick={() => nudge('end', -1)}>◀ earlier</button><button className="btn sm" onClick={() => nudge('end', 1)}>later ▶</button></div>
      </div>
      <div className="row wrap">
        <label className="row small"><input type="checkbox" checked={Boolean(clip.tightenPauses)} onChange={(e) => set({ tightenPauses: e.target.checked })} />Tighten pauses</label>
        <button className="btn sm" onClick={fillers}>Cut “um / uh”</button>
        <button className="btn ghost sm" disabled={!cut.size} onClick={() => set({ cutWords: [] })}>Restore all words</button>
        <span className="chip accent">{fmt(outLen)} long</span>
      </div>
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

function TextTab({ clip, set }) {
  return (
    <div className="stack">
      <label className="field">Title<input className="input" value={clip.title} onChange={(e) => set({ title: e.target.value })} /></label>
      <label className="field">On-screen hook <span className="hint">Optional. Shown at the top for the first 3.5 seconds, e.g. “You can't earn this.”</span>
        <input className="input" value={clip.hook || ''} onChange={(e) => set({ hook: e.target.value })} />
      </label>
      <label className="field">Post caption<textarea className="input" value={clip.summary || ''} onChange={(e) => set({ summary: e.target.value })} /></label>
      <label className="field">Hashtags <span className="hint">Comma separated</span>
        <input className="input" value={(clip.hashtags || []).join(', ')} onChange={(e) => set({ hashtags: e.target.value.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean) })} />
      </label>
      {clip.reasons?.length > 0 && <div className="row wrap">{clip.reasons.map((r) => <span key={r} className="chip">{r}</span>)}</div>}
    </div>
  );
}
