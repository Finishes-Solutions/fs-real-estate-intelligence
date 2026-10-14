// Chart motion: one system for every chart in the app. Marks carry a class (m-bar, m-line, m-area, m-dot, m-hbar) and,
// where they can update in place, a data-mk key (series|period); a chart root carries data-ck (its identity).
//   reveal(el, key)          the entrance, once per chart identity per page session, when the chart first scrolls into view
//   revealAll(root)          reveal every [data-ck] chart under root (already-revealed ones are left alone)
//   morph(root, key, render) snapshot the marks, render (innerHTML), then tween the marks that stayed from old to new
//   count(el, to, fmt, from) a number ticking to its new value, screen readers get only the final one
//   finish(root)             jump every running animation under root to its end (exports, print)
// Everything uses the Web Animations API or rAF attribute writes that end exactly on what the render wrote, so nothing is
// left behind on the DOM (exports clone it) and string builders stay static. Reduced motion (read live) turns it all off.
// Safe to import in Node (reportkit.js is tested there): nothing touches window until a function is called.
export const DUR = { fast: 150, base: 220, reveal: 550 };
export const EASE = 'cubic-bezier(.2,.7,.2,1)';
const W = typeof window !== 'undefined' ? window : null;
let mq = null;
export const reduced = () => { if (!W?.matchMedia) return true; mq ||= W.matchMedia('(prefers-reduced-motion: reduce)'); return mq.matches; };
// the map's time-lapse is playing (its play button is on): numbers and charts then update instantly, every 850 ms
export const playing = () => !!W?.document?.getElementById('tPlay')?.classList.contains('on');
// the same curve as EASE, for rAF tweens (Newton on the bezier's x, then its y)
const bez = (x1, y1, x2, y2) => t => { let u = t; for (let i = 0; i < 6; i++) { const x = 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3 - t, dx = 3 * x1 * (1 - u) ** 2 + 6 * (x2 - x1) * u * (1 - u) + 3 * (1 - x2) * u * u; if (Math.abs(x) < 1e-5 || !dx) break; u -= x / dx; } u = Math.min(1, Math.max(0, u)); return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3; };
export const ease = bez(.2, .7, .2, 1);

const MARKS = '.m-bar,.m-line,.m-area,.m-dot,.m-hbar', STAGGER = 250, MANY = 150, TOTAL = DUR.reveal + STAGGER + 50;
const started = new Map();   // chart key -> when its reveal started (performance.now()); a key in here never replays
const pending = new Map();   // chart key -> { el, hides, stop } waiting to scroll into view
const tweens = new Set();    // running rAF tweens: { root, end() }
let io = null;

// ---------- reveal ----------
const shown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && (el.checkVisibility?.() ?? true); };
const marksIn = el => { const l = [...el.querySelectorAll(MARKS)]; if (el.matches?.(MARKS)) l.unshift(el); return l; };
const anim = (el, kf, o) => { try { return el.animate(kf, { duration: DUR.reveal, easing: EASE, fill: 'backwards', ...o }); } catch (e) { return null; } };
function play(el, t0 = 0) {
  const all = marksIn(el); if (!all.length) return;
  // one stagger per chart: the SVG a mark sits in, or the HTML list of bars
  const groups = new Map(); all.forEach(m => { const g = m.ownerSVGElement || m.parentElement?.parentElement?.parentElement || el; (groups.get(g) || groups.set(g, []).get(g)).push(m); });
  const run = [];
  for (const [g, ms] of groups) {
    if (ms.length > MANY) { run.push(anim(g instanceof SVGElement || g === el ? g : el, [{ opacity: 0 }, { opacity: 1 }], { duration: DUR.reveal * .7 })); continue; } // a plain fade for dense charts
    const box = m => { try { return m.getBBox(); } catch (e) { return { x: 0, y: 0, width: 0, height: 0 }; } };
    const svg = ms.filter(m => m instanceof SVGGraphicsElement), bb = new Map(svg.map(m => [m, box(m)]));
    // columns left to right: the stagger runs along x, stacked segments of one column move together
    const xs = [...new Set(svg.map(m => Math.round(bb.get(m).x)))].sort((a, b) => a - b), rank = new Map(xs.map((x, i) => [x, i]));
    const step = xs.length > 1 ? Math.min(40, STAGGER / (xs.length - 1)) : 0, lo = xs[0] ?? 0, span = (xs[xs.length - 1] ?? 0) - lo || 1;
    // bars grow from the zero line: the chart's data-base, else the bottom of its tallest bar (all bars start there)
    const bars = svg.filter(m => m.classList.contains('m-bar')), sv = bars[0]?.ownerSVGElement;
    const base = sv?.dataset.base != null ? +sv.dataset.base : Math.max(...bars.map(m => bb.get(m).y + bb.get(m).height));
    let hi = 0;
    ms.forEach(m => {
      const c = m.classList, b = bb.get(m);
      if (c.contains('m-bar')) { const o = '0px ' + base + 'px'; run.push(anim(m, [{ transform: 'scaleY(0)', transformOrigin: o }, { transform: 'scaleY(1)', transformOrigin: o }], { delay: rank.get(Math.round(b.x)) * step })); }
      else if (c.contains('m-hbar')) run.push(anim(m, [{ transform: 'scaleX(0)', transformOrigin: '0 50%' }, { transform: 'scaleX(1)', transformOrigin: '0 50%' }], { delay: Math.min(40, STAGGER / Math.max(1, ms.length - 1)) * hi++ }));
      else if (c.contains('m-dot')) run.push(anim(m, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: DUR.base * 1.4, delay: DUR.reveal * .8 * (b.x - lo) / span }));
      else if (c.contains('m-area')) run.push(anim(m, [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], { duration: DUR.reveal * 1.2 }));
      else if (c.contains('m-line')) {
        // draw the line along its length; dashed or non-scaling strokes (their dashes would be lost) wipe in instead
        const cs = getComputedStyle(m), plain = (cs.strokeDasharray === 'none' || !cs.strokeDasharray) && cs.vectorEffect !== 'non-scaling-stroke', L = plain && m.getTotalLength ? m.getTotalLength() : 0;
        run.push(L > 0 ? anim(m, [{ strokeDasharray: L + ' ' + L, strokeDashoffset: L }, { strokeDasharray: L + ' ' + L, strokeDashoffset: 0 }], { duration: DUR.reveal * 1.2 })
          : anim(m, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: DUR.reveal * 1.2 }));
      }
    });
  }
  if (t0) run.forEach(a => { if (a) a.currentTime = t0; });
}
// hold the marks hidden (a paused animation at its first frame: nothing on the DOM, finish() releases it) until visible
const hide = el => marksIn(el).map(m => { try { const a = m.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1 }); a.pause(); return a; } catch (e) { return null; } }).filter(Boolean);
function observe(key, el) {
  io ||= new IntersectionObserver(es => es.forEach(e => {
    const p = [...pending.values()].find(p => p.el === e.target); if (!p || !e.isIntersecting) return;
    if (e.intersectionRatio >= .2 || e.intersectionRect.height >= 48) p.go();
  }), { threshold: [0, .2, .5] });
  const p = { el, hides: hide(el), stop: () => { io.unobserve(el); p.hides.forEach(a => a.cancel()); pending.delete(key); },
    go: () => { p.stop(); started.set(key, performance.now()); play(el); } };
  pending.set(key, p); io.observe(el);
}
export function reveal(el, key) {
  if (!el || !W || !key) return;
  const old = pending.get(key); if (old) old.stop(); // the chart was re-rendered before it was seen: watch the new one
  if (started.has(key)) { const t = performance.now() - started.get(key); if (t < TOTAL && !reduced()) play(el, t); return; } // re-rendered mid-entrance: carry on, never replay
  if (reduced()) { started.set(key, -1e9); return; }
  if (el.isConnected && shown(el)) { started.set(key, performance.now()); play(el); } else observe(key, el);
}
export const revealAll = root => root?.querySelectorAll?.('[data-ck]').forEach(el => reveal(el, el.dataset.ck));
export const revealed = key => started.has(key);
// true the first time a key is asked for (charts that run their own entrance, e.g. the timeline's D3 chart)
export const once = key => { if (started.has(key)) return false; started.set(key, performance.now()); return true; };

// ---------- morph ----------
const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const ATTRS = { rect: ['x', 'y', 'width', 'height'], circle: ['cx', 'cy', 'r'], path: ['d'], polyline: ['points'], polygon: ['points'], line: ['x1', 'x2', 'y1', 'y2'] };
const charts = (root, key) => { const l = [...root.querySelectorAll('[data-ck]')]; if (root.dataset?.ck) l.unshift(root); return l.length ? l.map(el => [el, el.dataset.ck]) : key ? [[root, key]] : []; };
const read = m => { const t = m.tagName.toLowerCase(), a = ATTRS[t]; return a ? Object.fromEntries(a.map(k => [k, m.getAttribute(k)])) : { w: m.style.width }; };
function stopTweens(root) { for (const t of tweens) if (t.root === root || root.contains(t.root) || t.root.contains?.(root)) t.stop(); }
export function morph(root, key, render) {
  if (!root) return render();
  stopTweens(root); // a tween in flight stops where it is: the snapshot below starts from what is on screen now
  if (reduced() || playing() || !W) { render(); revealAll(root); return; }
  const snap = new Map(), was = new Set();
  for (const [ch, ck] of charts(root, key)) { was.add(ck); ch.querySelectorAll('[data-mk]').forEach(m => snap.set(ck + '\u0001' + m.dataset.mk, read(m))); }
  render();
  const items = [], fades = [];
  for (const [ch, ck] of charts(root, key)) {
    // not revealed yet, or still mid-entrance: the entrance plays (or carries on) instead
    if (!started.has(ck) || performance.now() - started.get(ck) < TOTAL) { reveal(ch, ck); continue; }
    if (!was.has(ck)) continue; // a chart that just appeared under a key already seen (e.g. a box shown again): static
    ch.querySelectorAll('[data-mk]').forEach(m => {
      const old = snap.get(ck + '\u0001' + m.dataset.mk); if (!old) { fades.push(m); return; }
      const now = read(m);
      for (const k in now) {
        const a = old[k], b = now[k]; if (a == null || b == null || a === b) continue;
        if (k === 'w') { const x = parseFloat(a), y = parseFloat(b); if (Number.isFinite(x) && Number.isFinite(y)) items.push({ m, k, f: t => m.style.width = (x + (y - x) * t).toFixed(2) + '%', end: b }); continue; }
        if (k === 'd' || k === 'points') {
          // same shape (same commands, same count of numbers): interpolate; otherwise the new one fades in quickly
          const same = a.replace(NUM, '#') === b.replace(NUM, '#'), I = same && W.d3?.interpolateString ? W.d3.interpolateString(a, b) : null;
          if (I) items.push({ m, k, f: t => m.setAttribute(k, I(t)), end: b }); else fades.push(m);
          continue;
        }
        const x = +a, y = +b; if (Number.isFinite(x) && Number.isFinite(y)) items.push({ m, k, f: t => m.setAttribute(k, +(x + (y - x) * t).toFixed(2)), end: b });
      }
    });
  }
  fades.forEach(m => { try { m.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.fast + 50, easing: 'ease-out' }); } catch (e) {} });
  if (!items.length) return;
  const D = 380, t0 = performance.now(); items.forEach(i => i.f(0));
  const tw = { root, raf: 0, stop: () => { cancelAnimationFrame(tw.raf); tweens.delete(tw); }, end: () => { tw.stop(); items.forEach(i => i.k === 'w' ? i.m.style.width = i.end : i.m.setAttribute(i.k, i.end)); } };
  const tick = now => { const k = Math.min(1, (now - t0) / D); if (k >= 1 || !root.isConnected) { tw.end(); return; } const e = ease(k); items.forEach(i => i.f(e)); tw.raf = requestAnimationFrame(tick); };
  tweens.add(tw); tw.raf = requestAnimationFrame(tick);
}
// render with no animation (a resize): running tweens end first, charts not yet seen still reveal later
export function instant(root, render) {
  if (!root) return render();
  for (const t of [...tweens]) if (root.contains(t.root)) t.end();
  for (const [, ck] of charts(root)) if (started.has(ck) && performance.now() - started.get(ck) < TOTAL) started.set(ck, -1e9); // an entrance in progress ends
  render(); revealAll(root);
}

// ---------- count ----------
const values = new WeakMap(), busy = new WeakMap();
const hold = (live, d) => { if (!live) return; const n = Math.max(0, (busy.get(live) || 0) + d); busy.set(live, n); if (n) live.setAttribute('aria-busy', 'true'); else live.removeAttribute('aria-busy'); };
// the value a number is showing right now (mid-count too), so a new count starts from it
export const current = el => values.get(el);
export function count(el, to, fmt, from) {
  if (!el) return; const set = v => { el.textContent = fmt(v); values.set(el, v); };
  if (!W || reduced() || playing() || !Number.isFinite(+from) || !Number.isFinite(+to) || +from === +to) { set(to); return; }
  from = +from; to = +to; const live = el.closest('[aria-live]'), t0 = performance.now(), D = 300;
  hold(live, 1); set(from);
  const tw = { root: el, raf: 0, stop: () => { if (!tweens.delete(tw)) return; cancelAnimationFrame(tw.raf); hold(live, -1); }, end: () => { tw.stop(); set(to); } };
  const tick = now => { const k = Math.min(1, (now - t0) / D); if (k >= 1 || !el.isConnected) { tw.end(); return; } set(from + (to - from) * ease(k)); tw.raf = requestAnimationFrame(tick); };
  tweens.add(tw); tw.raf = requestAnimationFrame(tick);
}

// ---------- finish ----------
export function finish(root) {
  if (!root || !W) return;
  for (const [key, p] of pending) if (root.contains(p.el)) { p.stop(); started.set(key, -1e9); } // exported unseen: counts as seen
  for (const t of [...tweens]) if (root.contains(t.root)) t.end();
  (root.getAnimations?.({ subtree: true }) || []).forEach(a => { try { a.finish(); } catch (e) {} }); // endless ones (a spinner) can't finish
}
// printing the page: everything at its final state
if (W) W.addEventListener?.('beforeprint', () => finish(W.document.documentElement));
