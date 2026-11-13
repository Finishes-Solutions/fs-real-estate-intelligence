// The FEMA flood & hazard report as HTML strings, shared by the map card and its PDF export (src/fema.js) and the MCP
// server's report tool (lib/mcp/reports.mjs). DOM-free. The report kit (src/reportkit.js: reportDoc, areaMap, esc, …) and the
// app's number formats are passed in, since this file is loaded from lib/ in the browser and in Node alike.
export const RISK_COL = { high: '#1d4ed8', moderate: '#f59e0b', minimal: '#9ca3af', undetermined: '#a78bfa', water: '#38bdf8', unmapped: '#e5e7eb' };
export const RISK_SHORT = { high: 'High risk (100-year)', moderate: 'Moderate (500-year)', minimal: 'Minimal', undetermined: 'Not studied', water: 'Open water', unmapped: 'Not mapped' };

// K: { esc, fmtN, fmtM, unavailable, areaMap, reportDoc } -> { body(d), reportHtml(d, label, geometry) }
export function femaReport(K) {
  const { esc, fmtN, fmtM, unavailable, areaMap, reportDoc } = K;
  const shareBar = sh => { const order = ['high', 'moderate', 'minimal', 'undetermined', 'water', 'unmapped'].filter(k => sh[k]); return '<div class="fm-bar m-hbar">' + order.map(k => '<i style="width:' + sh[k] + '%;background:' + RISK_COL[k] + '" title="' + esc(RISK_SHORT[k] + ': ' + sh[k] + '%') + '"></i>').join('') + '</div><div class="fm-leg">' + order.map(k => '<span><i style="background:' + RISK_COL[k] + '"></i>' + esc(RISK_SHORT[k]) + ' <b>' + sh[k] + '%</b></span>').join('') + '</div>'; };
  function yearBars(rows) {
    if (!rows?.length) return '';
    const y0 = Math.min(...rows.map(r => r.year)), y1 = Math.max(...rows.map(r => r.year)), all = []; for (let y = y0; y <= y1; y++) all.push(rows.find(r => r.year === y) || { year: y, claims: 0, paid: 0 });
    // year labels: on multiples of a step wide enough that they never collide, centred on their bar, none cut off at the ends
    const W = 320, H = 70, max = Math.max(1, ...all.map(r => r.paid)), bw = W / all.length, FS = 10.5, lw = FS * 0.62 * 4;
    const step = [5, 10, 20, 50].find(k => k * bw >= lw + 8) || 50, lab = (r, i) => { const x = i * bw + bw / 2; return r.year % step === 0 && x - lw / 2 >= 0 && x + lw / 2 <= W; };
    return '<svg class="cr-bars" viewBox="0 0 ' + W + ' ' + (H + 15) + '" role="img" aria-label="Flood claims paid per year">' + all.map((r, i) => '<g><title>' + esc(r.year + ': ' + r.claims + ' claims, ' + fmtM(r.paid) + ' paid') + '</title><rect class="m-bar" x="' + (i * bw + .5).toFixed(1) + '" y="' + (H - r.paid / max * H).toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + (r.paid / max * H).toFixed(1) + '" fill="#1d4ed8"/>' +
      (lab(r, i) ? '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (H + 12) + '" font-size="' + FS + '" text-anchor="middle" fill="currentColor" opacity=".7">' + r.year + '</text>' : '') + '</g>').join('') + '</svg>';
  }
  // a part still loading (the map card shows each part as it lands)
  const wait = '<div class="rnote loading">Still loading…</div>';
  // a part that failed: the sentence, and a Retry that asks again for just that part (the map card wires data-fretry)
  const err = (x, what = 'This part of the report', key = '') => x?.error ? '<div class="rnote err eb" role="alert"><span>' + esc(/in time/.test(x.error) ? 'Didn’t finish in time.' : unavailable(what)) + '</span>' + (key ? ' <button class="lnk eb-retry" type="button" data-fretry="' + key + '">Retry</button>' : '') + '</div>' : '';
  function body(d) {
    const z = d.flood_zones || {}, c = d.nfip_claims || {}, s = d.disasters || {}, n = d.risk_index;
    return '<div class="bsec"><div class="lt">Flood zones</div>' + (z.pending ? wait : z.shares ? shareBar(z.shares) + '<div class="rnote">' + [z.zones?.length ? 'FEMA zones here: ' + z.zones.map(x => x.zone + ' ' + x.pct + '%').join(', ') : '', z.floodway ? 'Includes regulatory floodway (building is restricted).' : '', z.bfe ? 'Base flood elevation ' + (z.bfe.min === z.bfe.max ? z.bfe.min : z.bfe.min + '–' + z.bfe.max) + ' ft.' : '', z.truncated ? 'Area has many zone shapes; shares are approximate.' : '', z.method === 'points' ? 'Shares are measured at ' + fmtN(z.samples) + ' evenly spaced points across the area.' : ''].filter(Boolean).map(esc).join(' ') + '</div>' : z.skipped ? '<div class="rnote">' + esc(z.skipped) + '</div>' : err(z, 'Flood zone data', 'flood_zones')) + '</div>' +
      '<div class="bsec"><div class="lt">Flood insurance claims (NFIP)</div>' + (c.pending ? wait : c.error ? err(c, 'Flood insurance claims', 'nfip_claims') : '<div class="kgrid"><div><b>' + fmtN(c.claims || 0) + '</b><span>Claims paid</span></div><div><b>' + fmtM(c.paid || 0) + '</b><span>Total paid</span></div><div><b>' + (c.avg_paid ? fmtM(c.avg_paid) : '—') + '</b><span>Average claim</span></div><div><b>' + fmtN(c.last_10_years || 0) + '</b><span>Last 10 years</span></div></div>' +
        yearBars(c.by_year) + (c.top_events?.length ? '<dl>' + c.top_events.slice(0, 5).map(e => '<dt>' + esc(e.event) + '</dt><dd class="mono">' + fmtN(e.claims) + ' · ' + fmtM(e.paid) + '</dd>').join('') + '</dl>' : '') +
        '<div class="rnote">Claims in the ' + fmtN(c.tracts_searched || 0) + ' census tract' + (c.tracts_searched === 1 ? '' : 's') + ' touching this area' + (c.in_high_risk_zone_pct != null ? '; ' + c.in_high_risk_zone_pct + '% were rated in a high-risk zone, so flooding hits outside the mapped floodplain too' : '') + '. Only insured properties appear.' +
        (c.tracts_skipped ? ' <b>' + fmtN(c.tracts_skipped) + ' more tract' + (c.tracts_skipped === 1 ? '' : 's') + ' couldn’t be read in time</b>, so the totals are low. <button class="lnk" type="button" data-fretry="nfip_claims">Count the claims again</button>' : '') + '</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Federal disaster declarations since 2000</div>' + (s.pending ? wait : s.error ? err(s, 'Disaster declarations', 'disasters') : '<div class="rnote">' + fmtN(s.count || 0) + ' declarations for ' + esc((d.counties || []).join(', ') || 'this area') + (s.major != null ? ' (' + s.major + ' major disasters)' : '') + (s.by_type ? ': ' + Object.entries(s.by_type).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ') : '') + '.</div>' +
        (s.list?.length ? s.list.slice(0, 6).map(x => '<div class="pl"><b>' + esc(x.title) + '</b><span>' + esc(x.date + ' · ' + x.type + ' · ' + x.kind) + '</span></div>').join('') : '')) + '</div>' +
      '<div class="bsec"><div class="lt">FEMA National Risk Index</div>' + (n?.pending ? wait : !n ? '<div class="rnote">No risk index data here.</div>' : n.error ? err(n, 'The FEMA risk index', 'risk_index') : '<div class="kgrid"><div><b>' + esc(n.risk_rating || '—') + '</b><span>Overall risk · ' + n.risk_score + ' / 100</span></div><div><b>' + fmtM(n.expected_annual_loss) + '</b><span>Expected annual loss</span></div></div>' +
        '<dl>' + n.hazards.slice(0, 6).map(h => '<dt>' + esc(h.hazard) + '</dt><dd class="mono">' + fmtM(h.eal) + '/yr <span class="sc">' + esc(h.rating || '') + '</span></dd>').join('') + '</dl>' +
        '<div class="rnote">For the ' + n.tracts + ' census tract' + (n.tracts === 1 ? '' : 's') + ' touching this area (' + fmtN(n.population) + ' people, ' + fmtM(n.building_value) + ' of buildings). Scores are percentiles among US tracts. Social vulnerability: ' + esc(n.social_vulnerability.rating || '—') + '; community resilience: ' + esc(n.community_resilience.rating || '—') + '.</div>') + '</div>';
  }
  // the area on a street map (narrow column beside the figures)
  const areaMapOf = g => areaMap([{ geometry: g, stroke: '#1d4ed8', fill: 'rgba(29,78,216,.10)', dash: true }], { W: 360, H: 260, px: 300 });
  // the whole printable report (HTML for the PDF renderer)
  function reportHtml(d, label, geometry) {
    const css = 'dl{display:grid;grid-template-columns:1fr auto;gap:4px 16px;margin:10px 0 0}dt{color:#4d5457}dd{margin:0;font-family:Inter,sans-serif;text-align:right}.err{color:#b42318}[data-fretry]{display:none}' +
      '.pl{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e8ebeb;padding:5px 0;break-inside:avoid}.pl span{color:#6b7174;font-size:9.5px;white-space:nowrap}' +
      '.fm-bar{display:flex;height:14px;border-radius:3px;overflow:hidden;background:#e8ebeb}.fm-bar i{display:block;height:100%}.fm-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:9.5px;margin-top:6px}.fm-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px}' +
      '.cr-bars{display:block;width:100%;max-width:560px;height:auto;color:#6b7174;margin-top:8px}.two{grid-template-columns:2fr 1fr;align-items:start}.fmap{break-inside:avoid}.fmap>svg{display:block;width:100%;height:auto;border:1px solid #e8ebeb;border-radius:6px}.fmap .rmap{border:1px solid #e8ebeb;border-radius:6px}';
    const html = reportDoc({ kicker: 'FEMA flood & hazard report', title: label, meta: d.area_sqmi.toFixed(2) + ' sq mi' + ((d.counties || []).length ? ' · ' + esc(d.counties.join(', ')) + ' County' : ''), css, sources: esc(d.sources) + ' Flood zone shares are measured by sampling points across the area against FEMA\'s effective flood map. NFIP claims cover insured properties in the census tracts touching the area (FEMA redacts addresses), so they are a neighborhood measure, not this parcel\'s history. Flood maps show regulatory risk, not every flood: confirm a parcel with an elevation certificate or a flood zone determination.', body: '' +
      '<div class="two"><div>' + body(d) + '</div><div class="fmap"><div class="lt">Area</div>' + areaMapOf(geometry) +
      (d.risk_index?.by_tract?.length ? '<div class="lt">Census tracts</div>' + d.risk_index.by_tract.map(t => '<div class="pl"><b>' + esc(t.tract) + '</b><span>' + esc(t.risk_rating || '') + ' · ' + fmtM(t.eal) + '/yr</span></div>').join('') : '') + '</div></div>' +
      (d.disasters?.list?.length > 6 ? '<div class="bsec"><div class="lt">All disaster declarations since 2000</div>' + d.disasters.list.map(x => '<div class="pl"><b>' + esc(x.title) + '</b><span>' + esc(x.date + ' · ' + x.type + ' · ' + x.kind + ' #' + x.number) + '</span></div>').join('') + '</div>' : '') +
      '' });
    return html;
  }
  return { body, reportHtml };
}

// the report's numbers as CSV rows (the card's Export CSV and the MCP report tool)
export function femaCsvRows(d) {
  const rows = [], z = d.flood_zones || {}, c = d.nfip_claims || {}, n = d.risk_index, s = d.disasters || {};
  for (const [k, v] of Object.entries(z.shares || {})) rows.push({ Table: 'Flood zone share', Item: RISK_SHORT[k] || k, Year: '', Count: '', 'Amount ($)': '', Percent: v, Detail: '' });
  for (const y of c.by_year || []) rows.push({ Table: 'NFIP claims by year', Item: '', Year: y.year, Count: y.claims, 'Amount ($)': y.paid, Percent: '', Detail: '' });
  for (const e of c.top_events || []) rows.push({ Table: 'NFIP claims by event', Item: e.event, Year: e.year || '', Count: e.claims, 'Amount ($)': e.paid, Percent: '', Detail: '' });
  for (const x of s.list || []) rows.push({ Table: 'Disaster declaration', Item: x.title, Year: x.date, Count: '', 'Amount ($)': '', Percent: '', Detail: x.type + ' · ' + x.kind + ' #' + x.number });
  for (const h of n?.hazards || []) rows.push({ Table: 'Risk index: expected annual loss', Item: h.hazard, Year: '', Count: '', 'Amount ($)': h.eal, Percent: '', Detail: h.rating || '' });
  for (const t of n?.by_tract || []) rows.push({ Table: 'Risk index: tract', Item: t.tract, Year: '', Count: t.population, 'Amount ($)': t.eal, Percent: t.risk_score, Detail: t.risk_rating + ' · ' + t.county + ' County' });
  return rows;
}
