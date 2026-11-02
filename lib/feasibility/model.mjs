// @ts-check
// The one shared data model of a feasibility study (docs/INTEGRATION_PLAN.md §4.3). A project stays one JSON
// document (site_projects.doc, synced by api/projects.js); everything the study adds lives under project.fz. Results
// (budget, pro forma, sensitivity) are never stored: they are recomputed from these inputs by lib/feasibility/
// pipeline.mjs, so the browser, the API and the tests always agree. A report keeps the hash of the inputs it was made
// from.
//
// Types (JSDoc, checked by `npm run typecheck`):
/**
 * @typedef {'data'|'library'|'plan'|'house'|'user'|'derived'} SourceKind
 * @typedef {{ kind: SourceKind, label: string, ref?: string, asOf?: string, confidence?: 'high'|'medium'|'medium-low'|'low' }} SourceRef
 * @typedef {{ key: string, label: string, owner?: string, propId?: string, apn?: string, address?: string, city?: string, zip?: string,
 *   county?: string, acres?: number, landValue?: number, marketValue?: number, center?: number[], geometry: object, source?: SourceRef }} Parcel
 * @typedef {{ address?: string, city?: string, county?: string, state?: string, zip?: string, jurisdiction?: string, targetUse?: string,
 *   landPrice?: number|null, landBasis?: 'asking'|'appraised-land'|'appraised-total'|'house' }} Intake
 * @typedef {{ id: string, name: string, overrides: Object<string, any>, mix?: { name: string, sf: number, pct: number }[] }} Scenario
 * @typedef {{ name: string, type: string, bytes: number, path?: string }} ReportFile
 * @typedef {{ id: string, kind: 'feasibility', created: string, by?: string, scenario?: string, inputsHash: string, files: ReportFile[], headline?: object }} Report
 * @typedef {{ schema: number, intake: Intake, optionId?: string|null, overrides: Object<string, any>, budgetEdits: Object<string, { rate?: number, qty?: number, off?: boolean }>,
 *   scenarios: Scenario[], activeScenario?: string|null, reports: Report[] }} Feasibility
 * @typedef {{ id: string, group: string, csi?: string, division?: string, desc: string, qty: number, unit: string, rate: number, amount: number, source: SourceRef, note?: string, edited?: boolean }} BudgetLine
 * @typedef {{ key: string, label: string, group: string, value: any, unit: string, source: SourceRef, range?: number[], edited?: boolean, note?: string }} Assumption
 */

export const SCHEMA = 1;

// the workspace's steps, in order (src/workspace.js)
export const STEPS = [
  { id: 'intake', n: 1, label: 'Intake', about: 'The project, its parcels and the land basis.' },
  { id: 'site', n: 2, label: 'Site', about: 'The site outline, its buildable envelope and a layout option.' },
  { id: 'plans', n: 3, label: 'Plans', about: 'The schematic plan set for the chosen option.' },
  { id: 'budget', n: 4, label: 'Budget', about: 'A CSI-coded budget priced from the layout’s quantities.' },
  { id: 'proforma', n: 5, label: 'Pro Forma', about: 'Development cash flows, returns, sensitivity and scenarios.' },
  { id: 'reports', n: 6, label: 'Reports', about: 'The full report set: PDF, workbook, register and data.' }
];
export const stepById = id => STEPS.find(s => s.id === id) || STEPS[0];

// the scope statement shown in the app and on every report (docs/INTEGRATION_PLAN.md §6)
export const SCOPE = 'Feasibility / schematic level only. The plan set is a schematic-design set for planning and pricing conversations. It is not a permit set and not construction documents, and it has not been prepared, sealed or reviewed by a licensed architect or engineer. Parcel lines come from appraisal-district or provider data, not a boundary survey. Costs are estimates from the team’s budget workbook, the medians of the team’s 2024–25 budgets and house rates, not contractor bids. Market rents, cap rates and financing terms are assumptions, not appraisals. Use the outputs to decide whether to pursue a site, not to build from.';

// ---------- sources ----------
export const SOURCE_KINDS = {
  data: 'Public data',
  library: 'Cost library',
  plan: 'From the concept plan',
  house: 'House assumption',
  user: 'Your input',
  derived: 'Calculated'
};
/** @returns {SourceRef} */
export const src = (kind, label, o = {}) => ({ kind, label, ...o });
export const userSource = (prev) => src('user', 'Edited in the workspace' + (prev?.label ? ' (was: ' + prev.label + ')' : ''), { confidence: 'medium' });
// the assumption groups, in order
export const GROUP_LABELS = { cost: 'Cost', revenue: 'Revenue', operations: 'Operations', financing: 'Financing', returns: 'Exit and returns', schedule: 'Schedule' };
export const sourceText = s => !s ? '' : (SOURCE_KINDS[s.kind] || s.kind) + ': ' + s.label + (s.asOf ? ' (' + s.asOf + ')' : '');

// ---------- the project's feasibility state ----------
/** @returns {Feasibility} */
export function newFeasibility() {
  return { schema: SCHEMA, intake: { state: 'TX', landPrice: null, landBasis: 'appraised-land' }, optionId: null, overrides: {}, budgetEdits: {}, scenarios: [], activeScenario: null, reports: [] };
}
// project.fz with every field present (an older project, or one from before the workspace, gets the defaults). Does
// not change the project.
/** @returns {Feasibility} */
export function fzOf(p) {
  const d = newFeasibility(), f = p?.fz || {};
  return { ...d, ...f, intake: { ...d.intake, ...(f.intake || {}) }, overrides: { ...(f.overrides || {}) }, budgetEdits: { ...(f.budgetEdits || {}) },
    scenarios: Array.isArray(f.scenarios) ? f.scenarios.map(cleanScenario) : [], reports: Array.isArray(f.reports) ? f.reports : [] };
}

// a scenario as the study reads it: its unit mix as numbers (a synced document is data from other people's devices)
const cleanScenario = s => !s || !Array.isArray(s.mix) ? s : { ...s, mix: s.mix.map(t => ({ name: String(t?.name ?? '').slice(0, 40), sf: Number.isFinite(+t?.sf) ? +t.sf : 0, pct: Number.isFinite(+t?.pct) ? +t.pct : 0 })) };

// the site option the study runs on: the chosen one, else the first with a layout, else the first drawn
export function optionOf(p) {
  const plans = p?.plans || [], fz = fzOf(p), laid = pl => (pl.ring || []).length >= 3 && (pl.elements || []).some(e => e.kind === 'building');
  return plans.find(pl => pl.id === fz.optionId) || plans.find(laid) || plans.find(pl => (pl.ring || []).length >= 3) || null;
}

// ---------- parcels ----------
const num = v => (v == null || v === '' || !Number.isFinite(+v)) ? undefined : +v;
const str = (v, n = 160) => v == null || v === '' ? undefined : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || undefined;
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// a parcel record from the map's property card (api/building.js), a provider or a survey, kept with its address and
// ZIP (the market check reads the ZIP) and where it came from
/** @returns {Parcel} */
export function parcelFrom(r, source) {
  return /** @type {Parcel} */ (clean({
    key: str(r.key ?? r.id ?? r.propId ?? r.apn, 80) || 'p' + Math.random().toString(36).slice(2, 9), label: str(r.label ?? r.situs ?? r.address, 120) || 'Parcel',
    owner: str(r.owner, 120), propId: str(r.propId, 40), apn: str(r.apn, 40),
    address: str(r.address ?? r.situsStreet ?? r.situs, 120), city: str(r.city ?? r.situsCity, 60), zip: str(r.zip ?? r.situsZip, 10), county: str(r.county, 40),
    acres: num(r.acres), landValue: num(r.landValue), marketValue: num(r.marketValue), center: Array.isArray(r.center) ? r.center : undefined,
    geometry: r.geometry, source: source || r.source
  }));
}
// the intake facts the parcels already know (address, city, ZIP, county): filled in only where the intake is empty
export function intakeFromParcels(intake, parcels) {
  const first = k => (parcels || []).map(x => x?.[k]).find(Boolean), out = { ...intake };
  for (const [k, pk] of [['address', 'address'], ['city', 'city'], ['zip', 'zip'], ['county', 'county']]) if (!out[k] && first(pk)) out[k] = first(pk);
  return out;
}

// ---------- validation ----------
const finite = v => typeof v === 'number' && Number.isFinite(v);
// problems with a project's study inputs, as plain sentences ([] when it's fine). knownKeys: the assumption keys that
// exist (lib/feasibility/assumptions.mjs), so an override of a key that doesn't is caught.
export function validateProject(p, { knownKeys = null } = {}) {
  const out = [], fz = fzOf(p);
  if (!p || typeof p !== 'object') return ['The project is missing.'];
  if (!p.id) out.push('The project has no id.');
  if (!Array.isArray(p.parcels)) out.push('The project has no parcel list.');
  for (const x of p.parcels || []) { if (!x.geometry || !/Polygon/.test(x.geometry.type || '')) out.push('Parcel ' + (x.label || x.key) + ' has no outline.'); if (x.acres != null && !(finite(x.acres) && x.acres > 0)) out.push('Parcel ' + (x.label || x.key) + ' has an impossible area.'); }
  if (fz.optionId && !(p.plans || []).some(pl => pl.id === fz.optionId)) out.push('The chosen site option no longer exists.');
  const lp = fz.intake.landPrice; if (lp != null && !(finite(lp) && lp >= 0)) out.push('The land price must be a number of dollars.');
  if (!['asking', 'appraised-land', 'appraised-total', 'house'].includes(fz.intake.landBasis)) out.push('The land basis is not one the study knows.');
  const checkOver = (o, where) => { for (const [k, v] of Object.entries(o || {})) { if (knownKeys && !knownKeys.has(k)) out.push(where + ' changes an unknown assumption: ' + k + '.'); else if (typeof v === 'number' && !Number.isFinite(v)) out.push(where + ' sets ' + k + ' to a non-number.'); } };
  checkOver(fz.overrides, 'The study');
  const ids = new Set(); for (const s of fz.scenarios) { if (!s.id || ids.has(s.id)) out.push('Scenario ids must be unique.'); ids.add(s.id); checkOver(s.overrides, 'Scenario ' + (s.name || s.id)); if (s.mix && !s.mix.every(t => finite(+t.sf) && finite(+t.pct))) out.push('Scenario ' + (s.name || s.id) + ' has a unit mix with a non-number.'); }
  for (const [id, e] of Object.entries(fz.budgetEdits)) if ((e.rate != null && !finite(e.rate)) || (e.qty != null && !finite(e.qty))) out.push('Budget line ' + id + ' has a non-number edit.');
  return out;
}

// ---------- hashing ----------
// canonical JSON (keys sorted) and its FNV-1a hash: the same inputs always give the same hash, in any key order
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
export function hashOf(v) {
  const s = canonical(v); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
