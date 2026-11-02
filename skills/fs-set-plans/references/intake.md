# Taking the site off the reference drawing

**Have an SP-1 from fs-site-plan (or its `<slug>-site-model.json`)?** Run `python3 <skill>/scripts/read_model.py SP-1.pdf
--out project.json` and skip this page: the PDF carries the model, already a `project.json` in feet with parking rows,
ponds and stated values. Only an exit code 3 (no model in the PDF) brings you back here.

The total site acreage is the basis for everything. **Get it from the user before modelling the site** (or from a
survey / plat they supplied, then confirm it with them). It goes in `site.stated.acres`; `build_set.py` refuses to
build a site without it.

Run the intake script on the main site drawing first:

```
python3 <skill>/scripts/extract_geometry.py <file> --acres <total acreage> --out intake/
```

Then open `intake/preview.png` (or `intake/grid.png`) and look at it before writing any geometry.

## DXF (best)

- Coordinates come out in feet using the drawing's `$INSUNITS` (inches, millimetres and metres are converted;
  "unitless" is assumed to be feet and flagged).
- Every layer's closed shapes (polylines, and loose lines chained end to end) are listed with their areas in
  `intake/geometry.json`, biggest first, and numbered on the preview as `LAYER#n`. Blocks are exploded.
- The **boundary candidates** are ranked by how close each closed shape is to the stated acreage. The top one should
  be within 2 % and sit on a property-line layer. If nothing is within 2 %, stop and work out why: wrong units, a
  boundary drawn in pieces that didn't close, or an acreage that includes or excludes right-of-way. Ask the user
  rather than guess.
- Copy coordinates straight from `geometry.json` into `project.json`: the boundary, building footprints (as `poly`),
  paving, ponds, lots and easements by layer. Read drive centrelines from the paving, and labels (street names, lot
  numbers, building names) from `texts`.
- Survey-grade geometry can be very large numbers (state plane coordinates). That's fine; the generator draws relative
  to the boundary.

## DWG

The script converts DWG to DXF with LibreDWG (`dwg2dxf`) or the ODA File Converter when either is installed, then
reads it as DXF. Neither is installed in most sandboxes. If the conversion fails, ask the user for a DXF export
(AutoCAD: SAVEAS, AutoCAD 2018 DXF) or a vector PDF. Don't try to read the DWG any other way.

## PDF

- **Vector PDF** (exported from CAD): lines, rectangles and curves are read and chained into closed shapes. The sheet
  scale is found from text like `1" = 60'`, or pass `--scale 60`. With a scale, everything is in feet and ranked
  against the acreage like a DXF. Without one, the shapes are in PDF points: fit them with `fit_site.py` (below).
- **Check the scale.** A PDF printed "fit to page" no longer matches the scale printed on it. The acreage ranking shows
  this: the boundary will be off by the same factor on both axes. Then fit to the acreage, and say so in the summary.
- Also run `pdftotext -layout` for the site data table, unit counts, parking and notes.
- **Scanned PDF** (an image of a drawing, almost no linework): the script renders it to `intake/grid.png`. Treat it as
  an image (below).

## The app's plan-set PDF (G-001 cover + C-101 site plan)

The Finishes Solutions app issues a short "plan set" PDF: G-001 (cover with project data, program & parking, notes)
and C-101 (overall site plan, coloured, printed to scale). It is a vector PDF, so:

```
python3 <skill>/scripts/extract_geometry.py set.pdf --acres 0.93 --page 2 --out intake/
```

- The scale is read off the sheet (`1" = 20'-0"`), so shapes come out in feet. The boundary is the top candidate
  (expect under 1 % off). The next largest shapes are the paving / walk band, the parking field and the building, each
  listed two or three times (fill and outline): take one of each.
- Print just the largest shapes, e.g.
  `python3 -c "import json;g=json.load(open('intake/geometry.json'));[print(i,len(p),p) for i,p in enumerate(g['layers']['pdf']['closed'][:12])]"`.
- `pdftotext -layout` on both pages gives the project data: gross site area, building sf, uses, **surface stalls
  counted on plan**, ADA, needed at the ratios used, and the notes. Those go in `site.stated` (`acres`,
  `building_sf`, `stalls`) and `site.parking` (`required`, `basis`).
- Parking rows: the parking field is a rectangle (often rotated); its stripes show how many rows run along it. Rows
  of 9 ft stalls along the field's long side, 18 ft deep, with 24 ft aisles; check your row count × stalls against the
  stated count. The plan's own notes may say the building overlaps the parking: draw both as given and report it.
- The C-101 may not draw the street or a pond. Take the street from the address and the reference's notes (ask if
  unclear); don't add a pond it doesn't show (the set check reports the detention requirement).

## Images of hand-drawn layouts (JPG / PNG / phone photos / scans)

1. `extract_geometry.py sketch.jpg --acres 7.71` writes `intake/grid.png`, the picture with a labelled pixel grid
   (red every 100 px across, blue every 100 px down, lighter lines every 50 px).
2. View `grid.png`. Trace the boundary corners and every element (buildings as `poly` corners, drives as centreline
   `pts`, ponds, lots) **in grid pixel coordinates, x right and y down**, into `project.json`. Set
   `site.coord_units` to `"pixels"`. Put the real-world sizes you know into the real-feet fields (drive `width`,
   street `row_width`, pond `depth_ft`, setbacks); those are not scaled.
3. Fit to the real size:
   ```
   python3 <skill>/scripts/fit_site.py project.json --acres 7.71
   ```
   This flips y, scales everything so the boundary is exactly the stated acreage, and moves it to (0, 0). If the
   sketch has one trustworthy dimension (a frontage written on it), use `--known x1,y1,x2,y2=feet` instead. That checks
   the sketch's proportions against the acreage, and the build fails if they disagree by more than 2 %.
4. Hand drawings are rarely to scale. After fitting:
   - make each building type's `W` and `D` match its fitted footprint, or adjust the footprint to the program's real
     size. The build flags any building more than 15 % off its type.
   - In the summary, tell the user the geometry was traced from a sketch and fitted to the acreage. Distances on the
     site sheets are approximate.
5. Photos taken at an angle distort the shape. Ask for a straight-on scan if the boundary is clearly skewed.

## North

Read the north arrow on the drawing and set `site.north_deg`: the direction north points on the sheet, in degrees
clockwise from straight up. Never assume north is up. If there's no north arrow, ask the user, or say so on the
cover's site constraints.
