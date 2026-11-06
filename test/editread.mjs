// Edit requests on a laid-out plan (lib/editread.mjs): the words read the same way for the MCP's plan_edit and the app's
// Change With AI, the AI's answer (captured replies: no AI is called) merged with the words' own, and a fast subset of the
// edit corpus (test/fixtures/edit-corpus.mjs) carried out through plan_edit and measured on the geometry by the corpus's
// own scorer (scripts/edit-corpus.mjs). The whole corpus: node scripts/edit-corpus.mjs; live: node test/edit-eval-live.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as ER from '../lib/editread.mjs';
import * as EC from '../scripts/edit-corpus.mjs';
import { CASES } from './fixtures/edit-corpus.mjs';
import { wholeIn, EDIT_SCHEMA } from '../api/siteplan.js';

let n = 0; const ok = async (name, f) => { await f(); n++; console.log('ok', n, name); };

await ok('messy words tidied and split into clauses', () => {
  assert.equal(ER.tidyEdit('mvoe teh pool to the centre'), 'move the pool to the center');
  assert.equal(ER.tidyEdit('retail down to 15ksf'), 'retail down to 15000 sf');
  assert.equal(ER.tidyEdit("frnt setback 40'"), 'front setback 40 ft');
  assert.equal(ER.tidyEdit('move the dog prk to the nw corner'), 'move the dog park to the northwest corner');
  assert.deepEqual(ER.splitClauses(ER.tidyEdit('move the pool to the center, add a dog park in the corner and make building 7 four stories')), ['move the pool to the center', 'add a dog park in the corner', 'make building 7 four stories']);
  assert.deepEqual(ER.splitClauses('lock the clubhouse and pool, then move the pond to the front'), ['lock the clubhouse and pool', 'move the pond to the front']);
  assert.deepEqual(ER.splitClauses("don't touch the retail; add 30 more units"), ["don't touch the retail", 'add 30 more units']);
  assert.equal(ER.tidyRest('make the retail 50,000 sf'), 'make the retail 50,000 sf'); // (a comma between digits isn't a list)
});
await ok('settings in words, the old phrasings and new ones', () => {
  const s = t => ER.settingsFromWords(t).set;
  assert.deepEqual(s('angle the parking'), { parking_angle: 60 }); assert.deepEqual(s('make the parking 45 degree'), { parking_angle: 45 });
  assert.deepEqual(s('1.5 per unit'), { parking_per_unit: 1.5 }); assert.deepEqual(s('1.5 spaces/unit'), { parking_per_unit: 1.5 });
  assert.deepEqual(s('parking at 5 per 1,000'), { parking_per_1000: 5 }); assert.deepEqual(s('front setback 40 ft'), { setbacks: { front: 40 } });
  assert.deepEqual(s('side setbacks 25 ft'), { setbacks: { side: 25 } }); assert.deepEqual(s('set parking angle 60'), { parking_angle: 60 });
  assert.equal(ER.relayAsk('garden apartments, as many as fit, with a pool and clubhouse', { program: { units: 300 } }), 'garden apartments, with a pool and clubhouse');
});

const bases = await EC.baseRecords(['GA', 'HR']), GA = bases.GA.plan, HR = bases.HR.plan, id = (p, nm) => p.elements.find(e => e.name === nm)?.id;
await ok('the words read into one reading: locks, program, parking, places, pieces', () => {
  const r = t => ER.readEdit(t, GA);
  const a = r('keep building 1 where it is and make it denser'); assert.deepEqual(a.locks.map(l => l.id), [id(GA, 'Apt Bldg 1')]); assert.equal(a.program.density, 'more');
  assert.equal(r('add 20 more units').program.unitsBy, 20); assert.equal(r('add 20 untis').program.unitsBy, 20);
  assert.deepEqual(r('make it 4 stories').program.floors, { multifamily: 4 });
  assert.deepEqual(r('make Apt Bldg 7 four stories').ops, [{ action: 'change', target: id(GA, 'Apt Bldg 7'), floors: 4 }]);
  assert.equal(r('add 30 spaces').parking.add, 30); assert.equal(r('fix the parking').parking.fix, true);
  assert.equal(r('move the pond to the front').placements[0].subject, 'pond');
  const mv = r('shift building 3 north 40 ft').ops[0]; assert.equal(mv.target, id(GA, 'Apt Bldg 3')); assert.equal(mv.exact, true);
  const multi = r('move the pool to the center, add a dog park in the corner and make building 7 four stories'); assert.deepEqual(multi.ops.map(o => o.action + (o.kind ? ':' + o.kind : '')), ['move', 'add:green', 'change']);
  assert.deepEqual(r('rmv bldg 2 & bldg 5').ops.map(o => o.target), [id(GA, 'Apt Bldg 2'), id(GA, 'Apt Bldg 5')]);
  assert.equal(r('less dense please').program.density, 'less'); assert.equal(r('more open space').program.open, 'more');
  assert.ok(r('blorp the frobnicator').unclear.length, 'words it can’t read are said, not guessed');
  assert.deepEqual(ER.readEdit('drop the retail to 15k', HR).program.gfa, { retail: 15000 });
  assert.equal(ER.readEdit('make the hotel 150 keys', HR).program.keys, 150);
  assert.deepEqual(ER.readEdit('swap the hotel and the retail building', HR).ops.map(o => o.action), ['swap']);
});
await ok('the AI’s answer (captured replies) held to the schema and merged with the words', () => {
  assert.ok(EDIT_SCHEMA.required.includes('whole') && EDIT_SCHEMA.required.includes('locks'));
  // the API's own check on the whole-plan fields: in range, known uses, places of the subjects it can steer
  assert.deepEqual(wholeIn({ units: 180, addUnits: 0, floors: 99, gfaUse: 'retail', gfa: 15000, density: 'loads', parkingAngle: 50, places: [{ subject: 'pond', rel: 'front', edge: null }, { subject: 'unicorn', rel: 'front' }] }), { units: 180, gfa: 15000, gfaUse: 'retail', places: [{ subject: 'pond', rel: 'front' }] });
  // "add 20 more units": an AI that fakes it by changing two buildings' units gives way to the words' program change
  const W = ER.readEdit('add 20 more units', GA), A = ER.fromAI({ ops: [{ action: 'change', target: id(GA, 'Apt Bldg 1'), units: 34 }], whole: { addUnits: 20 }, locks: [] }, GA), M = ER.mergeReads(W, A);
  assert.equal(M.program.unitsBy, 20); assert.deepEqual(M.ops, []);
  // a vague ask the words can't read: the AI's reading of it is taken
  const W2 = ER.readEdit('give it a bit more elbow room', GA), A2 = ER.fromAI({ ops: [], whole: { density: 'less' }, locks: [id(GA, 'Clubhouse')] }, GA), M2 = ER.mergeReads(W2, A2);
  assert.equal(M2.program.density, 'less'); assert.deepEqual(M2.locks.map(l => l.id), [id(GA, 'Clubhouse')]); assert.deepEqual(M2.unclear, []);
  // the words' place for a piece wins over the AI's guess; the AI's op on a piece the words didn't touch is kept
  const W3 = ER.readEdit('move the pool to the center and turn the clubhouse 90 degrees', GA), A3 = ER.fromAI({ ops: [{ action: 'move', target: id(GA, 'Pool'), x: 1, y: 1 }, { action: 'change', target: id(GA, 'Clubhouse'), turnBy: 90 }] }, GA), M3 = ER.mergeReads(W3, A3);
  assert.equal(M3.ops.filter(o => o.target === id(GA, 'Pool')).length, 1); assert.notEqual(M3.ops.find(o => o.target === id(GA, 'Pool')).x, 1);
});
await ok('the app’s Change With AI and the MCP’s plan_edit read edits through the same code', () => {
  const app = fs.readFileSync(new URL('../src/siteplan.js', import.meta.url), 'utf8'), mcp = fs.readFileSync(new URL('../lib/mcp/plans.mjs', import.meta.url), 'utf8');
  for (const f of ['ER.readEdit(', 'ER.fromAI(', 'ER.mergeReads(', 'ER.programChange(', 'ER.withSettings(', 'ER.verifyRead(', 'ER.addOp(']) { assert.ok(app.includes(f), 'app: ' + f); assert.ok(mcp.includes(f) || f === 'ER.withSettings(' && mcp.includes('withSettings('), 'mcp: ' + f); }
  assert.ok(!/ED\.guessEdits\(/.test(app.slice(app.indexOf('async function aiChange'), app.indexOf('function chgHtml'))), 'the app no longer reads the words its own way');
});

// a fast subset of the corpus through plan_edit, words only (each must come out right, measured on the drawing)
const env = await EC.setup(), FAST = ['E01', 'E15', 'E24', 'E43', 'E60', 'E68', 'E70', 'E77', 'E81', 'E13', 'E30'];
for (const c of CASES.filter(x => FAST.includes(x.id))) {
  await ok('corpus ' + c.id + ': “' + c.ask + '”', async () => {
    const r = await EC.runEdit(env, c, bases), row = EC.scoreEdit(c, r.base, r.after, r.text);
    assert.ok(row.ok, row.outcome.filter(x => !x.ok).map(x => x.name + ' → ' + x.got).join('; ') + '\n' + r.text.slice(0, 600));
  });
}
// a reply that misses says so (the honest "Not done")
await ok('an edit that can’t be met says so in the reply', async () => {
  const r = await EC.runEdit(env, { id: 'X1', base: 'GA', ask: 'shift building 3 north 40 ft' }, bases);
  assert.match(r.text, /## Not done[\s\S]*Apt Bldg 3 moved 40 ft: not met/);
});
// with a captured AI reply through plan_edit: its whole-plan change carried out, its lock held
await ok('plan_edit with a captured AI reply: a vague ask read by the AI, a lock held', async () => {
  const club = id(GA, 'Clubhouse'), ai = async b => { assert.equal(b.mode, 'edit'); return { status: 200, model: 'test-model', body: { ops: [], whole: { density: 'less' }, locks: [club], homeMix: [], names: null, streetNames: null, refit: 'none', summary: 'Fewer units, the clubhouse kept.', question: null } }; };
  const r = await EC.runEdit(env, { id: 'X2', base: 'GA', ask: 'give it a bit more elbow room but leave the clubhouse alone' }, bases, { ai });
  const before = r.base.elements.find(e => e.id === club), after = r.after.elements.find(e => e.id === club);
  assert.ok(after && ['x', 'y', 'w', 'd'].every(k => before[k] === after[k]), 'the clubhouse held');
  assert.ok(EC.outcomeChecks({ out: [['units', 'less%', 0.05]] }, r.base, r.after)[0].ok, r.text.slice(0, 500));
  assert.match(r.text, /Read by: AI \(test-model\)/);
});
console.log('editread: ' + n + ' passed');
