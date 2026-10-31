# Changelog

Every push to the repository adds an entry at the top: date and time (US Central), what changed, and the commit(s).
Nightly "Refresh data" commits from the data workflow are left out (they only update `data/`).

## 2026-10-31

### 4:22 AM CT: Montreve Option B, the resort in detail; trees on lots (commit hash added when pushed)
- **Montreve Mountain Club has an Option B:** the same lots, roads, cabins and resort core as the Full program, worked up in detail. It adds an owners' pool club (heated pool and spa on a fenced deck, bathhouse, playground, lawn games, rain garden), a 10 ft fence round the courts, a chef's garden and screened trash and recycling behind the Lodge, a ridge overlook, and a stone arbor and aisle on the ceremony lawn. The event side gets a caterers' kitchen, a bridal cottage and photo garden with a private walk to the pavilion, vendor and staff parking, and a maintenance barn. At the entrance there's a gate house, gate and mail kiosk. Walks tie every piece to the promenade, and a trail link climbs to the woodland loop. Each level piece lists its pad and walls, and the plan's notes describe every area.
- **Cabin lots stay wooded in Option B,** and 15 of the 24 cabins have room for a walk-out patio with a hot tub and fire pit under the deck.
- **Trees grow across lot lines.** On the site sheet and in 3D, a lot line no longer keeps landscape trees out, so lawns and wooded areas inside lots are planted like any other.

## 2026-10-30

### 3:48 PM CT: Montreve work merged into experimental (302644b)
- **The Montreve Mountain Club work joins the experimental branch:** courts by sport, the event / wedding venue use, the Resort & recreation buildings and cabins, the ground under each piece, and the Montreve layout builder. Nothing else changes for people using the app.

### 2:16 PM CT: Montreve's resort core designed as one plan (c0100d5)
- **The resort core at Montreve Mountain Club is now one composed plan** on lots 10-15 instead of separate pieces each turned to the road. A stone **promenade** runs the length of the core, with everything along it in one line: the **tennis court**, **two pickleball courts**, a **court pavilion** with a viewing deck, the **dining terrace** and **The Lodge** (2,500 sf dining and catering) with its **service yard** to one side, a **cocktail terrace**, and the **6,000 sf glass wedding pavilion** with its own drop-off and lane from the road.
- Below the promenade: **two parking bays** (76 spaces) reached from Amber Valley Way with a stair walk up to the promenade, a **village green**, a **fire-pit overlook**, and the **ceremony lawn** in front of the pavilion, edged with gardens.
- Each piece still sits on a level pad fitted to the lidar, with its cut, fill and walls shown. The tennis court (about 34 ft) and the upper parking bay (about 33 ft) need the tallest walls, so they should be tiered or stepped.

### 12:41 PM CT: Courts by sport, event venues, mountain cabins, the ground under each piece, and Montreve laid out on its lidar (0e3fbfd, e83f5ca, 213c1fb, aa011b6, fcbb880)
- **Tennis, pickleball and basketball courts** at regulation size, each court drawn with its lines (the pickleball kitchen, tennis service boxes, the basketball key) and its net on the map, the PDF sheet and the 3D picture; a **Sport** picker and a **Courts** count in the Selected box; "add 2 tennis courts beside the clubhouse" works; courts have a legend line.
- **Event / wedding venue** is a use of its own (a space for every 2.5 guests, pale glass blue, in the legend, the budget at $550 a sf, the AI's words "wedding venue", "event center", "banquet hall").
- **Resort & recreation** in the building library: the Montreve cabin (3 levels, 2,444 sf, indoor pool), 2-6 bedroom mountain cabins, 3,000 and 6,000 sf glass event pavilions, an event barn, a wedding chapel, a dining and catering hall, a caterers' kitchen, a clubhouse and a gate house. Cabins have no garage (driveway parking), a flat roof and a walk-out level in 3D.
- **The ground under a piece:** with the site's lidar loaded, the Selected box gives a building's, court's or parking row's fall, its level pad, cut and fill and retaining walls, or whether a home works as a walk-out (`lib/terrain.mjs` padFit).
- **Montreve Mountain Club** gets a **Full program** option (`build/projects/montreve.mjs`, seeded by the Seed project workflow): the 30 platted lots laid on the Regrid parcel (best overlap with the vector lot map, no turn, so the map is north-up), USGS lidar for the ground, and the platted roads traced to their centrelines (`projects/montreve/scripts/roads.py`) and drawn as smooth 24 ft paved roads clear of every lot. Every cabin (24) sits square to its street, centred on its lot, the deck downhill and the floor facing the road at road grade with a short straight driveway (most 10-28 ft); 11 are clean walk-outs and 20 show 15 ft of foundation or less. Along Amber Valley Way: 72 head-in spaces in rows of 8 (cuts up to about 13 ft), then the pavilion and lawn (lots 14-15), the hall (12-13) and the tennis and pickleball courts (10-11), each square to the road in front of it on a level pad: walls about 9 ft at the hall, 17-22 ft at the lawn, pavilion and pickleball, 27 ft at the tennis court.
- **Merged the experimental branch** into `matthew/montreve` (its own out-of-Texas parcel work replaces mine).
### 12:23 PM CT: A readable Parcel Map for traced outlines, and the outline as GeoJSON (bb0ad1a)
- **Rural parcels read cleanly.** A county outline traced along a creek or road (2481 Happy Hollow Rd has 772 points) used to list hundreds of 1–3 ft "courses" that ran off the page, with the corner dots merged into a grey smear on the map. The report now lists the real corners, the straight courses and the curves (each with its chord bearing and length, arc length, radius and angle), marks only those corners on the map, and carries long tables on to the next page. The whole outline is still drawn exactly.
- **Corners keep their numbers and order:** courses now really run clockwise from the county's corner 1, as the page says; a clean deed outline keeps every corner, however slight the bend.
- **Acres and values from Regrid:** where the Regrid record has been fetched for the parcel, the report uses it (acres, land and total value, zoning) instead of showing 0.00 acres and $0; where nothing is on record it shows a dash.
- **New: Parcel Outline (GeoJSON).** A button beside the site reports saves the full outline, every point, with everything on record (every Regrid field when fetched), its area, perimeter and courses, for QGIS, ArcGIS, Google Earth or CAD.

### 12:05 PM CT: A 3D view in the Topography report (eb4e875)
- **See the ground in 3D.** The Topography report's second page now shows the site and the land around it as a block of ground: a big view looking up the slope from the site's low side and two smaller views from other sides, coloured from green (low) to tan and white (high), shaded by the sun, with contour bands, the site boundary draped on the ground and the lowest and highest points marked. Each view has a north arrow and says which way it looks.
- **Honest about scale:** on gentle land the heights are stretched (up to 5×) so the shape shows, and the page says by how much; hilly land like Sevier County is drawn true to scale.

### 11:33 AM CT: Spending in the Area Report outside Texas (4ef5517)
- **Consumer spending is filled in outside Texas.** In Tennessee the Area Report's spending rows (groceries, dining out, housing and so on) were blank; they're now modeled from each ring's households by income, the same way as in Texas.

### 11:31 AM CT: Steadier streams in the environmental report (f4cad84)
- **USGS streams and water bodies get a second try** when the service is slow (it timed out once on the Sevier County parcel and the page said "not loaded"), and the report fetches all its map layers at the same time, so it finishes sooner.
- **No ", TX" on a parcel outside Texas** in the report headers.

### 11:21 AM CT: Area Report works in rural Tennessee (9dc8196)
- **The Area Report no longer fails in the country.** Around 2481 Happy Hollow Rd (Sevier County) it stopped with an error about "mi": the census tracts there are many miles across, and the way the report measured how much of a tract falls inside the 1-mile ring could miss the ring altogether, leaving it with no people. It now measures the part of each tract inside each ring directly, so a 1-mile ring takes its true slice of a big tract, and a ring with no census data shows a dash instead of breaking the report.

### 11:20 AM CT: Colour Selected Lots (928abdf)
- **A new setting in Layers, Colour Selected Lots** (off unless you turn it on): each lot you pick is filled with its own colour under its outline, the first green, then blue, orange, purple and so on, and its number on the map matches. **Site Plan for All** then shows them as one merged site in one colour.

### 11:05 AM CT: Tennessee and the rest of the US; one clean outline on the selected parcel (167d56f, 53e018e)
- **No more green lines through a selected parcel.** A parcel that crosses an edge of the map's tiles was outlined piece by piece, so the straight cuts between the pieces showed as green dashed horizontal and vertical lines across it. The pieces are now joined into one outline round the parcel's edge (buildings cut by a tile edge too).
- **The card works outside Texas.** Regrid and the property card took Texas points only, so a Tennessee parcel's card said Regrid wasn't ready and its Site section said "lat and lon inside Texas are required". Both now take any point in the US. The Site section shows the flood zone, school district, city limits, Opportunity Zone and nearby EPA sites anywhere and leaves out the Texas-only sources (TxDOT traffic, TCEQ water districts, Comptroller alcohol sales).
- **Site reports from a Regrid parcel:** where there's no free appraisal record, the four site reports use the Regrid parcel.
- **More in the environmental report everywhere:** USGS streams and water bodies, federal critical habitat and PAD-US protected land on the constraints map; septic-field and bedrock ratings in the soils table; FEMA's wildfire and landslide ratings always shown. Texas agency records (TCEQ, Railroad Commission) say "not searched here" outside Texas instead of showing zero. Each soil's share of the parcel is now right when a soil shows up in several patches (it could add up to more than 100%).
- **The Area Report outside Texas** fetches census tracts and their figures live; population growth shows as not available rather than 0%, and construction filings say they're Texas only.

### 9:52 AM CT: A full Site Environmental report, and wetlands that load (9fe4ab8, 8d84a88)
- **Wetlands work again.** The US Fish & Wildlife Service changed its wetlands field names, so every wetlands search failed ("didn't answer"). The search now reads the fields either way, and the map layers try a second time before giving up.
- **The Site Environmental report is a full report:** after the finding and the records around the parcel come a **site & constraints map** (the parcel outline, FEMA flood zones, mapped wetlands and lidar contours), a **soils map** (every USDA soil map unit under and round the parcel, its share of the parcel, drainage, hydrologic group, water table and building limitations), and **topography & slope** (contours over shaded relief, slope and the way water runs, the parcel's low and high ground). A layer that still fails is named on its page, never left blank as "none".
- **A report from a link:** /api/sitereport?kind=environmental&lat=..&lon=.. makes the report for the parcel at that point.

### 8:38 AM CT: No name on reports (c64c406)
- **Reports carry no name at all.** The "Real Estate Intelligence" wordmark is gone from report headers, the sign-off line at the end is gone, and the page footer shows only the report's title and page numbers. The app itself still says Real Estate Intelligence.

### 8:29 AM CT: Real Estate Intelligence only, no company branding (c9819d6, 9d62e8f)
- **The app is unbranded.** The top bar, browser tab, installed-app name and icon now say Real Estate Intelligence (a new "RE" icon), with no company logo.
- **Reports are unbranded.** Every PDF's header, footer and sign-off carry only the name Real Estate Intelligence; the old company tagline, logo and green are gone.
- **Plan sets are unbranded.** The title block's company logo, address, phone number, copyright line and firm number are removed (not just covered) and the block reads Real Estate Intelligence. "Prepared by" is now "Prepared with Real Estate Intelligence", and the project team lists the development consultant as to be confirmed.
- **Wording elsewhere:** the Waller guardrails' scenarios are A, B (base case) and C without a company name; budget lines read "the team's budget workbook" and "Profit — Developer"; the AI assistant introduces itself as Real Estate Intelligence's assistant.

### 12:45 AM CT: One-click site reports from a parcel, and a new look (4982085, e144fa8)
- **Reports from a parcel in one click.** A parcel's card has a **Reports** button among its section buttons, and a **Reports for this parcel** block in its Site section: **Parcel Map**, **Topography**, **Site Environmental** and **Area Report** (1, 3, 5 and 10-mile rings). Each makes the PDF straight away (a few seconds for the parcel map and area report, 10 to 40 for topography and environmental) and saves it like any other export. The **Reports** page has the same four under **For the open parcel**.
- **The topography report covers the page:** the ground is fetched for the site plus 300 feet or more around it, in the page's shape, so the maps run edge to edge.
- **A new look across the app:** set in Inter (no more IBM Plex Mono or Montserrat), white surfaces, hairline borders, rounder corners, black pill buttons and plain grey labels instead of small capitals; green is now an accent, not the button colour. Report PDFs use Inter too.

### 11:13 AM CT: Property cards anywhere in the US, and the Montreve resort study (e1a001f, 114076c, commit hash added when pushed)
- **Property cards outside Texas:** my first version was replaced by the experimental branch's own (merged in), which does the same and more.
- **Montreve study (`projects/montreve`, branch `matthew/montreve`).** A conceptual site plan with all 30 lots traced to scale from the vector lot map: Will Essner's resort core on lots 10–15 (6,000 sf glass wedding pavilion and ceremony lawn, 2,500 sf dining, tennis and two pickleball courts, event parking, a trail loop) and a cabin on each of the 24 for-sale lots. The cabin's floor plans are redrawn as vector PDFs at 1/4" scale. A budget and pro forma workbook with live formulas prices three programs, and a 16-slide investor presentation is built from it.
- **What it found:** at base costs a cabin must sell for about $1.24M to break even with the resort deferred, $1.41M with a lean resort and $1.59M with the full program. $1.30M covers the cabins, the site work and about $0.64M of amenities. Comparable indoor-pool cabins nearby are listed around $925k.
### 12:09 AM CT: Sharper ground elevations, and four new site report layouts (b3e85f4)
- **Ground elevations without the 3,600-point limit.** A site's ground now comes from USGS lidar as one elevation image, read every 3 feet (up to 250,000 points; a 300-acre tract every 8 feet or so, where it used to be every 60). Contours, slopes, the low and high ground and the plan set's grading follow the real land closely. If the image service is down, the old point-by-point reading still answers.
- **New report layouts (not yet in the app):** Parcel Map (to scale, every line dimensioned, bearings and corner coordinates, an area check against the tax roll, a page per parcel), Topography (lidar contours over a hillshade, slope and drainage, two cross-sections, earthwork at three pad heights), Site Environmental (records around the parcel, soils, flood and hazards) and an Area Report in 1, 3, 5 and 10-mile rings (people, income, spending and construction, each census tract counted for its share inside the ring). All unbranded, black and white with blue accents. They go into the Reports tab once the look is approved.

## 2026-10-27

### 8:20 PM CT: The Feasibility workspace merged in, with a layout gallery on its Site step (b8532b3)
- **Merged `matthew/zealous-cannon-mjy9yw`** (the experimental branch: the Feasibility workspace Intake → Site → Plans → Budget → Pro Forma → Reports, the budgeting and investment engine, BIM models and 3D facades, team budgets, agents working on projects, a local dev server) into this branch. Both engines' changes are kept: where they met (townhome rows and their guest bays, the pond's place on spare land, the mixed ranking, entrance search, the parser's unit words, the pad notes), the two were combined. The compact-pond rule now applies where homes are laid out; a pond beside a shopping center takes the far end of the spare land as the experimental branch had it. Mine's `lib/massing.mjs` (the massing picture the renderings tool paints from) is now `lib/massingsvg.mjs`; theirs (3D buildings from their floor-plan designs) keeps the name.
- **The Site step has a layout gallery.** Type what to build (or pick a quick use), choose **Lay out parcel by parcel** on a site of several parcels, and **Generate layout options** runs the platform's engine in the browser: the generator's gallery (dozens of layouts in a few seconds) for apartments, shops, flex parks and self storage, the engine's three options for everything else, each drawn as a card with its units or floor area, parking and pond, and **Use this layout** makes it the study's option. The study's numbers, plan set, budget and pro forma follow from the option picked.
- **Scripts on a path with spaces** (`scripts/dev.mjs`, `test-fz.mjs`, `screenshots.mjs`, `sample-run.mjs`, `infra-grep.mjs`): the repo folder's spaces no longer break them. `scripts/shot.mjs` takes a screenshot of a workspace step against a running dev server, with a request typed and the gallery made.

### 5:10 PM CT: A retail plaza round a central court, with the neighborhood behind it (commit hash added when pushed)
- **"A retail plaza with a central court holding a hang-out area and a park, and a neighborhood in the back"** now lays out as said. The words read a plaza (`plaza`, `town center`, `village square`, `main street`) with its court (the plaza, a lawn when a park or green is named, a pavilion when a hang-out, stage or seating is, a playground), and a commons said to be "in the middle" of such a plaza is that court, not a zone of its own. The generator's new arrangement (`lib/sitegencom.mjs` plaza) puts shops on three sides of a court open to the street: the plaza at its mouth, the park lawn beyond, the pavilion at its head; parking across the front, beside the wings and behind the shops; the wings as long as the shops need, cut back until the rows park them, the court narrowed only when even the shortest wings don't. The widest court that parks ranks first.
- **A plaza with homes or apartments** gets a tract of its own on the frontage (`lib/sitetract.mjs`, kind `plaza`): in the middle of the frontage or at either end, sized for it, the plaza laid out on it by the generator, the neighborhood behind and beside it with its own way in. A plaza alone takes the generator's layouts ahead of the parking-field engine.
- **A parcel fronts its own address street.** The MCP tool's site now faces the street in the parcel's address when the road lines beside it have that road ("1 Ralston Rd" fronts Ralston Rd along its 1,486 ft west side, not the FM at its corner); the edge picked is the one the road runs along, not a short one the road also passes. On 1 Ralston Rd the agent's plan had two boxes at the FM 362 corner and 17 homes on 40 acres; the engine now gives the plaza on Ralston Rd with 96 to 127 homes behind it.
- **Tested** (`test/siteplaza.mjs`): the words, the plaza alone on the 5.88-acre FM 362 parcel (first, clean, parked, the plaza, park and pavilion in the court), and the plaza with the neighborhood on 1 Ralston Rd (`test/fixtures/real/ralston-rd.json`: every shop on the tract, no home on it, each with its way in).

### 3:40 PM CT: The words pick the arrangement, and before-and-after on real sites (commit hash added when pushed)
- **"Round a courtyard" and "resort pool" are heard.** The parser reads the arrangement the words want (a courtyard, or a loop drive with the pool at the heart), and the generator's matching layouts lead the ones that merely fit more units. On 2101 Reinke Rd the engine's first option is now the courtyard the site was built as (196 apartments, parked), where it laid out rows.
- **A layout keeps the units it can park.** A generated layout whose rows come up short cuts its count to what parks instead of being ranked below everything that parks.
- **Turned parking rows open toward their aisle.** Rows running back from the street had their open side the wrong way round, so every one drew a "no aisle" warning that sank the rows-running-back and courtyard layouts; fixed.
- **Entrances keep off street corners.** A second entrance, and a courtyard ring's corner entrance, stays about 100 ft from the corner of two streets (it moves along the front or to the court's axis), and the front row keeps clear of each throat.
- **Before and after** (`build/site-before-after.mjs`): the same parcel and words laid out by an earlier checkout of the engine and by today's, drawn beside the aerial at one scale. Benchmark: 63 clean, 0 errors, as before.

### 1:30 PM CT: Parcel by parcel, the AI asks first, and shops, flex and storage from the generator (commit hash added when pushed)
- **A site of several parcels is laid out parcel by parcel** (`lib/siteparcels.mjs`): each parcel its own site (its outline, the street it fronts, the side streets along it), its own program and its own layouts, composed into one plan with the parcel lines as its zones. Nothing crosses a parcel line, so each can be built, sold or phased on its own. The words say which use goes on which parcel ("45,000 sf of retail shops with 3 pads on the 5.88 acre parcel, a 9,000 sf flex building on the corner parcel and 80,000 sf of flex warehouses on the 9.36 acre parcel"): the parser reads a program per parcel named, and a parcel is picked by its acreage, "corner", "largest" / "smallest", "back" (landlocked), its number or words of its address. One program with no parcel named is shared by acreage. In the app, a site of two or more parcels shows **Lay out parcel by parcel** under Build with AI (on by itself when the words name parcels); the MCP `site_plan` tool takes `per_parcel` and lays `apns` out the same way. A re-fit lays the parcels out again from the recipe.
- **The AI asks before it lays out a site of several parcels** when the request doesn't say which use goes where, or leaves a parcel's program or size open: one to three short questions appear under the request box (Answer and Build, or Build Anyway); the MCP tool returns them and takes `answers` on the next call.
- **The generator now does shops, flex parks and self storage** (`lib/sitegencom.mjs`), the same way it does apartments: shops at the back of their parking field with pads on the street (the ends first) and an L with a wing down a side when the lot is narrow, a service drive behind when the lot is deeper than the field needs; flex and warehouse parks as rear-loaded pairs round a shared truck court or front-loaded buildings with the loading behind, along the street or running back, with shallow 60 ft bays for a small lot; self storage with the climate-controlled building on the street beside the gate and the drive-up rows behind, across the yard or running back. Dozens of layouts a second; the best join the three options for these programs. A layout that loses a building to the repair is not offered.
- **A confirmed site stays confirmed.** Opening an option again no longer asks for the site to be confirmed again: the map's street check leaves a confirmed site alone, and the setbacks (set with the layout's parameters) now belong to the layout's fingerprint, not the site's. Sites confirmed before today still count.
- **A real site to measure by** (`test/fixtures/real/old-houston-fm362.json`): the three parcels of 0 Old Houston Hwy at FM 362 in Waller (5.88, 0.93 and 9.36 acres) traced from the county parcel map; `test/siteparcels.mjs` checks the parts and their street sides, which parcel the words mean, the composed options (every building inside its parcel, each parcel holding what the words put on it), the re-fit, and the generator's shops, flex and storage galleries on them.
- **Study tools, named** (`build/site-*.mjs`): `site-aerial` (satellite tiles stitched with their bounds), `site-derot` (the aerial turned square to a site's grid with a 100 ft grid), `site-trace` (a traced fixture drawn), `site-compare` (the aerial beside our plan at one scale), `site-layout` (a parcel laid out as the MCP would), `site-gallery` (the generator's list and contact sheet), `site-parcels` (several parcels, each with its own words, as one plan beside the aerial); `build/test-all.mjs` runs the whole suite six at a time.

### 11:30 AM CT: The layout generator (commit hash added when pushed)
- **Enumerated, deterministic layouts** (`lib/sitegen.mjs`, `layoutGallery`): instead of a search that returns three options in 3 to 50 seconds, the generator walks a grid of parameters and composes each layout directly from a vocabulary of building types and a grammar of arrangements, checks it like any plan, trims its parking to what the buildings need, scores it and drops near-twins. Multifamily first: bars, garden (breezeway) buildings and courtyard wings; rows facing the street, rows running back, a courtyard ring with the pool and clubhouse inside and the parking in a ring outside (as 2101 Reinke Rd is built), two or three courtyards side by side on a big lot, and a loop drive with the buildings round it and the pool at the heart. Every layout reserves the detention the site needs (a share of a side, or a strip across the back) before the buildings go in, keeps stalls off the entry throats, and joins its aisles at both ends. On the 9-acre Reinke Road parcel: 10 distinct layouts in a third of a second; on the 20-acre garden-apartment parcel: 90 in under three seconds. The same site and words give the same list every time.
- **In today's plans too:** for apartments, the generator's best join the search's candidates, so the three options a plan gets can be a courtyard or a loop now. A generated layout re-fits from its key.
- **Tested** (`test/sitegen.mjs`): dozens of layouts on each traced parcel, in seconds, the same list twice, none at the top breaking a rule, the arrangement each site was built with among them, the count asked met, every layout parked near its need.
- **Next:** more building types (L, U, wrap, tuck-under, podium), the loop on deep lots, the gallery as an MCP tool and a button in the app, then retail and single-family the same way.

### 12:50 AM CT: Layouts matched against the real thing (commit hash added when pushed)
Real communities traced from aerial photographs (a 179-acre lake community west of Houston, a 20-acre garden apartment community, a 26-acre grocery-anchored corner) and laid out again by the planner at the same scale, side by side. What the comparison changed:
- **Lakefront lots.** On a subdivision's loop road round the lake, a band of 60 ft lots now lines the inside of the loop on every side but the entry's: the homes face the loop road and back onto the water, pie-shaped on the bends, none where a street meets the loop. The commons and its lake are laid out inside the band. The Fulshear-area tract gets 45 of them.
- **The lake is a feature, not the whole of the detention.** An amenity lake is capped at 8% of the site (a 180-acre tract gets a 14-acre lake, as they're built; it was 21 acres); the rest of the detention goes to a compact pond on a back corner of the site, kept before the lots are laid, never a strip along the lot line. A pond anywhere is now a pond, not a moat: a big one at most about three times as long as wide, a middling one up to six.
- **Two ways in off one frontage.** A second entrance whose street would miss the loop (the loop is narrower than the frontage) now bends to the loop's near side: a diagonal where the block in front is deep enough, else along the block and square up to the loop. The lake community gets its two entrances, as the real one has.
- **Ranking:** a subdivision network that holds its stormwater leads straight-row layouts that hold none of theirs (they led on home count while leaving 97% of the detention to "underground storage").
- **The words:** "380 garden apartments" reads the count (it didn't), and "a 60,000 sf grocery store, 40,000 sf of shops and 4 pads" adds up to 100,000 sf (it took the first number); "100,000 sf center with a 60,000 sf grocery anchor" stays 100,000.
- **Benchmark** (95 synthetic sites): 63 clean, 0 errors, 1 not ready, as before: nothing lost on the plain sites while the real ones got lakefront lots, a lake the size they build, a pond that's a pond, and two entrances. Two networks of the same design within 5% of each other's homes no longer take two of the three places.
- **Traced, not just compared.** Three built developments were traced from satellite images onto our sheet as fixtures the engine is measured against (`test/fixtures/real/`): the grocery center building by building with dimensions (a 208 × 250 ft grocery on the back line, a 399 × 98 ft row of shops down the north side, a second shops building, four pads, the parking rows, four entrances; 12.5 acres, 140,000 sf, FAR 0.26); the garden apartment community (17 three-story buildings at varied angles round a resort pool and clubhouse, the wet pond beside the main entrance, two entrances, the drives); the lake community's structure (a 7.7-acre lake with the community center on its east shore, the boulevard and a second entrance, the loop collector and the collectors to the sections; the lots counted, not drawn); and the courtyard apartments at 2101 Reinke Rd, Waller (three-story wings round a courtyard with the pool, clubhouse and leasing in the middle, two buildings on the street side, parking in a ring outside; 9 acres, about 220 units, FAR 0.58). Each fixture is frame feet with an origin and angle, so a site turned off north traces square.
- **Grocery-anchored centers** (`lib/sitecenter.mjs`): a request that names a grocery or anchor with its floor area ("a 52,000 sf grocery, 54,000 sf of shops and 4 pads at the corner") now gets the center as it's built, first: the anchor's back on the back build line toward the side street with its storefront to the parking and the street, a junior anchor beside it when the shops are deep enough to want one, the rest of the shops as a wing down the far side facing the field, the pads along the frontage, three aisles of parking between the storefronts and the street, loading beside the anchor on the wing's side, a service drive behind the anchor when the lot is deeper than the field needs, detention at the far end. On an inside lot the same with the wing on either side. A re-fit keeps the buildings. Not yet: pads along the side street of a corner, and the wing stops short of the frontage where the lot line is off square.
- **Seen and lined up next:** garden apartments on a curving loop drive with the pool as the centerpiece (ours lay a grid); on a retail corner, pads along both streets and the anchor-with-parking-in-front layout ranking first for an anchored center (ours placed 1 of 4 pads and ranked two boxes facing each other first).

## 2026-10-26

### 9:40 PM CT: Site layouts that read like a planner's (commit hash added when pushed)
- **Neighborhoods beside shops, offices, apartments or warehouses get a tract of their own,** along one end of the frontage with their own entrance from the street, and their streets never join the rest of the plan's drives: residents and shoppers don't cut through each other. On its tract the neighborhood is laid out as a subdivision (a loop road, curving streets, cul-de-sacs) when that holds its homes, with a landscape buffer on the lot lines it shares. Before, every use was a strip across the whole site and the homes behind the apartments were reached through the apartments' parking aisles.
- **Warehouses beside homes always get their own tract,** with their own truck entrance and a 25 ft landscape buffer (a screening wall is usual): no home is reached past the truck court. Shops beside apartments on a site too shallow for both get a tract too, instead of a broken fallback.
- **Single-family streets on a slanting lot line end in cul-de-sacs** instead of each pair being joined at its own end (a staircase of stubs). The first street sits about 100 ft in from the road on streets running back too, so cars turning in clear the road; a curving street no longer bends a foot into the rear landscape buffer.
- **A second way in for fire access costs a lot or two where it has to:** a neighborhood whose homes back onto the road had no clear line in, so the layout with 47 homes and two entrances outranked the one with 78 and one. Now the homes in the way make way (the plan says how many), and the 78-home plan wins with both.
- **Townhomes:** guest parking courts on the cross streets (eight stalls a side) where the rows run short of guest spaces, and a row gives up a unit for the bay it owes; a 5-acre lot went from 24 homes with a cul-de-sac bulb at each end to 43 on a loop street.
- **Lots flex like a plat:** every lot is at least the width asked (50 ft) but the corner lot widens to meet the cross street, so no sliver of lawn is left at a block's end, and the outer row (backing onto the lot line or the pond) deepens to the property line, up to half again. Lots are cut only along streets that were actually laid (a street dropped for the pond no longer gets a row of homes with no street).
- **Master-planned communities lead with the plan a planner would draw:** when the request places its uses ("retail at the corner, apartments along the road, homes around a lake"), the collector-and-pods layout that keeps those words leads as long as it holds 85% of the homes asked, instead of a grid that packs in more.
- **Industrial reads like a business park:** a bulk warehouse (240 ft deep or more) is also offered with a 185 ft truck court and a row of 12 × 53 ft trailer parking along its far side; "flex" or "small-bay" asks for shallow buildings (80 to 120 ft, several of 120 to 400 ft rather than one long one, as a flex park is built) with front parking and a 60 ft grade-level rear drive, named Flex Building A, B…
- **Homes behind shops on one plan** ("retail in the front, homes behind"): the way in to the neighborhood is a street through the front zones with no stalls opening onto it; the shops' aisles meet it at junctions. Residents don't drive through a parking lot to get home.
- **Retail pads** stack eight cars at the drive-thru (the patio moved to the lane's inner side); a 2-pad program on a lot that holds one gets one and says so.
- **Fixes:** a re-fit that keeps the street arrangement kept every street; a moved community center steps off a street; a home taken out as "stranded" when it wasn't (a third of some plans' homes); a moved collector joins back; pod plans keep the lot depth asked for (a 246-acre plan went from 586 to 673 homes); "Neighborhood" is spelled the American way on the sheets.
- **Benchmarked** on 95 synthetic sites (2 to 120 acres, five shapes, sixteen programs from a gas station to four-use mixed use) with contact sheets of every pick: 63 clean and one not ready, from 44 clean and a dozen not ready at the start of the day. The engine tests pass (`test/countydata.mjs` needs GNU date on macOS; `test/streetnet.mjs`, failing before, now gets further and fails on a street bent by hand).

### 5:44 PM CT: Plan sets and renderings for the agents (commit hash added when pushed)
- **The agents can make a full plan set.** After an agent lays out a site plan, the plan is kept and the answer gives its plan id. With it, the agent can make the same schematic design set as **Make Plan Set** here (cover and notes, site and civil, landscape, and for each building type plans, elevations, sections, schedules, structural, mechanical, plumbing, electrical and fire), choosing the sections: no fuel sheets without a gas station, telecom and renderings only when asked. Claude writes the notes and designs each building type, checked the same way; the drawings come from the plan. A set takes several minutes, so the agent starts it and checks back until it's done, then gets a download link to the PDF (good for 24 hours).
- **The agents can make renderings.** From the same plan id, photoreal renderings from any of the camera views here (from the corner, the street, low at the entry, the back, the sides, high overhead, top down, or a close-up of one building), with the look, time of day, surroundings, resolution and detail to choose, inside the same monthly renderings budget. There's no map to photograph on the server, so the plan's 3D massing is drawn from the same cameras and painted from that. The renderings are kept with the plan, and a plan set asked to include renderings puts the newest four on its rendering sheets.
- **Tested** with the AI stood in for: a 31-sheet set made across three calls with real sheets on the title block, a building design fixed on its second try, a set without Claude (standard notes, rule-based designs), and the massing from every view for a townhome plan and a retail plan. Not tried against the live AI services yet.
### 11:13 AM CT: OP-0046 gets Option B, the 5.8-acre tract priced with the team's budget (3ef9ae8, 1271296, ceb4b7d)
- **Option B · 5.8-acre tract, budget inputs** on the OP-0046 Waller project: the retail center's tract on its own (the land east of the drainage channel, about 4.35 acres of parcel 10680, the four buildings, their 96 spaces and both ponds as drawn), with the Oct 2026 "Budget For Projects 4.0" workbook's numbers already in its Pro forma: $2,500,000 of land, the budget's $114.41 a sf hard cost (entered as $105.91 so the app's own 5% contingency makes up the budget's $8.50 line), its $841,120 of site work, $25 a sf tenant improvements and $25.20 a sf rent. What the budget leaves out (vacancy, property taxes and their recovery, leasing commissions, soft costs, developer fee, construction interest) stays at the app's rates. On those numbers the tract comes to about $8.67M all in and a 6.7% yield on cost, just under the 6.75% market cap rate, where the workbook's own 0% vacancy and 7% cap read better than they should.
- **The project notes say what the budget is missing:** the shell carries no building plumbing, HVAC or electrical (only fire sprinklers, site lighting and fire alarm), and eight soft-cost lines had rates but no totals ($41,720). A corrected copy of the workbook went back to the team with those filled in and $22 a sf of MEP allowances flagged "to confirm" (hard cost about $136 a sf, project about $9.03M).
- **Rent check** against Oct 2026 listings: Waller retail asks average about $19.85 a sf, new strip space on Field Store Rd asks $30 to $40 NNN, so the budget's $25.20 is inside the range for new construction on FM 362 but above the town average; it stays as entered.
- The project test now checks Option B too (its acreage, buildings, spaces, pro forma inputs, nothing outside its line). Seeding the project again (the Seed project workflow) puts Option B on every device.
- **Merged with experimental** (facades in 3D, BIM, the 10-year pro forma, budgets from past jobs) so both sets of changes run together: the Parking field keeps its place in the layers, the entrance search and the map next to experimental's facades and fire-access rules. The tests' local Chromium is found at the current Playwright build (the report tests rendered with a stand-in and one failed).


### 1:41 AM CT: Buildings drawn from their floor plans in 3D and in the BIM model (aa9971d, b6f4058, cf7a94f, f708ae0, e716ec3)
- **Buildings look like buildings in 3D:** tilt a site plan and every building is drawn from its own floor plans (the ones the plan set draws): brick on the ground floor and siding above, each townhome in a row its own colour, windows and doors with white trim where the plans put them, apartment balconies and open stair breezeways, hip roofs on homes, townhomes and apartments, flat roofs behind a parapet with rooftop units on shops and offices, metal canopies over shop fronts. The 3D renderings start from this view too.
- **The flat plan is unchanged:** seen from straight above, buildings keep their use's colour and the selected one its highlight. Phase 2 stays plain and faint, and the Buildings layer button hides the 3D detail with the buildings.
- **Homes fit their plans:** a home a few feet off its plan's size gets the plan stretched to fit, so no bare block shows past its walls (43 of 141 homes on the 40 acre test showed it).
- **BIM models from the same plans** (not yet in the app: the model service isn't running): rooms, interior and party walls, doors and windows, stairs, balconies and roofs, in textured brick, siding, stone and shingles. A whole 141-home neighbourhood builds without errors in about 75 seconds.


## 2026-10-26

### 11:42 PM CT: Spare land beside the buildings, a better option on big mixed sites, typed requests in Feasibility, townhome plan sets that match the site plan (8b03667, e16c0a7, 922e63a)
- **Spare land stays usable:** where a site has much more land than its detention pond needs, the pond now goes at the far end of that land, so what's left sits beside the buildings and their drives (room for a later phase) instead of cut off behind the pond.
- **A better option on big mixed sites:** a layout in pods round a spine road now takes the last of the three places when it meets more of the numbers you asked for. On the 40 acre test it gives 237 of 240 apartments and 101 townhomes, where the other layouts gave 220 and 61.
- **Type what to build in the Feasibility Site step:** "120 garden apartments, 3 stories, with a clubhouse and pool" is laid out as written; the use list is still there for a quick layout.
- **Townhome plan sets match the site plan:** rear-load rows are drawn with the garage on the back lane and the front door and living room on the court; rows of different lengths share one unit design (the set no longer draws the same unit three times: 34 sheets instead of 52 on the test). A drive-thru restaurant pad's floor plan has its pick-up window.
- The report's scope line now says costs come from the budget workbook, the team's 2024–25 budgets and house rates.

### 10:55 PM CT: Budgets from the team's own jobs, returns first, apartment plan sets, and site plans that build what's asked (3f74df7, 3be2e56, f1e739f, 703239f, 89682ab, 3562a73, 0531bfd)
- **Budgets from the team's own past jobs:** houses, shops and restaurants, small industrial and flex buildings (up to 40,000 sf) and convenience stores are now priced line by line from the middle of the team's 2024–25 Smartsheet budgets for that kind of building (foundations, roof, walls, windows, doors, mechanical, plumbing, electrical, sprinklers, and the interiors where the owner finishes them), with the budgets' 10% contractor fee as its own line. Each line says how many past budgets it rests on. Apartments and townhomes still use the budget workbook; offices, medical, hotels, churches, storage and big warehouses still use the platform's rates.
- **A check against the team's numbers:** the budget now shows the plan's building and site work per square foot beside the team's own all-in median for that kind of building (the sample apartments: $132 against the team's $142, 7% lower), and flags a gap over 20%.
- **Feasibility pro forma leads with what the team decides on:** levered IRR, equity multiple and the 10-year average cash-on-cash first, then cash-on-cash for each year of the hold, then cost, NOI and the rest. The project summary beside every step shows the same three.
- **Plan sets now draw apartment buildings:** floor plans for every floor, roof plan, elevations, sections and the structural, mechanical, plumbing and electrical sheets for each apartment building (garden walk-ups with open breezeway stairs, the building's own number of units, a unit schedule and apartment code notes). Before, apartment buildings got site sheets only. The clubhouse is drawn as a clubhouse (leasing, club room, kitchen, restrooms, mail, fitness), not an empty shell. These unit plans are drawn by rule and are schematic.
- **Site plans build what you ask for:** "120 garden apartments" reads 120 units, "50 homes" reads houses, pad sites asked for on a shop, restaurant or office plan are laid out on the street in front of the main building (an option without them says so), an amenity center asked for with townhomes is built at the entry, and townhome options always meet their own guest parking.
- **A second way in more often:** where a park along the street blocked a fire-access second entrance for a neighbourhood of more than 30 homes, it now crosses the park (cut round it) when that breaks no check and costs no parking.

### 9:50 PM CT: Experimental gets the 10-year pro forma, BIM groundwork and main's latest (a191760, 400b170)
- **10-year pro forma led by levered IRR, equity multiple and cash-on-cash** (see the 9:05 PM entry) is now on the experimental site too, including in the Feasibility study and the agents' study answers. A study's levered IRR changes because the hold is now 10 years (the sample apartments went from 3.5% to 6.0%).
- **BIM groundwork** (see the 8:31 PM entry) and **main's latest work** (home communities, the agents' quality check on site plans) are merged in. Nothing else changes for users.

### 9:05 PM CT: A 10-year pro forma led by levered IRR, equity multiple and cash-on-cash (0d45faa)
- **10-year hold:** the pro forma now holds a project for 10 years after it's stabilized before the sale (it was 5), as the team underwrites. Plans that never changed the hold move to 10 years; a hold set by hand stays. Change it under Assumptions, **Hold after stabilizing**.
- **The three returns that matter come first:** **Levered IRR**, **Equity multiple** (with the equity put in) and **Cash-on-cash** (the first stabilized year, with the average over the hold) now open the pro forma, ahead of cost, NOI, yield and value.
- **Cash-on-cash by year:** a row of the 10 hold years, each year's NOI less the permanent loan's payments over the equity put in, so you can see it climb as rents grow.
- **Excel:** the Pro Forma workbook opens on a new **Returns** sheet (levered IRR, equity multiple, cash-on-cash first year and average, then NOI, debt service, cash flow and cash-on-cash for each hold year), and the one-page sheet adds an average cash-on-cash. The TestFit method shows its cash-on-cash too.
- **The AI assistant** now reports cash-on-cash (first year and average) when you ask how a plan's numbers work out.

### 8:31 PM CT: BIM models of site plan options with BIMCraft: the trial, the model builder and its worker (25f4c03)
- **Nothing in the app changes yet.** This is the groundwork for real building models of each site plan option, built with BIMCraft (an open-source building modeling tool).
- **What it does:** every building in an option becomes a real model: a storey at a time, with walls of an assembly for its use (tilt-up warehouses, brick shops, EIFS offices, wood-frame apartments and homes), storefront facing the parking, office window bands, apartment and home windows, entry and garage doors, dock doors on a warehouse's truck court, slabs, and flat roofs behind a parapet or hipped roofs on homes. Townhome rows get their party walls. Out come a model file that Revit and other BIM tools open (IFC), a 3D picture, and the quantities per building: wall, glass, roof and floor areas and door counts.
- **Tried on the King Rd Project:** its three saved options (134 tiny homes at 550 sf, apartments, 134 tiny homes at 448 sf) model in 5 to 13 seconds, every home on its own lot with its door facing its street and no garage on a tiny home.
- **Tried on all seven kinds of plan** (retail, office, apartments, industrial, townhomes, single-family homes and a mixed-use tract): every one builds in under 7 seconds, and floor areas match the plan to the square foot (homes add their garage and porch, which the plan's living area leaves out).
- **For the budget:** it stays $ per square foot by type. The model will check it against the building's shape (more wall, more glass or more storeys than a typical building of that type cost more). That adjustment is the next step.
- **Still to do before anyone sees it:** host the small model service (it can't run on Vercel), then add a Download Model button and the cost check to each option.

### 7:00 PM CT: Plan for BIM models of each option with BIMCraft, priced from their quantities (27b7e75)
- **Planning only, nothing in the app changes.** `BIM-PLAN.md` sets out how each site plan option could become a real building model (walls, windows, doors, floors and roofs) using BIMCraft, an open-source building modeling tool that can be driven automatically. The model would give the budget real quantities (wall, glass, roof and floor areas, doors) to price instead of one cost per square foot, a model file architects can open in Revit, and better buildings for the 3D view and renderings.
- **Honest about accuracy:** this moves concept budgets from a rough per-square-foot number toward an assembly-based estimate, still a range rather than an exact figure; the biggest remaining gain is checking prices against our own past jobs.

### 3:29 PM CT: The OP-0046 Waller site (FM 362 at Old Houston Hwy) rebuilt in Projects from its drawings (ddd38c8, a404497, 1c8b7f3)
- **A new project for the whole team: OP-0046 · 0 Old Houston Hwy at FM 362, Waller.** The three Waller CAD parcels (10687 Priya Capital, 10682 Market Square Commons, 10680 Waller Heritage Plaza; 16.16 acres, assessed $1,648,410) merged into one site, with one option, **Option A · OP-0046 as drawn**, that follows the two site plan sheets piece by piece: the six-store row along the west line (Bealls 30,000 sf, clothing 31,579, grocery 32,626, home decor 21,693, dollar store 11,475, pet store 10,772), the 7,000 sf restaurant pad at the corner square to Old Houston Hwy, the four-building retail center along FM 362 (5,000 + 5,000 + 6,000 + 12,000 sf), both retention ponds (10,531 and 14,215 sf, 12 ft deep), the drainage channel between the two halves as a no-build area, the service drive, the three driveways from Old Houston Hwy, the drive inside the FM 362 line, and every parking row where the sheets draw it with its aisles as one connected lot: the main aisle down the front of the stores, the north drive along Old Houston Hwy, the cross aisles between the blocks of the field, the aisle along the long row beside the channel, the loop round the pad and a full-width aisle between every pair of rows that face each other.
- **How exact it is:** the sheets were read as vectors, not traced by eye. The shopping center sheet is to the parcels' scale (its west edge is the 1,099 ft west line), the retail center sheet to its own (its 100 ft buildings and 9 ft stalls), and each is pinned to the real parcel corners it was drawn from. Buildings keep their labelled widths and their stated floor areas exactly (the sheets' outlines run a foot or two deeper than their own numbers; the restaurant pad is drawn 64'-6" × 124'-7" but labelled 7,000 sf, so it is 64.5 × 108.5 ft). The ponds come out at their stated areas to within 2 sf.
- **Where it differs, and why:** the app parks at 9 × 18 ft stalls, and the shopping center sheet's stripes scale to about 6.5 ft wide, so the same rows hold 708 spaces here against the sheets' 849 (the retail center's 98 come out as 96); accessible spaces are the app's count (15), not the sheets' 46. The sheets' acreages (8.3 + 5.8 + 0.9) don't add up to the county's 16.16 and aren't used.
- **Parking lots are one paved surface now (a new kind of piece, and the engine uses it):** a **Parking field** is the asphalt under and between a lot's rows and aisles. The layout engine lays one under every parking field it draws, so the gaps at the ends of rows and aisles are paved as on a civil sheet instead of left as lawn; you can add one from **Add › Paving** and shape it like any piece; the sheet, the map, the plan key and the DXF treat it as paving (one curb round the whole lot, the rows drawn on top); the numbers count a field's paving once, less whatever already stands on it (rows, aisles, a building, a pond), so impervious cover is right; a drive that ends on a field isn't a dead end, a row beside a field has its aisle, and a sign or an island can't stand on one. For a lot drawn by hand there's a helper that finds the paved fields from the rows and drives (gaps up to about 32 ft closed, kept inside the lot and off the buildings, ponds and easements); OP-0046's three lots (the shopping center's, the retail center's and the service strip) are made that way.
- **Behind it:** a builder for the project, a seed script and a **Seed project** workflow that reads the three parcels from the Waller appraisal district's own layer (the one the property card uses, with the parcel map's outlines as a fallback) and saves the project to the team's shared Projects, where it syncs to every device. Running it again replaces the team's copy. A test checks the build (areas, positions, no overlaps, nothing outside the site).

### 1:51 PM CT: A full landscape section in plan sets; layout review and two layout fixes (experimental branch) (a5c6593, d479b35)

- **Landscape in plan sets is now six sheets:**
  - **L-001:** calculations (site areas, each landscape rule with what it asks for, what the plan shows and whether it meets it, the plant palette with quantities).
  - **L-101:** planting plan.
  - **L-102:** enlargements of the entry and the amenity, on big sites.
  - **L-201:** irrigation plan (what's sprayed, on rotors, on drip or not watered, valves, mainline, where the water comes in).
  - **L-501 and L-502:** planting and irrigation details.
- **The planting now meets the usual rules:**
  - Street trees every 40 ft, a tree for every ten parking spaces, a hedge screening parking from the street, buffers on the other property lines, and a tree in every front yard.
  - Trees go round the ponds, with a planted edge in wet ones; there are beds along the buildings, and the entry and amenity are dressed.
  - Trees stay out of the sight triangles at drives and clear of hydrants and transformers.
  - Before, the 27-acre test subdivision showed 5 of 31 street trees and 50 of 71 front-yard trees. Where a plan can't meet a rule, L-001 says so.
- **Site plans:**
  - On a flag lot the entry comes down the strip to the street instead of across the neighbour's land.
  - On a mix with shops in front, the pond is never put between the shops and the street.
- **A written review of the layout engine** lists what still lays out badly and the order to fix it.


### 1:37 PM CT: Agent site plans are checked before they're handed over; tiny homes never get a garage (53329fb)
- **A quality check on every site plan the agents make:** before the answer goes back, each layout is checked like a planner would: a way in from the street, every drive reached, fire lanes at least 20 ft, dead ends, a second access past 30 homes, parking, detention, each home on its own lot facing a drive with 10 ft to the next, a parking pad each, no garage on a tiny or manufactured home, a sensible floor plan, density, and whether it is what was asked. A layout that fails gives way to one that passes, and the answer starts with **READY**, **READY WITH NOTES** or **NOT READY** with each finding.
- **It found real problems, now fixed:** on 25 × 55 pads backing onto each other, homes were 2 ft apart end to end (now 10 ft: the home keeps 5 ft from the back of its pad, so a 25 × 55 pad holds a 15 × 28, 420 sf home and 550 sf homes need 64 ft pads); tiny homes were asked 2 parking spaces each with room for 1 (now 1 a tiny home, 2 a manufactured home); lanes ran inside the landscape buffer.
- **No garages on tiny or manufactured homes:** their floor plans used the house plan's 2-car garage (a 10 ft garage room in a 16 ft wide, 550 sf tiny home). They now get their own: an open living room and kitchen, a studio, one bedroom or more by size, a bath or two, the car on its pad. Library tiny homes count their pad, not 2 garage spaces.
- **Home communities through the agents:** the agents can give the kind of homes, how many, the pad size (the homes sized to fill it), the home size or living area, a buffer, the street the site faces, and facts from reference files ("134 RV lots, 25' × 55' typ" is read as the pad size). A request for tiny or mobile homes is laid out as homes even if the AI reads it as self storage, and the answer says so.
- **Tiny home rent:** one Tiny home rent for every tiny home, by its size from your Oct 2026 comps: about $1,150 a month for 550 sf (it was $1,425), $1,025 for 420 sf.
- **Tested** end to end on King Ln with the agents' tool (real Chromium sheets): the request as made, the AI answering self storage, 25 × 55 pads, 550 sf homes, single-wides, and an ordinary subdivision; every community plan comes back READY WITH NOTES, the note being the real one (about 130 homes behind one strip need the fire marshal's sign-off on a second access). Not tried on the live site yet: AMP still can't reach it through Vercel's login protection.

## 2026-10-25

### 9:00 PM CT: Agents can work on projects (experimental branch) (dca901d, 5ff97d1, 94f6928)
- **Agents in your project app can now see the team's projects:** the list, and each project's parcels, site facts, options with their numbers, feasibility inputs, scenarios and saved reports.
- **They can run a project's feasibility study** and get the same numbers as the Feasibility tab: budget, pro forma, returns, sensitivity, scenarios and risks. They can try "what if" changes without saving anything.
- **They can get the full report set** (the Feasibility report PDF, the workbook, the CSVs), and links to anything the project has stored: report sets, reference files, renderings and plan sets.
- **With project changes turned on** (only when the agents' connection is locked with its access token), agents can also:
  - start a project from an address, parcel number, several parcels or an outline;
  - lay out a site plan in it, saved as its next option;
  - change assumptions, budget lines and scenarios;
  - change the name, status, notes or land price;
  - save the report set for the team.

  Their changes show as made by "<name> (agent)". Nothing can be deleted.
- This branch now also has the latest from the live site (rendering controls; renderings and plan sets on every computer).

## 2026-10-24

### 7:18 PM CT: Feasibility workspace checked and tightened (experimental branch) (ce46211…0af719c)
- **Saved report sets now stay listed.** Saving a set recorded it on an old copy of the project, so the list stayed empty. Generating a layout had the same problem: the new option wasn't kept as the one the study uses.
- **Reports aren't refused over input notes.** For example, a change to an assumption the chosen option doesn't use. The note is shown in the workspace with a one-click fix, and listed on the report.
- **Sensitivity is consistent:**
  - A cost case now moves contingency, soft costs and the developer fee with construction.
  - Every "low case" is the downside.
  - The hold analysis grows rents from the end of construction, as the development model does.
- **Flood:** a site checked with no mapped flood zone no longer reads "not checked", and the workspace updates when the site lookup finishes.
- **Safer:** values from a synced project can't put markup into the scenario editor.
- **Faster:** a full study with sensitivity takes about half the time (IRR is 10× faster), so edits update sooner.
- **Downloads** from the workspace are recorded on the Reports tab like every other export.
- **Checked:**
  - Every test passes on macOS.
  - The sample project runs offline from intake to the full report set.
  - The branch contains no reference to the other two apps' infrastructure.
  - The workspace passes an automated WCAG 2.1 AA scan.

### 6:27 PM CT: Feasibility workspace on the experimental branch (experimental, not on the live site) (59be765…0e1e736)
- **A project now opens on Feasibility:** six steps (Intake, Site, Plans, Budget, Pro Forma, Reports) with the project's cost, yield, IRR, NPV and top risks always in a summary beside them.
- **A real budget:** CSI-coded line items priced from the layout's quantities. Apartments and townhomes use the Finishes Solutions budget workbook's lines; other uses and site work use the platform's rates. Costs are escalated by the construction-materials price index, with a location factor, and rolled up the budgeting suite's way (GC fee, contingency, a developer fee that is a true share of the total). Every line says where its rate came from and can be changed or left out.
- **Every assumption shows its source:** interest rates come from the nightly SOFR and 10-year Treasury data, land from the asking price or the appraisal district's land value (no longer the total value with buildings), and rents carry the ZIP's typical rent as a check. Change any input and every number updates.
- **Pro forma fixes:**
  - Lease-up income now pays the construction loan down before anything is distributed.
  - Exit and refinance income grow rents and costs at their own rates.
  - NPV is added, and so are break-even rents.
  - A 5-year hold on the budgeting suite's tested engine.
- **Sensitivity and scenarios:** what moves the return most, two-way grids, and named scenarios (financing, costs, unit mix) side by side.
- **Report set:** a Feasibility report PDF (summary, site and layout, plan set, budget, pro forma, sensitivity, risks, and every assumption with its source), a workbook, CSVs and the study data. These can be downloaded or saved for the team.
- **Fixed:** in the site plan editor, the Layers / Items tabs were calling the project page's tab switch.
- **Not live:** this is on the `experimental` branch only. Saving report sets needs a new storage bucket set up first.
### 5:14 PM CT: More rendering control; renderings and plan sets on every computer (7c560f2)
- **Renderings and plan sets no longer vanish on another computer.** They used to be kept only in the browser that made them, so another computer (or the same one on a different web address, or after the browser cleared its storage) said "Not on this device: it was made on another one". Each rendering, its massing picture and each plan set PDF now also goes to the team's storage as it's made, and any computer without a copy loads it from there. Renderings this computer already has are shared the next time it opens the project. Deleting one removes the team's copy too.
- **More views:** From the left side, From the right side, High overhead and Top down (straight down, like a drone survey photo). High overhead and Top down turn a long or angled site so it fills the picture.
- **Surroundings:** Real surroundings (aerial imagery, whatever base map the page shows), Typical surroundings (the AI draws them) or The site only (a plain ground, like a presentation model). Street and place names on the base map are no longer painted into the picture.
- **More light:** early morning, midday, overcast, late afternoon, sunset, dusk and night.
- **Resolution and detail:** HD (2048 × 1152), 2K (2560 × 1440) or true 4K (3840 × 2160), and Best, Standard or Draft detail. Pictures used to ask for 1920 × 1080, which the image models don't take (1080 isn't a multiple of 16), so they all came back at 1536 × 1024 in the wrong shape; HD now really is 16:9. 2K and 4K need GPT Image 2 or newer; a 4K picture too big to send back directly is handed over through the team's storage.
- **Engine:** pick the OpenAI image model in the rendering form (the same pick as Settings › AI model › Renderings).
- **Preview Massing:** every view's massing as the AI would get it, free, before you spend on a rendering; click one to pick its view.
- **The plan's Render section now takes its picture off-screen** like the project page does (sharper, nothing else on the map), so both make the same picture.

### 12:53 PM CT: Tiny homes (3d45b67)
- **A Tiny homes group in the building library:** one-story homes of 400, 480, 550, 650 and 800 sf, 16 ft wide for a 25 ft lot with a parking pad beside it (or 20 ft wide for a 30 ft lot). Add one from the library, or switch a home's **Type** to a tiny home.
- **Counted as what they are:** the plan's home table lists them as **Tiny home** at their own size (not as a 1,900 sf one-story house), the pro forma rents them by their size (about $1,425 a month for 550 sf to start, editable as **Tiny home rent**) and prices them by their size when they're sold.
- **Rendered as tiny homes:** the AI is told they're tiny one-story cottages of their real size and to keep them small, with their own look (board-and-batten or lap siding, metal or shingle roofs, small porches, a parking pad each), instead of ordinary brick houses.
- **Not yet:** **Build** doesn't lay out tiny-home lots by itself; the King Rd Project's Option A was laid out by hand (now with 550 sf homes).

## 2026-10-23

### 5:54 PM CT: Renderings follow the plan again (f055008)
- **Fixed: renderings made from the project page drifted from the plan.** Since Oct 19 they've been taken from a hidden map, and that map was carrying the app's own markings (filing dots, the heat layer, highlights, pins) into the picture, where the AI painted them in as if they were part of the site. It also drew the massing at standard resolution with no smoothing, so small buildings, lots and edges came through rough and the AI filled in the rest.
- **Now** the hidden map shows only the base map and the option's massing, draws the option exactly as the site plan map does (Waller plans included), and takes the picture at twice the size with smoothing, then scales it to 1600 × 900, as sharp as the old pictures taken off a high-resolution screen.
- **Renderings already made don't change;** make them again to get the sharper ones. Tested in Chromium (old vs new picture side by side) and with unit tests; not yet tried on the live site.

### 5:05 PM CT: Home community homes are sized to fit (d609d62)
- **Homes sized to the pad:** give a pad size and the homes are sized to fill it. On the exhibit's 25 × 55 pads that's a 15 × 32 (480 sf) tiny home with its parking in front and 10 ft to the next home; King Ln holds about 140.
- **Or the size you ask for:** "550 sf tiny homes" or "16 x 40 homes" gives homes that size, with the pads made as big as they need, and the plan says so. On King Ln: 550 sf homes on 25 × 60 pads, about 125 homes; 16 × 40 homes on 36 ft pads, about 100.
- **Fixed:** the lane the entry comes in on no longer runs on into a dead end at the far end of the site; the rows along the property line no longer stretch too far; "16 x 40 homes" is read as a size, not 40 homes.

### 4:32 PM CT: Site plan answers no longer call a failing layout a pass (769de87)
- **Said plainly:** when no layout passes every check, the agent's site plan answer now says so and names what the picked one is missing (for example parking short), instead of "passes every check". Found in the live test on a Waller parcel.

### 3:55 PM CT: Home communities match an RV park plan, and are valued as rentals (aa391e5)
- **Your pad size:** say "25 x 55 pads" (or attach an RV park plan that gives its site size) and every lot is that size. On King Ln with the exhibit's 25 × 55 pads, the plans fit 140–148 tiny homes or park models (the exhibit shows 134 RV lots, with a bigger pond). Only homes that leave 10 ft to the next fit a 25 ft pad, so single-wides need wider pads.
- **Out to the property line, like the exhibit:** lots now run to the property line; say "a 10 ft buffer" if you want a landscape strip. The rows along the line are deeper where needed so the homes keep the plan's setbacks (with the default 20 ft rear setback, those rows come out about 74 ft deep; lower the setback under Site parameters for 55 ft all round).
- **The exhibit's shape:** one of the three options always puts the pond in a corner beside the entry, with the loop and the rows along the property line, as on the RV park plan.
- **Valued as rentals:** the pro forma rents each home with its pad (about $1,050 a month for a tiny home, $1,300 for a manufactured home), with the homes bought and set, $30,000 a finished pad, and a 6.75% cap rate, all editable. At those defaults King Ln comes out at about a 5% yield on cost, below the cap rate, so check the rents and costs before relying on it.
- **Not done yet:** the detention is the app's usual estimate (about 1.2 acres here; the engineer's exhibit shows 2.2). Spacing between homes and the fire lanes still need the local rules and the fire marshal. Not tried in the live app with the AI yet.

### 3:31 PM CT: Tiny home and manufactured home communities; flag lots come in up their strip (08be202)
- **Fixed: a tiny home / mobile home community came back as self storage.** On 31807 King Ln, "a tiny home/mobile home community laid out like the reference file has showing an RV park" was drawn as self storage with about two dozen RV / boat stalls and a 7,200 sf leasing office. The RV park in the reference file had pushed the AI to "RV storage".
- **Now it's homes on lots, laid out like an RV park:** private lanes in loops with a row of lots on each side, lots along the end lanes where there's room, the detention pond across one end or down one side. On King Ln: about 97 tiny homes, 48 manufactured homes, or 58 of both (the reference RV park had 134 RV lots, which are smaller).
- **New home types:** single-wides (16 × 56, 16 × 76), double-wides (28 × 52, 28 × 64), a tiny home (12 × 32), a park model (14 × 40) and a cottage (20 × 40), each with a parking pad. The sheet names it a manufactured, tiny, or tiny & manufactured home community and counts homes and pads, not garages.
- **Fixed: flag lots.** King Ln reaches Old Washington Rd only by a 60 ft strip about 250 ft long. The plan treated the back edge of the wide part, which borders the neighbour's land, as road frontage and put the entry there. Now the wide part is laid out on its own and the main entry is a drive up the strip. Ordinary subdivisions on flag lots get this too.
- **Not done yet:** spacing between homes, lane widths and fire lanes use typical values (check them against the local rules and with the fire marshal); the pro forma still values these homes as for-sale houses, not lot rent; an RV park itself is still laid out as a storage-style yard. Tested offline on the King Ln outline from the survey and in Chromium; not tried yet in the live app with the AI.

### 2:03 PM CT: Parcels in separate pieces can all be picked (ccc9b2a)
- **Fixed: 31807 King Ln dropped the third pick.** The King Ln property is one Waller County account (13814) in two separate pieces (0.43 and 6.15 acres). With 31807 Old Washington Rd picked, picking the second King Ln piece loaded and then disappeared, because the earlier fix treated "same account" as "same parcel".
- **Now:** the same parcel line on the map is the same pick; different accounts never are; and the same account counts only when your click lands inside the piece already picked. Site Plan for All and projects keep each piece as its own parcel.
- **Tested in the browser** with the three real outlines, with the parcel lines on and off. Before: the third pick dropped, and Site Plan for All gave 2 parcels and 3.56 acres. After: all three stay, and the site is 3 parcels and 9.82 acres.

### 1:28 PM CT: Every parcel you pick stays picked; Build uses both sides of a road (b901d1e)
- **Fixed: the third parcel disappeared.** On Waller Tomball Rd, the statewide record for one account (0422450000001) has a 128-acre outline that takes in about a dozen parcels the map's parcel lines show separately. Picking one of those returned that same record, so it was taken for a parcel already picked and dropped, and only two stayed selected.
- **A pick is now the parcel drawn under your click** (with **Parcels** on): its own outline and account. Where the statewide record is a different account, the app asks the county appraisal district for that account, and otherwise shows the owner and address from the parcel lines instead of the wrong record's. Two different accounts are never treated as the same parcel. **Change Parcels** in a plan works the same way.
- **Tested in the browser** on your Waller Tomball Rd tracts, with the outlines and parcel lines from the live data. Before: the third pick vanished, and Site Plan for All made a 2-parcel, 20.78-acre site. After: all four stay, and the site is 4 parcels and 170 acres.
- **Both sides of a road are built on.** When a road runs between the parcels of a site, Build lays out each side as a site of its own, with the road as its street and its share of the program by area, then puts them together. On two 5-acre lots with a road between: retail about 40,000 sf on each side (before: none on one side), apartments and offices on both, nothing on the road.
- **A parcel drawn across two map tiles** now shows its full acres on the site's parcel chips (it showed only the piece under the click).
- **Not checked yet:** a look on the real map with the live parcel lines. Also, without **Parcels** turned on the app can't tell which parcel you clicked, so a statewide record that lumps parcels together can still drop a pick.

### 11:36 AM CT: Site plans for your project app's agents (5b3625a)
- **The agents can lay out a site:** once an agent has found a parcel (by address, parcel number, several parcels together or an outline), it can lay out a concept site plan with the same layout engine as **Site plan** here, and get the site plan sheet as a PDF.
- **From a request or the best use:** the agent says what to build ("25,000 sf retail strip with 2 pad sites"), or leaves that out and the AI suggests the best uses for the site (its size, frontage, flood zone, utilities, traffic, what's nearby and the market) and lays out the best one. It can ask for another of the ideas.
- **How hard the AI works:** low (seconds), medium (planned and reviewed, 1–2 minutes) or high (may change the program once). The street the site faces comes from the roads beside it; when none is found the answer says the front is a guess.
- **Said plainly:** when the plan holds more than was asked (the app fills land the request doesn't need), when a step was skipped for time, and when a site fact couldn't be looked up (never "none found").
- **Waller:** sites in the City of Waller or its ETJ follow the Waller planning guardrails, with their second sheet.
- **Not checked yet:** on the live site (the road lines, the AI and the street maps can't be reached from this environment); tested with stand-ins and real Chromium sheets. Money, renderings and plan sets stay in the app.

## 2026-10-22

### 7:16 PM CT: A market report for your project app's agents (376bace)
- **New report:** the agents can make a Market report PDF for one county, several counties or all seven home counties (or the county a property is in): headline figures and what's moving, the construction pipeline, growth and demand, housing and rents, costs and rates, and for Houston its crime, plus traffic counts and recent news, in the Finishes Solutions style, with a CSV when asked.
- **A print version, not a copy of the page:** it uses the same figures as the Market page but is laid out for paper, so it does not look exactly like the website's own Market export, which is unchanged.
- **Outside the seven counties** the agents are told plainly that the market data doesn't cover it.

### 6:52 PM CT: A demographics report for your project app's agents (a582127)
- **New report:** the agents can make a Demographics report PDF for a property: 1, 3 and 5-mile rings (or any radii up to 25 miles), or a whole county or drawn area. It has population and growth, households, median income, home value and rent (approximate where tracts are combined), vacancy, median age, households by income band, jobs located there and estimated spending by category, on a street map with the rings, in the Finishes Solutions style, with a CSV when asked.
- **Growth says what it is measured against:** population growth in the agents' answers now reads "since 2020" (the census survey it is compared with) and jobs growth "since 2018", instead of "5 years".
- **Not on the website yet:** the report is built so the Reports page can offer it later.

### 6:28 PM CT: Your project app's agents can make the PDF reports (8d167ef)
- **Four reports for the agents:** the FEMA flood & hazard report, the Environmental report, the Crime report (Houston) and the City / County Crime Report, for a property (its parcel), a radius, a county or a drawn area. Each comes back as the same PDF the Reports page makes, in the Finishes Solutions style, with a short summary and, when asked, the data as a CSV.
- **Kept small enough to send:** the agents' copies use smaller street maps and list the newest 500 incidents (the CSV has all of them). A report that still can't fit in one answer says so plainly instead of sending a cut-off file.
- **Your exports are unchanged:** the FEMA, crime, City / County crime and environmental reports' PDFs and CSVs from the website were checked to be exactly the same as before.
- **Not checked yet:** making these PDFs on the live site (they need the street-map service and the government data, which this environment can't reach); tested with stand-ins and a real Chromium render.

### 5:39 PM CT: Your project app's agents can pull this app's data (aedcbc3)
- **A connection for the project app's AI agents** (an MCP server at `/api/mcp`): its agents can ask about any property or area without anyone opening the map. Everything they can do is read-only.
- **What they can look up:** a property (match quality of the address, county, inside city limits or within half a mile of a city, the appraisal parcel with owner, values, acreage and outline), site facts, flood zones and flood history, ground elevations and slopes, environmental records, utilities, traffic counts, demographics in rings, the county's market figures, businesses, development activity, construction filings and the busiest developers, architects and contractors, crime (Houston street-level, or any US police department's yearly figures), stored local news and nearby airports. One "area overview" call gets most of it at once.
- **Every answer says where it came from:** the source, how current it is, a link, and what it covers. Outside a source's coverage the answer says "not covered here" instead of reporting nothing; a service that doesn't answer is named in one sentence and the rest still comes back.
- **The Market page's numbers** now come from the same shared code the agents use; they read exactly as before.
- **Not done yet:** the PDF reports for the agents (next), and AMP can't reach the site until Vercel's login protection lets it through (see the README). Not checked against the live services from here (this environment can't reach them); tested with stand-ins shaped like their real answers.

### 5:31 PM CT: Huntsville no longer listed under Waller County's sales tax (5eec8f5, 7d77060)
- **City sales tax by county is corrected.** Huntsville showed under Waller County because one remodel filed with the state under Waller has a Huntsville address. Filings whose address is outside the county they were filed under no longer decide which county a city belongs to.
- **Same fix for three other towns outside the area:** Livingston (was under Montgomery), Freeport and La Marque (were under Harris) drop out of the sales tax figures.
- **Area news** no longer searches a town just because of a misfiled filing.
- **On the site now:** the four towns were removed from the published figures right away; the nightly refresh keeps them out from here on.

### 4:59 PM CT: Site Plan for All uses every parcel picked (3a8f26a)
- **Every parcel you pick is in the site.** Before, parcels whose county outlines didn't quite touch were treated as separate, and only the biggest connected group went into the plan. On Waller Tomball Rd that dropped a 20.8-acre tract 60 ft from the 128-acre tract beside it.
- **Gaps between neighbours are filled in.** The slivers and gaps the county's outlines leave between parcels that border each other are now part of the site, with no slits between lots (tested on a block of four lots drawn 12 ft apart: one plain rectangle).
- **Roads stay roads.** Where the map shows a road in the gap, the parcels are still joined, but the road is a no-build **Road between parcels** in the site. Parcels more than 200 ft from the rest are still left out, with a note.
- **Nothing left out quietly.** The All tab now passes on parcels with no property ID and ones only Regrid has, and a pick with no parcel record is named in a message.
- **Parcels in several pieces keep every piece.** Some county records hold a parcel in separate pieces (the First Street right-of-way in Katy is two). The extra pieces were read as holes and lost; now the map, the card and site plans use them all.
- **Not checked yet:** a look on the real map (this was tested on recorded parcel outlines, not in the browser). And when a road runs the full length between two parcels, Build may still lay out only one side, because drives can't cross the no-build road.

### 4:47 PM CT: Pick the AI for each feature: OpenAI or Claude, and the model (c6b9d34)
- **One row per AI feature** in Settings › AI model: **Site plans**, **Ask AI**, **Filing briefs**, **Reference files**, **Place search**, **Voice** and **Renderings**, each with its own provider and model, kept on this device. Plan sets keep their own Claude model and effort below.
- **Claude can now be picked** for site plans, Ask AI, filing briefs and reference files (the site has its Anthropic key). Its default is Claude Opus 5.5; the list shows every Claude model the key can use. The "coming later" label is gone.
- **OpenAI only, with a model choice:** Voice lists OpenAI's live voice models, Renderings its image models, Place search its chat models. Claude has no live voice and doesn't make images, and place search uses OpenAI's web search.
- **Nothing breaks on a bad pick:** a model the key can't use, or one that can't answer a request, falls back to that feature's default; Claude picked without a Claude key on the site uses OpenAI. The note under the rows says which model gave the last answer. If you'd picked one OpenAI model before, the text features start from it.
- **Ask AI on Claude** keeps the conversation on your device and sends it with each question, since Claude doesn't hold conversations. A very long one has to be started again with **New**.
- **Not checked yet against the live services:** none of the Claude paths (Ask AI with its map tools, briefs, reading reference files) or the picked voice and image models have been run against the real APIs; they're tested with stand-ins.

### 4:06 PM CT: The Waller label box is off the plan panel (c1db6f2)
- **Removed from the top of the site plan panel:** the red box with "AI-assisted conceptual site plan · for feasibility and planning only · not for permit or construction" and its **Full label** link, the "Waller guardrails on · Inside the City of Waller" line with its **Verified** / **Unverified** tag, and "Laid out as B · Finishes base case".
- **Still there:** the label on the PDF, the drawing and the exports; the guardrail settings (on/off, scenario) under Site parameters; the scenario columns and tags in Numbers. When the layout on the map was made for a different scenario, a single line at the top still says so, with the button to lay it out again.

### 3:47 PM CT: Site plans can run on Claude, Opus 5.5 by default (d218152)
- **Pick the AI for site plans.** Settings › AI model › **Site plans** now has an **AI** choice: **OpenAI** (as before) or **Claude (Anthropic)**, and a **Claude model** list. The default is Claude Opus 5.5; any other Claude model the site's key can use is listed. Both picks are kept on this device.
- **What Claude does when picked:** everything the site planner asks the AI: thinking the site through, turning the request into a program, reviewing the layouts (it sees their drawings), Change With AI, Ask about the plan, What Should Go Here?, and the names. It thinks at the effort picked under Build. The layouts themselves are still drawn and measured by the planner, not by the AI.
- **Stays on OpenAI:** the jurisdiction (ETJ) and best-use web lookups, Ask AI, filing briefs.
- **Never stuck:** if the site has no Claude key, or Claude turns a particular request away, OpenAI answers instead, and Settings says which model gave the last answer.
- **Not checked yet against the live service:** the answers' quality and speed on Claude against OpenAI on real sites; the bigger requests (the program, the review, Change With AI) send Claude their answer format in the instructions, since it's too detailed for Claude's strict-format mode.

### 3:40 PM CT: Gas stations brought up to date with the re-fit fix (merge of main)
- **Checked together:** with the 2:54 PM re-fit fix, moving or pinning the big shop building beside a gas station's corner outparcel on the 0 Waller Tomball Rd tract now keeps all the apartments (216; it used to drop to about 106 and the app kept your edit instead). A test now covers it.

### 3:10 PM CT: Plan sets for gas stations: canopy, pumps and tanks (420925b)
- **A gas station's plan set now covers the canopy, the pumps and the tanks,** not just the c-store. A new **Fuel canopy & fuel system** section adds seven sheets whenever the option has a fuel canopy:
  - **F-001** notes and schedules: the tanks, each dispenser and its fueling positions, the pumps, gauge, emergency shutoff, piping and vents, the codes, and separation checks measured from the plan.
  - **F-101** fuel system plan: a tank for each product with its pump sump, fill and gauge, the product lines to each dispenser, vents to risers beside the store, monitoring wells and the emergency shutoffs.
  - **F-102** the classified (hazardous) areas round the dispensers, fills and vents, and the conduit to the dispensers, pumps and canopy lights.
  - **F-201** canopy plan (islands, dispensers, columns on a numbered grid, dimensions) and reflected ceiling plan (lights, with a lighting estimate).
  - **F-301** front and side elevations and a section at a column; **F-401** foundation and framing plans; **F-501** nine details (tank installation, dispenser island, piping trench, fill and overfill, vent riser, column base, emergency shutoff, monitoring well, pump sump).
- **The car wash is designed as a car wash:** a tunnel with an overhead door at each end and its equipment and chemical rooms, instead of a second convenience store.
- **Every kind of building gets its own sheets.** A set draws at most eight building types; on a mixed plan with many apartment shapes, the c-store, a restaurant pad or the clubhouse used to be folded into another type and got no plans of their own. Each kind now keeps a type first.
- **On the 0 Waller Tomball Rd tract:** the gas station, retail and apartments plan makes an 81-sheet set (every section ticked) with the c-store's full building sheets and the seven F sheets; all its separation checks pass.
- **Not done yet:** tank sizes, products, pipe routes, canopy member sizes and footings are rule-of-thumb placeholders, marked for the fuel retailer's engineer, the canopy manufacturer and the petroleum contractor; apartment buildings still get site sheets only.

### 2:54 PM CT: Re-fits keep the apartments when a shop building is pinned next to an easement (13eaa38)
- **Fixed:** on a plan with shops in front and apartments behind, moving or resizing the biggest shop building on a site with an easement or no-build area at a front corner made the re-fit lose about half the apartments (on the 20.78-acre Waller Tomball Rd parcel: 211 units down to about 110), with no parking row in front of the shops and empty lawns where apartment rows had been. The editor kept your change and skipped the re-fit, so nothing was damaged, but the rest of the site stopped re-fitting after that edit. It now re-fits as it should: 211 units, parking met, a full row in front of the shops.
- The service drive behind a row of shops now runs straight past a building you've pinned there, instead of stopping short at both ends of it. Re-fits after pinning a shop building also come out a little better on sites without an easement (on the same parcel: 203 units before, 211 now, and parking no longer short).
- **Not checked:** the same fix should help when a gas station is cut out of a mixed plan as its own lot, but that feature isn't on this branch, so it hasn't been tested.

### 2:34 PM CT: Gas stations in mixed plans, a 3D canopy, pump island orientation (50135e6)
- **A gas station beside other uses.** Ask for a gas station with shops, apartments, homes or any mix ("gas station with 10 pumps and a 4,500 sf c-store on the corner, 40,000 sf of retail behind it and 200 apartments at the back") and the station now gets its own outparcel at the front corner (at one end of the frontage on an inside lot), sized for its pumps, store and car wash. It's laid out as a full station (canopy along the street, store behind, tank pad, its own driveways) with the rest of the plan behind and beside it, the site's detention, and a cross-access drive between the station and the center where a straight one fits. Before, the gas station became a plain shop building with no canopy, pumps or tanks.
- **On the 0 Waller Tomball Rd tract (20.78 ac):** that request now gives a 10-pump station on a 1.85-acre corner outparcel, about 271,000 sf of shops and apartments (211 apartments) behind it, parking met and no rule broken.
- **Its settings in a mixed plan:** Site parameters has a **Gas station** group (pumps, store, canopy street, pump islands, car wash, air / vacuum). The outparcel shows as its own zone. Moving the canopy or store re-fits the station on its outparcel and the rest round it. The pro forma carries the ground lease beside the rents.
- **10 and 16 pumps.** Pumps now come in 4, 6, 8, 10, 12 or 16 (10 used to round down to 8).
- **Pump islands along or across the street.** A new **Pump islands** setting (Site parameters, and on a selected canopy): along the street (cars pull through side to side, as before) or across it (cars pull in toward the store). The canopy is sized for the way they run.
- **The canopy in 3D.** Tilt the map: columns on the pump islands up to an 18 ft clearance, a dispenser on each island, the canopy deck with a fascia band. The deck is see-through so the pumps show from above.
- **Fixed on the way:** in a mixed request the store took the first size said ("8 pumps, 30,000 sf of retail" made a 12,000 sf store); an extra side-street entrance could be added on top of the station.
- **Not done yet:** one gas station per plan; the outparcel always goes at the front corner (or a front end), not anywhere you choose; re-fitting after pinning the big front shop building can lose apartments on this tract (the app keeps your edit instead; the same happens with an easement at that corner and predates this change); the 3D canopy was checked on a test map, not yet on the live site.

## 2026-10-21

### 7:07 PM CT: Site plans in four steps: Site › Layout › Pro forma › Renderings & plans (4287ddb)
- **One step at a time.** A site plan option now has four steps in a row under the options: **Site**, **Layout**, **Pro forma** and **Renderings & plans**. The panel shows only the step you're on, with a **Confirm** button at the top, instead of every tool in one long list.
- **Confirm the site first.** The Site step holds the parcels, street side, side street and Redraw Site. **Confirm Site** puts those tools away (**Reopen** brings them back) and opens Layout.
- **Start blank, or as a parking lot.** Layout starts from the empty confirmed site. Add buildings yourself, or press **Start as a Parking Lot** to fill the site inside its paving setbacks with parking rows and a drive along the front and up both ends, then drop buildings in: the stalls under them give way (on a 400 × 300 ft lot: 284 spaces, 220 once a 12,000 sf building goes in). Build with AI and Change With AI are still there. Entrances and roundabouts moved to a **Ways in** section here.
- **Then the pro forma, then the deliverables.** Pro forma opens the base pro forma from the layout, ready to edit, with **Confirm Pro Forma**. Renderings & plans has the renderings, the exports and **Make a Plan Set**, which opens the project's Plans tab with this option picked.
- **Changes after confirming are flagged.** Move a building or change a pro forma input after confirming and that step reads **Changed since it was confirmed** and the steps after it wait for it to be confirmed again (putting it back as it was counts). The plan can only be changed in the Layout step.
- Existing options open at Layout with their site counted as confirmed. **New Option › Blank site** keeps the site's confirmation.
- **Not done yet:** the steps are within the plan panel (not separate pages), the parking lot start uses straight rows along the street side only, and the phone layout of the steps hasn't been checked on a real phone.

### 6:31 PM CT: The site fills by default, layouts rank by leasable + sellable square feet, deeper ponds as options (c531a8c)
- **No Phase 2 by default.** Land the request doesn't need now gets more of the program (more homes, longer shop rows, another building) instead of "Future development · not in this phase". Settings › **Leftover land** chooses: fill the site (the default), fill it and mark the extra Phase 2, or hold it for later. Words like "hold the back for a future phase" or "with the rest as phase 2" still do that. An AI's suggestion alone never holds land back.
- **Ranked by what you can lease and sell.** After the rules (checks clean, parking met, detention met or stated), layouts are ranked by **leasable + sellable square feet**: the floor area you can lease plus the homes' living area you can sell. It's shown on each layout card and in Numbers, and the AI's review is told it's the owner's goal.
- **New arrangements:** the pond can sit beside the shops so the homes get the site's full width, shops grow beside homes when no size was given, and the layout with the most homes is always among the choices.
- **Deeper ponds as options.** Next to the usual 4 ft pond, Build also lays out 6 ft and 8 ft deep ponds as separate layouts, each named for it and saying what it assumes ("assumes an 8 ft deep pond — confirm with your civil engineer") and what it buys in pond acres, homes and square feet. The storage rate (Waller's 1.00 acre-foot per acre) never changes; a depth that gains nothing isn't offered.
- **On the Waller Tomball Rd tract** (Waller guardrails on): 37–38 homes with 20,000 sf of retail at 4 ft (32 before), about 44–46 at 6 ft and 49 at 8 ft; 50–55 without the guardrails. When the request asks for 24,685 sf of retail, the 4 ft layout still holds 32 homes (the pond-beside-the-shops arrangement falls a few stalls short once the second way in is added); 39–40 at 6–8 ft.
- **Fixed on the way:** the parking trim could remove a street that homes face; the shops' spare parking ignored the homes' garages.
- **Not done yet:** the first row of homes behind the shops still faces their service drive; builds take a few seconds longer with the deeper-pond options; results can vary by a few homes between runs.

### 5:05 PM CT: Layouts only after the AI has reviewed them; reference files for the AI (ec7fc04, a224d4e)
- **No layouts until the AI has checked them.** With the AI on (Medium, High or Ultra), Build with AI now shows only its progress (the steps, the time so far and Cancel) until the AI's review is back; then the layouts appear ranked by the AI's rating, with its verdict, and its pick goes on the map. More layouts are reviewed before they join the list. If you cancel or the review fails, the engine's layouts are shown with a **Not reviewed by the AI** banner and a **Review Now** button, so you're never left with nothing. Low effort and the planner without the AI work as before.
- **Reference files:** a new **Files** tab on each project. Drag in a survey, floor plans, earlier site plans (PDF, PNG, JPG, DXF, up to 20 MB). The AI reads each one and lists what it found (site size, easements, setbacks, buildings, utilities, flood notes, floor plans with their sizes), each marked sure or unsure with where it came from. **Confirm**, **Edit** or **Dismiss** each; confirmed facts go to the AI in Build with AI, Change with AI, Ask and What Should Go Here. A confirmed floor plan can be added to the building library; a confirmed easement can be drawn on an option as a no-build area.
- **Not checked yet against the live services:** whether the AI model reads PDFs directly (if not, the file says it couldn't be read), and very large files. Floor plans added from files are building types and facts for the AI, not yet the homes engine's own house plans.

### 3:09 PM CT: Retail with homes behind it on shallow sites; home sizes, floor plans and minimum lots (6c5995c)
- **Homes no longer vanish behind retail.** On a shallow site (the 20.6-acre Waller Tomball Rd tract, about 630 ft deep), asking for retail along the road with a neighbourhood behind came back with shops and an empty neighbourhood, because the pond, the shops and the rows of homes didn't all fit one behind the other. The planner now moves detention to strips at the ends of the rows or into open land, makes the shop strip shallower, and only then holds less detention, and says how much is short. A layout that ends up with no homes now says why.
- **Home sizes, floor plans and lot sizes are understood.** "1600–2100 SF homes across 3 floorplans" and "a minimum of 6600 SF per lot" are read, by the AI and without it: homes come from three plans in the library within that size range, and every lot is at least that big. Under the Waller guardrails the stricter 59 × 118 ft (6,962 sf) lots win. They can also be set under Site parameters › Homes. "3 floorplans" is no longer read as 3 stories.
- **On that tract:** retail along FM 2920 with 32 homes behind it under the Waller guardrails (6,962 sf lots, about 6–7 acres of detention at 1.00 acre-foot per acre), or 43–48 without them.
- **Ultra's planning step** no longer fails when the AI runs out of room to answer: it tries once more with more room.
- **Not done yet:** the first row of homes faces the shops' service drive, the two-pond layout leaves a lawn beside the shops, and shop parking on mixed plans isn't trimmed. Filling leftover land, ranking by leasable area, deeper-pond options and AI-reviewed-only results come next.

### 12:30 PM CT: The neighbourhood work joins main: square driveways, drive-thrus, L-shaped buildings, plan sets (c60fadd)
- Everything from main is here alongside the street rules, editable streets, pods, roundabouts, boulevard entries and turning of this branch.
- **Driveways meet the street square everywhere:** added entrances and the planner's main entries leave the street at a right angle and, where the street slants across the layout, curve round to meet the drive square. A **boulevard** does the same when its planted median still fits on the straight past the curve (the median and monument sign go there); where it doesn't, the boulevard comes straight in as before. **Make It a Boulevard** follows the same rule.
- **Turning:** the green dot now turns freely with main's 2° settling and Shift for 15° steps on every piece, curved ponds, lawns, bent drives and entrances included (those still turn about their middle; an entrance's mouth slides along the street). A drawn parking outline's stall direction turns with it whichever way it's turned.
- **Waller guardrails on neighbourhoods:** Waller's narrowest and shallowest lot and its front setback now also apply to homes along curved subdivision streets (the stricter of them and a place's rule sheet), not only to the parallel-street layouts. On a 28-acre test tract under the guardrails the curved-street layout holds 39 homes on lots at least 59 × 118 ft (83 without them). The checks on the panel include both the guardrails' and the rule sheet's.
- Shop and office pods inside a mixed plan keep being laid out the way pods are (main's new parking-field engine is used for whole commercial sites).
- **Curved subdivision streets, steadier:**
  - A loop road round a commons now lays out where the main street meets the loop on a bend: the commons faces the loop's longer side.
  - Cul-de-sacs added to fill leftover land keep the spacing between street junctions.
  - Every kind of street network is tried before the time runs out, so a slower computer still gets a choice of layouts.
  - A layout that fails the checks isn't offered when one that passes is.
- **Not in this merge:** the unfinished Phase 5 (split detention, trails, sidewalks) is left out of main. Its saved work stays in this branch's history (commit 8423b25, `wip/`) to pick up later, on top of main's new ground elevations.

## 2026-10-20

### 11:34 PM CT: Phase 5 paused, saved for later (this commit)
- **Nothing in the app changes.** The build of Phase 5 (split detention, trails, sidewalks) was stopped part-way on request. Its unfinished work is saved in `wip/` so it can be picked up later; the app stays exactly as Phase 4b left it.

### 9:42 PM CT: Street rules for the place, editable streets and street names (3b0be35)
- **Street rules for the place:** Site parameters › **Street rules** has the AI read the subdivision rules and drainage criteria where the site is (the city's, or for a site outside a city it first works out whether it's in a city's ETJ, says what it decided and why, then reads that place's rules). It takes a minute or two and can be cancelled. Each value links to its source (hover for the words quoted); a value the AI couldn't quote is marked **Unsure**, one it couldn't find is filled from Waller County's rules and marked **Waller default**, and either can be **Confirm**ed or typed over. **Use Waller Defaults** fills the sheet without the AI; **Use Typical Values** goes back to the typical rules.
- **The layouts follow the sheet:** street widths, block and cul-de-sac lengths, the cul-de-sac bulb, junction spacing, the narrowest lot and smallest lot area, the front and side building lines and when a second way in is needed shape the subdivision streets and the parallel streets alike (homes pods too; a lot on a curving street is made wider where the curve narrows it, so it still holds the smallest lot area). Driveway spacing and corner distance shape the entrances, the detention rate sizes the pond, and sidewalks show in Numbers. The rules followed show in the layout notes and on the PDF sheet, with any breaks in the checks. It is the AI's reading of the code, never a compliance claim.
- **Shared with the team:** a sheet read for a place is kept for everyone on the team, so the next plan there starts with it (confirmations and edits travel with it). A sheet over a year old offers **Refresh**, which keeps what the team typed in and confirmed and anything the new search couldn't find; a failed search leaves the sheet as it was. When a teammate updates a sheet your plan uses, it offers **Use the Update**. Confirming a value no longer lays the plan out again; only a changed number does.
- **Editing the streets:** select a neighbourhood street and the Selected box says what it is ("Street · Oak Lane · 820 ft · T's at both ends"), with:
  - **Make It a Cul-de-sac** (a street that's the only way to somewhere says so and stays);
  - **Delete This Stretch**, between the two streets meeting it either side of where you clicked (refused when it's the only link to the streets beyond);
  - **Curve It**, a gentle bow (Shift for the other way), made gentler when it would run into another street;
  - **Re-Lay This Block**, the block's local streets another way, with the collectors, the entry and every home outside the block exactly where they were; each press on the same block tries the next way.
  - Dragging a street's point bends it smoothly and keeps the streets meeting it joined. Each edit is one Undo, and the lots re-flow round it. A street left ending more than 150 ft past its last junction with no cul-de-sac shows in the checks. Change With AI understands the same in words ("make this street a cul-de-sac", "bend Oak Lane 60 ft to the left", "re-lay this block", "remove this street").
- **Street names:** turn on **Street names** under Site parameters (with an optional theme such as "Texas rivers") and press **Name the Streets**: collectors and the entry get Parkway or Boulevard, local streets Lane, Way or Drive, cul-de-sacs Court or Circle. Without the AI it uses a list of plain names (and one-word ones like Oakwood past that list). Names are never repeated or too like a road on the map nearby. Rename a street in the Selected box's **Street name** field, or with Change With AI ("rename Oak Lane to Pecan Way", "street names off"). Names run along the streets on the map (zoomed in), on the PDF sheet and in the DXF. A new layout, or another option picked, gets its streets named too while names are on.
- **Also changed:** a cleared Storage or Pond depth field under Stormwater now uses the rule sheet's value or the usual one (0.55 acre-feet per acre, 5 ft) instead of meaning no storage or a 1 ft pond.
- **Numbers on today's sites:** plans without a rule sheet lay out exactly as before (Waller 955 and 911 homes, irregular 570 and 540, pentagon 411, narrow rows 176 first). With Waller County's sheet the pentagon gets about 300 to 370 homes against 411, as expected for stricter rules. Re-laying a block usually ends with fewer homes in it (Waller 463 down to 437 to 445; irregular 430 down to 360 to 384).
- **Not done yet / known rough edges:**
  - **A rural sheet with big lots (an acre or more) gives nonsense layouts:** lots are only made wider, never deeper, so a 1-acre sheet on the 110-acre pentagon gives 12 to 30 lots about 400 ft wide by 115 ft deep where a real subdivision would hold 70 to 90, and nothing warns about it. Don't trust layouts under such a sheet yet.
  - **Curve It can move homes well away from the street:** the corner lot where the curved street meets another shifts, and the lots along the whole block it meets re-flow (up to about 6% of the far homes on the irregular site, 11% on one pentagon collector). Make It a Cul-de-sac and Delete This Stretch can do the same on a few streets. The toast gives the count.
  - Re-Lay This Block takes about 13 s and often holds fewer homes than the block's first layout.
  - Waller County's detention rate hasn't been read from its drainage criteria yet: 0.55 acre-feet per acre stands in, marked to confirm. The ETJ is the AI's judgement from a web search, not a map of ETJ outlines.
  - Lots cut below the sheet's smallest area by something added later (a roundabout, a turnaround) aren't merged or dropped; the checks flag them.

### 5:07 PM CT: Driveways come in square to the street (a150312)
- On a lot whose street slants across the layout (like the 0.93-acre Waller corner lot), the main entrance used to run in at the layout's angle: it met the street crooked, with one curb return tiny and the other long. It now leaves the street at a right angle with even curb returns, then curves round a few car lengths in to meet the drive square.
- An entrance added with **Add Entrance** (or a second way in the planner adds) does the same, so it no longer hits the drive at an angle with a corner of pavement sticking out past it; its end sits inside the drive.
- The stop bar and the double yellow centre line follow the driveway's curve, and **Edit Shape** on a curved entrance bends it along its real centre line.
- Where a street runs square to the layout, or the curve doesn't fit, driveways are drawn straight in as before.

### 3:18 PM CT: Neighbourhoods laid out like real subdivisions (7f8162e)
- **Single-family layouts on 8 acres or more now come with subdivision streets**, offered next to the parallel streets of before. A collector goes in first: a loop road one lot in from the edge, a main street, or a loop road round a central lake and commons. The entry boulevard meets it at a T (on deep sites a little along from the entry, so the boulevard keeps its median), and no homes front the entry street before its first junction.
- **Local streets inside each block of land** follow the loop or curve with the land, meet the collector at T's, get cross streets where a block runs long, and end in cul-de-sacs where a street dead-ends or a pocket of land is left. Where the land between two streets is too thin for homes, one street runs up the middle instead. Streets never fold back on themselves or run into each other.
- **Lots are marched along every street**, square to it, wedge-shaped round cul-de-sacs, each home facing its street with a driveway. The pond sits on land kept at the back with a trail round it (or is the lake in the middle); the rest is open space.
- **Ways in:** more than 30 homes get a second way in, more than 300 homes (or over 60 acres) a third, each meeting a street square-on and clear of other junctions, or opening a cul-de-sac's end out to the street. A layout without the ways its homes need isn't put first, and the notes say so.
- **Two versions of the loop:** streets following the loop (the most homes), and the same streets winding gently with cul-de-sacs in the pockets they leave ("· winding streets", a few percent fewer homes).
- **Ranking:** a subdivision layout goes first only when it holds at least 90% of the homes of today's first layout, has no bad checks, has the ways in it needs and keeps to the street rules.
- **Street rules:** typical values for now (blocks up to 1,400 ft, cul-de-sacs up to 800 ft, junctions 125 ft apart, 300 ft on a collector). Breaks show as warnings in the overview and Numbers, and update as soon as a street is bent, moved, added or deleted. The notes say which rules a layout followed.
- **Re-fits keep the streets:** an unchanged re-fit comes back identical; moving a home, adding a park or changing the home mix (through Change With AI) lays the homes out again along the same streets. Bending a street re-flows only the lots along that stretch. A deleted home leaves its lot empty rather than pulling homes in from elsewhere. A park dropped on a street cuts it back to a cul-de-sac either side. Deleting a street takes its homes and its cul-de-sac with it; streets left with no way in get no homes; deleting the main entry makes another entrance the main one. Re-fit Plan no longer swaps a subdivision for parallel streets.
- **"300 homes" on a big site:** the homes go nearest the entry and only the streets they need are built; the loop road waits for a later phase.
- **Settings › Neighbourhood streets** now has four choices: like a subdivision and gentle curves (the default, best first), like a subdivision only, parallel gently curving (the old default) and straight. Change With AI points "make the streets curvy like a subdivision" or "loops and cul-de-sacs" to New Layouts; a sentence about one street ("add a pool next to the winding street") is still an edit.
- **Also:** a street drawn in pieces is labelled once on the map and sheet. Today's layout search runs faster after a subdivision search (an irregular parallel-streets build went from about 44 s to 30 s).
- **Numbers on today's sites:** every non-homes case, and every homes case on parallel streets, is unchanged. Waller with default settings goes from 936 homes to 955 on a subdivision loop road with 3 ways in (the winding version 911). The irregular site gets 570 and 540 against today's 537; the pentagon 411 against 397. On the narrow site today's rows (176) stay first, because its subdivision layout (177) has one way in where two are wanted. Building a homes layout takes longer, since the street search runs too.
- **Not done yet / known rough edges:**
  - **Easements and no-build areas are ignored by fresh subdivision layouts:** on a test site with a pipeline easement, both subdivision options put a street and 44–49 lots on it (the checks flag them). Today's layouts and re-fits do respect them. Until this is fixed, pick Parallel streets in Settings on a site with an easement.
  - **Re-fit around my changes ignores Settings changes on a subdivision plan:** a new home mix, lot depth or home count set in Settings has no effect, though the message says it re-fitted. Change With AI's home mix ("no 3-story homes") works; otherwise build New Layouts.
  - **A first phase ("300 homes") re-fitted with nothing changed can move homes** (39 of 300 on one test site, about 50 on another); a full-site plan doesn't.
  - **Homes pods of a mixed plan don't get subdivision streets yet:** a pod's layout is held to the whole site's count of ways in, which it can't meet, so pods keep straight streets.
  - **A commons on the pentagon test site can lose its subdivision option on a slow or busy machine** (the search runs out of time), and the notes then wrongly say no loop fits the parcel.
  - The 9-acre square and the 30-acre shallow test sites get no subdivision option (a main street there can't beat today's rows). The 85-acre L-shaped site has no room for a loop round the lake and commons (the notes say so).
  - The narrow site has one way in where two are wanted. Some thin strips of 1–3 acres are left behind lots on Waller's winding option. The irregular site's first option has no cul-de-sacs.
  - Bending a street right up to a junction re-lays the next block too. A first phase can keep a connector street with no homes. Sharp bends are avoided rather than given knuckles. One lot label on the narrow plan is garbled.

### 10:17 AM CT: The site plan work joins main's plan sets, renderings and ground elevations (merged 8af0e2a)
- The small-lot, L-shaped building and drive-thru fixes now sit on top of main's plan sets, project-page renderings and lidar ground elevations; nothing from either side changes.

### 4:39 AM CT: Mixed sites in pods (30c4502)
- **Mixed sites can now be laid out in pods**, the way master-planned communities are drawn. On a mixed site of 40 acres or more (or from 15 acres when you say where a use goes, or when the usual layouts can't fit the program), a collector road goes in first: the main entry boulevard, then a loop road round a central commons and lake, a loop road one block in from the lot lines, or a spine road (with a T on bigger sites, a cul-de-sac on small ones). Side streets get a connector with their own way in. Greenbelts with a trail run between the pods.
- **Each pod gets one use and its own street direction**, so apartments can face the highway while the homes run another way. Every use is sized by a quick trial first, so a pod takes about the land its use needs. Shops get a block about as deep as it is wide. Land a pod doesn't need is open space, never blank, and when the lake is short the larger open spaces become simple rounded ponds clear of the buildings and lots. Streets inside each pod are straight for now.
- **Say where things go and the pods follow it:** "retail at the corner of FM 362 and Bauer Road", "apartments along the highway" (or "along Highway 6", by name), "the commons in the middle", "homes at the back", "townhomes between the retail and the homes", "600 homes around a lake". This works with the AI and without it. Road names are read from the map, and the AI is told them. The notes say which placements were met and which weren't, and why.
- **Ranking:** pods layouts are ranked with the usual zones-from-the-street layouts. A pods layout only goes ahead of one when it scores better and keeps every use within 3% of it (counted up to what you asked for). The best zones-from-the-street layout always stays in the list. A pods layout where a whole use came to nothing isn't offered.
- **Re-lay a pod or swap two:** select a piece in a pod and the Selected box says which pod it's in, with **Re-lay This Pod** and **Swap With…** (one Undo takes it back). Change With AI understands "re-lay the apartments", "redo this pod", "swap the apartments and the retail", "make the apartments pod 4 stories", "make the retail pod 80,000 sf" and "call the north section The Lakes".
- **Re-fits keep the pods:** after you move or add a piece, only the pod it's in is laid out again; a new home mix re-lays the pods of homes. A collector road moved off its junction gets a short drive back; a deleted one leaves each pod joined to the nearest street still reached from a way in. The notes say when a pod ends up holding noticeably less, and count the homes that made way.
- **Settings › Mixed sites › Layout style** (shown where pods can be laid out): pods and bands, best first (the default); pods round a loop road; or bands from the street back.
- **Map and PDF:** a part laid out in several pods is named in sections ("Homes · Section 2"), with a smaller Section label on each extra pod. On the PDF sheet, part names on every mixed plan are now sized to fit inside their part (a little larger than before), and a part in several pods gets a total row before its sections.
- **Also fixed:** "600 homes around a lake" no longer puts the 600 units on the commons. A commons said with a lake and other things keeps its lake. Big plans check overlaps faster, so a 246-acre build with three options takes about 31 s instead of 41 s.
- **Numbers on today's sites:** the first layout is the same as before on every test site. Building now takes longer where pods are tried: the 101-acre test site goes from about 3 s to 15 s, and a 250-acre mixed build with pods takes up to about a minute.
- **Not done yet / known rough edges:**
  - **Pods round a loop road** in Settings runs the pods search, but its layouts are still ranked and checked as in the default, so on some sites no pods layout is offered.
  - On the loop-road layout, a commons placed "at the back" can be split over two or three pods, each with its own lake, pavilion, courts and playground.
  - A townhome pod with a number can hold more than asked (197 of 150 on one test site) at the homes' expense, so a pods plan that keeps every placement can rank last.
  - The pods layout can still go first with about 30% fewer homes than the other layouts when the homes have no number.
  - In a plain comma list ("20,000 sf retail, 200 apartments, homes at the back") a placement can also be read onto the use named before it. Without the AI, "apartment homes around a courtyard" is now read as houses.
  - On one turned 154-acre test site the detention pond takes more land than it needs, one homes pod is left with a single home, and the shops have lawn left over.
  - A pod renamed with Change With AI takes its old name back after a re-fit, re-lay or swap, and the new name doesn't show on the map.
  - Pods plans on the 101- and 160-acre test sites have two ways in where the other layouts have three. Saved pods plans made before this push can re-lay one pod on a re-fit even with nothing moved.
  - The new editor buttons and Settings row have only partly been tried in a browser.

## 2026-10-19

### 11:57 PM CT: Roundabouts and drop-off loops (aa618b3)
- **Add a roundabout where streets meet:** the new **Add Roundabout** tool (Site section, beside Add Entrance) marks the junctions with room with small dashed circles; click one and a roundabout with a planted island goes there, 100 ft across (120 ft where a boulevard or wider street meets it). The streets are cut back to it so the paving reads as one; the homes in its way make way, and only the parking spaces under it give way. Where something can't move (a park, the lake, a building, a street running alongside too close) it tries a smaller one, down to 80 ft, goes to the nearest junction with room, or says what's in the way. It's also in the Add palette.
- **Drop-off loops (circle drives):** pick a clubhouse, school, shop, hotel or office and press **Add Drop-off Loop** (or use **Drop-off** in the Add palette). A one-way loop with an island and arrows goes between the building and its drive, a compact one where the building stands close to its drive (the parking row in front gives way). It tries the other sides when the front is too close, takes a strip of a park when most of the park stays, and otherwise says how far the building would have to move back.
- **Editing:** both move, turn, nudge and resize like any piece. A dragged roundabout settles on the nearest junction and joins those streets (Alt leaves it where you put it); the **Across** and **Lane** boxes change its size. Deleting a roundabout puts the streets back exactly, with the parking and an entrance's median and signs (two roundabouts on one street can go in either order); deleting a loop gives back the parking and park strip it took.
- **Re-fits keep them:** the automatic re-fit and Change With AI keep a roundabout joined to the streets, and keep a loop's drive and building in place in front of it.
- **Checks:** anything on an island, parking on a lane, and a street running across a roundabout's or a loop's lane are problems; a roundabout no street meets, a loop that doesn't reach a drive at both ends, and a loop whose building has moved away are warnings.
- **Change With AI:** "add a roundabout at the main intersection", "add a roundabout at the entry", "make the main intersection a 120 ft roundabout", "add 2 roundabouts", "add a circle drive in front of the clubhouse", "make the drop-off loop 140 ft long" and "remove the roundabout". When the junction asked for has no room it says where the roundabout went instead.
- Drawn on the map, the PDF sheet (with the loop's arrows) and the CAD file; the lanes count as paving.
- **Numbers on today's sites:** layouts without a roundabout or loop are unchanged on all 12 test sites.
- **Not done yet / known rough edges:**
  - **Re-fit Plan** can sometimes pick a new street layout (when it fits more homes) whose streets miss a roundabout; the check then only warns "Roundabout isn't on a street". Undo, or drag it back onto a junction. On one test site an Entrance 2 with a roundabout can also end up cut off from the main entry after Re-fit Plan, with no warning.
  - Turning a compact drop-off loop by even a few degrees usually puts it against its building or its drive; it says what it runs into but doesn't avoid it.
  - On a mixed plan, re-fitting with a loop can hold its building in place and cost a few homes, as moving a building by hand does.
  - On the 246 ac test site the main intersection has no room (a parallel drive runs too close), so a roundabout asked for there goes to the nearest junction with room, about 370 ft away, and says so.
  - Homes that made way for a roundabout come back only after a re-fit.

### 11:34 PM CT: Small commercial lots: L-shaped buildings and real drive-thru lanes (74a5f9f, merged 56d8516)
- On a lot of about an acre to three, a shop, bank or coffee building with a drive-thru now gets one building at the back (an L when asked, its storefronts facing the parking), parking in front and a drive round it that every aisle joins.
- The drive-thru lane runs one way round the building with the pickup window on the driver's side, the order point before the window, at least 8 cars of stacking and a bypass lane. The plan and the PDF mark the window and the order point and show the lane's direction.
- "At least" sizes (like "6,000+ sf") are laid out at that size and grown where the parking allows; when the size doesn't park, the note says parking is the limit and by how many spaces. Examples: 6,000+ sf L with a drive-thru on a 1-acre square gets 7,251 sf; on the 0.93-acre Waller corner lot that prompted this, 5,397 sf parked (6,000 sf would need 26 spaces and the lot holds about 20 with the drive-thru, fire lanes and clear entry).
- Small lots get much more building: retail on 1 acre 3,563 → 6,699 sf, office 5,356 → 10,286 sf, church 1,400 → 3,600 sf.
- Where a pond would cost the building on a small lot, the stormwater goes in underground vaults and the note says how much.
- The checks warn when a drive-thru lane stacks fewer than 8 cars, or when a drive-thru was asked for and isn't drawn. Parts of a mix with no size of their own now share the total floor area.

### 8:43 PM CT: One building with a drive-thru stays one building (bf8716c)
- "6000+ sf L-shaped retail building with a drive thru" is now read as one L-shaped retail building of at least 6,000 sf with its drive-thru, instead of a small shop and a restaurant side by side. (The words reader counted "drive-thru" as a restaurant, and missed the "+".)
- A plus sign or "at least" on a size means at least that much, more where the site allows; "L-shaped" or "U-shaped" sets the building shape.
- Separate uses are only laid out as a mix when you name them, and each part gets its size; the AI can no longer send a mix without sizes.

### 8:36 PM CT: Turn any piece, boulevard entries with monument signs, names for the plan and its parts (8e6ac67)
- **Every piece turns now:** curved ponds, lawns, drawn outlines, custom buildings, bent drives, medians and entrances, with Turn 90°, R (Shift+R the other way), the Turn box and the green dot. They turn about their middle and keep their shape.
- **Turning and moving an entrance:** it turns 15° a press, its mouth sliding along the street and coming in no more than 60° off square, and it stops short rather than run outside the lot. Its median is drawn again along it and its signs follow. A selected entrance shows its bend points and + markers straight away, and dragging it slides its mouth along the street (Alt moves it freely).
- **Real boulevard entries:** neighbourhoods, apartments, townhomes and mixed plans get a two-lane entry with a planted median wherever it costs no more than 2% of the homes, units or floor area (and no parking, detention or checks). Where it would cost more, the narrow entry stays and the notes say what the boulevard would have cost. Where the first drive is too near the street for a median, the entry stays narrow and the notes say how far in the drive is.
- **Monument signs:** the community's sign stands in the median by default, or at the entry's corners when the median can't hold one (the notes say why). Settings can choose both corners, one or none, and a new **Monument sign** piece can be added by hand.
- **Entrance settings and warnings:** Site parameters › Entrance sets the entry style, lane width, median, sign placement, corner clearance, driveway spacing and first cross street. The checks warn when driveways are too close, too near a corner, or meet a drive too soon, and flag a sign on paving or a median sticking out of its drive. **Make It a Boulevard** widens an entrance where there's room for a median.
- **Names:** give the development and each part (neighbourhood, retail center, apartments, business park) a name in Settings, or ask **Suggest Names** for two or three choices (offline it suggests names from the nearby streets and town). The names show over each zone on the map, on the monument sign, the layout cards, the PDF sheet and in Numbers, broken out by part, and they stay through new layouts, Use This Layout and Build with AI.
- **Change With AI:** "turn the pond 20 degrees", "turn the main entry 15 degrees", "make the main entry a boulevard", "add a boulevard entrance off the side street with monument signs on both sides", "call the neighbourhood Beacon Hill Estates", "name the retail center Beacon Hill Market". An entrance asked for off a street that already has one too close goes to the nearest spot that keeps the spacing, or says there's no room. A turned pond moves to the nearest clear spot, or stays put and says why.
- **Numbers on today's sites:** the fixture layouts keep their arrangement and program. Most big sites gain the full boulevard at no cost; one large apartment test site lost about 0.3% of its units (576 to 574). Layouts on small sites take a fraction of a second longer.
- **Not done yet / known rough edges:**
  - "Turn the pond 20 degrees" is refused on most real layouts, because ponds sit between the drives and the lot line with no clear spot nearby; smaller turns work more often. In the editor the pond turns and shows red instead.
  - An entrance near a corner of the lot can, when turned 15–25°, end up coming in from the side lot line that isn't a street, with only a buffer warning.
  - Deleting an entrance in the editor leaves its median and signs behind (Change With AI removes them).
  - After you move or add a monument sign by hand, a re-fit may not put back the main entry's other signs; and deleting one corner sign can bring it back on the other corner after a re-fit.
  - Make It a Boulevard is still offered where there's no room for a median (it explains why when clicked). Street names (the toggle) and editable street networks come in a later phase.

### 8:28 PM CT: Plan sets, renderings from the project page and ground elevations go to main (bb5ed4f)
- Everything from this branch joins the main app: **Sites / Renderings / Plans** tabs, full schematic plan sets on the title block, renderings made in the background from the project page, buildings drawn in their real shape, and ground elevations from USGS lidar.
- Merged with the latest main (parking fields, the AI's commercial brief, Waller guardrails, New Option and deleting): the Renderings tab keeps **Delete all** without **Open plan** / **Render more**, Waller plans also get the ground, and the new parking-field layouts put the pond on the low side too.

### 6:41 PM CT: Ground elevations: creeks aren't counted as the fall (8624d15)
- Checked against real USGS lidar on the test deployment: a 7.7 acre site near Waller came back as 1 m lidar in about 2 seconds, and a 200 acre tract near Katy too.
- That tract read 76 to 100 ft but slopes only 0.1% overall: the low point is a channel. The ground row and the plan set now give **how far the land as a whole falls** across the site, show where most of the ground sits, and **call out a creek, ditch or pond** that dips well below the rest, with a reminder to check for a floodway or drainage easement. The pond placement uses the same range, so a creek bed doesn't skew it.

### 6:25 PM CT: Ground elevations from USGS lidar (6a714fd)
- **Each project's Jurisdiction & site box now shows the ground elevation:** the lowest and highest ground (feet above sea level), how far and which way it falls ("falls about 5.5 ft to the south-east"), and, where FEMA gives a base flood elevation, whether any of the ground is below it (marked in amber). Projects checked before today look again once by themselves.
- **Build puts the detention pond on the low side** of the site when the land falls more than a foot and a half, and the AI planner is told which way the land falls.
- **Plan sets use the real ground:** the existing conditions sheet (C-001) draws contours with the low and high points instead of "Topography not surveyed", and the grading sheet (C-201) grades from real elevations: existing contours under the proposed ones, the pond's bank at the real ground, finished floors a foot over the ground, a rough cut and fill estimate, and a warning when the pond sits on high ground.
- The elevations are USGS lidar of the bare ground (1 m detail where flown, most of Texas), asked for once per site and kept on your device. They're good for planning, not a survey. If USGS is down, a rougher model is used and marked approximate (it isn't drawn as contours).

### 6:23 PM CT: The AI decides what's built on commercial sites (fdf013e, 5b6e987, a38845c, merged 7eb3363; and the scenario wording)
- On **Medium, High and Ultra**, for shops, restaurants, offices, medical offices, hotels and churches, the AI now says exactly what to build: how many buildings and pad sites, their sizes and floors, where they sit and which way they face, how the parking is arranged, which side the pond goes on and whether there's a service drive, each with a one-line reason.
- The planner draws it as **AI's plan** beside its own layouts and ranks it the same way, by the leasable floor area that parks and passes the checks; it's recommended only when it does best. Its card lists the AI's reasons and anything the planner had to change.
- On **High and Ultra**, when the planner can't do the AI's plan as written, the AI revises it once and the new version is compared too. When the AI's plan can't be laid out at all, it isn't shown as a layout; a line under Build says what the AI asked for and why it didn't fit.
- **Ask** can now explain the AI's choices ("why did you put the pond there?").
- "With 2 pad sites" or "an outparcel" now places the pads at every effort level, and offices and medical offices can go to two floors unless you asked for one story.
- On Waller plans, when all three scenarios come out the same, Numbers says so (the unresolved items could still change it) instead of calling one number a range.

### 5:54 PM CT: Floor plans, elevations and sections follow the building's shape (14954c0)
- **The architectural sheets now draw L-shaped, U-shaped and stepped buildings as they are on the site plan:** the floor plan's outside wall follows every corner, with a dimension for each jog; the roof plan follows the outline; each elevation shows the set-back walls as their own panels behind the nearer ones; and the sections cut across the actual wing (50 ft across an L's wing, not the 100 ft box around it). Areas on the plans, code analysis and life safety sheets are the building's real area.
- **Much smaller sheets:** brick, siding, shingles, concrete and insulation are drawn with light line work instead of fill patterns. The biggest architectural sheet went from 11.9 MB to under 0.8 MB. That size is what made one sheet fail in the first full set; it shouldn't happen now.

### 5:38 PM CT: Engineering sheets follow the building's shape; much smaller sheets (efc4d39)
- **Structural, mechanical, plumbing, electrical, fire and telecom sheets now draw L-shaped, U-shaped and stepped buildings by their real outline:** the slab edge and beams run along every wall, ducts and pipes stay inside the building, sprinkler heads and rooftop units never land in the open corner, and meters, the fire department connection and other outside equipment sit on a real outside wall. Exit signs and pull stations face the right way at an L's inside corner.
- **The biggest engineering sheets are 4 to 9 times smaller** (the largest is now about 0.6 MB, down from as much as 3.4 MB), so a big set downloads and opens much faster and a sheet is far less likely to fail for being too big. Hatched areas on the foundation and detail sheets are now light tints.

### 5:35 PM CT: Plan sets follow the building's shape; smaller set files (2e6d942, 44abfcf)
- **L-shaped, U-shaped and stepped buildings are now designed as that shape**, not as the rectangle around them. The building type's name says so ("L-shape, 150' × 100' overall"), the rooms fill the real outline, the open corner or courtyard stays open, and the area is the outline's. Claude is told the corners and where the open ground is, and the checks catch a room in the wrong place. The drawings that follow the outline (walls, roof, elevations, foundation, MEP and sprinklers) arrive in the next push.
- **Smaller PDFs:** the title block is now stored once for the whole set instead of on every sheet, about 160 KB less per sheet. Sets already under way finish the old way.
- In homes made by the standard rule-based design, every upper floor now has a bathroom.

### 5:10 PM CT: Drag faces, shape parking, face the building, precise turns (ae15452, 7780aa0, merged 42caa3e)
- A selected building shows a bar on each side, a custom L included. Drag it and that face moves straight out or in, the sides beside it keep their direction, and a label shows the face's length and how far it moved.
- Parking takes **Edit Shape**: add and drag points or faces, and the stalls refill the outline with whole stalls in rows on an aisle, none cut by the edge. Every count and drawing follows: Numbers, the pro forma, the PDF, the DXF and the Waller parking checks.
- **Stall Direction** turns the stalls 90° inside the same outline. **Face the Building** points them at the nearest building face, the L's inner face included, with the aisle along it and a walk's width off it.
- Turning is free to the degree and settles square to the street, the site edges and nearby buildings within 2°, with a guide line. **Shift** turns in 15° steps (45°, 90° and so on); it used to do the opposite. The Turn field takes any degrees, and custom shapes can be turned.
- Shift while dragging a face or point gives whole feet and square corners. Handles no longer steal clicks meant for the piece next door, and on a phone a finger resting on a handle no longer opens the menu.

### 5:03 PM CT: Plan set drawings refined, with tests (36f764e)
- Sheets: the architectural sheets are refined further.
- Tests now check every site/civil, architectural and engineering sheet on ten realistic plans: shops, a restaurant, townhomes, 71 homes, a warehouse, a 3-story office, medical, a c-store, duplexes and a church.

### 4:58 PM CT: Full plan sets, part 2: the drawings, first draft (320cca2)
- **The placeholder sheets are now real drawings:**
  - **Site & civil and landscape:** existing conditions with the boundary's bearings and lengths, dimension and paving, typical lot plans, grading and drainage, detention, utilities, erosion control, civil details, landscape plan and details.
  - **Each building type:** floor and roof plans, elevations, sections, door / window / finish schedules, foundation and framing plans, HVAC, plumbing, power and lighting, and for commercial buildings sprinkler, fire alarm and life safety plans.
  - **Sheets for the whole set:** wall sections and details, code analysis, the engineering notes and schedules, riser and one-line diagrams, site lighting, fire access and hydrants, and telecom when ticked.
- This is a first draft: the drawings are still being refined, and a final version follows.

### 4:56 PM CT: Renderings made in the background (a25d280)
- **Render on the Renderings tab no longer takes you to the map.** The option's 3D view is set up on a hidden map behind the scenes and the picture is taken from that, so you stay on the project page or carry on elsewhere in the app.
- The form shows **Rendering 1 of 4** and what's happening, with **Cancel**. The new pictures appear below when they're ready, and a message says so wherever you are in the app.
- The **Open plan** and **Render more** links beside each option's renderings are gone.

### 4:56 PM CT: Parking fields for shops, offices and the like (aae331f, 5f3bd7d, d397bc4, 4b4fae1, 2eaf3ed, 3dcbf5f, 09a8f8e, merged e97cc60)
- Layouts for retail, restaurants, offices, medical offices, hotels and churches now come out the way a civil engineer would sketch them: whole, straight rows on both sides of every aisle; a drive round both ends of every aisle, so there are no dead ends; a fire lane that puts every wall within reach of a fire truck; a clear entry drive with no stalls backing into it; a service drive behind shops and restaurants with the trash enclosures on it; planted islands at row ends and along long rows; and one pond on the land left over.
- "As much as fits" grows the building until the parking, setbacks, fire lanes, detention or zoning stop it, and the layout says which one. Offices and medical offices try a second floor before building less. Examples on the test lots: retail at most on 5 acres 35,434 → 44,621 sf; on the FM 362 parcel 59,250 → 70,942 sf; a 40,000 sf office on a clipped corner lot now fits whole (27,233 before).
- A lot too small or narrow for a drive round both ends of the aisles gets aisles that stop at one end with room to turn, and the layout says so.
- Dragging a building re-fits the parking to face it where it now is.
- Layouts come back faster: about 1–4 seconds on 5 acres.
- A few small or oddly shaped lots now get less floor area than before, because the old layouts there had dead ends, cars in the entry drive or walls out of fire-truck reach (for example a restaurant on a 2-acre square: 6,000 → 4,822 sf with a service drive; 5,357 sf without it as the second choice).

### 4:39 PM CT: Tidier Make renderings form (ec75352)
- The Option, View, Materials and Light dropdowns on the Renderings tab no longer run into each other. They sit in an even row of four on a computer, two by two on a tablet and one under another on a phone, with space between the form and what's below it. The Plans tab's form gets the same fix.

### 4:31 PM CT: Full plan sets, part 1: the engine (7d59f39)
- **Plans can now make a whole set** (up to about a hundred sheets) from an option: general and code sheets, site and civil, landscape, and for each building type the architecture, structural, mechanical, plumbing, electrical and fire sheets, plus telecom when ticked and the renderings.
- **Building types:** the option's buildings are grouped into types A, B, C… (each distinct building, or one townhome / duplex unit), up to eight. Claude designs each one's floor plans. Every design is checked for fit, overlaps, access, bedroom sizes and windows, and exits; if it fails, Claude is told what's wrong and tries again, up to twice, before a standard rule-based design is used.
- **Progress you can see:** a panel shows a progress bar, sheets drawn, time so far and time left, what's happening now, and every step. The browser tab's title shows the count. **Pause** and **Resume** carry on where it stopped, even after closing the app.
- **G-002 General notes:** general notes, codes, every symbol and line type used in the set, and abbreviations.
- In this push the drawings for the other sheets are still placeholders: they follow in the next push.

### 4:30 PM CT: Parks stay off the streets, entrances go round them, re-fits keep the streets (7bce16b)
- **Parks and open space are real places now.** "Add a park beside the community center" puts the park on a clear side of it, a few feet off the streets and clear of buildings, other parks and the lot line. If the usual size doesn't fit, a smaller one goes there and the message says so. If there's no room at all, nothing is added and the message says that too. Homes under a park make way, and the lots of the homes beside it are cut back to its edge. Dragging a park works the same way.
- **The checks flag a park, named lawn or open space under a drive or a building** in red. Plain lawn under paving, the entry median and a pavilion standing in a park aren't flagged. Lawn now draws under the drives, and the entry median shows as a green strip.
- **Entrances never run through a park.** Add Entrance names the park in the way. Change With AI moves the driveway along the street past it and says how far. "Add an entrance by Pad B" comes in from the nearest street, not a side lot line, and two asked for by the same piece no longer stack.
- **Re-fits keep the streets.** Re-fitting a plan with nothing changed now keeps every street (89 of 89 on the 246 ac test site, where it used to keep 84). Added entrances no longer shuffle the streets, and no parking is laid across them. Change With AI never quietly lays the site out again with new streets: if keeping them leaves a problem, it says so and offers **New Layouts**. Re-fits are also faster (about 1.8 s instead of 3.5 s on the 246 ac site).
- **Food truck parks keep their trucks** when the Lawn is renamed or moved and pinned. A pool or playground asked for beside a community center can stand on its lawn instead of taking homes.
- Fresh layouts are unchanged on all 12 test sites.
- **Not done yet:**
  - On an L-shaped mixed site, "add an entrance at the open space" can still put the entrance on the front street about 1,000 ft away, and the message doesn't say how far. A nearer lot line that would work isn't tried yet.
  - On an L-shaped site, a park dropped on a street and then re-fitted can still lose one short drive next to it.
  - Pickleball courts beside a community center still take 2 or 3 homes when there's no clear lawn within 130 ft.
  - The new park drag and turn behaviour in the editor hasn't been tried in a live browser yet.

### 4:12 PM CT: Make renderings from the project page (31e0120)
- **Renderings tab:** a new **Make renderings** form at the top. Pick the option, the view (corner, street, entry, back, a close-up of the building nearest the street, or all four), the materials and the light, then press **Render**.
- The picture is still taken from the option's 3D view on the map, so the option opens there and the progress shows in its panel. When the pictures are ready you're brought back to the Renderings tab.

### 3:26 PM CT: Plan sets, phase 1, and Options renamed Sites (de1d75f)
- **New Plans tab on each project:** it makes a schematic design drawing set from one option, every sheet on the Finishes Solutions title block, 24 × 36.
- **Pick your sections first:** tick the sections you want before making the set, and each box shows how many sheets it adds.
  - General is always in.
  - Site & civil and Renderings are ready now.
  - Architecture, structural, MEP, fire and landscape are listed and greyed out until their phases.
  - Telecom starts unticked.
- **The sheets so far:**
  - **G-001 Cover:** the project's name, a key plan, project data, program and parking, the sheet index, the project team and the vicinity map. Claude writes the project description, general notes, codes and next steps.
  - **C-101 Overall site plan:** drawn to scale with north arrow, scale bar, legend, tables and notes.
  - **A-901 to A-904:** one AI rendering a sheet.
- **Your title block:** your AutoCAD border with the plot stamp and the firm number taken off. The app fills in the project, client, phase, date, scale, drawn by, project number (blank is fine), sheet title and number, and the issue / revision table.
  - Every sheet says "Preliminary — not for construction, bidding or permit", and that the drawings are schematic, made with AI assistance and not sealed.
- **Issues:** each new set of an option is the next issue (0, 1, 2…), and the revision table lists them all. **Sets made** lists every set with **Download PDF** and **Delete**, and says "plan changed since" when the option has changed. The PDF stays on the device that made it, like renderings.
- **Claude settings:** Settings › AI model › **Plan sets** picks Claude's model (default Claude Opus 5.5) and effort (default Medium), and shows this month's spend against the $100 plan set budget.
  - Without the Claude key, or with the budget spent, sets are still made and the cover says the notes were left out.
  - The cover notes cost cents per set.
- **Options is now Sites** on the project page. Old links still open it.

### 2:56 PM CT: Plan sets plan: your choices recorded (78d55a0)
- **Planning only.** More decisions are now in `PLANSET-PLAN.md`:
  - The project page's Options tab will be renamed **Sites**. Old links still work.
  - Before making a set, you tick the sections you want: site and civil, landscape, architecture, structural, mechanical, plumbing, electrical, fire, renderings and telecom. Each shows how many sheets it adds, and the cost estimate updates as you tick. Telecom starts unticked.
  - The title block will be used without the AutoCAD plot stamp and without the firm number, for now.
  - Claude Opus 5.5 is the default model.

### 2:46 PM CT: Plan sets plan: medium effort, $100 a month (f857098)
- **Planning only.** Two decisions are now in `PLANSET-PLAN.md`: plan sets will use Claude at medium effort by default (changeable in Settings), with a budget of $100 a month. When the month's budget is spent, new sets wait for the next month. That's roughly 5 to 12 large sets a month, and more for small sites or sets that reuse saved building designs.

### 2:35 PM CT: Plan for full plan sets from a site plan (431cdcb)
- **Planning only, nothing in the app changes.** `PLANSET-PLAN.md` sets out how an option's site plan would become a schematic design set of drawings, all on the Finishes Solutions title block: cover, civil and site, landscape, architecture, structure, mechanical, plumbing, electrical, fire, and telecom if wanted. Project pages would read Sites · Renderings · Plans.
- It defines what a "full set" contains: which sheets, their numbers, and when each one is included. It also covers how Claude would design each building type for a person to approve and save to the team library, how code would draw and cross-check every sheet from the plan, and the settings for the Claude API key and model, with costs and a monthly cap.

### 12:48 PM CT: Waller guardrails (74e9484, 7679147, 3d49721, 0b4e808, 23a7ab5, 86ead22, merged 56135b7; 1efc95a)
- Sites inside the City of Waller, or within half a mile of its limits (its ETJ, unverified), are now planned under the Finishes Solutions Waller site-planning standard. Every other site is planned exactly as before. Site parameters has a **Waller guardrails: Auto / On / Off** switch.
- The **Finishes base case** is drawn on the map: 5% over each minimum, 3–5% more parking than required, Waller lot sizes and setbacks for homes, 2 spaces a unit for apartments, a 26 ft fire lane, and detention of at least 1.00 acre-foot per developed acre with the pond sized from that volume (depth, side slopes, freeboard and a maintenance bench).
- The **maximum code envelope** and a **conservative case** sit beside it in Numbers, and either can be laid out in one click. The yield is shown as a range while survey, title, flood, outfall, utilities and access are unresolved.
- Numbers has a **land-use table** from gross acres down to net usable land, an **unresolved-risk list** and the standard's 18-item checklist; every number carries a tag: Verified, Owner guardrail, Engineering assumption or Unverified.
- The concept label is on the plan, the PDF (with a new land-use sheet, SP-1A) and the exports; **Land Use (CSV)** is new under Export. Layouts read **Passes the planning checks**.
- The AI is given the standard's instructions and values, and its answers never call a plan permit-ready, approved, engineered or code-compliant.
- Site parameters adds the outfall, the owner's margin, a right-of-way reserve, and the pond's storage depth and side slopes.
- New Option and Clear keep a Waller site's jurisdiction and its guardrail settings.

### 12:40 PM CT: New Option (blank site, copy, clear and start over), and deleting options, renderings and test projects (ab0f8f3, merged a2340bc)
- **+ New Option** (it was + Copy Option) opens a short menu. **Blank site** makes a new option on the same lot: its street sides, setbacks, parcels, zoning and easements, but nothing laid out. It opens with the Build box ready. **Copy of (option)** still copies it, layouts included (its renderings now stay with the original).
- **Clear (option) and start over** empties the option you're in and keeps the site. No question first: **Cleared Option A · Undo** brings it all back, layouts included. Its renderings stay.
- **Delete (option)**, in the same menu, at the foot of the panel or on the project page, deletes straight away with **Undo** for a few seconds, and says so when it goes for the team too. The next option opens; after the last one, the project page, where **New Option** still starts from the same site.
- The project page's **New Option** now keeps the street sides and easements.
- The Renderings tab has **Delete all** for each option and **Delete All Renderings** for the project; the pictures are removed from this device too.
- **Settings › Testing · danger zone › Delete all projects…** says what will go and whether it's for the whole team, and needs DELETE typed to confirm. "Only this device's copies" leaves the team's projects alone.

### 11:56 AM CT: A pro forma you can trust more (63c9ddf, merged b3eecf4)
- Every pro forma default re-checked for 2026 Houston, Katy and Waller, each with its basis, and labelled "Market assumption, not verified".
- Rent and the yield now use leasable area: shops 97% of the building, offices and medical their rentable area with a load factor, apartments the units' net sf, storage its rentable units, hotels their rooms. Numbers and the Pro forma show gross and leasable sf side by side, and the shares can be changed.
- Fixed yields that read too low: tenants on NNN leases now pay back property taxes, site work follows what's built instead of the whole lot (parking paving was counted twice), no developer fee on land, and an AI-crafted type's courts and pavilion are priced and earn rent.
- Now counted: detention ponds, parking garages, leasing commissions and hotel furniture. Hotels run on room rate and occupancy; storage rents climate-controlled, drive-up and RV spaces separately.
- A calm note when a number is outside the usual range here, and flags for a yield on cost under 5% or over 12%, an unusual cap rate, a negative spread or thin debt coverage.

### 11:37 AM CT: Neighbourhood plan: how local rules are found (b209ff3)
- **Planning only, nothing in the app changes.** `NEIGHBORHOOD-PLAN.md` now records how local rules are found:
  - the jurisdiction comes from the city limits and county data the app already has
  - Waller County's rules are the default when a place's code can't be found online
  - a person confirms only the values the AI marked unsure

### 11:29 AM CT: Neighbourhood plan: first decisions (fe3d1c1)
- **Planning only, nothing in the app changes.** `NEIGHBORHOOD-PLAN.md` now records:
  - street rules that follow the site's city, ETJ or county, read from that place's codes by the AI, cited and confirmed by a person
  - sidewalks on both sides by default
  - an optional street-names toggle, with the AI naming streets from a theme you give it (aviation, Pokémon…)
  - monument signs in the median by default, with the sides as options
  - a hand-marked low side for detention until elevation data is added
- The phases stay open while the plan is worked out.

### 11:23 AM CT: Plan for real neighbourhoods, mixed sites, entrances and editable streets (f9ee898)
- **Planning only, nothing in the app changes.** `NEIGHBORHOOD-PLAN.md` sets out how the planner gets to subdivisions like the Houston-area references sent:
  - curved streets off a collector loop or spine
  - roundabouts, cul-de-sacs and circle drives
  - mixed sites laid out as pods instead of stacked bands
  - boulevard entrances with monument sign space
  - turning and bending any piece by hand
  - split detention with trails and sidewalks
  - names for the community and its parts
- It starts with two bugs from today: a park added beside the community center that crossed a road and scrambled the streets, and an entrance that landed under the open space.

### 11:07 AM CT: Change With AI makes whole-site changes, including the homes' stories (dc01624)
- **"No 3-story homes" now works.** On a big neighbourhood the AI couldn't see the individual homes and could only change pieces one at a time, so a request like "Residential homes should only be 1 story and two-story homes, no 3 story homes" changed nothing, yet the reply still described the change. The AI now sees how many homes there are of each height and changes the neighbourhood's home mix instead.
- **The lots are laid out again along the same streets.** Each home's lot is sized for it (3-story on 40 ft lots, 2-story on 50 ft, 1-story on 60 ft), so dropping 3-story homes means wider lots and a few fewer homes. The result says how many there were and how many there are now. The shops, lake, commons and anything you placed by hand stay as they are, the new mix shows in Settings, and **Undo This Change** puts it all back.
- **Every piece of a kind at once:** "make all the apartments 3 stories", "nothing over 3 stories", "remove every pool".
- **No more made-up results:** when the AI can't find anything on the plan to change, it says so instead of describing a change it didn't make.
- Without the AI, "no 3-story homes" and similar wording is read directly.

### 9:49 AM CT: Any building type the AI can describe, and a shared team building library (7da2412, c42fa30, merged b246482)
- **No more plain boxes for a daycare, a pickleball club or an RV park.** When a request names a kind of place the planner has no setting for, the AI now writes a recipe for it: its buildings, its outdoor pieces (courts, a playground, a pool, a lawn, a plaza, a patio, a pavilion), its parking rule and the figures to show. The planner lays it out with its usual machinery, so drives, parking, entrances, detention, trash and the checks work as for any other use.
- **Four ways to lay one out:** a building facing its parking (a car wash), a few freestanding buildings (a school's classrooms and gym), a building with its outdoor pieces together on their own ground behind or beside it (a daycare and its playground, a club and its courts), or rows of sites on drive aisles like RV storage (an RV park, with sites both sides of each aisle, an office at the street and a fence).
- **Marked AI-sized:** the layout card, the Selected box and Numbers say which sizes the AI chose, so nobody takes them for a product sheet. Sizes far out of range are brought back in, and the plan says so.
- **The parking rule on the plan:** Numbers shows the rule worked out ("0.25 a child × 120 children = 30 spaces", "4 a court × 8 courts + 3 per 1,000 sf = 50 spaces") with the AI's other assumptions; each layout's notes say it too. Courts and RV sites carry their own parking, so a smaller clubhouse doesn't shrink the courts' parking.
- **When it doesn't all fit:** fewer courts or sites, and the layout says how many ("Room for 4 of the 8 pickleball courts asked for").
- **If the AI answers nonsense,** the plan is laid out as a plain building at 3 spaces per 1,000 sf, with a note saying so; if it doesn't answer, your words are read directly as before.
- **Save to Library:** any building on a plan, or a whole AI-crafted type with its recipe, can be saved to a shared **Team** group in the building library. The panel lists each with its size, who saved it and when, and Add, Build One, Rename and Delete (with Undo). Until the team library is set up on the site, saved types stay on the device and the panel says so.
- **"Another one like our pickleball club":** the team's saved types and their recipes go to the AI with every request, so it can reuse one.
- **Outdoor pieces next to their building (polish):** a playground, courts, a pavilion or a lawn now sit about 10 ft from the building with a 6 ft walk from it to them (and along the courts so each is reached); the courts stay by the clubhouse. Layouts without a dead-end parking aisle and with the pieces next to the building come first; land left over is plain open space rather than a later-phase pad.
- **Buildings at their own sizes (polish):** a school's two-storey classroom building and one-storey gym are each drawn at their share of the floor area where there's room; where there isn't, they're drawn alike and the layout says to resize them by hand. When a building had to be drawn smaller, the parking rule counts what it holds ("about 105 children (the building as drawn)").
- **Shared with the team:** the team library is stored in the new `site_building_types` table (added to the database on Oct 19, additive only).

## 2026-10-18

### 11:26 PM CT: Plan for a 3D massing scene behind the renderings (b105481)
- **Planning only, nothing in the app changes.** `MASSING-PLAN.md` sets out how a lit 3D model of each option would be built from the plan (buildings with roofs, window bands and canopies, paving, pond, trees, sun and shadows) on the real map, so renderings start from a much better picture and can send the AI a depth image that keeps every building in place. Same Render flow for users, plus a 3D toggle on the plan.

### 11:15 PM CT: Mixed plans keep their space on a re-fit, a turnaround at the L, the truck count asked for comes first (369bbbf, merged a7bd977; c22b1d9)
- **Mixed plans re-fit without losing space:** moving a building in a mixed plan (shops and apartments, say) and letting the site re-fit used to lay out far less than you had, sometimes nearly nothing. Each part of the mix now keeps its floor area and units, on the automatic re-fit and on Re-fit Plan alike.
- **Changing a building's use by hand:** turn an apartment building into offices and Re-fit Plan now lays out the apartments asked for round it, instead of counting the offices as apartments.
- **L-shaped shops on a corner:** the parking lane the shops' side wing cuts short now ends with room to turn round, instead of a dead end.
- **Food truck parks:** when you ask for a number of trucks, a layout with that many comes first. A layout keeping detention in a pond is still among the choices.

### 11:00 PM CT: Gas station re-fit, corner shapes in mixed plans, settings that fit the plan (7a22bdf, merged eec65d5)
- **Move the canopy and the station follows:** drag the fuel canopy along the street, turn it, or move the c-store, and a moment later the drive lanes go back round the canopy, the store sits behind it, and the parking, tank pad and driveways are laid out again. Re-fit Plan does the same. Before, a gas station couldn't be re-fitted at all.
- **When it can't fit, it says why:** drop the canopy where its lanes won't go and your move stays as it is, with a message like "the canopy needs a drive lane all round it". Undo puts it back.
- **Mixed plans on a corner:** shops at the front of a mixed plan now also get an L of shops wrapping their parking, and a drive-thru pad at the corner, as layouts to compare. Inside lots are unchanged.
- **Site parameters only shows what applies:** apartment depth, longest building and spacing only with apartments; neighbourhood streets only with single-family homes; the building shape only for shops, offices and apartments; trash settings only for what the plan has.
- Re-fitting the L-shaped strip keeps its L.

### 10:46 PM CT: Food truck parks on narrow, deep lots (97844d2, merged 0ad994a)
- On a narrow, deep lot the trucks now run down one long side, with the seating, pavilion, restrooms and bar beside them. A 180 ft wide lot about 900 ft deep holds 12 to 13 trucks, where it used to get 2. A 150 ft wide lot holds 11 to 12, where it used to get no layout.
- A choice with less than half the trucks of the first one is no longer offered, except the one with the bar on a small lot.

### 10:26 PM CT: Food truck parks: restrooms always, small lots, distinct choices (84a404a, 70909be, merged 409f630)
- On a small lot (about an acre) the trucks come first and every layout is fully parked. The bar shrinks or is left out, then the pavilion gets smaller, and the layout says so. About an acre now holds 4 trucks, or 2 trucks with a small bar, where it used to get no layout.
- Every food truck layout has restrooms. When they don't fit, the bar gives up its room, then a truck at a time.
- The choices offered are different from each other. Two layouts with the same trucks, about the same seats, and the same bar and pond count as one, so you may see two choices instead of three.
- Layouts that keep detention in a pond come first when they hold nearly as many trucks as one without a pond.

### 9:22 PM CT: Food truck parks (35bb30a, merged f729165)
- Ask for a food truck park ("a food truck park with 12 trucks, a covered pavilion, restrooms and a small bar") and the layout draws one, instead of a few "other" boxes: truck stalls (15 × 35 ft, each with a power and water pedestal) around a gathering area, a covered pavilion with picnic seating on a lawn, restrooms, a bar with a beer garden patio, a playground, and a dumpster and grease enclosure.
- The trucks stand along a service lane behind their stalls, so they pull in and out without crossing the seating; their serving windows face the seating. Customers park on the street side and walk in, with no parking at the entrance's mouth.
- Two arrangements: trucks round the commons (back and both sides) or along the back. On a corner lot the trucks get their own service entry from the side street.
- Settings › Program: number of trucks (blank = as many as fit), parking per truck, pavilion, bar and restroom sizes, bar and playground on or off.
- Numbers show the trucks, about how many seats, and the pavilion, restroom and bar sizes; the layout card leads with trucks and seats. Selecting a stall shows its size and pedestal; a pavilion, bar or restrooms building has a Part field.
- Pro forma: stall rent per truck (about $1,200 a month), the bar run by the owner or leased triple net, the park's own costs, and each stall's pad and hookups. All editable.
- The building library has a Food trucks group (pavilions, restrooms, bars). The map, plan key, PDF sheet and renderings know food trucks.

### 9:22 PM CT: Gas stations, c-stores and corner sites (1f050c0, merged ad81d35)
- **Ask for a gas station and get one:** "gas station with 8 pumps and a 4,500 sf c-store on the corner" now lays out a fuel canopy along the busier street with its pumps in one or two rows and 24 to 30 ft lanes all round it, the store behind it facing the pumps with parking along its front, and three air / vacuum stalls. Before, it came out as a small retail strip.
- **Fuel tanks:** a keep-clear pad for the underground tanks, placed where a tanker can pull straight alongside on a wide drive from an entrance. Parking over the tanks is flagged as a problem.
- **Car wash:** ask for one and a tunnel goes beside the store, with its stacking lane wrapping round the back so the line doesn't block the pumps.
- **Corner driveways:** one on each street, each at least 100 ft from the corner where the frontage allows (the layout says so when it can't). Inside lots get one or two on the front.
- **Odd lots:** wedge, clipped-corner and many-sided parcels (like 19730 FM 362) are laid out too.
- **Settings › Program** for a gas station: pumps (4, 6, 8 or 12), store size, parking, which street the canopy runs along, car wash and air / vacuum switches. **Numbers** has a Fuel tile (fueling positions, pumps, canopy, store). Pick the canopy to see and change its pumps and rows.
- **Pro forma:** ground-leased to a fuel retailer (about $25,000 a pump a year) or built and run by the owner (fuel, inside sales and car wash margins, store costs, canopy, pumps and tanks), all editable. Truck stops are drawn as a car station for now, and the layout says so.
- **Shops on a corner lot:** the planner also tries an L-shaped strip round the parking and a strip with a drive-thru pad at the corner, and keeps whichever scores best. Inside lots are unchanged.
- **Map, PDF sheet and DXF** draw the canopy, pumps and tank pad; the legend and building library have them too.
- A future pad site's name no longer sits on top of the detention pond beside it.

### 9:22 PM CT: Faster to open; clearer site plans on unusual sites (79f1aae, 4fdafc7, 42b2fa8, merged d02ada9)
- Opening a site plan right after the page loads no longer gets the map carried off to the whole region by the first-visit fly-in.
- Big plans redraw faster: opening a saved 86-acre neighbourhood plan takes about 40% less script time, because the plan's checks are no longer worked out two or three times over for each redraw.
- The app opens faster: the map data starts downloading alongside the app's code instead of after it, the map and chart libraries no longer hold up the rest of the page, and the Excel library (about 880 KB) loads a few seconds after the app is up instead of before it. On a simulated 40 Mbps connection the app was ready in about 1.8 s instead of 2.5 s.
- Build Layouts and re-fits are faster: about 20% less time on 3–10 acre sites and about half on big neighbourhoods (20 acres: 8.5 s → 4.2 s; 86 acres: 38 s → 22 s), because the site's open land is now worked out once instead of on every try. The layouts themselves are exactly the same.
- When nothing fits a request (say 100,000 sf of self storage on a third of an acre), the Layouts section now says so and stays that way — "Nothing fits … on this 0.30-acre site", with what to try and an Edit request button — instead of an empty list after a toast that was gone in seconds.
- Redraw Site refuses an outline that crosses itself (corners clicked out of order) or has almost no area (corners in a line), and says why; the drawing stays open so Backspace can fix it. Before, a crossed outline was kept as a 0.00-acre site and laid out a 1,000 sf box.
- Self-storage unit mixes: the line under each table now warns when the shares don't add up to 100% (they're scaled) and, with every share at 0%, says what each unit is counted at, instead of "Average 0 sf · 0%".
- The toast after changing a setting names the setting, not its hint, and shows the value it's read as: "RV / boat spaces 0" instead of "RV / boat spaces 12 × 40 ft -3"; a blank size reads "auto".
- If the AI answers without a program, Build Layouts reads your words directly instead of failing with a technical error.

### 9:22 PM CT: Gas stations and food truck parks on about an acre (d9df189)
- **Gas stations on narrow lots:** a lot about 210 ft wide used to lay out nothing because the fuel tank pad had no room beside the canopy. The tanks now go under an end drive lane, where cars can pass over them but never park.
- **Fewer pumps when parking runs short:** if the pumps you asked for can't all be parked, a layout with fewer pumps and full parking is offered as well.
- **Small food truck parks:** trucks lined along the back of a small lot get a shallower seating area, instead of no layout at all.

### 4:29 PM CT: Fixes found by testing every building type on odd lots (f26932c)
- **No more drives over detention ponds.** On some corner and clipped-corner lots, a drive could run over the edge of the pond and the layout failed its own checks. Retail, office, medical and church layouts were affected.
- **A mix that doesn't fit still gets layouts.** Shops plus 120 apartments on a wedge-shaped lot used to come back with nothing. Now you get the same mix at a smaller size, or the main use alone, and the layout says so.
- **Duplexes no longer read "parking short".** Each front-load duplex's driveway holds its second car, and Numbers now shows those driveway spaces.
- **Re-fitting after moving a building no longer loses parking on a busy computer.** Before, it could come out with about half the spaces it needed.

### 4:15 PM CT: Project status on the Projects list, and small project page polish (b8f4567)
- **Status on the list:** each project card and list row shows its status pill (Prospect, Under contract…), and **Status** is a new sort choice.
- **Phones:** the project page's tab strip fades at its right edge when there's more to scroll, and the open tab is scrolled into view. The "Enter asks" hint is hidden on touch screens.
- **Renderings:** the full-size viewer says when the plan has changed since the picture was made; the Satellite tip is hidden while rendering is paused; Copy isn't offered on an option whose site isn't drawn yet.
- **Wording:** the Jurisdiction & site facts are looked up on each device and kept with the project there; the doc no longer says they're shared.

### 3:59 PM CT: Cancelling a rendering no longer bills for it (2b4190e)
- **Cancel** under Render now stops the AI's work on the server as well as in the browser, so a picture you cancelled isn't painted and charged to the monthly budget for nobody. A picture the AI had already started is dropped, not kept.

### 3:58 PM CT: Review fixes: renderings kept when you leave, budget off switch, project page polish (0ecdfa9)
- **A rendering is never lost:** closing the plan, switching options or going to Projects while a picture was being painted used to drop it quietly. It's now saved on the option it was taken of, and the toast names it ("Rendering of Option A ready."). Cancel still drops it.
- **Each picture's "plan changed since" is judged from the moment it was taken,** not from the start of an All site views run. A failure after a success is reported, not hidden.
- **Renderings can be turned off** by the administrators (a zero budget); the panel then says so instead of showing a $0 budget.
- **Project page:** deleting a project removes its pictures from this device; option names no longer repeat after a delete (no second "Option C"); the empty Renderings tab offers a next step; changing the tab in the address switches the tab; Ask keeps the full notes when summarising for an email.
- **Polish:** the small notes under Render (budget, tips) are styled like the app's other notes; the View picker no longer cuts off its labels; a teammate's picture shows a "Not on this device" placeholder instead of a broken image; Delete in the viewer is red; picture tiles stay 16:9.

### 3:23 PM CT: A proper project page: Overview, Options, Renderings and Ask (d4bb78d)
- **Each project now has a real home.** The project page has a header with the name, address, acreage and a **status** (Prospect, Under review, Under contract, Owned, On hold, Dead), and four tabs. Your last tab is remembered and kept in the address, so reload and Back work.
- **Overview:** project information (site, parcels, owners, appraised value, options) with **Client / prepared for**, **Target use** and **Notes** you can edit in place, and a **Jurisdiction & site** card gathered from the app's own sources: county, city or unincorporated, zoning (when Regrid has been fetched for the parcel), FEMA floodplain, water / utility district, school district, TIRZ, Opportunity Zone, busiest road and traffic, EPA-regulated facilities nearby and utilities, each with its source and a **Refresh** link.
- **Options:** every site plan option with its drawing, a one-line summary (use, floor area, units, parking, coverage), the pro forma line, issues, when it was last opened and how many renderings it has, plus Copy and Delete.
- **Renderings:** every rendering in the project, grouped by option, so you always know which picture belongs to which plan. **Render more** opens that option's plan at its Render section. Pictures made on another device are shown greyed with who made them.
- **Ask:** ask questions about the whole project. The AI gets the project information, the jurisdiction facts and each option's numbers, and says when something isn't in them. Suggested questions get you started ("Which option fits this site best?", "What approvals will this site need?").
- **Behind the scenes:** the site lookup now also says whether a point is inside a city's limits (US Census places); Regrid's city is kept with the parcel. Fixed the rendering viewer swallowing Escape after it was closed.

### 2:45 PM CT: Building close-up renderings, and a monthly rendering budget (8d167a5)
- **Building close-up:** a fifth **View** under Renderings frames one building as a hero shot, with its parking and landscaping around it and the rest of the site continuing beyond. Select a building on the plan first to choose it; otherwise it takes the building nearest the street. The option names the building it will use; **All site views** stays the four whole-site pictures.
- **A monthly budget for renderings:** the Render section shows this month's rendering spend against the budget ($100 a month to start, set by the administrators) and how many pictures that was. When it's spent, rendering pauses until the 1st; Ask AI and site plan builds aren't affected. The check runs on the server before each picture.

### 2:28 PM CT: Renderings know what self storage looks like (fc0d058)
- **A render of a storage plan** now shows a climate-controlled building with a glassy leasing office, metal drive-up buildings with rows of roll-up doors, and the fence with its gate, instead of a generic commercial building.
- Brought the latest renderings work into the self storage changes, with nothing lost on either side.

### 2:16 PM CT: Renderings frame the whole site, from a better angle (2be81fe)
- **No more cut-off buildings:** the picture the AI paints from now has the whole parcel in the frame with room around it. Before, the camera came from a formula and never checked what landed in the frame; now it checks the parcel's corners against the frame through the map's own camera and moves until they all fit, with space at the sides, below, and above for the roofs and sky.
- **Less of a snapshot:** the four views are lower and wider, like a marketing aerial; **From the corner** comes first and is the default. The AI is asked for a brochure-style composition with a level horizon.
- **Model:** renderings use **GPT Image 2.5 Sunburst** when the app's key has it, otherwise the newest GPT Image model the key lists.
- **PDF:** the rendering pages fill the sheet instead of printing as a small picture in the middle.

### 2:09 PM CT: Self storage site plans (a38f4db)
- **Ask for self storage and get a storage layout, not a warehouse box.**
  - The climate-controlled building and leasing office sit at the street with a few customer spaces in front.
  - Drive-up rows run behind it on drive aisles, with doors straight onto the aisle and cross drives through long rows.
  - RV and boat stalls go along the back when asked for.
  - A security fence runs around the yard with a keypad gate at each drive. A pond at the front stays outside the fence.
- **Different sites:**
  - About 1 acre: a compact version, with visitor spaces just inside the gate.
  - Drive-up only: a small leasing office replaces the climate-controlled building.
  - Climate-controlled only: no drive-up rows and no fence.
- **Settings** for storage:
  - climate-controlled size and floors;
  - drive-up size (blank = as much as fits);
  - row depth, aisle width and RV/boat spaces;
  - a fence switch;
  - two unit mixes you can add sizes to.
- **Numbers:** the layout card and Numbers show rentable square feet and about how many units, split between climate-controlled and drive-up. RV and boat stalls don't count as parking.
- **Pro forma:** treats storage as storage, with gross rent, owner-paid costs and a two-to-three-year fill-up.
- **Building library:** a Self storage group (climate-controlled buildings, drive-up rows, a leasing office). The map key and PDF sheet show storage and the fence.
### 1:52 PM CT: Photoreal 3D renderings of a site plan (8cf94b5)
- **Render on an open plan:** a new **Render** section (between Add and Export) paints the option as a photograph. Pick a view (**From the street**, **From the corner**, **Low, at the entry**, **From the back**, or all four), the materials (to suit each use, brick and stone, stucco and stone, modern glass and metal, tilt-wall) and the light (midday, late afternoon, dusk), then **Render 3D View**. About a minute a picture, at 1920 × 1080 when the image model offers it; **Cancel** stops it.
- **How:** the map points its 3D model of the plan at the site from that view, takes a picture, and the newest GPT Image model the app's key can use paints it photographically. Buildings, drives, parking, pond and trees stay where the plan puts them at their heights; materials, windows, landscaping, cars and sky are the AI's. Switch the base map to Satellite first and the surroundings come out as they are.
- **Afterwards:** the pictures appear under the button, newest first. Click one to see it full size, **Show the massing** to compare it with the model it came from, **Download** or **Delete**. A picture made before the plan changed says so. The two newest that still match the plan go on the Site Plan PDF, one to a page, captioned as AI concept illustrations.
- **Good to know:** they are concept illustrations, not designs: check each against the massing. Pictures stay on the device they were made on; teammates see that one exists, not the picture. Renderings show in Settings › AI model › Usage as their own line.

### 1:23 PM CT: Plan for photorealistic 3D renderings of site plans (4d0e2dd)
- **Planning only, nothing in the app changes.** A new `RENDERINGS-PLAN.md` lays out how renderings could be made from a site plan: first a proper 3D massing view and aerial capture on the map and the PDF sheet, then AI-generated photoreal views in the site's real surroundings, with a later option for a walkable 3D model if people ask for it. It is honest about what AI renders get right (placement, counts, heights, mostly) and wrong (windows, materials, details), and about cost and storage.

## 2026-10-16

### 9:12 AM CT: No more "Cannot find name 'Deno'" in the Vercel build (2e6f1d1)
- **Behind the scenes:** Vercel's build skips the Supabase folder. The Supabase edge function there runs on Supabase, not Vercel, and every build was reporting three false TypeScript errors about it. The build always passed, and nothing on the site changes.

## 2026-10-15

### 8:59 PM CT: AI usage shows one row per model, and says why some charges aren't counted (05184b1)
- **One row per model:** the Billed column grouped OpenAI's charges by its line-item names, so voice showed up as separate "text" and "audio" rows. Each model now has one row.
- **Charges the app doesn't count itself now say why:**
  - voice, which talks to OpenAI directly;
  - web search fees, which are charged per search rather than per token;
  - use from before the app began counting on October 16.
- **The total row always shows the billed total.**
- First live reading for the Real Estate Intelligence key: $14.74 billed so far this month, $9.77 of it voice.

### 8:41 PM CT: Billed shows only this app's OpenAI key (2365d39)
- **The Billed column now covers only the Real Estate Intelligence key**, never the OpenAI account's other keys or projects.
  - The app finds its own key in your OpenAI projects using the read-only admin key.
  - The note under the table names the key and the project.
- **If OpenAI only bills the key's project as a whole** and that project has other keys too, the note says so. It then shows this key's own cost separately, from OpenAI's token counts for the key at list prices.
- **If the key can't be found,** no billed amounts show, and the note explains why.

### 8:06 PM CT: AI usage and cost in Settings (c41a7fa, 13faf6e)
- **Settings › AI model › Usage:** a table of AI use for the chosen period: This month, Last 30 or 7 days, Today or This year.
  - For each model it shows requests, tokens in, tokens out (including the model's reasoning) and estimated cost, then a total.
  - A line under the table splits the cost by feature: site plans, Ask AI, filing briefs, place search and the nightly data.
- **Counted from now on:** the app adds up every AI answer's token counts from tonight. Voice isn't counted, because it talks to OpenAI directly.
- **Costs are estimates at OpenAI's list prices.** They come from public price listings, because OpenAI's own page couldn't be read from here.
  - Models where the listings disagreed are marked with a *, and models with no known price show a dash.
  - **Edit prices** corrects any of them on your device.
- **Billed amounts:** with an OpenAI admin key on the server, a **Billed** column shows what OpenAI actually charged per model, voice included.
- Behind the scenes, a new usage table in the database, readable and writable only by the server.

### 7:30 PM CT: The AI model list only shows models that work (2a0e413)
- **Settings › AI model now lists only models that work with every AI feature:** 25 of the 40 OpenAI models your key can use.
  - Left out: the "pro" models, the ChatGPT "chat-latest" ones, the live voice model, GPT-4, GPT-4 Turbo and GPT-3.5. Picking one of these could have made a build fail.
- **A picked model that can't answer a request no longer breaks it:** the server's default model answers instead, and Settings shows which model did.

### 7:04 PM CT: Pick the AI model in Settings (53c8cb8)
- **Settings › AI model:** a new section to choose which AI answers.
  - **Provider:** OpenAI for now. Anthropic (Claude) is listed as coming later and can't be picked yet.
  - **Model:** lists the OpenAI chat models the app's key can use, newest first, after **Server default**, which names the model used when you don't pick one.
  - Your pick is kept on this device.
- **Where it applies:** site plans (Build, Change With AI, Ask about this plan, What Should Go Here?), Ask AI and filing briefs.
  - If the key can't use the picked model, the server's default answers instead.
  - Voice and place search keep their own models.
- **Which model answered:** a line under the picker names the model that gave the last answer.

### 6:26 PM CT: The AI plans the site before placing anything (4bb6db8)
- **Thinking before placing.** On Medium, High and Ultra, the AI now thinks the site through before the layout engine places anything. Before, the effort levels mostly changed the review after the layouts were drawn. The plan covers:
  - what goes at the front, in the middle and at the back, and why;
  - where the ways in go;
  - how the parking and the pond work;
  - whether the building, parking and pond fit the acres.
- **Ultra drafts three different plans** at the AI's deepest thinking, checks each, and picks one. If the model doesn't offer that level, it uses the next one down.
- **The plan steers the build.** It sets the program and the layout settings, and the review judges each layout by whether it carries the plan out.
- **Planned first:** a folded box under **Read as** shows the plan. Ultra's version also shows the plans it set aside and why it picked this one. **Ask** can explain the plan.
- **Longer builds.** Builds take about a minute longer at each level, and Ultra about three to six minutes. The server's time limit for site plan AI calls went from 3 to 5 minutes.
- **Not yet tested against the live AI:** the planning step was checked with the AI faked, so the quality of its plans hasn't been seen yet.

### 5:27 PM CT: AI effort levels, a one-click layout update, questions about a plan, and the Development mix view (b3d6460, a938129, 194c6e1, 15459bd)
- **AI effort: Low, Medium, High and Ultra** replace Quick / AI-reviewed under Build, each saying what it does and about how long it takes.
  - Low: the AI reads the request, with no review.
  - Medium: one review round.
  - High: the old AI-reviewed.
  - Ultra: starts from five layouts and reviews up to six with drawings, with up to two rounds of program changes. It has a gold look and a short shine when picked.
  - Your choice is remembered on the device. Old "Quick" maps to Low, and "AI-reviewed" to High.
- **Update icon on an out-of-date layout card:** a sync icon in the card's top right re-fits the layout to your changes in one click (the same as Re-fit Around My Changes).
- **Ask about this plan:** a new section where you can ask why it needs so much parking, whether it needs a detention pond, how the pro forma works out, or why the AI made a choice.
  - Starter questions fit the plan, and follow-up suggestions are offered.
  - Answers use only the plan's own numbers (parking by use and the rule behind it, stormwater, checks, pro forma, the build's notes), and they say so when something isn't recorded.
- **Development mix (U, the pie chart on the tool bar):** colours each use's buildings and greys out parking, drives, lawns and ponds.
  - A card lists each use's building acres and share of the site (footprint only, no parking), with Phase 2's share, the total, and on mixed-use plans the land each zone takes.
  - Hover or click a row to light up that use.
- **Known gaps:** answers from the AI and Ultra's timing haven't been tried against the live AI yet (tested with the AI stubbed).

### 5:18 PM CT: Parking you can drive through; street sides that match the map (5a57490)
- **Aisles go through.** An aisle with stalls along it no longer stops at a curb.
  - It runs on until it meets a drive.
  - Or a short drive across the ends of the rows joins it to the next aisle.
  - Where the land leaves no way through, the last stalls are left out so cars can turn, if the plan has spaces to spare. Otherwise the plan's checks name the aisle.
  - Across 30 test layouts, aisles that dead-end went from 40 to 8, with no layout losing the parking it needs.
- **No stalls past the end of an aisle,** and none right at an entrance.
  - The first 30 to 75 ft in from the street is a clear driveway.
  - Adding an entrance by hand clears the stalls beside its mouth, and the checks flag one that's left.
- **Street sides only where a road really runs along the lot line.**
  - Driveways and parking lanes don't count, and neither do roads that only pass a corner or short jogs in the lot line.
  - The front goes to the bigger road.
  - On 19730 FM 362 the old check marked 6 of the 8 sides. It now finds FM 362 on the west and B Street on the east.
  - Plans found the old way are checked again once when opened.
- **Any street side can now be taken off** with Side Street: clicking the main street side moves the front to the other street.

### 3:39 PM CT: Entrances that fit the site; changes that understand places; moving amenities among homes (57f6d47)
- **The right number of entrances by itself:** when a request doesn't say how many, layouts choose.
  - One for an ordinary lot.
  - Two for a corner lot, with the second on the side street.
  - Two for more than 30 homes or 200 apartments (a second way in for fire access), and for big parking fields or sites over 15 acres.
  - Three for very large sites.
  - The notes say why. Asking for a number always wins.
- **Change With AI understands places:** "the back", "the front", "the middle of the homes" or "of the apartments".
- **Moving an amenity among houses no longer breaks the plan:** moving a community center among the houses (or adding a pool beside it) only clears the few homes under it, and the rest of the neighbourhood stays.
- **Re-fits that lose homes are held back:** if the re-fit after a change would lose homes, units or floor area, it isn't taken, and **Re-fit Anyway** is offered. On the 86-acre site a re-fit like this had dropped 461 units to 145, and the detention spread into one huge lake.

### 2:59 PM CT: Smoother, connected parking; bend drives and entrances; an Items list in Layers (55542e2, f430a4a, 03e357c)
- **Paving is one smooth surface.**
  - Drives, aisles, parking and entrances pour together, with one curb round the outside.
  - The curb is rounded where a row ends and where an aisle meets a drive.
  - Curves and slightly turned rows no longer show stair-steps. The paving also draws faster.
- **Tidier layouts:**
  - no aisles running on past the last stall;
  - no drives that end in the grass (or in the rear landscape buffer);
  - no leftover scraps of 3 or 4 stalls.
- **Moving a building no longer wrecks the parking.** Moving a building, then letting the site re-fit, lays the drives and parking out again around it. Before, it could drop to 6 spaces of 120 needed.
- **Bend drives and entrances.** Select a drive, an aisle or an entrance, then press **Edit Shape** (or right-click › Bend it).
  - Drag its points, or the blue + to add a bend. Double-clicking a drive also adds a bend.
  - **Width** and **Curve** set its size and how round the bends are.
  - An entrance keeps its mouth on the street, comes in square to it, and flares out each side (**Mouth flare**).
  - A main entrance you've bent stays the way in when the site re-fits: no second entrance is added.
- **Stranded parking rows are flagged.** A parking row with no aisle beside it now says so, e.g. "Parking 9 has no aisle to drive in from".
- **Items list:** the **Items** tab in the site plan's **Layers** lists every building, parking row, drive, pond and lawn under its layer.
  - Click one to select it.
  - Double-click (or the pencil, or F2) to rename it.
  - The list follows what you select on the map.

### 12:46 PM CT: Drag pieces onto the site, draw any building shape, change a building's use; re-fit no longer over-parks (e840b22)
- **Drag and drop from Add:** drag a tile from the tool bar's **Add** palette, or from the panel's Add section, onto the map.
  - The piece's outline follows the pointer at its real size, turned the way it will land.
  - The outline turns red off the site.
  - It lands where you let go. Esc, or letting go off the map, cancels.
  - A plain click still drops it near the middle of the view.
- **Draw a building any shape:** **Draw area › Building outline** draws a building corner by corner, with the plan's number of floors.
  - To reshape an existing building, select it and press **Edit Shape**. Drag its points, or drag the small blue + on an edge to add a point. Double-clicking the outline also adds one.
- **Change what a building is after it's placed:** the Selected box now starts with **Use**, **Floors** and **Type** (from the building library).
  - Right-click a building, or several selected, for **Change use ›**.
  - The parking need follows the new use, and the rest of the site re-fits. One Undo takes it back.
- **Building shape for custom buildings:** it reads **Custom outline** for a reshaped or drawn building. Picking Bar, L-shaped, Courtyard or Tower turns it back into that shape.
- **Re-fit fix:** re-fitting round buildings you've moved, resized or changed no longer over-parks the site. A pinned 25,000 sf retail building got about 165 spaces for 100 needed; it now gets about 107.

### 11:55 AM CT: Merged with the latest main; right-click menu fix (89b1a01, 1b6a1f9, 9f283be)
- **Merged with everything else that landed today:**
  - the development pipeline layers;
  - Ask AI fixes;
  - faster search, and a reload that keeps your place;
  - site plan safety fixes;
  - Market and Compare clarity;
  - the Reports page;
  - the free-map fallback when MapTiler is over its limit.

  Nothing from either side was dropped.
- **Back and Forward:** these step through your pages and the project you had open. Reloading still brings back the map view, the open property card, the site plan or the project.
- **Site plan wording:** the map chip's button reads **Stop Editing** (or **Stop Measuring**, **Finish**), so **Done** in the panel is the only Done. The option button reads **+ Copy Option**, and out-of-date layouts say **Layouts out of date**.
- **Site plans open on the free map:** a site plan now opens even when MapTiler refuses its key. Before, the plan wouldn't open at all.
- **Right-click menu:** in a site plan it no longer disappears straight after it opens.

### 10:42 AM CT: The map keeps working when MapTiler is over its limit (1bddf09)
- MapTiler (the Default, Streets, Satellite and Topo base maps, and part of search) ran out of its monthly quota and suspended the account, which left the map blank and address search empty.
- Now, when MapTiler stops serving, the map switches by itself to the free OpenStreetMap map in the same style: a plain light or dark map for Default, a street map for Streets and Topo, ESRI imagery for Satellite. A note says so once, and Data sources shows which map is in use.
- Address and place search, "Ask AI about this spot" and naming the spot you're looking at outside Texas use OpenStreetMap search instead.
- The app remembers the outage for 6 hours, so reloads go straight to the free map instead of failing first, then tries MapTiler again.
- The nightly data refresh no longer marks an address as "not found" just because MapTiler refused; it's tried again the next night.
### 12:11 AM CT: Site plan tools on the map: right-click, drag one side, add a point, re-fit as you go (b206604, b4c2123, bcfed5c)
- **Right-click menu:** right-click works while a plan is open (long-press on touch, or the menu key / Shift+F10 for what's selected).
  - **On a piece:** Duplicate, Copy, Delete, Turn 90°, Edit shape, Add point here, Pin or Let it move, Fit selection and Change with AI.
  - **On open ground or a lawn:** Add here (the piece lands where you clicked), Measure from here, Fit plan and Paste.
  - ⌘C / ⌘V (Ctrl+C / Ctrl+V) copy and paste.
- **Drag one side:** a selected building has white bars on its sides. Drag one to move just that wall; the opposite wall stays put. In Edit Shape, the bar on an edge moves that whole edge, and a small blue + adds a point there.
- **Add a point:** double-click a building's outline while editing. It turns into points with the new point where you clicked (one Undo step), ready to drag.
- **The site re-fits as you go:** when you finish moving, resizing, turning, adding, deleting or pasting a piece, the parking, drives and other placed pieces are laid out again around it.
  - One Undo takes back both your edit and the re-fit.
  - If re-fitting would lose floor area or units, or add problems, your edit is kept as it is and the message offers **Re-fit anyway**.
  - Turn it off with **Re-fit the site after each edit** in Site parameters.
- **Add button on the tool bar** (A): the grouped pieces, the same as the panel's Add section.
- **A quieter mode indicator:** the dark pill at the top of the map is gone. A small light chip just above the tool bar says what mode you're in, with Done or Cancel.
- **Lined up:**
  - The legend, tool bar and scale bar share one line along the bottom of the map.
  - Folding the legend no longer moves the tool bar.
  - Cursors show what each handle does.
  - On phones the tool bar hides while the sheet is pulled up full.
- **Labels:** a building reshaped by hand reads "custom shape", not "curved".

## 2026-10-14

### 11:43 PM CT: A tidier site plan panel (155dd4b)
- **Order:** Site parameters now comes second, right after Layouts. The rest follows as Build, Change, Numbers, Pro forma, Site, Add and Export.
- **Header:**
  - The header is two clean rows.
  - Saved status is a small icon (a laptop when it's saved on this device, a cloud with a tick when it's synced with the team, a red warning you can click to retry), with the details on hover.
  - Option chips stay on one row.
  - The "Editing · drag a piece; only it changes" line is gone.
- **Parking first for what you asked for:** the overview and the layout cards show the parking for your request (e.g. 107 / 100). When there is a Phase 2, a "Whole site" line shows below.
- **Switches and chevrons:**
  - Setbacks, Landscape buffer, Fill the rest of the site, Trees, Update layouts as I change settings, Re-fit the rest of the site and Homes for sale are now switches.
  - Folding sections use a chevron instead of the words Show and Hide.
- **Buttons, not links:** Use This Layout, Save as New Option, Edit request, New request, More Layouts, Review Again, Let It Move, Compare layouts and Delete This Option are now buttons.
- **Less to read:**
  - Long help paragraphs open from small (i) buttons.
  - Settings is grouped (Program, Setbacks, Parking, Buildings, Stormwater, Trash, Mix, Look) in a two-column grid, with the units inside each box.
- **Add (was Draw by hand):**
  - Grouped icon tiles for Buildings, Paving, Water & landscape, Amenities and Site.
  - A building library search.
  - Trees moved to Settings › Look.
- **Coming next:** Settings has a new **Re-fit the site after each edit** switch. It starts working with the next update, which brings the site plan map tools.

### 11:32 PM CT: Site plans park what they need, not three times it (277105c)
- **Sensible parking totals:** layouts now park what their buildings need plus about 5% (and the accessible stalls). The default ratios were already normal: retail 4 per 1,000 sf, restaurant 10, office 3.5, medical 5, warehouse 0.6, apartments 1.6 per unit. The layout engine was adding far more than they called for.
  - **Parking garages** are sized to the share of parking they carry. Before, every garage was at least 180 ft long, so a 25,000 sf retail plan showed 323 spaces for 100 needed; it now shows about 105 for 100.
  - **Mixed-use plans** now trim their spare parking rows, as single-use plans already did.
  - **Small programs** land at about 107 for 100 needed.
- **Phase 1 parking:** the plan now works out parking for what you asked for (Phase 1) separately from the whole site with Phase 2. The plan panel will show it in the next update.
- **Every building has its own name:** Building A, B, C… across shops, restaurants and offices. Before, a plan could have two or three "Building A"s.
- **Mixed use on a smaller lot works:** shops, a restaurant and offices on about 6 acres used to fall back to three "Simple layout" options with no parking at all. They now lay out properly, sharing one row of buildings and one parking field when they don't fit one behind the other.
- **Better layouts without the AI:** layouts with storefronts facing the street, and with parking close to the doors, now rank higher.
- **New uses and defaults:**
  - **Hotel:** about 1 space per room ("120-room hotel" reads as about 66,000 sf).
  - **Church:** 10 spaces per 1,000 sf ("600-seat church" reads as about 20,000 sf).
  - **Townhomes:** a quarter of a guest space per home, which fits a few fewer homes.
  - **Parking ratio:** capped at 15 per 1,000 sf.

### 11:15 PM CT: Market page faster and easier to read; Ask AI shows its work quietly (1c54539, 14f9feb)
- **Faster Market page:**
  - Opening it no longer freezes the page: the longest pause went from about 1.3 s to under 0.7 s on a busy test machine.
  - Switching 12 / 24 months / All takes about a tenth of a second (it was 0.6 to 1 s).
- **Steady while data loads:**
  - Crime, traffic and live prices now redraw only their own section when they arrive.
  - Live prices refresh every minute without closing lists you had open (All ZIPs, more news) or moving your scroll.
- **Readable charts:**
  - Every chart is drawn at the width of its box, with one text size throughout. Axis text is no longer shrunk to about 6 px in the small price charts.
  - The price charts sit three to a row (two on tablets, one on phones).
  - The headline tiles fill whole rows.
  - Boxes side by side end level.
  - Bar lists line up their labels and values.
- **Nothing removed:** all the data that was on the page is still there.
- **Ask AI:**
  - The "Thinking…" at the top is gone.
  - While it works, a quiet line at the bottom says what it's doing ("Looking at the map…").
  - When the answer arrives, the steps fold into **Worked through N steps** above it, which you can open.
  - **New chat** has a compose (pencil) icon.

### 10:33 PM CT: Faster search, and a reload that keeps your place (43fdad5)
- **Search is quicker:** results start coming in sooner after you stop typing, and businesses show as soon as the first source answers instead of waiting for the slowest (OpenStreetMap now gets one quick look rather than three widening ones).
- Picking a result moves the map straight away; a town's or road's outline fills in when it arrives instead of holding the map still for it, and a lookup that hangs gives up after a few seconds.
- Typing "Ln" and "Lane" forms of a street are looked up at the same time, and answers are remembered for the visit, so backspacing and retyping is instant.
- Enter on a street address waits the moment it takes to find it, so it lands on the address, not on a filing that matched first.
- The Radius box and the main search box no longer cancel each other's lookups.
- **A reload keeps your place:** the map view (with tilt and turn), an open property card, an open site plan and the project open on Projects come back after a reload, and when the installed app or the bare page is opened again. A first visit still flies in to the region; copied links and saved searches are unchanged.

### 10:06 PM CT: Groundwork for the site plan Add palette (51312d6)
- Behind the scenes only: one shared list of the pieces you can add, grouped (Buildings, Paving, Water & landscape, Amenities, Site), for the redesigned Add section and the tool bar's Add palette coming next. Nothing changes on screen yet.

### 8:07 PM CT: Site plan fixes from review (5df66e8)
- **Locked and hidden layers stay put:** a piece on a layer you lock or hide can no longer be moved, deleted or pinned along with other selected pieces. Locking a layer now takes its pieces out of the selection.
- **Easements stay when you switch layouts:** picking another layout, or saving one as a new option, now keeps the easements you drew. Before, a layout built earlier would quietly drop them.
- **Export over a plan:** with the Export dialog open on top of a plan, keys like G or Delete no longer change the plan behind it, and Esc closes the dialog again.
- **Projects link:** the **Projects** link at the top of a plan adds one step to the browser's Back history instead of two.
- **⌘D / Ctrl+D:** with nothing selected it does what your browser normally does.
- **Area at a Glance:** numbers stay whole while they count to a new value.

### 7:22 PM CT: Site plan tools: select several, duplicate, measure, grid, layers, easements (7cec88c, d2964b6, 1455a61, 19219e3, 01ed19a)
- **A tool bar on the map** while a plan is open: Select, Edit, Draw area, Draw line, Measure distance, Measure area, Fit plan, Fit selection, Grid and Layers.
  - Shortcuts: V, E, M, Shift+M, Shift+F, F, G and ⌘D / Ctrl+D. They don't fire while you type.
  - A greyed-out button says why it can't be used yet.
  - On phones the bar sits at the top left, with **⋯** for the rest.
- **Several pieces at once:** Shift-click a piece to add or remove it, or Shift-drag a box. Move, nudge, duplicate, delete or pin the set together, as one Undo step. The Selected box shows how many are selected, what kinds, and the ground they cover.
- **Duplicate (⌘D)** works on every piece, curved drives and the entry included. Before, copying one of those broke it. The copy brings what belongs to it, lands in the nearest clear spot and is selected.
- **Measure** a distance (each side and the total, in feet) or an area (square feet and acres). Nothing is saved.
- **Grid and snapping:** an optional 5 or 10 ft grid lined up with the lot, which moved pieces and drawn points snap to. **Snap to edges** can be turned off, and Alt still moves freely.
- **Layers:** show, hide or lock buildings, parking and drives, stormwater, landscape, trash, trees, labels, the setback line, parcel lines and easements. This is saved with the option. Numbers, checks and exports always include everything.
- **Draw by points:** draw lawns, plazas, ponds and easement / no-build areas, and draw drives or walks as lines. A shape that crosses itself or lies outside the lot is refused with a message.
- **Easements and no-build areas:**
  - They're hatched in red.
  - Anything built or paved on one is flagged as a problem.
  - **Build Layouts** and **Re-fit Plan** lay out around them.
  - They're in the Plan key, on the PDF sheet and on their own layer in CAD.
  - You draw them yourself; they aren't looked up or surveyed.
- **Your edits are safe:** Build Layouts, Use this layout, New layouts from these settings and the AI's Use it now ask before replacing a layout you've changed: **Replace my edits**, **Save my edits as a new option first** or **Cancel**.
- **Save status:** the plan header says **Saved on this device**, **Synced with team · 3 min ago** or **Sync failed · Retry**.
- **Fixes:**
  - Garages, outdoor seating and trash enclosures can now be clicked.
  - Delete, the arrow keys and R work straight after clicking a button in the panel.
  - Undo now also covers renaming an option, Pro forma changes and adding or removing parcels.
  - Parking drawn by hand uses your stall and aisle sizes.
  - Renaming an option updates its button straight away.
  - A selected piece shows its width and depth when you zoom in.
- **Plan key:** it now tells **Site boundary (planning)** apart from **Parcel line (county data)**.
- **Projects:** Back from a plan returns to its project page, Back again to the list, and reloading a project's page keeps it open.

### 6:08 PM CT: Light only, Back button, keyboard and finishing touches (d0ef7ac, 11d6abd, cafc262, 2d528f5, 7c970fd)
- **Dark mode removed:** the app is always light, even when your device is set to dark. If you had chosen Dark or Match device, you'll see the light look next time.
  - Settings no longer has an Appearance section.
  - **Show sources** and **Panel width** moved to Settings › Map.
- **Back and Forward work:** the browser's Back and Forward buttons now move between the app's pages instead of leaving the app. Your filters and picked area stay as they are.
- **You can see where the keyboard is:** every button shows a clear green outline when you Tab to it. Before, the outline was invisible on Export, Filters, Layers and the map buttons.
  - Switching pages from the top bar with the keyboard puts you on the new page's title.
  - Screen readers say which page opened.
- **Dialogs and tabs:**
  - The Export dialog keeps Tab inside it, keeps your place when you change a choice, and returns you to the Export button when it closes.
  - The × on a card tab is its own button, so you can reach it with the keyboard.
- **Reduce motion:** if your device is set to reduce motion, the app's animations stop and busy spinners turn slowly. Changing the setting takes effect straight away.
- **Small touches:**
  - Buttons, toggles, links and rows react when you hover or press.
  - Close (×) buttons are easier to hit, especially on touch screens.
  - Loading notes on cards and reports show a small spinner.
  - Error text and grey helper text are a little easier to read.

### 5:49 PM CT: Charts that move with the data (feae7b1)
- **Charts draw in once:** the first time a chart comes into view, its bars grow up from the baseline and its lines draw across. Coming back to a page doesn't replay it.
- **Changes you can follow:** on the Market page, switching 12 / 24 months / All, changing the county, turning a series on or off or pinning a bar now glides the bars and lines to their new values instead of redrawing them.
- **Live prices without restarts:** the Markets prices refresh every minute without the charts starting over.
- **Timeline:** the chart updates smoothly when you change Group by, Measure or filters. It keeps the range you dragged, and the month under the pointer is highlighted.
- **Numbers that count:** the headline numbers and Area at a Glance count to their new values when filters or the area change. During the time-lapse they update instantly.
- **Placeholders:** while Market data loads you see a plain grey placeholder, never made-up numbers.
- **Other charts:** charts in assistant answers, Compare areas, and the crime and FEMA reports draw in when they first appear.
- **Reduced motion:** if your device is set to reduce motion, charts simply appear.
- **Exports:** printing and PDF exports always show the finished charts.

### 5:36 PM CT: Water districts without the county-wide authorities (33244aa)
- The Water Districts layer and the property card's water district now leave out bodies that cover whole counties or river basins: Harris County Flood Control District, Coastal Water Authority, the Port of Houston Authority, river, groundwater and regional water authorities and the Fort Bend Subsidence District. Before, a downtown Houston property could show "Harris County FCD" as its water district and those outlines covered the map.
- Local districts named "water authority" (such as Clear Lake City's) still show.

### 4:49 PM CT: Ask AI fixes, clearer search results, and the any-size reports merged in (06915f4, 2a83f46, bb380c2, d34f302)
- **Ask AI:**
  - Text you type while an answer is on its way is kept.
  - Failures read as sentences with Retry.
  - Suggestions lead with the property, the area and the market, and only mention filings when they're on.
  - "Ask AI About This Spot" (right-click) asks about the property at that address.
  - Closing the drawer returns you to the Ask AI button.
- **Search:** an address result's main button is now **Property Card** (an area's is **Area Summary**).
- **Property card:** shows "≈ N acres · From the parcel outline" when the county record has no land area.
- **Market** names its area once at the top.
- **Compare's** empty page names the Box tool.
- **Filings › Changes:** a night with no changes says so.
- **Reports keep their no-size-limit behaviour** (from the earlier entries today). When a big area takes too long, or its outline is too detailed to send, the report gives that reason with Retry instead of a general "not available".

### 4:38 PM CT: School enrollment on the Schools layer (4b612c3)
- School cards and the property card's nearest schools now show enrollment (TEA's October 2024 count). The first version read the wrong column, so enrollment would have been blank.

### 4:22 PM CT: The development pipeline, and Harris and Waller owners without Regrid (47fe986)
- **Five new map layers** under **Development pipeline** in Map layers, refreshed every night:
  - **Building Permits (Harris):** about 47,000 permits from the last two years, from the Harris Central Appraisal District, colored by kind (new commercial building, new home, addition / remodel / lease space, paving, demolition). Harris County only: no other county or city in the region publishes permits as open data.
  - **Plats & New Subdivisions:** City of Houston plat applications for the city and its ETJ (about 4,000 in two years), Fort Bend recorded subdivisions, and the Montgomery, Waller, Austin and Washington subdivision maps. Those four maps have no dates, so their subdivisions count as new from the night they first appear.
  - **TxDOT Projects:** about 1,850 projects as lines, by stage, with cost, letting date, contractor and progress.
  - **Water Districts (MUDs):** about 1,070 active districts with outlines, creation date, tax rate, taxable value and bonds outstanding. Creation dates are read a few hundred districts a night, so the first nights show "Checking" for some.
  - **Schools:** public school campuses with enrollment and state rating.
  - A **Show** picker sets how far back permits, plats and districts go (90 days, 12 months, 24 months or all).
- **Property cards** have a **Development here & nearby** section: permits on the parcel, new building and demolition permits and plats close by, the water district the property is in, the nearest elementary, middle and high school, and TxDOT work within a mile.
- **Harris and Waller property cards** now show the owner and value straight from the county appraisal district instead of asking you to use Regrid. Harris records have no year built or acquisition date; where condominium units share an outline the card says how many. Site plans can start from these outlines too.
- **Ask AI** can answer "what's being permitted / platted near here", "which MUD is this in" and "schools near this lot".
- **Data & help** lists each new source with when it last loaded.
- Before any of this shows data, the new database tables have to be created once and the County data job run once. The assistant's prompt size limit in the tests went from 12,000 to 12,200 characters to fit the one new rule line.

### 3:40 PM CT: Checking the new county data sources (0b5bf9d, d1994cf, 268a094, bb5717e)
- Nothing changes in the app yet. This adds checks that look at what each new free source actually publishes for the seven counties: county appraisal district owner and value files, building permits, plats and new subdivisions, new MUDs and their bonds, TxDOT road projects and school enrollment. The loaders and map layers are built on what these checks find.

### 2:53 PM CT: Property, site plans, area data and reports come first; a sweep of fixes (22242e8, 2e97724, b13e5b3, ab7dae3, b22f43a, 1a507b2, f7e1dd8, f885a72, 8e80a5c)
- **New order:** the top bar is Map · Projects · Reports · Market · Filings · My Work, with site plans (Projects) as their own tab. On phones it's Map · Explore · Projects · Reports · More. The Map panel leads with the area, Area at a Glance and reports; saved searches and Construction Filings come last. Old links still open the same pages.
- **Layer chips follow what you use:** the most-used layers come first in the chip row and in the Layers panel. New users start with Parcels, Flood Zones, Demographics, Traffic, Satellite and 3D.
- **Property card:**
  - Clicking a business opens it in front of the property, with a back link.
  - Regrid results fill the title and Ownership.
  - A minimised card is just its title bar, and one click opens the next lot.
  - With several parcels you see "Parcel 1 of N".
  - Filing cards link to the property.
  - Site notes save as you type and aren't kept until used.
- **Site plans:**
  - Layouts made before you changed the site, street side, entrances or parcels are marked **Out of date**, with a way to re-fit them.
  - You can't switch options mid-build.
  - Small lots keep their parking and a drive in.
  - Pro forma boxes refuse impossible numbers, and profit has one meaning.
  - Very large builds no longer fail.
- **Area data, Market and Compare:**
  - Compare names drawn areas (Box 1, Shape 2…), lets you rename them, shows census rows and exports to PDF, Excel or CSV.
  - Market names its area in a sticky bar, puts people first, offers Retry on failed cards and keeps news to local development.
- **Reports:**
  - "For an area" reports come first, with a working Draw an area and coverage notes.
  - Every data request that fails shows the same plain message instead of a stuck spinner.
- **Map and app:**
  - The browser's Back button steps through pages.
  - Esc leaves any area tool.
  - Drawn areas get names like "Box near Katy" or "Within 3 mi of …".
  - The Filters popup is reordered.
  - Saved searches have Undo on delete.
  - Toasts are centred on the map.
  - Plus focus rings and a proper settings cog.

### 12:37 PM CT: Drive-time bands clear when you close the card (cc25d91)
- Closing a drive-time map, or the property card it came from, with × or Esc now takes the bands off the map. Before, they stayed with no way to remove them.
- The bands still stay while you go back to the property card, or when you select a band and run a report on it.
- The map legend's Drive time section has a **Clear from map** link.

### 12:25 PM CT: No more size limits on FEMA, traffic and air traffic reports (243a985)
- **FEMA report for any area:** it used to refuse anything over 400 square miles and skip flood-zone shares over 60. Both now work up to a whole county.
  - Larger areas measure the zones at about 900 evenly spaced points.
  - Flood insurance claims are read for every census tract touching the area, not just the first 60.
  - If some tracts can't be read in time, the report says how many.
- **Air Traffic report:** the 2,000 square mile limit is gone, and even a very large area answers in under a second.
- **Traffic report:** works for areas up to 10,000 square miles (was 5,000). **Export CSV** now lists every counted road segment, not just the 1,000 busiest, and the card says when the map shows only the busiest.
- **Crime Export CSV** lists up to the newest 20,000 incidents (was 2,000).

### 12:19 PM CT: Environmental report for any size of area (d038e3b)
- **No size limit:** the Environmental report used to refuse anything over 30 square miles. It now works up to a whole county.
- **Exact counts:** each database used to stop at 1,000 records (shown as "1,000+") and searched a circle much bigger than the site. Now every record within the search distance of the site's edge is counted, and the table shows how many are **on the site**.
- **Large areas:** when a kind has more than 1,000 records, the report lists the on-site and nearest ones. **Export CSV** gathers all of them, which can take a minute for a county. Wells and wetlands are summarized by type (wetlands with acres), and pipelines count distinct lines.
- **Soils for any size:** larger areas show each soil's share of the site. Before, soils were skipped over 3 square miles.
- **Retry:** a database that doesn't answer in time says so, and **Retry** asks just that one again.

### 12:06 PM CT: Crime reports work for any area; clear messages when a report can't finish (ceb2862)
- **Crime Report no longer fails on big areas.** An 80 sq mi selection (Jersey Village) showed "Unexpected token 'A'… is not valid JSON". The report took 27 seconds in the database, the database gives up after 8, and the server then retried until the whole request was cut off. It now takes about 2 seconds (the incident list under 1). The whole city takes a fraction of a second, and an area covering most of the city about 16 seconds.
- **No 1,500 square mile limit** on crime reports: any area counts the Houston incidents inside it.
- **Market page:** Houston-wide crime loads straight away instead of timing out when it isn't cached.
- **Plain-language errors everywhere:** when a report or lookup can't finish (crime, FEMA, environmental, traffic, air traffic, drive time, the property card, places, weather and others), you see a sentence about what happened ("The server took too long on this area. Try again…") instead of a technical message.
- **Crime report keeps its numbers** if the incident list can't load in time; it says so under Most recent incidents.
- **Air Traffic Report** no longer says "Flight history isn't set up" when the real problem was something else.
- Behind the scenes: Houston-wide crime numbers are worked out once a night instead of on every report, and incidents are stored in map order. While applying this, the database restarted once for about two minutes (12:43 PM CT) because a step used too much memory; that step was replaced before the changes went in.

### 6:55 AM CT: Site plans: a planning workspace, layouts you can compare, a map you can read (31fecfc, ae13672, 5c9686e, 11e0062, 4e46278, 194fe70, bd6f4c7, 26713a5, 168480b, f8b65e1, 9458bf4)
- **A planning workspace:** while a plan is open the map's side list and area tools step aside so the plan gets the room. The header shows where you are (Projects › project › option) with Undo, Redo, Edit Layout and **Done** always in the same place. A **Fit plan** button re-centres it.
- **Nothing lost by accident:** Esc steps back (stop the tool, then clear the selection, then stop editing) and never closes the plan. Closing says where the plan was saved, with a **Resume plan** chip on the map and a link to the project. Leaving the Map shows a "Return to plan" banner.
- **Builds you can follow:** one build at a time, with a progress strip (step, time so far) and **Cancel**. Suggestion chips now fill the request box instead of starting a build. When the AI isn't available, the app says so and offers requests the engine understands on its own, and shows which parts of a request it didn't understand.
- **Layouts you can compare:** each generated layout (Layout 1, 2, 3…) has a card with a thumbnail, units or floor area, parking, value and cost, yield, a Passes / problems tag and the AI's score, with **Recommended**, **Most units** and **Best yield** badges and a "vs Recommended" line. Sort by any of them. **Use this layout** or **Save as new option** from any card. The figures lead with phase 1 (what you asked for).
- **Layouts are kept:** a build's layouts are saved with the option, so they're still there after switching options, closing or reloading. Changing a setting no longer quietly replaces a layout you've edited.
- **Value and cost now include the land** (appraised value plus closing), the same as the Pro forma, so yields on the cards and overview read lower than before.
- **A map you can read:** building names show before parking counts and labels no longer pile up; a **Legend** (plan key) and a scale bar; a clearer site boundary and selected piece; better colours in dark mode; and a pill on the map that always says which mode you're in and how to leave it.
- **Safer edits:** a piece added from Draw lands in a clear spot instead of on top of others; a turned building that would overlap moves to the nearest clear spot (with Undo).
- **Phones:** the plan fits in the strip above the sheet, and toasts show above the sheet.

## 2026-10-13

### 9:55 PM CT: Clearer layout: five destinations, one Settings, roomier pages (2a35026, 92598de, f9bbfbb, 5e6ffcf, 0972e5c, 986342f, 6d1e4bc, 7b72284, df5b244, edaa303, 5b63dbf, 8501083, 9c6e877, a44c186, ef95caa)
- **A top bar with five places to go:** Map · Filings (Timeline, Companies, Changes) · Market (Overview, Compare areas) · Reports · My Work (Projects, Notes & watchlist, Saved searches). Ask AI, Data & help and a Settings gear sit on the right. The old ten tabs no longer run off the edge on laptops, and old links still open the right page. "Activity" is now **Companies** and "Updates" is **Changes**.
- **One Settings sheet** behind the gear (or More › Settings on phones): theme (Light, Dark or Match device), your name and team passcode for notes and projects, show sources, default base map, headline metrics, install the app, reset layout, and the voice log. The developer message on the Notes page is now plain language.
- **Pages use the full width:** the map's side panel only shows on the Map, so Market, Reports, Notes and the others are no longer squeezed. Tablets start with the panel folded away.
- **Pages work the same way:** a shared header with the main action and an Export menu, a bar showing which filters apply (with Edit filters right there, no trip to the map), and a "← Back to …" chip when a page sends you to the map. Changes opens a filing over the page and its count matches the badge. Saved searches have their own page in My Work.
- **A tidier map panel:** the selected area is pinned at the top with Compare, Clear and a "…" menu (Save search, Copy link, Filing alerts). Area reports sit together under "Reports for this area". Construction Filings shows its count, value and an "On map" switch. The long sources paragraph is one line, and the intro is a "Getting started" tip you can dismiss.
- **Map controls:** one Layers button next to Filters, one row of layer chips, and active filters shown as removable chips with Clear all. The right-hand column only moves the map. Time-lapse moved to the Filings layer and legend. On phones, Layers and Filters open as bottom sheets and the drawing tools sit under one "Select" button.
- **Property card:** sits full height on the right, with Ask AI, Site plan, Watch and "…" at the top, and section chips that follow your scrolling. Getting owner and zoning from Regrid is offered right under Ownership. Reports, filings and notes opened from a card have a back link to it. On phones the card opens half-height first.
- **Consistent look:** one set of spacing, text sizes and button styles in light and dark, and larger touch targets on phones and tablets.

### 6:54 PM CT: Site plans that get the most out of the land (00cddf7)
- **More leasable floor area and homes:** sizes you ask for are the first phase; buildings grow along their rows until the parking is used, and homes keep filling the blocks (leaving room for the detention lake). On a 41-acre retail, medical, office and warehouse test site the same request went from about 320,000 to 514,000 sq ft, still fully parked; a 220-acre neighbourhood went from 650 homes (with blocks of empty lots) to about 740.
- **Warehouses** in a mixed-use plan are real warehouses with truck courts; they used to come out as duplexes.
- **Parking garages** are built when asked for ("a parking garage behind the offices"), and tried on shop and office sites where they'd pay.
- **"Multifamily" or "rental housing"** compares garden apartments, studio and one-bed apartments, townhomes and duplexes, best value first.
- **Every option shows its value**, cost and yield on cost (pro forma defaults), with a Value sort.
- **No dumpsters unless asked for**, far fewer future pad sites, no sliver buildings, and a dragged pond stays inside the lot.

### 6:23 PM CT: More than one entrance; spinners on the AI buttons (a810d63)
- **Add Entrance** in the site plan tools: click the lot line where a driveway should come in and it runs straight in to the nearest drive, with curb returns, stepping round buildings and ponds. Clicking a lot line that isn't a street marks it as one; it warns when it's closer than about 150 ft to another entrance.
- **Ask for entrances when you build:** "two entrances" or "a second driveway" adds them on the front or a side street, spread apart; options that fit them come first, and one that can't says why.
- **Change With AI** can add ("add another entrance") or remove entrances.
- **The AI buttons show a spinner** while they work instead of changing their text, with a short line under them on what's happening.

### 5:50 PM CT: Change buildings by name with AI (b24a05d)
- **Change With AI** in the site plan panel: type changes like "make Apt Bldg 7 four stories", "turn the clubhouse into a 7,500 sf one", "remove Bldg 3", "swap Bldg 2 and Bldg 5" or "move the clubhouse and pool to the back". Select a piece and you can say "it". The AI looks at the plan, picks buildings from the library, and says what it changed.
- Only the named pieces change unless you ask for a re-fit (or tick the box): then the rest of the site is laid out again around them, keeping about the same amount of building. Changed pieces stay pinned. Cmd+Z undoes the whole change.
- Without the AI, simple changes in the same words still work.
- **Re-fit Plan is tidier:** a building you pinned keeps its parking right up to its walk, no stray lawn round it, and new buildings no longer take its name.

### 4:32 PM CT: One pool by its clubhouse; moving a building keeps the plan tidy (c4c4568)
- **One pool per community, where it belongs:** apartments with a commons no longer get a second pool and clubhouse out behind the buildings by the pond. The clubhouse and pool by the entry serve everyone; the commons keeps the park, playground, pavilion and lake. Neighbourhoods with homes for sale still get a community center with its own pool, now on a deck right against the center.
- **Commons amenities line the drive** (community center, pool, playground, pavilion, courts) with the lake and lawns behind them, instead of sitting out in the middle of the park.
- **The checks flag** a pool that isn't beside its clubhouse and a second pool for one community of rentals, so the AI review catches them too; the AI is also told to plan one pool per community.
- **Dragging a building no longer wrecks the layout:** it settles in the nearest clear spot to where you let go, off the drives and clear of other buildings (hold Alt / Option to place it anyway). A clubhouse takes its pool deck and pool with it, a restaurant its patio and drive-thru lane.
- **Parking comes back:** stalls a building covered grow back when you move it off them, so trying a spot and moving back leaves the plan as it was.

### 4:01 PM CT: The AI suggests what to build and reviews the layouts (ce4e152)
- **What Should Go Here?** in the site plan panel: the AI reads what the app knows about the site (flood zone, roads and traffic, utility districts and lines, environmental records), what's nearby and local rents, and suggests three to five uses with why each fits and what to check. **Lay This Out** builds any of them.
- **Build Options now has the AI check the engine's work:** the engine still draws every option, then the AI looks at each one (a picture of the plan plus its numbers and checks), changes the program and has the engine lay it out again when the options miss, and puts the best first. Each option shows the AI's score, a verdict and what to watch. It takes a minute or two; a switch under the button turns it off.
- The AI also sees the site's facts when it first reads your request.

### 1:32 PM CT: Site plans that always fit, big neighbourhoods, a building library, shape editing (03585aa, 8d0f936, 989d3e2, 0bf16d8, 4a57763, 02e3798, 6ac9f59, a586dfa)
- **Every plan fits and is complete:** buildings come with their parking, a drive in from the street and dumpsters for shops, restaurants and offices. A restaurant on a wedge-shaped lot with a curved highway frontage now gets a real layout (it used to give "Simple layout" with no parking). Ask for more than the land holds, like 100,000 sq ft on 1.5 acres, and you get the most that fits with its parking, with a note saying so.
- **Extras beside one building:** outdoor seating against the restaurant, a playground and a named lawn, from the words in the request.
- **Big neighbourhoods fill the site:** "residential neighbourhood, retail in front, multifamily, community center at the back" on 110 acres now gives shops on the frontage, apartments, about 290 home lots, and a community center with pool, parking and playground in a park at the back, instead of 90 acres of "Future development". Leftover land between homes is open space.
- **Trees** line lawn edges and front yards instead of a grid of dots.
- **A building library of about 230 types** (apartment buildings of many kinds, townhome rows, duplexes, 24 house plans, restaurants, shops, offices, medical, industrial, hotels and more): add one from Draw, or swap a placed building's type. Neighbourhood streets mix the house plans.
- **Edit Shape:** drag the points of a building's outline, add points, remove them.
- **Cmd+Z** works whatever button was clicked last.
- **The plan panel** is laid out like a property card: full height, with section chips and an overview at the top.
- **Faster:** 300-acre plans redraw about six times faster, layouts run without freezing the map, and saving no longer slows things down as projects grow.
- **The AI thinks longer** about the program (up to a minute) and knows the new options.

### 12:26 PM CT: Curving neighbourhood streets (9cfd9c9)
- **Single-family layouts now have curving streets**, with the lots and homes following the curves, the way a neighbourhood is drawn. The rows along the lot lines stay straight, so curving costs almost no lots (68 homes either way on a 20-acre test site).
- A **Neighbourhood streets** setting under Site parameters switches back to straight streets. Re-fit Plan keeps the curves.
- House lot lines on the map are thin dashed lines again, not the site's heavy outline.

### 12:21 PM CT: Projects as cards or a list, with a page per project (f9253da)
- **Cards or List:** switch at the top of the Projects tab (remembered on this device). Each project shows a drawing of its site, the parcel address, acres, number of options, its largest option and when it was last changed.
- **A page for each project:** click one for a summary card (site area in acres and square feet, parcels, owner, appraised and land value, number of options, largest option) with **Rename**, then its parcels with **Show on Map**, its site plan options drawn with their numbers, **New Option**, and notes. **‹ All projects** goes back.
- **Status removed:** the Idea / Pursuing / Under contract dropdown and filter are gone.
- **Nothing cut off:** long project names, addresses and owners wrap onto more lines instead of ending in "…", and the layout fits the space it has, from phones to narrow windows with the side panel open.
- Search now also finds owners; sort by last update, name, site size or number of options.

### 12:11 PM CT: Edit Layout: moving a building no longer re-lays out the whole site (8d8f319)
- Plans open for looking: clicking a piece shows it and dragging pans the map, so nothing moves by accident. **Edit Layout** at the top of the plan panel turns editing on.
- While editing, moving a piece changes only that piece. It lines up with the pieces near it and stays out of the setbacks (hold Alt to move it freely), and parking under a building you move gives way, whole stalls at a time.
- **Re-fit Plan** still lays out everything else around the pieces you placed, but only when you press it.

### 12:06 PM CT: A clearer Projects tab (370692c)
- **Each site plan option is drawn:** a small picture of the plan with its floor area, units, parking against what's needed (amber when short), coverage, and a red count when it has problems. Click it to open the plan.
- **New Option** adds a blank plan on the same site in one click. A project with no site yet shows how to add one, with **Find a Parcel** and **Draw a Site**.
- **Filter, search and sort:** status chips with counts, a search box (name, parcel, owner, notes) and sorting by last update, name, status or site size. The status colours the card.
- **+ New Project** asks for the name on the page instead of a pop-up box.
- **Notes are no longer lost while typing:** a background team sync used to redraw the list and wipe text you hadn't finished; it now waits until you leave the field.
- **Fits phones:** the cards no longer run off the right edge (the status and Delete were cut off); options list as rows with the drawing on the left.

### 11:56 AM CT: Townhome and duplex communities that fit, side streets, pull-through drives (b080bd8)
- **"24 duplex units" on a small tract now gives 24 units, not 4:** when the homes asked for won't fit on lots of their own, the plan lays them out as two-story six-unit townhome rows facing a shared parking court with a turnaround at the end, like a rental community on one tract, and says why. On the 1.46-acre Waller Tomball Rd tract this matches the hand-drawn 24-unit plan set: 4 buildings, 49 spaces for 48 needed, underground detention.
- **Unit lines and fenced back patios** are drawn on these buildings, on the sheet and the map.
- **Side Street:** a second street along a corner lot, found from the map's roads or set with the new **Side Street** button. Buildings keep the street setback from it, and "pull-through drive" in the request runs a second drive between the buildings out to it.
- Build with AI can now choose between homes on lots and a parking court, and ask for a pull-through drive.
- Options that fit far fewer homes than the best one, and plain fallback layouts, are no longer shown for these.

### 11:31 AM CT: Site plans fill the site, cleaner shapes, trees, more building types (e993f7b)
- **The whole site is used:** what you ask for is laid out as Phase 1, and the rest of the land holds more of the same size of building as Phase 2 (lighter, dashed), instead of lawn. "28,000 sf across 4 buildings" on 27 acres now shows the 4 buildings plus 32 more of the same size. Deep sites get several rows of shops or offices. A switch under Site parameters turns this off.
- **Cleaner drawing:** no more blob-shaped lawns and ponds. The site is one landscape background, ponds are rectangles beside the buildings, and parking rows end square. Trash enclosures are left out unless turned on.
- **Trees** look like trees (canopies on the sheet, 3D trees on the map), with a **Trees** on/off button in the plan panel.
- **3D:** smoother edges, roof parapets and a line at every floor, towers rising from their podium.
- **More building types:** L-shaped, courtyard (U) and tower buildings, for the whole plan or one building; **restaurant pads** with outdoor seating and a drive-thru lane; **playgrounds** with a play structure, slide and swings; **parking garages** that count their spaces; courts, pools and patios in Draw.

### 10:47 AM CT: Utilities near a site (dbf86d7)
- **Utilities row on the property card** (Site section): how far the parcel is from the nearest transmission line (with its voltage and owner), the nearest distribution line and the nearest substation; who holds the water and sewer service areas (CCN) here; and in Houston the nearest public sewer main (size and material) and water main where the city publishes one. Elsewhere it shows the nearest mapped water utility line and says to ask the city or MUD engineer for mains.
- **Power, Water & Sewer Lines** map layer: transmission lines in red with their voltage, distribution lines in orange, substations, and Houston sewer and water mains at street zoom.
- The **site plan sheet** notes the nearest power lines and the water and sewer providers.
- Power lines come from OpenStreetMap (the federal transmission-line map went offline in 2025); street lines are only partly mapped there, and the card says so.
- **Projects now sync with the team**: the projects table is set up in the team database.

## 2026-10-12

### 4:40 PM CT: Site plans follow the request: building counts, stormwater, one paved surface, ADA stalls, trash (3118744)
- **Building counts are honoured:** "28,000 sf of retail across 4 buildings" now gives four buildings of about 7,000 sf each, spread along the rows, instead of one 28,000 sf building. "4 buildings of 7,000 sf each" is read the same way.
- **Less leftover green, more usable land:** a fixed program gets the parking it needs plus about a tenth, not every row the site could hold; drive aisles that serve nothing are removed; the land not needed stays in one piece marked as a future pad site or future development. On a large tract a "compact, room to expand" option builds on just the part of the frontage it needs.
- **Stormwater:** sized from the developed land (about 0.55 acre-feet per acre, 5 ft deep) as a detention pond, a retention (wet) pond, underground vaults or none, chosen in the request ("with a retention pond", "underground detention") or under Site parameters, where a line shows what the plan needs and holds. Ponds sit beside the buildings. Underground storage is priced in the pro forma (about $420,000 an acre-foot, editable).
- **One paved surface:** drives, parking and truck courts are drawn as one area with one curb line round the outside, so there are no lines where they meet, on the map, the PDF sheet and in CAD.
- **Accurate markings:** accessible (ADA) stalls by the federal table near the buildings, in blue with striped access aisles (each pair costs one space, counted in the totals); a stop bar and centre line at the entry.
- **Trash enclosures** placed by the usual rules (apartments about one per 50 units or a compactor from 200, shops and offices one per about 25,000 sf within 250 ft, one per restaurant or warehouse, none for homes), gate on a drive; a **Trash enclosure** piece to add by hand; settings to turn them off or change the rule.

### 3:40 PM CT: Site plans: TestFit-style parameters, unit and home mixes, edit and re-fit, pro forma (461d026)
- **Site parameters** under the plan: building setbacks and landscape buffers by front, side and rear (each turned on or off), parking stall width and depth and aisle width, apartment depth, longest building and spacing, detention share, trees on or off, and the look: ponds and pools as natural curves, rounded rectangles or rectangles; parking rows with rounded or square ends; curved or square drive corners. Changing a setting lays the options out again.
- **Unit mix** for apartments (studio, 1, 2, 3 bedroom: size, share, beds): it sets the average unit and the unit count, and the plan lists units by type, beds and rentable area.
- **Single-family homes** with a 1-, 2- and 3-story mix: lots on both sides of each street with lot lines, driveways and cul-de-sacs.
- **Deal summaries** like TestFit's: acreage, FAR, building and impervious coverage, units per acre, beds, net and gross square feet, parking ratio.
- **Move, resize or reshape a piece and the plan re-fits around it:** the piece stays where you put it and drives, parking and other buildings are laid out again. A bigger pond counts toward detention. Curved pieces resize from their corners and switch between natural, rounded and square.
- **More options…** lists every usable layout found (up to 12), sortable by units, floor area, parking or open space.
- **Pro forma** with a development schedule in months (design and permits, construction, lease-up or sales, hold), a month-by-month model (construction loan and interest, lease-up, refinance, sale), TestFit's one-page method side by side, homes for rent or for sale, and **Pro Forma (Excel)** with live formulas.
- TestFit's custom pro forma was reverse-engineered: the one-page method reproduces its sheet to the dollar (61.51% unlevered and 114.44% levered IRR on its inputs). It skips the construction period and lease-up, which is why those IRRs run so high.

### 3:04 PM CT: Parcel lines cached for two weeks (c2f5825)
- **Parcel lines (Regrid) now stay cached for 14 days instead of 7**, so the same map area costs a Regrid tile at most once every two weeks. That stretches the monthly tile allowance further.
- The trade-off: a boundary change Regrid makes can take up to two weeks to show on the map.

### 3:03 PM CT: Site plans rebuilt: three usable, connected options every time (667d063)
- **Every Build with AI run gives three usable options.** Each is checked before it's offered: inside the setbacks, no overlaps, enough parking, and every drive and parking row reachable from the entry. The app tries many arrangements and keeps the best three that pass.
- **Laid out like a real site plan:** the drives come first as one connected network (aisles joined by curved drives into loops, no dead ends), parking rows line the aisles, extra parking bays run between them where needed, and buildings sit between the rows facing their parking across a walk.
- **Apartments:** the clubhouse sits at the entry with the pool on a deck right beside it (no more pool across the site with a pond in between), garden-style buildings with staggered fronts, and a walking trail round the pond. **Shops** face their parking with pad sites and drive-thru lanes along the street; **warehouses** get a truck court on the dock side; **townhomes** get two rows per private lane.
- **Curved, detailed shapes:** drives turn on arcs, the entry has curb returns and a planted median, parking rows end in rounded planted islands, and ponds, pools and lawns are free-form. Curved pieces drag and nudge as a whole.
- **No wasted land:** the plan fills the site as far as parking and detention allow. Detention is a natural-shaped pond at the back, at the entry or at the end of the rows; land left over becomes lawns, a dog park or a playground, and land a small program doesn't need is marked Future development. Options say plainly when a program didn't all fit.
- **Mixed use** runs on the same connected network, with zones that share a row side by side when the lot is too shallow to stack them.
- **The Build Options button keeps its size** after a build; the AI's note now sits under it.
- Tested on a copy of the 7.7-acre FM 362 lot from the screenshot, a real 27-acre parcel, a skewed 2.5-acre lot and a 20-acre mixed-use tract.

### 1:54 PM CT: Site plans on up to 20 parcels, mixed-use layouts and a PDF sheet (e14ac58)
- **Up to 20 parcels as one site:** pick them (Shift-click or Select Multiple, now up to 20), then **Site Plan for All** on the All tab, or **Add or Remove Parcels** inside a plan. Small gaps and overlaps between neighbouring parcels are closed up; parcels across a road stay out, with a note.
- **Mixed-use plans:** describe several uses and the site is laid out in zones from the street back: shops with pad sites at the street corners, a commons with an amenity lake (the site's detention), pavilion, courts and playground, apartments with a clubhouse and pool, townhome rows on rear-load lanes, and duplexes, with 26 ft drives between zones and a main entry drive. Works with or without AI.
- **More detail on every plan:** named, sized buildings ("Apt Bldg 2 · 40 units · 3 fl", "Pad A"), planted parking islands with trees, walks around buildings, trees along the buffer and the lake, buildings coloured by use. The Selected box sets a building's use and name.
- **Site Plan PDF:** a conceptual site plan sheet on 11 × 17 or 24 × 36: the plan to scale with the street at the bottom, north arrow and scale bar, vicinity map, title block, program at a glance, site data and land use by zone, program and parking, parcels and owners, notes from the site's own data (flood zone, districts, traffic, environmental records), legend and a feasibility-only disclaimer.
- The CAD (DXF) export also carries the zones, trees, walks and building names.

### 1:17 PM CT: Site plans laid out like real sites (de724e2)
- **Buildings square up with the lot** instead of tilting to its longest line, so a lot with one slanted street edge no longer gets crooked buildings.
- **The building sits near the street** with its parking in front of it, behind it, or beside it (the three options). Before, "parking in front" pushed the building to the back of the lot.
- **No size given means a typical size** for that use on a lot that size (say "as big as fits" to fill the site). Before, "2-story medical office" on 27 acres filled it with 450,000 sf.
- **Detention is a strip along the back** (or behind the buildings on a big lot), sized to the land the project covers, not the whole lot.
- **One parking field with at most two driveways**, instead of scattered lots each with its own drive.
- "Turned 90°" is replaced by **Parking beside**. Pieces you add by hand also line up with the lot.
- A warehouse that fills the site keeps its truck court.

### 12:29 PM CT: Projects and site plans, with Build with AI (1112f7d)
- **Start Site Plan** on every property card (Site Tools): start a new project or add the parcel to an existing one, and the plan opens on the parcel's outline (Regrid's outline in Harris and Waller once you've opened Regrid details, or draw the site yourself).
- **Build with AI:** describe what should go there ("25,000 sf retail strip", "200 apartments, 3 stories", "warehouse with truck court, as big as fits"). The AI sets the program (use, size, floors, parking ratio, setbacks) and the app lays out three options on the lot, each with its floor area, parking and coverage. The layout itself is measured by the app, not drawn by the AI. Without AI it reads your words directly.
- **Draw by hand:** buildings, parking (spaces counted as you size it), drives, truck courts, detention and landscape. Drag, resize and turn pieces on the map, type exact sizes, undo and redo. Buildings show in 3D when the map is tilted.
- **Checks and numbers:** setbacks by street, side and rear (the street side comes from the map's roads, or you pick it), buffers, overlaps, parking needed vs provided, coverage, FAR, detention, open space, and zoning limits when Regrid has them.
- **Exports:** CAD drawing (DXF, opens in AutoCAD, CADCraft and other CAD programs), map file (GeoJSON) and a text summary.
- **A new Projects tab** (and a Projects tile in the phone's More menu): every project with its status, parcels, options and notes.
- **Ask AI** can start or build a site plan on the open parcel ("how many apartments fit on this lot?").
- Projects are saved in this browser for now; team sharing turns on once the projects table is added to the team database.

## 2026-10-05

### 3:55 PM CT: The app's own cursors (3c1c458)
- **A branded cursor set** across the app (mouse and trackpad; phones and tablets have none):
  - a dark arrow everywhere;
  - a green arrow over anything you can click to open or select;
  - four arrows while you drag the map;
  - the small building cursor at street zoom when a click opens that building.
- **Each selection tool has its own cursor:** a crosshair with a dashed box for Area, a shape for Shape and a circle for Radius, and a green arrow with a county for County.
- Text boxes keep the normal text cursor. If a browser can't show a custom cursor it falls back to the usual one.

### 3:46 PM CT: Environmental report gets the street map too (0a64ad3)
- The **Environmental screening report** (added earlier today) now opens with the site on a street map, like every other report.

### 3:32 PM CT: Street maps in every report, and a new Market tab (58ddc6f)
- **Report PDFs now show a real street map** (roads, towns, labels) with the area outlined, instead of a bare outline on grey. This covers the FEMA, crime, traffic, drive-time, air traffic and flight reports, the Summary report's filings map, the Area Comparison (each area in its colour), the Market report, and the airport and City / County Crime reports (a locator map).
- **The Market tab is rebuilt**, with buttons to jump between sections:
  - **Overview:** headline tiles with their change and a small trend line (construction under way, starting in 90 days, homes permitted, new businesses, jobs, population, typical rent, unemployment, building material prices). Below them, **What's moving** lists the biggest changes in plain words, and **Ask AI for a market brief** asks the assistant to sum them up.
  - **Construction pipeline (new):** value under construction each month, including what's already scheduled for the next year; by use and by county; the largest projects and those starting in the next 90 days. Click a project to open it on the map. A filing with an obviously mis-entered value (the $6.5B Garth Road entry) is left out of the totals and named.
  - **Growth & demand:** homes permitted, now split into single-family, 2–4 units and apartments, plus new businesses, jobs by industry, city sales tax and consumer spending.
  - **Housing & rents (new on this tab):** census home values, incomes, rents and vacancy, household income bands, Zillow rents by ZIP, and the Houston for-sale market.
  - **Costs & rates:** five years of building material prices (lumber, steel, concrete, copper and building materials overall) and interest rates, up front instead of behind a tab.
  - Every chart shows its numbers on hover; bars with a breakdown open it on click.
  - **Export PDF** includes a street map of the area. **Export Data** now also has the pipeline, housing, rents and material costs.
- The construction filing list starts in November 2024, so the tab doesn't compare construction under way with a year ago yet. That comparison would be inflated while the list fills in.
- Ask AI's market answers now cover the pipeline, rents and material costs.

### 3:28 PM CT: Shorter property card (9bc91fa)
- **Removed from the property card:** the Airports Nearby and Air Traffic sections, and the "Air" jump button at the top of the card.
- Construction filing cards still show both.
- For a property, the Air Traffic Report is still available under the card's Area reports.

### 3:07 PM CT: Shift-clicking a parcel no longer adds it again; numbers sit in the middle (19683df)
- **Fixed:** Shift-clicking open ground in a parcel that was already picked added it again, with a new number each time. In one Waller case that put ten numbers in one parcel.
  - **Why:** a parcel picked as open ground was recognized only by the exact spot clicked, so a click a few steps away counted as new.
  - **Now:** a Shift-click anywhere inside a picked parcel takes it out, the same as for buildings. Two quick clicks in a parcel that hasn't loaded yet are merged as soon as it loads.
- **Numbers sit in the middle** of each picked parcel or building, not where you happened to click. For L-shaped parcels, or parcels in two pieces, the number goes in the widest part.
- Parcels picked as open ground keep a faint outline while you look at another tab, so each number has a shape around it.
- Shift-click on a watchlist marker now adds it to the selection too.
- A new automated test uses a real Waller County parcel, plus L-shaped and two-piece parcels. The change was also checked in a browser by Shift-clicking neighbouring Waller parcels.

### 2:44 PM CT: Tidier legends and small fixes (33ed15e)
- **Shorter map legends:** the Businesses & Places and Environmental Sites legends are now two compact columns instead of two tall lists covering the map.
- The small popup on an environmental site closes when you open its Environmental report.
- Officer titles from the Comptroller are spelled out ("Vice President" instead of "Vice-Presi").
- Groundwater-restriction areas are drawn with more accurate outlines.
- Checked in a browser with real data: the Businesses & Places dots, the place card, the environmental site dots, the popup and the Environmental report all show and open correctly.

### 2:31 PM CT: Google maps, Google 3D and Google place search, ready for keys (503d184)
- **Google base maps:** "Google" and "Google Sat" buttons under Base Map, with Google's logo and map credits shown while they're on.
- **Google 3D:** Google's photorealistic 3D city replaces the simple building blocks at street zoom (tilt the map). Clicking a building still opens its property card.
- **Google in search:** a Google section in the search results. Picking one switches to the Google map and opens a Google place card: address, phone, website, opening hours, rating and a link to Google Maps.
- **Nothing shows until Google keys are added to the site** (two keys: one for the browser, limited to this site's address, and one for the server). Place searches are capped each month (900 place cards and 9,000 searches by default) to stay inside Google's free monthly use.
- **Fixes to the 2:08 PM release:** the soils part of the Environmental report timed out (the site outline was sent the wrong way round); company names cut off at 50 characters now match; cities, counties and school or utility districts are no longer sent to the Comptroller.

### 2:09 PM CT: Market tab follows your selection, map legends, property card fixes (5811648)
- **Market tab opens on what you've selected on the map:** a county, several counties together, or the county a drawn area sits in. With nothing selected it shows the whole region. Picking a county on the tab still works.
- **Every Market chart shows its numbers on hover**, including the Correlation explorer's lines and lead/lag bars and the small trend lines in the Markets and Rates tables.
- **Correlation explorer redesigned:** the choices and verdict sit on the left and the chart on the right at a normal size (it used to stretch across the whole page with oversized text). The method note is folded under "How this is measured".
- **Newest business locations** moved to the bottom of the Market tab and show 10 at a time, with "Show 10 more".
- **Legends for Rain radar and Flood zones** in the bottom-left corner. The flood legend uses FEMA's own colors and plain labels (100-year floodplain, floodway, 500-year zone).
- **Map Layers (More) opens right under the quick layer buttons** on the left, restyled, with a close button. Clicking More again now closes it (before, it reopened).
- **Clicking a developer or contractor on Activity, or dragging across the Timeline chart, turns the filings on** so the projects show on the map.
- **Property card:**
  - The section buttons (Value, Building, Site, Crime, Area…) now land with the section's heading visible. Before, the heading was hidden under the card's header.
  - Switching police department in the crime section keeps it in place instead of jumping down out of view.
  - The **Add** button (pick more items) restyled to match the card's buttons.
  - **Fixed: a one-storey building in Waller read as 651 ft and 51 floors.** The lidar height is now checked before it's used. A reading that doesn't fit the building, such as hundreds of feet with nothing else showing a tall building there, is set aside with a note. The app also rejects malformed lidar responses, the likely cause here, and ignores stray specks (birds, wires).
- **The selected building's green highlight no longer flickers** while zooming or orbiting. It now sits half a metre outside every wall instead of overlapping the grey building.
- **Area at a Glance** zoomed in on a single block now shows the census tract you're in, instead of saying there's no data.

### 2:08 PM CT: Environment layers, Environmental report and company owner lookup (41791f9)
- **New Environment section in Map Layers:**
  - **Environmental Sites:** state and federal cleanup and contamination sites (Superfund, hazardous waste cleanups, voluntary cleanups, brownfields, dry cleaner cleanups, leaking petroleum tanks, landfills, and areas where groundwater use is restricted). A picker switches to registered petroleum tanks or EPA-permitted facilities. Click a dot for its program and ID.
  - **Oil & Gas Wells, Pipelines** from the Railroad Commission, **Wetlands** from the US Fish & Wildlife Service and **Soils** from the USDA soil survey.
- **New Environmental Report** for a selected area, a radius, or a property's own parcel (Area reports on the property card): every record within the distances a Phase I assessment searches (¼ to 1 mile from the site's edge), nearest first with distance and direction, plus wells (including orphan wells), pipelines (operator, product, size), wetlands and soils with their building limits. Exports as PDF or CSV. It screens public records; it is not a Phase I.
- **Company behind the owner:** when a property's owner is a company, the card shows its Texas status, where and when it was formed, registered agent, mailing address and officers or members, from the Texas Comptroller's free records. Works with the Regrid owner in Harris and Waller too. People's names are not looked up.
- All of this is free public data; no new keys needed.

### 2:01 PM CT: Crime library loads at a polite pace (c48b6a1)
- **Fixed:** the first load asked the FBI for data far too fast (about 65 requests a second). After about 150 Alabama departments the FBI stopped answering. The load was stopped; the app itself was not affected.
- The loader now asks at most 5 times a second. If many departments fail in a row it pauses, and after a few pauses it stops until next week instead of retrying straight away.
- A full load now takes about six hours, split over two back-to-back runs. Departments already loaded are kept.

### 1:50 PM CT: Area at a Glance shows your selection; traffic reports for whole counties (6405bd9)
- **Area at a Glance follows what you've selected:** pick a county (or draw an area, a radius or a shape) and the panel shows that area's population, income, home value, rent, households and jobs, with its name in the heading. With nothing selected it still shows the map view; clearing the selection switches back.
- A very small selection (smaller than a census tract) shows the numbers for the tract it sits in.
- **Fixed: "That area is too large for a traffic report" on a county.** The limit was 250 square miles, smaller than any county here (Waller is about 520). It is now 5,000 square miles, enough for Harris County or a few counties together.
- **Incidents in a county traffic report are only the ones inside the county**, not on roads in the neighbouring counties that fall in the same box. Large areas look them up in several pieces so the live incident service accepts them.

### 1:45 PM CT: Businesses & Places layer from open data (c27cf86, 3c7b07a)
- **New map layer, Businesses & Places:** about 300,000 businesses and places across the seven counties, colored by kind (food, retail, health care, offices, construction and home services, industrial and farms, and more). It shows from street zoom; pick one kind from the list under the switch.
- **Click a dot** for a card with the name, category, address, phone, website, the sources that list it, a link to Google Maps and a button for the building and parcel there.
- **Property cards list many more businesses:** the open data is added to OpenStreetMap's list, and each one opens its card.
- **Search finds these businesses by name**, closest first, before the OpenStreetMap and Comptroller results.
- **Where it comes from:** Overture Maps (which already includes records from Meta, Microsoft, BrightQuery and Foursquare) and, once a free Hugging Face token is added, Foursquare's own open dataset. Both are free and refreshed monthly. Closed places and pins without a street address that are probably service-area businesses are left out, and the same business from two sources is shown once.

### 1:39 PM CT: Crime library and state rankings (1cb349e)
- **The app now keeps its own copy of the FBI crime figures** for every city and county police department in the US (about 11,000 of them, 2015 to 2025). A weekly job refreshes each department once a month. Departments not loaded yet are still looked up live, as before.
- **Faster crime sections** on property cards once a department is in the library.
- **State rank on the card, report and PDF:** e.g. "Among 640 Texas city police departments (2025): violent crime lower than 58% of them, property crime lower than 81%." Only whole-year departments with at least 2,500 residents are compared.
- **Ask AI can rank places:** "safest cities in Texas over 50,000 people", "Louisiana counties with the most property crime".
- The library fills over the first run (roughly an hour or two); rankings and state ranks appear as each state finishes.

### 11:49 AM CT: The app reads the government data key (GOV_API_KEY) (6dd783b)
- **Crime by city / county now has a backup:** if the FBI website's feed is down or changes, the app switches to the FBI's official data service using the api.data.gov key saved on Vercel as `GOV_API_KEY`. Nothing changes on screen.
- The same key can be reused for other federal data services later; the app reads it from one place.

### 11:40 AM CT: Behind the scenes: checking new free data sources (28666a6, e87ab6c)
- No change in the app yet. Added a server-side check of the free environmental and business-registration services (state environmental agency, Railroad Commission, wetlands, soils, EPA, Texas Comptroller) so they can be added next.

### 11:31 AM CT: Crime by city / county, anywhere in the US (9540c9f, 6bc25ce, e36d54c)
- **Property and parcel cards now show crime anywhere in the US**, under the Houston street-level section:
  - the local police department: the city's own police inside city limits, otherwise the county police or sheriff;
  - violent and property crimes per 100,000 residents for 2025 (the newest full year), compared with the state and the US, and the change from 2024;
  - a 10-year trend against the state and the US, and the share of crimes solved;
  - a list of the other departments in the county to switch to (a neighboring city, or the sheriff).
- **New City / County Crime Report** (Reports tab, or **Full report** on the card): year-by-year table, offense mix (murder, rape, robbery, aggravated assault, burglary, theft, vehicle theft, arson) against the state and the US, exported as a PDF or CSV.
- **Ask AI answers crime questions outside Houston**, e.g. "How does crime in Hempstead compare with Texas?"
- **Clear labels:** every view says the figures are yearly and department-wide, which year they cover, and warns when a department reported only part of a year or has stopped reporting (New Orleans' newest year is 2023, for example).
- Checked against live FBI data for 24 places, including Houston, Brookshire, Hempstead, Katy, rural Waller County, New York, Washington DC, Nashville, Fairfax, Los Angeles, Chicago, Louisville and Honolulu.
- Source: the FBI Crime Data Explorer (no account or key needed), listed on the Sources tab.

### 11:08 AM CT: FBI crime data check (d9d7c59)
- Behind the scenes only: a diagnostic that tests which FBI Crime Data Explorer feeds still answer, ahead of crime numbers by city and county for the whole US. Nothing in the app changes yet.

### 11:06 AM CT: Clicking a building selects only that building again (71f0f33)
- **Fixed:** clicking a building could highlight and measure many unrelated buildings around it. In one Waller example that was about 260,000 sq ft of buildings across the screen, on different parcels. The card's size, floor area and overview used that wrong total.
- **Why it happened:** the whole-building selection added on Oct 4 assumed every map piece sharing the clicked building's ID belonged to that building. The map stores many separate nearby buildings under one ID, so the selection picked up all of them.
- **Now:** the selection starts from the building under the click. It only adds a piece from a neighbouring map tile when that piece continues the same building across the tile edge, so big buildings cut by a tile edge are still selected whole.
- When the building's OpenStreetMap outline arrives, it now always replaces the map's guess, as long as the outline covers the click.
- A new automated test recreates the Waller case: one map feature holding many separate buildings, plus a large building cut by a tile edge. The old code fails it and the new code passes.

### 8:23 AM CT: Correlation explorer no longer overstates links (19061b3)
- **Fixed two flaws that made unrelated series look related:**
  - **Quarterly house prices** skipped the correction for overlapping year-over-year changes. They came out "strong" against 24 market series, including oil companies and the Fed rate. None of those hold up now.
  - **One extreme month could carry the result.** Month-over-month, the spring 2020 crash made Houston unemployment and jobs look tied to 28 of 42 market series. The explorer now compares changes by rank, so a single shock month can't decide the verdict.
- **A best fit at the 12-month limit is rated weak at most.** It usually means two series share a slow trend, not that one leads the other.
- **Month-over-month results now carry a warning.** Most Houston numbers aren't seasonally adjusted, so year over year is the safer comparison.
- With these fixes, Houston unemployment vs oil comes out **weak** (oil about 2 months ahead), not moderate. Checked against all 42 market series, no Houston measure has a reliable year-over-year match.
- Houston crime history now reaches back to mid-2020 (six years), loaded this morning.

## 2026-10-04

### 12:33 PM CT: Markets, the Correlation explorer and more history on the Pro plan (2f8543b, c68491f, 9c11def)
- **Markets on the Market tab.** A new section lists the latest prices, with today's change, the past year's change and a small chart, in groups:
  - oil and natural gas;
  - Houston companies (ExxonMobil, Chevron, ConocoPhillips, SLB, Halliburton, CenterPoint and others);
  - homebuilders and real estate funds;
  - building material prices (lumber, steel, concrete, copper);
  - rates (30-year mortgage, 10-year Treasury, Fed funds);
  - stock indexes (S&P 500, Nasdaq, Dow, Russell 2000, VIX);
  - crypto (Bitcoin, Ethereum, Solana, XRP);
  - Houston metro numbers (jobs, unemployment, housing permits, listing prices, homes for sale, days on market, house prices).
  - Crypto prices are live and refresh every minute. Stock prices are delayed and come from an unofficial Yahoo Finance feed. Ten years of history are refreshed nightly.
- **Correlation explorer.** Pick a Houston measure and a market series to see whether they move together and which one moves first, up to 12 months ahead.
  - It compares changes, not price levels. It discounts for every lead and lag it tries and for overlapping months, and a strong link has to hold in both halves of the period.
  - Example with real data: Houston unemployment and oil come out *moderate*, with oil moving one month first. Much of that is 2020.
  - **What moves …?** checks one measure against all 42 market series and is honest about how often chance produces a match. For Houston unemployment, nothing passes once all 1,050 comparisons are counted.
  - The app's own data can be used too: Houston crime, construction filings and their value, new businesses and City of Houston sales tax.
- **Explain with AI**, and two new assistant skills:
  - The assistant can now quote market prices ("how is oil doing this year?").
  - It can run the correlation test and explain the result ("does oil lead Houston unemployment?", "what moves housing permits?"), including what the result doesn't prove.
- **More history now that the database is on the Pro plan:**
  - The Houston crime trend keeps six years instead of two, filled in by the next nightly live-data run.
  - The Air Traffic Report can cover up to three years instead of 13 months. Keeping the extra history needs a database update that is waiting to be applied.
  - The statewide filings loader can now reach further back in time. It hasn't been run yet because the AI reading of each filing has a cost.
- The Market PDF report includes the Markets table and the Correlation explorer, and fits phone screens without sideways scrolling.

### 12:23 PM CT: Building tabs and the parcel list combined with the faster property cards (80bd541)
- Brought together two sets of changes made in parallel. The property card still shows the owner and value first, and the "this building sits on N parcels" list now fills in when the second, slower lookup finishes (a second or two later).
- Shift-click tabs, the **All** tab and the whole-building selection work with the faster two-step lookup.
- Fixed while combining: picking the same parcel twice (on open ground) is recognised as the same one again, so it toggles off instead of adding a duplicate tab.

### 12:02 PM CT: Phone layer buttons get their own row (7f9b530)
- **On phones, the quick layer buttons (Satellite, 3D, Parcels…) moved up** into the empty band just under the search bar, instead of sitting between the map buttons on the left and right.
- The row runs edge to edge and swipes sideways. The faded right edge shows there are more buttons, and the last one (More) scrolls fully into view.
- **The filings count** ("1,161 filings · $7.47B") moved out of that band. It now sits centered between the two columns of map buttons.
- Search results and the assistant's answers still open over the row. Desktop and tablet are unchanged.

### 11:00 AM CT: Clean start, honest layer buttons, Compare each county, Market area picker (abff29a)
- **The map opens without construction filings or planes.**
  - Before, a reload often showed filing dots with the Filings button off. The app writes its default date filter into the page address, and on load any filter in the address turned the dots on.
  - A filings heatmap or Live Planes saved from a past visit also came back on by themselves.
  - Now filings and planes stay off until you turn them on. A shared link that carries real filing filters still opens with the filings shown.
- **The quick layer buttons always match what's on the map:**
  - **Filings** lights up for the dots or the heatmap, and turning it off hides both.
  - Layers without their own button (crime, airports, weather, low flights) are counted on **More**, for example "More · 2", and hovering over it lists them.
- **Compare each county separately.** With two or more counties selected, the selection bar offers **+ Compare Together** (one combined area, as before) and **+ Compare Each (N)**, which adds every county as its own area, up to Compare's 4. The Compare tab has the same choice.
- **A new area picker on the Market tab** replaces the dropdown:
  - a small map of the seven counties you can click, beside a button for each county and **Whole region**;
  - click the selected county again to go back to the region;
  - on phones the buttons scroll sideways.

### 3:06 AM CT: Every report exports as a branded PDF (10f4eb1, 15bda9f, d2af0a0)
- **Reports now download as real PDFs in the Finishes Solutions style.** This covers construction filings (Summary, Filing List, Area Comparison, Activity), Market, Crime, FEMA, Traffic, Drive-Time, Air Traffic, Airport and Flight reports.
  - Before, most reports saved a web page that you had to print to PDF yourself.
- **One look for every report:**
  - a dark title band with the white Finishes logo, a faint blueprint grid and the green rule;
  - Montserrat and IBM Plex Mono throughout;
  - headline figures in tiles with a green edge, and section headings with a short green bar;
  - clean tables whose column headers repeat on every page;
  - a footer on every page with the report name and page numbers, and a "Building a Future Together" sign-off at the end.
- **Portrait pages by default.** The full Filing List is landscape because its ten columns need the width, and so is an Area Comparison of four or more areas.
- **The PDF text is real text:** you can select it and search it, and charts and maps stay sharp at any zoom.
- **Very long lists:** a PDF Filing List shows the 2,000 largest filings (1,000 when added to a Summary report) and says so. Excel and CSV still have every filing. All 10,853 filings would be about 1,000 pages.
- The **Export Report** buttons on report cards now read **Export PDF**. The Reports tab's Market card offers **PDF** and **CSV**.
- If the PDF service can't be reached, the report is saved as a web page instead, with a note to use Print → Save as PDF.
- A PDF takes a few seconds to prepare (up to about 8 seconds for the first one after a quiet period).

### 2:30 AM CT: Plane routes back, faster property cards (95ca452, deb979b)
- **Plane cards show routes again.** Since adsb.lol's route lookup stopped answering, every plane said "Route not in the database."
  - Routes now come from the Virtual Radar Server community route list, the same data adsb.lol used.
  - Multi-stop flight numbers pick the leg the plane is flying, using where it is, its heading and whether it's climbing or descending. For example, AAL2302 (Chicago → Houston → Chicago) shows **ORD → IAH** while descending into Houston, and UAL382 shows **DCA → IAH**.
  - Routes that don't match where the plane is are still left out. In a check of six flights over Houston, four got a correct route, compared with none before.
  - With no usable route, the card says **From IAH · destination not listed** when the flight path shows where the plane took off.
- **The owner and value on a property card show up faster.**
  - The appraisal record is now fetched on its own and shown as soon as it arrives, usually in a second or two.
  - Before, it waited for the slowest part of the card. In one test the OpenStreetMap business lookup took 27 seconds.
- **The business lookup gives up on a stalled server sooner.** The next OpenStreetMap server is asked after 2.5 seconds instead of waiting out a 9-second timeout, so a stalled server costs about 3 seconds instead of up to 27.
- A failed business, height or parcel lookup is retried after a few minutes instead of being remembered for a day.

### 2:07 AM CT: A subtler dot grid (8849314)
- **The dot grid is quieter:** smaller dots, set a little closer together, at well under half the old strength, so it reads as texture rather than pulling the eye. The home county's green dots stay a bit stronger so it still stands out.
- The product guide now lists the whole-building selection and card tabs under Recently added.

### 2:02 AM CT: Whole buildings, buildings on several parcels, and tabs for several selections (37897ab)
- **Clicking a big building now selects all of it.** The map draws large buildings (warehouses, shopping centers) in pieces at its tile edges, so a click used to pick only the piece under it, often about half the building. The app now joins the pieces as soon as you click, then switches to the full OpenStreetMap outline when the details load.
- **Buildings on more than one parcel:**
  - The lookup now finds every parcel under the building (up to 10), not just the one at the point you clicked.
  - The card lists each parcel with its owner, acres and value, plus a total. The overview says how many parcels the building spans and their combined value.
  - All of the parcel outlines are drawn dashed on the map.
- **A livelier selection:** the picked building rises out of the ground in green, with a soft glow pulsing around its base. Motion is skipped if your device is set to reduce motion.
- **Select up to 10 things at once, each in its own tab on the card:**
  - Works for buildings, parcels, construction filings, planes and airports, and you can mix them.
  - Shift-click adds. On a touch screen, tap **+ Add** at the top of the card, tap the other things (the card drops low so the map is free), then **Done**.
  - The tabs are numbered, and the same numbers mark the buildings on the map. Tap a tab to switch, or its **×** to remove it.
  - Shift-click something already picked to drop it. A plain click starts over; closing the card clears everything.
  - With two or more buildings or parcels, an **All** tab totals footprint, floor area, market value and acres (each parcel counted once), with the filings on them, a CSV export (now with a parcel count per building) and **Zoom to All**.
- **Fixed: Shift-click did nothing on the map.** The map's Shift-drag box zoom was swallowing every Shift-click, so the old "Shift-click to select several buildings" never actually reached the app.

### 1:30 AM CT: Filters for the map's layers, and freeze fixes (690491d)
- **Filters now cover the map's layers, not just construction filings.** The panel has a section per kind of data:
  - **Demographics:** income, population growth, home value, rent, vacancy, jobs.
  - **Traffic:** the busiest road in vehicles a day.
  - **Risk:** all flood zones or only the high-risk 100-year floodplain, and the crime type in Houston.
  - **Construction filings:** the filters from before, plus the number of projects in an area when matching.
- **Two ways to use them** (the switch at the top):
  - **Filter each layer:** demographic thresholds fade the neighborhoods that don't qualify, the traffic threshold hides quieter roads, and the risk choices change the flood and crime layers. Setting a filter turns its layer on.
  - **Match everything:** census tracts that meet every threshold are outlined in green and the rest of the map fades. For example, income at least $100K and growth at least 5% gives 213 of 1,417 areas. The panel shows the count and offers **Zoom to matches**.
  - Busiest road and FEMA flood risk per area come with the nightly data refresh (checked monthly). Until the first refresh after this change, they're left out of matching, and the panel says so.
- **Clear and Clear All reset the layer filters too.** The summary at the top of the panel lists everything that's on.
- **No more freezes when selecting a big area:**
  - Picking Harris County with the County tool used to lock the page for about 3 seconds, and again on every filter change after that. The app's own work now takes about 15 thousandths of a second.
  - Counties now match on each filing's own county, and other areas use a much faster inside-the-area test (about 100 times faster). The same speed-up applies to Compare, exports and searched places.
- **Live planes are much lighter:**
  - The plane icons refresh about 4 times a second instead of 12–30, unless you're following a plane or showing its path.
  - The 3D models still move smoothly.
  - Everything pauses while another tab hides the map.
  - Turning planes on no longer stalls while their icons are drawn.
- **Following or orbiting a plane no longer floods the app with reloads:** in a test, 37 airport reloads in 3 seconds became 3. Airports, traffic counts and the exact county lines now reload once the map settles, and cancel the previous request.
- **Turning Airports, Traffic Counts or Crime off and on no longer stacks up duplicate handlers.** Before, a click on an airport could open its card several times.
- Filing dots are no longer rebuilt in the background while they're hidden.

### 1:06 AM CT: Phone More menu as tiles, simpler phone Filters (bdb0916)
- **The phone More menu is a grid of one-word tiles,** named like the desktop tabs.
  - **Views:** Market, Compare, Reports, Updates, Notes, Sources.
  - **Tools:** Layers, Export, Saved, Nearby, Pin (a site note at your location), Theme, and Install when the phone offers it.
  - Counts show as badges on the tiles.
- **The desktop Field Notes tab is now called Notes,** to match.
- **Filters on phones is a full-height sheet:**
  - A short header with **Clear All**, and the sections in one simple list. "More Filters" is no longer hidden behind a click.
  - A big **Show N filings** button at the bottom shows how many filings match and closes the sheet.
  - The sheet opens just under the search bar, so its title and close button are no longer covered.

### 12:58 AM CT: Plain-language product guide (40a0948)
- **New: `PRODUCTDOC.md`,** a plain-language guide to the whole app. It covers what it is and where it works, the screen layout, property lookups, area reports and clearing the view, map layers, planes and airports, market data, construction filings, Ask AI, reports, field notes, where the data comes from, and what to keep in mind.
- It will be updated with every change people can see, so it stays current as the app grows.

### 12:15 AM CT: Phone map fills the screen, no sideways scrolling in menus (43c0e4d)
- **The map now fills the phone screen:**
  - It runs right up under the clock and battery, with a soft fade so they stay readable, and down to the bottom bar. The grey bands above and below the map are gone.
  - The search bar also sits higher, just under the status bar. It had been pushed down twice the status bar's height.
- **Map Layers no longer slides sideways on phones:** the crime type picker was showing even with Crime off and stuck out past the panel's edge. It now only appears when Crime is on.
  - The panels and sheets (Map Layers, Filters, More, Explore) now only scroll up and down.
  - The row of quick layer buttons still swipes sideways on purpose, since they don't all fit across a phone.

## 2026-10-03

### 11:48 PM CT: Quick layer buttons, one-click Clear, dot grid everywhere, a general real estate layout (3667dc3)
- **Quick layer buttons under the map search:**
  - Satellite, 3D, Parcels, Flood Zones, Demographics, Traffic Counts, Filings, Planes and Radar, one tap each.
  - **More** opens Map Layers, which keeps every layer and the finer options: the demographic measure, crime type, filing dot size and heatmap, basemaps, live weather and so on.
  - The buttons and the panel always agree. A layer turned on from the panel or by the assistant lights up its button too.
- **Map Layers is regrouped:** Base Map, Property & Site, Demographics, Construction Filings, Map Display, then Live Conditions. While it's open, the map's search and buttons make room for it instead of sitting underneath.
- **Clearing the view takes one click:**
  - The **Clear** button next to Filters now shows whenever anything narrows the view: filters, a period other than the last 12 months, a time-lapse month, a selected area, or a searched place's outline.
  - Hover over it to see exactly what it will clear. On phones there's a ✕ next to the filter button that does the same.
  - Inside the Filters menu, **Clear All** is now at the top, so there's no scrolling down to reset.
- **The dot grid covers everything:**
  - The halftone dot pattern now covers all land at every zoom level and on every basemap, not just the 7 home counties. The sea stays clean, and Waller County's dots are green.
  - On satellite imagery the dots are white and fainter. Turn them off with **Dot Grid** in Map Layers (the setting is remembered).
- **Less filing-centric by default:**
  - The left panel opens with Area at a Glance, which now shows numbers at the regional zoom level too, and a new **This Area** box: the map view or the selected area, with its area reports, Compare, Save Search and Copy Link. These used to be hidden inside the collapsed Construction Filings section.
  - Construction Filings is still there, collapsed, as one layer among many.
  - Tabs run Map, Market, Compare, Reports, Field Notes, then the filing views (Timeline, Activity, Updates) and Sources.
  - The intro and footer describe the whole platform, not just TDLR filings.

### 11:31 PM CT: County lines for the whole US, planes in 3D (feaf75b)
- **County and state lines now cover the whole country:** all 3,224 counties outside the 7 home counties, with state borders a little heavier.
  - Labels read like "Brazos Co., TX" (parishes in Louisiana) and show from about the regional zoom level.
  - Zoomed in to about city level, the lines switch to the exact Census boundaries for the area on screen. If those can't be loaded, the lighter national lines stay.
  - The home counties keep their highlighted outlines.
  - The **County Lines** switch in Map Layers turns all of it on and off.
- **Planes are 3D models when the map is tilted:**
  - Each plane is shown at its real altitude, pointing where it's flying.
  - Planes tip their nose up when climbing and down when descending, and bank into turns.
  - Each kind of aircraft has its own model: airliners, jumbo jets, business jets, military transports, fighters, turboprops, small planes, helicopters, gliders, balloons and drones. A 747 is clearly bigger than a Cessna.
  - Up close, planes are true to scale. Zoomed out, they stay about icon size so they're easy to see.
  - A thin line drops from each plane to the ground. The flat icon underneath turns into a grey shadow that keeps the callsign and altitude.
  - Click or hover over a model in the air for the plane card.
  - The flat map still shows the flat icons, same as before.

### 2:19 PM CT: No more zooming out to the whole world, more businesses, more crime statistics (31908c8)
- **Fixed:** opening a drive-time map, showing a crime, FEMA or traffic report's area, or other area outlines could zoom the map all the way out to the whole world. Some outlines are drawn in the opposite direction, and the map read them as "everything except this area". It now zooms to the area itself.
- **Businesses on property cards:**
  - The search reaches about 150 m instead of 80 m, so large buildings, shopping centers and strip malls show their tenants.
  - Up to 30 nearby businesses are listed instead of 8.
  - When the main OpenStreetMap server is busy, two backup servers are tried before giving up. Before, a busy server meant an empty list. The map's "nearby" business search uses the backups too.
  - The list still depends on what's mapped in OpenStreetMap, which is thin in some suburbs. The registered businesses at the address (Texas Comptroller) are still listed below it.
- **Crime reports have new sections:**
  - **When it happens:** incidents by hour of day and by day of week, with the busiest 3-hour stretch and the busiest and quietest days.
  - **Year by year:** each year's incidents and its change, next to Houston's change over the same time. Partial years are compared at their yearly pace.
  - **Per resident:** incidents per 1,000 residents a year, from the census tracts in the area.
  - All of these are in the exported report too, and the assistant can answer from them ("what time of day are break-ins worst here?").
- The hour of day appears after the next nightly data refresh, which reloads the stored incidents once. Day of week and year by year work now.
- **Longer crime history** is ready for when the database is upgraded: set the repository variable CRIME_YEARS (for example 6), and the nightly sync loads and keeps that many years. It's 2 for now.

### 2:00 PM CT: Minimize cards to see the map (a9114ef)
- **Every card can shrink to its title bar:** properties, filings, planes, airports and reports.
  - Tap the **⌄** button next to the ×, or on a phone swipe the card down.
  - The selection stays, and so does everything the card put on the map: a plane you're following, its flight path and 3D path, routes, outlines.
  - Tap the title bar (or swipe up) to bring the card back.
- **Swiping down on a phone** now goes from full height to normal to minimized, and only then closes the card.
- **Following a plane on a phone** keeps it centered in the map above the card instead of behind it, so a minimized card leaves almost the whole screen for the flight.

### 1:19 PM CT: Airports worldwide, air traffic reports and flight reports (3924b91, 3b2ee82, 21d87ab)
- **Every airport in the world is in the app:** 86,158 airports, including all 3,887 in Texas, and 48,000 runways. Turn on **Airports** in Map Layers: big airports show from far out, small fields and heliports as you zoom in.
- **Click an airport for its card:**
  - a photo of the airport;
  - its codes, type and elevation;
  - the weather there right now;
  - every runway (length, width, surface, lighting) with a runway diagram;
  - the radio frequencies.
- **Maps of the airport:**
  - **Show Airport Map** draws the terminals, taxiways, aprons, hangars and runways on the satellite view (from OpenStreetMap).
  - **FAA Airport Diagram** opens the official diagram for about 900 US airports.
- **Airlines and statistics:** the airlines that fly there and how many destinations each serves, plus the airport's own statistics: busiest routes, passengers by year and airline market share (from Wikipedia).
- **Takeoffs and landings per day:** counted from live aircraft positions for airports within about 100 miles of Houston, starting today.
  - Landings are counted on short final, because receivers often lose planes just before touchdown.
  - Small planes without transponders are missed, so the figures are below official FAA counts. The card says so.
- **Property cards show "Airports Nearby".** If a site sits under a runway's approach path, it says which runway and how far out, e.g. "Under the approach path to HOU runway 04, 2.1 nm from the runway end".
- **Air Traffic Report** for any area (Reports tab, selection bar, or Area reports on a building):
  - aircraft sightings a day and the busiest and quietest hours;
  - how much traffic is under 3,000 ft, and the mix of jets, props, helicopters and military;
  - the trend by month, nearby airports and approach paths;
  - what's overhead right now.

  The hourly and aircraft-mix history starts filling in today.
- **Flight Report:** on any plane's card, **Export Flight Report** saves a printable report and a CSV of the track points. The report has:
  - the aircraft photo, type, operator and FAA registration;
  - the route and a flight path map;
  - altitude and speed charts;
  - today's other flights.
- **Each card exports a report and CSV**, and the Reports tab keeps them.
- **Ask the assistant** "tell me about Hobby airport", "what airlines fly out of Sugar Land?", "how much air traffic is over this site?" or "make a flight report for UAL1234".

### 3:11 AM CT: News about the whole place, smarter place-finding, big places fit on screen (8be5eb5)
- **News no longer mixes in people who share a town's name.** A property in Waller was turning up stories about Fed Governor Christopher Waller. Towns are now always searched as "Waller, TX", "Waller, Texas" or "Waller County", never the bare word.
- **The News button searches everything about the place at once**, and each story says what it's about:
  - the project itself and its developer, tenant and owner
  - the businesses at that spot (from the map and from the Comptroller lookup, if you've opened it)
  - the owner on the appraisal record (for example, "SMITH JOHN A" is searched as "John Smith", always tied to the town)
  - the street address and the subdivision
  - development and real-estate news for the town or county

  Results are grouped under those headings. The assistant's news answers work the same way.
- **The assistant works harder to find a place.** "Highlight Terminal B at George Bush airport" now finds the airport, then looks for Terminal B inside it. It knows common nicknames (Bush airport / IAH, Hobby, the Med Center, NRG). If the map still can't find something, it does a web search for the official name and location, then checks that against the map before showing it. Anything placed only from the web search is marked approximate.
- **Big places fit on screen.** Going to or outlining an airport, campus, park or town now frames the whole thing, leaving room for the chat panel and the property card. Before, they were shown at street level. Single buildings and addresses still zoom in close.
- Not checked on the live site yet: this build environment can't reach Google News or OpenStreetMap. Automated tests cover the new search logic.

### 2:50 AM CT: Traffic reports and a Traffic Counts layer (7e269a7)
- **Traffic Counts** in Map Layers: every road TxDOT counts, coloured from green to dark red by how many vehicles use it a day. Zoom in to a part of town to see it, and hover a road for its count.
- **Traffic Report** for any area (Reports tab, the selection bar, or Area reports on a building's Site section):
  - the busiest roads, with vehicles a day;
  - average traffic by road type (interstates, state highways, city streets…);
  - **live speed vs normal speed** on the 8 busiest roads right now;
  - **current crashes, closures and road works** in the area.
- **Export Report** (printable, save as PDF) and **Export CSV**, with every counted road segment. The report includes a map of the area with the roads drawn by traffic.
- **Ask the assistant** "how busy is Westheimer near the Galleria?" or "traffic around this site".
- **Honest limits:**
  - TxDOT publishes only the current year's counts in this data, so there's no year-over-year trend.
  - The counts are annual averages for both directions; hour-by-hour volumes aren't published free.
  - Live speeds and incidents are a snapshot from when you open the report (TomTom doesn't allow storing them).

### 2:41 AM CT: Drive-time maps (5285009)
- **See how far you can drive in 10, 20 or 30 minutes.** Open any building or filing and press **Drive-Time Map** under From Here. Nested green, yellow and orange areas are drawn on the map.
- **Choose when you're leaving:** now (live traffic), a weekday at 8 AM or 5 PM, or Sunday. Rush hour can shrink the areas a lot.
- **Choose the times:** 5/10/15, 10/20/30, 15/30/45 or 20/40/60 minutes.
- **The card shows, for each area:**
  - square miles;
  - people, households, median income and jobs (from Census data, for the counties loaded on the map);
  - how many filings on the map fall inside.
- **Use it as a trade area.** "Select this area" (or clicking an area on the map) makes it the selection. The map's filings narrow to it, and crime, FEMA and other area reports run on that drive-time area.
- **Export Report** (printable, save as PDF) and **Export CSV**. Both are kept in the Reports tab, which now also has a Drive-Time Map card.
- **Ask the assistant** "what's within a 20-minute drive of the Galleria at rush hour?" by text or voice.
- **Sources:** TomTom, with live or typical traffic. If TomTom is unavailable it falls back to OpenStreetMap routing without traffic, and the card says so.

### 2:30 AM CT: Voice assistant is more reliable (ba2b843)
- **No more bursts of place names.** When you were quiet or there was background noise, the voice transcriber sometimes "heard" its own list of local names and flashed them on screen before throwing the turn away. That list is now much shorter. Any echo that still slips in is removed, even when it's tacked onto the end of something you really said.
- **"Listening…" and then nothing should be gone.** Several ways a turn could stall without a word are fixed:
  - Two replies started for one question, and the second was refused.
  - A reply that failed on OpenAI's side was treated as finished.
  - A lookup (an address, a place) never answered.

  Now one reply runs at a time. A failed or never-started reply is retried once, and lookups give up after 20 seconds. If it still can't answer, the panel says so ("No reply came back. Try again.") instead of going silent.
- **If you talk for a while and the transcript comes out garbled**, the assistant answers from your voice. If it didn't catch you either, it asks you to repeat. Short noises are still ignored, now with "Didn't catch that" when something was heard.
- **Long conversations keep going.** OpenAI ends voice sessions at 10 minutes. The app now renews the session just before that, between turns, and remembers what you were talking about.
- **When a place name is ambiguous** ("Katy" the town or Katy Freeway), the options appear as buttons under the conversation. You can tap one or just say it.
- **Voice log:** the Sources tab has a "Save it" button. It saves step-by-step timings of what the voice assistant heard and did in this visit. If voice misbehaves, send that file over.

### 2:25 AM CT: Smooth 3D flight paths, smoother planes, legends, report radius, a richer Market page (f24b9c7, 03b8c3b, b204088)
- **The 3D flight path is a real 3D line now.**
  - It's smooth and sloped, and stays clean as you move, zoom or tilt the map.
  - A **ball marks where the plane is**, at its real altitude.
  - A see-through curtain drops from the path to the ground, and the line on the ground is its shadow.
- **Planes fly smoothly.**
  - Each plane is redrawn every frame from its speed, heading and climb rate.
  - When a new report arrives, any difference is eased out over two seconds instead of jumping.
  - Following or orbiting a plane is smooth too.
- **Legends at bottom left** for anything coloured by data:
  - aircraft altitude, whenever Live Planes is on;
  - the flight path's altitude colours when a plane is selected;
  - the Crime layer;
  - Low Flight Paths.
- **Wrong routes are rejected.** A route from the database is dropped when the plane is heading away from the listed destination, or its flight path took off far from the listed origin. SWA3004 showed New Orleans → Chicago while flying the other way.
- **Crime Report and FEMA Report in the Site section of property cards.** Pick **1, 3, 5 or 10 mi**, then press the report you want.
- **Distances are written as decimals everywhere**: 0.25 mi and 0.5 mi, never fractions.
- **Market page:**
  - **Crime · City of Houston**: 24 months of incidents (violent, property, other), the change from the year before, and the most reported offenses.
  - **Busiest roads**: TxDOT daily traffic counts for the area; click a road to see it on the map. Also average daily traffic by road type.
  - **Charts are interactive.** Hover for numbers, click a bar to pin its breakdown, click legend entries to hide or show a series, and switch monthly charts between 12 months, 24 months and all.
    - A housing year shows its single-family / multifamily split and value per home.
    - A month shows the change from the same month a year earlier, plus that month's new businesses or top sales-tax cities.
    - An industry, spending category or offense shows its share.
  - **The Table buttons are gone.** The sales-tax cities table is now a bar list.
  - **Export Report** saves a printable report (print it to PDF), and **Export Data** saves a CSV. Both appear on the Reports tab, which also has a new **Market Report** card.
- **Fixed: housing permit values were 1,000 times too high.** The Census file already reports dollars.
- **Fixed: San Antonio, Fort Worth and a few other out-of-region cities were counted in the region's sales tax.** A few filings listed them as their city. Only places in the region count now.

### 1:46 AM CT: Filters in a popup, crime on property cards and in Reports, long flights framed right (2dd8bfa)
- **Filters are now a popup.** Use the **Filters** button in the map toolbar, between County and Export:
  - it shows how many filters are on;
  - a **Clear** button next to it resets them all in one click;
  - the popup closes when you click away or press Esc.
  - Changing a filter puts the construction filing dots on the map, since that's what filters apply to.
  - On phones, the filter button opens the same filters as a sheet.
- **Property cards have a "Crime" pill**, showing incidents reported within 1 mile:
  - totals for the last 12 months and the change from the year before;
  - violent and property crime, and how the area compares with the Houston average;
  - the top offenses and the most recent incidents.
  - One click opens the full crime report or the crime map layer.
  - The data covers the City of Houston only, and the card says so elsewhere.
- **Crime Report moved to the Reports tab**, and is no longer in the left panel. Run it for:
  - the selected area;
  - the current map view;
  - or an area you draw.
  - Its printable report and CSV exports now appear under **Previously Exported**.
- **Fixed: long flights showed the far side of the globe.** Selecting a plane on a route like Houston → Taipei now centres the map on the route itself.
- **The left panel matches the new card style throughout.** The "Sq ft filed" figure reads 213M instead of a cut-off number.
- **New releases show up on the first reload.** Previously the app's offline cache kept showing the old version until a second reload. Now, when a new version arrives right after the page opens, it reloads by itself; later in a session, a message says a new version is ready.

### 1:27 AM CT: Plane photos, details and 3D flight paths from adsb.lol; FlightAware removed (7d211b6)
- **Plane cards now show:**
  - **a photo of the actual aircraft**, credited to its photographer and linked to planespotters.net;
  - **who operates it and the year it was built**, and whether it's military.
- **This flight's path is drawn on the map**, coloured by altitude: grey on the ground, orange when low, yellow when climbing, blue at mid altitude, green at cruise. It follows the plane as it moves.
- **In 3D (tilt the map, or press "View the path in 3D" on the card)**, the path floats at the plane's real altitude, with a see-through curtain down to the ground. You can see exactly where it climbed and descended.
- The card lists **when the flight departed, how long it's been flying, its highest altitude, and how many other flights it made today**.
- **Ask the assistant** "show me N123AB's flight path" or "where has that jet been today?". It draws the path in 3D and names the towns where today's flights started and ended.
- **FlightAware is no longer used.** Everything above comes free from adsb.lol and the photo databases its own map uses, so there's nothing to pay or cap. The FlightAware link on plane cards is gone too.
- **Military transports** (C-17, C-130, tankers…) get their own outline. Fighters and military helicopters keep theirs. All plane icons are a little larger.

### 1:23 AM CT: FEMA flood layer and FEMA reports (5986bb1)
- **Flood Zones (FEMA)** in Map Layers: FEMA's official flood map, the 100-year floodplain and floodway and the 500-year zone, drawn over the map when you zoom into a neighborhood. Works anywhere in Texas.
- **FEMA Report for any area**: select an area and press **FEMA Report** (next to Crime Report under Area at a Glance), or use **FEMA report (¼ mile)** on a building card's flood zone line. The report shows:
  - how much of the area is in the high-risk, 500-year and minimal flood zones, whether a floodway runs through it, and the base flood elevation;
  - flood insurance claims paid around it since the 1970s: how many, how much, by year and by storm (Harvey, Allison, Imelda…). Meyerland, for example, shows 3,781 claims and $386M paid, $322M of it from Harvey;
  - every federal disaster declaration for its county since 2000;
  - FEMA's National Risk Index: an overall rating, the expected yearly loss, and the top hazards (hurricane, tornado, flooding, hail…).
- **Export Report** saves a printable report (Print → Save as PDF); **Export CSV** saves every table for Excel.
- **Ask AI** about flood zones, flood history, insurance claims, disasters or hazard risk for a place, a building or your selection; it can open the report or turn on the flood layer.
- Claims are counted for the census tracts around the area (FEMA hides exact addresses), so they describe the neighborhood, not one parcel.
- FEMA's claims service can be slow the first time an area is asked for; the report now waits longer and retries once, and a report missing a part is never saved, so trying again gets a full one (feb40d8).

### 1:22 AM CT: The same section-card style across the app (12b80c8)
- **Tabs:** Reports, Updates, Field Notes, Market, Activity, Compare and Sources now sit on a light grey background. Each group sits in a white card with an icon and a title, like the new property card.
- **Left panel:** Area at a Glance and Construction Filings are now titled section cards too.
- The map buttons and legends now leave room for the wider property card (420 px instead of 380), so nothing overlaps.

### 1:14 AM CT: New card design: titled section cards (option B) (1d1a25e)
- **Building, parcel, filing and plane cards now use the "report with section cards" layout** you picked from the mockups:
  - a row of section chips under the title that jumps to each section;
  - a dark Overview summary at the top;
  - then one card per section, each with an icon, a title and its own source line.
- **Building cards** run in this order:
  - Ownership & Value, Building, Site, Area, Businesses on the Block, Air Traffic;
  - Construction Activity, which shows filings on the parcel plus how many are within a mile and how many were filed in the last year;
  - Regrid, From Here, and Site Tools.
  - Site Tools includes a new **Ask AI About It** button.
- **Filing cards** run in this order: Overview, Project, Schedule (with history), People, Scope of Work, AI Project Brief, Air Traffic, From Here, then Tools (TABS record, Street View, Add Site Note, Ask AI About It).
- **Plane cards** show:
  - **Flight**: altitude, speed, heading and route as tiles;
  - **Aircraft**: type, registration, squawk;
  - FlightAware and FAA registration sections when available;
  - **Tools**.
- **Readability:**
  - Labels no longer squeeze into a narrow column that wrapped two or three times. They sit above their values, or beside them in rows that wrap cleanly.
  - Buttons sit in an even two-column grid.
- **Every other card** (crime report, area summary, multi-select) picks up the same style.
- **Cleaner parcel data:**
  - "Null" values no longer show.
  - Purchase dates that came through as numbers (e.g. "46082") now read as dates (2026-03-01).
  - The city isn't repeated in the address.
  - Land area says "acres".
- **In Harris or Waller County**, the card now says the statewide parcel data doesn't cover that county yet, instead of just "no record".

### 1:14 AM CT: Planes look like what they are; map buttons stay put (01eff54)
- **Each plane on the map is drawn as its kind of aircraft**, not the same airliner icon:
  - big jets: 747s and other four-engine jets, wide-bodies (777, 787, A330…), narrow-body airliners (737, A320…);
  - smaller jets: regional jets with engines at the back, business jets, fighters;
  - propeller planes: twin and single turboprops (Dash 8, King Air, Caravan, PC-12), twin and single piston planes (Baron, Cessna 172, Cirrus);
  - everything else: helicopters, gliders, balloons, drones and ground vehicles.
- **Sizes follow the aircraft.** A 747 is clearly bigger than a 737, which is bigger than a Cessna. Small planes stay about as big as before, so they're still easy to click.
- The type comes from the code each plane broadcasts. Planes that don't send one use their broadcast size category.
- **Fixed: the zoom (+/−) and other map buttons no longer drift into the middle of the map when a card is open.** They stay at the right edge. The card sits next to them, or below them when the window is tall enough.

### 1:01 AM CT: App wouldn't load: fixed (0b50595)
- The app got stuck on a blank map with nothing clickable. A typo (an apostrophe inside a quoted sentence in the plane card's source note, added at 12:36 AM) stopped all the app's code from loading. Fixed, and the tests now check every file the browser loads, so a mistake like this can't be pushed again.

### 12:57 AM CT: FlightAware flight details, capped at $4.75 a month (35f7353)
- **Plane cards fill in the route from FlightAware when the free route database doesn't have it.** This is mostly private and charter planes. The card shows:
  - where the plane is flying from and to;
  - when it departed and roughly when it arrives;
  - the operator and its last few flights.
- **New assistant question:** "where is N123AB going?", "where has that jet been flying?", "when does EJA512 land?"
- **FlightAware charges per lookup, so spending has a hard cap of $4.75 a month**, under the $5 free monthly credit:
  - Each lookup is counted in the database before it's made, and refused once the month would pass $4.75.
  - The app checks FlightAware's own figure for the month every 15 minutes, and counts each lookup at about twice its published price in between.
  - Each plane is looked up at most once per visit, and answers are shared between users for 10–20 minutes.
  - Planes the free database already knows never cost anything.
- **Sources tab** shows how much of the $4.75 has been used this month.
- **Not live until setup is done:**
  - add the API key in Vercel;
  - run `supabase/migrations/20261012000000_aeroapi.sql` in Supabase.
  - Without both, no FlightAware lookups are made.

### 12:57 AM CT: Crime layer shows all of Houston; full incident lists in exports (28d5ac0)
- The Crime map layer was only drawing about 1,000 of its ~7,500 squares, and exports stopped at 1,000 incidents, because the database hands back at most 1,000 rows at a time. Both now come back whole: the layer covers the whole city and the report and CSV include up to the newest 2,000 incidents as intended.

### 12:52 AM CT: Crime map layer, crime reports and AI crime answers (c08bf63, b4f00c9)
- **Crime (Houston)** in Map Layers: a heat map of the last 12 months of Houston Police incidents, turning into about ¼-mile squares when you zoom in. Choose all incidents, violent or property. Hover a square for its counts; click it for its report.
- **Crime reports for any area**: select an area (Area, Shape, Radius or County at the top of the map) and press **Crime Report** in the strip that appears under Area at a Glance, or use **Full crime report (½ mile)** on a building card. The report shows:
  - incidents, violent, property and other, each with the change vs the year before;
  - incidents per square mile compared with the Houston citywide rate;
  - a 24-month chart, the top offenses and where they happened (street, parking lot, apartment…);
  - the most recent incidents, with **Show Incidents on Map**.
- **Export Report** saves a printable report (open it and choose Print → Save as PDF) with a dot map, the chart, tables and every incident listed; **Export CSV** saves the incidents (newest 2,000) for Excel.
- **Ask AI about crime**: "how much crime is near this building", "car break-ins around 2700 Milam in the last year", "crime report for my selection". It answers with the numbers and recent incidents and can open the report or turn on the layer.
- City of Houston only, and Houston Police publish about three months behind, so "last 12 months" currently ends in June 2026.

### 12:48 AM CT: More detail in plane registrations (23b68cd)
- **Registration status in plain English.** The card shows the status only when a registration isn't currently valid, for example "Registration expired", "Sale reported" or "Revoked". The FAA has about 40 such codes.
- **Certificate type** (Experimental, Light sport, Restricted…) is shown for planes that aren't standard category, and **maximum weight class** is shown for larger aircraft.
- Owners who asked the FAA to keep their name private show as **"Withheld at the owner's request"** instead of a blank.
- The setup migration (`20261011000000_aircraft_registry.sql`) now includes these two new columns. If you already ran it, run it again; it's safe to repeat.

### 12:44 AM CT: See who a plane is registered to (9687118)
- **Plane cards now have a "Registration" section** for US aircraft, from the FAA's aircraft registry:
  - the registered owner and what kind of owner it is (individual, LLC, corporation…), plus any co-owners;
  - the owner's city and state, and the tail number;
  - year, make and model, when it was registered and when that expires;
  - a link to the plane's FAA record.
- **The assistant can answer "who owns N123AB?" or "whose plane is that?"**, for any US tail number, flying or not. "Check planes near …" and "follow that plane" now also say who each plane is registered to.
- Foreign aircraft show a note that the FAA has no record of them. The registered owner is often an LLC, trust or leasing company rather than whoever is flying.
- **Not live until two one-time setup steps are done:**
  - run `supabase/migrations/20261011000000_aircraft_registry.sql` in Supabase;
  - then run the **Live data** workflow once with `aircraft`. After that it refreshes every night from the FAA's own download.
  - Until then, the card says the lookup isn't set up yet and links to the FAA website instead.

### 12:36 AM CT: Plane types and routes now actually show (6585097)
- Checking the live site showed two problems with the plane update earlier tonight:
  - **The route service the app used (adsb.lol) has stopped answering**, so no plane had a "from → to".
  - **The live feeds send only a type code** (e.g. "A21N"), never the type's name.
- **Routes now fall back to adsbdb**, a second free route database, which knows most airline flights.
- **Each route is checked against where the plane actually is.** Flight numbers get reused, so the databases are sometimes out of date.
  - Example: one database said UAL1463 was flying Washington → Boston, while it was landing in Houston.
  - A route that doesn't fit the plane's position is dropped rather than shown wrong.
- **Aircraft types show by name** (e.g. "Airbus A321neo", "Pilatus PC-12") from a built-in list of about 210 common types.
  - A rare type shows its code.
  - Private and small planes usually have no route in either database.

### 12:30 AM CT: The map now leads with properties, not filings (4a6874b, afa6fc3)
- **Filing dots are hidden when the map first opens.** This applies once to everyone, after which your own choice sticks. To bring them back:
  - open **Construction Filings** in the left panel;
  - use **Layers → Filings**;
  - or ask the assistant to filter or highlight filings.
- **New "Area at a Glance" panel** on the left, for whatever part of the map you're looking at:
  - population and growth since 2020;
  - median household income, home value and rent;
  - households, vacancy and jobs.
  - It uses the census tract data already in the app and updates as you move the map.
- **Filings, their headline numbers, filters and list now sit in a "Construction Filings" section** that starts collapsed. Everything inside it works as before.
- **Clicking open ground at street zoom opens that parcel's card** (owner, value, and so on). Clicking with a card already open just closes it.
- **The assistant's suggested questions lead with property and area questions** (who owns it, what the area is like, what businesses are nearby), with filing questions after.
- On phones, the **"List" tab is now "Explore"**, and the filing count pill is hidden while the filing dots are off.
- Regrid parcel lines stay off by default. They're billed per tile and capped each month, so turning them on for everyone would use up the allowance.

### 12:22 AM CT: Follow or orbit any plane from the chat, with its type and route (4b84a22)
- **"Check planes near …"** now lists each nearby plane with its **aircraft type** (e.g. "Boeing 737-800") and **where it's flying from and to** (e.g. IAH → ORD). It also gets each plane's position, so the assistant can act on it.
- **Asking for a town searches 10 miles around it** instead of 3, so "planes near Spring" finds more than the sky directly overhead.
- **New: follow or orbit a plane.** Say "orbit DAL1601", "follow that plane" or "pick any aircraft and orbit it":
  - Live Planes turns on and the plane's card opens with its route line.
  - The camera stays with the plane as it moves, and circles it in orbit mode.
  - Drag the map or close the card to stop.
- **Follow and Orbit buttons** sit on each plane in the chat's Air Traffic card.
- **The plane lookup retries once** when the free live feed is briefly busy, instead of failing.
- **The "Filings Within ¼ Mile" button is gone from the building card.**

### 12:15 AM CT: Site facts, Houston crime, rates and unemployment (0b71ba9, d043662, abd1007)
- **New "Site" section on every building card**, from free public sources:
  - **Flood zone** at the spot (FEMA), with high-risk zones in red and a plain-English note.
  - **Traffic**: vehicles per day on the busiest roads within about 300 m (TxDOT counts).
  - **Districts**: MUDs and other water or management districts (TCEQ), Houston tax increment zones (TIRZ), federal Opportunity Zones and the school district.
  - **Transit**: METRO bus stops within 400 m (Houston).
  - **Environmental**: EPA-regulated facilities within ¼ mile, with the ones that have violations or handle hazardous waste flagged. A screening flag, not a Phase I.
  - **Alcohol sales here**: a year of mixed beverage receipts for bars and restaurants at the address (Texas Comptroller), a good sign of how busy a place is.
  - **Crime nearby** (Houston): incidents within ½ mile in the last 12 months vs the year before, split violent / property / other. About 463,000 incidents from June 2024 on are loaded; Houston's file runs about three months behind, so the latest month is usually three months ago.
  - **Unemployment** for the county and **typical rent** for the ZIP.
- **Market view**: an unemployment tile, and a new **Rates and home lending** box with the 10-yr and 5-yr Treasury, SOFR and the 30-yr mortgage rate (now, change over a year, a 12-month trend line), plus home loans made per county.
- **Sources are now hidden on cards and panels by default**, so everyone sees the same clean view. Turn them on under **Sources → Show sources on cards and panels**. Exported reports still list every source. Map credits required by the map and imagery licenses still show.
- The nightly refresh now also pulls county unemployment (BLS), rates (FRED, New York Fed), ZIP rents (Zillow) and home loans (CFPB HMDA). The nightly database sync now loads Houston Police incidents.

### 12:03 AM CT: Flight paths and live planes fixed (2dd18c4)
- **Low Flight Paths** only ever showed a few squares at IAH and Hobby. A database bug threw away every map square with fewer than 30 sightings. Around Houston it now shows all of them: about 650 squares from the first five hours of recording, filling in over the coming days. Property cards' "Air traffic" numbers were affected too and are now correct.
- **Live Planes** went blank much of the time because the free aircraft feeds rate-limit or block requests from the hosting servers. There are now four feeds to try in turn. If all are busy, the map keeps showing the last snapshot (up to 2 minutes old) and moves each plane along its heading. Requests are also shared more between viewers, so the feeds are asked less often.

## 2026-10-02

### 11:38 PM CT: Consumer spending estimates fixed (2c86868)
- The spending layers and the Market view's spending section were empty after tonight's data run. The Bureau of Labor Statistics file server refuses GitHub's servers, which the nightly build runs on. The build now reads everything from the BLS data API, which does answer.
- How the estimate is made changed slightly. The API publishes spending by **income fifth (quintile)**, not by dollar range. Each tract's households are placed on a line through the five quintiles' average income and average spending, then adjusted to the South (about 10% below the US average). It's still an estimate, and the map and Sources tab say so.
- The numbers appear after the next data refresh, which has been started.

### 8:00 PM CT: Austin County fix (9d86928)
- TDLR lists some City of Austin projects (Travis County, 787xx ZIPs) under Austin County, apparently because filers picked "Austin" as the county. 22 of them were showing as approximate pins near Bellville. They are no longer placed in Austin County; they'll drop off the regional map (they're about 100 miles outside it) at the next nightly refresh.
- The statewide data load had skipped Austin County because of those filings. It now loads it, and only skips a county when nearly all of its filings are elsewhere (a sign of a real mix-up).

### 7:12 PM CT: Aircraft sampled every minute
- The low-flight history now takes a snapshot of aircraft over the region every minute instead of every 5 minutes, so it fills in five times faster and catches planes that cross a spot quickly.
- The Air Traffic numbers and the Low Flight Paths colors mean the same as before (the index is scaled to the old 5-minute rate), so today's earlier samples and the new ones mix correctly. "Days sampled" now counts a full day as 1,440 snapshots.

### 7:06 PM CT: Regrid records cached by parcel, with an out-of-date check (0455334)
- A Regrid parcel record is now saved with its outline: clicking anywhere else on the same lot later is free (before, only the same parcel ID or exact spot was).
- The card now says when a saved record is out of date: Regrid re-pulls each county's data periodically, and if it has done so since the record was saved (or the copy is over a year old), the card shows "Update (uses 1 record)". Otherwise it says the copy is current with the county's last Regrid refresh. Nothing is re-bought automatically.

### 7:00 PM CT: Ask AI suggestions only on hover (0e744bf)
- The suggested questions above **Ask AI** now appear only while your pointer is on the button (or it has keyboard focus). They stay up long enough for you to move up and click one. They no longer cover the Layers panel.
- With the Layers panel open, it now ends above the Ask AI button and scrolls inside, so the button no longer covers its bottom rows.
- On touch screens, which have no hover, the assistant's empty chat starts with the same suggestions for what's on screen, then the general examples.

### 6:50 PM CT: Roomier phone layout; routes clear when the card closes (fc2e789)
- **Phone spacing**:
  - the map buttons are separate, larger buttons with room between them;
  - filter labels sit above their chips;
  - the stats grid is two columns, and the last tile fills the row instead of leaving a gray gap;
  - property cards, the Layers panel and the assistant have more breathing room;
  - the assistant's box reads "Ask anything…" so it isn't cut off.
- **Close button always reachable**: a property card's title, star and × stay pinned at the top while you scroll the card, and the × is a bigger tap target on phones. Before, scrolling down to "Drive Time From Me" pushed the × off-screen.
- **Routes clear when the card closes**: closing a card with ×, by swiping it down, or by opening another card removes its driving route. This includes closing it while the route is still loading, which used to draw the route anyway.
- **Route pill**: while a route is showing, a one-line "Route · 41 mi · 46 min ×" pill on the map clears it. An empty pill no longer appears when there's no route.
- **For whoever runs the database**: the flight-history migration is renamed to `supabase/migrations/20261008000000_air_traffic.sql`, because its old number clashed with the Regrid migration. It hasn't been applied yet, so nothing else changes.

### 6:48 PM CT: Plane route lookups no longer fail on unknown flights; Regrid confirmed live (955df7b)
- A flight that isn't in the adsb.lol route database used to make the route lookup error out. It now just says "Route not in the database" (and draws no line).
- Regrid confirmed working on the live site: the token is accepted, usage is being counted, and parcel tiles load.

### 6:40 PM CT: Plane routes on the map; Regrid reads REGRID_API_KEY (e69725a)
- Selecting a plane now draws its route: the leg already flown as a solid curved line from the origin airport to the plane, the rest dashed to the destination, with both airports labeled. The map zooms to fit the whole trip (unless you're following the plane). The line moves with the plane and clears when you close the card. Planes whose route isn't in the adsb.lol database show no line.
- Regrid now reads the token from `REGRID_API_KEY` (the name set on Vercel); `REGRID_TOKEN` also works.

### 6:31 PM CT: Regrid wired in, with hard monthly caps (3548070)
- New **Parcel Lines (Regrid)** layer in Map Layers: parcel boundaries at street zoom.
- New **Get Regrid Details** button on the building card: zoning, standardized land use and the full Regrid parcel record. A parcel looked up once is saved and free after that.
- Hard caps so it never goes into overage: 1,800 parcel records and 180,000 tiles a month (your plan includes 2,000 and 200,000). At the cap the button says so and the parcel lines stop drawing. Usage shows on the Sources tab.
- The Regrid token is kept on the server only. Turn it on by adding `REGRID_TOKEN` in Vercel (see README).

### 6:27 PM CT: Consumer spending estimates and the city sales-tax trend (043ec80)
- **Spending on the map**: Map Layers → Demographics adds Consumer Spending, Spending per Household, Dining Out, Home Furnishings and Apparel for every census tract. These are **estimates**: each tract's households by income (Census) × what households at that income spend (Bureau of Labor Statistics spending survey, adjusted to the South). They are not measured locally, and the legend says so.
- **Market view**:
  - total consumer spending and spending per household for the county or region;
  - a spending-by-category chart;
  - **the sales tax each city receives every month** (Texas Comptroller), a real local-spending trend, with each city's last 12 months against the 12 before.
- Building cards show spending per household and dining-out spending for their tract.
- The assistant can answer spending questions for a place ("how much do households in Katy spend dining out?") and show the spending layers.
- These numbers appear after the next nightly data refresh.
- Fixed before it shipped: a new file the browser needs wasn't included in the site build, which would have stopped the page from loading. A new automatic check now catches this.

### 6:12 PM CT: Live planes, low-flight history, and the assistant can answer about all the data (852b396)
- **Live Planes**: turn it on in Layers → Live Conditions (or ask the assistant). Every aircraft in view, anywhere in the world, coloured by altitude, moving smoothly and refreshed every 10 seconds. Hover for a quick look; click for a card with callsign, aircraft type, registration, altitude (climbing or descending), speed, route (e.g. IAH → ORD), a Follow button and links to adsb.lol and FlightAware. Zoom in past state level to see them.
- **Low Flight Paths (30 Days)**: a new layer showing where aircraft fly below 3,000 ft over the region. Property cards get an **Air Traffic** line ("moderate low air traffic: about 14 sightings a day within ~1 km, lowest 850 ft"). The history is collected every 5 minutes from now on, so it takes a few days to mean much. It's an exposure index, not a count of flights.
- **Ask about anything**: the assistant can now answer from every dataset in the app:
  - planes overhead and how much low air traffic a site gets;
  - the Market view numbers per county: population, jobs, housing permits, new businesses, local news;
  - your team's field notes and watchlist;
  - where each dataset comes from and when it was last refreshed.
- The Sources tab lists the aircraft feed and the flight history.

### 6:09 PM CT: Fewer filings stuck at the town center (65690ec)
- Diagnosed why about 1,700 filings stayed at a town-center pin. The map services were up, but none of them had a house number for most of those addresses: new subdivisions, new addresses, and filings that list "0 Main St" or just a street.
- Those filings are now placed on their own street in their own ZIP code when the street name, street type and ZIP all match. The card says it's street-level ("not at the exact site"), and exports mark it "Street (house not found)". In a test sample this placed 15 of 24 that were previously at the town center.
- Junction addresses ("Spacek Rd and Evergreen Falls Dr") still use OpenStreetMap, now with a time limit. It was timing out and dragging data refreshes to about 2 hours.
- Freeway frontage addresses (e.g. "26003 Northwest Fwy") can stay at the town center: a whole stretch of freeway is too vague to place them on.

### 5:58 PM CT: The assistant can take you anywhere in the world, and asks when a place is unclear (ae83277)
- Ask for any place on Earth: "take me to Lyon, France", "show me Germany", "outline Bavaria, Germany". Whole countries and states zoom out to fit.
- If a name could be more than one place ("take me to Paris", "Springfield", "Georgia"), the assistant no longer guesses. It asks which one and shows the choices as buttons ("Paris, France" / "Paris, Texas"). It also asks when a request is unclear.
- Ask about places outside Texas (Europe, other states). The filings and census data only cover Texas, so the assistant says so and answers from general knowledge or a quick web search.
- When the map is somewhere else, the suggested questions above Ask AI are about that place ("Tell me about Lyon").
- Weather, nearby places and drive time now work anywhere. Drive time refuses trips no car can make (e.g. Houston to Paris).

### 5:48 PM CT: Sharper radar, 7-day forecast card, roomier filter panel (2f38b18)
- **Rain radar is much sharper.** Around Houston it now uses the Houston NEXRAD radar's own high-resolution scan (about 250 m detail, versus the 1 km national mosaic before), and the nearest Texas radar elsewhere. It falls back to a 500 m national composite, then the old mosaic, if a radar is down. You can zoom in further before it gets blurry.
- **7-day forecast in the chat**: ask for a forecast ("forecast for Waller", "will it rain this week"). The card shows one row per day: conditions, chance and inches of rain, the low and high on a bar against the week's range, and wind and gusts.
- **Left panel redone with more room**:
  - each filter's label now sits above its options;
  - chips and inputs are bigger and easier to tap;
  - paired inputs (value, sq ft, dates) share the row evenly;
  - More Filters is grouped into Project, Size, People & Place and Timing;
  - Save Search, Copy Link and RSS Alerts are evenly sized buttons.

### 5:45 PM CT: Statewide load no longer rejects Austin County (e45fcf3)
- The statewide database load skipped Austin County: 22 of its filings list "Austin" as the city (the county's own name), and the safety check took that for Austin in Travis County and decided the county ID was wrong. A city that's just the county's own name no longer counts in that check (the same would have hit Houston County). Re-run Statewide data with counties = Austin to load it.

### 5:38 PM CT: Chat cards tidied, demographics answers, tabs only open when asked (2f973eb)
- Chat card titles are in Title Case ("Filings by Developer").
- The "Show the data" dropdown is gone; each card ends with a small line naming its sources (TDLR TABS, Census, Open-Meteo, OpenStreetMap…).
- The weather card reads "Mostly Clear" and includes tomorrow's forecast and any tropical storms.
- Ask about median income, population, home values, rent, vacancy, age or growth for a town, neighborhood, county or address and you get a **Demographics** card. It uses the US Census tract data already in the app, and has buttons to show income or growth on the map. Area medians are approximate (averaged across tracts) and the card says so.
- Questions like "show me construction timelines for Cypress" are answered in the chat, with a chart of estimated starts by month. The assistant no longer jumps to the Timeline (or Compare) tab on its own. It offers "Open the Timeline tab" as a follow-up button instead.

### 5:29 PM CT: Legends no longer hidden behind Ask AI (3f2cfca)
- The census tract (demographics) legend now sits at the bottom left, next to the Filings legend, instead of behind the Ask AI button and its suggested questions. If there isn't room side by side it stacks above.
- Both legends move up above the time slider while it's open.
- On short windows the suggested questions above Ask AI show fewer items rather than running into the map buttons.

### 5:20 PM CT: Map buttons stay put when a card is open (71a7598)
- On desktop, with a filing or building card open, the zoom, compass, locate, home, time-lapse, layers and globe buttons now stay in their column at the right edge. The card opens just below them and scrolls if it's long, instead of the buttons jumping left and floating in the middle of the map.
- On short windows, where a card wouldn't fit under the buttons, they still move left of the card so it never covers them.

### 5:15 PM CT: Cards in the AI chat, wider chat, business search, Reports tab (559bb0f)
- The assistant now shows cards in the chat with its answers:
  - filing summaries with metrics, a filed-by-month chart, uses, places and the largest projects;
  - charts, single filings, areas and side-by-side comparisons;
  - nearby places, drive time (with **Clear Route**), weather, news and site imagery;
  - location details: owner, value, year built, size, height, businesses and filings.
- "Summarize the filings in view" gives a summary card. Asking for a chart or trend gives a chart card. "What's at this address" gives a location card.
- Replies show real numbered and bulleted lists.
- Drag the chat window's left edge to make it wider (up to about 60% of the map). It never gets narrower than before; double-click resets it. The width is remembered.
- The map search has a **Businesses** section:
  - search by name, e.g. "Starbucks";
  - results come from OpenStreetMap near the map center, plus Texas Comptroller sales-tax permit holders in nearby towns;
  - picking one drops the pin, and More Information opens the location card.
- New **Reports** tab between Market and Updates:
  - start any report in one click;
  - every export is kept in this browser, where you can download it again, re-run it with today's data, open it on the map, or delete it.

### 5:08 PM CT: Building card "Demographics" with the area it covers; new chat icon (84ee34e)
- The building card's "Census tract" section is now **Demographics**, with a line saying which census tract the numbers describe and how big it is (e.g. "about 0.6 sq mi, like a 0.4-mile radius"). The numbers are for the tract the building sits in, not a fixed radius: tracts are small in dense areas and large in rural ones (median in this region about 1 sq mi, up to about 200 sq mi).
- The assistant's "New" button is now a new-chat icon.

### 5:07 PM CT: Voice stops answering things you didn't say; web search on request; new voice panel (c45f721)
- Voice no longer posts or acts on messages you didn't say. On silence or background noise the transcriber could "hear" its own hint list of place names ("Houston area, Texas. Cypress, Katy, …") and the assistant acted on it (that's where the TxDOT filter came from). The voice assistant now waits for the transcript, drops noise and those echoes, and only then answers. Your words now always appear above the reply.
- The assistant can search the internet, but only when you ask ("search the web for…", "look it up", "Google it"). It answers in a couple of sentences, and the chip under it links the source sites. It no longer says "let me check" unless it actually runs a tool.
- New voice panel: a glowing orb that breathes while listening, follows your voice while you talk, spins while thinking and turns blue and follows the assistant's voice while it speaks. A live caption shows what it's hearing as you talk.
- Fixed: the Send button in the voice panel showed all the time; it now appears only while you're talking.

### 4:58 PM CT: "Downtown Houston" means the district (27277ea)
- Asking the assistant to highlight or go to Downtown Houston now outlines the whole downtown freeway loop (I-45, I-69, I-10) and frames all of it, instead of outlining the JPMorgan Chase Tower or flying to the "Downtown Split" interchange. Orbiting downtown circles the district at a wide, tilted view. The outline is approximate.
- In general, "downtown", "midtown" and "uptown" requests no longer settle for a street, building or business that merely has that word in its name; if no matching district turns up, the assistant says so instead of guessing.

### 4:47 PM CT: Place pin, More Information, 9 metrics, collapsible panel and more filters (9c1dda2)
- A searched place now gets an amber map pin with its name. It clears when you close the place card, search again, press Reset or filter to the area.
- The place card's main button is now **More Information**. For an address, landmark or building it opens the location card (parcel, size, height, filings, Drive Time, Site Imagery, News). For a town, county or neighborhood it opens an area summary: your metrics, top uses, the five largest projects, Filter to This Area and + Compare.
- **Filings Within ¼ Mile** moved into the location card.
- Headline metrics: pick up to 9, and the default is now 9 (adds New value, Starting in 90 days and Sq ft filed). PDF reports wrap the metrics onto two rows.
- The **Filters** and **List** sections fold away from their headers, and the app remembers which are folded.
- New filters: Use as multi-select chips, Status, a max value, a square footage range, housing units, a company search (developer, owner, architect, GC) and **Exact addresses only**. Links, saved searches, RSS feeds and the assistant all understand them.

### 4:37 PM CT: Shortcut hints removed (cefc21e)
- The "Ctrl+K" badge on the search bar and the "Ctrl+/" badge on the Ask AI button are gone. The shortcuts still work (Ctrl/Cmd+K jumps to search, Ctrl/Cmd+/ opens the assistant).

### 4:25 PM CT: Market data merged to main, map buttons stay clear of open cards, basemap names (8ecabe0)
- With a filing or building card open, the map buttons on the right (zoom, compass, locate, home, time-lapse, layers, globe) and the Layers panel move left of the card, like the Ask AI button, so a tall card no longer hides them.
- Basemap buttons renamed: "Dot Grid" is now **Default**, "Esri Sat" is now **ESRI** (the Sources tab and the assistant use the same names).
- Added this changelog.
- Merged the Market view branch and the Ask AI suggestions branch into main, so main has everything below.

### 3:36 PM CT: Market view and registered businesses (11ded4b)
- New **Market** tab: population, jobs, housing units permitted, new business locations and local development news per county or the whole region, with hover readouts and tables.
- New **Jobs** demographic layers on the map: jobs located here, job growth, jobs per resident (US Census LEHD LODES).
- Building cards list businesses registered at the parcel address (Texas Comptroller sales-tax permits); filing cards have a **Look Up Registered Businesses** button.
- Nightly build adds `data/area.json`: LODES jobs, Census Building Permits Survey, Comptroller new businesses, Google News area headlines. Each source is best effort.
- AI briefs include county permits and jobs; Sources tab and README list the new sources and their limits.

### 3:27 PM CT: Ask AI suggestions and keyboard shortcuts (8d294c6); geocoding retries (c07c5fc)
- Up to 5 suggested questions above Ask AI, based on what's on screen (the open filing or building, the town in view, the filters). With a card open, Ask AI and its suggestions sit left of the card instead of under it.
- Cmd/Ctrl+K focuses the map search; Cmd/Ctrl+/ opens and closes the assistant. Key hints shown on desktop.
- Building card: Select Multiple only on touch screens; with a mouse, Shift-click adds buildings and parcels.
- Geocoding retries cached misses and places addresses that have no usable house number.

### 3:17 PM CT: Project news from Google News (9f78567, 817338f)
- News searches Google News first, GDELT as a fallback (GDELT was refusing or rate-limiting the site's server).
- One-word company names get construction context added so the search finds the right company.

### 3:14 PM CT: High-res site imagery (e064153)
- Site Imagery shows dated sub-metre aerial versions from the Esri World Imagery archive (Wayback) and USDA NAIP, alongside NASA's 30 m passes.

### 3:10 PM CT: Data pipeline fixes (f6d574b, ddb95f9)
- A push conflict on `data/` no longer throws away a nightly run.
- Statewide load strips NUL characters before writing to Supabase (a Fort Bend filing failed on one).

### 2:59 PM CT: Assistant and map fixes (6e9e070, 6bda349, 80112c3)
- Assistant stops detouring to the wrong street, adds a "Tell me more" pill, wider drawer.
- The open filing always shows on the map, even when filters would hide it.
- Downtown zooms stop at district level; outlines no longer jump to the globe.

### 2:52 PM CT: Search, camera, list and Sources tab; team notes without sign-in (e2bdf41, 617d1fd)
- Fixed address search and the 3D camera getting stuck; the list panel is resizable; new **Sources** tab with every data source and how fresh it is.
- Team field notes sync through `/api/field` with no sign-in (optional team passcode).

### 2:43 PM CT: Button labels, NASA previews, drive routes (73495ab)
- Title Case buttons; NASA image previews with download; the drive route clears when the card closes.

### 2:31 PM CT: Team field notes in Supabase (b098fb7)
- Shared notes and photos and personal watchlists stored in Supabase (email-code sign-in prepared).

### 2:23 PM CT: Building size and heights (8236ae5, dff7f56, b52ed08)
- Building square footage and roof heights from USGS 3DEP lidar; select multiple buildings or parcels; nearest-place search.

### 2:14 PM CT: Live-data history (b7c03a6)
- News, NASA passes, weather, storms and census tracts saved to Supabase nightly so they build up a history.

### 2:06 PM CT: Search sections and assistant behavior (7be1e77)
- Search results split into addresses, places, projects, companies and filings.
- Assistant answers without moving the map unless asked; follow-up pills; plain-text replies.
- County lines from Census TIGER/Line.

### 1:35 PM CT: Live layers, map search, Compare, export (e5153b1, 75248a0)
- Rain radar, lightning, clouds, hurricanes, wind, traffic, 3D terrain, NASA imagery; drive time, weather, site imagery and news on every card and by voice.
- Map search with place outlines, Compare areas, custom metrics, export dialog, costs with cents.

### 1:02 PM CT: Assistant camera and statewide fix (4cb2456, 8a6e0cf)
- Assistant orbits exact filings and landmarks, zooms close on buildings, drops stray filters.
- Statewide load rounds costs to whole dollars (a decimal cost broke the Harris insert).

### 12:02 PM CT: Voice (383e588)
- Voice assistant answers when you stop talking, shows the full transcript and sees what's on screen.

### 11:25 AM CT: Assistant fix, tabs, workflows (a9a0d28, efa3a10)
- Assistant moved to the Responses API; building highlight and notes menu fixed; Activity and Updates tabs; more spacing.
- Workflows use the Production environment, where the secrets are stored.

### 8:54 AM CT: AI assistant, geocoding, statewide loader (645a91c, 7fe6148, 493f280, 57cc4f8, e94fbe8, 7c9722e)
- AI assistant with map tools and voice; activity heatmap; uniform dots; quieter dot grid; timeline selection.
- Geocoding with Texas 911 address points; the building panel uses parcel identify (the parcel service refuses queries).
- Statewide loader sized for the Supabase free tier (3 years); diagnostic probe workflows for the parcel and address services.

### 1:01 AM CT: Statewide database, accurate geocoding (cb40277, ca65f1c)
- All Texas counties backfilled into Supabase.
- Geocoding checks parcels first and validates every point; the data workflows authenticate with GitHub OIDC (no stored keys).

### 12:18 AM CT: Nightly refresh and AI model settings (af5e2fd, 091a477, 96110e4, d698f65)
- Data refreshes nightly; "this week" covers the last 7 days of runs; 13 months of change history kept.
- Default OpenAI model and reasoning effort settings; optional cheaper model for bulk tagging.

## 2026-10-01

### 11:56 PM CT: Census fix (9a01af1)
- Census ACS requests use the documented form and log the reply on errors.

### 11:08 PM CT: Phone and tablet (7e61404)
- Phone and tablet layouts, field notes, watchlist, installable app.

### 10:18 PM CT: 3D buildings and fixes (626fd66, d2302b9, 8c2fca4)
- 3D buildings and a free building click-in panel (parcel, businesses, filings).
- Holding page instead of a failed deploy before the first data run; data commit step fixed.

### 8:43 PM CT: AI, timelines, change feed (7f45a72, 6b1b16b)
- AI tagging of filings, construction timelines, the nightly change feed and census market context.

### 5:42 PM CT: First version (17d820f)
- Map of TDLR TABS construction filings for Waller and the six surrounding counties.
