// Compare up to four areas (counties, radius circles, drawn shapes, searched cities / places) side by side.
// Every area gets the same filters (everything except the area selection itself). Areas stay on the map as colored
// outlines and are kept in this browser.
import { BY_KEY } from './metrics.js';
import { contains as inArea } from './lib/geomatch.mjs';

const MAX = 4;
const COLORS = [['#006527', '#4caf70'], ['#b7791f', '#e0a23c'], ['#2b6cb0', '#63a4e8'], ['#9b2c6f', '#d36aa8']];
const ROWS = ['count', 'value', 'new', 'newValue', 'reno', 'add', 'avg', 'median', 'big', 'active', 'starting', 'last30', 'sqft', 'psf', 'units', 'devs', 'topUse', 'topCity', 'topDev'];

export function initCompare(ctx) {
  const { map, esc, fmtM, fmtN } = ctx;
  const root = document.getElementById('view-compare'), badge = document.getElementById('cmpBadge');
  let areas = [];
  try { areas = (JSON.parse(localStorage.getItem('fs-compare') || '[]') || []).filter(a => a && a.geom && a.label).slice(0, MAX); } catch (e) {}
  const save = () => { try { localStorage.setItem('fs-compare', JSON.stringify(areas)); } catch (e) { /* large outlines: keep in memory only */ } };
  const color = i => COLORS[i % COLORS.length][ctx.isDark() ? 1 : 0];
  const contains = (a, f) => inArea(a.geom, [f.lon, f.lat]);
  const sqmi = g => d3.geoArea(g) * 3958.8 ** 2;

  // ---- map outlines ----
  function syncMap() {
    const s = map.getSource && map.getSource('cmp'); if (!s) return;
    s.setData(ctx.fc(areas.map((a, i) => ({ type: 'Feature', properties: { c: color(i), n: String(i + 1) }, geometry: a.geom }))));
  }
  ctx.onOverlays(() => {
    if (!map.getSource('cmp')) map.addSource('cmp', { type: 'geojson', data: ctx.fc([]) });
    if (!map.getLayer('cmp-line')) map.addLayer({ id: 'cmp-line', type: 'line', source: 'cmp', paint: { 'line-color': ['get', 'c'], 'line-width': 2.4, 'line-opacity': .9 } });
    syncMap();
  });

  // ---- add / remove ----
  function add(a, quiet = false) {
    if (!a || !a.geom) return false;
    const key = a.key || a.label;
    if (areas.some(x => (x.key || x.label) === key)) { if (!quiet) ctx.toast(a.label + ' is already in Compare.'); return false; }
    if (areas.length >= MAX) { if (!quiet) ctx.toast('Compare holds up to ' + MAX + ' areas. Remove one first.'); return false; }
    const geom = ctx.fixWinding(a.geom);
    areas.push({ key, label: a.label, kind: a.kind || 'area', geom }); save(); sync();
    if (!quiet) ctx.toast('Added ' + a.label + ' to Compare (' + areas.length + ' of ' + MAX + ').');
    return true;
  }
  // several counties selected: each one as its own area (instead of all of them together)
  function eachCounty() {
    const s = ctx.sel; if (s.kind !== 'county' || s.counties.size < 2) return [];
    return [...s.counties].sort().map(n => ({ key: 'county:' + n, label: n + ' County', kind: 'county', geom: ctx.countyGeo.find(c => c.name === n)?.geom })).filter(a => a.geom);
  }
  function addEach() {
    const all = eachCounty(), fresh = all.filter(a => !areas.some(x => (x.key || x.label) === a.key)), room = MAX - areas.length;
    if (!fresh.length) { ctx.toast('Those counties are already in Compare.'); return 0; }
    if (room <= 0) { ctx.toast('Compare holds up to ' + MAX + ' areas. Remove one first.'); return 0; }
    const added = fresh.slice(0, room).filter(a => add(a, true));
    ctx.toast('Added ' + added.map(a => a.label.replace(/ County$/, '')).join(', ') + ' to Compare (' + areas.length + ' of ' + MAX + ')' +
      (fresh.length > added.length ? '. ' + (fresh.length - added.length) + ' more didn’t fit: Compare holds ' + MAX + '.' : '.'));
    return added.length;
  }
  const remove = i => { areas.splice(i, 1); save(); sync(); };
  function fromSelection() {
    const s = ctx.sel; if (!s.feature) return null;
    const key = s.kind === 'county' ? 'county:' + [...s.counties].sort().join('|') : s.kind + ':' + s.label;
    return { key, label: s.label, kind: s.kind, geom: s.feature };
  }
  ctx.compare = { add, remove, addEach, list: () => areas.slice(), colorOf: i => COLORS[i % COLORS.length][0], addSelection: () => add(fromSelection()), clear: () => { areas = []; save(); sync(); } };

  // selection bar: "+ Compare"
  const selBtn = document.getElementById('selCompare');
  selBtn.onclick = () => { if (ctx.compare.addSelection() && areas.length >= 2) ctx.toast('Added. Open the Compare tab to see them side by side.'); };
  const eachBtn = document.getElementById('selCompareEach');
  if (eachBtn) eachBtn.onclick = () => { if (addEach() && areas.length >= 2) setTimeout(() => ctx.toast('Open the Compare tab to see them side by side.'), 2500); };
  function syncSelBtn() {
    const a = fromSelection(), each = eachCounty();
    selBtn.style.display = a ? '' : 'none'; selBtn.disabled = !!a && (areas.length >= MAX || areas.some(x => (x.key || x.label) === a.key));
    selBtn.textContent = each.length ? '+ Compare Together' : '+ Compare';
    selBtn.title = each.length ? 'Add the ' + each.length + ' counties to Compare as one area' : 'Add this area to Compare';
    if (eachBtn) { eachBtn.style.display = each.length ? '' : 'none'; eachBtn.textContent = '+ Compare Each (' + each.length + ')';
      eachBtn.disabled = areas.length >= MAX || each.every(c => areas.some(x => (x.key || x.label) === c.key)); }
  }
  ctx.onChange(syncSelBtn);

  function sync() {
    badge.textContent = areas.length ? areas.length : ''; const mb = document.getElementById('mCmpN'); if (mb) mb.textContent = areas.length ? areas.length : '';
    syncMap(); syncSelBtn(); render();
  }

  // ---- view ----
  function render() {
    if (ctx.view !== 'compare') return;
    const base = ctx.filtered(), lists = areas.map(a => base.filter(f => contains(a, f))), ft = ctx.filterText();
    const cur = fromSelection(), canAdd = cur && areas.length < MAX && !areas.some(x => (x.key || x.label) === cur.key);
    let h = '<div class="vhead"><div><div class="kicker">Compare</div><h2>Compare up to four areas</h2><div class="vsub">' + (ft ? 'Same filters for every area: ' + esc(ft) : 'All filings in each area (no other filters).') + '</div></div>' +
      '<div class="vctl">' + (canAdd ? '<button class="btn primary" id="cmpAddSel">+ Add “' + esc(cur.label) + '”' + (eachCounty().length ? ' Together' : '') + '</button>' : '') +
        (eachCounty().length && areas.length < MAX ? '<button class="btn" id="cmpAddEach">+ Add Each County (' + eachCounty().length + ')</button>' : '') + (areas.length ? '<button class="btn" id="cmpClear">Clear All</button>' : '') + '</div></div>';
    h += '<div class="cmp-chips">' + areas.map((a, i) => '<span class="cmp-chip" style="--c:' + color(i) + '"><i></i><button class="lnk" data-go="' + i + '">' + esc(a.label) + '</button><button class="x" data-rm="' + i + '" aria-label="Remove ' + esc(a.label) + '">×</button></span>').join('') +
      (areas.length < MAX ? '<span class="cmp-slot">' + (MAX - areas.length) + ' open slot' + (MAX - areas.length > 1 ? 's' : '') + '</span>' : '') + '</div>';
    if (areas.length < 2) {
      h += '<div class="cmp-empty"><b>' + (areas.length ? 'Add one more area to compare.' : 'Nothing to compare yet.') + '</b><ol>' +
        '<li>On the map, pick an area: search a city or county, click <em>County</em>, draw a <em>Shape</em> or <em>Area</em>, or set a <em>Radius</em>.</li>' +
        '<li>Click <em>+ Compare</em> on the selection (left panel) or on the place card.</li><li>Repeat for up to four areas, then come back here.</li></ol>' +
        '<button class="btn" id="cmpToMap">Go to the Map</button></div>';
    }
    if (areas.length) {
      const best = k => { const m = BY_KEY.get(k); if (m.text) return -1; const v = lists.map(l => m.fn(l)); const mx = Math.max(...v); return mx > 0 && v.filter(x => x === mx).length === 1 ? v.indexOf(mx) : -1; };
      h += '<div class="tablewrap"><table class="cmp"><thead><tr><th>Metric</th>' + areas.map((a, i) => '<th style="--c:' + color(i) + '"><i></i>' + esc(a.label) + '</th>').join('') + '</tr></thead><tbody>' +
        '<tr><td>Area</td>' + areas.map(a => '<td class="m">' + (sqmi(a.geom) < 10 ? sqmi(a.geom).toFixed(1) : fmtN(Math.round(sqmi(a.geom)))) + ' sq mi</td>').join('') + '</tr>' +
        ROWS.map(k => { const m = BY_KEY.get(k), b = best(k); return '<tr><td>' + esc(m.label) + '</td>' + lists.map((l, i) => '<td class="' + (m.text ? '' : 'm') + (i === b && areas.length > 1 ? ' best' : '') + '">' + esc(m.fmt(m.fn(l))) + '</td>').join('') + '</tr>'; }).join('') +
        '<tr><td>Filings per sq mi</td>' + areas.map((a, i) => '<td class="m">' + (lists[i].length / Math.max(sqmi(a.geom), .01)).toFixed(2) + '</td>').join('') + '</tr>' +
        '</tbody></table></div>';
      h += '<div class="cmp-grid"><div class="cmp-card"><h3>Filings by quarter</h3><div id="cmpTrend"></div></div><div class="cmp-card"><h3>Share of est. value by use</h3><div id="cmpUse"></div></div></div>';
      h += '<div class="cmp-tops">' + areas.map((a, i) => '<div class="cmp-card" style="--c:' + color(i) + '"><h3><i></i>Largest in ' + esc(a.label) + '</h3>' +
        (lists[i].slice().sort((x, y) => y.cost - x.cost).slice(0, 5).map(f => '<button class="cmp-f" data-id="' + esc(f.id) + '"><span>' + esc(f.name) + '<small>' + esc(f.city || f.county) + ' · ' + esc(ctx.TYPE_LABEL[f.type]) + (f.use ? ' · ' + esc(f.use) : '') + '</small></span><b>' + fmtM(f.cost) + '</b></button>').join('') || '<div class="rnote">No filings match here.</div>') + '</div>').join('') + '</div>';
    }
    root.innerHTML = h;
    root.querySelector('#cmpAddSel')?.addEventListener('click', () => ctx.compare.addSelection());
    root.querySelector('#cmpAddEach')?.addEventListener('click', () => addEach());
    root.querySelector('#cmpClear')?.addEventListener('click', () => ctx.compare.clear());
    root.querySelector('#cmpToMap')?.addEventListener('click', () => ctx.setView('map'));
    root.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => remove(+b.dataset.rm));
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { ctx.setView('map'); ctx.fitGeom(areas[+b.dataset.go].geom); });
    root.querySelectorAll('.cmp-f').forEach(b => b.onclick = () => { const f = ctx.BY_ID.get(b.dataset.id); if (f) { ctx.setView('map'); ctx.select(f, true); } });
    if (areas.length) { trend(lists); uses(lists); }
  }

  // registrations per quarter, one line per area
  function trend(lists) {
    const el = root.querySelector('#cmpTrend'); if (!el) return;
    const qOf = s => s ? s.slice(0, 4) + ' Q' + (Math.floor((+s.slice(5, 7) - 1) / 3) + 1) : null;
    const all = [...new Set(lists.flat().map(f => qOf(f.reg)).filter(Boolean))].sort();
    if (!all.length) { el.innerHTML = '<div class="rnote">No registrations to chart.</div>'; return; }
    const series = lists.map(l => all.map(q => l.filter(f => qOf(f.reg) === q).length));
    const W = 520, H = 200, M = { l: 34, r: 28, t: 10, b: 26 }, x = d3.scalePoint().domain(all).range([M.l, W - M.r]), y = d3.scaleLinear().domain([0, Math.max(1, ...series.flat())]).nice().range([H - M.b, M.t]);
    const line = d3.line().x((d, i) => x(all[i])).y(d => y(d));
    const step = Math.ceil(all.length / 6);
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="cmp-svg" role="img" aria-label="Filings by quarter">' +
      y.ticks(4).map(t => '<g><line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="gl"/><text x="' + (M.l - 6) + '" y="' + (y(t) + 3) + '" text-anchor="end">' + t + '</text></g>').join('') +
      all.map((q, i) => i % step ? '' : '<text x="' + x(q) + '" y="' + (H - 8) + '" text-anchor="middle">' + q + '</text>').join('') +
      series.map((s, i) => '<path d="' + line(s) + '" fill="none" stroke="' + color(i) + '" stroke-width="2.2"/>' + s.map((v, j) => '<circle cx="' + x(all[j]) + '" cy="' + y(v) + '" r="2.4" fill="' + color(i) + '"><title>' + esc(areas[i].label) + ' · ' + all[j] + ': ' + v + '</title></circle>').join('')).join('') + '</svg>';
  }
  // 100% bars of est. value by use for each area
  function uses(lists) {
    const el = root.querySelector('#cmpUse'); if (!el) return;
    const tot = new Map(); lists.flat().forEach(f => { const u = f.use || 'Unclassified'; tot.set(u, (tot.get(u) || 0) + f.cost); });
    const top = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
    const pal = ['#006527', '#1f9249', '#4caf70', '#8acda3', '#b7791f', '#6b7174', '#bcc2c4'];
    el.innerHTML = lists.map((l, i) => { const v = l.reduce((s, f) => s + f.cost, 0) || 1, parts = top.map(u => l.filter(f => (f.use || 'Unclassified') === u).reduce((s, f) => s + f.cost, 0));
      parts.push(Math.max(0, v - parts.reduce((s, x) => s + x, 0)));
      return '<div class="cmp-bar"><span class="lab" style="--c:' + color(i) + '"><i></i>' + esc(areas[i].label) + '</span><span class="bar">' + parts.map((p, j) => p > 0 ? '<b style="width:' + (p / v * 100).toFixed(2) + '%;background:' + pal[j] + '" title="' + esc((top[j] || 'All other uses') + ': ' + fmtM(p) + ' (' + Math.round(p / v * 100) + '%)') + '"></b>' : '').join('') + '</span></div>'; }).join('') +
      '<div class="cmp-key">' + top.concat('All other').map((u, j) => '<span><i style="background:' + pal[j] + '"></i>' + esc(u) + '</span>').join('') + '</div>';
  }
  ctx.onChange(() => render()); ctx.onView('compare', render);
  sync();
}
