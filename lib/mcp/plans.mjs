// MCP tools for working on a saved site plan (api/mcp.js), what a person does in the plan panel after Build with AI:
//   plan_get      open it: the site, the request, the numbers, every piece by id and name, the other layouts of the run
//   plan_edit     change it in words (the app's Change With AI: api/siteplan.js mode 'edit', else the words read directly,
//                 lib/siteedit.mjs guessEdits) or typed edits (move, remove, change, add, swap, turn, lock, unlock), the
//                 rest of the site re-fitted round the change when asked (lib/sitelayout.mjs refit, kept only when it loses
//                 nothing, as the app does). Locked pieces never change. The result is saved as a new plan (its parent kept).
//                 A building added by type (lib/btypes.mjs presets: btype, sized to the keys / units / floors asked); settings
//                 (setbacks, parking ratio and angle, entrances, the guardrails) lay the site out again with them
//                 (lib/mcp/siteplan.mjs laid, inside the jurisdiction's guardrails), locked pieces kept
//   plan_pick     make one of the run's other layouts the plan (a new plan)
//   plan_compare  plans side by side: numbers, quality check, independent check, a quick value
//   plan_check    the independent check (lib/layoutcheck.mjs, the plan panel's Numbers › Independent check), the planner's
//                 quality check (lib/planaudit.mjs), the jurisdiction's checks (lib/guardrails.mjs), each ask of the request
//                 measured on the drawing (lib/layoutintent.mjs checkPlacement) and the queues (lib/btsite.mjs)
//   plan_numbers  floor area, units and unit mix, hotel keys, beds, children, students, parking (and its quality measured:
//                 scripts/parking-metrics.mjs), queues, coverage, open space, detention, and the pro forma at the app's
//                 market assumptions (lib/proforma.mjs, the panel's Pro forma step)
//   plan_export   the sheet PDF (lib/sitesheet.mjs), a picture (SVG, or a JPEG), CAD (DXF), GeoJSON, the plan JSON and the
//                 BIM model script (lib/bim.mjs; IFC too where the BIM tool, BIMCRAFT_CLI, is installed)
//   plan_from_project / save_plan_to_project  a project's option as a plan, and a plan saved to a project as an option
// Everything runs here on the app's own code; plans are kept in the platform's storage (lib/mcp/store.mjs, plans/<id>.json),
// the same records site_plan saves, so plan_set and site_renderings take any of these plan ids. A plan is never changed in
// place: every edit or pick is a new plan id, so an agent can compare and go back.
import * as SP from '../siteplan.mjs';
import * as G from '../guardrails.mjs';
import * as ED from '../siteedit.mjs';
import * as LB from '../layoutbrief.mjs';
import * as PF from '../proforma.mjs';
import * as PJ from '../project.mjs';
import * as BT from '../btypes.mjs';
import * as I from '../layoutintent.mjs';
import { queueOf } from '../btsite.mjs';
import { parkingMetrics } from '../../scripts/parking-metrics.mjs';
import { validateLayout } from '../layoutcheck.mjs';
import { governingParking } from '../layoutrun.mjs';
import { refit } from '../sitelayout.mjs';
import { refitVerdict, areaPiece } from '../sitetools.mjs';
import { auditPlan, auditLines } from '../planaudit.mjs';
import { sheetHTML, planSVG } from '../sitesheet.mjs';
import { bimScript } from '../bim.mjs';
import { render as chromium, snapshots as chromiumShots } from '../pdf.mjs';
import { siteAI as appAI } from '../../api/siteplan.js';
import { slug } from '../../src/reportkit.js';
import { store, putJSON, getJSON, newId, ID } from './store.mjs';
import { siteInfo, layoutGeoJSON, altOf, laid, guardLine } from './siteplan.mjs';
import { readProject, addPlanOption, linkOf } from './projects.mjs';
import { UserError } from './resolve.mjs';
import { doc, n0, n1, usd, usdM, clip } from './text.mjs';
import { PDF_LIMIT, pages } from './reports.mjs';

// tests: stand-ins for the AI, the sheet printer, the picture maker and the BIM tool
export const hooks = { ai: null, render: null, snapshots: null, bim: null };
const ai = b => (hooks.ai || appAI)({ ...b, ...(process.env.MCP_SITEPLAN_PROVIDER === 'anthropic' ? { provider: 'anthropic', ...(process.env.MCP_SITEPLAN_MODEL ? { model: process.env.MCP_SITEPLAN_MODEL } : {}) } : {}) });
const within = (p, ms) => { let tm; return Promise.race([p, new Promise(res => { tm = setTimeout(() => res(null), Math.max(0, ms)); })]).finally(() => clearTimeout(tm)); };
const f0 = v => Math.round(+v || 0).toLocaleString('en-US');
const money = v => v == null || !Number.isFinite(+v) ? '—' : (v < 0 ? '−' : '') + usdM(Math.abs(v));
export const EXPORTS = ['pdf', 'svg', 'image', 'dxf', 'geojson', 'json', 'bim'];

// ---------- saved plans ----------
const stOf = () => { const s = store(); if (!s) throw new UserError('Saved plans need the platform’s storage, which isn’t set up on this deployment (SUPABASE_SECRET_KEY).'); return s; };
export async function loadPlan(id) {
  if (!ID.test(String(id || ''))) throw new UserError('Give plan_id: site_plan, plan_edit, plan_pick and plan_from_project answer with one.');
  const rec = await getJSON(stOf(), 'plans/' + id + '.json');
  if (!rec?.plan?.ring?.length) throw new UserError('There’s no saved plan ' + id + '. site_plan, plan_edit, plan_pick and plan_from_project keep plans and give their ids.');
  return rec;
}
// a new plan from an earlier one (renderings belong to the old drawing; a plan set is made from the new id)
async function savePlan(rec, parent, change) {
  const { renders, ...r } = rec; void renders;
  const id = newId(), out = { ...r, v: 1, id, at: new Date().toISOString(), parent: parent?.id || null, history: [...(parent?.history || []), ...(change ? [{ at: new Date().toISOString(), from: parent?.id || null, ...change }] : [])] };
  await putJSON(stOf(), 'plans/' + id + '.json', out); return out;
}
const wantsOf = rec => ({ homeKind: SP.guessProgram(rec.request || '').homeKind || null });
const auditOf = (plan, rec) => { try { return auditPlan(plan, wantsOf(rec)); } catch (e) { return { verdict: 'not checked', fails: 0, warns: 0, passes: 0, items: [{ level: 'warn', area: 'checks', text: 'The quality check couldn’t run: ' + e.message }] }; } };

// ---------- the numbers (G.metrics: the jurisdiction's working numbers where its guardrails apply) ----------
export function numbersOf(plan) {
  const m = G.metrics(plan), B = (plan.elements || []).filter(e => e.kind === 'building');
  return { acres: +(+m.acres).toFixed(2), buildings: B.filter(e => e.use !== 'amenity').length, amenities: B.filter(e => e.use === 'amenity').length, floorAreaSf: Math.round(m.gfa || 0), far: +(+m.far || 0).toFixed(2),
    units: m.units || 0, unitsPerAcre: +(+m.duAc || 0).toFixed(1), parkingSpaces: Math.round(m.spaces || 0), parkingRequired: Math.round(m.required || 0), coveragePct: Math.round((m.coverage || 0) * 100),
    openSpacePct: Math.round((m.green || 0) * 100), detentionAc: +((m.pond || 0) / 43560).toFixed(2), leasableSf: Math.round(SP.lsfOf(m)), unitMix: (m.mix || []).filter(t => t.n > 0).map(t => ({ name: t.name, sf: Math.round(t.sf), units: t.n })), ...countsOf(plan) };
}
const numLine = n => [n0(n.floorAreaSf) + ' sf (FAR ' + n.far.toFixed(2) + ')', n.units ? n0(n.units) + ' units (' + n.unitsPerAcre + '/acre)' : null, n.keys ? n0(n.keys) + ' keys' : null, n.beds ? n0(n.beds) + ' beds' : null, n.buildings + ' buildings' + (n.amenities ? ' + ' + n.amenities + ' amenity' : ''),
  'parking ' + n0(n.parkingSpaces) + ' / ' + n0(n.parkingRequired) + ' required', 'coverage ' + n.coveragePct + '%', 'open space ' + n.openSpacePct + '%', 'detention ' + n.detentionAc + ' ac'].filter(Boolean).join(' · ');
const mixLine = n => n.unitMix.length ? 'Unit mix: ' + n.unitMix.map(t => t.units + ' × ' + t.name + ' (' + f0(t.sf) + ' sf)').join(', ') : null;
// what changed between two sets of numbers, in words
function deltas(a, b) {
  const out = [], d = (k, label, unit = '') => { const x = a[k], y = b[k]; if (x !== y) out.push(label + ' ' + f0(x) + unit + ' → ' + f0(y) + unit + ' (' + (y > x ? '+' : '−') + f0(Math.abs(y - x)) + unit + ')'); };
  d('units', 'units'); d('keys', 'keys'); d('floorAreaSf', 'floor area', ' sf'); d('parkingSpaces', 'parking'); d('parkingRequired', 'parking required'); d('coveragePct', 'coverage', '%'); d('openSpacePct', 'open space', '%'); d('buildings', 'buildings');
  return out;
}
// the pro forma at the app's market assumptions (the panel's Pro forma step), land at its default unless given
export function proformaOf(plan, land = null) {
  if (!(plan.elements || []).some(e => e.kind === 'building' && e.use !== 'amenity')) return null;
  try { const R = PF.run(plan, PF.defaults(plan, land)); return PF.proFormaSummary(R); } catch (e) { return { error: e.message }; }
}
const pfLines = s => !s ? ['Pro forma: nothing to price (no leasable or sellable buildings).'] : s.error ? ['Pro forma: couldn’t be run (' + clip(s.error, 120) + ').'] : [
  'Total cost ' + usdM(s.totalCost) + (s.noi != null ? ' · NOI ' + usdM(s.noi) : '') + (s.yieldOnCost != null ? ' · yield on cost ' + (s.yieldOnCost * 100).toFixed(2) + '%' : '') + (s.value != null ? ' · value ' + money(s.value) : '') + (s.profit != null ? ' · profit ' + money(s.profit) : '') + (s.levIrr != null ? ' · levered IRR ' + (s.levIrr * 100).toFixed(1) + '%' : ''),
  ...(s.warnings || []).slice(0, 4).map(w => 'Note: ' + w), s.disclaimer];

// what a building type counts (lib/proforma.mjs areaOf: hotel keys, beds, children, students), as the Numbers panel shows
export function countsOf(plan) {
  try { const a = PF.areaOf(PF.metricsOf(plan), PF.defaults(plan), {}); return Object.fromEntries(['keys', 'beds', 'children', 'students'].filter(k => a?.[k] > 0).map(k => [k, Math.round(a[k])])); } catch (e) { return {}; }
}
const COUNT_WORD = { keys: 'hotel keys', beds: 'beds', children: 'children (licensed capacity)', students: 'students' };
const countLine = n => { const c = ['keys', 'beds', 'children', 'students'].filter(k => n[k] > 0); return c.length ? c.map(k => n0(n[k]) + ' ' + COUNT_WORD[k]).join(' · ') : null; };
// the building types on the plan (lib/btypes.mjs: each typed building carries its preset id)
const typesLine = plan => { const m = new Map(); for (const e of (plan.elements || []).filter(x => x.kind === 'building' && x.btype)) { const P = BT.presetOf(e.btype), k = P?.label || e.btype, x = m.get(k) || { n: 0, keys: 0 }; x.n++; x.keys += +e.keys || 0; m.set(k, x); }
  return m.size ? 'Building types: ' + [...m.entries()].map(([k, x]) => k + ' (' + x.n + (x.keys ? ', ' + n0(x.keys) + ' keys' : '') + ')').join(', ') : null; };

// ---------- what was asked and assumed (lib/layoutbrief.mjs understand, lib/layoutintent.mjs checkPlacement) ----------
// measured on this drawing, so an edit that meets or breaks an ask shows: each "Asked: … done / not met" line, and what
// the reading assumed where the words left things open
export function askedOf(rec, plan = rec.plan) {
  let b; try { b = LB.briefFromProgram(plan.program || {}, plan, { text: rec.request || '' }); } catch (e) { return { asked: [], assumed: [] }; }
  const asked = (b.program?.placements || []).map(p => { try { return I.checkPlacement(plan, plan.elements || [], plan.program || {}, p); } catch (e) { return null; } }).filter(Boolean);
  return { asked, assumed: (b.request?.assumed || []).filter(x => x && !/^Asked: /.test(x)) };
}
const askLines = A => [...A.assumed.map(x => /^Assumed/.test(x) ? x : 'Assumed: ' + x), ...A.asked.map(c => c.said)];

// ---------- parking measured on the drawing (scripts/parking-metrics.mjs: planning measures, not code checks) ----------
export function parkingOf(plan) {
  let m = null; try { m = parkingMetrics(plan); } catch (e) { m = null; }
  const rows = (plan.elements || []).filter(e => e.kind === 'parking'), ang = rows.filter(e => SP.stallAng(e));
  return { m, rows: rows.length, angled: ang.length, angles: [...new Set(ang.map(SP.stallAng))] };
}
const parkLines = P => { const m = P.m; if (!m?.stalls) return ['No surface stalls drawn.'];
  return ['Stalls drawn: ' + n0(m.stalls) + ' surface' + (P.angled ? ' (' + P.angled + ' of ' + P.rows + ' rows angled at ' + P.angles.join(' / ') + '°, on one-way aisles)' : ''),
    'Lot paving: ' + n0(m.sfStall) + ' sf a stall (a surface lot is usually 300–350)' + (m.surplusPct ? '; ' + m.surplusPct + '% of the paving under no row or drive' : ''),
    'Islands: the longest run without a planted island is ' + m.maxRun + ' stalls (' + m.long + ' runs over 15); ' + m.bareEnds + ' of ' + m.ends + ' row ends without an island',
    'Dead-end aisles: ' + m.deadEnds + (m.deadEnd150 ? ' (' + m.deadEnd150 + ' with stalls over 150 ft past the last join)' : ''),
    ...(m.walkMed != null ? ['Walk, stall to the nearest building: median ' + m.walkMed + ' ft, 90% within ' + m.walk90 + ' ft, farthest ' + m.walkMax + ' ft' + (m.walkBld200 ? '; ' + m.walkBld200 + ' building' + (m.walkBld200 > 1 ? 's' : '') + ' with a 90th-percentile walk over 200 ft' : '')] : []),
    ...(m.throat != null ? ['Entrance throat: ' + m.throat + ' ft in from the street before a stall backs into the entry drive (' + m.throatNeed + ' ft wanted for a lot this size)' + (m.entryStalls ? '; ' + m.entryStalls + ' stalls inside it' : '')] : []),
    ...(m.adaNeed != null ? ['Accessible stalls: ' + m.adaPlaced + ' placed, ' + m.adaNeed + ' needed (2010 ADA 208.2)'] : []),
    ...(m.tiny || m.skew || m.orphan ? ['Stray rows: ' + [m.tiny ? m.tiny + ' of 1–4 stalls' : '', m.skew ? m.skew + ' skewed' : '', m.orphan ? m.orphan + ' with no drive along them' : ''].filter(Boolean).join(', ')] : [])]; };

// ---------- queues: drive-thru lanes and a car wash's stacking lanes (lib/btsite.mjs), and the validator's queue checks ----------
const QICON = { pass: '✓', fail: '✗', unknown: '?', 'n/a': '–' };
const queueLines = (plan, ic) => { const q = queueOf(plan.elements || []), ck = (ic?.checks || []).filter(c => /^queues\./.test(c.id) && c.status !== 'n/a');
  return [...q.map(x => '- ' + (x.kind === 'carwash' ? 'Car wash stacking lane' : 'Drive-thru lane') + ' ' + x.id + ': ' + x.len + ' ft, about ' + x.cars + ' car' + (x.cars === 1 ? '' : 's')), ...ck.map(c => QICON[c.status] + ' ' + c.id + ' — ' + c.title + (c.measured != null ? ': ' + val(c.measured) + (c.units ? ' ' + c.units : '') : '') + (c.required != null ? ' (needs ' + val(c.required) + ')' : '') + (c.note && c.status !== 'pass' ? ' — ' + clip(c.note, 200) : ''))]; };

// ---------- settings on a plan, and the plan laid out again with them ----------
// settings said in words ("set parking angle 60", "angled parking", "90 degree parking", "parking 5 per 1,000", "2 spaces a
// unit", "front setback 40 ft", "2 entrances", "guardrails off", "scenario C"), and the rest of the words
const WN = { one: 1, two: 2, three: 3, four: 4 };
const tidyRest = t => t.replace(/(?:\s*,\s*)+/g, ', ').replace(/^[\s,.;]*(?:and\s+)?(?:then\s+)?/i, '').replace(/[\s,;]*(?:\band\b)?[\s,.;]*$/i, '').replace(/,\s*(?:and\s+)?,/g, ',').trim();
export function settingsFromWords(words) {
  const set = {}, sb = {}; let t = ' ' + String(words || '') + ' ';
  const take = (re, fn) => { t = t.replace(re, (...m) => { fn(m); return ' , '; }); };
  take(/\b(?:set\s+)?(?:the\s+)?parking\s+(?:stall\s+)?angle\s*(?:to\s+|at\s+)?(\d{2})\s*(?:°|deg(?:rees?)?)?/gi, m => { set.parking_angle = +m[1]; });
  take(/\b(?:make\s+(?:the\s+)?parking\s+|use\s+)?(\d{2})[- ]?(?:°|deg(?:ree)?s?)\s+(?:angled\s+)?(?:parking|stalls?|spaces?)\b/gi, m => { set.parking_angle = +m[1]; });
  take(/\b(?:use\s+|make\s+(?:the\s+)?parking\s+|with\s+)?(?:angled|diagonal|slanted)\s+(?:parking|stalls?|spaces?)\b|\bmake\s+(?:the\s+)?parking\s+angled\b/gi, () => { if (set.parking_angle == null) set.parking_angle = 60; });
  take(/\b(?:straight|square|perpendicular|head[- ]in)\s+(?:parking|stalls?)\b|\bno\s+angled\s+parking\b/gi, () => { set.parking_angle = 90; });
  take(/\b(?:set\s+)?(?:the\s+)?parking\s+(?:ratio\s+)?(?:of\s+|to\s+|at\s+)?(\d+(?:\.\d+)?)\s*(?:spaces?\s+)?(?:\/|per|a|an)\s*1,?000(?:\s*sf)?/gi, m => { set.parking_per_1000 = +m[1]; });
  take(/\b(\d+(?:\.\d+)?)\s*(?:parking\s+)?(?:spaces?|stalls?)\s*(?:\/|per|a|an)\s*1,?000(?:\s*sf)?/gi, m => { set.parking_per_1000 = +m[1]; });
  take(/\b(\d(?:\.\d+)?)\s*(?:parking\s+)?(?:spaces?|stalls?)\s*(?:\/|per|a|an)\s*(?:unit|home|apartment|dwelling)\b/gi, m => { set.parking_per_unit = +m[1]; });
  take(/\b(?:set\s+)?(?:the\s+)?(front|side|rear|back|paving)\s+setbacks?\s*(?:of\s+|to\s+|at\s+)?(\d{1,3})\s*(?:ft|feet|')?/gi, m => { const k = m[1].toLowerCase(); sb[k === 'back' ? 'rear' : k] = +m[2]; });
  take(/\b(\d|one|two|three|four)\s+(?:entrances|entries|driveways|ways in)\b/gi, m => { set.entrances = WN[m[1].toLowerCase()] || +m[1]; });
  take(/\b(?:guardrails?|city rules?)\s+(off|on|auto)\b|\bturn\s+(off|on)\s+(?:the\s+)?(?:guardrails?|city rules?)\b/gi, m => { set.guardrails = (m[1] || m[2]).toLowerCase(); });
  take(/\bscenario\s+([abc])\b/gi, m => { set.scenario = m[1].toUpperCase(); });
  if (Object.keys(sb).length) set.setbacks = sb;
  return { set, rest: tidyRest(t) };
}
// the plan with the settings applied: { plan, did: what was set, bad: what couldn't be }
export function withSettings(plan, set = {}) {
  const did = [], bad = [], prog = { ...(plan.program || {}) }, params = { ...(plan.params || {}) }, setbacks = { ...SP.SETBACKS, ...(plan.setbacks || {}) };
  const num = (v, lo, hi) => v != null && v !== '' && Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : null;
  if (set.setbacks && typeof set.setbacks === 'object') for (const [k, v] of Object.entries(set.setbacks)) { if (!['front', 'side', 'rear', 'paving'].includes(k)) { bad.push('setbacks are front, side, rear and paving (not ' + k + ').'); continue; } const x = num(v, 0, 500); if (x == null) { bad.push(k + ' setback is 0 to 500 ft.'); continue; } setbacks[k] = x; did.push(k + ' setback ' + x + ' ft'); }
  if (set.parking_per_unit != null) { const x = num(set.parking_per_unit, 0, 4); if (x == null) bad.push('parking_per_unit is 0 to 4.'); else { prog.perUnit = x; did.push(x + ' parking spaces a home'); } }
  if (set.parking_per_1000 != null) { const x = num(set.parking_per_1000, 0, 30); if (x == null) bad.push('parking_per_1000 is 0 to 30.'); else { prog.ratio = x; did.push(x + ' parking spaces a 1,000 sf'); } }
  if (set.parking_angle != null) { const a = +set.parking_angle; if (a === 60 || a === 45) { prog.parkAngle = a; did.push(a + '° angled parking on one-way aisles'); } else if (a === 90 || a === 0) { delete prog.parkAngle; did.push('straight (90°) parking'); } else bad.push('parking_angle is 45, 60 or 90.'); }
  if (set.entrances != null) { const x = num(set.entrances, 1, 4); if (x == null) bad.push('entrances is 1 to 4.'); else { prog.entrances = Math.round(x); did.push(Math.round(x) + ' entrance' + (x > 1 ? 's' : '')); } }
  if (set.entrance_style != null) { if (!['auto', 'boulevard', 'narrow', 'driveway'].includes(set.entrance_style)) bad.push('entrance_style is auto, boulevard, narrow or driveway.'); else { params.entry = { ...(params.entry || {}), style: set.entrance_style }; did.push('entrance style ' + set.entrance_style); } }
  if (set.guardrails != null || set.scenario != null) { const g = { ...(params.guard || {}) };
    if (set.guardrails != null) { if (!['auto', 'on', 'off'].includes(set.guardrails)) bad.push('guardrails is auto, on or off.'); else { g.mode = set.guardrails; did.push('jurisdiction guardrails ' + set.guardrails); } }
    if (set.scenario != null) { const sc = String(set.scenario).toUpperCase(); if (!['A', 'B', 'C'].includes(sc)) bad.push('scenario is A, B or C.'); else { g.scenario = sc; did.push('guardrail scenario ' + sc); } }
    params.guard = g; }
  return { plan: { ...plan, setbacks, program: prog, params }, did, bad };
}
// the plan laid out again on its own site with its settings, as Build does (lib/mcp/siteplan.mjs laid: inside the
// jurisdiction's guardrails when they apply); locked pieces stay where they are (the layout keeps off them) and are put
// back as they were. The best that passes the quality check is the plan; the others are kept for plan_pick.
function relayPlan(rec, plan) {
  if (plan.recipe?.parcels) return { why: 'a plan laid out parcel by parcel is laid out again with site_plan (per_parcel)' };
  const locked = (plan.elements || []).filter(e => e.locked), ko = (plan.elements || []).filter(e => e.kind === 'keepout' && !e.guard && !e.lockHold);
  const hold = locked.map((e, i) => { let o = null; try { o = SP.outline(e); } catch (x) { o = null; } return o?.length >= 3 ? { ...areaPiece(plan, 'keepout', o.map(p => [p[0], p[1]]), 'lockhold' + i), name: 'Locked: ' + ED.labelOf(e), pinned: true, lockHold: true } : null; }).filter(Boolean);
  const { recipe, variant, zones, ...rest } = plan; void recipe; void variant; void zones;
  const base = { ...rest, elements: [...ko, ...hold] }, kos = base.elements;
  let out = []; try { out = laid(base, plan.program, { count: 3, deeper: true, ...(kos.length ? { keepout: kos } : {}) }, rec.request || ''); } catch (e) { return { why: clip(e.message, 160) }; }
  const opts = out.filter(o => o.elements?.length).map(o => { const p = { ...base, setbacks: o.setbacks || base.setbacks, program: o.program || base.program, params: o.params || base.params, zones: o.zones || [], elements: o.elements.filter(e => !e.lockHold), ...(o.recipe ? { recipe: o.recipe } : {}) }; return { o, p, au: auditOf(p, rec) }; });
  if (!opts.length) return { why: 'nothing could be laid out on the site with those settings' };
  const k = Math.max(0, opts.findIndex(x => !x.au.fails)), pick = opts[k], held = holdLocks(pick.p.elements, locked);
  return { plan: { ...pick.p, elements: held.elements, name: plan.name || 'A', variant: { key: pick.o.key, name: pick.o.name } }, layout: pick.o.name || 'Layout', au: pick.au, notes: (pick.o.notes || []).slice(0, 8),
    alts: opts.filter((_, i) => i !== k).map(x => altOf({ ...x.o, setbacks: x.p.setbacks, program: x.p.program, params: x.p.params, elements: x.p.elements, audit: x.au })) };
}

// angled parking asked for and not drawn: said (the engine says why where it knows; a layout that doesn't draw angled rows
// yet, such as a mix of uses on zones, says nothing, so it is said here)
export function angleNote(plan, notes = []) {
  const ang = (plan.elements || []).filter(e => e.kind === 'parking' && SP.stallAng(e)).length; if (ang) return [];
  const why = (notes || []).find(n => /angled parking/i.test(n));
  return [why || 'Angled parking was asked for, but this layout’s parking stays square: the layout drawn here (' + (SP.normalizeProgram(plan.program || {}).zones?.length ? 'a mix of uses' : 'this use') + ') doesn’t lay angled rows yet.'];
}

// ---------- adding a building of a type (lib/btypes.mjs presets, the editor's "Add a building by type") ----------
// a preset named by its id, label or words ("hotel", "limited-service hotel", "daycare", "car wash")
export function presetFor(w) {
  const t = String(w || '').toLowerCase().trim().replace(/^(?:an?|one|the)\s+/, '').replace(/\s+(?:building|pad)s?$/, ''); if (!t) return null;
  const cat = BT.presetCatalog(), toks = t.split(/[\s/-]+/).filter(x => x.length > 1);
  return cat.find(c => c.id === t) || cat.find(c => c.label.toLowerCase() === t || (BT.presetOf(c.id)?.short || '').toLowerCase() === t) || cat.find(c => toks.length && toks.every(x => c.words.includes(x))) || null;
}
// the building of the preset at its usual size, sized to the keys, units or floors asked
export function typedBuilding(id, { keys, units, floors } = {}) {
  const e = BT.presetBuilding(id); if (!e) return null;
  const gsf0 = e.w * e.d * (e.floors || 1), fl = Math.max(1, Math.min(60, Math.round(+floors || e.floors || 1)));
  const per = +keys > 0 && e.keys ? gsf0 / e.keys : +units > 0 && e.units ? gsf0 / e.units : null, gsf = per ? per * (+keys || +units) : gsf0;
  if (per || fl !== e.floors) { e.floors = fl; e.w = Math.max(30, Math.min(900, Math.round(gsf / fl / e.d))); }
  if (+keys > 0 && e.keys) e.keys = Math.round(+keys); if (+units > 0 && e.units) e.units = Math.round(+units);
  e.note = [BT.presetOf(id)?.label || e.name, e.floors + '-story', e.keys ? e.keys + ' keys' : e.units > 1 ? e.units + ' units' : n0(e.w * e.d * e.floors) + ' sf'].join(' · ');
  return e;
}
const BT_EXTRA = ['btype', 'tc', 'floorH', 'keys', 'beds', 'children', 'students', 'note', 'form', 'ground', 'podium', 'plex'];
// "add a hotel with 120 keys at the front", "add a building of type daycare beside the clubhouse", "add a 4-story
// limited-service hotel": typed adds, and the rest of the words
export function typeAddsFromWords(words) {
  const adds = []; let t = String(words || '');
  t = t.replace(/\badd\s+(?:an?\s+|one\s+)?(?:new\s+)?(?:building\s+of\s+(?:the\s+)?type\s+)?(?:(\d+)[- ]stor(?:y|ey)\s+)?([a-z][a-z /&'-]{1,40}?)(?:\s+(?:building|pad))?(?:\s+(?:with|of)\s+(\d+)\s*(keys|rooms|units|homes))?(?:\s+(?:at|to|in|on)\s+(?:the\s+)?(front|back|rear|middle|center|centre|left|right)(?:\s+of\s+the\s+site)?|\s+(?:beside|next to|near|by)\s+(?:the\s+)?([a-z0-9 ]{2,40}?))?(?=\s*(?:,|;|\.|\band\b|$))/gi, (m, fl, what, n, unit, at, near) => {
    const P = presetFor(what); if (!P) return m;
    adds.push({ action: 'add', btype: P.id, ...(n ? (/keys|rooms/i.test(unit) ? { keys: +n } : { units: +n }) : {}), ...(fl ? { floors: +fl } : {}), ...(at ? { to: at.toLowerCase() } : near ? { beside: near.trim() } : { to: 'front' }) }); return ' , '; });
  return { adds, rest: tidyRest(t) };
}

// ---------- the independent check (the plan panel's Numbers › Independent check, src/siteplan.js verifyHTML) ----------
export function independentCheck(plan) {
  const brief = LB.canonicalBrief(plan.run?.brief ? { ...plan.run.brief, site: LB.siteFromPlan(plan), locks: [], locked: {} } : LB.briefFromProgram(plan.program, plan, { text: '' })), fm = SP.fillMode(plan.params);
  if (!plan.run?.brief) for (const u of brief.program.uses) if (u.quantity.mode !== 'maximize') u.quantity.mode = fm === 'hold' ? 'exact' : 'min'; /* (a plan without a run: what Leftover land says the size means) */
  /* inside a jurisdiction whose guardrails apply, its parking count is the one checked, as a run's is; one use only: on a
     mix (zones) governingParking puts the program's top-level ratio on every use counted by area (a hotel at the shops'
     4.2 a 1,000 sf), so the mix is checked at each use's own rule and its count is the one plan_numbers gives (G.metrics) */
  if (!SP.normalizeProgram(plan.program || {}).zones?.length) governingParking(brief, plan, plan.program);
  return validateLayout(plan, brief);
}
const val = v => v == null ? '' : Array.isArray(v) ? v.join('–') : typeof v === 'object' ? Object.entries(v).map(([k, x]) => k + ' ' + x).join(', ') : typeof v === 'number' ? f0(v) : String(v);
const checkHead = r => ({ pass: 'Passes every check it can measure', fail: 'Fails ' + r.failed.length + ' check' + (r.failed.length > 1 ? 's' : '') + ' (' + r.failed.join(', ') + ')', incomplete: 'No failures, but ' + r.unresolved.length + ' check' + (r.unresolved.length > 1 ? 's' : '') + ' can’t be settled from what’s known' }[r.status] || r.status);

// ---------- describing a plan ----------
function piecesOf(plan) {
  let d; try { d = ED.describePlan(plan); } catch (e) { return { lines: [], d: null }; }
  const locked = new Set((plan.elements || []).filter(e => e.locked).map(e => e.id));
  const lines = d.pieces.slice(0, 90).map(p => '- ' + p.id + ' · ' + p.name + ' (' + p.kind + (p.use && p.use !== p.kind ? ', ' + p.use : '') + ') at ' + p.at.join(', ') + (p.size ? ' · ' + p.size.join(' × ') + ' ft' : '') + (p.floors ? ' · ' + p.floors + ' fl' : '') + (p.units ? ' · ' + p.units + ' units' : '') + (locked.has(p.id) ? ' · LOCKED' : ''));
  if (d.pieces.length > 90) lines.push('… and ' + (d.pieces.length - 90) + ' more');
  return { lines, d };
}
const altLine = (rec, a, i) => (i + 2) + '. ' + a.name + ' — ' + numLine(numbersOf(altPlan(rec, a))) + (a.verdict ? ' · quality ' + a.verdict : '');
function headLines(rec) {
  return ['Site: ' + [rec.address || rec.label, rec.county].filter(Boolean).join(', ') + ' · ' + n1(SP.ringArea(rec.plan.ring) / 43560) + ' acres',
    'Request: "' + clip(rec.request || '', 300) + '"', 'Layout: ' + (rec.layout || 'Layout') + ' · quality check ' + String(rec.verdict || 'not checked').toUpperCase() + (rec.parent ? ' · from plan ' + rec.parent : '')];
}
const NEXT = 'Next: plan_edit (change it), plan_check, plan_numbers, plan_compare, plan_export (sheet PDF, picture, DXF, GeoJSON, BIM), plan_set (a set of plans) or site_renderings, all with this plan_id.';
const jsonOf = rec => { const { vicinity, renders, ...r } = rec; void vicinity; void renders; return r; };
const recordRes = rec => ({ type: 'resource', resource: { uri: 'plan://' + rec.id + '.json', mimeType: 'application/json', text: JSON.stringify(jsonOf(rec)) } });

export async function planGetTool(a = {}) {
  const rec = await loadPlan(a.plan_id), plan = rec.plan, n = numbersOf(plan), P = piecesOf(plan);
  const ents = SP.entrancesOf(plan.elements).map(e => ED.labelOf(e)), places = P.d?.places?.site ? Object.entries(P.d.places.site).map(([k, v]) => k + ' ' + v.join(', ')).join('; ') : '';
  const A = askedOf(rec), al = askLines(A);
  const L = [...headLines(rec), 'Numbers: ' + numLine(n), mixLine(n), countLine(n), typesLine(plan), ...(G.isOn(plan) ? ['Jurisdiction guardrails: ' + guardLine(plan) + '.'] : []),
    ...(al.length ? ['', '## What was asked and assumed (measured on this drawing)', ...al] : []),
    '', '## Pieces (id · name (kind) at x, y ft on the sheet: the street at the bottom, x to the right, y away from the street)', ...P.lines,
    ...(places ? ['Places that can be named in plan_edit: ' + places + (ents.length ? '; entrances: ' + ents.join(', ') : '') + '.'] : []),
    ...(rec.alts?.length ? ['', '## Other layouts from the same run (plan_pick with layout 2, 3…)', '1. ' + (rec.layout || 'This layout') + ' — the plan (picked)', ...rec.alts.map((x, i) => altLine(rec, x, i))] : []),
    ...(rec.history?.length ? ['', '## History', ...rec.history.slice(-8).map(h => '- ' + h.at.slice(0, 16).replace('T', ' ') + ' from ' + (h.from || '—') + ': ' + clip(h.what || '', 160))] : []),
    '', NEXT];
  return { content: [{ type: 'text', text: doc('Plan ' + rec.id + ': ' + (rec.projectName || 'Site plan'), L.filter(x => x != null)) }, ...(a.include_record ? [recordRes(rec)] : [])] };
}

// ---------- numbers ----------
export async function planNumbersTool(a = {}) {
  const rec = await loadPlan(a.plan_id), plan = rec.plan, n = numbersOf(plan), land = Number.isFinite(+a.land_price) && +a.land_price > 0 ? +a.land_price : null, pf = proformaOf(plan, land);
  const B = (plan.elements || []).filter(e => e.kind === 'building'), pk = parkingOf(plan), ql = (() => { let ic = null; try { ic = independentCheck(plan); } catch (e) { ic = null; } return queueLines(plan, ic); })();
  const byUse = {}; for (const e of B) { const k = SP.USES[e.use]?.label || e.use || 'Building'; const u = byUse[k] ||= { n: 0, sf: 0, units: 0 }; u.n++; u.sf += SP.gfaOf(e); u.units += e.units || 0; }
  const L = [...headLines(rec), '', '## Numbers', ...Object.entries({
    'Site': n.acres + ' acres', 'Floor area': n0(n.floorAreaSf) + ' sf (FAR ' + n.far.toFixed(2) + ')' + (n.leasableSf ? '; leasable + sellable ' + n0(n.leasableSf) + ' sf' : ''),
    'Units': n.units ? n0(n.units) + ' (' + n.unitsPerAcre + ' an acre)' : null, 'Parking': n0(n.parkingSpaces) + ' spaces for ' + n0(n.parkingRequired) + ' required' + (n.parkingSpaces < n.parkingRequired ? ' — SHORT ' + n0(n.parkingRequired - n.parkingSpaces) : ''),
    'Coverage': n.coveragePct + '% of the site under buildings', 'Open space': n.openSpacePct + '%', 'Detention': n.detentionAc + ' acres of pond' }).filter(([, v]) => v).map(([k, v]) => k + ': ' + v),
    mixLine(n), countLine(n), typesLine(plan), '', '## Parking (measured on the drawing; planning measures, not code checks)', ...(G.isOn(plan) ? ['The jurisdiction’s rule governs the count required: ' + guardLine(plan) + '.'] : []), ...parkLines(pk),
    ...(ql.length ? ['', '## Queues', ...ql] : []), '', '## By use', ...Object.entries(byUse).map(([k, u]) => '- ' + k + ': ' + u.n + ' building' + (u.n === 1 ? '' : 's') + ', ' + f0(u.sf) + ' sf' + (u.units ? ', ' + f0(u.units) + ' units' : '')),
    '', '## Pro forma (the app’s market assumptions' + (land ? ', land ' + usd(land) : ', land at its default') + ')', ...pfLines(pf),
    'For the full study (budget by CSI division, monthly cash flow, sensitivity, scenarios): save_plan_to_project, then feasibility_study.'];
  return { content: [{ type: 'text', text: doc('Numbers: plan ' + rec.id, L.filter(x => x != null)) }, { type: 'resource', resource: { uri: 'plan://' + rec.id + '/numbers.json', mimeType: 'application/json', text: JSON.stringify({ plan_id: rec.id, numbers: n, parking: { ...(pk.m || {}), angledRows: pk.angled, rows: pk.rows }, queues: queueOf(plan.elements || []), proforma: pf }) } }] };
}

// ---------- checks ----------
export async function planCheckTool(a = {}) {
  const rec = await loadPlan(a.plan_id), plan = rec.plan, au = auditOf(plan, rec); let r = null, why = '';
  try { r = independentCheck(plan); } catch (e) { why = e.message; }
  const icon = { pass: '✓', fail: '✗', unknown: '?', 'n/a': '–' }, gc = (() => { try { return G.check(plan); } catch (e) { return []; } })(), al = askLines(askedOf(rec)), ql = queueLines(plan, r);
  const L = [...headLines(rec), '',
    '## Independent check: ' + (r ? checkHead(r) + (r.restsOnAssumptions.length ? ' · ' + r.restsOnAssumptions.length + ' rest on planning assumptions' : '') : 'couldn’t run (' + clip(why, 160) + ')'),
    ...(r ? r.checks.filter(c => a.all || c.status !== 'n/a').map(c => icon[c.status] + ' ' + c.id + ' — ' + c.title + (c.measured != null ? ': ' + val(c.measured) + (c.units ? ' ' + c.units : '') : '') + (c.required != null ? ' (needs ' + val(c.required) + ')' : '') + (c.basis === 'assumption' ? ' [assumption]' : '') + (c.note && c.status !== 'pass' ? ' — ' + clip(c.note, 160) : '')) : []),
    '', '## Quality check: ' + String(au.verdict).toUpperCase() + ' (' + au.fails + ' failed, ' + au.warns + ' to note, ' + au.passes + ' passed)', ...auditLines(au, a.all ? 60 : 20),
    ...(gc.length ? ['', '## Plan checks', ...gc.slice(0, 12).map(i => '- ' + (i.level === 'bad' ? '✗ ' : '! ') + i.text)] : []),
    ...(G.isOn(plan) ? ['', '## Jurisdiction', 'Planning guardrails apply: ' + guardLine(plan) + '. Parking required is the city’s count.'] : []),
    ...(al.length ? ['', '## What was asked and assumed (measured on this drawing)', ...al] : []),
    ...(ql.length ? ['', '## Queues', ...ql] : []),
    '', 'Concept planning only: drainage, turning movements, fire route distance, grading and utilities are not measured.'];
  return { content: [{ type: 'text', text: doc('Check: plan ' + rec.id, L) }, ...(r ? [{ type: 'resource', resource: { uri: 'plan://' + rec.id + '/check.json', mimeType: 'application/json', text: JSON.stringify({ plan_id: rec.id, independent: { status: r.status, failed: r.failed, unresolved: r.unresolved, checks: r.checks.map(({ features, ...c }) => c) }, quality: { verdict: au.verdict, items: au.items }, asked: askedOf(rec) }) } }] : [])] };
}

// ---------- comparing ----------
export async function planCompareTool(a = {}) {
  const ids = [...new Set((Array.isArray(a.plan_ids) ? a.plan_ids : [a.plan_ids]).filter(Boolean).map(String))].slice(0, 6);
  if (!ids.length) throw new UserError('Give plan_ids: two or more plan ids (or one, with include_alternatives: true, to set its run’s layouts side by side).');
  const rows = [];
  for (const id of ids) { const rec = await loadPlan(id); rows.push({ label: id, rec, plan: rec.plan });
    if (a.include_alternatives && ids.length === 1) for (const [i, x] of (rec.alts || []).entries()) rows.push({ label: id + ' layout ' + (i + 2), rec, plan: altPlan(rec, x), alt: x }); }
  if (rows.length < 2) throw new UserError('Only one plan to compare: give another plan_id, or include_alternatives: true for a plan whose run has other layouts.');
  const out = rows.map(r => { const n = numbersOf(r.plan), au = auditOf(r.plan, r.rec), q = PF.quick(r.plan); let ic = null; try { ic = independentCheck(r.plan); } catch (e) { ic = null; }
    return { ...r, n, au, q, ic, name: r.alt ? r.alt.name : r.rec.layout || 'Layout' }; });
  const best = (f, hi = true) => { const v = out.map(f).filter(Number.isFinite); return v.length ? (hi ? Math.max(...v) : Math.min(...v)) : null; }, mark = (v, b) => v === b && out.length > 1 ? ' ★' : '';
  const bu = best(o => o.n.units), bg = best(o => o.n.floorAreaSf), bp = best(o => o.q?.profit);
  const L = ['| Plan | Layout | Units | Floor area | Parking (have / need) | Coverage | Open space | Quality | Independent check | Quick value / profit |', '|---|---|---|---|---|---|---|---|---|---|',
    ...out.map(o => '| ' + [o.label, o.name, o.n.units ? f0(o.n.units) + mark(o.n.units, bu) : '—', f0(o.n.floorAreaSf) + ' sf' + mark(o.n.floorAreaSf, bg), f0(o.n.parkingSpaces) + ' / ' + f0(o.n.parkingRequired), o.n.coveragePct + '%', o.n.openSpacePct + '%',
      String(o.au.verdict).toUpperCase(), o.ic ? o.ic.status + (o.ic.failed.length ? ' (' + o.ic.failed.join(', ') + ')' : '') : '—', o.q ? money(o.q.value) + ' / ' + money(o.q.profit) + mark(o.q.profit, bp) : '—'].join(' | ') + ' |'),
    '', '## Against ' + out[0].label, ...out.slice(1).map(o => '- ' + o.label + ': ' + (deltas(out[0].n, o.n).join('; ') || 'the same numbers')),
    '', '★ the most of each. Quick value: the app’s default market assumptions, to rank layouts, not an underwriting (plan_numbers has the pro forma).',
    'To make a run’s other layout the plan: plan_pick. To go on with one: its plan_id in plan_edit, plan_export, plan_set.'];
  return { content: [{ type: 'text', text: doc('Plans compared', L) }, { type: 'resource', resource: { uri: 'plan://compare/' + ids.join('-') + '.json', mimeType: 'application/json', text: JSON.stringify(out.map(o => ({ plan: o.label, layout: o.name, numbers: o.n, quality: o.au.verdict, independent: o.ic?.status ?? null, quick: o.q }))) } }] };
}

// ---------- the run's other layouts ----------
const altPlan = (rec, x) => ({ ...rec.plan, setbacks: x.setbacks || rec.plan.setbacks, program: x.program || rec.plan.program, params: x.params || rec.plan.params, zones: x.zones || [], elements: x.elements || [], ...(x.recipe ? { recipe: x.recipe } : {}), variant: { key: x.key, name: x.name } });
export async function planPickTool(a = {}) {
  const rec = await loadPlan(a.plan_id), alts = rec.alts || [];
  if (!alts.length) throw new UserError('Plan ' + rec.id + ' has no other layouts kept with it (plans from site_plan keep their run’s other layouts; an edited or project plan doesn’t). Lay out again with site_plan for more.');
  const w = String(a.layout ?? '').trim(), k = /^\d+$/.test(w) ? +w - 2 : alts.findIndex(x => x.name.toLowerCase() === w.toLowerCase() || x.name.toLowerCase().includes(w.toLowerCase()) && w.length > 2);
  if (!(k >= 0 && k < alts.length)) throw new UserError('layout is 2 to ' + (alts.length + 1) + ' (1 is the plan itself) or a layout name: ' + alts.map((x, i) => (i + 2) + ' ' + x.name).join(', ') + '.');
  const x = alts[k], plan = { ...altPlan(rec, x), name: rec.plan.name || 'A' }, au = auditOf(plan, rec);
  const me = altOf({ ...rec.plan, name: rec.layout || 'Layout 1', key: rec.plan.variant?.key, audit: { verdict: rec.verdict } });
  const out = await savePlan({ ...rec, plan, layout: x.name, verdict: au.verdict, fails: au.fails, alts: [me, ...alts.filter((_, i) => i !== k)] }, rec, { what: 'picked ' + x.name + ' instead of ' + (rec.layout || 'the first layout') });
  const n = numbersOf(plan);
  return { content: [{ type: 'text', text: doc('Picked ' + x.name, [...headLines(out), 'Plan id: ' + out.id + ' (the earlier plan ' + rec.id + ' is kept).', 'Numbers: ' + numLine(n), mixLine(n), 'Quality check: ' + String(au.verdict).toUpperCase() + ' (' + au.fails + ' failed, ' + au.warns + ' to note)', '', NEXT]) }] };
}

// ---------- editing ----------
// a piece named in typed edits or words: its id, or its label ("Clubhouse", "Apt Bldg 3"), whole words first
function pieceNamed(plan, w) {
  const t = String(w || '').trim().toLowerCase().replace(/^the\s+/, ''); if (!t) return null;
  const els = plan.elements || [], byId = els.find(e => e.id === w); if (byId) return byId;
  const named = els.filter(e => e.kind !== 'parking' && e.kind !== 'lot').map(e => [e, ED.labelOf(e).toLowerCase()]);
  return (named.find(([, l]) => l === t) || named.find(([, l]) => l.replace(/\bbuilding\b/, 'bldg') === t.replace(/\bbuilding\b/, 'bldg')) || named.find(([e, l]) => t.length > 2 && (l.startsWith(t) || (e.kind === t || e.use === t))))?.[0] || null;
}
const mainEntrance = plan => { const es = SP.entrancesOf(plan.elements); return es.find(e => e.entry === 'main' || /main/i.test(e.name || '')) || es[0] || null; };
const ENTRY = /\b(?:main\s+)?(?:entry|entrance|entry\s?way|front\s+gate|gate)\b/;
// a place named in an edit: an entrance (beside it), another piece (beside it), else a spot in words (lib/siteedit.mjs placeAt)
function placeOf(plan, to) {
  const w = String(to || '').toLowerCase().trim(); if (!w) return {};
  if (ENTRY.test(w)) { const e = mainEntrance(plan); return e ? { with: e.id, said: 'beside ' + ED.labelOf(e) } : { error: 'The plan has no entrance to go beside.' }; }
  const near = /^(?:beside|next to|near|by|alongside)\s+(.+)$/.exec(w)?.[1]; if (near) { const e = pieceNamed(plan, near); return e ? { with: e.id, said: 'beside ' + ED.labelOf(e) } : { error: 'Couldn’t find ' + near + ' on the plan.' }; }
  const at = ED.placeAt(plan, w); if (at) return { x: at[0], y: at[1], said: 'to the ' + w.replace(/^(?:to\s+)?(?:the\s+)?/, '') };
  const e = pieceNamed(plan, w); if (e) return { with: e.id, said: 'beside ' + ED.labelOf(e) };
  return { error: 'Couldn’t place “' + to + '”: say front, back, middle, left, right, “the middle of the apartments”, the entrance, or “beside <a piece>”, or give x and y.' };
}
const ACTIONS = ['move', 'remove', 'change', 'add', 'swap', 'turn', 'lock', 'unlock'];
// a typed edit into the app's op (lib/siteedit.mjs applyEdits), or a lock; { error } when it can't be read
export function opFrom(plan, e = {}) {
  const action = String(e.action || '').toLowerCase(); if (!ACTIONS.includes(action)) return { error: 'action is one of ' + ACTIONS.join(', ') + '.' };
  const t = e.target ? pieceNamed(plan, e.target) : null;
  if (action !== 'add' && !e.every && !t) return { error: 'Couldn’t find “' + (e.target || '') + '” on the plan (plan_get lists every piece by id and name).' };
  if (action === 'lock' || action === 'unlock') return { lock: action === 'lock', id: t.id, name: ED.labelOf(t) };
  const op = { action: action === 'turn' ? 'move' : action, target: t?.id || null };
  for (const k of ['every', 'floorsOver', 'type', 'kind', 'use', 'name', 'floors', 'units', 'gfa', 'w', 'd', 'turn', 'turnBy', 'boulevard', 'signs']) if (e[k] != null) op[k] = e[k];
  if (action === 'turn') { if (op.turnBy == null && op.turn == null) return { error: 'turn needs turnBy (degrees) or turn (an angle).' }; const c = SP.centroid(SP.shapeOf(t)), f = ED.sheetFrame(plan), p = f.to(c); op.x = p[0]; op.y = p[1]; }
  if (e.x != null && e.y != null) { op.x = +e.x; op.y = +e.y; }
  else if (e.to || e.beside) { const p = placeOf(plan, e.beside ? 'beside ' + e.beside : e.to); if (p.error) return p; if (p.with) op.with = p.with; else { op.x = p.x; op.y = p.y; } }
  if (action === 'swap') { const w = pieceNamed(plan, e.with); if (!w) return { error: 'swap needs with: the other piece.' }; op.with = w.id; }
  if (action === 'move' && op.x == null && !op.with) return { error: 'move needs to (a place), beside (a piece) or x and y.' };
  if (action === 'add' && (e.btype || e.building_type)) { // a building of a type (building_types), sized to the keys, units or floors asked
    let P = presetFor(e.btype || e.building_type); if (!P) return { error: 'No building type “' + (e.btype || e.building_type) + '”: building_types lists them.' };
    if (+e.keys > 0 && P.use === 'hotel' && !BT.presetBuilding(P.id)?.keys) P = presetFor('hotel-limited'); /* (keys asked of the plain hotel: the limited-service hotel counts them) */
    const b = typedBuilding(P.id, { keys: e.keys, units: e.units, floors: e.floors }); if (!b) return { error: 'The building type ' + P.id + ' has no usual size to add it at.' };
    Object.assign(op, { kind: 'building', use: b.use, floors: b.floors, w: +e.w || b.w, d: +e.d || b.d, name: e.name || b.name, ...(b.units ? { units: b.units } : {}), bt: Object.fromEntries(BT_EXTRA.filter(k => b[k] != null).map(k => [k, b[k]])) }); delete op.type;
  }
  if (action === 'add' && !op.kind && !op.type && !op.use) return { error: 'add needs kind (building, pool, play, court, green, plaza, entrance, roundabout, loop), btype (a building type), type (a library type) or use.' };
  return { op };
}
// "lock the clubhouse and the pool", "unlock Apt Bldg 3": the locks, and the rest of the words
function locksFromWords(words, plan) {
  const locks = [], rest = String(words).replace(/\b(un)?(?:lock|pin|freeze|keep)\s+(?:the\s+)?([^,.;]+?)(?:\s+(?:in place|where (?:it|they) (?:is|are)|as (?:it|they) (?:is|are)))?(?=\s*(?:,|\.|;|\band\s+(?:then\s+)?(?:move|put|make|turn|remove|add|swap|change)\b|$))/gi, (m, un, what) => {
    const names = what.split(/\s*(?:,|\band\b)\s*/).filter(Boolean).map(x => pieceNamed(plan, x)); if (!names.length || names.some(x => !x)) return m;
    for (const t of names) locks.push({ lock: !un, id: t.id, name: ED.labelOf(t) }); return ''; }).replace(/^[\s,.;]*(?:and\s+(?:then\s+)?)?/i, '').trim();
  return { locks, rest };
}
// with no AI and nothing read from the words, "move the clubhouse to the entry" (a place the plain reading doesn't know)
function entryMove(words, plan) {
  const m = /\b(?:move|put|bring|shift|relocate)\s+(?:the\s+)?(.+?)\s+(?:to|next to|beside|by|near|at)\s+(?:the\s+)?((?:main\s+)?(?:entry|entrance|gate)\w*)/i.exec(words); if (!m) return [];
  const t = pieceNamed(plan, m[1]), e = mainEntrance(plan); return t && e ? [{ action: 'move', target: t.id, with: e.id }] : [];
}
// a re-fit of the rest of the site round what changed (src/siteplan.js laid('refit'), with the jurisdiction's inputs)
function refitPlan(plan) {
  if (plan.recipe?.parcels) return { why: 'a plan laid out parcel by parcel is re-fitted in the app' };
  try { const g = G.forLayout(plan, plan.program, {}), r = g ? G.unapply(refit(g.plan, { amount: 'current', keep: true }), plan) : refit(plan, { amount: 'current', keep: true });
    return r?.elements?.length ? r : { why: r?.why || 'nothing could be laid round the change' }; } catch (e) { return { why: e.message }; }
}
const sameGeo = (a, b) => ['x', 'y', 'w', 'd', 'rot', 'floors', 'units', 'use', 'type'].every(k => (a[k] ?? null) === (b[k] ?? null)) && JSON.stringify(a.poly || null) === JSON.stringify(b.poly || null) && JSON.stringify(a.path || null) === JSON.stringify(b.path || null);
// locked pieces put back exactly as they were (an edit across the site, a re-fit): the lock always holds
function holdLocks(els, locked) {
  let put = 0; const out = els.slice();
  for (const L of locked) { const i = out.findIndex(e => e.id === L.id); if (i < 0) { out.push(structuredClone(L)); put++; } else if (!sameGeo(out[i], L)) { out[i] = structuredClone(L); put++; } }
  return { elements: out, put };
}

export async function planEditTool(a = {}) {
  const rec = await loadPlan(a.plan_id), plan00 = rec.plan, words = clip(String(a.words || '').trim(), 1200), typed = (Array.isArray(a.edits) ? a.edits : []).slice(0, 30);
  const W0 = words ? settingsFromWords(words) : { set: {}, rest: '' }, T0 = typeAddsFromWords(W0.rest), given = a.settings && typeof a.settings === 'object' ? a.settings : {};
  const setAll = { ...W0.set, ...given, ...(given.setbacks || W0.set.setbacks ? { setbacks: { ...(W0.set.setbacks || {}), ...(given.setbacks || {}) } } : {}) };
  if (!words && !typed.length && !Object.keys(setAll).length) throw new UserError('Say what to change in words (e.g. "move the clubhouse to the entry", "make Apt Bldg 3 four stories", "lock the pool", "set parking angle 60") or give edits or settings.');
  const done = [], skipped = [], locks = []; let ops = [], mix = null, names = null, full = a.refit === true, note = '', by = 'edits';
  // locks first, on the plan as it is (typed and in words): the pieces locked here are held from this edit on
  const isLock = e => /^(?:un)?lock$/i.test(String(e?.action || ''));
  for (const e of typed.filter(isLock)) { const r = opFrom(plan00, e); if (r.error) skipped.push('Edit ' + JSON.stringify(e) + ': ' + r.error); else locks.push(r); }
  const lw = T0.rest ? locksFromWords(T0.rest, plan00) : { locks: [], rest: '' }; locks.push(...lw.locks);
  const els00 = (plan00.elements || []).map(e => structuredClone(e));
  for (const L of locks) { const e = els00.find(x => x.id === L.id); if (!e) continue; if (L.lock) { e.locked = true; e.pinned = true; done.push('Locked ' + L.name + ': edits and re-fits leave it as it is.'); } else { delete e.locked; done.push('Unlocked ' + L.name + '.'); } }
  let plan0 = { ...plan00, elements: els00 }, relaid = null;
  // settings (setbacks, parking ratio and angle, entrances, the jurisdiction's guardrails): the site laid out again with them
  if (Object.keys(setAll).length) { const S0 = withSettings(plan0, setAll); skipped.push(...S0.bad);
    if (S0.did.length) { const R = relayPlan(rec, S0.plan); if (R.plan) { plan0 = R.plan; relaid = R; done.push('Settings: ' + S0.did.join(', ') + '. The site was laid out again with them (' + R.layout + '; ' + (R.alts.length ? R.alts.length + ' other layout' + (R.alts.length > 1 ? 's' : '') + ' kept for plan_pick' : 'no other layout') + ').'); }
      else skipped.push('Settings (' + S0.did.join(', ') + ') weren’t applied: ' + R.why + '.'); }
    if (relaid && +S0.plan.program?.parkAngle > 0) skipped.push(...angleNote(plan0, relaid.notes)); }
  // then the edits, on the plan as it now stands
  for (const e of [...typed.filter(e => !isLock(e)), ...T0.adds]) { const r = opFrom(plan0, e); if (r.error) skipped.push('Edit ' + JSON.stringify(e) + ': ' + r.error); else if (r.op) ops.push(r.op); }
  const rest = lw.rest, place = rest && /\S/.test(rest);
  if (place) {
    let aiWhy = '';
    if (a.use_ai !== false) {
      const r = await within(ai({ mode: 'edit', prompt: rest, site: siteInfo(plan0, rec.address || rec.label || '', '', (rec.county || '').replace(/ County.*$/, '')), plan: ED.describePlan(plan0) }), 120000);
      if (r?.status === 200 && r.body && !r.body.error) { const d = r.body; ops.push(...(d.ops || [])); mix = d.homeMix?.length ? d.homeMix : null; names = d.names?.community || d.names?.parts?.length ? d.names : null; full = full || d.refit === 'full'; note = d.summary || ''; by = 'AI' + (r.model ? ' (' + r.model + ')' : '');
        if (!ops.length && !mix && !names && d.question) skipped.push('The AI asks: ' + d.question); }
      else aiWhy = !r ? 'The AI took too long' : r.status === 503 ? 'AI isn’t set up on this deployment' : 'The AI didn’t answer';
    } else aiWhy = 'use_ai is off';
    if (!by.startsWith('AI')) {
      names = ED.guessNames(rest, plan0); const said = names ? names.rest : rest;
      let got = said ? ED.guessEdits(said, plan0) : []; if (!got.length && said) got = entryMove(said, plan0);
      ops.push(...got); mix = said ? ED.guessMix(said, plan0) : null; full = full || /\bre-?(?:fit|lay)/i.test(rest); by = 'words read directly';
      note = aiWhy + ', so the words were read directly.';
    }
  }
  const lockedNow = plan0.elements.filter(e => e.locked), isLocked = id => lockedNow.some(e => e.id === id);
  ops = ops.filter(o => { const hit = [o.target, o.action === 'swap' ? o.with : null].filter(Boolean).find(isLocked); if (hit) { skipped.push(ED.labelOf(plan0.elements.find(e => e.id === hit)) + ' is locked, so “' + o.action + '” wasn’t done to it: unlock it first.'); return false; } return true; });
  if (!ops.length && !mix && !names && !locks.length && !relaid) {
    const msg = ['Nothing on the plan was changed.' + (note ? ' ' + note : ''), ...skipped, 'Name pieces as plan_get lists them (“Clubhouse”, “Apt Bldg 3”), or give typed edits, e.g. { "action": "move", "target": "Clubhouse", "to": "entrance" }, or settings, e.g. { "parking_angle": 60 }.'];
    return { content: [{ type: 'text', text: msg.join('\n') }], isError: true };
  }
  const before = numbersOf(plan00), ids0 = new Set(plan0.elements.map(e => e.id));
  let plan = plan0, r = { done: [], skipped: [], touched: [] };
  if (ops.length) { r = ED.applyEdits(plan, ops.map(({ bt, ...o }) => o), { refit: full && !!plan.recipe }); plan = { ...plan, elements: r.elements, ...(r.zones ? { zones: r.zones } : {}), ...(r.streets && r.streets !== (plan0.streets || []) ? { streets: r.streets } : {}), ...(r.recipe ? { recipe: r.recipe } : {}) };
    // a building added by type carries its type (lib/btypes.mjs: its preset, colour key, floor height and count)
    const fresh = plan.elements.filter(e => !ids0.has(e.id) && e.kind === 'building'); for (const o of ops.filter(x => x.bt)) { const e = fresh.find(x => !x.btype && x.name === o.name); if (e) Object.assign(e, structuredClone(o.bt)); } }
  done.push(...r.done.map(t => t.replace(/…$/, '.'))); skipped.push(...r.skipped);
  if (r.pods?.length || r.blocks?.length) skipped.push('Re-laying a pod or a block of streets is done in the app for now; those parts stay as they were.');
  const hm = mix && plan.recipe ? ED.withHomeMix(plan, mix) : null; if (mix && !hm) skipped.push('This plan’s homes can’t be laid out again with a new mix (it has no layout recipe): lay it out again with site_plan.');
  if (hm) { plan = { ...plan, program: hm.program, recipe: hm.recipe }; full = true; }
  if (names) { const nm = ED.applyNames(plan, names); plan = { ...plan, program: nm.program }; done.push(...nm.done); skipped.push(...nm.skipped); }
  if (full && ops.length + (hm ? 1 : 0) > 0) {
    if (!plan.recipe) skipped.push('The rest of the site wasn’t re-fitted: this plan has no layout recipe to re-fit with.');
    else { const rf = refitPlan(plan); if (rf.elements) { const at = els => ({ m: G.metrics({ ...plan, elements: els }), issues: G.check({ ...plan, elements: els }) }), v = refitVerdict(at(plan.elements), at(rf.elements));
      if (hm || v.ok) { plan = { ...plan, elements: rf.elements, ...(rf.recipe ? { recipe: rf.recipe } : {}), ...(rf.zones ? { zones: rf.zones } : {}) }; done.push('Re-fitted the rest of the site round the change.'); }
      else skipped.push('Re-fitting the rest of the site would have ' + (v.why === 'problems' ? 'added problems' : v.why === 'units' ? 'lost homes or units' : 'lost floor area') + ', so only those pieces changed. For a fresh layout round it, lay the site out again with site_plan.'); }
    else skipped.push('The rest couldn’t be re-fitted round it (' + rf.why + '), so only those pieces changed.'); }
  }
  const held = holdLocks(plan.elements, lockedNow); if (held.put) { plan = { ...plan, elements: held.elements }; skipped.push(held.put + ' locked piece' + (held.put === 1 ? ' was' : 's were') + ' put back as ' + (held.put === 1 ? 'it was' : 'they were') + ' (locks hold through edits and re-fits).'); }
  const au = auditOf(plan, rec), after = numbersOf(plan), what = (words || JSON.stringify(a.edits || a.settings)).slice(0, 300);
  const out = await savePlan({ ...rec, plan, layout: relaid ? relaid.layout : rec.layout, verdict: au.verdict, fails: au.fails, alts: relaid ? relaid.alts : [], ...(relaid ? { notes: relaid.notes } : {}) }, rec, { what, by, ops: ops.slice(0, 30).map(({ bt, ...o }) => o), locks: locks.map(l => ({ id: l.id, lock: l.lock })), ...(relaid ? { settings: setAll } : {}) });
  const dl = deltas(before, after), A = askedOf(out, plan);
  const L = [...headLines(out), 'Plan id: ' + out.id + ' (the plan before, ' + rec.id + ', is kept: compare them with plan_compare).', 'Read by: ' + by + (note && by.startsWith('AI') ? ' — ' + clip(note, 300) : note ? ' — ' + note : ''),
    '', '## Done', ...(done.length ? done.map(t => '- ' + t) : ['- Nothing changed on the drawing.']), ...(skipped.length ? ['', '## Not done', ...skipped.map(t => '- ' + t)] : []),
    '', 'Numbers: ' + numLine(after), mixLine(after), 'Changed: ' + (dl.join('; ') || 'no change in the numbers'),
    ...(A.asked.length ? A.asked.map(c => c.said) : []),
    'Quality check: ' + String(au.verdict).toUpperCase() + ' (' + au.fails + ' failed, ' + au.warns + ' to note)' + (rec.verdict && rec.verdict !== au.verdict ? ' — was ' + String(rec.verdict).toUpperCase() : ''), ...auditLines(au, 6).filter(l => !l.startsWith('✓')),
    '', NEXT];
  return { content: [{ type: 'text', text: doc('Plan edited', L.filter(x => x != null)) }, ...(a.include_record ? [recordRes(out)] : [])] };
}

// ---------- exports ----------
export async function planExportTool(a = {}, ctx = {}) {
  const rec = await loadPlan(a.plan_id), plan = rec.plan, want = (Array.isArray(a.formats) && a.formats.length ? a.formats : ['pdf']).map(String);
  const bad = want.filter(f => !EXPORTS.includes(f)); if (bad.length) throw new UserError('formats are ' + EXPORTS.join(', ') + ' (not ' + bad.join(', ') + ').');
  const name = slug(rec.projectName || 'site plan') + '-' + rec.id, content = [], said = [], limit = ctx.pdfLimit || PDF_LIMIT;
  const res = (ext, mimeType, body) => content.push({ type: 'resource', resource: { uri: 'plan://' + rec.id + '/' + name + '.' + ext, mimeType, ...(Buffer.isBuffer(body) ? { blob: body.toString('base64') } : { text: body }) } });
  if (want.includes('pdf')) {
    const size = a.sheet === '24x36' ? 'archd' : 'tabloid', checks = (() => { try { return [...new Set([...G.check(plan).map(i => i.text), ...auditOf(plan, rec).items.filter(i => i.level !== 'pass' && i.area !== 'checks').map(i => i.text)])]; } catch (e) { return rec.checks || []; } })();
    const html = sheetHTML({ plan, planName: 'Option ' + (plan.name || 'A') + ' · ' + (rec.layout || 'Layout'), project: { name: a.project_name || rec.projectName || 'Site plan' }, size, parcels: rec.parcels || [], facts: rec.facts || [], notes: checks.concat(['REI plan id ' + rec.id + '.']), vicinity: rec.vicinity || '', renders: [],
      address: rec.address || rec.label || '', county: rec.county || '', date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), preparedFor: clip(a.prepared_for || rec.preparedFor || '', 80), boundarySource: rec.boundarySource || '' });
    try { const pdf = Buffer.from(await (hooks.render || chromium)(html, { sheet: size, title: (rec.projectName || 'Site plan') + ' — Site plan' }));
      if (pdf.length > limit) said.push('The sheet PDF came out at ' + (pdf.length / 1048576).toFixed(1) + ' MB, over what fits in one answer; try sheet 11x17 or ask for svg.');
      else { res('pdf', 'application/pdf', pdf); said.push('Site plan sheet PDF (' + pages(pdf) + ' page' + (pages(pdf) === 1 ? '' : 's') + ', ' + (size === 'archd' ? '24 × 36' : '11 × 17') + ', ' + Math.round(pdf.length / 1024) + ' KB).'); } }
    catch (e) { said.push('The sheet PDF couldn’t be made (' + clip(e.message, 160) + ').'); }
  }
  const svg = want.includes('svg') || want.includes('image') ? planSVG(G.effective(plan), { px: Math.min(3000, Math.max(400, +a.px || 1600)) }).svg : null;
  if (want.includes('svg')) { res('svg', 'image/svg+xml', svg); said.push('The plan drawing as SVG (street at the bottom).'); }
  if (want.includes('image')) { try { const [url] = await (hooks.snapshots || chromiumShots)([svg], { px: Math.min(3000, Math.max(400, +a.px || 1600)), quality: 80 }); const m = /^data:(image\/\w+);base64,(.+)$/.exec(url || ''); if (!m) throw new Error('no picture came back');
    content.push({ type: 'image', data: m[2], mimeType: m[1] }); said.push('The plan drawing as a picture (' + m[1] + ').'); } catch (e) { said.push('The picture couldn’t be made (' + clip(e.message, 120) + '); svg works without a browser.'); } }
  if (want.includes('dxf')) { res('dxf', 'application/dxf', SP.toDXF(G.effective(plan), rec.projectName || 'Site plan')); said.push('CAD file (DXF, AutoCAD R12, feet; layers for the lot, setbacks, buildings, parking, stripes, drives, detention, landscape).'); }
  if (want.includes('geojson')) { res('geojson', 'application/geo+json', JSON.stringify(layoutGeoJSON(plan))); said.push('Map file (GeoJSON, lon/lat: the site and every piece with its use and size).'); }
  if (want.includes('json')) { res('json', 'application/json', JSON.stringify(jsonOf(rec))); said.push('The plan record (JSON): the drawing in feet, its program, settings and history.'); }
  if (want.includes('bim')) {
    let sc = null; try { sc = bimScript(G.effective(plan), { name: rec.projectName || 'Site plan option' }); } catch (e) { said.push('The BIM model couldn’t be scripted (' + clip(e.message, 120) + ').'); }
    if (sc) { res('bimcraft.txt', 'text/plain', sc.text); said.push('BIM model script (BIMCraft commands, ' + sc.buildings.length + ' building' + (sc.buildings.length === 1 ? '' : 's') + ').');
      try { const run = hooks.bim || (process.env.BIMCRAFT_CLI ? (await import('../bimrun.mjs')).runModel : null);
        if (run) { const m = await run(G.effective(plan), { name: rec.projectName || 'Site plan option', png: false }); if (m?.ifc && m.ifc.length < limit) { res('ifc', 'application/x-step', Buffer.from(m.ifc)); said.push('BIM model (IFC, ' + Math.round(m.ifc.length / 1024) + ' KB).'); } else if (m?.ifc) said.push('The IFC model is over what fits in one answer.'); }
        else said.push('IFC: the BIM tool isn’t installed on this deployment (BIMCRAFT_CLI), so only the script is given; the BIM worker turns it into IFC.'); }
      catch (e) { said.push('The IFC model couldn’t be made (' + clip(e.message, 120) + ').'); } }
  }
  content.unshift({ type: 'text', text: doc('Export: plan ' + rec.id, [...headLines(rec), '', ...said.map(s => '- ' + s), '', 'Concept only: for feasibility, not for construction or permitting.']) });
  return { content };
}

// ---------- projects ----------
// a project's option as a plan (its parcels and site facts with it), so the plan tools and plan_set work on it
export async function planFromProjectTool(a = {}) {
  const { p } = await readProject(a.project_id), plans = (p.plans || []).filter(x => (x.ring || []).length >= 3);
  const w = String(a.option_id || '').trim(), pl = w ? plans.find(x => x.id === w || String(x.name || '').toLowerCase() === w.toLowerCase()) : plans.find(x => x.id === p.fz?.optionId) || plans[0];
  if (!pl) throw new UserError(w ? 'No option ' + w + ' with a drawn site in ' + p.name + ': get_project lists its options.' : p.name + ' has no option with a drawn site yet: site_plan with project_id lays one out.');
  if (!(pl.elements || []).length) throw new UserError('Option ' + (pl.name || pl.id) + ' of ' + p.name + ' has nothing laid out yet: site_plan with project_id lays one out.');
  const { id: oid, name, parcel, parcels, request, created, by, ...plan } = pl; void parcel; void parcels; void created; void by;
  const facts = p.site?.facts ? PJ.jurisdictionText({ ...p.site.facts, ...PJ.regridFacts(p.parcels, p.plans) }) : [], au = auditOf({ ...plan, name: name || 'A' }, { request: request || '' });
  const out = await savePlan({ plan: { ...plan, name: name || 'A' }, layout: 'Option ' + (name || oid), verdict: au.verdict, fails: au.fails, request: request || p.target_use || '', projectName: p.name, preparedFor: p.client || '',
    address: p.parcels?.[0]?.label || p.name, label: p.name, county: p.parcels?.find(x => x.county)?.county ? p.parcels.find(x => x.county).county.replace(/ county$/i, '') + ' County, Texas' : '', center: plan.origin || null,
    parcels: (p.parcels || []).map(x => ({ label: x.label, owner: x.owner, propId: x.propId, acres: x.acres })), boundarySource: 'the project’s parcels', facts, checks: [], vicinity: '', project: { id: p.id, option_id: oid }, alts: [] }, null, { what: 'from project ' + p.name + ' option ' + (name || oid) });
  const n = numbersOf(out.plan);
  return { content: [{ type: 'text', text: doc('Plan ' + out.id + ' from ' + p.name, [...headLines(out), 'Plan id: ' + out.id + ' (a copy: edits make new plans; save_plan_to_project puts one back as a new option).', 'Numbers: ' + numLine(n), mixLine(n), '', NEXT]) }] };
}
export async function savePlanToProjectTool(a = {}, ctx = {}) {
  if (!ctx.writes) throw new UserError('Saving to a project is off on this server for this connection (it needs MCP_ACCESS_TOKEN, or a sign-in that allowed project changes).');
  const rec = await loadPlan(a.plan_id), { origin, ring } = rec.plan; if (!origin || !ring?.length) throw new UserError('Plan ' + rec.id + ' has no site position to save.');
  const pid = a.project_id || rec.project?.id; if (!pid) throw new UserError('Give project_id: the project to save the plan to (list_projects).');
  const said = await addPlanOption(pid, { plan: rec.plan, request: rec.request || '', recs: null, by: a.by, makeStudy: a.make_study_option !== false });
  return doc('Saved plan ' + rec.id, [said, 'The website shows it on the project’s Sites tab; feasibility_study runs the study on it.', linkOf(pid)]);
}
