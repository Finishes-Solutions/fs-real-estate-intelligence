// The City / County crime report (FBI Crime Data Explorer) as HTML strings: the pieces the card shows and the printable report
// its PDF export sends (src/crimeus.js), also made by the MCP server's report tool (lib/mcp/reports.mjs). DOM-free; the report
// kit (src/reportkit.js) and the app's number format are passed in, since this file is loaded from lib/ in the browser and Node.
export const COL = { v: '#c03b3a', p: '#d9822b', st: '#6b7174', us: '#9aa3a6' };
// K: { esc, fmtN, areaMap, reportDoc }
export function crimeUSReport(K) {
  const { esc, fmtN, areaMap, reportDoc } = K;
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
    const line = (key, stroke, dash, w) => { let d = '', on = false; ys.forEach((y, i) => { const v = y[key]; if (v == null) { on = false; return; } d += (on ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); on = true; }); return d ? '<path class="m-line" d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>' : ''; };
    const dots = ys.map((y, i) => y['rate_' + k] == null ? '' : '<circle class="m-dot" cx="' + X(i).toFixed(1) + '" cy="' + Y(y['rate_' + k]).toFixed(1) + '" r="' + (y.months < 12 ? 2.2 : 2.6) + '" fill="' + (y.months < 12 ? '#fff' : color) + '" stroke="' + color + '" stroke-width="1.2"><title>' + esc(y.y + ': ' + r1(y['rate_' + k]) + ' per 100k' + (y.months < 12 ? ' (' + y.months + ' months, annualized)' : '') + (y['state_rate_' + k] != null ? '; state ' + r1(y['state_rate_' + k]) : '') + (y['us_rate_' + k] != null ? '; US ' + r1(y['us_rate_' + k]) : '')) + '</title></circle>').join('');
    const lab = ys.map((y, i) => i === 0 || i === ys.length - 1 || ys.length <= 6 ? '<text x="' + X(i).toFixed(1) + '" y="' + (H + 10) + '" font-size="8.5" text-anchor="' + (i === 0 ? 'start' : i === ys.length - 1 ? 'end' : 'middle') + '" fill="currentColor" opacity=".6">' + y.y + '</text>' : '').join('');
    return '<svg class="cr-bars" viewBox="0 0 ' + W + ' ' + (H + 13) + '" role="img" aria-label="' + esc(aria) + '">' + line('us_rate_' + k, COL.us, '1.5 2.5', 1.2) + line('state_rate_' + k, COL.st, '4 3', 1.2) + line('rate_' + k, color, '', 1.8) + dots + lab + '</svg>';
  }
  // the whole printable report; center: where it was asked for (a dot on the map), or null
  function reportHtml(d, center) {
    const h = d.headline;
    // where the report was asked for (the department covers the city or county around it)
    const loc = Array.isArray(center) ? '<div class="map">' + areaMap([], { W: 1000, H: 300, points: [{ c: center, r: 7, color: '#c2410c', label: 'This location' }], minSpanM: 9000 }) + '</div>' : '';
    const body = loc + '<div class="kp"><div><b style="color:' + COL.v + '">' + r1(h.rate_v) + '</b><span>Violent per 100k' + (h.change_v != null ? ' · ' + pct(h.change_v) : '') + '</span></div><div><b style="color:' + COL.p + '">' + r1(h.rate_p) + '</b><span>Property per 100k' + (h.change_p != null ? ' · ' + pct(h.change_p) : '') + '</span></div>' +
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
    return reportDoc({ kicker: 'Crime by city / county', title: d.agency.name, meta: esc([d.state_name, when(d), covers(d)].filter(Boolean).join(' · ')), body, sources });
  }
  return { r1, x, pct, vs, covers, when, through, rankText, rankNote, caveats, srcLine, trend, reportHtml };
}

// the department's years as CSV rows (the card's Export CSV and the MCP report tool)
export const crimeUSCsvRows = d => d.years.filter(y => y.months > 0).map(y => ({ Department: d.agency.name, 'FBI agency ID': d.agency.ori, Year: y.y, 'Months reported': y.months, Population: y.pop ?? '', 'Violent offenses': y.v ?? '', 'Property offenses': y.p ?? '',
  'Violent per 100k': y.rate_v ?? '', 'Property per 100k': y.rate_p ?? '', [d.state + ' violent per 100k']: y.state_rate_v ?? '', [d.state + ' property per 100k']: y.state_rate_p ?? '', 'US violent per 100k': y.us_rate_v ?? '', 'US property per 100k': y.us_rate_p ?? '',
  'Violent cleared %': y.cleared_v ?? '', 'Property cleared %': y.cleared_p ?? '' }));
