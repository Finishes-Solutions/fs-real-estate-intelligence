# Progress: integrating fs-budgeting-suite and fs-cre-report-runner into fs-real-estate-intelligence

Branch: `experimental` (never main or staging). Read `CLAUDE.md` first (hard rules and infrastructure isolation), then `docs/DECISIONS.md`.

**Where things stand:** all six phases are done and every Definition-of-done item is met. A new session should start at "Recommended next steps" below.

## Status by phase

| Phase | State | Main output |
|---|---|---|
| 0 Setup | Done | `experimental` branch; rules in `CLAUDE.md`; this file; `docs/DECISIONS.md` |
| 1 Audit | Done | `docs/AUDIT.md` (summary plus full audits of all three repos, including the Infrastructure inventory) |
| 2 Plan | Done | `docs/INTEGRATION_PLAN.md` (ADR format: winners per area, flow plus Mermaid, one data model, realism, scope, build phases) |
| 3 Build | Done | `lib/feasibility/` (engine), `lib/reports/feasibility.mjs`, `api/feasibility.js`, `scripts/dev.mjs`, lint and typecheck, `test/fz-*.mjs` |
| 4 System flow + UI | Done | `src/workspace.js`, `src/workspace.css`, `docs/screenshots/`, `docs/DESIGN_SYSTEM.md`, `docs/ACCESSIBILITY.md` |
| 5 Verify and review | Done | Checks below; `docs/sample-output/`; infra grep; code review, security review and simplify applied |

## What was built (one paragraph a phase)

- **Audit.**
  - The platform already had the best site layout, plan sets and data-backed reports.
  - The budgeting suite had the best budget arithmetic and a fixture-proven hold engine, but only one project's cost data.
  - The report runner had a deterministic envelope, survey and screening yield; its pro forma and research were LLM-written.
- **Build.** `lib/feasibility/` holds:
  - one set of finance primitives;
  - the budgeting suite's roll-up, CSI schedule, guard rails, impact fees and before-tax engine, ported with their tests and fixtures (5 reference deals and the default budget reproduce exactly);
  - the report runner's envelope and survey, with its placement fixed and tested;
  - a cost library (the FS workbook plus platform parametric rates, every rate sourced);
  - a budget priced from the layout's quantities, with escalation from the BLS PPI and a location factor;
  - an assumptions register with a source on every input (rates from FRED, land from appraisal data or the asking price, a ZORI rent check);
  - a pro forma adapter around the platform's monthly model (NPV, break-evens, hold analysis), now fed by the budget and with three modelling fixes;
  - sensitivity, scenarios, fact and risk registers, and a pipeline running intake → site → plans → budget → pro forma → report.

  `api/feasibility.js` makes the report set (PDF, XLSX, CSVs, JSON) and saves it to the platform's own Storage.
- **UI.** Projects open on **Feasibility**:
  - A stepper with step states (Intake → Site → Plans → Budget → Pro Forma → Reports).
  - A project summary rail.
  - Editable assumptions with source chips and live results.
  - Budget lines with edits.
  - Scenario comparison.
  - Report downloads and saving.
  - Loading, empty and error states on every step.
  - The scope statement on every screen.

  axe-core finds no WCAG 2.1 AA violations.
- **Fixes to existing code found along the way:**
  - A duplicate `setTab` in `src/siteplan.js` broke the site plan editor's Layers / Items tabs.
  - Pro forma: lease-up cash was paid out while the construction loan was still owed.
  - Pro forma: exit and refinance NOI grew at the rent rate only.
  - Land defaulted to the total market value, which includes buildings.
  - Parcel intake dropped the address and ZIP.
  - Three tests failed on macOS (timing, `date -d`, Chrome path).

## Verification (Phase 5)

| Check | Command | Result |
|---|---|---|
| Install | `npm ci` | OK |
| Build | `node build.mjs --assemble` | OK |
| Lint | `npm run lint` | 0 errors (warnings only in existing code) |
| Typecheck | `npm run typecheck` | 0 errors |
| Feasibility tests | `npm run test:fz` | 6 files pass: finance, budget (82 checks), investment (25 tests, 5 reference deals), site, end to end, API (real PDF with Chromium) |
| All tests | `npm test` (inside `npm run check`) | **Pass: all 88 platform test commands plus test:fz, exit 0, about 20 minutes on macOS** (the three that failed on macOS at the audit now pass) |
| Sample run, offline | `node scripts/sample-run.mjs` | 389 units on 15.97 acres; total development cost $79,227,648; levered IRR 3.51%; **0 outbound requests attempted** (all refused); files in `docs/sample-output/` |
| Screenshots and accessibility | `node scripts/screenshots.mjs` | 15 screenshots in `docs/screenshots/`; axe-core reports no WCAG 2.1 A/AA violations (`docs/screenshots/axe-results.json`) |
| Infrastructure isolation | `node scripts/infra-grep.mjs` | **0 matches** (output below) |
| Code review (high) | `/code-review high` | 10 findings, all fixed (DECISIONS.md, Phase 5) |
| Security review | `/security-review` | Nothing at or above the 8/10 bar; the one 7/10 candidate (stored XSS in the unit-mix editor) was fixed anyway |
| Simplify | `/simplify` | Applied (shared helpers, a 10× faster IRR, root-cause fixes); skips are listed in DECISIONS.md |

### Infrastructure grep: commands and output

`scripts/infra-grep.mjs` reads the two pattern lists in `docs/AUDIT.md`:
- Part B §8: fs-budgeting-suite's domains, Static Web App, Entra tenant, SQL server and databases, resource groups, env var names, admin digest.
- Part C §8: fs-cre-report-runner's Vercel project, Render testkit, Blob store, monday board and column ids, Zapier account and hook ids, PDF.co, Graph, ReportAll, env var names.

For each pattern it runs `git grep -nI -F -e <pattern> -- . ':!docs/AUDIT.md' ':!docs/PROGRESS.md'`, or `-P` for the regex entries. Annotated exceptions:
- `(own:)`: ANTHROPIC_EFFORT, this platform's own variable, already on main.
- `(match:)`: fs-budgeting-suite is checked only as a database name, because provenance comments name the repo.

```
$ node scripts/infra-grep.mjs
infra grep: 126 patterns from docs/AUDIT.md, 0 matches (excluding docs/AUDIT.md, docs/PROGRESS.md)
```

**Positive control:** a staged file containing the Blob-store host and `MONDAY_TOKEN` produced 3 matches and exit 1. The file was then removed.

## Known issues

- **Street network engine (existing code):** on the Waller test site, "Change With AI" (bend a court, cul-de-sac the spine) followed by a re-fit leaves a loop-road block of about 1,466 ft, over the 1,400 ft rule. The app's checks show it to the user. `test/streetnet.mjs` lets through exactly that breach and nothing else. Fix in `lib/streetnet.mjs` re-fit (block splitting after an edit).
- **Network search is clock-budgeted in the UI.** Two machines can offer different first networks. Headless layouts (`lib/feasibility/pipeline.mjs` `autoLayout`) and the test pin it with the new `netEvals` option.
- **Report PDFs are untagged.** `lib/pdf.mjs` turns tagging off to stay under Vercel's 4.5 MB response limit. The HTML report and the workbook carry the same content.
- **Plan sets stay browser-orchestrated** (an existing limit). The report set lists the sheets and the sample run prints the cover and site plan sheets, but a full set is still made from the Plans tab.

## Blocked

- Nothing. No step needed credentials. The AI parts are optional (plan-set notes, the report's narrative) and were tested against stubs.

## Infra I need to set up

1. **Apply `supabase/migrations/20261026000000_report_sets.sql`** to this platform's own Supabase project. It creates the private `report-sets` bucket. "Save the whole set for the team" returns a clear "download instead" message until the bucket exists.
2. **Vercel (this project):** nothing new is required. `vercel.json` already configures `api/feasibility.js` (120 s; data files, logo, fonts and Chromium included). Optional:
   - `REPORT_SETS_BUCKET` if the bucket gets another name;
   - `FEASIBILITY_NARRATIVE=on` (uses the existing `ANTHROPIC_API_KEY`) for the AI commentary paragraph.
3. **CI (recommended, not created):** a GitHub Actions job running `npm ci && npm run check` on pushes to `experimental`. The existing workflows are all data jobs and never run tests.
4. Nothing on any source repo's infrastructure is needed, and none was touched.

## Owner actions found during the audit (outside this repo)

- **Rotate the monday.com API token** committed in fs-cre-report-runner `zap-jsons/exported-zap-2026-08-13T16_25_41.263Z.json` (BD GATE MOVING). It was not read or copied.
- Also noted in that repo, for its owners:
  - its Vercel Blob store keeps full deal checkpoints as public objects with predictable keys;
  - its `api/v2/*` endpoints have no shared-secret check.

## Honest summary

**What is real**
- **The arithmetic.**
  - Budget roll-up: the budgeting suite's, reproducing its workbook and default budget to the dollar.
  - Before-tax hold engine: matches five reference deals within ±$1.5 and 0.006 pp.
  - Monthly development model: the platform's, still matching TestFit's sheet to the dollar.
  - IRR, NPV, DSCR, yield on cost, break-evens and sensitivity: tested against hand-worked identities.
- **Quantities.**
  - From the platform's layout engine (units, gross sf, parking, paving, detention).
  - From parcel outlines, plus a measured buildable envelope.
- **Market facts with dates:**
  - SOFR and 10-year Treasury (FRED), which drive the default loan rates;
  - BLS PPI construction materials (cost escalation);
  - Zillow ZORI by ZIP (a rent check only);
  - the City of Waller impact-fee schedule (2025-10-15).
- **The flow, end to end on this platform:** the workspace, the API, the report set and Storage. The offline sample run proves no other system is involved.

**What is still estimated or placeholder**
- **Costs.**
  - Apartment and townhome lines come from **one** Waller County project's workbook, back-solved to $/SF (medium-low confidence).
  - Every other use, and all site work, uses platform house rates (low confidence, marked UNVERIFIED).
  - No contractor bids, no cost database.
  - The location factor is a placeholder of 1.00 (flagged as a high risk outside the 7-county region).
- **Market inputs.** Rents, cap rates, vacancy, opex, growth, construction and permanent loan spreads, and the 10% discount rate are house assumptions. The platform has no sale or lease comps.
- **Land.** Appraisal-district land value unless an asking price is entered.
- **Site.**
  - Parcel lines are not a survey (a metes-and-bounds entry is available).
  - Detention is sized by rule of thumb.
  - Setbacks are generic outside Waller.
- **Plan set.** Schematic only. Multifamily, hotel and storage buildings get no floor-plan sheets yet.

Every screen and report carries the scope statement, and the Fact & Assumption Register gives each input's source and confidence.

## Recommended next steps

1. Apply the report-sets migration and try "Save the whole set" on a real project; add the CI job above.
2. Replace the cost library's single-project rates with a real estimate source: a GC budget template, or a licensed database such as RSMeans with city cost indexes, which also gives real location factors. `lib/feasibility/costlib.mjs` is the one place to plug it in.
3. Add rent and sale comps from a licensed provider to replace the house rent and cap-rate assumptions, keeping ZORI as the check.
4. Move plan-set generation to a server job (queue plus Storage) so the report set can include the full drawing set.
5. Fix the street-network block-length breach after edits (`lib/streetnet.mjs`) and make the UI's network search use `netEvals` too.
6. Proper sign-in (Supabase Auth) instead of the shared team passcode, before the report sets hold anything sensitive.
7. **Re-check the budgeting suite for new work.** On 2026-10-24, 18:47–19:18 CT, a separate effort (not this integration, which only read the source repos through `git archive`) committed a local branch `upgrade/budgeting-v2` in fs-budgeting-suite: an estimate workflow, a budget engine v2 and code-review fixes. The port here is from `origin/feature` @ 4187c8c. Diff that branch once it's pushed, and port any engine changes into `lib/feasibility/rollup.mjs` / `csi.mjs` with their tests.
8. Optionally tag report PDFs (an accessible PDF) once the response limit allows: stream from Storage instead of the function's body.
