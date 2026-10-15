// Market tab: "Markets" (stocks, ETFs, indexes, crypto, oil and gas, construction costs, rates and Houston metro
// statistics; nightly history in data/markets.json, live prices from api/markets) and the "Correlation explorer"
// (lib/correlate.mjs: how a Houston measure moves with a market series, with the honesty checks built in), plus "Explain
// with AI" (the assistant, using its market_correlation tool) and "What moves this?" (one measure against every series).
// src/area.js puts the two boxes in the Markets section of the Market tab and re-renders only that section when something
// here changes; the assistant's market tools use ctx.markets too.
// Speed (2026-10-15): the series list is built once per data (not per call), correlations are cached per pair, the
// sparklines carry about one point a week with one hover strip, and the live prices every minute rewrite only the price
// cells that changed (open details, scroll and focus stay put).
import { SERIES, BY_ID, GROUPS } from './lib/markets.mjs';
import { correlate, scan, describe, fromMonths } from './lib/correlate.mjs';

// formatters are built once: toLocaleString / toLocaleDateString with options build a new one on every call
const NF = new Map(), nf = d => { let f = NF.get(d); if (!f) NF.set(d, f = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })); return f; };
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const MDAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const SPARK_N = 52; // sparkline points: about one a week over the year

export function initMarkets(ctx) {
  const { esc, fmtN } = ctx;
  let data = null, loadP = null, loaded = false, quotes = {}, qAt = 0, qJob = null, timer = null;
  let group = 'energy', A = 'hous448bpprivsa', B = 'dcoilwtico', how = 'yoy', scanRes = null, scanFor = null;
  const load = () => loadP ||= fetch('data/markets.json').then(r => r.ok ? r.json() : null).catch(() => null).then(d => { data = d; loaded = true; return d; });
  let api = { root: null, section: () => Promise.resolve() }; // set by wire(): area.js's section renderer

  // ---------- series: the market catalog plus the app's own Houston measures (src/area.js provides those) ----------
  // built once per markets.json and per set of local series (area.js memoises those), not on every lookup
  let mkt = null, memo = null;
  function all() {
    const loc = ctx.marketLocalSeries?.() || [];
    if (memo && memo.data === data && memo.loc === loc) return memo.list;
    if (!mkt || mkt.data !== data) mkt = { data, list: SERIES.filter(s => data?.series?.[s.id]?.months).map(s => ({ ...s, map: fromMonths(data.series[s.id].months) })) };
    const list = [...loc.filter(s => s.map?.size).map(s => ({ ...s, group: 'local', app: true })), ...mkt.list];
    memo = { data, loc, list, byId: new Map(list.map(s => [s.id, s])), locals: list.filter(s => s.group === 'local'), markets: list.filter(s => s.group !== 'local') };
    return list;
  }
  const get = id => { all(); return memo.byId.get(id); };
  const locals = () => { all(); return memo.locals; }, markets = () => { all(); return memo.markets; };
  // a name, ticker or id as people say it -> series
  function find(q) {
    const t = String(q || '').trim().toLowerCase(); if (!t) return null; const list = all();
    return list.find(s => s.id === t || (s.sym || '').toLowerCase() === t) || list.find(s => s.short.toLowerCase() === t || s.label.toLowerCase() === t) ||
      list.find(s => (s.label + ' ' + s.short + ' ' + (s.sym || '')).toLowerCase().includes(t)) ||
      list.find(s => t.split(/\s+/).filter(w => w.length > 2).every(w => (s.label + ' ' + s.short + ' ' + (s.sym || '') + ' ' + s.group).toLowerCase().includes(w))) || null;
  }

  // ---------- live prices ----------
  function refreshQuotes(force) {
    if (qJob || (!force && Date.now() - qAt < 55e3)) return qJob;
    qJob = fetch('api/markets?quotes=1').then(r => r.ok ? r.json() : null).catch(() => null).then(d => { if (d?.quotes) { quotes = d.quotes; qAt = Date.now(); updateQuotes(); } qJob = null; });
    return qJob;
  }
  ctx.onViewChange?.(v => { if (v !== 'market') return; refreshQuotes(); clearInterval(timer); timer = setInterval(() => { if (ctx.view === 'market' && document.visibilityState === 'visible') refreshQuotes(); else clearInterval(timer); }, 60e3); });

  // ---------- formatting ----------
  const num = (v, d = 2) => v == null || !Number.isFinite(+v) ? '—' : nf(d).format(+v);
  function fmt(s, v) {
    if (v == null) return '—';
    if (s.unit === '$') return '$' + num(v, v >= 1000 ? 0 : v >= 1 ? 2 : 4);
    if (s.unit === '%') return num(v, 2) + '%';
    if (/^\$\//.test(s.unit)) return '$' + num(v, 2) + ' ' + s.unit.slice(1).replace(/^\//, '/');
    if (s.unit === 'units' || s.unit === 'listings' || s.unit === 'days') return fmtN(Math.round(v)) + ' ' + s.unit;
    if (s.unit === 'k jobs') return num(v, 1) + 'k jobs';
    return num(v, v >= 1000 ? 0 : 1);
  }
  const pct = v => v == null ? '<span class="mx-dim">—</span>' : '<span class="' + (v > 0 ? 'mx-up' : v < 0 ? 'mx-dn' : '') + '">' + (v > 0 ? '+' : '') + num(v, Math.abs(v) < 10 ? 2 : 1) + '%</span>';
  // the last 12 months at about one point a week, W wide. One transparent strip reads out the point under the mouse
  // (area.js maps the mouse x to a point and moves the dot, as for src/mkcharts.js's line charts). Keyed by row (i) for motion
  // (src/motion.js): switching groups morphs each row's line into the next series' instead of replaying the entrance
  function spark(s, d, i = 0, W = 110) {
    const v0 = d?.recent?.v || [], t0 = d?.recent?.t || []; if (v0.length < 2) return '';
    const idx = v0.length <= SPARK_N ? v0.map((_, k) => k) : Array.from({ length: SPARK_N }, (_, k) => Math.round(k * (v0.length - 1) / (SPARK_N - 1)));
    const v = idx.map(k => v0[k]), t = idx.map(k => t0[k]), H = 28, mn = Math.min(...v), mx = Math.max(...v);
    const x = k => k / (v.length - 1) * W, y = p => H - 3 - (p - mn) / ((mx - mn) || 1) * (H - 6);
    const df = s.freq === 'd' || s.freq === 'w' ? DAY : MONTH;
    const when = k => { const [yy, mm, dd] = String(k || '').split('-'); return yy ? df.format(Date.UTC(+yy, +mm - 1, +dd || 1)) : ''; };
    const tips = v.map((p, k) => { const w = when(t[k]); return (w ? w + ': ' : '') + fmt(s, p); }).join('\u001f');
    return '<svg class="mx-spark ' + (v[v.length - 1] >= v[0] ? 'up' : 'dn') + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Last 12 months" data-ck="mx:spark:' + i + '">' +
      '<polyline class="m-line" data-mk="line" points="' + v.map((p, k) => x(k).toFixed(1) + ',' + y(p).toFixed(1)).join(' ') + '"/><circle class="mx-sdot mk-hxd" r="2.6" cx="-10" cy="-10"/>' +
      '<rect class="mk-hit mk-hx" x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent" data-x0="0" data-x1="' + W + '" data-py="' + v.map(p => y(p).toFixed(1)).join(',') + '" data-tipx="' + esc(tips) + '"/></svg>';
  }
  // the latest price: the live quote when it's newer than last night's close
  function latest(s) {
    const d = data?.series?.[s.id], q = quotes[s.id]; if (!d) return null;
    if (q && Number.isFinite(q.price) && (!q.time || q.time.slice(0, 10) >= d.date)) {
      const base = q.time && q.time.slice(0, 10) > d.date ? d.value : d.prev ?? d.value;
      return { value: q.price, chg: base ? (q.price - base) / Math.abs(base) * 100 : null, chgYr: d.yr ? (q.price - d.yr) / Math.abs(d.yr) * 100 : d.chgYr, live: q.src, date: q.time };
    }
    return { value: d.value, chg: s.freq === 'd' ? d.chg : null, chgYr: d.chgYr, date: d.date, stale: d.stale };
  }

  // ---------- Markets box ----------
  const asOf = () => Object.keys(quotes).length ? 'Live prices ' + CLOCK.format(qAt) + ' · crypto real time, stocks delayed' : 'Closing prices as of ' + MDAY.format(new Date(data.built));
  const symText = (s, L) => (s.src === 'yahoo' ? s.sym.replace(/^\^/, '').replace(/-USD$/, '') : s.freq === 'm' ? 'monthly' : s.freq === 'q' ? 'quarterly' : 'daily') + (L?.live === 'Coinbase' ? ' · live' : '') + (L?.stale ? ' · not updated last night' : '');
  const cells = (s, L) => [fmt(s, L?.value), s.freq === 'd' ? pct(L?.chg) : '<span class="mx-dim">—</span>', pct(L?.chgYr)];
  function marketsBox(w) {
    if (!data) return '<section class="mk-box mk-wide" id="mxBox"><h3>Markets</h3>' + (loaded ? '<div class="rnote">Market prices aren’t available right now.</div>' : '<div class="rnote loading">Loading market data…</div><div class="mk-skel" aria-hidden="true" style="height:160px"></div>') + '</section>';
    const g = GROUPS.find(x => x[0] === group) || GROUPS[1], rows = SERIES.filter(s => s.group === group && data.series[s.id]), sw = w?.spark || 110;
    return '<section class="mk-box mk-wide" id="mxBox"><div class="mx-head"><h3>Markets</h3><span class="mx-asof">' + esc(asOf()) + '</span></div>' +
      '<div class="mx-tabs" role="tablist" aria-label="Market groups">' + GROUPS.map(([k, l]) => '<button type="button" role="tab" data-mxg="' + k + '" aria-selected="' + (k === group) + '">' + esc(l) + '</button>').join('') + '</div>' +
      '<div class="mx-desc">' + esc(g[2]) + '</div><div class="tablewrap"><table class="mx-table"><thead><tr><th>Name</th><th class="r">Last</th><th class="r">Day</th><th class="r">1 year</th><th class="mx-sp" style="width:' + (sw + 12) + 'px">Last 12 months</th><th></th></tr></thead><tbody>' +
      rows.map((s, i) => { const L = latest(s), d = data.series[s.id], c = cells(s, L);
        return '<tr data-mxs="' + s.id + '" tabindex="0" title="Compare with a Houston measure in the Correlation explorer"><td><b>' + esc(s.short) + '</b><span class="mx-sym">' + esc(symText(s, L)) + '</span></td>' +
          '<td class="r m">' + c[0] + '</td><td class="r m">' + c[1] + '</td><td class="r m">' + c[2] + '</td><td class="mx-sp">' + spark(s, d, i, sw) + '</td><td class="r"><button type="button" class="lnk mx-cmp" data-mxs="' + s.id + '">Correlate</button></td></tr>'; }).join('') +
      '</tbody></table></div><div class="rnote">Sources: Yahoo Finance chart data (stocks, ETFs, indexes, crypto history; delayed, unofficial), Coinbase (live crypto), FRED (oil, gas, producer prices, rates, Houston metro series from BLS, Census and Realtor.com). Not investment advice.</div></section>';
  }
  // new live prices: rewrite only the price cells (and the as-of line) whose text changed; nothing else is touched
  function updateQuotes() {
    const box = api.root?.querySelector('#mxBox'); if (!box || !data) return;
    const a = box.querySelector('.mx-asof'), t = asOf(); if (a && a.textContent !== t) a.textContent = t;
    box.querySelectorAll('tbody tr[data-mxs]').forEach(tr => {
      const s = BY_ID.get(tr.dataset.mxs); if (!s) return; const L = latest(s), c = cells(s, L), td = tr.querySelectorAll('td.m'), sym = tr.querySelector('.mx-sym'), st = symText(s, L);
      c.forEach((h, k) => { if (td[k] && td[k].innerHTML !== h) td[k].innerHTML = h; });
      if (sym && sym.textContent !== st) sym.textContent = st;
    });
  }

  // ---------- Correlation explorer ----------
  const opt = (s, v) => '<option value="' + s.id + '"' + (s.id === v ? ' selected' : '') + '>' + esc(s.label) + '</option>';
  // one correlation per pair, change and series list (the list changes when markets.json or a local series arrives)
  let corr = null;
  function result() {
    all(); const key = A + '|' + B + '|' + how; if (corr && corr.key === key && corr.memo === memo) return corr.r;
    const a = get(A), b = get(B), r = a && b ? { a, b, res: correlate(a.map, b.map, { how, diffA: !!a.diff, diffB: !!b.diff }) } : null;
    corr = { key, memo, r, html: new Map() }; return r;
  }
  // the two series' changes, standardized so they share one axis; hover a month for both actual changes
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], ym = k => MON[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4);
  const chgTxt = (v, diff) => v == null ? '—' : (v > 0 ? '+' : '') + (diff ? num(v, 2) + ' pts' : num(v, Math.abs(v) < 10 ? 1 : 0) + '%');
  function chart(r, W = 560) {
    const { res } = r; if (!res.series || res.r == null) return '';
    const a = new Map(res.series.a), b = new Map(res.series.b), keys = [...a.keys()].filter(k => b.has(shift(k, -res.lag))).sort();
    if (keys.length < 3) return '';
    const z = arr => { const m = arr.reduce((s, x) => s + x, 0) / arr.length, sd = Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length) || 1; return arr.map(x => (x - m) / sd); };
    const va = z(keys.map(k => a.get(k))), vb = z(keys.map(k => b.get(shift(k, -res.lag)))), H = 200, P = 28;
    const all2 = va.concat(vb), mn = Math.min(-2, ...all2), mx = Math.max(2, ...all2), X = i => P + i / (keys.length - 1) * (W - P - 6), Y = v => 8 + (mx - v) / (mx - mn) * (H - 30);
    const line = (vs, cls) => '<polyline class="m-line ' + cls + '" data-mk="' + cls + '" points="' + vs.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') + '"/>';
    const yr0 = keys.map((k, i) => [k, i]).filter(([k]) => k.endsWith('-01')), every = Math.max(1, Math.ceil(40 / ((W - P - 6) / Math.max(1, keys.length - 1) * 12))); // years at least 40 px apart
    const yrs = yr0.filter((_, j) => (yr0.length - 1 - j) % every === 0), step = (W - P - 6) / (keys.length - 1), per = how === 'mom' ? ' vs the month before' : ' vs a year earlier';
    const hits = keys.map((k, i) => { const kb = shift(k, -res.lag);
      return '<g class="mk-hit mx-hit" data-tip="' + esc(ym(k) + ': ' + r.a.short + ' ' + chgTxt(a.get(k), r.a.diff) + per + ' · ' + r.b.short + (res.lag ? ' (' + ym(kb) + ')' : '') + ' ' + chgTxt(b.get(kb), r.b.diff)) + '">' +
        '<rect x="' + (X(i) - step / 2).toFixed(1) + '" y="0" width="' + step.toFixed(2) + '" height="' + (H - 22) + '" fill="transparent"/><line x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="4" y2="' + (H - 22) + '"/></g>'; }).join('');
    return '<svg class="mx-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="The two series, standardized" data-ck="mx:corr"><line class="mx-zero" x1="' + P + '" x2="' + (W - 6) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>' +
      yrs.map(([k, i]) => '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" class="mx-ax" text-anchor="' + (X(i) < P + 16 ? 'start' : X(i) > W - 30 ? 'end' : 'middle') + '">' + k.slice(0, 4) + '</text>').join('') + line(vb, 'mx-lb') + line(va, 'mx-la') + hits + '</svg>';
  }
  const shift = (k, n) => { const [y, m] = k.split('-').map(Number), t = y * 12 + m - 1 + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  function lagBars(res, W = 560) {
    const L = res.lags.filter(l => Number.isFinite(l.r)); if (!L.length) return '';
    const H = 80, mid = 40, bw = W / res.lags.length;
    return '<svg class="mx-lags" viewBox="0 0 ' + W + ' ' + (H + 16) + '" role="img" aria-label="Correlation at each lead or lag" data-ck="mx:lags" data-base="' + mid + '">' + res.lags.map((l, i) => { if (!Number.isFinite(l.r)) return '';
      const h = Math.abs(l.r) * (mid - 4), y = l.r >= 0 ? mid - h : mid;
      const tip = (l.lag === 0 ? 'Same month' : l.lag > 0 ? 'Market series first by ' + l.lag + ' mo' : 'Houston measure first by ' + -l.lag + ' mo') + ': r = ' + (l.r > 0 ? '+' : '') + l.r.toFixed(2) + ' over ' + l.n + ' months' + (l.lag === res.lag ? ' (the strongest)' : '');
      return '<g class="mk-hit" data-tip="' + esc(tip) + '"><rect x="' + (i * bw).toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + H + '" fill="transparent"/><rect x="' + (i * bw + 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, bw - 4).toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) + '" class="m-bar ' + (l.lag === res.lag ? 'on' : l.r >= 0 ? 'pos' : 'neg') + '" data-mk="' + l.lag + '"/></g>'; }).join('') +
      '<line x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '" class="mx-zero"/>' + (W >= 520 ? '<text x="2" y="' + (H + 13) + '" class="mx-ax">Houston measure first ←</text><text x="' + (W / 2) + '" y="' + (H + 13) + '" class="mx-ax" text-anchor="middle">same month</text><text x="' + (W - 2) + '" y="' + (H + 13) + '" class="mx-ax" text-anchor="end">→ market series first</text>'
        : '<text x="2" y="' + (H + 13) + '" class="mx-ax">← Houston first</text><text x="' + (W - 2) + '" y="' + (H + 13) + '" class="mx-ax" text-anchor="end">market first →</text>') + '</svg>';
  }
  const VERD = { strong: ['Strong', 'mx-v3'], moderate: ['Moderate', 'mx-v2'], weak: ['Weak', 'mx-v1'], 'no reliable relationship': ['Not reliable', 'mx-v0'], 'not enough overlap': ['Not enough data', 'mx-v0'] };
  // layout: controls, the verdict tiles and the actions on the left; the chart, lead/lag bars and the plain-language
  // summary on the right, drawn at the column's real width (w.main, measured by area.js)
  function corrBox(w) {
    if (!data) return '';
    const r = result(), lo = locals(), W = Math.max(280, Math.round(w?.main || 560));
    const groupsOpt = sel => GROUPS.map(([k, l]) => { const xs = all().filter(s => s.group === k); return xs.length ? '<optgroup label="' + esc(l) + '">' + xs.map(s => opt(s, sel)).join('') + '</optgroup>' : ''; }).join('');
    let tiles = '', main = '<div class="rnote">Pick a Houston measure and a market series.</div>';
    if (r) {
      const { res } = r, v = VERD[res.verdict] || VERD['no reliable relationship'], short = res.verdict === 'not enough overlap';
      if (short) main = '<div class="rnote">' + esc(res.sentence) + (how === 'yoy' ? ' <button type="button" class="lnk" data-mxhow="mom">Try month-over-month changes</button>' : '') + '</div>';
      else {
        tiles = '<div class="kgrid mx-kg"><div class="mx-kv"><b class="' + v[1] + '">' + v[0] + '</b><span>Verdict</span></div><div><b>' + (res.lag === 0 ? 'Same month' : Math.abs(res.lag) + ' mo') + '</b><span>' + (res.lag > 0 ? esc(r.b.short) + ' first' : res.lag < 0 ? esc(r.a.short) + ' first' : 'Lead / lag') + '</span></div>' +
          '<div><b>' + (res.r > 0 ? '+' : '') + res.r.toFixed(2) + '</b><span>Correlation (r)</span></div><div><b>' + res.n + ' / ' + res.neff + '</b><span>Months / independent</span></div>' +
          '<div class="mk-hit" tabindex="0" data-tip="How often two unrelated series would show a link this strong, after allowing for every lead, lag and overlapping month tried. Below 0.05 is the usual bar."><b>' + (res.pAdj < .001 ? '<0.001' : num(res.pAdj, res.pAdj < .1 ? 3 : 2)) + '</b><span>p-value, corrected</span></div></div>';
        let figs = corr.html.get(W); if (!figs) corr.html.set(W, figs = chart(r, W) + '<div class="mx-sub">Correlation at each lead or lag</div>' + lagBars(res, W));
        main = '<div class="mx-leg"><span><i class="mx-la"></i>' + esc(r.a.short) + '</span><span><i class="mx-lb"></i>' + esc(r.b.short) + (res.lag ? ' (shifted ' + Math.abs(res.lag) + ' mo ' + (res.lag > 0 ? 'later' : 'earlier') + ')' : '') + '</span><span class="mx-dim">' + (how === 'yoy' ? 'Year-over-year' : 'Month-over-month') + ' change, standardized · hover for values</span></div>' +
          figs + '<p class="mx-say">' + esc(describe(res, { a: r.a.short, b: r.b.short })) + '</p>';
      }
    }
    const sc = scanRes && scanFor === A + '|' + how ? scanRes : null;
    return '<section class="mk-box mk-wide" id="mxCorr"><div class="mx-head"><h3>Correlation explorer</h3><span class="mx-asof">Does a market move with Houston, and which goes first?</span></div><div class="mx-wrap"><div class="mx-side">' +
      '<div class="mx-ctl"><label><span>Houston measure</span><select class="chip" id="mxA">' + lo.map(s => opt(s, A)).join('') + '</select></label>' +
      '<label><span>Compared with</span><select class="chip" id="mxB">' + groupsOpt(B) + '</select></label>' +
      '<div class="mk-seg" role="group" aria-label="Change compared"><button type="button" data-mxhow="yoy" aria-pressed="' + (how === 'yoy') + '">Year over year</button><button type="button" data-mxhow="mom" aria-pressed="' + (how === 'mom') + '">Month over month</button></div></div>' +
      tiles + '<div class="bacts mx-acts"><button type="button" class="btn primary" id="mxAi">Explain with AI</button><button type="button" class="btn" id="mxScan">What moves ' + esc(get(A)?.short || 'this') + '?</button></div></div>' +
      '<div class="mx-main">' + main + '</div></div>' +
      (sc ? '<div class="mx-scan"><div class="mx-sub">' + esc(get(A)?.short || '') + ' against all ' + sc.results.length + ' market series · ' + fmtN(sc.tests) + ' comparisons, so the bar for “reliable” is high · ' + (sc.reliable ? sc.reliable + ' held up' : 'none held up') + '</div>' +
        sc.results.slice(0, 10).map(x => { const s = get(x.id), v = VERD[x.res.verdict] || VERD['no reliable relationship'];
          return '<button type="button" class="mx-row" data-mxb="' + x.id + '"><b>' + esc(s?.short || x.id) + '</b><span class="m">r ' + (x.res.r > 0 ? '+' : '') + x.res.r.toFixed(2) + '</span><span>' + (x.res.lag === 0 ? 'same month' : x.res.lag > 0 ? s?.short + ' first by ' + x.res.lag + ' mo' : 'Houston first by ' + -x.res.lag + ' mo') + '</span><em class="' + v[1] + '">' + v[0] + '</em></button>'; }).join('') + '</div>' : '') +
      '<details class="mx-how"><summary>How this is measured</summary><div class="rnote">Compares changes, not price levels (anything that trends up looks related otherwise), by rank, so one extreme month like spring 2020 can’t carry the result. Tries every lead and lag up to 12 months and discounts for each one tried, and for months that overlap. A relationship has to hold in both halves of the period to be called strong, and a best fit at the 12-month limit counts as weak at most. Correlation doesn’t prove one causes the other. Houston measures from FRED (BLS, Census, Realtor.com, FHFA) and this app (Houston Police crime, TDLR filings, Comptroller permits and sales tax).</div></details></section>';
  }

  // ---------- events: one delegated set on the Market tab, bound once (area.js calls wire(root, { section })) ----------
  // every change here re-renders only the Markets section
  const redraw = () => api.section('markets');
  function wire(root, o) {
    api = { root, ...o };
    const pick = id => { const s = get(id); if (!s) return; if (s.group === 'local') A = id; else B = id; redraw().then(() => root.querySelector('#mxCorr')?.scrollIntoView({ behavior: ctx.reduceMotion ? 'auto' : 'smooth', block: 'start' })); };
    root.addEventListener('click', e => {
      const t = e.target; if (!t.closest?.('#mk-markets')) return; let b;
      if ((b = t.closest('[data-mxg]'))) { group = b.dataset.mxg; redraw(); }
      else if ((b = t.closest('button.mx-cmp'))) pick(b.dataset.mxs);
      else if ((b = t.closest('tr[data-mxs]'))) { if (!t.closest('button')) pick(b.dataset.mxs); }
      else if ((b = t.closest('[data-mxhow]'))) { how = b.dataset.mxhow; redraw(); }
      else if ((b = t.closest('[data-mxb]'))) { B = b.dataset.mxb; redraw().then(() => root.querySelector('#mxCorr')?.scrollIntoView({ block: 'start' })); }
      else if (t.closest('#mxScan')) { const a = get(A); if (!a) return; scanRes = scan(a.map, markets().map(s => ({ id: s.id, diff: s.diff, map: s.map })), { how, diffA: !!a.diff }); scanFor = A + '|' + how; redraw(); }
      else if (t.closest('#mxAi')) { const a = get(A), b2 = get(B); if (!a || !b2) return;
        ctx.assistant?.ask('Use the market_correlation tool to compare "' + a.label + '" with "' + b2.label + '" (' + (how === 'mom' ? 'month-over-month' : 'year-over-year') + ' changes), then explain in plain language: what the numbers show, which moves first, whether it is reliable or could be chance, plausible economic reasons for Houston real estate, and what it does not prove.'); }
    });
    root.addEventListener('keydown', e => { const tr = e.key === 'Enter' && e.target.matches?.('#mk-markets tr[data-mxs]') ? e.target : null; if (tr) pick(tr.dataset.mxs); });
    root.addEventListener('change', e => { const id = e.target.id; if (id === 'mxA') { A = e.target.value; redraw(); } else if (id === 'mxB') { B = e.target.value; redraw(); } });
  }

  // ---------- for the assistant ----------
  const brief = s => ({ id: s.id, name: s.label, group: GROUPS.find(g => g[0] === s.group)?.[1] });
  async function correlateNamed(aName, bName, change = 'yoy') {
    await load(); if (!data) return { error: 'Market data isn’t available yet.' };
    const a = find(aName), b = bName ? find(bName) : null;
    if (!a) return { error: 'No series matches "' + aName + '".', houston_measures: locals().map(s => s.label), market_series: markets().map(s => s.label) };
    if (bName && !b) return { error: 'No series matches "' + bName + '".', market_series: markets().map(s => s.label) };
    if (!b) { const sc = scan(a.map, markets().map(s => ({ id: s.id, diff: s.diff, map: s.map })), { how: change, diffA: !!a.diff });
      return { measure: brief(a), change, comparisons: sc.tests, reliable_count: sc.reliable, note: 'Every series and lag tried counts against reliability; with this many comparisons some look related by chance.',
        top: sc.results.slice(0, 8).map(x => ({ series: get(x.id)?.label, r: x.res.r, lag_months: x.res.lag, leader: x.res.lag > 0 ? 'market series first' : x.res.lag < 0 ? 'Houston measure first' : 'same month', verdict: x.res.verdict, months: x.res.n, independent_months: x.res.neff })) }; }
    A = a.group === 'local' ? a.id : A; B = b.id; how = change; const res = result()?.a === a && corr.r.b === b ? corr.r.res : correlate(a.map, b.map, { how: change, diffA: !!a.diff, diffB: !!b.diff });
    if (ctx.view === 'market') redraw();
    return { a: brief(a), b: brief(b), change: change === 'mom' ? 'month-over-month' : 'year-over-year', verdict: res.verdict, r: res.r, lag_months: res.lag, leader: res.lag > 0 ? b.label + ' moves first' : res.lag < 0 ? a.label + ' moves first' : 'same month',
      months: res.n, independent_months: res.neff, chance_after_correction: res.pAdj != null ? +(res.pAdj).toFixed(4) : null, lags_tried: res.tests, holds_in_both_halves: res.stable, halves_r: res.halves, best_lag_at_edge: res.edge, period: res.from ? res.from + ' to ' + res.to : null, summary: describe(res, { a: a.short, b: b.short }) };
  }
  async function prices(names, grp) {
    await load(); if (!data) return { error: 'Market data isn’t available yet.' }; await refreshQuotes(true);
    let list = names?.length ? names.map(find).filter(Boolean) : SERIES.filter(s => !grp || s.group === grp || GROUPS.find(g => g[0] === s.group)?.[1].toLowerCase().includes(String(grp).toLowerCase()));
    list = list.filter(s => data.series[s.id]).slice(0, 40);
    return { as_of: data.built, live_prices: Object.keys(quotes).length > 0, series: list.map(s => { const L = latest(s); return { name: s.label, symbol: s.sym, group: GROUPS.find(g => g[0] === s.group)?.[1], value: L?.value, unit: s.unit, day_change_pct: L?.chg != null ? +L.chg.toFixed(2) : null, year_change_pct: L?.chgYr != null ? +(+L.chgYr).toFixed(2) : null, as_of: L?.date, live: !!L?.live }; }),
      groups: GROUPS.map(g => g[1]) };
  }

  // html(w): both boxes at the widths area.js measured ({ spark, main }); one call per render
  ctx.markets = { load, raw: () => data, html: w => marketsBox(w) + corrBox(w), wire, correlateNamed, prices, find };
}
