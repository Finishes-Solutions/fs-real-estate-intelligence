---
name: fs-set-plans
description: Build a full Finishes Solutions schematic design (SD) plan set — cover, general notes, code analysis, civil, landscape, architecture, structural, mechanical, plumbing, electrical, fire / life safety, telecom and renderings — as one 24 x 36 PDF on the Finishes Solutions title block, from the reference documents for a site (DWG, DXF or PDF site plans, or images of hand-drawn layouts, plus survey, program, flood / utility facts, renderings). Use when the user asks for a "full set of plans", "plan set", "SD set", "construction-style drawings" or "/fs-set-plans" for a project.
---

# fs-set-plans — a full schematic design set from the reference documents

You turn a project's reference documents into one issued schematic design set: every sheet on the Finishes Solutions
24 x 36 title block, numbered to the US National CAD Standard, drawn by code from **one project model** so the sheets
agree with each other. You never hand-draw or retype a sheet; you write the model, the generator draws.

What makes a set good (and what earlier AI-made sets got wrong):

- **Derived, not redrawn.** Every site sheet is drawn from the same boundary and building geometry; north comes from the
  reference's own north arrow (a set whose north arrow pointed up while the site plan's pointed left was rejected).
- **Numbers agree.** Totals (acres, building sf, units, parking, detention) come from the model and are checked against
  what the references state. A set that admits its unit areas don't match the site plan is not issued.
- **Honest level.** It is a *schematic design* set for feasibility, pricing and consultant kickoff. Every sheet carries
  "PRELIMINARY — NOT FOR CONSTRUCTION, BIDDING OR PERMIT" and is never sealed. Engineering sheets say they are
  rule-based. Never call anything permit-ready, engineered, approved or code-compliant.

## Files in this skill

- `scripts/extract_geometry.py` — reads the site drawing (DXF, DWG via a converter, vector or scanned PDF, image) and
  ranks its closed shapes against the stated acreage; writes a preview, or a pixel grid to trace sketches on.
- `scripts/fit_site.py` — scales a model traced in pixels (or unscaled PDF points) to the real acreage.
- `scripts/build_set.py` — validates the building designs, picks the sheets, draws them, lays them on the border,
  runs the set checks.
- Python libraries: `pip install reportlab pypdf ezdxf pdfplumber pillow` if any are missing (ezdxf for DXF / DWG,
  pdfplumber for PDF linework, Pillow for images and previews).
- `assets/titleblock.pdf` — the Finishes Solutions border (plot stamp and firm number removed). Do not edit.
- `assets/example-project.json` — a complete working model (7.7 ac: retail shell, restaurant, six homes). Copy its shape.
- `references/intake.md` — **how to take the site off a DXF, DWG, PDF or hand-drawn image. Read first.**
- `references/project-model.md` — **the model's fields and how to take them off the reference documents. Read first.**
- `references/building-design.md` — how to design each building type (schema, rules, the checks it must pass).
- `references/set-definition.md` — which sheets a set gets and why; sections the user can turn on and off.
- `references/notes-writing.md` — how to write the cover notes and each discipline's notes and criteria.
- `references/waller-guardrails.md` — the owner's site-planning guardrails (mandatory for Waller-area sites; their
  conservative defaults — 1.00 ac-ft detention per developed acre, +5 % on minimums — are good practice elsewhere too).

`<skill>` below means this skill's folder.

## Workflow

### 1. Collect the references, and always the total acreage

The references are usually a **DWG, DXF or PDF** site plan, sometimes a **photo or scan of a hand-drawn layout**,
plus whatever else the user has (survey, program / unit mix, flood information, utility letters, renderings). Read
every one fully: `pdftotext -layout` for text, and render pages with `pdftoppm -r 100` to look at them.

**Before modelling the site, you must have the total site acreage.** It is the basis for the whole set: it checks the
drawing's scale and units, it sets the scale of a hand drawing, and it is the denominator for land use and detention.
If the user hasn't stated it, ask for it, even if a drawing shows a number. When a document shows one (a plat, a
survey, a site-data table), quote it back and ask them to confirm. Never work it out from the drawing and carry on.

In the same message, ask only for what you can't find: project name, client / owner, project number, option name,
drawn-by initials, and which sections they want if they didn't say (default: everything except Telecom). If they said
"just do it", still get the acreage; use sensible defaults for the rest and list them in your summary.

### 2. Take the site off the drawing and build the project model (`project.json`)

Work in a folder like `./plan-set/<project-slug>/`. Follow `references/intake.md`:

```
python3 <skill>/scripts/extract_geometry.py <site drawing> --acres <total acreage> --out intake/
```

- **DXF / DWG / vector PDF:** coordinates come out in feet, with the closed shapes ranked by how close each is to the
  acreage. The boundary should match within 2 %. If none does, find out why (units, a scale printed "fit to page", a
  boundary in pieces, right-of-way in or out) before going on. Ask the user rather than guess.
- **Hand drawing / scan / photo:** trace on `intake/grid.png` in pixels, then
  `python3 <skill>/scripts/fit_site.py project.json --acres <total acreage>` scales it to the real size.

Then start `project.json` from a copy of `<skill>/assets/example-project.json` and replace **everything** (its data
is fake and labelled EXAMPLE). Follow `references/project-model.md`:

- `site.stated.acres` = the acreage the user gave (required: the build refuses without it), plus any building sf or
  home count the references state.
- `north_deg` from the drawing's north arrow; `display_rotate_deg` so the main street ends up at the bottom.
- Buildings, paving, drive centrelines, ponds, lots, easements, streets, from the drawing.
- `facts` = site constraints and due-diligence items, each tagged as the guardrails require
  (VERIFIED REQUIREMENT / OWNER GUARDRAIL / ENGINEERING ASSUMPTION / UNVERIFIED). Never invent a fact.

### 3. Design each building type

Group the buildings into types by use, footprint (to the foot), stories and shape — at most eight types; homes on the
same lot width are one type; townhome / duplex rows are designed as one unit and repeated. For each type write its
`design` per `references/building-design.md`, then run:

```
python3 <skill>/scripts/build_set.py project.json --validate-only
```

Fix every problem it lists and rerun until it says ALL PASS (normally one or two rounds). Then improve the plan as an
architect would (sensible adjacencies, closets, kitchen near dining, primary suite away from the living area) and
validate again. A use the generator can't design well yet (apartments, hotels, self storage) gets no `design`: its
site sheets still draw and the cover lists "building sheets by others".

### 4. Write the words

Fill `notes` (cover: description, general notes, codes, next steps) and `disc` (per-discipline notes and design
criteria) per `references/notes-writing.md`. Short, factual, from the references only; unknowns say "to be confirmed".

### 5. Build, check, look

```
python3 <skill>/scripts/build_set.py project.json --list           # the sheet list: sanity-check it
python3 <skill>/scripts/build_set.py project.json --out out/ [--half]
```

Read `out/set-check.txt`. Exit code 2 means a design or set check failed: fix the model and rebuild — **do not hand
over a set with failing checks** unless the failure is a real finding about the site (e.g. detention short), in which
case say so plainly in your summary (the sheet itself reports it).

Then **look at the drawings** before delivering: `pdftoppm -r 40 -png out/<slug>-plan-set.pdf out/png/p` and view at
least G-001, C-101, one A-1xx per type, one A-2xx and one MEP plan. Check the north arrow matches the reference,
buildings sit where the site plan has them, nothing is clipped or overlapping badly. Fix the model and rebuild if not.

### 6. Deliver

Give the user the PDF path (and the 11 x 17 copy if made), the sheet count, and a short summary:

- the drawing the site came from, and how the scale was set (drawing units, sheet scale, or fitted to the acreage
  from a sketch, in which case distances are approximate);

- what the set contains (sections, building types);
- the assumptions you made and every UNVERIFIED item that matters (flood, utilities, title, jurisdiction);
- any check that failed for a real reason (detention, parking, hose reach);
- that it is a schematic design set, not for construction, bidding or permit, and needs licensed professionals
  (surveyor, civil, architect, structural, MEP) to carry it forward.

Keep `project.json` with the PDF: revising the set is editing the model and rebuilding. For a re-issue, add a row to
`project.revisions` (number, date, what changed).

## Rules

- Never fabricate site facts, approvals, providers, consultants or numbers. Unknown → "to be confirmed".
- Never put a seal, a license number or the firm registration number on a sheet; never remove the preliminary box.
- Don't hand-edit the PDF or draw sheets outside the generator; if a sheet the user needs isn't generated, add it as
  an `extra_sheets` notes sheet (see `references/project-model.md`) or tell the user it's missing.
- Use the reference's renderings for A-9xx only if the user supplied them; caption them as AI concept illustrations.
