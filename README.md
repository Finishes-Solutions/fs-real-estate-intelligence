# fs-real-estate-intelligence

Finishes Solutions real estate intelligence map. The first data layer is TDLR TABS construction filings for Waller County and the six surrounding counties (Harris, Fort Bend, Montgomery, Austin, Washington, Grimes).

## How it works

- `build.mjs` runs on every deploy. It pulls the last three complete months of TABS registrations, geocodes each address (US Census batch geocoder, then OpenStreetMap Nominatim, then MapTiler for exact house-number matches, then town center as a fallback), builds county outlines and dot grids, and writes `public/data.json`.
- `src/` holds the web app: `index.html`, `app.js`, `app.css`, `logo.png`. The build copies these into `public/`.
- Maps, satellite imagery, and address search come from MapTiler (`MAPTILER_KEY` in `src/app.js` and the build environment). Restrict the key to this site's domain in the MapTiler dashboard.

## Deploy

Vercel reads `vercel.json`: install `npm install`, build `node build.mjs`, output `public/`. Redeploying refreshes the data. A monthly redeploy (Vercel deploy hook triggered from Zapier) keeps it current.

Optional build environment variables:

- `MAPTILER_KEY`: overrides the key used for geocoding during the build.
- `PERIOD_START` / `PERIOD_END`: fixed date range, for example `2026-07-01` and `2026-09-30`.
- `ONLY`: comma-separated county subset for quick test builds, for example `Waller,Austin`.

## Run locally

```
npm install
node build.mjs
npx serve public
```

The first full build takes about 10 to 15 minutes because Nominatim allows one request per second.

## Roadmap

New data layers (parcels, permits, listings, market data) should each get a fetch step in the build and a toggle in the layers panel.
