# The project model (`project.json`)

One JSON file drives every sheet. `assets/example-project.json` is a complete, valid example: copy its shape.

## Top level

| Field | Required | What |
|---|---|---|
| `project` | yes | `name`, `client`, `address`, `county`, `number` (project no.), `option` ("Option B"), `date` ("Oct 22, 2026"), `drawn_by`, `checked_by` (leave "" for a person to initial), `revisions` ([{no, date, desc}], oldest first; issue 0 = first set) |
| `sections` | no | which sections to draw: `general` (always), `civil`, `landscape`, `arch`, `structural`, `mechanical`, `plumbing`, `electrical`, `fire`, `renderings`, `telecom`. Default: all but `telecom`. Dropping `arch` drops structural, MEP and fire (they're drawn on the designs). |
| `facts` | no | site constraints / due diligence lines for the cover and C-101, each prefixed with its classification where it matters, e.g. "UNVERIFIED: water provider not confirmed." |
| `site` | for site sheets | below |
| `types` | for building sheets | below |
| `notes` | no | cover words: `description`, `general_notes` [], `codes` [], `next_steps` [] (see notes-writing.md) |
| `disc` | no | per discipline (`civil`, `landscape`, `arch`, `structural`, `mechanical`, `plumbing`, `electrical`, `fire`, `telecom`): `{ notes: [], criteria: [{item, value}] }` |
| `team` | no | {"Civil engineer": "Firm name", …} — only names the references give |
| `renders` | no | [{file (path relative to project.json), caption}] — one A-9xx sheet each, max 9 |
| `extra_sheets` | no | notes-only sheets: [{number, title, sub, section, columns, blocks: [{heading, kind: list/bullets/text/table, items | rows+head+cols}]}] |

## `site` — geometry in feet

**Coordinate frame.** Use the reference site plan's own sheet frame: x to the right, y up, in feet, origin anywhere
convenient (e.g. the boundary's bottom-left corner). Do not rotate the geometry yourself.

**Getting the scale.** Start with `scripts/extract_geometry.py` (see intake.md): for DXF, DWG and scaled vector PDFs it
gives coordinates in feet directly; for sketches you trace in pixels and `fit_site.py` scales to the acreage. By hand:
find the scale bar or the stated scale ("1" = 60'") and confirm it with a labelled dimension
(a lot width, a building length, a boundary call). For a PDF: render with `pdftoppm -r 150` and measure pixel
distances (pixels / 150 = inches on paper × feet-per-inch). For a vector PDF, `pdfplumber` (if installed) can give
exact line coordinates in points (÷ 72 × feet-per-inch). Always check the boundary area against the stated acreage;
the build fails if they differ by more than 2 % and `site.stated.acres` is given.

| Field | What |
|---|---|
| `boundary` | [[x, y], …] property line, in order (no repeated closing point) |
| `coord_units` | "feet" (default), or "pixels" while a sketch is still traced in image pixels (y down): run `fit_site.py` before building |
| `north_deg` | the direction true north points **on the reference sheet**, degrees clockwise from straight up (north arrow pointing left = 270) |
| `display_rotate_deg` | degrees counter-clockwise to turn the drawing so the main street is at the bottom of the site sheets (0 if it already is). The north arrow turns with it automatically. |
| `boundary_source` | "survey by …", "county appraisal district parcels", "the conceptual site plan" |
| `flood_zone`, `firm_panel`, `jurisdiction`, `parcels`, `zoning`, `utilities` | strings for C-001 (only what the references say) |
| `flood_zone_poly` | optional [[x, y]] floodplain limit to draw on C-001 |
| `setbacks` | {"front": 26.25, "rear": 10.5, "side": 5} — apply the guardrails' +5 % to published minimums |
| `streets` | [{name, pts: [[x, y], …] centreline, row_width}] adjoining roads |
| `easements` | [{label, poly}] or [{label, pts}] (a line) |
| `buildings` | [{name, type (a type id), poly}] — the exact outline from the drawing, any shape (an L, skewed or not, is one poly) — or [{name, type, x, y (centre), w, d, rot (degrees CCW)}] for a plain rectangle. `w` runs along the building's front (street side) when `rot` = 0 and the front faces −y (down). |
| `paving` | [{kind: parking / drive / walk, poly}] |
| `parking_rows` | [{name, a: [x, y], b: [x, y], side: left/right (of a→b), stall_w (9), stall_d (18), ada, van}] — one per row of 90° stalls on the reference; accessible stalls first (8 ft + 5 ft aisle; van 8 + 8 ft). The drawn stalls are counted for C-101, G-001 and the checks; stalls a building sits on are left off and reported. The fs-site-plan hand-off writes these. |
| `drives` | [{name, pts (centreline), width, fire_lane: true/false}] — utilities, inlets, fire lanes and site lights are placed along these, so include every drive and parking aisle |
| `ponds` | [{name, poly (top of bank), depth_ft, side_slope (3 = 3:1, default), freeboard_ft (1), volume_acft (only if the references state it)}] — only ponds the reference draws. Volume is a stage-storage from the shape; C-202 draws the enlarged pond. |
| `lots` | [{id, poly}] single-family / townhome lots |
| `open_space` | [{poly}] |
| `parking` | {required, basis} — `provided` and `ada` are counted from `parking_rows` when there are rows (otherwise give them from the plan) |
| `detention_rate_acft_per_ac` | default 1.0 (owner guardrail); use the jurisdiction's if higher |
| `developed_acres` | default: the site acres |
| `datum`, `bfe` | assumed grading datum (default 100.00) and base flood elevation if known (FFE ≥ BFE + 2 ft) |
| `stated` | **required `acres`**: the total site acreage the user gave (the build refuses without it). Also `building_sf`, `units` and `stalls` (parking stalls counted on the reference plan) when the references state them; the build flags any that disagree with what is drawn. |
| `existing_notes` | extra notes for C-001 |

## `types` — one per distinct building

| Field | What |
|---|---|
| `id` | "A", "B", … (A-101 is type A's plans, A-102 type B's…) |
| `use` | sfr, townhomes, duplex, retail, restaurant, office, medical, church, industrial, fuel, amenity, other (multifamily, hotel, storage: give no `design`) |
| `W`, `D` | footprint in feet: W along the street (left to right as seen from the street), D front to back. For an attached row, one unit. |
| `fp` | optional orthogonal outline [[x, y]…] in the type's frame for an L / U / stepped building (W, D = its bounding box). For a building drawn skewed or angled on the site, use the squared outline with the same leg lengths, widths and area; the site sheets still draw the exact poly. |
| `floors`, `floor_h` | stories and floor-to-floor height (ft) |
| `attached`, `units_per` | townhome / duplex rows: true and units per building (party walls left and right) |
| `count` | buildings of this type (worked out from `site.buildings` when they name the type) |
| `occupancy`, `construction`, `sprinklered`, `sprinkler_why` | optional overrides; worked out by rule otherwise |
| `target_gsf` | optional program area the design must hit within 3 % |
| `design` | the floor plan, see building-design.md |

## Where the numbers show up

- Site area, land use and program: G-001, C-101 (from the geometry — never typed in).
- Detention: C-202 (required = developed acres × rate; provided = stage-storage of each pond from its shape, side slope and freeboard, unless stated).
- Setbacks: C-101 / C-102 draw the setback line by edge (edges along a street are front, the opposite ones rear, the rest side) and dimension each building to the property line, red where it is closer than the setback.
- Hydrants, mains, inlets, lights, trees: placed by rule from `drives`, `buildings`, `boundary` (schematic).
