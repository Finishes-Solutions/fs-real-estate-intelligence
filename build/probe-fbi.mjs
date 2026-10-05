// Diagnostic: FBI Crime Data Explorer response shapes for crime by city / county (api/crimeus).
// Run "Probe services" with script=fbi.
const WEB = 'https://cde.ucr.cjis.gov/LATEST';
const j = async u => { const t = Date.now(), r = await fetch(u, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }); const s = await r.text(); console.log('  ' + r.status + ' ' + s.length + 'B ' + (Date.now() - t) + 'ms ' + u.replace(WEB, '')); try { return JSON.parse(s); } catch (e) { return null; } };
const shape = d => { if (!d) return 'null'; const o = d.offenses || {}, p = d.populations || {};
  const ks = m => Object.entries(m || {}).map(([k, v]) => k + '[' + Object.keys(v || {}).length + ' ' + Object.keys(v || {}).sort((a, b) => a.slice(3) + a.slice(0, 2) < b.slice(3) + b.slice(0, 2) ? -1 : 1).slice(0, 1) + '…' + Object.keys(v || {}).sort((a, b) => a.slice(3) + a.slice(0, 2) < b.slice(3) + b.slice(0, 2) ? -1 : 1).slice(-1) + ']').join(', ');
  return 'rates: ' + ks(o.rates) + '\n  actuals: ' + ks(o.actuals) + '\n  population: ' + ks(p.population) + '\n  participated: ' + ks(p.participated_population) + '\n  coverage: ' + ks(d.tooltips?.['Percent of Population Coverage']) + '\n  other keys: ' + Object.keys(d).join(',') + ' cde_properties ' + JSON.stringify(d.cde_properties); };

console.log('# history depth and the newest month (Houston PD violent crime 2010–2026)');
let d = await j(WEB + '/summarized/agency/TXHPD0000/violent-crime?from=01-2010&to=12-2026'); console.log(shape(d));
const hpd = Object.keys(d?.offenses?.actuals || {}).find(k => /Offenses/.test(k));
console.log('  HPD actuals 2024–2026:', JSON.stringify(Object.fromEntries(Object.entries(d?.offenses?.actuals?.[hpd] || {}).filter(([k]) => /202[456]$/.test(k)))));
console.log('  HPD population sample:', JSON.stringify(Object.entries(Object.values(d?.populations?.population || {}).at(-1) || {}).slice(-3)));

console.log('\n# small agencies near Waller: directory entries');
const dir = await j(WEB + '/agency/byStateAbbr/TX'), all = Object.values(dir || {}).flat();
for (const a of all.filter(a => /^(WALLER|AUSTIN|FORT BEND)/.test(a.counties))) console.log('  ' + [a.ori, a.agency_type_name, a.agency_name, a.counties, a.latitude, a.longitude, a.is_nibrs, a.nibrs_start_date].join(' | '));
console.log('  multi-county agencies:', all.filter(a => /,/.test(a.counties || '')).slice(0, 5).map(a => a.agency_name + ' [' + a.counties + ']').join('; '));
console.log('  no-coords share:', all.filter(a => a.latitude == null).length + '/' + all.length);

for (const ori of ['TX2370000', 'TX2370100', 'TX0080000']) { console.log('\n# ' + ori + ' violent + property 2021–2025'); for (const o of ['violent-crime', 'property-crime']) { d = await j(WEB + '/summarized/agency/' + ori + '/' + o + '?from=01-2021&to=12-2025'); console.log('  ' + shape(d)); const k = Object.keys(d?.offenses?.actuals || {}).find(k => /Offenses/.test(k)); console.log('  actuals:', JSON.stringify(d?.offenses?.actuals?.[k] || null).slice(0, 700)); } }

console.log('\n# other states: directory sizes and key shape');
for (const st of ['CA', 'NY', 'LA', 'VA', 'DC']) { const x = await j(WEB + '/agency/byStateAbbr/' + st), list = Object.values(x || {}).flat(); const types = {}; list.forEach(a => types[a.agency_type_name] = (types[a.agency_type_name] || 0) + 1); console.log('  ' + st + ': ' + list.length + ' ' + JSON.stringify(types) + ' sample: ' + list.filter(a => a.agency_type_name !== 'Other').slice(0, 3).map(a => a.agency_name + ' [' + a.counties + ']').join('; ')); }
const ny = Object.values(await j(WEB + '/agency/byStateAbbr/NY') || {}).flat(); console.log('  NYC:', ny.filter(a => /new york city|nypd|new york police/i.test(a.agency_name)).map(a => a.ori + ' ' + a.agency_name + ' [' + a.counties + ']').join('; '));
const va = Object.values(await j(WEB + '/agency/byStateAbbr/VA') || {}).flat(); console.log('  Fairfax:', va.filter(a => /fairfax/i.test(a.agency_name)).map(a => a.ori + ' ' + a.agency_type_name + ' ' + a.agency_name + ' [' + a.counties + ']').join('; '));
const tn = Object.values(await j(WEB + '/agency/byStateAbbr/TN') || {}).flat(); console.log('  Nashville:', tn.filter(a => /nashville|davidson/i.test(a.agency_name)).map(a => a.ori + ' ' + a.agency_type_name + ' ' + a.agency_name + ' [' + a.counties + ']').join('; '));
console.log('\n# national + state shapes');
console.log(shape(await j(WEB + '/summarized/national/violent-crime?from=01-2024&to=12-2025')));
console.log(shape(await j(WEB + '/summarized/state/TX/property-crime?from=01-2024&to=12-2025')));
console.log('\n# census geocoder outside a city (rural Waller County) and in Brookshire');
for (const [x, y] of [[-96.0, 30.05], [-95.95, 29.786]]) { const g = await j('https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=' + x + '&y=' + y + '&benchmark=Public_AR_Current&vintage=Current_Current&layers=Incorporated%20Places,Counties,States&format=json'); const G = g?.result?.geographies || {}; console.log('  ', JSON.stringify({ place: G['Incorporated Places']?.map(p => [p.NAME, p.BASENAME, p.GEOID, p.LSADC]), county: G.Counties?.map(c => [c.NAME, c.BASENAME, c.GEOID]), state: G.States?.map(s => [s.STUSAB, s.NAME, s.STATE]) })); }
