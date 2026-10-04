// Market view: growth signals per county from data/area.json (built nightly by build/area.mjs) and data/market.json.
//   population (ACS), jobs and industries (LEHD LODES), housing units permitted (Census BPS),
//   new business locations (Texas Comptroller sales-tax permits) and local development news (Google News),
//   Houston crime (Houston Police, api/crime?city=1) and the busiest roads (TxDOT counts, api/traffic).
// Charts are interactive: hover (or focus) for the numbers, click a bar to pin its breakdown under the chart, toggle
// series from the legend, and switch monthly charts between 12 months, 24 months and everything. "Export Report"
// saves a PDF report and "Export Data" a CSV of every series; both are listed on the Reports tab.
// Also the "Businesses registered here" lookup (api/tenants) used by the building and filing cards.
import { SECTORS } from './lib/sectors.mjs';
import { CAT_LABEL } from './lib/spending.mjs';
import { reportDoc, savePdf } from './reportkit.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function initArea(ctx) {
  const { esc, fmtN, fmtM } = ctx, root = document.getElementById('view-market');
  let area = null, market = null, loadP = null, sel = 'all', newsPlace = '';
  let range = 24, pin = null; const show = { sf: true, mf: true, v: true, p: true, o: true };
  // crime (City of Houston, the same for the region and the three counties it spans) and traffic (per area), fetched once
  const HOU = new Set(['48201', '48157', '48339']), traffic = new Map(); let crimeCity;
  const wantCrime = () => sel === 'all' || HOU.has(sel);
  function areaBox() {
    const names = new Set(fipsList().map(cname)), geos = (ctx.countyGeo || []).filter(c => names.has(c.name)); if (!geos.length) return null;
    let w = 180, so = 90, e = -180, n = -90; for (const g of geos) for (const poly of g.geom.coordinates) for (const ring of poly) for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); so = Math.min(so, y); n = Math.max(n, y); }
    return [w, so, e, n].map(v => +v.toFixed(3));
  }
  function loadExtras() {
    const k = sel;
    if (wantCrime() && crimeCity === undefined) { crimeCity = null; fetch('api/crime?city=1').then(async r => { const d = await r.json(); crimeCity = r.ok ? d : { error: d.error || 'unavailable' }; }).catch(e => { crimeCity = { error: e.message }; }).then(() => { if (ctx.view === 'market') render(); }); }
    if (!traffic.has(k)) { const b = areaBox(); if (!b) return; traffic.set(k, null);
      fetch('api/traffic?bbox=' + b.join(',')).then(async r => { const d = await r.json(); traffic.set(k, r.ok ? d : { error: d.error || 'unavailable' }); }).catch(e => traffic.set(k, { error: e.message })).then(() => { if (ctx.view === 'market' && sel === k) render(); }); }
  }
  const load = () => loadP ||= Promise.all([
    fetch('data/area.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('data/market.json').then(r => r.ok ? r.json() : null).catch(() => null)
  ]).then(([a, m]) => { area = a; market = m; });
  ctx.areaData = () => load().then(() => area);
  ctx.areaInfo = () => area ? { built: area.built, jobs: area.jobs, permits: !!area.permits, businesses: !!area.businesses, news: !!area.news, salesTax: area.salesTax ? { cities: Object.keys(area.salesTax.cities || {}).length, since: area.salesTax.since } : null,
    unemployment: area.unemployment?.state?.period || null, rates: area.rates?.series?.t10?.date || null, rents: area.rents?.latest || null, mortgages: area.mortgages?.year || null } : null;
  // the Market view's numbers for one county (name or FIPS) or the whole region, for the assistant (market_data)
  ctx.marketData = async county => {
    await load(); if (!area) return { error: 'The market data (jobs, permits, new businesses, news) hasn’t been built yet. It fills in after the nightly data refresh.' };
    const c = county && area.counties.find(x => x.fips === county || x.name.toLowerCase() === String(county).toLowerCase().replace(/\s*county.*$/, ''));
    if (county && !c) return { error: 'No market data for “' + county + '”. Counties covered: ' + area.counties.map(x => x.name).join(', ') + '.' };
    const keepSel = sel, keepPlace = newsPlace; sel = c ? c.fips : 'all'; newsPlace = '';
    try { return { area: c ? c.name + ' County' : 'all ' + area.counties.length + ' counties', built: area.built, ...stats() }; } finally { sel = keepSel; newsPlace = keepPlace; }
  };

  const pct = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)) + '%';
  const chg = (a, b) => a != null && b ? (a - b) / b * 100 : null;
  const fipsList = () => sel === 'all' ? area.counties.map(c => c.fips) : [sel];
  const cname = f => area.counties.find(c => c.fips === f)?.name || f;
  const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);

  // ---------- numbers for the selected county (or the whole region) ----------
  function stats() {
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
      out.permits = years.map(y => ({ y, sf: sum(F, f => P.years[y]?.[f]?.sf), mf: sum(F, f => P.years[y]?.[f]?.mf), value: sum(F, f => P.years[y]?.[f]?.value), has: F.some(f => P.years[y]?.[f]) })).filter(r => r.has);
      if (P.ytd) out.ytd = { year: P.ytd.year, month: P.ytd.month, n: sum(F, f => (P.ytd.cur?.[f]?.sf || 0) + (P.ytd.cur?.[f]?.mf || 0)), prior: P.ytd.prior ? sum(F, f => (P.ytd.prior[f]?.sf || 0) + (P.ytd.prior[f]?.mf || 0)) : null };
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

  // ---------- charts (inline SVG; hover via data-tip; every chart also has a table) ----------
  let W = 520; const H = 170, PADL = 44, PADB = 22, PADT = 8;
  const nice = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p; };
  function axis(max, fmt = fmtN) {
    const top = nice(max), ticks = [0, top / 2, top];
    return { top, html: ticks.map(t => { const y = PADT + (H - PADT - PADB) * (1 - t / top); return '<line class="mk-grid" x1="' + PADL + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text class="mk-ax" x="' + (PADL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + fmt(t) + '</text>'; }).join('') };
  }
  // bars with a flat baseline and rounded data end: a path with only the top corners rounded
  const bar = (x, y, w, h, r = 3) => { if (h <= 0) return ''; r = Math.min(r, w / 2, h); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; };
  function permitsChart(rows) {
    const SF = r => show.sf ? r.sf : 0, MF = r => show.mf ? r.mf : 0;
    const max = Math.max(1, ...rows.map(r => SF(r) + MF(r))), ax = axis(max), plotH = H - PADT - PADB, bw = (W - PADL - 8) / rows.length, w = Math.min(46, bw * .62);
    const marks = rows.map((r, i) => {
      const x = PADL + 8 + i * bw + (bw - w) / 2, hs = SF(r) / ax.top * plotH, hm = MF(r) / ax.top * plotH, base = PADT + plotH, gap = hs && hm ? 2 : 0;
      const tip = esc(r.y + ': ' + fmtN(r.sf + r.mf) + ' units · single-family ' + fmtN(r.sf) + ' · multifamily ' + fmtN(r.mf) + ' · value ' + fmtM(r.value));
      return '<g class="mk-hit' + (pin?.k === 'permits' && pin.i === i ? ' on' : '') + '" tabindex="0" data-k="permits:' + i + '" data-tip="' + tip + '"><rect x="' + (x - 4) + '" y="' + PADT + '" width="' + (w + 8) + '" height="' + plotH + '" fill="transparent"/>' +
        (hm ? '<path class="mk-sf" d="M' + x + ',' + base + 'h' + w + 'v' + (-hs) + 'h' + (-w) + 'Z"/>' : '<path class="mk-sf" d="' + bar(x, base - hs, w, hs) + '"/>') +
        (hm ? '<path class="mk-mf" d="' + bar(x, base - hs - gap - hm, w, hm) + '"/>' : '') +
        '<text class="mk-ax" x="' + (x + w / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + r.y + '</text></g>';
    }).join('');
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Housing units permitted per year">' + ax.html + marks + '</svg>';
  }
  // the monthly charts show the last 12 or 24 months, or everything (the range switch); the index keys stay global
  const ranged = rows => range ? rows.slice(-range) : rows;
  function bizChart(all, unit = 'new locations', fmt = fmtN, key = 'biz') {
    const off = Math.max(0, all.length - (range || all.length)), rows = ranged(all);
    const max = Math.max(1, ...rows.map(r => r.n)), ax = axis(max, fmt), plotH = H - PADT - PADB, bw = (W - PADL - 8) / rows.length, w = Math.max(2, bw - 2), cur = new Date().toISOString().slice(0, 7), firstJan = rows.findIndex(r => r.m.endsWith('-01'));
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="New business locations per month">' + ax.html + rows.map((r, i) => {
      const x = PADL + 8 + i * bw, h = r.n / ax.top * plotH, [yy, mm] = r.m.split('-'), lbl = MON[+mm - 1] + ' ' + yy, partial = r.m >= cur;
      return '<g class="mk-hit' + (pin?.k === key && pin.i === i + off ? ' on' : '') + '" tabindex="0" data-k="' + key + ':' + (i + off) + '" data-tip="' + esc(lbl + ': ' + fmt(r.n) + ' ' + unit + (partial ? ' (month in progress)' : '')) + '"><rect x="' + x + '" y="' + PADT + '" width="' + bw + '" height="' + plotH + '" fill="transparent"/>' +
        '<path class="' + (partial ? 'mk-part' : 'mk-sf') + '" d="' + bar(x, PADT + plotH - h, w, h, 2) + '"/>' + (mm === '01' || (i === 0 && firstJan >= 4) ? '<text class="mk-ax" x="' + x + '" y="' + (H - 6) + '">' + (mm === '01' ? yy : lbl) + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }
  // horizontal bars: [{ label, v, tip, k }]; clicking one pins its breakdown (or acts, for roads)
  function hbars(items, fmt) {
    const max = Math.max(1, ...items.map(x => x.v));
    return '<div class="mk-hbars">' + items.map(x => '<div class="mk-hb mk-hit' + (pin && x.k === pin.k + ':' + pin.i ? ' on' : '') + '" tabindex="0"' + (x.k ? ' data-k="' + esc(x.k) + '"' : '') + ' data-tip="' + esc(x.tip) + '"><span>' + esc(x.label) + '</span><i><b style="width:' + (x.v / max * 100).toFixed(1) + '%"></b></i><em>' + esc(fmt(x.v)) + '</em></div>').join('') + '</div>';
  }
  function catBars(obj, fmt) {
    const top = Object.entries(obj).sort((a, b) => b[1] - a[1]), tot = top.reduce((a, [, v]) => a + v, 0) || 1;
    return hbars(top.map(([k, v], i) => ({ label: k, v, k: 'spend:' + i, tip: k + ': ' + fmt(v) + ' a year (' + Math.round(v / tot * 100) + '% of these categories)' })), fmt);
  }
  function sectorBars(sec) {
    const tot = sec.reduce((s, v) => s + v, 0) || 1, top = sec.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return hbars(top.map(([i, v]) => ({ label: SECTORS[i][1], v, k: 'sector:' + i, tip: SECTORS[i][1] + ': ' + fmtN(v) + ' jobs (' + Math.round(v / tot * 100) + '%)' })), fmtN);
  }
  // crime per month, stacked violent / property / other (each series can be switched off from the legend)
  const CR = { v: '#c03b3a', p: '#d9822b', o: '#8a9396' };
  function crimeChart(all) {
    const off = Math.max(0, all.length - (range || all.length)), rows = ranged(all), keys = ['v', 'p', 'o'].filter(k => show[k]);
    const tot = r => keys.reduce((a, k) => a + r[k], 0), max = Math.max(1, ...rows.map(tot)), ax = axis(max), plotH = H - PADT - PADB, bw = (W - PADL - 8) / rows.length, w = Math.max(2, bw - 2);
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Crime incidents per month">' + ax.html + rows.map((r, i) => {
      const x = PADL + 8 + i * bw, [yy, mm] = r.m.split('-'); let y = PADT + plotH;
      const segs = keys.map(k => { const h = r[k] / ax.top * plotH; y -= h; return h > 0 ? '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="' + w + '" height="' + h.toFixed(1) + '" fill="' + CR[k] + '"' + (k === 'o' ? ' fill-opacity=".6"' : '') + '/>' : ''; }).join('');
      return '<g class="mk-hit' + (pin?.k === 'crime' && pin.i === i + off ? ' on' : '') + '" tabindex="0" data-k="crime:' + (i + off) + '" data-tip="' + esc(MON[+mm - 1] + ' ' + yy + ': ' + fmtN(r.v + r.p + r.o) + ' incidents · violent ' + fmtN(r.v) + ' · property ' + fmtN(r.p) + ' · other ' + fmtN(r.o)) + '"><rect x="' + x + '" y="' + PADT + '" width="' + bw + '" height="' + plotH + '" fill="transparent"/>' + segs +
        (mm === '01' ? '<text class="mk-ax" x="' + x + '" y="' + (H - 6) + '">' + yy + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }
  // unemployment: the county's rate, or the Houston metro's for the whole region (BLS LAUS, nightly)
  function unempTile() {
    const u = area.unemployment; if (!u) return '';
    const c = sel !== 'all' && u.counties?.[sel], m = u.metros?.['26420'], x = c || m; if (!x) return '';
    return tile(x.rate + '%', 'Unemployment', (c ? cname(sel) + ' County' : 'Houston metro') + ', ' + MON[+x.period.slice(5) - 1] + ' ' + x.period.slice(0, 4) + (x.yearAgo != null ? ' · ' + x.yearAgo + '% a year earlier' : '') + (u.state ? ' · Texas ' + u.state.rate + '%' : ''));
  }
  // rates and home lending (FRED, New York Fed, CFPB HMDA)
  function spark(pts) {
    if (!pts?.length) return ''; const w = 120, h = 28, vs = pts.map(p => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), k = hi - lo || 1;
    return '<svg class="mk-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="' + pts.map((p, i) => (i / Math.max(1, pts.length - 1) * w).toFixed(1) + ',' + (h - 2 - (p[1] - lo) / k * (h - 4)).toFixed(1)).join(' ') + '"/></svg>';
  }
  function ratesBox() {
    const r = area.rates?.series, mg = area.mortgages; if (!r && !mg) return '';
    const rows = ['t10', 't5', 'sofr', 'm30'].filter(k => r?.[k]).map(k => { const x = r[k], d = x.yearAgo != null ? x.value - x.yearAgo : null;
      return '<tr><td>' + esc(x.label) + '</td><td class="m r"><b>' + x.value.toFixed(2) + '%</b></td><td class="m r">' + (d == null ? '—' : (d > 0 ? '+' : '') + d.toFixed(2)) + '</td><td>' + spark(x.weekly) + '</td><td class="m">' + esc(MON[+x.date.slice(5, 7) - 1] + ' ' + +x.date.slice(8)) + '</td></tr>'; }).join('');
    const F = fipsList().filter(f => mg?.counties?.[f]), loans = sum(F, f => mg.counties[f].loans), dollars = sum(F, f => mg.counties[f].dollars), purch = sum(F, f => mg.counties[f].purchase), prior = sum(F, f => mg.counties[f].priorLoans);
    return '<section class="mk-box"><h3>Rates and home lending</h3>' + (rows ? '<table class="mk-rates"><thead><tr><th>Rate</th><th class="r">Now</th><th class="r">1-yr change</th><th>Last 12 months</th><th>As of</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') +
      (F.length && loans ? '<div class="kgrid mk-kg"><div><b>' + fmtN(loans) + '</b><span>Home loans made ' + mg.year + (prior ? ' (' + pct(chg(loans, prior)) + ')' : '') + '</span></div><div><b>' + fmtM(dollars) + '</b><span>Loan dollars ' + mg.year + '</span></div><div><b>' + fmtN(purch) + '</b><span>Home purchase loans</span></div><div><b>' + fmtM(loans ? dollars / loans : 0) + '</b><span>Average loan</span></div></div>' : '') +
      '<div class="rnote">Treasury and mortgage rates move underwriting: loan rate ≈ an index plus a lender spread.<span class="src"> FRED (St. Louis Fed), New York Fed SOFR, Freddie Mac PMMS; home loans from CFPB HMDA (originated 1–4 family loans, published yearly).</span></div></section>';
  }
  const tile = (v, label, sub) => '<div class="kpi"><b>' + v + '</b><span>' + esc(label) + '</span>' + (sub ? '<div class="mk-sub">' + esc(sub) + '</div>' : '') + '</div>';

  // ---------- interactivity: legend toggles, pinned breakdowns ----------
  const legBtn = (k, cls, label, color) => '<button type="button" class="mk-lb" data-show="' + k + '" aria-pressed="' + show[k] + '"><i class="' + cls + '"' + (color ? ' style="background:' + color + '"' : '') + '></i>' + esc(label) + '</button>';
  const monthLabel = m => { const [y, mm] = String(m).split('-'); return MON[+mm - 1] + ' ' + y; };
  const lastYear = (rows, i) => { const m = rows[i].m, want = (+m.slice(0, 4) - 1) + m.slice(4); return rows.find(r => r.m === want); };
  const title = t => /[a-z]/.test(t) ? t : String(t).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Us|Sh|Fm|Ih)\b/g, x => x.toUpperCase());
  function pinned(k, s) {
    const hint = '<div class="mk-hint">Click a bar for its breakdown.</div>';
    if (!pin || pin.k !== k) return hint;
    let h = '';
    if (k === 'permits') {
      const r = s.permits?.[pin.i], p = s.permits?.[pin.i - 1]; if (!r) return hint; const t = r.sf + r.mf;
      h = '<b>' + r.y + '</b>: ' + fmtN(t) + ' homes permitted' + (p ? ' (' + pct(chg(t, p.sf + p.mf)) + ' vs ' + p.y + ')' : '') + ' · single-family ' + fmtN(r.sf) + ' (' + Math.round(r.sf / (t || 1) * 100) + '%) · multifamily ' + fmtN(r.mf) + ' · value ' + fmtM(r.value) + (t ? ' · about ' + fmtM(r.value / t) + ' a home' : '');
    } else if (k === 'biz' || k === 'tax' || k === 'crime') {
      const rows = k === 'biz' ? s.biz : k === 'tax' ? s.tax : crimeCity?.months, r = rows?.[pin.i]; if (!r) return hint;
      const val = x => k === 'crime' ? x.v + x.p + x.o : x.n, ly = lastYear(rows, pin.i), f = k === 'tax' ? fmtM : fmtN;
      h = '<b>' + monthLabel(r.m) + '</b>: ' + f(val(r)) + (k === 'biz' ? ' new business locations' : k === 'tax' ? ' in city sales tax' : ' incidents') + (ly ? ' (' + pct(chg(val(r), val(ly))) + ' vs ' + monthLabel(ly.m) + ')' : '');
      if (k === 'crime') h += ' · violent ' + fmtN(r.v) + ' · property ' + fmtN(r.p) + ' · other ' + fmtN(r.o);
      if (k === 'biz') { const list = (s.latest || []).filter(b => String(b.date).startsWith(r.m)).slice(0, 8); if (list.length) h += '<div class="mk-pl">' + list.map(b => '<span>' + esc(b.name) + ' <em>' + esc(b.city || b.county || '') + '</em></span>').join('') + '</div>'; }
      if (k === 'tax') { const names = new Set(fipsList().map(cname)), top = Object.entries(area.salesTax?.cities || {}).filter(([, c]) => names.has(c.county) && c.months[r.m]).map(([n, c]) => [n, c.months[r.m]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
        if (top.length) h += '<div class="mk-pl">' + top.map(([n, v]) => '<span>' + esc(n) + ' <em>' + fmtM(v) + '</em></span>').join('') + '</div>'; }
    } else if (k === 'sector') {
      const v = s.jobs?.sec?.[pin.i]; if (v == null) return hint; const tot = s.jobs.sec.reduce((a, x) => a + x, 0) || 1;
      h = '<b>' + esc(SECTORS[pin.i][1]) + '</b>: ' + fmtN(v) + ' jobs, ' + Math.round(v / tot * 100) + '% of the jobs located here. <button class="lnk" type="button" data-act="jobsmap">Map jobs by census tract</button>';
    } else if (k === 'spend') {
      const e = Object.entries(s.spend?.cats || {}).sort((a, b) => b[1] - a[1])[pin.i]; if (!e) return hint; const tot = Object.values(s.spend.cats).reduce((a, x) => a + x, 0) || 1;
      h = '<b>' + esc(CAT_LABEL[e[0]] || e[0]) + '</b>: ' + fmtM(e[1]) + ' a year (' + Math.round(e[1] / tot * 100) + '% of these categories)' + (s.spend.perHH && s.spend.total ? ' · about ' + fmtM(e[1] / s.spend.total * s.spend.perHH) + ' per household' : '') + '. <button class="lnk" type="button" data-act="spendmap">Map spending by census tract</button>';
    } else if (k === 'city') {
      const c = s.taxCities?.[pin.i]; if (!c) return hint;
      h = '<b>' + esc(c.city) + '</b> (' + esc(c.county) + ' County): ' + (c.last12 != null ? fmtM(c.last12) : '—') + ' in city sales tax over the last 12 months' + (c.prior12 ? ', ' + fmtM(c.prior12) + ' the 12 before (' + pct(chg(c.last12, c.prior12)) + ')' : '') + '.';
    } else if (k === 'offense') {
      const o = crimeCity?.offenses?.[pin.i]; if (!o) return hint; const tot = crimeCity.last12.total || 1;
      h = '<b>' + esc(o.name) + '</b>: ' + fmtN(o.n) + ' incidents in 12 months (' + (o.n / tot * 100).toFixed(1) + '% of all) · ' + esc({ v: 'violent', p: 'property', o: 'other' }[o.cat] || '') + '. <button class="lnk" type="button" data-act="crimemap">Show the crime map layer</button>';
    } else if (k === 'rtype') {
      const g = traffic.get(sel)?.types?.[pin.i]; if (!g) return hint;
      h = '<b>' + esc(g.label) + '</b>: ' + fmtN(g.avg) + ' vehicles a day on an average counted segment, ' + fmtN(g.segments) + ' segments counted, busiest ' + fmtN(g.max) + ' a day.';
    }
    return '<div class="mk-pin">' + h + ' <button class="lnk mk-x" type="button" data-act="unpin" aria-label="Close">×</button></div>';
  }
  const box = (t, html) => '<section class="mk-box"><h3>' + t + '</h3>' + html + '</section>';
  function crimeBox(s) {
    if (!wantCrime()) return '';
    const d = crimeCity;
    if (!d) return box('Crime · City of Houston', '<div class="rnote">Counting incidents…</div>');
    if (d.error || !d.latest) return box('Crime · City of Houston', '<div class="rnote">' + esc(d.error || d.note || 'No crime data loaded yet.') + '</div>');
    const L = d.last12;
    return '<section class="mk-box"><h3>Crime · City of Houston</h3><div class="kgrid mk-kg"><div><b>' + fmtN(L.total) + '</b><span>Incidents, 12 months · ' + pct(d.change.total) + '</span></div><div><b style="color:' + CR.v + '">' + fmtN(L.v) + '</b><span>Violent · ' + pct(d.change.v) + '</span></div>' +
      '<div><b style="color:' + CR.p + '">' + fmtN(L.p) + '</b><span>Property · ' + pct(d.change.p) + '</span></div><div><b>' + fmtN(d.per_sqmi?.total) + '</b><span>Per sq mi a year</span></div></div>' +
      '<div class="mk-leg">' + legBtn('v', '', 'Violent', CR.v) + legBtn('p', '', 'Property', CR.p) + legBtn('o', '', 'Other', CR.o) + '</div>' + crimeChart(d.months || []) + pinned('crime', s) +
      '<h4 class="mk-h4">Most reported offenses, last 12 months</h4>' + hbars((d.offenses || []).slice(0, 8).map((o, i) => ({ label: o.name, v: o.n, k: 'offense:' + i, tip: o.name + ': ' + fmtN(o.n) + ' incidents' })), fmtN) + pinned('offense', s) +
      '<div class="rnote">Houston Police incidents (NIBRS) through ' + esc(monthLabel(d.latest.slice(0, 7))) + ', compared with the 12 months before; the file runs about three months behind. City of Houston only' + (sel === 'all' ? '' : ' (part of ' + esc(cname(sel)) + ' County)') + '.</div></section>';
  }
  function trafficBox(s) {
    const t = traffic.get(sel); if (t === undefined) return '';
    if (!t) return box('Busiest roads', '<div class="rnote">Loading TxDOT traffic counts…</div>');
    if (t.error) return box('Busiest roads', '<div class="rnote">' + esc(t.error) + '</div>');
    return '<section class="mk-box"><h3>Busiest roads</h3>' + hbars(t.roads.slice(0, 10).map((r, i) => ({ label: title(r.road), v: r.aadt, k: 'road:' + i, tip: title(r.road) + ': ' + fmtN(r.aadt) + ' vehicles a day at its busiest counted point. Click to see it on the map.' })), fmtN) +
      '<h4 class="mk-h4">Average daily traffic by road type</h4>' + hbars(t.types.slice(0, 8).map((g, i) => ({ label: g.label, v: g.avg, k: 'rtype:' + i, tip: g.label + ': ' + fmtN(g.avg) + ' vehicles a day on average' })), fmtN) + pinned('rtype', s) +
      '<div class="rnote">TxDOT annual average daily traffic (AADT) counts' + (t.as_of ? ', published ' + esc(t.as_of) : '') + '. TxDOT publishes the current year only, so this shows how busy roads are, not how traffic is changing. Live traffic is under Map Layers.</div></section>';
  }

  // ---------- export: the view as a PDF report and every series as CSV ----------
  const areaLabel = () => sel === 'all' ? 'Houston region (' + area.counties.length + ' counties)' : cname(sel) + ' County';
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  async function exportReport() {
    if (!area) return; if (ctx.view !== 'market') { ctx.setView('market'); await new Promise(r => setTimeout(r, 60)); }
    const label = areaLabel();
    const kp = root.querySelector('.mk-kpis')?.outerHTML || '', grid = root.querySelector('.mk-grid')?.cloneNode(true);
    if (grid) {
      grid.querySelectorAll('.mk-hint,.mk-pin,.mk-ctl,select,button.lnk').forEach(e => e.remove());
      grid.querySelectorAll('details').forEach(d => d.open = true);
      grid.querySelectorAll('.mk-lb').forEach(b => { const sp = document.createElement('span'); sp.innerHTML = b.innerHTML; if (b.getAttribute('aria-pressed') === 'false') sp.style.opacity = '.35'; b.replaceWith(sp); });
      grid.querySelectorAll('[tabindex],[data-k],[data-tip]').forEach(e => { e.removeAttribute('tabindex'); e.removeAttribute('data-k'); e.removeAttribute('data-tip'); });
    }
    const css = '.kpis{display:grid;border:1px solid #e8ebeb;border-radius:6px;margin:16px 0;break-inside:avoid}.kpi{padding:10px 12px;border-left:1px solid #e8ebeb}.kpi:first-child{border-left:3px solid #006527}' +
      '.kpi b{display:block;font-family:"IBM Plex Mono",monospace;font-size:16px;font-weight:600;color:#0b0d0c}.kpi span{display:block;font-family:"IBM Plex Mono",monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:#6b7174;margin-top:3px}.mk-sub{color:#6b7174;font-size:9px;margin-top:2px}' +
      '.mk-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mk-box{border:1px solid #e8ebeb;border-radius:6px;padding:12px 14px;break-inside:avoid}.mk-wide{grid-column:1/-1}.mk-box h3{position:relative;padding-left:10px}.mk-box h3:before{content:"";position:absolute;left:0;top:2px;bottom:2px;width:3px;background:#006527;border-radius:1px}.mk-h4{font-size:10.5px;font-weight:700;margin:12px 0 6px}' +
      '.mk-svg{width:100%;height:auto;display:block;overflow:visible}line.mk-grid{stroke:#e8ebeb}.mk-ax{font-family:"IBM Plex Mono",monospace;font-size:10px;fill:#6b7174}path.mk-sf{fill:#006527}path.mk-mf{fill:#2a78d6}path.mk-part{fill:rgba(0,101,39,.35)}' +
      '.mk-leg{display:flex;flex-wrap:wrap;gap:12px;font-size:9.5px;color:#4d5457;margin-bottom:4px}.mk-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}.mk-leg i.mk-sf{background:#006527}.mk-leg i.mk-mf{background:#2a78d6}' +
      '.mk-hbars{display:grid;gap:5px}.mk-hb{display:grid;grid-template-columns:minmax(100px,40%) 1fr auto;gap:8px;align-items:center;font-size:9.5px}.mk-hb span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#4d5457}.mk-hb i{display:block;height:8px}.mk-hb i b{display:block;height:100%;background:#006527;border-radius:0 3px 3px 0}.mk-hb em{font-style:normal;font-family:"IBM Plex Mono",monospace;font-size:9px}' +
      '.mk-box .kgrid{margin:0 0 8px}.mk-box .kgrid b{font-size:13px}.chitem{display:block;color:inherit;font-weight:400;text-decoration:none;padding:4px 0;border-top:1px solid #e8ebeb}.chitem em{display:block;font-style:normal;color:#6b7174;font-size:9px}.src{display:none}';
    const html = reportDoc({ kicker: 'Market report', title: label, meta: (range ? 'Monthly charts: last ' + range + ' months' : 'Monthly charts: all months') + (area.built ? ' · data built ' + esc(new Date(area.built).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : ''), css,
      body: kp + '<div class="mk-grid">' + (grid ? grid.innerHTML : '') + '</div>',
      sources: 'US Census (ACS, Building Permits Survey, LEHD LODES), BLS, Texas Comptroller, Houston Police (NIBRS), TxDOT, FRED, New York Fed, CFPB HMDA, Google News. Estimates are labelled as such in each section.' });
    return savePdf(ctx, 'market', label, html);
  }
  async function exportData() {
    if (!area) return; const s = stats(), label = areaLabel(), rows = [], add = (section, item, value, note = '') => rows.push({ Area: label, Section: section, Item: item, Value: value, Note: note });
    if (s.pop) add('Population', 'Population (ACS ' + s.pop.year + ')', s.pop.n, s.pop.gr != null ? pct(s.pop.gr) + ' since ' + s.pop.baseYear : '');
    (s.permits || []).forEach(r => { add('Housing permits', r.y + ' single-family units', r.sf); add('Housing permits', r.y + ' multifamily units', r.mf); add('Housing permits', r.y + ' value', r.value); });
    (s.biz || []).forEach(r => add('New business locations', r.m, r.n));
    if (s.jobs) s.jobs.sec.forEach((v, i) => add('Jobs by industry (' + s.jobs.year + ')', SECTORS[i][1], v));
    if (s.spend) Object.entries(s.spend.cats).forEach(([k, v]) => add('Consumer spending a year (estimate)', CAT_LABEL[k] || k, Math.round(v)));
    (s.tax || []).forEach(r => add('City sales tax per month', r.m, Math.round(r.n)));
    (s.taxCities || []).forEach(c => add('City sales tax, last 12 months', c.city + ' (' + c.county + ')', c.last12 != null ? Math.round(c.last12) : '', c.prior12 ? pct(chg(c.last12, c.prior12)) + ' vs prior 12' : ''));
    if (wantCrime() && crimeCity?.latest) { crimeCity.months.forEach(m => { add('Crime per month (City of Houston)', m.m + ' violent', m.v); add('Crime per month (City of Houston)', m.m + ' property', m.p); add('Crime per month (City of Houston)', m.m + ' other', m.o); });
      crimeCity.offenses.forEach(o => add('Crime offenses, last 12 months (City of Houston)', o.name, o.n)); }
    const t = traffic.get(sel); if (t?.roads) { t.roads.forEach(r => add('Busiest roads (TxDOT AADT)', title(r.road), r.aadt, r.lat != null ? r.lat.toFixed(4) + ', ' + r.lon.toFixed(4) : '')); t.types.forEach(g => add('Average daily traffic by road type', g.label, g.avg, fmtN(g.segments) + ' segments')); }
    Object.values(area.rates?.series || {}).forEach(x => add('Rates', x.label, x.value, 'as of ' + x.date));
    ctx.exportMeta = { report: 'market', format: 'csv', scope: label };
    try { await ctx.exportCsv(rows, 'market-data-' + slug(label) + '-' + new Date().toISOString().slice(0, 10)); } finally { ctx.exportMeta = null; }
  }
  ctx.exportMarket = async (format = 'html', county) => { await load(); if (county) { const c = area?.counties.find(x => x.fips === county || x.name.toLowerCase() === String(county).toLowerCase()); if (c) sel = c.fips; }
    if (format === 'csv') return exportData(); ctx.setView('market'); await new Promise(r => setTimeout(r, 120)); return exportReport(); };

  function render() {
    if (ctx.view !== 'market') return;
    if (!area) {
      root.innerHTML = '<div class="vhead"><div><div class="kicker">Market</div><h2>Growth signals by county</h2></div></div><div class="empty">' + (loadP ? 'Market data isn’t available yet. It’s added by the nightly data refresh.' : 'Loading…') + '</div>';
      load().then(() => { if (area) render(); else if (ctx.view === 'market') root.querySelector('.empty').textContent = 'Market data isn’t available yet. It’s added by the nightly data refresh.'; });
      return;
    }
    W = Math.max(300, Math.min(520, (root.clientWidth || 520) - (root.clientWidth > 900 ? root.clientWidth / 2 + 40 : 70)));
    const s = stats(), last = s.permits?.[s.permits.length - 1], prev = s.permits?.[s.permits.length - 2];
    const last12 = s.biz ? s.biz.filter(r => r.m < new Date().toISOString().slice(0, 7)).slice(-12) : [];
    const tiles = [
      s.pop ? tile(fmtN(s.pop.n), 'Population', pct(s.pop.gr) + ' since ' + s.pop.baseYear + ' (ACS ' + s.pop.year + ')') : '',
      s.jobs ? tile(fmtN(s.jobs.n), 'Jobs located here', (s.jobs.gr != null ? pct(s.jobs.gr) + ' since ' + s.jobs.baseYear + ' · ' : '') + 'LODES ' + s.jobs.year) : '',
      last ? tile(fmtN(last.sf + last.mf), 'Homes permitted ' + last.y, prev ? pct(chg(last.sf + last.mf, prev.sf + prev.mf)) + ' vs ' + prev.y : '') : '',
      s.ytd ? tile(fmtN(s.ytd.n), 'Homes permitted ' + s.ytd.year + ' YTD', 'Jan–' + MON[s.ytd.month - 1] + (s.ytd.prior ? ' · ' + pct(chg(s.ytd.n, s.ytd.prior)) + ' vs same months ' + (s.ytd.year - 1) : '')) : '',
      last12.length ? tile(fmtN(sum(last12, r => r.n)), 'New businesses', 'Last ' + last12.length + ' months, still open') : '',
      unempTile(),
      s.spend ? tile(fmtM(s.spend.total), 'Consumer spending (est.)', (s.spend.perHH ? fmtM(s.spend.perHH) + ' per household · ' : '') + 'a year') : ''
    ].filter(Boolean);
    const opts = '<option value="all">Whole region</option>' + area.counties.map(c => '<option value="' + c.fips + '"' + (sel === c.fips ? ' selected' : '') + '>' + esc(c.name) + ' County</option>').join('');
    const placeOpts = s.places ? '<option value="">All places</option>' + s.places.map(p => '<option value="' + esc(p.key) + '"' + (newsPlace === p.key ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('') : '';
    root.innerHTML = '<div class="vhead"><div><div class="kicker">Market</div><h2>Growth signals ' + (sel === 'all' ? 'across the region' : 'in ' + esc(cname(sel)) + ' County') + '</h2>' +
      '<div class="vsub">Jobs, housing permits, new businesses, consumer spending, city sales tax and local development news from free public sources, refreshed with the nightly build' + (area.built ? ' (last ' + new Date(area.built).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')' : '') + '. No sales or lease comps: Texas doesn’t disclose sale prices.</div></div>' +
      '<div class="vctl"><label>Area <select class="chip" id="mkCounty">' + opts.replace('value="all"', 'value="all"' + (sel === 'all' ? ' selected' : '')) + '</select></label>' +
      '<div class="mk-seg" role="group" aria-label="Months shown">' + [[12, '12 mo'], [24, '24 mo'], [0, 'All']].map(([v, l]) => '<button type="button" data-range="' + v + '" aria-pressed="' + (range === v) + '">' + l + '</button>').join('') + '</div>' +
      '<button class="btn" type="button" id="mkCsv">Export Data</button><button class="btn primary" type="button" id="mkExport">Export PDF</button></div></div>' +
      (tiles.length ? '<div class="kpis mk-kpis" style="grid-template-columns:repeat(' + tiles.length + ',1fr)">' + tiles.join('') + '</div>' : '') +
      '<div class="mk-tip" id="mkTip" role="tooltip"></div><div class="mk-grid">' +
      (s.permits?.length ? '<section class="mk-box"><h3>New housing units permitted per year</h3><div class="mk-leg">' + legBtn('sf', 'mk-sf', 'Single-family') + legBtn('mf', 'mk-mf', 'Multifamily (2+ units)') + '</div>' + permitsChart(s.permits) + pinned('permits', s) + '<div class="rnote">US Census Building Permits Survey (units authorized; includes Census estimates for places that don’t report every month).</div></section>' : '') +
      (s.biz?.length ? '<section class="mk-box"><h3>New business locations per month</h3>' + bizChart(s.biz) + pinned('biz', s) +
        '<div class="rnote">Texas Comptroller sales-tax permits issued per location, counting only those still active, so older months read low (closed businesses drop out). Covers businesses that sell taxable goods or services: retail, restaurants, many services; most offices and medical don’t need one.</div></section>' : '') +
      (s.jobs ? '<section class="mk-box"><h3>Jobs by industry (' + s.jobs.year + ')</h3>' + sectorBars(s.jobs.sec) + pinned('sector', s) +
        '<div class="rnote">US Census LEHD LODES: jobs counted where people work (by employer location, all private and public jobs covered by unemployment insurance). Turn on the Jobs layers under Map Layers → Demographics for the tract map.</div></section>' : '') +
      (s.spend ? '<section class="mk-box"><h3>Consumer spending by category, a year (estimate)</h3>' + catBars(Object.fromEntries(Object.entries(s.spend.cats).map(([k, v]) => [CAT_LABEL[k] || k, v])), fmtM) + pinned('spend', s) +
        '<div class="rnote">An estimate, not a measurement: households by income in each census tract (Census ACS ' + s.spend.acs + ') × what households at that income spend (BLS Consumer Expenditure Survey ' + s.spend.year + ', adjusted to the South region). Map it under Map Layers → Demographics.</div></section>' : '') +
      (s.tax?.length ? '<section class="mk-box"><h3>Local sales tax sent to cities, per month</h3>' + bizChart(s.tax.map(r => ({ m: r.m, n: r.n })), 'in city sales tax', fmtM, 'tax') + pinned('tax', s) + '<h4 class="mk-h4">Cities, last 12 months</h4>' + hbars(s.taxCities.slice(0, 12).map((c, i) => ({ label: c.city, v: c.last12 || 0, k: 'city:' + i, tip: c.city + ' (' + c.county + ' County): ' + (c.last12 != null ? fmtM(c.last12) : '—') + ' in the last 12 months' + (c.last12 != null && c.prior12 ? ', ' + pct(chg(c.last12, c.prior12)) + ' vs the 12 before' : '') })), fmtM) +
        '<div class="rnote">Texas Comptroller sales-tax allocations: the city\'s share of sales tax, paid about two months after the sales. A real measure of taxable local spending (retail, restaurants, many services), for the cities with filings in the area.</div></section>' : '') +
      crimeBox(s) + trafficBox(s) + ratesBox() +
      (s.news ? '<section class="mk-box"><h3>Local development news</h3><div class="mk-ctl"><select class="chip" id="mkPlace" aria-label="News place">' + placeOpts + '</select></div>' +
        (s.news.length ? s.news.map((a, i) => (i === 10 ? '<details class="raw mk-more"><summary>' + (s.news.length - 10) + ' more</summary>' : '') + '<a class="chitem" target="_blank" rel="noopener" href="' + esc(a.url) + '"><span><b>' + esc(a.title) + '</b><em>' + esc(a.domain) + (a.date ? ' · ' + esc(a.date) : '') + ' · ' + esc(a.place) + '</em></span></a>').join('') + (s.news.length > 10 ? '</details>' : '') : '<div class="rnote">No articles found in the last few months.</div>') +
        '<div class="rnote">Google News search for development, construction, rezoning and real estate stories naming each county and its busiest towns; kept for 120 days. Headlines link to the publisher.</div></section>' : '') +
      (s.latest?.length ? '<section class="mk-box mk-wide"><h3>Newest business locations</h3><div class="tablewrap"><table class="who"><thead><tr><th>Business</th><th>Address</th><th>Type</th><th>Permit issued</th></tr></thead><tbody>' +
        s.latest.map(b => '<tr><td>' + esc(b.name) + (b.owner ? '<div class="sc">' + esc(b.owner) + '</div>' : '') + '</td><td>' + esc([b.addr, b.city].filter(Boolean).join(', ')) + '</td><td>' + esc(b.sec != null ? SECTORS[b.sec][1] : (b.naics || '')) + '</td><td class="m">' + esc(b.date) + '</td></tr>').join('') +
        '</tbody></table></div><div class="rnote">Texas Comptroller active sales-tax permits, newest first. A new permit can also mean a change of owner at an existing location.</div></section>' : '') +
      '</div>';
    root.querySelector('#mkCounty').onchange = e => { sel = e.target.value; newsPlace = ''; pin = null; render(); };
    root.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { range = +b.dataset.range; pin = null; render(); });
    root.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { const k = b.dataset.show, pair = k === 'sf' || k === 'mf' ? ['sf', 'mf'] : ['v', 'p', 'o'];
      show[k] = !show[k]; if (!pair.some(x => show[x])) show[k] = true; render(); }); // never switch every series off
    root.querySelector('#mkExport').onclick = () => exportReport(); root.querySelector('#mkCsv').onclick = () => exportData();
    // click (or Enter on) a bar: pin its breakdown; roads fly to the map instead
    const act = el => { const [k, i] = String(el.dataset.k || '').split(':'); if (!k) return;
      if (k === 'road') { const r = traffic.get(sel)?.roads?.[+i]; if (r?.lon != null) { ctx.setView('map'); ctx.map.flyTo({ center: [r.lon, r.lat], zoom: 13.5, duration: ctx.reduceMotion ? 0 : 1400 }); ctx.toast?.(title(r.road) + ': ' + fmtN(r.aadt) + ' vehicles a day'); } return; }
      pin = pin && pin.k === k && pin.i === +i ? null : { k, i: +i }; const y = root.scrollTop; render(); root.scrollTop = y; };
    root.querySelectorAll('[data-k]').forEach(el => { el.onclick = () => act(el); el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(el); } }; });
    root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { const a = b.dataset.act;
      if (a === 'unpin') { pin = null; const y = root.scrollTop; render(); root.scrollTop = y; }
      else if (a === 'jobsmap') { ctx.setView('map'); ctx.showDemographic?.('jobs'); }
      else if (a === 'spendmap') { ctx.setView('map'); ctx.showDemographic?.('sph'); }
      else if (a === 'crimemap') { ctx.setView('map'); ctx.crimeLayer?.(true); } });
    loadExtras();
    const ps = root.querySelector('#mkPlace'); if (ps) ps.onchange = e => { newsPlace = e.target.value; render(); };
    const tip = root.querySelector('#mkTip');
    root.querySelectorAll('.mk-hit').forEach(el => {
      el.onmousemove = e => { tip.textContent = el.dataset.tip; tip.style.opacity = 1; const r = root.getBoundingClientRect(); let x = e.clientX - r.left + root.scrollLeft + 12; if (x + tip.offsetWidth > root.clientWidth - 8) x -= tip.offsetWidth + 24; tip.style.left = x + 'px'; tip.style.top = (e.clientY - r.top + root.scrollTop + 12) + 'px'; };
      el.onmouseleave = () => { tip.style.opacity = 0; };
      el.onfocus = () => { tip.textContent = el.dataset.tip; tip.style.opacity = 1; const r = root.getBoundingClientRect(), b = el.getBoundingClientRect(); tip.style.left = (b.left - r.left + root.scrollLeft) + 'px'; tip.style.top = (b.bottom - r.top + root.scrollTop + 6) + 'px'; };
      el.onblur = () => { tip.style.opacity = 0; };
    });
  }
  ctx.onView('market', render);

  // ---------- businesses registered at an address (building and filing cards) ----------
  const cache = new Map(), done = new Map(), tkey = (addr, zip, city) => [addr, zip, city].join('|').toUpperCase();
  ctx.tenantsAt = (addr, zip, city) => {
    const k = tkey(addr, zip, city); if (cache.has(k)) return cache.get(k);
    const p = fetch('api/tenants?' + new URLSearchParams({ addr, ...(zip ? { zip } : {}), ...(city ? { city } : {}) })).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'lookup failed'); done.set(k, d); return d; });
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
      sec.innerHTML = '<div class="lt">Registered businesses<span class="src"> (Texas Comptroller)</span></div><div class="rnote">Looking up…</div>';
      try { const d = await ctx.tenantsAt(a.street, a.zip, a.city); if (sec.isConnected) ctx.renderTenants(sec, d); } catch (e) { if (sec.isConnected) ctx.renderTenants(sec, null, e.message); }
    };
  });
}
