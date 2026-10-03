# Changelog

Every push to the repository adds an entry at the top: date and time (US Central), what changed, and the commit(s).
Nightly "Refresh data" commits from the data workflow are left out (they only update `data/`).

## 2026-10-03

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
