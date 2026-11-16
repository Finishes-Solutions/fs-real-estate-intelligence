#!/usr/bin/env node
// Turn an inspected drawing geometry candidate or a confirmed sketch trace into the
// local-feet site.json consumed by layout.mjs. This command never guesses the site edge.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as S from './engine/siteplan.mjs';

const argv = process.argv.slice(2), command = argv[0];
const value = key => {
  const i = argv.indexOf('--' + key);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};
const values = key => argv.flatMap((v, i) => v === '--' + key && i + 1 < argv.length ? [argv[i + 1]] : []);
const fail = message => { console.error('Error: ' + message); process.exit(2); };
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const output = () => value('out') || fail('give --out site.json');
const positive = (v, name) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) fail(name + ' must be a positive number.');
  return n;
};
const parseEdges = raw => raw ? raw.split(',').map(Number) : [];
function checkedEdges(ring, edges) {
  if (edges.some(edge => !Number.isInteger(edge) || edge < 0 || edge >= ring.length)) fail('street edges must be valid boundary edge indexes.');
  return [...new Set(edges)];
}

function cleanRing(points, label) {
  if (!Array.isArray(points)) fail(label + ' must be an array of points.');
  const ring = [];
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(+point[0]) || !Number.isFinite(+point[1])) fail(label + ' contains an invalid point.');
    const p = [+point[0], +point[1]];
    if (!ring.length || Math.hypot(p[0] - ring.at(-1)[0], p[1] - ring.at(-1)[1]) > 1e-7) ring.push(p);
  }
  if (ring.length > 3 && Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) <= 1e-7) ring.pop();
  if (ring.length < 3) fail(label + ' needs at least three distinct corners.');
  if (S.ringArea(ring) < 1) fail(label + ' has no usable area.');
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      if (S.segsCross(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) {
        fail(label + ' crosses itself; correct the trace before making a layout.');
      }
    }
  }
  return ring;
}

function transformFor(ring, scale = 1, flipY = false) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return ([x, y]) => [+((x - x0) * scale).toFixed(2), +((flipY ? y1 - y : y - y0) * scale).toFixed(2)];
}

function checkedFront(ring, front) {
  const edge = front == null ? null : Number(front);
  if (!Number.isInteger(edge) || edge < 0 || edge >= ring.length) fail('choose --front N after reviewing the boundary preview (edge 0 to ' + (ring.length - 1) + ').');
  return edge;
}

function edgeReport(ring) {
  return ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return i + ':' + Math.round(Math.hypot(q[0] - p[0], q[1] - p[1])) + 'ft';
  }).join(' ');
}

function writePreview(site, file) {
  const all = [...site.ring, ...(site.exclusions || []).flatMap(e => e.ring)];
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1), pad = Math.max(w, h) * 0.08;
  const width = 900, height = 650, scale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
  const point = ([x, y]) => [pad + (x - minX) * scale, height - pad - (y - minY) * scale];
  const poly = r => r.map((p, i) => (i ? 'L' : 'M') + point(p).map(n => n.toFixed(1)).join(',')).join(' ') + ' Z';
  const edgeLabels = site.ring.map((p, i) => {
    const q = site.ring[(i + 1) % site.ring.length], mid = point([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
    return `<text x="${mid[0]}" y="${mid[1]}" text-anchor="middle" font-size="16" fill="#17344a">${i}${i === site.front ? ' FRONT' : ''}</text>`;
  }).join('');
  const exclusions = (site.exclusions || []).map(e => `<path d="${poly(e.ring)}" fill="#eaa54b" fill-opacity=".4" stroke="#b65c19" stroke-width="2"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><path d="${poly(site.ring)}" fill="#dbeaf2" stroke="#087e8b" stroke-width="4"/>${exclusions}${edgeLabels}<text x="20" y="30" font-size="18" fill="#123">Boundary: ${site.acres} ac • confirm edge ${site.front} as the main frontage</text></svg>`;
  fs.writeFileSync(file, svg);
}

function finish(site) {
  const out = output();
  fs.writeFileSync(out, JSON.stringify(site, null, 2) + '\n');
  const preview = value('preview') || out.replace(/\.json$/i, '') + '-review.svg';
  writePreview(site, preview);
  console.log(`Site: ${site.ring.length} corners, ${site.acres.toFixed(3)} acres; front edge ${site.front}; edges: ${edgeReport(site.ring)}`);
  console.log(`Source: ${site.boundary_source}`);
  console.log(`Scale basis: ${site.scale_basis}`);
  console.log(`Review the outline and edge labels before running layout.mjs. Wrote ${out} and ${preview}.`);
}

function geojsonGeometry(input) {
  if (input.type === 'Feature') return input.geometry;
  if (input.type === 'FeatureCollection') {
    const features = input.features || [];
    const appSite = features.filter(f => f.properties?.k === 'lot' && f.properties?.site);
    const candidates = appSite.length ? appSite : features;
    if (candidates.length === 1) return candidates[0].geometry;
    const polygons = candidates.flatMap(f => f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : []);
    return polygons.length ? { type: 'MultiPolygon', coordinates: polygons } : null;
  }
  return input;
}

function fromGeoJSON() {
  const file = value('file') || fail('give --file parcel.geojson');
  const input = readJSON(file), geometry = geojsonGeometry(input), boundary = S.boundaryFrom(geometry);
  if (!boundary?.ring?.length) fail('the input has no Polygon or MultiPolygon geometry.');
  const ring = cleanRing(boundary.ring, 'GeoJSON boundary');
  const frontArg = value('front');
  const front = frontArg == null ? S.longestEdge(ring) : checkedFront(ring, frontArg);
  const acres = +(S.ringArea(ring) / 43560).toFixed(3);
  finish({
    origin: boundary.origin || null, ring, front, streets: checkedEdges(ring, parseEdges(value('streets'))),
    acres, boundary_source: `GeoJSON ${path.basename(file)} (map geometry; not a boundary survey)`,
    scale_basis: 'source coordinates projected to local feet; no image fitting',
    geometry_confidence: 'source-dependent; verify against a survey'
  });
  if (frontArg == null) console.log('Note: the longest boundary edge was used as a frontage assumption; review the preview.');
}

function selectedCandidate(g, layer, index) {
  const i = Number(index), shapes = g.layers?.[layer]?.closed;
  if (!Number.isInteger(i) || i < 0 || !Array.isArray(shapes) || !shapes[i]) fail(`candidate ${layer}#${index} was not found in the extraction output.`);
  return cleanRing(shapes[i], `candidate ${layer}#${i}`);
}

function fromCandidate() {
  const file = value('file') || fail('give --file intake/geometry.json');
  const g = readJSON(file), acres = positive(value('confirmed-acres'), '--confirmed-acres');
  if (!argv.includes('--confirm-boundary')) fail('review the extraction preview and rerun with --confirm-boundary after confirming the selected outline is the intended site.');
  const layer = value('layer') || fail('choose --layer from boundary_candidates after reviewing the preview.');
  const index = value('index');
  if (index == null) fail('choose --index from boundary_candidates after reviewing the preview.');
  const sourceRing = selectedCandidate(g, layer, index);
  const candidate = (g.boundary_candidates || []).find(c => c.layer === layer && c.index === Number(index));
  const measuredAcres = S.ringArea(sourceRing) / 43560;
  let scale = 1, calibration;
  const isUnscaledPdf = g.source === 'pdf' && !g.scale_ft_per_in;
  if (isUnscaledPdf) {
    if (!argv.includes('--fit-to-confirmed-acres')) fail('this PDF has no printed or supplied scale. Add --fit-to-confirmed-acres only after verifying the site acreage and boundary.');
    scale = Math.sqrt(acres * 43560 / S.ringArea(sourceRing));
    calibration = 'area-fitted from user-confirmed acreage; approximate scale, verify dimensions';
  } else {
    if (g.unitless && value('confirm-units') !== 'feet') fail('the DXF has no declared units. Confirm they are feet with --confirm-units feet, or resolve units before layout.');
    const diffPct = Math.abs(measuredAcres - acres) / acres * 100;
    if (diffPct > 2) fail(`selected shape is ${measuredAcres.toFixed(3)} ac, ${diffPct.toFixed(1)}% from the confirmed ${acres} ac. Check the boundary, drawing units, acreage and scale; do not auto-fit a measured survey.`);
    calibration = `${g.units || 'drawing units'}; candidate area ${measuredAcres.toFixed(3)} ac vs confirmed ${acres.toFixed(3)} ac (${diffPct.toFixed(1)}% difference)`;
  }
  const transform = transformFor(sourceRing, scale);
  const ring = sourceRing.map(transform);
  const front = checkedFront(ring, value('front'));
  const exclusions = values('exclude').map(ref => {
    const m = /^(.*)#(\d+)$/.exec(ref);
    if (!m) fail(`exclusion "${ref}" must be layer#index.`);
    const points = selectedCandidate(g, m[1], m[2]);
    return { kind: 'keepout', ring: points.map(transform), source: `${path.basename(file)} ${m[1]}#${m[2]} (confirm exclusion type and location)` };
  });
  const stated = acres;
  finish({
    ring, front, streets: checkedEdges(ring, parseEdges(value('streets'))), acres: stated, exclusions,
    boundary_source: `${String(g.source || 'drawing').toUpperCase()} ${path.basename(file)} candidate ${layer}#${index}; user-confirmed outline; not survey-certified`,
    scale_basis: calibration,
    geometry_confidence: isUnscaledPdf ? 'low; area-fitted vector drawing' : 'medium; measured geometry, user-confirmed against acreage',
    extraction: { file: path.basename(file), source: g.source || 'drawing', layer, index: Number(index), selected_area_acres: +measuredAcres.toFixed(3), confirmed_site_acres: stated }
  });
  if (candidate?.boundary_layer === false) console.log('Warning: the chosen layer name does not resemble a boundary layer; verify the preview and acreage carefully.');
}

function fromTrace() {
  const file = value('ring') || fail('give --ring traced-boundary.json with points in the grid image coordinate system.');
  const acres = positive(value('confirmed-acres'), '--confirmed-acres');
  if (!argv.includes('--confirm-boundary')) fail('review the tracing preview and rerun with --confirm-boundary after confirming the parcel outline.');
  const raw = readJSON(file), sourceRing = cleanRing(Array.isArray(raw) ? raw : raw.ring, 'traced boundary');
  const area = S.ringArea(sourceRing), scale = Math.sqrt(acres * 43560 / area);
  const ring = sourceRing.map(transformFor(sourceRing, scale, true));
  const front = checkedFront(ring, value('front'));
  finish({
    ring, front, streets: checkedEdges(ring, parseEdges(value('streets'))), acres,
    boundary_source: `Hand-traced from ${path.basename(file)} pixel coordinates; user-confirmed outline; not survey-certified`,
    scale_basis: `uniformly area-fitted to user-confirmed ${acres.toFixed(3)} acres; dimensions and north must be verified`,
    geometry_confidence: 'low; sketch trace fitted by acreage'
  });
}

function extractDrawing() {
  const file = value('file') || fail('give --file drawing.dxf, drawing.pdf or sketch image');
  const acres = positive(value('confirmed-acres'), '--confirmed-acres');
  const out = value('out') || fail('give --out intake-directory');
  const extractor = path.join(path.dirname(fileURLToPath(import.meta.url)), 'intake', 'extract_geometry.py');
  const args = [extractor, file, '--acres', String(acres), '--out', out];
  if (value('page')) args.push('--page', value('page'));
  if (value('scale')) args.push('--scale', value('scale'));
  try {
    execFileSync(value('python') || 'python3', args, { stdio: 'inherit' });
  } catch (error) {
    if (error.status != null) process.exit(error.status);
    fail(`could not run the drawing extractor: ${error.message}. See references/drawing-intake.md for optional dependencies.`);
  }
  console.log('Next: inspect geometry.json and preview.png (or grid.png), select the parcel boundary, confirm its frontage edge, then run the candidate or trace command.');
}

function usage() {
  console.log(`Drawing-to-layout intake (offline)

  node scripts/intake.mjs geojson --file parcel.geojson --front 0 --out site.json
  node scripts/intake.mjs extract --file survey.dxf --confirmed-acres 7.71 --out intake/
  node scripts/intake.mjs candidate --file intake/geometry.json --layer PROPERTY --index 0 \\
    --confirmed-acres 7.71 --confirm-boundary --confirm-units feet --front 0 --out site.json
  node scripts/intake.mjs trace --ring traced-boundary.json --confirmed-acres 7.71 \\
    --confirm-boundary --front 0 --out site.json

The candidate command never scales measured DXF/vector-PDF geometry to make it fit. Only a PDF without a usable printed scale may be area-fitted, with --fit-to-confirmed-acres. A hand trace is always low confidence and requires confirmed acreage.
`);
}

try {
  if (command === 'geojson') fromGeoJSON();
  else if (command === 'candidate') fromCandidate();
  else if (command === 'trace') fromTrace();
  else if (command === 'extract') extractDrawing();
  else usage();
} catch (error) {
  fail(error?.message || String(error));
}
