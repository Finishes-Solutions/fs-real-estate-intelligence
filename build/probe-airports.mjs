// Diagnostic: the free airport sources (OurAirports CSVs, FAA d-TPP diagrams, Wikidata photos, aviationweather METAR,
// OpenStreetMap aeroways, BTS T-100, FAA ATADS, NASR). Run "Probe services" with script=airports.
const UA = { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0 (probe; contact via finishessolutions.com)' };
const t0 = () => Date.now();
async function hit(name, url, opts = {}, show = 400) {
  const s = t0();
  try {
    const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(60000) });
    const buf = Buffer.from(await r.arrayBuffer()), txt = buf.toString('utf8');
    console.log('\n== ' + name + ': ' + r.status + ' ' + (r.headers.get('content-type') || '') + ' ' + buf.length + ' bytes ' + (Date.now() - s) + ' ms');
    console.log(txt.slice(0, show).replace(/\s+$/,''));
    return { r, txt, buf };
  } catch (e) { console.log('\n== ' + name + ': FAILED ' + e.message); return null; }
}
const OA = 'https://davidmegginson.github.io/ourairports-data/';
const a = await hit('OurAirports airports.csv', OA + 'airports.csv', {}, 600);
if (a) { const lines = a.txt.split('\n'); console.log('rows', lines.length, 'TX rows', lines.filter(l => l.includes('"US-TX"')).length); }
const rw = await hit('OurAirports runways.csv', OA + 'runways.csv', {}, 600);
if (rw) { const l = rw.txt.split('\n'); console.log('rows', l.length); console.log(l.filter(x => x.includes('"KIAH"')).join('\n')); }
await hit('OurAirports airport-frequencies.csv', OA + 'airport-frequencies.csv', {}, 200);
await hit('OurAirports navaids.csv (head)', OA + 'navaids.csv', {}, 150);
// FAA d-TPP: current cycle metafile (airport diagrams are chart_code APD)
const dtpp = await hit('FAA d-TPP metafile', 'https://aeronav.faa.gov/d-tpp/2510/xml_data/d-tpp_Metafile.xml', {}, 300);
await hit('FAA d-TPP cycles page', 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/', {}, 0);
await hit('FAA APD PDF (KIAH 2510)', 'https://aeronav.faa.gov/d-tpp/2510/00189ad.pdf', {}, 0);
// Wikidata photo by ICAO
await hit('Wikidata SPARQL (KIAH image)', 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent('SELECT ?a ?img ?aLabel WHERE { ?a wdt:P239 "KIAH". OPTIONAL { ?a wdt:P18 ?img } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }'), { headers: { Accept: 'application/sparql-results+json' } }, 600);
await hit('Wikipedia summary (George Bush Intercontinental Airport)', 'https://en.wikipedia.org/api/rest_v1/page/summary/George_Bush_Intercontinental_Airport', {}, 800);
// weather
await hit('aviationweather METAR', 'https://aviationweather.gov/api/data/metar?ids=KIAH,KHOU&format=json', {}, 600);
await hit('aviationweather TAF', 'https://aviationweather.gov/api/data/taf?ids=KIAH&format=json', {}, 300);
// OSM aeroways around Hobby
await hit('Overpass aeroways KHOU', 'https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'data=' + encodeURIComponent('[out:json][timeout:40];(way["aeroway"~"runway|taxiway|terminal|apron|hangar|gate"](29.63,-95.30,29.67,-95.25););out tags geom 3;') }, 800);
// adsb.lol airport lookup
await hit('adsb.lol airport', 'https://api.adsb.lol/api/0/airport/KIAH', {}, 400);
// BTS T-100 (transtats) and FAA ATADS
await hit('BTS T-100 download page', 'https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FMG&QO_fu146_anzr=Nv4%20Pn44vr45', {}, 300);
await hit('BTS TranStats PREZIP list', 'https://transtats.bts.gov/PREZIP/', {}, 1500);
await hit('FAA ATADS (OPSNET) page', 'https://aspm.faa.gov/opsnet/sys/airport.asp', {}, 400);
await hit('FAA NASR subscription page', 'https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/', {}, 0);
await hit('FAA CY enplanements page', 'https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger', {}, 0);
await hit('OpenSky arrivals (anon)', 'https://opensky-network.org/api/flights/arrival?airport=KIAH&begin=' + (Math.floor(Date.now() / 1000) - 86400 * 2) + '&end=' + (Math.floor(Date.now() / 1000) - 86400), {}, 300);
