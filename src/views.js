// "Who's building" (developers, architects, GCs ranked by activity) and "What changed" (nightly change feed).
import { entityKey } from './lib/taxonomy.mjs';

const ROLE = { dev: 'Developers & owners', arch: 'Architects & designers', gc: 'General contractors' };

export function initWho(ctx) {
  const { fmtM, fmtN, esc } = ctx, root = document.getElementById('view-who');
  let role = 'dev', q = '';
  root.innerHTML = `<div class="vhead"><div><div class="kicker">Activity</div><h2>Most active developers, architects and builders</h2><div class="vsub" id="whoSub"></div></div>
    <div class="vctl"><div class="seg seg3" id="whoRole">${Object.entries(ROLE).map(([k, v]) => `<button data-k="${k}" aria-pressed="${k === role}">${v.split(' ')[0]}</button>`).join('')}</div>
    <label class="search sm"><input id="whoQ" type="search" placeholder="Find a name" aria-label="Find a name"></label></div></div>
    <div class="who-note" id="whoNote"></div><div class="tablewrap"><table class="who"><thead><tr><th>Name</th><th class="r">Projects</th><th class="r">Est. value</th><th>Mostly</th><th>Where</th><th>Last 8 quarters</th><th>Latest</th></tr></thead><tbody id="whoBody"></tbody></table></div>`;
  root.querySelectorAll('#whoRole button').forEach(b => b.onclick = () => { role = b.dataset.k; root.querySelectorAll('#whoRole button').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); });
  root.querySelector('#whoQ').oninput = e => { q = e.target.value.trim().toLowerCase(); render(); };

  const qStart = (() => { const d = new Date(); d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3 - 21, 1); return d.toISOString().slice(0, 10); })();
  const qIdx = s => { if (s < qStart) return -1; const [y, m] = s.split('-').map(Number), [y0, m0] = qStart.split('-').map(Number); return Math.floor(((y - y0) * 12 + (m - m0)) / 3); };
  const spark = arr => { const mx = Math.max(1, ...arr); return '<svg class="spark" viewBox="0 0 80 20" width="80" height="20" aria-hidden="true">' + arr.map((v, i) => '<rect x="' + (i * 10 + 1) + '" y="' + (19 - Math.round(v / mx * 17)) + '" width="8" height="' + Math.max(1, Math.round(v / mx * 17)) + '" rx="1"/>').join('') + '</svg>'; };

  function render() {
    if (ctx.view !== 'who') return;
    const list = ctx.visibleNoWho, groups = new Map();
    for (const f of list) {
      const raw = role === 'dev' ? (f.dev || f.owner) : f[role]; const k = entityKey(raw); if (!k) continue;
      let g = groups.get(k); if (!g) groups.set(k, g = { k, names: {}, n: 0, v: 0, uses: {}, cos: {}, q: new Array(8).fill(0), last: '' });
      g.names[raw] = (g.names[raw] || 0) + 1; g.n++; g.v += f.cost; g.uses[f.use || f.type] = (g.uses[f.use || f.type] || 0) + f.cost; g.cos[f.county] = (g.cos[f.county] || 0) + 1;
      const qi = qIdx(f.reg || ''); if (qi >= 0 && qi < 8) g.q[qi]++; if ((f.reg || '') > g.last) g.last = f.reg;
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    let rows = [...groups.values()].map(g => ({ ...g, label: top(g.names)[0][0] })).sort((a, b) => b.v - a.v);
    if (q) rows = rows.filter(g => g.k.includes(q) || g.label.toLowerCase().includes(q));
    const covered = list.filter(f => entityKey(role === 'dev' ? (f.dev || f.owner) : f[role])).length;
    root.querySelector('#whoSub').textContent = fmtN(groups.size) + ' ' + ROLE[role].toLowerCase() + ' across ' + fmtN(list.length) + ' filings' + (ctx.filterText() ? ' · ' + ctx.filterText() : '');
    root.querySelector('#whoNote').textContent = role === 'dev' ? 'Grouped by owner name as filed (or the developer the AI identified), with LLC/Inc. variants merged. Single-asset LLCs often hide the real sponsor.'
      : 'Only ' + fmtN(covered) + ' of ' + fmtN(list.length) + ' filings name ' + (role === 'gc' ? 'a general contractor' : 'a design firm') + ', so this list is partial.';
    const cur = ctx.state.who;
    root.querySelector('#whoBody').innerHTML = rows.slice(0, 150).map(g => '<tr data-k="' + esc(g.k) + '" class="' + (cur && cur.k === role && cur.v === g.k ? 'on' : '') + '"><td><button class="lnk">' + esc(g.label) + '</button></td><td class="m r">' + fmtN(g.n) + '</td><td class="m r">' + fmtM(g.v) + '</td><td>' + esc(top(g.uses)[0][0] === 'Reno' ? 'Renovation' : top(g.uses)[0][0]) + '</td><td>' + esc(top(g.cos).slice(0, 2).map(x => x[0]).join(', ')) + '</td><td>' + spark(g.q) + '</td><td class="m">' + esc(g.last) + '</td></tr>').join('')
      || '<tr><td colspan="7" class="empty">No names match.</td></tr>';
    const byK = new Map(rows.map(g => [g.k, g]));
    root.querySelectorAll('#whoBody tr[data-k]').forEach(tr => tr.onclick = () => { const g = byK.get(tr.dataset.k); ctx.state.who = { k: role, v: g.k, label: g.label }; ctx.applyFilters(); ctx.setView('map'); ctx.toast('Showing ' + fmtN(g.n) + ' filings for ' + g.label + '. Reset filters to see everything.'); });
  }
  ctx.onChange(render); ctx.onView('who', render);
}

export function initChanges(ctx) {
  const { fmtM, fmtN, esc, BY_ID, DATA } = ctx, root = document.getElementById('view-changes');
  const runs = DATA.changes.runs || [];
  let ri = 0, onlyVisible = true;
  root.innerHTML = `<div class="vhead"><div><div class="kicker">Updates</div><h2 id="chTitle">What changed in TDLR</h2><div class="vsub" id="chSub"></div></div>
    <div class="vctl"><label>Found on <select class="chip" id="chRun">${runs.map((r, i) => `<option value="${i}">${new Date(r.built).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${r.items.length} update${r.items.length === 1 ? '' : 's'}</option>`).join('')}</select></label>
    <label class="tg2"><input type="checkbox" id="chOnly" checked><span>Only within current filters</span></label></div></div><div id="chBody" class="chbody"></div>`;
  const runSel = root.querySelector('#chRun'); runSel.onchange = () => { ri = +runSel.value; render(); };
  root.querySelector('#chOnly').onchange = e => { onlyVisible = e.target.checked; render(); };
  const SECTIONS = [['new', 'New filings'], ['status', 'Status changes'], ['cost', 'Value changes'], ['start', 'Start date changes'], ['end', 'End date changes'], ['sqft', 'Size changes'], ['gone', 'No longer listed']];
  const fv = (k, v) => v == null || v === '' ? '—' : k === 'cost' ? fmtM(v) : k === 'sqft' ? fmtN(v) : String(v);

  function render() {
    if (ctx.view !== 'changes') return;
    const body = root.querySelector('#chBody');
    if (!runs.length) { body.innerHTML = '<div class="empty">Updates start after the second nightly TDLR check. Check back tomorrow.</div>'; root.querySelector('#chSub').textContent = ''; return; }
    const vis = new Set(ctx.visible.map(f => f.id)), run = runs[ri];
    const items = run.items.filter(x => x.k === 'gone' || !onlyVisible || vis.has(x.id));
    const newV = items.filter(x => x.k === 'new').reduce((s, x) => s + (BY_ID.get(x.id)?.cost || 0), 0);
    const when = new Date(run.built), prev = runs[ri + 1] ? new Date(runs[ri + 1].built) : null, d = x => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    root.querySelector('#chTitle').textContent = 'Updates found ' + d(when);
    root.querySelector('#chSub').textContent = 'New filings and edits to existing filings that our nightly TDLR check found on ' + d(when) + (prev ? ', compared with ' + d(prev) : '') + ' · ' + fmtN(items.length) + ' updates' + (newV ? ' · ' + fmtM(newV) + ' in new filings' : '') + (onlyVisible && ctx.filterText() ? ' · ' + ctx.filterText() : '');
    body.innerHTML = SECTIONS.map(([k, label]) => {
      const its = items.filter(x => x.k === k).map(x => ({ x, f: BY_ID.get(x.id) })).sort((a, b) => ((b.f?.cost ?? b.x.cost) || 0) - ((a.f?.cost ?? a.x.cost) || 0));
      if (!its.length) return '';
      return '<section class="chsec"><h3>' + label + ' <span>' + fmtN(its.length) + '</span></h3>' + its.slice(0, 200).map(({ x, f }) => {
        const name = f ? f.name : x.name, meta = f ? (f.city || f.county) + ' · ' + (ctx.TYPE_LABEL[f.type] || f.type) + (f.use ? ' · ' + f.use : '') : (x.county || '') + ' County';
        const what = k === 'new' ? fmtM(f?.cost || 0) : k === 'gone' ? fmtM(x.cost || 0) : esc(fv(k, x.from)) + ' → ' + esc(fv(k, x.to));
        return '<button class="chitem" ' + (f ? 'data-id="' + esc(f.id) + '"' : 'disabled') + '><span><b>' + esc(name) + '</b><em>' + esc(meta) + '</em></span><span class="m">' + what + '</span></button>';
      }).join('') + (its.length > 200 ? '<div class="rnote">…and ' + fmtN(its.length - 200) + ' more. Narrow the filters to see them.</div>' : '') + '</section>';
    }).join('') || '<div class="empty">No updates from this check match the current filters.</div>';
    body.querySelectorAll('.chitem[data-id]').forEach(b => b.onclick = () => { const f = BY_ID.get(b.dataset.id); ctx.setView('map'); ctx.select(f, true); });
  }
  ctx.onChange(render); ctx.onView('changes', render);
}
