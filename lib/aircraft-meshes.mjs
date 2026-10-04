// Low-poly 3D aircraft for the tilted map (src/planes3d.js): one mesh per shape in lib/aircraft-shapes.mjs, built from
// the same numbers as the flat icons in src/planes.js (a 64-unit box, nose up), so a plane looks the same from above in
// 2D and 3D. Model space: x to the right wing, y to the nose, z up; 1 = the icon box. Flat-shaded triangles, no indices:
//   meshFor(shape) -> { positions: Float32Array [x y z …], normals: Float32Array [x y z …], count: vertices }
// REAL_M is the size of the box in metres for each shape (about the length of a typical aircraft of that kind).
export const REAL_M = { heavy4: 72, heavy2: 66, jet: 40, military: 50, regional: 31, bizjet: 22, fighter: 17, turboprop2: 25, turboprop1: 12, twin: 11, single: 9, heli: 14, glider: 15, balloon: 22, drone: 2, ground: 9 };

const U = 1 / 64; // icon units → model units
function builder() {
  const P = [], N = [];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
    if (!(l > 1e-12)) return; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { P.push(p[0], p[1], p[2]); N.push(nx, ny, nz); }
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  // icon coordinates (x right of centre, y down from the top = toward the tail) → model
  const m = (x, y, z) => [(x - 32) * U, (32 - y) * U, z * U];
  const g = {
    tri, quad, m,
    // a body of revolution along y: stations [[yIcon, radius, zCentre]], `seg` sides, closed at both ends
    loft(st, seg = 8, cx = 32, flatten = 1) {
      const rings = st.map(([y, r, zc]) => Array.from({ length: seg }, (_, i) => { const a = i / seg * Math.PI * 2; return m(cx + Math.sin(a) * r, y, zc + Math.cos(a) * r * flatten); }));
      for (let s = 0; s < rings.length - 1; s++) for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; quad(rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i]); }
      const cap = (k) => { const c = m(cx, st[k][0], st[k][2]); for (let i = 0; i < seg; i++) tri(c, rings[k][i], rings[k][(i + 1) % seg]); };
      if (st[0][1] > 0) cap(0); if (st[st.length - 1][1] > 0) cap(st.length - 1);
    },
    // a flat prism between an outline (icon x, y) at height z and the same outline `t` lower
    slab(pts, z, t) {
      const top = pts.map(([x, y]) => m(x, y, z)), bot = pts.map(([x, y]) => m(x, y, z - t)), n = pts.length;
      for (let i = 1; i < n - 1; i++) { tri(top[0], top[i], top[i + 1]); tri(bot[0], bot[i + 1], bot[i]); }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(top[i], top[j], bot[j], bot[i]); }
    },
    // a vertical fin in the x = cx plane: root chord y0..y1 at z0, tip chord y2..y3 at z1, thickness t
    fin(y0, y1, z0, y2, y3, z1, t = .8, cx = 32) {
      const s = [[y0, z0], [y1, z0], [y3, z1], [y2, z1]];
      const L = s.map(([y, z]) => m(cx - t / 2, y, z)), R = s.map(([y, z]) => m(cx + t / 2, y, z));
      quad(L[0], L[1], L[2], L[3]); quad(R[3], R[2], R[1], R[0]);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(L[i], R[i], R[j], L[j]); }
    },
    box(x0, x1, y0, y1, z0, z1) {
      const c = (x, y, z) => m(x, y, z), p = [c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0), c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)];
      quad(p[0], p[3], p[2], p[1]); quad(p[4], p[5], p[6], p[7]); quad(p[0], p[1], p[5], p[4]); quad(p[1], p[2], p[6], p[5]); quad(p[2], p[3], p[7], p[6]); quad(p[3], p[0], p[4], p[7]);
    },
    sphere(cx, cy, cz, r, seg = 10, rings = 6) {
      const pt = (i, k) => { const th = k / rings * Math.PI, ph = i / seg * Math.PI * 2; return m(cx + Math.sin(th) * Math.cos(ph) * r, cy + Math.sin(th) * Math.sin(ph) * r, cz + Math.cos(th) * r); };
      for (let k = 0; k < rings; k++) for (let i = 0; i < seg; i++) quad(pt(i, k), pt(i + 1, k), pt(i + 1, k + 1), pt(i, k + 1));
    },
    done: () => ({ positions: new Float32Array(P), normals: new Float32Array(N), count: P.length / 3 })
  };
  return g;
}

// parts, in the icon's terms (see shapeImage in src/planes.js)
function airliner(g, o) {
  const { y0, y1, w, wing, tail, pods = [], z = 0, high = false, tTail = false, props = [] } = o, r = w / 2;
  // fuselage: rounded nose, straight barrel, tail cone sweeping up
  const len = y1 - y0;
  g.loft([[y0, 0, z], [y0 + r * .5, r * .62, z], [y0 + r * 1.6, r * .95, z], [y0 + r * 2.6, r, z], [y1 - len * .28, r, z], [y1 - len * .1, r * .62, z + r * .3], [y1, r * .18, z + r * .62]], 10);
  // wings: [y, root, span, sweep, tip, half] exactly as the icon draws them
  const wz = high ? z + r * .85 : z - r * .45, t = Math.max(.7, r * .22);
  const planform = (k, [y, root, span, sweep, tip, half = 2.5]) => k > 0
    ? [[32 + half, y], [32 + span / 2, y + sweep], [32 + span / 2, y + sweep + tip], [32 + half, y + root]]
    : [[32 - half, y], [32 - half, y + root], [32 - span / 2, y + sweep + tip], [32 - span / 2, y + sweep]];
  for (const k of [-1, 1]) g.slab(planform(k, wing), wz + t / 2, t);
  // fin: rooted over the tailplane, about a third of the tailplane's span tall, swept back
  const [ty, troot, tspan] = tail, fh = Math.max(5, tspan * .36), fy0 = ty - troot * .5, fy1 = Math.min(y1, ty + troot + 1);
  g.fin(fy0, fy1, z + r * .4, fy0 + (fy1 - fy0) * .55, fy1 + 1, z + r * .4 + fh, Math.max(.7, r * .2));
  const tz = tTail ? z + r * .4 + fh : z + r * .35, tt = Math.max(.5, r * .16);
  for (const k of [-1, 1]) g.slab(planform(k, tail), tz + tt / 2, tt);
  // engines: [dx, y, len, w]; under the wing, or on the rear fuselage for regional and business jets
  for (const [dx, y, l, pw, rear] of pods) for (const k of dx ? [-1, 1] : [0]) {
    const pr = pw / 2, cz = rear ? z + r * .35 : high ? wz - pr * .6 : wz - t - pr * .75;
    g.loft([[y, pr * .85, cz], [y + l * .2, pr, cz], [y + l * .85, pr * .9, cz], [y + l, pr * .55, cz]], 8, 32 + k * dx);
  }
  // propellers: a thin cross in front of each engine (or the nose)
  for (const [dx, y, d] of props) for (const k of dx ? [-1, 1] : [0]) {
    const cx = 32 + k * dx, cz = dx ? (high ? wz - 1.2 : wz - t - 1.2) : z;
    g.box(cx - d / 2, cx + d / 2, y - .25, y + .25, cz - .45, cz + .45); g.box(cx - .45, cx + .45, y - .25, y + .25, cz - d / 2, cz + d / 2);
  }
}

const BUILD = {
  heavy4: g => airliner(g, { y0: 1, y1: 62, w: 8, wing: [21, 17, 62, 18, 5, 3.5], tail: [51, 9, 26, 7, 3, 3], pods: [[13, 23, 9, 4.5], [22, 29, 8, 4]] }),
  heavy2: g => airliner(g, { y0: 1, y1: 62, w: 8, wing: [21, 16, 62, 17, 5, 3.5], tail: [51, 9, 26, 7, 3, 3], pods: [[15, 23, 11, 5.5]] }),
  jet: g => airliner(g, { y0: 2, y1: 61, w: 6, wing: [24, 13, 56, 13, 4, 3], tail: [51, 8, 22, 6, 3, 3], pods: [[12, 23, 9, 4]] }),
  regional: g => airliner(g, { y0: 3, y1: 61, w: 5.5, wing: [27, 11, 46, 9, 4], tail: [54, 7, 20, 5, 3], tTail: true, pods: [[5.4, 40, 10, 4, true]] }),
  bizjet: g => airliner(g, { y0: 6, y1: 58, w: 5, wing: [28, 10, 40, 9, 3], tail: [51, 6, 18, 5, 2.5], tTail: true, pods: [[5, 39, 8, 3.6, true]] }),
  military: g => airliner(g, { y0: 2, y1: 60, w: 7.5, wing: [20, 12, 60, 5, 6, 3.5], tail: [54, 7, 26, 3, 4], high: true, tTail: true, pods: [[12, 14, 11, 4], [21, 16, 10, 3.6]] }),
  fighter: g => airliner(g, { y0: 1, y1: 62, w: 5, wing: [20, 28, 36, 22, 4], tail: [50, 10, 22, 7, 3] }),
  turboprop2: g => airliner(g, { y0: 6, y1: 60, w: 5, wing: [22, 9, 56, 0, 6], tail: [52, 7, 20, 1, 5], high: true, tTail: true, pods: [[11, 15, 15, 4]], props: [[11, 13.5, 12]] }),
  turboprop1: g => airliner(g, { y0: 5, y1: 58, w: 5, wing: [20, 9, 50, 0, 6], tail: [50, 7, 18, 1, 5], props: [[0, 4, 14]] }),
  twin: g => airliner(g, { y0: 9, y1: 56, w: 4.5, wing: [24, 8, 46, 0, 6], tail: [48, 6, 16, 0, 5], pods: [[9, 19, 11, 3.5]], props: [[9, 17.5, 10]] }),
  single: g => airliner(g, { y0: 7, y1: 57, w: 4.5, wing: [19, 8, 50, 0, 7], tail: [49, 7, 18, 0, 5], high: true, props: [[0, 6, 12]] }),
  glider: g => airliner(g, { y0: 12, y1: 58, w: 3, wing: [22, 5, 62, 0, 3, 1.5], tail: [54, 4, 16, 0, 3, 1.5], high: true, tTail: true }),
  heli(g) {
    g.loft([[14, 0, 0], [16, 4.5, 0], [20, 6.5, .5], [28, 6.2, .5], [33, 3, 1.5], [34, 1.6, 2]], 10);
    g.box(30.7, 33.3, 32, 57, .6, 3.2); g.box(27, 37, 53, 55.6, 1.4, 2.2); g.fin(52, 57, 2, 54, 57.5, 8, .6); // boom, tailplane, fin
    g.box(31.4, 32.6, 22, 26, 6.2, 8.2); // mast
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const c = Math.cos(a) * 28, s = Math.sin(a) * 28, w = 1.8 / 28;
      g.quad(g.m(32 - c - s * w, 24 - s + c * w, 8.4), g.m(32 + c - s * w, 24 + s + c * w, 8.4), g.m(32 + c + s * w, 24 + s - c * w, 8.4), g.m(32 - c + s * w, 24 - s - c * w, 8.4)); }
  },
  balloon(g) { g.sphere(32, 32, 30, 15, 12, 8); g.box(28, 36, 28, 36, 0, 6); for (const [dx, dy] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) g.box(32 + dx - .3, 32 + dx + .3, 32 + dy - .3, 32 + dy + .3, 6, 16); },
  drone(g) {
    g.box(26, 38, 26, 38, -1.5, 2);
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const c = Math.cos(a) * 21, s = Math.sin(a) * 21, w = 1.7 / 21;
      g.slab([[32 - c - s * w, 32 - s + c * w], [32 + c - s * w, 32 + s + c * w], [32 + c + s * w, 32 + s - c * w], [32 - c + s * w, 32 - s - c * w]], 1, 1.5); }
    for (const [dx, dy] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) g.loft([[32 + dy - .01, 6, 2.2], [32 + dy + .01, 6, 2.2]], 12, 32 + dx, .001);
  },
  ground(g) { g.box(24, 40, 18, 46, 0, 9); g.box(25, 39, 20, 30, 9, 14); }
};

const cache = new Map();
export function meshFor(shape) {
  const k = BUILD[shape] ? shape : 'jet';
  if (!cache.has(k)) { const g = builder(); BUILD[k](g); cache.set(k, g.done()); }
  return cache.get(k);
}
export const MESH_SHAPES = Object.keys(BUILD);

// metres the model is drawn at: true size close in, never smaller on screen than about the flat icon (`px` pixels × the
// shape's icon scale), so planes stay visible and clickable when zoomed out. mpp = metres per screen pixel.
export function modelSize(shape, iconScale, mpp, px = 30) { return Math.max(REAL_M[shape] || REAL_M.jet, px * (iconScale || 1) * mpp); }
