---
name: fs-site-plan
description: Build a one-page conceptual site layout PDF (SP-1, 24 x 36 on the Finishes Solutions title block) for a property: works out the highest and best use (or mix of uses), checks it against the jurisdiction's code, lays it out to make the most of the site, and hands a model to the fs-set-plans skill for the full plan set. Reads the project's files (survey, plat, parcel / app exports, flood, utility, traffic and market reports, zoning documents). Use when the user asks for a "site plan", "site layout", "test fit", "best use of this site", "highest and best use layout", "what fits here" or "/fs-site-plan" for a project.
---

# fs-site-plan: the best use of a site on one sheet, ready for the plan set

You turn a project's files into **one conceptual site layout sheet** that is:

1. **The right use.** The use (or mix of uses) that passes the four highest-and-best-use tests: legally permissible,
   physically possible, financially feasible and maximally productive. You test alternatives and show the comparison on
   the sheet. You don't just draw the first idea.
2. **Realistic and feasible where it is.** It's built from the site's real boundary, frontage, access, flood, utilities and
   the local market, using dimensions that get built (parking modules, fire lanes, truck courts, lot sizes, pond slopes).
3. **In accordance with the code.** Every requirement is listed with its source and classification
   (VERIFIED REQUIREMENT / OWNER GUARDRAIL / ENGINEERING ASSUMPTION / UNVERIFIED), measured against the drawing, and
   never claimed as verified when it isn't.
4. **A maximized use of the site.** Land not doing work is either filled or explained on the sheet. Over-parking and
   oversized ponds are flagged as wasted land.

The sheet is also the **input for the next agent**, which runs the `fs-set-plans` skill to draw the full schematic set.
Every build writes the PDF and a matching `project.json` in the fs-set-plans format, so that agent works from exact
geometry instead of tracing.

You never draw by hand. You write the **layout model** (`site-model.json`) and the scripts measure, check and draw it,
so the sheet, its tables and the hand-off always agree.

## Files in this skill

`<skill>` below means this skill's folder. Needs Python 3 with `reportlab` and `pypdf` (`pip install reportlab pypdf`),
plus `pdfplumber`, `pillow` and `ezdxf` for reading drawings. You also need `pdftoppm` / `pdftotext` (poppler) to look
at PDFs.

| File | What it does |
|---|---|
| `scripts/build_siteplan.py` | Measures and checks the model, draws SP-1 and writes the hand-off model. `--check-only` while iterating. |
| `scripts/testfit.py` | Land budget plus the most each candidate use (and mixes of uses) can hold. With market inputs it gives the residual land value that ranks them. |
| `scripts/parking_field.py` | Fills a rectangle with 90° parking bays and aisles (with accessible stalls) and adds them to the model. |
| `scripts/geojson_to_site.py` | Site outline from GeoJSON (the app's Map File export, Regrid, appraisal-district parcels) into the model, in feet. |
| `scripts/extract_geometry.py`, `scripts/fit_site.py` | Boundary and existing features from a DXF / DWG / PDF survey, plat or sketch (shared with fs-set-plans). |
| `assets/example-site-model.json` | A complete, passing model (8.1 ac highway retail, labelled EXAMPLE). Copy its shape, replace all of its data. |
| `assets/example-market.json` | The shape of market inputs for `testfit.py` (EXAMPLE numbers). |
| `assets/titleblock.pdf` | The Finishes Solutions 24 x 36 border. Do not edit it. |
| `references/intake.md` | **Read first.** What to take from each kind of project file, and the acreage rule. |
| `references/code-research.md` | **Read first.** Finding the controlling requirements, classifying them, and writing `code.rules`. |
| `references/highest-best-use.md` | The four tests, candidate uses, market inputs, test fits and mixes, and writing `hbu`. |
| `references/layout-standards.md` | Buildable dimensions per product and the order of operations for a maximized layout. |
| `references/model.md` | Every field of `site-model.json`. |
| `references/handoff.md` | What the fs-set-plans agent receives and what to tell it. |
| `references/waller-guardrails.md` | The owner's site-planning guardrails (mandatory in and near Waller; good defaults elsewhere). |

## Workflow

Work in a folder like `./site-plan/<project-slug>/`.

### 1. Read every project file, and get the acreage

Follow `references/intake.md`. Read every file the project has, not just the first: surveys, plats, title commitments,
the app's exports (Map File GeoJSON, CAD DXF, Site Plan PDF, Copy Summary, Land Use CSV, Pro Forma), property card
details, flood / environmental / traffic / market reports, utility letters, drainage reports, zoning or deed-restriction
documents, and the user's notes. Use `pdftotext -layout` for text, and render pages with `pdftoppm -r 100` to look at
them.

**You must have the total site acreage, confirmed by the user, before laying anything out.** If a document states one,
quote it back and ask them to confirm it. If not, ask. It goes in `site.stated.acres`, and the build fails if the boundary
is more than 2% off it.

In the same message, ask only for what the files don't answer: client, project number, option name, drawn-by
initials, whether a use is already decided, and any program the owner already knows (a tenant, a unit count). If they
say "just do it", still get the acreage. Use defaults for the rest and list them in your summary.

Then get the boundary into the model, in feet:
- GeoJSON (the app's export or a parcel): `python3 <skill>/scripts/geojson_to_site.py plan.geojson --into site-model.json`
- DXF / DWG / PDF / sketch: `extract_geometry.py`, then `fit_site.py` for sketches. See `references/intake.md`.

### 2. Establish the constraints and the code

Follow `references/code-research.md`. Determine the jurisdiction (city / ETJ / unincorporated county), the roadway
authority for each frontage, the drainage authority and detention rate, the FEMA zone, utilities and capacity status,
easements, deed restrictions, and the requirements for each use you are testing: setbacks, buffers, height, coverage /
FAR / impervious, density, lot size, parking ratios, landscape, fire access. Look up current ordinances when you can
(web search, the city's code site) and cite them. If you can't verify a requirement, use a conservative typical value,
mark it **UNVERIFIED**, and put it in `risks`.

Write `site.setbacks`, `site.buffers`, `site.detention_rate_acft_per_ac`, `code` (jurisdiction, code set, sources,
rules with `measure` / `kind` / `limit` so the build checks them), `facts` and `risks`. In or within half a mile of
the City of Waller, set `guardrails.on: true` and apply `references/waller-guardrails.md` in full.

### 3. Find the highest and best use

Follow `references/highest-best-use.md`. Screen candidate uses on legal and physical grounds. Then test-fit the
survivors, alone and in sensible mixes (pads on the frontage + a strip behind; retail frontage + multifamily behind):

```
python3 <skill>/scripts/testfit.py --model site-model.json --market market.json \
    --mix restaurant=1.6,retail=rest --mix retail=2,multifamily=rest --json hbu-test.json
```

Fill `market.json` only from sourced data: the app's Market page, reports in the project files, or figures the user
gives. Note each source. Without market data the uses can't be ranked on value. Say so, rank them on market evidence and
yield, and tell the user what data would settle it. If the user has already named the use, test it against at least
two alternatives anyway and report honestly if another one looks stronger, then draw what they asked for.

Write `hbu`: the `selected` use, a `statement` (why, with the evidence), and 3–6 `candidates`, each with its four-test
results, yield and rank, and the chosen one marked.

### 4. Lay it out, and make it the most of the site

Follow `references/layout-standards.md` (order of operations, dimensions, maximization tactics). Start from
`<skill>/assets/example-site-model.json` for the shape. Give each building a `type`, and give each type its `W`, `D`,
`floors`, `floor_h` and `parking` ratio. Use `parking_field.py` for parking areas. Iterate:

```
python3 <skill>/scripts/build_siteplan.py site-model.json --check-only
```

until there are **no FAIL lines**. Treat every **WARN** as work. Over-parked, oversized detention and unassigned
buildable land all mean land that isn't working. Fix it, or, when there's a real reason, add an
`accepted_warnings` entry `{check, why}`. The reason is printed on the sheet, so write it for the owner.

**Try at least two different arrangements** (for example, building at the front vs. the rear, pond at the side vs. the
front corner, one large building vs. several). Keep the one with the highest leasable + sellable square feet (or
residual land value) that passes. Mention the runner-up in your summary.

### 5. Build and look at it

```
python3 <skill>/scripts/build_siteplan.py site-model.json --out out/
pdftoppm -r 45 -png out/<slug>-site-layout.pdf out/sheet
pdftoppm -r 110 -png -x 300 -y 100 -W 1900 -H 1700 out/<slug>-site-layout.pdf out/zoom
```

Exit code 2 means a check failed and the sheet is stamped DRAFT. Fix the model and rebuild, and never hand off a DRAFT
sheet. Then **look at both images**:
- The street is at the bottom (`display_rotate_deg`) and the north arrow matches the source.
- Every drive connects to a street or another drive, and every parking aisle connects at both ends or has a turnaround.
- Every drive-thru lane loops back into circulation.
- Nothing overlaps that shouldn't, labels are legible, and buildings sit inside the red setback line.
- The tables on the right aren't cut off. If they are, shorten the text: the deliverable is always one page.

### 6. Deliver and hand off

Give the user:
- `out/<slug>-site-layout.pdf`: the sheet.
- `out/<slug>-site-model.json`: the hand-off model (an fs-set-plans `project.json`).
- `out/<slug>-checks.txt`: the measured checks.

Then add a short summary:
- the use chosen and why, with the alternatives and how they compared;
- the yield (building sf, units, lots), parking, detention and land use;
- every requirement that is UNVERIFIED and every stop condition;
- the accepted warnings;
- the next step: give the PDF **and** the `-site-model.json` to the agent running fs-set-plans
  (`references/handoff.md` has the message to pass on).

Keep `site-model.json` with the outputs. Revising the layout means editing it and rebuilding, and a re-issue gets a new
row in `project.revisions`.

## Rules

- Never fabricate a site fact, requirement, approval, market number or source. Unknown → UNVERIFIED, or "to be confirmed".
- Never call the layout permit-ready, construction-ready, code-compliant, approved, engineered, or a guaranteed yield,
  and never say utility capacity is confirmed. The build fails on those words. The sheet always carries the
  conceptual-plan label.
- Put the controlling requirements first: jurisdiction, flood / drainage, fire and life safety, access, utilities,
  setbacks, parking, constructability. Then marketability, then yield. Never maximize by breaking one of them.
- When two requirements conflict, use the stricter one until the conflict is resolved in writing.
- Keep it to one sheet, drawn only by `build_siteplan.py`. Don't edit the PDF.
- Use the reference's north and the real boundary. Never square up or resize a site to make a layout fit.
