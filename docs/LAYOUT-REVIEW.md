# Site layout engine review (2026-10-26)

What the layout engine gets wrong today, why, and what to change. Every item comes from a run of the engine on test lots
(the survey below) and was traced to the code. Items marked **Fixed** are done on `experimental`; the rest are the plan.

## How this was checked

The engine (`lib/sitelayout.mjs` with `siteplan`, `siteparking`, `sitepad`, `sitecorner`, `sitepods`, `sitecompose`,
`streetnet`) was run on 8 lots × 17 programs (51 options) and every option drawn:

| Lot | Shape | Programs run |
|---|---|---|
| rect5 | 600 × 400 ft, 5.5 ac | apartments (as many as fit), retail 25,000 sf, self storage |
| notch8 | 920 × 378 ft with a notch, street on the short side, 7.7 ac | 200 apartments, 3 floors |
| trap20 | trapezoid, 716 ft frontage, 20 ac | 300 apartments; townhomes; warehouse 250,000 sf; retail + 200 apartments |
| narrow7 | 260 × 1,200 ft, 7.2 ac | townhomes |
| wedge10 | four-sided wedge, 10 ac | homes; retail 60,000 sf; office 80,000 sf |
| flag6 | flag lot: a 120 ft pole to the street, the body behind | apartments |
| irreg40 | six-sided, 40 ac | homes; duplexes; retail + 240 apartments + 80 townhomes + homes |
| pad1 | 210 × 230 ft, 1.1 ac | restaurant 2,500 sf |

## A. Things that are wrong (bugs)

1. **Fixed: the entry came in across a neighbour's land on a flag lot.** Every edge facing the same way as the street was
   treated as street frontage, so on a flag lot the body's back edges (300 ft behind the street) counted as the front and
   the main entry was drawn across them. Edges facing the street's way now count as the front only when they lie on (or
   within a jog of) the front line (`lib/siteplan.mjs` `edgeRoles`). The flag lot's entry now runs down the pole.
2. **Fixed: shops put behind the pond.** On a mix with shops in front, one search put the detention band across the whole
   frontage, so the shops lost the street. Shops at the front now never get a pond band in front of them, and shops with
   apartments behind them can have the pond beside them (before, only shops with homes behind could)
   (`lib/sitelayout.mjs` `mixedOptions`).
3. **Fixed (Oct 27): options handed back that fail their own parking check** (narrow townhome lot: every option 2–3 spaces short). The guest spaces still owed at the end now take the end homes of the longest rows (a row keeps at least 3), tested in `test/layoutasks.mjs`.
   Guest stalls for townhome rows are placed only where a row has room for three more units after them; what's still
   owed at the end is never placed, and the "parking short" retry doesn't apply to homes. Fix: place the owed guest stalls
   in a bay at the end of the last row (or reserve a bay per row up front), and re-check parking after the second
   entrance is added.
4. **Partly fixed (Oct 27): "No room for a second way in" on a 716 ft frontage.** The fire-access way in may now cross a park lawn along the frontage (the park is cut round it) when no clear line in exists and it breaks no check and costs no parking (the 20 ac townhome test now gets two ways in). Still open: planning it with the first entry; the 260 ft narrow lot still has no room for a second one 150 ft from the first. The second entrance is only looked for after the layout is
   finished, as a straight ray in from the street between buildings, so a row of buildings along the street blocks it.
   Fix: when the program will need two ways in (over 200 apartments or 30 homes, known before laying out), plan the second
   entry with the first, at another connector drive.
5. **A restaurant pad inside a ring of drive round a ring of lawn** (1.1 ac, 2,500 sf). The parking-field engine
   rewards a rear service drive for every restaurant, so it wraps a 45 ft building in collector drives sized for the
   parking, with lawn between. Fix: no service-drive bonus for a single small building; penalise lawn enclosed by drives.
6. **Duplexes laid out like apartments**: rows off parking aisles on 40 acres rather than on lots along streets. The
   subdivision street engine only takes single-family homes. Fix: let duplexes (and for-sale townhomes) use the street and
   lot engine on bigger sites; keep the parking-court product for when it's asked for.

## B. Things that work as designed but read as wrong

7. **Asking for a size gets more than asked** (60,000 sf retail gave two 60,000 sf buildings; 300 apartments gave 559).
   This is the **Leftover land: fill the site** default chosen earlier (the most leasable square footage the land holds),
   and the notes say so. **A decision for the owner:** keep it, or make "build what I asked, show what more fits as
   Phase 2" the default when a size is given. Agents calling the MCP tool see the same behaviour.
8. **Pads asked for in words only.** A program can't carry a top-level pad count; pads come from the words ("with two pad
   sites") or the AI's brief. Fine for typed requests; an agent passing structured fields can't ask for them.

## C. Weak results (the engine's limits)

9. **Mixed-use plans waste land.** On the 40 ac mix, the zones came out as thin bands across two-thirds of the site with a
   5.7 ac rectangular pond and open lawn on the rest; apartments fit 80–98 of 240 and townhomes 58–61 of 80. Causes:
   the pond's band is reserved at 1.2× its need plus a margin, the zone rows are sized from the whole site's average
   width (not the band's real width), only one frame direction is tried, and the land the pond leaves is "open land"
   rather than going to the zones that came up short. Fix: size the band from the pond, size rows from the real band,
   add rows to short zones before the last zone fills, try the other frame direction, give leftover strips to the zones.
10. **Partly fixed (Oct 27): the pond goes beside the buildings and leaves land behind it.** It now goes at the far end of the spare land, so what's left sits beside the drives. (retail + apartments: a lone apartment building
    between the parking and a big pond, open land behind the pond). Fix: when a band is reserved for the pond, put the
    pond against the back lot line and let the buildings take the land in front of it.
11. **No amenity or open space on big townhome sites** (247 townhomes on 20 ac, nothing but rows and parking). Only
    apartments get a clubhouse and pool. Fix: above about 40 units, add a commons block (lawn, playground, pavilion) to
    townhome and duplex layouts, or score open space.
12. **Apartments as a grid of small buildings in a sea of parking** on big sites (22 buildings on 20 ac). Fine for
    garden apartments but there's no podium, wrap, tuck-under garage or 4-story option to reach a unit count the land
    can't hold at 3 floors (notch8 fit 136–146 of 200 at 3 floors and didn't say what 4 floors would do).
13. **Partly fixed (Oct 27): options that differ only in detail.** A pods layout that meets more of the sized asks now takes the last place. The "different" check rounds building positions to a 60 ft grid, so two
    options with the same buildings and pond can both be shown (wedge office: three options, identical numbers, two of
    them nearly the same picture). A same-picture check was tried here and didn't change the survey's results; the
    better fix is to pick options for real differences (pond position, building arrangement, entry) on purpose.
14. **Drive network patched after the fact.** Aisles run past the last connector and are trimmed or capped later; an
    aisle that can't be joined is deleted with its buildings with only a note; entrances and dead-end fixes come after
    the options are ranked, so their parking isn't re-checked. Commercial zones end in a service drive the next zone's
    homes or apartments front onto.
15. **Scoring terms that reward odd results:** a compact first phase earns points for leaving land idle; empty depth in
    an apartment layout is nearly free; pond-placement bonuses can outweigh a pond across the frontage.

## D. "Lay out anything I ask": what a request can't say yet

The request goes from words to a program (the AI's program step, `api/siteplan.js`) to the engine. What's lost:

16. **Placement in a single-use plan** ("pool in the middle", "retail on the corner", "entry from the side street"):
    placement exists only on zones of a mixed plan, and only the pods engine (mixed sites of 15 ac or more with homes or
    apartments) honours it. No field says which street the entry is on.
17. **Different building sizes in one use** ("a 10,000 sf anchor and three 3,000 sf shops"): only through the AI's brief,
    and only for shops, restaurants, offices and similar parking-field uses with no zones. Not for apartments, homes,
    industrial or mixes.
18. **Parking structures other than a garage zone**: no tuck-under, podium or wrap apartments; "tower" is a 2-floor
    podium shape only.
19. **Drive layouts**: no one-way loop, rear alleys for townhomes (only the rear-load lane between rows), or a named
    drive pattern.
20. **Amenities**: a fixed list (lake, pavilion, courts, playground, lawn, dog park, restrooms, pool, clubhouse, center),
    only in an amenity zone; a single use gets four extras (patio, playground, lawn, drive-thru).
21. **Open space %, density (units an acre), buffers to neighbours, keep-out areas, floodplain avoidance and phasing** have
    no program fields. Keep-outs are hand-drawn only; the floodplain only reaches the AI as text.
22. **Unit mix, home mix and unit size** are kept by the engine but missing from the AI's program schema, so the AI can't
    set them from words.
23. **The MCP tool takes free text only**, with no structured program, so an agent can't pass exact fields.

## E. Suggested order of work

1. Parking always met (3), the second entry planned up front (4), the restaurant ring (5): small, high-value fixes.
2. Mixed-use allocation and the pond (9, 10), townhome amenity (11), duplexes on lots (6).
3. The owner's call on item 7 (fill or build what's asked).
4. Program fields for what requests can't say (16–23), starting with the entry street, placement on single-use plans,
   per-building sizes for every use, open space and density, and a structured program input for the MCP tool.
5. Denser apartment products (12) and option variety (13), then the drive network rework (14, 15).
