# Progress: integrating fs-budgeting-suite and fs-cre-report-runner into fs-real-estate-intelligence

Branch: `experimental` (never main/staging). Read `CLAUDE.md` (hard rules and infrastructure isolation) and `docs/DECISIONS.md` first.

## Status by phase
| Phase | State |
|---|---|
| 0 Setup | Done |
| 1 Audit (`docs/AUDIT.md`) | Done |
| 2 Plan (`docs/INTEGRATION_PLAN.md`) | Done |
| 3 Build | Done |
| 4 System flow + UI overhaul | Done |
| 5 Verify and review | In progress |

## Done
- Phase 0: `experimental` branch, rules in `CLAUDE.md`, this file and `docs/DECISIONS.md`.
- Phase 1: `docs/AUDIT.md` (summary + full per-repo audits). Key facts for later phases:
  - Target `npm test`: 85/88 commands pass on macOS; `test/streetnet.mjs` (time-budgeted), `test/mcp.mjs` (needs `CHROME_PATH`), `test/countydata.sh` (GNU `date`) fail. No lint/typecheck/CI/local API runtime/.env.example.
  - Budgeting suite best branch `origin/feature` (304/304 tests); report runner best branch `matthew/nifty-mendel-hc0iwc` (175/175).
  - Scratch exports of the source branches were made with `git archive` (never checkout/install inside the source repos).

- Phase 2: `docs/INTEGRATION_PLAN.md`: winners per area, flow + Mermaid, folder structure, shared model, realism rules, scope statement, build phases B1–B8.

- Phase 3 B1: `scripts/dev.mjs` (local app + API), ESLint + `tsc` (`npm run lint`, `npm run typecheck`, `npm run check`), `.env.example`, `npm run test:fz`, portable fixes to the macOS-failing tests (local Chrome detection, no GNU `date`, streetnet deletion/loop-lane checks). Fixed a real bug: duplicate `setTab` in `src/siteplan.js` broke the site-plan editor's Layers/Items tabs.
- Phase 3 B2–B5 (`lib/feasibility/`): finance primitives; ported investment engine (5 reference deals reproduce), budget roll-up/CSI/guard rails/impact fees (default budget reproduces to the dollar), envelope + survey (placement fixed); cost library, budget from layout, escalation (PPI), assumptions register (FRED rates, appraisal land, ZORI check), pro forma adapter (NPV, break-evens, hold analysis), sensitivity, fact/risk registers, pipeline. `lib/proforma.mjs` takes a budget (`budgetIn`) and has the lease-up/forward-NOI fixes. `test/fz-e2e.mjs` runs one project end to end offline.

- Phase 3 B6: report set (`lib/reports/feasibility.mjs`, `lib/feasibility/xlsx.mjs`, `lib/feasibility/guards.mjs`), `api/feasibility.js` (study/file/save/link), migration `20261026000000_report_sets.sql`, `test/fz-api.mjs`.
- Phase 4: `src/workspace.js` + `src/workspace.css` (Projects › a project › Feasibility), `scripts/screenshots.mjs` (Playwright + axe-core, no AA violations), `docs/screenshots/`, `docs/DESIGN_SYSTEM.md`, `docs/ACCESSIBILITY.md`, PRODUCTDOC and CHANGELOG entries.

## Next
- Phase 5: full `npm run check` (lint, typecheck, all tests), `scripts/sample-run.mjs` with source-repo hosts blocked → `docs/sample-output/`, infrastructure grep (commands + output below), code-review (high), security-review, simplify; fix and re-test.

## Blocked
- Nothing yet.

## Infra I need to set up
- Nothing new yet.

## Owner actions found during the audit (outside this repo)
- **Rotate the monday.com API token** committed in fs-cre-report-runner `zap-jsons/exported-zap-2026-08-13T16_25_41.263Z.json` (BD GATE MOVING). It was not read or copied.
