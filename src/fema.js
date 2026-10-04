// FEMA (via api/fema):
//   Map layer "Flood Zones (FEMA)": the National Flood Hazard Layer drawn in FEMA's colors at street zoom.
//   FEMA report for any area: the current selection (box, polygon, county or radius) or a building (0.25 mile):
//   share of the area in high / moderate / minimal flood risk, NFIP flood insurance claims paid nearby (by year and storm),
//   federal disaster declarations since 2000, and FEMA's National Risk Index (expected annual loss by hazard).
//   The report opens in the card and exports as a printable report (HTML → PDF) or CSV.
const SRC = 'fema-nfhl';
const RISK_COL = { high: '#1d4ed8', moderate: '#f59e0b', minimal: '#9ca3af', undetermined: '#a78bfa', water: '#38bdf8', unmapped: '#e5e7eb' };
const RISK_SHORT = { high: 'High risk (100-year)', moderate: 'Moderate (500-year)', minimal: 'Minimal', undetermined: 'Not studied', water: 'Open water', unmapped: 'Not mapped' };

export function initFema(ctx) {
  const { map, esc, fmtN, fmtM } = ctx, box = document.getElementById('lyFema'), note = document.getElementById('lyFemaNote');
  let on = false, last = null, cls = 'all'; // cls: 'all' flood zones, or 'high' (the 100-year floodplain only; Filters → Risk)
  try { on = localStorage.getItem('fs-fema') === '1'; } catch (e) {}

  function addLayer() {
    if (!on || !map.getStyle()) return;
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'raster', tiles: [location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/fema?tile={z}/{x}/{y}' + (cls === 'high' ? '&cls=high' : '')], tileSize: 256, minzoom: 10, maxzoom: 17, attribution: 'Flood zones: FEMA NFHL' });
    if (!map.getLayer(SRC)) map.addLayer({ id: SRC, type: 'raster', source: SRC, minzoom: 10, paint: { 'raster-opacity': .62 } }, map.getLayer('filings') ? 'filings' : undefined);
  }
  const removeLayer = () => { if (map.getLayer(SRC)) map.removeLayer(SRC); if (map.getSource(SRC)) map.removeSource(SRC); };
  function setOn(v) {
    on = v; if (box) box.checked = v; if (note) note.hidden = !v; try { localStorage.setItem('fs-fema', v ? '1' : '0'); } catch (e) {}
    if (!v) { removeLayer(); return; }
    addLayer(); if (map.getZoom() < 12) ctx.toast('Flood zones show from neighborhood zoom: zoom in to see them.');
  }
  if (box) { box.checked = on; box.onchange = () => setOn(box.checked); if (note) note.hidden = !on; }
  ctx.onOverlays(addLayer);
  ctx.femaLayer = v => setOn(v !== false);
  // which zones the layer shows; switching reloads its tiles (and turns the layer on)
  ctx.femaClass = c => { c = c === 'high' ? 'high' : 'all'; if (c === cls && on) return; cls = c; removeLayer(); if (on) addLayer(); else setOn(true); };
  ctx.femaClassNow = () => cls;

  // ---------- report ----------
  const reportFor = async (geometry, label) => {
    const r = await fetch('api/fema', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, label }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'FEMA report failed'); return d;
  };
  ctx.femaReportData = reportFor;
  const shareBar = sh => { const order = ['high', 'moderate', 'minimal', 'undetermined', 'water', 'unmapped'].filter(k => sh[k]); return '<div class="fm-bar">' + order.map(k => '<i style="width:' + sh[k] + '%;background:' + RISK_COL[k] + '" title="' + esc(RISK_SHORT[k] + ': ' + sh[k] + '%') + '"></i>').join('') + '</div><div class="fm-leg">' + order.map(k => '<span><i style="background:' + RISK_COL[k] + '"></i>' + esc(RISK_SHORT[k]) + ' <b>' + sh[k] + '%</b></span>').join('') + '</div>'; };
  function yearBars(rows) {
    if (!rows?.length) return '';
    const y0 = Math.min(...rows.map(r => r.year)), y1 = Math.max(...rows.map(r => r.year)), all = []; for (let y = y0; y <= y1; y++) all.push(rows.find(r => r.year === y) || { year: y, claims: 0, paid: 0 });
    const W = 320, H = 70, max = Math.max(1, ...all.map(r => r.paid)), bw = W / all.length;
    return '<svg class="cr-bars" viewBox="0 0 ' + W + ' ' + (H + 12) + '" role="img" aria-label="Flood claims paid per year">' + all.map((r, i) => '<g><title>' + esc(r.year + ': ' + r.claims + ' claims, ' + fmtM(r.paid) + ' paid') + '</title><rect x="' + (i * bw + .5).toFixed(1) + '" y="' + (H - r.paid / max * H).toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + (r.paid / max * H).toFixed(1) + '" fill="#1d4ed8"/>' +
      ((r.year % 5 === 0 || i === 0) ? '<text x="' + (i * bw).toFixed(1) + '" y="' + (H + 10) + '" font-size="8.5" fill="currentColor" opacity=".6">' + r.year + '</text>' : '') + '</g>').join('') + '</svg>';
  }
  const err = x => x?.error ? '<div class="rnote err">Unavailable right now (' + esc(x.error) + ').</div>' : '';
  function body(d) {
    const z = d.flood_zones || {}, c = d.nfip_claims || {}, s = d.disasters || {}, n = d.risk_index;
    return '<div class="bsec"><div class="lt">Flood zones</div>' + (z.shares ? shareBar(z.shares) + '<div class="rnote">' + [z.zones?.length ? 'FEMA zones here: ' + z.zones.map(x => x.zone + ' ' + x.pct + '%').join(', ') : '', z.floodway ? 'Includes regulatory floodway (building is restricted).' : '', z.bfe ? 'Base flood elevation ' + (z.bfe.min === z.bfe.max ? z.bfe.min : z.bfe.min + '–' + z.bfe.max) + ' ft.' : '', z.truncated ? 'Area has many zone shapes; shares are approximate.' : ''].filter(Boolean).map(esc).join(' ') + '</div>' : z.skipped ? '<div class="rnote">' + esc(z.skipped) + '</div>' : err(z)) + '</div>' +
      '<div class="bsec"><div class="lt">Flood insurance claims (NFIP)</div>' + (c.error ? err(c) : '<div class="kgrid"><div><b>' + fmtN(c.claims || 0) + '</b><span>Claims paid</span></div><div><b>' + fmtM(c.paid || 0) + '</b><span>Total paid</span></div><div><b>' + (c.avg_paid ? fmtM(c.avg_paid) : '—') + '</b><span>Average claim</span></div><div><b>' + fmtN(c.last_10_years || 0) + '</b><span>Last 10 years</span></div></div>' +
        yearBars(c.by_year) + (c.top_events?.length ? '<dl>' + c.top_events.slice(0, 5).map(e => '<dt>' + esc(e.event) + '</dt><dd class="mono">' + fmtN(e.claims) + ' · ' + fmtM(e.paid) + '</dd>').join('') + '</dl>' : '') +
        '<div class="rnote">Claims in the ' + fmtN(c.tracts_searched || 0) + ' census tract' + (c.tracts_searched === 1 ? '' : 's') + ' touching this area' + (c.in_high_risk_zone_pct != null ? '; ' + c.in_high_risk_zone_pct + '% were rated in a high-risk zone, so flooding hits outside the mapped floodplain too' : '') + '. Only insured properties appear.</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Federal disaster declarations since 2000</div>' + (s.error ? err(s) : '<div class="rnote">' + fmtN(s.count || 0) + ' declarations for ' + esc((d.counties || []).join(', ') || 'this area') + (s.major != null ? ' (' + s.major + ' major disasters)' : '') + (s.by_type ? ': ' + Object.entries(s.by_type).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ') : '') + '.</div>' +
        (s.list?.length ? s.list.slice(0, 6).map(x => '<div class="pl"><b>' + esc(x.title) + '</b><span>' + esc(x.date + ' · ' + x.type + ' · ' + x.kind) + '</span></div>').join('') : '')) + '</div>' +
      '<div class="bsec"><div class="lt">FEMA National Risk Index</div>' + (!n ? '<div class="rnote">No risk index data here.</div>' : n.error ? err(n) : '<div class="kgrid"><div><b>' + esc(n.risk_rating || '—') + '</b><span>Overall risk · ' + n.risk_score + ' / 100</span></div><div><b>' + fmtM(n.expected_annual_loss) + '</b><span>Expected annual loss</span></div></div>' +
        '<dl>' + n.hazards.slice(0, 6).map(h => '<dt>' + esc(h.hazard) + '</dt><dd class="mono">' + fmtM(h.eal) + '/yr <span class="sc">' + esc(h.rating || '') + '</span></dd>').join('') + '</dl>' +
        '<div class="rnote">For the ' + n.tracts + ' census tract' + (n.tracts === 1 ? '' : 's') + ' touching this area (' + fmtN(n.population) + ' people, ' + fmtM(n.building_value) + ' of buildings). Scores are percentiles among US tracts. Social vulnerability: ' + esc(n.social_vulnerability.rating || '—') + '; community resilience: ' + esc(n.community_resilience.rating || '—') + '.</div>') + '</div>';
  }
  async function report({ geometry, label }) {
    const card = ctx.card || document.getElementById('card');
    ctx.closeCard?.(); card.innerHTML = '<div class="top"><div><div class="kicker">FEMA report</div><h2>' + esc(label) + '</h2></div><button class="x" aria-label="Close">×</button></div><div class="bsec"><div class="rnote">Checking flood zones, insurance claims, disasters and risk…</div></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    let d; try { d = await reportFor(geometry, label); } catch (e) { card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return; }
    last = { d, label, geometry };
    card.innerHTML = '<div class="top"><div><div class="kicker">FEMA report</div><h2>' + esc(label) + '</h2><div class="bsub">' + (d.area_sqmi < 10 ? d.area_sqmi.toFixed(2) : fmtN(d.area_sqmi)) + ' sq mi</div></div><button class="x" aria-label="Close">×</button></div>' + body(d) +
      '<div class="bacts"><button class="btn" id="fmLayer" type="button">Show Flood Zones on Map</button><button class="btn primary" id="fmPdf" type="button">Export Report</button><button class="btn" id="fmCsv" type="button">Export CSV</button></div>' +
      '<div class="rnote bsec">Flood maps show regulatory risk, not every flood; Houston floods outside them too. For a single parcel, confirm with an elevation certificate or a FEMA flood zone determination.<span class="src"> ' + esc(d.sources) + '</span></div>';
    card.classList.add('open'); card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#fmLayer').onclick = () => { setOn(true); ctx.fitGeom?.(geometry); };
    card.querySelector('#fmPdf').onclick = exportReport; card.querySelector('#fmCsv').onclick = exportCsv;
  }
  ctx.femaReport = report;

  const slug = s => String(s || 'area').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'area';
  function exportCsv() {
    if (!last) return; const { d } = last, rows = [], z = d.flood_zones || {}, c = d.nfip_claims || {}, n = d.risk_index, s = d.disasters || {};
    for (const [k, v] of Object.entries(z.shares || {})) rows.push({ Table: 'Flood zone share', Item: RISK_SHORT[k] || k, Year: '', Count: '', 'Amount ($)': '', Percent: v, Detail: '' });
    for (const y of c.by_year || []) rows.push({ Table: 'NFIP claims by year', Item: '', Year: y.year, Count: y.claims, 'Amount ($)': y.paid, Percent: '', Detail: '' });
    for (const e of c.top_events || []) rows.push({ Table: 'NFIP claims by event', Item: e.event, Year: e.year || '', Count: e.claims, 'Amount ($)': e.paid, Percent: '', Detail: '' });
    for (const x of s.list || []) rows.push({ Table: 'Disaster declaration', Item: x.title, Year: x.date, Count: '', 'Amount ($)': '', Percent: '', Detail: x.type + ' · ' + x.kind + ' #' + x.number });
    for (const h of n?.hazards || []) rows.push({ Table: 'Risk index: expected annual loss', Item: h.hazard, Year: '', Count: '', 'Amount ($)': h.eal, Percent: '', Detail: h.rating || '' });
    for (const t of n?.by_tract || []) rows.push({ Table: 'Risk index: tract', Item: t.tract, Year: '', Count: t.population, 'Amount ($)': t.eal, Percent: t.risk_score, Detail: t.risk_rating + ' · ' + t.county + ' County' });
    ctx.exportCsv(rows, 'fema-' + slug(last.label) + '-' + new Date().toISOString().slice(0, 10));
  }
  function areaSvg(g) {
    const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const W = 360, H = 220, k = Math.cos((y0 + y1) / 2 * Math.PI / 180), sx = (x1 - x0) * k || 1e-4, sy = y1 - y0 || 1e-4, s = Math.min((W - 20) / sx, (H - 20) / sy);
    const pr = ([x, y]) => [(W - sx * s) / 2 + (x - x0) * k * s, (H - sy * s) / 2 + (y1 - y) * s];
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"><rect width="' + W + '" height="' + H + '" fill="#f8f9f9"/><path d="' + rings.map(r => 'M' + r.map(p => pr(p).map(v => v.toFixed(1)).join(',')).join('L') + 'Z').join('') + '" fill="rgba(29,78,216,.08)" stroke="#1d4ed8" stroke-width="1.5" stroke-dasharray="5 3"/></svg>';
  }
  function exportReport() {
    if (!last) return; const { d, label, geometry } = last, logo = document.querySelector('.brandbar .l-light')?.src || '', today = new Date();
    const css = '@page{size:letter;margin:.5in}*{box-sizing:border-box}body{margin:0;font-family:Montserrat,system-ui,sans-serif;color:#23282a;font-size:12px;line-height:1.45}.wrap{max-width:900px;margin:0 auto;padding:28px}' +
      '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #006527;padding-bottom:12px}.hd img{height:40px}.k{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#006527}' +
      'h1{font-size:24px;margin:6px 0 2px;font-weight:800}.lt{font-size:14px;font-weight:700;margin:22px 0 8px;color:#0b0d0c}.meta,.rnote{color:#6b7174}.rnote{font-size:11px;margin-top:6px}.err{color:#c03b3a}' +
      '.kgrid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e8ebeb;border-radius:6px}.kgrid div{padding:10px 12px}.kgrid div+div{border-left:1px solid #e8ebeb}.kgrid b{display:block;font-family:"IBM Plex Mono",monospace;font-size:17px}.kgrid span{font-family:"IBM Plex Mono",monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#6b7174}' +
      'dl{display:grid;grid-template-columns:1fr auto;gap:4px 16px;margin:10px 0 0}dt{color:#4d5457}dd{margin:0;font-family:"IBM Plex Mono",monospace;text-align:right}.sc{color:#6b7174;font-size:10px}.pl{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e8ebeb;padding:5px 0}.pl span{color:#6b7174;font-size:11px;white-space:nowrap}' +
      '.fm-bar{display:flex;height:16px;border-radius:3px;overflow:hidden;background:#eee}.fm-bar i{display:block;height:100%}.fm-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;margin-top:6px}.fm-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px}' +
      '.cr-bars{display:block;width:100%;max-width:560px;height:auto;color:#6b7174;margin-top:8px}.two{display:grid;grid-template-columns:2fr 1fr;gap:22px;align-items:start}.map svg{display:block;width:100%;height:auto;border:1px solid #e8ebeb;border-radius:6px}' +
      '.ft{margin-top:22px;padding-top:10px;border-top:1px solid #e8ebeb;color:#6b7174;font-size:10.5px}.pb{position:fixed;right:18px;top:18px;background:#006527;color:#fff;border:0;border-radius:4px;padding:9px 14px;font:600 12px Montserrat,sans-serif;cursor:pointer}.bsec{break-inside:avoid}@media print{.pb{display:none}.wrap{padding:0}}';
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>FEMA report — ' + esc(label) + '</title><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Montserrat:wght@400;600;800&display=swap" rel="stylesheet"><style>' + css + '</style></head><body>' +
      '<button class="pb" onclick="window.print()">Print or Save as PDF</button><div class="wrap"><div class="hd"><div><div class="k">FEMA flood & hazard report</div><h1>' + esc(label) + '</h1><div class="meta">' + d.area_sqmi.toFixed(2) + ' sq mi · ' + esc((d.counties || []).join(', ') + ((d.counties || []).length ? ' County · ' : '')) + 'Generated ' + today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '</div></div>' + (logo ? '<img src="' + logo + '" alt="Finishes Solutions">' : '') + '</div>' +
      '<div class="two"><div>' + body(d) + '</div><div class="map"><div class="lt">Area</div>' + areaSvg(geometry) +
      (d.risk_index?.by_tract?.length ? '<div class="lt">Census tracts</div>' + d.risk_index.by_tract.map(t => '<div class="pl"><b>' + esc(t.tract) + '</b><span>' + esc(t.risk_rating || '') + ' · ' + fmtM(t.eal) + '/yr</span></div>').join('') : '') + '</div></div>' +
      (d.disasters?.list?.length > 6 ? '<div class="bsec"><div class="lt">All disaster declarations since 2000</div>' + d.disasters.list.map(x => '<div class="pl"><b>' + esc(x.title) + '</b><span>' + esc(x.date + ' · ' + x.type + ' · ' + x.kind + ' #' + x.number) + '</span></div>').join('') + '</div>' : '') +
      '<div class="ft">Sources: ' + esc(d.sources) + ' Flood zone shares are measured by sampling points across the area against FEMA\'s effective flood map. NFIP claims cover insured properties in the census tracts touching the area (FEMA redacts addresses), so they are a neighborhood measure, not this parcel\'s history. Flood maps show regulatory risk, not every flood: confirm a parcel with an elevation certificate or a flood zone determination.</div></div></body></html>';
    ctx.saveFile('fema-report-' + slug(label) + '-' + today.toISOString().slice(0, 10) + '.html', html, 'text/html');
  }

  // entry points: the selection strip (under Area at a Glance) and the selection bar
  const run = () => { const s = ctx.sel; if (s?.feature) report({ geometry: s.feature.geometry || s.feature, label: s.label || 'Selected area' }); };
  const strip = document.querySelector('.crsel');
  if (strip && !strip.querySelector('.fm-go')) { const b = document.createElement('button'); b.className = 'btn fm-go'; b.type = 'button'; b.textContent = 'FEMA Report'; b.onclick = run; strip.querySelector('button')?.before(b); }
  const sb = document.getElementById('selFema'), sync = () => { if (sb) sb.style.display = ctx.sel?.feature ? '' : 'none'; };
  if (sb) sb.onclick = run; ctx.onChange(sync); sync();
}
