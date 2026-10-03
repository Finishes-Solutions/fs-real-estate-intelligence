// Preload (after test/mock-net.mjs, before test/mock-supa.mjs): fakes for the live-data services used by build/live-sync.mjs.
const inner = globalThis.fetch;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.host === 'api.gdeltproject.org') {
    const q = u.searchParams.get('query');
    if (/Nobody/.test(q)) return json({});
    return json({ articles: [{ url: 'https://news.test/' + encodeURIComponent(q.split('"')[1]), title: 'Story about ' + q.split('"')[1], seendate: '20260930T120000Z', domain: 'news.test' }] });
  }
  if (u.host === 'cmr.earthdata.nasa.gov') return json({ items: [{ umm: { TemporalExtent: { RangeDateTime: { BeginningDateTime: (u.searchParams.get('collection_concept_id').includes('957295') ? '2026-09-28' : '2026-09-21') + 'T17:00:00Z' } }, AdditionalAttributes: [{ Name: 'CLOUD_COVERAGE', Values: ['12'] }] } }] });
  if (u.host === 'api.open-meteo.com') {
    const n = u.searchParams.get('latitude').split(',').length, one = { daily: { time: ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'], weather_code: [0, 2, 61, 95], temperature_2m_max: [90, 91, 85, 83], temperature_2m_min: [70, 71, 70, 69],
      precipitation_sum: [0, 0, .4, 1.2], precipitation_probability_max: [0, 10, 70, 90], wind_speed_10m_max: [10, 12, 15, 22], wind_gusts_10m_max: [18, 20, 28, 40] } };
    return json(n > 1 ? Array.from({ length: n }, () => one) : one);
  }
  if (u.host === 'www.houstontx.gov' && /NIBRSPublicView\d{4}\.csv$/.test(u.pathname)) { // HPD yearly crime file: two geocoded rows, one without a point
    const y = u.pathname.match(/(\d{4})\.csv$/)[1], d = new Date().toISOString().slice(0, 4) === y ? new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10) : y + '-11-15';
    return new Response('Incident,Occurrence Date,Occurrence Hour,NIBRS Class,NIBRS Description,Offense Count,Beat,Premise,Street Number,Street Name,Street Type,Street Suffix,City,ZIP Code,Map Longitude,Map Latitude\n' +
      'A' + y + ',' + d + ',10,13A,Aggravated assault,1,Beat 1A10,Street,1,MAIN,ST,,HOUSTON,77002,-95.3698,29.7604\nB' + y + ',' + d + ',11,23F,Theft from motor vehicle,2,Beat 1A10,Parking lot,2,MAIN,ST,,HOUSTON,77002,-95.37,29.761\nC' + y + ',' + d + ',11,290,Vandalism,1,Beat 1A10,Street,,,,,HOUSTON,77002,0,0\n', { headers: { 'Content-Type': 'text/csv' } });
  }
  if (u.host === 'www.nhc.noaa.gov') return json({ activeStorms: [{ id: 'al142026', name: 'Kirk', classification: 'HU', intensity: '100', pressure: '965', latitudeNumeric: 25.1, longitudeNumeric: -90.2, movementDir: 315, movementSpeed: 10, lastUpdate: '2026-10-02T15:00:00.000Z' }] });
  return inner(url, opts);
};
