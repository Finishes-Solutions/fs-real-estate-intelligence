// Cards inside the assistant chat: each tool result can come with a card (summary with charts, a filing, an area,
// travel, weather, news, nearby places, a location) so answers show the numbers instead of retelling them.
// ctx.chatCard(name, args, result, list) returns an element (or null); list = the filings the tool worked on.
import { tiles, hbars, vbars, dataTable } from './charts.js';
import { BY_KEY, DEFAULT_KPIS } from './metrics.js';

export function initChatCards(ctx) {
  const { esc, fmtM, fmtN } = ctx;
  const sum = l => l.reduce((s, f) => s + (f.cost || 0), 0);
  const el = (html, cls = '') => { const d = document.createElement('div'); d.className = 'cc ' + cls; d.innerHTML = html; return d; };
  const head = (kicker, title, sub) => '<div class="cc-h"><span class="cc-k">' + esc(kicker) + '</span><b>' + esc(title) + '</b>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</div>';
  const sec = (label, body) => body ? '<div class="cc-s"><div class="cc-l">' + esc(label) + '</div>' + body + '</div>' : '';
  const btns = list => '<div class="cc-a">' + list.filter(Boolean).map(([k, t, primary]) => '<button type="button" class="btn' + (primary ? ' primary' : '') + '" data-a="' + k + '">' + esc(t) + '</button>').join('') + '</div>';
  const on = (d, k, fn) => { const b = d.querySelector('[data-a="' + k + '"]'); if (b) b.onclick = fn; };
  const filingRow = f => '<button type="button" class="cc-row" data-id="' + esc(f.id) + '"><span><b>' + esc(f.name) + '</b><em>' + esc([f.use || ctx.TYPE_LABEL[f.type], f.city, f.reg].filter(Boolean).join(' · ')) + '</em></span><i>' + fmtM(f.cost) + '</i></button>';
  const wireRows = d => d.querySelectorAll('.cc-row[data-id]').forEach(b => b.onclick = () => { const f = ctx.BY_ID.get(b.dataset.id); if (f) { ctx.setView('map'); ctx.select(f, true); } });
  const group = (list, key, w = f => f.cost) => { const m = new Map(); list.forEach(f => { const k = key(f) || 'Unknown', g = m.get(k) || { name: k, n: 0, v: 0 }; g.n++; g.v += w(f) || 0; m.set(k, g); }); return [...m.values()]; };
  const monthLbl = m => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

  // ---------- filings summary (summarize_filings, filter_map, query_filings rows) ----------
  function summaryCard(list, { kicker = 'Summary', title, sub, keys, rows } = {}) {
    const ks = (keys || ctx.kpiKeys?.() || DEFAULT_KPIS).filter(k => BY_KEY.has(k));
    const months = group(list, f => (f.reg || '').slice(0, 7), () => 0).filter(g => g.name !== 'Unknown').sort((a, b) => a.name.localeCompare(b.name));
    const uses = group(list, f => f.use || ctx.TYPE_LABEL[f.type]).sort((a, b) => b.v - a.v).slice(0, 6);
    const cities = group(list, f => f.city || f.county, () => 1).sort((a, b) => b.n - a.n).slice(0, 5);
    const top = rows || list.slice().sort((a, b) => b.cost - a.cost).slice(0, 5);
    const d = el(head(kicker, title || fmtN(list.length) + ' filing' + (list.length === 1 ? '' : 's'), sub) +
      tiles(ks.map(k => { const m = BY_KEY.get(k); return { v: m.fmt(m.fn(list)), label: m.short || m.label, title: m.label }; }), ks.length > 4 ? 'c3' : 'c2') +
      (months.length > 1 ? sec('Filed by month', vbars(months.map(g => ({ label: monthLbl(g.name), value: g.n, text: g.n + ' filing' + (g.n === 1 ? '' : 's') }))) ) : '') +
      (uses.length > 1 ? sec('By use (est. value)', hbars(uses.map(g => ({ label: g.name, value: g.v, text: fmtM(g.v) + ' · ' + g.n })))) : '') +
      (cities.length > 1 ? sec('Where', hbars(cities.map(g => ({ label: g.name, value: g.n, text: fmtN(g.n) })))) : '') +
      (top.length ? sec(rows ? 'Filings' : 'Largest projects', top.map(filingRow).join('')) : '') +
      btns([['hl', 'Highlight These'], ['exp', 'Export Report']]));
    wireRows(d);
    on(d, 'hl', () => { ctx.setView('map'); ctx.highlight(list.slice().sort((a, b) => b.cost - a.cost).slice(0, 200), title || ''); });
    on(d, 'exp', () => { ctx.highlight(list.slice(0, 2000), title || ''); ctx.openExport?.('summary', { scope: 'highlight' }); });
    return d;
  }

  // ---------- grouped totals (query_filings group_by, show_chart) ----------
  function chartCard(r, a) {
    const metric = a.metric === 'value' ? 'value' : 'count', by = a.group_by || 'county', timeish = /month|quarter|year/.test(by);
    let gs = (r.groups || []).map(g => ({ label: g.name, value: metric === 'value' ? g.value : g.filings, text: metric === 'value' ? fmtM(g.value) : fmtN(g.filings), g }));
    if (timeish) gs.sort((x, y) => String(x.label).localeCompare(String(y.label))).forEach(x => { if (/^\d{4}-\d\d$/.test(x.label)) x.label = monthLbl(x.label); });
    const title = r.title || (metric === 'value' ? 'Est. value' : 'Filings') + ' by ' + by;
    const d = el(head('Chart', title, [r.filters && r.filters !== 'all' ? r.filters : '', fmtN(r.filings) + ' filings · est. ' + fmtM(r.total_value)].filter(Boolean).join(' · ')) +
      (timeish ? vbars(gs, { line: gs.length > 18 }) : hbars(gs)) +
      dataTable([by[0].toUpperCase() + by.slice(1), 'Filings', 'Est. value'], gs.map(x => [x.label, fmtN(x.g.filings), fmtM(x.g.value)])));
    return d;
  }

  function filingCard(r) {
    const f = ctx.BY_ID.get(r.opened?.id); if (!f) return null;
    const d = el(head(ctx.TYPE_LABEL[f.type] + (f.use ? ' · ' + f.use : ''), f.name, [f.addr || f.city, f.county + ' County'].filter(Boolean).join(' · ')) +
      tiles([{ v: fmtM(f.cost), label: 'Est. value' }, { v: f.sqft ? fmtN(f.sqft) : '–', label: 'Sq ft' }, { v: f.status || '–', label: 'Status' }], 'c3') +
      '<dl class="cc-dl">' + [['Registered', f.reg], ['Schedule', (f.ts || '?') + ' → ' + (f.te || '?') + (f.tsE || f.teE ? ' (partly est.)' : '')], ['Owner', f.owner], ['Developer', f.dev && f.dev !== f.owner ? f.dev : ''], ['Architect', f.arch], ['GC', f.gc], ['Tenant', f.ten]]
        .filter(x => x[1]).map(([k, v]) => '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
      (f.sum ? '<p class="cc-p">' + esc(f.sum) + '</p>' : '') + btns([['open', 'Open Filing', true]]));
    on(d, 'open', () => { ctx.setView('map'); ctx.select(f, true); });
    return d;
  }

  function areaCard(r) {
    if (!r.place) return null;
    const pl = ctx.currentPlace?.(), list = pl?.geom && /Polygon/.test(pl.geom.type) && !/building|business/.test(pl.kind) ? ctx.filtered().filter(f => d3.geoContains(pl.geom, [f.lon, f.lat])) : null;
    const uses = list ? group(list, f => f.use || ctx.TYPE_LABEL[f.type]).sort((a, b) => b.v - a.v).slice(0, 5) : [];
    const d = el(head(r.kind ? r.kind[0].toUpperCase() + r.kind.slice(1) : 'Area', r.place, fmtN(r.filings) + ' filings ' + (r.how || '') + ' · est. ' + fmtM(r.total_value)) +
      (uses.length > 1 ? sec('Top uses', hbars(uses.map(g => ({ label: g.name, value: g.v, text: fmtM(g.v) })))) : '') +
      (list?.length ? sec('Largest projects', list.slice().sort((a, b) => b.cost - a.cost).slice(0, 3).map(filingRow).join('')) : '') +
      btns([['info', 'More Information', true], list && !r.filtered ? ['filter', 'Filter to This Area'] : null]));
    wireRows(d);
    on(d, 'info', () => document.getElementById('pbInfo')?.click());
    on(d, 'filter', () => { const p = ctx.currentPlace?.(); if (p?.geom) { ctx.setSelection('place', p.label, p.geom); ctx.clearPlace(); ctx.fitGeom(p.geom); } });
    return d;
  }

  function compareCard(r) {
    const a = r.compared || []; if (!a.length) return null;
    const metric = (label, k, fmt) => sec(label, hbars(a.map(x => ({ label: x.area, value: x[k], text: fmt(x[k]) }))));
    const d = el(head('Compare', a.map(x => x.area).join(' vs '), 'Current filters') + metric('Filings', 'filings', fmtN) + metric('Est. value', 'total_value', fmtM) + metric('New builds', 'new_builds', fmtN) + btns([['cmp', 'Open Compare', true]]));
    on(d, 'cmp', () => ctx.setView('compare'));
    return d;
  }

  function nearbyCard(r) {
    const p = r.places || [];
    const d = el(head('Nearby', 'Nearest ' + String(r.category || 'places').toLowerCase(), 'From ' + r.measured_from + ' · straight-line miles') +
      (p.length ? '<ol class="cc-ol">' + p.map((x, i) => '<li><button type="button" class="cc-row" data-i="' + i + '"><span><b>' + esc(x.name) + '</b><em>' + esc([x.kind, x.address].filter(Boolean).join(' · ')) + '</em></span><i>' + (+x.miles).toFixed(1) + ' mi</i></button></li>').join('') + '</ol>' : '<p class="cc-p">Nothing found within ' + r.searched_within_miles + ' mi.</p>') +
      '<div class="rnote">Source: OpenStreetMap</div>');
    d.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const x = p[+b.dataset.i]; ctx.setView('map'); ctx.map.flyTo({ center: [x.lon, x.lat], zoom: 16, duration: ctx.reduceMotion ? 0 : 900 }); });
    return d;
  }

  function locationCard(r) {
    if (!r.center) return null;
    const t = [r.market_value ? { v: fmtM(r.market_value), label: 'Market value' } : null, r.building_sqft ? { v: fmtN(r.building_sqft), label: 'Building sq ft' } : null,
      r.year_built ? { v: r.year_built, label: 'Year built' } : null, r.height_ft ? { v: r.height_ft + ' ft', label: 'Height' } : null, r.floors ? { v: r.floors, label: 'Floors' } : null, r.land_area ? { v: r.land_area, label: 'Land' } : null].filter(Boolean);
    const fs = (r.filings || []).map(x => ctx.BY_ID.get(x.id)).filter(Boolean);
    const d = el(head('Location', r.address || r.place, [r.owner ? 'Owner: ' + r.owner : '', r.land_use].filter(Boolean).join(' · ')) +
      (t.length ? tiles(t, 'c3') : '') +
      (r.businesses?.length ? sec('Businesses here', '<div class="cc-tags">' + r.businesses.slice(0, 12).map(b => '<span>' + esc(b.name) + (b.kind ? ' <em>' + esc(b.kind) + '</em>' : '') + '</span>').join('') + '</div>') : '') +
      (fs.length ? sec('Construction filings here', fs.slice(0, 5).map(filingRow).join('')) : '') +
      (r.note ? '<div class="rnote">' + esc(r.note) + '</div>' : '') + btns([['info', 'More Information', true]]));
    wireRows(d);
    on(d, 'info', () => { ctx.setView('map'); ctx.map.flyTo({ center: r.center, zoom: 17.5, duration: ctx.reduceMotion ? 0 : 900 }); ctx.map.once('idle', () => { const b = ctx.buildingAt?.(r.center); if (!b) ctx.openBuildingAt(r.center); }); });
    return d;
  }

  const liveCard = (kicker, title, html, cls) => el(head(kicker, title) + '<div class="cc-live">' + html + '</div>', cls);

  ctx.chatCard = (name, a, r, list) => {
    if (!r || r.error) return null;
    try {
      switch (name) {
        case 'summarize_filings': return list ? summaryCard(list, { title: r.title, sub: r.scope_note }) : null;
        case 'filter_map': return list && list.length ? summaryCard(list, { kicker: 'On the map', title: fmtN(list.length) + ' filings · est. ' + fmtM(sum(list)), sub: r.applied, keys: ['count', 'value', 'new', 'avg'] }) : null;
        case 'query_filings': return r.groups ? chartCard(r, a) : r.rows?.length && list ? summaryCard(list, { kicker: 'Results', title: fmtN(r.filings) + ' matching filings', sub: r.filters !== 'all' ? r.filters : '', keys: ['count', 'value', 'new', 'avg'], rows: r.rows.map(x => ctx.BY_ID.get(x.id)).filter(Boolean).slice(0, 8) }) : null;
        case 'show_chart': return chartCard(r, a);
        case 'open_filing': return filingCard(r);
        case 'highlight_area': return areaCard(r);
        case 'compare_areas': return compareCard(r);
        case 'nearby_places': return nearbyCard(r);
        case 'location_info': return locationCard(r);
        case 'distance_and_drive_time': { if (!ctx.live) return null; const d = liveCard('Drive time', (r.from || 'Start') + ' → ' + (r.to || 'destination'), ctx.live.driveHTML(r) + (r.road_miles != null && a.show_route !== false ? btns([['clr', 'Clear Route']]) : ''));
          on(d, 'clr', e => { ctx.live.clearRoute(); e.currentTarget.remove(); }); return d; }
        case 'weather_at': return ctx.live ? liveCard('Weather', r.place, ctx.live.weatherHTML(r) + (r.tomorrow ? '<div class="rnote">Tomorrow ' + Math.round(r.tomorrow.low_f) + '–' + Math.round(r.tomorrow.high_f) + '°F, ' + (r.tomorrow.rain_chance_pct ?? 0) + '% rain</div>' : '')) : null;
        case 'project_news': return ctx.live ? liveCard('News', r.searched, ctx.live.newsHTML(r, 5)) : null;
        case 'site_imagery': { if (!ctx.live) return null; const d = liveCard('Site imagery', r.place, '<div class="live-out"></div>'); ctx.live.imageryInto(d.querySelector('.live-out')); return d; }
      }
    } catch (e) { console.error('chat card', name, e); }
    return null;
  };
}
