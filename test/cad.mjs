// The appraisal-roll and tax-rate pipeline: parsers on real extracts of each source (test/fixtures/cad, cut from the files
// on 2026-11-12), the name crosswalk, the tax arithmetic, the three MCP tools on an in-memory store, and the loader's
// parcel-layer step from local files. No network, no database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const P = await import('../lib/cad/parse.mjs'), X = await import('../lib/cad/tax.mjs'), ST = await import('../lib/cad/store.mjs'), T = await import('../lib/mcp/tax.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), FX = root + '/test/fixtures/cad/';
const read = n => fs.readFileSync(FX + n, 'latin1'), json = n => JSON.parse(fs.readFileSync(FX + n, 'utf8'));
let checks = 0; const test = (name, fn) => Promise.resolve().then(fn).then(() => { checks++; }, e => { console.error('FAILED: ' + name); throw e; });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': ' + a + ' vs ' + b);

// ---------- parsers ----------
const comp = json('comptroller-2025.json'), compRows = Object.entries(comp).flatMap(([kind, rows]) => P.parseComptrollerRates(rows, { year: 2025, kind }));
await test('Comptroller rates: every kind, by unit ID, M&O + I&S, split units once', () => {
  const by = id => compRows.find(r => r.unit_key === id);
  assert.deepEqual([by('237-000-00').total_rate, by('237-000-00').mo_rate, by('237-000-00').is_rate], [0.556187, 0.463054, 0.093133], 'county: GF + FMFC');
  assert.equal(by('237-104-03').total_rate, 0.4464); assert.equal(by('237-104-03').unit_type, 'city'); assert.equal(by('237-104-03').county, 'Waller', 'home district, not the first listed');
  assert.ok(by('237-104-03')._cads.includes('Harris') && by('237-104-03')._cads.includes('Waller'), 'a split unit remembers each district');
  assert.equal(by('237-904-02').total_rate, 1.0626, 'ISD: M&O + I&S'); assert.equal(by('237-201-40').unit_type, 'esd'); assert.equal(by('237-201-40').nnr_rate, 0.098208);
  assert.equal(compRows.filter(r => r.unit_key === '237-904-02').length, 1);
  const star = compRows.find(r => r.status === 'not reported'); assert.ok(star && star.total_rate === null && !/\*/.test(star.name), 'a unit the district did not report: no rate, name cleaned');
  for (const y of [2023, 2024]) { const t = P.parseComptrollerTotals(json('comptroller-' + y + '-total.json'), { year: y }); assert.ok(t.find(r => r.unit_key === '237-104-03').total_rate > 0, y + ' total file (its own layout)'); }
});
await test('Waller CAD and Montgomery rate tables (PDF text)', () => {
  const w = P.wallerRateText(read('waller-2025-rates.txt'), { taxYear: 2025 }), by = c => w.find(x => x.unit.unit_code === c);
  assert.ok(w.length >= 55); assert.deepEqual([by('CWR').rate.mo_rate, by('CWR').rate.is_rate, by('CWR').rate.total_rate], [0.328, 0.1184, 0.4464]);
  assert.equal(by('RFM').rate.total_rate, 0.023591); assert.equal(by('GWA').rate.total_rate, 0.532596); assert.equal(by('M55B').rate.status, 'no levy'); assert.equal(by('HWCM7').rate.total_rate, 1.5, 'a unit with M&O only');
  const m = P.montgomeryRateText(read('montgomery-2026-rates.txt'), { taxYear: 2026 }), sco = m.find(x => x.unit.unit_code === 'SCO');
  assert.deepEqual([sco.unit.name, sco.rate.total_rate, sco.rate.mo_rate, sco.rate.is_rate, sco.unit.unit_type], ['Conroe ISD', 0.9471, 0.6671, 0.28, 'isd']);
});
await test('the crosswalk links district codes to Comptroller units by name, and refuses near misses', () => {
  const w = P.crosswalk(P.wallerRateText(read('waller-2025-rates.txt'), { taxYear: 2025 }).map(x => x.unit), compRows, 'Waller'), id = c => w.find(u => u.unit_code === c).comptroller_id;
  assert.equal(id('CWR'), '237-104-03'); assert.equal(id('SWR'), '237-904-02'); assert.equal(id('GWA'), '237-000-00'); assert.equal(id('ESD'), '237-201-40');
  assert.equal(id('M54'), '079-412-04', '"FB-Waller Co MUD #3" is Fort Bend-Waller MUD 3, not Harris-Waller MUD 3');
  assert.equal(id('WCID3'), null, 'no number to match on: left unlinked rather than guessed');
  assert.equal(P.normName('GIDDINGS I S D'), 'giddings isd'); assert.equal(P.typeOfName('MADISONVILLE CISD'), 'isd'); assert.equal(P.typeOfName('WASHINGTON CO FM'), 'county'); assert.equal(P.cid('07920348'), '079-203-48');
});
await test('HCAD: account, buildings with units, jurisdiction rates', () => {
  const recs = f => { const [h, ...l] = read(f).split('\n').filter(Boolean), row = P.headerOf(h, P.splitTsv); return l.map(x => row(P.splitTsv(x))); };
  const a = P.hcadAccount(recs('hcad-real_acct.tsv')[1], { roll: 'certified' });
  assert.equal(a.account_id, '0010020000001'); assert.equal(a.tax_year, 2026); assert.equal(a.owner, '907 COMMERCE LP'); assert.equal(a.state_class, 'F1'); assert.equal(a.situs_zip, '77002'); assert.ok(a.market_value > 0 && a._jurs.length > 3);
  const b = P.hcadBuilding(recs('hcad-building_other.tsv')[0], { taxYear: 2026, kind: 'commercial' }); assert.equal(b.year_built, 1900); assert.equal(b.sqft, 22608); assert.match(b.bldg_class, /Average/);
  const r = P.hcadRates(recs('hcad-jur_rate.tsv'), { taxYear: 2026 }); assert.equal(r.length, 1, 'one row per jurisdiction'); assert.deepEqual([r[0].rate.total_rate, r[0].rate.proposed_rate, r[0].unit.unit_type], [0.8421, 0.8783, 'isd']);
});
await test('Fort Bend Orion export: property, owner values, entities, exemptions', () => {
  const recs = f => { const [h, ...l] = read(f).split('\n').filter(Boolean), row = P.headerOf(h, P.splitCsv); return l.map(x => row(P.splitCsv(x))); };
  const p = P.orionProperty(recs('orion-property.csv')[0]); assert.equal(p.account_id, 'M10076'); assert.equal(p.roll, 'certified'); assert.deepEqual(p._entities, ['C17', 'D01', 'G01', 'S01']); assert.match(p.legal, /SPACE 12/, 'a quoted field with commas');
  const o = P.orionOwner(recs('orion-owner.csv')[0]); assert.equal(o.account_id, 'R391499'); assert.equal(o.land_value, 21227);
  const e = P.orionEntity(recs('orion-entity.csv')[0]); assert.deepEqual([e.code, e.taxable], ['C17', 7300]);
  assert.equal(P.orionExemption(recs('orion-exemption.csv')[0]).code, 'HS');
});
await test('PACS appraisal export (fixed width)', () => {
  const a = P.pacsAccount(P.fixed(read('pacs-info.txt').split('\n')[0], P.PACS.info), { county: 'Washington', roll: 'certified' });
  assert.deepEqual([a.account_id, a.tax_year, a.geo_id, a.owner, a.market_value, a.acreage, a.situs_city], ['10001', 2026, '0001-000-00100', 'FOUR T GROUP LLC', 3226080, 161.119, 'Brenham']);
  const e = read('pacs-entity.txt').split('\n').filter(Boolean).map(l => P.fixed(l, P.PACS.entity)); assert.equal(e[0].entity_cd, 'G01'); assert.equal(e[0].entity_name, 'WASHINGTON COUNTY'); assert.equal(+e[0].taxable_val, 201430);
  const d = P.fixed(read('pacs-det.txt').split('\n')[0], P.PACS.det); assert.equal(+d.yr_built, 1958); assert.equal(+d.area, 540);
});
await test('Grimes printed roll: blocks, values, units, exemptions', () => {
  const rs = [...P.grimesBlocks(read('grimes-roll.txt').split('\n'))].map(b => P.grimesAccount(b, { taxYear: 2026 })).filter(Boolean);
  assert.equal(rs.length, 12, 'every block in the extract');
  const r = rs.find(x => x.account.account_id === '79106'); assert.deepEqual([r.account.geo_id, r.account.market_value, r.account.appraised_value, r.account.acreage], ['407-000-0202', 2492670, 31280, 256.21]);
  assert.deepEqual(r.units.unit_codes, ['GGR', 'SNA']); assert.equal(r.units.taxable.GGR, 31280);
  const hs = rs.find(x => x.account.account_id === '78812'); assert.deepEqual(hs.account.exemptions, ['HS', 'TOT']); assert.equal(hs.account.market_value, 212390); assert.ok(hs.units.unit_codes.includes('CNA'));
  assert.ok(rs.every(x => !x.account.exemptions.some(e => /\d/.test(e) && e.length < 3)), 'legal text is not read as an exemption');
});
await test('BIS parcel layer record: the current year, three units, a centre point', () => {
  const f = json('layer-Waller-0.json').features[0], r = P.bisAccount(f.attributes, { county: 'Waller', centroid: P.ringCentroid(f.geometry) });
  assert.deepEqual([r.account.account_id, r.account.tax_year, r.account.market_value, r.account.land_value, r.account.improvement_value], ['265550', 2027, 19622330, 1062360, 18559970]);
  assert.deepEqual(r.units.unit_codes, ['GWA', 'CWR', 'SWR']); assert.equal(r.units.partial, true); near(r.account.lat, 30.0677, 0.001, 'centre'); assert.equal(P.rowHash(r.account), P.rowHash({ ...r.account }), 'stable hash');
});

// ---------- the Waller test case through the tools (account 265550, Green Gardens) ----------
const wallerRates = P.wallerRateText(read('waller-2025-rates.txt'), { taxYear: 2025 });
const wallerUnits = P.crosswalk(wallerRates.map(x => x.unit), compRows, 'Waller');
const f0 = json('layer-Waller-0.json').features[0], bis = P.bisAccount(f0.attributes, { county: 'Waller', centroid: P.ringCentroid(f0.geometry) });
const runs = [{ id: 1, source: 'bis-layer', county: 'Waller', tax_year: 2027, roll: 'current', url: 'https://services3.arcgis.com/KKhSlBnH1Rm0YK62/arcgis/rest/services/WallerCADWebService/FeatureServer/0', finished_at: '2026-11-12T08:00:00Z', status: 'ok' },
  { id: 2, source: 'wcad-rates', county: 'Waller', tax_year: 2025, roll: 'rates', url: 'https://waller-cad.org/wp-content/uploads/2026/03/2025-tax-rates.pdf', finished_at: '2026-11-12T08:00:00Z', status: 'ok' },
  { id: 3, source: 'comptroller-rates', tax_year: 2025, roll: 'rates', url: 'https://comptroller.texas.gov/taxes/property-tax/docs/2025-city-rates-levies.xlsx', finished_at: '2026-11-12T08:00:00Z', status: 'ok' }];
const neighbour = { ...bis.account, account_id: '999001', situs: '100 Test Rd, Waller', market_value: 9000000, lon: bis.account.lon + 0.005, units: 120, bldg_sqft: 100000, year_built: 2020, state_class: null, source_run_id: 1 };
ST.hooks.store = ST.memoryStore({ accounts: [{ ...bis.account, source_run_id: 1 }, neighbour], units: [{ ...bis.units, source_run_id: 1 }], taxingUnits: wallerUnits, runs,
  rates: [...wallerRates.map(x => ({ ...x.rate, source_run_id: 2 })), ...compRows.map(r => ({ ...P.stripPrivate(r), source_run_id: 3 }))] });
await test('tax_estimate: Waller 265550: 2027 record, every unit, the 2025 combined rate, sources', async () => {
  const t = await T.taxEstimateTool({ apn: '265550', county: 'Waller', value: 25000000 });
  assert.match(t, /Tax year 2027 \(current roll\)/); assert.match(t, /market \$19,622,330/);
  for (const u of ['Waller County \\(GWA\\)', 'City of Waller \\(CWR\\)', 'Waller ISD \\(SWR\\)', 'Waller County RFM \\(RFM\\)']) assert.match(t, new RegExp(u));
  assert.match(t, /Combined rate: 2\.065187%/, 'county 0.532596 + RFM 0.023591 + city 0.4464 + ISD 1.0626 = the Comptroller’s 2025 county + city + ISD');
  assert.match(t, /At \$25,000,000 \(no exemptions\): \$516,297 a year/); assert.match(t, /2025 rate \(no 2027 rate loaded yet\)/);
  assert.match(t, /special districts may also tax it/); assert.match(t, /Sources:\n- Appraisal district parcel layer, tax year 2027, current roll, loaded 2026-11-12 https:/); assert.match(t, /Waller CAD tax rate table, tax year 2025/);
  assert.doesNotMatch(t, /2025-city-rates-levies/, 'only the files the numbers came from');
  // with the Comptroller's rates only (no district table), the county's two funds count once
  const e = X.estimate({ county: 'Waller', year: 2025, account: bis.account, units: bis.units, taxingUnits: wallerUnits, rates: compRows });
  near(e.rate, 2.065187, 1e-9, 'Comptroller only'); assert.ok(!e.lines.some(l => l.code === 'RFM'), 'RFM not added on the Comptroller county rate');
  const e2 = X.estimate({ county: 'Waller', year: 2025, account: bis.account, units: { ...bis.units, unit_codes: ['GWA', 'RFM', 'CWR'] }, taxingUnits: wallerUnits, rates: compRows });
  assert.equal(e2.lines.filter(l => l.rate === 0.556187).length, 1); assert.deepEqual(e2.lines[0].codes, ['GWA', 'RFM']);
});
await test('assessment_history and assessment_comps', async () => {
  const h = await T.assessmentHistoryTool({ apn: '265550', county: 'Waller' });
  assert.match(h, /\| 2027 \| current \| \$1,062,360 \| \$18,559,970 \| \$19,622,330 \|/); assert.match(h, /this county publishes only its current year/);
  const c = await T.assessmentCompsTool({ apn: '265550', county: 'Waller', radius_mi: 2, land_use: 'multifamily' });
  assert.match(c, /carries no state class/); assert.match(c, /100 Test Rd/); assert.match(c, /\$75,000 each/); assert.match(c, /not sale prices/);
  const none = await T.assessmentCompsTool({ county: 'Waller', tax_year: 2027, units_min: 500 }); assert.match(none, /No properties match/);
  assert.deepEqual(X.history([{ tax_year: 2025, market_value: 100 }, { tax_year: 2026, market_value: 110 }]).map(r => r.marketChange), [null, 10.000000000000009]);
  assert.deepEqual(T.accountVariants('Harris', '10020000001'), ['0010020000001']); assert.ok(T.accountVariants('Fort Bend', '391499').includes('R391499'));
});
await test('an account not in the roll: the county unit only, said plainly', async () => {
  const t = await T.taxEstimateTool({ apn: '1', county: 'Waller' }); assert.match(t, /No appraisal roll record loaded for account 1/); assert.match(t, /school district and special districts are not known/);
  await assert.rejects(T.taxEstimateTool({ apn: '1', county: 'Travis' }), /covers Harris, Fort Bend/);
});
await test('the tools are listed read-only with the server', async () => {
  const S = await import('../lib/mcp/server.mjs');
  for (const n of ['tax_estimate', 'assessment_history', 'assessment_comps']) { const t = S.TOOLS.find(x => x.name === n); assert.ok(t && !t.write && t.inputSchema.additionalProperties === false, n); }
});
ST.hooks.store = null;

// ---------- the loader's parcel-layer step from local files (DRY, no network) ----------
await test('loader: the Waller layer from local pages writes accounts and units', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cadtest-'));
  const r = spawnSync(process.execPath, ['build/cad-rolls.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, DRY: '1', OUT_DIR: out, CAD_DIR: FX, ONLY: 'layers', LAYER_COUNTIES: 'Waller', LAYER_YEAR: '2027', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const rows = n => fs.readFileSync(path.join(out, n + '.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(rows('cad_accounts')[0].account_id, '265550'); assert.deepEqual(rows('account_taxing_units')[0].unit_codes, ['GWA', 'CWR', 'SWR']); assert.equal(rows('source_runs')[0].status, 'ok');
  fs.rmSync(out, { recursive: true, force: true });
});
console.log('cad tests passed (' + checks + ' checks)');
