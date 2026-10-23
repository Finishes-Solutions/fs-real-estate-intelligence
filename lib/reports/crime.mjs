// The Houston crime report as HTML strings: the charts and tables the map card shows and the printable report its PDF
// export sends (src/crime.js), also made by the MCP server's report tool (lib/mcp/reports.mjs). DOM-free; the report kit
// (src/reportkit.js) and the app's number format are passed in, since this file is loaded from lib/ in the browser and Node.
import { CAT_NAME } from '../nibrs.mjs';

export const COL = { v: '#c03b3a', p: '#d9822b', o: '#8a9396' };
// K: { esc, fmtN, areaSvg, reportDoc }
export function crimeReport(K) {
  const { esc, fmtN, areaSvg, reportDoc } = K;
  const monthName = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'the latest month';
  const pct = v => v == null ? '—' : (v > 0 ? '+' : '') + v + '%';
  function monthBars(months) {
    if (!months?.length) return '';
    const W = 320, H = 90, max = Math.max(1, ...months.map(m => m.v + m.p + m.o)), bw = W / months.length;
    return '<svg class="cr-bars" viewBox="0 0 ' + W + ' ' + (H + 14) + '" role="img" aria-label="Incidents per month">' + months.map((m, i) => {
      const x = i * bw + 1, w = Math.max(1, bw - 2), hv = m.v / max * H, hp = m.p / max * H, ho = m.o / max * H;
      return '<g><title>' + esc(m.m + ': ' + (m.v + m.p + m.o) + ' incidents (' + m.v + ' violent, ' + m.p + ' property, ' + m.o + ' other)') + '</title>' +
        '<rect class="m-bar" x="' + x.toFixed(1) + '" y="' + (H - hv).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hv.toFixed(1) + '" fill="' + COL.v + '"/>' +
        '<rect class="m-bar" x="' + x.toFixed(1) + '" y="' + (H - hv - hp).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hp.toFixed(1) + '" fill="' + COL.p + '"/>' +
        '<rect class="m-bar" x="' + x.toFixed(1) + '" y="' + (H - hv - hp - ho).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + ho.toFixed(1) + '" fill="' + COL.o + '" fill-opacity=".55"/>' +
        (m.m.endsWith('-01') || i === 0 ? '<text x="' + x.toFixed(1) + '" y="' + (H + 11) + '" font-size="8.5" fill="currentColor" opacity=".6">' + m.m.slice(0, 4) + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }
  // stacked violent / property / other bars for any list: [{ label, v, p, o }]
  function catBars(list, aria) {
    if (!list?.length || !list.some(x => x.v + x.p + x.o)) return '';
    const W = 320, H = 70, max = Math.max(1, ...list.map(m => m.v + m.p + m.o)), bw = W / list.length, every = list.length > 12 ? 3 : 1;
    return '<svg class="cr-bars" viewBox="0 0 ' + W + ' ' + (H + 14) + '" role="img" aria-label="' + esc(aria) + '">' + list.map((m, i) => {
      const x = i * bw + 1, w = Math.max(1, bw - 2), hv = m.v / max * H, hp = m.p / max * H, ho = m.o / max * H;
      return '<g><title>' + esc(m.label + ': ' + (m.v + m.p + m.o) + ' incidents (' + m.v + ' violent, ' + m.p + ' property, ' + m.o + ' other)') + '</title>' +
        '<rect class="m-bar" x="' + x.toFixed(1) + '" y="' + (H - hv).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hv.toFixed(1) + '" fill="' + COL.v + '"/>' +
        '<rect class="m-bar" x="' + x.toFixed(1) + '" y="' + (H - hv - hp).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + hp.toFixed(1) + '" fill="' + COL.p + '"/>' +
        '<rect class="m-bar" x="' + x.toFixed(1) + '" y="' + (H - hv - hp - ho).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + ho.toFixed(1) + '" fill="' + COL.o + '" fill-opacity=".55"/>' +
        (i % every === 0 ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H + 11) + '" font-size="8.5" text-anchor="middle" fill="currentColor" opacity=".6">' + esc(m.short || m.label) + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], HR = h => (h % 12 || 12) + (h < 12 ? 'a' : 'p');
  const hourList = d => Array.from({ length: 24 }, (_, h) => { const x = (d.hours || []).find(r => r.h === h) || { v: 0, p: 0, o: 0 }; return { label: HR(h), short: HR(h), v: x.v, p: x.p, o: x.o }; });
  const dowList = d => DOW.map((n, i) => { const x = (d.weekdays || []).find(r => r.d === i) || { v: 0, p: 0, o: 0 }; return { label: n, v: x.v, p: x.p, o: x.o }; });
  // "when" in words: the busiest 3-hour stretch and the busiest day
  function whenLine(d) {
    const hs = hourList(d).map(x => x.v + x.p + x.o), tot = hs.reduce((a, b) => a + b, 0), parts = [];
    if (tot) { let best = 0, at = 0; for (let h = 0; h < 24; h++) { const s = hs[h] + hs[(h + 1) % 24] + hs[(h + 2) % 24]; if (s > best) { best = s; at = h; } }
      parts.push('Busiest 3 hours: ' + HR(at) + '–' + HR((at + 3) % 24) + ' (' + Math.round(best / tot * 100) + '% of incidents with a known time)'); }
    const ds = dowList(d).map(x => ({ n: x.label, t: x.v + x.p + x.o })).sort((a, b) => b.t - a.t);
    if (ds[0]?.t) parts.push('busiest day ' + ds[0].n + ', quietest ' + ds[ds.length - 1].n);
    return parts.join('; ');
  }
  // year by year, as a yearly pace (partial years scaled to 365 days) next to Houston's own change
  function yearRows(d) {
    const city = new Map((d.city_years || []).map(x => [x.y, x.n])), ys = (d.years || []).filter(y => y.days >= 28);
    return ys.map((y, i) => { const pace = Math.round(y.total / y.days * 365), prev = ys[i - 1], pPace = prev ? prev.total / prev.days * 365 : null;
      const cNow = city.get(y.y), cPrev = prev ? city.get(prev.y) : null, cPace = cNow && y.days ? cNow / y.days * 365 : null, cPrevPace = cPrev && prev?.days ? cPrev / prev.days * 365 : null;
      return { y: y.y, total: y.total, v: y.v, p: y.p, days: y.days, partial: y.days < 360, pace, change: pPace ? Math.round((pace / pPace - 1) * 100) : null, city_change: cPace && cPrevPace ? Math.round((cPace / cPrevPace - 1) * 100) : null }; });
  }
  const rateLine = d => d.per_sqmi && d.city_per_sqmi ? fmtN(d.per_sqmi.total) + ' per sq mi a year vs ' + fmtN(d.city_per_sqmi.total) + ' citywide (' + (d.per_sqmi.total / d.city_per_sqmi.total).toFixed(1) + '×)' : '';
  // the area and its incidents on a street map, for the printed report
  const reportMap = (g, list) => areaSvg([{ geometry: g, stroke: '#c2410c', fill: 'rgba(194,65,12,.06)', dash: true }],
    { fit: g, points: list.slice().reverse().map(x => ({ c: [x.lon, x.lat], r: x.cat === 'v' ? 3.6 : 2.6, color: COL[x.cat], o: x.cat === 'o' ? .5 : .9 })) });
  // the whole printable report; res: incidents per 1,000 residents ({ rate, v, pop }) when known; rows: how many incidents
  // the table lists (default 1,000; the MCP report lists fewer when the PDF must be smaller)
  function reportHtml(d, label, geometry, res, { rows = 1000 } = {}) {
    const L = d.last12;
    const list = d.incidents || [];
    const body = '' +
      '<div class="kp"><div><b>' + fmtN(L.total) + '</b><span>Incidents · ' + pct(d.change.total) + '</span></div><div><b style="color:' + COL.v + '">' + fmtN(L.v) + '</b><span>Violent · ' + pct(d.change.v) + '</span></div><div><b style="color:' + COL.p + '">' + fmtN(L.p) + '</b><span>Property · ' + pct(d.change.p) + '</span></div><div><b>' + fmtN(L.o) + '</b><span>Other · ' + pct(d.change.o) + '</span></div></div>' +
      '<p class="meta">Change is against the 12 months before (' + fmtN(d.prior12.total) + ' incidents). ' + esc(rateLine(d)) + '</p>' +
      '<div class="map">' + reportMap(geometry, list) + '</div><div class="lg"><span><i style="background:' + COL.v + '"></i>Violent</span><span><i style="background:' + COL.p + '"></i>Property</span><span><i style="background:' + COL.o + '"></i>Other</span>' + (list.length >= 2000 ? '<span>Newest 2,000 incidents shown</span>' : '') + '</div>' +
      '<h2>Incidents per month</h2><div class="bars">' + monthBars(d.months) + '</div>' +
      (d.hours?.length ? '<h2>By hour of day (last 12 months)</h2><div class="bars">' + catBars(hourList(d), 'By hour') + '</div>' : '') +
      '<h2>By day of week (last 12 months)</h2><div class="bars">' + catBars(dowList(d), 'By day') + '</div><p class="meta">' + esc(whenLine(d)) + '</p>' +
      (yearRows(d).length > 1 ? '<h2>Year by year</h2><table><thead><tr><th>Year</th><th class="r">Incidents</th><th class="r">Violent</th><th class="r">Property</th><th class="r">Yearly pace</th><th class="r">Change</th><th class="r">Houston change</th></tr></thead><tbody>' +
        yearRows(d).map(y => '<tr><td>' + y.y + (y.partial ? '*' : '') + '</td><td class="m r">' + fmtN(y.total) + '</td><td class="m r">' + fmtN(y.v) + '</td><td class="m r">' + fmtN(y.p) + '</td><td class="m r">' + fmtN(y.pace) + '</td><td class="m r">' + (y.change != null ? pct(y.change) : '') + '</td><td class="m r">' + (y.city_change != null ? pct(y.city_change) : '') + '</td></tr>').join('') + '</tbody></table><p class="meta">* Partial year (the data starts or ends mid-year); changes compare the yearly pace.</p>' : '') +
      (res ? '<p><b>' + res.rate + ' incidents per 1,000 residents a year</b> (' + res.v + ' violent), ' + fmtN(res.pop) + ' residents in the census tracts here.</p>' : '') +
      '<div class="two"><div><h2>Top offenses</h2><table><thead><tr><th>Offense</th><th>Type</th><th class="r">Count</th></tr></thead><tbody>' + d.offenses.map(o => '<tr><td>' + esc(o.name) + '</td><td>' + esc(CAT_NAME[o.cat] || '') + '</td><td class="m r">' + fmtN(o.n) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div><h2>Where they happened</h2><table><thead><tr><th>Premise</th><th class="r">Count</th></tr></thead><tbody>' + d.premises.map(p => '<tr><td>' + esc(p.premise) + '</td><td class="m r">' + fmtN(p.n) + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="full"><h2>Incidents (' + fmtN(list.length) + (list.length >= 2000 ? ', newest' : '') + ')</h2>' + (list.length > rows ? '<p class="rnote">The newest ' + fmtN(rows) + ' are listed here; Export CSV has all ' + fmtN(list.length) + '.</p>' : '') + '<table><thead><tr><th>Date</th><th>Offense</th><th>Type</th><th>Premise</th><th class="r">Count</th></tr></thead><tbody>' +
      list.slice(0, rows).map(x => '<tr><td class="m">' + esc(x.day) + '</td><td>' + esc(x.offense) + '</td><td>' + esc(CAT_NAME[x.cat] || '') + '</td><td>' + esc(x.premise || '') + '</td><td class="m r">' + x.n + '</td></tr>').join('') + '</tbody></table></div>' +
      '';
    const sources = 'Houston Police Department NIBRS public incident data, ' + esc(d.from) + ' to ' + esc(d.latest) + '. ' + esc(d.coverage) + ' Violent = murder, rape, robbery, aggravated assault; property = burglary, theft, vehicle theft, arson, vandalism; other = all remaining offenses. Counts follow activity: busy commercial areas show more incidents than homes nearby. Locations are block-level.';
    return reportDoc({ kicker: 'Crime report', title: label, meta: '12 months through ' + esc(monthName(d.latest)) + (d.area_sqmi ? ' · ' + d.area_sqmi.toFixed(2) + ' sq mi' : ''), body, sources });
  }
  return { monthName, pct, monthBars, catBars, hourList, dowList, whenLine, yearRows, rateLine, reportHtml };
}

// incidents as CSV rows (the card's Export CSV and the MCP report tool)
export const crimeCsvRows = list => list.map(x => ({ Date: x.day, Offense: x.offense, 'NIBRS code': x.code, Category: CAT_NAME[x.cat] || x.cat, Count: x.n, Premise: x.premise || '', Latitude: x.lat, Longitude: x.lon }));
