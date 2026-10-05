// Crime by city / county anywhere in the US (FBI Crime Data Explorer, via api/crimeus): the police department that covers a
// point (the city's own inside city limits, the county's outside them), violent and property crimes per 100,000 residents for
// the newest full year vs the state and the US, ten years of history, the offense mix and the share solved.
//   Building / parcel cards: a "Crime by city / county" section under the Houston street-level one, with a department switcher.
//   Report card (Full report, the Reports tab, the assistant): year by year, offense mix, notes; exports as PDF or CSV.
// Department-level and annual only: every spot a department covers gets the same numbers.
import { reportDoc, savePdf } from './reportkit.js';

const COL = { v: '#c03b3a', p: '#d9822b', st: '#6b7174', us: '#9aa3a6' };

export function initCrimeUS(ctx) {
  const { esc, fmtN } = ctx;
  const cache = new Map();
  // one request per point / department, kept while the app is open
  const load = q => {
    const k = new URLSearchParams(q).toString();
    if (!cache.has(k)) { const p = fetch('api/crimeus?' + k).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'FBI crime data unavailable'); return d; }); p.catch(() => cache.delete(k)); cache.set(k, p); }
    return cache.get(k);
  };
  const query = ({ center, ori }) => ({ ...(center ? { lat: center[1].toFixed(4), lon: center[0].toFixed(4) } : {}), ...(ori ? { ori } : {}) });
  ctx.crimeUSData = o => load(query(o));
  // departments in a state ranked by crime rate (crime library): { state, type, min_pop, order, desc, limit, year }
  ctx.crimeRankings = o => load({ rank: o.state, ...(o.type ? { type: o.type } : {}), ...(o.min_pop ? { min_pop: o.min_pop } : {}), ...(o.order ? { order: o.order } : {}), ...(o.desc ? { desc: '1' } : {}), ...(o.limit ? { limit: o.limit } : {}), ...(o.year ? { year: o.year } : {}) });

  const r1 = v => v == null ? '—' : v >= 100 ? fmtN(Math.round(v)) : String(Math.round(v * 10) / 10);
  const x = v => v == null ? '' : v.toFixed(v >= 10 ? 0 : 1) + '×';
  const pct = v => v == null ? '' : (v > 0 ? '+' : '') + v + '%';
  const vs = (r, st, us, name) => r == null ? '' : [st != null ? x(r / st) + ' ' + name : '', us != null ? x(r / us) + ' US' : ''].filter(Boolean).join(' · ');
  const covers = d => d.population ? fmtN(d.population) + ' residents covered' : '';
  const when = d => d.year ? (d.partial ? d.year + ' (' + d.months + ' of 12 months, annualized)' : String(d.year)) : '';
  const through = d => { const m = String(d.data_through || '').match(/^(\d{1,2})\/(\d{4})$/); return m ? new Date(+m[2], +m[1] - 1, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''; };
  // the department stopped reporting, or reports no population (so no rate): said plainly under the numbers
  // where it sits among the same kind of departments in its state (from the crime library; needs enough peers to mean much)
  const rankText = d => { const k = d.rank; if (!k || !(k.peers >= 20) || k.v_lower_than_pct == null) return '';
    const kind = k.type === 'County' ? 'county departments' : 'city police departments';
    return 'Among ' + fmtN(k.peers) + ' ' + d.state_name + ' ' + kind + ' (' + k.year + ', 2,500+ residents): violent crime lower than ' + k.v_lower_than_pct + '% of them, property crime lower than ' + k.p_lower_than_pct + '%.'; };
  const rankNote = d => rankText(d) ? '<div class="rnote cu-rank">' + esc(rankText(d)) + '</div>' : '';
  const caveats = d => [d.stale ? 'The newest year this department reported to the FBI is ' + d.year + ' (the FBI has full years through ' + d.latest_full_year + ' for others), so these are ' + d.year + '’s figures.' : '',
    d.headline && d.headline.rate_v == null ? 'The FBI lists no population for this department, so only counts are shown, not rates.' : ''].filter(Boolean).map(t => '<div class="rnote">' + esc(t) + '</div>').join('');
  const srcLine = d => 'FBI Crime Data Explorer · reported by the department · calendar ' + when(d) + ' (' + (d.stale ? 'the newest year this department reported' : 'newest full year') + (through(d) ? '; the FBI has partial months through ' + through(d) : '') + '). Rates are per 100,000 residents the department covers.';

  // violent or property rate over the years: the department (solid), the state (dashed) and the US (dotted)
  function trend(years, k, color, aria) {
    const ys = years.filter(y => y.months > 0 || y['state_rate_' + k] != null).slice().reverse(); if (ys.length < 2) return '';
    const W = 300, H = 70, P = 4, vals = ys.flatMap(y => [y['rate_' + k], y['state_rate_' + k], y['us_rate_' + k]]).filter(v => v != null), max = Math.max(1, ...vals) * 1.08;
    const X = i => P + i * (W - 2 * P) / (ys.length - 1), Y = v => P + (H - 2 * P) * (1 - v / max);
    const line = (key, stroke, dash, w) => { let d = '', on = false; ys.forEach((y, i) => { const v = y[key]; if (v == null) { on = false; return; } d += (on ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); on = true; }); return d ? '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>' : ''; };
    const dots = ys.map((y, i) => y['rate_' + k] == null ? '' : '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(y['rate_' + k]).toFixed(1) + '" r="' + (y.months < 12 ? 2.2 : 2.6) + '" fill="' + (y.months < 12 ? '#fff' : color) + '" stroke="' + color + '" stroke-width="1.2"><title>' + esc(y.y + ': ' + r1(y['rate_' + k]) + ' per 100k' + (y.months < 12 ? ' (' + y.months + ' months, annualized)' : '') + (y['state_rate_' + k] != null ? '; state ' + r1(y['state_rate_' + k]) : '') + (y['us_rate_' + k] != null ? '; US ' + r1(y['us_rate_' + k]) : '')) + '</title></circle>').join('');
    const lab = ys.map((y, i) => i === 0 || i === ys.length - 1 || ys.length <= 6 ? '<text x="' + X(i).toFixed(1) + '" y="' + (H + 10) + '" font-size="8.5" text-anchor="' + (i === 0 ? 'start' : i === ys.length - 1 ? 'end' : 'middle') + '" fill="currentColor" opacity=".6">' + y.y + '</text>' : '').join('');
    return '<svg class="cr-bars" viewBox="0 0 ' + W + ' ' + (H + 13) + '" role="img" aria-label="' + esc(aria) + '">' + line('us_rate_' + k, COL.us, '1.5 2.5', 1.2) + line('state_rate_' + k, COL.st, '4 3', 1.2) + line('rate_' + k, color, '', 1.8) + dots + lab + '</svg>';
  }
  const legend = d => '<div class="cr-leg"><span><i style="background:#23282a"></i>' + esc(short(d.agency.name)) + '</span><span><i style="background:' + COL.st + '"></i>' + esc(d.state_name) + ' (dashed)</span><span><i style="background:' + COL.us + '"></i>US (dotted)</span></div>';
  const short = n => String(n).replace(/\s(Police Department|Sheriff's Office|Sheriff’s Office)$/, m => /Sheriff/.test(m) ? ' Sheriff' : ' PD');
  const tiles = d => { const h = d.headline;
    return '<div class="kgrid"><div><b class="cr-v">' + r1(h.rate_v) + '</b><span>Violent per 100k' + (h.change_v != null ? ' · ' + pct(h.change_v) : '') + '</span></div><div><b class="cr-p">' + r1(h.rate_p) + '</b><span>Property per 100k' + (h.change_p != null ? ' · ' + pct(h.change_p) : '') + '</span></div>' +
      '<div><b>' + (esc(vs(h.rate_v, h.state_rate_v, h.us_rate_v, d.state)) || '—') + '</b><span>Violent vs ' + esc(d.state) + ' · US</span></div><div><b>' + (esc(vs(h.rate_p, h.state_rate_p, h.us_rate_p, d.state)) || '—') + '</b><span>Property vs ' + esc(d.state) + ' · US</span></div></div>'; };
  const pickOthers = (d, id) => d.others?.length ? '<label class="cu-oth"><span class="fl">Other departments' + (d.where?.county_name ? ' in ' + esc(d.where.county_name) : '') + '</span><select class="chip" id="' + id + '" aria-label="Show another department"><option value="">' + esc(d.agency?.name || 'Choose a department') + '</option>' +
    d.others.map(o => '<option value="' + esc(o.ori) + '">' + esc(o.name) + '</option>').join('') + '</select></label>' : '';

  // ---------- card section ----------
  ctx.renderCrimeUS = async (el, center, still = () => true, ori = null) => {
    if (!el) return;
    const head = '<div class="lt">Crime by city / county</div>';
    el.innerHTML = head + '<div class="rnote">Finding the local police department…</div>';
    let d; try { d = await ctx.crimeUSData({ center, ori }); } catch (e) { if (still() && el.isConnected) el.innerHTML = head + '<div class="rnote">' + esc(e.message) + '</div>'; return; }
    if (!still() || !el.isConnected) return;
    if (!d.agency || !d.headline) { el.innerHTML = head + '<div class="rnote">' + esc(d.note || 'No department figures for this spot.') + '</div>' + pickOthers(d, 'cuOth'); wireOthers(el, center, still, d); return; }
    el.innerHTML = head + '<div class="cu-ag"><b>' + esc(d.agency.name) + '</b><span>' + esc([when(d), covers(d)].filter(Boolean).join(' · ')) + '</span></div>' + tiles(d) +
      '<div class="fl">Violent crime per 100k, by year</div>' + trend(d.years, 'v', COL.v, 'Violent crime per 100,000 by year') + legend(d) +
      rankNote(d) + caveats(d) + (d.headline.rate_v == null ? '<div class="rnote">' + esc(fmtN(d.headline.v) + ' violent and ' + fmtN(d.headline.p) + ' property offenses in ' + d.year + '.') + '</div>' : '') +
      (d.headline.cleared_v != null ? '<div class="rnote">Solved (cleared): ' + d.headline.cleared_v + '% of violent and ' + d.headline.cleared_p + '% of property offenses in ' + d.year + '.</div>' : '') +
      (d.note ? '<div class="rnote">' + esc(d.note) + '</div>' : '') +
      '<div class="bacts"><button class="btn" type="button" data-cu="report">Full report</button></div>' + pickOthers(d, 'cuOth') +
      '<div class="ssrc src">' + esc(srcLine(d)) + '</div>';
    el.querySelector('[data-cu="report"]').onclick = () => report({ center, ori: d.why === 'chosen' ? d.agency.ori : null });
    wireOthers(el, center, still, d);
  };
  function wireOthers(el, center, still, d) {
    const s = el.querySelector('#cuOth'); if (s) s.onchange = () => { if (s.value) ctx.renderCrimeUS(el, center, still, s.value); };
  }

  // ---------- report card ----------
  let last = null;
  async function report({ center, ori, label }) {
    const card = ctx.card || document.getElementById('card');
    ctx.closeCard?.();
    card.innerHTML = '<div class="top"><div><div class="kicker">Crime by city / county</div><h2>' + esc(label || 'Local police department') + '</h2></div><button class="x" aria-label="Close">×</button></div><div class="bsec"><div class="rnote">Reading the FBI’s figures…</div></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    let d; try { d = await ctx.crimeUSData({ center, ori }); } catch (e) { card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return; }
    if (!d.agency || !d.headline) { card.querySelector('.bsec').innerHTML = '<div class="rnote">' + esc(d.note || 'No department figures here.') + '</div>'; return; }
    last = { d, center };
    const h = d.headline, mix = d.offenses || [];
    card.innerHTML = '<div class="top"><div><div class="kicker">Crime by city / county</div><h2>' + esc(d.agency.name) + '</h2><div class="bsub">' + esc([d.state_name, when(d), covers(d)].filter(Boolean).join(' · ')) + '</div></div><button class="x" aria-label="Close">×</button></div>' +
      '<div class="bsec">' + tiles(d) + '<div class="rnote">' + esc(fmtN(h.v) + ' violent and ' + fmtN(h.p) + ' property offenses in ' + d.year + (h.change_v != null ? '; change is in the rate vs ' + (d.year - 1) : '') + '.') + '</div>' + rankNote(d) + caveats(d) + (d.note ? '<div class="rnote">' + esc(d.note) + '</div>' : '') + '</div>' +
      '<div class="bsec"><div class="lt">Over the years</div><div class="fl">Violent crime per 100k</div>' + trend(d.years, 'v', COL.v, 'Violent crime per 100,000 by year') +
        '<div class="fl">Property crime per 100k</div>' + trend(d.years, 'p', COL.p, 'Property crime per 100,000 by year') + legend(d) +
        '<table class="cu-tbl"><thead><tr><th>Year</th><th>Violent</th><th>' + esc(d.state) + '</th><th>Property</th><th>' + esc(d.state) + '</th></tr></thead><tbody>' +
          d.years.filter(y => y.months > 0).map(y => '<tr><td>' + y.y + (y.months < 12 ? '*' : '') + '</td><td>' + r1(y.rate_v) + '</td><td>' + r1(y.state_rate_v) + '</td><td>' + r1(y.rate_p) + '</td><td>' + r1(y.state_rate_p) + '</td></tr>').join('') + '</tbody></table><div class="rnote">Per 100,000 residents.</div>' +
        (d.years.some(y => y.months > 0 && y.months < 12) ? '<div class="rnote">* The department reported only part of that year; the rate is scaled up to 12 months.</div>' : '') + '</div>' +
      (mix.length ? '<div class="bsec"><div class="lt">Offenses in ' + d.year + ' (per 100k)</div><dl>' + mix.map(o => '<dt>' + esc(o.name) + '</dt><dd class="mono">' + fmtN(o.n) + ' <span class="sc">' + r1(o.rate) + (o.state_rate != null ? ' · ' + esc(d.state) + ' ' + r1(o.state_rate) : '') + (o.us_rate != null ? ' · US ' + r1(o.us_rate) : '') + '</span></dd>').join('') + '</dl></div>' : '') +
      (h.cleared_v != null ? '<div class="bsec"><div class="lt">Solved</div><div>' + h.cleared_v + '% of violent and ' + h.cleared_p + '% of property offenses were cleared (an arrest or another final outcome) in ' + d.year + '.</div></div>' : '') +
      '<div class="bsec">' + pickOthers(d, 'cuRepOth') + '</div>' +
      '<div class="bacts"><button class="btn primary" id="cuPdf" type="button">Export PDF</button><button class="btn" id="cuCsv" type="button">Export CSV</button></div>' +
      '<div class="rnote bsec">Department-level, whole-year figures: every spot the department covers gets the same numbers, and there is no street-level detail. Places that draw many visitors or commuters read high because rates use residents only. The FBI keeps adding late reports, so the newest year can still move a little.<span class="src"> ' + esc(srcLine(d) + ' ' + d.coverage) + '</span></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#cuPdf').onclick = exportReport; card.querySelector('#cuCsv').onclick = exportCsv;
    const s = card.querySelector('#cuRepOth'); if (s) s.onchange = () => { if (s.value) report({ center, ori: s.value }); };
  }
  ctx.crimeUSReport = report;

  const slug = s => String(s || 'department').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  async function exportCsv() {
    if (!last) return; const { d } = last;
    ctx.exportMeta = { report: 'crimeus', format: 'csv', scope: d.agency.name, filings: d.years.filter(y => y.months > 0).length, unit: 'years' };
    try { ctx.exportCsv(d.years.filter(y => y.months > 0).map(y => ({ Department: d.agency.name, 'FBI agency ID': d.agency.ori, Year: y.y, 'Months reported': y.months, Population: y.pop ?? '', 'Violent offenses': y.v ?? '', 'Property offenses': y.p ?? '',
      'Violent per 100k': y.rate_v ?? '', 'Property per 100k': y.rate_p ?? '', [d.state + ' violent per 100k']: y.state_rate_v ?? '', [d.state + ' property per 100k']: y.state_rate_p ?? '', 'US violent per 100k': y.us_rate_v ?? '', 'US property per 100k': y.us_rate_p ?? '',
      'Violent cleared %': y.cleared_v ?? '', 'Property cleared %': y.cleared_p ?? '' })), 'crime-' + slug(d.agency.name) + '-' + new Date().toISOString().slice(0, 10)); }
    finally { ctx.exportMeta = null; }
  }
  async function exportReport() {
    if (!last) return; const { d } = last, h = d.headline;
    const body = '<div class="kp"><div><b style="color:' + COL.v + '">' + r1(h.rate_v) + '</b><span>Violent per 100k' + (h.change_v != null ? ' · ' + pct(h.change_v) : '') + '</span></div><div><b style="color:' + COL.p + '">' + r1(h.rate_p) + '</b><span>Property per 100k' + (h.change_p != null ? ' · ' + pct(h.change_p) : '') + '</span></div>' +
        '<div><b>' + esc(vs(h.rate_v, h.state_rate_v, h.us_rate_v, d.state) || '—') + '</b><span>Violent vs ' + esc(d.state) + ' · US</span></div><div><b>' + esc(vs(h.rate_p, h.state_rate_p, h.us_rate_p, d.state) || '—') + '</b><span>Property vs ' + esc(d.state) + ' · US</span></div></div>' +
      '<p class="meta">' + esc(fmtN(h.v) + ' violent and ' + fmtN(h.p) + ' property offenses in ' + d.year + ', ' + covers(d) + '. ' + (d.note || '') + (h.cleared_v != null ? ' Cleared: ' + h.cleared_v + '% of violent and ' + h.cleared_p + '% of property offenses.' : '') + (rankText(d) ? ' ' + rankText(d) : '')) + '</p>' +
      '<div class="two"><div><h2>Violent crime per 100,000</h2><div class="bars">' + trend(d.years, 'v', COL.v, 'Violent') + '</div></div><div><h2>Property crime per 100,000</h2><div class="bars">' + trend(d.years, 'p', COL.p, 'Property') + '</div></div></div>' +
      '<p class="meta">Solid: ' + esc(d.agency.name) + '. Dashed: ' + esc(d.state_name) + '. Dotted: United States. Open dots: part-year, scaled to 12 months.</p>' +
      '<h2>Year by year</h2><table><thead><tr><th>Year</th><th class="r">Months</th><th class="r">Population</th><th class="r">Violent</th><th class="r">per 100k</th><th class="r">' + esc(d.state) + '</th><th class="r">US</th><th class="r">Property</th><th class="r">per 100k</th><th class="r">' + esc(d.state) + '</th><th class="r">US</th></tr></thead><tbody>' +
        d.years.filter(y => y.months > 0).map(y => '<tr><td>' + y.y + '</td><td class="m r">' + y.months + '</td><td class="m r">' + (y.pop ? fmtN(y.pop) : '') + '</td><td class="m r">' + fmtN(y.v) + '</td><td class="m r">' + r1(y.rate_v) + '</td><td class="m r">' + r1(y.state_rate_v) + '</td><td class="m r">' + r1(y.us_rate_v) + '</td><td class="m r">' + fmtN(y.p) + '</td><td class="m r">' + r1(y.rate_p) + '</td><td class="m r">' + r1(y.state_rate_p) + '</td><td class="m r">' + r1(y.us_rate_p) + '</td></tr>').join('') + '</tbody></table>' +
      ((d.offenses || []).length ? '<h2>Offenses in ' + d.year + '</h2><table><thead><tr><th>Offense</th><th class="r">Count</th><th class="r">per 100k</th><th class="r">' + esc(d.state) + ' per 100k</th><th class="r">US per 100k</th></tr></thead><tbody>' +
        d.offenses.map(o => '<tr><td>' + esc(o.name) + '</td><td class="m r">' + fmtN(o.n) + '</td><td class="m r">' + r1(o.rate) + '</td><td class="m r">' + r1(o.state_rate) + '</td><td class="m r">' + r1(o.us_rate) + '</td></tr>').join('') + '</tbody></table>' : '');
    const sources = 'FBI Crime Data Explorer (Uniform Crime Reporting), offenses reported by ' + esc(d.agency.name) + ' (FBI agency ' + esc(d.agency.ori) + ')' + (d.refreshed ? ', FBI data refreshed ' + esc(d.refreshed) : '') + '. ' + esc(d.coverage) +
      ' Violent = murder, rape, robbery, aggravated assault; property = burglary, theft, vehicle theft (arson listed separately). State and US rates sum the FBI’s monthly rates for the year. Rates use the residents the department covers, so places with many visitors read high.';
    await savePdf(ctx, 'crimeus', d.agency.name, reportDoc({ kicker: 'Crime by city / county', title: d.agency.name, meta: esc([d.state_name, when(d), covers(d)].filter(Boolean).join(' · ')), body, sources }), { meta: { report: 'crimeus', filings: d.years.length, unit: 'years' } });
  }

  // the Reports tab: for the map center or the middle of the selected area
  ctx.crimeUSReportFor = which => {
    let c;
    if (which === 'selection') { const g = ctx.sel?.feature?.geometry || ctx.sel?.feature; if (!g) return false; const pts = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates || []).flat(2); if (!pts.length) return false;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } c = [(x0 + x1) / 2, (y0 + y1) / 2]; }
    else { const m = ctx.map.getCenter(); c = [m.lng, m.lat]; }
    report({ center: c }); return true;
  };
}
