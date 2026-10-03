// Building card "Site" section: flood zone, traffic counts, special districts, schools, transit, environmental flags,
// crime nearby (Houston), bar and restaurant alcohol sales at the address, county unemployment and ZIP rents.
// Facts come from api/site (live, cached a week) and data/area.json (nightly). Sources are listed only when the
// "Show sources on cards" setting is on (Data Sources view), and always in exported reports.
export function initSite(ctx) {
  const { esc, fmtN, fmtM } = ctx;
  const cache = new Map();
  ctx.siteAt = (center, addr, zip) => {
    const q = new URLSearchParams({ lat: center[1].toFixed(5), lon: center[0].toFixed(5), ...(addr && zip ? { addr, zip } : {}) }), k = q.toString();
    if (!cache.has(k)) { const p = fetch('api/site?' + q).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'lookup failed'); return d; }); p.catch(() => cache.delete(k)); cache.set(k, p); }
    return cache.get(k);
  };
  // a ½-mile circle (64 points) around a point, for the crime report
  const circle = ([lon, lat], mi) => { const r = mi / 69, k = Math.cos(lat * Math.PI / 180), ring = []; for (let i = 0; i <= 64; i++) { const a = (i % 64) / 64 * 2 * Math.PI; ring.push([lon + r * Math.cos(a) / k, lat + r * Math.sin(a)]); } return { type: 'Polygon', coordinates: [ring] }; };
  const src = s => '<span class="src"> · ' + esc(s) + '</span>';
  const pct = v => v == null ? '' : (v > 0 ? '+' : '') + v + '%';
  const row = (k, v, s) => v ? '<dt>' + k + '</dt><dd>' + v + (s ? src(s) : '') + '</dd>' : '';

  function econRows(area, parcel) {
    const out = [];
    const cn = String(parcel?.county || '').toLowerCase().replace(/\s*county$/, ''), u = area?.unemployment;
    const fips = area?.counties?.find(c => c.name.toLowerCase() === cn)?.fips || Object.entries(u?.counties || {}).find(([, c]) => String(c.name || '').toLowerCase() === cn)?.[0];
    const uc = fips && u?.counties?.[fips];
    if (uc) out.push(row('Unemployment', esc(uc.rate) + '% <span class="sc">' + esc(parcel.county) + ' County, ' + esc(uc.period) + (uc.yearAgo != null ? '; ' + uc.yearAgo + '% a year earlier' : '') + (u.state ? '; Texas ' + u.state.rate + '%' : '') + '</span>', 'BLS LAUS'));
    const z = parcel?.situsZip && area?.rents?.zips?.[parcel.situsZip];
    if (z) out.push(row('Typical rent', fmtM(z.rent) + '/mo <span class="sc">ZIP ' + esc(parcel.situsZip) + ', ' + esc(z.month) + (z.yoy != null ? '; ' + pct(z.yoy) + ' over a year' : '') + '</span>', 'Zillow ZORI'));
    return out.join('');
  }

  ctx.renderSite = async (el, center, parcel) => {
    if (!el) return;
    el.innerHTML = '<div class="lt">Site</div><div class="rnote">Checking flood zone, traffic and districts…</div>';
    const addr = /^\d/.test(parcel?.situsStreet || '') ? parcel.situsStreet : '', zip = parcel?.situsZip || '';
    const [d, area] = await Promise.all([ctx.siteAt(center, addr, zip).catch(e => ({ error: e.message })), ctx.areaData ? ctx.areaData().catch(() => null) : null]);
    if (!el.isConnected) return;
    if (d.error) { el.innerHTML = '<div class="lt">Site</div><div class="rnote err">Site lookup unavailable (' + esc(d.error) + ').</div>' + (econRows(area, parcel) ? '<dl>' + econRows(area, parcel) + '</dl>' : ''); return; }
    const f = d.flood, t = d.traffic, ds = d.districts || {}, env = d.environment, cr = d.crime, tr = d.transit;
    const flood = f && !f.error && f.zone ? '<b class="' + (f.risk === 'high' ? 'risk-hi' : f.risk === 'moderate' ? 'risk-md' : '') + '">Zone ' + esc(f.zone) + '</b> <span class="sc">' + esc(f.note) + '</span>' : f?.note ? esc(f.note) : '';
    const traffic = t?.roads?.length ? t.roads.map(r => esc(r.road) + ' <b>' + fmtN(r.aadt) + '</b>').join(' · ') + ' <span class="sc">vehicles/day</span>' : t && !t.error ? '<span class="sc">No counted roads within 300 m</span>' : '';
    const water = (ds.water || []).filter(x => !x.error).map(x => esc(x.name) + ' <span class="sc">' + esc(x.type) + '</span>').join('<br>');
    const tirz = Array.isArray(ds.tirz) && ds.tirz.length ? ds.tirz.map(esc).join(', ') : '';
    const schools = Array.isArray(ds.schools) && ds.schools.length ? ds.schools.map(esc).join(', ') : '';
    const env1 = env && !env.error ? (env.count ? fmtN(env.total || env.count) + ' regulated facilit' + ((env.total || env.count) === 1 ? 'y' : 'ies') + ' within ¼ mile' + (env.flaggedCount ? '; <b class="risk-md">' + env.flaggedCount + ' flagged</b>' : '; none flagged') : 'No EPA-regulated facilities within ¼ mile') : '';
    const envList = env?.flagged?.length ? '<details class="raw"><summary>Flagged facilities</summary>' + env.flagged.map(x => '<div class="pl"><b>' + esc(x.name) + '</b><span>' + esc([x.street, x.flags.join(', ')].filter(Boolean).join(' · ')) + '</span></div>').join('') + '</details>' : '';
    const crime = cr && !cr.error && cr.last12 ? '<b>' + fmtN(cr.last12.total) + '</b> incidents within ½ mile in the last 12 months' + (cr.change.total != null ? ' <span class="sc">(' + pct(cr.change.total) + ' vs the year before)</span>' : '') +
      '<br><span class="sc">Violent ' + fmtN(cr.last12.v) + (cr.change.v != null ? ' (' + pct(cr.change.v) + ')' : '') + ' · Property ' + fmtN(cr.last12.p) + (cr.change.p != null ? ' (' + pct(cr.change.p) + ')' : '') + ' · Other ' + fmtN(cr.last12.o) + (cr.latest ? ' · through ' + esc(cr.latest) : '') + '</span>' + (ctx.crimeReport ? '<br><button class="lnk" type="button" id="siteCrime">Full crime report (½ mile)</button>' : '') : '';
    const bars = Array.isArray(d.bars) && d.bars.length ? d.bars.slice(0, 5).map(b => esc(b.name) + ' <b>' + fmtM(b.total) + '</b> <span class="sc">' + b.months + ' mo to ' + esc(b.last) + '</span>').join('<br>') : '';
    el.innerHTML = '<div class="lt">Site</div><dl>' +
      row('Flood zone', flood + (ctx.femaReport ? '<br><button class="lnk" type="button" id="siteFema">FEMA report (¼ mile): claims, disasters, risk</button>' : ''), 'FEMA flood maps') + row('Traffic', traffic, 'TxDOT traffic counts') + row('Crime nearby', crime, 'Houston Police NIBRS') +
      row('Districts', [water, tirz && 'Tax increment zone: ' + tirz, ds.opportunityZone === true ? 'Federal Opportunity Zone' : ''].filter(Boolean).join('<br>'), 'TCEQ, City of Houston, CDFI Fund') +
      row('School district', schools, 'US Census') + row('Transit', tr && !tr.error && tr.stops != null ? fmtN(tr.stops) + ' METRO bus stop' + (tr.stops === 1 ? '' : 's') + ' within 400 m' : '', 'Houston METRO') +
      row('Environmental', env1 && env1 + envList, 'EPA ECHO') + row('Alcohol sales here', bars && bars + '<br><span class="sc">Mixed beverage gross receipts, last 12 months</span>', 'Texas Comptroller') +
      econRows(area, parcel) + '</dl>';
    el.querySelector('#siteFema')?.addEventListener('click', () => ctx.femaReport({ geometry: circle(center, 0.25), label: '¼ mile around ' + (parcel?.situs || center[1].toFixed(4) + ', ' + center[0].toFixed(4)) }));
    el.querySelector('#siteCrime')?.addEventListener('click', () => ctx.crimeReport({ geometry: circle(center, 0.5), label: '½ mile around ' + (parcel?.situs || center[1].toFixed(4) + ', ' + center[0].toFixed(4)), center }));
  };

  // sources on cards: off by default (everyone sees the same clean view); a setting in the Data Sources view turns them on
  const KEY = 'fs-show-sources', apply = on => { document.documentElement.dataset.sources = on ? 'on' : 'off'; };
  let on = false; try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}
  apply(on);
  ctx.showSources = v => { if (v === undefined) return on; on = !!v; apply(on); try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} return on; };
}
