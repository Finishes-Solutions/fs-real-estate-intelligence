// Site quantities that more than one sheet shows, worked out once so the set can't contradict itself (Oct 20 review:
// footprint + heavy paving + parking + sidewalks added to 13.63 ac against a reported 12.56 ac impervious; parking labels
// added to 643 against a schedule of 698; detention used 5 ft of depth where the section showed 4 ft of live storage).
//   areaSchedule(plan)        the site split into disjoint areas that add up exactly to the site (G-001, C-101, C-102, C-202)
//   parkingSchedule(plan)     every parking field's count as labelled on C-101 and C-102, and the totals they add up to
//   accessibleParking(plan)   TAS 208.2 accessible stalls per parking facility: required against drawn
//   pondStorage(plan, o)      the pond's stage-storage from its top of bank (C-201 labels and section, C-202 table)
// (where the pond sits on the ground, in words, is lib/terrain.mjs pondSide: the cover notes and C-201 share it)
// No DOM, no network. Plan feet; the plan as stored (not turned for a sheet): areas and counts don't change with the turn.
import polyclip from './vendor/polyclip.mjs';
import * as S from './siteplan.mjs';
import * as G from './guardrails.mjs';

const sigOf = plan => JSON.stringify(plan.ring || []) + (plan.elements || []).map(e => [e.kind, e.id, e.x, e.y, e.w, e.d, e.rot, e.width, e.path?.length, e.poly?.length, e.note, e.units, e.island, e.guard].join()).join(';');
// a value per plan, worked out again when the plan's pieces change (a plan is edited in place in the app)
function memo(fn) { const M = new WeakMap(); return (plan, ...a) => { const k = sigOf(plan) + JSON.stringify(a), c = M.get(plan); if (c && c.k === k) return c.v; const v = fn(plan, ...a); M.set(plan, { k, v }); return v; }; }

// ---------- polygon areas (exact unions and differences: lib/vendor/polyclip.mjs) ----------
const ccw = r => S.signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]);
const geom = r => [[close(ccw(r))]];
const mpArea = mp => (mp || []).reduce((s, poly) => s + poly.reduce((t, ring, i) => t + (i ? -1 : 1) * S.ringArea(ring.slice(0, -1)), 0), 0);
// the union of rings, one at a time so a degenerate piece the clipper can't take is left out rather than failing all
function unionOf(rings) {
  let mp = [];
  for (const r of rings) { if (!(r?.length >= 3) || S.ringArea(r) < 0.5) continue; try { mp = mp.length ? polyclip.union(mp, geom(r)) : geom(r); } catch (e) { /* skipped */ } }
  return mp;
}
const minus = (a, ...bs) => { let out = a; for (const b of bs) if (out.length && b.length) try { out = polyclip.difference(out, b); } catch (e) { /* kept */ } return out; };
const within = (a, site) => { if (!a.length) return a; try { return polyclip.intersection(a, site); } catch (e) { return a; } };

// ---------- the area schedule ----------
// Disjoint areas, in this order, each with what's above it taken out: buildings (and parking garages); heavy-duty paving
// (drives, fire lanes, truck courts, a fuel forecourt) not under a building; parking paving (stalls and aisles) not under
// those; sidewalks, plazas, patios and driveways not under paving or a building; courts and pools; the detention pond;
// easements and a flood reserve left unbuilt; landscape / open space is the rest. Impervious is the sum of the hard
// surfaces (the pond is its own cover). sf are whole feet so the rows add up to the site exactly, and the acres are
// rounded so they add up too (largest remainder).
export const areaSchedule = memo(plan0 => {
  const plan = G.effective(plan0) || plan0, ring = plan.ring || [], els = plan.elements || [], site = ring.length >= 3 ? geom(ring) : [];
  const siteSf = Math.round(S.ringArea(ring)), out = (k, kinds, pick = () => true) => els.filter(e => kinds.includes(e.kind) && !e.island && pick(e)).map(e => S.outline(e));
  const D = ring.length >= 3 ? S.details(plan) : { walks: [], patios: [] };
  const Bu = unionOf(out('b', ['building', 'garage'])), Hu = unionOf(out('h', ['drive', 'truck', 'canopy', 'tanks', 'foodtruck'])), Pu = unionOf(out('p', ['parking']));
  const drives = els.some(e => e.kind === 'plaza' && e.note === 'Driveway');
  const Wu = unionOf(D.walks.map(w => w.poly || S.corners(w)).concat(D.patios.map(q => q.poly), els.filter(e => e.kind === 'plaza' || e.kind === 'patio').map(e => S.shapeOf(e))));
  const Cu = unionOf(out('c', ['court', 'pool'])), Ou = unionOf(out('o', ['pond'])), Ku = unionOf(out('k', ['keepout'], e => e.guard !== 'flood')), Fu = unionOf(out('f', ['keepout'], e => e.guard === 'flood'));
  const built = within(Bu, site), heavy = minus(within(Hu, site), Bu), park = minus(within(Pu, site), Bu, Hu), walks = minus(within(Wu, site), Bu, Hu, Pu), hard = minus(within(Cu, site), Bu, Hu, Pu, Wu);
  const pond = minus(within(Ou, site), Bu, Hu, Pu, Wu, Cu), ease = minus(within(Ku, site), Bu, Hu, Pu, Wu, Cu, Ou), flood = minus(within(Fu, site), Bu, Hu, Pu, Wu, Cu, Ou, Ku);
  const garage = els.some(e => e.kind === 'garage'), truck = els.some(e => e.kind === 'truck'), fuel = els.some(e => e.kind === 'canopy');
  const rows = [
    { key: 'building', label: 'Building footprint' + (garage ? ' (incl. parking garage)' : ''), sf: mpArea(built), imp: true },
    { key: 'heavy', label: 'Heavy-duty paving: drives, fire lanes' + (truck ? ', truck courts' : '') + (fuel ? ', fuel forecourt' : ''), sf: mpArea(heavy), imp: true },
    { key: 'parking', label: 'Parking paving: stalls and aisles', sf: mpArea(park), imp: true },
    { key: 'walks', label: 'Sidewalks, plazas' + (D.patios.length ? ', patios' : '') + (drives ? ', driveways' : ''), sf: mpArea(walks), imp: true },
    { key: 'hard', label: 'Courts and pools', sf: mpArea(hard), imp: true },
    { key: 'pond', label: 'Detention pond (to top of bank)', sf: mpArea(pond), imp: false },
    { key: 'easement', label: 'Easement / no-build, unbuilt (drawn)', sf: mpArea(ease), imp: false },
    { key: 'flood', label: 'Flood reserve (conservative case)', sf: mpArea(flood), imp: false }
  ].map(r => ({ ...r, sf: Math.round(r.sf) })).filter(r => r.sf > 0 || ['building', 'heavy', 'parking', 'walks'].includes(r.key));
  const used = rows.reduce((s, r) => s + r.sf, 0);
  if (used > siteSf) { const r = rows.filter(q => q.sf > 0).pop(); if (r) r.sf -= used - siteSf; } // (the clipper's rounding, never more than a foot or two)
  rows.push({ key: 'open', label: 'Landscape / open space', sf: Math.max(0, siteSf - rows.reduce((s, r) => s + r.sf, 0)), imp: false });
  // acres to 0.01 that add up to the site's acres: each row floored, the leftover hundredths to the largest remainders
  const cents = Math.round(siteSf / 43560 * 100), raw = rows.map(r => r.sf / 43560 * 100), fl = raw.map(Math.floor); let left = cents - fl.reduce((s, v) => s + v, 0);
  raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
  rows.forEach((r, i) => { r.ac = (fl[i] / 100).toFixed(2); r.pct = siteSf ? r.sf / siteSf * 100 : 0; });
  const by = Object.fromEntries(rows.map(r => [r.key, r.sf])), imp = rows.filter(r => r.imp), impSf = imp.reduce((s, r) => s + r.sf, 0);
  return { siteSf, siteAc: (cents / 100).toFixed(2), rows, by, impervious: impSf, imperviousAc: (imp.reduce((s, r) => s + Math.round(+r.ac * 100), 0) / 100).toFixed(2), imperviousPct: siteSf ? impSf / siteSf * 100 : 0,
    get: k => by[k] || 0 };
});

// ---------- parking ----------
// Every parking field's count as the plan sheets label it: its stalls less the stall spaces its accessible aisles take
// (S.accessible stripes an aisle where a stall would be). Spaces that aren't drawn as stalls (home garages, driveway
// aprons, a parking garage's decks) are lines of their own, so the labels plus those lines are the total.
// RV / boat and air / vacuum spaces (self storage, a gas station) are not parking for the people using the buildings.
const counted = e => e.kind === 'parking' && !e.rv && !e.vac;
export const parkingSchedule = memo(plan => {
  const els = plan.elements || [], m = G.metrics(plan), A = (plan.ring || []).length >= 3 ? S.accessible(plan) : { stalls: [], aisles: [] };
  const inField = (e, poly) => S.hitRect(e, S.centroid(poly));
  const fields = els.map((e, i) => ({ e, i })).filter(({ e }) => counted(e)).map(({ e, i }) => { const raw = S.stalls(e).count, aisles = A.aisles.filter(a => inField(e, a.poly)).length, ada = A.stalls.filter(s => inField(e, s.poly));
    return { e, i, id: e.id, raw, aisles, count: Math.max(0, raw - aisles), ada: ada.length, van: ada.filter(s => s.van).length }; });
  const surface = fields.reduce((s, f) => s + f.count, 0), other = [];
  if (m.garages) other.push({ key: 'garages', label: 'Home garages (not drawn as stalls)', n: m.garages });
  if (m.driveways) other.push({ key: 'driveways', label: 'Driveway aprons (not drawn as stalls)', n: m.driveways });
  if (m.deck) other.push({ key: 'deck', label: 'Parking garage spaces (decks, labelled on the garage)', n: m.deck });
  const total = surface + other.reduce((s, o) => s + o.n, 0);
  return { fields, surface, other, total, required: m.required, ada: A.stalls.length, van: A.stalls.filter(s => s.van).length, labelled: fields.filter(f => f.count > 0).length };
});
// the label a field carries on the plan sheets (the same words on C-101 and C-102)
export const fieldLabel = n => n + ' SPACES';

// ---------- accessible parking (TAS 2012 / 2010 ADA 208.2) ----------
// Parking is counted per facility: a lot that serves the shops, one that serves the apartments, one at the clubhouse.
// Each field goes to the facility of the building nearest it. Shops, offices, the clubhouse (leasing, visitors) and every
// other non-residential use: Table 208.2. Apartments' and townhomes' resident parking: 2% of the spaces of each type, at
// least one (208.2.3.2; plus one for each unit with mobility features, 208.2.3.1); townhome surface stalls are their
// guests' (208.2.3.3: Table 208.2). Van spaces one in every six accessible spaces (208.2.4). Private garages and
// driveways that serve one home are not a parking facility.
const RES_LOTS = ['multifamily'], GUEST_LOTS = ['townhomes', 'duplex', 'sfr'];
export const tableRequired = n => S.adaCount(n);
export const accessibleParking = memo(plan => {
  const P = parkingSchedule(plan), prog = S.normalizeProgram(plan.program), B = (plan.elements || []).filter(e => e.kind === 'building').map(e => ({ e, o: S.outline(e), use: S.USES[e.use] ? e.use : prog.use }));
  const near = c => B.reduce((m, b) => { const d = b.o.reduce((t, p, k) => Math.min(t, S.segDist(c, p, b.o[(k + 1) % b.o.length])), Infinity); return !m || d < m.d ? { b, d } : m; }, null);
  const groups = new Map();
  for (const f of P.fields) { if (!f.raw) continue; const c = S.centroid(S.outline(f.e)), nb = near(c), use = nb?.b.use || prog.use;
    const kind = RES_LOTS.includes(use) ? 'resident' : GUEST_LOTS.includes(use) ? 'guest' : 'table', key = use;
    const g = groups.get(key) || groups.set(key, { use, kind, fields: 0, spaces: 0, ada: 0, van: 0 }).get(key); g.fields++; g.spaces += f.count; g.ada += f.ada; g.van += f.van; } // (a field's count includes its accessible stalls)
  const NAME = { multifamily: 'Apartments — resident parking', amenity: 'Clubhouse / leasing — visitors', townhomes: 'Townhomes — guest parking', duplex: 'Duplexes — guest parking', sfr: 'Homes — guest parking' };
  const rows = [...groups.values()].map(g => {
    const req = g.kind === 'resident' ? Math.max(1, Math.ceil(g.spaces * 0.02)) : tableRequired(g.spaces), vanReq = Math.ceil(req / 6);
    return { ...g, name: NAME[g.use] || (S.USES[g.use]?.label || 'Other') + ' — customers and staff', rule: g.kind === 'resident' ? 'TAS 208.2.3.2: 2%, at least 1' : 'TAS Table 208.2' + (g.kind === 'guest' ? ' (208.2.3.3)' : ''), required: req, vanReq, ok: g.ada >= req && g.van >= vanReq, short: Math.max(0, req - g.ada), vanShort: Math.max(0, vanReq - g.van) };
  }).sort((a, b) => b.spaces - a.spaces);
  const required = rows.reduce((s, r) => s + r.required, 0), vanReq = rows.reduce((s, r) => s + r.vanReq, 0), short = rows.filter(r => !r.ok);
  const text = !rows.length ? 'No common parking: private garages and driveways serving one home are not a parking facility under TAS 208.2.'
    : short.length ? 'The ' + P.ada + ' accessible stalls drawn (' + P.van + ' van) do not meet TAS 208.2 counted by facility: ' + short.map(r => r.name + ' needs ' + r.required + ' (' + r.vanReq + ' van), has ' + r.ada + ' (' + r.van + ' van)').join('; ') + '. Add them, near each facility\'s accessible entrances, in the final layout.'
    : 'The ' + P.ada + ' accessible stalls drawn (' + P.van + ' van) meet TAS 208.2 counted by facility.';
  return { rows, required, vanReq, ada: P.ada, van: P.van, ok: !short.length, text };
});

// ---------- detention: stage-storage ----------
// The pond's outline is its top of bank. Side slopes 4:1 run inward and down to the bottom (dry) or the normal water
// level (wet: a permanent pool below it that holds no storage); 1 ft of freeboard from the 100-year high water level (HWL)
// to the top of bank; live storage NWL (or bottom) to HWL. `depth` (the plan's storm depth, 5 ft by default) is top of
// bank to NWL / bottom. Volume by average end area between 0.5 ft stages. o.top: the top of bank elevation (datum).
export const SLOPE = 4, FREEBOARD = 1, STAGE = 0.5, POOL = 6; // POOL: a wet pond's permanent pool depth below NWL (ft, assumed)
const isWet = e => /wet|lake|amenity|pond\b/i.test((e.note || '') + ' ' + (e.name || '')) && !/dry/i.test(e.note || '');
// the area of the pond's plan at `d` feet in from the top of bank (each side moved d in): a rectangle exactly, an
// outline drawn by hand by moving its sides and stopping where it closes up
function areaIn(e, d) {
  if (!S.isFree(e) && e.shape !== 'circle' && e.shape !== 'round') return Math.max(0, e.w - 2 * d) * Math.max(0, e.d - 2 * d);
  const o = S.outline(e), A0 = S.ringArea(o); if (!d) return A0; const r = S.offsetRing(o, -d), a = S.ringArea(r);
  return Math.sign(S.signedArea(r)) !== Math.sign(S.signedArea(o)) || a > A0 ? 0 : Math.max(0, Math.min(A0, a));
}
export function pondStorage(plan, o = {}) {
  const st = S.stormOf(plan), depth = Math.max(2, +o.depth || +plan.params?.storm?.depth || S.STORM.depth), top = o.top ?? 100, live = depth - FREEBOARD;
  const ponds = (plan.elements || []).filter(e => e.kind === 'pond').sort((a, b) => S.elArea(b) - S.elArea(a)), wet = ponds.length ? isWet(ponds[0]) : false;
  const hwl = top - FREEBOARD, nwl = top - depth, z = h => Math.round(h * 100) / 100, stages = [];
  for (let s = 0; s <= live + 1e-9; s += STAGE) { const el = nwl + s, d = (top - el) * SLOPE, area = ponds.reduce((t, e) => t + areaIn(e, d), 0); stages.push({ z: z(el), above: s, area }); }
  let cum = 0; stages.forEach((q, i) => { if (i) cum += (q.area + stages[i - 1].area) / 2 * (q.above - stages[i - 1].above); q.cf = cum; q.acft = cum / 43560; });
  const prism = (a, b) => { let v = 0; for (let s = a; s < b - 1e-9; s += STAGE) { const h = Math.min(STAGE, b - s); v += (ponds.reduce((t, e) => t + areaIn(e, s * SLOPE), 0) + ponds.reduce((t, e) => t + areaIn(e, (s + h) * SLOPE), 0)) / 2 * h; } return v; };
  const provided = ponds.length ? cum / 43560 : 0, vault = st.vault || 0, required = st.volume || 0, total = provided + vault;
  return { ponds, wet, top: z(top), hwl: z(hwl), nwl: z(nwl), bottom: z(wet ? nwl - POOL : nwl), depth, live, freeboard: FREEBOARD, slope: SLOPE, stage: STAGE, stages,
    topArea: ponds.reduce((t, e) => t + areaIn(e, 0), 0), floorArea: ponds.reduce((t, e) => t + areaIn(e, depth * SLOPE), 0),
    dig: ponds.length ? prism(0, depth + (wet ? POOL : 0)) : 0, // cf below the top of bank: the excavation (a wet pond's pool too)
    provided, vault, total, required, shortfall: Math.max(0, required - total), ok: total >= required - 0.005, mode: st.mode, acres: st.acres, rate: st.acres > 0 && st.volume > 0 ? st.volume / st.acres : +plan.params?.storm?.rate || S.STORM.rate };
}

