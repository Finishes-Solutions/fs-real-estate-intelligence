# Building types: inventory and the primitive model

Nov 4 2026, branch `matthew/building-primitives`. Concept planning only. Code: `lib/btypes.mjs`; tests:
`test/btypes.mjs`; bench: the `TY-` cases in `scripts/layout-bench-v2.mjs`; engine notes: docs/LAYOUT-ENGINE.md item 27.

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
garden stack, L, U, courtyard (O), T (drawn as L), tower on podium, point tower (drawn as tower on podium), wrap,
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
floors, 3 a 1,000 sf, named "Trampoline Park A", and the notes say no type matched and what was assumed. A T-shaped
building is drawn as an L and says so; a stand-alone parking garage (not drawn yet) says so.

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
| Small multiplexes | plex → duplex buildings | units | engine 2 a home | duplex | "fourplex", "triplex", "quadplex", "missing middle" | engine (drawn as duplexes) |
| Live-work townhomes | row → townhome rows | units | townhomes | livework | "live-work", "shophouse" | estimate (work space) |
| Flex with mezzanine | flex bays → flex, depth from words | sf + mezzanine sf | engine flex | flex | "flex … N ft deep", "mezzanine", "40% mezzanine" | estimate |
| Cold storage | big box → warehouse with truck court, 45 ft | sf | 0.3 / 1,000 | cold | "cold storage", "refrigerated warehouse", "freezer" | estimate |
| Data centre shell | big box → warehouse, no truck court, 32 ft | sf | 0.2 / 1,000 | datacenter | "data center", "hyperscale", "colocation" | estimate |
| Fitness club | big box → one retail building, 200 ft deep | sf (40,000 default) | 5 / 1,000 | fitness | "fitness center", "gym", "health club" | estimate |
| Big-box store | big box → one retail building, 300 ft deep | sf (120,000 default) | 4 / 1,000 | bigbox | "big box", "supercenter", "home improvement", "wholesale club" | estimate |
| Bank with drive-thru | drive-thru pad → restaurant pad with lanes | sf (3,500 default) | 4 / 1,000 | bank | "bank", "credit union" | estimate |
| Daycare | building with grounds → custom recipe: building + play yard | children (50 gsf each) | 0.2 a child | civic | "daycare", "child care", "preschool", "early learning" | standard (35 sf usable a child, licensing) / estimate |
| School (elementary / middle / high) | building with grounds → building + play yard + field | students (125 / 140 / 155 gsf) | 0.12 a student (0.3 high) | civic | "elementary/middle/high school", "charter school" | estimate |
| Express car wash | tunnel → custom recipe pad, 130 × 32 ft | sf, vacuums | 20 a tunnel (vacuums) | carwash | "car wash", "express wash" (not with a gas station) | estimate |
| Stand-alone parking garage | garage | spaces | — | — | "parking garage, 600 spaces" alone | unsupported: said so |

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

## 5. Not done yet

- Types per zone of a mixed request ("a hotel with 120 keys and 20,000 sf of retail": the zones keep the engine's types).
- The AI's program step does not name presets yet (it can still write custom recipes); the editor has no preset picker.
- Fourplex and triplex footprints of their own (drawn as duplexes); a T drawn as such (drawn as an L); point towers apart
  from the podium tower (drawn as tower on podium); the cluster-of-pads primitive has no preset of its own yet (custom
  recipes with several buildings use it).
- A stand-alone parking garage; a full-service hotel; ground-floor uses other than retail under homes; hotel over retail.
- Car wash stacking lanes, bank queue length, school bus loop and drop-off, data centre equipment yard: not drawn.
- Single-story drive-up storage on small lots can trip the fire-truck turning warning on its drive aisles (the storage
  layout's own, seen without the preset too); not on the bench.
- The pro forma and Numbers panel read uses, not presets (a hotel by keys already; beds, children, students only in the notes and labels).
