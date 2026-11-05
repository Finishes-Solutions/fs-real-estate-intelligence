# MCP coverage: what a person can do in the app, and the tool an agent uses

The MCP server (`api/mcp.js`, tools in `lib/mcp/server.mjs`) runs everything in-process on the platform's own code and
storage: no call to the app over HTTP and nothing belonging to the source repos. This table lists every user-facing
capability (from PRODUCTDOC.md and the UI / `api/` code) and the MCP tool that covers it.

Legend: **✓** covered, **◐** partly (what is missing is said), **✗** not covered, **n/a** not something an agent needs.
"Before" is `origin/main` at 7d2676c; "round 1" is matthew/mcp-full-system-b (30331ee); "round 2" is matthew/mcp-round2
(round 1 merged onto the layout engine's building types, placements and parking round 2, matthew/townhome-packing-b).
The tables below show before → after; a row changed in round 2 says so ("R2").

## Summary

| | before | round 1 | round 2 |
|---|---|---|---|
| Capabilities in the tables below | 79 | 79 | 85 (6 new engine abilities) |
| ✓ covered | 41 | 66 | 76 |
| ◐ partly | 15 | 9 | 6 |
| ✗ not covered | 20 | 1 | 0 |
| ✗ left out on purpose (licensing: live flights, routing, Regrid) | 3 | 3 | 3 |
| Tools (all, with project changes on) | 47 | 57 | 61 |
| Tool list size, read-only connection (test cap 95,000 characters) | — | 86,291 | 92,395 |

New tools: `plan_get`, `plan_edit`, `plan_pick`, `plan_compare`, `plan_check`, `plan_numbers`, `plan_export`,
`plan_from_project`, `save_plan_to_project` (write), `site_report`. Changed: `site_plan` keeps the run's other layouts and
the layout recipe with the saved plan, and points to the plan tools; `plan_set` and `site_renderings` take any plan id
(an edited or picked one too); the server instructions describe the end-to-end workflow.

Round 2 tools: `building_types`, `report_filings`, `report_traffic`, `upload_project_file` (write). Changed: `site_plan`
lays out inside the jurisdiction's guardrails the way the app's Build does (lib/guardrails.mjs forLayout / unapply round
the engine: the scenario's setbacks, the city's parking count with its reserve, detention by volume, fire-lane aisles;
before, it handed the engine the raw program and only checked against the guardrails afterwards), says angled parking
that wasn't drawn, and keeps the layout's notes; `plan_get` / `plan_check` give the request's "Asked: … done / not met"
lines (measured on the drawing, so an edit that meets or breaks an ask shows) and its assumptions; `plan_check` adds the
jurisdiction and queue sections and checks a one-use plan's parking at the city's count; `plan_numbers` adds hotel keys,
beds, children and students, the building types, parking quality measured on the drawing (scripts/parking-metrics.mjs:
paving a stall, islands, dead ends, walks, entrance throat, accessible stalls) and queues; `plan_edit` adds buildings by
type (`btype`, sized to the keys / units / floors asked, in words or typed) and `settings` (setbacks, parking ratio and
angle, entrances, entrance style, guardrails and scenario) that lay the site out again with locked pieces kept; the
tool descriptions were trimmed so the list stays under the cap.

## Property and site information

| Capability (app) | Where in the app | Before | After |
|---|---|---|---|
| Find a property by address, APN, point | Search, property card | ✓ `find_property`, `search` | ✓ |
| Several parcels as one site | Card › add parcels | ✓ `site_plan` / `create_project` `apns` | ✓ |
| Parcel record (owner, values, acres, legal) | Property card | ✓ `find_property` | ✓ |
| City limits / ETJ, jurisdiction | Card, Site facts | ✓ `find_property`, `site_facts` | ✓ |
| Flood zone, BFE, floodway, claims | Card, FEMA layer | ✓ `flood`, `site_facts` | ✓ |
| Ground: elevations, slopes, drainage | Topography | ✓ `terrain` | ✓ |
| Environmental records, wetlands, soils | Environmental | ✓ `environmental` | ✓ |
| Utilities (power, water/sewer CCNs, mains) | Utilities layer | ✓ `utilities` | ✓ |
| Traffic counts | Traffic layer | ✓ `traffic_counts` | ✓ |
| Districts, TIRZ, OZ, schools | Card | ✓ `site_facts` | ✓ |
| Demographics (rings, tract) | Market & demographics | ✓ `demographics` | ✓ |
| County market figures | Market page | ✓ `market_context` | ✓ |
| Businesses and places | Places layer | ✓ `businesses`, `businesses_at_address` | ✓ |
| Who owns a company | Entity lookup | ✓ `company_lookup` | ✓ |
| Development activity (permits, plats) | Layers | ✓ `development_activity` | ✓ |
| Construction filings, top companies | Filings, filters | ✓ `construction_filings`, `top_companies` | ✓ |
| Crime (Houston, any US agency) | Crime layer, reports | ✓ `crime_near`, `crime_by_agency` | ✓ |
| News | News | ✓ `news` | ✓ |
| Airports nearby | Planes and airports | ✓ `airports_near` | ✓ |
| Live flights, air traffic report | Planes | ✗ (licensing, on purpose) | ✗ on purpose |
| Drive-time areas and report | Drive-Time report | ✗ (public routing excluded on purpose) | ✗ on purpose |
| Zoning | Card (where the city publishes it) | ◐ jurisdiction only; zoning text not published for most places | ◐ |
| Regrid parcel details outside Texas | Card › Get Regrid Details | ✗ (licensing, on purpose) | ✗ on purpose |
| One overview of an area | Area summary | ✓ `area_overview` | ✓ |
| Dataset coverage and freshness | About / sources | ✓ `list_datasets` | ✓ |

## Reports

| Capability | Where | Before | After |
|---|---|---|---|
| FEMA flood & hazard report PDF | Reports › For an area | ✓ `report_flood` | ✓ |
| Environmental report PDF | Reports | ✓ `report_environmental` | ✓ |
| Crime report PDF (Houston) | Reports | ✓ `report_crime` | ✓ |
| City / County Crime Report PDF | Reports | ✓ `report_crime_agency` | ✓ |
| Market report PDF | Reports › Region & county | ✓ `report_market` | ✓ |
| Demographics report PDF | (agents) | ✓ `report_demographics` | ✓ |
| Parcel Map PDF | Card › Reports | ✗ | ✓ `site_report` parcel_map |
| Topography PDF | Card › Reports | ✗ | ✓ `site_report` topography |
| Site Environmental PDF | Card › Reports | ✗ | ✓ `site_report` site_environmental |
| Area Report PDF (1/3/5/10 mi rings) | Card › Reports | ✗ | ✓ `site_report` area_report |
| Parcel Outline GeoJSON | Card › Reports | ◐ outline inside `find_property` text | ✓ `site_report` parcel_outline |
| Traffic report PDF (and CSV) | Reports | ◐ data via `traffic_counts`, no PDF | ✓ R2 `report_traffic` (live speeds and incidents where `TOMTOM_API_KEY` is set) |
| Summary / Filing list / Area comparison / Activity report (PDF, Excel, CSV) | Export › New report | ◐ the data via `construction_filings` / `top_companies`, not the files | ✓ R2 `report_filings` (PDF and CSV; the website's Excel comes as CSV; area comparison has the filing figures, census figures via `demographics`) |

## Site plans: building and iterating

| Capability | Where | Before | After |
|---|---|---|---|
| Build a plan from words (Build with AI, Low–High effort) | Site plan › Build | ✓ `site_plan` | ✓ |
| What should go here? (best-use ideas) | Site plan | ✓ `site_plan` without request | ✓ |
| Exact, replayable layout from a typed brief | (engine) | ✓ `layout_run`, `layout_replay`, `layout_capabilities` | ✓ |
| Building types: name one in the request, see the list, add one by type (51 + 5 word-only presets) | Build words, Add › Add a building by type | ✗ (new in the engine) | ✓ R2 `building_types`; `site_plan` words; `plan_edit` `btype` (+ `keys`, `units`, `floors`) |
| Where things go ("parking behind the buildings", "pool in the center"): each ask done / not met, and what was assumed | Build notes | ✗ (new in the engine) | ✓ R2 `site_plan` notes, `plan_get`, `plan_check`, `plan_edit` (measured on the drawing) |
| Angled parking (45° / 60° on one-way aisles) | Build words, Settings | ✗ (new in the engine) | ◐ R2 `site_plan` words, `plan_edit` settings `parking_angle`; a mix of uses on zones doesn't draw angled rows yet (said in "Not done") |
| Parking quality (paving a stall, islands, dead ends, walks, entrance throat, accessible stalls) | (parking metrics) | ✗ | ✓ R2 `plan_numbers` |
| Queues: drive-thru lanes, car-wash stacking, and their checks | Numbers › Independent check | ✗ (new in the engine) | ✓ R2 `plan_check`, `plan_numbers` |
| Hotel keys, beds, children, students | Numbers | ✗ (new in the engine) | ✓ R2 `plan_numbers`, `plan_get`, `plan_compare` deltas |
| Open a saved plan: pieces, names, numbers | Plan panel | ✗ (plan_id only fed plan_set / renderings) | ✓ `plan_get` |
| Change With AI (words) | Plan panel › Change | ◐ `layout_edit` on layout_run records only, not on a `site_plan` plan | ✓ `plan_edit` words (the app's AI edit, else read directly) |
| Move / turn / resize / remove / swap / add a piece | Editing a plan, tool bar | ◐ `layout_edit` (run records) | ✓ `plan_edit` typed edits |
| Change every building of a use ("all apartments 3 stories") | Change With AI | ✗ | ✓ `plan_edit` `every` |
| Entrances, boulevards, roundabouts, drop-off loops | Add Entrance / Roundabout | ✗ | ✓ `plan_edit` add kind entrance / roundabout / loop |
| Names (community, parts) | Suggest Names / Change | ✗ | ◐ `plan_edit` "call it …" (no name suggestions list) |
| Lock pieces (layers locked, pinned pieces) | Layers › lock | ◐ `layout_edit` lock (run records) | ✓ `plan_edit` lock / unlock (edits and re-fits never change a locked piece) |
| Re-fit the rest round a change | Re-fit Plan | ✗ | ✓ `plan_edit` `refit` (kept only when nothing is lost, as the app does) |
| Undo | Cmd+Z | ✗ | ✓ every edit is a new plan id; the parent is kept (history in `plan_get`) |
| Compare layouts / options | Layouts and Options cards | ◐ the table inside one `site_plan` answer | ✓ `plan_compare` (versions and the run's layouts) |
| Pick another layout of the run | Layout cards | ✗ (only the pick was saved) | ✓ `plan_pick` |
| Independent check | Numbers › Independent check | ◐ on `layout_run` records only | ✓ `plan_check` |
| Quality check, jurisdiction checks | Numbers, Waller guardrails | ◐ in the `site_plan` answer | ✓ `plan_check` |
| Numbers: unit mix, parking, coverage, open space, detention | Numbers | ◐ in the `site_plan` answer | ✓ `plan_numbers` |
| Pro forma (default market assumptions) | Pro forma | ✗ (projects only) | ✓ `plan_numbers` |
| Free-form drawing (Edit Shape, draw parking outlines, bend a drive, easements) | Drawing by hand | ✗ | ◐ bend / cul-de-sac on subdivision streets via `plan_edit` words; no free polygon drawing |
| Settings on an existing plan (setbacks, ratios, home mix, entrance and street rules) | Site parameters | ◐ at build time (`site_plan` words, `layout_run` arguments) | ✓ R2 `plan_edit` `settings` or words ("front setback 40 ft", "5 per 1,000", "2 entrances"): the site laid out again, locked pieces kept; home mix via words |
| Pods re-laid, subdivision blocks re-laid | Change With AI | ✗ | ◐ said as not done; lay out again |
| Waller guardrails and scenarios A / B / C | Waller guardrails | ◐ checked in `site_plan`, not laid out under | ✓ R2 laid out under them as the app does; the city's parking count governs; `plan_edit` settings `guardrails`, `scenario` |
| Home communities (tiny / manufactured / RV) | Site plan | ✓ `site_plan` home arguments | ✓ |

## Exports, plan sets, renderings

| Capability | Where | Before | After |
|---|---|---|---|
| Site Plan PDF sheet | Exports | ◐ only with `site_plan` | ✓ `plan_export` pdf, any version |
| CAD (DXF) | Exports | ✗ | ✓ `plan_export` dxf |
| Map file (GeoJSON) | Exports | ◐ `site_plan` include_geojson | ✓ `plan_export` geojson |
| A picture of the plan | (map) | ✗ | ✓ `plan_export` svg / image |
| BIM model | Plan sets / BIM worker | ✗ | ◐ `plan_export` bim script; IFC where `BIMCRAFT_CLI` is installed |
| Make Plan Set | Projects › Plans | ✓ `plan_set`, `plan_set_status` | ✓ (any plan id) |
| Renderings | Renderings | ✓ `site_renderings` | ✓ (any plan id) |

## Projects and feasibility

| Capability | Where | Before | After |
|---|---|---|---|
| List / open projects | Projects page | ✓ `list_projects`, `get_project`, `search`, `fetch` | ✓ |
| Create a project from a parcel | Card › New project | ✓ `create_project` (write) | ✓ |
| Change name, status, notes, land price, option | Projects | ✓ `update_project` (write) | ✓ |
| Lay out an option in a project | Site plan in a project | ✓ `site_plan` with `project_id` | ✓ |
| Work on a project's option as a plan | Sites tab | ✗ | ✓ `plan_from_project` |
| Save a plan as a new option (Save as new option, + New Option) | Layouts and Options | ✗ | ✓ `save_plan_to_project` (write) |
| Feasibility study, what-ifs | Feasibility workspace | ✓ `feasibility_study` | ✓ |
| Assumptions, budget lines, scenarios | Feasibility workspace | ✓ `set_assumptions`, `edit_budget`, `save_scenario` (write) | ✓ |
| Report set (PDF, Excel, CSV, JSON) | Reports step | ✓ `feasibility_report` | ✓ |
| Project files and links | Files tab | ✓ `project_files` (read) | ✓ |
| Upload reference files to a project | Files tab | ✗ | ✓ R2 `upload_project_file` (write; the platform's own site-files bucket; up to 3 MB a call, bigger on the Files tab; the AI reads facts, a person confirms them) |

## Not needed by an agent (n/a)

Map browsing, layers and filters on screen; Settings and sign-in; Ask AI chat (the agent is the AI); notes and watchlist
(personal, on the device); keyboard shortcuts.

## Remaining gaps

1. Free-form drawing on a plan (a drawn parking outline, Edit Shape, easements drawn by hand).
2. Re-laying one pod or one subdivision block from `plan_edit` (the app does it in the browser's layout worker).
3. IFC needs the BIM tool (`BIMCRAFT_CLI`) on the deployment; without it `plan_export` gives the BIM script.
4. Name suggestions (the app's Suggest Names list); `plan_edit` "call it …" names things.
5. Zoning text where the city doesn't publish it.
6. The website's Excel files come as CSV through the MCP; uploads over 3 MB go through the Files tab.

Round 1's gap "pool in the center read as a shopping center without the AI" is fixed by the request-understanding work
(lib/siteplan.mjs guessProgram reads it as apartments with the pool placed in the middle).

Found in round 2, for the layout engine and parking work (the MCP calls into them and says what happens; it does not
patch their output):

- **Mixed uses under Waller's detention:** with the guardrails' detention (1 acre-foot a developed acre at a 4 ft
  average depth), "a 120-key hotel and 20,000 sf of retail" on sites up to about 13 acres falls back to the engine's
  simple layout: its buildings carry no zone, so no building type, and it parks 202–204 of the 212 spaces the city's
  count needs. On 24.8 acres the zones lay out, the hotel is typed and the count is met (the e2e's scenario 2 uses that
  site). The same program without the guardrails lays out on zones at 13.4 acres. The app's Build does the same (it
  calls the engine the same way).
- **governingParking on a mix:** lib/layoutrun.mjs governingParking puts the program's top-level ratio (the shops' 4.2 a
  1,000 sf with the reserve) on every use counted by area, so a 66,000 sf hotel is judged at 362 spaces where the
  guardrails' metrics need 212. `plan_check` applies it to one-use plans only for now.
- **The 5% reserve twice:** runPlan's governingParking reads the plan through G.effective again; called with the
  effective plan (as the app's laid() and the MCP do), the brief's rule becomes 2.205 a home where the plan's numbers
  use 2.1. The layout parks a little more than the city needs; the counts the user sees are the 2.1 ones.
- **Angled parking on a mix:** a program of zones with `parkAngle` lays square stalls and says nothing; the MCP says
  it in "Not done" (and in the `site_plan` answer).

## How it is tested

`test/mcp-agent-e2e.mjs` drives the server with a real MCP client the way an agent does: address → `find_property` →
`site_facts` → `site_report` → `site_plan` "garden apartments, as many as fit, pool in the center" → `plan_check` →
`plan_get` → `plan_edit` "move the clubhouse to the entry" (AI and direct reading) → `plan_compare` → `plan_numbers` →
`plan_export` (PDF, SVG, image, DXF, GeoJSON, JSON, BIM) → `plan_pick` → locks → `plan_set` from the edited plan, plus
the plain-sentence errors. Scenario 2: `building_types` → `find_property` on a second, 24.8 acre parcel in Waller →
`site_plan` "a 120-key hotel and 20,000 sf of retail, parking behind the buildings" (the guardrails on: the city's
parking count governs and is met; the hotel is a typed building with 120 keys; the ask said as done or not met) →
`plan_get` / `plan_check` / `plan_numbers` (keys, parking measured) → `plan_edit` "set parking angle 60" (laid out
again; said when not drawn) and settings (front setback 60 ft) → buildings added by type (words "add a bank at the
front", typed daycare) → `plan_compare` → `plan_export` → `report_filings` (summary, activity with CSV, area
comparison, filing list) and `report_traffic`. Every outside service is stood in for; storage is in memory.
`test/mcp-projects.mjs` covers `plan_from_project`, `save_plan_to_project` and `upload_project_file`.
