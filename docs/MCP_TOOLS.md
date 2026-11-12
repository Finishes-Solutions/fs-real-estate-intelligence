# MCP tools: property tax and assessments

The MCP server (`api/mcp.js`, tools in `lib/mcp/server.mjs`) lists every tool with its schema; `docs/MCP-COVERAGE.md`
maps the app's features to tools. This page covers the three property-tax tools added with the appraisal-roll pipeline
(`build/cad-rolls.mjs`, sources in `docs/data-sources/cad-and-tax-rates.md`). They are read-only and need the platform's
database (the secret key); without it they say so.

Every answer ends with **Sources**: each file the numbers came from, with its tax year, roll (preliminary, certified,
supplement, current) and the date it was loaded, and its URL.

## tax_estimate

The yearly property tax for one parcel in the seven home counties.

| Input | |
|---|---|
| `apn` + `county` | The appraisal district account number. Harris: the 13-digit HCAD account (leading zeros optional). Fort Bend: the property ID (`R391499`, or the digits). Others: `prop_id`. |
| `address`, or `lat` + `lon` | The parcel under the point (StratMap or the district's layer) gives the account. |
| `value` | A value to tax (a price, a pro forma value). No exemptions are applied to it. |
| `tax_year` | Default: the newest year loaded for the account. |

Answer: the account, owner, situs, state class and the district's values; each taxing unit with its rate (total, M&O,
I&S), where the rate came from (the district's own table or the Comptroller's) and its year; the taxable value per unit
where the roll gives it; the tax at the district value and at `value`; the combined rate.

Rules:
- For each unit, the rate is the district's own table for the year, else the Comptroller's for that year, else the
  newest earlier year (said in the line, e.g. "2025 rate (no 2027 rate loaded yet)").
- Waller County levies its general fund (`GWA`) and a farm-to-market / flood fund (`RFM`) as two codes; the parcel layer
  lists `GWA` only. `RFM` is added when Waller CAD's table prices it for the year; with the Comptroller's county rate
  (which already includes it) it isn't, so it is never counted twice.
- A county whose roll comes from a parcel layer (Waller, Austin) lists county, city and school only; the answer says that
  ESDs, MUDs and other special districts may also tax the parcel.
- An account not in the roll gets the county's rate (and the city's, where the situs city names one) and says the school
  district and special districts aren't known.
- Not applied: homestead tax ceilings (over 65, disabled), abatements. Not a tax bill.

Example (Waller account 265550, Green Gardens, from the real files on 2026-11-12): tax year 2027 (current roll), market
$19,622,330; Waller County 0.532596%, City of Waller 0.4464%, Waller ISD 1.0626%, Waller County RFM 0.023591% (all 2025,
Waller CAD's table); combined 2.065187%; $405,238 a year at the district value.

## assessment_history

A parcel's district values by tax year: land, improvements, market and appraised, the change from the year before and
the roll each came from. Same location inputs as `tax_estimate`. History builds up as each year's roll is loaded; Waller
and Austin publish only their current year.

## assessment_comps

District values of similar properties, for a tax-comparable (equity) table.

| Input | |
|---|---|
| `county` | Required unless a subject property is given. |
| a subject (`apn` + `county`, `address`, `lat` + `lon`) and `radius_mi` | Around the property (default 1 mile, up to 10). Needs parcel coordinates, loaded for Waller and Austin (and Washington and Grimes when their parcel layer has a newer year than the roll); elsewhere it falls back to the subject's ZIP. |
| `zip`, `city` | Situs ZIP or city. |
| `land_use` | multifamily, commercial, industrial, residential, land, ag, or a state class (`B`, `B1`, `F1`…). The Waller and Austin layers carry no state class: the filter is then dropped and the answer says so. |
| `year_built_min` / `_max`, `units_min` / `_max`, `sqft_min` / `_max` | Building filters (unit counts: HCAD's commercial building records). |
| `tax_year` | Default: the newest loaded for the county. |

Answer: the subject's values; the count of matches; median and middle half of market value a unit, a building sf, an
acre, and overall; the closest (or largest) 15. Values, not sale prices (Texas doesn't disclose sale prices).

## What each county's data holds

| County | Roll | Years | Buildings | Units per account | Coordinates |
|---|---|---|---|---|---|
| Harris | HCAD bulk files | the current tax year at each load (history builds up) | yes, with unit counts on commercial buildings | yes, with taxable values | no |
| Fort Bend | Orion certified export + supplements | 2023 on (every certified export posted) | not yet (the monthly segment file is a next step) | yes, with taxable values | no |
| Washington | PACS certified export | the current year at each load | yes (area, class, year, stories) | yes, with taxable values and exemptions | no (yes for a newer layer year) |
| Grimes | printed certified roll | 2018 on (every year posted) | no | yes, with taxable values | no (yes for a newer layer year) |
| Waller, Austin | BIS parcel layer | the current year only | no | county, city, school only | yes |
| Montgomery | none (rates only) | — | — | — | — |
