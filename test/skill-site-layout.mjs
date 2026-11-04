// The site-layout agent skill (skills/site-layout): its copy of the engine is the app's lib/ (byte for byte, so the
// skill lays out as Build does), and its command line works offline end to end: a site from GeoJSON, a brief from
// words, a run on a rectangle and on an irregular lot, the record replays identically, an edit, the hand-off to the
// plan-set skill (project.json, the FS text lines and a PDF that carries them) reads back to the same model. No network:
// the CLI makes any fetch throw.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SKILL = path.join(ROOT, 'skills/site-layout'), CLI = path.join(SKILL, 'scripts/layout.mjs');
const { closure } = await import(pathToFileURL(path.join(ROOT, 'scripts/build-skill-site-layout.mjs')).href);

// 1. the engine copy is current (run `npm run skill:site-layout` after changing the engine)
for (const rel of closure()) assert.ok(fs.existsSync(path.join(SKILL, 'scripts/engine', rel)) && fs.readFileSync(path.join(SKILL, 'scripts/engine', rel)).equals(fs.readFileSync(path.join(ROOT, 'lib', rel))), 'skills/site-layout/scripts/engine/' + rel + ' is out of date with lib/: run npm run skill:site-layout');
assert.ok(fs.existsSync(path.join(ROOT, 'skills/site-layout.zip')), 'the skill zip is built');
console.log('skill engine in sync: ' + closure().length + ' files');

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-site-layout-'));
const cli = (...a) => { const r = spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', cwd: T, timeout: 240000 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const json = f => JSON.parse(fs.readFileSync(path.join(T, f), 'utf8'));

// 2. a rectangle, exactly 120 garden apartments
fs.writeFileSync(path.join(T, 'rect.json'), JSON.stringify({ ring: [[0, 0], [900, 0], [900, 500], [0, 500]], front: 0, streets: [] }));
let r = cli('run', '--site', 'rect.json', '--request', 'exactly 120 garden apartments, 3 stories', '--out', 'r1', '--name', 'Test Garden', '--address', '1 Test Rd');
assert.equal(r.code, 0, r.out); assert.match(r.out, /^Outcome: feasible/m);
const rec = json('r1/run.json'); assert.equal(rec.schema, 'rei.run/1'); assert.equal(rec.options[0].validation.status, 'pass'); assert.equal(rec.options[0].quantities.totals.units, 120);
for (const f of ['summary.txt', 'option-1.svg', 'sheet.pdf', 'project.json', 'project-model.txt']) assert.ok(fs.statSync(path.join(T, 'r1', f)).size > 200, f);
assert.match(fs.readFileSync(path.join(T, 'r1/option-1.svg'), 'utf8'), /^<svg/);
r = cli('replay', '--record', 'r1/run.json'); assert.equal(r.code, 0, r.out); assert.match(r.out, /Replay identical/);

// 3. the hand-off: project.json in the fs-set-plans shape, the FS lines and the PDF carry the same model
const H = await import(pathToFileURL(path.join(SKILL, 'scripts/handoff.mjs')).href), P = json('r1/project.json');
assert.equal(P.site.buildings.length, rec.options[0].elements.filter(e => e.kind === 'building').length);
assert.ok(P.types.every(t => t.id && t.use && t.W > 0 && t.D > 0 && t.count >= 1)); assert.ok(P.site.stated.acres > 10 && P.site.stated.units === 120);
assert.ok(P.site.parking_rows.length > 0 && P.site.drives.length > 0 && P.site.ponds.length === 1); assert.ok(P.site.boundary.length === 4);
assert.deepEqual(H.modelFromText(fs.readFileSync(path.join(T, 'r1/project-model.txt'), 'utf8')), P, 'the FS lines rebuild the model');
const pdf = fs.readFileSync(path.join(T, 'r1/sheet.pdf'), 'latin1'); assert.ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'));
const fromPdf = H.modelFromText(pdf.replace(/\\([\\()])/g, '$1')); assert.deepEqual(fromPdf, P, 'the PDF carries the model as text');
// the plan-set skill's own reader rebuilds it from the text lines (Python, when there is one)
const py = spawnSync('python3', [path.join(ROOT, 'skills/fs-set-plans/scripts/read_model.py'), path.join(T, 'r1/project-model.txt'), '--out', path.join(T, 'back.json')], { encoding: 'utf8', cwd: path.join(ROOT, 'skills/fs-set-plans') });
if (py.status === 0) { assert.deepEqual(json('back.json'), P); console.log('fs-set-plans read_model.py: same model'); } else console.log('python3 not available: read_model.py not run');

// 4. an irregular lot from GeoJSON, townhomes as many as fit; an edit by words
fs.writeFileSync(path.join(T, 'parcel.geojson'), JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-95.80, 30.06], [-95.7965, 30.06], [-95.7962, 30.0625], [-95.7985, 30.0632], [-95.8, 30.062], [-95.80, 30.06]]] } }));
r = cli('site', '--geojson', 'parcel.geojson', '--out', 'site2.json'); assert.equal(r.code, 0, r.out); assert.match(r.out, /5 corners, 26\.\d+ acres/);
r = cli('brief', '--site', 'site2.json', '--request', 'townhomes, as many as fit', '--out', 'brief2.json'); assert.equal(r.code, 0, r.out); assert.match(r.out, /Brief valid/);
assert.equal(json('brief2.json').program.uses[0].quantity.mode, 'maximize');
r = cli('run', '--brief', 'brief2.json', '--out', 'r2'); assert.equal(r.code, 0, r.out); const rec2 = json('r2/run.json');
assert.equal(rec2.outcome, 'feasible'); assert.ok(rec2.options[0].quantities.totals.units > 100, 'townhomes ' + rec2.options[0].quantities.totals.units);
r = cli('edit', '--record', 'r1/run.json', '--words', 'keep 120 units but compare garden apartments with townhomes', '--out', 'r1e'); assert.equal(r.code, 0, r.out); assert.match(r.out, /Compare mf-garden: feasible/);
r = cli('caps'); assert.equal(r.code, 0); assert.match(r.out, /mf-wrap \(multifamily\): partial/);
r = cli('check', '--brief', 'brief2.json'); assert.equal(r.code, 0); assert.match(r.out, /Brief valid/);
fs.rmSync(T, { recursive: true, force: true });
console.log('skill site-layout tests passed');
