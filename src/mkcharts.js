// Chart kit for the Market tab (src/area.js): inline SVG strings with one look and one hover model. Every mark that has
// numbers is a .mk-hit with a data-tip (area.js shows it in #mkTip on hover or focus); a data-k makes it clickable (pin).
// Colours are CSS variables with fallbacks, so the same SVG works on screen and in the exported PDF.
// Motion (src/motion.js): ck puts the chart's identity on its root (data-ck); every mark has a class (m-bar, m-line, m-area,
// m-hbar) and a data-mk key (series|period, or the bar's label) so an update can tween each mark from where it was.
// Sizes (2026-10-15): area.js draws every chart at its box's measured width, so one viewBox unit is one CSS pixel and the
// 11 px axis text really is 11 px. The y axis leaves room for its longest label, and x labels that would collide are thinned.
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const PAL = ['#0b7a5f', '#2a78d6', '#c26a00', '#7c3aed', '#8a9396', '#0e7c86', '#b3261e'];
export const col = i => 'var(--mk-c' + i + ',' + PAL[i] + ')';
export const mlabel = m => MON[+String(m).slice(5, 7) - 1] + ' ' + String(m).slice(0, 4);

export function mkCharts({ esc, fmtN }) {
  const nice = v => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p; };
  const niceStep = v => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
  // a rounded-top bar on a flat baseline
  const bar = (x, y, w, h, r = 3) => { if (!(h > 0)) return ''; r = Math.min(r, w / 2, h); return 'M' + x.toFixed(1) + ',' + (y + h).toFixed(1) + 'V' + (y + r).toFixed(1) + 'Q' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + y.toFixed(1) + 'H' + (x + w - r).toFixed(1) + 'Q' + (x + w).toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + w).toFixed(1) + ',' + (y + r).toFixed(1) + 'V' + (y + h).toFixed(1) + 'Z'; };
  // axis text: 11 px Inter, about 6.7 px a character
  const CH = 6.7, textW = t => String(t).length * CH;
  // y axis with gridlines; lo can be below zero (rates, changes). padL null: just wide enough for the longest label
  function yAxis({ W, H, top, lo = 0, padL, padT, padB, fmt, ticks = null }) {
    const span = top - lo || 1; ticks ||= [lo, lo + span / 2, top]; const labels = ticks.map(t => fmt(t));
    padL ??= Math.ceil(Math.max(...labels.map(textW)) + 12);
    const Y = v => padT + (H - padT - padB) * (1 - (v - lo) / span);
    return { Y, padL, html: ticks.map((t, i) => '<line class="mk-grid" x1="' + padL + '" x2="' + W + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/><text class="mk-ax" x="' + (padL - 6) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + esc(labels[i]) + '</text>').join('') };
  }
  // x labels [{ i, x, t, a }] (a: text-anchor): keep the last, then each one that clears the one kept after it (labels never overlap)
  function thin(list) {
    const keep = new Set(); let next = Infinity;
    for (let j = list.length - 1; j >= 0; j--) { const l = list[j], w = textW(l.t), x0 = l.a === 'start' ? l.x : l.a === 'end' ? l.x - w : l.x - w / 2; if (x0 + w + 8 <= next) { keep.add(l.i); next = x0; } }
    return keep;
  }

  // bars (stacked when several keys): rows [{ label, v: { key: n }, tip, faded, tick }], keys [{ k, label, c }] (c = palette index)
  // pinKey/pin: clicking a bar pins it (data-k "pinKey:index"); off shifts the index (a monthly chart showing its last N rows)
  // ck: the chart's identity for motion; a row's id (its month or year) keys its marks, else its index
  const ckA = ck => ck ? ' data-ck="' + esc(ck) + '"' : '';
  // one hover strip for a single-series line: area.js maps the mouse x to the nearest point (x0..x1 in viewBox units,
  // n evenly spaced points), shows that point's readout (data-tipx, \u001f-separated) and moves the dot (data-py: each
  // point's y, empty where there's none) and the cross line. One element instead of a group of three per point
  const hx = ({ x0, x1, top, bottom, ys, tips, c, r = 3.2 }) => '<line class="mk-cross mk-hxc" x1="-99" x2="-99" y1="' + top + '" y2="' + bottom + '"/><circle class="mk-dot mk-hxd" cx="-99" cy="-99" r="' + r + '" style="fill:' + col(c) + '"/>' +
    '<rect class="mk-hit mk-hx" x="' + Math.max(0, x0 - 6).toFixed(1) + '" y="' + top + '" width="' + (x1 - x0 + 12).toFixed(1) + '" height="' + (bottom - top) + '" fill="transparent" data-x0="' + x0.toFixed(1) + '" data-x1="' + x1.toFixed(1) + '" data-py="' + ys.map(y => Number.isFinite(y) ? y.toFixed(1) : '').join(',') + '" data-tipx="' + esc(tips.join('\u001f')) + '"/>';
  function bars({ rows, keys, W = 520, H = 180, fmt = fmtN, pinKey = null, pin = null, off = 0, aria = '', padL = null, ck = '' }) {
    if (!rows?.length) return '';
    W = Math.round(W); H = Math.round(H);
    const padT = 8, padB = 24, tot = r => keys.reduce((a, k) => a + Math.max(0, r.v[k.k] || 0), 0), top = nice(Math.max(1, ...rows.map(tot)));
    const ax = yAxis({ W, H, top, padL, padT, padB, fmt }); padL = ax.padL;
    const plotH = H - padT - padB, bw = (W - padL - 6) / rows.length, w = Math.max(2, Math.min(44, bw * (rows.length > 20 ? .82 : .62)));
    const shown = thin(rows.map((r, i) => r.tick ? { i, x: padL + 6 + i * bw + bw / 2, t: r.tick } : null).filter(Boolean));
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(aria) + '"' + ckA(ck) + '>' + ax.html + rows.map((r, i) => {
      const x = padL + 6 + i * bw + (bw - w) / 2, key = pinKey ? pinKey + ':' + (i + off) : '', id = esc(r.id ?? i + off);
      let y = padT + plotH; const segs = keys.map((k, j) => { const h = Math.max(0, r.v[k.k] || 0) / top * plotH; y -= h; const last = keys.slice(j + 1).every(q => !(r.v[q.k] > 0));
        return h > 0 ? '<path class="m-bar" data-mk="' + esc(k.k) + '|' + id + '" d="' + (last ? bar(x, y, w, h) : 'M' + x.toFixed(1) + ',' + (y + h).toFixed(1) + 'h' + w.toFixed(1) + 'v' + (-h).toFixed(1) + 'h' + (-w).toFixed(1) + 'Z') + '" style="fill:' + col(k.c) + (r.faded ? ';fill-opacity:.38' : '') + '"/>' : ''; }).join('');
      return '<g class="mk-hit' + (pin && key === pin.k + ':' + pin.i ? ' on' : '') + '" tabindex="0"' + (key ? ' data-k="' + key + '"' : '') + ' data-tip="' + esc(r.tip || '') + '"><rect x="' + (padL + 6 + i * bw).toFixed(1) + '" y="' + padT + '" width="' + bw.toFixed(1) + '" height="' + plotH + '" fill="transparent"/>' + segs +
        (r.tick && shown.has(i) ? '<text class="mk-ax" x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(r.tick) + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }

  // lines over shared x positions: xs [label], series [{ label, c, dash, vals: [n|null] }]; hovering a column reads every
  // series at that x. tip(i) overrides the text; tick(i) labels the x axis (null for none); mark: index of "now"
  function lines({ xs, series, W = 560, H = 190, fmt = fmtN, tip = null, tick = null, aria = '', padL = null, zero = true, mark = null, ck = '' }) {
    const vals = series.flatMap(s => s.vals).filter(Number.isFinite); if (!vals.length || xs.length < 2) return '';
    W = Math.round(W); H = Math.round(H);
    let lo = Math.min(...vals), hi = Math.max(...vals), ticks = null; if (zero) lo = Math.min(0, lo); else { const pad = (hi - lo) * .08 || Math.abs(hi) * .05 || 1, pos = lo >= 0; lo -= pad; hi += pad; if (pos) lo = Math.max(0, lo);
      // round tick values (350,000 not 347,892): of the 1, 2, 2.5 or 5 steps giving 3 to 5 ticks, the one whose rounded
      // range is closest to the data's
      const r0 = hi - lo; let best = null;
      for (const d of [1.5, 2, 3, 4, 5]) { const st = niceStep(r0 / d), a = Math.floor(lo / st + 1e-9) * st, b = Math.ceil(hi / st - 1e-9) * st, n = Math.round((b - a) / st) + 1;
        if (n >= 3 && n <= 5 && (!best || b - a < best.b - best.a)) best = { st, a, b }; }
      if (best) { lo = pos ? Math.max(0, best.a) : best.a; hi = best.b; ticks = []; for (let t = lo; t <= hi + best.st / 2; t += best.st) ticks.push(+t.toPrecision(12)); } }
    const padT = 8, padB = 24, top = zero && lo >= 0 ? nice(hi) : hi, ax = yAxis({ W, H, top, lo, padL, padT, padB, fmt, ticks }); padL = ax.padL;
    const X = i => padL + 6 + i / (xs.length - 1) * (W - padL - 12), step = (W - padL - 12) / (xs.length - 1);
    const path = s => { let d = '', on = false; s.vals.forEach((v, i) => { if (!Number.isFinite(v)) { on = false; return; } d += (on ? 'L' : 'M') + X(i).toFixed(1) + ',' + ax.Y(v).toFixed(1); on = true; }); return d; };
    const lns = series.map(s => '<path class="m-line" data-mk="' + esc(s.id ?? s.label) + '" d="' + path(s) + '" fill="none" style="stroke:' + col(s.c) + '" stroke-width="' + (s.w || 2) + '" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="5 3"' : '') + '/>').join('');
    const tipOf = i => tip ? tip(i) : xs[i] + ': ' + series.filter(s => Number.isFinite(s.vals[i])).map(s => s.label + ' ' + fmt(s.vals[i])).join(' · ');
    const hits = series.length === 1 ? hx({ x0: X(0), x1: X(xs.length - 1), top: padT, bottom: H - padB, ys: series[0].vals.map(v => Number.isFinite(v) ? ax.Y(v) : NaN), tips: xs.map((x, i) => tipOf(i)), c: series[0].c }) : xs.map((x, i) => '<g class="mk-hit mk-col" data-tip="' + esc(tip ? tip(i) : x + ': ' + series.filter(s => Number.isFinite(s.vals[i])).map(s => s.label + ' ' + fmt(s.vals[i])).join(' · ')) + '">' +
      '<rect x="' + (X(i) - step / 2).toFixed(1) + '" y="' + padT + '" width="' + Math.max(1, step).toFixed(2) + '" height="' + (H - padT - padB) + '" fill="transparent"/><line class="mk-cross" x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '"/>' +
      series.filter(s => Number.isFinite(s.vals[i])).map(s => '<circle class="mk-dot" cx="' + X(i).toFixed(1) + '" cy="' + ax.Y(s.vals[i]).toFixed(1) + '" r="3.2" style="fill:' + col(s.c) + '"/>').join('') + '</g>').join('');
    const tl = xs.map((x, i) => { const t = tick ? tick(i) : null; return t ? { i, x: X(i), t, a: i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle' } : null; }).filter(Boolean), shown = thin(tl);
    const xticks = tl.filter(l => shown.has(l.i)).map(({ i, t }) => '<text class="mk-ax" x="' + X(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + (i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle') + '">' + esc(t) + '</text>').join('');
    const now = mark != null ? '<line class="mk-now" x1="' + X(mark).toFixed(1) + '" x2="' + X(mark).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '"/>' : '';
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(aria) + '"' + ckA(ck) + '>' + ax.html+ now + lns + xticks + hits + '</svg>';
  }

  // horizontal bars: [{ label, v, tip, k, c, sub }]
  function hbars(items, fmt = fmtN, pin = null, ck = '') {
    const max = Math.max(1, ...items.map(x => x.v || 0));
    return '<div class="mk-hbars"' + ckA(ck) + '>' + items.map(x => '<div class="mk-hb mk-hit' + (pin && x.k === pin.k + ':' + pin.i ? ' on' : '') + '" tabindex="0"' + (x.k ? ' data-k="' + esc(x.k) + '"' : '') + ' data-tip="' + esc(x.tip || '') + '"><span>' + esc(x.label) + (x.sub ? ' <small>' + esc(x.sub) + '</small>' : '') + '</span><i><b class="m-hbar" data-mk="' + esc(x.label) + '" style="width:' + ((x.v || 0) / max * 100).toFixed(1) + '%;background:' + col(x.c || 0) + '"></b></i><em>' + esc(fmt(x.v)) + '</em></div>').join('') + '</div>';
  }

  // sparkline with a hover readout per point: vals [n], tips [text]
  function spark(vals, { w = 96, h = 26, tips = [], c = 0, fill = true, ck = '' } = {}) {
    const v = vals.filter(Number.isFinite); if (v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), k = hi - lo || 1, X = i => (i / (vals.length - 1) * w), Y = x => h - 2 - (x - lo) / k * (h - 4), cw = w / (vals.length - 1);
    const pts = vals.map((x, i) => Number.isFinite(x) ? X(i).toFixed(1) + ',' + Y(x).toFixed(1) : null).filter(Boolean);
    return '<svg class="mk-spk" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="trend"' + ckA(ck) + '>' + (fill ? '<polygon class="m-area" data-mk="area" points="0,' + h + ' ' + pts.join(' ') + ' ' + w + ',' + h + '" style="fill:' + col(c) + ';fill-opacity:.1"/>' : '') +
      '<polyline class="m-line" data-mk="line" points="' + pts.join(' ') + '" fill="none" style="stroke:' + col(c) + '" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' +
      (tips.length ? hx({ x0: 0, x1: w, top: 0, bottom: h, ys: vals.map(x => Number.isFinite(x) ? Y(x) : NaN), tips: vals.map((x, i) => tips[i] || ''), c, r: 2.2 }) : '') + '</svg>';
  }

  // change badge: +12% (green up, red down; invert for costs and unemployment, where up is bad)
  const delta = (v, { unit = '%', invert = false, digits } = {}) => {
    if (!Number.isFinite(v)) return '';
    const d = digits ?? (Math.abs(v) >= 10 ? 0 : 1), good = invert ? v < 0 : v > 0, cls = Math.abs(v) < .05 ? 'mk-flat' : good ? 'mk-up' : 'mk-dn';
    return '<span class="mk-d ' + cls + '">' + (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '') + v.toFixed(d) + unit + '</span>';
  };
  // KPI tile: big number, label, a change badge and a sparkline under it (span: grid columns, so every row fills)
  const kpi = ({ v, label, sub = '', d = '', sp = '', tip = '', span = 0 }) => '<div class="mk-kpi' + (tip ? ' mk-hit' : '') + '"' + (span ? ' style="grid-column:span ' + span + '"' : '') + (tip ? ' tabindex="0" data-tip="' + esc(tip) + '"' : '') + '><span class="mk-kl">' + esc(label) + '</span><b>' + v + '</b><div class="mk-ks">' + d + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' + (sp ? '<div class="mk-kspk">' + sp + '</div>' : '') + '</div>';

  return { bars, lines, hbars, spark, delta, kpi, nice };
}
