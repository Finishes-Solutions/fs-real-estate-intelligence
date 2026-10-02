# fs-real-estate-intelligence

Finishes Solutions real estate intelligence map for Waller County and the six surrounding counties (Harris, Fort Bend, Montgomery, Austin, Washington, Grimes). The core data layer is two years of TDLR TABS construction registrations, enriched with AI classification and Census tract demographics.

## What's in the app

- **Map**: every filing placed where it will be built, with box / shape / radius / county selection, a month slider (play through what is under construction), and a census-tract demographics layer (growth, income, home value, rent, vacancy).
- **Timeline**: monthly pipeline of value (or count) under construction, stacked by type, county or use; drag across it to filter. Below it, a Gantt of every matching project. Hatched bars are dates we estimated because the filer left them blank.
- **Who's building**: developers/owners, architects and GCs ranked by activity; click one to filter the map to their portfolio.
- **What changed**: week-over-week new filings, status, value and date changes, and filings that disappeared from TABS.
- **Ask**: plain-English questions ("medical over $2M near Katy starting next year") become filters you can see and undo, plus a short answer that cites TABS numbers from the matched filings only.
- **AI project brief** on any filing: what it is, timing, who's involved, area context.
- **Saved searches** (per browser) with "N new" counts, shareable links (all filters live in the URL), and an **RSS feed** for any search (`/api/feed?...`), which works with any reader or Zapier "RSS → email" for alerts.
- **3D buildings and building panel**: zoom in to see buildings in 3D (OpenStreetMap footprints and heights from the MapTiler tiles). Click one for its appraisal-district parcel (owner, market/land/improvement value, year built, acquisition date, land area) from the free Texas GIO StratMap parcel service, businesses mapped inside it (OpenStreetMap), construction filings on the parcel, the census tract snapshot, an orbit camera, a Google Street View link, and a Mapillary street photo if `MAPILLARY_TOKEN` is set.
- Exports: HTML report, Excel, CSV (now including use, developer, design team and timeline columns).

## How the data works

```
GitHub Action (weekly, or manual)          Vercel (every deploy)
  node build.mjs                             node build.mjs --assemble
   ├ TABS list, 24 months, per county/month   └ copies src/ + data/ + lib/ to public/
   ├ TABS detail pages      (cache)
   ├ geocoding              (cache)          Vercel functions (api/)
   ├ OpenAI enrichment      (cache)            ask.js   question → filters → grounded answer
   ├ change feed vs last run                   brief.js per-project brief (CDN-cached a week)
   ├ ACS tract demographics                    feed.js  RSS for any filter
   └ commits data/  ──────────────push──────▶ deploy
```

- `data/regions.json`: counties (TABS id + FIPS), ring counties, bounding box, months of history. Adding a county is a JSON edit.
- `data/filings.json`, `data/geo.json`, `data/changes.json`, `data/market.json`: what the site loads.
- `data/cache/`: TABS details, geocodes and AI results, committed so each weekly run only fetches what's new. Files are written one entry per line so git diffs stay small.
- The build refuses to overwrite data if TABS suddenly returns less than half of last week's filings (set `ALLOW_SHRINK=1` to force).
- `lib/`: code shared by the build, the functions and the browser (filter spec, use taxonomy, OpenAI client).

The first full run takes a few hours (Nominatim allows one request per second); later runs take minutes.

## Setup

1. **Vercel → Project → Settings → Environment Variables**: `OPENAI_API_KEY` (type Sensitive, Production + Preview). Optional `OPENAI_MODEL` (default `gpt-5-mini`, falling back to `gpt-4.1-mini` / `gpt-4o-mini`). Optional `MAPILLARY_TOKEN` (free client token from mapillary.com/dashboard/developers) for street-level photos in the building panel.
2. **GitHub → Settings → Secrets and variables → Actions**: secret `OPENAI_API_KEY`. Optional: secret `ZAPIER_DIGEST_WEBHOOK` (a Zapier catch hook gets a weekly summary of new filings), secret `MAPTILER_KEY`, secret `CENSUS_KEY`, variable `OPENAI_MODEL`.
3. **OpenAI dashboard**: set a monthly budget cap on the project that owns the key. The site is public, so the cap is the hard spending limit.
4. Run **Actions → Refresh data → Run workflow** once (or push a change under `build/`). The schedule (Mondays) only runs on the default branch. The old Zapier monthly deploy hook is no longer needed.

## Environment variables (build)

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enrichment. Without it the build runs and filings simply have no AI fields. |
| `OPENAI_MODEL` | Preferred model. |
| `AI_MAX_ROWS`, `AI_CONCURRENCY` | Cap filings enriched per run (default 40000) and parallel requests (default 6). |
| `MAPTILER_KEY` | Geocoding fallback (defaults to the site key). |
| `CENSUS_KEY` | Optional Census API key. |
| `ONLY` | County subset for test runs, e.g. `Waller,Austin`. Other counties keep last run's data. |
| `PERIOD_START` / `PERIOD_END` | Fixed date range (`YYYY-MM-DD`). Default: 24 months back to yesterday. |
| `REBUILD_GEO`, `REBUILD_MARKET` | Force a rebuild of base geometry / demographics. |
| `ZAPIER_DIGEST_WEBHOOK` | POST a weekly digest of new filings. |
| `ALLOW_SHRINK` | Allow a run with far fewer filings than last time. |

## Run locally

```
npm install
npm test                 # synthetic fixture + API tests (mocked OpenAI) + offline pipeline test
DATA_DIR=test/.data/ node build.mjs --assemble && npx serve public   # UI on synthetic data
node build.mjs           # real refresh (needs network access to TDLR, Census, OpenAI)
```

## Known limits

- Costs and dates are filer estimates; about four in ten filings lack a start or end date and get an estimated span (shown hatched).
- Use, tenant, developer, architect and GC are extracted by AI from the filing text and can be wrong or missing. Single-asset LLCs often hide the real sponsor.
- The AI endpoints' per-IP rate limit is per function instance (best effort). The OpenAI budget cap is the real limit; a Vercel Firewall rate-limit rule on `/api/*` adds a second one.
- The change feed starts with the second weekly run.
- Building heights are only as good as OpenStreetMap; unmapped heights get a default. StratMap parcel fields depend on what each appraisal district supplies (year built and acquisition date are often blank), and Texas does not disclose sale prices.
- Business listings come from OpenStreetMap and are incomplete, especially in suburban strip centers.
- Building permits are not included: the City of Houston stopped publishing permit data in December 2025 and the other counties have no open feed.
