# Jones Road Self Storage: how the plan was traced

The **Self storage** quick layout's "Official site plan (as drawn)" (lib/storagesite.mjs) is the engineer's plan traced
off the sheet, not redrawn by the layout engine. This note records the sources and the measurements so it can be checked.

## Sources (owner's files, not in the repository)
- *Final SITE PLAN_Jones Road.pdf*: M Lanza Engineering, P.L.L.C., "Jones Road Self Storage", Proposed Self Storage,
  10514 Woodedge Dr., Houston TX 77070, Sept 23 2026, 1" = 30'-0", sheet 1/1.
- *10514 Woodedge Dr SURVEY (3).pdf*: Precision Surveyors, 2.4815 ac (Tract 1: 2.4163 ac, W. H. York Survey A-943;
  Tract 2: 0.0652 ac, Unrestricted Reserve "F", Woodedge Village Sec 1). The site plan's boundary is Tract 1.
- *Budget For Jones Rd Storages.xlsx*, *ALL Company Budget For Jones Rd Storages.xlsx* (the in-house version, about 10%
  lower), *Jones_Rd-_Storage.xlsx* (CRE Tech 10-year cash flow).
- The county parcel: APN 0460430000203 (Harris), owner on the roll Amdavadi Partners LLC.

## Method
The sheet was rendered at 300 dpi; at 1" = 30' that is exactly 10 px a foot. Every building edge, the property lines,
the pond walls, parking rows, gate and entrance curbs were found by scanning the raster for line centres and converted
to feet. Every value was checked against the dimension strings on the sheet; all agree within 0.1 ft:

| Check | Sheet | Measured |
|---|---|---|
| Lot width (Woodedge / back) | 201.53 / 201.54 | 201.55 / 201.56 |
| Long sides (east / west) | 520.97 / 523.59 | 520.99 / 523.58 |
| East row (Bldg 6, 5, 4) | 130, 20, 120, 25, 50; 15 deep; 10 off the line | 130.0, 19.95, 120.0, 25.0, 50.0; 15.0; 10.0 |
| Aisles | 30 (east), 27.5 (west), 25 (back, by Bldg 3) | 30.0, 27.6, 25.0 |
| Bldg 7 | 235 × 65, 5 ft notches 25 ft from its back | 235.0 × 65.0, notch 80–90 ft from the east line |
| West row (Bldg 1, 2) | 125, 20, 125; 20 deep; 10 off the line | 125.0, 19.95, 125.0; 20.0; 9.95 |
| Bldg 3 (L) | 60 × 20 and a 20 × 70 leg | 60.0 × 20.0, 20.0 × 70.0 |
| Office | 25 × 30, 25.5 from Woodedge | 25.0 × 30.0, 25.47 at its middle |
| Pond | 100 × 176 inside (17,600 sf), 104 × 180 outside | 100 × 176, 104 × 180 |
| Parking | 9 + 10 (10 × 19) and 2 × 5 at the office | the same; office stalls 9.1 ft |
| Entrance | 36 ft | 35.5 between curb lines, 36.2 outside them |

The whole plan is stored in the sheet's feet and placed on a site by the best rotation and shift of its four corners
onto the site's (a rigid fit: no scaling). Drives and walks are pulled back 0.05 ft (half an inch) from what they meet,
so shared edges turned to the site's angle don't read as overlaps.

## Where the documents disagree
- **Unit counts:** the plan's unit table (and the budget and pro forma) count 221 units, 24,275 rentable sf. The labels
  drawn on the buildings add up to 216 units, 24,625 sf; the difference is all on Bldg 7 (labels: (25) 10x10 and (18)
  10x20 climate-controlled, (4) 5x10 non-climate; table: 31, 12 and 9). The layout uses the table.
- **Bldg 7's floor area:** the budget's 15,275 sf is 235 × 65; the drawn outline less its two notches is 15,175 sf. The
  layout carries the budget's figure.
- **The county's parcel outline** is about 199 × 513 ft (2.35 ac), against the survey's 201.5 × 521–524 ft (2.416 ac).
  On that outline the plan goes down by the best fit (about 6 ft off at the corners) and its setbacks are read looser
  by that much; with the boundary drawn to the survey it fits exactly.
- **Parking:** 29 spaces drawn; the app's count is 28 (one space kept for an accessible space's aisle).
- *Building Setbacks_Houston.pdf* is the Houston Heights historic districts' design guideline; it doesn't apply to this
  site (unincorporated Harris County, no zoning). *TxDOT_Houston.pdf* is the generic driveway permit checklist
  (Woodedge Drive is a county road, so a TxDOT permit shouldn't be needed for this entrance).
