---
name: site-layout
description: Lay out a site with the Real Estate Intelligence layout engine — the same reproducible engine the app's Build uses — and deliver a conceptual site layout sheet (PDF, 24 x 36), the ranked options with an independent code-style check of each, and the project model the fs-set-plans skill builds the plan set from. Works from a parcel outline (GeoJSON, the app's Map File export, Regrid / appraisal parcels) or a ring in feet plus what to build ("exactly 240 garden apartments", "as many townhomes as fit", "30,000 sf retail strip", "a wrap with 300 apartments", "cross-dock warehouse 400,000 sf"). Use when the user asks for a "site layout", "site plan layout", "test fit", "what fits here", "how many units fit", "lay out this parcel", "yield study" or "/site-layout". Conceptual only: never permit-ready.
---

# site-layout: a site laid out by the app's engine, checked, ready for the plan set

You turn a parcel and a program into **ranked layout options**, each **checked by an independent validator**, and
deliver the best one as a sheet plus the model the next agent (fs-set-plans) draws the plan set from. You never draw
geometry by hand: the engine draws, the validator measures, you decide, iterate and report honestly.

The engine is a copy of the Real Estate Intelligence app's own layout engine (`scripts/engine/`, version in
`scripts/engine/VERSION.json`). The same brief, seed and engine version always give the same layouts, so every result
can be replayed and audited.

## Two ways to run

**A. With the app's MCP connector** (tools named `layout_run`, `layout_edit`, `layout_replay`, `layout_capabilities`,
`site_plan`): use them; they run the same engine on the server. Arguments are in `references/mcp-tools.md`.

**B. Offline, in your sandbox** (Node 18+ and nothing else; no network, no packages):

```
node <skill>/scripts/layout.mjs site    --geojson parcel.geojson [--front 0] [--streets 1,2] --out site.json
node <skill>/scripts/layout.mjs brief   --site site.json --request "exactly 240 garden apartments, 3 stories" --out brief.json
node <skill>/scripts/layout.mjs check   --brief brief.json
node <skill>/scripts/layout.mjs run     --brief brief.json --out out/ --name "Project name" --address "Street, City, TX"
node <skill>/scripts/layout.mjs edit    --record out/run.json --words "keep the buildings and move the pool to the center" --out out2/
node <skill>/scripts/layout.mjs replay  --record out/run.json
node <skill>/scripts/layout.mjs handoff --record out/run.json --option 2 --out out/ --name "..." --address "..."
node <skill>/scripts/layout.mjs caps
```

`run`, `edit` and `handoff` write to `--out`:

| File | What |
|---|---|
| `summary.txt` | outcome, each option's numbers, every check with its status, rule basis and measured / required value, the engine's notes |
| `run.json` | the run record: the canonical brief, versions, input hash, every option's geometry, quantities and checks. Keep it: `edit` and `replay` start from it |
| `option-N.svg` | each option's plan drawing (open or render it to look at it) |
| `sheet.pdf` | the chosen option (`--option`, default 1) on a 24 x 36 sheet with the numbers and checks; the plan-set model rides inside as invisible text |
| `project.json` | the fs-set-plans project model of that option (exact geometry in feet) |
| `project-model.txt` | the same model as `<<FS:nnnn:...:FS>>` lines (fs-set-plans `read_model.py` rebuilds it from them) |

## Workflow

1. **Read everything you were given** before deciding: parcel / survey / plat, the app's exports, flood, utilities,
   zoning, the owner's wishes. Note the stated acreage.
2. **The site in feet.** From GeoJSON (lon/lat): `layout.mjs site`. It prints each edge's index and length: pick the
   main street edge (`--front`, default the longest) and other street edges (`--streets`). Check the acreage against
   the stated figure (a mismatch over ~2% means the wrong parcel or a union is needed: say so). From a DXF / PDF survey
   use fs-site-plan's `extract_geometry.py` / `fit_site.py` if available, then write `site.json` as
   `{ "ring": [[x,y],...] (feet, x east, y north), "front": i, "streets": [...], "setbacks": {front, side, rear, paving},
   "setbacks_source": "...", "exclusions": [{ "kind": "easement" | "wetland" | ..., "ring": [[x,y],...], "source": "..." }] }`.
3. **The brief.** `layout.mjs brief --request "..."` turns words into a typed `rei.brief/1` (see
   `references/brief.md`). Then edit the JSON where you know better:
   - **Quantity meaning** (`program.uses[i].quantity`): `exact` (a bare number), `min` ("at least"), `max` ("up to"),
     `range`, `maximize` ("as many as fit"). Units: `units`, `sf`, `buildings`.
   - **Rules** (`rules.values.*`): each `{ v, cls: "verified" | "assumption", source }`. Mark `verified` ONLY with a
     citation you read (ordinance section, approved plat). Setbacks, parking ratios (`parkingPerUnit`, `parkingPer1000`),
     building separation, design vehicles.
   - **Stormwater** (`site.stormwater`): `onsite-pond` (default), `underground`, or `offsite` (regional detention).
   - Run `layout.mjs check --brief` until it is valid.
4. **Run** and read `summary.txt`. Outcomes: `feasible` (best found, not proven optimal), `needs-review`,
   `no-feasible-found` (search budget, not proof), `proven-infeasible`, `unsupported` (a form the engine doesn't draw:
   it says the nearest, never substitutes silently), `missing-information`, `invalid-brief`.
5. **Look at the drawings** (`option-N.svg`; render to PNG if you can) like an architect: buildings reached, parking
   near entries, pond placement, leftover land. Read every failing (`[FAIL]` hard, `[warn]` note) and unknown check.
6. **Iterate**: change the brief (a different form, quantity, setbacks, stormwater) and run again, or edit the record
   with words / typed edits (`references/edits.md`: lock, unlock, move, keep-entrance, regenerate, set-quantity,
   set-form, compare-forms, set-office-share, place). An edit that would break a hard check or a lock is refused with
   the reasons, and the record is unchanged. Use `compare-forms` to test alternatives (garden vs townhomes vs mid-rise).
7. **Choose and deliver**: `handoff --option N` for the one you recommend (default the top-ranked passing option).
   Deliver `sheet.pdf` (it carries the model for the plan-set agent) and a short summary.

## What the engine draws

`layout.mjs caps` (or MCP `layout_capabilities`) prints the live list with each form's status: `implemented`,
`partial` (with its simplification) or `unsupported`. `references/forms.md` is that list with the words that ask for
each. In short:

- **Multifamily:** garden walk-ups (breezeway stacks), studio / 1-bed garden buildings, mid-rise corridor bars,
  courtyard buildings (ring or U), courtyard on a parking podium ("5 over 2"), tower on a podium (drawn garage plan),
  wrap (apartments round a garage), tuck-under rows, stacked townhomes, rental townhome rows and fee-simple townhome
  lots (rear- or front-load), duplexes, build-to-rent cottage communities, tiny / manufactured home communities,
  single-family subdivisions.
- **Retail:** strip / inline, strip with pads, anchored center (anchor + shops), freestanding, restaurant pad,
  drive-thru, retail plaza.
- **Industrial / flex:** warehouse with truck court (rear-, front-load), cross-dock (doors and truck courts both
  sides, trailer stalls), flex / small bay, self storage.
- **Mixed use:** horizontal (zones / tracts) and vertical (shops on the ground floor, apartments above).

**Reviewed vs estimate.** Building templates come from reviewed reference plans (garden breezeway stack, mid-rise
corridor bay, E053 tuck-under / front-load row, P20 cottage, P28 / P11 / P33 corridor home sizes, P25 / E028 podium
share). Courtyard, wrap, podium-courtyard and vertical mixed-use unit counts, stacked townhomes and 1-bed cottages are
**estimates from floor area**: say so. Corridor buildings deeper than the reviewed 65 ft only when the request asks
("83 ft deep corridor buildings"), marked as an assumption.

## What the check covers (and doesn't)

Every option is measured by an independent validator (`rei.validate/1`, `references/checks.md`): containment,
setbacks by edge role, exclusions, level-aware overlaps, building separation, legal access and a second way in (IFC
Appendix D, where adopted) far enough apart, connected circulation, buildings reached, parking required vs provided
(stalls counted from the drawing, garages from their drawn plans, accessible count per 2010 ADA 208.2), the program by
what each quantity means, unit reconciliation, locks, turning for car / fire / service / semitrailer at drive corners
(planning-level), fire-lane width and dead ends, garage ramps and ventilation (open-garage rule), detention estimated
by NRCS TR-55 on a regional NOAA Atlas 14 figure (offline: no point estimate). **Not designed:** grading, utilities,
fire route distance, structure, drainage design. Unknown is reported as unknown, never as pass.

## Honesty rules (always)

- Conceptual layout only. Never call it permit-ready, construction-ready or engineered. Say so in the summary.
- Every rule you didn't verify from a source stays `assumption`, and the summary lists them.
- Report every failing and unknown check of the option you deliver, and why you accepted it if you did.
- If the program doesn't fit, say what does (the engine's best and the binding constraint: land, parking, setbacks,
  frontage, access). Never pad a count, never hand-edit geometry, never swap the asked-for form silently.
- Keep the conversation small: never print `run.json` or `project.json`; read `summary.txt`; look at drawings at low
  resolution.

## Delivering

Deliver `sheet.pdf` (and `project.json` only if the next agent can't read a PDF). End with: the layout chosen and
why (with the alternatives you compared), the key numbers (acres, units or sf, buildings, parking provided / required,
density, detention), every failing / unknown check and every unverified assumption, the engine version and input hash
(so it can be replayed), and that it is a conceptual layout, not engineering.
