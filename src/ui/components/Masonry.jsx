import { useLayoutEffect, useRef } from 'react';

// Masonry for card grids: each card spans as many small rows as its height needs, so tall and wide
// covers pack together left to right with no gaps. Re-measures when cards or the window change.
const ROW = 4;
export function useMasonry(ref, deps = []) {
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return undefined;
    const gap = () => parseFloat(getComputedStyle(grid).rowGap) || 0;
    const layout = () => {
      const g = gap();
      for (const el of grid.children) {
        el.style.gridRowEnd = 'auto';
        const h = el.getBoundingClientRect().height;
        el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((h + g) / (ROW + g)))}`;
      }
    };
    grid.style.gridAutoRows = `${ROW}px`;
    grid.style.alignItems = 'start';
    layout();
    const ro = new ResizeObserver(() => requestAnimationFrame(layout));
    ro.observe(grid);
    for (const el of grid.children) ro.observe(el);
    const mo = new MutationObserver(() => { for (const el of grid.children) ro.observe(el); layout(); });
    mo.observe(grid, { childList: true });
    grid.addEventListener('load', layout, true); // images finishing
    return () => { ro.disconnect(); mo.disconnect(); grid.removeEventListener('load', layout, true); };
  }, deps);
}

/** A card grid laid out as masonry. */
export function Masonry({ className, children }) {
  const ref = useRef(null);
  useMasonry(ref, []);
  return <div ref={ref} className={className}>{children}</div>;
}
