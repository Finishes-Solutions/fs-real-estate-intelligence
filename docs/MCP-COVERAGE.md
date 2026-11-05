# MCP coverage: what a person can do in the app, and the tool an agent uses

The MCP server (`api/mcp.js`, tools in `lib/mcp/server.mjs`) runs everything in-process on the platform's own code and
storage: no call to the app over HTTP and nothing belonging to the source repos. This table lists every user-facing
capability (from PRODUCTDOC.md and the UI / `api/` code) and the MCP tool that covers it.

Legend: **✓** covered, **◐** partly (what is missing is said), **✗** not covered, **n/a** not something an agent needs.
"Before" is `origin/main` at 7d2676c; "after" is this branch (matthew/mcp-full-system).

## Summary

| | before | after |
|---|---|---|
| Capabilities in the tables below | 79 | 79 |
| ✓ covered | 41 | 66 |
| ◐ partly | 15 | 9 |
| ✗ not covered | 20 | 1 |
| ✗ left out on purpose (licensing: live flights, routing, Regrid) | 3 | 3 |
| Tools (all, with project changes on) | 47 | 57 |

New tools: `plan_get`, `plan_edit`, `plan_pick`, `plan_compare`, `plan_check`, `plan_numbers`, `plan_export`,
`plan_from_project`, `save_plan_to_project` (write), `site_report`. Changed: `site_plan` keeps the run's other layouts and
the layout recipe with the saved plan, and points to the plan tools; `plan_set` and `site_renderings` take any plan id
(an edited or picked one too); the server instructions describe the end-to-end workflow.

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
| Traffic report PDF | Reports | ◐ data via `traffic_counts`, no PDF | ◐ |
| Summary / Filing list / Area comparison / Activity report (PDF, Excel, CSV) | Export › New report | ◐ the data via `construction_filings` / `top_companies`, not the files | ◐ |

## Site plans: building and iterating

| Capability | Where | Before | After |
|---|---|---|---|
| Build a plan from words (Build with AI, Low–High effort) | Site plan › Build | ✓ `site_plan` | ✓ |
| What should go here? (best-use ideas) | Site plan | ✓ `site_plan` without request | ✓ |
| Exact, replayable layout from a typed brief | (engine) | ✓ `layout_run`, `layout_replay`, `layout_capabilities` | ✓ |
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
| Settings on an existing plan (setbacks, ratios, home mix, entrance and street rules) | Site parameters | ◐ at build time (`site_plan` words, `layout_run` arguments) | ◐ home mix via `plan_edit` words; others at build time |
| Pods re-laid, subdivision blocks re-laid | Change With AI | ✗ | ◐ said as not done; lay out again |
| Waller scenarios A / B / C | Waller guardrails | ◐ applied in `site_plan` | ◐ |
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
| Upload reference files to a project | Files tab | ✗ | ✗ (agents pass facts as `site_plan` `references`) |

## Not needed by an agent (n/a)

Map browsing, layers and filters on screen; Settings and sign-in; Ask AI chat (the agent is the AI); notes and watchlist
(personal, on the device); keyboard shortcuts.

## Remaining gaps

1. Export › New report files (Summary, Filing list, Area comparison, Activity report) and the Traffic report PDF: the
   data is there (`construction_filings`, `top_companies`, `traffic_counts`), the files aren't.
2. Free-form drawing on a plan (a drawn parking outline, Edit Shape, easements drawn by hand).
3. Settings changed on an existing plan and the plan re-laid with them (setbacks, parking ratios, entrance and street
   rules): today these are given when the plan is built (`site_plan` words, `layout_run` arguments).
4. Re-laying one pod or one subdivision block from `plan_edit` (the app does it in the browser's layout worker).
5. Uploading reference files to a project.
6. IFC needs the BIM tool (`BIMCRAFT_CLI`) on the deployment; without it `plan_export` gives the BIM script.
7. Request reading without the AI: "pool in the center" is read as a shopping center (retail + apartments) by the
   direct reading (`lib/siteplan.mjs` guessProgram); with the AI on (the default at Medium) it is read correctly. Left
   to the request-understanding work.

## How it is tested

`test/mcp-agent-e2e.mjs` drives the server with a real MCP client the way an agent does: address → `find_property` →
`site_facts` → `site_report` → `site_plan` "garden apartments, as many as fit, pool in the center" → `plan_check` →
`plan_get` → `plan_edit` "move the clubhouse to the entry" (AI and direct reading) → `plan_compare` → `plan_numbers` →
`plan_export` (PDF, SVG, image, DXF, GeoJSON, JSON, BIM) → `plan_pick` → locks → `plan_set` from the edited plan, plus
the plain-sentence errors. Every outside service is stood in for; storage is in memory. `test/mcp-projects.mjs` covers
`plan_from_project` and `save_plan_to_project`.
