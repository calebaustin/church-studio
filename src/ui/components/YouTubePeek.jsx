import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { fmt } from '../api.js';

/**
 * A YouTube video playing right in the dialog, before anything is downloaded, so you can find the spots
 * yourself. Talks to YouTube's embedded player with messages (no extra script). `ref.seek(t)` jumps to a time;
 * `onTime(t)` reports where it is.
 */
const YouTubePeek = forwardRef(function YouTubePeek({ id, start = 0, onTime }, ref) {
  const frame = useRef(null);
  const [t, setT] = useState(start);
  const [first] = useState(start); // the player loads once; later changes seek instead of reloading it
  const post = (msg) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), '*');
  useImperativeHandle(ref, () => ({
    seek: (sec) => { post({ event: 'command', func: 'seekTo', args: [sec, true] }); setT(sec); },
    time: () => t,
  }), [t]);
  useEffect(() => {
    const onMsg = (e) => {
      if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
      let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      const now = d?.info?.currentTime;
      if (typeof now === 'number') { setT(now); onTime?.(now); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onTime]);
  // Ask the player to report its time once it has loaded.
  const listen = () => { post({ event: 'listening', id: 'peek', channel: 'widget' }); post({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }); };
  const origin = encodeURIComponent(window.location.origin);
  return (
    <div className="yt-peek">
      <iframe ref={frame} title="Video preview" onLoad={listen} referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1&start=${Math.floor(first)}&origin=${origin}`} />
      <span className="yt-peek-time num" aria-live="off">{fmt(t)}</span>
    </div>
  );
});
export default YouTubePeek;
