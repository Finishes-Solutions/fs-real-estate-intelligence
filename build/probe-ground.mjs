// Diagnostic: aircraft reported on the ground at Houston airports vs. other big airports, per feed, plus what the deployed
// app's api/planes returns for the same box. Run "Probe services" with script=ground.
const H = { 'User-Agent': 'FinishesSolutions-probe/1.0 (+https://fs-real-estate-intelligence.vercel.app)', Accept: 'application/json' };
const j = async u => { const t = Date.now(); try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(12000) }); const x = await r.text(); return { s: r.status, ms: Date.now() - t, x }; } catch (e) { return { s: 'ERR ' + e.message, ms: Date.now() - t, x: '' }; } };
const AIRPORTS = { IAH: [29.984, -95.341], HOU: [29.646, -95.279], EFD: [29.607, -95.159], SGR: [29.622, -95.657], DWH: [30.062, -95.553], CXO: [30.352, -95.415], DFW: [32.897, -97.038], DAL: [32.847, -96.852], AUS: [30.194, -97.670], SAT: [29.534, -98.469], ATL: [33.640, -84.427], LAX: [33.942, -118.408] };
const FEEDS = {
  'adsb.lol': (la, lo, nm) => 'https://api.adsb.lol/v2/point/' + la + '/' + lo + '/' + nm,
  'adsb.fi': (la, lo, nm) => 'https://opendata.adsb.fi/api/v2/lat/' + la + '/lon/' + lo + '/dist/' + nm,
  'adsb.one': (la, lo, nm) => 'https://api.adsb.one/v2/point/' + la + '/' + lo + '/' + nm,
  'airplanes.live': (la, lo, nm) => 'https://api.airplanes.live/v2/point/' + la + '/' + lo + '/' + nm
};
const sum = list => {
  const g = list.filter(a => a.alt_baro === 'ground'), low = list.filter(a => typeof a.alt_baro === 'number' && a.alt_baro < 1500);
  const fresh = g.filter(a => (a.seen_pos ?? a.seen ?? 0) < 60), types = {}; for (const a of g) types[a.type || '?'] = (types[a.type || '?'] || 0) + 1;
  return 'total ' + String(list.length).padStart(3) + ' | ground ' + String(g.length).padStart(3) + ' (fresh<60s ' + String(fresh.length).padStart(3) + ', no pos ' + g.filter(a => !Number.isFinite(a.lat)).length + ') | below 1500 ft ' + String(low.length).padStart(3) + ' | ground msg types ' + JSON.stringify(types);
};
for (const [code, [la, lo]] of Object.entries(AIRPORTS)) {
  for (const [name, f] of Object.entries(FEEDS)) {
    const r = await j(f(la, lo, 3)); let list = [];
    try { const d = JSON.parse(r.x); list = d.ac || d.aircraft || []; } catch (e) {}
    console.log(code.padEnd(4), name.padEnd(15), String(r.s).padEnd(4), String(r.ms).padStart(5) + 'ms', r.s === 200 ? sum(list) : r.x.slice(0, 100));
    if (name === 'adsb.lol' && r.s === 200) for (const a of list.filter(a => a.alt_baro === 'ground').slice(0, 3)) console.log('      sample', JSON.stringify({ hex: a.hex, flight: a.flight, t: a.t, type: a.type, seen: a.seen, seen_pos: a.seen_pos, gs: a.gs, lat: a.lat, lon: a.lon }));
    await new Promise(r => setTimeout(r, 1200));
  }
  // the deployed app, a box about 4 mi across around the airport (what the map asks for at zoom ~12)
  const d = .03, r = await j('https://fs-real-estate-intelligence.vercel.app/api/planes?bbox=' + [lo - d, la - d, lo + d, la + d].map(v => v.toFixed(3)).join(','));
  let out = null; try { out = JSON.parse(r.x); } catch (e) {}
  const ac = (out?.aircraft || []), kept = ac.filter(p => p.seen == null || p.seen < 60);
  console.log(code.padEnd(4), 'app api'.padEnd(15), String(r.s).padEnd(4), String(r.ms).padStart(5) + 'ms', out ? 'source ' + out.source + ' | ' + ac.length + ' aircraft, ground ' + ac.filter(p => p.ground).length + ', ground kept by map ' + kept.filter(p => p.ground).length : r.x.slice(0, 120));
}
