// lib/geomatch.mjs (fast point-in-area for filings) must agree with d3's spherical test on our real areas, and be fast.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { geoContains } from 'd3-geo';
import { contains, prepare } from '../lib/geomatch.mjs';
import { rewind } from '../build/geometry.mjs';

// a square with a square hole; ring direction must not matter
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const holed = { type: 'Polygon', coordinates: [sq(0, 0, 10, 10), sq(4, 4, 6, 6)] };
assert.equal(contains(holed, [1, 1]), true); assert.equal(contains(holed, [5, 5]), false, 'in the hole'); assert.equal(contains(holed, [11, 5]), false);
assert.equal(contains({ type: 'Polygon', coordinates: [sq(0, 0, 10, 10).reverse()] }, [1, 1]), true, 'clockwise ring');
assert.equal(contains({ type: 'MultiPolygon', coordinates: [[sq(0, 0, 1, 1)], [sq(5, 5, 6, 6)]] }, [5.5, 5.5]), true);
assert.equal(contains({ type: 'Feature', geometry: holed }, [1, 1]), true);
assert.equal(contains(null, [0, 0]), false); assert.equal(prepare(holed), prepare(holed), 'prepared once');

// real data: every filing against every home county outline, same answers as d3 (allowing a handful on the very edge)
const geo = JSON.parse(fs.readFileSync(fs.existsSync('data/geo.json') ? 'data/geo.json' : 'test/.data/geo.json', 'utf8'));
const F = JSON.parse(fs.readFileSync(fs.existsSync('data/filings.json') ? 'data/filings.json' : 'test/.data/filings.json', 'utf8')).filings;
let diff = 0, n = 0, tFast = 0, tD3 = 0;
for (const c of geo.counties) {
  const g = { type: 'MultiPolygon', coordinates: c.outline }, gs = rewind(g);
  let t = performance.now(); const a = F.map(f => contains(g, [f.lon, f.lat])); tFast += performance.now() - t;
  t = performance.now(); const b = F.map(f => geoContains(gs, [f.lon, f.lat])); tD3 += performance.now() - t;
  a.forEach((v, i) => { n++; if (v !== b[i]) diff++; });
}
assert.ok(diff <= Math.max(3, n * 1e-4), diff + ' of ' + n + ' disagree');
assert.ok(tFast * 5 < tD3, 'at least 5x faster: ' + tFast.toFixed(0) + ' ms vs ' + tD3.toFixed(0) + ' ms');
console.log('geomatch ok:', n, 'checks,', diff, 'edge differences,', tFast.toFixed(0), 'ms vs d3', tD3.toFixed(0), 'ms');
