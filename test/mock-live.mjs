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
    const n = u.searchParams.get('latitude').split(',').length, one = { daily: { time: [-2, -1, 0, 1].map(d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)) /* two past days, today, tomorrow: relative, so the test doesn't expire */, weather_code: [0, 2, 61, 95], temperature_2m_max: [90, 91, 85, 83], temperature_2m_min: [70, 71, 70, 69],
      precipitation_sum: [0, 0, .4, 1.2], precipitation_probability_max: [0, 10, 70, 90], wind_speed_10m_max: [10, 12, 15, 22], wind_gusts_10m_max: [18, 20, 28, 40] } };
    return json(n > 1 ? Array.from({ length: n }, () => one) : one);
  }
  if (u.host === 'www.houstontx.gov' && /NIBRSPublicView\d{4}\.csv$/.test(u.pathname)) { // HPD yearly crime file: two geocoded rows, one without a point
    const y = u.pathname.match(/(\d{4})\.csv$/)[1], d = new Date().toISOString().slice(0, 4) === y ? new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10) : y + '-11-15';
    return new Response('Incident,Occurrence Date,Occurrence Hour,NIBRS Class,NIBRS Description,Offense Count,Beat,Premise,Street Number,Street Name,Street Type,Street Suffix,City,ZIP Code,Map Longitude,Map Latitude\n' +
      'A' + y + ',' + d + ',10,13A,Aggravated assault,1,Beat 1A10,Street,1,MAIN,ST,,HOUSTON,77002,-95.3698,29.7604\nB' + y + ',' + d + ',11,23F,Theft from motor vehicle,2,Beat 1A10,Parking lot,2,MAIN,ST,,HOUSTON,77002,-95.37,29.761\nC' + y + ',' + d + ',11,290,Vandalism,1,Beat 1A10,Street,,,,,HOUSTON,77002,0,0\n', { headers: { 'Content-Type': 'text/csv' } });
  }
  if (u.host === 'www.nhc.noaa.gov') return json({ activeStorms: [{ id: 'al142026', name: 'Kirk', classification: 'HU', intensity: '100', pressure: '965', latitudeNumeric: 25.1, longitudeNumeric: -90.2, movementDir: 315, movementSpeed: 10, lastUpdate: '2026-10-02T15:00:00.000Z' }] });
  // OurAirports and the FAA d-TPP metafile (airports step)
  if (u.host === 'davidmegginson.github.io') {
    const csv = t => new Response(t, { headers: { 'Content-Type': 'text/csv' } });
    if (u.pathname.endsWith('/airports.csv')) return csv('"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"\n' +
      '3604,"KIAH","large_airport","George Bush Intercontinental Houston Airport",29.984399795532227,-95.34140014648438,97,"NA","US","US-TX","Houston","yes","KIAH","IAH","KIAH","IAH",,"https://en.wikipedia.org/wiki/George_Bush_Intercontinental_Airport","IAH, ""Bush"", Intercontinental"\n' +
      '3605,"KHOU","medium_airport","William P Hobby Airport",29.645399,-95.2789,46,"NA","US","US-TX","Houston","yes","KHOU","HOU","KHOU","HOU",,,\n' +
      (process.env.MOCK_AIRPORT_GONE ? '' : '9,"XX99","heliport","Gone Soon Heliport",29.7,-95.4,50,"NA","US","US-TX","Houston","no",,,,"XX99",,,\n'));
    if (u.pathname.endsWith('/runways.csv')) return csv('"id","airport_ref","airport_ident","length_ft","width_ft","surface","lighted","closed","le_ident","le_latitude_deg","le_longitude_deg","le_elevation_ft","le_heading_degT","le_displaced_threshold_ft","he_ident","he_latitude_deg","he_longitude_deg","he_elevation_ft","he_heading_degT","he_displaced_threshold_ft"\n' +
      '241822,3604,"KIAH",9000,150,"CON",1,0,"08L",30.0072,-95.3588,92,89.9,,"26R",30.0072,-95.3304,95,269.9,\n');
    if (u.pathname.endsWith('/airport-frequencies.csv')) return csv('"id","airport_ref","airport_ident","type","description","frequency_mhz"\n1,3604,"KIAH","TWR","TOWER",118.1\n');
  }
  if (u.host === 'aeronav.faa.gov' && u.pathname.endsWith('d-tpp_Metafile.xml')) return new Response('<digital_tpp cycle="x"><airport_name ID="HOUSTON INTCNTL" apt_ident="IAH" icao_ident="KIAH"><record><chart_code>MIN</chart_code><pdf_name>A.PDF</pdf_name></record><record><chart_code>APD</chart_code><pdf_name>00189AD.PDF</pdf_name></record></airport_name></digital_tpp>', { headers: { 'Content-Type': 'text/xml' } });
  return inner(url, opts);
};
