// Plan sets (PLANSET-PLAN.md): a schematic design set of drawings made from one site plan option, every sheet on the
// Finishes Solutions title block. This file has no DOM and no network, so the browser (src/siteplan.js, Projects › a
// project › Plans), the server (api/planset.js) and the tests share it:
//   - the sections a set can have, which ones are built so far, and the sheets each adds for a plan;
//   - the brief Claude reads and the schema its cover notes come back in;
//   - the whole set as one HTML document, one 36 x 24 in page a sheet, ready for api/planset.js to print and lay on
//     the border (templates/titleblock.pdf).
// The cover (G-001), general notes (G-002), the overall site plan (C-101) and the renderings (A-9xx) are drawn here;
// every other sheet by a module in lib/sheets/ (site and civil, architecture, engineering) through RENDERERS.
import * as S from './siteplan.mjs';
import { planSVG, sheetData, legendHTML, northArrow, scaleBar, streetDown, turned, SCALES } from './sitesheet.mjs';
import { FRAME, TB_CSS, titleBlockHTML } from './titleblock.mjs';
import { KIT_CSS, SYMBOLS, LINES, legendSym, legendLine } from './sheetkit.mjs';
import { buildingTypes, RESIDENTIAL, typeName } from './plandesign.mjs';
import { RENDERERS as SITE } from './sheets/site.mjs';
import { RENDERERS as ARCH } from './sheets/arch.mjs';
import { RENDERERS as ENG } from './sheets/eng.mjs';
import { RENDERERS as FUEL } from './sheets/fuel.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f0 = v => Math.round(v).toLocaleString('en-US');
const DPI = 96, PT = 72; // CSS px and pt per inch

// ---------- sections ----------
// phase: when it's built (PLANSET-PLAN.md, Order of work); on: ticked when the form opens; always: can't be unticked;
// needs: drawn on another section's work, so it goes when that one is unticked
export const BUILT_PHASE = 4;
export const SECTIONS = [
  { id: 'general', label: 'General', letter: 'G', phase: 1, on: true, always: true, note: 'Cover sheet: sheet index, project data, vicinity map, notes' },
  { id: 'civil', label: 'Site & civil', letter: 'C', phase: 1, on: true, note: 'Existing conditions, site plan, dimensions, grading, detention, utilities, erosion control, details' },
  { id: 'landscape', label: 'Landscape', letter: 'L', phase: 2, on: true, note: 'Planting plan and details' },
  { id: 'arch', label: 'Architecture', letter: 'A', phase: 3, on: true, note: 'Floor plans, roof plans, elevations, sections and schedules for each building type' },
  { id: 'structural', label: 'Structural', letter: 'S', phase: 4, on: true, needs: 'arch', note: 'Design criteria, foundation and framing plans, details' },
  { id: 'mechanical', label: 'Mechanical', letter: 'M', phase: 4, on: true, needs: 'arch', note: 'HVAC plans and equipment schedules' },
  { id: 'plumbing', label: 'Plumbing', letter: 'P', phase: 4, on: true, needs: 'arch', note: 'Plumbing plans, fixture schedule, riser diagrams' },
  { id: 'electrical', label: 'Electrical', letter: 'E', phase: 4, on: true, needs: 'arch', note: 'Site lighting, power and lighting plans, one-line, panels' },
  { id: 'fire', label: 'Fire protection & life safety', letter: 'FP', phase: 4, on: true, needs: 'arch', note: 'Fire access and hydrants, sprinklers, alarm, life safety' },
  { id: 'fuel', label: 'Fuel canopy & fuel system', letter: 'F', phase: 4, on: true, note: 'Tanks, product piping and vents, hazardous areas, the canopy’s plans, elevations, structure, lighting and details (with a gas station)' },
  { id: 'renderings', label: 'Renderings', letter: 'A-9', phase: 1, on: true, note: 'The option’s AI renderings, one a sheet' },
  { id: 'telecom', label: 'Telecom / fiber', letter: 'T', phase: 4, on: false, note: 'Only when asked for' }
];
export const sectionById = id => SECTIONS.find(s => s.id === id);
export const built = s => s.phase <= BUILT_PHASE;
// the sections a request may have: known, built, General always, and none whose base section is left out
export function pickSections(ids) {
  const want = new Set((Array.isArray(ids) ? ids : []).filter(id => sectionById(id) && built(sectionById(id))));
  want.add('general');
  for (const s of SECTIONS) if (s.needs && !want.has(s.needs)) want.delete(s.id);
  return SECTIONS.filter(s => want.has(s.id)).map(s => s.id);
}
export const defaultSections = () => SECTIONS.filter(s => s.on && built(s)).map(s => s.id);

// ---------- the sheets ----------
// plan: the option; o: { sections (ids), renders (how many renderings the set can show), renderLabels: [], types (from
// lib/plandesign.mjs buildingTypes; worked out when not given) }
// -> [{ number, title, sub, section, kind, scale, typeId?, render? }] in set order (the cover's sheet index lists these).
// Building sheets are per type (A-101 is type A's plans, A-102 type B's…); a type the set can't design yet gets none.
export function sheetList(plan, o = {}) {
  const on = new Set(pickSections(o.sections ?? defaultSections())), out = [], n = Math.max(0, Math.min(4, o.renders | 0)), site = (plan?.ring || []).length >= 3;
  const types = (o.types || (site ? buildingTypes(plan) : [])).filter(t => t.supported), add = (number, title, sub, section, kind, x = {}) => out.push({ number, title, sub, section, kind, scale: '', ...x });
  const each = (prefix, base, title, kind, section, pick = () => true, sub = t => typeName(t)) => types.filter(pick).forEach((t, i) => add(prefix + '-' + (base + i + 1), title + ' — Type ' + t.id, sub(t), section, kind, { typeId: t.id }));
  const nonRes = t => !RESIDENTIAL.includes(t.use), acres = site ? S.metrics(plan).acres : 0, lots = (plan?.elements || []).some(e => e.kind === 'lot');
  add('G-001', 'Cover sheet', 'Sheet index · Project data · Notes', 'general', 'cover', { scale: 'As noted' });
  add('G-002', 'General notes', 'Codes · Symbols · Abbreviations', 'general', 'g-notes', { scale: 'N.T.S.' });
  if (types.some(nonRes)) add('G-003', 'Code analysis', 'Occupancy · Construction · Occupant load · Egress', 'general', 'g-code', { scale: 'N.T.S.' });
  if (site && on.has('civil')) {
    add('C-001', 'Existing conditions', 'Boundary · Easements · Flood zone', 'civil', 'c-existing');
    add('C-101', 'Overall site plan', 'Land use · Circulation · Program · Parking', 'civil', 'siteplan');
    add('C-102', 'Dimension & paving plan', 'Setbacks · Drives · Parking · Fire lanes', 'civil', 'c-dims');
    if (lots) add('C-103', 'Typical lot plot plans', 'Lots · Setbacks · Driveways', 'civil', 'c-lots');
    add('C-201', 'Grading & drainage plan', 'Schematic grading · Storm sewer · Inlets', 'civil', 'c-grading');
    add('C-202', 'Detention summary', 'Storage required and provided', 'civil', 'c-detention', { scale: 'N.T.S.' });
    add('C-301', 'Utility plan', 'Water · Sanitary sewer · Storm · Services', 'civil', 'c-utility');
    if (acres >= 1) add('C-401', 'Erosion & sediment control plan', 'SWPPP layout', 'civil', 'c-erosion');
    add('C-501', 'Civil details', 'Paving · Curb · Ramp · Enclosure · Erosion control', 'civil', 'c-details', { scale: 'N.T.S.' });
  }
  if (site && on.has('landscape')) { add('L-101', 'Landscape plan', 'Trees · Shrubs · Sod · Plant schedule', 'landscape', 'l-plan'); add('L-501', 'Landscape details', 'Planting details', 'landscape', 'l-details', { scale: 'N.T.S.' }); }
  if (on.has('arch') && types.length) {
    each('A', 100, 'Floor & roof plans', 'a-plans', 'arch'); each('A', 200, 'Exterior elevations', 'a-elev', 'arch'); each('A', 300, 'Building sections', 'a-section', 'arch');
    add('A-501', 'Wall sections & typical details', 'By construction type', 'arch', 'a-details', { scale: 'As noted' }); each('A', 600, 'Door, window & finish schedules', 'a-sched', 'arch');
  }
  if (on.has('structural') && types.length) { add('S-001', 'Structural general notes', 'Design criteria', 'structural', 's-notes', { scale: 'N.T.S.' }); each('S', 100, 'Foundation plan', 's-found', 'structural'); each('S', 200, 'Framing plans', 's-frame', 'structural'); add('S-501', 'Structural details', 'Typical details', 'structural', 's-details', { scale: 'As noted' }); }
  if (on.has('mechanical') && types.length) { add('M-001', 'Mechanical notes & schedules', 'Legend · Equipment', 'mechanical', 'm-notes', { scale: 'N.T.S.' }); each('M', 100, 'HVAC plans', 'm-hvac', 'mechanical'); }
  if (on.has('plumbing') && types.length) { add('P-001', 'Plumbing notes & schedules', 'Legend · Fixtures', 'plumbing', 'p-notes', { scale: 'N.T.S.' }); each('P', 100, 'Plumbing plans', 'p-plan', 'plumbing'); add('P-601', 'Plumbing riser diagrams', 'Water · Waste and vent', 'plumbing', 'p-riser', { scale: 'N.T.S.' }); }
  if (on.has('electrical') && types.length) { add('E-001', 'Electrical notes & schedules', 'Legend · Panels · Loads', 'electrical', 'e-notes', { scale: 'N.T.S.' }); if (site) add('E-101', 'Site lighting plan', 'Poles · Wall packs', 'electrical', 'e-site'); each('E', 200, 'Power & lighting plans', 'e-plan', 'electrical'); add('E-601', 'Electrical one-line diagram', 'Service · Panels', 'electrical', 'e-oneline', { scale: 'N.T.S.' }); }
  if (on.has('fire') && types.length) {
    if (site) add('FP-101', 'Fire access & hydrant plan', 'Fire lanes · Hydrants · Hose reach', 'fire', 'fp-access');
    each('FP', 200, 'Fire sprinkler plan', 'fp-sprinkler', 'fire', t => t.sprinklered); each('FA', 200, 'Fire alarm plan', 'fa-plan', 'fire', t => nonRes(t) && (t.sprinklered || /^A/.test(t.occupancy)));
    each('LS', 100, 'Life safety plan', 'ls-plan', 'fire', nonRes);
  }
  if (site && on.has('fuel') && (plan.elements || []).some(e => e.kind === 'canopy')) { // a gas station: the canopy, the pumps and the tanks (lib/sheets/fuel.mjs)
    add('F-001', 'Fuel system notes & schedules', 'Tanks · Dispensers · Equipment · Separation checks', 'fuel', 'f-notes', { scale: 'N.T.S.' });
    add('F-101', 'Fuel system plan', 'Tanks · Product piping · Vents · Emergency shutoff', 'fuel', 'f-plan');
    add('F-102', 'Hazardous areas & canopy electrical', 'NEC 514 classified areas · Dispenser and pump power · Canopy lights', 'fuel', 'f-elec');
    add('F-201', 'Canopy plan & reflected ceiling plan', 'Pump islands · Columns · Lights', 'fuel', 'f-canopy');
    add('F-301', 'Canopy elevations & section', 'Front · Side · Section at a column', 'fuel', 'f-elev', { scale: 'As noted' });
    add('F-401', 'Canopy foundation & framing plans', 'Footings · Girders · Purlins', 'fuel', 'f-struct');
    add('F-501', 'Fuel system & canopy details', 'Tank · Island · Trench · Fill · Vent · Column base', 'fuel', 'f-details', { scale: 'N.T.S.' });
  }
  if (on.has('telecom')) { add('T-001', 'Telecom notes & legend', 'Fiber · Structured cabling', 'telecom', 't-notes', { scale: 'N.T.S.' }); if (site) add('T-101', 'Site fiber backbone plan', 'Conduit · Handholes · MPOE', 'telecom', 't-site'); each('T', 200, 'Structured cabling plans', 't-bldg', 'telecom'); }
  if (on.has('renderings')) for (let i = 0; i < n; i++) add('A-9' + String(i + 1).padStart(2, '0'), 'Conceptual rendering', o.renderLabels?.[i] || 'AI concept illustration', 'renderings', 'render', { scale: 'N.T.S.', render: i });
  return out;
}
// what each section would add to this plan's set right now (the form shows it beside the box)
export function sectionCounts(plan, renders = 0, types) {
  const all = sheetList(plan, { sections: SECTIONS.map(s => s.id), renders, types });
  return Object.fromEntries(SECTIONS.map(s => [s.id, all.filter(x => x.section === s.id).length]));
}

// the scale C-101 is drawn at: the largest standard scale whose drawing fits the space (inches)
export function fitScale(plan, wIn, hIn) {
  const t = turned(plan, streetDown(plan)), xs = t.ring.map(p => p[0]), ys = t.ring.map(p => p[1]), wf = Math.max(...xs) - Math.min(...xs) + 120, hf = Math.max(...ys) - Math.min(...ys) + 120;
  return SCALES.find(s => wf / s <= wIn && hf / s <= hIn) || Math.ceil(Math.max(wf / wIn, hf / hIn) / 100) * 100;
}
const scaleText = s => '1" = ' + s + "'-0\"";

// ---------- what Claude writes ----------
// The cover's words: what the project is, general notes, the codes this kind of work is usually checked against, and
// the next steps. Numbers are never Claude's: the project data table comes from the plan.
export const NOTES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['description', 'general_notes', 'codes', 'next_steps'],
  properties: {
    description: { type: 'string', description: 'Two or three plain sentences: what is proposed, where, and on how much land.' },
    general_notes: { type: 'array', items: { type: 'string' }, description: 'Six to ten numbered general notes for a schematic design set, one sentence or two each.' },
    codes: { type: 'array', items: { type: 'string' }, description: 'The codes and standards a design would likely be checked against here (basis of design), most important first.' },
    next_steps: { type: 'array', items: { type: 'string' }, description: 'Four to eight studies, consultants or approvals needed before design development.' }
  }
};
export const NOTES_SYSTEM = 'You write the notes on the cover sheet of a schematic design drawing set made by Finishes Solutions, a development consultant in Waller, Texas, from a conceptual site plan. ' +
  'The set is for feasibility, pricing and coordination; it is reviewed by Finishes Solutions but not sealed, and every sheet already says it is not for construction, bidding or permit. ' +
  'Write like an experienced architect writing general notes: short, specific, factual, no marketing. Use only the facts in the brief. Never invent numbers, names, consultants, utility providers, zoning or approvals: where something is unknown, say it must be confirmed. ' +
  'Texas sites outside city limits are usually not zoned; county, drainage district and fire marshal rules still apply. Name codes by their edition only when the brief or common Texas practice makes it clear, otherwise say "edition adopted by the authority having jurisdiction". ' +
  'Answer in the JSON schema given.';
// the brief: the plan's numbers and the site facts, as short lines
export function notesBrief(d) {
  const { m, land, program, parking } = sheetData(d.plan), prog = S.normalizeProgram(d.plan.program);
  const lines = ['Project: ' + (d.project?.name || 'Untitled'), d.client ? 'Client: ' + d.client : '', d.address ? 'Address: ' + d.address : '', d.county ? 'County: ' + d.county : '',
    'Option: ' + (d.plan.name || 'Option'), 'Main use: ' + S.USES[prog.use].label, 'Site: ' + m.acres.toFixed(2) + ' acres' + ((d.parcels || []).length > 1 ? ', ' + d.parcels.length + ' parcels' : ''),
    'Land use: ' + land.map(r => r.join(' ')).join('; '), 'Program: ' + program.map(r => r.filter(Boolean).join(' ')).join('; '), 'Parking: ' + parking.map(r => r.join(' ')).join('; '),
    ...(d.facts || []).map(f => 'Site fact: ' + f), ...(d.notes || []).map(f => 'Plan check: ' + f), 'Sheets in this set: ' + (d.sheets || []).map(s => s.number + ' ' + s.title).join(', ')];
  return lines.filter(Boolean).map(l => String(l).slice(0, 400)).join('\n').slice(0, 12000);
}
// Claude's answer, kept to the shape and sizes the cover has room for
export function cleanNotes(n) {
  const t = (v, k) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, k) : '', list = (a, max, k) => (Array.isArray(a) ? a : []).map(x => t(x, k)).filter(Boolean).slice(0, max);
  return { description: t(n?.description, 700), general_notes: list(n?.general_notes, 10, 320), codes: list(n?.codes, 10, 160), next_steps: list(n?.next_steps, 8, 220) };
}

// Each discipline's sheet notes and design criteria, one Claude call a discipline (api/planset.js mode 'disc'). The
// sheet modules use their own defaults when a discipline's notes are missing.
export const DISCIPLINES = { civil: 'civil / site', landscape: 'landscape', arch: 'architectural', structural: 'structural', mechanical: 'mechanical (HVAC)', plumbing: 'plumbing', electrical: 'electrical', fire: 'fire protection and life safety', fuel: 'motor fuel dispensing: underground storage tanks, product piping, dispensers and the fuel canopy (NFPA 30A, TCEQ 30 TAC 334)', telecom: 'telecommunications / fiber (FTTH)' };
export const DISC_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['notes', 'criteria'],
  properties: {
    notes: { type: 'array', items: { type: 'string' }, description: 'Eight to twelve numbered general notes for this discipline\'s sheets, one or two sentences each.' },
    criteria: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'value'], properties: { item: { type: 'string' }, value: { type: 'string' } } }, description: 'Six to twelve design criteria or basis-of-design rows (item and value).' }
  }
};
export const DISC_SYSTEM = NOTES_SYSTEM.replace('the notes on the cover sheet', 'the general notes and design criteria for one discipline\'s sheets');
export function discBrief(d, key, types = []) {
  return 'Discipline: ' + (DISCIPLINES[key] || key) + '\n' + notesBrief(d) + '\nBuilding types: ' + types.filter(t => t.supported).map(t => typeName(t) + ', ' + t.count + ' building' + (t.count > 1 ? 's' : '') + ', occupancy ' + t.occupancy + ', construction ' + t.construction + ', sprinklers ' + (t.sprinklered ? 'yes' : 'no')).join('; ');
}
export function cleanDisc(x) {
  const t = (v, k) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, k) : '';
  return { notes: (Array.isArray(x?.notes) ? x.notes : []).map(v => t(v, 360)).filter(Boolean).slice(0, 14), criteria: (Array.isArray(x?.criteria) ? x.criteria : []).map(r => ({ item: t(r?.item, 80), value: t(r?.value, 160) })).filter(r => r.item && r.value).slice(0, 16) };
}
// the discipline each section's notes come from (General uses the cover's)
export const SECTION_DISC = { civil: 'civil', landscape: 'landscape', arch: 'arch', structural: 'structural', mechanical: 'mechanical', plumbing: 'plumbing', electrical: 'electrical', fire: 'fire', fuel: 'fuel', telecom: 'telecom' };

// ---------- the set as HTML ----------
// d: { plan, project, client, address, county, parcels, facts, notes (plan checks), vicinity (HTML), renders: [{ src, caption }],
//      sheets (sheetList), text (cleanNotes, or null: the cover says the notes weren't written), date, drawnBy, checkedBy,
//      projectNumber, revisions: [{ no, date, desc }] }
export function setHTML(d) { const c = setContext(d); return docHTML(d, c.sheets.map(sh => sheetPage(c, sh)).join('')); }
// what every sheet is drawn from: the inputs plus the plan's numbers, uses, building types and designs
// d.types (buildingTypes), d.designs ({ typeId: placed design }), d.disc ({ discipline: { notes, criteria } }) are optional
export function setContext(d, sheets) {
  const plan = d.plan, m = S.metrics(plan), uses = [...legendHTML(plan, m).usedUses].map(x => S.USES[x].label).join(' · ');
  const types = d.types || ((plan?.ring || []).length >= 3 ? buildingTypes(plan) : []);
  return { ...d, project: d.project || {}, m, uses, types, designs: d.designs || {}, disc: d.disc || {}, sheets: sheets || d.sheets || sheetList(plan, { types }) };
}
// one sheet: its drawing in the frame and its title block. A kind no module draws yet says so rather than failing.
export function sheetPage(ctx, sheet) {
  const sh = { ...sheet }, plan = ctx.plan, m = ctx.m, project = ctx.project;
  let body;
  try {
    body = sh.kind === 'cover' ? coverBody(ctx) : sh.kind === 'siteplan' ? sitePlanBody(ctx, sh) : sh.kind === 'render' ? renderBody(ctx, sh) : sh.kind === 'g-notes' ? notesBody(ctx, sh)
      : (SITE[sh.kind] || ARCH[sh.kind] || ENG[sh.kind] || FUEL[sh.kind])?.(ctx, sh) ?? '<p class="muted">This sheet (' + esc(sh.kind) + ') isn’t drawn yet.</p>';
  } catch (e) { body = '<div class="warnbox"><b>This sheet couldn’t be drawn.</b> ' + esc(e.message) + '</div>'; }
  const tb = titleBlockHTML({ project: { name: project.name, lines: [ctx.address, [ctx.county, m.acres.toFixed(2) + ' acres'].filter(Boolean).join(' · ')] }, client: ctx.client,
    phase: 'Schematic design · ' + (plan.name || 'Option'), date: ctx.date, scale: sh.scale, drawnBy: ctx.drawnBy, checkedBy: ctx.checkedBy, projectNumber: ctx.projectNumber,
    sheet: { number: sh.number, title: sh.title, sub: sh.sub }, revisions: ctx.revisions });
  return '<section class="pg"><div class="fr">' + body + '</div>' + tb + '</section>';
}
// the document around one or more pages
export function docHTML(d, pages) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(d.project?.name || 'Plan set') + ' — Schematic design set</title><style>' +
    '@page{size:36in 24in;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent}body{font-family:Arial,Helvetica,sans-serif;color:#1b1e1f;font-size:9pt}' +
    '.pg{position:relative;width:36in;height:24in;overflow:hidden;page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}' +
    '.fr{position:absolute;left:' + FRAME.x + 'pt;top:' + FRAME.y + 'pt;width:' + FRAME.w + 'pt;height:' + FRAME.h + 'pt;overflow:hidden;padding:24pt}' +
    'h1{font-family:Montserrat,Arial,sans-serif;font-size:44pt;font-weight:800;margin:0;line-height:1;text-transform:uppercase;letter-spacing:.01em}.sub1{font-family:Montserrat,Arial,sans-serif;font-size:16pt;font-weight:700;margin-top:8pt;text-transform:uppercase}.sub2{font-size:11pt;margin-top:5pt;color:#4d5457}' +
    '.blk{margin-top:14pt}.bh{font-weight:800;font-size:9.5pt;letter-spacing:.14em;text-transform:uppercase;background:#1b1e1f;color:#fff;padding:3pt 6pt;margin-bottom:5pt}' +
    'table{width:100%;border-collapse:collapse;font-size:8.5pt}td,th{padding:2.5pt 5pt;border-bottom:.5pt solid #c9ccc9;text-align:left;vertical-align:top}th{font-size:7.5pt;color:#4d5457;text-transform:uppercase;letter-spacing:.06em}td.r,th.r{text-align:right;white-space:nowrap}' +
    'ol,ul{margin:0;padding-left:15pt;font-size:8.5pt;line-height:1.38}li{margin:0 0 2.5pt}p{margin:0 0 5pt;font-size:9pt;line-height:1.4}.muted{color:#6b7174}' +
    '.vt{position:absolute;font-weight:800;font-size:11pt;text-transform:uppercase;display:flex;align-items:center;gap:8pt}.vt i{display:inline-flex;width:22pt;height:22pt;border:1.2pt solid #1b1e1f;border-radius:50%;align-items:center;justify-content:center;font-style:normal;font-size:10pt}.vt small{display:block;font-weight:400;font-size:8pt;text-transform:none}' +
    '.lg{display:flex;align-items:center;gap:6px;font-size:8.5pt;margin:2px 0}.lg i{display:inline-block;width:20px;height:12px;border:.5px solid #4a3a2c}.ix td:first-child{font-weight:700;white-space:nowrap;width:46pt}.ixg td{font-weight:800;background:#eef0ee;text-transform:uppercase;font-size:7.5pt;letter-spacing:.1em}' +
    TB_CSS + KIT_CSS + '</style></head><body>' + pages + '</body></html>';
}

const tableHTML = (head, rows, right = []) => '<table>' + (head ? '<tr>' + head.map((h, i) => '<th' + (right.includes(i) ? ' class="r"' : '') + '>' + esc(h) + '</th>').join('') + '</tr>' : '') +
  rows.map(r => '<tr>' + r.map((c, i) => '<td' + (right.includes(i) ? ' class="r"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table>';

// G-001: the project's name, a key plan of the site, the project data, the sheet index, the vicinity map and the notes
function coverBody(c) {
  const { plan, m } = c, { land, program, parking } = sheetData(plan), T = c.text;
  const W = FRAME.w - 48, colA = W * 0.47, colB = W * 0.25, colC = W - colA - colB - 40; // pt
  const key = planSVG(plan, { px: colA * DPI / PT, pad: 40 }), maxH = 1150 * DPI / PT; // the room between the heading and the project team
  const keySvg = key.height > maxH ? planSVG(plan, { px: colA * DPI / PT * maxH / key.height, pad: 40 }) : key;
  const groups = [...new Set(c.sheets.map(s => s.section))];
  // the sheet index: a table, or for a big set two compact columns of lines so a hundred sheets fit beside the data
  const big = c.sheets.length > 40, label = s => s.title + (s.kind === 'render' ? ' — ' + s.sub : '');
  const index = !big ? '<table class="ix">' + groups.map(g => '<tr class="ixg"><td colspan="2">' + esc(SECTIONS.find(s => s.id === g)?.label || g) + '</td></tr>' + c.sheets.filter(s => s.section === g).map(s => '<tr><td>' + esc(s.number) + '</td><td>' + esc(label(s)) + '</td></tr>').join('')).join('') + '</table>'
    : '<div style="columns:2;column-gap:12pt;font-size:7pt;line-height:1.32">' + groups.map(g => '<div style="break-inside:avoid-column;font-weight:800;text-transform:uppercase;letter-spacing:.08em;background:#eef0ee;padding:1pt 3pt;margin-top:3pt">' + esc(SECTIONS.find(s => s.id === g)?.label || g) + '</div>' +
      c.sheets.filter(s => s.section === g).map(s => '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b style="display:inline-block;width:36pt">' + esc(s.number) + '</b>' + esc(label(s)) + '</div>').join('')).join('') + '</div>';
  const team = [['Owner / client', c.client || 'To be confirmed'], ['Development consultant', 'Finishes Solutions'], ['Architect of record', 'To be engaged'], ['Civil engineer', 'To be engaged'], ['Structural engineer', 'To be engaged'], ['MEP engineer', 'To be engaged'], ['Surveyor', 'To be engaged'], ['Geotechnical engineer', 'To be engaged']];
  const notesBlk = T ? (T.description ? '<div class="blk"><div class="bh">Project description</div><p>' + esc(T.description) + '</p></div>' : '') +
      (T.general_notes.length ? '<div class="blk"><div class="bh">General notes</div><ol>' + T.general_notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ol></div>' : '') +
      (T.codes.length ? '<div class="blk"><div class="bh">Applicable codes (basis of design)</div><ul>' + T.codes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '') +
      (T.next_steps.length ? '<div class="blk"><div class="bh">Next steps</div><ul>' + T.next_steps.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '')
    : '<div class="blk"><div class="bh">General notes</div><p class="muted">The notes weren’t written for this issue (the AI wasn’t available). The drawings and numbers are complete.</p></div>';
  const facts = (c.facts || []).concat(c.notes || []).slice(0, 10);
  return '<div style="display:flex;gap:20pt;height:100%">' +
    '<div style="width:' + colA + 'pt;display:flex;flex-direction:column">' +
      '<h1>' + esc(c.project?.name || 'Untitled project') + '</h1><div class="sub1">Schematic design set — ' + esc(plan.name || 'Option') + '</div>' +
      '<div class="sub2">' + esc([c.uses, c.address, c.county, m.acres.toFixed(2) + ' acres'].filter(Boolean).join(' · ')) + '</div>' +
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;margin-top:14pt">' + keySvg.svg + '<div style="position:absolute;top:0;right:0">' + northArrow(keySvg.turn, 64) + '</div></div>' +
      '<div style="font-weight:800;font-size:10pt;text-transform:uppercase;margin:6pt 0 8pt">Site key plan <span class="muted" style="font-weight:400;text-transform:none">· not to scale · see C-101</span></div>' +
      '<div class="blk" style="margin-top:0"><div class="bh">Project team</div>' + tableHTML(null, team) + '</div></div>' +
    '<div style="width:' + colB + 'pt">' +
      '<div class="bh">Project data</div>' + tableHTML(null, land, [1, 2]) +
      '<div class="blk"><div class="bh">Program &amp; parking</div>' + tableHTML(['Use', 'Size', 'Floors'], program.concat(parking.map(([a, b]) => [a, b, ''])), [1, 2]) + '</div>' +
      '<div class="blk"><div class="bh">Sheet index</div>' + index + '</div></div>' +
    '<div style="width:' + colC + 'pt">' +
      (c.vicinity ? '<div class="bh">Vicinity map</div><div style="height:230pt;overflow:hidden">' + c.vicinity + '</div>' : '') +
      notesBlk + (facts.length ? '<div class="blk"><div class="bh">Site constraints &amp; due diligence</div><ul>' + facts.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '') +
    '</div></div>';
}

// C-101: the plan to scale (street at the bottom, true north shown), its legend, the land use and program tables, notes
function sitePlanBody(c, sh) {
  const { plan, m } = c, { land, program, parking } = sheetData(plan), side = 560, gap = 24; // pt
  const dw = (FRAME.w - 48 - side - gap) / PT, dh = (FRAME.h - 48 - 60) / PT, scale = fitScale(plan, dw, dh);
  sh.scale = scaleText(scale);
  const dr = planSVG(plan, { k: DPI / scale, pad: 60 }), notes = (c.facts || []).concat(c.notes || []).slice(0, 14);
  return '<div style="position:absolute;left:24pt;top:24pt;width:' + (dw * PT) + 'pt;height:' + (dh * PT) + 'pt;display:flex;align-items:center;justify-content:center">' + dr.svg + '</div>' +
    '<div style="position:absolute;left:24pt;top:24pt">' + northArrow(dr.turn, 72) + '</div>' +
    '<div class="vt" style="left:24pt;bottom:20pt"><i>1</i><div>Overall site plan<small>Scale: ' + esc(scaleText(scale)) + ' on 24" × 36"</small></div><div style="margin-left:20pt">' + scaleBar(scale) + '</div></div>' +
    '<div style="position:absolute;right:24pt;top:24pt;width:' + side + 'pt;bottom:24pt;overflow:hidden">' +
      '<div class="bh">Legend</div><div style="columns:2;column-gap:14pt">' + legendHTML(plan, m).html + '</div>' +
      '<div class="blk"><div class="bh">Site data &amp; land use</div>' + tableHTML(null, land, [1, 2]) + '</div>' +
      '<div class="blk"><div class="bh">Program &amp; parking</div>' + tableHTML(['Use', 'Size', 'Floors'], program.concat(parking.map(([a, b]) => [a, b, ''])), [1, 2]) + '</div>' +
      '<div class="blk"><div class="bh">Notes</div><ol>' + ['Boundary from ' + (c.boundarySource || 'county appraisal district parcel outlines') + '; a boundary and topographic survey is required before design.', 'Building sizes, unit and stall counts are measured from this plan.', ...notes].map(n => '<li>' + esc(n) + '</li>').join('') + '</ol></div>' +
    '</div>';
}

// G-002: general notes, the codes, every symbol and line type the set uses (lib/sheetkit.mjs), abbreviations
export const GENERAL_NOTES = [
  'These drawings are a schematic design set for feasibility, pricing and consultant coordination. They are not construction documents and are not for construction, bidding or permit.',
  'Site geometry (boundary, buildings, drives, parking, detention) is from the conceptual site plan in this set. The boundary is from county appraisal district parcel outlines: a boundary and topographic survey by a Texas RPLS is required before design.',
  'Building layouts are schematic and were generated with AI assistance, then checked by rule for fit, access, room sizes and egress. Finishes Solutions reviews each set; final design is by the architect and engineers of record.',
  'Structural, mechanical, plumbing, electrical, fire protection and telecom sheets show a rule-based basis of design. Systems, sizes, loads and calculations must be designed and sealed by the engineer of record for each discipline.',
  'All dimensions are nominal, to face of stud or face of panel unless noted. Do not scale the drawings.',
  'A geotechnical investigation is required. Expansive clay soils are typical in southeast Texas; foundations shown assume a post-tensioned or conventionally reinforced slab on grade.',
  'Utilities, capacities and providers are unconfirmed: obtain service letters from the water, sewer, power, gas and telecom providers.',
  'Accessibility per the Texas Accessibility Standards (TAS 2012) and the 2010 ADA Standards; a TDLR registered accessibility specialist review is required for public buildings over $50,000.'
];
const CODES = ['International Building Code 2021, as adopted by the authority having jurisdiction', 'International Residential Code 2021 (one- and two-family dwellings, townhouses)', 'International Fire Code 2021 and local amendments',
  'International Mechanical, Plumbing and Fuel Gas Codes 2021', 'National Electrical Code (NFPA 70), edition adopted locally', 'International Energy Conservation Code 2021 (climate zone 2A)', 'NFPA 13 / 13D, NFPA 72', 'ASCE 7-22 Minimum Design Loads',
  'Texas Accessibility Standards (TAS 2012)', 'County / drainage district criteria manuals and floodplain regulations', 'TxDOT access management (driveways on state roads)'];
export const ABBREVIATIONS = ['A/C air conditioning', 'ADA Americans with Disabilities Act', 'AFF above finished floor', 'AHU air handling unit', 'BOC back of curb', 'CL centerline', 'CLG ceiling', 'CMU concrete masonry unit', 'CO cleanout / carbon monoxide',
  'CU condensing unit', 'DN down', 'EL elevation', 'EOR engineer of record', 'EXT exterior', 'FACP fire alarm control panel', 'FDC fire department connection', 'FF finished floor', 'FFE finished floor elevation', 'GB grade beam', 'GFCI ground-fault circuit interrupter',
  'GWB gypsum wallboard', 'HB hose bibb', 'HH handhole', 'HWL high water level', 'INV invert', 'MH manhole', 'MPOE minimum point of entry', 'NIC not in contract', 'NTS not to scale', 'NWL normal water level', 'OC on center', 'OH overhead', 'ONT optical network terminal',
  'PIV post indicator valve', 'PT post-tensioned', 'RCP reinforced concrete pipe', 'ROW right-of-way', 'RTU rooftop unit', 'SD storm drain / smoke detector', 'SS sanitary sewer', 'TAS Texas Accessibility Standards', 'TYP typical', 'UE underground electric', 'UNO unless noted otherwise',
  'W water', 'WC water closet', 'WH water heater', 'WP weatherproof'];
function notesBody(c, sh) {
  const T = c.text, gen = T?.general_notes?.length ? T.general_notes.concat(GENERAL_NOTES.slice(3, 5)) : GENERAL_NOTES, codes = T?.codes?.length ? T.codes : CODES;
  const col = (w, html) => '<div style="width:' + w + 'pt;flex:none">' + html + '</div>', W = (FRAME.w - 48 - 60) / 4;
  const types = (c.types || []).filter(t => t.supported);
  return '<div style="display:flex;gap:20pt;height:100%">' +
    col(W, '<div class="bh">General notes</div><ol>' + gen.map(n => '<li>' + esc(n) + '</li>').join('') + '</ol>' +
      '<div class="blk"><div class="bh">Applicable codes (basis of design)</div><ul>' + codes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>') +
    col(W, (types.length ? '<div class="bh">Building types in this set</div><table><tr><th>Type</th><th>Use</th><th class="r">Size</th><th class="r">No.</th></tr>' + types.map(t => '<tr><td>' + t.id + '</td><td>' + esc(t.label) + '</td><td class="r">' + t.W + "' × " + t.D + "' · " + t.floors + ' fl</td><td class="r">' + t.count + '</td></tr>').join('') + '</table>' : '') +
      '<div class="blk"><div class="bh">Code summary</div><table><tr><th>Type</th><th>Occupancy</th><th>Construction</th><th>Sprinklers</th></tr>' + types.map(t => '<tr><td>' + t.id + '</td><td>' + esc(t.occupancy) + '</td><td>' + esc(t.construction) + '</td><td>' + (t.sprinklered ? 'Yes' : 'No') + '</td></tr>').join('') + '</table>' +
      '<p class="muted" style="margin-top:4pt">Sprinkler basis: ' + esc([...new Set(types.map(t => t.sprinklerWhy))].join('; ')) + '.</p></div>' +
      '<div class="blk"><div class="bh">Line types</div>' + Object.keys(LINES).map(legendLine).join('') + '</div>') +
    col(W, '<div class="bh">Symbol legend</div><div style="columns:2;column-gap:10pt">' + Object.keys(SYMBOLS).map(legendSym).join('') + '</div>') +
    col(W, '<div class="bh">Abbreviations</div><div style="columns:2;column-gap:10pt;font-size:8pt;line-height:1.45">' + ABBREVIATIONS.map(a => { const [k, ...r] = a.split(' '); return '<div><b>' + esc(k) + '</b> ' + esc(r.join(' ')) + '</div>'; }).join('') + '</div>' +
      '<div class="blk"><div class="bh">Drawing conventions</div><ul><li>Site plans: the street at the bottom; north as shown by each north arrow.</li><li>Building plans: the front (street side) at the bottom; left and right as seen from the street.</li><li>Sheet numbers follow the US National CAD Standard: discipline, sheet type, sequence.</li></ul></div>') +
    '</div>';
}

// A-901…: one rendering as large as the frame allows, with what it is and isn't
function renderBody(c, sh) {
  const r = (c.renders || [])[sh.render];
  if (!r?.src) return '<p class="muted">This rendering wasn’t available on the device that made the set.</p>';
  return '<div style="position:absolute;left:24pt;right:24pt;top:24pt;bottom:84pt;background:#111"><img src="' + r.src + '" alt="Rendering" style="width:100%;height:100%;object-fit:contain"></div>' +
    '<div class="vt" style="left:24pt;bottom:22pt;right:24pt;justify-content:space-between"><div style="display:flex;gap:8pt;align-items:center"><i>1</i><div>Conceptual rendering' + (r.caption ? ' — ' + esc(r.caption) : '') +
    '<small>AI-generated concept illustration from the plan’s massing: building placement, shapes and heights follow the plan; materials, windows, landscaping, vehicles and surroundings are illustrative. Not a design.</small></div></div></div>';
}
