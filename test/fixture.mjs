// Synthetic data for local UI testing without network access. Writes test/.data/ (gitignored).
//   node test/fixture.mjs && DATA_DIR=test/.data/ node build.mjs --assemble && (cd public && python3 -m http.server 8080)
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';
import { assembleGeo, rewind } from '../build/geometry.mjs';
import { USES } from '../lib/taxonomy.mjs';

const require = createRequire(import.meta.url), OUT = 'test/.data/';
const regions = JSON.parse(await fs.readFile('data/regions.json', 'utf8'));
const us = require('us-atlas/counties-10m.json'), world = require('world-atlas/land-110m.json');
const byFips = Object.fromEntries(feature(us, us.objects.counties).features.filter(f => String(f.id).startsWith('48')).map(f => [String(f.id), { ...f, properties: { NAME: f.properties.name } }]));
const texas = rewind(feature(us, us.objects.states).features.find(f => f.properties.name === 'Texas').geometry);
const land = feature(world, world.objects.land), landGeom = { type: 'MultiPolygon', coordinates: land.features.flatMap(f => rewind(f.geometry).coordinates) };
const places = [['Waller', -95.9269, 30.0566], ['Hempstead', -96.0783, 30.0974], ['Katy', -95.8244, 29.7858], ['Houston', -95.3698, 29.7604], ['Brookshire', -95.951, 29.786], ['Sealy', -96.157, 29.7808], ['Conroe', -95.4561, 30.3119], ['Navasota', -96.0877, 30.388], ['Brenham', -96.3977, 30.1669], ['Sugar Land', -95.6349, 29.6197], ['Cypress', -95.6972, 29.9691], ['Prairie View', -95.9877, 30.0933]];
const geo = { ...assembleGeo(regions, byFips, texas, landGeom, places), _regions: 'fixture' };

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
const DEVS = ['Hines Interests', 'Howard Hughes', 'Johnson Development', 'NewQuest Properties', 'Kimco Realty', 'Katy ISD', 'Waller County', 'Memorial Hermann Health System', 'H-E-B', 'Weingarten Realty', 'Prologis', 'Trammell Crow Company'];
const TEN = ['', '', '', 'Chick-fil-A', 'Starbucks', 'H-E-B', 'Buc-ee’s', 'Memorial Hermann', 'Texas Children’s', 'Whataburger'];
const ARCH = ['', '', 'Kirksey Architecture', 'PGAL', 'Gensler', 'Powers Brown Architecture'], GC = ['', '', '', 'Tellepsen', 'Turner Construction', 'Harvey Builders'];
const STATUS = ['Registered', 'Review complete', 'Inspection complete', 'Closed'];
const iso = d => d.toISOString().slice(0, 10), day = 864e5, now = Date.now(), start = new Date(now - 730 * day);
const filings = [];
for (let i = 0; i < 2500; i++) {
  const c = rnd() < .45 ? geo.counties[1] : pick(geo.counties), g = { type: 'MultiPolygon', coordinates: c.outline };
  let pt; for (let k = 0; k < 50; k++) { const p = [c.label[0] + (rnd() - .5) * .8, c.label[1] + (rnd() - .5) * .6]; if (geoContains(g, p)) { pt = p; break; } } if (!pt) pt = c.label;
  const type = pick(['New', 'New', 'Reno', 'Reno', 'Reno', 'Addition']), cost = Math.round(Math.exp(11 + rnd() * 6.5)), reg = iso(new Date(start.getTime() + rnd() * 728 * day));
  const hasStart = rnd() < .7, hasEnd = hasStart && rnd() < .8, s = hasStart ? iso(new Date(new Date(reg).getTime() + rnd() * 120 * day)) : '', e = hasEnd ? iso(new Date(new Date(s).getTime() + (60 + rnd() * 500) * day)) : '';
  const ts = s || reg, te = e || iso(new Date(new Date(ts).getTime() + (90 + rnd() * 400) * day));
  const use = pick(USES.slice(0, 12)), dev = pick(DEVS), city = pick(places)[0];
  filings.push({ id: 'TABS20' + (24 + Math.floor(i / 1300)) + String(100000 + i).slice(1), name: (pick(TEN) || dev) + ' ' + use + ' ' + pick(['Center', 'Building', 'Phase II', 'Expansion', 'Remodel', 'Shell']), county: c.name, city, addr: (100 + i) + ' Main St ' + city + ', TX 77' + String(400 + i % 99),
    type, cost, sqft: Math.round(cost / (80 + rnd() * 200)), owner: dev + ' LLC', scope: 'Construction of a ' + use.toLowerCase() + ' facility with site work and parking.', reg, status: pick(STATUS), start: s, end: e,
    ts, te, tsE: !s, teE: !e, lat: +pt[1].toFixed(5), lon: +pt[0].toFixed(5), ...(rnd() < .05 ? { approx: true } : {}),
    use, sub: '', ten: pick(TEN), dev, arch: pick(ARCH), gc: pick(GC), units: use === 'Multifamily' ? Math.round(100 + rnd() * 300) : null, sum: 'New ' + use.toLowerCase() + ' project for ' + dev + ' in ' + city + '.' });
}
filings.sort((a, b) => b.cost - a.cost);
const items = filings.filter(() => rnd() < .03).map(f => rnd() < .6 ? { id: f.id, k: 'new' } : { id: f.id, k: 'status', label: 'Status', from: 'Registered', to: f.status });
const changes = { runs: [{ built: new Date().toISOString(), items }, { built: new Date(now - 7 * day).toISOString(), items: items.slice(0, 20) }] };
const tracts = []; let n = 0;
for (let x = -96.6; x < -94.9; x += .12) for (let y = 29.4; y < 30.7; y += .1) {
  const ctr = [x + .06, y + .05]; if (!geo.counties.some(c => geoContains({ type: 'MultiPolygon', coordinates: c.outline }, ctr))) continue;
  tracts.push({ g: '48201' + String(100000 + n++), pop: Math.round(2000 + rnd() * 8000), inc: Math.round(35000 + rnd() * 120000), hu: 1500, vac: 100, rent: Math.round(800 + rnd() * 1400), val: Math.round(120000 + rnd() * 500000), age: 34, vacr: Math.round(rnd() * 150) / 10, gr: Math.round((rnd() * 40 - 8) * 10) / 10,
    geom: { type: 'Polygon', coordinates: [[[x, y], [x + .12, y], [x + .12, y + .1], [x, y + .1], [x, y]]] } });
}
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(OUT + 'regions.json', JSON.stringify(regions));
await fs.writeFile(OUT + 'geo.json', JSON.stringify(geo));
await fs.writeFile(OUT + 'filings.json', JSON.stringify({ period: { start: iso(start), end: iso(new Date(now - day)) }, built: new Date().toISOString(), unmapped: 12, filings }));
await fs.writeFile(OUT + 'changes.json', JSON.stringify(changes));
tracts.forEach(t => { t.jobs = Math.round(rnd() * 9000); t.jgr = Math.round((rnd() * 60 - 10) * 10) / 10; t.jpr = Math.round(t.jobs / t.pop * 100) / 100; t.jtop = [6, 15, 17]; });
await fs.writeFile(OUT + 'market.json', JSON.stringify({ year: 2024, baseYear: 2019, jobsYear: 2023, jobsBaseYear: 2018, tracts }));
// area context (build/area.mjs): jobs, permits, new businesses, news
const counties = regions.counties.map(c => ({ name: c.name, fips: c.fips })), yNow = new Date().getUTCFullYear();
const sec = () => Array.from({ length: 20 }, () => Math.round(rnd() * 20000));
const permits = { years: {}, ytd: { year: yNow, month: 8, cur: {}, prior: {} } };
for (let y = yNow - 7; y < yNow; y++) permits.years[y] = Object.fromEntries(counties.map((c, i) => { const sf = Math.round((i ? 1500 : 900) * (1 + rnd())), mf = Math.round(rnd() * 3000); return [c.fips, { date: String(y), sf, mf, mf5: mf, value: (sf + mf) * 250000 }]; }));
for (const c of counties) { permits.ytd.cur[c.fips] = { sf: Math.round(800 + rnd() * 500), mf: Math.round(rnd() * 900) }; permits.ytd.prior[c.fips] = { sf: Math.round(800 + rnd() * 500), mf: Math.round(rnd() * 900) }; }
const months = {}, latest = {}, BIZ = ['Taqueria El Sol', 'Katy Nail Spa', 'Brookshire Feed & Supply', 'Prairie View Coffee', 'Hempstead Auto Parts', 'Lone Star Vape', 'Cypress Dental Supply'];
for (const c of counties) {
  months[c.fips] = {}; for (let k = 23; k >= 0; k--) { const d = new Date(Date.UTC(yNow, new Date().getUTCMonth() - k, 1)); months[c.fips][d.toISOString().slice(0, 7)] = Math.round((c.name === 'Harris' ? 2500 : 60) * (0.6 + rnd() * 0.6) * (k === 0 ? 0.3 : 1)); }
  latest[c.fips] = Array.from({ length: 12 }, (_, k) => ({ name: pick(BIZ), owner: rnd() < .5 ? 'Holdings ' + k + ' LLC' : undefined, addr: (100 + k * 7) + ' Main St', city: pick(places)[0], zip: '77484', sec: pick([6, 17, 18, 15]), date: iso(new Date(now - k * 2 * day)) }));
}
const countyJobs = Object.fromEntries(counties.map((c, i) => [c.fips, { jobs: i === 1 ? 2400000 : Math.round(20000 + rnd() * 60000), gr: Math.round((rnd() * 30 - 2) * 10) / 10, sec: sec() }]));
const newsPlaces = counties.map(c => ({ key: 'county:' + c.name, county: c.name, label: c.name + ' County' })).concat([['Katy', 'Harris'], ['Brookshire', 'Waller']].map(([t, c]) => ({ key: 'town:' + t, county: c, label: t })));
const HEAD = ['approves new retail center near I-10', 'commissioners weigh rezoning for 400-home subdivision', 'breaks ground on logistics park', 'plans new H-E-B at growing intersection', 'school district buys land for new campus'];
const news = Object.fromEntries(newsPlaces.map(p => [p.key, HEAD.slice(0, 3 + Math.floor(rnd() * 3)).map((h, k) => ({ title: p.label + ' ' + h, url: 'https://example.com/' + encodeURIComponent(p.key) + '/' + k, domain: pick(['Community Impact', 'Houston Chronicle', 'Bisnow', 'Waller Times']), date: iso(new Date(now - (k * 9 + 1) * day)) }))]));
await fs.writeFile(OUT + 'area.json', JSON.stringify({ built: new Date().toISOString(), counties, jobs: { year: 2023, baseYear: 2018 }, permits, businesses: { since: iso(new Date(now - 730 * day)), months, latest }, newsPlaces, news, countyJobs }));
console.log('fixture:', filings.length, 'filings,', items.length, 'changes,', tracts.length, 'tracts');
