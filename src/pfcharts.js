// Charts for the site plan's pro forma (src/siteplan.js), drawn with D3 as HTML/SVG strings like the Market tab's
// (src/mkcharts.js): marks carry data-mka/data-mk so src/mkmotion.js morphs them when an assumption changes, and every
// mark with numbers is a .mk-hit with a data-tip (siteplan.js shows it in the app's tooltip).
//   jcurve: the investor's cash, month by month, cumulative: the dip while equity goes in, the climb, the sale
//   money:  where the money goes (uses) and where it comes from (sources), as two stacked bars on one scale
//   sens:   the levered IRR as rents and the exit cap rate (or prices and costs, for homes for sale) move
import { col } from './mkcharts.js';

const f1 = v => +v.toFixed(1);
export const money = v => v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1) + 'M' : Math.abs(v) >= 1e3 ? Math.round(Math.abs(v) / 1e3) + 'K' : Math.round(Math.abs(v)));
const pct = v => v == null || !Number.isFinite(v) ? 'n/a' : (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%';
let gid = 0;

export function pfCharts({ esc }) {
  const d3 = globalThis.d3;

  // ---- cash in and out (levered, cumulative), over the schedule's phases ----
  function jcurve(R, { simple = false, W = 360, H = 156 } = {}) {
    const lev = simple ? R.simple.levered : R.monthly.levered; if (!lev?.length) return '';
    const step = simple ? 12 : 1, pts = []; let c = 0; lev.forEach((v, i) => { c += v; pts.push({ t: i * step, v, c }); });
    const T = pts[pts.length - 1].t || 1, padL = 46, padR = 8, padT = 16, padB = 20;
    // the y range gets room under the lowest point (its label goes there when it can't go beside it)
    const [c0, c1] = d3.extent([0, ...pts.map(p => p.c)]), x = d3.scaleLinear([0, T], [padL, W - padR]), y = d3.scaleLinear([c0 - (c0 < 0 ? (c1 - c0) * .14 : 0), c1], [H - padB, padT]).nice(4), z = y(0);
    const s = R.sched, forSale = R.forSale, phase = t => simple ? 'year ' + Math.round(t / 12) : t <= s.pre ? 'design & permits' : t <= s.pre + s.build ? 'construction' : t <= s.toStabilize ? (forSale ? 'sales' : 'lease-up') : 'hold';
    // phases as faint bands with their names (the month-by-month method only: the one-page method has no schedule)
    const bands = simple ? '' : [[0, s.pre, 'pre', 'Design'], [s.pre, s.pre + s.build, 'bld', 'Build'], [s.pre + s.build, s.toStabilize, 'lease', forSale ? 'Sales' : 'Lease-up'], [s.toStabilize, T, 'hold', 'Hold']]
      .filter(([a, b]) => b > a).map(([a, b, cls, t]) => '<rect class="pf-ph ' + cls + '" x="' + f1(x(a)) + '" y="' + padT + '" width="' + f1(x(b) - x(a)) + '" height="' + (H - padB - padT) + '"/>' +
        (x(b) - x(a) > t.length * 5.6 + 6 ? '<text class="pf-pl" x="' + f1((x(a) + x(b)) / 2) + '" y="' + (padT - 4) + '" text-anchor="middle">' + t + '</text>' : '')).join('');
    // green above zero (cash back), red below (cash in): one gradient split at the zero line
    const o = Math.min(1, Math.max(0, (z - padT) / (H - padB - padT))), g = 'pfg' + (++gid);
    const stops = (op1, op2) => '<stop offset="0" class="pf-up" stop-opacity="' + op1 + '"/><stop offset="' + o.toFixed(3) + '" class="pf-up" stop-opacity="' + op2 + '"/><stop offset="' + o.toFixed(3) + '" class="pf-dn" stop-opacity="' + op2 + '"/><stop offset="1" class="pf-dn" stop-opacity="' + op1 + '"/>';
    const defs = '<defs><linearGradient id="' + g + 'a" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="' + padT + '" y2="' + (H - padB) + '">' + stops(.32, .1) + '</linearGradient>' +
      '<linearGradient id="' + g + 'l" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="' + padT + '" y2="' + (H - padB) + '">' + stops(1, 1) + '</linearGradient></defs>';
    const area = d3.area().x(p => x(p.t)).y0(z).y1(p => y(p.c)).digits(1), line = d3.line().x(p => x(p.t)).y(p => y(p.c)).digits(1);
    const ticks = y.ticks(4).map(t => '<line class="pf-grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '"/><text class="pf-ax" x="' + (padL - 5) + '" y="' + f1(y(t) + 3) + '" text-anchor="end">' + (t ? money(t) : '0') + '</text>').join('');
    const every = T > 132 ? 36 : T > 72 ? 24 : 12, xt = d3.range(every, T + 1, every).map(t => '<text class="pf-ax" x="' + f1(x(t)) + '" y="' + (H - 6) + '" text-anchor="middle">Yr ' + t / 12 + '</text>').join('');
    // the deepest point (all the equity in, before money comes back) and the end
    const lo = pts.reduce((a, p) => p.c < a.c ? p : a, pts[0]), end = pts[pts.length - 1], dot = (p, k) => '<path class="pf-dot ' + (p.c < 0 ? 'dn' : 'up') + '" data-mka="dot" data-mk="' + k + '" d="M' + f1(x(p.t)) + ',' + f1(y(p.c)) + 'h0"/>';
    // labels: the deepest point's to its left when it fits (the curve is above it there), else just under it; the end's
    // above its dot when the plan ends ahead, under it when it ends behind (the curve comes down to it from above)
    const loT = money(-lo.c) + ' in at most', left = x(lo.t) - padL > loT.length * 6.1 + 12;
    const loL = lo.c < 0 ? '<text class="pf-note" x="' + f1(x(lo.t) + (left ? -8 : 0)) + '" y="' + f1(left ? y(lo.c) + 4 : y(lo.c) + 14) + '" text-anchor="' + (left ? 'end' : x(lo.t) > W - 70 ? 'end' : x(lo.t) < padL + 60 ? 'start' : 'middle') + '">' + loT + '</text>' : '';
    const endL = '<text class="pf-note" x="' + f1(x(end.t) - 6) + '" y="' + f1(end.c >= 0 ? Math.max(padT + 9, y(end.c) - 6) : Math.min(H - padB - 3, y(end.c) + 14)) + '" text-anchor="end">' + (end.c >= 0 ? '+' : '') + money(end.c) + ' at end</text>';
    const cw = Math.max(1, x(step) - x(0)), hits = pts.map(p => '<rect class="mk-hit" x="' + f1(x(p.t) - cw / 2) + '" y="' + padT + '" width="' + f1(cw) + '" height="' + (H - padB - padT) + '" data-tip="' +
      esc((simple ? 'Year ' + p.t / 12 : 'Month ' + p.t + ' (' + phase(p.t) + ')') + ': ' + (p.v >= 0 ? '+' : '') + money(p.v) + (simple ? ' that year' : ' that month') + ', ' + (p.c >= 0 ? '+' : '') + money(p.c) + ' so far') + '"/>').join('');
    return '<svg class="pf-jc" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cash in and out over time, cumulative" data-mkc="jc" data-base="' + f1(z) + '">' + defs + bands + ticks +
      '<path data-mka="area" data-mk="a" d="' + area(pts) + '" fill="url(#' + g + 'a)"/><line class="pf-zero" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + f1(z) + '" y2="' + f1(z) + '"/>' +
      '<path class="pf-line" data-mka="line" data-mk="l" d="' + line(pts) + '" stroke="url(#' + g + 'l)"/>' + dot(lo, 'lo') + dot(end, 'end') + loL + endL + xt + hits + '</svg>';
  }

  // ---- uses and sources: two stacked bars on the same scale ----
  function moneyBars(R) {
    const b = R.budget, total = b.total, eq = Math.min(total, R.sources.equity), loan = Math.max(0, total - eq);
    const uses = [['Land', b.land, 2], ['Building', b.hard, 0], ['Site & parking', b.site, 5], ['Soft costs & contingency', b.soft + b.ti + b.cont, 3], ['Fee & financing', b.fee + b.interest + b.loanFees, 4]].filter(([, v]) => v > 0);
    const src = [['Equity', eq, 1, ''], ['Construction loan', loan, 1, 'opacity:.45;']].filter(([, v]) => v > 0);
    const seg = ([k, v, c, extra]) => '<b class="mk-hit" data-mka="hb" data-mk="' + esc(k) + '" style="width:' + (v / total * 100).toFixed(2) + '%;background:' + col(c) + ';' + (extra || '') + '" data-tip="' + esc(k + ': ' + money(v) + ' (' + Math.round(v / total * 100) + '%)') + '"></b>';
    const leg = list => '<div class="pf-leg">' + list.map(([k, v, c, extra]) => '<span><i style="background:' + col(c) + ';' + (extra || '') + '"></i>' + esc(k) + ' <em>' + Math.round(v / total * 100) + '%</em></span>').join('') + '</div>';
    return '<div class="pf-money" data-mkc="money"><div class="pf-row"><span>Uses</span><div class="pf-stack" data-mkc="uses">' + uses.map(seg).join('') + '</div><em data-mka="num" data-mk="tot">' + money(total) + '</em></div>' + leg(uses) +
      '<div class="pf-row"><span>Sources</span><div class="pf-stack" data-mkc="src">' + src.map(seg).join('') + '</div><em></em></div>' + leg(src) + '</div>';
  }

  // ---- sensitivity table: green beats this plan, red falls short (by up to 5 points for full colour) ----
  function sens(S) {
    if (!S?.grid) return '';
    const head = S.forSale ? c => 'Costs ' + (c > 0 ? '+' : c < 0 ? '−' : '') + Math.abs(c) + '%' : c => (S.exitCap + c).toFixed(2) + '%';
    const rowL = r => (S.forSale ? 'Prices ' : 'Rents ') + (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r) + '%';
    const cell = (v, i, j) => { const base = i === 2 && j === 2, d = v == null || S.base == null ? 0 : (v - S.base) / 0.05, k = Math.round(Math.min(1, Math.abs(d)) * 55);
      const bg = v == null ? '' : 'background:color-mix(in srgb,var(' + (d >= 0 ? '--mx-up' : '--mx-dn') + ') ' + k + '%,transparent)';
      return '<td class="' + (base ? 'base' : '') + '" style="' + bg + '"><span data-mka="num" data-mk="' + i + '-' + j + '">' + pct(v) + '</span></td>'; };
    return '<table class="pf-sens" data-mkc="sens"><thead><tr><th>' + (S.forSale ? '' : 'Exit cap →') + '</th>' + S.cols.map(c => '<th>' + head(c) + '</th>').join('') + '</tr></thead><tbody>' +
      S.grid.map((row, i) => '<tr><th>' + rowL(S.rows[i]) + '</th>' + row.map((v, j) => cell(v, i, j)).join('') + '</tr>').join('') + '</tbody></table>';
  }

  return { jcurve, moneyBars, sens };
}
