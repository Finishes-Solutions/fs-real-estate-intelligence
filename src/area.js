// Market view: growth signals per county from data/area.json (built nightly by build/area.mjs) and data/market.json.
//   population (ACS), jobs and industries (LEHD LODES), housing units permitted (Census BPS),
//   new business locations (Texas Comptroller sales-tax permits) and local development news (Google News).
// Also the "Businesses registered here" lookup (api/tenants) used by the building and filing cards.
import { SECTORS } from './lib/sectors.mjs';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function initArea(ctx) {
  const { esc, fmtN, fmtM } = ctx, root = document.getElementById('view-market');
  let area = null, market = null, loadP = null, sel = 'all', newsPlace = '';
  const load = () => loadP ||= Promise.all([
    fetch('data/area.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('data/market.json').then(r => r.ok ? r.json() : null).catch(() => null)
  ]).then(([a, m]) => { area = a; market = m; });
  ctx.areaInfo = () => area ? { built: area.built, jobs: area.jobs, permits: !!area.permits, businesses: !!area.businesses, news: !!area.news } : null;
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
  function axis(max) {
    const top = nice(max), ticks = [0, top / 2, top];
    return { top, html: ticks.map(t => { const y = PADT + (H - PADT - PADB) * (1 - t / top); return '<line class="mk-grid" x1="' + PADL + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text class="mk-ax" x="' + (PADL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + fmtN(t) + '</text>'; }).join('') };
  }
  // bars with a flat baseline and rounded data end: a path with only the top corners rounded
  const bar = (x, y, w, h, r = 3) => { if (h <= 0) return ''; r = Math.min(r, w / 2, h); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; };
  function permitsChart(rows) {
    const max = Math.max(1, ...rows.map(r => r.sf + r.mf)), ax = axis(max), plotH = H - PADT - PADB, bw = (W - PADL - 8) / rows.length, w = Math.min(46, bw * .62);
    const marks = rows.map((r, i) => {
      const x = PADL + 8 + i * bw + (bw - w) / 2, hs = r.sf / ax.top * plotH, hm = r.mf / ax.top * plotH, base = PADT + plotH, gap = hs && hm ? 2 : 0;
      const tip = esc(r.y + ': ' + fmtN(r.sf + r.mf) + ' units · single-family ' + fmtN(r.sf) + ' · multifamily ' + fmtN(r.mf) + ' · value ' + fmtM(r.value));
      return '<g class="mk-hit" data-tip="' + tip + '"><rect x="' + (x - 4) + '" y="' + PADT + '" width="' + (w + 8) + '" height="' + plotH + '" fill="transparent"/>' +
        (hm ? '<path class="mk-sf" d="M' + x + ',' + base + 'h' + w + 'v' + (-hs) + 'h' + (-w) + 'Z"/>' : '<path class="mk-sf" d="' + bar(x, base - hs, w, hs) + '"/>') +
        (hm ? '<path class="mk-mf" d="' + bar(x, base - hs - gap - hm, w, hm) + '"/>' : '') +
        '<text class="mk-ax" x="' + (x + w / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + r.y + '</text></g>';
    }).join('');
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Housing units permitted per year">' + ax.html + marks + '</svg>';
  }
  function bizChart(rows) {
    const max = Math.max(1, ...rows.map(r => r.n)), ax = axis(max), plotH = H - PADT - PADB, bw = (W - PADL - 8) / rows.length, w = Math.max(2, bw - 2), cur = new Date().toISOString().slice(0, 7), firstJan = rows.findIndex(r => r.m.endsWith('-01'));
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="New business locations per month">' + ax.html + rows.map((r, i) => {
      const x = PADL + 8 + i * bw, h = r.n / ax.top * plotH, [yy, mm] = r.m.split('-'), lbl = MON[+mm - 1] + ' ' + yy, partial = r.m >= cur;
      return '<g class="mk-hit" data-tip="' + esc(lbl + ': ' + fmtN(r.n) + ' new locations' + (partial ? ' (month in progress)' : '')) + '"><rect x="' + x + '" y="' + PADT + '" width="' + bw + '" height="' + plotH + '" fill="transparent"/>' +
        '<path class="' + (partial ? 'mk-part' : 'mk-sf') + '" d="' + bar(x, PADT + plotH - h, w, h, 2) + '"/>' + (mm === '01' || (i === 0 && firstJan >= 4) ? '<text class="mk-ax" x="' + x + '" y="' + (H - 6) + '">' + (mm === '01' ? yy : lbl) + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }
  function sectorBars(sec) {
    const tot = sec.reduce((s, v) => s + v, 0) || 1, top = sec.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 8), max = top[0]?.[1] || 1;
    return '<div class="mk-hbars">' + top.map(([i, v]) => '<div class="mk-hb mk-hit" data-tip="' + esc(SECTORS[i][1] + ': ' + fmtN(v) + ' jobs (' + Math.round(v / tot * 100) + '%)') + '"><span>' + esc(SECTORS[i][1]) + '</span><i><b style="width:' + (v / max * 100).toFixed(1) + '%"></b></i><em>' + fmtN(v) + '</em></div>').join('') + '</div>';
  }
  const table = (head, rows) => '<details class="raw mk-tbl"><summary>Table</summary><table><thead><tr>' + head.map((h, i) => '<th' + (i ? ' class="r"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="m r"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></details>';
  const tile = (v, label, sub) => '<div class="kpi"><b>' + v + '</b><span>' + esc(label) + '</span>' + (sub ? '<div class="mk-sub">' + esc(sub) + '</div>' : '') + '</div>';

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
      last12.length ? tile(fmtN(sum(last12, r => r.n)), 'New businesses', 'Last ' + last12.length + ' months, still open') : ''
    ].filter(Boolean);
    const opts = '<option value="all">Whole region</option>' + area.counties.map(c => '<option value="' + c.fips + '"' + (sel === c.fips ? ' selected' : '') + '>' + esc(c.name) + ' County</option>').join('');
    const placeOpts = s.places ? '<option value="">All places</option>' + s.places.map(p => '<option value="' + esc(p.key) + '"' + (newsPlace === p.key ? ' selected' : '') + '>' + esc(p.label) + '</option>').join('') : '';
    root.innerHTML = '<div class="vhead"><div><div class="kicker">Market</div><h2>Growth signals ' + (sel === 'all' ? 'across the region' : 'in ' + esc(cname(sel)) + ' County') + '</h2>' +
      '<div class="vsub">Jobs, housing permits, new businesses and local development news from free public sources, refreshed with the nightly build' + (area.built ? ' (last ' + new Date(area.built).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')' : '') + '. No sales or lease comps: Texas doesn’t disclose sale prices.</div></div>' +
      '<div class="vctl"><label>Area <select class="chip" id="mkCounty">' + opts.replace('value="all"', 'value="all"' + (sel === 'all' ? ' selected' : '')) + '</select></label></div></div>' +
      (tiles.length ? '<div class="kpis mk-kpis" style="grid-template-columns:repeat(' + tiles.length + ',1fr)">' + tiles.join('') + '</div>' : '') +
      '<div class="mk-tip" id="mkTip" role="tooltip"></div><div class="mk-grid">' +
      (s.permits?.length ? '<section class="mk-box"><h3>New housing units permitted per year</h3><div class="mk-leg"><span><i class="mk-sf"></i>Single-family</span><span><i class="mk-mf"></i>Multifamily (2+ units)</span></div>' + permitsChart(s.permits) +
        table(['Year', 'Single-family', 'Multifamily', 'Total', 'Value'], s.permits.map(r => [r.y, fmtN(r.sf), fmtN(r.mf), fmtN(r.sf + r.mf), fmtM(r.value)])) + '<div class="rnote">US Census Building Permits Survey (units authorized; includes Census estimates for places that don’t report every month).</div></section>' : '') +
      (s.biz?.length ? '<section class="mk-box"><h3>New business locations per month</h3>' + bizChart(s.biz) + table(['Month', 'New locations'], s.biz.map(r => [r.m, fmtN(r.n)])) +
        '<div class="rnote">Texas Comptroller sales-tax permits issued per location, counting only those still active, so older months read low (closed businesses drop out). Covers businesses that sell taxable goods or services: retail, restaurants, many services; most offices and medical don’t need one.</div></section>' : '') +
      (s.jobs ? '<section class="mk-box"><h3>Jobs by industry (' + s.jobs.year + ')</h3>' + sectorBars(s.jobs.sec) + table(['Industry', 'Jobs'], s.jobs.sec.map((v, i) => [SECTORS[i][1], fmtN(v)]).sort((a, b) => parseInt(b[1].replace(/,/g, '')) - parseInt(a[1].replace(/,/g, '')))) +
        '<div class="rnote">US Census LEHD LODES: jobs counted where people work (by employer location, all private and public jobs covered by unemployment insurance). Turn on the Jobs layers under Map Layers → Demographics for the tract map.</div></section>' : '') +
      (s.news ? '<section class="mk-box"><h3>Local development news</h3><div class="mk-ctl"><select class="chip" id="mkPlace" aria-label="News place">' + placeOpts + '</select></div>' +
        (s.news.length ? s.news.map((a, i) => (i === 10 ? '<details class="raw mk-more"><summary>' + (s.news.length - 10) + ' more</summary>' : '') + '<a class="chitem" target="_blank" rel="noopener" href="' + esc(a.url) + '"><span><b>' + esc(a.title) + '</b><em>' + esc(a.domain) + (a.date ? ' · ' + esc(a.date) : '') + ' · ' + esc(a.place) + '</em></span></a>').join('') + (s.news.length > 10 ? '</details>' : '') : '<div class="rnote">No articles found in the last few months.</div>') +
        '<div class="rnote">Google News search for development, construction, rezoning and real estate stories naming each county and its busiest towns; kept for 120 days. Headlines link to the publisher.</div></section>' : '') +
      (s.latest?.length ? '<section class="mk-box mk-wide"><h3>Newest business locations</h3><div class="tablewrap"><table class="who"><thead><tr><th>Business</th><th>Address</th><th>Type</th><th>Permit issued</th></tr></thead><tbody>' +
        s.latest.map(b => '<tr><td>' + esc(b.name) + (b.owner ? '<div class="sc">' + esc(b.owner) + '</div>' : '') + '</td><td>' + esc([b.addr, b.city].filter(Boolean).join(', ')) + '</td><td>' + esc(b.sec != null ? SECTORS[b.sec][1] : (b.naics || '')) + '</td><td class="m">' + esc(b.date) + '</td></tr>').join('') +
        '</tbody></table></div><div class="rnote">Texas Comptroller active sales-tax permits, newest first. A new permit can also mean a change of owner at an existing location.</div></section>' : '') +
      '</div>';
    root.querySelector('#mkCounty').onchange = e => { sel = e.target.value; newsPlace = ''; render(); };
    const ps = root.querySelector('#mkPlace'); if (ps) ps.onchange = e => { newsPlace = e.target.value; render(); };
    const tip = root.querySelector('#mkTip');
    root.querySelectorAll('.mk-hit').forEach(el => {
      el.onmousemove = e => { tip.textContent = el.dataset.tip; tip.style.opacity = 1; const r = root.getBoundingClientRect(); let x = e.clientX - r.left + root.scrollLeft + 12; if (x + tip.offsetWidth > root.clientWidth - 8) x -= tip.offsetWidth + 24; tip.style.left = x + 'px'; tip.style.top = (e.clientY - r.top + root.scrollTop + 12) + 'px'; };
      el.onmouseleave = () => { tip.style.opacity = 0; };
    });
  }
  ctx.onView('market', render);

  // ---------- businesses registered at an address (building and filing cards) ----------
  const cache = new Map();
  ctx.tenantsAt = (addr, zip, city) => {
    const k = [addr, zip, city].join('|').toUpperCase(); if (cache.has(k)) return cache.get(k);
    const p = fetch('api/tenants?' + new URLSearchParams({ addr, ...(zip ? { zip } : {}), ...(city ? { city } : {}) })).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'lookup failed'); return d; });
    p.catch(() => cache.delete(k)); cache.set(k, p); return p;
  };
  ctx.renderTenants = (el, d, err) => {
    if (err) { el.innerHTML = '<div class="lt">Registered businesses (Texas Comptroller)</div><div class="rnote err">' + esc(err) + '</div>'; return; }
    const li = t => '<div class="pl"><b>' + esc(t.name) + (t.suite ? ' <span class="sc">Ste ' + esc(t.suite) + '</span>' : '') + '</b><span>' + esc([t.sector, t.owner && 'owner ' + t.owner, t.opened && 'since ' + t.opened].filter(Boolean).join(' · ')) + '</span></div>';
    el.innerHTML = '<div class="lt">Registered businesses (Texas Comptroller)</div>' + (d.tenants.length ? d.tenants.slice(0, 30).map(li).join('') + (d.tenants.length > 30 ? '<div class="rnote">…and ' + (d.tenants.length - 30) + ' more</div>' : '')
      : '<div class="rnote">' + esc(d.note || 'No active sales-tax permits at this address.') + '</div>') + '<div class="rnote">Active sales-tax permits matched on house number and street' + (d.query ? ' (' + esc(d.query) + ')' : '') + '. Lists retail, restaurant and service tenants; offices and medical often aren’t listed.</div>';
  };
  // filings: the street part of "6615 Garth Rd Baytown, TX 77520", and its ZIP
  const filingAddr = f => { const a = String(f.addr || ''), zip = f.zip || (a.match(/\b(\d{5})(?:-\d{4})?\s*$/) || [])[1] || '', i = f.city ? a.toLowerCase().lastIndexOf(' ' + f.city.toLowerCase()) : -1; return { street: (i > 0 ? a.slice(0, i) : a.split(',')[0]).trim(), zip, city: f.city || '' }; };
  ctx.onCardRender(info => {
    if (info.kind !== 'filing') return;
    const card = document.getElementById('card'); card.querySelector('#tenSec')?.remove();
    const a = filingAddr(info.f); if (!/^\d/.test(a.street)) return;
    const sec = document.createElement('div'); sec.className = 'bsec'; sec.id = 'tenSec';
    sec.innerHTML = '<div class="lt">Businesses at this address</div><button class="btn" type="button">Look Up Registered Businesses</button><div class="rnote">Texas Comptroller sales-tax permits at ' + esc(a.street) + '.</div>';
    const after = card.querySelector('#liveSec') || card.querySelector('#briefBox'); if (after) after.after(sec); else (card.querySelector('.bsrc') || card.lastElementChild)?.before(sec);
    sec.querySelector('button').onclick = async () => {
      sec.innerHTML = '<div class="lt">Registered businesses (Texas Comptroller)</div><div class="rnote">Looking up…</div>';
      try { const d = await ctx.tenantsAt(a.street, a.zip, a.city); if (sec.isConnected) ctx.renderTenants(sec, d); } catch (e) { if (sec.isConnected) ctx.renderTenants(sec, null, e.message); }
    };
  });
}
