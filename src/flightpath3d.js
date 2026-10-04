// The selected plane's path in real 3D (a MapLibre custom WebGL layer), for the tilted / 3D view:
//   - the path itself at the plane's altitude: a smooth sloped line a few pixels wide on screen at any zoom
//     (two crossed strips, so it reads from the side and from above),
//   - a see-through curtain from the path down to the ground, so height is easy to judge,
//   - a ball where the plane is now, at its altitude, moving every frame (left out while the 3D plane models are on).
// Positions go through MapLibre's own projectTileFor3D, so it sits correctly on the globe and on the flat map
// (elevation in metres on the globe, in mercator units flat). Nothing is rebuilt when the camera moves; the static
// path is uploaded once per change and only the short tail to the ball is refreshed each frame.
import { altColor } from './lib/flightpath.mjs';

const FT = .3048, C = 40075016.686, R = Math.PI / 180;
const VS = (s) => `#version 300 es
${s.vertexShaderPrelude}
${s.define}
in vec2 a_pos; in float a_elev; in float a_zm; in vec2 a_nrm; in float a_side; in float a_vside; in float a_mpu; in vec4 a_color;
uniform float u_hw; uniform float u_size;
out vec4 v_color;
void main() {
  vec2 p = a_pos + a_nrm * a_side * u_hw;
  float dz = a_vside * u_hw;
  #ifdef GLOBE
  gl_Position = projectTileFor3D(p, a_elev + dz * a_mpu);
  #else
  gl_Position = projectTileFor3D(p, a_zm + dz);
  #endif
  gl_PointSize = u_size;
  v_color = a_color;
}`;
const FS = `#version 300 es
precision highp float;
in vec4 v_color; uniform float u_ball; out vec4 o;
void main() {
  vec4 c = v_color;
  if (u_ball > .5) { vec2 d = gl_PointCoord * 2. - 1.; float r = length(d); if (r > 1.) discard;
    c = r > .68 ? vec4(1.) : vec4(v_color.rgb * (1.05 - .35 * r), 1.); c.a *= smoothstep(1., .9, r); }
  o = vec4(c.rgb * c.a, c.a);
}`;
const STRIDE = 13; // x y elev zm nx ny side vside mpu r g b a

export function flightPath3D(id = 'plane-path-3d') {
  let map = null, gl = null, vao = null, progs = {}, vbo = null, tbo = null, bbo = null, nMain = 0, nTail = 0, path = [], ball = null, on = false, dirty = true, noBall = false;
  const merc = (lon, lat, altM) => { const m = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], altM); return [m.x, m.y, m.z]; };
  // one strip pair per point list: curtain (ground → path), horizontal ribbon, vertical ribbon
  function build(pts) {
    const n = pts.length; if (n < 2) return { data: new Float32Array(0), n: 0 };
    const M = pts.map(([lon, lat, ft]) => merc(lon, lat, ft * FT)), out = new Float32Array(n * 6 * STRIDE);
    let o = 0;
    const put = (i, side, vside, elevM, zm, a) => {
      const [x, y] = M[i], [, lat, ft] = pts[i], prev = M[Math.max(0, i - 1)], next = M[Math.min(n - 1, i + 1)];
      let nx = -(next[1] - prev[1]), ny = next[0] - prev[0]; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      const [r, g, b] = altColor(ft);
      out.set([x, y, elevM, zm, nx, ny, side, vside, C * Math.cos(lat * R), r, g, b, a], o); o += STRIDE;
    };
    for (let i = 0; i < n; i++) { put(i, 0, 0, 0, 0, .04); put(i, 0, 0, pts[i][2] * FT, M[i][2], .30); }     // curtain
    for (let i = 0; i < n; i++) { put(i, -1, 0, pts[i][2] * FT, M[i][2], 1); put(i, 1, 0, pts[i][2] * FT, M[i][2], 1); } // flat ribbon
    for (let i = 0; i < n; i++) { put(i, 0, -1, pts[i][2] * FT, M[i][2], 1); put(i, 0, 1, pts[i][2] * FT, M[i][2], 1); } // upright ribbon
    return { data: out, n };
  }
  function program(s) {
    if (progs[s.variantName]) return progs[s.variantName];
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS(s))); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const a = {}, u = {};
    for (const k of ['a_pos', 'a_elev', 'a_zm', 'a_nrm', 'a_side', 'a_vside', 'a_mpu', 'a_color']) a[k] = gl.getAttribLocation(p, k);
    for (const k of ['u_hw', 'u_size', 'u_ball', 'u_projection_matrix', 'u_projection_fallback_matrix', 'u_projection_tile_mercator_coords', 'u_projection_clipping_plane', 'u_projection_transition']) u[k] = gl.getUniformLocation(p, k);
    return progs[s.variantName] = { p, a, u };
  }
  function attribs(P, buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); const B = 4 * STRIDE;
    const at = (k, size, off) => { const l = P.a[k]; if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, B, off * 4); };
    at('a_pos', 2, 0); at('a_elev', 1, 2); at('a_zm', 1, 3); at('a_nrm', 2, 4); at('a_side', 1, 6); at('a_vside', 1, 7); at('a_mpu', 1, 8); at('a_color', 4, 9);
  }
  function drawStrips(P, buf, n) {
    if (n < 2) return; attribs(P, buf);
    gl.uniform1f(P.u.u_ball, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 2 * n);          // curtain
    gl.drawArrays(gl.TRIANGLE_STRIP, 2 * n, 2 * n);      // flat ribbon
    gl.drawArrays(gl.TRIANGLE_STRIP, 4 * n, 2 * n);      // upright ribbon
  }
  const layer = {
    id, type: 'custom', renderingMode: '3d',
    onAdd(m, g) { map = m; gl = g; vao = gl.createVertexArray(); vbo = gl.createBuffer(); tbo = gl.createBuffer(); bbo = gl.createBuffer(); progs = {}; dirty = true; },
    onRemove() { for (const b of [vbo, tbo, bbo]) b && gl.deleteBuffer(b); vao && gl.deleteVertexArray(vao); for (const k in progs) gl.deleteProgram(progs[k].p); progs = {}; map = gl = null; },
    render(g, args) {
      if (!on || path.length < 2) return;
      const P = program(args.shaderData), d = args.defaultProjectionData;
      gl.useProgram(P.p); gl.bindVertexArray(vao); // our own vertex state: never touch MapLibre's
      gl.uniformMatrix4fv(P.u.u_projection_matrix, false, d.mainMatrix);
      if (P.u.u_projection_fallback_matrix) gl.uniformMatrix4fv(P.u.u_projection_fallback_matrix, false, d.fallbackMatrix);
      if (P.u.u_projection_tile_mercator_coords) gl.uniform4f(P.u.u_projection_tile_mercator_coords, ...d.tileMercatorCoords);
      if (P.u.u_projection_clipping_plane) gl.uniform4f(P.u.u_projection_clipping_plane, ...d.clippingPlane);
      if (P.u.u_projection_transition) gl.uniform1f(P.u.u_projection_transition, d.projectionTransition);
      gl.uniform1f(P.u.u_hw, 2.2 / (512 * 2 ** map.getZoom())); // ~4.4 px wide on screen, whatever the zoom
      gl.uniform1f(P.u.u_size, 15 * (devicePixelRatio || 1));
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (dirty) { const b = build(path); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, b.data, gl.STATIC_DRAW); nMain = b.n; dirty = false; }
      drawStrips(P, vbo, nMain);
      if (ball) {
        // the stretch from the last reported point to where the plane is drawn now, then the ball itself
        const t = build([path[path.length - 1], ball]); gl.bindBuffer(gl.ARRAY_BUFFER, tbo); gl.bufferData(gl.ARRAY_BUFFER, t.data, gl.DYNAMIC_DRAW); nTail = t.n;
        drawStrips(P, tbo, nTail);
        if (!noBall) { const bb = build([ball, ball]); gl.bindBuffer(gl.ARRAY_BUFFER, bbo); gl.bufferData(gl.ARRAY_BUFFER, bb.data, gl.DYNAMIC_DRAW);
          attribs(P, bbo); gl.uniform1f(P.u.u_ball, 1); gl.drawArrays(gl.POINTS, 3, 1); } // a top-of-curtain vertex: at the plane's altitude
      }
      gl.bindVertexArray(null);
    }
  };
  return {
    layer,
    // smoothed [[lon, lat, alt_ft]]
    setPath(pts) { path = pts || []; dirty = true; map?.triggerRepaint(); },
    // [lon, lat, alt_ft] where the plane is drawn now, or null
    setBall(b) { ball = b; if (on) map?.triggerRepaint(); },
    // the 3D plane models stand in for the ball when they're on
    hideBall(v) { if (noBall !== !!v) { noBall = !!v; if (on) map?.triggerRepaint(); } },
    show(v) { if (on !== !!v) { on = !!v; map?.triggerRepaint(); } },
    get shown() { return on; }
  };
}
