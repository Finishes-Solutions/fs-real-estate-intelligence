// Demographics layer: census-tract choropleth from data/market.json (lazy-loaded), with legend and hover stats.
const SEQ = { light: ['#e2f1e8', '#c2e3d0', '#8acda3', '#4caf70', '#0a7a36'], dark: ['#1d3326', '#1f5236', '#2d7a4a', '#4caf70', '#8acda3'] };
const DIV = { light: ['#c03b3a', '#ef9c9b', '#e6e5e1', '#9ec5f4', '#3987e5', '#1c5cab'], dark: ['#e66767', '#8a3b3b', '#383835', '#1c5cab', '#3987e5', '#9ec5f4'] };
const GROWTH = [-5, -1, 1, 5, 15]; // % breaks: <-5 | -5..-1 | ±1 | 1..5 | 5..15 | >15

export function initMarket(ctx) {
  const { map, fmtN, esc } = ctx, sel = document.getElementById('lyDemo'), legend = document.getElementById('dLegend');
  let market = null, metric = '', breaks = [];
  const money = v => v == null ? '—' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : v);
  const FMT = { gr: v => v == null ? '—' : (v > 0 ? '+' : '') + v + '%', pop: v => v == null ? '—' : fmtN(v), inc: money, val: money, rent: v => v == null ? '—' : '$' + fmtN(v), vacr: v => v == null ? '—' : v + '%' };
  const NAME = { gr: 'Population growth', pop: 'Population', inc: 'Median household income', val: 'Median home value', rent: 'Median gross rent', vacr: 'Housing vacancy rate' };

  function quantiles(vals, n) { const s = vals.filter(v => v != null).sort((a, b) => a - b); return Array.from({ length: n - 1 }, (_, i) => s[Math.floor((i + 1) / n * s.length)]); }
  function colorExpr() {
    const dark = ctx.isDark(), pal = metric === 'gr' ? DIV[dark ? 'dark' : 'light'] : SEQ[dark ? 'dark' : 'light'];
    const e = ['step', ['get', metric], pal[0]]; breaks.forEach((b, i) => e.push(b, pal[i + 1]));
    return ['case', ['==', ['get', metric], null], 'rgba(0,0,0,0)', e];
  }
  function addLayer() {
    if (!market || !metric || !map.getStyle()) return;
    if (!map.getSource('tracts')) map.addSource('tracts', { type: 'geojson', data: { type: 'FeatureCollection', features: market.tracts.map(t => ({ type: 'Feature', properties: { g: t.g, gr: t.gr, pop: t.pop, inc: t.inc, val: t.val, rent: t.rent, vacr: t.vacr, age: t.age }, geometry: t.geom })) } });
    const before = map.getLayer('county-line') ? 'county-line' : undefined;
    if (!map.getLayer('tract-fill')) map.addLayer({ id: 'tract-fill', type: 'fill', source: 'tracts', paint: { 'fill-opacity': ctx.isDark() ? .55 : .62 } }, before);
    if (!map.getLayer('tract-line')) map.addLayer({ id: 'tract-line', type: 'line', source: 'tracts', paint: { 'line-color': ctx.isDark() ? 'rgba(255,255,255,.12)' : 'rgba(22,25,26,.12)', 'line-width': .5 } }, before);
    map.setPaintProperty('tract-fill', 'fill-color', colorExpr());
  }
  function removeLayer() { ['tract-fill', 'tract-line'].forEach(id => map.getLayer(id) && map.removeLayer(id)); }
  function renderLegend() {
    if (!metric) { legend.classList.remove('on'); return; }
    const dark = ctx.isDark(), pal = metric === 'gr' ? DIV[dark ? 'dark' : 'light'] : SEQ[dark ? 'dark' : 'light'], f = FMT[metric];
    const labels = pal.map((c, i) => i === 0 ? '< ' + f(breaks[0]) : i === pal.length - 1 ? '≥ ' + f(breaks[i - 1]) : f(breaks[i - 1]) + ' – ' + f(breaks[i]));
    legend.innerHTML = '<div class="t">' + esc(NAME[metric]) + (metric === 'gr' ? ', ACS ' + market.baseYear + '→' + market.year : ', ACS ' + market.year) + '</div>' +
      pal.map((c, i) => '<div class="li"><i style="background:' + c + '"></i>' + esc(labels[i]) + '</div>').join('') + '<div class="src">US Census ACS 5-year, by tract</div>';
    legend.classList.add('on');
  }
  async function setMetric(m) {
    metric = m;
    if (!m) { removeLayer(); renderLegend(); return; }
    if (!market) {
      try { const r = await fetch('data/market.json', { cache: 'no-cache' }); if (!r.ok) throw 0; market = await r.json(); }
      catch (e) { ctx.toast('Demographic data isn’t available yet. It’s added by the nightly data refresh.'); sel.value = ''; metric = ''; return; }
    }
    breaks = m === 'gr' ? GROWTH : quantiles(market.tracts.map(t => t[m]), 5);
    addLayer(); renderLegend();
  }
  sel.onchange = () => setMetric(sel.value);
  ctx.onOverlays(() => { if (metric) addLayer(); });
  new MutationObserver(() => { if (metric && map.getLayer('tract-fill')) { map.setPaintProperty('tract-fill', 'fill-color', colorExpr()); renderLegend(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // hover stats (filings take priority: their own tooltip handler runs on top)
  map.on('mousemove', 'tract-fill', e => {
    if (!metric || map.queryRenderedFeatures(e.point, { layers: ['filings'] }).length) return;
    const p = e.features[0].properties, tip = ctx.tip;
    tip.innerHTML = '<b>Census tract ' + esc(String(p.g).slice(5)) + '</b><span>' + ['gr', 'pop', 'inc', 'val', 'rent', 'vacr'].map(k => esc(NAME[k]) + ': ' + FMT[k](p[k] === 'null' ? null : p[k])).join('<br>') + '</span>';
    let x = e.point.x + 14; tip.style.opacity = 1; const w = tip.offsetWidth; if (x + w > ctx.viewport.clientWidth - 8) x = e.point.x - w - 14;
    tip.style.left = x + 'px'; tip.style.top = (e.point.y + 14) + 'px';
  });
  map.on('mouseleave', 'tract-fill', () => { ctx.tip.style.opacity = 0; });
}
