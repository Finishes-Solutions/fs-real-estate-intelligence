# Notes for Claude sessions on this repo

- **Changelog:** every push adds an entry at the top of `CHANGELOG.md`, under the date heading: the time in US Central (`TZ=America/Chicago date '+%-I:%M %p'`), a short title, the commit hash(es), and plain-English bullets on what changed for the people using the app. Skip the nightly "Refresh data" bot commits.
- Run `npm test` before pushing.
- **Product doc:** `PRODUCTDOC.md` is the plain-language guide for the people using the app. Whenever a push adds, changes or removes something users can see or do, update the matching section in the same push (and its "Recently added" list). Keep it non-technical: no file names, APIs or env vars.
- **Map tile features are not buildings.** In the map's vector tiles one feature id (and one MultiPolygon) can hold many separate neighbouring buildings. Never select, measure or highlight by feature id alone; start from the polygon under the click and only join pieces that meet it across a tile edge (`lib/footprint.mjs`, tested in `test/footprint.mjs`). A whole-building change on Oct 4 skipped this and selected every building in the group (fixed Oct 5).
- **Selection changes need a test with realistic data** (merged multi-building features, tile-cut buildings) and a look at a real map before pushing; unit tests on single clean shapes missed this bug.
