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
- **Filters** narrow the construction filings. **Clear** sits right next to it; see "Clearing the view" below.
- **Export** makes a report.
- **Search** finds addresses, places, roads, businesses, projects, owners and developers. Press ⌘K (Mac) or Ctrl+K to jump to it.
- **Quick layer buttons** under the search box: Satellite, 3D, Parcels, Flood Zones, Demographics, Traffic Counts, Filings, Planes, Radar, and **More** for every layer.

**Right side of the map**
- Zoom in and out.
- **Compass:** back to a flat, north-up view of the same spot.
- **Near me:** the area around your location.
- **Home region.**
- **Time-lapse:** play construction month by month.
- **Map Layers.**
- **Globe view.**

**Tabs** (desktop and tablet): Map, Market, Compare, Reports, Field Notes, then the construction views (Timeline, Activity, Updates), and Sources.

**Phones:** the map fills the screen. The bottom bar has Map, Explore, Timeline, Activity and More. Cards slide up from the bottom: swipe down to shrink one, and swipe again to close it.

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

**Several properties at once:** Shift-click buildings (on touch screens, use the card's **Select Multiple**). You get combined acres, footprint, floor area and market value, the filings on them, and a CSV export.

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
  - Dot Grid: the halftone dot pattern over land.
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
- **Filters:** time period, county, type, value, use, status, size, housing units, company name, exact addresses only, start or registration dates, and recent changes.
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

## Field notes and watchlist

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
- **Performance.** With many layers, live planes and 3D on at once, the app can slow down or briefly freeze, especially right after picking a large area like Harris County. Improvements are in progress.

---

## Recently added

- **County and state lines for the whole US.** The lines sharpen to exact Census boundaries when you zoom in.
- **3D plane models** when the map is tilted.
- **Quick layer buttons** under the search box, and a regrouped Map Layers panel.
- **One-click Clear** for filters, selected areas and search outlines.
- **The dot grid now covers all land** on every basemap.
- **A general real estate layout:** This Area box, Area at a Glance from the regional zoom, general tabs first.
- **Phones:** the map fills the whole screen, and the menus only scroll up and down.
