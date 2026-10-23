// The Environmental Report as HTML strings: the card body and the printable report its PDF export sends (src/env.js), also
// made by the MCP server's report tool (lib/mcp/reports.mjs). DOM-free; the report kit (src/reportkit.js) is passed in, since
// this file is loaded from lib/ in the browser and in Node.
import { KINDS } from '../env.mjs';

// K: { esc, fmt, kgrid, unavailable, areaMap, reportDoc }
export function envReport(K) {
  const { esc, fmt, kgrid, unavailable, areaMap, reportDoc } = K;
  const ORDER = ['npl', 'superfund', 'ihwca', 'vcp', 'brownfield', 'epa_bf', 'drycleaner', 'lpst', 'landfill', 'msd', 'pst', 'rcra', 'tri', 'air', 'water'];
  const miTxt = v => v === 0 ? 'on site' : v < 0.1 ? Math.round(v * 5280) + ' ft' : v.toFixed(2) + ' mi';
  const where = r => [miTxt(r.mi), r.mi > 0 ? r.dir : ''].filter(Boolean).join(' ');
  // one source that failed or didn't finish: the friendly sentence and a Retry that asks again for just that source
  const errNote = (x, what = 'This part of the report') => '<div class="rnote err eb">' + esc(/in time/.test(x.error) ? 'Didn’t finish in time.' : unavailable(what)) + ' <button class="lnk eb-retry" type="button" data-retry="' + esc(x.kind || 'soils') + '">Retry</button></div>';
  const soilList = d => d.soils?.list || (Array.isArray(d.soils) ? d.soils : null);
  function headline(d) {
    const k = d.kinds, n = ks => ks.reduce((s, x) => s + (k[x]?.count || 0), 0), on = ks => ks.reduce((s, x) => s + (k[x]?.onsite || 0), 0);
    const cleanup = ['npl', 'superfund', 'ihwca', 'vcp', 'brownfield', 'epa_bf', 'drycleaner', 'lpst', 'landfill', 'msd'];
    return kgrid([[fmt(n(cleanup)), 'Cleanup & contamination records', n(cleanup) ? '#c92a2a' : ''], [fmt(on(cleanup)), 'Of them on the site'], [fmt(k.lpst?.count || 0), 'Leaking tanks within ½ mi'],
      [fmt(k.wells?.count || 0), 'Oil & gas wells within ¼ mi'], [fmt(k.pipelines?.count || 0), 'Pipelines within ¼ mi'], [k.wetlands?.onsite ? 'Yes' : k.wetlands?.count ? 'Nearby' : 'No', 'Mapped wetlands on site']]);
  }
  function body(d, { full = false } = {}) {
    const k = d.kinds, row = x => '<tr><td>' + esc(KINDS[x].label) + '</td><td class="mono">' + KINDS[x].mi + ' mi</td><td class="mono">' + (k[x]?.error ? '—' : fmt(k[x]?.count || 0)) + (k[x]?.truncated ? '+' : '') + '</td><td class="mono">' + (k[x]?.error ? '—' : fmt(k[x]?.onsite || 0)) + '</td><td>' +
      (k[x]?.error ? (/in time/.test(k[x].error) ? 'didn’t finish' : 'unavailable') + ' <button class="btn sm" type="button" data-retry="' + x + '">Retry</button>' : k[x]?.nearest?.[0] ? esc(k[x].nearest[0].name) + ' · ' + esc(where(k[x].nearest[0])) : '—') + '</td></tr>';
    const many = ORDER.concat(['wells', 'orphan', 'pipelines', 'wetlands']).filter(x => k[x]?.listed != null && k[x].listed < k[x].count);
    const list = (x, max) => { const s = k[x]; if (!s?.nearest?.length) return '';
      return '<div class="env-k"><div class="fl"><span class="pl-dot" style="background:' + KINDS[x].color + '"></span>' + esc(KINDS[x].label) + ' (' + fmt(s.count) + (s.onsite ? ', ' + fmt(s.onsite) + ' on the site' : '') + ')</div>' + s.nearest.slice(0, max).map(r => '<div class="pl"><b>' + (r.url ? '<a target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(r.name) + '</a>' : esc(r.name)) + '</b><span>' + esc([r.addr, r.city].filter(Boolean).join(', ')) + (r.addr || r.city ? ' · ' : '') + esc(where(r)) + (r.tanks ? ' · ' + r.tanks + ' tank' + (r.tanks > 1 ? 's' : '') : '') + (r.id ? ' · ID ' + esc(r.id) : '') + '</span></div>').join('') + '</div>'; };
    const w = k.wells, o = k.orphan, p = k.pipelines, wt = k.wetlands, soils = d.soils;
    return '<div class="bsec">' + headline(d) + '</div>' +
      '<div class="bsec"><div class="lt">Records within the search distances</div><table class="mini env-t"><thead><tr><th>Database</th><th>Search</th><th>Found</th><th>On site</th><th>Nearest</th></tr></thead><tbody>' + ORDER.map(row).join('') + '</tbody></table>' +
      '<div class="rnote">Distances are from the edge of the site. ' + (ORDER.some(x => k[x]?.truncated) ? 'A + means that source could only be searched in a circle and returned its maximum; there may be more. ' : '') +
      (many.length ? 'Every record is counted; for ' + esc(many.map(x => KINDS[x].short.toLowerCase()).join(', ')) + ' the lists below show the on-site and nearest ones, and <b>Export CSV</b> lists all of them. ' : '') + 'Search distances follow common Phase I practice.</div></div>' +
      '<div class="bsec"><div class="lt">Sites found</div>' + (ORDER.map(x => list(x, full ? 12 : 5)).join('') || '<div class="rnote">No cleanup, contamination, tank or permitted-facility records within the search distances.</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Oil &amp; gas</div>' + (w?.error ? errNote(w, 'Oil and gas well data') : '<div class="rnote">' + fmt(w?.count || 0) + ' well' + (w?.count === 1 ? '' : 's') + ' within ¼ mile' + (w?.by_type?.length ? ': ' + esc(w.by_type.map(t => t.n + ' ' + t.type.toLowerCase()).join(', ')) : '') + (w?.nearest?.[0] ? '. Nearest ' + esc(where(w.nearest[0])) + (w.nearest[0].id ? ' (API ' + esc(w.nearest[0].id) + ')' : '') : '') + '.' +
        (o?.count ? ' <b>' + fmt(o.count) + ' orphan well' + (o.count > 1 ? 's' : '') + '</b> (abandoned with no responsible operator) within ½ mile, nearest ' + esc(where(o.nearest[0])) + '.' : '') + '</div>') +
        (p?.segments ? '<div class="rnote">' + fmt(p.count) + ' pipelines (' + fmt(p.segments) + ' mapped segments) within ¼ mile; the nearest are listed.</div>' : '') +
        (p?.error ? errNote(p, 'Pipeline data') : p?.nearest?.length ? p.nearest.map(r => '<div class="pl"><b>' + esc(r.name) + '</b><span>' + esc([r.commodity, r.diameter ? r.diameter + '" pipe' : '', r.status, r.interstate === 'Y' ? 'interstate' : ''].filter(Boolean).join(' · ')) + ' · ' + esc(where(r)) + '</span></div>').join('') : '<div class="rnote">No pipelines mapped within ¼ mile.</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Wetlands</div>' + (wt?.error ? errNote(wt, 'Wetlands data') : wt?.count && wt.listed < wt.count && wt.by_type?.length ? '<div class="rnote">' + fmt(wt.count) + ' mapped wetland areas on or within 500 ft of the site (' + fmt(wt.onsite) + ' on it): ' + esc(wt.by_type.slice(0, 8).map(t => t.n + ' ' + t.type.toLowerCase() + (t.acres ? ' (' + fmt(t.acres) + ' acres)' : '')).join(', ')) + '.</div><div class="rnote">US Fish &amp; Wildlife Service National Wetlands Inventory. Building in a wetland can need a federal (Section 404) permit; a delineation decides.</div>' : wt?.count ? wt.nearest.map(r => '<div class="pl"><b>' + esc(r.name) + '</b><span>' + esc([r.code, r.acres ? fmt(r.acres) + ' acres' : '', where(r)].filter(Boolean).join(' · ')) + '</span></div>').join('') + '<div class="rnote">US Fish &amp; Wildlife Service National Wetlands Inventory. Building in a wetland can need a federal (Section 404) permit; a delineation decides.</div>' : '<div class="rnote">No mapped wetlands on or within 500 ft of the site.</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Soils</div>' + (soils?.error ? errNote(soils, 'Soil data') : soils?.skipped ? '<div class="rnote">' + esc(soils.skipped) + '</div>' : soilList(d)?.length ? (() => { const L = soilList(d), pct = L.some(s => s.pct != null), max = full ? L.length : 15;
        return '<table class="mini env-t"><thead><tr><th>Soil</th>' + (pct ? '<th>Share</th>' : '') + '<th>Drainage</th><th>Flooding</th><th>Small commercial buildings</th></tr></thead><tbody>' +
        L.slice(0, max).map(s => '<tr><td>' + esc(s.name) + '</td>' + (pct ? '<td class="mono">' + (s.pct != null ? s.pct + '%' : '—') + '</td>' : '') + '<td>' + esc(s.drainage || '—') + '</td><td>' + esc(s.flooding || '—') + '</td><td>' + esc(s.small_commercial || '—') + '</td></tr>').join('') + '</tbody></table>' +
        (L.length > max ? '<div class="rnote">' + fmt(L.length - max) + ' more soils in the CSV.</div>' : '') + (soils.note ? '<div class="rnote">' + esc(soils.note) + '</div>' : '') +
        '<div class="rnote">USDA soil survey ratings for building without engineering. "Very limited" usually means shrink-swell clay, a high water table or flooding; plan a geotechnical study.</div>'; })() : '<div class="rnote">No soil survey data here.</div>') + '</div>';
  }
  // the whole printable report
  function reportHtml(d, label, geometry) {
    // the site on a street map (the screen covers the area plus each database's search distance around it)
    const map = geometry ? '<div class="map">' + areaMap([{ geometry, stroke: '#b45309', fill: 'rgba(180,83,9,.08)', dash: true }], { fit: geometry, W: 1000, H: 360, minSpanM: 1500 }) + '</div>' : '';
    const css = '.kgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kgrid div{border:1px solid #e8ebeb;border-radius:6px;padding:8px}.kgrid b{display:block;font-size:16px}.kgrid span{font-size:9.5px;color:#6b7174}' +
      '.pl{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e8ebeb;padding:4px 0;break-inside:avoid}.pl span{color:#6b7174;font-size:9px;text-align:right}.fl{font-weight:700;margin:10px 0 2px}.pl-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}' +
      'table.mini{width:100%;border-collapse:collapse;font-size:9.5px}table.mini th,table.mini td{border-bottom:1px solid #e8ebeb;padding:4px 6px;text-align:left;vertical-align:top}.mono{font-family:"IBM Plex Mono",monospace}.err{color:#b42318}.bacts,[data-retry]{display:none}';
    const html = reportDoc({ kicker: 'Environmental screening report', title: label, meta: (d.area_sqmi < 1 ? Math.round(d.area_sqmi * 640) + ' acres' : d.area_sqmi.toFixed(2) + ' sq mi') + ' · ' + d.center[1] + ', ' + d.center[0], css,
      sources: esc(d.sources) + ' A screen of public databases, not a Phase I environmental site assessment (ASTM E1527-21): records can be mislocated or missing, and nothing here says whether a site is contaminated.', body: map + body(d, { full: true }) });
    return html;
  }
  return { ORDER, miTxt, where, errNote, soilList, headline, body, reportHtml };
}

// every record listed (and the full lists fetched for the big sources) and the soils as CSV rows (Export CSV, the MCP report tool)
export function envCsvRows(d, fullRows = {}) {
  const rows = [], k = d.kinds;
  for (const [x, s] of Object.entries(k)) for (const r of fullRows[x] || s.nearest || []) rows.push({ Database: KINDS[x].label, 'Search (mi)': KINDS[x].mi, Name: r.name, Address: [r.addr, r.city].filter(Boolean).join(', '), 'Distance (mi)': r.mi, Direction: r.dir || '', ID: r.id || r.code || '', Detail: [r.commodity, r.diameter && r.diameter + ' in', r.status, r.tanks && r.tanks + ' tanks', r.acres && r.acres + ' acres', r.type].filter(Boolean).join('; '), Link: r.url || '' });
  for (const s of (d.soils?.list || (Array.isArray(d.soils) ? d.soils : null)) || []) rows.push({ Database: 'Soils (USDA)', 'Search (mi)': 0, Name: s.name, Address: '', 'Distance (mi)': 0, Direction: '', ID: '', Detail: [s.pct != null ? s.pct + '% of the site' : '', s.drainage, 'flooding: ' + s.flooding, 'small commercial: ' + s.small_commercial].filter(Boolean).join('; '), Link: '' });
  return rows;
}
