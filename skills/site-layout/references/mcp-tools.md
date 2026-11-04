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
