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
for fire-code spacing) → tidyPonds again. Exact counts ask the engine for the count first and retry with more only when
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
