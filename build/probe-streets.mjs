// Diagnostic: placing addresses with no usable house number ("0 Adriatic Drive"). Run "Probe services" with script=streets.
// Tries the same street on several Overpass servers and on Nominatim's structured street search.
import fs from 'node:fs/promises';
import { parseStreetOnly } from './geocode.mjs';

const cache = JSON.parse(await fs.readFile('data/cache/geocode.json', 'utf8'));
const geo = JSON.parse(await fs.readFile('data/geo.json', 'utf8'));
const town = c => geo.places.find(p => p[0].toLowerCase() === c);
const sample = Object.entries(cache).filter(([k, v]) => !v.c && /^0+\s/.test(k)).map(([k]) => k.split('|')).filter(([, c]) => town(c)).sort(() => Math.random() - .5).slice(0, 6);
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
for (const [st, city, zip] of sample) {
  const only = parseStreetOnly(st), p = town(city), c = [p[1], p[2]], d = .12;
  const name = String(only || '').replace(/\b(drive|dr|road|rd|street|st|lane|ln|court|ct|way|trail|trl|boulevard|blvd|circle|cir|parkway|pkwy)\.?$/i, '').trim();
  console.log('\n==', st, '|', city, zip, '| parsed:', only, '| name:', name);
  const ql = `[out:json][timeout:25];way["highway"]["name"~"^${name}",i](${[c[1] - d, c[0] - d * 1.15, c[1] + d, c[0] + d * 1.15].map(v => v.toFixed(4)).join(',')});out center 5;`;
  for (const s of SERVERS) {
    const t = Date.now();
    try { const r = await fetch(s, { method: 'POST', body: new URLSearchParams({ data: ql }), headers: { 'User-Agent': 'FinishesSolutions-probe/1.0' }, signal: AbortSignal.timeout(30000) });
      const txt = await r.text(); let n = '?'; try { n = JSON.parse(txt).elements.length; } catch (e) { n = 'non-JSON: ' + txt.slice(0, 120).replace(/\s+/g, ' '); }
      console.log('  overpass', new URL(s).host.padEnd(28), r.status, '| ways', n, '|', Date.now() - t, 'ms');
    } catch (e) { console.log('  overpass', new URL(s).host.padEnd(28), 'ERROR', e.name, e.message, '|', Date.now() - t, 'ms'); }
  }
  await new Promise(r => setTimeout(r, 1100));
  try { const r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '3', countrycodes: 'us', street: only || st, city, state: 'Texas', postalcode: zip }), { headers: { 'User-Agent': 'FinishesSolutions-filings-map/1.0 (probe)' } });
    const dd = await r.json().catch(() => []); console.log('  nominatim', r.status, JSON.stringify(dd.map(x => [x.category + '/' + x.type, x.display_name.slice(0, 80), x.address?.postcode])));
  } catch (e) { console.log('  nominatim ERROR', e.message); }
}
