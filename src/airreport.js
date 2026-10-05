// Plane traffic and flight reports.
//   Air Traffic Report for any area (Reports tab, selection bar, Site "Area reports", the assistant): how much air traffic
//   passes over it by hour of day, the mix (jets, props, helicopters, military), how much is low, the trend by month
//   (api/planes?report, from the per-minute sampler within ~100 nm of Houston), low-flight exposure at the middle of the
//   area, nearby airports and whether the area is under a runway's approach path, and the planes overhead right now.
//   Flight Report for one aircraft (plane card → Export Flight Report): photo, registration, route, the flight path map,
//   the altitude and speed profile, today's earlier flights; HTML (print to PDF) and CSV of the track points.
import { esc, fmt, kgrid, table, bars, areaSvg, reportDoc, savePdf, saveCsv, openCard, cardTop, fillCard, centerOf } from './reportkit.js';

const HOUR = h => (h % 12 || 12) + (h < 12 ? 'a' : 'p');
const KIND = { jet: ['Jets', '#1d4ed8'], prop: ['Props and small planes', '#16a34a'], heli: ['Helicopters', '#a855f7'], mil: ['Military', '#b45309'] };
// a simple line chart: [{ x (number), y }]
export function lineSvg(pts, { W = 620, H = 140, color = '#1d4ed8', unit = '', xLabel = v => v } = {}) {
  if (pts.length < 2) return '';
  const xs = pts.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(1, ...pts.map(p => p.y));
  const X = x => 34 + (x - x0) / ((x1 - x0) || 1) * (W - 44), Y = y => 8 + (1 - y / y1) * (H - 30);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join('');
  const ticks = [0, .5, 1].map(f => '<text x="30" y="' + (Y(y1 * f) + 3).toFixed(1) + '" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">' + fmt(Math.round(y1 * f)) + unit + '</text>').join('');
  const xt = [0, .25, .5, .75, 1].map(f => { const v = x0 + (x1 - x0) * f; return '<text x="' + X(v).toFixed(1) + '" y="' + (H - 6) + '" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">' + esc(xLabel(v)) + '</text>'; }).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' + ticks + xt + '<path d="' + d + 'L' + X(x1).toFixed(1) + ',' + Y(0) + 'L' + X(x0).toFixed(1) + ',' + Y(0) + 'Z" fill="' + color + '" fill-opacity=".12"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8"/></svg>';
}
// the hourly profile from the API: average sightings per hour (aircraft seen in the cells, once a minute)
export function profileOf(r) {
  const hrs = (r?.hours || []).map((n, h) => { const s = r.samples_by_hour?.[h] || 0; return { h, n, s, per_hour: s ? n / s * 60 : null }; });
  const ok = hrs.filter(x => x.per_hour != null), day = ok.length ? Math.round(ok.reduce((t, x) => t + x.per_hour, 0) * 24 / ok.length) : null;
  const busiest = ok.length ? ok.slice().sort((a, b) => b.per_hour - a.per_hour)[0] : null, quiet = ok.length ? ok.slice().sort((a, b) => a.per_hour - b.per_hour)[0] : null;
  const t = r?.totals || {}, pct = k => t.n ? Math.round(t[k] / t.n * 1000) / 10 : null;
  return { hours: hrs, per_day: day, busiest_hour: busiest?.h ?? null, quietest_hour: quiet?.h ?? null, low_pct: pct('low'), mix: { jet: pct('jet'), prop: pct('prop'), heli: pct('heli'), mil: pct('mil') }, lowest_ft: t.min_alt ?? null,
    sampled_hours: Math.round((r?.samples_by_hour || []).reduce((a, b) => a + b, 0) / 60), cells: r?.cells || 0 };
}

export function initAirReport(ctx) {
  let last = null;
  const pmi = (a, b) => { const R = Math.PI / 180, h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(h)); };
  // the area's size as a radius in miles (for the low-flight history, the live snapshot and the nearby airports)
  const radiusOf = g => { const c = centerOf(g), r = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]) || []; return Math.max(0.5, Math.min(15, Math.max(...r.map(p => pmi(c, p))) || 1)); };

  async function data({ geometry, months = 3 }) {
    const center = centerOf(geometry), mi = radiusOf(geometry);
    const prof = fetch('api/planes?report=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, months }), signal: AbortSignal.timeout(30000) })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'air traffic history unavailable'); return d; }).catch(e => ({ error: e.message }));
    const near = fetch('api/airports?near=' + center[1].toFixed(4) + ',' + center[0].toFixed(4) + '&km=50&n=6&path=1').then(r => r.ok ? r.json() : null).catch(() => null);
    const low = ctx.airHistory ? ctx.airHistory(center, Math.min(5, Math.max(1, Math.round(mi * 1.609)))).catch(() => null) : null;
    const live = ctx.planesNear ? ctx.planesNear(center, Math.min(15, Math.max(2, mi))).catch(e => ({ error: e.message })) : null;
    const [p, a, l, n] = await Promise.all([prof, near, low, live]);
    return { center, radius_mi: Math.round(mi * 10) / 10, profile: p?.error ? p : p?.history === false ? { error: p.note } : { ...profileOf(p), by_month: p.by_month || [], since: p.since }, airports: a?.airports || [], path: a?.path || null, low: l, live: n };
  }
  ctx.airReportData = data;

  async function report({ geometry, label }) {
    if (ctx.view !== 'map') ctx.setView?.('map');
    const card = openCard(ctx, { kicker: 'Air traffic report', title: label, loading: 'Reading the air traffic history…' });
    let d; try { d = await data({ geometry }); } catch (e) { card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return; }
    last = { d, label, geometry };
    const p = d.profile, live = d.live?.aircraft || [], lowNow = live.filter(x => !x.ground && x.alt != null && x.alt < 3000);
    fillCard(ctx, card, cardTop('Air traffic report', label, p.error ? '' : 'Since ' + esc(p.since || '') + ' · ~5 km cells around the area') +
      '<div class="bsec">' + (p.error ? '<div class="rnote">' + esc(p.error) + '</div>' : kgrid([[p.per_day != null ? fmt(p.per_day) : '—', 'Aircraft sightings a day'], [p.busiest_hour != null ? HOUR(p.busiest_hour) : '—', 'Busiest hour'], [p.low_pct != null ? p.low_pct + '%' : '—', 'Under 3,000 ft'], [fmt(live.length), 'Overhead now']])) +
      (d.path ? '<div class="apt-path"><b>Under the approach path</b> to ' + esc(d.path.code) + ' runway ' + esc(d.path.landing_runway) + ' (' + d.path.beyond_nm + ' nm from the runway end).</div>' : '') + '</div>' +
      (p.hours?.length && p.per_day ? '<div class="bsec"><div class="lt">By hour of day (sightings an hour)</div>' + bars(p.hours.map(x => ({ label: HOUR(x.h), v: Math.round(x.per_hour || 0) })), { height: 90, every: 3 }) + '</div>' : '') +
      (p.mix && p.per_day ? '<div class="bsec"><div class="lt">What flies over</div><dl>' + Object.entries(KIND).map(([k, [n]]) => p.mix[k] != null ? '<dt>' + n + '</dt><dd class="mono">' + p.mix[k] + '%</dd>' : '').join('') + '</dl>' +
        '<div class="rnote">Lowest seen ' + (p.lowest_ft != null ? fmt(p.lowest_ft) + ' ft' : '—') + '. Shares of all sightings; the rest are unclassified.</div></div>' : '') +
      (d.low?.history ? '<div class="bsec"><div class="lt">Low flights at the center</div><div>' + fmt(d.low.low_per_day) + ' low sightings a day within ~' + Math.min(5, Math.max(1, Math.round(d.radius_mi * 1.609))) + ' km, lowest ' + (d.low.lowest_ft != null ? fmt(d.low.lowest_ft) + ' ft' : '—') + '.</div></div>' : '') +
      (d.airports.length ? '<div class="bsec"><div class="lt">Airports nearby</div>' + d.airports.slice(0, 5).map(a => '<div class="pl"><b><button class="lnk" type="button" data-apt="' + esc(a.ident) + '">' + esc(a.name) + '</button></b><span>' + esc((a.iata || a.icao || a.ident) + ' · ' + (a.km * 0.621371).toFixed(1) + ' mi') + '</span></div>').join('') + '</div>' : '') +
      '<div class="bsec"><div class="lt">Right now</div>' + (d.live?.error ? '<div class="rnote">' + esc(d.live.error) + '</div>' : '<div>' + fmt(live.length) + ' aircraft within ' + fmt(Math.max(2, d.radius_mi)) + ' mi, ' + fmt(lowNow.length) + ' under 3,000 ft.</div>' + (live.length ? '<div class="rnote">' + live.slice(0, 8).map(x => esc((x.flight || x.reg || x.hex) + (x.desc ? ' · ' + x.desc : '') + (x.alt != null ? ' · ' + fmt(x.alt) + ' ft' : ''))).join('; ') + '</div>' : '')) + '</div>' +
      '<div class="bacts"><button class="btn primary" id="arPdf" type="button">Export PDF</button><button class="btn" id="arCsv" type="button">Export CSV</button><button class="btn" id="arLive" type="button">Show Live Planes</button></div>' +
      '<div class="rnote bsec">A sighting is one aircraft seen in the area at one of our once-a-minute samples, so a plane that circles counts more than one that passes. Coverage: ~100 nm around Houston, from community ADS-B receivers (some military and private aircraft are hidden). History starts October 2026.<span class="src"> adsb.lol; OurAirports.</span></div>');
    card.querySelector('#arPdf').onclick = exportReport; card.querySelector('#arCsv').onclick = exportCsv;
    card.querySelector('#arLive').onclick = () => ctx.live?.set?.({ planes: true });
    card.querySelectorAll('[data-apt]').forEach(b => b.onclick = () => ctx.airportCard?.(b.dataset.apt, { fly: true }));
  }
  ctx.airReport = report;
  function exportCsv() {
    if (!last) return; const { d, label } = last, p = d.profile, rows = [];
    for (const x of p.hours || []) rows.push({ Table: 'By hour', Item: HOUR(x.h), Value: x.per_hour != null ? Math.round(x.per_hour * 10) / 10 : '', Unit: 'sightings an hour', Samples: x.s });
    for (const [m, n, low] of p.by_month || []) rows.push({ Table: 'By month', Item: m, Value: n, Unit: 'sightings (' + low + ' low)', Samples: '' });
    for (const [k, [n]] of Object.entries(KIND)) if (p.mix?.[k] != null) rows.push({ Table: 'Mix', Item: n, Value: p.mix[k], Unit: '% of sightings', Samples: '' });
    for (const a of d.airports) rows.push({ Table: 'Airport nearby', Item: a.name + ' (' + (a.iata || a.icao || a.ident) + ')', Value: (a.km * 0.621371).toFixed(1), Unit: 'miles', Samples: '' });
    for (const x of d.live?.aircraft || []) rows.push({ Table: 'Overhead now', Item: (x.flight || x.reg || x.hex) + (x.desc ? ' · ' + x.desc : ''), Value: x.alt ?? '', Unit: 'ft', Samples: '' });
    saveCsv(ctx, 'airtraffic', label, rows);
  }
  async function exportReport() {
    if (!last) return; const { d, label, geometry } = last, p = d.profile, live = d.live?.aircraft || [];
    const body = '<div class="kp">' + [[p.per_day != null ? fmt(p.per_day) : '—', 'Sightings a day'], [p.busiest_hour != null ? HOUR(p.busiest_hour) : '—', 'Busiest hour'], [p.low_pct != null ? p.low_pct + '%' : '—', 'Under 3,000 ft'], [fmt(live.length), 'Overhead at report time']].map(([v, l]) => '<div><b>' + v + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>' +
      (d.path ? '<p><b>Under the approach path</b> to ' + esc(d.path.name || d.path.code) + ' runway ' + esc(d.path.landing_runway) + ': ' + d.path.beyond_nm + ' nm from the runway end, ' + d.path.offset_nm + ' nm off the centerline.</p>' : '') +
      '<div class="map">' + areaSvg([{ geometry, stroke: '#1d4ed8', fill: 'rgba(29,78,216,.05)', dash: true }], { points: [...d.airports.slice(0, 4).map(a => ({ c: [a.lon, a.lat], r: 5, color: '#1d4ed8', label: a.iata || a.icao || a.ident })), ...live.map(x => ({ c: [x.lon, x.lat], r: 2.5, color: x.alt < 3000 ? '#c2410c' : '#64748b' }))] }) + '</div>' +
      '<div class="lg"><span><i style="background:#1d4ed8"></i>Airport</span><span><i style="background:#c2410c"></i>Aircraft under 3,000 ft (at report time)</span><span><i style="background:#64748b"></i>Higher</span></div>' +
      (p.per_day ? '<h2>By hour of day</h2><div class="bars">' + bars(p.hours.map(x => ({ label: HOUR(x.h), v: Math.round(x.per_hour || 0) })), { every: 2 }) + '</div>' : '<p class="meta">' + esc(p.error || 'No history yet for this area.') + '</p>') +
      '<div class="two"><div><h2>What flies over</h2>' + table(['Kind', { t: 'Share', r: 1 }], Object.entries(KIND).filter(([k]) => p.mix?.[k] != null).map(([k, [n]]) => [n, p.mix[k] + '%'])) + '</div>' +
        '<div><h2>By month</h2>' + table(['Month', { t: 'Sightings', r: 1 }, { t: 'Under 3,000 ft', r: 1 }], (p.by_month || []).map(([m, n, low]) => [esc(String(m).slice(0, 7)), fmt(n), fmt(low)])) + '</div></div>' +
      (d.airports.length ? '<h2>Airports nearby</h2>' + table(['Airport', 'Code', { t: 'Miles', r: 1 }], d.airports.map(a => [esc(a.name), esc(a.iata || a.icao || a.ident), (a.km * 0.621371).toFixed(1)])) : '') +
      (live.length ? '<h2>Aircraft overhead when the report was made</h2>' + table(['Flight', 'Aircraft', { t: 'Altitude ft', r: 1 }, { t: 'Miles away', r: 1 }], live.map(x => [esc(x.flight || x.reg || x.hex), esc(x.desc || x.type || ''), x.ground ? 'ground' : fmt(x.alt), fmt(x.miles)])) : '');
    await savePdf(ctx, 'airtraffic', label, reportDoc({ kicker: 'Air traffic report', title: label, meta: p.since ? 'History since ' + esc(p.since) : '', body,
      sources: 'Community ADS-B receivers (adsb.lol, ODbL), sampled once a minute within ~100 nm of Houston into ~5 km cells; OurAirports (airports, runways). A sighting is one aircraft seen at one sample: an exposure measure, not a count of distinct flights.' }));
  }
  ctx.addAreaReport?.({ key: 'airtraffic', label: 'Air Traffic Report', desc: 'Plane traffic over an area: sightings a day, the busiest hours, how much is low, jets vs props vs helicopters, nearby airports and approach paths, and what’s overhead right now. Export as a PDF report or CSV.',
    note: 'Houston region (~100 nm). Select an area, or use the map view', run: ({ geometry, label }) => report({ geometry, label }) });

  // ---------- flight report (one aircraft) ----------
  ctx.flightReport = async (p, have = {}) => {
    if (!p?.hex) return;
    ctx.toast?.('Building the flight report…');
    const [track, info, route, reg] = await Promise.all([have.track || ctx.planeTrack?.(p.hex).catch(() => null), have.info || ctx.planeInfo?.(p).catch(() => null), ctx.planeRoute?.(p).catch(() => null),
      have.reg || (ctx.planeRegistry ? ctx.planeRegistry([p.hex, p.reg].filter(Boolean)).then(l => l.find(x => x?.found) || l[0]).catch(() => null) : null)]);
    const pts = (track?.points || []).map(([lon, lat, alt, t]) => ({ lon, lat, alt, t }));
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dt = (b.t - a.t) / 3600; b.kt = dt > 0 ? Math.round(pmi([a.lon, a.lat], [b.lon, b.lat]) / 1.15078 / dt) : null; }
    const id = p.flight || p.reg || p.hex.toUpperCase(), leg = track?.leg, when = s => s ? new Date(typeof s === 'number' ? s * 1000 : s).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const ap = a => a ? (a.code ? a.code + ' ' : '') + (a.name || a.city || '') : '';
    const okRoute = route?.origin && route?.destination;
    const line = pts.length > 1 ? { type: 'LineString', coordinates: pts.map(x => [x.lon, x.lat]) } : null;
    const mapSvg = line ? areaSvg([{ geometry: line, stroke: '#1d4ed8', fill: 'none', width: 2.2 }], { points: [
      ...(okRoute ? [route.origin, route.destination].filter(a => Number.isFinite(a.lat)).map(a => ({ c: [a.lon, a.lat], r: 5, color: '#006527', label: a.code || '' })) : []),
      { c: [pts[pts.length - 1].lon, pts[pts.length - 1].lat], r: 6, color: '#c2410c', label: 'Now' }] }) : '';
    const t0 = pts[0]?.t, tl = v => { const d = new Date(v * 1000); return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
    const body = (info?.photo?.src ? '<div class="photo"><img src="' + esc(info.photo.src) + '" alt=""></div><div class="cap">Photo' + (info.photo.credit ? ' © ' + esc(info.photo.credit) : '') + ' · ' + esc(info.photo.source || '') + '</div>' : '') +
      '<div class="kp">' + [[p.ground ? 'Ground' : fmt(p.alt) + ' ft', 'Altitude at report'], [p.gs != null ? p.gs + ' kt' : '—', 'Ground speed'], [leg?.max_alt_ft ? fmt(leg.max_alt_ft) + ' ft' : '—', 'Highest this flight'], [okRoute ? (route.origin.code || '?') + ' → ' + (route.destination.code || '?') : '—', 'Route']].map(([v, l]) => '<div><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>' +
      (okRoute ? '<p><b>' + esc(ap(route.origin)) + '</b> to <b>' + esc(ap(route.destination)) + '</b>' + (route.mismatch ? ' (the database route may be stale: the flight path started elsewhere)' : '') + '.</p>' : '') +
      (mapSvg ? '<h2>Flight path</h2><div class="map">' + mapSvg + '</div>' : '') +
      (pts.length > 1 ? '<h2>Altitude (ft)</h2><div class="bars">' + lineSvg(pts.map(x => ({ x: x.t, y: Math.max(0, x.alt) })), { xLabel: tl }) + '</div>' +
        '<h2>Ground speed (knots)</h2><div class="bars">' + lineSvg(pts.filter(x => x.kt != null && x.kt < 700).map(x => ({ x: x.t, y: x.kt })), { color: '#16a34a', xLabel: tl }) + '</div>' : '') +
      '<div class="two"><div><h2>Aircraft</h2>' + table(['', ''], [['Callsign', esc(p.flight || '—')], ['Registration', esc(p.reg || track?.registration || '—')], ['Type', esc([p.desc, p.type].filter(Boolean).join(' · ') || '—')], ['Operator', esc(track?.operator || info?.owner || '—')], ['Built', esc(track?.year || '—')], ['ICAO hex', esc(p.hex)], ['Military', p.mil || track?.military ? 'Yes' : 'No']]) + '</div>' +
        '<div><h2>Registration (FAA)</h2>' + (reg?.found ? table(['', ''], [['Registered to', esc(reg.owner || 'Withheld')], ['Location', esc([reg.city, reg.state].filter(Boolean).join(', '))], ['Tail number', esc(reg.n_number || '')], ['Aircraft', esc(reg.aircraft || '')], ['Registered', esc(reg.registered || '')]]) : '<p class="meta">' + (reg?.us === false ? 'Not a US-registered aircraft.' : 'No FAA registry record found.') + '</p>') + '</div></div>' +
      (leg ? '<h2>This flight</h2>' + table(['', ''], [[leg.started_on_ground ? 'Departed' : 'First seen', esc(when(leg.start))], ['Last seen', esc(when(leg.end))], ['Track points', fmt(pts.length)]]) : '') +
      ((track?.today || []).length > 1 ? '<h2>Today’s flights</h2>' + table(['Started', 'Ended', { t: 'Highest ft', r: 1 }], track.today.map(l => [esc(when(l.start)), esc(when(l.end)), fmt(l.max_alt_ft)])) : '');
    ctx.exportMeta = null;
    await savePdf(ctx, 'flight', id, reportDoc({ kicker: 'Flight report', title: id + (p.desc ? ' · ' + p.desc : ''), meta: esc(okRoute ? ap(route.origin) + ' → ' + ap(route.destination) : 'Route not in the database'), body,
      sources: 'Community ADS-B (adsb.lol traces, ODbL); routes from adsbdb / adsb.lol; photo from planespotters.net; FAA aircraft registry. Positions are as broadcast by the aircraft; some military and private aircraft are hidden.' }));
    if (have.csv !== false && pts.length) saveCsv(ctx, 'flight', id, pts.map(x => ({ Time: new Date(x.t * 1000).toISOString(), Latitude: x.lat, Longitude: x.lon, 'Altitude ft': x.alt, 'Ground speed kt (computed)': x.kt ?? '' })));
  };
}
