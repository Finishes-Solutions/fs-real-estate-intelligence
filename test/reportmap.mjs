// Report maps (src/reportkit.js areaMap): every report PDF draws its area on an Esri street map made of plain https tile
// images (the PDF renderer runs no scripts) with the outline on top in the same Web Mercator projection.
import assert from 'node:assert/strict';
const { areaMap, mapFrame, merc, areaSvg, BASEMAP } = await import('../src/reportkit.js');

// Web Mercator: the equator / prime meridian is the middle of the world, and lon -180 the left edge
assert.deepEqual(merc([0, 0]).map(v => +v.toFixed(9)), [0.5, 0.5]); assert.equal(merc([-180, 10])[0], 0);
// a known tile: downtown Houston (-95.37, 29.76) is in z=10 tile x 240, y 423
{ const [x, y] = merc([-95.37, 29.76]); assert.equal(Math.floor(x * 1024), 240); assert.equal(Math.floor(y * 1024), 423); }

const waller = { type: 'Polygon', coordinates: [[[-96.20, 29.90], [-95.75, 29.90], [-95.75, 30.30], [-96.20, 30.30], [-96.20, 29.90]]] };
const html = areaMap([{ geometry: waller }], { W: 1000, H: 440 });
const tiles = [...html.matchAll(/<img src="([^"]+)"[^>]*left:([-\d.]+)%;top:([-\d.]+)%;width:([\d.]+)%;height:([\d.]+)%/g)];
assert.ok(tiles.length >= 4 && tiles.length <= 48, 'a handful of tiles: ' + tiles.length);
assert.ok(tiles.every(t => t[1].startsWith('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/')), 'Esri street tiles over https');
assert.ok(html.includes(BASEMAP.attr.replace('©', '©')), 'attribution shown');
// the tiles cover the whole frame with no gaps
const L = Math.min(...tiles.map(t => +t[2])), T = Math.min(...tiles.map(t => +t[3])), R = Math.max(...tiles.map(t => +t[2] + +t[4])), B = Math.max(...tiles.map(t => +t[3] + +t[5]));
assert.ok(L <= 0 && T <= 0 && R >= 100 && B >= 100, 'tiles cover the frame');
// the outline is drawn with the same projection as the tiles: its corners land where the tile maths puts them
{ const f = mapFrame(waller.coordinates[0], { w: 700, h: 308 }), [x, y] = merc([-96.20, 29.90]);
  const px = x * f.size - f.left, py = y * f.size - f.top;
  assert.ok(html.includes('M' + px.toFixed(1) + ',' + py.toFixed(1)), 'outline corner at the projected pixel');
  assert.ok(px > 0 && px < 700 && py > 0 && py < 308, 'the area sits inside the frame');
  const [qx, qy] = merc([-95.75, 30.30]), wide = (qx - x) * f.size, tall = (y - qy) * f.size;
  assert.ok(wide <= 700 && tall <= 308, 'the area fits the frame'); assert.ok(wide > 700 * .7 || tall > 308 * .7, 'and fills most of it (in-between zoom)');
  assert.ok(f.T > 170 && f.T < 370, 'tiles drawn near their own size: ' + f.T.toFixed(0)); }
// a lone point gets a neighbourhood around it, not a world map or zoom 18
{ const f = mapFrame([[-95.93, 30.05]], { w: 700, h: 300, minSpanM: 6000 }); assert.ok(f.zf >= 11 && f.zf <= 14, 'point zoom ' + f.zf); }
// a big area (all seven counties) stays within the tile budget
{ const big = { type: 'Polygon', coordinates: [[[-96.8, 29.0], [-94.9, 29.0], [-94.9, 30.9], [-96.8, 30.9], [-96.8, 29.0]]] };
  const n = (areaMap([{ geometry: big }], { W: 1000, H: 700 }).match(/<img /g) || []).length; assert.ok(n > 0 && n <= 48, 'tile cap: ' + n); }
// lines (traffic), points (incidents) and a LineString path (flight) draw; framed on `fit`, a point outside it is left out
{ const path = { type: 'LineString', coordinates: [[-95.5, 29.7], [-95.4, 29.8]] }, h = areaMap([{ geometry: path, fill: 'none' }], { fit: path, points: [{ c: [-95.45, 29.75], label: 'Now' }, { c: [-80, 40] }], lines: [{ coords: [[-95.5, 29.75], [-95.4, 29.75]], stroke: '#dc2626' }] });
  assert.match(h, /stroke="#dc2626"/); assert.equal((h.match(/<circle/g) || []).length, 1, 'the far-away point is skipped'); assert.match(h, />Now</);
  assert.ok(!/Z" fill/.test(h.split('<svg')[1].split('</svg>')[0].match(/<path d="[^"]*"/g).join('')), 'a line is not closed'); }
// the old outline-only drawing is still there on request, and empty input draws nothing
assert.match(areaSvg([{ geometry: waller }], { plain: true }), /^<svg/); assert.equal(areaMap([]), '');
console.log('report maps ok');
