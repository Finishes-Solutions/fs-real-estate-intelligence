// Model replies to the site plan program step (api/siteplan.js SCHEMA), written as the model answers, for corpus
// requests (test/fixtures/prompt-corpus.mjs): fed through the app's own mapping in test/prompts.mjs, no network.
const base = { gfa: null, atLeast: null, form: null, floors: null, units: null, buildings: null, ratio: null, perUnit: null, depth: null, detentionPct: null, storm: null, truck: null, through: null, compare: null, trash: null, entrances: null, product: null, extras: [], storage: { climateSf: null, driveSf: null, rv: null }, foodtrucks: { trucks: null, pavilionSf: null, bar: null, barSf: null, playground: null, perTruck: null }, fuel: { pumps: null, storeSf: null, wash: null, vac: null, canopy: null, islands: null, truckStop: null }, custom: { name: null, pattern: null, buildings: [], outdoor: [], sites: { label: null, w: null, d: null, count: null }, parking: { per: null, rate: null, basis: null, label: null, plus1k: null }, figures: [] }, parcels: [], questions: [], setbacks: { front: null, side: null, rear: null, paving: null }, homeSfMin: null, homeSfMax: null, floorPlans: null, minLotSf: null, lotW: null, lotD: null, homeKind: null, homeW: null, homeD: null, buffer: null, zones: [], placements: [], summary: '', assumptions: [] };
const pl = (subject, rel, edge = null, target = null, ft = null) => ({ subject, rel, edge, target, ft });
const zone = (use, o = {}) => ({ use, gfa: null, units: null, floors: null, buildings: null, pads: null, items: [], name: null, placement: { where: null, road: null, next: [], side: null }, homeSfMin: null, homeSfMax: null, floorPlans: null, minLotSf: null, lotW: null, lotD: null, homeKind: null, homeW: null, homeD: null, buffer: null, ...o });
export const REPLIES = {
  S02: { ...base, use: 'multifamily', units: 200, floors: 3, perUnit: 1.6, placements: [pl('pool', 'middle')], summary: '200 garden apartments round a central pool.' },
  S04: { ...base, use: 'multifamily', units: 180, floors: 3, placements: [pl('open space', 'keep', 'north')], assumptions: ['The tree strip is about 60 ft deep.'] },
  S09: { ...base, use: 'townhomes', units: 120, placements: [pl('buildings', 'away', 'west', null, 50)] },
  S01: { ...base, use: 'retail', zones: [zone('retail', { gfa: 30000, placement: { where: 'along', road: 'the main road', next: [], side: null } }), zone('multifamily', { units: 200, placement: { where: 'back', road: null, next: [], side: null } })], placements: [pl('retail', 'front'), pl('multifamily', 'behind', null, 'retail')] },
  S06: { ...base, use: 'industrial', gfa: 300000, truck: true, placements: [pl('industrial', 'back'), pl('truck court', 'facing', 'east')] },
  S30: { ...base, use: 'multifamily', units: 200, entrances: 2, placements: [pl('entrance', 'edge', 'side')] },
  V01: { ...base, use: 'multifamily', compare: true, assumptions: ['Housing compared by value: nothing in the request names a use.'] },
  M04: { ...base, use: 'multifamily', units: 200, perUnit: 1.5 },
  // the model's junk is dropped, its good entries kept
  JUNK: { ...base, use: 'multifamily', units: 150, placements: [pl('spaceship', 'middle'), pl('pool', 'sideways'), pl('pool', 'corner', 'up'), pl('dog park', 'corner', 'northeast')] }
};
