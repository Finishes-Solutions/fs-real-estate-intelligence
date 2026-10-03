// Offline shell for the installed app. App files: cache first, refreshed in the background.
// Data files: network first, cached copy when offline. AI/building APIs and map tiles: always network.
const VERSION = '__BUILD__', SHELL = 'fs-shell-' + VERSION, DATA = 'fs-data', LIBS = 'fs-libs';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'assistant.js', 'live.js', 'team.js', 'timeline.js', 'views.js', 'market.js', 'saved.js', 'building.js', 'mobile.js', 'field.js',
  'mapsearch.js', 'nearby.js', 'sources.js', 'planes.js', 'flightpath3d.js', 'area.js', 'regrid.js', 'site.js', 'glance.js', 'crime.js', 'fema.js', 'compare.js', 'kpis.js', 'export.js', 'metrics.js', 'charts.js', 'chatcards.js', 'reports.js',
  'lib/filter.mjs', 'lib/taxonomy.mjs', 'lib/changes.mjs', 'lib/agent-tools.mjs', 'lib/rulebook.mjs', 'lib/assist-logic.mjs', 'lib/nasa.mjs', 'lib/height.mjs', 'lib/sectors.mjs', 'lib/nearby.mjs', 'lib/reports.mjs', 'lib/demographics.mjs', 'lib/spending.mjs', 'lib/nibrs.mjs', 'lib/voice-state.mjs', 'lib/aircraft-shapes.mjs', 'lib/flightpath.mjs', 'logo.png', 'icon-192.png', 'manifest.webmanifest'];
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
