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
| Crime | City of Houston only |
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
- **Area at a Glance:** who lives and works in the area on screen: population and growth, median income, home value, rent, households and jobs. It updates as you move the map.
- **This Area:** the area you've picked, or the map view if you haven't picked one. It holds the area reports, Compare, Save Search and Copy Link.
- **Construction Filings:** the construction project list, KPIs and filters. It's collapsed until you open it.

**Top of the map**
- **Tools:** Move, Area (drag a box), Shape (draw a shape), Radius (an address plus a distance), County (click counties).
- **Filters** narrow what the map shows, layer by layer (see "Filters" below). **Clear** sits right next to it; see "Clearing the view" below.
- **Export** makes a report.
- **Search** finds addresses, places, roads, businesses, projects, owners and developers. Press ⌘K (Mac) or Ctrl+K to jump to it.
- **Quick layer buttons** under the search box: Satellite, 3D, Parcels, Flood Zones, Demographics, Traffic Counts, Filings, Planes, Radar, and **More** for every layer. On a phone they're one row just under the search bar; swipe it sideways for the rest (the faded right edge means there's more).

**Right side of the map**
- Zoom in and out.
- **Compass:** back to a flat, north-up view of the same spot.
- **Near me:** the area around your location.
- **Home region.**
- **Time-lapse:** play construction month by month.
- **Map Layers.**
- **Globe view.**

**Tabs** (desktop and tablet): Map, Market, Compare, Reports, Notes, then the construction views (Timeline, Activity, Updates), and Sources.

**Phones:** the map fills the screen. The bottom bar has Map, Explore, Timeline, Activity and More. **More** opens a grid of one-word tiles:
- **Views**, named like the desktop tabs: Market, Compare, Reports, Updates, Notes, Sources.
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

Click a building, or at street zoom click open ground, to open its **property card**.

- **Ownership & value:** owner, mailing address, market, land and improvement value, year built, when it was acquired, acres, and building size. This comes from the county appraisal district through the state's parcel service.
- **The building:** footprint, height, floors and estimated floor area.
- **Site:** flood zone, traffic counts on nearby roads, water and utility districts (MUDs), tax-increment zones, Opportunity Zone, school district, bus stops, nearby environmental sites, crime nearby (Houston), and area rents and jobs.
- **Area snapshot:** census numbers for that neighborhood.
- **Businesses:** what's inside or next door (OpenStreetMap), plus businesses registered for sales tax at the address.
- **Construction filings** on the parcel.
- **From here:** distance and drive time, a drive-time map, weather, news, and site imagery (recent satellite and dated high-resolution photos).
- **Regrid details** (paid, capped each month): zoning, zoning limits such as height and density, the last sale price and date where recorded, and land use. Harris and Waller counties aren't in the free state parcel data, so Regrid fills in owner and value there.
- Street View, an orbit camera, notes, and **Ask AI** about this property.

**Big buildings:** clicking any part of a building selects the whole building, even a warehouse or shopping center that the map draws in pieces. If the building sits on more than one parcel, the card lists every parcel with its owner and value, and a total.

**Several things at once (tabs):** Shift-click to add more, up to 10. On a touch screen, tap **+ Add** at the top of the card (or **Select Multiple**), tap the other things, then **Done**. This works for buildings, parcels, construction filings, planes and airports, mixed together.
- Each one gets a numbered **tab** at the top of the card; the same number marks it on the map. Tap a tab to see that card, or its **×** to drop it.
- Shift-click something already picked to take it out. A plain click starts over with just that one; closing the card clears them all.
- With two or more buildings or parcels, an **All** tab adds them up: footprint, floor area, market value and acres (each parcel counted once), the construction filings on them, a CSV export and **Zoom to All**.

---

## Picking an area and getting reports

Choose **Area**, **Shape**, **Radius** or **County** at the top of the map and mark the area. It becomes the **selected area**, shown in the **This Area** box. From there you can run:

- **FEMA report:** flood zones, past flood insurance claims, disaster declarations and FEMA's risk index.
- **Traffic report:** the busiest roads and daily traffic counts, plus live speeds and incidents where available.
- **Drive-time map:** 10, 20 and 30-minute drive areas, with the people, households and jobs inside each.
- **Air traffic report:** how often planes pass over, how low, and which kinds.
- **Crime report** (City of Houston): incidents by type, trend, time of day, day of week, and per resident.
- **Compare:** add up to 4 areas and see them side by side.

Every report can be printed or saved as a web page or PDF and downloaded as a spreadsheet. Reports are kept in the **Reports** tab.

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

**Quick layer buttons** turn the most common layers on and off with one tap. **More** (or the layers button on the right) opens **Map Layers**, which holds every layer and its options:

- **Base Map:**
  - Default: a calm, muted map.
  - Streets.
  - Satellite.
  - Topo.
  - ESRI satellite.
  - Free Map.
- **Property & Site:**
  - 3D buildings (zoom in).
  - Parcel lines (Regrid).
  - Flood zones (FEMA).
  - Traffic counts.
  - Crime (Houston), with a choice of all, violent or property crime.
  - Airports.
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
- **Click a plane** (or its 3D model) for its card: photo, type, operator, route, altitude and speed, registered owner (US planes), and this flight's path. Tilted, the path is a ribbon at the plane's altitude with a curtain down to the ground. You can **follow** or **orbit** a plane.
- **Airports** shows every airport in the world. Click one for runways (with a diagram), radio frequencies, current weather, airlines, statistics and the FAA airport diagram.
- **Low Flight Paths** shows where planes fly below 3,000 ft over the last 30 days. Property cards show how many low flights pass overhead.

---

## Market and demographics

- **Area at a Glance** in the left panel shows the census numbers for what's on screen.
- The **Market** tab, for each county or the whole region, shows:
  - population and growth;
  - jobs and top industries;
  - new housing permits;
  - new business openings;
  - sales tax;
  - consumer spending;
  - local development news;
  - interest rates;
  - unemployment;
  - the Houston crime trend and the busiest roads.
- **Demographics** on the map colors each census tract. Hover over a tract for its numbers.
- **Compare** puts up to 4 areas side by side.

---

## Construction filings

Texas requires most commercial and public construction projects to register with the state (TDLR, through its TABS system). The app loads two years of these filings for the 7 counties every night. AI reads each filing for its use, tenant, developer, architect, contractor and housing units.

- **Filing dots** are off by default. Turn them on with **Filings**. Green is new construction, grey is renovation, and a ring is an addition.
- **Filters → Construction filings:** time period, county, type, value, use, status, size, housing units, company name, exact addresses only, start or registration dates, and recent changes. On phones, Filters opens as a full sheet with **Clear All** at the top and a button at the bottom that closes it.
- **Filing card:** project details, dates, people involved, an **AI project brief** (what it is, timing, who's involved, area context), and nearby filings.
- **Timeline:** the monthly pipeline of what's under construction, plus a Gantt chart of every project. Hatched bars are dates estimated because the filer left them blank.
- **Activity:** developers, architects and contractors ranked by activity. Click one to see their projects.
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

Answers come with cards: summaries, charts, comparisons, places, drive times, weather, news and imagery. The suggestions above the Ask AI button change with what you're looking at.

---

## Reports and exporting

- The green **Export** button makes:
  - a **Summary report** (PDF, Excel or web page);
  - a **Filing list** (PDF, Excel, CSV or map file);
  - an **Area comparison** (PDF, Excel or CSV);
  - an **Activity report** (PDF, Excel or CSV).
- Area reports (FEMA, traffic, drive time, air traffic, crime) export as web pages or PDFs and spreadsheets.
- The **Reports** tab keeps your past exports in this browser. You can download one again, re-run it with today's data, or open it on the map.

---

## Notes and watchlist

- **Add a site note** at the map center or your current location: a title, tag, notes and phone photos. Notes are shared with the team and work offline.
- **Watch** any filing or building with the star. Watched filings are flagged when the nightly refresh sees a change.
- Notes export as map files (GeoJSON or KML) or a spreadsheet.

---

## Where the data comes from

The **Sources** tab lists every source, what it's used for, and how fresh it is. The main ones are:

- **Parcels and owners:** county appraisal districts through the Texas GIO parcel service (free), and Regrid (paid, capped).
- **People, homes and jobs:** US Census American Community Survey (5-year averages) and Census jobs data (about two years behind).
- **Flood:** FEMA. **Traffic counts:** TxDOT. **Crime:** Houston Police. **Places and buildings:** OpenStreetMap.
- **Construction filings:** TDLR TABS, refreshed nightly.
- **Weather, radar and storms:** NOAA and Open-Meteo. **Planes:** adsb.lol and airplanes.live. **Airports:** OurAirports and the FAA.
- **County and state lines:** US Census.

---

## Good to know

- **No sale prices.** Texas doesn't publish what properties sell for. Regrid has some recorded sales, and rent and sales comps would need a paid data provider.
- **Filings are filer estimates.** Costs and dates come from whoever filed. About four in ten filings are missing a start or end date, and the app estimates those (shown hatched). AI-read fields such as use, tenant and developer can be wrong.
- **Coverage gaps:**
  - Harris and Waller aren't in the free state parcel data; use Regrid details there.
  - Crime covers the City of Houston only.
  - Business lists from OpenStreetMap are incomplete in some suburbs.
- **Numbers lag.** Census averages cover five years, jobs data is about two years old, and permits arrive about six weeks after the month.
- **Shared notes have no sign-in.** Anyone with the site address can edit them, unless a team passcode is set.
- **Performance.** With many layers, live planes and 3D on at once, older phones and laptops can still slow down. Selecting large areas, following planes, and toggling layers were made much faster in October 2026.

---

## Recently added

- **Whole buildings:** clicking a big building selects all of it, and a building on several parcels lists every parcel with a total.
- **Tabs on the card:** Shift-click (or **+ Add** on touch screens) to pick up to 10 buildings, parcels, filings, planes or airports, each in its own tab, with an **All** tab that adds up the buildings.
- **A subtler dot grid:** smaller, closer and much fainter dots.
- **Phones:** the quick layer buttons sit in their own row under the search bar, clear of the map buttons.

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
