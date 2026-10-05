// The app's own cursors: SVG images in the Finishes Solutions look (ink and brand green with a white halo, so they read on
// light and dark maps, satellite or streets). Set once as CSS variables (--cur-default, --cur-pointer, …) that app.css
// and the map code use with the system cursor as fallback, e.g. cursor: var(--cur-pointer, pointer).
// Text fields keep the normal I-beam; touch screens have no cursor.
const INK = '#16201b', GREEN = '#006527', HALO = '#ffffff';
const svg = (w, body) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + w + '" viewBox="0 0 ' + w + ' ' + w + '">' + body + '</svg>';
const url = (s, x, y, fallback) => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '") ' + x + ' ' + y + ', ' + fallback;

// the arrow (tip at 4,3): ink for "nothing to click", green for "click to open or select"
const ARROW = 'M4 3v16.2l4.3-3.9 2.8 6.1 2.7-1.2-2.7-5.9h5.9z';
const arrow = fill => '<path d="' + ARROW + '" fill="' + fill + '" stroke="' + HALO + '" stroke-width="1.6" stroke-linejoin="round"/>';
// crosshair centred on (c, c) with a gap in the middle and a green centre dot: for drawing and picking spots on the map
const cross = (c, r = 8, gap = 2.6) => {
  const d = 'M' + c + ' ' + (c - r) + 'V' + (c - gap) + 'M' + c + ' ' + (c + gap) + 'V' + (c + r) + 'M' + (c - r) + ' ' + c + 'H' + (c - gap) + 'M' + (c + gap) + ' ' + c + 'H' + (c + r);
  return '<path d="' + d + '" stroke="' + HALO + '" stroke-width="4" stroke-linecap="round"/><path d="' + d + '" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/><circle cx="' + c + '" cy="' + c + '" r="1.7" fill="' + GREEN + '" stroke="' + HALO + '" stroke-width="1"/>';
};
// small badges beside the crosshair saying which tool is drawing
const halo = (d, extra = '') => '<path d="' + d + '" fill="none" stroke="' + HALO + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="' + GREEN + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"' + extra + '/>';
const BADGE = {
  area: halo('M17 17h10v8H17z', ' stroke-dasharray="2.4 1.8"'),
  poly: halo('M17 26l3-9 7 4-2 5z') + [[17, 26], [20, 17], [27, 21], [25, 26]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="1.5" fill="' + GREEN + '" stroke="' + HALO + '" stroke-width="1"/>').join(''),
  radius: halo('M22 16.5a5 5 0 1 0 0.01 0') + '<circle cx="22" cy="21.5" r="1.3" fill="' + GREEN + '"/>',
  county: halo('M18 17h5l1 2h3v4l-2 3h-6l-1-3z') + '<path d="M18 17h5l1 2h3v4l-2 3h-6l-1-3z" fill="' + GREEN + '" fill-opacity=".25"/>'
};
// four-way arrows: dragging the map or the globe
const move = color => { const d = 'M14 4v20M4 14h20M10.5 7.5 14 4l3.5 3.5M10.5 20.5 14 24l3.5-3.5M7.5 10.5 4 14l3.5 3.5M20.5 10.5 24 14l-3.5 3.5';
  return '<path d="' + d + '" fill="none" stroke="' + HALO + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="14" r="2.4" fill="' + color + '" stroke="' + HALO + '" stroke-width="1.2"/>'; };
// a building with a corner bracket: clicking opens this building (the map at street zoom)
const BUILDING = '<path d="M3 3v7M3 3h7" stroke="' + HALO + '" stroke-width="4" stroke-linecap="round"/><path d="M3 3v7M3 3h7" stroke="' + GREEN + '" stroke-width="2" stroke-linecap="round"/><rect x="11" y="9" width="12" height="15" rx="1.5" fill="' + GREEN + '" stroke="' + HALO + '" stroke-width="1.5"/><path d="M14 13h2M18 13h2M14 17h2M18 17h2M16 24v-3h2v3" stroke="' + HALO + '" stroke-width="1.4"/>';

export const CURSORS = {
  default: url(svg(24, arrow(INK)), 4, 3, 'default'),
  pointer: url(svg(24, arrow(GREEN)), 4, 3, 'pointer'),
  grab: url(svg(28, move(INK)), 14, 14, 'grab'),
  grabbing: url(svg(28, move(GREEN)), 14, 14, 'grabbing'),
  cross: url(svg(28, cross(14, 9)), 14, 14, 'crosshair'),
  area: url(svg(28, cross(9) + BADGE.area), 9, 9, 'crosshair'),
  poly: url(svg(28, cross(9) + BADGE.poly), 9, 9, 'crosshair'),
  radius: url(svg(28, cross(9) + BADGE.radius), 9, 9, 'crosshair'),
  county: url(svg(28, arrow(GREEN) + BADGE.county), 4, 3, 'pointer'),
  building: url(svg(28, BUILDING), 3, 3, 'pointer'),
  resize: url(svg(28, '<path d="M14 7v14" stroke="' + HALO + '" stroke-width="4" stroke-linecap="round"/><path d="M14 7v14" stroke="' + INK + '" stroke-width="1.6" stroke-linecap="round"/>' + halo('M5 14h18M9 10l-4 4 4 4M19 10l4 4-4 4')), 14, 14, 'col-resize'),
  zoom: url(svg(28, '<circle cx="11.5" cy="11.5" r="7" fill="' + HALO + '" fill-opacity=".85" stroke="' + HALO + '" stroke-width="4"/><circle cx="11.5" cy="11.5" r="7" fill="none" stroke="' + INK + '" stroke-width="1.8"/>' + halo('M16.5 16.5 24 24') + '<path d="M8.5 11.5h6M11.5 8.5v6" stroke="' + GREEN + '" stroke-width="1.8" stroke-linecap="round"/>'), 11, 11, 'zoom-in'),
  help: url(svg(28, arrow(INK) + '<circle cx="21" cy="21" r="5.5" fill="' + GREEN + '" stroke="' + HALO + '" stroke-width="1.4"/><path d="M19.3 19.6a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.5-.7 1v.3M21 24.4v.1" fill="none" stroke="' + HALO + '" stroke-width="1.4" stroke-linecap="round"/>'), 4, 3, 'help')
};

// put them on the page (once, on load)
export function installCursors(root = globalThis.document?.documentElement) {
  if (!root?.style) return;
  for (const [k, v] of Object.entries(CURSORS)) root.style.setProperty('--cur-' + k, v);
}
installCursors();
