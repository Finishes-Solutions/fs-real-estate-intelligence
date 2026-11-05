// Building types as parametric primitives. A type is a primitive (the footprint and how the engine draws it) with
// parameter defaults (length, depth, wings, floors, floor height, units / keys / beds / sf a floor, core and corridor,
// how it parks) and use rules (what each floor is for, what it counts, its parking rule, the colour of its block on the
// plan and the 3D map). docs/BUILDING-TYPES.md has the inventory and the model.
//
//  - PRIMITIVES: the shapes the layout engine draws (lib/sitegen.mjs, lib/sitegencom.mjs, lib/sitelayout.mjs,
//    lib/sitepad.mjs, lib/customtypes.mjs ...) with their parameters and an outline in feet (outline(p): the front along
//    -y), so a type of any size can be drawn and explained.
//  - PRESETS: named types. The engine's existing types are presets marked existing: their numbers here are the engine's
//    own (test/btypes.mjs checks them against lib/siteplan.mjs USES, lib/sitegen.mjs and lib/reftemplates.mjs) and they
//    change nothing in the program the words make, so every existing request lays out exactly as before. The new presets
//    (hotels by keys, senior and student housing, daycare, schools, car washes, banks, fitness and big-box stores, cold
//    storage, data centres, flex with a mezzanine ...) map onto the engine's drawing paths with their own parameters.
//  - applyType(program, words): the preset the words name, modified by the words ("a 6-story hotel with 120 keys",
//    "3-story self storage 90,000 sf", "flex buildings 120 ft deep with mezzanine", "L-shaped 4-story apartments"), on
//    the program lib/siteplan.mjs guessProgram makes. Words naming no type the engine knows map to the closest primitive
//    and say so in the notes.
//  - tagElements / typeNotes: after a run, each building of the type carries its preset id, its colour key and its count
//    (keys, beds, children, students, sf), and the option's notes say which preset, primitive and sources were used.
//
// Every dimension says where it comes from: 'reviewed' (the reference library, docs/REFERENCE-PROVENANCE.md),
// 'engine' (the engine's own planning default), 'standard' (a published rule or a widely used planning figure, named)
// or 'estimate' (no reviewed reference: a planning estimate to confirm). Concept planning only.
import * as CT from './customtypes.mjs';

export const BTYPES_VERSION = '2026-11-04.1';

// ---------- primitives ----------
const R = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
const num = (v, d) => Number.isFinite(+v) && +v > 0 ? +v : d;
// an L / U as lib/siteplan.mjs outline draws one: wings round a court open to the front (-y); t the back bar's depth, k a wing's width
function wings(form, w, d, t, k) { const W = w / 2, D = d / 2; return form === 'L' ? [[-W, -D], [-W + k, -D], [-W + k, D - t], [W, D - t], [W, D], [-W, D]] : [[-W, -D], [-W + k, -D], [-W + k, D - t], [W - k, D - t], [W - k, -D], [W, -D], [W, D], [-W, D]]; }
export const PRIMITIVES = {
  bar: { label: 'Bar', note: 'A rectangle: a double-loaded corridor building, a shop or office row, a hotel', engine: 'lib/sitegen.mjs TYPES.bar, lib/sitelayout.mjs commercial rows', params: ['length', 'depth', 'floors', 'floorH', 'core'], outline: p => R(num(p.length, 240), num(p.depth, 65)) },
  'garden-stack': { label: 'Garden stack', note: 'Breezeway stacks in a row (stairs open to the air)', engine: 'lib/sitegen.mjs TYPES.garden + lib/reftemplates.mjs breezeway stack', params: ['modules', 'moduleW', 'depth', 'floors'], outline: p => R(num(p.moduleW, 75) * num(p.modules, 2), num(p.depth, 60)) },
  L: { label: 'L', note: 'Two wings at a corner', engine: 'element form L (lib/siteplan.mjs outline)', params: ['length', 'depth', 'wing', 'floors'], outline: p => wings('L', num(p.length, 200), num(p.depth, 130), num(p.wing, 65), num(p.wing, 65)) },
  U: { label: 'U', note: 'Three wings round a court open to the front', engine: 'element form U (lib/siteplan.mjs outline), lib/sitegen.mjs courtyard1 (U)', params: ['length', 'depth', 'wing', 'floors'], outline: p => wings('U', num(p.length, 260), num(p.depth, 170), num(p.wing, 65), num(p.wing, 65)) },
  courtyard: { label: 'Courtyard (O)', note: 'A closed ring of wings round a court, a gateway in the street wing', engine: 'lib/sitegen.mjs courtyard1 (ring), joinCourtyard', params: ['length', 'depth', 'wing', 'floors', 'gate'], outline: p => { const w = num(p.length, 300), d = num(p.depth, 240), k = num(p.wing, 65); return [...R(w, d), ...R(w - 2 * k, d - 2 * k).reverse()]; }, holes: true },
  T: { label: 'T', note: 'A bar with a wing off its middle (drawn as an L by the engine)', engine: 'not drawn: the L is the closest', params: ['length', 'depth', 'wing', 'floors'], mapsTo: 'L', outline: p => { const w = num(p.length, 240), d = num(p.depth, 65), k = num(p.wing, 60), s = num(p.stem, 90); return [[-w / 2, d / 2 - 0], [-w / 2, -d / 2 + 0], [-k / 2, -d / 2], [-k / 2, -d / 2 - s], [k / 2, -d / 2 - s], [k / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2]].reverse(); } },
  'tower-podium': { label: 'Tower on podium', note: 'A podium (parking and amenities) with a tower on part of it', engine: 'lib/sitelayout.mjs form "tower", lib/siteplan.mjs PODIUM', params: ['length', 'depth', 'floors', 'podium', 'towerShare'], outline: p => R(num(p.length, 200), num(p.depth, 128)) },
  'point-tower': { label: 'Point tower', note: 'A compact tower on a small podium', engine: 'form "tower" with a short podium', params: ['length', 'depth', 'floors'], mapsTo: 'tower-podium', outline: p => R(num(p.length, 120), num(p.depth, 120)) },
  wrap: { label: 'Wrap', note: 'Wings on three sides of a parking garage', engine: 'lib/sitegen.mjs wrapOf', params: ['wing', 'floors', 'levels'], outline: p => { const w = num(p.length, 300), d = num(p.depth, 250), k = num(p.wing, 65); return [[-w / 2, -d / 2], [-w / 2 + k, -d / 2], [-w / 2 + k, d / 2 - k], [w / 2 - k, d / 2 - k], [w / 2 - k, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]; } },
  'podium-court': { label: 'Courtyard on a podium', note: 'A U of wings over a parking podium (5 over 2)', engine: 'lib/sitegen.mjs podiumCourt', params: ['floors', 'podium'], outline: p => R(num(p.length, 300), num(p.depth, 240)) },
  row: { label: 'Row', note: 'Homes side by side in a row (townhomes, tuck-under, stacked, live-work)', engine: 'lib/sitelayout.mjs townhome rows, lib/sitegen.mjs tuckOf', params: ['unitW', 'depth', 'units', 'floors'], outline: p => R(num(p.unitW, 24) * num(p.units, 6), num(p.depth, 40)) },
  detached: { label: 'Detached', note: 'A house, cottage or tiny home on a lot or pad', engine: 'lib/streetnet.mjs lots, lib/sitecommunity.mjs', params: ['w', 'd', 'floors', 'lotW'], outline: p => R(num(p.w, 42), num(p.d, 40)) },
  plex: { label: 'Small multiplex', note: 'Two to four homes in one house-scaled building', engine: 'duplex buildings (lib/sitelayout.mjs)', params: ['units', 'w', 'd', 'floors'], outline: p => R(num(p.w, 44), num(p.d, 40)) },
  'big-box': { label: 'Big box', note: 'One deep building: a warehouse, an anchor store, a fitness club, a data centre', engine: 'lib/sitelayout.mjs warehouse / one-building rows', params: ['length', 'depth', 'clear', 'truck'], outline: p => R(num(p.length, 400), num(p.depth, 300)) },
  'cross-dock': { label: 'Cross-dock', note: 'A deep building with dock doors and a truck court on both long sides', engine: 'lib/sitegencom.mjs crossDock', params: ['length', 'depth'], outline: p => R(num(p.length, 312), num(p.depth, 800)) },
  'flex-bay': { label: 'Flex bays', note: 'A shallow building of small bays, a grade-door drive behind', engine: 'lib/sitelayout.mjs industrial flex (80-120 ft deep)', params: ['length', 'depth', 'mezzanine'], outline: p => R(num(p.length, 300), num(p.depth, 100)) },
  'storage-campus': { label: 'Storage campus', note: 'A climate-controlled building and drive-up rows behind a fence', engine: 'lib/sitelayout.mjs storage, lib/sitegencom.mjs storage', params: ['floors', 'climateSf', 'driveSf', 'rowD'], outline: p => R(num(p.length, 300), num(p.depth, 100)) },
  'canopy-pad': { label: 'Canopy and store', note: 'A fuel canopy over pump islands and a convenience store', engine: 'lib/sitefuel.mjs', params: ['pumps', 'storeSf'], outline: p => R(num(p.length, 75), num(p.depth, 60)) },
  'drive-thru-pad': { label: 'Drive-thru pad', note: 'A small freestanding building with a queue lane round it', engine: 'lib/sitepad.mjs', params: ['sf', 'lanes'], outline: p => R(num(p.length, 50), num(p.depth, 50)) },
  tunnel: { label: 'Tunnel', note: 'A long narrow building cars drive through (a car wash)', engine: 'freestanding building (lib/customtypes.mjs pads)', params: ['length', 'w'], outline: p => R(num(p.length, 130), num(p.w, 32)) },
  pavilion: { label: 'Building with its grounds', note: 'A building with its outdoor pieces beside it (play yard, fields, courts)', engine: 'lib/customtypes.mjs commons', params: ['sf', 'floors', 'outdoor'], outline: p => R(num(p.length, 110), num(p.depth, 70)) },
  cluster: { label: 'Cluster of pads', note: 'Several small freestanding buildings', engine: 'lib/customtypes.mjs pads, lib/sitepad.mjs', params: ['count', 'sf'], outline: p => R(num(p.length, 60), num(p.depth, 50)) },
  garage: { label: 'Parking garage', note: 'A stand-alone parking structure', engine: 'garage pieces beside other uses (lib/sitelayout.mjs); not drawn on its own yet', params: ['levels', 'spaces'], outline: p => R(num(p.length, 120), num(p.depth, 124)) }
};

// ---------- parameters ----------
// what a type can be told, with sane bounds (words outside them are held to them and the notes say so)
export const PARAMS = {
  floors: { label: 'floors', lo: 1, hi: 60 }, floorH: { label: 'floor to floor (ft)', lo: 8, hi: 60 }, depth: { label: 'depth (ft)', lo: 30, hi: 600 },
  length: { label: 'length (ft)', lo: 30, hi: 1500 }, wing: { label: 'wing depth (ft)', lo: 40, hi: 90 }, unitSf: { label: 'net sf a home', lo: 300, hi: 3000 },
  sfPerKey: { label: 'gross sf a key', lo: 300, hi: 1200 }, bedsPerUnit: { label: 'beds a unit', lo: 1, hi: 6 }, sfPerChild: { label: 'gross sf a child', lo: 35, hi: 120 },
  sfPerStudent: { label: 'gross sf a student', lo: 60, hi: 250 }, mezzanine: { label: 'mezzanine share of the footprint', lo: 0, hi: 0.5 },
  ratio: { label: 'spaces a 1,000 sf', lo: 0, hi: 30 }, perUnit: { label: 'spaces a home', lo: 0, hi: 4 }
};
export const CORES = ['breezeway', 'double-loaded', 'single-loaded', 'open', 'none'];
export const PARKING_RELATIONS = ['surface', 'tuck-under', 'podium', 'wrap', 'garage', 'none'];

// colour keys of the new presets' blocks (lib/planmap.mjs USE_COL and lib/sitesheet.mjs carry them); a preset without one
// is coloured by its engine use
export const TYPE_COLORS = { senior: '#c99a5b', student: '#d3a24f', civic: '#7d8fb8', bank: '#8f6a4e', fitness: '#c25b52', bigbox: '#b8613a', cold: '#7fa3b5', datacenter: '#6b7f8c', carwash: '#5a97b0', livework: '#a8745a', flex: '#9a8466' };
export const TYPE_LABELS = { senior: 'Senior living', student: 'Student housing', civic: 'School / daycare', bank: 'Bank', fitness: 'Fitness club', bigbox: 'Big-box store', cold: 'Cold storage', datacenter: 'Data center', carwash: 'Car wash', livework: 'Live-work', flex: 'Flex' };

// ---------- presets ----------
// existing: the engine's own type (its numbers the engine's; nothing in the program changes). src: where its numbers come from.
const E = 'engine';
const EXISTING = [
  { id: 'mf-garden', label: 'Garden apartments', family: 'multifamily', primitive: 'garden-stack', use: 'multifamily', form: 'mf-garden', params: { floors: 3, moduleW: 75, depth: 60, unitsPerFloor: 4, core: 'breezeway', parking: 'surface', perUnit: 1.6, floorH: 10 }, count: 'units', src: { cls: 'reviewed', ref: 'mf-garden-breezeway-3s (P37, P08, P06)' } },
  { id: 'mf-garden-studio', label: 'Studio / 1-bed garden buildings', family: 'multifamily', primitive: 'garden-stack', use: 'multifamily', form: 'mf-garden-studio', params: { floors: 3, moduleW: 75, depth: 60, unitsPerFloor: 6, core: 'breezeway', parking: 'surface' }, count: 'units', src: { cls: 'estimate', ref: 'mf-garden-studio-3s (extrapolated from the garden stack)' } },
  { id: 'mf-walkup', label: 'Walk-up apartments', family: 'multifamily', primitive: 'garden-stack', use: 'multifamily', form: 'mf-walkup', params: { floors: 3, moduleW: 75, depth: 60, unitsPerFloor: 4, core: 'breezeway' }, count: 'units', src: { cls: 'reviewed', ref: 'garden stack' } },
  { id: 'mf-midrise', label: 'Mid-rise corridor apartments', family: 'multifamily', primitive: 'bar', use: 'multifamily', form: 'mf-midrise', params: { floors: 4, moduleW: 50, depth: 65, unitsPerFloor: 4, core: 'double-loaded' }, count: 'units', src: { cls: 'reviewed', ref: 'mf-midrise-corridor-4s (P28, P11)' } },
  { id: 'mf-courtyard', label: 'Courtyard apartments', family: 'multifamily', primitive: 'courtyard', use: 'multifamily', form: 'mf-courtyard', params: { wing: 65, gate: 100, core: 'double-loaded' }, count: 'units', src: { cls: E, ref: 'lib/sitegen.mjs TYPES.wing, GATE' } },
  { id: 'mf-wrap', label: 'Wrap', family: 'multifamily', primitive: 'wrap', use: 'multifamily', form: 'mf-wrap', params: { wing: 65, floors: 5, parking: 'wrap' }, count: 'units', src: { cls: E, ref: 'lib/sitegen.mjs WRAP' } },
  { id: 'mf-tuck-under', label: 'Tuck-under apartments', family: 'multifamily', primitive: 'row', use: 'multifamily', form: 'mf-tuck-under', params: { unitW: 20, depth: 42, floors: 2, parking: 'tuck-under' }, count: 'units', src: { cls: 'reviewed', ref: 'mf-tuckunder-2s (E053)' } },
  { id: 'mf-podium-courtyard', label: 'Courtyard on a podium (5 over 2)', family: 'multifamily', primitive: 'podium-court', use: 'multifamily', form: 'mf-podium-courtyard', params: { floors: 7, podium: 2, parking: 'podium' }, count: 'units', src: { cls: E, ref: 'lib/sitegen.mjs podiumCourt' } },
  { id: 'mf-podium', label: 'Podium apartments', family: 'multifamily', primitive: 'tower-podium', use: 'multifamily', form: 'mf-podium', params: { podium: 2, depth: 128, parking: 'podium' }, count: 'units', src: { cls: E, ref: 'lib/siteplan.mjs PODIUM' } },
  { id: 'mf-tower-podium', label: 'Tower on podium', family: 'multifamily', primitive: 'tower-podium', use: 'multifamily', form: 'mf-tower-podium', params: { podium: 2, depth: 128, parking: 'podium' }, count: 'units', src: { cls: 'reviewed', ref: 'tower share from P25, E028 (lib/reftemplates.mjs REF_PODIUM)' } },
  { id: 'mf-townhome', label: 'Townhomes', family: 'multifamily', primitive: 'row', use: 'townhomes', form: 'mf-townhome', params: { unitW: 24, depth: 40, floors: 3, perUnit: 2, floorH: 10 }, count: 'units', src: { cls: E, ref: 'lib/siteplan.mjs USES.townhomes' } },
  { id: 'mf-stacked-townhome', label: 'Stacked townhomes', family: 'multifamily', primitive: 'row', use: 'multifamily', form: 'mf-stacked-townhome', params: { unitW: 20, depth: 42, floors: 4 }, count: 'units', src: { cls: 'estimate', ref: 'mf-stacked-2over2-4s (from E053)' } },
  { id: 'mf-plex', label: 'Duplex / triplex / fourplex', family: 'multifamily', primitive: 'plex', use: 'duplex', form: 'mf-plex', params: { units: 2, depth: 40, floors: 2, perUnit: 2 }, count: 'units', src: { cls: E, ref: 'lib/siteplan.mjs USES.duplex (triplexes and fourplexes drawn as duplexes)' } },
  { id: 'mf-cottage-btr', label: 'Build-to-rent cottages', family: 'multifamily', primitive: 'detached', use: 'sfr', form: 'mf-cottage-btr', params: { w: 37, d: 45, floors: 1 }, count: 'units', src: { cls: 'reviewed', ref: 'P20 Magnolia Village 2-bed cottage (lib/buildings.mjs)' } },
  { id: 'sfr-subdivision', label: 'Single-family lots', family: 'multifamily', primitive: 'detached', use: 'sfr', form: 'sfr-subdivision', params: { w: 42, d: 40, floors: 2, lotW: 50, perUnit: 2 }, count: 'units', src: { cls: E, ref: 'lib/siteplan.mjs HOME_TYPES' } },
  { id: 'ret-inline', label: 'Inline / strip retail', family: 'retail', primitive: 'bar', use: 'retail', form: 'ret-inline', params: { depth: 100, floors: 1, ratio: 4, floorH: 20 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.retail' } },
  { id: 'ret-anchored', label: 'Anchored center', family: 'retail', primitive: 'big-box', use: 'retail', form: 'ret-anchored', params: { ratio: 4 }, count: 'sf', src: { cls: E, ref: 'lib/sitecenter.mjs' } },
  { id: 'ret-restaurant', label: 'Restaurant pad', family: 'retail', primitive: 'bar', use: 'restaurant', form: 'ret-restaurant', params: { depth: 70, floors: 1, ratio: 10, floorH: 18 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.restaurant' } },
  { id: 'ret-drive-through', label: 'QSR with drive-thru', family: 'retail', primitive: 'drive-thru-pad', use: 'restaurant', form: 'ret-drive-through', params: { ratio: 10 }, count: 'sf', src: { cls: E, ref: 'lib/sitepad.mjs' } },
  { id: 'office', label: 'Office', family: 'office', primitive: 'bar', use: 'office', params: { depth: 110, floors: 2, ratio: 3.5, floorH: 13 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.office' } },
  { id: 'medical', label: 'Medical office', family: 'office', primitive: 'bar', use: 'medical', params: { depth: 100, floors: 1, ratio: 5, floorH: 14 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.medical' } },
  { id: 'hotel', label: 'Hotel', family: 'lodging', primitive: 'bar', use: 'hotel', params: { depth: 65, floors: 4, ratio: 1.82, floorH: 11, sfPerKey: 550, core: 'double-loaded' }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.hotel' } },
  { id: 'church', label: 'Church / worship', family: 'civic', primitive: 'big-box', use: 'church', params: { depth: 100, floors: 1, ratio: 10, floorH: 24 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.church (a space for every 3 seats)' } },
  { id: 'venue', label: 'Event / wedding venue', family: 'civic', primitive: 'pavilion', use: 'venue', params: { depth: 60, floors: 1, ratio: 10, floorH: 22 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.venue' } },
  { id: 'ind-warehouse', label: 'Warehouse with truck court', family: 'industrial', primitive: 'big-box', use: 'industrial', form: 'ind-warehouse', params: { depth: 240, floors: 1, ratio: 0.6, floorH: 36, truck: 130 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.industrial' } },
  { id: 'ind-cross-dock', label: 'Cross-dock warehouse', family: 'industrial', primitive: 'cross-dock', use: 'industrial', form: 'ind-cross-dock', params: { ratio: 0.6 }, count: 'sf', src: { cls: E, ref: 'lib/sitegencom.mjs XDOCK' } },
  { id: 'flex-multi-tenant', label: 'Multi-tenant flex', family: 'flex', primitive: 'flex-bay', use: 'industrial', form: 'flex-multi-tenant', params: { depths: [80, 100, 120] }, count: 'sf', src: { cls: E, ref: 'lib/sitelayout.mjs industrial flex' } },
  { id: 'storage', label: 'Self storage', family: 'storage', primitive: 'storage-campus', use: 'storage', params: { floors: 3, depth: 110, ratio: 0.1, floorH: 10 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs USES.storage, STORAGE' } },
  { id: 'fuel', label: 'Gas station / c-store', family: 'retail', primitive: 'canopy-pad', use: 'fuel', params: { pumps: 8, storeSf: 4500, ratio: 4 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs FUEL' } },
  { id: 'foodtrucks', label: 'Food truck park', family: 'retail', primitive: 'pavilion', use: 'foodtrucks', params: { ratio: 8 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs FOODTRUCK' } },
  { id: 'mx-vertical', label: 'Vertical mixed use', family: 'mixed_use', primitive: 'bar', use: 'multifamily', form: 'mx-vertical', params: { floors: 5, ground: 'retail' }, count: 'units', src: { cls: 'reviewed', ref: 'REF_CORRIDOR (P28, P11, P33)' } }
].map(p => ({ ...p, existing: true }));

// the new presets. Each sets the program the engine lays out (apply) from the words' numbers (X); the notes say what was
// assumed. Numbers marked 'estimate' have no reviewed reference in the library.
// a building's footprint as a box about twice as long as deep (the recipe's own bounds: 600 × 400 ft at most)
const box = foot => { const w = Math.min(600, Math.round(Math.sqrt(foot * 2))), d = Math.min(400, Math.round(foot / w)); return { w, d }; };
// apartment forms the engine already draws from reviewed templates (garden, mid-rise, courtyard ...): named with a housing
// type ("senior apartments, mid-rise"), the form's own path is kept and the type adds nothing
const MF_FORM = /\b(?:mid[- ]?rise|garden|courtyard|podium|wrap|tuck[- ]?under|tower|walk[- ]?ups?|corridor|breezeway|stacked|town ?(?:home|house)s?)\b/;
const NEW = [
  { id: 'hotel-limited', label: 'Limited-service hotel', short: 'Hotel', family: 'lodging', primitive: 'bar', use: 'hotel', color: null,
    params: { floors: 4, depth: 65, floorH: 11, sfPerKey: 550, perKey: 1, core: 'double-loaded', parking: 'surface' }, count: 'keys',
    src: { cls: 'standard', ref: 'about 1 space a room (common zoning for hotels; the engine’s 1.82 a 1,000 sf at 550 sf a key); 500-600 gross sf a key is typical of limited-service prototypes (estimate)' },
    when: (p, t, X) => p.use === 'hotel' && !/extended[- ]stay|residence inn|suites hotel|all[- ]suites?/.test(t) && (X.keys > 0 || /\b(?:limited|select|focused)[- ]service\b/.test(t)),
    apply: (p, t, X, P) => { if (X.keys && !X.sf) p.gfa = X.keys * P.params.sfPerKey; return p; } },
  { id: 'hotel-extended', label: 'Extended-stay hotel', short: 'Extended stay', family: 'lodging', primitive: 'bar', use: 'hotel', color: null,
    params: { floors: 4, depth: 66, floorH: 11, sfPerKey: 650, perKey: 1, core: 'double-loaded', parking: 'surface' }, count: 'keys',
    src: { cls: 'estimate', ref: 'about 650 gross sf a key (studio suites with kitchens, larger than a limited-service room); 1 space a key (common zoning)' },
    when: (p, t) => /extended[- ]stay|residence inn|suites hotel|all[- ]suites? hotel/.test(t) && (p.use === 'hotel' || p.use === 'other'),
    apply: (p, t, X, P) => { p.use = 'hotel'; if (X.keys && !X.sf) p.gfa = X.keys * P.params.sfPerKey; if (!p.gfa) p.gfa = 100 * P.params.sfPerKey; if (!X.floors) p.btFloors = P.params.floors; p.depth = P.params.depth; p.ratio = +(1000 / P.params.sfPerKey * P.params.perKey).toFixed(2); return p; } },
  { id: 'storage-multi', label: 'Multi-story self storage', short: 'Self storage', family: 'storage', primitive: 'storage-campus', use: 'storage',
    params: { floors: 3, climateOnly: true }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs STORAGE (72% rentable in a climate-controlled building); one building, no drive-up rows when only its size is given' },
    when: (p, t) => p.use === 'storage' && /\b[2-6][- ]?stor(?:y|ies|ey)|multi[- ]?stor(?:y|ey)/.test(t) && !/drive[- ]?up|non[- ]?climate|outdoor units|rv|boat/.test(t),
    apply: (p, t, X) => { const st = { ...(p.storage || {}) }, sf = st.climateSf || X.sf || p.gfa; if (sf) { st.climateSf = sf; st.driveSf = 0; delete p.gfa; } p.storage = st; return p; } },
  { id: 'storage-single', label: 'Single-story drive-up storage', short: 'Drive-up storage', family: 'storage', primitive: 'storage-campus', use: 'storage',
    params: { floors: 1, rowD: 40 }, count: 'sf', src: { cls: E, ref: 'lib/siteplan.mjs STORAGE (92% rentable in drive-up rows)' },
    when: (p, t) => p.use === 'storage' && /single[- ]stor(?:y|ey)|\b1[- ]stor(?:y|ey)|one[- ]stor(?:y|ey)|drive[- ]?up only|all drive[- ]?up/.test(t) && !/climate/.test(t),
    apply: (p, t, X) => { const st = { ...(p.storage || {}) }; st.climateSf = 0; if (!st.driveSf && (X.sf || p.gfa)) st.driveSf = X.sf || p.gfa; delete p.gfa; p.storage = st; p.floors = 1; return p; } },
  { id: 'mob', label: 'Medical office building', short: 'Medical office', family: 'office', primitive: 'bar', use: 'medical',
    params: { floors: 2, depth: 100, ratio: 5, floorH: 14 }, count: 'sf', src: { cls: 'estimate', ref: 'parking 5 a 1,000 sf (the engine’s medical rule, common for medical office); 2 floors an estimate for a suburban MOB' },
    when: (p, t) => p.use === 'medical' && /medical office building|\bmob\b|medical office/.test(t),
    apply: (p, t, X, P) => { if (!X.floors) p.btFloors = P.params.floors; return p; } },
  { id: 'clinic', label: 'Clinic / urgent care', short: 'Clinic', family: 'office', primitive: 'bar', use: 'medical',
    params: { floors: 1, depth: 100, ratio: 5, sf: 6000 }, count: 'sf', src: { cls: 'estimate', ref: 'parking 5 a 1,000 sf (the engine’s medical rule); 5,000-8,000 sf typical of a freestanding clinic (lib/buildings.mjs urgent care 5,000 sf)' },
    when: (p, t) => p.use === 'medical' && /\bclinic|urgent care|dental|surgery center|surgical/.test(t),
    apply: (p, t, X, P) => { if (!p.gfa) p.gfa = P.params.sf; return p; } },
  { id: 'senior-al', label: 'Assisted living / memory care', short: 'Assisted living', family: 'multifamily', primitive: 'bar', use: 'multifamily', color: 'senior', form: 'multifamily',
    params: { floors: 3, unitSf: 780, perUnit: 0.5, bedsPerUnit: 1, core: 'double-loaded', parking: 'surface' }, count: 'beds',
    src: { cls: 'estimate', ref: 'about 920 gross sf a suite with its share of dining and care space (780 net at the engine’s 85%); 0.5 spaces a suite (staff and visitors; residents seldom drive); one bed a suite' },
    when: (p, t) => /assisted living|memory care|skilled nursing|nursing (?:home|facility)|senior care|personal care home/.test(t) && !MF_FORM.test(t),
    apply: (p, t, X, P) => { p.use = 'multifamily'; if (X.beds || X.units) p.units = Math.round((X.beds || X.units) / (X.beds ? P.params.bedsPerUnit : 1)); if (!X.floors) p.btFloors = P.params.floors; p.unitSf = P.params.unitSf; p.perUnit = X.perUnit || P.params.perUnit; delete p.compare; return p; } },
  { id: 'senior-il', label: 'Independent senior living', short: 'Senior living', family: 'multifamily', primitive: 'bar', use: 'multifamily', color: 'senior', form: 'multifamily',
    params: { floors: 4, unitSf: 950, perUnit: 1, core: 'double-loaded', parking: 'surface' }, count: 'units',
    src: { cls: 'estimate', ref: 'about 950 net sf a home (1 and 2 bedrooms); 1 space a home (age-restricted rules commonly ask 1 or less)' },
    when: (p, t) => /independent living|senior (?:living|housing)|55\+ (?:community|living)/.test(t) && !/assisted|memory care/.test(t) && !MF_FORM.test(t),
    apply: (p, t, X, P) => { p.use = 'multifamily'; if (X.units) p.units = X.units; if (!X.floors) p.btFloors = P.params.floors; p.unitSf = P.params.unitSf; p.perUnit = X.perUnit || P.params.perUnit; delete p.compare; return p; } },
  { id: 'student', label: 'Student housing', short: 'Student housing', family: 'multifamily', primitive: 'bar', use: 'multifamily', color: 'student', form: 'multifamily',
    params: { floors: 4, unitSf: 1100, bedsPerUnit: 3, perBed: 0.6, core: 'double-loaded', parking: 'surface' }, count: 'beds',
    src: { cls: 'estimate', ref: 'purpose-built student housing: about 3 beds a unit on average (2-4 bedroom units, a bath each), about 1,100 net sf a unit, 0.6 spaces a bed (rules near campuses run 0.5-0.75)' },
    when: (p, t) => /student (?:housing|apartments|living|residences?|community)|purpose[- ]built student|\bdorm(?:itor(?:y|ies))?s?\b/.test(t) && !MF_FORM.test(t),
    apply: (p, t, X, P) => { p.use = 'multifamily'; const bpu = X.bedsPerUnit || P.params.bedsPerUnit; if (X.beds) p.units = Math.ceil(X.beds / bpu); else if (X.units) p.units = X.units; if (!X.floors) p.btFloors = P.params.floors; p.unitSf = P.params.unitSf; p.perUnit = X.perUnit || +(P.params.perBed * bpu).toFixed(2); p.bedsPerUnit = bpu; delete p.compare; return p; } },
  { id: 'live-work', label: 'Live-work townhomes', short: 'Live-work', family: 'multifamily', primitive: 'row', use: 'townhomes', color: 'livework',
    params: { floors: 3, unitW: 24, depth: 40, workSf: 450 }, count: 'units', src: { cls: 'estimate', ref: 'a townhome row (the engine’s 24 × 40 ft homes, 3 floors) with a street-level work space of about 450 sf in each; parked as townhomes' },
    when: (p, t) => /\blive[- ]work\b|\bshop ?houses?\b|\bshophouses?\b|\bwork[- ]live\b/.test(t),
    apply: (p, t, X, P) => { p.use = 'townhomes'; if (X.units) p.units = X.units; if (!X.floors) p.btFloors = P.params.floors; delete p.compare; return p; } },
  { id: 'plex', label: 'Small multiplexes (triplex / fourplex)', short: 'Multiplex', family: 'multifamily', primitive: 'plex', use: 'duplex', form: null,
    params: { floors: 2, units: 4 }, count: 'units', note: 'Triplexes and fourplexes are drawn as duplex buildings (2 homes each); a fourplex is two side by side. A fourplex footprint of its own is not drawn yet.', src: { cls: E, ref: 'drawn as the engine’s duplex buildings (2 homes each, 2 floors): a fourplex is two of them side by side; homes counted as drawn' },
    when: (p, t) => /\b(?:fourplex(?:es)?|four-?plex(?:es)?|quadplex(?:es)?|quadruplex(?:es)?|triplex(?:es)?|small multiplex(?:es)?|multiplex(?:es)?|missing[- ]middle)\b/.test(t) && ['other', 'duplex', 'multifamily'].includes(p.use) && !/apartment|garden|mid[- ]?rise|town ?ho/.test(t),
    apply: (p, t, X) => { p.use = 'duplex'; if (X.units) p.units = X.units; delete p.compare; return p; } },
  { id: 'flex-mezz', label: 'Flex with mezzanine', short: 'Flex', family: 'flex', primitive: 'flex-bay', use: 'industrial', color: 'flex',
    params: { mezzanine: 0.25, depths: [80, 100, 120], floorH: 28 }, count: 'sf', src: { cls: 'estimate', ref: 'a mezzanine over a quarter of each bay (office or storage) unless the words give a share; counted beside the floor area, not in it; 24 ft clear (28 ft floor to roof) typical of flex' },
    when: (p, t) => p.use === 'industrial' && /\bflex\b/.test(t) && (/mezzanine/.test(t) || /\d{2,3}\s*(?:ft|feet|foot|')\s*[- ]?deep/.test(t)),
    apply: (p, t, X, P) => { p.flex = true; if (X.depth) p.depthFix = Math.max(60, Math.min(140, X.depth)); if (/mezzanine/.test(t)) p.mezzanine = X.pct != null ? Math.max(0, Math.min(0.5, X.pct / 100)) : P.params.mezzanine; return p; } },
  { id: 'cold-storage', label: 'Cold storage warehouse', short: 'Cold storage', family: 'industrial', primitive: 'big-box', use: 'industrial', color: 'cold',
    params: { floorH: 45, ratio: 0.3, depth: 300 }, count: 'sf', src: { cls: 'estimate', ref: 'about 40 ft clear (45 ft floor to roof) and 0.3 spaces a 1,000 sf (fewer workers than a dry warehouse); docks and a truck court as a warehouse' },
    when: (p, t) => /cold storage|refrigerated (?:warehouse|distribution|storage)|freezer (?:warehouse|building)|cold chain/.test(t),
    apply: (p, t, X, P) => { p.use = 'industrial'; delete p.storage; delete p.flex; if (X.sf) p.gfa = X.sf; if (!X.ratio) p.ratio = P.params.ratio; if (p.truck !== false) p.truck = true; return p; } },
  { id: 'data-center', label: 'Data centre shell', short: 'Data center', family: 'industrial', primitive: 'big-box', use: 'industrial', color: 'datacenter',
    params: { floorH: 32, ratio: 0.2, truck: false }, count: 'sf', src: { cls: 'estimate', ref: 'a one-story shell about 32 ft to the roof, 0.2 spaces a 1,000 sf (few staff), no truck court (a loading dock or two); the generator and cooling yard is not drawn' },
    when: (p, t) => /\bdata ?cent(?:er|re)s?\b|\bhyperscale\b|\bcolocation (?:facility|building|center)\b|\bserver farm\b/.test(t),
    apply: (p, t, X, P) => { p.use = 'industrial'; delete p.anchor; if (X.sf) p.gfa = X.sf; if (!X.ratio) p.ratio = P.params.ratio; p.truck = false; p.buildings = p.buildings || 1; return p; } },
  { id: 'fitness', label: 'Fitness club', short: 'Fitness', family: 'retail', primitive: 'big-box', use: 'retail', color: 'fitness',
    params: { sf: 40000, ratio: 5, depth: 200, floorH: 20 }, count: 'sf', src: { cls: 'estimate', ref: '35,000-45,000 sf for a full-size club; 5 spaces a 1,000 sf (health clubs park heavier than retail)' },
    when: (p, t) => (p.use === 'retail' || p.use === 'other') && /fitness (?:center|centre|club)|\bgym\b|health club|athletic club/.test(t),
    apply: (p, t, X, P) => { p.use = 'retail'; if (!p.gfa) p.gfa = P.params.sf; if (!X.ratio) p.ratio = P.params.ratio; p.depth = P.params.depth; p.buildings = 1; return p; } },
  { id: 'big-box', label: 'Big-box store', short: 'Big box', family: 'retail', primitive: 'big-box', use: 'retail', color: 'bigbox',
    params: { sf: 120000, ratio: 4, depth: 300, floorH: 28 }, count: 'sf', src: { cls: 'estimate', ref: '100,000-180,000 sf boxes about 300 ft deep (lib/buildings.mjs big box 400 × 250 ft); parking at the engine’s retail 4 a 1,000 sf' },
    when: (p, t) => (p.use === 'retail' || p.use === 'other') && /big[- ]box|super ?cent(?:er|re)|home improvement (?:store|center)|wholesale club|department store|discount store/.test(t),
    apply: (p, t, X, P) => { p.use = 'retail'; if (!p.gfa) p.gfa = P.params.sf; p.depth = P.params.depth; p.buildings = 1; delete p.anchor; return p; } },
  { id: 'bank', label: 'Bank branch with drive-thru', short: 'Bank', family: 'retail', primitive: 'drive-thru-pad', use: 'restaurant', color: 'bank',
    params: { sf: 3500, ratio: 4, floorH: 16 }, count: 'sf', src: { cls: 'estimate', ref: 'a 2,500-4,500 sf branch with drive-thru lanes; 4 spaces a 1,000 sf (a space a 250 sf, common for banks); drawn on the drive-thru pad' },
    when: (p, t) => /\bbank\b|credit union/.test(t) && !/\bbank of\b|river ?bank|food bank|blood bank/.test(t),
    apply: (p, t, X, P) => { p.use = 'restaurant'; if (!p.gfa) p.gfa = P.params.sf; if (!X.ratio) p.ratio = P.params.ratio; p.buildings = 1; p.extras = [...new Set([...(p.extras || []), 'drivethru'])]; return p; } },
  { id: 'daycare', label: 'Daycare / early learning', short: 'Daycare', family: 'civic', primitive: 'pavilion', use: 'other', color: 'civic',
    params: { children: 150, sfPerChild: 50, playPerChild: 75, playShare: 0.5, perChild: 0.2, floors: 1 }, count: 'children',
    src: { cls: 'standard', ref: '35 sf of usable classroom a child is the common state licensing minimum (about 50 gross sf a child is an estimate), 75-80 sf of outdoor play a child for those outside at once (licensing; half the children an estimate), 0.2 spaces a child (about 1 a staff member plus drop-off; estimate)' },
    when: (p, t) => /\b(?:day ?care|child ?care|pre-?school|pre-k|early (?:learning|childhood)|learning cent(?:er|re)|montessori|nursery school)\b/.test(t) && !/adult day/.test(t),
    apply: (p, t, X, P) => { const kids = X.children || (X.sf ? Math.round(X.sf / P.params.sfPerChild) : P.params.children), sf = X.sf || kids * P.params.sfPerChild, play = kids * P.params.playShare * P.params.playPerChild, pw = Math.round(Math.sqrt(play * 1.6) / 2) * 2;
      return recipeProgram(p, { name: 'Daycare', pattern: 'commons', buildings: [{ label: 'Daycare', ...box(sf / (X.floors || 1)), floors: X.floors || 1 }], outdoor: [{ key: 'play', label: 'Play yard', w: pw, d: Math.round(play / pw) }], parking: { per: 'child', rate: P.params.perChild, basis: kids, label: 'children' }, figures: [kids + ' children'] }, { children: kids }); } },
  { id: 'school', label: 'School', short: 'School', family: 'civic', primitive: 'pavilion', use: 'other', color: 'civic',
    params: { students: { elementary: 600, middle: 800, high: 1200 }, sfPerStudent: { elementary: 125, middle: 140, high: 155 }, perStudent: { elementary: 0.12, middle: 0.12, high: 0.3 }, floors: { elementary: 1, middle: 2, high: 2 } }, count: 'students',
    src: { cls: 'estimate', ref: 'about 125 / 140 / 155 gross sf a student (elementary / middle / high; state facility guides run 100-170), parking 0.12 a student (staff and visitors) or 0.3 at a high school (students drive), a play yard and a playing field' },
    when: (p, t) => /\b(?:elementary|middle|high|primary|secondary|charter|private|junior high|k-12|prep(?:aratory)?) school\b|\bschool (?:building|campus)\b|\ba school\b/.test(t) && !/school district|driving school|cooking school|dance school/.test(t),
    apply: (p, t, X, P) => { const lvl = /high school|secondary|k-12|prep/.test(t) ? 'high' : /middle|junior high/.test(t) ? 'middle' : 'elementary', Q = k => P.params[k][lvl], n = X.students || X.children || (X.sf ? Math.round(X.sf / Q('sfPerStudent')) : Q('students')), sf = X.sf || n * Q('sfPerStudent');
      const outdoor = lvl === 'high' ? [{ key: 'green', label: 'Playing field', w: 360, d: 210 }] : [{ key: 'play', label: 'Play yard', w: 120, d: 80 }, { key: 'green', label: 'Playing field', w: 240, d: 160 }];
      return recipeProgram(p, { name: lvl[0].toUpperCase() + lvl.slice(1) + ' school', pattern: 'commons', buildings: [{ label: lvl[0].toUpperCase() + lvl.slice(1) + ' school', ...box(sf / (X.floors || Q('floors'))), floors: X.floors || Q('floors') }], outdoor, parking: { per: 'child', rate: Q('perStudent'), basis: n, label: 'students' }, figures: [n + ' students'] }, { students: n }); } },
  { id: 'car-wash', label: 'Express car wash', short: 'Car wash', family: 'retail', primitive: 'tunnel', use: 'other', color: 'carwash',
    params: { length: 130, w: 32, vacuums: 20 }, count: 'sf', note: 'The car wash’s stacking lanes to the pay stations are not drawn; check the queue (about 10-15 cars) against the local rule.', src: { cls: 'estimate', ref: 'a 110-130 ft express tunnel about 30 ft wide (lib/buildings.mjs express tunnel 110 ft), about 20 vacuum stalls; the stacking lanes to the pay stations are not drawn' },
    when: (p, t) => /car ?wash|tunnel wash|express wash|auto ?wash/.test(t) && p.use !== 'fuel',
    apply: (p, t, X, P) => recipeProgram(p, { name: 'Express car wash', pattern: 'pads', buildings: [{ label: 'Car wash tunnel', w: X.length || P.params.length, d: P.params.w, floors: 1 }], parking: { per: 'pad', rate: X.vacuums || P.params.vacuums, label: 'tunnels' }, figures: [(X.vacuums || P.params.vacuums) + ' vacuum stalls'] }, {}) },
  { id: 'garage-standalone', label: 'Stand-alone parking garage', short: 'Parking garage', family: 'parking', primitive: 'garage', use: 'other', status: 'unsupported',
    params: { levels: 5, sfPerSpace: 330 }, count: 'spaces', src: { cls: 'standard', ref: 'about 300-350 gross sf a space in a structured deck' },
    when: (p, t) => p.garage && p.use === 'other' && !p.gfa && /\bparking (?:garage|structure|deck)\b/.test(t) && !/apartment|retail|office|hotel|homes?|shops?/.test(t),
    apply: p => p }
].map(p => ({ ...p, existing: false }));

// the uses the words' program may already have for a new preset to take it over (a shopping center with a bank pad or a
// gym stays a shopping center; apartments with a daycare stay apartments); retail only when no center is named
const FROM = { 'senior-al': ['other', 'multifamily'], 'senior-il': ['other', 'multifamily'], student: ['other', 'multifamily'], 'live-work': ['other', 'townhomes', 'multifamily'], 'cold-storage': ['industrial', 'storage', 'other'], 'data-center': ['other', 'retail', 'industrial', 'office'], fitness: ['retail', 'other'], 'big-box': ['retail', 'other'], bank: ['other', 'restaurant', 'office', 'retail'], daycare: ['other', 'amenity'], school: ['other', 'amenity'], 'car-wash': ['other', 'retail'] };
const CENTER = /shopping|\bstrip\b|\bshops\b|inline|anchor|outparcel|\bpads\b|retail (?:center|centre|building)/;
const takes = (P, p, t) => !FROM[P.id] || FROM[P.id].includes(p.use) && !(p.use === 'retail' && CENTER.test(t));
for (const P of NEW) { const w = P.when; P.when = (p, t, X) => takes(P, p, t) && w(p, t, X); }
export const PRESETS = [...EXISTING, ...NEW];
export const presetOf = id => PRESETS.find(p => p.id === id) || null;

// a recipe for lib/customtypes.mjs (a building with its grounds, or pads) made into the engine's program, the site-level
// choices the words made kept
function recipeProgram(p, r, counts) {
  const rr = CT.recipeIn(r); if (!rr) return p;
  const q = CT.programOf(rr, p); for (const k of ['entrances', 'storm', 'detentionPct', 'trash', 'through', 'parkAngle']) if (p[k] != null && q[k] == null) q[k] = p[k];
  return { ...q, btCounts: counts };
}

// ---------- reading the words ----------
export function numbersOf(text) {
  const t = String(text || '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2'), X = {}, m = re => re.exec(t);
  let r;
  if ((r = m(/(\d+(?:\.\d+)?)\s*(k|thousand)?\s*\+?\s*(?:sf|sq\.?\s*ft|square[- ]f(?:ee|oo)t)/))) X.sf = +r[1] * (r[2] ? 1000 : 1);
  if ((r = m(/(\d+)[- ]?(?:stor(?:y|ies|ey)|floors?(?![- ]?plans?)|levels?)\b/))) X.floors = +r[1];
  if ((r = m(/(\d+)\s*(?:keys|(?:guest ?)?rooms|suites)\b/))) X.keys = +r[1];
  if ((r = m(/(\d+)\s*(?:beds?)\b(?!\s*(?:room|unit|apartment|home|suite))/)) && +r[1] >= 8) X.beds = +r[1];
  if ((r = m(/(\d+)[- ]?(?:bed(?:room)?s?)\s*(?:a|per|each)?\s*(?:unit|apartment)/)) && +r[1] <= 6) X.bedsPerUnit = +r[1];
  if ((r = m(/(\d+)\s*(?:children|kids|child|infants|toddlers)\b/))) X.children = +r[1];
  if ((r = m(/(\d+)\s*students?\b/))) X.students = +r[1];
  if ((r = m(/(\d+)\s*(?:[a-z-]+\s+){0,2}(?:units?|apartments|homes|townho(?:me|use)s?|suites)\b/))) X.units = +r[1];
  if ((r = m(/(\d{2,3})\s*(?:ft|feet|foot|')\s*[- ]?deep/))) X.depth = +r[1];
  if ((r = m(/(\d{2,3})\s*(?:ft|feet|foot|')\s*(?:long|tunnel)/))) X.length = +r[1];
  if ((r = m(/(\d+(?:\.\d+)?)\s*(?:spaces?|stalls?|parking)?\s*(?:\/|per|a)\s*1,?000/))) X.ratio = +r[1];
  if ((r = m(/(\d(?:\.\d+)?)\s*(?:spaces?|stalls?|parking)?\s*(?:per|a|an)\s*(?:unit|home|apartment|suite|bed)\b/))) X.perUnit = +r[1];
  if ((r = m(/(\d+)\s*vacuum/))) X.vacuums = +r[1];
  if ((r = m(/(\d+)\s*%\s*(?:mezzanine|mezz)|mezzanine (?:of |over )?(\d+)\s*%/))) X.pct = +(r[1] || r[2]);
  return X;
}
// words that shape a building of a type ("L-shaped", "U building", "around a pool")
const SHAPE = t => /\bl[- ]?shaped?\b|\bl[- ]shape\b|\bl[- ]building\b/.test(t) ? 'L' : /\bu[- ]?shaped?\b|\bu[- ]shape\b|\bu[- ]building\b/.test(t) ? 'U' : /\bt[- ]?shaped?\b|\bt[- ]building\b/.test(t) ? 'T' : null;

// the preset the words name, for the program the words already made (lib/siteplan.mjs guessProgram): new presets only
// (an existing type's words keep the program as it was)
export function typeFromWords(text, p = {}) {
  const t = String(text || '').toLowerCase(), X = numbersOf(t);
  return NEW.find(P => P.when(p, t, X)) || null;
}
// the name an unknown type is given in the words ("a custom type: trampoline park", "a 30,000 sf trampoline park")
function unknownName(t) {
  const m = /custom (?:building )?type:?\s*(?:an?\s+)?(?:\d+[- ]stor(?:y|ey)\s+)?([a-z][a-z /&'-]{2,40}?)(?=\s*(?:,|\.|;|\d|$|with|of|at))/.exec(t);
  if (m) return m[1].trim();
  const n = /\b(?:an?|one|the)\s+(?:\d[\d,.]*\s*(?:k\s*)?(?:sf|sq\.? ?ft|square feet)\s+)?(?:\d+[- ]stor(?:y|ey)\s+)?([a-z][a-z-]+(?:\s+[a-z][a-z-]+){0,2})\b/.exec(t);
  return n && !/^(?:building|site|lot|plan|layout|parking)$/.test(n[1]) ? n[1].trim() : null;
}

// The program with the type the words name applied. Several uses (zones) are left as they are: each zone keeps the
// engine's own type (not yet per zone). Returns the program unchanged when no new preset or shape is named.
export function applyType(p0, text) {
  if (!p0 || typeof p0 !== 'object' || p0.zones?.length > 1 || p0.custom || p0.parcels) return p0;
  const t = String(text || '').toLowerCase(), X = numbersOf(t), P = NEW.find(q => q.when(p0, t, X)), notes = [];
  if (P) {
    let p = P.apply({ ...p0 }, t, X, P);
    if (P.status === 'unsupported') { notes.push(P.label + ' is not drawn yet (it is laid out only beside other uses); the closest layout is shown.'); return { ...p0, btNotes: notes }; }
    p = { ...p, btype: P.id, ...(P.note ? { btNotes: [P.note] } : {}) }; if (P.form) p.btForm = P.form;
    if (P.params.floorH && P.color) p.btFloorH = P.params.floorH;
    return withRule(p, P);
  }
  // a shape asked for apartments ("L-shaped 4-story apartments", "U building around a pool"): the shape primitive with
  // the homes counted from floor area (no reviewed L or U template), never the garden stack drawn round a corner
  const sh = SHAPE(t), pool = /\b(?:a?round|surrounding|wrapping) (?:a |the )?(?:central )?(?:pool|court(?:yard)?)\b/.test(t);
  if ((sh || pool) && (p0.use === 'multifamily' || p0.use === 'other' && !p0.gfa && (pool || /\bbuildings?\b/.test(t)))) {
    const p = { ...p0 };
    if (p.use !== 'multifamily') { p.use = 'multifamily'; delete p.compare; notes.push('No use named: a building ' + (pool ? 'round a pool' : 'of that shape') + ' read as apartments (an assumption: say the use to change it).'); }
    if (sh === 'T') { notes.push('A T-shaped building is drawn as an L, the closest primitive the engine draws.'); p.form = 'L'; }
    if (pool && sh !== 'L') { p.arrangement = 'courtyard'; delete p.form; return { ...p, btype: 'mf-courtyard-u', btNotes: notes }; }
    p.form = p.form || sh; return { ...p, btype: p.form === 'L' ? 'mf-l' : 'mf-u', btForm: 'multifamily', btNotes: notes };
  }
  // words naming no type the engine knows: the closest primitive (a bar facing its parking) at the size and floors said,
  // the generic parking rule unless the words give one
  if ((p0.use === 'other' || p0.use === 'amenity' && p0.gfa > 0) && !p0.garage) { // ("a trampoline park 30,000 sf": a building of its own, not a commons)
    const name = unknownName(t); if (!name) return p0;
    const nm = name.replace(/\b\w/g, c => c.toUpperCase());
    notes.push('No building type matches "' + name + '": drawn with the bar primitive (one building row facing its parking)' + (p0.gfa ? ' at ' + Math.round(p0.gfa).toLocaleString('en-US') + ' sf' : '') + (p0.floors ? ', ' + p0.floors + ' floors' : '') + ', parking ' + (p0.ratio ? p0.ratio + ' a 1,000 sf as asked' : '3 a 1,000 sf (the generic rule; an assumption)') + '.');
    return withRule({ ...p0, use: 'other', btype: 'custom', btName: nm.slice(0, 40), btNotes: notes }, SHAPE_PRESETS.custom);
  }
  return p0;
}
// the type's parking rule, handed to the brief as its rule (lib/layoutbrief.mjs briefFromProgram): the engine and the
// independent check then count the same requirement. Spaces a home for homes, else spaces a 1,000 sf.
const RESI = ['multifamily', 'townhomes', 'duplex', 'sfr'];
function withRule(p, P) {
  const home = RESI.includes(p.use), v = home ? p.perUnit : p.ratio; if (!(+v >= 0) || v == null) return p;
  return { ...p, btRule: { key: home ? 'parkingPerUnit' : 'parkingPer1000', v: +v, source: P.label + ' preset (lib/btypes.mjs): ' + P.src.ref } };
}
// the type fields of the program a run started from, on the program an option came back with (the engine may hand back
// a copy without them)
export const BT_KEYS = ['btype', 'btName', 'btNotes', 'btFloorH', 'btCounts', 'bedsPerUnit', 'mezzanine'];
export const withType = (prog, from) => !from?.btype || prog?.btype ? prog : { ...prog, ...Object.fromEntries(BT_KEYS.filter(k => from[k] != null).map(k => [k, from[k]])) };
// the shape presets applyType makes for apartments (not in PRESETS' word list: they come from the shape words)
export const SHAPE_PRESETS = {
  'mf-l': { id: 'mf-l', label: 'L-shaped apartments', short: 'Apartments', primitive: 'L', use: 'multifamily', params: { wing: 65 }, count: 'units', src: { cls: E, ref: 'element form L (lib/siteplan.mjs outline); homes from floor area at the engine’s 900 sf (no reviewed L-shaped building)' } },
  'mf-u': { id: 'mf-u', label: 'U-shaped apartments', short: 'Apartments', primitive: 'U', use: 'multifamily', params: { wing: 65 }, count: 'units', src: { cls: E, ref: 'element form U (lib/siteplan.mjs outline); homes from floor area at the engine’s 900 sf (no reviewed U-shaped building)' } },
  'mf-courtyard-u': { id: 'mf-courtyard-u', label: 'Apartments round a pool court', short: 'Apartments', primitive: 'U', use: 'multifamily', params: { wing: 65 }, count: 'units', src: { cls: E, ref: 'lib/sitegen.mjs courtyard1 (a U open to the street or a closed ring, the pool in the court)' } },
  custom: { id: 'custom', label: 'Custom type', short: null, primitive: 'bar', use: 'other', params: {}, count: 'sf', src: { cls: 'estimate', ref: 'the closest primitive (a bar) at the size asked' } }
};
const anyPreset = id => presetOf(id) || SHAPE_PRESETS[id] || null;

// ---------- after a run ----------
const f0 = v => Math.round(v).toLocaleString('en-US');
const gfaOf = e => (e.poly ? 0 : e.w * e.d) * (e.floors || 1);
// each building of the program's type tagged with the preset (btype), its block colour key (tc) and floor height, and its
// count on the line under its name. No type on the program: the elements as they were (the same array).
export function tagElements(els, prog) {
  const P = anyPreset(prog?.btype); if (!P || !Array.isArray(els)) return els;
  const use = prog.use, short = P.short || prog.btName || P.label, fh = prog.btFloorH || null, custom = prog.custom?.name || null;
  return els.map(e => {
    if (custom && e.custom === custom && /AI-sized/.test(e.note || '')) e = { ...e, note: e.note.replace(/\s*·\s*AI-sized/, ' · preset (estimate)') }; // (a preset's recipe, not the AI's sizing)
    if (e.kind !== 'building' || (e.use || use) !== use || e.use === 'amenity' || e.storage === 'office') return e;
    const g = gfaOf(e), fl = e.floors || 1, q = { ...e, btype: P.id };
    if (P.color) q.tc = P.color; if (fh) q.floorH = fh;
    const nm = /^(?:Building|Bldg|Apt Bldg|Pad|Warehouse|Townhome (Row))\b\s*(.*)$/.exec(e.name || ''); if (nm && short) q.name = (short + (nm[1] ? ' row' : '') + ' ' + nm[2]).trim();
    const parts = [P.label === short ? null : P.label, fl + '-story'];
    if (P.count === 'keys') parts.push(f0(g / (P.params.sfPerKey || 550)) + ' keys');
    else if (P.count === 'beds' && e.units) parts.push(f0(e.units * (prog.bedsPerUnit || P.params.bedsPerUnit || 1)) + ' beds · ' + f0(e.units) + ' units');
    else if (P.count === 'units' && e.units) parts.push(f0(e.units) + ' units');
    else if ((P.count === 'children' || P.count === 'students') && prog.btCounts?.[P.count]) parts.push(f0(prog.btCounts[P.count]) + ' ' + P.count, f0(g) + ' sf');
    else parts.push(f0(g) + ' sf');
    if (prog.mezzanine > 0) parts.push(f0(e.w * e.d * prog.mezzanine) + ' sf mezzanine');
    q.note = RESI.includes(e.use || use) && e.note ? (P.label + ' · ' + e.note).slice(0, 160) : parts.filter(Boolean).join(' · '); // (homes keep the engine's line: front-load, garages ... are read from it)
    return q;
  });
}
// what the option's notes say about the type: which preset and primitive, its numbers and where they come from
export function typeNotes(prog, els = []) {
  const P = anyPreset(prog?.btype); if (!P) return [];
  const B = els.filter(e => e.kind === 'building' && e.btype === P.id), g = B.reduce((s, e) => s + gfaOf(e), 0), out = [];
  const what = P.count === 'keys' ? f0(g / (P.params.sfPerKey || 550)) + ' keys at about ' + P.params.sfPerKey + ' gross sf a key'
    : P.count === 'beds' ? f0(B.reduce((s, e) => s + (e.units || 0), 0) * (prog.bedsPerUnit || P.params.bedsPerUnit || 1)) + ' beds in ' + f0(B.reduce((s, e) => s + (e.units || 0), 0)) + ' units'
      : P.count === 'children' ? f0(prog.btCounts?.children || 0) + ' children' : P.count === 'students' ? f0(prog.btCounts?.students || 0) + ' students'
        : P.count === 'units' ? f0(B.reduce((s, e) => s + (e.units || 0), 0)) + ' units' : f0(Math.round(g / 10) * 10) + ' sf';
  out.push('Building type: ' + (P.id === 'custom' ? (prog.btName || 'custom') + ' (custom)' : P.label) + ', the ' + (PRIMITIVES[P.primitive]?.label || P.primitive) + ' primitive: ' + what + (prog.mezzanine > 0 ? ' plus ' + f0(B.reduce((s, e) => s + e.w * e.d, 0) * prog.mezzanine) + ' sf of mezzanine (' + Math.round(prog.mezzanine * 100) + '% of the footprint, not in the floor area)' : '') + '. Numbers: ' + P.src.ref + (P.src.cls === 'estimate' ? ' (estimate: no reviewed reference)' : '') + '.');
  return out.concat(prog.btNotes || []);
}
// a building's colour key on the plan and the 3D map: its type's, else its use
export const colorKey = e => e?.tc && TYPE_COLORS[e.tc] ? e.tc : e?.use;
