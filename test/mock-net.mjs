// Preload for test/pipeline.sh: replaces fetch with deterministic fakes for every external service the build uses.
import fs from 'node:fs';
const LOG = process.env.MOCK_LOG;
const count = h => { if (LOG) fs.appendFileSync(LOG, h + '\n'); };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); count(u.host + u.pathname.replace(/\/TABS\d+.*$/, '/TABS*').replace(/\/geocoding\/.*/, '/geocoding'));
  if (u.pathname.endsWith('/TABS/Search/SearchProjects')) {
    const b = new URLSearchParams(opts.body), c = b.get('LocationCounty'), d = b.get('RegistrationDateBegin'); const [m, , y] = d.split('/');
    const rows = [0, 1, 2].map(i => ({ ProjectNumber: `TABS${y}${c}${m}${i}`, ProjectName: `Project ${c}-${m}-${i}`, TypeOfWork: 9001 + (i % 3), EstimatedCost: 250000 * (i + 1) + (i === 1 ? 0.28 : 0) + (process.env.BUMP && i === 0 ? 99999 : 0),
      ProjectCreatedOn: `${y}-${m}-0${i + 1}T00:00:00`, ProjectStatus: i ? 3008 : 3001, EstimatedStartDate: i === 2 ? null : `${y}-${m}-15T00:00:00`, EstimatedEndDate: i === 0 ? `${+y + 1}-${m}-15T00:00:00` : null }));
    return json({ data: +b.get('start') ? [] : rows, recordsFiltered: 3 });
  }
  if (u.pathname.startsWith('/TABS/Projects/')) {
    const id = u.pathname.split('/').pop(), n = +id.slice(-1);
    return new Response(`<html><body><dl><dt>Location Address:</dt><dd>${100 + n} Main St</dd><dd>Waller, TX 77484</dd><dt>Owner Name:</dt><dd>Acme Holdings, L.L.C.</dd>
      <dt>Scope of Work:</dt><dd>New urgent care clinic for Memorial Hermann.${n === 2 ? "\u0000" : ""}</dd><dt>Square Footage:</dt><dd>12,000</dd><dt>Design Firm Name:</dt><dd>${n === 1 ? 'PGAL' : ''}</dd><dt>Tenant Name:</dt><dt>Facility Name:</dt><dd>Clinic</dd></dl></body></html>`);
  }
  if (u.host === 'geocoding.geo.census.gov') {
    const csv = await opts.body.get('addressFile').text();
    return new Response(csv.split('\n').map((l, i) => { const id = l.split(',')[0]; return i % 2 ? `${id},"x","No_Match"` : `${id},"x","Match","Exact","100 MAIN ST, WALLER, TX, 77484","-95.93,30.05","1","L"`; }).join('\n'));
  }
  if (u.host === 'feature.geographic.texas.gov') { // TxGIO 911 address points: only "101 MAIN" exists
    const w = u.searchParams.get('where') || '';
    return json({ features: /add_number = '101'/.test(w) && /MAIN/.test(w) ? [{ attributes: { add_number: '101' }, geometry: { x: -95.9305, y: 30.0515 } }] : [] });
  }
  if (u.host === 'nominatim.openstreetmap.org') return json([{ lon: '-95.95', lat: '30.06', address: { house_number: '102', postcode: '77484', city: 'Waller' } }]);
  if (u.host === 'api.maptiler.com') return json({ features: [] });
  if (u.host === 'api.openai.com') {
    if (u.pathname.includes('/models/')) return json({ id: 'm' });
    const b = JSON.parse(opts.body), ids = JSON.parse(b.messages[1].content).map(x => x.id);
    return json({ choices: [{ message: { content: JSON.stringify({ items: ids.map(id => ({ id, use: 'Medical', subtype: 'urgent care', tenant: 'Memorial Hermann', developer: 'Acme Holdings', architect: '', gc: '', units: null, summary: 'Urgent care clinic.' })) }) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  }
  if (u.host === 'api.census.gov') {
    const vars = u.searchParams.get('get').split(','), c = u.searchParams.get('in').split('county:')[1];
    return json([[...vars, 'state', 'county', 'tract'], [...vars.map((v, i) => String(1000 * (i + 1))), '48', c, '000100']]);
  }
  if (u.host === 'tigerweb.geo.census.gov' && u.pathname.includes('State_County')) { // county outlines: a box per GEOID
    const ids = (u.searchParams.get('where').match(/'(\d+)'/g) || []).map(x => x.slice(1, -1));
    return json({ type: 'FeatureCollection', features: ids.map((id, i) => { const x = -97 + (i % 5) * 0.4, y = 29.4 + Math.floor(i / 5) * 0.4;
      return { type: 'Feature', properties: { GEOID: id, NAME: 'C' + id }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + .4, y], [x + .4, y + .4], [x, y + .4], [x, y]]] } }; }) }); }
  if (u.host === 'tigerweb.geo.census.gov') return json({ features: +u.searchParams.get('resultOffset') ? [] : [{ properties: { GEOID: '48473000100' }, geometry: { type: 'Polygon', coordinates: [[[-96, 30], [-95.9, 30], [-95.9, 30.1], [-96, 30]]] } }] });
  return json({ error: 'unmocked ' + u }, 599);
};
