// Timeline view: monthly pipeline chart (value or count of projects under construction, stacked) + virtualized Gantt.
// Both render from ctx.visible, so they always agree with the map, list and exports.
import { USES } from './lib/taxonomy.mjs';

// categorical slots (fixed order; validated palette from the dataviz reference), light / dark
const CAT = { light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'], dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'] };
const OTHER = { light: '#a3a8aa', dark: '#6b7174' };
const RH = 34, HH = 30;
const labelW = () => window.innerWidth <= 860 ? 150 : 290;

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
    const dark = ctx.isDark();
    if (g === 'type') { const c = ctx.C(); return k === 'New' ? c.new : k === 'Reno' ? c.reno : c.add; }
    const i = orderOf[g].indexOf(k); return i >= 0 && i < 7 ? CAT[dark ? 'dark' : 'light'][i] : OTHER[dark ? 'dark' : 'light'];
  }
  const groupsFor = (g, list) => { const present = new Set(list.map(keyOf[g])); return [...orderOf[g], 'Other'].filter(k => present.has(k)); };

  root.innerHTML = `
    <div class="vhead">
      <div><div class="kicker">Construction timeline</div><h2 id="tlTitle">Projects under construction</h2><div class="vsub" id="tlSub"></div></div>
      <div class="vctl">
        <label>Group by <select class="chip" id="tlGroup"><option value="type">Type</option><option value="county">County</option>${USE_ORDER.length ? '<option value="use">Use</option>' : ''}</select></label>
        <label>Measure <select class="chip" id="tlMeasure"><option value="value">Est. value</option><option value="count">Projects</option></select></label>
        <label>Sort <select class="chip" id="tlSort"><option value="start">Start date</option><option value="value">Value</option></select></label>
      </div>
    </div>
    <div class="tl-legend" id="tlLegend"></div>
    <div class="tl-chart" id="tlChart"><div class="tl-tip" id="tlTip"></div></div>
    <div class="tl-note"><span id="tlRange"></span><span id="tlHelp">Drag across the chart to see what's under construction in a range, or tap a month. Hatched bars use dates we estimated because the filer left them blank.</span></div>
    <div class="gantt" id="gantt"><div class="g-axis" id="gAxis"></div><div class="g-scroll" id="gScroll"><div class="g-inner" id="gInner"></div></div></div>`;
  const $ = id => root.querySelector('#' + id);
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

  let prevD = null;
  function clearRange() { const d = prevD && prevD.f !== 'active' ? prevD : ctx.periodSpec('12m'); prevD = null; ctx.fromSpec({ ...ctx.curSpec(), d }, { fly: false }); }
  function renderChart(list, groups) {
    const active = ctx.state.d && ctx.state.d.f === 'active' ? [ctx.state.d.from || months[0], ctx.state.d.to || months[months.length - 1]] : null;
    const el = $('tlChart'), W = el.clientWidth, H = 210, m = { t: 10, r: 14, b: 24, l: 58 };
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
    const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H).attr('role', 'img')
      .attr('aria-label', (opt.measure === 'value' ? 'Estimated value' : 'Number') + ' of projects under construction by month');
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', d => y(d)).attr('y2', d => y(d));
    svg.append('g').attr('class', 'yax').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 8).attr('y', d => y(d) + 4).attr('text-anchor', 'end').text(d => d ? fmtY(d) : '0');
    const bw = Math.max(1, (x(mStart(months[1] || months[0])) - x(mStart(months[0]))) || 8), gap = bw > 6 ? 2 : 0;
    svg.append('g').selectAll('g').data(stack).join('g').attr('fill', d => colorOf(opt.group, d.key))
      .selectAll('rect').data(d => d).join('rect').attr('x', (d, i) => x(mStart(months[i])) + gap / 2).attr('width', Math.max(1, bw - gap))
      .attr('y', d => y(d[1]) + (d[1] - d[0] > 0 ? 1 : 0)).attr('height', d => Math.max(0, y(d[0]) - y(d[1]) - (d[1] - d[0] > 0 ? 1 : 0)))
      .attr('opacity', (d, i) => active && (months[i] < active[0] || months[i] > active[1]) ? .32 : 1);
    const xt = x.ticks(W < 600 ? 4 : 8);
    svg.append('g').attr('class', 'xax').selectAll('text').data(xt).join('text').attr('x', d => x(d)).attr('y', H - 6).attr('text-anchor', 'middle').text(d => d3.utcFormat(d.getUTCMonth() === 0 ? '%Y' : '%b')(d));
    const now = new Date(); if (now >= x.domain()[0] && now <= x.domain()[1]) svg.append('line').attr('class', 'today').attr('x1', x(now)).attr('x2', x(now)).attr('y1', m.t - 4).attr('y2', H - m.b);
    // hover: nearest month column under the pointer (works through the brush overlay)
    const tip = $('tlTip');
    svg.on('pointermove', ev => {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      const [px] = d3.pointer(ev); if (px < m.l || px > W - m.r) { tip.style.opacity = 0; return; }
      const mo = d3.utcMonth.floor(x.invert(px)).toISOString().slice(0, 7), i = months.indexOf(mo); if (i < 0) return;
      const r = rowsM[i], tot = groups.reduce((s, g) => s + r[g], 0);
      tip.innerHTML = '<b>' + esc(d3.utcFormat('%B %Y')(mStart(mo))) + '</b><span>' + fmtY(tot) + ' total</span>' + groups.slice().reverse().filter(g => r[g]).map(g => '<div><i style="background:' + colorOf(opt.group, g) + '"></i>' + esc(labelOf(opt.group, g)) + '<em>' + fmtY(r[g]) + '</em></div>').join('');
      const left = x(mStart(mo)) + bw + 10; tip.style.opacity = 1; tip.style.left = (left + tip.offsetWidth > W ? x(mStart(mo)) - tip.offsetWidth - 10 : left) + 'px'; tip.style.top = '8px';
    }).on('pointerleave', () => { tip.style.opacity = 0; });
    // brush -> "under construction during" filter. Snaps to whole months while dragging, shows the range live,
    // stays on the chart afterwards so its edges can be adjusted; a tap without dragging picks a single month.
    const ymOf = d => d.toISOString().slice(0, 7), fmtMo = d3.utcFormat('%b %Y');
    const snap = ([a, b]) => { const s0 = d3.utcMonth.floor(x.invert(a)), e0 = d3.utcMonth.ceil(x.invert(b)); return [s0, e0 > s0 ? e0 : d3.utcMonth.offset(s0, 1)]; };
    const lab = svg.append('g').attr('class', 'blabel').style('display', 'none'); lab.append('rect').attr('rx', 3).attr('height', 18).attr('y', m.t - 2); lab.append('text').attr('y', m.t + 11);
    const showLab = (s0, e0) => { const t = fmtMo(s0) + (d3.utcMonth.offset(s0, 1) < e0 ? ' – ' + fmtMo(d3.utcMonth.offset(e0, -1)) : ''); lab.style('display', null).select('text').text(t);
      const w = t.length * 6.4 + 14, cx = Math.max(m.l + w / 2, Math.min(W - m.r - w / 2, (x(s0) + x(e0)) / 2)); lab.select('rect').attr('x', cx - w / 2).attr('width', w); lab.select('text').attr('x', cx); };
    const apply = (s0, e0) => {
      if (!(ctx.state.d && ctx.state.d.f === 'active')) prevD = ctx.state.d;
      ctx.showFilings?.(); ctx.fromSpec({ ...ctx.curSpec(), d: { f: 'active', from: ymOf(s0), to: ymOf(d3.utcMonth.offset(e0, -1)) } }, { fly: false });
    };
    const brush = d3.brushX().extent([[m.l, m.t], [W - m.r, H - m.b]])
      .on('start', () => { tip.style.opacity = 0; })
      .on('brush', function (ev) { if (!ev.sourceEvent || !ev.selection) return; const [s0, e0] = snap(ev.selection); showLab(s0, e0); })
      .on('end', function (ev) {
        if (!ev.sourceEvent) return;
        if (!ev.selection) { // tap: one month, or clear when tapping the month already selected
          const [px] = d3.pointer(ev.sourceEvent, svg.node()); if (px < m.l || px > W - m.r) return;
          const s0 = d3.utcMonth.floor(x.invert(px)), cur = ctx.state.d;
          if (cur && cur.f === 'active' && cur.from === ymOf(s0) && cur.to === ymOf(s0)) { clearRange(); return; }
          apply(s0, d3.utcMonth.offset(s0, 1)); return;
        }
        const [s0, e0] = snap(ev.selection); apply(s0, e0);
      });
    const bg = svg.append('g').attr('class', 'brush').call(brush); bg.select('.overlay').style('cursor', 'var(--cur-cross, crosshair)');
    lab.raise();
    if (active) { const a0 = mStart(active[0]), b0 = d3.utcMonth.offset(mStart(active[1]), 1); bg.call(brush.move, [x(a0), x(b0)]); showLab(a0, b0); }
    el.querySelector('svg')?.remove(); el.prepend(svg.node());
    $('tlLegend').innerHTML = groups.map(g => '<span><i style="background:' + colorOf(opt.group, g) + '"></i>' + esc(labelOf(opt.group, g)) + '</span>').join('');
  }

  function renderGantt(list, groups) {
    const sc = $('gScroll'), W = sc.clientWidth, cw = Math.max(160, W - labelW() - 12);
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
    $('tlSub').textContent = fmtN(list.length) + ' projects · ' + fmtM(list.reduce((s, f) => s + f.cost, 0)) + ' est. value' + (est ? ' · ' + Math.round(est / Math.max(1, list.length) * 100) + '% have estimated dates' : '') + (ctx.filterText() ? ' · ' + ctx.filterText() : '');
    if (!list.length) { $('tlChart').querySelector('svg')?.remove(); $('gInner').innerHTML = '<div class="empty">No filings match these filters.</div>'; $('gInner').style.height = 'auto'; $('tlLegend').innerHTML = ''; return; }
    renderChart(chartList, groupsFor(opt.group, chartList)); renderGantt(list, groups);
    const d = ctx.state.d, r = $('tlRange');
    if (d && d.f === 'active') { const f = s => s ? d3.utcFormat('%b %Y')(mStart(s)) : '…';
      r.innerHTML = '<b>Under construction ' + esc(f(d.from)) + (d.to !== d.from ? ' – ' + esc(f(d.to)) : '') + '</b> · ' + fmtN(list.length) + ' projects <button class="lnk" type="button">Clear</button>';
      r.querySelector('button').onclick = clearRange; $('tlHelp').style.display = 'none'; }
    else { r.innerHTML = ''; $('tlHelp').style.display = ''; }
  }
  ctx.onChange(render); ctx.onView('timeline', render);
  let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(render, 150); });
  new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
