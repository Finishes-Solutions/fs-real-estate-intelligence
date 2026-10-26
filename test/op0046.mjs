// The OP-0046 project builder (build/projects/op-0046.mjs): the three Waller parcels merge into the 16.16-acre site, the
// sheets' buildings land at their stated floor areas inside it, nothing overlaps, and the document is one the app's
// sync accepts (api/projects.js cleanProject). Offline: the saved parcel copies.
import assert from 'node:assert/strict';
import * as M from '../build/projects/op-0046.mjs';
import * as SP from '../lib/siteplan.mjs';
import { cleanProject } from '../api/projects.js';

const doc = M.buildProject(M.FALLBACK_PARCELS, { now: '2026-10-26T20:00:00.000Z' }), s = M.summary(doc), pl = doc.plans[0];
assert.equal(doc.id, 'op-0046-waller-fm362'); assert.equal(doc.parcels.length, 3); assert.equal(doc.plans.length, 1);
assert.deepEqual(doc.parcels.map(p => p.key), ['pid:10687', 'pid:10682', 'pid:10680']);
assert.deepEqual(doc.parcels.map(p => p.owner), ['PRIYA CAPITAL LLC', 'MARKET SQUARE COMMONS LLC', 'WALLER HERITAGE PLAZA LLC']);
assert.equal(doc.parcels.reduce((t, p) => t + p.marketValue, 0), 1648410, 'the 2026 assessed values');
assert.ok(Math.abs(doc.parcels.reduce((t, p) => t + p.acres, 0) - 16.16) < 0.05, 'parcel acres: ' + doc.parcels.map(p => p.acres));
assert.ok(Math.abs(s.acres - 16.16) < 0.05, 'the merged site: ' + s.acres + ' acres');
assert.equal(pl.parcel, 'pid:10687'); assert.equal(pl.src, 'parcels'); assert.equal(pl.frontGuess, false); assert.equal(pl.streetsSet, true);
assert.equal(pl.streetNames[pl.front], 'FM 362', 'the front is FM 362'); assert.ok(pl.streets.every(k => pl.streetNames[k] === 'Old Houston Hwy'), 'Old Houston Hwy along the side');
assert.ok(SP.outwardOf(pl.ring, pl.front)[0] > 0.9, 'the front faces east');

// the buildings: the sheets' names and floor areas, exactly
assert.deepEqual(s.byBuilding, { Bealls: 30000, 'Clothing store': 31579, 'Grocery store': 32625, 'Home decor': 21693, 'Dollar store': 11475, 'Pet store': 10773, Restaurant: 7000, 'Retail 3': 6000, 'Retail 4': 12000, 'Retail 1': 5000, 'Retail 2': 5000 });
assert.equal(s.gfa, 173145, '138,145 + 7,000 + 28,000');
const B = pl.elements.filter(e => e.kind === 'building');
assert.equal(B.find(e => e.name === 'Bealls').w, 170); assert.equal(B.find(e => e.name === 'Grocery store').d, 274); assert.equal(B.find(e => e.name === 'Retail 4').w, 60);
assert.equal(B.find(e => e.name === 'Restaurant').use, 'restaurant'); assert.equal(B.find(e => e.name === 'Restaurant').rot, -16, 'the pad is square to Old Houston Hwy');
// where they sit: the store row along the west line, the pad in the north-east corner, the retail center along FM 362
const ring = pl.ring, xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), W = Math.min(...xs), E = Math.max(...xs), N = Math.max(...ys), S = Math.min(...ys);
const bealls = B.find(e => e.name === 'Bealls'), pad = B.find(e => e.name === 'Restaurant'), r2 = B.find(e => e.name === 'Retail 2');
assert.ok(bealls.x - bealls.w / 2 - W > 30 && bealls.x - bealls.w / 2 - W < 50, 'Bealls about 39 ft off the west line: ' + (bealls.x - bealls.w / 2 - W));
assert.ok(pad.x > E - 160 && pad.y > N - 300, 'the pad in the north-east corner');
assert.ok(r2.x > E - 120 && r2.y < S + 80, 'Retail 2 in the south-east corner');
assert.ok(pl.elements.every(e => SP.shapeOf(e).every(p => SP.inRing(p, ring))), 'every piece inside the site');

// parking, ponds and the channel
const rows = pl.elements.filter(e => e.kind === 'parking');
assert.equal(rows.length, 48 + 6, 'the shopping center sheet\u2019s 48 rows (of 5 stripes or more) and the retail center\u2019s 6');
assert.ok(rows.every(e => e.row === 1 && e.stallRot === 0 && e.d === 18), 'single 18 ft rows, their aisles drives of their own');
const drives = pl.elements.filter(e => e.kind === 'drive');
assert.ok(drives.length >= 30, 'the aisles between facing rows, the cross aisles and the drives: ' + drives.length);
assert.ok(rows.every(r => { const a = SP.rotPt([0, -1], r.rot), p = [r.x + a[0] * 15, r.y + a[1] * 15]; return drives.some(d => SP.hitRect(d, p)); }), 'every row opens onto a drive (nothing stands alone)');
assert.ok(s.spaces >= 650 && s.spaces <= 800, 'about 700 spaces at 9 x 18 ft: ' + s.spaces);
const retailRows = rows.filter(e => /^op46-r\d$/.test(e.id)), retailSpaces = retailRows.reduce((t, e) => t + SP.stalls(e).count, 0);
assert.equal(retailSpaces, 96, 'the retail center’s rows hold about the sheet’s 98: ' + retailSpaces);
const ponds = pl.elements.filter(e => e.kind === 'pond');
assert.equal(ponds.length, 2); assert.equal(ponds[0].name, 'Pond 2 (retention)'); assert.ok(Math.abs(SP.ringArea(ponds[0].poly) - 14215) < 60 && Math.abs(SP.ringArea(ponds[1].poly) - 10531) < 60, 'the ponds at their stated areas: ' + ponds.map(p => Math.round(SP.ringArea(p.poly))));
assert.equal(pl.params.storm.depth, 12); assert.equal(pl.program.storm, 'retention');
const ch = pl.elements.find(e => e.kind === 'keepout'); assert.ok(ch && ch.poly.length > 60 && SP.ringArea(ch.poly) > 8000, 'the drainage channel as a no-build area');
assert.deepEqual(s.overlaps, [], 'nothing overlaps'); assert.deepEqual(s.outside, []);
assert.ok(pl.elements.every(e => e.pinned && /^op46-/.test(e.id)), 'every piece pinned (a re-fit lays out round them) with its own id');


// what the sync accepts, and the Sites list's numbers
const row = cleanProject(doc, 'seed'); assert.ok(row && row.id === doc.id && row.updated_at === doc.updated, 'cleanProject takes it');
assert.ok(JSON.stringify(doc).length < 120000, 'well under the 500 KB the sync allows');
const m = SP.metrics(pl); assert.equal(m.buildings, 11); assert.ok(m.coverage > 0.2 && m.coverage < 0.3); assert.ok(m.pond > 24000);
assert.ok(SP.hasDesign(pl)); assert.equal(SP.nextOptionName(doc.plans), 'Option B');
// a second build is the same document (the seed workflow replaces the team's copy in place)
assert.equal(JSON.stringify(M.buildProject(M.FALLBACK_PARCELS, { now: '2026-10-26T20:00:00.000Z' })), JSON.stringify(doc));
console.log('op0046: ok (' + s.acres + ' acres, ' + s.gfa.toLocaleString('en-US') + ' sf in ' + s.buildings + ' buildings, ' + s.spaces + ' spaces, ' + s.elements + ' pieces)');
