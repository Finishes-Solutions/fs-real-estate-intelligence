// Diagnostic: what adsb.lol (and the free photo / aircraft databases) return for live planes over Houston: aircraft
// fields (dbFlags = military), flight traces for the 3D path, photos, aircraft details and airports.
// Run "Probe services" with script=adsblol.
const UA = 'FinishesSolutions-probe/1.0';
const j = async (u, h = {}) => { const t = Date.now(); try { const r = await fetch(u, { headers: { 'User-Agent': UA, ...h }, signal: AbortSignal.timeout(12000) }); const x = await r.text(); return { s: r.status, ms: Date.now() - t, x, ct: r.headers.get('content-type'), ce: r.headers.get('content-encoding') }; } catch (e) { return { s: 'ERR ' + e.message, ms: Date.now() - t, x: '' }; } };
const show = (name, r, n = 400) => console.log('\n## ' + name + ' -> ' + r.s + ' ' + r.ms + 'ms ' + (r.ct || '') + ' ' + (r.ce || '') + ' ' + r.x.length + ' bytes\n' + r.x.slice(0, n));
const pt = await j('https://api.adsb.lol/v2/point/29.98/-95.34/60');
show('point', pt, 200);
const ac = JSON.parse(pt.x || '{}').ac || [];
console.log('keys seen:', [...new Set(ac.flatMap(a => Object.keys(a)))].join(','));
console.log('dbFlags values:', JSON.stringify(ac.reduce((m, a) => (m[a.dbFlags ?? 'none'] = (m[a.dbFlags ?? 'none'] || 0) + 1, m), {})));
console.log('types:', JSON.stringify(ac.reduce((m, a) => (m[a.t || '?'] = (m[a.t || '?'] || 0) + 1, m), {})));
console.log('categories:', JSON.stringify(ac.reduce((m, a) => (m[a.category || '?'] = (m[a.category || '?'] || 0) + 1, m), {})));
const pick = [ac.find(a => !a.alt_baro || a.alt_baro !== 'ground' && a.alt_baro > 5000 && a.flight), ac.find(a => a.category === 'A1'), ac.find(a => a.category === 'A7')].filter(Boolean);
for (const a of pick) {
  const hex = a.hex.replace('~', ''), xx = hex.slice(-2);
  console.log('\n==== ' + hex + ' ' + (a.flight || '').trim() + ' ' + (a.t || '') + ' ' + (a.r || ''));
  for (const kind of ['trace_recent', 'trace_full']) {
    for (const [label, h] of [['plain', {}], ['referer', { Referer: 'https://globe.adsb.lol/', 'Accept-Encoding': 'gzip' }]]) {
      const r = await j('https://globe.adsb.lol/data/traces/' + xx + '/' + kind + '_' + hex + '.json', h);
      let info = ''; try { const d = JSON.parse(r.x); info = ' points=' + d.trace?.length + ' timestamp=' + d.timestamp + ' first=' + JSON.stringify(d.trace?.[0]).slice(0, 200) + ' last=' + JSON.stringify(d.trace?.at(-1)).slice(0, 200) + ' top-keys=' + Object.keys(d).join(','); } catch (e) { info = ' (not JSON) ' + r.x.slice(0, 120); }
      console.log(kind, label, r.s, r.ms + 'ms', r.x.length + 'B', info);
    }
  }
  show('api v2 hex', await j('https://api.adsb.lol/v2/hex/' + hex), 300);
  show('planespotters', await j('https://api.planespotters.net/pub/photos/hex/' + hex), 600);
  show('adsbdb aircraft', await j('https://api.adsbdb.com/v0/aircraft/' + hex), 600);
  if (a.flight) show('adsbdb callsign', await j('https://api.adsbdb.com/v0/callsign/' + a.flight.trim()), 600);
}
for (const u of ['https://api.adsb.lol/api/0/airport/KIAH', 'https://api.adsb.lol/api/0/airport/IAH', 'https://api.adsbdb.com/v0/airport/KIAH', 'https://api.adsb.lol/v2/mil', 'https://api.adsb.lol/api/0/me', 'https://api.adsb.lol/v2/closest/29.98/-95.34/50'])
  show(u, await j(u), 500);
