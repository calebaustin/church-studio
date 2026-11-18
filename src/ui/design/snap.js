// Alignment snapping for the design canvas. Works in page fractions.
// Snaps a moving box's left/center/right (and top/middle/bottom) to the page edges and center,
// to other items, and optionally to a grid. Returns the adjusted move and the guides to draw.

export function snapMove(box, others, { thresholdX, thresholdY, grid = 0, aspect = 1, items = true } = {}) {
  const xs = [0, 0.5, 1]; const ys = [0, 0.5, 1];
  if (items) for (const o of others) { xs.push(o.x0, (o.x0 + o.x1) / 2, o.x1); ys.push(o.y0, (o.y0 + o.y1) / 2, o.y1); }
  if (grid) {
    for (let g = grid; g < 1; g += grid) xs.push(g);
    const gy = grid * aspect; // square cells: aspect = W / H
    for (let g = gy; g < 1; g += gy) ys.push(g);
  }
  const best = (edges, targets, th) => {
    let hit = null;
    for (const e of edges) for (const t of targets) {
      const d = t - e;
      if (Math.abs(d) <= th && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, at: t };
    }
    return hit;
  };
  const sx = best([box.x0, (box.x0 + box.x1) / 2, box.x1], xs, thresholdX);
  const sy = best([box.y0, (box.y0 + box.y1) / 2, box.y1], ys, thresholdY);
  const dx = sx ? sx.d : 0; const dy = sy ? sy.d : 0;
  // Draw every guide line that the snapped box now touches (center lines get their own look).
  const moved = { x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 + dy, y1: box.y1 + dy };
  const guides = [];
  const near = (a, b) => Math.abs(a - b) < 1e-4;
  if (sx) for (const e of [moved.x0, (moved.x0 + moved.x1) / 2, moved.x1]) if (xs.some((t) => near(t, e))) guides.push({ axis: 'x', at: e, center: near(e, 0.5) });
  if (sy) for (const e of [moved.y0, (moved.y0 + moved.y1) / 2, moved.y1]) if (ys.some((t) => near(t, e))) guides.push({ axis: 'y', at: e, center: near(e, 0.5) });
  return { dx, dy, guides };
}
