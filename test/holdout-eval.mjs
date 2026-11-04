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
// one run end to end
const p35 = cases.find(c => c.id === 'P35'), r = evalRun(p35, p35.runs.find(x => x.key === 'exact-ug'));
assert.equal(r.status, 'pass', r.failed?.join()); assert.equal(r.units, p35.ref.units); assert.ok(r.parking >= r.required);
console.log('holdout-eval ok: P35 with detention off the surface ' + r.units + ' / ' + p35.ref.units + ' units, parking ' + r.parking + ' / ' + r.required);
