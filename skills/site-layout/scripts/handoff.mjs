// The hand-off to the plan-set agent (fs-set-plans): a layout run's option written as the fs-set-plans project.json
// (skills/fs-set-plans/references/project-model.md), in the run's own frame (feet, x east, y north), so that agent builds
// the set from exact geometry. Also the model as <<FS:nnnn:...:FS>> text lines (fs-set-plans/scripts/read_model.py
// rebuilds the model from them), which the sheet PDF carries as invisible text.
import * as S from './engine/siteplan.mjs';
import * as B from './engine/layoutbrief.mjs';

const r2 = v => Math.round(v * 100) / 100, P = r => r.map(p => [r2(p[0]), r2(p[1])]);
const ccw = r => (S.signedArea(r) >= 0 ? r : r.slice().reverse());
// the engine's use names to the plan set's (multifamily, hotel and storage get no floor-plan design there)
const USE = { multifamily: 'multifamily', townhomes: 'townhomes', duplex: 'duplex', sfr: 'sfr', retail: 'retail', restaurant: 'restaurant', office: 'office', medical: 'medical', industrial: 'industrial', flex: 'industrial', storage: 'storage', amenity: 'amenity', fuel: 'fuel', hotel: 'hotel', church: 'church' };
const FLOOR_H = { multifamily: 10, townhomes: 10, duplex: 10, sfr: 10, retail: 16, restaurant: 16, office: 13, medical: 13, industrial: 32, storage: 10, amenity: 14, hotel: 10 };

// a drive's centre line and width: a path drive as drawn, a box along its long side, an outline along its longest
// bounding-box direction (an entry with curb returns)
function driveLine(e) {
  if (e.path?.length >= 2) return { pts: P(e.path), width: +e.width || 24 };
  if (!e.poly && +e.w > 0 && +e.d > 0) { const a = (e.rot || 0) * Math.PI / 180, along = e.w >= e.d, L = Math.max(e.w, e.d), u = along ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)];
    return { pts: P([[e.x - u[0] * L / 2, e.y - u[1] * L / 2], [e.x + u[0] * L / 2, e.y + u[1] * L / 2]]), width: r2(Math.min(e.w, e.d)) }; }
  const r = S.outline(e), xs = r.map(p => p[0]), ys = r.map(p => p[1]), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), c = S.centroid(r);
  return w >= h ? { pts: P([[Math.min(...xs), c[1]], [Math.max(...xs), c[1]]]), width: r2(Math.min(h, 30)) } : { pts: P([[c[0], Math.min(...ys)], [c[0], Math.max(...ys)]]), width: r2(Math.min(w, 30)) };
}
// a single row of 90 degree stalls: its long edge and the side the stalls are on (an outline that's a whole field goes to paving only)
function parkingRow(e, name) {
  if (e.poly || !(+e.w > 0) || !(+e.d > 0) || Math.min(e.w, e.d) > 20) return null;
  const c = ccw(S.corners(e)), L01 = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]), L12 = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]);
  const [a, b] = L01 >= L12 ? [c[0], c[1]] : [c[1], c[2]]; // (counter-clockwise: the row lies to the left of a -> b)
  return { name, a: P([a])[0], b: P([b])[0], side: 'left', stall_w: 9, stall_d: 18 };
}

export function projectOf(rec, { option = 1, name = '', address = '', county = '', client = '', number = '', date = '' } = {}) {
  const o = rec.options?.[option - 1]; if (!o) throw new Error('The run has no option ' + option + ' (it has ' + (rec.options?.length || 0) + ').');
  const eng = B.toEngine(rec.brief), plan = eng.plan, ring = plan.ring, q = o.quantities, v = o.validation, els = o.elements;
  const acres = S.ringArea(ring) / 43560;
  const site = { boundary: P(ring), north_deg: 0, display_rotate_deg: 0, boundary_source: rec.brief.site?.source || 'the site outline given to the layout run (feet, x east, y north)',
    setbacks: { front: plan.setbacks.front, rear: plan.setbacks.rear, side: plan.setbacks.side },
    buildings: [], paving: [], parking_rows: [], drives: [], ponds: [], lots: [], open_space: [], streets: [], easements: [] };
  // a type per distinct building (its use, footprint and floors), named A, B, C ... in the order first met
  const types = [], typeKey = new Map();
  for (const e of els) {
    if (e.kind !== 'building' && e.kind !== 'garage' || e.future) continue;
    const use = e.kind === 'garage' ? 'other' : USE[e.use || o.program?.use] || 'other', W = r2(Math.max(e.w || 0, e.d || 0) || 0), D = r2(Math.min(e.w || 0, e.d || 0) || 0), fl = e.kind === 'garage' ? +e.levels || 1 : +e.floors || 1;
    const k = [use, W, D, fl, e.units || 0].join('|');
    if (!typeKey.has(k)) { const id = String.fromCharCode(65 + types.length % 26) + (types.length >= 26 ? Math.floor(types.length / 26) : ''); typeKey.set(k, id);
      types.push({ id, use, W, D, floors: fl, floor_h: FLOOR_H[use] || 12, ...(['townhomes', 'duplex'].includes(use) && +e.units > 1 ? { attached: true, units_per: +e.units } : {}), count: 0, ...(e.units ? { units_each: +e.units } : {}), note: e.note || '' }); }
    const t = types.find(x => x.id === typeKey.get(k)); t.count++;
    site.buildings.push({ name: e.name || (e.kind === 'garage' ? 'Parking garage' : 'Building'), type: t.id, poly: P(S.outline(e)) });
  }
  let rowN = 0;
  for (const e of els) {
    if (e.future) continue;
    if (e.kind === 'parking') { site.paving.push({ kind: 'parking', poly: P(S.outline(e)) }); const r = parkingRow(e, 'Row ' + (++rowN)); if (r) site.parking_rows.push(r); }
    else if (e.kind === 'drive' || e.kind === 'truck') { site.paving.push({ kind: 'drive', poly: P(S.outline(e)) }); const d = driveLine(e); site.drives.push({ name: e.name || (e.kind === 'truck' ? 'Truck court' : 'Drive'), ...d, fire_lane: d.width >= 20 && !/parking aisle/i.test(e.note || '') }); }
    else if (e.kind === 'plaza' || e.kind === 'walk') site.paving.push({ kind: 'walk', poly: P(S.outline(e)) });
    else if (e.kind === 'pond') site.ponds.push({ name: e.name || 'Detention pond', poly: P(S.outline(e)), depth_ft: +e.depth || 6 });
    else if (e.kind === 'lot') site.lots.push({ id: e.id, poly: P(S.outline(e)) });
    else if (e.kind === 'green' && !e.future) site.open_space.push({ poly: P(S.outline(e)) });
    else if (e.kind === 'keepout') site.easements.push({ label: (e.name || 'Keep-out') + ' (verify)', poly: P(S.outline(e)) });
  }
  const pk = q.parking || {};
  site.parking = { required: pk.required, provided: pk.provided, ada: pk.accessibleNeeded, basis: pk.rule || 'engine use defaults (verify against the code)' };
  site.stated = { acres: +acres.toFixed(3), building_sf: Math.round(q.totals?.gfa || 0), ...(q.totals?.units ? { units: q.totals.units } : {}), stalls: pk.provided };
  // the facts: every check that failed or couldn't be decided, and every rule the layout rests on that isn't verified
  const facts = [];
  for (const c of v.checks || []) if (c.status === 'fail' || c.status === 'unknown') facts.push((c.status === 'fail' ? (c.hard ? 'FAILS: ' : 'WARNING: ') : 'UNVERIFIED: ') + c.title + (c.note ? ' (' + c.note + ')' : '') + (c.rule ? ' [' + c.rule + ']' : ''));
  for (const [k, r] of Object.entries(rec.brief.rules?.values || {})) if (r && r.cls !== 'verified') facts.push('ENGINEERING ASSUMPTION: ' + k + ' ' + JSON.stringify(r.v) + (r.source ? ' (' + r.source + ')' : ''));
  const today = date || new Date(rec.created || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return {
    project: { name: name || 'Site layout', client, address, county, number, option: 'Option ' + String.fromCharCode(64 + option), date: today, drawn_by: 'REI', checked_by: '', revisions: [{ no: '0', date: today, desc: 'Conceptual site layout' }] },
    facts, site, types,
    notes: { description: o.name + ' on ' + acres.toFixed(2) + ' acres' + (q.totals?.units ? ': ' + q.totals.units + ' units' : '') + (q.totals?.gfa ? ', ' + Math.round(q.totals.gfa).toLocaleString('en-US') + ' sf of building' : '') + '. Laid out by the Real Estate Intelligence layout engine (' + rec.versions?.engine + '); conceptual, not for permit or construction.' },
    source_layout: { engine: rec.versions, input_hash: rec.inputHash, option, geometry_hash: o.geometryHash, check: { status: v.status, failed: v.failed, unresolved: v.unresolved }, note: 'Geometry in feet in the layout run\'s frame. Build the set from this file, not by tracing the drawing.' }
  };
}

// the model as numbered text lines, as fs-set-plans/scripts/modeltext.py writes them (a line breaks only after a comma
// outside a string), so read_model.py rebuilds it from a PDF's text in any order
export const MODEL_BEGIN = 'FS-MODEL BEGIN (machine-readable project model; read_model.py rebuilds it)', MODEL_END = 'FS-MODEL END';
export function modelLines(model, width = 280) {
  const s = JSON.stringify(model).replace(/[\u007f-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')), out = []; let cur = '', inStr = false, esc = false;
  for (const ch of s) { cur += ch;
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; }
    else if (ch === '"') inStr = true;
    else if (ch === ',' && cur.length >= width) { out.push(cur); cur = ''; } }
  if (cur) out.push(cur);
  return [MODEL_BEGIN, ...out.map((ln, i) => '<<FS:' + String(i).padStart(4, '0') + ':' + ln + ':FS>>'), MODEL_END];
}
export function modelFromText(text) { const parts = [...text.matchAll(/<<FS:(\d{4}):([\s\S]*?):FS>>/g)].sort((a, b) => +a[1] - +b[1]); return parts.length ? JSON.parse(parts.map(p => p[2].replace(/[\r\n]/g, '')).join('')) : null; }
