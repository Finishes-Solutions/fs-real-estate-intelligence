# Plan: a BIM model of each option, built with BIMCraft, priced from its quantities

Status: phase 0 (the trial) done and phase 1's model built, October 26, 2026; see "Trial results" below. Builds on
`MASSING-PLAN.md` (the three.js scene) and `lib/proforma.mjs` (the budget). Nothing in the app uses it yet: the worker
has to be deployed first.

## Why

Today the budget prices a building as **gross sf × a $/sf for its use** (`HARD` in `lib/proforma.mjs`), and site work
as paved sf, stalls and detention volume. That is a fair concept-stage number, but two buildings of the same use and
size cost the same whatever their shape, height, glazing or roof. A BIM model of each option gives:

1. **Quantities, not one area:** exterior wall area by type, glazing area, door count, roof area and type, slab area
   by level, interior partition length, floor-to-floor heights. Priced as assemblies, an L-shaped three-storey building
   with a storefront costs more than a box of the same sf, as it does in real life.
2. **A real model to show and hand over:** walls, windows, doors, floors and roofs as BIM elements, exported as IFC,
   which Revit, ArchiCAD and every BIM viewer open. An architect can start from it instead of redrawing it.
3. **Better geometry for the 3D view and the renderings:** windows where they actually are, parapets, pitched roofs,
   canopies, all from one model instead of being re-invented in the three.js scene.

## What BIMCraft is (and isn't)

There are several unrelated GitHub projects called BIMCraft or BimCraft. The one that fits is the Rust one "built to be
driven by agents" (github.com/IPedrax/BIMCraft, also mirrored at BManning94 and dansity; I could not tell which is the
upstream). Read from its README and source on Oct 26 (version 0.8.0, last commit Oct 26):

| | What it does |
|---|---|
| Model | Levels, grids, compound walls (layers, materials), doors and windows hosted in walls, floors (sloped, with openings), ceilings, flat and pitched roofs (gables, overhangs, dormers), columns, beams, footings, stairs, ramps, railings, rooms, shafts, masses, components from families, MEP runs |
| Driven by | JSON commands (`wall {points, type, level, height}`, `floor`, `roof`, `window`…), a script of one command a line, run atomically; a CLI (`bimcraft-cli run / convert / info / commands / mcp`) and an MCP server over stdio. A failed command says what to fix and changes nothing |
| Quantities | Schedules of walls, floors, roofs, doors, windows, rooms, columns, stairs… with chosen fields, formulas (`Area * 120`), filters, grouping and totals, as JSON or CSV |
| Out | `.bimcraft` (JSON), **IFC4** (checked with IfcOpenShell in their CI), PDF sheets, PNG views, SVG plans, CSV schedules |
| In | IFC2x3 / IFC4, and Revit `.rvt` / `.rfa` read-only |
| Licence | MIT or Apache-2.0 (the optional Revit reader is Apache-2.0 only). Fine for us |

What it **isn't**, and what that means for us:

- **Not a web library.** A native binary: no WebAssembly build, no npm package. It runs on a server or a worker, never
  in the browser.
- **No realistic rendering.** Its 3D view is drawn in software, orthographic, with no perspective, sun or shadows (its
  own roadmap says so). The "realistic 3D" comes from our side: its IFC loaded into the three.js scene of
  `MASSING-PLAN.md`, and the AI renderings painted from that.
- **No glTF export.** IFC is the hand-off. In the browser, IFC is read with `web-ifc` (WebAssembly, open source) into
  three.js meshes.
- **No costs.** Its materials have colours and hatches, not prices. Costing is ours to build.
- **No site work.** Paving, curbs, stalls, ponds and utilities stay in our own site plan quantities (already computed).
- **Early development**, moving fast (several releases a month). Command names and parameters can change, so we pin a
  version and keep it behind one adapter.
- **Metric inside** (commands take mm). Our plans are in feet; the adapter converts.

## Honest expectations on "100% accurate budgeting"

No model gets a concept budget to 100%. Before drawings and bids, accuracy is limited by what isn't designed yet
(structure, MEP, finishes, foundations on Houston clay) and by unit prices, not by geometry. The usual industry
classes (AACE 18R-97):

| Class | Stage | Typical range |
|---|---|---|
| 5 | Concept, $/sf (where we are today) | −20 to −50% / +30 to +100% |
| 4 | Feasibility, assemblies from a massing model (where this plan gets us) | −15 to −30% / +20 to +50% |
| 3 | Schematic design with real drawings | −10 to −20% / +10 to +30% |

The BIM model moves us from class 5 toward class 4: the quantities become right, and what's left is the unit prices.
The biggest lever on accuracy after that is **calibrating unit prices against Finishes Solutions' own past jobs** (bid
tabs and final costs). The app should always show the estimate as a range, say which class it is, and keep the $/sf
number beside it for comparison.

## How it fits together

```
site plan option (lib/siteplan.mjs: outlines in ft, use, floors, floor height, form, storefront side)
   │  lib/bim.mjs (pure JS, tested): option → BIMCraft script (ft → mm)
   ▼
bimcraft-cli run  (pinned version, on a worker; see "Where it runs")
   │  → model.bimcraft, model.ifc, schedules (JSON), a PNG of each building
   ▼
lib/estimate.mjs: schedules × unit-cost table (low / likely / high, Houston 2026) = building hard cost by assembly
   │  + site work from the site plan's own quantities (as today)
   ▼
lib/proforma.mjs: `hard` takes the estimate when a model exists, $/sf otherwise; both shown
   ▼
app: Budget shows assemblies and the range; 3D view loads the IFC (web-ifc → three.js layer);
     Download IFC; plan set PDF gets the model's plans and schedules
```

Everything is cached by the plan's signature (`planSig`, as the renderings are): the model is only rebuilt when the
option changes.

### The generator (`lib/bim.mjs`, built)

Pure functions, no DOM, no binary, tested in Node (`test/bim.mjs`) on options laid out on the real lots the site plan
tests use. For each building in an option:

- **Levels**: one an elevation across the site (each use has its own floor height, `USES[use].floorH`), the tower above
  its podium.
- **Exterior walls** a storey, along the outline, drawn clockwise so they face out, with a **wall type per use**:
  tilt-up for industrial, CMU and brick for retail and restaurants, steel stud and EIFS for office, medical and hotel,
  wood frame with brick for apartments and homes, metal panel for storage. Parapets on flat roofs.
- **Openings**: storefront with a door every fourth bay on the side facing the nearest parking (shops, restaurants,
  amenity); 6 × 6 window bands on offices; punched windows on apartments; a door and garage door (or windows, rear-load)
  per home or townhome; dock doors and two drive-ins along a warehouse's truck court, its office corner on the front;
  a back door. BIMCraft refuses overlapping openings, which caught two bugs in the trial.
- **Floors**: slab on grade, then wood framing (apartments, homes) or concrete on metal deck a storey. **Roofs**: TPO
  behind a parapet, or hipped 5:12 shingles for homes, duplexes and townhomes.
- **Townhome party walls** between units. Not yet: retail demising walls, apartment unit walls, stairs and shafts.
- **Homes**: the plan's home area is living area, so the floor above a 2-storey home is drawn smaller (the garage, about
  220 sf a car, and the porch stay on the ground floor) under a porch roof. Homes and townhome rows of one plan are
  modelled once and counted (`count`), not 600 houses in one model.

### Where it runs: a worker (`worker/bim/`, built)

The CLI build needs glibc 2.35 (checked: its highest symbol is `GLIBC_2.35`), one more than Vercel's runtime is
believed to have, so it runs in a small container instead: `worker/bim/Dockerfile` builds BIMCraft's CLI at a pinned
commit (without the Revit reader, so the licence stays MIT OR Apache-2.0) next to our `lib/`, and `server.mjs` answers
`POST /model { plan }` with the quantities, the IFC, the `.bimcraft` file and a 3D picture, behind a bearer token
(`BIM_WORKER_TOKEN`). It still has to be deployed (Fly.io, Cloud Run, Render, or any host that runs a container), and
then an `api/bim.js` on Vercel forwards to it (`BIM_WORKER_URL`, the token as a server-side secret).

### The cost side (`lib/estimate.mjs`)

Decided Oct 26: the budget stays **$ per sf by type** (retail, office, multifamily, industrial, townhomes, single
family; mixed use is any combination), as the team budgets today; past budgets exist but are mostly that. So the model
does not replace the $/sf; it **checks and adjusts it**. Each type's $/sf assumes a typical building of that type; the
model measures how this one differs, in the ratios estimators use for it:

- **Wall-to-floor ratio** (exterior wall area ÷ floor area): a long thin or L-shaped building has more wall per sf
  than a box, and walls are the costliest part of a shell. The trial measured 0.59 for a 78,000 sf warehouse, 0.65 for
  a 20,000 sf shop building, 0.41 for a 3-storey office.
- **Glazing ratio** (glass ÷ wall): 5% for a warehouse with an office corner, 24% for the office.
- **Storeys, roof area per floor area, openings (docks, garage doors), party walls.**

Against a typical building of the type (set from past budgets: their GSF and $/sf, plus the ratios of their model),
these give an adjustment, shown beside the $/sf: "this layout's shell runs about 4% above a typical retail building".
Later, if wanted, the full assembly pricing below.

An assembly table, each with a unit, a low, likely and high price, a source and a date: exterior wall by type ($/sf of
wall), storefront and windows ($/sf of glazing), doors (each), roof by type ($/sf), slab on grade and elevated floors
($/sf), interior partitions ($/lf at a height), shafts, stairs and elevators (each), plus per-sf allowances for what a
massing model can't see (MEP by use, fire sprinklers, finishes, foundations). Editable in the app like the pro forma's
assumptions today, with the ranges feeding the existing sensitivity table. Starting prices from public data with their
source noted; calibrated against our own jobs as soon as we have them.

## Trial results (Oct 26)

Built BIMCraft 0.8.0's CLI (commit b36160b, 1.5 minutes, an 11.5 MB binary) and ran `lib/bim.mjs` on a real option of
each type: retail (2 buildings, 40,000 sf), office (2, 137,226 sf, 3 storeys), apartments (5 with the clubhouse), a
warehouse (78,209 sf), townhomes (16 rows, one modelled), single-family (24 homes, 8 plans modelled) and a 20-acre
mixed-use tract (shops, pads, apartments, townhomes, duplexes; 12 models for 20 buildings).

- **Every option builds**, in 0.3 s (the warehouse) to 6.5 s (the mixed tract), IFC 27 kB to 1.3 MB.
- **Floor areas match the plan to the square foot** for every commercial, apartment and townhome building. Homes come
  out above the plan's living area by their garage and porch, as they should.
- **The IFC opens in `web-ifc`** (the browser library for the 3D view): walls, windows, doors, slabs, roofs and storeys
  all come through as meshes. Not yet tried in Revit.
- **The 3D picture** is BIMCraft's own: plain, orthographic, no shadows. Good for checking the model; the realistic
  view stays the three.js scene and the renderings.
- **The worker runs in its container** (Node 22 on Debian bookworm with the CLI): the mixed tract came back over HTTP in
  8.2 s. The Dockerfile's first stage (cloning and compiling BIMCraft) could not run in this sandbox, whose HTTPS proxy
  the build container doesn't trust; the same build ran outside Docker. `test/bim.mjs` also starts the server and asks
  it for a model whenever `BIMCRAFT_CLI` is set.

## Phases and effort

| Phase | What | Effort | Done when |
|---|---|---|---|
| ~~0. Spike~~ (done) | Build the CLI; write one real Waller option's scripts by hand; export IFC, schedules and a PNG; open the IFC in `web-ifc` and in Revit; time a 20-building plan; try the musl build and Vercel | 2 to 3 days | A written verdict: does it model our buildings right, how fast, where it runs |
| 1. Model | `lib/bim.mjs` for every use and form, the runner, storage by `planSig`, **Download IFC** on an option | 1 to 2 weeks | Every test fixture turns into an IFC that IfcOpenShell validates, and the floor areas match the plan's GSF within 1% |
| 2. Estimate | `lib/estimate.mjs`, the assembly table, the Budget section by assembly with a range and the class, the pro forma using it | 1 to 2 weeks | Ten real options priced both ways, the differences explained; checked against at least one past job |
| 3. 3D and sheets | The IFC in the three.js scene from `MASSING-PLAN.md`; the model's plans, elevations and schedules on the plan set | 1 to 2 weeks after the scene exists | A rendering made from the BIM model keeps every window band and roof where the model has it |
| 4. Agents | The site plan AI and our MCP able to change the model ("make building B three storeys, brick") through BIMCraft's MCP | Later | Decided after phase 2 |

## Risks

- **Young project, fast-moving API.** Pin a version, keep every command behind `lib/bim.mjs`, and a contract test that
  runs the pinned CLI on the fixtures (in CI, not in `npm test`, which must stay fast and offline).
- **Which fork.** Several copies of the same repository exist; we pin a commit, keep a copy of the source we build
  from, and can fork it ourselves if it stops moving.
- **Big plans.** Its validation runs over the whole model after every command; their own benchmark is a 9,521-element
  tower. Fine for commercial sites; homes are modelled once per plan type, not per lot.
- **Quantities vs. reality.** A massing-level model has no structure, MEP or finishes detail. Those stay allowances,
  shown as such, and the estimate is shown as a range, never as one exact number.
- **Unit prices** dominate accuracy. Without our own job data the estimate will be better shaped than today's, not
  necessarily closer to the bid.

## Open questions

Answered Oct 26: BIMCraft may be built; a worker is fine; budgets are $/sf by type (past budgets exist); the types are
retail, office, multifamily, industrial, townhomes, single family and mixed use (any combination).

1. Where to host the worker: an account on Fly.io, Cloud Run or Render (a small always-on or scale-to-zero container).
2. Which past budgets can be shared (GSF, type, $/sf, and the site plan or drawings) to set each type's "typical"
   building for the adjustment.
