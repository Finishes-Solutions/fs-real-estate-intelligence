// How requests are understood (lib/siteplan.mjs tidyRequest / guessProgram, lib/layoutintent.mjs, lib/layoutbrief.mjs):
// messy numbers and typos, open requests, where things go (program.placements) and what the plan says about each ask;
// the AI's replies (fixtures, no network) through the same mapping; and a fast subset of the request corpus laid out
// end to end (scripts/prompt-corpus.mjs scores all of it).
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as B from '../lib/layoutbrief.mjs';
import * as I from '../lib/layoutintent.mjs';
import { CASES, FAST } from './fixtures/prompt-corpus.mjs';
import { REPLIES, TYPE_REPLIES } from './fixtures/prompt-ai-replies.mjs';
import { planOf, readingChecks, runWords } from '../scripts/prompt-corpus.mjs';

process.env.OPENAI_API_KEY ||= ''; // (the API module is imported for its mapping only; nothing here calls a model)
const t0 = Date.now();

// ---- numbers, units and typos ----
const read = t => S.guessProgram(t);
assert.equal(S.tidyRequest('120 garden apartments, 3 stories'), '120 garden apartments, 3 stories', 'clean words come back unchanged');
assert.deepEqual([read('appartments 120 untis').use, read('appartments 120 untis').units], ['multifamily', 120]);
assert.equal(read('250k sf warehouse').gfa, 250000); assert.equal(read('office 60ksf 3 flrs 4/1000').gfa, 60000); assert.equal(read('office 60ksf 3 flrs 4/1000').floors, 3);
assert.equal(read('30k retail').gfa, 30000, '"30k retail" is square feet');
assert.equal(read('200 units, 1.5 spaces/unit').perUnit, 1.5); assert.equal(read('senior apartments, 4 stories, 1 space per unit').perUnit, 1);
assert.equal(read('senior apartments, 4 stories, 1 space per unit').units, undefined, '"1 space per unit" is a parking rule, not one unit');
assert.equal(read('4 spaces per 1,000 sf office 20,000 sf').gfa, 20000, '"per 1,000 sf" is a ratio, not a size');
assert.equal(read('4-story apts, 180 du').units, 180); assert.equal(read('townhouses (for sale) ~60, 2 car garage').units, 60);
assert.equal(read('250K SF distribution center w/ 3 acre pond').pondAc, 3); assert.equal(read('apartments, 25 du/ac').density, 25);
assert.deepEqual(read('180 apartments with 50 ft setbacks on all sides').setbacks, { front: 50, side: 50, rear: 50 });
assert.deepEqual(read('150 garden apartments, front setback 40 ft, side 15 ft, rear 30 ft').setbacks, { front: 40, side: 15, rear: 30 });
assert.equal(read('300,000 sf warehouse, truck court with trailer parking').use, 'industrial', 'trailer parking is not a trailer park');
assert.equal(read('180 apartments, regional detention so no pond on site').storm, 'none');
assert.equal(B.quantityFromWords('3-4 story apartments'), null, 'a storey range is not a unit range');
assert.equal(B.quantityFromWords('1.75 spaces per unit, 3 stories'), null, 'a ratio’s decimals are not a count');
// the words' spatial phrases don't make uses: a pool in the center isn't a shopping center, the neighbours' homes aren't homes to build
assert.equal(read('200 garden apartments with the pool in the center').use, 'multifamily');
assert.equal(read('200 garden apartments with the pool in the center').arrangement, 'loop', 'the resort loop round a central pool');
assert.equal(read('120 townhomes, buffer the single-family homes to the west').zones, undefined);
assert.equal(read('160 apartments, dog park in the corner').zones, undefined, 'a dog park is the apartments’ own, not a commons zone');

// ---- with the building types (lib/btypes.mjs): presets still read; an open request isn't a custom type ----
{
  const plan = planOf('R10'), q = t => B.briefFromRequest(t, plan).program.uses.map(u => u.use + ' ' + u.quantity.mode + (u.quantity.value != null ? ' ' + u.quantity.value : '')).join('; ');
  assert.equal(read('a 6-story hotel with 120 keys').btype, 'hotel-limited'); assert.equal(read('3-story self storage 90,000 sf').btype, 'storage-multi');
  assert.equal(read('a 2-story trampoline park 30,000 sf').btype, 'custom'); assert.equal(q('a 2-story trampoline park 30,000 sf'), 'other exact 30000', 'a named type with its size is not an open request');
  assert.equal(read('L-shaped 4-story apartments').btype, 'mf-l'); assert.equal(q('L-shaped 4-story apartments'), 'multifamily maximize', '"4-story apartments" is not 4 apartments');
  assert.equal(read('assisted living, 120 beds').btype, 'senior-al'); assert.equal(read('senior living').btype, 'senior-il');
  assert.equal(q('whatever makes the most money here'), 'multifamily maximize', '"the most money here" is no building type');
}

// ---- where things go: the vocabulary ----
const P = (t, uses) => I.placementsFromWords(t, uses).map(p => [p.subject, p.rel, p.edge || p.target || '', p.ft || ''].join(' ').trim());
assert.deepEqual(P('retail along the main road with apartments behind', ['retail', 'multifamily']), ['retail front', 'multifamily behind retail']);
assert.deepEqual(P('keep the trees on the north side', ['multifamily']), ['open space keep north']);
assert.deepEqual(P('180 apartments, keep 100 ft of open space along the east line', ['multifamily']), ['open space keep east 100']);
assert.deepEqual(P('no buildings within 75 feet of the west property line', ['multifamily']), ['buildings away west 75']);
assert.deepEqual(P('buffer the neighbours to the west', ['townhomes']), ['buildings away west']);
assert.deepEqual(P('30,000 sf retail with the entrance off the side street', ['retail']), ['entrance edge side']);
assert.deepEqual(P('warehouse at the rear with the truck court facing east', ['industrial']), ['industrial back', 'truck court facing east']);
assert.deepEqual(P('200 apartments with the clubhouse at the entry', ['multifamily']), ['clubhouse near entrance']);
assert.deepEqual(P('dog park in the corner', ['multifamily']), ['dog park corner']);
assert.deepEqual(P('the pool and clubhouse up front by the street', ['multifamily']), ['pool front', 'clubhouse front']);
assert.deepEqual(P('parking hidden behind the buildings', ['multifamily']), ['parking behind buildings']);
assert.deepEqual(P('docks facing away from the street', ['industrial']), ['truck court facing back']);
assert.deepEqual(P('keep the southwest corner open for a future pad', ['multifamily']), ['open space keep southwest']);
assert.deepEqual(P('120 garden apartments, 3 stories, with a clubhouse and pool', ['multifamily']), [], 'nothing placed, nothing read');
// edges by compass and by role, on a site whose street is on the east
{ const ring = SITE_E(); assert.deepEqual(I.edgesFor(ring, 1, [], 'west'), [3]); assert.deepEqual(I.edgesFor(ring, 1, [], 'back'), [3]); assert.deepEqual(I.edgesFor(ring, 1, [], 'front'), [1]); assert.deepEqual(I.edgesFor(ring, 1, [], 'north'), [2]); }
function SITE_E() { return [[0, 0], [500, 0], [500, 900], [0, 900]]; }

// ---- the brief: placements typed and checked; old briefs unchanged ----
{
  const plan = planOf('R10'), old = B.briefFromRequest('120 garden apartments, 3 stories', plan);
  assert.equal(old.program.placements, undefined, 'a request that places nothing carries no placements');
  const withEmpty = JSON.parse(JSON.stringify(old)); withEmpty.program.placements = [];
  assert.equal(B.inputHash(withEmpty), B.inputHash(old), 'an empty list hashes as none (old briefs keep their hash)');
  const b = B.briefFromRequest('180 apartments, keep the trees on the north side', plan);
  assert.ok(B.validateBrief(b).ok); assert.equal(b.program.placements[0].how, 'engine');
  assert.ok(b.site.exclusions.some(x => /open land kept/.test(x.source)), 'the strip is kept out of the layout (an exclusion the validator checks)');
  const bad = JSON.parse(JSON.stringify(b)); bad.program.placements.push({ subject: 'pool', rel: 'sideways' });
  assert.ok(!B.validateBrief(bad).ok, 'an unknown placement is an invalid brief');
  const v = B.briefFromRequest('something that pencils on this lot', plan);
  assert.equal(v.program.uses[0].use, 'multifamily'); assert.ok(v.request.assumed.some(a => /No use named/.test(a)), 'an open request says what it assumed');
  const s = B.briefFromRequest('a 50 ft landscape buffer along the north line, 200 apartments', plan); assert.equal(s.program.placements[0].ft, 50);
}

// ---- the AI's replies through the app's mapping (no network) ----
{
  const { programFrom, SCHEMA, SYSTEM } = await import('../api/siteplan.js');
  assert.ok(SCHEMA.required.includes('placements') && SCHEMA.properties.placements.items.properties.rel.enum.includes('keep'), 'the program schema carries placements');
  for (const w of ['behind', 'keep', 'away', 'facing', 'neighbours', 'entrance', 'dog park']) assert.ok(SYSTEM.includes(w), 'the instructions name ' + w);
  for (const [id, d] of Object.entries(REPLIES).filter(([k]) => k !== 'JUNK')) {
    const c = CASES.find(x => x.id === id), plan = { ...planOf(c.site) }, sb = Object.fromEntries(Object.entries(d.setbacks || {}).filter(([, v]) => v != null)); plan.setbacks = { ...plan.setbacks, ...sb };
    const prog = programFrom(d, c.ask), brief = B.briefFromProgram(S.normalizeProgram(prog), plan, { text: c.ask, parser: 'ai' });
    if (d.assumptions?.length) brief.request.assumed = [...(brief.request.assumed || []), ...d.assumptions];
    assert.ok(B.validateBrief(brief).ok, id + ': a valid brief');
    const miss = readingChecks(c, brief).filter(x => !x.ok); assert.deepEqual(miss.map(x => x.name + ' → ' + x.got), [], id + ': the AI’s reading kept');
  }
  const j = programFrom(REPLIES.JUNK, '150 apartments'); assert.deepEqual(j.placements.map(p => [p.subject, p.rel, p.edge || ''].join(' ').trim()), ['pool corner', 'dog park corner northeast'], 'unknown subjects and relations dropped; an unknown edge left off');
  assert.deepEqual(programFrom({ ...REPLIES.M04, use: 'retail', units: null, perUnit: null, compare: true }, 'mixed use').zones.map(z => z.use), ['retail', 'multifamily'], '"mixed use" answered as one use: the words’ shops and apartments');
  // the AI's placement survives the app's normalising and reaches the brief beside the words' own
  const b = B.briefFromProgram(S.normalizeProgram(programFrom(REPLIES.S06, 'big warehouse')), planOf('B40'), { text: 'big warehouse', parser: 'ai' });
  assert.deepEqual(b.program.placements.map(p => p.subject + ' ' + p.rel), ['industrial back', 'truck court facing']);
}

// ---- building types named by the AI (buildingType, zones[].preset) through the words' own preset code (no network) ----
{
  const { programFrom, customFrom, SCHEMA, SYSTEM } = await import('../api/siteplan.js');
  const BT = await import('../lib/btypes.mjs'), RUN = await import('../lib/layoutrun.mjs');
  assert.deepEqual(SCHEMA.properties.buildingType.properties.preset.enum.filter(Boolean).sort(), [...BT.AI_PRESET_IDS].sort(), 'the schema offers every preset');
  assert.ok(SCHEMA.required.includes('buildingType') && SCHEMA.properties.zones.items.required.includes('preset'), 'a single use and each zone of a mix can name one');
  for (const id of BT.AI_PRESET_IDS) assert.ok(SYSTEM.includes('- ' + id + ': '), 'the instructions list ' + id);
  assert.ok(BT.presetTable().length < 5000, 'the presets table stays short (' + BT.presetTable().length + ' chars)');
  const run = ([ask, d]) => customFrom(d, programFrom(d, ask));
  const R = Object.fromEntries(Object.entries(TYPE_REPLIES).map(([k, x]) => [k, run(x)]));
  // the words don't know "an inn": the model's preset sizes it by its rooms, 550 sf a key, its floors the preset's (none said)
  assert.equal(R.inn.program.btype, 'hotel-limited'); assert.equal(R.inn.program.gfa, 80 * 550); assert.equal(R.inn.program.floors, undefined, 'the model’s guess at floors dropped: none in the words');
  // a daycare by its children, the preset's own recipe (play yard, 0.2 a child) rather than the model's
  { const p = R.toddlers.program; assert.equal(p.btype, 'daycare'); assert.deepEqual(p.btCounts, { children: 90 }); assert.equal(p.custom.name, 'Daycare'); assert.equal(p.custom.parking.rate, 0.2); assert.ok(p.custom.outdoor.some(o => o.kind === 'play')); assert.equal(R.toddlers.note, undefined); }
  // a K-8 school read as a middle school (the model's variant): 140 sf a student, a play yard and a field
  { const p = R.k8.program; assert.equal(p.btype, 'school'); assert.equal(p.custom.name, 'Middle school'); assert.equal(p.btCounts.students, 650); assert.equal(Math.round(p.gfa / 1000), Math.round(650 * 140 / 1000)); }
  // the preset's numbers over the model's: cold storage parks 0.3 a 1,000; a data centre has no truck court and its yard
  assert.equal(R.cold.program.btype, 'cold-storage'); assert.equal(R.cold.program.ratio, 0.3); assert.equal(R.cold.program.btRule.v, 0.3);
  assert.equal(R.colo.program.btype, 'data-center'); assert.equal(R.colo.program.truck, false); assert.equal(R.colo.program.btSite.kind, 'yard');
  // beds: 480 beds in 4-bed units is 120 units, parked 0.6 a bed; the floor area from the units, not the model's units at 900 sf
  { const p = R.dorm.program; assert.equal(p.btype, 'student'); assert.equal(p.units, 120); assert.equal(p.bedsPerUnit, 4); assert.equal(p.perUnit, 2.4); assert.equal(p.gfa, Math.round(120 * 1100 / 0.85)); }
  assert.equal(R.quads.program.btype, 'plex'); assert.equal(R.quads.program.plex, 4); assert.equal(R.quads.program.units, 48);
  { const p = R.slim.program; assert.equal(p.btype, 'point-tower'); assert.equal(p.point, true); assert.equal(p.form, 'tower'); assert.equal(p.floors, 18, 'floors the words give stand'); }
  assert.equal(R.ell.program.btype, 'mf-l'); assert.equal(R.ell.program.form, 'L', 'a shape the words put another way: the model’s preset');
  // a type a zone: the hotel zone sized by its 150 keys (82,500 sf, not the model's 80,000), its buildings tagged after the run
  { const p = R.hotelMix.program; assert.deepEqual(p.btZones.map(z => [z.zone, z.btype]), [[1, 'hotel-limited']]); assert.equal(p.zones[1].gfa, 150 * 550); assert.equal(p.zones[0].gfa, 25000); }
  // no preset: the model's own recipe, and the notes say no preset matched
  assert.equal(R.kart.program.btype, undefined); assert.equal(R.kart.program.custom.name, 'Indoor go-kart track'); assert.ok(/No building-type preset matches/.test(R.kart.note));
  // the model naming no preset where the words name one: the words' preset (as the words path would)
  { const d = { ...TYPE_REPLIES.cold[1], ...{ buildingType: { preset: null, count: null, bedsPerUnit: null, mezzanine: null, variant: null } } }; const p = run(['cold storage warehouse 200,000 sf', { ...d, gfa: 200000 }]).program; assert.equal(p.btype, 'cold-storage'); assert.equal(p.gfa, 200000); }
  // live misreadings fixed: a courtyard building the model called mf-u keeps the engine's courtyard form; a big box the
  // model cut to 120,000 sf "to fit" keeps the 125,000 asked (the engine fits the most that works and says so); a count
  // the model picked inside the range asked stays the range
  { const d = { ...TYPE_REPLIES.ell[1], units: 160, floors: 4, form: 'U', buildingType: { ...TYPE_REPLIES.ell[1].buildingType, preset: 'mf-u' } }, p = run(['courtyard building, 4 stories, 160 units', d]).program;
    assert.equal(p.btype, undefined); assert.equal(B.briefFromProgram(p, planOf('R10'), { text: 'courtyard building, 4 stories, 160 units', parser: 'ai' }).program.uses[0].form, 'mf-courtyard'); }
  assert.equal(run(['a 125,000 sf home improvement store', { ...TYPE_REPLIES.cold[1], ...{ buildingType: { preset: 'big-box', count: null, bedsPerUnit: null, mezzanine: null, variant: null } }, use: 'retail', gfa: 120000, ratio: 4, truck: null }]).program.gfa, 125000);
  assert.deepEqual(B.briefFromProgram(programFrom({ ...REPLIES.M04, units: 220, perUnit: null }, 'between 200 and 240 apartments'), planOf('R10'), { text: 'between 200 and 240 apartments', parser: 'ai' }).program.uses[0].quantity, { mode: 'range', min: 200, max: 240, unit: 'units' });
  // an unknown preset id is ignored
  assert.equal(run(['apartments in an L, 140 units', { ...TYPE_REPLIES.ell[1], buildingType: { ...TYPE_REPLIES.ell[1].buildingType, preset: 'spaceport' } }]).program.btype, undefined, 'an id that names no preset: none (the words name none either)');
  // laid out: realistic sites, the buildings tagged as the preset with what they count (as the app runs the AI's program: raw, not re-normalized)
  const lay = (k, site) => { const [ask] = TYPE_REPLIES[k], b = B.briefFromProgram(R[k].program, planOf(site), { text: ask, parser: 'ai' }); assert.ok(B.validateBrief(b).ok, k + ': a valid brief'); return RUN.runBrief(b).options[0].elements; };
  { const els = lay('inn', 'R5'), h = els.filter(e => e.btype === 'hotel-limited'); assert.ok(h.length > 0); assert.equal(h.reduce((s, e) => s + e.keys, 0), 80); }
  { const els = lay('hotelMix', 'W20'), h = els.filter(e => e.btype === 'hotel-limited'); assert.equal(h.reduce((s, e) => s + e.keys, 0), 150); assert.ok(els.some(e => e.kind === 'building' && e.use === 'retail')); }
  { const els = lay('toddlers', 'R5'); assert.equal(els.filter(e => e.btype === 'daycare').reduce((s, e) => s + e.children, 0), 90); assert.ok(els.some(e => e.kind === 'play')); }
}

// ---- the corpus, fast subset, end to end: read, laid out, met (or said) ----
for (const id of FAST) {
  const c = CASES.find(x => x.id === id), { row, rec } = runWords(c);
  assert.deepEqual([...row.reading, ...row.outcome].filter(x => !x.ok).map(x => x.name + ' → ' + x.got), [], id + ' “' + c.ask + '”');
  for (const p of rec.brief.program.placements || []) assert.ok(rec.options[0].notes.some(n => n.startsWith(I.describe(p))), id + ': the plan says what became of “' + I.describe(p) + '”');
}
// asks with no control of their own (the pond, the docks, a single use's place): the engine compares the layouts it
// draws on them (lib/layoutintent.mjs asksFor, lib/sitelayout.mjs askPick) and the generators draw the places asked
{ const c = CASES.find(x => x.id === 'S06'), { rec, row } = runWords(c), n = rec.options[0].notes.filter(x => /^Asked: the truck court facing east/.test(x));
  assert.equal(n.length, 1); assert.ok(/done\./.test(n[0]), n[0]); assert.ok(row.ok, 'S06: the warehouse at the back, its docks facing east');
  assert.ok(rec.options[0].notes.includes('Asked: the warehouse at the back: done.'));
  const r13 = runWords(CASES.find(x => x.id === 'S13')); assert.ok(r13.row.ok, 'S13: the pond in front'); assert.ok(r13.rec.options[0].elements.some(e => e.kind === 'pond')); }
{ const plan = planOf('E10'), A = I.asksFor([{ id: 'p1', subject: 'pond', rel: 'edge', edge: 'north', how: 'checked' }, { id: 'p2', subject: 'truck court', rel: 'facing', edge: 'east', how: 'checked' }, { id: 'p3', subject: 'pool', rel: 'middle', how: 'moved' }, { id: 'p4', subject: 'open space', rel: 'keep', edge: 'north', how: 'engine' }], plan);
  assert.deepEqual(A.list.map(p => p.id), ['p1', 'p2'], 'only the asks measured and said are steered'); assert.deepEqual([A.hints.pond, A.hints.docks], ['right', 'front'], 'compass sides as the frame’s (street on the east: north is on the right)');
  assert.equal(I.asksFor([{ id: 'p1', subject: 'pool', rel: 'middle', how: 'moved' }], plan), null, 'nothing to steer: no asks handed to the engine');
  // each building faces its own court: two warehouses, each with its apron on its east side
  const bl = (x, y) => ({ kind: 'building', use: 'industrial', x, y, w: 200, d: 400 }), tk = (x, y) => ({ kind: 'truck', x, y, w: 60, d: 400 }), els = [bl(100, 400), tk(230, 400), bl(400, 400), tk(530, 400)];
  assert.equal(I.checkPlacement(plan, els, { use: 'industrial' }, { id: 'p', subject: 'truck court', rel: 'facing', edge: 'east' }).status, 'pass');
  assert.equal(I.checkPlacement(plan, [bl(100, 400), tk(230, 400), tk(-30, 400)], { use: 'industrial' }, { id: 'p', subject: 'truck court', rel: 'facing', edge: 'east' }).status, 'pass', 'its nearest court');
  // a pond in two basins, one each end: not "the pond on the north end"
  const pd = (x, y, w) => ({ kind: 'pond', x, y, w, d: 100 }), q = { id: 'p', subject: 'pond', rel: 'edge', edge: 'north' };
  assert.equal(I.checkPlacement(plan, [pd(250, 820, 200), pd(250, 80, 160)], {}, q).status, 'fail'); assert.equal(I.checkPlacement(plan, [pd(250, 820, 300), pd(250, 80, 100)], {}, q).status, 'pass'); }
// typed zones placed: the notes name the type said ("the bank", "the daycare"), each zone its own line, not "the restaurants"
{ const b = B.briefFromRequest('a daycare and a bank on pads in front of townhomes', planOf('W20'));
  assert.deepEqual(b.program.placements.map(p => I.describe(p)), ['Asked: the bank toward the street', 'Asked: the daycare toward the street']);
  assert.ok(B.validateBrief(b).ok); }
// sizes in thousands with no unit after them; a business named bare is a building, not a commons
assert.equal(read('retial 25k + 1 pad').gfa, 25000, '"retail 25k" is square feet'); assert.equal(read('retial 25k + 1 pad').atLeast, undefined, '"+ 1 pad" is a pad more, not "25,000 sf or more"');
assert.equal(read('whse ~150k, 1 acre det pond').gfa, 150000); assert.equal(read('retail with a $25k budget').gfa, undefined, 'money is not a size');
assert.equal(read('200 apartments + 40 townhomes').zones?.length, 2);
assert.equal(read('trampoline park').btype, 'custom'); assert.equal(read('an indoor water park').btype, 'custom'); assert.equal(read('office park').use, 'office');
assert.equal(read('homes around a central park').zones?.[0]?.use, 'amenity', 'a park the homes go round is still a commons');
console.log('prompts: ok (' + Math.round((Date.now() - t0) / 1000) + ' s)');
