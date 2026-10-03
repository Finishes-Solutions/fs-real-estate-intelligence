// Diagnostic: live aircraft around Houston and what the route / type lookups return for them. Run "Probe services" with script=planes.
const H = { 'User-Agent': 'FinishesSolutions-probe/1.0', 'Content-Type': 'application/json' };
const j = async (u, o) => { const t = Date.now(); try { const r = await fetch(u, { ...o, headers: H, signal: AbortSignal.timeout(10000) }); const x = await r.text(); return { s: r.status, ms: Date.now() - t, x }; } catch (e) { return { s: 'ERR ' + e.message, ms: Date.now() - t, x: '' }; } };
const pt = await j('https://api.adsb.lol/v2/point/29.98/-95.34/40');
console.log('point', pt.s, pt.ms + 'ms');
const ac = (JSON.parse(pt.x || '{}').ac || []).filter(a => a.flight?.trim()).slice(0, 12);
console.log('sample fields:', JSON.stringify(ac[0] || {}).slice(0, 600));
console.log('with desc:', ac.filter(a => a.desc).length, 'of', ac.length, '| with t:', ac.filter(a => a.t).length);
for (const a of ac) {
  const cs = a.flight.trim(), body = JSON.stringify({ planes: [{ callsign: cs, lat: a.lat, lng: a.lon }] });
  const r = await j('https://api.adsb.lol/api/0/routeset', { method: 'POST', body });
  let x = null; try { x = JSON.parse(r.x)?.[0]; } catch (e) {}
  console.log(cs.padEnd(9), (a.t || '?').padEnd(5), String(a.desc || '').padEnd(24), '| routeset', r.s, r.ms + 'ms', x ? (x._airport_codes_iata || '') + ' plausible=' + x.plausible + ' airports=' + (x._airports || []).length : 'body: ' + r.x.slice(0, 120));
}
// alternative: adsbdb (free, no key) callsign route and aircraft type
for (const a of ac.slice(0, 5)) {
  const cs = a.flight.trim(), r = await j('https://api.adsbdb.com/v0/callsign/' + cs), h = await j('https://api.adsbdb.com/v0/aircraft/' + a.hex);
  let fr = null, ty = null; try { fr = JSON.parse(r.x).response?.flightroute; } catch (e) {} try { ty = JSON.parse(h.x).response?.aircraft; } catch (e) {}
  console.log('adsbdb', cs.padEnd(9), r.s, fr ? fr.origin?.iata_code + '→' + fr.destination?.iata_code : r.x.slice(0, 80), '| aircraft', h.s, ty ? ty.manufacturer + ' ' + ty.type + ' (' + ty.icao_type + ')' : h.x.slice(0, 80));
}
