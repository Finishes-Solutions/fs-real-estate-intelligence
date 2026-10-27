// A plan's quality check before it goes to anyone (the MCP site_plan tool, lib/mcp/siteplan.mjs): what a land planner
// would look for on a concept plan, measured on the plan itself, each finding a fail (the plan isn't fit to hand over),
// a warning (hand it over, saying it) or a pass. It reads the plan as drawn (elements in feet), never the request text
// alone. The engine's own checks (lib/siteplan.mjs check) count too, as fails and warnings.
//   access: a main entry on a street; every drive reached from it; fire lanes at least 20 ft (IFC 503.2.1); dead ends
//     over 150 ft without a turnaround (IFC 503.2.5); a second way in past 30 homes (IFC D107) or 200 apartments (D106)
//   parking: what the plan's ratios need; stormwater: the detention the site needs
//   homes: each on its own lot inside the site, facing a drive; 10 ft between homes (NFPA 501A for manufactured
//     homes, NFPA 1194 for park models: the usual park rule); a parking pad each; tiny and manufactured homes never
//     with a garage; a realistic size and density; a floor plan with a bedroom, bath and kitchen that fits the home
//   the ask: the homes, pad size, home size or floor area asked, against what was drawn
import * as S from './siteplan.mjs';
import * as PD from './plandesign.mjs';

export const AUDIT = { lane: 20, deadEnd: 150, apart: 10, homesOneWay: 30, aptsOneWay: 200, front: { community: 30, homes: 60 } };
const f0 = v => Math.round(+v || 0).toLocaleString('en-US');
const bx = s => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of s) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; };
const near = (A, B, g) => A[0] <= B[2] + g && B[0] <= A[2] + g && A[1] <= B[3] + g && B[1] <= A[3] + g;
const inset = (q, d) => S.grow(S.signedArea(q) >= 0 ? q : q.slice().reverse(), -d);
const over = (a, b) => S.rectsOverlap({ poly: inset(a, 0.6) }, { poly: inset(b, 0.6) }, 0);

// -> { verdict: 'ready' | 'ready with notes' | 'not ready', fails, warns, passes, items: [{ level, area, text }] }
export function auditPlan(plan, ask = {}) {
  const items = [], add = (level, area, text) => items.push({ level, area, text });
  const els = plan.elements || [], P = S.normalizeProgram(plan.program), m = S.metrics(plan), ring = plan.ring;
  if (!els.some(e => e.kind === 'building')) { add('fail', 'plan', 'Nothing is laid out.'); return finish(items); }
  // ---- the engine's own checks ----
  let chk = []; try { chk = S.check(plan); } catch (e) { chk = []; }
  for (const c of chk.filter(c => c.level === 'bad').slice(0, 8)) add('fail', 'checks', c.text);
  for (const c of chk.filter(c => c.level === 'warn').slice(0, 6)) add('warn', 'checks', c.text);
  // ---- access ----
  const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck'), shape = e => S.shapeOf(e), rules = S.edgeRules(ring, plan.front, plan.setbacks, plan.streets);
  const streetEdges = ring.map((a, i) => rules[i]?.role === 'front' || rules[i]?.street ? [a, ring[(i + 1) % ring.length]] : null).filter(Boolean);
  const ways = D.filter(d => d.entry || d.name === 'Main entry' || /^Entrance\b/.test(d.name || '')), onStreet = d => shape(d).some(p => streetEdges.some(([a, b]) => S.segDist(p, a, b) < 3));
  const inWays = ways.filter(onStreet);
  if (!ways.length) add('fail', 'access', 'No main entry is drawn.');
  else if (!inWays.length) add('fail', 'access', 'The main entry doesn’t reach a street (it meets the property line away from the road).');
  else add('pass', 'access', inWays.length === 1 ? 'One way in, from the street.' : inWays.length + ' ways in from the street.');
  // every drive reached from a way in (drives that touch or overlap)
  const G = D.map(d => { const q = shape(d); return { d, q, b: bx(q), g: S.grow(S.signedArea(q) >= 0 ? q : q.slice().reverse(), 2) }; }), seen = new Set(inWays), st = [...inWays];
  while (st.length) { const d = st.pop(), a = G.find(g => g.d === d); for (const g of G) if (!seen.has(g.d) && near(a.b, g.b, 3) && S.rectsOverlap({ poly: a.g }, { poly: g.q }, 0)) { seen.add(g.d); st.push(g.d); } }
  const cut = D.filter(d => !seen.has(d) && d.note !== 'Drive-thru lane');
  if (cut.length) add('fail', 'access', cut.length + ' drive' + (cut.length > 1 ? 's are' : ' is') + ' cut off from the entry.'); else if (inWays.length) add('pass', 'access', 'Every drive is reached from the entry.');
  // fire lanes: the lanes and drives (not driveways, drive-thrus or parking pads), at least 20 ft
  const lanes = D.filter(d => d.note !== 'Drive-thru lane' && !d.turn && !/driveway/i.test(d.note || '') && !(d.entry && /ft driveway/.test(d.note || ''))), widthOf = d => d.path ? +d.width || 26 : d.poly ? Math.min(...((b => [b[2] - b[0], b[3] - b[1]])(bx(rotTo(shape(d)))))) : Math.min(d.w, d.d);
  const lenOf = d => d.path ? Infinity : d.poly ? Math.max(...((b => [b[2] - b[0], b[3] - b[1]])(bx(rotTo(shape(d)))))) : Math.max(d.w, d.d), narrow = lanes.filter(d => lenOf(d) >= 30 && widthOf(d) < AUDIT.lane - 0.5); // (a short stub joining two drives is as wide as they are)
  if (narrow.length) add('fail', 'fire', narrow.length + ' drive' + (narrow.length > 1 ? 's are' : ' is') + ' under ' + AUDIT.lane + ' ft wide (' + [...new Set(narrow.map(d => Math.round(widthOf(d)) + ' ft'))].join(', ') + '): too narrow for a fire lane.');
  else add('pass', 'fire', 'Drives and lanes are at least ' + AUDIT.lane + ' ft wide.');
  // dead ends: a lane that meets only one other drive and runs on past it more than 150 ft, with no turnaround at its end
  const dead = [];
  for (const g of G.filter(g => lanes.includes(g.d) && !g.d.entry)) {
    const touch = G.filter(h => h !== g && near(g.b, h.b, 3) && S.rectsOverlap({ poly: g.g }, { poly: h.q }, 0)); if (touch.length !== 1) continue;
    const L = Math.max(g.b[2] - g.b[0], g.b[3] - g.b[1]); if (L <= AUDIT.deadEnd) continue;
    const turn = G.some(h => h.d.turn && near(g.b, h.b, 3)); if (!turn) dead.push(Math.round(L));
  }
  if (dead.length) add('warn', 'fire', dead.length + ' dead-end lane' + (dead.length > 1 ? 's' : '') + ' over ' + AUDIT.deadEnd + ' ft with no turnaround (' + dead.map(v => v + ' ft').join(', ') + '): the fire code asks for a turnaround.');
  // ---- homes ----
  const H = els.filter(e => e.kind === 'building' && ['sfr', 'townhomes', 'duplex'].includes(e.use)), lots = els.filter(e => e.kind === 'lot');
  const small = H.filter(e => PD.smallHome(e)), community = !!P.homeKind || small.length > 0, nHomes = H.reduce((t, e) => t + (e.units ?? 1), 0);
  if (H.length) {
    // a home, or each unit of a row of townhomes (their centres along the row's length), on exactly one lot
    const unitPts = h => { if (!(h.units > 1) || h.use === 'duplex' || S.isFree(h)) return [[h.x, h.y]]; const c = S.corners(h), along = h.w >= h.d, a = along ? [(c[0][0] + c[3][0]) / 2, (c[0][1] + c[3][1]) / 2] : [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2], b = along ? [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2] : [(c[3][0] + c[2][0]) / 2, (c[3][1] + c[2][1]) / 2];
      return Array.from({ length: h.units }, (_, j) => [a[0] + (b[0] - a[0]) * (j + 0.5) / h.units, a[1] + (b[1] - a[1]) * (j + 0.5) / h.units]); };
    const lotsAt = q => lots.filter(l => S.inRing(q, shape(l))), lotOf = h => lotsAt([h.x, h.y]), rowed = H.some(h => h.use === 'townhomes' && h.units > 1) && lots.length > H.length;
    const noLot = H.filter(h => rowed && h.use === 'townhomes' && h.units > 1 ? unitPts(h).some(q => lotsAt(q).length !== 1) : lotsAt([h.x, h.y]).length !== 1); if (noLot.length) add('fail', 'homes', noLot.length + ' home' + (noLot.length > 1 ? 's are' : ' is') + ' not on a lot of its own.'); else if (lots.length) add('pass', 'homes', 'Every home is on a lot of its own.');
    const outLots = lots.filter(l => !shape(l).every(p => S.inRing(p, ring) || ring.some((a, i) => S.segDist(p, a, ring[(i + 1) % ring.length]) < 1))); if (outLots.length) add('fail', 'homes', outLots.length + ' lot' + (outLots.length > 1 ? 's run' : ' runs') + ' outside the property.');
    const lov = []; for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) { const a = lots[i], b = lots[j]; if (Math.abs(a.x - b.x) < a.w + b.w + a.d + b.d && over(shape(a), shape(b))) lov.push(1); }
    if (lov.length) add('fail', 'homes', lov.length + ' pair' + (lov.length > 1 ? 's' : '') + ' of lots overlap.');
    const reach = community ? AUDIT.front.community : AUDIT.front.homes, far = H.filter(h => !G.some(g => S.gapBetween(shape(h), g.q) <= reach));
    if (far.length) add('fail', 'homes', far.length + ' home' + (far.length > 1 ? 's are' : ' is') + ' more than ' + reach + ' ft from a drive.'); else add('pass', 'homes', 'Every home faces a drive (within ' + reach + ' ft).');
    // the space between homes (side to side, end to end): 10 ft at least in a community; in a subdivision the side yards
    let tight = 0, minGap = Infinity; const HQ = H.map(h => ({ h, q: shape(h), b: bx(shape(h)) }));
    for (let i = 0; i < HQ.length; i++) for (let j = i + 1; j < HQ.length; j++) { if (!near(HQ[i].b, HQ[j].b, 60)) continue; const g = S.gapBetween(HQ[i].q, HQ[j].q); minGap = Math.min(minGap, g); if (g < AUDIT.apart - 0.25) tight++; }
    if (tight) add(community ? 'fail' : 'warn', 'homes', tight + ' pair' + (tight > 1 ? 's' : '') + ' of homes closer than ' + AUDIT.apart + ' ft (the closest ' + minGap.toFixed(1) + ' ft): ' + (community ? 'manufactured home and park-model rules (NFPA 501A, 1194) ask for 10 ft.' : 'check the side yards.'));
    else if (Number.isFinite(minGap)) add('pass', 'homes', 'At least ' + Math.round(minGap) + ' ft between homes.');
    // parking: a pad or driveway on each home's lot; tiny and manufactured homes without a garage
    const pads = els.filter(e => e.kind === 'plaza' && /parking pad|driveway/i.test(e.note || '')), noPad = H.filter(h => { const l = lotOf(h)[0]; return l && !pads.some(p => S.inRing([p.x, p.y], shape(l))); });
    if (noPad.length) add('warn', 'parking', noPad.length + ' home' + (noPad.length > 1 ? 's have' : ' has') + ' no parking pad or driveway on its lot.'); else add('pass', 'parking', 'A parking pad or driveway on every lot.');
    if (small.length) {
      let garaged = 0; try { garaged = PD.buildingTypes(plan).filter(t => t.small && t.garage > 0).length; } catch (e) { garaged = 0; }
      if (garaged || m.garages > 0 && small.length === H.length) add('fail', 'homes', 'Tiny or manufactured homes are drawn with a garage: they park on their pad.'); else add('pass', 'homes', 'No garages on the tiny or manufactured homes: each parks on its pad.');
    }
    // sizes and density
    const sizeOf = h => +h.sf || S.gfaOf(h), kindOf = h => PD.smallHome(h), odd = H.filter(h => { const k = kindOf(h), sf = sizeOf(h); return k === 'tiny' ? sf < 150 || sf > 900 : k === 'manufactured' ? sf < 500 || sf > 2400 : h.use === 'sfr' ? sf < 800 || sf > 7000 : false; });
    if (odd.length) add('warn', 'homes', odd.length + ' home' + (odd.length > 1 ? 's are' : ' is') + ' an unusual size for ' + (kindOf(odd[0]) ? 'a ' + kindOf(odd[0]) + ' home' : 'a house') + ' (' + f0(sizeOf(odd[0])) + ' sf).');
    const ac = S.ringArea(ring) / 43560, du = nHomes / Math.max(0.01, ac), kind = P.homeKind || (small.length ? kindOf(small[0]) : null), cap = kind === 'tiny' ? 20 : kind === 'manufactured' ? 12 : kind === 'mixed' ? 16 : 8;
    if (H.every(h => h.use === 'sfr')) { if (du > cap) add('warn', 'homes', 'About ' + du.toFixed(1) + ' homes an acre: dense for ' + (kind ? 'a ' + kind + ' home community' : 'single-family homes') + ' (usually ' + (kind === 'tiny' ? '10–18' : kind === 'manufactured' ? '6–10' : kind === 'mixed' ? '8–14' : '3–7') + ').'); else add('pass', 'homes', 'About ' + du.toFixed(1) + ' homes an acre.'); }
    // a lot holds its home and its parking
    const crowded = H.filter(h => { const l = lotOf(h)[0]; return l && S.footArea(h) > S.elArea(l) * 0.65; }); if (crowded.length) add('warn', 'homes', crowded.length + ' lot' + (crowded.length > 1 ? 's are' : ' is') + ' more than 65% covered by the home.');
    // ways in for the homes
    if (nHomes > AUDIT.homesOneWay && inWays.length < 2) add('warn', 'fire', nHomes + ' homes with one way in: past ' + AUDIT.homesOneWay + ' homes the fire code (IFC D107) asks for a second access (an emergency-only gate can do), for the fire marshal to approve.');
  }
  const apts = m.units && P.use === 'multifamily' ? m.units : 0; if (apts > AUDIT.aptsOneWay && inWays.length < 2) add('warn', 'fire', apts + ' apartments with one way in: past ' + AUDIT.aptsOneWay + ' units the fire code (IFC D106) asks for a second access.');
  // ---- floor plans: each kind of home or building, its rule-based plan checked ----
  try { for (const t of PD.buildingTypes(plan).filter(t => t.supported && t.small).slice(0, 4)) { // (the homes' own plans: a tiny or manufactured home's; houses and apartments get theirs drawn in the app) const d = PD.fallbackDesign(t), pl = PD.placeDesign(d, t), types = new Set(d.rooms.map(r => r.type));
    const need = ['living', 'bath'].filter(k => !types.has(k) && !(k === 'living' && types.has('kitchen'))), beds = d.rooms.filter(r => /bedroom/.test(r.type)), smallBed = beds.filter(r => r.w * r.d < 70 || Math.min(r.w, r.d) < 7);
    if (t.small && types.has('garage')) add('fail', 'floor plans', t.label + ' (' + Math.round(t.unitGsf) + ' sf) is drawn with a garage.');
    if (need.length) add('warn', 'floor plans', t.label + ' (' + t.W + ' × ' + t.D + ' ft): its floor plan has no ' + need.join(' or ') + '.');
    if (smallBed.length) add('warn', 'floor plans', t.label + ': a bedroom under 70 sf or 7 ft across.');
    if (pl.problems?.length) add('warn', 'floor plans', t.label + ': ' + pl.problems[0]);
    if (!need.length && !smallBed.length && !pl.problems?.length) add('pass', 'floor plans', t.label + ' ' + t.W + ' × ' + t.D + ' ft (' + f0(t.unitGsf) + ' sf): ' + d.summary.replace(/^Rule-based /, '').replace(/\.$/, '') + '.'); } } catch (e) { /* a floor plan that can't be drawn says nothing here */ }
  // ---- parking and stormwater ----
  if (m.required > 0) { if (m.spaces < m.required) add('fail', 'parking', 'Parking ' + f0(m.spaces) + ' of the ' + f0(m.required) + ' spaces needed.'); else add('pass', 'parking', f0(m.spaces) + ' parking spaces for ' + f0(m.required) + ' needed.'); }
  const ac0 = S.ringArea(ring) / 43560, sn = S.stormNeed(ac0, plan.params || {}, P, ac0), pond = els.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0);
  if (sn.area > 0) { if (pond < sn.area * 0.9) add('warn', 'stormwater', 'Detention ' + (pond / 43560).toFixed(2) + ' ac of about ' + (sn.area / 43560).toFixed(2) + ' ac the site needs; the rest underground or a bigger pond.'); else add('pass', 'stormwater', 'Detention ' + (pond / 43560).toFixed(2) + ' ac for about ' + (sn.area / 43560).toFixed(2) + ' ac needed (an estimate; the civil engineer sizes it).'); }
  // ---- what was asked ----
  if (ask.homeKind) { const k = S.HOME_KINDS[ask.homeKind]?.label.toLowerCase() || 'home community'; if (!H.length) add('fail', 'request', 'The request is for a ' + k + '; the plan has no homes (it is laid out as ' + (S.USES[P.use]?.label || P.use).toLowerCase() + ').'); else if (!small.length && !P.homeKind) add('fail', 'request', 'The request is for a ' + k + '; the plan has ordinary houses.'); else add('pass', 'request', 'Laid out as a ' + (S.HOME_KINDS[P.homeKind]?.label.toLowerCase() || k) + ', as asked.'); }
  const units = +ask.units || +P.units || 0; if (units && nHomes) { if (nHomes < units * 0.95) add('warn', 'request', 'Room for ' + nHomes + ' of the ' + units + ' homes asked for.'); else add('pass', 'request', nHomes + ' homes (' + units + ' asked).'); }
  if (P.homeKind && P.lotW && small.length) { const w = lots.map(l => Math.min(l.w, l.d)), off = w.filter(v => Math.abs(v - P.lotW) > 1).length; if (off) add('warn', 'request', off + ' lot' + (off > 1 ? 's are' : ' is') + ' not the ' + P.lotW + ' ft pad width asked.'); else add('pass', 'request', 'Every pad ' + P.lotW + ' ft wide, as asked.'); }
  const sf = +P.homeSfMax || +P.homeSfMin || 0; if (P.homeKind && sf && small.length) { const offS = small.filter(h => Math.abs((+h.sf || 0) - sf) > sf * 0.06).length; if (offS) add('warn', 'request', offS + ' home' + (offS > 1 ? 's are' : ' is') + ' not about the ' + f0(sf) + ' sf asked.'); else add('pass', 'request', 'Homes of about ' + f0(sf) + ' sf, as asked.'); }
  const gfa = +ask.gfa || (P.asked?.gfa ?? 0); if (gfa && m.gfa && !H.length) { if (m.gfa < gfa * 0.9) add('warn', 'request', f0(m.gfa) + ' sf of the ' + f0(gfa) + ' sf asked.'); else add('pass', 'request', f0(m.gfa) + ' sf (' + f0(gfa) + ' asked).'); }
  return finish(items);
}
const RES = u => ['sfr', 'townhomes', 'duplex'].includes(u);
// a free shape's width: its outline turned square to its longest side
function rotTo(q) { let L = 0, a = 0; q.forEach((p, i) => { const r = q[(i + 1) % q.length], l = Math.hypot(r[0] - p[0], r[1] - p[1]); if (l > L) { L = l; a = Math.atan2(r[1] - p[1], r[0] - p[0]); } }); const c = Math.cos(-a), s = Math.sin(-a); return q.map(([x, y]) => [x * c - y * s, x * s + y * c]); }
function finish(items) {
  const fails = items.filter(i => i.level === 'fail').length, warns = items.filter(i => i.level === 'warn').length, passes = items.filter(i => i.level === 'pass').length;
  return { verdict: fails ? 'not ready' : warns ? 'ready with notes' : 'ready', fails, warns, passes, items };
}
// the audit in a few lines, fails first
export function auditLines(a, n = 14) {
  const mark = { fail: '✗', warn: '!', pass: '✓' }, order = { fail: 0, warn: 1, pass: 2 };
  return a.items.slice().sort((x, y) => order[x.level] - order[y.level]).slice(0, n).map(i => mark[i.level] + ' ' + i.area + ': ' + i.text);
}
