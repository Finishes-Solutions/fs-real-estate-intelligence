// A project's reference files: a survey, existing floor plans, an earlier site plan… kept in private storage (the
// site-files bucket, through api/sitefiles.js with the secret key) and read by the AI into facts, each with how sure it
// is and where in the document it came from. People confirm, edit or dismiss each fact on the project page (src/
// sitefiles.js); only confirmed facts go to the AI when it plans, builds, reviews, changes or answers about the
// project's plans. A confirmed floor plan with its size can become a building type in the team library; a confirmed
// easement along a side of the site can be drawn on an option as a no-build area. No DOM and no Node here: shared by
// the browser and the API, tested in test/sitefiles.mjs.

export const BUCKET = 'site-files';
export const MAX_BYTES = 20 * 2 ** 20;
// what can be added, by extension: its type and how the AI reads it (pdf: the document itself; image: a picture;
// text: the words, a DXF's labels and layers)
export const TYPES = { pdf: ['application/pdf', 'pdf'], png: ['image/png', 'image'], jpg: ['image/jpeg', 'image'], jpeg: ['image/jpeg', 'image'], dxf: ['application/dxf', 'text'], txt: ['text/plain', 'text'], csv: ['text/csv', 'text'] };
export const ACCEPT = Object.keys(TYPES).map(e => '.' + e).join(',');
export const extOf = name => (String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1] || '';
export const typeOf = name => TYPES[extOf(name)] ? { ext: extOf(name), mime: TYPES[extOf(name)][0], how: TYPES[extOf(name)][1] } : null;
// a file name that is safe in a storage path: letters, digits, dot, dash and underscore, its extension kept
export function safeName(name) {
  const ext = extOf(name), base = String(name || '').replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 70) || 'file';
  return ext ? base + '.' + ext : base;
}
const PID = /^[\w-]{3,60}$/, FID = /^[a-z0-9]{6,24}$/;
// where a file lives in the bucket: projects/<project id>/<file id>__<safe name>
export const PATH = /^projects\/([\w-]{3,60})\/([a-z0-9]{6,24})__([\w.-]{1,80})$/;
export function pathFor(pid, id, name) { if (!PID.test(String(pid)) || !FID.test(String(id)) || !typeOf(name)) return null; return 'projects/' + pid + '/' + id + '__' + safeName(name); }
export function parsePath(path, pid) { const m = PATH.exec(String(path || '')); if (!m || (pid && m[1] !== pid) || !typeOf(m[3])) return null; return { pid: m[1], id: m[2], name: m[3] }; }

// ---------- what the AI reads out of a document ----------
const CATS = ['site_area', 'site_dimensions', 'boundary', 'easement', 'setback', 'structure', 'utility', 'flood', 'floor_plan', 'parking', 'zoning', 'access', 'other'];
export const SIDES = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'front', 'rear', 'left', 'right', 'interior', 'whole'];
const UNITS = ['sf', 'acres', 'ft', 'spaces', 'units', 'percent'];
const num = d => ({ type: ['number', 'null'], description: d }), str = d => ({ type: 'string', description: d }), str0 = d => ({ type: ['string', 'null'], description: d });
export const CAT_LABEL = { site_area: 'Site area', site_dimensions: 'Site size', boundary: 'Boundary', easement: 'Easement', setback: 'Setback', structure: 'Existing structure', utility: 'Utility', flood: 'Flood', floor_plan: 'Floor plan', parking: 'Parking', zoning: 'Zoning', access: 'Access', other: 'Other' };
export const READ_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kind', 'title', 'readable', 'unreadable', 'summary', 'facts'],
  properties: {
    kind: { type: 'string', enum: ['survey', 'floor_plan', 'site_plan', 'plat', 'other'], description: 'What the document is: a boundary or topographic survey, a floor plan (one or more house or building plans), a site plan, a recorded plat, or other.' },
    title: str0('Its title as printed (title block, heading), or null.'),
    readable: { type: 'boolean', description: 'false when the document can\'t be read well enough to take any facts from it (blank, too blurry, scrambled, not a drawing or document about a site or building).' },
    unreadable: str0('When readable is false, or parts couldn\'t be read: what couldn\'t be read and why, in a sentence. Otherwise null.'),
    summary: str('One or two plain sentences on what the document shows.'),
    facts: { type: 'array', description: 'Every useful fact as written on the document, one fact each. Empty when nothing can be read.', items: {
      type: 'object', additionalProperties: false, required: ['category', 'label', 'text', 'value', 'unit', 'widthFt', 'depthFt', 'side', 'beds', 'baths', 'stories', 'bearing', 'confidence', 'source'],
      properties: {
        category: { type: 'string', enum: CATS, description: 'site_area (lot area), site_dimensions (frontage, depth, a lot line\'s length), boundary (a boundary call: bearing and distance), easement, setback (a building line or setback), structure (an existing building, slab, fence, pavement), utility (water, sewer, power, gas, a pole, manhole or meter), flood (flood zone, base flood elevation, floodplain note), floor_plan (one house or building plan), parking, zoning, access (a driveway, curb cut, road or right-of-way), other.' },
        label: str('A short name: "Lot area", "16 ft drainage easement", "Plan 2140 \'The Aspen\'", "Front building line".'),
        text: str('The fact in plain words, as the document gives it (numbers and units as written).'),
        value: num('Its main number: the area, a width, a distance, a setback, a floor plan\'s square feet, a number of spaces. null when none.'),
        unit: { type: ['string', 'null'], enum: [...UNITS, null], description: 'The unit of value.' },
        widthFt: num('Feet wide: an easement\'s width, a floor plan\'s or a building\'s width across its front. null when not given.'),
        depthFt: num('Feet deep: a floor plan\'s or a building\'s depth, a lot\'s depth. null when not given.'),
        side: { type: ['string', 'null'], enum: [...SIDES, null], description: 'Where on the site: the side of the lot it runs along or sits on (by compass when the drawing has a north arrow, else front/rear/left/right as seen from the street), interior, or whole (the whole site). null when not shown or not about a place.' },
        beds: num('A floor plan\'s bedrooms. null otherwise.'), baths: num('A floor plan\'s bathrooms (2.5 for two and a half). null otherwise.'), stories: num('Stories of a floor plan or an existing building. null otherwise.'),
        bearing: str0('A boundary call as written, e.g. "N 89°59\'12" E 245.10\'". null otherwise.'),
        confidence: { type: 'string', enum: ['sure', 'unsure'], description: 'sure when it is printed clearly and you read it exactly; unsure when it is partly legible, inferred from the drawing rather than written, or could be read another way.' },
        source: str('Where in the document: "page 1, legend", "sheet 2, title block", "north line label", "plan sheet A1, area table".') } } } }
};
export const READ_SYSTEM = `You read reference documents for a land-planning tool: boundary and topographic surveys, recorded plats, floor plans of houses or buildings, and earlier site plans. Take out the facts a site planner needs, exactly as the document gives them.
- Never invent, guess or fill in. A number that is not printed or drawn with a dimension is not a fact. Don't compute an area or a size the document doesn't give, and don't round.
- Each fact once, with where it came from (page or sheet, and the part: legend, title block, area table, a label on a line) and how sure you are: sure only when it's printed clearly and read exactly; unsure when it's partly legible, could be read another way, or comes from the drawing rather than its words.
- Survey or plat: the lot area (sf and acres as written), the lot's frontage and depth, the boundary calls (bearing and distance) when legible, every easement (its type: drainage, utility, access, pipeline, sanitary sewer…; its width; which side of the lot it runs along), building lines and setbacks, existing buildings and structures, utilities (lines, poles, manholes, meters, hydrants), the flood zone, base flood elevation and any floodplain note, the zoning and any restriction written on it, curb cuts, driveways and the right-of-way.
- Floor plans: one fact per plan: its name or number, its living area in sf (and the total under roof if given separately, as text), its overall width and depth in feet when dimensioned, bedrooms, bathrooms, stories, the garage.
- Site plan: the buildings with their sizes, parking counts, the detention pond, the drives and the entrances, setbacks and easements shown.
- The side of the lot: by compass when the drawing has a north arrow; otherwise front (the street side), rear, left or right as seen from the street. null when it isn't clear.
- Feet: give widthFt and depthFt in feet (25'-6" is 25.5).
- When the document can't be read (blurry, cut off, not about a site or building), set readable false and say what couldn't be read; never make facts up to fill the list. When part of it can't be read, say which part in unreadable and give the facts you could read.`;

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const nOr = (v, lo, hi) => v != null && v !== '' && Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : null;
// the model's answer made safe and given ids: unknown values dropped, numbers in range, at most 80 facts, each fact new
// (not yet confirmed). -> { read: { kind, title, readable, unreadable, summary }, facts }
export function readOut(d) {
  const kind = ['survey', 'floor_plan', 'site_plan', 'plat', 'other'].includes(d?.kind) ? d.kind : 'other';
  const facts = (Array.isArray(d?.facts) ? d.facts : []).filter(f => f && CATS.includes(f.category) && clip(f.text, 400)).slice(0, 80).map((f, i) => ({
    id: 'f' + (i + 1), category: f.category, label: clip(f.label, 100) || CAT_LABEL[f.category], text: clip(f.text, 400), value: nOr(f.value, 0, 1e9), unit: UNITS.includes(f.unit) ? f.unit : null,
    widthFt: nOr(f.widthFt, 0.5, 5000), depthFt: nOr(f.depthFt, 0.5, 5000), side: SIDES.includes(f.side) ? f.side : null, beds: nOr(f.beds, 0, 20), baths: nOr(f.baths, 0, 20), stories: nOr(f.stories, 1, 60),
    bearing: clip(f.bearing, 80) || null, confidence: f.confidence === 'sure' ? 'sure' : 'unsure', source: clip(f.source, 160), status: 'new' }));
  const readable = d?.readable !== false;
  return { read: { kind, title: clip(d?.title, 160) || null, readable: readable && (facts.length > 0 || !d?.unreadable), unreadable: clip(d?.unreadable, 400) || null, summary: clip(d?.summary, 500) }, facts: readable ? facts : [] };
}

// A DXF (AutoCAD's text drawing format) as words the AI can read: its units, its extents, its layers and every text
// and dimension label, in drawing order, cut to max characters. (The lines themselves aren't sent: only what's written.)
const DXF_UNITS = { 1: 'inches', 2: 'feet', 4: 'millimeters', 5: 'centimeters', 6: 'meters' };
export function dxfDigest(src, max = 60000) {
  const lines = String(src || '').split(/\r?\n/), pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1].replace(/\s+$/, '')]);
  const layers = new Set(), texts = [], hdr = {}; let ent = null, cur = null, ext = {};
  const flush = () => { if (ent && cur && (cur.t || cur.d)) texts.push((cur.layer ? '[' + cur.layer + '] ' : '') + (cur.t || '') + (cur.d ? (cur.t ? ' ' : '') + '(dimension ' + cur.d + ')' : '')); };
  for (let k = 0; k < pairs.length; k++) {
    const [c, v] = pairs[k];
    if (c === '9') { hdr.var = v; continue; }
    if (hdr.var && (c === '10' || c === '20' || c === '70')) { ext[hdr.var + c] = v; continue; }
    if (c === '0') { flush(); hdr.var = null; ent = /^(TEXT|MTEXT|ATTRIB|DIMENSION|ATTDEF)$/.test(v) ? v : null; cur = ent ? {} : null; continue; }
    if (c === '8' && v) { layers.add(v.slice(0, 60)); if (cur) cur.layer = v.slice(0, 60); }
    if (!cur) continue;
    if (c === '1' || c === '3') cur.t = ((cur.t || '') + v.replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '')).slice(0, 300);
    if (c === '42' && ent === 'DIMENSION') cur.d = (+v).toFixed(2);
  }
  flush();
  const u = DXF_UNITS[+ext.$INSUNITS70], lo = ext.$EXTMIN10 != null ? [ext.$EXTMIN10, ext.$EXTMIN20] : null, hi = ext.$EXTMAX10 != null ? [ext.$EXTMAX10, ext.$EXTMAX20] : null;
  const head = ['DXF drawing' + (u ? ', units: ' + u : ', units not given'), lo && hi ? 'Extents: ' + lo.map(Number).map(x => x.toFixed(1)).join(', ') + ' to ' + hi.map(Number).map(x => x.toFixed(1)).join(', ') : '', layers.size ? 'Layers: ' + [...layers].slice(0, 80).join(', ') : '', 'Text and dimension labels (' + texts.length + '):'].filter(Boolean).join('\n');
  let out = head; for (const t of texts) { if (out.length + t.length + 1 > max) { out += '\n… (' + (texts.length - texts.indexOf(t)) + ' more labels cut)'; break; } out += '\n' + t; }
  return out;
}

// ---------- confirmed facts for the AI ----------
const f0 = v => Math.round(v).toLocaleString('en-US'), fx = v => +(+v).toFixed(2);
// one fact as a line: "Easement · 16 ft drainage easement: A 16' drainage easement runs along the north line (16 ft wide, north side)"
export function factLine(f) {
  const bits = [f.widthFt != null && f.category !== 'floor_plan' ? fx(f.widthFt) + ' ft wide' : '', f.category === 'floor_plan' && f.widthFt != null && f.depthFt != null ? fx(f.widthFt) + ' × ' + fx(f.depthFt) + ' ft' : '',
    f.category === 'floor_plan' && f.value != null ? f0(f.value) + ' sf' : '', f.beds != null ? f.beds + ' bed' : '', f.baths != null ? f.baths + ' bath' : '', f.stories != null ? f.stories + (f.stories === 1 ? ' story' : ' stories') : '',
    f.side && f.side !== 'whole' ? f.side + (f.side === 'interior' ? '' : ' side') : '', f.bearing ? f.bearing : ''].filter(Boolean);
  return (CAT_LABEL[f.category] || 'Fact') + ' · ' + f.label + ': ' + f.text + (bits.length ? ' (' + bits.join(', ') + ')' : '');
}
// the confirmed facts of a project's files, as short lines for the AI ("[survey.pdf, survey] …"), at most `max` lines
// and about `chars` characters; nothing confirmed: []
export function refsForAI(files, { max = 40, chars = 6000 } = {}) {
  const out = []; let n = 0;
  for (const fl of Array.isArray(files) ? files : []) for (const f of fl?.facts || []) {
    if (f.status !== 'ok') continue; const line = '[' + clip(fl.name, 60) + (fl.read?.kind ? ', ' + fl.read.kind.replace('_', ' ') : '') + '] ' + factLine(f) + (f.edited ? ' (corrected by the team)' : '');
    if (out.length >= max || n + line.length > chars) return out; out.push(line); n += line.length;
  }
  return out;
}
// what a request carries (the server's side): short strings only
export const refsIn = raw => (Array.isArray(raw) ? raw : []).filter(s => typeof s === 'string' && s.trim()).slice(0, 40).map(s => clip(s, 400)).reduce((a, s) => (a.n + s.length > 8000 ? a : { n: a.n + s.length, l: a.l.concat([s]) }), { n: 0, l: [] }).l;
// the block that goes after the user text of every site-plan AI call when the project has confirmed facts
export function refBlock(raw) {
  const refs = refsIn(raw); if (!refs.length) return '';
  return '\n\nReference facts the team confirmed from their own documents for this site (surveys, floor plans, earlier site plans). Treat them as true for this site: they win over typical assumptions and public map data, but never over what the request asks for. Use each where it matters (an easement or setback is kept clear, a floor plan\'s size is a home\'s size, the surveyed area is the site\'s area) and say when a layout or answer relies on one:\n- ' + refs.join('\n- ');
}

// ---------- confirmed facts the planner can use ----------
// a floor plan with its width and depth, as a building type for the team library (lib/customtypes.mjs teamTypeIn)
export function floorPlanType(f, fileName = '') {
  if (f?.category !== 'floor_plan' || !(f.widthFt >= 16 && f.widthFt <= 600) || !(f.depthFt >= 16 && f.depthFt <= 400)) return null;
  const stories = Math.max(1, Math.min(4, Math.round(f.stories || 1))), sf = f.value || null;
  return { name: clip(f.label, 60) || 'Floor plan', w: Math.round(f.widthFt), d: Math.round(f.depthFt), floors: stories, use: 'sfr', units: 1, source: 'hand',
    note: clip([sf ? f0(sf) + ' sf' : '', f.beds != null ? f.beds + ' bd' : '', f.baths != null ? f.baths + ' ba' : '', fileName ? 'from ' + fileName : ''].filter(Boolean).join(' · '), 80) };
}
// An easement along one side of the site, as a strip inside the lot: the lot line that faces that way most (the longest
// when several do), and the strip `widthFt` deep inside it. ring: the site's outline in plan feet (x east, y north);
// front: the index of the street edge (for front, rear, left, right). -> points in plan feet, or null when the side
// isn't one the lot has (interior, whole) or the width doesn't make sense for the lot.
const DIRS = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0], northeast: [Math.SQRT1_2, Math.SQRT1_2], northwest: [-Math.SQRT1_2, Math.SQRT1_2], southeast: [Math.SQRT1_2, -Math.SQRT1_2], southwest: [-Math.SQRT1_2, -Math.SQRT1_2] };
export function easementStrip(ring, side, widthFt, front = null) {
  const n = ring?.length || 0, w = +widthFt; if (n < 3 || !(w >= 2 && w <= 300)) return null;
  let s = 0; for (let i = 0, j = n - 1; i < n; j = i++) s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; const ccw = s > 0;
  const edge = i => { const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L; return { a, b, L, out: ccw ? [ty, -tx] : [-ty, tx] }; };
  let dir = DIRS[side];
  if (!dir && ['front', 'rear', 'left', 'right'].includes(side)) { if (!Number.isInteger(front) || front < 0 || front >= n) return null; const o = edge(front).out;
    dir = side === 'front' ? o : side === 'rear' ? [-o[0], -o[1]] : side === 'left' ? [-o[1], o[0]] : [o[1], -o[0]]; } // (facing the street from the site, its left is the outward normal turned a quarter left)
  if (!dir) return null;
  let best = -1, score = 0;
  for (let i = 0; i < n; i++) { const e = edge(i), dot = e.out[0] * dir[0] + e.out[1] * dir[1]; if (dot > 0.7 && e.L * dot > score) { score = e.L * dot; best = i; } }
  if (best < 0) return null;
  const e = edge(best), inn = [-e.out[0], -e.out[1]];
  let minX = Infinity, maxX = -Infinity; for (const p of ring) { const t = (p[0] - e.a[0]) * inn[0] + (p[1] - e.a[1]) * inn[1]; minX = Math.min(minX, t); maxX = Math.max(maxX, t); }
  if (w > (maxX - minX) * 0.5) return null; // wider than half the lot's depth from that side: not a strip along it
  const off = p => [+(p[0] + inn[0] * w).toFixed(2), +(p[1] + inn[1] * w).toFixed(2)];
  return [e.a.map(v => +v.toFixed(2)), e.b.map(v => +v.toFixed(2)), off(e.b), off(e.a)];
}
// an easement fact that can be drawn: its width and a side of the lot
export const placeable = f => f?.category === 'easement' && f.widthFt >= 2 && f.widthFt <= 300 && !!f.side && !['interior', 'whole'].includes(f.side);

// a project's files list from the storage listing and the project's own record: every stored file once (a file the
// record doesn't know yet joins it, unread); a recorded file storage no longer has is marked missing
export function reconcile(own, stored) {
  const have = new Map((stored || []).map(s => [s.path, s])), out = (own || []).map(f => ({ ...f, missing: stored ? !have.has(f.path) : !!f.missing }));
  for (const s of stored || []) if (!out.some(f => f.path === s.path)) { const pp = parsePath(s.path); if (pp) out.push({ id: pp.id, path: s.path, name: pp.name, size: s.size || 0, type: typeOf(pp.name)?.mime || '', at: s.at || null, by: '', read: null, facts: [] }); }
  return out;
}
