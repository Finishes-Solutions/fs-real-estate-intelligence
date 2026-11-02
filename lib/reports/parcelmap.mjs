// The Parcel Map report for the selected parcel or parcels: the site drawn to scale from the parcel outlines (every line
// dimensioned, corners numbered), the parcels' values in one table, the boundary as courses (bearing and distance) and
// corner coordinates, an area check against the assessor's acreage, and a page of everything on record for each parcel.
// Plain look (lib/reports/plain.mjs): unbranded. Pure: the caller passes the records (Regrid or the appraisal district)
// and the site facts it already has.
//   parcelReport({ title, area, project?, date, parcels: [parcel], site?: { flood, schools, city, near, traffic, water,
//     sewer, districts, oz }, source }) -> HTML
//   parcel: { id, owner, mail, situs, city, county, state, zip, landUse, useCode, zoning, zoningDesc, acres, gisAcres, sqft,
//     land, improv, total, valueType, taxYear, legal, lastSale, yearBuilt, bldgSf, stories, tract, bg, block, qoz, uuid,
//     refreshed, revised, neighborhood, geom: [[lon, lat], …] (outer ring) }
import { C, esc, n0, n1, n2, usd, doc, pageOf, card, tiles, table, fit, pathOf, gridSvg, northArrow, scaleBar, chip, niceStep, bearing, ringAreaFt, perimeterFt, openRing } from './plain.mjs';
import { frame } from '../siteplan.mjs';
import { boundaryCourses } from './courses.mjs';

const SF_ACRE = 43560;
// the smallest rectangle round a ring (rotating the box to each edge of the hull): { w, d, angle } in ft and degrees
export function boxOf(ring) {
  const pts = ring.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1)); let best = null;
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of hull) { const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0); if (!best || area < best.area) best = { area, w: Math.min(u1 - u0, v1 - v0), d: Math.max(u1 - u0, v1 - v0), angle: Math.atan2(uy, ux) * 180 / Math.PI }; }
  return best || { w: 0, d: 0, angle: 0, area: 0 };
}
// each parcel's outline in the site's feet, its courses and its own numbers
export function geometryOf(parcels) {
  const all = parcels.flatMap(p => openRing(p.geom || [])), origin = all.length ? [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length] : [0, 0], F = frame(origin);
  const list = parcels.map(p => { let ring = openRing(p.geom || []).map(q => F.toFt(q));
    { let a = 0; for (let i = 0; i < ring.length; i++) { const u = ring[i], v = ring[(i + 1) % ring.length]; a += u[0] * v[1] - v[0] * u[1]; } if (a > 0) ring = [ring[0], ...ring.slice(1).reverse()]; } // clockwise, as the courses are read, from the county's own first corner
    // the courses and corners listed: straight lines and curves between real corners (lib/reports/courses.mjs); `ring` stays whole
    const { courses, corners } = boundaryCourses(ring);
    const area = ringAreaFt(ring), c = ring.length ? [ring.reduce((s, q) => s + q[0], 0) / ring.length, ring.reduce((s, q) => s + q[1], 0) / ring.length] : [0, 0];
    return { p, ring, courses, corners, area, perimeter: perimeterFt(ring), box: boxOf(ring), centre: c, centreLL: F.toLL(c) }; });
  return { origin, F, list, area: list.reduce((s, g) => s + g.area, 0) };
}

// the site map: every parcel to scale, lines dimensioned, corners numbered, parcels badged; W x H px
export function siteMap(G, { W = 720, H = 560, corners = true, dims = true, pad = 56 } = {}) {
  const pts = G.list.flatMap(g => g.ring); if (!pts.length) return '';
  const V = fit(pts, W, H, pad), step = niceStep(80 / V.s), o = ['<svg class="map" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">'];
  o.push(gridSvg(V, step, G.F.toLL));
  const many = G.list.length > 1;
  G.list.forEach((g, k) => o.push('<path d="' + pathOf(V, g.ring) + '" fill="' + (many && k % 2 ? 'rgba(47,107,255,.16)' : C.accentFill) + '" stroke="' + C.accent + '" stroke-width="1.6" stroke-linejoin="round"/>'));
  if (dims) for (const g of G.list) for (const c of g.courses) { if ((c.arc || c.len) * V.s < 24) continue;
    // a line's label at its middle, a curve's at the middle of its arc; just outside the line (away from the parcel's centre)
    const m = c.type === 'curve' ? c.pts.length >> 1 : 0, p1 = c.type === 'curve' ? c.pts[Math.max(0, m - 1)] : c.a, p2 = c.type === 'curve' ? c.pts[Math.min(c.pts.length - 1, m + 1)] : c.b;
    const [x1, y1] = V.P(p1), [x2, y2] = V.P(p2), [mx, my] = c.type === 'curve' ? V.P(c.pts[m]) : [(x1 + x2) / 2, (y1 + y2) / 2], L = Math.hypot(x2 - x1, y2 - y1) || 1,
      nx = -(y2 - y1) / L, ny = (x2 - x1) / L, [cx, cy] = V.P(g.centre), side = ((mx - cx) * nx + (my - cy) * ny) >= 0 ? 1 : -1;
    o.push(chip(mx + nx * side * 11, my + ny * side * 11, c.type === 'curve' ? 'arc ' + n1(c.arc) + "'" : n1(c.len) + "'")); }
  // the corners (course ends, not every point of the outline); a number only where it doesn't sit on another
  if (corners) for (const g of G.list) { const placed = []; g.corners.forEach((q, i) => { const [x, y] = V.P(q); o.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.2" fill="#fff" stroke="' + C.accent + '" stroke-width="1.2"/>');
    if (!many) { const [cx, cy] = V.P(g.centre), dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, tx = x + dx / d * 10, ty = y + dy / d * 10 + 2.5; if (placed.some(([a, b]) => Math.hypot(a - tx, b - ty) < 11)) return; placed.push([tx, ty]);
      o.push('<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" font-family="Inter" font-size="7" fill="' + C.sub + '" text-anchor="middle">' + (i + 1) + '</text>'); } }); }
  G.list.forEach((g, k) => { const [x, y] = V.P(g.centre); o.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="8" fill="' + C.ink + '"/><text x="' + x.toFixed(1) + '" y="' + (y + 2.6).toFixed(1) + '" font-family="Inter" font-size="8" font-weight="600" fill="#fff" text-anchor="middle">' + (k + 1) + '</text>'); });
  o.push('<g>' + chip(80, 16, 'CENTROID ' + G.origin[1].toFixed(5) + ', ' + G.origin[0].toFixed(5), { size: 6.5, color: C.sub }) + '</g>');
  o.push(northArrow(W - 26, 12), scaleBar(V), '<text x="' + (W - 18) + '" y="' + (H - 40) + '" font-family="Inter" font-size="6.3" fill="' + C.mute + '" text-anchor="end">GRID ' + n0(step) + ' FT</text>', '</svg>');
  return o.join('');
}

const sfOf = p => +p.sqft || (+p.acres ? +p.acres * SF_ACRE : null);
const acresOf = p => +p.acres || (+p.sqft ? +p.sqft / SF_ACRE : null);
// what the record says that doesn't add up (shown, never fixed); outlineAc: the area measured from the outline
export function recordFlags(p, outlineAc = null) {
  const f = [];
  if ((+p.bldgSf > 0 || +p.yearBuilt > 0) && !(+p.improv > 0) && /vacant/i.test(p.landUse || '')) f.push('The record lists a building (' + [p.bldgSf ? n0(p.bldgSf) + ' sf' : '', p.yearBuilt ? 'built ' + p.yearBuilt : ''].filter(Boolean).join(', ') + ') but the land use is vacant and the improvement value is $0: likely removed or not assessed. Check on site.');
  if (+p.acres && outlineAc && Math.abs(outlineAc / p.acres - 1) > 0.05) f.push('The parcel outline measures ' + n2(outlineAc) + ' ac against ' + n2(p.acres) + ' ac on the tax roll (' + n1((outlineAc / p.acres - 1) * 100) + '%). A survey settles which is right.');
  return f;
}
const signed = v => (Math.abs(v) < 0.05 ? '' : v > 0 ? '+' : '') + n1(Math.abs(v) < 0.05 ? 0 : v) + '%';

// the site at a glance under the parcel table: zoning, flood, jurisdiction, access, shape
function glance(parcels, site, G) {
  const zon = [...new Set(parcels.map(p => [p.zoning, p.zoningDesc].filter(Boolean).join(' · ')).filter(Boolean))].join('; '), fl = site.flood, box = G.list.length === 1 ? G.list[0].box : null;
  const owners = [...new Set(parcels.map(p => p.owner).filter(Boolean))], since = parcels.map(p => p.lastSale).filter(Boolean).sort()[0];
  return '<div class="k" style="margin:14px 0 4px">Site at a glance</div><div class="row">' +
    '<div class="col">' + card('Land use & zoning', [['Zoning', zon || '—'], ['Land use', [...new Set(parcels.map(p => p.landUse).filter(Boolean))].join('; ')], ['City limits', site.city || 'Unincorporated'], ['Within ½ mile of', (site.near || []).join(', ') || '—']]) + '</div>' +
    '<div class="col">' + card('Flood & access', [['FEMA flood zone', fl ? fl.zone + (fl.risk ? ' · ' + fl.risk : '') : '—'], ['Base flood elevation', fl?.bfe ? fl.bfe + ' ft' : 'Not set'], ['Busiest nearby road', site.traffic?.[0] ? n0(site.traffic[0].aadt) + ' vehicles/day' : '—'], ['School district', (site.schools || [])[0] || '—']]) + '</div>' +
    '<div class="col">' + card('Ownership & shape', [['Owners', owners.length === 1 ? owners[0] : owners.length + ' owners'], ['Held since', since || '—'], ['Fits a box of', box ? n0(box.w) + ' × ' + n0(box.d) + ' ft' : '—'], ['Depth to width', box ? n1(box.d / (box.w || 1)) + ' : 1' : '—']]) + '</div></div>';
}

export function parcelReport({ title, area = '', project = '', date = '', parcels = [], site = {}, source = 'Regrid parcel record' }) {
  const G = geometryOf(parcels), A = parcels.reduce((s, p) => s + (acresOf(p) || 0), 0), SF = parcels.reduce((s, p) => s + (sfOf(p) || 0), 0), sum = k => parcels.reduce((s, p) => s + (+p[k] || 0), 0);
  // totals only from figures on record: a parcel drawn from the map's lines alone has none, and shows a dash, not $0
  const has = k => parcels.some(p => p[k] != null && p[k] !== '' && Number.isFinite(+p[k])), usdOr = (k, v) => has(k) ? usd(v) : '—';
  const land = sum('land'), improv = sum('improv'), total = sum('total'), n = parcels.length, head = { kicker: 'Parcel map', title, rightSub: [area, project].filter(Boolean).join(' · '), right: n + ' parcel' + (n === 1 ? '' : 's') + ' · ' + (A ? n2(A) + ' ac total' : n2(G.area / SF_ACRE) + ' ac (outline)') };
  const foot = 'Drawn from ' + esc(source) + ' outlines · values are appraisal district figures · conceptual map, not a survey' + (date ? ' · ' + esc(date) : '');
  const pages = [];
  // 1. the map and the parcels
  const rows = parcels.map((p, k) => ['<span class="num">' + (k + 1) + '</span>', '<b class="mono">' + esc(p.id) + '</b><div class="note" style="margin-top:1px">' + esc(p.legal || '') + '</div>', esc(p.owner || '—'), esc(p.situs || '—'), esc(p.landUse || '—'),
    n2(acresOf(p)), n0(sfOf(p)), usd(p.land), +p.improv ? usd(p.improv) : '—', '<b>' + usd(p.total) + '</b>']);
  pages.push(pageOf({ ...head, sub: 'Scaled from parcel geometry' }, siteMap(G, { W: 720, H: 590 }) +
    '<div style="margin:9px 0 6px" class="mono"><b>SITE:</b> ' + n + ' PARCEL' + (n === 1 ? '' : 'S') + ' · ' + n2(A) + ' AC · ' + n0(SF) + ' SF · LAND ' + usdOr('land', land) + ' · IMPROVED ' + usdOr('improv', improv) + ' · ASSESSED ' + usdOr('total', total) + '</div>' +
    '<div class="k" style="margin:8px 0 2px">Parcel detail</div>' + table([['#'], ['Parcel ID'], ['Owner'], ['Situs'], ['Land use'], ['Acres', 'n'], ['Lot SF', 'n'], ['Land value', 'n'], ['Improv.', 'n'], ['Assessed', 'n']], rows,
      { foot: ['', 'Site total', '', '', '', A ? n2(A) : '—', SF ? n0(SF) : '—', usdOr('land', land), usdOr('improv', improv), usdOr('total', total)] }) + glance(parcels, site, G), foot));
  // 2. the boundary: courses (lines and curves), corners, area check and shape; long tables carry on over more pages
  const curveNote = c => c.type === 'curve' ? 'Curve ' + c.turn + ' · arc ' + n1(c.arc) + "' · R " + (Number.isFinite(c.radius) ? n0(c.radius) + "'" : '—') + ' · Δ ' + n1(c.delta) + '°' : '';
  const ROW = 17.5, BUDGET = 840, sections = G.list.map((g, k) => { const p = g.p, gisAc = g.area / SF_ACRE, roll = acresOf(p), curves = g.courses.filter(c => c.type === 'curve').length;
    const check = card('Area check', [['Computed from outline', n0(g.area) + ' sf · ' + n2(gisAc) + ' ac'], ['Tax roll (assessor)', roll ? n2(roll) + ' ac' : '—'], ['Mapped (Regrid GIS acres)', p.gisAcres ? n2(p.gisAcres) + ' ac' : '—'],
      ['Difference, outline vs roll', roll ? signed((gisAc / roll - 1) * 100) : '—'], ['Perimeter', n0(g.perimeter) + ' ft'], ['Corners', String(g.corners.length)], ['Points in the outline', n0(g.ring.length)]]);
    const lines = g.courses.map(c => c.len), shape = card('Shape', [['Smallest box round it', n0(g.box.w) + ' × ' + n0(g.box.d) + ' ft'], ['Box turned', n1(((g.box.angle % 180) + 180) % 180) + '° from east'], ['Fills its box', n0(g.area / (g.box.w * g.box.d || 1) * 100) + '%'],
      ['Depth to width', n1(g.box.d / (g.box.w || 1)) + ' : 1'], ['Longest course', n1(Math.max(...lines)) + ' ft'], ['Shortest course', n1(Math.min(...lines)) + ' ft']]);
    const note = g.ring.length > g.corners.length + 2 ? '<p class="note" style="margin-top:6px">The county\'s outline has ' + n0(g.ring.length) + ' points; ' + (curves ? 'its bends are listed as ' + curves + ' curve' + (curves === 1 ? '' : 's') + ' (chord bearing and length, with the arc) and ' : '') + 'points within a foot of a straight line are left out of the list. The full outline is in the GeoJSON export.</p>' : '';
    return { head: '<h2 style="margin-top:2px"><span class="num">' + (k + 1) + '</span>&nbsp; ' + esc(p.id) + ' <span class="sub" style="font-weight:500">· ' + esc(p.situs || '') + '</span></h2>', side: check + shape + note, sideH: 360 + (note ? 50 : 0),
      tables: [{ cols: [['Course'], ['Bearing'], ['Distance', 'n'], ['Curve']], rows: g.courses.map(c => [c.from + ' → ' + c.to, '<span class="mono">' + c.brg + '</span>', n2(c.len) + "'", '<span class="note">' + curveNote(c) + '</span>']), foot: ['Perimeter', '', n2(g.perimeter) + "'", ''] },
        { cols: [['Corner'], ['Latitude', 'n'], ['Longitude', 'n']], rows: g.corners.map((q, i) => { const [lon, lat] = G.F.toLL(q); return [String(i + 1), '<span class="mono">' + lat.toFixed(6) + '</span>', '<span class="mono">' + lon.toFixed(6) + '</span>']; }) }] }; });
  const intro = '<div class="row" style="margin-bottom:10px"><div style="flex:1">' + siteMap(G, { W: 300, H: 230, dims: false }) + '</div><div style="flex:1.25"><p class="para">Bearings are from grid north in the site\'s own frame, distances in US survey feet, both measured on the mapped parcel outline. ' +
      'They are for planning and for checking a survey against, not a substitute for one: county parcel lines are drawn from plats and deeds and are often a few feet off.</p><div style="height:8px"></div>' +
      tiles([[n2(G.area / SF_ACRE), 'Acres (outline)'], [n0(G.area), 'Square feet'], [n0(G.list.reduce((s, g) => s + g.perimeter, 0)), 'Perimeter ft'], [String(G.list.reduce((s, g) => s + g.corners.length, 0)), 'Corners']]) + '</div></div>';
  // pages filled top to bottom: each parcel's tables run down the left column (the courses, then the corners), its area
  // check and shape beside the first part; what doesn't fit carries on, headed "(continued)", on the next page
  { const bpages = [[intro]]; let left = BUDGET - 270;
    for (const sec of sections) {
      if (left < 150) { bpages.push([]); left = BUDGET; }
      let ti = 0, ri = 0, first = true;
      while (ti < sec.tables.length) {
        bpages[bpages.length - 1].push(first ? sec.head : sec.head.replace('</h2>', ' <span class="sub" style="font-weight:500">(continued)</span></h2>')); let room = left - 30;
        const col = [];
        while (ti < sec.tables.length) { const t = sec.tables[ti], can = Math.floor((room - 44 - (t.foot ? ROW : 0)) / ROW); if (can < 3 && t.rows.length - ri > Math.max(0, can)) break;
          const take = Math.min(t.rows.length - ri, Math.max(0, can)), last = ri + take >= t.rows.length; col.push(table(t.cols, t.rows.slice(ri, ri + take), { foot: last ? t.foot : null }));
          room -= 44 + take * ROW + (last && t.foot ? ROW : 0) + 6; ri += take; if (last) { ti++; ri = 0; } else break; }
        bpages[bpages.length - 1].push('<div class="row" style="margin-bottom:8px"><div class="col">' + col.join('<div style="height:6px"></div>') + '</div><div class="col" style="flex:.8">' + (first ? sec.side : '') + '</div></div>');
        left = Math.min(room, left - 30 - (first ? sec.sideH : 0)); first = false;
        if (ti < sec.tables.length) { bpages.push([]); left = BUDGET; }
      }
    }
    bpages.forEach((b, i) => pages.push(pageOf({ ...head, kicker: 'Parcel map · boundary' + (i ? ' (continued)' : ''), sub: 'Courses run clockwise from corner 1 as numbered on the map' }, b.join(''), foot))); }
  // 3. each parcel on record
  parcels.forEach((p, k) => {
    const g = G.list[k], flags = recordFlags(p, g ? g.area / SF_ACRE : null), perAc = acresOf(p) && +p.total ? +p.total / acresOf(p) : null, perSf = sfOf(p) && +p.total ? +p.total / sfOf(p) : null, fl = site.flood;
    const left = [
      card('Parcel highlights', [['Full address', [p.situs, p.city, p.state, p.zip].filter(Boolean).join(', ').toUpperCase()], ['Measurements', n2(acresOf(p)) + ' acres · ' + n0(sfOf(p)) + ' sf'], ['Owner (assessor)', p.owner], ['Land use', p.landUse], ['Zoning', [p.zoning, p.zoningDesc].filter(Boolean).join(' · ')]]),
      card('Parcel details', [['Parcel ID', p.id], ['Situs address', p.situs], ['City (mailing)', p.city], ['County', p.county], ['State', p.state], ['ZIP code', p.zip], ['Neighborhood code', p.neighborhood], ['Use code', p.useCode], ['Building on record', p.bldgSf || p.yearBuilt ? [p.bldgSf ? n0(p.bldgSf) + ' sf' : '', p.yearBuilt ? 'built ' + p.yearBuilt : '', p.stories ? p.stories + ' story' : ''].filter(Boolean).join(' · ') : 'None']]),
      card('Owner', [['Owner name', p.owner], ['Mailing address', p.mail], ['Owner occupied', p.mail && p.situs ? (String(p.mail).toUpperCase().includes(String(p.situs).toUpperCase()) ? 'Yes' : 'No (mails elsewhere)') : null]]),
      card('Value & sales', [['Value type', p.valueType], ['Tax year', p.taxYear], ['Land value', usd(p.land)], ['Improvement value', +p.improv ? usd(p.improv) : '$0'], ['Total value', usd(p.total)], ['Per acre', perAc ? usd(perAc) : null], ['Per square foot', perSf ? '$' + n2(perSf) : null], ['Last sale / transfer', p.lastSale], ['Years since', p.lastSale && date ? n1((Date.parse(date) - Date.parse(p.lastSale)) / 3.156e10) : null]]),
    ];
    const right = [
      card('Jurisdiction & services', [['City limits', site.city || 'Unincorporated'], ['Within ½ mile of', (site.near || []).join(', ') || '—'], ['School district', (site.schools || []).join(', ') || '—'], site.water !== undefined || site.sewer !== undefined ? ['Water / sewer CCN', [site.water || 'none mapped', site.sewer || 'none mapped'].join(' / ')] : null,
        ['Utility districts (MUD etc.)', (site.districts || []).join(', ') || 'None'], ['Opportunity Zone', p.qoz || (site.oz ? 'Yes' : 'No')]]),
      card('Flood & access', [['FEMA flood zone', fl ? fl.zone + (fl.subtype ? ' · ' + fl.subtype.toLowerCase() : '') : '—'], ['Base flood elevation', fl?.bfe ? fl.bfe + ' ft' : 'Not set'], ['Busiest nearby road', site.traffic?.[0] ? site.traffic[0].road + ' · ' + n0(site.traffic[0].aadt) + ' vehicles/day' : '—']]),
      card('Geography', [['Centroid', g ? g.centreLL[1].toFixed(6) + ', ' + g.centreLL[0].toFixed(6) : '—'], ['Census tract', p.tract], ['Block group', p.bg], ['Census block', p.block], ['Area from outline', g ? n2(g.area / SF_ACRE) + ' ac' : '—'], ['Smallest box round it', g ? n0(g.box.w) + ' × ' + n0(g.box.d) + ' ft' : '—']]),
      card('Legal & plat', [['Legal description', p.legal], ['Legal acreage', p.acres ? (+p.acres).toFixed(4) : null]]),
      card('Record', [['Parcel ID (unformatted)', p.idRaw || p.id], ['Regrid UUID', p.uuid], ['County revised the outline', p.revised], ['Record refreshed', p.refreshed], ['Source', source]]),
    ];
    const map = g ? siteMap({ ...G, list: [g] }, { W: 720, H: 175, pad: 24 }) : '';
    pages.push(pageOf({ kicker: 'Parcel ' + (k + 1) + ' of ' + n, title: p.id, sub: [p.situs, p.city, p.state, p.zip].filter(Boolean).join(', '), rightSub: area, right: n2(acresOf(p)) + ' ac · ' + usd(p.total) },
      map + '<div style="height:9px"></div>' + (flags.length ? '<div class="card" style="border-color:' + C.amber + ';margin-bottom:9px"><span class="k" style="color:' + C.amber + '">Check</span>' + flags.map(t => '<p class="para">' + esc(t) + '</p>').join('') + '</div>' : '') +
      '<div class="row"><div class="col">' + left.join('') + '</div><div class="col">' + right.join('') + '</div></div>', foot));
  });
  return doc('Parcel map · ' + title, pages);
}
