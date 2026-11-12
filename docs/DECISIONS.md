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


## Team budgets, returns first, layout asks (2026-10-27)

- The team's Smartsheet budgets enter as **medians by building type**, not a per-project lookup: the owner said budgets are "mainly a ppsf/type", and medians resist one odd job. Each line says how many budgets it rests on.
- Only the **building** lines are taken (foundations, shell, services, interiors). The budgets' site infrastructure (about $25–30 per building sf) is left out because the platform already prices site work from the layout's own quantities; taking both would count it twice.
- The budgets' **10% contractor fee** is a line of its own rather than the workbook's GC fee % (12%), so each source keeps its own fee.
- A **leased** shop, restaurant or flex building drops the interior lines: its tenant improvement allowance pays for those, and the pro forma already carries it.
- **Industrial over 40,000 sf stays parametric:** the budgets are small flex buildings with finished bays (about $125/sf before fee); a bulk warehouse is about half that.
- Tiny and manufactured home communities stay on their own delivered-home pricing; the one tiny-home budget is kept in the data but not used.
- Escalation of these rates runs from Oct 2024, the middle of the budgets' dates.
- Townhome guest spaces that don't fit along the rows take the end homes of the longest rows (never below 3 homes a row): a plan short of its own parking can't be handed over, and losing one or two homes is the smaller cost.
- The "fill the site" default for sized mixed-use zones is **not** changed here: it was an earlier product choice and the owner is asked.
- Pads asked for on a single-use shop, restaurant or office plan go through the parking-field engine as a brief's pads do. The older row engine (pods, mixed plans) keeps trying rows with and without pads and isn't pushed toward pads: forcing them, or scoring an option short of them down, cost the big mixed-use test its 60,000 sf of shops or put its pool outside the commons.
- The agent tool list's size check went from 60,000 to 72,000 characters after the merge: each branch was under 60,000 on its own, and together (the project tools and the home-community parameters) they are about 67,000.
- The agent study test's expected levered IRR moved from 3.51% to 6.01% with the 10-year hold (the same project held 10 years instead of 5).
- Apartment buildings are designed by rule (a garden walk-up with open breezeways), never sent to Claude: a 40-unit, 3-story building is about 250 rooms, too big for one answer to come back right, and the rule-based plan passes the same checks. Units a floor are the building's units over its floors, the upper floors taking the odd ones; a slot a floor doesn't need is storage rather than a unit the site plan doesn't count.
- A room a stepped front or back covers only partly gets a bay open to it; a bay's window counts as the bedroom's emergency escape window (it is the same room).
- A pond on much more land than it needs goes at the far end of that land from the buildings (it went beside them): the land left over then touches the drives and can be a later phase; behind a pond it couldn't be reached.
- A pods layout replaces the last band layout when it meets more of the sizes asked for (every sized use at least 97% as much, one more than 3% more), whatever it does with a use left to fill the site: sizes asked for come first.
- Letting a sized apartment zone fill the back of a mixed site was tried and backed out: the apartments took the land and parking the 30,000 sf of shops asked for needed (18,900 laid out).
- The fill-the-site default is kept (the owner wanted the site filled); a request naming sizes still gets more than asked where the land holds it, and the notes say so.
- Townhome and duplex rows are one building type per unit design, not per row length: the unit is what's designed; the type is drawn as its most common row and its sheet says how many rows and units it covers.

## Buildings from their designs: BIM model and the map's 3D (2026-10-27)

- The BIM model and the map's 3D view are both built from the **plan set's floor-plan designs** (the same rule-based design for a type when the set hasn't been made), not from separate massing rules, so the layout, the drawings and the model can't disagree about where a window is.
- A building drawn as a type it only resembles (a home a few feet wider than its type) gets the design **stretched to its size**, in the map and the model. Without it, 43 of 141 homes on the 40 acre test showed bare massing past their walls.
- Rows and gable roofs are **hipped**: BIMCraft walls are one height, so a gable end can't rise to the ridge. The map's roofs are stepped extrusions (MapLibre has no sloped faces).
- BIM rooms are named only on models of 150 rooms or fewer: BIMCraft takes about a quarter second a room, so a whole site would take minutes.
- The map's facades show only when the map is **tilted**: from straight above, the plan's colour by use and the selection highlight matter more than roofs. The picture-taking map for renderings always has them. Phase 2 buildings stay plain, faint massing.
- A retail or office building faces the side with the most parking stalls (it faced the service drive on the test retail site).


## Deterministic layout runs and the independent validator (2026-11-03, branch matthew/site-engine-update-110326)

- **Wrap the engine, don't rewrite it.** The heuristic engine already draws most forms; the gaps were reproducibility, quantity meaning and independent checking. A run layer (brief → deterministic run → validator → ranked record) fixes those without touching its layout logic.
- **Determinism by a seeded generator and a virtual clock** (lib/enginectx.mjs), not by removing the time budgets: the engine's budgets become evaluation budgets (25 virtual ms a clock read). The app's live behaviour is unchanged outside a run.
- **A number with no qualifier is exact.** The earlier "fill the site" default stays for the live Build flow (its Leftover land setting); briefs say what they mean.
- **The validator shares only the shape decoder and the drawn stall marks with the engine**, so it judges the drawing the user sees; it never reads the engine's scores, checks or metrics.
- **Unknown is a status of its own.** A check without a rule (building separation without a stated distance) or without evidence (garage stall estimates, units estimated from floor area) is unknown, never pass; drainage, turning, fire route and grading are always unknown.
- **Drive aprons may cross an allowed street edge** by up to 40 ft (they meet the street in the right-of-way); any other overshoot fails containment.
- **Exact counts are met by trimming whole modules or homes**; when whole modules can't reach the count it stays short or over and the program check fails. Parking short of required takes modules off; no parking tolerance.
- **Templates only from dev-partition evidence.** Holdout families (Sierra Vista, Lake Shore, Anderson, and the hash-assigned rest) stay for evaluation. Garden module = one breezeway stack (75 × 60 ft, 4 units a floor) from the 24-unit bar on three projects; mid-rise bay 50 × 65 ft from Creekview (one family); 5-floor mid-rise is an extrapolation, labelled an estimate.
- **A bar up to 5% short of whole modules counts them at its drawn length.** The engine's generator draws 143 ft garden bars; the reviewed 24-unit bars span 146–154 ft. Never stretched.
- **No form is marked "validated" yet**: the benchmark is synthetic; courtyard and anchored center were downgraded to partial after the benchmark drawings showed corner overlaps and a single-box center.
- **Proven infeasible only from a bound**: the footprint at the most floors a form allows exceeds the land inside the setbacks. Anything else that finds nothing is "no feasible layout found".
- **Two failing tests were left failing** (test/layoutasks.mjs townhome commons; test/streetnet.mjs street bend 30 vs 60 ft): both fail identically on the base commit 50c0f1b. The layoutasks pads failure was fixed (pads only for shop, restaurant, office, medical and other uses).

## Build through the run layer; studio buildings (2026-11-03)

- **Build calls `runPlan` in the worker and falls back to the plain engine** if the run fails, so a run-layer problem can never leave the editor with nothing.
- **Sizes in Build follow the Leftover land setting** (fill / phase = at least, hold = exactly), not the brief's "a bare number is exact" default, so the editor's existing behaviour and setting keep their meaning.
- **The generator takes a smallest-building length (`params.minLen`)**: with templates it is two stacks (150 ft), so it draws fewer, full-length bars instead of one-stair stubs that the templates then removed (the empty parking blocks on the Hockley plan). Unset, the engine behaves as before.
- **Two zones of the same use with no placement get a front-to-back order** in the run layer (stated in the run's notes). The band engine can't lay out two apartment zones (18 units on 29 ac); fixing the band engine itself is left for later.
- **Studio buildings are an estimate**: the reviewed garden stack with six homes a floor instead of four. No studio-only building was reviewed in the library.
- **A word "studio" makes studio homes only with apartment wording or the plural**, never for a yoga, dance, recording, art, fitness, photo or tattoo studio.

## Layout repair passes; what a bare number means in Build (2026-11-03, later)

- **A bare number in Build is exact** unless Leftover land was chosen in Settings (fillBy 'you') or the words asked to hold land (fillBy 'ask'). The earlier "fill the site" default turned a stated count into fill-the-site, which the layout-engine brief rules out; "as many as fit" still fills.
- **Repairs live in the run layer, not the engine**, each kept only when no hard check gets worse; the engine's own behaviour is unchanged outside a run.
- **Courtyard wings stay rectangles** tagged with one court id: a joined outline lost the 3D facades and confused the plan sets (one big building, one unit).
- **Unit counts on buildings without a template** (courtyard, tower) are floor-area estimates, so an exact count may be met by sizing homes between 750 and 1,400 gross sf; templated buildings never change their schedule.
- **A pool may shrink to 75%** to fit its court rather than overlap a wing; the note says so.
- **Fire-code spacing between ways in is a warning, not a hard check**: fire officials commonly accept an emergency-only access; the count of ways in (two past 200 apartments or 30 homes) is hard.

## Quick layouts (2026-11-09)

- **Typed presets, not open prompts**: Quick layouts are fixed word requests per type (lib/quicklayouts.mjs) run through the no-AI words parser and the seeded engine, because open-ended AI requests were giving odd layouts; each preset is checked in test/quicklayouts.mjs to read as the use it names.
- **Run in parallel, dedupe by numbers**: up to five runs at once in a small worker pool (one fewer than the cores, at most 4); a layout with the same units, floor area, spaces, buildings and piece count as an earlier one is dropped for the type's next preset, since some word variants (e.g. "rear-load") draw the same plan on a given site.


## Appraisal rolls and tax rates (2026-11-12, branch matthew/more-data-sources)

- **Free official files only, no scraping.** Every source is a file or layer the district or the Comptroller publishes
  for download (docs/data-sources/cad-and-tax-rates.md). Waller CAD's property search forbids automated access in its
  robots.txt and is not used. Waller, Austin and Montgomery need public information requests for a full roll; the draft
  letter is in that doc.
- **One row per account and tax year** (`cad_accounts`), with the roll it came from. A load writes only its file's tax
  year, so earlier years are never overwritten; within a year a later roll replaces the earlier one. History therefore
  starts with the first load for counties that post only the current year (Harris, Washington, Waller, Austin); Fort Bend
  posts certified exports back to 2023 and Grimes back to 2006 (2018 on is loaded by default via YEARS).
- **Units per account as one row** (`account_taxing_units`: an array of codes and a JSON of taxable values) instead of a
  row per unit: Harris alone would be about 11 million unit rows a year on a 1 GB database.
- **Improvement summary on the account** (year built, building sf, units, stories, class) so comparables are one query;
  `cad_improvements` keeps the detail.
- **Rates by unit key**: the Comptroller's unit ID where known, else `<county>:<code>`. A district's code is linked to
  the Comptroller's unit by ID (Fort Bend's rate workbook gives it) or by a careful name match (numbers must agree;
  names without a number must match exactly). Unlinked units keep their own rates from the district's table. Linked:
  Waller 51 of 57, Fort Bend 267 of 269, Harris about 520 of 850 (most of the rest are TIRZs, which levy nothing).
- **Rate per unit** = the district's own table for the year, else the Comptroller's for that year, else the newest
  earlier year (said in the answer). District tables first because the Comptroller's file lags a year and disagrees with
  Waller CAD on some special districts (e.g. Katy West MUD 0.40 vs 0.80).
- **Waller's farm-to-market / flood fund (RFM)** is added county-wide only with Waller CAD's own rate for the year; the
  Comptroller's county rate already includes it, and two codes that map to one Comptroller unit are counted once.
- **TIRZs** are typed `tirz` and left out of estimates (no rate of their own).
- **Idempotency by file checksum** (`source_runs.sha256`): the same file is skipped. Raw files go to the private
  `cad-raw` bucket when they are under 45 MB (Supabase's default upload limit is 50 MB); HCAD's 100–230 MB zips keep
  their checksums and URL only.
- **Swing checks**: rows read more than 20% off the last run of the same source and roll kind is a warning; under half
  fails the job unless ALLOW_SHRINK=1. A sample of 25 accounts is looked up in the district's parcel layer.
- **MCP tool-list cap 95,000 → 110,000 characters**: the three tools bring the read-only list to 93,568; the cap leaves
  room for the next few without trimming other descriptions.
- **Not in v1**: Fort Bend improvement segments (its monthly property data export has them; a next step), coordinates
  for Harris and Fort Bend accounts (needed for radius comps there), homestead tax ceilings.

