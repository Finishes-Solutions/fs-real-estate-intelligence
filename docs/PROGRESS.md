# Progress: integrating fs-budgeting-suite and fs-cre-report-runner into fs-real-estate-intelligence

Branch: `experimental` (never main/staging). Read `CLAUDE.md` (hard rules and infrastructure isolation) and `docs/DECISIONS.md` first.

## Status by phase
| Phase | State |
|---|---|
| 0 Setup | Done |
| 1 Audit (`docs/AUDIT.md`) | Done |
| 2 Plan (`docs/INTEGRATION_PLAN.md`) | Next |
| 3 Build | Not started |
| 4 System flow + UI overhaul | Not started |
| 5 Verify and review | Not started |

## Done
- Phase 0: `experimental` branch, rules in `CLAUDE.md`, this file and `docs/DECISIONS.md`.
- Phase 1: `docs/AUDIT.md` (summary + full per-repo audits). Key facts for later phases:
  - Target `npm test`: 85/88 commands pass on macOS; `test/streetnet.mjs` (time-budgeted), `test/mcp.mjs` (needs `CHROME_PATH`), `test/countydata.sh` (GNU `date`) fail. No lint/typecheck/CI/local API runtime/.env.example.
  - Budgeting suite best branch `origin/feature` (304/304 tests); report runner best branch `matthew/nifty-mendel-hc0iwc` (175/175).
  - Scratch exports of the source branches were made with `git archive` (never checkout/install inside the source repos).

## Next
- Phase 2: `docs/INTEGRATION_PLAN.md` (engineering:architecture structure), then start Phase 3.

## Blocked
- Nothing yet.

## Infra I need to set up
- Nothing new yet.

## Owner actions found during the audit (outside this repo)
- **Rotate the monday.com API token** committed in fs-cre-report-runner `zap-jsons/exported-zap-2026-08-13T16_25_41.263Z.json` (BD GATE MOVING). It was not read or copied.
