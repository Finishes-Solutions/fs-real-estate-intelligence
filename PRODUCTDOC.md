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
- **Install it like an app:** on a computer (Chrome or Edge) or an Android phone, open **Settings → App → Install app** when it's offered, or use the install button in the browser's address bar. On an iPhone, use Safari's Share → Add to Home Screen. It opens in its own window and keeps working with a weak signal; data refreshes when you're back online.
- The map opens on the home region. The **house** button on the right always brings you back.
- On your first visit a short **Getting started** tip sits at the top of the Map's left panel. **Got it** hides it; **?** (Data & help) → **Getting started**, or Settings → Help, brings it back.

---

## The screen at a glance

**The top bar** (computer and tablet) runs across the whole window and is the same on every page:
- On the left: the panel button (shows or hides the Map's left panel), the logo, and five places to go: **Map**, **Filings**, **Market**, **Reports** and **My Work**.
- On the right: **Ask AI**, **?** (Data & help: where every number comes from and how fresh it is) and the **gear** (Settings: everything you set once, in one place; see **Settings** below).

Three of the five hold more than one page. A row of buttons at the top of the page switches between them, and the place remembers the page you used last:
- **Filings:** Timeline, Companies (who's building the most) and Changes (what the nightly check found).
- **Market:** Overview and Compare areas.
- **My Work:** Projects, Notes & watchlist, and Saved searches.

A small green number means something new needs a look: on **Changes**, the filings that are new or changed since you last opened it; on **Notes & watchlist**, watched filings that changed. The number also shows on the place above it (Filings, My Work). Plain grey numbers are just counts (your projects, the areas in Compare).

**Left panel** (on phones, the **Explore** tab), top to bottom. Every block is the same card, so the edges line up:
- **The area bar** stays pinned at the top while the panel scrolls. It names what the panel is about: the area you've picked (with what kind it is: box, shape, radius, county or place) or, with nothing picked, the map view and the nearest town. Under the name: how many filings match and their value (always shown, even with the filing dots off), **+ Compare**, and a **⋯** menu with **Save search**, **Copy link** and **Filing alerts (RSS)**. Save search and alerts appear once you've set a filter or picked an area. The **×** clears the picked area; your filters stay. With nothing picked, **Box**, **Shape**, **Radius** and **County** buttons start the same tools as the map's toolbar (on a phone they switch to the Map first).
- **Saved searches:** a short list of the searches you saved, with **Manage in My Work →**. It only shows once you've saved one.
- **Area at a Glance:** who lives and works in the picked area, or in the area on screen when nothing is picked: population and growth, median income, home value, rent, households and jobs. The area bar above names the area it covers. With nothing picked it updates as you move the map.
- **Reports for this area:** one row per area report (FEMA, Environmental, Crime, Drive-Time, Traffic, Air Traffic) with a line on what it covers. With an area picked they run on it; without one, the rows say **Run on map view** (FEMA and Environmental need a picked area, so they show once you pick one). Crime covers the City of Houston only, so elsewhere its row is greyed out and says **Houston only**. **All reports →** opens the Reports page.
- **Construction Filings:** the header shows the live count, value and area (for example "3,889 filings · $12.08B · Harris County") and the dates the data covers, even while the section is closed. The **On map** switch shows or hides the filing dots and always matches the map. Opening the section by hand also turns the dots on; a section left open from your last visit doesn't, and the switch says which. Inside: the headline metrics (**+ Metrics** picks them), the project list, and a short note on where the filings come from and how far to trust them. It's closed until you open it; on phones, the Explore tab opens it for you.
- **The last line** links to **Data sources & freshness** and credits the base maps.

**Top of the map**, top to bottom:
- **Search** (first row).
- **The tool row:** Move, Area (drag a box), Shape (draw a shape), Radius (an address plus a distance), County (click counties), then **Layers**, **Filters** and **Export**. When the map is narrow (a tablet, or with Ask AI open) the buttons drop their names and keep their icons instead of wrapping: Export's name goes first, then the five tools', then Layers' and Filters'. If even the icons don't fit, the five tools fold into one **Select ▾** button that lists them by name. Hover over any icon for its name. The search box and these buttons stay on screen while Ask AI is open.
- **Cursors** (mouse or trackpad) show what a click will do: the dark arrow for nothing in particular, a green arrow over anything you can open or select, a small building at street zoom when a click opens that building, four arrows while you drag the map, and a crosshair with a small badge for each drawing tool (a dashed box for Area, a shape for Shape, a circle for Radius, a county for County). Text boxes keep the normal text cursor.
- **Layers** opens the Map layers panel right under it. Its number says how many layers are drawing on the map (see "Map layers" below).
- **Filters** narrow what the map shows, layer by layer (see "Filters" below). Its number counts the filters that are on, and in **Match everything** mode it reads **Filters · Match**.
- **Export** makes a report.
- **Search** finds addresses, places, roads, businesses, projects, owners and developers. Press ⌘K (Mac) or Ctrl+K to jump to it. When Google is set up for the site, a **Google** section lists Google's matches too; picking one switches to the Google map and opens a Google place card (address, phone, website, hours, rating and a link to Google Maps).
- **Quick layer buttons** under the tool row, always on one line: Parcels, Flood Zones, Demographics, Traffic Counts, Filings, Planes, Radar, then Satellite and 3D at the end. Scroll the row sideways (or use the mouse wheel over it) for the rest; a faded edge shows there's more that way. On a phone the row sits just under the search bar.
- **The filters in effect** show under the layer buttons as chips, one per filter: for example **Harris ×**, **Medical ×**, **Violent crime ×**, **Under construction · Oct 2025 ×** or **Match everything ×**, plus the picked area and a searched place's outline. Click a chip's **×** to drop just that one; **Clear all** at the end clears them all. With nothing narrowing the map, the row isn't there.

**Right side of the map:** only buttons that move the map, in two groups, each with its name when you hover over it:
- Zoom in and out.
- **Compass:** back to a flat, north-up view of the same spot.
- **Near me:** the area around your location.
- **Reset view ▾:** **Whole region** (back to the full Houston region) or **Globe**.

Time-lapse is now on the Filings layer and the Filings legend (see "Construction filings"), and Map layers is the **Layers** button in the tool row.

**Legend:** one card in the bottom-left corner lists every layer that's colouring the map. One layer's key is open at a time (the newest one you turned on); click another layer's name to open it instead. The arrow at the top folds the whole card down to its title, and the app remembers that. On phones it starts folded.

**Pages use the whole width.** The left panel belongs to the Map: on every other page (Market, Reports, Notes & watchlist, Companies and the rest) it steps aside so the page has room, and it comes back on the Map just as you left it, at the same width, open or closed. To glance at it from a page, click the panel button at the far left of the top bar; that only affects the page you're on. On a tablet the panel starts closed so the map isn't cut in half; open it with the same button, and the app remembers your choice. When the assistant or a filing card is open beside a page on a computer, the page narrows to make room for it instead of hiding behind it, and the page's buttons move under its title if they no longer fit beside it.

**Every page is laid out the same way.** At the top: the page's name, its title and a short summary on the left, and its main buttons on the right (on phones they sit under the title). Downloads are under one **Export ▾** button that lists what you can save. Pages that follow the filters (Timeline, Companies, Changes, Compare areas and Reports) have a bar under the title with the number of filings and their value, each filter as a chip you can remove with its **×**, **Edit filters** and **Reset**. **Edit filters** opens the filters right there on the page, so you can change them and watch the page update without going to the Map. When a page has nothing to show yet, it says why and offers the next step.

**Back to where you were:** when something on a page takes you to the Map (a company, a change, a saved search, a past report), a **← Back to …** button appears at the top left of the map. It returns you to that page, scrolled to where you were. Its **×** dismisses it, and picking another page clears it.

**Buttons** follow one pattern everywhere: the main action is a solid green button and the other choices are outlined. On touch screens every button, chip and map control is at least a fingertip wide, and close (×) buttons are easy to hit. Buttons, toggles and rows react when you hover over or press them.

**The app is light only.** There is no dark mode.

**Browser Back and Forward** move between the app's pages (Map, Timeline, Market, a project's page…) instead of leaving the app. Your filters and the area you picked stay as they are; only the page changes.

**Keyboard:** every button, link and field shows a clear green outline when you reach it with Tab. Switching pages from the top bar with the keyboard puts you on the new page's title, and screen readers say which page opened. Dialogs such as Export keep Tab inside them until you close them (Esc), then return you to the button that opened them. If your device is set to reduce motion, the app's animations are switched off (busy spinners keep turning slowly).

**Phones:** the map fills the screen. The bottom bar has **Map**, **Explore** (the left panel), **Filings**, **Market** and **More**. Filings and Market open the page you used last, with the same row of page buttons at the top as on a computer. **More** is a short list in groups:
- **My Work:** Projects, Notes & watchlist, Saved searches.
- **Reports & export:** the Reports page, and **Quick export** for a report straight from the map.
- **Map tools:** Layers, Nearby (the area around you) and Pin a note (a site note at your location).
- **Settings:** opens the full Settings page (your name and team, the map, install and the rest). The gear at the top of **Explore** opens it too.
- **Data & help:** data sources and how fresh they are.

The tab you're on is lit: Market stays lit on Compare areas, and More is lit on its pages (for example Notes & watchlist). A green number on More means something inside it needs a look.

On the phone map, the five area tools are one **Select ▾** button at the top left. It opens a short list (Move, Area, Shape, Radius, County); pick one and a **Drawing a shape · Cancel** chip shows until you finish or tap Cancel. **Filters** is the funnel button in the search bar, and **Layers** is the stacked-squares button on the right. Both open as sheets from the bottom with a **×** at the top and a big button at the bottom (**Show results (N)** or **Done** for Filters, **Done** for Layers); the search bar and layer buttons stay in view above the Layers sheet.

Cards slide up from the bottom and open part-way, showing the title, the owner and value line and a row of buttons along the bottom (**Ask AI**, **Site plan**, **Watch** and **⋯**). Swipe up for half the screen, then the full screen. Swipe down to step back, down to just the title bar; swiping never closes a card, only the **×** does.

---

## Settings

Everything you set once lives in one place: the **gear** at the top right on a computer or tablet (or press **Ctrl+,**, **⌘,** on a Mac), and **More → Settings** or the gear at the top of **Explore** on a phone. It slides in from the right on a computer and fills the screen on a phone; **Esc**, the **×** or a click outside closes it. The row of buttons at the top jumps to each part.

- **You & your team:** **Your name** (shown on notes and site plans you add or edit), the **team passcode** if your team uses one (hidden once saved, with **Change**), whether notes and projects are shared with the team or kept on this device, when they last synced, how many changes are waiting, and **Sync now**. Notes & watchlist and Projects show a small line at the top (for example "Shared with the team · Matthew"); click it to come here.
- **Map:** the **Default base map** the map opens with (Default, Streets, Satellite, Topo, ESRI imagery or Free Map). **Map layers & display…** opens the Layers panel (dot grid, county lines, roads, road names, 3D and every data layer), and **Headline metrics…** opens the picker for the numbers above the filing list. **Show sources on cards and panels** adds a source line under the numbers on property cards and panels (exported reports always list their sources). **Panel width: Reset** puts the Map's left panel back to its normal width after you've dragged it.
- **Saved on this device:** how many saved searches, Compare areas, site notes, projects and saved report files this browser holds, each with **Open**.
- **App:** **Install app** when your browser offers it (or how to install on an iPhone, or "Installed ✓"), the keyboard shortcuts, and **Reset layout**. Reset layout asks first, then puts the panel (open or closed, and its width), its sections, the assistant's width, headline metrics, timeline options, export choices and the Projects view back to how they started, and reloads. Your notes, projects, saved searches, team sharing and other settings are kept.
- **Help:** **Getting started** (the first-visit tip again), **Data sources & freshness**, and **Save voice log** (what the voice assistant heard and did this visit, for troubleshooting when it doesn't respond).

When something isn't set up on your site (team sharing, live traffic), the app says so in plain words, such as "Not available on this site", instead of a technical message.

---

## Looking up a property

Click a building, or at street zoom click open ground, to open its **property card**. On a computer it fills the right side of the map from top to bottom, and the map buttons move to its left, so nothing on the map hides behind it. The owner and value show first, usually within a couple of seconds; the businesses, height and photo fill in after.

**The top of the card** says what it is and where ("Parcel · Harris County"), the address (or "Unaddressed parcel"), and the owner and value under it. Under that is a row of buttons that stays in reach while you scroll:
- **Ask AI** about this property (it's ready as soon as the parcel record arrives).
- **Site plan** (see "Projects and site plans" below).
- **Watch** adds it to your watchlist; it reads **Watching** while it's on the list.
- **⋯** holds the rest: **Street View ↗**, **Add site note**, **Orbit view**, **Select more** (to pick more buildings or parcels), **Copy link** (a link that opens this property) and **Export details (CSV)**.

Scroll down and the top folds to just the title and the buttons.

- **Ownership & value:** owner, market, land and improvement value, year built, when it was acquired, acres, and building size. This comes from the county appraisal district through the state's parcel service. **More record details** opens the mailing address, the legal description and every field in the appraisal record.
  - **Zoning & last sale: Get from Regrid** looks those up (paid, capped each month; the button says how many lookups are left). The Regrid record shows right under Ownership.
  - Where the state data has no parcel (all of Harris and Waller counties), the section starts with a big **Get owner, value & zoning from Regrid** button instead.
- **Company behind the owner:** when the owner is a company (an LLC, partnership, corporation or trust), the card looks it up in the Texas Comptroller's free public records and shows one line: the name, whether it's active, when it was formed and its registered agent. **Details** opens the rest: where it was formed, its mailing address and the officers, managers or members from its latest public report. If the name doesn't match exactly, similar names are listed to pick from. People's names are never looked up.
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
- **Regrid details** (paid, capped each month, from the Ownership section): zoning, zoning limits such as height and density, the last sale price and date where recorded, and land use. Harris and Waller counties aren't in the free state parcel data, so Regrid fills in owner and value there.

**Section buttons** under the action row (Owner & value, Building, Site, Crime, Area…) jump to that section, with its heading just below the card's header. As you scroll, the button for the section you're reading lights up, and the row fades at an edge when there are more buttons past it.

**Reports and filings opened from the card come back to it:** a Crime, FEMA, Environmental or other area report from the Site section, a filing under Construction filings, a drive-time map or a new site note opens in the card with **← 1200 Main St** (the property's name) at the top. Click it, or press Esc, to return to the property just as you left it: same tabs, same spot in the card, still highlighted on the map. The filing card works the same way for its drive-time map and notes.

**Esc** closes the card (or goes back, as above), but never a site plan (there Esc steps back instead; see Projects and site plans), not while you're typing in a box, and not when it's closing something else first: Esc in the search box closes its results, and Esc with Map layers or a menu open closes just that.

**Big buildings:** clicking any part of a building selects the whole building, even a warehouse or shopping center that the map draws in pieces. If the building sits on more than one parcel, the card lists every parcel with its owner and value, and a total.

**Several things at once (tabs):** Shift-click to add more, up to 20. On a touch screen, choose **⋯ → Select more** on the card, tap the other things, then **Done**. This works for buildings, parcels, construction filings, planes and airports, mixed together. With just one thing picked there are no tabs; they appear as soon as there are two.
- Each one gets a numbered **tab** at the top of the card; the same number marks it on the map, in the middle of the building or parcel. Parcels picked as open ground keep a faint outline while you look at another tab. Tap a tab to see that card, or its **×** to drop it.
- Shift-click something already picked to take it out (for a parcel, anywhere inside it). A parcel is never added twice. A plain click starts over with just that one; closing the card clears them all.
- With two or more buildings or parcels, an **All** tab adds them up: footprint, floor area, market value and acres (each parcel counted once), the construction filings on them, a CSV export and **Zoom to All**.

---

## Picking an area and getting reports

Choose **Area**, **Shape**, **Radius** or **County** at the top of the map and mark the area. It becomes the **selected area**, named in the area bar at the top of the Map's left panel. From **Reports for this area** just below it you can run:

- **FEMA report:** flood zones, past flood insurance claims, disaster declarations and FEMA's risk index. Any size of area works, up to a whole county: flood-zone shares are measured at about 900 evenly spaced points for larger areas, and claims are read for every census tract touching the area. If some tracts can't be read in time, the report says how many so you can run it again.
- **Environmental report:** a screen of state and federal environmental records around the area or a parcel (from a property card's **Area reports**, it uses the parcel itself): cleanup and contamination sites, leaking and registered petroleum tanks, landfills, EPA-permitted facilities, oil and gas wells (including orphan wells) and pipelines, wetlands and soils. Each kind is searched out to the distance a Phase I environmental assessment would use (¼ to 1 mile from the edge of the site), nearest first, with distance and direction, and the table shows how many are **on the site** itself. Any size of area works, up to a whole county: every record is counted, and when a kind has more than 1,000 the report lists the on-site and nearest ones while **Export CSV** gathers all of them (it can take a minute for a county). Larger areas show each soil's **share** of the site. If a source doesn't answer in time, its row says so with a **Retry** button that asks that source again. Exports as PDF or CSV. It is a screen of public databases, not a Phase I.
- **Traffic report:** the busiest roads and daily traffic counts, plus live speeds and incidents where available. Works for any area up to several counties. For big areas it lists the busiest roads and maps the 1,000 busiest counted segments; **Export CSV** lists every counted segment. Incidents are only the ones inside the area.
- **Drive-time map:** 10, 20 and 30-minute drive areas, with the people, households and jobs inside each. The bands stay on the map while you go back to the property card or run a report on one of them, and go away when you close the card (× or Esc). **Clear from map** in the card or in the map legend removes them any time.
- **Air traffic report:** how often planes pass over, how low, and which kinds. Any size of area works.
- **Crime report** (City of Houston): incidents by type, trend, time of day, day of week, and per resident. Any size of area works, from a block to the whole city; only incidents inside Houston are counted. A neighbourhood takes a second or two; an area covering most of the city can take up to about 20 seconds. Outside Houston its row is greyed out.
- **City / County Crime Report** (anywhere in the US, from the **Reports** page): the police department at the middle of the map or of the selected area, with the same figures as the property card's Crime by city / county.
- **Compare:** **+ Compare** in the area bar adds up to 4 areas to see side by side.

Every report exports as a PDF in the Finishes Solutions style, and its data as a spreadsheet. Reports are kept on the **Reports** page.

If a report can't finish, it says why in plain words (for example "The server took too long on this area. Try again…") instead of a technical error.

### Clearing the view

Everything that narrows what you see shows as a chip under the map's layer buttons: each filter, a time period other than the last 12 months, a time-lapse month, the selected area and a searched place's outline. Click a chip's **×** to drop just that one, or **Clear all** at the end of the row to clear everything (and switch Filters back to **Filter each layer**). On phones, the **✕** next to the filter button clears everything. Inside the Filters menu, **Clear All** is at the top whenever there's something to clear.

---

## Filters

**Filters** works on the map's layers, not just construction filings. It has a section for each kind of data:
- **Construction filings** (first, and open when the panel opens): the filing filters (period, county, type, value, use and so on). When matching, this section also offers the number of construction projects in an area.
- **Demographics:** median household income, population growth, home value, rent, housing vacancy, and jobs located here.
- **Traffic:** the busiest road, in vehicles a day.
- **Risk:** which flood zones show (all of them, or only the high-risk 100-year floodplain), the crime type (Houston), and, when matching, FEMA's flood risk rating. The crime type is the same setting as the one under Crime in Map layers: change it in either place and both follow, the Filters number counts it, and it's kept for your next visit.

The switch at the top picks how the filters work, and the line under it says what the chosen mode does:
- **Filter each layer:** each filter acts on its own layer.
  - Demographic thresholds fade the neighborhoods that don't qualify on the Demographics layer.
  - The traffic threshold hides quieter roads on Traffic Counts.
  - The risk choices change the flood and crime layers.
  - Setting a filter turns its layer on.
- **Match everything:** the app looks for neighborhoods (census tracts) that meet **every** threshold you set. For example: income at least $100K, growth at least 5%, at least 5 construction projects, and low flood risk.
  - Matching areas are outlined in green and the rest of the map fades.
  - The panel says how many areas match, and **Zoom to matches** frames them.

On the Filings pages, Compare areas and Reports, **Edit filters** opens the same panel over the page with just the construction filters, so you can change them without leaving the page. Close it with the **×**, Esc or a click elsewhere.

The summary at the top of the panel lists everything that's on, and **Clear All** resets it (and goes back to **Filter each layer**). With only the usual last-12-months period set, it just says **No filters on**. The chips under the map's layer buttons show the same filters, each removable on its own. On phones the big button at the bottom reads **Show results (N)** while something narrows the filings, and **Done** when nothing does. The busiest-road and flood-rating data for matching is added by the nightly data refresh; until it arrives, those two thresholds are left out of the match, and the panel says so.

Property filters (use, acres, value, year built, owner, zoning) are planned. They need the county appraisal data to be loaded first.

## Map layers

**Quick layer buttons** turn the most common layers on and off with one tap. A button is highlighted whenever its layer is on the map, however it was turned on. **Filings** covers both the dots and the heatmap, and turning it off hides both.

**Layers** (in the map's tool row, next to Filters) opens the **Map layers** panel right under it, with every layer and its options. The number on the button counts every layer drawing on the map, including ones without a quick button (crime, airports, weather and others); hover over it to see which. Click **Layers** again, the ×, press Esc, or click anywhere on the map to close it. In the panel:
- The title stays at the top while you scroll and says how many layers are on (for example "Map layers · 2 on").
- **On now** lists every layer that's on, each with a switch to turn it off.
- The layers are in groups that fold open and closed, each showing how many of its layers are on. Groups with something on open by themselves; with nothing on, Construction filings opens.
- Layers your site can't offer are greyed out with **Not available on this site**.

**Legend:** one card in the bottom-left corner explains the layers that are on: filings, demographics, traffic counts, drive times, planes, crime, airports, **Rain radar** (light to severe rain) and **Flood zones** (FEMA's own colors: high-risk 100-year floodplain, floodway, moderate 500-year zone). One layer's key is open at a time; click another layer's name to switch, or fold the card with the arrow at its top. The filings key shows at every window size.

The map always opens without construction filings or planes. Turn them on with their buttons. A shared link that carries filing filters opens with the filings shown.

The groups in Map layers:

- **Construction filings:**
  - show the filing dots, the same size or sized by value, and **▶ Play by month** (the time-lapse);
  - an activity heatmap.
- **Base map, imagery & 3D:**
  - Default: a calm, muted map.
  - Streets.
  - Satellite.
  - Topo.
  - ESRI satellite.
  - Free Map.
  - Google and Google Satellite (only when Google is set up for the site): Google's own map, with the Google logo and map credits at the bottom while it's on.
  - 3D buildings (zoom in).
  - Google 3D (only when Google is set up): Google's photorealistic 3D model of the city in place of the simple blocks. Zoom in to street level and tilt the map. Clicking a building still opens its property card.
  - 3D terrain, NASA recent imagery and high-resolution site imagery.
- **Property & site:**
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
- **Live conditions:**
  - rain radar, lightning, satellite clouds, wind;
  - hurricanes and tropical storms;
  - live traffic;
  - live planes, low flight paths.
- **Map display** (last): the map's own details, which stay here:
  - Dot grid: a faint dot texture over land.
  - County & state lines: every US county, with exact Census boundaries when you zoom in.
  - Roads and road names.

To tilt the map, use the **3D** quick button.

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

- **Area at a Glance** in the left panel shows the census numbers for the selected area, or for what's on screen when nothing is selected. The area bar above it names the area.
- The **Market** page (Market → Overview) shows one county, several counties together, or the whole region. It opens on the area selected on the map (the selected counties, or the county a drawn area sits in); with nothing selected it shows the whole region. The bar under the title names the area; click **Change** to pick a county's button or click the small map, and click it again (or **Whole region**) to go back to all counties. The buttons under it jump to each section:
  - **Summary:** headline tiles, each with its change and a small trend line: construction under way, starting in the next 90 days, homes permitted, new businesses, jobs, population, typical rent, unemployment and building material prices. **What's moving** lists the biggest changes in plain words, and **Ask AI for a market brief** has the assistant sum them up for a construction and finishes business.
  - **Construction pipeline:** from the state's construction filings. Value under construction each month (with what's already scheduled for the next 12 months), by use (click a use for its largest projects) and by county or type, the largest projects under construction and those starting in the next 90 days. Click a project to see it on the map. A filing whose value is clearly mis-entered (over $2 billion) is left out of the totals and named. The filing list starts in November 2024, so earlier months undercount.
  - **Growth & demand:** homes permitted per year (single-family, 2–4 units, apartments), new business locations per month, jobs by industry, city sales tax per month and by city, and estimated consumer spending.
  - **Housing & rents:** home values, incomes, rents, vacancy and age from the census, household income bands, Zillow rents by ZIP (ZIPs are placed in a county by their town, so border ZIPs are approximate), and the Houston for-sale market (listing price, homes for sale, days on market, permits).
  - **Costs & rates:** 5 years of building material prices (building materials, lumber, steel, ready-mix concrete, copper), interest rates (30-year mortgage, 10-year Treasury, fed funds), today's rates and home lending.
  - **Markets** and the **Correlation explorer** (below).
  - **Area & news:** the Houston crime trend, the busiest roads, local development news, and the newest business locations, 10 at a time (**Show 10 more**).
  - Hover over any chart (bars, lines, the small trend lines) to read its numbers; click a bar for its breakdown. The 12 mo / 24 mo / All buttons set how many months the monthly charts show.
  - **Charts fill their boxes:** every chart is drawn at the width of its box, so text reads at the same size everywhere. The headline tiles fill whole rows, the price charts sit three to a row (two on a tablet, one on a phone), and boxes side by side end level. The page opens faster, and new data (crime, traffic, live prices) only redraws its own section, so open lists and your scroll position stay put.
  - **Charts move with the data:** the first time a chart comes into view its bars grow up and its lines draw across (once; coming back to the page doesn't replay it). Switching 12 mo / 24 mo / All, the county, a chart's series or a pinned bar glides the bars and lines to their new values, so you can see what changed. Live market prices refresh every minute without the charts starting over. While a section's data loads you see a plain grey placeholder, never made-up numbers. If your device is set to reduce motion, charts simply appear; printed pages and PDF exports always show the finished charts.
  - **Export ▾ → Market report · PDF** makes a Market report with a street map of the area and every section; **Market data · CSV** saves every number as a spreadsheet.
- **Markets**, on the Market page (Market → Overview), lists prices for the things that move Houston real estate, in groups you pick from the tabs:
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
- **Compare** puts up to 4 areas side by side. Every area gets the same filters, shown as chips at the top. With fewer than two areas, **Pick on the Map** takes you to the Map to choose them. With two or more counties selected on the map, **+ Compare Together** adds them as one area and **+ Compare Each** adds every county as its own area.

---

## Construction filings

Texas requires most commercial and public construction projects to register with the state (TDLR, through its TABS system). The app loads two years of these filings for the 7 counties every night. AI reads each filing for its use, tenant, developer, architect, contractor and housing units.

- **Filing dots** are off by default. Turn them on with **Filings** (above the map) or the **On map** switch on the panel's Construction Filings header. Green is new construction, grey is renovation, and a ring is an addition.
- **Filters → Construction filings:** time period, county, type, value, use, status, size, housing units, company name, exact addresses only, start or registration dates, and recent changes. On phones, Filters opens as a full sheet with **Clear All** at the top and a button at the bottom that closes it.
- **Filing card:** project details, dates, people involved, an **AI project brief** (what it is, timing, who's involved, area context), and nearby filings. Its top row has **Ask AI**, **TABS record ↗**, **Watch** and **⋯** (Street View, Add site note, Select more and Copy link).
- **Timeline** (Filings → Timeline): the monthly pipeline of what's under construction, plus a Gantt chart of every project. Hatched bars are dates estimated because the filer left them blank. Clicking a project opens its card over the page; dragging across the chart turns the filings on on the map. **Export ▾** saves the filing list as Excel, CSV or PDF.
- **Companies** (Filings → Companies): developers, architects and contractors ranked by activity; switch between Developers, Architects and Contractors at the top. Click one to see their projects on the map (the filings turn on), and use **← Back to Companies** to return to the same spot in the list. The list shows the top 150 by value; search to find the others. **Export ▾** saves the Activity report as PDF, Excel or CSV. On phones each company is a two-line row.
- **Changes** (Filings → Changes): new filings and changes found by the nightly refresh. It opens on **Last 7 days**, which counts the same filings as the green number and the "New this week / Any change" filters; each single nightly check is still in the list. A line under the title says how many changed filings match your filters out of the total, with **Show all** to see every one. Clicking a change opens the filing's card over the page; **Show on map** on the card goes to the map. The green number on Changes counts what's new since you last looked and clears when you open it.
- **Time-lapse:** **▶ Play by month** on the Filings row in Map layers, or on the Filings legend, plays construction month by month. It turns the filings on first. The month shows as an **Under construction · Oct 2025 ×** chip under the layer buttons; its **×** (or **Stop time-lapse**) ends it, and a shared link with a month opens straight into the time-lapse.
- **Saved searches, links and alerts:** from the **⋯** menu in the area bar at the top of the Map panel, save a search in this browser (you name it right in the menu), copy a link that reopens exactly this view, or subscribe to an RSS feed of new matching filings. RSS works with email tools like Zapier. Your saved searches are listed under **My Work → Saved searches** (the same list as in the panel), each with how many new filings match it, **Show on map**, its RSS feed and **Delete**. With none saved yet, the page explains how to save one.

---

## Ask AI

The **Ask AI** button in the top bar, on every page (on phones, the sparkle in the search bar; ⌘/ on a Mac, Ctrl+/ elsewhere), opens an assistant that can work the map for you. Opened over a page, it sits on the right and the page makes room for it. Tap the microphone to talk to it instead. For example:

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

Answers come with cards: summaries, charts, comparisons, places, drive times, weather, news and imagery. When it opens, its suggested questions change with what you're looking at.

While it works, a quiet line at the bottom of the chat says what it's doing ("Thinking", then "Looking at the map…", "Checking the air traffic…"). Once the answer arrives, the steps fold into one line above it, **Worked through 3 steps**, which you can open to see them. The pencil-on-a-square button at the top starts a new chat.

---

## Reports and exporting

- The green **Export** button on the map opens **New report**, which makes:
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
- The **Reports** page (in the top bar) starts with **Recent exports**: your latest past exports, kept in this browser, with **Show all** for the rest and a search. You can download one again, re-run it with today's data, or open it on the map. Below that, new reports come in two groups:
  - **From your filters** (with the number of filings once, at the top, and your filters as chips you can change with **Edit filters**): Summary, Filing list, Area comparison and Activity reports.
  - **For an area** (the area you selected, or the map view): Market, crime, drive time, traffic, air traffic and the other area reports.
- The **New report** dialog has a link at the bottom to the Reports page, for the other reports and your past exports.

---

## Notes and watchlist

Find them under **My Work → Notes & watchlist**.

- **+ Site note** adds a note at your current location (or the map center); with nothing saved yet, **+ Site note at map center** does the same from the empty page. A note has a title, tag, notes and phone photos. Notes are shared with the team and work offline.
- **Watch** any filing or building with the **Watch** button at the top of its card ("Added to My Work › Watchlist"; the button then reads **Watching**). Watched filings are flagged when the nightly refresh sees a change. The watchlist is listed first, then your site notes.
- **Export ▾** saves everything as GeoJSON (with or without photos), CSV or KML, and **Import…** in the same menu loads a GeoJSON file exported from here.
- The button beside them says whether notes are shared with the team or kept on this device, and your name (for example "Shared with the team · Matthew"). Click it to set your name or the team passcode in **Settings → You & your team**.

---

## Projects and site plans

Test-fit a building, or a whole mixed-use development, on one parcel or up to 20 together, by hand or with AI, and print it as a site plan sheet.

**Starting one**
- Open a property card (click a building, or open ground at street zoom) and click **Site plan** at the top of the card.
- **Several parcels as one site:** pick up to 20 (Shift-click, or **⋯ → Select more** on the card on touch screens), open the **All** tab and choose **Site Plan for All**. Their outlines are merged into one site; small gaps and overlaps between neighbouring parcels (common in appraisal data) are closed up, while parcels across a road stay separate and are left out, with a note.
- Start a **new project** (named after the address) or **add the parcel to a project** you already have. Your very first plan skips this choice: the project is made for you, named after the address. While you choose, the site's outline is drawn dashed on the map.
- **Coming back to a parcel:** if the parcel is already in a project, the card says so first (**Already in (the project) · Option A · 25,000 sq ft**) with **Open Plan** to carry on where you were, or **New Option** to start another option in that project, and the choice below is set to that project, so the same land doesn't end up in a second project. The property card's button then reads **Open site plan**.
- **Find a Parcel** on a project with no parcels yet: the next parcel you open and click **Site plan** on goes into that project (the card reads **Add a parcel to (the project)**, with it already chosen).
- The plan starts from the parcel's outline from the county appraisal district. Harris and Waller aren't in that data: use **Get owner, value & zoning from Regrid** in the card's Ownership section first and the plan uses Regrid's outline, or draw the site yourself (click each corner, then the first corner again).
- Planning takes over the map: the left list folds away, the area tools, Filters, Export and the layer buttons step aside (**Layers** stays), and the map zooms so the whole site sits in the open part of the map, clear of the plan panel and the search. The existing buildings are hidden while you plan. Everything comes back as it was when you close the plan, including the left list open or folded as you had it.
- The map refits to the site when the window or the left list changes size, never while you're moving the map yourself. The **Fit plan** button (top of the map buttons, while a plan is open) brings the whole site back into view.

**Build with AI**
- Say what should go there, e.g. "25,000 sf retail strip", "6,000 sf restaurant with drive-thru", "200 apartments, 3 stories", "warehouse with truck court, as big as fits". Press **Enter** (or **Build Layouts**) to build; Shift+Enter starts a new line.
- **Suggestions fit the site:** the three suggestions under the box are sized to the land: a drive-thru pad, a small shop strip or a medical office under 2 acres; shops with pads, apartments or a small warehouse up to 10 acres; apartments, homes or a warehouse with a truck court up to 25; a mixed-use neighbourhood, homes or a big warehouse beyond that. Tapping one **puts it in the box** (and lights up Build Layouts) so you can change it first; nothing is built until you press Enter or Build Layouts.
- **Quick or AI-reviewed:** a two-way switch beside the button. **Quick** lays the layouts out in seconds; **AI-reviewed** (a minute or two) has the AI look at them and revise the program when they miss (below). **Fill the rest of the site (Phase 2)** sits next to it too: the same setting as under Site parameters, so changing one changes the other.
- **One build at a time, and you can see it run:** while it works, a strip at the top of the plan panel shows the step ("Step 2 of 4 · Laying out the layouts"), how long it has taken and **Cancel**; on phones it's a small pill just above the sheet. The button you pressed spins, and Build, What Should Go Here?, the suggestions, the ideas and More layouts wait until it's done. Other changes (Trees, settings) don't stop it, but drawing or deleting a piece while it's still laying out cancels the build, so your change isn't replaced.
- **The layouts appear as soon as they're drawn,** on the map and at the top of the panel, before the AI review finishes; each shows **AI reviewing…** until its score arrives. Pick another layout meanwhile and it stays on the map: the AI's choice is put on the map only if you haven't picked one, otherwise a message offers **The AI recommends Layout 2 · Use it**. Layout numbers don't change when the AI reorders them; its choice is marked **Recommended**. A layout that fails a check is never put on the map by itself while another one passes.
- **When a build finishes, the panel scrolls to the Layouts** so the results sit right under the overview (on phones the sheet comes up to them). If you scrolled while it ran, it only moves when the Layouts are off screen.
- **Cancel** stops the build. Cancelled during the AI review, the layouts already drawn stay, with the note **AI review cancelled**, and nothing replaces them later.
- **Read as:** after a build, the program that was used shows as small tags under the request, e.g. **Read as: Retail · 25,000 sf · 1 story · 4/1,000 parking**, with what the AI assumed. If your request names a number the program doesn't have, it says so: **Not understood: 2 pads**, or **Not understood: 120 single-family homes** when the count wasn't picked up and the homes were laid out to fill the site instead. **Edit** puts the request back in the box.
- Once there are layouts, the Build section folds to one line, **Built from "25,000 sf retail strip" · Edit request · New request**, so the layouts stay near the top.
- **What Should Go Here?** asks the AI for ideas before you decide. It reads what the app knows about the site (size and shape, street frontage, flood zone, nearby roads and traffic, utility districts and lines, environmental records), what's nearby (grocery, restaurants, gas, schools, hospitals, hotels and more, with distances) and local rents where known, and suggests three to five uses, best fit first, under the AI's short read of the site. Each shows how well it fits as a bar, why it fits, what to check, and the request it would build (**Will build: "…" · Edit** puts it in the box to change first). **Lay This Out** builds it; afterwards the ideas fold to one line, **Ideas (4) · show**, naming the one in use. They are starting points, not a market study.
- The AI turns your words into a program: the use, floor area, floors, units, number of buildings, parking ratio, setbacks and how stormwater is handled, filling gaps with typical Houston-area numbers and what it knows about the site. It lists what it assumed.
- **The AI then reviews the layouts.** The layout engine draws the options (the AI never draws), and the AI looks at each one, as a picture with its numbers and checks, the way a planner or developer would: access, parking next to the doors, buildings facing the street, wasted land, what was asked for. When the options miss, it changes the program (sizes, units, product, zones, extras, stormwater, curving streets, building shape) and the engine lays it out again; then it compares the old and new options and puts the best first. Each layout shows the AI's score out of 100 (green from 80, amber from 65, red below), and **Why** opens its verdict with what works (✓) and what to fix (!). The AI's first choice is marked **Recommended** with the reason in one line, its other remarks sit above the layouts, and layouts from its revised program are grouped under **AI's revision**, saying what it changed (for example "25,000 → 28,000 sf · why: the parking had room for more"). The whole thing takes a minute or two; choose **Quick** to skip the review.
- **The whole site is used.** What you ask for is laid out as **Phase 1**, and the rest of the land holds more of the same as **Phase 2** (the same size of building, as many as fit, drawn lighter with dashed outlines), so there's no leftover lawn. Layouts, the overview and the project page lead with **Phase 1** (what you asked for, e.g. "216 units · 8 buildings · as asked"), with the rest on a second line ("+ Phase 2: 31 more buildings, 997 units"); when Phase 1 comes up short it says so ("Fits 160 of 200 units"). The Site Plan PDF still shows the whole site's totals. Turn **Fill the rest of the site (Phase 2)** off next to Build (or **Fill the whole site** under Site parameters) to lay out only what you asked for.
- **What you ask for is what it lays out, as closely as the site allows.** Ask for "28,000 sf of retail across 4 buildings" (or "4 buildings of 7,000 sf") and you get four buildings sharing the floor area evenly, spread along the rows with walks between them, not one big box. Apartments asked for in so many buildings are split the same way.
- The app then lays out **three layouts** (Layout 1, 2, 3) on the lot, each with its floor area, parking and coverage, and a name that says how it's arranged (for example "Layout 1 · Rows facing the street · pond at the entry" or "Layout 2 · Rows running back · pond at the back"). Click one to put it on the map; **Undo** goes back. The button is **Build Layouts**.
- Every option is laid out the way a site planner draws one: the drives come first, as one connected network (drive aisles joined by curved connector drives into loops, with no dead ends), parking rows line the aisles, and the buildings sit between the rows facing their parking across a walk. Extra parking bays run between aisles where the buildings need more parking.
- **Every option is usable:** it stays inside the setbacks, nothing overlaps, it has enough parking, and every drive and parking row is reached from the entry. The app tries many arrangements and only offers ones that pass; it always shows three.
- **Amenities go where people use them:** one pool per community, always on a deck beside the clubhouse or community center that runs it. Apartments get their clubhouse and pool right by the entry; a commons beside them holds the park, playground, pavilion and lake rather than a second clubhouse and pool (homeowners in a mixed neighbourhood do get their own community center and pool). A commons' amenities line the drive that serves it, with the lake and lawns behind, never out on their own by the pond. The checks flag a pool away from its clubhouse and a second pool for one community of rentals.
- **Apartments** get a clubhouse right by the entry with its pool on a deck beside it, garden-style buildings with staggered fronts, and a walking trail around the pond. **Shops** face their parking with pad sites (with drive-thru lanes) along the street. **Warehouses** get a truck court on the dock side. **Townhomes** sit in two rows per lane, garages on the lane.
- Leave the size out and it fits as much as the parking and detention allow; give a size or a number of units and it lays out that much. If it doesn't all fit, the option says how much did ("Fits about 160 of the 200 units asked for"). A fixed program gets the parking it needs plus about a tenth to spare, not every row the site could hold. On a deep site, shops and offices go in several rows (buildings in the lot with parking on both sides), not one row with empty land behind it. With filling off, or when another building of the asked-for size won't fit, the land left is kept in one piece as a **Future pad site** or **Future development** (with its acreage). On a big tract, a "compact, room to expand" option builds on just the part of the frontage it needs. Leave the size out and the plan fills the site with as much leasable building as parks, with only the landscape the buffers, islands and stormwater need.
- **Stormwater** is sized from the land actually developed: about 0.55 acre-feet of storage per acre, in a pond about 5 ft deep (roughly 13% of the developed land). It's a **detention** pond (a dry basin) by default, a **retention** pond (a wet pond with a permanent pool) when you ask for one, **underground vaults** under the parking (no pond) or **none** for a regional facility. Sites under an acre get none unless you choose it. Ponds are clean rectangles (or straight-edged along an L-shaped strip) beside the buildings, at the back, at the entry or at the far end of the rows depending on the option; when it can't hold it all, the option says how much would go underground.
- **Paving is one surface.** Drives, parking rows and truck courts are drawn as one paved area with a single curb line around the outside, the way the asphalt is poured, so there are no lines where a drive meets a parking row (on the map, the sheet and in CAD). Click a piece to see its own outline.
- **Markings:** stall stripes along every row, **accessible (ADA) stalls** in the rows nearest the buildings (as many as the federal table asks for, one in six van-accessible, in blue with a striped access aisle shared by each pair), and at the entry a stop bar for traffic leaving and a double yellow centre line (none where the entry has a median).
- **Trash enclosures** are left out unless you turn them on under Site parameters (or add one with Draw). When on, they're placed by the usual rules: apartments get a double enclosure (trash and recycling) for about every 50 units, or a compactor plus recycling from 200 units; shops and offices one for about every 25,000 sf, none more than about 250 ft from a building; a restaurant its own; a warehouse one per building; homes roll carts to the curb, so none. Each sits beside a drive aisle or in place of a few spare parking stalls, gate facing the drive for the truck, at least 10 ft from a building. If the plan can't find room for all of them, the option says so. Your city's solid waste rules decide in the end.
- Land the layout can't use for buildings becomes lawns, a dog park or a playground on a fill-the-site plan, not unexplained empty space.
- **Clean drawing:** the whole site is drawn as landscape under what's built on it, so there are no lawn shapes with ragged edges; ponds and parking row ends are square by default (rounded and natural curves are still a choice under Look).
- **Trees** are drawn as tree canopies on the sheet and as 3D trees on the map. The **Trees** button in the Draw by hand section turns them on and off (as does Trees under Site parameters › Look).
- **Building shapes:** bars (apartments with stepped fronts), **L-shaped**, **courtyard (U-shaped)** and **towers on a two-floor podium**, chosen for the whole plan under Site parameters (Building shape) or for one building in the Selected box. In 3D, buildings show a parapet round the roof and a line at each floor, and a tower rises from its podium.
- **Restaurant pads** get outdoor seating by the door and a drive-thru lane round the building. **Playgrounds** are laid out with a play structure, slide, swings and a bench, not a circle.
- **Curved pieces:** connector drives turn on arcs, the entry has curb returns and a planted median, parking rows end in rounded planted islands, and ponds, the pool and lawns are free-form shapes.
- **Without the AI:** if the AI isn't set up, the app reads your words directly and still lays out three layouts. After its first try it says so in one line, **AI isn't set up on this site**; **What Should Go Here?** and **AI-reviewed** are greyed out, the button reads **Build Layouts · From your words (AI off)**, and only suggestions the app can read fully from the words are offered (no "with 2 pads", which needs the AI). It tries the AI again after about five minutes.
- **Townhomes and duplexes on a court:** when the homes asked for won't fit on lots of their own along a street ("24 duplex units" on an acre and a half), the plan lays them out the way a rental community on one tract is built: two-story rows of six townhomes facing a shared parking court, a turnaround at the end, a fenced patio behind each home and the unit lines drawn in, and it says why. Ask for a "pull-through drive" and a second drive runs between the buildings out to the side street.
- **Mixed use:** describe several uses ("37,700 sf retail with 2 pads, a commons with a lake, 120 apartments, 18 townhomes and 12 duplex units") and the site is laid out in zones from the street back, on one connected drive network:
  - shops at the front facing their parking, with pad sites along the street and a service drive behind;
  - a commons with an amenity lake that holds the site's detention, a pavilion, pickleball courts, a playground and restrooms;
  - apartment buildings with a clubhouse and pool, townhome rows on private lanes, and duplexes on a street at the back;
  - on a wide site, a main boulevard runs from the entry through every zone.
  - On a lot too shallow for every zone one behind the other, smaller zones share a row side by side (townhomes beside duplexes, the commons beside the apartments). A small program on a big tract is built along the part of the frontage it needs, and the rest is kept for a future phase. Each option notes anything that didn't fully fit.
- **Detail:** buildings are named and sized ("Apt Bldg 1 · 40 units · 42,353 sf · 3 fl", "Pad A", "Townhome Row 2"), parking has planted islands with trees, buildings have walks around them, and trees line the landscape buffer and the lake.

**Single-family homes:** choose **Single-family homes** (or say "single-family homes, mostly 2-story"). Homes go on lots along 28 ft streets, both sides of each street, with lot lines, driveways and a cul-de-sac at a dead end. The streets curve gently the way a neighbourhood's do, with the lots and homes following them, and the rows along the lot lines stay straight so curving costs almost no lots; **Neighbourhood streets** under Site parameters switches them to straight. Set the **home mix** (the share of 1-, 2- and 3-story homes) and the lot depth under Site parameters; each home type takes its own lot width (about 60, 50 and 40 ft).

**The plan panel** is a full-height column beside the map buttons. Its header stays put while the sections scroll:
- **Where you are:** **Projects › the project › the option's name**. Click **Projects** for the Projects page or the project's name for its page; click the option's name to rename it. Under it, the address and acres (just the acres when the project is named after the address).
- **Undo** and **Redo** buttons, **Edit Layout** (once there's a layout), **Done** and **×**. Done and × close the plan; it's saved as you go. A short line beside Undo says where the plan is: **Saved on this device**, **Synced with team · 3 min ago**, or **Sync failed · Retry** when the team copy couldn't be updated (your work is still saved on this device).
- **The options** (Option A, B…) as buttons, each with its floor area or units, parking and coverage when you hover; **+ New Option** starts another option from this one.
- **Section chips** in the same order as the sections, lit for the one you're looking at: **Selected** (when a piece is picked; picking a new piece brings the panel back to the top to show it), **Layouts** (the layouts the last build made), **Change** (Change With AI), **Build** (Build with AI), **Numbers**, **Pro forma**, **Site** (parcels, Street Side, Side Street, Add Entrance and Redraw Site), **Draw** (pieces to add, the building library and Trees), **Settings** (Site parameters) and **Export**. Selected, Numbers, Pro forma and Export appear once there's a layout. **Delete This Option** is at the very bottom; after you confirm, the project page opens with **Deleted Option A from (the project)**.
- Under the header, a dark overview of what's on the map: the layout's name, then Phase 1 (units or floor area), parking provided / required, coverage, and value / cost with the yield and spread (in red when negative). Its checks pill (**Passes**, or **2 problems**) opens the list of problems; click one to select that piece on the map. **Compare layouts** jumps to the Layouts. Before anything is laid out it reads **Step 1 of 3 · Describe what to build**, with **or draw pieces by hand** to jump to Draw; while the first build runs it reads **Building**.
- On phones the header is one row: the option's name and the buttons as icons (undo, redo, edit, done ✓, minimize, close), with the options under the overview.

**The plan on the map**
- **Plan key and scale:** while a plan is open, the map's legend card gets a **Plan key** with only what this plan uses (its building uses such as Retail or Multifamily, parking, drives, the pond, lawns, amenities), **Phase 1** and **Phase 2** when there is a Phase 2, the line styles (**Site boundary (planning)**, setback, street side, and **Parcel line (county data)** when the site has several parcels), easements, and **Problem** in red. A scale bar in feet sits at the bottom right of the open part of the map. Both go away when you close the plan. On phones the key starts folded just above the sheet; tap it to open it. Closing the plan puts the legend back as you had it. The map fits the site clear of the key.
- **Labels by zoom:** the most useful labels win when they'd overlap: the selected piece first, then anything with a problem, then buildings (bigger ones first), ponds, parks and garages, amenities, drives, and parking counts last. Zoomed out, a building shows its name only; closer in its name and size; close up, its use too. Parking counts ("38 spaces") appear only when you zoom in close. Names don't break at a hyphen.
- **Lines:** the site boundary is drawn on top of the tree ring with a thin white edge, a little heavier as you zoom in. Zone lines and house lot lines are dotted (house lots from close zoom). Orange is only ever the street side; the line you draw and the turn dot are green.
- **What's selected stands out:** a green outline on a white edge, a brighter fill, and the other buildings fade back a little; its label always shows, whatever the zoom, and the labels around it make way for it (zoomed out it's the name only, like the others, so it doesn't hide the outline). A piece with a problem keeps its red outline (red edge, green inside when it's also selected).
- **Phase 2** buildings are fainter, with dashed outlines, and their label keeps the use with **PH 2** after the name ("APT BLDG 12 · PH 2").
- **One pill says what mode you're in,** at the top of the open part of the map, with how to use it and a button to leave: **Editing layout** (drag to move · R turns · Del removes · Esc done), **Editing the shape**, **Draw the site** or **Redraw the site**, **Street Side**, **Side Street**, **Add Entrance** and **Add or remove parcels**, with **Cancel** or **Done**. It replaces the instruction messages that used to pop up, and an old message goes away when the mode changes.

**Closing a plan and getting back to it**
- **Esc never closes a plan.** It steps back one thing at a time: it cancels a tool you've started (Draw, Street Side, Side Street, Add Entrance, Add or Remove Parcels), then clears the selected piece, then leaves Edit Layout (the mode pill on the map goes away); after that it does nothing. While you draw a site that has no outline yet, Esc clears the corners so far and you carry on drawing (there's nothing to go back to); **Start Over** does the same. In a text box Esc just leaves the box, and with Layers or a menu open it closes that first. Only **Done** or **×** closes the plan.
- Closing says where the work is: **Saved to (the project)** with **Open project**. A faint dashed outline of the site stays on the map with a **Resume plan** button under the search; click it to reopen the same option. Both go away with your next click on the map or when you change pages.
- A plan started from a property card shows **← (the address)** at the top; Done, × or that link takes you back to the property card as you left it.
- Switching to another page (Projects, Market…) while a plan is open closes it cleanly and shows a banner, **Editing Option A of (the project) · Return to plan**, that reopens it. Back on the Map without the banner, the **Resume plan** button does the same. On the project page, the option you had open last is marked **Last opened**.

**What every plan includes, and what fits**
- A plan always fits the site: buildings, their parking, a drive in from the street, and dumpster enclosures for shops, restaurants and offices. Ask for more than the land holds ("100,000 sq ft on one acre") and you get the most that fits with its parking and setbacks, with a note saying so.
- Small extras asked for with one main use are laid out on the open land beside it: outdoor seating against the building, a playground, a named lawn.
- Odd-shaped lots (a wedge, a curved highway frontage) are laid out square to the street as well as to the lot's long lines.
- A "residential neighbourhood" with shops in front and a community center at the back fills the whole tract: homes take whatever land the shops and apartments leave, the community center (building, pool, parking, playground) sits by the main drive, and the land around it is a park. Land left between homes is open space; only frontage beside the shops is marked as future pad sites.
- Trees line lawn edges and the front yards of homes, with a few groves in big parks.
- Sites up to about 300 acres work; a large layout takes up to a minute while the map stays usable, and the AI may think for up to a minute first.

**The building library**
- About 230 building types: garden, breezeway, corridor, senior, L-shaped, courtyard, podium and tower apartments; townhome rows; duplexes; 24 house plans; restaurants from a coffee drive-thru to a brewpub; shop strips, pharmacies, grocery and big box; medical and office buildings; flex, warehouses and self storage; hotels, churches and more.
- **From the building library** in the Draw section adds one in the nearest clear spot to the middle of the view; **Type** in the Selected box swaps a placed building for another type in the same spot. Neighbourhood streets mix the house plans home to home.

**Getting the most out of a site**
- The planner aims for the most valuable plan that fits the rules: sizes in a request are the first phase, and land left over gets more of the same. Shop, office and medical buildings grow along their rows until the parking is used; warehouses grow deeper; homes keep filling the blocks to the back of the site, leaving the land the detention lake needs. Each option says what was asked for (phase 1) and what the land holds in all.
- Warehouse, flex and storage in a mixed-use plan get a real warehouse with a truck court behind it (they used to come out as homes).
- **Parking garages:** ask for one ("a parking garage behind the offices") and it's built there, four levels by default, carrying most of the parking so the surface lots shrink. On shop and office sites the planner also tries a garage on its own and keeps it only when the extra floor area it allows is worth more than it costs.
- **Housing in general** ("multifamily", "rental housing", "build-to-rent") lays out garden apartments, studio and one-bed apartments, townhomes and duplexes and ranks them by value; name a product (apartments, townhomes…) to get just that one.
- **Every layout shows its money:** value and total cost, profit, yield on cost and the spread over the market cap rate (for homes for sale, cost, profit and margin), from the same land price and assumptions as the Pro forma, so the layout on the map shows exactly what its Pro forma section shows. Change an assumption under Pro forma (a rent, a cost) and every layout follows. The land is counted (the parcels' appraised value, or about $175,000 an acre when there isn't one), so these read lower than an estimate without land would; hover the figures to see the land price used. A loss or a negative spread shows in red. They compare layouts; they aren't an appraisal.
- Dumpsters (trash enclosures) are left off unless the request asks for them or Site parameters turns them on.
- Land left over is landscape or open space; a **future pad site** is marked only on the street frontage where a real pad fits (at least about 0.6 acre), two at most.
- Ponds and amenities you drag stay inside the lot.

**Entrances**
- **Add Entrance** (in the Site section, beside Street Side and Side Street): click the lot line where a driveway should come in. It runs straight in to the nearest drive, with curb returns at the street, sliding along the lot line a little if a building or pond is in the way; parking it crosses gives way. Clicking a lot line that isn't a street marks it as one. It's named Entrance 2, 3 and so on, gets a stop bar like the main entry, and says so if it's closer than about 150 ft to another entrance.
- Ask for them when you build: "two entrances", "a second driveway", "3 curb cuts". The extra ones go on the front or a side street, as far from the others as they can be; options with every entrance come first, and an option that can't fit one says why (mark a side street for more room).
- In Change With AI: "add another entrance", "add an entrance on the side street", or remove one by name.

**Changing a plan with AI**
- While the AI works, its button shows a spinner and the progress strip at the top of the panel says what's happening (reading the request, laying out, reviewing).
- Once a plan is laid out, **Change With AI** (the **Change** chip at the top of the plan panel) takes changes in plain words, by name: "make Apt Bldg 7 four stories", "turn the clubhouse into a 7,500 sf one", "remove Bldg 3", "swap Bldg 2 and Bldg 5", "move the clubhouse and pool to the back", "add a quick-service restaurant beside Building A". Select a piece first and you can just say "it". **Change With AI** in the Selected box jumps there.
- The AI sees the plan as a picture with every piece's name and size, picks buildings from the library when one becomes something else, and says what it changed. More floors on apartments add units; a clubhouse keeps its pool, a restaurant its patio and drive-thru.
- Usually only the pieces named change: parking gives way under them and grows back where they leave, and everything else stays exactly as it was. When you ask for a re-fit (or tick **Re-fit the rest of the site**), or the change needs new drives (a building out in open land, several removed), everything else is laid out again around what changed, keeping about the same amount of building. Changed pieces are pinned, so later re-fits keep them.
- If it can't tell which piece you mean it asks. Without the AI, simple changes in the same words still work (stories, remove, swap, turn, rename, "make it a …").
- **You see what it did:** the pieces it changed flash on the map, and anything it removed leaves a dashed outline that fades over a few seconds. Under the box a short checklist says what changed (**Apt Bldg 7 → 4 stories · Apt Bldg 13 removed**), with anything it couldn't do, **Undo this change** (Cmd+Z works too) and, when the plan is now short of parking, **Re-fit around my changes** to lay the parking out again around them. Edit Layout stays as it was; nothing is switched on for you.

**The tool bar**
While a plan is open, a small tool bar sits at the bottom left of the map (on phones at the top left, with **⋯** for the rest). Hover a button for its name and shortcut; a greyed-out button says why it can't be used yet ("Select a piece first", "Turn on Edit to draw"). Shortcuts don't fire while you type in a box.
- **Select** (V) looks and selects without moving anything; **Edit** (E) turns editing on, the same as **Edit Layout**.
- **Draw area** and **Draw line**: see Drawing by hand below.
- **Measure** (M) a distance: click points; each side and the running total show in feet. **Measure area** (Shift+M): click round a shape for its square feet and acres. Enter or a double-click finishes, Backspace removes the last point, Esc stops. Measurements aren't saved.
- **Fit plan** (Shift+F) brings the whole site into view; **Fit selection** (F) zooms to what's selected. The map never moves by itself otherwise.
- **Grid** (G): a 10 ft grid (5 ft in Layers) square to the lot, shown when zoomed in close. Pieces you move and points you draw snap to it. **Snap to edges** in Layers turns off lining up with nearby edges and square turns; hold Alt to move freely either way.
- **Layers**: show or hide, and lock, each part of the plan: Buildings, Parking & drives, Stormwater, Landscape & amenities, Trash, Trees, Labels, the setback line, parcel lines and easements. A hidden or locked part can't be clicked or moved by accident, but the numbers and checks still count it, and exports always include everything. The Trees eye only hides them on the map; **Trees** under Draw takes them off the plan and the PDF. Layers, the grid and snapping are saved with the option.

**Editing a plan**
- A plan opens for looking: clicking a piece shows its details and dragging pans the map, so nothing moves by accident. **Edit Layout** at the top of the plan panel turns editing on (**Stop Editing** turns it off); adding a piece from Draw turns it on too.
- While editing, drag a piece to move it, its white corners to resize it and the green dot to turn it. Only that piece changes. On touch screens the corners and the dot are bigger, can be grabbed from a finger's width away, and the dot sits further out. It lines up with the edges of the pieces near it and stays out of the setbacks (hold Alt to move it freely), and parking under a building you move gives way, whole stalls at a time. Anything that still clashes shows in red.
- A building you drag settles in the nearest clear spot to where you let go: off the drives (a walk's width away), clear of the other buildings, ponds and amenities, inside the setbacks. If there's no clear spot nearby it stays where you let go and says so; hold Alt (Option) to place it anyway.
- What belongs to a building moves with it: a clubhouse takes its pool deck and pool, a restaurant its patio and drive-thru lane, a home its driveway. Arrow-key nudges carry them too.
- **Turn 90°** (or R) works like a drag: the building stays clear of the other buildings and drives (moving to the nearest clear spot if it needs to), parking under its new footprint gives way and grows back where it was. If no clear spot is near, it says so, with Undo.
- **Delete**, **Undo** and **Redo** say what they did in a short message with the way back: **Deleted Building D · Undo**, **Undone · Redo**. Undo also covers renaming the option, Pro forma changes and adding or removing parcels.
- **Several pieces at once:** Shift-click adds a piece to the selection or takes it out, and Shift-drag on the map draws a box that selects every piece inside it (with a mouse or trackpad). Drag any of them, nudge with the arrow keys, **Duplicate**, **Delete**, or **Pin** / **Let them move**, and they act together as one step of Undo, with what belongs to each (a pool deck, a patio) coming along. The Selected box shows how many are selected, what kinds, and the ground they cover.
- **Duplicate** (⌘D / Ctrl+D, or the button in the Selected box) copies the selected pieces, with what belongs to them, beside the originals in the nearest clear spot, and selects the copy. It works for curved drives and the entry too (a copied entry becomes a plain drive, so the plan keeps one main entrance).
- Clicking a button in the panel doesn't stop the keys working: Delete, the arrow keys and R act on the selected piece straight after.
- A selected piece shows its width and depth along its edges when you zoom in close.
- Garages, outdoor seating and trash enclosures can be clicked and selected like everything else.
- Parking a building cut grows back when the building moves off it again, so trying a spot and moving back leaves the plan as it was. A parking row you delete or resize yourself stays as you left it.
- **Edit Shape** in the Selected box (buildings, lawns, ponds, plazas, courts, pools, patios, garages) turns the outline into points: drag a point, drag a blue + to add one, double-click a point to remove it. Points line up square with their neighbours unless Alt is held.
- **Cmd+Z / Ctrl+Z** undoes and **Shift+Cmd+Z** redoes, whatever button was clicked last; the **Undo** and **Redo** buttons in the plan's header do the same.
- **Esc** steps back: it cancels a tool, then clears the selection, then turns Edit Layout off. It never closes the plan.
- **Re-fit Plan** in the Selected box lays out everything else again around the pieces you placed (marked 📌; **Let it move** releases one). It only happens when you press it. A pond you enlarge counts toward the detention.
- Curved pieces (ponds, the pool, lawns, curved drives) resize from their corner handles. Ponds, pools, lawns, plazas and courts can switch between **natural curves**, a **rounded rectangle** and a **rectangle**, keeping their area.

**Drawing by hand**
- Add a **Building, Restaurant pad (drive-thru)**, Parking, **Parking garage**, Drive, Truck court, Detention, Landscape, **Playground, Courts, Pool, Outdoor seating** or Trash enclosure piece. A restaurant pad comes with its patio and drive-thru lane; a parking garage counts about one space per 330 sq ft on each level (set the levels in the Selected box). An enclosure you place stays where you put it, and the plan adds any others the rules still call for. A new piece lands in the nearest clear spot to the middle of the open map (off the buildings, drives, ponds and amenities and inside the setbacks, on open ground before parking), turned like the buildings near it, and is selected so the Selected box is at the top. When the site is full it says so (a building may then sit over a drive, in red, until you move it). Drag a piece to move it, its white corners to resize it, and the green dot to turn it (it snaps to the lot's lines; hold Shift to turn freely).
- Curved pieces from Build with AI (curved drives, the entry, ponds, the pool, lawns) move as a whole: drag them or nudge them with the arrow keys. They don't resize or turn.
- **Draw area** (in the tool bar) draws a **Landscape** area, **Plaza**, **Pond** or **Easement / no-build area** point by point; **Draw line** draws a **Drive** (26 ft) or a **Walk / trail** (6 ft). Click to place each point; click the first point (or press Enter) to finish, Backspace removes the last point, Esc stops. A shape with fewer than three points, one that crosses itself, or one outside the lot is refused with a message (an easement may run along the lot line). What you draw is pinned and selected.
- **Easements and no-build areas** are hatched in red with a dashed edge. Anything built or paved on one (a building, garage, parking, drive, truck court, pond or pool) is flagged as a problem ("Building A is on Easement 1"). **Build Layouts** and **Re-fit Plan** lay everything out around them, and a piece you place on one yourself stays where you put it, flagged. They aren't counted as building, paving or open space. They appear in the Plan key ("drawn, not surveyed"), on the PDF sheet (hatched, with a legend line and a row in the land use table) and in CAD on their own EASEMENT layer. You draw them from what you know; the app doesn't look up recorded easements.
- Keyboard: arrow keys nudge (Shift for 10 ft), R turns 90°, ⌘D / Ctrl+D duplicates, Delete removes, ⌘Z / Ctrl+Z undoes.
- Parking counts its spaces as you size it, using the stall and aisle sizes under Site parameters (9 × 18 ft spaces on 24 ft aisles to start); parking you add by hand uses them too. Each pair of accessible stalls shares an aisle the width of a stall, so it costs one space; the count shown already allows for that.
- Type exact sizes, the turn, the number of floors, the building's use (which sets its parking and colour) and its name in the **Selected** box. Townhomes and duplexes also take the number of homes.
- The site tools are in the **Site** section: **Add or Remove Parcels**, **Street Side**, **Side Street**, **Add Entrance** and **Redraw Site**. While one is on, the pill on the map says what to click, with **Cancel** (or **Done**); Esc cancels it too.
- **Street Side:** the orange line marks the side along the street. The app finds it from the map's roads; when it can't, it says the line is a guess. Click **Street Side**, then the lot line along the street, to set it; the lot line under the pointer lights up orange before you click. Front setbacks and drives follow it.
- **Side Street:** on a corner lot, a second street along another lot line (a thinner orange line). The app finds it from the map's roads; click **Side Street**, then a lot line, to add or remove one (the line under the pointer lights up); it stays on for the next one until you press **Done** on the pill. Buildings keep the street setback from it, and a pull-through drive can reach it.
- **Add or Remove Parcels:** click a parcel next to the site to add it (up to 20), or one in the site to take it out; the outline is merged again and the pieces stay where they are.
- **Redraw Site** replaces the outline (for part of a parcel, or a site that doesn't follow parcel lines).
- Building heights show in 3D when you tilt the map.

**Numbers and checks**
- Site area, building floor area (and about how many apartments), coverage, FAR, parking provided against what's needed (with the accessible stalls), detention, paved area and open space.
- Red outlines and a list flag a building inside a setback, anything outside the lot, buildings overlapping other pieces, a parking shortfall, and coverage, FAR or height over the zoning limits when Regrid has them.
- **Deal summaries**, the way TestFit tabulates a scheme: acreage, FAR, building coverage, impervious coverage, units, units per acre, beds, net rentable and gross square feet and the parking ratio, plus the unit mix (units, share and net square feet of each type) or the home mix.
- **Site parameters** (changing any of them lays out new layouts, keeping the same arrangement on the map; a layout you've changed is never replaced without asking, see "New settings and your edits" below):
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

**Layouts and Options**
- **Options** (Option A, B…) are the plans you keep in a project. **Layouts** (Layout 1, 2, 3…) are what a build draws for the option you're in. Layouts are numbered, never lettered, so they can't be mixed up with options.
- The layouts a build makes are listed in the **Layouts** section right under the overview, headed **Layouts · 3** with the sort and **More layouts…**. The one on the map is marked **On map**, or **On map · edited** once you've changed it by hand or with Change With AI. Two layouts with the same arrangement are told apart by the number that differs between them ("· 114 spaces").
- **Each layout is a card to compare:** a small drawing of it, its name, and the same four figures on every card: **Phase 1** units or floor area (with "as asked", or "Fits 160 of 200 units"), **Parking** provided / required with the ratio, **Value / cost** with the profit, and **Yield on cost** with the spread. Then whether it passes the checks (**Passes**, **Parking short 79** or **2 problems**, the same as the overview; on the **On map** card it's the plan as it is on the map now, so a setting change shows there too), the AI's score when it reviewed them, and badges across the set: **Recommended**, **Most floor area** (or **Most units**) and **Best yield**.
- **Recommended** is the AI's first choice when it reviewed the layouts, otherwise the planner's first layout that passes every check, with one line saying why. Every other card says what it has compared with it, e.g. **vs Recommended: +7 spaces · −$60k cost**. Layouts with exactly the same numbers fold into one card (**2 similar layouts · show**).
- **The planner's notes by how much they matter:** shortfalls and things that didn't fit in red, access and parking warnings in amber, the rest (stormwater, phases) behind **Details**. Notes every layout shares are said once, above the cards.
- **When none passes,** a banner at the top says so and why, for example **This asks for about 12.9 ac; the site is 4.7 ac**, with **Edit request** to change it.
- **Sort** by **Recommended** (the default: the AI's order, or the planner's), **Profit**, **Yield on cost**, **AI score**, **Units / Floor area**, **Parking ratio** or **Open space**. Layouts that fail a check always come after the ones that pass, the figure you sorted by is highlighted on each card, and money shows a second decimal when two layouts would otherwise read the same. The layout on the map stays marked whatever the order.
- **Layouts stay with the option:** switch to another option, close the plan or reload the page and they're still listed, with your request and the AI's note. Up to six are kept: the first three and the one on the map in full, the rest as numbers only (**Numbers only: click to lay it out again**). If one comes out differently when it's laid out again, it says so. Teammates see the same layouts as numbers only (the one on the map comes with the option), and a browser that runs out of room keeps the layouts of options you aren't working on as numbers only, so the save always goes through.
- **Save as new option** on any layout keeps it as a new option in the same project, named after it (**Option B · Rows facing the street…**). You stay in the option you're in; the message offers **Open Option B**.
- **More layouts…** lists every usable layout the planner found (up to 12), keeping the AI's scores on the ones it saw. If the layout on the map isn't among them (the request changed since it was laid out), it stays at the top of the list, still marked **On map**. The drawings on the cards appear as you scroll to them, so a long list opens at once.
- **+ New Option** in the header copies the option you're in (Option B, C…), its layouts included. Each project keeps all its options.

**New settings and your edits**
- **Nothing you've edited is replaced without asking.** When the layout on the map has your changes, **Build Layouts**, **Use this layout**, **New layouts from these settings** and the AI's **Use it** first ask, at the top of the panel: "Your edits to Layout 2 will be replaced", with **Replace my edits**, **Save my edits as a new option first** or **Cancel** (Esc). Undo brings the edits back after replacing.
- Changing a site parameter lays out new layouts with the new settings and puts the same arrangement back on the map. If that arrangement no longer fits, the nearest one is shown and the message says so ("Layout 2 no longer fits; showing the nearest"). The message says what changed for the layout on the map, for example **Front setback 35 ft: 22,800 sf (−2,200), 104/92 spaces**, with **Undo**, which takes back both the new layout and the setting you changed.
- **Your edits are never replaced silently.** When the layout on the map has your changes, nothing is redrawn; a bar under Site parameters says **Settings changed** and offers **Re-fit around my changes** (the pieces you placed stay, the rest is laid out again with the new settings) or **New layouts (replaces your edits)**. Undo brings the edits back either way.
- **New layouts from these settings** (at the bottom of Site parameters) does it on demand; it replaces the layout on the map, edits included. Untick **New layouts as I change settings** to change several settings first.
- When new settings replace layouts the AI had scored, the list says **Settings changed: AI review cleared** with **Review again**.

**Pro forma**
- **Numbers** shows the plan as one set of tiles (site, floor area, units, coverage, FAR, parking, detention, paving, open space, height), each zoning limit beside its figure (**FAR 0.12 / max 0.5**, in red when over). With a Phase 2, floor area, units, coverage and FAR show **Phase 1** and **Full site** side by side.
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

**The Projects page** (My Work → Projects) shows every project as **Cards** or a **List** (switch at the top right; your choice is remembered on this device). Each one shows a drawing of its site, the parcel address, acres, how many options it has, its largest option and when it was last changed. Search by name, address, owner or notes, and sort by last update, name, site size or number of options. **+ New Project** asks for a name right on the page.

Click a project to open its page:
- **A summary card:** the site drawing, the name (**Rename** to change it), site area in acres and square feet, number of parcels, owner(s), appraised value (with land value), number of site plan options and the largest one.
- **Parcels:** each parcel's address, owner, acres and appraised value, with **Show on Map**. A project with no parcels explains how to add one, with **Find a Parcel** and **Draw a Site**.
- **Site plan options:** each option as a drawing (street side down) with its floor area, units, parking against what's needed (amber when short), coverage, its value and yield on cost from its Pro forma, and a red count if it has problems. The option you last had open is marked **Last opened**. Click one to open it on the map. **New Option** starts a blank plan on the same site.
- **Notes**, and **Draw a Different Site** and **Delete Project** at the bottom.
- Long names and addresses wrap onto more lines rather than being cut off, on any screen size.
- Your notes are safe while you type: a team sync waits until you leave the field.

**Good to know**
- The PDF is a conceptual sheet. It has no survey bearings, easements, utilities or title research, so it won't match an engineer's or architect's sheet; it's for feasibility and early conversations.
- A site plan is a planning sketch from the parcel outline: not a survey, and no grading, utilities, fire lanes or code review. Parcel outlines from appraisal districts can be off by several feet.
- The setbacks, parking ratios, stormwater storage and trash rules are typical starting numbers, not the rules for a specific city or drainage district. Houston has no zoning but has building lines and parking rules; other cities differ.
- Projects are shared with the team: each one is saved in this browser and synced to the team database, and the last edit wins. The button beside **+ New Project** at the top of the Projects page shows whether sharing is on and your name, which is stamped on projects you change; click it to change either in **Settings → You & your team**.

---

## Where the data comes from

The **?** button at the top right (Data & help; on phones, More → Data sources & freshness) lists every source, what it's used for, and how fresh it is. A line at the top says whether sources show on cards, with a link to change it in Settings and **Save voice log**. **Getting started** at the top right shows the first-visit tip again on the Map. The main ones are:

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

- **Parking that matches what you asked for:** layouts now park what the buildings need plus a small margin (about 5%), instead of 2–3 times as much. A 25,000 sf retail strip shows about 107 spaces for 100 needed (it showed up to 323 with a garage). Parking garages are sized to the share of parking they carry. Mixed-use plans trim their spare rows. Each building has its own name (Building A, B, C…, no more two Building A's). Mixed-use plans on smaller lots no longer fall back to a simple layout with no parking. Townhomes get guest parking. Hotel and church are new uses.
- **A faster, easier-to-read Market page, and a calmer Ask AI:** the Market page opens without the long pause, switching 12 / 24 months / All is near-instant, and live prices refresh without closing what you had open. Every chart is drawn at the size of its box with one consistent text size, so the small price charts are readable. Ask AI no longer says "Thinking…" at the top: what it's doing shows quietly at the bottom while it works, then folds into **Worked through N steps** above the answer, and New chat has a compose icon.
- **Site plan tools:** a tool bar on the map with Select, Edit, Draw area, Draw line, Measure (distance and area), Fit plan, Fit selection, a snapping Grid and Layers (show, hide or lock each part of the plan). Select several pieces with Shift-click or a Shift-drag box and move, duplicate, delete or pin them together. Duplicate (⌘D) works on every piece, curved drives included. Draw lawns, plazas, ponds and **easements / no-build areas** point by point, and drives or walks as lines; easements are flagged when something's built on them, and new layouts and Re-fit lay out around them. A selected piece shows its width and depth. Build Layouts and Use this layout now ask before replacing a layout you've edited (with **Save my edits as a new option first**). The plan header shows whether it's saved on this device or synced with the team. Garages, outdoor seating and trash enclosures can be clicked; the keys work right after clicking a panel button; Undo covers renaming, Pro forma changes and parcels; hand-drawn parking uses your stall sizes; and the Plan key tells the planning boundary from county parcel lines. You can also go Back from a plan to its project page, and a project's page stays open when you reload.
- **Light only, and easier to use from the keyboard:** dark mode is gone (the app is always light; Settings no longer has an Appearance section, and Show sources and Panel width moved to Settings › Map). The browser's Back and Forward buttons move between pages instead of leaving the app. A clear green outline shows where the keyboard is on every button (it was invisible on Export, Filters and Layers); the Export dialog keeps Tab inside it; the × on a card tab can be reached with Tab; buttons, toggles and rows react on hover; close buttons are easier to hit; loading notes show a small spinner; error text and grey helper text are easier to read; and a reduce-motion setting on your device now switches the app's animations off.
- **Charts that move with the data:** charts across the app (Market, Timeline, Compare, the assistant's chart cards, crime and FEMA reports) draw in once when you first see them, and glide to new values when you change the range, county, filters, Group by or Measure instead of redrawing. The headline numbers and Area at a Glance count to their new values (instantly during the time-lapse). The Timeline keeps the range you dragged when you change Group by or Measure, and highlights the month under the pointer. Reduced-motion settings are respected, and exports always show the finished charts.
- **Drive-time bands clear when you close the card:** closing a drive-time map (or the property card it came from) with × or Esc now takes the bands off the map, and the legend has a **Clear from map** link.
- **No more size limits on area reports:** the FEMA report (was 400 square miles, and flood-zone shares only up to 60), the Air Traffic report (was 2,000) and the Traffic report (was 5,000) now take any area up to several counties. FEMA reads claims for every census tract instead of the first 60. Traffic's Export CSV lists every counted road segment, and the crime Export CSV lists up to the newest 20,000 incidents instead of 2,000.
- **Environmental report for any size of area:** the 30-square-mile limit is gone (a whole county works). Counts are now exact (no more "1,000+"), the table adds an **On site** column, larger areas get soils by share of the site, a source that times out can be retried on its own, and Export CSV lists every record.
- **Crime reports that work for any area:** a Crime Report for a large selection (like an 80-square-mile box around Jersey Village) used to fail with a message like "Unexpected token 'A'… is not valid JSON". It now opens in about 2 seconds, there's no size limit, and Houston-wide crime on the Market page loads straight away. If a report anywhere in the app can't finish, it now says so in plain words.
- **Site plan finishing touches:** the Plan key's longer names (Single-family homes, Detention pond, Site boundary) wrap instead of being cut off; the editing button reads **Stop Editing** so it isn't confused with **Done**; a building's Turn shows 0° rather than 360°; the same note is no longer listed twice on the layouts; a request like "120 single-family homes" now says **Not understood** when the count wasn't read; on phones the plan is brought back into view above the panel after a build; the project page marks the option you had open last as **Last opened**; deleting an option says so; and the Start card's second button is simply **New Option**.
- **A site plan you can read on the map:** a **Plan key** in the legend with just what the plan uses (Phase 1 and 2, the lines, Problem) and a scale bar; building names before parking counts, with shorter labels zoomed out and parking counts only close in; the site boundary drawn over the trees; a selected piece outlined in green with the rest faded back and its label always shown (nearby labels make way); Phase 2 fainter, dashed and labelled **PH 2**; a dark-mode set of colours; and one pill on the map saying what mode you're in (Editing layout, Street Side, Side Street, Add Entrance, Draw…) with **Cancel** or **Done**, the street edge under the pointer lit up, and Side Street staying on until Done. Turning a building (R) and adding one keep it clear of the others, parking giving way; new pieces are selected; Delete, Undo and Redo say what they did with the way back; Change With AI leaves Edit Layout alone, flashes what it changed, fades out what it removed and lists it with **Undo this change** and **Re-fit around my changes**; touch screens get bigger handles; and Esc while drawing a brand-new site clears the corners instead of leaving you stuck.
- **Comparing layouts:** each layout is now a card with a small drawing and the same four figures (Phase 1, parking, value / cost, yield), whether it passes the checks, the AI's score, and **Recommended**, **Most floor area** and **Best yield** badges, with what each one has compared with the recommended one and a **Why** with the AI's strengths and problems. Failing layouts come after passing ones and are never put on the map by themselves while one passes; a banner says when none passes and why; identical layouts fold together; notes are sorted into problems, warnings and details; new sorts (profit, yield, AI score, parking ratio); the overview is a strip of the key figures with a problem list that selects each piece; Numbers is one set of tiles with zoning limits and Phase 1 beside the full site; and cards, the overview and project tiles lead with Phase 1. The panel scrolls to the Layouts when a build finishes, and **More layouts…** keeps the layout on the map in the list.
- **Building a site plan you can follow:** suggestions sized to the site that fill the request box instead of building straight away (Enter builds); **Quick** or **AI-reviewed** and **Fill the rest of the site (Phase 2)** beside the button; one build at a time, with a strip showing the step, the time and **Cancel** (a pill above the sheet on phones); layouts on the map as soon as they're drawn, with AI scores filling in after, and the layout you pick kept; **Read as** tags showing how the request was understood, including what wasn't; a Build section that folds to one line once there are layouts; idea cards with a fit bar and the request each would build; and an honest one-line notice when the AI isn't set up.
- **Layouts you don't lose:** what a build draws is now called **Layout 1, 2, 3** (options stay Option A, B…), and the layouts stay with their option when you switch options, close the plan or reload. The one on the map is marked **On map** (**· edited** once you change it). **Save as new option** keeps any layout as an option of its own in one click. Each layout's value, cost and yield now use the Pro forma's land price and assumptions, so they match its Pro forma exactly and follow your changes. New settings keep the same arrangement on the map and say what changed, with Undo (which takes back the setting too), and never replace a layout you've edited without asking (**Re-fit around my changes** or **New layouts**). Starting a plan on a parcel that's already in a project offers **Open Plan** first instead of making a second project, **Find a Parcel** adds the next parcel to its project, the property card's button reads **Open site plan** for a planned parcel, the Start card shows the site's outline on the map, and option tiles on the project page show value and yield.
- **Planning gets its own workspace:** a site plan now takes the whole map (the left list folds away and the area tools, Filters, Export and layer buttons step aside until you close it) and zooms so the whole site is clear of the panel and search, with a **Fit plan** button. The plan's header shows **Projects › project › option** with Undo, Redo, Edit Layout, **Done** and ×; options say what they hold when you hover, and **+ Copy** is now **+ New Option**. The sections are in a working order (Selected first when a piece is picked, then Layouts, Change, Build, Numbers, Pro forma, Site, Draw, Settings, Export), the chips follow the same order, sections that need a layout wait until there is one, and the site tools (Street Side, Side Street, Add Entrance, Redraw Site) sit together under Site. Esc steps back (a tool, the selection, Edit Layout) and never closes the plan; closing says **Saved to (project)** with **Open project** and leaves a **Resume plan** button; leaving the Map shows **Return to plan**; and a plan started from a property card goes back to it.
- **Finishing touches to the new layout:** the assistant no longer covers the right side of a page (the page makes room, as it does for a card), page titles no longer run into their buttons when a card or the assistant narrows the page, Projects lines up with the other My Work pages, the data sources page is labelled **Data & help** like its button, and Esc closes the phone **More** list.
- **A property card that works like a tool:** on a computer the card fills the right side of the map from top to bottom, with the map buttons beside it, so bigger screens show more of it. **Ask AI**, **Site plan**, **Watch** and **⋯** (Street View, notes, orbit, Select more, Copy link, CSV) sit under the title instead of at the bottom, and the top folds to the title as you scroll. The section buttons follow along as you scroll. The title is the address and the line under it the owner and value; in Harris and Waller the Ownership section starts with **Get owner, value & zoning from Regrid**, and elsewhere a small **Zoning & last sale** link does the same. The company behind the owner is one line with **Details**, and the mailing address, legal description and appraisal fields are under **More record details**. A report, filing or note opened from a card has **← (the property)** to go back to it as you left it, and Esc does the same. Esc no longer closes the card while you type or when it's closing Layers or a menu. Tabs only appear once two things are picked. On phones the card opens part-way with the buttons along the bottom, and swiping down shrinks it to its title bar instead of closing it.
- **Map controls that make sense at any size:** the search box comes first, then one tool row with the area tools, **Layers · N** (it replaces **More** and the layers button on the right), **Filters** and Export; the layer buttons stay on one sideways-scrolling line; the filters you've set show as chips you can remove one by one, with **Clear all** (it replaces the old Clear button); and with Ask AI open the tools shrink to icons instead of disappearing. The right side now only moves the map: zoom, compass, near me and **Reset view ▾** (whole region or globe), each with its name on hover. Map layers has a pinned title, an **On now** list with off switches and folding groups with counts; 3D terrain and the imagery moved into **Base map, imagery & 3D**. The time-lapse is **▶ Play by month** on the Filings layer and legend, and the legends share one card. Filters starts with Construction filings, explains each mode, says **No filters on** when nothing's set and keeps one crime type in step with Map layers. On phones the area tools are one **Select ▾** button, Layers is a bottom sheet like Filters, and Filters' button reads **Show results (N)**.

- **A tidier Map panel:** the big title and the long sources paragraph are gone; a one-time **Getting started** tip replaces the intro. The area you're looking at is named in a bar that stays pinned at the top, with the filing count, **+ Compare** and a **⋯** menu (Save search now asks for the name right there, plus Copy link and Filing alerts); with nothing picked it offers Box, Shape, Radius and County. Area reports sit together under **Reports for this area** (now with Crime, and they run on the map view when nothing is picked). Construction Filings shows its live count in the header and has an honest **On map** switch, and the panel ends in one line. On phones, Explore starts with the area bar and opens the filings for you.
- **Pages that flow:** every page has the same header, with its buttons on the title row and downloads under one **Export ▾**; Timeline, Companies, Changes, Compare areas and Reports show your filters as chips with **Edit filters**, which now opens over the page instead of jumping to the Map; after a page takes you to the Map, **← Back to …** returns you to the same spot; Changes opens on **Last 7 days** so its count matches the green number, says how many changes match your filters, and opens a filing's card over the page (with **Show on map**); Reports puts recent exports first and groups new reports into "From your filters" and "For an area"; the New report dialog links to Reports; Notes & watchlist has **+ Site note**, one Export menu (with Import) and the watchlist first; the Market page folds its county picker behind **Change**; and empty pages say what to do next.
- **One home for settings:** the gear (top right, or Ctrl+, / ⌘,) opens a Settings page with Light, Dark or Match device; your name and team passcode for shared notes and projects; the default base map; what's saved on this device; installing the app (now on computers too); keyboard shortcuts; Reset layout; and help. On phones it's More → Settings or the gear on Explore. Notes & watchlist and Projects show who you are and whether sharing is on, and messages about things your site hasn't set up are now plain words.
- **Simpler navigation:** a top bar with five places (Map, Filings, Market, Reports, My Work) instead of ten tabs that ran off the edge; Timeline, Companies (was Activity) and Changes (was Updates) sit under Filings, Compare areas under Market, and Projects, Notes & watchlist and Saved searches under My Work; **Ask AI**, **?** (Data & help, was the Sources tab) and the Settings gear are always at the top right, on every page; the green number on Changes now counts only what's new since your last look; and on phones the bottom bar is Map, Explore, Filings, Market and More, with More as a short grouped list.
- **Roomier pages:** Market, Reports, Notes, Activity and the other tabs now use the full width (the Map's left panel steps aside and comes back when you return to the Map); tablets open with the map at full width; buttons look the same everywhere, including in dark mode; and buttons and chips are easier to tap on touch screens.
- **Plans that get the most out of the land:** buildings and homes fill what the site holds (phase 1 is what you asked), warehouses with truck courts, parking garages when asked for (or when they pay), housing requests that compare apartments, townhomes and duplexes, a value line on every option, no dumpsters by default and far fewer future pad sites.
- **More than one entrance:** an Add Entrance tool (click the street lot line), "two entrances" in a request, or "add another entrance" in Change With AI; and the AI buttons show a spinner while they work.
- **Change With AI:** change a laid-out plan by name ("make Apt Bldg 7 four stories", "remove Bldg 3", "move the clubhouse to the back"); only those pieces change, or the rest of the site re-fits around them when you ask.
- **Amenities placed with sense, and moves that keep a plan tidy:** one pool per community, beside its clubhouse; commons amenities along the drive instead of out by the pond; checks that flag a lone or second pool. A building you drag settles in the nearest clear spot, takes its pool, patio or drive-thru with it, and parking it cut grows back when it moves away.
- **The AI plans with the engine:** **What Should Go Here?** suggests uses for a site from what the app knows about it and its surroundings, each one ready to lay out; and after the engine draws the options, the AI reviews them as pictures with their numbers, revises the program when they miss, and ranks the result, with its score and verdict on each option.
- **Site plans that always fit and look finished:** every plan has its parking, a drive and dumpsters, and an ask too big for the land becomes the most that fits; small extras (patio, playground, lawn) beside a single use; neighbourhoods that fill large tracts with a community center and park; better tree placement; a library of about 230 building types; point-by-point shape editing; dependable Cmd+Z; a site plan panel laid out like a property card; faster on sites up to 300 acres; and the AI thinks longer about the program.
- **Curving neighbourhood streets:** single-family layouts now have streets that curve, with lots and homes following them, for about the same number of lots as straight streets; a setting switches back to straight.
- **Edit Layout:** plans open for looking; editing is a switch, and moving a piece changes only that piece (it snaps to its neighbours and the setbacks, and parking under it gives way) instead of re-laying out the whole site. Re-fit Plan does that on demand.
- **Townhome and duplex communities that fit:** a duplex or townhome count too dense for lots of their own becomes two-story six-unit rows on a shared parking court, with fenced patios, unit lines and a turnaround; a **Side Street** tool (also found from the map's roads) and a pull-through drive out to it; and the AI now chooses between homes on lots and a court.

- **Site plans that fill the site and look built:** what you ask for is Phase 1 and the rest of the site holds more of the same as Phase 2; several building rows on deep sites; clean rectangular ponds and one landscape background instead of blobs; trash left out unless turned on; tree canopies and 3D trees with a Trees button; L-shaped, courtyard and tower buildings; parapets and floor lines in 3D; restaurant pads with drive-thru and outdoor seating; real playgrounds; parking garages.

- **A clearer Projects tab:** projects as cards or a list with a drawing of each site, its address and acreage; a page per project with a summary card (site area, parcels, owners, appraised value, options), its parcels, each option drawn with its numbers, and notes; search and sort; **New Option** adds a plan on the same site in one click; nothing is cut off on phones or narrow windows.

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
