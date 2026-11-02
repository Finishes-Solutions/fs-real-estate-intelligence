// The Area report in rings round the selected parcel or parcels: 1, 3, 5 and 10 miles (or the radii asked for) side by
// side. People, households, income, housing, jobs and modeled spending from the census tracts already in the app
// (data/market.json, ACS 5-year; lib/demographics.mjs rolls them up), each tract counted for the share of its area inside
// the ring (a 1-mile ring takes a slice of a big tract, not all of it), and the construction filed in each ring (TDLR TABS,
// data/filings.json). How much of each ring the tract data covers is measured and said: outside the app's counties a ring
// is only partly counted. Plain look (lib/reports/plain.mjs): unbranded. Pure.
//   ringsReport({ title, area, date, center: [lon, lat], site?: [[lon, lat], …], tracts, filings, period, rings?, zipRent?, unemployment? }) -> HTML
import { C, esc, n0, n1, usd, usdM, pct, doc, pageOf, card, table, bars, fit, northArrow, chip, milesLL } from './plain.mjs';
import { summarizeTracts, inGeom } from '../demographics.mjs';
import { ACS_BRACKETS, CAT_LABEL } from '../spending.mjs';
import { frame } from '../siteplan.mjs';

export const RINGS = [1, 3, 5, 10];
// the ring with the highest figure, said by say(index, value), or a dash when no ring has the figure
const bestRing = (v, say) => { let k = -1; v.forEach((x, i) => { if (Number.isFinite(x) && (k < 0 || x > v[k])) k = i; }); return k < 0 ? '—' : say(k, v[k]); };
// a filing's reported cost is suspect when it is over $100M and works out above $5,000 a square foot (a typo in the state
// record, usually a few extra digits: a road job filed at $6.5B): shown, but left out of the totals. Smaller ones with a
// high cost per foot are usually a small square footage typed in, so their cost stands.
export const suspect = f => +f.cost > 1e8 && +f.sqft > 0 && f.cost / f.sqft > 5000;
// the share of a tract's area inside a circle of mi miles round c: the tract's area inside the circle (points on a lattice
// over the circle) over the tract's whole area (its outline, measured). Sampling the circle, not the tract, keeps a 1-mile
// ring accurate inside a rural tract many miles across (2026-10-30, Sevier County, TN: a lattice over the tract missed the
// ring altogether, the 1-mile ring came out empty and the report failed).
const sqMi = (g, lat) => { const kx = 69.172 * Math.cos(lat * Math.PI / 180), ky = 69.0, ra = r => { let s = 0; for (let i = 1; i < r.length; i++) s += r[i - 1][0] * kx * r[i][1] * ky - r[i][0] * kx * r[i - 1][1] * ky; return Math.abs(s) / 2; };
  return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).reduce((t, rs) => t + ra(rs[0]) - rs.slice(1).reduce((h, r) => h + ra(r), 0), 0); };
export function shareInside(t, c, mi, n = 40) {
  const rs = t.geom.type === 'Polygon' ? [t.geom.coordinates] : t.geom.coordinates; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pl of rs) for (const [x, y] of pl[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (milesLL(c, [Math.max(x0, Math.min(c[0], x1)), Math.max(y0, Math.min(c[1], y1))]) > mi) return 0; // (the box is wholly outside)
  if ([[x0, y0], [x0, y1], [x1, y0], [x1, y1]].every(p => milesLL(c, p) <= mi)) return 1; // (the box is wholly inside)
  const whole = sqMi(t.geom, c[1]); if (!(whole > 0)) return 0;
  const dy = mi / 69.0, dx = mi / (69.172 * Math.cos(c[1] * Math.PI / 180)), sx = 2 * dx / n, sy = 2 * dy / n, cell = (2 * mi / n) ** 2;
  let b = 0;
  for (let j = 0; j < n; j++) { const y = c[1] - dy + (j + 0.5) * sy; if (y < y0 || y > y1) continue;
    for (let i = 0; i < n; i++) { const p = [c[0] - dx + (i + 0.5) * sx, y]; if (p[0] < x0 || p[0] > x1 || milesLL(c, p) > mi || !inGeom(p, t.geom)) continue; b++; } }
  return Math.min(1, b * cell / whole);
}
// a tract scaled to a share of itself (counts scale, medians stay; summarizeTracts weights medians by households)
const part = (t, f) => f >= 0.999 ? t : { ...t, pop: t.pop * f, hu: t.hu * f, vac: t.vac * f, hh: t.hh * f, jobs: t.jobs == null ? t.jobs : t.jobs * f, spend: t.spend == null ? t.spend : t.spend * f,
  sp: t.sp ? Object.fromEntries(Object.entries(t.sp).map(([k, v]) => [k, v * f])) : t.sp, ib: t.ib ? t.ib.map(v => v * f) : t.ib };
// share of a ring the tracts cover: sample points on a lattice inside the circle
export function coverage(tracts, center, mi, n = 24) {
  let inside = 0, hit = 0; const F = frame(center), r = mi * 5280;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (i + 0.5) / n * 2 - 1, y = (j + 0.5) / n * 2 - 1; if (x * x + y * y > 1) continue; inside++; const p = F.toLL([x * r, y * r]); if (tracts.some(t => t.geom && inGeom(p, t.geom))) hit++; }
  return inside ? hit / inside : 0;
}
// income brackets grouped for the chart
const GROUPS = [['Under $25K', 0, 25000], ['$25–50K', 25000, 50000], ['$50–75K', 50000, 75000], ['$75–100K', 75000, 100000], ['$100–150K', 100000, 150000], ['$150–200K', 150000, 200000], ['$200K+', 200000, Infinity]];
export function incomeMix(list) {
  const g = GROUPS.map(() => 0); let tot = 0;
  for (const t of list) (t.ib || []).forEach((n, i) => { const [lo] = ACS_BRACKETS[i] || []; const k = GROUPS.findIndex(([, a, b]) => lo >= a && lo < b); if (k >= 0) { g[k] += n; tot += n; } });
  return GROUPS.map(([l], i) => [l, tot ? g[i] / tot * 100 : 0]);
}
export function ringData({ center, tracts, filings, rings = RINGS }) {
  const near = tracts.filter(t => t.geom); // (every tract is tested: a big one's centre can be outside a ring it reaches into)
  return rings.map(mi => { const list = near.map(t => [t, shareInside(t, center, mi)]).filter(([, f]) => f > 0.005).map(([t, f]) => part(t, f)), sum = summarizeTracts(list) || {}, fl = filings.filter(f => Number.isFinite(f.lat) && milesLL(center, [f.lon, f.lat]) <= mi), ok = fl.filter(f => !suspect(f));
    if (!list.some(t => t.gr != null)) sum.population_growth_pct = null; // (live tracts carry no growth figure: unknown, not 0%)
    return { mi, list, sum, cover: coverage(tracts, center, mi), mix: incomeMix(list), filings: fl, value: ok.reduce((s, f) => s + (+f.cost || 0), 0), sqft: ok.reduce((s, f) => s + (+f.sqft || 0), 0), units: ok.reduce((s, f) => s + (+f.units || 0), 0), odd: fl.filter(suspect) }; });
}

const RAMP = ['#eef3ff', '#c6d7ff', '#8fb0ff', '#4f83ff', '#1f4fd1'];
function ringMap(R, { center, site, W = 720, H = 470 }) {
  const F = frame(center), max = R[R.length - 1].mi * 5280, V = fit([[-max, -max], [max, max]], W, H, 14), all = R[R.length - 1].list;
  const inc = all.map(t => t.inc).filter(v => v > 0).sort((a, b) => a - b), cuts = [0.2, 0.4, 0.6, 0.8].map(q => inc[Math.floor(q * (inc.length - 1))] || 0), shade = v => v > 0 ? RAMP[cuts.filter(c => v > c).length] : '#f1f3f4';
  const o = ['<svg class="map" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><defs><clipPath id="rc"><circle cx="' + (W / 2) + '" cy="' + (H / 2) + '" r="' + (max * V.s + 30).toFixed(1) + '"/></clipPath></defs><g clip-path="url(#rc)">'];
  const poly = g => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).map(pl => pl.map(r => r.map((p, i) => (i ? 'L' : 'M') + V.P(F.toFt(p)).map(v => v.toFixed(1)).join(' ')).join('') + 'Z').join('')).join('');
  for (const t of all) o.push('<path d="' + poly(t.geom) + '" fill="' + shade(t.inc) + '" stroke="#fff" stroke-width=".5"/>');
  o.push('</g>');
  for (const r of R) { const rr = r.mi * 5280 * V.s; o.push('<circle cx="' + (W / 2) + '" cy="' + (H / 2) + '" r="' + rr.toFixed(1) + '" fill="none" stroke="' + C.ink + '" stroke-width="1" stroke-dasharray="' + (r.mi === R[R.length - 1].mi ? '0' : '3 2') + '"/>' + chip(W / 2, H / 2 - rr, r.mi + ' MI', { size: 6.6 })); }
  if (site?.length) o.push('<path d="' + site.map((p, i) => (i ? 'L' : 'M') + V.P(F.toFt(p)).map(v => v.toFixed(1)).join(' ')).join('') + 'Z" fill="' + C.ink + '"/>');
  o.push('<circle cx="' + (W / 2) + '" cy="' + (H / 2) + '" r="3.5" fill="' + C.ink + '" stroke="#fff" stroke-width="1.2"/>', northArrow(W - 26, 12));
  o.push('<g transform="translate(12,' + (H - 26) + ')"><rect x="-4" y="-12" width="' + (RAMP.length * 46 + 8) + '" height="30" rx="3" fill="#fff" stroke="' + C.line + '"/><text x="0" y="-3" font-family="Inter" font-size="6.3" fill="' + C.sub + '">MEDIAN HOUSEHOLD INCOME BY TRACT</text>' +
    RAMP.map((c, i) => '<rect x="' + i * 46 + '" y="2" width="44" height="6" fill="' + c + '"/><text x="' + (i * 46) + '" y="15" font-family="Inter" font-size="6" fill="' + C.sub + '">' + (i ? usdM(cuts[i - 1]).replace('$', '>$') : '<' + usdM(cuts[0])) + '</text>').join('') + '</g></svg>');
  return o.join('');
}

export function ringsReport({ title, area = '', date = '', center, site = null, tracts = [], filings = [], period = null, rings = RINGS, zipRent = null, unemployment = null, acsYear = '', zip = '', filingsNote = '' }) {
  const R = ringData({ center, tracts, filings, rings }), cols = [['Measure']].concat(R.map(r => [r.mi + ' mile' + (r.mi === 1 ? '' : 's'), 'n'])), S = k => R.map(r => r.sum[k]);
  const head = { kicker: 'Area report · rings', title, rightSub: area, right: rings.join(' · ') + ' miles' };
  const foot = 'People and housing: US Census ACS 5-year' + (acsYear ? ' (' + esc(acsYear) + ')' : '') + ' by tract, each counted for the share of its area inside the ring, medians approximate (household-weighted)' + (filingsNote ? '' : ' · construction: TDLR TABS filings' + (period ? ' ' + esc(period.start) + ' to ' + esc(period.end) : '')) + (date ? ' · ' + esc(date) : '');
  const row = (l, vals, f) => ['<span class="sub">' + esc(l) + '</span>'].concat(vals.map(v => f(v)));
  const key = table(cols, [
    row('Population', S('population'), n0), row('Growth, 5 years', S('population_growth_pct'), v => v == null ? '—' : (v > 0 ? '+' : '') + pct(v)), row('Households', S('households'), n0), row('Median age (approx.)', S('median_age_approx'), n1),
    row('Median household income', S('median_household_income_approx'), usd), row('Median home value', S('median_home_value_approx'), usd), row('Median gross rent', S('median_gross_rent_approx'), v => v ? usd(v) + '/mo' : '—'),
    row('Housing units', S('housing_units'), n0), row('Vacancy', S('vacancy_rate_pct'), v => pct(v)), row('Jobs located here', S('jobs'), n0),
    row('Consumer spending (modeled)', R.map(r => r.sum.consumer_spending_estimate?.per_year), usdM), row('Census tracts (whole or part)', R.map(r => r.list.length), n0), row('Ring covered by the data', R.map(r => r.cover * 100), v => v >= 97 ? n0(v) + '%' : '<b style="color:' + C.amber + '">' + n0(v) + '%</b>')]);
  const pages = [];
  const partial = R.filter(r => r.cover < 0.97);
  pages.push(pageOf({ ...head, sub: 'Rings measured from ' + center[1].toFixed(5) + ', ' + center[0].toFixed(5) }, ringMap(R, { center, site }) + '<div style="height:9px"></div>' + key +
    (partial.length ? '<p class="note" style="margin-top:5px;color:' + C.amber + '">The ' + partial.map(r => r.mi + '-mile').join(', ') + ' ring' + (partial.length > 1 ? 's run' : ' runs') + ' past the counties the app holds tract data for: the totals count only the covered part.</p>' : ''), foot));
  // 2. households: income mix, housing and spending
  const mixRows = GROUPS.map(([l], i) => ['<span class="sub">' + l + '</span>'].concat(R.map(r => pct(r.mix[i][1], 1))));
  const cats = Object.keys(CAT_LABEL).filter(k => k !== 'total'), spend = cats.map(k => ['<span class="sub">' + esc(CAT_LABEL[k]) + '</span>'].concat(R.map(r => usdM(r.sum.consumer_spending_estimate?.by_category?.[k]))));
  const big = R[Math.min(1, R.length - 1)];
  pages.push(pageOf({ ...head, kicker: 'Area report · households', sub: 'Who lives in each ring and what they spend' },
    '<div class="row"><div class="col"><div class="k" style="margin-bottom:3px">Households by income</div>' + table(cols, mixRows) + '</div><div style="width:300px"><div class="k" style="margin-bottom:3px">Income mix, ' + big.mi + ' miles</div>' + bars(big.mix, { W: 300, labelW: 70, fmt: v => pct(v, 1), color: C.accent }) + '</div></div>' +
    '<div style="height:12px"></div><div class="k" style="margin-bottom:3px">Consumer spending a year (modeled: households by income × BLS Consumer Expenditure Survey, South region)</div>' + table(cols, spend.concat([['<b>Total</b>'].concat(R.map(r => '<b>' + usdM(r.sum.consumer_spending_estimate?.per_year) + '</b>'))])) +
    '<div style="height:12px"></div><div class="row"><div class="col">' + card('Local market', [['Typical rent, ZIP ' + (zip || ''), zipRent ? usd(zipRent.rent) + '/mo (' + (zipRent.yoy > 0 ? '+' : '') + n1(zipRent.yoy) + '% a year, ' + zipRent.month + ')' : '—'], ['Unemployment, county', unemployment ? pct(unemployment.rate) + ' (' + unemployment.period + ', a year ago ' + pct(unemployment.yearAgo) + ')' : '—'],
      ['Spending per household (' + R[0].mi + ' mi)', usd(R[0].sum.consumer_spending_estimate?.per_household)], ['Spending per household (' + R[R.length - 1].mi + ' mi)', usd(R[R.length - 1].sum.consumer_spending_estimate?.per_household)]]) + '</div><div class="col">' +
    card('Reading the rings', [['Densest ring', bestRing(R.map(r => r.sum.population / (Math.PI * r.mi * r.mi)), (k, v) => R[k].mi + ' mi · ' + n0(v) + ' people / sq mi')], ['Highest income', bestRing(S('median_household_income_approx'), (k, v) => R[k].mi + ' mi · ' + usd(v))], ['Fastest growing', bestRing(S('population_growth_pct'), (k, v) => R[k].mi + ' mi · ' + (v > 0 ? '+' : '') + pct(v))]]) + '</div></div>', foot));
  if (filingsNote) return doc('Area report · ' + title, pages.concat([pageOf({ ...head, kicker: 'Area report · construction', sub: 'Construction filed in each ring' }, '<div class="card"><span class="k">Not covered here</span><p class="para">' + esc(filingsNote) + '</p></div>', foot)]));
  // 3. construction in the rings
  const uses = [...new Set(R[R.length - 1].filings.map(f => f.use || 'Other'))], byUse = uses.map(u => [u, R[R.length - 1].filings.filter(f => (f.use || 'Other') === u && !suspect(f)).reduce((s, f) => s + (+f.cost || 0), 0)]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const pipe = table(cols, [row('Projects filed', R.map(r => r.filings.length), n0), row('Reported value', R.map(r => r.value), usdM), row('Square feet', R.map(r => r.sqft), n0), row('New buildings', R.map(r => r.filings.filter(f => /new/i.test(f.type)).length), n0), row('Renovations', R.map(r => r.filings.filter(f => /reno/i.test(f.type)).length), n0), row('Housing units', R.map(r => r.units), n0)]);
  const mid = R.find(r => r.mi >= 5) || R[R.length - 1], val = f => suspect(f) ? 0 : +f.cost || 0, top = mid.filings.slice().sort((a, b) => val(b) - val(a)).slice(0, 14);
  const topT = table([['Project'], ['Use'], ['Type'], ['Value', 'n'], ['Sq ft', 'n'], ['Start'], ['Distance', 'n']], top.map(f => ['<b>' + esc(f.name) + '</b><div class="note">' + esc(f.city || '') + (f.owner ? ' · ' + esc(f.owner) : '') + '</div>', esc(f.use || '—'), esc(f.type || '—'), suspect(f) ? '<span style="color:' + C.amber + '">' + usdM(f.cost) + '*</span>' : usdM(f.cost), n0(f.sqft), esc(f.start || '—'), n1(milesLL(center, [f.lon, f.lat])) + ' mi']));
  const odd = R[R.length - 1].odd;
  pages.push(pageOf({ ...head, kicker: 'Area report · construction', sub: 'Commercial and public projects filed with the state (TDLR) in each ring' }, pipe +
    '<div class="row" style="margin-top:12px"><div class="col"><div class="k" style="margin-bottom:3px">Largest projects within ' + mid.mi + ' miles</div>' + topT + '</div></div>' +
    '<div class="row" style="margin-top:10px"><div class="col"><div class="k" style="margin-bottom:3px">Value by use, ' + R[R.length - 1].mi + ' miles</div>' + bars(byUse, { W: 360, labelW: 90, fmt: usdM }) + '</div><div class="col">' +
    (odd.length ? '<p class="note" style="color:' + C.amber + '">* ' + odd.length + ' filing' + (odd.length === 1 ? ' reports' : 's report') + ' a value over $5,000 a square foot (' + odd.map(f => esc(f.name) + ': ' + usdM(f.cost)).join('; ') + '), likely a typo in the state record. Left out of the totals.</p>' : '') +
    '<p class="note">TDLR registers projects of $50,000 or more that must meet the state\'s accessibility rules: commercial, public and multifamily buildings, not single-family homes. Values are the filer\'s estimate.</p></div></div>', foot));
  return doc('Area report · ' + title, pages);
}
