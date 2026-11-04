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
| Multifamily | garden (templated), townhomes, cottage / BTR, single-family lots | walk-up (garden geometry), courtyard (corner overlaps flagged), mid-rise (template, cores not drawn), podium and tower-on-podium (massing only), duplex/triplex/fourplex (duplex rows) | tuck-under, wrap, stacked townhomes |
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

- Top option passes every measurable hard check: **11 of 15** now; before, the first option passed in 6 of 15 (garden
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

## 9. Next tasks (in order)

1. Done for Build (Nov 3). Still: "More layouts", scenarios and the MCP `site_plan` tool through `runPlan`; the
   quantity-meaning choice in Build; options that differ only by mirroring (the Hockley run's first two).
2. After trimming to an exact count, re-fit the parking (refit with the kept buildings pinned) so no empty bay is left.
3. Mid-rise: let shorter bars take fewer bays (min 3) or join bars; score over-parking as land waste.
4. Courtyard: a continuous courtyard building form (no corner overlaps), then mark it validated if the benchmark passes.
5. Reconstruct a holdout family (Sierra Vista 64-plex site) as an evaluation case on its real parcel.
6. Wrap, tuck-under, cross-dock and vertical mixed use, each with its own geometry and tests.
7. Turning movements with a declared design vehicle; detention from topography (needs engineering inputs).
8. Main entry off-centre when two remote ways in are needed (on a 900 ft frontage a centred entry can't be 515 ft from another); the pond kept off the street frontage (Hockley's pond wedge took the corner a second entry needed); mirrored options with the same numbers.
