import { ShareProject } from '../components/Backups.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useHelperFocus } from '../App.jsx';
import { api, fmt, fmtEta, media } from '../api.js';
import { ArrowLeft, ArrowRight, Check, Square, Wand2, Download, Trash2, Plus, Send, FolderOpen, Copy, ScissorsLineDashed, AudioLines, ChevronDown, FileText, PenLine, Quote, Share2 } from 'lucide-react';
import AudioCleanup from '../components/AudioCleanup.jsx';
import ContentPlan from '../components/ContentPlan.jsx';
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

/** Video, or a simple audio player for recordings without a picture. */
function Player({ player, src, audioOnly }) {
  if (audioOnly) return <div className="player audio-player"><AudioLines size={42} aria-hidden="true" /><audio ref={player} src={src} controls preload="metadata" /></div>;
  return <video ref={player} className="player" src={src} controls preload="metadata" />;
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
  const [sharing, setSharing] = useState(false);
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
      const audioOnly = p.media && !p.media.width;
      const keptClip = p.clips.find((c) => c.status === 'kept' || c.status === 'exported');
      const fallback = p.status !== 'transcribed' ? 'transcribe' : audioOnly ? 'text' : p.clips.length ? 'clips' : 'sermon';
      // A video that already has kept clips opens in the editor. "Cut more clips" goes back to the picker.
      if (!initialStep && (!audioOnly || p.kind === 'lyric') && keptClip) { setSelected(keptClip.id); setStep('edit'); }
      else if (initialStep === 'edit' && p.clips.length) { setSelected((p.clips.find((c) => c.id === initialClip) || p.clips.find((c) => c.status === 'kept' || c.status === 'exported') || p.clips[0]).id); setStep('edit'); }
      else setStep(fallback);
    }).catch(() => go({ name: 'library' }));
  }, [load]);

  useEffect(() => onJobFinished(async (j) => {
    if (j.projectId !== id) return;
    const p = await load();
    if (j.status === 'error') return;
    if (j.kind === 'transcribe') {
      // Shorts, lyric clips and wide videos come back as one clip, so open it in the editor.
      const whole = ['short', 'lyric', 'wide'].includes(p.kind) && p.clips.find((c) => c.status === 'kept');
      if (whole) { setSelected(whole.id); setStep('edit'); } else setStep(p.media && !p.media.width ? 'text' : 'sermon');
    }
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

  useHelperFocus(project && step && step !== 'edit' ? { kind: 'project', id: project.id } : null);
  if (!project || !step) return <div className="page"><p className="muted">Loading…</p></div>;
  const src = project.sourceFile ? media(id, project.sourceFile) : null;
  const transcribed = project.status === 'transcribed';
  const audioOnly = Boolean(project.media && !project.media.width);
  const plan = ['plan', 'Content plan', false];
  const stepsBase = audioOnly && project.kind === 'lyric' ? [
    ['transcribe', 'Transcribe', transcribed],
    ['edit', 'Edit & export', project.clips.some((c) => c.export)],
    ['text', 'Transcript', false],
  ] : audioOnly ? [
    ['transcribe', 'Transcribe', transcribed],
    ['sermon', 'Trim', project.sermon?.confirmed],
    ['text', 'Transcript', false],
  ] : [
    ['transcribe', 'Transcribe', transcribed],
    ['sermon', 'Find the sermon', project.sermon?.confirmed],
    ['clips', 'Pick clips', project.clips.some((c) => c.status === 'kept' || c.status === 'exported')],
    ['edit', 'Edit & export', project.clips.some((c) => c.export)],
    ['exports', 'Exports', false],
    ['text', 'Transcript', false],
  ];
  // Sermons get a content plan: everything that can be made from them.
  const steps = project.kind === 'sermon' || !project.kind ? [...stepsBase, plan] : stepsBase;

  return (
    <div className="page">
      <div className="row between wrap">
        <div className="row grow" style={{ minWidth: 300 }}>
          <button className="btn ghost sm" onClick={() => go({ name: 'library' })}><ArrowLeft size={15} />Videos</button>
          <input className="input" style={{ fontWeight: 650, fontSize: 17, background: 'transparent', border: 0, boxShadow: 'none' }}
            defaultValue={project.title} onBlur={(e) => e.target.value.trim() && e.target.value !== project.title && patch({ title: e.target.value.trim() })} />
          <StatusChip status={project.status} />
          <button className="btn ghost sm" title="Share this project with a teammate or another Mac" onClick={() => setSharing(true)}><Share2 size={14} />Share</button>
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
        <TranscribeStep project={project} src={src} player={player} audioOnly={audioOnly} job={jobOf('transcribe') || jobOf('download')} onStart={(range) => start('transcribe', range)} onRead={() => setStep('text')} />
      )}
      {step === 'sermon' && transcript && (
        <SermonStep project={project} transcript={transcript} src={src} player={player} patch={patch} audioOnly={audioOnly}
          busy={busyKind('propose')} job={jobOf('propose')}
          onConfirm={async (range) => { await patch({ sermon: { ...range, confirmed: true } }); if (audioOnly) setStep('text'); else start('propose', {}); }} />
      )}
      {step === 'clips' && (
        <ClipsStep project={project} src={src} player={player} patch={patch} busy={busyKind('propose')} job={jobOf('propose')} start={start}
          onEdit={(cid) => { setSelected(cid); setStep('edit'); }} />
      )}
      {step === 'edit' && transcript && (
        <ClipEditor project={project} transcript={transcript} clipId={selected || project.clips[0]?.id}
          onSelect={setSelected} patch={patch} jobs={busy} onMore={() => setStep('clips')} />
      )}
      {step === 'exports' && <ExportsStep project={project} />}
      {step === 'text' && transcript && <TranscriptStep project={project} />}
      {step === 'plan' && <ContentPlan project={project} setStep={setStep} onChange={load} />}
      {sharing && <ShareProject project={project} onClose={() => setSharing(false)} />}
    </div>
  );
}

function TranscribeStep({ project, src, player, job, onStart, audioOnly, onRead }) {
  const done = project.status === 'transcribed';
  const { config } = useApp();
  const [mode, setMode] = useState('all');
  const [cleanup, setCleanup] = useState(project.audioCleanup || null);
  const [showClean, setShowClean] = useState(Boolean(project.audioCleanup));
  const [range, setRange] = useState({ start: 0, end: project.media?.duration || 0 });
  const cur = () => player.current?.currentTime || 0;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <section className="glass panel stack">
          {src ? <Player player={player} src={src} audioOnly={audioOnly} /> : <div className="player" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Downloading…</div>}
          {src && !audioOnly && <Filmstrip project={project} player={player} range={mode === 'range' ? range : null}
            onSetStart={mode === 'range' ? (t) => setRange((r) => ({ ...r, start: t })) : null}
            onSetEnd={mode === 'range' ? (t) => setRange((r) => ({ ...r, end: t })) : null} />}
        </section>
        <section className="glass strong panel stack" style={{ gap: 14 }}>
          {!audioOnly && !done && (
            <div className="three-steps">
              <strong className="small">Share-ready clips in 3 easy steps</strong>
              <ol>
                <li className={mode === 'range' ? 'on' : ''}><span>1</span>Trim to the sermon <em>optional, faster</em></li>
                <li className="on"><span>2</span>Make the transcript</li>
                <li><span>3</span>Pick and polish clips</li>
              </ol>
            </div>
          )}
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">{audioOnly ? 'Step 1' : 'Step 2 of 3'}</span>
            <h2>{audioOnly ? 'Transcribe the recording' : 'Transcribe the video'}</h2>
            <p className="muted">{audioOnly ? 'Turns speech into text you can read, search and share.' : 'Turns speech into timed text for captions and clips.'}</p>
          </div>
          <div className="stack" style={{ gap: 6 }} role="radiogroup" aria-label="What to transcribe">
            <h3>What should we transcribe?</h3>
            <div className="choices" style={{ gridTemplateColumns: '1fr' }}>
              <button role="radio" aria-checked={mode === 'all'} className={`choice ${mode === 'all' ? 'on' : ''}`} onClick={() => setMode('all')}>
                <span className="t"><span className="radio" />{audioOnly ? 'The whole recording' : 'The whole video'}</span>
                <span className="d">{audioOnly ? 'Trim it afterward if you like.' : "We'll find the sermon for you."}</span>
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
          <div className="stack" style={{ gap: 8 }}>
            <button className="disclose" aria-expanded={showClean} onClick={() => setShowClean(!showClean)}>
              <AudioLines size={15} aria-hidden="true" /><span className="grow">Clean up the sound{cleanup ? ' · on' : ''}</span><ChevronDown size={15} className="chev" aria-hidden="true" />
            </button>
            {showClean && (
              <>
                <span className="hint">Helps with noisy or distant recordings. Clips from this sermon use it too.</span>
                <AudioCleanup value={cleanup} onChange={setCleanup} source={src ? { projectId: project.id } : null} compact />
              </>
            )}
          </div>
          {job ? <InlineJob job={job} /> : done ? (
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn primary" onClick={onRead}><FileText size={15} />Read transcript</button>
              <button className="btn" disabled={!src || (mode === 'range' && !(range.end > range.start))}
                onClick={() => { if (window.confirm('Transcribe again? The new transcript replaces the current one. Clips keep their times.')) onStart({ ...(mode === 'range' ? range : {}), cleanup }); }}><Wand2 size={15} />Re-transcribe</button>
            </div>
          ) : (
            <button className="btn primary lg" disabled={!src || (mode === 'range' && !(range.end > range.start))}
              onClick={() => onStart({ ...(mode === 'range' ? range : {}), cleanup })}><Wand2 size={16} />{mode === 'range' ? 'Transcribe sermon' : audioOnly ? 'Transcribe recording' : 'Transcribe video'}</button>
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

function SermonStep({ project, transcript, src, player, onConfirm, busy, job, audioOnly }) {
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
          <Player player={player} src={src} audioOnly={audioOnly} />
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
          <h2>{clips.length} suggested clips</h2>
          <button className="btn" disabled={!kept} title={kept ? '' : 'Keep at least one clip first'} onClick={() => setExportKept(true)}>
            <Download size={15} />Export {kept || ''} kept…
          </button>
          {exportKept && <ExportDialog project={project} clips={project.clips.filter((c) => c.status === 'kept' || c.status === 'exported')} onClose={() => setExportKept(false)} />}
        </div>
        {clips.length > 0 && (
          <div className="keep-bar glass">
            <div className="stack grow" style={{ gap: 1 }}>
              <strong>{kept ? `${kept} clip${kept === 1 ? '' : 's'} kept` : 'Keep the ones you like'}</strong>
              <span className="small muted">Keep saves a clip to this video, ready to edit and export. Skip hides it. You can come back for more anytime.</span>
            </div>
            <button className="btn primary" disabled={!kept} onClick={() => onEdit(project.clips.find((c) => c.status === 'kept' || c.status === 'exported').id)}>Edit kept clips<ArrowRight size={15} /></button>
          </div>
        )}
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
                  ? <button className="btn sm kept-btn" onClick={() => setStatus(c.id, 'proposed')} title="Kept: saved to this video. Click to un-keep."><Check size={13} />Kept</button>
                  : <button className="btn primary sm" onClick={() => setStatus(c.id, 'kept')} title="Save this clip to edit and export"><Plus size={13} />Keep</button>}
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

/** The transcript as text: read it, select part of it, copy or save it, or make something from it. */
function TranscriptStep({ project }) {
  const { go, toast } = useApp();
  const [whole, setWhole] = useState(!project.sermon?.confirmed);
  const [data, setData] = useState(null);
  const [times, setTimes] = useState(() => { try { return localStorage.getItem('cs-times') === '1'; } catch { return false; } });
  const [sel, setSel] = useState(null); // { a, b } word indexes
  const box = useRef(null);
  useEffect(() => {
    setSel(null);
    api.get(`/api/projects/${project.id}/transcript/paragraphs${whole ? '?whole=1' : ''}`).then(setData).catch((e) => setData({ error: e.message, paragraphs: [] }));
  }, [project.id, whole]);
  const words = useMemo(() => (data?.paragraphs || []).flatMap((p) => p.words), [data]);
  const starts = useMemo(() => { let n = 0; return (data?.paragraphs || []).map((p) => { const s = n; n += p.words.length; return s; }); }, [data]);
  const toggleTimes = () => { setTimes(!times); try { localStorage.setItem('cs-times', times ? '0' : '1'); } catch { /* fine */ } };
  const text = (a, b) => words.slice(a, b + 1).map((w) => w.w).join(' ');
  const allText = useMemo(() => (data?.paragraphs || []).map((p) => p.words.map((w) => w.w).join(' ')).join('\n\n'), [data]);

  // Drag to select words, or click a paragraph to select all of it.
  const onUp = (e, pi) => {
    const s = window.getSelection();
    if (s && !s.isCollapsed && box.current) {
      const r = s.getRangeAt(0);
      const hit = [...box.current.querySelectorAll('[data-i]')].filter((el) => r.intersectsNode(el)).map((el) => Number(el.dataset.i));
      if (hit.length) { setSel({ a: Math.min(...hit), b: Math.max(...hit) }); s.removeAllRanges(); return; }
    }
    if (pi != null) {
      const a = starts[pi]; const b = a + data.paragraphs[pi].words.length - 1;
      setSel(sel && sel.a === a && sel.b === b ? null : { a, b });
    }
  };
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') setSel(null); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  const save = async (format) => {
    try {
      const r = await api.post(`/api/projects/${project.id}/transcript/save`, { format: whole && format === 'txt' ? 'all' : format });
      toast({ text: 'Saved to Downloads.', action: { label: 'Show', run: () => api.post('/api/reveal', { path: r.file }) } });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const selText = sel ? text(sel.a, sel.b) : '';
  const selStart = sel ? words[sel.a]?.start : 0; const selEnd = sel ? words[sel.b]?.end : 0;
  const makeClip = async () => {
    try {
      const { clip } = await api.post(`/api/projects/${project.id}/clips`, { start: Math.max(0, selStart - 0.2), end: selEnd + 0.4, title: selText.split(' ').slice(0, 6).join(' ') });
      go({ name: 'project', id: project.id, clip: clip.id });
    } catch (e) { toast({ kind: 'error', text: e.message }); }
  };
  const total = words.length;
  return (
    <div className="grid2 transcript-layout">
      <section className="glass panel stack transcript-panel">
        <div className="row between wrap" style={{ gap: 10 }}>
          <h2>Transcript</h2>
          <div className="row wrap" style={{ gap: 12 }}>
            <label className="switch small"><input type="checkbox" checked={times} onChange={toggleTimes} />Times</label>
            {project.sermon?.confirmed && (
              <div className="seg sm">
                <button className={!whole ? 'on' : ''} onClick={() => setWhole(false)}>{project.media?.width ? 'Sermon only' : 'Trimmed'}</button>
                <button className={whole ? 'on' : ''} onClick={() => setWhole(true)}>Everything</button>
              </div>
            )}
          </div>
        </div>
        <span className="hint">Click a paragraph to select it, or drag across words.</span>
        <div ref={box} className={`transcript-read ${times ? 'timed' : ''}`} tabIndex={0} aria-label="Transcript">
          {!data && <span className="muted">Loading…</span>}
          {data?.error && <span className="muted">{data.error}</span>}
          {data?.paragraphs.map((p, pi) => (
            <div key={pi} className="tr-para" onMouseUp={(e) => onUp(e, pi)}>
              {times && <span className="tr-time num">{fmt(p.start)}</span>}
              <p>{p.words.map((w, k) => {
                const i = starts[pi] + k;
                return <span key={k} data-i={i} className={sel && i >= sel.a && i <= sel.b ? 'sel' : undefined}>{w.w} </span>;
              })}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="stack transcript-side">
        <section className="glass strong panel stack">
          <span className="eyebrow">{total.toLocaleString()} words</span>
          <h3>Take it with you</h3>
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn" onClick={() => { navigator.clipboard.writeText(allText); toast({ text: 'Copied the transcript.' }); }}><Copy size={14} />Copy text</button>
            <button className="btn" onClick={() => save('txt')}><FileText size={14} />Save as text</button>
            <button className="btn" onClick={() => save('timed')}><FileText size={14} />Text with times</button>
            <button className="btn" onClick={() => save('srt')}><Download size={14} />Captions (.srt)</button>
            <button className="btn" onClick={() => save('vtt')}><Download size={14} />Captions (.vtt)</button>
          </div>
          <hr className="hairline" />
          <button className="btn primary" onClick={() => go({ name: 'writing', project: project.id })}><PenLine size={14} />Write from it</button>
        </section>
        {sel && (
          <section className="glass panel stack sel-panel" aria-live="polite">
            <div className="row between"><span className="eyebrow">Selected text</span><button className="btn ghost sm" onClick={() => setSel(null)}>Clear</button></div>
            <div className="sel-stats">
              <div><strong className="num">{(sel.b - sel.a + 1).toLocaleString()}</strong><span className="small muted">words</span></div>
              <div><strong className="num">{fmt(Math.max(0, selEnd - selStart))}</strong><span className="small muted">long</span></div>
              <div><strong className="num">{fmt(selStart)}</strong><span className="small muted">starts at</span></div>
            </div>
            <p className="small muted sel-quote">“{selText.length > 160 ? `${selText.slice(0, 160)}…` : selText}”</p>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => { navigator.clipboard.writeText(selText); toast({ text: 'Copied.' }); }}><Copy size={13} />Copy</button>
              {project.media?.width > 0 && <button className="btn sm primary" onClick={makeClip}><ScissorsLineDashed size={13} />Make a clip</button>}
              <button className="btn sm" onClick={() => go({ name: 'graphics', quote: selText })}><Quote size={13} />Quote graphic</button>
              <button className="btn sm" onClick={() => go({ name: 'social', caption: selText })}><Send size={13} />Social post</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
