// Drive-time maps: everywhere you can drive to within 10, 20 and 30 minutes (or other times) of a point, as nested bands
// on the map, for leaving now (live traffic) or a typical weekday morning, evening or weekend. The card lists each band's
// area, the people, households and jobs inside it (US Census tracts), and the filings inside it; any band can become
// the map selection, so every area report (crime, FEMA, traffic…) works on a "20-minute drive" trade area.
// Data: api/isochrone (TomTom reachable range with traffic; Valhalla / OpenStreetMap without).
import { inGeom, tractsFor, summarizeTracts } from './lib/demographics.mjs';
import { esc, fmt, kgrid, table, areaSvg, reportDoc, savePdf, saveCsv, openCard, cardTop, fillCard, centerOf } from './reportkit.js';

export const BAND_COL = ['#16a34a', '#eab308', '#f97316', '#dc2626'];
const DEPARTS = [['now', 'Now'], ['weekday-am', 'Weekday 8 AM'], ['weekday-pm', 'Weekday 5 PM'], ['weekend', 'Sunday']];
const SETS = [[5, 10, 15], [10, 20, 30], [15, 30, 45], [20, 40, 60]];

export function initDriveTime(ctx) {
  const { map } = ctx; let last = null, seq = 0;
  const SRC = 'drivetime';

  async function fetchBands(center, minutes, depart) {
    const q = new URLSearchParams({ lat: center[1].toFixed(3), lon: center[0].toFixed(3), minutes: minutes.join(','), depart }); // rounded: nearby requests share the cache
    const r = await fetch('api/isochrone?' + q, { signal: AbortSignal.timeout(40000) }); const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || (r.status === 404 ? 'Drive-time maps aren’t deployed here.' : 'Drive-time lookup failed (' + r.status + ')'));
    return d;
  }
  // people, households and jobs inside each band (census tracts whose middle falls inside), and the filings on the map
  async function enrich(d) {
    let m = null; try { m = await ctx.loadMarket?.(); } catch (e) { /* census data is optional */ }
    const filings = ctx.visible || [];
    return d.features.map(f => {
      const g = f.geometry, x = m?.tracts ? summarizeTracts(tractsFor(m.tracts, { geom: g })) : null;
      return { minutes: f.properties.minutes, sqmi: f.properties.sqmi, geometry: g, people: x?.population ?? null, households: x?.households ?? null, jobs: x?.jobs ?? null,
        income: x?.median_household_income_approx ?? null, tracts: x?.tracts ?? 0, filings: filings.filter(p => p.lon != null && inGeom([p.lon, p.lat], g)).length };
    });
  }
  function draw(d) {
    try {
      const fc = { type: 'FeatureCollection', features: d ? d.features.map((f, i) => ({ ...f, properties: { ...f.properties, col: BAND_COL[i] || BAND_COL[3] } })).reverse() : [] };
      const s = map.getSource(SRC); if (s) { s.setData(fc); } else if (d) {
        map.addSource(SRC, { type: 'geojson', data: fc });
        map.addLayer({ id: SRC + '-fill', type: 'fill', source: SRC, paint: { 'fill-color': ['get', 'col'], 'fill-opacity': .14 } });
        map.addLayer({ id: SRC + '-line', type: 'line', source: SRC, paint: { 'line-color': ['get', 'col'], 'line-width': 2.2 } });
        map.addLayer({ id: SRC + '-lbl', type: 'symbol', source: SRC, layout: { 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'minutes']], ' min'], 'text-size': 12, 'symbol-spacing': 320 },
          paint: { 'text-color': ['get', 'col'], 'text-halo-color': '#fff', 'text-halo-width': 1.6 } });
        map.on('click', SRC + '-fill', e => { if (!last || !document.getElementById('card')?.classList.contains('open')) return; const m = Math.min(...e.features.map(f => f.properties.minutes)); const b = last.bands.find(x => x.minutes === m); if (b) select(b); });
      }
      ctx.setLegend?.('drivetime', d ? '<div class="t">Drive time</div>' + d.features.map((f, i) => '<div class="li"><i style="background:' + (BAND_COL[i] || BAND_COL[3]) + '"></i>' + f.properties.minutes + ' min</div>').join('') : '');
    } catch (e) { /* map style still loading */ }
  }
  const clear = () => { last = null; draw(null); };
  ctx.clearDriveTime = clear;
  ctx.onOverlays?.(() => { if (last && !map.getSource(SRC)) draw(last.d); });

  function select(b) {
    const label = b.minutes + '-minute drive from ' + last.label;
    // the selection is a plain polygon wound the way d3 expects (as the drawn shapes are)
    let g = b.geometry; try { if (window.d3?.geoArea(g) > 2 * Math.PI) g = { type: 'Polygon', coordinates: [g.coordinates[0].slice().reverse()] }; } catch (e) {}
    ctx.setSelection?.('shape', label, g);
    ctx.toast?.('Selected: ' + label + '. Area reports on the selection bar now use it.');
  }

  // open the drive-time card and draw the bands
  async function show({ center, label, minutes = [10, 20, 30], depart = 'now' }) {
    const my = ++seq; if (ctx.view !== 'map') ctx.setView?.('map');
    const card = openCard(ctx, { kicker: 'Drive-time map', title: label, loading: 'Working out how far you can drive…' });
    let d, bands; try { d = await fetchBands(center, minutes, depart); bands = await enrich(d); }
    catch (e) { if (my === seq) card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return { error: e.message }; }
    if (my !== seq) return {};
    last = { d, bands, center, label, minutes, depart };
    draw(d); ctx.fitGeom?.(d.features[d.features.length - 1].geometry);
    render(card);
    return last;
  }
  function render(card) {
    const { d, bands, label, minutes, depart } = last, hasCensus = bands.some(b => b.people != null);
    const when = depart === 'now' ? (d.traffic ? 'Leaving now, with live traffic' : 'Without traffic') : (DEPARTS.find(x => x[0] === depart)?.[1] || '') + (d.traffic ? ', typical traffic' : '');
    const big = bands[bands.length - 1];
    fillCard(ctx, card, cardTop('Drive-time map', label, esc(when) + '<span class="src"> · ' + esc(d.source) + '</span>') +
      '<div class="bsec"><div class="dt-ctl"><div class="mi-chips" role="radiogroup" aria-label="Leaving">' + DEPARTS.map(([k, l]) => '<button type="button" class="chip" role="radio" data-dep="' + k + '" aria-checked="' + (k === depart) + '">' + l + '</button>').join('') + '</div>' +
      '<div class="mi-chips" role="radiogroup" aria-label="Minutes">' + SETS.map(s => '<button type="button" class="chip" role="radio" data-set="' + s.join(',') + '" aria-checked="' + (s.join() === minutes.join()) + '">' + s.join(' / ') + ' min</button>').join('') + '</div></div>' +
      (d.note ? '<div class="rnote">' + esc(d.note) + '</div>' : '') +
      kgrid([[fmt(big.sqmi), 'Sq mi within ' + big.minutes + ' min'], [big.people == null ? '—' : fmt(big.people), 'People'], [big.jobs == null ? '—' : fmt(big.jobs), 'Jobs'], [fmt(big.filings), 'Filings on the map']]) + '</div>' +
      '<div class="bsec"><div class="lt">By drive time</div>' + bands.map((b, i) => '<div class="pl dt-band"><b><i style="background:' + (BAND_COL[i] || BAND_COL[3]) + '"></i>' + b.minutes + ' min</b><span>' +
        esc(fmt(b.sqmi) + ' sq mi' + (b.people != null ? ' · ' + fmt(b.people) + ' people · ' + fmt(b.households) + ' households' + (b.income ? ' · median income $' + fmt(Math.round(b.income / 1000)) + 'k' : '') + (b.jobs != null ? ' · ' + fmt(b.jobs) + ' jobs' : '') : '') + ' · ' + fmt(b.filings) + ' filings') +
        '</span><button class="lnk" type="button" data-sel="' + b.minutes + '">Select this area</button></div>').join('') +
      (hasCensus ? '<div class="rnote">People, households and jobs count the census tracts whose center is inside each band (counties loaded on the map only). Each band includes the ones inside it.</div>' : '<div class="rnote">Census figures cover the counties loaded on the map; this area is outside them.</div>') + '</div>' +
      '<div class="bacts"><button class="btn primary" id="dtPdf" type="button">Export PDF</button><button class="btn" id="dtCsv" type="button">Export CSV</button><button class="btn" id="dtClear" type="button">Clear from Map</button></div>' +
      '<div class="rnote bsec">Drive times are estimates for a car. Click a band on the map, or “Select this area”, to run the crime, FEMA or traffic report on it.</div>');
    card.querySelectorAll('[data-dep]').forEach(b => b.onclick = () => show({ ...last, depart: b.dataset.dep }));
    card.querySelectorAll('[data-set]').forEach(b => b.onclick = () => show({ ...last, minutes: b.dataset.set.split(',').map(Number) }));
    card.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => select(bands.find(x => x.minutes === +b.dataset.sel)));
    card.querySelector('#dtPdf').onclick = exportReport; card.querySelector('#dtCsv').onclick = exportCsv;
    card.querySelector('#dtClear').onclick = () => { clear(); ctx.closeCard?.(); };
  }
  function exportCsv() {
    if (!last) return;
    saveCsv(ctx, 'drivetime', last.label, last.bands.map(b => ({ 'Drive time (min)': b.minutes, 'Leaving': DEPARTS.find(x => x[0] === last.depart)?.[1] || last.depart, 'Area (sq mi)': b.sqmi, People: b.people ?? '', Households: b.households ?? '', Jobs: b.jobs ?? '',
      'Median household income (approx)': b.income ?? '', 'Census tracts': b.tracts, 'Filings on the map': b.filings, Routing: last.d.source })));
  }
  async function exportReport() {
    if (!last) return; const { d, bands, label, depart, center } = last;
    const big = bands[bands.length - 1], when = depart === 'now' ? (d.traffic ? 'Leaving now, live traffic' : 'No traffic') : DEPARTS.find(x => x[0] === depart)?.[1] + (d.traffic ? ', typical traffic' : '');
    const body = kgridDoc(big) +
      '<div class="map">' + areaSvg(bands.slice().reverse().map(b => ({ geometry: b.geometry, stroke: BAND_COL[bands.indexOf(b)] || BAND_COL[3], fill: 'rgba(0,0,0,0)', width: 2.2 })), { points: [{ c: center, r: 6, color: '#23282a', label: 'Start' }] }) + '</div>' +
      '<div class="lg">' + bands.map((b, i) => '<span><i style="background:' + (BAND_COL[i] || BAND_COL[3]) + '"></i>' + b.minutes + ' min</span>').join('') + '</div>' +
      '<h2>By drive time</h2>' + table(['Drive time', { t: 'Sq mi', r: 1 }, { t: 'People', r: 1 }, { t: 'Households', r: 1 }, { t: 'Median income', r: 1 }, { t: 'Jobs', r: 1 }, { t: 'Filings', r: 1 }],
        bands.map(b => [b.minutes + ' min', fmt(b.sqmi), fmt(b.people), fmt(b.households), b.income ? '$' + fmt(b.income) : '—', fmt(b.jobs), fmt(b.filings)])) +
      '<p class="meta">Each band includes the ones inside it. People, households, income and jobs sum the census tracts whose center is inside the band. Filings are those on the map when the report was made' + (ctx.filterText?.() ? ' (filters: ' + esc(ctx.filterText()) + ')' : '') + '.</p>';
    await savePdf(ctx, 'drivetime', label, reportDoc({ kicker: 'Drive-time report', title: label, meta: esc(when), body,
      sources: esc(d.source) + ' routing; US Census ACS 5-year and LEHD LODES (people, households, jobs); TDLR TABS (filings). Drive times are estimates for a car and vary with traffic, signals and construction.' }));
  }
  const kgridDoc = big => '<div class="kp">' + [[fmt(big.sqmi), 'Sq mi within ' + big.minutes + ' min'], [fmt(big.people), 'People'], [fmt(big.jobs), 'Jobs'], [fmt(big.filings), 'Filings']].map(([v, l]) => '<div><b>' + v + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>';

  ctx.driveTime = show;
  ctx.driveTimeData = async ({ center, minutes = [10, 20, 30], depart = 'now' }) => { const d = await fetchBands(center, minutes, depart); return { d, bands: await enrich(d) }; };
  ctx.onCardClose?.(() => { /* the bands stay until cleared: they're useful while browsing the area */ });

  // area reports: a drive-time map from the middle of the chosen area
  ctx.addAreaReport?.({ key: 'drivetime', label: 'Drive-Time Map', desc: 'How far you can drive in 10, 20 and 30 minutes (or other times) from a point, now or at rush hour, with the people, households, jobs and filings inside each band. Export as a PDF report or CSV.',
    note: 'From the middle of the selected area or the map view', run: ({ geometry, label, center }) => show({ center: center || centerOf(geometry), label: label.replace(/^[\d.]+ mi around /, '') }) });
}
