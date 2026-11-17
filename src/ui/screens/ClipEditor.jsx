import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { api, fmt, media } from '../api.js';
import CaptionOverlay from '../components/CaptionOverlay.jsx';
import { keepSegments, keptLength } from '../captions.js';

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
  const saveTimer = useRef(null);

  useEffect(() => { h.reset(original); setRel(0); setTrack(null); }, [original?.id]);

  // Persist edits (debounced). The project file is the source of truth.
  useEffect(() => {
    if (!clip || clip === original) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      patch({ clips: project.clips.map((c) => (c.id === clip.id ? { ...c, ...clip, export: c.export, preview: c.preview, status: c.status === 'proposed' ? 'kept' : c.status } : c)) });
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
  const font = themes.fonts.find((f) => f.id === theme?.font);
  const set = (patchObj) => h.set((c) => ({ ...c, ...patchObj }));

  // Crop position for the preview.
  const A = (project.media?.width || 16) / (project.media?.height || 9);
  const FH = FRAME_W * 16 / 9;
  const VW = FH * A;
  const mode = clip.crop?.mode || 'auto';
  let x = 0.5;
  if (mode === 'manual') x = clip.crop.x ?? 0.5;
  if (mode === 'auto' && track?.x?.length) x = track.x[Math.max(0, Math.min(track.x.length - 1, Math.floor(rel * track.fps)))];
  const left = Math.min(0, Math.max(-(VW - FRAME_W), -(x * VW - FRAME_W / 2)));
  const videoStyle = mode === 'fit'
    ? { width: FRAME_W, height: FRAME_W / A, left: 0, top: (FH - FRAME_W / A) / 2 }
    : { height: FH, width: VW, left };

  const busyKind = (k) => jobs.some((j) => j.kind === k && j.key?.endsWith(clip.id));
  const run = async (kind) => {
    try { const { job } = await api.post(`/api/projects/${project.id}/clips/${clip.id}/${kind}`); trackJob(job); } catch (e) { alert(e.message); }
  };
  const current = project.clips.find((c) => c.id === clip.id);
  const idx = project.clips.findIndex((c) => c.id === clip.id);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="glass panel row between wrap" style={{ padding: 12 }}>
        <div className="row grow" style={{ minWidth: 280 }}>
          <button className="btn sm" disabled={idx <= 0} onClick={() => onSelect(project.clips[idx - 1].id)}>‹</button>
          <select className="input" style={{ maxWidth: 420 }} value={clip.id} onChange={(e) => onSelect(e.target.value)}>
            {project.clips.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {c.title.slice(0, 70)}</option>)}
          </select>
          <button className="btn sm" disabled={idx >= project.clips.length - 1} onClick={() => onSelect(project.clips[idx + 1].id)}>›</button>
        </div>
        <div className="row">
          <button className="btn ghost sm" disabled={!h.canUndo} onClick={h.undo} title="⌘Z">Undo</button>
          <button className="btn ghost sm" disabled={!h.canRedo} onClick={h.redo} title="⇧⌘Z">Redo</button>
          <button className="btn sm" disabled={busyKind('preview')} onClick={() => run('preview')}>{busyKind('preview') ? 'Rendering…' : 'Quick render'}</button>
          <button className="btn primary" disabled={busyKind('export')} onClick={() => run('export')}>{busyKind('export') ? 'Exporting…' : current?.export ? 'Export again' : 'Export 1080×1920'}</button>
        </div>
      </div>

      <div className="editor">
        <div className="stack" style={{ position: 'sticky', top: 0 }}>
          <div className="vframe" style={{ width: FRAME_W }} onClick={toggle}>
            <video ref={video} src={media(project.id, project.sourceFile)} style={videoStyle} preload="auto" playsInline />
            {clip.captions !== false && theme && (
              <CaptionOverlay theme={theme} font={font} words={capWords} t={rel} frameWidth={FRAME_W} hook={clip.hook} showHook={outTime < 3.5} />
            )}
            {!playing && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 46, textShadow: '0 4px 20px rgba(0,0,0,.4)', pointerEvents: 'none' }}>▶︎</div>}
          </div>
          <div className="transport" style={{ width: FRAME_W }}>
            <button className="btn sm" onClick={toggle}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min="0" max={outLen} step="0.01" value={Math.min(outTime, outLen)} onChange={(e) => seekOut(Number(e.target.value))} />
            <span className="mono">{fmt(outTime)} / {fmt(outLen)}</span>
          </div>
          <p className="muted small" style={{ width: FRAME_W }}>
            Live preview. {mode === 'auto' && !track ? 'Speaker tracking not analysed yet — showing centre.' : ''}
            {current?.preview && <> · <a href={media(project.id, `previews/${clip.id}.mp4`) + `?v=${encodeURIComponent(current.preview.at)}`} target="_blank" rel="noreferrer">Open last quick render</a></>}
          </p>
          {current?.export && <div className="banner info" style={{ width: FRAME_W }}>Exported {new Date(current.export.at).toLocaleTimeString()} · <a href="#" onClick={(e) => { e.preventDefault(); api.post('/api/reveal', { path: current.export.file }); }}>Show in Finder</a> · <a href="#" onClick={(e) => { e.preventDefault(); go({ name: 'social', compose: { projectId: project.id, clipId: clip.id } }); }}>Post / schedule</a></div>}
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
            <div className="stack">
              <p className="muted">The wide 16:9 video is cropped to 9:16. <b>Follow speaker</b> finds the preacher's face and moves the frame smoothly
                as they walk — it holds still for small movements and glides for big ones.</p>
              <div className="seg">
                {[['auto', 'Follow speaker'], ['center', 'Centre'], ['manual', 'Fixed position'], ['fit', 'Whole frame']].map(([m, l]) => (
                  <button key={m} className={mode === m ? 'on' : ''} onClick={() => set({ crop: { ...clip.crop, mode: m } })}>{l}</button>
                ))}
              </div>
              {mode === 'auto' && (
                <div className="keycard">
                  <div className="row between">
                    <strong>Speaker tracking</strong>
                    {track ? <span className={`chip ${track.info?.fallback ? 'warn' : 'ok'}`}>{track.info?.fallback ? 'No steady face — centred' : `Face found in ${track.info?.found}/${track.info?.samples} samples`}</span> : <span className="chip">Not analysed</span>}
                  </div>
                  {track?.x && <PathSpark x={track.x} frac={track.cropFrac} />}
                  <button className="btn sm" style={{ justifySelf: 'start' }} disabled={busyKind('track')} onClick={() => run('track')}>{busyKind('track') ? 'Analysing…' : track ? 'Analyse again' : 'Analyse speaker movement'}</button>
                  <span className="muted small">Export always re-tracks, so this is only for the preview.</span>
                </div>
              )}
              {mode === 'manual' && (
                <label className="field">Position · {Math.round((clip.crop?.x ?? 0.5) * 100)}%
                  <input type="range" min="0" max="1" step="0.005" value={clip.crop?.x ?? 0.5} onChange={(e) => set({ crop: { mode: 'manual', x: Number(e.target.value) } })} />
                </label>
              )}
              {mode === 'fit' && <p className="muted small">Shows the whole wide frame over a blurred copy of itself — good for wide stage shots.</p>}
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
    <svg viewBox={`0 0 ${w} ${hgt}`} style={{ width: '100%', height: hgt, background: 'rgba(255,255,255,.6)', borderRadius: 10 }} preserveAspectRatio="none">
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
      <p className="muted small">Click a word to cut it (or bring it back). Click a grey word outside the clip to extend the clip to it. Double-click to jump there.</p>
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
