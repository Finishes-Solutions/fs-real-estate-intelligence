# Building types: inventory and the primitive model

Nov 4 2026, branch `matthew/building-primitives`; round 2 Nov 5, branch `matthew/building-types-2` (section 6); round 3
Nov 5, branch `matthew/building-types-3` (section 7). Concept planning only. Code: `lib/btypes.mjs` (types),
`lib/btsite.mjs` (the site features a type needs), `lib/btlanes.mjs` (lanes and yards routed over the open ground); tests:
`test/btypes.mjs`, `test/btnumbers.mjs`; bench: the `TY-` cases in `scripts/layout-bench-v2.mjs`; engine notes:
docs/LAYOUT-ENGINE.md items 27, 29 and 35.

## 1. Audit: where building types were defined (before this work)

Types were spread over seven places, each a fixed list:

| Where | What it defines | How many |
|---|---|---|
| `lib/siteplan.mjs` `USES` | the engine's uses: parking ratio, floors, depth, floor height (3D), unit size | 17 (retail, restaurant, office, medical, hotel, church, venue, industrial, storage, fuel, multifamily, townhomes, duplex, sfr, foodtrucks, amenity, other) |
| `lib/siteplan.mjs` `KIND_WORDS`, `guessProgram` | the words that pick a use, and what a use's numbers mean (rooms → hotel sf, seats → church sf, pumps, storage parts) | one regex a use |
| `lib/layoutbrief.mjs` `FORM_WORDS`, `defaultForm`; `lib/layoutcaps.mjs` `CAPS` | the brief's building forms and what the engine can draw of each | 30 forms (mf-garden … mx-vertical), statuses implemented / partial / unsupported |
| `lib/sitegen.mjs` `TYPES`, `courtyard1`, `wrapOf`, `tuckOf`, `verticalOf`, `podiumCourt`; `lib/sitegencom.mjs` `shops`, `flex`, `crossDock`, `storage`, `plaza` | the geometry: bar (65 ft), garden (60 ft), courtyard wing, wrap, tuck-under rows, vertical mixed use, podium court, shop rows, flex, cross-dock, storage campus | ~12 generators |
| `lib/sitelayout.mjs` (`buildRows`), `lib/sitepad.mjs`, `lib/sitefuel.mjs`, `lib/sitefoodtruck.mjs`, `lib/sitecommunity.mjs`, `lib/streetnet.mjs` | rows of each use (industrial depths 180-520 ft; flex 80-120 ft; storage blocks), restaurant pads and drive-thru (L / U pads), fuel canopy, food trucks, home communities, single-family lots | per use |
| `lib/reftemplates.mjs` (from `scripts/refs/templates-to-lib.mjs`), `lib/bldgtemplates.mjs` | reviewed modules: garden breezeway stack 75 × 60 (P37, P08, P06), corridor bay 50 × 65 (P28, P11), tuck-under and front-load townhome bays 20 × 42 (E053), stacked bay (estimate), corridor gross area a home (P28, P11, P33), podium tower share (P25, E028) | 7 templates |
| `lib/buildings.mjs` | the Draw library: several hundred footprints (apartments, townhomes, duplexes, house plans, tiny / manufactured homes, shops, offices, medical, flex, storage, fuel, hotels, venues, cabins) picked by hand | ~400 |
| `lib/customtypes.mjs` (test/customtypes.mjs) | AI-written recipes for anything else: a pattern (row, pads, commons, yard), buildings, outdoor pieces, a parking rule, all clamped and marked AI-sized | open, AI only |
| `lib/massing.mjs`, `lib/plandesign.mjs` | plan-set designs: L / U / stepped outlines (`plandesign` reads `e.form`), facades for plan sets and BIM (no longer on the map since Nov 4) | per element |
| `lib/siteplan.mjs` `planFeatures`; `lib/planmap.mjs` `USE_COL`; `lib/sitesheet.mjs` palette | the 3D map: a plain block coloured by `use`, a parapet and a line at every floor, the use's floor height | 16 colours |

What was fixed rather than flexible: a type was a use (17) or a form (30); nothing in between took parameters from the
words beyond floors, a few counts and one depth (corridor buildings); words for a type the lists don't know fell to
`other` (a 3-per-1,000 box) or worse to a wrong use ("data center" read as retail because of "center"; "cold storage
facility" as self storage; "fourplexes" as `other`); "L-shaped apartments" drew the garden stack round a corner and
fell 62 homes short; colours and floor heights could only follow the 16 uses.

## 2. The model: primitive × parameters × use rules

A **type** = a **primitive** (a footprint the engine draws) + **parameter defaults** + **use rules** (what it counts,
its parking rule, its block's colour, its floor height), each number with its source.

**Primitives** (`PRIMITIVES`, each with an outline in feet for any parameters, shown in `primitives.png`): bar,
garden stack, L, U, courtyard (O), T, tower on podium, point tower (a slim tower on its podium), wrap,
courtyard on a podium, row, detached, small multiplex, big box, cross-dock, flex bays, storage campus, canopy and store,
drive-thru pad, tunnel, building with its grounds (pavilion), cluster of pads, parking garage.

**Parameters** (`PARAMS`, bounded): floors, floor to floor, depth, length, wing depth, net sf a home, gross sf a key, beds
a unit, gross sf a child / a student, mezzanine share, spaces a 1,000 sf or a home; core (`breezeway`, `double-loaded`,
`single-loaded`, `open`, `none`) and the parking relation (`surface`, `tuck-under`, `podium`, `wrap`, `garage`, `none`).

**Use rules**: the engine use it lays out as (so drives, parking, ponds, entrances and the checks work as for any
plan), the count it reports (units, keys, beds, children, students, sf), its parking rule (handed to the brief as its
`parkingPerUnit` / `parkingPer1000` rule, so the engine and the independent check count the same requirement), its
colour key (`TYPE_COLORS`, apart from its use where useful) and floor height (`floorH` on the block).

**Existing types are presets** (`existing: true`): 31 of them (the 30 forms and uses above, with the engine's own
numbers). They change nothing in the program the words make; `test/btypes.mjs` checks their numbers against `USES`,
`sitegen` `TYPES` / `WRAP` / `GATE`, `PODIUM`, `HOME_TYPES`, `FUEL` and the reviewed templates, and checks that 28
existing requests (the bench's and others) get no type fields. Bench: all 44 earlier cases identical, element for
element.

**Modified from words** (`applyType`, called last in `guessProgram`): "L-shaped 4-story apartments" (L primitive, homes
from floor area, not the garden stack), "U building around a pool" (courtyard round the pool, read as apartments and
said so), "a 6-story hotel with 120 keys" (66,000 sf, 6 floors), "3-story self storage 90,000 sf" (one building, no
drive-up rows), "flex buildings 120 ft deep with mezzanine" (depth fixed, 25% mezzanine, or the share said), "a custom
type: 2-story clinic 12,000 sf, 5 per 1,000 parking" (the clinic preset with the ratio as its rule), beds and units ("600
beds, 4 bed units"), a ratio ("5 per 1,000"), spaces a unit, vacuums, a tunnel length. A preset's usual floors ride as
`btFloors` (used when the words give none) so the words' own floors stay distinguishable (lib/planbrief.mjs).

**Unknown types** map to the closest primitive: "a 2-story trampoline park 30,000 sf" is drawn as a bar at 30,000 sf, 2
floors, 3 a 1,000 sf, named "Trampoline Park A", and the notes say no type matched and what was assumed. Since round 2 a
T-shaped building is drawn as a T and a stand-alone parking garage is drawn (section 6).

## 3. Types before and after

Before: 17 uses / 30 forms. After: those 31 as presets, plus 21 new presets and 3 shape presets (L, U, round a pool),
plus the custom mapping.

| New preset | Primitive → engine path | Count | Parking rule | Colour | Request words | Numbers |
|---|---|---|---|---|---|---|
| Limited-service hotel | bar → hotel row | keys (550 gsf) | 1 a key (1.82 / 1,000 sf) | hotel | "hotel … 120 keys/rooms", "limited/select-service" | standard (parking) / estimate (gsf a key) |
| Extended-stay hotel | bar → hotel row, 66 ft deep | keys (650 gsf) | 1 a key (1.54 / 1,000) | hotel | "extended-stay", "residence inn", "suites hotel" | estimate |
| Multi-story self storage | storage campus → one climate building | sf (units at 72%) | engine 0.1 / 1,000 | storage | "3-story self storage", "multi-story" | engine |
| Single-story drive-up storage | storage campus → drive-up rows | sf (92%) | engine | storage | "single-story", "drive-up only" | engine |
| Medical office building | bar → medical, 2 floors | sf | 5 / 1,000 | medical | "medical office building", "MOB" | estimate (floors) |
| Clinic / urgent care | bar → medical, 6,000 sf default | sf | 5 / 1,000 | medical | "clinic", "urgent care", "dental", "surgery center" | estimate |
| Assisted living / memory care | bar → apartments from floor area (780 net) | beds (1 a suite) | 0.5 a suite | senior | "assisted living", "memory care", "skilled nursing" | estimate |
| Independent senior living | bar → apartments (950 net), 4 floors | units | 1 a home | senior | "independent living", "senior apartments", "55+" | estimate |
| Student housing | bar → apartments (1,100 net), 4 floors | beds (3 a unit, or as said) | 0.6 a bed | student | "student housing", "dorms", "purpose-built student" | estimate |
| Small multiplexes | plex → duplex rows, PLEX footprints (fourplex 64 × 56, triplex 66 × 44 ft) | units | engine 2 a home | duplex | "fourplex", "triplex", "quadplex", "missing middle" | estimate (footprints) |
| Live-work townhomes | row → townhome rows | units | townhomes | livework | "live-work", "shophouse" | estimate (work space) |
| Flex with mezzanine | flex bays → flex, depth from words | sf + mezzanine sf | engine flex | flex | "flex … N ft deep", "mezzanine", "40% mezzanine" | estimate |
| Cold storage | big box → warehouse with truck court, 45 ft | sf | 0.3 / 1,000 | cold | "cold storage", "refrigerated warehouse", "freezer" | estimate |
| Data centre shell | big box → warehouse, no truck court, 32 ft; a fenced equipment yard at the back (25% of its plot) | sf | 0.2 / 1,000 | datacenter | "data center", "hyperscale", "colocation" | estimate |
| Fitness club | big box → one retail building, 200 ft deep | sf (40,000 default) | 5 / 1,000 | fitness | "fitness center", "gym", "health club" | estimate |
| Big-box store | big box → one retail building, 300 ft deep | sf (120,000 default) | 4 / 1,000 | bigbox | "big box", "supercenter", "home improvement", "wholesale club" | estimate |
| Bank with drive-thru | drive-thru pad → restaurant pad with lanes | sf (3,500 default) | 4 / 1,000 | bank | "bank", "credit union" | estimate |
| Daycare | building with grounds → custom recipe: building + play yard | children (50 gsf each) | 0.2 a child | civic | "daycare", "child care", "preschool", "early learning" | standard (35 sf usable a child, licensing) / estimate |
| School (elementary / middle / high) | building with grounds → building + play yard + field | students (125 / 140 / 155 gsf) | 0.12 a student (0.3 high) | civic | "elementary/middle/high school", "charter school" | estimate |
| Express car wash | tunnel in an envelope (186 × 64 ft) → custom recipe pad; stacking lanes and exit drawn after the run | sf, vacuums, cars stacked | 20 a tunnel (vacuums) | carwash | "car wash", "express wash" (not with a gas station) | estimate |
| Stand-alone parking garage | garage: a two-bay deck on the stall grid | spaces | none of its own | garage | "parking garage, 400 spaces" alone | standard (bays) / engine (grid) |
| Full-service hotel | bar → hotel row, 70 ft deep, 8 floors | keys (1,000 gsf) | 1.2 a key | hotel | "full-service", "convention", "resort", "conference hotel" | estimate |
| Hotel over retail | bar → hotel building with a ground floor of shops | keys (550 gsf) + shop sf | 1 a key + 4 / 1,000 shops, blended | hotel (shop floor retail) | "hotel over / above retail", "hotel with ground-floor retail" | estimate |
| Point tower | point tower → tower on its podium, slim plate | units | engine | multifamily | "point tower", "slender tower" | estimate |
| Cluster of pads | cluster → custom recipe pads | sf, pads | 6 / 1,000 (10 for food) | pads | "pad-site village", "food hall pads", "cluster of pads" | estimate |

Existing presets with their engine numbers (no change): garden, studio garden, walk-up, mid-rise, courtyard, wrap,
tuck-under, courtyard on a podium, podium, tower on podium, townhomes, stacked townhomes, duplex / plex, BTR cottages,
single-family lots, inline retail, anchored center, restaurant pad, QSR drive-thru, office, medical, hotel, church,
venue, warehouse, cross-dock, multi-tenant flex, self storage, gas station, food truck park, vertical mixed use.

## 4. On the plan and the 3D map

Each building of a type carries `btype`, its colour key `tc` (when the type has its own colour) and `floorH`; its name
takes the type's short name ("Hotel A", "Assisted living 2", "Data center"), and the line under it the count ("Limited-service
hotel · 6-story · 120 keys", "Flex with mezzanine · 1-story · 42,000 sf · 10,500 sf mezzanine"); homes keep the engine's
line (front-load, garages), prefixed with the type. The 3D map keeps its plain blocks with the parapet and floor lines,
coloured by the type's key at the type's floor height; the plan key lists the type ("Data center", "School / daycare").
The option's notes say the preset, its primitive, the count and where its numbers come from.

## 5. Not done yet (after round 3)

Round 3 (section 7) drew the school's parent queue and bus loop, the daycare's drop-off lane and fenced play yard, the
hotel's porte-cochère, the gas station's pump queues, a bank zone's drive-thru, a school or daycare zone's grounds, the
shops of a hotel over retail at the sf asked, and the counts in the Pro forma area table. Still:

- The lanes are drawn after the run on the open ground the engine left: the engine does not yet reserve room for them.
  On a tight lot (a 120-key hotel on 2.9 acres with its parking all round, a 150-child daycare on 2.3 acres whose only
  drive is its parking aisle) there is no room and the notes say so (a porte-cochère and a daycare lane are judged only
  where drawn; a school's queue and bus loop and a bank zone's lane fail the queue check when missing).
- A school or daycare named beside homes in one mixed request ("a school for 500 students and 100 townhomes") is not
  read as a zone of its type yet (only the pad words, "a daycare and a bank on pads in front of townhomes", make zones).
- The car wash's stacking lanes still need a drive within 90 ft of a short end of its plot (round 2's own router).
- (Done Nov 5, LAYOUT-ENGINE.md item 34) The AI's program step names presets: a short presets table in its instructions (lib/btypes.mjs presetTable), buildingType and zones[].preset in its schema, applied by the words' own preset code (applyPreset, zonePreset).
- Ground-floor uses other than shops under homes or a hotel.
- Single-story drive-up storage on small lots can trip the fire-truck turning warning on its drive aisles (the storage
  layout's own, seen without the preset too); not on the bench.

## 6. Round 2 (Nov 5): footprints, site features, queues, a type per zone, the editor

**Footprints of their own.** A T is drawn as a T (lib/siteplan.mjs outline form 'T': a bar along the back, a wing off its
middle; overlap, footprint, plan-set outline and the engine's L / U paths take it). A point tower is a slim tower on its
podium (`point`: the tower 45% of the podium's length and 70% of its depth, lib/siteplan.mjs towerOutline; the engine's
tower sizing takes it, so its homes are counted from the slimmer plate). Triplexes and fourplexes are buildings of their
own (lib/siteplan.mjs PLEX: a fourplex 64 × 56 ft, two flats over two; a triplex 66 × 44 ft, three side by side; 2
floors; estimates), laid out on the duplex rows with the block depth they need, named "Fourplex 3", parked as front-load
duplexes. A cluster of pads has a preset ("a pad-site village with 6 pads", "food hall pads": 2,500-4,500 sf pads, 6 or 10
a 1,000 sf).

**More presets.** A full-service hotel (about 1,000 gross sf a key with its meeting and restaurant space, 8 floors, 1.2
spaces a key; estimate). A hotel over retail ("a 120-key hotel over retail": the hotel's floors at 550 sf a key over a
ground floor of shops the building's footprint; parking the two blended over the building; the 3D block shows the shop
floor in the retail colour). A stand-alone parking garage ("parking garage, 400 spaces": a two-bay deck 124 ft wide, as
long as its spaces need on the engine's stall grid, a level more before it runs past 330 ft, 6 levels at most; the
garage is the plan's program, its levels its floor area, its spaces counted as a garage's by the check).

**Site features a type needs** (lib/btsite.mjs). The engine lays the type out as a bigger box (its envelope: the
program's `btEnvelope`), and after the run the box is cut back to the building and the rest becomes what the type needs:

| Type | Drawn | Numbers (source) |
|---|---|---|
| Express car wash | The tunnel; one way in from the nearest drive splitting into two 12 ft stacking lanes along the plot's front to the pay stations, merging round the far end into the tunnel's mouth; an exit apron out of the other end to a drive. The runs out to the drives go straight on or turn once, through landscape or a walk only, never across parking, a building or a pond; the side and hand with the shortest runs win; anything the engine's own check calls broken and they're left off (the note says so) | 12 cars wanted (estimate: express tunnels are commonly planned for 10-12 or more cars before the pay stations; local rules run about 6-15); 20 ft a car; corners drawn for a passenger car's turn (AASHTO P, lib/turning.mjs) |
| Data centre | The back quarter of its plot (the side away from the street) a fenced yard for its generators and cooling | 25% of the footprint (estimate) |
| Bank, QSR / coffee drive-thru | The engine's own drive-thru lane round the pad (lib/sitepad.mjs), now checked | 5 cars a lane for a bank (estimate: rules commonly ask 4-6); 8 behind the order point for a restaurant (the engine's rule) |

**The independent check** (lib/layoutcheck.mjs, soft): `queues.clear` walks each queue lane's centre line every 2 ft
where cars wait (past where it leaves its drive, or where the lane says its queue starts, up to its window) and fails a
point inside another drive, a parking row or outside the property line (the street); `queues.stack` measures the
stacking (a car wash's lanes along their paths, 20 ft a car; a drive-thru's as drawn) against the type's count. A
parking row laid across a car wash lane is caught (test/btypes.mjs).

**A type per zone.** A mixed request's zones each take the preset their part of the words names ("a hotel with 120 keys and
20,000 sf of retail": the hotel zone sized at 66,000 sf from its keys, its buildings named and counted, 120 keys). Types
named on pads in front of another use ("a daycare and a bank on pads in front of townhomes") become zones of their own at
the front with the main use behind. Each zone parks at its use's own rule. The program carries `btZones` ([{ zone,
btype, counts }]); after the run each zone's buildings are tagged as their preset.

**Numbers.** The pro forma counts each building's keys (an extended stay at 650 sf a key is no longer re-counted at
550), beds, children and students, and storage units (net rentable sf / 110 sf, an estimate); the Numbers panel shows
Hotel keys, Beds, Children and Students tiles where the plan has them.

**The editor.** The site plan's Add panel has "Add a building by type": a searchable list of the presets (51), each with
its colour, adding the preset's building at its usual size (a 120-key hotel 254 × 65 ft on 4 floors, a 150-child
daycare, two garden stacks...) the way a library building is added; the 3D map shows it as the plain block coloured by
type with its parapet and floor lines. The building's shape list has T-shaped.

**Bench.** New cases TY-T-apts, TY-point-tower, TY-triplex, TY-hotel-full, TY-hotel-retail, TY-garage, TY-pad-village,
TY-mix-hotel, TY-mix-pads; TY-carwash moved to 2.3 acres (ty23) and TY-datacenter gains its yard.

## 7. Round 3 (Nov 5): the site features each type needs

**How a lane is drawn** (lib/btlanes.mjs, called from lib/btsite.mjs after the run). A lane runs along one face of its
building (its curb: where children get out, buses load, guests are dropped under the canopy, a teller's window), a walk's
width off the face. Where the queue the type asks for is longer than the face, the lane doubles back on itself in rows
outward from the face (a serpentine, each turn a car's U-turn, 40 ft between rows; 56 ft for a two-lane queue), with a
lead-in along the face's line where that is open. Its two open ends are routed over the open ground to the nearest drive
(a 4 ft grid in the building's frame; a turn costs as much as 40 ft of lane; the last stretch into a drive straight for
the lane's turning radius and half its width, so a car turning off the drive has room; a bus loop and a porte-cochère may
instead run out to the street on a driveway of their own, at least 60 ft from another). Only landscape, walks and land held
for later are crossed: never a building (nor round its corners), parking, a pond, a play yard or field, another lane, or
the paving buffer along the side and rear lines; two run-outs longer than 700 ft together are not offered. Each face,
direction and number of rows is tried; a try meeting the queue with the shortest run-outs wins (a car short costs as much
as 20 ft of run-out a foot), and the engine's own check (lib/siteplan.mjs check) must find nothing new wrong, else the
next try. Nothing fits: the notes say so. The lanes are flat paving (`kind: 'drive'`, `note: 'Drive-thru lane'`,
`queue` its kind, `windowAt` where its count stops): the 3D map keeps its plain coloured blocks; the plan marks the curb
(PICK-UP, BUS LOADING, DROP-OFF, ENTRANCE, WINDOW).

| Type | Drawn | Numbers (source; all estimates to confirm locally) |
|---|---|---|
| School | A parent drop-off and pick-up queue (12 ft; two lanes side by side, 24 ft, merging at the curb, "double stacking", when one lane can't hold it) and a bus loop of its own (24 ft: a loading lane and a lane to pass), on different faces, kept apart; tried in both orders, the pair holding more wins. The recipe's play yard and field; one the layout left on the detention pond is moved to open ground beside the building after the lanes | Cars: 10% of an elementary school's students (charter-school pick-up studies measured queues of about 10% of enrollment), 8% middle, 5% high (students drive), 25 ft a car (FHWA); South Carolina DOT school guidance recommends roughly 900-1,500 ft of on-site stacking for an elementary school. Buses: half the students ride (a third at a high school), 60 a bus, the loop holding every bus at once, 45 ft a bus |
| Daycare | A drop-off lane along a face from the drive and back out; the play yard fenced (4 ft) beside the building | A car for every 25 children, at least 4 (arrivals spread over the morning; parents commonly park and walk in to sign children in) |
| Hotel (limited, extended, full-service, over retail) | A porte-cochère: a 24 ft drive-through lane (a lane to stop, one to pass) under a 60 ft canopy at the entrance (the canopy a flat plaza piece, `porte: true`), from a drive or the street and back out | 3 cars at the door (brand standards vary) |
| Gas station / c-store | A pump lane each side of each island row through the canopy, out into the drive lanes at its ends; the canopy, store and air / vacuum stalls as round 2 drew them | At least one car waiting at each accessible side of a pump island (Huron, OH; Seven Hills, OH asks two; Durham, NC two a fueling position); measured in the forecourt paving past the canopy's ends, up to two an end |
| Bank as a zone | Its drive-thru lane along a side, the window at the face's middle | 5 cars before the window (round 2's bank rule) |
| School or daycare as a zone | The play yard (and a school's field) laid beside the building on open ground; the daycare's fenced | As the single type's recipe |

**The check** (lib/layoutcheck.mjs 10c, soft). `queues.stack` (or `queues.stack.types` beside round 2's): each kind's
queue measured on the drawing, its cars along the centre line from where it leaves its drive to its curb's end (twice
over for a 24 ft parent queue), a bus loop's buses the same at 45 ft (counted only when the loop has a curb within 40 ft
of the school), a pump lane's waiting cars as drawn; against `queueWant` (lib/btsite.mjs QUEUE_TYPES, where each number's
source is written). A school's queue and bus loop and a bank zone's lane fail when missing; a porte-cochère, a daycare
lane and pump lanes are judged where drawn. `queues.apart`: the bus loop's and the parents' centre lines at least half
their widths apart. `queues.clear` (round 2) covers the new lanes; a pump lane is judged against the parking and the
street only (it stands on the forecourt's own drive lanes). `site.grounds-dry`: a type's play yard, field or court not on
a detention pond. The run's ranking (lib/layoutrun.mjs rankKey) puts a layout holding more of its type's queues first and
leaves the type's own lanes out of the paving per unit it compares.

**A zone parks at its own type's rule.** Each `btZones` entry carries `rule` ({ key, v, source }, as a single type's
`btRule`): a bank zone `parkingPer1000` 4, a daycare zone its 0.2 a child as a ratio. The brief's per-use rule
(`rules.parkingByUse`, mixed-use parking's own, item 33) takes it: lib/layoutbrief.mjs briefFromProgram / typeZoneRules
rule each zone of a type by its engine use (`{ per1000, type }`; a use shared with a zone of no type is left alone), and
under a city's rules lib/layoutrun.mjs governingParking does the same with the city's count reserve. The engine lays the
zone's stalls out for it (toEngine `opts.parkF`, which may now go below 1 for a type: the bank pad at 0.4 of the
restaurant default) and the check counts it (quantities per1kOf). "a daycare and a bank on pads in front of townhomes":
179 spaces required, not 193 (the bank at 4 a 1,000 sf, not a restaurant's 10).

**A hotel over the shops asked.** "a 120-key hotel over 8,000 sf of retail": the shops are the 8,000 sf (shared over the
hotel's buildings by footprint, `ground.sf`; lib/siteplan.mjs groundOf and the check's quantities read it), the rest of
the ground floor the hotel's lobby; the keys stay those of the floors above (120). None asked: the whole ground floor, as
before.

**Numbers.** The Pro forma section's area table lists beds, children, students and storage units under the areas (keys
were already on the hotel's row), as the Numbers panel and the CSV do.

**Bench.** New cases TY-daycare-dropoff (ty46, 500 × 400 ft), TY-hotel-porte (ty62), TY-hotel-retail-sf (ty55),
TY-gas-queue (ty23). Changed as intended: TY-school (both lanes, the field moved off the pond), TY-daycare (its play yard
fenced; no room for the lane on 2.3 ac, said), TY-mix-pads (the bank's drive-thru, the daycare's fenced play yard),
TY-hotel-retail (the layout with the porte-cochère now ranks first). Folded onto mixed-use parking (00f842a): MX-guard-hotel25 and MX-angled gain the hotel zone's porte-cochère; TY-mix-pads parks its zones by type (181 / 179, was 199 / 193); 84 cases, all passing, no warnings.
