# Montreve: site layout, cabin plans, budget and pitch

One-off project for the Montreve property: 2481 Happy Hollow Road, Sevierville, Tennessee (Sevier County parcel
122 005.00, 35.72487, -83.68966). Goal: lay out the site the way Will Essner's business plan has it (wedding pavilion,
dining, pickleball and tennis), price it, and pitch cabins for sale on their own lots around a private resort core.

## What's here

| File | What it is |
|---|---|
| `out/Montreve_Site_Plan.pdf` | Conceptual site plan, 36 × 24 in at 1" = 70'. Lots to scale, roads, a cabin on every for-sale lot, the resort core on lots 10–15, parking, trail loop, site data and notes. |
| `out/Montreve_Cabin_Plans.pdf` | The cabin's floor plans (basement, first, second, roof) redrawn as vector PDFs at 1/4" = 1'-0". |
| `out/Montreve_Budget_ProForma.xlsx` | The model with live formulas: Inputs (low / base / high, each with its source), Budget and break-even for three programs, Resort operations, Owner economics, Price sensitivity, quarterly Cash flow. |
| `out/Montreve_Investor_Presentation.pdf` | 16:9 pitch deck built from the model, the site plan and the cabin plans. |
| `data/lots.json` | The 30 lots in feet (traced from the vector lot map), listed vs. drawn acres, use, roads, site outline. |
| `data/model.json` | Every number the deck quotes. |
| `source/` | The vector lot map, the original floor-plan screenshots and the logos. The two business plans are not committed (private financials); they're cited below. |

## Rebuilding

```bash
python3 -I projects/montreve/scripts/lots.py        # lot geometry from the vector lot map
python3 -I projects/montreve/scripts/floor_plans.py # cabin plans PDF + data/cabin_footprint.json
python3 -I projects/montreve/scripts/model.py       # budget / pro forma workbook + data/model.json
python3 -I projects/montreve/scripts/site_plan.py   # site plan PDF (uses lots + cabin footprint)
python3 -I projects/montreve/scripts/deck.py        # presentation (uses all of the above)
```

Needs `pymupdf shapely reportlab openpyxl svglib pillow` (pip), `pdftoppm` and Node with Playwright (the deck is printed
by the preinstalled Chromium). Change an assumption in `scripts/model.py` `INPUTS` (or directly in the workbook's Inputs
sheet) and re-run.

## What the numbers say (base costs)

| Program (24 cabins for sale) | Total cost | Break-even per cabin | At $1.30M |
|---|---|---|---|
| A · Cabins only, amenities deferred | $27.6M | $1.24M | +$1.3M |
| B · Lean resort (3,000 sf pavilion, service kitchen, courts, trails) | $31.4M | $1.41M | −$2.5M |
| C · Full resort (6,000 sf pavilion, 2,500 sf dining, courts, trails) | $35.4M | $1.59M | −$6.5M |

- $1.30M a cabin covers the cabins, the site work and about $0.64M of amenities, not Will's full program.
- A new cabin costs about $946k all-in (the project's own contract, $683k per home, +4%, plus lot work, furniture, soft costs and contingency).
- Peak cash need for the full program is about $10.9M (equity plus construction loans), including repaying the $5.3M on the 7 homes.
- The resort core roughly breaks even as a business in the base case ($58k NOI). It earns its keep by supporting the cabin price.
- Comparable 3-bed indoor-pool cabins in Sevierville were listed around $900–950k (asking, Oct 2026). $1.30M is a 40% premium that the resort, lots and newness have to carry.

## Limits

- **Lots** are traced from the marketing lot map, scaled by the listed acreages (1 in on the poster = 119 ft). 24 of 30
  lots agree within 4%; lots 18, 22, 26, 27, 28 and 33 draw smaller than listed (the poster clips them). Lot 2 draws at
  0.68 ac, matching the appraisal's 0.67 usable acres (the rest is the septic / utility easement). The entrance road
  along lots 1–3 is digitized by hand from the poster. **North is assumed; there's no topography.** Everything needs
  a boundary and topographic survey before it's real.
- **Existing homes** are drawn in a standard position, not as built.
- **Costs** are allowances, not bids. Spent-to-date is the Oct 20 cost report, not reconciled to the ledger.
- **Parcel data:** this session could not reach Regrid or county GIS (network policy), so the parcel record and
  outline weren't pulled here. The app now looks parcels up anywhere in the US (see below).

## Getting the parcel in the app

The property card and Regrid lookups used to stop at the Texas border. They now work anywhere in the US: search
`35.72487, -83.68966`, click the ground, and use **Get owner, value & zoning from Regrid** for the owner, value,
zoning and parcel outline (one Regrid record). **Site plan** on the card should then start a project on that outline, but that path is untested outside Texas, and the site checks (city limits, flood, utilities) are Texas-only.
This needs the change deployed (it's on this branch).

## Sources

- Montreve Smoky Mountain Resort Business Plan, prepared for Will E., Oct 22, 2026 (program, allowances, operating
  assumptions, costs to date, loan balances).
- Smoky Mountain Montreve Fractional Ownership Business Plan, Sep 18, 2026.
- Montreve vector lot map, Oct 2026, from the recorded May 11, 2007 plat (LMB 9/90, instrument 07042733).
- Owner-supplied cabin floor plans (684 + 880 + 880 sf).
- Market: active Sevierville listings ([tnsmokymtnrealty.com](https://www.tnsmokymtnrealty.com/vacation-cabins-sale-sevierville-tn/)),
  local management-fee ranges ([hemlockhillscabinrentals.com](https://hemlockhillscabinrentals.com/blog/gatlinburg-cabin-rental-management-companies/),
  [kingsofrealestate.com](https://news.kingsofrealestate.com/buying-investment-cabin-pigeon-forge-tn-2026/)), searched Oct 30, 2026.

## The layout in Real Estate Intelligence (Projects › MONTREVE MOUNTAIN CLUB › Full program)

Built by `build/projects/montreve.mjs` and saved by the **Seed project** workflow (`project: montreve`, `offline: 1`).
It replaces the team's copy of the project, keeping the Regrid parcel record and Option A as they were
(`build/projects/montreve.saved.json`).

- **Where the lots are:** `scripts/georef.py` lays the traced lots on the Regrid parcel outline (30.05 ac) by best
  overlap: no turn (the lot map is drawn north-up) and 2.5% larger than the acreage scaling, 92% overlap. Output:
  `data/plan_geometry.json` (lots, roads clipped to the parcel and named, the lot 2 easement, the three amenity sites).
- **The ground:** `data/terrain.json`, USGS 3DEP 1 m lidar from the app's own terrain service (six 700 ft tiles, merged
  to 10 ft). 1,348 to 1,837 ft; every lot's median slope is 34-70%.
- **Roads:** the plat's 50 ft rights-of-way traced to their centrelines (`scripts/roads.py`: skeleton, pruned, smoothed,
  chained into the network and nudged clear of the lots), drawn as 24 ft paved roads: Creeksong Way from Happy Hollow
  Road, Amber Valley Way up the hairpin and along the ridge, and the south stub.
- **Cabins (24):** each square to its street and centred on its lot, the deck on the downhill side (away from a road
  below it, toward a road above it), the floor facing the road at road grade with a short straight driveway (most
  10-28 ft). The lidar sets the setback: 11 are clean walk-outs, 20 show 15 ft of foundation or less, the steepest three
  about 37 ft. The seven financed homes are placed the same way (their real positions aren't surveyed).
- **Resort core (lots 10-15), one composed plan:** every piece on one grid square to the core's frontage, strung along a
  10 ft stone promenade (it steps down once, by the cocktail terrace). Upper side, west to east: tennis court, two
  pickleball courts, court pavilion and viewing deck, dining terrace, The Lodge (2,500 sf dining and catering) with its
  service yard, cocktail terrace, the 6,000 sf glass pavilion and its drop-off (own lane from the road). Lower side: two
  parking bays (76 spaces, a 150-guest wedding needs about 60) entered from Amber Valley Way with a stair walk to the
  promenade, the village green, a fire-pit overlook and the ceremony lawn with garden borders in front of the pavilion.
  The whole plan is slid as one (`designCore`) to the spot with the fewest clashes and least earthwork. Walls: 7-17 ft
  at the buildings and terraces, about 23 ft at the pavilion and lawn, 33-34 ft at the tennis court and upper parking bay
  (tier them or step the design).
- **Option B, the owners' resort concept** (second plan, `mv-option-b`, `buildOption({ detail: true })`, laid out after
  the owners' "overall resort concept" sketch). The lots, roads and cabins are the Full program's, in the same places.
  The resort is one terrace on the uphill side of Amber Valley Way (`STRIP`, `designStrip`, in road feet: distance along
  the road and back from it):
  - **Along the road:** 11 rows of 8 head-in spaces straight off the road (88; cuts 7-12 ft), then an 8 ft stone
    promenade.
  - **The line of buildings, west to east:**
    - tennis court below and four pickleball courts on the terrace above, fenced, with a court pavilion and viewing deck;
    - pool and spa on a fenced deck, with the pool house and fitness room;
    - dining terrace, then the Lodge and the catering kitchen side by side, with a service yard and trash behind;
    - cocktail terrace, the 6,000 sf wedding and conference hall, and a ceremony lawn terraced behind it, with the bridal
      cottage and garden beside it;
    - open-air pavilion and lawn, a fire-pit overlook and the maintenance barn.
  - **How pieces sit:** each is square to the stretch of road in front of it. The road bends about 35° at lot 11, so a
    piece is pushed back wherever the curve comes toward it, and slid along the road to the nearest spot clear of the
    others.
  - **Walls:** about 29 ft at the tennis court, the pickleball terrace and the hall; 17-20 ft at the Lodge and pool deck.
  - **Also:** a gated entry (`entryGate`: gate house, gate and mail kiosk on open verge), walk-out patios under 15 of the
    24 cabins' decks, and every lot kept wooded: the lot itself carries `trees: true`, so there's no separate
    landscape piece to pick by mistake. Trees are left out of the ceremony lawn.
- Every piece carries `grade` (pad elevation, fall, cut and fill, walls); the app's Selected box shows it.
