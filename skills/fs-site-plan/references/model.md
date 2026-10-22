# The layout model (`site-model.json`)

One JSON file drives the sheet, the checks and the hand-off. It's a **superset of the fs-set-plans `project.json`**:
everything fs-set-plans reads is here in the same shape, plus the fields this skill adds. `assets/example-site-model.json`
is a complete, passing example. Copy its shape.

Coordinates are in feet, x to the right and y up, in the reference drawing's own frame (origin anywhere, usually the
boundary's lower-left corner). Don't rotate the geometry yourself: set `display_rotate_deg`.

## Top level

| Field | What |
|---|---|
| `project` | `name`, `client`, `address`, `county`, `number`, `option`, `date`, `drawn_by`, `checked_by` (left blank for a person), `revisions` [{no, date, desc}] |
| `guardrails` | `{on: true, count_factor: 0.05}`: the Finishes guardrails (mandatory near Waller); `count_factor` is the parking reserve |
| `hbu` | `selected`, `statement`, `candidates` [{use, legal, physical, feasible, yield, rank, chosen}], `evidence` [] (see highest-best-use.md) |
| `code` | `jurisdiction`, `zoning`, `code_set`, `sources` [], `rules` [{item, req, measure, kind: min/max, limit, provided, cls, source}] (see code-research.md) |
| `facts` | Site facts, each with its source and class where it matters: "UNVERIFIED: sewer capacity not confirmed (no MUD letter)." |
| `risks` | Unresolved risks, as strings or {text, stop: true} for stop conditions |
| `layout_notes` | Short notes on the layout's logic, printed in Notes |
| `accepted_warnings` | [{check: text matched in the warning, why: the reason, printed on the sheet}] |
| `fire` | `{hose_reach_ft: 150}` (raise it only with a verified sprinklered-building allowance) |
| `site` | below |
| `types` | below |
| `notes`, `disc`, `sections`, `team` | Optional fs-set-plans fields, passed through to the hand-off unchanged |

## `site`

| Field | What |
|---|---|
| `boundary` | [[x, y], …] property line, no repeated closing point |
| `stated` | `{acres}` **required**, the user-confirmed acreage; `stated_source` names it |
| `north_deg` | the direction north points on the reference, in degrees clockwise from straight up |
| `display_rotate_deg` | degrees counter-clockwise to turn the drawing so the main street is at the bottom |
| `edges` | `{front: [i], street_side: [i]}`: boundary edge indices (edge i runs from corner i to i+1). Optional: worked out from `streets` when missing |
| `setbacks` | `{front, side, rear, street_side}` ft: building setbacks per edge kind (with the guardrail +5% when on) |
| `buffers` | `{front, side, rear, street_side}` ft: landscape buffers (drawn green dotted; paving should stay out) |
| `boundary_source`, `jurisdiction`, `zoning`, `parcels`, `flood_zone`, `firm_panel`, `utilities` | Text for the site data table |
| `streets` | [{name, pts (centreline), row_width, pavement_width, authority, aadt, fire_access}] |
| `easements` | [{label, poly, no_build: true}] areas, or [{label, pts}] lines |
| `flood_zone_poly`, `floodway_poly` | Approximate limits; buildings in the floodway fail the build |
| `buildings` | [{name, type, x, y, w, d, rot}] (centre, width along the front, depth, degrees CCW) or [{name, type, poly}]; optional `floors`, `units`, `height_ft` overrides |
| `parking_rows` | [{name, a, b, side: left/right, stall_w, stall_d, ada, van}]: a row of 90° stalls along a→b, on the left or right of it. Made by `parking_field.py` |
| `parking_extra` | `{count, basis}`: stalls not drawn as rows (garages, driveways) |
| `paving` | [{kind: parking / drive / walk, poly}]: other paved areas (drive-thru lanes, plazas, truck courts) |
| `drives` | [{name, pts (centreline), width, fire_lane}]: every drive; fire-lane drives are used for the fire checks |
| `ponds` | [{name, poly (top of bank), depth_ft, freeboard_ft, side_slope, volume_acft (only if a study states it)}] |
| `detention_rate_acft_per_ac`, `developed_acres`, `detention_cls`, `detention_source` | Detention basis (developed acres default to the whole site) |
| `lots` | [{id, poly}] residential lots |
| `open_space` | [{label, poly}] amenity / landscape areas that are on purpose |
| `dumpsters` | [{x, y, w, d, rot}] (24 x 12 default) |
| `signs` | [{x, y}] monument signs |
| `dims` | [{a, b, text}]: dimension strings to show (key distances: storefront to drive, building to property line) |
| `lot_impervious` | The share of a residential lot counted impervious (0.45 default) |

## `types` (one per distinct building)

| Field | What |
|---|---|
| `id` | "A", "B", … (fs-set-plans draws A-101 for type A, and so on) |
| `use` | sfr, townhomes, duplex, multifamily, retail, restaurant, fuel, office, medical, industrial, storage, church, amenity, hotel, other |
| `label` | Plain name ("Drive-thru restaurant pad") |
| `W`, `D` | Footprint in feet (W along the street). Each building of the type should be within 15% of W × D; fs-set-plans flags more |
| `floors`, `floor_h` | Stories and floor-to-floor height in feet (height = floors × floor_h unless `height_ft` is given) |
| `attached`, `units_per` | Townhome / duplex rows |
| `units_per_bldg` | Multifamily units per building |
| `efficiency` | Leasable / sellable share of gross (multifamily default 0.85, others 1.0) |
| `parking` | `{spaces, per_sf}` or `{spaces, per_unit}` or `{fixed}`, plus `plus` (extra stalls), `basis`, `cls`: the required parking for the type |

## What the build measures (never type these in)

Site area and acres, land use by category (on a grid, so nothing is counted twice), footprint, GFA, FAR, coverage,
impervious and pervious cover, units and density, the smallest setback to each edge kind, the stall count, required
and accessible parking, detention storage per pond (side-slope volume), fire reach and fire-lane widths, building
height, and unassigned buildable land.
