// The map pages of the Site Environmental report (lib/reports/siteenv.mjs): the parcel outline with the constraints round it
// (FEMA flood zones, mapped wetlands, contours), the soils under it with each soil's share of the parcel, and the ground
// (lidar contours over a hillshade, and slope with the way water runs). Pure: api/sitereport.js fetches the layers and
// passes them in the parcel's own feet (frame(origin), lib/siteplan.mjs).
//   layers: { box: [[x0, y0], [x1, y1]], flood: [{ zone, sub, sfha, rings }], wetlands: [{ type, code, acres, rings }],
//             soils: [{ mukey, name, rings }], terrain: T or null, errors: { flood?, wetlands?, soils?, terrain? } }
//   rings: [[[x, y] ft, …], …] outer rings then holes, each polygon's rings together (even-odd fill)
import { C, esc, n0, n1, n2, pct, pageOf, card, table, bars, pathOf, gridSvg, northArrow, scaleBar, chip, niceStep } from './plain.mjs';
import { SLOPES, contourLines, slopeGrid, raster, hillshade, imageOver, polyline, cover, flowArrows } from './topo.mjs';
import { smoothed, summary } from '../terrain.mjs';
import { inRing } from '../siteplan.mjs';

// FEMA zones by risk: the 1% annual chance zones first
export const ZONE_STYLE = z => /^(VE|V)/.test(z) ? ['#c5221f', 'Coastal high hazard (V)'] : /^A/.test(z) ? ['#d93025', '1% annual chance (A zones)'] : /0\.2|X500|SHADED/i.test(z) ? ['#e8a317', '0.2% annual chance'] : /^D/.test(z) ? ['#9aa0a6', 'Undetermined (D)'] : null;
const SOIL_COLORS = ['#8ab4f8', '#f6aea9', '#a8dab5', '#fdd663', '#d7aefb', '#fcad70', '#78d9ec', '#c5d9a3', '#e6c9a8', '#b0bec5'];
const hexA = (h, a) => 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')';
const polyPath = (V, rings) => rings.map(r => pathOf(V, r)).join('');
// a point inside a polygon's rings (even-odd: holes cut out)
const inRings = (p, rings) => rings.reduce((n, r) => n + (inRing(p, r) ? 1 : 0), 0) % 2 === 1;
// the share of the parcel each soil covers (points on a lattice inside the parcel)
export function soilShares(ring, soils, n = 70) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), dx = (Math.max(...xs) - x0) / n, dy = (Math.max(...ys) - y0) / n, hit = new Map(); let tot = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const p = [x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy]; if (!inRing(p, ring)) continue; tot++; const s = soils.find(s => inRings(p, s.rings)); if (s) hit.set(s.key, (hit.get(s.key) || 0) + 1); }
  return new Map([...hit].map(([k, v]) => [k, tot ? v / tot * 100 : 0]));
}

function frameSvg(V, W, H, inner, F) {
  return '<svg class="map" style="overflow:hidden" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' + inner + gridSvg(V, niceStep(110 / V.s), F.toLL).replace(/stroke="#[0-9a-f]{6}"/, 'stroke="rgba(0,0,0,.06)"') + northArrow(W - 26, 12) + scaleBar(V) + '</svg>';
}
// a box of the page's shape (W x H) round the parcel with a margin, kept inside the layers' box: a short map that still
// shows the whole parcel
export function boxRound(ring, box, W, H, margin = 90) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let h = Math.max(Math.max(...ys) - Math.min(...ys), (Math.max(...xs) - Math.min(...xs)) * H / W) + 2 * margin, w = h * W / H;
  const bw = box[1][0] - box[0][0], bh = box[1][1] - box[0][1]; if (w > bw) { w = bw; h = w * H / W; } if (h > bh) { h = bh; w = h * W / H; }
  const x0 = Math.min(Math.max(cx - w / 2, box[0][0]), box[1][0] - w), y0 = Math.min(Math.max(cy - h / 2, box[0][1]), box[1][1] - h);
  return [[x0, y0], [x0 + w, y0 + h]];
}
const legend = items => '<div class="row" style="flex-wrap:wrap;gap:12px;margin-top:6px">' + items.map(([c, l, line]) => '<span class="note" style="color:' + C.sub + '"><span class="dot" style="' + (line ? 'background:transparent;border:2px solid ' + c : 'background:' + c) + '"></span>' + esc(l) + '</span>').join('') + '</div>';
const missing = (what, why) => '<p class="note" style="color:' + C.amber + ';margin-top:4px">' + esc(what) + ' didn\'t load' + (why ? ' (' + esc(String(why).slice(0, 80)) + ')' : '') + ': re-run the report to include it; until then, a blank is not "none".</p>';

export function envMapPages({ head, foot, ring, origin, F, layers, soilInfo = [], png }) {
  const L = layers || {}, box = L.box, W = 720, pages = [];
  if (!box) return pages;
  { const sh = soilShares(ring, (L.soils || []).map((x, k) => ({ ...x, key: x.mukey || x.name || k }))); L.soils = (L.soils || []).map((x, k) => ({ ...x, share: sh.get(x.mukey || x.name || k) || 0 })); }
  // 1. the parcel and its constraints
  { const H = 520, V = cover(box, W, H), o = [];
    const T = L.terrain && !L.terrain.coarse ? smoothed(L.terrain, Math.max(1, Math.round(10 / L.terrain.cell))) : null;
    if (T) { const s = summary(L.terrain, ring), rel = s ? s.max - s.min : 0, iv = rel > 40 ? 5 : rel > 8 ? 2 : 1;
      for (const c of contourLines(T, iv)) o.push('<path d="' + c.lines.map(l => polyline(V, l)).join('') + '" fill="none" stroke="#bdc1c6" stroke-width=".45"/>'); }
    const zones = (L.flood || []).map(f => ({ ...f, st: ZONE_STYLE(f.zone) })).filter(f => f.st);
    for (const f of zones) o.push('<path d="' + polyPath(V, f.rings) + '" fill="' + hexA(f.st[0], 0.22) + '" fill-rule="evenodd" stroke="' + f.st[0] + '" stroke-width=".8"/>');
    for (const a of L.protectedLand || []) o.push('<path d="' + polyPath(V, a.rings) + '" fill="rgba(24,128,56,.10)" fill-rule="evenodd" stroke="#188038" stroke-width="1" stroke-dasharray="4 2"/>');
    for (const h of L.habitat || []) o.push('<path d="' + polyPath(V, h.rings) + '" fill="rgba(199,119,0,.18)" fill-rule="evenodd" stroke="#c77700" stroke-width="1"/>');
    for (const w of L.wetlands || []) o.push('<path d="' + polyPath(V, w.rings) + '" fill="rgba(16,152,173,.28)" fill-rule="evenodd" stroke="#1098ad" stroke-width=".8"/>');
    for (const b of L.waterbodies || []) o.push('<path d="' + polyPath(V, b.rings) + '" fill="rgba(66,133,244,.35)" fill-rule="evenodd" stroke="#4285f4" stroke-width=".6"/>');
    for (const st of L.streams || []) o.push('<path d="' + st.paths.map(pp => polyline(V, pp)).join('') + '" fill="none" stroke="#1a73e8" stroke-width="' + (st.name ? 1.6 : 1) + '"/>');
    o.push('<path d="' + pathOf(V, ring) + '" fill="' + C.accentFill + '" stroke="' + C.accent + '" stroke-width="2.2" stroke-linejoin="round"/>');
    // the nearest stream to the parcel's edge (ft): streams often carry a state buffer or a stream crossing permit
    const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    let near = null; for (const st of L.streams || []) for (const pp of st.paths) for (let i = 1; i < pp.length; i++) { const d = inRing(pp[i], ring) ? 0 : Math.min(...ring.map(q => segD(q, pp[i - 1], pp[i]))); if (!near || d < near.d) near = { d, name: st.name }; }
    const touching = list => (list || []).filter(a => a.rings.some(r => r.some(p => inRing(p, ring))) || ring.some(p => inRings(p, a.rings)));
    const onSite = { flood: zones.filter(f => f.rings.some(r => ring.some(p => inRings(p, f.rings)) || r.some(p => inRing(p, ring)))), wet: (L.wetlands || []).filter(w => w.rings.some(r => r.some(p => inRing(p, ring))) || ring.some(p => inRings(p, w.rings))) };
    const leg = [[C.accent, 'Parcel outline', true]].concat([...new Map(zones.map(f => [f.st[1], f.st[0]])).entries()].map(([l, c]) => [c, 'FEMA ' + l])).concat((L.wetlands || []).length ? [['#1098ad', 'Mapped wetlands (NWI)']] : []).concat((L.streams || []).length || (L.waterbodies || []).length ? [['#1a73e8', 'Streams & water bodies (USGS)']] : []).concat((L.habitat || []).length ? [['#c77700', 'Critical habitat (USFWS)']] : []).concat((L.protectedLand || []).length ? [['#188038', 'Protected land (PAD-US)', true]] : []).concat(T ? [['#bdc1c6', 'Ground contours (lidar)', true]] : []);
    const notes = [L.errors?.flood && missing('The FEMA flood map', L.errors.flood), L.errors?.wetlands && missing('The wetlands map', L.errors.wetlands), L.errors?.terrain && missing('The ground elevations', L.errors.terrain),
      L.errors?.streams && missing('The USGS streams', L.errors.streams), L.errors?.habitat && missing('Critical habitat', L.errors.habitat), L.errors?.protectedLand && missing('Protected land', L.errors.protectedLand)].filter(Boolean).join('');
    const facts = card('Constraints at the parcel', [['Flood zones touching it', onSite.flood.length ? [...new Set(onSite.flood.map(f => f.zone))].join(', ') : zones.length ? 'None (zones nearby only)' : L.errors?.flood ? 'Not loaded' : 'None mapped'],
      ['Mapped wetlands touching it', onSite.wet.length ? onSite.wet.map(w => w.code || w.type).filter(Boolean).slice(0, 4).join(', ') : L.errors?.wetlands ? 'Not loaded' : 'None mapped'], ['Wetlands within the map', n0((L.wetlands || []).length) + ' shape' + ((L.wetlands || []).length === 1 ? '' : 's')],
      ['Soils under it', n0((L.soils || []).filter(s => s.share > 0).length) + ' map unit' + ((L.soils || []).filter(s => s.share > 0).length === 1 ? '' : 's')],
      ['Nearest stream (USGS)', L.errors?.streams ? 'Not loaded' : near ? (near.d < 1 ? 'Crosses the parcel' : n0(near.d) + ' ft') + (near.name ? ' · ' + near.name : '') : 'None within the map'],
      ['Critical habitat (USFWS)', L.errors?.habitat ? 'Not loaded' : touching(L.habitat).length ? touching(L.habitat).map(h => h.name).slice(0, 3).join(', ') : (L.habitat || []).length ? 'Nearby only' : 'None mapped'],
      ['Protected land (PAD-US)', L.errors?.protectedLand ? 'Not loaded' : touching(L.protectedLand).length ? touching(L.protectedLand).map(a => a.name).slice(0, 2).join(', ') : (L.protectedLand || []).length ? 'Nearby: ' + L.protectedLand[0].name : 'None mapped']]);
    pages.push(pageOf({ ...head, kicker: 'Site environmental · site & constraints', sub: 'The parcel outline with flood zones, wetlands, streams, critical habitat, protected land and contours round it' },
      frameSvg(V, W, H, o.join(''), F) + legend(leg) + notes + '<div class="row" style="margin-top:9px"><div class="col">' + facts + '</div><div class="col"><p class="para">Mapped wetlands are the US Fish & Wildlife Service\'s National Wetlands Inventory, drawn from aerial photos: a wetland on or next to the parcel needs a delineation before design, and a jurisdictional one may need a Corps of Engineers permit. FEMA zones are the effective flood map; a site in or beside an A zone needs an elevation certificate and its finished floors set above the base flood elevation.</p></div></div>', foot));
  }
  // 2. soils
  { const H = 470, V = cover(box, W, H), soils = (L.soils || []).map((s, k) => ({ ...s, key: s.mukey || s.name || k })), shares = soilShares(ring, soils), names = [...new Set(soils.map(s => s.name))];
    const color = name => SOIL_COLORS[names.indexOf(name) % SOIL_COLORS.length], o = [];
    for (const s of soils) o.push('<path d="' + polyPath(V, s.rings) + '" fill="' + hexA(color(s.name), 0.55) + '" fill-rule="evenodd" stroke="#fff" stroke-width=".8"/>');
    o.push('<path d="' + pathOf(V, ring) + '" fill="none" stroke="' + C.ink + '" stroke-width="2.2" stroke-linejoin="round"/>');
    // number each soil at its biggest piece's middle
    names.forEach((nm, k) => { const ps = soils.filter(s => s.name === nm).flatMap(s => s.rings.slice(0, 1)).sort((a, b) => b.length - a.length)[0]; if (!ps) return;
      const c = ps.reduce((a, p) => [a[0] + p[0] / ps.length, a[1] + p[1] / ps.length], [0, 0]), [x, y] = V.P(c); if (x > 10 && x < W - 10 && y > 10 && y < H - 10) o.push(chip(x, y, String(k + 1), { size: 7, weight: 600 })); });
    const share = nm => soils.filter(s => s.name === nm).reduce((t, s) => t + (shares.get(s.key) || 0), 0), info = nm => soilInfo.find(x => x.name === nm) || {};
    const lim = v => !v ? '—' : /Very/.test(v) ? '<span style="color:' + C.red + '">' + esc(v) + '</span>' : /Somewhat/.test(v) ? '<span style="color:' + C.amber + '">' + esc(v) + '</span>' : esc(v);
    const rows = names.map((nm, k) => [String(k + 1), '<span class="dot" style="background:' + color(nm) + '"></span><b>' + esc(nm) + '</b>', share(nm) ? pct(share(nm), 0) : '<span class="sub">near</span>', esc(info(nm).drainage || '—'), esc(info(nm).hydrologic_group || '—'), esc(info(nm).flooding || '—'),
      info(nm).water_table_cm != null ? n1(info(nm).water_table_cm / 30.48) + ' ft' : '—', info(nm).bedrock_cm != null ? n1(info(nm).bedrock_cm / 30.48) + ' ft' : '>6.5 ft', lim(info(nm).septic), lim(info(nm).small_commercial), lim(info(nm).dwellings_without_basements)]).sort((a, b) => (parseFloat(b[2]) || 0) - (parseFloat(a[2]) || 0));
    pages.push(pageOf({ ...head, kicker: 'Site environmental · soils', sub: 'USDA soil survey map units under and round the parcel, with each one\'s share of the parcel' },
      (soils.length ? frameSvg(V, W, H, o.join(''), F) : '<div class="card"><p class="para">No soil map units came back for this area.</p></div>') + (L.errors?.soils ? missing('The soil map', L.errors.soils) : '') + '<div style="height:8px"></div>' +
      table([['#'], ['Soil map unit'], ['Of parcel', 'n'], ['Drainage'], ['Hydro group'], ['Flooding'], ['Water table', 'n'], ['Bedrock', 'n'], ['Septic field'], ['Small commercial'], ['Homes, no basement']], rows) +
      '<p class="note" style="margin-top:5px">Hydrologic group D (and C/D) soils shed most rain, so plan for more detention. "Very limited" means the soil itself makes that use costly (shrink-swell, wetness or low strength), usually solved with engineered fill, lime treatment or deeper foundations. "Septic field" is the USDA rating for septic tank absorption fields: a "Very limited" soil usually means an engineered or alternative system, subject to the county health department’s own soil test. A geotechnical report sets the actual design.</p>', foot));
  }
  // 3. the ground: contours over a hillshade, then slope with the way water runs
  const T0 = L.terrain;
  if (T0 && !T0.coarse) {
    const T = smoothed(T0, Math.max(1, Math.round(10 / T0.cell))), s = summary(T0, ring), rel = s ? s.max - s.min : 0, iv = rel > 40 ? 2 : rel > 4 ? 1 : 0.5, major = iv * 5, H = 330;
    const vb = boxRound(ring, box, W, H), V = cover(vb, W, H), C1 = contourLines(T, iv), o = [imageOver(V, T, hillshade(T, png))];
    for (const c of C1) { const maj = Math.abs(c.z / major - Math.round(c.z / major)) < 1e-6; o.push('<path d="' + c.lines.map(l => polyline(V, l)).join('') + '" fill="none" stroke="' + (maj ? '#3c4043' : '#a8adb3') + '" stroke-width="' + (maj ? 0.9 : 0.4) + '"/>'); }
    o.push('<path d="' + pathOf(V, ring) + '" fill="none" stroke="' + C.accent + '" stroke-width="2"/>');
    const sl = slopeGrid(T), V2 = cover(vb, W, H), img = raster(T, png, k => { const v = sl[k], b = SLOPES.find(([a, c]) => v >= a && v < c) || SLOPES[0], h = b[3]; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255]; });
    const defs = '<defs>' + ['i', 'o'].map(k => '<marker id="ah' + k + '" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="' + (k === 'i' ? C.ink : '#80868b') + '"/></marker>').join('') + '</defs>';
    const inside = []; for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) if (inRing([T.x0 + i * T.cell, T.y0 + j * T.cell], ring)) inside.push(sl[j * T.nx + i]);
    const bandShare = SLOPES.map(([a, b, name, col]) => [name + ' (' + (b === Infinity ? '>' + a : a + '–' + b) + '%)', inside.filter(v => v >= a && v < b).length / (inside.length || 1) * 100, col === '#f1f3f4' ? '#bdc1c6' : col]);
    pages.push(pageOf({ ...head, kicker: 'Site environmental · topography & slope', sub: 'Lidar contours every ' + iv + ' ft over a hillshade; slope, with arrows pointing downhill' },
      frameSvg(V, W, H, o.join(''), F) + '<div style="height:6px"></div>' + frameSvg(V2, W, H, defs + imageOver(V2, T, img) + flowArrows(T, ring, V2) + '<path d="' + pathOf(V2, ring) + '" fill="none" stroke="' + C.ink + '" stroke-width="1.8"/>', F) +
      '<div class="row" style="margin-top:8px"><div class="col">' + card('The ground on the parcel', s ? [['Lowest / highest', n1(s.min) + ' / ' + n1(s.max) + ' ft (NAVD 88)'], ['Overall slope', n2(s.slope) + '%'], ['Falls', s.flat ? 'Nearly flat' : n1(s.fall) + ' ft toward the ' + s.toward], ['Low channel or pond', s.dip != null ? 'Yes, down to ' + n1(s.dip) + ' ft' : 'None found']] : []) + '</div>' +
      '<div class="col"><div class="k" style="margin-bottom:3px">Slope on the parcel</div>' + bars(bandShare, { W: 350, labelW: 120, fmt: v => n1(v) + '%' }) + '</div></div>', foot));
  } else if (L.errors?.terrain || T0?.coarse) pages.push(pageOf({ ...head, kicker: 'Site environmental · topography & slope', sub: 'Ground elevations' }, '<div class="card">' + missing('Detailed ground elevations', L.errors?.terrain || 'only a coarse model here') + '</div>', foot));
  return pages;
}
