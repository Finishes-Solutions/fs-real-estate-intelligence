# Plan: real neighbourhoods, mixed sites, entrances and editable streets

Status: proposal, October 19, 2026, still being planned: the phases below are a working order, not a commitment, and stay open until the plan settles. Nothing here is built yet except where it says so (phase 2, roundabouts and circle drives, is built: Oct 20; step 1 of phase 3, pods with straight streets, is built: Oct 20). Decisions made so far are under "Decided". It answers the asks of Oct 19:
- mixed programs that really mix
- entrances that fit, with two-lane boulevard entries and room for monument signs
- bending and turning entrances and other pieces by hand
- curved neighbourhood streets laid out like real subdivisions, with roundabouts, circle drives and cul-de-sacs
- split detention
- trails and sidewalks
- names for neighbourhoods and centers

It also covers two bugs from the same session: a park added beside the community center that crossed a road and scrambled the streets, and an entrance that landed under the open space.

## What good looks like (the reference neighbourhoods)

The three references sent are typical Houston-area master-planned subdivisions:

- **Bauer Landing (Hockley).** Long, gently curved local streets mostly running one way. A diagonal collector cuts across them. Ponds sit along the back edge, and there's a commercial strip and pads at the highway corner.
- **Villages of NorthPointe (Tomball).** Loops and curvilinear streets wrapped round a central lake. A greenbelt with a trail follows the drainage, and each pod's street pattern follows its own shape.
- **Inverness Estates (Tomball).** A boulevard entry with a landscaped median, a roundabout, and linear lakes between pods. It also has cul-de-sacs and eyebrows, a clubhouse on the water, and a trail along the creek.

What they share, and what the planner should produce:
- **A collector skeleton:** an entry boulevard, a loop or spine that follows the site's shape, and roundabouts or T's where collectors meet.
- **Pods off that skeleton,** each with its own street direction and its own use (homes, apartments, retail, commons).
- **Local streets:**
  - streets that curve with the pod
  - T-intersections, never four-way grids everywhere
  - cul-de-sacs and knuckles where a pod is shallow or a street would dead-end
  - blocks of a sensible length
- **Detention:** split into several ponds placed where the land and the plan want them, shaped naturally, with trails round them and linking the pods.

## Where the planner stands today (from reading the code)

| Area | Today | Limit |
|---|---|---|
| Single-family streets | Parallel 28 ft streets stacked in **one rotated frame**, straight connectors between them, a sine "wave" that bends every street the same way | Hard limit. Loops, collectors that follow the boundary, independent curves, T's at angles and roundabouts need a **new street-network generator**. The wave is a cosmetic warp, not a network. |
| Cul-de-sacs | A bulb only on a street that connects to nothing (rare in a ladder); a hammerhead when there's no room | Not a design tool |
| Roundabouts, circle drives, eyebrows | None | New |
| Mixed programs | Zones are **depth bands stacked from the street back**, at most two side by side, in one frame, with one spine and boulevard. Single-family inside a mixed plan never curves | Hard limit. "Retail at the corner, homes wrapping a lake, apartments by the highway" can't be expressed or laid out. |
| Entrances | One main entry, 40 ft, with a thin 10 ft median green (about 15 ft lanes, often invisible). Added entrances run straight in from the lot line | No real two-lane boulevard, no monument sign space. Nothing stops an entrance crossing a park or open space. |
| Hand editing | Drives and trails can be bent (Edit Shape: drag, add and remove points; width, curve and mouth flare). Rectangles turn 90° or by degrees | **Anything stored as an outline or a path can't be turned at all:** every entrance, routed drive, curved pond, lawn, custom building |
| Detention | Sized at 0.55 acre-feet per developed acre; at most two ponds carved from leftover land; organic shapes optional | No deliberate split, no chain along a greenbelt, no awareness of the low side |
| Trails, sidewalks | A trail ring round a big pond, for apartments, townhomes and mixed plans only (never pure single-family). No street sidewalks | New |
| Names | Pieces get names (Lot 12, Apt Bldg 3, Building A, Main entry); option names describe the arrangement | No community, center or complex names; zones aren't labelled on the map |
| Speed | Layouts run in a background worker. Single-family: 4 s for 20 acres, 22 s for 86 acres. Mixed plans have no time budget; a 250-acre mixed plan is an estimated 20–60 s | A richer search needs a budget and results that arrive progressively |

## The two bugs first (phase 0)

**The park that crossed a road.** Every step let it through:
- "Beside the community center" only checks that the spot is inside the site's bounding box. It doesn't check roads, homes or the lot line.
- Parks and lawns are never nudged clear like buildings are, and homes under them don't make way.
- The plan's checks ignore green entirely, so nothing turned red.
- When the site then re-fitted, a pinned park was invisible to the layout engine. Streets and homes were laid straight through it, then the park was put back on top. In some cases the re-fit fell back to a from-scratch search, which picked a different street arrangement for the whole site. That's the "messed up all the other roads".

**The entrance under the open space.**
- Nothing that places an entrance treats a park or open space as in the way.
- The map draws green over paving, so the drive looked buried.

Fixes:
1. Named green (parks, lawns, open space) is a real obstacle:
   - it gets a clear spot when placed by AI or by hand
   - homes under it make way
   - re-fits lay streets round it
   - entrances can't cross it (a median is the exception)
2. "Beside X" tries spots on each side and keeps the first that's clear of drives, buildings and the lot line, or says it found no room.
3. The checks flag a park or lawn overlapping a drive or building.
4. A re-fit after a Change With AI never falls back to a from-scratch street search without saying so. It keeps the street arrangement and offers New Layouts instead.
5. Draw paving over plain green and under named parks only where they don't overlap. Make the entry median visible.
6. Tests with a real 250-acre mixed plan (the Waller site's shape):
   - a park added beside the community center lands clear of every street
   - the streets are unchanged after the change
   - an entrance asked for at the open space either goes round it or says it can't

## Hand editing: turn and bend anything (phase 1)

- **Turn any piece:** entrances, routed drives, curved ponds, lawns, custom buildings and medians. The Turn box, Turn 90°, R and the green rotate handle all work. Under the hood: rotate every outline or path point about the centre. An entrance keeps its mouth on the lot line, so turning it swings the drive and slides the mouth along the street edge.
- **Bend entrances** (works today through Edit Shape) and make it obvious:
  - the entrance shows its bend points when selected, without a mode switch
  - "+" markers to add a bend
  - the mouth slides along the street
- **Streets in a neighbourhood become editable as a network** (comes with phase 4):
  - drag a street's centreline points, curve it, delete a segment, or turn a dead end into a cul-de-sac
  - the lots along it re-flow automatically, and the rest of the plan stays put

## Entrances that fit (phase 1)

- **Boulevard entry:**
  - two lanes, way-in and way-out (about 18–24 ft each, or the local rule), with a landscaped median of 10–30 ft
  - a **monument sign pad** (decided):
    - in the median by default
    - on one or both sides at the corners as options
    - the planner may pick the sides when the site calls for it (a median too short or narrow for the sign plus sight lines, a right-in/right-out entry with no median) and says why
  - a deceleration lane where the frontage road speed calls for it
  - widths, median and sign placement in Settings, with typical starting values
- **Placement rules:**
  - corner clearance from the intersection
  - spacing between driveways
  - the first cross street set back from the entry (no lots fronting the first stretch)
  - for big neighbourhoods, a second way in for fire access (already counted today)
- **Change With AI understands them:** "add a boulevard entrance off FM 362 with monument signs both sides", "move the entrance 200 ft north", "make the main entry a boulevard".

## Names (phase 1)

- **One name per plan** ("Beacon Hill") and one **per part:** the neighbourhood, the retail center ("Beacon Hill Market"), the apartment complex, a commercial park.
- **Where names show:**
  - big, faint labels over each zone on the map
  - the title block of the PDF sheet
  - the monument sign
  - the layout card
  - Numbers, broken out by name
- **How names are set:**
  - **name it yourself** in Settings or in Change With AI ("call the neighbourhood Beacon Hill Estates")
  - **or ask the AI for names** that fit the place (two or three choices)
- **Street names (decided): off by default, a toggle.**
  - When it's on, the AI names every street from a theme you give it ("aviation", "Pokémon", "Texas rivers", "old Hockley families"), or picks one that suits the community's name.
  - Names follow the street hierarchy: the entry boulevard and collectors get the grander names (Parkway, Boulevard), locals and cul-de-sacs the smaller ones (Lane, Court, Way).
  - No two streets share a name; names are checked against the streets nearby and the county's list where it can be found, since duplicates are usually refused for 911 addressing.
  - Names show along each street on the map and the PDF sheet. Each can be edited, and "rename the streets with a golf theme" works in Change With AI.
  - Streets only exist as named things once the network generator (phase 4) is in. Until then the toggle names the drives the planner already has.

## Mixed sites that really mix (phase 3)

Replace "depth bands stacked from the street" with **pods**:

1. A **collector skeleton** is laid out first (phase 4's generator): the entry boulevard, the loop or spine, and the roundabouts. It cuts the site into pods.
2. Each pod gets a use, a size and its own frame, so apartments face the highway while homes curve round the lake. The existing single-use layout engines already work on any outline, so a pod is laid out the way a whole site is today.
3. The **program says what goes where in words** and the AI turns that into placement hints:
   - "retail at the corner of the two roads"
   - "apartments along the highway"
   - "the commons and lake in the middle"
   - "townhomes as a buffer between retail and homes"
4. The search tries several skeletons × pod assignments and scores each layout on:
   - the program delivered
   - the detention met
   - how much street per home
   - frontage for retail
   - the walk from homes to the commons
   - entrance spacing
5. The AI reviews the best few, as it does today.

The current band layouts stay as one of the styles tried, so small and simple sites don't get worse.

## Neighbourhood streets like real subdivisions (phase 4, the big one)

A new street-network generator for homes on lots. It's the hardest part and most of the effort.

- **Skeleton:**
  - a collector that follows the site boundary at about one lot depth in (homes back onto the edge)
  - or a spine through the middle
  - or a loop round a central lake or commons
  - the entry boulevard meets it at a T or a **roundabout**
- **Local streets in each pod:**
  - curved centrelines that run with the pod's long direction
  - spaced at two lot depths plus the street
  - meeting collectors at T's
  - **cul-de-sacs** (and knuckles at tight bends, **eyebrows** for a few extra lots) where a pod is too shallow for a through street or a street would dead-end
- **Lots along curves:**
  - marched by distance along each street's edge, each lot square to the street
  - wedge lots on the outside of bends and round cul-de-sac bulbs
  - the home mix and lot widths as today
- **Rules from the site's own jurisdiction** (see "Street rules by location" below): block length, cul-de-sac length and bulb radius, intersection spacing, right-of-way and pavement widths. The layout follows them and shows which rule set it used.
- **Finding the best layout:**
  - generate many networks: skeleton type × street direction per pod × cul-de-sac choices
  - score them: homes delivered, street length per home, cul-de-sac share, block lengths within limits, open space and detention met, every lot reached
  - keep a varied best few
  - run within a time budget in the background worker, showing the first good layouts while it keeps looking
- **Roundabouts** (a pavement ring and a landscaped island) at collector junctions, at the entry, or where asked ("add a roundabout at the main intersection").
- **Circle drives** for drop-off at the clubhouse, a school, a retail anchor or a hotel.

## Street rules by location (with phase 4)

Rules depend on where the site is, and the AI reads the codes for that place.

1. **Find the jurisdiction from data the app already has (decided):**
   - the city limits a site is in (Census places, already looked up for every site)
   - its county
   - its utility and drainage districts (the nightly county data)

   One gap: the app has no ETJ outlines. A site in a city's extraterritorial jurisdiction (Houston's reaches into Waller County) usually falls under that city's subdivision rules. Until ETJ outlines are added, the AI checks while reading the codes whether the site is in an ETJ, and the rule sheet says which way it decided.
2. **The AI reads the codes.** Using the web search the app already has, it finds and reads the subdivision and development rules for that city or county, and the drainage criteria (the county flood control district's detention rate, for example). Sources are the city's code of ordinances (often on Municode), the county's subdivision regulations, and the drainage criteria manual. Out of them it writes one **rule sheet**, with each value cited and linked:
   - right-of-way and pavement widths by street type
   - longest block
   - longest cul-de-sac and bulb radius
   - intersection and driveway spacing, corner clearance
   - sidewalk requirement and width
   - smallest lot and frontage, building lines
   - detention rate
   - the second entrance rule
3. **When the code can't be found (decided):** Waller County's rules are the default rule set. Every value taken from them is marked "Waller default", so nobody mistakes it for the local rule.
4. **People confirm only what's unsure (decided).** The rule sheet shows in the plan's Settings with its sources, and any value can be edited. A layout uses values the AI read with confidence straight away. Values the AI marked unsure, and Waller defaults standing in for a missing local rule, are flagged for a person to confirm. Layouts can still be built while they're flagged, and they say so.
5. **One sheet per place, shared.** It's kept per jurisdiction and shared by the team, so the second site in Waller County doesn't look it up again. It's refreshed when someone asks or when it's old.
6. **Every layout says which rule set it used.** Any value the plan breaks shows in the checks. It is never a compliance claim: the rule sheet is the AI's reading of the code, to be confirmed by the engineer and the city or county.

Waller County's detention rate replaces today's fixed 0.55 acre-feet per acre as the fallback when the local rate isn't found. The Waller rule set itself is read once, cited and kept in the app.

## Detention, trails and sidewalks (phase 5)

- **Split detention:**
  - the volume is shared among several ponds placed where they work: a lake in the commons, linear ponds along a greenbelt or between pods, a pond at the low corner
  - organic shapes by default for neighbourhoods
  - the total always meets the need, and Numbers shows each pond's share
- **Low side (decided):** until elevation data is pulled in, the low side is given by hand: a click on the map, or words ("drains to the south-east corner"). Ponds go there first, and the outfall is drawn to it. Without a hint, the planner places ponds as today and says the low side wasn't given. When elevation data arrives it fills the hint in, and a hand hint still wins.
- **Trails:**
  - round every pond
  - along greenbelts
  - linking pods to the commons, amenity center and school
  - drawn as 6–10 ft paths with their length in Numbers
  - "add a trail round the lake" and "connect the trails" in Change With AI
- **Sidewalks (decided):**
  - both sides of every street by default
  - one side as a setting, per street type (local streets one side, collectors both)
  - width from the local rule sheet (5 ft when it's not found)
  - drawn on the plan and counted in paved area and cost

## Change With AI keeps up (with each phase)

- Every new piece gets an op the AI can use:
  - roundabout, circle drive
  - cul-de-sac (or "make this street a cul-de-sac")
  - boulevard entrance with monument signs
  - trail
  - split pond
  - rename
  - "re-lay this pod"
- Anything the AI places gets a clear spot and the same checks as a hand edit. No kind of piece is exempt again.
- A change that would re-lay the streets says so first and keeps the old arrangement one Undo away.

## Order and size (a working draft, still open)

| Phase | What | Size |
|---|---|---|
| 0 | The two bugs, with realistic tests | Small: a day or two |
| 1 | Turn any piece, entrance editing polish, boulevard entries with monument sign space, names | Medium: about a week |
| 2 | Roundabouts and circle drives as pieces you add (on today's streets) | Medium (built Oct 20) |
| 3 | Pods for mixed sites (with today's straight streets inside each pod first) | Large: two to three weeks (step 1, pods with straight streets, built Oct 20) |
| 4 | The curved street-network generator for neighbourhoods, editable streets, cul-de-sacs, search and scoring | Largest: four to six weeks, and the most uncertain |
| 5 | Split detention, trails and sidewalks | Medium |

Phases 0–2 are worth doing now; they fix what's broken and unblock hand fitting. Phases 3 and 4 are one track (pods need the skeleton), so it's built in steps that each ship something usable:
1. pods with straight streets
2. then curved local streets inside pods
3. then curved collectors and loops

## Tests and checks

The rule in this repo stands: realistic data and a look at a real map before each push.
- **Fixture sites:** the 250-acre Waller site, a 100-acre mixed site, a narrow deep tract and an irregular parcel.
- **Every layout must:**
  - keep every lot reachable
  - keep every street connected to an entrance
  - have no piece overlapping a street (parks included)
  - keep blocks and cul-de-sacs within the limits set
  - meet the detention or say by how much it's short
  - stay within its time budget
- **Before/after numbers** for the existing styles, so nothing gets quietly worse.

## Risks, honestly

- **Curvilinear layout quality is hard.** Designers spend days on a subdivision. The generator will produce good starting concepts, not engineered plats, and some sites will need hand fitting. Editable streets (phase 1 and 4) are what make that acceptable.
- **Speed.** A real search on 250 acres is heavy. Without a budget and progressive results it will feel slow.
- **No ground elevations yet**, so detention placement is a guess unless someone gives the low side.
- **Rules differ by jurisdiction** (Houston, the ETJ, Waller, Harris and Montgomery counties), and **the AI's reading of a code can be wrong or out of date.** Some codes aren't online or sit in scanned PDFs, and amendments get missed. Every value carries its source so a person can check it; nothing is a compliance claim.
- **Regression risk** to today's layouts. The old styles stay as options, and the tests compare them.

## Decided (Oct 19)

1. **Street rules depend on the location;** the AI reads the codes for that area (see "Street rules by location").
2. **Sidewalks** on one or both sides, both by default.
3. **Names:** the planner names the community and its parts. Street names are an optional toggle, with the AI naming the streets from a theme you give it.
4. **Monument signs** in the median by default, with the sides as options, or whatever is best for the site (and it says why).
5. **Detention:** a hand hint of the low side until elevation data is pulled in.
6. **Jurisdiction** from the city limits and county data the app already has.
7. **No code found online:** Waller County defaults, marked as such.
8. **Confirmation:** a person confirms only the values marked unsure (and Waller defaults standing in).

## Still open

- The order and size of the phases (kept open while planning).
- ETJ outlines: whether to add them to the app's boundary data (Houston's first), or rely on the AI's reading of the code.
