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

## After the phases: MCP server for agents (2026-10-25)

- `origin/main` merged into `experimental` (it brought the `site_plan` MCP tool, rendering controls and team media storage).
- New project tools in `lib/mcp/projects.mjs`, registered in `lib/mcp/server.mjs` (server version 1.1.0):
  - always on: `list_projects`, `get_project`, `feasibility_study` (sections, what-ifs), `feasibility_report` (the report set as attachments), `project_files` (signed links);
  - with `MCP_ACCESS_TOKEN` set: `create_project`, `update_project`, `set_assumptions`, `edit_budget`, `save_scenario`, `site_plan` with `project_id`, and `feasibility_report` with `save: true`.
- Tested in `test/mcp-projects.mjs` (in `npm test`): in-memory database, frozen market, no network; with Chromium it prints and stores the real report set.
- Decisions: DECISIONS.md, "MCP: projects and the feasibility study for agents". How it works: README, "MCP server for the project app".
- To turn on agent changes in production: set `MCP_ACCESS_TOKEN` on Vercel (and give AMP the same token). Without it the server stays read-only.

## After the phases: landscape sheets and the layout review (2026-10-26)

- **Landscape section of the plan set** (`lib/sheets/land.mjs`, tested in `test/sheets-land.mjs`): L-001 notes and calculations, L-101 planting plan, L-102 enlargements (big sites), L-201 schematic irrigation, L-501 planting details, L-502 irrigation details. Before, L-101 missed its own rules (the 27 acre tract showed 5 of 31 street trees and 50 of 71 lot trees); now street, parking and lot rules are met on every test plan and L-001 says where a plan can't.
- **Layout engine review**: `docs/LAYOUT-REVIEW.md`, the list of what's wrong and what to change, from 51 options on 8 test lots. Two fixed here: a flag lot's entry no longer crosses a neighbour's land, and shops in front of apartments or homes keep the street frontage (no pond band across it). Both have tests in `test/sitelayout.mjs`.
- **Next** (in order, from the review): parking always met on townhome sites; the second way in planned with the first; the restaurant pad's drive ring; mixed-use zone sizing and the pond; townhome amenities; duplexes on lots; program fields for what requests can't say (entry street, placement, per-building sizes, open space, density) and a structured program for the MCP tool.
- **Owner's call**: whether a size you name builds just that (with the rest shown as Phase 2) instead of filling the site.

## After the phases: team budgets, returns first, layout asks (2026-10-27)

- **Team budgets as a cost source** (`lib/feasibility/data/fs-budgets-2024-25.mjs`, wired in `costlib.mjs` / `budget.mjs`, tested in `test/fz-budget.mjs` and `test/fz-e2e.mjs`): medians of the team's 2024–25 Smartsheet budgets by building type (multifamily 34 budgets, industrial/flex 12, fuel store 8, retail 6, townhomes 4, duplex 3, houses 3, tiny 1). Houses, retail, restaurants, industrial up to 40,000 sf and owner-built c-stores are priced line by line from them (foundations, shell, MEP, interiors; interiors dropped where a TI allowance pays for them) plus their 10% contractor fee as its own line. Site infrastructure stays priced from the layout. The workbook still prices apartments, townhomes and duplexes; offices, medical, hotels, churches, storage and bulk warehouses stay parametric.
- **Returns first in the Feasibility workspace** (`src/workspace.js`): levered IRR, equity multiple and 10-year average cash-on-cash lead the pro forma step and the summary rail; cash-on-cash by hold year under them.
- **Layout asks** (`lib/siteplan.mjs`, `lib/sitelayout.mjs`, `lib/siteparking.mjs`, `test/layoutasks.mjs`): numbers behind a word ("120 garden apartments"), "homes" as houses, pad sites on single-use commercial requests, a commons at the entry, townhome guest parking always met (review item 3).
- **Apartment buildings in plan sets** (`lib/plandesign.mjs` apartmentDesign / clubhouseDesign, unit schedule and R-2 notes in `lib/sheets/arch.mjs`, tested in `test/plandesign.mjs`): every apartment and clubhouse type on the review lots (60 types) gets a rule-based design that passes the design checks; stepped fronts and buildings end-on to the street included. `scripts/planset-review.mjs <outdir> <lot> "<request>"` prints a whole set offline (rule-based designs) and splits it into a PNG a sheet.
- **Layout review harness** (`scripts/layout-review.mjs [outdir] [regex]`): 13 requests on 8 test lots drawn as review sheets (the prompt, how it was read, three options with numbers and checks), screenshotted with the local Chromium.
- **Open from the harness:** mixed-use zones with a count still fill the rest of the site (80 townhomes asked, 559 laid out on the 40 ac test lot) under the "fill the site" default (review item 7, owner's call); in "hold" mode the same request comes back short of its retail (16,700 of 20,000 sf) and 8–9 spaces short. Second entry (item 4), restaurant drive ring (item 5) and mixed-use allocation (items 9–10) are next.

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

## Buildings from their designs (2026-10-27)

- `lib/bimplan.mjs`: a detailed BIMCraft model of a site plan option from the plan set's designs (rooms, interior and party walls, doors and windows, stairs, apartment balconies, hip or flat roofs, textured materials). Placement shared with the plan set (`placement`, `fitted` in `lib/plandesign.mjs`). The 141-home test site builds with no errors in about 75 s; one apartment building in about 15 s. Tested in `test/bimplan.mjs` (the build itself with `BIMCRAFT_CLI`).
- `lib/massing.mjs`: the map's 3D facades from the same designs (`fs-sp-fac` layer, shown when tilted). About 25 ms a redraw for 141 homes after the first. Tested on engine layouts in `test/massing.mjs`.
- Not done: the BIM worker isn't deployed, so the app can't show the model yet; gable ends; window trim in BIM; better trees.

## Known issues

- **Street network engine (existing code):** on the Waller test site, "Change With AI" (bend a court, cul-de-sac the spine) followed by a re-fit leaves a loop-road block of about 1,466 ft, over the 1,400 ft rule. The app's checks show it to the user. `test/streetnet.mjs` lets through exactly that breach and nothing else. Fix in `lib/streetnet.mjs` re-fit (block splitting after an edit).
- **Network search is clock-budgeted in the UI.** Two machines can offer different first networks. Headless layouts (`lib/feasibility/pipeline.mjs` `autoLayout`) and the test pin it with the new `netEvals` option.
- **Report PDFs are untagged.** `lib/pdf.mjs` turns tagging off to stay under Vercel's 4.5 MB response limit. The HTML report and the workbook carry the same content.
- **Plan sets stay browser-orchestrated** (an existing limit). The report set lists the sheets and the sample run prints the cover and site plan sheets, but a full set is still made from the Plans tab.

## Blocked

- Nothing. No step needed credentials. The AI parts are optional (plan-set notes, the report's narrative) and were tested against stubs.

## Infra I need to set up

1. **Done (2026-10-25):** `supabase/migrations/20261026000000_report_sets.sql` is applied to this platform's own Supabase project (Finishes Real Estate Intelligence). The private `report-sets` bucket exists (checked: private, 25 MB file limit, PDF/XLSX/CSV/JSON only), so "Save the whole set for the team" works.
2. **Vercel (this project):** nothing new is required. `vercel.json` already configures `api/feasibility.js` (120 s; data files, logo, fonts and Chromium included). Optional:
   - `REPORT_SETS_BUCKET` if the bucket gets another name;
   - `FEASIBILITY_NARRATIVE=on` (uses the existing `ANTHROPIC_API_KEY`) for the AI commentary paragraph.
3. **CI (recommended, not created):** a GitHub Actions job running `npm ci && npm run check` on pushes to `experimental`. The existing workflows are all data jobs and never run tests.
4. **MCP project changes (optional):** set `MCP_ACCESS_TOKEN` on Vercel and give AMP the same token. The project tools that change things stay off until then. Optional: `MCP_WRITES=off` to keep it read-only with a token; `APP_URL` if the website moves.
5. Nothing on any source repo's infrastructure is needed, and none was touched.

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

1. Try "Save the whole set" on a real project (the report-sets bucket now exists); add the CI job above.
2. Replace the cost library's single-project rates with a real estimate source: a GC budget template, or a licensed database such as RSMeans with city cost indexes, which also gives real location factors. `lib/feasibility/costlib.mjs` is the one place to plug it in.
3. Add rent and sale comps from a licensed provider to replace the house rent and cap-rate assumptions, keeping ZORI as the check.
4. Move plan-set generation to a server job (queue plus Storage) so the report set can include the full drawing set.
5. Fix the street-network block-length breach after edits (`lib/streetnet.mjs`) and make the UI's network search use `netEvals` too.
6. Proper sign-in (Supabase Auth) instead of the shared team passcode, before the report sets hold anything sensitive.
7. **Re-check the budgeting suite for new work.** On 2026-10-24, 18:47–19:18 CT, a separate effort (not this integration, which only read the source repos through `git archive`) committed a local branch `upgrade/budgeting-v2` in fs-budgeting-suite: an estimate workflow, a budget engine v2 and code-review fixes. The port here is from `origin/feature` @ 4187c8c. Diff that branch once it's pushed, and port any engine changes into `lib/feasibility/rollup.mjs` / `csi.mjs` with their tests.
8. MCP: decide whether agents should make renderings (they spend the image budget) and, after step 4, full plan sets. Both are on the website only for now.
9. Optionally tag report PDFs (an accessible PDF) once the response limit allows: stream from Storage instead of the function's body.
