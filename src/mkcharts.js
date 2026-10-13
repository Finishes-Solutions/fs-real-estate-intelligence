// Chart kit for the Market tab (src/area.js), drawn with D3 (scales, stacks, curves; d3 is the global from index.html).
// Charts are still inline SVG strings with one look and one hover model: every mark that has numbers is a .mk-hit with
// a data-tip (area.js shows it in #mkTip on hover or focus); a data-k makes it clickable (pin).
// Animated marks carry data-mka (bar, line, area, hb, num, dot) and a data-mk key, so src/mkmotion.js can grow them in
// and morph them from the previous render. Colours are CSS variables with light fallbacks, so the same SVG works in
// dark mode and in the exported PDF.
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const PAL = ['#006527', '#2a78d6', '#c26a00', '#7c3aed', '#8a9396', '#0e7c86', '#b3261e'];
export const col = i => 'var(--mk-c' + i + ',' + PAL[i] + ')';
export const mlabel = m => MON[+String(m).slice(5, 7) - 1] + ' ' + String(m).slice(0, 4);

const f1 = v => +v.toFixed(1);
let gid = 0; // gradient ids, unique on the page

export function mkCharts({ esc, fmtN }) {
  const d3 = globalThis.d3;
  const nice = v => v > 0 ? d3.scaleLinear().domain([0, v]).nice().domain()[1] : 1;
  // a bar on a flat baseline, rounded on top when r > 0. Always the same commands (r = 0 just puts the curves' control
  // points on the corners), so mkmotion can morph any bar into any other.
  const bar = (x, y, w, h, r = 3) => { h = Math.max(0, h); r = Math.max(0, Math.min(r, w / 2, h)); const b = y + h;
    return 'M' + f1(x) + ',' + f1(b) + 'V' + f1(y + r) + 'Q' + f1(x) + ',' + f1(y) + ' ' + f1(x + r) + ',' + f1(y) + 'H' + f1(x + w - r) + 'Q' + f1(x + w) + ',' + f1(y) + ' ' + f1(x + w) + ',' + f1(y + r) + 'V' + f1(b) + 'Z'; };
  // y scale with "nice" round ticks and gridlines; lo can be below zero (rates, changes)
  function yAxis({ W, H, lo = 0, hi, padL, padT, padB, fmt, n }) {
    const y = d3.scaleLinear([lo, hi > lo ? hi : lo + 1], [H - padB, padT]).nice(n), ticks = y.ticks(n);
    return { Y: y, base: y(Math.max(lo, Math.min(0, y.domain()[1]))), html: '<g class="mk-axis">' + ticks.map(t => '<line class="mk-grid' + (t === 0 ? ' mk-zero' : '') + '" x1="' + padL + '" x2="' + W + '" y1="' + f1(y(t)) + '" y2="' + f1(y(t)) + '"/><text class="mk-ax" x="' + (padL - 6) + '" y="' + f1(y(t) + 3) + '" text-anchor="end">' + esc(fmt(t)) + '</text>').join('') + '</g>' };
  }
  // a vertical gradient under a line: the series colour fading out towards the baseline
  const grad = (c, top = .22) => { const id = 'mkg' + (++gid); return { id, html: '<defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:' + col(c) + '" stop-opacity="' + top + '"/><stop offset="1" style="stop-color:' + col(c) + '" stop-opacity="0"/></linearGradient></defs>' }; };

  // bars (stacked when several keys): rows [{ label, v: { key: n }, tip, faded, tick }], keys [{ k, label, c }] (c = palette index)
  // pinKey/pin: clicking a bar pins it (data-k "pinKey:index"); off shifts the index (a monthly chart showing its last N rows)
  function bars({ rows, keys, W = 520, H = 180, fmt = fmtN, pinKey = null, pin = null, off = 0, aria = '', padL = 48 }) {
    if (!rows?.length) return '';
    const padT = 8, padB = 22, stack = d3.stack().keys(keys.map(k => k.k)).value((r, k) => Math.max(0, r.v[k] || 0))(rows);
    const top = d3.max(stack.at(-1) || [], d => d[1]) || 1, ax = yAxis({ W, H, hi: top, padL, padT, padB, fmt, n: H < 150 ? 3 : 4 });
    const x = d3.scaleBand(d3.range(rows.length), [padL + 6, W]).paddingInner(rows.length > 20 ? .18 : .38).paddingOuter(.1);
    const w = Math.max(2, Math.min(44, x.bandwidth())), step = x.step(), Y = ax.Y;
    // x labels left to right, skipping one that would overlap the last (narrow screens: "now" beside "2027")
    let lastR = -Infinity; const tickAt = (t, cx) => { if (!t) return ''; const half = String(t).length * 3.3; if (cx - half < lastR + 4) return ''; lastR = cx + half;
      return '<text class="mk-ax" x="' + f1(cx) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(t) + '</text>'; };
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '" data-base="' + f1(ax.base) + '">' + ax.html + rows.map((r, i) => {
      const bx = x(i) + (x.bandwidth() - w) / 2, key = pinKey ? pinKey + ':' + (i + off) : '', id = i + off;
      // the top segment is rounded; a 1px gap of panel colour separates stacked segments
      const lastK = keys.findLastIndex(k => r.v[k.k] > 0);
      const segs = keys.map((k, j) => { const [a, b] = stack[j][i], y0 = Y(a), y1 = Y(b), h = y0 - y1 - (j < lastK && y0 - y1 > 3 ? 1 : 0);
        return '<path data-mka="bar" data-mk="' + id + ':' + esc(k.k) + '" d="' + bar(bx, y0 - h, w, h, j === lastK ? 3 : 0) + '" style="fill:' + col(k.c) + (r.faded ? ';fill-opacity:.38' : '') + '"/>'; }).join('');
      return '<g class="mk-hit' + (pin && key === pin.k + ':' + pin.i ? ' on' : '') + '" tabindex="0"' + (key ? ' data-k="' + key + '"' : '') + ' data-tip="' + esc(r.tip || '') + '"><rect x="' + f1(x(i) - step * x.paddingInner() / 2) + '" y="' + padT + '" width="' + f1(step) + '" height="' + (H - padT - padB) + '" fill="transparent"/>' + segs +
        tickAt(r.tick, bx + w / 2) + '</g>';
    }).join('') + '</svg>';
  }

  // lines over shared x positions: xs [label], series [{ label, c, dash, vals: [n|null] }]; hovering a column reads every
  // series at that x. tip(i) overrides the text; tick(i) labels the x axis (null for none); mark: index of "now".
  // One series gets a soft fill under it; every series ends in a dot on its latest value.
  function lines({ xs, series, W = 560, H = 190, fmt = fmtN, tip = null, tick = null, aria = '', padL = 48, zero = true, mark = null }) {
    const vals = series.flatMap(s => s.vals).filter(Number.isFinite); if (!vals.length || xs.length < 2) return '';
    let [lo, hi] = d3.extent(vals); if (zero) lo = Math.min(0, lo); else { const pad = (hi - lo) * .08 || Math.abs(hi) * .05 || 1, pos = lo >= 0; lo -= pad; hi += pad; if (pos) lo = Math.max(0, lo); }
    const padT = 8, padB = 22, ax = yAxis({ W, H, lo, hi, padL, padT, padB, fmt, n: H < 150 ? 3 : 4 }), Y = ax.Y;
    const X = d3.scaleLinear([0, xs.length - 1], [padL + 6, W - 6]), step = X(1) - X(0);
    const line = d3.line().defined(v => Number.isFinite(v)).x((v, i) => X(i)).y(v => Y(v)).curve(d3.curveMonotoneX).digits(1);
    const area = d3.area().defined(v => Number.isFinite(v)).x((v, i) => X(i)).y0(H - padB).y1(v => Y(v)).curve(d3.curveMonotoneX).digits(1);
    const fill = series.length === 1 ? (() => { const g = grad(series[0].c); return g.html + '<path data-mka="area" data-mk="a:' + esc(series[0].label) + '" d="' + area(series[0].vals) + '" fill="url(#' + g.id + ')"/>'; })() : '';
    const lns = series.map(s => '<path data-mka="line" data-mk="l:' + esc(s.label) + '" d="' + line(s.vals) + '" fill="none" style="stroke:' + col(s.c) + '" stroke-width="' + (s.w || 2) + '" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="5 3"' : '') + '/>').join('');
    const ends = series.map(s => { const i = s.vals.findLastIndex(Number.isFinite); return i < 0 ? '' : dot(X(i), Y(s.vals[i]), s.c, 'class="mk-end" data-mka="dot" data-mk="' + esc(s.label) + '"', 7); }).join('');
    const hits = xs.map((x, i) => '<g class="mk-hit mk-col" data-tip="' + esc(tip ? tip(i) : x + ': ' + series.filter(s => Number.isFinite(s.vals[i])).map(s => s.label + ' ' + fmt(s.vals[i])).join(' · ')) + '">' +
      '<rect x="' + f1(X(i) - step / 2) + '" y="' + padT + '" width="' + Math.max(1, step).toFixed(2) + '" height="' + (H - padT - padB) + '" fill="transparent"/><line class="mk-cross" x1="' + f1(X(i)) + '" x2="' + f1(X(i)) + '" y1="' + padT + '" y2="' + (H - padB) + '"/>' +
      series.filter(s => Number.isFinite(s.vals[i])).map(s => '<circle class="mk-dot" cx="' + f1(X(i)) + '" cy="' + f1(Y(s.vals[i])) + '" r="4" style="fill:' + col(s.c) + '"/>').join('') + '</g>').join('');
    const ticks = xs.map((x, i) => { const t = tick ? tick(i) : null; return t ? '<text class="mk-ax" x="' + f1(X(i)) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle') + '">' + esc(t) + '</text>' : ''; }).join('');
    const now = mark != null ? '<line class="mk-now" x1="' + f1(X(mark)) + '" x2="' + f1(X(mark)) + '" y1="' + padT + '" y2="' + (H - padB) + '"/>' : '';
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '" data-base="' + (H - padB) + '">' + ax.html + now + fill + lns + ends + ticks + hits + '</svg>';
  }

  // horizontal bars: [{ label, v, tip, k, c, sub }]
  function hbars(items, fmt = fmtN, pin = null) {
    const w = d3.scaleLinear([0, d3.max(items, x => x.v || 0) || 1], [0, 100]);
    return '<div class="mk-hbars">' + items.map(x => '<div class="mk-hb mk-hit' + (pin && x.k === pin.k + ':' + pin.i ? ' on' : '') + '" tabindex="0"' + (x.k ? ' data-k="' + esc(x.k) + '"' : '') + ' data-tip="' + esc(x.tip || '') + '"><span>' + esc(x.label) + (x.sub ? ' <small>' + esc(x.sub) + '</small>' : '') + '</span>' +
      '<i><b data-mka="hb" data-mk="' + esc(x.label) + '" style="width:' + w(x.v || 0).toFixed(1) + '%;background:' + col(x.c || 0) + '"></b></i><em data-mka="num" data-mk="' + esc(x.label) + '">' + esc(fmt(x.v)) + '</em></div>').join('') + '</div>';
  }

  // sparkline with a soft fill, a dot on the latest value and a hover readout per point: vals [n], tips [text]. It stretches
  // to its box (preserveAspectRatio none), so dots are zero-length round-capped strokes that stay round
  function spark(vals, { w = 96, h = 26, tips = [], c = 0, fill = true } = {}) {
    if (vals.filter(Number.isFinite).length < 2) return '';
    const X = d3.scaleLinear([0, vals.length - 1], [2, w - 3]), Y = d3.scaleLinear(d3.extent(vals.filter(Number.isFinite)), [h - 3, 3]), cw = X(1) - X(0);
    const ok = v => Number.isFinite(v), line = d3.line().defined(ok).x((v, i) => X(i)).y(Y).curve(d3.curveMonotoneX).digits(1), last = vals.findLastIndex(ok);
    const g = fill ? grad(c, .28) : null;
    return '<svg class="mk-spk" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="trend" data-base="' + h + '">' + (g ? g.html + '<path data-mka="area" data-mk="sa" d="' + d3.area().defined(ok).x((v, i) => X(i)).y0(h).y1(Y).curve(d3.curveMonotoneX).digits(1)(vals) + '" fill="url(#' + g.id + ')"/>' : '') +
      '<path data-mka="line" data-mk="sl" d="' + line(vals) + '" fill="none" style="stroke:' + col(c) + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      dot(X(last), Y(vals[last]), c, 'class="mk-end" data-mka="dot" data-mk="se"') +
      (tips.length ? vals.map((x, i) => ok(x) ? '<g class="mk-hit mk-col" data-tip="' + esc(tips[i] || '') + '"><rect x="' + (X(i) - cw / 2).toFixed(2) + '" y="0" width="' + cw.toFixed(2) + '" height="' + h + '" fill="transparent"/>' + dot(X(i), Y(x), c, 'class="mk-dot"') + '</g>' : '').join('') : '') + '</svg>';
  }

  // a round dot drawn as a zero-length stroke, so it stays round in a stretched sparkline and morphs like any path
  const dot = (x, y, c, attrs, size = 5) => '<path ' + attrs + ' d="M' + f1(x) + ',' + f1(y) + 'h0" style="stroke:' + col(c) + ';stroke-width:' + size + 'px" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';

  // change badge: +12% (green up, red down; invert for costs and unemployment, where up is bad)
  const delta = (v, { unit = '%', invert = false, digits } = {}) => {
    if (!Number.isFinite(v)) return '';
    const d = digits ?? (Math.abs(v) >= 10 ? 0 : 1), good = invert ? v < 0 : v > 0, cls = Math.abs(v) < .05 ? 'mk-flat' : good ? 'mk-up' : 'mk-dn';
    return '<span class="mk-d ' + cls + '">' + (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '') + v.toFixed(d) + unit + '</span>';
  };
  // KPI tile: big number (counts up when it changes), label, a change badge and a sparkline under it
  const kpi = ({ v, label, sub = '', d = '', sp = '', tip = '' }) => '<div class="mk-kpi' + (tip ? ' mk-hit' : '') + '"' + (tip ? ' tabindex="0" data-tip="' + esc(tip) + '"' : '') + '><span class="mk-kl">' + esc(label) + '</span><b data-mka="num" data-mk="v">' + v + '</b><div class="mk-ks">' + d + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' + (sp ? '<div class="mk-kspk">' + sp + '</div>' : '') + '</div>';

  return { bars, lines, hbars, spark, delta, kpi, nice };
}
