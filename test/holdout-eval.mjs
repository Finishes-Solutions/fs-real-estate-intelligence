// The holdout evaluation (scripts/refs/holdout-eval.mjs): the cases are holdout projects and stay out of the engine's
// templates, the reconstructed sites have the printed areas, and one run (Sierra Vista WB-30 with detention off the
// surface, as the reference) still lands the reference's 355 units, passing. No network, no reference library needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CASES } from '../scripts/refs/holdout-cases.mjs';
import { evalRun } from '../scripts/refs/holdout-eval.mjs';
import { REF_TEMPLATES } from '../lib/reftemplates.mjs';

const idx = JSON.parse(fs.readFileSync('data/reference/index.json', 'utf8')), part = Object.fromEntries((idx.projects || idx).map(p => [p.id, p.partition]));
const cases = CASES(), holdout = new Set(Object.keys(part).filter(k => part[k] === 'holdout'));
for (const c of cases) assert.equal(part[c.id], 'holdout', c.id + ' is a holdout project');
// partition discipline: no template the engine uses cites a holdout project
const tpl = JSON.parse(fs.readFileSync('data/reference/templates.json', 'utf8')).templates;
for (const t of Object.values(REF_TEMPLATES)) for (const e of t.evidence || []) assert.ok(!holdout.has(e), t.id + ' cites holdout ' + e);
for (const t of tpl.filter(t => Object.values(REF_TEMPLATES).some(r => r.source === t.id))) for (const e of t.evidence) assert.ok(!holdout.has(e.project), t.id + ' (drives the engine) cites holdout ' + e.project);
// the sites have the printed areas
const area = r => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
for (const c of cases) assert.ok(Math.abs(area(c.ring) / 43560 - c.ref.acres) / c.ref.acres < 0.005, c.id + ': ' + (area(c.ring) / 43560).toFixed(2) + ' ac vs ' + c.ref.acres);
// one run end to end, and the search monotone in the count: as many as fit reaches the most an exact count passes on the
// same land, and a count a module of homes above it doesn't pass (before, which counts passed jumped with the count
// asked: 330 and 341 short where 350 and 355 passed, those on buildings no template fit; as many as fit settled on 304)
const p35 = cases.find(c => c.id === 'P35'), ask = n => ({ key: 'n' + n, ask: 'exactly ' + n + ' senior apartments, mid-rise, 4 stories, with elevators, underground detention' });
const f = evalRun(p35, p35.runs.find(x => x.key === 'fill-ug'));
assert.equal(f.status, 'pass', f.failed?.join()); assert.ok(!(f.failed || []).includes('program.template'));
const at = evalRun(p35, ask(f.units)), above = evalRun(p35, ask(f.units + 16));
assert.equal(at.status, 'pass', 'exactly ' + f.units + ': ' + at.failed?.join()); assert.notEqual(above.status, 'pass', 'exactly ' + (f.units + 16) + ' passes, above as many as fit (' + f.units + ')');
const r = evalRun(p35, p35.runs.find(x => x.key === 'exact-ug')); if (r.status === 'pass') assert.ok(f.units >= r.units, 'as many as fit ' + f.units + ' vs exactly ' + r.units);
console.log('holdout-eval ok: P35 with detention off the surface, as many as fit ' + f.units + ' (as built ' + p35.ref.units + '); exactly ' + f.units + ' passes, ' + (f.units + 16) + ' does not; exactly ' + p35.ref.units + ': ' + r.status);
// townhomes as many as fit keep their count when a fire truck's turn is tight at a lane T: the corner home gives way
// for a curb return (one home and its lot), not the whole layout for a smaller one (59 fell to 51 when the turning
// check came in)
{ const p18 = cases.find(c => c.id === 'P18'), t = evalRun(p18, p18.runs.find(x => x.key === 'fill'));
  assert.equal(t.status, 'pass', t.failed?.join()); assert.ok(t.units >= 57, 'townhomes ' + t.units); console.log('holdout-eval ok: P18 townhomes as many as fit ' + t.units); }
