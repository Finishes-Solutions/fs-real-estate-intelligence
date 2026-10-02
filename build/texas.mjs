// All 254 Texas counties: name, FIPS, TDLR TABS county id, outline and label point. Plus a statewide town-center gazetteer.
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoCentroid } from 'd3-geo';
import { rewind, round } from './geometry.mjs';
import { fetchRetry, log } from './util.mjs';

export const TX_BBOX = [-106.7, 25.8, -93.5, 36.6];

// TABS numbers counties 2001..2254 in alphabetical order, except that the three "Mc" counties sort after Motley
// (checked against Austin 2008, Fort Bend 2079, Grimes 2093, Harris 2101, Montgomery 2167, Waller 2237, Washington 2239).
const tabsOrder = n => (/^Mc/.test(n) ? 'Mz' + n : n);
export function deriveTabsIds(names) {
  const sorted = [...names].sort((a, b) => tabsOrder(a) < tabsOrder(b) ? -1 : 1);
  return Object.fromEntries(sorted.map((n, i) => [n, String(2001 + i)]));
}

// The TABS search page's county drop-down, when reachable; otherwise null.
async function scrapeTabsIds(names) {
  const want = new Map(names.map(n => [n.toLowerCase(), n]));
  for (const u of ['https://www.tdlr.texas.gov/TABS/Search', 'https://www.tdlr.texas.gov/TABS/Search/Index', 'https://www.tdlr.texas.gov/TABS/']) {
    try {
      const h = await (await fetchRetry(u, {}, 2)).text(), out = {};
      for (const m of h.matchAll(/<option[^>]*value="?(\d{4})"?[^>]*>\s*([^<]+?)\s*<\/option>/gi)) { const n = want.get(m[2].toLowerCase().replace(/ county$/, '')); if (n) out[n] = m[1]; }
      if (Object.keys(out).length >= 250) { log('tabs county ids: read from', u); return out; }
    } catch (e) { /* try the next page */ }
  }
  return null;
}

export async function texasCounties({ scrape = true } = {}) {
  const require = createRequire(import.meta.url), us = require('us-atlas/counties-10m.json');
  const tx = feature(us, us.objects.counties).features.filter(f => String(f.id).startsWith('48'));
  const names = tx.map(f => f.properties.name);
  const derived = deriveTabsIds(names), scraped = scrape ? await scrapeTabsIds(names) : null;
  if (scraped) { const diff = names.filter(n => scraped[n] && scraped[n] !== derived[n]); if (diff.length) log('tabs county ids: TDLR list differs from derived order for', diff.length, 'counties; using TDLR list'); }
  else if (scrape) log('tabs county ids: TDLR drop-down not readable, using derived order');
  return tx.map(f => {
    const g = rewind(f.geometry), name = f.properties.name;
    return { fips: String(f.id), name, tabs_id: (scraped && scraped[name]) || derived[name], label: geoCentroid(g).map(v => Math.round(v * 1e3) / 1e3), outline: { type: 'MultiPolygon', coordinates: round(g.coordinates) } };
  }).sort((a, b) => a.name < b.name ? -1 : 1);
}

// [name, lon, lat] for every Census place in Texas (town-center geocoding fallback)
export async function texasPlaces() {
  try {
    const t = await (await fetchRetry('https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_gaz_place_48.txt')).text();
    const rows = t.split('\n').map(l => l.split('\t').map(s => s.trim())), h = rows[0];
    const iN = h.indexOf('NAME'), iLa = h.indexOf('INTPTLAT'), iLo = h.indexOf('INTPTLONG');
    return rows.slice(1).filter(r => r.length > iLo).map(r => [r[iN].replace(/ (city|town|CDP|village)$/, ''), +(+r[iLo]).toFixed(5), +(+r[iLa]).toFixed(5)]);
  } catch (e) { log('places failed', e.message); return []; }
}
