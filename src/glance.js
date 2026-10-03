// "Area at a Glance" in the left panel: Census ACS numbers for the tracts in the map view (data/market.json, already
// used by the building card and the assistant's demographics tool). Updates as the map moves; nothing extra to fetch.
import { tractsFor, summarizeTracts } from './lib/demographics.mjs';

export function initGlance(ctx) {
  const { map, esc, fmtN } = ctx, el = document.getElementById('glance'); if (!el) return;
  const money = v => v == null ? '—' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : '$' + Math.round(v / 1e3) + 'K';
  const num = v => v == null ? '—' : v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : fmtN(v);
  let t = 0, seq = 0;
  const tile = (k, v, s) => '<div class="g-t"><b>' + v + '</b><span>' + esc(k) + '</span>' + (s ? '<i>' + s + '</i>' : '') + '</div>';
  const shell = (body, place) => '<div class="g-h"><span class="kicker">Area at a Glance</span>' + (place ? '<em>' + esc(place) + '</em>' : '') + '</div>' + body;

  async function render() {
    const my = ++seq;
    if (map.getZoom() < 8) { el.innerHTML = shell('<p class="g-n">Zoom in to a city or neighborhood to see who lives and works there.</p>'); return; }
    let m; try { m = await ctx.loadMarket(); } catch (e) { el.innerHTML = ''; return; }
    if (my !== seq) return;
    const b = map.getBounds(), w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
    const geom = { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
    const list = tractsFor(m.tracts, { geom }), x = summarizeTracts(list), place = ctx.viewPlace?.() || '';
    if (!x) { el.innerHTML = shell('<p class="g-n">Census data covers the counties loaded on the map. Move the map over them to see the area’s numbers.</p>', place); return; }
    const gr = x.population_growth_pct;
    el.innerHTML = shell('<div class="g-grid">' +
      tile('Population', num(x.population), gr == null ? '' : '<span class="' + (gr >= 0 ? 'up' : 'dn') + '">' + (gr >= 0 ? '+' : '') + gr + '%</span> since ' + m.baseYear) +
      tile('Median Income', money(x.median_household_income_approx)) +
      tile('Home Value', money(x.median_home_value_approx)) +
      tile('Median Rent', x.median_gross_rent_approx == null ? '—' : '$' + fmtN(x.median_gross_rent_approx) + '/mo') +
      tile('Households', num(x.households), x.vacancy_rate_pct == null ? '' : x.vacancy_rate_pct + '% of homes vacant') +
      tile('Jobs', x.jobs == null ? '—' : num(x.jobs), x.jobs == null ? '' : 'located here') +
      '</div><div class="g-s src">US Census ACS 5-year ' + m.year + ', ' + fmtN(x.tracts) + ' tract' + (x.tracts > 1 ? 's' : '') + ' in view; medians are household-weighted.</div>', place);
  }
  const soon = () => { clearTimeout(t); t = setTimeout(render, 450); };
  map.on('moveend', soon);
  // wait for the first view to settle (and the rest of the page to load) before reading the 1 MB tract file
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(soon);
}
