// Offline tests for the live-data endpoints (drive, tile, weather, news) with mocked upstream services.
import assert from 'node:assert/strict';
const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(b) { r.body = b; return r; }, end() { return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const seen = [];
let mode = 'ok';
globalThis.fetch = async url => {
  const u = new URL(String(url)); seen.push(u);
  if (u.host === 'api.tomtom.com' && u.pathname.startsWith('/routing/')) {
    if (mode === 'tomtom-down') return json({ error: 'x' }, 503);
    assert.equal(u.searchParams.get('traffic'), 'true');
    return json({ routes: [{ summary: { lengthInMeters: 24140, travelTimeInSeconds: 1500, noTrafficTravelTimeInSeconds: 1200, trafficDelayInSeconds: 300 }, legs: [{ points: [{ latitude: 30, longitude: -95.9 }, { latitude: 29.8, longitude: -95.8 }] }] }] });
  }
  if (u.host === 'routing.openstreetmap.de') return json({ code: 'Ok', routes: [{ distance: 16093.44, duration: 960, geometry: { coordinates: [[-95.9, 30], [-95.85, 29.9], [-95.8, 29.8]] } }] });
  if (u.host === 'api.tomtom.com' && u.pathname.includes('/traffic/')) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
  if (u.host === 'mesonet.agron.iastate.edu') { if (mode === 'ridge-down' && u.pathname.includes('ridge')) return new Response('no', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }); }
  if (u.host === 'nowcoast.noaa.gov') { assert.equal(u.searchParams.get('crs'), 'EPSG:3857'); return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/png' } }); }
  if (u.host === 'mapservices.weather.noaa.gov') return new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } });
  if (u.host === 'api.open-meteo.com') {
    const lats = u.searchParams.get('latitude').split(',');
    if (!u.searchParams.get('current')) return json({ daily: { time: ['2026-10-02', '2026-10-03', '2026-10-04'], weather_code: [81, 1, 0], temperature_2m_max: [87, 89, 90], temperature_2m_min: [73, 72, 70], precipitation_sum: [1.2, 0, 0], precipitation_probability_max: [86, 22, 5], wind_speed_10m_max: [13, 9, 8], wind_gusts_10m_max: [17, 15, 12] } });
    if (u.searchParams.get('current').includes('temperature_2m')) return json({ current: { time: '2026-10-02T13:00', temperature_2m: 88.2, apparent_temperature: 93, relative_humidity_2m: 60, precipitation: 0, weather_code: 2, wind_speed_10m: 11.4, wind_direction_10m: 160, wind_gusts_10m: 22 },
      daily: { time: ['2026-10-02', '2026-10-03'], temperature_2m_max: [91, 89], temperature_2m_min: [72, 71], precipitation_probability_max: [20, 40], precipitation_sum: [0, .1], wind_speed_10m_max: [14, 12], wind_gusts_10m_max: [25, 20] } });
    const one = { current: { time: '2026-10-02T13:00', wind_speed_10m: 12.4, wind_direction_10m: 180, wind_gusts_10m: 21 } };
    return json(lats.length > 1 ? lats.map(() => one) : one);
  }
  if (u.host === 'www.nhc.noaa.gov') return json({ activeStorms: [{ id: 'al142026', name: 'Kirk', classification: 'HU', intensity: '100', pressure: '965', latitudeNumeric: 25.1, longitudeNumeric: -90.2, movementDir: 315, movementSpeed: 10 }] });
  if (u.host === 'news.google.com') {
    if (mode !== 'google') throw new TypeError('fetch failed');
    assert.equal(u.searchParams.get('q'), '"Hines" "Katy" when:1y');
    return new Response('<rss><channel><item><title>Hines breaks ground on Katy tower - Houston Chronicle</title><link>https://news.google.com/a1</link><pubDate>Tue, 29 Sep 2026 14:00:00 GMT</pubDate><source url="https://www.houstonchronicle.com">Houston Chronicle</source></item><item><title><![CDATA[Hines &amp; partners plan Katy offices - Bisnow]]></title><link>https://news.google.com/a2</link><pubDate>Mon, 14 Sep 2026 10:00:00 GMT</pubDate><source url="https://www.bisnow.com">Bisnow</source></item></channel></rss>', { headers: { 'Content-Type': 'application/rss+xml' } });
  }
  if (u.host === 'api.gdeltproject.org') {
    if (mode === 'gdelt-text') return new Response('Please limit requests to one every 5 seconds', { status: 200 });
    assert.match(u.searchParams.get('query'), /^"(Hines Interests|Hines)" "Katy" sourcecountry:US/);
    return json({ articles: [{ url: 'https://a.com/1', title: 'Hines plans tower in Katy', seendate: '20260930T120000Z', domain: 'a.com' }, { url: 'https://b.com/1', title: 'Hines plans tower in Katy!', seendate: '20260929T120000Z', domain: 'b.com' }] });
  }
  return json({ error: 'unmocked ' + u }, 599);
};

// ---- drive ----
const { default: drive, parsePt } = await import('../api/drive.js');
assert.deepEqual(parsePt('30.0,-95.9'), [30, -95.9]); assert.deepEqual(parsePt('51,-95'), [51, -95], 'worldwide now'); assert.equal(parsePt('95,10'), null); assert.equal(parsePt('x'), null);
let res = mock(); await drive({ query: { from: '30,-95.9', to: '29.8,-95.8' }, headers: { 'x-forwarded-for': '1.1.1.1' } }, res);
assert.equal(res.code, 200); assert.equal(res.body.traffic, false); assert.equal(res.body.miles, 10); assert.equal(res.body.minutes, 16); assert.equal(res.body.line.length, 3);
process.env.TOMTOM_API_KEY = 'tt-test';
res = mock(); await drive({ query: { from: '30,-95.9', to: '29.8,-95.8' }, headers: { 'x-forwarded-for': '1.1.1.1' } }, res);
assert.equal(res.body.traffic, true); assert.equal(res.body.minutes, 25); assert.equal(res.body.typical_minutes, 20); assert.equal(res.body.delay_minutes, 5); assert.equal(res.body.miles, 15);
mode = 'tomtom-down'; res = mock(); await drive({ query: { from: '30,-95.9', to: '29.8,-95.8' }, headers: { 'x-forwarded-for': '1.1.1.1' } }, res);
assert.equal(res.body.traffic, false, 'falls back to OSRM'); assert.match(res.body.note, /TomTom 503/); mode = 'ok';
res = mock(); await drive({ query: { from: 'nope', to: '29.8,-95.8' }, headers: { 'x-forwarded-for': '1.1.1.1' } }, res); assert.equal(res.code, 400);
res = mock(); await drive({ query: { from: '29.76,-95.36', to: '48.85,2.35' }, headers: { 'x-forwarded-for': '1.1.1.1' } }, res); assert.equal(res.code, 400); assert.match(res.body.error, /too far for a drive/);

// ---- tile ----
const { default: tile, bbox3857, tileLonLat } = await import('../api/tile.js');
assert.deepEqual(bbox3857(0, 0, 0).map(Math.round), [-20037508, -20037508, 20037508, 20037508]);
const b = tileLonLat(10, 239, 422); assert.ok(b[0] < -95.6 && b[2] > -95.8 && b[1] < 30 && b[3] > 29.7, 'z10 tile over Waller');
res = mock(); await tile({ query: {}, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); assert.deepEqual(res.body, { traffic: true });
res = mock(); await tile({ query: { l: 'radar', z: '8', x: '59', y: '105' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); assert.equal(res.code, 200); assert.equal(res.headers['Content-Type'], 'image/png'); assert.match(res.headers['Cache-Control'], /s-maxage=240/);
assert.match(res.headers['X-Tile-Source'], /mesonet\.agron\.iastate\.edu GRK-N0B-0/, 'nearest radar to this tile is Fort Hood');
res = mock(); await tile({ query: { l: 'radar', z: '9', x: '120', y: '211' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res);
assert.match(res.headers['X-Tile-Source'], /HGX-N0B-0/, 'Houston tile from the Houston NEXRAD super-res scan');
mode = 'ridge-down'; res = mock(); await tile({ query: { l: 'radar', z: '9', x: '120', y: '211' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); mode = 'ok';
assert.equal(res.code, 200); assert.match(res.headers['X-Tile-Source'], /n0q/, 'falls back to the national composite');
res = mock(); await tile({ query: { l: 'traffic', z: '12', x: '958', y: '1690' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); assert.equal(res.code, 200);
assert.ok(seen.some(u => u.pathname.includes('/flow/relative0/12/958/1690.png') && u.searchParams.get('key') === 'tt-test'));
res = mock(); await tile({ query: { l: 'radar', z: '8', x: '10', y: '10' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); assert.equal(res.code, 204, 'outside Texas region skipped');
res = mock(); await tile({ query: { l: 'radar', z: '14', x: '1', y: '1' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); assert.equal(res.code, 400, 'zoom capped');
res = mock(); await tile({ query: { l: 'evil', z: '1', x: '0', y: '0' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); assert.equal(res.code, 400);
res = mock(); await tile({ query: { l: 'storms', z: '6', x: '14', y: '26' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); assert.equal(res.code, 502, 'non-image upstream is an error, not passed through');
delete process.env.TOMTOM_API_KEY;
res = mock(); await tile({ query: { l: 'traffic', z: '12', x: '958', y: '1690' }, headers: { 'x-forwarded-for': '2.2.2.2' } }, res); assert.equal(res.code, 503);

// ---- weather ----
const { default: weather, windGrid } = await import('../api/weather.js');
const g = windGrid([-96.5, 29.5, -95, 30.5]); assert.ok(g.length > 4 && g.length <= 48); assert.ok(g.every(([x, y]) => x > -96.6 && x < -94.9 && y > 29.4 && y < 30.6));
assert.ok(windGrid([-95.71, 29.98, -95.70, 29.99]).length >= 4, 'tiny view still gets a grid');
assert.deepEqual(windGrid([-80, 40, -75, 45]), [], 'outside the region');
res = mock(); await weather({ query: { kind: 'wind', bbox: '-96.5,29.5,-95,30.5' }, headers: { 'x-forwarded-for': '3.3.3.3' } }, res);
assert.equal(res.code, 200); assert.equal(res.body.points.length, g.length); assert.equal(res.body.points[0].mph, 12); assert.equal(res.body.points[0].dir, 180);
res = mock(); await weather({ query: { kind: 'forecast', at: '29.98,-95.72' }, headers: { 'x-forwarded-for': '3.3.3.3' } }, res);
assert.equal(res.code, 200); assert.equal(res.body.days.length, 3); assert.equal(res.body.days[0].conditions, 'heavy showers'); assert.equal(res.body.days[0].rain_chance_pct, 86);
res = mock(); await weather({ query: { kind: 'here', at: '29.98,-95.72' }, headers: { 'x-forwarded-for': '3.3.3.3' } }, res);
assert.equal(res.body.conditions, 'partly cloudy'); assert.equal(res.body.wind_from, 'SSE'); assert.equal(res.body.today.rain_chance_pct, 20);
res = mock(); await weather({ query: { kind: 'storms' }, headers: { 'x-forwarded-for': '3.3.3.3' } }, res);
assert.equal(res.body.storms[0].name, 'Kirk'); assert.equal(res.body.storms[0].wind_mph, 115); assert.equal(res.body.storms[0].moving, 'NW at 12 mph');
res = mock(); await weather({ query: { kind: 'wind', bbox: 'x' }, headers: { 'x-forwarded-for': '3.3.3.3' } }, res); assert.equal(res.code, 400);

// ---- news ----
const { default: news, gdeltQuery, phrase } = await import('../api/news.js');
assert.equal(phrase('Hines Holdings, LLC'), '"Hines"'); assert.equal(phrase('LLC'), ''); assert.equal(gdeltQuery('', ''), '');
res = mock(); await news({ query: { q: 'Hines Interests LP', near: 'Katy' }, headers: { 'x-forwarded-for': '4.4.4.4' } }, res);
assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(res.body.articles.length, 1, 'near-duplicate titles collapse'); assert.equal(res.body.articles[0].date, '2026-09-30');
mode = 'gdelt-text'; res = mock(); await news({ query: { q: 'Hines', near: 'Katy' }, headers: { 'x-forwarded-for': '4.4.4.4' } }, res); assert.equal(res.code, 502); assert.match(res.body.error, /busy/); mode = 'ok';
res = mock(); await news({ query: {}, headers: { 'x-forwarded-for': '4.4.4.4' } }, res); assert.equal(res.code, 400);
// Google News is tried first; GDELT only when Google fails (above: Google unreachable, GDELT answered)
mode = 'google'; res = mock(); await news({ query: { q: 'Hines Holdings LLC', near: 'Katy' }, headers: { 'x-forwarded-for': '6.6.6.6' } }, res); mode = 'ok';
assert.equal(res.code, 200); assert.equal(res.body.source, 'Google News'); assert.equal(res.body.articles.length, 2);
assert.equal(res.body.articles[0].title, 'Hines breaks ground on Katy tower'); assert.equal(res.body.articles[0].domain, 'Houston Chronicle'); assert.equal(res.body.articles[0].date, '2026-09-29');
assert.equal(res.body.articles[1].title, 'Hines & partners plan Katy offices');

// news is saved to Supabase per filing and saved articles come back when GDELT is busy
{ const store = { news_articles: [], filing_news: [] }, base = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => { const u = new URL(String(url));
    if (u.host !== 'supa.test') return base(url, opts);
    const t = u.pathname.split('/').pop();
    if ((opts.method || 'GET') === 'POST') { for (const r of JSON.parse(opts.body)) { const k = t === 'news_articles' ? ['url'] : ['filing_id', 'url'], i = store[t].findIndex(x => k.every(c => x[c] === r[c])); if (i < 0) store[t].push(r); else Object.assign(store[t][i], r); } return new Response(null, { status: 201 }); }
    assert.equal(u.searchParams.get('filing_id'), 'eq.TABS2025000001');
    return json(store.filing_news.filter(l => l.filing_id === 'TABS2025000001').map(l => ({ url: l.url, news_articles: store.news_articles.find(n => n.url === l.url) }))); };
  process.env.SUPABASE_URL = 'http://supa.test'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  res = mock(); await news({ query: { q: 'Hines', near: 'Katy', filing: 'TABS2025000001' }, headers: { 'x-forwarded-for': '5.5.5.5' } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.stored, true); assert.equal(store.news_articles.length, 1); assert.equal(store.filing_news[0].filing_id, 'TABS2025000001');
  mode = 'gdelt-text'; res = mock(); await news({ query: { q: 'Hines', near: 'Katy', filing: 'TABS2025000001' }, headers: { 'x-forwarded-for': '5.5.5.5' } }, res); mode = 'ok';
  assert.equal(res.code, 200, 'saved articles served while GDELT is busy'); assert.equal(res.body.articles[0].saved, true);
  res = mock(); await news({ query: { q: 'Hines', near: 'Katy', filing: 'not-an-id' }, headers: { 'x-forwarded-for': '5.5.5.5' } }, res); assert.equal(res.body.stored, false, 'bad ids are not written');
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; globalThis.fetch = base; }

console.log('live api tests passed');
