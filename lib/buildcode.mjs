// The building code basis of a plan set's building types: occupancy, when a sprinkler system is required (IBC 903.2),
// what construction type, height, stories and area per story are allowed (IBC 504 and 506, with the frontage
// increase of 506.3), and the occupant load factors of IBC Table 1004.5. IBC 2021 as Texas cities commonly adopt it;
// the jurisdiction's amendments govern. Pure functions, no DOM: lib/plandesign.mjs decides each type's code basis here
// once, and every sheet reads that decision (a 62-sheet set reviewed on Oct 20 had three sheets each working out
// sprinklers and heights their own way, and they disagreed).

// ---------- occupancy ----------
const OCC = { sfr: 'R-3 (IRC)', townhomes: 'R-3 townhouse (IRC)', duplex: 'R-3 (IRC)', multifamily: 'R-2', hotel: 'R-1', retail: 'M', restaurant: 'A-2', office: 'B', medical: 'B', church: 'A-3', industrial: 'S-1', fuel: 'M', amenity: 'A-3', foodtrucks: 'A-2', storage: 'S-1', other: 'B' };
export const IRC_USES = ['sfr', 'townhomes', 'duplex'];
export const occupancyOf = use => OCC[use] || 'B';
const group = occ => /^R-3/.test(occ) ? 'R-3' : occ.replace(/\s.*$/, ''); // 'R-3 townhouse (IRC)' -> 'R-3'

// ---------- occupant load (IBC Table 1004.5) ----------
// [sf per occupant, 'gross' | 'net', the table's words]
export const LOAD = {
  tenant: [60, 'gross', 'Mercantile'], sales: [60, 'gross', 'Mercantile'], dining_room: [15, 'net', 'Assembly, unconcentrated (tables and chairs)'],
  commercial_kitchen: [200, 'gross', 'Kitchens, commercial'], walk_in_cooler: [300, 'gross', 'Accessory storage'], office: [150, 'gross', 'Business'],
  reception: [150, 'gross', 'Business'], conference: [15, 'net', 'Assembly, unconcentrated (tables and chairs)'], break_room: [15, 'net', 'Assembly, unconcentrated (tables and chairs)'],
  exam: [150, 'gross', 'Business'], warehouse: [500, 'gross', 'Warehouses'], sanctuary: [7, 'net', 'Assembly, concentrated (chairs, not fixed)'], classroom: [20, 'net', 'Educational, classroom'],
  fitness: [50, 'gross', 'Exercise rooms'], lounge: [15, 'net', 'Assembly, unconcentrated (tables and chairs)'], leasing: [150, 'gross', 'Business'], mail: [300, 'gross', 'Accessory storage'],
  unit: [200, 'gross', 'Residential'], guest_room: [200, 'gross', 'Residential'], storage: [300, 'gross', 'Accessory storage'], mechanical: [300, 'gross', 'Mechanical equipment room'],
  electrical: [300, 'gross', 'Mechanical equipment room'], janitor: [300, 'gross', 'Accessory storage'], trash: [300, 'gross', 'Accessory storage'], locker: [50, 'gross', 'Locker rooms'],
  flex: [15, 'net', 'Assembly, unconcentrated (tables and chairs)'], other: [150, 'gross', 'Business'],
  corridor: [0, 'net', ''], restroom: [0, 'net', ''], stair: [0, 'net', ''], elevator: [0, 'net', ''], lobby: [0, 'net', ''], hall: [0, 'net', ''], entry: [0, 'net', ''], closet: [0, 'net', ''], porch: [0, 'net', '']
};
// a lobby or waiting room in an assembly building holds people (unconcentrated); elsewhere it's circulation counted with
// the business area round it
export const loadOf = (type, occ = 'B') => type === 'lobby' && /^A/.test(occ) ? [15, 'net', 'Assembly, unconcentrated (waiting)'] : LOAD[type] || LOAD.other;
// the occupants a building of a use is likely to hold before its rooms are drawn (for the sprinkler and exit triggers):
// a usual share of its floor area in the use that governs
const EST = { restaurant: a => a * 0.55 / 15 + a * 0.3 / 200, foodtrucks: a => a * 0.6 / 15, church: a => a * 0.55 / 7 + a * 0.15 / 20, amenity: a => a * 0.35 / 15 + a * 0.25 / 50 + a * 0.1 / 150 };
export const estOccupants = (use, gsf) => Math.ceil((EST[use] || (a => { const o = occupancyOf(use); return a / (/^M/.test(o) ? 60 : /^S/.test(o) ? 500 : /^R/.test(o) ? 200 : 150); }))(gsf));

// ---------- sprinklers (IBC 903.2) ----------
// -> { on, system: 'NFPA 13' | 'NFPA 13R' | 'NFPA 13D' | 'none', why, ref }
export function sprinklerFor(use, { gsf, floors, occupants, heightFt = 0 }) {
  const occ = occupancyOf(use), g = group(occ), n = occupants ?? estOccupants(use, gsf), f = v => Math.round(v).toLocaleString('en-US');
  if (IRC_USES.includes(use)) return use === 'townhomes'
    ? { on: false, system: 'none', why: 'IRC R313.1 calls for townhouse sprinklers (NFPA 13D or IRC P2904); many Texas cities amend it out — confirm with the jurisdiction', ref: 'IRC R313.1' }
    : { on: false, system: 'none', why: 'One- and two-family dwellings: IRC R313.2 sprinklers are commonly amended out in Texas; NFPA 13D optional', ref: 'IRC R313.2' };
  if (heightFt >= 55) return { on: true, system: 'NFPA 13', why: 'An occupied floor 55 ft or more above the lowest fire department access', ref: 'IBC 903.2.11.3' };
  if (g === 'R-1' || g === 'R-2') return floors <= 4 && heightFt <= 60
    ? { on: true, system: 'NFPA 13R', why: 'Every Group ' + g + ' building is sprinklered; NFPA 13R is allowed up to 4 stories and 60 ft', ref: 'IBC 903.2.8, 903.3.1.2' }
    : { on: true, system: 'NFPA 13', why: 'Every Group ' + g + ' building is sprinklered; over 4 stories or 60 ft needs NFPA 13', ref: 'IBC 903.2.8, 903.3.1.1' };
  const A = (lim, ol, ref) => gsf > lim || n >= ol || floors > 1 ? { on: true, system: 'NFPA 13', why: 'Group ' + g + ': ' + (gsf > lim ? 'fire area ' + f(gsf) + ' sf, over ' + f(lim) + ' sf' : n >= ol ? 'an occupant load of about ' + n + ', ' + ol + ' or more' : 'assembly space off the level of exit discharge'), ref }
    : { on: false, system: 'none', why: 'Group ' + g + ': fire area ' + f(gsf) + ' sf (limit ' + f(lim) + '), occupant load about ' + n + ' (limit ' + ol + '), on the level of exit discharge', ref };
  if (g === 'A-2') return A(5000, 100, 'IBC 903.2.1.2');
  if (g === 'A-1') return A(12000, 300, 'IBC 903.2.1.1');
  if (g === 'A-3' || g === 'A-4') return A(12000, 300, g === 'A-3' ? 'IBC 903.2.1.3' : 'IBC 903.2.1.4');
  if (g === 'M' || g === 'S-1' || g === 'F-1') { const ref = g === 'M' ? 'IBC 903.2.7' : g === 'S-1' ? 'IBC 903.2.9' : 'IBC 903.2.4';
    return gsf > 12000 ? { on: true, system: 'NFPA 13', why: 'Group ' + g + ' fire area ' + f(gsf) + ' sf, over 12,000 sf', ref } : floors > 3 ? { on: true, system: 'NFPA 13', why: 'Group ' + g + ' more than three stories', ref }
      : { on: false, system: 'none', why: 'Group ' + g + ' fire area ' + f(gsf) + ' sf, 12,000 sf or less, three stories or fewer (the combined ' + g + ' areas of the building also stay under 24,000 sf)', ref }; }
  if (g === 'E') return gsf > 12000 ? { on: true, system: 'NFPA 13', why: 'Group E fire area over 12,000 sf', ref: 'IBC 903.2.3' } : { on: false, system: 'none', why: 'Group E fire area 12,000 sf or less', ref: 'IBC 903.2.3' };
  return { on: false, system: 'none', why: 'Group ' + g + ': no area or occupant trigger in IBC 903.2 (ambulatory care excepted)', ref: 'IBC 903.2' };
}

// ---------- allowable height, stories and area (IBC 504.3, 504.4, 506.2) ----------
export const CONSTRUCTIONS = ['V-B', 'V-A', 'III-B', 'II-B', 'II-A'];
const CDESC = { 'V-B': 'combustible, unprotected: wood frame', 'V-A': 'combustible, 1-hour protected: wood frame', 'III-B': 'non-combustible exterior walls, combustible interior', 'II-B': 'non-combustible, unprotected: steel, masonry or tilt-up', 'II-A': 'non-combustible, 1-hour protected' };
export const constructionText = c => c + ' (' + (CDESC[c] || '') + ')';
// feet above grade plane: [non-sprinklered, sprinklered NFPA 13, NFPA 13R (Group R only)]
const HEIGHT = { 'V-B': [40, 60, 60], 'V-A': [50, 70, 60], 'III-B': [55, 75, 60], 'II-B': [55, 75, 60], 'II-A': [65, 85, 60] };
// stories above grade plane by occupancy group: [NS, S, S13R]
const STORIES = {
  'A-2': { 'V-B': [1, 2], 'V-A': [2, 3], 'III-B': [2, 3], 'II-B': [2, 3], 'II-A': [3, 4] }, 'A-3': { 'V-B': [1, 2], 'V-A': [2, 3], 'III-B': [2, 3], 'II-B': [2, 3], 'II-A': [3, 4] },
  B: { 'V-B': [2, 3], 'V-A': [3, 4], 'III-B': [3, 4], 'II-B': [3, 4], 'II-A': [5, 6] }, M: { 'V-B': [1, 2], 'V-A': [3, 4], 'III-B': [2, 3], 'II-B': [2, 3], 'II-A': [4, 5] },
  'S-1': { 'V-B': [1, 2], 'V-A': [3, 4], 'III-B': [2, 3], 'II-B': [2, 3], 'II-A': [4, 5] }, E: { 'V-B': [1, 2], 'V-A': [1, 2], 'III-B': [2, 3], 'II-B': [2, 3], 'II-A': [3, 4] },
  'R-1': { 'V-B': [2, 3, 3], 'V-A': [3, 4, 4], 'III-B': [4, 5, 4], 'II-B': [4, 5, 4], 'II-A': [4, 5, 4] }, 'R-2': { 'V-B': [2, 3, 3], 'V-A': [3, 4, 4], 'III-B': [4, 5, 4], 'II-B': [4, 5, 4], 'II-A': [4, 5, 4] }
};
// area per story, non-sprinklered (Table 506.2 "NS"); sprinklered NFPA 13 is 4x for one story (S1) and 3x a story for
// more (SM); NFPA 13R gets the NS value
const AREA = {
  'A-2': { 'V-B': 6000, 'V-A': 11500, 'III-B': 9500, 'II-B': 9500, 'II-A': 15500 }, 'A-3': { 'V-B': 6000, 'V-A': 11500, 'III-B': 9500, 'II-B': 9500, 'II-A': 15500 },
  B: { 'V-B': 9000, 'V-A': 18000, 'III-B': 19000, 'II-B': 23000, 'II-A': 37500 }, M: { 'V-B': 9000, 'V-A': 14000, 'III-B': 12500, 'II-B': 12500, 'II-A': 21500 },
  'S-1': { 'V-B': 9000, 'V-A': 14000, 'III-B': 17500, 'II-B': 17500, 'II-A': 26000 }, E: { 'V-B': 9500, 'V-A': 18500, 'III-B': 14500, 'II-B': 14500, 'II-A': 26500 },
  'R-1': { 'V-B': 7000, 'V-A': 12000, 'III-B': 16000, 'II-B': 16000, 'II-A': 24000 }, 'R-2': { 'V-B': 7000, 'V-A': 12000, 'III-B': 16000, 'II-B': 16000, 'II-A': 24000 }
};
// the frontage increase (IBC 506.3): If = (F/P - 0.25) W/30, W the open width (20 to 30 ft), at most 0.75
export const frontageIf = (openShare, widthFt = 30) => Math.max(0, Math.min(0.75, (openShare - 0.25) * Math.min(30, Math.max(0, widthFt)) / 30));
// what one construction type allows: { stories, heightFt, areaPerStory, totalArea }
export function allowed(occ, cons, system, floors, If = 0) {
  const g = group(occ), k = system === 'NFPA 13R' ? 2 : system === 'NFPA 13' ? 1 : 0, ns = AREA[g]?.[cons], st = STORIES[g]?.[cons];
  if (!ns || !st) return null;
  const At = k === 1 ? ns * (floors > 1 ? 3 : 4) : ns, per = At + ns * If, sa = Math.min(Math.max(1, floors), k === 1 ? 3 : 2);
  return { stories: st[Math.min(k, st.length - 1)], heightFt: HEIGHT[cons][k], areaPerStory: Math.round(per), totalArea: Math.round(per * (floors > 1 ? sa : 1)) };
}
// the construction type and sprinkler system that make a building legal, the cheaper ways first: the code's own system
// on the use's usual construction, then sprinklers added (NFPA 13; for an R building that outgrows 13R, NFPA 13), then
// heavier construction. -> { construction, sprinkler (as sprinklerFor, maybe raised), allow, ok, changed
// (a plain sentence when the area or height made the choice), fireWalls (areas a fire wall would have to make when
// nothing fits) }
const PREFER = { industrial: ['II-B', 'III-B', 'II-A'], storage: ['II-B', 'V-B', 'II-A'], multifamily: ['V-A', 'V-B', 'III-B', 'II-A'], hotel: ['V-A', 'V-B', 'III-B', 'II-A'] }; // (apartments: V-A with NFPA 13R, the usual Texas garden building)
export function codeBasis(use, { gsf, storyArea, floors, heightFt, If = 0, sprinkler }) {
  const occ = occupancyOf(use);
  if (IRC_USES.includes(use)) return { construction: 'V-B (wood frame, IRC)', sprinkler, allow: null, ok: true, changed: '', fireWalls: 0, If };
  const sys0 = sprinkler, tries = [], order = PREFER[use] || (gsf > 25000 ? ['V-B', 'II-B', 'V-A', 'III-B', 'II-A'] : ['V-B', 'V-A', 'II-B', 'III-B', 'II-A']);
  const systems = sys0.on ? (sys0.system === 'NFPA 13R' ? ['NFPA 13R', 'NFPA 13'] : ['NFPA 13']) : ['none', 'NFPA 13'];
  const pairs = order.flatMap(c => systems.map(sys => [c, sys])); // (each construction type with the code's system, then sprinklered, before the next type)
  for (const [c, sys] of pairs) { const a = allowed(occ, c, sys, floors, If); if (!a) continue; tries.push({ c, sys, a });
    if (storyArea <= a.areaPerStory && gsf <= a.totalArea && floors <= a.stories && heightFt <= a.heightFt) {
      const raised = sys !== sys0.system && sys !== 'none', f = v => Math.round(v).toLocaleString('en-US');
      const sprinkler = raised ? { on: true, system: sys, why: (sys0.on ? sys0.why + '; ' : '') + 'NFPA 13 throughout so the ' + f(storyArea) + ' sf a story is within the allowable area for ' + c + ' (IBC 506.2)', ref: (sys0.on ? sys0.ref + ', ' : '') + 'IBC 506.2' } : sys0;
      return { construction: constructionText(c), cons: c, sprinkler, allow: a, ok: true, changed: raised ? 'Sprinklered (NFPA 13) to meet the allowable area' : '', fireWalls: 0, If };
    } }
  // nothing fits as one building: the largest allowance, divided by fire walls
  const best = tries.sort((x, y) => y.a.areaPerStory - x.a.areaPerStory)[0];
  return { construction: constructionText(best?.c || 'II-B'), cons: best?.c || 'II-B', sprinkler: best && best.sys !== 'none' ? { on: true, system: best.sys, why: 'Needed with fire walls for the allowable area', ref: 'IBC 506.2, 706' } : sys0, allow: best?.a || null, ok: false,
    changed: 'Over the allowable area for every construction type: fire walls needed (IBC 706)', fireWalls: best ? Math.ceil(storyArea / best.a.areaPerStory) : 2, If };
}
