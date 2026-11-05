// A corpus of EDIT requests: the words a person (or an agent through the MCP's plan_edit) types after a site plan exists.
// Each is said against one of a few base plans (laid out by the engine from a request on a synthetic site) and carries
// checks on the edited plan, measured by scripts/edit-corpus.mjs on the geometry (not on what the edit says it did).
// Written by hand before the edit reading was tuned (CASES); FRESH was written after tuning and scored once.
// The sites are synthetic (feet, x east, y north; the street along the south edge, a side street on the east where said).
// Holdout projects (P18, P35, P36, E054) are not in it.
//
// bases: { ring, front, streets, ask, then? } — then: edits applied to the base before the case (a plan with a problem to fix)
// checks ('subject' is pool | clubhouse | pond | parking | playground | dog park | courts | hotel | retail | restaurant |
//   apartments | townhomes | duplex | warehouse | buildings | amenities, or 'name:<label on the base plan>'):
//   ['in', s, region]                region: middle | front | back | corner | <compass> | '<back|front|compass> corner'
//   ['near', s, t | 'entrance', ft]  the gap between them at most ft
//   ['within', s, t]                 s's middle inside the middle 70% of t's extent
//   ['behindOf', s, t]               s farther from the street than t
//   ['moved', s, compass, ft]        its middle moved that way by ft (±15 ft, and under 20 ft sideways)
//   ['floors', s, n]                 every building of s has n floors
//   ['units', op, v, tol?]           op: delta (±tol) | delta>= | more% | less% | about (±tol) | min | max
//   ['gfa', use, op, v, tol?]        op: about (±tol share) | more% | min
//   ['keys', op, v]                  about (±10%) | min
//   ['area', s, 'more%', v]          its total area grew by that share
//   ['count', s, op, n]              how many buildings / pieces: min | max | exact
//   ['has', s] · ['none', s] · ['gone', s]  (gone: every base piece of s is off the plan)
//   ['swapped', s, t]                s now stands nearer where t stood than where s stood
//   ['angled', deg?]                 surface rows angled (at that angle)
//   ['behind', 'parking', 'buildings'] / ['infront', 'parking', 'buildings']  stall-weighted depth from the street
//   ['spaces', 'delta>=', n]         surface + garage stalls
//   ['perUnit', v] · ['per1000', v]  the parking required at that rule, and the stalls drawn meet it (98%)
//   ['parkingOk']                    stalls drawn meet the required count
//   ['setback', edge, ft]            every building at least ft from that lot line (front | back | side | <compass>)
//   ['away', s, edge, ft]            every piece of s at least ft from that lot line
//   ['entrance', edge]               a way in touches that lot line
//   ['open', 'more', pts]            open space share up by pts (percentage points)
//   ['crowd', 'less']                fewer homes or lower coverage, and no less open space
//   ['amenities', 'more']            more amenity pieces (pool, playground, courts, dog park, lawn, clubhouse)
//   ['keepOthers', [s…], share]      of the base's buildings and amenities not among s, that share at the same spot and size
//   ['lock', s]                      exactly as on the base plan
export const BASES = {
  GA: { ring: [[0, 0], [900, 0], [900, 600], [0, 600]], front: 0, streets: [1], ask: 'garden apartments, as many as fit, with a pool and clubhouse', label: '900 x 600 ft, 12.4 ac, side street on the east' },
  GA4: { base: 'GA', then: [{ action: 'change', every: 'multifamily', floors: 4 }], label: 'the garden apartments made 4 stories with no re-fit (parking short)' },
  TH: { ring: [[0, 0], [700, 0], [700, 600], [0, 600]], front: 0, streets: [], ask: 'townhomes, as many as fit', label: '700 x 600 ft, 9.6 ac' },
  RC: { ring: [[0, 0], [700, 0], [700, 450], [0, 450]], front: 0, streets: [1], ask: '40,000 sf retail center with 2 pad sites', label: '700 x 450 ft, 7.2 ac, side street on the east' },
  MU: { ring: [[0, 0], [900, 0], [900, 700], [0, 700]], front: 0, streets: [1], ask: '20,000 sf of retail in front and apartments behind', label: '900 x 700 ft, 14.5 ac, side street on the east' },
  WH: { ring: [[0, 0], [1000, 0], [1000, 800], [0, 800]], front: 0, streets: [], ask: '150,000 sf warehouse', label: '1000 x 800 ft, 18.4 ac' },
  HR: { ring: [[0, 0], [700, 0], [700, 500], [0, 500]], front: 0, streets: [1], ask: 'a 120-key hotel and 20,000 sf of retail', label: '700 x 500 ft, 8 ac, side street on the east' }
};
const KEEP = (s, share = 0.8) => ['keepOthers', [].concat(s), share];
export const CASES = [
  // ---------- move ----------
  { id: 'E01', cat: 'move', base: 'GA', ask: 'move the pool to the center', out: [['in', 'pool', 'middle'], KEEP(['pool'])] },
  { id: 'E02', cat: 'move', base: 'MU', ask: 'put the clubhouse by the entrance', out: [['near', 'clubhouse', 'entrance', 120]] },
  { id: 'E03', cat: 'move', base: 'GA', ask: 'shift building 3 north 40 ft', out: [['moved', 'name:Apt Bldg 3', 'north', 40], KEEP(['name:Apt Bldg 3'])] },
  { id: 'E04', cat: 'move', base: 'MU', ask: 'move the dog park to the back corner', out: [['in', 'dog park', 'back corner'], KEEP(['dog park'])] },
  { id: 'E05', cat: 'move', base: 'GA', ask: 'move the pond to the front', out: [['in', 'pond', 'front']] },
  { id: 'E06', cat: 'move', base: 'MU', ask: 'move the playground next to the pool', out: [['near', 'playground', 'pool', 80], KEEP(['playground'])] },
  { id: 'E07', cat: 'move', base: 'HR', ask: 'move the hotel to the back of the site', out: [['in', 'hotel', 'back'], ['has', 'retail']] },
  { id: 'E08', cat: 'move', base: 'GA', ask: 'slide Apt Bldg 5 west 50 feet', out: [['moved', 'name:Apt Bldg 5', 'west', 50], KEEP(['name:Apt Bldg 5'])] },
  { id: 'E09', cat: 'move', base: 'TH', ask: 'move the pond to the northeast corner', out: [['in', 'pond', 'northeast corner']] },
  { id: 'E10', cat: 'move', base: 'MU', ask: 'move the clubhouse to the middle of the apartments', out: [['within', 'clubhouse', 'apartments']] },
  // ---------- resize / count ----------
  { id: 'E11', cat: 'resize', base: 'GA', ask: 'make it 4 stories', out: [['floors', 'apartments', 4], ['units', 'more%', 0.2]] },
  { id: 'E12', cat: 'resize', base: 'GA', ask: 'add 20 more units', out: [['units', 'delta', 20, 12]] },
  { id: 'E13', cat: 'resize', base: 'HR', ask: 'drop the retail to 15k', out: [['gfa', 'retail', 'about', 15000, 0.1], ['has', 'hotel']] },
  { id: 'E14', cat: 'resize', base: 'GA', ask: 'bigger pond', out: [['area', 'pond', 'more%', 0.15]] },
  { id: 'E15', cat: 'resize', base: 'GA', ask: 'make Apt Bldg 7 four stories', out: [['floors', 'name:Apt Bldg 7', 4], KEEP(['name:Apt Bldg 7'])] },
  { id: 'E16', cat: 'resize', base: 'TH', ask: 'make the townhomes 2 stories', out: [['floors', 'townhomes', 2]] },
  { id: 'E17', cat: 'resize', base: 'RC', ask: 'make the retail 50,000 sf', out: [['gfa', 'retail', 'about', 50000, 0.08]] },
  { id: 'E18', cat: 'resize', base: 'MU', ask: 'cut the apartments to 180 units', out: [['units', 'about', 180, 10], ['has', 'retail']] },
  { id: 'E19', cat: 'resize', base: 'HR', ask: 'make the hotel 150 keys', out: [['keys', 'about', 150], ['has', 'retail']] },
  { id: 'E20', cat: 'resize', base: 'WH', ask: 'make the warehouse 200,000 sf', out: [['gfa', 'industrial', 'about', 200000, 0.05]] },
  { id: 'E21', cat: 'resize', base: 'GA', ask: 'make all the buildings 2 stories', out: [['floors', 'apartments', 2]] },
  { id: 'E22', cat: 'resize', base: 'TH', ask: 'fewer townhomes, about 100', out: [['units', 'about', 100, 8]] },
  // ---------- swap / add / remove ----------
  { id: 'E23', cat: 'swap', base: 'GA', ask: 'add a dog park in the corner', out: [['has', 'dog park'], ['in', 'dog park', 'corner'], KEEP([], 0.75)] },
  { id: 'E24', cat: 'swap', base: 'GA', ask: 'remove building 2', out: [['gone', 'name:Apt Bldg 2'], KEEP(['name:Apt Bldg 2'])] },
  { id: 'E25', cat: 'swap', base: 'TH', ask: 'swap the townhomes for duplexes', out: [['none', 'townhomes'], ['has', 'duplex']] },
  { id: 'E26', cat: 'swap', base: 'RC', ask: 'add a 120-key hotel at the front', out: [['keys', 'min', 108], ['in', 'hotel', 'front'], ['has', 'retail']] },
  { id: 'E27', cat: 'swap', base: 'GA', ask: 'add a playground next to the clubhouse', out: [['has', 'playground'], ['near', 'playground', 'clubhouse', 120]] },
  { id: 'E28', cat: 'swap', base: 'MU', ask: 'remove the dog park', out: [['none', 'dog park'], KEEP(['dog park'], 0.9)] },
  { id: 'E29', cat: 'swap', base: 'GA', ask: 'add pickleball courts behind the clubhouse', out: [['has', 'courts'], ['behindOf', 'courts', 'clubhouse']] },
  { id: 'E30', cat: 'swap', base: 'HR', ask: 'swap the hotel and the retail building', out: [['swapped', 'hotel', 'retail']] },
  { id: 'E31', cat: 'swap', base: 'WH', ask: 'add a second warehouse of 50,000 sf', out: [['count', 'warehouse', 'min', 2], ['gfa', 'industrial', 'min', 190000]] },
  { id: 'E32', cat: 'swap', base: 'TH', ask: 'add a pool and clubhouse in the middle', out: [['has', 'pool'], ['has', 'clubhouse'], ['in', 'pool', 'middle']] },
  { id: 'E33', cat: 'swap', base: 'RC', ask: 'add a restaurant pad near the main entrance', out: [['has', 'restaurant'], ['near', 'restaurant', 'entrance', 200]] },
  // ---------- parking ----------
  { id: 'E34', cat: 'parking', base: 'GA', ask: 'angle the parking', out: [['angled'], ['units', 'min', 250]] },
  { id: 'E35', cat: 'parking', base: 'RC', ask: 'move parking behind the buildings', out: [['behind', 'parking', 'buildings'], ['gfa', 'retail', 'min', 36000]] },
  { id: 'E36', cat: 'parking', base: 'GA', ask: 'add 30 spaces', out: [['spaces', 'delta>=', 30]] },
  { id: 'E37', cat: 'parking', base: 'GA', ask: '1.5 per unit', out: [['perUnit', 1.5]] },
  { id: 'E38', cat: 'parking', base: 'RC', ask: 'parking at 5 per 1,000', out: [['per1000', 5]] },
  { id: 'E39', cat: 'parking', base: 'MU', ask: 'make the parking 45 degree', out: [['angled', 45]] },
  { id: 'E40', cat: 'parking', base: 'HR', ask: 'put the parking in front of the buildings', out: [['infront', 'parking', 'buildings']] },
  { id: 'E41', cat: 'parking', base: 'TH', ask: 'add guest parking, about 20 more spaces', out: [['spaces', 'delta>=', 15]] },
  // ---------- settings ----------
  { id: 'E43', cat: 'settings', base: 'GA', ask: 'front setback 40 ft', out: [['setback', 'front', 40]] },
  { id: 'E44', cat: 'settings', base: 'GA', ask: 'second entrance off the side street', out: [['entrance', 'side'], KEEP([], 0.8)] },
  { id: 'E45', cat: 'settings', base: 'RC', ask: 'rear setback 50 feet', out: [['setback', 'back', 50]] },
  { id: 'E46', cat: 'settings', base: 'TH', ask: 'side setbacks 25 ft', out: [['setback', 'west', 25], ['setback', 'east', 25]] },
  { id: 'E47', cat: 'settings', base: 'WH', ask: 'add a second entrance on the east side', out: [['entrance', 'east']] },
  { id: 'E48', cat: 'settings', base: 'GA', ask: 'keep all buildings 60 ft from the west property line', out: [['away', 'buildings', 'west', 60]] },
  // ---------- vague ----------
  { id: 'E49', cat: 'vague', base: 'GA', ask: 'make it denser', out: [['units', 'more%', 0.08]] },
  { id: 'E50', cat: 'vague', base: 'GA', ask: 'more open space', out: [['open', 'more', 2]] },
  { id: 'E51', cat: 'vague', base: 'GA', ask: 'make it feel less crowded', out: [['crowd', 'less']] },
  { id: 'E52', cat: 'vague', base: 'GA4', ask: 'fix the parking', out: [['parkingOk'], ['floors', 'apartments', 4]] },
  { id: 'E53', cat: 'vague', base: 'TH', ask: 'less dense please', out: [['units', 'less%', 0.05]] },
  { id: 'E54', cat: 'vague', base: 'MU', ask: 'more amenities', out: [['amenities', 'more']] },
  { id: 'E55', cat: 'vague', base: 'WH', ask: 'use more of the site', out: [['gfa', 'industrial', 'more%', 0.1]] },
  { id: 'E56', cat: 'vague', base: 'HR', ask: 'the hotel needs more parking', out: [['spaces', 'delta>=', 10]] },
  { id: 'E57', cat: 'vague', base: 'GA', ask: "it's too dense, back it off a bit", out: [['units', 'less%', 0.05], ['units', 'min', 180]] },
  { id: 'E58', cat: 'vague', base: 'GA4', ask: "the parking doesn't work, fix it", out: [['parkingOk']] },
  // ---------- messy / typos ----------
  { id: 'E59', cat: 'messy', base: 'GA', ask: 'mvoe teh pool to the centre', out: [['in', 'pool', 'middle']] },
  { id: 'E60', cat: 'messy', base: 'GA', ask: 'make bldg 7 4 stry', out: [['floors', 'name:Apt Bldg 7', 4], KEEP(['name:Apt Bldg 7'])] },
  { id: 'E61', cat: 'messy', base: 'GA', ask: 'add 20 untis', out: [['units', 'delta', 20, 12]] },
  { id: 'E62', cat: 'messy', base: 'HR', ask: 'retail down to 15ksf', out: [['gfa', 'retail', 'about', 15000, 0.1]] },
  { id: 'E63', cat: 'messy', base: 'GA', ask: 'angeled pkg pls', out: [['angled']] },
  { id: 'E64', cat: 'messy', base: 'GA', ask: "frnt setback 40'", out: [['setback', 'front', 40]] },
  { id: 'E65', cat: 'messy', base: 'TH', ask: 'remove townhome row 3', out: [['gone', 'name:Townhome Row 3'], KEEP(['name:Townhome Row 3'])] },
  { id: 'E66', cat: 'messy', base: 'MU', ask: 'move the dog prk to the nw corner', out: [['in', 'dog park', 'northwest corner']] },
  { id: 'E67', cat: 'messy', base: 'GA', ask: '1.5 spcs/unit', out: [['perUnit', 1.5]] },
  { id: 'E68', cat: 'messy', base: 'GA', ask: 'rmv bldg 2 & bldg 5', out: [['gone', 'name:Apt Bldg 2'], ['gone', 'name:Apt Bldg 5'], KEEP(['name:Apt Bldg 2', 'name:Apt Bldg 5'])] },
  // ---------- several edits in one sentence ----------
  { id: 'E69', cat: 'multi', base: 'GA', ask: 'make it 4 stories and angle the parking', out: [['floors', 'apartments', 4], ['angled']] },
  { id: 'E70', cat: 'multi', base: 'GA', ask: 'move the pool to the center, add a dog park in the corner and make building 7 four stories', out: [['in', 'pool', 'middle'], ['has', 'dog park'], ['in', 'dog park', 'corner'], ['floors', 'name:Apt Bldg 7', 4]] },
  { id: 'E71', cat: 'multi', base: 'MU', ask: 'drop the retail to 15k and add 20 more apartments', out: [['gfa', 'retail', 'about', 15000, 0.1], ['units', 'delta>=', 15]] },
  { id: 'E72', cat: 'multi', base: 'HR', ask: 'make the hotel 5 stories and put the parking behind', out: [['floors', 'hotel', 5], ['behind', 'parking', 'buildings']] },
  { id: 'E73', cat: 'multi', base: 'TH', ask: 'front setback 40 ft and add a pool in the middle', out: [['setback', 'front', 40], ['has', 'pool'], ['in', 'pool', 'middle']] },
  { id: 'E74', cat: 'multi', base: 'GA', ask: 'remove building 2, then add a playground where it was', out: [['gone', 'name:Apt Bldg 2'], ['has', 'playground'], ['near', 'playground', 'name:Apt Bldg 2', 40]] },
  { id: 'E75', cat: 'multi', base: 'RC', ask: 'add a 120-key hotel at the back and angle the parking', out: [['keys', 'min', 108], ['in', 'hotel', 'back'], ['angled']] },
  // ---------- locked pieces ----------
  { id: 'E76', cat: 'lock', base: 'GA', ask: 'keep building 1 where it is and make it denser', out: [['lock', 'name:Apt Bldg 1'], ['units', 'more%', 0.05]] },
  { id: 'E77', cat: 'lock', base: 'GA', ask: 'lock the clubhouse and pool, then move the pond to the front', out: [['lock', 'clubhouse'], ['lock', 'pool'], ['in', 'pond', 'front']] },
  { id: 'E78', cat: 'lock', base: 'GA', ask: 'keep the clubhouse where it is and front setback 40 ft', out: [['lock', 'clubhouse'], ['setback', 'front', 40]] },
  { id: 'E79', cat: 'lock', base: 'MU', ask: "don't touch the retail; add 30 more units", out: [['lock', 'retail'], ['units', 'delta>=', 25]] },
  { id: 'E80', cat: 'lock', base: 'TH', ask: 'lock Townhome Row 1, then angle the parking', out: [['lock', 'name:Townhome Row 1'], ['angled']] },
  { id: 'E81', cat: 'lock', base: 'GA', ask: 'keep building 3 where it is and move the pool to the center', out: [['lock', 'name:Apt Bldg 3'], ['in', 'pool', 'middle']] },
  { id: 'E82', cat: 'lock', base: 'HR', ask: 'keep the hotel exactly where it is, make the retail 25,000 sf', out: [['lock', 'hotel'], ['gfa', 'retail', 'about', 25000, 0.1]] }
];
// written after the tuning (LAYOUT-ENGINE.md item 41), scored once
export const FRESH = [];
