# Finding the controlling requirements

A layout is only as good as the rules it was drawn to. Work out who governs the site, find their current rules, and
write each rule into `code.rules` with its source and classification, plus a `measure` so the build checks it.

## 1. Who governs the site

Use the app's Jurisdiction & site lookup, the survey or plat, and the county appraisal district.

| Question | Why it matters | Where to look |
|---|---|---|
| Inside city limits, in a city's ETJ, or unincorporated? | In Texas, cities zone (Houston doesn't), ETJs get the city's subdivision rules but not its zoning, and counties have no general zoning power | City GIS, the app lookup, the county appraisal district |
| Zoning district / planned development / deed restrictions | Permitted uses and dimensional standards; deed restrictions bind even without zoning (Houston relies on them) | The city's zoning map and code (Municode, American Legal, eCode360, the city's site); title commitment |
| Who owns each frontage road | Driveway permits, spacing, deceleration lanes, ROW dedication | TxDOT (FM / SH / US / IH roads: the TxDOT Access Management Manual), county, or city |
| Drainage authority and outfall | The detention rate and the release | County flood control / engineering criteria (e.g. Harris County Flood Control District criteria, Fort Bend, Montgomery and Waller county drainage manuals), city criteria, the MUD / drainage district |
| FEMA zone, BFE, floodway | Where you can't build, finished floor elevations, fill limits | The FIRM, the app's FEMA report, any LOMR |
| Fire code and fire marshal | Fire lanes, hydrants, hose reach, turnarounds | The adopted IFC edition with local amendments (city, or county fire marshal) |
| Water / sewer provider | Capacity, which can cap density | MUD / WCID / city; the provider's letter |

If you can't establish the jurisdiction or the roadway authority, that's a **stop condition**: say so, keep the layout
conservative, and put it at the top of `risks`.

## 2. The requirements to find (per use being tested)

- **Use permission:** permitted by right, conditional / specific use permit, or prohibited (zoning, PD, deed restrictions).
- **Building placement:** front, side, rear and street-side setbacks or building lines (plat building lines are often
  25 ft on major roads and 10 ft on local streets, so check the plat), build-to lines, and residential adjacency
  setbacks or buffers.
- **Bulk:** max height (ft / stories), coverage, FAR, impervious cover, density (units per acre), minimum lot size and width.
- **Parking:** ratio per use, accessible stalls (2010 ADA Standards 208.2 apply everywhere, and the script computes them),
  loading, stacking for drive-thrus, stall and aisle dimensions.
- **Landscape:** perimeter buffers, landscape area %, parking-lot trees and islands, screening for dumpsters, loading and
  residential adjacency.
- **Fire access (IFC Chapter 5 and Appendix D, as adopted):** fire lanes at least 20 ft clear, 26 ft where the building is
  over 30 ft tall (aerial access, D105); every part of the ground-floor exterior walls within 150 ft of a fire lane,
  measured along the route (503.1.1; often longer when the building is sprinklered); dead ends over 150 ft need a
  turnaround; a second access for large residential projects (D106 / D107 thresholds); hydrant spacing.
- **Detention:** the rate (ac-ft per acre), and any limits on pond side slopes, freeboard or depth. Under the Finishes
  guardrails, use the greater of 1.00 ac-ft per developed acre and the authority's rate in and near Waller, and use it as
  a conservative default elsewhere unless the authority's verified rate applies.
- **Access:** driveway spacing from intersections and other driveways, the number of driveways, cross-access, and ROW
  dedication for future widening.

## 3. Classify every rule

| Class | Use when |
|---|---|
| `VERIFIED REQUIREMENT` | You have the current ordinance / criteria text or written agency direction, and cite it (section, date). |
| `OWNER GUARDRAIL` | The Finishes margin on top of a verified minimum (minimum dimensions and counts × 1.05; maximums held 3–5% under). |
| `ENGINEERING ASSUMPTION` | A professional design assumption (pond depth, a code-book value not yet confirmed as adopted locally). |
| `UNVERIFIED` | Anything you couldn't confirm. Use a conservative typical value, mark it UNVERIFIED, and list it in `risks`. |

Never upgrade a class because a number is "usually" right. A typical value from memory is UNVERIFIED.

## 4. Write `code`

```json
"code": {
  "jurisdiction": "City of Example ETJ (subdivision rules only); Example County",
  "zoning": "None (ETJ)",
  "code_set": "2021 IFC with county amendments",
  "sources": ["Example County Subdivision Regs §4.2 (2024)", "Plat Vol 12 Pg 34 note 3"],
  "rules": [
    {"item": "Front building line", "req": "25 ft (plat) → 26.25 target", "measure": "setback_front", "kind": "min", "limit": 26.25,
     "cls": "OWNER GUARDRAIL", "source": "Plat note 3 + 5%"},
    {"item": "Max height", "req": "45 ft", "measure": "height", "kind": "max", "limit": 43, "cls": "VERIFIED REQUIREMENT", "source": "UDC 3.4"},
    {"item": "Landscape buffer at residential", "req": "20 ft + 6 ft masonry wall", "provided": "20 ft buffer shown", "cls": "UNVERIFIED"}
  ]
}
```

What the build can measure (`measure` keys): `setback_front`, `setback_side`, `setback_rear`, `setback_street_side`,
`coverage`, `far`, `impervious`, `pervious`, `height`, `density` (units per acre), `lot_area` (smallest lot sf),
`parking`, `ada`, `detention`, `fire_reach`, `fire_lane_width`. Coverage, impervious and pervious are fractions
(0.35 = 35%). For a rule it can't measure, give `provided` as text. With `kind` + `limit`, the build compares them and
fails the sheet when a rule is broken. Under the guardrails, set `limit` at the guardrail target and put the published
value in `req`.

Parking ratios belong on the building types (`types[].parking`), not in `code.rules`. The parking table on the sheet
and the check come from them: `{"spaces": 4, "per_sf": 1000, "basis": "UDC 6.2: 1 per 250 sf retail", "cls": "VERIFIED REQUIREMENT"}`
or `{"spaces": 2, "per_unit": 1, ...}`.

## 5. Typical values when nothing local can be found (all UNVERIFIED)

Use these only as a starting point and say so: retail 4 per 1,000 sf; restaurant 10 per 1,000 sf; office 3–4 per
1,000 sf; medical office 5 per 1,000 sf; industrial 0.5–1 per 1,000 sf plus a dock / trailer count; self storage
about 1 per 100 units plus office stalls; multifamily 1.5–2 per unit (Waller publishes 2.0); front setback 25 ft,
side 10 ft, rear 20 ft; detention 1.00 ac-ft per acre (owner guardrail).
