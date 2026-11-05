// How requests are understood (lib/siteplan.mjs tidyRequest / guessProgram, lib/layoutintent.mjs, lib/layoutbrief.mjs):
// messy numbers and typos, open requests, where things go (program.placements) and what the plan says about each ask;
// the AI's replies (fixtures, no network) through the same mapping; and a fast subset of the request corpus laid out
// end to end (scripts/prompt-corpus.mjs scores all of it).
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as B from '../lib/layoutbrief.mjs';
import * as I from '../lib/layoutintent.mjs';
import { CASES, FAST } from './fixtures/prompt-corpus.mjs';
import { REPLIES } from './fixtures/prompt-ai-replies.mjs';
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

// ---- the corpus, fast subset, end to end: read, laid out, met (or said) ----
for (const id of FAST) {
  const c = CASES.find(x => x.id === id), { row, rec } = runWords(c);
  assert.deepEqual([...row.reading, ...row.outcome].filter(x => !x.ok).map(x => x.name + ' → ' + x.got), [], id + ' “' + c.ask + '”');
  for (const p of rec.brief.program.placements || []) assert.ok(rec.options[0].notes.some(n => n.startsWith(I.describe(p))), id + ': the plan says what became of “' + I.describe(p) + '”');
}
// an ask the engine can't place is said, never dropped
{ const c = CASES.find(x => x.id === 'S06'), { rec } = runWords(c), n = rec.options[0].notes.filter(x => /^Asked: the truck court facing east/.test(x));
  assert.equal(n.length, 1); assert.ok(/done\.|not met/.test(n[0]), n[0]); }
console.log('prompts: ok (' + Math.round((Date.now() - t0) / 1000) + ' s)');
