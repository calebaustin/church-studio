import { useMemo } from 'react';
import { captionEvents, activeCaption } from '../captions.js';

/** HTML version of the burned-in captions, scaled to the preview frame width. */
export default function CaptionOverlay({ theme, font, words, t, frameWidth, hook, showHook }) {
  const events = useMemo(() => captionEvents(words, Number(theme.words || 3)), [words, theme.words]);
  const ev = activeCaption(events, t);
  const k = frameWidth / 1080;
  const box = theme.highlight === 'box';
  const style = {
    top: `${(theme.position ?? 0.68) * 100}%`,
    fontFamily: font?.css || 'system-ui',
    fontWeight: font?.weight || 800,
    fontSize: `${(theme.size || 78) * k}px`,
    color: theme.color,
    WebkitTextStroke: box ? '0' : `${(theme.outline || 0) * 2 * k}px ${theme.outlineColor}`,
    textShadow: !box && theme.shadow ? `0 ${6 * k}px ${10 * k}px rgba(0,0,0,${theme.shadow})` : 'none',
    textTransform: theme.uppercase ? 'uppercase' : 'none',
  };
  return (
    <>
      {hook && showHook && (
        <div className="hookbar" style={{ fontFamily: font?.css, fontSize: `${58 * k}px` }}>{hook}</div>
      )}
      {ev && (
        <div className={`cap ${box ? 'box' : ''}`} style={style}>
          <span className="inner" style={box ? { background: theme.boxColor } : undefined}>
            {ev.group.map((w, i) => (
              <span key={i} className="w" style={i === ev.wi ? { color: theme.active } : undefined}>
                {w.w}{i < ev.group.length - 1 ? ' ' : ''}
              </span>
            ))}
          </span>
        </div>
      )}
    </>
  );
}
