// AI for site plans. The layout itself always comes from the engine in the browser (lib/sitelayout.mjs), so the
// geometry is measured, never made up by the model; the model decides what to build and judges what was drawn.
//   POST { prompt, site, facts, program }                       -> { program, setbacks, summary, assumptions }
//        the request (and what's known about the site) turned into a development program
//   POST { mode: 'review', prompt, site, facts, program, round, options: [{ name, metrics, issues, notes, image }] }
//        -> { reviews: [{ option, score, verdict, strengths, problems }], ranking, revise, program, params, why, summary }
//        the engine's options judged as a land planner would (drawings and numbers); a revised program to lay out again
//   POST { mode: 'bestuse', prompt?, site, facts, nearby, market } -> { ideas: [{ title, use, fit, why, risks, request }], summary }
//        what should go on the site, from what's known about it, each idea a request the builder can lay out
//   POST { mode: 'strategy', prompt, site, facts, program, effort, count } -> { strategies: [...], pick, why }
//        the site thought through before anything is placed (one plan, or three compared for Ultra): what goes where and
//        why, the ways in, the parking and the pond, a check of the numbers. The program call and the review then follow it
//   POST { mode: 'ask', question, history: [{ q, a }], plan: {...facts}, effort } -> { answer, followups }
//        a question about the open plan, answered from the fact sheet the browser computed (lib/planask.mjs planFacts)
//   POST { mode: 'askProject', question, history: [{ q, a }], project: {...facts}, effort } -> { answer, followups }
//        a question about a whole project (the Projects page's Ask tab): its information, the site's jurisdiction facts
//        and every option's headline numbers (lib/project.mjs projectFacts)
// effort (strategy, program, review and ask): how hard the model thinks, 'low' | 'medium' | 'high' | 'xhigh' (the effort
// level picked under Build; Ultra plans at xhigh, which steps down to high on a model that doesn't take it); missing or
// unknown keeps the default (high, medium for ask). review also takes rounds (1-3, default 2): the last round never
// revises. program and review take the strategy the planning step chose (strategy), and follow or judge against it.
// site: { acres, widthFt, depthFt, frontageFt, address, city, county, zoning }; facts: short lines (flood zone, roads
// and traffic, districts, utilities, environmental records).
import { chatJSON, pickModel, withModel } from '../lib/openai.mjs';
import { USES, SETBACKS, HOME_MIX, guessProgram, normalizeProgram } from '../lib/siteplan.mjs';
import { AMENITIES } from '../lib/sitecompose.mjs';
import { catalogText, keepStories } from '../lib/siteedit.mjs';
import { typeById } from '../lib/buildings.mjs';
import { recipeIn, programOf, customOf, teamTypesForAI, OUTDOOR, PER, PATTERNS } from '../lib/customtypes.mjs';
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';

let modelP = null;
const EFFORTS = ['low', 'medium', 'high', 'xhigh'], effortIn = (v, d) => EFFORTS.includes(v) ? v : d; // OpenAI reasoning_effort, from an allow-list
const model0 = key => (modelP ||= pickModel(key, process.env.OPENAI_MODEL).catch(e => { modelP = null; throw e; }));
// the model for this request: the one picked in Settings › AI model when the key can use it, else the server's default;
// said in the X-AI-Model header so the app can show which model answered
const ai = (key, b, res, run) => withModel(key, typeof b?.model === 'string' ? b.model : null, () => model0(key), run, m => res?.setHeader?.('X-AI-Model', m)); // (a picked model that can't serve the call: the default answers)

const n = description => ({ type: ['number', 'null'], description });
// an AI-crafted building type's recipe (lib/customtypes.mjs): how the engine lays out a type it has no use of its own for
const int = description => ({ type: ['integer', 'null'], description }), s0 = description => ({ type: ['string', 'null'], description });
const CUSTOM = { type: 'object', additionalProperties: false, required: ['name', 'pattern', 'buildings', 'outdoor', 'sites', 'parking', 'figures'], description: 'A building type none of the uses covers (use other): its recipe. name null, the lists empty and sites / parking all null otherwise.',
  properties: {
    name: s0('What it is, short: "Daycare", "Pickleball club", "RV park".'),
    pattern: { type: ['string', 'null'], enum: [...Object.keys(PATTERNS), null], description: 'How the layout engine lays it out: row = a building row facing its parking (like shops); pads = several freestanding buildings; commons = a building with its outdoor pieces beside it (playground, courts, lawn, pool, pavilion, plaza, patio); yard = rows of sites on drive aisles, like self storage (an RV park, boat or truck parking).' },
    buildings: { type: 'array', description: 'Its buildings (1-6 kinds). For a yard, the office.', items: { type: 'object', additionalProperties: false, required: ['label', 'type', 'w', 'd', 'floors', 'count'], properties: {
      label: { type: 'string', description: 'E.g. "Daycare", "Clubhouse", "Classroom building", "Gym".' }, type: s0('A building library type id when one fits (see libraryTypes), else null and give its size.'),
      w: n('Feet along its front.'), d: n('Feet deep.'), floors: int('Floors.'), count: int('How many of this building.') } } },
    outdoor: { type: 'array', description: 'Its outdoor pieces (commons). Empty when none.', items: { type: 'object', additionalProperties: false, required: ['kind', 'label', 'w', 'd', 'count'], properties: {
      kind: { type: 'string', enum: Object.keys(OUTDOOR), description: 'court (one court with its run-out: pickleball 30 × 60, tennis 60 × 120, basketball 50 × 84, sand volleyball 40 × 70), play (a playground or fenced play yard), pool, plaza, green (a lawn, field or dog run), patio (outdoor seating, a beer garden), pavilion (a covered open-air shelter).' },
      label: { type: 'string', description: 'E.g. "Pickleball courts", "Fenced playground", "Event lawn".' }, w: n('Feet, one piece.'), d: n('Feet, one piece.'), count: int('How many.') } } },
    sites: { type: 'object', additionalProperties: false, required: ['label', 'w', 'd', 'count'], description: 'A yard only: its sites (an RV site about 24 × 55 ft back-in); all null otherwise.', properties: { label: s0('E.g. "RV site", "Boat slip", "Truck space".'), w: n('Feet wide.'), d: n('Feet deep.'), count: int('How many sites.') } },
    parking: { type: 'object', additionalProperties: false, required: ['per', 'rate', 'basis', 'label', 'plus1k'], description: 'Its parking rule.', properties: {
      per: { type: ['string', 'null'], enum: [...Object.keys(PER), null], description: 'What the rate counts: 1000sf (per 1,000 sq ft of building), seat, court, child, space (a site in a yard) or pad.' }, rate: n('Spaces per one of them.'),
      basis: n('How many of them (children, seats); null for 1000sf, court, space and pad (counted from the plan).'), label: s0('Their name, plural: "children", "seats", "courts".'), plus1k: n('Spaces per 1,000 sf of building on top, for a rule per court or per site (the clubhouse, the office). 0 or null otherwise.') } },
    figures: { type: 'array', items: { type: 'string' }, description: '2-4 short figures for the Numbers panel: "120 children", "8 courts", "60 RV sites".' } } };
export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['use', 'gfa', 'floors', 'units', 'buildings', 'ratio', 'perUnit', 'depth', 'detentionPct', 'storm', 'truck', 'through', 'compare', 'trash', 'entrances', 'product', 'extras', 'storage', 'foodtrucks', 'fuel', 'custom', 'setbacks', 'zones', 'summary', 'assumptions'],
  properties: {
    use: { type: 'string', enum: Object.keys(USES), description: 'Main use. storage = self storage (climate-controlled, drive-up, mini-storage, RV / boat storage). foodtrucks = a food truck park (food truck court, truck stalls round a pavilion, beer garden). fuel = a gas station / convenience store (c-store, fueling station, pumps, a QT or Buc-ee\'s style store; a truck stop or travel center too, laid out as the car version). other = anything that fits none of these: a daycare, a school, a pickleball club, an RV park, an event venue… (then custom holds its recipe).' },
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
    storage: { type: 'object', additionalProperties: false, required: ['climateSf', 'driveSf', 'rv'], description: 'Self storage only (use storage); all null otherwise.',
      properties: { climateSf: n('Climate-controlled building floor area, all floors, sq ft. 0 = drive-up only (a small leasing office instead). null = sized to the site.'), driveSf: n('Drive-up (single-story, doors on the drive aisle) floor area, sq ft. 0 = none. null = as much as fits.'), rv: { type: ['integer', 'null'], description: 'RV / boat parking spaces (12 x 40 ft). null or 0 = none.' } } },
    foodtrucks: { type: 'object', additionalProperties: false, required: ['trucks', 'pavilionSf', 'bar', 'barSf', 'playground', 'perTruck'], description: 'Food truck park only (use foodtrucks); all null otherwise.',
      properties: { trucks: { type: ['integer', 'null'], description: 'Food truck stalls (15 x 35 ft, power and water). null = as many as fit.' }, pavilionSf: n('The covered pavilion over the picnic seating, sq ft (about 15 sf a seat). null = 3,000.'),
        bar: { type: ['boolean', 'null'], description: 'A bar or beer garden building with its patio. false only when they say no bar; null = yes.' }, barSf: n('The bar building, sq ft (1,500-3,000). null = 2,000.'),
        playground: { type: ['boolean', 'null'], description: 'A playground on the lawn. false only when they say none; null = yes.' }, perTruck: n('Parking spaces per truck (4-6). null = 5.') } },
    fuel: { type: 'object', additionalProperties: false, required: ['pumps', 'storeSf', 'wash', 'vac', 'canopy', 'truckStop'], description: 'Gas station only (use fuel); all null otherwise.',
      properties: { pumps: { type: ['integer', 'null'], description: 'Fuel pumps (MPDs, multi-product dispensers): 4, 6, 8 or 12; each has two fueling positions ("16 fueling positions" = 8). null = 8.' }, storeSf: n('The convenience store, sq ft (usually 3,000-6,000; 4,500 typical). null = 4,500.'),
        wash: { type: ['boolean', 'null'], description: 'A car wash tunnel with its stacking lane, when asked for.' }, vac: { type: ['boolean', 'null'], description: 'Air / vacuum stalls. false only when they say none; null = yes.' },
        canopy: { type: ['string', 'null'], enum: ['auto', 'front', 'side', null], description: 'Which street the canopy runs along: front (the busier street), side (the side street of a corner lot), auto or null = the front unless only the side fits.' },
        truckStop: { type: ['boolean', 'null'], description: 'true when they ask for a truck stop, travel center or diesel lanes for trucks (laid out as the car version for now).' } } },
    custom: CUSTOM,
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
- Where they say things go, that order wins over the usual one: "on the front" / "by the road" is the first zone, "at the back" / "in the rear" the last, "in the middle" / "in the center" between ("a community center in the middle of the homes" is homes, then the amenity zone, then homes). Name each zone for where it is and what it holds ("Front — Retail", "Middle — Community center and park", "Back — Single-family homes").
- A number of buildings ("4 buildings", "two pads") goes in buildings, with gfa the total across them. Stormwater: retention when they ask for a wet pond or lake, underground when they ask for vaults or no pond, none for regional detention.
- Townhomes and duplexes: homes on their own lots with a public street fit about 6-10 units an acre; denser than that, use product court6 (or court), rows on a shared parking court, rather than cutting the count.
- A neighbourhood, subdivision or "residential" with no count: a zone of use sfr with units null; it fills whatever land the other zones leave. Give sized zones (shops, apartments) their sizes; a community center or commons is an amenity zone (items may include center, pool, playground, pavilion, courts, lake), placed last when they say "at the back". Apartments of 80+ units already get their own clubhouse and pool by the entry: don't add a center or pool to a commons beside them unless for-sale homes (sfr, townhomes, duplexes) share it; one pool per community. A pool always comes with its center.
- Feasibility: one-story shops or restaurants with surface parking hold about 9,000-12,000 sq ft an acre; two-story offices about 14,000; garden apartments about 18-24 units an acre; homes on lots 4-6 an acre. If the ask is bigger than the land, still give the ask: the layout fits the most that works and says so.
- Small extras with one main use (outdoor seating, a playground, a lawn, a drive-thru) go in extras, not in zones. "A single" building means buildings 1.
- The goal is the most valuable plan the site holds within the rules and the market. Sizes you give are the first phase: the engine fills land left over with more of the same (more homes, longer shop and office buildings, more warehouse) up to what the parking and stormwater allow, so don't shrink a request to leave land empty. Don't add uses they didn't ask for.
- A parking garage: a zone of use "garage" (floors = levels, usually 4-5) where they want it in the order ("a parking garage behind the offices"); offer one for dense offices, medical or shops on tight land. Industrial, warehouse and flex are use "industrial" (a truck court goes behind them), never homes.
- Self storage (climate-controlled, drive-up, mini-storage, RV / boat storage) is use "storage", never "industrial": floors is the climate-controlled building's (usually 3), storage.climateSf its floor area over all floors, storage.driveSf the drive-up rows', storage.rv the RV / boat spaces. Leave driveSf null to fill the site with drive-up rows (the usual: maximize rentable area), climateSf null to size the building to the site. Parking is a few spaces at the office (about 1 per 10,000 sf, ratio 0.1). The engine draws the building at the street with the office, drive-up rows behind on 26 ft aisles, and a fence with a keypad gate.
- A food truck park (food truck court, truck stalls, a beer garden with food trucks) is use "foodtrucks", one use (no zones, no extras): foodtrucks.trucks the stalls asked for (null = as many as fit), pavilionSf the covered seating (about 15 sf a seat), bar false only when they say no bar, barSf its size ("a small bar" about 1,500, "a large beer garden" about 3,000), playground false only when they say none, perTruck the parking a truck (4-6, usually 5). ratio is the bar's parking per 1,000 sf (about 8). gfa and units are null. The engine draws the trucks on a service lane round a pavilion and lawn, restrooms, the bar and its patio, a dumpster and grease enclosure, and the customer parking on the street side.
- A gas station, fueling station, convenience store or c-store with pumps is use "fuel" (never retail): fuel.pumps the MPDs (4, 6, 8 or 12; two fueling positions each), fuel.storeSf the store and gfa the same, fuel.wash for a car wash, fuel.vac false only if they say no air / vacuum, fuel.canopy only when they say which street. A QT, RaceTrac, Wawa or Buc-ee's style store means 12 pumps and a 5,000-6,000 sf store. A truck stop or travel center: use fuel with truckStop true, and say in the assumptions that it is laid out as a gas station for cars (no diesel lanes, truck parking or scales yet). The engine puts the canopy between the store and the busier street, drive lanes round it, the tanks where the fuel truck reaches them, and on a corner lot a driveway on each street kept back from the corner. Parking ratio is per 1,000 sf of the store (about 4).
- Housing asked for in general ("multifamily", "rental housing", "build-to-rent") with no product named: use multifamily with compare true; the engine lays out garden apartments, studio/1-bed apartments, townhomes and duplexes and ranks them by value. When they name a product, use it.
- Trash enclosures only when they ask for them (trash true).
- A building type none of these uses covers (a daycare, a pickleball or tennis club, an RV park, a car wash on its own, an event venue, a school, mini golf, a dog daycare, a brewery with a beer garden…) is use "other" with its recipe in custom, never a bare box: custom.name what it is; custom.pattern the engine's layout that suits it (row: a building row facing its parking; pads: several freestanding buildings; commons: a building with outdoor pieces beside it; yard: rows of sites on drive aisles); custom.buildings each with a label and a library type id when one fits (libraryTypes) or its size w × d ft, floors and count; custom.outdoor the outdoor pieces with counts and sizes; custom.sites a yard's sites; custom.parking its rule, the way a city counts it: per seat (a venue or school: 1 a 3 seats, 1 a 4 students), per child (a daycare: about 0.2-0.25 a child, staff and drop-off), per court (3-4 a court, plus plus1k for the clubhouse), per site (an RV park: 0.1-0.2 a site for visitors, each site holds its own car, plus plus1k for the office), per pad, or per 1,000 sf; custom.figures 2-4 short figures ("120 children", "8 courts"). Size from typical practice (a daycare about 85 sf a child inside and 75 sf a child of playground; a pickleball club's clubhouse 3,000-6,000 sf; an RV park about 15-20 sites an acre). gfa is the buildings' total, ratio null. Other uses leave custom empty (name null).
- When teamTypes are given, they are building types the team saved before: when the request names or describes one ("another one like our pickleball club", "our daycare"), reuse its recipe and sizes (its name, pattern, buildings, outdoor pieces, sites and parking rule), changing only what the request changes.
- Never claim code compliance. Assumptions are short phrases, e.g. "4 spaces per 1,000 sf (typical retail)".
- When a plannedStrategy is given, the site was thought through before this step: follow it. Its placement sets the zone order (front, middle, back), its entrances the entrances count, its stormwater the storm type, its buildings the building count and floors. Only where it contradicts the request does the request win (say so in assumptions).`;

const factsOf = facts => (Array.isArray(facts) ? facts : []).slice(0, 14).map(t => clip(t, 300)).filter(Boolean);
// a few library types an AI-crafted type often uses (custom.buildings[].type)
const LIBRARY_HINTS = ['retail-daycare-10-000-sf', 'retail-fitness-20-000-sf', 'other-event-hall-8-000-sf', 'other-community-center-7-700-sf', 'other-pavilion-4-000-sf', 'clubhouse-clubhouse-4-500-sf', 'clubhouse-clubhouse-7-500-sf', 'other-church-12-000-sf', 'restaurant-brewpub-10-000-sf', 'fuel-wash-car-wash-express-tunnel-110-ft', 'storage-office-leasing-office-1-200-sf'].filter(id => typeById(id));
export function siteText(site = {}, prompt = '', program = null, facts = null, strategy = null, teamTypes = null) {
  const s = site || {}, f = v => v == null || v === '' ? null : String(v).slice(0, 200);
  const z = s.zoning && typeof s.zoning === 'object' ? Object.fromEntries(Object.entries(s.zoning).filter(([, v]) => v != null && v !== '').slice(0, 12).map(([k, v]) => [k, String(v).slice(0, 120)])) : null;
  const side = (Array.isArray(s.sideStreetsFt) ? s.sideStreetsFt : []).map(v => Math.round(+v)).filter(v => v > 0).slice(0, 4);
  return JSON.stringify({ request: clip(prompt, 1200), site: { acres: +s.acres || null, approxWidthFt: +s.widthFt || null, approxDepthFt: +s.depthFt || null, streetFrontageFt: +s.frontageFt || null,
    ...(side.length ? { sideStreetsFt: side } : {}), ...(s.shape ? { shape: f(s.shape) } : {}),
    address: f(s.address), city: f(s.city), county: f(s.county), zoning: z, facts: factsOf(facts) }, currentProgram: program || null, ...(strategy ? { plannedStrategy: strategy } : {}),
    ...(teamTypes?.length ? { teamTypes } : {}), ...(teamTypes ? { libraryTypes: LIBRARY_HINTS } : {}) });
}

// the model's program, made safe: unknown values dropped, the words' own reading filling gaps, zones normalized
function programFrom(d, prompt) {
  const g0 = guessProgram(prompt), sto = d.use === 'storage' || (!d.use && g0.use === 'storage') ? { storage: { ...(g0.storage || {}), ...Object.fromEntries(Object.entries(d.storage || {}).filter(([, v]) => v != null)) } } : {}; // storage: the words fill what the model left open
  const ftk = d.use === 'foodtrucks' || (!d.use && g0.use === 'foodtrucks') ? { foodtrucks: { ...(g0.foodtrucks || {}), ...Object.fromEntries(Object.entries(d.foodtrucks || {}).filter(([, v]) => v != null)) } } : {}; // a food truck park: the words fill what the model left open
  const fu = d.use === 'fuel' || (!d.use && g0.use === 'fuel') ? { fuel: { ...(g0.fuel || {}), ...Object.fromEntries(Object.entries(d.fuel || {}).filter(([, v]) => v != null)) } } : {}; // a gas station: the same
  const program = { ...normalizeProgram({ ...g0, ...Object.fromEntries(Object.entries(d).filter(([k, v]) => v != null && !['setbacks', 'summary', 'assumptions', 'zones', 'storage', 'foodtrucks', 'fuel', 'custom'].includes(k))), ...sto, ...ftk, ...fu }), ...(d.gfa == null && d.units == null && d.use !== 'storage' && d.use !== 'fuel' ? { gfa: null } : {}) };
  const guess = guessProgram(prompt), zs = d.zones?.length > 1 ? d.zones : guess.zones; // the model's zones, else the ones read from the words
  if (zs?.length > 1 && program.use !== 'foodtrucks') { const nz = normalizeProgram({ use: zs[0].use, zones: zs }).zones; program.zones = nz; program.use = nz[0].use; }
  return program;
}
// an AI-crafted type: the recipe made safe and laid out as its program (lib/customtypes.mjs). A recipe that makes no
// sense (no name kept, nothing to draw) falls back to a plain building, with a note saying so.
export function customFrom(d, program) {
  const raw = d?.custom, name = typeof raw?.name === 'string' ? raw.name.trim() : '';
  if (program.use !== 'other' || program.zones || !name) return { program };
  const r = recipeIn(raw); if (r) return { program: { ...programOf(r, program), ...(program.setbacks ? { setbacks: program.setbacks } : {}) } };
  return { program: { ...program, custom: undefined }, note: 'The AI’s recipe for “' + clip(name, 60) + '” didn’t make sense, so it’s laid out as a plain building (3 spaces / 1,000 sf).' };
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
- Never claim code compliance; these are concepts.
- When a plannedStrategy is given, the site was thought through before the layouts were drawn: judge whether each layout carries it out (what sits at the front, middle and back, the ways in, the parking, the pond). A layout that strays from it is weaker unless the change is plainly better; say which.`;
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

// ---------- thinking the site through before anything is placed ----------
const PLACE = ['front', 'middle', 'back', 'left side', 'right side', 'corner', 'throughout'];
export const STRATEGY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['strategies', 'pick', 'why'],
  properties: {
    strategies: { type: 'array', description: 'The site plans thought through, as many as asked for (1 or 3). Three must differ in a real way (where the main use sits, how the parking or the pond works, how many buildings), not in wording.', items: {
      type: 'object', additionalProperties: false, required: ['name', 'concept', 'placement', 'entrances', 'parking', 'stormwater', 'buildings', 'numbers', 'settings', 'risks', 'rejected'],
      properties: {
        name: str('A short name, e.g. "Retail on FM 362, apartments behind".'),
        concept: str('Two or three sentences: the idea of the plan and why it suits this site and request.'),
        placement: { type: 'array', description: 'What goes where, front (the street) to back.', items: { type: 'object', additionalProperties: false, required: ['what', 'where', 'why'], properties: {
          what: str('A use or piece: "retail strip", "2 pad sites", "clubhouse and pool", "detention pond".'), where: { type: 'string', enum: PLACE }, why: str('One sentence.') } } },
        entrances: { type: 'object', additionalProperties: false, required: ['count', 'where', 'why'], properties: { count: { type: 'integer', description: '1 to 3.' }, where: str('E.g. "one on FM 362 centred on the strip, one on the side street".'), why: str('One sentence (visibility, spacing, fire access, a corner).') } },
        parking: { type: 'object', additionalProperties: false, required: ['approach', 'where', 'spaces'], properties: { approach: str('E.g. "a field in front of the strip, rows facing the stores".'), where: { type: 'string', enum: PLACE }, spaces: { type: ['integer', 'null'], description: 'About how many spaces the program needs.' } } },
        stormwater: { type: 'object', additionalProperties: false, required: ['type', 'where', 'why'], properties: { type: { type: 'string', enum: ['detention', 'retention', 'underground', 'none'] }, where: { type: 'string', enum: PLACE }, why: str('One sentence (low corner, floodplain, an amenity lake, small site).') } },
        buildings: { type: 'object', additionalProperties: false, required: ['count', 'floors', 'form'], properties: { count: { type: ['integer', 'null'] }, floors: { type: ['integer', 'null'] }, form: { type: ['string', 'null'], enum: ['bar', 'L', 'U', 'tower', null], description: 'Apartment building form, else null.' } } },
        numbers: { type: 'object', additionalProperties: false, required: ['buildingSf', 'units', 'coveragePct', 'fits', 'check'], properties: { buildingSf: { type: ['integer', 'null'] }, units: { type: ['integer', 'null'] }, coveragePct: { type: ['number', 'null'], description: 'Building footprint as a share of the site.' }, fits: { type: 'boolean' }, check: str('One or two sentences: the arithmetic that says it fits (footprint plus parking at about 330 sq ft a space plus the pond against the acres), or what has to give.') } },
        settings: { type: 'object', additionalProperties: false, required: ['streets', 'fill'], properties: { streets: { type: ['string', 'null'], enum: ['curved', 'straight', null], description: 'Neighbourhood streets, homes only.' }, fill: { type: ['boolean', 'null'], description: 'false to leave the rest of a big site open as a later phase instead of filling it with more of the same; null = the usual.' } } },
        risks: strs('Up to 3 things that could break this plan (floodplain fill, a short frontage, a utility district).'),
        rejected: strs('Up to 2 other ways you considered and why you didn\'t take them.')
      } } },
    pick: { type: 'integer', description: 'The index of the strategy to lay out (0 when there is one).' },
    why: str('One or two sentences: why that one (with three: what it does better than the others).')
  }
};
export const STRATEGY_SYSTEM = `You are a senior land planner for a commercial construction company in the Houston region. Before a layout engine places anything on the parcel, you think the site through the way a planner sketches before drawing: what goes at the front, in the middle and at the back, where the ways in go, how the parking and the stormwater work, and whether the numbers fit.
- Read the site: its acres, width and depth, its street frontage (and side streets: a corner lot), its shape and the facts given (flood zone, roads and traffic, utilities). The request comes first; fill what it leaves open with typical suburban Houston-area practice.
- Put each use where it works: retail, restaurants and pads on the busiest street for visibility, with their parking in front; offices and medical close to the street too; apartments, townhomes and homes behind, away from the traffic; an amenity (clubhouse, pool, community center) central to the homes it serves or at the entry; warehouses with their truck court away from the street; the pond on the low or back land, or as an amenity lake.
- Ways in: one for an ordinary lot; two on a corner (one on each street), for more than 200 apartments or 30 homes (fire access) or a big parking field; drives at least 150 ft apart, never at a pad's door.
- Check the numbers before you commit: building footprint, parking (retail 4/1,000 sf, restaurant 10, office 3.5, medical 5, apartments 1.5-1.75 a unit, at about 330 sq ft a space with its aisle) and detention (about 8-12% of the site for detention in Harris County) against the acres. If it doesn't fit, say what gives (fewer units, a second floor, structured parking).
- When asked for three, make them genuinely different plans, judge each against the site and the request, and pick the one a developer would take forward; say why in plain words.
- Concept level only: no code compliance claims.`;
const strategyFrom = d => { const t = (v, n = 300) => clip(v, n), list = (v, n, k = 240) => (Array.isArray(v) ? v : []).slice(0, n).map(x => t(x, k)).filter(Boolean), pl = v => PLACE.includes(v) ? v : null, int = (v, lo, hi) => Number.isFinite(+v) && v != null ? Math.max(lo, Math.min(hi, Math.round(+v))) : null;
  return { name: t(d?.name, 120), concept: t(d?.concept, 600),
    placement: (Array.isArray(d?.placement) ? d.placement : []).slice(0, 8).map(q => ({ what: t(q?.what, 120), where: pl(q?.where), why: t(q?.why, 240) })).filter(q => q.what && q.where),
    entrances: { count: int(d?.entrances?.count, 1, 3) || 1, where: t(d?.entrances?.where, 240), why: t(d?.entrances?.why, 240) },
    parking: { approach: t(d?.parking?.approach, 240), where: pl(d?.parking?.where), spaces: int(d?.parking?.spaces, 0, 20000) },
    stormwater: { type: ['detention', 'retention', 'underground', 'none'].includes(d?.stormwater?.type) ? d.stormwater.type : 'detention', where: pl(d?.stormwater?.where), why: t(d?.stormwater?.why, 240) },
    buildings: { count: int(d?.buildings?.count, 1, 400), floors: int(d?.buildings?.floors, 1, 40), form: ['bar', 'L', 'U', 'tower'].includes(d?.buildings?.form) ? d.buildings.form : null },
    numbers: { buildingSf: int(d?.numbers?.buildingSf, 0, 5e6), units: int(d?.numbers?.units, 0, 5000), coveragePct: Number.isFinite(+d?.numbers?.coveragePct) && d?.numbers?.coveragePct != null ? Math.max(0, Math.min(100, +d.numbers.coveragePct)) : null, fits: d?.numbers?.fits !== false, check: t(d?.numbers?.check, 400) },
    settings: { streets: ['curved', 'straight'].includes(d?.settings?.streets) ? d.settings.streets : null, fill: typeof d?.settings?.fill === 'boolean' ? d.settings.fill : null },
    risks: list(d?.risks, 3), rejected: list(d?.rejected, 2) };
};
// a strategy coming back in from the browser (to the program and the review): the same shape, cleaned again
export const strategyIn = v => v && typeof v === 'object' ? strategyFrom(v) : null;
async function strategy(b, key, res) {
  const prompt = clip(b.prompt, 1200).trim(); if (!prompt) return res.status(400).json({ error: 'Say what to build, e.g. "25,000 sf retail strip".' });
  const count = +b.count === 3 ? 3 : 1;
  const user = siteText(b.site, prompt, b.program, b.facts).replace(/}$/, ',"asked":' + JSON.stringify(count === 3 ? 'three different strategies, then pick one' : 'one strategy') + '}');
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: STRATEGY_SYSTEM, user, name: 'site_strategy', schema: STRATEGY_SCHEMA, maxTokens: count === 3 ? 32000 : 16000, effort: effortIn(b.effort, 'high') }));
    const d = r.data, strategies = (Array.isArray(d.strategies) ? d.strategies : []).slice(0, count).map(strategyFrom).filter(x => x.concept || x.placement.length);
    if (!strategies.length) throw new Error('no strategy');
    const pick = Number.isInteger(d.pick) && d.pick >= 0 && d.pick < strategies.length ? d.pick : 0;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ strategies, pick, why: clip(d.why, 400) });
  } catch (e) {
    console.error('siteplan strategy', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now. Try again, or build without AI.' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 12, perDay: 400 })) return;
  const key = needKey(res); if (!key) return;
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (b.mode === 'review') return review(b, key, res);
  if (b.mode === 'bestuse') return bestUse(b, key, res);
  if (b.mode === 'edit') return edit(b, key, res);
  if (b.mode === 'ask') return ask(b, key, res);
  if (b.mode === 'askProject') return askProject(b, key, res);
  if (b.mode === 'strategy') return strategy(b, key, res);
  if (b.mode === 'names') return names(b, key, res);
  const prompt = clip(b.prompt, 1200).trim(); if (!prompt) return res.status(400).json({ error: 'Say what to build, e.g. "25,000 sf retail strip".' });
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: SYSTEM, user: siteText(b.site, prompt, b.program, b.facts, strategyIn(b.strategy), teamTypesForAI(b.teamTypes)), name: 'site_program', schema: SCHEMA, maxTokens: 16000, effort: effortIn(b.effort, 'high') })); // it may think for a while: a better program is worth the wait (the layout itself runs in the browser)
    const d = r.data, sb = Object.fromEntries(Object.entries(d.setbacks || {}).filter(([, v]) => v != null && v >= 0 && v <= 300)), cu = customFrom(d, programFrom(d, prompt)), program = cu.program;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ program, setbacks: { ...SETBACKS, ...sb }, summary: clip(d.summary, 400), assumptions: [...(cu.note ? [cu.note] : []), ...(d.assumptions || []).slice(0, 4).map(a => clip(a, 200))].slice(0, 5) });
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
  const text = JSON.stringify({ request: prompt || null, round: last ? 'last (do not revise)' : round === 1 ? 'first' : round + ' of ' + rounds + ' (revise again only if it clearly helps)', site: JSON.parse(siteText(b.site, '', null, b.facts)).site, currentProgram: b.program || null, ...(strategyIn(b.strategy) ? { plannedStrategy: strategyIn(b.strategy) } : {}),
    options: opts.map((o, i) => ({ option: i, name: clip(o.name, 120), drawing: images[i] ? 'image ' + (images.slice(0, i + 1).filter(Boolean).length) : 'none', metrics: Object.fromEntries(Object.entries(o.metrics || {}).slice(0, 16).map(([k, v]) => [clip(k, 30), num(v)])),
      issues: (o.issues || []).slice(0, 8).map(t => clip(t, 160)), notes: (o.notes || []).slice(0, 6).map(t => clip(t, 240)) })) });
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: REVIEW_SYSTEM, user: text, name: 'site_review', schema: REVIEW_SCHEMA, maxTokens: 20000, effort: effortIn(b.effort, 'high'), images: images.filter(Boolean) }));
    const d = r.data, n = opts.length, ok = i => Number.isInteger(i) && i >= 0 && i < n;
    const ranking = [...new Set((d.ranking || []).filter(ok))]; for (let i = 0; i < n; i++) if (!ranking.includes(i)) ranking.push(i);
    const reviews = (d.reviews || []).filter(x => ok(x.option)).map(x => ({ option: x.option, score: Math.max(0, Math.min(100, Math.round(+x.score || 0))), verdict: clip(x.verdict, 300), strengths: (x.strengths || []).slice(0, 3).map(t => clip(t, 200)), problems: (x.problems || []).slice(0, 4).map(t => clip(t, 220)) }));
    const revise = !last && !!d.revise, p = d.params || {};
    const params = Object.fromEntries(Object.entries({ fill: typeof p.fill === 'boolean' ? p.fill : null, streets: ['curved', 'straight'].includes(p.streets) ? p.streets : null, form: ['bar', 'L', 'U', 'tower'].includes(p.form) ? p.form : null, storm: ['detention', 'retention', 'underground', 'none'].includes(p.storm) ? p.storm : null }).filter(([, v]) => v != null));
    res.setHeader('Cache-Control', 'no-store');
    const keepCustom = p => { const cu = customFrom(d.program || {}, p); if (cu.program.custom || !customOf(b.program || {})) return cu.program; const r0 = recipeIn(b.program.custom); return r0 && (p.use === 'other' || p.use === (r0.pattern === 'yard' ? 'storage' : 'other')) ? { ...programOf(r0, p) } : cu.program; }; // a revised custom type keeps its recipe unless the AI rewrote it
    return res.json({ reviews, ranking, revise, program: revise ? keepCustom(programFrom(d.program || {}, prompt)) : null, params: revise ? params : {}, why: revise ? clip(d.why, 300) : '', summary: clip(d.summary, 600) });
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
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: BESTUSE_SYSTEM, user: JSON.stringify({ goal: s.request || null, site: s.site, nearby, market }), name: 'site_best_use', schema: BESTUSE_SCHEMA, maxTokens: 16000, effort: 'high' }));
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
const EVERY = [...Object.keys(USES), 'building', 'pool', 'play', 'court', 'green', 'plaza', 'pond', 'garage', 'patio']; // what an edit on every piece of a sort can name
export const EDIT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ops', 'homeMix', 'names', 'refit', 'summary', 'question'],
  properties: {
    ops: { type: 'array', description: 'The edits, in order.', items: { type: 'object', additionalProperties: false, required: ['action', 'target', 'every', 'floorsOver', 'with', 'type', 'kind', 'use', 'name', 'floors', 'units', 'w', 'd', 'x', 'y', 'turn', 'turnBy', 'boulevard', 'signs'], properties: {
      action: { type: 'string', enum: ['change', 'remove', 'add', 'move', 'swap'] },
      target: nul('string', { description: 'id of the piece to change, remove, move or swap (null for add, or with every).' }),
      every: nul('string', { enum: [...EVERY, null], description: 'change / remove with no target: every piece of this use (a building use, e.g. multifamily, townhomes) or kind (pool, court…), listed or not.' }),
      floorsOver: nul('integer', { description: 'with every: only the ones with more floors than this now (2 picks the 3-story and taller ones).' }),
      with: nul('string', { description: 'swap: the other piece. add / move: a piece to put it beside (when no x, y).' }),
      type: nul('string', { description: 'A building type id from the library: the building it becomes (change) or the one added (add).' }),
      kind: nul('string', { enum: ['building', 'pool', 'play', 'court', 'green', 'plaza', 'pond', 'garage', 'patio', 'entrance', 'roundabout', 'loop', null], description: 'add without a library type: what kind of piece. green: a park, lawn or open space (give it a name: Park, Open space…). entrance: a driveway in from the street at x, y (a point on the lot line, y about 0 for the front), on the lot line beside the piece given in with, or with neither where it helps most. roundabout: a pavement ring with a planted island at a junction of streets: x, y of one of plan.junctions, or with an entrance’s id (\"at the entry\") or a piece’s id (the junction nearest it); w its outer diameter in ft only when they give a size. loop: a one-way drop-off loop (circle drive) with a planted island in front of the building given in with.' }),
      use: nul('string', { enum: [...Object.keys(USES), null] }), name: nul('string'),
      floors: nul('integer'), units: nul('integer'), w: nul('number', { description: 'feet across its front (a roundabout: its outer diameter; a loop: its length along the building)' }), d: nul('number', { description: 'feet deep' }),
      x: nul('number', { description: 'where its centre goes: feet across the frontage from the street’s left end, as on the drawing' }), y: nul('number', { description: 'feet back from the street' }),
      turn: nul('number', { description: 'its angle on the drawing in degrees (0 = its long side along the street, 90 = running back from it)' }),
      turnBy: nul('number', { description: 'degrees to turn it by on the drawing, + counter-clockwise, − clockwise: any piece, curved ponds, lawns, drawn outlines and entrances too (an entrance turns about its middle, its mouth slides along the street, at most 60° off square)' }),
      boulevard: nul('boolean', { description: 'an entrance: true for a two-lane divided entry with a planted median (add kind entrance: a new one; change: widen this one)' }),
      signs: nul('string', { enum: ['median', 'both', 'one', 'none', null], description: 'an entrance: where its monument signs go (median: in the median nose; both / one: at the corners); null leaves them' }) } } },
    homeMix: { type: 'array', description: 'The single-family homes on lots by stories, when the request changes their stories across the site (e.g. no 3-story homes: the 1- and 2-story shares only). Empty for no change.', items: { type: 'object', additionalProperties: false, required: ['stories', 'pct'], properties: { stories: { type: 'integer', enum: [1, 2, 3] }, pct: { type: 'number', description: 'share of the homes, %' } } } },
    names: { type: 'object', additionalProperties: false, required: ['community', 'parts'], description: 'names for the development and its parts (plan.parts); community null and parts empty when the request doesn’t name anything', properties: {
      community: nul('string', { description: 'the whole development’s name ("call it Beacon Hill"), or null' }),
      parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['part', 'name'], properties: { part: { type: 'integer', description: 'plan.parts index (part)' }, name: { type: 'string' } } } } } },
    refit: { type: 'string', enum: ['none', 'full'], description: 'none: change just these pieces; parking under them gives way and comes back where they leave (the usual). full: also lay out the parking and lots again along the same streets around them (when the user asks for a re-fit or re-layout, or after adding or removing several buildings, or moving one into land without drives). Nothing re-lays the streets (for that the user picks New Layouts).' },
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
- Entrances: add kind "entrance" at a point on the lot line where they want it (y = 0 is the front street; a side lot line becomes a street), or without x, y to put it where it helps most; remove one by its id (its median and signs go with it). Driveways want site.entryRules.spacing ft between them (about 150), site.entryRules.corner ft from a corner where two streets meet, and a clear line in to a drive.
- Roundabouts and drop-off loops: add kind "roundabout" at a junction from plan.junctions (x, y as given; "the main intersection" is the one marked main; "at the entry" is with the entrance's id; "by the clubhouse" is with its id). The app snaps it to the junction, trims the streets into the ring, moves the homes in its way, and makes it smaller or says why when there's no room; 100 ft across is usual for neighbourhood streets, 120 where a boulevard or collector meets it. add kind "loop" with a building's id for a one-way drop-off loop (circle drive) in front of a clubhouse, school, shop or hotel: the app puts it between the building and the nearest drive (another side when the front is too close) or says there's no room. Remove either by its id (the streets a roundabout cut come back). Never add a roundabout where plan.junctions has none near.
- Boulevards: boulevard true is a two-lane divided entry with a planted median, sized by the plan's settings (site.entryRules). "Make the main entry a boulevard": change on its id with boulevard true. "Add a boulevard entrance off FM 362 with monument signs on both sides": add kind entrance, boulevard true, signs both, x, y on that street's lot line, away from the entrances already on it (site.streets gives each street's ends, and its name when known; the names are often unknown: then a road named is the front street when the site has one street, and when it has more ask which side it's on). The app slides a way in asked for too near another along the street to keep the spacing, or says there's no room. signs: median (in the median, the default), both, one, none; signs alone on an entrance moves its signs. Pieces with "of" (a median, a monument sign) belong to that entrance and move with it.
- Turning: turnBy turns any piece by that many degrees (+ counter-clockwise on the drawing, − clockwise): curved ponds, lawns, drawn outlines, medians and entrances too. "Turn the pond 20 degrees" is turnBy 20; "20 degrees clockwise" is −20. turn sets a rectangle's angle outright.
- Names: the development has a name (community) and each part in plan.parts its own (part, label, name). "Call the neighbourhood Beacon Hill Estates", "name the retail center Beacon Hill Market" are names, not ops: names.parts with the part's index (every part of that kind when there are two, as two neighbourhoods either side of a commons); the whole development ("call it Beacon Hill", "the community") is names.community. Never rename pieces for these. Keep the user's capitals.
- Parks, lawns and open space (kind green with a name) are real places: never put a piece across a drive or a park. To put a park or amenity beside something, give with and no x, y: the app tries each side and keeps the first spot clear of drives, buildings and the lot line, or says there's no room.
- An entrance can't cross a park, open space or pond: put x, y on the street lot line beside it, not through it. If they ask for one "at the open space", give with (its id) and no x, y: the app slides it along the street past it or says it can't.
- A re-fit keeps the streets as they are. If the request needs a different street arrangement, say so in the summary and suggest New Layouts; don't claim the streets changed.
- More floors on apartments add units; give units only when they name a number.
- If they ask for something the plan can't hold (no room, outside the setbacks), do the nearest sensible thing and say so in the summary.
- refit: "none" unless they ask for the site to re-fit or re-lay, or the change needs new drives and parking (a building added in open land, several buildings removed); then "full".
- Places: plan.places says where things are, in the same feet as "at" (x across the frontage from its left end, y back from the street). "The front" / "by the street" is small y, "the back" / "the rear" the largest y, "the middle" / "the center" the middle of the site; "left" and "right" as on the drawing. "The middle of the homes" (or of any use: the apartments, the shops, the single-family lots) is that area's middle in places.areas; "in front of" a piece or area is toward the street from it, "behind" it away from the street; a named zone ("the back zone", "the commons") is in places.zones. Use these for x, y when they say where, without asking them to be more exact.
- Moving or adding an amenity, clubhouse or pool among houses: the houses under its new spot give way by themselves (the app removes them); keep refit "none" so the rest of the neighbourhood stays as it is.
- Changes across the whole site ("all the apartments", "every pool", "no 3-story buildings") are one op with every (a use or a kind) and no target, with floorsOver to pick only the taller ones: "nothing over 3 stories" is change every multifamily, floorsOver 3, floors 3. Never answer a site-wide request with a handful of the pieces listed.
- Homes on lots (use sfr): houses.byStories counts them by stories and houses.mix is their mix; on a big neighbourhood they aren't listed. Their stories change through homeMix, never by ops: each home's lot is sized for its stories, so the app lays the lots out again along the same streets. "Only 1- and 2-story homes, no 3-story" is homeMix with the 1- and 2-story shares of houses.mix scaled up to 100 and no 3-story; "all single-story" is 1-story at 100. Townhomes and duplexes are buildings: use every.
- The summary says only what the ops and homeMix do. If nothing you can do matches the request, give no ops, say so in question, and never claim a change you didn't make.
- Never invent ids. If it's unclear which piece they mean, ask one short question instead.`;
// where things are on the drawing (lib/siteedit.mjs placesOf), as the browser sent it: points and names only, kept small
const pt = v => Array.isArray(v) && v.length >= 2 && v.slice(0, 2).every(x => Number.isFinite(+x)) ? v.slice(0, 2).map(x => Math.round(+x)) : null;
function placesIn(p) {
  if (!p || typeof p !== 'object') return undefined;
  const site = Object.fromEntries(['front', 'middle', 'back', 'left', 'right'].map(k => [k, pt(p.site?.[k])]).filter(([, v]) => v));
  const area = a => ({ name: clip(a?.name, 60), ...(a?.use ? { use: clip(a.use, 20) } : {}), ...(Number.isFinite(+a?.count) ? { count: +a.count } : {}), middle: pt(a?.middle), from: pt(a?.from), to: pt(a?.to) });
  return { site, areas: (Array.isArray(p.areas) ? p.areas : []).slice(0, 20).map(area).filter(a => a.middle), zones: (Array.isArray(p.zones) ? p.zones : []).slice(0, 8).map(area).filter(a => a.middle) };
}
// where streets meet (lib/siteplan.mjs junctionsOf, as describePlan lists them): a point, its legs, the streets' names, the main one, an entrance that ends there
const junctionsIn = J => (Array.isArray(J) ? J : []).slice(0, 16).map(j => ({ at: pt(j?.at), legs: Math.min(8, Math.max(2, Math.round(num(j?.legs)))) || 3, meets: (Array.isArray(j?.meets) ? j.meets : []).slice(0, 4).map(s => clip(s, 40)), ...(j?.main ? { main: true } : {}), ...(j?.entry ? { entry: clip(j.entry, 40) } : {}) })).filter(j => j.at);
const opt = v => v == null || v === '' ? null : num(v); // a number that may be left out (null stays null, not 0)
// the homes on lots as the browser counted them (lib/siteedit.mjs describePlan): how many, by stories, and their mix
const mixIn = m => (Array.isArray(m) ? m : []).filter(t => [1, 2, 3].includes(t?.stories) && Number.isFinite(+t.pct) && +t.pct > 0).slice(0, 3).map(t => ({ stories: t.stories, pct: Math.min(100, Math.round(+t.pct)) }));
function housesIn(h) {
  if (!h || typeof h !== 'object') return undefined;
  return { count: num(h.count), listed: !!h.listed, byStories: Object.fromEntries(Object.entries(h.byStories && typeof h.byStories === 'object' ? h.byStories : {}).filter(([k]) => ['1', '2', '3'].includes(k)).map(([k, v]) => [k, num(v)])), mix: mixIn(h.mix) };
}
// names from the AI: the community's, and parts by index (at most 8, each a name that isn't empty), each at most 60 characters
const nameOut = v => typeof v === 'string' && v.trim() ? clip(v.trim().replace(/\s+/g, ' '), 60) : null;
export const namesIn = n => ({ community: nameOut(n?.community), parts: (Array.isArray(n?.parts) ? n.parts : []).filter(x => Number.isInteger(x?.part) && x.part >= 0 && x.part <= 20 && nameOut(x.name)).slice(0, 8).map(x => ({ part: x.part, name: nameOut(x.name) })) });
async function edit(b, key, res) {
  const prompt = clip(b.prompt, 1200).trim(), plan = b.plan && typeof b.plan === 'object' ? b.plan : null; if (!prompt || !plan) return res.status(400).json({ error: 'Say what to change.' });
  const pieces = (Array.isArray(plan.pieces) ? plan.pieces : []).slice(0, 500).map(p => ({ id: clip(p.id, 40), name: clip(p.name, 60), kind: clip(p.kind, 20), use: p.use ? clip(p.use, 20) : null, at: Array.isArray(p.at) ? p.at.slice(0, 2).map(num) : null, size: Array.isArray(p.size) ? p.size.slice(0, 2).map(num) : null, turn: num(p.turn), floors: num(p.floors), units: num(p.units), type: p.type ? clip(p.type, 90) : null, note: p.note ? clip(p.note, 80) : null, ...(typeof p.boulevard === 'boolean' ? { boulevard: p.boulevard, width: num(p.width) } : {}), ...(p.of ? { of: clip(p.of, 40) } : {}), ...(Number.isFinite(+p.across) && p.across != null ? { across: num(p.across) } : {}), ...(p.selected ? { selected: true } : {}), ...(p.pinned ? { pinned: true } : {}) }));
  const parts = (Array.isArray(plan.parts) ? plan.parts : []).slice(0, 8).filter(x => Number.isInteger(x?.part)).map(x => ({ part: x.part, use: clip(x.use, 20), label: clip(x.label, 30), name: x.name ? clip(x.name, 60) : null }));
  const ids = new Set(pieces.map(p => p.id)), image = typeof b.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(b.image) && b.image.length < 600000 ? b.image : null;
  const text = JSON.stringify({ request: prompt, site: { ...JSON.parse(siteText(b.site, '', null, null)).site, ...(plan.site || {}) }, totals: plan.totals || null, parking: plan.parking || null, community: plan.community ? clip(plan.community, 60) : null, parts, houses: housesIn(plan.houses), places: placesIn(plan.places), junctions: junctionsIn(plan.junctions), selected: pieces.find(p => p.selected)?.id || null, pieces }) + '\n\nBuilding library (type id = name):\n' + catalogText();
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: EDIT_SYSTEM, user: text, name: 'site_edit', schema: EDIT_SCHEMA, maxTokens: 16000, effort: 'high', images: image ? [image] : [] }));
    const d = r.data, kinds = new Set(['building', 'pool', 'play', 'court', 'green', 'plaza', 'pond', 'garage', 'patio', 'entrance', 'roundabout', 'loop']);
    const every = o => (o.action === 'change' || o.action === 'remove') && !ids.has(o.target) && EVERY.includes(o.every);
    let homeMix = mixIn(d.homeMix);
    const ops = (d.ops || []).slice(0, 30).filter(o => ['change', 'remove', 'add', 'move', 'swap'].includes(o.action) && (o.action === 'add' || ids.has(o.target) || every(o)) && (o.action !== 'swap' || ids.has(o.with))).filter(o => {
      if (!(every(o) && o.every === 'sfr' && o.action === 'change' && [1, 2, 3].includes(o.floors))) return true; // homes on lots by stories: that's the home mix
      if (!homeMix.length) homeMix = Number.isInteger(o.floorsOver) ? keepStories(mixIn(plan.houses?.mix).length ? mixIn(plan.houses.mix) : HOME_MIX, [1, 2, 3].filter(n => n <= o.floorsOver || n === o.floors)) || [] : [{ stories: o.floors, pct: 100 }]; return false; // (only the taller ones: the rest keep their shares)
    }).map(o => ({
      action: o.action, target: ids.has(o.target) ? o.target : null, every: every(o) ? o.every : null, floorsOver: every(o) && Number.isInteger(o.floorsOver) && o.floorsOver >= 0 && o.floorsOver < 60 ? o.floorsOver : null, with: ids.has(o.with) ? o.with : null, type: o.type && typeById(o.type) ? o.type : null, kind: kinds.has(o.kind) ? o.kind : null, use: USES[o.use] ? o.use : null, name: o.name ? clip(o.name, 60) : null,
      floors: Number.isInteger(o.floors) && o.floors >= 1 && o.floors <= 60 ? o.floors : null, units: Number.isInteger(o.units) && o.units >= 1 && o.units <= 2000 ? o.units : null, w: num(o.w) > 4 && o.w < 2000 ? +o.w : null, d: num(o.d) > 4 && o.d < 2000 ? +o.d : null, x: opt(o.x), y: opt(o.y), turn: opt(o.turn),
      turnBy: Number.isFinite(+o.turnBy) && o.turnBy != null && Math.abs(+o.turnBy) <= 360 ? +o.turnBy : null, boulevard: typeof o.boulevard === 'boolean' ? o.boulevard : null, signs: ['median', 'both', 'one', 'none'].includes(o.signs) ? o.signs : null }));
    const names = namesIn(d.names);
    res.setHeader('Cache-Control', 'no-store');
    const any = ops.length || homeMix.length || names.community || names.parts.length;
    return res.json({ ops, homeMix, names, refit: d.refit === 'full' ? 'full' : 'none', summary: any ? clip(d.summary, 500) : '', question: any ? null : clip(d.question || '', 300) || null });
  } catch (e) {
    console.error('siteplan edit', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now.' });
  }
}

// ---------- names that fit the place: the community and its parts ----------
export const NAMES_SCHEMA = { type: 'object', additionalProperties: false, required: ['choices'], properties: { choices: { type: 'array', description: '2 or 3 sets of names', items: { type: 'object', additionalProperties: false, required: ['community', 'parts', 'why'], properties: {
  community: str('The development’s name: short, easy to say, from the place'),
  parts: { type: 'array', description: 'one name for each part given (by its part index); none for a development of one part', items: { type: 'object', additionalProperties: false, required: ['part', 'name'], properties: { part: { type: 'integer' }, name: str('This part’s name, going with the community’s') } } },
  why: str('One short line: what the names draw on') } } } } };
export const NAMES_SYSTEM = `You name a planned development in the Houston region for a site-planning tool: the community, and each of its parts (the neighbourhood, a retail center, an apartment complex, a business park, the commons) when it has more than one.
- Draw on the place: the creeks and bayous, the roads, the town and its history, the land (prairie, pines, oaks, the river bottom), the county. Use what the site's facts give; don't invent local history.
- Names a buyer or a tenant would say aloud, in a real-estate register: Landing, Crossing, Reserve, Village, Park, Market, Commons, Station, Grove. Short; no numbers.
- Each part's name goes with the community's ("Beacon Hill" → "Beacon Hill Market", "The Residences at Beacon Hill", "Beacon Hill Commons").
- Never a famous trademark, and never the exact name of a well-known existing subdivision or center nearby.
- Give 2 or 3 choices that differ in feel (one plain, one grander, one from the land). If a theme is given, follow it.
- why: one short line on what each choice draws on.`;
async function names(b, key, res) {
  const parts = (Array.isArray(b.parts) ? b.parts : []).slice(0, 8).filter(x => Number.isInteger(x?.part)).map(x => ({ part: x.part, use: clip(x.use, 20), label: clip(x.label, 30), acres: num(x.acres), units: num(x.units) }));
  const s = JSON.parse(siteText(b.site, clip(b.theme, 200), null, b.facts)), cur = namesIn(b.current), known = new Set(parts.map(p => p.part));
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: NAMES_SYSTEM, user: JSON.stringify({ theme: s.request || null, site: s.site, parts, current: cur }), name: 'site_names', schema: NAMES_SCHEMA, maxTokens: 4000, effort: 'low' }));
    const choices = (r.data?.choices || []).slice(0, 3).map(c => ({ community: nameOut(c.community), parts: (Array.isArray(c.parts) ? c.parts : []).filter(x => known.has(x?.part) && nameOut(x.name)).map(x => ({ part: x.part, name: nameOut(x.name) })), why: clip(c.why || '', 160) })).filter(c => c.community);
    if (!choices.length) throw new Error('no names');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ choices });
  } catch (e) {
    console.error('siteplan names', e.message);
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
// the fact sheet as sent: plain values only, strings (to n characters), arrays and depth kept short
function tidy(v, d = 0, n = 700) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return clip(v, n);
  if (d >= 6 || typeof v !== 'object') return null;
  if (Array.isArray(v)) return v.slice(0, 80).map(x => tidy(x, d + 1, n));
  return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [clip(k, 48), tidy(x, d + 1, n)]));
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
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: ASK_SYSTEM, user, name: 'plan_answer', schema: ASK_SCHEMA, maxTokens: 12000, effort: effortIn(b.effort, 'medium') }));
    const d = r.data, answer = clip(d.answer, 2400).trim();
    if (!answer) throw new Error('empty answer');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ answer, followups: (d.followups || []).map(t => clip(t, 160).trim()).filter(Boolean).slice(0, 3) });
  } catch (e) {
    console.error('siteplan ask', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now. Try again in a moment.' });
  }
}

// ---------- questions about a whole project ----------
export const PROJECT_ASK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['answer', 'followups'],
  properties: {
    answer: str('The answer, in plain words: two to six sentences, or a short list (lines starting "- ") for a breakdown or an email summary.'),
    followups: strs('Up to 3 short questions the user might ask next about this project, answerable from the same facts, in their words. Empty when none.')
  }
};
export const PROJECT_ASK_SYSTEM = `You are a land planner and development analyst advising on one development project in a site-planning tool used by a commercial construction company in the Houston region. You get a fact sheet the tool put together: the project (name, status, client, target use, notes, the parcels with owners, acres and appraised values), the site's jurisdiction facts looked up from public map services (county, city limits, zoning when known, FEMA floodplain, water or utility district, school district, TIRZ, Opportunity Zone, the busiest road and its traffic, EPA-regulated facilities nearby, utilities), and each site plan option's key numbers (use, floor area, units, coverage, parking needed and provided, stormwater, the checks, the pro forma's headline, how many renderings it has).
- Answer from those facts and explain the why: the number, fact or rule behind it. When comparing options, name them and give the numbers that separate them.
- Use only the facts given. Never invent numbers, approvals, codes, costs, owners or dates. When the facts don't say (a city's own requirement, utility capacity, title, environmental history), say plainly that it isn't in the project's facts, then say what would settle it (the city or county, the utility district, a survey, a title company, a Phase I ESA, a civil engineer, a market study).
- Approvals and due diligence: reason from the facts (inside a city or unincorporated, floodplain, MUD or no district, several parcels needing a replat, a busy state road needing a driveway permit, EPA facilities nearby) and say these are the usual steps to confirm, not a complete list. The City of Houston has no zoning but has building lines, parking rules and platting; Texas counties generally can't zone.
- Parking ratios, stormwater storage and the pro forma's numbers are the tool's typical starting assumptions, not a city's requirement or a quote: say so when it matters. Never claim code compliance; the plans are concept test-fits.
- Short and plain, as you'd say it to a developer: two to six sentences, or a short list. An email summary may run a little longer, in plain sentences. No headings, no markdown beyond "- " list lines.
- If the question isn't about this project or its site, say briefly that you can only answer about the project that's open.`;
async function askProject(b, key, res) {
  const question = clip(b.question, 600).trim(), project = b.project && typeof b.project === 'object' && !Array.isArray(b.project) ? tidy(b.project, 0, 1500) : null; // (the project's notes run to 1,500 characters: lib/project.mjs)
  if (!question) return res.status(400).json({ error: 'Ask a question about the project.' });
  if (!project) return res.status(400).json({ error: 'Open a project first.' });
  let facts = JSON.stringify(project); if (facts.length > 48000 && Array.isArray(project.options)) { project.options = project.options.slice(0, 8); facts = JSON.stringify(project); }
  if (facts.length > 60000) facts = facts.slice(0, 60000); // still too big: cut (the model reads what's there)
  const history = (Array.isArray(b.history) ? b.history : []).slice(-6).map(t => ({ q: clip(t?.q, 600), a: clip(t?.a, 1500) })).filter(t => t.q && t.a);
  const user = 'Fact sheet for the project on the screen:\n' + facts + (history.length ? '\n\nEarlier in this conversation:\n' + history.map(t => 'Q: ' + t.q + '\nA: ' + t.a).join('\n\n') : '') + '\n\nQuestion: ' + question;
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: PROJECT_ASK_SYSTEM, user, name: 'project_answer', schema: PROJECT_ASK_SCHEMA, maxTokens: 12000, effort: effortIn(b.effort, 'medium') }));
    const d = r.data, answer = clip(d.answer, 3000).trim();
    if (!answer) throw new Error('empty answer');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ answer, followups: (d.followups || []).map(t => clip(t, 160).trim()).filter(Boolean).slice(0, 3) });
  } catch (e) {
    console.error('siteplan askProject', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now. Try again in a moment.' });
  }
}
