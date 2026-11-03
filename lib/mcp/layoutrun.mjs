// MCP tools for reproducible layout runs (lib/layoutrun.mjs): an agent passes a typed brief (or a request and an
// outline), gets ranked layouts with the independent validator's checks, and keeps the run record to replay or edit it
// later. Pure computation on this server: no AI call, no network, no data refresh. Shared by api/layoutrun.js.
import * as S from '../siteplan.mjs';
import * as B from '../layoutbrief.mjs';
import * as RUN from '../layoutrun.mjs';
import * as ED from '../layoutedit.mjs';
import { capsTable } from '../layoutcaps.mjs';
import { UserError } from './resolve.mjs';

const MAX_RECORD = 6e6; // characters of JSON a record may be when handed back in

// the site from the arguments: a brief's own site, a GeoJSON outline (lon/lat), or a ring in feet
function siteOf(a) {
  if (a.geojson) {
    const g = a.geojson.type === 'Feature' ? a.geojson.geometry : a.geojson, b = S.boundaryFrom(g);
    if (!b) throw new UserError('geojson must be a Polygon or MultiPolygon in lon/lat.');
    return { origin: b.origin, ring: b.ring, front: Number.isInteger(a.front_edge) ? a.front_edge : null, streets: a.street_edges || [] };
  }
  if (Array.isArray(a.ring_ft)) return { origin: a.origin || null, ring: a.ring_ft, front: Number.isInteger(a.front_edge) ? a.front_edge : null, streets: a.street_edges || [] };
  throw new UserError('Give brief, or request with geojson (lon/lat) or ring_ft (feet, x east, y north).');
}
export function briefFromArgs(a) {
  if (a.brief) return a.brief;
  if (!a.request) throw new UserError('Give brief, or request (what to build) with the site.');
  const plan = siteOf(a), b = B.briefFromRequest(String(a.request).slice(0, 2000), plan, { seed: a.seed ?? 'rei-1', options: a.options ?? 3 });
  if (a.quantity && b.program.uses.length) b.program.uses[0].quantity = { ...b.program.uses[0].quantity, ...a.quantity };
  if (a.setbacks) b.rules.values.setbacks = { v: { ...S.SETBACKS, ...a.setbacks }, cls: a.setbacks_source ? 'verified' : 'assumption', source: a.setbacks_source || 'Given with the request; not verified' };
  if (a.parking_per_unit != null) b.rules.values.parkingPerUnit = { v: +a.parking_per_unit, cls: a.parking_source ? 'verified' : 'assumption', source: a.parking_source || 'Given with the request; not verified' };
  if (a.parking_per_1000 != null) b.rules.values.parkingPer1000 = { v: +a.parking_per_1000, cls: a.parking_source ? 'verified' : 'assumption', source: a.parking_source || 'Given with the request; not verified' };
  if (Array.isArray(a.access_edges)) b.site.access = { edges: a.access_edges, entrances: [] };
  return b;
}
const recordOf = a => { const r = typeof a.record === 'string' ? (a.record.length > MAX_RECORD ? null : JSON.parse(a.record)) : a.record; if (!r?.brief) throw new UserError('record must be a run record from layout_run (its JSON).'); return r; };

function report(rec, extra = []) {
  const sm = RUN.summary(rec), L = ['Outcome: ' + rec.outcome + (rec.optimality && rec.outcome === 'feasible' ? ' (' + rec.optimality + ')' : ''), 'Input hash ' + (rec.inputHash || '').slice(0, 16) + ' · engine ' + rec.versions?.engine + ' · validator ' + rec.versions?.validator + ' · seed ' + rec.brief?.solver?.seed];
  for (const p of rec.problems || []) L.push('Problem: ' + p.msg);
  for (const p of rec.partial || []) L.push('Partial: ' + p);
  for (const m of rec.engineMapping || []) L.push('Note: ' + m);
  for (const o of sm.options) L.push('#' + o.rank + ' ' + o.name + ' — ' + o.status.toUpperCase() + (o.units ? ' · ' + o.units + ' units' : '') + ' · ' + Math.round(o.gfa).toLocaleString('en-US') + ' sf · parking ' + o.parking.provided + ' provided / ' + o.parking.required + ' required' + (o.failed.length ? ' · fails ' + o.failed.join(', ') : '') + (o.unresolved.length ? ' · unknown ' + o.unresolved.join(', ') : ''));
  const top = rec.options?.[0]; if (top) L.push('Checks on #1: ' + top.validation.checks.map(c => c.id + ' ' + c.status).join('; '));
  L.push('Concept planning only: drainage, turning movements, fire route distance, grading and utilities are not checked.');
  return [...extra, ...L].join('\n');
}
const asResult = (text, rec, include) => ({ content: [{ type: 'text', text }, ...(include !== false && rec ? [{ type: 'resource', resource: { uri: 'run://layout/' + (rec.inputHash || 'x').slice(0, 16) + '.json', mimeType: 'application/json', text: JSON.stringify(rec) } }] : [])] });

export async function layoutRunTool(a = {}) { const rec = RUN.runBrief(briefFromArgs(a)); return asResult(report(rec), rec, a.include_record); }
export async function layoutReplayTool(a = {}) { const r = RUN.replayRun(recordOf(a)); return asResult((r.identical ? 'Replay identical: same outcome, geometry, quantities, checks and ranking.' : 'Replay differs: ' + r.diffs.join('; ')) + '\n' + report(r.record), null, false); }
export async function layoutEditTool(a = {}) {
  const rec = recordOf(a), parsed = a.edits ? { edits: a.edits, unclear: [] } : ED.editFromWords(a.words || '', { selection: a.selection || [] });
  if (!parsed.edits.length) throw new UserError('No edit understood' + (parsed.unclear.length ? ': ' + parsed.unclear.join(' ') : '.') + ' Pass edits (typed) or clearer words.');
  for (const e of parsed.edits) { const v = ED.validateEdit(e); if (!v.ok) throw new UserError('Edit ' + JSON.stringify(e) + ': ' + v.errors.join('; ')); }
  const r = ED.applyEdits(rec, parsed.edits, { at: a.option || 1 });
  const head = ['Edits read as: ' + JSON.stringify(parsed.edits), ...(parsed.unclear || []).map(u => 'Unclear: ' + u), ...(r.interpreted || []).map(i => 'Done: ' + i)];
  if (!r.ok) return { content: [{ type: 'text', text: [...head, 'NOT APPLIED — conflicts:', ...r.conflicts.map(c => '- ' + c), 'The run is unchanged.'].join('\n') }], isError: false };
  for (const c of r.comparisons || []) for (const x of c) head.push('Compare ' + x.form + ': ' + x.outcome + (x.best ? ' · ' + x.best.units + ' units · ' + x.best.status : '') + (x.problems.length ? ' · ' + x.problems.map(p => p.msg).join('; ') : ''));
  return asResult(report(r.record, head), r.record, a.include_record);
}
export const capsText = () => capsTable().map(c => c.id + ' (' + c.family + '): ' + c.status + ' — ' + c.label + (c.note ? '. ' + c.note : '')).join('\n');
export async function layoutCapsTool() { return { content: [{ type: 'text', text: capsText() }] }; }
