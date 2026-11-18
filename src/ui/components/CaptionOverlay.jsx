import { useMemo } from 'react';
import { captionEvents, activeCaption } from '../captions.js';

const rgba = (hex = '#ffffff', a = 1) => {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
};

/** Font record for a theme's font id (curated or system). */
export function findFont(themes, id) {
  return themes.fonts.find((f) => f.id === id) || themes.systemFonts?.find((f) => f.id === id) || themes.fonts[0];
}

/** HTML version of the burned-in captions (mirrors scripts/render_clip.py Captions). */
export default function CaptionOverlay({ theme, font, words, t, frameWidth, frameHeight, hook, showHook }) {
  const events = useMemo(() => captionEvents(words, Number(theme.words || 3)), [words, theme.words]);
  const ev = activeCaption(events, t);
  const scale = (frameHeight ? Math.min(frameWidth, frameHeight) : frameWidth) / 1080;
  const box = theme.highlight === 'box';
  const pill = theme.highlight === 'pill';
  const left = theme.align === 'left';
  const maxW = (theme.maxWidth ?? 0.86) * 100;
  const color = rgba(theme.color, theme.colorOpacity ?? 1);
  const active = rgba(theme.active, theme.activeOpacity ?? 1);
  const future = rgba(theme.future || theme.color, theme.futureOpacity ?? theme.colorOpacity ?? 1);
  const style = {
    top: `${(theme.position ?? 0.68) * 100}%`,
    left: `${(100 - maxW) / 2}%`, right: `${(100 - maxW) / 2}%`,
    fontFamily: font?.css || 'system-ui',
    fontWeight: font?.weight || 800,
    fontStyle: font?.italic ? 'italic' : 'normal',
    fontSize: `${(theme.size || 78) * scale}px`,
    lineHeight: theme.lineHeight ?? 1.12,
    WebkitTextStroke: box || pill || !theme.outline ? '0' : `${theme.outline * 2 * scale}px ${rgba(theme.outlineColor, theme.outlineOpacity ?? 1)}`,
    textShadow: !box && !pill && theme.shadow ? `0 ${6 * scale}px ${10 * scale}px rgba(0,0,0,${theme.shadow})` : pill && theme.shadow ? `0 ${3 * scale}px ${8 * scale}px rgba(0,0,0,${theme.shadow * 0.8})` : 'none',
    textTransform: theme.uppercase ? 'uppercase' : 'none',
    wordSpacing: pill ? `${22 * scale}px` : undefined,
  };
  return (
    <>
      {hook && showHook && <div className="hookbar" style={{ fontFamily: font?.css, fontSize: `${58 * scale}px` }}>{hook}</div>}
      {ev && (
        <div className={`cap ${box ? 'box' : ''} ${left ? 'left' : ''}`} style={style}>
          <span className="inner" style={box ? { background: rgba(theme.boxColor, theme.boxOpacity ?? 0.92) } : undefined}>
            {ev.group.map((w, i) => {
              const isActive = i === ev.wi;
              const c = isActive ? active : i < ev.wi ? color : future;
              return (
                <span key={i}>
                  <span className={`w ${pill && isActive ? 'pill' : ''}`} style={{ color: c, background: pill && isActive ? rgba(theme.boxColor, theme.boxOpacity ?? 0.92) : undefined }}>{w.w}</span>
                  {i < ev.group.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </span>
        </div>
      )}
    </>
  );
}
