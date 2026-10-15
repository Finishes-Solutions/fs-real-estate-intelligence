// AI for site plans. The layout itself always comes from the engine in the browser (lib/sitelayout.mjs), so the
// geometry is measured, never made up by the model; the model decides what to build and judges what was drawn.
//   POST { prompt, site, facts, program }                       -> { program, setbacks, summary, assumptions }
//        the request (and what's known about the site) turned into a development program
//   POST { mode: 'review', prompt, site, facts, program, round, options: [{ name, metrics, issues, notes, image }] }
//        -> { reviews: [{ option, score, verdict, strengths, problems }], ranking, revise, program, params, why, summary }
//        the engine's options judged as a land planner would (drawings and numbers); a revised program to lay out again
//   POST { mode: 'bestuse', prompt?, site, facts, nearby, market } -> { ideas: [{ title, use, fit, why, risks, request }], summary }
//        what should go on the site, from what's known about it, each idea a request the builder can lay out
//   POST { mode: 'ask', question, history: [{ q, a }], plan: {...facts}, effort } -> { answer, followups }
//        a question about the open plan, answered from the fact sheet the browser computed (lib/planask.mjs planFacts)
// effort (program, review and ask): how hard the model thinks, 'low' | 'medium' | 'high' (the effort level picked under
// Build; Ultra sends high); missing or unknown keeps the default (high, medium for ask). review also takes rounds (1-3,
// default 2): the last round never revises.
// site: { acres, widthFt, depthFt, frontageFt, address, city, county, zoning }; facts: short lines (flood zone, roads
// and traffic, districts, utilities, environmental records).
import { chatJSON, pickModel } from '../lib/openai.mjs';
import { USES, SETBACKS, guessProgram, normalizeProgram } from '../lib/siteplan.mjs';
import { AMENITIES } from '../lib/sitecompose.mjs';
import { catalogText } from '../lib/siteedit.mjs';
import { typeById } from '../lib/buildings.mjs';
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';

let modelP = null;
const EFFORTS = ['low', 'medium', 'high'], effortIn = (v, d) => EFFORTS.includes(v) ? v : d; // OpenAI reasoning_effort, from an allow-list
const model = key => (modelP ||= pickModel(key, process.env.OPENAI_MODEL).catch(e => { modelP = null; throw e; }));

const n = description => ({ type: ['number', 'null'], description });
export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['use', 'gfa', 'floors', 'units', 'buildings', 'ratio', 'perUnit', 'depth', 'detentionPct', 'storm', 'truck', 'through', 'compare', 'trash', 'entrances', 'product', 'extras', 'setbacks', 'zones', 'summary', 'assumptions'],
  properties: {
    use: { type: 'string', enum: Object.keys(USES), description: 'Main use. other = anything that fits none of these (self storage, school…).' },
    gfa: n('Total building floor area in square feet across all floors. null when the request gives no size (the tool then uses a typical size for the use and site) or asks for as much as fits.'),
    floors: { type: ['integer', 'null'], description: 'Floors per building.' },
    units: { type: ['integer', 'null'], description: 'Dwelling units (apartments, townhomes, duplex units, homes).' },
    buildings: { type: ['integer', 'null'], description: 'Number of separate buildings, only when the request implies it (pad sites, apartment bars). null = let the layout decide.' },
    ratio: n('Parking spaces per 1,000 sq ft of floor area (non-residential).'),
    perUnit: n('Parking spaces per dwelling unit (multifamily; townhomes and homes: in their garages).'),
    depth: n('Building depth in feet (front to back), only if the request implies it.'),
    detentionPct: n('Share of the site for a detention pond, percent, only when the request names one. null = sized from the storage the developed land needs.'),
    storm: { type: ['string', 'null'], enum: ['detention', 'retention', 'underground', 'none', null], description: 'Stormwater: detention (a dry basin, the usual), retention (a wet pond with a permanent pool), underground (vaults under the parking, no pond), none (a regional facility or a small site). null = detention on sites over an acre.' },
    truck: { type: ['boolean', 'null'], description: 'Truck court / loading behind the building.' },
    through: { type: ['boolean', 'null'], description: 'A second, pull-through access out to a side street, when the request asks for one.' },
    compare: { type: ['boolean', 'null'], description: 'true when they ask for multifamily or rental housing in general without naming the product: the planner then lays out garden apartments, studio/1-bed apartments, townhomes and duplexes and ranks them by value. false when they name one (apartments, townhomes...).' },
    trash: { type: ['boolean', 'null'], description: 'Trash enclosures (dumpsters) drawn on the plan: true only when the request asks for them; they are left off otherwise.' },
    entrances: { type: ['integer', 'null'], description: 'How many driveways in from the street(s) when the request says ("two entrances", "a second entrance"); null for the usual one. Extra ones go on the front or a side street, about 150 ft apart.' },
    extras: { type: 'array', items: { type: 'string', enum: ['patio', 'playground', 'lawn', 'drivethru'] }, description: 'Small things asked for beside a single main use: outdoor seating (patio), a playground, a lawn or grass area, a drive-thru. Empty when none.' },
    product: { type: ['string', 'null'], enum: ['lots', 'court', 'court6', null], description: 'Townhomes and duplexes only: lots = homes on their own lots along a new street; court6 = six-unit two-story townhome rows on a shared parking court (one tract, usually rental); court = two-unit duplex buildings on a shared parking court. null = the tool picks by what fits.' },
    setbacks: { type: 'object', additionalProperties: false, required: ['front', 'side', 'rear', 'paving'], description: 'Feet. null keeps the default.',
      properties: { front: n('Building setback from the street.'), side: n('Side setback.'), rear: n('Rear setback.'), paving: n('Landscape buffer between paving and the lot lines.') } },
    zones: { type: 'array', description: 'Mixed use only: 2 to 5 zones from the street back (commercial in front, amenity/commons in the middle, apartments, then townhomes, then duplexes/cottages at the back). Empty for a single use.',
      items: { type: 'object', additionalProperties: false, required: ['use', 'gfa', 'units', 'floors', 'buildings', 'pads', 'items', 'name'], properties: {
        use: { type: 'string', enum: [...Object.keys(USES), 'garage'], description: 'garage: a parking garage at this point in the order (floors = levels).' }, gfa: n('Floor area for commercial uses, sq ft.'), units: { type: ['integer', 'null'], description: 'Homes in this zone (apartments, townhomes, duplex units).' },
        floors: { type: ['integer', 'null'] }, buildings: { type: ['integer', 'null'] }, pads: { type: ['integer', 'null'], description: 'Pad sites at the street (restaurants, coffee) for a retail zone, 0-4.' },
        items: { type: 'array', items: { type: 'string', enum: AMENITIES }, description: 'For an amenity zone: what it holds (lake = wet detention).' }, name: { type: ['string', 'null'], description: 'A short zone name, e.g. "Retail", "Commons".' } } } },
    summary: { type: 'string', description: 'One sentence: what will be laid out, in plain words.' },
    assumptions: { type: 'array', items: { type: 'string' }, description: 'Up to 4 short assumptions you made that the user may want to change.' }
  }
};

export const SYSTEM = `You set up a development program for a site-planning tool used by a commercial construction company in the Houston region. A separate layout engine places the buildings, parking, drives and detention on the parcel; you only choose the numbers.
- Follow the user's request. Fill gaps with typical suburban Houston-area practice: retail 4 spaces/1,000 sf, restaurant 10/1,000, office 3.5/1,000, medical office 5/1,000, hotel 1 space a room (about 550 sf a room, 1.82/1,000), church about 1 space for 3 seats (10/1,000), warehouse 0.5-1/1,000 plus a truck court, multifamily about 1.6 spaces per unit and 3 floors, about 900 sf per unit, townhomes 2 in the garage plus a quarter guest space a home. Ratios over 15/1,000 are capped at 15. Don't raise the defaults without a reason in the request: over-parking wastes land.
- The City of Houston has no zoning; building lines are usually 25 ft on major roads and 10 ft on local streets. Other cities and counties differ. If zoning limits are given, stay within them.
- Size the program to the site: check floor area and parking against the acreage given. If the request clearly can't fit, keep the use, set gfa to null and say so in assumptions.
- Mixed use (several uses on one site): fill zones from the street back, give each its size (floor area or units) when you can, and set the top-level use to the front zone's use. A single use: zones is empty.
- A number of buildings ("4 buildings", "two pads") goes in buildings, with gfa the total across them. Stormwater: retention when they ask for a wet pond or lake, underground when they ask for vaults or no pond, none for regional detention.
- Townhomes and duplexes: homes on their own lots with a public street fit about 6-10 units an acre; denser than that, use product court6 (or court), rows on a shared parking court, rather than cutting the count.
- A neighbourhood, subdivision or "residential" with no count: a zone of use sfr with units null; it fills whatever land the other zones leave. Give sized zones (shops, apartments) their sizes; a community center or commons is an amenity zone (items may include center, pool, playground, pavilion, courts, lake), placed last when they say "at the back". Apartments of 80+ units already get their own clubhouse and pool by the entry: don't add a center or pool to a commons beside them unless for-sale homes (sfr, townhomes, duplexes) share it; one pool per community. A pool always comes with its center.
- Feasibility: one-story shops or restaurants with surface parking hold about 9,000-12,000 sq ft an acre; two-story offices about 14,000; garden apartments about 18-24 units an acre; homes on lots 4-6 an acre. If the ask is bigger than the land, still give the ask: the layout fits the most that works and says so.
- Small extras with one main use (outdoor seating, a playground, a lawn, a drive-thru) go in extras, not in zones. "A single" building means buildings 1.
- The goal is the most valuable plan the site holds within the rules and the market. Sizes you give are the first phase: the engine fills land left over with more of the same (more homes, longer shop and office buildings, more warehouse) up to what the parking and stormwater allow, so don't shrink a request to leave land empty. Don't add uses they didn't ask for.
- A parking garage: a zone of use "garage" (floors = levels, usually 4-5) where they want it in the order ("a parking garage behind the offices"); offer one for dense offices, medical or shops on tight land. Industrial, warehouse, flex and storage are use "industrial" (a truck court goes behind them), never homes.
- Housing asked for in general ("multifamily", "rental housing", "build-to-rent") with no product named: use multifamily with compare true; the engine lays out garden apartments, studio/1-bed apartments, townhomes and duplexes and ranks them by value. When they name a product, use it.
- Trash enclosures only when they ask for them (trash true).
- Never claim code compliance. Assumptions are short phrases, e.g. "4 spaces per 1,000 sf (typical retail)".`;

const factsOf = facts => (Array.isArray(facts) ? facts : []).slice(0, 14).map(t => clip(t, 300)).filter(Boolean);
export function siteText(site = {}, prompt = '', program = null, facts = null) {
  const s = site || {}, f = v => v == null || v === '' ? null : String(v).slice(0, 200);
  const z = s.zoning && typeof s.zoning === 'object' ? Object.fromEntries(Object.entries(s.zoning).filter(([, v]) => v != null && v !== '').slice(0, 12).map(([k, v]) => [k, String(v).slice(0, 120)])) : null;
  return JSON.stringify({ request: clip(prompt, 1200), site: { acres: +s.acres || null, approxWidthFt: +s.widthFt || null, approxDepthFt: +s.depthFt || null, streetFrontageFt: +s.frontageFt || null,
    address: f(s.address), city: f(s.city), county: f(s.county), zoning: z, facts: factsOf(facts) }, currentProgram: program || null });
}

// the model's program, made safe: unknown values dropped, the words' own reading filling gaps, zones normalized
function programFrom(d, prompt) {
  const program = { ...normalizeProgram({ ...guessProgram(prompt), ...Object.fromEntries(Object.entries(d).filter(([k, v]) => v != null && !['setbacks', 'summary', 'assumptions', 'zones'].includes(k))) }), ...(d.gfa == null && d.units == null ? { gfa: null } : {}) };
  const guess = guessProgram(prompt), zs = d.zones?.length > 1 ? d.zones : guess.zones; // the model's zones, else the ones read from the words
  if (zs?.length > 1) { const nz = normalizeProgram({ use: zs[0].use, zones: zs }).zones; program.zones = nz; program.use = nz[0].use; }
  return program;
}
const PROG = Object.fromEntries(Object.entries(SCHEMA.properties).filter(([k]) => !['summary', 'assumptions'].includes(k)));
const str = description => ({ type: 'string', description }), strs = description => ({ type: 'array', items: { type: 'string' }, description });
export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reviews', 'ranking', 'revise', 'program', 'params', 'why', 'summary'],
  properties: {
    reviews: { type: 'array', description: 'One per option, in the order given.', items: { type: 'object', additionalProperties: false, required: ['option', 'score', 'verdict', 'strengths', 'problems'], properties: {
      option: { type: 'integer', description: 'The option number given (0-based).' }, score: { type: 'integer', description: '0-100: how well it does what was asked and how buildable and marketable it is.' },
      verdict: str('One plain sentence a developer would say about it.'), strengths: strs('Up to 3, concrete.'), problems: strs('Up to 4, concrete and fixable where possible (what is wrong and where on the plan).') } } },
    ranking: { type: 'array', items: { type: 'integer' }, description: 'Option numbers, best first.' },
    revise: { type: 'boolean', description: 'True when a changed program would clearly give a better plan; false when the best option is good enough (or on the last round).' },
    program: { type: 'object', additionalProperties: false, required: Object.keys(PROG), properties: PROG, description: 'The full program to lay out next when revise is true (the current one, changed); when revise is false, repeat the current program.' },
    params: { type: 'object', additionalProperties: false, required: ['fill', 'streets', 'form', 'storm'], description: 'Layout settings to change with the revised program; null keeps the setting.', properties: {
      fill: { type: ['boolean', 'null'], description: 'Fill the leftover land with more of the same buildings (Phase 2).' }, streets: { type: ['string', 'null'], enum: ['curved', 'straight', null], description: 'Neighbourhood streets.' },
      form: { type: ['string', 'null'], enum: ['bar', 'L', 'U', 'tower', null], description: 'Building shape for apartments and offices.' }, storm: { type: ['string', 'null'], enum: ['detention', 'retention', 'underground', 'none', null], description: 'Stormwater.' } } },
    why: str('When revising: what the change fixes, in one sentence. Otherwise empty.'),
    summary: str('Two or three sentences for the user: which option is best and why, and what to watch for.')
  }
};
export const REVIEW_SYSTEM = `You are a senior land planner and developer reviewing concept site plans. A layout engine drew the options from a development program; you see each one as a drawing (north is up on the sheet; the street side is labelled MAIN ENTRY; buildings are brown or tan, paving grey, ponds blue, lawns green) with its numbers and the rule checks.
- The goal is the most valuable plan that fits the rules and the market: the most leasable floor area or homes the land, parking and stormwater allow (valueM, costM and yieldOnCostPct use the pro forma's default assumptions; compare options on them, don't treat them as an appraisal). Land left as lawn, empty rows, oversized lots or surplus parking is lost value.
- Judge each against the user's request first, then as a buildable, leasable or sellable project: access from the street and a second way out where needed, parking next to the doors it serves, buildings that face and are seen from the street, truck and trash access, sensible drive aisles (no long dead ends), detention that isn't in the way, open space that's usable rather than leftover, phasing, amenities where people use them (the clubhouse and its pool by the entry and the homes they serve, never a second pool or a lone amenity out behind the buildings or by the pond), density for the market.
- Be concrete: say what is wrong and where ("the restaurant sits 200 ft from its parking", "half the frontage is lawn").
- You can't move pieces: you change the program the engine lays out (use, sizes, units, buildings, floors, parking ratio, product, zones and their order and sizes, extras, stormwater) and a few settings (fill the site, curving streets, building shape). Revise only when that would clearly make a better plan, e.g. the options waste land, miss what was asked, or are infeasible; keep what was asked unless it can't work.
- Scores: 85+ ready to show a client; 70-84 good with small fixes; 50-69 workable but weak; below 50 misses the request or doesn't work.
- Never claim code compliance; these are concepts.`;
export const BESTUSE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ideas', 'summary'],
  properties: {
    ideas: { type: 'array', description: '3 to 5 ideas, best fit first.', items: { type: 'object', additionalProperties: false, required: ['title', 'use', 'fit', 'why', 'risks', 'request'], properties: {
      title: str('A short name, e.g. "Garden apartments, about 240 units".'), use: { type: 'string', enum: Object.keys(USES) }, fit: { type: 'integer', description: '0-100: how well it suits this site and market.' },
      why: str('Two or three sentences on why it fits, citing the site facts and surroundings given.'), risks: strs('Up to 3 things to check (floodplain, utilities, traffic, competition, zoning).'),
      request: str('The request to give the site planner, as a user would type it, with sizes, e.g. "240 garden apartments, 3 stories, clubhouse and pool, retail pad at the corner".') } } },
    summary: str('Two sentences: the strongest direction and the main thing to verify first.')
  }
};
export const BESTUSE_SYSTEM = `You advise a commercial construction company in the Houston region on what to build on a site (highest and best use, at concept level). You get the site's size and shape, its street frontage, what the app knows about it (flood zone, roads and traffic counts, utility districts and lines, environmental records, schools, opportunity zones), nearby businesses and services with distances, and local market numbers where known.
- Recommend 3 to 5 distinct uses that are physically, legally and financially plausible here, best first. Size each to the land: one-story retail or restaurants about 9,000-12,000 sq ft an acre with parking, two-story office about 14,000, garden apartments 18-24 units an acre, townhomes 10-14, homes on lots 4-6, warehouses about 0.4 FAR.
- Use the facts: frontage on a busy road favours retail, restaurants and services; deep land behind favours apartments, homes or industrial; a floodplain means fill and detention; no utility district means septic or a package plant; gaps in nearby services (no grocery for miles, few restaurants) are opportunities; many of the same nearby is competition.
- Be honest about uncertainty: these are starting points, not a market study. Never claim code compliance.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 12, perDay: 400 })) return;
  const key = needKey(res); if (!key) return;
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (b.mode === 'review') return review(b, key, res);
  if (b.mode === 'bestuse') return bestUse(b, key, res);
  if (b.mode === 'edit') return edit(b, key, res);
  if (b.mode === 'ask') return ask(b, key, res);
  const prompt = clip(b.prompt, 1200).trim(); if (!prompt) return res.status(400).json({ error: 'Say what to build, e.g. "25,000 sf retail strip".' });
  try {
    const r = await chatJSON({ key, model: await model(key), system: SYSTEM, user: siteText(b.site, prompt, b.program, b.facts), name: 'site_program', schema: SCHEMA, maxTokens: 16000, effort: effortIn(b.effort, 'high') }); // it may think for a while: a better program is worth the wait (the layout itself runs in the browser)
    const d = r.data, sb = Object.fromEntries(Object.entries(d.setbacks || {}).filter(([, v]) => v != null && v >= 0 && v <= 300)), program = programFrom(d, prompt);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ program, setbacks: { ...SETBACKS, ...sb }, summary: clip(d.summary, 400), assumptions: (d.assumptions || []).slice(0, 4).map(a => clip(a, 200)) });
  } catch (e) {
    console.error('siteplan', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now. Try again, or build without AI.' });
  }
}

// the engine's options, judged on their drawings and numbers; a revised program when one would clearly do better
const num = v => Number.isFinite(+v) ? +v : null;
async function review(b, key, res) {
  const rounds = Math.max(1, Math.min(3, Math.round(+b.rounds) || 2)), round = Math.max(1, Math.round(+b.round) || 1), last = round >= rounds; // Medium: one round (no revise); Ultra: up to three
  const prompt = clip(b.prompt, 1200).trim(), opts = (Array.isArray(b.options) ? b.options : []).slice(0, 6);
  if (!opts.length) return res.status(400).json({ error: 'Nothing to review.' });
  const images = opts.map(o => typeof o.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(o.image) && o.image.length < 600000 ? o.image : null);
  const text = JSON.stringify({ request: prompt || null, round: last ? 'last (do not revise)' : round === 1 ? 'first' : round + ' of ' + rounds + ' (revise again only if it clearly helps)', site: JSON.parse(siteText(b.site, '', null, b.facts)).site, currentProgram: b.program || null,
    options: opts.map((o, i) => ({ option: i, name: clip(o.name, 120), drawing: images[i] ? 'image ' + (images.slice(0, i + 1).filter(Boolean).length) : 'none', metrics: Object.fromEntries(Object.entries(o.metrics || {}).slice(0, 16).map(([k, v]) => [clip(k, 30), num(v)])),
      issues: (o.issues || []).slice(0, 8).map(t => clip(t, 160)), notes: (o.notes || []).slice(0, 6).map(t => clip(t, 240)) })) });
  try {
    const r = await chatJSON({ key, model: await model(key), system: REVIEW_SYSTEM, user: text, name: 'site_review', schema: REVIEW_SCHEMA, maxTokens: 20000, effort: effortIn(b.effort, 'high'), images: images.filter(Boolean) });
    const d = r.data, n = opts.length, ok = i => Number.isInteger(i) && i >= 0 && i < n;
    const ranking = [...new Set((d.ranking || []).filter(ok))]; for (let i = 0; i < n; i++) if (!ranking.includes(i)) ranking.push(i);
    const reviews = (d.reviews || []).filter(x => ok(x.option)).map(x => ({ option: x.option, score: Math.max(0, Math.min(100, Math.round(+x.score || 0))), verdict: clip(x.verdict, 300), strengths: (x.strengths || []).slice(0, 3).map(t => clip(t, 200)), problems: (x.problems || []).slice(0, 4).map(t => clip(t, 220)) }));
    const revise = !last && !!d.revise, p = d.params || {};
    const params = Object.fromEntries(Object.entries({ fill: typeof p.fill === 'boolean' ? p.fill : null, streets: ['curved', 'straight'].includes(p.streets) ? p.streets : null, form: ['bar', 'L', 'U', 'tower'].includes(p.form) ? p.form : null, storm: ['detention', 'retention', 'underground', 'none'].includes(p.storm) ? p.storm : null }).filter(([, v]) => v != null));
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ reviews, ranking, revise, program: revise ? programFrom(d.program || {}, prompt) : null, params: revise ? params : {}, why: revise ? clip(d.why, 300) : '', summary: clip(d.summary, 600) });
  } catch (e) {
    console.error('siteplan review', e.message);
    return res.status(502).json({ error: 'The AI review didn’t answer just now; the options stand as the engine ranked them.' });
  }
}

// what should go here: ideas from the site, its surroundings and the market, each a request the builder can lay out
async function bestUse(b, key, res) {
  const s = JSON.parse(siteText(b.site, b.prompt || '', null, b.facts));
  const nearby = Object.fromEntries(Object.entries(b.nearby && typeof b.nearby === 'object' ? b.nearby : {}).slice(0, 14).map(([k, v]) => [clip(k, 30), (Array.isArray(v) ? v : []).slice(0, 4).map(x => ({ name: clip(x?.name, 80), miles: num(x?.miles) }))]));
  const market = Object.fromEntries(Object.entries(b.market && typeof b.market === 'object' ? b.market : {}).slice(0, 12).map(([k, v]) => [clip(k, 40), typeof v === 'number' ? v : clip(v, 160)]));
  try {
    const r = await chatJSON({ key, model: await model(key), system: BESTUSE_SYSTEM, user: JSON.stringify({ goal: s.request || null, site: s.site, nearby, market }), name: 'site_best_use', schema: BESTUSE_SCHEMA, maxTokens: 16000, effort: 'high' });
    const d = r.data, ideas = (d.ideas || []).slice(0, 5).map(x => ({ title: clip(x.title, 120), use: USES[x.use] ? x.use : 'other', fit: Math.max(0, Math.min(100, Math.round(+x.fit || 0))), why: clip(x.why, 600), risks: (x.risks || []).slice(0, 3).map(t => clip(t, 200)), request: clip(x.request, 400) })).filter(x => x.request);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ideas, summary: clip(d.summary, 500) });
  } catch (e) {
    console.error('siteplan best use', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now. Try again in a moment.' });
  }
}

// ---------- changes to a laid-out plan, by name ----------
const nul = (t, extra = {}) => ({ type: [t, 'null'], ...extra });
export const EDIT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ops', 'refit', 'summary', 'question'],
  properties: {
    ops: { type: 'array', description: 'The edits, in order.', items: { type: 'object', additionalProperties: false, required: ['action', 'target', 'with', 'type', 'kind', 'use', 'name', 'floors', 'units', 'w', 'd', 'x', 'y', 'turn'], properties: {
      action: { type: 'string', enum: ['change', 'remove', 'add', 'move', 'swap'] },
      target: nul('string', { description: 'id of the piece to change, remove, move or swap (null for add).' }),
      with: nul('string', { description: 'swap: the other piece. add / move: a piece to put it beside (when no x, y).' }),
      type: nul('string', { description: 'A building type id from the library: the building it becomes (change) or the one added (add).' }),
      kind: nul('string', { enum: ['building', 'pool', 'play', 'court', 'green', 'plaza', 'pond', 'garage', 'patio', 'entrance', null], description: 'add without a library type: what kind of piece. entrance: a driveway in from the street at x, y (a point on the lot line, y about 0 for the front), or with no x, y where it helps most.' }),
      use: nul('string', { enum: [...Object.keys(USES), null] }), name: nul('string'),
      floors: nul('integer'), units: nul('integer'), w: nul('number', { description: 'feet across its front' }), d: nul('number', { description: 'feet deep' }),
      x: nul('number', { description: 'where its centre goes: feet across the frontage from the street’s left end, as on the drawing' }), y: nul('number', { description: 'feet back from the street' }),
      turn: nul('number', { description: 'its angle on the drawing in degrees (0 = its long side along the street, 90 = running back from it)' }) } } },
    refit: { type: 'string', enum: ['none', 'full'], description: 'none: change just these pieces; parking under them gives way and comes back where they leave (the usual). full: also lay out everything else again around them (when the user asks for a re-fit or re-layout, or after adding or removing several buildings, or moving one into land without drives).' },
    summary: { type: 'string', description: 'One or two sentences on what you changed, for the user.' },
    question: nul('string', { description: 'Only when you can’t tell what they mean: one short question (and no ops).' })
  }
};
export const EDIT_SYSTEM = `You edit a concept site plan the way a land planner would, from the user's words. You get the plan as a list of pieces (id, name, kind, use, centre "at" [x, y] in feet, size [across, deep], turn in degrees, floors, units, library type), its totals, the selected piece if any, a drawing (street along the bottom; x across the frontage from the street's left end, y back from the street) and the building library (type id = name).
- Answer with edits on those pieces, by id. "it", "this" or "this building" is the selected piece. Names like "Bldg 7" match "Apt Bldg 7".
- change: give only what changes (floors, units, a library type, a size, a use, a name, a turn, or x, y to move it too). Prefer a library type that fits the spot when a building becomes something else ("make it a 7,500 sf clubhouse", "a 3-story corridor building"); keep its footprint near the old one unless they ask for bigger.
- move: x, y for its new centre (or "with" to put it beside another piece). Keep buildings off drives and other buildings; a pool goes beside its clubhouse; amenities go by the drive and the homes they serve, never out alone by a pond.
- add: a library type (or a kind with a size) at x, y or beside "with". remove: the piece (its pool, patio or drive-thru go with it).
- swap: two pieces trade places.
- Entrances: add kind "entrance" at a point on the lot line where they want it (y = 0 is the front street; a side lot line becomes a street), or without x, y to put it where it helps most; remove one by its id. Driveways want about 150 ft between them and a clear line in to a drive.
- More floors on apartments add units; give units only when they name a number.
- If they ask for something the plan can't hold (no room, outside the setbacks), do the nearest sensible thing and say so in the summary.
- refit: "none" unless they ask for the site to re-fit or re-lay, or the change needs new drives and parking (a building added in open land, several buildings removed); then "full".
- Never invent ids. If it's unclear which piece they mean, ask one short question instead.`;
const opt = v => v == null || v === '' ? null : num(v); // a number that may be left out (null stays null, not 0)
async function edit(b, key, res) {
  const prompt = clip(b.prompt, 1200).trim(), plan = b.plan && typeof b.plan === 'object' ? b.plan : null; if (!prompt || !plan) return res.status(400).json({ error: 'Say what to change.' });
  const pieces = (Array.isArray(plan.pieces) ? plan.pieces : []).slice(0, 500).map(p => ({ id: clip(p.id, 40), name: clip(p.name, 60), kind: clip(p.kind, 20), use: p.use ? clip(p.use, 20) : null, at: Array.isArray(p.at) ? p.at.slice(0, 2).map(num) : null, size: Array.isArray(p.size) ? p.size.slice(0, 2).map(num) : null, turn: num(p.turn), floors: num(p.floors), units: num(p.units), type: p.type ? clip(p.type, 90) : null, note: p.note ? clip(p.note, 80) : null, ...(p.selected ? { selected: true } : {}), ...(p.pinned ? { pinned: true } : {}) }));
  const ids = new Set(pieces.map(p => p.id)), image = typeof b.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(b.image) && b.image.length < 600000 ? b.image : null;
  const text = JSON.stringify({ request: prompt, site: { ...JSON.parse(siteText(b.site, '', null, null)).site, ...(plan.site || {}) }, totals: plan.totals || null, parking: plan.parking || null, houses: plan.houses ? clip(plan.houses, 80) : undefined, selected: pieces.find(p => p.selected)?.id || null, pieces }) + '\n\nBuilding library (type id = name):\n' + catalogText();
  try {
    const r = await chatJSON({ key, model: await model(key), system: EDIT_SYSTEM, user: text, name: 'site_edit', schema: EDIT_SCHEMA, maxTokens: 16000, effort: 'high', images: image ? [image] : [] });
    const d = r.data, kinds = new Set(['building', 'pool', 'play', 'court', 'green', 'plaza', 'pond', 'garage', 'patio', 'entrance']);
    const ops = (d.ops || []).slice(0, 30).filter(o => ['change', 'remove', 'add', 'move', 'swap'].includes(o.action) && (o.action === 'add' || ids.has(o.target)) && (o.action !== 'swap' || ids.has(o.with))).map(o => ({
      action: o.action, target: ids.has(o.target) ? o.target : null, with: ids.has(o.with) ? o.with : null, type: o.type && typeById(o.type) ? o.type : null, kind: kinds.has(o.kind) ? o.kind : null, use: USES[o.use] ? o.use : null, name: o.name ? clip(o.name, 60) : null,
      floors: Number.isInteger(o.floors) && o.floors >= 1 && o.floors <= 60 ? o.floors : null, units: Number.isInteger(o.units) && o.units >= 1 && o.units <= 2000 ? o.units : null, w: num(o.w) > 4 && o.w < 2000 ? +o.w : null, d: num(o.d) > 4 && o.d < 2000 ? +o.d : null, x: opt(o.x), y: opt(o.y), turn: opt(o.turn) }));
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ops, refit: d.refit === 'full' ? 'full' : 'none', summary: clip(d.summary, 500), question: ops.length ? null : clip(d.question || '', 300) || null });
  } catch (e) {
    console.error('siteplan edit', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now.' });
  }
}

// ---------- questions about the open plan ----------
export const ASK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['answer', 'followups'],
  properties: {
    answer: str('The answer, in plain words: two to five sentences, or a short list (lines starting "- ") for a breakdown.'),
    followups: strs('Up to 3 short questions the user might ask next about this plan, answerable from the same facts, in their words. Empty when none.')
  }
};
export const ASK_SYSTEM = `You are a land planner and development analyst explaining one concept site plan to the person who made it, in a site-planning tool used by a commercial construction company in the Houston region. You get a fact sheet the tool computed for the plan on the screen: the site and zoning, the request and the program it was read as, setbacks, the totals, parking needed and provided with the rule each use is counted by, the stormwater storage needed and what the ponds hold, the checks, the pieces with where they sit (at = [feet across the frontage from the street's left end, feet back from the street]), the pro forma's numbers and assumptions, and notes from the last build (how the request was read, the layout engine's notes, the AI review).
- Answer the question about THIS plan from those facts, and explain the why: the rule or number that drives it, with the arithmetic when it helps ("25,000 sq ft of retail at 4 spaces per 1,000 sq ft = 100 spaces").
- Use only the facts given. Never invent numbers, codes, costs or reasons. When the facts don't say (why a piece sits where it does, a city's own requirement), say plainly that the plan doesn't record it, then give what the facts do show and what would settle it (the city's code, a survey, a civil engineer, a market study).
- Parking ratios, the 0.55 acre-feet a developed acre of storage and the pro forma's numbers are typical starting assumptions in this tool, not a city's requirement or a quote: say so when it matters, and where to change them (Settings, the Pro forma assumptions, Change with AI).
- Short and plain, as you'd say it to a developer: two to five sentences, or a short list. No headings, no markdown beyond "- " list lines. Never claim code compliance; this is a concept.
- If the question isn't about this plan or site, say briefly that you can only answer about the plan that's open.`;
// the fact sheet as sent: plain values only, strings, arrays and depth kept short
function tidy(v, d = 0) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return clip(v, 700);
  if (d >= 6 || typeof v !== 'object') return null;
  if (Array.isArray(v)) return v.slice(0, 80).map(x => tidy(x, d + 1));
  return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [clip(k, 48), tidy(x, d + 1)]));
}
async function ask(b, key, res) {
  const question = clip(b.question, 600).trim(), plan = b.plan && typeof b.plan === 'object' && !Array.isArray(b.plan) ? tidy(b.plan) : null;
  if (!question) return res.status(400).json({ error: 'Ask a question about the plan.' });
  if (!plan) return res.status(400).json({ error: 'Open a plan first.' });
  let facts = JSON.stringify(plan); if (facts.length > 48000 && Array.isArray(plan.pieces)) { plan.pieces = plan.pieces.slice(0, 25); facts = JSON.stringify(plan); }
  if (facts.length > 60000) facts = facts.slice(0, 60000); // still too big: cut (the model reads what's there)
  const history = (Array.isArray(b.history) ? b.history : []).slice(-6).map(t => ({ q: clip(t?.q, 600), a: clip(t?.a, 1500) })).filter(t => t.q && t.a);
  const user = 'Fact sheet for the plan on the screen:\n' + facts + (history.length ? '\n\nEarlier in this conversation:\n' + history.map(t => 'Q: ' + t.q + '\nA: ' + t.a).join('\n\n') : '') + '\n\nQuestion: ' + question;
  try {
    const r = await chatJSON({ key, model: await model(key), system: ASK_SYSTEM, user, name: 'plan_answer', schema: ASK_SCHEMA, maxTokens: 12000, effort: effortIn(b.effort, 'medium') });
    const d = r.data, answer = clip(d.answer, 2400).trim();
    if (!answer) throw new Error('empty answer');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ answer, followups: (d.followups || []).map(t => clip(t, 160).trim()).filter(Boolean).slice(0, 3) });
  } catch (e) {
    console.error('siteplan ask', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now. Try again in a moment.' });
  }
}
