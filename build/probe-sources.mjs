// Diagnostic: field shapes of the free public sources used by the Site panel and the market build, from a cloud server (Actions).
// Run "Probe services" with script=sources. One compact line per check.
const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence; matthews@finishessolutions.com)' };
const P = [-95.3698, 29.7604], K = [-95.8244, 29.7858]; // downtown Houston; Katy
const short = (s, n = 500) => String(s).replace(/\s+/g, ' ').slice(0, n);
async function hit(name, url, show = d => short(JSON.stringify(d)), { type = 'json', ms = 30000, opts = {} } = {}) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), redirect: 'follow', ...opts });
    const ct = r.headers.get('content-type');
    const body = type === 'json' ? await r.json().catch(async () => ({ _text: short(await r.text().catch(() => ''), 200) })) : await r.text();
    console.log('##', name, '|', r.status, ct, '|', Date.now() - t, 'ms |', r.ok ? show(body) : short(type === 'json' ? JSON.stringify(body) : body, 300));
    return r.ok ? body : null;
  } catch (e) { console.log('##', name, '| ERROR', e.message, e.cause?.code || '', '|', Date.now() - t, 'ms'); return null; }
}
const near = (p, m) => `geometry=${p[0]},${p[1]}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&distance=${m}&units=esriSRUnit_Meter&returnGeometry=false&f=json`;
const feats = d => short('n=' + (d.features || []).length + ' ' + JSON.stringify((d.features || []).slice(0, 3).map(f => f.attributes)), 1500) + (d.error ? ' ERR ' + JSON.stringify(d.error) : '');
const fields = d => short((d.name || '') + ' type=' + d.type + ' | ' + (d.fields || []).map(f => f.name + ':' + f.type.replace('esriFieldType', '')).join(','), 1500) + (d.error ? ' ERR ' + JSON.stringify(d.error) : '') + ' | layers ' + (d.layers || []).map(l => l.id + ':' + l.name).join(',');

const AADT = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_AADT/FeatureServer';
await hit('aadt service', AADT + '?f=json', fields);
await hit('aadt layer0', AADT + '/0?f=json', fields);
await hit('aadt near katy', AADT + '/0/query?outFields=*&' + near(K, 400), feats);
const WD = 'https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/TCEQ_Water_Districts/FeatureServer';
await hit('water districts service', WD + '?f=json', fields);
await hit('water districts at katy', WD + '/0/query?outFields=*&' + near(K, 0), feats);
await hit('tceq wd mapserver', 'https://gisweb.tceq.texas.gov/arcgis/rest/services/Public/WaterDistricts/MapServer?f=json', fields);
const OZ = 'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Federal_Opportunity_Zones_New/FeatureServer';
await hit('oz service', OZ + '?f=json', fields);
await hit('oz at 5th ward', OZ + '/0/query?outFields=*&' + near([-95.335, 29.775], 0), feats);
const TEA = 'https://services7.arcgis.com/ZodPOMBKsdAsTqF4/arcgis/rest/services/TEA_School_Districts_2025/FeatureServer';
await hit('tea districts', TEA + '/0/query?outFields=*&' + near(K, 0), feats);
await hit('tea schools service search', 'https://www.arcgis.com/sharing/rest/search?f=json&num=6&q=' + encodeURIComponent('TEA Schools 2025 owner:TEA_GIS OR title:"Schools 2025"'), d => short((d.results || []).map(r => r.title + ' ' + r.url).join(' || '), 800));
const TIRZ = 'https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/COH_Tax_Incentive_Reinvestment_Zones_view/FeatureServer';
await hit('tirz downtown', TIRZ + '/0/query?outFields=*&' + near(P, 0), feats);
await hit('metro stops near downtown', 'https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/COH_METRO_Bus_Stops_view/FeatureServer/0/query?returnCountOnly=true&' + near(P, 400), d => JSON.stringify(d));
await hit('houston city limits', 'https://services.arcgis.com/su8ic9KbA7PYVxPS/arcgis/rest/services/COH_Limits/FeatureServer/0/query?outFields=*&' + near(K, 0), feats);
await hit('hcfcd maapnext image identify', 'https://tiledimageservices2.arcgis.com/nLl0k0Mja5hnSeSl/arcgis/rest/services/MAAPNext_FloodRiskType/ImageServer/identify?geometry=' + JSON.stringify({ x: P[0], y: P[1], spatialReference: { wkid: 4326 } }) + '&geometryType=esriGeometryPoint&returnGeometry=false&f=json', d => short(JSON.stringify(d), 600));
await hit('fema nfhl fields', 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28?f=json', fields);

// Socrata
const S = 'https://data.texas.gov/resource/';
await hit('mixed bev by address', S + 'naix-2893.json?$where=' + encodeURIComponent("upper(location_address) like '1001 %MAIN%' AND location_zip like '77002%'") + '&$order=obligation_end_date_yyyymmdd DESC&$limit=3');
await hit('mixed bev latest', S + 'naix-2893.json?$order=obligation_end_date_yyyymmdd DESC&$limit=1');
await hit('mixed bev sales g5bj', S + 'g5bj-yb6k.json?$order=obligation_end_date DESC&$limit=1');
await hit('hotel permits', S + 'hdzd-884n.json?$limit=1');
const cat = async (name, domain, q) => hit('socrata ' + name, `https://api.us.socrata.com/api/catalog/v1?domains=${domain}&q=${encodeURIComponent(q)}&limit=8`,
  d => short((d.results || []).map(r => r.resource.id + ' "' + r.resource.name + '" upd ' + String(r.resource.data_updated_at || '').slice(0, 10) + ' cols: ' + (r.resource.columns_field_name || []).slice(0, 30).join(',')).join(' || '), 3500));
await cat('hotel receipts', 'data.texas.gov', 'hotel receipts quarterly location');
await cat('hotel 2', 'data.texas.gov', 'Hotel Occupancy Tax Receipts');
await cat('austin', 'data.austintexas.gov', 'crime');
await cat('austin permits', 'data.austintexas.gov', 'Issued Construction Permits');
await cat('dallas permits new', 'www.dallasopendata.com', 'permits issued 2025');
await hit('austin crime direct', 'https://data.austintexas.gov/resource/fdj4-gpfu.json?$limit=1&$order=rep_date DESC');
await hit('austin permits direct', 'https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=1&$order=issue_date DESC');
await hit('dallas crime latest', 'https://www.dallasopendata.com/resource/qv6i-rri7.json?$limit=1&$order=reporteddate DESC');
await hit('fort worth permits latest', 'https://data.fortworthtexas.gov/resource/quz7-xnsy.json?$limit=1&$order=file_date DESC');
await hit('fort worth crime latest', 'https://data.fortworthtexas.gov/resource/k6ic-7kp7.json?$limit=1&$order=reported_date DESC');
// HPD NIBRS yearly CSV
await hit('hpd nibrs 2026 head', 'https://www.houstontx.gov/police/cs/xls/NIBRSPublicView2026.csv', d => short(d.split('\n').slice(0, 3).join(' /// '), 900) + ' … lines ' + d.split('\n').length, { type: 'text', ms: 90000 });
await hit('sa permits head', 'https://data.sanantonio.gov/dataset/05012dcb-ba1b-4ade-b5f3-7403bc7f52eb/resource/c21106f9-3ef5-4f3a-8604-f992b4db7512/download/permits_issued.csv', d => short(d.split('\n').slice(0, 2).join(' /// '), 900) + ' … lines ' + d.split('\n').length, { type: 'text', ms: 90000 });
// rates
await hit('fred single', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10', d => short(d.split('\n').slice(-3).join(' / ')), { type: 'text' });
await hit('nyfed sofr', 'https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json');
await hit('treasury yields', 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=2');
await hit('treasury daily par yield', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv', d => short(d.split('\n').slice(0, 2).join(' /// '), 600), { type: 'text' });
await hit('freddie pmms', 'https://www.freddiemac.com/pmms/docs/PMMS_history.csv', d => short(d.split('\n').slice(-2).join(' /// '), 300), { type: 'text' });
// EPA ECHO facilities near a point
const e = await hit('echo facilities', `https://echodata.epa.gov/echo/echo_rest_services.get_facilities?output=JSON&p_lat=${P[1]}&p_long=${P[0]}&p_radius=0.25`, d => short(JSON.stringify(d.Results ? { rows: d.Results.QueryRows, qid: d.Results.QueryID } : d), 300));
if (e?.Results?.QueryID) await hit('echo qid', `https://echodata.epa.gov/echo/echo_rest_services.get_qid?output=JSON&qid=${e.Results.QueryID}&pageno=1&responseset=3`, d => short(JSON.stringify(d.Results?.Facilities?.slice(0, 2)), 1500));
await hit('hmda tracts', 'https://ffiec.cfpb.gov/v2/data-browser-api/view/aggregations?years=2024&counties=48201&actions_taken=1&loan_purposes=1', d => short(JSON.stringify(d), 400));
await hit('bls v1 multi', 'https://api.bls.gov/publicAPI/v1/timeseries/data/', d => short(JSON.stringify({ s: d.status, m: d.message, n: d.Results?.series?.length, v: d.Results?.series?.map(s => s.seriesID + '=' + s.data?.[0]?.value + ' ' + s.data?.[0]?.periodName + ' ' + s.data?.[0]?.year) })),
  { opts: { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesid: ['LAUCN482010000000003', 'LAUCN481570000000003', 'LAUMT482642000000003'] }) } });
await hit('bls la.area', 'https://download.bls.gov/pub/time.series/la/la.area', d => short(d.split('\n').filter(l => /Texas|TX/.test(l)).slice(0, 4).join(' /// '), 600), { type: 'text', ms: 60000 });
console.log('done');
