// Motion for the Market tab's charts (src/mkcharts.js), with D3 transitions. The tab rebuilds its HTML on every change
// (county, months shown, a pinned bar, data arriving), so area.js takes a snapshot() of the marks just before it replaces
// them and animate() plays the difference after: marks that were there morph from their old shape, length or number;
// new ones grow up from the baseline (and numbers count up) when they first scroll into view. settle() jumps everything
// to its end state, so a PDF export never captures a chart half drawn. Nothing moves when the user prefers reduced motion.
//   data-mka on a mark: bar | line | area | dot (an SVG path: its d morphs), hb (a horizontal bar: width %), num (text)
//   data-mk: the mark's key inside its chart; the chart is found from its box's title and its data-mkc (or its place in
//   the box), so area.js call sites need nothing
const DUR = 700;
let live = new Set(), observers = [], waiting = new WeakSet();

// ---------- pure helpers (tested in test/mkmotion.mjs) ----------
// the path with every y coordinate moved to y: the same commands, so it morphs into the real one (a bar or line rising)
export function flatten(d, y) {
  return String(d).replace(/([MLCQHVZ])([^MLCQHVZ]*)/gi, (m, c, nums) => {
    const C = c.toUpperCase(); if (C === 'Z' || C === 'H') return m; if (C === 'V') return c + y;
    return c + nums.split(/[ ,]/).map((n, i) => n === '' ? n : i % 2 ? String(y) : n).join(',');
  });
}
const NUM = /\d[\d,]*(?:\.\d+)?/g;
const fmtNum = (v, dec, grp) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: grp });
// a tween between two labels that differ only in their numbers ("$1,250" → "$1,900", "4.1%" → "3.8%"); null otherwise.
// In-between values keep the target's decimals and thousands commas.
export function textTween(a, b) {
  if (a == null || b == null || a === b || a.replace(NUM, '#') !== b.replace(NUM, '#')) return null;
  const na = a.match(NUM) || [], nb = b.match(NUM) || [], parts = b.split(NUM), val = s => +s.replace(/,/g, '');
  if (!nb.length) return null;
  const spec = nb.map((s, i) => ({ a: val(na[i]), b: val(s), dec: (s.split('.')[1] || '').length, grp: s.includes(',') || na[i].includes(',') }));
  return t => t >= 1 ? b : parts.map((p, i) => p + (i < spec.length ? fmtNum(spec[i].a + (spec[i].b - spec[i].a) * t, spec[i].dec, spec[i].grp) : '')).join('');
}
// the same label with every number at zero ("$1,250" → "$0"), to count up from
export const zeroText = b => b.replace(NUM, s => fmtNum(0, (s.split('.')[1] || '').length, false));
const shape = d => String(d).replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g, '#');

// ---------- marks and their keys ----------
function keyer() {
  const seen = new Map();
  return el => {
    const chart = el.closest('[data-mkc], svg, .mk-hbars, .mk-kpi'), box = chart?.closest('.mk-kpi, .mk-sm, .mk-box'); if (!box) return null;
    let id = seen.get(chart);
    if (id == null) { const title = box.querySelector('h3, .mk-kl, .mk-smh span')?.textContent || '';
      id = title + '#' + (chart.dataset.mkc ?? [...box.querySelectorAll('svg.mk-svg, svg.mk-spk, .mk-hbars')].indexOf(chart)); seen.set(chart, id); }
    return id + '|' + el.dataset.mka + ':' + el.dataset.mk;
  };
}
const textNode = el => el.firstChild?.nodeType === 3 ? el.firstChild : null;
function read(el) {
  const k = el.dataset.mka;
  return k === 'hb' ? parseFloat(el.style.width) || 0 : k === 'num' ? textNode(el)?.nodeValue ?? null : el.getAttribute('d');
}

export function snapshot(root) {
  const m = new Map(), d3 = globalThis.d3; if (!d3 || !root) return m;
  const key = keyer();
  root.querySelectorAll('[data-mka]').forEach(el => { if (waiting.has(el)) return; const k = key(el); if (k) m.set(k, read(el)); });
  stop();
  return m;
}
function stop() { const d3 = globalThis.d3; live.forEach(a => d3?.select(a.el).interrupt('mk')); live = new Set(); observers.forEach(o => o.disconnect()); observers = []; }

// jump every running or waiting animation to its end state
export function settle() { const list = [...live]; stop(); list.forEach(a => a.finish()); }

export function animate(root, prev, { reduce = false } = {}) {
  const d3 = globalThis.d3; if (reduce || !d3 || !root || !prev) return;
  const key = keyer(), now = [], later = new Map(), order = new Map();
  for (const el of root.querySelectorAll('[data-mka]')) {
    const k = key(el); if (!k) continue;
    const kind = el.dataset.mka, had = prev.has(k), from = prev.get(k), chart = el.closest('[data-mkc], svg, .mk-hbars, .mk-kpi');
    const n = order.get(chart) || 0; order.set(chart, n + 1);
    let a = null;
    if (kind === 'hb') {
      const to = el.style.width, w0 = had ? from : 0; if (Math.abs(w0 - parseFloat(to)) < .05) continue;
      a = { el, init: () => { el.style.width = w0 + '%'; }, tween: t => t.styleTween('width', () => d3.interpolateString(w0 + '%', to)), finish: () => { el.style.width = to; } };
    } else if (kind === 'num') {
      const tn = textNode(el); if (!tn) continue; const to = tn.nodeValue, tw = textTween(had ? from : zeroText(to), to); if (!tw) continue;
      a = { el, init: () => { tn.nodeValue = tw(0); }, tween: t => t.tween('num', () => s => { tn.nodeValue = tw(s); }), finish: () => { tn.nodeValue = to; } };
    } else {
      const to = el.getAttribute('d'), svg = el.ownerSVGElement, base = +(svg?.dataset.base ?? svg?.viewBox.baseVal.height ?? 0);
      const d0 = had && from && shape(from) === shape(to) ? from : flatten(to, base); if (d0 === to) continue;
      const ip = d3.interpolateString(d0, to);
      a = { el, init: () => el.setAttribute('d', d0), tween: t => t.attrTween('d', () => ip), finish: () => el.setAttribute('d', to) };
    }
    a.delay = kind === 'bar' ? Math.min(300, n * 12) : kind === 'dot' && !had ? DUR * .6 : 0;
    a.init(); live.add(a);
    if (had) now.push(a); else { waiting.add(el); if (!later.has(chart)) later.set(chart, []); later.get(chart).push(a); }
  }
  const start = a => { waiting.delete(a.el); const t = d3.select(a.el).transition('mk').delay(a.delay).duration(DUR).ease(d3.easeCubicOut);
    a.tween(t); t.on('end', () => { a.finish(); live.delete(a); }); };
  now.forEach(start);
  if (!later.size) return;
  // new charts start when they scroll into view (the page is long); browsers without the observer just start them
  if (!window.IntersectionObserver) { later.forEach(list => list.forEach(start)); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); (later.get(e.target) || []).forEach(start); }), { threshold: .15 });
  later.forEach((list, chart) => io.observe(chart)); observers.push(io);
}
