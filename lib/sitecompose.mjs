// Detailed and mixed-use site plans, the way a conceptual site plan is drawn: the site cut into zones from the street
// back (shops in front, a commons or amenity lake in the middle, apartments, townhomes and duplexes behind), 26 ft
// drives between the zones, an entry drive up the middle, and each zone laid out for its use with named, sized
// buildings. Built on lib/siteplan.mjs (geometry, parking, checks, the single-use layout).
// program.zones: [{ use, gfa, units, floors, buildings, pads, items, name }] from the street back; without zones the
// program is one zone. Planning sketch only: no grading, utilities, fire or code review.
import * as S from './siteplan.mjs';

const RAD = Math.PI / 180, rot = S.rotPt;
const COMMERCIAL = S.COMMERCIAL;
export const AMENITIES = ['lake', 'pavilion', 'courts', 'playground', 'lawn', 'dog park', 'restrooms', 'pool', 'clubhouse', 'center'];
const ZONE_NAME = { retail: 'Retail', restaurant: 'Restaurants', office: 'Office', medical: 'Medical', hotel: 'Hotel', church: 'Church', industrial: 'Industrial', storage: 'Self storage', multifamily: 'Apartments', townhomes: 'Townhomes', duplex: 'Duplexes', amenity: 'Commons', other: 'Commercial' };
const zoneLabel = (z, i, n) => (n > 1 ? (i === 0 ? 'Front' : i === n - 1 ? 'Back' : 'Middle') + ' — ' : '') + (z.name || ZONE_NAME[z.use] || 'Site');

export function zonesOf(program) {
  const p = program || {}, list = Array.isArray(p.zones) && p.zones.length ? p.zones : [p];
  return list.slice(0, 5).map(z => ({ ...z, use: S.USES[z.use] ? z.use : 'other' }));
}

// clip a polygon (open ring) to the half-plane k·p >= v (k = [1,0] or [0,1], sign s = 1 keeps above, -1 below)
function clip(r, axis, v, s) {
  const out = [], inside = p => s * (p[axis] - v) >= 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (v - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out.length >= 3 ? out : [];
}
const band = (r, y0, y1) => clip(clip(r, 1, y0, 1), 1, y1, -1);
// the widest stretch across x that stays inside the polygon (and `m` feet from its edges) for every y in [y0, y1]
function spanAt(r, y0, y1, m = 0) {
  let lo = -Infinity, hi = Infinity;
  for (let k = 0; k <= 6; k++) {
    const y = y0 + (y1 - y0) * k / 6, xs = [];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [x1, yy1] = r[j], [x2, yy2] = r[i]; if ((yy1 > y) !== (yy2 > y)) xs.push(x1 + (y - yy1) * (x2 - x1) / (yy2 - yy1)); }
    xs.sort((a, b) => a - b); let best = null;
    for (let h = 0; h + 1 < xs.length; h += 2) if (!best || xs[h + 1] - xs[h] > best[1] - best[0]) best = [xs[h], xs[h + 1]];
    if (!best) return null; lo = Math.max(lo, best[0] + m); hi = Math.min(hi, best[1] - m);
  }
  return hi - lo > 20 ? [lo, hi] : null;
}

// the best spot in a polygon (plan feet) for a w x d rectangle turned `deg`, clear of `avoid` by `gap` and `m` feet
// inside the polygon's edges; lowest score(centre) wins. Returns the rectangle or null.
export function placeRect(ring, w, d, deg, avoid = [], score = () => 0, m = 5, gap = 10) {
  const r = ring.map(p => rot(p, -deg)), xs = r.map(p => p[0]), ys = r.map(p => p[1]), step = Math.max(4, Math.min(w, d) / 5, Math.sqrt(S.ringArea(ring)) / 70);
  let best = null;
  for (let y = Math.min(...ys) + d / 2 + m; y <= Math.max(...ys) - d / 2 - m; y += step) for (let x = Math.min(...xs) + w / 2 + m; x <= Math.max(...xs) - w / 2 - m; x += step) {
    const c = rot([x, y], deg), e = { x: c[0], y: c[1], w, d, rot: deg }, cs = S.corners(e);
    if (!cs.every(p => S.inRing(p, ring)) || cs.some((p, i) => ring.some((a, k) => S.segSeg(p, cs[(i + 1) % 4], a, ring[(k + 1) % ring.length]) < m))) continue;
    if (avoid.some(o => S.rectsOverlap({ ...o, w: o.w + 2 * gap, d: o.d + 2 * gap }, e, 0))) continue;
    const s = score(c); if (!best || s < best.s) best = { s, e };
  }
  return best?.e || null;
}

// land each zone needs, sq ft (buildings plus their parking, lanes and yards at typical suburban densities)
function landFor(z, site) {
  const U = S.USES[z.use], fl = z.floors || U.floors, per = z.use === 'multifamily' ? 20 : z.use === 'townhomes' ? 11 : z.use === 'duplex' ? 7 : 0;
  if (per) return z.units ? z.units / per * 43560 : null;
  if (z.use === 'amenity') return z.acres ? z.acres * 43560 : 0.18 * site;
  return z.gfa ? z.gfa / fl / (z.use === 'industrial' ? 0.4 : 0.2) : null;
}

export function composeSite(plan, program, variant = 0) {
  const zones = zonesOf(program), base = S.normalizeProgram(program);
  const named = (els, z) => { const B = els.filter(e => e.kind === 'building'); B.forEach((e, i) => { e.use = z.use; e.name ||= buildingName(z.use, i, B.length, e); }); return els; };
  if (zones.length === 1 && !['townhomes', 'duplex', 'amenity'].includes(zones[0].use)) { // one use: the single-use layout, named
    const z = zones[0], pads = z.use === 'retail' ? (z.pads ?? ((z.gfa || 0) >= 25000 ? 2 : 0)) : 0;
    let ps = { els: [], sites: [] };
    if (pads) { const front = plan.front != null && plan.front < plan.ring.length ? plan.front : S.longestEdge(plan.ring), n0 = S.outwardOf(plan.ring, front), a0 = S.mainAngle(plan.ring); let ph = a0, dn = -2; for (let q = 0; q < 4; q++) { const sv = rot(n0, -(a0 + q * 90)); if (-sv[1] > dn) { dn = -sv[1]; ph = a0 + q * 90; } } ps = padSites(plan.ring, ph, pads, { ...S.SETBACKS, ...(plan.setbacks || {}) }); }
    const r = S.autoLayout({ ...plan, blocked: ps.sites }, { ...base, ...z, gfa: z.gfa ? Math.max(2000, z.gfa - ps.sites.length * PAD_SF) : z.gfa }, variant);
    named(r.elements, z); r.elements.push(...ps.els.map((e, q) => ({ ...e, id: 'p' + q + Math.random().toString(36).slice(2, 6) })));
    if (z.use === 'multifamily') { const ph = r.elements.find(e => e.kind === 'building')?.rot ?? S.mainAngle(plan.ring); r.elements.push(...clubhouse(plan.ring, r.elements, ph).map((e, k) => ({ ...e, id: 'c' + k + Math.random().toString(36).slice(2, 6) }))); }
    return { ...r, zones: [{ name: zoneLabel(z, 0, 1), use: z.use, ring: plan.ring, acres: S.ringArea(plan.ring) / 43560 }] };
  }
  const ring = plan.ring, site = S.ringArea(ring), notes = [];
  const front = plan.front != null && plan.front < ring.length ? plan.front : S.longestEdge(ring), n0 = S.outwardOf(ring, front), a0 = S.mainAngle(ring);
  let phi = a0, down = -2; for (let k = 0; k < 4; k++) { const s = rot(n0, -(a0 + k * 90)); if (-s[1] > down) { down = -s[1]; phi = a0 + k * 90; } }
  const rr = ring.map(p => rot(p, -phi)), ys = rr.map(p => p[1]), Y0 = Math.min(...ys), Y1 = Math.max(...ys), SB = { ...S.SETBACKS, ...(plan.setbacks || {}) };
  const toPlan = p => rot(p, phi), toPlanRing = r => r.map(toPlan), rect = (kind, x0, y0, x1, y1, extra = {}) => { const c = toPlan([(x0 + x1) / 2, (y0 + y1) / 2]); return { kind, x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(x1 - x0).toFixed(2), d: +(y1 - y0).toFixed(2), rot: +(((phi % 360) + 360) % 360).toFixed(3), ...extra }; };

  // how much land each zone gets: what its program needs, scaled to the site; zones without a size share what's left
  const usable = site * 0.9, need = zones.map(z => landFor(z, site)), sized = need.reduce((s, v) => s + (v || 0), 0), open = need.filter(v => v == null).length;
  let shares;
  if (sized > usable || !open) { const k = usable / (sized || 1); shares = need.map(v => (v || 0) * k); if (sized > usable * 1.05) notes.push('The program needs about ' + (sized / 43560).toFixed(1) + ' acres; it was scaled to fit ' + (site / 43560).toFixed(1) + '.'); zones.forEach((z, i) => { if (need[i] && sized > usable) { if (z.units) z.units = Math.max(1, Math.round(z.units * k)); if (z.gfa) z.gfa = Math.round(z.gfa * k / 500) * 500; } }); }
  else shares = need.map(v => v ?? (usable - sized) / open);
  const tot = shares.reduce((s, v) => s + v, 0);
  // bands from the street back. A zone too shallow on its own for its use (townhome rows need ~140 ft, a parking field
  // and its building ~260 ft) shares a band with its neighbour, side by side.
  const avgW = site / (Y1 - Y0), MIN = { retail: 260, restaurant: 200, office: 260, medical: 260, hotel: 230, church: 260, other: 240, industrial: 380, storage: 300, multifamily: 230, townhomes: 150, duplex: 170, amenity: 170 };
  let groups = zones.map((z, i) => ({ zs: [i], share: shares[i] / tot * site }));
  for (let guard = 0; guard < 8 && groups.length > 1; guard++) {
    const g = groups.findIndex(g => g.share / avgW < Math.max(...g.zs.map(i => MIN[zones[i].use]))); if (g < 0) break;
    const h = g === groups.length - 1 ? g - 1 : groups[g + 1] && zones[groups[g + 1].zs[0]].use !== 'amenity' || g === 0 ? g + 1 : g - 1, [a, b] = [Math.min(g, h), Math.max(g, h)];
    groups.splice(a, 2, { zs: [...groups[a].zs, ...groups[b].zs], share: groups[a].share + groups[b].share });
  }
  const areaBelow = y => S.ringArea(clip(rr, 1, y, -1)) || 0, cuts = [];
  let acc = 0; for (const g of groups.slice(0, -1)) { acc += g.share; let lo = Y0, hi = Y1; for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (areaBelow(mid) < acc) lo = mid; else hi = mid; } cuts.push((lo + hi) / 2); }

  const els = [], zoneOut = [];
  // drives between the bands, and the entry drive from the street up the middle to the last one
  const fs = spanAt(rr, Y0 + 1, Y0 + 40, 0) || spanAt(rr, Y0 + 20, Y0 + 60, 0), cx = fs ? fs[0] + (fs[1] - fs[0]) * (variant === 2 ? 0.3 : 0.5) : 0;
  for (const y of cuts) { const sp = spanAt(rr, y - 13, y + 13, SB.paving); if (sp) els.push(rect('drive', sp[0], y - 13, sp[1], y + 13, { name: 'Internal drive', note: '26 ft fire lane' })); }
  const yEnd = cuts.length ? cuts[cuts.length - 1] + 13 : Y0;
  if (cuts.length) {
    const strip = band(clip(clip(rr, 0, cx - 18, 1), 0, cx + 18, -1), Y0 - 1, Y0 + 400), low = strip.length ? Math.min(...strip.map(p => p[1])) : Y0; // where the entry meets the street
    els.push(rect('drive', cx - 18, low - 1, cx + 18, yEnd, { name: 'Main entry', note: '36 ft boulevard' }));
    if (yEnd - low > 160) els.push(rect('green', cx - 4, low + 40, cx + 4, Math.min(yEnd - 40, low + 260), { name: '' }));
  }
  const ylim = [Y0 - 1, ...cuts, Y1 + 1];
  let lake = null;
  const pondNeed = (base.detentionPct ?? 10) / 100 * site * 0.75;
  groups.forEach((g, gi) => {
    const y0 = ylim[gi] + (gi ? 13 : 0), y1 = ylim[gi + 1] - (gi < groups.length - 1 ? 13 : 0), whole = band(rr, y0, y1), full = band(rr, ylim[gi], ylim[gi + 1]); if (!whole.length) return;
    // zones sharing a band: split it across, by area
    const xs = whole.map(p => p[0]), xcuts = []; let a2 = 0; const gs = g.zs.reduce((s, i) => s + shares[i], 0);
    for (const i of g.zs.slice(0, -1)) { a2 += shares[i] / gs * S.ringArea(whole); let lo = Math.min(...xs), hi = Math.max(...xs); for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (S.ringArea(clip(whole, 0, mid, -1)) < a2) lo = mid; else hi = mid; } xcuts.push((lo + hi) / 2); }
    const xl = [-Infinity, ...xcuts, Infinity];
    g.zs.forEach((i, j) => {
      const z = zones[i], cut = r => clip(clip(r, 0, xl[j] + (j ? 10 : 0), 1), 0, xl[j + 1] - (j < g.zs.length - 1 ? 10 : 0), -1), zr = xl.length > 2 ? cut(whole) : whole; if (!zr.length) return;
      const zf = xl.length > 2 ? clip(clip(full, 0, xl[j], 1), 0, xl[j + 1], -1) : full;
      zoneOut.push({ name: zoneLabel(z, gi, groups.length), use: z.use, ring: toPlanRing(zf), acres: S.ringArea(zf) / 43560 });
      const crossed = gi < groups.length - 1 && cuts.length, blockX = crossed ? [cx - 28, cx + 28] : null;
      const sub = (r, share, z = zones[i]) => { const s = { origin: plan.origin, ring: S.tidyRing(toPlanRing(r), 0.5), setbacks: { front: gi ? 15 : SB.front, side: 10, rear: gi < groups.length - 1 ? 15 : SB.rear, paving: SB.paving } }; s.front = frontEdge(s.ring, phi);
        return { s, zp: { ...S.normalizeProgram({ ...z, use: z.use }), gfa: z.gfa ? z.gfa * share : null, units: z.units ? Math.max(1, Math.round(z.units * share)) : null, detentionPct: 0, max: !z.gfa && !z.units } }; }; // the zone's own defaults (floors, parking ratio), not the first zone's
      let out = [];
      if (z.use === 'townhomes' || z.use === 'duplex') out = homeRows(zr, z, z.use, blockX);
      else if (z.use === 'amenity') { const r = commons(S.tidyRing(toPlanRing(zr), 0.5), z, pondNeed, els); out = r.els; lake = lake || r.lake; }
      else { // the single-use layout on each side of the entry drive (pad sites at the street corners first)
        let ps = { els: [], sites: [] };
        if (z.use === 'retail' && z.pads > 0 && gi === 0) { ps = padSites(S.tidyRing(toPlanRing(zr), 0.5), phi, z.pads, SB); ps.sites = ps.sites.filter(s => !els.some(e => e.name === 'Main entry' && S.rectsOverlap(e, s, 0))); ps.els = ps.els.filter(e => ps.sites.some(s => S.rectsOverlap(s, e, 0))); out.push(...ps.els); }
        const zg = z.gfa ? Math.max(2000, z.gfa - ps.sites.length * PAD_SF) : z.gfa, zz = { ...z, gfa: zg };
        const pieces = crossed ? [clip(zr, 0, cx - 18, -1), clip(zr, 0, cx + 18, 1)].filter(p => p.length && S.ringArea(p) > 4000) : [zr], all = pieces.reduce((s, p) => s + S.ringArea(p), 0);
        for (const pc of pieces) { const { s, zp } = sub(pc, S.ringArea(pc) / all, zz); if (s.ring.length < 3) continue; s.blocked = ps.sites; const r = S.autoLayout(s, zp, variant === 1 ? 1 : 0); out.push(...r.elements); if (r.notes.length) notes.push(...r.notes.map(t => ZONE_NAME[z.use] + ': ' + t)); }
      }
      named(out, z); els.push(...out);
      if (z.use === 'multifamily' && (!zones.some(q => q.use === 'amenity') || (z.units || 0) >= 80)) els.push(...clubhouse(S.tidyRing(toPlanRing(zr), 0.5), els, phi));
    });
  });
  // detention: an amenity lake in the commons, or else a pond along the back of the site
  if (!lake && pondNeed > 0) {
    const h = Math.sqrt(pondNeed / 4), p = placeRect(ring, pondNeed / h, h, phi, els, q => -rot(q, -phi)[1], SB.paving, 15) || placeRect(ring, Math.sqrt(pondNeed), Math.sqrt(pondNeed), phi, els, q => -rot(q, -phi)[1], SB.paving, 10);
    if (p) els.push({ ...p, kind: 'pond', shape: 'round', name: 'Detention' }); else notes.push('No room left for detention; plan on underground storage or a bigger pond.');
  }
  let k = 0; for (const e of els) e.id = 'e' + (++k).toString(36) + Math.random().toString(36).slice(2, 6);
  entries(els, plan, front);
  renumber(els);
  return { elements: els, notes, phi, zones: zoneOut, program: { ...base, zones } };

  // ---- helpers (turned frame: street down, x across) ----
  function frontEdge(r, deg) { let best = 0, by = Infinity; r.forEach((a, i) => { const b = r[(i + 1) % r.length], m = rot([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], -deg), d = rot([b[0] - a[0], b[1] - a[1]], -deg); if (Math.abs(d[0]) > Math.abs(d[1]) && Math.hypot(...d) > 20 && m[1] < by) { by = m[1]; best = i; } }); return best; }
  // rows of townhomes (rear-load: two rows back to back on a 24 ft private lane) or duplexes (facing a lane)
  function homeRows(pc, zp, kind, blockX) {
    const out = [], ysP = pc.map(p => p[1]); let left = zp.units ?? Infinity, y = Math.min(...ysP) + 15;
    const unitW = kind === 'townhomes' ? 24 : 64, D = 40, mod = kind === 'townhomes' ? D + 24 + D : D + 25 + 24 + 25 + D, units = kind === 'townhomes' ? 1 : 2;
    while (left > 0 && y + mod <= Math.max(...ysP) - 10) {
      const sp = spanAt(pc, y, y + mod, 10); if (!sp) { y += 20; continue; }
      const runs = blockX && blockX[0] < sp[1] && blockX[1] > sp[0] ? [[sp[0], blockX[0]], [blockX[1], sp[1]]].filter(r => r[1] - r[0] > 4 * unitW) : [sp];
      const laneY = kind === 'townhomes' ? y + D : y + D + 25;
      for (const [xa, xb] of runs) {
        out.push(rect('drive', xa, laneY, xb, laneY + 24, { name: kind === 'townhomes' ? 'Private lane' : 'Lane', note: '24 ft' }));
        for (const ry of [y, y + mod - D]) {
          let x = xa;
          if (kind === 'townhomes') while (left > 0 && x + 4 * unitW <= xb) { const n = Math.min(6, left, Math.floor((xb - x) / unitW)); out.push(rect('building', x, ry, x + n * unitW, ry + D, { floors: 3, units: n, use: 'townhomes', note: n + ' units · ' + unitW + '×' + D + ' · rear-load' })); left -= n; x += n * unitW + 20; }
          else while (left > 0 && x + unitW <= xb) { out.push(rect('building', x, ry, x + unitW, ry + D, { floors: 2, units: Math.min(units, left), use: 'duplex', note: 'Front-load · private yards' })); left -= units; x += 84; }
        }
      }
      y += mod + 30;
    }
    if (left > 0 && left !== Infinity) notes.push(ZONE_NAME[kind] + ': ' + left + ' units didn’t fit.');
    return out;
  }
  // the commons: an amenity lake (the site's detention), pavilion, courts, playground, lawn, dog park, restrooms
  function commons(r, z, lakeArea, avoid) {
    const want = new Set(z.items?.length ? z.items.map(s => String(s).toLowerCase()) : ['lake', 'pavilion', 'courts', 'playground', 'lawn', 'dog park', 'restrooms']), out = [], all = () => avoid.concat(out);
    const c = S.centroid(r), along = q => rot(q, -phi)[0];
    let lake = null;
    if (want.has('lake') && lakeArea > 0) {
      for (const k of [1, 0.8, 0.6, 0.45]) { for (const ar of [2.2, 3.2, 4.5]) { const a = lakeArea * k, h = Math.sqrt(a / ar); lake = placeRect(r, a / h, h, phi, all(), q => -along(q), 25, 25); if (lake) break; } if (lake) { if (k < 1) notes.push('The amenity lake holds about ' + Math.round(k * 100) + '% of the detention estimate; plan on more storage.'); break; } }
      if (lake) out.push({ ...lake, kind: 'pond', shape: 'round', name: 'Amenity lake', note: 'Wet detention' });
    }
    const put = (key, kind, w, d, extra, sc = q => Math.hypot(q[0] - c[0], q[1] - c[1])) => { if (!want.has(key)) return; const e = placeRect(r, w, d, phi, all(), sc, 10, 15); if (e) out.push({ ...e, kind, ...extra }); };
    put('pavilion', 'building', 80, 60, { use: 'amenity', name: 'Pavilion', note: 'Open-air · covered stage' });
    put('courts', 'court', 128, 120, { name: 'Pickleball', note: '4 courts' }, q => along(q));
    put('playground', 'play', 76, 56, { name: 'Playground' });
    put('restrooms', 'building', 40, 30, { use: 'amenity', name: 'Restrooms' });
    put('dog park', 'green', 120, 100, { name: 'Dog park', note: 'Small | large' }, q => along(q));
    put('lawn', 'green', 180, 110, { name: 'Event lawn' });
    return { els: out, lake };
  }
}

// apartments get a clubhouse (leasing, fitness) and a pool beside it
function clubhouse(r, avoid, phi) {
  const c = S.centroid(r), cl = placeRect(r, 80, 60, phi, avoid, q => Math.hypot(q[0] - c[0], q[1] - c[1]) * 0.3 + rot(q, -phi)[1] * 0.2, 10, 20); if (!cl) return [];
  const out = [{ ...cl, kind: 'building', use: 'amenity', floors: 1, name: 'Clubhouse', note: 'Leasing · fitness' }];
  const pool = placeRect(r, 75, 40, phi, avoid.concat(out), q => Math.hypot(q[0] - cl.x, q[1] - cl.y), 10, 12); if (pool) out.push({ ...pool, kind: 'pool', name: 'Pool' });
  return out;
}

// one numbering across the site, front to back: Building A, B… (shops, offices and the rest share the letters), Pad A…,
// Apt Bldg 1…, Townhome Row 1…, Duplex 1…, a lone warehouse the Warehouse
function renumber(els) {
  const count = {}, B = els.filter(e => e.kind === 'building' && e.use !== 'amenity'), oneWh = B.filter(e => e.use === 'industrial').length === 1;
  for (const e of B) {
    const pad = /drive-thru/.test(e.note || ''), key = pad ? 'pad' : ['multifamily', 'townhomes', 'duplex', 'sfr'].includes(e.use) ? e.use : e.use === 'industrial' && oneWh ? 'warehouse' : 'bldg', i = count[key] = (count[key] || 0) + 1;
    e.name = pad ? 'Pad ' + String.fromCharCode(64 + i) : key === 'bldg' ? 'Building ' + (i <= 26 ? String.fromCharCode(64 + i) : i) : buildingName(e.use, i - 1, oneWh ? 1 : 2, e);
  }
}
// the driveways the zones' own layouts made: one main entry for the site (the boulevard when there is one, else the first
// driveway off the street); the others off the street are Entrance 2…, and the ones onto a drive inside are plain drives
function entries(els, plan, front) {
  const rules = S.edgeRules(plan.ring, front, plan.setbacks, plan.streets), ring = plan.ring;
  const onStreet = e => S.shapeOf(e).some(p => ring.some((a, k) => (rules[k].role === 'front' || rules[k].street) && S.segDist(p, a, ring[(k + 1) % ring.length]) < 3));
  const own = els.filter(e => e.kind === 'drive' && e.name === 'Main entry' && e.note === '36 ft boulevard'), ways = els.filter(e => e.kind === 'drive' && !own.includes(e) && (e.name === 'Main entry' || /^Entrance\b/.test(e.name || '')));
  let n = own.length; for (const e of ways) { if (onStreet(e)) e.name = n++ ? 'Entrance ' + n : 'Main entry'; else { e.name = ''; e.note = '26 ft drive'; } }
}

function buildingName(use, i, n, e) {
  if (use === 'multifamily') return 'Apt Bldg ' + (i + 1);
  if (use === 'townhomes') return 'Townhome Row ' + (i + 1);
  if (use === 'duplex') return 'Duplex ' + (i + 1);
  if (use === 'amenity') return e.name || 'Amenity';
  if (use === 'industrial') return n > 1 ? 'Building ' + String.fromCharCode(65 + i) : 'Warehouse';
  return 'Building ' + String.fromCharCode(65 + i); // pads are named where they're made (padSites)
}

// pad sites at the street corners of a retail zone, reserved before the inline shops are laid out: each a ~3,000 sf
// restaurant or coffee building with its own parking (a drive-thru lane wraps it). ring in plan feet; phi turns it street-down.
export function padSites(ring, phi, n, sb = S.SETBACKS) {
  const rr = ring.map(p => rot(p, -phi)), y0 = Math.min(...rr.map(p => p[1])) + (sb.front ?? 25), W = 190, D = 130, out = [], sites = [];
  const sp = spanAt(rr, y0, y0 + D, (sb.paving ?? 10) + 5); if (!sp || sp[1] - sp[0] < W * 2 + 120) return { els: out, sites };
  const xs = [sp[1] - W, sp[0], sp[1] - 2 * W - 30, sp[0] + W + 30].slice(0, Math.min(4, n));
  const at = (x, y, w, d, extra) => { const c = rot([x + w / 2, y + d / 2], phi); return { x: +c[0].toFixed(2), y: +c[1].toFixed(2), w, d, rot: +(((phi % 360) + 360) % 360).toFixed(3), ...extra }; };
  xs.forEach((x, i) => {
    sites.push(at(x, y0, W, D, {}));
    out.push(at(x + 12, y0 + 40, 60, 50, { kind: 'building', use: 'restaurant', floors: 1, name: 'Pad ' + String.fromCharCode(65 + i), note: 'QSR / coffee · drive-thru' }));
    out.push(at(x + 90, y0 + 10, 90, 60, { kind: 'parking', islands: false }));
  });
  return { els: out, sites };
}
const PAD_SF = 3000;

// single-use sites get the same finishing touches: pads at the street for a big retail program
function addSiteExtras(plan, els, z) {
  if (!(z.use === 'retail' && (z.pads > 0 || (z.gfa || 0) >= 25000))) return;
  const pads = Math.min(4, z.pads ?? 2), front = plan.front ?? S.longestEdge(plan.ring), a = plan.ring[front], b = plan.ring[(front + 1) % plan.ring.length];
  const phi = els.find(e => e.kind === 'building')?.rot ?? S.mainAngle(plan.ring), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let i = 0; i < pads; i++) {
    const p = placeRect(plan.ring, 60, 50, phi, els, q => Math.hypot(q[0] - mid[0], q[1] - mid[1]) * 0.6 - els.filter(e => e.name?.startsWith('Pad')).reduce((s, e) => s + Math.hypot(q[0] - e.x, q[1] - e.y), 0) * 0.4, (plan.setbacks || S.SETBACKS).front ?? 25, 45);
    if (!p) break;
    els.push({ ...p, kind: 'building', use: 'restaurant', floors: 1, name: 'Pad ' + String.fromCharCode(65 + i), note: 'QSR / coffee · drive-thru' });
    const lot = placeRect(plan.ring, 72, 60, phi, els, q => Math.hypot(q[0] - p.x, q[1] - p.y), 10, 8);
    if (lot) els.push({ ...lot, kind: 'parking', islands: false });
  }
  els.forEach((e, k) => { if (!e.id) e.id = 'p' + k + Math.random().toString(36).slice(2, 6); });
}
