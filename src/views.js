// "Who's building" (developers, architects, GCs ranked by activity) and "What changed" (nightly change feed).
import { entityKey } from './lib/taxonomy.mjs';
import { mergeRecent } from './lib/changes.mjs';

const ROLE = { dev: 'Developers & owners', arch: 'Architects & designers', gc: 'General contractors' };
const ROLE_SHORT = { dev: 'Developers', arch: 'Architects', gc: 'Contractors' };

export function initWho(ctx) {
  const { fmtM, fmtN, esc } = ctx, root = document.getElementById('view-who');
  let role = 'dev', q = '';
  root.innerHTML = `<div class="vhead"><div><div class="kicker">Companies</div><h2>Most active developers, architects and builders</h2><div class="vsub" id="whoSub"></div></div>
    <div class="vctl"><div class="seg seg3" id="whoRole">${Object.entries(ROLE).map(([k, v]) => `<button data-k="${k}" aria-pressed="${k === role}">${ROLE_SHORT[k]}</button>`).join('')}</div>
    <label class="search sm"><input id="whoQ" type="search" placeholder="Find a name" aria-label="Find a name"></label>
    ${ctx.exportMenu?.([{ label: 'Activity report · PDF', attrs: ' data-x="pdf"' }, { label: 'Activity report · Excel', attrs: ' data-x="xlsx"' }, { label: 'Activity report · CSV', attrs: ' data-x="csv"' }]) || ''}</div></div>
    <div id="whoScope"></div>
    <div class="who-note" id="whoNote"></div><div class="tablewrap"><table class="who"><thead><tr><th>Name</th><th class="r">Projects</th><th class="r">Est. value</th><th>Mostly</th><th>Where</th><th>Last 8 quarters</th><th>Latest</th></tr></thead><tbody id="whoBody"></tbody></table></div>
    <div class="vfoot" id="whoFoot"></div>`;
  root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ctx.openExport?.('activity', { format: b.dataset.x }));
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
    root.querySelector('#whoSub').textContent = fmtN(groups.size) + ' ' + ROLE[role].toLowerCase() + ' across ' + fmtN(list.length) + ' filings';
    ctx.scopeBar?.(root.querySelector('#whoScope'));
    root.querySelector('#whoFoot').textContent = rows.length > 150 ? 'Showing the top 150 of ' + fmtN(rows.length) + ' by value. Search to find others.' : '';
    root.querySelector('#whoNote').textContent = role === 'dev' ? 'Grouped by owner name as filed (or the developer the AI identified), with LLC/Inc. variants merged. Single-asset LLCs often hide the real sponsor.'
      : 'Only ' + fmtN(covered) + ' of ' + fmtN(list.length) + ' filings name ' + (role === 'gc' ? 'a general contractor' : 'a design firm') + ', so this list is partial.';
    const cur = ctx.state.who;
    root.querySelector('#whoBody').innerHTML = rows.slice(0, 150).map(g => '<tr data-k="' + esc(g.k) + '" class="' + (cur && cur.k === role && cur.v === g.k ? 'on' : '') + '"><td><button class="lnk">' + esc(g.label) + '</button></td><td class="m r">' + fmtN(g.n) + '</td><td class="m r">' + fmtM(g.v) + '</td><td>' + esc(top(g.uses)[0][0] === 'Reno' ? 'Renovation' : top(g.uses)[0][0]) + '</td><td>' + esc(top(g.cos).slice(0, 2).map(x => x[0]).join(', ')) + '</td><td>' + spark(g.q) + '</td><td class="m">' + esc(g.last) + '</td></tr>').join('')
      || '<tr class="nomatch"><td colspan="7">' + (ctx.vempty ? ctx.vempty({ icon: 'search', title: q ? 'No names match “' + q + '”' : 'No companies with these filters', text: q ? 'Check the spelling, or try part of the name.' : 'Loosen the filters above to see more filings.' }) : 'No names match.') + '</td></tr>';
    const byK = new Map(rows.map(g => [g.k, g]));
    root.querySelectorAll('#whoBody tr[data-k]').forEach(tr => tr.onclick = () => { const g = byK.get(tr.dataset.k); ctx.state.who = { k: role, v: g.k, label: g.label }; ctx.showFilings?.(); ctx.applyFilters(); ctx.setView('map'); ctx.toast('Showing ' + fmtN(g.n) + ' filings for ' + g.label + '. Reset filters to see everything.'); });
  }
  ctx.onChange(render); ctx.onView('who', render);
}

export function initChanges(ctx) {
  const { fmtM, fmtN, esc, BY_ID, DATA } = ctx, root = document.getElementById('view-changes');
  const runs = DATA.changes.runs || [], week = mergeRecent(DATA.changes);
  // "Last 7 days" (the default) is every nightly check in the week up to the latest, merged the way the badge and the
  // "New this week / Any change" filters count them, so the numbers agree; each single check is still listed after it.
  let ri = week.runs ? 'w' : 0, onlyVisible = true;
  const dl = x => new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const nIds = items => new Set(items.map(x => x.id)).size, plural = (n, w) => fmtN(n) + ' ' + w + (n === 1 ? '' : 's');
  root.innerHTML = `<div class="vhead"><div><div class="kicker">Changes</div><h2 id="chTitle">What changed in TDLR</h2><div class="vsub" id="chSub"></div><div class="vsub vsub-n" id="chN"></div></div>
    <div class="vctl"><label>Found <select class="chip" id="chRun">${week.runs ? `<option value="w">Last 7 days · ${plural(week.ids.size, 'filing')}</option>` : ''}${runs.map((r, i) => `<option value="${i}">${new Date(r.built).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${r.items.length} change${r.items.length === 1 ? '' : 's'}</option>`).join('')}</select></label>
    <label class="tg2"><input type="checkbox" id="chOnly" checked><span>Only within current filters</span></label></div></div><div id="chScope"></div><nav id="chJump" class="ch-jump" aria-label="Jump to a section" hidden></nav><div id="chBody" class="chbody"></div>`;
  const runSel = root.querySelector('#chRun'), onlyEl = root.querySelector('#chOnly');
  runSel.value = String(ri); runSel.onchange = () => { ri = runSel.value === 'w' ? 'w' : +runSel.value; render(); };
  onlyEl.onchange = e => { onlyVisible = e.target.checked; render(); };
  const SECTIONS = [['new', 'New filings', 'New'], ['status', 'Status changes', 'Status'], ['cost', 'Value changes', 'Value'], ['start', 'Start date changes', 'Start date'], ['end', 'End date changes', 'End date'], ['sqft', 'Size changes', 'Size'], ['gone', 'No longer listed', 'Removed']];
  const fv = (k, v) => v == null || v === '' ? '—' : k === 'cost' ? fmtM(v) : k === 'sqft' ? fmtN(v) : String(v);

  function render() {
    if (ctx.view !== 'changes') return;
    const body = root.querySelector('#chBody');
    ctx.scopeBar?.(root.querySelector('#chScope'));
    if (!runs.length) { body.innerHTML = ctx.vempty ? ctx.vempty({ icon: 'clock', title: 'No changes yet', text: 'Changes start after the second nightly TDLR check. Check back tomorrow.' }) : ''; root.querySelector('#chSub').textContent = ''; return; }
    const vis = new Set(ctx.visible.map(f => f.id)), isWeek = ri === 'w', all = isWeek ? week.items : runs[ri].items;
    const items = all.filter(x => x.k === 'gone' || !onlyVisible || vis.has(x.id));
    const newV = items.filter(x => x.k === 'new').reduce((s, x) => s + (BY_ID.get(x.id)?.cost || 0), 0);
    let lead;
    if (isWeek) { root.querySelector('#chTitle').textContent = 'Changes in the last 7 days'; lead = 'New filings and edits our nightly TDLR checks found from ' + dl(week.since) + ' to ' + dl(week.built); }
    else { const run = runs[ri], prev = runs[ri + 1]; root.querySelector('#chTitle').textContent = 'Changes found ' + dl(run.built); lead = 'New filings and edits our nightly TDLR check found on ' + dl(run.built) + (prev ? ', compared with ' + dl(prev.built) : ''); }
    const nAll = nIds(all), nShown = nIds(items), sub = root.querySelector('#chSub'), nEl = root.querySelector('#chN');
    sub.textContent = lead + (newV ? ' · ' + fmtM(newV) + ' in new filings' : ''); sub.title = sub.textContent;
    // filtered vs total, and one click to flip it (the same as the "Only within current filters" switch)
    nEl.hidden = !nAll; // a check with no changes at all has nothing to filter
    nEl.innerHTML = !nAll ? '' : onlyVisible ? fmtN(nShown) + ' of ' + plural(nAll, 'changed filing') + ' match your filters' + (nShown < nAll ? ' · <button type="button" class="lnk" id="chAll">Show all</button>' : '')
      : 'Showing all ' + plural(nAll, 'changed filing') + ' · <button type="button" class="lnk" id="chAll">Only those matching your filters</button>';
    nEl.querySelector('#chAll')?.addEventListener('click', () => { onlyVisible = !onlyVisible; onlyEl.checked = onlyVisible; render(); });
    // jump chips: one per section that has changes, with its count; the section headers stay put while their list scrolls
    const jump = root.querySelector('#chJump'), counts = SECTIONS.map(([k, , short]) => [k, short, items.filter(x => x.k === k).length]).filter(c => c[2]);
    jump.hidden = counts.length < 2;
    jump.innerHTML = counts.map(([k, short, n]) => '<button type="button" class="chip" data-sec="' + k + '">' + esc(short) + ' <b>' + fmtN(n) + '</b></button>').join('');
    jump.onclick = e => { const b = e.target.closest('[data-sec]'); const sec = b && body.querySelector('[data-sec="' + b.dataset.sec + '"]'); if (!sec) return;
      root.scrollTo({ top: Math.max(0, sec.offsetTop - jump.offsetHeight - 6), behavior: ctx.reduceMotion ? 'auto' : 'smooth' }); };
    { const cs = getComputedStyle(root); root.style.setProperty('--chpt', cs.paddingTop); root.style.setProperty('--chpx', cs.paddingLeft); } // the page's own padding: sticky offsets start inside it
    root.style.setProperty('--chj', (counts.length < 2 ? 0 : jump.offsetHeight) + 'px');
    body.innerHTML = SECTIONS.map(([k, label]) => {
      const its = items.filter(x => x.k === k).map(x => ({ x, f: BY_ID.get(x.id) })).sort((a, b) => ((b.f?.cost ?? b.x.cost) || 0) - ((a.f?.cost ?? a.x.cost) || 0));
      if (!its.length) return '';
      return '<section class="chsec" data-sec="' + k + '"><h3>' + label + ' <span>' + fmtN(its.length) + '</span></h3>' + its.slice(0, 200).map(({ x, f }) => {
        const name = f ? f.name : x.name, meta = f ? (f.city || f.county) + ' · ' + (ctx.TYPE_LABEL[f.type] || f.type) + (f.use ? ' · ' + f.use : '') : (x.county || '') + ' County';
        const what = k === 'new' ? fmtM(f?.cost || 0) : k === 'gone' ? fmtM(x.cost || 0) : esc(fv(k, x.from)) + ' → ' + esc(fv(k, x.to));
        return '<button class="chitem" ' + (f ? 'data-id="' + esc(f.id) + '"' : 'disabled') + '><span><b>' + esc(name) + '</b><em>' + esc(meta) + '</em></span><span class="m">' + what + '</span></button>';
      }).join('') + (its.length > 200 ? '<div class="rnote">…and ' + fmtN(its.length - 200) + ' more. Narrow the filters to see them.</div>' : '') + '</section>';
    }).join('') || (ctx.vempty ? ctx.vempty({ icon: 'clock', title: onlyVisible ? 'No changes match your filters' : 'No changes in this check', text: onlyVisible ? fmtN(nAll) + ' filings changed, but none within the current filters.' : 'The nightly check found nothing new or changed.', actions: onlyVisible && nAll ? [{ label: 'Show all changes', id: 'chAll2', primary: true }] : [] }) : '');
    body.querySelector('#chAll2')?.addEventListener('click', () => { onlyVisible = false; onlyEl.checked = false; render(); });
    // a row opens the filing's card over this page (as on Timeline); the card's "Show on map" goes to the map
    body.querySelectorAll('.chitem[data-id]').forEach(b => b.onclick = () => { const f = BY_ID.get(b.dataset.id); if (f) ctx.select(f, false); });
  }
  ctx.onChange(render); ctx.onView('changes', render);
}
