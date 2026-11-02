# Reading the project files

Read every file the project has before deciding anything. For each one, note what it says and how sure that is: a
survey is better than a plat, a plat is better than appraisal-district map data, and all of them are better than a
sketch. When two sources disagree, write both in `facts`, use the more conservative value, and add a risk.

## The acreage rule

The total site acreage is the basis for the scale check, the land budget, detention and density. You need it
**confirmed by the user**:

- If a survey, plat, deed or the app's project page states it, quote it back ("The survey shows 8.106 ac. Is that the
  site?") and wait for a yes.
- If nothing states it, ask.
- Put it in `site.stated.acres`, and its source in `site.stated_source`. `build_siteplan.py` fails if the drawn
  boundary is more than 2% off. If that happens, find out why (right-of-way in or out, a parcel missing, units, a
  "fit to page" PDF) before you go on.

## What to take from each kind of file

| File | Take | Into |
|---|---|---|
| **Boundary survey / ALTA** (PDF, DXF) | Boundary, bearings and distances, acreage, easements (type, width, recording), building lines, encroachments, flood note, utilities shown, adjoining ROW widths | `site.boundary`, `easements`, `streets[].row_width`, `facts` |
| **Plat / replat** | Lot lines, building lines, easements, ROW dedications, plat notes (often setbacks, drainage, access restrictions) | `setbacks` (cite the plat), `easements`, `code.rules` |
| **Title commitment** (Schedule B) | Easements, deed restrictions, use restrictions, access agreements | `easements`, `risks`, `code.rules` (deed restrictions are binding even where there's no zoning) |
| **App: Map File (GeoJSON)** | The site outline, front and street sides (and any plan already drawn, for reference only) | `geojson_to_site.py --into` |
| **App: CAD (DXF)** | The lot, setback line, any existing plan | `extract_geometry.py` |
| **App: Site Plan PDF / Copy Summary / Land Use CSV / Pro Forma** | An earlier option's program and numbers, the guardrail scenarios, risks | A candidate to beat in `hbu`; `risks` |
| **App: project Overview → Jurisdiction & site** | County, city or unincorporated, zoning, FEMA zone, MUD / WCID, school district, TIRZ, Opportunity Zone, busiest road and its traffic, EPA sites nearby, power / water / sewer, ground elevation and fall | `site.jurisdiction`, `flood_zone`, `utilities`, `facts`, HBU evidence |
| **App: property card / parcels** | Owner, appraised value (land value is a check on residual land value), acres, legal description | `site.parcels`, `facts` |
| **App reports** (FEMA, environmental, traffic, drive time, market) | Flood limits, environmental flags, traffic counts (AADT), trade-area demographics, rents, absorption, nearby supply | `facts`, `risks`, HBU evidence, `market.json` |
| **Flood study / FIRM / LOMR** | Zone, BFE, floodway limits | `flood_zone_poly`, `floodway_poly`, `facts` |
| **Drainage report / outfall letter** | Detention rate, outfall type and capacity | `detention_rate_acft_per_ac` (the greater of this and the guardrail), `detention_cls`, `detention_source` |
| **Utility / MUD letters** | Provider, line sizes and locations, capacity commitments | `site.utilities`, `facts`; capacity is VERIFIED only with a written commitment |
| **Zoning ordinance / UDC excerpts / PD** | District, permitted uses, dimensional standards, parking, landscape | `code.rules` with section numbers |
| **Geotech / environmental (Phase I)** | Fill, expansive clay, RECs, wetlands | `risks` |
| **Earlier site plans, renderings, floor plans** | Program, product sizes (a known pad prototype, a unit plan) | Building types; a candidate to beat |
| **The user's notes / email** | Goals, a tenant, a deadline, a budget, a use already decided | `hbu`, the program |

Write down the source of every fact you use ("survey by X dated Y, sheet 1"). The sheet lists sources, and the hand-off
carries them into the plan set.

## Getting geometry into the model (feet, x right, y up)

- **GeoJSON:** `python3 <skill>/scripts/geojson_to_site.py file.geojson --into site-model.json`. It projects to feet
  around the site's centre (north up, `north_deg` 0), sets `edges.front` / `street_side` from the app's street lines,
  and lists an existing plan's elements in `site.reference_elements` (for reading only; never copied into the layout).
- **DXF / DWG / vector PDF:** `python3 <skill>/scripts/extract_geometry.py file --acres <ac> --out intake/`. Copy the
  top-ranked boundary (it should be within 2%) and the easements from `intake/geometry.json`. Set `north_deg` from
  the drawing's north arrow (clockwise degrees from straight up).
- **Scan / photo / sketch:** the same script writes `intake/grid.png`. Trace the boundary in pixels, set
  `site.coord_units: "pixels"`, then `python3 <skill>/scripts/fit_site.py site-model.json --acres <ac>`. Do this
  **before** you lay anything out, because fit_site scales only the boundary-type fields. Say on the sheet
  (`boundary_source`) that it is fitted from a sketch.
- **Several parcels:** join them into one boundary only if they touch and the user confirms they're one site. List the
  parcels in `site.parcels` and add a replat risk.

Then add the streets (`streets[]`: centreline `pts`, `row_width`, `pavement_width`, `name`, `authority`, `aadt`),
placing the centreline half the ROW width outside the property line unless the survey shows otherwise. Set
`display_rotate_deg` so the main frontage is at the bottom of the sheet.
