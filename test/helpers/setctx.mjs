// Realistic plan set contexts for the sheet tests (lib/planset.mjs setContext): real layouts from the planner on the
// 7.7 acre FM 362 lot (920 x 378 ft, a notch out of the east end, frontage on the west) and a 27 acre tract, every
// building type designed by the rule-based designer (lib/plandesign.mjs fallbackDesign), so a test sees what a set made
// without Claude would draw. ctxFor(name): 'retail', 'restaurant', 'townhomes', 'sfr', 'industrial', 'office3', 'medical', 'fuel', 'duplex', 'church'.
import * as S from '../../lib/siteplan.mjs';
import * as L from '../../lib/sitelayout.mjs';
import * as PD from '../../lib/plandesign.mjs';
import * as P from '../../lib/planset.mjs';

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const siteOf = (g, west) => { const b = S.unionParcels([g]); return { ...b, front: west ? b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9) : null, setbacks: { ...S.SETBACKS } }; };
export const fm362 = siteOf(mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]]), true);
export const tract = siteOf(mk([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]]));
export const CASES = { retail: [fm362, { use: 'retail', gfa: 40000 }], restaurant: [fm362, { use: 'restaurant' }], townhomes: [fm362, { use: 'townhomes' }], sfr: [tract, { use: 'sfr' }], industrial: [fm362, { use: 'industrial' }],
  office3: [fm362, { use: 'office', gfa: 60000, floors: 3 }], medical: [fm362, { use: 'medical', gfa: 20000 }], fuel: [fm362, { use: 'fuel' }], duplex: [fm362, { use: 'duplex' }], church: [fm362, { use: 'church' }] };
const cache = new Map();
export function planFor(name) {
  if (!cache.has(name)) { const [site, prog] = CASES[name], o = L.layoutOptions(site, prog)[0]; if (!o) throw new Error('no layout for ' + name); cache.set(name, { ...site, name: 'Option A', elements: o.elements, zones: o.zones, program: o.program }); }
  return cache.get(name);
}
export function ctxFor(name, extra = {}) {
  const plan = planFor(name), types = PD.buildingTypes(plan), designs = {};
  for (const t of types.filter(t => t.supported)) designs[t.id] = PD.placeDesign(PD.fallbackDesign(t), t).design;
  return P.setContext({ plan, project: { name: 'Test project — ' + name }, client: 'FM 362 Development LLC', address: '0 FM 362 Rd, Waller, TX 77484', county: 'Waller County, Texas', parcels: [{ label: '0 FM 362 Rd', owner: 'FM 362 Development LLC', acres: 7.72 }],
    facts: ['FEMA flood zone X — outside the 100-year floodplain.', 'No water or utility district (MUD) found here: water and sewer service needs to be confirmed.'], notes: [], types, designs, date: 'October 19, 2026', drawnBy: 'MS',
    revisions: [{ no: '0', date: '10/19/26', desc: 'Schematic design set' }], boundarySource: 'the county appraisal district parcel outline', ...extra }, P.sheetList(plan, { types, sections: P.SECTIONS.map(s => s.id), renders: 0 }));
}
