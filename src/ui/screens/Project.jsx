import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { api, fmt, fmtEta, media } from '../api.js';
import { ArrowLeft, Square, Wand2, Download, Trash2, Plus, Send, FolderOpen, Copy, ScissorsLineDashed } from 'lucide-react';
import ClipEditor from './ClipEditor.jsx';
import { StatusChip } from './Library.jsx';
import Filmstrip from '../components/Filmstrip.jsx';
import ExportDialog from '../components/ExportDialog.jsx';

/** Progress for a running job with a clear way to stop it. */
export function InlineJob({ job, label }) {
  if (!job) return null;
  return (
    <div className="inline-job" aria-live="polite">
      <div className="row between">
        <strong className="truncate">{label || job.label}</strong>
        <button className="btn sm danger" onClick={() => api.del(`/api/jobs/${job.id}`)}><Square size={11} fill="currentColor" />Stop</button>
      </div>
      <div className="progress"><i style={{ width: `${job.status === 'queued' ? 0 : job.progress}%` }} /></div>
      <div className="row between small muted" style={{ gap: 8 }}>
        <span className="truncate">{job.status === 'queued' ? 'Waiting for the current task' : job.message}</span>
        {job.status === 'running' && <span className="num" style={{ flex: 'none', opacity: 0.8 }}>{fmtEta(job.eta) || `${job.progress}%`}</span>}
      </div>
    </div>
  );
}

export function parseTime(s) {
  const parts = String(s).trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((a, x) => a * 60 + x, 0);
}

function TimeInput({ value, onChange }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => { setText(fmt(value)); }, [value]);
  return (
    <input className="input mono" style={{ width: 96 }} value={text} onChange={(e) => setText(e.target.value)}
      onBlur={() => { const t = parseTime(text); if (t != null) onChange(t); else setText(fmt(value)); }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

export default function Project({ id, initialStep, initialClip }) {
  const { go, trackJob, onJobFinished, jobs, confirmLeave } = useApp();
  const [project, setProject] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [step, setStep] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState(null);
  const player = useRef(null);

  const load = useCallback(async () => {
    const { project: p } = await api.get(`/api/projects/${id}`);
    setProject(p);
    if (p.status === 'transcribed') {
      const t = await api.get(`/api/projects/${id}/transcript`).catch(() => null);
      setTranscript(t);
    }
    return p;
  }, [id]);

  useEffect(() => {
    load().then((p) => {
      const fallback = p.status !== 'transcribed' ? 'transcribe' : p.clips.length ? 'clips' : 'sermon';
      if (initialStep === 'edit' && p.clips.length) { setSelected((p.clips.find((c) => c.id === initialClip) || p.clips.find((c) => c.status === 'kept' || c.status === 'exported') || p.clips[0]).id); setStep('edit'); }
      else setStep(fallback);
    }).catch(() => go({ name: 'library' }));
  }, [load]);

  useEffect(() => onJobFinished(async (j) => {
    if (j.projectId !== id) return;
    const p = await load();
    if (j.status === 'error') return;
    if (j.kind === 'transcribe') setStep('sermon');
    if (j.kind === 'propose') { setStep('clips'); setNotice(j.result?.warning || null); }
    if (j.kind === 'download' && p.status === 'ready') setStep('transcribe');
  }), [onJobFinished, id, load]);

  const busy = jobs.filter((j) => j.projectId === id && (j.status === 'running' || j.status === 'queued'));
  const busyKind = (k) => busy.some((j) => j.kind === k);
  const jobOf = (k) => busy.find((j) => j.kind === k);

  const patch = async (body) => {
    const { project: p } = await api.patch(`/api/projects/${id}`, body);
    setProject(p);
    return p;
  };
  const start = async (path, body = {}) => {
    try {
      const { job } = await api.post(`/api/projects/${id}/${path}`, body);
      trackJob(job);
    } catch (e) { setNotice(e.message); }
  };

  if (!project || !step) return <div className="page"><p className="muted">Loading…</p></div>;
  const src = project.sourceFile ? media(id, project.sourceFile) : null;
  const transcribed = project.status === 'transcribed';
  const steps = [
    ['transcribe', 'Transcribe', transcribed],
    ['sermon', 'Find the sermon', project.sermon?.confirmed],
    ['clips', 'Pick clips', project.clips.some((c) => c.status === 'kept' || c.status === 'exported')],
    ['edit', 'Edit & export', project.clips.some((c) => c.export)],
    ['exports', 'Exports', false],
  ];

  return (
    <div className="page">
      <div className="row between wrap">
        <div className="row grow" style={{ minWidth: 300 }}>
          <button className="btn ghost sm" onClick={() => go({ name: 'library' })}><ArrowLeft size={15} />Library</button>
          <input className="input" style={{ fontWeight: 650, fontSize: 17, background: 'transparent', border: 0, boxShadow: 'none' }}
            defaultValue={project.title} onBlur={(e) => e.target.value.trim() && e.target.value !== project.title && patch({ title: e.target.value.trim() })} />
          <StatusChip status={project.status} />
          <button className="btn ghost sm danger" title="Delete this sermon" onClick={async () => {
            if (!confirm(`Delete “${project.title}”? Its video, transcript, clips and exports in the project folder are removed from this Mac. This can't be undone.`)) return;
            await api.del(`/api/projects/${id}`); go({ name: 'library' });
          }}><Trash2 size={14} />Delete</button>
        </div>
        <div className="steps glass">
          {steps.map(([key, label, done], i) => (
            <button key={key} className={`${step === key ? 'on' : ''} ${done ? 'done' : ''}`}
              disabled={key !== 'transcribe' && !transcribed || (key === 'edit' && !project.clips.length)}
              onClick={async () => { if (step === 'edit' && key !== 'edit' && !(await confirmLeave())) return; if (key === 'edit' && !selected) setSelected(project.clips[0]?.id); setStep(key); }}>
              <span className="n">{done ? '✓' : i + 1}</span>{label}
            </button>
          ))}
        </div>
      </div>
      {notice && <div className="banner row between"><span>{notice}</span><button className="btn ghost sm" onClick={() => setNotice(null)}>Dismiss</button></div>}

      {project.status === 'downloading' && !busyKind('download') && (
        <div className="banner row between"><span>Download didn't finish.</span><button className="btn sm" onClick={() => start('download')}>Retry download</button></div>
      )}

      {step === 'transcribe' && (
        <TranscribeStep project={project} src={src} player={player} job={jobOf('transcribe') || jobOf('download')} onStart={(range) => start('transcribe', range)} />
      )}
      {step === 'sermon' && transcript && (
        <SermonStep project={project} transcript={transcript} src={src} player={player} patch={patch}
          busy={busyKind('propose')} job={jobOf('propose')}
          onConfirm={async (range) => { await patch({ sermon: { ...range, confirmed: true } }); start('propose', {}); }} />
      )}
      {step === 'clips' && (
        <ClipsStep project={project} src={src} player={player} patch={patch} busy={busyKind('propose')} job={jobOf('propose')} start={start}
          onEdit={(cid) => { setSelected(cid); setStep('edit'); }} />
      )}
      {step === 'edit' && transcript && (
        <ClipEditor project={project} transcript={transcript} clipId={selected || project.clips[0]?.id}
          onSelect={setSelected} patch={patch} jobs={busy} />
      )}
      {step === 'exports' && <ExportsStep project={project} />}
    </div>
  );
}

function TranscribeStep({ project, src, player, job, onStart }) {
  const { config } = useApp();
  const [mode, setMode] = useState('all');
  const [range, setRange] = useState({ start: 0, end: project.media?.duration || 0 });
  const cur = () => player.current?.currentTime || 0;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <section className="glass panel stack">
          {src ? <video ref={player} className="player" src={src} controls preload="metadata" /> : <div className="player" style={{ display: 'grid', placeItems: 'center', color: '#aab' }}>Downloading…</div>}
          {src && <Filmstrip project={project} player={player} range={mode === 'range' ? range : null}
            onSetStart={mode === 'range' ? (t) => setRange((r) => ({ ...r, start: t })) : null}
            onSetEnd={mode === 'range' ? (t) => setRange((r) => ({ ...r, end: t })) : null} />}
        </section>
        <section className="glass strong panel stack" style={{ gap: 14 }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">Step 1</span>
            <h2>Transcribe the video</h2>
            <p className="muted">Turns speech into timed text for captions and clips.</p>
          </div>
          <div className="stack" style={{ gap: 6 }} role="radiogroup" aria-label="What to transcribe">
            <h3>What should we transcribe?</h3>
            <div className="choices" style={{ gridTemplateColumns: '1fr' }}>
              <button role="radio" aria-checked={mode === 'all'} className={`choice ${mode === 'all' ? 'on' : ''}`} onClick={() => setMode('all')}>
                <span className="t"><span className="radio" />The whole video</span>
                <span className="d">We'll find the sermon for you.</span>
              </button>
              <button role="radio" aria-checked={mode === 'range'} className={`choice ${mode === 'range' ? 'on' : ''}`} onClick={() => setMode('range')}>
                <span className="t"><span className="radio" />Just the sermon</span>
                <span className="d">Faster. Mark the start and end.</span>
              </button>
            </div>
          </div>
          {mode === 'range' && (
            <div className="keycard">
              <div className="row"><strong style={{ width: 44 }}>Start</strong><TimeInput value={range.start} onChange={(v) => setRange({ ...range, start: v })} /><button className="btn sm" onClick={() => setRange({ ...range, start: cur() })}>Use player time</button></div>
              <div className="row"><strong style={{ width: 44 }}>End</strong><TimeInput value={range.end} onChange={(v) => setRange({ ...range, end: v })} /><button className="btn sm" onClick={() => setRange({ ...range, end: cur() })}>Use player time</button></div>
              <span className="hint num">{fmt(Math.max(0, range.end - range.start))}</span>
            </div>
          )}
          {job ? <InlineJob job={job} /> : (
            <button className="btn primary lg" disabled={!src || (mode === 'range' && !(range.end > range.start))}
              onClick={() => onStart(mode === 'range' ? range : {})}><Wand2 size={16} />{mode === 'range' ? 'Transcribe sermon' : 'Transcribe video'}</button>
          )}
        </section>
      </div>
    </div>
  );
}

function Timeline({ duration, bins, range, clips = [], player, onSeek }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const v = player.current;
    if (!v) return undefined;
    const on = () => setNow(v.currentTime);
    v.addEventListener('timeupdate', on);
    return () => v.removeEventListener('timeupdate', on);
  }, [player]);
  const maxW = Math.max(160, ...bins.map((b) => b.wpm));
  const pct = (t) => `${(100 * t) / duration}%`;
  return (
    <div className="timeline" onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      onSeek(((e.clientX - r.left) / r.width) * duration);
    }}>
      {bins.map((b) => (
        <span key={b.start} className={`bar ${b.talk ? 'talk' : ''}`} style={{ left: pct(b.start), width: `calc(${pct(b.end - b.start)} - 1px)`, height: `${Math.max(4, (b.wpm / maxW) * 100)}%` }} />
      ))}
      {range && <span className="range" style={{ left: pct(range.start), width: pct(range.end - range.start) }} />}
      {clips.map((c) => <span key={c.id} className="clipmark" style={{ left: pct(c.start), width: pct(c.end - c.start) }} />)}
      <span className="head" style={{ left: pct(now) }} />
    </div>
  );
}

function SermonStep({ project, transcript, src, player, onConfirm, busy, job }) {
  const s = project.sermon || { start: 0, end: project.media?.duration };
  const [range, setRange] = useState({ start: s.start, end: s.end });
  const duration = project.media?.duration || transcript.words.at(-1)?.end || 1;
  const seek = (t) => { if (player.current) { player.current.currentTime = t; } };
  const cur = () => player.current?.currentTime || 0;
  const excerpt = (t, n = 18) => {
    const i = transcript.words.findIndex((w) => w.start >= t - 0.05);
    return i < 0 ? '' : transcript.words.slice(i, i + n).map((w) => w.w).join(' ');
  };
  const conf = s.confidence ?? 0;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid2" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <section className="glass panel stack">
          <video ref={player} className="player" src={src} controls preload="metadata" />
          <Timeline duration={duration} bins={transcript.bins} range={range} player={player} onSeek={seek} />
          <Filmstrip project={project} player={player} range={range} onSetStart={(t) => setRange((r) => ({ ...r, start: t }))} onSetEnd={(t) => setRange((r) => ({ ...r, end: t }))} />
          <div className="row small muted"><span className="row"><span className="dot" style={{ color: 'var(--accent)' }} />Speaking</span><span className="row"><span className="dot" style={{ color: 'var(--muted)' }} />Music or quiet</span></div>
        </section>
        <section className="glass strong panel stack">
          <div className="row between">
            <h2>Is this the sermon?</h2>
            <span className={`chip ${conf > 0.7 ? 'ok' : conf > 0.45 ? 'warn' : 'bad'}`}>{Math.round(conf * 100)}% sure</span>
          </div>
          <div className="stack small muted">{(s.reasons || []).map((r) => <span key={r}>• {r}</span>)}</div>
          <div className="keycard">
            <div className="row"><strong style={{ width: 44 }}>Start</strong><TimeInput value={range.start} onChange={(v) => setRange({ ...range, start: v })} />
              <button className="btn sm" onClick={() => setRange({ ...range, start: cur() })}>Set to player</button><button className="btn ghost sm" onClick={() => seek(range.start)}>▶︎ Play</button></div>
            <p className="phrase">“{excerpt(range.start)}…”</p>
            <div className="row"><strong style={{ width: 44 }}>End</strong><TimeInput value={range.end} onChange={(v) => setRange({ ...range, end: v })} />
              <button className="btn sm" onClick={() => setRange({ ...range, end: cur() })}>Set to player</button><button className="btn ghost sm" onClick={() => seek(Math.max(0, range.end - 8))}>▶︎ Play</button></div>
            <p className="phrase">“…{transcript.words.filter((w) => w.end <= range.end + 0.05).slice(-18).map((w) => w.w).join(' ')}”</p>
          </div>
          <p className="muted small num">{fmt(range.end - range.start)} long</p>
          {job ? <InlineJob job={job} label="Finding clips…" /> : <button className="btn primary lg" disabled={!(range.end > range.start)} onClick={() => onConfirm(range)}><Wand2 size={16} />Find clips</button>}
        </section>
      </div>
    </div>
  );
}

function ClipsStep({ project, src, player, patch, busy, job, start, onEdit }) {
  const { config, trackJob, toast } = useApp();
  const [exportKept, setExportKept] = useState(false);
  const [topic, setTopic] = useState('');
  const [opts, setOpts] = useState({ count: config.clipCount, min: config.clipMin, max: config.clipMax });
  const clips = useMemo(() => [...project.clips].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [project.clips]);
  const setStatus = async (cid, status) => {
    const prev = project.clips.find((c) => c.id === cid)?.status;
    await patch({ clips: project.clips.map((c) => (c.id === cid ? { ...c, status } : c)) });
    // Keeping a clip starts finding the speaker in the background, so the editor is ready.
    if (status === 'kept' && config.trackOnKeep !== false) {
      api.post(`/api/projects/${project.id}/clips/${cid}/track`).then((r) => trackJob(r.job)).catch(() => {});
    }
    if (status === 'skipped') toast({ text: 'Clip skipped.', action: { label: 'Undo', run: () => patch({ clips: project.clips.map((c) => (c.id === cid ? { ...c, status: prev } : c)) }) } });
  };
  const kept = project.clips.filter((c) => c.status === 'kept' || c.status === 'exported').length;
  const playClip = (c) => { const v = player.current; if (v) { v.currentTime = c.start; v.play(); } };
  const addHere = async () => {
    const t = player.current?.currentTime || project.sermon?.start || 0;
    const { clip } = await api.post(`/api/projects/${project.id}/clips`, { start: t, end: t + 30, title: 'New clip' });
    const p = await patch({});
    onEdit(clip.id);
    return p;
  };
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1fr 1.25fr', alignItems: 'start' }}>
      <div className="stack" style={{ position: 'sticky', top: 0, gap: 18 }}>
        <section className="glass panel stack">
          <video ref={player} className="player" src={src} controls preload="metadata" />
          <button className="btn sm" style={{ justifySelf: 'start' }} onClick={addHere}><Plus size={14} />Make a clip from here</button>
        </section>
        <section className="glass strong panel stack">
          <h3>Find clips</h3>
          <label className="field">Topic <span className="hint">Optional, like “forgiveness”</span>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <div className="row">
            <label className="field grow">How many<input className="input" type="number" min="1" max="30" value={opts.count} onChange={(e) => setOpts({ ...opts, count: e.target.value })} /></label>
            <label className="field grow">Min sec<input className="input" type="number" value={opts.min} onChange={(e) => setOpts({ ...opts, min: e.target.value })} /></label>
            <label className="field grow">Max sec<input className="input" type="number" value={opts.max} onChange={(e) => setOpts({ ...opts, max: e.target.value })} /></label>
          </div>
          <div className="row between">
            <span className="muted small">Kept clips stay put.</span>
            {!job && <button className="btn primary" onClick={() => start('propose', { prompt: topic, ...opts })}><Wand2 size={15} />{project.clips.length ? 'Find again' : 'Find clips'}</button>}
          </div>
          {job && <InlineJob job={job} label="Finding clips…" />}
        </section>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row between">
          <h2>{clips.length} clips</h2>
          <button className="btn primary" disabled={!kept} title={kept ? '' : 'Keep at least one clip first'} onClick={() => setExportKept(true)}>
            <Download size={15} />Export {kept || ''} kept…
          </button>
          {exportKept && <ExportDialog project={project} clips={project.clips.filter((c) => c.status === 'kept' || c.status === 'exported')} onClose={() => setExportKept(false)} />}
        </div>
        {!clips.length && <div className="glass empty"><ScissorsLineDashed size={40} /><h3>No clips yet</h3><p>Press Find clips.</p></div>}
        <div className="clip-list">
          {clips.map((c) => (
            <div key={c.id} className={`glass clip-card ${c.status === 'skipped' ? 'skipped' : ''}`} onClick={() => playClip(c)}>
              <div className="score" title="How strong this moment looks">{c.score ?? '–'}</div>
              <div className="stack" style={{ gap: 6 }}>
                <strong style={{ fontSize: 15 }}>{c.title}</strong>
                <div className="row wrap">
                  <span className="chip accent">{c.category}</span>
                  <span className="chip">{fmt(c.start)} · {Math.round(c.end - c.start)}s</span>
                  {c.status === 'exported' && <span className="chip ok">Exported</span>}
                  {c.source && c.source !== 'heuristic' && c.source !== 'manual' && <span className="chip">{c.source}</span>}
                </div>
                {c.summary && <p className="muted small">{c.summary}</p>}
                {c.startPhrase && <p className="phrase"><b>Starts:</b> “{c.startPhrase}” &nbsp; <b>Ends:</b> “{c.endPhrase}”</p>}
                <div className="row wrap">{(c.reasons || []).slice(0, 4).map((r) => <span key={r} className="chip">{r}</span>)}</div>
              </div>
              <div className="stack" onClick={(e) => e.stopPropagation()}>
                {c.status === 'kept' || c.status === 'exported'
                  ? <button className="btn sm" onClick={() => setStatus(c.id, 'proposed')}>✓ Kept</button>
                  : <button className="btn primary sm" onClick={() => setStatus(c.id, 'kept')} title="Keep this clip">Keep</button>}
                <button className="btn sm" onClick={() => onEdit(c.id)}>Edit</button>
                {c.status !== 'skipped'
                  ? <button className="btn ghost sm" onClick={() => setStatus(c.id, 'skipped')}>Skip</button>
                  : <button className="btn ghost sm" onClick={() => setStatus(c.id, 'proposed')}>Restore</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportsStep({ project }) {
  const { go } = useApp();
  const done = project.clips.filter((c) => c.export);
  const [copied, setCopied] = useState(null);
  const postText = (c) => [c.title, c.summary, (c.hashtags || []).map((h) => `#${h.replace(/\s+/g, '')}`).join(' ')].filter(Boolean).join('\n\n');
  if (!done.length) return <div className="glass empty"><Download size={40} /><h3>Nothing exported yet</h3><p>Export a clip and it shows up here.</p></div>;
  return (
    <div className="projects" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      {done.map((c) => (
        <div key={c.id} className="glass" style={{ padding: 10, display: 'grid', gap: 10 }}>
          <video className="vframe" style={{ aspectRatio: `${c.export.width || 9}/${c.export.height || 16}`, width: '100%' }} src={`/exports/${encodeURIComponent(project.id)}/${c.id}?v=${encodeURIComponent(c.export.at)}`} poster={media(project.id, c.export.thumb)} controls preload="none" />
          <strong>{c.title}</strong>
          <span className="muted small">{Math.round(c.export.length)}s · {new Date(c.export.at).toLocaleString()}</span>
          <div className="row wrap">
            <button className="btn primary sm" onClick={() => go({ name: 'social', compose: { projectId: project.id, clipId: c.id } })}><Send size={13} />Post or schedule</button>
            <button className="btn sm" onClick={() => api.post('/api/reveal', { path: c.export.file })}><FolderOpen size={13} />Show in Finder</button>
            <button className="btn sm" onClick={async () => { await navigator.clipboard.writeText(postText(c)); setCopied(c.id); setTimeout(() => setCopied(null), 1500); }}><Copy size={13} />{copied === c.id ? 'Copied' : 'Copy post text'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
