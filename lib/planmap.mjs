// How a site plan is drawn on the map: the colours (light and dark), which labels win when they collide, Phase 2 on the
// labels, the Plan key (legend) for what's on this plan, and Change With AI's checklist. No DOM and no map here: plain
// data in, plain data out, so it can be tested (test/planmap.mjs). Used by src/siteplan.js; the map layers and the Plan
// key read the same palette, so they can't disagree. (The PDF sheet keeps its own print palette.)
import { USES, elArea } from './siteplan.mjs';

// ---------- colours ----------
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
export const lighten = (hex, t = 0.45) => mix(hex, '#ffffff', t);
export const darken = (hex, t = 0.15) => mix(hex, '#000000', t);
export const brighten = (hex, t = 0.16) => rgbHex(hexRgb(hex).map(v => v * (1 + t) + 10)); // a selected building: the same hue, lit up

// the pieces of a plan (light map); USE_COL colours buildings by what they're for
export const COL = { patio: '#d8c3a0', garage: '#a3a8aa', lawn: '#cfe3bf', trash: '#a59f92', trail: '#d9c7a0', building: '#d0694c', parking: '#9aa3a6', drive: '#7c8689', truck: '#9a8fb8', pond: '#5b9bd1', green: '#62b072', plaza: '#d9c8a9', court: '#4f7fa3', pool: '#7ccbe6', play: '#e3cc9a' };
export const USE_COL = { retail: '#c8673d', restaurant: '#c8673d', office: '#b5553c', medical: '#b5553c', other: '#b0603f', industrial: '#a2775b', multifamily: '#d8b16a', townhomes: '#b8865b', duplex: '#d9a77c', amenity: '#8a6fb3' };
// a dark map: ground colours that sit back, buildings about 15% darker
const COL_DARK = { ...COL, lawn: '#3f5a3a', parking: '#5f686b', drive: '#4c5457', pond: '#3d7bb0', plaza: '#8a7b62', green: '#3f8a52', patio: '#8f7f63', trail: '#8a7c5e', garage: '#7e8486', trash: '#7a7468', truck: '#6f6790', court: '#3d6688', pool: '#4fa3c0', play: '#a08d62', building: darken(COL.building) };
const USE_DARK = Object.fromEntries(Object.entries(USE_COL).map(([k, v]) => [k, darken(v)]));
const LINES = {
  light: { boundary: '#006527', casing: '#ffffff', setback: '#4d5457', frontage: '#e0a23c', zone: '#6b7174', lots: '#7d8f76', sel: '#006527', selCase: '#ffffff', bad: '#d64541', accent: '#0a7a36', p2: '#6d635a', curb: '#5d6466', parcel: '#0a7a36', walk: '#ecece6', yard: '#e6dcc8', fence: '#8a7a62', stall: '#ffffff' },
  dark: { boundary: '#4caf70', casing: '#101314', setback: '#bcc2c4', frontage: '#e0a23c', zone: '#939a9d', lots: '#8b9a86', sel: '#4caf70', selCase: '#ffffff', bad: '#ff6b5e', accent: '#4caf70', p2: '#c9bba0', curb: '#aab1b0', parcel: '#8acda3', walk: '#5b6366', yard: '#6b6456', fence: '#c9bba0', stall: '#d7dbd9' }
};
// labels: dark ink on a light halo; on a dark map light text on a dark halo, except on building roofs (light fills)
const LABEL = { light: { ink: '#0b0d0c', halo: '#ffffff' }, dark: { ink: '#e8ecea', halo: '#15191a', roofInk: '#0b0d0c', roofHalo: 'rgba(255,255,255,.75)' } };
// One palette for the map and the Plan key. p2: a Phase 2 building (lighter on a light map; on a dark map pulled
// toward the ground instead of toward white, so it doesn't glare)
export function palette(dark = false) {
  const col = dark ? COL_DARK : COL, use = dark ? USE_DARK : USE_COL;
  const p2 = c => dark ? mix(c, '#2b3133', 0.45) : lighten(c);
  return { dark, col, use, p2, sel: brighten, lines: LINES[dark ? 'dark' : 'light'], label: LABEL[dark ? 'dark' : 'light'], lotOpacity: dark ? 0.55 : 0.55 };
}
// a building's colour on the map
export function buildingColor(P, use, { ph = 1, garage = false } = {}) {
  const c = garage ? P.col.garage : P.use[use] || P.col.building;
  return ph === 2 && !garage ? P.p2(c) : c;
}

// ---------- labels ----------
// which label is placed first when they collide (lower first): the selected piece, then problems, then buildings
// (bigger ones first), garages, ponds and parks, amenities, drives, and parking counts last
export function labelPri(kind, area = 0, sel = false, bad = false) {
  if (sel) return 0; if (bad) return 1;
  if (kind === 'building') return +(2 + Math.min(0.99, 1000 / Math.max(1, area))).toFixed(3);
  if (kind === 'garage' || kind === 'pond' || kind === 'green') return 3;
  if (['pool', 'court', 'play', 'patio', 'plaza', 'trash'].includes(kind)) return 4;
  if (kind === 'drive' || kind === 'truck') return 6;
  if (kind === 'parking') return 8;
  return 5;
}
const NBH = '‑'; // a non-breaking hyphen: "APT BLDG 2-A" never breaks at the hyphen
// The plan's map features (lib/siteplan.mjs planFeatures) made ready for the map, in one pass and in place: each label
// and 3D part learns which piece it belongs to (the piece's own feature comes just before them), so the selected
// piece's label and parts can be drawn on their own layers; labels get a priority, parking counts a flag (they show
// from zoom 17.5), Phase 2 buildings keep their use and say "PH 2" on the first line, and shorter forms for zoomed-out
// views (t1: the first line, t2: the first and last). flash: ids to outline briefly.
// The features' shapes and the lib's output are unchanged for everyone else (the PDF, DXF and text read their own).
export function decorate(fc, plan, { flash = null } = {}) {
  const els = new Map((plan.elements || []).map(e => [e.id, e])); let last = null;
  for (const f of fc.features || []) {
    const p = f.properties; if (!p) continue;
    if (p.id != null && p.k !== 'label') { last = p; if (flash && flash.has(p.id)) p.fl = 1; continue; }
    if (p.k === 'b3') { if (last) { p.sel = last.sel; p.bid = last.id; } continue; }
    if (p.k !== 'label' || !last) continue;
    const e = els.get(last.id), kind = p.kind || last.k, area = e ? (e.w && e.d ? e.w * e.d : elArea(e)) : 0;
    p.id = last.id; p.sel = last.sel; p.bad = last.bad; p.ph = last.ph; p.use = last.use;
    p.pri = labelPri(kind, area, last.sel === 1, last.bad === 1); p.lp = kind === 'parking' ? 1 : 0;
    let t = String(p.t || '');
    if (kind === 'building' && last.ph === 2) t = phase2Label(t, USES[last.use]?.label || '');
    p.t = t.replace(/-/g, NBH);
    const L = p.t.split('\n'); p.t1 = L[0]; p.t2 = L.length > 1 ? L[0] + '\n' + L[L.length - 1] : L[0]; // further out: the name, then the name and its size
  }
  return fc;
}
// "APT BLDG 12 / Phase 2 / 32 units…" → "APT BLDG 12 · PH 2 / Multifamily / 32 units…"
export function phase2Label(t, useLabel) {
  const L = String(t).split('\n'), i = L.indexOf('Phase 2');
  if (i > 0) L[i] = useLabel; else if (i === 0) L[0] = useLabel || 'Phase 2';
  if (!/ · PH 2$/.test(L[0])) L[0] += ' · PH 2';
  return L.filter(Boolean).join('\n');
}

// ---------- the Plan key ----------
const KIND_LABEL = { garage: 'Parking garage', parking: 'Parking', drive: 'Drives', truck: 'Truck court', pond: 'Detention pond', green: 'Landscape', plaza: 'Plaza', court: 'Courts', pool: 'Pool', play: 'Playground', patio: 'Outdoor seating', trash: 'Trash enclosure', trail: 'Trail' };
const KIND_ORDER = ['garage', 'parking', 'drive', 'truck', 'pond', 'green', 'plaza', 'pool', 'court', 'play', 'patio', 'trash', 'trail'];
// what's on this plan: building uses (the program's first, then in plan order), the other kinds used, and whether there's a Phase 2
export function keyItems(plan) {
  const els = plan.elements || [], prog = plan.program?.use, uses = [], kinds = new Set();
  for (const e of els) {
    if (e.kind === 'building') { const u = USES[e.use] ? e.use : USES[prog] ? prog : 'retail'; if (!uses.includes(u)) uses.push(u); }
    else kinds.add(e.kind);
  }
  uses.sort((a, b) => (b === prog) - (a === prog)); // the program's own use first
  return { uses, kinds: KIND_ORDER.filter(k => kinds.has(k)), phase2: els.some(e => e.kind === 'building' && e.phase === 2) };
}
// a signature, so the key is only rebuilt when what it shows changes
export const keySig = (plan, dark) => { const k = keyItems(plan); return [dark ? 'd' : 'l', k.uses.join(), k.kinds.join(), k.phase2 ? 2 : 1].join('|'); };
// the Plan key's HTML for the map's legend card: only what this plan uses, Phase 1 and 2, the lines, and Problem
export function keyHtml(plan, { dark = false } = {}) {
  const P = palette(dark), k = keyItems(plan), esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sw = (c, label, cls = 'sq', extra = '') => '<div class="li" title="' + esc(label) + '"><i class="lg-' + cls + '" style="background:' + c + extra + '"></i><span>' + esc(label) + '</span></div>';
  const ln = (c, label, style = 'solid', w = 2) => '<div class="li" title="' + esc(label) + '"><i class="lg-ln" style="border-top:' + w + 'px ' + style + ' ' + c + '"></i><span>' + esc(label) + '</span></div>';
  const what = [...k.uses.map(u => sw(buildingColor(P, u), (USES[u]?.label || u).split(' / ')[0])), ...k.kinds.map(x => sw(x === 'parking' ? P.col.parking : P.col[x] || P.col.green, KIND_LABEL[x] || x))];
  if (what.length % 2) what.push('<div class="li" aria-hidden="true"></div>'); // two columns: Phase 1 and 2 side by side, then the lines
  const items = [
    ...what,
    ...(k.phase2 ? [sw(buildingColor(P, k.uses[0] || 'retail'), 'Phase 1'), sw(buildingColor(P, k.uses[0] || 'retail', { ph: 2 }), 'Phase 2', 'sq lg-p2')] : []),
    ln(P.lines.boundary, 'Site boundary', 'solid', 2), ln(P.lines.setback, 'Setback', 'dashed', 2), ln(P.lines.frontage, 'Street side', 'solid', 3),
    '<div class="li" title="Outside the lot or setbacks, or overlapping"><i class="lg-sq lg-bad" style="border-color:' + P.lines.bad + '"></i><span>Problem</span></div>'
  ];
  return '<div class="t">Plan key</div><div class="lg2 sp-key">' + items.join('') + '</div>';
}

// ---------- Change With AI: what it did, as a short checklist ----------
// "Building A: 3 stories." → "Building A → 3 stories"; "Removed Building F." → "Building F removed"
export function checklist(done = []) {
  const out = [];
  for (const s0 of done) {
    const s = String(s0 || '').trim().split(/\.\s+(?=[A-Z])/)[0].replace(/\.$/, ''); let m; // the first sentence (a note may follow)
    if (!s || /^Nothing to change on /.test(s)) continue;
    if ((m = s.match(/^Removed (.+?)(?: and its (.+))?$/))) out.push(m[1] + ' removed' + (m[2] ? ' (with its ' + m[2] + ')' : ''));
    else if ((m = s.match(/^Added (.+?)(?: from the street)?$/))) out.push(m[1] + ' added');
    else if ((m = s.match(/^Moved (.+)$/))) out.push(m[1] + ' moved');
    else if ((m = s.match(/^Swapped (.+) and (.+)$/))) out.push(m[1] + ' ⇄ ' + m[2]);
    else if ((m = s.match(/^(.+?): (.+)$/))) out.push(m[1] + ' → ' + m[2]);
    else out.push(s);
  }
  return out;
}
