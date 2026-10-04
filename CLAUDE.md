# Notes for Claude sessions on this repo

- **Changelog:** every push adds an entry at the top of `CHANGELOG.md`, under the date heading: the time in US Central (`TZ=America/Chicago date '+%-I:%M %p'`), a short title, the commit hash(es), and plain-English bullets on what changed for the people using the app. Skip the nightly "Refresh data" bot commits.
- Run `npm test` before pushing.
- **Product doc:** `PRODUCTDOC.md` is the plain-language guide for the people using the app. Whenever a push adds, changes or removes something users can see or do, update the matching section in the same push (and its "Recently added" list). Keep it non-technical: no file names, APIs or env vars.
