// Diagnostic: why cached geocode misses stay missed. Run "Probe services" with script=geocode.
// Takes a sample of ordinary-looking addresses cached as misses, shows what each source returns for them,
// then runs the real geocodeRows on the sample with an empty cache.
import fs from 'node:fs/promises';
import { geocodeRows, cleanStreet, splitStreet, streetVariants } from './geocode.mjs';
import { countyCheck } from './compact.mjs';

const cache = JSON.parse(await fs.readFile('data/cache/geocode.json', 'utf8'));
const entries = Object.entries(cache.entries || cache);
const misses = entries.filter(([, v]) => v && !v.c).map(([k]) => k);
const plain = misses.filter(k => /^\d*[1-9]\d*\s+[a-z]/.test(k) && /\|77\d{3}$/.test(k));
console.log('cache entries', entries.length, '| misses', misses.length, '| plain house-number misses', plain.length);
const sample = plain.sort(() => Math.random() - .5).slice(0, +(process.env.N || 24));
const rows = sample.map((k, i) => { const [st, city, zip] = k.split('|'); return { ProjectNumber: 'P' + i, st: cleanStreet(st), street: st, city: city.replace(/\b\w/g, c => c.toUpperCase()), zip, _county: '' }; });
const t0 = Date.now(), ms = () => (Date.now() - t0) + 'ms';
const show = (label, x) => console.log(label.padEnd(14), typeof x === 'string' ? x.slice(0, 400) : JSON.stringify(x).slice(0, 400));

// 1. Census batch (raw lines)
{
  const csv = rows.map((r, i) => [i, r.st, r.city, 'TX', r.zip].map(v => '"' + String(v).replace(/"/g, '') + '"').join(',')).join('\n');
  const fd = new FormData(); fd.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv'); fd.append('benchmark', 'Public_AR_Current');
  try {
    const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd, headers: { 'User-Agent': 'FinishesSolutions-probe/1.0' } });
    const t = await r.text(); console.log('\n== census batch', r.status, r.headers.get('content-type'), t.length, 'bytes', ms());
    t.split('\n').slice(0, 30).forEach(l => console.log('  ', l.slice(0, 220)));
  } catch (e) { console.log('census batch ERROR', e.message, e.cause?.code || ''); }
}
// 2. Census one-line, address points, Nominatim, MapTiler for the first few
const KEY = process.env.MAPTILER_KEY || 'vA28jXazwpYesC2b1Ccp';
console.log('\nMAPTILER_KEY from secrets:', !!process.env.MAPTILER_KEY);
for (const r of rows.slice(0, 6)) {
  console.log('\n==', r.st, '|', r.city, '|', r.zip, '| split', JSON.stringify(splitStreet(r.st)), '| variants', streetVariants(r.st).length);
  try { const u = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' + new URLSearchParams({ address: r.st + ', ' + r.city + ', TX ' + r.zip, benchmark: 'Public_AR_Current', format: 'json' });
    const x = await fetch(u); const d = await x.json().catch(() => null); show('census 1-line', x.status + ' ' + (d?.result?.addressMatches || []).map(m => m.matchedAddress + ' @' + m.coordinates.x.toFixed(4) + ',' + m.coordinates.y.toFixed(4)).join(' || ') + (d?.errors ? ' errors ' + d.errors : ''));
  } catch (e) { show('census 1-line', 'ERROR ' + e.message + ' ' + (e.cause?.code || '')); }
  try { const s = splitStreet(r.st), base = process.env.ADDRESS_POINTS_SERVICE || 'https://feature.geographic.texas.gov/arcgis/rest/services/Address_Points/stratmap_address_points_48_most_recent/MapServer/0';
    const where = `add_number = '${s.num}' AND UPPER(st_name) LIKE '%${s.core.split(' ')[0]}%' AND post_code = '${r.zip}'`;
    const x = await fetch(base + '/query?' + new URLSearchParams({ where, outFields: 'add_number,st_name,post_comm', returnGeometry: 'true', outSR: '4326', resultRecordCount: '4', f: 'json' }));
    show('address pts', x.status + ' ' + (await x.text()));
  } catch (e) { show('address pts', 'ERROR ' + e.message + ' ' + (e.cause?.code || '')); }
  try { await new Promise(res => setTimeout(res, 1100));
    const x = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '2', countrycodes: 'us', street: r.st, city: r.city, state: 'Texas', postalcode: r.zip }), { headers: { 'User-Agent': 'FinishesSolutions-filings-map/1.0 (probe)' } });
    const d = await x.json().catch(() => null); show('nominatim', x.status + ' ' + JSON.stringify((d || []).map(y => [y.display_name, y.address?.house_number, y.address?.postcode])));
  } catch (e) { show('nominatim', 'ERROR ' + e.message); }
  try { const x = await fetch('https://api.maptiler.com/geocoding/' + encodeURIComponent(`${r.st}, ${r.city}, TX ${r.zip}`) + '.json?key=' + KEY + '&country=us&limit=1&bbox=-97.3,28.8,-94.3,31.2');
    const d = await x.json().catch(() => null), f = d?.features?.[0]; show('maptiler', x.status + ' ' + (f ? f.place_name + ' | type ' + f.place_type + ' | address ' + f.address + ' | relevance ' + f.relevance : JSON.stringify(d).slice(0, 200)));
  } catch (e) { show('maptiler', 'ERROR ' + e.message); }
}
// 3. the real pipeline on the sample, empty cache
console.log('\n== geocodeRows on the sample (empty cache)', ms());
const geo = JSON.parse(await fs.readFile('data/geo.json', 'utf8')), regions = JSON.parse(await fs.readFile('data/regions.json', 'utf8'));
const outlines = Object.fromEntries(geo.counties.map(c => [c.name, { type: 'MultiPolygon', coordinates: c.outline }]));
const c2 = {}, loc = await geocodeRows(rows, c2, { key: KEY, bbox: regions.bbox, places: geo.places, check: countyCheck(outlines), budget: { nominatim: 50 } });
rows.forEach(r => console.log('  ', (loc[r.ProjectNumber]?.via || 'MISS').padEnd(12), r.st, '|', r.city, r.zip));
console.log('done', ms());
