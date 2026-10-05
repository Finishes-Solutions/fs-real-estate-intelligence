// Chart kit for the Market tab (src/area.js): inline SVG strings with one look and one hover model. Every mark that has
// numbers is a .mk-hit with a data-tip (area.js shows it in #mkTip on hover or focus); a data-k makes it clickable (pin).
// Colours are CSS variables with light fallbacks, so the same SVG works in dark mode and in the exported PDF.
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const PAL = ['#006527', '#2a78d6', '#c26a00', '#7c3aed', '#8a9396', '#0e7c86', '#b3261e'];
export const col = i => 'var(--mk-c' + i + ',' + PAL[i] + ')';
export const mlabel = m => MON[+String(m).slice(5, 7) - 1] + ' ' + String(m).slice(0, 4);

export function mkCharts({ esc, fmtN }) {
  const nice = v => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p; };
  // a rounded-top bar on a flat baseline
  const bar = (x, y, w, h, r = 3) => { if (!(h > 0)) return ''; r = Math.min(r, w / 2, h); return 'M' + x.toFixed(1) + ',' + (y + h).toFixed(1) + 'V' + (y + r).toFixed(1) + 'Q' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ',' + y.toFixed(1) + 'H' + (x + w - r).toFixed(1) + 'Q' + (x + w).toFixed(1) + ',' + y.toFixed(1) + ' ' + (x + w).toFixed(1) + ',' + (y + r).toFixed(1) + 'V' + (y + h).toFixed(1) + 'Z'; };
  // y axis with gridlines; lo can be below zero (rates, changes)
  function yAxis({ W, H, top, lo = 0, padL, padT, padB, fmt }) {
    const span = top - lo || 1, Y = v => padT + (H - padT - padB) * (1 - (v - lo) / span), ticks = [lo, lo + span / 2, top];
    return { Y, html: ticks.map(t => '<line class="mk-grid" x1="' + padL + '" x2="' + W + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/><text class="mk-ax" x="' + (padL - 6) + '" y="' + (Y(t) + 3).toFixed(1) + '" text-anchor="end">' + esc(fmt(t)) + '</text>').join('') };
  }

  // bars (stacked when several keys): rows [{ label, v: { key: n }, tip, faded, tick }], keys [{ k, label, c }] (c = palette index)
  // pinKey/pin: clicking a bar pins it (data-k "pinKey:index"); off shifts the index (a monthly chart showing its last N rows)
  function bars({ rows, keys, W = 520, H = 180, fmt = fmtN, pinKey = null, pin = null, off = 0, aria = '', padL = 48 }) {
    if (!rows?.length) return '';
    const padT = 8, padB = 22, tot = r => keys.reduce((a, k) => a + Math.max(0, r.v[k.k] || 0), 0), top = nice(Math.max(1, ...rows.map(tot)));
    const ax = yAxis({ W, H, top, padL, padT, padB, fmt }), plotH = H - padT - padB, bw = (W - padL - 6) / rows.length, w = Math.max(2, Math.min(44, bw * (rows.length > 20 ? .82 : .62)));
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">' + ax.html + rows.map((r, i) => {
      const x = padL + 6 + i * bw + (bw - w) / 2, key = pinKey ? pinKey + ':' + (i + off) : '';
      let y = padT + plotH; const segs = keys.map((k, j) => { const h = Math.max(0, r.v[k.k] || 0) / top * plotH; y -= h; const last = keys.slice(j + 1).every(q => !(r.v[q.k] > 0));
        return h > 0 ? '<path d="' + (last ? bar(x, y, w, h) : 'M' + x.toFixed(1) + ',' + (y + h).toFixed(1) + 'h' + w.toFixed(1) + 'v' + (-h).toFixed(1) + 'h' + (-w).toFixed(1) + 'Z') + '" style="fill:' + col(k.c) + (r.faded ? ';fill-opacity:.38' : '') + '"/>' : ''; }).join('');
      return '<g class="mk-hit' + (pin && key === pin.k + ':' + pin.i ? ' on' : '') + '" tabindex="0"' + (key ? ' data-k="' + key + '"' : '') + ' data-tip="' + esc(r.tip || '') + '"><rect x="' + (padL + 6 + i * bw).toFixed(1) + '" y="' + padT + '" width="' + bw.toFixed(1) + '" height="' + plotH + '" fill="transparent"/>' + segs +
        (r.tick ? '<text class="mk-ax" x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(r.tick) + '</text>' : '') + '</g>';
    }).join('') + '</svg>';
  }

  // lines over shared x positions: xs [label], series [{ label, c, dash, vals: [n|null] }]; hovering a column reads every
  // series at that x. tip(i) overrides the text; tick(i) labels the x axis (null for none); mark: index of "now"
  function lines({ xs, series, W = 560, H = 190, fmt = fmtN, tip = null, tick = null, aria = '', padL = 48, zero = true, mark = null }) {
    const vals = series.flatMap(s => s.vals).filter(Number.isFinite); if (!vals.length || xs.length < 2) return '';
    let lo = Math.min(...vals), hi = Math.max(...vals); if (zero) lo = Math.min(0, lo); else { const pad = (hi - lo) * .08 || Math.abs(hi) * .05 || 1, pos = lo >= 0; lo -= pad; hi += pad; if (pos) lo = Math.max(0, lo); }
    const padT = 8, padB = 22, top = zero && lo >= 0 ? nice(hi) : hi, ax = yAxis({ W, H, top, lo, padL, padT, padB, fmt });
    const X = i => padL + 6 + i / (xs.length - 1) * (W - padL - 12), step = (W - padL - 12) / (xs.length - 1);
    const path = s => { let d = '', on = false; s.vals.forEach((v, i) => { if (!Number.isFinite(v)) { on = false; return; } d += (on ? 'L' : 'M') + X(i).toFixed(1) + ',' + ax.Y(v).toFixed(1); on = true; }); return d; };
    const lns = series.map(s => '<path d="' + path(s) + '" fill="none" style="stroke:' + col(s.c) + '" stroke-width="' + (s.w || 2) + '" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="5 3"' : '') + '/>').join('');
    const hits = xs.map((x, i) => '<g class="mk-hit mk-col" data-tip="' + esc(tip ? tip(i) : x + ': ' + series.filter(s => Number.isFinite(s.vals[i])).map(s => s.label + ' ' + fmt(s.vals[i])).join(' · ')) + '">' +
      '<rect x="' + (X(i) - step / 2).toFixed(1) + '" y="' + padT + '" width="' + Math.max(1, step).toFixed(2) + '" height="' + (H - padT - padB) + '" fill="transparent"/><line class="mk-cross" x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '"/>' +
      series.filter(s => Number.isFinite(s.vals[i])).map(s => '<circle class="mk-dot" cx="' + X(i).toFixed(1) + '" cy="' + ax.Y(s.vals[i]).toFixed(1) + '" r="3.2" style="fill:' + col(s.c) + '"/>').join('') + '</g>').join('');
    const ticks = xs.map((x, i) => { const t = tick ? tick(i) : null; return t ? '<text class="mk-ax" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle') + '">' + esc(t) + '</text>' : ''; }).join('');
    const now = mark != null ? '<line class="mk-now" x1="' + X(mark).toFixed(1) + '" x2="' + X(mark).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '"/>' : '';
    return '<svg class="mk-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">' + ax.html + now + lns + ticks + hits + '</svg>';
  }

  // horizontal bars: [{ label, v, tip, k, c, sub }]
  function hbars(items, fmt = fmtN, pin = null) {
    const max = Math.max(1, ...items.map(x => x.v || 0));
    return '<div class="mk-hbars">' + items.map(x => '<div class="mk-hb mk-hit' + (pin && x.k === pin.k + ':' + pin.i ? ' on' : '') + '" tabindex="0"' + (x.k ? ' data-k="' + esc(x.k) + '"' : '') + ' data-tip="' + esc(x.tip || '') + '"><span>' + esc(x.label) + (x.sub ? ' <small>' + esc(x.sub) + '</small>' : '') + '</span><i><b style="width:' + ((x.v || 0) / max * 100).toFixed(1) + '%;background:' + col(x.c || 0) + '"></b></i><em>' + esc(fmt(x.v)) + '</em></div>').join('') + '</div>';
  }

  // sparkline with a hover readout per point: vals [n], tips [text]
  function spark(vals, { w = 96, h = 26, tips = [], c = 0, fill = true } = {}) {
    const v = vals.filter(Number.isFinite); if (v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), k = hi - lo || 1, X = i => (i / (vals.length - 1) * w), Y = x => h - 2 - (x - lo) / k * (h - 4), cw = w / (vals.length - 1);
    const pts = vals.map((x, i) => Number.isFinite(x) ? X(i).toFixed(1) + ',' + Y(x).toFixed(1) : null).filter(Boolean);
    return '<svg class="mk-spk" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="trend">' + (fill ? '<polygon points="0,' + h + ' ' + pts.join(' ') + ' ' + w + ',' + h + '" style="fill:' + col(c) + ';fill-opacity:.1"/>' : '') +
      '<polyline points="' + pts.join(' ') + '" fill="none" style="stroke:' + col(c) + '" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' +
      (tips.length ? vals.map((x, i) => Number.isFinite(x) ? '<g class="mk-hit mk-col" data-tip="' + esc(tips[i] || '') + '"><rect x="' + (X(i) - cw / 2).toFixed(2) + '" y="0" width="' + cw.toFixed(2) + '" height="' + h + '" fill="transparent"/><circle class="mk-dot" cx="' + X(i).toFixed(1) + '" cy="' + Y(x).toFixed(1) + '" r="2.2" style="fill:' + col(c) + '"/></g>' : '').join('') : '') + '</svg>';
  }

  // change badge: +12% (green up, red down; invert for costs and unemployment, where up is bad)
  const delta = (v, { unit = '%', invert = false, digits } = {}) => {
    if (!Number.isFinite(v)) return '';
    const d = digits ?? (Math.abs(v) >= 10 ? 0 : 1), good = invert ? v < 0 : v > 0, cls = Math.abs(v) < .05 ? 'mk-flat' : good ? 'mk-up' : 'mk-dn';
    return '<span class="mk-d ' + cls + '">' + (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '') + v.toFixed(d) + unit + '</span>';
  };
  // KPI tile: big number, label, a change badge and a sparkline under it
  const kpi = ({ v, label, sub = '', d = '', sp = '', tip = '' }) => '<div class="mk-kpi' + (tip ? ' mk-hit' : '') + '"' + (tip ? ' tabindex="0" data-tip="' + esc(tip) + '"' : '') + '><span class="mk-kl">' + esc(label) + '</span><b>' + v + '</b><div class="mk-ks">' + d + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' + (sp ? '<div class="mk-kspk">' + sp + '</div>' : '') + '</div>';

  return { bars, lines, hbars, spark, delta, kpi, nice };
}
