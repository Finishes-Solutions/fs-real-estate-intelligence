// AI for site plans. The layout itself always comes from the engine in the browser (lib/sitelayout.mjs), so the
// geometry is measured, never made up by the model; the model decides what to build and judges what was drawn.
//   POST { prompt, site, facts, program }                       -> { program, setbacks, summary, assumptions }
//        the request (and what's known about the site) turned into a development program
//   POST { mode: 'review', prompt, site, facts, program, round, options: [{ name, metrics, issues, notes, image }] }
//        -> { reviews: [{ option, score, verdict, strengths, problems }], ranking, revise, program, params, why, summary }
//        the engine's options judged as a land planner would (drawings and numbers); a revised program to lay out again
//   POST { mode: 'bestuse', prompt?, site, facts, nearby, market } -> { ideas: [{ title, use, fit, why, risks, request }], summary }
//        what should go on the site, from what's known about it, each idea a request the builder can lay out
// site: { acres, widthFt, depthFt, frontageFt, address, city, county, zoning }; facts: short lines (flood zone, roads
// and traffic, districts, utilities, environmental records).
import { chatJSON, pickModel } from '../lib/openai.mjs';
import { USES, SETBACKS, guessProgram, normalizeProgram } from '../lib/siteplan.mjs';
import { AMENITIES } from '../lib/sitecompose.mjs';
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';

let modelP = null;
const model = key => (modelP ||= pickModel(key, process.env.OPENAI_MODEL).catch(e => { modelP = null; throw e; }));

const n = description => ({ type: ['number', 'null'], description });
export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['use', 'gfa', 'floors', 'units', 'buildings', 'ratio', 'perUnit', 'depth', 'detentionPct', 'storm', 'truck', 'through', 'product', 'extras', 'setbacks', 'zones', 'summary', 'assumptions'],
  properties: {
    use: { type: 'string', enum: Object.keys(USES), description: 'Main use. other = anything that fits none of these (self storage, church, school, hotel…).' },
    gfa: n('Total building floor area in square feet across all floors. null when the request gives no size (the tool then uses a typical size for the use and site) or asks for as much as fits.'),
    floors: { type: ['integer', 'null'], description: 'Floors per building.' },
    units: { type: ['integer', 'null'], description: 'Dwelling units (apartments, townhomes, duplex units, homes).' },
    buildings: { type: ['integer', 'null'], description: 'Number of separate buildings, only when the request implies it (pad sites, apartment bars). null = let the layout decide.' },
    ratio: n('Parking spaces per 1,000 sq ft of floor area (non-residential).'),
    perUnit: n('Parking spaces per dwelling unit (multifamily).'),
    depth: n('Building depth in feet (front to back), only if the request implies it.'),
    detentionPct: n('Share of the site for a detention pond, percent, only when the request names one. null = sized from the storage the developed land needs.'),
    storm: { type: ['string', 'null'], enum: ['detention', 'retention', 'underground', 'none', null], description: 'Stormwater: detention (a dry basin, the usual), retention (a wet pond with a permanent pool), underground (vaults under the parking, no pond), none (a regional facility or a small site). null = detention on sites over an acre.' },
    truck: { type: ['boolean', 'null'], description: 'Truck court / loading behind the building.' },
    through: { type: ['boolean', 'null'], description: 'A second, pull-through access out to a side street, when the request asks for one.' },
    extras: { type: 'array', items: { type: 'string', enum: ['patio', 'playground', 'lawn', 'drivethru'] }, description: 'Small things asked for beside a single main use: outdoor seating (patio), a playground, a lawn or grass area, a drive-thru. Empty when none.' },
    product: { type: ['string', 'null'], enum: ['lots', 'court', 'court6', null], description: 'Townhomes and duplexes only: lots = homes on their own lots along a new street; court6 = six-unit two-story townhome rows on a shared parking court (one tract, usually rental); court = two-unit duplex buildings on a shared parking court. null = the tool picks by what fits.' },
    setbacks: { type: 'object', additionalProperties: false, required: ['front', 'side', 'rear', 'paving'], description: 'Feet. null keeps the default.',
      properties: { front: n('Building setback from the street.'), side: n('Side setback.'), rear: n('Rear setback.'), paving: n('Landscape buffer between paving and the lot lines.') } },
    zones: { type: 'array', description: 'Mixed use only: 2 to 5 zones from the street back (commercial in front, amenity/commons in the middle, apartments, then townhomes, then duplexes/cottages at the back). Empty for a single use.',
      items: { type: 'object', additionalProperties: false, required: ['use', 'gfa', 'units', 'floors', 'buildings', 'pads', 'items', 'name'], properties: {
        use: { type: 'string', enum: Object.keys(USES) }, gfa: n('Floor area for commercial uses, sq ft.'), units: { type: ['integer', 'null'], description: 'Homes in this zone (apartments, townhomes, duplex units).' },
        floors: { type: ['integer', 'null'] }, buildings: { type: ['integer', 'null'] }, pads: { type: ['integer', 'null'], description: 'Pad sites at the street (restaurants, coffee) for a retail zone, 0-4.' },
        items: { type: 'array', items: { type: 'string', enum: AMENITIES }, description: 'For an amenity zone: what it holds (lake = wet detention).' }, name: { type: ['string', 'null'], description: 'A short zone name, e.g. "Retail", "Commons".' } } } },
    summary: { type: 'string', description: 'One sentence: what will be laid out, in plain words.' },
    assumptions: { type: 'array', items: { type: 'string' }, description: 'Up to 4 short assumptions you made that the user may want to change.' }
  }
};

export const SYSTEM = `You set up a development program for a site-planning tool used by a commercial construction company in the Houston region. A separate layout engine places the buildings, parking, drives and detention on the parcel; you only choose the numbers.
- Follow the user's request. Fill gaps with typical suburban Houston-area practice: retail 4 spaces/1,000 sf, restaurant 10/1,000, office 3.5/1,000, medical office 5/1,000, warehouse 0.5-1/1,000 plus a truck court, multifamily about 1.6 spaces per unit and 3 floors, about 900 sf per unit.
- The City of Houston has no zoning; building lines are usually 25 ft on major roads and 10 ft on local streets. Other cities and counties differ. If zoning limits are given, stay within them.
- Size the program to the site: check floor area and parking against the acreage given. If the request clearly can't fit, keep the use, set gfa to null and say so in assumptions.
- Mixed use (several uses on one site): fill zones from the street back, give each its size (floor area or units) when you can, and set the top-level use to the front zone's use. A single use: zones is empty.
- A number of buildings ("4 buildings", "two pads") goes in buildings, with gfa the total across them. Stormwater: retention when they ask for a wet pond or lake, underground when they ask for vaults or no pond, none for regional detention.
- Townhomes and duplexes: homes on their own lots with a public street fit about 6-10 units an acre; denser than that, use product court6 (or court), rows on a shared parking court, rather than cutting the count.
- A neighbourhood, subdivision or "residential" with no count: a zone of use sfr with units null; it fills whatever land the other zones leave. Give sized zones (shops, apartments) their sizes; a community center or commons is an amenity zone (items may include center, pool, playground, pavilion, courts, lake), placed last when they say "at the back". Apartments of 80+ units already get their own clubhouse and pool by the entry: don't add a center or pool to a commons beside them unless for-sale homes (sfr, townhomes, duplexes) share it; one pool per community. A pool always comes with its center.
- Feasibility: one-story shops or restaurants with surface parking hold about 9,000-12,000 sq ft an acre; two-story offices about 14,000; garden apartments about 18-24 units an acre; homes on lots 4-6 an acre. If the ask is bigger than the land, still give the ask: the layout fits the most that works and says so.
- Small extras with one main use (outdoor seating, a playground, a lawn, a drive-thru) go in extras, not in zones. "A single" building means buildings 1.
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
  const prompt = clip(b.prompt, 1200).trim(); if (!prompt) return res.status(400).json({ error: 'Say what to build, e.g. "25,000 sf retail strip".' });
  try {
    const r = await chatJSON({ key, model: await model(key), system: SYSTEM, user: siteText(b.site, prompt, b.program, b.facts), name: 'site_program', schema: SCHEMA, maxTokens: 16000, effort: 'high' }); // it may think for a while: a better program is worth the wait (the layout itself runs in the browser)
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
  const prompt = clip(b.prompt, 1200).trim(), opts = (Array.isArray(b.options) ? b.options : []).slice(0, 6), last = (+b.round || 1) >= 2;
  if (!opts.length) return res.status(400).json({ error: 'Nothing to review.' });
  const images = opts.map(o => typeof o.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(o.image) && o.image.length < 600000 ? o.image : null);
  const text = JSON.stringify({ request: prompt || null, round: last ? 'last (do not revise)' : 'first', site: JSON.parse(siteText(b.site, '', null, b.facts)).site, currentProgram: b.program || null,
    options: opts.map((o, i) => ({ option: i, name: clip(o.name, 120), drawing: images[i] ? 'image ' + (images.slice(0, i + 1).filter(Boolean).length) : 'none', metrics: Object.fromEntries(Object.entries(o.metrics || {}).slice(0, 16).map(([k, v]) => [clip(k, 30), num(v)])),
      issues: (o.issues || []).slice(0, 8).map(t => clip(t, 160)), notes: (o.notes || []).slice(0, 6).map(t => clip(t, 240)) })) });
  try {
    const r = await chatJSON({ key, model: await model(key), system: REVIEW_SYSTEM, user: text, name: 'site_review', schema: REVIEW_SCHEMA, maxTokens: 20000, effort: 'high', images: images.filter(Boolean) });
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
