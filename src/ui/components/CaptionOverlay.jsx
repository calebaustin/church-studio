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

/**
 * Drag helper for the handles in the preview. kind: what is being changed. Reads the frame from the overlay's
 * parent. The first move records an undo step; the rest of the drag is quiet.
 */
function startDrag(e, onPlace, kind, theme) {
  if (!onPlace) return;
  e.preventDefault(); e.stopPropagation();
  const frame = e.currentTarget.closest('.cap-layer').getBoundingClientRect();
  const box = e.currentTarget.closest('[data-place]').getBoundingClientRect();
  const x0 = e.clientX; const y0 = e.clientY;
  const start = { ...theme };
  let first = true;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const move = (ev) => {
    const dx = ev.clientX - x0; const dy = ev.clientY - y0;
    let p = null;
    if (kind === 'hook-move') p = { hookY: +clamp((start.hookY ?? 0.13) + dy / frame.height, 0.05, 0.92).toFixed(3) };
    if (kind === 'cap-move') p = { position: +clamp((start.position ?? 0.68) + dy / frame.height, 0.08, 0.95).toFixed(3) };
    // Side handles: the box stays centered, so the width grows on both sides.
    if (kind.endsWith('-width-l')) { const k = kind.startsWith('hook') ? 'hookWidth' : 'maxWidth'; p = { [k]: +clamp((box.width - 2 * dx) / frame.width, k === 'hookWidth' ? 0.3 : 0.35, k === 'hookWidth' ? 0.96 : 0.98).toFixed(3) }; }
    if (kind === 'hook-width') p = { hookWidth: +clamp((box.width + 2 * dx) / frame.width, 0.3, 0.96).toFixed(3) };
    if (kind === 'cap-width') p = { maxWidth: +clamp((box.width + 2 * dx) / frame.width, 0.35, 0.98).toFixed(3) };
    // Corner handles: scale the type with the box.
    if (kind === 'hook-size') p = { hookSize: Math.round(clamp((start.hookSize ?? 58) * (1 + (dx + dy) / Math.max(80, box.width)), 26, 140)) };
    if (kind === 'cap-size') p = { size: Math.round(clamp((start.size ?? 78) * (1 + (dx + dy) / Math.max(80, box.width)), 30, 150)) };
    if (p) { onPlace(p, { quiet: !first }); first = false; }
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
const Handles = ({ onPlace, theme, prefix }) => (
  <>
    <i className="place-h side l" title="Drag to change the width" onPointerDown={(e) => startDrag(e, onPlace, `${prefix}-width-l`, theme)} />
    <i className="place-h side r" title="Drag to change the width" onPointerDown={(e) => startDrag(e, onPlace, `${prefix}-width`, theme)} />
    <i className="place-h corner" title="Drag to change the size" onPointerDown={(e) => startDrag(e, onPlace, `${prefix}-size`, theme)} />
  </>
);

/** The on-screen hook, styled by the caption theme. In the editor: drag to move, side to resize, corner to scale. */
function Hook({ theme, font, scale, text, onPlace }) {
  const shape = theme.hookShape || 'pill';
  const pos = theme.hookY ?? 0.13;
  const style = {
    top: `${pos * 100}%`, transform: 'translate(-50%, -50%)', fontFamily: font?.css, fontWeight: 700,
    fontSize: `${(theme.hookSize ?? 58) * scale}px`, color: theme.hookColor || '#11141C',
    background: shape === 'none' ? 'transparent' : rgba(theme.hookBg || '#FFFFFF', theme.hookBgOpacity ?? 0.94),
    borderRadius: shape === 'pill' ? '999px' : shape === 'box' ? '0.15em' : 0,
    textTransform: theme.hookUppercase ? 'uppercase' : 'none',
    textShadow: shape === 'none' ? '0 2px 6px rgba(0,0,0,.6)' : 'none',
    maxWidth: `${(theme.hookWidth ?? 0.8) * 100}%`, width: 'max-content', whiteSpace: 'normal', textAlign: 'center',
  };
  return (
    <div data-place="hook" className={`hookbar ${onPlace ? 'hook-drag placing' : ''}`} style={style}
      onPointerDown={(e) => startDrag(e, onPlace, 'hook-move', theme)} title={onPlace ? 'Drag to move the hook' : undefined}>
      {text}
      {onPlace && <Handles onPlace={onPlace} theme={theme} prefix="hook" />}
    </div>
  );
}

export default function CaptionOverlay({ theme, font, hookFont, words, t, frameWidth, frameHeight, hook, showHook, editing = null, onPlace }) {
  const events = useMemo(() => captionEvents(words, Number(theme.words || 3), Number(theme.maxChars || 22), Boolean(theme.sentences)), [words, theme.words, theme.maxChars, theme.sentences]);
  const ev = activeCaption(events, t);
  const scale = (frameHeight ? Math.min(frameWidth, frameHeight) : frameWidth) / 1080;
  const box = theme.highlight === 'box';
  const pill = theme.highlight === 'pill';
  const left = theme.align === 'left';
  const right = theme.align === 'right';
  // The anchor edge stays put as lines are added: bottom grows upward, top downward, middle both ways.
  const anchor = theme.anchor || 'middle';
  const maxW = (theme.maxWidth ?? 0.86) * 100;
  const color = rgba(theme.color, theme.colorOpacity ?? 1);
  const active = rgba(theme.active, theme.activeOpacity ?? 1);
  const future = rgba(theme.future || theme.color, theme.futureOpacity ?? theme.colorOpacity ?? 1);
  const style = {
    top: `${(theme.position ?? 0.68) * 100}%`,
    transform: anchor === 'bottom' ? 'translateY(-100%)' : anchor === 'top' ? 'none' : 'translateY(-50%)',
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
    <div className="cap-layer">
      {hook && showHook && <Hook theme={theme} font={hookFont || font} scale={scale} text={hook} onPlace={editing === 'hook' ? onPlace : null} />}
      {(ev || editing === 'captions') && (
        <div data-place="captions" className={`cap ${box ? 'box' : ''} ${left ? 'left' : ''} ${right ? 'right' : ''} ${editing === 'captions' ? 'placing' : ''}`} style={style}
          onPointerDown={editing === 'captions' ? (e) => startDrag(e, onPlace, 'cap-move', theme) : undefined} title={editing === 'captions' ? 'Drag to move the captions' : undefined}>
          <span className="inner" style={box ? { background: rgba(theme.boxColor, theme.boxOpacity ?? 0.92) } : undefined}>
            {!ev && <span className="w" style={{ color, opacity: 0.6 }}>Captions show here</span>}
            {ev && ev.group.map((w, i) => {
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
          {editing === 'captions' && <Handles onPlace={onPlace} theme={theme} prefix="cap" />}
        </div>
      )}
    </div>
  );
}
