// The plan's 3D massing as a picture, without a map (RENDERINGS-PLAN.md): what the MCP site_renderings tool paints from on
// the server, where there is no browser map to photograph. The pieces are the ones the map draws in 3D (lib/siteplan.mjs
// planFeatures: the site, paving, drives, parking with its stalls, lawns, the pond, walks, buildings with their parapets
// and floor lines, trees), in the map's colours (lib/planmap.mjs), seen from the same camera presets (lib/render.mjs
// cameraFor: bearing, pitch and zoom) through a perspective like the map's (36.87° vertical field of view), on a plain
// ground. Faces are drawn far to near and lit from the south-west sun. No DOM, no network: an SVG string.
import * as S from './siteplan.mjs';
import { palette, buildingColor } from './planmap.mjs';
import { cameraFor } from './render.mjs';

const RAD = Math.PI / 180, FOV = 36.87 * RAD, NEAR = 5; // feet in front of the camera: anything nearer is clipped off
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const hex = c => { const m = /^#?([\da-f]{6})$/i.exec(String(c || '')); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [150, 150, 150]; };
const shade = (c, k) => '#' + hex(c).map(v => Math.max(0, Math.min(255, Math.round(v * k)))).map(v => v.toString(16).padStart(2, '0')).join('');

// the camera for a view, as the map would set it: its position and axes in plan feet (x east, y north, z up)
export function massingCamera(plan, view, { w = 1600, h = 900, lat = null } = {}) {
  const la = lat ?? plan.origin?.[1] ?? 29.8, cam = cameraFor(view, plan, { px: w, lat: la });
  const mpp = 40075016.686 * Math.cos(la * RAD) / (256 * 2 ** cam.zoom), focal = (h / 2) / Math.tan(FOV / 2), D = focal * mpp / 0.3048; // feet from the camera to the centre
  const b = cam.bearing * RAD, p = Math.max(0.01, cam.pitch) * RAD, d = [Math.sin(b), Math.cos(b), 0];
  const C = [cam.center[0], cam.center[1], 0], eye = [C[0] - d[0] * D * Math.sin(p), C[1] - d[1] * D * Math.sin(p), D * Math.cos(p)];
  const f = norm(sub(C, eye)), r = [Math.cos(b), -Math.sin(b), 0], u = norm(cross(r, f));
  return { eye, f, r, u, focal, w, h, view: cam.view, bearing: cam.bearing, pitch: cam.pitch };
}
const toCam = (K, P) => { const v = sub(P, K.eye); return [dot(v, K.r), dot(v, K.u), dot(v, K.f)]; };
// a polygon (camera coordinates) cut to what is in front of the near plane
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ina = a[2] >= NEAR, inb = b[2] >= NEAR;
    if (ina) out.push(a); if (ina !== inb) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); } }
  return out;
}
const toScreen = (K, q) => [K.w / 2 + q[0] / q[2] * K.focal, K.h / 2 - q[1] / q[2] * K.focal];
// the camera moved so `world` (the site and the tops of its buildings) fills most of the frame, a little below the middle
// (the website fits the site in its frame the same way before it takes the picture: src/siteplan.js fitSiteInFrame)
export function fitCamera(K, world, { fill = 0.84, low = 0.53 } = {}) {
  // centre it, move in or out to size it, and again: in a steep view the two pull on each other, so a few rounds, ending centred
  for (let it = 0; it < 9; it++) {
    const q = world.map(P => toCam(K, P)).filter(v => v[2] > NEAR); if (q.length < 3) return K;
    const s = q.map(v => toScreen(K, v)), xs = s.map(v => v[0]), ys = s.map(v => v[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const zc = q.reduce((a, v) => a + v[2], 0) / q.length, k = Math.max((x1 - x0) / (fill * K.w), (y1 - y0) / (fill * 0.92 * K.h));
    const move = it % 2 === 0 ? K.r.map((v, i) => v * ((x0 + x1) / 2 - K.w / 2) * zc / K.focal - K.u[i] * ((y0 + y1) / 2 - K.h * low) * zc / K.focal) : K.f.map(v => v * zc * (1 - k) * 0.85);
    K = { ...K, eye: K.eye.map((v, i) => v + move[i]) };
    if (K.eye[2] < 30) K.eye[2] = 30; // never under the roofs
  }
  return K;
}
const pts = (K, poly) => clipNear(poly.map(P => toCam(K, P))).map(q => toScreen(K, q).map(v => v.toFixed(1)).join(',')).join(' ');

// the flat pieces, bottom to top, with their colours; lines drawn over them; and the solids
const FLAT = ['lot', 'yard', 'green', 'paved', 'island', 'parking', 'drive', 'walk', 'patio', 'plaza', 'court', 'courtarea', 'play', 'pond', 'pool', 'canopy', 'tanks', 'ada', 'keepout'];
const SOLID = ['building', 'garage', 'b3', 'sign', 'tree', 'c3', 'ftbody', 'pedestal'];
const LINES = ['stall', 'mark'];
const SUN = norm([-0.55, -0.6, 0.58]); // from the south-west, high: the light's direction toward the sun

// the massing picture: an SVG w x h. surround 'none': a plain grey ground; else a soft green-grey one (the image model
// replaces it with believable surroundings)
export function massingSVG(plan, view = 'corner', { w = 1600, h = 900, surround = 'typical' } = {}) {
  const F = S.frame(plan.origin), P = palette(), C = P.col, Ln = P.lines;
  const feats = S.planFeatures(plan).features, ft = ring => ring.map(F.toFt), outer = g => g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(c => c[0]) : [];
  const world = (plan.ring || []).map(([x, y]) => [x, y, 0]);
  for (const x of feats.filter(y => y.properties.k === 'building')) for (const r of outer(x.geometry)) for (const [a, b] of ft(r)) world.push([a, b, +x.properties.h || 10]);
  const K = fitCamera(massingCamera(plan, view, { w, h }), world);
  const out = [];
  // the sky (where the view looks up past the horizon) and the ground
  const hz = K.h / 2 - (dot([Math.sin(K.bearing * RAD), Math.cos(K.bearing * RAD), 0], K.u) / Math.max(1e-6, dot([Math.sin(K.bearing * RAD), Math.cos(K.bearing * RAD), 0], K.f))) * K.focal;
  const ground = surround === 'none' ? '#d9dad6' : '#c9d3bd';
  out.push('<rect width="' + w + '" height="' + h + '" fill="' + ground + '"/>');
  if (K.pitch > 1 && hz > 0) out.push('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc0de"/><stop offset="1" stop-color="#e3ecf2"/></linearGradient></defs><rect width="' + w + '" height="' + Math.min(h, hz).toFixed(1) + '" fill="' + (surround === 'none' ? '#e9eaea' : 'url(#sky)') + '"/>');
  // flat pieces
  const colorOf = p => p.k === 'lot' ? (p.site ? C.lawn : Ln.yard) : p.k === 'paved' || p.k === 'parking' ? C.parking : p.k === 'drive' ? C.drive : p.k === 'walk' ? Ln.walk : p.k === 'island' ? C.green : p.k === 'ada' ? '#2f6db5' : p.k === 'keepout' ? Ln.keepout : p.k === 'courtarea' || p.k === 'court' && p.c ? p.c : C[p.k] || C.green;
  for (const k of FLAT) for (const x of feats.filter(y => y.properties.k === k)) for (const ring of outer(x.geometry)) {
    const s = pts(K, ft(ring).map(([a, b]) => [a, b, 0])); if (s) out.push('<polygon points="' + s + '" fill="' + colorOf(x.properties) + '"' + (k === 'lot' && !x.properties.site ? ' fill-opacity=".9"' : '') + '/>'); }
  for (const x of feats.filter(y => LINES.includes(y.properties.k) && y.geometry.type === 'LineString')) {
    const q = clipNear(ft(x.geometry.coordinates).map(([a, b]) => toCam(K, [a, b, 0.2])).concat([])); // (a line: clipping it as a thin polygon is close enough)
    if (q.length > 1) out.push('<polyline points="' + q.map(v => toScreen(K, v).map(n => n.toFixed(1)).join(',')).join(' ') + '" fill="none" stroke="' + (x.properties.c || Ln.stall || '#f4f4f0') + '" stroke-width="' + (x.properties.k === 'stall' ? 1 : 1.5) + '"/>'); }
  // solids: every face of every extruded piece, far to near
  const faces = [];
  for (const x of feats.filter(y => SOLID.includes(y.properties.k))) {
    const p = x.properties, base = +p.b || 0, top = Math.max(base + 0.5, +p.h || (p.k === 'building' ? 10 : 2));
    const col = p.k === 'building' || p.k === 'garage' ? buildingColor(P, p.use, { ph: p.ph, garage: p.k === 'garage' }) : p.k === 'b3' ? (p.part === 'tower' ? buildingColor(P, p.use, { ph: p.ph }) : p.part === 'parapet' ? (p.g ? '#8b9092' : '#6d635a') : (p.g ? '#6f7476' : '#4f453c')) : p.c || C[p.k] || '#8b8073';
    for (const ring0 of outer(x.geometry)) {
      let ring = ft(ring0); if (ring.length > 3 && Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < 0.01) ring = ring.slice(0, -1);
      const area = ring.reduce((s, q, i) => s + q[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * q[1], 0), ccw = area > 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b2 = ring[(i + 1) % ring.length], n = norm(ccw ? [b2[1] - a[1], -(b2[0] - a[0]), 0] : [-(b2[1] - a[1]), b2[0] - a[0], 0]);
        const mid = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, (base + top) / 2]; if (dot(n, sub(K.eye, mid)) <= 0) continue; // faces away
        const quad = [[a[0], a[1], base], [b2[0], b2[1], base], [b2[0], b2[1], top], [a[0], a[1], top]];
        faces.push({ poly: quad, depth: toCam(K, mid)[2], fill: shade(col, 0.62 + 0.38 * Math.max(0, dot(n, SUN))) }); }
      const c = ring.reduce((s, q) => [s[0] + q[0] / ring.length, s[1] + q[1] / ring.length], [0, 0]);
      if (K.eye[2] > top) faces.push({ poly: ring.map(([a, b2]) => [a, b2, top]), depth: toCam(K, [c[0], c[1], top])[2] - 0.01, fill: shade(col, 1.08) });
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const fc of faces) { const s = pts(K, fc.poly); if (s) out.push('<polygon points="' + s + '" fill="' + fc.fill + '" stroke="' + shade(fc.fill, 0.8) + '" stroke-width=".6" stroke-linejoin="round"/>'); }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + out.join('') + '</svg>';
}
