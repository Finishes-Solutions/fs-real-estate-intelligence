# Sample run: Sample: Waller garden apartments

Made by `node scripts/sample-run.mjs` on 2026-10-24 — offline: every outbound request was refused (0 attempted). Inputs hash `332a5c7a`. 5.7 s.

Feasibility / schematic level only. The plan set is a schematic-design set for planning and pricing conversations. It is not a permit set and not construction documents, and it has not been prepared, sealed or reviewed by a licensed architect or engineer. Parcel lines come from appraisal-district or provider data, not a boundary survey. Costs are parametric estimates from a single-project workbook and house rates, not contractor bids. Market rents, cap rates and financing terms are assumptions, not appraisals. Use the outputs to decide whether to pursue a site, not to build from.

## Steps
1. **Intake** — 3 parcels (anonymized appraisal-district outlines near Waller, TX), 15.97 acres; asking price $2,600,000 (a sample input).
2. **Site** — the platform's layout engine: Rows running back · pond at the entry; 389 units, 425,611 gross sf, 657 of 623 parking spaces, buildable envelope 95% of the site at a 10 ft setback.
3. **Plans** — 35-sheet schematic set listed; cover and site plan sheets printed on the title block (`plan-set-excerpt.pdf`), and the 11×17 site plan sheet (`site-plan-sheet.pdf`).
4. **Budget** — 94 CSI lines: construction contract $58,846,996, project cost before financing $71,198,349.
5. **Pro forma** — total development cost $79,227,648; stabilized NOI $3,853,211; yield on cost 4.86%; levered IRR 3.51%; unlevered IRR 5.33%; levered NPV at 10% $-11,255,356.
6. **Reports** — the files below.

## Scenarios
| Scenario | Total cost | NOI | Yield on cost | Levered IRR |
|---|---|---|---|---|
| Base case | $79,227,648 | $3,853,211 | 4.86% | 3.51% |
| Rates +1% | $80,432,126 | $3,853,211 | 4.79% | 2.74% |
| More one-bedrooms | $79,236,638 | $3,551,169 | 4.48% | 1.13% |
| Costs +10% | $85,976,616 | $3,747,044 | 4.36% | 0.38% |

## Top risks
- **high** — Thin development spread: Yield on cost 4.86% against a 5.5% market cap rate: -0.64% of spread (1.0–1.5% is the usual minimum to build rather than buy).
- **high** — Levered IRR below a typical 12–15% development hurdle: Levered IRR 3.51% over 9.4 years.
- **high** — Returns turn negative on a common miss: Rents (or sale prices) −10% takes the levered IRR to -2.12%.
- **medium** — Negative NPV at the discount rate: Levered NPV $-11,255,356 at 10%.
- **medium** — Parcel lines are not a survey: Areas come from appraisal-district or provider outlines.
- **medium** — Detention sized by rule of thumb: Detention 8.79 ac-ft from a typical release rate, not the jurisdiction’s criteria.
- **medium** — Costs are parametric, not bids: Building lines come from one Waller County project workbook (medium-low confidence) and platform rates (low confidence); none is a contractor price.

## Files
- `fs-feasibility-sample-waller-garden-apartments.pdf`
- `fs-feasibility-sample-waller-garden-apartments.xlsx`
- `fs-feasibility-sample-waller-garden-apartments-register.csv`
- `fs-feasibility-sample-waller-garden-apartments-budget.csv`
- `fs-feasibility-sample-waller-garden-apartments.json`
- `site-plan-sheet.pdf`
- `plan-set-excerpt.pdf`
- `sample-project.json`
