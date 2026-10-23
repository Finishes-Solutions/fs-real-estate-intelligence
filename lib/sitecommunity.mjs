// A home community: manufactured homes, tiny homes or both (lib/siteplan.mjs HOME_KINDS) laid out the way RV parks and
// manufactured home communities are: long private lanes with a row of home lots on each side, the lanes joined at both
// ends so every lane is part of a loop, lots along the end lanes where there's depth, the detention pond along one end
// or one side, the entry drive straight in to the first cross lane. Each home sits near the front of its lot with a
// parking pad beside it (or in front, on a lot too narrow for both). Planning sketch only: no grading, utilities or
// fire-code check (spacing between homes is the lot's, about 10 ft and up).
// The plan pieces it makes are the ordinary ones (drives, lots, homes, driveway pads, the pond), so the map, the sheet,
// the numbers and the checks read it as any neighbourhood.
import * as S from './siteplan.mjs';
import { housePlansFor } from './buildings.mjs';
import polyclip from './vendor/polyclip.mjs';

const RAD = Math.PI / 180, ccw = r => S.signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]), fit = v => +v.toFixed(2);
const rot = ([x, y], deg) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [x * c - y * s, x * s + y * c]; };
const ringsOf = mp => mp.filter(pg => pg[0]?.length >= 4).map(pg => ccw(S.tidyRing(pg[0].slice(0, -1), 0.3))).filter(r => r.length >= 3 && S.ringArea(r) > 1);
const clip = (a, b) => { try { return ringsOf(polyclip.intersection([close(ccw(a))], [close(ccw(b))])); } catch { return []; } };
const box = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const uid = () => Math.random().toString(36).slice(2, 8);
export const COMMUNITY = { pad: [10, 36], gap: 4, clear: 6, minLots: 4, pavePer: 6000 }; // the parking pad (ft wide × long: two cars, one behind the other), the home off its side lot line, lots kept this far off the cross lanes' corners; lane paving that costs about a home

// the options (at most count), most homes first; [] when nothing fits (the caller falls back to the engine's own)
export function communityOptions(plan, prog, opts = {}) {
  const K = S.HOME_KINDS[prog.homeKind]; if (!K) return [];
  const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets);
  const land = ccw(S.insetRing(plan.ring, rules.map(r => Math.max(1, r.pave)))); if (!(S.ringArea(land) > 2000)) return [];
  const plans = housePlansFor({ min: prog.homeSfMin, max: prog.homeSfMax, n: prog.floorPlans, kind: prog.homeKind }); if (!plans.length) return [];
  const D = Math.max(+prog.lotD > 0 && prog.lotD !== S.HOME_KINDS[prog.homeKind]?.lotD ? +prog.lotD : 0, ...plans.map(h => h.d + K.frontBL + 10)), W = K.pave, lotWOf = h => Math.max(h.lotW, +prog.lotW || 0, +prog.minLotSf > 0 ? Math.ceil(prog.minLotSf / D) : 0);
  const ac = S.ringArea(plan.ring) / 43560, need = opts.pondNeed ?? S.stormNeed(ac, plan.params || {}, prog, ac).area;
  const f = plan.front != null && plan.front < plan.ring.length ? plan.front : S.longestEdge(plan.ring), fa = plan.ring[f], fb = plan.ring[(f + 1) % plan.ring.length];
  const entryAt = opts.stemEntry?.at || [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2], entryW = opts.stemEntry?.w || Math.max(24, W + 2), inward = (() => { const o = S.outwardOf(plan.ring, f); return [-o[0], -o[1]]; })();
  const a0 = S.mainAngle(plan.ring), found = [], R0 = plan.ring, per = R0.reduce((t, _, i) => t + S.edgeLen(R0, i), 0);
  const angs = [a0, a0 + 90, ...R0.map((p, i) => [i, S.edgeLen(R0, i)]).filter(([, l]) => l > per * 0.15).flatMap(([i]) => { const q = R0[(i + 1) % R0.length], a = Math.atan2(q[1] - R0[i][1], q[0] - R0[i][0]) / RAD + 90; return [a, a + 90]; })];
  const ths = angs.map(a => ((a % 180) + 180) % 180).filter((a, i, all) => all.findIndex(b => Math.min(Math.abs(a - b), 180 - Math.abs(a - b)) < 1.5) === i); // (each way once)
  for (const th of ths) {
    const toL = p => rot(p, -th), toP = p => rot(p, th), L = land.map(toL), us = L.map(p => p[0]), vs = L.map(p => p[1]), U0 = Math.min(...us), U1 = Math.max(...us), V0 = Math.min(...vs), V1 = Math.max(...vs);
    const inL = p => S.inRing(p, L), rectIn = (u0, v0, u1, v1) => inL([u0, v0]) && inL([u1, v0]) && inL([u1, v1]) && inL([u0, v1]) && inL([(u0 + u1) / 2, (v0 + v1) / 2]);
    const band = 2 * D + W;
    for (let k = 1; k <= Math.floor((U1 - U0 + D) / band) + 1; k++) for (const off of [0, 0.25, 0.5, 0.75, 1]) for (const pondAt of need > 2000 ? ['back', 'front', 'low', 'high'] : ['none']) {
      const slack = (U1 - U0) - k * band; if (slack < -2 * D) continue; // (the outside lanes may run along the edges, lots on their inner side only)
      const u0 = U0 + Math.max(0, slack) * off + Math.min(0, slack) * off;
      const lanes = Array.from({ length: k }, (_, j) => u0 + D + W / 2 + j * band); // lane centres
      const ua = lanes[0] - W / 2, ub = lanes[k - 1] + W / 2;
      // the cross lanes: as near each end as they fit across every lane
      let vF = null, vB = null; for (let v = V0 + W / 2; v < V1; v += 4) if (rectIn(ua, v - W / 2, ub, v + W / 2)) { vF = v; break; }
      for (let v = V1 - W / 2; v > V0; v -= 4) if (rectIn(ua, v - W / 2, ub, v + W / 2)) { vB = v; break; }
      if (vF == null || vB == null || vB - vF < 2 * W + 40 || k === 1 && vB - vF > 600) continue; // (one lane: a dead end, only when short)
      // the pond: a band across one end, or down one side, as long as the detention needs
      let pond = null; const pondPoly = r => clip(land, r.map(toP)).sort((p, q) => S.ringArea(q) - S.ringArea(p))[0];
      if (pondAt !== 'none') {
        const grow = mk => { let lo = 10, hi = Math.max(V1 - V0, U1 - U0), best = null; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2, pg = pondPoly(mk(m)); if (pg && S.ringArea(pg) >= need) { best = pg; hi = m; } else lo = m; } return best; };
        pond = pondAt === 'back' ? grow(m => box(U0 - 10, V1 - m, U1 + 10, V1 + 10)) : pondAt === 'front' ? grow(m => box(U0 - 10, V0 - 10, U1 + 10, V0 + m)) : pondAt === 'low' ? grow(m => box(U0 - 10, V0 - 10, U0 + m, V1 + 10)) : grow(m => box(U1 - m, V0 - 10, U1 + 10, V1 + 10));
        if (!pond) continue;
      }
      const PL = pond ? S.grow(pond.map(toL), 6) : null, offPond = (u0, v0, u1, v1) => !PL || !S.rectsOverlap({ poly: box(u0, v0, u1, v1) }, { poly: PL }, 0);
      // a cross lane shortened where the pond takes the end: it runs over the lanes it still reaches
      let vf = vF, vb = vB; if (pond && (pondAt === 'front' || pondAt === 'back')) {
        const pv = PL.map(p => p[1]); if (pondAt === 'back') { const top = Math.min(...pv); vb = Math.min(vB, top - W / 2 - 2); } else { const bot = Math.max(...pv); vf = Math.max(vF, bot + W / 2 + 2); }
        if (!rectIn(ua, vf - W / 2, ub, vf + W / 2) || !rectIn(ua, vb - W / 2, ub, vb + W / 2) || vb - vf < 2 * W + 40) continue;
      }
      const live = lanes.filter(u => offPond(u - W / 2, vf, u + W / 2, vb)); if (live.length < Math.min(2, k) || live.length !== k) continue;
      const drives = [], lots = [];
      for (const u of lanes) drives.push({ r: box(u - W / 2, vf - W / 2, u + W / 2, vb + W / 2), note: 'Lane · ' + W + ' ft' });
      if (k > 1) { drives.push({ r: box(ua, vf - W / 2, ub, vf + W / 2), note: 'Lane · ' + W + ' ft' }); drives.push({ r: box(ua, vb - W / 2, ub, vb + W / 2), note: 'Lane · ' + W + ' ft' }); }
      else drives.push({ r: box(lanes[0] - 40, vb - 10, lanes[0] + 40, vb + 10), note: 'Hammerhead turnaround · 80 ft', turn: true });
      const taken = [], free = (u0, v0, u1, v1) => rectIn(u0, v0, u1, v1) && offPond(u0, v0, u1, v1) && !taken.some(t => u0 < t[2] - 0.5 && t[0] < u1 - 0.5 && v0 < t[3] - 0.5 && t[1] < v1 - 0.5);
      let pi = 0; const next = () => plans[pi++ % plans.length];
      // lots along a lane's side: dir +1 to the right of the lane (u grows), -1 to the left; along v from a to b
      const side = (u, dir, a, b) => { let v = a; while (true) { const h = plans[pi % plans.length], w = lotWOf(h); if (v + w > b) break; const e0 = u + dir * W / 2, e1 = e0 + dir * D, r = [Math.min(e0, e1), v, Math.max(e0, e1), v + w];
        if (free(...r)) { lots.push({ r, h, front: dir > 0 ? 'u0' : 'u1' }); taken.push(r); next(); v += w; } else v += 4; } };
      const a = vf + W / 2 + COMMUNITY.clear, b = vb - W / 2 - COMMUNITY.clear;
      for (const u of lanes) { side(u, -1, k > 1 ? a : vf - W / 2, k > 1 ? b : vb - 12); side(u, 1, k > 1 ? a : vf - W / 2, k > 1 ? b : vb - 12); }
      // lots facing the end lanes from beyond them (across their whole run), where the land is deep enough
      const ends = (v, dir) => { let u = ua - D; while (true) { const h = plans[pi % plans.length], w = lotWOf(h); if (u + w > ub + D) break; const e0 = v + dir * W / 2, e1 = e0 + dir * D, r = [u, Math.min(e0, e1), u + w, Math.max(e0, e1)];
        if (free(...r)) { lots.push({ r, h, front: dir > 0 ? 'v0' : 'v1' }); taken.push(r); next(); u += w; } else u += 4; } };
      if (k > 1) { ends(vb, 1); ends(vf, -1); }
      // the entry: straight in from the street (or the strip's drive) to the first lane it meets
      const eL = toL(entryAt), dL = rot(inward, -th), hit = q => drives.some(d => S.inRing(q, d.r));
      let len = 0; for (; len < 600; len += 2) if (hit([eL[0] + dL[0] * len, eL[1] + dL[1] * len])) break;
      if (len >= 600) continue;
      const nn = [-dL[1], dL[0]], ew = entryW / 2, e2 = [eL[0] + dL[0] * (len + 4), eL[1] + dL[1] * (len + 4)], er = [[eL[0] - nn[0] * ew, eL[1] - nn[1] * ew], [eL[0] + nn[0] * ew, eL[1] + nn[1] * ew], [e2[0] + nn[0] * ew, e2[1] + nn[1] * ew], [e2[0] - nn[0] * ew, e2[1] - nn[1] * ew]];
      const eg = S.grow(ccw(er), 4), kept = lots.filter(l => !S.rectsOverlap({ poly: box(...l.r) }, { poly: eg }, 0));
      if (PL && S.rectsOverlap({ poly: ccw(er) }, { poly: S.grow(pond.map(toL), 2) }, 0)) continue; // (the drive in can't cross the pond)
      if (kept.length < COMMUNITY.minLots) continue;
      const room = kept.length, ask = +prog.units > 0 ? Math.round(+prog.units) : 0, mid = l => [(l.r[0] + l.r[2]) / 2, (l.r[1] + l.r[3]) / 2]; // a count asked: that many, nearest the entry first
      const use = ask && room > ask ? kept.slice().sort((p, q) => Math.hypot(mid(p)[0] - eL[0], mid(p)[1] - eL[1]) - Math.hypot(mid(q)[0] - eL[0], mid(q)[1] - eL[1])).slice(0, ask) : kept;
      const pave = drives.reduce((t, d) => t + S.ringArea(d.r), 0), where = pond ? pondWhere(plan, f, pond) : 'none';
      found.push({ th, k, pondAt, where, pond, drives, lots: use, room, ask, entry: er, toP, n: use.length, pave, score: use.length - pave / COMMUNITY.pavePer, sf: use.reduce((t, l) => t + l.h.sf, 0) });
    }
  }
  if (!found.length) return [];
  found.sort((p, q) => q.score - p.score || q.n - p.n || q.sf - p.sf); // the most homes for the lane paving they take
  const picked = []; for (const c of found) { if (picked.length >= (opts.count || 3)) break; if (picked.some(p => p.where === c.where && p.k === c.k)) continue; picked.push(c); }
  return picked.map((c, i) => optionOf(plan, prog, K, c, i, opts));
}

const WHERE = { back: 'pond at the back', front: 'pond at the entry', side: 'pond along the side', none: 'no pond' };
// where the pond is as seen from the street: by how far back its middle is, against the site's depth
function pondWhere(plan, f, pond) {
  const a = plan.ring[f], o = S.outwardOf(plan.ring, f), back = p => (a[0] - p[0]) * o[0] + (a[1] - p[1]) * o[1], ds = plan.ring.map(back), D = Math.max(...ds) - Math.min(...ds) || 1, c = back(S.centroid(pond)) / D;
  const span = (Math.max(...pond.map(back)) - Math.min(...pond.map(back))) / D;
  return span > 0.5 ? 'side' : c > 0.6 ? 'back' : c < 0.4 ? 'front' : 'side';
}
function optionOf(plan, prog, K, c, i, opts) {
  const { toP, th } = c, P = poly => ccw(poly.map(toP).map(p => p.map(fit))), els = [];
  const rect = (u0, v0, u1, v1, e) => { const m = toP([(u0 + u1) / 2, (v0 + v1) / 2]); return { ...e, x: fit(m[0]), y: fit(m[1]), w: fit(u1 - u0), d: fit(v1 - v0), rot: +(((th % 360) + 360) % 360).toFixed(3), id: 'e' + uid() }; };
  els.push({ kind: 'drive', poly: P(c.entry), name: 'Main entry', note: (opts.stemEntry ? Math.round(opts.stemEntry.w) : Math.round(Math.max(24, K.pave + 2))) + ' ft entry drive', entry: true, id: 'e' + uid() });
  for (const d of c.drives) { const [u0, v0] = d.r[0], [u1, v1] = d.r[2]; els.push(rect(u0, v0, u1, v1, { kind: 'drive', name: '', note: d.note, ...(d.turn ? { turn: true } : {}) })); }
  if (c.pond) els.push({ kind: 'pond', poly: c.pond.map(p => p.map(fit)), name: 'Detention', note: 'Detention', id: 'e' + uid() });
  const [pw, pl] = COMMUNITY.pad;
  c.lots.forEach((l, j) => {
    const [u0, v0, u1, v1] = l.r, h = l.h, across = l.front === 'u0' || l.front === 'u1', lw = across ? v1 - v0 : u1 - u0, ld = across ? u1 - u0 : v1 - v0;
    // in the lot's own terms: s along its front (0..lw), t back from the lane (0..ld)
    const beside = lw >= h.w + 2 * COMMUNITY.gap + pw + 2, t0 = beside ? K.frontBL : Math.min(ld - h.d - 3, Math.max(K.frontBL, 22)) /* (a pad in front: one car, 20 ft) */, s0 = beside ? COMMUNITY.gap : (lw - h.w) / 2;
    const at = (s, t) => l.front === 'u0' ? [u0 + t, v0 + s] : l.front === 'u1' ? [u1 - t, v0 + s] : l.front === 'v0' ? [u0 + s, v0 + t] : [u0 + s, v1 - t];
    const R = (s0_, t0_, s1_, t1_) => { const p = at(s0_, t0_), q = at(s1_, t1_); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
    els.push(rect(u0, v0, u1, v1, { kind: 'lot', name: '', note: Math.round(lw) + ' × ' + Math.round(ld) + ' ft lot' }));
    const padL = beside ? Math.min(pl, ld - 2) : t0 - 1, cars = padL >= 36 ? 2 : 1, hb = R(s0, t0, s0 + h.w, t0 + h.d), pad = beside ? R(s0 + h.w + 2, 0, s0 + h.w + 2 + pw, padL) : R((lw - pw) / 2, 0, (lw + pw) / 2, padL);
    els.push(rect(...hb, { kind: 'building', use: 'sfr', floors: 1, units: 1, sf: h.sf, nowalk: true, type: h.id, note: h.note, name: 'Lot ' + (j + 1), padSpaces: cars }));
    els.push(rect(...pad, { kind: 'plaza', name: '', note: 'Parking pad · ' + cars + (cars > 1 ? ' cars' : ' car') }));
  });
  const homes = c.lots.length, pondAc = c.pond ? S.ringArea(c.pond) / 43560 : 0, ac = S.ringArea(plan.ring) / 43560, mix = [...new Set(c.lots.map(l => l.h.note.split(' · ')[0]))];
  const notes = [homes + ' home lots on ' + (c.k > 1 ? c.k + ' private lanes joined into loops' : 'one private lane with a turnaround') + ' (' + K.pave + ' ft pavement), about ' + (homes / ac).toFixed(1) + ' homes an acre: ' + mix.join(', ') + '.',
    'Lots ' + Math.round(Math.min(...c.lots.map(l => Math.min(l.r[2] - l.r[0], l.r[3] - l.r[1])))) + '–' + Math.round(Math.max(...c.lots.map(l => Math.min(l.r[2] - l.r[0], l.r[3] - l.r[1])))) + ' ft wide, each home with a parking pad; spacing between homes, lane widths and the fire lanes need the local manufactured home or RV park rules (and the fire marshal).',
    ...(c.ask && c.room > c.ask ? ['The ' + c.ask + ' homes asked for; the land holds about ' + c.room + '.'] : c.ask > c.room ? ['Room for ' + c.room + ' of the ' + c.ask + ' homes asked for.'] : []),
    ...(c.pond ? ['Detention ' + pondAc.toFixed(2) + ' ac, ' + WHERE[c.where] + '.'] : [])];
  return { name: (c.k > 1 ? c.k + ' lanes in loops' : 'One lane') + ' · ' + WHERE[c.where], elements: els, notes, program: prog, community: { kind: prog.homeKind, homes, lanes: c.k }, score: homes };
}
