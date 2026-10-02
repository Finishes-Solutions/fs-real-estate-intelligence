// Sources tab: every data source the app uses, what it feeds, and how fresh it is. Filings, changes, geocodes, AI fields and
// demographics come from the nightly build (last refresh time is in the data files); map layers and lookups are fetched live.
const NIGHTLY_UTC = [9, 17]; // .github/workflows/data.yml: 09:17 UTC = 4:17 AM Central
const BASEMAP = { dots: 'Default (MapTiler Dataviz)', streets: 'MapTiler Streets', sat: 'MapTiler Satellite', topo: 'MapTiler Topo', esri: 'ESRI (Esri World Imagery)', free: 'OpenFreeMap' };

export function initSources(ctx) {
  const { DATA, F, esc, fmtN } = ctx, root = document.getElementById('view-sources');
  const loadedAt = Date.now();
  const built = DATA.built || DATA.changes?.runs?.[0]?.built || null;
  let newer = null, checking = false, timer = 0;

  const fmtWhen = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtTime = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  function ago(t) {
    const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
    if (s < 90) return 'just now'; if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 36 * 3600) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' days ago';
  }
  function nextNightly() { const d = new Date(); d.setUTCHours(NIGHTLY_UTC[0], NIGHTLY_UTC[1], 0, 0); if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 1); return d; }
  const st = (cls, text) => '<span class="src-st ' + cls + '"><i></i>' + esc(text) + '</span>';
  const link = (name, url) => url ? '<a href="' + url + '" target="_blank" rel="noopener">' + esc(name) + '</a>' : esc(name);
  // nightly data: green within ~a day and a half, amber after that, red once two nights have been missed
  function nightlyStatus() {
    if (!built) return st('off', 'Unknown');
    const h = (Date.now() - new Date(built).getTime()) / 3600e3;
    return h < 36 ? st('fresh', 'Up to date') : h < 60 ? st('stale', 'A night behind') : st('err', 'Refresh overdue');
  }
  const liveSt = (isOn, onText = 'On · live') => isOn ? st('live', onText) : st('off', 'Off');

  async function checkNewer() {
    if (checking || !built) return; checking = true;
    try { const r = await fetch('data/changes.json', { cache: 'no-cache' }); if (r.ok) { const d = await r.json(), t = d.runs?.[0]?.built; newer = t && new Date(t) > new Date(built) ? t : null; } } catch (e) {}
    checking = false; if (ctx.view === 'sources') render();
  }

  function rows() {
    const live = ctx.live?.status?.() || { on: {}, raster: {} }, m = ctx.marketInfo?.(), a = ctx.areaInfo?.(), base = ctx.basemap?.() || 'dots';
    const runs = DATA.changes?.runs || [], approx = F.filter(f => f.approx).length, unmapped = DATA.unmapped || 0;
    const ras = (k, src, url, what) => {
      const r = live.raster?.[k] || {}, isOn = !!live.on[k];
      return { name: link(src, url), what, status: k === 'traffic' && live.trafficOK === false ? st('off', 'Needs a key') : liveSt(isOn),
        detail: 'Refreshes every ' + (r.every || '?') + ' min while on' + (isOn && r.requested ? ' · current tiles from ' + fmtTime(r.requested) : '') + '.' };
    };
    const nightly = 'Nightly at about ' + fmtTime(nextNightly()) + (built ? ' · last refresh ' + fmtWhen(built) + ' (' + ago(built) + ')' : '');
    return [
      ['Nightly data (built into the app)', [
        { name: link('TDLR TABS', 'https://www.tdlr.texas.gov/TABS/Search'), what: 'Construction registrations: every filing on the map, list, timeline and activity views', status: nightlyStatus(),
          detail: nightly + '. ' + fmtN(F.length) + ' filings registered ' + fmtDay(DATA.period.start) + ' to ' + fmtDay(DATA.period.end) + (unmapped ? '; ' + fmtN(unmapped) + ' couldn’t be mapped' : '') + '.' },
        { name: 'TABS change feed', what: 'Updates tab: new filings and status, value and date changes', status: runs.length ? nightlyStatus() : st('off', 'Starts after 2 runs'),
          detail: runs.length ? 'Latest comparison ' + fmtWhen(runs[0].built) + ' · ' + fmtN(runs.length) + ' nightly run' + (runs.length === 1 ? '' : 's') + ' kept.' : 'Each nightly pull is compared with the one before.' },
        { name: link('US Census Geocoder', 'https://geocoding.geo.census.gov/') + ' · ' + link('OpenStreetMap Nominatim', 'https://nominatim.org/'), what: 'Where each filing sits on the map', status: nightlyStatus(),
          detail: 'New addresses are located during the nightly build and cached. ' + (approx ? fmtN(approx) + ' filing' + (approx === 1 ? ' is' : 's are') + ' placed at city level (hollow markers).' : 'All filings have a street-level location.') },
        { name: link('OpenAI', 'https://openai.com/'), what: 'Use, tenant, developer and design team pulled from the filing text', status: nightlyStatus(),
          detail: 'Runs on new or changed filings in the nightly build; results cached. AI-extracted, so it can be wrong.' },
        { name: link('US Census ACS 5-year', 'https://www.census.gov/programs-surveys/acs'), what: 'Demographics layer: tract population, growth, income, home value, rent, vacancy', status: st('fresh', 'Annual'),
          detail: (m ? 'ACS 5-year estimates ending ' + m.year + ', growth compared with ' + m.baseYear + ' · ' + fmtN(m.tracts) + ' tracts. ' : 'Loads when you turn on a demographics layer. ') + 'The Census Bureau publishes a new release each December; picked up by the nightly build.' },
        { name: link('US Census LEHD LODES', 'https://lehd.ces.census.gov/data/'), what: 'Jobs by tract and industry: Jobs layers, Market view, building cards', status: a?.jobs ? st('fresh', 'Annual') : st('off', 'Not built yet'),
          detail: (a?.jobs ? 'Jobs in ' + a.jobs.year + (a.jobs.baseYear ? ', growth compared with ' + a.jobs.baseYear : '') + '. ' : '') + 'Counted where people work. The Census Bureau publishes about two years after the fact; picked up by the nightly build.' },
        { name: link('US Census Building Permits Survey', 'https://www.census.gov/construction/bps/'), what: 'Market view: new housing units permitted per county, by year and year to date', status: a?.permits ? nightlyStatus() : st('off', 'Not built yet'),
          detail: 'Monthly county files, about six weeks after the month ends. Single-family and multifamily units authorized.' },
        { name: link('Texas Comptroller sales-tax permits', 'https://data.texas.gov/Government-and-Taxes/Active-Sales-Tax-Permit-Holders/jrea-zgmq'), what: 'Market view: new business locations per month and the newest ones', status: a?.businesses ? nightlyStatus() : st('off', 'Not built yet'),
          detail: 'Active permits only (closed locations drop out), updated by the Comptroller about weekly.' },
        { name: link('Google News', 'https://news.google.com/'), what: 'Market view: local development news per county and town', status: a?.news ? nightlyStatus() : st('off', 'Not built yet'),
          detail: 'Searched nightly for development, construction, rezoning and real estate stories; kept 120 days.' },
        { name: link('US Census TIGER (us-atlas)', 'https://github.com/topojson/us-atlas'), what: 'County outlines and town names', status: st('off', 'Static'), detail: 'Boundaries change rarely; updated with the app.' },
      ]],
      ['Map layers (fetched live)', [
        { name: link('MapTiler', 'https://www.maptiler.com/copyright/') + ' · ' + link('Esri', 'https://www.esri.com/') + ' · ' + link('OpenFreeMap', 'https://openfreemap.org/'), what: 'Basemap: roads, labels, imagery', status: st('live', 'In use: ' + (BASEMAP[base] || base)),
          detail: 'Tiles load as you pan. Road and place data come from OpenStreetMap (updated by the providers weekly or better); satellite imagery dates vary by area.' },
        { name: link('OpenStreetMap', 'https://www.openstreetmap.org/copyright'), what: '3D buildings: footprints and heights', status: liveSt(document.getElementById('lyBldg')?.checked, 'On · live tiles'), detail: 'From the basemap tiles; zoom in past 14 to see them.' },
        ras('radar', 'NOAA nowCOAST (MRMS)', 'https://nowcoast.noaa.gov/', 'Rain radar'),
        ras('lightning', 'NOAA nowCOAST (lightning density)', 'https://nowcoast.noaa.gov/', 'Lightning, last 15 minutes'),
        ras('clouds', 'NOAA nowCOAST (GOES infrared)', 'https://nowcoast.noaa.gov/', 'Satellite clouds'),
        ras('storms', 'NOAA National Hurricane Center', 'https://www.nhc.noaa.gov/', 'Hurricanes and tropical storms: cones and tracks'),
        ras('traffic', 'TomTom', 'https://developer.tomtom.com/', 'Live traffic'),
        { name: link('Open-Meteo', 'https://open-meteo.com/'), what: 'Wind arrows, weather at a spot', status: liveSt(live.on.wind),
          detail: 'Hourly model data, re-read when the map moves and every 15 min' + (live.on.wind && live.windTime ? ' · showing ' + fmtTime(live.windTime + ':00') : '') + '.' },
        { name: link('Mapterhorn', 'https://mapterhorn.com/'), what: '3D terrain and hillshade', status: live.on.terrain ? (live.terrainMesh ? st('live', 'On') : st('stale', 'On · zoom in')) : st('off', 'Off'),
          detail: 'Static elevation model (does not change). The 3D surface is drawn from zoom ' + (live.terrainZoom || 10) + ' in; the shading shows at every zoom.' },
        { name: link('NASA GIBS · HLS (Landsat / Sentinel-2)', 'https://www.earthdata.nasa.gov/data/projects/hls'), what: 'Recent satellite imagery, 30 m', status: live.on.nasa ? st('live', 'On') : st('off', 'Off'),
          detail: (live.on.nasa && live.nasa ? 'Showing the ' + live.nasa.name + ' pass of ' + fmtDay(live.nasa.day) + (live.nasa.cloud != null ? ' (' + Math.round(live.nasa.cloud) + '% cloud in the scene)' : '') + '. ' : '') + 'New passes every few days, 1–3 days after capture.' },
      ]],
      ['Lookups (fetched when you use them)', [
        { name: link('MapTiler Geocoding', 'https://www.maptiler.com/cloud/geocoding/') + ' · ' + link('Nominatim', 'https://nominatim.org/') + ' · ' + link('Overpass', 'https://overpass-api.de/'), what: 'Search: addresses, places, outlines of towns, neighborhoods and whole roads', status: st('live', 'Live'), detail: 'Asked fresh each time you search.' },
        { name: link('Texas GIO StratMap parcels', 'https://geographic.texas.gov/'), what: 'Building card: owner, appraisal values, year built, acquisition date', status: st('live', 'On demand'), detail: 'Most recent county appraisal roll in StratMap (updated yearly per county). Answers cached up to a day.' },
        { name: link('Esri World Imagery Wayback', 'https://livingatlas.arcgis.com/wayback/') + ' · ' + link('USDA NAIP', 'https://naip-usdaonline.hub.arcgis.com/') + ' (Planetary Computer)', what: 'High-res site imagery: dated aerial versions in Site Imagery, and on the map', status: live.hires ? st('live', 'On map: ' + live.hires.date) : st('live', 'On demand'),
          detail: 'Sub-metre. Esri versions are listed only when the imagery at the spot changed (capture dates vary, often months to a few years old); NAIP is flown over Texas about every two years. Tiles cached a month.' },
        { name: link('USGS 3DEP lidar', 'https://www.usgs.gov/3d-elevation-program') + ' (Microsoft Planetary Computer)', what: 'Building heights', status: st('live', 'On demand'), detail: 'Survey year varies by area and is shown on each building; newer buildings may not be in the survey.' },
        { name: link('OpenStreetMap (Overpass)', 'https://overpass-api.de/'), what: 'Businesses in a building, nearest airports, restaurants, schools…', status: st('live', 'On demand'), detail: 'Cached up to an hour (nearby places) or a day (building card).' },
        { name: link('TomTom', 'https://developer.tomtom.com/') + ' / ' + link('OSRM', 'https://project-osrm.org/'), what: 'Drive times', status: live.trafficOK ? st('live', 'Live traffic') : live.trafficOK === false ? st('stale', 'No traffic data') : st('live', 'On demand'),
          detail: live.trafficOK === false ? 'No TomTom key on the server, so drive times are free-flow estimates from OpenStreetMap roads.' : 'With traffic from TomTom; OpenStreetMap routing as a fallback.' },
        { name: link('Google News', 'https://news.google.com/') + ' · ' + link('GDELT Project', 'https://www.gdeltproject.org/'), what: 'Project news on a card', status: st('live', 'On demand'), detail: 'Google News (about the last year), GDELT as a fallback; cached up to an hour.' },
        { name: link('Texas Comptroller sales-tax permits', 'https://data.texas.gov/Government-and-Taxes/Active-Sales-Tax-Permit-Holders/jrea-zgmq'), what: 'Registered businesses at a building or filing address', status: st('live', 'On demand'), detail: 'Matched on house number and street; cached up to a day. Retail, restaurant and service tenants; offices and medical often aren’t listed.' },
        { name: link('Mapillary', 'https://www.mapillary.com/') + ' · Google Street View', what: 'Street photos on the building card', status: st('live', 'On demand'), detail: 'Photo dates vary; Mapillary needs a key on the server.' },
        { name: link('OpenAI', 'https://openai.com/'), what: 'Assistant (chat and voice) and project briefs', status: st('live', 'On demand'), detail: 'Answers cite TABS numbers from the loaded filings. Briefs are cached for a week.' },
      ]],
    ];
  }

  function render() {
    if (ctx.view !== 'sources') return;
    const offline = navigator.onLine === false;
    const pills = [
      built ? '<span class="src-pill">' + nightlyStatus() + ' Filings refreshed ' + esc(ago(built)) + '</span>' : '',
      '<span class="src-pill">Next refresh ' + esc(fmtWhen(nextNightly())) + '</span>',
      '<span class="src-pill">Page loaded ' + esc(fmtTime(loadedAt)) + '</span>',
      offline ? '<span class="src-pill">' + st('stale', 'Offline') + ' showing the copy saved on this device</span>' : '',
      newer ? '<span class="src-pill">' + st('stale', 'Newer data') + ' refreshed ' + esc(fmtWhen(newer)) + ' · <button class="lnk" id="srcReload" type="button">Reload</button></span>' : '',
    ].join('');
    root.innerHTML = '<div class="vhead"><div><div class="kicker">Sources</div><h2>Where the data comes from</h2><div class="vsub">What each source feeds, how often it refreshes and when it last did. Nightly data is pulled once a night and built into the app; map layers and lookups are fetched live when you use them.</div></div></div>' +
      '<div class="src-sum">' + pills + '</div>' +
      rows().map(([title, list]) => '<section class="src-grp"><h3>' + esc(title) + '</h3><table class="src-tbl"><thead><tr><th>Source</th><th>Status</th><th>Used for · freshness</th></tr></thead><tbody>' +
        list.map(r => '<tr><td><b>' + r.name + '</b></td><td>' + r.status + '</td><td>' + esc(r.what) + '<div class="s">' + esc(r.detail) + '</div></td></tr>').join('') + '</tbody></table></section>').join('');
    root.querySelector('#srcReload')?.addEventListener('click', () => location.reload());
  }

  ctx.onView('sources', () => { render(); checkNewer(); });
  ctx.onViewChange(v => { clearInterval(timer); if (v === 'sources') timer = setInterval(render, 30e3); });
  addEventListener('online', render); addEventListener('offline', render);
}
