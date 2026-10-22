# Handing off to fs-set-plans

The site layout is the input for the agent that runs the **fs-set-plans** skill (the full schematic design set: civil,
landscape, architecture, structural, MEP, fire, renderings). Every build writes what it needs:

| File | For the next agent |
|---|---|
| `<slug>-site-layout.pdf` | The reference site plan: a vector PDF at a printed engineering scale (`1" = 40'-0"` and so on), with the boundary, every building, pond and paving area as closed shapes. fs-set-plans' `extract_geometry.py` reads the scale and finds the boundary within 0.1% of the acreage. |
| `<slug>-site-model.json` | Also embedded in the PDF as the attachment `site-model.json` (fs-set-plans' `read_model.py` extracts it), so **pass on the PDF only**. Compact: coordinates to 0.01 ft, long outlines simplified to 0.25 ft, planning-only sections (hbu, code, risks) folded into `facts` and dropped; the build warns if it is over 300 KB. **The model to build from.** An fs-set-plans `project.json` with the exact geometry (feet, reference frame, `north_deg`, `display_rotate_deg`), `site.stated` (acres, building sf, units), `site.parking` (required, provided, accessible, basis), paving for every parking row and drive, pond volumes, building types with W, D, floors and floor height, and `facts` carrying every code rule and risk with its classification. |
| `<slug>-checks.txt` | The measured checks, for the record. |

What fs-set-plans still does itself: confirm the acreage with the user (its rule), design each building type (`design`),
write the notes and discipline criteria, and draw the set. This skill leaves `design` empty on purpose, because a
floor plan is that skill's job.

Tested: the example's hand-off builds a 12-sheet site / civil / landscape set in fs-set-plans with "Set checks: ALL
PASS", and its C-101 matches SP-1.

## The message to pass on

Give the user (or the next agent) both files and this note:

> Site layout SP-1 for <project>, <option>, issued <date>. The PDF carries the model: run `read_model.py` on it
> (an fs-set-plans project.json with the geometry in feet), so don't trace the PDF. The sheet and the model agree. Total site acreage: <acres> ac (confirmed by <user> from <source>). Building types <list> have
> no floor-plan designs yet. Unverified items that matter: <top risks>.

## If the layout changes later

Edit `site-model.json` (not the hand-off file), rebuild with `build_siteplan.py`, add a row to `project.revisions`,
and hand off the new pair. If the plan set has already been made, the fs-set-plans agent should start from the new
hand-off and carry its building `design`s across by type id.
