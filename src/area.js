// Market view: growth signals per county from data/area.json (built nightly by build/area.mjs) and data/market.json.
//   population (ACS), jobs and industries (LEHD LODES), housing units permitted (Census BPS),
//   new business locations (Texas Comptroller sales-tax permits) and local development news (Google News),
//   Houston crime (Houston Police, api/crime?city=1) and the busiest roads (TxDOT counts, api/traffic).
// Charts are interactive: hover (or focus) for the numbers, click a bar to pin its breakdown under the chart, toggle
// series from the legend, and switch monthly charts between 12 months, 24 months and everything. "Export Report"
// saves a PDF report and "Export Data" a CSV of every series; both are listed on the Reports tab.
// Also the "Businesses registered here" lookup (api/tenants) used by the building and filing cards.
// Rendering (2026-10-15): renders are coalesced to one per frame. Opening the tab, the area, the range and resizing draw
// the whole tab; everything else (data arriving, a pin, a legend, the news place, the Markets controls) redraws only its
// own section, keeping open details, focus and scroll. Every number behind the sections is cached per selection and data,
// charts are drawn at their box's measured width (one CSS pixel per unit), and events are delegated once on the tab.
import { SECTORS } from './lib/sectors.mjs';
import { CAT_LABEL } from './lib/spending.mjs';
import { reportDoc, savePdf, areaMap } from './reportkit.js';
import { mkCharts, col, mlabel } from './mkcharts.js';
import { morph, instant, finish } from './motion.js';
import { pipeline, housing, cityCounties, rents, monthly, movers, addMonths } from './lib/marketcalc.mjs';
import { fromObject } from './lib/correlate.mjs';
import { inGeom, centroid } from './lib/demographics.mjs';
import { readJSON } from './lib/http.mjs';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function initArea(ctx) {
  const { esc, fmtN, fmtM } = ctx, root = document.getElementById('view-market');
  // sel: 'all' (the whole region), one county FIPS, or several joined by commas (a multi-county selection on the map)
  let area = null, market = null, loadP = null, sel = 'all', newsPlace = '', adopted = null, ver = 0; // ver: bumps when area/market load
  let range = 24, pin = null; const show = { sf: true, mf: true, v: true, p: true, o: true };
  // crime (City of Houston, the same for the region and the three counties it spans) and traffic (per area), fetched once
  const HOU = new Set(['48201', '48157', '48339']), traffic = new Map(); let crimeCity;
  const wantCrime = () => sel === 'all' || fipsList().some(f => HOU.has(f));
  function areaBox() {
    const names = new Set(fipsList().map(cname)), geos = (ctx.countyGeo || []).filter(c => names.has(c.name)); if (!geos.length) return null;
    let w = 180, so = 90, e = -180, n = -90; for (const g of geos) for (const poly of g.geom.coordinates) for (const ring of poly) for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); }
    return [w, so, e, n].map(v => +v.toFixed(3));
  }
  function loadExtras() {
    const k = sel;
    // each arrival redraws only the section it shows in (crime also feeds the Correlation explorer's Houston measures)
    if (wantCrime() && crimeCity === undefined) { crimeCity = null; fetch('api/crime?city=1').then(async r => { crimeCity = await readJSON(r); }).catch(e => { crimeCity = { error: e.message }; }).then(() => { section('area'); section('markets'); }); }
    if (!traffic.has(k)) { const b = areaBox(); if (!b) return; traffic.set(k, null);
      fetch('api/traffic?bbox=' + b.join(',')).then(async r => { traffic.set(k, await readJSON(r)); }).catch(e => traffic.set(k, { error: e.message })).then(() => { if (sel === k) section('area'); }); }
  }
  // market.json is the one the map and cards use (ctx.loadMarket), and markets.json comes with the rest so the first draw
  // has the Markets numbers rather than drawing the tab a second time when they land
  const load = () => loadP ||= Promise.all([
    fetch('data/area.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
    (ctx.loadMarket ? ctx.loadMarket() : fetch('data/market.json').then(r => r.ok ? r.json() : null)).catch(() => null),
    ctx.markets?.load?.()
  ]).then(([a, m]) => { area = a; market = m; ver++; });
  ctx.areaData = () => load().then(() => area);
  ctx.areaInfo = () => area ? { built: area.built, jobs: area.jobs, permits: !!area.permits, businesses: !!area.businesses, news: !!area.news, salesTax: area.salesTax ? { cities: Object.keys(area.salesTax.cities || {}).length, since: area.salesTax.since } : null,
    unemployment: area.unemployment?.state?.period || null, rates: area.rates?.series?.t10?.date || null, rents: area.rents?.latest || null, mortgages: area.mortgages?.year || null } : null;
  // the Market view's numbers for one county (name or FIPS) or the whole region, for the assistant (market_data)
  ctx.marketData = async county => {
    await load(); if (!area) return { error: 'The market data (jobs, permits, new businesses, news) hasn’t been built yet. It fills in after the nightly data refresh.' };
    const c = county && area.counties.find(x => x.fips === county || x.name.toLowerCase() === String(county).toLowerCase().replace(/\s*county.*$/, ''));
    if (county && !c) return { error: 'No market data for “' + county + '”. Counties covered: ' + area.counties.map(x => x.name).join(', ') + '.' };
    const keepSel = sel, keepPlace = newsPlace; sel = c ? c.fips : 'all'; newsPlace = '';
    try { return { area: c ? c.name + ' County' : 'all ' + area.counties.length + ' counties', built: area.built, ...stats(), ...(ctx.marketExtras?.() || {}) }; } finally { sel = keepSel; newsPlace = keepPlace; }
  };

  const pct = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)) + '%';
  const chg = (a, b) => a != null && b ? (a - b) / b * 100 : null;
  const fipsList = () => sel === 'all' ? area.counties.map(c => c.fips) : sel.split(',');
  const one = () => sel !== 'all' && !sel.includes(',') ? sel : null; // the county when exactly one is shown
  // the map's selection, as Market counties: a county selection's counties, or the county under any other area's middle
  function mapCounties() {
    const s = ctx.sel; if (!s?.feature || !area) return 'all';
    if (s.kind === 'county' && s.counties?.size) { const l = area.counties.filter(c => s.counties.has(c.name)).map(c => c.fips); return l.length ? l.join(',') : 'all'; }
    const g = s.feature.geometry || s.feature, c = s.center || centroid(g), hit = c && (ctx.countyGeo || []).find(x => inGeom(c, x.geom));
    return area.counties.find(x => x.name === hit?.name)?.fips || 'all';
  }
  // follow the map selection when it changes (a county picked here by hand stays until the map selection changes)
  function adopt() { const k = mapCounties(); if (k === adopted) return; adopted = k; sel = k; newsPlace = ''; pin = null; }
  const cname = f => area.counties.find(c => c.fips === f)?.name || f;
  const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);

  // ---------- numbers for the selected county (or the whole region) ----------
  // cached per data, selection and news place: every draw (and the assistant) asks for them
  let statsK = '', statsV = null;
  const stats = () => { const k = ver + '|' + sel + '|' + newsPlace; if (k !== statsK) { statsV = computeStats(); statsK = k; } return statsV; };
  function computeStats() {
    const F = fipsList(), out = {};
    const tr = (market?.tracts || []).filter(t => F.some(f => String(t.g).startsWith(f)));
    if (tr.length) {
      const pop = sum(tr, t => t.pop), base = tr.every(t => t.gr != null || !t.pop) ? sum(tr, t => t.pop && t.gr != null ? t.pop / (1 + t.gr / 100) : 0) : null;
      out.pop = { n: pop, gr: base ? chg(pop, base) : null, year: market.year, baseYear: market.baseYear };
    }
    const cj = F.map(f => area.countyJobs?.[f]).filter(Boolean);
    if (cj.length) {
      const n = sum(cj, c => c.jobs), base = cj.every(c => c.gr != null) ? sum(cj, c => c.jobs / (1 + c.gr / 100)) : null, sec = new Array(20).fill(0);
      cj.forEach(c => c.sec.forEach((v, i) => sec[i] += v));
      out.jobs = { n, gr: base ? chg(n, base) : null, sec, year: area.jobs?.year, baseYear: area.jobs?.baseYear };
    }
    const P = area.permits;
    if (P?.years) {
      const years = Object.keys(P.years).map(Number).sort();
      out.permits = years.map(y => ({ y, sf: sum(F, f => P.years[y]?.[f]?.sf), mf: sum(F, f => P.years[y]?.[f]?.mf), mf5: sum(F, f => P.years[y]?.[f]?.mf5), value: sum(F, f => P.years[y]?.[f]?.value), has: F.some(f => P.years[y]?.[f]) })).filter(r => r.has);
      if (P.ytd) out.ytd = { year: P.ytd.year, month: P.ytd.month, n: sum(F, f => (P.ytd.cur?.[f]?.sf || 0) + (P.ytd.cur?.[f]?.mf || 0)), prior: P.ytd.prior ? sum(F, f => (P.ytd.prior[f]?.sf || 0) + (P.ytd.prior[f]?.mf || 0)) : null, value: sum(F, f => P.ytd.cur?.[f]?.value) };
    }
    const B = area.businesses;
    if (B?.months) {
      const ms = [...new Set(F.flatMap(f => Object.keys(B.months[f] || {})))].sort();
      out.biz = ms.map(m => ({ m, n: sum(F, f => B.months[f]?.[m]) }));
      out.latest = F.flatMap(f => (B.latest?.[f] || []).map(x => ({ ...x, county: cname(f) }))).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
    }
    // modeled consumer spending (ACS income × BLS CE) summed over the tracts
    const st = tr.filter(t => t.spend != null);
    if (st.length && market.spendYear) {
      const cats = {}; st.forEach(t => Object.entries(t.sp || {}).forEach(([k, v]) => cats[k] = (cats[k] || 0) + (v || 0)));
      const hh = sum(st, t => t.hh);
      out.spend = { total: sum(st, t => t.spend), perHH: hh ? Math.round(sum(st, t => t.spend) / hh) : null, cats, year: market.spendYear, acs: market.year };
    }
    // city sales-tax allocations (Comptroller): monthly total for the area, and each city's last 12 months vs the 12 before
    const ST = area.salesTax;
    if (ST?.cities) {
      const names = new Set(F.map(cname)), key = n => String(n).toLowerCase().replace(/[^a-z]/g, ''), real = new Set((ctx.DATA?.places || []).map(p => key(p[0])));
      // only places in the region (data built before 2026-10-03 can hold a filer's out-of-town mailing city, e.g. San Antonio)
      const cities = Object.entries(ST.cities).filter(([n, c]) => names.has(c.county) && (!real.size || real.has(key(n))));
      const ms = [...new Set(cities.flatMap(([, c]) => Object.keys(c.months)))].sort();
      out.tax = ms.map(m => ({ m, n: sum(cities, ([, c]) => c.months[m]) }));
      const lastM = ms[ms.length - 1], yr = (c, back) => { const keys = Object.keys(c.months).sort().filter(k => k <= lastM); const end = keys.length - back * 12; return keys.length >= end && end > 0 ? keys.slice(Math.max(0, end - 12), end).reduce((a, k) => a + c.months[k], 0) : null; };
      out.taxCities = cities.map(([n, c]) => ({ city: n, county: c.county, last12: yr(c, 0), prior12: yr(c, 1) })).sort((a, b) => (b.last12 || 0) - (a.last12 || 0));
    }
    if (area.news) {
      const names = new Set(F.map(cname)), places = (area.newsPlaces || []).filter(p => sel === 'all' || names.has(p.county)), seen = new Set();
      out.places = places;
      out.news = places.filter(p => !newsPlace || p.key === newsPlace).flatMap(p => (area.news[p.key] || []).map(a => ({ ...a, place: p.label })))
        .filter(a => { const k = a.url; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 40);
    }
    return out;
  }

  // ---------- the Market tab (redesigned 2026-10-05) ----------
  // Overview (headline tiles + "What's moving"), then Construction pipeline, Growth & demand, Housing & rents, Costs & rates,
  // Markets (and the Correlation explorer), Area & news. A sticky row of section buttons jumps between them. Every chart
  // reads out on hover (the .mk-hit / data-tip model in src/mkcharts.js); bars with a breakdown pin it on click.
  const C = mkCharts({ esc, fmtN });
  const ranged = rows => range ? rows.slice(-range) : rows;
  const money = v => v == null || !Number.isFinite(v) ? '—' : fmtM(v);
  const monthLabel = m => mlabel(m);
  const lastYear = (rows, i) => { const m = rows[i].m, want = (+m.slice(0, 4) - 1) + m.slice(4); return rows.find(r => r.m === want); };
  const title = t => /[a-z]/.test(t) ? t : String(t).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Us|Sh|Fm|Ih)\b/g, x => x.toUpperCase());
  const upDown = (v, d = 0) => (v >= 0 ? 'up ' : 'down ') + Math.abs(v).toFixed(Math.abs(v) < 10 ? Math.max(d, 1) : d) + '%';
  const CR = { v: 6, p: 2, o: 4 }; // crime colours: palette indexes (red, amber, grey)
  const legBtn = (k, label, c) => '<button type="button" class="mk-lb" data-show="' + k + '" aria-pressed="' + show[k] + '"><i style="background:' + col(c) + '"></i>' + esc(label) + '</button>';
  const legend = items => '<div class="mk-leg">' + items.map(([label, c, dash]) => '<span><i style="background:' + col(c) + (dash ? ';opacity:.4' : '') + '"></i>' + esc(label) + '</span>').join('') + '</div>';
  const box = (t, html, cls = '') => '<section class="mk-box' + (cls ? ' ' + cls : '') + '"><h3>' + t + '</h3>' + html + '</section>';
  // a section: its id (mk-<id>) is what a partial redraw replaces
  const sec = (id, h2, p, body) => '<section class="mk-sec" id="mk-' + id + '"><div class="mk-sh"><h2>' + h2 + '</h2><p>' + p + '</p></div>' + body + '</section>';
  const note = (t, src) => '<div class="rnote">' + t + (src ? '<span class="src"> ' + src + '</span>' : '') + '</div>';
  // a loading placeholder: a muted block (no fake bars or numbers) so it can't be read as data
  const skel = (h = 120) => '<div class="mk-skel" aria-hidden="true" style="height:' + h + 'px"></div>';
  // chart widths, measured from the page (measure()): half box, full-width box, a small multiple and how many share a row,
  // the Correlation explorer's chart column, the Markets sparklines
  let Wd = { full: 1100, half: 520, wide: 1060, smPad: 26, smGap: 12, smc: 3, main: 560, spark: 110 };
  // growable charts of the section being built: after it's on the page, fit() makes the shorter of two side-by-side boxes'
  // chart taller (or its list longer) so the pair ends level instead of leaving a gap under one of them
  // (cap: how many px it can use; a list can only add the rows it has)
  let growing = null; const grows = new Map();
  const grow = (ck, make, cap = Infinity) => { growing?.push({ ck, make, cap }); return make(0); };
  const rowsCap = (have, shown) => Math.max(0, (have - shown) * ROW);
  // n tiles in full rows of near-equal size, at most maxC a row: the grid's column count (L) and each tile's span
  function rowsOf(n, maxC) {
    const nr = Math.ceil(n / Math.max(1, maxC)) || 1, base = Math.floor(n / nr), xtra = n % nr, L = xtra ? base * (base + 1) : Math.max(1, base), spans = [];
    for (let r = 0; r < nr; r++) { const k = base + (r < xtra ? 1 : 0); for (let i = 0; i < k; i++) spans.push(L / k); }
    return { L, spans };
  }
  const ROW = 28; // a horizontal-bar row: 26 px and a 2 px gap (app.css .mk-hb)

  // ----- data for the sections -----
  const names = () => sel === 'all' ? null : new Set(fipsList().map(cname));
  let pipeKey = '', pipeVal = null;
  const pipe = () => { const k = sel + '|' + (ctx.F?.length || 0); if (k !== pipeKey) { pipeKey = k; pipeVal = pipeline(ctx.F || [], { counties: names(), since: ctx.DATA?.period?.start }); } return pipeVal; };
  let ccMap = null, rentK = '', rentV = null, housK = '', housV = null;
  const rentInfo = () => { if (!area?.rents?.zips) return null; const k = ver + '|' + sel; if (k === rentK) return rentV;
    // the county of each town a ZIP names (only those: testing every place against the county outlines took 100 ms)
    if (!ccMap) { const towns = new Set(Object.values(area.rents.zips).map(z => z.city)); ccMap = cityCounties((ctx.DATA?.places || []).filter(p => towns.has(p[0])), ctx.countyGeo || []); }
    rentK = k; return rentV = rents(area.rents.zips, { counties: names(), cityCounty: ccMap }); };
  const tractsIn = () => (market?.tracts || []).filter(t => fipsList().some(f => String(t.g).startsWith(f)));
  const housingNow = () => { const k = ver + '|' + sel; if (k !== housK) { housK = k; housV = housing(tractsIn()); } return housV; };
  // one market series as monthly points, once per markets.json
  let mkData, mkMemo = new Map();
  const mk = id => { const d = ctx.markets?.raw?.(); if (d !== mkData) { mkData = d; mkMemo = new Map(); } if (!mkMemo.has(id)) mkMemo.set(id, monthly(d?.series?.[id], 60)); return mkMemo.get(id); };
  const COSTS = [['wpusi012011', 'Building materials'], ['wpu081', 'Lumber'], ['wpu101', 'Steel'], ['pcu327320327320', 'Ready-mix concrete'], ['pcoppusdm', 'Copper']];
  const HOMES = [['medlispri26420', 'Median listing price', v => '$' + fmtN(Math.round(v))], ['actliscou26420', 'Homes for sale', v => fmtN(Math.round(v))], ['meddayonmar26420', 'Days on market', v => fmtN(Math.round(v))], ['hous448bpprivsa', 'Housing permits a month (SA)', v => fmtN(Math.round(v))]];
  function unemp() { const u = area.unemployment; if (!u) return null; const c = one() && u.counties?.[one()], m = u.metros?.['26420'], x = c || m; return x ? { ...x, where: c ? cname(one()) + ' County' : 'Houston metro', state: u.state } : null; }
  const last12 = rows => { const cur = new Date().toISOString().slice(0, 7), done = (rows || []).filter(r => r.m < cur); return { a: done.slice(-12), b: done.slice(-24, -12) }; };

  // ----- Overview -----
  function overview(s, p, rn) {
    const lastP = s.permits?.[s.permits.length - 1], prevP = s.permits?.[s.permits.length - 2], bz = last12(s.biz), ue = unemp(), bm = mk('wpusi012011');
    const bzA = sum(bz.a, r => r.n), bzB = bz.b.length === 12 ? sum(bz.b, r => r.n) : null;
    const pm = p.months.filter(r => !r.future), tot = r => r.New + r.Reno + r.Addition;
    const tiles = [
      p.active.n ? ({ label: 'Under construction', v: money(p.active.v), d: C.delta(p.change), sub: fmtN(p.active.n) + ' projects' + (p.change != null ? ' · vs a year ago' : ''), sp: C.spark(pm.map(tot), { ck: 'mk:overview:active', tips: pm.map(r => monthLabel(r.m) + ': ' + money(tot(r)) + ' under construction') }) }) : null,
      p.starting.n ? ({ label: 'Starting in 90 days', v: money(p.starting.v), sub: fmtN(p.starting.n) + ' projects · ' + money(p.upcoming.v) + ' scheduled in all' }) : null,
      lastP ? ({ label: 'Homes permitted ' + lastP.y, v: fmtN(lastP.sf + lastP.mf), d: prevP ? C.delta(chg(lastP.sf + lastP.mf, prevP.sf + prevP.mf)) : '', sub: prevP ? 'vs ' + prevP.y : '', sp: C.spark(s.permits.map(r => r.sf + r.mf), { ck: 'mk:overview:permits', tips: s.permits.map(r => r.y + ': ' + fmtN(r.sf + r.mf) + ' homes') }) }) : null,
      bz.a.length ? ({ label: 'New businesses, 12 mo', v: fmtN(bzA), d: bzB ? C.delta(chg(bzA, bzB)) : '', sub: bzB ? 'vs the 12 before' : 'still open', sp: C.spark(s.biz.map(r => r.n), { ck: 'mk:overview:biz', tips: s.biz.map(r => monthLabel(r.m) + ': ' + fmtN(r.n)) }) }) : null,
      s.jobs ? ({ label: 'Jobs located here', v: fmtN(s.jobs.n), d: C.delta(s.jobs.gr), sub: s.jobs.gr != null ? 'since ' + s.jobs.baseYear : 'LODES ' + s.jobs.year }) : null,
      s.pop ? ({ label: 'Population', v: fmtN(s.pop.n), d: C.delta(s.pop.gr), sub: 'since ' + s.pop.baseYear }) : null,
      rn ? ({ label: 'Typical rent', v: '$' + fmtN(Math.round(rn.typical)) + '<small>/mo</small>', d: C.delta(rn.yoy), sub: 'ZIP median · a year earlier' }) : null,
      ue ? ({ label: 'Unemployment', v: ue.rate + '%', d: ue.yearAgo != null ? C.delta(ue.rate - ue.yearAgo, { unit: ' pts', invert: true }) : null, sub: ue.where + ', ' + MON[+ue.period.slice(5) - 1] }) : null,
      bm ? ({ label: 'Building materials prices', v: bm.last.v.toFixed(0) + '<small> index</small>', d: C.delta(bm.yoy, { invert: true }), sub: 'in a year (PPI)', sp: C.spark(bm.pts.slice(-24).map(x => x.v), { c: 2, ck: 'mk:overview:materials', tips: bm.pts.slice(-24).map(x => monthLabel(x.m) + ': ' + x.v.toFixed(1)) }) }) : null
    ].filter(Boolean);
    // full rows only: the tiles split into rows of near-equal size (5 and 4 for nine on a desktop), each row's tiles
    // spanning a grid wide enough for both sizes, so no tile is left alone on a last row
    const { L, spans } = rowsOf(tiles.length, Math.max(2, Math.min(6, Math.floor((Wd.full + 10) / (210 + 10)))));
    const tileHtml = tiles.map((t, i) => C.kpi({ ...t, span: spans[i] })).join('');
    // what's moving: the biggest changes, in words
    const c = [];
    if (lastP && prevP) { c.push({ score: chg(lastP.sf + lastP.mf, prevP.sf + prevP.mf), text: 'Homes permitted ' + upDown(chg(lastP.sf + lastP.mf, prevP.sf + prevP.mf)) + ' in ' + lastP.y + ' (' + fmtN(lastP.sf + lastP.mf) + ')' });
      if (prevP.mf > 50) c.push({ score: chg(lastP.mf, prevP.mf) * .9, text: lastP.mf ? 'Multifamily permits ' + upDown(chg(lastP.mf, prevP.mf)) + ' in ' + lastP.y + ' (' + fmtN(lastP.mf) + ' units)' : 'No multifamily permits in ' + lastP.y + ' (' + fmtN(prevP.mf) + ' units in ' + prevP.y + ')' }); }
    if (s.ytd?.prior) c.push({ score: chg(s.ytd.n, s.ytd.prior), text: s.ytd.year + ' permits so far ' + upDown(chg(s.ytd.n, s.ytd.prior)) + ' on the same months last year' });
    if (bzB) c.push({ score: chg(bzA, bzB), text: 'New business locations ' + upDown(chg(bzA, bzB)) + ' over the last 12 months' });
    const tx = s.taxCities?.filter(x => x.last12 != null && x.prior12), tA = sum(tx || [], x => x.last12), tB = sum(tx || [], x => x.prior12);
    if (tB) c.push({ score: chg(tA, tB), text: 'City sales tax ' + upDown(chg(tA, tB)) + ' on the year before (' + money(tA) + ')' });
    if (p.change != null) c.push({ score: p.change, text: 'Construction under way ' + upDown(p.change) + ' on a year ago (' + money(p.active.v) + ' now)' });
    else if (p.active.v) c.push({ score: 9, text: money(p.active.v) + ' of construction under way in ' + fmtN(p.active.n) + ' filed projects' + (p.byUse[0] ? ', most in ' + p.byUse[0].name.toLowerCase() : '') });
    if (p.starting.v) c.push({ score: 8, text: money(p.starting.v) + ' of projects scheduled to start in the next 90 days' });
    COSTS.forEach(([id, label]) => { const x = mk(id); if (x?.yoy != null) c.push({ score: x.yoy * .9, text: label + ' prices ' + upDown(x.yoy) + ' in a year' }); });
    if (rn?.yoy != null) c.push({ score: rn.yoy * 2, text: 'Typical rent ' + upDown(rn.yoy) + ' in a year ($' + fmtN(Math.round(rn.typical)) + ')' });
    if (ue?.yearAgo != null) c.push({ score: (ue.rate - ue.yearAgo) * 12, text: 'Unemployment ' + ue.rate + '% in ' + ue.where + ', ' + (ue.rate >= ue.yearAgo ? 'up ' : 'down ') + Math.abs(ue.rate - ue.yearAgo).toFixed(1) + ' points on a year ago' });
    const mo = mk('mortgage30us'); if (mo?.chg != null) c.push({ score: mo.chg * 10, text: '30-year mortgage rate ' + mo.last.v.toFixed(2) + '%, ' + (mo.chg >= 0 ? 'up ' : 'down ') + Math.abs(mo.chg).toFixed(2) + ' points in a year' });
    const mv = movers(c, 6);
    return '<section class="mk-sec" id="mk-overview"><div class="mk-kpis2" style="grid-template-columns:repeat(' + L + ',minmax(0,1fr))">' + tileHtml + '</div>' +
      (mv.length ? '<div class="mk-moving"><h3>What’s moving</h3><ul>' + mv.map(x => '<li class="' + (x.score >= 0 ? 'up' : 'dn') + '">' + esc(x.text) + '</li>').join('') + '</ul>' +
        '<button type="button" class="btn" id="mkBrief"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L8 10.7l-3.7 2.4 1.1-4.3L2 6l4.4-.3z"/></svg>Ask AI for a market brief</button></div>' : '') + '</section>';
  }

  // ----- Construction pipeline (TDLR filings) -----
  const TYPE_KEYS = [{ k: 'New', label: 'New construction', c: 0 }, { k: 'Reno', label: 'Renovation', c: 4 }, { k: 'Addition', label: 'Addition', c: 5 }];
  const fRow = f => '<tr class="mk-fr" data-fid="' + esc(f.id) + '" tabindex="0"><td><b>' + esc(f.name) + '</b><span class="sc">' + esc([f.city || f.county, f.use, ctx.TYPE_LABEL?.[f.type] || f.type].filter(Boolean).join(' · ')) + '</span></td><td class="m r">' + money(f.cost) + '</td><td class="m">' + esc(String(f.ts).slice(0, 7)) + ' → ' + esc(String(f.te).slice(0, 7)) + '</td></tr>';
  const fTable = list => '<div class="tablewrap"><table class="mk-tbl"><thead><tr><th>Project</th><th class="r">Est. value</th><th>Schedule</th></tr></thead><tbody>' + list.map(fRow).join('') + '</tbody></table></div>';
  function pipelineSec(p) {
    if (!p.active.n && !p.upcoming.n) return '';
    const now = p.months.findIndex(r => !r.future && p.months[p.months.indexOf(r) + 1]?.future);
    const nearYear = i => p.months.slice(Math.max(0, i - 2), i + 3).some(r => r.m.endsWith('-01'));
    const rows = p.months.map((r, i) => ({ id: r.m, v: r, faded: r.future, tick: r.m.endsWith('-01') ? r.m.slice(0, 4) : i === now && !nearYear(i) ? 'now' : '',
      tip: monthLabel(r.m) + ': ' + money(r.New + r.Reno + r.Addition) + ' under construction' + (r.future ? ' (scheduled)' : '') + ', ' + fmtN(r.n) + ' projects · new ' + money(r.New) + ' · renovation ' + money(r.Reno) + ' · additions ' + money(r.Addition) }));
    const multi = sel === 'all' || fipsList().length > 1, side = multi ? p.byCounty : p.byType;
    return '<section class="mk-sec" id="mk-pipeline"><div class="mk-sh"><h2>Construction pipeline</h2><p>What’s being built from the state’s construction filings (TDLR): value under construction each month, what starts soon, by use and the largest projects. Click a project to see it on the map.</p></div><div class="mk-grid">' +
      box('Under construction by month', '<div class="kgrid mk-kg4"><div><b>' + money(p.active.v) + '</b><span>Under construction · ' + fmtN(p.active.n) + ' projects</span></div><div><b>' + money(p.starting.v) + '</b><span>Starting in 90 days · ' + fmtN(p.starting.n) + '</span></div><div><b>' + money(p.upcoming.v) + '</b><span>All scheduled starts · ' + fmtN(p.upcoming.n) + '</span></div>' + (p.change != null ? '<div><b>' + pct(p.change) + '</b><span>vs a year ago</span></div>' : p.byUse[0] ? '<div><b>' + esc(p.byUse[0].name) + '</b><span>Largest use · ' + Math.round(p.byUse[0].v / (p.active.v || 1) * 100) + '% of the value</span></div>' : '') + '</div>' +
        legend(TYPE_KEYS.map(k => [k.label, k.c]).concat([['Scheduled (later months)', 0, true]])) + C.bars({ rows, keys: TYPE_KEYS, W: Wd.wide, H: 220, fmt: v => money(v), aria: 'Value under construction by month', ck: 'mk:pipeline:months' }) +
        note('Projects are counted in every month from their start to their end date as filed; later months show what’s already scheduled. Values are the filer’s estimates.' + (p.since ? ' The filing list starts in ' + esc(monthLabel(p.since)) + ', so earlier months only count projects filed since then: the climb before that is partly the list filling in.' : '') + (p.outliers.length ? ' Left out as likely mis-entered: ' + esc(p.outliers.map(o => o.name + ' (' + money(o.cost) + ')').join(', ')) + '.' : ''), 'Texas Department of Licensing and Regulation (TABS).'), 'mk-wide') +
      box('Under construction by use', grow('mk:pipeline:use', x => C.hbars(p.byUse.slice(0, 10 + Math.floor(x / ROW)).map((u, i) => ({ label: u.name, v: u.v, k: 'use:' + i, tip: u.name + ': ' + money(u.v) + ' across ' + fmtN(u.n) + ' projects. Click for the largest.' })), money, pin, 'mk:pipeline:use'), rowsCap(p.byUse.length, 10)) + pinned('use')) +
      box(multi ? 'Under construction by county' : 'Under construction by type', grow('mk:pipeline:side', x => C.hbars(side.slice(0, 8 + Math.floor(x / ROW)).map((u, i) => ({ label: multi ? u.name : (ctx.TYPE_LABEL?.[u.name] || u.name), v: u.v, c: multi ? 1 : [0, 4, 5][['New', 'Reno', 'Addition'].indexOf(u.name)] ?? 0, tip: u.name + ': ' + money(u.v) + ', ' + fmtN(u.n) + ' projects' })), money, null, 'mk:pipeline:side'), rowsCap(side.length, 8)) +
        (p.byUse[0] ? note('Largest use: ' + esc(p.byUse[0].name) + ', ' + Math.round(p.byUse[0].v / (p.active.v || 1) * 100) + '% of the value under construction.') : '')) +
      box('Largest projects under construction', fTable(p.largest)) +
      box('Starting in the next 90 days', p.starting.list.length ? fTable(p.starting.list) : note('No filed projects start in the next 90 days.')) + '</div></section>';
  }

  // ----- Growth & demand -----
  function permitsChart(rows) {
    const keys = [{ k: 'sf', label: 'Single-family', c: 0 }, { k: 'mf24', label: '2–4 units', c: 5 }, { k: 'mf5', label: '5+ units (apartments)', c: 1 }];
    return legend(keys.map(k => [k.label, k.c])) + grow('mk:growth:permits', x => C.bars({ rows: rows.map(r => ({ id: r.y, v: { sf: r.sf, mf24: Math.max(0, r.mf - (r.mf5 || 0)), mf5: r.mf5 || 0 }, tick: String(r.y),
      tip: r.y + ': ' + fmtN(r.sf + r.mf) + ' homes · single-family ' + fmtN(r.sf) + ' · 2–4 units ' + fmtN(Math.max(0, r.mf - (r.mf5 || 0))) + ' · 5+ units ' + fmtN(r.mf5 || 0) + ' · value ' + money(r.value) })), keys, W: Wd.half, pinKey: 'permits', pin, aria: 'Housing units permitted per year', ck: 'mk:growth:permits', H: 200 + x }));
  }
  function monthBars(all, { key, unit, fmt = fmtN, c = 0 }) {
    const off = Math.max(0, all.length - (range || all.length)), rows = ranged(all), cur = new Date().toISOString().slice(0, 7);
    return grow('mk:growth:' + key, x => C.bars({ rows: rows.map((r, i) => ({ id: r.m, v: { n: r.n }, faded: r.m >= cur, tick: r.m.endsWith('-01') ? r.m.slice(0, 4) : i === 0 && rows.length < 14 ? monthLabel(r.m) : '', tip: monthLabel(r.m) + ': ' + fmt(r.n) + ' ' + unit + (r.m >= cur ? ' (month in progress)' : '') })),
      keys: [{ k: 'n', c }], W: Wd.half, H: 200 + x, fmt, pinKey: key, pin, off, aria: unit + ' per month', ck: 'mk:growth:' + key }));
  }
  function growthSec(s) {
    const y = s.ytd;
    return '<section class="mk-sec" id="mk-growth"><div class="mk-sh"><h2>Growth & demand</h2><p>New homes, new businesses, jobs, local spending and the sales tax it pays: the demand behind new buildings.</p></div><div class="mk-grid">' +
      (s.permits?.length ? box('New homes permitted per year', permitsChart(s.permits) + pinned('permits') + (y ? note('<b>' + y.year + ' through ' + MON[y.month - 1] + ':</b> ' + fmtN(y.n) + ' homes' + (y.prior ? ' (' + pct(chg(y.n, y.prior)) + ' on the same months of ' + (y.year - 1) + ')' : '') + (y.value ? ', ' + money(y.value) + ' of construction' : '') + '.') : '') +
        note('Units authorized by building permits; includes Census estimates for places that don’t report every month.', 'US Census Building Permits Survey.')) : '') +
      (s.biz?.length ? box('New business locations per month', monthBars(s.biz, { key: 'biz', unit: 'new locations' }) + pinned('biz') +
        note('Sales-tax permits issued per location that are still active, so older months read low. Covers retail, restaurants and many services; most offices and medical don’t need one.', 'Texas Comptroller.')) : '') +
      (s.jobs ? box('Jobs by industry (' + s.jobs.year + ')', grow('mk:growth:jobs', x => C.hbars(s.jobs.sec.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 10 + Math.floor(x / ROW)).map(([i, v]) => ({ label: SECTORS[i][1], v, k: 'sector:' + i, c: 1, tip: SECTORS[i][1] + ': ' + fmtN(v) + ' jobs (' + Math.round(v / (sum(s.jobs.sec, x => x) || 1) * 100) + '%)' })), fmtN, pin, 'mk:growth:jobs'), rowsCap(s.jobs.sec.length, 10)) + pinned('sector') +
        note('Jobs counted where people work' + (s.jobs.gr != null ? '; ' + pct(s.jobs.gr) + ' since ' + s.jobs.baseYear : '') + '. Map them under Map Layers → Demographics.', 'US Census LEHD LODES.')) : '') +
      (s.tax?.length ? box('City sales tax per month', monthBars(s.tax, { key: 'tax', unit: 'in city sales tax', fmt: fmtM, c: 5 }) + pinned('tax') +
        '<h4 class="mk-h4">Cities, last 12 months</h4>' + C.hbars(s.taxCities.slice(0, 10).map((c, i) => ({ label: c.city, v: c.last12 || 0, k: 'city:' + i, c: 5, sub: c.last12 != null && c.prior12 ? pct(chg(c.last12, c.prior12)) : '', tip: c.city + ' (' + c.county + ' County): ' + money(c.last12) + ' in the last 12 months' + (c.prior12 ? ', ' + pct(chg(c.last12, c.prior12)) + ' on the 12 before' : '') })), fmtM, pin, 'mk:growth:cities') + pinned('city') +
        note('The cities’ share of sales tax, paid about two months after the sales: a real measure of taxable local spending.', 'Texas Comptroller allocations.')) : '') +
      (s.spend ? box('Consumer spending a year (estimate)', (() => { const top = Object.entries(s.spend.cats).sort((a, b) => b[1] - a[1]), tot = sum(top, x => x[1]) || 1;
        return '<div class="kgrid mk-kg4"><div><b>' + money(s.spend.total) + '</b><span>A year, all households</span></div><div><b>' + money(s.spend.perHH) + '</b><span>Per household</span></div></div>' + C.hbars(top.map(([k, v], i) => ({ label: CAT_LABEL[k] || k, v, k: 'spend:' + i, c: 3, tip: (CAT_LABEL[k] || k) + ': ' + money(v) + ' a year (' + Math.round(v / tot * 100) + '%)' })), fmtM, pin, 'mk:growth:spend'); })() + pinned('spend') +
        note('An estimate: households by income in each census tract × what households at that income spend (BLS Consumer Expenditure Survey, South).', 'Census ACS ' + s.spend.acs + ', BLS CE ' + s.spend.year + '.'), 'mk-wide') : '') + '</div></section>';
  }

  // ----- Housing & rents -----
  // small multiples in full rows (3 a row on a desktop, 2 on a tablet, 1 on a phone; four make two rows of two), each
  // drawn at its cell's width. list: [id, label, fmt, opts] for the series that have data
  function smGrid(list) {
    list = list.filter(([id]) => mk(id)); if (!list.length) return '';
    const { L, spans } = rowsOf(list.length, Wd.smc), col = (Wd.wide - Wd.smGap * (L - 1)) / L;
    return '<div class="mk-sms" style="grid-template-columns:repeat(' + L + ',minmax(0,1fr))">' + list.map(([id, l, f, o], i) => smallMultiple(id, l, f, o, Math.floor(col * spans[i] + Wd.smGap * (spans[i] - 1) - Wd.smPad), spans[i])).join('') + '</div>';
  }
  function smallMultiple(id, label, fmt, { c = 0, invert = false, n = 36 } = {}, W = 320, span = 1) {
    const x = mk(id); if (!x) return ''; const pts = x.pts.slice(-n);
    return '<div class="mk-sm" style="grid-column:span ' + span + '"><div class="mk-smh"><span>' + esc(label) + '</span><b>' + esc(fmt(x.last.v)) + '</b>' + C.delta(x.yoy, { invert }) + '</div>' +
      C.lines({ xs: pts.map(p => monthLabel(p.m)), series: [{ label, c, vals: pts.map(p => p.v) }], W, H: 150, zero: false, fmt: v => fmt(v), tip: i => monthLabel(pts[i].m) + ': ' + fmt(pts[i].v), tick: i => pts[i].m.endsWith('-01') ? pts[i].m.slice(0, 4) : null, aria: label, ck: 'mk:sm:' + id }) +
      '<div class="mk-smf">' + esc(monthLabel(x.last.m)) + (x.yoy != null ? ' · a year earlier ' + esc(fmt(x.pts.find(p => p.m === addMonths(x.last.m, -12))?.v ?? NaN)) : '') + '</div></div>';
  }
  function housingSec(rn) {
    const h = housingNow(), homes = smGrid(HOMES.map(([id, l, f]) => [id, l, f, { c: 1 }]));
    if (!h && !rn && !homes) return '';
    const kg = h ? '<div class="kgrid mk-kg4 k3">' + [[money(h.median_home_value_approx), 'Median home value'], [money(h.median_household_income_approx), 'Median household income'], [h.median_gross_rent_approx ? '$' + fmtN(h.median_gross_rent_approx) : '—', 'Median rent (census)'], [fmtN(h.households), 'Households'], [h.vacancy_rate_pct != null ? h.vacancy_rate_pct + '%' : '—', 'Homes vacant'], [h.median_age_approx ?? '—', 'Median age']].map(([v, l]) => '<div><b>' + v + '</b><span>' + l + '</span></div>').join('') + '</div>' : '';
    const zipRow = r => '<tr><td class="m">' + esc(r.zip) + '</td><td>' + esc(r.city) + '</td><td class="m r">$' + fmtN(r.rent) + '</td><td class="m r">' + C.delta(r.yoy) + '</td></tr>';
    return '<section class="mk-sec" id="mk-housing"><div class="mk-sh"><h2>Housing & rents</h2><p>Who lives here and what they earn (census tracts), what rents are doing by ZIP (Zillow), and the Houston for-sale market.</p></div><div class="mk-grid">' +
      (h ? box('Households and incomes', kg + (h.income ? '<h4 class="mk-h4">Household income</h4>' + C.hbars(h.income.map(b => ({ label: b.label, v: b.pct, c: 1, tip: b.label + ': ' + fmtN(b.n) + ' households (' + b.pct.toFixed(1) + '%)' })), v => v.toFixed(0) + '%', null, 'mk:housing:income') : '') +
        note('Area medians are household-weighted averages of the tract medians (approximate).', 'US Census ACS 5-year ' + (market?.year || '') + '.')) : '') +
      (rn ? box('Rents by ZIP', '<div class="kgrid mk-kg4"><div><b>$' + fmtN(Math.round(rn.typical)) + '</b><span>Typical rent (ZIP median)</span></div><div><b>' + (rn.yoy != null ? pct(rn.yoy) : '—') + '</b><span>In a year</span></div><div><b>$' + fmtN(rn.low.rent) + '–' + fmtN(rn.high.rent) + '</b><span>Range across ' + rn.rows.length + ' ZIPs</span></div></div>' +
        '<div class="tablewrap mk-zips"><table class="mk-tbl"><thead><tr><th>ZIP</th><th>Town</th><th class="r">Rent</th><th class="r">Year</th></tr></thead><tbody>' + rn.rows.slice(0, 10).map(zipRow).join('') + '</tbody></table></div>' +
        (rn.rows.length > 10 ? '<details class="mk-more"><summary>All ' + rn.rows.length + ' ZIPs</summary><div class="tablewrap"><table class="mk-tbl"><tbody>' + rn.rows.slice(10).map(zipRow).join('') + '</tbody></table></div></details>' : '') +
        note('Typical asking rent for all home types, ' + esc(monthLabel(rn.month)) + '. ZIPs are placed in a county by their town, so border ZIPs are approximate.', 'Zillow Observed Rent Index.')) : '') +
      (homes ? box('Houston for-sale market (metro)', homes + note('Metro-wide monthly figures, the same for every county here.', 'Realtor.com and US Census via FRED.'), 'mk-wide') : '') + '</div></section>';
  }

  // ----- Costs & rates -----
  function costsSec() {
    const costs = smGrid(COSTS.map(([id, l]) => [id, l, v => v >= 1000 ? fmtN(Math.round(v)) : v.toFixed(1), { c: 2, invert: true, n: 60 }]));
    const R = [['mortgage30us', '30-yr mortgage', 0], ['dgs10', '10-yr Treasury', 1], ['fedfunds', 'Fed funds', 4]].map(([id, l, c]) => ({ x: mk(id), l, c })).filter(r => r.x);
    let rates = '';
    if (R.length) { const ms = [...new Set(R.flatMap(r => r.x.pts.map(p => p.m)))].sort().slice(-60), val = (r, m) => r.x.pts.find(p => p.m === m)?.v ?? null;
      const series = R.map(r => ({ label: r.l, c: r.c, vals: ms.map(m => val(r, m)) }));
      rates = legend(R.map(r => [r.l, r.c])) + grow('mk:costs:rates', x => C.lines({ xs: ms.map(monthLabel), series, W: Wd.half, H: 220 + x, fmt: v => v.toFixed(2) + '%', zero: false, tick: i => ms[i].endsWith('-01') ? ms[i].slice(0, 4) : null, aria: 'Interest rates, monthly', ck: 'mk:costs:rates' })); }
    const r = area.rates?.series, mg = area.mortgages;
    const now = r ? '<table class="mk-tbl"><thead><tr><th>Rate</th><th class="r">Now</th><th class="r">1-yr change</th><th>As of</th></tr></thead><tbody>' + ['m30', 't10', 't5', 'sofr'].filter(k => r[k]).map(k => { const x = r[k], d = x.yearAgo != null ? x.value - x.yearAgo : null;
      return '<tr><td>' + esc(x.label) + '</td><td class="m r"><b>' + x.value.toFixed(2) + '%</b></td><td class="m r">' + (d == null ? '—' : C.delta(d, { unit: ' pts', invert: true, digits: 2 })) + '</td><td class="m">' + esc(MON[+x.date.slice(5, 7) - 1] + ' ' + +x.date.slice(8)) + '</td></tr>'; }).join('') + '</tbody></table>' : '';
    const F = fipsList().filter(f => mg?.counties?.[f]), loans = sum(F, f => mg.counties[f].loans), dollars = sum(F, f => mg.counties[f].dollars), purch = sum(F, f => mg.counties[f].purchase), prior = sum(F, f => mg.counties[f].priorLoans);
    const lend = F.length && loans ? '<h4 class="mk-h4">Home lending ' + mg.year + '</h4><div class="kgrid mk-kg4"><div><b>' + fmtN(loans) + '</b><span>Home loans' + (prior ? ' · ' + pct(chg(loans, prior)) : '') + '</span></div><div><b>' + money(dollars) + '</b><span>Loan dollars</span></div><div><b>' + fmtN(purch) + '</b><span>Purchase loans</span></div><div><b>' + money(loans ? dollars / loans : 0) + '</b><span>Average loan</span></div></div>' : '';
    if (!costs && !rates && !now) return '';
    return '<section class="mk-sec" id="mk-costs"><div class="mk-sh"><h2>Costs & rates</h2><p>What it costs to build (producer price indexes for materials) and to borrow.</p></div><div class="mk-grid">' +
      (costs ? box('Construction material prices', costs + note('Producer price indexes (an index, not a price per unit; copper in $ per tonne), monthly. Red means prices rose: costs went up.', 'BLS PPI and IMF via FRED.'), 'mk-wide') : '') +
      (rates ? box('Interest rates, 5 years', rates + note('Monthly averages. Loan rates track an index (Treasury or SOFR) plus a lender spread.', 'FRED (Freddie Mac PMMS, US Treasury, Federal Reserve).')) : '') +
      (now || lend ? box('Rates now and home lending', now + lend + note('', 'FRED, New York Fed SOFR, Freddie Mac; home loans from CFPB HMDA (originated 1–4 family loans, published yearly).')) : '') + '</div></section>';
  }

  // ----- Area & news (Houston crime, busiest roads, local news, newest businesses) -----
  function crimeBox() {
    if (!wantCrime()) return ''; const d = crimeCity;
    if (!d) return box('Crime · City of Houston', note('Counting incidents…') + skel(170));
    if (d.error || !d.latest) return box('Crime · City of Houston', note(esc(d.error || d.note || 'No crime data loaded yet.')));
    const L = d.last12, keys = ['v', 'p', 'o'].filter(k => show[k]).map(k => ({ k, c: CR[k] })), all = d.months || [], off = Math.max(0, all.length - (range || all.length));
    return box('Crime · City of Houston', '<div class="kgrid mk-kg4"><div><b>' + fmtN(L.total) + '</b><span>Incidents, 12 months · ' + pct(d.change.total) + '</span></div><div><b style="color:' + col(6) + '">' + fmtN(L.v) + '</b><span>Violent · ' + pct(d.change.v) + '</span></div><div><b style="color:' + col(2) + '">' + fmtN(L.p) + '</b><span>Property · ' + pct(d.change.p) + '</span></div><div><b>' + fmtN(d.per_sqmi?.total) + '</b><span>Per sq mi a year</span></div></div>' +
      '<div class="mk-leg">' + legBtn('v', 'Violent', 6) + legBtn('p', 'Property', 2) + legBtn('o', 'Other', 4) + '</div>' +
      grow('mk:area:crime', x => C.bars({ rows: ranged(all).map(r => ({ id: r.m, v: r, tick: r.m.endsWith('-01') ? r.m.slice(0, 4) : '', tip: monthLabel(r.m) + ': ' + fmtN(r.v + r.p + r.o) + ' incidents · violent ' + fmtN(r.v) + ' · property ' + fmtN(r.p) + ' · other ' + fmtN(r.o) })), keys, W: Wd.half, H: 200 + x, pinKey: 'crime', pin, off, aria: 'Crime per month', ck: 'mk:area:crime' })) + pinned('crime') +
      '<h4 class="mk-h4">Most reported, last 12 months</h4>' + grow('mk:area:offenses', x => C.hbars((d.offenses || []).slice(0, 8 + Math.floor(x / ROW)).map((o, i) => ({ label: o.name, v: o.n, k: 'offense:' + i, c: CR[o.cat] ?? 4, tip: o.name + ': ' + fmtN(o.n) + ' incidents' })), fmtN, pin, 'mk:area:offenses'), rowsCap((d.offenses || []).length, 8)) + pinned('offense') +
      note('Houston Police incidents (NIBRS) through ' + esc(monthLabel(d.latest.slice(0, 7))) + '; the file runs about three months behind. City of Houston only' + (sel === 'all' ? '' : ' (part of ' + esc(areaLabel()) + ')') + '.'));
  }
  function trafficBox() {
    const t = traffic.get(sel); if (t === undefined) return '';
    if (!t) return box('Busiest roads', '<div class="rnote loading">Loading TxDOT traffic counts…</div>' + skel(170));
    if (t.error) return box('Busiest roads', note(esc(t.error)));
    return box('Busiest roads', grow('mk:area:roads', x => C.hbars(t.roads.slice(0, 10 + Math.floor(x / ROW)).map((r, i) => ({ label: title(r.road), v: r.aadt, k: 'road:' + i, c: 3, tip: title(r.road) + ': ' + fmtN(r.aadt) + ' vehicles a day at its busiest counted point. Click to see it on the map.' })), fmtN, null, 'mk:area:roads'), rowsCap(t.roads.length, 10)) +
      '<h4 class="mk-h4">Average daily traffic by road type</h4>' + grow('mk:area:rtypes', x => C.hbars(t.types.slice(0, 8 + Math.floor(x / ROW)).map((g, i) => ({ label: g.label, v: g.avg, k: 'rtype:' + i, c: 3, tip: g.label + ': ' + fmtN(g.avg) + ' vehicles a day on average' })), fmtN, pin, 'mk:area:rtypes'), rowsCap(t.types.length, 8)) + pinned('rtype') +
      note('TxDOT annual average daily traffic (AADT)' + (t.as_of ? ', published ' + esc(t.as_of) : '') + ': how busy roads are, not how traffic is changing.'));
  }
  function areaSec(s) {
    const placeOpts = s.places ? '<option value="">All places</option>' + s.places.map(p => '<option value="' + esc(p.key) + '"' + (newsPlace === p.key ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('') : '';
    return '<section class="mk-sec" id="mk-area"><div class="mk-sh"><h2>Area & news</h2><p>Safety and traffic, local development news and the newest businesses.</p></div><div class="mk-grid">' + crimeBox() + trafficBox() +
      (s.news ? box('Local development news', '<div class="mk-ctl"><select class="chip" id="mkPlace" aria-label="News place">' + placeOpts + '</select></div>' +
        (s.news.length ? s.news.map((a, i) => (i === 10 ? '<details class="raw mk-more"><summary>' + (s.news.length - 10) + ' more</summary>' : '') + '<a class="chitem" target="_blank" rel="noopener" href="' + esc(a.url) + '"><span><b>' + esc(a.title) + '</b><em>' + esc(a.domain) + (a.date ? ' · ' + esc(a.date) : '') + ' · ' + esc(a.place) + '</em></span></a>').join('') + (s.news.length > 10 ? '</details>' : '') : note('No articles found in the last few months.')) +
        note('Development, construction, rezoning and real estate stories naming each county and its busiest towns, kept 120 days.', 'Google News.'), 'mk-wide') : '') +
      (s.latest?.length ? '<section class="mk-box mk-wide" id="mkLatest"><h3>Newest business locations</h3><div class="tablewrap"><table class="who mk-tbl"><thead><tr><th>Business</th><th>Address</th><th>Type</th><th>Permit issued</th></tr></thead><tbody>' +
        s.latest.map((b, i) => '<tr' + (i >= 10 ? ' hidden' : '') + '><td>' + esc(b.name) + (b.owner ? '<div class="sc">' + esc(b.owner) + '</div>' : '') + '</td><td>' + esc([b.addr, b.city].filter(Boolean).join(', ')) + '</td><td>' + esc(b.sec != null ? SECTORS[b.sec][1] : (b.naics || '')) + '</td><td class="m">' + esc(b.date) + '</td></tr>').join('') +
        '</tbody></table></div>' + (s.latest.length > 10 ? '<button class="btn mk-morebtn" type="button" id="mkLatestMore">Show ' + Math.min(10, s.latest.length - 10) + ' more (' + (s.latest.length - 10) + ' left)</button>' : '') +
        note('Active sales-tax permits, newest first (the latest ' + s.latest.length + '). A new permit can also mean a change of owner.', 'Texas Comptroller.') + '</section>' : '') + '</div></section>';
  }

  // ----- pinned breakdowns (click a bar) -----
  function pinned(k) {
    const hint = '<div class="mk-hint">Click a bar for its breakdown.</div>';
    if (!pin || pin.k !== k) return hint;
    const s = curStats; let h = '';
    if (k === 'permits') {
      const r = s.permits?.[pin.i], p = s.permits?.[pin.i - 1]; if (!r) return hint; const t = r.sf + r.mf;
      h = '<b>' + r.y + '</b>: ' + fmtN(t) + ' homes' + (p ? ' (' + pct(chg(t, p.sf + p.mf)) + ' on ' + p.y + ')' : '') + ' · single-family ' + fmtN(r.sf) + ' (' + Math.round(r.sf / (t || 1) * 100) + '%) · apartments (5+) ' + fmtN(r.mf5 || 0) + ' · value ' + money(r.value) + (t ? ' · about ' + money(r.value / t) + ' a home' : '');
    } else if (k === 'biz' || k === 'tax' || k === 'crime') {
      const rows = k === 'biz' ? s.biz : k === 'tax' ? s.tax : crimeCity?.months, r = rows?.[pin.i]; if (!r) return hint;
      const val = x => k === 'crime' ? x.v + x.p + x.o : x.n, ly = lastYear(rows, pin.i), f = k === 'tax' ? fmtM : fmtN;
      h = '<b>' + monthLabel(r.m) + '</b>: ' + f(val(r)) + (k === 'biz' ? ' new business locations' : k === 'tax' ? ' in city sales tax' : ' incidents') + (ly ? ' (' + pct(chg(val(r), val(ly))) + ' on ' + monthLabel(ly.m) + ')' : '');
      if (k === 'crime') h += ' · violent ' + fmtN(r.v) + ' · property ' + fmtN(r.p) + ' · other ' + fmtN(r.o);
      if (k === 'biz') { const list = (s.latest || []).filter(b => String(b.date).startsWith(r.m)).slice(0, 8); if (list.length) h += '<div class="mk-pl">' + list.map(b => '<span>' + esc(b.name) + ' <em>' + esc(b.city || b.county || '') + '</em></span>').join('') + '</div>'; }
      if (k === 'tax') { const nm = new Set(fipsList().map(cname)), top = Object.entries(area.salesTax?.cities || {}).filter(([, c]) => nm.has(c.county) && c.months[r.m]).map(([n, c]) => [n, c.months[r.m]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
        if (top.length) h += '<div class="mk-pl">' + top.map(([n, v]) => '<span>' + esc(n) + ' <em>' + fmtM(v) + '</em></span>').join('') + '</div>'; }
    } else if (k === 'use') {
      const u = pipe().byUse[pin.i]; if (!u) return hint;
      h = '<b>' + esc(u.name) + '</b>: ' + money(u.v) + ' under construction in ' + fmtN(u.n) + ' projects. Largest:' + fTable(u.list);
    } else if (k === 'sector') {
      const v = s.jobs?.sec?.[pin.i]; if (v == null) return hint; const tot = sum(s.jobs.sec, x => x) || 1;
      h = '<b>' + esc(SECTORS[pin.i][1]) + '</b>: ' + fmtN(v) + ' jobs, ' + Math.round(v / tot * 100) + '% of the jobs located here. <button class="lnk" type="button" data-act="jobsmap">Map jobs by census tract</button>';
    } else if (k === 'spend') {
      const e = Object.entries(s.spend?.cats || {}).sort((a, b) => b[1] - a[1])[pin.i]; if (!e) return hint; const tot = sum(Object.values(s.spend.cats), x => x) || 1;
      h = '<b>' + esc(CAT_LABEL[e[0]] || e[0]) + '</b>: ' + fmtM(e[1]) + ' a year (' + Math.round(e[1] / tot * 100) + '%)' + (s.spend.perHH && s.spend.total ? ' · about ' + fmtM(e[1] / s.spend.total * s.spend.perHH) + ' per household' : '') + '. <button class="lnk" type="button" data-act="spendmap">Map spending by tract</button>';
    } else if (k === 'city') {
      const c = s.taxCities?.[pin.i]; if (!c) return hint;
      h = '<b>' + esc(c.city) + '</b> (' + esc(c.county) + ' County): ' + money(c.last12) + ' in city sales tax over the last 12 months' + (c.prior12 ? ', ' + fmtM(c.prior12) + ' the 12 before (' + pct(chg(c.last12, c.prior12)) + ')' : '') + '.';
    } else if (k === 'offense') {
      const o = crimeCity?.offenses?.[pin.i]; if (!o) return hint; const tot = crimeCity.last12.total || 1;
      h = '<b>' + esc(o.name) + '</b>: ' + fmtN(o.n) + ' incidents in 12 months (' + (o.n / tot * 100).toFixed(1) + '%). <button class="lnk" type="button" data-act="crimemap">Show the crime map layer</button>';
    } else if (k === 'rtype') {
      const g = traffic.get(sel)?.types?.[pin.i]; if (!g) return hint;
      h = '<b>' + esc(g.label) + '</b>: ' + fmtN(g.avg) + ' vehicles a day on an average counted segment, ' + fmtN(g.segments) + ' segments, busiest ' + fmtN(g.max) + ' a day.';
    }
    return '<div class="mk-pin">' + h + ' <button class="lnk mk-x" type="button" data-act="unpin" aria-label="Close">×</button></div>';
  }

  // ---------- area picker: a small map of the counties (click one) beside a button per county and the whole region ----------
  let scopeOpen = false, mini = null;
  function scopeHtml() {
    // the county outlines are projected once (22,000 points), not on every draw; only their classes change
    if (!mini || mini.geo !== ctx.countyGeo || mini.area !== area || (!mini.paths.length && window.d3)) {
      const geo = (ctx.countyGeo || []).filter(g => area.counties.some(c => c.name === g.name)), W = 220, H = 150;
      let paths = [];
      if (window.d3 && geo.length) { const fcx = { type: 'FeatureCollection', features: geo.map(g => ({ type: 'Feature', properties: {}, geometry: g.geom })) }, path = d3.geoPath(d3.geoMercator().fitExtent([[4, 4], [W - 4, H - 4]], fcx));
        paths = geo.map(g => ({ c: area.counties.find(x => x.name === g.name), d: path(g.geom) })); }
      mini = { geo: ctx.countyGeo, area, W, H, paths };
    }
    const svg = mini.paths.length ? '<svg class="mk-mini" viewBox="0 0 ' + mini.W + ' ' + mini.H + '" aria-hidden="true">' + mini.paths.map(({ c, d }) =>
      '<path d="' + d + '" data-county="' + c.fips + '" class="' + (sel !== 'all' && fipsList().includes(c.fips) ? 'on' : sel === 'all' ? 'in' : '') + '"><title>' + esc(c.name) + ' County</title></path>').join('') + '</svg>' : '';
    const btn = (v, name) => '<button type="button" class="mk-cty" data-county="' + v + '" aria-pressed="' + (v === 'all' ? sel === 'all' : sel !== 'all' && fipsList().includes(v)) + '">' + esc(name) + '</button>';
    // the scope bar: the area in one line, with the county picker folded away behind "Change"
    return '<details class="mk-scopebar"' + (scopeOpen ? ' open' : '') + '><summary><span class="vs-n">Area: <b>' + esc(areaLabel()) + '</b></span><span class="lnk">Change</span></summary>' +
      '<div class="mk-scope2">' + svg + '<div><div class="mk-ctys" role="group" aria-label="Market area">' + btn('all', 'Whole region') + area.counties.map(c => btn(c.fips, c.name)).join('') + '</div>' +
      '<div class="mk-scope-n">' + (sel !== 'all' && sel === adopted ? 'Showing the area selected on the map. ' : '') + 'Click a county here or on the little map; click it again for the whole region.</div></div></div></details>';
  }
  const NAV = [['overview', 'Summary'], ['pipeline', 'Pipeline'], ['growth', 'Growth'], ['housing', 'Housing'], ['costs', 'Costs & rates'], ['markets', 'Markets'], ['area', 'Area & news']];

  // ---------- export: the tab as a PDF report (with a street map of the area) and every series as CSV ----------
  const areaLabel = () => { if (sel === 'all') return 'Houston region (' + area.counties.length + ' counties)'; const n = fipsList().map(cname);
    return n.length === 1 ? n[0] + ' County' : n.length === 2 ? n.join(' + ') + ' counties' : n.length + ' counties (' + n.join(', ') + ')'; };
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const PRINT_CSS = '.mk-kpis2{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0;break-inside:avoid}.mk-kpi{border:1px solid #e8ebeb;border-radius:6px;padding:8px 10px}.mk-kpi b{display:block;font-family:"IBM Plex Mono",monospace;font-size:15px;color:#0b0d0c}.mk-kpi b small{font-size:9px;color:#6b7174}.mk-kl{display:block;font-family:"IBM Plex Mono",monospace;font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;color:#6b7174}.mk-ks{font-size:8.5px;color:#6b7174}.mk-ks span{margin-left:4px}.mk-kspk svg{width:100%;height:20px;display:block}' +
    '.mk-d{font-family:"IBM Plex Mono",monospace;font-size:8.5px;font-weight:600}.mk-up{color:#0a7a36}.mk-dn{color:#b3261e}.mk-flat{color:#6b7174}.mk-moving{border:1px solid #e8ebeb;border-radius:6px;padding:8px 12px;margin-bottom:10px;break-inside:avoid}.mk-moving h3{margin:0 0 4px;font-size:11px}.mk-moving ul{margin:0;padding-left:16px;font-size:10px;line-height:1.5}' +
    '.mk-sec{margin-top:14px}.mk-sh h2{font-size:14px;margin:14px 0 2px;border-bottom:2px solid #006527;padding-bottom:3px}.mk-sh p{font-size:9px;color:#6b7174;margin:0 0 8px}.mk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.mk-box{border:1px solid #e8ebeb;border-radius:6px;padding:10px 12px;break-inside:avoid}.mk-wide{grid-column:1/-1}.mk-box h3{font-size:11px;margin:0 0 6px}.mk-h4{font-size:9.5px;font-weight:700;margin:8px 0 4px}' +
    '.mk-svg{width:100%;height:auto;display:block;overflow:visible}line.mk-grid{stroke:#e8ebeb}.mk-ax{font-family:"IBM Plex Mono",monospace;font-size:10px;fill:#6b7174}.mk-cross,.mk-dot{display:none}.mk-now{stroke:#23282a;stroke-dasharray:3 3}' +
    '.mk-leg{display:flex;flex-wrap:wrap;gap:10px;font-size:8.5px;color:#4d5457;margin-bottom:3px}.mk-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}.mk-hbars{display:grid;gap:4px}.mk-hb{display:grid;grid-template-columns:minmax(90px,40%) 1fr auto;gap:6px;align-items:center;font-size:8.5px}.mk-hb span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#4d5457}.mk-hb small{color:#6b7174}.mk-hb i{display:block;height:7px}.mk-hb i b{display:block;height:100%;border-radius:0 3px 3px 0}.mk-hb em{font-style:normal;font-family:"IBM Plex Mono",monospace;font-size:8px}' +
    '.kgrid.mk-kg4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:0 0 6px}.mk-kg4 b{display:block;font-family:"IBM Plex Mono",monospace;font-size:11px}.mk-kg4 span{font-family:"IBM Plex Mono",monospace;font-size:7px;letter-spacing:.08em;text-transform:uppercase;color:#6b7174}' +
    '.mk-tbl{width:100%;border-collapse:collapse;font-size:8.5px}.mk-tbl th{font-family:"IBM Plex Mono",monospace;font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:#6b7174;text-align:left;border-bottom:1px solid #dde1e2;padding:2px 4px}.mk-tbl td{border-bottom:1px solid #e8ebeb;padding:2px 4px;vertical-align:top}.mk-tbl .r{text-align:right}.mk-tbl .m{font-family:"IBM Plex Mono",monospace}.mk-tbl .sc{display:block;color:#6b7174;font-size:7.5px}' +
    '.mk-sms{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mk-sm{border:1px solid #f0f2f2;border-radius:4px;padding:4px 6px}.mk-smh{display:flex;gap:6px;align-items:baseline;font-size:8.5px}.mk-smh b{font-family:"IBM Plex Mono",monospace}.mk-smf{font-size:7.5px;color:#6b7174}' +
    '.mx-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.mx-asof,.mx-desc,.mx-dim{color:#6b7174;font-size:9px}.mx-table{width:100%;border-collapse:collapse;font-size:9px}.mx-table th{font-family:"IBM Plex Mono",monospace;font-size:7px;text-transform:uppercase;color:#6b7174;text-align:left;border-bottom:1px solid #dde1e2;padding:2px 4px}.mx-table td{border-bottom:1px solid #e8ebeb;padding:2px 4px}.mx-table .r{text-align:right}.mx-sym{display:block;font-size:7px;color:#6b7174}.mx-spark{width:90px;height:22px}.mx-spark polyline,.mx-chart polyline{fill:none;stroke-width:1.4}.mx-spark.up polyline{stroke:#0a7a36}.mx-spark.dn polyline{stroke:#b3261e}.mx-up{color:#0a7a36}.mx-dn{color:#b3261e}.mx-wrap{display:grid;grid-template-columns:200px 1fr;gap:10px}.mx-kg{display:grid;grid-template-columns:1fr 1fr;gap:4px}.mx-kg b{display:block;font-family:"IBM Plex Mono",monospace;font-size:11px}.mx-kg span{font-size:7px;text-transform:uppercase;color:#6b7174}.mx-leg{display:flex;gap:10px;font-size:8.5px}.mx-leg i{display:inline-block;width:12px;height:3px;margin-right:4px;vertical-align:2px}.mx-leg i.mx-la{background:#006527}.mx-leg i.mx-lb{background:#c26a00}.mx-chart,.mx-lags{width:100%;height:auto;display:block}.mx-chart polyline.mx-la{stroke:#006527}.mx-chart polyline.mx-lb{stroke:#c26a00;stroke-dasharray:5 3}.mx-zero{stroke:#dde1e2}.mx-ax{font-family:"IBM Plex Mono",monospace;font-size:10px;fill:#6b7174}.mx-lags rect.pos{fill:#8acda3}.mx-lags rect.neg{fill:#bcc2c4}.mx-lags rect.on{fill:#006527}.mx-say{font-size:9.5px}.mx-hit line{display:none}' +
    '.chitem{display:block;color:inherit;text-decoration:none;padding:3px 0;border-top:1px solid #e8ebeb;font-size:9px}.chitem em{display:block;font-style:normal;color:#6b7174;font-size:8px}.src{display:none}.rnote{font-size:8px;color:#6b7174;margin-top:4px}';
  async function exportReport() {
    if (!area) return; if (ctx.view !== 'market') { ctx.setView('market'); await new Promise(r => setTimeout(r, 80)); }
    flushNow(); // a draw still waiting for the next frame happens now (a hidden tab gets no frames)
    finish(root); // the copy must hold every chart at its final values, not mid-animation
    const label = areaLabel(), body = root.querySelector('.mk-body')?.cloneNode(true); if (!body) return;
    body.querySelectorAll('.mk-hint,.mk-pin,.mk-ctl,.mx-ctl,.mx-tabs,.bacts,.mx-cmp,.mx-acts,select,button,.mk-nav,.mk-skel').forEach(e => e.remove());
    body.querySelectorAll('details').forEach(d => d.open = true); body.querySelectorAll('tr[hidden]').forEach(tr => tr.hidden = false);
    body.querySelectorAll('.mk-lb').forEach(b => b.remove());
    // the PDF has its own tile grid; small multiples keep the screen's rows (each is drawn for its cell, so every chart's
    // text prints at the same size)
    body.querySelectorAll('.mk-kpis2,.mk-kpi,.mx-sp').forEach(e => e.removeAttribute('style'));
    body.querySelectorAll('[tabindex],[data-k],[data-tip],[data-fid],[data-ck],[data-mk]').forEach(e => { ['tabindex', 'data-k', 'data-tip', 'data-fid', 'data-ck', 'data-mk'].forEach(a => e.removeAttribute(a)); });
    const geo = (ctx.countyGeo || []).filter(g => fipsList().map(cname).includes(g.name));
    const map = geo.length ? '<div class="map">' + areaMap(geo.map(g => ({ geometry: g.geom, stroke: '#006527', fill: 'rgba(0,101,39,.06)', width: 2 })), { W: 1000, H: 360 }) + '</div>' : '';
    const html = reportDoc({ kicker: 'Market report', title: label, meta: (range ? 'Monthly charts: last ' + range + ' months' : 'Monthly charts: all months') + (area.built ? ' · data built ' + esc(new Date(area.built).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : ''), css: PRINT_CSS,
      body: map + body.innerHTML,
      sources: 'TDLR construction filings (TABS); US Census (ACS, Building Permits Survey, LEHD LODES); BLS (PPI, LAUS, CE); Texas Comptroller; Zillow Observed Rent Index; Realtor.com; FRED; Freddie Mac; CFPB HMDA; Houston Police (NIBRS); TxDOT; Yahoo Finance (delayed); Coinbase; Google News. Estimates are labelled as such in each section.' });
    return savePdf(ctx, 'market', label, html);
  }
  async function exportData() {
    if (!area) return; const s = stats(), label = areaLabel(), rows = [], add = (section, item, value, note = '') => rows.push({ Area: label, Section: section, Item: item, Value: value, Note: note });
    const p = pipe(); add('Construction pipeline', 'Under construction (est. value)', Math.round(p.active.v), fmtN(p.active.n) + ' projects'); add('Construction pipeline', 'Starting in the next 90 days', Math.round(p.starting.v), fmtN(p.starting.n) + ' projects'); add('Construction pipeline', 'All scheduled starts', Math.round(p.upcoming.v), fmtN(p.upcoming.n) + ' projects');
    p.months.forEach(r => add('Under construction by month', r.m + (r.future ? ' (scheduled)' : ''), Math.round(r.New + r.Reno + r.Addition), fmtN(r.n) + ' projects'));
    p.byUse.forEach(u => add('Under construction by use', u.name, Math.round(u.v), fmtN(u.n) + ' projects'));
    p.largest.forEach(f => add('Largest under construction', f.name, f.cost, [f.city || f.county, f.use, f.ts + ' to ' + f.te].filter(Boolean).join(' · ')));
    p.starting.list.forEach(f => add('Starting in 90 days', f.name, f.cost, [f.city || f.county, f.use, 'starts ' + f.ts].filter(Boolean).join(' · ')));
    p.outliers.forEach(f => add('Left out of totals (likely mis-entered)', f.name, f.cost, f.county));
    if (s.pop) add('Population', 'Population (ACS ' + s.pop.year + ')', s.pop.n, s.pop.gr != null ? pct(s.pop.gr) + ' since ' + s.pop.baseYear : '');
    (s.permits || []).forEach(r => { add('Housing permits', r.y + ' single-family units', r.sf); add('Housing permits', r.y + ' units in 2–4 unit buildings', Math.max(0, r.mf - (r.mf5 || 0))); add('Housing permits', r.y + ' units in 5+ unit buildings', r.mf5 || 0); add('Housing permits', r.y + ' value', r.value); });
    (s.biz || []).forEach(r => add('New business locations', r.m, r.n));
    if (s.jobs) s.jobs.sec.forEach((v, i) => add('Jobs by industry (' + s.jobs.year + ')', SECTORS[i][1], v));
    if (s.spend) Object.entries(s.spend.cats).forEach(([k, v]) => add('Consumer spending a year (estimate)', CAT_LABEL[k] || k, Math.round(v)));
    (s.tax || []).forEach(r => add('City sales tax per month', r.m, Math.round(r.n)));
    (s.taxCities || []).forEach(c => add('City sales tax, last 12 months', c.city + ' (' + c.county + ')', c.last12 != null ? Math.round(c.last12) : '', c.prior12 ? pct(chg(c.last12, c.prior12)) + ' vs prior 12' : ''));
    const h = housingNow(); if (h) { add('Housing (census)', 'Median home value (approx.)', h.median_home_value_approx); add('Housing (census)', 'Median household income (approx.)', h.median_household_income_approx); add('Housing (census)', 'Median rent (approx.)', h.median_gross_rent_approx); add('Housing (census)', 'Households', h.households); add('Housing (census)', 'Vacancy rate %', h.vacancy_rate_pct); (h.income || []).forEach(b => add('Household income', b.label, b.n, b.pct.toFixed(1) + '%')); }
    const rn = rentInfo(); if (rn) rn.rows.forEach(r => add('Rents by ZIP (Zillow, ' + rn.month + ')', r.zip + ' ' + r.city, r.rent, r.yoy != null ? pct(r.yoy) + ' in a year' : ''));
    [...COSTS, ...HOMES].forEach(([id, l]) => { const x = mk(id); if (x) x.pts.forEach(p => add(l, p.m, p.v)); });
    if (wantCrime() && crimeCity?.latest) { crimeCity.months.forEach(m => { add('Crime per month (City of Houston)', m.m + ' violent', m.v); add('Crime per month (City of Houston)', m.m + ' property', m.p); add('Crime per month (City of Houston)', m.m + ' other', m.o); });
      crimeCity.offenses.forEach(o => add('Crime offenses, last 12 months (City of Houston)', o.name, o.n)); }
    const t = traffic.get(sel); if (t?.roads) { t.roads.forEach(r => add('Busiest roads (TxDOT AADT)', title(r.road), r.aadt, r.lat != null ? r.lat.toFixed(4) + ', ' + r.lon.toFixed(4) : '')); t.types.forEach(g => add('Average daily traffic by road type', g.label, g.avg, fmtN(g.segments) + ' segments')); }
    Object.values(area.rates?.series || {}).forEach(x => add('Rates', x.label, x.value, 'as of ' + x.date));
    ctx.exportMeta = { report: 'market', format: 'csv', scope: label };
    try { await ctx.exportCsv(rows, 'market-data-' + slug(label) + '-' + new Date().toISOString().slice(0, 10)); } finally { ctx.exportMeta = null; }
  }
  ctx.exportMarket = async (format = 'html', county) => { await load(); if (county) { const c = area?.counties.find(x => x.fips === county || x.name.toLowerCase() === String(county).toLowerCase()); if (c) { sel = c.fips; adopted = mapCounties(); } }
    if (format === 'csv') return exportData(); ctx.setView('market'); await new Promise(r => setTimeout(r, 120)); return exportReport(); };
  // the assistant's market_data extras: the pipeline, housing, rents and costs (small summaries)
  ctx.marketExtras = () => { if (!area) return null; const p = pipe(), h = housingNow(), rn = rentInfo();
    return { pipeline: { under_construction: Math.round(p.active.v), projects: p.active.n, starting_90_days: Math.round(p.starting.v), starting_projects: p.starting.n, scheduled_starts: Math.round(p.upcoming.v), change_vs_year_ago_pct: p.change != null ? +p.change.toFixed(1) : null,
        by_use: p.byUse.slice(0, 8).map(u => ({ use: u.name, value: Math.round(u.v), projects: u.n })), largest: p.largest.slice(0, 5).map(f => ({ name: f.name, value: f.cost, city: f.city || f.county, use: f.use, start: f.ts, end: f.te })), left_out: p.outliers.map(o => o.name + ' (' + fmtM(o.cost) + ')') },
      housing: h ? { median_home_value_approx: h.median_home_value_approx, median_income_approx: h.median_household_income_approx, median_rent_approx: h.median_gross_rent_approx, households: h.households, vacancy_pct: h.vacancy_rate_pct } : null,
      rents: rn ? { typical: Math.round(rn.typical), yoy_pct: rn.yoy, zips: rn.rows.length, month: rn.month } : null,
      material_costs_yoy_pct: Object.fromEntries(COSTS.map(([id, l]) => [l, mk(id)?.yoy != null ? +mk(id).yoy.toFixed(1) : null])) }; };

  // ---------- render ----------
  let curStats = null, navY = 0, pinSec = null, lastW = 0;
  // Every update goes through morph (src/motion.js): charts reveal the first time they scroll into view, then changes (range,
  // county, legend, pin, new data) tween the marks from where they were; a resize redraws at once (instant).
  // Requests are coalesced into one draw per frame: render() is the whole tab, section(id) only <section id="mk-<id>">.
  let want = null, raf = 0, drawn = null, drawnP = null;
  function schedule(what) {
    if (what === 'all') want = 'all'; else if (want !== 'all') (want ||= new Set()).add(what);
    if (!raf) { drawnP = new Promise(r => { drawn = r; }); raf = requestAnimationFrame(flush); }
    return drawnP;
  }
  function flush() {
    const w = want, d = drawn; raf = 0; want = null; drawn = null;
    try { if (ctx.view === 'market') { if (w === 'all' || !area || !root.querySelector('.mk-body')) full(); else w.forEach(drawSection); } }
    finally { d?.(); }
  }
  const flushNow = () => { if (raf) { cancelAnimationFrame(raf); flush(); } else if (area && !root.querySelector('.mk-body')) full(); };
  const render = () => schedule('all');
  const section = id => schedule(id);
  const full = () => keepState(root, () => morph(root, 'mk', draw));

  // what a redraw keeps: which details are open, the focused control (by its id or data key) and the scroll position
  const KEYS = ['data-k', 'data-range', 'data-show', 'data-sec', 'data-county', 'data-mxg', 'data-mxhow', 'data-mxb', 'data-mxs', 'data-fid', 'data-act'];
  function sig(a) {
    if (a.id) return '#' + CSS.escape(a.id);
    for (const k of KEYS) { const v = a.getAttribute(k); if (v != null) return a.tagName.toLowerCase() + '[' + k + '="' + CSS.escape(v) + '"]'; }
    return null;
  }
  function keepState(el, fn) {
    const open = [...el.querySelectorAll('details')].map(d => d.open), a = document.activeElement, f = a && a !== el && el.contains(a) ? sig(a) : null, y = root.scrollTop;
    fn();
    const ds = el.isConnected ? el.querySelectorAll('details') : []; if (ds.length === open.length) ds.forEach((d, i) => { if (open[i] && !d.open) d.open = true; });
    if (f) { const n = el.querySelector(f); if (n && document.activeElement !== n) n.focus({ preventScroll: true }); }
    root.scrollTop = y;
  }

  // ----- widths: one layout read of a hidden copy of the grid, so every chart is drawn at the width it's shown at -----
  function measure() {
    const p = document.createElement('div'); p.className = 'mk-body mk-probe'; p.setAttribute('aria-hidden', 'true');
    p.innerHTML = '<div class="mk-grid"><section class="mk-box"><i class="mk-cw"></i></section><section class="mk-box mk-wide"><i class="mk-cw"></i>' +
      '<div class="mk-sms" style="grid-template-columns:minmax(0,1fr)"><div class="mk-sm"><i class="mk-cw"></i></div></div>' +
      '<div class="mx-wrap"><div class="mx-side"></div><div class="mx-main"><i class="mk-cw"></i></div></div></section></div>';
    root.appendChild(p);
    const [half, wide, s1, main] = [...p.querySelectorAll('.mk-cw')].map(e => e.getBoundingClientRect().width), fullW = p.getBoundingClientRect().width, smGap = parseFloat(getComputedStyle(p.querySelector('.mk-sms')).columnGap) || 12;
    p.remove();
    // small multiples: 3 a row on a desktop, 2 on a tablet, 1 on a phone
    Wd = { full: fullW, half: Math.floor(half), wide, smc: wide >= 960 ? 3 : wide >= 520 ? 2 : 1, smPad: wide - s1, smGap, main: Math.floor(main), spark: Math.max(110, Math.min(340, Math.round(wide * .26))) };
    lastW = fullW;
  }

  // ----- the sections -----
  const marketsSec = () => { const h = ctx.markets?.html(Wd); return h ? sec('markets', 'Markets', 'Prices that move Houston real estate, and an honest test of which ones move with Houston’s own numbers.', '<div class="mk-grid">' + h + '</div>') : ''; };
  const SECTIONS = {
    overview: () => overview(stats(), pipe(), rentInfo()), pipeline: () => pipelineSec(pipe()), growth: () => growthSec(stats()), housing: () => housingSec(rentInfo()),
    costs: () => costsSec(), markets: marketsSec, area: () => areaSec(stats())
  };
  function build(id) { growing = []; try { return SECTIONS[id](); } finally { grows.set(id, growing); growing = null; } }
  // side-by-side boxes end level: the shorter box's growable chart gets the difference (all reads, then the writes)
  // (secs: the sections just built; a grown chart is rebuilt from its base height, so only fresh sections are fitted)
  function fit(secs) {
    const jobs = [];
    secs.forEach(sc => {
      const list = grows.get(sc.id.slice(3)); if (!list?.length) return;
      sc.querySelectorAll(':scope > .mk-grid').forEach(grid => {
        const rows = new Map();
        for (const b of grid.children) { if (!b.classList.contains('mk-box') || b.classList.contains('mk-wide')) continue;
          const r = b.getBoundingClientRect(), last = b.lastElementChild, k = Math.round(r.top); (rows.get(k) || rows.set(k, []).get(k)).push({ b, nat: last ? last.getBoundingClientRect().bottom - r.top : 0 }); }
        for (const row of rows.values()) { if (row.length < 2) continue; const hi = Math.max(...row.map(x => x.nat));
          for (const x of row) { const d = Math.floor(hi - x.nat); if (d < 12) continue;
            for (const g of list) { if (g.cap < 12) continue; const el = x.b.querySelector('[data-ck="' + g.ck + '"]'); if (el) { jobs.push({ el, g, d: Math.min(d, 320, g.cap) }); break; } } } }
      });
    });
    jobs.forEach(j => { j.el.outerHTML = j.g.make(j.d); });
  }
  function drawSection(id) {
    const el = root.querySelector('#mk-' + id); if (!el) { full(); return; }
    curStats = stats();
    const html = build(id); if (!html) { el.remove(); return; }
    const t = document.createElement('template'); t.innerHTML = html; const next = t.content.firstElementChild;
    keepState(el, () => morph(el, null, () => { el.innerHTML = next.innerHTML; fit([el]); }));
    if (id === 'area') loadExtras();
  }

  function draw() {
    if (ctx.view !== 'market') return;
    if (!area) {
      root.innerHTML = '<div class="vhead"><div><div class="kicker">Market</div><h2>Growth signals by county</h2></div></div><div class="empty">' + (loadP ? 'Market data isn’t available yet. It’s added by the nightly data refresh.' : 'Loading…') + '</div>' +
        (loadP ? '' : '<div class="mk-skels">' + skel(110) + '<div class="mk-grid">' + skel(220) + skel(220) + '</div></div>');
      load().then(() => { if (area) render(); else if (ctx.view === 'market') { root.querySelector('.empty').textContent = 'Market data isn’t available yet. It’s added by the nightly data refresh.'; root.querySelector('.mk-skels')?.remove(); } });
      return;
    }
    adopt(); measure(); curStats = stats();
    const y0 = root.scrollTop, body = Object.keys(SECTIONS).map(build).join('');
    root.innerHTML = '<div class="vhead mk-vhead"><div><div class="kicker">Market</div><h2>' + esc(areaLabel()) + '</h2>' +
      '<div class="vsub">Construction, growth, housing, costs and markets from free public sources, refreshed nightly' + (area.built ? ' (last ' + new Date(area.built).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')' : '') + '. No sale prices: Texas doesn’t disclose them.</div></div>' +
      '<div class="vctl"><div class="mk-seg" role="group" aria-label="Months shown in monthly charts">' + [[12, '12 mo'], [24, '24 mo'], [0, 'All']].map(([v, l]) => '<button type="button" data-range="' + v + '" aria-pressed="' + (range === v) + '">' + l + '</button>').join('') + '</div>' +
      (ctx.exportMenu ? ctx.exportMenu([{ label: 'Market report · PDF', attrs: ' id="mkExport"' }, { label: 'Market data · CSV', attrs: ' id="mkCsv"' }])
        : '<button class="btn" type="button" id="mkCsv">Export Data</button><button class="btn primary" type="button" id="mkExport">Export PDF</button>') + '</div></div>' +
      scopeHtml() +
      '<nav class="mk-nav" aria-label="Market sections">' + NAV.map(([k, l]) => '<button type="button" data-sec="' + k + '">' + l + '</button>').join('') + '</nav>' +
      '<div class="mk-tip" id="mkTip" role="tooltip"></div><div class="mk-body">' + body + '</div>';
    root.scrollTop = y0;
    fit(root.querySelectorAll('.mk-body > .mk-sec'));
    root.querySelectorAll('.mk-nav [data-sec]').forEach(b => { b.hidden = !root.querySelector('#mk-' + b.dataset.sec); });
    mark(); loadExtras();
  }

  // ----- events: delegated once on the tab (the old per-render binding put four listeners on each of thousands of marks) -----
  const nav = () => root.querySelector('.mk-nav');
  const mark = () => { const n = nav(); if (!n) return; const y = root.scrollTop + n.offsetHeight + 24; let on = null;
    root.querySelectorAll('.mk-body > .mk-sec').forEach(x => { if (x.offsetTop <= y || !on) on = x.id.slice(3); });
    n.querySelectorAll('[data-sec]').forEach(b => b.setAttribute('aria-current', b.dataset.sec === on)); };
  root.addEventListener('scroll', () => { cancelAnimationFrame(navY); navY = requestAnimationFrame(mark); }, { passive: true });
  const secOf = el => el.closest('.mk-sec')?.id.slice(3) || null;
  // click (or Enter on) a bar: pin its breakdown (only its section redraws); roads fly to the map instead
  const act = el => { const [k, i] = String(el.dataset.k || '').split(':'); if (!k) return;
    if (k === 'road') { const r = traffic.get(sel)?.roads?.[+i]; if (r?.lon != null) { ctx.setView('map'); ctx.map.flyTo({ center: [r.lon, r.lat], zoom: 13.5, duration: ctx.reduceMotion ? 0 : 1400 }); ctx.toast?.(title(r.road) + ': ' + fmtN(r.aadt) + ' vehicles a day'); } return; }
    const was = pinSec, here = secOf(el); pin = pin && pin.k === k && pin.i === +i ? null : { k, i: +i }; pinSec = pin ? here : null;
    if (here) section(here); if (was && was !== here) section(was); };
  const openFiling = tr => { const f = ctx.BY_ID?.get(tr.dataset.fid); if (!f) return; ctx.setView('map'); ctx.select?.(f, true); };
  root.addEventListener('click', e => {
    const t = e.target; if (!t.closest) return; let b;
    if ((b = t.closest('.mk-scope2 [data-county]'))) { const v = b.dataset.county; sel = v === sel && v !== 'all' ? 'all' : v; newsPlace = ''; pin = null; pinSec = null; scopeOpen = false; render(); }
    else if ((b = t.closest('[data-range]'))) { // the monthly charts are in Growth and Area & news; a pin elsewhere closes too
      range = +b.dataset.range; root.querySelectorAll('[data-range]').forEach(x => x.setAttribute('aria-pressed', x === b));
      const was = pinSec; pin = null; pinSec = null; section('growth'); section('area'); if (was) section(was); }
    else if ((b = t.closest('[data-show]'))) { const k = b.dataset.show; show[k] = !show[k]; if (!['v', 'p', 'o'].some(x => show[x])) show[k] = true; section('area'); }
    else if (t.closest('#mkExport')) exportReport();
    else if (t.closest('#mkCsv')) exportData();
    else if (t.closest('#mkBrief')) ctx.assistant?.ask('Give me a short market brief for ' + areaLabel() + ': use the market_data tool (it includes the construction pipeline, housing, rents and material costs) and say what stands out for a commercial construction and finishes business: where the work is, what is growing or slowing, and costs. Keep it to a few bullets.');
    else if ((b = t.closest('.mk-nav [data-sec]'))) { const x = root.querySelector('#mk-' + b.dataset.sec); if (x) root.scrollTo({ top: x.offsetTop - nav().offsetHeight - 10, behavior: ctx.reduceMotion ? 'auto' : 'smooth' }); }
    else if ((b = t.closest('[data-act]'))) { const a = b.dataset.act;
      if (a === 'unpin') { const here = secOf(b); pin = null; pinSec = null; if (here) section(here); }
      else if (a === 'jobsmap') { ctx.setView('map'); ctx.showDemographic?.('jobs'); }
      else if (a === 'spendmap') { ctx.setView('map'); ctx.showDemographic?.('sph'); }
      else if (a === 'crimemap') { ctx.setView('map'); ctx.crimeLayer?.(true); } }
    else if ((b = t.closest('[data-k]'))) act(b);
    else if ((b = t.closest('tr[data-fid]'))) openFiling(b);
    else if ((b = t.closest('#mkLatestMore'))) { const h = [...root.querySelectorAll('#mkLatest tbody tr[hidden]')]; h.slice(0, 10).forEach(tr => tr.hidden = false);
      const left = h.length - 10; if (left > 0) b.textContent = 'Show ' + Math.min(10, left) + ' more (' + left + ' left)'; else b.remove(); }
  });
  root.addEventListener('keydown', e => { const t = e.target; if (!t.closest) return;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('[data-k]')) { e.preventDefault(); act(t); }
    else if (e.key === 'Enter' && t.matches('tr[data-fid]')) openFiling(t); });
  root.addEventListener('change', e => { if (e.target.id === 'mkPlace') { newsPlace = e.target.value; section('area'); } });
  root.addEventListener('toggle', e => { if (e.target.classList?.contains('mk-scopebar')) scopeOpen = e.target.open; }, true); // toggle doesn't bubble
  // the hover readout: one listener for every mark. A line chart's single hover strip (.mk-hx, src/mkcharts.js) holds one
  // readout per point: the mouse x picks the nearest point, whose readout shows and whose dot and cross line move there
  let tipOn = false, hxAt = null; const hxData = new WeakMap();
  const tipEl = () => root.querySelector('#mkTip');
  const unhx = () => { if (hxAt) { hxAt.classList.remove('hx-on'); hxAt = null; } };
  const hideTip = () => { const tp = tipEl(); if (tp && tipOn) tp.style.opacity = 0; tipOn = false; unhx(); };
  function hxPoint(el, clientX) {
    let d = hxData.get(el); if (!d) hxData.set(el, d = { tips: el.dataset.tipx.split('\u001f'), py: el.dataset.py.split(',').map(v => v === '' ? NaN : +v), x0: +el.dataset.x0, x1: +el.dataset.x1 });
    const svg = el.ownerSVGElement, r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, n = d.tips.length;
    const vx = (clientX - r.left) * (vb.width || r.width) / (r.width || 1), i = Math.max(0, Math.min(n - 1, Math.round((vx - d.x0) / ((d.x1 - d.x0) || 1) * (n - 1))));
    const cx = (d.x0 + (n > 1 ? i / (n - 1) : 0) * (d.x1 - d.x0)).toFixed(1), dot = svg.querySelector('.mk-hxd'), cross = svg.querySelector('.mk-hxc');
    if (hxAt && hxAt !== svg) unhx(); svg.classList.add('hx-on'); hxAt = svg;
    if (dot) { if (Number.isFinite(d.py[i])) { dot.setAttribute('cx', cx); dot.setAttribute('cy', d.py[i]); } else dot.setAttribute('cx', -99); }
    if (cross) { cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); }
    return d.tips[i];
  }
  root.addEventListener('mousemove', e => {
    const el = e.target.closest?.('.mk-hit'), tp = tipEl(); if (!tp) return;
    if (!el) { hideTip(); return; }
    let text = el.dataset.tip;
    if (el.dataset.tipx != null) text = hxPoint(el, e.clientX); else unhx();
    if (!text) { hideTip(); return; }
    if (tp.textContent !== text) tp.textContent = text; tp.style.opacity = 1; tipOn = true;
    const r = root.getBoundingClientRect(); let x = e.clientX - r.left + root.scrollLeft + 12; if (x + tp.offsetWidth > root.clientWidth - 8) x -= tp.offsetWidth + 24;
    tp.style.left = x + 'px'; tp.style.top = (e.clientY - r.top + root.scrollTop + 14) + 'px';
  });
  root.addEventListener('mouseleave', hideTip);
  root.addEventListener('focusin', e => { const el = e.target.closest?.('.mk-hit'), tp = tipEl(); if (!el || !tp || !el.dataset.tip) return;
    tp.textContent = el.dataset.tip; tp.style.opacity = 1; tipOn = true; const r = root.getBoundingClientRect(), b = el.getBoundingClientRect(); tp.style.left = (b.left - r.left + root.scrollLeft) + 'px'; tp.style.top = (b.bottom - r.top + root.scrollTop + 6) + 'px'; });
  root.addEventListener('focusout', e => { if (e.target.closest?.('.mk-hit')) hideTip(); });
  ctx.markets?.wire(root, { section });
  // a resize (the window, or the page narrowing for the assistant or a card) redraws at the new width, at once, no animation
  let rsT = 0;
  new ResizeObserver(es => { if (ctx.view !== 'market' || !root.querySelector('.mk-body')) return; const w = es[es.length - 1].contentRect.width; if (!w || Math.abs(w - lastW) < 1) return;
    clearTimeout(rsT); rsT = setTimeout(() => { if (ctx.view === 'market' && root.querySelector('.mk-body')) keepState(root, () => instant(root, draw)); }, 150); }).observe(root);
  ctx.onView('market', render);
  // the app's own Houston measures for the Correlation explorer (src/markets.js): monthly, whole region, months finished.
  // Built once per crime data, filings and area data (it reads every filing), so markets.js can cache on it
  let localK = null, localV = null;
  ctx.marketLocalSeries = () => {
    const cur = new Date().toISOString().slice(0, 7), k = [crimeCity, ctx.F, ctx.F?.length || 0, area, cur];
    if (localK && k.every((x, i) => x === localK[i])) return localV;
    localK = k;
    const done = o => fromObject(Object.fromEntries(Object.entries(o).filter(([m]) => m < cur))), out = [];
    if (crimeCity?.months?.length) {
      out.push({ id: 'app-crime', label: 'Houston crime, all offenses (Houston Police)', short: 'Crime', map: done(Object.fromEntries(crimeCity.months.map(m => [m.m, m.v + m.p + m.o]))) });
      out.push({ id: 'app-violent', label: 'Houston violent crime (Houston Police)', short: 'Violent crime', map: done(Object.fromEntries(crimeCity.months.map(m => [m.m, m.v]))) });
    }
    const fl = {}, fv = {}; (ctx.F || []).forEach(f => { const m = String(f.reg || '').slice(0, 7); if (/^\d{4}-\d\d$/.test(m)) { fl[m] = (fl[m] || 0) + 1; fv[m] = (fv[m] || 0) + (f.cost || 0); } });
    if (Object.keys(fl).length) {
      out.push({ id: 'app-filings', label: 'Construction filings registered (TDLR, this app)', short: 'Filings', map: done(fl) });
      out.push({ id: 'app-filingvalue', label: 'Construction value registered (TDLR, this app)', short: 'Filing value', map: done(fv) });
    }
    if (area?.businesses?.months) { const b = {}; Object.values(area.businesses.months).forEach(c => Object.entries(c).forEach(([m, n]) => b[m] = (b[m] || 0) + n));
      out.push({ id: 'app-biz', label: 'New business locations, region (Comptroller)', short: 'New businesses', map: done(b) }); }
    const hou = area?.salesTax?.cities?.Houston?.months; if (hou) out.push({ id: 'app-tax', label: 'City of Houston sales tax (Comptroller)', short: 'Houston sales tax', map: done(hou) });
    return localV = out;
  };

  // ---------- businesses registered at an address (building and filing cards) ----------
  const cache = new Map(), done = new Map(), tkey = (addr, zip, city) => [addr, zip, city].join('|').toUpperCase();
  ctx.tenantsAt = (addr, zip, city) => {
    const k = tkey(addr, zip, city); if (cache.has(k)) return cache.get(k);
    const p = fetch('api/tenants?' + new URLSearchParams({ addr, ...(zip ? { zip } : {}), ...(city ? { city } : {}) })).then(async r => { const d = await readJSON(r); done.set(k, d); return d; });
    p.catch(() => cache.delete(k)); cache.set(k, p); return p;
  };
  // the answer only if that address was already looked up (the News button uses it without starting a lookup)
  ctx.tenantsPeek = (addr, zip, city) => done.get(tkey(addr, zip, city)) || null;
  ctx.renderTenants = (el, d, err) => {
    if (err) { el.innerHTML = '<div class="lt">Registered businesses<span class="src"> (Texas Comptroller)</span></div><div class="rnote err">' + esc(err) + '</div>'; return; }
    const li = t => '<div class="pl"><b>' + esc(t.name) + (t.suite ? ' <span class="sc">Ste ' + esc(t.suite) + '</span>' : '') + '</b><span>' + esc([t.sector, t.owner && 'owner ' + t.owner, t.opened && 'since ' + t.opened].filter(Boolean).join(' · ')) + '</span></div>';
    el.innerHTML = '<div class="lt">Registered businesses<span class="src"> (Texas Comptroller)</span></div>' + (d.tenants.length ? d.tenants.slice(0, 30).map(li).join('') + (d.tenants.length > 30 ? '<div class="rnote">…and ' + (d.tenants.length - 30) + ' more</div>' : '')
      : '<div class="rnote">' + esc(d.note || 'No active sales-tax permits at this address.') + '</div>') + '<div class="rnote">Active sales-tax permits matched on house number and street' + (d.query ? ' (' + esc(d.query) + ')' : '') + '. Lists retail, restaurant and service tenants; offices and medical often aren’t listed.</div>';
  };
  // filings: the street part of "6615 Garth Rd Baytown, TX 77520", and its ZIP
  const filingAddr = ctx.filingAddr = f => { const a = String(f.addr || ''), zip = f.zip || (a.match(/\b(\d{5})(?:-\d{4})?\s*$/) || [])[1] || '', i = f.city ? a.toLowerCase().lastIndexOf(' ' + f.city.toLowerCase()) : -1; return { street: (i > 0 ? a.slice(0, i) : a.split(',')[0]).trim(), zip, city: f.city || '' }; };
  ctx.onCardRender(info => {
    if (info.kind !== 'filing') return;
    const card = document.getElementById('card'); card.querySelector('#tenSec')?.remove();
    const a = filingAddr(info.f); if (!/^\d/.test(a.street)) return;
    const sec = document.createElement('div'); sec.className = 'bsec'; sec.id = 'tenSec';
    sec.innerHTML = '<div class="lt">Businesses at this address</div><button class="btn" type="button">Look Up Registered Businesses</button><div class="rnote">Texas Comptroller sales-tax permits at ' + esc(a.street) + '.</div>';
    const after = card.querySelector('#liveSec') || card.querySelector('#briefBox'); if (after) after.after(sec); else (card.querySelector('.bsrc') || card.lastElementChild)?.before(sec);
    sec.querySelector('button').onclick = async () => {
      sec.innerHTML = '<div class="lt">Registered businesses<span class="src"> (Texas Comptroller)</span></div><div class="rnote loading">Looking up…</div>';
      try { const d = await ctx.tenantsAt(a.street, a.zip, a.city); if (sec.isConnected) ctx.renderTenants(sec, d); } catch (e) { if (sec.isConnected) ctx.renderTenants(sec, null, e.message); }
    };
  });
}
