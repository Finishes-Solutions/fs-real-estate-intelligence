// The plain site reports (lib/reports/parcelmap.mjs, topo.mjs, siteenv.mjs, rings.mjs) on a real parcel: 15514 Elgin St,
// Channelview (Harris County parcel 0760590050022, its Regrid outline), lidar-like ground, the environmental and flood
// records as the endpoints return them, and the census tracts and filings in data/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const PM = await import('../lib/reports/parcelmap.mjs'), TP = await import('../lib/reports/topo.mjs'), EV = await import('../lib/reports/siteenv.mjs'), RG = await import('../lib/reports/rings.mjs'), PL = await import('../lib/reports/plain.mjs');
const { pngDataUrl } = await import('../lib/reports/png.mjs'), { frame } = await import('../lib/siteplan.mjs'), TR = await import('../lib/terrain.mjs');

const geom = [[-95.130465, 29.789887], [-95.129958, 29.7903835], [-95.1298675, 29.790472], [-95.1306225, 29.791454], [-95.131033, 29.7910775], [-95.130465, 29.789887]];
const parcel = { id: '0760590050022', owner: 'AGUIRRE RAUL & VANESSA Y', mail: '5322 NAUTILUS LN, BAYTOWN TX 77521-7924', situs: '15514 ELGIN ST', city: 'CHANNELVIEW', county: 'Harris', state: 'TX', zip: '77530', landUse: 'Res Vacant Table Value',
  zoning: 'NZ', zoningDesc: 'No Zoning', acres: 2.2926, gisAcres: 2.4099, sqft: 99868, land: 446165, improv: 0, total: 446165, legal: 'LTS 21 & 22 BLK 5 WEST ACRES', lastSale: '2009-04-23', yearBuilt: '1975', bldgSf: 2175, geom };

// ---------- plain kit ----------
assert.equal(PL.bearing([0, 0], [1, 1]), 'N 45°00\'00" E'); assert.equal(PL.bearing([0, 0], [-1, -1]), 'S 45°00\'00" W'); assert.equal(PL.bearing([0, 0], [0, -5]), 'S 00°00\'00" E');
assert.equal(PL.esc('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
assert.equal(PL.ringAreaFt([[0, 0], [10, 0], [10, 20], [0, 20]]), 200);

// ---------- parcel map ----------
{ const G = PM.geometryOf([parcel]), g = G.list[0], L = g.courses.map(c => Math.round(c.len));
  assert.deepEqual(L, [242, 43, 430, 189, 469], 'the five lines as the county sheet dimensions them (242, 43, 431, 189, 470 rounded there)');
  assert.ok(Math.abs(g.area / 43560 - 2.2926) < 0.02, 'the outline measures the roll\'s 2.29 acres, not Regrid\'s 2.41 GIS acres (' + (g.area / 43560).toFixed(3) + ')');
  assert.match(g.courses[0].brg, /^N \d\d°\d\d'\d\d" E$/); assert.ok(g.box.w > 250 && g.box.w < 300 && g.box.d > 480 && g.box.d < 520, 'fits a box about 276 x 501 ft');
  const flags = PM.recordFlags(parcel, g.area / 43560); assert.equal(flags.length, 1, 'one check: the building on a vacant, $0-improvement record'); assert.match(flags[0], /2,175 sf, built 1975/);
  assert.match(PM.recordFlags({ ...parcel, bldgSf: 0, yearBuilt: '' }, 2.6)[0], /measures 2\.60 ac against 2\.29 ac/, 'an outline 13% off the roll is flagged');
  const html = PM.parcelReport({ title: '15514 Elgin Street', area: 'Harris County, TX', date: '2026-10-30', parcels: [parcel], site: { flood: { zone: 'X', risk: 'minimal' }, schools: ['Channelview ISD'], near: ['Houston'] } });
  for (const s of ['241.8&#39;', '430.0&#39;', '189.0&#39;', '0760590050022', '$446,165', 'Area check', 'Site at a glance', 'Channelview ISD', 'Unincorporated', 'Parcel 1 of 1']) assert.ok(html.includes(s), 'the report shows ' + s);
  assert.ok(!/Finishes/i.test(html), 'unbranded');
  // two parcels: numbered, totals summed, one boundary block each
  const p2 = { ...parcel, id: 'B', total: 100000, land: 100000, acres: 1, geom: geom.map(([x, y]) => [x + 0.004, y]) }, h2 = PM.parcelReport({ title: 'Two', parcels: [parcel, p2] });
  assert.ok(h2.includes('$546,165') && h2.includes('Parcel 2 of 2') && h2.includes('3.29 ac total'), 'two parcels: totals and a page each'); }

// ---------- topography ----------
const origin = [-95.130476, 29.790686], F = frame(origin), ring = geom.slice(0, -1).map(p => F.toFt(p));
const spec = TR.gridSpec([[-600, -600], [600, -600], [600, 600], [-600, 600]], { maxPts: TR.MAX_POINTS, minCell: 3, margin: 0 }), z = [];
for (let j = 0; j < spec.ny; j++) for (let i = 0; i < spec.nx; i++) { const x = spec.x0 + i * spec.cell, y = spec.y0 + j * spec.cell; z.push(29 + 0.012 * x + 0.001 * y - 3 * Math.exp(-((x + 300) ** 2) / 800)); } // (falls west, a ditch at x = -300)
const T = { ...spec, z, source: 'USGS 3DEP', detail: '1 m lidar', resM: 1 };
{ const C1 = TP.contourLines(T, 1); assert.ok(C1.length >= 12 && C1.every(c => c.lines.length), 'a contour every foot'); const c29 = C1.find(c => c.z === 29);
  assert.ok(c29.lines.some(l => l.length > 50), 'segments joined into long lines'); for (const p of c29.lines[0].filter((_, k) => k % 10 === 0)) assert.ok(Math.abs(TR.zAt(T, p) - 29) < 0.05, 'on the 29 ft contour');
  const s = TR.summary(T, ring), e = TP.earthwork(T, ring, s.mean); assert.ok(Math.abs(e.cut - e.fill) / e.cut < 0.05, 'level at the average: cut and fill balance (' + Math.round(e.cut) + ' / ' + Math.round(e.fill) + ')');
  const hi = TP.earthwork(T, ring, s.max + 1); assert.equal(Math.round(hi.cut), 0); assert.ok(hi.net > 0, 'above the highest ground: all fill, an import');
  const sec = TP.section(T, ring, [0, 0], 0, 500); assert.ok(sec.some(q => q.inside) && sec.some(q => !q.inside) && sec[0].z < sec[sec.length - 1].z, 'a west-east section rises to the east');
  const sl = TP.slopeGrid(T); assert.ok(Math.abs(sl[Math.floor(spec.ny / 2) * spec.nx + spec.nx - 5] - Math.hypot(1.2, 0.1)) < 0.05, 'slope in percent away from the ditch');
  const html = TP.topoReport({ title: 'Elgin', date: '2026-10-30', terrain: T, ring, origin, png: pngDataUrl });
  assert.ok(html.includes('data:image/png;base64,') && html.includes('falls west') && html.includes('Earthwork to level the whole site') && html.includes('A–A') && html.includes('balanced'), 'map, sections and earthwork');
  assert.ok(html.includes(Number(spec.nx * spec.ny).toLocaleString('en-US') + ' points'), 'says how many points'); }

// ---------- site environmental ----------
{ const kinds = { lpst: { label: 'Leaking petroleum storage tank (TCEQ LPST)', search_mi: 0.5, count: 2, onsite: 0, nearest: [{ name: 'SHELDON ROAD TEXACO', addr: '817 SHELDON RD', mi: 0.28, dir: 'E' }, { name: 'OLD CHEVRON', mi: 0.38, dir: 'SE' }] },
    npl: { label: 'EPA Superfund', search_mi: 1, count: 0, onsite: 0, nearest: [] }, wells: { label: 'Oil & gas wells', search_mi: 0.25, count: 0, onsite: 0, nearest: [] }, wetlands: { label: 'Wetlands', search_mi: 0.1, error: 'Failed to execute query.' } };
  const env = { kinds, soils: { list: [{ name: 'Bernard-Urban land complex', drainage: 'Somewhat poorly drained', hydrologic_group: 'D', small_commercial: 'Very limited', water_table_cm: 46 }] } };
  assert.equal(EV.verdict(env), 'review', 'tanks nearby, none on the site');
  assert.equal(EV.verdict({ kinds: { ...kinds, lpst: { ...kinds.lpst, onsite: 1 } } }), 'flag'); assert.equal(EV.verdict({ kinds: { npl: kinds.npl } }), 'clear');
  assert.equal(EV.verdict({ kinds: { lpst: { ...kinds.lpst, nearest: [{ name: 'X', mi: 0.2, dir: 'N' }] } } }), 'flag', 'a cleanup case within ¼ mile');
  const fema = { flood_zones: { shares: { minimal: 99, high: 1 }, zones: [{ zone: 'X', pct: 99 }] }, nfip_claims: { claims: 8, paid: 219153, top_events: [{ event: 'Hurricane Harvey', claims: 4, paid: 168540 }] }, risk_index: { hazards: [{ hazard: 'Tornado', eal: 734500, rating: 'Very High' }], by_tract: [{ tract: '48201252306', risk_rating: 'Relatively High', risk_score: 89.3, eal: 2963904 }] }, disasters: { list: [{ date: '2017-08-25', title: 'HURRICANE HARVEY', kind: 'Major disaster' }] } };
  const html = EV.siteEnvReport({ title: 'Elgin', env, fema, flood: { zone: 'X', subtype: 'AREA OF MINIMAL FLOOD HAZARD' } });
  for (const s of ['Records nearby, none on the site', 'SHELDON ROAD TEXACO', '0.3 mi E', 'Bernard-Urban land complex', 'Wetlands', 'didn\'t answer', 'Hurricane Harvey', 'Relatively High', 'not a Phase I']) assert.ok(html.includes(s), 'the report shows ' + s);
  assert.ok(!/Finishes/i.test(html)); }

// ---------- area rings ----------
{ const M = JSON.parse(readFileSync(new URL('../data/market.json', import.meta.url))), Fl = JSON.parse(readFileSync(new URL('../data/filings.json', import.meta.url)));
  const sq = (c, d) => ({ type: 'Polygon', coordinates: [[[c[0] - d, c[1] - d], [c[0] + d, c[1] - d], [c[0] + d, c[1] + d], [c[0] - d, c[1] + d], [c[0] - d, c[1] - d]]] });
  const t = { g: 'x', pop: 1000, hu: 400, vac: 40, hh: 360, inc: 50000, geom: sq([-95, 30], 0.05) };
  const half = RG.shareInside(t, [-95, 30 - 0.05], 3); assert.ok(half > 0.3 && half < 0.5, 'a ring through a tract takes part of it (' + half.toFixed(2) + ')'); assert.equal(RG.shareInside(t, [-95, 30], 30), 1); assert.equal(RG.shareInside(t, [-94, 31], 1), 0);
  assert.ok(RG.suspect({ cost: 6488893438, sqft: 871200 }) && !RG.suspect({ cost: 21.6e6, sqft: 2000 }) && !RG.suspect({ cost: 5e6, sqft: 50000 }), 'only an implausible nine-figure cost is left out');
  const R = RG.ringData({ center: origin, tracts: M.tracts, filings: Fl.filings, rings: [1, 3, 5, 10] });
  for (let k = 1; k < R.length; k++) assert.ok(R[k].sum.population > R[k - 1].sum.population, 'more people in each wider ring');
  assert.ok(R[0].sum.population < 30000 && R[0].sum.population > 3000, 'the 1-mile ring counts slices of its tracts (' + Math.round(R[0].sum.population) + ')');
  assert.ok(R.every(r => r.cover > 0.9), 'the rings round Channelview are in the app\'s counties');
  assert.ok(R[3].odd.some(f => /Garth Road/.test(f.name)), 'the $6.5B road filing is caught'); assert.ok(R[3].value < 5e9, 'and kept out of the total');
  const mix = RG.incomeMix(R[1].list); assert.ok(Math.abs(mix.reduce((s, [, v]) => s + v, 0) - 100) < 0.01, 'the income mix adds to 100%');
  const html = RG.ringsReport({ title: 'Elgin', center: origin, site: geom.slice(0, -1), tracts: M.tracts, filings: Fl.filings, period: Fl.period });
  for (const s of ['1 mile', '10 miles', 'Median household income', 'Consumer spending', 'Largest projects within 5 miles', 'likely a typo']) assert.ok(html.includes(s), 'the report shows ' + s); }
// ---------- the one-click endpoint (api/sitereport.js): the card's record in, the right report out ----------
{ const API = await import('../api/sitereport.js'), card = { propId: '0760590050022', owner: parcel.owner, situs: '15514 Elgin St, Channelview', situsStreet: '15514 Elgin St', situsCity: 'Channelview', situsZip: '77530', county: 'Harris',
    landUse: parcel.landUse, marketValue: 446165, landValue: 446165, improvementValue: 0, area: '2.29 acres', acquired: '2009-04-23', geometry: { type: 'Polygon', coordinates: [geom] } };
  const r = API.toRecord(card); assert.equal(r.id, '0760590050022'); assert.equal(r.acres, 2.29); assert.equal(r.sqft, 99752); assert.equal(r.total, 446165); assert.equal(r.situs, '15514 Elgin St'); assert.equal(r.geom.length, 6);
  const multi = API.toRecord({ ...card, geometry: { type: 'MultiPolygon', coordinates: [[geom.slice(0, 4).concat([geom[0]])], [geom]] } }); assert.equal(multi.geom.length, 6, 'a multipolygon: its biggest piece');
  const box = API.topoBox(ring), w = box[1][0] - box[0][0], h = box[2][1] - box[1][1]; assert.ok(Math.abs(w / h - 720 / 560) < 1e-6 && w > 800, 'the ground fetched is the page\'s shape, the site plus 300 ft');
  const html = await API.buildHtml('area', { parcels: [card], center: origin, label: '15514 Elgin St' }); assert.ok(html.includes('Area report') && html.includes('10 miles') && html.includes('ZIP 77530'), 'the area report from the card');
  const res = { code: 0, status(c) { res.code = c; return res; }, json(o) { res.body = o; return res; }, setHeader() {} };
  await API.default({ method: 'POST', body: { kind: 'nope', parcels: [card], center: origin }, headers: { 'x-forwarded-for': '7.7.7.1' } }, res); assert.equal(res.code, 400);
  await API.default({ method: 'POST', body: { kind: 'parcel', parcels: [], center: origin }, headers: { 'x-forwarded-for': '7.7.7.2' } }, res); assert.equal(res.code, 400); assert.match(res.body.error, /Open a parcel/); }
console.log('sitereports ok');
