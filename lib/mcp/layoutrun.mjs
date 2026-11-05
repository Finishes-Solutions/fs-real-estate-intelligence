// MCP tools for reproducible layout runs (lib/layoutrun.mjs): an agent passes a typed brief (or a request and an
// outline), gets ranked layouts with the independent validator's checks, and keeps the run record to replay or edit it
// later. Pure computation on this server: no AI call, no network, no data refresh. Shared by api/layoutrun.js.
import * as S from '../siteplan.mjs';
import * as B from '../layoutbrief.mjs';
import * as RUN from '../layoutrun.mjs';
import * as ED from '../layoutedit.mjs';
import { capsTable } from '../layoutcaps.mjs';
import * as BT from '../btypes.mjs';
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

// ---------- building types (lib/btypes.mjs): what an agent can ask for in words (site_plan) or add by type (plan_edit) ----------
const FAMILY = { multifamily: 'Homes', retail: 'Retail', office: 'Office and medical', lodging: 'Hotels', civic: 'Civic and schools', industrial: 'Industrial', flex: 'Flex', storage: 'Storage', mixed_use: 'Mixed use', parking: 'Parking' };
const SRC_WORD = { reviewed: 'reviewed reference', engine: 'the engine’s default', standard: 'a published rule or common planning figure', estimate: 'a planning estimate (confirm)' };
const fmtParams = p => Object.entries(p || {}).filter(([, v]) => v != null && typeof v !== 'function').map(([k, v]) => k + ' ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ');
export async function buildingTypesTool(a = {}) {
  const cat = BT.PRESETS.map(p => ({ id: p.id, label: p.label, family: p.family, use: p.use, src: p.src?.cls || '', add: !!BT.presetBuilding(p.id), words: (p.label + ' ' + (p.short || '') + ' ' + p.family + ' ' + p.use + ' ' + p.id + ' ' + (p.aka || '')).toLowerCase() })), q = String(a.query || '').toLowerCase().trim();
  const one = a.id ? cat.find(c => c.id === String(a.id).trim()) : null;
  if (a.id && !one) throw new UserError('No building type ' + a.id + ': call building_types without id for the list.');
  if (one) {
    const P = BT.presetOf(one.id), pr = BT.PRIMITIVES[P.primitive] || {}, b = BT.presetBuilding(one.id) || {};
    const ex = P.count === 'keys' ? '"keys": 120' : P.count === 'units' ? '"units": 24' : '"floors": ' + (b.floors || 1);
    return { content: [{ type: 'text', text: [one.label + ' (' + one.id + ') · ' + (FAMILY[one.family] || one.family) + ' · engine use ' + one.use + (P.count ? ' · counts ' + P.count : ''),
      'Shape: ' + (pr.label || P.primitive) + (pr.note ? ' — ' + pr.note : '') + (pr.params ? ' (parameters: ' + pr.params.join(', ') + ')' : ''),
      'Defaults: ' + (fmtParams(P.params) || 'the engine’s'),
      (one.add ? 'Usual size when added: ' : 'Not added on its own in plan_edit (asked for in site_plan words); a typical one: ') + (b.w ? b.w + ' × ' + b.d + ' ft, ' + b.floors + ' floor' + (b.floors > 1 ? 's' : '') : '—') + (b.keys ? ', ' + b.keys + ' keys' : b.units ? ', ' + b.units + ' units' : b.children ? ', ' + b.children + ' children' : b.students ? ', ' + b.students + ' students' : ''),
      'Sizes from: ' + (SRC_WORD[P.src?.cls] || P.src?.cls || '—') + (P.src?.ref ? ' — ' + P.src.ref : ''),
      'Ask for it in site_plan words (e.g. "' + (P.count === 'keys' ? 'a 120-key ' + one.label.toLowerCase() : 'a ' + one.label.toLowerCase()) + ' and 20,000 sf of retail, parking behind the buildings")' + (one.add ? ', or add one to a plan: plan_edit { "edits": [{ "action": "add", "btype": "' + one.id + '", ' + ex + ', "to": "front" }] }.' : '.'),
      'Words can also set: ' + Object.values(BT.PARAMS).map(x => x.label).join(', ') + '. Concept planning only.'].join('\n') }] };
  }
  const hit = c => !q || q.split(/\s+/).every(w => c.words.includes(w) || (FAMILY[c.family] || '').toLowerCase().includes(w));
  const list = cat.filter(c => hit(c) && (!a.family || c.family === a.family)), by = new Map();
  for (const c of list) { const k = FAMILY[c.family] || c.family; if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
  if (!list.length) return { content: [{ type: 'text', text: 'No building type matches "' + q + '". Families: ' + Object.keys(FAMILY).join(', ') + '.' }] };
  const L = [list.length + ' building type' + (list.length === 1 ? '' : 's') + (q || a.family ? ' matching' : '') + ' (id — name · what it counts · where its sizes come from; + can be added to a plan with plan_edit btype). building_types with id gives one type’s shape, defaults and usual size.'];
  for (const [k, cs] of by) L.push('', '## ' + k, ...cs.map(c => '- ' + c.id + ' — ' + c.label + (BT.presetOf(c.id)?.count ? ' · ' + BT.presetOf(c.id).count : '') + ' · ' + c.src + (c.add ? ' +' : '')));
  L.push('', 'Use: name the type in site_plan words ("a 120-key hotel and 20,000 sf of retail", "a daycare and a bank on pads in front of townhomes", "L-shaped 4-story apartments"), or plan_edit { "action": "add", "btype": "<id>", "keys" | "units" | "floors": n, "to": "front" }. Placements ("parking behind the buildings", "pool in the center") and angled parking ("60 degree parking") work in site_plan words; plan_edit settings change them on a plan.');
  return { content: [{ type: 'text', text: L.join('\n') }] };
}
