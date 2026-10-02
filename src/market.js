// Demographics layer: census-tract choropleth from data/market.json (lazy-loaded), with legend and hover stats.
const SEQ = { light: ['#e2f1e8', '#c2e3d0', '#8acda3', '#4caf70', '#0a7a36'], dark: ['#1d3326', '#1f5236', '#2d7a4a', '#4caf70', '#8acda3'] };
const DIV = { light: ['#c03b3a', '#ef9c9b', '#e6e5e1', '#9ec5f4', '#3987e5', '#1c5cab'], dark: ['#e66767', '#8a3b3b', '#383835', '#1c5cab', '#3987e5', '#9ec5f4'] };
const GROWTH = [-5, -1, 1, 5, 15]; // % breaks: <-5 | -5..-1 | ±1 | 1..5 | 5..15 | >15
const JGROWTH = [-10, -2, 2, 15, 40]; // job growth swings more than population
const DIVERGING = new Set(['gr', 'jgr']), JOBS = new Set(['jobs', 'jgr', 'jpr']), SPEND = new Set(['spend', 'sph', 'dine', 'furn', 'appa']);

export function initMarket(ctx) {
  const { map, fmtN, esc } = ctx, sel = document.getElementById('lyDemo'), legend = document.getElementById('dLegend');
  let market = null, metric = '', breaks = [];
  ctx.marketInfo = () => market ? { year: market.year, baseYear: market.baseYear, tracts: market.tracts.length, spendYear: market.spendYear || null } : null;
  // the tract data for the assistant (demographics questions), loaded on first use
  ctx.loadMarket = async () => { if (!market) { const r = await fetch('data/market.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('Demographic data isn’t available yet.'); market = await r.json(); } return market; };
  ctx.showDemographic = m => { sel.value = m; setMetric(m); };
  const money = v => v == null ? '—' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : v);
  const FMT = { gr: v => v == null ? '—' : (v > 0 ? '+' : '') + v + '%', pop: v => v == null ? '—' : fmtN(v), inc: money, val: money, rent: v => v == null ? '—' : '$' + fmtN(v), vacr: v => v == null ? '—' : v + '%', jobs: v => v == null ? '—' : fmtN(v), jgr: v => v == null ? '—' : (v > 0 ? '+' : '') + v + '%', jpr: v => v == null ? '—' : v.toFixed(2) };
  Object.assign(FMT, { spend: money, sph: money, dine: money, furn: money, appa: money });
  const NAME = { spend: 'Consumer spending a year (est.)', sph: 'Spending per household (est.)', dine: 'Dining out a year (est.)', furn: 'Home furnishings a year (est.)', appa: 'Apparel & services a year (est.)', gr: 'Population growth', pop: 'Population', inc: 'Median household income', val: 'Median home value', rent: 'Median gross rent', vacr: 'Housing vacancy rate', jobs: 'Jobs located here', jgr: 'Job growth', jpr: 'Jobs per resident' };
  const SECT = ['Agriculture', 'Mining, oil & gas', 'Utilities', 'Construction', 'Manufacturing', 'Wholesale', 'Retail', 'Transportation & warehousing', 'Information', 'Finance & insurance', 'Real estate', 'Professional services', 'Corporate offices', 'Admin & support services', 'Education', 'Health care', 'Arts & recreation', 'Hotels & restaurants', 'Other services', 'Public administration'];

  function quantiles(vals, n) { const s = vals.filter(v => v != null).sort((a, b) => a - b); return Array.from({ length: n - 1 }, (_, i) => s[Math.floor((i + 1) / n * s.length)]); }
  function colorExpr() {
    const dark = ctx.isDark(), pal = DIVERGING.has(metric) ? DIV[dark ? 'dark' : 'light'] : SEQ[dark ? 'dark' : 'light'];
    const e = ['step', ['get', metric], pal[0]]; breaks.forEach((b, i) => e.push(b, pal[i + 1]));
    return ['case', ['==', ['get', metric], null], 'rgba(0,0,0,0)', e];
  }
  function addLayer() {
    if (!market || !metric || !map.getStyle()) return;
    if (!map.getSource('tracts')) map.addSource('tracts', { type: 'geojson', data: { type: 'FeatureCollection', features: market.tracts.map(t => ({ type: 'Feature', properties: { g: t.g, gr: t.gr, pop: t.pop, inc: t.inc, val: t.val, rent: t.rent, vacr: t.vacr, age: t.age, jobs: t.jobs ?? null, jgr: t.jgr ?? null, jpr: t.jpr ?? null, spend: t.spend ?? null, sph: t.sph ?? null, dine: t.dine ?? null, furn: t.furn ?? null, appa: t.appa ?? null, jtop: (t.jtop || []).map(i => SECT[i]).join(', ') }, geometry: t.geom })) } });
    const before = map.getLayer('county-line') ? 'county-line' : undefined;
    if (!map.getLayer('tract-fill')) map.addLayer({ id: 'tract-fill', type: 'fill', source: 'tracts', paint: { 'fill-opacity': ctx.isDark() ? .55 : .62 } }, before);
    if (!map.getLayer('tract-line')) map.addLayer({ id: 'tract-line', type: 'line', source: 'tracts', paint: { 'line-color': ctx.isDark() ? 'rgba(255,255,255,.12)' : 'rgba(22,25,26,.12)', 'line-width': .5 } }, before);
    map.setPaintProperty('tract-fill', 'fill-color', colorExpr());
  }
  function removeLayer() { ['tract-fill', 'tract-line'].forEach(id => map.getLayer(id) && map.removeLayer(id)); }
  function renderLegend() {
    if (!metric) { legend.classList.remove('on'); return; }
    const dark = ctx.isDark(), pal = DIVERGING.has(metric) ? DIV[dark ? 'dark' : 'light'] : SEQ[dark ? 'dark' : 'light'], f = FMT[metric];
    const labels = pal.map((c, i) => i === 0 ? '< ' + f(breaks[0]) : i === pal.length - 1 ? '≥ ' + f(breaks[i - 1]) : f(breaks[i - 1]) + ' – ' + f(breaks[i]));
    const yr = SPEND.has(metric) ? ', BLS CE ' + market.spendYear + ' × ACS ' + market.year : JOBS.has(metric) ? (metric === 'jgr' ? ', ' + market.jobsBaseYear + '→' + market.jobsYear : ', ' + market.jobsYear) : metric === 'gr' ? ', ACS ' + market.baseYear + '→' + market.year : ', ACS ' + market.year;
    legend.innerHTML = '<div class="t">' + esc(NAME[metric]) + yr + '</div>' +
      pal.map((c, i) => '<div class="li"><i style="background:' + c + '"></i>' + esc(labels[i]) + '</div>').join('') + '<div class="src">' + (SPEND.has(metric) ? 'Estimate: households by income (Census ACS) × spending by income (BLS Consumer Expenditure Survey), South region. Not measured per tract.' : JOBS.has(metric) ? 'US Census LEHD LODES (jobs by work location)' + (metric === 'jpr' ? ' ÷ ACS population' : '') + ', by tract' : 'US Census ACS 5-year, by tract') + '</div>';
    legend.classList.add('on');
  }
  async function setMetric(m) {
    metric = m;
    if (!m) { removeLayer(); renderLegend(); return; }
    if (!market) {
      try { const r = await fetch('data/market.json', { cache: 'no-cache' }); if (!r.ok) throw 0; market = await r.json(); }
      catch (e) { ctx.toast('Demographic data isn’t available yet. It’s added by the nightly data refresh.'); sel.value = ''; metric = ''; return; }
    }
    if (SPEND.has(m) && !market.spendYear) { ctx.toast('Spending estimates aren’t available yet. They’re added by the nightly data refresh.'); sel.value = ''; metric = ''; removeLayer(); renderLegend(); return; }
    if (JOBS.has(m) && !market.jobsYear) { ctx.toast('Jobs data isn’t available yet. It’s added by the nightly data refresh.'); sel.value = ''; metric = ''; removeLayer(); renderLegend(); return; }
    breaks = m === 'gr' ? GROWTH : m === 'jgr' ? JGROWTH : quantiles(market.tracts.map(t => t[m]), 5);
    addLayer(); renderLegend();
  }
  sel.onchange = () => setMetric(sel.value);
  ctx.onOverlays(() => { if (metric) addLayer(); });
  new MutationObserver(() => { if (metric && map.getLayer('tract-fill')) { map.setPaintProperty('tract-fill', 'fill-color', colorExpr()); renderLegend(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // hover stats (filings take priority: their own tooltip handler runs on top)
  map.on('mousemove', 'tract-fill', e => {
    if (!metric || map.queryRenderedFeatures(e.point, { layers: ['filings'] }).length) return;
    const p = e.features[0].properties, tip = ctx.tip;
    tip.innerHTML = '<b>Census tract ' + esc(String(p.g).slice(5)) + '</b><span>' + ['gr', 'pop', 'inc', 'val', 'rent', 'vacr'].concat(market.jobsYear ? ['jobs', 'jgr', 'jpr'] : []).concat(market.spendYear ? ['sph', 'dine'] : []).map(k => esc(NAME[k]) + ': ' + FMT[k](p[k] === 'null' || p[k] == null ? null : +p[k])).join('<br>') + (p.jtop ? '<br>Top industries: ' + esc(p.jtop) : '') + '</span>';
    let x = e.point.x + 14; tip.style.opacity = 1; const w = tip.offsetWidth; if (x + w > ctx.viewport.clientWidth - 8) x = e.point.x - w - 14;
    tip.style.left = x + 'px'; tip.style.top = (e.point.y + 14) + 'px';
  });
  map.on('mouseleave', 'tract-fill', () => { ctx.tip.style.opacity = 0; });
}
