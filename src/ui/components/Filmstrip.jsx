import { useEffect, useMemo, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { api, fmt, media } from '../api.js';
import { useApp } from '../App.jsx';

/**
 * Scene strip: thumbnails every few seconds across the whole video. Click to jump there; the
 * strip follows the playhead. Zoom changes how many frames you see. Optional start/end setters.
 */
export default function Filmstrip({ project, player, range, onSetStart, onSetEnd }) {
  const { trackJob, jobs } = useApp();
  const strip = useRef(null);
  const [now, setNow] = useState(0);
  const STEPS = [1, 3, 15, 45, 60];
  const [stepIdx, setStepIdx] = useState(2); // every 15s to start
  const [hover, setHover] = useState(false);
  const t = project.thumbs;
  const busy = jobs.some((j) => j.kind === 'thumbs' && j.projectId === project.id && (j.status === 'running' || j.status === 'queued'));

  useEffect(() => {
    const v = player.current;
    if (!v) return undefined;
    const on = () => setNow(v.currentTime);
    v.addEventListener('timeupdate', on);
    return () => v.removeEventListener('timeupdate', on);
  }, [player, project.id]);

  const usable = STEPS.filter((v) => v >= (t?.every || 1));
  const step = usable[Math.min(stepIdx, usable.length - 1)] || 15;
  const frames = useMemo(() => {
    if (!t?.count) return [];
    const out = [];
    const total = t.count * t.every;
    for (let time = 0; time < total; time += step) {
      const i = Math.min(t.count - 1, Math.round(time / t.every));
      if (!out.length || out.at(-1).i !== i) out.push({ i, time });
    }
    return out;
  }, [t?.count, t?.every, step]);
  const currentIdx = frames.findIndex((f) => now >= f.time && now < f.time + step);

  // Keep the current frame in view while playing (unless the mouse is in the strip).
  useEffect(() => {
    if (hover || currentIdx < 0) return;
    strip.current?.children[currentIdx]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [currentIdx, hover]);

  if (!t?.count) {
    return (
      <div className="row between" style={{ padding: '10px 4px' }}>
        <span className="muted small row"><Film size={15} />A scene strip makes it easy to find the sermon in a long service.</span>
        <button className="btn sm" disabled={busy} onClick={async () => { const { job } = await api.post(`/api/projects/${project.id}/thumbs`); trackJob(job); }}>{busy ? 'Making it…' : 'Make scene strip'}</button>
      </div>
    );
  }
  const seek = (time) => { if (player.current) player.current.currentTime = time; };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between">
        <span className="small muted">Scene strip · click a frame to jump there{onSetStart ? ' · hover for Start / End' : ''}</span>
        <label className="row small muted" style={{ gap: 8 }}>
          Every <strong className="num" style={{ width: 30, color: 'var(--ink)' }}>{step < 60 ? `${step}s` : '1m'}</strong>
          <input type="range" min="0" max={usable.length - 1} step="1" value={Math.min(stepIdx, usable.length - 1)} onChange={(e) => setStepIdx(Number(e.target.value))} style={{ width: 110 }} aria-label="Time between frames" />
        </label>
      </div>
      <div className="filmstrip" ref={strip} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; } }}>
        {frames.map((f, k) => {
          const inRange = range && f.time >= range.start - step && f.time <= range.end;
          return (
            <div key={f.i} className={`frame ${k === currentIdx ? 'now' : ''} ${inRange ? 'inrange' : ''}`} style={{ display: 'grid' }}>
              <button className="shot" onClick={() => seek(f.time)} aria-label={`Jump to ${fmt(f.time)}`}>
                <img src={`${media(project.id, `thumbs/t${String(f.i + 1).padStart(5, '0')}.jpg`)}?v=${t.version}`} width={168} height={Math.round(168 * 9 / 16)} loading="lazy" alt="" />
                <span>{fmt(f.time)}</span>
              </button>
              {onSetStart && (
                <div className="row" style={{ gap: 4, justifyContent: 'center', marginTop: 4 }}>
                  <button className="btn sm" style={{ minHeight: 24, padding: '0 8px', fontSize: 11.5 }} onClick={() => { onSetStart(f.time); seek(f.time); }}>Start</button>
                  <button className="btn sm" style={{ minHeight: 24, padding: '0 8px', fontSize: 11.5 }} onClick={() => { onSetEnd(f.time + step); seek(f.time); }}>End</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
