# Audit: fs-real-estate-intelligence, fs-budgeting-suite, fs-cre-report-runner

Audited 2026-10-24 for the `experimental` integration branch. Each repo was audited separately (parallel sub-agents), from read-only `git archive` exports for the two source repos, with no secrets read and no deployed infrastructure touched. The three full audits follow this summary as Parts A–C, with file:line evidence for every claim.

| Repo | Branch audited | Why that branch |
|---|---|---|
| fs-real-estate-intelligence (TARGET) | `experimental` = `main` @ c1a6495 | Default branch; integration target |
| fs-budgeting-suite | `origin/feature` @ 4187c8c (+ `claude/budgeting-suite-expansion-lwuc2e` @ 8cf6570 for the entity profit split) | `feature` contains every other branch (staging, main, both matthew/*) and has the most tests; the claude branch is the only place the bank budget / entity waterfall exists |
| fs-cre-report-runner | `matthew/nifty-mendel-hc0iwc` @ 35c1fe4 | Strict superset of main, newest, adds survey metes-and-bounds and multi-polygon merge |

## Builds, runs, tests (actual results)

| Repo | Build | Run | Tests |
|---|---|---|---|
| Target | No build step beyond `npm run assemble` (OK, copies src/data/lib to public/). No lint, no typecheck, no CI test job | Static serve of `public/` loads the UI; every `/api/*` is 404 without a function runtime (no `vercel dev`, no local shim) | 85/88 test commands pass when run one at a time. Fails: `test/streetnet.mjs:169` (time-budgeted search; fails on this Mac every run), `test/mcp.mjs` (needs `CHROME_PATH`; passes with it), `test/countydata.sh` (GNU `date -d`). Plain `npm test` stops at the first failure |
| fs-budgeting-suite | No build step | Azure Functions host starts all 14 functions; only the stateless `investment-calculations` works (200 on the Frisco fixture). Everything else 500s without Azure SQL (`SQL_CONN`) | `node --test`: 304/304 pass. Playwright suites against its mock API: 1,468 checks, 2 failures (timezone-dependent date, help-page scroll flake) |
| fs-cre-report-runner | No build step | `generate-examples` (dry-run) reproduces the committed BD-0014 HTML byte for byte; testkit server starts, but every LLM stage needs a paid key | `node --test`: 175/175 pass |

## Area-by-area: what each repo really does

| Area | Target (fs-real-estate-intelligence) | fs-budgeting-suite | fs-cre-report-runner |
|---|---|---|---|
| (a) Budgets / cost estimating | ~15 parametric $/gsf and $/unit rates inside the pro forma (`lib/proforma.mjs:44-133`), all tagged UNVERIFIED. No line items. **Demo-quality.** | **Production-grade roll-up math** (`budget-calc.js`: SOV lines → hard → profit/contingency → contract sum → closed-form circular fee → total project cost; CSI schedule; guard rails; impact fees). **Cost data is demo-quality**: one Waller TX project's workbook back-solved to $/SF (pricing `2026.08-v2`), unsourced, no region or escalation. Only sourced table: City of Waller impact fees (2025-10-15). | Three inconsistent budgets (deterministic site budget, fixture, LLM). House $/SF table (`standards.js`). **Screening-quality.** |
| (b) Pro forma | Monthly development model (draws, capitalized interest, lesser-of-LTV/DSCR refi, lease-up, sale) + TestFit one-pager verified to the dollar + Excel. **Structure realistic, inputs static**; no NPV, no sensitivities, three meanings of "profit", NOI grown at rent growth at exit, lease-up surplus distributed while the construction loan is outstanding. | **Fixture-proven before-tax acquisition engine** (5 reference deals within ±$1.5 / 0.006 pp): NOI, 30/360 loan, next-year-NOI exit, property/equity IRR, CoC, DSCR, debt yield, equity multiple, optimal hold, price sensitivity. Stabilized only: no construction or lease-up. | Deterministic `calc.js` (draws, carry, amortization, DSCR, break-evens, sensitivity) is correct but a screening calculator; IRR unused in production. **The production 5-year pro forma and IRR are LLM-computed.** Defects: selling costs double counted, carry at the perm rate and on land. |
| (c) Site layout | **Strongest.** Parcel union/bridging, setbacks, drive-network-first layout engine, parking/coverage/FAR, stormwater sizing, ADA, Waller guardrails, DXF. Browser-only (no headless API). | Not present (three ratio tiles). | **Good deterministic screening yield**: EDT setback envelope, closed-form footprint/parking solve, unit mix, massing bars, survey metes-and-bounds (new, untested, 0.33% area drift). |
| (d) Plan sets | **Extensive schematic 24×36 set** on the FS title block (G/C/L/A/S/M/P/E/FP sheets), Claude notes. Built in the browser tab; PDFs IndexedDB-only. No arch sheets for multifamily/hotel/storage. | Not present. | Not present (four letter-size preliminary site-plan sheets). |
| (e) Market research / reports | **Realistic public-data reports** (flood, environmental, crime, demographics, market) + MCP tools. No comps (by design). No combined feasibility package. | Not present (exports of its own numbers only). | All market research is **LLM web search** with no data layer; polished branded renderers bound to the BD-0014 fixture. **Demo-quality as research.** |

## Every hardcoded cost, placeholder, mock, stub and TODO

The full lists, with file:line and value, are in Part A §4, Part B §5 and Part C §5. In short:
- **TODO/FIXME:** none in logic code in any repo (budgeting suite: 3 styling TODOs in `app/ds-bridge.css`).
- **Placeholders:** target plan-set sheets label tank/pipe/conduit sizes, detention method, utility routes and BMP locations as placeholders; report runner prints "Third-party cost figures are placeholders pending a Capital rate card" and uses 5 placeholder photos; budgeting suite calls its own newer rates "STARTING POINTS, NOT HOUSE NUMBERS".
- **Mocks/stubs:** only in tests (target `test/mock-*.mjs`; budgeting `test/mock-api.js` with `MOCK_AI`; report runner stubs `fetch` in tests). The report runner's V2 documents always render the BD-0014 fixture regardless of input.
- **Hardcoded costs:** every cost, rent, cap rate, vacancy and loan term in all three repos is a single static house number. None is indexed to region or date, and none is fed by the market data the target already downloads (FRED rates, Zillow ZORI rents, PPI construction-cost series).

## Infrastructure inventory

The platform (fs-real-estate-intelligence) runs everything on its own Vercel functions, its own Supabase project, its own Chromium PDF pipeline and its own Anthropic/OpenAI keys. Source-repo infrastructure is replaced as follows; nothing from the source repos is called, deployed to or read at runtime.

### fs-budgeting-suite (detail: Part B §7)
| Source dependency | Platform replacement |
|---|---|
| Azure Static Web App (`wonderful-rock-…`, `stapp-fs-budgeting-prod`), domains `budgets.finishessolutions.ai/.com`, `reports.finishessolutions.com` | Target's own Vercel deployment; no references kept |
| Entra ID tenant/app registration, SWA auth (`x-ms-client-principal`, `/.auth/*`), roles `pricing_admin`/`super_admin` | Target's existing access model (team passcode `FIELD_ACCESS_CODE`); pricing edits are local/admin data, no Entra |
| Azure SQL (`sql-finishes-cus-prod-fs01`, DBs `fs-bd-budget`/`fs-budgeting-suite`, logins, `SQL_CONN`), `mssql` driver | Budgets, budget versions and pro forma results live inside the target's project document (`site_projects.doc`) in the target's own Supabase, plus a new platform table for saved report sets (migration in this repo, to be applied by the owner) |
| Pricing library / templates / fee schedules (T-SQL seeds) | Versioned JSON cost library committed in the target (`lib/costdata/`), every rate labelled with source, region, date and confidence |
| Microsoft Graph mail (`GRAPH_*`, `FEEDBACK_*`) | Dropped (not needed) |
| Anthropic Budget Assistant (`ANTHROPIC_EFFORT`, `ANTHROPIC_FALLBACKS`) | Target's `lib/anthropic.mjs` with `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` |
| `fs-render` (vendored from fs-courier), pdfmake/exceljs exports, Google Fonts | Target's `lib/pdf.mjs` (puppeteer-core + @sparticuz/chromium) and local `fonts/` |
| GitHub Actions SWA deploy (`AZURE_STATIC_WEB_APPS_API_TOKEN_*`) | Not carried over |
| Feature flags `FS_ALLOW_ANON`, `FS_EXPORT_RENDERER` | Dropped |
| Webhooks, cron, blob storage | None exist |

### fs-cre-report-runner (detail: Part C §7)
| Source dependency | Platform replacement |
|---|---|
| Vercel project `fs-bd-ai-search-platform`, self-invocation over HTTP, `SHARED_SECRET` | In-process function calls inside the target; the target's own API guard |
| Render.com testkit (`bd-pipeline-testkit`) | Dropped |
| Vercel Blob store `ekgzoku9zzyi3xo9` (public checkpoints, renders) | Target's Supabase Storage (private bucket, signed URLs) for report outputs |
| monday.com (board `18417462993`, ~27 column IDs, `MONDAY_TOKEN`, run status) | Project status and run state in the target's project document; no monday |
| Zapier hooks (`428g0e0`, `42tjlh8`, `428qy9u`), PDF.co, SharePoint, Outlook | Target's own PDF pipeline and storage; no Zapier |
| Anthropic/OpenAI via `ANTHROPIC_KEY`/`OPENAI_KEY`/`MODEL_PROVIDER` | Target's `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` clients. The deterministic engine computes every number; the model only writes narrative |
| Regrid (`REGRID_TOKEN`), ReportAll, ArcGIS registry | Target's existing capped Regrid service and StratMap parcels |
| Google Fonts (`FS_FONT_*`) | Target's local `fonts/` |
| **Leaked credential:** a monday API token (JWT) committed in `zap-jsons/exported-zap-2026-08-13T16_25_41.263Z.json` | Not copied. **Owner action: rotate that monday token.** |

### Target's own infrastructure (allowed; detail: Part A §7)
Vercel project `fs-real-estate-intelligence`; Supabase project (Postgres/PostGIS, ~45 tables, buckets `field-photos` and `site-files`, edge function `pipeline`); Chromium PDF; OpenAI, Anthropic, Regrid, Google Maps, MapTiler and other providers through the target's own env vars. Gaps found: no job runner, no server-side storage of generated report sets, no `.env.example`, no local API runtime, no auth beyond a shared passcode.

### Grep list for the final isolation check
Part B §8 and Part C §8 list the literal strings (domains, resource names, IDs, env var names) that must not appear in the integrated code. The Phase 5 check greps the whole branch for them, excluding only this audit and `docs/PROGRESS.md`, which list them on purpose.

---

# Part A: fs-real-estate-intelligence (target)


Repo `/Users/matthewsinitiere/Desktop/GitHub/fs-real-estate-intelligence`, branch `experimental` @ `59be765` (clean tree, cut from `main` @ `c1a6495`). Audited 2026-10-24. All paths are relative to the repo root. "file:N" = line N.

---

### 1. Purpose and stack

**Purpose.** An internal-but-public map app for Finishes Solutions covering Waller County plus Harris, Fort Bend, Montgomery, Austin, Washington and Grimes (README.md:3). Its core data is two years of TDLR TABS construction filings, AI-tagged and geocoded nightly, with tract demographics, a Market view, and roughly 20 live layers (crime, FEMA, traffic, planes and others). On top of that sits a **Projects** workspace. From a parcel you can lay out site-plan options, run a pro forma on them, get AI renderings and generate a 24×36 schematic plan set PDF (README.md:27, lib/planstages.mjs:10-15). An MCP server exposes the data and reports to an outside agent app called "AMP" (README.md:170-190).

**Stack.**
- Runtime: Node >= 20 (package.json `engines`; this machine has v26.5.0). ES modules everywhere (`"type": "module"`).
- Frontend: vanilla ES-module JS in `src/` (about 23k lines across 60 files; `src/siteplan.js` alone is 5,042 lines). No framework, no bundler, no TypeScript. MapLibre GL 5.24.0 comes from a CDN (src/index.html). SheetJS 0.18.5 is lazy-loaded from cdnjs (src/app.js:1421).
- Shared logic: `lib/*.mjs` (about 95 modules). These are DOM-free and imported by the browser, the Vercel functions and the tests alike.
- Server: about 45 Vercel Node functions in `api/` using the `(req,res)` signature (`res.status().json()`). There are 3 helpers in `api/_lib/`. Config is in vercel.json (per-function `maxDuration`/`includeFiles`, plus one cron).
- Dependencies (package.json):
  - `@anthropic-ai/sdk ^0.135.0`
  - `@modelcontextprotocol/sdk 1.30.1` (pinned)
  - `@sparticuz/chromium ^153`
  - `puppeteer-core ^25.12`
  - `pdf-lib ^1.17.1`
  - `d3-geo`
  - `topojson-client`
  - dev: `us-atlas`, `world-atlas`
- Build: `node build.mjs` runs the full nightly refresh (network, hours: README.md:55). `node build.mjs --assemble` copies `src/` + `data/` + selected `lib/` into `public/`, copies `pdf-lib` to `public/lib/vendor/`, and writes `public/config.json` with the Supabase publishable key if one is set (build.mjs:23-49). Vercel runs `--assemble` as its buildCommand (vercel.json).
- **Local dev server: none.** There is no `dev`/`start` script and no vercel CLI installed (`which vercel` → not found). README.md:270-277 documents only `DATA_DIR=test/.data/ node build.mjs --assemble && npx serve public`, which is static UI only.
  - With a static server every `/api/*` call 404s (verified below). Projects then fall back to localStorage.
  - Running the functions locally needs `npx vercel dev` (needs a Vercel login and project link) or a small Node shim that maps `/api/<name>` to `import('./api/<name>.js').default(req,res)` with Express-like `res.status/json/send/setHeader` and `req.query/body`. The tests already fake this request/response shape (test/api.mjs).

### 2. Entry points

**api/ functions (46 files), grouped:**

| Group | Functions |
|---|---|
| Projects / site planning | `projects.js` (team sync of project docs), `siteplan.js` (AI program/strategy/review/bestuse/ask/askProject/rules/streetNames; 300 s), `planset.js` (Claude notes, discipline notes, building designs, per-sheet PDF on the title block; 300 s), `pdf.js` (HTML→PDF via Chromium), `render.js` (OpenAI image-edit renderings; 300 s), `terrain.js` (USGS 3DEP grid), `sitefiles.js` (project reference files in Supabase Storage + AI read-out; 300 s), `buildingtypes.js` (team building library), `rulesheets.js` (jurisdiction street rule sheets), `regrid.js` (paid parcels, capped), `building.js` (StratMap parcel + OSM building), `site.js` (flood/traffic/districts/EPA/etc.), `utilities.js`, `entity.js` (Comptroller franchise record), `tenants.js` |
| Market / reports | `markets.js` (live quotes), `brief.js` (AI filing brief), `feed.js` (RSS), `crime.js`, `crimeus.js`, `fema.js` (180 s), `env.js`, `traffic.js`, `devdata.js`, `places.js`, `counties.js`, `news.js`, `nearby.js`, `isochrone.js`, `drive.js`, `airports.js` |
| AI assistant | `chat.js` (OpenAI Responses or Claude via lib/airoute.mjs), `realtime.js` (voice), `search.js` (web search), `models.js`, `aiusage.js`, `pipeline-ai.js` (AI tagging proxy for the GitHub Action) |
| Live layers | `tile.js`, `weather.js`, `imagery.js`, `planes.js`, `planes-sample.js` (cron), `google.js` |
| Team | `field.js` (notes, photos, watchlist) |
| MCP | `mcp.js` → `lib/mcp/server.mjs` (28 tools: site.mjs, area.mjs, reports.mjs) |

Note: README.md:40 lists `ask.js`, which does not exist in `api/`. The docs have drifted from the code.

**src/ app modules.**
- `src/index.html` is the shell. `src/app.js` (1,433 lines) handles map, filters, export and context.
- `src/nav.js:7-15` defines the views.
- `src/siteplan.js` is the Projects page plus the site-plan editor plus the pro forma panel plus renderings plus plan-set jobs.
- Other modules: `src/area.js` (Market view), `src/reports.js` and `src/reportkit.js` (report shell and export history), `src/export.js`, `src/building.js` / `src/site.js` (property card), `src/sitefiles.js`, `src/rulesheets.js`, `src/teamlib.js`, `src/assistant.js`.
- `src/sw.js` is the service worker; `src/sp-worker.js` is the layout worker.

**Build pipeline.**
- `build.mjs` plus `build/*.mjs` (TABS scrape, geocode, OpenAI enrich, change feed, ACS, area/econ, markets), followed by assemble.
- Also present: `build/backfill.mjs` (statewide Supabase load), `build/live-sync.mjs`, `build/crime-library.mjs`, `build/county-data.mjs`, `build/places.mjs`, `build/titleblock.mjs` (makes `templates/titleblock.pdf`), and many `build/probe-*.mjs` diagnostics.

**Cron.**
- Vercel: `/api/planes-sample` every minute (vercel.json `crons`).
- GitHub Actions (7 workflows in `.github/workflows/`):
  - `data.yml`: nightly 09:17 UTC
  - `live-sync.yml`: 3×/day
  - `statewide.yml`
  - `county-data.yml`
  - `crime-library.yml`: Sundays
  - `places.yml`: monthly
  - `probe.yml`
- Schedules only run on the default branch, so none of them run on `experimental`.

**MCP server.**
- `api/mcp.js` is Streamable HTTP, stateless and POST-only. Optional `MCP_ACCESS_TOKEN` bearer is checked with a constant-time compare (api/mcp.js:16-20).
- Tools are in `lib/mcp/server.mjs`: 28 read-only tools.
- The six report tools (`report_flood|environmental|crime|crime_agency|demographics|market`) return a PDF as an embedded resource (README.md:181-187).
- The endpoint is **open when the token is unset**.

### 3. Build / run / test (commands run in this audit)

| Command | Result |
|---|---|
| `npm ci --no-audit --no-fund` | OK: 155 packages, 13 s. |
| `npm run assemble` | OK, 0.26 s. Logged `assemble: supabase config off (no publishable key in env)` and wrote `public/` (gitignored); `git status` stayed clean. |
| Static serve: `python3 -m http.server 47913 --bind 127.0.0.1 --directory public` | `/` 200 (42,835 B, `<title>Real Estate Intelligence Platform — Finishes Solutions`); `/app.js` 200; `/app.css` 200; `/lib/proforma.mjs` 200; `/lib/siteplan.mjs` 200; `/lib/vendor/pdf-lib.esm.min.js` 200; `/data/filings.json` 200 (8.2 MB, 11,032 filings); `/config.json` 200 (`{}`); **`/api/projects` 404** (no function runtime). Server killed afterwards. Port 8765 was already taken by an unrelated Python process. |
| `npm test` (each of the 88 chained commands run one at a time, so a failure would not hide later ones) | See §3a. |
| Lint / typecheck | **None.** No eslint, prettier, tsc, jsconfig or `lint` script. No CI workflow runs `npm test` either; the workflows are data jobs only. |

#### 3a. Test results

**85 of 88 commands pass, 3 fail, about 15.6 min total** (939 s of wall time, run one after another). `npm test` as written stops at the first failure (`test/streetnet.mjs`), which is about 46th in the chain. So **plain `npm test` exits 1 on this Mac**, and the ~40 tests after it never run.

| Failing test | Cause | Code bug? |
|---|---|---|
| `node test/streetnet.mjs` (264 s; **reproduced in a solo re-run**, 245 s, same assert) | `AssertionError: streets deleted: their homes go` at test/streetnet.mjs:169. After deleting 6 streets and running `L.refit(…, {amount:'current'})`, the home count did not drop. The layout's street-network search is wall-clock budgeted (`netBudgetMs`, test/streetnet.mjs:75-76, :104; logs show e.g. "network 15731 of 16776 ms"), so the base layout depends on CPU speed. | **Possibly real.** It fails every time on this machine, but timing-dependence can't be ruled out. Either way the layout engine is non-deterministic across machines, which matters for server-side or report reproducibility. |
| `node test/mcp.mjs` | test/mcp.mjs:290: `report_flood` with `pdfLimit=2000` expected `isError`. Without Chromium at the Linux default `CHROME_PATH` (test/mcp.mjs:241) the "stand-in" PDF is under 2 KB, so the size guard never trips. | **Environment.** Re-run with `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node test/mcp.mjs` → `mcp reports ok (Chromium)`, `mcp tests passed` (19 s). |
| `bash test/countydata.sh` | `date: illegal option -- d` (test/countydata.sh:10 uses GNU `date -d '-40 days'`; macOS ships BSD date) under `set -euo pipefail`. | **Environment** (Linux-only script). |

Everything else passed. That includes the offline pipeline, statewide, live-sync and crime-library shell tests with mocks; `proforma`, `planset`, `sheets-*`, `sitelayout` (174 s), `siteplan` (49 s), `sitepods`, `parkingfield`, `api`, `assistant` and `project`. No test needed network as far as the mocks show: `test/api.mjs` and `test/mcp.mjs` fall back to the real fetch only for unmocked URLs, and mcp's fallback is limited to 127.0.0.1. Afterwards `git status --ignored` shows only `node_modules/`, `public/` and `test/.data/`, all gitignored.

**How the tests work.** They are plain `node:assert` scripts plus 5 bash scripts (`pipeline.sh`, `statewide.sh`, `livesync.sh`, `crimelibrary.sh`, `countydata.sh`) that preload fake `fetch` implementations (`test/mock-net.mjs`, `mock-supa.mjs`, `mock-live.mjs`, `mock-fbi.mjs`, `mock-county.mjs`).

**Caveats:**
- The `npm test` script chains everything with `&&` (package.json), so the first failure stops the run.
- `test/api.mjs:20` and `test/mcp.mjs:136` fall through to the real `fetch` for unmocked URLs (localhost only in mcp). A new unmocked call in api.mjs would quietly reach the internet.
- PDF rendering is **not exercised on macOS**. `test/mcp.mjs:241` and `test/helpers/preview.mjs:7` default `CHROME_PATH` to a Linux Playwright path (`/opt/pw-browsers/chromium-1194/...`); without it, mcp.mjs renders "with a stand-in" (test/mcp.mjs:245).
- `test/intent-eval.mjs` hits the real OpenAI API and is excluded from `npm test`.
- Slow tests: `test/sitelayout.mjs` 174 s, `test/siteplan.mjs` 49 s, `test/sitepods.mjs` 52 s.

---

### 4. Areas

#### (a) Project budgets / cost estimating

**What exists:** only the parametric "Budget" block inside the pro forma (`lib/proforma.mjs` `runM`, lines 318-337). There is **no estimating module**: no line items, no CSI/UniFormat divisions, no quantity takeoff beyond plan areas and counts, no GC general conditions / OH&P / insurance / bonds, no escalation, no sales tax, no permit or impact fee schedule, no estimate versions, no bid or actuals tracking. The plan set carries **no cost data** (no "cost" in lib/planset.mjs or lib/sitesheet.mjs; lib/sheets/* mention cost only in a TDLR threshold note, lib/sheets/arch.mjs:1088).

**Budget lines:**
- Land
- Hard (gsf × $/sf by use)
- FF&E (hotels)
- Site:
  - lots
  - prep
  - paving
  - stalls
  - deck
  - pond
  - vault
  - amenities
  - food-truck stalls
- TI
- LC
- Soft (% of hard+ffe+site)
- Contingency (% of hard+ffe+site)
- Developer fee
- Construction interest
- Loan fees

These come from `lib/proforma.mjs:386` (`R.budget`) and export as the "Budget" sheet (lib/proforma.mjs:531).

**Quantities come from the concept plan** (`metricsOf`, lib/proforma.mjs:137-163):
- building gsf by use
- units and mix
- stalls
- deck spaces
- paved / parking / truck sf
- detention / vault ac-ft
- amenity sf
- developed sf = min(site − future − keepout, improved × 4/3)

**Hardcoded cost rates** (all "2026 Houston/Katy/Waller suburban", tagged `UNVERIFIED`, lib/proforma.mjs:35-40):

| Item | Value | Location |
|---|---|---|
| Hard cost $/gsf (`HARD`) | multifamily 120, townhomes 115, duplex 110, sfr 100, retail 115, restaurant 170, office 175, medical 210, hotel 180, church 170, industrial 65, storage 68, foodtrucks 175, fuel 275, amenity 200, other 150 | lib/proforma.mjs:44-61 |
| Storage hard | climate 68, drive 38, office 150 | :62 |
| Pavilion | 90 | :63 |
| `SITE` | sitePrepPsf 3.0, pavingPsf 7.5 (truck court ×1.25), stallCost 2,750, deckPerSpace 27,500, pondPerAcFt 30,000, vaultPerAcFt 420,000, lotCost 55,000, amenityPsf court 20 / pool 110 / play 30 | :65-74 |
| `TI` $/leasable sf | retail 35, restaurant 70, office 65, medical 90, industrial 4, other 30 | :89 |
| `LC_PCT` | 4.5% of first-term base rent | :91 |
| Lease terms (yrs) | retail 10, restaurant 10, office 7, medical 10, church 15, industrial 7, other 10 | :90 |
| Fuel | canopyPsf 60, pumpCost 45,000, tankCost 350,000 | :105 |
| Hotel FF&E | 18,000/key | :88 |
| Food-truck stall | 18,000 | :113 |
| Soft % | 12 (industrial 8, storage 9) | :239 |
| Contingency % | 5 | :239 |
| Developer fee % | 4 | :239 |
| Land closing % | 1.5 | :233 |
| Land $/ac fallback (`LAND_AC`) | multifamily 200k; townhomes/duplex 175k; sfr 150k; industrial 195k; storage 260k; church 175k; fuel 650k; retail/restaurant/office/medical/hotel/foodtrucks 350k; other 300k | :131 |
| Site-prep halving | ×0.5 when lots are present; ×0.5 for a fuel ground lease; `lots*7000` sf excluded | :330 |
| Lot equivalents | sfr 1, duplex 0.5, townhome 0.6 | :327 |

**Land price bug-risk:** `landGuess` takes `r.marketValue || r.landValue` (src/siteplan.js:2980-2981). Appraised **market value includes improvements**, so an improved parcel's land basis is overstated. Land should come first. No acquisition costs beyond the 1.5% closing are modeled.

Sanity ranges for every input (`RANGES`, lib/proforma.mjs:420-435) only produce soft notes.

**Verdict: demo-quality / order-of-magnitude.** It is a well-documented parametric feasibility budget (about 15 unit rates), not a project budget or estimate. Every rate is one static number with no regional or date index, even though the app already pulls PPI construction-cost series nightly (lib/markets.mjs:44-48) and never uses them in costs. This is the main gap the budgeting-suite merge has to fill.

#### (b) Pro forma / financial modeling — `lib/proforma.mjs` (545 lines)

**What it does:** two methods (header lines 3-11).

1. **Schedule model** (default; `runM`, :313-391). Monthly, from pre-development through construction, lease-up, permanent refinance, hold and sale. It covers for-sale homes (absorption), multifamily, BTR, NNN commercial with recoveries, hotel (ADR × occupancy), self storage, gas station (ground lease or owner-operated), food truck park and churches (tax-exempt).
2. **`simple()`** (:397-407): a TestFit one-page annual method. `test/proforma.mjs:7-14` reproduces TestFit's "The Commons Plaza" sheet to the dollar (cost 40,240,000; NOI 12,798,441; levered IRR 114.44%).

**Inputs and outputs:**
- Inputs: plan metrics (`metricsOf`) or compact scenario numbers (`compactMetrics`, :167-181), defaults (`defaultsFor`, :224-255), and user overrides stored on `plan.pf` (src/siteplan.js:2983).
- Outputs: `{A, P, M, area, sched, budget, sources, ops, exit, returns, forSale, annual, monthly, simple, basis, warnings}` (:385-389).
- Other entry points: `proFormaSummary` (:487), `quick()` (layout ranking, :539), `checks()` notes (:462-477).
- Stage gate: "Pro forma" is stage 3 of 4 (lib/planstages.mjs:13), with a fingerprint `pfSig` (:22).

**Excel export:** `workbook(R)` (:498-534) returns AOA sheets `Assumptions`, `One page (TestFit method)` (live formulas: PMT, PV, IRR), `Schedule model` (monthly rows plus annualized IRR formula), and `Budget`. It is written in the browser with SheetJS from the CDN (src/siteplan.js:3068-3071). I checked the formula row references (rows 3-35 of the one-page sheet; `first=11`/`last` in the schedule sheet) and they are consistent.

**Hardcoded revenue and finance assumptions** (all UNVERIFIED market defaults):

| Item | Value | Location |
|---|---|---|
| `RENT_COMM` $/sf/yr NNN | retail 26, restaurant 36, office 22, medical 32, industrial 7.75, church 0, other 22, hotel 0, storage 0 | :75-84 |
| `RENT_UNIT` $/mo | Studio 1,175; 1BR 1,425; 2BR 1,795; 3BR 2,150 (else sf×1.75) | :109, :240 |
| `RENT_HOME` | townhomes 2,550; duplex 2,100; sfr 2,200 / 2,650 / 2,850 by stories | :106 |
| `townhomeRent` | 1000 + 0.78 × living sf | :107 |
| `SALE_PSF` | townhomes 185, duplex 175, sfr 165 | :108 |
| `STORAGE_PF` | climate $1.35/sf/mo, drive $0.95, RV $125/mo, RV opex $120/yr | :85 |
| `RV_PARK` | $550/mo, opex $2,400 | :86 |
| `HOTEL_PF` | ADR 135, occupancy 68%, other 6%, opex 57%, mgmt 3%, FF&E reserve 4% | :88 |
| `FUEL_PF` | ground rent $22,500/pump (min 100k), 160,000 gal/pump at 30¢, inside $450/sf at 32%, wash $250k/yr, opex 55% | :105, :244 |
| `FT_PF` | stall $1,200/mo, bar owner-run $700/sf at 18%, or lease $30, opex $2,400/stall + $40k | :113 |
| `CAP` (going-in %) | mf 5.5, th/sfr 5.5, duplex 6.0, retail 6.75, restaurant 6.25, office 8.25, medical 6.75, hotel 8.5, church 8.0, industrial 6.0, storage 5.75, foodtrucks 8.0, fuel 5.5 (owner-run 8 / exit 8.25, :317), other 7.5; exit = market + 0.25 | :114-129, :252 |
| `VACANCY` % | mf 7, th 6, duplex 6, sfr 5, retail 5, restaurant 5, office 10, medical 7, church 5, industrial 5, storage 11, foodtrucks 10, fuel 0, other 7 | :132 |
| Credit loss | 1% (fuel 0) | :246 |
| `OPEX_PSF` | retail/restaurant 4.75, office 9.0, medical 9.5, church 4.0, industrial 1.25, storage 2.75, other 5.0 | :133 |
| opexPerUnit / opexPerHome | 4,600 / 3,200 | :247 |
| Reserves | $250/unit, $0.20/sf | :248 |
| otherPerUnit | $75/mo | :240 |
| recoveryPct | 95 | :242 |
| Property tax | taxPct 2.5 on 70% of total budget | :249 |
| mgmtPct | 3 (storage 6, homes 5) | :250 |
| Construction loan | ltc 60, rate 7.0, loanFeePct 1 | :251 |
| Permanent loan | permRate 6.0, amort 30, ltv 65, dscr 1.25, refi true | :251 |
| Exit / growth / hold | dispPct 2; rentGrowth 3 (residential) or 2.5; expGrowth 3; hold 5 | :252 |
| For-sale | absorption 4/mo, commission 6% | :241 |
| `EFF` | retail/restaurant .97; office .85; medical .84; industrial/church 1.0; other .95; fuel .97; townhomes .85; duplex .9; sfr 1.0 | :93-98 |
| `LOAD` | office 1.12, medical 1.15 | :99 |
| Cap-rate weighting stand-ins (`noiW`) | 11,000/mf unit, 15,000/home, 9,000/key, 200,000 fuel, storage 9/sf | :227 |
| Schedule heuristics (`scheduleFor`) | pre 9 mo residential / 6 commercial; build per formula, capped 26/30/16/14 mo; lease-up per formula (storage 30 mo) | :210-217 |

**Defects and inconsistencies found:**
- **Market data never feeds the model.** No rate or rent link exists: FRED Treasury, SOFR and mortgage rates, Zillow ZORI rents and PPI costs are fetched nightly (build/econ.mjs:2-5, lib/markets.mjs:44-48) but defaults are static (:231-253).
  - The one place a ZIP rent is meant to reach the AI, "best use" (src/siteplan.js:3713), reads `parcel.situsZip || parcel.zip`.
  - Project parcel records built by `parcelOf` (src/siteplan.js:206-208) keep only `key,label,owner,propId,marketValue,landValue,acres,center,geometry`, so that lookup is **always empty**.
  - `api/building.js:62` does return `situsZip`; it is dropped at intake.
- **"profit" means three different things:**
  - `returns.profit` = levered distributions − contributions (:388)
  - `proFormaSummary.profit` = value − cost (:491)
  - `quick().profit` = value − cost (:543)
  - `finOf` mixes `simple.profit` (levered) with schedule `r.profit` (lib/planruns.mjs:98)
- Exit value and perm sizing grow **NOI at the rent-growth rate** (`noi * g(...)`, :368, :377), while the monthly NOI grows revenue and expenses separately (:357).
- Rents are **not trended** through pre-development and construction: growth starts at T1 (:352).
- During lease-up, NOI above that month's costs goes out as an equity distribution while the construction loan is still outstanding (:363-365, `cash -= need`). It does not pay down the loan.
- Equity requirement is `budget × (1−LTC)` excluding interest and fees (:359). Interest and fees are 100% loan-funded, so the effective LTC is above the input. It is reported as `sources.ltc` (:387).
- Property tax is based on the full development budget including land, soft costs and fee (:341). It is not an assessed-value model.
- IRR: monthly bisection on [-0.9999, 10] with 300 iterations, annualized as (1+m)^12−1 (:258, :379). It returns `null` when the bracket has no sign change. There is no NPV / discount-rate output at all.

**Verdict: realistic in structure (better than most demo pro formas), demo-quality in inputs.** The engine is a credible single-scenario development model with a monthly draw schedule, a capitalized-interest construction loan, a lesser-of-LTV/DSCR refi and a TestFit cross-check. What it lacks:
- sources-and-uses waterfall / promote
- NPV
- sensitivity tables
- scenario versioning beyond per-option `pf`
- market-linked inputs
- cost-estimate linkage

#### (c) Site layout

**What exists (substantial):**
- Parcel intake from a property card: up to 20 parcels (`MAXP`, src/siteplan.js:201).
- `SP.bridgeParcels` joins gaps up to 200 ft (`BRIDGE_FT`, lib/siteplan.mjs:232) and keeps road strips as keep-outs (src/siteplan.js:215-232).
- `SP.unionParcels` is a grid merge snapped to parcel corners (lib/siteplan.mjs:283).
- Frontage comes from map roads (`frontFromRoads`, :374). Setbacks become an inset ring (`edgeRules`/`insetRing`, :394-402).
- Layout engine: `lib/sitelayout.mjs` (2,310 lines) builds the drive network first, then parking rows, buildings, pads and truck courts. It searches block stacks and always returns three options that pass `check` (`layoutOptions`, :1372). It also does pods/neighbourhoods (`lib/sitepods.mjs`, `lib/streetnet.mjs`), fuel (`lib/sitefuel.mjs`) and food trucks.
- `refit` keeps pinned pieces (:2235). A worker runs in the browser (`src/sp-worker.js`).
- `metrics()` (lib/siteplan.mjs:1979-2041) computes:
  - site sf and acres, footprint, GFA
  - coverage (incl. canopy), FAR
  - spaces vs required (per use; ADA loss), deck, garages
  - units, mix, beds
  - impervious and green %
  - height, du/ac, leasable/sellable (nrsf)
  - Phase-1 parking share
- Also: stormwater sizing (`stormNeed`/`stormOf`, :2677-2703), trash (`trashNeeds`, :2725), ADA counts (`adaCount`, :2805), paving union (`pavement`, :2621), DXF export (`toDXF`, :3067).
- AI is used only for program, strategy and review (api/siteplan.js:1-25). Geometry always comes from the engine ("the model never draws geometry", README.md:27).
- Jurisdiction rule sheets: `lib/rulesheet.mjs`. Waller guardrails with A/B/C scenarios and VERIFIED / OWNER / ENGINEERING / UNVERIFIED classification: `lib/guardrails.mjs:19-85`.

**Hardcoded values:**

| Item | Value | Location |
|---|---|---|
| `SETBACKS` | front 25, side 10, rear 20, paving 10 ft | lib/siteplan.mjs:62 |
| `STALL` | 9×18, aisle 24 | :162 |
| `DRIVE_W` | 26 | :163 |
| `PARAMS` | stallW 9, stallD 18, aisle 24, bldgDepth 60, maxLen 260, bldgGap 30 | lib/sitelayout.mjs:36 |
| Parking ratios /1,000 sf | retail 4, restaurant 10, office 3.5, medical 5, hotel 1.82/room, church 10, industrial 0.6, storage 0.1, fuel 4, foodtrucks 8, other 3 | lib/siteplan.mjs:42-58 |
| Parking per unit | multifamily 1.6/unit, townhomes 2 + 0.25 guest, duplex 2, sfr 2 | lib/siteplan.mjs:42-58 |
| Hotel | 550 gsf/room | :47 |
| `UNIT_MIX` | Studio 550 sf 10%, 1BR 760 45%, 2BR 1,100 35%, 3BR 1,350 10% | :65 |
| `HOME_TYPES` | 1,900 / 2,600 / 3,000 sf | :67 |
| `STORAGE` | climateEff .72, driveEff .92 | :72 |
| Garage | 330 sf/space | :1510 |
| `STORM` | depth 5 ft; rate = Waller sheet `detention` 0.55 ac-ft/ac, flagged *unsure*: "rate not read; 0.55 (typical Harris County) stands in" | :2674; lib/rulesheet.mjs:72 |
| Other Waller rule-sheet values | many marked `TYPICAL` / unsure | lib/rulesheet.mjs:54-73 |
| Waller guardrails | lots 57×114 (Ord. 424); detention owner floor 1.0 ac-ft/ac; depth 4 ft; slopes 4:1; fire lane 26 ft; flood reserves 10/25/35%; ROW reserve 10 ft; factor 5% | lib/guardrails.mjs:47-85 |

**Verdict: realistic for concept test-fits.** This is the strongest part of the repo. Limits:
- Parcel geometry comes from appraisal-district outlines, not a survey.
- Setbacks and ratios are generic outside Waller.
- No zoning lookup except Regrid on demand.
- No utilities or grading design.

#### (d) Plan sets

**What exists:**
- `lib/planset.mjs` (309 lines) defines 12 sections: General, Civil, Landscape, Arch, Structural, M, P, E, Fire, Fuel, Renderings, Telecom (:28-41). `BUILT_PHASE = 4`, so everything except Telecom is on by default.
- `sheetList` produces numbered sheets, e.g. G-001/002/003, C-001…C-501, L-101/501, A-1xx per building type, A-501, S/M/P/E/FP/F/T sheets, A-9xx renderings (:58-104).
- Sheet renderers: `lib/sheets/site.mjs` (1,039 lines), `arch.mjs` (1,107), `eng.mjs` (1,355), `fuel.mjs` (401).
- Building floor plans: `lib/plandesign.mjs` covers sfr, townhomes, duplex, retail, restaurant, office, medical, church, industrial, fuel, amenity, foodtrucks, other. Multifamily, hotel and storage are **"LATER"** (:16-17), so they get no arch sheets.
- Claude writes cover and discipline notes and building designs (api/planset.js:1-20; default model per README.md:195). Designs are checked by code with up to 2 retries, then fall back to rule-based (lib/plandesign.mjs:1-5).
- Title block: `lib/titleblock.mjs`, with field coordinates on the AutoCAD border `templates/titleblock.pdf` (PAGE 2592×1728 pt). `FIRM_NUMBER_ON = false` (:26). The PRELIMINARY stamp text is at :30-33.
- PDF pipeline: the browser draws each sheet's HTML. It POSTs `mode:'sheet'` to `api/planset.js`, which renders through `lib/pdf.mjs` (puppeteer-core + @sparticuz/chromium, scripts disabled, private hosts blocked, :26-32) and lays the result on the border with pdf-lib (`onBorder`, api/planset.js:41-48). The browser then merges all pages with pdf-lib (src/siteplan.js:4617, :4824).

**Placeholders (explicit):**
- lib/sheets/fuel.mjs:174, :221, :248, :353: tank, pipe, conduit and member sizes are "placeholders".
- lib/sheets/site.mjs:639: detention "method and rate are placeholders".
- lib/sheets/site.mjs:705-706: utility routes, sizes and transformer locations.
- lib/sheets/site.mjs:751: erosion-control BMP locations.

**Budget defaults:** `PLANSET_MONTHLY_CAP_USD` default $100 (api/planset.js:33). Renderings `RENDER_MONTHLY_CAP_USD` default $100 (api/render.js header).

**Persistence gap:**
- The plan-set job and its pages live in the browser's **IndexedDB** (`job:<pid>`, `jp:<job>:<sheet>`, `set:<id>`; src/siteplan.js:4640-4643).
- **"sets stay on the device they were made on"** (src/siteplan.js:4727). Only a small issue record (`pl.sets`) syncs.
- Renderings are also IndexedDB-only (src/siteplan.js:4050-4054).
- There is no server-side job runner; a set "can take most of an hour" in an open tab (src/siteplan.js:4618).

**Verdict: realistic-looking schematic-design output; architecturally fragile.** The drawings are clearly labelled preliminary and are extensive. But generation is client-orchestrated and output is unshareable device-local blobs. That is a blocker for a team "report set" flow.

#### (e) CRE market research and reports

**What exists:**
- Market view (`src/area.js`, `lib/marketstats.mjs`, `lib/marketcalc.mjs`) with nightly free public data in `data/area.json`. Keys: `built, counties, jobs, permits, businesses, salesTax, rates, unemployment, rents, mortgages, newsPlaces, news, countyJobs`. Sources:
  - LODES jobs
  - Census BPS permits
  - Comptroller sales-tax permits and allocations
  - FRED rates and SOFR
  - BLS LAUS
  - Zillow ZORI
  - HMDA
  - Google News
- `data/market.json`: ACS tracts plus modeled consumer spending (BLS CE).
- `data/markets.json`: Yahoo / FRED / Coinbase series, including PPI construction-cost series and a correlation explorer (lib/markets.mjs).
- Live sources: crime (HPD NIBRS in Supabase; FBI CDE), FEMA NFHL / NFIP / NRI, TCEQ / EPA / RRC environmental screening, TxDOT AADT, airports and flights.
- Report builders: `lib/reports/{crime,crimeus,demographics,env,fema,market}.mjs`. They are DOM-free and share `src/reportkit.js` (letter-size HTML) and `lib/pdf.mjs`.
- Exports (src/export.js:10-13):
  - Summary
  - Filing list
  - Area comparison
  - Activity
- Report history is kept in **this browser only** (localStorage + IndexedDB, newest 50 / ~150 MB; src/reports.js:2-3, lib/reports.mjs:4).
- MCP report tools return PDFs under 3 MB, capped to 24 map tiles and 500 rows (README.md:187).

**Hardcoded or deliberately absent:**
- **No sale or lease comps by design** (README.md:83: "Texas does not disclose sale prices… needs a licensed provider").
- So there is no cap-rate, comp or rent-survey data feeding the pro forma.
- Other hardcodes:
  - `OUTLIER = 2e9` filing cutoff (lib/marketcalc.mjs:7)
  - Houston crime box (lib/mcp/area.mjs:268)
  - FRED series id lists (lib/reports/market.mjs:12-13)
- Consumer spending is **modeled**, not measured (README.md:85).

**Verdict: realistic and well sourced for public-data market context and site-risk reports.** No development-feasibility report exists: nothing combines project, site, layout, pro forma and plan set into one deliverable. The CRE report-runner merge would be additive here.

#### TODO / FIXME / stub scan

`grep -i "TODO|FIXME|XXX|HACK|stub|mock|dummy|coming soon"` over lib/, api/, src/, build/ finds **no TODO/FIXME/HACK markers**. The "stub" hits are geometry terms (dead-end aisles). "mock" appears only in test/ and in a street name. Mocks live in `test/mock-*.mjs`.

**Disclosed unfinished work:**
- MASSING-PLAN.md:3 ("Nothing here is built yet")
- NEIGHBORHOOD-PLAN.md:3 (proposal, partly built)
- RENDERINGS-PLAN.md:3 (phase A/B1 only)
- PLANSET-PLAN.md:3 (phase 5 pending: apartments, storage, hotels, batch) and :9 (no human review gate)

**Hardcoded infra:**
- The Supabase project URL `https://ytsxkipkobvcgysylfzc.supabase.co` is the fallback in api/places.js:13, api/google.js:15, api/planes.js:24, api/field.js:16, api/planes-sample.js:16, api/devdata.js:12, api/airports.js:15, lib/mcp/area.mjs:28, build.mjs:45 and 6 workflows.
- A browser MapTiler key is hardcoded at src/app.js:57 (value not reproduced).
- The GitHub repo `finishes-solutions/fs-real-estate-intelligence` is hardcoded in supabase/functions/pipeline/index.ts:6.
- The production URL is in workflows (`AI_PROXY_URL` default).

---

### 5. Data model

There is no schema layer: everything is untyped JSON documents. Shapes as built in code:

**Project** (src/siteplan.js:234 `newProject`; lib/project.mjs:1-14). Stored as one JSON doc per project:
- `{ id, name, notes, parcels: [Parcel], plans: [Plan], created, by }`
- plus `status` (prospect | review | contract | owned | hold | dead, lib/project.mjs:8-11), `client`, `use`
- `site: { at, key, facts }` (jurisdiction facts from `siteFactsFrom`, lib/project.mjs:27-44)
- `files` (reference-file records + AI-read facts, src/sitefiles.js)
- `updated`

Tabs: overview, options ("Sites"), renderings, plans, files, ask (lib/project.mjs:14).

**Parcel (project copy)** (src/siteplan.js:206-208):
- `{ key, label, owner, propId, marketValue, landValue, acres, center:[lon,lat], geometry (GeoJSON, 7-dp) }`, optionally `regrid` (lib/project.mjs:47-50).
- The richer card record from `api/building.js:59-68` (`situsStreet/City/Zip, county, landUse, improvementValue, yearBuilt, acquired, taxYear, buildingSqft, stories, raw`) is **mostly dropped at intake**.

**Plan / option** (lib/siteplan.mjs:3124-3126, src/siteplan.js:192):
- `SITE_KEYS`: `origin, ring (ft, CCW), src, front, frontGuess, streets, streetsSet, streetsBy, setbacks, parcel, parcels, zoning, jur`
- `DESIGN_KEYS`: `elements, zones, recipe, variant, lastRun, stale, spareRows, params, program, pf, laidAs`
- `OWN_KEYS`: `id, name, created, updated, renders, view`
- plus `stages` (lib/planstages.mjs) and `sets` (plan-set issue records)
- **Element** (lib/siteplan.mjs:5-8): `{ id, kind (building|parking|drive|truck|pond|green|plaza|court|pool|play|trail|trash|garage|keepout|canopy|…), x, y, w, d, rot, floors?, use?, units?, poly?/path?, pinned?, phase? }`
- **Program**: `normalizeProgram` (lib/siteplan.mjs:1597), e.g. `{ use, floors, buildings, gfa, units, unitSf, ratio, perUnit, mix, zones:[{use,gfa}], stormwater, custom, … }`

**Pro forma inputs and outputs:**
- Inputs: `plan.pf` holds user overrides only. Defaults are rebuilt on every run from `defaultsFor` (lib/proforma.mjs:224-255): keys `method, forSale, landPrice, landPerAc, landClosingPct, hard{}, storageHard{}, sitePrepPsf…amenityPsf{}, ti{}, lcPct, eff{}, load{}, softPct, contPct, feePct, rents{}, otherPerUnit, homeRent{}, salePsf{}, absorption, commissionPct, commRent{}, recoveryPct, storageRent{}, hotel{}, fuel{}, ft{}, vacancyPct, creditPct, opexPerUnit, opexPerHome, opexPsf{}, reservesPerUnit, reservesPsf, taxPct, taxBasisPct, mgmtPct, ltc, rate, loanFeePct, refi, permRate, amort, ltv, dscr, exitCap, marketCap, dispPct, rentGrowth, expGrowth, hold, sched{pre,build,lease}`.
- Output: see §4b. **Pro forma results are not persisted**; they are recomputed client-side.

**Plan set:**
- Request: `{ sections[], renders, types }` → `sheetList`
- Server API: `mode: notes|disc|design|sheet|pdf`
- Persisted: only `pl.sets` issue records (id, no, sheets, by, when, model). PDFs and pages are device-local (§4d).

**Report:** HTML string from `lib/reports/*.mjs` + `reportDoc`, then PDF. The history record `{ id, size, stored, … }` is in localStorage, the file in IndexedDB (src/reports.js).

**Persistence:**
- Browser: localStorage `fs-projects-v1` (`{projects, dirty, gone}`, src/siteplan.js:42, :91-95; it lightens runs when quota is hit). IndexedDB `fs-renders` (renderings, terrain grids, plan-set jobs and PDFs; src/siteplan.js:4053).
- Server: `api/projects.js` stores each project doc whole in Supabase `site_projects` (`id text pk, name, doc jsonb ≤ 600 KB, deleted, updated_by, updated_at`; supabase/migrations/20261018000000_site_projects.sql:4-14).
  - RLS is on with no policies; access is through the secret key only.
  - Writes are **last-edit-wins by client `updated` timestamp** (api/projects.js:36-41). Deletes are tombstoned.
  - Max 500 KB / 100 projects per POST; GET returns the latest 500 (api/projects.js:9, :28, :33).
- **No auth:** there are no users or orgs. The optional shared passcode `FIELD_ACCESS_CODE` (api/projects.js:22-23) is the only gate. Identity is a typed name (`by`, `updated_by`).
- No relational tables for parcels, options, budgets or pro formas.
- Related tables: `site_building_types`, `site_rule_sheets` (migrations 20261023/20261024); bucket `site-files`.

### 6. Formulas (`lib/proforma.mjs`)

Notation: A = assumptions, P = `areaOf(M, A)`, T0 = pre, T1 = T0 + build, T2 = T1 + lease, T = T2 + 12·hold (for-sale: T1 + ceil(homes/absorption) + 1). See :348.

**Area.**
- Retail/NNN: nrsf = gsf × eff.
- Office/medical: min(gsf, gsf × eff × load).
- Multifamily: Σ(n × unit sf) from the mix.
- Homes: gsf × eff.
- Storage: climate × .72 + drive × .92.
- Hotel: keys = gsf / 550.
- (:185-205)

**Costs** (:318-337):
- hard = Σ gsf_use × hard_use (+ storage split, pavilion, owner fuel equip = canopySf × 60 + pumps × 45k + 350k)
- ffe = keys × 18k
- site:
  - lots × lotCost
  - prep: max(0, devSf − lots × 7000) × sitePrepPsf (×0.5 with lots, ×0.5 for a ground lease)
  - paving: (pavedSf + truckSf × 1.25) × pavingPsf × (1 − homeShare if lots)
  - stalls × stallCost
  - deck × deckPerSpace
  - pond ac-ft × pondPerAcFt × notHome
  - vault ac-ft × vaultPerAcFt
  - amenities
  - truck stalls
- ti = Σ commercial nrsf × TI_use
- lc = Σ NNN nrsf × rent × leaseTerm × lcPct
- land = landPrice × (1 + closing%)
- soft = (hard + ffe + site) × soft%
- cont = (hard + ffe + site) × cont%
- pre = land + hard + ffe + site + ti + lc + soft + cont
- fee = (pre − land) × fee%
- **budget** = pre + fee
- **total cost** = budget + capitalized interest + loan fees (:380)

**Operations** (stabilized, today's rents; `stabilized` :263-297 and :340-346):
- GPR = Σ rent lines + other income + recoveries
  - recoveries = (NNN opex + NNN share of tax) × recovery%
- loss = (GPR excl. hotel) × (vac + credit)
- EGI = GPR − loss
- tax = taxPct × budget × taxBasis% × (1 − church share); 0 for a ground lease
- opex = residential (units × (opexPerUnit + reserves) + homes × (opexPerHome + reserves)) + commercial (recoverable + storage / food-truck / hotel opex + reserves) + tax + mgmt
  - mgmt = non-hotel revenue × (1 − vac − credit) × mgmt%
- **NOI** = EGI − opex

**Schedule** (:350-352):
- land at t0
- soft: 35% spread evenly over (0, T0], 65% over (T0, T1]
- hard + site + cont on a sin² S-curve over (T0, T1]
- ffe over the last 2 build months
- ti + lc over (T1 − 2, T2]
- fee: ½ at T0, ½ at T1
- Growth factors g(t) = (1 + rentGrowth)^floor((t − T1)/12) and ge(t) the same with expGrowth. Both are flat before T1.
- Lease-up NOI_t = [EGI × occ_t × g − (opex − mgmt) × ge − mgmt × occ_t × g] / 12, with occ_t = min(1, (t − T1)/lease) (:357).

**Financing** (:359-375):
- Equity first up to budget × (1 − LTC), then the construction loan.
- Loan fee = budget × LTC × fee%, added at the first draw.
- Interest = loan × rate/12 monthly, capitalized while t ≤ T2 (for-sale: until repaid).
- Lease-up NOI offsets that month's costs; any surplus is distributed.
- At T2, refi: fwd = NOI × g(T2 + 1); perm = min(fwd / marketCap × LTV, (fwd / DSCR) / (12 × pmt(permRate/12, amort × 12, 1))).
  - refiOut = perm − loan goes to equity.
  - If `refi` is off, perm = loan.
- Thereafter monthly P&I amortizes; levered CF = NOI − payment.
- For-sale: each home's price × (1 − commission) closes from T0 + 5 at the absorption pace. Proceeds repay the loan first.

**Exit** (:377):
- price = NOI × g(T + 12) / exitCap
- net = price × (1 − disp%)
- levered gets net − loan payoff

**Returns** (:379-388):
- Unlevered CF_t = −cost_t + NOI_t + sales_t
- Levered = cash_t − equity_t
- IRR = bisection on monthly flows, annualized (1 + m)^12 − 1
- YoC = NOI / total cost
- spread = YoC − marketCap
- value = NOI / marketCap
- DSCR = NOI × g(T2 + 1) / (12 × permPmt)
- CoC = (NOI − 12 × permPmt) / equity
- multiple = Σ positive levered / Σ negative levered
- profit = Σ positive − Σ negative levered
- for-sale margin = (sales − total cost) / sales
- **No NPV and no discount rate anywhere.**

**`simple()`** (TestFit, annual, :397-407):
- cost = land + hard + ti + soft + hard × cont% + finFee
- debt = cost × LTC; equity = cost − debt
- ds = pmt(rate, amort, debt), annual
- Stabilized year:
  - base = nrsf × rentPsf
  - rec = nrsf × opexPsf × rec%
  - other = nrsf × otherPsf
  - GPR = base + rec + other
  - EGI = GPR × (1 − vac)
  - NOI = EGI − nrsf × opexPsf
- Year y (1..hold): base and other × (1 + rg)^y, rec and opex × (1 + eg)^y (year 1 is already grown).
- sale = NOI_hold × (1 + rg) / exitCap
- bal = ds × (1 − (1 + r)^−(amort − hold)) / r
- Annual IRRs on [−cost, NOI…] and [−equity, CF…]; YoC and DSCR use the stabilized NOI.
- From the schedule model (`simpleInputs`, :409-414):
  - finFee = **developer fee** (not a financing fee)
  - hard = hard + ffe + site
  - ti = ti + lc
  - rate = permRate
  - amort = min(amort, 25)
  - opexPsf includes taxes and management
  - recovery% is rescaled to the share of opex

### 7. Infrastructure inventory (platform's own)

**Hosting:**
- Vercel project `fs-real-estate-intelligence`. Production URL `https://fs-real-estate-intelligence.vercel.app` (README.md:172). Deployment Protection is on (README.md:174).
- Functions run up to 300 s.
- Vercel limits: 4.5 MB request/response bodies (noted in api/pdf.js:11, api/planset.js:32).

**Database:** Supabase project `ytsxkipkobvcgysylfzc` (Postgres + PostGIS + PostgREST + Storage + Edge Functions). 27 migrations.
- Tables:
  - `filings, counties, changes, runs, geocode_cache` (+ tabs/ai caches)
  - `news_articles, filing_news, imagery_passes, weather_daily, storm_advisories, tracts`
  - `field_notes, team_watchlist, watchlist, team_domains`
  - `regrid_parcels, regrid_counties, regrid_usage`
  - `air_cells, air_days, air_profile, air_profile_samples, aircraft_registry, airports, airport_runways, airport_frequencies, airport_extras, airport_ops_daily, airport_ops_state`
  - `crime_incidents, crime_city_stats, crime_agencies, crime_agency_years, crime_area_years`
  - `places, places_loads, google_usage, dev_items, county_loads, ai_usage`
  - `site_projects, site_building_types, site_rule_sheets`
- About 48 SQL functions: `crime_*, regrid_take, google_take, ai_usage_add, places_*, dev_*, airports_*`, etc.
- Buckets: `field-photos` (private, 10 MB, images) and `site-files` (private, 20 MB, pdf/png/jpeg/dxf/text/csv; signed URLs only; supabase/migrations/20261025000000_site_files.sql:6-9).
- Edge function `supabase/functions/pipeline` (GitHub-OIDC-authenticated PostgREST proxy limited to pipeline tables).
- **No job queue or worker.** Long work runs in GitHub Actions (data) or in the user's browser tab (plan sets, renderings, layouts). No Redis or KV.

**PDF:** puppeteer-core + @sparticuz/chromium on Vercel (`lib/pdf.mjs`), `CHROME_PATH` locally. pdf-lib on the server and in the browser. Fonts are Montserrat and IBM Plex Mono in `fonts/`.

**Env var names** (from api/, lib/, build/, workflows, README):
- **Supabase:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (legacy), `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_*` (build.mjs:45-46)
- **OpenAI:**
  - `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_CHAT_MODEL`, `OPENAI_CHAT_REASONING_EFFORT`, `OPENAI_ENRICH_MODEL`
  - `OPENAI_SEARCH_MODEL`, `OPENAI_REALTIME_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_VOICE`, `OPENAI_IMAGE_MODEL`
  - `OPENAI_ADMIN_KEY`, `OPENAI_PROJECT_ID`, `OPENAI_API_KEY_ID`
  - `VOICE_ENABLED`, `RENDER_MONTHLY_CAP_USD`, `RENDER_FALLBACK_USD_PER_IMAGE`
- **Anthropic:** `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`, `PLANSET_MONTHLY_CAP_USD`
- **Regrid:** `REGRID_API_KEY` / `REGRID_TOKEN`, `REGRID_RECORD_CAP` (1,800), `REGRID_TILE_CAP` (180,000), `REGRID_TILE_URL`
- **Google:** `GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_KEY`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_AUTOCOMPLETE_CAP`, `GOOGLE_DETAILS_CAP`
- **Other providers:** `MAPTILER_KEY`, `TOMTOM_API_KEY`, `MAPILLARY_TOKEN`, `OPEN_METEO_API_KEY`, `CENSUS_KEY`, `BLS_KEY` / `BLS_API_KEY`, `GOV_API_KEY`, `FBI_API_KEY`, `SOCRATA_APP_TOKEN`, `HF_TOKEN`
- **Access, cron, webhooks:** `FIELD_ACCESS_CODE`, `MCP_ACCESS_TOKEN`, `CRON_SECRET`, `ZAPIER_DIGEST_WEBHOOK`, `AI_PROXY_URL`
- **Build knobs:** `ONLY, PERIOD_START/END, REBUILD_*, ALLOW_SHRINK, AI_MAX_ROWS, AI_CONCURRENCY, AREA, AREA_NEWS_TOWNS, MODE, COUNTIES, MAX_*, DATA_DIR, CHROME_PATH, OVERPASS_URL, PARCEL_SERVICE, ADDRESS_POINTS_SERVICE`, etc.
- **There is no `.env.example`.** CLAUDE.md requires one for the integration.

**Third-party APIs:**
- **Paid / keyed:**
  - OpenAI (chat, Responses, Realtime, web search, image edit, enrichment)
  - Anthropic (plan sets; optional chat via lib/airoute.mjs)
  - Regrid
  - Google Maps Platform
  - MapTiler
  - TomTom
  - Mapillary
- **Free public:**
  - TDLR TABS
  - Census (ACS, geocoder, TIGERweb, BPS, LODES)
  - BLS
  - FRED
  - NY Fed
  - Zillow ZORI
  - CFPB HMDA
  - Texas Comptroller (Socrata)
  - TxGIO StratMap
  - FEMA NFHL / OpenFEMA
  - TCEQ, EPA, RRC
  - USGS 3DEP
  - TxDOT
  - HPD
  - FBI CDE
  - OSM (Overpass, Nominatim, OSRM, Valhalla)
  - NOAA / NHC
  - NASA GIBS
  - Esri Wayback
  - Planetary Computer
  - adsb.lol / airplanes.live / adsbdb / planespotters
  - OurAirports
  - FAA
  - Open-Meteo
  - Yahoo Finance, Coinbase
  - Google News, GDELT
  - Overture / Foursquare places

**CI/CD:** 7 GitHub Actions workflows are all data jobs (§2). **None runs `npm test`.** Vercel deploys on push.

### 8. UI

**Organization.**
- App bar nav (src/nav.js:7-15): **Map**, **Projects**, **Reports**, **Market** (Overview, Compare areas), **Filings** (Timeline, Companies, Changes), **My Work** (Notes & watchlist, Saved searches), plus a utility page **Data & help** (Sources).
- Views live in `#view-*` containers in src/index.html (changes, compare, field, market, projects, reports, saved, sources, timeline, who).
- Map plus side panel (`.app` grid: panel `clamp(360px,30vw,480px)` + stage; src/app.css:44).
- Property card: src/building.js and src/site.js.
- Phone layout: bottom tab bar and sheets (src/mobile.js).

**Existing project workspace:** Projects › project. Tabs are Overview / Sites / Renderings / Plans / Files / Ask (lib/project.mjs:14). Each option moves through the stage gates **Site → Layout → Pro forma → Renderings & plans**, confirmed in order with change fingerprints (lib/planstages.mjs:1-15). This is the natural spine to extend with Budget and Report stages.

**Design tokens** (src/app.css:2-38):
- Green scale `--green-50…900` (brand `--green-700 #006527`) and ink scale `--ink-50…950`. `--amber #b7791f`, `--danger #b42318`, `--bg #eef1f1`, `--panel #fff`, `--muted #686e71`.
- Fonts: `--font-display` Montserrat (also the body face) and `--font-mono` IBM Plex Mono (TTFs in `fonts/`).
- Spacing `--sp-1..8` (4–32 px), type `--fs-label…2xl` (10.5–24 px), radii `--r-sm 4 / md 8 / lg 12 / sheet 16 / pill`, shadows `--sh-1/2/sheet`.
- Sizes and motion: `--tap 44px`, `--ctl 36px` (40 on coarse pointers), motion `--dur-*`, z-index scale.
- Light theme only (comment at :8). Tokens are only partly adopted: "older rules still carry literal values" (:19-20).
- `src/app.css` is 4,172 lines.

**Brand assets:**
- Logos: `src/logo.png`, `src/logo-white.png`
- PWA icons: `icon-192/512/maskable-512.png`
- `manifest.webmanifest`
- Title-block border: `templates/A-XREF-BORD-V01.pdf` and `templates/titleblock.pdf`
- PDF footer brand green `#006527` (lib/pdf.mjs:37)

**Cheap accessibility findings:**
- Good:
  - `lang="en"`
  - viewport allows zoom
  - focus-visible rings defined (src/app.css:31-41)
  - 73 `aria-label`s in index.html
  - progressbar ARIA on the plan-set job (src/siteplan.js:~4660)
- **Amber text `#b7791f` on white is 3.64:1**, which fails WCAG AA for normal text. It is used for warnings and issues in about 26 rules (e.g. `.sp-warn`, `.sp-issues li.warn`, `.sp-idea ul` at 12px).
- `--ink-400 #939a9d` would be 2.86:1 but is used only for borders (OK).
- The UI is generated as HTML strings with manual `esc()`. Accessibility of the large `src/siteplan.js` editor (canvas/map drawing) depends on map interactions; keyboard parity for drawing was not verified.

### 9. Gaps for an end-to-end flow: Intake → Site analysis & layout → Plan set → Budget → Pro forma → Report set

| Step | Exists | Missing / seam |
|---|---|---|
| **Project / parcel intake** | Start from a property card (1–20 parcels), union and bridge, status, client, notes, reference files with AI read-out (Storage bucket), jurisdiction facts (lib/project.mjs:27-44), Regrid zoning on demand. | No intake form or address/APN entry point inside Projects; you have to start from the map card. The MCP resolver (lib/mcp/resolve.mjs) does address and APN but the UI doesn't. Parcel intake **drops situs address/ZIP, land use, year built and improvements** (src/siteplan.js:206-208). No users, orgs or permissions (shared passcode only). Project docs are one JSON blob with last-write-wins (api/projects.js:36-41). |
| **Site analysis & layout** | Strong. Engine-generated options, checks, metrics, Waller guardrails, rule sheets, terrain, utilities, flood, AI program/review. | Rule sheets exist only for Waller (others "typical"). Results live in the browser; the layout engine runs client-side only, with no server API to lay out a plan headlessly (needed for automated report runs). |
| **Plan set** | Extensive schematic set on the FS title block; Claude notes and designs; Chromium PDF. | Orchestrated in the browser tab (up to about an hour). Pages and PDF are **IndexedDB-only and not shareable** (src/siteplan.js:4727). Apartments, hotel and storage have no arch sheets (lib/plandesign.mjs:17). No server job runner or storage of outputs; the `site-files` bucket exists and could be reused. |
| **Budget** | Only the pro forma's parametric budget (about 15 unit rates, §4a). | **Missing:** a real estimate (line items, CSI divisions, quantities from plan and plan set, GC/OH&P, escalation, contingency by phase, versions, actuals). No link from plan-set quantities to cost. PPI cost indexes are fetched but unused. This is the seam for fs-budgeting-suite: its estimate total should replace `budget.hard/site/soft` inputs in `runM` (lib/proforma.mjs:318-337) through `proFormaOf(metrics, use, overrides)` (:306), which already accepts overrides. |
| **Pro forma** | Monthly model + TestFit one-pager + Excel with formulas; stage gate; per-option overrides. | Not persisted (recomputed in the browser). No NPV, waterfall or promote, sensitivities, scenario sets or market-linked defaults. Inconsistent "profit" semantics (§4b). Land defaults to market value incl. improvements (src/siteplan.js:2980). Not exposed by any API or MCP tool. |
| **Report set** | Many public-data area reports (flood, environmental, crime, demographics, market) as PDFs, on the web and via MCP; site-plan sheet PDF; pro forma xlsx. | **No combined feasibility / investment package** (project summary + site facts + layout + budget + pro forma + plan set + market). Report history is browser-local (src/reports.js:2). No comps (by design, README.md:83). This is the seam for fs-cre-report-runner: `lib/reports/*.mjs` + `src/reportkit.js` + `lib/pdf.mjs` is the existing report kit to build on; `lib/mcp/reports.mjs` shows the server-side pattern (size caps, embedded PDF). |
| **Cross-cutting** | Supabase, Storage, Chromium, Claude + OpenAI clients with monthly caps and usage table (`ai_usage`), MCP server. | No auth. No job queue or worker for long AI/PDF runs (Vercel 300 s cap; client orchestration). No local dev runtime for `api/`. No lint or typecheck, and no CI running the tests. No `.env.example`. Hardcoded Supabase project URL fallbacks in about 9 code files. The 5k-line `src/siteplan.js` is the integration choke point for any UI change. |

---

# Part B: fs-budgeting-suite


- Audited: 2026-10-24. Repo was not modified (`git status` clean afterward). All builds and tests ran in scratch exports.
- Branch audited in depth: **`origin/feature` @ 4187c8c** (2026-10-15). It was exported to `scratchpad/budget-feature`.
- `origin/claude/budgeting-suite-expansion-lwuc2e` @ 8cf6570 was also exported, to `scratchpad/budget-claude`, because it has 8 commits that no other branch carries.
- Paths below are relative to the repo root on `origin/feature` unless they are prefixed `[claude]`.

---

### 1. Purpose

This is an internal Finishes Solutions tool for building **multifamily construction budgets**. The budget is a schedule of values (SOV): CSI-coded line items, priced from a versioned admin-published pricing library (`README.md:3-8`). It rolls up to a construction **contract sum** and a **total project cost**, and it carries a unit-mix rent roll, other income and an opex schedule.

It also has a server-side **before-tax investment analysis engine** (a 5- or 10-year acquisition pro forma). The engine was reverse-engineered from five reference deals that were exported from a commercial tool, "Analyst Pro" (`docs/INVESTMENT_FORMULAS.md:223`; `README.md:37`). An "Ask AI" Budget Assistant (Anthropic) sits on top of both.

There is **no** site layout, plan-set, or market-research capability.

---

### 2. Stack and entry points

| Layer | What | Evidence |
|---|---|---|
| Hosting | Azure Static Web Apps (Standard), Entra ID custom provider, SWA custom roles `pricing_admin`, `super_admin` | `app/staticwebapp.config.json:1-31`; `README.md:17` |
| API | SWA-managed Azure Functions, **v3 programming model** (`function.json` + `module.exports = async function (context, req)`), CommonJS, Node 22 | `api/*/function.json`; `api/investment-calculations/index.js:7`; `api/package.json:5-7` (`node >=22 <23`). README says "Node 18" (`README.md:18`), which is stale. |
| DB | Azure SQL serverless via `mssql` 10. One DB serves prod, staging and feature environments | `api/shared/db.js:1,33`; `README.md:136`; `AGENTS.md` rule 4 |
| Frontend | No build step. The core is the 9,973-line monolith `app/index.html` (HTML + inline CSS + JS), plus IIFE/UMD scripts: `investment-analysis.js` (2,630 lines), `guardrails.js`, `impact-fees.js`, `dashboard.js`, `home.js`, `projects.js`, `feedback.js`, export renderers | `app/index.html:37-75` (script tags) |
| Vendored | ExcelJS 4.4.0, pdfmake, and `fs-render` (copied from the `fs-courier` repo) | `app/vendor/*`; `api/shared/fs-render/package.json:5` |
| AI | `@anthropic-ai/sdk` 0.131.0; default model `claude-haiku-5-5` | `api/package.json:10`; `api/shared/budget-assistant.js:68,713` |
| Mail | Microsoft Graph app-only `sendMail`, used for feedback | `api/shared/mailer.js:24,61-65` |
| CI/CD | One GitHub Actions workflow with OIDC: main→prod, staging→staging env, feature/**→feature env | `.github/workflows/azure-static-web-apps-wonderful-rock-071c8e810.yml:16-152` |

**API Functions.** There are 14 of them, all confirmed by `func start`:

- `analytics` [GET]
- `budget/{id}` [GET, PUT, DELETE, POST]
- `budget/{id}/versions/{n?}`
- `budgets`
- `export-config`
- `investment-analyses` [GET, POST]
- `investment-analysis/{id}` [GET, PUT, DELETE]
- `investment-analysis/{id}/export`
- `investment-analysis/{id}/versions/{n?}`
- `investment-calculations` [POST, stateless]
- `pricing` [GET, PUT]
- `templates/{key?}/{sub?}/{n?}`
- `user-activity`
- `user-settings`

The Budget Assistant is not its own route. It runs as `?scope=ask` on `budget/{id}` and on `investment-calculations` (`api/investment-calculations/index.js:13-29`).

**SQL.** These are T-SQL scripts that an admin runs by hand in the Azure portal. Nothing runs them automatically.

- `sql/schema.sql`, `sql/seed_pricing.sql`
- Migrations: `migrate_budget_history_and_templates.sql`, `migrate_investment_analyses.sql`, `migrate_users.sql`, `migrate_feedback.sql`, `migrate_impact_fees.sql`, `migrate_projects_and_guardrails.sql`, `migrate_*op_ids.sql`
- Template publishes: `publish_multifamily_input_defaults.sql`, `publish_multifamily_opex_template.sql`
- Purge, verify and views scripts

Tables (18):

- `Budgets`, `SovLines`, `BudgetVersions`, `BudgetVersionSovLines`
- `BudgetTemplates`, `BudgetTemplateVersions`, `PricingLibrary`
- `InvestmentAnalyses`, `InvestmentAnalysisVersions`, `InvestmentAnnualResults`, `InvestmentVersionAnnualResults`
- `Users`, `UserActivity`, `Feedback`
- `FeeSchedules`, `FeeScheduleVersions`
- `Projects`, `ProjectIdMap`

**Tools.**

- `tools/input-driven-defaults.js` is a JS mirror of `publish_multifamily_input_defaults.sql`, used only by tests.
- `tools/make-favicons.py`.
- `docs/render_guide.py` renders the build guide from `guide.vars`.

---

### 3. Branch comparison and choice

Ahead/behind counts are relative to `origin/staging` (63ef1a4) unless noted.

| Branch | Ahead / behind | Unique commits not in `feature` | Content |
|---|---|---|---|
| `staging` (local checkout) | — | 0 | Impact & tap fee calculator (03f41ec) on top of main |
| `main` | 1 ahead / 3 behind staging | 0 (contained in feature) | Production; behind staging |
| **`feature`** | **40 ahead, 0 behind** | — | Superset of staging, main, adoring-gauss and vigilant-cerf. Diff vs staging: 75 files, +12,240/−755. Adds the Budget Assistant (`budget-assistant.js`, `investment/insight.js`, `budget-review.js`), the expense-ratio derivation fix, save-loop and concurrency fixes, a stored-XSS fix (828fa14), input-driven defaults (pool → amenity lump sum, per-unit finish lines, % dev fee), and the site-wide UI pass |
| `matthew/adoring-gauss-doi0hg` | 39 ahead | **0** (feature = adoring-gauss + one merge commit) | Same work as feature |
| `matthew/vigilant-cerf-iqeg6c` | 17 ahead | **0** (feature is 23 ahead of it) | Assistant work, all merged into feature |
| `claude/budgeting-suite-expansion-lwuc2e` | 9 ahead of main; 8 not in feature; feature has 42 not in it | **8** | Phases 1-8 "expansion" (described below) |

**Best branch: `origin/feature`.**

- It strictly contains every other branch except the claude branch.
- It has the newest investment engine fixes (`from-budget.js` expense-ratio rule, `insight.js`), the full opex schedule, and the impact-fee calculator.
- It has the largest test suite, and that suite passes (section 4).

**Valuable only on `claude/budgeting-suite-expansion-lwuc2e`** (Aug 31, never merged; it would conflict with feature's rewrites of `app/index.html` and `api/shared/projects.js`):

- `[claude] api/shared/budget-finance.js` (457 lines; byte-identical copy at `app/budget-finance.js`). This is the pure UMD **"derived allocation model"**:
  - `deriveBank()`: a lender ("bank") budget that is the internal budget plus an `upliftPct` pool (default 10%, `DEFAULT_FINANCE` at line ~40), distributed by rules over CSI divisions, profit, contingency, soft, land and fees.
  - `allocate()`: maps `doc.companies` profit and the dev/marketing/closing fee streams onto Entity Master entities.
  - `contractPlan()`, `consolidate()`.
  - `waterfall()` (lines 381-403): Total Project Value → External cost → per-entity profit → Consolidated Finishes Profit.
  - `reconcile()` (405+).
  - Tested by `[claude] test/budget-finance.test.js`: **13/13 pass** (run in scratch).
- `[claude] api/shared/contracts.js` (312 lines) and `[claude] sql/migrate_contracts.sql`: generate intercompany contracts from an approved budget.
- `[claude] api/shared/entities.js` and `[claude] sql/migrate_entities.sql`: Entity Master seeded with six Finishes LLCs (`migrate_entities.sql:96-103`).
- `[claude] sql/migrate_budget_approval.sql`: approval pointer.
- `[claude] app/budget-financials.js`: Financials step and Executive Summary UI.
- `[claude] docs/BUDGETING_SUITE_EXPANSION_PLAN.md`.

This is the only place a profit split across the Finishes entities exists. On `feature`, "profit split" is just a list of `doc.companies[{name,pct}]`, each taking `pct` of hard cost.

---

### 4. Build / run / test (actual results)

All commands ran in `$S/budget-feature` (`git archive origin/feature`), with Node **v26.5.0** and npm 11.17.0. The repo pins Node 22; npm warned `EBADENGINE required: { node: '>=22 <23' }`.

| Step | Command | Outcome |
|---|---|---|
| Build | — | **There is no build step.** `app/` is served verbatim (`README.md:64-67`; `AGENTS.md` rule 1). |
| Install (root) | `npm install --no-audit --no-fund` | exit 0. Root deps are dev-only: playwright, exceljs, pdfmake, file:fs-render. |
| Install (api) | `cd api && npm install` | exit 0; 300 packages. EBADENGINE warning; deprecations for crypto-js 4.2.0 and uuid 8.3.2 (transitive via mssql/tedious). |
| Unit tests | `node --test test/*.test.js` | **304 tests, 304 pass, 0 fail**, 5.3 s. No network or DB: the API tests (`projects-api`, `investment-api`, `budget-save-api` …) stub the mssql pool or start an in-process server on 127.0.0.1. |
| Browser suites | `npx playwright install chromium` (downloaded OK), then a scratch copy of `test/run-all.sh` with `/tmp` logs redirected to the scratchpad, `OUT_DIR=$S/out` | **22 suites, 1,468 checks, 2 failures.** Runner exit 1 ("1 suite(s) reported failures"). The app is served by `test/mock-api.js`, an in-memory mock of the SWA API on ports 8099 (`NO_API=1`) and 8100. |
| — failure 1 | suite-02 (1/126) | `FAIL Updated column shows MM-DD-YYYY — 01-04-2026` against expected `'01-05-2026'` (`test/suite-02.js:176`). A **timezone-dependent assertion**: the machine is US Central and the seed timestamp is near UTC midnight. Not a logic bug. |
| — failure 2 | suite-07 (1/14) | `FAIL every TOC link scrolls to its section and stays on the guide` (help TOC scroll positions, `bottom=false`). UI/layout flake; not logic. |
| Run (Functions) | Installed `azure-functions-core-tools@4.16.0` in scratch (postinstall blocked by npm allow-scripts; ran `lib/install.js` and unzipped manually), wrote a throwaway `local.settings.json` in the **scratch** copy (`FUNCTIONS_WORKER_RUNTIME=node`, no SQL_CONN; deleted after), then `func start --port 7077` | Host started; all 14 functions listed. `POST /api/investment-calculations` with `test/fixtures/investment/frisco.json` input → **200 `{"ok":true,"result":{…calculationVersion:"before-tax-1.1.0"…}}`**. `GET /api/budgets` → **500**: `Exception: SQL_CONN app setting is not configured` (`api/shared/db.js:34`). Every endpoint except `investment-calculations` (and `export-config`) needs Azure SQL. |
| Run (frontend) | `PORT=8100 node test/mock-api.js` (what the suites do) | Works offline against the mock. Against the real API it requires SWA auth (`/.auth/me`, `x-ms-client-principal`). `swa start` was not attempted: there is no local SQL, and SWA-CLI auth emulation adds nothing for logic review. |
| Claude branch | `node --test test/budget-finance.test.js` in `$S/budget-claude` | 13/13 pass |

Engine spot check (Frisco fixture, computed directly):

| Metric | Engine | Fixture expectation |
|---|---|---|
| Price | 27,596,732 | — |
| Cap rate | 7.5223% | 7.52 |
| Initial equity | 9,024,131.76 | — |
| Year-1 NOI | 2,075,900.94 | — |
| Monthly payment | 130,434.57 | — |
| Year-1 DSCR | 1.3263 | — |
| Year-1 CoC | 5.659% | — |
| Year-5 equity IRR | 16.634% | 16.63 |
| Year-5 equity multiple | 2.0346 | — |
| Year-5 gross sale price | 34,379,000 | — |
| Year-5 net sale proceeds | 15,165,512.09 | — |
| Optimal hold | year 2 @ 17.23% | year 2 @ 17.23% |

Every value is within the tolerances in `test/fixtures/investment/frisco.json`.

---

### 5. Areas

#### (a) Project budgets / cost estimating — PRESENT (core of the repo)

**What it does**

- Each budget document (`doc`) holds:
  - `resSF`, `amenSF`, `siteSF`
  - `units[]` (label, bd, bth, sf, count, rent)
  - `other[]` (other income)
  - `expenses[]` (opex)
  - `lines[]` (SOV: code, grp, scope `res|amen|soft`, desc, basis `sf|asf|unit|ls`, qty, auto, unit rate, baseUnit, lineId)
  - `companies[]` (profit pct)
  - `contingency{mode pct|psf|amt}`
  - `projectCosts{land, dev, mkt, cls}`, each `{mode amt|pct, val}`
  - `impactFees`, `opexSchemaVersion`, `pricingVersion`
- A new budget is cloned from the `multifamily` template, and its rates are re-stamped from the current pricing library by key `scope|code|desc` (`app/index.html:4018 stampCurrentPricing`; `blankDoc` at `app/index.html:5214-5250`).
- Every meaningful save writes an immutable version snapshot plus normalized SOV rows (`api/shared/versioning.js`, `api/shared/sov.js`).
- Guard rails block or warn at save time.
- Exports: CSI schedule, PDF and Excel.

**Data sources.** All internal; there are no external cost feeds.

- `dbo.PricingLibrary` (seeded by `sql/seed_pricing.sql`).
- `dbo.BudgetTemplateVersions` (seeded by `sql/migrate_budget_history_and_templates.sql:319-392`).
- `dbo.FeeScheduleVersions` (impact fees).
- The offline fallback copy `DEFAULT_PRICING` (`app/index.html:4668`), which is byte-identical to the seed (103 lines; verified).

**Key files and functions**

- `api/shared/budget-calc.js` — the server port of the browser math:
  - `totUnits` (23), `lineQty` (27), `scopeActive` (37), `scopeSum` (45), fee helpers (55-58), `parts` (60-91), `grossIncome` (93-105), `expenseMonthly` (115-123).
- The browser mirror lives in `app/index.html`: `totUnits` 7300, `lineQty` 7301, `scopeActive` 7312, `scopeSum` 7314, `parts` 7327, `expenseMonthly` 7399, `grossIncome` 7418.
- `app/index.html` also has `csiSchedule` 7791 and `csiDivKey` 7787.
- `api/shared/sov.js:31 sovRows`.
- `api/shared/guardrails.js` (byte-identical to `app/guardrails.js`; `DEFAULT_POLICY` 44-66, `evaluate` 215).
- `app/impact-fees.js` (UMD; `evaluate`, `rowAmounts`, `pick`).
- `api/shared/budget-review.js` (rule-based "what's missing" checklist).

**Pricing library: provenance, region, date**

- Version `2026.08-v2`, effective `2026-08-10`, 103 lines (`sql/seed_pricing.sql:1-3`; `app/index.html:4668`).
- The only stated source is the comment "from the Finishes budget model export" (`sql/seed_pricing.sql:1`). `test/calculations.test.js:1-2` names the reference workbook as "Budget For Projects 3.0 MAIN".
- **No per-line source, no region field, no cost index or escalation, no date per line.**
- The region is implicit: **Texas, Waller / Houston exurb**. Evidence:
  - `SC-08 TxDOT Driveway Permitting`.
  - Template opex rows "City of Waller water & sewer", "Ezee Fiber", "Ally Waste" (`migrate_budget_history_and_templates.sql:378-383`; `app/index.html:4802-4807`).
  - The impact-fee seed is the City of Waller schedule.
- **Every rate is a $/SF figure back-solved from one project's workbook.** These are not unit costs from a cost database (RSMeans etc.). The amenity lines are $/amenity-SF; for example, Storefront at $21.16/asf is clearly one clubhouse's lump sum divided by 1,200 SF.
- Sums of rates by scope:
  - Residential: Σ $126.93/SF of residential SF.
  - Amenity: Σ $125.57/SF of amenity SF.
  - Soft: Σ $18.03/SF of residential SF.

**Every hardcoded rate in the pricing seed.** `sql/seed_pricing.sql:3` (identical to `app/index.html:4668-4781` and `test/pricing.json`); format `code desc basis $rate`.

- **Residential, $/SF of resSF.**
  - *General Conditions:* 01 01 00 Project Management 7.50; 01 02 00 Insurance 1.52; 01 04 00 Equipment & Supplies 0.70; 01 05 00 Security 0.18; 01 50 00 Temporary Facilities 1.20; 01 70 00 Execution & Closeout 0.55; 01 74 00 Construction Waste 2.18.
  - *Infrastructure:* 01 06 00 Testing & Surveying 0.40; 01 07 00 Inspections 0.65; 31 10 00 Site Clearing 0.75; 31 20 00 Earth Moving 0.33; 31 23 00 Excavation & Fill 3.85; 32 10 00 Bases/Paving 7.00; 32 30 00 Striping 0.35; 33 10 00 Water Utilities 1.52; 33 30 00 Sanitary Sewer 1.12; 33 40 00 Storm Drainage 3.56; 33 70 00 Electrical Utilities 3.05; 33 80 00 Communications Utilities 0.50; 33 90 00 Misc Utilities 0.10.
  - *Shell:* 03 30 00 Foundation/Slab 5.25; 04 40 00 Stone 0.83; 05 10 00 Structural Metal 1.55; 06 10 00 Rough Carpentry/Framing 20.55; 07 21 00 Insulation 1.39; 07 40 00 Roofing 1.28; 07 60 00 Gutters 0.33; 08 10 00 Ext Doors 2.50; 08 50 00 Windows 1.21; 08 70 00 Ext Door Hardware 0.10; 09 90 00 Ext Paint 0.47.
  - *MEPS:* 21 10 00 Fire Suppression 1.40; 22 05 00 Plumbing 8.12; 23 05 00 HVAC 5.81; 26 05 00 Electrical 6.49; 27 10 00 Structured Cabling 0.81; 28 46 00 Fire Alarm 1.36.
  - *Interiors:* 06 20 00 Finish Carpentry 2.13; 08 11 00 Int Doors 1.31; 08 71 00 Int Door Hardware 0.20; 08 83 00 Mirrors 0.29; 09 20 00 Gypsum 4.72; 09 30 00 Tile 0.96; 09 60 00 Flooring 1.79; 09 91 00 Int Paint 2.18; 10 14 00 Signage 0.10; 10 28 00 Bath Accessories 0.62; 11 31 00 Appliances 3.48; 12 21 00 Blinds 0.33; 12 30 00 Cabinets 2.01; 12 36 00 Countertops 1.13.
  - *Site Finish:* 10 55 00 Mailboxes 0.25; 13 11 00 Pool w/ Deck 3.22; 28 10 00 Access Control 1.14; 32 31 00 Fences & Gates 1.30; 32 33 00 Site Furnishings 0.44; 32 80 00 Irrigation 0.72; 32 90 00 Landscaping 2.15.
- **Amenity, $/SF of amenSF.** 08 10 00 Doors 2.50; 08 40 00 Storefront 21.16; 22 30 00 Plumbing Fixtures 4.15; 26 50 00 Light Fixtures 4.12; 27 10 00 Cabling 9.44; 27 11 00 Comms Room 6.83; 28 10 00 Access Control 11.83; 28 20 00 Cameras 4.00; 28 46 00 Fire Alarm 5.00; 06 20 00 Millwork 7.97; 08 11 00 Int Doors 4.36; 08 71 00 Door Hardware 2.99; 09 30 00 Tile 8.21; 09 60 00 Flooring 4.77; 10 14 00 Signage 0.16; 10 28 00 Accessories 7.94; 10 44 00 Extinguishers 0.13; 11 60 00 Game/Media 3.00; 11 65 00 Fitness 5.00; 12 30 00 Cabinets 5.33; 12 36 00 Countertops 4.00; 12 50 00 Clubhouse Furniture 1.74; 12 60 00 Seating 0.94.
- **Soft, $/SF of resSF.** SC-01 Architect 2.65; SC-02 Civil 1.58; SC-03 Structural 1.17; SC-04 MEP 0.33; SC-05 Landscape Arch 0.15; SC-06 Geotech 0.18; SC-07 Environmental 0.04; SC-08 TxDOT Driveway 0.28; SC-09 TIA 0.36; SC-10 Flood Plain Mitigation 0.18; SC-11 Pad Elevation Certs 0.22; SC-12 A/E CA 0.39; SC-13 Surveyor 0.13; SC-14 Renderings 0.10; SC-15 Reimbursables 0.18; SC-16 Plan Printing 0.06; SC-17 Precon 0.29; SC-18 Design Contingency 0.83; SC-20 Water & Sewer Impact & Tap 7.50; SC-21 Permitting 0.45; SC-22 Plan Review 0.15; SC-23 Fees Contingency 0.81.

**Later re-pricing: `sql/publish_multifamily_input_defaults.sql`** (header lines 1-80; JS mirror at `tools/input-driven-defaults.js:22-34`).

- Converts nine residential lines to **$/unit**, back-solved as `rate × 51,365 / 58`: Appliances 3,081.90; Cabinets 1,780.06; Countertops 1,000.73; Interior Doors 1,160.14; Door Hardware 177.12; Mirrors 256.83; Bath Accessories 549.07; Blinds 292.25; Mailboxes 221.40.
- Converts the pool to an amenity **lump sum of $165,395.30**.
- Converts the developer fee to **2.0046%** of TPC.
- The script itself says: "THE RATES ARE BACK-SOLVED STARTING POINTS, NOT HOUSE NUMBERS."

**Template defaults** (`migrate_budget_history_and_templates.sql:358-389` = `app/index.html:5214-5243`):

- Building: resSF 51,365; amenSF 1,200; siteSF 0.
- Units:

  | Unit type | Count | Unit SF | Rent ($/mo) |
  |---|---|---|---|
  | Studio | 16 | 630 | 1,203 |
  | Studio | 14 | 400 | 1,160 |
  | Townhome | 14 | 1,063 | 1,520 |
  | Townhome | 14 | 1,200 | 1,500 |

  58 units in total.
- Company: "Finishes Solutions LLC" **12%** profit on hard cost.
- Contingency: **psf $2.00**.
- Project costs: land **$1,200,000**, dev fee **$200,000**, marketing **$75,000**, closing **$0**.
- Resulting default budget (recomputed with `budget-calc.parts`, matching suite-01's on-screen totals):

  | Measure | Value |
  |---|---|
  | Hard cost | $6,670,443 ($126.90/bldg SF) |
  | Profit | $800,453 |
  | Contingency | $105,130 |
  | **Contract sum** | **$7,576,027** |
  | Soft costs | $926,111 |
  | **Total project cost** | **$9,977,138** ($172,020/unit; $189.81/SF) |

**Other income defaults, $/mo** (`app/index.html:4782-4791`; `migrate_budget_history_and_templates.sql:368-376`):

- Utilities billback 77/unit
- Tech package 75/unit
- Parking 25 × 15
- Pet 25 × 18
- Admin 20/unit
- Premium units 25 × 23
- Valet trash 25/unit
- Misc 15/unit

**Opex defaults** (`app/index.html:4801-4818`; `sql/publish_multifamily_opex_template.sql:104-113`):

- Water & sewer $60/unit/mo
- Ezee Fiber $40
- Finishes Communications $15
- Ally Waste $15
- Dumpster $383/mo fixed
- Admin $10
- Property Taxes **12% of income**
- Insurance $65/unit
- Management **4% of income**
- Payroll $95
- R&M $55
- Turnover $30
- Marketing $22
- G&A $18
- Landscaping $20
- Reserves $25/unit/mo

The script says these were chosen to land at "roughly 46% of income" and are "STARTING POINTS, NOT HOUSE NUMBERS" (`publish_multifamily_opex_template.sql:40-45`).

**Impact & tap fees** (`sql/migrate_impact_fees.sql`):

- One jurisdiction, `tx-waller`: "City of Waller impact fee schedule, provided 2025-10-15" (lines 41, 251-254).
- `eduRates` water **$3,689.91**/EDU and sewer **$7,619.03**/EDU (line 255).
- 17 meter rows from 5/8" @ 10 gpm (1 EDU: water 3,689.91 / sewer 7,619.03) to 12" @ 3,300 gpm (330 EDU: 1,217,670.42 / 2,514,278.90), with low/high meter, vault, water-tap and sewer-tap adders (lines 222-238).
- **This is the only cost data in the repo with a cited source and an effective date.**
- `DEFAULT_BASIS = 'high'` (`app/impact-fees.js:43`).

**Guard-rail thresholds**

- Multifamily (`api/shared/guardrails.js:44-60`):

  | Rail | Bounds |
  |---|---|
  | opexRatio | 0.35-0.55 (error) |
  | feeSum | ≤0.95 (error) |
  | unitSF | ≤1 (error) |
  | devFee | 0.02-0.05 |
  | marketing | 0.005-0.02 |
  | closing | 0.005-0.03 |
  | landShare | 0.10-0.25 |
  | profitMargin | 0.08-0.20 |
  | contingency | 0.02-0.10 |
  | softCost | 0.08-0.20 |
  | hardCostPSF | $120-260 |
  | rentPSF | $1.00-3.50 |
  | bldgEfficiency | 0.70-0.95 |
  | siteEfficiency | 0.15-1.20 |

- Blank budget type: feeSum and unitSF only.
- These are unsourced rules of thumb.

**Other hardcodes, placeholders and stubs**

- `FEE_FLOOR = 0.05` (`api/shared/budget-calc.js:21`; `app/index.html:7322`).
- `SQFT_PER_ACRE = 43560` (`app/index.html:7359`).
- `ADMIN_PASS_SHA256='52e20e96… (digest redacted)'` (`app/index.html:4659`). This is a client-side "convenience lock" for local dev only; the server re-checks the role.
- `budget-review.js:23-34`: 10 hardcoded checklist regexes; `LIMIT = 15`.
- TODOs: only `app/ds-bridge.css:20,31,39` (design-system styling). No TODO/FIXME exists in the logic code.
- `test/mock-api.js` (1,741 lines) is a full in-memory API mock with a `MOCK_AI` canned assistant (lines 1130, 1341). It is test-only and is not shipped.
- The roadmap phases (SharePoint export, Monday.com sync, Lender Package service, emailing exports) are **not built** (`docs/ROADMAP.md:17-91`).

**Verdict:** the arithmetic is realistic, carefully tested and production-grade.

- The roll-up is server-authoritative, has browser/server parity tests, solves the circular % fee in closed form, suppresses inactive amenity scope, and preserves CSI division totals.
- **The cost data is demo-quality.** It is one project's Texas workbook converted to $/SF, with no sourcing, region or escalation, and the authors themselves label the newer rates "starting points".
- Port the math, not the numbers.
- The one exception is the Waller impact-fee schedule: it is a real, sourced, dated jurisdiction table, but it covers a single city.

#### (b) Pro forma / financial modeling (investment analysis engine) — PRESENT, strongest asset

**What it does**

- `calculateInvestmentAnalysis(rawInput)` (`api/shared/investment/calculate.js:26-163`) is pure. Pipeline: validate → normalize → operating years (N+1) → acquisition → one 30/360 amortizing loan → yearly hypothetical sale → returns/IRR series → sensitivity.
- Returns a canonical JSON result whose non-finite values become `null`.
- Calculation version **`before-tax-1.1.0`**; horizons 5 or 10 years (`investment/constants.js:8,13`).
- **Scope limits, enforced by validation** (`investment/validation.js:98-120`):
  - before-tax only;
  - at most one loan (new, fully amortizing);
  - no interest-only, no refinance, no second loan;
  - loan term ≥ horizon;
  - constant growth rates;
  - annual periods only.
- **It is a stabilized acquisition model, not a development model.** When created from a budget, the "purchase price" is the budget's Total Project Cost (`investment/from-budget.js:76`). There is no construction period, construction loan, draw schedule, lease-up or interest reserve.

**Data sources**

- User input, or an import from an immutable budget version (`from-budget.js:55-135`):
  - property size = res + amen SF, never site;
  - year-1 potential income = 12 × Σ(rent × count);
  - other income rows × 12;
  - expense ratio derived as annual opex ÷ GOI.
- Organization defaults (`investment/defaults.js:4-16`).

**Key files.** `api/shared/investment/`:

- `finance.js` (`pmt`, `remainingBalance`, `roundToNearestThousand`, `irr`)
- `debt.js`, `operating.js`, `disposition.js`, `returns.js`, `sensitivity.js`
- `normalize.js`, `validation.js`, `dates.js`, `constants.js`, `defaults.js`
- `result-rows.js`, `from-budget.js`, `insight.js` (drivers, diagnostics, scenarios)
- Export renderers: `export-render.js`, `legacy-render.js`, `to-fsdoc.js`

Elsewhere:

- UI: `app/investment-analysis.js` (2,630-line IIFE wizard).
- Persistence: `api/shared/investment-persistence.js` (mssql) and `api/investment-*`.
- Formula reference: `docs/INVESTMENT_FORMULAS.md` (462 lines, accurate against the code as read).

**Hardcoded values**

- `defaults.js:5-15`:

  | Default | Value |
  |---|---|
  | acquisitionCostPercent | 0.02 |
  | sellingCostPercent | 0.05 |
  | loanFeePercent | 0.01 |
  | incomeGrowth | 0.03 |
  | otherIncomeGrowth | 0.03 |
  | dollarExpenseGrowth | 0.03 |
  | vacancy | 0.10 |
  | ltv | 0.65 |
  | amortizationYears | 25 |
  | termYears | 5 |
  | interestCalculation | '30/360' |

  The file says these were "recovered from the reference exports".
- `constants.js`: SENSITIVITY_FACTORS [0.90, 0.95, 1.00, 1.05, 1.10] (11); ALLOWED_YEARS [5, 10] (13); MAX_OTHER_INCOME_ROWS 20; MAX_CAPEX_ROWS 20; MAX_TEXT 500 (16-18); SQFT_PER_ACRE 43560 (9).
- `finance.js`: IRR_LO −0.9999, IRR_HI 100, STEPS 4000, 200 bisection iterations, tolerance 1e-9 / 1e-12 (30-31, 46, 60-64).
- `calculate.js` warnings: exit cap < 0.75 × going-in cap (72); opex ratio < 0.05 or > 0.75 (74).
- UI default loan: `{ltv 0.65, annualRate 0.065, amort 25, term 5, fee 0.01}` (`app/investment-analysis.js:1319-1320`); rate field placeholder '6.5' (1255).
- Creation defaults: projection.years 5; includeSensitivity true; exitCapRate **null**, so the user must enter it (`api/investment-analyses/index.js:175-188, 204-214`).
- `insight.js` rule-of-thumb diagnostics (`insight.js:103-129`):

  | Check | Threshold |
  |---|---|
  | DSCR | <1.0 error / <1.25 warn |
  | Year-1 CoC | <5% |
  | Equity IRR | <12% |
  | Vacancy | <5% |
  | Expense ratio | outside 30-55% |
  | Rent growth | >4% |

- `insight.js` driver nudges (59-74): rent +5%, growth +1 pt, vacancy −2 pts, opex −5%, price −5%, exit cap −50 bp, rate −50 bp.
- `insight.js` scenario bounds (141-152): rentChangePct [−0.5, 1]; rentGrowth [−0.05, 0.10]; vacancy [0, 0.5]; expenseRatio [0.05, 0.9]; purchasePrice [1, 1e10]; exitCapRate [0.02, 0.15]; interestRate [0, 0.2]; addOtherIncome default growth 0.03.
- There are no mocks or stubs in the engine.

**Verdict:** realistic and fixture-proven, but narrow.

- The engine is a high-quality clone of a commercial before-tax acquisition pro forma. It reconciles five reference deals within $1.5 / 0.006 pp.
- It is not a development pro forma: no construction or lease-up phase, no tax, one loan, no waterfall (the waterfall exists only on the claude branch).
- Treat it as the authoritative stabilized-ops / exit module. A development front-end would need to be added on top.

#### (c) Site layout (parcel, setbacks, massing, unit/parking yield) — NOT PRESENT

- The only site logic is `siteMetrics()` (`app/index.html:7360-7368`):
  - acres = siteSF / 43,560
  - site efficiency (FAR) = (resSF + amenSF) / siteSF
  - building efficiency = Σ(unit SF × count) / resSF
  - density = units / acres
- The guard-rail bounds `siteEfficiency` 0.15-1.20 and `bldgEfficiency` 0.70-0.95 (`api/shared/guardrails.js:58-59`) are the only related checks.
- Site SF "prices nothing" (`app/index.html:7358`).
- Absent entirely: parcel geometry, setbacks, massing, zoning rules, parking ratio or yield, unit yield solver.
- "Parking" exists only as an other-income row ($25 × 15 spaces).

**Verdict:** not present. These are three ratio tiles.

#### (d) Plan sets — NOT PRESENT

- There are no drawing, sheet or plan-set references in code (grep for `plan set|drawing|sheet` in `api/ app/ sql/`; only Excel worksheets match).
- The "Plan Printing" ($0.06/SF) and "Renderings" ($0.10/SF) soft-cost lines are the only mentions.

**Verdict:** not present.

#### (e) CRE market research and reports — NOT PRESENT

- There is no market data source: grep for costar, yardi, realpage, zillow, rentcast, attom, regrid, census, mapbox, geocod and comps finds nothing.
- Rents, vacancy, growth and cap rates are all user-typed or defaulted (vacancy 10%, growth 3%; `investment/defaults.js`).
- The only "benchmarking" is `budget-review.js` comparing a budget to the median of the user's own other budgets ('portfolio' evidence, `budget-review.js:1-14`), plus `insight.js` rule-of-thumb thresholds.
- "Reports" means budget and investment-analysis PDF/Excel exports (`api/shared/investment/export-render.js`, vendored `fs-render`), not market reports.

**Verdict:** not present. Exports are formatting of internal numbers only.

---

### 6. Formulas (portable spec)

#### 6.1 Budget roll-up

Sources: `api/shared/budget-calc.js`, mirrored at `app/index.html:7300-7430`, and specified in `BUDGET-SYSTEM.md`.

`nz(v)` is `+v` if finite, else 0.

```
totUnits          = Σ units[i].count
lineQty(line)     = line.auto ? (basis=='sf' → resSF | 'asf' → amenSF | 'unit' → totUnits | else 1) : line.qty
scopeActive(sc)   = sc != 'amen' || amenSF > 0                      // amenity suppression is ARITHMETIC
scopeSum(sc)      = scopeActive(sc) ? Σ_{lines in sc} lineQty × unit : 0
res, amen, soft   = scopeSum('res'), scopeSum('amen'), scopeSum('soft')
hard              = res + amen                                      // soft is NOT in hard or contract
profit            = Σ_companies hard × pct/100                      // "profit split" = list of companies each on hard
cont              = mode pct → hard × val/100 | psf → (resSF+amenSF) × val | amt → val
contract          = hard + profit + cont                            // CONTRACT SUM
base              = contract + soft + land
rate              = Σ pct-mode rates of {dev, mkt, cls} / 100       // fee {mode:'amt'|'pct', val}; bare number = amt
fixed             = Σ amt-mode values of {dev, mkt, cls}
project           = (base + fixed) / max(1 − rate, 0.05)            // TOTAL PROJECT COST, closed-form circular fee
fee.k             = fixed_k + rate_k × project ;  fees = Σ fee.k
```

- **CSI schedule** (`app/index.html:7787-7830`):
  - Active hard lines are grouped by the first 2 digits of `code` (`csiDivKey`); a code that is not a known division goes to "Uncoded / Custom Scope".
  - Markups are appended: `99 01 00` Profit (one per company) and `99 03 00` Construction contingency.
  - Soft lines are grouped by `grp`, and their % uses softTotal as the denominator.
  - Divisions + markups reconcile to `contract`.
- **Income / opex** (`grossIncome`):

  ```
  rentMo  = Σ rent × count
  otherMo = Σ rate × (auto ? totUnits : count)
  expenseMonthly(e) = per 'pctIncome' → (rentMo + otherMo) × rate/100
                    | 'fixed'         → rate × (count || 1)
                    | else            → rate × (auto ? totUnits : count)
  grossYr = 12 × (rentMo + otherMo)
  netYr   = 12 × (rentMo + otherMo − expMo)
  ```

- **Impact fees** (`app/impact-fees.js:80-158`):
  - per meter = qty × (waterImpact + sewerImpact + pick(meter) + pick(vault) + pick(waterTap) + pick(sewerTap)), where pick(range) = low, high, or the mean of the two.
  - Extras = qty × pick(amount) × basisQty, with basisQty one of flat, unit, acre, resSF, amenSF, bldgSF, or pctHard = hard/100.
  - The total is materialized onto a soft SOV line as a lump sum.
- **Profit split across entities**: only on the claude branch (`budget-finance.js allocate/waterfall`). It needs the claude-branch tests to port.
- **Tests:**
  - `test/budget-calc.test.js` (8, hand-computed parity).
  - `test/calculations.test.js` (14, against the "Budget For Projects 3.0 MAIN" workbook, reading rates from `sql/seed_pricing.sql`).
  - `test/sov.test.js`, `test/guardrails.test.js`, `test/impact-fees.test.js` (18; uses `test/fee-schedules.json`), `test/input-defaults.test.js`.
  - Browser parity: suite-08 and suite-09.

#### 6.2 Investment engine (`before-tax-1.1.0`)

Rates are decimals. Year index t = 1..N, and **N+1 operating years are computed**.

```
PRI[t]   = year1PotentialIncome × (1+g)^(t−1)
Vac[t]   = PRI[t] × vacancy                       // vacancy applies to rent only
ERI[t]   = PRI[t] − Vac[t]
OI[t]    = Σ_rows year1Amount × (1+g_row)^(t−1)
GOI[t]   = ERI[t] + OI[t]
OpEx[t]  = mode percentOfGOI → GOI[t] × ratio  |  annualDollar → value × (1+g_exp)^(t−1)
NOI[t]   = GOI[t] − OpEx[t]
CapEx[t] = Σ capex rows annualAmounts[t−1]  (t ≤ N; below NOI)

Acquisition: price mode → price = input, capRate = NOI[1]/price ; cap mode → price = NOI[1]/capRate
acqCosts = price × acqCost% (0.02) ; principal = amount | price × LTV
r = annualRate/12 ; n = round(amortYears × 12)
pmt = r==0 ? P/n : P·r / (1 − (1+r)^−n) ; DS = 12·pmt          // 30/360, = Excel −PMT
Bal(m) = r==0 ? max(0, P − pmt·m) : max(0, P·(1+r)^m − pmt·((1+r)^m − 1)/r), m = min(12t, n)
loanFees = P × fee% (0.01)
unlevInit = price + acqCosts ; equity0 = price + acqCosts + loanFees − P

Sale at end of t: GSP[t] = round(NOI[t+1]/exitCap / 1000) × 1000   // NEXT-year NOI; rounded value feeds downstream
SellCost = GSP × sell% (0.05) ; NSP = GSP − SellCost − Bal(t)

CFBD[t] = NOI[t] − CapEx[t] ; CFBT[t] = CFBD[t] − DS
DSCR = NOI[t]/DS ; DebtYield = NOI[t]/P (ORIGINAL principal) ; ProjLTV = Bal(t)/GSP[t]
CoC = CFBT[t]/equity0 (ORIGINAL equity every year) ; UnlevCoC = CFBD[t]/unlevInit
ROE = CFBT[t]/NSP[t] (Analyst Pro convention) ; EqMult = (Σ_{1..t} CFBT + NSP[t]) / equity0
PropertyIRR_t = IRR([−(price+acqCosts), CFBD1, …, CFBD_t + GSP_t − SellCost_t])
LoanRate_t    = IRR([P − fees, −DS, …, −DS − Bal(t)])
EquityIRR_t   = IRR([−equity0, CFBT1, …, CFBT_t + NSP_t])
LeverageImpact = EquityIRR − PropertyIRR ; OptimalHold = argmax_t EquityIRR_t (ties → earlier)
GRM = price/PRI[1] ; $/SF = price/normSF (acres × 43,560; null if size in units) ; $/unit = price/unitCount
Sensitivity (factors .90 .95 1.00 1.05 1.10): price' = round(price·f), base LTV kept, NOI and GSP unchanged;
  recompute acqCosts, loan, equity, DS, (un)levered CoC and IRR per year.
```

- **IRR method** (`finance.js:32-68`):
  - Annual-period NPV root (not XIRR).
  - Returns null unless the flows contain both positive and negative values.
  - Grid scan of 4,000 log-spaced rates over [−0.9999, 100] to find the first bracket, then bisection (≤200 iterations, stop when |NPV| < 1e-9 or the bracket < 1e-12).
- **Period end** = purchase month + 12t − 1 months, using integer month math (`dates.js:9-14`).
- **Fixtures** (`test/fixtures/investment/`):

  | Fixture | Property | Notes |
  |---|---|---|
  | `wedgewood.json` | 7.126 ac | full annual canonical |
  | `frisco.json` | 15390 Preston Rd, 6.7 ac | |
  | `tomball.json` | 4.3 ac | |
  | `barker-cypress.json` | 2.5 ac | |
  | `combo-15ac.json` | 130,000 SF | complete sensitivity matrix |

- Tolerances (`test/investment-calculations.test.js:1-10`): ±$1.5 on dollars; gross sale price exact; ±0.006 on % and ratios; ±$0.01 on the payment.
- 17 engine tests, plus 33 assistant/insight tests; `budget-assistant.test.js` pins that the engine reproduces itself from `normalizedInput` on all five deals.

---

### 7. Infrastructure inventory

| Dependency | Kind | Where referenced (file:line) | Env var name(s) | Replace in target with |
|---|---|---|---|---|
| `budgets.finishessolutions.ai` | Prod custom domain | `README.md:14,118`; `AGENTS.md:20`; `docs/BUILD_GUIDE.md:24,222,227,239`; `docs/NAMING.md:33`; `docs/HANDOFF.md:67` | — | Target's own Vercel domain; do not reference |
| `budgets.finishessolutions.com` | Domain (older guide value) | `docs/guide.vars.example:31` | `CUSTOM_DOMAIN` | Drop |
| `reports.finishessolutions.com` | Proposed lender-package domain | `docs/NAMING.md:35`; `docs/email-export-plan.md:71` | — | Drop |
| `wonderful-rock-071c8e810` (SWA default host); staging `wonderful-rock-071c8e810-staging.centralus.7.azurestaticapps.net`; feature `wonderful-rock-071c8e810-feature.centralus.7.azurestaticapps.net` | Azure Static Web App | `README.md:15,126`; `AGENTS.md:38`; `CHANGELOG.md:457`; `docs/HANDOFF.md:72,80,109`; workflow filename and line 107; `docs/INVESTMENT_ANALYSIS_BUILD_PLAN.md:82` | — | Vercel project / preview URLs |
| `stapp-fs-budgeting-prod` | SWA resource name | `docs/BUILD_GUIDE.md:23,168,187,207,264`; `docs/NAMING.md:32`; `docs/guide.vars.example:19` | `SWA_NAME` | Vercel project |
| SWA deploy secret | GitHub secret | workflow `:55,94,146` | `AZURE_STATIC_WEB_APPS_API_TOKEN_WONDERFUL_ROCK_071C8E810` | Vercel Git integration |
| `Azure/static-web-apps-deploy@v1` + OIDC | CI action | workflow `:53,92,144,188` | — | Vercel deploys |
| Entra tenant `bfbd2cad-3f2f-42b5-a374-5867d67dde93` | Entra ID tenant (OpenID issuer) | `app/staticwebapp.config.json:19` | — | Target's existing auth (Supabase auth or target's own) |
| Entra app registration "FS Budgeting Suite" | App registration (client ID not in code) | `app/staticwebapp.config.json:20-21`; `docs/NAMING.md:40`; `docs/BUILD_GUIDE.md:201-208` | `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET` | Target auth; drop |
| SWA auth plumbing (`x-ms-client-principal`, `/.auth/me`, `/.auth/login/aad`), roles `pricing_admin` / `super_admin` | Auth | `api/shared/auth.js:3,14,19`; `app/staticwebapp.config.json:5-11,24-28` | — | Supabase JWT + a role column/claim (e.g. `profiles.role`) |
| `sql-finishes-cus-prod-fs01` (`.database.windows.net`) | Azure SQL server | `docs/BUILD_GUIDE.md:21,95-131,152`; `docs/NAMING.md:22`; `docs/guide.vars.example:17` | `SQL_SERVER` | Target Supabase Postgres |
| DB `fs-budgeting-suite` (BUILD_GUIDE, NAMING, impact-fee migration header) **and** `fs-bd-budget` (all other SQL headers) — two names for the same DB | Azure SQL DB | `docs/BUILD_GUIDE.md:22`; `sql/migrate_impact_fees.sql:11`; `sql/schema.sql:2`; `sql/migrate_budget_history_and_templates.sql:6`; `sql/publish_multifamily_*.sql:4-5`; `sql/migrate_project_op_ids.sql:11` … | `SQL_DB` | Supabase tables in the target project (e.g. `budgets`, `budget_versions`, `sov_lines`, `pricing_library`, `budget_templates`, `fee_schedules`, `investment_analyses`, `investment_analysis_versions`), using `jsonb` docs in place of `NVARCHAR(MAX)` JSON |
| Other planned DBs `fs-bd-governance`, `fs-lender-package` | Azure SQL | `docs/NAMING.md:24-25` | — | Drop |
| SQL logins `fsadmin`, `fs_budgeting_app` | DB principals | `docs/BUILD_GUIDE.md:98,144-152`; `docs/NAMING.md:26-27`; `docs/guide.vars.example:23,25` | `SQL_ADMIN_USER`, `APP_DB_USER`, `SQL_ADMIN_PASSWORD`, `APP_DB_PASSWORD` | Supabase service role, server-side only |
| SQL connection string | Secret | `api/shared/db.js:33-34`; `docs/BUILD_GUIDE.md:200,208,280,293` | `SQL_CONN` (and `SQL_CONN_STRING` in `docs/render_guide.py:6,30-33`) | Target's `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` (already used in target `api/*.js`) |
| `mssql` driver (+ tedious, @azure/*) | npm | `api/package.json:11`; `api/shared/db.js:1` | — | `@supabase/supabase-js` or a pg client |
| Resource groups `rg-finishes-data-prod`, `rg-fs-budgeting-prod`, `rg-fs-lender-package-prod`, `rg-finishes-platform-prod` | Azure RGs | `docs/NAMING.md:14-17`; `docs/BUILD_GUIDE.md:18,43,48,96…`; `docs/guide.vars.example:15-16` | `RG_DATA`, `RG_APP`, `LOCATION` (centralus) | Drop |
| `kv-finishes-prod-01`, `log-finishes-cus-prod`, `appi-fs-budgeting-prod`, `stfinishesprodfs01`, `crfinishesprod`, `asp-finishes-cus-prod-01`, `app-fs-lender-cus-prod` | Planned Azure resources (not used in code) | `docs/NAMING.md:34,42-45` | — | Drop |
| Microsoft Graph mail (`graph.microsoft.com`, `login.microsoftonline.com/{tenant}/oauth2/v2.0/token`), mailbox `automation@finishessolutions.com` → `matthews@finishessolutions.com` | Outbound mail for feedback | `api/shared/mailer.js:4,11-15,24,33-40,61-65`; `docs/FEEDBACK_SETUP.md:77-137`; `app/index.html:3299,4387`; `app/feedback.js:284,296`; `app/login.html:101` | `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `FEEDBACK_FROM`, `FEEDBACK_TO` | Drop, or use the target's own mail provider / Supabase table only |
| Anthropic API | LLM (Budget Assistant) | `api/shared/budget-assistant.js:68,78,87-100,713,1014` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`, `ANTHROPIC_FALLBACKS` | Target already has `ANTHROPIC_API_KEY` and `lib/anthropic.mjs`; reuse those, drop the `ANTHROPIC_EFFORT` / `ANTHROPIC_FALLBACKS` names |
| Google Fonts (Montserrat, IBM Plex Mono, Inter) | CDN | `app/index.html:77,3471`; `app/login.html:17` | — | Target's own fonts |
| `fs-render` vendored from `Finishes-Solutions/fs-courier` | Vendored lib | `api/shared/fs-render/package.json:5`; `docs/HANDOFF.md:357`; `app/vendor/fs-render.browser.js` | — | Target PDF pipeline (`api/pdf.js`) |
| Feature flags | App settings | `api/budget/index.js:49,78`; `api/budgets/index.js:39`; `api/shared/budget-assistant.js:840`; `api/export-config/index.js:9`; `api/investment-analysis-export/index.js:101` | `FS_ALLOW_ANON`, `FS_EXPORT_RENDERER` | Drop |
| GitHub org/repo `Finishes-Solutions/fs-budgeting-suite` | Source | `docs/BUILD_GUIDE.md:9,190`; `docs/guide.vars.example:34-37` | `GITHUB_ORG`, `GITHUB_REPO_NAME`, `GITHUB_REPO` | n/a |
| Build-guide vars | Docs tooling | `docs/guide.vars.example:9-41` | `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `SETUP_IP`, `DEFAULT_HOSTNAME`, `OWNER_TAG` | Drop |
| Test-only env | Local | `test/mock-api.js:7,207,210,1130`; `test/suite-*.js` | `APP_DIR`, `PORT`, `NO_API`, `MOCK_AI`, `CHROMIUM_PATH`, `OUT_DIR` | Target test harness |
| Webhooks / cron / timers / blob storage | — | None. No `timerTrigger` or blob bindings in `api/*/function.json`; no webhook code | — | n/a |
| Monday.com, SharePoint, Lender Package service | Planned integrations | `docs/ROADMAP.md:17-47` only, never coded | — | n/a |

`api/local.settings.json` does not exist in the local checkout, so there were no secret names to list from it.

---

### 8. Grep patterns (must NOT appear in target after integration)

```
budgets.finishessolutions.ai
budgets.finishessolutions.com
reports.finishessolutions.com
finishessolutions.ai
wonderful-rock-071c8e810
azurestaticapps.net
azure-static-web-apps-
static-web-apps-deploy
AZURE_STATIC_WEB_APPS_API_TOKEN
staticwebapp.config.json
bfbd2cad-3f2f-42b5-a374-5867d67dde93
login.microsoftonline.com
graph.microsoft.com
x-ms-client-principal
/.auth/me
/.auth/login/aad
AAD_CLIENT_ID
AAD_CLIENT_SECRET
sql-finishes-cus-prod-fs01
database.windows.net
fs-bd-budget
fs-bd-governance
fs-lender-package
fs-budgeting-suite        (match: (Initial Catalog|Database|database)\s*[=:]\s*fs-budgeting-suite|fs-budgeting-suite\.(database|azure))
stapp-fs-budgeting-prod
rg-finishes-data-prod
rg-fs-budgeting-prod
rg-fs-lender-package-prod
rg-finishes-platform-prod
kv-finishes-prod-01
appi-fs-budgeting-prod
log-finishes-cus-prod
stfinishesprodfs01
crfinishesprod
asp-finishes-cus-prod-01
app-fs-lender-cus-prod
fs_budgeting_app
fsadmin
SQL_CONN
SQL_CONN_STRING
require('mssql')
GRAPH_TENANT_ID
GRAPH_CLIENT_ID
GRAPH_CLIENT_SECRET
FEEDBACK_FROM
FEEDBACK_TO
automation@finishessolutions.com
svc_automation@finishessolutions.com
FS_ALLOW_ANON
FS_EXPORT_RENDERER
ANTHROPIC_EFFORT        (own: this platform's own variable, on main before the integration)
ANTHROPIC_FALLBACKS
52e20e96… (digest redacted)
ADMIN_PASS_SHA256
fs-courier
dbo.
```

Caveats on this list (the final check, `scripts/infra-grep.mjs`, reads the annotations: `(own: …)` skips a name this
platform already used before the integration; `(match: …)` checks the identifier only in the form that would name the
source infrastructure, here the database, since the repo name itself appears in provenance comments):

- `matthews@finishessolutions.com` is hardcoded as the feedback recipient (`app/index.html:4387`; `app/feedback.js:284,296`; `app/login.html:101`). It is also the user's own address, so grep it but expect a legitimate match.
- The role names `pricing_admin` / `super_admin` stay only if the target adopts them.
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are already target names. Do not grep them.

---

### 9. Reusable modules for integration

All modules are CommonJS (`require` / `module.exports`) or UMD unless noted. The target is ESM (`"type":"module"`; `lib/*.mjs`), so every port needs `require`→`import` and `module.exports`→`export`. UMD files can be wrapped or re-exported.

| Path (on `origin/feature`) | What it does | Deps / coupling | Tests | Effort |
|---|---|---|---|---|
| `api/shared/investment/{finance,debt,operating,disposition,returns,sensitivity,dates,constants,defaults,normalize,validation,calculate,result-rows}.js` (~1,000 lines total) | Full before-tax engine: `calculateInvestmentAnalysis(input)` | **Pure JS, zero deps**, CJS, no DB | `test/investment-calculations.test.js` (17) + five fixtures in `test/fixtures/investment/` — port tests and fixtures verbatim | **Low** |
| `api/shared/investment/insight.js` | Drivers (one-at-a-time sensitivity), diagnostics, `runScenario` what-ifs | Pure; depends on `calculate.js` | `test/budget-assistant.test.js` (part of 33) | Low |
| `api/shared/investment/from-budget.js` | Budget document → analysis input (building SF, TPC as price, derived opex ratio) | Pure; depends on `budget-calc.js`, `defaults.js` | Covered by `test/investment-api.test.js` (10) | Low |
| `api/shared/budget-calc.js` | Budget roll-up (`parts`, `grossIncome`, `expenseMonthly`, `lineQty`, `scopeSum`) | Pure, CJS, no deps | `test/budget-calc.test.js` (8), `test/calculations.test.js` (14) | **Low** |
| `api/shared/sov.js` | Doc → normalized SOV rows (lineOrder, lineKey, qty, rate, total) | Pure; depends on `budget-calc` | `test/sov.test.js` (5), `test/canonical.test.js` | Low |
| `api/shared/guardrails.js` (= `app/guardrails.js`) | Rail evaluator with `DEFAULT_POLICY`, `policyForType`, `evaluate` | Pure UMD | `test/guardrails.test.js` (12) | Low; consider making thresholds configurable data |
| `app/impact-fees.js` | Jurisdiction impact and tap fee calculator (`evaluate`, `rowAmounts`, low/avg/high) | Pure UMD | `test/impact-fees.test.js` (18) + `test/fee-schedules.json` | Low (code). The data (Waller seed `sql/migrate_impact_fees.sql:222-255`) becomes a Supabase `fee_schedules` row |
| CSI schedule logic (`csiDivKey`, `csiSchedule`, `CSI`/`CSI_DIV` table) | Division roll-up | **Embedded in `app/index.html:4645,7787-7830`**, closes over global `doc` | Browser suites 08 and 09 only | Medium (extract into a pure function taking `doc`) |
| `api/shared/canonical.js` | Canonical JSON + SHA-256 content hash (dedupes no-op saves) | Node `crypto` only | `test/canonical.test.js` (18) | Low (use WebCrypto on Edge, or keep Node runtime) |
| `api/shared/budget-review.js` | Rule-based missing-item / portfolio-median review | Pure; depends on `budget-calc` | In `budget-assistant.test.js` | Low |
| `api/shared/budget-assistant.js` (1,033 lines) | Anthropic tool-use chat: budget/analysis facts, tools, streaming under a deadline | `@anthropic-ai/sdk`, `fs` (reads `budget-system.md`), mssql `sqlStore`, SWA principal | `test/budget-assistant.test.js` (33, with mocked client and store) | **High.** Rewrite against the target's `lib/anthropic.mjs` / `assist-logic.mjs`; reuse only the tool schemas and facts builders |
| `api/shared/investment-persistence.js`, `api/shared/versioning.js`, `api/shared/projects.js`, `api/*/index.js` | Persistence, optimistic concurrency, version snapshots | **mssql + T-SQL**, Azure Functions v3 `context.res` | API tests with a stubbed pool | **High.** Re-implement as Vercel functions + Supabase; keep the semantics (immutable versions, content-hash no-op, soft delete) |
| `api/shared/investment/{export-render,legacy-render,to-fsdoc}.js` + `api/shared/fs-render/` | PDF/XLSX export of analysis and budget | pdfmake, exceljs, vendored fs-render | `test/export-render.test.js` (11), `test/to-fsdoc.test.js` | Medium (or replace with the target's `api/pdf.js`) |
| `app/investment-analysis.js` (2,630 lines) | Wizard UI for analyses | DOM, IIFE, adapter to host page | Browser suites | Medium-high (vanilla JS, so it fits the target stylistically, but it is large) |
| Data: pricing library JSON (`sql/seed_pricing.sql:3` / `test/pricing.json`); template doc (`migrate_budget_history_and_templates.sql:358-389`); opex rows (`publish_multifamily_opex_template.sql:104-113`); per-unit re-price (`publish_multifamily_input_defaults.sql`) | Seed data | JSON in T-SQL strings | `test/calculations.test.js`, `test/input-defaults.test.js` | Low to load, **but label it demo / Texas-only / unsourced** |
| `[claude] api/shared/budget-finance.js` (= `app/budget-finance.js`) | Bank-budget uplift, entity profit allocation, contract plan, waterfall, reconciliation | Pure UMD; consumes `parts()` + `csiSchedule()` output | `[claude] test/budget-finance.test.js` (13, pass) | Low-medium. Unmerged branch; Entity Master needs a table |
| `[claude] api/shared/contracts.js`, `[claude] api/shared/entities.js` | Contract generation and entity CRUD | mssql | `[claude] test/contracts-api.test.js` | High (DB rewrite); low value unless entity contracts are in scope |
| `tools/input-driven-defaults.js` | One-off migration mirror | budget-calc | `test/input-defaults.test.js` | Skip |

**Port order recommendation:**

1. `investment/*` + fixtures.
2. `budget-calc.js` + `sov.js` + CSI extraction.
3. `guardrails.js`, `impact-fees.js`.
4. `insight.js` / `from-budget.js`.
5. Supabase schema for budgets, versions, pricing library and fee schedules.
6. Assistant and UI last.

Do not port `app/index.html`. Its CALC block is duplicated in `budget-calc.js`, and the repo maintains that duplication by convention (`api/shared/budget-calc.js:1-9`).

---

# Part C: fs-cre-report-runner


Audited: 2026-10-24. Repo: `/Users/matthewsinitiere/Desktop/GitHub/fs-cre-report-runner`. Audited commit: `35c1fe4` (`matthew/nifty-mendel-hc0iwc`, identical to `origin/matthew/nifty-mendel-hc0iwc`).
Method: read-only `git log/diff/show/grep` on the repo. Builds and tests ran on `git archive` exports in the scratchpad (`cre-nifty`, `cre-main`, `cre-vigilant`, `cre-gracious`), with `env -i` (no secrets) and `FS_DELIVERY_MODE=dry-run`. No deployed URL, API, monday, Zapier, PDF.co, Regrid, Blob or model endpoint was called. `.env.local` was only read through `sed 's/=.*//'`, which prints variable names only. Its names match `.env.local.example`.

All paths below are relative to the repo root. Line numbers are for commit `35c1fe4`.

---

### 1. Purpose

The repo is a Vercel serverless pipeline for Finishes Solutions business development. A monday.com intake item (via Zapier) starts a chain of stages: parcel enrichment, then a web-searching LLM "Initial Information Report", then LLM planning, pro forma, register, risk and screening documents. Side stages produce a deterministic Preliminary Site Plan, a parcel map and AI conceptual renderings. Each stage emits branded self-contained HTML (`pdf_html`). Zapier/PDF.co convert it to PDF and file it on monday/SharePoint (`docs/ARCHITECTURE.md:1-30`, `api/_stages.js:14-27`).

There is also a separate fixture-driven "V2" renderer track (`lib/v2/*`, `api/v2/*`, `api/run.js`). Its only real data is the BD-0014 sample (`lib/v2/compat/sample.js:5-12`).

**Blunt summary:** the deterministic, ESM-portable value is in `lib/v2/site/*`, `lib/v2/financial/calc.js` and `api/_survey.js`. Everything production-facing about market research and the 5-year pro forma/IRR is LLM text, glued to monday and Zapier.

### 2. Stack and entry points

- **Stack:** Node ≥18, CommonJS (`package.json:6,20`), no build step, no framework. Dependencies: `@vercel/functions`, `@vercel/blob`, `sharp` (`package.json:23-27`). Tests use `node:test` (`package.json:8`). `vercel.json` sets every `api/**/*.js` to `maxDuration: 800` and bundles `{templates,assets,fixtures}/**`. There is no database: state lives in Vercel Blob (checkpoints, run log, renders) and monday.com columns.
- **Model layer:** `api/_lib.js` exposes `callMessages()`. It covers Anthropic Messages (streaming, `web_search_20250305` or `web_search_20260209`; default model `claude-sonnet-4-6`, `api/_lib.js:74,101`) and OpenAI Responses (default `gpt-5.5`, `api/_lib.js:237,251`). The provider is set by `MODEL_PROVIDER`, or inferred from which key is present (`api/_lib.js:19-31`). Production is documented as OpenAI (`.env.local.example` "This pipeline runs on OpenAI").

**Entry points**

| Path | Role | Deterministic? |
|---|---|---|
| `api/enrich-parcel.js` | Stage 0. Regrid / ReportAll / ArcGIS parcel lookup (`:181,:492,:417`), combines multi-polygon records (`:620`), applies the survey (`:750`, `:896`), makes the parcel outline PNG to Blob (`:953-957`), posts the parcel drop to `SITEMAP_HOOK`/`IMAGES_HOOK` (`:1032-1046`), then self-invokes run-report via `x-forwarded-host` (`:1133`) | Yes, apart from network calls |
| `api/run-report.js` | Stage 1. LLM plus web search (`maxTokens 16000, webSearch:true, webSearchMaxUses:6`, `:166-169`). 25-section Initial Information Report, prompt at `:21-27` | No (LLM) |
| `api/run-plan.js` | Stage 3. LLM "Part 1" through Highest & Best Use and Site Yield (`:58-130`, `:188-191`). Then calls `runSitePlan` in-process (`:205-225`) | LLM, plus a deterministic side call |
| `api/run-proforma.js` | Stage 4. LLM budget, sources & uses, five-year pro forma, IRR (`:160-230`, `:342-345`). House assumptions are in `ASSUMPTIONS_CONFIG` (`:60-88`) and the prompt text (`:94-150`) | No (LLM) |
| `api/run-register.js`, `api/run-risk.js`, `api/run-screening.js` | LLM register, risk and screening JSON extraction (`run-screening.js:263`). Rendered by `_screening.js` | LLM content, deterministic layout |
| `api/run-site-plan.js` + `api/_site-plan.js` | Deterministic Preliminary Site Plan (4 letter sheets, `_site-plan.js:3-9`). Returns `site_basis` text to Stage 4 (`_site-plan.js:486-539`) | Yes |
| `api/run-sitemap.js` | Deterministic parcel map SVG on letter (`:1-17`) | Yes |
| `api/run-images.js` | 5 conceptual renders: LLM prompt writing (`:121,:157,:244`), then OpenAI `gpt-image-1` generations/edits (`:74-75,:251-281`), then Blob `renderings/` (`:320`) | No |
| `api/resume.js`, `api/_checkpoint.js`, `api/_runstatus.js`, `api/_notify.js` | Checkpoint/resume on Blob, monday Run Status column, monday error updates | Infrastructure |
| `api/run.js`, `api/v2/*.js`, `api/v2/_handler.js` | V2 fixture renderers dispatched by `doc_type`. **No `SHARED_SECRET` check** (`api/v2/_handler.js:5-29`; 0 matches for `SHARED_SECRET` in `api/v2/*`, `api/run.js`) | Yes (fixture-driven) |
| `run-report.js`, `render.js`, `prompts.js`, `anthropic.js` (repo root) | **Dead.** `run-report.js:17-19` requires `../lib/anthropic`, `../lib/render`, `../lib/prompts`, which do not exist. `node -e "require('./run-report.js')"` gives `MODULE_NOT_FOUND`. They sit outside `api/`, so Vercel does not deploy them | Dead code |
| `lib/v2/financial/calc.js` | Deterministic financial engine (see §6) | Yes, pure |
| `lib/v2/site/{geometry,envelope,yield,program,economics,standards,plan}.js` | Deterministic site engine (see §6) | Yes, pure |
| `lib/v2/renderers/*.js`, `components/html.js`, `compat/*`, `delivery/index.js`, `validation/index.js`, `schemas/index.js` | V2 HTML renderers, the dry-run/preview/live delivery gate, chatter/strategy/HTML validators | Yes |
| `tools/testkit/{server,render,submit}.js` | Local pipeline UI (zero dependencies), headless render, submit CLI | Dev tool |
| `tools/run-test-deal.js` | Creates a real monday item on board `18417462993` to fire the P1 Zap (`:5,:58,:286-292`) | Dev tool, live side effects |
| `tools/probe-regrid-fields.js`, `tools/chat-kit/*`, `tools/zapier/build-template-data.js`, `tools/render-images-template.js` | Dev utilities | |
| `scripts/generate-examples.js`, `scripts/render-pdf.py` | Render the BD-0014 examples to HTML; the Python script uses Playwright for PDF | |
| `zap-jsons/*.json` (10 exports + `placeholder.js`) | Zapier exports P1–P7, BD GATE MOVING, BD MOVE GOVERNANCE (×2). See §7 | Config |

### 3. Branch comparison

| Branch | Ahead of main | Date | Content (`git diff --stat origin/main...<b>`) | Tests |
|---|---|---|---|---|
| `origin/main` | 0 | Oct 9 | Baseline | 169/169 pass |
| `origin/staging` | 0 (main is 15 ahead) | Sep 18 | Stale | n/a |
| `origin/matthew/epic-franklin-1wcgeu` | 0 | Oct 9 | Merged (PR #6/#7) | n/a |
| **`matthew/nifty-mendel-hc0iwc` (HEAD)** | **5** | **Oct 24** | `api/_survey.js` (+147, new), `api/enrich-parcel.js` (+155/-21), `tests/v2/parcel-sites.test.js` (+142, new), testkit county-line "location groups", presets `custom-ELGIN-15510`, `custom-KING-31807` | **175/175 pass** |
| `origin/matthew/vigilant-tesla-b85gbm` | 1 | Oct 9 | `api/_opportunity-info.js` (+281): deterministic one-page Opportunity Information sheet; `run-screening.js` +45; `tests/v2/opportunity-info.test.js` (+106) | 179/179 pass |
| `origin/matthew/gracious-cannon-mv37se` | 7 | Oct 20 | `for-AMP/amp-cre-documents/`: a standalone zero-dependency template kit (logic-less Mustache-subset `lib/engine.js`, `lib/html.js`, `lib/pdf.js` using Playwright/Puppeteer/Chrome/WeasyPrint fallback). 9 doc types with `template.html` + `manifest.json` + `INSTRUCTIONS.md` + example. Also a committed `for-AMP/amp-cre-documents.zip`. 17,624 insertions, mostly example HTML | 169/169; `node render.js --examples` gives 9/9 ok |
| `origin/matthew/clever-galileo-5fp9yr` | 4 | Oct 16 | Docs only: `agents/FHG-PD-01..15*.md`, `docs/AGENT-PLAN.md`, `docs/APM-AGENT-PIPELINE.md`, `knowledge/00-13*.md` (incl. `13-financial-calculation-methods.md`, `12-site-planning-standards.md`), `tools/knowledge/build.js` | n/a (no code change) |

`git merge-tree --write-tree HEAD <b>` merges cleanly for vigilant, gracious and clever-galileo.

**Best branch: `matthew/nifty-mendel-hc0iwc`.** It is a strict superset of main (main + 5 commits). It is the newest and the only branch that changes the parcel/geometry layer this integration wants: survey metes-and-bounds and the combine-multi-polygon fix. It also adds 6 tests. The other branches add parallel deliverables rather than improving the core.

Valuable only on other branches:
- **vigilant-tesla:** `api/_opportunity-info.js` is a deterministic one-page facts sheet (pattern: clamp free text, always one page). Low-to-medium value.
- **gracious-cannon:** `for-AMP/amp-cre-documents/lib/engine.js` (a safe slot-template engine that fails the render on missing required slots) and `_shared/HOUSE-ASSUMPTIONS.md`. Useful if the target wants agent-filled document templates. `lib/pdf.js` is redundant with the target's puppeteer-core/@sparticuz pipeline.
- **clever-galileo:** `knowledge/13-financial-calculation-methods.md` and `knowledge/12-site-planning-standards.md` are prose specs of the same math. Useful as port docs; no code.

### 4. Build / run / test (actual results)

Export used for all runs: `S=<scratchpad>; mkdir -p $S/cre-nifty && git -C <repo> archive origin/matthew/nifty-mendel-hc0iwc | tar -x -C $S/cre-nifty && cd $S/cre-nifty && npm install`.

| Command | Result |
|---|---|
| `npm install` | OK. Warning: `sharp@0.34.5` install script not in allowScripts (it still works). No build step exists |
| `env -i PATH=$PATH HOME=$HOME FS_DELIVERY_MODE=dry-run npm test` (`node --test tests/v2/*.test.js`) | **175 tests, 175 pass, 0 fail, 0 skipped, ~0.6 s**. No network needed: the Regrid tests stub `fetch` (`tests/v2/parcel-sites.test.js:34`) |
| Same on `origin/main` / `vigilant` / `gracious` | 169/169, 179/179, 169/169 |
| `node --test --experimental-test-coverage tests/v2/*.test.js` | `calc.js` 87% lines (uncovered 170-203 = `forSaleCashflow`). `site/economics.js` 100%, `envelope.js` 100%, `yield.js` 99%, `plan.js` 95%, `program.js` 95%, `geometry.js` 71% (dead `offsetRingFt`/`clipRectToRing` uncovered). **`api/_survey.js` 29% lines / 0% functions: the new survey code has no test.** `_lib.js` 17%, `run-site-plan.js` 37%, `run-plan.js` 51% |
| `FS_DELIVERY_MODE=dry-run node scripts/generate-examples.js` | "Generated 7 example documents". Delivery `{"mode":"dry-run","suppressedCount":0,"sentCount":0}`. The 9 HTML outputs are **byte-identical** to the committed `examples/bd-0014/html` (deterministic). It also copies the static `assets/maps/BD-0014-PARCEL-MAP.pdf` to `examples/bd-0014/pdf/` |
| `node tools/testkit/render.js` | OK: Gate 1 packet, 3 parcels, 1,619.8 KB (fonts 1,507.2 KB inline, document 112.7 KB) |
| `node tools/testkit/server.js` (PORT=48731, no `.env.local`) | Starts. `GET /healthz` returns `{"ok":true}` and `/` returns 200. Startup log: "NO KEY LOADED — stages after enrich will 500", "PARCEL_PROVIDER=none", blob local. **Without secrets only enrich pass-through, local renders and the deterministic site plan can run.** run-report, plan, proforma, register, risk, screening and images need `OPENAI_KEY` or `ANTHROPIC_KEY` (paid). Real parcels need `REGRID_TOKEN`. Not exercised further |
| `buildSitePlan` on preset `tools/testkit/presets/06-site-plan-only.json` (BD-0026, 16.16 ac, flex) | 81 ms. gross 703,803 SF, geometry delta -1.17%, setback ratio 0.883, net developable 429,214 SF, footprint 180,270 SF (coverage capped at 0.42), 307 stalls, 31 suites, total cost $28,414,311 (hard $20,752,497, carry $1,106,921, DD $142,072), break-even $8,486.95/suite/month, 2 massing bars at 120 ft depth, frontage 1,097 ft S / 682 ft N |
| `buildSurvey` on preset `custom-ELGIN-15510` with an anchor | 2.1817 ac / 95,036 SF, 4 calls, misclosure 0.001 ft, perimeter 1,403 ft. Without an anchor or provider polygon it returns the error "cannot be placed". **Re-measuring the placed polygon with `geometry.areaSqFt` gives 95,350 SF (+0.33%)**, because `_survey.js:23` uses a flat `FT_PER_DEG_LAT = 364000` and `cos(lat)` instead of `geometry.planeAt`'s WGS84 series |
| `for-AMP/amp-cre-documents`: `node render.js --examples` (gracious branch) | 9/9 `ok`, zero dependencies |

What needs network or secrets (not run): every LLM stage (`OPENAI_KEY`/`ANTHROPIC_KEY`), image generation (`OPENAI_KEY`, plus `BLOB_READ_WRITE_TOKEN` or Vercel OIDC), Regrid/ReportAll/ArcGIS enrichment, monday writes (`MONDAY_TOKEN`), Zapier delivery, and PDF (PDF.co inside Zapier; `scripts/render-pdf.py` needs Playwright/Chromium).

### 5. Areas

#### (a) Project budgets / cost estimating

There are **three independent budget implementations, with three different assumption sets**:

1. **Deterministic site-plan budget** (`lib/v2/site/economics.js:41-114`), used by `run-site-plan` and handed to Stage 4 as "FIXED INPUTS" (`api/_site-plan.js:486-539`). Drivers are in `lib/v2/site/standards.js`.
2. **V2 fixture budget** (`lib/v2/renderers/proforma.js:13-74` calling `calc.buildDevelopmentBudget`). Inputs come entirely from `fixtures/bd-0014/financial-inputs.json`. Marketing, brokerage, closing and financing carry are **hardcoded dollar overrides carried "verbatim from the V1 model"**: `marketingAmount 27074, brokerageAmount 27372, closingAmount 68422, financingCarry 292362` (`financial-inputs.json` budget block; `docs/KNOWN-LIMITATIONS.md:13-17`).
3. **Production LLM budget** (`api/run-proforma.js` SECTION 12). The LLM computes every line from the house defaults pasted into the prompt.

Data sources: county land/assessed value (Regrid `parval`/`landval`, `api/enrich-parcel.js:239-241`), operator purchase price (`api/run-site-plan.js:95-103`), and house $/SF tables. **No cost database, no RSMeans, no bid data.** The prompt mentions an optional "sponsor actual budget", passed as text (`run-proforma.js:322,338`).

Hardcoded cost and rate values:

| file:line | value |
|---|---|
| `lib/v2/site/standards.js:17-20` | ROW 4%, detention 15%, easements 5%, buffers 4% of running remainder |
| `standards.js:25` | `setbackFt: 25` (uniform perimeter) |
| `standards.js:29-45` | 350 SF/stall. Ratios: senior_for_sale 1.25/u, senior_rental 1.10/u, multifamily 1.75/u, btr/townhome/duplex 2.00/u, retail 4.5/kSF, office 3.5, medical 5.0, flex 2.0, industrial 1.5, self_storage 0.5 |
| `standards.js:50,58-60` | efficiency 0.85, maxCoverage 0.42, maxCoverageWarn 0.38, bar depth residential 66 ft / commercial 120 ft |
| `standards.js:66-79` | hard cost $/SF GBA: senior_for_sale 205, senior_rental 190, multifamily 175, btr 140, townhome 140, duplex 158, retail 185, office 250, medical 250, flex 105 (verify), industrial 105 (verify), self_storage 75 (verify) |
| `standards.js:83-92` | contingency 5% of hard, soft 13% of hard, DD 0.5% of cost (floor $10,000, cap $150,000), marketing 1.1%, brokerage 1.1%, closing 2.7%, devFeePctOfCost 0 (**unused**), sitework $4.25/SF of net developable (verify) |
| `standards.js:97-100` | ltc 0.65, loanRate 0.0725, amort 25, constructionMonths 18, leaseUpMonths 12 (**unused in lib**), avgDrawPct 0.55 (**unused**), sellingCost 5%, vacancy 10%, opex 35% of EGI, exit cap 6.5%, profit-on-cost target 30% |
| `standards.js:106-119` | unit mixes, e.g. multifamily 45% 1BR 750 SF / 40% 2BR 1,050 / 15% 3BR 1,300 |
| `lib/v2/site/economics.js:50` | fallback hard cost `{ psf: 175 }` for an unknown program key |
| `lib/v2/site/yield.js:40,44` | fallback parking 3.0 stalls/kSF; fallback avg unit 1,000 SF |
| `yield.js:114` | setback fallback **8%** of remainder when there is no geometry |
| `lib/v2/site/program.js:104-107` | SUITE_SF: retail 2,400, office 3,500, medical 3,000, flex 5,000, industrial 12,000, self_storage 0 |
| `lib/v2/site/plan.js:306` | an unclassifiable program falls back to `'retail'` |
| `api/run-proforma.js:62-87` (`ASSUMPTIONS_CONFIG`) | DD 0.5% / $10k floor / $150k cap; soft 13%; marketing 1.1%; brokerage 1.1%; closing 2.7%; acquisition 2%; contingency 5%; income growth 2%; expense growth 2%; commercial opex 7% of ERI; stabilized vacancy 10%; cost of sale 5%; forward-NOI exit; construction avg draw 55%; 18 construction months; 12 lease-up months; dev fee 0; profit target 30% |
| `api/run-proforma.js:100-106` (prompt text) | retail $185/SF + $25 TI; medical/office $250; multifamily $160-185; BTR/townhome $140; duplex $150-165; self-storage $65-85; industrial/flex $90-120 |
| `fixtures/bd-0014/financial-inputs.json` | land $270,536; DD $30,730; 12,800 SF; 8 units; $140/SF; 5%/13%; the V1 fee and carry dollar overrides above; construction rate 9.5%; LTC 65%; 14 months; equity 35% |
| `api/_screening.js:519` | printed text: "Third-party cost figures are placeholders pending a Capital rate card." |

Inconsistencies (blunt):
- The `standards.js` single values sit at the midpoints of the prompt's ranges, but they differ (for example retail TI of $25/SF exists only in the prompt).
- The site engine uses a 10% vacancy and a 6.5% exit cap for all products. The prompt uses 6% residential vacancy and a 7.5% retail cap.
- Carry: the prompt says `loan × rate × 55% × (18+12)/12` (`run-proforma.js:141`). The engine uses S-curve interest over 18 months only, with no lease-up (`economics.js:74-76`).

**Verdict: demo-to-screening quality.** The engine is honest and tested, but every rate is a single house default, with no location factor, no escalation and no product granularity beyond 12 keys. The production budget is LLM arithmetic.

#### (b) Pro forma / financial modeling

**Deterministic (`lib/v2/financial/calc.js`)**

| Function | Lines | Used in production? |
|---|---|---|
| `sourcesAndUses` | :18-32 | Yes (site economics, V2 pro forma) |
| `buildDevelopmentBudget` | :37-69 | Yes |
| `constructionDraws` | :75-89 | Yes |
| `interestCarry` | :92-102 | Yes |
| `amortize` | :108-121 | Yes |
| `dscr`, `debtYield`, `ltv`, `ltc` | :123-132 | `ltc` in site; the rest only inside `rentalHoldStabilized` |
| `projectProfit`, `profitOnCost` | :137-140 | Yes |
| `breakEvenPrice`, `breakEvenRent` | :233-243 | Yes |
| `sensitivityMatrix` | :246 | Yes |
| `rentalHoldStabilized` | :208-228 | V2 fixture only (`renderers/proforma.js:55`) |
| `irr` (bisection) | :146-160 | **No production caller.** Tests only (`grep` found 0 callers outside `calc.js` and tests) |
| `equityMultiple` | :141 | **No production caller** |
| `forSaleCashflow` | :170-203 | **Dead and untested** (coverage: lines 170-203 uncovered). Contains a no-op `(m >= i.sellStartMonth ? 0 : 0)` at :194. I checked it numerically: the sum of equity cash flows equals sales net of selling cost, minus cost, minus interest. So it is consistent, but unused |

Site economics (`lib/v2/site/economics.js:120-238`) deliberately prints **break-even and target price/rent instead of IRR** (`:9-19`). It prints no NOI, DSCR, yield on cost, NPV or exit.

**LLM (production pro forma)**

`api/run-proforma.js` asks the model for:
- a fixed five-year pro forma (`:41`);
- "three streams" IRR vectors with a forward-NOI reversion (`:202`) and re-derived IRR/EM (`:217`);
- an optimal-hold IRR by sale year and a 3×3 IRR sensitivity (`:221-223`).

**All of those are LLM-computed numbers.** The site basis text tells the same model "do not model an IRR off an unevidenced price or rent" (`api/_site-plan.js:532`), which directly contradicts `:202`.

Modeling defects:
- **Selling costs are double-counted on for-sale deals.** The budget already contains marketing, brokerage and closing (4.9% of cost: `standards.js:88-90`, `calc.js:47-51`). The break-even then also deducts `sellingCostPct` from revenue: 5% in `economics.js:143,146`, and in the V2 pro forma `sell = marketing + brokerage + closing` again (`renderers/proforma.js:23-24,31`).
- **Carry uses the permanent rate** `loanRate 0.0725` for construction interest (`economics.js:76`). The V2 fixture uses 9.5%.
- **Carry accrues interest on land** for all 18 months (land is in the draw series at index 0, `economics.js:75`) and scales by LTC proportionally, not with equity first.
- The V2 pro forma's printed carry ($292,362) is a fixture constant. Its draw table (`renderers/proforma.js:70-71`) is an illustration that is not fed back into the total.

Tests: `tests/v2/financial.test.js` (8 tests, BD-0014 totals reproduced exactly: `:7-18`) and `tests/v2/site-plan.test.js` (42 tests, including fixed-point convergence `:169`, break-even returning cost `:183`, target margin `:191`, sensitivity centre zero `:207`).

**Verdict: the engine is correct for what it computes, but it is a screening calculator, not an underwriting model.** There is no time-based operating pro forma, no NPV, no yield on cost and no exit/refi in deterministic code. The real pro forma is LLM prose.

#### (c) Site layout

This is the best part of the repo, and it is deterministic.

- **Geometry** (`lib/v2/site/geometry.js`): a local tangent plane in feet using the WGS84 degree-length series (`:21-42`), shoelace area with holes subtracted (`:113-124`), and collection area on a shared plane (`:127-138`). `offsetRingFt` / `clipRectToRing` (`:153-191`, `:241-253`) are **dead** (0 callers).
- **Envelope** (`lib/v2/site/envelope.js`): rasterizes the union of the assemblage (scanline even-odd, `:48-80`), runs an exact Felzenszwalb–Huttenlocher Euclidean distance transform (`:83-128`), thresholds at `setback/cell + 0.5` (`:264`), and traces the outline with marching squares (`:136-208`). Grid budget is 260,000 cells, cell size between 1.5 and 12 ft (`:35-37`). It returns a ratio, outline rings and `maxInsetFt`.
- **Yield** (`lib/v2/site/yield.js:73-196`): gross area, then compounding deductions, then a closed-form solve of footprint plus parking, with a coverage cap.
- **Program** (`lib/v2/site/program.js`): unit mix resolution, `floor(saleable / avgUnitSf)`, largest-remainder allocation, operator override honoured only if ≤ yield.
- **Massing** (`lib/v2/site/plan.js:126-262`): bars along the frontage axis at a depth that steps down ×0.72 to a 40 ft floor (`:227-236`), a 60 ft gap (`:138`), a min run of 1.5×depth (`:165`), and a band-depth containment test (`:187-189`).
- **Frontage** (`plan.js:59-104`): only exterior edges (a 6 ft probe, `:66`), collinear merge ≤12° (`:86`), runs ≥20 ft (`:73`).
- **Survey metes and bounds (new, `api/_survey.js`)**:
  - Bearing parser for `N42°00'00"E`, `N 42-00-00 E`, `N42.5E` (`:26-33`).
  - Traverse with misclosure (`:75-85`). Rejects if misclosure > `max(1 ft, perimeter/2000)` (`:115-116`), a loose 1:2,000 precision.
  - Placement at `anchor`, or centred on the provider polygon centroid (`:118-132`).
  - `enrich-parcel.applySurvey` (`api/enrich-parcel.js:750-785`) collapses matched records into one tract: survey area and legal, provider owner/situs/zoning, values summed.
  - Limits: no curve calls, no tie/commencing lines, no basis-of-bearing rotation (`:19-21` take bearings as grid north). Flat `364000 ft/deg` latitude constant (`:23`; about 0.33% area drift vs `geometry.js`, as measured above).
  - **No unit test** (0% function coverage).
  - The ELGIN preset's two side bearings "were computed from the four distances" (`tools/testkit/presets/custom-ELGIN-15510.json`, `legalDescription`), so its 0.001 ft closure is by construction.

Data sources: Regrid parcel GeoJSON (already EPSG:4326, `enrich-parcel.js:209`), ReportAll, ArcGIS registry, operator survey. Zoning is never parsed: setbacks are a single 25 ft perimeter, labelled an assumption (`yield.js:109-112`).

Tests: `tests/v2/site-plan.test.js` (42) and `tests/v2/parcel-sites.test.js` (6; Regrid multi-polygon merge `:121`, ID-collision `:136`).

**Verdict: realistic for screening-level massing and yield.** The geometry is careful and tested. The constraints are generic Texas assumptions with no ordinance parsing, and the survey path is new and untested.

#### (d) Plan sets

**Not present.** The closest thing is the Preliminary Site Plan: 4 letter-size sheets (site plan SVG, measurements, programme and budget, pro forma) at `api/_site-plan.js:3-9,61` (`width="8.5in" height="11in"`). There is also the letter parcel map (`api/run-sitemap.js`). There are no architectural or civil sheets, no title block standard, no 24×36 output and no CAD/DXF.

The V2 `parcelMap` renderer is a schematic that **assumes a uniform 86 ft lot depth** (`lib/v2/renderers/parcelMap.js:14,116-120`), or passes through the static `assets/maps/BD-0014-PARCEL-MAP.pdf` (`lib/v2/compat/sample.js:42`).

Hardcoded values:
- `_site-plan.js` loads Google Fonts over the network (`:467-468`).
- `_screening.js:36`: `CARD_LIMIT 6`, `LEGEND_NAME_LIMIT 8`, `TABLE_CHUNK 14`.

**Verdict: n/a.** The target already has `api/planset.js` and `PLANSET-PLAN.md`; nothing here supersedes them.

#### (e) CRE market research and reports

What it does:
- **Market research is entirely LLM web search** (`api/run-report.js:23`, PROMPT1). It asks for 25 sections, comps tables, demographics, FEMA, utilities and traffic, "using public sources". CoStar, MLS and Realist are explicitly unavailable.
- Facts are anchored by the injected Regrid/ReportAll parcel block plus the monday intake block (`run-report.js:157-159`).
- **There is no structured data source** for comps, rents, demographics, FEMA or traffic. Every number in the market sections comes from the LLM.
- Screening scores are LLM-output, clamped by `score100` (`api/_screening.js:302-306`).
- Gate vocabulary and checklists are in `api/_gate.js:19-68`, including `OS_NAME` default "Finishes Holdings Group — Enterprise Operating System" (`:19`).

Renderers and docs:
- V1 markdown goes to branded HTML through `api/_brand.js` and `_report-style.js`.
- V2 renderers in `lib/v2/renderers/*` render only the BD-0014 fixtures. `lib/v2/compat/sample.js:5-12` says the output "is always the BD-0014 sample, not whatever address was submitted".
- Validation gates (`lib/v2/validation/index.js`): chatter detection, strategy gate, and a placeholder regex (`:148`).

Images (`api/run-images.js`):
- 5 shots: aerial, ground, front, back, night (`:178-183`). The LLM writes the prompts; `gpt-image-1` renders at 1536x1024, quality medium (`:251-253`).
- The aerial optionally edits off the parcel-outline PNG with `IMAGE_INPUT_FIDELITY=high` (`:274-281`, `:448-452`).
- Results upload to Blob `renderings/<folder>/` as public files (`:319-320`).
- The file header admits these are concept art, not the real site (`:38-42`).
- The V2 photo report uses 5 placeholder PNGs (`fixtures/bd-0014/images/IMG-0*.png`; `docs/KNOWN-LIMITATIONS.md:24-26`).

Hardcoded and mock items:

| file:line | item |
|---|---|
| `api/run-proforma.js:112` | "Wedgewood basis was approx $2,400/unit/mo" (rent anchor) |
| `api/run-proforma.js:110` | retail $28-30/SF/yr NNN |
| `api/run-proforma.js:118-120` | exit caps: retail 7.50%, medical/office 7.0-7.5%, residential 6.50% |
| `api/run-proforma.js:125-130` | leverage 65-70%, rate 6.75-7.25%, amort 25-30, term 5 yr, 1.00% points, DSCR 1.25-1.40x |
| `fixtures/bd-0014/*.json` | entire BD-0014 deal (project, register, risks, images) used as the V2 data source |
| `tools/sample-images-payload.json:16-40` | five Blob URLs on `ekgzoku9zzyi3xo9.public.blob.vercel-storage.com` |
| `api/run-report.js` / `api/_brand.js` | none: no stubbed API, only a prompt |
| `api/_lib.js:74`, `:237`, `api/run-images.js:251` | model defaults `claude-sonnet-4-6`, `gpt-5.5`, `gpt-image-1` |
| TODO/FIXME | **None in source** (`git grep -nE "TODO\|FIXME\|XXX\|HACK"` matches only the validator regex itself) |

Number provenance:
- **LLM:** every market figure, comp, rent and cap choice, the 5-year pro forma, IRR, risk scores and screening scores.
- **Deterministic:** parcel area and geometry, site yield, units, site budget, break-evens, debt service, parcel map, and the outline PNG.
- **Fixtures:** all V2 documents and the photo report.

**Verdict: demo-quality as a research product.** It is a well-engineered prompt pipeline with good provenance labelling, but no data layer. The renderers and branding are polished, but they are Finishes-specific.

### 6. Formulas (ready to port and test)

Notation: `r2` = round to cents (`calc.js:251`). `pct` values are fractions.

**Development budget** (`calc.js:37-69`)
```
hard        = r2(buildingSf × hardCostPsf)
contingency = r2(hard × contingencyPctOfHard)
soft        = r2(hard × softPctOfHard)
preMkt      = land + DD + hard + contingency + soft + devFee
marketing   = marketingAmount ?? r2(preMkt × marketingPct)
brokerage   = brokerageAmount ?? r2((preMkt+marketing) × brokeragePct)
closing     = closingAmount   ?? r2((preMkt+marketing+brokerage) × closingPct)   // sequential, compounding
total       = r2(preMkt + marketing + brokerage + closing + financingCarry)
perSf = total/buildingSf ; perUnit = total/units
```
Fixture check (`tests/v2/financial.test.js:7-18`): hard 1,792,000; contingency 89,600; soft 232,960; total **2,831,056**; perSf ≈ 221.18; perUnit ≈ 353,882.

**Sources & uses** (`calc.js:18-32`): equity = r2(totalUses × equityPct); debt = totalUses − equity; balanced if |sources − uses| < 0.01.

**Draw schedule** (`calc.js:75-89`): `w_m = sin(π·m/n) + 0.25` for m = 1..n. `draw_m = r2(total·w_m/Σw)`. Rounding drift goes onto the last draw. This is a bell of monthly draws, so cumulative draws form an S-curve. Example n=4, total 1000: [280.33, 366.12, 280.33, 73.22].

**Interest carry** (`calc.js:92-102`): `bal_m = Σ draws_≤m`; `int_m = r2(bal_m × rate/12)`; `carry = Σ int_m`. Simple interest, no compounding and no interest-on-interest.

**Site-plan budget fixed point** (`economics.js:41-114`):
```
vertical = GBA × psf[program] ; sitework = netDev × 4.25 ; blendedPsf = (vertical+sitework)/GBA
DD0 = 10,000 ; carry0 = 0
repeat ≤6 (break when |ΔDD|+|Δcarry| < 1):
  out   = buildDevelopmentBudget({land, GBA, hardCostPsf: blendedPsf, 5%, 13%, devFee 0, DD, 1.1%,1.1%,2.7%, financingCarry: carry})
  DD    = clamp(out.total × 0.005, 10,000, 150,000)
  draws = [land] ++ constructionDraws(out.total − carry − land, 18)
  carry = interestCarry(draws, 0.0725).totalCarry × 0.65
```
The hard line is then split back out into vertical and sitework lines for display.

**Debt** (`calc.js:108-132`): `pmt = P·r/(1−(1+r)^−n)` with r = annual/12 and n = years×12 (`r=0 → P/n`). Annual DS = 12·pmt. DSCR = NOI/ADS. Debt yield = NOI/loan. LTV = loan/value. LTC = loan/cost. Test: P=1,000,000, 6%, 30y gives pmt 5,995.51.

**Rental-hold stabilized** (`calc.js:208-228`): GPR = units·rent·12; EGI = GPR·(1−vac); opex = EGI·opexPct; NOI = EGI − opex; value = NOI/exitCap; valueVsCost = value − cost; CFADS = NOI − ADS. BD-0014 alt scenario (8 u × $2,400, 7% vac, 42% opex, 6.5% cap, 65% LTC loan, 7.25%/30y) gives value < cost and DSCR < 1.25 (`financial.test.js:76-87`).

**IRR** (`calc.js:146-160`): bisection on periodic NPV(rate) = Σ cf_t/(1+rate)^t over [−0.9999, 10], 200 iterations, |NPV| < 1e−6. Returns `(1+periodic)^periodsPerYear − 1` (default 12, i.e. monthly flows), or null if there is no sign change. Test: [−100, 0×11, 110] gives 10%. **No NPV function is exported.** NPV exists only as the inner closure.

**Profit**: profit = gross − sellingCosts − totalCost. POC = profit/totalCost. EM = distributions/equity.

**Break-evens** (`calc.js:233-243`): for-sale `P_be = cost/(units·(1−sellPct))`. Rent `R_be = cost·cap/(1−opex)/(1−vac)/(units·12)`.

**Targets** (`economics.js:146,163`): for-sale `P_tgt = cost·(1+0.30)/(units·(1−0.05))`. Rent `R_tgt = R_be·1.30`, since value is linear in rent.

**Sensitivity** (`economics.js:206-238`): cost steps [−10,−5,0,5,10,15]% applied to hard+contingency+soft only. Revenue steps [−10,−5,0,10,20,30]% on break-even. Cell = POC. The centre cell is 0 by construction (test `:207`).

**Yield on cost / exit / NPV:** **not implemented deterministically.** The forward-NOI exit (`value = NOI_{Y6}/cap − cost of sale`) exists only as prompt text (`run-proforma.js:122`).

**Site yield** (`yield.js:73-196`, `program.js`):
```
gross = county sqft  ||  acres×43,560  ||  polygon area        (plan.js:287-293)
[if developmentSf < gross: running = developmentSf]
running ×= (1 − 0.04)                                  // ROW
running ×= setbackRatio  (measured)  else ×(1 − 0.08)  // envelope
running ×= (1 − 0.15)(1 − 0.05)(1 − 0.04)              // detention, easements, buffers
netDev = running
k = floors·eff/avgUnitSf·stallsPerUnit·350        (residential)
  = floors·eff/1000·stallsPer1000·350             (commercial)
footprint = netDev/(1+k) ; parking = netDev − footprint
if footprint/netDev > 0.42: footprint = 0.42·netDev ; parking = k·footprint ; residual = netDev − footprint − parking
GBA = footprint·floors ; saleable = GBA·0.85 ; stalls = ceil(parking/350)
avgUnitSf = Σ share·sf (mix) ; units = floor(saleable/avgUnitSf) ; allocate by largest remainder
commercial: suites = max(1, round(saleable/SUITE_SF))
```
Setback ratio = envelope cells / site cells on the rasterized union (`envelope.js:279`).

**Survey** (`_survey.js`): azimuth from a quadrant bearing: N·E = a, N·W = 360−a, S·E = 180−a, S·W = 180+a. Traverse `x += d·sin(az)`, `y += d·cos(az)`. Closure = |end|. Area = |shoelace|. Placement: lon = lon0 + x/(364000·cos lat0), lat = lat0 + y/364000.

**Fixtures:** `fixtures/bd-0014/{project,financial-inputs,business-plan,initial-information,register,risks,images}.json` plus 5 placeholder PNGs. Testkit geometry: `tools/testkit/fixtures/parcels-{3,20,empty}.geojson`, `screening-facts.json`. Presets: `tools/testkit/presets/*.json` (BD-0026 real assemblage in `01-bd-0026-real.json` and `06-site-plan-only.json`; ELGIN survey; KING cross-county). The site tests read real geometry from `tools/testkit/fixtures/parcels-3.geojson` (`tests/v2/site-plan.test.js:19`).

### 7. Infrastructure inventory

| Dependency | Kind | Where referenced | Env var(s) | Target replacement |
|---|---|---|---|---|
| `fs-bd-ai-search-platform.vercel.app` | Deployed Vercel project/domain (inferred project name `fs-bd-ai-search-platform`; no `.vercel/` link in repo) | `render.yaml:29`, `docs/DEPLOYMENT.md:82`, `docs/INTEGRATIONS.md:268`, zap P1 (`zap-jsons/exported-zap-2026-08-13T16_25_21.195Z.json` → `/api/enrich-parcel`), zap P3 (`…16_25_26.967Z.json` → `/api/run-images`) | `FS_BASE_URL` (`tools/testkit/server.js:465`) | Drop. Target's own routes; no cross-deployment calls |
| Self-invocation via `x-forwarded-host` | Stage chaining over HTTP | `api/enrich-parcel.js:1133`, `api/run-report.js:275`, `api/run-plan.js:297` | `SHARED_SECRET` | In-process calls or a Supabase-backed job queue |
| `bd-pipeline-testkit` on Render (`bd-pipeline-testkit.onrender.com`) | Hosted testkit | `render.yaml:16`, `tools/testkit/README.md:193-199` | `TESTKIT_USER`, `TESTKIT_PASS`, `TESTKIT_PUBLIC_URL`, `RENDER_EXTERNAL_URL`, `TESTKIT_URL`, `TESTKIT_MODEL`, `TESTKIT_IMAGES`, `TESTKIT_REAL_BLOB`, `PORT` | Drop |
| Vercel Blob store `ekgzoku9zzyi3xo9.public.blob.vercel-storage.com` | Public blob storage; prefixes `checkpoints/` (`api/_checkpoint.js:37,106-109`), `runs/` (`api/_runlog.js:73-76`), `screening/` (`api/run-screening.js:304-307`), `parcel-outlines/` (`api/enrich-parcel.js:956-957`), `renderings/` (`api/run-images.js:319-320`). **All `access:'public'` with predictable keys**; checkpoints hold full deal inputs | `tools/sample-images-payload.json:16-40`; `@vercel/blob` in `package.json` | `BLOB_READ_WRITE_TOKEN` (implicit), `CHECKPOINTS`, `CHECKPOINT_DIR` | Supabase Storage (private bucket plus signed URLs) and Supabase tables for checkpoints and run log |
| monday.com GraphQL `https://api.monday.com/v2` (API-Version `2024-10`) | CRM writes: `create_update` (`api/_notify.js:92-108`), `change_simple_column_value` (`api/_runstatus.js:49-81`), `create_item` (`tools/run-test-deal.js:286`) | `api/_notify.js:21`, `api/_runstatus.js:25`, `tools/run-test-deal.js:60` | `MONDAY_TOKEN`, `BD_BOARD_ID`, `RUN_STATUS_COLUMN_ID`, `RUN_STATUS_LABELS` | Supabase `projects`/run-status tables; no monday |
| monday board `18417462993` (BD Opportunities / "Business Development Intake") | Board ID | `api/_runstatus.js:22,27`, `tools/run-test-deal.js:5,58`, `.env.local.example:19`, `docs/RESUME.md:148,153`, zaps P1/P4/P6/P7 | `BD_BOARD_ID` | Supabase |
| monday column IDs | Column IDs | Run Status `color_mm7ahhp0` (`api/_runstatus.js:26`). Intake `dropdown_mm4m9cs`, `text_mm4m969b`, `text_mm4mwfe5`, `text_mm4mmtyd`, `text_mm4mjdwr` (`tools/run-test-deal.js:124-126`), plus `dropdown_mm4mmk33`, `color_mm5fqwnk`, `color_mm5fz94d`, `text_mm5fqccf`, `long_text_mm4jcsgp`, `date_mm5f5qz0`, `color_mm5fzeec`, `color_mm5fnk3q`, `color_mm5fe7p6`, `color_mm5f21v0`, `color_mm4jzba1` (`tools/run-test-deal.js`, `tools/test-deals.json`). Zap-only: `location_mm4j6gev`, `numeric_mm4s91wt`, `pulse_id_mm3g9xcm`, `text_mm4mhhf7`, `link_mm5am9px`, `boolean_mm5nex0g`, `file_mm5av9dh`, `formula_mm5a7hak`, `formula_mm5axjzy`, `id_color_mm5bszr` | | `RUN_STATUS_COLUMN_ID` | Supabase columns |
| monday template `120507781`, workspace `13764660` / "Business Development Beta" | Board creation (P7) | `zap-jsons/exported-zap-2026-08-13T16_25_38.519Z.json` | – | Drop |
| monday web hosts `finishes-solutions.monday.com/boards/…`, `finishesetc-company.monday.com/boards/18417462993/pulses/` | Links | `tools/run-test-deal.js:292`; zap P5 (`…16_25_32.531Z.json`) | – | Target project URLs |
| Zapier account `19598183`, catch hooks `428g0e0`, `42tjlh8`, `428qy9u` | Webhooks | `428g0e0` is the **hardcoded default** for `IMAGES_HOOK` (`api/enrich-parcel.js:1043`) and `IMAGE_KICKOFF_URL` (`api/run-risk.js:217`). `42tjlh8` in zap P1; `428qy9u` in zap P3 | `IMAGES_HOOK`, `IMAGE_KICKOFF_URL`, `CALLBACK_URL`, `SITEMAP_HOOK`, `ZAP3_RENDERINGS_HOOK`, `ERROR_HOOK` | Drop. Direct function calls plus Supabase rows |
| Zaps P1–P7, BD GATE MOVING, BD MOVE GOVERNANCE | Orchestration (monday trigger, Code, PDF.co, SharePoint, Outlook) | `zap-jsons/*.json` (10 files) | – | Target's own pipeline. **`zap-jsons/exported-zap-2026-08-13T16_25_41.263Z.json` (BD GATE MOVING) contains a literal `mondayToken` JWT in a Code step input (3 JWT-shaped strings). Committed 2026-08-13. Value not read. Treat it as leaked and rotate.** Do not copy `zap-jsons/` into the target |
| PDF.co (`HTMLtoPDF`, `ConvertPDFToAnything`, via Zapier `PDFcoCLIAPI@3.18.5/4.0.0`) | HTML→PDF | Zaps P2/P4/P5; `templates/pdfco/images-sheet.html`; `api/run-images.js:501`; `api/run-sitemap.js:11` comments; `tests/v2/delivery-api.test.js:17` (`https://api.pdf.co/convert`, suppressed) | – (inside Zapier) | Target PDF pipeline: `puppeteer-core` + `@sparticuz/chromium` |
| Microsoft SharePoint / Graph (`graph.microsoft.com/v1.0/drives/`) and Outlook `send_email` | File storage, email | Zaps P5 (Outlook), P6/P7/GOVERNANCE (SharePoint) | – | Supabase Storage; drop email |
| Anthropic Messages `https://api.anthropic.com/v1/messages` (version `2023-06-01`; beta `server-side-fallback-2026-07-01`; tools `web_search_20250305`/`web_search_20260209`) | LLM | `api/_lib.js:15-16,74-115`; dead copy `anthropic.js:3` | `ANTHROPIC_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS`, `ANTHROPIC_EFFORT`, `ANTHROPIC_FALLBACKS`, `MODEL_PROVIDER` | `lib/anthropic.mjs` in the target with `ANTHROPIC_API_KEY` |
| OpenAI Responses `https://api.openai.com/v1/responses` (web_search) | LLM (production default) | `api/_lib.js:17,226-251` | `OPENAI_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_TOKENS` | Target's `OPENAI_API_KEY`/`OPENAI_MODEL`, or move to `lib/anthropic.mjs` |
| OpenAI Images `…/v1/images/generations`, `…/v1/images/edits` (`gpt-image-1`) | Image generation | `api/run-images.js:74-75,251-281` | `OPENAI_KEY`, `IMAGE_MODEL`, `IMAGE_SIZE`, `IMAGE_QUALITY`, `IMAGE_INPUT_FIDELITY`, `EMIT_SHEET_HTML` | Target's `OPENAI_IMAGE_MODEL` / renderings plan |
| Regrid Parcel API v2 (`app.regrid.com/api/v2/parcels/{apn,query,address}`) | Parcel data | `api/enrich-parcel.js:181-340`; `tools/probe-regrid-fields.js:152-154` | `REGRID_TOKEN`, `REGRID_ID_FIELDS`, `PARCEL_PROVIDER` | Target already has `REGRID_TOKEN`/`REGRID_API_KEY` and a parcel service. Reuse those; port only the multi-polygon merge logic |
| ReportAll USA (`reportallusa.com/api/parcels?v=9`) | Parcel data | `api/enrich-parcel.js:489-554` | `REPORTALL_CLIENT` | Drop, or add behind the target's `PARCEL_SERVICE` |
| ArcGIS REST county registry | Parcel data | `api/enrich-parcel.js:373-486` | `PARCEL_ARCGIS` (JSON) | Optional; the target's own data layer |
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | Remote CSS | `api/_site-plan.js:467-468` | `FS_FONT_MODE`, `FS_FONT_BASE_URL` | The target's local `fonts/` |
| Render.com | Testkit host | `render.yaml` | see testkit row | Drop |
| Cron | – | **None.** No `crons` in `vercel.json` | – | n/a |
| Shared-secret auth | Request auth (V1 stages only) | e.g. `api/run-site-plan.js:192`, `api/run-sitemap.js:784`, `api/resume.js:172`. **Absent in `api/v2/_handler.js` and `api/run.js`** | `SHARED_SECRET` | The target's own guard (`api/_lib/guard.mjs`) |
| Misc config | – | `api/_gate.js:19-20`, `api/_when.js:13`, `api/enrich-parcel.js:91,812,834`, `api/run-sitemap.js:329-331,726,729,746`, `lib/v2/delivery/index.js:20`, `lib/v2/compat/intake.js:64-65`, `tools/*:CHROME_BIN` | `OS_NAME`, `ORG_NAME`, `REPORT_TZ` (`America/Chicago`), `DEFAULT_STATE`, `PARCEL_MAX`(20), `PARCEL_ACRE_TOLERANCE`(0.15), `PARCEL_ORIENTATION`, `PARCEL_PAGE1_MAX`, `PARCEL_DETAIL_PAGES`, `PARCEL_EDGE_MIN_FT`, `PARCEL_EDGE_MIN_PX`(7), `FS_DELIVERY_MODE`, `SMOKE_INLINE_FONTS`, `SMOKE_ASSET_BASE`, `CHROME_BIN` | Function args or target config constants |

Note: `FS_DELIVERY_MODE` dry-run gates **only** the V2 path (`lib/v2/delivery/index.js`, used solely by `api/v2/_handler.js`). The production V1 stages never consult it. They post to hooks and monday unless the request carries `test_mode` (e.g. `api/enrich-parcel.js:1031-1046`).

### 8. Grep patterns (must return 0 hits in the target after integration)

I checked every string below against the current target tree (`--exclude-dir=node_modules`): all have 0 hits today. Strings deliberately **not** listed, because the target already uses them: `REGRID_TOKEN`, `OPENAI_MODEL`, `CHROME_PATH`, `x-forwarded-host`, `claude-sonnet-4-6`, `gpt-image-1`, `Wedgewood` (present in target data).

```
## hosts / projects / stores
fs-bd-ai-search-platform
bd-pipeline-testkit
onrender.com
ekgzoku9zzyi3xo9
blob.vercel-storage.com
@vercel/blob
hooks.zapier.com
19598183
428g0e0
42tjlh8
428qy9u
api.monday.com
monday.com/boards
finishesetc-company
finishes-solutions.monday.com
api.pdf.co
PDFcoCLIAPI
graph.microsoft.com
reportallusa
## monday IDs
18417462993
120507781
13764660
color_mm7ahhp0
\b[a-z_]+_mm[0-9a-z]{4,6}\b        (regex: catches every monday column id above)
## env var names unique to this repo
\bANTHROPIC_KEY\b
\bOPENAI_KEY\b
MODEL_PROVIDER
SHARED_SECRET
MONDAY_TOKEN
BD_BOARD_ID
RUN_STATUS_COLUMN_ID
RUN_STATUS_LABELS
CALLBACK_URL
ERROR_HOOK
SITEMAP_HOOK
IMAGES_HOOK
ZAP3_RENDERINGS_HOOK
IMAGE_KICKOFF_URL
REPORTALL_CLIENT
PARCEL_ARCGIS
REGRID_ID_FIELDS
PARCEL_PROVIDER
PARCEL_ACRE_TOLERANCE
PARCEL_ORIENTATION
PARCEL_PAGE1_MAX
PARCEL_DETAIL_PAGES
PARCEL_EDGE_MIN_
FS_DELIVERY_MODE
FS_FONT_MODE
FS_FONT_BASE_URL
FS_BASE_URL
CHECKPOINT_DIR
TESTKIT_
SMOKE_INLINE_FONTS
SMOKE_ASSET_BASE
EMIT_SHEET_HTML
IMAGE_INPUT_FIDELITY
ANTHROPIC_FALLBACKS
ANTHROPIC_EFFORT        (own: this platform's own variable, on main before the integration)
OPENAI_MAX_TOKENS
BLOB_READ_WRITE_TOKEN
REPORT_TZ
DEFAULT_STATE
\bOS_NAME\b
## repo-specific artefacts
Finishes Holdings Group
TheAnalyst
BD-0014
BD-0026
enrich-parcel
run-test-deal
zap-jsons
mondayToken
```

### 9. Reusable modules for integration

| Path | What it does | Dependencies | Tests | Porting effort |
|---|---|---|---|---|
| `lib/v2/financial/calc.js` | Budget, S&U, draws, carry, amortize, DSCR/DY/LTV/LTC, profit/POC/EM, IRR (bisection), break-evens, sensitivity, rental-hold | **Pure**, no imports. CJS → ESM: just swap `module.exports` | 8 tests (`tests/v2/financial.test.js`), 87% lines | **Low** (≈1 h). Delete or fix dead `forSaleCashflow` (`:170-203`). Export an `npv()`. Add yield on cost and a forward-NOI exit if needed |
| `lib/v2/site/geometry.js` | WGS84 local plane, area with holes, centroid, edges, point-in-ring | Pure | Covered via site tests (71%) | **Low**. Drop dead `offsetRingFt`/`clipRectToRing`. The target may already have turf/polygon-clipping, but this is lighter |
| `lib/v2/site/envelope.js` | Assemblage union plus EDT setback envelope plus marching-squares outline | `./geometry` only; pure, CPU about 260k cells | 100% lines | **Low** (ESM swap). High value |
| `lib/v2/site/yield.js` | Gross → net developable → footprint/parking closed-form solve, coverage cap | `./standards`, `./geometry`; pure | 99% | **Low** |
| `lib/v2/site/program.js` | Unit mix, avg unit SF, largest-remainder allocation, suites | `./standards`; pure | 95% | **Low** |
| `lib/v2/site/economics.js` | Site budget fixed point, break-even/target price/rent, sensitivity | `../financial/calc`, `./standards`; pure | 100% lines | **Low** code-wise. **Medium** to fix: the selling-cost double count, using a construction rate instead of the perm rate, and adding lease-up carry |
| `lib/v2/site/standards.js` | All site/cost assumptions in one object, plus program classifier regexes | Pure data | 100% | **Low**. Move into Supabase config or a target constants module. Reconcile with the `run-proforma.js` house numbers |
| `lib/v2/site/plan.js` | Orchestrator: area authority, envelope, yield, program, budget, pro forma, massing, frontage, flags | All site modules; pure | 95%, 42 tests in `tests/v2/site-plan.test.js` | **Low–Medium** (ESM). Overlaps with the target's `MASSING-PLAN.md`, so compare before adopting |
| `api/_survey.js` | Metes-and-bounds parser, traverse/closure, placement to GeoJSON | Pure (no imports) | **None** (0% functions) | **Low** to port, **Medium** to harden: switch placement to `geometry.planeAt().toLngLat` (removes the 0.33% area drift), tighten closure to ≥1:10,000 or make it configurable, add curve calls and basis-of-bearing rotation, write tests |
| `api/_site-plan.js` | SVG site sheet plus measurement/budget/pro forma sheets; `buildSiteBasisText` | `lib/v2/site/geometry`; string HTML; Google Fonts link | 98.7% | **Medium**. Rebrand and restyle for the target; replace remote fonts; render through the target's puppeteer pipeline |
| `api/enrich-parcel.js` → `combineGeometry` (`:620`), Regrid `mapFeature`/`recordKey` multi-polygon merge (`:197-250`), `applySurvey` (`:750-785`) | Parcel record normalization | Embedded in a 1,139-line handler with Blob, hooks and monday | `tests/v2/parcel-sites.test.js` (6, stubbed fetch) | **Medium**. Extract the pure functions only; reuse the target's Regrid client |
| `api/_screening.js` `assemblageSvg`/`focusSvg` | Parcel assemblage SVG map | Pure-ish string SVG | 79% | **Medium**. Finishes-branded |
| `api/run-sitemap.js` (SVG builder part) | Scale bar, north arrow, edge labels, legend | Inline in handler | partial | **Medium** |
| `lib/v2/validation/index.js` | Chatter detection, placeholder regex, strategy gate | Pure | 97.8% | **Low**. Good guardrails for LLM output |
| `api/_lib.js` | Dual-provider streaming LLM client with web search | fetch | 17% | **Do not port.** The target has `lib/anthropic.mjs` |
| `api/run-report.js` PROMPT1, `api/run-plan.js` PROMPT_STAGE3, `api/run-proforma.js` SYSTEM_UW/HOUSE_ASSUMPTIONS | Prompt text (25-section research spec, HBU use menu, provenance rules) | none | none | **Low** as content (copy and strip Finishes, monday, "Gate" and TheAnalyst references). Do not port the LLM-computed pro forma; have the deterministic engine compute and the LLM explain |
| gracious-cannon `for-AMP/amp-cre-documents/lib/engine.js` | Safe Mustache-subset slot renderer with required-slot failures | Pure, zero dependencies | `render.js --examples` 9/9 | **Low–Medium**, if the target wants agent-filled templates |
| `lib/v2/renderers/*`, `components/html.js`, `compat/*`, `delivery/*`, `api/_checkpoint.js`, `_runstatus.js`, `_notify.js`, `resume.js`, `tools/testkit/*`, `zap-jsons/*`, root `run-report.js`/`render.js`/`prompts.js`/`anthropic.js` | V2 fixture docs, monday/Zapier/Blob plumbing, dead V1 | – | – | **Do not port.** Fixture-bound, vendor-bound or dead |

#### Top risks to carry into the integration plan
1. **A monday API token is committed in git history** (`zap-jsons/exported-zap-2026-08-13T16_25_41.263Z.json`, `mondayToken`). Rotate it, and never copy `zap-jsons/`.
2. **Public Blob objects** hold full deal checkpoints under predictable keys (`api/_checkpoint.js:105-109`).
3. **V2 endpoints have no auth** (`api/v2/_handler.js`). Dry-run mode does not cover the production V1 stages.
4. **Production financial figures (NOI, IRR, 5-yr pro forma) are LLM-computed.** Only the site-plan budget and break-evens are deterministic. The two are told to reconcile only through prompt text.
5. **The survey code is new and has no tests.** It also measures area slightly differently from `geometry.js`, a 0.33% drift.

---

