// Development pipeline layers (api/devdata: loaded nightly by the "County data" workflow, build/county-data.mjs):
//   Building Permits (Harris County)   every permit the Harris Central Appraisal District records (building, trade, roofing, sign, pool…), all years, by kind
//   Plats & New Subdivisions           City of Houston plat applications (city + ETJ), recorded subdivisions elsewhere
//   TxDOT Projects                     planned, under way and recently finished highway work, as lines
//   Water Districts (MUDs)             district outlines, newest ones brightest; card with creation date, tax rate, bonds
//   Schools                            public school campuses sized by enrollment
// One "Show" picker sets how far back permits, plats and districts go. Each row opens a card.
// ctx.devNear(lat, lon, m, kinds) for the property card; ctx.devLayer(kind, on) for the assistant.
import { esc, fmt, openCard, cardTop, fillCard } from './reportkit.js';
import { readJSON } from './lib/http.mjs';

export const DEV = {
  permit: { box: 'lyDevPermit', label: 'Building permits', short: 'Permits', minz: 13, shapes: false, dated: true,
    cats: { 'new-commercial': ['New commercial building', '#c2410c'], 'new-home': ['New home', '#2563eb'], remodel: ['Addition, remodel or lease space', '#7c3aed'], 'site-work': ['Paving or site work', '#64748b'], demolition: ['Demolition', '#dc2626'],
      electrical: ['Electrical', '#ca8a04'], plumbing: ['Plumbing', '#0891b2'], mechanical: ['Mechanical / HVAC', '#0d9488'], roofing: ['Roofing', '#a16207'], fire: ['Fire sprinkler or alarm', '#be123c'], sign: ['Sign', '#db2777'], pool: ['Pool or spa', '#0ea5e9'], fence: ['Fence', '#84cc16'], occupancy: ['Certificate of occupancy', '#16a34a'], other: ['Other permit', '#94a3b8'] } },
  plat: { box: 'lyDevPlat', label: 'Plats & new subdivisions', short: 'Plats', minz: 11, shapes: true, dated: true,
    cats: { planned: ['Planned (general or preliminary plat)', '#0891b2'], plat: ['Plat', '#16a34a'], replat: ['Replat', '#65a30d'], recorded: ['Recorded subdivision', '#0d9488'], vacated: ['Vacated', '#94a3b8'] } },
  txdot: { box: 'lyDevTxdot', label: 'TxDOT projects', short: 'TxDOT', minz: 8, shapes: true, dated: false,
    cats: { underway: ['Under way or starting soon', '#ea580c'], 'within-4': ['Starts within 4 years', '#ca8a04'], '5-10': ['Starts in 5 to 10 years', '#2563eb'], planning: ['Planning or study', '#7c3aed'], finished: ['Finished (last 2 years)', '#64748b'], other: ['Other', '#94a3b8'] } },
  district: { box: 'lyDevDistrict', label: 'Water districts (MUDs)', short: 'MUDs', minz: 9, shapes: true, dated: true,
    cats: { MUD: ['Municipal utility district', '#0284c7'], MMD: ['Management district', '#9333ea'], WCID: ['Water control district', '#0d9488'], FWSD: ['Fresh water supply district', '#0891b2'], LID: ['Levee improvement district', '#65a30d'], Drainage: ['Drainage district', '#64748b'], other: ['Other district', '#94a3b8'] } },
  school: { box: 'lyDevSchool', label: 'Schools', short: 'Schools', minz: 9, shapes: false, dated: false,
    cats: { elementary: ['Elementary', '#16a34a'], middle: ['Middle', '#ca8a04'], high: ['High', '#dc2626'], other: ['Other campus', '#64748b'] } }
};
const WINDOWS = { '90': '90 days', '365': '12 months', '730': '24 months', all: 'All' };
const catColor = (kind, cat) => (DEV[kind].cats[cat] || DEV[kind].cats.other || ['', '#64748b'])[1];
const colorExpr = kind => ['match', ['get', 'cat'], ...Object.entries(DEV[kind].cats).flatMap(([k, [, c]]) => [k, c]), '#64748b'];
const fmtDay = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
const money = v => v ? '$' + (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : Math.round(v)) : '';

export function initDevLayers(ctx) {
  const { map } = ctx, el = id => document.getElementById(id), win = el('lyDevWin'), note = el('lyDevNote');
  const on = {}; let since = '365', seq = 0, ctl = null, lastKey = '';
  try { const s = JSON.parse(localStorage.getItem('fs-dev') || '{}'); for (const k of Object.keys(DEV)) on[k] = !!s[k]; if (WINDOWS[s.win]) since = s.win; } catch (e) {}
  if (win) { win.innerHTML = Object.entries(WINDOWS).map(([k, v]) => '<option value="' + k + '">' + (k === 'all' ? 'Show all' : 'Last ' + v) + '</option>').join(''); win.value = since; }
  const store = () => { try { localStorage.setItem('fs-dev', JSON.stringify({ ...on, win: since })); } catch (e) {} };
  const say = t => { if (note) note.textContent = t; };
  const anyOn = () => Object.values(on).some(Boolean);
  const sinceDay = () => since === 'all' ? '' : new Date(Date.now() - +since * 864e5).toISOString().slice(0, 10);

  async function load() {
    const kinds = Object.keys(DEV).filter(k => on[k]); if (!kinds.length) return;
    const my = ++seq, z = map.getZoom(), b = map.getBounds(), r = v => Math.round(v * 200) / 200, pad = .01;
    const bb = [r(b.getWest()) - pad, r(b.getSouth()) - pad, r(b.getEast()) + pad, r(b.getNorth()) + pad].map(v => +v.toFixed(3));
    const want = kinds.filter(k => z >= DEV[k].minz - 0.5), far = kinds.filter(k => !want.includes(k));
    if (!want.length) { for (const k of kinds) setData(k, []); lastKey = ''; say('Zoom in to see ' + far.map(k => DEV[k].label.toLowerCase()).join(', ') + '.'); return; }
    const area = (bb[2] - bb[0]) * (bb[3] - bb[1]), shapes = area <= 0.06 && z >= 11;
    if (area > 4) { say('Zoom in a little to load development activity.'); return; }
    const key = want.join(',') + '|' + bb.join(',') + '|' + since + '|' + shapes; if (key === lastKey) return;
    ctl?.abort(); ctl = new AbortController();
    try {
      const q = new URLSearchParams({ box: bb.join(','), kinds: want.join(','), limit: '6000', ...(shapes ? { shapes: '1' } : {}), ...(sinceDay() ? { since: sinceDay() } : {}) });
      const res = await fetch('api/devdata?' + q, { signal: ctl.signal }), d = await readJSON(res); if (my !== seq) return; lastKey = key;
      const by = {}; for (const row of d.rows || []) (by[row[1]] = by[row[1]] || []).push(row);
      for (const k of kinds) setData(k, by[k] || []);
      const parts = want.map(k => fmt((by[k] || []).length) + ' ' + DEV[k].short.toLowerCase());
      say(parts.join(' · ') + ' in view' + (DEV.permit && on.permit && want.includes('permit') ? ' (permits: Harris County only)' : '') + (d.capped ? '; the newest shown, zoom in for all' : '') + (far.length ? '. Zoom in for ' + far.map(k => DEV[k].short.toLowerCase()).join(', ') : '') + '.');
    } catch (e) { if (e.name !== 'AbortError') say(e.message); }
  }
  // rows: [id, kind, name, cat, day, lon, lat, units, amount, shape]
  function setData(kind, rows) {
    const src = 'dev-' + kind, pts = { type: 'FeatureCollection', features: [] }, shp = { type: 'FeatureCollection', features: [] };
    for (const r of rows) {
      const props = { id: r[0], name: r[2], cat: r[3], day: r[4] || '', units: r[7] || 0, amount: r[8] || 0 };
      if (r[9]) shp.features.push({ type: 'Feature', properties: props, geometry: r[9] });
      if (r[5] != null && (!r[9] || r[9].type === 'Point' || kind === 'plat' || kind === 'district')) pts.features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [r[5], r[6]] } });
    }
    try {
      if (map.getSource(src)) { map.getSource(src).setData(pts); map.getSource(src + '-s')?.setData(shp); return; }
      const col = colorExpr(kind);
      map.addSource(src + '-s', { type: 'geojson', data: shp }); map.addSource(src, { type: 'geojson', data: pts });
      if (kind === 'txdot') map.addLayer({ id: src + '-line', type: 'line', source: src + '-s', layout: { 'line-cap': 'round' }, paint: { 'line-color': col, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 5], 'line-opacity': .85 } });
      else {
        map.addLayer({ id: src + '-fill', type: 'fill', source: src + '-s', minzoom: 11, paint: { 'fill-color': col, 'fill-opacity': kind === 'district' ? .08 : .16 } });
        map.addLayer({ id: src + '-edge', type: 'line', source: src + '-s', minzoom: 11, paint: { 'line-color': col, 'line-width': 1.2, 'line-opacity': .8 } });
      }
      if (kind !== 'txdot') map.addLayer({ id: src, type: 'circle', source: src, paint: {
        'circle-radius': kind === 'school' ? ['interpolate', ['linear'], ['get', 'units'], 0, 3.5, 500, 5, 2500, 8, 4000, 10] : kind === 'district' ? ['interpolate', ['linear'], ['zoom'], 9, 2.5, 13, 3.5] : ['interpolate', ['linear'], ['zoom'], 10, 2.4, 14, 4, 17, 6.5],
        'circle-color': col, 'circle-opacity': kind === 'district' || kind === 'plat' ? ['interpolate', ['linear'], ['zoom'], 10, .9, 12.5, .35] : .9,
        'circle-stroke-color': '#fff', 'circle-stroke-width': .8 } });
      map.addLayer({ id: src + '-lbl', type: 'symbol', source: src, minzoom: kind === 'school' || kind === 'district' ? 12 : 15.5, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-offset': [0, .9], 'text-anchor': 'top', 'text-max-width': 10, 'text-optional': true },
        paint: { 'text-color': '#1f2937', 'text-halo-color': '#fff', 'text-halo-width': 1.4 } });
      for (const id of [src, src + '-line', src + '-fill']) if (map.getLayer(id)) wire(id);
    } catch (e) { /* style still loading: the next load adds it */ }
  }
  function remove(kind) { const src = 'dev-' + kind; try { for (const id of [src + '-lbl', src, src + '-line', src + '-fill', src + '-edge']) if (map.getLayer(id)) map.removeLayer(id); for (const s of [src, src + '-s']) if (map.getSource(s)) map.removeSource(s); } catch (e) {} }
  const wired = new Set();
  function wire(id) {
    if (wired.has(id)) return; wired.add(id); ctx.clickLayers?.push(id);
    map.on('click', id, e => { const f = e.features?.[0]; if (!f) return; ctx.tabs?.arm?.(e); show(f.properties.id); });
    map.on('mouseenter', id, e => { map.getCanvas().style.cursor = 'var(--cur-pointer)'; const f = e.features?.[0]; if (f && ctx.tip) { ctx.tip.textContent = f.properties.name + (f.properties.day ? ' · ' + fmtDay(f.properties.day) : ''); ctx.tip.style.opacity = 1; ctx.tip.style.left = (e.point.x + 12) + 'px'; ctx.tip.style.top = (e.point.y + 12) + 'px'; } });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; if (ctx.tip) ctx.tip.style.opacity = 0; });
  }
  function legend() {
    const ks = Object.keys(DEV).filter(k => on[k]);
    ctx.setLegend?.('dev', ks.length ? ks.map(k => '<div class="t">' + esc(DEV[k].short) + (DEV[k].dated && since !== 'all' ? ' · ' + WINDOWS[since] : '') + '</div><div>' +
      Object.entries(DEV[k].cats).filter(([c]) => c !== 'other').map(([, [l, c]]) => '<div class="li"><i style="background:' + c + '"></i>' + esc(l) + '</div>').join('') + '</div>').join('') : '');
  }
  function setOn(kind, v) {
    on[kind] = !!v; const b = el(DEV[kind].box); if (b) b.checked = on[kind]; store();
    if (win) win.hidden = !anyOn(); if (note) note.hidden = !anyOn();
    if (!on[kind]) remove(kind); legend(); lastKey = ''; load();
    if (on[kind] && map.getZoom() < DEV[kind].minz - 0.5) ctx.toast?.(DEV[kind].label + ' show when you zoom in.');
  }
  for (const k of Object.keys(DEV)) { const b = el(DEV[k].box); if (b) { b.checked = on[k]; b.onchange = () => setOn(k, b.checked); } }
  if (win) { win.hidden = !anyOn(); win.onchange = () => { since = win.value; store(); legend(); lastKey = ''; load(); }; }
  if (note) note.hidden = !anyOn();
  let moveT = 0; map.on('moveend', () => { if (anyOn()) { clearTimeout(moveT); moveT = setTimeout(load, 300); } });
  ctx.onOverlays?.(() => { if (anyOn()) { for (const k of Object.keys(DEV)) if (on[k]) remove(k); wired.clear(); lastKey = ''; legend(); load(); } });
  if (anyOn()) { legend(); map.once('idle', load); }
  ctx.devLayer = (kind, v = true) => { if (DEV[kind]) setOn(kind, v); };

  // ---------- cards ----------
  const dl = rows => '<dl>' + rows.filter(r => r[1] != null && r[1] !== '').map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>').join('') + '</dl>';
  async function show(id) {
    const kind = String(id).split(':')[0], meta = DEV[kind] || DEV.permit, tid = 'dev:' + id;
    const card = openCard(ctx, { kicker: meta.label, title: 'Loading…', loading: 'Looking it up…' });
    ctx.tabs?.track?.({ id: tid, kind: 'dev', label: meta.short, reopen: () => show(id) });
    const gone = () => ctx.tabs && ctx.tabs.active?.()?.id !== tid;
    let x; try { x = await readJSON(await fetch('api/devdata?id=' + encodeURIComponent(id))); }
    catch (e) { if (!gone()) card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return; }
    if (gone()) return;
    const a = x.attrs || {}, cat = (meta.cats[x.cat] || [x.cat || ''])[0], dot = '<span class="pl-dot" style="background:' + catColor(kind, x.cat) + '"></span>';
    let body = '', src = '';
    if (kind === 'permit') {
      body = dl([['Kind', esc(cat)], ['As listed', esc(a.type || '')], ['Issued', esc(fmtDay(x.day))], ['Issued by', esc(a.agency || '')], ['Note', esc(a.note || '')], ['Appraisal account', '<span class="mono">' + esc(a.acct || '') + '</span>']]);
      src = 'Harris Central Appraisal District permit records (updated weekly). The district records permits it uses for appraisal, so recent ones can take a few weeks to appear; values and contractors aren’t listed.';
    } else if (kind === 'plat') {
      body = dl([['Kind', esc(a.type || cat)], ['Status', esc(x.status || '')], [x.source === 'coh-plats' ? 'Submitted' : 'Recorded', esc(fmtDay(x.day))], ['Planning Commission', esc(fmtDay(a.commission))],
        ['Lots', x.units ? fmt(x.units) : ''], ['Reserves', a.reserves ? fmt(a.reserves) + (a.reserveAcres ? ' (' + a.reserveAcres.toFixed(1) + ' acres)' : '') : ''], ['Acres', a.acres ? a.acres.toFixed(1) : ''], ['Application', esc(a.app || '')]]);
      src = (a.by || 'County records') + (x.day ? '' : '. This map has no recording dates, so a subdivision counts as new from the night it first appears here (' + fmtDay(x.first_seen) + ')') + '.';
    } else if (kind === 'txdot') {
      body = dl([['Stage', esc(a.phase || x.status || cat)], ['Where', esc(x.addr || '')], ['Work', esc(a.work || '')], ['Estimated cost', esc(money(x.amount))], ['Letting', esc(fmtDay(a.letting))],
        ['Work began', esc(fmtDay(a.started))], ['Finish (est.)', esc(fmtDay(a.finish))], ['Done', a.pctDone ? Math.round(a.pctDone) + '%' : ''], ['Contractor', esc(a.contractor || '')], ['Length', a.miles ? a.miles.toFixed(1) + ' miles' : ''], ['CSJ', '<span class="mono">' + esc(a.csj || '') + '</span>']]);
      src = 'TxDOT Project Tracker. Dates and costs are TxDOT’s estimates and move as projects advance.';
    } else if (kind === 'district') {
      const bonds = (a.bonds || []).filter(b => b.principal);
      body = dl([['Kind', esc(a.type || cat)], ['Created', esc(fmtDay(x.day)) || (a.checked ? 'Not listed' : 'Checking (a few districts are looked up each night)')], ['How', esc(a.creationType ? a.creationType.toLowerCase() : '')], ['Size', a.acres ? fmt(Math.round(a.acres)) + ' acres' : ''],
        ['Total tax rate', a.taxRate ? '$' + a.taxRate.toFixed(2) + ' per $100' : ''], ['Taxable value', esc(money(a.taxableValue))], ['Population', a.population ? fmt(a.population) : ''], ['Bonds outstanding', esc(money(x.amount))]]) +
        (bonds.length ? '<div class="fl">Bond issues (' + esc(String(a.bondYear || '')) + ' report)</div><dl>' + bonds.slice(0, 8).map(b => '<dt>' + esc(b.issue) + '</dt><dd>' + esc(money(b.principal)) + (b.closed ? ' · ' + esc(fmtDay(b.closed)) : '') + '</dd>').join('') + '</dl>' : '');
      src = 'TCEQ water district records and the Texas Bond Review Board’s local debt report. Outlines are TCEQ’s (some are years old).';
    } else if (kind === 'school') {
      body = dl([['Grades', esc(a.grades || '')], ['Enrollment', x.units ? fmt(x.units) + (a.enrolledAsOf ? ' (as of ' + esc(a.enrolledAsOf) + ')' : '') : 'Not listed'], ['State rating', esc(a.rating || '')], ['District', esc(a.district || '')],
        ['District enrollment', a.districtEnrollment ? fmt(a.districtEnrollment) : ''], ['Address', esc(x.addr || '')], ['Website', a.website ? '<a target="_blank" rel="noopener" href="https://' + esc(a.website.replace(/^https?:\/\//, '')) + '">' + esc(a.website) + '</a>' : '']]);
      src = 'Texas Education Agency school directory and enrollment counts. Enrollment is the latest yearly count TEA publishes.';
    }
    fillCard(ctx, card, cardTop(meta.label, x.name, dot + esc([cat, x.county ? x.county + ' County' : ''].filter(Boolean).join(' · '))) +
      '<div class="bsec">' + body + '</div><div class="bacts"><button class="btn primary" type="button" id="dvBldg">Property Here</button></div><div class="rnote bsec src">' + esc(src) + '</div>');
    ctx.tabs?.mount?.(); ctx.tabs?.label?.(tid, x.name);
    card.querySelector('#dvBldg').onclick = () => { const c = [x.lon, x.lat]; if (c[0] == null) return; if (!ctx.buildingAt?.(c)) ctx.openBuildingAt?.(c); };
  }
  ctx.showDev = show;
  ctx.devNear = async (lat, lon, m = 200, kinds = 'permit,plat,district,school,txdot', n = 25) => (await readJSON(await fetch('api/devdata?' + new URLSearchParams({ near: (+lat).toFixed(6) + ',' + (+lon).toFixed(6), m: String(m), n: String(n), kinds })))).rows || [];

  // ---------- the property card's Development section ----------
  // permits on the parcel, plats and new subdivisions close by, the water district it's in, the nearest schools and
  // TxDOT work within a mile
  ctx.renderDev = async (el, c, parcel) => {
    if (!el) return; const lat = c[1], lon = c[0], my = (el._dev = (el._dev || 0) + 1);
    el.innerHTML = '<div class="lt">Development Here &amp; Nearby</div><div class="rnote">Looking up permits, plats, districts and schools…</div>';
    let near, wide;
    try { [near, wide] = await Promise.all([ctx.devNear(lat, lon, 400, 'permit,plat', 60), ctx.devNear(lat, lon, 3000, 'district,school,txdot', 80)]); }
    catch (e) { if (my === el._dev) el.innerHTML = '<div class="lt">Development Here &amp; Nearby</div><div class="rnote">' + esc(/not loaded|configured/i.test(e.message) ? 'Permits, plats, districts and schools aren’t loaded on this site yet.' : 'Couldn’t look up development nearby (' + e.message + ').') + '</div>'; return; }
    if (my !== el._dev) return;
    const acct = parcel?.propId ? String(parcel.propId).trim() : '';
    const here = near.filter(r => r.kind === 'permit' && ((acct && r.id.split(':')[2] === acct) || r.m <= 25));
    const permitsNear = near.filter(r => r.kind === 'permit' && !here.includes(r) && /new-|demolition/.test(r.cat || ''));
    const plats = near.filter(r => r.kind === 'plat' && (r.day || r.first_seen > '2001'));
    const district = wide.find(r => r.kind === 'district' && r.m === 0 && r.cat === 'MUD') || wide.find(r => r.kind === 'district' && r.m === 0 && DEV.district.cats[r.cat]);
    const schools = ['elementary', 'middle', 'high'].map(l => wide.find(r => r.kind === 'school' && r.cat === l)).filter(Boolean);
    const roads = wide.filter(r => r.kind === 'txdot' && r.m <= 1609 && r.cat !== 'finished').slice(0, 4);
    const mi = m => m < 160 ? Math.round(m * 3.281) + ' ft' : (m / 1609).toFixed(1) + ' mi';
    const row = (r, sub) => '<button type="button" class="dv-row" data-dev="' + esc(r.id) + '"><i style="background:' + catColor(r.kind, r.cat) + '"></i><span><b>' + esc(r.name) + '</b><em>' + esc(sub) + '</em></span></button>';
    const part = (t, list) => list.length ? '<div class="fl">' + t + '</div>' + list.join('') : '';
    const catName = r => (DEV[r.kind].cats[r.cat] || [r.cat || ''])[0];
    const html = [
      part('Permits on this parcel', here.slice(0, 6).map(r => row(r, [catName(r), fmtDay(r.day)].filter(Boolean).join(' · ')))),
      part('New building and demolition permits close by', permitsNear.slice(0, 5).map(r => row(r, [catName(r), fmtDay(r.day), mi(r.m)].filter(Boolean).join(' · ')))),
      part('Plats &amp; subdivisions close by', plats.slice(0, 5).map(r => row(r, [catName(r), r.day ? fmtDay(r.day) : '', r.units ? fmt(r.units) + ' lots' : '', r.m ? mi(r.m) : 'here'].filter(Boolean).join(' · ')))),
      district ? part('Water district', [row(district, [district.cat, district.day ? 'created ' + fmtDay(district.day).slice(-4) : '', district.amount ? money(district.amount) + ' bonds outstanding' : ''].filter(Boolean).join(' · '))]) : '',
      part('Nearest schools', schools.map(r => row(r, [catName(r), r.units ? fmt(r.units) + ' students' : '', mi(r.m)].filter(Boolean).join(' · ')))),
      part('TxDOT work within a mile', roads.map(r => row(r, [catName(r), r.amount ? money(r.amount) : '', mi(r.m)].filter(Boolean).join(' · '))))
    ].filter(Boolean).join('');
    el.innerHTML = '<div class="lt">Development Here &amp; Nearby</div>' + (html || '<div class="rnote">No permits, plats, water district, schools or TxDOT work found close by.</div>') +
      '<div class="ssrc src">Permits: Harris County only (Harris Central Appraisal District). Plats: City of Houston and county maps. Districts: TCEQ and the Bond Review Board. Schools: TEA. Roads: TxDOT.</div>';
    el.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => show(b.dataset.dev));
  };
}

