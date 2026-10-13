# Real Estate Intelligence Platform: Product Guide

A plain-language guide to what the app does and how to use it. It's written for the people who use the app, not the people who build it, and it's updated as new features ship. For a dated list of every change, see `CHANGELOG.md`.

---

## What it is

A map-based research tool for Finishes Solutions. Click any building or piece of land to see who owns it, what it's worth, and what's around it. Pick an area to get reports on flood risk, traffic, drive times and the local market. Turn on layers like parcels, flood zones, demographics, live weather, planes and construction projects.

**Where it works**

| What | Coverage |
|---|---|
| Property, owner and value lookups | Texas |
| Census demographics, jobs, market numbers | Waller County and the six counties around it (Harris, Fort Bend, Montgomery, Austin, Washington, Grimes), plus the next ring of counties for context |
| Construction filings (TDLR) | The same 7 counties, last two years |
| Crime, street level (each incident) | City of Houston only |
| Crime by city / county (yearly, per police department) | The whole US |
| Flood zones | Anywhere FEMA has mapped (zoom in) |
| Traffic counts | Texas roads (TxDOT) |
| County and state lines | The whole US |
| Weather, drive times, planes, airports | Anywhere in the world |

---

## Getting started

- Open the site in any modern browser on a computer, tablet or phone.
- **Install it like an app:** on a phone, use your browser's "Add to Home Screen" (on Android, More → Install as an App). It opens full screen and keeps working with a weak signal; data refreshes when you're back online.
- The map opens on the home region. The **house** button on the right always brings you back.

---

## The screen at a glance

**Left panel** (on phones, the **Explore** tab)
- **Area at a Glance:** who lives and works in the area you've selected (a county, shape, radius or place), or in the area on screen when nothing is selected (zoomed in on a block, the census tract you're in): population and growth, median income, home value, rent, households and jobs. Its heading names the area it covers. With nothing selected it updates as you move the map; clear the selection to go back to following the map.
- **This Area:** the area you've picked, or the map view if you haven't picked one. It holds the area reports, Compare, Save Search and Copy Link.
- **Construction Filings:** the construction project list, KPIs and filters. It's collapsed until you open it.

**Top of the map**
- **Tools:** Move, Area (drag a box), Shape (draw a shape), Radius (an address plus a distance), County (click counties).
- **Cursors** (mouse or trackpad) show what a click will do: the dark arrow for nothing in particular, a green arrow over anything you can open or select, a small building at street zoom when a click opens that building, four arrows while you drag the map, and a crosshair with a small badge for each drawing tool (a dashed box for Area, a shape for Shape, a circle for Radius, a county for County). Text boxes keep the normal text cursor.
- **Filters** narrow what the map shows, layer by layer (see "Filters" below). **Clear** sits right next to it; see "Clearing the view" below.
- **Export** makes a report.
- **Search** finds addresses, places, roads, businesses, projects, owners and developers. Press ⌘K (Mac) or Ctrl+K to jump to it. When Google is set up for the site, a **Google** section lists Google's matches too; picking one switches to the Google map and opens a Google place card (address, phone, website, hours, rating and a link to Google Maps).
- **Quick layer buttons** under the search box: Satellite, 3D, Parcels, Flood Zones, Demographics, Traffic Counts, Filings, Planes, Radar, and **More** for every layer. On a phone they're one row just under the search bar; swipe it sideways for the rest (the faded right edge means there's more).

**Right side of the map**
- Zoom in and out.
- **Compass:** back to a flat, north-up view of the same spot.
- **Near me:** the area around your location.
- **Home region.**
- **Time-lapse:** play construction month by month.
- **Map Layers.**
- **Globe view.**

**Tabs** (desktop and tablet): Map, Market, Compare, Reports, Notes, Projects, then the construction views (Timeline, Activity, Updates), and Sources.

**Phones:** the map fills the screen. The bottom bar has Map, Explore, Timeline, Activity and More. **More** opens a grid of one-word tiles:
- **Views**, named like the desktop tabs: Market, Compare, Reports, Updates, Notes, Projects, Sources.
- **Tools:**
  - Layers.
  - Export.
  - Saved: saved searches and alerts.
  - Nearby: the area around you.
  - Pin: a site note at your location.
  - Theme: light or dark.
  - Install, when your phone offers it.

Cards slide up from the bottom: swipe down to shrink one, and swipe again to close it.

---

## Looking up a property

Click a building, or at street zoom click open ground, to open its **property card**. The owner and value show first, usually within a couple of seconds; the businesses, height and photo fill in after.

- **Ownership & value:** owner, mailing address, market, land and improvement value, year built, when it was acquired, acres, and building size. This comes from the county appraisal district through the state's parcel service.
- **Company behind the owner:** when the owner is a company (an LLC, partnership, corporation or trust), the card looks it up in the Texas Comptroller's free public records: whether it's active, where and when it was formed, its registered agent, mailing address and the officers, managers or members from its latest public report. If the name doesn't match exactly, similar names are listed to pick from. People's names are never looked up.
- **The building:** footprint, height, floors and estimated floor area. Height comes from USGS lidar where it's believable; a reading that doesn't fit the building (say, hundreds of feet on a one-storey store) is set aside with a note, and the map or appraisal record is used instead.
- **Site:** flood zone, traffic counts on nearby roads, water and utility districts (MUDs), **utilities** (see below), tax-increment zones, Opportunity Zone, school district, bus stops, nearby environmental sites, crime nearby (Houston), and area rents and jobs.
- **Utilities** (in the Site section, filled in a moment after the rest; distances from the parcel's edge):
  - **Power:** how far it is to the nearest transmission line (with its voltage and owner, e.g. "480 ft to a transmission line, 138 kV, CenterPoint Energy"), the nearest distribution line, and the nearest substation. Power lines come from OpenStreetMap: high-voltage lines are mapped well, but street (distribution) lines only in part, so "none mapped" doesn't mean there are none.
  - **Water and sewer:** who holds the state service area (CCN) for water and for sewer here, with the CCN number. "No CCN here" usually means a city or a MUD that doesn't hold one; the Districts row shows the MUD.
  - **Mains:** in Houston, the distance to the nearest public sewer main (with its size and material) and to a public water main where the city publishes one. Elsewhere, the distance to the nearest water line a utility has mapped for its service area, and a reminder that the city or MUD engineer has the mains.
- **Crime:** inside Houston, the incidents reported within a mile. Anywhere in the US, **Crime by city / county**:
  - the local police department: the city's own police inside city limits, otherwise the county police or sheriff;
  - violent and property crimes per 100,000 residents for the newest full year, compared with the state and the US, and the change from the year before;
  - a 10-year trend line against the state and the US, and the share of crimes solved;
  - how it ranks among the same kind of departments in its state, e.g. "violent crime lower than 71% of Texas city police departments";
  - **Other departments** in the county, if you'd rather see a neighboring city or the sheriff (the section stays where it is on screen while the new department loads);
  - **Full report** for the year-by-year table and the mix of offenses (murder, robbery, burglary, theft and others), with PDF and CSV export.
  - These are whole-year, department-wide figures from the FBI: every spot a department covers shows the same numbers. The card says which year they're for, and warns you when a department reported only part of a year or has stopped reporting.
- **Area snapshot:** census numbers for that neighborhood.
- **Businesses:** what's inside or next door, from the Overture Maps and Foursquare open business lists plus OpenStreetMap, and businesses registered for sales tax at the address. Click a business for its details.
- **Construction filings** on the parcel.
- **From here:** distance and drive time, a drive-time map, weather, news, and site imagery (recent satellite and dated high-resolution photos).
- **Regrid details** (paid, capped each month): zoning, zoning limits such as height and density, the last sale price and date where recorded, and land use. Harris and Waller counties aren't in the free state parcel data, so Regrid fills in owner and value there.
- Street View, an orbit camera, notes, **Start Site Plan** (see "Projects and site plans" below), and **Ask AI** about this property.

**Section buttons** under the card's title (Value, Building, Site, Crime, Area…) jump to that section, with its heading just below the card's header.

**Big buildings:** clicking any part of a building selects the whole building, even a warehouse or shopping center that the map draws in pieces. If the building sits on more than one parcel, the card lists every parcel with its owner and value, and a total.

**Several things at once (tabs):** Shift-click to add more, up to 20. On a touch screen, tap **Add** at the top of the card (or **Select Multiple**), tap the other things, then **Done**. This works for buildings, parcels, construction filings, planes and airports, mixed together.
- Each one gets a numbered **tab** at the top of the card; the same number marks it on the map, in the middle of the building or parcel. Parcels picked as open ground keep a faint outline while you look at another tab. Tap a tab to see that card, or its **×** to drop it.
- Shift-click something already picked to take it out (for a parcel, anywhere inside it). A parcel is never added twice. A plain click starts over with just that one; closing the card clears them all.
- With two or more buildings or parcels, an **All** tab adds them up: footprint, floor area, market value and acres (each parcel counted once), the construction filings on them, a CSV export and **Zoom to All**.

---

## Picking an area and getting reports

Choose **Area**, **Shape**, **Radius** or **County** at the top of the map and mark the area. It becomes the **selected area**, shown in the **This Area** box. From there you can run:

- **FEMA report:** flood zones, past flood insurance claims, disaster declarations and FEMA's risk index.
- **Environmental report:** a screen of state and federal environmental records around the area or a parcel (from a property card's **Area reports**, it uses the parcel itself): cleanup and contamination sites, leaking and registered petroleum tanks, landfills, EPA-permitted facilities, oil and gas wells (including orphan wells) and pipelines, wetlands and soils. Each kind is searched out to the distance a Phase I environmental assessment would use (¼ to 1 mile from the edge of the site), nearest first, with distance and direction. Exports as PDF or CSV. It is a screen of public databases, not a Phase I.
- **Traffic report:** the busiest roads and daily traffic counts, plus live speeds and incidents where available. Works for areas up to 5,000 square miles, so a whole county (even Harris) or a few counties together. For big areas it lists the busiest roads; incidents are only the ones inside the area.
- **Drive-time map:** 10, 20 and 30-minute drive areas, with the people, households and jobs inside each.
- **Air traffic report:** how often planes pass over, how low, and which kinds.
- **Crime report** (City of Houston): incidents by type, trend, time of day, day of week, and per resident.
- **City / County Crime Report** (anywhere in the US, from the **Reports** tab): the police department at the middle of the map or of the selected area, with the same figures as the property card's Crime by city / county.
- **Compare:** add up to 4 areas and see them side by side.

Every report exports as a PDF in the Finishes Solutions style, and its data as a spreadsheet. Reports are kept in the **Reports** tab.

### Clearing the view

The **Clear** button next to Filters appears whenever something is narrowing what you see: filters, a time period other than the last 12 months, a time-lapse month, a selected area, or a searched place's outline. One click clears all of it. Hover over it to see exactly what it will clear. On phones, the **✕** next to the filter button does the same. Inside the Filters menu, **Clear All** is at the top.

---

## Filters

**Filters** works on the map's layers, not just construction filings. It has a section for each kind of data:
- **Demographics:** median household income, population growth, home value, rent, housing vacancy, and jobs located here.
- **Traffic:** the busiest road, in vehicles a day.
- **Risk:** which flood zones show (all of them, or only the high-risk 100-year floodplain), the crime type (Houston), and, when matching, FEMA's flood risk rating.
- **Construction filings:** the filing filters (period, county, type, value, use and so on). When matching, this section also offers the number of construction projects in an area.

The switch at the top picks how the filters work:
- **Filter each layer:** each filter acts on its own layer.
  - Demographic thresholds fade the neighborhoods that don't qualify on the Demographics layer.
  - The traffic threshold hides quieter roads on Traffic Counts.
  - The risk choices change the flood and crime layers.
  - Setting a filter turns its layer on.
- **Match everything:** the app looks for neighborhoods (census tracts) that meet **every** threshold you set. For example: income at least $100K, growth at least 5%, at least 5 construction projects, and low flood risk.
  - Matching areas are outlined in green and the rest of the map fades.
  - The panel says how many areas match, and **Zoom to matches** frames them.

The summary at the top of the panel lists everything that's on, and **Clear All** resets it. The **Clear** button next to Filters clears layer filters too. The busiest-road and flood-rating data for matching is added by the nightly data refresh; until it arrives, those two thresholds are left out of the match, and the panel says so.

Property filters (use, acres, value, year built, owner, zoning) are planned. They need the county appraisal data to be loaded first.

## Map layers

**Quick layer buttons** turn the most common layers on and off with one tap. A button is highlighted whenever its layer is on the map, however it was turned on. **Filings** covers both the dots and the heatmap, and turning it off hides both. Layers without their own button (crime, airports, weather and others) are counted on **More** (for example "More · 2"); hover over it to see which. **More** (or the layers button on the right) opens **Map Layers** right under the quick layer buttons, with every layer and its options. Click **More** again, the ×, or anywhere on the map to close it.

**Legends** in the bottom-left corner explain the layers that are on: filings, traffic counts, drive times, planes, crime, airports, and now **Rain radar** (light to severe rain) and **Flood zones** (FEMA's own colors: high-risk 100-year floodplain, floodway, moderate 500-year zone).

The map always opens without construction filings or planes. Turn them on with their buttons. A shared link that carries filing filters opens with the filings shown.

Map Layers:

- **Base Map:**
  - Default: a calm, muted map.
  - Streets.
  - Satellite.
  - Topo.
  - ESRI satellite.
  - Free Map.
  - Google and Google Satellite (only when Google is set up for the site): Google's own map, with the Google logo and map credits at the bottom while it's on.
- **Property & Site:**
  - 3D buildings (zoom in).
  - Google 3D (only when Google is set up): Google's photorealistic 3D model of the city in place of the simple blocks. Zoom in to street level and tilt the map. Clicking a building still opens its property card.
  - Parcel lines (Regrid).
  - Businesses & places: every mapped business at street zoom, colored by kind (food, retail, health care, offices, construction and home services, industrial and more). Pick one kind from the list under it, or click a dot for the name, category, address, phone, website and a link to Google Maps.
  - Flood zones (FEMA).
  - Traffic counts.
  - Crime (Houston), with a choice of all, violent or property crime.
  - Airports.
- **Environment:**
  - Environmental sites: cleanup and contamination sites (state and federal Superfund, hazardous waste cleanups, voluntary cleanups, brownfields, dry cleaner cleanups, leaking petroleum tanks, landfills and areas where groundwater use is restricted), or registered petroleum tanks, or EPA-permitted facilities. Click a dot for its name, program and ID, and an Environmental Report for that spot.
  - Oil & gas wells and pipelines (Railroad Commission of Texas).
  - Wetlands (US Fish & Wildlife Service).
  - Soils (USDA soil survey).
- **Utilities:** **Power, Water & Sewer Lines** (zoom in): transmission lines in red with their voltage, distribution lines in orange (dashed where underground), substations as red dots, and in Houston at street zoom, public sewer mains in brown and water mains in blue where the city publishes them.
- **Demographics:** color census tracts by:
  - population or growth;
  - income, home value, rent or vacancy;
  - jobs, job growth or jobs per resident;
  - estimated consumer spending.
- **Construction Filings:**
  - show the filing dots, the same size or sized by value;
  - an activity heatmap.
- **Map Display:**
  - Dot Grid: a faint dot texture over land.
  - County & State Lines: every US county, with exact Census boundaries when you zoom in.
  - Roads and road names.
  - 3D tilt.
- **Live Conditions:**
  - rain radar, lightning, satellite clouds, wind;
  - hurricanes and tropical storms;
  - live traffic;
  - 3D terrain;
  - NASA recent imagery, high-resolution site imagery;
  - live planes, low flight paths.

The quick buttons and the panel always match. A layer turned on in either place, or by the assistant, shows as on in both.

**3D:** tap **3D** (or tilt with two fingers or a right-drag) to see buildings, terrain and planes in 3D. The compass button flattens the map again.

---

## Planes and airports

- **Live Planes** shows aircraft in view, colored by altitude, and moves them smoothly between updates.
- **Tilt the map** and planes become **3D models** at their real altitude. Each kind of aircraft has its own shape: airliners, jumbo jets, business jets, military transports, fighters, turboprops, small planes, helicopters, gliders, balloons and drones.
  - Planes bank into turns and tip their nose up or down as they climb or descend.
  - A thin line drops to the ground, and the flat icon underneath becomes a grey shadow showing the callsign and altitude.
- **Click a plane** (or its 3D model) for its card: photo, type, operator, route, altitude and speed, registered owner (US planes), and this flight's path.
  - **Routes** come from a free community route list. For flight numbers with several stops (for example Chicago → Houston → Chicago), the card picks the leg the plane is flying from where it is, which way it's heading and whether it's climbing or descending.
  - A listed route that doesn't match where the plane actually is gets left out. If the flight path shows where the plane took off, the card says **From (airport) · destination not listed** instead. Tilted, the path is a ribbon at the plane's altitude with a curtain down to the ground. You can **follow** or **orbit** a plane.
- **Airports** shows every airport in the world. Click one for runways (with a diagram), radio frequencies, current weather, airlines, statistics and the FAA airport diagram.
- **Low Flight Paths** shows where planes fly below 3,000 ft over the last 30 days. Construction filing cards show how many low flights pass overhead and the nearest airports; for a property, use the Air Traffic Report under the card's Area reports.

---

## Market and demographics

- **Area at a Glance** in the left panel shows the census numbers for the selected area, or for what's on screen when nothing is selected.
- The **Market** tab shows one county, several counties together, or the whole region. It opens on the area selected on the map (the selected counties, or the county a drawn area sits in); with nothing selected it shows the whole region. Change it at the top: click a county's button or the small map, and click it again (or **Whole region**) to go back to all counties. The buttons under it jump to each section:
  - **Overview:** headline tiles, each with its change and a small trend line: construction under way, starting in the next 90 days, homes permitted, new businesses, jobs, population, typical rent, unemployment and building material prices. **What's moving** lists the biggest changes in plain words, and **Ask AI for a market brief** has the assistant sum them up for a construction and finishes business.
  - **Construction pipeline:** from the state's construction filings. Value under construction each month (with what's already scheduled for the next 12 months), by use (click a use for its largest projects) and by county or type, the largest projects under construction and those starting in the next 90 days. Click a project to see it on the map. A filing whose value is clearly mis-entered (over $2 billion) is left out of the totals and named. The filing list starts in November 2024, so earlier months undercount.
  - **Growth & demand:** homes permitted per year (single-family, 2–4 units, apartments), new business locations per month, jobs by industry, city sales tax per month and by city, and estimated consumer spending.
  - **Housing & rents:** home values, incomes, rents, vacancy and age from the census, household income bands, Zillow rents by ZIP (ZIPs are placed in a county by their town, so border ZIPs are approximate), and the Houston for-sale market (listing price, homes for sale, days on market, permits).
  - **Costs & rates:** 5 years of building material prices (building materials, lumber, steel, ready-mix concrete, copper), interest rates (30-year mortgage, 10-year Treasury, fed funds), today's rates and home lending.
  - **Markets** and the **Correlation explorer** (below).
  - **Area & news:** the Houston crime trend, the busiest roads, local development news, and the newest business locations, 10 at a time (**Show 10 more**).
  - Hover over any chart (bars, lines, the small trend lines) to read its numbers; click a bar for its breakdown. The 12 mo / 24 mo / All buttons set how many months the monthly charts show.
  - **Export PDF** makes a Market report with a street map of the area and every section; **Export Data** saves every number as a spreadsheet.
- **Markets**, on the Market tab, lists prices for the things that move Houston real estate, in groups you pick from the tabs:
  - oil and natural gas, and Houston's big energy and other public companies;
  - homebuilders and real estate funds;
  - building material prices (lumber, steel, concrete, copper);
  - mortgage and Treasury rates, the major stock indexes, and crypto (Bitcoin, Ethereum, Solana, XRP);
  - Houston's own monthly numbers: jobs, unemployment, housing permits, listing prices, homes for sale and days on market.
  - Each row has the latest price, today's and the past year's change, and a small chart. Crypto prices are live. Stock prices are delayed and come from an unofficial source, so treat them as a guide, not for trading. This isn't investment advice.
- The **Correlation explorer** below it answers "does this market move with Houston, and which goes first?":
  - Pick a Houston measure and a market series (or click **Correlate** on any row).
  - It compares year-over-year changes (or month-over-month) and tries every lead and lag up to 12 months.
  - It gives a verdict (strong, moderate, weak or not reliable), the lead time, and a chart of both lines. The choices and the verdict sit on the left, the chart on the right; hover over the chart for each month's actual changes, and over the lead/lag bars for each lag's correlation. **How this is measured** explains the method.
  - It is deliberately strict. It discounts for every lag it tries and for months that overlap. A link has to hold in both halves of the period to be called strong. Two unrelated prices that both rose over the years won't look related, and neither will two series that only share one extreme month, such as the spring 2020 crash.
  - Year over year is the safer choice. Most Houston numbers aren't seasonally adjusted, so month-over-month changes mostly show the seasons.
  - **What moves …?** tests your measure against every market series at once and lists the closest matches. With so many comparisons the bar is high, and often nothing passes. That is a real answer: it means no market series reliably tracks that measure.
  - **Explain with AI** asks the assistant to explain the result in plain language: what the numbers show, possible economic reasons, and what they don't prove. Correlation never proves that one thing causes another.
  - Construction filings and new businesses only go back about two years, so try month-over-month changes for them.
- **Demographics** on the map colors each census tract. Hover over a tract for its numbers.
- **Compare** puts up to 4 areas side by side. With two or more counties selected on the map, **+ Compare Together** adds them as one area and **+ Compare Each** adds every county as its own area.

---

## Construction filings

Texas requires most commercial and public construction projects to register with the state (TDLR, through its TABS system). The app loads two years of these filings for the 7 counties every night. AI reads each filing for its use, tenant, developer, architect, contractor and housing units.

- **Filing dots** are off by default. Turn them on with **Filings**. Green is new construction, grey is renovation, and a ring is an addition.
- **Filters → Construction filings:** time period, county, type, value, use, status, size, housing units, company name, exact addresses only, start or registration dates, and recent changes. On phones, Filters opens as a full sheet with **Clear All** at the top and a button at the bottom that closes it.
- **Filing card:** project details, dates, people involved, an **AI project brief** (what it is, timing, who's involved, area context), and nearby filings.
- **Timeline:** the monthly pipeline of what's under construction, plus a Gantt chart of every project. Hatched bars are dates estimated because the filer left them blank. Clicking a project or dragging across the chart turns the filings on on the map.
- **Activity:** developers, architects and contractors ranked by activity. Click one to see their projects on the map (the filings turn on).
- **Updates:** new filings and changes found by the nightly refresh.
- **Time-lapse:** the clock button on the right plays construction month by month.
- **Saved searches, links and alerts:** save a search in this browser, copy a link that reopens exactly this view, or subscribe to an RSS feed of new matching filings. RSS works with email tools like Zapier.

---

## Ask AI

The **Ask AI** button (⌘/ on a Mac, Ctrl+/ elsewhere) opens an assistant that can work the map for you. Tap the microphone to talk to it instead. For example:

- "Show medical projects over $2M near Katy starting next year."
- "What's the flood risk and traffic around this property?"
- "How far is this from me, and how's traffic getting there?"
- "Turn on radar and wind." "Tilt the map." "Back to the region."
- "What am I looking at?" "Save a note here: vacant lot, call the broker."
- "Search the web for …" (it only searches the web when you ask).
"- "How does crime in Hempstead compare with Texas?" "Is crime in Austin going up?" (anywhere in the US, from FBI yearly figures)
- "What are the safest cities in Texas over 50,000 people?" "Which Louisiana counties have the most property crime?"
- "How is oil doing this year?" "Does oil lead Houston unemployment?" "What moves Houston housing permits?"
- With a property card open: "Lay out a 25,000 sf retail strip here." "How many apartments fit on this lot?" (it starts a site plan and lays out options; see below)

Answers come with cards: summaries, charts, comparisons, places, drive times, weather, news and imagery. The suggestions above the Ask AI button change with what you're looking at.

---

## Reports and exporting

- The green **Export** button makes:
  - a **Summary report** (PDF, Excel or web page);
  - a **Filing list** (PDF, Excel, CSV or map file);
  - an **Area comparison** (PDF, Excel or CSV);
  - an **Activity report** (PDF, Excel or CSV).
- Area reports (FEMA, traffic, drive time, air traffic, crime), the City / County Crime Report, the Market report, airport reports and flight reports export as **PDFs**, and their data as CSV.
- **Every report with a place in it shows it on a street map** (roads, towns and labels) with the area outlined: area reports, the Market report, the Summary report's filings map, the area comparison (each area in its colour), airport and flight reports, and the City / County Crime Report (where the report was asked for).
- **Every PDF uses the Finishes Solutions report style:**
  - a dark title band with the logo, the green rule and the brand fonts;
  - headline figures in tiles, clean tables, and the report name and page numbers on every page.
  - Pages are portrait. The full filing list (and a comparison of four or more areas) is landscape, because it needs the width.
- A PDF filing list shows the 2,000 largest filings (1,000 when added to a Summary report). Excel and CSV always have every filing.
- If the PDF can't be made, the report is saved as a web page instead. Open it and use **Print → Save as PDF**.
- The **Reports** tab keeps your past exports in this browser. You can download one again, re-run it with today's data, or open it on the map.

---

## Notes and watchlist

- **Add a site note** at the map center or your current location: a title, tag, notes and phone photos. Notes are shared with the team and work offline.
- **Watch** any filing or building with the star. Watched filings are flagged when the nightly refresh sees a change.
- Notes export as map files (GeoJSON or KML) or a spreadsheet.

---

## Projects and site plans

Test-fit a building, or a whole mixed-use development, on one parcel or up to 20 together, by hand or with AI, and print it as a site plan sheet.

**Starting one**
- Open a property card (click a building, or open ground at street zoom) and choose **Start Site Plan** under Site Tools.
- **Several parcels as one site:** pick up to 20 (Shift-click, or **Select Multiple** on touch screens), open the **All** tab and choose **Site Plan for All**. Their outlines are merged into one site; small gaps and overlaps between neighbouring parcels (common in appraisal data) are closed up, while parcels across a road stay separate and are left out, with a note.
- Start a **new project** (named after the address) or **add the parcel to a project** you already have.
- The plan starts from the parcel's outline from the county appraisal district. Harris and Waller aren't in that data: open the card's **Regrid details** first and the plan uses Regrid's outline, or draw the site yourself (click each corner, then the first corner again).
- The map zooms to the lot. The existing buildings are hidden while you plan, and come back when you close the plan.

**Build with AI**
- Say what should go there, e.g. "25,000 sf retail strip", "6,000 sf restaurant with drive-thru", "200 apartments, 3 stories", "warehouse with truck court, as big as fits", or tap a suggestion.
- The AI turns your words into a program: the use, floor area, floors, units, number of buildings, parking ratio, setbacks and how stormwater is handled, filling gaps with typical Houston-area numbers. It lists what it assumed.
- **The whole site is used.** What you ask for is laid out as **Phase 1**, and the rest of the land holds more of the same as **Phase 2** (the same size of building, as many as fit, drawn lighter with dashed outlines), so there's no leftover lawn. Each option says how much is Phase 1 and how much Phase 2. Turn **Fill the whole site** off under Site parameters to lay out only what you asked for.
- **What you ask for is what it lays out, as closely as the site allows.** Ask for "28,000 sf of retail across 4 buildings" (or "4 buildings of 7,000 sf") and you get four buildings sharing the floor area evenly, spread along the rows with walks between them, not one big box. Apartments asked for in so many buildings are split the same way.
- The app then lays out **three options** (A, B, C) on the lot, each with its floor area, parking and coverage, and a name that says how it's arranged (for example "Rows facing the street · pond at the entry" or "Rows running back · pond at the back"). Click one to use it; **Undo** goes back.
- Every option is laid out the way a site planner draws one: the drives come first, as one connected network (drive aisles joined by curved connector drives into loops, with no dead ends), parking rows line the aisles, and the buildings sit between the rows facing their parking across a walk. Extra parking bays run between aisles where the buildings need more parking.
- **Every option is usable:** it stays inside the setbacks, nothing overlaps, it has enough parking, and every drive and parking row is reached from the entry. The app tries many arrangements and only offers ones that pass; it always shows three.
- **Apartments** get a clubhouse right by the entry with its pool on a deck beside it, garden-style buildings with staggered fronts, and a walking trail around the pond. **Shops** face their parking with pad sites (with drive-thru lanes) along the street. **Warehouses** get a truck court on the dock side. **Townhomes** sit in two rows per lane, garages on the lane.
- Leave the size out and it fits as much as the parking and detention allow; give a size or a number of units and it lays out that much. If it doesn't all fit, the option says how much did ("Fits about 160 of the 200 units asked for"). A fixed program gets the parking it needs plus about a tenth to spare, not every row the site could hold. On a deep site, shops and offices go in several rows (buildings in the lot with parking on both sides), not one row with empty land behind it. With filling off, or when another building of the asked-for size won't fit, the land left is kept in one piece as a **Future pad site** or **Future development** (with its acreage). On a big tract, a "compact, room to expand" option builds on just the part of the frontage it needs. Leave the size out and the plan fills the site with as much leasable building as parks, with only the landscape the buffers, islands and stormwater need.
- **Stormwater** is sized from the land actually developed: about 0.55 acre-feet of storage per acre, in a pond about 5 ft deep (roughly 13% of the developed land). It's a **detention** pond (a dry basin) by default, a **retention** pond (a wet pond with a permanent pool) when you ask for one, **underground vaults** under the parking (no pond) or **none** for a regional facility. Sites under an acre get none unless you choose it. Ponds are clean rectangles (or straight-edged along an L-shaped strip) beside the buildings, at the back, at the entry or at the far end of the rows depending on the option; when it can't hold it all, the option says how much would go underground.
- **Paving is one surface.** Drives, parking rows and truck courts are drawn as one paved area with a single curb line around the outside, the way the asphalt is poured, so there are no lines where a drive meets a parking row (on the map, the sheet and in CAD). Click a piece to see its own outline.
- **Markings:** stall stripes along every row, **accessible (ADA) stalls** in the rows nearest the buildings (as many as the federal table asks for, one in six van-accessible, in blue with a striped access aisle shared by each pair), and at the entry a stop bar for traffic leaving and a double yellow centre line (none where the entry has a median).
- **Trash enclosures** are left out unless you turn them on under Site parameters (or add one with Draw). When on, they're placed by the usual rules: apartments get a double enclosure (trash and recycling) for about every 50 units, or a compactor plus recycling from 200 units; shops and offices one for about every 25,000 sf, none more than about 250 ft from a building; a restaurant its own; a warehouse one per building; homes roll carts to the curb, so none. Each sits beside a drive aisle or in place of a few spare parking stalls, gate facing the drive for the truck, at least 10 ft from a building. If the plan can't find room for all of them, the option says so. Your city's solid waste rules decide in the end.
- Land the layout can't use for buildings becomes lawns, a dog park or a playground on a fill-the-site plan, not unexplained empty space.
- **Clean drawing:** the whole site is drawn as landscape under what's built on it, so there are no lawn shapes with ragged edges; ponds and parking row ends are square by default (rounded and natural curves are still a choice under Look).
- **Trees** are drawn as tree canopies on the sheet and as 3D trees on the map. The **Trees** button in the Draw row turns them on and off.
- **Building shapes:** bars (apartments with stepped fronts), **L-shaped**, **courtyard (U-shaped)** and **towers on a two-floor podium**, chosen for the whole plan under Site parameters (Building shape) or for one building in the Selected box. In 3D, buildings show a parapet round the roof and a line at each floor, and a tower rises from its podium.
- **Restaurant pads** get outdoor seating by the door and a drive-thru lane round the building. **Playgrounds** are laid out with a play structure, slide, swings and a bench, not a circle.
- **Curved pieces:** connector drives turn on arcs, the entry has curb returns and a planted median, parking rows end in rounded planted islands, and ponds, the pool and lawns are free-form shapes.
- If the AI isn't available, the app reads your words directly and still lays out the options.
- **Mixed use:** describe several uses ("37,700 sf retail with 2 pads, a commons with a lake, 120 apartments, 18 townhomes and 12 duplex units") and the site is laid out in zones from the street back, on one connected drive network:
  - shops at the front facing their parking, with pad sites along the street and a service drive behind;
  - a commons with an amenity lake that holds the site's detention, a pavilion, pickleball courts, a playground and restrooms;
  - apartment buildings with a clubhouse and pool, townhome rows on private lanes, and duplexes on a street at the back;
  - on a wide site, a main boulevard runs from the entry through every zone.
  - On a lot too shallow for every zone one behind the other, smaller zones share a row side by side (townhomes beside duplexes, the commons beside the apartments). A small program on a big tract is built along the part of the frontage it needs, and the rest is kept for a future phase. Each option notes anything that didn't fully fit.
- **Detail:** buildings are named and sized ("Apt Bldg 1 · 40 units · 42,353 sf · 3 fl", "Pad A", "Townhome Row 2"), parking has planted islands with trees, buildings have walks around them, and trees line the landscape buffer and the lake.

**Single-family homes:** choose **Single-family homes** (or say "single-family homes, mostly 2-story"). Homes go on lots along 28 ft streets, both sides of each street, with lot lines, driveways and a cul-de-sac at a dead end. Set the **home mix** (the share of 1-, 2- and 3-story homes) and the lot depth under Site parameters; each home type takes its own lot width (about 60, 50 and 40 ft).

**Changing a plan and letting it re-fit**
- Move, resize or reshape a piece of a plan from Build Options (a building, the pond, the pool) and the rest of the plan re-fits around it: drives, parking and other buildings are laid out again, and the piece you changed stays exactly where you put it (marked 📌 in the Selected box; **Let it move** releases it). A pond you enlarge counts toward the detention.
- Pieces you add by hand are kept the same way. **Re-fit Plan** in the Selected box re-fits on demand, and "Re-solve as I change settings" under Site parameters turns the automatic re-fit and re-solve on or off.
- Curved pieces (ponds, the pool, lawns, curved drives) resize from their corner handles. Ponds, pools, lawns, plazas and courts can switch between **natural curves**, a **rounded rectangle** and a **rectangle**, keeping their area.

**Drawing by hand**
- Add a **Building, Restaurant pad (drive-thru)**, Parking, **Parking garage**, Drive, Truck court, Detention, Landscape, **Playground, Courts, Pool, Outdoor seating** or Trash enclosure piece. A restaurant pad comes with its patio and drive-thru lane; a parking garage counts about one space per 330 sq ft on each level (set the levels in the Selected box). An enclosure you place stays where you put it, and the plan adds any others the rules still call for. Drag a piece to move it, its white corners to resize it, and the orange dot to turn it (it snaps to the lot's lines; hold Shift to turn freely).
- Curved pieces from Build with AI (curved drives, the entry, ponds, the pool, lawns) move as a whole: drag them or nudge them with the arrow keys. They don't resize or turn.
- Keyboard: arrow keys nudge (Shift for 10 ft), R turns 90°, Delete removes, ⌘Z / Ctrl+Z undoes.
- Parking counts its spaces as you size it (9 × 18 ft spaces on 24 ft aisles). Each pair of accessible stalls shares an aisle the width of a stall, so it costs one space; the count shown already allows for that.
- Type exact sizes, the turn, the number of floors, the building's use (which sets its parking and colour) and its name in the **Selected** box. Townhomes and duplexes also take the number of homes.
- **Street Side:** the orange line marks the side along the street. The app finds it from the map's roads; when it can't, it says the line is a guess. Click **Street Side**, then the lot line along the street, to set it. Front setbacks and drives follow it.
- **Add or Remove Parcels:** click a parcel next to the site to add it (up to 20), or one in the site to take it out; the outline is merged again and the pieces stay where they are.
- **Redraw Site** replaces the outline (for part of a parcel, or a site that doesn't follow parcel lines).
- Building heights show in 3D when you tilt the map.

**Numbers and checks**
- Site area, building floor area (and about how many apartments), coverage, FAR, parking provided against what's needed (with the accessible stalls), detention, paved area and open space.
- Red outlines and a list flag a building inside a setback, anything outside the lot, buildings overlapping other pieces, a parking shortfall, and coverage, FAR or height over the zoning limits when Regrid has them.
- **Deal summaries**, the way TestFit tabulates a scheme: acreage, FAR, building coverage, impervious coverage, units, units per acre, beds, net rentable and gross square feet and the parking ratio, plus the unit mix (units, share and net square feet of each type) or the home mix.
- **Site parameters** (changing any of them re-solves the options, or re-fits a changed plan):
  - **Program:** the use, parking per unit, per home or per 1,000 sf, floors, building depth and efficiency (net ÷ gross).
  - **Stormwater:** detention pond, retention (wet) pond, underground vaults or none; the storage per acre and the pond depth; and an optional pond size as a share of the site. A line underneath says how much storage this plan needs for its developed acres, how big the pond drawn is, and how much would go underground.
  - **Trash:** enclosures placed by the rules or none, and how many apartments or how many square feet of commercial space each one serves.
  - **Unit mix** for apartments: each unit type's size, share and beds (studio, 1, 2 and 3 bedroom to start); add or remove types. The mix sets the average unit, the unit count and the beds.
  - **Setbacks:** building setbacks front, side and rear, and the landscape buffer front, side and rear, each set turned on or off.
  - **Parking:** stall width and depth and the drive aisle width.
  - **Buildings:** building shape (bars, L-shaped, courtyard U, or towers on a podium for 4 floors and up), apartment depth, longest building and the space between buildings.
  - **Fill the whole site:** on by default (see Build with AI).
  - **Look:** trees on or off; ponds and pools as rectangles (the default), rounded rectangles or natural curves; parking rows ending square (the default) or in rounded islands; drive corners curved or square.
  - Defaults: 25 ft front, 10 ft sides, 20 ft rear, 10 ft buffer, 9 × 18 ft stalls on 24 ft aisles, and a detention pond holding 0.55 acre-feet per developed acre, 5 ft deep, on sites of an acre or more.

**Several options:** **More options…** under the three options lists every usable layout the planner found (up to 12), sorted best first or by units, floor area, parking or open space. **+ Copy** starts another option from the current one (Option B, C…). Each project keeps all its options.

**Pro forma**
- Opens under the plan and reads its buildings, units by type, homes, parking and site area. It shows the total cost (and per unit), stabilized NOI, yield on cost and spread over the market cap rate, stabilized value, profit, unlevered and levered IRR, equity multiple, peak equity and debt coverage, with the budget and the stabilized operating statement.
- **The schedule** in months: design and permits, construction, lease-up (or sales for homes) and the hold, drawn as a bar. The months are estimated from the size of the job (for example 9 months of design and permits, about 12 months plus one month per 30 apartments of construction, and lease-up at about 20 apartments a month) and can be changed.
- **Two methods.** *Month by month* (the default): land at closing, soft and hard costs spread through design and construction, equity first and then a construction loan with its interest, lease-up from empty to stabilized, refinancing into a permanent loan, and a sale at the end of the hold. *TestFit method*: the one-page annual sheet TestFit's custom pro forma uses, reproduced exactly; it puts all the money in at year 0 and starts full rents in year 1, so it reads higher, and the panel shows both.
- Assumptions to change: land price (the parcels' appraised value when the county has it), hard cost per gross square foot for each use, site work or finished-lot cost, underground stormwater storage (about $420,000 an acre-foot, counted when the plan uses vaults or its pond can't hold all the storage, and shown as its own line under site work), soft costs, contingency and developer fee, rents by unit type (or per home, or per square foot for commercial), other income, vacancy, operating costs and the property tax rate, loan-to-cost and rates, cap rates, rent and expense growth, the hold, and the schedule. Homes can be **for sale** instead of for rent (price per square foot and sales pace).
- **Pro Forma (Excel):** a workbook with the assumptions, the one-page pro forma with live formulas, the month-by-month cash flows with IRR formulas, and the budget.
- The default numbers are typical Houston-area starting points, not quotes.

**Exports**
- **Site Plan PDF:** a conceptual site plan sheet on **11 × 17** or **24 × 36** paper:
  - the plan to a standard scale (1" = 50', 100', 150'…), turned so the street is at the bottom, with a north arrow and scale bar;
  - a vicinity map, the project and sheet title, the program at a glance, and the basis of design;
  - tables for site data and land use (by zone), development program and parking, and the parcels (address, owner, acres);
  - notes on constraints and due diligence from the site's own data (flood zone, water district, school district, the busiest road and its traffic, EPA-regulated facilities nearby, a replat for several parcels) plus any problems on the plan;
  - a legend and a "conceptual, for feasibility only" disclaimer.
  - If the PDF can't be made, it's saved as a web page to print instead.
- **CAD (DXF):** opens in AutoCAD, CADCraft, LibreCAD and most CAD programs, in feet, with layers for the lot, setback line, buildings, parking, stripes, drives, detention, the curb line round all the paving, accessible stalls, pavement markings and trash enclosures, and a notes block.
- **Map File (GeoJSON)** and **Copy Summary** (the numbers as text).

**The Projects tab** lists every project: rename it, set its status (Idea, Pursuing, Under contract, Closed, Passed), keep notes, see each option's numbers, open a plan, jump to a parcel, or **Draw a Site** for land without a parcel outline.

**Good to know**
- The PDF is a conceptual sheet. It has no survey bearings, easements, utilities or title research, so it won't match an engineer's or architect's sheet; it's for feasibility and early conversations.
- A site plan is a planning sketch from the parcel outline: not a survey, and no grading, utilities, fire lanes or code review. Parcel outlines from appraisal districts can be off by several feet.
- The setbacks, parking ratios, stormwater storage and trash rules are typical starting numbers, not the rules for a specific city or drainage district. Houston has no zoning but has building lines and parking rules; other cities differ.
- Projects are shared with the team: each one is saved in this browser and synced to the team database, and the last edit wins.

---

## Where the data comes from

The **Sources** tab lists every source, what it's used for, and how fresh it is. The main ones are:

- **Parcels and owners:** county appraisal districts through the Texas GIO parcel service (free), and Regrid (paid, capped).
- **People, homes and jobs:** US Census American Community Survey (5-year averages) and Census jobs data (about two years behind).
- **Flood:** FEMA. **Traffic counts:** TxDOT. **Crime:** Houston Police (street level) and the FBI (yearly, by police department, nationwide). **Buildings:** OpenStreetMap.
- **Environment:** Texas Commission on Environmental Quality, US EPA, Railroad Commission of Texas (wells and pipelines), US Fish & Wildlife Service (wetlands) and USDA (soils).
- **Utilities:** OpenStreetMap (power lines and substations), the Public Utility Commission of Texas service-area (CCN) maps through Harris County and the Texas Water Development Board, and the City of Houston (public sewer and water mains). The federal transmission-line map (HIFLD) was taken offline in 2025, so it isn't used. Exact pipe locations, sizes and capacity come from the utility or district engineer.
- **Company owners:** Texas Comptroller franchise-tax records and the Secretary of State.
- **Google (paid, capped each month):** Google base maps, 3D city and place search, when the site's Google keys are set. A monthly allowance keeps place searches inside Google's free monthly use; past it, search uses the free sources until the next month.
- **Businesses and places:** Overture Maps and Foursquare's free open datasets, reloaded monthly (about 300,000 in the seven counties), plus OpenStreetMap.
- **Construction filings:** TDLR TABS, refreshed nightly.
- **Markets:** Yahoo Finance (stocks, funds, indexes and crypto history; delayed), Coinbase (live crypto) and the St. Louis Fed's FRED (oil, gas, building material prices, rates and Houston metro statistics).
- **Weather, radar and storms:** NOAA and Open-Meteo. **Planes:** adsb.lol and airplanes.live. **Airports:** OurAirports and the FAA.
- **County and state lines:** US Census.

---

## Good to know

- **No sale prices.** Texas doesn't publish what properties sell for. Regrid has some recorded sales, and rent and sales comps would need a paid data provider.
- **Filings are filer estimates.** Costs and dates come from whoever filed. About four in ten filings are missing a start or end date, and the app estimates those (shown hatched). AI-read fields such as use, tenant and developer can be wrong.
- **Coverage gaps:**
  - Harris and Waller aren't in the free state parcel data; use Regrid details there.
  - Street-level crime covers the City of Houston only. Elsewhere crime is yearly and department-wide (FBI), so it can't show which blocks are worse.
  - FBI crime figures come out once the year is over; the newest full year is shown. Some departments report only part of a year or have stopped reporting, and the card says so. Rates count residents only, so places with many visitors (downtowns, shopping areas) read high.
  - Business lists come from open data: most businesses are there, but some are missing, closed or slightly misplaced. They are refreshed monthly.
- **Numbers lag.** Census averages cover five years, jobs data is about two years old, and permits arrive about six weeks after the month.
- **Shared notes have no sign-in.** Anyone with the site address can edit them, unless a team passcode is set.
- **Performance.** With many layers, live planes and 3D on at once, older phones and laptops can still slow down. Selecting large areas, following planes, and toggling layers were made much faster in October 2026.

---

## Recently added

- **Site plans that fill the site and look built:** what you ask for is Phase 1 and the rest of the site holds more of the same as Phase 2; several building rows on deep sites; clean rectangular ponds and one landscape background instead of blobs; trash left out unless turned on; tree canopies and 3D trees with a Trees button; L-shaped, courtyard and tower buildings; parapets and floor lines in 3D; restaurant pads with drive-thru and outdoor seating; real playgrounds; parking garages.

- **Utilities near a site:** the property card's Site section shows the nearest power lines (with voltage and owner) and substation, who provides water and sewer here, and in Houston the nearest public sewer main; a **Power, Water & Sewer Lines** map layer; and the site plan sheet notes them. Projects now sync with the team.

- **Site plans that follow the request:** ask for a number of buildings and a floor area and you get that many buildings sharing it; parking trimmed to what's needed with the rest of the land kept for a future pad or phase; stormwater sized from the developed land as a detention pond, retention pond, underground vaults or none (with the underground cost in the pro forma); drives and parking drawn as one paved surface with one curb line; accessible stalls, an entry stop bar and centre line; and trash enclosures placed by the rules, or added by hand.

- **TestFit-style tools for site plans:** site parameters (setbacks and landscape buffers by side, parking stall and aisle sizes, building depth and length, trees on or off, natural, rounded or square shapes), a unit mix for apartments, single-family homes with a 1-, 2- and 3-story mix on lot lines, deal summaries (FAR, coverage, units per acre, beds), move or resize any piece and the plan re-fits around it, **More options…**, and a **pro forma** with a development schedule in months, a month-by-month model, TestFit's one-page method for comparison and an Excel workbook with live formulas.

- **Site plans rebuilt to be usable:** every Build with AI run gives three options that pass the checks, with one connected drive network (curved loops, no dead ends), parking rows along the aisles, buildings facing their parking, the pool beside the clubhouse at the entry, organic detention ponds, rounded parking islands and staggered apartment buildings. Leftover land becomes lawns, a dog park or a playground, or is marked for a future phase. The Build Options button keeps its size; the AI's note sits under it.

- **Site plans like a real conceptual sheet:** up to 20 parcels merged into one site, mixed-use layouts in zones (shops and pads, a commons with an amenity lake, apartments with a clubhouse and pool, townhomes, duplexes), trees, walks and planted parking islands, named buildings, and a **Site Plan PDF** on 11 × 17 or 24 × 36 with data tables, notes from the site's data and a vicinity map.
- **Projects and site plans:** start a project from any property card and lay out a site plan on the parcel, by hand or with **Build with AI** (three options with floor area, parking and coverage), checked against setbacks, and exported to CAD (DXF).
- **The app's own cursors:** a branded set that shows what a click will do, with a different one for each selection tool.
- **A new Market tab:** construction pipeline, growth, housing and rents, building material costs and rates, each in its own section with a button to jump to it, hover numbers on every chart, and a "What's moving" summary.
- **Street maps in reports:** every report PDF now shows its area on a real street map instead of a plain outline.
- **Google maps, Google 3D and Google place search** (once the site's Google keys are added): Google and Google Satellite base maps, Google's photorealistic 3D city, and Google results in search with a place card.
- **Environment layers and the Environmental report:** cleanup and contamination sites, petroleum tanks, EPA-permitted facilities, oil and gas wells and pipelines, wetlands and soils on the map, and a Phase I style records screen for any parcel or area.
- **Company behind the owner:** property cards look up company owners in the Texas Comptroller's free records: status, registered agent, mailing address and officers.
- **Businesses & Places layer:** about 300,000 businesses across the seven counties from the Overture Maps and Foursquare open data, colored by kind, with a card for each. Search finds them by name, and property cards list many more businesses than before.
- **Market tab follows your selection:** it opens on the county (or counties) selected on the map, every chart shows its numbers on hover, the Correlation explorer is compact, and the newest businesses sit at the bottom, 10 at a time.
- **Legends for Rain radar and Flood zones** in the bottom-left corner, and **Map Layers** now opens right under the quick layer buttons.
- **Area at a Glance follows your selection:** pick a county (or draw an area) and the panel shows that area's numbers instead of the map view.
- **Traffic reports for whole counties:** the traffic report now covers areas up to 5,000 square miles instead of 250.
- **Crime library and state rankings:** the FBI figures for every US city and county police department are now kept in the app and refreshed monthly, so the crime section loads faster and shows how a city ranks in its state. Ask AI can list the lowest- or highest-crime cities and counties in any state.
- **Crime by city / county, anywhere in the US:** property cards and a new City / County Crime Report show the local police department's violent and property crime rates against the state and the nation, 10 years of history and the mix of offenses, from FBI figures. Ask AI can answer crime questions outside Houston too.
- **Markets and the Correlation explorer** on the Market tab: stocks, Houston companies, homebuilders, crypto, oil and gas, building material prices and rates, with an honest test of which ones move with Houston's numbers, and an AI explanation.
- **More history:** the Houston crime trend now covers up to six years instead of two, and the Air Traffic Report can cover up to three years once enough has been collected.
- **Whole buildings:** clicking a big building selects all of it, and a building on several parcels lists every parcel with a total.
- **Tabs on the card:** Shift-click (or **Add** on touch screens) to pick up to 10 buildings, parcels, filings, planes or airports, each in its own tab, with an **All** tab that adds up the buildings.
- **A subtler dot grid:** smaller, closer and much fainter dots.
- **Phones:** the quick layer buttons sit in their own row under the search bar, clear of the map buttons.
- **The map opens clean:** no filings or planes until you turn them on, and the layer buttons always match what's on the map.
- **Compare each county separately** when several counties are selected, or all of them together.
- **A new area picker on the Market tab:** a small county map plus a button for each county and the whole region.
- **Every report now exports as a PDF in the Finishes Solutions style:** filings, market, crime, FEMA, traffic, drive time, air traffic, airport and flight reports.
- **Plane routes are back** for most airline flights, with the right leg picked on multi-stop flights.
- **Property cards show the owner and value faster:** they no longer wait for the slower business and height lookups.

- **Filters for the map's layers:** demographics, traffic and risk, alongside construction filings, plus a **Match everything** mode that finds the neighborhoods meeting every threshold.
- **Faster:**
  - Selecting a county or large area no longer freezes the page.
  - Live planes use far less effort and pause when the map is hidden.
  - Following a plane no longer floods the app with reloads.

- **County and state lines for the whole US.** The lines sharpen to exact Census boundaries when you zoom in.
- **3D plane models** when the map is tilted.
- **Quick layer buttons** under the search box, and a regrouped Map Layers panel.
- **One-click Clear** for filters, selected areas and search outlines.
- **The dot grid now covers all land** on every basemap.
- **A general real estate layout:** This Area box, Area at a Glance from the regional zoom, general tabs first.
- **Phones:** the map fills the whole screen, and the menus only scroll up and down.
- **Phones:** a tile-style More menu with one-word names matching the desktop tabs, and a simpler full-height Filters sheet. The desktop **Field Notes** tab is now **Notes**.
