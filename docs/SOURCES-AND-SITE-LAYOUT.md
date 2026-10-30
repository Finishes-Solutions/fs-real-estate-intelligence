# Data Sources and Site Layout Engine

**Technical report · 2026-10-30**

Reviewed against the application Sources catalog, checked-in implementation, tests, and the deployed site at [fs-real-estate-intelligence.vercel.app](https://fs-real-estate-intelligence.vercel.app/#d=reg%7C2025-11%7C&ml=29.99678%2C-95.90804%2C8.82%2C0.0%2C55.0). The provider inventory and availability can change after this review.

## 1. System Summary

The product is a browser-based real-estate intelligence map for Waller County and six surrounding Texas counties: Harris, Fort Bend, Montgomery, Austin, Washington, and Grimes. It combines nightly committed datasets, live map tiles, on-demand public/provider lookups, and platform-owned Supabase data. Vercel functions proxy, normalize, cache, or report on external data; the browser is not the only integration layer.

The site-plan tool is a separate but connected planning subsystem. A user starts with parcel geometry or a drawn boundary, selects or describes a development program, and the application runs deterministic geometry and constraint code to produce plan options. AI can interpret a natural-language request, propose or critique options, and provide notes; it does not draw the plan geometry.

At inspection time, the supplied deployment URL opened on the Map view. MapTiler tiles were unavailable because its monthly limit had been reached; the app reported this and displayed the free OpenFreeMap/OpenStreetMap map fallback. This is a live observation, not a guarantee of later availability.

## 2. Data Architecture

### Static and nightly data

`node build.mjs` runs the refresh pipeline; GitHub Actions schedules the normal data refresh. The pipeline pulls filings and related records, enriches and geocodes them, derives change and market datasets, and writes JSON under `data/`. Best-effort sources retain previous values after failures; a sharp TABS row-count drop is rejected unless explicitly forced. Caches in `data/cache/` reduce repeated calls. Vercel runs `node build.mjs --assemble`, copying committed data, browser modules, and static assets into `public/`; assembly itself does not refresh data.

Core implementation: [build.mjs](../build.mjs), [build/tabs.mjs](../build/tabs.mjs), [build/geocode.mjs](../build/geocode.mjs), [build/enrich.mjs](../build/enrich.mjs), [build/changes.mjs](../build/changes.mjs), [build/market.mjs](../build/market.mjs), [build/area.mjs](../build/area.mjs), [build/econ.mjs](../build/econ.mjs), and [build/spending.mjs](../build/spending.mjs).

### Live layers, API lookups and persistence

The browser renders MapLibre layers from basemaps, local JSON/GeoJSON, and API responses. Some tile sources load directly in the browser; many lookups go through `api/` to keep credentials server-side, normalize provider formats, limit paid usage, and apply caching. API/CDN cache freshness is distinct from the publisher's release schedule.

- Committed `data/`: filings, geography, changes, demographics, area context and market datasets.
- Platform Supabase/PostGIS: project synchronization and selected live-sync datasets including development activity, crime and aircraft/flight history. See [api/devdata.js](../api/devdata.js), [api/crime.js](../api/crime.js), [api/planes.js](../api/planes.js), and [api/planes-sample.js](../api/planes-sample.js).
- Platform Supabase Storage: team reference files, project media and reports where configured.
- Browser storage: offline app shell, locally held projects when team sync is unavailable, project terrain grids and local report history.
- CDN/function caches: endpoint-specific; not authoritative publisher timestamps.

The user-facing inventory is implemented in [src/sources.js](../src/sources.js). It reports provider, use, freshness/status, enabled layers and some source-load metadata. Some entries intentionally group providers behind one product feature; some are conditional on keys, migrations or user action.

## 3. Source Inventory

This inventory follows the application's Sources screen and groups providers by ingest path. “Nightly” describes app ingestion, not necessarily the publisher's schedule. A source may be unavailable, stale, modeled, incomplete, or conditional on configuration.

### 3.1 Nightly built data

| Source(s) | Product use and handling |
|---|---|
| Texas Department of Licensing and Regulation (TDLR), TABS filings and project detail pages | Construction registrations on map, list, Timeline, Companies, project cards, filters and exports. Nightly rolling two-year county load; detail pages cached in `data/cache/`. |
| US Census Geocoder; OpenStreetMap Nominatim | Place new/changed filing addresses. Nightly geocoding in `build/geocode.mjs`; cached. City-level approximate matches are marked, not represented as street-level points. |
| OpenAI | Extract filing use/type, tenant, developer/owner and design-team fields. Nightly enrichment in `build/enrich.mjs`; cached; extraction can be wrong. |
| TABS snapshot comparison (derived, not an external source) | New, changed and disappeared filings on What Changed; computed by `build/changes.mjs` from successive snapshots. |
| US Census American Community Survey (ACS) 5-year estimates | Tract population, growth, income, home values, rent, vacancy, age and housing units; built into `data/market.json`, annual release. |
| US Census LEHD LODES 8, Workplace Area Characteristics (WAC) | Jobs and industry by tract, job growth, jobs-per-resident layers, Market and property cards. `build/area.mjs` aggregates block-level WAC to tracts; compares the current available release with five years earlier. |
| US Census Building Permits Survey (BPS) | County housing permits by year and YTD, by housing type. Annual county files plus recent monthly YTD files; prior values survive refresh failure. |
| Texas Comptroller Active Sales Tax Permit Holders (`jrea-zgmq`) | New business-location counts and recent openings in Market; also powers address lookups (§3.4). Active-only coverage means closed outlets disappear and older monthly counts can be understated. |
| Google News | Development/construction/rezoning/real-estate news by county and selected towns in Market. `build/area.mjs` and `lib/news-query.mjs`; recent headlines retained (120 days per Sources screen). |
| BLS Consumer Expenditure Survey (CEX) × ACS income/household data | Modeled tract-level spending by category for map, Market and property cards. `build/spending.mjs` / `lib/spending.mjs` interpolates spending by income group and adjusts to the South; this is modeled, not measured local spending. |
| Texas Comptroller city sales-tax allocations | Monthly city sales-tax collections in Market; reported with publisher lag. |
| BLS Local Area Unemployment Statistics (LAUS) | County/state/metro unemployment on property cards; monthly series, newest observations can be preliminary. |
| FRED Treasury/mortgage series; New York Fed SOFR | Treasury, mortgage and SOFR market indicators in Market; nightly refresh of public series. They do not directly determine site geometry. |
| Zillow Observed Rent Index (ZORI) | Typical asking rent by ZIP on property cards and a feasibility rent check; monthly, ZIP coverage varies. Not a lease comp or automatic project rent assumption. |
| CFPB / FFIEC Home Mortgage Disclosure Act (HMDA) data browser | County mortgage originations and amounts in Market; annual release. |
| Houston Police Department (HPD) NIBRS incident files | Houston crime layer, area reports, assistant answers and nearby-crime card figures. Synchronized into platform Supabase; Houston only and reporting is lagged. |
| FBI Crime Data Explorer; US Census Geocoder | City/county agency crime totals, reports, rankings and assistant responses for the US. `api/crimeus.js` / `lib/fbicrime.mjs`; periodically stored in a crime library with live fallback for uncached agencies. Department-level, not street-level incidents. |
| US Census TIGER and packaged `us-atlas` boundaries | County outlines/place labels and spatial matching. Census boundaries are built into app data; `us-atlas` is generalized for national display, while TIGERweb supplies more detailed home-county boundaries. |

### 3.2 Live layers, aircraft and weather

| Source(s) | Product use and caveat |
|---|---|
| MapTiler | Default/light/street/satellite/topographic basemaps and geocoding. Tile/API requests are limited; free-style fallback is available. |
| Esri World Imagery; OpenFreeMap / OpenMapTiles; OpenStreetMap | Free/fallback imagery, map labels/roads, and vector basemap context. Tile providers render or aggregate OSM data; attribution is shown on the map. |
| OpenStreetMap building footprints/heights | 3D building layer and neighborhood context from vector tiles; coverage and height quality vary by location. |
| NOAA nowCOAST: MRMS radar, lightning density, GOES infrared | Rain radar, recent gridded lightning density and cloud imagery overlays; fetched while enabled. Lightning density is not individual strike reporting. |
| NOAA National Hurricane Center | Tropical cyclone tracks, advisories and forecast cones. |
| TomTom | Live traffic tiles, traffic speeds/incidents, traffic-aware routing and reachable areas. Optional paid key; without it, live traffic may be unavailable and routing can use free-flow OSM-based services. |
| adsb.lol; airplanes.live | Live aircraft positions; adsb.lol also supplies historical/low-altitude sampling and traces. Community receiver coverage is incomplete and some aircraft are not visible. Low-flight history is an exposure index, not distinct-flight counts. |
| FAA Releasable Aircraft Database | Aircraft registration/owner lookup; periodically loaded into platform Supabase. Registered owner is not necessarily operator. |
| adsb.lol traces; planespotters.net; adsbdb | Flight-path history, aircraft details and photos for plane cards; photo attribution links back to contributors/provider. Freshness differs by endpoint. |
| Open-Meteo | Wind/weather at a location and forecasts; model data, not a local station observation. |
| Mapterhorn | 3D terrain and hillshade layer; static elevation surface, view-zoom dependent. |
| NASA GIBS / Harmonized Landsat Sentinel (HLS: Landsat and Sentinel-2) | Recent medium-resolution satellite imagery and dated passes; ~30 m resolution with capture/publication delay and cloud cover. Not for parcel/building-line measurement. |

### 3.3 Nightly county development pipeline

These records are normalized into a shared development-activity table and read through [api/devdata.js](../api/devdata.js). Its API serves bounding-box layers, nearby property-card/assistant results, counts, individual records and source-load metadata. Geometries are simplified for transport; they are not surveys.

| Source(s) | Data and handling |
|---|---|
| Harris Central Appraisal District (HCAD), weekly `Real_acct_owner.zip` permit file and HCAD parcel layer | Harris County permit/activity points and property-card permit details, last 24 months; `build/county-data.mjs`, pure parsers in `lib/countydata.mjs`. |
| City of Houston Plat Tracker | Houston city and ETJ plat applications, last 24 months, via ArcGIS service. |
| Fort Bend County subdivision service; Montgomery CAD; Waller, Austin, Washington CAD/BIS maps | Recorded subdivisions. Fort Bend has recording dates; several county maps are undated, so first-seen date is used. Grimes does not publish named subdivisions in this feed. |
| TxDOT Project Tracker | Planned, underway and recently completed road projects, county-filtered. Dates and costs are estimates from TxDOT. |
| TCEQ water-district list, outline layer and district pages; Texas Bond Review Board | Water/MUD/WCID district outlines, creation dates, tax rates and bonds. Several sources are matched by normalized IDs/names; district pages load in slices; outline data can be old. |
| Texas Education Agency (TEA) school directory and enrollment layers | School layer, nearest schools, ratings and enrollment; loader uses newest dated published layers. No enrollment forecasts. |

Implementation/storage contract: [build/county-data.mjs](../build/county-data.mjs), [lib/countydata.mjs](../lib/countydata.mjs), [api/devdata.js](../api/devdata.js), [county-data migration](../supabase/migrations/20261021000000_county_data.sql).

### 3.4 On-demand lookups and reports

| Source(s) | Product use and caveat |
|---|---|
| MapTiler geocoding; OpenStreetMap Nominatim; Overpass API | Search addresses/places/roads, nearby OSM places, businesses, airports, restaurants and schools. Public OSM endpoints have rate/fair-use limits; results are cached where documented. |
| Texas GIO StratMap appraisal parcels | Property-card owner, appraisal values, year built, acquisition date and parcel outline; on demand, appraisal-roll freshness varies (usually annual). |
| County appraisal district parcel maps (HCAD; Waller, Austin, Washington and Grimes named in Sources) | Fallback owner/appraisal lookup where StratMap lacks a parcel; county attributes differ. Some records lack building age/sale dates; condominium units may share outlines. |
| Regrid | Parcel Lines layer and detailed parcel lookup; paid and hard-capped monthly usage through `api/regrid.js`. Records are cached; without the usage counter, requests fail closed. |
| Esri World Imagery Wayback; USDA NAIP via Microsoft Planetary Computer | Historical/high-resolution aerials for Site Imagery/map; imagery dates and coverage vary. NAIP is periodic (about two-year Texas cadence); tiles are cached. |
| USGS 3DEP LiDAR via Microsoft Planetary Computer | Building-height estimates; survey year varies and new buildings may be absent. |
| USGS 3DEP elevation/The National Map; USGS point queries; Copernicus elevation via Open-Meteo | Site grid for site facts, pond-location nudge, contours and schematic grading. `api/terrain.js` bounds samples and falls back from elevation image service to points then a coarse ~90 m model. Cached on device; not a survey. |
| Google Maps Platform | Optional Google base maps/3D, search results and place cards; conditional paid key/session, capped place searches, Google display/storage rules apply. |
| TCEQ; US EPA; Railroad Commission of Texas; USFWS National Wetlands Inventory; USDA Soil Survey | Environmental overlays/report (facilities, wetlands, soils, regulated sites); agency GIS queries and caches vary. Screening is not a Phase I. |
| Texas Comptroller franchise-tax status/Public Information Reports | Company lookup for owner entity, status, registered agent and officers; on demand, cached, filings generally annual. |
| Overture Maps Places; Foursquare Open Source Places | Business/place layer, business search and businesses-in-building; monthly regional import/merge, with closed/doubtful records filtered. Overture can aggregate Meta, Microsoft and BrightQuery. |
| OpenStreetMap Overpass | Nearby airports/restaurants/schools/places and businesses-in-building; cached from roughly an hour to a day depending on endpoint. |
| TomTom; OSRM | Drive-time estimates, with TomTom live traffic where configured and OSM-based routing fallback. Fallback has no live traffic. |
| Google News; GDELT | On-demand project/property news with fallback; brief cache; search recall is not guaranteed. |
| Texas Comptroller Active Sales Tax Permit Holders | Business permits matched to property/address. Street normalization can miss suites or variant address formats; offices/medical practices are often outside taxable-permit coverage. |
| FEMA National Flood Hazard Layer (NFHL); TxDOT AADT | Property-card flood zone and nearby road counts; live agency GIS, cached. AADT is annual-average traffic, not live speed. |
| NFHL; OpenFEMA NFIP Redacted Claims/disaster declarations; FEMA National Risk Index | Area flood/hazard reports (zone share, claims, declarations, expected annual loss). Different monthly/annual publication cycles; claims are spatially redacted and risk index is modeled. |
| TCEQ water districts; City of Houston TIRZ; CDFI Fund Opportunity Zones; Census TIGERweb school districts | Property-card jurisdiction/district fields; coverage is jurisdiction-specific. |
| OpenStreetMap power-line data; Texas PUC CCN maps; City of Houston GIS | Utility map layer and property-card distances/service-area context. OSM power mapping is incomplete; CCNs and Houston mains have different update/coverage. |
| US EPA ECHO; Houston METRO | Nearby regulated facilities and Houston bus stops. ECHO flags are screening signals, not formal environmental review. |
| Texas Comptroller Mixed Beverage Gross Receipts | Monthly permit-level alcohol sales at matched bar/restaurant addresses; address matching can miss records. |
| Mapillary; Google Street View | On-demand street photos on property cards; dates and coverage vary; Mapillary requires a server token. |
| OpenAI web search | Assistant web searches only when requested; model-provider call, with links to source sites. |
| OpenAI; Anthropic (conditional by feature/settings) | Text/voice assistant, filing/project briefs, plan interpretation/review, and reference-file reading. Server-side credentials, feature-specific model selection and usage limits apply. AI output is not a verified public record. |

Project reference files are an additional input channel: PDFs, images, DXF and text/CSV can be uploaded to private platform storage. AI extracts candidate facts with confidence and document/page locations; only user-confirmed facts are passed to planning calls. See [lib/sitefiles.mjs](../lib/sitefiles.mjs), [api/sitefiles.js](../api/sitefiles.js), and [src/sitefiles.js](../src/sitefiles.js).

### Source reliability boundaries

Public sources vary in completeness, publication lag, jurisdiction, geocoding quality and coverage. “No record returned” can mean no feature, unsupported geography, an upstream failure, a cache miss, or a request that did not run. Live services, nightly datasets, tile aggregations, modeled estimates and AI extractions have different provenance and confidence. Parcel lines and terrain are planning inputs, not survey control; agency screening layers are not title, engineering, or environmental due diligence.

## 4. Site Layout Engine

### 4.1 Entry points and responsibilities

The Projects/site-plan UI is [src/siteplan.js](../src/siteplan.js). It imports the shared geometry/layout modules and calls `layoutOptions()` for a plan or `refit()` after edits. Calls normally run in [src/sp-worker.js](../src/sp-worker.js) so long searches do not freeze map interaction; a main-thread fallback is used if a worker cannot be created. The worker dispatches options, refit, pods and street-network edit messages into `lib/sitelayout.mjs`.

Natural-language interpretation is separate from geometry. [api/siteplan.js](../api/siteplan.js) and the plan-ask/stage modules can turn a request into structured program fields, site strategy, review notes or edits. The normalized program enters `layoutOptions()`; the engine computes shapes, areas, stalls, constraints, ranking and output geometry. The AI may review/describe options, but it does not calculate the coordinates of the plan.

Shared geometry/checks are in [lib/siteplan.mjs](../lib/siteplan.mjs); main orchestration is [lib/sitelayout.mjs](../lib/sitelayout.mjs). Major specialized engines include [lib/siteparking.mjs](../lib/siteparking.mjs), [lib/sitepad.mjs](../lib/sitepad.mjs), [lib/sitepods.mjs](../lib/sitepods.mjs), [lib/streetnet.mjs](../lib/streetnet.mjs), [lib/sitetract.mjs](../lib/sitetract.mjs), [lib/sitefuel.mjs](../lib/sitefuel.mjs), [lib/sitecommunity.mjs](../lib/sitecommunity.mjs), [lib/sitefoodtruck.mjs](../lib/sitefoodtruck.mjs), [lib/sitecorner.mjs](../lib/sitecorner.mjs), and [lib/sitecompose.mjs](../lib/sitecompose.mjs).

### 4.2 Inputs and provenance

An engine plan contains an origin, a polygon ring in feet, the street-facing edge (front), per-edge building/paving setbacks, plan settings, optional elevation grid, and optional pinned/keep-out pieces. The program includes use(s), floor area or unit count, floors, building count, parking/stormwater assumptions, mixes and optional placement/brief fields.

The boundary may come from appraisal/StratMap/Regrid parcel data, a selected parcel geometry, multiple parcels, or a user-drawn outline. Intake can bridge appraisal-data gaps between selected parcels and preserve a mapped road through a gap as a no-build strip. The layout engine itself does not infer a site from building-vector-tile feature IDs. See `siteOf()` in `src/siteplan.js` and `bridgeParcels()` / `unionParcels()` in `lib/siteplan.mjs`.

The engine's typical use ratios, stall sizes, generic setbacks, building depths, circulation widths, dwelling-unit efficiency and default stormwater values are internal planning assumptions, not external facts. Optional jurisdiction rules can override subdivision street/lot rules; Waller guardrails are conditional. Optional USGS terrain can affect pond ranking, but does not enable grading/hydraulic design.

### 4.3 Coordinate model and geometry

`lib/siteplan.mjs` converts local longitude/latitude offsets to feet around the plan origin. The generator rotates the boundary into a local frame so rows and aisles can be laid along x/y axes relative to the frontage. Building and paving envelopes are calculated separately, then candidate bands/rectangles are tested against the actual polygon. Polygon operations use shared geometry helpers and vendored `polyclip`.

- **Frame selection:** across/deep directions and, when frontage materially differs from the parcel's main angle, an alignment square to frontage are considered.
- **Buildable/paveable spans:** `spans()` calculates intervals where a row/aisle fits inside the parcel, clear of setbacks, easements, pinned objects and reserved detention. Obstacle clearance can be buffered.
- **Curved home streets:** eligible single-family layouts can be built in straight coordinates and warped by a smooth sinusoidal wave; property lines and setbacks are densified and tested against the real boundary.
- **Output forms:** simple elements are rectangles with center, width, depth and rotation; irregular/circulation pieces can be polygons or paths. Candidate coordinates are transformed back, assigned IDs/names, then re-checked.

### 4.4 Dispatch to specialized engines

`layoutOptions()` orchestrates specialized pathways before the standard row-stack engine. Depending on inputs it can lay out multiple parcels separately, handle a flag-lot stem, choose manufactured/tiny-home community lanes, position a gas station as an outparcel, put mixed uses on dedicated tracts, use an AI-crafted custom type, split around parcel gaps, compare multifamily products, or use a structured commercial brief. `layoutCore()` further routes food trucks, mixed-use zones, fuel, subdivision networks, retail plazas, and commercial parking fields before its general stack search.

Examples:

- Commercial/retail/office/medical/hotel/church: `siteparking.mjs` lays out whole parking modules and building rows; small constrained sites use `sitepad.mjs`.
- Single-family lots: row/block engine and optionally `streetnet.mjs` for subdivision networks, loops, angled/courtyard options and cul-de-sacs.
- Mixed use: `sitepods.mjs` can generate discrete zones/pods on eligible larger sites; the established bands engine remains available. `sitetract.mjs` gives some compatible uses their own tract/entrance.
- Townhomes/duplexes: row/block options; if a requested unit count does not fit on lots, a rental-court product may be offered with an explanatory note.
- Storage, industrial, fuel and food trucks: use-specific modules encode yards, dock courts, pumps/drive-throughs, truck stalls and service areas.
- Fallback: if the preferred engine yields too few options, the composer can offer simple arrangements with fallback identification/notes.

### 4.5 Standard row-stack candidate generation

For standard uses, `sequences()` enumerates ordered blocks between aisles. Blocks can represent buildings, parking, homes, pads, service space or gaps. In the typical commercial pattern, drives/circulation come first, parking modules and building rows attach to them, and detention/landscape consume remaining land.

`layoutCore()` then:

1. Normalizes program and plan settings; derives footprint/floor-area targets, parking demand, developed acres and detention requirement.
2. Builds one or more rotated working frames. For eligible home layouts, enables the curved-wave transform.
3. Creates candidate block sequences for each frame and detention arrangement (`back`, `front`, `end`/side, or `none` where appropriate).
4. Estimates candidates and discards impossible stacks before detailed geometry; only the better-ranked sequences in a pass are laid out.
5. Tries frame direction/alignment, row-stack shift, entry position and sometimes a compact window/first-phase area. The wider search expands sequence depth and entry locations under a clock budget.
6. Calls `attempt()` to place aisles/blocks, connect drives, fit entries, add parking/buildings, retry with parking bays or reduced footprint if short, trim surplus stalls/drives, and finish detention/landscape/amenities/trails/future land.
7. Transforms elements back to the plan frame, assigns names, repairs geometry and calculates candidate scores.

`layoutStack()` is the main detailed band constructor. It finds aisle runs that fit the actual polygon, joins adjacent aisles at their ends and can add a spine/cross-bays. A dead-end aisle gets a cul-de-sac bulb where it fits or a hammerhead where it does not. The entry is joined to the network. Building rows and pads occupy remaining buildable spans; parking rows are generated from configured stall width/depth and aisle modules. The network is trimmed only while buildings and parking remain reachable from the entry.

### 4.6 Parking, stormwater and hard checks

Parking demand is calculated from use-specific parameters and plan quantities: spaces per 1,000 gross square feet, spaces per dwelling, multifamily efficiency/unit size, garages and guest spaces. Counts apply accessible-space/access-aisle loss calculations. Standard commercial rows are generally trimmed to required demand plus a small operating buffer, keeping spaces nearest buildings first. Home layouts use distinct rules and are not passed through the same commercial trimming routine.

`stormNeed()` computes requirement from site/developed acreage and mode/settings (detention, retention, underground or none). Where applicable, a pond reservation constrains candidate placement before building/circulation placement; finishing allocates the basin and remaining landscape. Pinned ponds contribute their area during refits. With fine terrain, `heightShare()` nudges pond placement toward lower ground; it does not perform hydraulic, outfall or grading analysis.

Candidates are checked for parcel/setback fit, overlaps/clearance, entry access, parking count, detention adequacy and program quantity. `layoutOptions()` also handles additional entrances, dead ends, stranded homes, explanatory notes and final plan checks. A shortfall can be stated in the option notes. These checks are planning-quality, not a compliance certificate.

### 4.7 Ranking and option selection

The general `score()` rewards meeting a requested unit/floor-area target or maximizing quantity when no fixed target exists. It penalizes under-delivery, excessive unused parking, parking shortfall and undersized detention. Other terms favor commercial street-facing frontage, reasonable parking-to-door walks and (when terrain is usable) lower-ground pond positions. Failed geometry checks and required repairs reduce score; hard-failure candidates or candidates missing required program uses are filtered.

The engine prefers adequate parking, then higher score. It deduplicates plans using yield, parking, approximate building arrangement and pond position. The first three “good” options are sought near the best score; if search cannot find enough, fallback options may be returned. Residential network layouts use a separate comparison balancing home count, rules and access against non-network rows.

### 4.8 Sized asks, fill policy and phasing

The default “fill the site” policy can place more same-size buildings/units than the named request when the rest of the site supports them. The option reports requested and actual build-out. This is an intentional product default recorded in [docs/LAYOUT-REVIEW.md](LAYOUT-REVIEW.md) and [docs/DECISIONS.md](DECISIONS.md), not AI-generated arithmetic. Settings can instead hold leftover land or identify extra buildings as Phase 2. Some mixed-use sizing and placement limitations remain.

For an overlarge single-use floor-area ask, `feasibleSize()` probes smaller sizes and retains the largest that satisfies parking and checks. If a mixed-use program cannot fit as requested, the engine can shrink the mix with an explicit note or reduce to the main use with an explanation, depending on the path.

### 4.9 Refit around edits

When a user moves or resizes an element, the editor marks it `pinned` and calls `refit()` through the worker. The engine retains pinned elements as obstacles/anchors, subtracts pinned buildings' area and parking from remaining demand, lays out the rest around them, and preserves the recipe where possible. If it cannot refit without new hard failures or material loss, the UI leaves the edit in place and explains why. Parcel, fuel outparcel, tract and pod recipes have specialized refit paths.

### 4.10 AI role and reproducibility

AI parses the request into program fields, consumes confirmed project facts and site context, may prepare a commercial brief, and can review/describe options. Core candidate geometry, parking arithmetic, measurements, checks and ranking are JavaScript. Unconfirmed document extraction is not authoritative input.

The wider row-stack search is time-budgeted; candidate count and option ordering can vary with machine speed/load. Candidate generation is deterministic for fixed enumerated inputs, but browser runs are not guaranteed to explore the same search space each time. Headless/tests can pin network evaluation counts where supported. Read notes/checks; do not treat a concept option as an engineering deliverable.

## 5. Limits and Tests

The engine is expressly a planning sketch. It does not calculate grading surfaces, utility capacities/routing, drainage hydraulics, storm sewer, fire-flow, exact zoning entitlements, easement/title conflicts, turning templates or construction cost. Detention rules can be generic. Rule sheets are AI-assisted interpretations of cited codes and require professional/jurisdiction confirmation.

The current review notes are in [docs/LAYOUT-REVIEW.md](LAYOUT-REVIEW.md). They include an edited street-network block-length issue, second entrance planning that can occur after the first network is generated, mixed-use allocation/pond tradeoffs, and other program combinations under development. A displayed check does not make the plan compliant.

Representative tests/harnesses: [test/sitelayout.mjs](../test/sitelayout.mjs) tests realistic shapes, uses, mixed programs, access, parking, refit and output geometry. Related coverage is in [test/siteplan.mjs](../test/siteplan.mjs), [test/sitepods.mjs](../test/sitepods.mjs), [test/parkingfield.mjs](../test/parkingfield.mjs), [test/streetnet.mjs](../test/streetnet.mjs), [test/sitetract.mjs](../test/sitetract.mjs), and [test/layoutasks.mjs](../test/layoutasks.mjs). [build/layout-bench.mjs](../build/layout-bench.mjs) runs an offline parcel/program matrix; [scripts/layout-review.mjs](../scripts/layout-review.mjs) generates review sheets.

## 6. Implementation Reference Map

| Concern | Primary files |
|---|---|
| Map and Sources screen | [src/app.js](../src/app.js), [src/sources.js](../src/sources.js), [src/live.js](../src/live.js) |
| Nightly core filings/data build | [build.mjs](../build.mjs), [build/tabs.mjs](../build/tabs.mjs), [build/geocode.mjs](../build/geocode.mjs), [build/enrich.mjs](../build/enrich.mjs) |
| County/live-sync records | [build/county-data.mjs](../build/county-data.mjs), [build/live-sync.mjs](../build/live-sync.mjs), [lib/countydata.mjs](../lib/countydata.mjs), [api/devdata.js](../api/devdata.js) |
| Site-plan UI and worker | [src/siteplan.js](../src/siteplan.js), [src/sp-worker.js](../src/sp-worker.js) |
| Plan geometry, metrics and checks | [lib/siteplan.mjs](../lib/siteplan.mjs) |
| Layout orchestration, score and refit | [lib/sitelayout.mjs](../lib/sitelayout.mjs) |
| Specialized layout engines | [lib/siteparking.mjs](../lib/siteparking.mjs), [lib/sitepods.mjs](../lib/sitepods.mjs), [lib/streetnet.mjs](../lib/streetnet.mjs), [lib/sitetract.mjs](../lib/sitetract.mjs), [lib/sitecommunity.mjs](../lib/sitecommunity.mjs), [lib/sitefuel.mjs](../lib/sitefuel.mjs), [lib/sitefoodtruck.mjs](../lib/sitefoodtruck.mjs) |
| Terrain fetch, interpretation and ranking | [api/terrain.js](../api/terrain.js), [lib/terrain.mjs](../lib/terrain.mjs) |
| AI request/program/stage orchestration | [api/siteplan.js](../api/siteplan.js), [lib/planask.mjs](../lib/planask.mjs), [lib/planbrief.mjs](../lib/planbrief.mjs), [lib/planstages.mjs](../lib/planstages.mjs) |
| Layout review | [docs/LAYOUT-REVIEW.md](LAYOUT-REVIEW.md), [build/layout-bench.mjs](../build/layout-bench.mjs), [test/sitelayout.mjs](../test/sitelayout.mjs) |