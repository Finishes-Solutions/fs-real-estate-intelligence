// Regrid (paid, capped on the server by api/regrid.js):
//   Parcel Lines layer: Regrid parcel boundaries at street zoom (tiles are only requested at zoom 15–16; closer zooms reuse them)
//   Building card: a "Get Regrid Details" button; one record per click, saved so the same parcel never costs twice
// Both show how much of this month's allowance is left; when a cap is reached they say so and stop.
const SRC = 'regrid', LAYER = 'regrid-lines';

export function initRegrid(ctx) {
  const { map, esc, fmtN } = ctx, box = document.getElementById('lyRegrid');
  let on = false, usage = null;
  const getUsage = async () => { try { const r = await fetch('api/regrid?usage=1', { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return usage = d; } catch (e) { return { error: e.message }; } };
  const left = (u, k) => u?.[k] ? Math.max(0, u[k].cap - u[k].used) : null;

  function addLayer() {
    if (!on || !map.getStyle()) return;
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'vector', tiles: [location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/regrid?tile={z}/{x}/{y}'], minzoom: 15, maxzoom: 16, attribution: 'Parcels © Regrid' });
    if (!map.getLayer(LAYER)) map.addLayer({ id: LAYER, type: 'line', source: SRC, 'source-layer': 'parcels', minzoom: 15,
      paint: { 'line-color': ctx.isDark() ? '#f2c14e' : '#b7791f', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, .6, 18, 1.6], 'line-opacity': .85 } });
  }
  function removeLayer() { if (map.getLayer(LAYER)) map.removeLayer(LAYER); if (map.getSource(SRC)) map.removeSource(SRC); }
  if (box) box.onchange = async () => {
    on = box.checked;
    if (!on) { removeLayer(); return; }
    const u = await getUsage();
    if (u.error) { ctx.toast('Parcel lines aren’t available: ' + u.error); box.checked = on = false; return; }
    if (left(u, 'tiles') === 0) { ctx.toast('Parcel lines are paused: this month’s Regrid tile allowance (' + fmtN(u.tiles.cap) + ') is used up.'); box.checked = on = false; return; }
    addLayer(); if (map.getZoom() < 15) ctx.toast('Parcel lines show from street level: zoom in to see them. ' + fmtN(left(u, 'tiles')) + ' Regrid tiles left this month.');
  };
  ctx.onOverlays(addLayer);
  ctx.regridUsage = () => usage;

  // ---------- building card ----------
  ctx.renderRegrid = (el, center, parcel) => {
    if (!el) return;
    const key = parcel?.propId && parcel?.county ? parcel.county + '|' + parcel.propId : '';
    const btn = (u) => '<div class="lt">Regrid parcel record</div><button class="btn" type="button" id="rgGo">Get Regrid Details</button><div class="rnote">Zoning, standardized land use and the full parcel record. Uses 1 of your Regrid records' +
      (u && !u.error ? ' (' + fmtN(left(u, 'records')) + ' of ' + fmtN(u.records.cap) + ' left this month)' : '') + '; a parcel looked up before is free.</div>';
    el.innerHTML = btn(usage);
    getUsage().then(u => { if (el.isConnected && el.querySelector('#rgGo')) { el.innerHTML = btn(u); wire(); } });
    function wire() {
      el.querySelector('#rgGo').onclick = async () => {
        el.innerHTML = '<div class="lt">Regrid parcel record</div><div class="rnote">Looking up…</div>';
        try {
          const r = await fetch('api/regrid?' + new URLSearchParams({ lat: center[1].toFixed(6), lon: center[0].toFixed(6), ...(key ? { key } : {}) }));
          const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Regrid lookup failed');
          if (d.usage) usage = d.usage;
          if (d.none) { el.innerHTML = '<div class="lt">Regrid parcel record</div><div class="rnote">Regrid has no parcel at this point.</div>'; return; }
          const z = d.zoning;
          el.innerHTML = '<div class="lt">Regrid parcel record</div><dl>' + d.fields.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
            (z ? '<div class="lt">Zoning (Regrid)</div><dl>' + [['Zone', [z.zoning, z.zoning_description].filter(Boolean).join(' · ')], ['Type', [z.zoning_type, z.zoning_subtype].filter(Boolean).join(' · ')], ['Max height', z.max_building_height_ft && z.max_building_height_ft + ' ft'], ['Max FAR', z.max_far], ['Max coverage', z.max_coverage_pct && z.max_coverage_pct + '%'], ['Density', z.max_density_du_per_acre && z.max_density_du_per_acre + ' units/acre']].filter(([, v]) => v).map(([k, v]) => '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>').join('') + (z.zoning_code_link ? '<dt>Code</dt><dd><a href="' + esc(z.zoning_code_link) + '" target="_blank" rel="noopener">Zoning code ↗</a></dd>' : '') + '</dl>' : '') +
            (d.more?.length ? '<details class="raw"><summary>All Regrid fields (' + d.more.length + ')</summary><dl>' + d.more.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl></details>' : '') +
            '<div class="rnote">' + (d.cached ? 'Saved copy from ' + esc(d.fetched) + ' (no charge).' : 'Used 1 Regrid record.') + (d.usage ? ' ' + fmtN(left(d.usage, 'records')) + ' of ' + fmtN(d.usage.records.cap) + ' left this month.' : '') +
            (d.path ? ' <a href="https://app.regrid.com' + esc(d.path) + '" target="_blank" rel="noopener">Open in Regrid ↗</a>' : '') + '</div>';
        } catch (e) { el.innerHTML = '<div class="lt">Regrid parcel record</div><div class="rnote err">' + esc(e.message) + '</div>'; }
      };
    }
    wire();
  };
}
