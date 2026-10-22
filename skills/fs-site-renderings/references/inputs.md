# The inputs, and checking them against each other

## What to use

| File | Where it comes from | Used for |
|---|---|---|
| **Project file** (`<slug>-site-model.json`) | fs-site-plan's hand-off, as the fs-set-plans agent left it (with `types[].design`) | Everything in 3D: boundary, buildings (`x, y, w, d, rot` or `poly`), types (`W, D, floors, floor_h, use`), `design` (rooms, windows, doors, roof, exterior), paving, `parking_rows`, drives, ponds, lots, open space, streets, dumpsters, signs, `north_deg` |
| **Plan-set PDF** + `sheet-index.csv` | fs-set-plans `out/` | Elevation references (`plan_refs.py`), and the cross-check |
| **SP-1** (`<slug>-site-layout.pdf`) | fs-site-plan | The cross-check of the site |
| Earlier renderings, the app's renderings | The project files | Only to compare. Never as an input image, because they may not match the current plans |

If there are several project files, use the one whose `project.revisions` and `source_layout` match the plan set's title
block (its issue / revision rows). When in doubt, ask.

## Cross-check before rendering

1. **Site:** the same number of buildings in the same places on C-101 (set) and SP-1. If the set was built from an
   older layout, stop and tell the user.
2. **Types:** each type's storeys and footprint (`W x D`) match its A-1xx / A-2xx sheets (the sheet subtitle reads
   "Retail strip, 430' × 120'").
3. **Materials:** the "Exterior materials" table on each A-2xx sheet (`pdftotext -layout`) matches the type's
   `design.exterior`. The prompt quotes `design.exterior` word for word.
4. **North:** `site.north_deg` is right. It sets the direction of the sun, so the midday shadows fall to the north.

## What the scene adds by rule (and says so in `scene.txt`)

- **Trees** in open-space areas and along the street-side buffer (about 35–42 ft apart), because the model has no tree
  positions. The prompt keeps them where they are. Run with `--no-trees` if the landscape plan should be the only source.
- **Rooftop units** on flat commercial roofs (one per 5,000 sf).
- **A 5 ft walk** round every building, and **parapets** (3 ft) on flat commercial roofs. fs-set-plans draws the same parapet.
- **Canopies** over storefronts when the design's exterior notes mention a canopy or awning.
- **Facades:** placed exactly as the elevation sheets place them (`window_positions` / `door_geometry` in fs-set-plans).
  A type without a `design` gets a generic pattern, and `scene.txt` says so.
