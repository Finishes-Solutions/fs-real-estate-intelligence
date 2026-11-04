#!/usr/bin/env node
// The site-layout skill's command line: the Real Estate Intelligence layout engine (scripts/engine/, a copy of the
// app's lib/) run offline. No packages, no network. Every command prints a short report; files go to --out.
//
//   node layout.mjs site    --geojson parcel.geojson [--front 0] [--streets 1,2] --out site.json
//   node layout.mjs brief   --site site.json --request "exactly 240 garden apartments, 3 stories" --out brief.json
//   node layout.mjs check   --brief brief.json
//   node layout.mjs run     --brief brief.json --out out/ [--name "Project"] [--address "..."] [--client ...] [--number ...] [--date 2026-11-04] [--option 1]
//   node layout.mjs run     --site site.json --request "..." --out out/
//   node layout.mjs edit    --record out/run.json (--words "move the pool to the center" | --edits edits.json) [--option 1] --out out2/
//   node layout.mjs replay  --record out/run.json
//   node layout.mjs handoff --record out/run.json [--option 1] --out out/ [--name ...]
//   node layout.mjs caps
//
// run / edit / handoff write: run.json (the run record: brief, versions, options, checks), summary.txt, option-N.svg
// (each option's plan), sheet.pdf (the chosen option on a 24 x 36 sheet, the plan-set model inside as invisible
// text), project.json (the fs-set-plans project model) and project-model.txt (the same model as <<FS:...:FS>> lines).
import fs from 'node:fs';
import path from 'node:path';
import * as S from './engine/siteplan.mjs';
import * as B from './engine/layoutbrief.mjs';
import * as RUN from './engine/layoutrun.mjs';
import * as ED from './engine/layoutedit.mjs';
import { capsTable } from './engine/layoutcaps.mjs';
import { planSVG } from './engine/sitesheet.mjs';
import { projectOf, modelLines } from './handoff.mjs';
import { sheetPDF } from './pdf.mjs';

const argv = process.argv.slice(2), cmd = argv[0];
const arg = k => { const i = argv.indexOf('--' + k); return i > 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const num = (k, d) => (arg(k) != null ? +arg(k) : d);
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const die = m => { console.error('Error: ' + m); process.exit(2); };
// no network, ever: the engine has no outside calls, and this makes sure of it
globalThis.fetch = async () => { throw new Error('site-layout runs offline: no network calls'); };

function siteFrom(s) {
  if (!s) die('give --site site.json (or --brief brief.json)');
  return { origin: s.origin || [0, 0], ring: s.ring || s.ring_ft, front: Number.isInteger(s.front) ? s.front : Number.isInteger(s.front_edge) ? s.front_edge : null, streets: s.streets || s.street_edges || [], setbacks: { ...S.SETBACKS, ...(s.setbacks || {}) }, ...(s.exclusions ? { elements: s.exclusions.map((x, i) => ({ id: 'ko' + (i + 1), kind: 'keepout', poly: x.ring || x.poly, name: x.kind || x.name || 'Keep-out', pinned: true })) } : {}) };
}
function briefOf() {
  if (arg('brief')) return readJSON(arg('brief'));
  const req = arg('request'); if (!req) die('give --brief brief.json, or --request "..." with --site site.json');
  const site = readJSON(arg('site') || die('give --site site.json'));
  const b = B.briefFromRequest(req, siteFrom(site), { seed: arg('seed') || 'rei-1', options: num('options', 3) });
  if (site.exclusions) b.site.exclusions = site.exclusions.map((x, i) => ({ id: x.id || 'ex' + (i + 1), kind: x.kind || 'easement', ring: x.ring || x.poly, source: x.source || 'given with the site' }));
  if (site.setbacks) b.rules.values.setbacks = { v: { ...S.SETBACKS, ...site.setbacks }, cls: site.setbacks_source ? 'verified' : 'assumption', source: site.setbacks_source || 'Given with the site; not verified' };
  return b;
}
function report(rec) {
  const sm = RUN.summary(rec), L = ['Outcome: ' + rec.outcome + (rec.optimality && rec.outcome === 'feasible' ? ' (' + rec.optimality + ')' : ''), 'Engine ' + rec.versions?.engine + ' · validator ' + rec.versions?.validator + ' · input ' + (rec.inputHash || '').slice(0, 16)];
  for (const p of rec.problems || []) L.push('Problem: ' + p.msg);
  for (const p of rec.partial || []) L.push('Partial: ' + p);
  for (const m of rec.engineMapping || []) L.push('Note: ' + m);
  for (const o of sm.options) L.push('#' + o.rank + ' ' + o.name + ' — ' + o.status.toUpperCase() + (o.units ? ' · ' + o.units + ' units' : '') + ' · ' + Math.round(o.gfa).toLocaleString('en-US') + ' sf · parking ' + o.parking.provided + ' / ' + o.parking.required + (o.failed.length ? ' · fails ' + o.failed.join(', ') : '') + (o.unresolved.length ? ' · unknown ' + o.unresolved.join(', ') : ''));
  for (const [i, o] of (rec.options || []).entries()) { L.push('', 'Option ' + (i + 1) + ' checks:'); for (const c of o.validation.checks) if (c.status !== 'n/a') L.push('  ' + c.status.toUpperCase().padEnd(7) + (c.hard ? 'hard ' : 'note ') + c.id + ' — ' + c.title + (c.measured != null ? ' (' + c.measured + (c.required != null ? ' / ' + (typeof c.required === 'object' ? JSON.stringify(c.required) : c.required) : '') + (c.units ? ' ' + c.units : '') + ')' : '') + (c.basis ? ' [' + c.basis + ']' : '')); for (const t of o.notes || []) L.push('  note: ' + t); }
  L.push('', 'Concept planning only: not for permit, bidding or construction. Assumptions are marked; verify them against the code.');
  return L.join('\n');
}
function writeAll(rec, out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify(rec));
  const text = report(rec); fs.writeFileSync(path.join(out, 'summary.txt'), text + '\n');
  const plan = B.toEngine(rec.brief).plan;
  (rec.options || []).forEach((o, i) => { try { fs.writeFileSync(path.join(out, 'option-' + (i + 1) + '.svg'), planSVG({ ...plan, elements: o.elements, program: o.program }, { px: 1600, pad: 24 }).svg); } catch (e) { fs.writeFileSync(path.join(out, 'option-' + (i + 1) + '.svg.error.txt'), String(e.stack || e)); } });
  if (rec.options?.length) handoff(rec, out);
  return text;
}
function handoff(rec, out) {
  const option = Math.max(1, Math.min(rec.options.length, num('option', 1))), meta = { option, name: arg('name') || '', address: arg('address') || '', county: arg('county') || '', client: arg('client') || '', number: arg('number') || '', date: arg('date') || '', drawn_by: arg('drawn-by') || '', checked_by: arg('checked-by') || '' };
  const model = projectOf(rec, meta), lines = modelLines(model);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'project.json'), JSON.stringify(model, null, 1));
  fs.writeFileSync(path.join(out, 'project-model.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'sheet.pdf'), sheetPDF(rec, { option, title: meta.name || 'Conceptual site layout', subtitle: meta.address, meta, modelLines: lines }));
  return model;
}

switch (cmd) {
  case 'site': {
    const g0 = readJSON(arg('geojson') || die('give --geojson parcel.geojson (a Polygon / MultiPolygon in lon/lat, a Feature or a FeatureCollection)'));
    const g = g0.type === 'FeatureCollection' ? (g0.features.length === 1 ? g0.features[0].geometry : { type: 'MultiPolygon', coordinates: g0.features.flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) }) : g0.type === 'Feature' ? g0.geometry : g0;
    const b = S.boundaryFrom(g); if (!b) die('the GeoJSON must be a Polygon or MultiPolygon in lon/lat');
    const front = arg('front') != null ? +arg('front') : S.longestEdge(b.ring), streets = arg('streets') ? arg('streets').split(',').map(Number) : [];
    const site = { origin: b.origin, ring: b.ring.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), front, streets, acres: +(S.ringArea(b.ring) / 43560).toFixed(3) };
    fs.writeFileSync(arg('out') || 'site.json', JSON.stringify(site, null, 1));
    console.log('Site: ' + site.ring.length + ' corners, ' + site.acres + ' acres; front edge ' + front + ' (' + Math.round(Math.hypot(site.ring[(front + 1) % site.ring.length][0] - site.ring[front][0], site.ring[(front + 1) % site.ring.length][1] - site.ring[front][1])) + ' ft); edges: ' + site.ring.map((p, i) => i + ':' + Math.round(Math.hypot(site.ring[(i + 1) % site.ring.length][0] - p[0], site.ring[(i + 1) % site.ring.length][1] - p[1])) + 'ft').join(' '));
    break; }
  case 'brief': { const b = briefOf(), v = B.validateBrief(b); fs.writeFileSync(arg('out') || 'brief.json', JSON.stringify(b, null, 1)); console.log('Brief ' + (v.ok ? 'valid' : 'INVALID: ' + v.errors.join('; ')) + '. Uses: ' + b.program.uses.map(u => (u.zone || u.use) + ' ' + JSON.stringify(u.quantity) + (u.form ? ' form ' + u.form : '')).join('; ')); for (const m of b.mapping || []) console.log('Note: ' + m); break; }
  case 'check': { const v = B.validateBrief(readJSON(arg('brief') || die('give --brief'))); console.log(v.ok ? 'Brief valid.' : 'Brief INVALID:\n- ' + v.errors.join('\n- ')); process.exitCode = v.ok ? 0 : 1; break; }
  case 'run': { const b = briefOf(), v = B.validateBrief(b); if (!v.ok) die('the brief is not valid:\n- ' + v.errors.join('\n- ')); const rec = RUN.runBrief(b); console.log(writeAll(rec, arg('out') || 'out')); break; }
  case 'edit': {
    const rec = readJSON(arg('record') || die('give --record run.json')), parsed = arg('edits') ? { edits: readJSON(arg('edits')), unclear: [] } : ED.editFromWords(arg('words') || '', { selection: (arg('selection') || '').split(',').filter(Boolean) });
    if (!parsed.edits.length) die('no edit understood' + (parsed.unclear?.length ? ': ' + parsed.unclear.join(' ') : '') + '. Give --edits edits.json or clearer --words.');
    for (const e of parsed.edits) { const v = ED.validateEdit(e); if (!v.ok) die('edit ' + JSON.stringify(e) + ': ' + v.errors.join('; ')); }
    const r = ED.applyEdits(rec, parsed.edits, { at: num('option', 1) });
    console.log('Edits read as: ' + JSON.stringify(parsed.edits)); for (const u of parsed.unclear || []) console.log('Unclear: ' + u); for (const i of r.interpreted || []) console.log('Done: ' + i);
    if (!r.ok) { console.log('NOT APPLIED — conflicts:\n- ' + r.conflicts.join('\n- ') + '\nThe run is unchanged.'); process.exitCode = 1; break; }
    for (const c of r.comparisons || []) for (const x of c) console.log('Compare ' + x.form + ': ' + x.outcome + (x.best ? ' · ' + x.best.units + ' units · ' + x.best.status : ''));
    console.log(writeAll(r.record, arg('out') || 'out-edit')); break; }
  case 'replay': { const r = RUN.replayRun(readJSON(arg('record') || die('give --record run.json'))); console.log(r.identical ? 'Replay identical: same outcome, geometry, quantities, checks and ranking.' : 'Replay differs: ' + r.diffs.join('; ')); process.exitCode = r.identical ? 0 : 1; break; }
  case 'handoff': { const rec = readJSON(arg('record') || die('give --record run.json')), m = handoff(rec, arg('out') || 'out'); console.log('Wrote project.json, project-model.txt and sheet.pdf for option ' + m.source_layout.option + ': ' + m.site.buildings.length + ' buildings in ' + m.types.length + ' types, ' + m.site.parking_rows.length + ' parking rows, ' + m.site.drives.length + ' drives, ' + m.site.ponds.length + ' ponds.'); break; }
  case 'caps': console.log(capsTable().map(c => c.id + ' (' + c.family + '): ' + c.status + ' — ' + c.label + (c.note ? '. ' + c.note : '')).join('\n')); break;
  default: console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
}
