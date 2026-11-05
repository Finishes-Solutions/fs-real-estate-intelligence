# The app's MCP tools (when the agent has the Real Estate Intelligence connector)

They run the same engine on the app's server. No AI and no network inside the layout tools.

## `layout_run`

Give either `brief` (a full `rei.brief/1`) or `request` with the site:

| argument | type | what |
|---|---|---|
| `brief` | object | a full design brief (see brief.md) |
| `request` | string | what to build, e.g. "exactly 240 garden apartments, 3 stories" |
| `geojson` | object | the site outline, GeoJSON Polygon in lon/lat |
| `ring_ft` | [[x, y]] | the site outline in feet (x east, y north) |
| `front_edge` | number | index of the edge on the main street (default the longest) |
| `street_edges` | [number] | other edges on a street |
| `access_edges` | [number] | the only edges a drive may enter from |
| `quantity` | object | `{ mode: exact / min / max / range / maximize, value?, min?, max?, unit: units / sf / buildings }` |
| `setbacks` | object | `{ front, side, rear, paving }` in ft |
| `setbacks_source` | string | where they come from (marks them verified) |
| `parking_per_unit`, `parking_per_1000` | number | parking ratios |
| `parking_source` | string | where the ratio comes from (marks it verified) |
| `seed` | string | search seed (default `rei-1`) |
| `options` | number | ranked options, 1-6 (default 3) |
| `include_record` | boolean | attach the run record (default true) |

Returns a text report (outcome, each option, the checks on #1) and the run record as a JSON resource.

## `layout_edit`

`record` (the run record, required), `words` or `edits` (typed, see edits.md), `selection` (piece ids for "these"),
`option` (default 1), `include_record`. Refused edits list their conflicts; the run is unchanged.

## `layout_replay`

`record` (required). Says whether outcome, geometry, quantities, checks and ranking are identical, and what differs.

## `layout_capabilities`

No arguments. The forms list with status (see forms.md).

## `site_plan`

The app's full site plan: a parcel by address or `geojson`, a request in words, optional AI review; returns the
layouts, the quality check and a PDF sheet, and saves a `plan_id` that `plan_set` (the full plan set) and
`site_renderings` use. Use it when the user wants the app's own sheet and plan set rather than this skill's files.

## Working on a saved plan (`plan_id` from `site_plan`)

Every edit or pick saves a new `plan_id`; the earlier plan is kept. `plan_set` and `site_renderings` take any of them.

| tool | arguments | what |
|---|---|---|
| `plan_get` | `plan_id`, `include_record` | the site, request, numbers (keys, beds), building types, the asks ("Asked: … done / not met") and assumptions, every piece by id and name, the run's other layouts, history |
| `plan_edit` | `plan_id`, `words` or `edits` or `settings`, `refit`, `use_ai` | the app's Change With AI: "move the clubhouse to the entry", "lock the pool", "add a hotel with 120 keys at the front", "set parking angle 60"; typed `{ action: move / remove / change / add / swap / turn / lock / unlock, target, to, beside, with, x, y, every, floors, units, gfa, type, btype, keys, kind, use, name, turnBy }`; `settings { setbacks, parking_per_unit, parking_per_1000, parking_angle (45 / 60 / 90), entrances, entrance_style, guardrails, scenario }` lay the site out again with them, locked pieces kept |
| `plan_pick` | `plan_id`, `layout` (2, 3… or a name) | another layout of the same run becomes the plan |
| `plan_compare` | `plan_ids` (up to 6), `include_alternatives` | numbers, checks and a quick value side by side, with what changed against the first |
| `plan_check` | `plan_id`, `all` | the independent check (pass / fail / unknown, measured vs required), the quality check, the jurisdiction's checks, the asks measured on the drawing, queues |
| `plan_numbers` | `plan_id`, `land_price` | floor area, units and unit mix, hotel keys, beds, children, students, parking drawn and required with its quality measured (paving a stall, islands, dead ends, walks, entrance throat, accessible stalls), queues, coverage, open space, detention; the pro forma |
| `plan_export` | `plan_id`, `formats` (pdf, svg, image, dxf, geojson, json, bim), `sheet` | files as resources |
| `plan_from_project` / `save_plan_to_project` | `project_id`, `option_id` / `plan_id` | a project's option as a plan; a plan back into a project as a new option (write) |
| `site_report` | a location, `kind` (parcel_map, topography, site_environmental, area_report, parcel_outline) | the parcel card's one-click reports |
| `building_types` | `id`, `query`, `family` | the building types a request can name (hotels by keys, daycare, car wash…), their shape, defaults and usual size; `btype` for `plan_edit` add |
| `report_filings` / `report_traffic` | a location, `kind` (summary, filing_list, activity, area_comparison with `areas`), filters, `include_csv` | the website's Export › New report files and the Traffic report |
| `upload_project_file` | `project_id`, `name`, `content_base64` or `text` | a reference file added to a project's Files tab, read by the AI into facts (write) |

A whole session: `find_property` → `site_facts` → `site_plan` (request in words) → `plan_check` → `plan_edit` →
`plan_compare` → `plan_export` (pdf) → `plan_set`. Use this skill's offline engine (way B) only without the connector.
