// Site reports for the parcel on the building card, one click each: Parcel Map, Topography, Site Environmental and the Area
// Report in 1, 3, 5 and 10-mile rings. Made on the server (api/sitereport.js) as an unbranded PDF and saved like every other
// export (recorded in the Reports tab). Shown on the card (a "Reports" block at the end of the Site section) and on the
// Reports tab ("For the open parcel").
import { esc } from './reportkit.js';
import { parcelGeoJSON } from './lib/reports/geojson.mjs';

export const SITE_REPORTS = [
  { key: 'parcel', label: 'Parcel Map', desc: 'To scale, every line dimensioned, bearings, corners, area check and the record', time: 'a few seconds' },
  { key: 'topo', label: 'Topography', desc: 'Lidar contours, slope and drainage, cross-sections and earthwork', time: '10–20 seconds' },
  { key: 'environmental', label: 'Site Environmental', desc: 'Cleanup and regulated sites, wells, pipelines, soils, flood and hazards', time: '20–40 seconds' },
  { key: 'area', label: 'Area Report', desc: '1, 3, 5 and 10-mile rings: people, income, spending, construction', time: 'a few seconds' },
];
// not a report: the outline file, every point (made in the browser, instant)
export const OUTLINE = { key: 'geojson', label: 'Parcel Outline', desc: 'The full outline, every point, with the record and its courses: for GIS or CAD', time: 'instant' };
const slug = s => String(s || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site';

// a Regrid record (api/regrid.js: fields as [label, value] and every raw field in more) in the card's parcel names
export function fromRegrid(rg) {
  const f = Object.fromEntries(rg.fields || []), m = Object.fromEntries(rg.more || []), num = v => v == null || v === '' ? null : +v;
  const mail = f['Mailing address'] || null, acres = num(f.Acres) ?? num(m.gisacre);
  return { propId: f['Parcel number'] || m.parcelnumb_no_formatting || '', owner: f.Owner || null, mailing: mail, situs: m.address || rg.headline || null, situsStreet: m.address || rg.headline || null,
    situsCity: m.scity || rg.city || null, situsZip: m.szip5 || m.szip || null, county: m.county ? m.county.replace(/\b\w/g, c => c.toUpperCase()) : null, state: m.state2 || null,
    landUse: f['Land use (county)'] || null, zoning: f.Zoning || null, zoningDesc: f['Zoning description'] || null, marketValue: num(f['Total value']), landValue: num(f['Land value']), improvementValue: num(m.improvval),
    yearBuilt: f['Year built'] || null, buildingSqft: num(m.area_building), acquired: f['Last sale date'] || null, taxYear: m.taxyear || null, area: acres ? acres + ' acres' : null, legal: f['Legal description'] || null,
    tract: m.census_tract || null, source: 'Regrid parcel record', geometry: rg.geom };
}

export function initSiteReports(ctx) {
  const running = new Set();
  // the parcel the reports are about: the open card's
  // the parcel the reports are about: the open card's appraisal record, else its Regrid record (outside Texas, or where the
  // county has none) once "Get Regrid Details" has run for it
  // A parcel drawn from the map's lines alone (fromLines: no acres or values) gives way to its Regrid record once that has
  // been fetched for it (2026-10-30, Sevier County TN: the Parcel Map showed 0.00 acres and $0 beside a fetched record).
  const target = () => { const b = ctx.currentBuilding?.(); if (!b) return null;
    const rg = ctx.lastRegrid, rgHere = !!rg?.geom && Math.hypot(rg.center[0] - b.center[0], rg.center[1] - b.center[1]) <= 1e-4;
    if (b.parcel?.geometry && !(b.parcel.fromLines && rgHere)) return { parcels: [b.parcel], center: b.center, label: b.parcel.situs || b.title || '' };
    if (!rgHere) return null;
    const p = fromRegrid(rg); return { parcels: [p], center: b.center, label: p.situs || b.title || '', regrid: rg }; };
  ctx.siteReport = async (key, t = target(), btn = null) => {
    if (key === 'geojson') return outline(t);
    const r = SITE_REPORTS.find(x => x.key === key); if (!r) return;
    if (!t) { ctx.toast?.(ctx.currentBuilding?.() ? 'This parcel has no free appraisal record: press Get Regrid Details on the card first (the report is drawn from its outline).' : 'Click a parcel on the map first: the report is drawn from its outline.'); return; }
    const id = key + '|' + t.center.join(','); if (running.has(id)) return; running.add(id);
    const old = btn?.innerHTML; if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.innerHTML = '<b>' + esc(r.label) + '</b><span>Making it… ' + esc(r.time) + '</span>'; }
    ctx.toast?.('Making the ' + r.label + '…');
    try {
      const res = await fetch('api/sitereport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: key, parcels: t.parcels, center: t.center, label: t.label }) });
      if (!res.ok || !/pdf/.test(res.headers.get('content-type') || '')) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'The ' + r.label + ' couldn’t be made right now.'); }
      const blob = await res.blob();
      ctx.exportMeta = { report: 'site-' + key, format: 'pdf', scope: t.label };
      try { await ctx.saveFile(slug(r.label) + '-' + slug(t.label) + '-' + new Date().toISOString().slice(0, 10) + '.pdf', blob, 'application/pdf'); } finally { ctx.exportMeta = null; }
    } catch (e) { ctx.toast?.(e.message); }
    finally { running.delete(id); if (btn?.isConnected) { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = old; } }
  };
  // the parcel outline, every point, as GeoJSON (lib/reports/geojson.mjs), made here and saved like any export
  async function outline(t) {
    if (!t) { ctx.toast?.(ctx.currentBuilding?.() ? 'This parcel has no outline yet: press Get Regrid Details on the card first.' : 'Click a parcel on the map first.'); return; }
    const fc = parcelGeoJSON(t.parcels, { regrid: t.regrid || null, label: t.label });
    if (!fc.features.length) { ctx.toast?.('This parcel has no outline to export.'); return; }
    ctx.exportMeta = { report: 'site-outline', format: 'geojson', scope: t.label };
    try { await ctx.saveFile('parcel-outline-' + slug(t.label) + '-' + new Date().toISOString().slice(0, 10) + '.geojson', new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' }), 'application/geo+json'); }
    catch (e) { ctx.toast?.(e.message); } finally { ctx.exportMeta = null; }
  }
  // the buttons: a grid of one-click reports for el (the card's Site section, or the Reports tab)
  ctx.siteReportButtons = (t = null, { always = false } = {}) => '<div class="sr-grid">' + SITE_REPORTS.concat([OUTLINE]).map(r => '<button type="button" class="sr-btn" data-sr="' + r.key + '"' + (always || t || target() ? '' : ' disabled') + '><b>' + esc(r.label) + '</b><span>' + esc(r.desc) + '</span></button>').join('') + '</div>';
  ctx.wireSiteReports = (el, t = null) => el.querySelectorAll('[data-sr]').forEach(b => b.onclick = () => ctx.siteReport(b.dataset.sr, t || target(), b));
  ctx.siteReportTarget = target;
}
