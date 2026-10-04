// Live planes as 3D models for the tilted / 3D view (a MapLibre custom WebGL layer; the flat view keeps the icons).
//   - one low-poly model per kind of aircraft (lib/aircraft-meshes.mjs), at the plane's altitude, pointing along its track,
//     nose up or down with its climb rate and banking into turns; coloured like the icons (altitude bands)
//   - true size close in, about icon size on screen when zoomed out, so they stay easy to see and click
//   - a thin line from each plane down to the ground (the icon underneath becomes its grey shadow), for judging height
// Drawn with instancing: one draw per kind of aircraft, the per-plane data refreshed each frame. Positions go through the
// same projection maths as MapLibre's own shaders (globe and flat map), and pick() repeats it to find the plane under
// the pointer.
import { meshFor, MESH_SHAPES, modelSize } from './lib/aircraft-meshes.mjs';

const FT = .3048, C = 40075016.686, R = Math.PI / 180, GLOBE_R = 6371008.8;
const IN = 12; // per instance: mercX mercY alt_m mpu heading pitch bank size r g b lift (share of size to raise it off the ground)
const VS = (s) => `#version 300 es
${s.vertexShaderPrelude}
${s.define}
in vec3 a_pos; in vec3 a_nrm;
in vec2 i_merc; in float i_alt; in float i_mpu; in vec3 i_rot; in float i_size; in vec3 i_color; in float i_lift;
uniform float u_line; uniform vec3 u_light;
out vec3 v_color; out float v_a;
vec4 place(vec2 p, float e, float mpu) {
  #ifdef GLOBE
  vec3 sp = projectToSphere(p, p);
  vec4 g = u_projection_matrix * vec4(sp * (1.0 + e / GLOBE_RADIUS), 1.0);
  if (u_projection_transition > 0.999) return g;
  return mix(u_projection_fallback_matrix * vec4(p, e / mpu, 1.0), g, u_projection_transition);
  #else
  return u_projection_matrix * vec4(p, e / mpu, 1.0);
  #endif
}
void main() {
  if (u_line > .5) { // the line to the ground: a_pos.z is 1 at the plane, 0 on the ground
    gl_Position = place(i_merc, i_alt * a_pos.z, i_mpu); v_color = i_color; v_a = .55; return;
  }
  float h = i_rot.x, p = i_rot.y, b = i_rot.z;
  // bank about the nose axis, then pitch about the wing axis, then heading (clockwise from north)
  mat3 B = mat3(cos(b), 0., -sin(b),  0., 1., 0.,  sin(b), 0., cos(b));
  mat3 P = mat3(1., 0., 0.,  0., cos(p), sin(p),  0., -sin(p), cos(p));
  mat3 H = mat3(cos(h), -sin(h), 0.,  sin(h), cos(h), 0.,  0., 0., 1.);
  mat3 M = H * P * B;
  vec3 w = M * a_pos * i_size, n = normalize(M * a_nrm);
  gl_Position = place(i_merc + vec2(w.x, -w.y) / i_mpu, i_alt + i_lift * i_size + w.z, i_mpu);
  float d = abs(dot(n, u_light)), top = max(n.z, 0.);
  v_color = i_color * (.42 + .5 * d) + .14 * top; v_a = 1.;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 v_color; in float v_a; out vec4 o;
void main() { o = vec4(v_color * v_a, v_a); }`;

const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const clamp = (v, a) => Math.max(-a, Math.min(a, v));

export function planes3D({ bands, id = 'live-planes-3d' } = {}) {
  let map = null, gl = null, vao = null, progs = {}, meshBuf = {}, lineBuf = null, instBuf = null, on = false, planes = [], last = null;
  const att = new Map(); // hex -> { track, t, bank } for the bank angle
  function program(s) {
    if (progs[s.variantName]) return progs[s.variantName];
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS(s))); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const a = {}, u = {};
    for (const k of ['a_pos', 'a_nrm', 'i_merc', 'i_alt', 'i_mpu', 'i_rot', 'i_size', 'i_color', 'i_lift']) a[k] = gl.getAttribLocation(p, k);
    for (const k of ['u_line', 'u_light', 'u_projection_matrix', 'u_projection_fallback_matrix', 'u_projection_tile_mercator_coords', 'u_projection_clipping_plane', 'u_projection_transition']) u[k] = gl.getUniformLocation(p, k);
    return progs[s.variantName] = { p, a, u };
  }
  function meshVbo(shape) {
    if (meshBuf[shape]) return meshBuf[shape];
    const m = meshFor(shape), data = new Float32Array(m.count * 6);
    for (let i = 0; i < m.count; i++) data.set([m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2], m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]], i * 6);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return meshBuf[shape] = { b, n: m.count };
  }
  function vertexAttribs(P, buf, stride) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (const [k, size, off] of [['a_pos', 3, 0], ['a_nrm', 3, 3]]) { const l = P.a[k]; if (l < 0) continue; if (k === 'a_nrm' && stride < 6) { gl.disableVertexAttribArray(l); gl.vertexAttrib3f(l, 0, 0, 1); continue; }
      gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4); gl.vertexAttribDivisor(l, 0); }
  }
  function instanceAttribs(P, firstInstance) {
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); const B = IN * 4, base = firstInstance * B;
    for (const [k, size, off] of [['i_merc', 2, 0], ['i_alt', 1, 2], ['i_mpu', 1, 3], ['i_rot', 3, 4], ['i_size', 1, 7], ['i_color', 3, 8], ['i_lift', 1, 11]]) {
      const l = P.a[k]; if (l < 0) continue; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, B, base + off * 4); gl.vertexAttribDivisor(l, 1);
    }
  }
  // attitude, once per position update (not per repaint): bank from the rate of turn (eased), nose from the climb rate
  function attitude(list) {
    const now = performance.now(), keep = new Set();
    for (const p of list) {
      keep.add(p.hex); const prev = att.get(p.hex), v = Math.max(0, p.gs || 0) * .5144;
      let bank = 0;
      if (prev && !p.ground) { const dt = (now - prev.t) / 1000;
        if (dt < .01) bank = prev.bank; else { const w = ((p.track - prev.track + 540) % 360 - 180) * R / dt, want = clamp(Math.atan(v * w / 9.81), 30 * R); bank = prev.bank + (want - prev.bank) * Math.min(1, dt * 1.5); } }
      att.set(p.hex, { track: p.track, t: now, bank });
      p.bank = bank; p.pitch = p.ground || !v ? 0 : clamp(Math.atan(((p.vs || 0) * .00508) / Math.max(v, 30)), 15 * R);
    }
    for (const k of [...att.keys()]) if (!keep.has(k)) att.delete(k);
  }
  // per-plane instance data, grouped by shape, written into one reused buffer; rebuilt only when the planes moved or the
  // zoom changed (MapLibre repaints far more often than either). Also kept for pick().
  let built = null, buf = new Float32Array(0), version = 0, builtVersion = -1, builtZoom = -1;
  const colors = bands.map(([, c]) => hex2rgb(c)), bandOf = alt => { let k = 0; for (let i = 1; i < bands.length; i++) if (alt >= bands[i - 1][0]) k = i; return k; };
  function instances() {
    const z = map.getZoom(); if (built && builtVersion === version && Math.abs(z - builtZoom) < .01) return built;
    const n = planes.length; if (buf.length < n * IN) buf = new Float32Array(Math.ceil(n * 1.3) * IN);
    const byShape = new Map(); for (const p of planes) { const sh = MESH_SHAPES.includes(p.shape) ? p.shape : 'jet'; (byShape.get(sh) || byShape.set(sh, []).get(sh)).push(p); }
    const order = [], hexes = new Array(n), k2 = 512 * 2 ** z; let o = 0, idx = 0;
    for (const [shape, list] of byShape) {
      order.push([shape, idx, list.length]);
      for (const p of list) {
        const lat = Math.max(-85, Math.min(85, p.lat)), s = Math.sin(lat * R), mpu = C * Math.cos(lat * R);
        const altM = p.ground ? 0 : Math.max(0, p.alt || 0) * FT, size = modelSize(shape, p.sz, mpu / k2), col = colors[bandOf(p.ground ? 0 : p.alt || 0)];
        buf[o] = (p.lon + 180) / 360; buf[o + 1] = .5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); // Web Mercator, as MercatorCoordinate
        buf[o + 2] = altM; buf[o + 3] = mpu; buf[o + 4] = p.track * R; buf[o + 5] = p.pitch || 0; buf[o + 6] = p.bank || 0; buf[o + 7] = size;
        buf[o + 8] = col[0]; buf[o + 9] = col[1]; buf[o + 10] = col[2]; buf[o + 11] = shape === 'balloon' ? 0 : Math.max(0, .12 - altM / size); // wheels on the ground, never below it
        hexes[idx++] = p.hex; o += IN;
      }
    }
    builtVersion = version; builtZoom = z; built = { order, hexes, n, data: buf.subarray(0, n * IN), fresh: true };
    return built;
  }
  const layer = {
    id, type: 'custom', renderingMode: '3d',
    onAdd(m, g) { map = m; gl = g; built = null; vao = gl.createVertexArray(); instBuf = gl.createBuffer(); lineBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 0]), gl.STATIC_DRAW); progs = {}; meshBuf = {}; },
    onRemove() { for (const b of [instBuf, lineBuf, ...Object.values(meshBuf).map(x => x.b)]) b && gl.deleteBuffer(b); vao && gl.deleteVertexArray(vao); for (const k in progs) gl.deleteProgram(progs[k].p); progs = {}; meshBuf = {}; map = gl = null; last = null; },
    render(g, args) {
      if (!on || !planes.length) { last = null; return; }
      const P = program(args.shaderData), d = args.defaultProjectionData;
      gl.useProgram(P.p); gl.bindVertexArray(vao); // our own vertex state: never touch MapLibre's
      gl.uniformMatrix4fv(P.u.u_projection_matrix, false, d.mainMatrix);
      if (P.u.u_projection_fallback_matrix) gl.uniformMatrix4fv(P.u.u_projection_fallback_matrix, false, d.fallbackMatrix);
      if (P.u.u_projection_tile_mercator_coords) gl.uniform4f(P.u.u_projection_tile_mercator_coords, ...d.tileMercatorCoords);
      if (P.u.u_projection_clipping_plane) gl.uniform4f(P.u.u_projection_clipping_plane, ...d.clippingPlane);
      if (P.u.u_projection_transition) gl.uniform1f(P.u.u_projection_transition, d.projectionTransition);
      const L = [.35, -.45, .82], l = Math.hypot(...L); gl.uniform3f(P.u.u_light, L[0] / l, L[1] / l, L[2] / l);
      const B = instances(), { order, data } = B;
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); if (B.fresh) { gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); B.fresh = false; }
      gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // lines to the ground first (no depth, see-through), when there aren't so many they turn into a fence
      if (planes.length <= 250) {
        gl.disable(gl.DEPTH_TEST); gl.uniform1f(P.u.u_line, 1); vertexAttribs(P, lineBuf, 3); instanceAttribs(P, 0);
        gl.drawArraysInstanced(gl.LINES, 0, 2, planes.length);
      }
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.uniform1f(P.u.u_line, 0);
      for (const [shape, first, n] of order) { const mb = meshVbo(shape); vertexAttribs(P, mb.b, 6); instanceAttribs(P, first); gl.drawArraysInstanced(gl.TRIANGLES, 0, mb.n, n); }
      for (const k of Object.values(P.a)) if (k >= 0) gl.vertexAttribDivisor(k, 0);
      gl.bindVertexArray(null);
      last = { data, hexes: B.hexes, d: { ...d, globe: /globe/i.test(args.shaderData.variantName) } };
    }
  };
  // screen point [x, y] (CSS px) of a 3D position, with the projection the last frame used
  function project(mx, my, elev, mpu) {
    const d = last.d, M = (m, v) => [0, 1, 2, 3].map(r => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
    let c;
    if (d.globe) {
      const t = d.tileMercatorCoords, px = t[0] + t[2] * mx, py = t[1] + t[3] * my, lon = px * Math.PI * 2 + Math.PI, lat = 2 * Math.atan(Math.exp(Math.PI - py * Math.PI * 2)) - Math.PI / 2, k = 1 + elev / GLOBE_R;
      c = M(d.mainMatrix, [Math.sin(lon) * Math.cos(lat) * k, Math.sin(lat) * k, Math.cos(lon) * Math.cos(lat) * k, 1]);
      if (d.projectionTransition <= .999) { const f = M(d.fallbackMatrix, [mx, my, elev / mpu, 1]), a = d.projectionTransition; c = c.map((v, i) => f[i] + (v - f[i]) * a); }
    } else c = M(d.mainMatrix, [mx, my, elev / mpu, 1]);
    if (!(c[3] > 0)) return null;
    const cv = map.getCanvas(); return [(c[0] / c[3] + 1) / 2 * cv.clientWidth, (1 - c[1] / c[3]) / 2 * cv.clientHeight];
  }
  return {
    layer,
    // [{ hex, shape, sz, lon, lat, alt (ft), track, gs, vs, ground }] where each plane is drawn now
    setPlanes(list) { planes = list || []; attitude(planes); version++; if (on) map?.triggerRepaint(); },
    show(v) { if (on !== !!v) { on = !!v; if (!on) last = null; map?.triggerRepaint(); } },
    get shown() { return on; },
    // the plane whose model is under (or within a few pixels of) a screen point, nearest first
    pick(pt, slop = 8) {
      if (!on || !last || !map) return null; const { data, hexes } = last, mpp = 1 / (512 * 2 ** map.getZoom());
      let best = null, bd = Infinity;
      for (let i = 0; i < hexes.length; i++) {
        const o = i * IN, s = project(data[o], data[o + 1], data[o + 2] + data[o + 11] * data[o + 7], data[o + 3]); if (!s) continue;
        const r = slop + .45 * data[o + 7] / (data[o + 3] * mpp), dd = Math.hypot(s[0] - pt.x, s[1] - pt.y);
        if (dd < Math.max(r, 14) && dd < bd) { bd = dd; best = hexes[i]; }
      }
      return best;
    }
  };
}
