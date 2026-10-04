// Filters panel: filters for the map's layers, not just construction filings (the construction filters are one section).
//   Filter each layer   Demographics thresholds fade the tracts that fail on the Demographics layer, Traffic hides quieter
//                       roads, Risk picks the flood zones and crime type shown. Setting one turns its layer on.
//   Match everything    Every threshold that's set must hold; census tracts that pass light up and the rest of the map
//                       fades. Adds two criteria that only make sense for matching: FEMA flood risk rating and the number
//                       of construction projects (the ones the construction filters leave).
// The thresholds and their tests are in lib/screen.mjs; tract busiest road and flood rating come from the nightly build.
import { CRITERIA, BY, active, tractPasses, tractExpr, optLabel, describeScreen } from './lib/screen.mjs';
import { prepare, contains } from './lib/geomatch.mjs';

const KEY = 'fs-lf', DEMO = CRITERIA.filter(c => c.group === 'demo').map(c => c.k);

export function initLayerFilters(ctx) {
  const { map, esc, fmtN } = ctx, pop = document.getElementById('filterPop'); if (!pop) return;
  const el = id => document.getElementById(id);
  let st = { mode: 'each', crit: {}, flood: 'all', crime: 't' };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') st = { ...st, ...s, crit: s.crit || {} }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  // ---------- the rows ----------
  for (const box of pop.querySelectorAll('.lfrows')) {
    box.innerHTML = CRITERIA.filter(c => c.group === box.dataset.group).map(c =>
      '<div class="lfrow' + (c.matchOnly ? ' mo' : '') + '"><label for="lf_' + c.k + '">' + esc(c.label) + '</label><select class="chip" id="lf_' + c.k + '" data-k="' + c.k + '"><option value="">Any</option>' +
      c.opts.map(v => '<option value="' + v + '">' + esc(optLabel(c, v)) + '</option>').join('') + '</select></div>').join('');
  }
  pop.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { const v = s.value; if (v === '') delete st.crit[s.dataset.k]; else st.crit[s.dataset.k] = isNaN(+v) ? v : +v; changed(s.dataset.k); });
  el('lfFlood').onchange = e => { st.flood = e.target.value; ctx.femaClass?.(st.flood); changed(); };
  el('lfCrime').onchange = e => { st.crime = e.target.value; const c = el('lyCrimeCat'); if (c) { c.value = st.crime; c.dispatchEvent(new Event('change')); } if (st.crime !== 't' && !el('lyCrime')?.checked) ctx.crimeLayer?.(true); changed(); };
  pop.querySelectorAll('#lfMode button').forEach(b => b.onclick = () => { st.mode = b.dataset.m; changed(); });

  // ---------- applying them ----------
  let market = null, tractIdx = null, projCount = null;
  async function tracts() { if (!market) { try { market = await ctx.loadMarket(); } catch (e) { return null; } } return market?.tracts || null; }
  function apply(key) {
    const match = st.mode === 'match', demoSet = active(st.crit).some(([c]) => c.group === 'demo');
    // filter each layer
    ctx.setTractFade?.(match ? null : tractExpr(st.crit, DEMO));
    if (!match && demoSet && key && DEMO.includes(key) && !ctx.demoMetric?.()) ctx.showDemographic?.(key); // show the measure being filtered
    ctx.trafficMin?.(match ? 0 : st.crit.aadt || 0);
    if (!match && key === 'aadt' && st.crit.aadt && !el('lyAadt')?.checked) ctx.trafficLayer?.(true);
    // match everything
    renderMatch();
  }
  async function renderMatch() {
    const box = el('lfMatch'), match = st.mode === 'match', crit = active(st.crit);
    if (!match || !crit.length) { box.hidden = !match; if (match) box.innerHTML = '<p>Set one or more thresholds below; the places that meet <b>all</b> of them light up on the map.</p>'; clearMatchLayer(); syncFooter(); return; }
    const T = await tracts(); if (!T) { box.hidden = false; box.textContent = 'Area data isn’t available yet.'; return; }
    if (st.mode !== 'match') return;
    // criteria whose data hasn't arrived yet (busiest road and flood rating come with the nightly refresh) are skipped
    const have = new Set(CRITERIA.filter(c => c.k === 'proj' || T.some(t => t[c.k] != null)).map(c => c.k));
    const use = Object.fromEntries(Object.entries(st.crit).filter(([k]) => have.has(k))), missing = crit.filter(([c]) => !have.has(c.k)).map(([c]) => c.label);
    if ('proj' in use) countProjects(T);
    const rows = T.map(t => ({ t, ok: tractPasses(projCount && 'proj' in use ? { ...t, proj: projCount[t.g] || 0 } : t, use) })), hits = rows.filter(r => r.ok);
    drawMatchLayer(rows); lastHits = hits.map(r => r.t);
    box.hidden = false;
    box.innerHTML = '<div class="lfm-n"><b>' + fmtN(hits.length) + '</b> of ' + fmtN(T.length) + ' areas match</div>' +
      (hits.length ? '<button type="button" class="lnk" id="lfZoom">Zoom to matches</button>' : '') +
      '<div class="lfm-s">Census tracts that meet every threshold are outlined in green; the rest fade.</div>' +
      (missing.length ? '<div class="lfm-w">' + esc(missing.join(' and ')) + ' arrive' + (missing.length > 1 ? '' : 's') + ' with the next nightly data refresh, so ' + (missing.length > 1 ? 'they’re' : 'it’s') + ' left out for now.</div>' : '');
    el('lfZoom')?.addEventListener('click', zoomToHits);
    syncFooter(hits.length);
  }
  let lastHits = [];
  function zoomToHits() {
    if (!lastHits.length) return; let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const t of lastHits) { const b = prepare(t.geom)?.box; if (!b) continue; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    ctx.closeFilters?.(); ctx.fitBox?.([[x0, y0], [x1, y1]], { maxZoom: 13 });
  }
  // construction projects per tract: the filings the construction filters leave (not the area selection or month)
  function countProjects(T) {
    if (!tractIdx) { const G = .05, cells = new Map(); T.forEach((t, i) => { const b = prepare(t.geom)?.box; if (!b) return; for (let x = Math.floor(b[0] / G); x <= Math.floor(b[2] / G); x++) for (let y = Math.floor(b[1] / G); y <= Math.floor(b[3] / G); y++) { const k = x + ',' + y; (cells.get(k) || cells.set(k, []).get(k)).push(i); } }); tractIdx = { G, cells }; }
    const out = {}, { G, cells } = tractIdx;
    for (const f of ctx.filtered()) { const pt = [f.lon, f.lat]; for (const i of cells.get(Math.floor(pt[0] / G) + ',' + Math.floor(pt[1] / G)) || []) if (contains(T[i].geom, pt)) { out[T[i].g] = (out[T[i].g] || 0) + 1; break; } }
    projCount = out;
  }
  const SRC = 'lf-tracts';
  function drawMatchLayer(rows) {
    if (!map.getStyle()) return;
    const data = { type: 'FeatureCollection', features: rows.map(r => ({ type: 'Feature', properties: { m: r.ok ? 1 : 0 }, geometry: r.t.geom })) };
    const s = map.getSource(SRC); if (s) { s.setData(data); return; }
    map.addSource(SRC, { type: 'geojson', data });
    const before = map.getLayer('county-line') ? 'county-line' : undefined, dark = ctx.isDark();
    map.addLayer({ id: 'lf-dim', type: 'fill', source: SRC, filter: ['==', ['get', 'm'], 0], paint: { 'fill-color': dark ? '#0b0d0c' : '#ffffff', 'fill-opacity': dark ? .55 : .6 } }, before);
    map.addLayer({ id: 'lf-hit', type: 'fill', source: SRC, filter: ['==', ['get', 'm'], 1], paint: { 'fill-color': '#1f9249', 'fill-opacity': .22 } }, before);
    map.addLayer({ id: 'lf-hit-line', type: 'line', source: SRC, filter: ['==', ['get', 'm'], 1], paint: { 'line-color': dark ? '#4caf70' : '#006527', 'line-width': 1.4 } }, before);
  }
  function clearMatchLayer() { for (const id of ['lf-hit-line', 'lf-hit', 'lf-dim']) if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(SRC)) map.removeSource(SRC); lastHits = []; }
  ctx.onOverlays?.(() => { if (st.mode === 'match' && active(st.crit).length) renderMatch(); else if (st.mode !== 'match') apply(); });
  ctx.onChange?.(() => { if (st.mode === 'match' && 'proj' in st.crit) renderMatch(); });

  // ---------- the panel's state ----------
  function syncUI() {
    pop.classList.toggle('lf-match', st.mode === 'match');
    pop.querySelectorAll('#lfMode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
    pop.querySelectorAll('select[data-k]').forEach(s => { const v = st.crit[s.dataset.k]; s.value = v == null ? '' : String(v); });
    el('lfFlood').value = st.flood; el('lfCrime').value = st.crime;
    for (const [id, groups] of [['lfDemo', ['demo']], ['lfTraffic', ['traffic']], ['lfRisk', ['risk']]]) {
      const n = active(st.crit).filter(([c]) => groups.includes(c.group) && (st.mode === 'match' || !c.matchOnly)).length + (id === 'lfRisk' ? (st.flood !== 'all') + (st.crime !== 't') : 0);
      const em = el(id).querySelector('summary em'); em.textContent = n ? '· ' + n + ' on' : ''; if (n) el(id).open = true;
    }
  }
  function syncFooter(nMatch) {
    const b = el('filterDone'); if (!b) return;
    if (st.mode === 'match' && active(st.crit).length) b.textContent = 'Show ' + fmtN(nMatch ?? lastHits.length) + ' matching area' + ((nMatch ?? lastHits.length) === 1 ? '' : 's');
    else if (ctx.layersState?.dots) b.textContent = 'Show ' + fmtN(ctx.visible.length) + ' filing' + (ctx.visible.length === 1 ? '' : 's');
    else b.textContent = 'Done';
  }
  function changed(key) { save(); syncUI(); apply(key); ctx.syncFilterUI?.(); }

  // ---------- for the Clear button, the filter badge and the assistant's context ----------
  ctx.layerFilterCount = () => active(st.crit).filter(([c]) => st.mode === 'match' || !c.matchOnly).length + (st.flood !== 'all') + (st.crime !== 't');
  ctx.layerFilterText = () => [describeScreen(st.mode === 'match' ? st.crit : Object.fromEntries(Object.entries(st.crit).filter(([k]) => !BY[k].matchOnly))), st.flood === 'high' ? 'High-risk flood zones only' : '', st.crime !== 't' ? (st.crime === 'v' ? 'Violent' : 'Property') + ' crime' : ''].filter(Boolean).join(' · ') + (st.mode === 'match' && active(st.crit).length ? ' (matching everything)' : '');
  ctx.clearLayerFilters = () => { const had = st.flood !== 'all', hadCrime = st.crime !== 't'; st = { ...st, crit: {}, flood: 'all', crime: 't' }; save(); syncUI(); if (had) ctx.femaClass?.('all'); if (hadCrime) { const c = el('lyCrimeCat'); if (c) { c.value = 't'; c.dispatchEvent(new Event('change')); } } apply(); };
  ctx.syncFilterFooter = () => syncFooter();
  syncUI(); setTimeout(() => { apply(); if (st.flood === 'high') ctx.femaClass?.('high'); }, 0);
}
