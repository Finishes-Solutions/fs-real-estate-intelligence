// Site reports for the parcel on the building card, one click each: Parcel Map, Topography, Site Environmental and the Area
// Report in 1, 3, 5 and 10-mile rings. Made on the server (api/sitereport.js) as an unbranded PDF and saved like every other
// export (recorded in the Reports tab). Shown on the card (a "Reports" block at the end of the Site section) and on the
// Reports tab ("For the open parcel").
import { esc } from './reportkit.js';

export const SITE_REPORTS = [
  { key: 'parcel', label: 'Parcel Map', desc: 'To scale, every line dimensioned, bearings, corners, area check and the record', time: 'a few seconds' },
  { key: 'topo', label: 'Topography', desc: 'Lidar contours, slope and drainage, cross-sections and earthwork', time: '10–20 seconds' },
  { key: 'environmental', label: 'Site Environmental', desc: 'Cleanup and regulated sites, wells, pipelines, soils, flood and hazards', time: '20–40 seconds' },
  { key: 'area', label: 'Area Report', desc: '1, 3, 5 and 10-mile rings: people, income, spending, construction', time: 'a few seconds' },
];
const slug = s => String(s || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site';

export function initSiteReports(ctx) {
  const running = new Set();
  // the parcel the reports are about: the open card's
  const target = () => { const b = ctx.currentBuilding?.(); return b?.parcel?.geometry ? { parcels: [b.parcel], center: b.center, label: b.parcel.situs || b.title || '' } : null; };
  ctx.siteReport = async (key, t = target(), btn = null) => {
    const r = SITE_REPORTS.find(x => x.key === key); if (!r) return;
    if (!t) { ctx.toast?.('Click a parcel on the map first: the report is drawn from its outline.'); return; }
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
  // the buttons: a grid of one-click reports for el (the card's Site section, or the Reports tab)
  ctx.siteReportButtons = (t = null) => '<div class="sr-grid">' + SITE_REPORTS.map(r => '<button type="button" class="sr-btn" data-sr="' + r.key + '"' + (t || target() ? '' : ' disabled') + '><b>' + esc(r.label) + '</b><span>' + esc(r.desc) + '</span></button>').join('') + '</div>';
  ctx.wireSiteReports = (el, t = null) => el.querySelectorAll('[data-sr]').forEach(b => b.onclick = () => ctx.siteReport(b.dataset.sr, t || target(), b));
  ctx.siteReportTarget = target;
}
