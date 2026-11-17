// Several parcels as the one site a report measures (api/sitereport.js): Topography, Site Environmental and the Area
// Report work from one outline, so the parcels picked are merged the way a site plan merges them (lib/siteplan.mjs
// bridgeParcels and unionParcels): overlaps taken out, and the gaps between parcels up to 200 ft apart (a sliver between
// county lines, a ditch, a road) closed as part of the site. Parcels farther than that from the rest can't be one site:
// the biggest joined group is the site and the others come back in `left`, to be named on the page, never dropped quietly.
//   siteOutline(recs: [{ id, geom: [[lon, lat], …] (outer ring) }]) ->
//     { ring: [[lon, lat], …] (open), center: [lon, lat], lots: [ring (open), …] | [], inSite: [rec], left: [rec], areaSf, gaps }
// One parcel: its own outline, untouched (lots empty: there are no lines inside it to draw).
import { frame, bridgeParcels, unionParcels, BRIDGE_FT } from '../siteplan.mjs';
import { openRing, ringAreaFt } from './plain.mjs';

const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const boxCenter = r => { const xs = r.map(p => p[0]), ys = r.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
const NEAR_FT = 12; // a corner this close to the site's outline is on it (the outline is traced on a grid and tidied)

export function siteOutline(recs) {
  const ok = (recs || []).filter(r => openRing(r.geom || []).length >= 3);
  if (!ok.length) return null;
  const one = r => { const ring = openRing(r.geom), F = frame(boxCenter(ring)); return { ring, center: boxCenter(ring), lots: [], inSite: [r], left: ok.filter(x => x !== r), areaSf: ringAreaFt(ring.map(F.toFt)), gaps: 0 }; };
  if (ok.length === 1) return one(ok[0]);
  const geoms = ok.map(r => { const o = openRing(r.geom); return { type: 'Polygon', coordinates: [o.concat([o[0]])] }; });
  let u = null, gaps = 0;
  try { const br = bridgeParcels(geoms); gaps = br.strips.length; u = unionParcels(br.geoms); } catch (e) { u = null; }
  // no outline could be traced: the biggest parcel stands for the site and the rest are named as left out
  if (!u?.ring?.length) { const F = frame(boxCenter(openRing(ok[0].geom))), big = ok.slice().sort((a, b) => ringAreaFt(openRing(b.geom).map(F.toFt)) - ringAreaFt(openRing(a.geom).map(F.toFt)))[0]; return one(big); }
  const F = frame(u.origin), site = u.ring, onSite = p => inRing(p, site) || site.some((a, i) => segD(p, a, site[(i + 1) % site.length]) <= NEAR_FT);
  // a parcel is in the site when most of its corners lie in or on the merged outline
  const inSite = [], left = [];
  for (const r of ok) { const ft = openRing(r.geom).map(F.toFt); (ft.filter(onSite).length >= ft.length / 2 ? inSite : left).push(r); }
  const ring = site.map(F.toLL);
  return { ring, center: boxCenter(ring), lots: inSite.map(r => openRing(r.geom)), inSite, left, areaSf: ringAreaFt(site), gaps };
}

// what the page says about a site of several parcels (plain words; '' for one parcel)
export function siteNote(S) {
  if (!S || S.inSite.length + S.left.length < 2) return '';
  const n = S.inSite.length, ids = l => l.map(r => r.id).filter(x => x && x !== '—'), names = ids(S.left);
  return (n > 1 ? 'The site is ' + n + ' parcels together, measured as one outline of ' + (S.areaSf / 43560).toFixed(2) + ' acres' + (S.gaps ? ', with the ground between them (a road, a ditch or a gap between county lines, up to ' + BRIDGE_FT + ' ft) counted in' : '') + '.' : '') +
    (S.left.length ? (n > 1 ? ' ' : '') + (S.left.length === 1 ? 'One parcel' : S.left.length + ' parcels') + (names.length ? ' (' + names.join(', ') + ')' : '') + ' of the ' + (n + S.left.length) + ' picked ' + (S.left.length === 1 ? 'lies' : 'lie') + ' more than ' + BRIDGE_FT +
      ' ft from the rest and ' + (S.left.length === 1 ? 'is' : 'are') + ' not in this report: run ' + (S.left.length === 1 ? 'it' : 'them') + ' separately.' : '');
}
