// The holdout reference projects as evaluation cases for the layout engine (scripts/refs/holdout-eval.mjs). Only the
// reviewed holdout families with enough printed data are here: Sierra Vista (P35, P36), Anderson (E054), Lake Shore
// (P18). The reference values are read from data/reference/projects/<id>.json, never typed in here; what is set here is
// how each site and request is reconstructed, and that is said on each case (site.how).
//
// Partition discipline: nothing here (or in the evaluation) feeds the engine's templates. scripts/refs/templates-to-lib.mjs
// refuses holdout evidence; test/holdout-eval.mjs checks no template cites a holdout project.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ref = id => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reference/projects', id + '.json'), 'utf8'));
const v = x => (x && typeof x === 'object' && 'v' in x ? x.v : x ?? null);

// an outline traced from the reference site plan's page (pixels, y down) turned into feet (y up), scaled so its area is
// the printed site area: the shape is the plan's, the size the schedule's
function traced(px, acres) {
  let r = px.map(([x, y]) => [x, -y]);
  const a = r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  if (a < 0) r = r.reverse();
  const k = Math.sqrt(acres * 43560 / Math.abs(a)), x0 = Math.min(...r.map(p => p[0])), y0 = Math.min(...r.map(p => p[1]));
  return r.map(([x, y]) => [+((x - x0) * k).toFixed(2), +((y - y0) * k).toFixed(2)]);
}
const rect = (acres, aspect) => { const w = Math.sqrt(acres * 43560 * aspect), d = acres * 43560 / w; return [[0, 0], [+w.toFixed(2), 0], [+w.toFixed(2), +d.toFixed(2)], [0, +d.toFixed(2)]]; };
const len = (r, i) => { const a = r[i], b = r[(i + 1) % r.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };

function sierraVista30() {
  const R = ref('P35'), ac = v(R.site.area_ac);
  // traced from the preliminary site plan (sheet 1 of 4): Pleasant Grove Blvd on the south, Santucci Blvd on the west, the
  // WB-52 parcel cut out of the north-east corner; the north line simplified to two segments
  const ring = traced([[165, 1650], [1100, 1650], [1100, 1005], [840, 1005], [840, 510], [520, 425], [165, 505]], ac);
  return { id: 'P35', R, ring, front: 0, streets: [6], how: 'outline traced from the preliminary site plan (sheet 1 of 4), north line simplified, area scaled to the printed ' + ac + ' ac',
    page: { file: R.documents[0].file, page: 1 },
    ref: { acres: ac, units: v(R.site.units), parking: v(R.parking.provided), required: v(R.parking.required), buildings: v(R.buildings[0].count) + v(R.buildings[1].count), footprint: v(R.site.building_floor_area_sf), coverage: v(R.site.lot_coverage_pct), density: v(R.site.density_du_ac), floors: v(R.buildings[0].floors), form: 'mid-rise corridor + elevator (5 × 64-plex 241 × 83 ft, clubhouse with 35 units)', parkingType: 'surface' },
    perUnit: { v: 1.1, why: 'the project’s own rule: 1 a unit + 10% guest (senior)' },
    runs: [{ key: 'exact', ask: 'exactly 355 senior apartments, mid-rise, 4 stories, with elevators' }, { key: 'fill', ask: 'senior apartments, mid-rise, 4 stories, as many as fit' },
      { key: 'exact-ug', ask: 'exactly 355 senior apartments, mid-rise, 4 stories, with elevators, underground detention', why: 'detention off the surface (the reference has no pond on its site)' }, { key: 'fill-ug', ask: 'senior apartments, mid-rise, 4 stories, as many as fit, underground detention', why: 'detention off the surface (the reference has no pond on its site)' }, { key: 'fill-ug-deep', ask: 'senior apartments, mid-rise, 4 stories, 83 ft deep corridor buildings, as many as fit, underground detention', why: 'the depth as a person would choose it in the request (83 ft corridor buildings): a user-chosen depth, deeper than any reviewed corridor building; evaluation only, nothing fitted' }] };
}
function sierraVista32() {
  const R = ref('P36'), ac = v(R.site.area_ac);
  // traced from the preliminary site plan (sheet 1 of 5): a wedge between a straight west line and Santucci Blvd's curve
  const ring = traced([[95, 1870], [860, 1870], [640, 1400], [520, 1220], [330, 900], [175, 540], [120, 170], [95, 170]], ac);
  const santucci = [1, 2, 3, 4, 5], front = santucci.slice().sort((a, b) => len(ring, b) - len(ring, a))[0];
  return { id: 'P36', R, ring, front, streets: santucci.filter(k => k !== front), how: 'outline traced from the preliminary site plan (sheet 1 of 5), Santucci Blvd’s curve as five chords, area scaled to the printed ' + ac + ' ac',
    page: { file: R.documents[0].file, page: 1 },
    ref: { acres: ac, units: v(R.site.units), parking: v(R.parking.provided), required: v(R.parking.required), buildings: v(R.buildings[0].count) + 1, footprint: v(R.site.building_floor_area_sf), coverage: v(R.site.lot_coverage_pct), density: v(R.site.density_du_ac), floors: v(R.buildings[0].floors), form: 'mid-rise corridor + elevator (3 × 64-plex, amenity building)', parkingType: 'surface' },
    perUnit: { v: 1.1, why: 'the project’s own rule: 1 a unit + 10% guest (senior)' },
    runs: [{ key: 'exact', ask: 'exactly 192 senior apartments, mid-rise, 4 stories, with elevators' }, { key: 'fill', ask: 'senior apartments, mid-rise, 4 stories, as many as fit' },
      { key: 'exact-ug', ask: 'exactly 192 senior apartments, mid-rise, 4 stories, with elevators, underground detention', why: 'detention off the surface (the reference has no pond on its site)' }, { key: 'fill-ug', ask: 'senior apartments, mid-rise, 4 stories, as many as fit, underground detention', why: 'detention off the surface (the reference has no pond on its site)' }, { key: 'fill-ug-deep', ask: 'senior apartments, mid-rise, 4 stories, 83 ft deep corridor buildings, as many as fit, underground detention', why: 'the depth as a person would choose it in the request (83 ft corridor buildings): a user-chosen depth, deeper than any reviewed corridor building; evaluation only, nothing fitted' }] };
}
function anderson() {
  const R = ref('E054'), ac = v(R.site.area_ac);
  // a rectangle of the printed site area, proportioned as the level 1 plan's lot (about 1.75 : 1); a corner lot on NE 79th
  // St and 168th Ave NE
  const ring = rect(ac, 1.75);
  return { id: 'E054', R, ring, front: 0, streets: [1], how: 'a rectangle of the printed ' + ac + ' ac in the level 1 plan’s proportions (1.75 : 1), two street sides',
    page: { file: R.documents[0].file, page: 7 },
    ref: { acres: ac, units: v(R.site.units), parking: v(R.parking.provided), required: null, buildings: 1, footprint: v(R.buildings[0].footprint.area_sf), coverage: +(v(R.buildings[0].footprint.area_sf) / v(R.site.area_sf) * 100).toFixed(1), density: v(R.site.density_du_ac), floors: 7, form: 'U-shaped courtyard, 5 Type VA levels over a 2-level Type IA podium (P1 parking)', parkingType: 'structured (podium)' },
    perUnit: { v: 1.22, why: 'the ratio the project provides (210 for 172); Redmond’s requirement wasn’t read' },
    runs: [{ key: 'podium', ask: '172 apartments, tower on a podium, 7 stories' }, { key: 'wrap', ask: 'a wrap building with 172 apartments' }, { key: 'courtyard', ask: '172 courtyard apartments' },
      ...['podium', 'wrap'].map(k => ({ key: k + '-urban', ask: (k === 'podium' ? '172 apartments, tower on a podium, 7 stories' : 'a wrap building with 172 apartments') + ', underground detention', setbacks: { front: 5, side: 5, rear: 5, paving: 5 }, why: 'urban 5 ft setbacks (an assumption: the zone\u2019s weren\u2019t read) and detention off the surface (none on the reference site)' }))] };
}
function lakeShore() {
  const R = ref('P18'), ac = v(R.site.area_ac), open = v(R.site.open_space_ac), net = +(ac - open).toFixed(2);
  // the parcel is lakefront with 9.6 ac of buffer and undisturbed open space; its shoreline isn't traced: the engine gets
  // a rectangle of the land left for lots and roads (15.75 - 9.6 ac)
  const ring = rect(net, 1.5);
  return { id: 'P18', R, ring, front: 0, streets: [], how: 'a rectangle of the net land for lots and roads (' + ac + ' ac less ' + open + ' ac of open space = ' + net + ' ac); the lakefront outline isn’t traced',
    page: { file: R.documents[0].file, page: 77 },
    ref: { acres: net, units: v(R.site.lots), parking: null, required: v(R.site.lots) * v(R.parking.min_per_unit), buildings: null, footprint: null, coverage: null, density: +(v(R.site.lots) / net).toFixed(1), floors: '2-4', form: 'fee-simple townhome rows of 4, 5 and 6 (front-load garages)', parkingType: 'garage + driveway' },
    perUnit: { v: 2, why: 'the plat’s 2 a unit (garage + driveway)' },
    runs: [{ key: 'exact', ask: 'exactly 82 townhomes' }, { key: 'fill', ask: 'townhomes, as many as fit' }] };
}
export const CASES = () => [sierraVista30(), sierraVista32(), anderson(), lakeShore()];
