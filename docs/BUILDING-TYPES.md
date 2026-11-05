# Building types: inventory and the primitive model

Nov 4 2026, branch `matthew/building-primitives`; round 2 Nov 5, branch `matthew/building-types-2` (section 6). Concept
planning only. Code: `lib/btypes.mjs` (types), `lib/btsite.mjs` (the site features a type needs); tests: `test/btypes.mjs`,
`test/btnumbers.mjs`; bench: the `TY-` cases in `scripts/layout-bench-v2.mjs`; engine notes: docs/LAYOUT-ENGINE.md items 27
and 29.

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

## 5. Not done yet (after round 2)

- School bus loop and parent drop-off queue, daycare drop-off lane, hotel porte-cochère, gas-station canopy queue check:
  not drawn (section 6 says why and what the check covers instead).
- The car wash's stacking lanes need a drive within 90 ft of a short end of its plot: on 1.5 acres the engine's plot can
  come out with none, and the lanes are then left off and the queue check fails (TY-carwash moved to 2.3 acres).
- A bank laid out as a zone of a mixed plan has no drive-thru lane (the mixed engine's pads draw buildings only); a
  zone parks at its use's own rule (one parking rule a plan in the brief and the check): a bank zone at the restaurant
  rule, over-parked.
- Recipe types as zones (a daycare's play yard, a school's fields) are drawn as the building alone.
- The AI's program step does not name presets yet (another helper is adding them to the prompt).
- Ground-floor uses other than shops under homes or a hotel; a hotel over shops sized from the hotel's footprint (the
  shops are the whole ground floor, not the sf asked; the notes say so).
- Single-story drive-up storage on small lots can trip the fire-truck turning warning on its drive aisles (the storage
  layout's own, seen without the preset too); not on the bench.
- The Pro forma section's own area table does not list beds, children, students (Numbers and the CSV do).

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
