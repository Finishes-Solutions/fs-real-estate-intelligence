// Offline tests for a project's page (lib/project.mjs): the status list and tabs, the site's jurisdiction facts as the
// Overview tab shows them and as the AI reads them, and the fact sheet the Ask tab sends (its contents and its size).
import assert from 'node:assert/strict';
const PJ = await import('../lib/project.mjs');
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PF = await import('../lib/proforma.mjs'), A = await import('../lib/planask.mjs');

// ---- status and tabs ----
assert.deepEqual(PJ.STATUSES.map(s => s.label), ['Prospect', 'Under review', 'Under contract', 'Owned', 'On hold', 'Dead']);
assert.equal(PJ.statusOf({}).label, 'Prospect', 'no status yet: a prospect'); assert.equal(PJ.statusOf({ status: 'owned' }).label, 'Owned'); assert.equal(PJ.statusOf({ status: 'bogus' }).id, 'prospect');
assert.deepEqual(PJ.TABS.map(t => t.id), ['overview', 'options', 'renderings', 'ask']); assert.equal(PJ.tabOf('ask'), 'ask'); assert.equal(PJ.tabOf('<x>'), 'overview'); assert.equal(PJ.tabOf(undefined), 'overview');

// ---- facts from /api/site's answer (shaped like test/site.mjs) ----
const site = { flood: { zone: 'AE', subtype: null, risk: 'high', bfe: 51.2 }, traffic: { roads: [{ road: 'I-10', aadt: 250000 }, { road: 'City street', aadt: 11969 }] },
  districts: { water: [{ name: 'Harris County MUD 61', type: 'Municipal Utility District', active: true }], tirz: ['Downtown (TIRZ 3)'], opportunityZone: true, schools: ['Houston Independent School District'] },
  environment: { total: 3, flaggedCount: 2, flagged: [] }, transit: { stops: 14 }, crime: { big: 'x'.repeat(5000) }, place: { name: 'Houston', full: 'Houston city' } };
const f = PJ.siteFactsFrom(site, { county: 'Harris', utilities: ['Nearest mapped 138 kV transmission line, 0.3 mi', 'Water service area: City of Houston (CCN 10495)'], parcels: 2 });
assert.deepEqual(f.place, { name: 'Houston', full: 'Houston city' }); assert.equal(f.flood.zone, 'AE'); assert.deepEqual(f.road, { road: 'I-10', aadt: 250000 }); assert.deepEqual(f.epa, { total: 3, flagged: 2 });
assert.equal(f.opportunityZone, true); assert.equal(f.parcels, 2); assert.ok(!('crime' in f) && !('transit' in f), 'only what the card shows is kept');
assert.ok(JSON.stringify(f).length < 2000, 'small enough to keep on the project');
let rows = PJ.jurisdictionRows(f), row = id => rows.find(r => r.id === id);
assert.deepEqual(rows.map(r => r.id), ['county', 'city', 'zoning', 'flood', 'water', 'schools', 'tirz', 'oz', 'road', 'epa', 'utilities', 'replat']);
assert.equal(row('county').value, 'Harris County'); assert.equal(row('city').value, 'City of Houston'); assert.equal(row('city').src, 'US Census');
assert.equal(row('zoning').value, 'No zoning'); assert.match(row('zoning').sub, /Houston has no zoning/);
assert.equal(row('flood').value, 'FEMA zone AE'); assert.match(row('flood').sub, /100-year floodplain.*Base flood elevation 51.2 ft/); assert.equal(row('flood').tone, 'warn'); assert.equal(row('flood').src, 'FEMA');
assert.equal(row('water').value, 'Harris County MUD 61'); assert.equal(row('water').src, 'TCEQ');
assert.match(row('road').value, /I-10 · 250,000 vehicles a day/); assert.match(row('epa').value, /3 within ¼ mile, 2 with violations/); assert.equal(row('utilities').list.length, 2);
// unincorporated, nothing found, and the parts that failed left out
const g = PJ.siteFactsFrom({ flood: { error: 'HTTP 503' }, traffic: { roads: [] }, districts: { water: [], tirz: [], opportunityZone: false, schools: [] }, environment: { total: 0, flaggedCount: 0 }, place: null }, { county: 'Waller' });
rows = PJ.jurisdictionRows(g);
assert.ok(!row('flood'), 'a failed source is skipped'); assert.equal(row('city').value, 'Unincorporated'); assert.match(row('city').sub, /extraterritorial/);
assert.equal(row('zoning').value, 'No zoning'); assert.match(row('zoning').sub, /counties generally can’t zone/); assert.equal(row('water').value, 'None found'); assert.equal(row('water').tone, 'warn');
assert.equal(row('road').value, 'No traffic count within about 1,000 ft'); assert.equal(row('epa').value, 'None within ¼ mile'); assert.equal(row('oz').value, 'No'); assert.ok(!row('schools'));
// the city lookup failed and Regrid wasn't fetched: City and Zoning say how to find out
rows = PJ.jurisdictionRows(PJ.siteFactsFrom({ place: { error: 'down' } }, {}));
assert.equal(row('city').value, 'Not checked'); assert.match(row('city').sub, /Regrid/); assert.equal(row('zoning').value, 'Not checked');
assert.equal(PJ.siteFactsFrom({ error: 'offline' }).flood, undefined, 'a failed lookup: nothing known');
// Regrid's city and zoning, from a parcel (or the zoning an option was started with)
const rg = PJ.regridFacts([{ label: 'a' }, { regrid: { city: 'KATY', zoning: { zoning: 'C-2', zoning_description: 'General commercial', max_building_height_ft: 45 } } }], []);
rows = PJ.jurisdictionRows({ ...PJ.siteFactsFrom({ place: { error: 'down' } }), ...rg });
assert.equal(row('city').value, 'Katy'); assert.equal(row('city').src, 'Regrid'); assert.equal(row('zoning').value, 'C-2 · General commercial'); assert.match(row('zoning').sub, /height 45 ft/);
rows = PJ.jurisdictionRows({ place: { name: 'Katy' }, ...PJ.regridFacts([{ regrid: { city: 'KATY', zoning: null } }]) }); assert.equal(row('zoning').value, 'None in Regrid’s record');
assert.deepEqual(PJ.regridFacts([], [{ zoning: { zoning: 'PD' } }]).zoning, { zoning: 'PD' }, 'an option’s zoning counts'); assert.deepEqual(PJ.regridFacts([], []), {});
// for the AI: one line a fact, with its source
const lines = PJ.jurisdictionText(f);
assert.ok(lines.some(l => /^Floodplain: FEMA zone AE \(In the 100-year floodplain.*\[source: FEMA\]$/.test(l)), lines.join('\n'));
assert.ok(lines.some(l => /^City: City of Houston/.test(l))); assert.ok(lines.some(l => /^Utilities: Nearest mapped 138 kV.*; Water service area/.test(l)));

// ---- the Ask tab's fact sheet ----
const ring = [[0, 0], [600, 0], [600, 420], [0, 420]], plan = { ring, front: 0, setbacks: S.SETBACKS, program: { use: 'retail', gfa: 25000 } };
const o = L.layoutOptions(plan, plan.program)[0], pl = { ...plan, name: 'Option A', elements: o.elements, lastRun: { ask: '25,000 sf retail strip', summary: 'A one-story strip.' } };
const F = A.planFacts(pl, { site: { acres: 5.79, frontageFt: 600 }, pf: PF.run(pl, PF.defaults(pl)) });
const p = { name: 'Katy pad', status: 'review', client: 'Acme Retail', use: 'Strip center with pads', notes: 'Asking $2.1M. Broker: Jones.', created: '2026-10-01T10:00:00Z', updated: '2026-10-12T10:00:00Z',
  parcels: [{ label: '1 Main St', owner: 'Smith LLC', acres: 5.79, marketValue: 2000000, landValue: 1500000, geometry: { big: 'x'.repeat(9000) } }] };
const sheet = PJ.projectFacts(p, { acres: 5.79, jurisdiction: f, checkedAt: '2026-10-18T09:00:00Z', options: [{ facts: F, name: 'Option A', renderings: 3, drawn: true }, { name: 'Option B', drawn: false }] });
assert.equal(sheet.project.status, 'Under review'); assert.equal(sheet.project.client, 'Acme Retail'); assert.equal(sheet.project.targetUse, 'Strip center with pads'); assert.equal(sheet.project.appraisedValueTotal, 2000000);
assert.ok(!JSON.stringify(sheet).includes('xxxx'), 'parcel outlines stay out'); assert.ok(sheet.jurisdiction.some(l => /MUD 61/.test(l))); assert.equal(sheet.jurisdictionCheckedOn, '2026-10-18');
const a0 = sheet.options[0]; assert.equal(a0.option, 'Option A'); assert.equal(a0.renderings, 3); assert.equal(a0.program.use, 'Retail'); assert.ok(a0.totals.floorAreaSf > 20000); assert.ok(a0.parking.required > 0);
assert.ok(a0.proForma.totalCost > 0 && a0.proForma.yieldOnCostPct > 0, 'the pro forma headline'); assert.equal(a0.request, '25,000 sf retail strip'); assert.ok(!('pieces' in a0), 'no pieces: a summary');
assert.deepEqual(sheet.options[1], { option: 'Option B', siteDrawn: false });
assert.equal(PJ.projectFacts({ name: 'Empty' }, {}).jurisdiction, 'not looked up yet');
// many options: under 40 KB, the details cut before any option is dropped, then the last ones
const many = Array.from({ length: 12 }, (_, i) => ({ facts: { ...F, option: 'Option ' + i }, name: 'Option ' + i, renderings: i, drawn: true }));
let big = PJ.projectFacts({ ...p, notes: 'n'.repeat(8000) }, { acres: 5.79, jurisdiction: f, options: many });
assert.ok(JSON.stringify(big).length <= 40000, 'kept under 40 KB: ' + JSON.stringify(big).length); assert.equal(big.options.length, 12, 'all twelve options still there'); assert.ok(big.project.notes.length <= 1500);
const huge = Array.from({ length: 120 }, (_, i) => ({ facts: { ...F, option: 'Option ' + i }, name: 'Option ' + i, drawn: true }));
big = PJ.projectFacts(p, { jurisdiction: f, options: huge }); assert.ok(JSON.stringify(big).length <= 40000); assert.ok(big.options.length < 120 && big.options.length > 20); assert.match(big.optionsLeftOut, /more options not included/);
assert.equal(PJ.ASK_STARTERS.length, 4); assert.ok(PJ.ASK_STARTERS.includes('What approvals will this site need?'));
console.log('project page ok');
