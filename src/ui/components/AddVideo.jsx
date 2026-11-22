import { useEffect, useRef, useState } from 'react';
import { Download, Scissors, Film, Clock } from 'lucide-react';
import { api, fmt } from '../api.js';
import { parseTime } from '../screens/Project.jsx';
import Modal from './Modal.jsx';
import YouTubePeek from './YouTubePeek.jsx';

function Time({ value, onChange }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => { setText(fmt(value)); }, [value]);
  return (
    <input className="input mono num" style={{ width: 96 }} value={text} onChange={(e) => setText(e.target.value)}
      onBlur={() => { const t = parseTime(text); if (t != null) onChange(t); else setText(fmt(value)); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

/** Look at a YouTube video first, then download all of it or only the sermon. */
export default function AddVideo({ url, title, onClose, onAdd }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('sermon');
  const [range, setRange] = useState({ start: 0, end: 0 });

  useEffect(() => {
    api.post('/api/youtube/scout', { url }).then((r) => {
      setInfo(r);
      if (r.sermon) setRange({ start: Math.max(0, r.sermon.start - 15), end: Math.min(r.duration, r.sermon.end + 15) });
      else { setMode('all'); setRange({ start: 0, end: r.duration }); }
    }).catch((e) => setError(e.message));
  }, [url]);

  const peek = useRef(null);
  const [now, setNow] = useState(0);
  const len = mode === 'all' ? info?.duration : range.end - range.start;
  const nudge = (k, d) => setRange((r) => ({ ...r, [k]: Math.max(0, Math.min(info.duration, r[k] + d)) }));

  return (
    <Modal onClose={onClose} width={720} label="Add a sermon">
      <h2>{info?.title || title || 'Add a sermon'}</h2>
      {error && <div className="banner bad">{error}</div>}
      {!info && !error && (
        <div className="stack">
          <div className="skeleton" style={{ height: 60 }} /><div className="skeleton" style={{ height: 120 }} />
          <span className="muted small">Reading the video…</span>
        </div>
      )}
      {info && (
        <>
          <div className="row muted small"><Film size={14} />{fmt(info.duration)} long{info.captions ? '' : ' · no captions to scan'}</div>
          {info.captionNote && <div className="banner small row" style={{ gap: 8 }}><Clock size={14} /><span>{info.captionNote}</span></div>}
          <div className="choices">
            <button className={`choice ${mode === 'sermon' ? 'on' : ''}`} onClick={() => setMode('sermon')}>
              <span className="t"><span className="radio" />Just the sermon</span>
              <span className="d">{info.sermon ? `Found at ${fmt(info.sermon.start)}. Faster to download.` : 'Set the start and end yourself.'}</span>
            </button>
            <button className={`choice ${mode === 'all' ? 'on' : ''}`} onClick={() => setMode('all')}>
              <span className="t"><span className="radio" />Whole video</span>
              <span className="d">Download all {fmt(info.duration)}.</span>
            </button>
          </div>
          {mode === 'sermon' && (
            <div className="keycard">
              {info.id && !info.processing && <YouTubePeek ref={peek} id={info.id} start={range.start} onTime={setNow} />}
              {info.id && !info.processing && (
                <div className="row wrap" style={{ gap: 6 }}>
                  <button className="btn sm" onClick={() => setRange((r) => ({ ...r, start: now, end: r.end > now ? r.end : Math.min(info.duration, now + 1800) }))}>Start here</button>
                  <button className="btn sm" disabled={now <= range.start} onClick={() => setRange((r) => ({ ...r, end: now }))}>End here</button>
                  <span className="small muted">Play or scrub the video, then set the start and end where you are. Click a time to jump to it.</span>
                </div>
              )}
              {info.sermon && <span className={`chip ${info.sermon.confidence > 0.7 ? 'ok' : 'warn'}`} style={{ justifySelf: 'start' }}>{Math.round(info.sermon.confidence * 100)}% sure</span>}
              <div className="row wrap">
                <button className="btn ghost sm" style={{ minWidth: 52 }} title="Jump the video here" onClick={() => peek.current?.seek(range.start)}>Start</button><Time value={range.start} onChange={(v) => setRange({ ...range, start: v })} />
                <button className="btn sm" onClick={() => nudge('start', -60)}>−1 min</button><button className="btn sm" onClick={() => nudge('start', 60)}>+1 min</button>
              </div>
              {info.sermon?.startText && <p className="phrase">“{info.sermon.startText}…”</p>}
              <div className="row wrap">
                <button className="btn ghost sm" style={{ minWidth: 52 }} title="Jump the video here" onClick={() => peek.current?.seek(Math.max(0, range.end - 10))}>End</button><Time value={range.end} onChange={(v) => setRange({ ...range, end: v })} />
                <button className="btn sm" onClick={() => nudge('end', -60)}>−1 min</button><button className="btn sm" onClick={() => nudge('end', 60)}>+1 min</button>
              </div>
              {info.sermon?.endText && <p className="phrase">“…{info.sermon.endText}”</p>}
              {info.chapters.length > 0 && (
                <div className="row wrap">
                  <span className="small muted">Chapters:</span>
                  {info.chapters.map((c) => <button key={c.start} className="btn sm" onClick={() => setRange({ start: c.start, end: c.end })}>{c.title}</button>)}
                </div>
              )}
              <span className="hint">You can still adjust the sermon after it downloads.</span>
            </div>
          )}
          <div className="row between">
            <span className="muted small num">{fmt(len)} to download</span>
            <div className="row">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn primary lg" disabled={info.processing || (mode === 'sermon' && !(range.end > range.start))} title={info.processing ? 'YouTube is still processing this stream. Try again later.' : ''}
                onClick={() => onAdd(mode === 'all' ? { url, title: info.title } : { url, title: info.title, start: range.start, end: range.end })}>
                {mode === 'sermon' ? <Scissors size={16} /> : <Download size={16} />}{mode === 'sermon' ? `Download the sermon (${Math.round((range.end - range.start) / 60)} min)` : `Download whole video (${fmt(info.duration)})`}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
