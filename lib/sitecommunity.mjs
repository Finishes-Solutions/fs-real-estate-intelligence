// A home community: manufactured homes, tiny homes or both (lib/siteplan.mjs HOME_KINDS) laid out the way RV parks and
// manufactured home communities are: long private lanes with a row of home lots on each side, the lanes joined at both
// ends so every lane is part of a loop, lots along the end lanes where there's depth, the detention pond along one end
// or one side, the entry drive straight in to the first cross lane. Each home sits near the front of its lot with a
// parking pad beside it (or in front, on a lot too narrow for both). Planning sketch only: no grading, utilities or
// fire-code check (spacing between homes is the lot's, about 10 ft and up).
// The plan pieces it makes are the ordinary ones (drives, lots, homes, driveway pads, the pond), so the map, the sheet,
// the numbers and the checks read it as any neighbourhood.
import * as S from './siteplan.mjs';
import { housePlansFor, fitPlan } from './buildings.mjs';
import polyclip from './vendor/polyclip.mjs';

const RAD = Math.PI / 180, ccw = r => S.signedArea(r) >= 0 ? r : r.slice().reverse(), close = r => r.concat([r[0]]), fit = v => +v.toFixed(2);
const rot = ([x, y], deg) => { const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD); return [x * c - y * s, x * s + y * c]; };
const ringsOf = mp => mp.filter(pg => pg[0]?.length >= 4).map(pg => ccw(S.tidyRing(pg[0].slice(0, -1), 0.3))).filter(r => r.length >= 3 && S.ringArea(r) > 1);
const clip = (a, b) => { try { return ringsOf(polyclip.intersection([close(ccw(a))], [close(ccw(b))])); } catch { return []; } };
const box = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const uid = () => Math.random().toString(36).slice(2, 8);
export const COMMUNITY = { pad: [10, 36], gap: 4, clear: 6, minLots: 4, pavePer: 6000, apart: 10, stretch: 40 }; // the parking pad (ft wide × long: two cars, one behind the other), the home off its side lot line, lots kept this far off the cross lanes' corners; lane paving that costs about a home; the least space between two homes side by side; how far a row along the property line may run out to it

// where a home sits on its lot (lw along the lane, ld deep): near the front with the parking pad beside it, or behind a
// one-car pad in front on a lot too narrow for both. t0: the home's front back from the lane, s0 its side in from the lot line
// a home sized to order: its width (ft, the least and the most), the width with no pad to fill, its length with nothing asked and the longest
const SIZE = { tiny: { w: [8, 20], w0: 14, d: 32, d1: 48 }, manufactured: { w: [14, 32], w0: 16, d: 56, d1: 80 } };
const sitOf = (h, lw, ld, K) => { const [pw] = COMMUNITY.pad, beside = lw >= h.w + 2 * COMMUNITY.gap + pw + 2, t0 = beside ? K.frontBL : Math.max(K.frontBL, 22); return { beside, t0, s0: beside ? COMMUNITY.gap : (lw - h.w) / 2, fits: t0 + h.d + 1 <= ld && lw >= h.w + COMMUNITY.apart }; };

// the options (at most count), most homes for the lane paving first; [] when nothing fits (the caller falls back to the
// engine's own). Lots run to the property line (prog.buffer: a landscape strip, ft, when asked) and the lanes stay 5 ft
// off it; the homes keep the plan's setbacks from it (the outside rows are made that much deeper). A pad size asked
// (prog.lotW × prog.lotD, "25 × 55 pads") is every lot's, with the homes that fit on it.
export function communityOptions(plan, prog, opts = {}) {
  const K = S.HOME_KINDS[prog.homeKind]; if (!K) return [];
  const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets), buf = +prog.buffer > 0 ? Math.min(50, +prog.buffer) : 0;
  const inset = d => ccw(S.insetRing(plan.ring, rules.map(d))), landLot = inset(() => Math.max(0.5, buf)), landLane = inset(() => Math.max(5, buf)), landHome = inset(r => Math.max(0.5, buf, r.role === 'front' ? 0 : r.build));
  if (!(S.ringArea(landLot) > 2000)) return [];
  let plans = housePlansFor({ min: prog.homeSfMin, max: prog.homeSfMax, n: prog.floorPlans, kind: prog.homeKind }); if (!plans.length) return [];
  let padW = +prog.lotW > 0 ? +prog.lotW : null, padD = prog.lotSet && +prog.lotD > 0 ? +prog.lotD : null; const W = K.pave, said = [];
  const sfAsk = +prog.homeSfMax > 0 ? +prog.homeSfMax : +prog.homeSfMin > 0 ? +prog.homeSfMin : null;
  if (padW || padD || prog.homeW || prog.homeD || sfAsk) { // sized to order: the home fills the pad, or is the size asked and the pad grows to hold it
    const kind = prog.homeKind === 'manufactured' ? 'manufactured' : 'tiny', L = SIZE[kind], [pw] = COMMUNITY.pad, put = x => Math.round(x);
    let w = prog.homeW || null, d = prog.homeD || null;
    if (!w) { const front = padW ? padW - COMMUNITY.apart : null, side = padW ? padW - 2 * COMMUNITY.gap - pw - 2 : null; // (the widest home with its parking in front, or beside it)
      const dOf = (ww, t0) => d || (sfAsk ? Math.ceil(sfAsk / ww) : padD ? padD - t0 - 1 : L.d);
      const opts2 = [[front, 22], [side, K.frontBL]].filter(([ww]) => ww >= L.w[0]).map(([ww, t0]) => { const x = Math.min(ww, L.w[1]); return [x, Math.min(L.d1, dOf(x, t0))]; });
      [w, d] = opts2.length ? opts2.sort((a, b) => b[0] * b[1] - a[0] * a[1])[0] : [sfAsk && !padW ? L.w0 : L.w[0], dOf(L.w[0], 22)];
      if (!padW && sfAsk) { w = L.w0; d = Math.ceil(sfAsk / w); } }
    if (!d) d = sfAsk ? Math.ceil(sfAsk / w) : padD ? Math.max(16, padD - sitOf({ w, d: 1 }, padW || w + COMMUNITY.apart, 1e3, K).t0 - 1) : L.d;
    w = Math.max(L.w[0], Math.min(L.w[1], put(w))); d = Math.max(16, Math.min(L.d1, put(d)));
    const h = fitPlan({ kind, w, d }), lw0 = padW || Math.max(w + COMMUNITY.apart, w + 2 * COMMUNITY.gap + pw + 2), t = sitOf(h, Math.max(lw0, w + COMMUNITY.apart), 1e3, K), dNeed = t.t0 + d + 1;
    if (padW && padW < w + COMMUNITY.apart) { said.push('A ' + h.note.split(' · ')[0] + ' needs a pad at least ' + (w + COMMUNITY.apart) + ' ft wide (10 ft to the next home); the pads are made that wide.'); padW = w + COMMUNITY.apart; }
    if (padD && padD < dNeed) { said.push('A ' + h.note + ' home with its parking needs a pad ' + dNeed + ' ft deep; the pads are made that deep.'); padD = dNeed; }
    said.push('Homes sized ' + (padW && !prog.homeW && !prog.homeD && !sfAsk ? 'to fill the pads' : 'as asked') + ': ' + h.note + '.');
    plans = [{ ...h, lotW: padW || lw0 }];
  }
  const needD = h => { const w = padW && sitOf(h, padW, 1e3, K).fits ? padW : Math.max(h.lotW, padW || 0); const t = sitOf(h, w, 1e3, K); return t.t0 + h.d + 1; };
  const D = Math.max(padD && plans.every(h => needD(h) <= padD) ? padD : 0, padD ? 0 : Math.max(+prog.lotD > 0 && prog.lotD !== K.lotD ? +prog.lotD : 0, ...plans.map(h => h.d + K.frontBL + 10)), ...plans.map(needD));
  const lotWOf = h => { const w = Math.max(padW && sitOf(h, padW, D, K).fits ? padW : Math.max(h.lotW, padW || 0), +prog.minLotSf > 0 ? Math.ceil(prog.minLotSf / D) : 0); return w; };
  // the outside rows: deep enough that a home keeps the plan's setback from the property line behind it
  const rearClear = Math.min(...plans.map(h => D - sitOf(h, lotWOf(h), D, K).t0 - h.d)), setb = Math.max(0, ...rules.filter(r => r.role !== 'front').map(r => r.build)), Do = D + Math.max(0, Math.ceil(setb - buf - rearClear));
  const ac = S.ringArea(plan.ring) / 43560, need = opts.pondNeed ?? S.stormNeed(ac, plan.params || {}, prog, ac).area;
  const f = plan.front != null && plan.front < plan.ring.length ? plan.front : S.longestEdge(plan.ring), fa = plan.ring[f], fb = plan.ring[(f + 1) % plan.ring.length];
  const entryAt = opts.stemEntry?.at || [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2], entryW = opts.stemEntry?.w || Math.max(24, W + 2), inward = (() => { const o = S.outwardOf(plan.ring, f); return [-o[0], -o[1]]; })();
  const a0 = S.mainAngle(plan.ring), found = [], R0 = plan.ring, per = R0.reduce((t, _, i) => t + S.edgeLen(R0, i), 0);
  const angs = [a0, a0 + 90, ...R0.map((p, i) => [i, S.edgeLen(R0, i)]).filter(([, l]) => l > per * 0.15).flatMap(([i]) => { const q = R0[(i + 1) % R0.length], a = Math.atan2(q[1] - R0[i][1], q[0] - R0[i][0]) / RAD + 90; return [a, a + 90]; })];
  const ths = angs.map(a => ((a % 180) + 180) % 180).filter((a, i, all) => all.findIndex(b => Math.min(Math.abs(a - b), 180 - Math.abs(a - b)) < 1.5) === i); // (each way once)
  for (const th of ths) {
    const toL = p => rot(p, -th), toP = p => rot(p, th), LL = landLot.map(toL), LN = landLane.map(toL), LH = landHome.map(toL), us = LL.map(p => p[0]), vs = LL.map(p => p[1]), U0 = Math.min(...us), U1 = Math.max(...us), V0 = Math.min(...vs), V1 = Math.max(...vs);
    const inside = (R, u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [(u0 + u1) / 2, (v0 + v1) / 2], [(u0 + u1) / 2, v0], [(u0 + u1) / 2, v1], [u0, (v0 + v1) / 2], [u1, (v0 + v1) / 2]].every(p => S.inRing(p, R));
    const band = 2 * D + W;
    for (let k = 1; k <= Math.floor((U1 - U0) / band) + 2; k++) for (const off of [0, 0.25, 0.5, 0.75, 1]) for (const pondAt of need > 2000 ? ['back', 'front', 'low', 'high', 'fl', 'fr', 'bl', 'br'] : ['none']) {
      const span = (k - 1) * band + 2 * (Do + W / 2), slack = (U1 - U0) - span; if (slack < -2 * Do) continue; // (the outside lanes may run along the edges, lots on their inner side only)
      if (pondAt.length === 2 && k < 2) continue;
      const u0 = U0 + slack * off, lanes = Array.from({ length: k }, (_, j) => u0 + Do + W / 2 + j * band), ua = lanes[0] - W / 2, ub = lanes[k - 1] + W / 2;
      // the pond: a band across one end or down one side, or a corner (one end of the outside rows and lanes on one side), as big as the detention needs
      let pond = null; const pondPoly = r => clip(landLot, r.map(toP)).sort((p, q) => S.ringArea(q) - S.ringArea(p))[0];
      if (pondAt !== 'none') {
        const grow = mk => { let lo = 10, hi = Math.max(V1 - V0, U1 - U0), best = null; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2, pg = pondPoly(mk(m)); if (pg && S.ringArea(pg) >= need) { best = pg; hi = m; } else lo = m; } return best; };
        const cl = lanes[k - 1] - W / 2 - D, cr = lanes[0] + W / 2 + D; // (a corner pond: up to the last lane's (or the first's) row of lots)
        pond = { back: () => grow(m => box(U0 - 10, V1 - m, U1 + 10, V1 + 10)), front: () => grow(m => box(U0 - 10, V0 - 10, U1 + 10, V0 + m)), low: () => grow(m => box(U0 - 10, V0 - 10, U0 + m, V1 + 10)), high: () => grow(m => box(U1 - m, V0 - 10, U1 + 10, V1 + 10)),
          fl: () => grow(m => box(U0 - 10, V0 - 10, cl, V0 + m)), fr: () => grow(m => box(cr, V0 - 10, U1 + 10, V0 + m)), bl: () => grow(m => box(U0 - 10, V1 - m, cl, V1 + 10)), br: () => grow(m => box(cr, V1 - m, U1 + 10, V1 + 10)) }[pondAt]();
        if (!pond) continue;
      }
      const PL = pond ? S.grow(pond.map(toL), 6) : null, offPond = (u0, v0, u1, v1) => !PL || !S.rectsOverlap({ poly: box(u0, v0, u1, v1) }, { poly: PL }, 0);
      const laneOK = (u0, v0, u1, v1) => inside(LN, u0, v0, u1, v1) && offPond(u0, v0, u1, v1);
      // each lane's own run: as far toward each end as it fits
      const ext = lanes.map(u => { let s0 = null, e0 = null; for (let v = V0; v < V1; v += 4) if (laneOK(u - W / 2, v, u + W / 2, v + 4)) { s0 = v; break; } for (let v = V1; v > V0; v -= 4) if (laneOK(u - W / 2, v - 4, u + W / 2, v)) { e0 = v; break; } return s0 != null && e0 != null && e0 - s0 > 2 * W + 40 ? [s0, e0] : null; });
      if (ext.some(e => !e)) continue;
      // the cross lanes, as near each end as they reach across every lane
      let vf = null, vb = null;
      if (k > 1) { for (let v = Math.max(...ext.map(e => e[0])) + W / 2; v < V1; v += 4) if (laneOK(ua, v - W / 2, ub, v + W / 2)) { vf = v; break; }
        for (let v = Math.min(...ext.map(e => e[1])) - W / 2; v > V0; v -= 4) if (laneOK(ua, v - W / 2, ub, v + W / 2)) { vb = v; break; }
        if (vf == null || vb == null || vb - vf < 2 * W + 60) continue; }
      else { const [s0, e0] = ext[0]; if (e0 - s0 > 600) continue; vf = s0 + W / 2; vb = e0 - W / 2; } // (one lane: a dead end, only when short)
      // the entry: straight in from the street (or the strip's drive) to the first lane it meets, the lanes run out to their ends
      const eL = toL(entryAt), dL = rot(inward, -th), full = lanes.map((u, j) => box(u - W / 2, ext[j][0], u + W / 2, ext[j][1]));
      const cross = k > 1 ? [box(ua, vf - W / 2, ub, vf + W / 2), box(ua, vb - W / 2, ub, vb + W / 2)] : [];
      let len = 0, hitLane = -1; for (; len < 700; len += 2) { const q = [eL[0] + dL[0] * len, eL[1] + dL[1] * len]; hitLane = full.findIndex(r => S.inRing(q, r)); if (hitLane >= 0 || cross.some(r => S.inRing(q, r))) break; }
      if (len >= 700) continue;
      // a lane runs past the cross lanes only where the entry comes in on it (no dead ends besides)
      const nearF = Math.abs(eL[1] - vf) <= Math.abs(eL[1] - vb), runs = lanes.map((u, j) => [j === hitLane && nearF ? Math.min(ext[j][0], vf - W / 2) : vf - W / 2, j === hitLane && !nearF ? Math.max(ext[j][1], vb + W / 2) : vb + W / 2]); // (only toward the entry: no dead end at the far end)
      if (k === 1) runs[0] = [ext[0][0], ext[0][1]];
      const drives = lanes.map((u, j) => ({ r: box(u - W / 2, runs[j][0], u + W / 2, runs[j][1]), note: 'Lane · ' + W + ' ft' }));
      if (k > 1) for (const r of cross) drives.push({ r, note: 'Lane · ' + W + ' ft' }); else drives.push({ r: box(lanes[0] - 40, vb - 10, lanes[0] + 40, vb + 10), note: 'Hammerhead turnaround · 80 ft', turn: true });
      const nn = [-dL[1], dL[0]], ew = entryW / 2, e2 = [eL[0] + dL[0] * (len + 4), eL[1] + dL[1] * (len + 4)], er = [[eL[0] - nn[0] * ew, eL[1] - nn[1] * ew], [eL[0] + nn[0] * ew, eL[1] + nn[1] * ew], [e2[0] + nn[0] * ew, e2[1] + nn[1] * ew], [e2[0] - nn[0] * ew, e2[1] - nn[1] * ew]];
      if (PL && S.rectsOverlap({ poly: ccw(er) }, { poly: S.grow(pond.map(toL), 2) }, 0)) continue; // (the drive in can't cross the pond)
      const eg = S.grow(ccw(er), 4), taken = drives.map(d => [d.r[0][0], d.r[0][1], d.r[2][0], d.r[2][1]]), lots = [];
      const clash = r => taken.some(t => r[0] < t[2] - 0.5 && t[0] < r[2] - 0.5 && r[1] < t[3] - 0.5 && t[1] < r[3] - 0.5) || S.rectsOverlap({ poly: box(...r) }, { poly: eg }, 0);
      let pi = 0;
      // a lot (r in local u0 v0 u1 v1, its front on the lane at `front`) with its home where it sits: in the lots' land, off the pond, its home clear of the setbacks
      const tryLot = (r, h, front, lw, ld, outer) => { if (!inside(LL, ...r) || !offPond(...r) || clash(r)) return false; const t = sitOf(h, lw, ld, K), hb = homeBox(r, front, t, h); if (!inside(LH, ...hb)) return false;
        if (outer) { const k0 = { u0: 2, u1: 0, v0: 3, v1: 1 }[front], sg = k0 >= 2 ? 1 : -1; for (let x = 2; x <= COMMUNITY.stretch; x += 2) { const q = r.slice(); q[k0] += sg * 2; if (!inside(LL, ...q) || !offPond(...q) || clash(q)) break; r = q; } } // (a row along the property line runs out to it)
        lots.push({ r, h, front }); taken.push(r); pi++; return true; };
      // lots along a lane's side: dir +1 to the right of the lane (u grows), -1 to the left; the outside rows deeper
      const side = (j, dir, a, b) => { const u = lanes[j], dd = (j === 0 && dir < 0) || (j === k - 1 && dir > 0) ? Do : D; let v = a; while (true) { const h = plans[pi % plans.length], w = lotWOf(h); if (v + w > b) break; const e0 = u + dir * W / 2;
        const ok = [dd, D].some(d0 => { const e1 = e0 + dir * d0; return tryLot([Math.min(e0, e1), v, Math.max(e0, e1), v + w], h, dir > 0 ? 'u0' : 'u1', w, d0, dd > D || (j === 0 && dir < 0) || (j === k - 1 && dir > 0)); }); v += ok ? w : 4; } };
      for (let j = 0; j < k; j++) { const [a, b] = runs[j], ins = k > 1 ? [Math.max(a, vf + W / 2 + COMMUNITY.clear), Math.min(b, vb - W / 2 - COMMUNITY.clear)] : [a, b - 12];
        for (const dir of [-1, 1]) { side(j, dir, ins[0], ins[1]); if (j === hitLane && k > 1) { if (a < vf - W / 2) side(j, dir, a, vf - W / 2 - COMMUNITY.clear); if (b > vb + W / 2) side(j, dir, vb + W / 2 + COMMUNITY.clear, b); } } }
      // lots facing the end lanes from beyond them, across their whole run
      const ends = (v, dir) => { let u = ua - lotWOf(plans[pi % plans.length]) / 2; while (true) { const h = plans[pi % plans.length], w = lotWOf(h); if (u + w > ub + w / 2) break; // (each one's front at least half on the lane)
        const e0 = v + dir * W / 2;
        const ok = [Do, D].some(d0 => { const e1 = e0 + dir * d0; return tryLot([u, Math.min(e0, e1), u + w, Math.max(e0, e1)], h, dir > 0 ? 'v0' : 'v1', w, d0, true); }); u += ok ? w : 4; } };
      if (k > 1) { ends(vb, 1); ends(vf, -1); }
      if (lots.length < COMMUNITY.minLots) continue;
      const room = lots.length, ask = +prog.units > 0 ? Math.round(+prog.units) : 0, mid = l => [(l.r[0] + l.r[2]) / 2, (l.r[1] + l.r[3]) / 2]; // a count asked: that many, nearest the entry first
      const use = ask && room > ask ? lots.slice().sort((p, q) => Math.hypot(mid(p)[0] - eL[0], mid(p)[1] - eL[1]) - Math.hypot(mid(q)[0] - eL[0], mid(q)[1] - eL[1])).slice(0, ask) : lots;
      const pave = drives.reduce((t, d) => t + S.ringArea(d.r), 0), where = !pond ? 'none' : pondAt.length === 2 ? 'corner' : pondWhere(plan, f, pond);
      found.push({ th, k, pondAt, where, pond, drives, lots: use, room, ask, entry: er, toP, n: use.length, pave, score: use.length - pave / COMMUNITY.pavePer, sf: use.reduce((t, l) => t + l.h.sf, 0), said, D, Do, buf });
    }
  }
  if (!found.length) return [];
  found.sort((p, q) => q.score - p.score || q.n - p.n || q.sf - p.sf); // the most homes for the lane paving they take
  const picked = [], n = opts.count || 3; for (const c of found) { if (picked.length >= n) break; if (picked.some(p => p.where === c.where && p.k === c.k)) continue; picked.push(c); }
  const corner = found.find(c => c.where === 'corner'); if (corner && !picked.includes(corner) && n > 1) { picked.length = Math.min(picked.length, n - 1); picked.push(corner); } // (always one with the pond in a corner, as RV parks and home communities often have it, when one fits)
  return picked.map((c, i) => optionOf(plan, prog, K, c, i, opts));
}
// a home's outline on its lot (local u0 v0 u1 v1), as it sits (sitOf)
function homeBox(r, front, t, h) {
  const [u0, v0, u1, v1] = r, at = (s, q) => front === 'u0' ? [u0 + q, v0 + s] : front === 'u1' ? [u1 - q, v0 + s] : front === 'v0' ? [u0 + s, v0 + q] : [u0 + s, v1 - q];
  const p = at(t.s0, t.t0), q = at(t.s0 + h.w, t.t0 + h.d); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
}

const WHERE = { back: 'pond at the back', front: 'pond at the entry', side: 'pond along the side', corner: 'pond in a corner', none: 'no pond' };
// where the pond is as seen from the street: by how far back its middle is, against the site's depth
function pondWhere(plan, f, pond) {
  const a = plan.ring[f], o = S.outwardOf(plan.ring, f), back = p => (a[0] - p[0]) * o[0] + (a[1] - p[1]) * o[1], ds = plan.ring.map(back), D = Math.max(...ds) - Math.min(...ds) || 1, c = back(S.centroid(pond)) / D;
  const span = (Math.max(...pond.map(back)) - Math.min(...pond.map(back))) / D;
  return span > 0.5 ? 'side' : c > 0.6 ? 'back' : c < 0.4 ? 'front' : 'side';
}
const span = xs => { const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs)); return a === b ? '' + a : a + '–' + b; };
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
    const { beside, t0, s0 } = sitOf(h, lw, ld, K);
    const at = (s, t) => l.front === 'u0' ? [u0 + t, v0 + s] : l.front === 'u1' ? [u1 - t, v0 + s] : l.front === 'v0' ? [u0 + s, v0 + t] : [u0 + s, v1 - t];
    const R = (s0_, t0_, s1_, t1_) => { const p = at(s0_, t0_), q = at(s1_, t1_); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
    els.push(rect(u0, v0, u1, v1, { kind: 'lot', name: '', note: Math.round(lw) + ' × ' + Math.round(ld) + ' ft lot' }));
    const padL = beside ? Math.min(pl, ld - 2) : t0 - 1, cars = padL >= 36 ? 2 : 1, hb = R(s0, t0, s0 + h.w, t0 + h.d), pad = beside ? R(s0 + h.w + 2, 0, s0 + h.w + 2 + pw, padL) : R((lw - pw) / 2, 0, (lw + pw) / 2, padL);
    els.push(rect(...hb, { kind: 'building', use: 'sfr', floors: 1, units: 1, sf: h.sf, nowalk: true, type: h.id, note: h.note, name: 'Lot ' + (j + 1), padSpaces: cars }));
    els.push(rect(...pad, { kind: 'plaza', name: '', note: 'Parking pad · ' + cars + (cars > 1 ? ' cars' : ' car') }));
  });
  const homes = c.lots.length, pondAc = c.pond ? S.ringArea(c.pond) / 43560 : 0, ac = S.ringArea(plan.ring) / 43560, mix = [...new Set(c.lots.map(l => l.h.note.split(' · ')[0]))];
  const notes = [homes + ' home lots on ' + (c.k > 1 ? c.k + ' private lanes joined into loops' : 'one private lane with a turnaround') + ' (' + K.pave + ' ft pavement), about ' + (homes / ac).toFixed(1) + ' homes an acre: ' + mix.join(', ') + '.',
    'Pads ' + span(c.lots.map(l => l.front[0] === 'u' ? l.r[3] - l.r[1] : l.r[2] - l.r[0])) + ' × ' + span(c.lots.map(l => l.front[0] === 'u' ? l.r[2] - l.r[0] : l.r[3] - l.r[1])) + ' ft' + (c.Do > c.D ? ' (the rows along the property line ' + Math.round(c.Do) + ' ft deep, so the homes keep the setbacks from it)' : '') + ', each home with a parking pad, ' + (c.buf ? 'a ' + c.buf + ' ft landscape strip along the property line' : 'lots out to the property line') + '. Spacing between homes, lane widths and fire lanes need the local manufactured home or RV park rules (and the fire marshal).',
    ...(c.said || []),
    ...(c.ask && c.room > c.ask ? ['The ' + c.ask + ' homes asked for; the land holds about ' + c.room + '.'] : c.ask > c.room ? ['Room for ' + c.room + ' of the ' + c.ask + ' homes asked for.'] : []),
    ...(c.pond ? ['Detention ' + pondAc.toFixed(2) + ' ac, ' + WHERE[c.where] + '.'] : [])];
  return { name: (c.k > 1 ? c.k + ' lanes in loops' : 'One lane') + ' · ' + WHERE[c.where], elements: els, notes, program: prog, community: { kind: prog.homeKind, homes, lanes: c.k }, score: homes };
}
