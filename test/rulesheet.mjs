// Offline tests for street rules by location (lib/rulesheet.mjs, NEIGHBORHOOD-PLAN.md phase 4b): the AI's reading of a
// place's codes turned into a rule sheet (sure only when read from a page the search found, Waller County's values
// standing in, flagged, for what's missing), the jurisdiction from the site's facts and the AI's ETJ decision, the
// plan's snapshot of a sheet read by the street rules, the entries and the storm sizing (a plan without one exactly as
// before), the AI step (api/siteplan.js mode 'rules', mocked: the ETJ, two searches, the structuring call; Waller's
// rules when the search fails), the team's shared sheets (api/rulesheets.js) and street names (lib/streetnames.mjs,
// api mode 'streetNames'). Fast.
import assert from 'node:assert/strict';
const RS = await import('../lib/rulesheet.mjs'), S = await import('../lib/siteplan.mjs'), N = await import('../lib/streetnet.mjs'), SN = await import('../lib/streetnames.mjs');

// ---- 1. a sheet from the AI's answer ----
const SRC = ['https://library.municode.com/tx/katy/codes/code_of_ordinances?nodeId=CH98SU', 'https://www.fbcdd.org/criteria-manual.pdf'];
const v = (field, value, o = {}) => ({ field, value, choice: null, url: SRC[0], cite: '§98-41', quote: 'Local streets shall have a right-of-way of not less than 60 feet', sure: true, ...o });
const ai = { jurisdiction: { name: 'City of Katy', kind: 'city' }, summary: 'Katy’s Chapter 98 (2024) and the Fort Bend drainage manual.', values: [
  v('localRow', 60), v('localPave', 28), v('blockMax', 1200, { url: 'https://library.municode.com/tx/katy/codes/other-page' }), // (another page on the same site the search read: sure)
  v('culMax', 600, { url: 'https://made-up.example.com/code' }), // (a page the search never read: unsure)
  v('bulbR', 900), // (out of range: dropped)
  v('minLotW', 50, { url: null }), // (no page: never sure)
  { field: 'sidewalk', value: null, choice: 'one', url: SRC[0], cite: '§98-60', quote: 'sidewalks on one side', sure: true },
  v('detention', 0.6, { url: SRC[1], cite: 'Ch. 6', sure: false }), v('nonsense', 3) ] };
const sh = RS.sheetFrom(ai, { key: 'city:katy', name: 'City of Katy', kind: 'city', sources: SRC, now: '2026-10-20T15:00:00.000Z' });
const val = k => sh.values[k];
assert.deepEqual([val('localRow').v, val('localRow').sure, val('localRow').from], [60, true, 'code'], 'read from a page the search found: sure');
assert.equal(val('blockMax').sure, true, 'a page on the same site as one read: sure');
assert.deepEqual([val('culMax').v, val('culMax').sure], [600, false], 'a page the search never read: kept, unsure');
assert.equal(val('minLotW').sure, false, 'no page: never sure');
assert.deepEqual([val('bulbR').v, val('bulbR').from, val('bulbR').sure], [RS.WALLER.values.bulbR.v, 'waller', false], 'out of range: dropped, a Waller default stands in');
assert.equal(val('sidewalk').v, 'one', 'the sidewalks choice');
assert.deepEqual([val('detention').v, val('detention').sure], [0.6, false], 'the AI’s own doubt kept');
assert.ok(!('nonsense' in sh.values), 'only the fields the sheet has');
for (const k of RS.KEYS) assert.ok(sh.values[k], 'every field has a value: ' + k);
const missing = RS.KEYS.filter(k => !ai.values.some(x => x.field === k && x.field !== 'bulbR'));
for (const k of missing) assert.deepEqual([sh.values[k].from, sh.values[k].sure], ['waller', false], 'missing: a Waller default, unsure: ' + k);
assert.deepEqual(RS.flagged(sh).sort(), RS.KEYS.filter(k => !sh.values[k].sure || sh.values[k].from === 'waller').sort(), 'flagged: the unsure values and the Waller defaults standing in');
assert.ok(RS.flagged(sh).includes('culMax') && RS.flagged(sh).includes('bulbR') && !RS.flagged(sh).includes('localRow'));
// confirmed and edited by a person
const c1 = RS.confirm(sh, 'culMax', 'Matthew'); assert.ok(!RS.flagged(c1).includes('culMax'), 'confirmed: no longer flagged'); assert.equal(c1.values.culMax.ok.by, 'Matthew'); assert.ok(Date.parse(c1.updated) > Date.parse(sh.updated), 'updated bumped');
const e1 = RS.edit(c1, 'bulbR', 45, 'Ana'); assert.deepEqual([e1.values.bulbR.v, e1.values.bulbR.from, e1.values.bulbR.sure, e1.values.bulbR.url], [45, 'hand', true, null], 'edited: by hand, sure'); assert.ok(e1.values.bulbR.was?.url, 'its old source kept'); assert.ok(!RS.flagged(e1).includes('bulbR'));
assert.equal(RS.edit(c1, 'bulbR', 900, 'Ana'), null, 'an edit out of range is refused'); assert.equal(RS.edit(c1, 'sidewalk', 'sometimes', 'Ana'), null);
// cleaned when stored or synced
assert.deepEqual(RS.sheetIn(e1), e1, 'a good sheet comes back as it is');
assert.equal(RS.sheetIn({ key: '../etc', values: { localRow: { v: 60 } } }), null, 'a bad key'); assert.equal(RS.sheetIn({ key: 'county:x', values: {} }), null, 'no values'); assert.equal(RS.sheetIn('x'), null);
const junk = RS.sheetIn({ ...e1, evil: '<script>', values: { ...e1.values, localRow: { v: 9999, url: 'javascript:alert(1)' }, made: { v: 1 }, culMax: { ...e1.values.culMax, url: 'javascript:alert(1)', sure: true } } });
assert.ok(!('evil' in junk) && !('made' in junk.values) && !('localRow' in junk.values), 'unknown keys and bad values dropped'); assert.deepEqual([junk.values.culMax.url, junk.values.culMax.sure], [null, false], 'a bad link dropped, and with it sure');
assert.equal(RS.sheetIn({ ...e1, summary: 'x'.repeat(5000), values: Object.fromEntries(Object.entries(e1.values).map(([k, x]) => [k, { ...x, quote: 'q'.repeat(5000) }])) }).summary.length, 800, 'long text cut');
// read again (Refresh) over the team's sheet: a hand edit stays, a value read before stays when the new reading found
// nothing, a confirmation stays on a value that came back the same; a reading that failed altogether changes nothing
{ const again = RS.sheetFrom({ ...ai, values: ai.values.filter(x => x.field !== 'localRow').concat([v('culMax', 600, { url: 'https://made-up.example.com/code' }), v('bulbR', 48)]) }, { key: 'city:katy', name: 'City of Katy', kind: 'city', sources: SRC }), m = RS.merge(e1, again);
  assert.deepEqual([m.values.bulbR.v, m.values.bulbR.from], [45, 'hand'], 'an edit by hand kept'); assert.deepEqual([m.values.localRow.v, m.values.localRow.from, m.values.localRow.sure], [60, 'code', true], 'a value read before, not found now: kept');
  assert.equal(m.values.culMax.ok?.by, 'Matthew', 'a confirmation kept on a value that came back the same'); assert.equal(RS.merge(e1, RS.sheetFrom({ ...ai, values: ai.values.filter(x => x.field !== 'culMax').concat([v('culMax', 700, { sure: false })]) }, { key: 'city:katy', sources: SRC })).values.culMax.ok, undefined, 'not on one that changed');
  assert.equal(RS.merge(e1, RS.standIn({ key: 'city:katy', name: 'City of Katy', kind: 'city' })), e1, 'a failed reading (Waller standing in for all): the team’s sheet as it was'); assert.equal(RS.merge(null, again), again, 'nothing before: the new reading'); }
assert.equal(RS.old(sh, Date.parse('2027-12-01')), true, 'a year old: read again'); assert.equal(RS.old(sh, Date.parse('2026-12-01')), false);

// ---- 2. where a site is ----
assert.deepEqual(RS.jurisdictionOf({ county: 'Fort Bend', place: { name: 'Katy', full: 'Katy city' } }), { key: 'city:katy', name: 'City of Katy', kind: 'city', city: 'Katy', county: 'Fort Bend', dd: null });
assert.equal(RS.jurisdictionOf({ county: 'Waller', place: null }).key, 'county:waller'); assert.equal(RS.jurisdictionOf({ county: 'Waller County', place: null }).name, 'Waller County');
assert.equal(RS.jurisdictionOf({ county: 'Waller', place: null }, { city: 'Houston', decided: 'in' }).key, 'etj:houston|county:waller', 'in an ETJ'); assert.equal(RS.jurisdictionOf({ county: 'Waller', place: null }, { city: 'Houston', decided: 'in' }).name, 'Houston ETJ in Waller County');
assert.equal(RS.jurisdictionOf({ county: 'Waller', place: null }, { city: 'Houston', decided: 'unsure' }).key, 'county:waller', 'an ETJ not settled: the county’s');
assert.equal(RS.jurisdictionOf({ county: 'Harris', place: null, water: [{ name: 'Harris County MUD 501', type: 'Municipal Utility District' }, { name: 'Harris County Flood Control District', type: 'Drainage District' }] }).key, 'county:harris|dd:harris-flood-control-district', 'a drainage district');
assert.equal(RS.jurisdictionOf({ place: { name: 'Katy' } }), null, 'no county: nothing'); assert.equal(RS.jurisdictionOf(null), null);
assert.deepEqual(RS.parseEtj('Here is what I found:\n```json\n{"etj": "Houston", "decided": "in", "why": "Houston’s ETJ map covers it", "url": "https://www.houstontx.gov/planning/etj.html"}\n```'), { etj: 'Houston', decided: 'in', why: 'Houston’s ETJ map covers it', url: 'https://www.houstontx.gov/planning/etj.html' });
assert.deepEqual(RS.parseEtj('{"etj": null, "decided": "out", "why": "", "url": "not a link"}'), { etj: null, decided: 'out', why: '', url: null });
assert.equal(RS.parseEtj('{"etj": "", "decided": "in"}').decided, 'unsure', 'in, with no city named: unsure'); assert.equal(RS.parseEtj('I could not tell {'), null, 'garbled'); assert.equal(RS.parseEtj('{"etj": "Katy", "decided": "maybe"}').decided, 'unsure');

// ---- 3. the plan's snapshot: the street rules, the entries, the storm sizing ----
{ // today's values, as they were before rule sheets (a plan without one exactly as before)
  const R0 = N.streetRules({}), E0 = S.entryRules({}), st0 = S.stormNeed(100, {}, {});
  assert.deepEqual(Object.fromEntries(Object.entries(R0).filter(([k]) => !['frontBL', 'sideBL', 'minLotW', 'minLotSf', 'secondAt', 'strict'].includes(k))), { local: { pave: 28, row: 50 }, collector: { pave: 36, row: 60 }, blockMax: 1400, blockMin: 300, culMax: 800, bulbR: 42, bulbRow: 50, knuckleR: 45, junctionMin: 125, collJunctionMin: 300, entryClear: 300, collFront: true, curveMin: 120, cornerClear: 10 }, 'the street rules without a sheet');
  assert.deepEqual([R0.frontBL, R0.sideBL, R0.minLotW, R0.minLotSf, R0.secondAt, R0.strict], [20, 0, 0, 0, 30, false], 'the new ones as the generator always had them');
  assert.deepEqual(E0, { style: 'auto', lane: 18, median: 14, sign: 'median', corner: 100, spacing: 150, cross: 100 }, 'the entry rules without a sheet');
  assert.deepEqual(st0, { mode: 'detention', volume: 55.00000000000001, area: 55.00000000000001 * 43560 / 5 * 1.2 }, 'the storm sizing without a sheet'); assert.equal(S.STORM.rate, RS.WALLER.values.detention.v, 'the fallback rate is Waller County’s');
  const code = RS.codeParams(e1), plan = { params: { code } }, R = N.streetRules(plan), E = S.entryRules(plan);
  assert.deepEqual([R.local.row, R.local.pave, R.blockMax, R.culMax, R.bulbR, R.minLotW, R.strict], [60, 28, 1200, 600, 45, 50, true], 'the sheet’s street rules');
  assert.deepEqual([R.collector.row, R.bulbRow, R.frontBL], [RS.WALLER.values.collRow.v, RS.WALLER.values.bulbRow.v, RS.WALLER.values.frontBL.v], 'Waller defaults standing in');
  assert.deepEqual([E.spacing, E.corner], [RS.WALLER.values.drivewaySpacing.v, RS.WALLER.values.drivewayCorner.v]);
  assert.equal(S.stormNeed(100, plan.params, {}).volume.toFixed(2), '60.00', 'the sheet’s detention rate');
  const own = { params: { code, streetRules: { culMax: 700, local: { row: 56 } }, entry: { spacing: 220, corner: null }, storm: { rate: 0.75 } } };
  assert.deepEqual([N.streetRules(own).culMax, N.streetRules(own).local.row, N.streetRules(own).local.pave], [700, 56, 28], 'the plan’s own street rules win, per key');
  assert.deepEqual([S.entryRules(own).spacing, S.entryRules(own).corner], [220, RS.WALLER.values.drivewayCorner.v], 'the plan’s own entry rules win (one left empty: the sheet’s)');
  assert.equal(S.stormNeed(100, own.params, {}).volume.toFixed(2), '75.00', 'the plan’s own storage rate wins');
  assert.equal(N.streetRules({ params: { code: { ...code, streetRules: { ...code.streetRules, culMax: 5, bulbR: 900 } } } }).culMax, 300, 'held to its range');
  assert.match(RS.rulesLine(code), /^Street rules: City of Katy rule sheet \(\d+ values still to confirm; Waller defaults stand in for \d+\)\. The AI’s reading of the code, not a compliance check: confirm with the engineer and the city\.$/);
  assert.equal(RS.rulesLine(null), 'Street rules: typical values (no rule sheet for this place yet).');
  assert.match(RS.rulesLine(RS.codeParams(RS.WALLER)), /Waller County rule sheet \(\d+ values still to confirm\)\. .*the county\.$/, 'Waller’s own sheet: no defaults standing in');
  const si = RS.standIn({ key: 'county:austin', name: 'Austin County' }); assert.ok(RS.KEYS.every(k => si.values[k].from === 'waller' && !si.values[k].sure), 'Waller standing in: every value flagged'); assert.equal(RS.flagged(si).length, RS.KEYS.length); }
{ // homes on parallel streets under a sheet (Waller's): no lot under its smallest, even where the curving streets close
  // the lot lines up towards the front and back of the site; the plan's own street rules over the sheet's there too
  const L = await import('../lib/sitelayout.mjs'), mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
  const b = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]])]), site = { ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9), setbacks: { ...S.SETBACKS } }, code = RS.codeParams(RS.WALLER);
  const os = L.layoutOptions({ ...site, params: { code } }, { use: 'sfr' }, { count: 3 }), small = o => o.elements.filter(e => e.kind === 'lot' && S.ringArea(S.shapeOf(e)) < code.streetRules.minLotSf - 1).length;
  assert.ok(os.length === 3 && os.every(o => o.style !== 'net' && o.elements.filter(e => e.kind === 'lot').length > 10), 'homes on parallel streets');
  assert.deepEqual(os.map(small), [0, 0, 0], 'no lot under the sheet’s ' + code.streetRules.minLotSf + ' sq ft');
  const own = L.layoutOptions({ ...site, params: { code, streetRules: { local: { pave: 32, row: 64 } } } }, { use: 'sfr' }, { count: 1 })[0], st = own.elements.filter(e => e.kind === 'drive' && /^Street · /.test(e.note || ''));
  assert.ok(st.length && st.every(e => /^Street · 32 ft/.test(e.note)), 'the plan’s own pavement over the sheet’s: ' + st.map(e => e.note).join(', ')); }

// ---- 4. the AI reads the codes (api/siteplan.js mode 'rules'), with OpenAI mocked ----
process.env.OPENAI_API_KEY = 'sk-test';
const calls = []; let mode = 'ok', etjAns = { etj: 'Houston', decided: 'out', why: 'Outside Houston’s ETJ on its map', url: 'https://www.houstontx.gov/planning/etj.html' };
const resp = (text, urls) => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text, annotations: urls.map(url => ({ type: 'url_citation', url, title: 't' })) }] }] });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); if (u.includes('/models/')) return Response.json({ id: 'm' }); const b = JSON.parse(opts.body || '{}');
  if (u.includes('/responses')) { const kind = /ETJ/.test(b.instructions) ? 'etj' : /drainage/i.test(b.input) ? 'drainage' : 'rules'; calls.push(kind); if (mode === 'down') return Response.json({ error: { message: 'server error' } }, { status: 500 });
    if (kind === 'etj') return resp('```json\n' + JSON.stringify(etjAns) + '\n```', [etjAns.url]);
    if (kind === 'rules') return resp('§4.2: local streets 60 ft right-of-way, 28 ft pavement. Maximum block length 1,400 ft. Cul-de-sac radius NOT FOUND.', ['https://www.co.waller.tx.us/upload/page/0263/regs.pdf']);
    return resp('Detention: 0.65 acre-feet per acre (Waller County Drainage Criteria, §5).', ['https://www.co.waller.tx.us/upload/page/0263/drainage.pdf']); }
  calls.push('chat'); if (mode === 'chatdown') return Response.json({ error: { message: 'boom' } }, { status: 400 });
  return Response.json({ choices: [{ message: { content: JSON.stringify({ jurisdiction: { name: 'Waller County', kind: 'county' }, summary: 'Waller County regulations; not in Houston’s ETJ.', values: [
    { field: 'localRow', value: 60, choice: null, url: 'https://www.co.waller.tx.us/upload/page/0263/regs.pdf', cite: '§4.2', quote: 'local streets 60 ft right-of-way', sure: true },
    { field: 'detention', value: 0.65, choice: null, url: 'https://www.co.waller.tx.us/upload/page/0263/drainage.pdf', cite: '§5', quote: '0.65 acre-feet per acre', sure: true },
    { field: 'bulbR', value: 50, choice: null, url: 'https://elsewhere.example.org/x', cite: null, quote: null, sure: true }] }) } }] });
};
const API = await import('../api/siteplan.js'), handler = API.default;
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, val) { r.headers[k] = val; } }; return r; };
const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.8.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250) } }, res); return res; };
const strict = (sc, at) => { if (sc?.type === 'object' && sc.properties) { assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), 'strict schema: ' + at); for (const [k, x] of Object.entries(sc.properties)) strict(x, at + '.' + k); } if (sc?.items) strict(sc.items, at + '[]'); };
strict(API.RULES_SCHEMA, 'rules'); strict(API.STREETNAMES_SCHEMA, 'streetNames'); strict(API.EDIT_SCHEMA, 'edit');
{ const J = { county: 'Waller', city: null, districts: [], address: '1 FM 362, Hockley', lat: 30.06, lon: -95.93 };
  let res = await call({ mode: 'rules', jurisdiction: J, known: [] }); assert.equal(res.code, 200);
  assert.deepEqual(calls.slice().sort(), ['chat', 'drainage', 'etj', 'rules'].sort(), 'the ETJ, the two searches, the structuring call'); const s1 = res.body.sheet;
  assert.equal(s1.key, 'county:waller', 'not in an ETJ: the county'); assert.deepEqual(s1.etj, { city: null, decided: 'out', why: 'Outside Houston’s ETJ on its map', url: 'https://www.houstontx.gov/planning/etj.html' });
  assert.deepEqual([s1.values.localRow.sure, s1.values.detention.v, s1.values.detention.sure, s1.values.bulbR.sure], [true, 0.65, true, false], 'sure where the page was read; a page never read unsure');
  assert.equal(RS.sheetIn(s1).key, 'county:waller', 'a sheet the store takes');
  // in Houston's ETJ: the city's rules, keyed so
  etjAns = { etj: 'Houston', decided: 'in', why: 'Inside Houston’s ETJ', url: 'https://www.houstontx.gov/planning/etj.html' }; calls.length = 0; res = await call({ mode: 'rules', jurisdiction: J, known: [] }); assert.equal(res.body.sheet.key, 'etj:houston|county:waller'); assert.equal(res.body.sheet.etj.decided, 'in');
  // known already: the team's sheet, after the ETJ step alone
  calls.length = 0; res = await call({ mode: 'rules', jurisdiction: J, known: ['etj:houston|county:waller'] }); assert.deepEqual([res.body.cached, res.body.key], [true, 'etj:houston|county:waller']); assert.deepEqual(calls, ['etj'], 'no research for a place the team has read');
  calls.length = 0; res = await call({ mode: 'rules', jurisdiction: J, known: ['etj:houston|county:waller'], refresh: true }); assert.ok(res.body.sheet && calls.includes('chat'), 'Refresh reads it again');
  // a city: no ETJ step
  calls.length = 0; res = await call({ mode: 'rules', jurisdiction: { ...J, county: 'Fort Bend', city: 'Katy' }, known: [] }); assert.equal(res.body.sheet.key, 'city:katy'); assert.ok(!calls.includes('etj'), 'a city site: no ETJ call');
  // the search down: Waller County's rules stand in, every value flagged, and the app still gets a sheet
  mode = 'down'; calls.length = 0; res = await call({ mode: 'rules', jurisdiction: { ...J, county: 'Austin' }, known: [] }); assert.equal(res.code, 200); const w = res.body.sheet;
  assert.equal(w.key, 'county:austin'); assert.ok(RS.KEYS.every(k => w.values[k].from === 'waller' && !w.values[k].sure), 'every value a Waller default, unsure'); assert.match(w.summary, /Waller County’s rules stand in/); assert.equal(w.etj.decided, 'unsure', 'the ETJ check failed too: not settled');
  mode = 'chatdown'; res = await call({ mode: 'rules', jurisdiction: { ...J, city: 'Katy' }, known: [] }); assert.equal(res.code, 200); assert.ok(RS.KEYS.every(k => res.body.sheet.values[k].from === 'waller'), 'the structuring call fails: Waller standing in');
  mode = 'ok'; res = await call({ mode: 'rules', jurisdiction: { city: 'Katy' } }); assert.equal(res.code, 400, 'no county: asked for it'); }

// ---- 5. the team's shared sheets (api/rulesheets.js) ----
{ const store = []; let table = true; const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => { const u = new URL(String(url)), m = opts.method || 'GET'; if (!table) return new Response('{"code":"42P01","message":"relation \\"public.site_rule_sheets\\" does not exist"}', { status: 404 });
    assert.equal(u.pathname, '/rest/v1/site_rule_sheets');
    if (m === 'GET') { const ks = u.searchParams.get('key'); return Response.json(ks ? store.filter(r => ks.slice(4, -1).split(',').map(x => x.replace(/"/g, '')).includes(r.key)) : store.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))); }
    for (const r of JSON.parse(opts.body)) { const i = store.findIndex(x => x.key === r.key); if (i >= 0) store[i] = r; else store.push(r); } return new Response(null, { status: 201 }); };
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const { default: h } = await import('../api/rulesheets.js'), go = async (method, body, headers = {}) => { const res = mock(); await h({ method, body, headers: { 'x-forwarded-for': '8.8.7.' + Math.floor(Math.random() * 250), ...headers } }, res); return res; };
  let res = await go('POST', { name: 'Matthew', sheets: [sh, { key: '../x', values: {} }, { ...sh, key: 'county:junk', values: { localRow: { v: 1e9 } } }] }); assert.equal(res.code, 200); assert.equal(res.body.saved, 1, 'a bad key and a sheet with no good value dropped');
  res = await go('POST', { sheets: [{ ...sh, summary: 'older', updated: '2026-10-01T00:00:00.000Z' }] }); assert.equal(res.body.skipped, 1, 'an older copy doesn’t overwrite');
  res = await go('POST', { name: 'Ana', sheets: [c1] }); assert.equal(res.body.saved, 1, 'a value confirmed on another device');
  res = await go('GET'); assert.deepEqual(res.body.sheets.map(s => s.key), ['city:katy']); assert.equal(res.body.sheets[0].values.culMax.ok.by, 'Matthew', 'the confirmation kept'); assert.equal(store[0].updated_by, 'Ana', 'who changed it last');
  res = await go('POST', { deletes: ['city:katy', '../x'] }); assert.equal(res.body.deleted, 1); res = await go('GET'); assert.deepEqual([res.body.sheets.length, res.body.deleted], [0, ['city:katy']], 'a tombstone for other devices');
  res = await go('PUT', {}); assert.equal(res.code, 405);
  process.env.FIELD_ACCESS_CODE = 'gate'; res = await go('GET'); assert.equal(res.code, 401); res = await go('GET', null, { 'x-field-code': 'gate' }); assert.equal(res.code, 200); delete process.env.FIELD_ACCESS_CODE;
  table = false; res = await go('GET'); assert.deepEqual([res.code, res.body.local], [503, true], 'no table yet: the browser keeps its sheets on the device');
  delete process.env.SUPABASE_SECRET_KEY; table = true; res = await go('GET'); assert.deepEqual([res.code, res.body.local], [503, true], 'no secret key: this device only');
  globalThis.fetch = fetch0; }

// ---- 6. street names ----
{ const ch = [{ key: 'a', role: 'collector', L: 9000 }, { key: 'b', role: 'boulevard', L: 900 }, { key: 'c', role: 'local', L: 1200 }, { key: 'd', role: 'local', L: 800 }, { key: 'e', role: 'court', L: 400 }, { key: 'f', role: 'court', L: 300 }, { key: 'g', role: 'entry', L: 150 }];
  const base = n => SN.baseOf(n).toLowerCase(), uniq = m => new Set([...m.values()].map(base)).size === m.size;
  const p1 = SN.plainNames(ch, ['Oak Ln', 'N Cedar Rd', 'FM 362']); assert.deepEqual([...SN.plainNames(ch, ['Oak Ln', 'N Cedar Rd', 'FM 362'])], [...p1], 'the plain list is the same each time');
  assert.ok(uniq(p1), 'unique bases'); assert.ok(![...p1.values()].some(n => ['oak', 'cedar'].includes(base(n))), 'none like the streets nearby'); assert.ok(!p1.has('g'), 'a short way in takes the name of the street it meets');
  assert.ok(/ (Parkway|Boulevard|Drive)$/.test(p1.get('a')) && / (Parkway|Boulevard)$/.test(p1.get('b')), 'the collector and the boulevard grander'); assert.ok(/ (Court|Circle)$/.test(p1.get('e')) && / (Lane|Way|Drive|Trail)$/.test(p1.get('c')), 'courts Court or Circle, locals Lane, Way…');
  const aiN = [{ id: 'a', base: 'Fairway', suffix: 'Parkway' }, { id: 'b', base: 'fairway', suffix: 'Boulevard' }, { id: 'c', base: 'Birdie', suffix: 'Parkway' }, { id: 'd', base: 'Eagle Lane', suffix: 'Lane' }, { id: 'e', base: 'Oak', suffix: 'Court' }, { id: 'f', base: '<b>Links</b> 99', suffix: 'Circle' }];
  const m = SN.namesFor(ch, aiN, { avoid: ['Oak Ln'] });
  assert.equal(m.get('a'), 'Fairway Parkway'); assert.notEqual(base(m.get('b')), 'fairway', 'a duplicate base replaced'); assert.equal(m.get('c'), 'Birdie Lane', 'a suffix the role doesn’t take: its first'); assert.equal(m.get('d'), 'Eagle Lane', 'no suffix word inside the base');
  assert.notEqual(base(m.get('e')), 'oak', 'a name nearby replaced'); assert.equal(m.get('f'), 'Links Circle', 'cleaned'); assert.ok(uniq(m));
  assert.equal(SN.clean('  the  oaks   lane '), 'The Oaks'); assert.equal(SN.baseOf('N Stokes Rd'), 'Stokes');
  // a big community (a 640-acre square lays out 70 to 90 streets), or one beside many roads named for trees and birds: past
  // the plain list, still every street named, all different, and quickly (it once looped for ever)
  const many = Array.from({ length: 200 }, (_, i) => ({ key: 'k' + i, role: i % 9 ? 'local' : 'court', L: 9000 - i })), t0 = Date.now(), big = SN.plainNames(many, SN.PLAIN.slice(0, 60).map(b => b + ' Rd'));
  assert.ok(Date.now() - t0 < 500 && big.size === 200 && uniq(big), 'past the plain list: ' + big.size + ' named'); assert.ok([...big.values()].every(n => /^[A-Za-z]+ [A-Za-z]+$/.test(n)), 'plain words only, no punctuation (911)');
  assert.ok(SN.PLAIN.every(w => /^[A-Za-z]+$/.test(w)), 'the plain list: one plain word each');
  const lk = SN.namesFor([{ key: 'a', role: 'local', L: 9 }, { key: 'b', role: 'local', L: 8 }, { key: 'c', role: 'local', L: 7 }], [{ id: 'a', base: 'Oak', suffix: 'Lane' }, { id: 'b', base: 'Live Oak', suffix: 'Lane' }, { id: 'c', base: 'Bunker Hill', suffix: 'Way' }], { avoid: ['Bunker Rd'] });
  assert.ok(!/Oak/.test(lk.get('b')) && !/Bunker/.test(lk.get('c')), 'Oak and Live Oak, Bunker and Bunker Hill: too alike');
  // the AI names them (mocked): checked the same way
  let reply = null; const fetch0 = globalThis.fetch; globalThis.fetch = async (url, opts = {}) => String(url).includes('/models/') ? Response.json({ id: 'm' }) : Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
  reply = { theme: 'golf', names: [{ id: 'a', base: 'Fairway', suffix: 'Parkway' }, { id: 'c', base: 'Fairway', suffix: 'Lane' }, { id: 'e', base: 'Bunker', suffix: 'Court' }] };
  let res = await call({ mode: 'streetNames', theme: 'golf', streets: ch.map(c => ({ id: c.key, kind: c.role, lengthFt: c.L })), avoid: ['Bunker Hill Rd'] }); assert.equal(res.code, 200); const got = new Map(res.body.names.map(x => [x.id, x.base + ' ' + x.suffix]));
  assert.equal(res.body.theme, 'golf'); assert.equal(got.get('a'), 'Fairway Parkway'); assert.notEqual(SN.baseOf(got.get('c')), 'Fairway', 'a duplicate replaced'); assert.notEqual(SN.baseOf(got.get('e')), 'Bunker', 'a street nearby avoided'); assert.ok(uniq(got) && got.size === 6, 'every street but the short way in named, all different');
  globalThis.fetch = async u => String(u).includes('/models/') ? Response.json({ id: 'm' }) : Response.json({ error: { message: 'bad request' } }, { status: 400 }); res = await call({ mode: 'streetNames', streets: [{ id: 'a', kind: 'local', lengthFt: 500 }] }); assert.equal(res.code, 502, 'the AI down: the app falls back to the plain list');
  res = await call({ mode: 'streetNames', streets: [] }); assert.equal(res.code, 400); globalThis.fetch = fetch0; }
console.log('rule sheets and street names ok');
