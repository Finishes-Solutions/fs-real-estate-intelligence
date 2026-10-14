// Compare up to four areas (counties, radius circles, drawn shapes, searched cities / places) side by side.
// Every area gets the same filters (everything except the area selection itself). Areas stay on the map as colored
// outlines and are kept in this browser. The table opens with census numbers for each area (the same tract sums as Area at
// a Glance), then the construction filings, which follow the filters.
import { BY_KEY } from './metrics.js';
import { contains as inArea } from './lib/geomatch.mjs';
import { centroid } from './lib/demographics.mjs';

const MAX = 4;
const COLORS = [['#006527', '#4caf70'], ['#b7791f', '#e0a23c'], ['#2b6cb0', '#63a4e8'], ['#9b2c6f', '#d36aa8']];
// Share-of-value-by-use segments: their own categorical colours (CSS vars with dark-mode versions), never the area colours
const USE_PAL = ['var(--cmp-u0)', 'var(--cmp-u1)', 'var(--cmp-u2)', 'var(--cmp-u3)', 'var(--cmp-u4)', 'var(--cmp-u5)'], USE_OTHER = 'var(--cmp-uo)';
// the unit of each filing metric, for the raw numbers in Excel and CSV
const UNIT = { value: '$', newValue: '$', avg: '$', median: '$', sqft: 'sq ft', psf: '$ per sq ft' };
const ROWS = ['count', 'value', 'new', 'newValue', 'reno', 'add', 'avg', 'median', 'big', 'active', 'starting', 'last30', 'sqft', 'psf', 'units', 'devs', 'topUse', 'topCity', 'topDev'];
const FILINGS_TITLE = 'Construction filings (follow your filters)';

// a short hash of an outline's coordinates (5 decimals, about a metre), so two different drawn boxes never share a key
const r5 = v => Math.round(v * 1e5) / 1e5;
const roundC = c => Array.isArray(c) ? (typeof c[0] === 'number' ? c.map(r5) : c.map(roundC)) : c;
function geomHash(g) {
  const s = JSON.stringify(roundC((g && (g.geometry || g).coordinates) || [])); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}
const DRAWN = { area: 'Box', shape: 'Shape' };

export function initCompare(ctx) {
  const { map, esc, fmtM, fmtN } = ctx;
  const root = document.getElementById('view-compare');
  let areas = [];
  try { areas = (JSON.parse(localStorage.getItem('fs-compare') || '[]') || []).filter(a => a && a.geom && a.label).slice(0, MAX); } catch (e) {}
  const save = () => { try { localStorage.setItem('fs-compare', JSON.stringify(areas)); } catch (e) { /* large outlines: keep in memory only */ } };
  const color = i => COLORS[i % COLORS.length][ctx.isDark() ? 1 : 0];
  const keyOf = a => a.key || a.label;
  const has = key => areas.some(x => keyOf(x) === key);
  const sqmi = g => d3.geoArea(g) * 3958.8 ** 2;
  // counties named by a county selection ('county:Harris|Waller'): these count by the county on each filing, exactly as the
  // area bar does, so the numbers agree; drawn shapes, circles and places count what lies inside the outline
  const countyNames = a => a.kind === 'county' && String(keyOf(a)).startsWith('county:') ? new Set(keyOf(a).slice(7).split('|').filter(Boolean)) : null;
  const filingsIn = (a, base) => { const n = countyNames(a); return n ? base.filter(f => n.has(f.county)) : base.filter(f => inArea(a.geom, [f.lon, f.lat])); };

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

  // ---- names ----
  // two areas never share a name: a repeat gets " 2", " 3"…
  function unique(label, skip) {
    const taken = new Set(areas.filter(x => x !== skip).map(x => x.label)); if (!taken.has(label)) return label;
    let n = 2; while (taken.has(label + ' ' + n)) n++; return label + ' ' + n;
  }
  // a drawn box or shape: "Box 1 · near Katy" (the next free number, and the nearest town when there is one)
  function drawnLabel(kind, geom) {
    const base = DRAWN[kind]; let n = 1;
    const used = new Set(areas.map(a => String(a.label).split(' · ')[0])); while (used.has(base + ' ' + n)) n++;
    let near = null; try { const c = centroid(geom.geometry || geom); near = c && ctx.nearestPlace?.(c); } catch (e) {}
    return base + ' ' + n + (near ? ' · near ' + near : '');
  }

  // ---- add / remove ----
  const openAct = () => ctx.view === 'compare' ? {} : { action: { label: 'Open Compare', run: () => ctx.setView('compare') } };
  const toastAdded = text => ctx.toast(text, openAct());
  function add(a, quiet = false) {
    if (!a || !a.geom) return false;
    const key = a.key || a.label;
    if (has(key)) { if (!quiet) ctx.toast(a.label + ' is already in Compare.', openAct()); return false; }
    if (areas.length >= MAX) { if (!quiet) ctx.toast('Compare is full (' + MAX + '). Remove an area first.'); return false; }
    const geom = ctx.fixWinding(a.geom), label = unique(a.label);
    areas.push({ key, label, kind: a.kind || 'area', geom }); save(); sync();
    if (!quiet) toastAdded('Added ' + label + ' to Compare (' + areas.length + ' of ' + MAX + ').');
    return true;
  }
  // several counties selected: each one as its own area (instead of all of them together)
  function eachCounty() {
    const s = ctx.sel; if (s.kind !== 'county' || s.counties.size < 2) return [];
    return [...s.counties].sort().map(n => ({ key: 'county:' + n, label: n + ' County', kind: 'county', geom: ctx.countyGeo.find(c => c.name === n)?.geom })).filter(a => a.geom);
  }
  function addEach() {
    const all = eachCounty(), fresh = all.filter(a => !has(a.key)), room = MAX - areas.length;
    if (!fresh.length) { ctx.toast('Those counties are already in Compare.', openAct()); return 0; }
    if (room <= 0) { ctx.toast('Compare is full (' + MAX + '). Remove an area first.'); return 0; }
    const added = fresh.slice(0, room).filter(a => add(a, true));
    toastAdded('Added ' + added.map(a => a.label.replace(/ County$/, '')).join(', ') + ' to Compare (' + areas.length + ' of ' + MAX + ')' +
      (fresh.length > added.length ? '. ' + (fresh.length - added.length) + ' more didn’t fit: Compare holds ' + MAX + '.' : '.'));
    return added.length;
  }
  const remove = i => { areas.splice(i, 1); save(); sync(); };
  const rename = (i, text) => {
    const a = areas[i], t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (!a || !t || t === a.label) return;
    a.label = unique(t, a); save(); sync();
  };
  function fromSelection() {
    const s = ctx.sel; if (!s.feature) return null;
    if (s.kind === 'county') return { key: 'county:' + [...s.counties].sort().join('|'), label: s.label, kind: 'county', geom: s.feature };
    // a searched place keeps the key the place card uses; everything else is keyed by its outline, never by its label
    const key = s.kind === 'place' ? 'place:' + s.label : (s.kind || 'area') + ':' + geomHash(s.feature);
    return { key, label: DRAWN[s.kind] ? drawnLabel(s.kind, s.feature) : s.label, kind: s.kind, geom: s.feature };
  }
  ctx.compare = { add, remove, rename, addEach, list: () => areas.slice(), colorOf: i => COLORS[i % COLORS.length][0], addSelection: () => add(fromSelection()), clear: () => { areas = []; save(); sync(); },
    filingsIn, isIn: key => has(key) };

  // the Map panel's scope header: "+ Compare"
  const selBtn = document.getElementById('selCompare');
  selBtn.onclick = () => { const a = fromSelection(); if (a && has(a.key)) ctx.setView('compare'); else ctx.compare.addSelection(); };
  const eachBtn = document.getElementById('selCompareEach');
  function syncSelBtn() {
    const a = fromSelection(), each = eachCounty(), inCmp = !!a && has(a.key), full = !!a && !inCmp && areas.length >= MAX;
    selBtn.style.display = a ? '' : 'none'; selBtn.disabled = full;
    selBtn.textContent = inCmp ? 'In Compare ✓' : full ? 'Compare is full (' + MAX + ')' : each.length ? '+ Compare Together' : '+ Compare';
    selBtn.title = inCmp ? 'Already in Compare · open Market > Compare areas' : full ? 'Remove an area first' : each.length ? 'Add the ' + each.length + ' counties to Compare as one area' : 'Add this area to Compare';
    if (eachBtn) { const done = each.every(c => has(c.key)), fullE = areas.length >= MAX;
      eachBtn.style.display = each.length ? '' : 'none'; eachBtn.textContent = done ? 'Each In Compare ✓' : '+ Compare Each (' + each.length + ')';
      eachBtn.disabled = !done && fullE; eachBtn.title = done ? 'These counties are already in Compare · open Market > Compare areas' : fullE ? 'Compare is full (' + MAX + '). Remove an area first' : 'Add each of the ' + each.length + ' counties to Compare as its own area';
      eachBtn.onclick = () => { if (done) ctx.setView('compare'); else addEach(); }; }
  }
  ctx.onChange(syncSelBtn);

  function sync() {
    ctx.setBadge?.('compare', areas.length); // a muted count beside the Compare areas sub-tab
    syncMap(); syncSelBtn(); render();
  }

  // ---- census numbers per area (the same tract sums Area at a Glance shows) ----
  const stats = new Map(); // key -> numbers | null (none) ; absent while loading
  let statsP = null;
  function loadStats() {
    const todo = areas.filter(a => !stats.has(keyOf(a)));
    if (!todo.length) return Promise.resolve();
    const p = Promise.all(todo.map(a => Promise.resolve(ctx.areaStats?.(a.geom)).catch(() => null).then(x => { stats.set(keyOf(a), x || null); })));
    statsP = p; p.then(() => { if (statsP === p && ctx.view === 'compare') render(); });
    return p;
  }
  const money = v => v == null ? '—' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : '$' + Math.round(v / 1e3) + 'K';
  const numT = v => v == null ? '—' : v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : fmtN(v);

  // ---- the table, as data: shared by the page and Export (PDF / Excel / CSV) ----
  // sections: [{ title, rows: [{ label, unit, cells: [{ v: raw number or text, t: shown text, best }] }] }]
  function model() {
    const base = ctx.filtered(), lists = areas.map(a => filingsIn(a, base));
    const cell = (v, t, best) => ({ v, t: t ?? String(v ?? ''), best: !!best });
    const sz = areas.map(a => sqmi(a.geom)), S = areas.map(a => stats.get(keyOf(a))), loading = areas.map(a => !stats.has(keyOf(a)));
    const CS = (key, fmt, unit) => S.map((x, i) => loading[i] ? cell(null, '…') : x && x[key] != null ? cell(x[key], fmt(x[key])) : cell(null, '—'));
    const yr = S.find(Boolean)?.baseYear;
    const census = { title: 'Area (US Census)', rows: [
      { label: 'Size', unit: 'sq mi', cells: sz.map(v => cell(+v.toFixed(1), (v < 10 ? v.toFixed(1) : fmtN(Math.round(v))) + ' sq mi')) },
      { label: 'Population', cells: CS('population', numT) },
      { label: 'Population growth' + (yr ? ' since ' + yr : ''), unit: '%', cells: CS('population_growth_pct', v => (v >= 0 ? '+' : '') + v + '%') },
      { label: 'Median household income', unit: '$', cells: CS('median_household_income_approx', money) },
      { label: 'Median home value', unit: '$', cells: CS('median_home_value_approx', money) },
      { label: 'Median rent', unit: '$ a month', cells: CS('median_gross_rent_approx', v => '$' + fmtN(v) + '/mo') },
      { label: 'Households', cells: CS('households', numT) },
      { label: 'Jobs located here', cells: CS('jobs', numT) }
    ] };
    const best = k => { const m = BY_KEY.get(k); if (m.text) return -1; const v = lists.map(l => m.fn(l)); const mx = Math.max(...v); return mx > 0 && v.filter(x => x === mx).length === 1 ? v.indexOf(mx) : -1; };
    const rows = ROWS.map(k => { const m = BY_KEY.get(k), b = best(k);
      return { label: m.label, unit: UNIT[k] || '', cells: lists.map((l, i) => { const v = m.fn(l); return cell(m.text ? v : +(+v).toFixed(2), m.fmt(v), i === b && areas.length > 1); }) }; });
    rows.push({ label: 'Filings per sq mi', cells: areas.map((a, i) => { const v = lists[i].length / Math.max(sz[i], .01); return cell(+v.toFixed(2), v.toFixed(2)); }) });
    const src = S.find(Boolean);
    return { areas: areas.slice(), lists, loading: loading.some(Boolean), sections: [census, { title: FILINGS_TITLE, rows }],
      note: src ? 'Census numbers: ACS 5-year ' + src.year + ' for the tracts centred in each area; medians are household-weighted. Jobs: LEHD LODES.' : '' };
  }
  // for Export: waits until every area's census numbers are in
  ctx.compare.model = async () => { await loadStats(); return model(); };

  // ---- view ----
  function render() {
    if (ctx.view !== 'compare') return;
    const ft = ctx.filterText();
    const cur = fromSelection(), canAdd = cur && areas.length < MAX && !has(cur.key);
    let h = '<div class="vhead"><div><div class="kicker">Compare areas</div><h2>Compare up to four areas</h2><div class="vsub">' + (ft ? 'Every area gets the same filters (everything except the area itself).' : 'All filings in each area (no other filters).') + ' Filing numbers follow your filters, so they can differ from the Market page.</div></div>' +
      '<div class="vctl">' + (canAdd ? '<button class="btn primary" id="cmpAddSel">+ Add “' + esc(cur.label) + '”' + (eachCounty().length ? ' Together' : '') + '</button>' : '') +
        (eachCounty().length && areas.length < MAX ? '<button class="btn" id="cmpAddEach">+ Add Each County (' + eachCounty().length + ')</button>' : '') + (areas.length ? '<button class="btn" id="cmpClear">Clear All</button>' : '') +
        (areas.length && ctx.exportMenu ? ctx.exportMenu([{ label: 'Comparison · PDF', attrs: ' data-cx="pdf"' }, { label: 'Comparison · Excel', attrs: ' data-cx="xlsx"' }, { label: 'Comparison · CSV', attrs: ' data-cx="csv"' }]) : '') + '</div></div>';
    h += '<div id="cmpScope"></div>' + (areas.length ? '<div class="cmp-chips">' : '<div class="cmp-chips" hidden>') + areas.map((a, i) => '<span class="cmp-chip" style="--c:' + color(i) + '"><i></i><button class="lnk" data-go="' + i + '" title="Show on the map">' + esc(a.label) + '</button><button class="ed" data-ed="' + i + '" aria-label="Rename ' + esc(a.label) + '" title="Rename">✎</button><button class="x" data-rm="' + i + '" aria-label="Remove ' + esc(a.label) + '">×</button></span>').join('') +
      (areas.length < MAX ? '<span class="cmp-slot">' + (MAX - areas.length) + ' open slot' + (MAX - areas.length > 1 ? 's' : '') + '</span>' : '') + '</div>';
    if (areas.length < 2) {
      const steps = '<ol><li>On the map, pick an area: search a city or county, click <em>County</em>, draw a <em>Shape</em> or <em>Area</em>, or set a <em>Radius</em>.</li>' +
        '<li>Click <em>+ Compare</em> at the top of the Map panel, or on the place card.</li><li>Repeat for up to four areas, then come back here.</li></ol>';
      h += ctx.vempty ? ctx.vempty({ icon: 'areas', title: areas.length ? 'Add one more area to compare' : 'Nothing to compare yet', text: 'Pick areas on the Map and add each one with + Compare.', extra: steps, actions: [{ label: 'Pick on the Map', id: 'cmpToMap', primary: true }] })
        : '<div class="cmp-empty"><b>' + (areas.length ? 'Add one more area to compare.' : 'Nothing to compare yet.') + '</b>' + steps + '<button class="btn primary" id="cmpToMap">Pick on the Map</button></div>';
    }
    let lists = [];
    if (areas.length) {
      loadStats();
      const M = model(); lists = M.lists;
      h += '<div class="tablewrap"><table class="cmp"><thead><tr><th>Metric</th>' + areas.map((a, i) => '<th style="--c:' + color(i) + '" title="' + esc(a.label) + '"><i></i>' + esc(a.label) + '</th>').join('') + '</tr></thead><tbody>' +
        M.sections.map(sec => '<tr class="sub"><th colspan="' + (areas.length + 1) + '">' + esc(sec.title) + '</th></tr>' +
          sec.rows.map(r => { const text = typeof r.cells[0].v === 'string' && r.cells.every(c => c.v == null || typeof c.v === 'string');
            return '<tr><td>' + esc(r.label) + '</td>' + r.cells.map(c => '<td class="' + (text ? '' : 'm') + (c.best ? ' best' : '') + '" title="' + esc(c.t) + '">' + esc(c.t) + '</td>').join('') + '</tr>'; }).join('')).join('') +
        '</tbody></table></div>' + (M.note ? '<div class="rnote cmp-note">' + esc(M.note) + '</div>' : '');
      h += '<div class="cmp-grid"><div class="cmp-card"><h3>Filings by quarter</h3><div id="cmpTrend"></div></div><div class="cmp-card"><h3>Share of est. value by use</h3><div id="cmpUse"></div></div></div>';
      h += '<div class="cmp-tops">' + areas.map((a, i) => '<div class="cmp-card" style="--c:' + color(i) + '"><h3><i></i>Largest in ' + esc(a.label) + '</h3>' +
        (lists[i].slice().sort((x, y) => y.cost - x.cost).slice(0, 5).map(f => '<button class="cmp-f" data-id="' + esc(f.id) + '"><span>' + esc(f.name) + '<small>' + esc(f.city || f.county) + ' · ' + esc(ctx.TYPE_LABEL[f.type]) + (f.use ? ' · ' + esc(f.use) : '') + '</small></span><b>' + fmtM(f.cost) + '</b></button>').join('') || '<div class="rnote">No filings match here.</div>') + '</div>').join('') + '</div>';
    }
    root.innerHTML = h;
    ctx.scopeBar?.(root.querySelector('#cmpScope'), { area: false, lead: 'Same filters for every area' });
    root.querySelector('#cmpAddSel')?.addEventListener('click', () => ctx.compare.addSelection());
    root.querySelector('#cmpAddEach')?.addEventListener('click', () => addEach());
    root.querySelector('#cmpClear')?.addEventListener('click', () => ctx.compare.clear());
    root.querySelector('#cmpToMap')?.addEventListener('click', () => ctx.setView('map'));
    root.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => ctx.exportCompare?.(b.dataset.cx));
    root.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => remove(+b.dataset.rm));
    root.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editName(b));
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { ctx.setView('map'); ctx.fitGeom(areas[+b.dataset.go].geom); });
    root.querySelectorAll('.cmp-f').forEach(b => b.onclick = () => { const f = ctx.BY_ID.get(b.dataset.id); if (f) { ctx.setView('map'); ctx.select(f, true); } });
    if (areas.length) { trend(lists); uses(lists); }
  }

  // a small inline edit in place of the chip's name (Enter or leaving the box saves, Esc cancels)
  function editName(btn) {
    const i = +btn.dataset.ed, chip = btn.closest('.cmp-chip'), a = areas[i]; if (!a || !chip || chip.querySelector('input')) return;
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'cmp-rename'; inp.value = a.label; inp.maxLength = 40; inp.setAttribute('aria-label', 'Area name');
    chip.querySelector('[data-go]').replaceWith(inp); chip.querySelector('[data-ed]').hidden = true; inp.focus(); inp.select();
    const old = a.label; let done = false;
    const finish = ok => { if (done) return; done = true; if (ok) rename(i, inp.value); if (!ok || areas[i]?.label === old) render(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
    inp.onblur = () => finish(true);
  }

  // registrations per quarter, one line per area. The first and last quarter are usually partial (the filing list starts and
  // ends mid-quarter): those points are hollow and the line to them is dashed, so a short quarter doesn't read as a collapse.
  function trend(lists) {
    const el = root.querySelector('#cmpTrend'); if (!el) return;
    const qOf = s => s ? s.slice(0, 4) + ' Q' + (Math.floor((+s.slice(5, 7) - 1) / 3) + 1) : null;
    const all = [...new Set(lists.flat().map(f => qOf(f.reg)).filter(Boolean))].sort();
    if (!all.length) { el.innerHTML = '<div class="rnote">No registrations to chart.</div>'; return; }
    const per = ctx.DATA?.period || {}, qStart = q => q.slice(0, 4) + '-' + String((+q.slice(6) - 1) * 3 + 1).padStart(2, '0') + '-01',
      qEnd = q => { const d = new Date(Date.UTC(+q.slice(0, 4), +q.slice(6) * 3, 0)); return d.toISOString().slice(0, 10); };
    const part = all.map(q => !!((per.start && qStart(q) < per.start) || (per.end && qEnd(q) > per.end)));
    const when = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const series = lists.map(l => all.map(q => l.filter(f => qOf(f.reg) === q).length));
    const W = 520, H = 212, M = { l: 34, r: 28, t: 10, b: 38 }, x = d3.scalePoint().domain(all).range([M.l, W - M.r]), y = d3.scaleLinear().domain([0, Math.max(1, ...series.flat())]).nice().range([H - M.b, M.t]);
    const solid = d3.line().defined((d, i) => !part[i]).x((d, i) => x(all[i])).y(d => y(d));
    const step = Math.ceil(all.length / 6), tag = i => part[i] ? (i === all.length - 1 && qEnd(all[i]) > (per.end || '') ? 'so far' : 'part') : '';
    // dashed links from the nearest full quarter to each partial point
    const dash = (s, i) => { const j = i === 0 ? 1 : i - 1; return j >= 0 && j < all.length && !part[j] ? 'M' + x(all[j]).toFixed(1) + ',' + y(s[j]).toFixed(1) + 'L' + x(all[i]).toFixed(1) + ',' + y(s[i]).toFixed(1) : ''; };
    const tickAt = i => part[i] || (i % step === 0 && !part.some((p, j) => p && Math.abs(j - i) === 1 && all.length > 8));
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="cmp-svg" role="img" aria-label="Filings by quarter">' +
      y.ticks(4).map(t => '<g><line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="gl"/><text x="' + (M.l - 6) + '" y="' + (y(t) + 3) + '" text-anchor="end">' + t + '</text></g>').join('') +
      all.map((q, i) => tickAt(i) ? '<text x="' + x(q) + '" y="' + (H - 22) + '" text-anchor="' + (i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle') + '">' + q + '</text>' + (part[i] ? '<text class="pt" x="' + x(q) + '" y="' + (H - 9) + '" text-anchor="' + (i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle') + '">' + tag(i) + '</text>' : '') : '').join('') +
      series.map((s, i) => '<path d="' + solid(s) + '" fill="none" stroke="' + color(i) + '" stroke-width="2.2"/>' + s.map((v, j) => part[j] ? '<path d="' + dash(s, j) + '" fill="none" stroke="' + color(i) + '" stroke-width="2" stroke-dasharray="4 3" opacity=".8"/>' : '').join('') +
        s.map((v, j) => '<circle cx="' + x(all[j]) + '" cy="' + y(v) + '" r="' + (part[j] ? 3.4 : 2.4) + '" fill="' + (part[j] ? 'var(--panel)' : color(i)) + '"' + (part[j] ? ' stroke="' + color(i) + '" stroke-width="1.8"' : '') + '><title>' + esc(areas[i].label) + ' · ' + all[j] + (part[j] ? ' (' + (tag(j) === 'so far' ? 'so far, ' + (per.end ? 'to ' + when(per.end) : 'quarter not over') : 'partial: the filing list starts ' + when(per.start)) + ')' : '') + ': ' + v + '</title></circle>').join('')).join('') + '</svg>' +
      (part.some(Boolean) ? '<div class="rnote">Hollow points are part-quarters: the filing list ' + [part[0] ? 'starts ' + when(per.start) : '', part[part.length - 1] ? 'runs to ' + when(per.end) + ' (the last quarter is so far)' : ''].filter(Boolean).join(' and ') + '.</div>' : '');
  }
  // 100% bars of est. value by use for each area
  function uses(lists) {
    const el = root.querySelector('#cmpUse'); if (!el) return;
    const tot = new Map(); lists.flat().forEach(f => { const u = f.use || 'Unclassified'; tot.set(u, (tot.get(u) || 0) + f.cost); });
    const top = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, USE_PAL.length).map(x => x[0]), pal = USE_PAL.concat(USE_OTHER);
    el.innerHTML = lists.map((l, i) => { const v = l.reduce((s, f) => s + f.cost, 0) || 1, parts = top.map(u => l.filter(f => (f.use || 'Unclassified') === u).reduce((s, f) => s + f.cost, 0));
      parts.push(Math.max(0, v - parts.reduce((s, x) => s + x, 0)));
      return '<div class="cmp-bar"><span class="lab" style="--c:' + color(i) + '"><i></i>' + esc(areas[i].label) + '</span><span class="bar">' + parts.map((p, j) => p > 0 ? '<b style="width:' + (p / v * 100).toFixed(2) + '%;background:' + pal[j] + '" title="' + esc((top[j] || 'All other uses') + ': ' + fmtM(p) + ' (' + Math.round(p / v * 100) + '%)') + '"></b>' : '').join('') + '</span></div>'; }).join('') +
      '<div class="cmp-key">' + top.concat('All other').map((u, j) => '<span><i style="background:' + pal[j] + '"></i>' + esc(u) + '</span>').join('') + '</div>';
  }
  ctx.onChange(() => render()); ctx.onView('compare', render);
  sync();
}
