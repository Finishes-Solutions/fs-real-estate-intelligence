# Decisions

One line per decision: what was chosen and why. Newest at the bottom of each phase.

## Phase 0: Setup
- Branch `experimental` cut from `main` (c1a6495, "Refresh data 2026-10-24"): `main` is the default branch and the only long-lived one in this repo.
- Integration rules live in `CLAUDE.md` as well as here, so every later session loads them automatically.
- The repo's existing rule (a CHANGELOG.md entry for every push) still applies on `experimental`; entries say "experimental branch" so they aren't mistaken for production releases.

## Phase 1: Audit
- Audited fs-budgeting-suite `origin/feature`: it contains every other branch except `claude/budgeting-suite-expansion-lwuc2e`, whose entity profit split is noted separately.
- Audited fs-cre-report-runner `matthew/nifty-mendel-hc0iwc`: a strict superset of main with the newest parcel/survey work.
- Source branches were exported with `git archive` into a scratch folder for install/run/test, so the source repos were never modified.
- The admin passcode digest found in the budgeting suite is redacted in AUDIT.md (only its 8-char prefix is kept for the grep check).
- The infrastructure grep (Phase 5) excludes `docs/AUDIT.md` and `docs/PROGRESS.md`, which must name the source identifiers to inventory them; every other file must have zero matches.

## Phase 2: Plan
- Port chosen source modules into `lib/feasibility/` as ES modules with their tests and fixtures (Option A). Calling the source deployments is forbidden; vendoring would drag in infra code; a rewrite would discard fixture-proven math.
- Development pro forma = the platform's monthly model (only one with construction, lease-up and refinance). Stabilized hold = the budgeting suite's fixture-proven before-tax engine. Both run on one set of finance primitives, so the math isn't duplicated.
- Budget math = the budgeting suite's roll-up. Site costs come from layout quantities rather than the workbook's $/SF infrastructure lines, so nothing is counted twice.
- Site layout and plan sets stay the platform's. Only the envelope and the survey parser come from the report runner.
- Market research stays data-backed. The report runner's LLM web research is not ported; its document structure (register, risks) and output guards are.
- Feasibility state lives in the project's existing JSON document (`project.fz`), not new relational tables. Sync, offline use and the passcode model keep working, and nothing new is needed to run.
- Results are recomputed from inputs, not stored. A report keeps an inputs hash.
- No location-factor dataset is available, so the factor is a labelled assumption (1.00 in the 7-county basis region, flagged elsewhere). Escalation uses the PPI series the platform already refreshes nightly.
