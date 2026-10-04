# fs-real-estate-intelligence

Finishes Solutions real estate intelligence map for Waller County and the six surrounding counties (Harris, Fort Bend, Montgomery, Austin, Washington, Grimes). The core data layer is two years of TDLR TABS construction registrations, enriched with AI classification and Census tract demographics.

## What's in the app

- **Map**: every filing placed where it will be built, with box / shape / radius / county selection, a month slider (play through what is under construction), and a census-tract demographics layer (growth, income, home value, rent, vacancy).
- **Timeline**: monthly pipeline of value (or count) under construction, stacked by type, county or use; drag across it to filter. Below it, a Gantt of every matching project. Hatched bars are dates we estimated because the filer left them blank.
- **Who's building**: developers/owners, architects and GCs ranked by activity; click one to filter the map to their portfolio.
- **What changed**: new filings, status, value and date changes, and filings that disappeared from TABS.
- **Ask**: plain-English questions ("medical over $2M near Katy starting next year") become filters you can see and undo, plus a short answer that cites TABS numbers from the matched filings only.
- **AI project brief** on any filing: what it is, timing, who's involved, area context.
- **Saved searches** (per browser) with "N new" counts, shareable links (all filters live in the URL), and an **RSS feed** for any search (`/api/feed?...`), which works with any reader or Zapier "RSS → email" for alerts.
- **3D buildings and building panel**: zoom in to see buildings in 3D (OpenStreetMap footprints and heights from the MapTiler tiles). Click one for its appraisal-district parcel (owner, market/land/improvement value, year built, acquisition date, land area) from the free Texas GIO StratMap parcel service, businesses mapped inside it (OpenStreetMap), construction filings on the parcel, the census tract snapshot, an orbit camera, a Google Street View link, and a Mapillary street photo if `MAPILLARY_TOKEN` is set.
- **Phone and tablet**: on phones the map is full screen with a bottom tab bar (Map, List, Timeline, Activity, More), a floating ask bar and swipeable bottom-sheet cards; on tablets the list is a collapsible side panel and details open in a right-hand drawer. The site installs as an app (Add to Home Screen) and the app shell works offline; data refreshes when back online.
- **Field notes**: drop a site note at the map center or your GPS location with a title, tag, notes and phone photos; star any filing or building to watch it (watched filings are flagged when the nightly refresh sees a change). "Near me" shows filings within 3 miles of your location. Notes, photos and the watchlist are shared with the team through Supabase (no sign-in; optional team passcode) and work offline.
- Exports (green Export button, or the **Reports** tab): Summary report (PDF, Excel, web page), Filing list (PDF, Excel, CSV, GeoJSON), Area comparison and Activity report (PDF, Excel, CSV).
- **Reports** tab: start any report with one click, and find past exports again: download, re-run with today's data (same filters and area) or open them on the map. Past exports are kept in this browser only (newest 50 files, up to about 150 MB; older ones stay listed so they can be re-run).
- **Assistant cards**: answers come with cards in the chat: filing summaries with metrics and charts ("Summarize the filings in view"), charts ("chart new builds by month"), a filing, an area, side-by-side comparisons, nearby places, drive time, weather, news, site imagery and location details (owner, value, size, businesses, filings). Replies use real numbered lists. Drag the chat's left edge to widen it (it never gets narrower than the default; double-click resets).
- **Business search**: the map search finds businesses by name (e.g. "Starbucks", "Buc-ee's"): OpenStreetMap shops, restaurants and services near the map center, plus Texas Comptroller sales-tax permit holders in nearby towns (placed by geocoding their address).
- **Market** view: growth signals per county (or the whole region) from free public data: population and growth (ACS), jobs and top industries (Census LEHD LODES), new housing units permitted per year and year to date (Census Building Permits Survey), new business locations per month and the newest ones (Texas Comptroller sales-tax permits), and local development news for each county and its busiest towns (Google News). Every chart has a hover readout and a table.
- **Jobs layers** on the map (Layers → Demographics): jobs located in each tract, job growth, and jobs per resident (above 1 means more people work there than live there), with the top industries on hover and on the building card.
- **Registered businesses at an address**: the building card lists the retail, restaurant and service businesses holding a Texas sales-tax permit at the parcel's street address (owner entity, suite, date the location opened); filing cards have a **Look Up Registered Businesses** button for the filing's address.
- **Sources** tab: every data source, what it feeds and how fresh it is (last nightly refresh, next one, which live layers are on and when their tiles were requested). It also checks whether a newer nightly refresh has landed since the page loaded.
- **Map camera**: tilting the map by hand (right-drag, ctrl-drag, two fingers) turns **3D View** on; the compass button under the zoom buttons returns to a flat, north-up view of the same spot. Zoomed out to the globe, the map straightens itself, and the 3D terrain surface only shows from town zoom in (MapLibre doesn't fully support terrain on the globe).
- Above the Ask AI button, up to five suggested questions follow what you're looking at: the open filing or building, the town in view, your filters. ⌘K / Ctrl+K jumps to the map search.
- Select several buildings or parcels with Shift-click (on touch screens, the building card's Select Multiple button).
- The list panel is resizable on tablet and desktop: drag its right edge (or focus it and use the arrow keys); double-click resets it. The width is saved per browser.

## How the data works

```
GitHub Action (nightly, or manual)          Vercel (every deploy)
  node build.mjs                             node build.mjs --assemble
   ├ TABS list, 24 months, per county/month   └ copies src/ + data/ + lib/ to public/
   ├ TABS detail pages      (cache)
   ├ geocoding              (cache)          Vercel functions (api/)
   ├ OpenAI enrichment      (cache)            ask.js   question → filters → grounded answer
   ├ change feed vs last run                   brief.js per-project brief (CDN-cached a week)
   ├ ACS tract demographics                    feed.js  RSS for any filter
   ├ area context: LODES jobs, Census          tenants.js  businesses registered at an address
   │   housing permits, Comptroller new
   │   businesses, Google News (area.json)
   └ commits data/  ──────────────push──────▶ deploy
```

- `data/regions.json`: counties (TABS id + FIPS), ring counties, bounding box, months of history. Adding a county is a JSON edit.
- `data/filings.json`, `data/geo.json`, `data/changes.json`, `data/market.json`, `data/area.json`: what the site loads.
- `data/cache/`: TABS details, geocodes and AI results, committed so each nightly run only fetches what's new. Files are written one entry per line so git diffs stay small.
- The build refuses to overwrite data if TABS suddenly returns less than half of last week's filings (set `ALLOW_SHRINK=1` to force).
- `lib/`: code shared by the build, the functions and the browser (filter spec, use taxonomy, OpenAI client).

The first full run takes a few hours (Nominatim allows one request per second); later runs take minutes.

## Regrid (paid parcel data, capped)

Plan: Regrid Bundle Access, 2,000 parcel records and 200,000 tiles a month; overage $0.10 a record and $0.001 a tile. The app never goes into overage:

- **Parcel Lines (Regrid)** in Map Layers: parcel boundaries from street zoom (15) in. Tiles are only requested at zoom 15–16 (closer zooms reuse them) and the CDN keeps each tile for a week, so the same tile is paid for at most once a week.
- **Get Regrid Details** on the building card: one parcel record per click (zoning, standardized land use, the full record). Each parcel is saved in Supabase (`regrid_parcels`) and is free after that.
- **Caching and freshness**: a record is saved with its parcel outline and county, and any later lookup with the same parcel ID or anywhere inside that outline is free. Regrid re-pulls county data on its own schedule; its Verse endpoint gives each county's `last_refresh` date (read at most once a day into `regrid_counties`). A saved record fetched before its county's last refresh, or more than a year ago, is shown as out of date with an **Update (uses 1 record)** button. Nothing re-spends automatically. Migration `20261009000000_regrid_freshness.sql` (applied).
- **Caps** (`api/regrid.js`): `REGRID_RECORD_CAP` (default 1,800) and `REGRID_TILE_CAP` (default 180,000) a billing cycle. Every billable call is counted atomically in Supabase (`regrid_usage`, `regrid_take()`), and the count never runs behind what Regrid's own `/usage` endpoint reports. At the cap, records are refused with a message and tiles come back empty. Without Supabase there is no counter, so Regrid is refused entirely (fails closed).
- The token stays on the server: set `REGRID_API_KEY` (or `REGRID_TOKEN`) on Vercel (Sensitive). It is never in the code, the repo or the browser.
- Setup: `supabase/migrations/20261007000000_regrid.sql` (already applied to the project), `REGRID_API_KEY`, and `SUPABASE_URL` + `SUPABASE_SECRET_KEY` on Vercel.
- The Sources tab shows records and tiles used this cycle against the caps.

## Area context (Market view, jobs layers, registered businesses)

Built nightly by `build/area.mjs` into `data/area.json` (jobs also go onto the tracts in `data/market.json`). All free, no keys. Each source is best effort: if one fails, last night's numbers stay and the log says why.

| Data | Source | Refresh | Notes |
|---|---|---|---|
| Jobs by tract and industry | US Census LEHD LODES 8, workplace file (WAC) | Yearly; the newest year is about two years old | Jobs counted where people work, all jobs covered by unemployment insurance. Growth is against the year five earlier. The statewide Texas file is large, so the nightly build only downloads it when a new year appears (a HEAD request checks) (`REBUILD_AREA=1` forces it; the block-level cache is `data/cache/jobs.json`). |
| Housing units permitted | US Census Building Permits Survey, county files | Monthly, about six weeks after the month | Units authorized (single-family vs 2+ units) and value. Includes Census imputation for places that don't report every month. |
| New business locations | Texas Comptroller, Active Sales Tax Permit Holders (data.texas.gov `jrea-zgmq`) | About weekly | Counts permits issued per location per month. Only permits that are still active are in the dataset, so older months read low (closed businesses drop out) and a new permit can be a change of owner. Covers sellers of taxable goods and services (retail, restaurants, many services); most offices and medical practices don't hold one. |
| Local development news | Google News search per county and the 10 busiest towns (`AREA_NEWS_TOWNS`) | Nightly | Development, construction, rezoning and real estate stories; headlines kept 120 days. |
| Registered businesses at an address | Same Comptroller dataset, live through `api/tenants` | On demand, cached a day | Matched on house number + the main street word, plus ZIP (or city). Suites at a different house number, or addresses written very differently, can be missed. |

Optional: `SOCRATA_APP_TOKEN` (free at data.texas.gov → Developer Settings) on Vercel and as a GitHub secret raises the Comptroller API's rate limit. Not needed at this volume.

Not included, on purpose: sales and lease comps. Texas does not disclose sale prices, and no free source has lease rates; that data needs a licensed provider (CoStar, CompStak and similar) kept behind a sign-in, since this site is public.

- **Consumer spending (estimates)**: Map Layers → Demographics adds Consumer Spending, Spending per Household, Dining Out, Home Furnishings and Apparel per census tract; the Market view adds spending by category and the **city sales tax collected each month** (Texas Comptroller allocations, a real local spending trend). The tract figures are modeled (Census ACS households by income × BLS Consumer Expenditure Survey spending by income quintile, read between quintiles at each bracket's income, adjusted to the South), not measured. The series ids are pinned in `lib/spending.mjs` because the BLS flat-file catalog refuses GitHub Actions; only the BLS API is used; the BLS coefficients are cached in `data/cache/ce.json` and refreshed monthly (optional `BLS_KEY` for the BLS v2 API).
- **Ask about anything**

## Site facts and economics (building card Site section, Market view)

Free, no keys. Live lookups go through `api/site` (cached a week at the CDN); the economics are built nightly by `build/econ.mjs` into `data/area.json`; Houston crime is loaded nightly into Supabase.

| Data | Source | How | Notes |
|---|---|---|---|
| Flood zone | FEMA National Flood Hazard Layer (map service layer 28) | Live, at the point | A/V zones = 1% annual chance (100-year); shaded X = 0.2% (500-year). |
| Traffic counts | TxDOT AADT feature service | Live, roads within 300 m | Annual average daily traffic; one entry per route, plus the busiest city street. |
| Water and management districts | TCEQ water districts (ArcGIS Online) | Live | MUDs, WCIDs, management districts, regional water authorities; river authorities and groundwater districts left out. |
| Tax increment zones, METRO stops | City of Houston open data | Live, Houston only | TIRZ at the point; bus stops within 400 m. |
| Opportunity Zone, school district | CDFI Fund via ArcGIS Online; Census TIGERweb | Live | |
| Environmental flags | EPA ECHO facility search | Live, ¼ mile | Flags facilities with violations, toxic releases, penalties or hazardous-waste handling. A screening flag, not a Phase I. |
| Alcohol sales at the address | Texas Comptroller mixed beverage gross receipts (`naix-2893`) | Live | Last 12 months per permit; matched like registered businesses (house number + street word + ZIP). |
| Crime nearby, crime layer and crime reports | Houston Police NIBRS yearly CSVs | Nightly into `crime_incidents` (live-sync step `crime`), queried with `crime_near()` | Last 25 months kept. HPD's file runs about three months behind. Houston city only; needs migration `20261010000000_site_data.sql`. |
| County unemployment | BLS LAUS (API v1, or v2 with `BLS_KEY`) | Nightly | All 254 Texas counties, the state and four metros; latest month and a year earlier. |
| Rates | FRED graph CSV (10-yr and 5-yr Treasury, Freddie Mac 30-yr), New York Fed SOFR | Nightly | Latest, a year earlier, a weekly line for the last year. |
| Typical rent by ZIP | Zillow Observed Rent Index (ZIP, all homes) | Nightly | About 750 Texas ZIPs. |
| Home loans | CFPB HMDA data browser | Nightly (new year each spring) | Originated loans, dollars and purchase loans per region county. |

**FEMA (statewide):** Map Layers → **Flood Zones (FEMA)** draws FEMA's effective flood map (National Flood Hazard Layer) at neighborhood zoom, through `api/fema?tile=` (cached a month). **FEMA Report** (under Area at a Glance and on the selection bar, for any selection) and **FEMA report (¼ mile)** on a building card's flood row open a report: the share of the area in high (100-year), moderate (500-year) and minimal flood zones, floodway and base flood elevation (NFHL, sampled across the area); NFIP flood insurance claims paid in the census tracts touching the area, by year and by storm (OpenFEMA *NFIP Redacted Claims v3*); federal disaster declarations for its counties since 2000 (OpenFEMA); and FEMA's National Risk Index (overall rating, expected annual loss by hazard, social vulnerability, resilience). **Export Report** (HTML → PDF) and **Export CSV**. The assistant's `fema_report` tool answers flood, insurance-claim, disaster and hazard questions. Free, no keys; areas up to 400 sq mi (zone shares up to 60 sq mi). Claims are a neighborhood measure: FEMA redacts addresses to the census block group.

**Crime (Houston):** Map Layers → **Crime (Houston)** draws last-12-month incidents as a heat map, then ~¼-mile squares when zoomed in (all, violent or property; click a square for its report). **Crime Report** (under Area at a Glance, and on the selection bar, for any box, shape, county or radius selection) and **Full crime report** on a building card open a report card: totals vs the year before, incidents per square mile vs the citywide rate, a 24-month chart, top offenses and premises, the newest incidents, **Show Incidents on Map**, **Export Report** (printable HTML → PDF) and **Export CSV** (up to the newest 2,000 incidents). The assistant's `crime_stats` tool answers questions about incidents near a place, the open building or the selected area. Backed by `api/crime` and the SQL functions `crime_grid`, `crime_report` and `crime_list` (migration `20261011000000_crime_reports.sql`). City of Houston only; HPD's data runs about three months behind.

Sources are hidden on cards and panels by default (one clean view for everyone); **Sources → Show sources on cards and panels** turns them on for that browser. Reports always list sources.

## AI assistant

The **Ask AI** button (or ⌘/ on a Mac, Ctrl+/ elsewhere) opens a chat that works the map through tools: filter, find, highlight, open a filing, fly somewhere, toggle the heatmap or views. Press the mic to talk to it instead (OpenAI Realtime over WebRTC).
- **Anywhere in the world**: "take me to Lyon", "show me Germany", "what's being built in Munich". Places with a country or state after a comma are looked up worldwide (MapTiler, then OpenStreetMap). Bare names check Texas first, then the world: when several places fit ("Paris", "Springfield", "Georgia") the assistant asks which one and offers them as buttons instead of guessing. The filings, demographics and parcel data cover Texas only; outside it the assistant answers from general knowledge (labelled approximate) or a web search, and says so. Weather, nearby places and drive times work worldwide (drives over ~2,500 miles are refused).
- `api/chat.js`: text chat (stateless; the browser runs the tool calls and sends results back). Model `OPENAI_CHAT_MODEL` or `OPENAI_MODEL`; `OPENAI_CHAT_REASONING_EFFORT` overrides the effort for chat only.
- `api/realtime.js`: short-lived voice session. `OPENAI_REALTIME_MODEL` (default `gpt-realtime-2.1`, then `gpt-realtime`), `OPENAI_VOICE` (default `marin`), `VOICE_ENABLED=false` turns voice off. Sessions end after 10 minutes; 30 per IP per day.
- **Web search, on request only**: say "search the web for…", "look it up" or "Google it" and the assistant calls `api/search.js` (OpenAI Responses API with its built-in web search, low reasoning effort, a few seconds). It answers in a couple of sentences and lists the source sites as links. It never searches on its own. Optional `OPENAI_SEARCH_MODEL` (default `gpt-5-mini`, then `gpt-4.1-mini`). Each search is billed by OpenAI (a search call plus tokens); the endpoint allows 6 a minute and 60 a day per visitor.
- Voice replies start only after the transcript shows a real request: background noise and the transcriber echoing its own hint list of place names are dropped instead of answered, and your words appear above the reply.
- Tools are defined once in `lib/agent-tools.mjs`, including distance / drive time, live layers, weather, news and site imagery (see Live layers below).
- The assistant's rulebook (how to read a request and which action answers it) is `lib/rulebook.mjs`, in short sections; `test/assistant.mjs` checks every action is named there. To see whether a rule change helps, run `OPENAI_API_KEY=… node test/intent-eval.mjs` (about 30 sample requests through the real model, scored by which action it picks first; add your own cases at the top).
- Things you can say besides searches and filters: "zoom out a little", "tilt", "rotate left", "pan north", "north up", "orbit", "stop", "back to the region" (move_camera); "what am I looking at?" (describe_view: open card, streets, places and businesses around the map center, the building there, live layers); "save a note here: vacant lot, call the broker" (add_site_note); "watch this project" / "stop watching it" (watch).

## Live layers, drive time and field tools

Area reports share `src/reportkit.js`: the printable HTML shell, an SVG area map, tables and bars, saving into the Reports tab, and `ctx.addAreaReport({ key, label, desc, run })`, which puts a report on the Site section (circle around a building), the Reports tab (selected area, map view or a drawn area) and the selection bar.

Layers panel → **Live conditions**, the **From here** buttons on every filing and building card, and the assistant (text or voice) all use the same free sources:

| Feature | Source | Key needed |
|---|---|---|
| Rain radar, lightning, satellite clouds | NOAA nowCOAST, through `api/tile` | none |
| Hurricanes & tropical storms (cones, tracks) | NOAA National Hurricane Center, through `api/tile` / `api/weather` | none |
| Wind arrows, weather at a spot | Open-Meteo, through `api/weather` | none (optional `OPEN_METEO_API_KEY`) |
| Live traffic layer, drive time **with traffic** | TomTom, through `api/tile` / `api/drive` | `TOMTOM_API_KEY` (free tier) |
| Drive time without a TomTom key | OSRM on the FOSSGIS servers (OpenStreetMap roads), through `api/drive` | none |
| Drive-time maps (10/20/30-minute bands, now or rush hour / weekend), assistant `drive_time_map`; the card counts people, households and jobs (Census tracts) and filings in each band, exports HTML and CSV, and any band can become the selection | TomTom Calculate Reachable Range through `api/isochrone` (one call per band; typical-time results cached 7 days at the CDN, coordinates rounded to ~100 m); Valhalla on the FOSSGIS servers without a key or if TomTom fails (no traffic) | `TOMTOM_API_KEY` (same free tier as drive time, ~2,500 calls a day); none for the fallback |
| 3D terrain | Mapterhorn (browser direct) | none |
| NASA recent imagery, site imagery thumbnails | NASA GIBS + CMR + Worldview Snapshots (HLS Landsat / Sentinel-2, 30 m), browser direct | none |
| Live Planes (aircraft anywhere: callsign, type, altitude, speed, route), plane card, assistant `air_traffic` | adsb.lol (open data, ODbL), airplanes.live as a fallback, through `api/planes` | none |
| Plane owner ("Registration" on the plane card), assistant `aircraft_registration` | FAA Releasable Aircraft Database (`MASTER`, `ACFTREF`, `ENGINE` from registry.faa.gov/database/ReleasableAircraft.zip), loaded nightly into Supabase `aircraft_registry` by live-sync step `aircraft` (only changed rows are written), read through `api/planes?reg=` | `SUPABASE_SECRET_KEY`; migration `20261011000000_aircraft_registry.sql`. To load by hand: `FAA_DIR=<folder with the unzipped .txt files> ONLY=aircraft node build/live-sync.mjs` |
| Plane card photo, details and flight path (2D line; 3D ribbon and curtain when tilted), assistant `flight_path` | adsb.lol traces (`globe.adsb.lol/data/traces/…/trace_full_*.json`, `trace_recent`), planespotters.net photos, adsbdb aircraft, adsb.lol airports, through `api/planes?track=` / `?aircraft=` / `?airport=` (`lib/adsblol.mjs`) | none (planespotters needs the contact URL in the User-Agent, set in code) |
| Market view: Houston crime trend, busiest roads; Market report export | `api/crime?city=1` (four boxes summed, each under the 1,500 sq mi report limit) and `api/traffic?bbox=` (TxDOT AADT: busiest named routes and average daily traffic by road type; current year only) | Supabase for crime; none for traffic |
| Traffic Counts map layer, Traffic Report (area: busiest roads, every counted segment, by road type, live speeds, incidents; HTML/CSV export), assistant `traffic_report` | TxDOT AADT FeatureServer through `api/traffic?lines=` (layer) and `POST api/traffic` (report; one count per road segment, roadbeds de-duplicated; current year only, TxDOT keeps no history in this layer); TomTom Traffic Flow Segment (8 busiest roads) and Incident Details (live, never stored) | none for counts; `TOMTOM_API_KEY` for live speeds and incidents |
| Airports layer, airport card (photo, runways + diagram, weather, airlines, statistics, FAA diagram, OSM airport map, takeoffs/landings a day), nearest airports + approach-path flag on property cards, assistant `airport_info` | OurAirports CSVs (every airport in the world, runways, frequencies; public domain) loaded nightly by live-sync step `airports` (changed rows only) with each US airport's FAA d-TPP diagram PDF (current 28-day cycle); `api/airports` (`?box`, `?near&path=1`, `?id`, `?osm`) adds aviationweather.gov METAR/TAF, Wikidata/Wikipedia (photo, "Airlines and destinations", statistics tables; cached a day per instance) and OpenStreetMap aeroways (Overpass, cached 30 days). Takeoffs and landings: `api/planes-sample` compares each minute's aircraft with the last (ground or short final ↔ airborne within 2–4 nm of an airport) into `airport_ops_daily` | `SUPABASE_SECRET_KEY`; migration `20261012000000_airports.sql` |
| Air Traffic Report (area: sightings by hour, low share, mix of jets / props / helicopters / military, by month, approach paths, overhead now), Flight Report (one aircraft: photo, route, path map, altitude and speed profile, registration; HTML + CSV of the track), assistant `air_traffic_report`, `flight_report` | `api/planes-sample` also bins every airborne aircraft into ~5 km cells by month and hour (`air_profile`, `air_profile_samples`; migration `20261013000000_air_profile.sql`), read by `POST api/planes?report=1`; flight reports reuse the plane card's adsb.lol trace, photo, route and FAA registry lookups | `SUPABASE_SECRET_KEY` |
| Low Flight Paths layer, "Air Traffic" on property cards | `api/planes-sample` (Vercel Cron, every minute) counts aircraft below 3,000 ft in ~1 km cells into Supabase (`air_cells`, `air_days`; migration `20261008000000_air_traffic.sql`) | `SUPABASE_SECRET_KEY`; set `CRON_SECRET` to lock the cron endpoint |
| High-res site imagery (dated, sub-metre) | Esri World Imagery Wayback (archived versions, only those where the spot changed) and USDA NAIP (~0.6 m, Texas about every 2 years) from Microsoft Planetary Computer, through `api/imagery` | none |
| Project news | Google News search (GDELT Project DOC 2.0 as fallback), through `api/news` | none |
| ESRI / Free Map basemaps | Esri World Imagery, OpenFreeMap | none |

Voice and chat understand requests like "how far is this property from me and what's the drive time", "how's traffic getting there", "turn on radar and wind", "show hurricanes", "what's the weather here", "any news on this developer", "has work started on this site". "This" means the card that is open; "me" is the phone or laptop's GPS (the browser asks for permission once). With no card open, distance questions use the filing nearest to you.

Limits to know:
- Without `TOMTOM_API_KEY` there is no traffic layer and drive times are free-flow estimates (the app says "no live traffic data"). TomTom's free allowance is monthly (about 200,000 traffic tiles at the time of writing; check developer.tomtom.com/pricing for current routing and tile quotas). Tiles are CDN-cached for 2 minutes, so a few people panning the same area share them.
- Radar covers the contiguous US; lightning is a 15-minute density grid (~8 km), not individual strikes.
- NASA HLS imagery is 30 m per pixel and arrives every few days with a 1–3 day delay: good for "is the land cleared or a pad poured", not for detail. Cloud % is for the whole ~110 km scene.
- High-res site imagery is sharp (sub-metre) but not current: Esri's archived versions are typically months to a few years old (the capture date is shown when Esri's metadata has it) and NAIP is flown about every two years. Truly recent sub-metre imagery (days or weeks old) is a paid product (e.g. Nearmap, Planet SkySat, Maxar). Esri World Imagery and Wayback are under Esri's terms of use; keep the attribution.
- News searches several angles at once: the project, its developer / tenant / owner, the businesses at the spot, the parcel owner, the street address, the subdivision and the town or county. Towns are always searched as "Waller, TX" / "Waller, Texas" / "Waller County", never the bare word, so a town that is also a surname doesn't pull in news about that person. Single-asset LLC names rarely appear in the news. The query builder is `lib/news-query.mjs`.
- Licences: Open-Meteo's free API, the FOSSGIS routing servers and the public Photon/Nominatim services are for non-commercial or fair use. This app is internal, but heavy or customer-facing use would need Open-Meteo's paid API (`OPEN_METEO_API_KEY`) and your own OSRM server. Keep the attributions shown in the map's attribution line.

## Setup

1. **Vercel → Project → Settings → Environment Variables**: `OPENAI_API_KEY` (type Sensitive, Production + Preview). Optional `OPENAI_MODEL` (default `gpt-6-luna`, falling back to `gpt-5-mini` / `gpt-4.1-mini` if the key can't use it) and `OPENAI_REASONING_EFFORT` (default `high`; `none` to omit). Optional `MAPILLARY_TOKEN` (free client token from mapillary.com/dashboard/developers) for street-level photos in the building panel. Optional `TOMTOM_API_KEY` (free at developer.tomtom.com → Dashboard → Keys) for the live traffic layer and traffic-aware drive times. Optional `OPEN_METEO_API_KEY` (paid Open-Meteo plan) only if you outgrow their free non-commercial API.
2. **GitHub → Settings → Secrets and variables → Actions**: secret `OPENAI_API_KEY`. Optional: secret `ZAPIER_DIGEST_WEBHOOK` (a Zapier catch hook gets a weekly summary of new filings), secret `MAPTILER_KEY`, secret `CENSUS_KEY`, variable `OPENAI_MODEL`.
3. **OpenAI dashboard**: set a monthly budget cap on the project that owns the key. The site is public, so the cap is the hard spending limit.
4. Run **Actions → Refresh data → Run workflow** once (or push a change under `build/`). The nightly schedule only runs on the default branch. The old Zapier monthly deploy hook is no longer needed.

## Environment variables (build)

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enrichment. Without it the build runs and filings simply have no AI fields. |
| `OPENAI_MODEL` | Preferred model (default `gpt-6-luna`). |
| `OPENAI_REASONING_EFFORT` | Reasoning effort sent with every request (default `high`; `none` to omit). |
| `OPENAI_ENRICH_MODEL` | Optional cheaper model just for the bulk tagging step (e.g. `gpt-6-luna`). |
| `AI_MAX_ROWS`, `AI_CONCURRENCY` | Cap filings enriched per run (default 40000) and parallel requests (default 6). |
| `MAPTILER_KEY` | Geocoding fallback (defaults to the site key). |
| `CENSUS_KEY` | Census API key (free at api.census.gov/data/key_signup.html). The ACS demographics need it. |
| `ONLY` | County subset for test runs, e.g. `Waller,Austin`. Other counties keep last run's data. |
| `PERIOD_START` / `PERIOD_END` | Fixed date range (`YYYY-MM-DD`). Default: 24 months back to yesterday. |
| `REBUILD_GEO`, `REBUILD_MARKET` | Force a rebuild of base geometry / demographics. |
| `ZAPIER_DIGEST_WEBHOOK` | POST a nightly digest of new filings (only on nights with changes). |
| `REBUILD_AREA` | Re-download the LODES jobs file even if the year hasn't changed. |
| `AREA_NEWS_TOWNS` | How many towns (by filing count) get their own news search (default 10). |
| `AREA` | Run the area step on an `ONLY=` test run (it's skipped on partial runs by default). |
| `SOCRATA_APP_TOKEN` | Optional Texas open-data app token (higher rate limit for the Comptroller data). |
| `ALLOW_SHRINK` | Allow a run with far fewer filings than last time. |

## Statewide database (Supabase)

All 254 Texas counties, five years back, are loaded into Supabase by `build/backfill.mjs` (workflow **Statewide data (Supabase)**). The site still reads the regional JSON above until the map is switched to query the database.

- **Schema:** `supabase/migrations/`. The tables are `filings` (PostGIS point), `counties` (outline and backfill status), `changes`, `runs`, plus the pipeline caches `tabs_cache`, `geocode_cache` and `ai_cache`. The public can read filings, counties and changes; everything else needs the service-role key.
- **GitHub secrets:**
  - `SUPABASE_URL`;
  - `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`);
  - `OPENAI_API_KEY`;
  - optional `MAPTILER_KEY`.
- **Modes (`MODE`):**
  - `backfill`: processes counties not yet done, in priority order (home counties, then metros, then the rest) for about 4.5 hours. Then the workflow starts its next run itself until no county is left.
  - `recent`: re-lists the last 3 months for every county (24 months on Sundays) and writes what changed to `changes`.
  - `auto` (nightly): `backfill` while any county is pending, otherwise `recent`.
- **Manual inputs:**
  - `counties`: re-run named counties.
  - `period_start`: backfill start; default is 5 years back.
  - `max_counties`: stop early, for a test. It also turns off the automatic next run.
- **Safety:**
  - If most of a county's geocoded filings fall outside it, the county is marked `error` and isn't stored. This guards against a wrong TDLR county id.
  - Every step is cached in the database, so an interrupted run resumes where it stopped.
- **Progress:** `select status, count(*), sum(filings) from counties group by 1;` and `select * from runs order by id desc;`

### Live-data history (workflow **Live data (Supabase)**, `build/live-sync.mjs`)

Saved nightly (storms and weather every 6 hours) so the facts behind the live layers build up a history you can query:

| Table | What | Rows |
|---|---|---|
| `news_articles`, `filing_news` | GDELT articles found for each active filing's developer / tenant / owner (120 searches a night, rotating through all of them). The site's News button also saves what it finds when Vercel has `SUPABASE_URL` + `SUPABASE_SECRET_KEY`. | small |
| `imagery_passes` | NASA HLS passes (date, cloud %) over each active filing (600 a night, rotating) | ~6k a month |
| `weather_daily` | Daily weather at each county centroid: 3 days back (analysis) and 7 ahead (forecast, overwritten as it firms up) | 7 counties x 365 a year |
| `storm_advisories` | NHC active-storm snapshots | a few hundred a season |
| `tracts` | ACS census tracts behind the Demographics layer (needs the `CENSUS_KEY` secret on the Refresh data workflow) | ~1,200 |

Not stored on purpose: map tiles and images (radar, traffic, clouds, terrain, NASA imagery). They are pictures that change every few minutes, would use up the free 500 MB quickly, and TomTom's terms don't allow keeping traffic data. Drive times aren't stored either; they depend on when you ask.

Setup: run `supabase/migrations/20261004000000_live_data.sql` once in the Supabase SQL editor. If the workflow uses the GitHub OIDC route instead of a stored `SUPABASE_SECRET_KEY`, redeploy the edge function too (`supabase functions deploy pipeline`) so it allows the new tables. First run: Actions → Live data (Supabase) → Run workflow with `imagery_days` = 60.

Useful queries: `select f.name, n.title, n.published from filing_news l join news_articles n using (url) join filings f on f.id = l.filing_id order by n.published desc limit 50;` and `select filing_id, max(day) filter (where cloud <= 20) as last_clear_pass from imagery_passes group by 1;`

### Team field notes (no sign-in)

Field notes, photos and the watchlist are shared with the whole team. The browser syncs through `api/field`, which uses the secret key; the tables (`field_notes`, `team_watchlist`) and the private `field-photos` bucket are closed to the public key by RLS. Each device keeps a copy, so notes work offline and sync when back online; last edit wins. People can type their name in Field notes so notes show "Added by … / edited by …".

Because there is no sign-in, anyone who has the site's address can read and change the shared notes. Set `FIELD_ACCESS_CODE` on Vercel to require a shared team passcode (typed once per device). Email sign-in is prepared but off: `supabase/migrations/20261005000000_field_notes.sql` has the per-person tables and policies for when it is switched on.

Setup: run `supabase/migrations/20261006000000_team_watchlist.sql` (after `20261005000000_field_notes.sql`), and set `SUPABASE_SECRET_KEY` (and `SUPABASE_URL` if the project isn't `ytsxkipkobvcgysylfzc`) on Vercel. Without the key the Field notes view says team sync is off and notes stay on the device.

## Run locally

```
npm install
npm test                 # synthetic fixture + API tests (mocked OpenAI) + offline pipeline and statewide tests
DATA_DIR=test/.data/ node build.mjs --assemble && npx serve public   # UI on synthetic data
node build.mjs           # real refresh (needs network access to TDLR, Census, OpenAI)
```

## Known limits

- Costs and dates are filer estimates; about four in ten filings lack a start or end date and get an estimated span (shown hatched).
- Use, tenant, developer, architect and GC are extracted by AI from the filing text and can be wrong or missing. Single-asset LLCs often hide the real sponsor.
- The AI endpoints' per-IP rate limit is per function instance (best effort). The OpenAI budget cap is the real limit; a Vercel Firewall rate-limit rule on `/api/*` adds a second one.
- The change feed keeps 13 months of history and starts with the second run; "this week" means changes found by any refresh in the last 7 days.
- Building heights are only as good as OpenStreetMap; unmapped heights get a default. StratMap parcel fields depend on what each appraisal district supplies (year built and acquisition date are often blank), and Texas does not disclose sale prices.
- Team field notes are last-edit-wins: if two people edit the same note while offline, the later edit (by device clock) keeps. With no sign-in anyone with the site address can edit or delete shared notes (set FIELD_ACCESS_CODE for a passcode), and names on notes are whatever people type.
- Business listings come from OpenStreetMap and are incomplete, especially in suburban strip centers. The Comptroller list on the building card fills in retail and service tenants but misses offices and medical, and only shows locations whose permit is still active.
- Market numbers are county-level (permits, new businesses) or tract-level (jobs, demographics) and lag: LODES jobs are about two years old, ACS is a five-year average, permits arrive about six weeks after the month.
- Building permits are not included: the City of Houston stopped publishing permit data in December 2025 and the other counties have no open feed.
