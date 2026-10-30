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
  const list = parcels.map(p => { const ring = openRing(p.geom || []).map(q => F.toFt(q)), courses = ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; return { from: i + 1, to: (i + 1) % ring.length + 1, a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), brg: bearing(a, b) }; });
    const area = ringAreaFt(ring), c = ring.length ? [ring.reduce((s, q) => s + q[0], 0) / ring.length, ring.reduce((s, q) => s + q[1], 0) / ring.length] : [0, 0];
    return { p, ring, courses, area, perimeter: perimeterFt(ring), box: boxOf(ring), centre: c, centreLL: F.toLL(c) }; });
  return { origin, F, list, area: list.reduce((s, g) => s + g.area, 0) };
}

// the site map: every parcel to scale, lines dimensioned, corners numbered, parcels badged; W x H px
export function siteMap(G, { W = 720, H = 560, corners = true, dims = true, pad = 56 } = {}) {
  const pts = G.list.flatMap(g => g.ring); if (!pts.length) return '';
  const V = fit(pts, W, H, pad), step = niceStep(80 / V.s), o = ['<svg class="map" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">'];
  o.push(gridSvg(V, step, G.F.toLL));
  const many = G.list.length > 1;
  G.list.forEach((g, k) => o.push('<path d="' + pathOf(V, g.ring) + '" fill="' + (many && k % 2 ? 'rgba(47,107,255,.16)' : C.accentFill) + '" stroke="' + C.accent + '" stroke-width="1.6" stroke-linejoin="round"/>'));
  if (dims) for (const g of G.list) for (const c of g.courses) { if (c.len * V.s < 18) continue; const [x1, y1] = V.P(c.a), [x2, y2] = V.P(c.b), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1),
    // the label sits just outside the line (away from the parcel's centre)
    nx = -(y2 - y1) / L, ny = (x2 - x1) / L, [cx, cy] = V.P(g.centre), side = ((mx - cx) * nx + (my - cy) * ny) >= 0 ? 1 : -1;
    o.push(chip(mx + nx * side * 11, my + ny * side * 11, n1(c.len) + "'")); }
  if (corners) for (const g of G.list) g.ring.forEach((q, i) => { const [x, y] = V.P(q); o.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.2" fill="#fff" stroke="' + C.accent + '" stroke-width="1.2"/>');
    if (!many) { const [cx, cy] = V.P(g.centre), dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; o.push('<text x="' + (x + dx / d * 10).toFixed(1) + '" y="' + (y + dy / d * 10 + 2.5).toFixed(1) + '" font-family="IBM Plex Mono" font-size="7" fill="' + C.sub + '" text-anchor="middle">' + (i + 1) + '</text>'); } });
  G.list.forEach((g, k) => { const [x, y] = V.P(g.centre); o.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="8" fill="' + C.ink + '"/><text x="' + x.toFixed(1) + '" y="' + (y + 2.6).toFixed(1) + '" font-family="IBM Plex Mono" font-size="8" font-weight="600" fill="#fff" text-anchor="middle">' + (k + 1) + '</text>'); });
  o.push('<g>' + chip(80, 16, 'CENTROID ' + G.origin[1].toFixed(5) + ', ' + G.origin[0].toFixed(5), { size: 6.5, color: C.sub }) + '</g>');
  o.push(northArrow(W - 26, 12), scaleBar(V), '<text x="' + (W - 18) + '" y="' + (H - 40) + '" font-family="IBM Plex Mono" font-size="6.3" fill="' + C.mute + '" text-anchor="end">GRID ' + n0(step) + ' FT</text>', '</svg>');
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
  const land = sum('land'), improv = sum('improv'), total = sum('total'), n = parcels.length, head = { kicker: 'Parcel map', title, rightSub: [area, project].filter(Boolean).join(' · '), right: n + ' parcel' + (n === 1 ? '' : 's') + ' · ' + n2(A) + ' ac total' };
  const foot = 'Drawn from ' + esc(source) + ' outlines · values are appraisal district figures · conceptual map, not a survey' + (date ? ' · ' + esc(date) : '');
  const pages = [];
  // 1. the map and the parcels
  const rows = parcels.map((p, k) => ['<span class="num">' + (k + 1) + '</span>', '<b class="mono">' + esc(p.id) + '</b><div class="note" style="margin-top:1px">' + esc(p.legal || '') + '</div>', esc(p.owner || '—'), esc(p.situs || '—'), esc(p.landUse || '—'),
    n2(acresOf(p)), n0(sfOf(p)), usd(p.land), +p.improv ? usd(p.improv) : '—', '<b>' + usd(p.total) + '</b>']);
  pages.push(pageOf({ ...head, sub: 'Scaled from parcel geometry' }, siteMap(G, { W: 720, H: 590 }) +
    '<div style="margin:9px 0 6px" class="mono"><b>SITE:</b> ' + n + ' PARCEL' + (n === 1 ? '' : 'S') + ' · ' + n2(A) + ' AC · ' + n0(SF) + ' SF · LAND ' + usd(land) + ' · IMPROVED ' + usd(improv) + ' · ASSESSED ' + usd(total) + '</div>' +
    '<div class="k" style="margin:8px 0 2px">Parcel detail</div>' + table([['#'], ['Parcel ID'], ['Owner'], ['Situs'], ['Land use'], ['Acres', 'n'], ['Lot SF', 'n'], ['Land value', 'n'], ['Improv.', 'n'], ['Assessed', 'n']], rows,
      { foot: ['', 'Site total', '', '', '', n2(A), n0(SF), usd(land), usd(improv), usd(total)] }) + glance(parcels, site, G), foot));
  // 2. the boundary: courses, corners, area check and shape
  const bnd = G.list.map((g, k) => { const sumL = g.courses.reduce((s, c) => s + c.len, 0);
    const courses = table([['Course'], ['Bearing'], ['Distance', 'n']], g.courses.map(c => [c.from + ' → ' + c.to, '<span class="mono">' + c.brg + '</span>', n2(c.len) + "'"]), { foot: ['Perimeter', '', n2(sumL) + "'"] });
    const corners = table([['Corner'], ['Latitude', 'n'], ['Longitude', 'n']], g.ring.map((q, i) => { const [lon, lat] = G.F.toLL(q); return [String(i + 1), '<span class="mono">' + lat.toFixed(6) + '</span>', '<span class="mono">' + lon.toFixed(6) + '</span>']; }));
    const p = g.p, gisAc = g.area / SF_ACRE, roll = acresOf(p);
    const check = card('Area check', [['Computed from outline', n0(g.area) + ' sf · ' + n2(gisAc) + ' ac'], ['Tax roll (assessor)', roll ? n2(roll) + ' ac' : '—'], ['Mapped (Regrid GIS acres)', p.gisAcres ? n2(p.gisAcres) + ' ac' : '—'],
      ['Difference, outline vs roll', roll ? signed((gisAc / roll - 1) * 100) : '—'], ['Perimeter', n0(g.perimeter) + ' ft'], ['Corners', String(g.ring.length)]]);
    const shape = card('Shape', [['Smallest box round it', n0(g.box.w) + ' × ' + n0(g.box.d) + ' ft'], ['Box turned', n1(((g.box.angle % 180) + 180) % 180) + '° from east'], ['Fills its box', n0(g.area / (g.box.w * g.box.d || 1) * 100) + '%'],
      ['Depth to width', n1(g.box.d / (g.box.w || 1)) + ' : 1'], ['Longest line', n1(Math.max(...g.courses.map(c => c.len))) + ' ft'], ['Shortest line', n1(Math.min(...g.courses.map(c => c.len))) + ' ft']]);
    return '<div style="margin-bottom:12px"><h2><span class="num">' + (k + 1) + '</span>&nbsp; ' + esc(p.id) + ' <span class="sub" style="font-weight:500">· ' + esc(p.situs || '') + '</span></h2>' +
      '<div class="row"><div class="col">' + courses + '<div style="height:6px"></div>' + corners + '</div><div class="col" style="flex:.8">' + check + shape + '</div></div></div>'; }).join('');
  pages.push(pageOf({ ...head, kicker: 'Parcel map · boundary', sub: 'Courses run clockwise from corner 1 as numbered on the map' },
    '<div class="row" style="margin-bottom:10px"><div style="flex:1">' + siteMap(G, { W: 300, H: 230, dims: false }) + '</div><div style="flex:1.25"><p class="para">Bearings are from grid north in the site\'s own frame, distances in US survey feet, both measured on the mapped parcel outline. ' +
      'They are for planning and for checking a survey against, not a substitute for one: county parcel lines are drawn from plats and deeds and are often a few feet off.</p><div style="height:8px"></div>' +
      tiles([[n2(G.area / SF_ACRE), 'Acres (outline)'], [n0(G.area), 'Square feet'], [n0(G.list.reduce((s, g) => s + g.perimeter, 0)), 'Perimeter ft'], [String(G.list.reduce((s, g) => s + g.ring.length, 0)), 'Corners']]) + '</div></div>' + bnd, foot));
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
      card('Jurisdiction & services', [['City limits', site.city || 'Unincorporated'], ['Within ½ mile of', (site.near || []).join(', ') || '—'], ['School district', (site.schools || []).join(', ') || '—'], ['Water / sewer CCN', [site.water || 'none mapped', site.sewer || 'none mapped'].join(' / ')],
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
