// What the map can show while a panel sits over it, and the order of the site plan panel's sections. No DOM here: the
// callers pass plain rectangles ({left, top, right, bottom, width, height}, like getBoundingClientRect) so it can be
// tested. Used by src/app.js (coverPad: every fly-to clears the card and the assistant) and src/siteplan.js (the plan fit).

// Which edge of the map a panel is docked to: 'right' (the property card, the plan panel, the assistant drawer, even when
// wider than half the map), 'left', 'bottom' (a sheet across the map on phones) or null (a small box in the middle).
// A panel counts as right-docked when its right edge is within 24px of the map's, or when it sits in the right half.
export function dockSide(r, m) {
  if (!r || !m || r.width < 2 || r.height < 2 || r.right <= m.left || r.left >= m.right || r.bottom <= m.top || r.top >= m.bottom) return null;
  const span = r.left <= m.left + 24 && r.right >= m.right - 24, mid = m.left + m.width / 2, narrow = r.width < m.width * .6;
  if (!span && (m.right - r.right <= 24 || narrow && r.left > mid)) return 'right';
  if (!span && narrow && r.right < mid) return 'left';
  if (!narrow && r.top > m.top + m.height / 3) return 'bottom';
  return null;
}

// The part of the map nothing covers: panels docked to an edge (card, assistant), the rows of search and tools along the
// top, the column of camera buttons on the right, and boxes in the bottom-left corner (the map's legend card). A corner
// box takes either a strip on the left or one along the bottom, whichever fits a shape of that aspect (width / height)
// bigger, or without one whichever leaves more room. Returns {l, t, r, b} in the same coordinates as the rectangles.
export function freeRect(m, { panels = [], tops = [], buttons = null, corners = [], aspect = null } = {}) {
  let l = m.left, t = m.top, r = m.right, b = m.bottom;
  for (const q of panels) {
    const side = dockSide(q, m);
    if (side === 'right') r = Math.min(r, q.left); else if (side === 'left') l = Math.max(l, q.right); else if (side === 'bottom') b = Math.min(b, q.top);
  }
  for (const q of tops) if (q && q.height > 2 && q.bottom > t && q.top < m.top + m.height / 2 && q.left < r && q.right > l) t = Math.max(t, q.bottom);
  if (buttons && buttons.width > 0 && buttons.left > (l + r) / 2 && buttons.left < r) r = Math.min(r, buttons.left);
  for (const q of corners) {
    if (!q || q.width < 2 || q.height < 2 || q.left >= (l + r) / 2 || q.bottom <= (t + b) / 2 || q.right <= l || q.top >= b) continue; // only a box in the lower left of what's free
    const room = (w, h) => aspect > 0 ? Math.min(w / aspect, h) : w * h, byLeft = room(r - Math.max(l, q.right), b - t), byBottom = room(r - l, Math.min(b, q.top) - t);
    if (byLeft >= byBottom) l = Math.max(l, q.right); else b = Math.min(b, q.top);
  }
  return { l, t, r, b };
}

// fitBounds padding that keeps a shape inside the free rectangle, with a gap around it
export function fitPadding(free, m, gap = 0) {
  return { left: Math.round(free.l - m.left + gap), top: Math.round(free.t - m.top + gap), right: Math.round(m.right - free.r + gap), bottom: Math.round(m.bottom - free.b + gap) };
}

// The site plan panel's sections, in order; the chips at the top are made from the same list. Selected comes first when a
// piece is picked; Layouts once a build has made some; what needs a layout (Change, Numbers, Pro forma, Export) waits for
// one. While the site is being drawn there's only that.
export function planSections({ drawing = false, selected = false, layouts = false, laidOut = false } = {}) {
  if (drawing) return [{ id: 'spDrawSite', label: 'Draw the site' }];
  return [
    { id: 'spSel', label: 'Selected', show: selected },
    { id: 'spLayouts', label: 'Layouts', show: layouts },
    { id: 'spChgSec', label: 'Change', show: laidOut },
    { id: 'spAiSec', label: 'Build', show: true },
    { id: 'spNums', label: 'Numbers', show: laidOut },
    { id: 'spPfSec', label: 'Pro forma', show: laidOut },
    { id: 'spSiteSec', label: 'Site', show: true },
    { id: 'spDrawSec', label: 'Draw', show: true },
    { id: 'spParams', label: 'Settings', show: true },
    { id: 'spExport', label: 'Export', show: laidOut }
  ].filter(s => s.show).map(({ id, label }) => ({ id, label }));
}
