---
name: fs-set-plans
description: Build a full Finishes Solutions schematic design (SD) plan set — cover, general notes, code analysis, civil, landscape, architecture, structural, mechanical, plumbing, electrical, fire / life safety, telecom and renderings — as one 24 x 36 PDF on the Finishes Solutions title block, from a site layout and the project's documents (an fs-site-plan hand-off model, the app's plan-set PDF with G-001 and C-101, DWG / DXF / PDF site plans, or images of hand-drawn layouts, plus survey, program, flood / utility facts, renderings). Use when the user asks for a "full set of plans", "plan set", "SD set", "construction-style drawings" or "/fs-set-plans" for a project.
---

# fs-set-plans — a full schematic design set from a site layout

You turn a project's site layout and documents into one issued schematic design set: every sheet on the Finishes
Solutions 24 x 36 title block, numbered to the US National CAD Standard, drawn by code from **one project model** so
the sheets agree with each other. You never draw or retype a sheet: you write the model, and the generator draws
plans, elevations, sections, roof plans, details, MEP layouts, schedules and checks from it.

## The three rules that decide whether the set is any good

1. **The site layout is the design. Follow it exactly.** The layout the user gives you (fs-site-plan's SP-1, the
   app's C-101, a CAD plan, a sketch) was chosen by someone. Every building, its shape, size and position, every
   parking row and stall count, every drive, pond and walk comes from it. Never move, resize, re-shape, add or drop
   any of them to make the set "work". A skewed L stays a skewed L on the site sheets. If the layout has a problem
   (a building over the parking, parking short, no detention), draw it as given and **report** it on the cover and in
   your summary; the set checks word it for you. The earlier sets that were rejected had redesigned the site.
2. **Numbers come from the drawing, not from you.** Acreage, building area, stall counts, detention and setbacks are
   measured by the generator from the geometry and checked against what the reference states
   (`site.stated`). When they disagree, fix the geometry until they agree, or report the disagreement. Never type a
   number into the notes that the drawing doesn't show.
3. **Honest level.** It is a *schematic design* set for feasibility, pricing and consultant kickoff. Every sheet
   carries "PRELIMINARY — NOT FOR CONSTRUCTION, BIDDING OR PERMIT" and is never sealed; engineering sheets say they
   are rule-based. Never call anything permit-ready, engineered, approved or code-compliant.

## Files in this skill

- `scripts/build_set.py` — validates the building designs, picks the sheets, draws them, runs the set checks.
  `--validate-only`, `--list`, `--half` (adds an 11 x 17 copy), `--contact` (writes `contact-N.png`, six sheets per
  image, for a cheap look at the whole set).
- `scripts/read_model.py` — takes the project model out of an SP-1 (or plan-set) PDF, which carries it as an
  attachment, and prints a short summary instead of the JSON.
- `scripts/extract_geometry.py` — reads a DXF, DWG (via a converter), vector or scanned PDF, or image; ranks the closed
  shapes against the acreage; writes `geometry.json` and a preview, or a pixel grid to trace sketches on.
- `scripts/fit_site.py` — scales a model traced in pixels (or unscaled PDF points) to the real acreage.
- Python: `pip install reportlab pypdf ezdxf pdfplumber pillow` if any are missing. Poppler (`pdftoppm`,
  `pdftotext`) for previews.
- `assets/titleblock.pdf` — the Finishes Solutions border. Do not edit.
- `assets/example-project.json` — a complete working model (retail shell, restaurant, six homes). Copy its shape.
- `references/intake.md` — **taking the site off the reference. Read first.**
- `references/project-model.md` — **every field of the model. Read first.**
- `references/building-design.md` — designing each building type's floor plan (schema, rules, checks).
- `references/set-definition.md` — which sheets a set gets, and the set checks.
- `references/notes-writing.md` — the cover notes and each discipline's notes and criteria.
- `references/waller-guardrails.md` — the owner's site-planning guardrails (mandatory for Waller-area sites).

`<skill>` below means this skill's folder.

## Workflow

### 1. Collect the references, and always the total acreage

Read every document the user gave (`pdftotext -layout` for text; `pdftoppm -r 40` to look at a page, `-r 80` and
`-x/-y/-W/-H` to crop into a detail). **You must have the total site acreage before modelling the site.** If the user
hasn't stated it, ask. If a document shows one (G-001's project data, a plat, a survey), use it when the user's task
names the same acreage, including a rounded one ("~20 acres" for 20.78 ac: use 20.78 and mention it); otherwise quote it
back and ask them to confirm.

Ask in one message only for what you can't find: project name, client / owner, project number, option name,
drawn-by initials, sections wanted (default: everything except Telecom). If the user said "just do it", use sensible
defaults and list them in your summary.

### 2. Get the site into `project.json`

Work in `./plan-set/<project-slug>/`. Pick the path by what you were given (details in `references/intake.md`):

- **An SP-1 site layout PDF from fs-site-plan**: it carries its model. Run
  `python3 <skill>/scripts/read_model.py SP-1.pdf --out project.json` first: it writes the `project.json` (exact
  geometry, parking rows, ponds, stated values, facts) and prints a short summary. Build from that; don't trace the
  PDF. Exit code 3 means this PDF has no model (an older or other sheet): take the site off the drawing as below.
- **A `<slug>-site-model.json`** given as a file: the same model. Pass it through `read_model.py` too (it copies it and
  prints the summary). **Never open, cat or print a model file**: it can be large, and reading it into the conversation
  is what overflows the prompt.
- **The app's plan-set PDF (G-001 cover + C-101 site plan)** or any vector site-plan PDF:
  `python3 <skill>/scripts/extract_geometry.py <pdf> --acres <ac> --page <C-101 page> --out intake/`.
  The C-101 prints its scale, so shapes come out in feet: the boundary is the top candidate (within 2 %), and the
  building, parking field and paving are the next largest shapes (each appears 2–3 times; they're duplicates of
  fill and stroke). Read `G-001` / `C-101` text for the project data: gross area, building sf, uses, **stalls counted
  on plan**, ADA, required parking and its basis, notes. Put those in `site.stated` and `site.parking`.
- **DXF / DWG / other PDF**: same script; follow intake.md for units and scale.
- **A sketch or photo**: trace on `intake/grid.png`, then `fit_site.py --acres`.

Look at `geometry.json` with a short script (print the ten largest closed shapes with their areas); don't read or
print the whole file, it can hold thousands of shapes.

Then fill the model from `<skill>/assets/example-project.json`'s shape, replacing **everything** (its data is fake):

- `site.boundary` and every building as its exact `poly` from the drawing (an L, skewed or not, is one poly).
- **`site.parking_rows`**: one row per stall row on the reference, `a`→`b` along the curb, `side` the stalls are on,
  `stall_w` / `stall_d`, `ada` / `van` counts. Get the row lengths and positions from the parking field's shape and
  the stripes on the plan. The build counts the stalls it draws and compares them with `site.stated.stalls`: adjust
  the rows until they match (or explain why they can't, e.g. the reference draws stalls under the building).
- `drives` (centreline, width) for every drive aisle and the entrance down to the street; `paving` for the parking
  field, drives and walks; `ponds` only where the reference draws one; `streets` from the reference or the address
  (ask which street the site fronts if neither shows it); `setbacks` per the guardrails.
- `north_deg` from the drawing's north arrow; `display_rotate_deg` so the main street ends up at the bottom.
- `site.stated`: `acres` (required), `building_sf`, `units`, `stalls` as the reference states them.
- `facts`: site constraints and due diligence, tagged VERIFIED REQUIREMENT / OWNER GUARDRAIL / ENGINEERING ASSUMPTION
  / UNVERIFIED. Never invent a fact.

### 3. Design each building type

Group the buildings into types (use, footprint to the foot, stories, shape; at most eight). A type's `W`, `D` and
`fp` describe its outline in its own square frame: for an L, give `fp` as the L's six corners with leg lengths and
widths measured along the walls of the site poly. A skewed or angled footprint is drawn exactly on the site sheets;
its architectural sheets use the squared outline of the same leg lengths and area. Say so on the cover notes.

Write each type's `design` per `references/building-design.md` and run
`python3 <skill>/scripts/build_set.py project.json --validate-only` until it says ALL PASS. A multi-tenant retail
building gets one `tenant` room per bay, each with its own restroom and rear door; the generator gives every tenant
its own RTU, panel and meter, leaves the shell's lights and outlets to the tenant, and draws the meter centre. A use
it can't design (apartments, hotels, self storage) gets no `design`; say "building sheets by others".

### 4. Write the words

Fill `notes` and `disc` per `references/notes-writing.md`. Short, factual, from the references only; unknowns say
"to be confirmed". Put every set-check finding about the site (parking short, stalls under the building, detention
missing) in the cover's site constraints with its classification.

### 5. Build, check, look

```
python3 <skill>/scripts/build_set.py project.json --list                 # sanity-check the sheet list
python3 <skill>/scripts/build_set.py project.json --out out/ --contact   # the set, its checks and contact sheets
```

Exit code 2 means a design or set check failed. A check that's a modelling mistake (the boundary is off, a row is
mis-placed, the building area disagrees): fix the model and rebuild. A check that's a real finding about the layout
(parking short, a stall under a building, detention missing or short): leave it, make sure the cover says it, and
report it. Never "fix" a finding by adding stalls, ponds or area the reference doesn't show.

Then **look**: view `out/contact-*.png` (the whole set in about six images). Check, at minimum:

- C-101 matches the reference layout: same building shape and position, same parking rows and count, north arrow
  pointing the same way as the reference's.
- C-102 dimension strings read and no setback dimension is red unless the reference really violates it.
- A-101 / A-111 / A-201 / A-301: plan at a real scale with walls, doors, windows and dimensions; elevations show the
  storefront and materials; sections are cut through the building.
- One MEP sheet: devices inside rooms, nothing piled on a room name.

Zoom in (`pdftoppm -f N -l N -r 80`) only on a sheet that looks wrong. Fix the model and rebuild if anything is off.

### 6. Deliver

Give the user the PDF path (and the 11 x 17 if made), the sheet count, and a short summary. The set PDF carries the
final `project.json` (with the building designs) and its sheet index as attachments, so the renderings agent needs only
the PDF.

- where the site came from and how the scale was set;
- what the set contains (sections, building types) and that the layout was followed as given;
- **every finding about the layout** (from the set checks) and every UNVERIFIED item that matters;
- the assumptions you made (e.g. the squared outline of an angled building, the street it fronts);
- that it is a schematic design set, not for construction, bidding or permit, needing licensed professionals.

Keep `project.json` with the PDF: a revision is an edit to the model and a rebuild, plus a row in
`project.revisions`.

## Working efficiently

A good run of this skill costs a few dollars, not more. Most of the cost is images and large text going back into
the conversation, so:

- Look at pages at `-r 40` (a 36 x 24 sheet is then 1440 px wide). Crop to zoom; don't re-render whole pages at high
  resolution.
- Use `--contact` instead of rendering sheets one by one; look at each contact image once per build.
- Read `geometry.json`, `project.json`, `set-check.txt` and the reference text with short scripts and `head`, never
  whole. To change a field of the model, edit it with a few lines of Python, not by printing and rewriting the file.
- Don't rebuild to check a typo in the notes; batch your fixes, then rebuild.

## Rules

- Follow the site layout exactly; report its problems instead of fixing them.
- Never fabricate site facts, approvals, providers, consultants or numbers. Unknown → "to be confirmed".
- Never put a seal, a license number or the firm registration number on a sheet; never remove the preliminary box.
- Don't hand-edit the PDF or draw sheets outside the generator; if a sheet the user needs isn't generated, add it as
  an `extra_sheets` notes sheet (see `references/project-model.md`) or tell the user it's missing.
- Use renderings for A-9xx only if the user supplied them; caption them as AI concept illustrations.
