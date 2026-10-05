// Diagnostic: which FBI Crime Data Explorer endpoints answer, and their shapes (for crime by city / county nationwide).
// Run "Probe services" with script=fbi. Uses FBI_API_KEY (api.data.gov) when set, else DEMO_KEY (a few calls only).
const KEY = process.env.FBI_API_KEY || 'DEMO_KEY';
const show = async (label, url, n = 900) => {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (probe)', Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    const text = await r.text();
    console.log('\n## ' + label + ' → HTTP ' + r.status + ' ' + (r.headers.get('content-type') || '') + ' ' + text.length + ' bytes ' + (Date.now() - t) + 'ms' + (r.headers.get('x-ratelimit-remaining') ? ' remaining ' + r.headers.get('x-ratelimit-remaining') : ''));
    console.log(text.slice(0, n).replace(new RegExp(KEY, 'g'), 'KEY'));
    return text;
  } catch (e) { console.log('\n## ' + label + ' → ' + e.message); return null; }
};
const API = 'https://api.usa.gov/crime/fbi/cde', WEB = 'https://cde.ucr.cjis.gov/LATEST';
const span = '?from=01-2020&to=12-2025';

// agency directory (a state's agencies: ORI, name, type, county, lat/lon)
const dirWeb = await show('web agency/byStateAbbr/TX', WEB + '/agency/byStateAbbr/TX', 1500);
await show('api agency/byStateAbbr/TX', API + '/agency/byStateAbbr/TX?API_KEY=' + KEY, 600);
if (dirWeb && dirWeb.startsWith('{')) {
  try {
    const d = JSON.parse(dirWeb), all = Object.values(d).flat();
    console.log('agencies in TX:', all.length, 'keys:', Object.keys(all[0] || {}).join(', '));
    for (const a of all.filter(a => /houston|harris county|waller|katy|hempstead/i.test(a.agency_name || '')).slice(0, 12)) console.log(JSON.stringify(a));
    const types = {}; all.forEach(a => types[a.agency_type_name] = (types[a.agency_type_name] || 0) + 1); console.log('types', JSON.stringify(types));
  } catch (e) { console.log('parse', e.message); }
}

// summarized counts: agency (Houston PD, Harris County SO), state, national; web (no key) and api (key)
await show('web summarized agency TXHPD0000 violent-crime', WEB + '/summarized/agency/TXHPD0000/violent-crime' + span, 2500);
await show('api summarized agency TXHPD0000 violent-crime', API + '/summarized/agency/TXHPD0000/violent-crime' + span + '&API_KEY=' + KEY, 1200);
await show('web summarized agency TX1010000 property-crime', WEB + '/summarized/agency/TX1010000/property-crime' + span, 1200);
await show('web summarized state TX homicide', WEB + '/summarized/state/TX/homicide' + span, 800);
await show('web summarized national larceny', WEB + '/summarized/national/larceny' + span, 800);
for (const o of ['rape', 'robbery', 'aggravated-assault', 'burglary', 'motor-vehicle-theft', 'arson']) await show('web offense ' + o, WEB + '/summarized/agency/TXHPD0000/' + o + '?from=01-2024&to=12-2024', 300);

// participation / NIBRS reporting status of one agency, and the downloads list
await show('web participation agency', WEB + '/participation/agency/TXHPD0000', 600);
await show('web downloads list', WEB + '/s3/list', 600);

// Census: which city (incorporated place) and county a point is in
const TW = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer';
const meta = await show('tigerweb places service', TW + '?f=json', 200);
try { console.log('layers:', JSON.parse(meta).layers.map(l => l.id + '=' + l.name).join(' | ')); } catch (e) {}
await show('census geocoder geographies (downtown Houston)', 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=-95.3698&y=29.7604&benchmark=Public_AR_Current&vintage=Current_Current&layers=Incorporated%20Places,Counties&format=json', 1500);
