import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { api, fmt, media } from '../api.js';
import ClipEditor from './ClipEditor.jsx';
import { StatusChip } from './Library.jsx';

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

export default function Project({ id }) {
  const { go, trackJob, onJobFinished, jobs } = useApp();
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
      setStep(p.status !== 'transcribed' ? 'transcribe' : p.clips.length ? 'clips' : 'sermon');
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
          <button className="btn ghost sm" onClick={() => go({ name: 'library' })}>← Library</button>
          <input className="input" style={{ fontWeight: 650, fontSize: 17, background: 'transparent', border: 0, boxShadow: 'none' }}
            defaultValue={project.title} onBlur={(e) => e.target.value.trim() && e.target.value !== project.title && patch({ title: e.target.value.trim() })} />
          <StatusChip status={project.status} />
        </div>
        <div className="steps glass">
          {steps.map(([key, label, done], i) => (
            <button key={key} className={`${step === key ? 'on' : ''} ${done ? 'done' : ''}`}
              disabled={key !== 'transcribe' && !transcribed || (key === 'edit' && !project.clips.length)}
              onClick={() => { if (key === 'edit' && !selected) setSelected(project.clips[0]?.id); setStep(key); }}>
              <span className="n">{done ? '✓' : i + 1}</span>{label}
            </button>
          ))}
        </div>
      </div>
      {notice && <div className="banner row between"><span>{notice}</span><button className="btn ghost sm" onClick={() => setNotice(null)}>Dismiss</button></div>}

      {project.status === 'downloading' && !busyKind('download') && (
        <div className="banner row between"><span>The download didn't finish.</span><button className="btn sm" onClick={() => start('download')}>Retry download</button></div>
      )}

      {step === 'transcribe' && (
        <TranscribeStep project={project} src={src} player={player} busy={busyKind('transcribe') || busyKind('download')} onStart={(range) => start('transcribe', range)} />
      )}
      {step === 'sermon' && transcript && (
        <SermonStep project={project} transcript={transcript} src={src} player={player} patch={patch}
          busy={busyKind('propose')}
          onConfirm={async (range) => { await patch({ sermon: { ...range, confirmed: true } }); start('propose', {}); }} />
      )}
      {step === 'clips' && (
        <ClipsStep project={project} src={src} player={player} patch={patch} busy={busyKind('propose')} start={start}
          onEdit={(cid) => { setSelected(cid); setStep('edit'); }} />
      )}
      {step === 'edit' && transcript && (
        <ClipEditor project={project} transcript={transcript} clipId={selected || project.clips[0]?.id}
          onSelect={setSelected} patch={patch} start={start} jobs={busy} />
      )}
      {step === 'exports' && <ExportsStep project={project} />}
    </div>
  );
}

function TranscribeStep({ project, src, player, busy, onStart }) {
  const { config } = useApp();
  const [mode, setMode] = useState('all');
  const [range, setRange] = useState({ start: 0, end: project.media?.duration || 0 });
  const cur = () => player.current?.currentTime || 0;
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
      <section className="glass panel">
        {src ? <video ref={player} className="player" src={src} controls preload="metadata" /> : <div className="player" style={{ display: 'grid', placeItems: 'center', color: '#aaa' }}>Downloading…</div>}
      </section>
      <section className="glass strong panel stack">
        <h2>Transcribe</h2>
        <p className="muted">Whisper writes down every word with its timing — that's what captions and clip picking use. It runs on this
          Mac with the <b>{config.whisperModel}</b> model. A 90-minute service takes roughly 10–20 minutes.</p>
        <div className="seg">
          <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>Whole video</button>
          <button className={mode === 'range' ? 'on' : ''} onClick={() => setMode('range')}>I know where the sermon is</button>
        </div>
        {mode === 'all' ? (
          <p className="muted small">The app will find the sermon inside the service for you afterwards.</p>
        ) : (
          <div className="stack">
            <p className="muted small">Faster: only this part is transcribed. Scrub the video, then set the edges.</p>
            <div className="row"><span style={{ width: 44 }}>Start</span><TimeInput value={range.start} onChange={(v) => setRange({ ...range, start: v })} /><button className="btn sm" onClick={() => setRange({ ...range, start: cur() })}>Use player time</button></div>
            <div className="row"><span style={{ width: 44 }}>End</span><TimeInput value={range.end} onChange={(v) => setRange({ ...range, end: v })} /><button className="btn sm" onClick={() => setRange({ ...range, end: cur() })}>Use player time</button></div>
          </div>
        )}
        <button className="btn primary" disabled={busy || !src || (mode === 'range' && !(range.end > range.start))}
          onClick={() => onStart(mode === 'range' ? range : {})}>{busy ? 'Working…' : 'Transcribe'}</button>
      </section>
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

function SermonStep({ project, transcript, src, player, onConfirm, busy }) {
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
          <div className="row small muted"><span className="row"><span className="dot" style={{ color: 'var(--accent)' }} />continuous speech</span><span className="row"><span className="dot" style={{ color: 'var(--muted)' }} />music / quiet</span></div>
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
          <p className="muted small">Sermon length: {fmt(range.end - range.start)}</p>
          <button className="btn primary" disabled={busy || !(range.end > range.start)} onClick={() => onConfirm(range)}>{busy ? 'Finding clips…' : 'Looks right — find clips'}</button>
        </section>
      </div>
    </div>
  );
}

function ClipsStep({ project, src, player, patch, busy, start, onEdit }) {
  const { config, trackJob } = useApp();
  const [topic, setTopic] = useState('');
  const [opts, setOpts] = useState({ count: config.clipCount, min: config.clipMin, max: config.clipMax });
  const clips = useMemo(() => [...project.clips].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [project.clips]);
  const setStatus = (cid, status) => patch({ clips: project.clips.map((c) => (c.id === cid ? { ...c, status } : c)) });
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
          <button className="btn sm" style={{ justifySelf: 'start' }} onClick={addHere}>+ Make a clip from here</button>
        </section>
        <section className="glass strong panel stack">
          <h3>Find clips</h3>
          <label className="field">Looking for something specific? <span className="hint">Optional — e.g. “forgiveness”, “the fishing story”</span>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <div className="row">
            <label className="field grow">How many<input className="input" type="number" min="1" max="30" value={opts.count} onChange={(e) => setOpts({ ...opts, count: e.target.value })} /></label>
            <label className="field grow">Min sec<input className="input" type="number" value={opts.min} onChange={(e) => setOpts({ ...opts, min: e.target.value })} /></label>
            <label className="field grow">Max sec<input className="input" type="number" value={opts.max} onChange={(e) => setOpts({ ...opts, max: e.target.value })} /></label>
          </div>
          <div className="row between">
            <span className="muted small">{config.llmProvider === 'none' ? 'Offline scoring' : `Offline scoring + ${config.llmProvider}`}. Kept clips are never replaced.</span>
            <button className="btn primary" disabled={busy} onClick={() => start('propose', { prompt: topic, ...opts })}>{busy ? 'Finding…' : project.clips.length ? 'Find again' : 'Find clips'}</button>
          </div>
        </section>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row between">
          <h2>{clips.length} clips</h2>
          <button className="btn primary" disabled={!kept} onClick={async () => { const r = await api.post(`/api/projects/${project.id}/export-all`); r.jobs.forEach(trackJob); }}>
            Export {kept || ''} kept
          </button>
        </div>
        {!clips.length && <div className="glass empty"><p>No clips yet — press “Find clips”.</p></div>}
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
                  : <button className="btn primary sm" onClick={() => setStatus(c.id, 'kept')}>Keep</button>}
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
  if (!done.length) return <div className="glass empty"><h3>Nothing exported yet</h3><p>Keep a few clips, then export them.</p></div>;
  return (
    <div className="projects" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      {done.map((c) => (
        <div key={c.id} className="glass" style={{ padding: 10, display: 'grid', gap: 10 }}>
          {c.export.rel
            ? <video className="vframe" style={{ aspectRatio: '9/16', width: '100%' }} src={`${media(project.id, c.export.rel)}?v=${encodeURIComponent(c.export.at)}`} poster={media(project.id, c.export.thumb)} controls preload="none" />
            : <img className="vframe" style={{ objectFit: 'cover' }} src={media(project.id, c.export.thumb)} alt="" />}
          <strong>{c.title}</strong>
          <span className="muted small">{Math.round(c.export.length)}s · {new Date(c.export.at).toLocaleString()}</span>
          <div className="row wrap">
            <button className="btn primary sm" onClick={() => go({ name: 'social', compose: { projectId: project.id, clipId: c.id } })}>Post / schedule</button>
            <button className="btn sm" onClick={() => api.post('/api/reveal', { path: c.export.file })}>Show in Finder</button>
            <button className="btn sm" onClick={async () => { await navigator.clipboard.writeText(postText(c)); setCopied(c.id); setTimeout(() => setCopied(null), 1500); }}>{copied === c.id ? 'Copied!' : 'Copy post text'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
