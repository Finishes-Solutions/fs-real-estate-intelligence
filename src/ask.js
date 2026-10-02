// Ask-the-map: question -> /api/ask (filters) -> applied locally -> /api/ask (short answer grounded in the matched rows).
import { describe } from './lib/filter.mjs';

export function initAsk(ctx) {
  const { esc, fmtM, fmtN } = ctx;
  const form = document.getElementById('askForm'), input = document.getElementById('askQ'), out = document.getElementById('askOut'), btn = document.getElementById('askBtn');
  let busy = false, undo = null;

  async function post(body) {
    const r = await fetch('api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || (r.status === 404 ? 'The AI endpoint isn’t deployed here.' : 'Error ' + r.status));
    return d;
  }
  async function resolvePlace(name) {
    const n = name.toLowerCase().replace(/,?\s*(tx|texas)$/, '').trim();
    const town = ctx.DATA.places.find(p => p[0].toLowerCase() === n);
    if (town) return { c: [town[1], town[2]], label: town[0] + ', TX' };
    const g = await ctx.geocode(name + (/texas|\btx\b/i.test(name) ? '' : ', Texas'));
    return g[0] ? { c: g[0].c, label: g[0].t } : null;
  }
  const show = html => { out.innerHTML = html; out.classList.toggle('on', !!html); };

  form.onsubmit = async e => {
    e.preventDefault(); const question = input.value.trim(); if (!question || busy) return;
    busy = true; btn.disabled = true; show('<div class="rnote">Reading your question…</div>');
    try {
      const before = ctx.curSpec(), month = ctx.state.month;
      const r = await post({ phase: 'filter', question, current: before });
      if (r.intent === 'unrelated') { show('<div class="rnote">' + esc(r.note) + '</div>'); return; }
      const spec = r.spec || {};
      if (r.place) { const p = await resolvePlace(r.place.name); if (p) spec.sel = { k: 'r', c: p.c, mi: r.place.mi, label: p.label }; else ctx.toast('Couldn’t find “' + r.place.name + '” on the map; ignored the location.'); }
      undo = { spec: before, month };
      if (month) ctx.setMonth(null);
      ctx.fromSpec(spec, { fly: true }); ctx.setView(ctx.view === 'changes' || ctx.view === 'who' ? 'map' : ctx.view);
      const list = ctx.visible;
      const head = '<div class="applied"><span>' + esc(describe(spec, fmtM) || 'All filings') + ' · ' + fmtN(list.length) + ' match</span><button class="lnk" id="askUndo" type="button">Undo</button></div>';
      show(head + '<div class="rnote">Writing an answer…</div>'); wireUndo();
      if (!list.length) { show(head + '<div class="answer"><p>No filings match. ' + esc(r.note || '') + '</p></div>'); wireUndo(); return; }
      const sum = (arr, key) => { const m = {}; arr.forEach(f => { const k = key(f) || 'Unclassified'; m[k] = m[k] || [0, 0]; m[k][0]++; m[k][1] += f.cost; }); return Object.entries(m).sort((a, b) => b[1][1] - a[1][1]).slice(0, 8).map(([k, [n, v]]) => ({ k, n, v })); };
      const summary = { filters: describe(spec), period: ctx.DATA.period, count: list.length, totalValue: list.reduce((s, f) => s + f.cost, 0),
        byCounty: sum(list, f => f.county), byUse: sum(list, f => f.use), byType: sum(list, f => f.type), estimatedDatesShare: Math.round(list.filter(f => f.tsE || f.teE).length / list.length * 100) + '%' };
      const rows = list.slice().sort((a, b) => b.cost - a.cost).slice(0, 25).map(f => ({ id: f.id, name: f.name, city: f.city, county: f.county, type: f.type, use: f.use || '', cost: f.cost, sqft: f.sqft || 0,
        registered: f.reg, start: f.ts + (f.tsE ? ' (est.)' : ''), end: f.te + (f.teE ? ' (est.)' : ''), status: f.status, owner: f.dev || f.owner, tenant: f.ten || '', summary: f.sum || '' }));
      const a = await post({ phase: 'answer', question, summary, rows });
      show(head + '<div class="answer">' + ctx.richText(a.answer) + '</div><div class="rnote">AI answer from the filings now on the map. Values are filer estimates.</div>');
      wireUndo(); ctx.wireCites(out);
    } catch (err) {
      show('<div class="rnote err">' + esc(err.message) + '</div>');
    } finally { busy = false; btn.disabled = false; }
  };
  function wireUndo() { const u = out.querySelector('#askUndo'); if (u) u.onclick = () => { if (!undo) return; ctx.fromSpec(undo.spec, { fly: true }); if (undo.month) ctx.setMonth(undo.month); undo = null; show(''); }; }
}
