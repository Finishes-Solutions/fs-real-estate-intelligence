// A corpus of site plan requests as people type them: vague, detailed, messy and spatial, across the uses the engine
// lays out. Each has its EXPECTED reading (want) and checks on the engine's best layout (out). Written by hand before the
// parser was tuned to it; scored by scripts/prompt-corpus.mjs (words path) and test/prompt-eval-live.mjs (the AI).
// The sites are synthetic (feet, x east, y north). Holdout projects (P18, P35, P36, E054) are not in it.
//
// want:  uses        the uses built (order free; amenity commons ignored)       usesAny: any of these lists
//        q           { use: 'fill' | ['exact', n] | ['min', n] | ['max', n] | ['range', a, b] }  (fill: as many as fit)
//        floors      { use: n }      perUnit / ratio: parking rule      parking: mode     angle: 60 | 45 | 'angled'
//        storm       onsite-pond | underground | offsite      setbacks { front, side, rear }   overlays ['senior']
//        form        { use: form id }   pondAc: acres of pond   assumed: true (what was assumed is said)
//        place       [[subject, rel, edge-or-target?]]  read into program.placements (or a zone's place for a use)
// out:   ['built'] · ['units', mode, n] · ['gfa', use, mode, n] · ['has', subject] · ['in', subject, region]
//        · ['nearer', a, b, edge] (a nearer that edge than b) · ['away', subject, edge, ft] · ['entrance', edge]
//        · ['facing', subject, edge] · ['near', a, b, ft]
// regions: front | back | middle | corner | <compass> | <compass> corner. edges: front | back | side | north | east ...
export const SITES = {
  R10: { ring: [[0, 0], [900, 0], [900, 500], [0, 500]], front: 0, label: '900 x 500 ft, 10.3 ac, street on the south' },
  R5: { ring: [[0, 0], [600, 0], [600, 400], [0, 400]], front: 0, label: '600 x 400 ft, 5.5 ac' },
  P1: { ring: [[0, 0], [210, 0], [210, 230], [0, 230]], front: 0, label: '210 x 230 ft, 1.1 ac' },
  D6: { ring: [[0, 0], [330, 0], [330, 800], [0, 800]], front: 0, label: '330 x 800 ft, 6 ac' },
  C8: { ring: [[0, 0], [750, 0], [750, 465], [0, 465]], front: 0, streets: [1], label: '750 x 465 ft, 8 ac, side street on the east' },
  E10: { ring: [[0, 0], [500, 0], [500, 900], [0, 900]], front: 1, label: '500 x 900 ft, 10.3 ac, street on the east' },
  W20: { ring: [[0, 0], [1000, 0], [1000, 870], [0, 870]], front: 0, label: '1000 x 870 ft, 20 ac' },
  B40: { ring: [[0, 0], [1500, 0], [1500, 1160], [0, 1160]], front: 0, label: '1500 x 1160 ft, 40 ac' },
  T2: { ring: [[0, 0], [330, 0], [330, 300], [0, 300]], front: 0, label: '330 x 300 ft, 2.3 ac' },
  T3: { ring: [[0, 0], [380, 0], [380, 340], [0, 340]], front: 0, streets: [1], label: '380 x 340 ft, 3 ac, side street on the east' }
};
const HOUSING = [['multifamily'], ['townhomes'], ['duplex'], ['sfr']];
export const CASES = [
  // ---------- vague ----------
  { id: 'V01', cat: 'vague', site: 'R10', ask: 'something that pencils on this lot', want: { usesAny: [...HOUSING, ['retail']], assumed: true }, out: [['built']] },
  { id: 'V02', cat: 'vague', site: 'R10', ask: 'max density', want: { usesAny: HOUSING, q: { '*': 'fill' }, assumed: true }, out: [['built'], ['units', 'min', 150]] },
  { id: 'V03', cat: 'vague', site: 'R10', ask: 'a nice apartment community', want: { uses: ['multifamily'], q: { multifamily: 'fill' }, assumed: true }, out: [['built'], ['has', 'pool'], ['has', 'clubhouse']] },
  { id: 'V04', cat: 'vague', site: 'R10', ask: 'whatever makes the most money here', want: { usesAny: [...HOUSING, ['retail']], assumed: true }, out: [['built']] },
  { id: 'V05', cat: 'vague', site: 'R5', ask: 'apartments', want: { uses: ['multifamily'], q: { multifamily: 'fill' }, assumed: true }, out: [['built'], ['units', 'min', 60]] },
  { id: 'V06', cat: 'vague', site: 'D6', ask: 'townhomes', want: { uses: ['townhomes'], q: { townhomes: 'fill' }, assumed: true }, out: [['built'], ['units', 'min', 30]] },
  { id: 'V07', cat: 'vague', site: 'B40', ask: 'a neighborhood of houses', want: { uses: ['sfr'], q: { sfr: 'fill' } }, out: [['built'], ['units', 'min', 100]] },
  { id: 'V08', cat: 'vague', site: 'B40', ask: 'warehouse', want: { uses: ['industrial'], q: { industrial: 'fill' }, assumed: true }, out: [['built'], ['has', 'truck court']] },
  { id: 'V09', cat: 'vague', site: 'R10', ask: 'some retail', want: { uses: ['retail'], q: { retail: 'fill' }, assumed: true }, out: [['built'], ['gfa', 'retail', 'min', 30000]] },
  { id: 'V10', cat: 'vague', site: 'P1', ask: 'something for this little corner lot', want: { usesAny: [['retail'], ['restaurant'], ['fuel'], ['office'], ['medical']], assumed: true }, out: [['built']] },
  { id: 'V11', cat: 'vague', site: 'R10', ask: 'best use', want: { usesAny: [...HOUSING, ['retail']], assumed: true }, out: [['built']] },
  { id: 'V12', cat: 'vague', site: 'R10', ask: 'fill it with apartments', want: { uses: ['multifamily'], q: { multifamily: 'fill' } }, out: [['built'], ['units', 'min', 150]] },
  { id: 'V13', cat: 'vague', site: 'R10', ask: 'as many townhomes as you can fit', want: { uses: ['townhomes'], q: { townhomes: 'fill' } }, out: [['built'], ['units', 'min', 50]] },
  { id: 'V14', cat: 'vague', site: 'R5', ask: 'office building', want: { uses: ['office'], q: { office: 'fill' }, assumed: true }, out: [['built']] },
  { id: 'V15', cat: 'vague', site: 'R10', ask: 'senior living', want: { uses: ['multifamily'], overlays: ['senior'], assumed: true }, out: [['built']] },
  { id: 'V16', cat: 'vague', site: 'R10', ask: 'a hotel', want: { uses: ['hotel'] }, out: [['built']] },
  { id: 'V17', cat: 'vague', site: 'R5', ask: 'medical office', want: { uses: ['medical'], assumed: true }, out: [['built']] },
  { id: 'V18', cat: 'vague', site: 'R10', ask: 'a church', want: { uses: ['church'] }, out: [['built']] },
  { id: 'V19', cat: 'vague', site: 'W20', ask: 'mixed use', want: { uses: ['retail', 'multifamily'], assumed: true }, out: [['built'], ['nearer', 'retail', 'multifamily', 'front']] },
  { id: 'V20', cat: 'vague', site: 'R10', ask: 'duplexes', want: { uses: ['duplex'], q: { duplex: 'fill' }, assumed: true }, out: [['built']] },
  { id: 'V21', cat: 'vague', site: 'R10', ask: 'cottage community', want: { usesAny: [['sfr'], ['duplex']], form: { '*': 'mf-cottage-btr' } }, out: [['built']] },
  { id: 'V22', cat: 'vague', site: 'R10', ask: 'build to rent', want: { usesAny: HOUSING }, out: [['built']] },
  { id: 'V23', cat: 'vague', site: 'B40', ask: 'industrial park', want: { uses: ['industrial'], q: { industrial: 'fill' } }, out: [['built']] },
  { id: 'V24', cat: 'vague', site: 'R10', ask: 'highest and best use, maximize units', want: { usesAny: HOUSING, q: { '*': 'fill' } }, out: [['built'], ['units', 'min', 150]] },
  { id: 'V25', cat: 'vague', site: 'R10', ask: 'the usual garden-style deal, nothing fancy', want: { uses: ['multifamily'], form: { multifamily: 'mf-garden' }, q: { multifamily: 'fill' } }, out: [['built']] },
  // ---------- detailed ----------
  { id: 'D01', cat: 'detailed', site: 'R10', ask: 'exactly 180 garden apartments, 3 stories, 1.6 spaces per unit, clubhouse and pool', want: { uses: ['multifamily'], q: { multifamily: ['exact', 180] }, floors: { multifamily: 3 }, perUnit: 1.6 }, out: [['units', 'exact', 180], ['has', 'pool'], ['has', 'clubhouse']] },
  { id: 'D02', cat: 'detailed', site: 'R10', ask: '240 units in 4-story mid-rise buildings with 1.5 spaces per unit', want: { uses: ['multifamily'], q: { multifamily: ['exact', 240] }, floors: { multifamily: 4 }, form: { multifamily: 'mf-midrise' }, perUnit: 1.5 }, out: [['units', 'exact', 240]] },
  { id: 'D03', cat: 'detailed', site: 'R10', ask: 'senior apartments, 150 units, 4 stories, 1 space per unit', want: { uses: ['multifamily'], overlays: ['senior'], q: { multifamily: ['exact', 150] }, floors: { multifamily: 4 }, perUnit: 1 }, out: [['units', 'exact', 150]] },
  { id: 'D04', cat: 'detailed', site: 'D6', ask: '60 townhomes with 2-car garages', want: { uses: ['townhomes'], q: { townhomes: ['exact', 60] } }, out: [['units', 'exact', 60]] },
  { id: 'D05', cat: 'detailed', site: 'R10', ask: '96 duplex units on a private street', want: { uses: ['duplex'], q: { duplex: ['exact', 96] } }, out: [['units', 'exact', 96]] },
  { id: 'D06', cat: 'detailed', site: 'R10', ask: 'build-to-rent cottages, 70 homes', want: { usesAny: [['sfr'], ['duplex']], q: { '*': ['exact', 70] }, form: { '*': 'mf-cottage-btr' } }, out: [['units', 'exact', 70]] },
  { id: 'D07', cat: 'detailed', site: 'R10', ask: '30,000 sf retail strip, 4 per 1,000 parking, two pad sites', want: { uses: ['retail'], q: { retail: ['exact', 30000] }, ratio: 4 }, out: [['gfa', 'retail', 'exact', 30000]] },
  { id: 'D08', cat: 'detailed', site: 'B40', ask: 'grocery-anchored center: 50,000 sf grocery and 30,000 sf of shops', want: { uses: ['retail'], q: { retail: ['exact', 80000] }, anchor: 50000 }, out: [['gfa', 'retail', 'exact', 80000]] },
  { id: 'D09', cat: 'detailed', site: 'P1', ask: '2,800 sf coffee shop with a drive-thru', want: { uses: ['restaurant'], q: { restaurant: ['exact', 2800] } }, out: [['gfa', 'restaurant', 'exact', 2800]] },
  { id: 'D10', cat: 'detailed', site: 'B40', ask: '300,000 sf distribution warehouse, 36 ft clear, truck court with trailer parking', want: { uses: ['industrial'], q: { industrial: ['exact', 300000] } }, out: [['gfa', 'industrial', 'exact', 300000], ['has', 'truck court']] },
  { id: 'D11', cat: 'detailed', site: 'B40', ask: 'cross-dock warehouse, 400,000 sf, 0.5 spaces per 1,000', want: { uses: ['industrial'], q: { industrial: ['exact', 400000] }, form: { industrial: 'ind-cross-dock' }, ratio: 0.5 }, out: [['gfa', 'industrial', 'exact', 400000]] },
  { id: 'D12', cat: 'detailed', site: 'R10', ask: '60,000 sf flex industrial in 3 buildings', want: { uses: ['industrial'], q: { industrial: ['exact', 60000] }, form: { industrial: 'flex-multi-tenant' } }, out: [['gfa', 'industrial', 'exact', 60000]] },
  { id: 'D13', cat: 'detailed', site: 'R10', ask: '80,000 sf office, 3 stories, 4 per 1,000 parking', want: { uses: ['office'], q: { office: ['exact', 80000] }, floors: { office: 3 }, ratio: 4 }, out: [['gfa', 'office', 'exact', 80000]] },
  { id: 'D14', cat: 'detailed', site: 'R5', ask: '20,000 sf medical office building, 2 stories, 5/1000', want: { uses: ['medical'], q: { medical: ['exact', 20000] }, floors: { medical: 2 }, ratio: 5 }, out: [['gfa', 'medical', 'exact', 20000]] },
  { id: 'D15', cat: 'detailed', site: 'R10', ask: '4-story hotel with 120 rooms and a pool', want: { uses: ['hotel'], q: { hotel: ['exact', 66000] }, floors: { hotel: 4 } }, out: [['gfa', 'hotel', 'exact', 66000]] },
  { id: 'D16', cat: 'detailed', site: 'R10', ask: 'church with a 600-seat sanctuary', want: { uses: ['church'], q: { church: ['exact', 20000] } }, out: [['built']] },
  { id: 'D17', cat: 'detailed', site: 'R10', ask: '200 apartments, 3 stories, surface parking, underground detention', want: { uses: ['multifamily'], q: { multifamily: ['exact', 200] }, storm: 'underground', parking: 'surface' }, out: [['units', 'exact', 200]] },
  { id: 'D18', cat: 'detailed', site: 'R10', ask: '200 apartments with a wet pond', want: { uses: ['multifamily'], q: { multifamily: ['exact', 200] }, storm: 'onsite-pond' }, out: [['has', 'pond']] },
  { id: 'D19', cat: 'detailed', site: 'R10', ask: '180 apartments, regional detention so no pond on site', want: { uses: ['multifamily'], q: { multifamily: ['exact', 180] }, storm: 'offsite' }, out: [['units', 'exact', 180]] },
  { id: 'D20', cat: 'detailed', site: 'R10', ask: 'at least 150 garden apartments', want: { uses: ['multifamily'], q: { multifamily: ['min', 150] } }, out: [['units', 'min', 150]] },
  { id: 'D21', cat: 'detailed', site: 'R10', ask: 'between 200 and 240 apartments', want: { uses: ['multifamily'], q: { multifamily: ['range', 200, 240] } }, out: [['units', 'range', 200, 240]] },
  { id: 'D22', cat: 'detailed', site: 'R10', ask: 'no more than 160 units', want: { uses: ['multifamily'], q: { multifamily: ['max', 160] } }, out: [['units', 'max', 160]] },
  { id: 'D23', cat: 'detailed', site: 'R10', ask: '180 apartments with 50 ft setbacks on all sides', want: { uses: ['multifamily'], q: { multifamily: ['exact', 180] }, setbacks: { front: 50, side: 50, rear: 50 } }, out: [['away', 'buildings', 'north', 49], ['away', 'buildings', 'east', 49]] },
  { id: 'D24', cat: 'detailed', site: 'R10', ask: '150 garden apartments, front setback 40 ft, side 15 ft, rear 30 ft', want: { uses: ['multifamily'], q: { multifamily: ['exact', 150] }, setbacks: { front: 40, side: 15, rear: 30 } }, out: [['away', 'buildings', 'south', 39], ['away', 'buildings', 'north', 29]] },
  { id: 'D25', cat: 'detailed', site: 'R10', ask: '40,000 sf retail with 60 degree angled parking', want: { uses: ['retail'], q: { retail: ['exact', 40000] }, angle: 60 }, out: [['gfa', 'retail', 'exact', 40000]] },
  { id: 'D26', cat: 'detailed', site: 'R10', ask: 'tuck-under apartments, 120 units, 2 stories', want: { uses: ['multifamily'], q: { multifamily: ['exact', 120] }, form: { multifamily: 'mf-tuck-under' }, floors: { multifamily: 2 } }, out: [['built']] },
  { id: 'D27', cat: 'detailed', site: 'R10', ask: 'a 5-story wrap with 300 units', want: { uses: ['multifamily'], q: { multifamily: ['exact', 300] }, form: { multifamily: 'mf-wrap' } }, out: [['built']] },
  { id: 'D28', cat: 'detailed', site: 'R10', ask: 'courtyard building, 4 stories, 160 units', want: { uses: ['multifamily'], q: { multifamily: ['exact', 160] }, form: { multifamily: 'mf-courtyard' }, floors: { multifamily: 4 } }, out: [['built']] },
  { id: 'D29', cat: 'detailed', site: 'R10', ask: '8-story tower on a podium, 300 apartments', want: { uses: ['multifamily'], q: { multifamily: ['exact', 300] }, form: { multifamily: 'mf-tower-podium' }, floors: { multifamily: 8 } }, out: [['built']] },
  { id: 'D30', cat: 'detailed', site: 'R10', ask: 'a 5-story mixed-use building with 15,000 sf of ground floor retail and 180 apartments above', want: { uses: ['retail', 'multifamily'], form: { multifamily: 'mx-vertical' } }, out: [['built']] },
  { id: 'D31', cat: 'detailed', site: 'W20', ask: '20,000 sf retail, 200 apartments and 60 townhomes', want: { uses: ['retail', 'multifamily', 'townhomes'], q: { retail: ['exact', 20000], multifamily: ['exact', 200], townhomes: ['exact', 60] } }, out: [['built'], ['nearer', 'retail', 'townhomes', 'front']] },
  { id: 'D32', cat: 'detailed', site: 'R10', ask: 'self storage, 3-story 90,000 sf climate controlled plus drive-up', want: { uses: ['storage'] }, out: [['built']] },
  { id: 'D33', cat: 'detailed', site: 'R10', ask: '100 apartments and 12,000 sf of retail', want: { uses: ['multifamily', 'retail'], q: { multifamily: ['exact', 100], retail: ['exact', 12000] } }, out: [['built'], ['nearer', 'retail', 'multifamily', 'front']] },
  { id: 'D34', cat: 'detailed', site: 'R10', ask: 'garden apartments, 3 stories, as many as fit, 1.75 spaces per unit, with a dog park and playground', want: { uses: ['multifamily'], q: { multifamily: 'fill' }, perUnit: 1.75, floors: { multifamily: 3 } }, out: [['has', 'dog park'], ['has', 'playground']] },
  { id: 'D35', cat: 'detailed', site: 'B40', ask: 'single family subdivision, 60 ft lots, 120 homes', want: { uses: ['sfr'], q: { sfr: ['exact', 120] } }, out: [['units', 'exact', 120]] },
  // ---------- messy ----------
  { id: 'M01', cat: 'messy', site: 'R10', ask: 'appartments 120 untis', want: { uses: ['multifamily'], q: { multifamily: ['exact', 120] } }, out: [['units', 'exact', 120]] },
  { id: 'M02', cat: 'messy', site: 'B40', ask: '250k sf warehouse', want: { uses: ['industrial'], q: { industrial: ['exact', 250000] } }, out: [['gfa', 'industrial', 'exact', 250000]] },
  { id: 'M03', cat: 'messy', site: 'B40', ask: '250K SF distribution center w/ 3 acre pond', want: { uses: ['industrial'], q: { industrial: ['exact', 250000] }, pondAc: 3 }, out: [['gfa', 'industrial', 'exact', 250000], ['has', 'pond']] },
  { id: 'M04', cat: 'messy', site: 'R10', ask: '200 units, 1.5 spaces/unit', want: { uses: ['multifamily'], q: { multifamily: ['exact', 200] }, perUnit: 1.5 }, out: [['units', 'exact', 200]] },
  { id: 'M05', cat: 'messy', site: 'R10', ask: '4-story apts, 180 du', want: { uses: ['multifamily'], q: { multifamily: ['exact', 180] }, floors: { multifamily: 4 } }, out: [['units', 'exact', 180]] },
  { id: 'M06', cat: 'messy', site: 'R10', ask: 'retial strip 20,000sqft', want: { uses: ['retail'], q: { retail: ['exact', 20000] } }, out: [['gfa', 'retail', 'exact', 20000]] },
  { id: 'M07', cat: 'messy', site: 'R10', ask: '15k sf retail + 2 pads', want: { uses: ['retail'], q: { retail: ['exact', 15000] } }, out: [['built']] },
  { id: 'M08', cat: 'messy', site: 'R10', ask: '80 twnhomes', want: { uses: ['townhomes'], q: { townhomes: ['exact', 80] } }, out: [['units', 'exact', 80]] },
  { id: 'M09', cat: 'messy', site: 'R10', ask: '150 apts @ 1.25/unit parking', want: { uses: ['multifamily'], q: { multifamily: ['exact', 150] }, perUnit: 1.25 }, out: [['units', 'exact', 150]] },
  { id: 'M10', cat: 'messy', site: 'R10', ask: 'office 60ksf 3 flrs 4/1000', want: { uses: ['office'], q: { office: ['exact', 60000] }, floors: { office: 3 }, ratio: 4 }, out: [['gfa', 'office', 'exact', 60000]] },
  { id: 'M11', cat: 'messy', site: 'R10', ask: '3 stry walkups, 96 units', want: { uses: ['multifamily'], q: { multifamily: ['exact', 96] }, floors: { multifamily: 3 } }, out: [['units', 'exact', 96]] },
  { id: 'M12', cat: 'messy', site: 'R10', ask: 'garden apts - max units - 1.6 pkg ratio', want: { uses: ['multifamily'], q: { multifamily: 'fill' }, perUnit: 1.6 }, out: [['units', 'min', 150]] },
  { id: 'M13', cat: 'messy', site: 'B40', ask: 'whse 400,000 s.f. cross dock', want: { uses: ['industrial'], q: { industrial: ['exact', 400000] }, form: { industrial: 'ind-cross-dock' } }, out: [['gfa', 'industrial', 'exact', 400000]] },
  { id: 'M14', cat: 'messy', site: 'R10', ask: 'two hundred apartments, three stories', want: { uses: ['multifamily'], q: { multifamily: ['exact', 200] }, floors: { multifamily: 3 } }, out: [['units', 'exact', 200]] },
  { id: 'M15', cat: 'messy', site: 'R10', ask: 'approx 180 units +/-', want: { uses: ['multifamily'], q: { multifamily: ['exact', 180] } }, out: [['units', 'exact', 180]] },
  { id: 'M16', cat: 'messy', site: 'R10', ask: '180-200 units garden style', want: { uses: ['multifamily'], q: { multifamily: ['range', 180, 200] } }, out: [['units', 'range', 180, 200]] },
  { id: 'M17', cat: 'messy', site: 'R10', ask: '200+ units', want: { uses: ['multifamily'], q: { multifamily: ['min', 200] } }, out: [['units', 'min', 200]] },
  { id: 'M18', cat: 'messy', site: 'R5', ask: 'medical ofc bldg 18k sf 1 story', want: { uses: ['medical'], q: { medical: ['exact', 18000] }, floors: { medical: 1 } }, out: [['gfa', 'medical', 'exact', 18000]] },
  { id: 'M19', cat: 'messy', site: 'R10', ask: 'hotel 110 keys 4 stories', want: { uses: ['hotel'], q: { hotel: ['exact', 60500] }, floors: { hotel: 4 } }, out: [['built']] },
  { id: 'M20', cat: 'messy', site: 'R10', ask: 'townhouses (for sale) ~60, 2 car garage', want: { uses: ['townhomes'], q: { townhomes: ['exact', 60] } }, out: [['units', 'exact', 60]] },
  { id: 'M21', cat: 'messy', site: 'R10', ask: '30k retail', want: { uses: ['retail'], q: { retail: ['exact', 30000] } }, out: [['gfa', 'retail', 'exact', 30000]] },
  { id: 'M22', cat: 'messy', site: 'B40', ask: '2 acre detention pond, 200k sq. ft. warehouse', want: { uses: ['industrial'], q: { industrial: ['exact', 200000] }, pondAc: 2 }, out: [['gfa', 'industrial', 'exact', 200000], ['has', 'pond']] },
  { id: 'M23', cat: 'messy', site: 'R10', ask: 'apartments, 25 du/ac', want: { uses: ['multifamily'], q: { multifamily: ['exact', 258] } }, out: [['built']] },
  { id: 'M24', cat: 'messy', site: 'R10', ask: '3-4 story apartments, max density', want: { uses: ['multifamily'], q: { multifamily: 'fill' } }, out: [['units', 'min', 150]] },
  { id: 'M25', cat: 'messy', site: 'R10', ask: 'senoir apartmnets 4 storys 140 units', want: { uses: ['multifamily'], overlays: ['senior'], q: { multifamily: ['exact', 140] }, floors: { multifamily: 4 } }, out: [['units', 'exact', 140]] },
  // ---------- spatial ----------
  { id: 'S01', cat: 'spatial', site: 'W20', ask: 'retail along the main road with apartments behind', want: { uses: ['retail', 'multifamily'], place: [['retail', 'front'], ['multifamily', 'behind', 'retail']] }, out: [['nearer', 'retail', 'multifamily', 'front']] },
  { id: 'S02', cat: 'spatial', site: 'R10', ask: '200 garden apartments with the pool in the center', want: { uses: ['multifamily'], q: { multifamily: ['exact', 200] }, place: [['pool', 'middle']] }, out: [['in', 'pool', 'middle']] },
  { id: 'S03', cat: 'spatial', site: 'W20', ask: '150 apartments and 40 townhomes, townhomes at the back next to the neighbors', want: { uses: ['multifamily', 'townhomes'], place: [['townhomes', 'back']] }, out: [['nearer', 'multifamily', 'townhomes', 'front']] },
  { id: 'S04', cat: 'spatial', site: 'R10', ask: '180 apartments, keep the trees on the north side', want: { uses: ['multifamily'], q: { multifamily: ['exact', 180] }, place: [['open space', 'keep', 'north']] }, out: [['away', 'buildings', 'north', 40]] },
  { id: 'S05', cat: 'spatial', site: 'C8', ask: '30,000 sf retail with the entrance off the side street', want: { uses: ['retail'], place: [['entrance', 'edge', 'side']] }, out: [['entrance', 'side']] },
  { id: 'S06', cat: 'spatial', site: 'B40', ask: '300,000 sf warehouse at the rear with the truck court facing east', want: { uses: ['industrial'], place: [['industrial', 'back'], ['truck court', 'facing', 'east']] }, out: [['in', 'industrial', 'back'], ['facing', 'truck court', 'east']] },
  { id: 'S07', cat: 'spatial', site: 'R10', ask: '200 apartments with the clubhouse at the entry', want: { uses: ['multifamily'], place: [['clubhouse', 'near', 'entrance']] }, out: [['near', 'clubhouse', 'entrance', 150]] },
  { id: 'S08', cat: 'spatial', site: 'R10', ask: '160 apartments, dog park in the corner', want: { uses: ['multifamily'], q: { multifamily: ['exact', 160] }, place: [['dog park', 'corner']] }, out: [['has', 'dog park'], ['in', 'dog park', 'corner']] },
  { id: 'S09', cat: 'spatial', site: 'E10', ask: '120 townhomes, buffer the single-family homes to the west', want: { uses: ['townhomes'], q: { townhomes: ['exact', 120] }, place: [['buildings', 'away', 'west']] }, out: [['away', 'buildings', 'west', 40]] },
  { id: 'S10', cat: 'spatial', site: 'R10', ask: '200 apartments with the parking hidden behind the buildings', want: { uses: ['multifamily'], place: [['parking', 'behind', 'buildings']] }, out: [['nearer', 'buildings', 'parking', 'front']] },
  { id: 'S11', cat: 'spatial', site: 'W20', ask: 'retail at the corner, apartments in the middle, townhomes at the back', want: { uses: ['retail', 'multifamily', 'townhomes'], place: [['retail', 'corner'], ['multifamily', 'middle'], ['townhomes', 'back']] }, out: [['nearer', 'retail', 'townhomes', 'front'], ['nearer', 'multifamily', 'townhomes', 'front']] },
  { id: 'S12', cat: 'spatial', site: 'R10', ask: '160 apartments with the detention pond at the back', want: { uses: ['multifamily'], place: [['pond', 'back']] }, out: [['in', 'pond', 'back']] },
  { id: 'S13', cat: 'spatial', site: 'R10', ask: '180 apartments, pond in the front as an amenity', want: { uses: ['multifamily'], place: [['pond', 'front']] }, out: [['in', 'pond', 'front']] },
  { id: 'S14', cat: 'spatial', site: 'R10', ask: '200 apartments, playground near the clubhouse', want: { uses: ['multifamily'], place: [['playground', 'near', 'clubhouse']] }, out: [['has', 'playground'], ['near', 'playground', 'clubhouse', 150]] },
  { id: 'S15', cat: 'spatial', site: 'W20', ask: 'townhomes in front, apartments behind them', want: { uses: ['townhomes', 'multifamily'], place: [['townhomes', 'front'], ['multifamily', 'behind', 'townhomes']] }, out: [['nearer', 'townhomes', 'multifamily', 'front']] },
  { id: 'S16', cat: 'spatial', site: 'B40', ask: 'office along the highway with the warehouse behind', want: { uses: ['office', 'industrial'], place: [['office', 'front'], ['industrial', 'behind', 'office']] }, out: [['nearer', 'office', 'industrial', 'front']] },
  { id: 'S17', cat: 'spatial', site: 'R10', ask: '180 apartments, keep 100 ft of open space along the east line', want: { uses: ['multifamily'], q: { multifamily: ['exact', 180] }, place: [['open space', 'keep', 'east']] }, out: [['away', 'buildings', 'east', 99]] },
  { id: 'S18', cat: 'spatial', site: 'R10', ask: '150 apartments, no buildings within 75 feet of the west property line', want: { uses: ['multifamily'], place: [['buildings', 'away', 'west']] }, out: [['away', 'buildings', 'west', 74]] },
  { id: 'S19', cat: 'spatial', site: 'W20', ask: 'homes around a central lake', want: { uses: ['sfr'], place: [['pond', 'middle']] }, out: [['has', 'pond'], ['in', 'pond', 'middle']] },
  { id: 'S20', cat: 'spatial', site: 'W20', ask: '20,000 sf retail on the corner, 200 apartments behind it, and a commons in the middle', want: { uses: ['retail', 'multifamily'], place: [['retail', 'corner'], ['multifamily', 'behind', 'retail']] }, out: [['nearer', 'retail', 'multifamily', 'front']] },
  { id: 'S21', cat: 'spatial', site: 'C8', ask: 'a gas station on the corner with shops behind', want: { uses: ['fuel', 'retail'], place: [['fuel', 'corner'], ['retail', 'behind', 'fuel']] }, out: [['has', 'fuel'], ['nearer', 'fuel', 'retail', 'front']] },
  { id: 'S22', cat: 'spatial', site: 'R10', ask: '200 apartments, the pool and clubhouse up front by the street', want: { uses: ['multifamily'], place: [['pool', 'front'], ['clubhouse', 'front']] }, out: [['in', 'pool', 'front'], ['in', 'clubhouse', 'front']] },
  { id: 'S23', cat: 'spatial', site: 'W20', ask: 'townhomes along the street, apartments at the back', want: { uses: ['townhomes', 'multifamily'], place: [['townhomes', 'front'], ['multifamily', 'back']] }, out: [['nearer', 'townhomes', 'multifamily', 'front']] },
  { id: 'S24', cat: 'spatial', site: 'R10', ask: '200 apartments, dog park on the east side', want: { uses: ['multifamily'], place: [['dog park', 'edge', 'east']] }, out: [['has', 'dog park'], ['in', 'dog park', 'east']] },
  { id: 'S25', cat: 'spatial', site: 'R10', ask: '160 apartments, put the playground on the west side away from the road', want: { uses: ['multifamily'], place: [['playground', 'edge', 'west']] }, out: [['has', 'playground'], ['in', 'playground', 'west']] },
  { id: 'S26', cat: 'spatial', site: 'E10', ask: '200 apartments, put the pond on the north end', want: { uses: ['multifamily'], place: [['pond', 'edge', 'north']] }, out: [['in', 'pond', 'north']] },
  { id: 'S27', cat: 'spatial', site: 'B40', ask: 'warehouse with docks facing away from the street', want: { uses: ['industrial'], place: [['truck court', 'facing', 'back']] }, out: [['facing', 'truck court', 'back']] },
  { id: 'S28', cat: 'spatial', site: 'R10', ask: '200 apartments with a 50 ft landscape buffer along the north property line', want: { uses: ['multifamily'], place: [['open space', 'keep', 'north']] }, out: [['away', 'buildings', 'north', 49]] },
  { id: 'S29', cat: 'spatial', site: 'W20', ask: 'medical office at the front, senior apartments behind', want: { uses: ['medical', 'multifamily'], overlays: ['senior'], place: [['medical', 'front'], ['multifamily', 'behind', 'medical']] }, out: [['nearer', 'medical', 'multifamily', 'front']] },
  { id: 'S30', cat: 'spatial', site: 'C8', ask: '200 apartments with a second entrance on the side street', want: { uses: ['multifamily'], place: [['entrance', 'edge', 'side']] }, out: [['entrance', 'side']] },
  { id: 'S31', cat: 'spatial', site: 'R10', ask: 'garden apartments, as many as fit, parking in front of the buildings', want: { uses: ['multifamily'], q: { multifamily: 'fill' }, place: [['parking', 'before', 'buildings']] }, out: [['nearer', 'parking', 'buildings', 'front']] },
  { id: 'S32', cat: 'spatial', site: 'R10', ask: '160 apartments, clubhouse in the middle of the site', want: { uses: ['multifamily'], place: [['clubhouse', 'middle']] }, out: [['in', 'clubhouse', 'middle']] },
  { id: 'S33', cat: 'spatial', site: 'W20', ask: 'hotel at the front by the highway, restaurants on pads along the road, apartments behind', want: { uses: ['hotel', 'restaurant', 'multifamily'], place: [['hotel', 'front'], ['multifamily', 'behind']] }, out: [['nearer', 'hotel', 'multifamily', 'front']] },
  { id: 'S34', cat: 'spatial', site: 'R10', ask: '150 apartments, keep the southwest corner open for a future pad', want: { uses: ['multifamily'], place: [['open space', 'keep', 'southwest']] }, out: [['clear', 'southwest', 100]] },
  { id: 'S35', cat: 'spatial', site: 'E10', ask: 'retail facing the main road on the east, townhomes behind to the west', want: { uses: ['retail', 'townhomes'], place: [['retail', 'front'], ['townhomes', 'behind', 'retail']] }, out: [['nearer', 'retail', 'townhomes', 'east']] }
];
// a fast offline subset for npm test (test/prompts.mjs): a few of each kind, the quicker sites
export const FAST = ['V03', 'V05', 'V09', 'D07', 'D20', 'M01', 'M04', 'M10', 'M21', 'S04', 'S08', 'S18', 'S22'];
// Building types (LAYOUT-ENGINE.md item 34): requests naming a type the presets know (lib/btypes.mjs), a shape, a type a
// zone, and one no preset knows. Written with their expected reading before the AI's program step was given the presets.
// want.btype: the preset the program carries (a list: any of them; null: none); want.btZones: the presets of a mix's zones.
// out: ['btype', id] a building of that preset · ['count', keys | beds | children | students | buildings | spaces, mode, n]
//      · ['shape', L | U | T | point | plex4 | plex3] · ['queue', cars] a queue lane holding that many · ['none', piece]
export const TYPES = [
  { id: 'TY01', cat: 'types', site: 'R5', ask: 'a 4-story hotel with 120 rooms', want: { uses: ['hotel'], btype: 'hotel-limited', floors: { hotel: 4 } }, out: [['btype', 'hotel-limited'], ['count', 'keys', 'exact', 120]] },
  { id: 'TY02', cat: 'types', site: 'R5', ask: 'extended stay hotel, 100 suites', want: { uses: ['hotel'], btype: 'hotel-extended' }, out: [['btype', 'hotel-extended'], ['count', 'keys', 'exact', 100]] },
  { id: 'TY03', cat: 'types', site: 'W20', ask: 'full service conference hotel with 250 keys', want: { uses: ['hotel'], btype: 'hotel-full' }, out: [['btype', 'hotel-full'], ['count', 'keys', 'exact', 250]] },
  { id: 'TY04', cat: 'types', site: 'R5', ask: '120-key hotel above ground-floor retail', want: { uses: ['hotel'], btype: 'hotel-over-retail' }, out: [['btype', 'hotel-over-retail'], ['count', 'keys', 'min', 110]] },
  { id: 'TY05', cat: 'types', site: 'R5', ask: 'self storage, 3 stories, 100,000 sf climate controlled', want: { uses: ['storage'], btype: 'storage-multi' }, out: [['btype', 'storage-multi'], ['gfa', 'storage', 'min', 90000]] },
  { id: 'TY06', cat: 'types', site: 'R10', ask: 'mini-warehouses, all drive-up, one story', want: { uses: ['storage'], btype: 'storage-single' }, out: [['btype', 'storage-single']] },
  { id: 'TY07', cat: 'types', site: 'R5', ask: 'a 3-story medical office building, 45,000 sf', want: { uses: ['medical'], btype: 'mob', q: { medical: ['exact', 45000] }, floors: { medical: 3 } }, out: [['btype', 'mob'], ['gfa', 'medical', 'exact', 45000]] },
  { id: 'TY08', cat: 'types', site: 'P1', ask: 'a small urgent care', want: { uses: ['medical'], btype: 'clinic' }, out: [['btype', 'clinic'], ['gfa', 'medical', 'min', 4000]] },
  { id: 'TY09', cat: 'types', site: 'R5', ask: 'assisted living and memory care, 96 beds', want: { uses: ['multifamily'], btype: 'senior-al' }, out: [['btype', 'senior-al'], ['count', 'beds', 'exact', 96]] },
  { id: 'TY10', cat: 'types', site: 'R10', ask: 'student housing near campus, 500 beds in 4-bedroom units', want: { uses: ['multifamily'], btype: 'student' }, out: [['btype', 'student'], ['count', 'beds', 'exact', 500]] },
  { id: 'TY11', cat: 'types', site: 'R5', ask: 'daycare for 120 kids with a play yard', want: { uses: ['other'], btype: 'daycare' }, out: [['btype', 'daycare'], ['count', 'children', 'exact', 120], ['has', 'playground']] },
  { id: 'TY12', cat: 'types', site: 'W20', ask: 'a middle school for 800 students', want: { uses: ['other'], btype: 'school' }, out: [['btype', 'school'], ['count', 'students', 'exact', 800], ['has', 'field']] },
  { id: 'TY13', cat: 'types', site: 'T2', ask: 'express car wash with 20 vacuum stalls', want: { uses: ['other'], btype: 'car-wash' }, out: [['btype', 'car-wash'], ['queue', 10]] },
  { id: 'TY14', cat: 'types', site: 'P1', ask: 'credit union with drive-up teller lanes', want: { usesAny: [['restaurant'], ['retail'], ['office']], btype: 'bank' }, out: [['btype', 'bank'], ['queue', 4]] },
  { id: 'TY15', cat: 'types', site: 'B40', ask: 'hyperscale data center, 250,000 sf', want: { uses: ['industrial'], btype: 'data-center', q: { industrial: ['exact', 250000] } }, out: [['btype', 'data-center'], ['has', 'equipment yard'], ['none', 'truck court']] },
  { id: 'TY16', cat: 'types', site: 'B40', ask: '200k sf cold storage facility with truck court', want: { uses: ['industrial'], btype: 'cold-storage', q: { industrial: ['exact', 200000] } }, out: [['btype', 'cold-storage'], ['gfa', 'industrial', 'exact', 200000], ['has', 'truck court']] },
  { id: 'TY17', cat: 'types', site: 'R10', ask: 'flex industrial, 110 ft deep bays with 30% mezzanine, 80,000 sf', want: { uses: ['industrial'], btype: 'flex-mezz', q: { industrial: ['exact', 80000] } }, out: [['btype', 'flex-mezz'], ['gfa', 'industrial', 'exact', 80000]] },
  { id: 'TY18', cat: 'types', site: 'R10', ask: 'fourplexes, 60 units', want: { uses: ['duplex'], btype: 'plex', q: { duplex: ['exact', 60] } }, out: [['btype', 'plex'], ['units', 'exact', 60], ['shape', 'plex4']] },
  { id: 'TY19', cat: 'types', site: 'D6', ask: 'live-work units along the street, 20 of them', want: { uses: ['townhomes'], btype: 'live-work', q: { townhomes: ['exact', 20] } }, out: [['btype', 'live-work'], ['units', 'exact', 20]] },
  { id: 'TY20', cat: 'types', site: 'R5', ask: 'a 16-story point tower, 220 units', want: { uses: ['multifamily'], btype: 'point-tower', floors: { multifamily: 16 } }, out: [['btype', 'point-tower'], ['shape', 'point'], ['units', 'exact', 220]] },
  { id: 'TY21', cat: 'types', site: 'R10', ask: 'L-shaped apartment buildings, 4 stories, 160 units', want: { uses: ['multifamily'], btype: 'mf-l', floors: { multifamily: 4 } }, out: [['shape', 'L'], ['units', 'exact', 160]] },
  { id: 'TY22', cat: 'types', site: 'R10', ask: 'a U-shaped apartment building wrapped around a central courtyard, 140 units', want: { uses: ['multifamily'], btype: ['mf-u', 'mf-courtyard-u'] }, out: [['shape', 'U'], ['units', 'exact', 140]] },
  { id: 'TY23', cat: 'types', site: 'R10', ask: 'T-shaped apartments, 150 units, 4 floors', want: { uses: ['multifamily'], btype: 'mf-t' }, out: [['shape', 'T'], ['units', 'exact', 150]] },
  { id: 'TY24', cat: 'types', site: 'R5', ask: 'a pad village of 5 restaurant pads', want: { usesAny: [['other'], ['restaurant']], btype: 'pad-village' }, out: [['btype', 'pad-village'], ['count', 'buildings', 'exact', 5]] },
  { id: 'TY25', cat: 'types', site: 'W20', ask: 'a 150-key hotel with 25,000 sf of retail in front', want: { uses: ['hotel', 'retail'], btZones: ['hotel-limited'], place: [['retail', 'front']] }, out: [['btype', 'hotel-limited'], ['count', 'keys', 'exact', 150], ['gfa', 'retail', 'exact', 25000], ['nearer', 'retail', 'hotel', 'front']] },
  { id: 'TY26', cat: 'types', site: 'W20', ask: 'townhomes with a daycare and a bank on pads out front', want: { usesAny: [['townhomes', 'other', 'restaurant'], ['townhomes', 'other', 'retail']], btZones: ['daycare', 'bank'] }, out: [['btype', 'daycare'], ['btype', 'bank']] },
  { id: 'TY27', cat: 'types', site: 'R5', ask: 'an indoor go-kart track, 40,000 sf', want: { uses: ['other'], btype: ['custom', null] }, out: [['built'], ['gfa', 'other', 'min', 36000]] },
  { id: 'TY28', cat: 'types', site: 'R10', ask: 'a 125,000 sf home improvement store', want: { uses: ['retail'], btype: 'big-box', q: { retail: ['exact', 125000] } }, out: [['btype', 'big-box'], ['gfa', 'retail', 'exact', 125000]] },
  { id: 'TY29', cat: 'types', site: 'R5', ask: 'a 45,000 sf gym', want: { uses: ['retail'], btype: 'fitness', q: { retail: ['exact', 45000] } }, out: [['btype', 'fitness'], ['gfa', 'retail', 'exact', 45000]] },
  { id: 'TY30', cat: 'types', site: 'T2', ask: 'parking garage for 500 cars', want: { btype: 'garage-standalone' }, out: [['btype', 'garage-standalone'], ['count', 'spaces', 'min', 450]] },
  { id: 'TY31', cat: 'types', site: 'R10', ask: 'independent senior living community, 140 units', want: { uses: ['multifamily'], btype: 'senior-il', q: { multifamily: ['exact', 140] } }, out: [['btype', 'senior-il'], ['units', 'exact', 140]] },
  { id: 'TY32', cat: 'types', site: 'W20', ask: 'a K-8 charter school for 650 students', want: { uses: ['other'], btype: 'school' }, out: [['btype', 'school'], ['count', 'students', 'exact', 650]] },
  { id: 'TY33', cat: 'types', site: 'W20', ask: 'hotel at the front with 110 rooms, apartments behind, 200 units', want: { uses: ['hotel', 'multifamily'], btZones: ['hotel-limited'], place: [['hotel', 'front']] }, out: [['btype', 'hotel-limited'], ['count', 'keys', 'exact', 110], ['units', 'exact', 200], ['nearer', 'hotel', 'multifamily', 'front']] }
];
// Building-type requests written after the AI's program step was tuned to TYPES (item 34), scored once (--fresh3)
export const FRESH3 = [
  { id: 'FT01', cat: 'types', site: 'R5', ask: 'a 95-room select service hotel, 5 stories', want: { uses: ['hotel'], btype: 'hotel-limited', floors: { hotel: 5 } }, out: [['btype', 'hotel-limited'], ['count', 'keys', 'exact', 95]] },
  { id: 'FT02', cat: 'types', site: 'R10', ask: 'memory care facility with 64 beds', want: { uses: ['multifamily'], btype: 'senior-al' }, out: [['btype', 'senior-al'], ['count', 'beds', 'exact', 64]] },
  { id: 'FT03', cat: 'types', site: 'P1', ask: 'a drive-thru bank on the corner', want: { usesAny: [['restaurant'], ['retail'], ['office']], btype: 'bank' }, out: [['btype', 'bank'], ['queue', 4]] },
  { id: 'FT04', cat: 'types', site: 'W20', ask: 'an elementary school, 500 kids', want: { uses: ['other'], btype: 'school' }, out: [['btype', 'school'], ['count', 'students', 'exact', 500]] },
  { id: 'FT05', cat: 'types', site: 'B40', ask: 'colocation data center 150,000 sf', want: { uses: ['industrial'], btype: 'data-center', q: { industrial: ['exact', 150000] } }, out: [['btype', 'data-center'], ['has', 'equipment yard']] },
  { id: 'FT06', cat: 'types', site: 'R10', ask: 'triplexes, 45 units', want: { uses: ['duplex'], btype: 'plex', q: { duplex: ['exact', 45] } }, out: [['btype', 'plex'], ['shape', 'plex3'], ['units', 'exact', 45]] },
  { id: 'FT07', cat: 'types', site: 'T2', ask: 'a tunnel car wash', want: { uses: ['other'], btype: 'car-wash' }, out: [['btype', 'car-wash'], ['queue', 10]] },
  { id: 'FT08', cat: 'types', site: 'R5', ask: 'a 30,000 sf health club', want: { uses: ['retail'], btype: 'fitness', q: { retail: ['exact', 30000] } }, out: [['btype', 'fitness'], ['gfa', 'retail', 'exact', 30000]] },
  { id: 'FT09', cat: 'types', site: 'W20', ask: 'a dorm with 400 beds and 20,000 sf of shops in front', want: { uses: ['multifamily', 'retail'], btZones: ['student'] }, out: [['btype', 'student'], ['count', 'beds', 'exact', 400], ['gfa', 'retail', 'exact', 20000]] },
  { id: 'FT10', cat: 'types', site: 'R10', ask: 'a T-shaped mid-rise apartment building, 120 units', want: { uses: ['multifamily'], btype: 'mf-t' }, out: [['shape', 'T'], ['units', 'exact', 120]] }
];
// written after the parser was tuned to CASES and scored once, untuned (node scripts/prompt-corpus.mjs --fresh): how
// well the reading carries to requests it never saw
export const FRESH = [
  { id: 'FV1', cat: 'vague', site: 'R10', ask: 'what should we build here?', want: { usesAny: [...HOUSING, ['retail']], assumed: true }, out: [['built']] },
  { id: 'FV2', cat: 'vague', site: 'W20', ask: 'a for-sale townhome community', want: { uses: ['townhomes'], q: { townhomes: 'fill' } }, out: [['built']] },
  { id: 'FV3', cat: 'vague', site: 'B40', ask: 'logistics', want: { uses: ['industrial'] }, out: [['built']] },
  { id: 'FV4', cat: 'vague', site: 'R5', ask: 'a strip center', want: { uses: ['retail'], q: { retail: 'fill' } }, out: [['built']] },
  { id: 'FD1', cat: 'detailed', site: 'R10', ask: '220 apartments, 3 stories, 1.7 spaces per unit, with a pool and clubhouse', want: { uses: ['multifamily'], q: { multifamily: ['exact', 220] }, floors: { multifamily: 3 }, perUnit: 1.7 }, out: [['has', 'pool']] },
  { id: 'FD2', cat: 'detailed', site: 'B40', ask: '180,000 sf warehouse with 0.6 spaces per 1,000 sf and a truck court', want: { uses: ['industrial'], q: { industrial: ['exact', 180000] }, ratio: 0.6 }, out: [['gfa', 'industrial', 'exact', 180000]] },
  { id: 'FD3', cat: 'detailed', site: 'R10', ask: '45,000 sf office in two 3-story buildings', want: { uses: ['office'], q: { office: ['exact', 45000] }, floors: { office: 3 } }, out: [['built']] },
  { id: 'FD4', cat: 'detailed', site: 'R10', ask: 'up to 90 townhomes with rear-load garages', want: { uses: ['townhomes'], q: { townhomes: ['max', 90] } }, out: [['units', 'max', 90]] },
  { id: 'FM1', cat: 'messy', site: 'R10', ask: '175 apts, 3 stry, 1.6/du', want: { uses: ['multifamily'], q: { multifamily: ['exact', 175] }, floors: { multifamily: 3 }, perUnit: 1.6 }, out: [['units', 'exact', 175]] },
  { id: 'FM2', cat: 'messy', site: 'R10', ask: 'retial 25k + 1 pad', want: { uses: ['retail'], q: { retail: ['exact', 25000] } }, out: [['built']] },
  { id: 'FM3', cat: 'messy', site: 'B40', ask: 'whse ~150k sf, 1 acre det pond', want: { uses: ['industrial'], q: { industrial: ['exact', 150000] }, pondAc: 1 }, out: [['built']] },
  { id: 'FM4', cat: 'messy', site: 'R10', ask: 'Garden Apts, MAX UNITS, 3 STORY', want: { uses: ['multifamily'], q: { multifamily: 'fill' }, floors: { multifamily: 3 } }, out: [['built']] },
  { id: 'FS1', cat: 'spatial', site: 'R10', ask: '180 apartments with the playground in the northeast corner', want: { uses: ['multifamily'], place: [['playground', 'corner', 'northeast']] }, out: [['in', 'playground', 'corner']] },
  { id: 'FS2', cat: 'spatial', site: 'W20', ask: 'shops up front and townhomes in the back', want: { uses: ['retail', 'townhomes'], place: [['retail', 'front'], ['townhomes', 'back']] }, out: [['nearer', 'retail', 'townhomes', 'front']] },
  { id: 'FS3', cat: 'spatial', site: 'R10', ask: '160 apartments, keep a 40 ft tree buffer on the east side', want: { uses: ['multifamily'], place: [['open space', 'keep', 'east']] }, out: [['away', 'buildings', 'east', 39]] },
  { id: 'FS4', cat: 'spatial', site: 'R10', ask: '200 apartments, dog park at the back', want: { uses: ['multifamily'], place: [['dog park', 'back']] }, out: [['in', 'dog park', 'back']] }
];
// written after round 2 (the engine honouring the pond's, the parking's, the clubhouse's, the docks' and a single use's
// place: LAYOUT-ENGINE.md item 30), never tuned to, scored once (node scripts/prompt-corpus.mjs --fresh2)
export const FRESH2 = [
  { id: 'FP1', cat: 'spatial', site: 'R10', ask: '170 apartments, put the detention at the front by the road', want: { uses: ['multifamily'], place: [['pond', 'front']] }, out: [['in', 'pond', 'front']] },
  { id: 'FP2', cat: 'spatial', site: 'E10', ask: '190 apartments with the pond on the south end', want: { uses: ['multifamily'], place: [['pond', 'edge', 'south']] }, out: [['in', 'pond', 'south']] },
  { id: 'FP3', cat: 'spatial', site: 'R10', ask: '150 apartments, parking tucked behind the buildings', want: { uses: ['multifamily'], place: [['parking', 'behind', 'buildings']] }, out: [['nearer', 'buildings', 'parking', 'front']] },
  { id: 'FP4', cat: 'spatial', site: 'B40', ask: '200,000 sf distribution building at the back of the site, docks facing west', want: { uses: ['industrial'], place: [['industrial', 'back'], ['truck court', 'facing', 'west']] }, out: [['in', 'industrial', 'back'], ['facing', 'truck court', 'west']] },
  { id: 'FP5', cat: 'spatial', site: 'W20', ask: '220 apartments, clubhouse near the entrance', want: { uses: ['multifamily'], place: [['clubhouse', 'near', 'entrance']] }, out: [['near', 'clubhouse', 'entrance', 150]] },
  { id: 'FP6', cat: 'spatial', site: 'C8', ask: '160 apartments with access off the side street', want: { uses: ['multifamily'], place: [['entrance', 'edge', 'side']] }, out: [['entrance', 'side']] },
  { id: 'FP7', cat: 'messy', site: 'R5', ask: 'office 35k, 2 stories', want: { uses: ['office'], q: { office: ['exact', 35000] }, floors: { office: 2 } }, out: [['built']] },
  { id: 'FP8', cat: 'vague', site: 'R5', ask: 'bowling alley', want: { uses: ['other'] }, out: [['built']] },
  { id: 'FP9', cat: 'spatial', site: 'D6', ask: '70 townhomes with the pond in the back', want: { uses: ['townhomes'], place: [['pond', 'back']] }, out: [['in', 'pond', 'back']] },
  { id: 'FP10', cat: 'spatial', site: 'R10', ask: '200 apartments, pond in the southeast corner', want: { uses: ['multifamily'], place: [['pond', 'corner', 'southeast']] }, out: [['in', 'pond', 'corner']] }
];
