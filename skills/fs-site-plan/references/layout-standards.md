# Laying it out: dimensions that get built, and how to make the most of the site

All values are typical planning dimensions (ENGINEERING ASSUMPTION). Local code governs when it's stricter or different.

## Order of operations

1. **No-go land first:** floodway (never built on), easements and pipelines (`no_build`), ROW dedication, visibility
   triangles, and the setback line (drawn red on the sheet).
2. **Access:** driveway locations the roadway authority will allow (on TxDOT roads, assume spacing in the low hundreds
   of feet depending on speed, and confirm it), aligned with median openings or the driveways across the road. Then the
   main circulation spine and fire lanes.
3. **Detention on the least valuable land:** the back, an awkward corner, a floodplain fringe, under power lines, or
   along a pipeline easement where allowed. Never on frontage that could hold a pad, unless it's the outfall side and
   there's no alternative. Size it from the volume, not by eye: the build computes the side-slope volume.
4. **Buildings where their value is:** pads and retail on the frontage, residential and storage behind.
5. **Parking in efficient modules,** aligned with the longest dimension of each area (`parking_field.py`). Size it to
   the target and no more.
6. **Service:** loading, dumpsters (screened, reachable by a truck without backing across a drive aisle), and
   drive-thru stacking.
7. **Fill and check:** every leftover piece of buildable land either gets a use or a reason.

## Parking and drives

| Element | Typical |
|---|---|
| 90° stall | 9 x 18 ft (some codes 9 x 20); a double-loaded bay (stall + aisle + stall) is 60 ft with a 24 ft aisle |
| 60° / 45° angled | 9 ft stall, aisle 18 / 13 ft one-way, module about 56 / 49 ft |
| Two-way drive / aisle | 24 ft; 26 ft where it's a fire lane serving a building over 30 ft |
| Fire lane | 20 ft clear minimum, 26 ft at aerial access, 13 ft 6 in vertical, turnaround past 150 ft of dead end |
| Accessible stalls | 8 ft + a 5 ft aisle (van: 8 ft + 8 ft); the nearest stalls to entrances; the count is from 2010 ADA 208.2 (the script checks it) |
| Gross parking area | about 330–350 sf per stall including aisles |
| Driveway throat | 30–40 ft on a commercial drive; keep the first stall back from the street (stacking) |
| Landscape islands | at row ends and every 10–15 stalls where the code requires (each costs about 1 stall) |

`parking_field.py --rect cx,cy,length,depth,rot` fills a rectangle with bays: depth 60 = one double bay, 102 = a
double + a single, 120 = two doubles. `--ends none` when drives already run along both ends. Put the accessible stalls
(`--ada`, `--van`) in the row nearest the main entrance.

## Products

| Use | Building | Site |
|---|---|---|
| **Retail strip** | 60–100 ft deep (shop space); 100–140 ft for junior anchors; 14–20 ft clear | Storefront facing the road across the parking; 10–15 ft storefront walk; rear service drive or a loading area; dumpster enclosures 12 x 24 ft |
| **Drive-thru restaurant / QSR pad** | 2,000–4,500 sf, about 60–70 x 45–60 ft | 0.6–1.2 ac per pad; a 12 ft drive-thru lane wrapping the building that loops back into circulation; stacking of 8–12 cars (about 20 ft a car) before the order point; 10 per 1,000 sf parking |
| **Fuel / c-store** | 4,000–6,000 sf store; canopy with 6–8 MPDs | 1.5–3 ac, corner preferred, two driveways, a tanker path |
| **Office / medical** | 2–4 stories, 100–120 ft deep floor plates | Parking 3.5–5 per 1,000 sf drives the land; structured parking only at high land values |
| **Multifamily (garden walk-up)** | 3 stories; buildings about 60–70 ft deep, 160–260 ft long; 950 nsf average unit | 20–28 units/ac; 50–60 ft between buildings (fire and light); clubhouse, pool, mail, compactor; parking at 1.5–2 per unit within about 200 ft of doors |
| **Townhomes** | 20–28 ft wide units in rows of 4–8 | Lots about 24 x 100 ft, or a condo regime; rear-loaded alleys add density |
| **Single-family** | 40–60 ft lots; Waller 57 x 114 ft (59 x 118 under the guardrails) | 50–60 ft local street ROW (27–28 ft pavement); street and ROW take 25–30% of the land |
| **Industrial / flex** | Rear-load 180–220 ft deep, cross-dock 300+; 28–36 ft clear | Truck court 130 ft (60 ft apron + trailer parking); 50 ft trailer stalls; car parking on the office end |
| **Self storage** | Drive-up buildings 30–40 ft deep; multi-story climate controlled | 25–30 ft aisles between buildings; gated with 2–3 car stacking outside the gate; office with 4–8 stalls |

## Detention

- Storage is a **volume**. The build computes it from the pond's top-of-bank outline, `depth_ft` (storage), `freeboard_ft`
  (1 ft default) and `side_slope` (4:1 under the Waller guardrails; 3:1 is common elsewhere, so state it as an
  ENGINEERING ASSUMPTION). Long narrow ponds lose a lot to their slopes. Wider is more efficient.
- Leave a 15–20 ft maintenance strip around the top of bank (as open space), plus the outfall structure and an
  overflow on the outfall side.
- A deeper pond holds the same storage on less land. Offer it as an option with its assumption ("assumes a 6 ft deep
  pond; confirm the outfall depth with the civil engineer"), never as the base case without a reason.
- Underground storage or a wet amenity pond are options on valuable land. Say what they assume.

## Making the most of the site

The checks flag the usual waste. Respond to each one:

- **Unassigned buildable land over 5%:** add building area, another pad or more units, or say why not (market depth,
  parking, access) in `accepted_warnings`.
- **Over-parked by more than 15%:** shrink a parking field or give its land to building area.
- **Detention more than 20% over:** shrink the pond.
- Then try a different arrangement: flip the building to the other side, turn the parking bays 90°, move the pond to a
  side strip, swap one big building for two, or put the pads where the drive-thru stacking works.

Compare the arrangements on leasable + sellable square feet (printed by every build) or residual land value, and keep
the best one that passes everything.
