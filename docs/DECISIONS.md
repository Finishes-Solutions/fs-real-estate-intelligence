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
