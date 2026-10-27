# Notes for Claude sessions on this repo

- **Changelog:** every push adds an entry at the top of `CHANGELOG.md`, under the date heading: the time in US Central (`TZ=America/Chicago date '+%-I:%M %p'`), a short title, the commit hash(es), and plain-English bullets on what changed for the people using the app. Skip the nightly "Refresh data" bot commits.
- Run `npm test` before pushing.
- **Product doc:** `PRODUCTDOC.md` is the plain-language guide for the people using the app. Whenever a push adds, changes or removes something users can see or do, update the matching section in the same push (and its "Recently added" list). Keep it non-technical: no file names, APIs or env vars.
- **Map tile features are not buildings.** In the map's vector tiles one feature id (and one MultiPolygon) can hold many separate neighbouring buildings. Never select, measure or highlight by feature id alone; start from the polygon under the click and only join pieces that meet it across a tile edge (`lib/footprint.mjs`, tested in `test/footprint.mjs`). A whole-building change on Oct 4 skipped this and selected every building in the group (fixed Oct 5).
- **Selection changes need a test with realistic data** (merged multi-building features, tile-cut buildings) and a look at a real map before pushing; unit tests on single clean shapes missed this bug.

## Integration work on the `experimental` branch

The `experimental` branch folds fs-budgeting-suite and fs-cre-report-runner into this app. Start every session by reading `docs/PROGRESS.md` (where things stand) and `docs/DECISIONS.md` (choices made and why). Plan: `docs/INTEGRATION_PLAN.md`. Audit: `docs/AUDIT.md`.

### Hard rules
- Commit and push ONLY to `experimental` in fs-real-estate-intelligence. Never push to main or staging, never force-push, and never change the source repos (Finishes-Solutions/fs-budgeting-suite, mattsinitiere/fs-cre-report-runner). They are read-only code sources.
- Never commit secrets. Put required variable names in .env.example and document them.
- Make small, frequent commits with clear messages. Push after every phase.
- Keep docs/PROGRESS.md up to date with what's done, what's next, what's blocked, and "Infra I need to set up." A future session must be able to pick up from it with no other context.
- Work autonomously: when a decision comes up, pick the best option, record it in docs/DECISIONS.md with a one-line reason, and keep going. If blocked (e.g. missing credentials), record it in docs/PROGRESS.md and move to the next piece of work.

### Infrastructure isolation (strict)
Everything runs inside fs-real-estate-intelligence: agent runs, LLM/API calls, background jobs, report and PDF generation, storage, and databases. Bring the source repos' logic into the platform and run it there. Never call them as services.
Never call, deploy to, read from, or write to anything belonging to fs-budgeting-suite or fs-cre-report-runner: their deployed URLs and APIs, Vercel projects and domains, Supabase or other databases and projects, tables, storage buckets, edge functions, queues, cron jobs, webhooks, workers, scheduled tasks, API keys, service accounts, OAuth apps, or .env values. Do not copy secret values; only copy variable NAMES, under platform-owned names.
1. Every external dependency of each source repo is listed in docs/AUDIT.md under "Infrastructure inventory," with how the platform replaces it.
2. When bringing code in, remove or replace every reference to source-repo infrastructure. Any hardcoded URL, project ref, or key pointing at the source deployments is a bug.
3. Third-party vendors (Claude API, Regrid, map or data providers, etc.) are fine, but only through this platform's own config and env vars.
4. If the platform needs a database, storage, or job runner it doesn't have, add it to the platform's own stack (local/dev setup plus env vars) and document it. Do not create or change any cloud resources. List what must be provisioned under "Infra I need to set up" in docs/PROGRESS.md.
5. Do not use any connected tools (Supabase, Vercel, Zapier, etc.) against the source projects, and do not deploy anything as part of this work.
6. Tests must not touch real infrastructure. Mock external APIs or use local services.
