// Offline shell for the installed app. App files: cache first, refreshed in the background.
// Data files: network first, cached copy when offline. AI/building APIs and map tiles: always network.
const VERSION = '__BUILD__', SHELL = 'fs-shell-' + VERSION, DATA = 'fs-data', LIBS = 'fs-libs';
const FILES = ['./', 'index.html', 'app.css', 'workspace.css', 'app.js', 'workspace.js', 'assistant.js', 'live.js', 'team.js', 'timeline.js', 'views.js', 'market.js', 'saved.js', 'building.js', 'mobile.js', 'nav.js', 'settings.js', 'field.js', 'siteplan.js', 'sitefiles.js', 'teamlib.js', 'rulesheets.js', 'sp-worker.js',
  'mapsearch.js', 'nearby.js', 'sources.js', 'sitereports.js', 'planes.js', 'flightpath3d.js', 'planes3d.js', 'quicklayers.js', 'layerfilters.js', 'cardtabs.js', 'area.js', 'regrid.js', 'site.js', 'utilities.js', 'glance.js', 'crime.js', 'crimeus.js', 'fema.js', 'places.js', 'devlayers.js', 'env.js', 'owner.js', 'google.js', 'reportkit.js', 'markets.js', 'drivetime.js', 'traffic.js', 'airports.js', 'airreport.js', 'compare.js', 'kpis.js', 'export.js', 'metrics.js', 'charts.js', 'chatcards.js', 'mkcharts.js', 'motion.js', 'cursors.js', 'reports.js',
  '__FEASIBILITY__', 'lib/filter.mjs', 'lib/siteplan.mjs', 'lib/sitecompose.mjs', 'lib/sitelayout.mjs', 'lib/sitefoodtruck.mjs', 'lib/sitefuel.mjs', 'lib/sitestem.mjs', 'lib/sitecommunity.mjs', 'lib/siteparking.mjs', 'lib/sitepad.mjs', 'lib/sitecorner.mjs', 'lib/sitepods.mjs', 'lib/streetnet.mjs', 'lib/rulesheet.mjs', 'lib/streetedit.mjs', 'lib/streetnames.mjs', 'lib/customtypes.mjs', 'lib/buildings.mjs', 'lib/siteedit.mjs', 'lib/planview.mjs', 'lib/planstages.mjs', 'lib/planruns.mjs', 'lib/planask.mjs', 'lib/planbrief.mjs', 'lib/sitefiles.mjs', 'lib/project.mjs', 'lib/render.mjs', 'lib/titleblock.mjs', 'lib/planset.mjs', 'lib/plandesign.mjs', 'lib/massing.mjs', 'lib/bimplan.mjs', 'lib/bim.mjs', 'lib/sheetkit.mjs', 'lib/terrain.mjs', 'lib/sheets/site.mjs', 'lib/sheets/arch.mjs', 'lib/sheets/eng.mjs', 'lib/sheets/fuel.mjs', 'lib/reports/fema.mjs', 'lib/reports/crime.mjs', 'lib/reports/crimeus.mjs', 'lib/reports/env.mjs', 'lib/reports/geojson.mjs', 'lib/reports/plain.mjs', 'lib/reports/courses.mjs', 'lib/aimodels.mjs', 'lib/aiprices.mjs', 'lib/planpick.mjs', 'lib/planmap.mjs', 'lib/sitetools.mjs', 'lib/stalls.mjs', 'lib/proforma.mjs', 'lib/guardrails.mjs', 'lib/sitesheet.mjs', 'lib/utilities.mjs', 'lib/taxonomy.mjs', 'lib/changes.mjs', 'lib/agent-tools.mjs', 'lib/rulebook.mjs', 'lib/assist-logic.mjs', 'lib/nasa.mjs', 'lib/height.mjs', 'lib/sectors.mjs', 'lib/nearby.mjs', 'lib/reports.mjs', 'lib/demographics.mjs', 'lib/marketcalc.mjs', 'lib/marketstats.mjs', 'lib/spending.mjs', 'lib/nibrs.mjs', 'lib/voice-state.mjs', 'lib/aircraft-shapes.mjs', 'lib/aircraft-meshes.mjs', 'lib/flightpath.mjs', 'lib/geomatch.mjs', 'lib/screen.mjs', 'lib/markets.mjs', 'lib/correlate.mjs', 'lib/footprint.mjs', 'lib/cardclick.mjs', 'lib/places.mjs', 'lib/env.mjs', 'lib/layeruse.mjs', 'lib/http.mjs', 'lib/urlstate.mjs', 'lib/maptiler.mjs', 'lib/vendor/polyclip.mjs', 'logo.png', 'icon-192.png', 'manifest.webmanifest', 'lib/sitetract.mjs', 'lib/sitecenter.mjs', 'lib/sitegen.mjs', 'lib/sitegencom.mjs', 'lib/siteparcels.mjs'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('fs-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}
async function networkFirst(req, name) {
  const c = await caches.open(name);
  try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; } catch (e) { return (await c.match(req)) || Response.error(); }
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.pathname.includes('/api/')) return;
    if (u.pathname.includes('/data/')) return e.respondWith(networkFirst(req, DATA));
    return e.respondWith(staleWhileRevalidate(req, SHELL));
  }
  if (LIB_HOSTS.includes(u.hostname)) e.respondWith(staleWhileRevalidate(req, LIBS));
});
