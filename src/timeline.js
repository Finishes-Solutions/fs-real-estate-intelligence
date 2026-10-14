// Timeline view: monthly pipeline chart (value or count of projects under construction, stacked) + virtualized Gantt.
// Both render from ctx.visible, so they always agree with the map, list and exports.
import { USES } from './lib/taxonomy.mjs';
import { DUR, EASE, once, reduced, playing } from './motion.js';

// categorical slots (fixed order; validated palette from the dataviz reference)
const CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];
const OTHER = '#a3a8aa';
const RH = 34, HH = 30;
// the name column: 290px, 150px on narrow screens, and at least 45% of the width on phones
const labelW = () => window.innerWidth <= 700 ? Math.max(150, Math.round((window.innerWidth - 30) * .45)) : window.innerWidth <= 860 ? 150 : 290;

export function initTimeline(ctx) {
  const { F, COUNTIES, TYPES, TYPE_LABEL, fmtM, fmtN, esc } = ctx;
  const root = document.getElementById('view-timeline');
  const opt = { group: 'type', measure: 'value', sort: 'start' };
  try { Object.assign(opt, JSON.parse(localStorage.getItem('fs-tl') || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem('fs-tl', JSON.stringify(opt)); } catch (e) {} };

  // fixed entity order per dimension so colors follow the entity, never its rank
  const useCount = {}; F.forEach(f => { if (f.use) useCount[f.use] = (useCount[f.use] || 0) + 1; });
  const topUses = USES.filter(u => useCount[u]).sort((a, b) => useCount[b] - useCount[a]).slice(0, 7);
  const USE_ORDER = USES.filter(u => topUses.includes(u));
  const keyOf = { type: f => f.type, county: f => f.county, use: f => (f.use && USE_ORDER.includes(f.use)) ? f.use : 'Other' };
  const orderOf = { type: TYPES, county: COUNTIES.slice(0, 7), use: USE_ORDER };
  const labelOf = (g, k) => g === 'type' ? (TYPE_LABEL[k] || k) : k;
  function colorOf(g, k) {
    if (g === 'type') { const c = ctx.C(); return k === 'New' ? c.new : k === 'Reno' ? c.reno : c.add; }
    const i = orderOf[g].indexOf(k); return i >= 0 && i < 7 ? CAT[i] : OTHER;
  }
  const groupsFor = (g, list) => { const present = new Set(list.map(keyOf[g])); return [...orderOf[g], 'Other'].filter(k => present.has(k)); };

  root.innerHTML = `
    <div class="vhead">
      <div><div class="kicker">Timeline</div><h2 id="tlTitle">Projects under construction</h2><div class="vsub" id="tlSub"></div></div>
      <div class="vctl">
        <label>Group by <select class="chip" id="tlGroup"><option value="type">Type</option><option value="county">County</option>${USE_ORDER.length ? '<option value="use">Use</option>' : ''}</select></label>
        <label>Measure <select class="chip" id="tlMeasure"><option value="value">Est. value</option><option value="count">Projects</option></select></label>
        <label>Sort <select class="chip" id="tlSort"><option value="start">Start date</option><option value="value">Value</option></select></label>
        ${ctx.exportMenu?.([{ label: 'Filing list · Excel', attrs: ' data-x="xlsx"' }, { label: 'Filing list · CSV', attrs: ' data-x="csv"' }, { label: 'Filing list · PDF', attrs: ' data-x="pdf"' }]) || ''}
      </div>
    </div>
    <div id="tlScope"></div>
    <div class="tl-legend" id="tlLegend"></div>
    <div class="tl-chart" id="tlChart"><div class="tl-tip" id="tlTip"></div></div>
    <div class="tl-note"><span id="tlRange"></span><span id="tlHelp">Drag across the chart to see what's under construction in a range, or tap a month. Hatched bars use dates we estimated because the filer left them blank.</span></div>
    <div class="gantt" id="gantt"><div class="g-axis" id="gAxis"></div><div class="g-scroll" id="gScroll"><div class="g-inner" id="gInner"></div></div></div>`;
  const $ = id => root.querySelector('#' + id);
  root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ctx.openExport?.('list', { format: b.dataset.x }));
  for (const [id, k] of [['tlGroup', 'group'], ['tlMeasure', 'measure'], ['tlSort', 'sort']]) { const el = $(id); el.value = opt[k]; el.onchange = () => { opt[k] = el.value; save(); render(); }; }

  const mStart = m => new Date(m + '-01T00:00:00Z');
  let x = null, rows = [], months = [];

  function domainMonths(list) {
    const start = ctx.DATA.period.start.slice(0, 7), cap = new Date(Date.now() + 3 * 365 * 864e5).toISOString().slice(0, 7);
    let end = list.reduce((m, f) => f.te > m ? f.te : m, '').slice(0, 7) || new Date().toISOString().slice(0, 7);
    if (end > cap) end = cap; if (end < start) end = start;
    const out = []; for (let d = mStart(start); d.toISOString().slice(0, 7) <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) out.push(d.toISOString().slice(0, 7));
    return out;
  }

  let prevD = null, G = null, cur = null, byBrush = false;
  function clearRange() { const d = prevD && prevD.f !== 'active' ? prevD : ctx.periodSpec('12m'); prevD = null; ctx.fromSpec({ ...ctx.curSpec(), d }, { fly: false }); }
  // The chart is built once (and again only when its width changes) and updated with keyed joins: a layer per series, a bar
  // per series and month. Changes (group, measure, filters) tween bars and axes (src/motion.js timings); the brush keeps its
  // instance and selection. Instant instead while the time-lapse plays, when the brush itself caused the render, under
  // reduced motion and on resize. The first build grows the bars from the baseline, once per session.
  const H = 210, m = { t: 10, r: 14, b: 24, l: 58 }, mo7 = d => d.toISOString().slice(0, 7);
  function build(el, W) {
    el.querySelector('svg')?.remove();
    const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img');
    const g = { W, svg, grid: svg.append('g').attr('class', 'grid'), yax: svg.append('g').attr('class', 'yax'), bars: svg.append('g').attr('class', 'tl-bars'), xax: svg.append('g').attr('class', 'xax'),
      today: svg.append('line').attr('class', 'today').style('display', 'none'), y: null, hov: null };
    const tip = $('tlTip');
    const hover = mo => { if (mo === g.hov) return; g.hov = mo; g.bars.selectAll('rect').classed('hov', d => d.mo === mo); };
    // hover: nearest month column under the pointer (works through the brush overlay); reads the current render's numbers
    svg.on('pointermove', ev => {
      if (ev.pointerType && ev.pointerType !== 'mouse') return; const c = cur; if (!c) return;
      const [px] = d3.pointer(ev); if (px < m.l || px > W - m.r) { tip.style.opacity = 0; hover(null); return; }
      const mo = mo7(d3.utcMonth.floor(x.invert(px))), i = months.indexOf(mo); if (i < 0) return; hover(mo);
      const r = c.rowsM[i], tot = c.groups.reduce((s, k) => s + r[k], 0);
      tip.innerHTML = '<b>' + esc(d3.utcFormat('%B %Y')(mStart(mo))) + '</b><span>' + c.fmtY(tot) + ' total</span>' + c.groups.slice().reverse().filter(k => r[k]).map(k => '<div><i style="background:' + colorOf(opt.group, k) + '"></i>' + esc(labelOf(opt.group, k)) + '<em>' + c.fmtY(r[k]) + '</em></div>').join('');
      const left = x(mStart(mo)) + c.bw + 10; tip.style.opacity = 1; tip.style.left = (left + tip.offsetWidth > W ? x(mStart(mo)) - tip.offsetWidth - 10 : left) + 'px'; tip.style.top = '8px';
    }).on('pointerleave', () => { tip.style.opacity = 0; hover(null); });
    // brush -> "under construction during" filter. Snaps to whole months while dragging, shows the range live,
    // stays on the chart afterwards so its edges can be adjusted; a tap without dragging picks a single month.
    const fmtMo = d3.utcFormat('%b %Y');
    const snap = ([a, b]) => { const s0 = d3.utcMonth.floor(x.invert(a)), e0 = d3.utcMonth.ceil(x.invert(b)); return [s0, e0 > s0 ? e0 : d3.utcMonth.offset(s0, 1)]; };
    const lab = svg.append('g').attr('class', 'blabel').style('display', 'none'); lab.append('rect').attr('rx', 3).attr('height', 18).attr('y', m.t - 2); lab.append('text').attr('y', m.t + 11);
    g.showLab = (s0, e0) => { const t = fmtMo(s0) + (d3.utcMonth.offset(s0, 1) < e0 ? ' – ' + fmtMo(d3.utcMonth.offset(e0, -1)) : ''); lab.style('display', null).select('text').text(t);
      const w = t.length * 6.4 + 14, cx = Math.max(m.l + w / 2, Math.min(W - m.r - w / 2, (x(s0) + x(e0)) / 2)); lab.select('rect').attr('x', cx - w / 2).attr('width', w); lab.select('text').attr('x', cx); };
    g.hideLab = () => lab.style('display', 'none');
    const apply = (s0, e0) => {
      if (!(ctx.state.d && ctx.state.d.f === 'active')) prevD = ctx.state.d;
      byBrush = true; ctx.showFilings?.(); ctx.fromSpec({ ...ctx.curSpec(), d: { f: 'active', from: mo7(s0), to: mo7(d3.utcMonth.offset(e0, -1)) } }, { fly: false });
    };
    g.brush = d3.brushX().extent([[m.l, m.t], [W - m.r, H - m.b]])
      .on('start', () => { tip.style.opacity = 0; })
      .on('brush', function (ev) { if (!ev.sourceEvent || !ev.selection) return; const [s0, e0] = snap(ev.selection); g.showLab(s0, e0); })
      .on('end', function (ev) {
        if (!ev.sourceEvent) return;
        if (!ev.selection) { // tap: one month, or clear when tapping the month already selected
          const [px] = d3.pointer(ev.sourceEvent, svg.node()); if (px < m.l || px > W - m.r) return;
          const s0 = d3.utcMonth.floor(x.invert(px)), c = ctx.state.d;
          if (c && c.f === 'active' && c.from === mo7(s0) && c.to === mo7(s0)) { byBrush = true; clearRange(); return; }
          apply(s0, d3.utcMonth.offset(s0, 1)); return;
        }
        const [s0, e0] = snap(ev.selection); apply(s0, e0);
      });
    g.bg = svg.append('g').attr('class', 'brush').call(g.brush); g.bg.select('.overlay').style('cursor', 'var(--cur-cross, crosshair)');
    lab.raise();
    el.prepend(svg.node());
    return g;
  }
  function renderChart(list, groups) {
    const active = ctx.state.d && ctx.state.d.f === 'active' ? [ctx.state.d.from || months[0], ctx.state.d.to || months[months.length - 1]] : null;
    const el = $('tlChart'), W = el.clientWidth;
    const idx = new Map(months.map((mo, i) => [mo, i]));
    const rowsM = months.map(mo => Object.fromEntries([['m', mo], ...groups.map(g => [g, 0])]));
    for (const f of list) {
      const a = idx.get(f.ts.slice(0, 7)) ?? (f.ts.slice(0, 7) < months[0] ? 0 : null), b = idx.get(f.te.slice(0, 7)) ?? (f.te.slice(0, 7) > months[months.length - 1] ? months.length - 1 : null);
      if (a == null || b == null) continue; const k = keyOf[opt.group](f), v = opt.measure === 'value' ? f.cost : 1;
      for (let i = a; i <= b; i++) rowsM[i][k] += v;
    }
    const stack = d3.stack().keys(groups)(rowsM), ymax = d3.max(stack.length ? stack[stack.length - 1] : [[0, 0]], d => d[1]) || 1;
    x = d3.scaleUtc().domain([mStart(months[0]), d3.utcMonth.offset(mStart(months[months.length - 1]), 1)]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, ymax]).nice(4).range([H - m.b, m.t]);
    const fmtY = opt.measure === 'value' ? fmtM : fmtN;
    const fresh = !G || G.W !== W || !G.svg.node().isConnected, first = fresh && !G;
    const quick = fresh || byBrush || reduced() || playing(); byBrush = false;
    if (fresh) G = build(el, W);
    const bw = Math.max(1, (x(mStart(months[1] || months[0])) - x(mStart(months[0]))) || 8), gap = bw > 6 ? 2 : 0, y0 = G.y || y;
    cur = { rowsM, groups, fmtY, bw };
    G.svg.attr('aria-label', (opt.measure === 'value' ? 'Estimated value' : 'Number') + ' of projects under construction by month');
    const tr = quick ? null : d3.transition().duration(DUR.base + 100).ease(d3.easeCubicOut), go = s => quick ? s.interrupt() : s.transition(tr);
    // y axis and gridlines keyed by value: new ticks come in from where the old scale had them, old ones leave toward the new
    const ticks = y.ticks(4);
    G.grid.selectAll('line').data(ticks, d => d).join(e => e.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', d => y0(d)).attr('y2', d => y0(d)).attr('opacity', 0), u => u,
      o => go(o).attr('y1', d => y(d)).attr('y2', d => y(d)).attr('opacity', 0).remove()).call(s => go(s).attr('y1', d => y(d)).attr('y2', d => y(d)).attr('opacity', 1));
    G.yax.selectAll('text').data(ticks, d => d).join(e => e.append('text').attr('x', m.l - 8).attr('text-anchor', 'end').attr('y', d => y0(d) + 4).attr('opacity', 0), u => u,
      o => go(o).attr('y', d => y(d) + 4).attr('opacity', 0).remove()).text(d => d ? fmtY(d) : '0').call(s => go(s).attr('y', d => y(d) + 4).attr('opacity', 1));
    // bars: a layer per series, a bar per month; entering bars grow from their place in the stack
    const X = d => x(mStart(d.mo)) + gap / 2, top = d => y(d.p[1]) + (d.p[1] - d.p[0] > 0 ? 1 : 0), ht = d => Math.max(0, y(d.p[0]) - y(d.p[1]) - (d.p[1] - d.p[0] > 0 ? 1 : 0));
    const layers = G.bars.selectAll('g.tl-l').data(stack, d => d.key).join(e => e.append('g').attr('class', 'tl-l'), u => u, o => o.remove()).attr('fill', d => colorOf(opt.group, d.key));
    layers.selectAll('rect').data(d => d.map((p, i) => ({ p, mo: months[i], k: d.key })), d => d.mo)
      .join(e => e.append('rect').attr('x', X).attr('width', Math.max(1, bw - gap)).attr('y', d => y(d.p[0])).attr('height', 0), u => u, o => o.remove())
      .classed('hov', d => d.mo === G.hov)
      .call(s => go(s).attr('x', X).attr('width', Math.max(1, bw - gap)).attr('y', top).attr('height', ht).attr('opacity', d => active && (d.mo < active[0] || d.mo > active[1]) ? .32 : 1));
    const xt = x.ticks(W < 600 ? 4 : 8);
    G.xax.selectAll('text').data(xt, d => +d).join(e => e.append('text').attr('y', H - 6).attr('text-anchor', 'middle').attr('x', d => x(d)), u => u, o => o.remove())
      .text(d => d3.utcFormat(d.getUTCMonth() === 0 ? '%Y' : '%b')(d)).call(s => go(s).attr('x', d => x(d)));
    const now = new Date(), inDom = now >= x.domain()[0] && now <= x.domain()[1];
    G.today.style('display', inDom ? null : 'none').attr('y1', m.t - 4).attr('y2', H - m.b); if (inDom) go(G.today).attr('x1', x(now)).attr('x2', x(now));
    G.y = y;
    // the brush follows the filter: the active range, or nothing
    if (active) { const a0 = mStart(active[0]), b0 = d3.utcMonth.offset(mStart(active[1]), 1); G.bg.call(G.brush.move, [x(a0), x(b0)]); G.showLab(a0, b0); }
    else { if (d3.brushSelection(G.bg.node())) G.bg.call(G.brush.move, null); G.hideLab(); }
    // first sight this session: the bars grow up from the baseline (one animation for the whole chart, nothing left behind)
    if (first && !reduced() && once('tl:chart')) { const o = '0px ' + (H - m.b) + 'px'; G.bars.node().animate([{ transform: 'scaleY(0)', transformOrigin: o }, { transform: 'scaleY(1)', transformOrigin: o }], { duration: DUR.reveal, easing: EASE }); }
    $('tlLegend').innerHTML = groups.map(g => '<span><i style="background:' + colorOf(opt.group, g) + '"></i>' + esc(labelOf(opt.group, g)) + '</span>').join('');
  }

  function renderGantt(list, groups) {
    const sc = $('gScroll'), W = sc.clientWidth, lw = labelW(), cw = Math.max(window.innerWidth <= 700 ? 120 : 160, W - lw - 12); $('gantt').style.setProperty('--glab', lw + 'px');
    const gx = d3.scaleUtc().domain(x.domain()).range([0, cw]);
    const sorted = list.slice().sort(opt.sort === 'value' ? (a, b) => b.cost - a.cost : (a, b) => a.ts.localeCompare(b.ts) || b.cost - a.cost);
    rows = []; let y = 0;
    for (const g of groups) {
      const items = sorted.filter(f => keyOf[opt.group](f) === g); if (!items.length) continue;
      rows.push({ g, y, h: HH, n: items.length, v: items.reduce((s, f) => s + f.cost, 0) }); y += HH;
      for (const f of items) { rows.push({ f, y, h: RH }); y += RH; }
    }
    $('gInner').style.height = y + 'px';
    const ax = $('gAxis'); const ticks = gx.ticks(W < 700 ? 4 : 10);
    ax.innerHTML = '<div class="g-lab">' + fmtN(list.length) + ' projects</div><div class="g-ticks" style="width:' + cw + 'px">' + ticks.map(t => '<span style="left:' + gx(t) + 'px">' + d3.utcFormat(t.getUTCMonth() === 0 ? '%Y' : '%b')(t) + '</span>').join('') + '</div>';
    const draw = () => {
      const top = sc.scrollTop, bot = top + sc.clientHeight, inner = $('gInner'), sel = ctx.state.sel;
      let lo = 0, hi = rows.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].y + rows[mid].h < top - 200) lo = mid + 1; else hi = mid; }
      let html = ''; const nowX = gx(new Date());
      for (let i = lo; i < rows.length && rows[i].y < bot + 200; i++) {
        const r = rows[i];
        if (r.g !== undefined) { html += '<div class="g-row g-head" style="top:' + r.y + 'px;height:' + r.h + 'px"><span class="g-lab"><i style="background:' + colorOf(opt.group, r.g) + '"></i>' + esc(labelOf(opt.group, r.g)) + '</span><span class="g-sum">' + fmtN(r.n) + ' · ' + fmtM(r.v) + '</span></div>'; continue; }
        const f = r.f, x0 = Math.max(0, gx(new Date(f.ts + 'T00:00:00Z'))), x1 = Math.min(cw, gx(new Date(f.te + 'T00:00:00Z'))), w = Math.max(3, x1 - x0);
        html += '<button class="g-row' + (sel === f ? ' on' : '') + '" data-i="' + i + '" style="top:' + r.y + 'px;height:' + r.h + 'px"><span class="g-lab"><b>' + esc(f.name) + '</b><em>' + esc(f.city || f.county) + ' · ' + fmtM(f.cost) + '</em></span>' +
          '<span class="g-track" style="width:' + cw + 'px"><span class="g-bar' + (f.tsE || f.teE ? ' est' : '') + '" style="left:' + x0 + 'px;width:' + w + 'px;background-color:' + colorOf(opt.group, keyOf[opt.group](f)) + '"></span>' +
          (nowX >= 0 && nowX <= cw ? '<span class="g-now" style="left:' + nowX + 'px"></span>' : '') + '</span></button>';
      }
      inner.innerHTML = html;
    };
    sc.onscroll = () => requestAnimationFrame(draw);
    $('gInner').onclick = e => { const b = e.target.closest('.g-row[data-i]'); if (!b) return; const f = rows[+b.dataset.i].f; ctx.select(f, false); draw(); };
    $('gInner').onpointermove = e => { const b = e.target.closest('.g-row[data-i]'); if (!b) { ctx.tip.style.opacity = 0; return; } const f = rows[+b.dataset.i].f, vr = ctx.viewport.getBoundingClientRect();
      ctx.tip.innerHTML = '<b></b><span></span>'; ctx.tip.querySelector('b').textContent = f.name;
      ctx.tip.querySelector('span').textContent = f.ts + (f.tsE ? ' (est.)' : '') + ' → ' + f.te + (f.teE ? ' (est.)' : '') + ' · ' + fmtM(f.cost) + (f.use ? ' · ' + f.use : '');
      let px = e.clientX - vr.left + 14; const w = ctx.tip.offsetWidth; if (px + w > vr.width - 8) px = e.clientX - vr.left - w - 14;
      ctx.tip.style.left = px + 'px'; ctx.tip.style.top = (e.clientY - vr.top + 14) + 'px'; ctx.tip.style.opacity = 1; };
    $('gInner').onpointerleave = () => { ctx.tip.style.opacity = 0; };
    draw();
  }

  function render() {
    if (ctx.view !== 'timeline') return;
    const list = ctx.visible, d0 = ctx.state.d, chartList = d0 && d0.f === 'active' ? ctx.matchWith({ d: prevD && prevD.f !== 'active' ? prevD : null }) : list;
    months = domainMonths(chartList);
    const groups = groupsFor(opt.group, list);
    const est = list.filter(f => f.tsE || f.teE).length;
    const pct = Math.round(est / Math.max(1, list.length) * 100);
    $('tlSub').textContent = fmtN(list.length) + ' projects · ' + fmtM(list.reduce((s, f) => s + f.cost, 0)) + ' est. value' + (est ? ' · ' + (pct < 1 ? '<1%' : pct + '%') + ' have estimated dates' : '');
    ctx.scopeBar?.($('tlScope'));
    if (!list.length) { $('tlChart').querySelector('svg')?.remove(); G = null; $('gInner').innerHTML = ctx.vempty ? ctx.vempty({ icon: 'search', title: 'No filings match these filters', text: 'Remove a filter above, or reset them.', actions: [{ label: 'Reset filters', id: 'tlReset', primary: true }] }) : '<div class="empty">No filings match these filters.</div>';
      $('gInner').style.height = 'auto'; $('tlLegend').innerHTML = ''; $('tlReset')?.addEventListener('click', () => ctx.resetFilings?.()); return; }
    renderChart(chartList, groupsFor(opt.group, chartList)); renderGantt(list, groups);
    const d = ctx.state.d, r = $('tlRange');
    if (d && d.f === 'active') { const f = s => s ? d3.utcFormat('%b %Y')(mStart(s)) : '…';
      r.innerHTML = '<b>Under construction ' + esc(f(d.from)) + (d.to !== d.from ? ' – ' + esc(f(d.to)) : '') + '</b> · ' + fmtN(list.length) + ' projects <button class="lnk" type="button">Clear</button>';
      r.querySelector('button').onclick = clearRange; $('tlHelp').style.display = 'none'; }
    else { r.innerHTML = ''; $('tlHelp').style.display = ''; }
  }
  ctx.onChange(render); ctx.onView('timeline', render);
  let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(render, 150); });
}
