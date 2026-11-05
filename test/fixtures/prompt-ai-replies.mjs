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
  // two uses placed with no zones (as gpt-6-luna answered in the live eval, Nov 5): the zones are made from the placements
  S16: { ...base, use: 'office', truck: true, placements: [pl('office', 'along', 'front'), pl('industrial', 'back')] },
  V19: { ...base, use: 'retail', compare: true, placements: [pl('retail', 'front'), pl('multifamily', 'back')], assumptions: ['Shops on the road, apartments behind.'] },
  M04: { ...base, use: 'multifamily', units: 200, perUnit: 1.5 },
  // the model's junk is dropped, its good entries kept
  JUNK: { ...base, use: 'multifamily', units: 150, placements: [pl('spaceship', 'middle'), pl('pool', 'sideways'), pl('pool', 'corner', 'up'), pl('dog park', 'corner', 'northeast')] }
};
// building types named by the model (buildingType; a mix's zones[].preset), many in words the words path doesn't know,
// with the model's own numbers where they differ from the preset's: [request, reply]
const bt = (preset, o = {}) => ({ buildingType: { preset, count: null, bedsPerUnit: null, mezzanine: null, variant: null, ...o } });
const recipe = (name, pattern, buildings, parking) => ({ name, pattern, buildings, outdoor: [], sites: { label: null, w: null, d: null, count: null }, parking: { per: '1000sf', rate: 3, basis: null, label: null, plus1k: null, ...parking }, figures: [] });
export const TYPE_REPLIES = {
  inn: ['an inn with 80 rooms', { ...base, ...bt('hotel-limited', { count: 80 }), use: 'hotel', gfa: 40000, floors: 3 }],
  toddlers: ['a place for 90 toddlers to learn and play', { ...base, ...bt('daycare', { count: 90 }), use: 'other', gfa: 7650, custom: recipe('Learning center', 'commons', [{ label: 'Learning center', type: null, w: 90, d: 85, floors: 1, count: 1 }], { per: 'child', rate: 0.25, basis: 90, label: 'children' }) }],
  k8: ['a K-8 charter school for 650 students', { ...base, ...bt('school', { count: 650, variant: 'middle' }), use: 'other', gfa: 80000 }],
  cold: ['refrigerated distribution, 150k sf', { ...base, ...bt('cold-storage'), use: 'industrial', gfa: 150000, ratio: 0.6, truck: true }],
  colo: ['a 120,000 sf colo building', { ...base, ...bt('data-center'), use: 'industrial', gfa: 120000, ratio: 0.5, truck: true }],
  dorm: ['dorms for 480 beds, 4-bedroom suites', { ...base, ...bt('student', { count: 480, bedsPerUnit: 4 }), use: 'multifamily', units: 480, floors: 3 }],
  quads: ['a quadplex community, 48 homes', { ...base, ...bt('plex', { count: 48, variant: 'fourplex' }), use: 'duplex', units: 48 }],
  slim: ['a slim 18-story residential tower, 240 units', { ...base, ...bt('point-tower', { count: 240 }), use: 'multifamily', units: 240, floors: 18, form: 'tower' }],
  ell: ['apartments in an L, 140 units', { ...base, ...bt('mf-l'), use: 'multifamily', units: 140 }],
  hotelMix: ['a 150-key hotel with 25,000 sf of retail in front', { ...base, use: 'retail', zones: [zone('retail', { preset: null, count: null, gfa: 25000, placement: { where: 'front', road: null, next: [], side: null } }), zone('hotel', { preset: 'hotel-limited', count: 150, gfa: 80000, floors: 5 })], placements: [pl('retail', 'front')] }],
  kart: ['an indoor go-kart track, 40,000 sf', { ...base, ...bt(null), use: 'other', gfa: 40000, custom: recipe('Indoor go-kart track', 'row', [{ label: 'Go-kart track', type: null, w: 250, d: 160, floors: 1, count: 1 }], { rate: 4 }) }]
};
