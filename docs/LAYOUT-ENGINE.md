# Layout engine: reproducible runs, independent checks, reference templates

Status of the site layout engine after the Nov 3 2026 work on branch `matthew/site-engine-update-110326`.
Concept planning only: nothing here is survey-grade, engineered or permit-ready.

## 1. Baseline (before this work, measured on commit 50c0f1b)

| Finding | Evidence |
|---|---|
| Runs were not reproducible: every piece got a `Math.random()` id, and the searches stopped on wall-clock budgets (`Date.now()`) | The same 21-acre homes request made 141–193 clock reads and 24,665–26,672 random draws run to run on a loaded machine; ids changed on every run (drift script, Nov 3) |
| Quantities had no meaning: "at least 150", "up to 300" and "200 to 240" were all read as one number, then the site was filled by default | `guessProgram` output; review item 7 |
| Apartment units came from floor area (`floor(gfa × 0.85 ÷ 900)`), not a building schedule | `lib/siteplan.mjs` `unitsOf` |
| Options were returned that failed their own parking check (e.g. "3 spaces short of 356") | engine notes on a 10-acre, 200-unit request |
| No independent validation: the engine's own `check` judged its own output | — |
| "28,000 sf retail" gave 34,400 sf; a 250,000 sf warehouse came back over size; a flex apron stopped 2 ft short of its drives (disconnected); "a 40,000 sf anchor, 80,000 sf total" read as 120,000 sf | before column of the benchmark below |
| Pre-existing test failures (fail on the base commit too) | `test/layoutasks.mjs` (pads on any use; the townhome commons check), `test/streetnet.mjs` (street bend 30 vs 60 ft) |

## 2. The contract

```
request (words, or the AI's program) → rei.brief/1 (typed, validated)   lib/layoutbrief.mjs
  → canonical brief + input hash (sha256 of the canonical JSON)          lib/sha256.mjs
  → deterministic engine run (seeded generator, virtual clock)           lib/enginectx.mjs, lib/layoutrun.mjs
  → building templates (whole modules; units from the schedule)          lib/bldgtemplates.mjs, lib/reftemplates.mjs
  → independent validation of every option                               lib/layoutcheck.mjs
  → ranked options + outcome + run record (replayable)                   lib/layoutrun.mjs
  → edits as typed transactions (replay / undo)                          lib/layoutedit.mjs
```

- **Brief** (`rei.brief/1`): the site in a local plane in feet (x east, y north of `origin` lon/lat; metres converted with
  0.3048 m/ft), boundary, holes, exclusions, front/street edges, allowed access edges; uses with a form and a quantity
  `{ mode: exact | min | max | range | maximize, value | min/max, unit: units | sf | buildings }`; overlays (senior,
  student, affordable: recorded, no rule change unless the brief carries rules); parking mode; rules with value, class
  (`verified` or `assumption`) and source; locks; solver seed, tick and option count. The original wording and parser
  are kept but not hashed. A number with no qualifier is **exact**.
- **Replay**: a run record holds the canonical brief, versions (engine, validator, capabilities, templates, schema),
  input hash, seed, tick and evaluation counts. `replayRun` re-runs from the brief alone (no AI, no network) and
  compares outcome, geometry hash, quantities, check results and ranking.
- **Determinism**: inside a run, `rand()` is mulberry32 from the seed and `now()` is a virtual clock that advances
  `tickMs` (25) a read, so the engine's time budgets become evaluation budgets. Outside a run the app behaves as before.
  Stable ids come from the seeded generator; ranking ties break on the geometry hash.
- **Precision and tolerances**: stored geometry 0.01 ft; containment 0.5 ft; pieces touching 1.0 ft; overlap 1 sf;
  locks 0.01 ft; exact square footage 1%; exact units 0. Drive aprons may cross an allowed street edge (≤ 40 ft into the
  right-of-way). Numerical precision is not survey accuracy.
- **Outcomes**: feasible (best found, not proven optimal) · needs-review (no failure, some checks unknown) ·
  no-feasible-found (search budget, not a proof) · proven-infeasible (only when the footprint alone at the most floors
  exceeds the land inside the setbacks) · unsupported · missing-information · invalid-brief.
- **Hard constraints are never relaxed**: exact counts are trimmed by whole modules or homes; parking short of required
  takes modules off; locks and exclusions are checked; a form the engine can't draw is reported, not substituted.

## 3. Independent validator (`lib/layoutcheck.mjs`)

Reads only the drawing and the brief (it shares the shape decoder and the drawn stall marks with the engine, nothing
else). Each check: pass / fail / unknown / n/a, rule and basis (verified / assumption / brief / geometry), measured,
required, units, tolerance, affected pieces. Missing evidence is unknown, never pass.

| Check | What it measures |
|---|---|
| geometry.valid | finite, non-degenerate shapes; the boundary doesn't cross itself |
| site.containment | every built or paved piece inside the boundary and out of holes |
| site.setbacks.buildings / .paving | distance from each edge by its role (front/street, side, rear) |
| site.exclusions | intersection area with exclusions and keep-outs |
| overlap.level-aware | solid pieces and buildings-on-paving at overlapping elevations (z ranges); stacked uses pass |
| separation.buildings | least gap between buildings at the same level (unknown without a rule) |
| access.entrance | a drive meeting an allowed street edge; none across a neighbour's line |
| access.connectivity | one paved network from the legal entrance (graph of touching pieces) |
| access.buildings | every building within the stated distance of connected circulation |
| access.second | a second way in past 200 apartments or 30 homes (IFC Appendix D, where adopted; an assumption) |
| access.remote | the two ways in at least half the site's diagonal apart (warning, not hard: the fire official may accept emergency-only access) |
| site.trail | a walking trail through a building or parking row, or along a drive (warning) |
| parking.count | required (brief rules, else use defaults labelled assumptions) vs provided (stalls counted from the drawing, garages, driveways); garage estimates make it unknown; accessible count per 2010 ADA 208.2 reported, placement unchecked |
| parking.geometry | each drawn stall inside its row, the site, and clear of buildings |
| parking.dead-end-aisle | warning: a parking aisle's stalls run no more than 150 ft past the last drive, turnaround or lot paving joining it (item 25) |
| program.<use> | the measured quantity against the brief's meaning (a use absent from the plan is 0) |
| program.buildings | units ≥ 400 gsf each; a templated building keeps its schedule and length |
| locks | locked pieces unmoved (0.01 ft) |
| eng.detention / turning / fire-route / grading-utilities | always unknown: not designed or modelled |

Validated by hand-built layouts with known answers and deliberately broken ones (`test/layoutrun.mjs`: concave site,
setback by edge, stacked and tuck-under levels, disconnected parking, illegal access, exclusions, parking shortfall,
missing rules, quantity modes, locks, a 33° rotation, malformed pieces).

## 4. Capability matrix (`lib/layoutcaps.mjs`; MCP `layout_capabilities`)

| Family | Implemented | Partial (stated simplification) | Unsupported |
|---|---|---|---|
| Multifamily | garden (templated), townhomes, cottage / BTR, single-family lots | walk-up (garden geometry), courtyard (a continuous closed ring or U of wings, units from floor area: no reviewed courtyard template), mid-rise (template, cores not drawn), podium and tower-on-podium (massing only), duplex/triplex/fourplex (duplex rows) | tuck-under, wrap, stacked townhomes |
| Retail | inline strip, strip with pads, freestanding, restaurant pad | anchored center (can draw one box), drive-through (queue length unchecked) | — |
| Industrial | warehouse with truck court | rear-load, front-load, multi-building park | side-load, cross-dock |
| Flex | — | multi-tenant small bay (bays and office share not drawn; office share changes parking) | — |
| Mixed use | horizontal (zones, pods, tracts) | — | vertical stacking (validator supports levels; generator does not) |

"Validated" is not claimed for any form yet: the benchmark below is on synthetic sites, and no holdout family has been
reconstructed end to end.

## 5. Reference templates

From 15 reviewed projects (12 families) in the reference library; see `docs/REFERENCE-PROVENANCE.md` and
`data/reference/`. Only dev-partition evidence drives generation (`scripts/refs/templates-to-lib.mjs`):

| Engine template | Module | From | Strength |
|---|---|---|---|
| mf-garden-breezeway-3s | breezeway stack 75 × 60 ft, 4 units a floor, ≥ 2 stacks (the 24-unit, 150 ft bar) | P37, P08, P06 | multiple projects; depth 60 ft is the midpoint of the bar cases |
| mf-midrise-corridor-4s | corridor bay 50 × 65 ft, 4 units a floor, ≥ 4 bays | P28, P11 (one family) | multiple projects, one family |
| mf-midrise-corridor-5s | same bay at 5 floors | extrapolated | estimate |
| mf-garden-studio-3s | the garden stack with 6 studio / 1-bed homes a floor (~750 gsf a home) | extrapolated from the garden stack | estimate (no reviewed studio building) |

A bar up to 5% short of whole modules keeps its drawn length and counts them (the reviewed bars span 146–154 ft); bars
are never stretched. Holdout templates (Sierra Vista mid-rise, Lake Shore townhomes, Anderson podium) are for evaluation.

## 6. Benchmark (`node scripts/layout-bench-v2.mjs --base <checkout> --png`)

15 synthetic cases across the five families, the same validator judging the old engine (live, words only) and the new
runs. Table: `docs/bench/layout-bench-v2-before-after.md`; drawings: `docs/bench/layout-bench-v2.png`.

- Top option passes every measurable hard check: **13 of 15** at the end of Nov 3 (courtyard now passes; tower-on-podium
  and wrap remain); **11 of 15** after the first change; before, the first option passed in 6 of 15 (garden
  max, garden rotated, mid-rise, townhomes, duplex, restaurant pad).
- Exact quantities now land: 120 garden apartments (was short), 28,000 sf strip (was 34,400), 80,000 sf anchored
  center (was read as 120,000), 250,000 sf warehouse; flex connectivity fixed; wrap reported unsupported (was drawn as
  garden apartments).
- Replay identical: 15 of 15; `test/layoutrun.mjs` repeats three representative briefs 20 times each, identical.
- Still failing, honestly: courtyard (corner overlaps, a wing far from a drive, 132 of 150), tower on podium (199 of
  300).
- After the smallest-building fix (Nov 3, later): **12 of 15** pass; mid-rise 128 → 288 units (no more over-parking),
  mixed use now passes (320 units), garden as many as fit 168 → 180. Latest table: `docs/bench/layout-bench-v2.md`
  (no before column); the before/after table above stays as the record of the first change.

Separate measures, never one "accuracy" number:
1. **Extraction**: 50 of 63 reconciliation checks agree in the reviewed fixtures (12 discrepancies recorded, 1 unknown);
   scaled footprints ±3 ft to ±10%.
2. **Feasibility**: hard-check failures and unknowns per option (benchmark table).
3. **Design quality**: not yet scored. Observed: trimming to an exact count leaves an empty parking bay (exact-120 plan,
   284 spaces for 192 needed); anchored center drawn as one box; some options differ only by mirroring. (The mid-rise
   over-parking was fixed by the smallest-building rule.)
4. **Reproducibility**: identical hashes on replay and 20 repeats; runtime 0.1–6 s a run on the benchmark.

## 7. Edits (`lib/layoutedit.mjs`; MCP `layout_edit`; `api/layoutrun.js` mode edit)

Ops: lock, unlock, move (to 'center' = the open spot nearest the middle clear of locks and inside setbacks), keep-entrance
(by compass direction), regenerate (re-fit around locks), set-quantity, set-form, compare-forms, set-office-share, place.
Each is one transaction validated as a whole; a result that loses a hard check it passed, or moves a lock, is refused
with the conflicts and the record is unchanged. The record keeps the base brief and steps: `replayEdits` rebuilds it
exactly; `undo` replays without the last step. Words are read by a deterministic parser for the common phrasings; an
AI's edits must pass `validateEdit` (tested on captured answers).

Known limits: re-fitting around locked buildings can strand a building (then refused, as it should be); "these" needs a
selection; placement edits only reorder zones of a mixed plan.

## 8. Integration

- Website: the site plan's Numbers panel has an **Independent check** section (runs when opened).
- API: `api/layoutrun.js` (run, replay, edit, undo, caps). MCP: `layout_run`, `layout_replay`, `layout_edit`,
  `layout_capabilities`.
- Browser build and service worker include the new modules (`build.mjs`, `src/sw.js`).
- **Build** (the editor's main build, its re-solve after a settings change, and the AI's revised program) runs through
  `runPlan` (lib/layoutrun.mjs) in the page's worker (`src/sp-worker.js`, fn `run`): the editor's plan, program and search
  settings become a brief (what a size means follows the Leftover land setting: fill or phase = at least, hold = exactly),
  and each option comes back in the engine's shape with `check` (the validator's status) and `run` (input hash, seed,
  versions and the brief to replay). Falls back to the plain engine when a run can't be made. Checked in Chrome through
  the real worker: the Hockley request gives the same geometry hashes as Node.
- Not yet: "More layouts" and scenario layouts still call the engine directly; the AI program step doesn't emit quantity
  modes; exports and the pro forma read the plan as before.

## 8b. Layout repair passes in the run (Nov 3, later)

Each runs after the engine and is kept only when no hard check gets worse (`keepIfNoWorse`):
joinCourtyard (wings within 25 ft round one court tagged as one building, corner overlaps trimmed) → oneAmenityCentre
(one clubhouse and pool per 400 units) → nudgeAmenities
(pools / courts / play / trash off buildings and paving; a pool may shrink to 75%) → exactByUnitSize (untemplated exact
counts: homes 750–1,400 gross sf) → templates → trimHomes → fitParking → tidyPonds (corners under 35° cut, ≥ 90% of area)
→ pruneSurplus (unused parking rows and dead-end drives; then outer ring rows, keeping 5% spare) → addSecondAccess (pond set aside and cut back; a third way in
for fire-code spacing) → tidyPonds again → (Nov 4, item 25) aisleTurnarounds (a turnaround at a parking aisle's dead end
past 150 ft) → rowEndIslands (stalls to spare become planted islands at row ends). Exact counts ask the engine for the count first and retry with more only when
short. A bare number in Build is exact unless Leftover land was set by the user or the words.

## 9. Next tasks (in order)

1. Done (Nov 3): Build, "More layouts", the scenario layouts and the MCP `site_plan` tool all go through `runPlan`
   (falling back to the plain engine when a run can't be made). Still: the quantity-meaning choice in Build.
2. After trimming to an exact count, re-fit the parking (refit with the kept buildings pinned) so no empty bay is left.
3. Mid-rise: let shorter bars take fewer bays (min 3) or join bars; score over-parking as land waste.
4. (Done Nov 3.) Courtyard: one continuous building (lib/sitegen.mjs courtyard1), in two shapes the grid tries — a
   closed ring with the clubhouse in a 100 ft gateway in the street wing, or a U open to the street with the clubhouse
   across its mouth — wings meeting end to side (no overlaps), named "Bldg A · left / right / rear / street L / street R
   wing", the pool and deck in the court's middle, the court a planted lawn (never "future development"), the parking
   in a ring of double-loaded aisles outside, nothing paved inside. The ring is drawn at the size asked and never
   chopped (fitCount used to shorten wings apart); a ring too big to park is drawn again smaller, whole. One amenity
   centre per community removes a court's clubhouse, pool and deck together (a shared tag). Still: units are a floor
   area estimate: the library's only courtyard building (E054 Anderson Apartments, a podium U, 172 units) is in the
   holdout partition, so it can only evaluate, not drive generation; corner units, stairs and the gateway's arch over
   the walk aren't drawn. A court that gives up its clubhouse to the community's one amenity centre keeps a
   "Courtyard garden" (seating and a shade pavilion) where it stood; open land inside a court is never marked future
   development (lib/layoutrun.mjs courtGardens).
4b. Parking to the need (lib/layoutrun.mjs pruneSurplus): after whole rows no building uses, whole stalls come off the
   far ends of rows (farthest from a building first) down to 3% over the requirement; a row keeps 6 stalls or goes
   whole; the lot's paving (field) loses what was taken out and the land goes back to the open land beside it. Bench:
   every case within 4% (courtyard 248/240, was 266; garden 198/192; warehouse 155/150; pad 26/25). An option without
   the drive-thru lane asked for ranks below one with it. The validator counts a drive that runs across the street
   line (its apron in the street) as meeting it (a 1° frontage left Hockley's courtyard entry "2.001 ft" off).
5. Done Nov 4 (evaluation harness): `node scripts/refs/holdout-eval.mjs [--png]` runs the reviewed holdout projects (P35, P36
   Sierra Vista; E054 Anderson; P18 Lake Shore) on reconstructed sites and writes docs/bench/holdout-eval.md (engine vs
   as-built, with the reading). Findings to fix from dev evidence, never by fitting the holdout: on-site detention when
   the master plan drains off site (P35: 224 -> 355 units with it off); as many as fit below an exact count that fits;
   one frame on a wedge site (P36: 1 building of 3); no compact urban podium-courtyard / wrap form and the 60% tower
   share (E054); no fee-simple townhome-lot product and an exact townhome count below the maximize result (P18).
5a. Done Nov 4: stormwater as a brief input — `site.stormwater: 'onsite-pond' | 'underground' | 'offsite'`, read from
   the words ("regional detention", "detention handled off site", "drains to the regional pond", "underground detention",
   "no pond") or the plan's Settings storm mode, mapped to the engine's storm mode ('offsite' -> none: no pond, no vault);
   the detention check's note says it's an assumption to confirm with the civil engineer and the drainage district.
5b. Done Nov 4 (root cause, replacing the probe ladder): which counts passed jumped with the count asked (P35 with
   detention off the surface: 330 and 341 short where 350 and 355 passed; as many as fit 304). Three causes, fixed in
   the engine: (1) the generator (lib/sitegen.mjs generate) sat out when no count was asked (an `edgesOnly` mode that
   returned nothing on a whole lot, and a "too few of the count" rule that rejected every layout against an infinite
   target), so as many as fit only saw the search's layouts; it now runs its rows (the amenity by the entry, every side
   cut, one or two entrances; courtyards and loops left to the arrangements that ask for them), each drawn full and
   parked down, and a row layout well under the best so far isn't finished (its landscape is the costly part); (2) the
   generator's bars ignored the template's building sizes the run sets (depth, whole modules, the smallest reviewed
   building), so its denser layouts were 60 ft deep, 110-150 ft long buildings no template fits, their units estimated
   from floor area: exactly 355 on P35 and the wedge's 96 / 111 were such layouts. They are now drawn to the template, and
   the validator warns (program.template) on any apartment building no template fits; (3) as many as fit ranks the
   search's stacks by a rough estimate (parkable footprint at the frame's average width), so on a skewed lot (under 80%
   of its frame's box) 6 stacks are laid out, not 3 (P36's 128-home stack ranked 4th). With the template honoured P35's
   most is 320 (exactly 320 passes, 336 doesn't; as many as fit 320 in ~0.6 s, was 6.5 s with the ladder); P36 128.
   The exact-count ladder (probeUp) is gone. The generator's rows still draw square aisle corners and a plain entry (the
   run adds curb returns where a turn needs them), and a generated layout re-fits from its recipe (moved pieces go
   back); it sits out when Settings choose U or L buildings.
6. Done Nov 4: tuck-under (6e, from E053), cross-dock (6c) and vertical mixed use (6d), each with its own geometry and tests.
6c. Done Nov 4 (cross-dock, partial). "A cross-dock warehouse" (form ind-cross-dock; the engine program's `crossDock`)
   draws lib/sitegencom.mjs crossDock: a deep building running back from the street (400-600 ft across, its length the
   floor area over that), dock doors at 12 ft centres on both long walls (`docks` on the building, marked on the sheet),
   a truck court each side (the apron against the dock wall, 55 ft trailer stalls along the outer edge, 130-185 ft in
   all, the trailer stalls striped and counted), the employees' car park across the front with its own Main entry, and
   the trucks on their own drives up both sides from their own entrances (Entrance 2 / 3, `trucks`), joined behind the
   building. Its layouts lead the plain warehouses when the words ask for one. The validator measures it from the
   drawing: program.<use>.crossdock (truck court at least 130 ft deep along both long walls, hard), .trailers (about
   one stall for every two doors, a warning) and .trucks (no truck piece or truck drive touches car parking, hard).
   Bench IN-crossdock: 400,000 sf, 245 / 240 spaces, 130 trailer stalls. Still: no truck turning paths (no design
   vehicle), clear height a default, no guard house.
6d. Done Nov 4 (vertical mixed use, partial). "A 5-story mixed-use building with 20,000 sf ground-floor retail and 200
   apartments above" (form mx-vertical, VERTICAL_WORDS in lib/layoutbrief.mjs) becomes one program (multifamily,
   arrangement 'vertical', groundRetail sf, floors with the shop floor counted). lib/sitegen.mjs verticalOf draws one
   double-loaded building along the street: a stretch drawn to the shops' floor area carries `ground: { use: 'retail',
   floors: 1 }` (shops below, apartments above), the rest apartments on every floor; the pieces share a `mixed` / `court`
   tag (one building). A drive down each end to a shared surface field behind, each use parked at its own ratio (no
   shared-parking reduction). Every consumer reads `ground` through lib/siteplan.mjs groundOf: metrics (units, parking,
   leasable), the validator (byUse retail gfa from the ground floor, the building's use the floors above; levels with a
   16 ft shop floor), the tally, labels ("20,000 sf retail + 75 units · 5 fl"), the sheet (a storefront band in the
   shops' colour along the street face), the map and massing (a taller shop floor, glass storefronts), the pro forma.
   Bench MX-vertical: 200 units, 20,000 sf, 409 / 400 spaces. Still: no garage option, the shops' loading / trash and
   the residential lobby aren't drawn, units from floor area (no reviewed vertical mixed-use template).
6a. Done Nov 3 (wrap, partial). "A wrap building" (form mf-wrap, program arrangement 'wrap', 5 floors unless the words
   say) is drawn by lib/sitegen.mjs wrapOf: one double-loaded building (65 ft wings: a street wing the full width, a wing
   down each side) on three sides of a parking garage, an amenity courtyard with the pool between the street wing and the
   garage, the garage's back face on a back drive (its entrance) that runs round to the street both sides, and a visitor
   row along each side drive. The garage (kind 'garage', grid: true) is counted on the podium stall grid
   (lib/siteplan.mjs garageGrid; the validator's own podiumGrid), on the fewest levels that park the homes less the
   visitor rows, and its depth cut back so it doesn't over-park (the courtyard takes the rest). Wings and garage share a
   wrap / court tag: one building. No overshoot for a wrap (it's drawn to the count). Bench MF-wrap: 300 units, 492 / 480
   spaces (444 garage, 48 surface). Still: no drawn garage plan (ramps, cores), units from floor area (no reviewed wrap
   template), a four-sided wrap (the garage enclosed, entered through a portal) not offered.
6b. Done Nov 3 (podium parking). A tower on a podium (form "tower", 4+ floors of apartments) parks on its podium:
   podiums are 128 ft deep (two double-loaded 60 ft modules inside 4 ft walls, lib/siteplan.mjs PODIUM) and 150-340 ft
   long; their stalls are counted from a drawn garage plan (lib/siteplan.mjs garagePlan: 9 ft stalls in rows between a
   24 ft cross aisle at each end, 12 stalls a level for the ramp at the entrance's end of the back row, two stair /
   elevator cores of 3 stalls under the tower, the lobby's 9 stalls of the street-side row on the ground level, columns
   every 3 stalls), not by area: a 240 x 128 podium holds 62 a level, 53 on the ground. The run puts the lobby on the
   long face nearer a street and the garage entrance on an end or the back face where a drive reaches it (a 24 ft
   "Garage entry" drive out to the network where none meets it, across a parking row only when it must, cutting just
   the stalls under it: lib/layoutrun.mjs garageEntries); the validator fails a podium garage no drive reaches
   (access.garage, hard). The plan sheet draws the ground level (stalls, ramp, cores, columns, lobby, the way in) under
   the dashed tower; the 3D view shows the parking levels' open sides as dark bands. The fewest podium levels that park the tower's homes are
   parking (`parkLevels`, written on each building by the run, lib/layoutrun.mjs podiumLevels), the rest homes; the
   tower is 60% of the podium (PODIUM.towerShare, an estimate: no podium project in the reviewed library). The search
   is told up front: the program's footprint is the podiums' (wantFoot / towerAf) and a footprint's surface need is net
   of its podium (mfPer), so it lays only the surface rows the podiums leave short. The validator counts the podium on
   the garage plan (lib/layoutcheck.mjs podiumGrid) from the declared levels and the drawn tower outline. Bench MF-tower:
   300 units, 490 / 480 spaces (327 podium, 163 surface). Still: ramp slope and clear heights, structure and ventilation
   aren't designed, and the generator's courtyard / loop layouts are not offered for towers.
7. Done Nov 4 (turning, planning level): the brief declares `designVehicles` (assumptions with sources: P, SU-30 and
   WB-67 from the AASHTO Green Book 2018 Table 2-2a, the fire apparatus at 30 ft inside / 50 ft outside, 20 ft clear,
   IFC 503.2.1 / 503.2.4 / D103). lib/turning.mjs finds the turn sites on the drawing (every bend of a drive along a
   path, every inside corner where two square drives meet at right angles; a turn and its reverse are one site) and a
   turn passes when some centre lets the vehicle's band Ri..Ro, swept through the turn, stay on the paving as drawn
   (within 1 ft), the band developing over the first and last quarter of the turn (the inner wheels and a trailer cut in
   gradually, roughly as AASHTO's templates do); the near 24 ft of the street beside a street edge counts as paving. The
   validator (lib/layoutcheck.mjs): `access.fire-width` (hard: every two-way drive 20 ft clear; a one-way drive-thru lane
   isn't a fire lane), `access.dead-end` (hard: a dead end over 150 ft on the fire route without a turnaround, IFC
   503.2.5 / D103.4; the network includes the aisles, but a parking aisle stopping at a row's end isn't reported),
   `eng.turning.fire` (the fire route: drives that aren't parking aisles or one-way lanes; n/a where every building is
   within 150 ft of a street), `eng.turning.car` (every turn), `eng.turning.service` (SU-30 on service drives) and
   `eng.turning.truck` (WB-67 on the truck court and the drives into it), all non-hard. The run rounds a too-tight
   corner with a curb return (lib/layoutrun.mjs curbReturns: radius 25-60 ft, out to the street where it meets one;
   a parking row in the way gives up whole stalls at its end, never a third of it, and only while every check holds).
   Garages (lib/siteplan.mjs garagePlan rampSpec, GARAGE_H): 8 ft 2 in clear on the ground level (2010 ADA 502.5), 7 ft
   above, floor to floor 11 / 10 ft; the ramp a speed ramp at up to 16% with 12 ft transitions at 8% (or a parking ramp
   at 6.67% where long enough), its length from the rise; `eng.garage-ramp` (non-hard) checks it fits, and the sheet
   labels the ramp. Still: no swept-path software (a multi-point turn is never assumed), fire route distance
   (`eng.fire-route`) not measured, garage structure / ventilation / drainage not designed, detention from topography
   needs engineering inputs.
8. Done Nov 3 (two ways in apart). With two ways in needed (`program.entrances` 2: over 200 apartments or 30 homes,
   "at least N" counted at what the land holds), the search lays a second driveway with the layout at the far end of
   the first aisle (lib/sitelayout.mjs attempt, `entry.two`), and also tries the main entry near either end (0.18 / 0.82
   of the frontage); one of the options keeps an off-centre entry that leaves a spot half the site's diagonal away. The
   validator ranks the option that meets the spacing first (bench MF-garden-rot: 336 units passing, 372 with the warning
   as option 2). Still: a 330 ft frontage can't meet it from one street (MF-townhomes) and the mixed-use pods don't try.
9. A pond left in the land held for later (a compact first phase) moves beside the work it drains
   (lib/layoutrun.mjs pondBesideWork), its old outline given back to the land round it.
10. Exact floor areas: shop, office and warehouse boxes record the area drawn before their sides are stored at 0.01 ft;
   the validator and the drawing (lib/siteplan.mjs gfaOf) take it while the outline agrees.
11. Anchored centers: the anchor at the size asked (validator `program.u1.anchor`) and the rest in shops.
12. Done Nov 3: emergency access lane (lib/layoutrun.mjs addEmergencyAccess) as the fallback second way in where no
   real entrance fits far enough away (a 20 ft gated fire lane; IFC D106.3 / D107.2; an easement where it meets a side
   or rear line); real entrances always rank first. The pods engine now places two real ways in apart.
13. Done Nov 3: a playground left on its own moves beside the homes (playNearHomes); townhome rows shared evenly along a
   stretch; sheet labels alike within a use; massing pictures in feet (were metres read as feet).
14. Nov 4 (evidence): courtyard, wrap, courtyard-on-podium and vertical mixed-use homes are counted at the reviewed
   dev corridor buildings' gross area a home (lib/reftemplates.mjs REF_CORRIDOR: P28, P11, P33, 1,028 gsf), the
   tower's plate is the reviewed share of its podium (REF_PODIUM: P25 0.53, E028 0.66, mean 0.593), a single
   podium level has no ramp (P25), and a wrap's garage keeps only the spaces it needs on its top level (the rest
   storage and amenity, with a 60 ft pool court where a level more allows). See docs/REFERENCE-PROVENANCE.md. Still
   open: no dev courtyard or wrap building and no dev corridor deeper than 65 ft (the 83 ft holdout bar), so those
   shapes and P35's depth stay unevidenced; garage structure and ventilation aren't designed; detention from
   topography needs engineering inputs.
15. Done Nov 4 (tuck-under, partial). "Tuck-under apartments" (form mf-tuck-under, arrangement 'tuck', 2 floors unless the
   words say): rows of homes each over its own 1-car garage (template mf-tuckunder-2s from E053 Portland Road, dev: 20 ft
   bays, 42 ft deep, garages 11 x 22 ft on an internal drive), back to back in pairs across 24 ft garage courts, two side
   drives in from the street, guest rows along them (inner rows and a back drive where the outer rows are short), the
   clubhouse by the entry; one home a bay, so counts are exact. The validator counts the garages a row states, capped at
   what fits along it (11 ft each). Bench MF-tuckunder: 120 units, 198 / 192 (120 garages). Still: 3 floors and rows of
   5-6 homes are estimates (the reference row is 4 homes, 2 floors); aprons aren't counted; 3D shows plain massing.
15. Done Nov 4 (townhomes): an exact townhome count lands in rows of at most 6 on lots of their own; a count more than
   the lots hold gives the most that fit, on lots, unless a shared rental court holds more homes and parks them (the
   court no longer takes the generator's bars, which ran 11 homes long). The validator flags a row over the brief's
   `townhomeRowMax` (default 6, an assumption) as `program.rowlength`. A home trimmed off a row (to the count, or for a
   guest bay) takes its lot and driveway with it. For-sale words ("fee simple", "for-sale", "townhome lots", "with
   garages") keep townhomes on lots, never the court; "front-load" / "driveways" draws the E053 Portland Road row
   (lib/reftemplates.mjs th-frontload-row-2s, dev evidence: 20 x 42 ft homes, 2 floors, a one-car garage, a 20 ft
   driveway apron each, rows of 3 to 6), parked one in the garage and one on the driveway (`garagePer`, counted alike
   by the app and the validator). Holdout P18 (evaluation only): exactly 82 was 33 homes in 11-home bars, now 59 on
   lots in rows of at most 6 (82 don't fit the 6.15 ac rectangle with the engine's pond and guest parking).
15. Done Nov 4 (holdout findings 3 and 4, partly):
   - Irregular lots (lib/sitegen.mjs alongEdges): on a lot under 80% of its frame's box, the generator also lays a strip
     of bars along each of the 2-3 longest lot lines, each squared to its own line (runs of edges turning under 30° are
     one line, so a curved street drawn as chords counts; a line bowing into the site starts the strip past its deepest
     point), 1-3 parking bays a strip, strips clear of each other, aisles joined, the entry square in from the street,
     the clubhouse in the land between; "as many as fit" runs it too (target from the land). A bar gives way where a
     strip can't park it. Bench MF-wedge-midrise (a 1,100 x 420 ft triangle): 96 units passing (the one-frame rows: 80).
     P36 Sierra Vista WB-32 is unchanged at 96 / 192: on that thin wedge the parking, not the frame, binds (each strip
     parks one bay); the gap is now the next step (parking fields in the land between the strips).
   - Courtyard on a podium (lib/sitegen.mjs podiumCourt, form mf-podium-courtyard: "courtyard on a podium", "5 over 2"):
     one podium over most of the buildable land, 1-3 levels (as the words say, else the fewest that park the homes, the
     podium's depth searched for the least over-parking), the floors above a U of 65 ft wings round the amenity deck
     (lib/siteplan.mjs towerOutline, upper 'U'), a side drive to the garage and fire lane. Offered when asked, and for a
     tower-on-podium request on a lot under 3 ac (where the search's towers can't hold the count; the fill step's cut of
     the count is undone for it: opts.askedUnits). E054 Anderson (urban run): 172 / 172 passing (was 136, failing), but
     255 spaces for 210 (two full podium levels under the U). Units are a floor-area estimate (no dev reference).
   - A wrap the site can't hold says so in each option's notes (and points to the courtyard on a podium); the least
     courtyard in a wrap is 40 ft (was 50). E054's 1.87 ac still holds no wrap: its garage would park too few past the
     ramp and cores.
   Nov 4 (later): wedge strips park more and podium courtyards park to the need. (a) A strip takes the most bays (up to
   the try's) that still leave a run for a bar, and each strip off the street gets up to three further bays on its
   inner side, each as long as the land there allows (the wedge widens away from its point), reached by a drive across
   each of its ends; such a bay is a leaf (`bayGroup`): when trimming to the need leaves it no rows, its aisle and
   end drives go too (no empty paving). Pieces of a row cut by a drive keep at least six stalls. On a lot under 65% of
   its frame's box the strips are judged against the other layouts, not the footprint estimate (an L-shaped lot keeps
   the gate: its rows do better there). Bench MF-wedge-midrise 111 -> 204 units; holdout P36 128 -> 152 (all four
   runs; reference 192). (b) lib/layoutrun.mjs podiumTrim: a podium whose last parking level would over-park keeps only
   the spaces still needed on that level (`parkLast`; the rest is amenity, leasing and storage), counted the same way
   by the plan and the check (lib/siteplan.mjs podiumLevelSum). E054 podium-urban 255 -> 210 / 210; MF-tower 487 -> 480.
   Still: the ground-level garage drawing doesn't show a partial level; the apex of a wedge stays open land; P36 is
   parking-bound (174 spaces for 152 homes) where the reference parks 217.
16. Done Nov 4: open or enclosed garage (eng.garage-vent, non-hard; lib/siteplan.mjs garageOpenness, IBC 406.5.2): each
   garage's walls that face the open air (no building or garage within 3 ft), openings between a 42 in spandrel and an
   18 in beam, a podium's lobby closing its length of the ground tier; open when each tier's openings are at least 20%
   of its wall area and 40% of its perimeter on two or more sides, else mechanical ventilation (IMC 404) and sprinklers
   (IBC 903.2.10). Recorded on the garage (`openness`) and in its note. Schematic, not an engineered design.
17. Done Nov 4: corridor buildings as deep as the request says ("83 ft deep corridor buildings", "deep corridor bars":
   66-95 ft, use.depth in the brief, an assumption): the reviewed mid-rise bay drawn that deep (lib/bldgtemplates.mjs
   templatesFor, a derived template `<id>-d<depth>`, evidence_strength 'user-chosen'), the same homes a floor, each larger;
   the buildings and program.template say it's deeper than any reviewed corridor building. Default unchanged.
   Evaluation (holdout, nothing fitted): P35 fill with off-site detention 320 at 65 ft, 272 at 83 ft; P36 128 either way.
   Deeper bars don't raise the count here because the bay keeps its homes a floor; the as-built 64-plexes are about 30 ft
   a home across, wider than the reviewed 25 ft bay (a wider-unit corridor bay needs dev evidence too).


18. Done Nov 4 (detention estimate). With the design storm's rainfall known, detention is a planning-level hydrologic
   estimate (lib/hydrology.mjs detentionTR55): NRCS TR-55 chapter 6 storage, the post-development runoff volume by curve
   number (TR-55 Table 2-2a: impervious 98, open space and meadow by soil group, C assumed) times Vs/Vr from qo/qi (Table
   6-1, type III), qo/qi approximated by the rational coefficients before and after. The impervious share is the drawn
   plan's own (roofs, paving, pools over the land less ponds and land held for later), else the use's typical one. Rainfall:
   NOAA Atlas 14's point estimate (api/rainfall.js, PFDS, cached; the app and the MCP site_plan tool record it on the plan's
   params.storm.rain, so a run and its replay use the same number), else a regional Atlas 14 Vol. 11 figure (upper Texas
   coast 15 in, central / east Texas 11.5 in, 100-year 24-hour), else the rule of thumb as before. A rule sheet's ac-ft an
   acre, or a region's district minimum (Harris County about 0.55, an assumption), is a floor. eng.detention now passes or
   fails the pond against it (never hard), its note naming the method, storm, CN and C values and the source; a
   deeper-pond option is judged at the depth it assumes. Still an estimate: no time of concentration, outfall or
   tailwater, and the pond depth is not yet read from the terrain.
19. Nov 4 (wedge sites, synthetic cases only). Bench: nine WEDGE cases on four synthetic wedges (a 6.1 ac right triangle,
   a 5.3 ac wedge whose back line curves to a point as chords, a 5 ac trapezoid narrowing to 60 ft, a 5.2 ac triangle
   fronting its hypotenuse), at the default 1.6 spaces a home and at 1 a home (the brief's rule). Finding: at 1.6 the
   strips are parking-bound (one or two bars is what their bays park); at 1 a home the strips held a third bar (208-240
   homes) but the one street can't give two ways in half the diagonal apart, so the full layout needed the gated
   emergency lane, which ranks below real entrances, and a two-building layout (160) won. lib/sitegen.mjs generate
   (edgeTry): as many as fit, a strips layout a little past SECOND_WAY_AT (200 apartments, IFC D106.1) is also offered
   cut back to 200 by whole modules, longest bar first, and isn't dropped as "fewer than the best so far". WEDGE-tri-1pk
   160 -> 192 (3 buildings, every check passing, no lane). Tried and dropped (no measurable gain on these wedges): bars
   along both lines facing one stepped parking court, bars carried past a strip's bays toward the point, a second
   entrance from the strips, a pond sized to the drawn plan's own detention. Holdouts unchanged (P35 fill-ug 320, P36
   fill 128, E054 podium-urban 172, P18 fill 58); P36 is still one building.

20. Done Nov 4 (townhome packing). "Townhomes, as many as fit" packed loosely: short rows of 3-5 with wide gaps, block
   ends and loop corners empty (5 ac: 37 homes in 8 rows). Measured on our own synthetic subdivisions (bench TH-sub5,
   TH-sub8, TH-deep4, TH-corner6, plus the existing townhome cases); holdouts only as a non-regression check. Causes and
   fixes: (a) rows stood 20 ft apart, not the brief's building separation (10 ft default): the brief's
   `buildingSeparation` now goes to the engine (`params.homeGap`); (b) every cross drive held rows 32 ft off at the loop's
   corners: 14 ft (12 ft off an inner cross drive) when filling, the curve's own outline still kept clear (a count asked
   for keeps the roomier corners, and a count past what fits is laid out as many as fit); (c) the main entry held the row
   across the first lane 14 ft off its end, emptying part of that row: now 14 ft off its sides only; (d) guest stalls
   took a home or two off nearly every row (each 2-3 stalls owed): the strip at a row's end now takes as many stalls as
   fit, the spare counted toward the next rows, and homes give way only once 6 are owed; (e) the pond drawn in its
   reserve came out short (a strip at the end loses its edges to buffers and banks), so the densest tries were warned on
   detention: such a try is laid out again with the reserve grown by the shortfall (twice at most); (f) packed rows can
   leave no stretch of street for the second way in, and the run fell back on an emergency lane: under as many as fit
   (or up to), the row nearest a street and farthest from the ways in gives way, with its lots and driveways, for a
   real entrance (lib/layoutrun.mjs homesGiveWay). Bench (top option, all passing, no warnings): TH-sub5 37 -> 62,
   TH-sub8 73 -> 104, TH-deep4 29 -> 44, TH-corner6 54 -> 77, MF-townhomes 57 -> 74, MF-townhome-lots 119 -> 136,
   LOT-flag-th 122 -> 139; front-load on 10 ac 98 -> 130; other cases unchanged. Holdout check: P18 fill 58 -> 66,
   exact 58 -> 71; P35, P36, E054 unchanged. Still: no rows facing the loop's outer legs, guest parking only in row
   gaps (no parallel stalls along a lane), and 3-home rows remain where a stretch is short.

21. Done Nov 4 (townhome outer rows). The three gaps item 20 left, measured on the same synthetic bench cases (holdouts
   only as a non-regression check): (a) guest parking: parallel stalls (8 x 22 ft) along the cross drives' sides, where
   only row ends face (the inner side at a loop's corner, past the curve; clear of the entry's throat; rows 5 ft off),
   each counted toward the guests owed, so rows stop giving homes to 90° bays between them; accessible stalls still go to
   a 90° row where there is one (lib/sitelayout.mjs layoutStack 7b, lib/siteplan.mjs accessible); (b) rows outside the
   loop's legs: where the strip between a leg and the lot line holds the apron, a 40 ft row and the setback, rows turned a
   quarter face the leg along its straight run (legRows); every try is also laid out with the legs pulled in that far
   from the lot lines (spec.legInset; no row then runs past a leg's outer edge, where its garages would face lawn) and
   kept as a try of its own where it holds more homes; (c) a lot packed to its side and rear lines left no straight way in
   for the emergency lane: as with the second entrance, the smallest row near a lot line gives way for it
   (lib/layoutrun.mjs rowGivesWayForLane). 3-home rows mostly went with the 90° bays. Bench (top option, all passing, no
   warnings): TH-sub5 62 -> 68, TH-sub8 104 -> 113, TH-deep4 44 -> 53, TH-corner6 77 -> 83, MF-townhomes 74 -> 79,
   MF-townhome-lots 136 -> 151, LOT-flag-th 139 -> 147; other cases unchanged. Holdouts: P18 fill 66 -> 77; P35, P36,
   E054 unchanged. Tried and taken out: parallel stalls along lane edges no home fronts (with the bays between rows
   dropped) and choosing the number of cross drives by how whole rows fill the blocks between them: both moved second
   entrances onto the pond and cost more homes than they gained. Still: the densest tries often fall short of the validator's
   detention check and rank below (TH-sub8 125, LOT-flag-th 167).

22. Done Nov 4 (townhome ponds). Under "townhomes, as many as fit" the densest tries lost on detention (TH-sub8 125 homes
   with its pond at 85% of the estimate lost to 113; LOT-flag-th 167 at 85% to 147). Diagnosed on the bench cases
   (holdouts only as a non-regression check), three causes, none of them the reserve being clipped by rows or legs:
   (a) the engine sized the pond (and its reserve) to the use's typical impervious share (TR-55 at 55% for townhomes),
   while the validator judges the drawn plan's own share, and rows packed end to end with their lanes, drives and guest
   stalls cover 62% (TH-sub8 at 124 homes: engine 24,808 sf, validator 26,471 sf): a pond whole by the engine's own
   estimate was still under 97%, and the retry of item 20 (e), aimed at the engine's estimate, could never close it;
   (b) the pond's rectangle came in steps of 105%, 90% and 80% of what was needed, in proportions up to 1:8, so in the
   strip between the loop's end leg and the lot line (about 1:6.5) the reserve grown 4-20% left the pond at exactly 90%
   (22,481 sf) until the reserve took a whole row of 5 homes (124 -> 119 -> 114); (c) the try with its pond made whole
   (123 homes) had guest stalls at a row's end past where the lane turns the loop's corner; the run cut them as out of
   reach and marked the try down 40 points as if a drive had been cut, below the 125 still short. Fixes
   (lib/sitelayout.mjs): where the drawn share asks for more than the typical estimate, each townhome try is also laid
   out again (three times at most, each a try of its own, the earlier retry kept as it was) with the pond sized to the
   try's own drawn impervious share by the same TR-55 estimate (lib/hydrology.mjs impOfElements), the reserve grown by
   what the pond fell short (to 2.2 times the first one's at most); in those tries the pond takes the largest rectangle
   up to the need (a short search, the strip the whole way along the land among the shapes, the nearest one that clears
   the buildings), and where that's still under 97% the strip followed along the land if it holds more (pondFine); guest
   stalls cut as out of reach no longer count toward the parking and don't mark a townhome try down. Detention is judged
   as before: the 97% threshold and the estimate are unchanged. Tried and taken out: finer pond steps in every try
   (changed which first tries won and cost homes elsewhere), keeping guest stalls short of a lane's end (changed the
   guest stalls carried along the rows: MF-townhomes 79 -> 78), and the drawn-share retry in place of the earlier one
   (TH-corner6 83 -> 78: the earlier retry's larger reserve happened to rearrange the rows for more). Bench (top option,
   all passing, no warnings, replay identical): TH-sub8 113 -> 123 (pond 103% of the drawn estimate), LOT-flag-th
   147 -> 166 (99%), MF-townhomes 79 -> 80; other cases unchanged. Holdouts unchanged (P18 fill 77, P35 fill-ug 320, P36
   fill 128, E054 podium-urban 172). Still: TH-sub8's 125 needs about 2 homes' worth of the end strip for its pond, and
   giving up a whole end row (the smallest) to complete a pond nets out negative there (5 homes for 2).

23. Done Nov 4 (deep land under "as many as fit"). Some as-many-as-fit cases left large usable land empty (MF-duplex on
   wedge9: 42 homes, duplex rows only along the lanes; MF-garden-max on L12: 204, the L's corners and the land by the
   pond empty). Diagnosed on the synthetic bench (holdouts only as a non-regression check): (a) duplex rows were held
   32 ft off every cross drive at a loop's corners (item 20b fixed this for townhomes only): the 266 ft blocks between
   the loop's legs and its middle cross drive held 2 duplexes a row, not 3; (b) the pond's land was held as a band across
   the back (or the front or the end) before the rows were laid out; on a wedge the back band narrows, so the pond took a
   third of it and the rest was open land no row could reach, while the rows gave up the band's length; (c) a third lane
   into the deep part of wedge9 doesn't fit: two inner blocks need 548 ft of depth and the land holds 541 ft where it is
   still a row wide (letting the back row run into the narrowing land laid it out, but the pond then had to go beside the
   rows and that try held 44); (d) L12 is parking-bound (204 apartments, 336 of 327 spaces): the corner left at the L is a
   stall row deep, too shallow for a building and its walk, and the 216-apartment tries need a gated emergency lane (the
   two entrances along the one street can't be half the diagonal apart with the pond at the end), so they rank below,
   as they should; (e) LOT-easement-apt's open land is across the pipeline easement, which nothing may be paved over, and
   LOT-wetland-apt's is a strip beside the wetland too narrow for a bar running across (a bar running back would fit; the
   search lays out one direction per plan); the wedge mid-rise cases are parking-bound (item 19). Fixes
   (lib/sitelayout.mjs): (a) duplex rows as many as fit keep the townhome corners (14 ft off a loop's corner, 12 ft off an
   inner cross drive; a count asked for keeps 32 ft); (b) as many as fit, each stack is also tried with no band held for
   the pond ('open', named "pond in the land left"): the rows go where they fit and finishLand puts the pond in the
   largest land they leave, the try kept only where the pond holds 97% of the engine's estimate (the validator still
   judges detention on its own estimate; threshold unchanged). Tried and taken out: the back row allowed past the
   profile's last full-width line (no gain: 44), duplex/townhome stacks ending in a lane with no row behind it (54 homes,
   but no land left for the pond), and moving Entrance 2 instead of adding a third (L12: the first lane ends at the pond,
   no spot far enough). Bench (top option, all passing, no warnings, replay identical): MF-duplex 42 -> 52,
   LOT-curved-apt 444 -> 456; other cases unchanged; bench time about 15% longer (a fourth pond place per stack).
   Holdouts unchanged (P18 fill 77, P35 fill-ug 320, P36 fill 128, E054 podium-urban 172). Still: wedge9 keeps about
   0.9 ac open behind its back row (no lane reaches it; a short cul-de-sac off the back lane would), and L12 stays at 204.

24. Done Nov 4 (angled parking). The owner: "the parking doesn't always have to be straight but can be angled sometimes
   like grocery store parking lots". Every stall was 90° on a 24 ft two-way aisle. Now stall rows can be laid at 60° or
   45° on one-way aisles. Sizes (lib/siteplan.mjs ANGLED, one table, mid-range of ULI / NPA "The Dimensions of Parking"
   5th ed. and the ITE "Traffic Engineering Handbook" 7th ed. for a 9 ft stall and a standard car): 60°: 20 ft row
   depth square to the aisle, 17 ft one-way aisle, 57 ft module; 45°: 18 ft, 14 ft, 50 ft; 90° unchanged (18 ft, 24 ft
   two-way, 60 ft). Along the aisle a stall takes 9 / sin(angle) (10.39 ft, 12.73 ft) and a row loses d / tan(angle) at
   its ends (11.5 ft, 18 ft), planted as triangles; every thirteenth stall is a slanted island as before.
   (a) Geometry: an angled row is a parking rectangle with `ang` (60 | 45) and `flow` (+1 / -1: the way its aisle's
   traffic runs along the row's length); the stalls are parallelograms leaning with the traffic so a driver turns in
   forward (lib/siteplan.mjs stalls / stallLines / stallCentres / capsOf / angledStallPolys). A one-way aisle is a drive
   with `oneWay: true` and `flow`, its note "17 ft one-way drive aisle"; arrows are painted along it every 60 ft
   (onewayMarks: the plan sheet, the dimension sheet, the map and the DXF draw them).
   (b) Circulation and fire access: neighbouring one-way aisles run opposite ways and the two-way collectors (26 ft)
   join every aisle at both ends; a candidate with one aisle and no service drive, or no collector at one end, is not
   tried at an angle. A one-way aisle is never a fire lane: the engine's fire reach leaves it out (it was already under
   23.5 ft) and so do the validator's fire route and fire-width check (turning.mjs oneWayLane). New validator check
   `access.one-way` (hard, geometry): every one-way aisle meets a two-way drive at both ends, has its direction marked,
   and the angled stalls along it lean with its traffic.
   (c) Counting: the engine counts whole stalls at the pitch; the validator counts angled stalls independently from the
   stripes as drawn (layoutcheck.mjs angledStalls): neighbouring parallel stripes a stall width apart (square to the
   stripes), each parallelogram holding the ULI design car (about 6.6 x 17.3 ft) and not planted, inside its row and the
   site, clear of buildings. Accessible stalls stay square with their access aisles: in a 90° row when the plan has one
   (the rows along the collectors are always square), else two square stalls and their aisle carved from four angled
   stalls (one and its aisle from three), so where every row is angled each accessible pair costs two stalls, not one
   (siteplan.mjs adaLossOf; the validator's access-aisle share likewise).
   (d) When: asked for in words ("angled parking", "angled stalls", "diagonal parking", "60 degree parking", "45°
   parking", "parking at 60 degrees", "grocery style / grocery-store parking"; guessProgram -> program.parkAngle ->
   brief program.parking.angle, validated as 60 | 45 | 'angled'; an AI brief's angle reaches the engine through
   toEngine, with a mapping note): the field engine (lib/siteparking.mjs) lays every field at the angle (both angles
   when just "angled"), and if no angled layout parks the program it lays them square and says why; a grocery-anchored
   center (lib/sitecenter.mjs) is laid out as before and its rows laid again at the angle on the same land
   (siteparking.mjs restripeAngled: each 60 ft module becomes 20 ft rows on a 20 ft one-way aisle; an aisle whose end
   stops in the open paving gets a 24 ft two-way drive across its end to the next aisle's, the rows there giving up
   whole stalls; only aisles that meet two-way drives at both ends turn), then only the aisles that already end at
   drives, then square, each saying so. Not asked: every field arrangement is also tried at 60° and 45° where its depth
   holds more stall rows a foot of aisle than square stalls do (a depth a few feet short of whole 60 ft modules), on the
   side (enginectx.mjs aside: its own evaluation budget, clock and random stream) and offered only where it parks the
   program and outscores every square layout found (or no square one parks it), so other requests get exactly the
   options they got before. Notes say angled and why ("As asked" / "this field's depth holds more stalls at 60°").
   Bench (three new cases, all passing, no warnings, replay identical): RE-grocery-angled (6 ac, "grocery-anchored
   shopping center with a 40,000 sf grocery anchor, 50,000 sf total, angled parking"): 2 of its 3 aisles one-way at 60°
   (the two-way aisle along the storefronts keeps the square row and the accessible stalls), 202 / 200 spaces, 83,215 sf
   paved (laid square, as before this change: 202 / 200, 82,638 sf); RE-field-angled (6 ac, "40,000 sf retail with
   angled parking"): 60° on two one-way aisles, 165 / 160 (square: 163 / 160, 124,811 sf paved; angled 134,534 sf, the
   price of the angle); RE-bay60 (560 x 292 ft, "30,000 sf retail", no angle asked): square stalls fit only 28,099 sf
   (program check failing), 60° parks all 30,000 sf (124 / 120) on less paving (84,359 vs 86,830 sf). The 41 earlier
   cases are unchanged, every option identical. Holdouts unchanged (P18 fill 77, P35 fill-ug 320, P36 fill 128, E054
   podium-urban 172). Tests: test/angledparking.mjs. Still: 45° wins less often than 60° (its 50 ft module seldom beats a
   single-loaded square bay); the square layouts drawn by the older generator (lib/sitelayout.mjs
   attempt, apartments' guest rows) are not restriped; the engine's square-row count and its drawn stall centres can
   differ by one on a 13-stall row with end caps (found here, pre-existing, not changed: the validator follows the marks).

25. Done Nov 4 (parking quality). The owner: parking layouts "refined and upgraded just like the building layout engine".
   First measured, on the top option of all 44 bench cases (scripts/parking-metrics.mjs, reading the plans.json the bench
   now writes; the bench also prints the totals): stalls per lot paving (sf a stall), paving under no row or drive, the
   longest run of stalls with no island and runs past 15, row ends with no planted island, dead-end aisles, the walk from
   each stall to the nearest wall of the building it serves (median, 90th percentile, max; the clubhouse left out),
   accessible stalls placed against 2010 ADA 208.2 and how much farther they are than the nearest stalls, and tiny (1-4
   stall), skewed and orphan rows. Findings: islands every 13th stall already (no run past 12); accessible stalls placed
   to the count and next to the buildings; surplus paving near 0 (6% on RE-field-angled); tiny rows only townhome guest
   pockets and skewed rows only along wedges' slanting lines (both by design). The worst, most visible problems:
   (a) long dead-end parking aisles with no way to turn: 6 in 4 cases, up to 490 ft (LOT-flag-retail 473 ft and
   WEDGE-hyp-midrise 490 ft: one aisle with the way in at its middle; MF-tower 185 ft; RE-grocery-angled 249 ft, an aisle
   end left 18 ft clear of stalls, which lib/siteplan.mjs deadEnds takes as a way out but a 24 ft aisle is too narrow to
   turn in); (b) bare row ends: 520 of the stall runs' ends had no planted island (the default square island style gave
   the apartment and townhome rows none, lib/sitelayout.mjs layoutStack caps; common landscape codes end every row in one).
   Fixes (lib/layoutrun.mjs, last in the run's repair chain, each kept only when no hard check gets worse):
   aisleTurnarounds: where an aisle's stalls run more than 150 ft past the last drive, turnaround or lot paving joining it
   (longDeadAisles; driveways not judged, their street end is a way out), a turnaround pad 20 ft along the aisle and
   across the aisle and the stall rows either side (a T a car turns in; drawn as lot paving, kind field, not a fire lane)
   past the rows' ends where the paving setback allows (no stall lost), else on the last stalls at the end (two each row),
   only while the parking still meets what's required; lawn under it gives way, buildings, ponds, parks and other rows
   never. rowEndIslands: the stalls still spare above what's required become planted end islands (the end stall each end
   of a square row of 8 or more), longest rows first, never below what's required (pruneSurplus has already trimmed
   to 3% over; this spends that margin on islands), and not on a row of a multiple of 13 stalls (its last island falls on
   its end cap and the engine's count and the drawn marks part, the pre-existing difference item 24 noted; caught by
   test/layoutrun.mjs's count check). New validator check parking.dead-end-aisle (a warning, geometry measured
   independently from the drawn stall marks): stalls more than 150 ft past the last piece of the network joining the
   aisle. A warning ranks an option below one without (counts.fail), so WEDGE-hyp-midrise now picks its looped field
   (same 96 homes). Bench (top option, all 44 passing, no warnings, replay identical, no case lost homes or sf; parking
   still meets the requirement everywhere): dead-end aisles past 150 ft 6 -> 0 (LOT-flag-retail 473 -> 0, 124/120 ->
   120/120: one pad past the rows, one on the end stalls; WEDGE-hyp-midrise 490 -> 0, walk p90 407 -> 129 ft;
   MF-tower 185 -> 0 and RE-grocery-angled 249 -> 0, both pads free); bare row ends 520 -> 364 (MF-garden-exact 9 -> 3,
   MX-vertical 12 -> 0, MX-horizontal 38 -> 18, MF-courtyard 18 -> 9); stalls 8,466 -> 8,289 across the bench (only
   stalls above the requirement: e.g. MF-garden-rot 650/634 -> 634/634); sf a stall up about 2% (the islands). Holdouts
   unchanged (P18 fill 77, P35 fill-ug 320, P36 fill 128, E054 podium-urban 172). Tests: test/parkingquality.mjs.
   Still (next worst): bare row ends where the parking is exactly met (364, mostly parking-bound "as many as fit":
   LOT-curved-apt 54, MF-garden-rot 46, LOT-wetland-apt 30; planting them costs stalls the homes need); long walks where
   the land for parking is far from the buildings (WEDGE-tri-midrise p90 279 ft, max 377: the stalls beyond the pond;
   MX-vertical p90 179); 380-450 sf a stall on small lots and where a loop drive carries no stalls (MF-garden-exact 393,
   MF-tower 391); the engine's own deadEnds (plan warnings, openDeadEnds) still takes an aisle end 16 ft clear as a way
   out; the 13n-stall cap count difference is avoided, not fixed.

26. Done Nov 4 (understanding requests). The owner: "make sure the AI can understand lots of various prompts, vague
   ones, and detailed ones, and understand spatially what is being asked for so prompting returns what is asked and what
   is best". A corpus of 120 requests (test/fixtures/prompt-corpus.mjs: 25 vague, 35 detailed, 25 messy, 35 spatial,
   across garden / mid-rise / senior / townhome / duplex / cottage housing, retail, grocery, pads, office, medical,
   hotel, church, industrial, cross-dock, flex, storage and mixed use, on 8 synthetic sites), each with its expected
   reading and checks on the best layout (scripts/prompt-corpus.mjs, its own geometry, not the engine's), written before
   the parser was tuned; 16 more written after tuning and scored once (FRESH).
   (a) Messy words (lib/siteplan.mjs tidyRequest, before any reading): typos and shorthand ("appartments", "untis",
   "apts", "whse", "stry", "flrs", "pkg", "ofc"), "60ksf", "30k retail", "s.f.", "180 du", "1.5 spaces/unit", "1.6 pkg
   ratio", "4 per 1,000 sf" (a ratio, no longer a 1,000 sf size), "townhomes x 80", "~", "+/-", "w/", "@"; pond acres
   ("a 3 acre pond": its share of the site), a density ("25 du/ac": the count from the acreage), setbacks said ("50 ft
   setbacks on all sides", "front setback 40 ft, side 15, rear 30": the brief's rules, labelled the request's). Bugs
   found and fixed: "1 space per unit" read as 1 unit; "3-4 story apartments" as a range of 3-4 units; "1.75 spaces per
   unit" as 75 units; "trailer parking" as a trailer park (homes beside the warehouse); "regional detention so no pond"
   as underground vaults; "the pool in the center" as a shopping center; "senior living" and "senoir" not senior.
   (b) Open requests (lib/layoutintent.mjs vagueProgram): no use named → housing compared by value on 2 acres or more
   (garden, studio, townhomes, duplexes; "density" / "units": apartments, as many as fit), shops on a smaller lot, "mixed
   use" → shops in front, apartments behind. Every assumption is kept on the brief (request.assumed, not hashed) and said
   first in each option's notes ("Assumed: No count given for …: as many as fit").
   (c) Where things go: program.placements in rei.brief/1, optional ({ subject, rel, edge?, target?, ft? }; subjects:
   the uses and pool, clubhouse, playground, dog park, courts, pond, parking, truck court, entrance, open space,
   commons, buildings; rel: front, back, middle, corner, edge, near, behind, before, away, keep, facing, along, beside,
   between, around; edge: front, back, side street, neighbours, left / right from the street, the compass). A brief
   without it hashes as before. Honoured by the engine: a use's place among zones (front / back / middle / corner /
   behind another use: the bands and pods already read it); "keep the trees on the north side", "a 50 ft buffer along
   the north line", "no buildings within 75 ft of the west line", "buffer the neighbours to the west", "keep the
   southwest corner open" (an exclusion strip or square the engine keeps out of and the validator checks; a street edge
   raises the front setback instead; depths not said are 60 / 50 ft, said as assumed); "the pool in the center" (the
   resort loop round a central pool); a pool, playground, dog park or courts moved (or a dog park / playground added) to
   the place asked after the layout, kept only when no hard check gets worse. Measured and said only: the clubhouse's,
   pond's, parking's and truck court's place, an entrance on a side street, a single use at the front or back. Every
   option measures every ask and says it in its notes ("Asked: the dog park in the corner: done." / "…: not met in this
   layout (it is toward the back, on the right as seen from the street). The engine has no control for this yet…");
   options meeting more asks rank first (after feasibility, the program and the form).
   (d) The AI path (api/siteplan.js): the program schema has the same placements field and the instructions give the
   vocabulary with worked examples, the open-request rule and the messy-number rules; the model's placements are kept
   on the program and merged with the words' own (test/prompts.mjs feeds fixture replies through the mapping;
   test/prompt-eval-live.mjs runs the corpus through the real model, by hand).
   Scores (docs/bench/prompt-eval.md): words path, before → after: reading checks 71% → 100%, outcome checks 76% → 94%,
   requests fully right 45 → 112 of 120 (vague 8 → 25, detailed 25 → 32, messy 9 → 25, spatial 3 → 30); unmet place
   asks said in the notes 0 of 20 → 6 of 6. Fresh requests (never tuned to): 15 of 16 fully right. AI path, live (gpt-6-luna,
   the app's program step, all 120): reading 88% → 98%, outcomes 83% → 91%, fully right 83 → 107 (spatial 9 → 29);
   then the worst live misreadings fixed (two placed uses answered as one, bare "mixed use", a grocery with shops as two
   retail zones, a church's seats; zones are now made from the model's placements when it gives none) and re-checked
   live on 17 requests, all right.
   Bench: 44 cases unchanged, every option identical, replay identical. Holdouts unchanged (P18 fill 77, P35 fill-ug
   320, P36 fill 128, E054 podium-urban 172). Tests: test/prompts.mjs (a fast subset of 13 corpus requests, about 16 s).
   Still: pond position, parking in front of / behind the buildings, a single warehouse at the back and its truck
   court's direction are said, not placed (no engine control yet); "homes around a central lake" through a run lays out
   a fallback (the regional detention estimate makes the lake layouts fail; laid out directly they draw 48 homes round
   the lake; pre-existing); exact counts the land can't hold (240 mid-rise units, 96 duplex units on 10 ac) come back
   short as before.
   With the building types (item 27): the words are tidied before lib/btypes.mjs applyType reads them (it still runs
   last in guessProgram); senior / independent / assisted living are left as said so their presets read them; an open
   request wins over a custom type only when the name the types read is no building ("the most money here"); a named
   type with a size ("a 2-story trampoline park 30,000 sf") is never treated as open; "L-shaped 4-story apartments" no
   longer reads as 4 apartments (a storey word after a hyphen). 65 bench cases unchanged against 4e25fa3.

27. Done Nov 4 (building types from primitives). The owner: "a wide array of building types … very flexible and not a
   fixed set of options. maybe working primitives for various types that get modified?" Audit and model:
   docs/BUILDING-TYPES.md. Types had been fixed lists in seven places (17 uses, 30 forms, ~12 generators, 7 reviewed
   templates, the ~400-footprint Draw library, AI recipes, 16 map colours), with nothing between a use and a form taking
   parameters from the words; unknown words fell to `other` or a wrong use ("data center" read as retail, "cold storage
   facility" as self storage, "fourplexes" as `other`), and "L-shaped apartments" drew the garden stack round a corner,
   62 of 150 homes short. Now lib/btypes.mjs: a type = a primitive (23: bar, garden stack, L, U, courtyard, T, tower on
   podium, point tower, wrap, podium court, row, detached, multiplex, big box, cross-dock, flex bays, storage campus,
   canopy, drive-thru pad, tunnel, building with its grounds, cluster, garage; each with an outline for any parameters)
   × bounded parameters (floors, floor to floor, depth, length, wing, sf a home / key / child / student, beds a unit,
   mezzanine, ratio; core and parking relation) × use rules (the engine use it lays out as, its count, its parking rule,
   its colour key and floor height), every number marked reviewed / engine / standard / estimate with its source. The
   31 existing types are presets with the engine's own numbers (test/btypes.mjs checks them against USES, sitegen
   TYPES / WRAP / GATE, PODIUM, HOME_TYPES, FUEL and the reviewed templates) and change nothing: the 44 earlier bench
   cases are identical element for element, and 28 existing requests get no type fields. 21 new presets (hotels by keys,
   limited-service and extended-stay; multi-story and drive-up storage; medical office building, clinic; assisted and
   independent senior living; student housing by beds; fourplexes; live-work; flex with a mezzanine and a depth; cold
   storage; data centre shell; fitness club; big box; bank with drive-thru; daycare; school; express car wash; and a
   stand-alone garage, reported as not drawn), 3 shape presets (L, U, round a pool) and a closest-primitive mapping for
   words no preset knows ("a 2-story trampoline park 30,000 sf": a bar at that size, with a note). `applyType` runs last
   in guessProgram on single-use programs; the type's parking rule goes into the brief's rules (engine and validator
   count the same requirement); a preset's usual floors ride as `btFloors` (lib/planbrief.mjs still sees only the words'
   floors); apartments of a type with no reviewed template take the brief form `multifamily` (homes from floor area);
   flex and warehouse depth from the words (`depthFix`, lib/sitelayout.mjs). After a run lib/layoutrun.mjs tags each
   building of the type (`btype`, colour key `tc`, `floorH`, its name and count: "Hotel A · 6-story · 120 keys"; homes
   keep the engine's line) and the option's notes name the preset, primitive and sources. The 3D map keeps its plain
   blocks with parapet and floor lines, coloured by the type's key at its floor height; the plan key and the PDF sheet
   carry the type colours. Bench: 21 new TY- cases, all passing with no warnings and replay identical (65 of 65 overall).
   Holdouts unchanged (P18 fill 77, P35 fill-ug 320, P36 fill 128, E054 podium-urban 172). Still: types per zone of a
   mixed request, the AI's program naming presets, a preset picker in the editor, fourplex and T footprints of their own,
   the stand-alone garage, queue / stacking lanes and school drop-off, drive-up storage's fire-turning warning on small
   lots (the storage layout's own), the pro forma by beds / children / students.

28. Done Nov 4 (parking, round 2). The gaps item 25 left, measured on the top option of all 44 bench cases with
   scripts/parking-metrics.mjs (holdouts only as a non-regression check). The metrics script now leaves planted end caps
   and islands out of the paving (sf a stall), and measures three new things: walk per building (each building's share
   of the stalls by floor area, its nearest that many: the worst building's 90th percentile, and how many pass 200 ft);
   each entrance's throat (ft in from the street to the first stall centre beside the entry drive, and to the first drive
   across it) against a length by lot size (lib/layoutrun.mjs throatNeed: 50 ft under 200 spaces, 75 ft to 499, 100 ft
   for 500 or more; a planning yardstick in the range the TRB Access Management Manual, 2nd ed. 2014, and ITE / Stover &
   Koepke "Transportation and Land Development" give for driveway throat length; local access codes set the real number);
   and the stalls inside that length (entry stalls). Fixes:
   (a) the 13n count: lib/siteplan.mjs rowStallCount, used by stalls(): a row of 13, 26... stalls with end caps counts its
   last island once (it is the end cap, as stallCentres draws it); the field engine's row estimate uses it too. Every
   square row now counts what it draws (test: n 1-60, caps and islands either way); rowEndIslands' avoidance is now only
   a guard. Some plans count a stall or a few more than before (MX-horizontal 645 -> 658 of 644 required).
   (b) row-end islands at no cost (lib/layoutrun.mjs growEndIslands, before rowEndIslands in the run's last repairs):
   where the land at a row's end is free (inside the paving setback, clear of buildings by 5 ft, drives, lot paving,
   other rows, ponds, pools, courts and parks; lawn is planted over), the row grows a stall width each end and both end
   stalls are planted (its stalls stay put); where only one end is free, two widths that way, the stalls one along, only
   where the new end stall fronts the aisle and no stall ends up farther from a building; never a stall fewer, never a
   new dead end.
   (c) stalls by the doors and clear entrances (rowsAlongDrives, after trailsClear): new 90° rows (planted ends, an island
   every 13th) along the free sides of two-way drives that carry none, no farther from a building than three quarters of
   the stalls now and never inside an entrance's throat; then stalls come off row ends, first those in a throat (while
   the parking still meets what's required), then the farthest, back to the count the plan had (a row left under 6 goes
   whole, its drive and lot paving with it: afterCut, shared with pruneSurplus). Kept only where the 90th percentile walk
   drops 5 ft or more with paving up 1% at most, or the throat clears, or the paving drops 2% at the same walk; never more
   stalls in a throat, never a new dead end.
   (d) one dead-end rule: lib/siteplan.mjs deadEnds (the plan's dead-end warning, openDeadEnds) takes an end clear of
   stalls for HAMMER_FT (18 ft, as openDeadEnds and the corner wings cut them; was 16 ft with 2 ft slack) as a way out;
   an aisle whose stalls run more than DEAD_AISLE_FT (150, now one constant for longDeadAisles, aisleTurnarounds and the
   engine; the validator keeps its own 150) past the last join needs a paved turnaround besides, and openDeadEnds now
   paves its hammerhead there (lot paving marked as a turnaround) where it fits clear of buildings and the rest. Planted
   end caps are not stalls in either detector. (Tried: deadEnds refusing an 18 ft hammerhead on a long aisle outright;
   it broke the corner wings' unpaved hammerheads, lib/sitecorner.mjs, so the long-aisle rule stays with the turnaround
   pass and the validator.)
   (e) the jurisdiction's parking rule governs: lib/layoutrun.mjs runPlan (the app's and the MCP site_plan path's way
   into the run) raises the brief's parking rule to the jurisdiction's where its planning guardrails are on
   (governingParking: Waller, Ord. 424, two spaces a home with the 5% count reserve, 2.1; a use's per-1,000 ratio with the
   reserve), so the run lays out to that count and the independent validator's parking.count fails a layout short of it.
   Before, a guarded garden-apartment run laid out at the engine's 1.6 a home and passed its own check (found by the MCP
   helper: 514 stalls drawn for the city's 656). A higher rule the brief already sets stands. Test: test/parkingquality.mjs
   (120 apartments under the guardrails: 252 required, every option parks it).
   (f) the 13n count fix let a different pad layout win on test/parkingfield.mjs's 1.5-acre drive-thru lot, where the
   building cut back from its back wall (lib/sitepad.mjs, "as much as fits") left the window 7.5 ft off the lane: after that
   cut the window must still be within 4 ft of the lane (dtInfo's reach), else the layout is dropped.
   (g) entryThroats takes the inward side from the ring's winding (a clockwise ring had it reversed; lib/siteparking.mjs
   throatOf has the same reversal and is unchanged: commercial fields only).
   Bench (top option, all 44 passing, no warnings, replay identical, no case lost homes or sf, parking meets the
   requirement everywhere): bare row ends 364 -> 168 (MF-garden-rot 46 -> 2, LOT-curved-apt 54 -> 13, LOT-wetland-apt
   30 -> 8, MX-horizontal 18 -> 0); stalls in an entrance's throat 50 -> 11 (LOT-curved-apt 18 -> 3, MF-midrise 8 -> 0,
   MF-courtyard 4 -> 0); 90th percentile walk summed over the cases 3575 -> 3431 ft (WEDGE-tri-midrise 279 -> 255, max
   377 -> 340; MF-wedge-midrise 179 -> 137; WEDGE-tri-1pk 119 -> 77); dead ends (any length, the engine's rule) 8 -> 4;
   paving a stall unchanged in total (17,105 -> 17,104 sf summed). Holdouts unchanged (P18 fill 77, P35 fill-ug 320, P36
   fill 128, E054 podium-urban 172). Tests:
   test/parkingquality.mjs (round-2 cases with merged rows, blocked ends and a throat). Tried and taken out: shifting a
   row toward its free end without the walk check (MF-tuckunder's p90 83 -> 95 ft, MF-tower 46 -> 54).
   Still (next worst): the stalls beyond WEDGE-tri-midrise's pond (only 10 near stalls found along drives; moving 38
   needs a new bay, not rows on drives); 370-390 sf a stall on small lots and loop drives (MF-garden-exact 370, MF-tower
   380: rows along loops are kept out of the throat and FAR_FT reach, and the passes add no new aisles); the first drive
   across an entry within the throat length (MF-garden-exact 28 ft, the wedges 13-30 ft: the loop drive's place is the
   generator's, lib/sitelayout.mjs / sitegen); the remaining bare ends are where rows meet a cross drive end to end;
   one-way circulation stays only where angled stalls are asked or win.
   On the building-type and request-understanding work (items 26-27; bench 65 cases, base 5b39f65): all 65 passing, no
   warnings, replay identical, no case lost homes or sf, parking met everywhere; bare row ends 417 -> 189, stalls in a
   throat 60 -> 12, 90th percentile walk summed 5175 -> 4938 ft, max walk 6717 -> 6361 ft, dead ends 10 -> 6, sf a stall
   summed 25,314 -> 25,331 (+0.07%), stalls 10,759 -> 10,779. Interaction found and fixed: rowsAlongDrives judged paving
   by summing pieces, so on the TY fields (rectangular lot paving under the rows) taking far rows out looked like less
   paving while the field stayed (TY-fitness 361 -> 447 sf a stall, TY-bigbox 341 -> 410): it now judges the paving's
   union, planted islands left out, and those cases are unchanged. TY-clinic-custom's walk p90 74 -> 106 ft comes from a
   different winning layout once the 13n rows count what they draw (12,000 -> 12,001 sf), not from the parking passes.

29. Done Nov 5 (building types, round 2). The owner: "flexible building-type primitives that get modified into many more
   building types, keeping the coloured 3D blocks". Round 1's leftovers (item 27), most valuable first; docs/BUILDING-TYPES.md
   section 6. (1) Footprints of their own: a T is drawn as a T (lib/siteplan.mjs outline form 'T', overlap, footprint, the
   plan-set outline and the engine's L / U paths take it; the editor's shape list too); a point tower is a slim tower on
   its podium (`point`: 45% × 70% of the podium, the engine's tower sizing counting homes on that plate); triplexes and
   fourplexes are buildings of their own (S.PLEX, 66 × 44 and 64 × 56 ft, estimates) on the duplex rows, the blocks as
   deep as they need; a cluster-of-pads preset ("a pad-site village with 6 pads", "food hall pads"). (2) Site features a
   type needs, lib/btsite.mjs: the type is laid out as a bigger box (`btEnvelope`; lib/layoutbrief.mjs toEngine draws the
   envelope and spreads the type's spaces over it when it is cut back: one additive line) and after the run the box is
   cut back to the building: an express car wash's tunnel with one way in from the nearest drive splitting into two
   12 ft stacking lanes that merge round the far end into the tunnel, and an exit apron (runs out straight or turning
   once, through landscape or a walk only; corners for a passenger car's turn; left off with a note when nothing reaches
   a drive or the engine's own check objects); a data centre's fenced generator and cooling yard on the back quarter of
   its plot. The bank's and restaurants' drive-thru lanes (lib/sitepad.mjs) are reused and now checked. New soft checks
   in lib/layoutcheck.mjs: queues.clear (each queue lane's centre line every 2 ft where cars wait, from where it leaves
   its drive or its drawn queue start to its window: no point on another drive, a parking row or outside the property
   line) and queues.stack (12 cars for a car wash, an estimate from common express-tunnel planning, local rules 6-15; 5 a
   lane for a bank, estimate; 8 behind the order point for a restaurant, the engine's rule); a parking row laid across a
   car wash lane is caught in test/btypes.mjs. (3) A stand-alone parking garage drawn (a two-bay deck sized on the stall
   grid; the garage is the program, its levels its floor area: layoutcheck quantities counts a `standalone` garage as its
   use's building); a full-service hotel preset; a hotel over retail (the hotel's floors over a ground floor of shops, the
   parking rule the two blended). (4) The pro forma and Numbers count keys from the buildings (an extended stay is no
   longer re-counted at 550 sf a key), beds, children, students and storage units (lib/proforma.mjs; test/btnumbers.mjs).
   (5) A type per zone: a mixed request's zones take the preset their part of the words names (`btZones`), and types named
   on pads in front of another use become front zones ("a daycare and a bank on pads in front of townhomes"); each zone
   parks at its use's own rule. (6) The editor's Add panel: "Add a building by type", a searchable list of the 51 presets
   with their colours, adding BT.presetBuilding at its usual size; the 3D map shows the block coloured by type with its
   parapet and floor lines. Bench: 74 cases, 74 pass, no warnings, replay identical; the 44 earlier non-type cases
   identical element for element; TY-fourplex (fourplexes of their own), TY-datacenter (its yard), TY-carwash (moved to
   2.3 ac: lanes, exit and vacuum stalls drawn) changed as intended; every other earlier case identical element for element on the folded branch (on parking round 2 and the request reading; engine version rei-layout/2026.11.05.1); 9 new
   cases (TY-T-apts, TY-point-tower, TY-triplex, TY-hotel-full, TY-hotel-retail, TY-garage, TY-pad-village, TY-mix-hotel,
   TY-mix-pads). Holdouts unchanged (P18 fill 77, P35 fill-ug 320, P36 fill 128, E054 podium-urban 172). Still: a school's
   bus loop and parent drop-off, a daycare's drop-off lane, a hotel's porte-cochère and a gas station's queue at the
   pumps are not drawn; a bank as a zone has no drive-thru lane; zones park at their use's rule; recipe types as zones
   are the building alone; the car wash's lanes need a drive within 90 ft of its plot's end.

30. Done Nov 5 (request understanding, round 2: the places asked, honoured). Item 26 read where things go but only
   stated several asks as "not met": the pond's place, parking in front of / behind the buildings, the clubhouse's place,
   a way in off a named street, a single use at the front or back, the warehouse's place and its docks' direction.
   (a) Routing (lib/layoutintent.mjs asksFor): those asks (how 'checked': not the zones' places, which the engine already
   reads, nor the pool / playground / dog park moved after the layout) go to the engine as opts.asks: a count of the asks
   a drawing misses (checkPlacement) and hints the generators read. lib/sitelayout.mjs askPick (the search and generator
   picks, and the parking-field engine's): the candidates drawn that miss the fewest asks (parked, no broken rule; those
   holding as much as the picks first) join the options handed back, beside the picks, two at most; askKept keeps the
   generator's best two that meet more asks than its usual eight. The run ranks them as before (feasible, the program,
   the form, then places met), so an ask is a strong preference that never costs the program; when no layout meets it
   the notes say so and name the option that has it and what it gives up ("Option 3 has the clubhouse at the back (it
   holds 168 homes, short of the program)"), and a top option meeting one says what that costs against a fuller one
   ("Placed as asked …: option 2, without it, holds 216 homes to this one's 204"). Steered asks no longer say "the
   engine has no control for this".
   (b) Generator controls, each drawn only when asked (a request without the ask sees no new candidate): the pond along
   the street (lib/sitegen.mjs rowsFacing cut 'front'); the clubhouse in the back row (amenity 'back'); warehouse
   columns running back with the loading beside each building, the floor area shared between the columns and the
   buildings against the back (lib/sitegencom.mjs flex p.rear / p.split), mirrored for docks on the left (p.flip).
   Compass sides are turned into the frame's (front / back / left / right) from the site's street.
   (c) Measuring honestly: a pond in several basins meets a place only with two thirds of its area there (a basin each
   end had passed as "the pond on the north end"); a truck court faces a way for each warehouse from its own nearest
   court (two columns each with its apron east faced east, not "west from one of them").
   (d) "Homes around a central lake" through a run fell back to a simple layout. Cause: with the regional rain estimate
   (TR-55) the detention need is smaller (1.6 ac against 2.6 ac on the 20 ac test site), so the lake's band reserve
   shrank and the bands added one more pair of home streets; that pair's 25% overshoot allowance never shrank with the
   scale (60 ft a step against a 250 ft pair), so no scale fit and every try failed. The allowance now shrinks to none
   by scale 0.55 (lib/sitelayout.mjs mixedOptions); the run lays out 46 homes with the lake holding the detention. The
   lake is still drawn as a band at the back, not in the middle (said in the notes: the bands have no order with homes
   on both sides of the commons, and the pods drew it at the front).
   (e) Reading: "retail 25k + 1 pad", "whse ~150k": a size in thousands with no unit after it is square feet when a
   commercial use is named and no homes (never "$25k", "25k per unit"); " + 1 pad" reads as "and", not "or more".
   "trampoline park", "an indoor water park", "bowling alley" (bare): a building of an unknown type (the closest
   primitive), not a commons or an open request; "office park" is offices.
   (f) Typed zones placed (with item 29): "a daycare and a bank on pads in front of townhomes" said "the restaurants
   toward the street" (the bank zone's engine use) and nothing for the daycare. lib/layoutintent.mjs nameTypedZones: a
   placement on a zone of a type the words named carries the type's name and zone, each other typed zone at that place
   gets its own, and the check measures that zone's buildings: "the bank toward the street: done", "the daycare toward
   the street: done". Folded onto building types round 2 and parking round 2 (74 bench cases: identical but
   TY-mix-pads' notes).
   Scores (docs/bench/prompt-eval.md, words path, 120 requests): fully right 112 → 116 (spatial 30 → 34: S06, S13, S26,
   S31; vague, detailed and messy unchanged at 25, 32, 25), outcome checks 94% → 97%. Item 26's fresh 16: 15 → 16. Ten
   new requests written after this work, scored once (FRESH2): 8 of 10 (missed: "200,000 sf distribution building at
   the back of the site, docks facing west": at the back, docks facing south; "pond in the southeast corner": the
   engine's corner test passed a pond in the right third midway back, the scorer's stricter one didn't, so it wasn't
   said as unmet). AI path, live, spatial only (gpt-6-luna, 35 calls): fully right 29 → 32 of 35 (S06, S19, S31 missed).
   Bench: 65 cases, every option and top plan identical to 5b39f65; on the folded branch 74 cases, identical to d35bb9c
   but TY-mix-pads' notes; all passing, no warnings, replay identical.
   Holdouts unchanged (P18 fill 77, P35 fill-ug 320, P36 fill 128, E054 podium-urban 172). Tests: test/prompts.mjs.
   Still said, not placed: a shop / office / medical building at the front (the parking-field engine,
   lib/siteparking.mjs, draws every building behind its parking); the lake in the middle; a way in off a side street is
   met where the way-in step adds one, not steered (entrances are added after the candidates are compared); the corner
   test is looser than the scorer's.

31. Done Nov 5 (parking, round 3). The owner: "keep refining and upgrading it as much as the buildings: angled and straight
   layouts, one-way and two-way circulation, islands and landscaping, no long dead ends, short walks to the door,
   efficient paving, good entries and drive aisles". Measured first on the 74-case bench (top option of each case,
   scripts/parking-metrics.mjs, base d35bb9c), then fixed, most valuable first:
   (a) The building at the street, its parking behind (lib/siteparking.mjs streetFront). The parking-field engine always
   drew the building behind its field; form-based and urban codes often want the storefront on the sidewalk and the lot
   at the back. It is now a candidate, laid out as a brief's "parking behind the buildings" is (briefRows: the street
   row, then the field, the way in beside the building), on the side (lib/enginectx.mjs aside: its own clock and random
   stream, so the search finds exactly what it did before). Asked for in words ("building up front, parking behind",
   "retail on the street, parking in the rear": parking placed behind or at the back, or a shop / office / medical /
   restaurant / hotel / church placed at the front; lib/layoutbrief.mjs toEngine sets opts.parkBack, and
   lib/layoutintent.mjs asksFor's hints.parking 'back' is read too where the spatial-asks work is folded in): every such
   layout that parks the program joins the field options first (three at most), named "Building at the street, parking
   behind" and saying "as asked": the building at the front setback (the build-to line) facing the street with its walk,
   a shallow, wide storefront preferred over a deep box (lib/siteparking.mjs value: 3 points a foot past 100 ft deep),
   no detention pond between it and the street, the way in along its side to the lot behind, the collectors (fire
   lanes) up both sides. Not asked: offered only where it parks the program, holds as much floor area as the best layout
   found and outscores it (on the bench it never does, so no case changed by it). A compact street row now leaves room
   beside the building for the way in (before, the brief path failed for a 15,000 sf shop row on 4.3 ac: every
   candidate too narrow for the entry). The check is strict (lib/layoutintent.mjs checkPlacement frontStalls): parking
   asked behind / at the back fails when any stall sits between a building's street face and the street within its
   frontage (a field in front: TY-mob 101 stalls, RE-strip 59), and "at the back" passes when the lot is behind the
   buildings with none in front. Bench cases PK-street-retail (4.3 ac, "retail on the street, parking in the rear,
   15,000 sf") and PK-street-medical (5.5 ac, "20,000 sf medical office at the front with parking behind it"): the
   street layout first, both asks met, passing with no warnings. Checked also with the spatial-asks branch merged in a
   scratch branch ("12,000 sf retail building up front with parking behind", "a 6,000 sf restaurant up front, parking in
   back": the street layout first, asks met).
   (b) Entry throats. The first drive across the main entry sat inside the stacking length (lib/layoutrun.mjs
   throatNeed: 50 / 75 / 100 ft) on 31 of 74 cases. Two causes. In the parking-field engine the field's paving ran under
   the strip beside the entry drive (no stalls there, but open paving a car could cut across, 30-57 ft in); it now stops
   at the strip's sides, which are planted (lib/siteparking.mjs build: the throat box cut out of the first field's
   paving), so the first drive across is the first aisle at the engine's stacking distance. In the generator
   (lib/sitegen.mjs) rows facing the street, rows running back and the strips along a wedge's street line put their
   first aisle or front drive at the paving setback (10-28 ft in); each is now drawn with it the stacking length in
   (75 ft where the homes asked need 200 stalls or more, else 50; alongEdges p.thr for a strip along the street) where
   that costs no homes and parks them as well (the same buildings' homes, the stalls the homes need or as many as
   before), else as before, the land in front lawn. Every layout of the grid is drawn the same way. Tried first and
   changed: a pass after the grid that redrew the kept layouts and swapped them in (or offered them beside): it broke
   the grid's near-twins apart (one of a pair set back, the other not), which changed what the search picked: a prompt
   corpus request ("160 apartments, clubhouse in the middle of the site", S32) lost its layout with the clubhouse in
   the middle, and a strip along a wedge's street line came out parked down 16 homes (WEDGE-tri-midrise) until the
   parking was compared too. test/parkingquality.mjs's guarded run (Waller rules): its two 3-row garden layouts now
   park exactly the same and the run keeps one as twins, so its third option is a 108-home courtyard; the test now
   checks every option is judged and parked at 2.1 a home and that the top one holds the 120 and passes (it checked
   every option for 252 stalls). Found on the way (lib/bldgtemplates.mjs shrink, pre-existing): a module taken off a
   templated building dropped its "estimate" note and left the stacked bays at the old count (MF-stacked, once the
   throats moved its layout); both now follow.
   (c) Tried and taken out: a new bay by the buildings for stranded parking (a 24 ft spur aisle off a drive's free side,
   rows both sides, an 18 ft turning end, stalls within 150 ft of a building, the farthest stalls taken out for it). On
   WEDGE-tri-midrise (38 stalls beyond the pond, p90 255 ft) and TY-hotel-retail no such bay fits anywhere (no candidate
   even without the walk limit): the land by the buildings is full and the pond holds the rest, so the fix belongs to the
   generator's pond and bay placement, not a pass after it. Also taken out: running the stalls-along-drives pass for
   paving alone where walks are already short (over 400 sf a stall): no case improved (MF-tower's loop legs are curved
   paths or entrances; the far rows trimmed leave their drives).
   (d) One-way aisles with 90° stalls: not used, by design. A 90° stall needs the same 22-24 ft to back out of whether
   the traffic runs one way or two (ULI / NPA "The Dimensions of Parking"), so a one-way 90° field saves no paving and
   adds wrong-way conflicts; one-way circulation earns its place only with angled stalls (item 24: 17 / 14 ft aisles).
   Bench (74 original cases, top option; base d35bb9c → after): all passing, no warnings, replay identical, no case lost
   homes or floor area, parking met everywhere; 48 identical element for element. Cases whose first drive across the
   entry is inside the stacking length 31 → 23 (MF-garden-exact 28 → 50 ft, MF-stacked 46 → 96, MF-midrise 46 → 50,
   WEDGE-hyp-1pk 13 → 100, RE-strip 54 → 72, TY-mob, TY-fitness, TY-hotel-full and RE-field-angled 55-57 → 75,
   TY-student 46 → 75, TY-bigbox 82 → 100, TY-unknown 30 → 50); sf a stall summed 27,627 → 27,491 (MF-stacked 375 → 340,
   MF-garden-exact 370 → 352, RE-strip 356 → 340, TY-unknown 450 → 431, TY-fitness 361 → 352, TY-mob 383 → 374);
   90th percentile walk summed 5,804 → 5,803 ft (MF-garden-exact 59 → 48, TY-hotel-keys 113 → 82; MF-stacked 18 → 59,
   its layout now the one with buildings along the street); stalls 12,088 → 12,087; bare row ends 216 → 222
   (MF-garden-exact 0 → 5: its columns now end on the set-back front drive); stalls in a throat 15 → 15; dead ends
   8 → 8. Two new cases (PK-street-*), 76 of 76 passing. Prompt corpus (offline, words path): 112 → 113 of 120 fully
   right. Holdouts unchanged (P18 fill 77, P35 fill-ug 320, P36 fill 128, E054 podium-urban 172). Engine version
   rei-layout/2026.11.05.3. Tests: test/parkingquality.mjs (the street arrangement asked and not asked; throats on a
   generated garden layout and a medical office field).
   Still (next worst): WEDGE-tri-midrise's stalls beyond the pond (p90 255 ft: the generator's pond and bay placement);
   the wedges' entries (WEDGE-trap 15 ft, WEDGE-tri / arc 30 ft: the entry meets a slanted strip's bay, not a strip along
   the street); TY-hotel-retail's one-sided field (p90 246 ft); bare row ends where rows meet a cross drive end to end
   (222); small pads' aisles meeting the entry from the side (TY-daycare 30 ft); 370-475 sf a stall on loop drives and
   small lots (MF-tower 376, TY-assisted 470).
