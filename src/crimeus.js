// Crime by city / county anywhere in the US (FBI Crime Data Explorer, via api/crimeus): the police department that covers a
// point (the city's own inside city limits, the county's outside them), violent and property crimes per 100,000 residents for
// the newest full year vs the state and the US, ten years of history, the offense mix and the share solved.
//   Building / parcel cards: a "Crime by city / county" section under the Houston street-level one, with a department switcher.
//   Report card (Full report, the Reports tab, the assistant): year by year, offense mix, notes; exports as PDF or CSV.
// Department-level and annual only: every spot a department covers gets the same numbers.
import { reportDoc, savePdf, saveCsv, areaMap, getJSON, errorBox, fileBase, friendly } from './reportkit.js';
import { reveal } from './motion.js';
import { crimeUSReport, crimeUSCsvRows, COL } from './lib/reports/crimeus.mjs';


export function initCrimeUS(ctx) {
  const { esc, fmtN } = ctx;
  const cache = new Map();
  // one request per point / department, kept while the app is open
  const load = q => {
    const k = new URLSearchParams(q).toString();
    if (!cache.has(k)) { const p = getJSON('api/crimeus?' + k, { what: 'FBI crime data' }); p.catch(() => cache.delete(k)); cache.set(k, p); }
    return cache.get(k);
  };
  const query = ({ center, ori }) => ({ ...(center ? { lat: center[1].toFixed(4), lon: center[0].toFixed(4) } : {}), ...(ori ? { ori } : {}) });
  ctx.crimeUSData = o => load(query(o));
  // departments in a state ranked by crime rate (crime library): { state, type, min_pop, order, desc, limit, year }
  ctx.crimeRankings = o => load({ rank: o.state, ...(o.type ? { type: o.type } : {}), ...(o.min_pop ? { min_pop: o.min_pop } : {}), ...(o.order ? { order: o.order } : {}), ...(o.desc ? { desc: '1' } : {}), ...(o.limit ? { limit: o.limit } : {}), ...(o.year ? { year: o.year } : {}) });

  const { r1, x, pct, vs, covers, when, through, rankText, rankNote, caveats, srcLine, trend, reportHtml } = crimeUSReport({ esc, fmtN, areaMap, reportDoc });
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
    // switching department: keep what's shown (a one-line placeholder would shrink the card and scroll it away) and,
    // once the new department is in, put its picker back where the old one was on screen
    const pick = ori && el.querySelector('#cuOth'), y0 = pick?.getBoundingClientRect().top;
    if (pick) { pick.disabled = true; pick.closest('.cu-oth')?.querySelector('.fl')?.insertAdjacentHTML('beforeend', ' <span class="cu-ld">· loading…</span>'); }
    else el.innerHTML = head + '<div class="rnote loading">Finding the local police department…</div>';
    const keep = () => { if (y0 == null) return; const s = el.querySelector('#cuOth'), sc = el.closest('#card'); if (s && sc) sc.scrollTop += s.getBoundingClientRect().top - y0; s?.focus({ preventScroll: true }); };
    let d; try { d = await ctx.crimeUSData({ center, ori }); } catch (e) { if (!still() || !el.isConnected) return; if (pick) { pick.disabled = false; el.querySelector('.cu-ld')?.remove(); ctx.toast?.(friendly(e, 'FBI crime data')); } else { el.innerHTML = head; el.append(errorBox(e, () => ctx.renderCrimeUS(el, center, still, ori), 'FBI crime data')); } return; }
    if (!still() || !el.isConnected) return;
    if (!d.agency || !d.headline) { el.innerHTML = head + '<div class="rnote">' + esc(d.note || 'No department figures for this spot.') + '</div>' + pickOthers(d, 'cuOth'); wireOthers(el, center, still, d); keep(); return; }
    el.innerHTML = head + '<div class="cu-ag"><b>' + esc(d.agency.name) + '</b><span>' + esc([when(d), covers(d)].filter(Boolean).join(' · ')) + '</span></div>' + tiles(d) +
      '<div class="fl">Violent crime per 100k, by year</div>' + trend(d.years, 'v', COL.v, 'Violent crime per 100,000 by year') + legend(d) +
      rankNote(d) + caveats(d) + (d.headline.rate_v == null ? '<div class="rnote">' + esc(fmtN(d.headline.v) + ' violent and ' + fmtN(d.headline.p) + ' property offenses in ' + d.year + '.') + '</div>' : '') +
      (d.headline.cleared_v != null ? '<div class="rnote">Solved (cleared): ' + d.headline.cleared_v + '% of violent and ' + d.headline.cleared_p + '% of property offenses in ' + d.year + '.</div>' : '') +
      (d.note ? '<div class="rnote">' + esc(d.note) + '</div>' : '') +
      '<div class="bacts"><button class="btn" type="button" data-push data-cu="report">Full report</button></div>' + pickOthers(d, 'cuOth') +
      '<div class="ssrc src">' + esc(srcLine(d)) + '</div>';
    reveal(el, 'cu:sec:' + (d.agency.ori || d.agency.name)); // the trend draws in once per department (src/motion.js)
    el.querySelector('[data-cu="report"]').onclick = () => report({ center, ori: d.why === 'chosen' ? d.agency.ori : null });
    wireOthers(el, center, still, d); keep();
  };
  function wireOthers(el, center, still, d) {
    const s = el.querySelector('#cuOth'); if (s) s.onchange = () => { if (s.value) ctx.renderCrimeUS(el, center, still, s.value); };
  }

  // ---------- report card ----------
  let last = null;
  async function report({ center, ori, label }) {
    const card = ctx.card || document.getElementById('card');
    ctx.closeCard?.();
    card.innerHTML = '<div class="top"><div><div class="kicker">Crime by city / county</div><h2>' + esc(label || 'Local police department') + '</h2></div><button class="x" aria-label="Close">×</button></div><div class="bsec"><div class="rnote loading">Reading the FBI’s figures…</div></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    let d; try { d = await ctx.crimeUSData({ center, ori }); } catch (e) { card.querySelector('.bsec').replaceChildren(errorBox(e, () => report({ center, ori, label }), 'FBI crime data')); return; }
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
    reveal(card, 'cu:card:' + (d.agency.ori || d.agency.name));
    card.querySelector('#cuPdf').onclick = exportReport; card.querySelector('#cuCsv').onclick = exportCsv;
    const s = card.querySelector('#cuRepOth'); if (s) s.onchange = () => { if (s.value) report({ center, ori: s.value }); };
  }
  ctx.crimeUSReport = report;

  async function exportCsv() {
    if (!last) return; const { d } = last;
    ctx.exportMeta = { report: 'crimeus', format: 'csv', scope: d.agency.name, filings: d.years.filter(y => y.months > 0).length, unit: 'years' };
    try { ctx.exportCsv(crimeUSCsvRows(d), fileBase('crimeus', d.agency.name)); }
    finally { ctx.exportMeta = null; }
  }
  async function exportReport() {
    if (!last) return; const { d, center } = last;
    await savePdf(ctx, 'crimeus', d.agency.name, reportHtml(d, center), { meta: { report: 'crimeus', filings: d.years.length, unit: 'years' } });
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
