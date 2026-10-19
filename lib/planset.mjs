// Plan sets (PLANSET-PLAN.md): a schematic design set of drawings made from one site plan option, every sheet on the
// Finishes Solutions title block. This file has no DOM and no network, so the browser (src/siteplan.js, Projects › a
// project › Plans), the server (api/planset.js) and the tests share it:
//   - the sections a set can have, which ones are built so far, and the sheets each adds for a plan;
//   - the brief Claude reads and the schema its cover notes come back in;
//   - the whole set as one HTML document, one 36 x 24 in page a sheet, ready for api/planset.js to print and lay on
//     the border (templates/titleblock.pdf).
// Phase 1 sheets: G-001 cover (sheet index, project data, vicinity, site key plan, notes), C-101 overall site plan,
// A-901… one AI rendering each. The other sections are listed so the choice is visible, and come in later phases.
import * as S from './siteplan.mjs';
import { planSVG, sheetData, legendHTML, northArrow, scaleBar, streetDown, turned, SCALES } from './sitesheet.mjs';
import { FRAME, TB_CSS, titleBlockHTML } from './titleblock.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f0 = v => Math.round(v).toLocaleString('en-US');
const DPI = 96, PT = 72; // CSS px and pt per inch

// ---------- sections ----------
// phase: when it's built (PLANSET-PLAN.md, Order of work); on: ticked when the form opens; always: can't be unticked;
// needs: drawn on another section's work, so it goes when that one is unticked
export const BUILT_PHASE = 1;
export const SECTIONS = [
  { id: 'general', label: 'General', letter: 'G', phase: 1, on: true, always: true, note: 'Cover sheet: sheet index, project data, vicinity map, notes' },
  { id: 'civil', label: 'Site & civil', letter: 'C', phase: 1, on: true, note: 'Overall site plan now; existing conditions, grading, utilities and details later' },
  { id: 'landscape', label: 'Landscape', letter: 'L', phase: 2, on: true },
  { id: 'arch', label: 'Architecture', letter: 'A', phase: 3, on: true, note: 'Floor plans, elevations, sections and schedules for each building type' },
  { id: 'structural', label: 'Structural', letter: 'S', phase: 4, on: true, needs: 'arch' },
  { id: 'mechanical', label: 'Mechanical', letter: 'M', phase: 4, on: true, needs: 'arch' },
  { id: 'plumbing', label: 'Plumbing', letter: 'P', phase: 4, on: true, needs: 'arch' },
  { id: 'electrical', label: 'Electrical', letter: 'E', phase: 4, on: true, needs: 'arch' },
  { id: 'fire', label: 'Fire protection & life safety', letter: 'FP', phase: 4, on: true, needs: 'arch' },
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
// plan: the option; o: { sections (ids), renders (how many renderings the set can show), renderLabels: [] }
// -> [{ number, title, sub, section, kind, scale, index }] in set order (the sheet index on the cover lists these)
export function sheetList(plan, o = {}) {
  const on = new Set(pickSections(o.sections ?? defaultSections())), out = [], n = Math.max(0, Math.min(4, o.renders | 0));
  out.push({ number: 'G-001', title: 'Cover sheet', sub: 'Sheet index · Project data · Notes', section: 'general', kind: 'cover', scale: 'As noted' });
  if (on.has('civil') && (plan?.ring || []).length >= 3) out.push({ number: 'C-101', title: 'Overall site plan', sub: 'Land use · Circulation · Program · Parking', section: 'civil', kind: 'siteplan', scale: '' });
  if (on.has('renderings')) for (let i = 0; i < n; i++) out.push({ number: 'A-9' + String(i + 1).padStart(2, '0'), title: 'Conceptual rendering', sub: o.renderLabels?.[i] || 'AI concept illustration', section: 'renderings', kind: 'render', scale: 'N.T.S.', render: i });
  return out;
}
// what each section would add to this plan's set right now (the form shows it beside the box)
export function sectionCounts(plan, renders = 0) {
  const all = sheetList(plan, { sections: SECTIONS.map(s => s.id), renders });
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

// ---------- the set as HTML ----------
// d: { plan, project, client, address, county, parcels, facts, notes (plan checks), vicinity (HTML), renders: [{ src, caption }],
//      sheets (sheetList), text (cleanNotes, or null: the cover says the notes weren't written), date, drawnBy, checkedBy,
//      projectNumber, revisions: [{ no, date, desc }] }
export function setHTML(d) {
  const plan = d.plan, project = d.project || {}, m = S.metrics(plan), uses = [...legendHTML(plan, m).usedUses].map(x => S.USES[x].label).join(' · ');
  const tb = sheet => titleBlockHTML({ project: { name: project.name, lines: [d.address, [d.county, m.acres.toFixed(2) + ' acres'].filter(Boolean).join(' · ')] }, client: d.client,
    phase: 'Schematic design · ' + (plan.name || 'Option'), date: d.date, scale: sheet.scale, drawnBy: d.drawnBy, checkedBy: d.checkedBy, projectNumber: d.projectNumber,
    sheet: { number: sheet.number, title: sheet.title, sub: sheet.sub }, revisions: d.revisions });
  const sheets = d.sheets || sheetList(plan, {}), ctx = { ...d, m, uses, sheets };
  const pages = sheets.map(sh => { const body = sh.kind === 'cover' ? coverBody(ctx) : sh.kind === 'siteplan' ? sitePlanBody(ctx, sh) : renderBody(ctx, sh);
    return '<section class="pg"><div class="fr">' + body + '</div>' + tb(sh) + '</section>'; });
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(project.name || 'Plan set') + ' — Schematic design set</title><style>' +
    '@page{size:36in 24in;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent}body{font-family:Arial,Helvetica,sans-serif;color:#1b1e1f;font-size:9pt}' +
    '.pg{position:relative;width:36in;height:24in;overflow:hidden;page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}' +
    '.fr{position:absolute;left:' + FRAME.x + 'pt;top:' + FRAME.y + 'pt;width:' + FRAME.w + 'pt;height:' + FRAME.h + 'pt;overflow:hidden;padding:24pt}' +
    'h1{font-family:Montserrat,Arial,sans-serif;font-size:44pt;font-weight:800;margin:0;line-height:1;text-transform:uppercase;letter-spacing:.01em}.sub1{font-family:Montserrat,Arial,sans-serif;font-size:16pt;font-weight:700;margin-top:8pt;text-transform:uppercase}.sub2{font-size:11pt;margin-top:5pt;color:#4d5457}' +
    '.blk{margin-top:14pt}.bh{font-weight:800;font-size:9.5pt;letter-spacing:.14em;text-transform:uppercase;background:#1b1e1f;color:#fff;padding:3pt 6pt;margin-bottom:5pt}' +
    'table{width:100%;border-collapse:collapse;font-size:8.5pt}td,th{padding:2.5pt 5pt;border-bottom:.5pt solid #c9ccc9;text-align:left;vertical-align:top}th{font-size:7.5pt;color:#4d5457;text-transform:uppercase;letter-spacing:.06em}td.r,th.r{text-align:right;white-space:nowrap}' +
    'ol,ul{margin:0;padding-left:15pt;font-size:8.5pt;line-height:1.38}li{margin:0 0 2.5pt}p{margin:0 0 5pt;font-size:9pt;line-height:1.4}.muted{color:#6b7174}' +
    '.vt{position:absolute;font-weight:800;font-size:11pt;text-transform:uppercase;display:flex;align-items:center;gap:8pt}.vt i{display:inline-flex;width:22pt;height:22pt;border:1.2pt solid #1b1e1f;border-radius:50%;align-items:center;justify-content:center;font-style:normal;font-size:10pt}.vt small{display:block;font-weight:400;font-size:8pt;text-transform:none}' +
    '.lg{display:flex;align-items:center;gap:6px;font-size:8.5pt;margin:2px 0}.lg i{display:inline-block;width:20px;height:12px;border:.5px solid #4a3a2c}.ix td:first-child{font-weight:700;white-space:nowrap;width:46pt}.ixg td{font-weight:800;background:#eef0ee;text-transform:uppercase;font-size:7.5pt;letter-spacing:.1em}' +
    TB_CSS + '</style></head><body>' + pages.join('') + '</body></html>';
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
  const index = '<table class="ix">' + groups.map(g => '<tr class="ixg"><td colspan="2">' + esc(SECTIONS.find(s => s.id === g)?.label || g) + '</td></tr>' + c.sheets.filter(s => s.section === g).map(s => '<tr><td>' + esc(s.number) + '</td><td>' + esc(s.title + (s.kind === 'render' ? ' — ' + s.sub : '')) + '</td></tr>').join('')).join('') + '</table>';
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

// A-901…: one rendering as large as the frame allows, with what it is and isn't
function renderBody(c, sh) {
  const r = (c.renders || [])[sh.render];
  if (!r?.src) return '<p class="muted">This rendering wasn’t available on the device that made the set.</p>';
  return '<div style="position:absolute;left:24pt;right:24pt;top:24pt;bottom:84pt;background:#111"><img src="' + r.src + '" alt="Rendering" style="width:100%;height:100%;object-fit:contain"></div>' +
    '<div class="vt" style="left:24pt;bottom:22pt;right:24pt;justify-content:space-between"><div style="display:flex;gap:8pt;align-items:center"><i>1</i><div>Conceptual rendering' + (r.caption ? ' — ' + esc(r.caption) : '') +
    '<small>AI-generated concept illustration from the plan’s massing: building placement, shapes and heights follow the plan; materials, windows, landscaping, vehicles and surroundings are illustrative. Not a design.</small></div></div></div>';
}
