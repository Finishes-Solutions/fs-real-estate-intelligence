// Sources tab: every data source the app uses, what it feeds, and how fresh it is. Filings, changes, geocodes, AI fields and
// demographics come from the nightly build (last refresh time is in the data files); map layers and lookups are fetched live.
const NIGHTLY_UTC = [9, 17]; // .github/workflows/data.yml: 09:17 UTC = 4:17 AM Central
const BASEMAP = { dots: 'Default (MapTiler Dataviz)', streets: 'MapTiler Streets', sat: 'MapTiler Satellite', topo: 'MapTiler Topo', esri: 'ESRI (Esri World Imagery)', free: 'OpenFreeMap' };

export function initSources(ctx) {
  const { DATA, F, esc, fmtN } = ctx, root = document.getElementById('view-sources');
  const loadedAt = Date.now();
  const built = DATA.built || DATA.changes?.runs?.[0]?.built || null;
  let newer = null, checking = false, timer = 0;
  // the Market numbers (area.json) and census tracts (market.json) load when their pages first open; Data & help asks for
  // them itself, and until they answer those rows read "Checking…" instead of "Not built yet"
  let waitArea = false, waitTracts = false, triedArea = false, triedTracts = false; // tried: ask once; if the file never arrives the rows say Not built yet (no retry loop)

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

  // County data loads (api/devdata?meta=1): when each source last loaded, read once per visit
  let devMeta = null, devAsked = false;
  function devStatus(...keys) {
    if (!devMeta) return st('off', devMeta === false ? 'Not loaded yet' : 'Checking…');
    const ls = keys.map(k => devMeta[k]).filter(Boolean); if (!ls.length) return st('off', 'Not loaded yet');
    if (ls.some(l => l.status === 'failed')) return st('err', 'Last load failed');
    const at = Math.min(...ls.map(l => new Date(l.at).getTime())), h = (Date.now() - at) / 3600e3;
    return h < 36 ? st('fresh', 'Checked ' + ago(at)) : h < 60 ? st('stale', 'A night behind') : st('err', 'Overdue');
  }
  const devN = (...keys) => { const n = keys.reduce((t, k) => t + (devMeta?.[k]?.rows || 0), 0); return n ? fmtN(n) + ' rows. ' : ''; };
  function devRows() {
    if (!devAsked) { devAsked = true; fetch('api/devdata?meta=1').then(r => r.ok ? r.json() : null).then(d => { devMeta = d?.sources && Object.keys(d.sources).length ? d.sources : false; if (ctx.view === 'sources') render(); }).catch(() => { devMeta = false; }); }
    return [
      { name: link('Harris Central Appraisal District', 'https://hcad.org/hcad-resources/hcad-public-data/'), what: 'Building Permits layer and permits on property cards (Harris County only)', status: devStatus('hcad-permits'),
        detail: devN('hcad-permits') + 'The permits the district records for appraisal, from its weekly files (only re-read when they change), last 24 months, placed on the parcel. Values and contractors aren’t listed. No other county or city in the region publishes permits as open data.' },
      { name: link('City of Houston Plat Tracker', 'https://www.houstontx.gov/planning/DevelopRegs/') + ' · ' + link('Fort Bend County', 'https://www.fortbendcountytx.gov/') + ' · ' + link('Montgomery CAD', 'https://mcad-tx.org/') + ' · Waller, Austin and Washington CADs', what: 'Plats & New Subdivisions layer',
        status: devStatus('coh-plats', 'fbc-subdivisions', 'mcad-subdivisions'),
        detail: devN('coh-plats', 'fbc-subdivisions', 'mcad-subdivisions', 'waller-subdivisions', 'austin-subdivisions', 'washington-subdivisions') + 'Houston plat applications for the city and its ETJ (last 24 months) and Fort Bend recorded subdivisions (10 years) carry dates. The Montgomery, Waller, Austin and Washington maps don’t, so their subdivisions count as new from the night they first appear here. Grimes publishes none with names.' },
      { name: link('TxDOT Project Tracker', 'https://apps3.txdot.gov/apps-cq/project_tracker/'), what: 'TxDOT Projects layer, roadwork near a property', status: devStatus('txdot'),
        detail: devN('txdot') + 'Projects planned, under way, or finished in the last two years. Dates and costs are TxDOT estimates.' },
      { name: link('TCEQ water districts', 'https://www14.tceq.texas.gov/iwud/') + ' · ' + link('Texas Bond Review Board', 'https://www.brb.texas.gov/'), what: 'Water Districts (MUDs) layer, district on property cards', status: devStatus('tceq-districts'),
        detail: devN('tceq-districts') + 'Active districts with TCEQ’s outlines (some years old) and creation dates (a few hundred district pages are read each night until all are), plus tax rate and bonds outstanding from the Bond Review Board’s latest yearly report.' },
      { name: link('Texas Education Agency', 'https://tea.texas.gov/'), what: 'Schools layer, nearest schools on property cards', status: devStatus('tea-schools'),
        detail: devN('tea-schools') + 'TEA’s school directory with state ratings, and enrollment from TEA’s latest yearly count. Enrollment forecasts aren’t public.' }
    ];
  }
  function ensureData() {
    if (!ctx.areaInfo?.() && !waitArea && !triedArea && ctx.areaData) { waitArea = triedArea = true; ctx.areaData().catch(() => null).then(() => { waitArea = false; render(); }); }
    if (!ctx.marketInfo?.() && !waitTracts && !triedTracts && ctx.loadMarket) { waitTracts = triedTracts = true; ctx.loadMarket().catch(() => null).then(() => { waitTracts = false; render(); }); }
  }
  function rows() {
    ensureData();
    const live = ctx.live?.status?.() || { on: {}, raster: {} }, m = ctx.marketInfo?.(), a = ctx.areaInfo?.(), base = ctx.basemap?.() || 'dots';
    const noArea = () => waitArea && !a ? st('off', 'Checking…') : st('off', 'Not built yet'), noTracts = () => waitTracts && !m ? st('off', 'Checking…') : st('off', 'Not built yet');
    const runs = DATA.changes?.runs || [], approx = F.filter(f => f.approx).length, unmapped = DATA.unmapped || 0;
    const ras = (k, src, url, what) => {
      const r = live.raster?.[k] || {}, isOn = !!live.on[k];
      return { name: link(src, url), what, status: k === 'traffic' && live.trafficOK === false ? st('off', 'Needs a key') : liveSt(isOn),
        detail: 'Refreshes every ' + (r.every || '?') + ' min while on' + (isOn && r.requested ? ' · current tiles from ' + fmtTime(r.requested) : '') + '.' };
    };
    const nightly = 'Nightly at about ' + fmtTime(nextNightly()) + (built ? ' · last refresh ' + fmtWhen(built) + ' (' + ago(built) + ')' : '');
    return [
      ['Nightly data (built into the app)', [
        { name: link('TDLR TABS', 'https://www.tdlr.texas.gov/TABS/Search'), what: 'Construction registrations: every filing on the map, list, Timeline and Companies pages', status: nightlyStatus(),
          detail: nightly + '. ' + fmtN(F.length) + ' filings registered ' + fmtDay(DATA.period.start) + ' to ' + fmtDay(DATA.period.end) + (unmapped ? '; ' + fmtN(unmapped) + ' couldn’t be mapped' : '') + '.' },
        { name: 'TABS change feed', what: 'Changes page: new filings and status, value and date changes', status: runs.length ? nightlyStatus() : st('off', 'Starts after 2 runs'),
          detail: runs.length ? 'Latest comparison ' + fmtWhen(runs[0].built) + ' · ' + fmtN(runs.length) + ' nightly run' + (runs.length === 1 ? '' : 's') + ' kept.' : 'Each nightly pull is compared with the one before.' },
        { name: link('US Census Geocoder', 'https://geocoding.geo.census.gov/') + ' · ' + link('OpenStreetMap Nominatim', 'https://nominatim.org/'), what: 'Where each filing sits on the map', status: nightlyStatus(),
          detail: 'New addresses are located during the nightly build and cached. ' + (approx ? fmtN(approx) + ' filing' + (approx === 1 ? ' is' : 's are') + ' placed at city level (hollow markers).' : 'All filings have a street-level location.') },
        { name: link('OpenAI', 'https://openai.com/'), what: 'Use, tenant, developer and design team pulled from the filing text', status: nightlyStatus(),
          detail: 'Runs on new or changed filings in the nightly build; results cached. AI-extracted, so it can be wrong.' },
        { name: link('US Census ACS 5-year', 'https://www.census.gov/programs-surveys/acs'), what: 'Demographics layer: tract population, growth, income, home value, rent, vacancy', status: st('fresh', 'Annual'),
          detail: (m ? 'ACS 5-year estimates ending ' + m.year + ', growth compared with ' + m.baseYear + ' · ' + fmtN(m.tracts) + ' tracts. ' : 'Loads when you turn on a demographics layer. ') + 'The Census Bureau publishes a new release each December; picked up by the nightly build.' },
        { name: link('US Census LEHD LODES', 'https://lehd.ces.census.gov/data/'), what: 'Jobs by tract and industry: Jobs layers, Market view, building cards', status: a?.jobs ? st('fresh', 'Annual') : noArea(),
          detail: (a?.jobs ? 'Jobs in ' + a.jobs.year + (a.jobs.baseYear ? ', growth compared with ' + a.jobs.baseYear : '') + '. ' : '') + 'Counted where people work. The Census Bureau publishes about two years after the fact; picked up by the nightly build.' },
        { name: link('US Census Building Permits Survey', 'https://www.census.gov/construction/bps/'), what: 'Market view: new housing units permitted per county, by year and year to date', status: a?.permits ? nightlyStatus() : noArea(),
          detail: 'Monthly county files, about six weeks after the month ends. Single-family and multifamily units authorized.' },
        { name: link('Texas Comptroller sales-tax permits', 'https://data.texas.gov/Government-and-Taxes/Active-Sales-Tax-Permit-Holders/jrea-zgmq'), what: 'Market view: new business locations per month and the newest ones', status: a?.businesses ? nightlyStatus() : noArea(),
          detail: 'Active permits only (closed locations drop out), updated by the Comptroller about weekly.' },
        { name: link('Google News', 'https://news.google.com/'), what: 'Market view: local development news per county and town', status: a?.news ? nightlyStatus() : noArea(),
          detail: 'Searched nightly for development, construction, rezoning and real estate stories; kept 120 days.' },
        { name: link('BLS Consumer Expenditure Survey', 'https://www.bls.gov/cex/') + ' × Census ACS', what: 'Consumer spending estimates per tract (total, per household, dining out, home furnishings, apparel…): map layer, Market view, building cards', status: m?.spendYear ? st('fresh', 'CE ' + m.spendYear) : noTracts(),
          detail: 'Modeled, not measured: households by income in each tract × what households at that income spend nationally (read from the BLS income quintiles), adjusted to the South. The BLS publishes once a year (September); picked up by the nightly build.' },
        { name: link('Texas Comptroller sales-tax allocations', 'https://comptroller.texas.gov/transparency/local/allocations/sales-tax/'), what: 'Market view: city sales tax collected per month, a real local spending trend', status: a?.salesTax ? nightlyStatus() : noArea(),
          detail: (a?.salesTax ? a.salesTax.cities + ' cities since ' + a.salesTax.since + '. ' : '') + 'The city\'s share of sales tax, paid monthly about two months after the sales. Picked up by the nightly build.' },
        { name: link('BLS Local Area Unemployment Statistics', 'https://www.bls.gov/lau/'), what: 'Building cards: county unemployment rate and a year earlier; Texas and metro rates', status: a?.unemployment ? nightlyStatus() : noArea(),
          detail: (a?.unemployment ? 'Latest month ' + a.unemployment + '. ' : '') + 'Monthly, about seven weeks after the month ends; the newest month is preliminary.' },
        { name: link('FRED (St. Louis Fed)', 'https://fred.stlouisfed.org/') + ' · ' + link('New York Fed SOFR', 'https://www.newyorkfed.org/markets/reference-rates/sofr'), what: 'Market view: 10-yr and 5-yr Treasury, SOFR and the 30-yr mortgage rate', status: a?.rates ? nightlyStatus() : noArea(),
          detail: (a?.rates ? 'As of ' + a.rates + '. ' : '') + 'Daily rates (mortgage rate weekly), picked up by the nightly build.' },
        { name: link('Zillow Observed Rent Index', 'https://www.zillow.com/research/data/'), what: 'Building cards: typical asking rent in the ZIP and its change over a year', status: a?.rents ? nightlyStatus() : noArea(),
          detail: (a?.rents ? 'Through ' + a.rents + '. ' : '') + 'Monthly, all home types (single-family, condo, apartments). Not every ZIP is covered.' },
        { name: link('CFPB HMDA', 'https://ffiec.cfpb.gov/data-browser/'), what: 'Market view: home loans originated per county', status: a?.mortgages ? nightlyStatus() : noArea(),
          detail: (a?.mortgages ? 'Year ' + a.mortgages + '. ' : '') + 'Published once a year (spring) for the year before.' },
        { name: link('Houston Police NIBRS incidents', 'https://www.houstontx.gov/police/cs/Monthly_Crime_Data_by_Street_and_Police_Beat.htm'), what: 'Crime map layer, crime reports for any selected area (PDF / CSV), the assistant’s crime answers, and crime within 0.5 mile on building cards (Houston)', status: st('fresh', 'Nightly'),
          detail: 'HPD republishes the yearly file monthly; the nightly sync keeps the last 25 months in the database. Houston city only for now.' },
        { name: link('FBI Crime Data Explorer', 'https://cde.ucr.cjis.gov/') + ' · ' + link('US Census Geocoder', 'https://geocoding.geo.census.gov/'), what: 'Crime by city / county on building and parcel cards, the City / County Crime Report (PDF / CSV), state rankings and the assistant’s answers about crime outside Houston', status: st('fresh', 'Weekly'),
          detail: 'Offenses each police department reports to the FBI, by calendar year, for the whole US. Every city and county department is saved in the app’s crime library and re-read monthly (a department not in it yet is asked live). The newest full year is shown; the FBI keeps adding late reports, and some departments report only part of a year or have stopped reporting (the card says so). Department-level only: no street-level detail.' },
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
        { name: link('adsb.lol', 'https://adsb.lol/') + ' · ' + link('airplanes.live', 'https://airplanes.live/'), what: 'Live Planes: aircraft positions, altitude, speed and routes, anywhere', status: live.ext?.planes?.on ? st('live', 'On · live') : st('off', 'Off'),
          detail: 'Community ADS-B receivers (open data, ODbL). Refreshes every 10 seconds while on' + (live.ext?.planes?.on && live.ext.planes.time ? ' · ' + fmtN(live.ext.planes.count) + ' aircraft as of ' + fmtTime(live.ext.planes.time) : '') + '. Some military and private aircraft are hidden.' },
        { name: 'Low-flight history (from adsb.lol)', what: 'Low Flight Paths layer, the Air Traffic line on filing cards and the Air Traffic Report', status: live.ext?.flight_paths?.available === false ? st('stale', 'Not set up yet') : live.ext?.flight_paths?.sampled_days ? st('fresh', live.ext.flight_paths.sampled_days + ' days') : st('live', 'Every 5 min'),
          detail: 'A snapshot of aircraft below 3,000 ft over the region every minute, kept in the database for 400 days. Counts are an exposure index (how much low traffic), not a count of distinct flights.' },
        { name: link('FAA aircraft registry', 'https://registry.faa.gov/aircraftinquiry/'), what: 'Who a plane is registered to: plane card and the assistant', status: st('live', 'Nightly'),
          detail: 'The FAA’s Releasable Aircraft Database (every US N-number), loaded into the database each night. US aircraft only; the registered owner is often an LLC, trust or lessor rather than the operator.' },
        { name: link('adsb.lol traces', 'https://adsb.lol/') + ' · ' + link('planespotters.net', 'https://www.planespotters.net/') + ' · ' + link('adsbdb', 'https://www.adsbdb.com/'), what: 'Plane card: this flight\'s path (2D, and 3D when the map is tilted), photo, maker, operator, year built',
          status: st('live', 'On demand'), detail: 'Looked up when a plane card opens. Flight paths are adsb.lol\'s community traces (ODbL), refreshed every 20 s; photos are credited to their photographers and link back to planespotters.net.' },
        { name: link('Open-Meteo', 'https://open-meteo.com/'), what: 'Wind arrows, weather at a spot', status: liveSt(live.on.wind),
          detail: 'Hourly model data, re-read when the map moves and every 15 min' + (live.on.wind && live.windTime ? ' · showing ' + fmtTime(live.windTime + ':00') : '') + '.' },
        { name: link('Mapterhorn', 'https://mapterhorn.com/'), what: '3D terrain and hillshade', status: live.on.terrain ? (live.terrainMesh ? st('live', 'On') : st('stale', 'On · zoom in')) : st('off', 'Off'),
          detail: 'Static elevation model (does not change). The 3D surface is drawn from zoom ' + (live.terrainZoom || 10) + ' in; the shading shows at every zoom.' },
        { name: link('NASA GIBS · HLS (Landsat / Sentinel-2)', 'https://www.earthdata.nasa.gov/data/projects/hls'), what: 'Recent satellite imagery, 30 m', status: live.on.nasa ? st('live', 'On') : st('off', 'Off'),
          detail: (live.on.nasa && live.nasa ? 'Showing the ' + live.nasa.name + ' pass of ' + fmtDay(live.nasa.day) + (live.nasa.cloud != null ? ' (' + Math.round(live.nasa.cloud) + '% cloud in the scene)' : '') + '. ' : '') + 'New passes every few days, 1–3 days after capture.' },
      ]],
      ['Development pipeline (nightly, County data)', devRows()],
      ['Lookups (fetched when you use them)', [
        { name: link('MapTiler Geocoding', 'https://www.maptiler.com/cloud/geocoding/') + ' · ' + link('Nominatim', 'https://nominatim.org/') + ' · ' + link('Overpass', 'https://overpass-api.de/'), what: 'Search: addresses, places, outlines of towns, neighborhoods and whole roads', status: st('live', 'Live'), detail: 'Asked fresh each time you search.' },
        { name: link('Texas GIO StratMap parcels', 'https://geographic.texas.gov/'), what: 'Building card: owner, appraisal values, year built, acquisition date', status: st('live', 'On demand'), detail: 'Most recent county appraisal roll in StratMap (updated yearly per county). Answers cached up to a day.' },
        { name: link('Harris Central Appraisal District', 'https://hcad.org/') + ' · ' + link('Waller, Austin, Washington and Grimes appraisal districts', 'https://waller-cad.org/') + ' (public parcel maps)', what: 'Building card: owner and appraisal values where StratMap has no parcel (all of Harris and Waller)', status: st('live', 'On demand'),
          detail: 'Read from each district’s own public parcel map when the state data has nothing at the spot. Harris records have no year built or sale date; condominium units share one outline. Answers cached up to a day.' },
        { name: link('Esri World Imagery Wayback', 'https://livingatlas.arcgis.com/wayback/') + ' · ' + link('USDA NAIP', 'https://naip-usdaonline.hub.arcgis.com/') + ' (Planetary Computer)', what: 'High-res site imagery: dated aerial versions in Site Imagery, and on the map', status: live.hires ? st('live', 'On map: ' + live.hires.date) : st('live', 'On demand'),
          detail: 'Sub-metre. Esri versions are listed only when the imagery at the spot changed (capture dates vary, often months to a few years old); NAIP is flown over Texas about every two years. Tiles cached a month.' },
        { name: link('USGS 3DEP lidar', 'https://www.usgs.gov/3d-elevation-program') + ' (Microsoft Planetary Computer)', what: 'Building heights', status: st('live', 'On demand'), detail: 'Survey year varies by area and is shown on each building; newer buildings may not be in the survey.' },
        { name: link('Google Maps Platform', 'https://mapsplatform.google.com/'), what: 'Google base maps, Google 3D, Google results in search and Google place cards', status: ctx.google?.has3d?.() || ctx.google?.enabled?.() ? st('live', 'On demand') : st('off', 'Not set up'),
          detail: 'Paid per use with a free monthly allowance; the site caps place searches each month. Google content is shown with Google’s logo and on Google’s map, and isn’t stored.' },
        { name: link('TCEQ', 'https://gisweb.tceq.texas.gov/arcgis/rest/services/Public') + ' · ' + link('US EPA', 'https://www.epa.gov/frs') + ' · ' + link('Railroad Commission of Texas', 'https://gis.rrc.texas.gov/GISViewer/') + ' · ' + link('USFWS Wetlands', 'https://www.fws.gov/program/national-wetlands-inventory') + ' · ' + link('USDA Soil Survey', 'https://sdmdataaccess.sc.egov.usda.gov/'), what: 'Environment layers and the Environmental report', status: st('live', 'On demand'),
          detail: 'Read live from each agency’s map service when a layer is on or a report runs; layers cached a day, tiles a month. TCEQ and EPA update their records continuously; wetlands and soils change rarely.' },
        { name: link('Texas Comptroller franchise tax', 'https://comptroller.texas.gov/taxes/franchise/account-status/search'), what: 'Company behind a property owner: status, registered agent, officers', status: st('live', 'On demand'), detail: 'Officers come from the company’s latest Public Information Report (filed yearly with the franchise tax report). Cached up to a week.' },
        { name: link('Overture Maps Places', 'https://docs.overturemaps.org/guides/places/') + ' · ' + link('Foursquare Open Source Places', 'https://docs.foursquare.com/data-products/docs/access-fsq-os-places'), what: 'Businesses & Places layer, businesses in a building, business search', status: st('live', 'Monthly'),
          detail: 'About 300,000 businesses and places in the seven counties, merged from both open datasets (Overture includes records from Meta, Microsoft and BrightQuery). Reloaded on the 3rd of each month; closed places and doubtful pins are left out.' },
        { name: link('OpenStreetMap (Overpass)', 'https://overpass-api.de/'), what: 'Businesses in a building, nearest airports, restaurants, schools…', status: st('live', 'On demand'), detail: 'Cached up to an hour (nearby places) or a day (building card).' },
        { name: link('TomTom', 'https://developer.tomtom.com/') + ' / ' + link('OSRM', 'https://project-osrm.org/'), what: 'Drive times', status: live.trafficOK ? st('live', 'Live traffic') : live.trafficOK === false ? st('stale', 'No traffic data') : st('live', 'On demand'),
          detail: live.trafficOK === false ? 'Live traffic isn’t available on this site, so drive times are free-flow estimates from OpenStreetMap roads.' : 'With traffic from TomTom; OpenStreetMap routing as a fallback.' },
        { name: link('Google News', 'https://news.google.com/') + ' · ' + link('GDELT Project', 'https://www.gdeltproject.org/'), what: 'Project news on a card', status: st('live', 'On demand'), detail: 'Google News (about the last year), GDELT as a fallback; cached up to an hour.' },
        { name: link('Texas Comptroller sales-tax permits', 'https://data.texas.gov/Government-and-Taxes/Active-Sales-Tax-Permit-Holders/jrea-zgmq'), what: 'Registered businesses at a building or filing address', status: st('live', 'On demand'), detail: 'Matched on house number and street; cached up to a day. Retail, restaurant and service tenants; offices and medical often aren’t listed.' },
        { name: link('FEMA flood maps (NFHL)', 'https://www.fema.gov/flood-maps/national-flood-hazard-layer') + ' · ' + link('TxDOT traffic counts', 'https://www.txdot.gov/data-maps/traffic-count-maps.html'), what: 'Building card Site section: flood zone and vehicles per day on nearby roads', status: st('live', 'On demand'), detail: 'Read live from the agencies’ map services; cached up to a week.' },
        { name: link('FEMA National Flood Hazard Layer', 'https://www.fema.gov/flood-maps/national-flood-hazard-layer') + ' · ' + link('OpenFEMA', 'https://www.fema.gov/about/openfema/data-sets') + ' · ' + link('FEMA National Risk Index', 'https://hazards.fema.gov/nri/'), what: 'Flood Zones layer and FEMA reports: flood zone shares, NFIP flood insurance claims, disaster declarations since 2000, expected annual loss by hazard', status: st('live', 'On demand'),
          detail: 'Flood map tiles cached a month; reports built live (OpenFEMA claims are refreshed by FEMA monthly, the Risk Index yearly).' },
        { name: link('TCEQ water districts', 'https://www.tceq.texas.gov/gis') + ' · City of Houston TIRZ · ' + link('CDFI Fund Opportunity Zones', 'https://www.cdfifund.gov/opportunity-zones') + ' · ' + link('Census school districts', 'https://tigerweb.geo.census.gov/'), what: 'Building card Site section: MUDs and other districts, tax increment zones, Opportunity Zones, school district', status: st('live', 'On demand'), detail: 'Boundaries change rarely; cached up to a week.' },
        { name: link('OpenStreetMap power lines', 'https://wiki.openstreetmap.org/wiki/Power_networks') + ' · ' + link('PUC Texas CCN maps', 'https://www.puc.texas.gov/industry/water/utilities/gis/') + ' · ' + link('City of Houston GIS', 'https://geohub.houstontx.gov/'), what: 'Building card Utilities row and the Power, Water & Sewer Lines layer: power lines and substations, water and sewer service areas, Houston sewer and water mains', status: st('live', 'On demand'),
          detail: 'Distances from the parcel edge; cached up to a week. Street power lines are only partly mapped in OpenStreetMap; CCN maps are updated by the PUC quarterly; mains are published for Houston only.' },
        { name: link('EPA ECHO', 'https://echo.epa.gov/') + ' · Houston METRO', what: 'Building card Site section: regulated facilities within 0.25 mile with violation and hazardous-waste flags; bus stops nearby', status: st('live', 'On demand'), detail: 'A screening flag, not a Phase I environmental review.' },
        { name: link('Texas Comptroller mixed beverage receipts', 'https://data.texas.gov/Government-and-Taxes/Mixed-Beverage-Gross-Receipts/naix-2893'), what: 'Building card Site section: alcohol sales at bars and restaurants at the address', status: st('live', 'On demand'), detail: 'Monthly gross receipts reported by each permit holder; a strong signal of how busy a restaurant or bar is.' },
        { name: link('Mapillary', 'https://www.mapillary.com/') + ' · Google Street View', what: 'Street photos on the building card', status: st('live', 'On demand'), detail: 'Photo dates vary; Mapillary needs a key on the server.' },
        { name: link('Regrid', 'https://regrid.com/'), what: 'Parcel Lines layer and Regrid details on the building card (paid, capped)', status: (() => { const u = ctx.regridUsage?.(); return u?.records ? st('live', fmtN(u.records.used) + ' / ' + fmtN(u.records.cap) + ' records · ' + fmtN(u.tiles.used) + ' / ' + fmtN(u.tiles.cap) + ' tiles') : st('live', 'On demand'); })(),
          detail: 'Hard monthly caps: 1,800 parcel records and 180,000 tiles (plan: 2,000 / 200,000), so it never goes into overage. Each parcel looked up is saved and free after that; tiles are cached a week.' },
        { name: link('OpenAI web search', 'https://platform.openai.com/docs/guides/tools-web-search'), what: 'Assistant web lookups, only when you ask it to search', status: st('live', 'On demand'), detail: 'Answers cite the source sites as links. Not cached.' },
        { name: link('OpenAI', 'https://openai.com/'), what: 'Assistant (chat and voice) and project briefs', status: st('live', 'On demand'), detail: 'Answers cite TABS numbers from the loaded filings. Briefs are cached for a week.' },
      ]],
    ];
  }

  // the Sources tab as plain rows, for the assistant (data_sources): what each source feeds and how fresh it is
  const plain = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
  ctx.sourcesList = () => ({ nightly_refresh: built, next_refresh: nextNightly().toISOString(), page_loaded: new Date(loadedAt).toISOString(),
    groups: rows().map(([title, list]) => ({ group: title, sources: list.map(r => ({ source: plain(r.name), status: plain(r.status), used_for: plain(r.what), freshness: plain(r.detail) })) })) });

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
    root.innerHTML = '<div class="vhead"><div><div class="kicker">Data &amp; help</div><h2>Where the data comes from</h2><div class="vsub">What each source feeds, how often it refreshes and when it last did. Nightly data is pulled once a night and built into the app; map layers and lookups are fetched live when you use them.</div></div><div class="vctl"><button type="button" class="btn md" id="srcIntro" title="Show the short getting-started tip at the top of the Map panel again">Getting started</button></div></div>' +
      '<div class="src-sum">' + pills + '</div>' +
      // the options themselves live in Settings; this line says how they're set and links there
      '<div class="src-opt muted">Show sources on cards: <b id="srcShowState">' + (ctx.showSources?.() ? 'On' : 'Off') + '</b> · <button class="lnk" id="srcSettings" type="button">Change in Settings</button> · <button class="lnk" id="srcVoiceLog" type="button" title="What the voice assistant heard and did in this visit, for troubleshooting">Save voice log</button></div>' +
      rows().map(([title, list]) => '<section class="src-grp"><h3>' + esc(title) + '</h3><table class="src-tbl"><thead><tr><th>Source</th><th>Status</th><th>Used for · freshness</th></tr></thead><tbody>' +
        list.map(r => '<tr><td><b>' + r.name + '</b></td><td>' + r.status + '</td><td>' + esc(r.what) + '<div class="s">' + esc(r.detail) + '</div></td></tr>').join('') + '</tbody></table></section>').join('');
    root.querySelector('#srcReload')?.addEventListener('click', () => location.reload());
    root.querySelector('#srcSettings')?.addEventListener('click', () => ctx.openSettings?.('map'));
    root.querySelector('#srcVoiceLog')?.addEventListener('click', () => ctx.saveVoiceLog?.());
    root.querySelector('#srcIntro')?.addEventListener('click', () => ctx.showIntro?.());
  }

  ctx.onView('sources', () => { render(); checkNewer(); });
  ctx.refreshSources = render; // Settings redraws the page when an option it shows changes (does nothing on other pages)
  ctx.onViewChange(v => { clearInterval(timer); if (v === 'sources') timer = setInterval(render, 30e3); });
  addEventListener('online', render); addEventListener('offline', render);
}
