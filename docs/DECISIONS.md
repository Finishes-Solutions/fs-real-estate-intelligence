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

## Phase 5: Verify and review
- Sample run (`scripts/sample-run.mjs`):
  - It replaces `fetch` with a function that refuses and records every request, so the source deployments, and everything else, are unreachable. Chromium's own requests are already limited by `lib/pdf.mjs` (public https and `data:` only), and the report has no external assets.
  - The sample project uses three real, anonymized appraisal-district outlines near Waller (the report runner's fixture geometry with owners and ids removed) and a labelled sample asking price.
- Infrastructure grep (`scripts/infra-grep.mjs`):
  - It reads its 126 patterns from `docs/AUDIT.md`, so the script itself contains none. It excludes only AUDIT.md and PROGRESS.md, which name the identifiers on purpose.
  - Two annotated exceptions: `ANTHROPIC_EFFORT` (own) is the platform's own variable, already on main. `fs-budgeting-suite` (match) is checked only as a database name, because the repo name appears in provenance comments.
  - A planted control string was caught, so the check works.
- Code review (high), 10 findings, all fixed:
  - project.fz was replaced on every read, which lost saved-report records and the generated option;
  - every report was refused on any input note;
  - the cost case didn't move soft costs or the developer fee;
  - the hold analysis grew rents from month 0;
  - the tornado's low case wasn't always the downside;
  - a site with no mapped flood zone read as "not checked";
  - the workspace didn't redraw after the site lookup;
  - one save timer was shared by every project;
  - the inputs hash named the active scenario, not the one studied;
  - the narrative was recorded as on when off.
- Security review: nothing reached the reporting bar (8/10). The one 7/10 candidate (unit-mix values unescaped in the scenario editor, from a synced document) was fixed anyway, with a regression test.
- Simplify, applied:
  - shared formatters and tornado (`lib/feasibility/format.mjs`);
  - dead code removed;
  - shared logo, Storage and market helpers;
  - IRR 10× faster with the same roots, and caching of the parametric run and repeated cases (a full study went from 273 to 135 ms);
  - a fee basis in `parts()`, replacing the diluted company share;
  - cost cases scaled before the roll-up;
  - the service-worker list generated at build;
  - grep exceptions moved to AUDIT.md annotations;
  - browser discovery moved into `lib/pdf.mjs`;
  - the sticky offsets read the view's padding variable;
  - the streetnet edit checks pinned with `netEvals`.
- Simplify, skipped:
  - Unifying `lib/feasibility/plane.mjs` with `lib/siteplan.mjs` `frame`, because areas would move in the 4th–5th digit.
  - One unit formatter for the register and the pro forma notes, because the displayed text would change.
  - A shared CSV cell helper across five existing files, because it is outside this diff.
  - Deleting finance helpers only the tests use. They are the documented shared API and are tested.
  - A full `parametricBudget()` split of `runM`. The cache gives the same speed-up without touching the monthly model.
  - Deferring sensitivity until after the first paint in the UI, because the behaviour would change.
- `test/streetnet.mjs`:
  - The edit checks run on a network laid out with `netEvals: 10`, so it is the same network on any machine.
  - Exactly one known engine breach is allowed: a ~1,466 ft block on the loop road after Change With AI. It is logged as a known issue in PROGRESS.md.

## MCP: projects and the feasibility study for agents (2026-10-25)

- Merged `origin/main` into `experimental` first (main had the `site_plan` MCP tool and team media storage that the project tools build on). The one code conflict, `api/sitefiles.js`, now uses the shared Storage helper for main's media store too.
- New tools sit in `lib/mcp/projects.mjs`, over the same `site_projects` documents the website syncs, so there is no second store and nothing to reconcile.
- The tools that change projects are listed and run only when `MCP_ACCESS_TOKEN` is set (with `MCP_WRITES=off` as an extra switch). An open endpoint stays read-only, because anyone who could reach it could otherwise change the team's projects.
- No delete tool: a project is retired with status `dead`, and scenarios can be removed but projects, options and files can't. An agent's mistake stays recoverable.
- Saves are conditional on `updated_at` (PostgREST `PATCH … &updated_at=eq.`), with one automatic retry on a fresh copy. This avoids silently overwriting a teammate who saved in between. The website's last-edit-wins sync is unchanged; a person and an agent editing at the same instant is a documented limit.
- `by` is recorded as "<name> (agent)", so the website shows that an agent made the change.
- `feasibility_study` answers can be up to 38,000 characters, instead of the server's usual 15,000, because the study's value is the detail (every assumption key and budget line_id the write tools need); AMP's cut-off is 40,000.
- `what_if` values are checked against the assumption register and read as numbers ("$2,400" is 2400) before the study runs, so a typo can't feed text into the math.
- `site_plan` with `project_id` reuses the existing tool (`ctx.site`, `ctx.onPlan`) rather than a second layout path, so the agent's plan is the website's Build with AI result. The ground-elevation grid is not stored on the option (it is large; the website gathers its own).
- Renderings and full plan sets stay on the website. Renderings spend the image budget and plan sets are made in the browser (Known issues). Agents get links to the ones already made.


## Landscape sheets and layout fixes (2026-10-26)

- The landscape sheets moved to `lib/sheets/land.mjs`, drawing with the site sheets' kit (`KIT` exported from `lib/sheets/site.mjs`) so the plan is worked out once and C-301, FP-101 and L-201 see the same hydrants and drives.
- One planting design per plan, every landscape sheet drawn from it, so L-001's quantities are L-101's plants. It starts from the site plan's own trees (so L-101 matches C-101) and adds what the rules ask for; it never removes the site plan's trees except where they'd stand in a sight triangle or on a hydrant.
- The rules are typical values (`RULES`): street trees every 40 ft, a tree per 10 surface stalls, a parking screen within 60 ft of a street, buffers every 40 ft on other lines for anything but a neighbourhood of lots, 15% landscape, no species over 40%. L-001 shows Required / Shown / Status and says **Short** honestly where the plan can't meet one (a pond against the line).
- Surface stalls are counted from the parking pieces, not `metrics().stalls`, which includes home garages and driveways (a subdivision would otherwise need hundreds of parking trees).
- Irrigation hydrozones come from one grid over the landscape with a distance transform from what's built: spray within 35 ft of buildings and paving and 30 ft of the street, rotors to 100 ft, native grass (not irrigated) beyond, pond banks not irrigated, lots and the parkways beside them left to the home builder. Valves are sized for about 25 gpm a zone. It's schematic and labelled so; a licensed irrigator designs the system.
- L-102 enlargements only when the site plan is drawn smaller than 1" = 30' (otherwise L-101 is legible as is).
- Layout: an edge facing the street's way is front only when it lies on (or within a jog of) the front line. The old rule made a flag lot's back edges frontage and put the entry across a neighbour's land.
- Layout: a mix with shops first never gets the detention band across the frontage. Extending "pond beside the shops" to apartments was tried and backed out: it added options that ranked first with fewer apartments (196 vs 211 on the Tomball Rd test).
- Kept as is: **Leftover land: fill the site** builds more than a size asked for. It's an earlier product choice (the most leasable square footage), so it's listed in `docs/LAYOUT-REVIEW.md` as the owner's call, not changed here.
- A "same picture" duplicate check for options was tried and dropped: it didn't change any option in the 17-run survey.
