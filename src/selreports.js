// Any report on what's picked on the map: one parcel or building, or several (Shift-click / Add on the card).
//   "Run Reports" on the property card or the "All" tab opens a dialog with every report for the picked parcels:
//   - Development (the CRE report runner, api/runner.js): Feasibility Package, Preliminary Site Plan, Parcel Map
//   - Area reports (the app's own): FEMA, Environmental, Traffic, Drive Time, Air Traffic, Crime (Houston), City / County
//     Crime, on the parcels themselves or a radius around them
// The parcels come from lib/selection.mjs (each parcel once, their outlines together). Picks with no county record
// (Harris and Waller) are filled in from Regrid when the person allows it (capped and saved, as on the card).
// Runner documents arrive over 10–20 minutes; a run's card shows them as they land, and the Reports tab lists the team's
// runs. The assistant drives the same thing (ctx.selReports, ctx.openSelReports).
import { selectedParcels, combineParcels } from './lib/selection.mjs';
import { circle, openCard, fillCard } from './reportkit.js';

const DEV = {
  feasibility: { label: 'Feasibility Package', desc: 'The full development package: research report, best-use business plan, preliminary site plan, pro forma, fact register, risk analysis and the opportunity screening. AI with web research; takes 10 to 20 minutes.' },
  site_plan: { label: 'Preliminary Site Plan', desc: 'Measured from the parcel outlines: buildable area after setbacks and detention, building footprint, units or leasable area, parking, budget and a pro forma. No AI; about a minute.' },
  parcel_map: { label: 'Parcel Map', desc: 'The parcels drawn to scale with acreage, owner and address, a legend, scale bar and north arrow. About a minute.' }
};
const AREA = {
  fema: { label: 'FEMA Report', desc: 'Flood zones, past flood claims, disasters and FEMA’s risk index.', def: 'parcels' },
  env: { label: 'Environmental Report', desc: 'Cleanup sites, tanks, wells, pipelines, wetlands and soils, out to Phase I distances from the parcel edge.', def: 'parcels' },
  traffic: { label: 'Traffic Report', desc: 'The busiest roads and daily counts, live speeds and incidents.', def: '1' },
  drivetime: { label: 'Drive-Time Map', desc: '10, 20 and 30-minute drive areas with the people and jobs inside.', def: 'point' },
  airtraffic: { label: 'Air Traffic Report', desc: 'How often planes pass over, how low, and which kinds.', def: '1' },
  crime: { label: 'Crime Report', desc: 'Houston Police incidents (City of Houston only).', def: '1' },
  crimeus: { label: 'City / County Crime', desc: 'FBI yearly figures for the local police department.', def: 'point' }
};
export const PROGRAMS = ['Townhomes for sale', 'Build-to-rent single-family homes', 'Multifamily apartments', 'Senior rental (independent living)', 'Senior for-sale cottages',
  'Duplexes', 'Retail pad sites / strip center', 'Office', 'Medical office', 'Flex / light industrial', 'Industrial warehouse / distribution', 'Self storage'];
const CODE_KEY = 'fs-team-code'; // the team passcode (src/team.js)
const getCode = () => { try { return localStorage.getItem(CODE_KEY) || ''; } catch (e) { return ''; } };

export function initSelReports(ctx) {
  const { esc, fmtN, fmtM } = ctx;
  const dlg = document.createElement('div'); dlg.className = 'xdlg'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'srTitle');
  document.body.appendChild(dlg);
  let st = { pick: 'feasibility', extent: 'parcels', keep: true, regrid: true, program: '', notes: '', price: '', images: false, floors: '', units: '' };
  try { const s = JSON.parse(localStorage.getItem('fs-selrep') || '{}'); st = { ...st, pick: s.pick || st.pick, keep: s.keep ?? st.keep, regrid: s.regrid ?? st.regrid }; } catch (e) {}
  const save = () => { try { localStorage.setItem('fs-selrep', JSON.stringify({ pick: st.pick, keep: st.keep, regrid: st.regrid })); } catch (e) {} };
  let g = null, busy = false, lastFocus = null;

  // ---------- the picked parcels ----------
  const items = () => ctx.pickedBuildings?.() || [];
  const noRecord = b => !b.parcel && !b.d?.parcels?.length && !b.regrid;
  async function gather({ regrid = false } = {}) {
    const list = items();
    await Promise.all(list.map(b => ctx.buildingDetails?.(b).catch(() => null)));
    if (regrid) for (const b of list.filter(noRecord)) {
      if (b.regridTried) continue; b.regridTried = true;
      try { const r = await fetch('api/regrid?' + new URLSearchParams({ lat: b.center[1].toFixed(6), lon: b.center[0].toFixed(6) })); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Regrid lookup failed'); if (!d.none) b.regrid = d; }
      catch (e) { b.regridErr = e.message; }
    }
    const { parcels, missing } = selectedParcels(list), site = combineParcels(parcels);
    // a site with no parcel records still has a place: the middle of the picks
    if (!site.center && list.length) site.center = [list.reduce((t, b) => t + b.center[0], 0) / list.length, list.reduce((t, b) => t + b.center[1], 0) / list.length];
    if (!parcels.length) site.label = list.length > 1 ? list.length + ' picked spots' : 'The picked spot';
    return { list, parcels, missing, site, needRegrid: list.filter(noRecord).filter(b => !b.regridTried).length };
  }
  // a plain summary of the selection (the assistant reads this)
  async function summary() {
    const x = await gather();
    return { picked: x.list.length, parcels: x.parcels.map(p => ({ address: p.situs, owner: p.owner, acres: p.acres, market_value: p.marketValue, county: p.county, parcel_id: p.propId, land_use: p.landUse, source: p.source, has_outline: !!p.geometry })),
      total_acres: x.site.totals.acres, total_market_value: x.site.totals.marketValue, owners: x.site.owners, label: x.site.label,
      without_parcel_record: x.needRegrid, note: x.needRegrid ? x.needRegrid + ' pick(s) have no free county record (Harris or Waller); a report can fill them in from Regrid.' : undefined };
  }

  // ---------- the dialog ----------
  async function open(preset = {}) {
    if (!items().length) { ctx.toast('Click a parcel or building on the map first (Shift-click to pick more), then Run Reports.'); return false; }
    Object.assign(st, Object.fromEntries(Object.entries(preset).filter(([, v]) => v !== undefined && v !== null)));
    lastFocus = document.activeElement; g = null; render(); dlg.classList.add('on');
    g = await gather(); render(); setTimeout(() => dlg.querySelector('#srGo')?.focus(), 30);
    return true;
  }
  function close() { dlg.classList.remove('on'); lastFocus?.focus?.(); }
  dlg.addEventListener('pointerdown', e => { if (e.target === dlg) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('on')) close(); });

  function render() {
    const dev = !!DEV[st.pick], a = AREA[st.pick], s = g?.site;
    const head = !g ? '<div class="rnote">Looking up the parcels…</div>' :
      '<div class="kgrid msum sr-sum"><div><b>' + fmtN(g.parcels.length) + '</b><span>Parcel' + (g.parcels.length === 1 ? '' : 's') + '</span></div><div><b>' + (s.totals.acres != null ? s.totals.acres.toFixed(2) : '—') + '</b><span>Acres</span></div>' +
      '<div><b>' + (s.totals.marketValue ? fmtM(s.totals.marketValue) : '—') + '</b><span>Market value</span></div><div><b>' + fmtN(s.owners.length) + '</b><span>Owner' + (s.owners.length === 1 ? '' : 's') + '</span></div></div>' +
      (g.needRegrid ? '<label class="tg2 sr-rg"><input type="checkbox" id="srRg"' + (st.regrid ? ' checked' : '') + '><span>' + g.needRegrid + ' pick' + (g.needRegrid === 1 ? ' has' : 's have') + ' no free county record (Harris and Waller aren’t in the state’s parcel data). Fill ' + (g.needRegrid === 1 ? 'it' : 'them') + ' in from Regrid: up to ' + g.needRegrid + ' paid record' + (g.needRegrid === 1 ? '' : 's') + ', free if looked up before.</span></label>' : '') +
      (g.parcels.length && g.parcels.length > s.withOutline ? '<div class="xnote">' + (g.parcels.length - s.withOutline) + ' of the parcels has no outline, so maps and site plans use the acreage only.</div>' : '');
    const card = (k, r) => '<label class="xr' + (st.pick === k ? ' on' : '') + '"><input type="radio" name="srpick" value="' + k + '"' + (st.pick === k ? ' checked' : '') + '><b>' + r.label + '</b><span>' + r.desc + '</span></label>';
    const extent = a && a.def !== 'point' ? '<div class="xsec"><div class="lt">Area to cover</div><div class="seg xfmt" id="srExt">' + [['parcels', 'The parcels'], ['1', '1 mi around'], ['3', '3 mi'], ['5', '5 mi']].map(([v, l]) =>
      '<button type="button" data-x="' + v + '" aria-pressed="' + (st.extent === v) + '">' + l + '</button>').join('') + '</div></div>' : '';
    const devOpts = !dev ? '' : '<div class="xsec sr-opts"><div class="lt">' + (st.pick === 'parcel_map' ? 'Ready' : 'What to plan for') + '</div>' +
      (st.pick !== 'parcel_map' ? '<label class="sr-f"><span>Development program' + (st.pick === 'feasibility' ? ' <i>(optional: leave blank and the analysis picks the best use)</i>' : '') + '</span><input id="srProg" list="srProgs" value="' + esc(st.program) + '" placeholder="e.g. 96 townhomes for sale, or Self storage" maxlength="300"></label><datalist id="srProgs">' + PROGRAMS.map(p => '<option value="' + esc(p) + '">').join('') + '</datalist>' : '') +
      (st.pick === 'feasibility' ? '<label class="sr-f"><span>What you know <i>(owner’s plans, utilities, deed restrictions…)</i></span><textarea id="srNotes" rows="2" maxlength="2000">' + esc(st.notes) + '</textarea></label>' +
        '<label class="sr-f"><span>Asking or purchase price <i>(optional)</i></span><input id="srPrice" inputmode="numeric" value="' + esc(st.price) + '" placeholder="$"></label>' +
        '<label class="tg2"><input type="checkbox" id="srImg"' + (st.images ? ' checked' : '') + '><span>Add five AI concept renderings (extra cost)</span></label>' : '') +
      (st.pick === 'site_plan' ? '<div class="sr-2"><label class="sr-f"><span>Floors <i>(optional)</i></span><input id="srFloors" inputmode="numeric" value="' + esc(st.floors) + '"></label><label class="sr-f"><span>Units <i>(optional)</i></span><input id="srUnits" inputmode="numeric" value="' + esc(st.units) + '"></label></div>' : '') +
      '<div class="xnote">Made by Finishes’ CRE report runner from the parcel records above. Documents appear on the map card as each is finished, and the whole team sees them under Reports.</div></div>';
    const keep = !dev ? '<div class="xsec"><label class="tg2"><input type="checkbox" id="srKeep"' + (st.keep ? ' checked' : '') + '><span>Keep the parcels as the selected area (to run more reports from This Area)</span></label></div>' : '';
    const blocked = !g ? 'Loading…' : !g.list.length ? 'Nothing is picked.' : dev && !g.parcels.length ? 'These picks have no parcel record yet' + (g.needRegrid ? ': tick the Regrid box above.' : '.') :
      st.pick === 'parcel_map' && !s.withOutline ? 'A parcel map needs parcel outlines.' : '';
    dlg.innerHTML = '<div class="xbox"><div class="xh"><div><div class="kicker">Reports</div><h2 id="srTitle">' + esc(s?.label || 'Selected parcels') + '</h2></div><button class="x" id="srClose" aria-label="Close">×</button></div>' + head +
      '<div class="xsec"><div class="lt">Development</div><div class="xreports">' + Object.entries(DEV).map(([k, r]) => card(k, r)).join('') + '</div></div>' +
      '<div class="xsec"><div class="lt">Area reports</div><div class="xreports">' + Object.entries(AREA).map(([k, r]) => card(k, r)).join('') + '</div></div>' +
      extent + devOpts + keep +
      '<div class="xf"><span class="xmsg" id="srMsg">' + esc(blocked) + '</span><button class="btn" id="srCancel">Cancel</button><button class="btn primary xgo" id="srGo"' + (blocked || busy ? ' disabled' : '') + '>' + (busy ? 'Starting…' : 'Run ' + esc((DEV[st.pick] || AREA[st.pick]).label)) + '</button></div></div>';
    dlg.querySelector('#srClose').onclick = dlg.querySelector('#srCancel').onclick = close;
    dlg.querySelectorAll('[name=srpick]').forEach(i => i.onchange = () => { keepInputs(); st.pick = i.value; if (AREA[st.pick]) st.extent = AREA[st.pick].def === 'point' ? 'parcels' : AREA[st.pick].def; save(); render(); });
    dlg.querySelectorAll('#srExt [data-x]').forEach(b => b.onclick = () => { st.extent = b.dataset.x; render(); });
    const rg = dlg.querySelector('#srRg'); if (rg) rg.onchange = async () => { st.regrid = rg.checked; save(); if (st.regrid) { keepInputs(); g = await gather({ regrid: true }); render(); } };
    const kp = dlg.querySelector('#srKeep'); if (kp) kp.onchange = () => { st.keep = kp.checked; save(); };
    dlg.querySelector('#srGo').onclick = go;
  }
  // typed values survive a redraw
  function keepInputs() {
    const v = id => dlg.querySelector(id)?.value;
    if (v('#srProg') != null) st.program = v('#srProg'); if (v('#srNotes') != null) st.notes = v('#srNotes'); if (v('#srPrice') != null) st.price = v('#srPrice');
    if (v('#srFloors') != null) st.floors = v('#srFloors'); if (v('#srUnits') != null) st.units = v('#srUnits');
    const im = dlg.querySelector('#srImg'); if (im) st.images = im.checked;
  }
  async function go() {
    keepInputs(); busy = true; render();
    try {
      if (st.regrid && g.needRegrid) g = await gather({ regrid: true });
      if (DEV[st.pick]) { await startRun(st.pick, g, { program: st.program, notes: st.notes, purchase_price: st.price, images: st.images, floors: st.floors, units: st.units }); close(); }
      else { runArea(st.pick, g, st.extent, st.keep); close(); }
    } catch (e) { ctx.toast(e.message); }
    finally { busy = false; if (dlg.classList.contains('on')) render(); }
  }

  // ---------- area reports on the parcels ----------
  function runArea(key, x, extent, keep) {
    const s = x.site, center = s.center; if (!center) throw new Error('Nothing is picked.');
    let geometry = s.geometry, label = s.label;
    if (extent !== 'parcels' || !geometry) {
      const mi = extent === 'parcels' ? 1 : +extent || 1;
      if (extent === 'parcels' && !geometry) ctx.toast('These parcels have no outline, so the report covers 1 mile around them.');
      geometry = circle(center, mi); label = mi + ' mi around ' + s.label;
    }
    if (keep && s.geometry) ctx.setSelection?.('shape', s.label, s.geometry);
    if (ctx.view !== 'map') ctx.setView?.('map');
    if (key === 'fema') return ctx.femaReport({ geometry, label });
    if (key === 'env') return ctx.envReport({ geometry, label });
    if (key === 'crime') return ctx.crimeReport({ geometry, label, center });
    if (key === 'crimeus') return ctx.crimeUSReport({ center, label: s.label });
    if (key === 'drivetime') return ctx.runAreaReport('drivetime', { geometry, label: s.label, center });
    return ctx.runAreaReport(key, { geometry, label, center });
  }

  // ---------- runner runs ----------
  async function startRun(kind, x, options) {
    if (!x.parcels.length) throw new Error('These picks have no parcel record, so the report runner has nothing to work from.');
    const r = await fetch('api/runner', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-field-code': getCode() }, body: JSON.stringify({ kind, parcels: x.parcels, options }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && d.code) throw new Error('Enter the team passcode under Notes first: these reports use paid AI.');
    if (!r.ok) throw new Error(d.error || 'The report runner didn’t start (' + r.status + ').');
    ctx.toast(DEV[kind].label + ' started for ' + d.label + (kind === 'feasibility' ? '. It takes 10 to 20 minutes; documents appear on the card as each one is done.' : '.'));
    showRun(d.id);
    return d;
  }

  const STATUS = { running: 'Working', done: 'Done', partial: 'Partly done', failed: 'Failed' };
  let shown = null, pollT = 0;
  async function showRun(id) {
    clearTimeout(pollT);
    if (ctx.view !== 'map') ctx.setView?.('map');
    // openCard closes the card that was open, which clears `shown`: set it after
    const card = openCard(ctx, { kicker: 'Report run', title: 'Loading…' }); shown = id;
    const tick = async () => {
      if (shown !== id || !card.isConnected || !card.classList.contains('open')) return;
      let d; try { const r = await fetch('api/runner?id=' + id, { cache: 'no-store' }); d = await r.json(); if (!r.ok) throw new Error(d.error); }
      catch (e) { if (shown === id) fillCard(ctx, card, '<div class="top"><div><div class="kicker">Report run</div><h2>Couldn’t load the run</h2><div class="bsub">' + esc(e.message) + '</div></div><button class="x" aria-label="Close">×</button></div>'); return; }
      if (shown !== id || !card.classList.contains('open')) return;
      fillCard(ctx, card, runHtml(d)); wireRun(card, d);
      if (d.run.status === 'running') pollT = setTimeout(tick, 12000);
    };
    tick();
  }
  ctx.onCardClose?.(() => { shown = null; clearTimeout(pollT); });

  function runHtml({ run, docs }) {
    const kind = DEV[run.kind]?.label || 'Report', by = Object.fromEntries(docs.map(d => [d.doc_type, d]));
    const mins = Math.round((Date.now() - Date.parse(run.created_at)) / 6e4), late = run.status === 'running' && mins > 45;
    const sc = by.screening?.meta, sp = by.preliminary_site?.meta;
    const rec = sc?.recommendation ? String(sc.recommendation).replace(/_/g, ' – ').replace(/^\w/, c => c.toUpperCase()) : '';
    const tiles = [rec && ['Recommendation', esc(rec)], sc?.viability_score != null && ['Viability', esc(sc.viability_score) + '/100'], sc?.risk_score != null && ['Risk', esc(sc.risk_score) + '/100'],
      sp?.units && ['Units / suites', fmtN(sp.units)], sp?.building_sf && ['Building sq ft', fmtN(sp.building_sf)], sp?.total_project_cost && ['Project cost', fmtM(sp.total_project_cost)]].filter(Boolean);
    const titles = { screening: 'Opportunity Screening Report', report: 'Initial Information Report', business: 'Development Business Plan', proforma: 'Pro Forma', preliminary_site: 'Preliminary Site Plan', site_map: 'Parcel Map', verify: 'Fact & Assumption Register', risk: 'Risk Analysis', images: 'Concept Renderings' };
    const row = t => { const d = by[t];
      const state = !d ? (run.status === 'running' ? '<span class="rr-st w">Working…</span>' : '<span class="rr-st x">Not made</span>') : d.ok ? '<span class="rr-st ok">Ready</span>' : '<span class="rr-st x">Failed</span>';
      const acts = d?.ok && t !== 'images' ? '<a class="btn" href="api/runner?id=' + run.id + '&doc=' + t + '" target="_blank" rel="noopener">Open</a><button class="btn" type="button" data-pdf="' + t + '">PDF</button>' : '';
      const extra = t === 'images' && d?.ok ? '<div class="rr-imgs">' + (d.meta.images || []).map(im => '<a href="' + esc(im.url) + '" target="_blank" rel="noopener"><img src="' + esc(im.url) + '" alt="' + esc(im.label) + '" loading="lazy"></a>').join('') + '</div>' : '';
      return '<div class="rr-row"><div><b>' + esc(titles[t] || d?.title || t) + '</b>' + (d && !d.ok ? '<em>' + esc(d.error) + '</em>' : '') + extra + '</div><div class="rr-act">' + state + acts + '</div></div>'; };
    const errs = docs.filter(d => !d.ok && !run.expected.includes(d.doc_type));
    return '<div class="top"><div><div class="kicker">' + esc(kind) + ' · ' + esc(STATUS[run.status] || run.status) + '</div><h2>' + esc(run.label) + '</h2><div class="bsub">Started ' + esc(new Date(run.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) +
      (run.options?.program ? ' · ' + esc(run.options.program) : '') + (run.site?.acres ? ' · ' + esc(String(run.site.acres)) + ' acres' : '') + '</div></div><button class="x" aria-label="Close">×</button></div>' +
      (tiles.length ? '<div class="kgrid msum">' + tiles.map(([k, v]) => '<div><b>' + v + '</b><span>' + k + '</span></div>').join('') + '</div>' : '') +
      '<div class="bsec"><div class="lt">Documents · ' + docs.filter(d => d.ok && run.expected.includes(d.doc_type)).length + ' of ' + run.expected.length + '</div>' +
      run.expected.map(row).join('') +
      errs.map(d => '<div class="rr-row"><div><b>' + esc(d.title) + (d.meta?.stage ? ' · ' + esc(d.meta.stage) : '') + '</b><em>' + esc(d.error) + '</em></div><div class="rr-act"><span class="rr-st x">Stopped</span></div></div>').join('') + '</div>' +
      (late ? '<div class="rnote err">Still working after ' + mins + ' minutes, longer than usual. The runner may have stopped part-way; its error notices go to the team’s error hook.</div>' : run.status === 'running' ? '<div class="rnote">This card checks for new documents every few seconds. You can close it: the run carries on, and it’s listed under Reports.</div>' : '') +
      '<div class="rnote">Preliminary working papers from public records and AI research: check every figure before relying on it.</div>';
  }
  function wireRun(card, { run, docs }) {
    card.querySelectorAll('[data-pdf]').forEach(b => b.onclick = async () => {
      const t = b.dataset.pdf, d = docs.find(x => x.doc_type === t); b.disabled = true; b.textContent = 'Making PDF…';
      try {
        const r = await fetch('api/runner?id=' + run.id + '&doc=' + t + '&pdf=1'); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'PDF failed (' + r.status + ')');
        ctx.exportMeta = { report: 'runner-' + run.kind, reportLabel: d?.title, format: 'pdf', filings: null, scope: run.label };
        try { await ctx.saveFile((d?.name || (d?.title || t) + ' - ' + run.label + '.pdf').replace(/[\\/:*?"<>|]+/g, ' '), await r.blob(), 'application/pdf'); } finally { ctx.exportMeta = null; }
      } catch (e) { ctx.toast(e.message + '. Open it instead and use Print → Save as PDF.'); }
      finally { b.disabled = false; b.textContent = 'PDF'; }
    });
  }

  // ---------- the team's runs, on the Reports tab ----------
  ctx.renderRunsInto = async el => {
    if (!el) return;
    let d; try { const r = await fetch('api/runner?list=1', { cache: 'no-store' }); d = await r.json(); if (!r.ok) throw new Error(d.error); }
    catch (e) { el.innerHTML = '<div class="lt">Development Reports</div><div class="rnote">' + esc(/SUPABASE|REPORT_RUNNER|not connected/i.test(e.message) ? 'The feasibility report runner isn’t connected to this site yet.' : 'Couldn’t load the team’s report runs: ' + e.message) + '</div>'; return; }
    el.innerHTML = '<div class="lt">Development Reports · the team’s runs</div>' + (d.runs.length ? '<div class="rp-list">' + d.runs.map(r => '<div class="rp-row"><span class="rp-ic rp-pdf">' + (r.kind === 'feasibility' ? 'FEAS' : r.kind === 'site_plan' ? 'PLAN' : 'MAP') + '</span><div class="rp-m"><b>' + esc(DEV[r.kind]?.label || r.kind) + ' · ' + esc(r.label) + '</b><span>' +
      esc(new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' · ' + esc(STATUS[r.status] || r.status) + (r.options?.program ? ' · ' + esc(r.options.program) : '') + '</span>' + (r.error ? '<em>' + esc(r.error) + '</em>' : '') + '</div>' +
      '<div class="rp-act"><button type="button" class="btn" data-run="' + esc(r.id) + '">Open</button></div></div>').join('') + '</div>' :
      '<div class="empty">No development reports yet. Click a parcel on the map (Shift-click for more), then Run Reports on its card.</div>');
    el.querySelectorAll('[data-run]').forEach(b => b.onclick = () => showRun(b.dataset.run));
  };

  ctx.openSelReports = open;
  ctx.selReports = { summary, gather, open, runArea: async (key, extent = AREA[key]?.def, keep = true) => runArea(key, await gather(), extent === 'point' ? 'parcels' : extent, keep),
    startRun: async (kind, options = {}, { regrid = true } = {}) => { close(); return startRun(kind, await gather({ regrid }), options); }, showRun, DEV, AREA };
}
