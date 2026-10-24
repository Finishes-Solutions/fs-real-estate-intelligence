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

## Phase 3: Build
- Lint: ESLint 10 with `eslint:recommended` plus app globals. Style-only rules are warnings in the existing code and errors in the new feasibility code, because turning on full rules repo-wide would have meant rewriting unrelated code.
- Typecheck: `tsc --noEmit` with per-file `// @ts-check` on the feasibility code. Global `checkJs` would have checked the 47k lines of untyped existing code that the feasibility modules import. TypeScript 5.9 is used because its JSDoc checking is mature.
- Kept the budgeting suite's IRR algorithm (grid scan + bisection) as the one shared IRR. Fixed it to skip non-finite NPVs at the bottom of the grid, which long monthly series hit.
- GC fee (12%) applies only to the workbook's line items. Platform parametric and site rates are already all-in, so marking them up again would double count. Implemented as an effective company share passed to the unchanged `parts()`.
- The workbook's site-infrastructure and site-finish lines (31/32/33, pool, landscaping, irrigation) are replaced by the layout-quantity site lines, so nothing is counted twice. The excluded lines are listed on each budget.
- Developer fee defaults to 3% of total project cost before financing, using the suite's closed-form circular solve. That sits between the suite's 2% and the platform's 4% of non-land cost.
- Pro forma fixes in `lib/proforma.mjs`:
  - lease-up income pays the construction loan down before anything is distributed;
  - exit and refinance NOI grow revenue and costs separately.
  The existing tests, including TestFit's to-the-dollar check, still pass.
- Land defaults to appraised land value, not total market value, because market value includes buildings.
- Rates default to SOFR + 3.00% (construction) and the 10-year Treasury + 1.75% (permanent), from the platform's FRED data. The spreads are labelled house assumptions.
- No location-factor or comps data exists, so these are labelled assumptions. ZORI is shown as a market check, never substituted for rents.
- Hold analysis: the budgeting suite's engine with the stabilized asset bought at total development cost and held 5 or 10 years (the engine's horizons). It answers a different question from the development model, so it is not duplicate code.
- Report files go to a new private Supabase Storage bucket (`report-sets`), with the record kept on the project document. Without storage configured, the files download instead.
- The AI narrative is off by default (`FEASIBILITY_NARRATIVE=on` turns it on). It may not introduce any number the study doesn't have.
- exceljs was added for server-side workbooks (the suite used it too). The browser downloads workbooks from the API.
- Tests use a frozen slice of the market data (`test/fixtures/fz/market/`), so they don't move with the nightly refresh.
- `test/streetnet.mjs` failed on macOS before any change because its edit checks depended on which network the time-budgeted search ranked first. Changes:
  - The checks now test the behaviour: no lot left on a deleted street; a loop lane that can be ended; a court that is a cul-de-sac.
  - One real rule breach is allowed and logged as a known issue: a 1,466 ft block after Change With AI, over the 1,400 ft limit.
  - `lib/streetnet.mjs` gained `netEvals`, a fixed number of networks instead of a clock. Headless layouts use it, so they repeat exactly.

## Phase 4: UI
- The workspace is a new first project tab ("Feasibility"), not a rewrite of the 5,000-line site plan editor. The editor is still one click away for each option, and the change stays small and reversible.
- The `design:design-system` and `design:accessibility-review` skills weren't loadable here ("Unknown command"). Their checklists were applied by hand, the components are documented in `docs/DESIGN_SYSTEM.md`, and the audit was automated with axe-core. Results are in `docs/ACCESSIBILITY.md`.
- Warning text uses `#8a5a12` (5.9:1 contrast) instead of the app's `#b7791f` (3.6:1) inside the workspace.
- Screenshots and the accessibility audit run in one Playwright script against the local dev server with the local Chrome, so no browser download is needed.
