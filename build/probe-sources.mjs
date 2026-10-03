// Diagnostic: discover and check the free public data sources planned for the site / market panels, from a cloud server (Actions).
// Run "Probe services" with script=sources. Prints one compact line per check: status, timing and the fields that came back.
const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence; matthews@finishessolutions.com)' };
const P = [-95.3698, 29.7604]; // downtown Houston
const short = (s, n = 400) => String(s).replace(/\s+/g, ' ').slice(0, n);
async function hit(name, url, show = d => short(JSON.stringify(d)), { type = 'json', ms = 30000 } = {}) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), redirect: 'follow' });
    const body = type === 'json' ? await r.json().catch(async () => ({ _text: short(await r.text().catch(() => ''), 200) })) : await r.text();
    console.log('##', name, '|', r.status, '|', Date.now() - t, 'ms |', r.ok ? show(body) : short(type === 'json' ? JSON.stringify(body) : body, 200));
    return r.ok ? body : null;
  } catch (e) { console.log('##', name, '| ERROR', e.message, e.cause?.code || '', '|', Date.now() - t, 'ms'); return null; }
}
const pt = `geometry=${P[0]},${P[1]}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&f=json`;
const feats = d => short(JSON.stringify((d.features || []).slice(0, 2).map(f => f.attributes)), 600) + (d.error ? ' ERR ' + JSON.stringify(d.error) : '');
const layers = d => short((d.layers || []).map(l => l.id + ':' + l.name).join(', ') + ' | services: ' + (d.services || []).map(s => s.name + '(' + s.type + ')').join(', '), 1500);
const fields = d => short((d.name || '') + ' | ' + (d.fields || []).map(f => f.name).join(','), 900) + (d.error ? ' ERR ' + JSON.stringify(d.error) : '');

// ---------- ArcGIS point layers ----------
await hit('fema nfhl flood zone', 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE&' + pt, feats);
await hit('fema nfhl (gis server 2)', 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query?outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&' + pt, feats);
// TxDOT open data on ArcGIS Online
const ago = async (name, q) => hit('ago search ' + name, 'https://www.arcgis.com/sharing/rest/search?f=json&num=8&q=' + encodeURIComponent(q), d => short((d.results || []).map(r => r.title + ' [' + r.type + '] ' + r.url).join(' || '), 1500));
await ago('txdot aadt', 'TxDOT AADT owner:TPP_GIS');
await ago('txdot aadt 2', 'TxDOT_AADT');
await ago('tceq water districts', 'TCEQ water districts');
await ago('opportunity zones', 'Opportunity Zones CDFI title:"Opportunity Zones"');
await ago('tea school districts', 'Texas school districts 2025 TEA');
await ago('houston tirz', 'Houston TIRZ boundaries');
await ago('harris flood', 'Harris County Flood Control MAAPnext floodplain');
await ago('hifld substations', 'HIFLD electric substations');
await ago('metro stops', 'Houston METRO bus stops');
await hit('tigerweb school districts', 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/School/MapServer/0/query?outFields=*&' + pt, feats);
await hit('tigerweb school layers', 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/School/MapServer?f=json', layers);
await hit('tceq gis services', 'https://gisweb.tceq.texas.gov/arcgis/rest/services?f=json', layers);
await hit('cohgis services', 'https://mycity2.houstontx.gov/pubgis02/rest/services?f=json', layers);
await hit('harris gis services', 'https://www.gis.hctx.net/arcgis/rest/services?f=json', layers);

// ---------- Socrata (data.texas.gov and city portals) ----------
const cat = async (name, domain, q) => hit('socrata ' + name, `https://api.us.socrata.com/api/catalog/v1?domains=${domain}&q=${encodeURIComponent(q)}&limit=6`,
  d => short((d.results || []).map(r => r.resource.id + ' "' + r.resource.name + '" upd ' + String(r.resource.data_updated_at || '').slice(0, 10) + ' cols: ' + (r.resource.columns_field_name || []).slice(0, 25).join(',')).join(' || '), 3000));
await cat('mixed beverage', 'data.texas.gov', 'mixed beverage gross receipts');
await cat('hotel occupancy', 'data.texas.gov', 'hotel occupancy tax receipts');
await cat('franchise', 'data.texas.gov', 'franchise tax permit holders');
await cat('sales tax allocation', 'data.texas.gov', 'sales tax allocation city');
await cat('tax rates', 'data.texas.gov', 'property tax rates');
await cat('dallas crime', 'www.dallasopendata.com', 'police incidents');
await cat('dallas permits', 'www.dallasopendata.com', 'building permits');
await cat('austin crime', 'data.austintexas.gov', 'crime reports');
await cat('austin permits', 'data.austintexas.gov', 'issued construction permits');
await cat('fort worth permits', 'data.fortworthtexas.gov', 'permits');
await cat('fort worth crime', 'data.fortworthtexas.gov', 'crime');

// ---------- CKAN / file portals ----------
await hit('houston open data search permits', 'https://data.houstontx.gov/api/3/action/package_search?q=permits&rows=6', d => short((d.result?.results || []).map(p => p.name + ' (' + (p.resources || []).map(r => r.format + ' ' + r.url).slice(0, 3).join('; ') + ')').join(' || '), 2000));
await hit('houston open data search crime', 'https://data.houstontx.gov/api/3/action/package_search?q=crime&rows=6', d => short((d.result?.results || []).map(p => p.name + ' (' + (p.resources || []).map(r => r.format + ' ' + r.url).slice(0, 3).join('; ') + ')').join(' || '), 2000));
await hit('san antonio permits', 'https://data.sanantonio.gov/api/3/action/package_search?q=permits&rows=5', d => short((d.result?.results || []).map(p => p.name + ' (' + (p.resources || []).map(r => r.format + ' ' + r.url).slice(0, 2).join('; ') + ')').join(' || '), 1500));
await hit('hpd nibrs page', 'https://www.houstontx.gov/police/cs/Monthly_Crime_Data_by_Street_and_Police_Beat.htm', d => short((d.match(/href="[^"]+\.(xlsx|xls|csv)"/gi) || []).slice(0, 12).join(' '), 1500), { type: 'text' });
await hit('hpd nibrs page 2', 'https://www.houstontx.gov/police/cs/crime-stats-archives.htm', d => short((d.match(/href="[^"]+\.(xlsx|xls|csv)"/gi) || []).slice(0, 12).join(' '), 1500), { type: 'text' });

// ---------- economics ----------
await hit('fred dgs10 csv', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10,SOFR,MORTGAGE30US', d => short(d.split('\n').slice(-3).join(' / ')), { type: 'text' });
await hit('bls laus api v1 harris', 'https://api.bls.gov/publicAPI/v1/timeseries/data/LAUCN482010000000003', d => short(JSON.stringify({ status: d.status, msg: d.message, last: d.Results?.series?.[0]?.data?.slice(0, 2) })));
await hit('bls laus flat file', 'https://download.bls.gov/pub/time.series/la/la.data.64.County', d => short(d.slice(0, 300)), { type: 'text', ms: 60000 });
await hit('zillow zori zip', 'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv', d => short(d.split('\n')[0].slice(0, 200) + ' … rows ' + d.split('\n').length), { type: 'text', ms: 90000 });
await hit('hmda aggregations', 'https://ffiec.cfpb.gov/v2/data-browser-api/view/aggregations?years=2023&counties=48201&actions_taken=1', d => short(JSON.stringify(d.aggregations?.slice(0, 2))));
await hit('fbi cde demo key', 'https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/TX?API_KEY=DEMO_KEY', d => short(JSON.stringify(Array.isArray(d) ? d.slice(0, 1) : d).slice(0, 400)));
await hit('twc warn page', 'https://www.twc.texas.gov/data-reports/warn-notice', d => short((d.match(/href="[^"]+\.(xlsx|xls|csv)[^"]*"/gi) || []).slice(0, 8).join(' '), 1200), { type: 'text' });
await hit('epa frs echo near', `https://echodata.epa.gov/echo/echo_rest_services.get_facilities?output=JSON&p_lat=${P[1]}&p_long=${P[0]}&p_radius=0.5`, d => short(JSON.stringify(d.Results ? { rows: d.Results.QueryRows, qid: d.Results.QueryID } : d), 300));
await hit('tdhca htc page', 'https://www.tdhca.texas.gov/htc-property-inventory', d => short((d.match(/href="[^"]+\.(xlsx|xls|csv)[^"]*"/gi) || []).slice(0, 8).join(' '), 1200), { type: 'text' });
await hit('tea accountability', 'https://tea.texas.gov/texas-schools/accountability/academic-accountability/performance-reporting/2024-accountability-rating-system', d => short((d.match(/href="[^"]+\.(xlsx|xls|csv)[^"]*"/gi) || []).slice(0, 8).join(' '), 1200), { type: 'text' });
await hit('comptroller tax rates page', 'https://comptroller.texas.gov/taxes/property-tax/rates/', d => short((d.match(/href="[^"]+\.(xlsx|xls|csv)[^"]*"/gi) || []).slice(0, 8).join(' '), 1200), { type: 'text' });
console.log('done');
