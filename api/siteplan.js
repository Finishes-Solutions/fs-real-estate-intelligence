// AI for site plans. The layout itself always comes from the engine in the browser (lib/sitelayout.mjs), so the
// geometry is measured, never made up by the model; the model decides what to build and judges what was drawn.
//   POST { prompt, site, facts, program }                       -> { program, setbacks, summary, assumptions }
//        the request (and what's known about the site) turned into a development program
//   POST { mode: 'review', prompt, site, facts, program, round, options: [{ name, metrics, issues, notes, image }] }
//        -> { reviews: [{ option, score, verdict, strengths, problems }], ranking, revise, program, params, why, summary }
//        the engine's options judged as a land planner would (drawings and numbers); a revised program to lay out again
//   POST { mode: 'bestuse', prompt?, site, facts, nearby, market } -> { ideas: [{ title, use, fit, why, risks, request }], summary }
//        what should go on the site, from what's known about it, each idea a request the builder can lay out
//   POST { mode: 'strategy', prompt, site, facts, program, effort, count, briefFor? } -> { strategies: [...], pick, why }
//        the site thought through before anything is placed (one plan, or three compared for Ultra): what goes where and
//        why, the ways in, the parking and the pond, a check of the numbers. The program call and the review then follow it.
//        briefFor (a commercial site: lib/planbrief.mjs briefContext): each strategy also carries the AI's brief for the
//        parking-field engine, { brief, reasons, leasableSf, check } (lib/planbrief.mjs briefFrom), or briefNote when the
//        brief it gave made no sense. The browser lays the brief out beside the engine's own search ("AI's plan").
//        review takes briefCheck { option, brief, reasons, met, mayRevise }: the AI's plan among the options; when the
//        engine couldn't do it as written and mayRevise, the answer's brief is the AI's revised one (once, High and Ultra).
//        option null with dropped (the engine's reason): the plan didn't fit at all, so none of the options is the AI's
//   POST { mode: 'ask', question, history: [{ q, a }], plan: {...facts}, effort } -> { answer, followups }
//        a question about the open plan, answered from the fact sheet the browser computed (lib/planask.mjs planFacts)
//   POST { mode: 'askProject', question, history: [{ q, a }], project: {...facts}, effort } -> { answer, followups }
//        a question about a whole project (the Projects page's Ask tab): its information, the site's jurisdiction facts
//        and every option's headline numbers (lib/project.mjs projectFacts)
// guardrails (strategy, program, review, edit and ask; lib/guardrails.mjs forAI): a plan under the Waller guardrails. Their
// instruction and the active profile values join the system prompt, and the answer's text is filtered for prohibited conclusions.
// effort (strategy, program, review and ask): how hard the model thinks, 'low' | 'medium' | 'high' | 'xhigh' (the effort
// level picked under Build; Ultra plans at xhigh, which steps down to high on a model that doesn't take it); missing or
// unknown keeps the default (high, medium for ask). review also takes rounds (1-3, default 2): the last round never
// revises. program and review take the strategy the planning step chose (strategy), and follow or judge against it.
// refs (strategy, program, review, edit, ask, askProject, bestuse): the facts the team confirmed from the project's
// reference files (a survey, floor plans: lib/sitefiles.mjs refsForAI), short lines added after the user text (refBlock).
// provider, model (every mode): which AI answers. provider 'anthropic' = Claude (model a Claude model id, else the server's
// Claude default, Opus 5.5); otherwise OpenAI (model an OpenAI model id, else OPENAI_MODEL). The rule sheet's and best
// use's web searches stay on OpenAI (api/search.js). The answering model is said in the X-AI-Model header.
// site: { acres, widthFt, depthFt, frontageFt, address, city, county, zoning }; facts: short lines (flood zone, roads
// and traffic, districts, utilities, environmental records).
import { withRoom } from '../lib/openai.mjs';
import { router, chatJSON } from '../lib/airoute.mjs';
import { USES, SETBACKS, HOME_MIX, HOME_KINDS, PLACES, guessProgram, normalizeProgram } from '../lib/siteplan.mjs';
import { AMENITIES } from '../lib/sitecompose.mjs';
import { catalogText, keepStories } from '../lib/siteedit.mjs';
import { typeById } from '../lib/buildings.mjs';
import { recipeIn, programOf, customOf, teamTypesForAI, OUTDOOR, PER, PATTERNS } from '../lib/customtypes.mjs';
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';
import { webSearch } from './search.js';
import * as RS from '../lib/rulesheet.mjs';
import { SUFFIXES, namesFor } from '../lib/streetnames.mjs';
import * as G from '../lib/guardrails.mjs';
import * as BR from '../lib/planbrief.mjs';
import { FIELD_USES } from '../lib/siteparking.mjs';
import { refBlock } from '../lib/sitefiles.mjs';

const EFFORTS = ['low', 'medium', 'high', 'xhigh'], effortIn = (v, d) => EFFORTS.includes(v) ? v : d; // reasoning effort (OpenAI's reasoning_effort, Claude's output_config.effort: the same four levels), from an allow-list
// the model for this request (lib/airoute.mjs): Settings › AI model › Site plans, OpenAI or Claude and which model, when
// the key can use it, else the server's default; said in the X-AI-Model header so the app can show which model answered
const { ai } = router(() => process.env.OPENAI_MODEL);

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
const STREETS = ['curved', 'network', 'wave', 'straight']; // Settings › Neighbourhood streets
// the homes' own numbers (single-family, townhomes, duplexes), on the program and on a mix's home zone (lib/siteplan.mjs
// homeSpec): one home's size, the number of floor plans, the smallest lot, a lot's width and depth
const HOME_FIELDS = who => ({
  homeSfMin: n('Homes only' + who + ': the smallest home, sq ft of ONE home ("1,600-2,100 SF homes": 1600; "2,400 sf homes": 2400). Never a total. null when not said.'),
  homeSfMax: n('Homes only' + who + ': the largest home, sq ft of ONE home ("1,600-2,100 SF homes": 2100; "2,400 sf homes": 2400). null when not said.'),
  floorPlans: int('Homes only' + who + ': how many different floor plans, house plans or models the builder offers ("3 floorplans": 3). Never floors or stories. null when not said.'),
  minLotSf: n('Homes only' + who + ': the smallest lot, sq ft ("lots need a minimum of 6,600 SF": 6600; "7,000 sf lots": 7000). null when not said.'),
  lotW: n('Homes only' + who + ': the narrowest lot, ft ("60 ft lots", "60 x 120 lots": 60). null when not said.'),
  lotD: n('Homes only' + who + ': the lot depth, ft ("60 x 120 lots": 120). null when not said.'),
  homeKind: { type: ['string', 'null'], enum: [...Object.keys(HOME_KINDS), null], description: 'Single-family (use sfr) only' + who + ': a home community instead of a subdivision: manufactured = manufactured / mobile homes (a mobile home park, single- and double-wides); tiny = tiny homes, park models, small cottages; mixed = both ("a tiny home / mobile home community"). The engine lays out private lanes in loops with home lots on both sides, the way an RV park lays out its sites. null for an ordinary subdivision.' },
  homeW: n('Home community (homeKind) only' + who + ': one home\'s width, ft, the end that faces the lane ("16 x 40 tiny homes": 16). null when not said: the homes are sized to fill the pad, or to homeSfMin / homeSfMax.'),
  homeD: n('Home community (homeKind) only' + who + ': one home\'s length, ft ("16 x 40 tiny homes": 40). null when not said.'),
  buffer: n('Home community (homeKind) only' + who + ': a landscape strip along the property line, ft, only when they ask for one ("a 10 ft buffer": 10; "lots to the property line", "no buffer": 0). null when not said: the lots run to the property line, as in an RV park.') });
export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['use', 'gfa', 'atLeast', 'form', 'floors', 'units', 'buildings', 'ratio', 'perUnit', 'depth', 'detentionPct', 'storm', 'truck', 'through', 'compare', 'trash', 'entrances', 'product', 'extras', 'storage', 'foodtrucks', 'fuel', 'custom', 'parcels', 'questions', 'setbacks', 'homeSfMin', 'homeSfMax', 'floorPlans', 'minLotSf', 'lotW', 'lotD', 'homeKind', 'homeW', 'homeD', 'buffer', 'zones', 'summary', 'assumptions'],
  properties: {
    use: { type: 'string', enum: Object.keys(USES), description: 'Main use. storage = self storage (climate-controlled, drive-up, mini-storage, RV / boat storage). foodtrucks = a food truck park (food truck court, truck stalls round a pavilion, beer garden). fuel = a gas station / convenience store (c-store, fueling station, pumps, a QT or Buc-ee\'s style store; a truck stop or travel center too, laid out as the car version). other = anything that fits none of these: a daycare, a school, a pickleball club, an RV park, an event venue… (then custom holds its recipe).' },
    gfa: n('Total building floor area in square feet across all floors. null when the request gives no size (the tool then uses a typical size for the use and site) or asks for as much as fits.'),
    atLeast: { type: ['boolean', 'null'], description: 'true when the size is a minimum ("6000+ sf", "at least 6,000 sf", "6,000 sf or more"): gfa is that minimum and the layout grows past it where it fits. null otherwise (a size is what was asked).' },
    form: { type: ['string', 'null'], enum: ['bar', 'L', 'U', 'tower', null], description: 'The building shape when the request names one: L ("L-shaped"), U ("U-shaped", a courtyard building), tower (a tower on a podium), bar (a straight bar). null when it doesn\'t say.' },
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
    fuel: { type: 'object', additionalProperties: false, required: ['pumps', 'storeSf', 'wash', 'vac', 'canopy', 'islands', 'truckStop'], description: 'A gas station (use fuel, or a fuel zone in a mix); all null otherwise.',
      properties: { pumps: { type: ['integer', 'null'], description: 'Fuel pumps (MPDs, multi-product dispensers): 4, 6, 8, 10, 12 or 16; each has two fueling positions ("16 fueling positions" = 8). null = 8.' },
        islands: { type: ['string', 'null'], enum: ['along', 'across', null], description: 'Which way the pump islands run: along the street (cars pull through side to side; the default) or across it (perpendicular, cars pull in toward the store). null = along.' }, storeSf: n('The convenience store, sq ft (usually 3,000-6,000; 4,500 typical). null = 4,500.'),
        wash: { type: ['boolean', 'null'], description: 'A car wash tunnel with its stacking lane, when asked for.' }, vac: { type: ['boolean', 'null'], description: 'Air / vacuum stalls. false only when they say none; null = yes.' },
        canopy: { type: ['string', 'null'], enum: ['auto', 'front', 'side', null], description: 'Which street the canopy runs along: front (the busier street), side (the side street of a corner lot), auto or null = the front unless only the side fits.' },
        truckStop: { type: ['boolean', 'null'], description: 'true when they ask for a truck stop, travel center or diesel lanes for trucks (laid out as the car version for now).' } } },
    custom: CUSTOM,
    parcels: { type: 'array', description: 'Only for a site of several parcels (site.parcels, 2 or more) when the request puts different things on different parcels: one entry per parcel it names, in the request\'s own words. Empty otherwise (one program for the whole site).',
      items: { type: 'object', additionalProperties: false, required: ['parcel', 'request'], properties: { parcel: s0('Which parcel, as the request names it: its acreage ("5.88 acre"), "corner", "largest", "smallest", "back", words of its address, or its number in site.parcels ("2").'), request: s0('What goes on it, in the request\'s own words with its size: "45,000 sf of retail shops with 3 pads".') } } },
    questions: { type: 'array', items: { type: 'string' }, description: 'Only for a site of several parcels (site.parcels, 2 or more): when the request does not say which use goes on which parcel, or leaves a parcel with nothing and no word about it, or gives no size for a parcel\'s use: 1 to 3 short questions for the person (name the parcels by acreage and what they front). Empty when the request is clear, when it names one program for the whole site on purpose ("30,000 sf of shops across both parcels"), or when the site is one parcel. Still fill the rest of the program with your best reading.' },
    setbacks: { type: 'object', additionalProperties: false, required: ['front', 'side', 'rear', 'paving'], description: 'Feet. null keeps the default.',
      properties: { front: n('Building setback from the street.'), side: n('Side setback.'), rear: n('Rear setback.'), paving: n('Landscape buffer between paving and the lot lines.') } },
    ...HOME_FIELDS(' (the whole program; on a mix, the same as its home zone)'),
    zones: { type: 'array', description: 'Mixed use only: 2 to 5 zones from the street back (commercial in front, amenity/commons in the middle, apartments, then townhomes, then duplexes/cottages at the back). Empty for a single use.',
      items: { type: 'object', additionalProperties: false, required: ['use', 'gfa', 'units', 'floors', 'buildings', 'pads', 'items', 'name', 'placement', 'homeSfMin', 'homeSfMax', 'floorPlans', 'minLotSf', 'lotW', 'lotD', 'homeKind', 'homeW', 'homeD', 'buffer'], properties: {
        use: { type: 'string', enum: [...Object.keys(USES), 'garage'], description: 'garage: a parking garage at this point in the order (floors = levels).' }, gfa: n('Total floor area for commercial uses, sq ft. null for homes (one home\'s size goes in homeSfMin / homeSfMax).'),
        ...HOME_FIELDS(' (this zone\'s homes)'), units: { type: ['integer', 'null'], description: 'Homes in this zone (apartments, townhomes, duplex units).' },
        floors: { type: ['integer', 'null'] }, buildings: { type: ['integer', 'null'] }, pads: { type: ['integer', 'null'], description: 'Pad sites at the street (restaurants, coffee) for a retail zone, 0-4.' },
        items: { type: 'array', items: { type: 'string', enum: AMENITIES }, description: 'For an amenity zone: what it holds (lake = wet detention).' }, name: { type: ['string', 'null'], description: 'A short zone name, e.g. "Retail", "Commons".' },
        placement: { type: 'object', additionalProperties: false, required: ['where', 'road', 'next', 'side'], description: 'Where this zone goes, as they said it; all null (next empty) when they don\'t say.', properties: {
          where: { type: ['string', 'null'], enum: [...PLACES, null], description: 'corner: at the corner of two roads; along: along a road; front, back, middle; beside, between (a buffer), around (homes round a lake or commons): next says what.' },
          road: { type: ['string', 'null'], description: 'The road it is at or along, as they said it ("FM 362", "the highway", "the side street").' },
          next: { type: 'array', items: { type: 'integer' }, description: 'Zone indexes (0-based in this list): beside [j], between [i, j], around [j].' },
          side: { type: ['string', 'null'], enum: ['left', 'right', null], description: 'Left or right as seen from the street ("the left corner").' } } } } } },
    summary: { type: 'string', description: 'One sentence: what will be laid out, in plain words.' },
    assumptions: { type: 'array', items: { type: 'string' }, description: 'Up to 4 short assumptions you made that the user may want to change.' }
  }
};

export const SYSTEM = `You set up a development program for a site-planning tool used by a commercial construction company in the Houston region. A separate layout engine places the buildings, parking, drives and detention on the parcel; you only choose the numbers.
A site of several parcels (site.parcels lists them with acreage, whether each is on a corner or landlocked): when the request puts different things on different parcels, fill parcels (one entry per parcel named, its request in the person's words) and set the program to the first; when it doesn't say which use goes where, or leaves a parcel's program or size open, ask in questions (1 to 3, short, naming the parcels by acreage and what they front) and still give your best reading. A request that plainly means the whole site ("30,000 sf of shops" with no parcel named) needs no question.
- Follow the user's request. Fill gaps with typical suburban Houston-area practice: retail 4 spaces/1,000 sf, restaurant 10/1,000, office 3.5/1,000, medical office 5/1,000, hotel 1 space a room (about 550 sf a room, 1.82/1,000), church about 1 space for 3 seats (10/1,000), warehouse 0.5-1/1,000 plus a truck court, multifamily about 1.6 spaces per unit and 3 floors, about 900 sf per unit, townhomes 2 in the garage plus a quarter guest space a home. Ratios over 15/1,000 are capped at 15. Don't raise the defaults without a reason in the request: over-parking wastes land.
- The City of Houston has no zoning; building lines are usually 25 ft on major roads and 10 ft on local streets. Other cities and counties differ. If zoning limits are given, stay within them.
- Size the program to the site: check floor area and parking against the acreage given. If the request clearly can't fit, keep the use, set gfa to null and say so in assumptions.
- Mixed use (several uses on one site): fill zones from the street back, give each its size (floor area or units) when you can, and set the top-level use to the front zone's use. A single use: zones is empty.
- Where they say things go: keep the zones in street-to-back order ("on the front" / "by the road" first, "at the back" last, "in the middle" between: the bands style reads it), and give each zone its placement in words the layout honours: corner (at the corner of two roads; road: one of them), along (along a road; road as they said it), front, back, middle, beside (next [j]), between (next [i, j]: a buffer between two zones), around (next [j]: homes round a lake or commons). "Homes round a lake" is a sfr zone around the amenity zone that holds the lake (its items include lake). Leave placement all null when they don't say. Name each zone for where it is and what it holds ("Retail at the corner", "Commons and lake", "Homes round the lake").
- A number of buildings ("4 buildings", "two pads") goes in buildings, with gfa the total across them. Stormwater: retention when they ask for a wet pond or lake, underground when they ask for vaults or no pond, none for regional detention.
- Townhomes and duplexes: homes on their own lots with a public street fit about 6-10 units an acre; denser than that, use product court6 (or court), rows on a shared parking court, rather than cutting the count.
- Homes' own numbers never go in gfa, floors or units: the size of ONE home goes in homeSfMin / homeSfMax ("1,600-2,100 SF homes": 1600 and 2100; "2,400 sf homes": 2400 and 2400); "3 floorplans" (house plans, models) is floorPlans 3, never floors or stories; "lots need a minimum of 6,600 SF" is minLotSf 6600; "60 x 120 lots" is lotW 60 and lotD 120. On a mix put them on the home zone and the top level alike. A home zone's gfa stays null.
- A neighbourhood, subdivision or "residential" with no count: a zone of use sfr with units null; it fills whatever land the other zones leave. Give sized zones (shops, apartments) their sizes; a community center or commons is an amenity zone (items may include center, pool, playground, pavilion, courts, lake), placed last when they say "at the back". Apartments of 80+ units already get their own clubhouse and pool by the entry: don't add a center or pool to a commons beside them unless for-sale homes (sfr, townhomes, duplexes) share it; one pool per community. A pool always comes with its center.
- Feasibility: one-story shops or restaurants with surface parking hold about 9,000-12,000 sq ft an acre; two-story offices about 14,000; garden apartments about 18-24 units an acre; homes on lots 4-6 an acre. If the ask is bigger than the land, still give the ask: the layout fits the most that works and says so.
- HARD RULE, a drive-thru is an extra, not a second use: "a retail building / center / strip with a drive-thru", an endcap coffee or QSR tenant with a drive-thru, is ONE use (retail) with extras ["drivethru"] and no zones. Use zones only when the request names separate uses as separate buildings or areas ("a 10,000 sf strip and a 2,500 sf restaurant pad", "shops with apartments above", "retail in front, townhomes behind"). Every zone you give has its size (gfa for commercial, units for homes) whenever the request gives a total; split the total between them. A pad named with the shops ("with 2 pads") is the shop zone's pads or the buildings count, not a restaurant zone.
- A size with + or "at least" ("6000+ sf", "at least 6,000 sf", "6,000 sf or more") is a minimum: gfa is that number and atLeast true, so the layout grows past it where it fits. Never read it as "about".
- A building shape in the words goes in form: "L-shaped" L, "U-shaped" or a courtyard building U, a tower on a podium tower. null when the request names none.
- Small extras with one main use (outdoor seating, a playground, a lawn, a drive-thru) go in extras, not in zones. "A single" building means buildings 1.
- The owner's goal is the most leasable and sellable square footage the property holds within the rules and the market: leasable floor area (shops, offices, apartments) plus the homes' sellable living area. Sizes you give are what's asked: the engine fills land left over with more of the same (more homes, longer shop and office buildings, more warehouse) up to what the parking and stormwater allow, as one plan, not a later phase, so don't shrink a request to leave land empty. Land is held for a later phase only when the request says so. Don't add uses they didn't ask for.
- A parking garage: a zone of use "garage" (floors = levels, usually 4-5) where they want it in the order ("a parking garage behind the offices"); offer one for dense offices, medical or shops on tight land. Industrial, warehouse and flex are use "industrial" (a truck court goes behind them), never homes.
- A tiny home, manufactured home or mobile home community (a mobile home park, park models, single- or double-wides on rented or sold lots) is use "sfr" with homeKind (manufactured, tiny, or mixed when they ask for both, as in "tiny home / mobile home"), never storage, never other, no zones unless they name another use: units only when they give a count of homes or lots, homeSfMin / homeSfMax only when they give sizes, lotW / lotD only when they give lot sizes. When they point to an RV park's layout (in their words or a reference file) for homes, that is this layout: lanes in loops with a row of lots each side, and its site size is the pad size to use (a reference with "134 RV lots, 25' × 55' typ": lotW 25, lotD 55, units null so the land fills), unless the request gives its own lot or pad size. Communities like this are usually rented out (the homes and pads rented together); the engine values them that way. The homes are sized to order: to fill the pad when only a pad size is given, or to the home size asked (homeSfMin / homeSfMax, or homeW × homeD), the pads growing to hold them.
- Self storage (climate-controlled, drive-up, mini-storage, RV / boat storage) is use "storage" (storing RVs and boats, never an RV park, campground or home community), never "industrial": floors is the climate-controlled building's (usually 3), storage.climateSf its floor area over all floors, storage.driveSf the drive-up rows', storage.rv the RV / boat spaces. Leave driveSf null to fill the site with drive-up rows (the usual: maximize rentable area), climateSf null to size the building to the site. Parking is a few spaces at the office (about 1 per 10,000 sf, ratio 0.1). The engine draws the building at the street with the office, drive-up rows behind on 26 ft aisles, and a fence with a keypad gate.
- A food truck park (food truck court, truck stalls, a beer garden with food trucks) is use "foodtrucks", one use (no zones, no extras): foodtrucks.trucks the stalls asked for (null = as many as fit), pavilionSf the covered seating (about 15 sf a seat), bar false only when they say no bar, barSf its size ("a small bar" about 1,500, "a large beer garden" about 3,000), playground false only when they say none, perTruck the parking a truck (4-6, usually 5). ratio is the bar's parking per 1,000 sf (about 8). gfa and units are null. The engine draws the trucks on a service lane round a pavilion and lawn, restrooms, the bar and its patio, a dumpster and grease enclosure, and the customer parking on the street side.
- A gas station, fueling station, convenience store or c-store with pumps is use "fuel" (never retail). With other uses (shops behind it, apartments, homes) it is a zone of use "fuel" in the mix, its settings still in the fuel object: the engine puts it on its own outparcel at the front corner and lays the rest out behind and beside it, with a cross-access drive. fuel.pumps the MPDs (4, 6, 8, 10, 12 or 16; two fueling positions each), fuel.islands "across" only when they want the pump islands perpendicular to the street (cars pulling in toward the store), else "along" or null, fuel.storeSf the store and gfa the same, fuel.wash for a car wash, fuel.vac false only if they say no air / vacuum, fuel.canopy only when they say which street. A QT, RaceTrac, Wawa or Buc-ee's style store means 12 pumps and a 5,000-6,000 sf store. A truck stop or travel center: use fuel with truckStop true, and say in the assumptions that it is laid out as a gas station for cars (no diesel lanes, truck parking or scales yet). The engine puts the canopy between the store and the busier street, drive lanes round it, the tanks where the fuel truck reaches them, and on a corner lot a driveway on each street kept back from the corner. Parking ratio is per 1,000 sf of the store (about 4).
- Housing asked for in general ("multifamily", "rental housing", "build-to-rent") with no product named: use multifamily with compare true; the engine lays out garden apartments, studio/1-bed apartments, townhomes and duplexes and ranks them by value. When they name a product, use it.
- Trash enclosures only when they ask for them (trash true).
- An event or wedding venue (a wedding pavilion or barn, an event center, a banquet or reception hall) is use "venue": parked at a space for every 2.5 guests (about 10 per 1,000 sf). Tennis, pickleball and basketball courts beside another use are courts (amenity items), each at its regulation size.
- A building type none of these uses covers (a daycare, a pickleball or tennis club, an RV park, a car wash on its own, a school, mini golf, a dog daycare, a brewery with a beer garden…) is use "other" with its recipe in custom, never a bare box: custom.name what it is; custom.pattern the engine's layout that suits it (row: a building row facing its parking; pads: several freestanding buildings; commons: a building with outdoor pieces beside it; yard: rows of sites on drive aisles); custom.buildings each with a label and a library type id when one fits (libraryTypes) or its size w × d ft, floors and count; custom.outdoor the outdoor pieces with counts and sizes; custom.sites a yard's sites; custom.parking its rule, the way a city counts it: per seat (a venue or school: 1 a 3 seats, 1 a 4 students), per child (a daycare: about 0.2-0.25 a child, staff and drop-off), per court (3-4 a court, plus plus1k for the clubhouse), per site (an RV park: 0.1-0.2 a site for visitors, each site holds its own car, plus plus1k for the office), per pad, or per 1,000 sf; custom.figures 2-4 short figures ("120 children", "8 courts"). Size from typical practice (a daycare about 85 sf a child inside and 75 sf a child of playground; a pickleball club's clubhouse 3,000-6,000 sf; an RV park about 15-20 sites an acre). gfa is the buildings' total, ratio null. Other uses leave custom empty (name null).
- When teamTypes are given, they are building types the team saved before: when the request names or describes one ("another one like our pickleball club", "our daycare"), reuse its recipe and sizes (its name, pattern, buildings, outdoor pieces, sites and parking rule), changing only what the request changes.
- Never claim code compliance. Assumptions are short phrases, e.g. "4 spaces per 1,000 sf (typical retail)".
- When a plannedStrategy is given, the site was thought through before this step: follow it. Its placement sets the zone order and each zone's placement (front, middle, back, corner), its entrances the entrances count, its stormwater the storm type, its buildings the building count and floors. Only where it contradicts the request does the request win (say so in assumptions).`;

const factsOf = facts => (Array.isArray(facts) ? facts : []).slice(0, 14).map(t => clip(t, 300)).filter(Boolean);
// a few library types an AI-crafted type often uses (custom.buildings[].type)
const LIBRARY_HINTS = ['retail-daycare-10-000-sf', 'retail-fitness-20-000-sf', 'other-event-hall-8-000-sf', 'other-community-center-7-700-sf', 'other-pavilion-4-000-sf', 'clubhouse-clubhouse-4-500-sf', 'clubhouse-clubhouse-7-500-sf', 'other-church-12-000-sf', 'restaurant-brewpub-10-000-sf', 'fuel-wash-car-wash-express-tunnel-110-ft', 'storage-office-leasing-office-1-200-sf'].filter(id => typeById(id));
export function siteText(site = {}, prompt = '', program = null, facts = null, strategy = null, teamTypes = null) {
  const s = site || {}, f = v => v == null || v === '' ? null : String(v).slice(0, 200);
  const z = s.zoning && typeof s.zoning === 'object' ? Object.fromEntries(Object.entries(s.zoning).filter(([, v]) => v != null && v !== '').slice(0, 12).map(([k, v]) => [k, String(v).slice(0, 120)])) : null;
  const side = (Array.isArray(s.sideStreetsFt) ? s.sideStreetsFt : []).map(v => Math.round(+v)).filter(v => v > 0).slice(0, 4);
  const streets = (Array.isArray(s.streets) ? s.streets : []).slice(0, 4).map(q => ({ side: q?.side === 'side' ? 'side' : 'front', name: typeof q?.name === 'string' && q.name.trim() ? q.name.trim().slice(0, 40) : null, highway: !!q?.highway })); // the roads it fronts, by name where the map has one ("along FM 362")
  return JSON.stringify({ request: clip(prompt, 1200), site: { acres: +s.acres || null, approxWidthFt: +s.widthFt || null, approxDepthFt: +s.depthFt || null, streetFrontageFt: +s.frontageFt || null,
    ...(side.length ? { sideStreetsFt: side } : {}), ...(streets.length ? { streets } : {}), ...(s.shape ? { shape: f(s.shape) } : {}),
    ...(Array.isArray(s.parcels) && s.parcels.length > 1 ? { parcels: s.parcels.slice(0, 20).map((q, i) => ({ n: i + 1, label: f(q?.label), acres: +q?.acres || null, corner: !!q?.corner, landlocked: !!q?.landlocked, fronts: f(q?.fronts) })) } : {}), // (several parcels: each one, for a program each and the questions)
    address: f(s.address), city: f(s.city), county: f(s.county), zoning: z, facts: factsOf(facts) }, currentProgram: program || null, ...(strategy ? { plannedStrategy: strategy } : {}),
    ...(teamTypes?.length ? { teamTypes } : {}), ...(teamTypes ? { libraryTypes: LIBRARY_HINTS } : {}) });
}

// the model's program, made safe: unknown values dropped, the words' own reading filling gaps, zones normalized
function programFrom(d, prompt) {
  const g0 = guessProgram(prompt), sto = d.use === 'storage' || (!d.use && g0.use === 'storage') ? { storage: { ...(g0.storage || {}), ...Object.fromEntries(Object.entries(d.storage || {}).filter(([, v]) => v != null)) } } : {}; // storage: the words fill what the model left open
  const ftk = d.use === 'foodtrucks' || (!d.use && g0.use === 'foodtrucks') ? { foodtrucks: { ...(g0.foodtrucks || {}), ...Object.fromEntries(Object.entries(d.foodtrucks || {}).filter(([, v]) => v != null)) } } : {}; // a food truck park: the words fill what the model left open
  const fu = d.use === 'fuel' || (!d.use && g0.use === 'fuel') || (d.zones || []).some(z => z?.use === 'fuel') || (g0.zones || []).some(z => z.use === 'fuel') ? { fuel: { ...(g0.fuel || {}), ...Object.fromEntries(Object.entries(d.fuel || {}).filter(([, v]) => v != null)) } } : {}; // a gas station: the same
  const program = { ...normalizeProgram({ ...g0, ...Object.fromEntries(Object.entries(d).filter(([k, v]) => v != null && !['setbacks', 'summary', 'assumptions', 'zones', 'storage', 'foodtrucks', 'fuel', 'custom', 'parcels', 'questions'].includes(k))), ...sto, ...ftk, ...fu }), ...(d.gfa == null && d.units == null && d.use !== 'storage' && d.use !== 'fuel' ? { gfa: null } : {}) };
  const guess = guessProgram(prompt), mine = d.zones?.length > 1, zs = cleanZones(d.zones?.length > 1 ? d.zones : guess.zones, { gfa: d.gfa ?? g0.gfa, units: d.units ?? g0.units, words: guess.zones }); // the model's zones, else the ones read from the words; never a mix the words don't name, never one without sizes
  if (zs?.length > 1 && program.use !== 'foodtrucks') { const nz = normalizeProgram({ use: zs[0].use, zones: placed(zs, mine ? guess.zones : null), ...fu }).zones; program.zones = nz; program.use = nz.find(z => z.use !== 'fuel')?.use || nz[0].use; delete program.fuel; } // (a gas station zone: its pumps and the rest from the fuel object)
  else if (program.zones) { program.zones = null; program.use = USES[d.use] ? d.use : guess.use; if (program.gfa == null && (d.gfa ?? g0.gfa)) program.gfa = d.gfa ?? g0.gfa; } // (the zones dropped: the one use, with its size)
  // a size that's a minimum ("6000+ sf"): that much, grown where it fits; a building shape named in the words or by the AI
  if ((d.atLeast === true || g0.atLeast) && program.gfa && !program.zones) { program.max = true; program.atLeast = true; program.asked = { ...(program.asked || {}), gfa: program.gfa }; }
  const form = ['bar', 'L', 'U', 'tower'].includes(g0.form) ? g0.form : ['bar', 'L', 'U', 'tower'].includes(d.form) ? d.form : null; if (form) program.form = form; else delete program.form;
  // a tiny / manufactured home community in the words is homes on lots, whatever use the model picked (an RV park in a
  // reference file once made it self storage with RV stalls)
  if (g0.homeKind && !program.zones && program.use !== 'sfr') { const keep = ['units', 'homeSfMin', 'homeSfMax', 'floorPlans', 'minLotSf', 'lotW', 'homeW', 'homeD', 'buffer', 'storm', 'detentionPct', 'entrances', 'community', 'partName'];
    return BR.withWordsPads(normalizeProgram({ ...Object.fromEntries(keep.filter(k => program[k] != null).map(k => [k, program[k]])), ...g0, use: 'sfr', homeKind: g0.homeKind, ...(+d.lotD > 0 ? { lotD: d.lotD, lotSet: true } : {}) }), prompt); }
  if (g0.homeKind && !program.zones && !program.homeKind) program.homeKind = g0.homeKind;
  // floors the words don't fix stay open for an office or a medical office (unless the AI asks for more than usual), so
  // the engine tries a floor more before it builds less (normalizeProgram fills them in, which would lock them)
  if (!program.zones && (program.use === 'office' || program.use === 'medical') && BR.floorsFromWords(prompt) == null && !(+d.floors > USES[program.use].floors)) program.floors = null;
  const pp = (Array.isArray(d.parcels) ? d.parcels : []).filter(x => x && typeof x.parcel === 'string' && typeof x.request === 'string' && x.request.trim()).slice(0, 20).map(x => ({ parcel: clip(x.parcel, 80), program: guessProgram(clip(x.request, 300)) })); // a site of several parcels: a program each (lib/siteparcels.mjs), the words of each read as a request of its own
  if (pp.length) program.parcels = pp; else if (g0.parcels?.length) program.parcels = g0.parcels;
  for (const k of ['plaza', 'court', 'arrangement']) if (g0[k] != null && program[k] == null) program[k] = g0[k]; // (the arrangement the words ask for: a plaza round a court, a courtyard, a loop)
  if (g0.plaza && program.zones) { const rz = program.zones.find(z => z.use === 'retail'); if (rz) { rz.plaza = true; rz.court = g0.court || ['plaza', 'lawn', 'pavilion']; } }
  return BR.withWordsPads(program, prompt); // (a mix: the pads the words ask for on its shop zone)
}
// a mix's zones made safe (the program call and the review): a drive-thru or an endcap tenant on one building is its
// extra, not a second use, so when the words name one use (words: the zones read from them, none) a commercial zone the
// model gave no size to goes; commercial zones left without a size share the total when it's known (else the mix of
// shops alone is dropped: the one use stands); fewer than two zones left: no zones. Homes that fill the land the others
// leave (single-family, units null) and amenity zones keep their own rules.
const COMM = ['retail', 'restaurant', 'office', 'medical', 'hotel', 'church', 'other', 'industrial', 'storage', 'fuel'];
export function cleanZones(zones, { gfa = null, units = null, words = null } = {}) {
  if (!Array.isArray(zones) || zones.length < 2) return null;
  const sized = z => z?.use === 'fuel' || +z?.gfa > 0 || +z?.units > 0; let zs = zones.filter(z => z && typeof z === 'object').map(z => ({ ...z }));
  if (!(words?.length > 1)) zs = zs.filter(z => !COMM.includes(z.use) || sized(z)); // (the words name one use: an unsized second shop or restaurant zone is a misreading)
  else for (const z of zs) if (!sized(z)) { const w = words.find(x => x.use === z.use && sized(x)); if (w) { if (+w.gfa > 0) z.gfa = +w.gfa; if (+w.units > 0) z.units = +w.units; } } // (the sizes the words give each)
  const open = zs.filter(z => COMM.includes(z.use) && !sized(z));
  if (open.length) {
    const left = (+gfa || 0) - zs.filter(z => COMM.includes(z.use) && z.use !== 'fuel' && +z.gfa > 0).reduce((t, z) => t + +z.gfa, 0);
    if (left >= 500 * open.length) { const each = Math.round(left / open.length / 100) * 100; for (const z of open) z.gfa = each; }
    else if (zs.every(z => COMM.includes(z.use) && z.use !== 'fuel')) return null; // shops alone, no sizes to give them: one use, not a mix (a gas station beside them is a mix: the shops take the land it leaves)
  }
  const openH = zs.filter(z => ['multifamily', 'townhomes', 'duplex'].includes(z.use) && !sized(z)), hu = (+units || 0) - zs.filter(z => +z.units > 0).reduce((t, z) => t + +z.units, 0);
  if (openH.length && hu >= openH.length) { const each = Math.floor(hu / openH.length); for (const z of openH) z.units = each; }
  return zs.length > 1 ? zs : null;
}
// the model's placement on each zone (place), else the words' for a zone of the same use (its next indexes moved to the
// model's zones by use)
function placed(zs, words) {
  return zs.map(z => { const pl = z?.placement, own = pl?.where ? { where: pl.where, road: pl.road ?? null, next: pl.next || [], side: pl.side ?? null } : null; const { placement, ...rest } = z || {};
    if (own || !words) return own ? { ...rest, place: own } : rest;
    const w = words.find(q => q.use === z?.use && q.place)?.place, next = w?.next?.map(j => zs.findIndex(q => q?.use === words[j]?.use)).filter(j => j >= 0);
    return w ? { ...rest, place: { ...w, next } } : rest; });
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
// ---------- the AI's brief for the parking-field engine (lib/siteparking.mjs normalizeBrief) ----------
// what to build on a commercial site, exactly: the buildings (each with its use, size, floors, spot and which way it
// faces), the parking arrangement, the pond's side, a rear service drive and the pads, every decision with its reason
const why1 = d => str(d + ' One line, plain words.');
export const BRIEF_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['buildings', 'parking', 'pond', 'serviceDrive', 'pads', 'why', 'leasableSf', 'check'],
  description: 'What the layout engine should build on this commercial site, exactly.',
  properties: {
    buildings: { type: 'array', description: '1 to 6 buildings (not the pads), front to back.', items: { type: 'object', additionalProperties: false, required: ['use', 'gfa', 'floors', 'w', 'd', 'at', 'facing', 'form', 'why'], properties: {
      use: { type: 'string', enum: FIELD_USES }, gfa: n('Floor area over all its floors, sq ft.'),
      floors: int('Floors. null = leave it to the engine (it tries one more for an office or a medical office before building less). Never 1 for an office or medical office unless the request says one story.'),
      w: n('Feet along its row (the storefront length); null = from the floor area.'), d: n('Feet deep; null = the use\'s usual depths.'),
      at: { type: 'string', enum: ['front', 'back', 'middle', 'corner', 'left', 'right'], description: 'front: at the street (parking behind it); back: behind a parking field (the usual); middle: between two fields; left / right: along the row as seen from the street; corner: toward the side street.' },
      facing: { type: 'string', enum: ['street', 'parking'], description: 'Which way its storefront looks.' },
      form: { type: ['string', 'null'], enum: ['bar', 'L', 'U', 'tower', null], description: 'Its shape: L, U (a courtyard), tower (on a podium), bar; the shape the request names ("L-shaped"), else null.' }, why: why1('Why this size, floors and spot.') } } },
    parking: { type: 'string', enum: ['front', 'wrap', 'sides', 'back'], description: 'front: a field in front of the buildings; wrap: round their fronts and sides; sides: rows running back from the street either side; back: behind the buildings, which sit at the street.' },
    pond: { type: 'string', enum: ['back', 'front', 'side', 'none'], description: 'The detention pond\'s spot; none only for underground or regional detention.' },
    serviceDrive: { type: 'boolean', description: 'A rear service and loading drive behind the buildings (shops and restaurants usually want one).' },
    pads: { type: 'integer', description: '0 to 4 restaurant or coffee pads with a drive-thru, along the street beside the entry.' },
    why: { type: 'object', additionalProperties: false, required: ['count', 'parking', 'pond', 'serviceDrive', 'pads'], properties: {
      count: why1('Why this many buildings and pads.'), parking: why1('Why this parking arrangement.'), pond: why1('Why the pond goes there.'), serviceDrive: why1('Why a service drive or none.'), pads: why1('Why these pads or none.') } },
    leasableSf: { type: ['integer', 'null'], description: 'The leasable floor area you expect it to hold.' },
    check: str('One or two sentences: the arithmetic that says it fits (footprint, spaces at the ratio times the sq ft a space, the pond, against the acres less the setbacks and drives).')
  }
};
const BRIEF_OR_NULL = d => ({ anyOf: [BRIEF_SCHEMA, { type: 'null' }], description: d });
export const BRIEF_RULES = `- When briefFor is given (a commercial site), each strategy also carries a brief: exactly what the layout engine should build. The engine lays the brief out as written when it fits and otherwise the nearest layout that does, saying what it changed; that layout is then ranked against the engine's own on one score, the leasable floor area that parks and passes the checks, so a brief only wins by fitting more.
- Maximise the properly leasable floor area within the rules: every building parked at its use's ratio (briefFor.parking: spaces per 1,000 sq ft, about sqFtPerSpaceWithAisles a space with its aisle), inside the setbacks (briefFor.setbacksFt), with the detention briefFor.detention says the lot needs (its pond comes off the usable land; on a Waller site the guardrails' storage per developed acre, the footprint from that volume), and clear of briefFor.keepOuts.
- You choose: how many buildings (1-6) and pads (0-4: restaurant or coffee pads with a drive-thru, about 81 ft deep along the street beside the entry; briefFor.asked.pads, when set, is what the request asks for: give exactly that many), each building's use, floor area, floors (null unless the request fixes them or another floor clearly fits more; a second floor is how an office or medical office fits more on tight land), where it sits and which way it faces, the parking arrangement, the pond's side and a rear service drive.
- The same reading of the request as the program: a drive-thru on a building is that building's (a retail building with a drive-thru is one building, not a restaurant beside it); a size with + or "at least" is a minimum, so give at least that much; a shape the request names ("L-shaped") is each of its buildings' form.
- Use the lot: its width along the street and depth (a parking bay is briefFor.parking.bayFt deep; 26 ft drives run up both sides), the frontage, a corner (a building or pad toward the side street), its shape.
- Every decision gets a one-line reason in plain words a developer would say (why.count, why.parking, why.pond, why.serviceDrive, why.pads and each building's why), e.g. "Parking in front: shoppers see the spaces from FM 362 and walk straight in."
- check: the arithmetic; leasableSf: what you expect it holds. With no briefFor, brief is null.`;

export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reviews', 'ranking', 'revise', 'program', 'params', 'why', 'summary', 'brief', 'briefWhy'],
  properties: {
    reviews: { type: 'array', description: 'One per option, in the order given.', items: { type: 'object', additionalProperties: false, required: ['option', 'score', 'verdict', 'strengths', 'problems'], properties: {
      option: { type: 'integer', description: 'The option number given (0-based).' }, score: { type: 'integer', description: '0-100: how well it does what was asked and how buildable and marketable it is.' },
      verdict: str('One plain sentence a developer would say about it.'), strengths: strs('Up to 3, concrete.'), problems: strs('Up to 4, concrete and fixable where possible (what is wrong and where on the plan).') } } },
    ranking: { type: 'array', items: { type: 'integer' }, description: 'Option numbers, best first.' },
    revise: { type: 'boolean', description: 'True when a changed program would clearly give a better plan; false when the best option is good enough (or on the last round).' },
    program: { type: 'object', additionalProperties: false, required: Object.keys(PROG), properties: PROG, description: 'The full program to lay out next when revise is true (the current one, changed); when revise is false, repeat the current program.' },
    params: { type: 'object', additionalProperties: false, required: ['fill', 'streets', 'form', 'storm'], description: 'Layout settings to change with the revised program; null keeps the setting.', properties: {
      fill: { type: ['boolean', 'null'], description: 'false only when the request asks to hold land for a later phase (the app ignores it otherwise: the owner wants the leftover land filled with more of the program); null keeps the setting.' }, streets: { type: ['string', 'null'], enum: ['curved', 'network', 'wave', 'straight', null], description: 'Neighborhood streets (homes on lots): curved = subdivision streets (a loop road or main street, curved local streets meeting it at T’s, cul-de-sacs) and gentle waves, best first; network = subdivision streets only; wave = parallel curving streets; straight = a grid.' },
      form: { type: ['string', 'null'], enum: ['bar', 'L', 'U', 'tower', null], description: 'Building shape for apartments and offices.' }, storm: { type: ['string', 'null'], enum: ['detention', 'retention', 'underground', 'none', null], description: 'Stormwater.' } } },
    why: str('When revising: what the change fixes, in one sentence. Otherwise empty.'),
    summary: str('Two or three sentences for the user: which option is best and why, and what to watch for.'),
    brief: BRIEF_OR_NULL('Only when briefCheck.mayRevise is true: the planner\'s brief, revised so this lot holds it. null otherwise.'),
    briefWhy: str('With a revised brief: what changed and why, in one sentence. Otherwise empty.')
  }
};
export const REVIEW_SYSTEM = `You are a senior land planner and developer reviewing concept site plans. A layout engine drew the options from a development program; you see each one as a drawing (north is up on the sheet; the street side is labelled MAIN ENTRY; buildings are brown or tan, paving grey, ponds blue, lawns green) with its numbers and the rule checks.
- The owner's goal, what to rank by: the most leasable + sellable square footage (each option's leasablePlusSellableSf: leasableSf for shops, offices and apartments plus sellableSf, the homes' living area) among the options that keep the hard rules: no failing checks, parking met, detention met or its shortfall stated. A size the request asks for is a requirement, not a trade. Land left as lawn or held for a later phase that could hold more homes, shops or a bigger building is lost square footage; holding land is right only when the request asks for it. An option with pondDepthFtAssumed assumes a deeper pond than usual (an ENGINEERING ASSUMPTION for a civil engineer to confirm, never a verified fact): weigh what it buys (pond acres, homes, square footage) and say that it rests on that assumption.
- The goal is the most valuable plan that fits the rules and the market: the most leasable floor area or homes the land, parking and stormwater allow (valueM, costM and yieldOnCostPct use the pro forma's default assumptions; compare options on them, don't treat them as an appraisal). Land left as lawn, empty rows, oversized lots or surplus parking is lost value.
- Judge each against the user's request first, then as a buildable, leasable or sellable project: access from the street and a second way out where needed, parking next to the doors it serves, buildings that face and are seen from the street, truck and trash access, sensible drive aisles (no long dead ends), detention that isn't in the way, open space that's usable rather than leftover, phasing, amenities where people use them (the clubhouse and its pool by the entry and the homes they serve, never a second pool or a lone amenity out behind the buildings or by the pond), density for the market.
- Be concrete: say what is wrong and where ("the restaurant sits 200 ft from its parking", "half the frontage is lawn").
- You can't move pieces: you change the program the engine lays out (use, sizes, units, buildings, floors, parking ratio, product, zones and their order and sizes, extras, stormwater) and a few settings (fill the site, curving streets, building shape). Revise only when that would clearly make a better plan, e.g. the options waste land, miss what was asked, or are infeasible; keep what was asked unless it can't work.
- Scores: 85+ ready to show a client; 70-84 good with small fixes; 50-69 workable but weak; below 50 misses the request or doesn't work.
- Never claim code compliance; these are concepts.
- When a plannedStrategy is given, the site was thought through before the layouts were drawn: judge whether each layout carries it out (what sits at the front, middle and back, the ways in, the parking, the pond). A layout that strays from it is weaker unless the change is plainly better; say which.
- When briefCheck is given, option briefCheck.option was laid out from the planner's own brief (briefCheck.brief, with its reasons); the rest are the engine's own. Judge it on exactly the same terms: no credit for being the planner's. Its notes say what the engine changed from the brief and why. briefCheck.option null: the engine couldn't lay the brief out at all (briefCheck.notLaidOutBecause, in its own words) and none of the options is the planner's; they are all the engine's own.
- briefCheck.mayRevise true (the engine couldn't do the brief as written: parking short, it didn't fit, or a check failed): give brief, the brief revised so this lot holds it, from the engine's notes (or notLaidOutBecause), that option's metrics and its checks (or the engine's options' numbers), maximising the leasable floor area that parks and passes the checks; every decision with a one-line reason in plain words; briefWhy one sentence on what changed and why. Otherwise brief is null and briefWhy empty. A revised brief follows the same rules as the first: buildings 1-6, pads 0-4 (the number the request asks for, when it does), floors null unless the request fixes them or another floor clearly fits more.`;
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
      type: 'object', additionalProperties: false, required: ['name', 'concept', 'placement', 'entrances', 'parking', 'stormwater', 'buildings', 'numbers', 'settings', 'risks', 'rejected', 'brief'],
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
        settings: { type: 'object', additionalProperties: false, required: ['streets', 'fill'], properties: { streets: { type: ['string', 'null'], enum: ['curved', 'network', 'wave', 'straight', null], description: 'Neighborhood streets (homes on lots): curved = subdivision streets (a loop road or main street, curved local streets meeting it at T’s, cul-de-sacs) and gentle waves, best first; network = subdivision streets only; wave = parallel curving streets; straight = a grid.' }, fill: { type: ['boolean', 'null'], description: 'false only when the request asks to leave the rest of the site open for a later phase (the app fills it otherwise: the owner wants the most leasable and sellable square footage); null = the usual, filled.' } } },
        risks: strs('Up to 3 things that could break this plan (floodplain fill, a short frontage, a utility district).'),
        rejected: strs('Up to 2 other ways you considered and why you didn\'t take them.'),
        brief: BRIEF_OR_NULL('A commercial site (briefFor given): what the layout engine should build, exactly. null otherwise.')
      } } },
    pick: { type: 'integer', description: 'The index of the strategy to lay out (0 when there is one).' },
    why: str('One or two sentences: why that one (with three: what it does better than the others).')
  }
};
export const STRATEGY_SYSTEM = `You are a senior land planner for a commercial construction company in the Houston region. Before a layout engine places anything on the parcel, you think the site through the way a planner sketches before drawing: what goes at the front, in the middle and at the back, where the ways in go, how the parking and the stormwater work, and whether the numbers fit.
- Read the site: its acres, width and depth, its street frontage (and side streets: a corner lot), its shape and the facts given (flood zone, roads and traffic, utilities). The request comes first; fill what it leaves open with typical suburban Houston-area practice.
- Put each use where it works: retail, restaurants and pads on the busiest street for visibility, with their parking in front; offices and medical close to the street too; apartments, townhomes and homes behind, away from the traffic; an amenity (clubhouse, pool, community center) central to the homes it serves or at the entry; warehouses with their truck court away from the street; the pond on the low or back land, or as an amenity lake.
- Single-family neighbourhoods are laid out like real subdivisions (a loop road or a main street, curved local streets meeting it at T's, cul-de-sacs); set streets to 'network' only when they ask for loops or cul-de-sacs outright, 'straight' only when they ask for a grid.
- Ways in: one for an ordinary lot; two on a corner (one on each street), for more than 200 apartments or 30 homes (fire access) or a big parking field; drives at least 150 ft apart, never at a pad's door.
- Check the numbers before you commit: building footprint, parking (retail 4/1,000 sf, restaurant 10, office 3.5, medical 5, apartments 1.5-1.75 a unit, at about 330 sq ft a space with its aisle) and detention (about 8-12% of the site for detention in Harris County) against the acres. If it doesn't fit, say what gives (fewer units, a second floor, structured parking).
- The owner's goal is the most leasable and sellable square footage the property holds (leasable floor area for shops, offices and apartments plus the homes' sellable living area) while keeping the rules: checks clean, parking met, detention met. Land the request doesn't need goes to more of the program (more homes, more shops, a bigger building), not to a later phase, unless the request asks to hold land (settings.fill false only then). A pond beside the shops on frontage they don't need, or a deeper pond (an engineering assumption for a civil engineer to confirm), can free land for homes: say so when it does.
- When asked for three, make them genuinely different plans, judge each against the site and the request, and pick the one a developer would take forward; say why in plain words.
- Concept level only: no code compliance claims.
${BRIEF_RULES}`;
const strategyFrom = d => { const t = (v, n = 300) => clip(v, n), list = (v, n, k = 240) => (Array.isArray(v) ? v : []).slice(0, n).map(x => t(x, k)).filter(Boolean), pl = v => PLACE.includes(v) ? v : null, int = (v, lo, hi) => Number.isFinite(+v) && v != null ? Math.max(lo, Math.min(hi, Math.round(+v))) : null;
  return { name: t(d?.name, 120), concept: t(d?.concept, 600),
    placement: (Array.isArray(d?.placement) ? d.placement : []).slice(0, 8).map(q => ({ what: t(q?.what, 120), where: pl(q?.where), why: t(q?.why, 240) })).filter(q => q.what && q.where),
    entrances: { count: int(d?.entrances?.count, 1, 3) || 1, where: t(d?.entrances?.where, 240), why: t(d?.entrances?.why, 240) },
    parking: { approach: t(d?.parking?.approach, 240), where: pl(d?.parking?.where), spaces: int(d?.parking?.spaces, 0, 20000) },
    stormwater: { type: ['detention', 'retention', 'underground', 'none'].includes(d?.stormwater?.type) ? d.stormwater.type : 'detention', where: pl(d?.stormwater?.where), why: t(d?.stormwater?.why, 240) },
    buildings: { count: int(d?.buildings?.count, 1, 400), floors: int(d?.buildings?.floors, 1, 40), form: ['bar', 'L', 'U', 'tower'].includes(d?.buildings?.form) ? d.buildings.form : null },
    numbers: { buildingSf: int(d?.numbers?.buildingSf, 0, 5e6), units: int(d?.numbers?.units, 0, 5000), coveragePct: Number.isFinite(+d?.numbers?.coveragePct) && d?.numbers?.coveragePct != null ? Math.max(0, Math.min(100, +d.numbers.coveragePct)) : null, fits: d?.numbers?.fits !== false, check: t(d?.numbers?.check, 400) },
    settings: { streets: STREETS.includes(d?.settings?.streets) ? d.settings.streets : null, fill: typeof d?.settings?.fill === 'boolean' ? d.settings.fill : null },
    risks: list(d?.risks, 3), rejected: list(d?.rejected, 2) };
};
// a strategy coming back in from the browser (to the program and the review): the same shape, cleaned again
export const strategyIn = v => v && typeof v === 'object' ? strategyFrom(v) : null;
// the AI's brief on the way out (lib/planbrief.mjs briefFrom): { brief: { brief, reasons, leasableSf, check } }, or a
// one-line note when what it gave makes no sense (the engine's own layouts stand), or nothing (not a commercial site)
export function briefOut(raw, ctx) {
  if (!ctx || raw == null) return {};
  const r = BR.briefFrom(raw, ctx);
  return r?.brief ? { brief: r } : r?.nonsense ? { briefNote: clip('The AI’s plan didn’t make sense (' + r.nonsense + '), so these are the engine’s own layouts.', 300) } : {};
}
async function strategy(b, key, res) {
  const prompt = clip(b.prompt, 1200).trim(); if (!prompt) return res.status(400).json({ error: 'Say what to build, e.g. "25,000 sf retail strip".' });
  const count = +b.count === 3 ? 3 : 1, briefFor = b.briefFor && typeof b.briefFor === 'object' && !Array.isArray(b.briefFor) ? tidy(b.briefFor, 0, 300) : null; // (a commercial site: what the AI's brief is decided from)
  const user = siteText(b.site, prompt, b.program, b.facts).replace(/}$/, ',"asked":' + JSON.stringify(count === 3 ? 'three different strategies, then pick one' : 'one strategy') + (briefFor ? ',"briefFor":' + JSON.stringify(briefFor) : '') + '}') + refBlock(b.refs); // (refBlock: the facts the team confirmed from its reference files, lib/sitefiles.mjs)
  const bctx = briefFor ? { prompt, siteSf: +briefFor.lot?.siteSf || (+b.site?.acres || 0) * 43560, use: guessProgram(prompt).use } : null;
  try {
    const t0 = Date.now(), r = await ai(key, b, res, m => withRoom(o => chatJSON({ key, model: m, feature: 'siteplan', system: guardSys(b, STRATEGY_SYSTEM), user, name: 'site_strategy', schema: STRATEGY_SCHEMA, ...o }), { maxTokens: count === 3 ? 40000 : 20000, effort: effortIn(b.effort, 'high'), t0 })); // (Ultra thinks at xhigh: its thinking can use up the room, so it's asked again once with more room, a notch lower, lib/openai.mjs withRoom)
    const d = r.data, raw = (Array.isArray(d.strategies) ? d.strategies : []).slice(0, count), strategies = raw.map(x => ({ ...strategyFrom(x), ...briefOut(x?.brief, bctx) })).filter(x => x.concept || x.placement.length);
    if (!strategies.length) throw new Error('no strategy');
    const pick = Number.isInteger(d.pick) && d.pick >= 0 && d.pick < strategies.length ? d.pick : 0;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ strategies, pick, why: clip(d.why, 400) });
  } catch (e) {
    console.error('siteplan strategy', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now. Try again, or build without AI.' });
  }
}

// a Waller plan (lib/guardrails.mjs): the guardrails' instruction (appendix A) and the active profile values go with the
// system prompt, and what comes back has the conclusions the AI must never draw rewritten ("code compliant", "approved"…)
export const guardSys = (b, sys) => { const g = G.fromAI(b?.guardrails); return g ? sys + '\n\n' + G.promptFor(g) : sys; };
const KEEP = new Set(['id', 'ids', 'use', 'kind', 'type', 'model', 'form', 'streets', 'storm', 'where', 'pattern', 'product']);
export const guardOut = v => Array.isArray(v) ? v.map(guardOut) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, KEEP.has(k) ? x : guardOut(x)])) : typeof v === 'string' ? G.scrubText(v) : v;
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 12, perDay: 400 })) return;
  const key = needKey(res); if (!key) return;
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (G.fromAI(b.guardrails) && b.mode !== 'bestuse' && b.mode !== 'askProject') { const json = res.json.bind(res); res.json = d => json(res.statusCode >= 400 ? d : guardOut(d)); }
  if (b.mode === 'review') return review(b, key, res);
  if (b.mode === 'bestuse') return bestUse(b, key, res);
  if (b.mode === 'edit') return edit(b, key, res);
  if (b.mode === 'ask') return ask(b, key, res);
  if (b.mode === 'askProject') return askProject(b, key, res);
  if (b.mode === 'strategy') return strategy(b, key, res);
  if (b.mode === 'names') return names(b, key, res);
  if (b.mode === 'rules') return rules(b, key, res);
  if (b.mode === 'streetNames') return streetNames(b, key, res);
  return program(b, key, res);
}

// the request (and what's known about the site) turned into a development program
async function program(b, key, res) {
  const prompt = clip(b.prompt, 1200).trim(); if (!prompt) return res.status(400).json({ error: 'Say what to build, e.g. "25,000 sf retail strip".' });
  try {
    const t0 = Date.now(), r = await ai(key, b, res, m => withRoom(o => chatJSON({ key, model: m, feature: 'siteplan', system: guardSys(b, SYSTEM), user: siteText(b.site, prompt, b.program, b.facts, strategyIn(b.strategy), teamTypesForAI(b.teamTypes)) + refBlock(b.refs), name: 'site_program', schema: SCHEMA, ...o }), { maxTokens: 16000, effort: effortIn(b.effort, 'high'), t0 })); // it may think for a while: a better program is worth the wait (the layout itself runs in the browser)
    const d = r.data, sb = Object.fromEntries(Object.entries(d.setbacks || {}).filter(([, v]) => v != null && v >= 0 && v <= 300)), cu = customFrom(d, programFrom(d, prompt)), program = cu.program;
    res.setHeader('Cache-Control', 'no-store');
    const questions = (Array.isArray(d.questions) ? d.questions : []).filter(q => typeof q === 'string' && q.trim()).slice(0, 3).map(q => clip(q, 240)); // (several parcels and the request leaves what goes where open: asked before anything is laid out)
    return res.json({ program, setbacks: { ...SETBACKS, ...sb }, summary: clip(d.summary, 400), assumptions: [...(cu.note ? [cu.note] : []), ...(d.assumptions || []).slice(0, 4).map(a => clip(a, 200))].slice(0, 5), ...(questions.length && Array.isArray(b.site?.parcels) && b.site.parcels.length > 1 ? { questions } : {}) });
  } catch (e) {
    console.error('siteplan', e.message);
    return res.status(502).json({ error: 'The AI didn’t answer just now. Try again, or build without AI.' });
  }
}

// The same modes in-process, for the MCP server's site_plan tool (lib/mcp/siteplan.mjs): no same-origin or per-browser
// rate check (the MCP endpoint has its own), the answer captured instead of sent -> { status, body, model }
const MODES = { review, bestuse: bestUse, strategy, program: (b, key, res) => program(b, key, res) };
export async function siteAI(b) {
  const out = { status: 200, body: null, model: null }, hdr = {};
  const res = { statusCode: 200, setHeader(k, v) { hdr[k] = v; }, getHeader: k => hdr[k], status(c) { this.statusCode = c; return this; }, json(d) { out.status = this.statusCode; out.body = d; return this; } };
  const key = needKey(res); if (!key) return { ...out, status: res.statusCode, body: out.body };
  if (G.fromAI(b.guardrails) && b.mode !== 'bestuse') { const json = res.json.bind(res); res.json = d => json(res.statusCode >= 400 ? d : guardOut(d)); }
  const run = MODES[b.mode || 'program']; if (!run) return { status: 400, body: { error: 'Unknown mode.' }, model: null };
  await run(b, key, res);
  return { ...out, model: hdr['X-AI-Model'] || null };
}

// the engine's options, judged on their drawings and numbers; a revised program when one would clearly do better
const num = v => Number.isFinite(+v) ? +v : null;
async function review(b, key, res) {
  const rounds = Math.max(1, Math.min(3, Math.round(+b.rounds) || 2)), round = Math.max(1, Math.round(+b.round) || 1), last = round >= rounds; // Medium: one round (no revise); Ultra: up to three
  const prompt = clip(b.prompt, 1200).trim(), opts = (Array.isArray(b.options) ? b.options : []).slice(0, 6);
  if (!opts.length) return res.status(400).json({ error: 'Nothing to review.' });
  const images = opts.map(o => typeof o.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(o.image) && o.image.length < 600000 ? o.image : null);
  // the AI's plan: one of the options (option), or, when the engine couldn't lay it out at all and drew its own program,
  // none of them, with the engine's reason (dropped)
  const bc = b.briefCheck && typeof b.briefCheck === 'object' ? b.briefCheck : null, bk = bc ? BR.briefIn(bc) : null, bOpt = bk && Number.isInteger(bc.option) && bc.option >= 0 && bc.option < opts.length ? bc.option : -1;
  const dropped = bk && bOpt < 0 && typeof bc.dropped === 'string' && bc.dropped.trim() ? clip(bc.dropped, 300) : null, has = bOpt >= 0 || !!dropped;
  const mayRevise = has && !last && bc.mayRevise === true && (!!dropped || bc.met !== true); // (once: the browser stops asking after the first revision)
  const briefCheck = has ? { option: bOpt >= 0 ? bOpt : null, brief: bk.brief, reasons: bk.reasons, metAsWritten: bOpt >= 0 && bc.met === true, ...(dropped ? { notLaidOutBecause: dropped } : {}), mayRevise, ...(b.briefFor && typeof b.briefFor === 'object' ? { briefFor: tidy(b.briefFor, 0, 300) } : {}) } : null;
  const text = JSON.stringify({ request: prompt || null, round: last ? 'last (do not revise)' : round === 1 ? 'first' : round + ' of ' + rounds + ' (revise again only if it clearly helps)', site: JSON.parse(siteText(b.site, '', null, b.facts)).site, currentProgram: b.program || null, ...(strategyIn(b.strategy) ? { plannedStrategy: strategyIn(b.strategy) } : {}), ...(briefCheck ? { briefCheck } : {}),
    options: opts.map((o, i) => ({ option: i, name: clip(o.name, 120), drawing: images[i] ? 'image ' + (images.slice(0, i + 1).filter(Boolean).length) : 'none', metrics: Object.fromEntries(Object.entries(o.metrics || {}).slice(0, 16).map(([k, v]) => [clip(k, 30), num(v)])),
      issues: (o.issues || []).slice(0, 8).map(t => clip(t, 160)), notes: (o.notes || []).slice(0, 6).map(t => clip(t, 240)) })) });
  try {
    const t0 = Date.now(), r = await ai(key, b, res, m => withRoom(o => chatJSON({ key, model: m, feature: 'siteplan', system: guardSys(b, REVIEW_SYSTEM), user: text + refBlock(b.refs), name: 'site_review', schema: REVIEW_SCHEMA, images: images.filter(Boolean), ...o }), { maxTokens: 20000, effort: effortIn(b.effort, 'high'), t0 }));
    const d = r.data, n = opts.length, ok = i => Number.isInteger(i) && i >= 0 && i < n;
    const ranking = [...new Set((d.ranking || []).filter(ok))]; for (let i = 0; i < n; i++) if (!ranking.includes(i)) ranking.push(i);
    const reviews = (d.reviews || []).filter(x => ok(x.option)).map(x => ({ option: x.option, score: Math.max(0, Math.min(100, Math.round(+x.score || 0))), verdict: clip(x.verdict, 300), strengths: (x.strengths || []).slice(0, 3).map(t => clip(t, 200)), problems: (x.problems || []).slice(0, 4).map(t => clip(t, 220)) }));
    const revise = !last && !!d.revise, p = d.params || {};
    const params = Object.fromEntries(Object.entries({ fill: typeof p.fill === 'boolean' ? p.fill : null, streets: STREETS.includes(p.streets) ? p.streets : null, form: ['bar', 'L', 'U', 'tower'].includes(p.form) ? p.form : null, storm: ['detention', 'retention', 'underground', 'none'].includes(p.storm) ? p.storm : null }).filter(([, v]) => v != null));
    res.setHeader('Cache-Control', 'no-store');
    const keepCustom = p => { const cu = customFrom(d.program || {}, p); if (cu.program.custom || !customOf(b.program || {})) return cu.program; const r0 = recipeIn(b.program.custom); return r0 && (p.use === 'other' || p.use === (r0.pattern === 'yard' ? 'storage' : 'other')) ? { ...programOf(r0, p) } : cu.program; }; // a revised custom type keeps its recipe unless the AI rewrote it
    const nb = mayRevise ? BR.briefFrom(d.brief, { prompt, siteSf: (+b.site?.acres || 0) * 43560, use: guessProgram(prompt).use }) : null, brief = nb?.brief ? nb : null; // (a revised brief that makes no sense: none, the first one stands)
    return res.json({ reviews, ranking, revise, program: revise ? keepCustom(programFrom(d.program || {}, prompt)) : null, params: revise ? params : {}, why: revise ? clip(d.why, 300) : '', summary: clip(d.summary, 600), brief, briefWhy: brief ? clip(d.briefWhy, 300) : '' });
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
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: BESTUSE_SYSTEM, user: JSON.stringify({ goal: s.request || null, site: s.site, nearby, market }) + refBlock(b.refs), name: 'site_best_use', schema: BESTUSE_SCHEMA, maxTokens: 16000, effort: 'high' }));
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
  type: 'object', additionalProperties: false, required: ['ops', 'homeMix', 'names', 'streetNames', 'refit', 'summary', 'question'],
  properties: {
    ops: { type: 'array', description: 'The edits, in order.', items: { type: 'object', additionalProperties: false, required: ['action', 'target', 'every', 'floorsOver', 'with', 'type', 'kind', 'use', 'name', 'floors', 'units', 'gfa', 'w', 'd', 'x', 'y', 'turn', 'turnBy', 'boulevard', 'signs', 'curve', 'end', 'street'], properties: {
      action: { type: 'string', enum: ['change', 'remove', 'add', 'move', 'swap', 'relay', 'culdesac', 'bend'] },
      target: nul('string', { description: 'id of the piece to change, remove, move or swap (null for add, or with every), a pod id from plan.pods ("pod:…") to re-lay, change or swap, or a street id from plan.streets (culdesac, bend, relay its block, remove, change with street).' }),
      every: nul('string', { enum: [...EVERY, null], description: 'change / remove with no target: every piece of this use (a building use, e.g. multifamily, townhomes) or kind (pool, court…), listed or not.' }),
      floorsOver: nul('integer', { description: 'with every: only the ones with more floors than this now (2 picks the 3-story and taller ones).' }),
      with: nul('string', { description: 'swap: the other piece, or the other pod ("pod:…"). add / move: a piece to put it beside (when no x, y).' }),
      type: nul('string', { description: 'A building type id from the library: the building it becomes (change) or the one added (add).' }),
      kind: nul('string', { enum: ['building', 'pool', 'play', 'court', 'green', 'plaza', 'pond', 'garage', 'patio', 'entrance', 'roundabout', 'loop', 'pod', null], description: 'swap with kind pod: the pods the two pieces are in trade places. add without a library type: what kind of piece. green: a park, lawn or open space (give it a name: Park, Open space…). entrance: a driveway in from the street at x, y (a point on the lot line, y about 0 for the front), on the lot line beside the piece given in with, or with neither where it helps most. roundabout: a pavement ring with a planted island at a junction of streets: x, y of one of plan.junctions, or with an entrance’s id ("at the entry") or a piece’s id (the junction nearest it); w its outer diameter in ft only when they give a size. loop: a one-way drop-off loop (circle drive) with a planted island in front of the building given in with.' }),
      use: nul('string', { enum: [...Object.keys(USES), null] }), name: nul('string'),
      floors: nul('integer'), units: nul('integer'), gfa: nul('integer', { description: 'relay on a pod of shops or offices: the floor area it holds, sq ft' }), w: nul('number', { description: 'feet across its front (a roundabout: its outer diameter; a loop: its length along the building)' }), d: nul('number', { description: 'feet deep' }),
      x: nul('number', { description: 'where its centre goes: feet across the frontage from the street’s left end, as on the drawing' }), y: nul('number', { description: 'feet back from the street' }),
      turn: nul('number', { description: 'its angle on the drawing in degrees (0 = its long side along the street, 90 = running back from it)' }),
      turnBy: nul('number', { description: 'degrees to turn it by on the drawing, + counter-clockwise, − clockwise: any piece, curved ponds, lawns, drawn outlines and entrances too (an entrance turns about its middle, its mouth slides along the street, at most 60° off square)' }),
      boulevard: nul('boolean', { description: 'an entrance: true for a two-lane divided entry with a planted median (add kind entrance: a new one; change: widen this one)' }),
      signs: nul('string', { enum: ['median', 'both', 'one', 'none', null], description: 'an entrance: where its monument signs go (median: in the median nose; both / one: at the corners); null leaves them' }),
      curve: nul('number', { description: 'bend: how far the street bows sideways at its middle, ft, + to the left of its way on the drawing; null for the usual (about 6% of its length)' }),
      end: nul('string', { enum: ['start', 'end', null], description: 'culdesac: which end (plan.streets from / to); null: a dead end, else the end farther from the main entry' }),
      street: nul('string', { description: 'change on a street from plan.streets: its new street name, base and suffix ("Heritage Parkway")' }) } } },
    homeMix: { type: 'array', description: 'The single-family homes on lots by stories, when the request changes their stories across the site (e.g. no 3-story homes: the 1- and 2-story shares only). Empty for no change.', items: { type: 'object', additionalProperties: false, required: ['stories', 'pct'], properties: { stories: { type: 'integer', enum: [1, 2, 3] }, pct: { type: 'number', description: 'share of the homes, %' } } } },
    names: { type: 'object', additionalProperties: false, required: ['community', 'parts'], description: 'names for the development and its parts (plan.parts); community null and parts empty when the request doesn’t name anything', properties: {
      community: nul('string', { description: 'the whole development’s name ("call it Beacon Hill"), or null' }),
      parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['part', 'name'], properties: { part: { type: 'integer', description: 'plan.parts index (part)' }, name: { type: 'string' } } } } } },
    streetNames: { type: 'object', additionalProperties: false, required: ['on', 'theme'], description: 'the neighborhood’s street names (plan.streetNames): on true to name every street (from theme, or one that suits the community when null), false to hide them; both null for no change', properties: { on: nul('boolean'), theme: nul('string', { description: 'a few words: "golf", "Texas rivers"' }) } },
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
- Names: the development has a name (community) and each part in plan.parts its own (part, label, name). "Call the neighbourhood Beacon Hill Estates", "name the retail center Beacon Hill Market" are names, not ops: names.parts with the part's index (every part of that kind when there are two, as two neighborhoods either side of a commons); the whole development ("call it Beacon Hill", "the community") is names.community. Never rename pieces for these. Keep the user's capitals.
- Parks, lawns and open space (kind green with a name) are real places: never put a piece across a drive or a park. To put a park or amenity beside something, give with and no x, y: the app tries each side and keeps the first spot clear of drives, buildings and the lot line, or says there's no room.
- An entrance can't cross a park, open space or pond: put x, y on the street lot line beside it, not through it. If they ask for one "at the open space", give with (its id) and no x, y: the app slides it along the street past it or says it can't.
- A re-fit keeps the streets as they are. A different street pattern for the whole site is New Layouts (say so in the summary); don't claim the streets changed unless an op below changes them.
- Streets of a neighbourhood (plan.streets: each street's id, name, kind, length, ends and where it runs): 'make this street a cul-de-sac' is culdesac on that street (the selected one for 'this'; end only when they say which); 'curve the main street' is bend on it (curve null unless they give feet; the main street is the one named Main street or Spine road, else the longest collector); 'remove / delete this street' is remove on it; 're-lay this pod / block' is relay with the selected piece or street (the app lays that block's local streets out again; the collectors stay); 'call the main street Heritage Parkway' is change on it with street. Homes are laid out again along the changed streets.
- Street names: 'rename the streets with a golf theme' is streetNames on true, theme golf; 'name the streets' is on true, theme null; 'turn off street names' is on false. Otherwise both null.
- More floors on apartments add units; give units only when they name a number.
- If they ask for something the plan can't hold (no room, outside the setbacks), do the nearest sensible thing and say so in the summary.
- refit: "none" unless they ask for the site to re-fit or re-lay, or the change needs new drives and parking (a building added in open land, several buildings removed); then "full".
- Places: plan.places says where things are, in the same feet as "at" (x across the frontage from its left end, y back from the street). "The front" / "by the street" is small y, "the back" / "the rear" the largest y, "the middle" / "the center" the middle of the site; "left" and "right" as on the drawing. "The middle of the homes" (or of any use: the apartments, the shops, the single-family lots) is that area's middle in places.areas; "in front of" a piece or area is toward the street from it, "behind" it away from the street; a named zone ("the back zone", "the commons") is in places.zones. Use these for x, y when they say where, without asking them to be more exact.
- Moving or adding an amenity, clubhouse or pool among houses: the houses under its new spot give way by themselves (the app removes them); keep refit "none" so the rest of the neighbourhood stays as it is.
- Changes across the whole site ("all the apartments", "every pool", "no 3-story buildings") are one op with every (a use or a kind) and no target, with floorsOver to pick only the taller ones: "nothing over 3 stories" is change every multifamily, floorsOver 3, floors 3. Never answer a site-wide request with a handful of the pieces listed.
- Homes on lots (use sfr): houses.byStories counts them by stories and houses.mix is their mix; on a big neighbourhood they aren't listed. Their stories change through homeMix, never by ops: each home's lot is sized for its stories, so the app lays the lots out again along the same streets. "Only 1- and 2-story homes, no 3-story" is homeMix with the 1- and 2-story shares of houses.mix scaled up to 100 and no 3-story; "all single-story" is 1-story at 100. Townhomes and duplexes are buildings: use every.
- The summary says only what the ops and homeMix do. If nothing you can do matches the request, give no ops, say so in question, and never claim a change you didn't make.
- Pods: on a plan laid out in pods (plan.pods: each pod's id, name, use, acres, where and what streets it faces), "redo / re-lay the apartments" is action relay with target that pod's id (with use, units (homes, apartments) or gfa (shops, offices: sq ft) when they change what it holds: "make the north section townhomes" is relay with use townhomes; "make the retail pod 80,000 sf" is relay with gfa 80000; "make the apartments pod 4 stories" is relay with floors 4); "rename the north section The Lakes" is action change on that pod's id with name; "swap the apartments and the retail" is action swap with target and with the two pod ids. The app lays those pods out again; the rest of the plan stays. Never move single buildings to fake it.
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
  const pods = (Array.isArray(plan.pods) ? plan.pods : []).slice(0, 24).map(p => ({ id: clip(p?.id, 40), name: clip(p?.name, 60), use: USES[p?.use] ? p.use : 'other', acres: num(p?.acres), at: pt(p?.at), faces: (Array.isArray(p?.faces) ? p.faces : []).slice(0, 4).map(f => clip(f, 40)), ...(Number.isFinite(+p?.homes) ? { homes: num(p.homes) } : {}), ...(Number.isFinite(+p?.units) ? { units: num(p.units) } : {}), ...(Number.isFinite(+p?.floorAreaSf) ? { floorAreaSf: num(p.floorAreaSf) } : {}) })).filter(p => /^pod:/.test(p.id)); // a plan laid out in pods (lib/siteedit.mjs describePlan)
  const nst = (Array.isArray(plan.streets) ? plan.streets : []).slice(0, 80).map(x => ({ id: clip(x?.id, 40), name: clip(x?.name, 60), kind: ['boulevard', 'entry', 'collector', 'local', 'court'].includes(x?.kind) ? x.kind : 'local', lengthFt: num(x?.lengthFt), ends: (Array.isArray(x?.ends) ? x.ends : []).slice(0, 2).map(e => clip(e, 20)), ...(pt(x?.from) ? { from: pt(x.from), to: pt(x.to) } : {}), mid: pt(x?.mid), ...(x?.selected ? { selected: true } : {}) })).filter(x => x.id); // a neighbourhood's streets (lib/siteedit.mjs describePlan)
  const sn0 = plan.streetNames && typeof plan.streetNames === 'object' ? { on: !!plan.streetNames.on, theme: clip(plan.streetNames.theme, 80) } : null;
  const ids = new Set([...pieces.map(p => p.id), ...pods.map(p => p.id), ...nst.map(x => x.id)]), image = typeof b.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(b.image) && b.image.length < 600000 ? b.image : null;
  const text = JSON.stringify({ request: prompt, site: { ...JSON.parse(siteText(b.site, '', null, null)).site, ...(plan.site || {}) }, totals: plan.totals || null, parking: plan.parking || null, community: plan.community ? clip(plan.community, 60) : null, parts, houses: housesIn(plan.houses), places: placesIn(plan.places), junctions: junctionsIn(plan.junctions), ...(pods.length ? { pods } : {}), ...(nst.length ? { streets: nst, streetNames: sn0 } : {}), selected: pieces.find(p => p.selected)?.id || nst.find(x => x.selected)?.id || null, pieces }) + '\n\nBuilding library (type id = name):\n' + catalogText();
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: guardSys(b, EDIT_SYSTEM), user: text + refBlock(b.refs), name: 'site_edit', schema: EDIT_SCHEMA, maxTokens: 16000, effort: 'high', images: image ? [image] : [] }));
    const d = r.data, kinds = new Set(['building', 'pool', 'play', 'court', 'green', 'plaza', 'pond', 'garage', 'patio', 'entrance', 'roundabout', 'loop']);
    const every = o => (o.action === 'change' || o.action === 'remove') && !ids.has(o.target) && EVERY.includes(o.every);
    let homeMix = mixIn(d.homeMix);
    const st = new Set(nst.map(x => x.id)), ops = (d.ops || []).slice(0, 30).filter(o => ['change', 'remove', 'add', 'move', 'swap', 'relay', 'culdesac', 'bend'].includes(o.action) && (o.action === 'add' || ids.has(o.target) || every(o)) && (o.action !== 'swap' || ids.has(o.with)) && (o.action !== 'relay' || /^pod:/.test(o.target) || nst.length && ids.has(o.target)) && (!['culdesac', 'bend'].includes(o.action) || st.has(o.target) || nst.length && ids.has(o.target))).filter(o => {
      if (!(every(o) && o.every === 'sfr' && o.action === 'change' && [1, 2, 3].includes(o.floors))) return true; // homes on lots by stories: that's the home mix
      if (!homeMix.length) homeMix = Number.isInteger(o.floorsOver) ? keepStories(mixIn(plan.houses?.mix).length ? mixIn(plan.houses.mix) : HOME_MIX, [1, 2, 3].filter(n => n <= o.floorsOver || n === o.floors)) || [] : [{ stories: o.floors, pct: 100 }]; return false; // (only the taller ones: the rest keep their shares)
    }).map(o => ({
      action: o.action, target: ids.has(o.target) ? o.target : null, every: every(o) ? o.every : null, floorsOver: every(o) && Number.isInteger(o.floorsOver) && o.floorsOver >= 0 && o.floorsOver < 60 ? o.floorsOver : null, with: ids.has(o.with) ? o.with : null, type: o.type && typeById(o.type) ? o.type : null, kind: kinds.has(o.kind) || o.kind === 'pod' ? o.kind : null, use: USES[o.use] ? o.use : null, name: o.name ? clip(o.name, 60) : null,
      floors: Number.isInteger(o.floors) && o.floors >= 1 && o.floors <= 60 ? o.floors : null, units: Number.isInteger(o.units) && o.units >= 1 && o.units <= 2000 ? o.units : null, gfa: Number.isInteger(o.gfa) && o.gfa >= 500 && o.gfa <= 2000000 ? o.gfa : null, w: num(o.w) > 4 && o.w < 2000 ? +o.w : null, d: num(o.d) > 4 && o.d < 2000 ? +o.d : null, x: opt(o.x), y: opt(o.y), turn: opt(o.turn),
      turnBy: Number.isFinite(+o.turnBy) && o.turnBy != null && Math.abs(+o.turnBy) <= 360 ? +o.turnBy : null, boulevard: typeof o.boulevard === 'boolean' ? o.boulevard : null, signs: ['median', 'both', 'one', 'none'].includes(o.signs) ? o.signs : null,
      curve: o.curve != null && Number.isFinite(+o.curve) && Math.abs(+o.curve) <= 400 ? +o.curve : null, end: ['start', 'end'].includes(o.end) ? o.end : null, street: typeof o.street === 'string' && o.street.trim() ? clip(o.street.trim().replace(/\s+/g, ' '), 40) : null }));
    const names = namesIn(d.names), streetNames = typeof d.streetNames?.on === 'boolean' && nst.length ? { on: d.streetNames.on, theme: clip(d.streetNames.theme || '', 80) } : null;
    res.setHeader('Cache-Control', 'no-store');
    const any = ops.length || homeMix.length || names.community || names.parts.length || streetNames;
    return res.json({ ops, homeMix, names, streetNames, refit: d.refit === 'full' ? 'full' : 'none', summary: any ? clip(d.summary, 500) : '', question: any ? null : clip(d.question || '', 300) || null });
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

// ---------- street rules by location: the AI reads the codes (lib/rulesheet.mjs) ----------
// POST { mode: 'rules', jurisdiction: { county, city|null, districts: [names], address, lat, lon }, known: [keys], refresh }
//   -> { sheet } or { key, name, etj, cached: true } (the team has that place's sheet already). No city: the AI first decides
// whether the site is in a city's ETJ (the app has no ETJ outlines). Then two searches in parallel (the subdivision and
// development rules; the drainage criteria) and a structuring call; a value is sure only when it was read and quoted from
// a page the search found. A search or call that fails: Waller County's rules stand in, every value flagged (status 200,
// so the app always gets a sheet).
export const ETJ = 'Decide whether the site is inside the extraterritorial jurisdiction (ETJ) of a Texas city, from the city\'s ETJ map or ordinance, the county\'s or the appraisal district\'s maps, or a reliable source. Reply with ONLY a JSON object, no other text: ' +
  '{"etj": the city\'s name or null, "decided": "in" | "out" | "unsure", "why": one short sentence on what you read, "url": the page you read it on or null}. Never guess: "unsure" when the sources don\'t settle it.';
const READ = 'Read the official rules and quote them. For each value give the number, the section and the page URL you read it on, quoting the words; say NOT FOUND for what isn\'t there. Never guess and never give a number you didn\'t read. Plain text, no markdown.';
export const RULES_SCHEMA = { type: 'object', additionalProperties: false, required: ['jurisdiction', 'summary', 'values'], properties: {
  jurisdiction: { type: 'object', additionalProperties: false, required: ['name', 'kind'], properties: { name: str('Whose rules these are: "City of Katy", "Houston ETJ in Waller County", "Waller County".'), kind: { type: 'string', enum: ['city', 'county', 'etj'] } } },
  summary: str('Two or three sentences: which documents were read (and their dates), which way the ETJ was decided and why, and what wasn\'t found.'),
  values: { type: 'array', description: 'One per value found in the research; leave out what wasn\'t found.', items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'choice', 'url', 'cite', 'quote', 'sure'], properties: {
    field: { type: 'string', enum: RS.KEYS, description: RS.FIELDS.map(f => f.k + ' = ' + f.label + (f.unit ? ' (' + f.unit + ')' : '')).join('; ') },
    value: nul('number', { description: 'The number, in the field\'s unit (null for sidewalk).' }), choice: nul('string', { enum: ['both', 'one', 'none', null], description: 'sidewalk only: which sides of a local street.' }),
    url: nul('string', { description: 'The page it was read on, exactly as the research gave it; null when none.' }), cite: nul('string', { description: 'Its section, e.g. "§4.2.2" or "Appendix E §5".' }), quote: nul('string', { description: 'The words quoted, at most 200 characters.' }),
    sure: { type: 'boolean', description: 'true only when the research read and quoted it from that page; false for anything inferred, from a summary, or unclear.' } } } } } };
export const RULES_SYSTEM = `You turn research notes on a Texas city's or county's subdivision and development rules and its drainage criteria into a rule sheet for a site-planning tool. The values: ` + RS.FIELDS.map(f => f.k + ' (' + f.label + (f.unit ? ', ' + f.unit : '') + ')').join(', ') + `.
- Take values only from the research notes. sure is true only when the notes quote the text from a page; anything inferred, summarised or unclear is sure false. Never invent a URL: use only the URLs the notes give.
- Right-of-way and pavement: a local (residential) street and a collector. Longest block and cul-de-sac (to the end of the bulb), the bulb's right-of-way and pavement radius. Intersection spacing (centre to centre on one street; on a collector). Driveway spacing and corner clearance (a driveway from an intersection). Sidewalks: which sides of a local street (both, one, none) and the width. Smallest lot (sq ft) and frontage (ft at the right-of-way line), the front building line and the side building line on a street. Detention: acre-feet per acre of development (convert a rate in inches of runoff: inches / 12). Second way in: the number of lots over which a second entrance is required.
- In a city's ETJ, streets and lots follow the city's subdivision rules and drainage follows the county's or the drainage district's. Say in the summary which way the ETJ was decided and on what.
- Leave out what the notes don't give. Never claim compliance; this is a reading of the code for an engineer to confirm.`;
const ETJ_NONE = why => ({ etj: null, decided: 'unsure', why, url: null });
async function rules(b, key, res) {
  const j = b.jurisdiction && typeof b.jurisdiction === 'object' ? b.jurisdiction : {}, county = clip(String(j.county || '').replace(/\s+county$/i, ''), 60).trim(), city = j.city ? clip(String(j.city), 60).trim() : null;
  if (!county) return res.status(400).json({ error: 'The county the site is in isn’t known yet: open the project’s Jurisdiction box first.' });
  const water = (Array.isArray(j.districts) ? j.districts : []).slice(0, 6).map(d => typeof d === 'string' ? { name: clip(d, 80), type: /drainage/i.test(d) ? 'drainage district' : '' } : { name: clip(d?.name, 80), type: clip(d?.type, 60) }).filter(d => d.name);
  const where = [clip(j.address, 160), Number.isFinite(+j.lat) && Number.isFinite(+j.lon) && j.lat != null && j.lon != null ? (+j.lat).toFixed(5) + ', ' + (+j.lon).toFixed(5) : ''].filter(Boolean).join(' · '), known = new Set((Array.isArray(b.known) ? b.known : []).map(String).slice(0, 500));
  res.setHeader('Cache-Control', 'no-store'); const t0 = Date.now(), by = t0 + 150000, end = t0 + 270000; // (the reads done by 150 s, the answer by 270 s: always inside the function's 300 s, so a slow read still answers with the stand-in sheet)
  // 1. the ETJ (no city limits round it): the AI decides, and the sheet says which way
  let etj = null; if (!city) { try { const r = await webSearch(key, 'Is this site in the extraterritorial jurisdiction (ETJ) of a city? ' + (where || 'A site') + ' in ' + county + ' County, Texas (outside any city limits).', '', true, ETJ, { maxTokens: 1500, size: 'medium', by: t0 + 50000 }); const d = RS.parseEtj(r.answer); etj = d ? { city: d.etj, decided: d.decided, why: d.why, url: d.url || r.sources[0]?.url || null } : ETJ_NONE('The ETJ answer couldn’t be read: treated as not in one.'); } catch (e) { console.error('siteplan rules etj', e.message); etj = ETJ_NONE('The ETJ check didn’t answer: treated as not in one.'); } }
  const jur = RS.jurisdictionOf({ county, place: city ? { name: city } : null, water }, etj), base = { key: jur.key, name: jur.name, kind: jur.kind, etj };
  if (known.has(jur.key) && !b.refresh) return res.json({ ...base, cached: true });
  // 2. the research: the subdivision rules (the city's in an ETJ) and the drainage criteria, read in parallel
  const who = jur.kind === 'county' ? county + ' County, Texas' : jur.city + ', Texas' + (jur.kind === 'etj' ? ' (its extraterritorial jurisdiction, in ' + county + ' County)' : ''), dd = jur.dd ? ' and the ' + jur.dd : '';
  const q = [['Subdivision and development regulations of ' + who + ': street right-of-way and pavement widths for local and collector streets, maximum block length, maximum cul-de-sac length and bulb radius, intersection and driveway spacing, corner clearance, sidewalk requirement and width, minimum lot size and frontage, building lines, and when a second entrance is required.', 'municode or the official code of ordinances, or the county subdivision regulations PDF'],
    ['Drainage criteria manual for ' + county + ' County, Texas' + dd + ': required detention storage rate (acre-feet per acre) for new residential subdivisions.', 'the county flood control or drainage district criteria manual']];
  const reads = await Promise.allSettled(q.map(([text, near]) => webSearch(key, text, near, true, READ, { maxTokens: 5000, size: 'medium', timeout: 120000, by })));
  const got = reads.filter(r => r.status === 'fulfilled' && r.value.answer).map(r => r.value), sources = got.flatMap(r => r.sources.map(x => x.url));
  if (!got.length) { console.error('siteplan rules search', reads.map(r => r.reason?.message).join('; ')); return res.json({ sheet: RS.standIn({ ...base, why: 'The web search didn’t answer.' }) }); }
  // 3. structured: each value with its page, section, quote and sure flag (lib/rulesheet.mjs sheetFrom checks the pages)
  try {
    const user = JSON.stringify({ jurisdiction: { name: jur.name, kind: jur.kind, county, city: jur.city, etj }, notes: got.map((r, i) => ({ topic: i ? 'drainage' : 'subdivision rules', text: clip(r.answer, 12000), sources: r.sources.map(x => ({ title: x.title, url: x.url })) })) });
    let tm = null; const late = new Promise((_, no) => { tm = setTimeout(() => no(new Error('out of time')), Math.max(1000, end - Date.now())); });
    const call = ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: RULES_SYSTEM, user, name: 'rule_sheet', schema: RULES_SCHEMA, maxTokens: 8000, effort: 'low' })); call.catch(() => {}); // (one that answers after the stand-in has gone: dropped)
    const r = await Promise.race([call, late]).finally(() => clearTimeout(tm));
    return res.json({ sheet: RS.sheetFrom(r.data, { ...base, sources }) });
  } catch (e) { console.error('siteplan rules', e.message); return res.json({ sheet: RS.standIn({ ...base, why: 'The AI couldn’t read the code just now.' }) }); }
}

// ---------- street names from a theme (lib/streetnames.mjs) ----------
// POST { mode: 'streetNames', theme, community, site, streets: [{ id, kind, lengthFt }], avoid: [names], current: [names] }
//   -> { theme, names: [{ id, base, suffix }] } (checked: a base a street here or nearby has already, or a suffix its kind
// doesn't take, is replaced from the plain list)
export const STREETNAMES_SCHEMA = { type: 'object', additionalProperties: false, required: ['theme', 'names'], properties: {
  theme: str('The theme followed, in a few words ("golf", "Texas rivers").'),
  names: { type: 'array', description: 'One per street given.', items: { type: 'object', additionalProperties: false, required: ['id', 'base', 'suffix'], properties: { id: str('The street\'s id as given.'), base: str('The name without its suffix: one or two short words.'), suffix: { type: 'string', enum: SUFFIXES } } } } } };
export const STREETNAMES_SYSTEM = `You name the streets of a planned neighbourhood in the Houston region for a site-planning tool.
- Follow the theme given; with none, pick one that suits the community's name and the place (its creeks, prairie, trees, history) and say it in theme.
- Grander names for the boulevard and the collectors (suffix Parkway or Boulevard, a collector may be a Drive); the local streets Lane, Way, Drive or Trail; the cul-de-sacs (kind court) Court or Circle.
- No two streets share a base name or one that sounds alike (Oak and Oaks, Lake and Lakes), and none is in avoid (the streets nearby): 911 addressing refuses duplicates.
- Short, easy to say and to spell over the phone: one or two words, no numbers, no directions (North, East).
- No trademarks and no real people's full names.`;
async function streetNames(b, key, res) {
  const streets = (Array.isArray(b.streets) ? b.streets : []).slice(0, 120).map(x => ({ id: clip(String(x?.id ?? ''), 40), kind: ['boulevard', 'entry', 'collector', 'local', 'court'].includes(x?.kind) ? x.kind : 'local', lengthFt: Math.max(0, Math.round(num(x?.lengthFt) || 0)) })).filter(x => x.id);
  if (!streets.length) return res.status(400).json({ error: 'No streets to name.' });
  const avoid = (Array.isArray(b.avoid) ? b.avoid : []).slice(0, 150).map(n => clip(String(n), 40)).filter(Boolean), theme = clip(b.theme, 120).trim();
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: STREETNAMES_SYSTEM, user: JSON.stringify({ theme: theme || null, community: clip(b.community, 60) || null, site: JSON.parse(siteText(b.site, '', null, null)).site, streets, avoid, current: (Array.isArray(b.current) ? b.current : []).slice(0, 120).map(n => clip(String(n), 40)) }), name: 'street_names', schema: STREETNAMES_SCHEMA, maxTokens: 6000, effort: 'low' }));
    const ok = namesFor(streets.map(x => ({ key: x.id, role: x.kind, L: x.lengthFt })), r.data?.names || [], { avoid });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ theme: clip(r.data?.theme || theme, 120), names: [...ok].map(([id, n]) => { const w = n.split(' '); return { id, base: w.slice(0, -1).join(' '), suffix: w[w.length - 1] }; }) });
  } catch (e) { console.error('siteplan streetNames', e.message); return res.status(502).json({ error: 'The AI didn’t answer just now.' }); }
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
- If the question isn't about this plan or site, say briefly that you can only answer about the plan that's open.
- lastBuild.aiPlan is the AI's own brief for the site (what it asked the layout engine to build), with its reason for each decision and what the engine changed from it: for "why is the pond there?", "why two pads?" and the like, give the AI's reason from it and say whether the layout on the screen is the AI's plan (thisLayoutIsAiPlan) or one of the engine's, and what the engine changed and why.`;
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
  const user = 'Fact sheet for the plan on the screen:\n' + facts + (history.length ? '\n\nEarlier in this conversation:\n' + history.map(t => 'Q: ' + t.q + '\nA: ' + t.a).join('\n\n') : '') + refBlock(b.refs) + '\n\nQuestion: ' + question;
  try {
    const r = await ai(key, b, res, m => chatJSON({ key, model: m, feature: 'siteplan', system: guardSys(b, ASK_SYSTEM), user, name: 'plan_answer', schema: ASK_SCHEMA, maxTokens: 12000, effort: effortIn(b.effort, 'medium') }));
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
  const user = 'Fact sheet for the project on the screen:\n' + facts + (history.length ? '\n\nEarlier in this conversation:\n' + history.map(t => 'Q: ' + t.q + '\nA: ' + t.a).join('\n\n') : '') + refBlock(b.refs) + '\n\nQuestion: ' + question;
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
