// Refreshing data on a timer, without working while nobody is looking.
// Skips while the window is hidden or minimized, and catches up the moment it's back.
import { useEffect, useRef } from 'react';

export function usePoll(fn, ms, deps = []) {
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    if (!ms) return undefined;
    const run = () => { if (!document.hidden) f.current(); };
    const id = setInterval(run, ms);
    const back = () => { if (!document.hidden) f.current(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [ms, ...deps]);
}
