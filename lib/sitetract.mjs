// One use of a mixed program on a tract of its own along one end of the frontage, front to back, with its own way in,
// and the rest of the program laid out beside it (the way lib/sitefuel.mjs puts a gas station on its outparcel):
// - homes (lots, townhomes, duplexes) beside shops, offices, apartments or warehouses, always. In the bands of
//   lib/sitelayout.mjs every use is a strip across the whole site, so the homes behind the apartments reached the
//   street through the apartments' parking aisles. A neighborhood has its own entrance and its streets never join a
//   shopping center's or an apartment community's drives: residents and shoppers don't cut through. On its own tract
//   the neighborhood is laid out as a subdivision (lib/streetnet.mjs: a loop road, curved streets, cul-de-sacs) when
//   that holds its homes, with a 15 ft landscape buffer on the lot lines it shares; a commons asked for goes with it.
// - warehouses beside homes or apartments, always: the homes were behind the truck court (every resident drove past
//   the loading docks) or the trucks drove through the homes. The tract's lot lines inside the site keep a 25 ft
//   landscape buffer (its paving 25 ft back, its buildings 50) and its driveway is the truck entrance.
// - shops or offices beside apartments, when the bands lay out none of their own (a site too shallow for the shops'
//   band and the apartments' behind it: only the simple fallbacks were left, with drives cut off).
// The rest of the plan keeps off the tract (opts.keepout); a re-fit keeps the tract as it is and re-fits the rest.
import * as S from './siteplan.mjs';
import polyclip from './vendor/polyclip.mjs';
import { clipBox, fuelLotPlan } from './sitefuel.mjs';

const RES = ['sfr', 'townhomes', 'duplex', 'multifamily'], rot = S.rotPt;
const HOMES = ['sfr', 'townhomes', 'duplex'], DU = { sfr: 4.5, townhomes: 11, duplex: 7 }; // homes an acre, with their streets
const KINDS = {
  industrial: { minW: [330, 420, 500], inside: { role: 'side', build: 50, pave: 25, inside: true }, share: 0.3, need: z => z.gfa ? z.gfa / 0.4 * 1.15 : 0, zoneName: 'Business park', way: 'truck entrance', why: ', with their own truck entrance and a 25 ft landscape buffer (a screening wall is usual) on the lot lines they share: the homes are reached without passing the truck court.' },
  commercial: { minW: [250, 330, 420], inside: { role: 'side', build: 10, pave: 2, inside: true }, share: 0.25, need: z => z.gfa ? z.gfa / 0.2 * 1.15 : 0, zoneName: null, way: null, why: ', with their own way in, the apartments beside them: the site isn’t deep enough for them along the front and the apartments behind.' },
  homes: { homes: true, minW: [400, 520, 650], inside: { role: 'side', build: 15, pave: 10, inside: true }, share: 0.5, need: z => z.units ? z.units / (DU[z.use] || 4.5) * 43560 * 1.1 : 0, zoneName: null, way: null, why: ', with their own entrance from the street and streets of their own that never join the rest of the plan’s drives (a 15 ft landscape buffer on the lot lines they share): no one cuts through.' }
};
export const industrialZoneOf = prog => { const Z = prog?.zones || []; return Z.some(z => RES.includes(z.use)) ? Z.findIndex(z => z.use === 'industrial') : -1; };
export const commercialZoneOf = prog => { const Z = prog?.zones || []; return Z.length >= 2 && Z.some(z => z.use === 'multifamily') && !Z.some(z => HOMES.includes(z.use)) && !Z.some(z => z.place?.where) ? Z.findIndex(z => S.COMMERCIAL.includes(z.use)) : -1; };
// the homes' zone of a program that also has shops, offices, apartments or warehouses (one zone of homes: two kinds of
// homes side by side are one neighborhood, laid out in bands as before)
// (a request that places its uses, "retail at the corner, homes around the lake, apartments along the road": the planner
// follows the words, in pods or bands, and no tract is made)
export const homesZoneOf = prog => { const Z = prog?.zones || [], h = Z.map((z, i) => HOMES.includes(z.use) ? i : -1).filter(i => i >= 0); return h.length === 1 && !Z.some(z => z.place?.where) && Z.some(z => !HOMES.includes(z.use) && !['amenity', 'garage'].includes(z.use)) ? h[0] : -1; };

// the program without the tract's zone (one zone left: a plain program of that use)
function restOf(P, zi, kind) {
  const zs = P.zones.filter((z, i) => i !== zi && !(kind === 'homes' && z.use === 'amenity'));
  if (zs.length > 1) return { ...P, use: zs[0].use, zones: zs };
  const z = zs[0]; return { ...P, zones: null, use: z.use, gfa: z.gfa ?? null, units: z.units ?? null, floors: z.floors ?? null, buildings: z.buildings ?? null, pads: z.pads ?? null };
}
// where the tract can go: a strip square to the street at either end of the frontage, as deep as the site (or, sized for
// a floor area asked for that needs less, only as deep as that); wider strips too, since a narrow one fits a narrow
// building. None asked: a share of the site.
// about the land a zone takes with its streets and parking (the mixed bands' measure)
const LAND = z => z.use === 'garage' || z.use === 'amenity' ? 0 : S.COMMERCIAL.includes(z.use) ? (z.gfa || 30000) / 0.22 : z.use === 'multifamily' ? (z.units || 200) / 20 * 43560 : z.use === 'industrial' ? (z.gfa || 100000) / 0.4 : HOMES.includes(z.use) ? (z.units || 40) / (DU[z.use] || 4.5) * 43560 : 0;
function spots(plan, zone, K, T, keepout = [], P = null) {
  const F = T.frameOf(plan, false, 'front'), site = S.ringArea(plan.ring), H = F.Y1 - F.Y0, W = F.X1 - F.X0, ko = keepout.filter(k => !k.gap && (k.poly || []).length >= 3).map(k => k.poly);
  // (sized: the width it needs and wider, since a narrow strip fits a narrow building; unsized: its share of the site.
  // Homes: the land the other uses leave, at least (a count on a big tract fills the land past the count, as the bands do)
  const left = K.homes && P ? site * 0.88 - 1.15 * P.zones.filter(z => z !== zone).reduce((t, z) => t + LAND(z), 0) : 0;
  const sized = K.need(zone) > 0 && !(K.homes && left > K.need(zone)), need = Math.max(K.need(zone) || site * K.share, left), out = [], tries = sized ? [[K.minW[0], 1], [K.minW[0], 1.25], [K.minW[1], 1.25], [K.minW[2], 1.5]] : [[K.minW[0], 1], [K.minW[1], 1]];
  for (const side of [-1, 1]) for (const [w0, k] of tries) {
    const w = Math.max(w0, need * k / H); let d = H + 10; if (need * k / H < w0) d = Math.max(400, need * k / w0);
    if (out.some(o => o.side === side && Math.abs(o.w - w) < 1)) continue;
    if (w > W * 0.65) continue;
    const x0 = side < 0 ? F.X0 - 5 : F.X1 - w, x1 = side < 0 ? F.X0 + w : F.X1 + 5, r = clipBox(F.rr, x0, F.Y0 - 5, x1, F.Y0 + d); if (r.length < 3) continue;
    const ring = S.tidyRing(r.map(p => rot(p, F.psi)), 0.5); if (ring.length < 3) continue;
    if (ko.some(q => S.rectsOverlap({ poly: ring }, { poly: q }, 0))) continue; // (another tract, an easement: not there)
    out.push({ ring, side, area: S.ringArea(ring), w });
  }
  return out;
}
// the program laid out on the tract: the zone as a plain program, or, for homes with a commons asked for, the two zones
function tractProgram(P, zi, kind) {
  const zone = P.zones[zi], am = kind === 'homes' ? P.zones.find(z => z.use === 'amenity') : null;
  const one = { use: zone.use, ...(zone.gfa ? { gfa: zone.gfa } : zone.units ? { units: zone.units } : { max: true }), ...(zone.floors ? { floors: zone.floors } : {}), ...(zone.pads ? { pads: zone.pads } : {}), ...(zone.lotW ? { lotW: zone.lotW } : {}), ...(zone.lotD ? { lotD: zone.lotD } : {}), ...(zone.homeSfMin != null ? { homeSfMin: zone.homeSfMin, homeSfMax: zone.homeSfMax } : {}), ...(zone.homeMix ? { homeMix: zone.homeMix } : {}) };
  return am ? { use: 'mixed', zones: [{ ...zone, place: null }, { ...am, place: null }], storm: P.storm } : { ...one, storm: P.storm };
}
// the site less the tract: the rest of the plan's own parcel (the biggest piece left), its lot lines the site's where
// they lie on it and inside lines (the tract's buffer) elsewhere, so every engine simply sees a smaller lot
function remainder(plan, ring, inside) {
  const cl = r => r.concat([r[0]]), cc = r => S.signedArea(r) >= 0 ? r : r.slice().reverse(); let left;
  try { left = polyclip.difference([cl(cc(plan.ring))], [cl(cc(ring))]).map(pp => pp[0].slice(0, -1)).filter(r => r.length >= 3).sort((x, y) => S.ringArea(y) - S.ringArea(x)); } catch { return null; }
  if (!left?.length || S.ringArea(left[0]) < S.ringArea(plan.ring) * 0.3) return null;
  const r = S.tidyRing(left[0].map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), 0.5); if (r.length < 3) return null;
  const lp = fuelLotPlan(plan, r, inside); return lp.setbacks.edges.some(e => e.role === 'front' && !e.inside) ? lp : null; // (it must keep a street)
}
// kind: 'industrial' | 'commercial' | 'homes'; zi: the zone on the tract. [] when it doesn't lay out that way (the caller has its
// own layouts to fall back on)
export function tractOptions(plan, programIn, opts, T, kind, zi) {
  const P = S.normalizeProgram(programIn), zone = P.zones[zi], K = KINDS[kind], N = opts.count || 3, rest = restOf(P, zi, kind), done = (opts.tractsDone || []).concat(kind);
  let best = null;
  for (const sp of spots(plan, zone, K, T, opts.keepout || [], P)) {
    const lp = fuelLotPlan(plan, sp.ring, K.inside), prog = tractProgram(P, zi, kind);
    let os = []; try { os = T.layoutOptions(lp, prog, { count: 2, keepout: opts.keepout || [], noTract: true, gallery: false }).filter(o => o.elements?.length && o.score !== -1e9); } catch (e) { os = []; }
    if (!os.length) continue;
    const m = S.metrics({ ...lp, program: os[0].program, elements: os[0].elements }), gfa = m.gfa || 0, units = m.units || 0, asked = kind === 'homes' ? zone.units : zone.gfa, got = kind === 'homes' ? units : gfa, whole = !asked || got >= asked * 0.97;
    if (!best || whole && !best.whole || whole === best.whole && (whole && asked ? sp.area < best.sp.area : got > best.got)) best = { sp, lp, os, gfa, units, got, whole }; // (holds what's asked: the smallest tract that does; else the one that holds the most)
    if (whole && asked) break;
  }
  if (!best) return [];
  const rp = remainder(plan, best.sp.ring, K.inside); if (!rp) return [];
  const others0 = T.layoutOptions(rp, rest, { ...opts, tractsDone: done, count: N }).filter(o => o.elements?.length && !(o.kind === 'keepout'));
  const parked = o => { const m = S.metrics({ ...rp, program: o.program, elements: o.elements }); return m.spaces >= m.required; }, others = others0.some(parked) ? others0.filter(parked) : others0; // (the rest with its parking first: the tract's own doesn't count for it)
  if (!others.length) return [];
  const acres = best.sp.area / 43560, label = S.USES[zone.use]?.label?.split(' / ')[0] || zone.use, word = kind === 'industrial' ? 'Warehouses' : { retail: 'Shops', restaurant: 'Restaurants', office: 'Offices', medical: 'Medical offices', sfr: 'Homes', townhomes: 'Townhomes', duplex: 'Duplexes' }[zone.use] || label;
  const restIdx = P.zones.map((q, j) => j).filter(j => j !== zi && !(kind === 'homes' && P.zones[j].use === 'amenity')), zmap = z => !rest.zones ? restIdx[0] : z == null ? z : restIdx[z] ?? z; // (the rest's zones are the program's less the tract's: their numbers back to the program's; a single use left is that zone)
  return others.map((o, i) => {
    const io = best.os[i % best.os.length], ids = new Set(o.elements.map(e => e.id)), taken = new Set(S.entrancesOf(o.elements).map(e => e.name)); let k = 1;
    const ai = kind === 'homes' ? P.zones.findIndex(z => z.use === 'amenity') : -1, tz = z => z === 1 && ai >= 0 ? ai : zi; // (the tract's zones: its own, and the commons)
    const mine = io.elements.filter(e => e.kind !== 'keepout' && e.kind !== 'sign').map(e => { const c = { ...e, lot: 'tract:' + kind }; // (no monument signs at a tract's way in: the development's stand at the main entry) if (ids.has(c.id) || !c.id) c.id = 't' + Math.random().toString(36).slice(2, 9); if (c.kind === 'building') c.zone = tz(c.zone);
      if (S.isEntrance(c) && /^(?:Main entry|Entrance\b)/.test(c.name || '')) { do k++; while (taken.has('Entrance ' + k)); taken.add('Entrance ' + k); c.name = 'Entrance ' + k; if (K.way) c.note = (c.note ? c.note + ' · ' : '') + K.way; }
      return c; });
    const els = o.elements.filter(e => e.kind !== 'keepout').map(e => e.zone == null ? e : { ...e, zone: zmap(e.zone) }).concat(mine), sizes = { units: (o.sizes?.units || 0) + best.units, gfa: (o.sizes?.gfa || 0) + best.gfa };
    const notes = ['The ' + word.toLowerCase() + ' on a ' + acres.toFixed(1) + '-acre tract of their own along the ' + (best.sp.side < 0 ? 'left' : 'right') + ' end of the frontage' + K.why,
      ...(best.whole ? [] : [word + ': ' + (kind === 'homes' ? best.units + ' of the ' + zone.units + ' homes' : Math.round(best.gfa).toLocaleString('en-US') + ' of the ' + Math.round(zone.gfa).toLocaleString('en-US') + ' sq ft') + ' asked for fit on their tract.']), ...(io.notes || []).slice(0, kind === 'homes' ? 6 : 2).map(t => word + ': ' + t), ...(o.notes || [])];
    return { ...o, name: word + ' on their own tract · ' + o.name, elements: els, notes, sizes, program: { ...P, ...(o.program?.asked ? { asked: o.program.asked } : {}) },
      zones: [...(o.zones || []).map(z => ({ ...z, zone: zmap(z.zone) })), ...(io.zones?.length > 1 ? io.zones.map(z => ({ ...z, zone: tz(z.zone) })) : [{ name: K.zoneName || (kind === 'homes' ? 'Neighborhood' : label), use: zone.use, zone: zi, ring: best.sp.ring, acres }])],
      recipe: { ...(o.recipe || {}), tract: { ring: best.sp.ring.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), zi, kind, rest: { ring: rp.ring, front: rp.front, streets: rp.streets, edges: rp.setbacks.edges } }, restProg: o.program || S.normalizeProgram(rest) } };
  });
}
// a re-fit: the tract stays as it is (a piece of it moved by hand: it re-fits on its own tract), the rest re-fits round
// it. T: { refit, layoutOptions }
export function tractRefit(plan, opts, T) {
  const rc = plan.recipe, { ring, zi, kind } = rc.tract, K = KINDS[kind], mine = e => e.lot === 'tract:' + kind, els = plan.elements || [];
  const z = S.normalizeProgram(plan.program).zones?.[zi]; if (!z) return T.refit({ ...plan, recipe: (({ tract, restProg, ...r }) => r)(rc) }, opts);
  const own0 = els.filter(mine), rest0 = els.filter(e => !mine(e));
  let own = own0;
  if (own0.some(e => e.pinned)) { const lp = fuelLotPlan(plan, ring, K.inside);
    let r = []; try { r = T.layoutOptions({ ...lp, elements: own0 }, tractProgram(S.normalizeProgram(plan.program), zi, kind), { pinned: own0.filter(e => e.pinned), count: 1, noTract: true, gallery: false }); } catch (e) { r = []; }
    if (!r[0]?.elements?.length) return { elements: [], notes: [], why: 'It doesn’t re-fit on its own tract round that.' };
    own = r[0].elements.map(e => ({ ...e, lot: 'tract:' + kind, ...(e.kind === 'building' && e.zone == null ? { zone: zi } : {}) })); }
  const rp = rc.tract.rest, restPlan = { ...plan, ring: rp.ring, front: rp.front, streets: rp.streets, setbacks: { ...S.SETBACKS, ...(plan.setbacks || {}), edges: rp.edges }, program: rc.restProg, recipe: (({ tract, restProg, ...r }) => r)(rc), elements: rest0 };
  const r = T.refit(restPlan, opts); if (!r?.elements?.length) return r;
  return { ...r, elements: r.elements.filter(e => e.kind !== 'keepout').concat(own), recipe: { ...(r.recipe || restPlan.recipe), tract: rc.tract, restProg: rc.restProg } };
}
