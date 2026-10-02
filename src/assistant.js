// AI assistant: chat (text) and voice (OpenAI Realtime over WebRTC) that act on the map through tools.
// Tool calls from either channel run here, against the filings loaded in the browser (see lib/agent-tools.mjs).
import { makeMatcher, describe, miles } from './lib/filter.mjs';
import { entityKey } from './lib/taxonomy.mjs';
import { systemPrompt, VOICE_STYLE } from './lib/agent-tools.mjs';
import { cleanFilterArgs, pickPlace, fromNominatim, withTellMore, suggestQuestions, frame, ZOOM, splitFollowups } from './lib/assist-logic.mjs';

const SPARK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 1.5l1.6 3.9 3.9 1.6-3.9 1.6L8 12.5 6.4 8.6 2.5 7l3.9-1.6z"/><path d="M13 11.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg>';
const MIC = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="6.2" y="1.8" width="5.6" height="9.2" rx="2.8"/><path d="M3.5 8.6a5.5 5.5 0 0 0 11 0M9 14.1v2.4"/></svg>';
const SEND = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15V3M4 8l5-5 5 5"/></svg>';
const X = '<svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const SUGGEST = ['Show medical projects over $5M filed in the last year', 'Who are the most active developers right now?', 'What’s under construction within 5 miles of Katy?', 'Show a heatmap of new construction by value', 'Take me to downtown Houston and orbit around it', 'Find the biggest multifamily projects and highlight the top 5', 'How far is this property from me, and what’s the drive time?', 'Turn on radar, wind and live traffic'];

const MOD = /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';

export function initAssistant(ctx) {
  const { esc, fmtM, fmtN } = ctx;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <aside class="ai" id="ai" aria-label="AI assistant" aria-hidden="true">
    <div class="ai-grab" id="aiGrab" aria-hidden="true"></div>
    <header class="ai-h">
      <div class="ai-t">${SPARK}<span>Assistant</span><em id="aiSt"></em></div>
      <button class="ai-ib" id="aiNew" type="button" title="New conversation">New</button>
      <button class="ai-ib" id="aiClose" type="button" aria-label="Close assistant">${X}</button>
    </header>
    <div class="ai-log" id="aiLog" aria-live="polite"></div>
    <div class="ai-live" id="aiLive" hidden>
      <div class="ai-orb" id="aiOrb"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="ai-lt"><b id="aiLiveT">Connecting…</b><span id="aiLiveS">Voice conversation</span></div>
      <button class="btn" id="aiSendNow" type="button" hidden>Send</button>
      <button class="btn" id="aiStop" type="button">End</button>
    </div>
    <form class="ai-f" id="aiForm" autocomplete="off">
      <textarea id="aiQ" rows="1" maxlength="1500" placeholder="Ask, or tell the map what to show…" aria-label="Message the assistant" enterkeyhint="send"></textarea>
      <button class="ai-mic" id="aiMic" type="button" aria-label="Talk to the assistant" title="Talk (voice)">${MIC}</button>
      <button class="ai-send" id="aiSend" type="submit" aria-label="Send">${SEND}</button>
    </form>
  </aside>
  <div class="fab-sugs" id="fabSugs" aria-label="Suggested questions"></div>
  <button class="ai-fab" id="aiFab" type="button" aria-controls="ai" aria-keyshortcuts="${MOD === '⌘' ? 'Meta+/' : 'Control+/'}">${SPARK}<span>Ask AI</span><kbd>${MOD}/</kbd></button>`;
  ctx.viewport.append(...wrap.children);
  const $ = id => document.getElementById(id);
  const el = $('ai'), log = $('aiLog'), q = $('aiQ'), form = $('aiForm'), st = $('aiSt'), app = document.querySelector('.app');
  let history = [], busy = false;

  // ---------- open / close ----------
  function open(focus = true) {
    // tablet: give the map the room the drawer takes by folding the side list away
    if (innerWidth > 700 && innerWidth <= 1100 && !app.classList.contains('pcollapsed')) { app.classList.add('pcollapsed'); setTimeout(() => ctx.map.resize(), 30); }
    app.classList.add('ai-open'); el.setAttribute('aria-hidden', 'false');
    if (!history.length && !log.children.length) renderEmpty();
    if (focus && !matchMedia('(pointer: coarse)').matches) setTimeout(() => q.focus(), 60);
    ctx.mapPadding();
  }
  function close() { app.classList.remove('ai-open', 'ai-tall'); el.setAttribute('aria-hidden', 'true'); stopVoice(); ctx.mapPadding(); }
  $('aiFab').onclick = () => open(); $('aiClose').onclick = close;
  $('aiNew').onclick = () => { history = []; thread = null; log.innerHTML = ''; renderEmpty(); ctx.clearHighlight(); };
  // ⌘/ (Mac) or Ctrl+/ opens the assistant from anywhere, even while typing in another box; again closes it
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === '/' || e.code === 'Slash')) {
      e.preventDefault(); if (app.classList.contains('ai-open') && document.activeElement === q) close(); else open();
    }
    if (e.key === 'Escape' && app.classList.contains('ai-open') && document.activeElement === q) close();
  });

  // ---------- suggested questions above the Ask AI button, from what is on screen ----------
  const sugBox = $('fabSugs'); let cardInfo = null, sugT = 0, lastSugs = '';
  function onScreen() {
    const m = ctx.map, z = m.getZoom(), c = m.getCenter(), b = m.getBounds(), cardOpen = document.getElementById('card').classList.contains('open');
    const card = !cardOpen || !cardInfo ? null : cardInfo.kind === 'filing' ? { kind: 'filing', name: cardInfo.f.name, dev: cardInfo.f.dev || cardInfo.f.owner, approx: !!cardInfo.f.approx }
      : cardInfo.kind === 'building' ? { kind: 'building', label: cardInfo.label?.() } : null;
    const inView = z >= 8 ? ctx.visible.reduce((n, f) => n + (b.contains([f.lon, f.lat]) ? 1 : 0), 0) : 0;
    return { card, near: ctx.nearestPlace?.([c.lng, c.lat]) || null, zoom: z, inView, filtered: !!ctx.filterText(), selection: ctx.sel?.feature ? ctx.sel.label || null : null, changed: ctx.CHANGED.size };
  }
  function renderSugs() {
    const list = suggestQuestions(onScreen()), key = list.join('|'); if (key === lastSugs) return; lastSugs = key;
    // pills say "it" for the open card; the question sent names it, so the answer can't drift to something else
    const v = onScreen(), name = v.card?.kind === 'filing' ? v.card.name : v.card?.kind === 'building' && v.card.label ? v.card.label.split(',')[0] : null;
    sugBox.innerHTML = list.map(t => '<button type="button" data-q="' + esc(name ? t.replace(/\b(of|near|is) it\b|\bwill it\b/, m => m.replace(/\bit\b/, name)) : t) + '">' + esc(t) + '</button>').join('');
    sugBox.querySelectorAll('button').forEach(b => b.onclick = () => { if (busy) return; open(false); ask(b.dataset.q); });
  }
  const sugSoon = () => { clearTimeout(sugT); sugT = setTimeout(renderSugs, 300); };
  ctx.onCardRender(i => { cardInfo = i; sugSoon(); }); ctx.onCardClose(() => { cardInfo = null; sugSoon(); });
  ctx.map.on('moveend', sugSoon); ctx.onChange(sugSoon); sugSoon();
  // phone: drag the grab handle to switch between half and tall sheet
  { let y0 = null; const g = $('aiGrab');
    g.addEventListener('pointerdown', e => { y0 = e.clientY; g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointerup', e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null;
      if (dy < -30) app.classList.add('ai-tall'); else if (dy > 60) { if (app.classList.contains('ai-tall')) app.classList.remove('ai-tall'); else close(); } else app.classList.toggle('ai-tall'); ctx.mapPadding(); }); }

  // ---------- rendering ----------
  function renderEmpty() {
    log.innerHTML = '<div class="ai-empty"><b>Ask about construction anywhere on the map.</b><span>I can filter the map, find and highlight projects, compare areas and developers, and switch views. Or press the mic and just talk.</span>' +
      '<div class="ai-sugs">' + SUGGEST.map(s => '<button type="button">' + esc(s) + '</button>').join('') + '</div></div>';
    log.querySelectorAll('.ai-sugs button').forEach(b => b.onclick = () => ask(b.textContent));
  }
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function bubble(role, html) {
    log.querySelector('.ai-empty')?.remove();
    const d = document.createElement('div'); d.className = 'ai-m ' + role; d.innerHTML = html; log.appendChild(d); scroll(); return d;
  }
  // the one project, place or building this turn was about (for the "Tell me more about …" follow-up)
  let turnSubject = null;
  // follow-up suggestions under the latest answer; tapping one asks it
  function pills(list) {
    log.querySelectorAll('.ai-next').forEach(x => x.remove());
    const d = document.createElement('div'); d.className = 'ai-next';
    d.innerHTML = list.map(p => '<button type="button">' + esc(p) + '</button>').join('');
    d.querySelectorAll('button').forEach(b => b.onclick = () => { if (busy) return; d.remove(); ask(b.textContent); });
    log.appendChild(d); scroll();
  }
  function actionChip(text, undo) {
    const d = bubble('act', '<span class="ai-ai">' + esc(text) + '</span>' + (undo ? '<button class="lnk" type="button">Undo</button>' : ''));
    if (undo) d.querySelector('button').onclick = () => { undo(); d.querySelector('button').remove(); d.classList.add('undone'); };
    return d;
  }
  const status = t => { st.textContent = t || ''; };
  q.addEventListener('input', () => { q.style.height = 'auto'; q.style.height = Math.min(140, q.scrollHeight) + 'px'; });
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.onsubmit = e => { e.preventDefault(); const t = q.value.trim(); if (!t) return; q.value = ''; q.style.height = 'auto'; ask(t); };

  // ---------- text chat loop ----------
  const context = () => ({ coverage: ctx.coverage(), filters: ctx.filterText() || 'none (default view)', screen: ctx.screenContext(), vocab: ctx.vocab() });
  let thread = null; // OpenAI response id that continues this conversation
  async function post(input) {
    const r = await fetch('api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, previous_response_id: thread, context: context() }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409) thread = null;
    if (!r.ok) throw new Error(d.error || (r.status === 404 ? 'The assistant isn’t deployed here.' : 'Error ' + r.status));
    thread = d.id || thread; return d;
  }
  async function ask(text) {
    if (busy) return; open(false); busy = true; $('aiSend').disabled = true;
    log.querySelectorAll('.ai-next').forEach(x => x.remove()); turnSubject = null;
    bubble('user', esc(text)); history.push({ role: 'user', content: text });
    const thinking = bubble('bot pending', '<span class="dots"><i></i><i></i><i></i></span>'); status('Thinking…');
    try {
      let input = [{ role: 'user', content: text }], next = [];
      for (let round = 0; round < 6; round++) {
        const m = await post(input), fu = splitFollowups(m.text);
        if (fu.pills.length) next = fu.pills;
        if (fu.text) { thinking.before(bubble('bot', ctx.richText(fu.text))); ctx.wireCites(log); history.push({ role: 'assistant', content: fu.text }); }
        if (!m.calls?.length) break;
        input = [];
        for (const c of m.calls) {
          status(LABEL[c.name] || 'Working…');
          let args = {}; try { args = JSON.parse(c.arguments || '{}'); } catch (e) {}
          const result = await runTool(c.name, args);
          input.push({ type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(result).slice(0, 11000) });
        }
        log.appendChild(thinking); scroll(); status('Thinking…');
      }
      next = withTellMore(next, turnSubject); if (next.length) pills(next);
    } catch (e) { bubble('bot err', esc(e.message)); }
    finally { thinking.remove(); status(''); busy = false; $('aiSend').disabled = false; history = history.slice(-40); }
  }
  const LABEL = { filter_map: 'Filtering the map…', query_filings: 'Looking through the filings…', highlight_filings: 'Highlighting…', open_filing: 'Opening the filing…', fly_to: 'Moving the map…', stop_orbit: 'Stopping…', set_map_options: 'Changing the map…', highlight_area: 'Outlining the area…', nearby_places: 'Looking up what’s nearby…', compare_areas: 'Setting up the comparison…', show_view: 'Switching view…', reset_map: 'Resetting…', distance_and_drive_time: 'Routing…', set_live_layers: 'Changing the map…', weather_at: 'Checking the weather…', project_news: 'Searching the news…', site_imagery: 'Searching NASA imagery…' };

  // ---------- tools ----------
  const ym = s => /^\d{4}-\d\d$/.test(s || '') ? s : '';
  function developerKey(name, list) {
    const toks = entityKey(name).split(' ').filter(Boolean); if (!toks.length) return null;
    const counts = new Map(), labels = new Map();
    for (const f of list) { const raw = f.dev || f.owner, k = entityKey(raw); if (!k) continue; const kt = k.split(' ');
      if (toks.every(t => kt.includes(t))) { counts.set(k, (counts.get(k) || 0) + 1); if (!labels.has(k)) labels.set(k, raw); } }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? { k: 'dev', v: best[0], label: labels.get(best[0]) } : null;
  }
  // common mishearings / nicknames of local places
  const ALIAS = [[/\bcyprus\b/i, 'Cypress'], [/\bkaty freeway\b/i, 'I-10 Katy Freeway'], [/\bthe woodland\b(?!s)/i, 'The Woodlands'], [/\bh[- ]?town\b/i, 'Houston'], [/\bminute maid park\b/i, 'Daikin Park']];
  const TOWNS = () => ['Houston', ...(ctx.DATA.places || []).map(p => p[0])];
  // OpenStreetMap knows hotels, venues and other landmarks by name that MapTiler's geocoder often doesn't
  async function nominatim(q) {
    try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=us&viewbox=-106.7,36.5,-93.5,25.8&bounded=1&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
      return r.ok ? fromNominatim(await r.json()) : []; } catch (e) { return []; }
  }
  // Every lookup must land on the place itself or fail: a wrong guess used to fly the map to e.g. "Houston Avenue, Pasadena"
  // before the model retried with the street address.
  async function resolvePlace(name) {
    for (const [re, to] of ALIAS) name = name.replace(re, to);
    const n = name.toLowerCase().replace(/,?\s*(tx|texas)$/, '').trim();
    const town = (ctx.DATA.places || []).find(p => p[0].toLowerCase() === n);
    if (town) return { c: [town[1], town[2]], label: town[0] + ', TX', kind: 'town' };
    const q = name + (/texas|\btx\b/i.test(name) ? '' : ', Texas'), towns = TOWNS();
    let p = pickPlace(name, await ctx.geocode(q, { exact: true }), towns);
    if (p.error) { const p2 = pickPlace(name, await ctx.geocode(q), towns); if (!p2.error) p = p2; }
    if (p.error) { const p3 = pickPlace(name, await nominatim(q), towns); if (!p3.error) p = p3; }
    if (p.error) { const head = name.split(',')[0].replace(/\s+(hotel|inn|suites)$/i, ''); if (head !== name.split(',')[0]) { const p4 = pickPlace(head, await nominatim(head + ', ' + (name.split(',').slice(1).join(',') || 'Texas')), towns); if (!p4.error) p = p4; } }
    return p;
  }
  const lastUserText = () => { for (let i = history.length - 1; i >= 0; i--) if (history[i].role === 'user') return history[i].content; return ''; };
  async function specFrom(raw) {
    const a = cleanFilterArgs(raw, lastUserText());
    const base = a.keep_current ? { ...ctx.curSpec() } : { d: ctx.curSpec().d };
    if (!a.changed) delete base.chg; // "changed this week" only when asked for
    const spec = { ...base }, notes = [];
    if (a.counties?.length && !ctx.COUNTIES.every(c => a.counties.includes(c))) { const known = a.counties.filter(c => ctx.COUNTIES.includes(c)); if (known.length) spec.c = known; else notes.push('Counties not loaded: ' + a.counties.join(', ')); }
    if (a.types?.length) spec.t = a.types;
    if (a.uses?.length) spec.u = a.uses;
    if (a.min_value > 0) spec.min = Math.round(a.min_value);
    if (a.max_value > 0) spec.max = Math.round(a.max_value);
    if (a.keywords) spec.q = String(a.keywords).slice(0, 80);
    if (a.period) spec.d = ctx.periodSpec(a.period);
    if (a.date_field && (ym(a.date_from) || ym(a.date_to))) spec.d = { f: a.date_field, from: ym(a.date_from), to: ym(a.date_to) };
    if (a.changed) spec.chg = a.changed;
    if (a.developer) { const who = developerKey(a.developer, ctx.F); if (who) spec.who = who; else { spec.q = String(a.developer).slice(0, 80); notes.push('No developer key matched “' + a.developer + '”; searched the text instead.'); } }
    if (a.near_place) { const p = await resolvePlace(String(a.near_place)); if (!p.error) spec.sel = { k: 'r', c: p.c, mi: Math.max(0.25, Math.min(60, a.radius_miles || 5)), label: p.label }; else notes.push('Couldn’t find “' + a.near_place + '” on the map.'); }
    return { spec, notes };
  }
  function matchList(spec) {
    const m = makeMatcher({ ...spec, sel: null }, { changed: ctx.CHANGED });
    return ctx.F.filter(f => m(f) && (!spec.sel || spec.sel.k !== 'r' || miles(spec.sel.c, [f.lon, f.lat]) <= spec.sel.mi));
  }
  const row = f => ({ id: f.id, name: f.name, city: f.city, county: f.county, type: f.type, use: f.use || null, value: f.cost, sqft: f.sqft || null, registered: f.reg,
    start: f.ts + (f.tsE ? ' (est.)' : ''), end: f.te + (f.teE ? ' (est.)' : ''), status: f.status, developer: f.dev || f.owner || null, tenant: f.ten || null });
  function groups(list, key, n = 8) {
    const m = new Map(); for (const f of list) { const k = key(f) || 'Unknown'; const g = m.get(k) || { name: k, filings: 0, value: 0 }; g.filings++; g.value += f.cost; m.set(k, g); }
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, n);
  }
  const summary = list => ({ filings: list.length, total_value: list.reduce((s, f) => s + f.cost, 0), new_construction: list.filter(f => f.type === 'New').length,
    by_use: groups(list, f => f.use, 6), by_county: groups(list, f => f.county, 6), largest: list.slice().sort((a, b) => b.cost - a.cost).slice(0, 10).map(row) });
  const GROUP = { county: f => f.county, city: f => f.city, use: f => f.use, type: f => f.type, status: f => f.status, developer: f => f.dev || f.owner, month: f => (f.reg || '').slice(0, 7), year: f => (f.reg || '').slice(0, 4) };

  async function runTool(name, a) {
    try {
      if (name === 'filter_map') {
        const before = ctx.snapshot(), { spec, notes } = await specFrom(a);
        ctx.fromSpec(spec, { fly: true }); if (ctx.view !== 'map' && ctx.view !== 'timeline') ctx.setView('map');
        const list = ctx.visible; if (!spec.sel) ctx.fitToVisible();
        actionChip('Map: ' + (describe(spec, fmtM) || 'all filings') + ' · ' + fmtN(list.length) + ' filings · est. ' + fmtM(list.reduce((s, f) => s + f.cost, 0)), () => ctx.restore(before));
        return { applied: describe(spec) || 'all filings', notes, ...summary(list) };
      }
      if (name === 'query_filings') {
        const { spec, notes } = await specFrom({ ...a, keep_current: a.keep_current ?? false }), list = matchList(spec), lim = Math.max(1, Math.min(25, a.limit || 10));
        if (a.group_by) return { filters: describe(spec) || 'all', notes, filings: list.length, total_value: list.reduce((s, f) => s + f.cost, 0), groups: groups(list, GROUP[a.group_by] || GROUP.county, lim) };
        const sorted = list.slice().sort(a.sort === 'newest' ? (x, y) => (y.reg || '').localeCompare(x.reg || '') : a.sort === 'oldest' ? (x, y) => (x.reg || '').localeCompare(y.reg || '') : a.sort === 'start' ? (x, y) => x.ts.localeCompare(y.ts) : (x, y) => y.cost - x.cost);
        return { filters: describe(spec) || 'all', notes, filings: list.length, total_value: list.reduce((s, f) => s + f.cost, 0), rows: sorted.slice(0, lim).map(row) };
      }
      if (name === 'highlight_filings') {
        const found = (a.ids || []).map(id => ctx.BY_ID.get(String(id).trim())).filter(Boolean);
        if (!found.length) return { error: 'None of those ids are loaded.' };
        ctx.highlight(found, a.label || ''); if (ctx.view !== 'map') ctx.setView('map');
        actionChip('Highlighted ' + found.length + ' filing' + (found.length > 1 ? 's' : '') + (a.label ? ': ' + a.label : ''), () => ctx.clearHighlight());
        return { highlighted: found.map(f => ({ id: f.id, name: f.name, value: f.cost })) };
      }
      if (name === 'open_filing') {
        const f = ctx.BY_ID.get(String(a.id || '').trim()); if (!f) return { error: 'Filing not loaded.' };
        if (ctx.view !== 'map') ctx.setView('map'); ctx.select(f, true); actionChip('Opened ' + f.name); turnSubject = f.name;
        return { opened: row(f), scope: f.scope || '', summary: f.sum || '', owner: f.owner, address: f.addr, architect: f.arch || null, gc: f.gc || null, approximate_location: !!f.approx };
      }
      if (name === 'fly_to') {
        let c = null, label = '', kind = 'town', zoom = null, note;
        const ids = a.ids?.length ? a.ids : a.id ? [a.id] : a.highlighted ? ctx.highlighted() : [];
        if (ids.length) {
          const fs = ids.map(id => ctx.BY_ID.get(String(id).trim())).filter(f => f && isFinite(f.lon) && isFinite(f.lat));
          if (!fs.length) return { error: a.highlighted && !a.ids?.length && !a.id ? 'Nothing is highlighted.' : 'None of those filings are loaded.' };
          if (fs.length === 1) { c = [fs[0].lon, fs[0].lat]; label = fs[0].name; kind = fs[0].approx ? 'approx' : 'building'; }
          else { const fr = frame(fs.map(f => [f.lon, f.lat])); c = fr.c; zoom = fr.zoom; label = fs.length + ' filings'; kind = 'group'; }
          if (fs.some(f => f.approx)) note = 'Some of these filings only have a city-level location, so the camera can’t center on the exact building.';
        } else if (isFinite(a.lat) && isFinite(a.lon) && a.lat && a.lon) { c = [a.lon, a.lat]; label = a.lat.toFixed(4) + ', ' + a.lon.toFixed(4); kind = 'building'; }
        else if (a.place) { const p = await resolvePlace(String(a.place)); if (p.error) return { error: p.error }; c = p.c; label = p.label; kind = p.kind; }
        else if (ctx.state.sel) { const f = ctx.state.sel; c = [f.lon, f.lat]; label = f.name; kind = f.approx ? 'approx' : 'building'; }
        else if (ctx.currentBuilding?.()) { const b = ctx.currentBuilding(); c = b.center; label = b.title || 'this building'; kind = 'building'; }
        if (!c) return { error: 'Say a place, an address or which filings to go to.' };
        if (ctx.view !== 'map') ctx.setView('map');
        const def = zoom ?? ZOOM[kind] ?? 12;
        // a specific building/address/landmark stays close even if the model asks for a wide zoom
        // the model's zoom may nudge the default, never swap a neighbourhood view for a whole city
        zoom = a.zoom > 0 ? (['building', 'address', 'poi', 'area'].includes(kind) ? Math.max(a.zoom, def) : Math.min(def + 2.5, Math.max(def - 0.75, a.zoom))) : def;
        if (kind === 'approx') zoom = Math.min(zoom, 14);
        zoom = Math.max(4, Math.min(19, zoom));
        if (a.orbit) ctx.orbitAt(c, zoom); else ctx.map.flyTo({ center: c, zoom, pitch: a.tilt || zoom >= 16.5 ? 60 : ctx.map.getPitch(), duration: ctx.reduceMotion ? 0 : 1400 });
        if (kind !== 'group' && !/^-?\d+\.\d+, -?\d/.test(label)) turnSubject = label;
        actionChip((a.orbit ? 'Orbiting ' : 'Moved the map to ') + label); return { moved_to: label, zoom: +zoom.toFixed(1), orbiting: !!a.orbit, ...(note ? { note } : {}) };
      }
      if (name === 'highlight_area') {
        const pl = await ctx.highlightPlace(String(a.place || ''), a.kind);
        if (!pl) return { error: 'Couldn’t find “' + a.place + '” in OpenStreetMap. Try the official name with its city or county.' };
        await new Promise(r => setTimeout(r, 50));
        const out = { ...ctx.placeSummary() };
        if (!pl.geom) out.note = 'Shown as a point: OpenStreetMap has no outline for it.';
        if (a.filter && pl.geom && /Polygon/.test(pl.geom.type)) { ctx.setSelection('place', pl.label, pl.geom); ctx.clearPlace(); out.filtered = true; out.filings = ctx.visible.length; }
        if (a.compare && pl.geom && /Polygon/.test(pl.geom.type)) out.added_to_compare = ctx.compare.add({ key: 'place:' + pl.label, label: pl.label.split(',')[0], kind: pl.kind, geom: pl.geom });
        actionChip('Outlined ' + pl.label, () => ctx.clearPlace()); return out;
      }
      if (name === 'nearby_places') {
        let o = null, from = '';
        const f = a.id && ctx.BY_ID.get(String(a.id).trim());
        if (f) { o = [f.lon, f.lat]; from = f.name; }
        else if (isFinite(a.lat) && isFinite(a.lon) && a.lat && a.lon) { o = [a.lon, a.lat]; from = a.lat.toFixed(4) + ', ' + a.lon.toFixed(4); }
        else if (/^(me|my location|my position|current location)$/i.test(String(a.near || '').trim())) { try { o = await ctx.locate(); from = 'your location'; } catch (e) { return { error: e.message }; } }
        else if (a.near && !/^(here|this|this property|this building|the map|map center)$/i.test(String(a.near).trim())) { const p = await resolvePlace(String(a.near)); if (p.error) return { error: p.error }; o = p.c; from = p.label; }
        else if (ctx.state.sel) { o = [ctx.state.sel.lon, ctx.state.sel.lat]; from = ctx.state.sel.name; }
        else if (ctx.currentBuilding?.()) { const b = ctx.currentBuilding(); o = b.center; from = b.title || 'this building'; }
        else { const c = ctx.map.getCenter(); o = [c.lng, c.lat]; from = 'the map center'; }
        const q = new URLSearchParams({ lat: o[1].toFixed(5), lon: o[0].toFixed(5), what: String(a.what || '').slice(0, 60), limit: String(Math.max(1, Math.min(10, a.limit || 5))) });
        const r = await fetch('api/nearby?' + q), d = await r.json().catch(() => ({}));
        if (!r.ok) return { error: d.error || 'Nearby search failed (' + r.status + ').' };
        if (ctx.view !== 'map') ctx.setView('map');
        ctx.showNearby(d.places, o); actionChip('Nearest ' + (d.label || a.what).toLowerCase() + ' to ' + from + ': ' + d.places.length + ' found', () => ctx.clearNearby());
        return { measured_from: from, category: d.label, searched_within_miles: d.searched_miles, places: d.places, note: 'Distances are straight-line miles. Source: OpenStreetMap.' };
      }
      if (name === 'compare_areas') {
        const names = (a.places || []).map(String).filter(Boolean).slice(0, 4); if (names.length < 2) return { error: 'Give 2 to 4 places.' };
        if (a.replace !== false) ctx.compare.clear();
        const done = [], missed = [];
        for (const n of names) { const pl = await ctx.highlightPlace(n); if (pl?.geom && /Polygon/.test(pl.geom.type)) { ctx.compare.add({ key: 'place:' + pl.label, label: pl.label.split(',')[0], kind: pl.kind, geom: pl.geom }); done.push(pl.label); } else missed.push(n); }
        ctx.clearPlace(); ctx.setView('compare');
        const base = ctx.filtered(), areas = ctx.compare.list().map(ar => { const l = base.filter(f => d3.geoContains(ar.geom, [f.lon, f.lat])); return { area: ar.label, filings: l.length, total_value: l.reduce((s, f) => s + f.cost, 0), new_builds: l.filter(f => f.type === 'New').length, largest: l.sort((x, y) => y.cost - x.cost).slice(0, 3).map(row) }; });
        actionChip('Comparing ' + done.join(', ')); return { compared: areas, ...(missed.length ? { not_found: missed } : {}) };
      }
      if (name === 'stop_orbit') { ctx.stopOrbit(); return { stopped: true }; }
      if (name === 'set_map_options') { const done = ctx.setMapOptions(a); actionChip('Map: ' + done.join(', ')); return { changed: done }; }
      if (name === 'distance_and_drive_time') { if (!ctx.live) return { error: 'Not available.' }; const d = await ctx.live.drive(a); if (d.summary) actionChip(d.summary, a.show_route !== false && d.road_miles != null ? () => ctx.live.clearRoute() : null); return d; }
      if (name === 'set_live_layers') { if (!ctx.live) return { error: 'Not available.' }; if (ctx.view !== 'map') ctx.setView('map'); const done = await ctx.live.set(a); actionChip('Map: ' + done.join(', ')); return { changed: done, now_on: Object.entries(ctx.live.state()).filter(([, v]) => v).map(([k]) => k) }; }
      if (name === 'weather_at') { if (!ctx.live) return { error: 'Not available.' }; const d = await ctx.live.weather(a); if (!d.error) actionChip('Weather at ' + d.place + ': ' + Math.round(d.temp_f) + '°F, ' + d.conditions + ', wind ' + Math.round(d.wind_mph) + ' mph'); return d; }
      if (name === 'project_news') { if (!ctx.live) return { error: 'Not available.' }; const d = await ctx.live.news(a); if (!d.error) actionChip('News: ' + d.articles.length + ' article' + (d.articles.length === 1 ? '' : 's') + ' for ' + d.searched); return d; }
      if (name === 'site_imagery') { if (!ctx.live) return { error: 'Not available.' }; if (ctx.view !== 'map') ctx.setView('map'); const d = await ctx.live.imagery(a); if (d.showing) actionChip('NASA imagery on the map: ' + d.showing.name + ' ' + d.showing.day); else if (d.passes?.length) actionChip('Found ' + d.passes.length + ' NASA passes · previews in the card'); return d; }
      if (name === 'show_view') { ctx.setView(a.view); actionChip('Opened ' + ({ map: 'the map', timeline: 'the timeline', compare: 'Compare', who: 'Activity', changes: 'Updates', market: 'Market' }[a.view] || a.view)); return { view: a.view }; }
      if (name === 'reset_map') { const before = ctx.snapshot(); ctx.resetAll(); actionChip('Reset the map', () => ctx.restore(before)); return { reset: true, filings: ctx.visible.length }; }
      return { error: 'Unknown tool ' + name };
    } catch (e) { console.error(e); return { error: e.message }; }
  }
  ctx.runAssistantTool = runTool;

  // ---------- voice (OpenAI Realtime over WebRTC) ----------
  let pc = null, dc = null, mic = null, audio = null, meter = null, voiceT = 0, liveBubble = null, pendingCalls = 0;
  const live = $('aiLive'), liveT = $('aiLiveT'), liveS = $('aiLiveS'), orb = $('aiOrb');
  const setLive = (t, s) => { liveT.textContent = t; if (s != null) liveS.textContent = s; };
  async function startVoice() {
    if (pc) { stopVoice(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) { ctx.toast('Voice needs a browser with microphone and WebRTC support.'); return; }
    open(false); live.hidden = false; el.classList.add('voice'); $('aiMic').classList.add('on'); setLive('Connecting…', 'Allow the microphone if asked');
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = await fetch('api/realtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: context() }) });
      const s = await r.json().catch(() => ({})); if (!r.ok || !s.value) throw new Error(s.error || 'Voice isn’t available right now.');
      pc = new RTCPeerConnection(); audio = new Audio(); audio.autoplay = true; audio.playsInline = true;
      pc.ontrack = e => { audio.srcObject = e.streams[0]; };
      pc.addTrack(mic.getAudioTracks()[0], mic);
      dc = pc.createDataChannel('oai-events'); dc.onmessage = e => { try { onEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
      dc.onopen = () => { lastCtx = ''; setLive('Listening', 'Talk naturally. I’ll answer when you pause.'); };
      pc.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(pc?.connectionState)) stopVoice('Voice connection ended.'); };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const a = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { Authorization: 'Bearer ' + s.value, 'Content-Type': 'application/sdp' } });
      if (!a.ok) throw new Error('Voice connection was refused (' + a.status + ').');
      await pc.setRemoteDescription({ type: 'answer', sdp: await a.text() });
      startMeter(); clearTimeout(voiceT); voiceT = setTimeout(() => stopVoice('Voice sessions end after 10 minutes. Tap the mic to keep going.'), 10 * 60e3);
    } catch (e) { stopVoice(e.name === 'NotAllowedError' ? 'Microphone access was blocked.' : e.message); }
  }
  function stopVoice(msg) {
    clearTimeout(voiceT); cancelAnimationFrame(meter?.raf || 0); meter?.ac?.close?.().catch?.(() => {}); meter = null;
    try { dc?.close(); } catch (e) {} try { pc?.close(); } catch (e) {} mic?.getTracks().forEach(t => t.stop());
    if (audio) { audio.srcObject = null; audio = null; } pc = dc = mic = null; liveBubble = null;
    live.hidden = true; el.classList.remove('voice'); $('aiMic').classList.remove('on'); if (msg) ctx.toast(msg);
  }
  function startMeter() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 256;
      ac.createMediaStreamSource(mic).connect(an); const buf = new Uint8Array(an.frequencyBinCount), bars = orb.querySelectorAll('i');
      meter = { ac, raf: 0 };
      const tick = () => { an.getByteFrequencyData(buf); bars.forEach((b, i) => { const v = buf[3 + i * 6] / 255; b.style.transform = 'scaleY(' + (0.25 + v * 1.6).toFixed(2) + ')'; }); meter.raf = requestAnimationFrame(tick); };
      tick();
    } catch (e) { /* meter is decoration only */ }
  }
  const sendEv = o => { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(o)); };
  // keep the voice model's picture of the screen current: refresh its instructions when the map, filters or card change
  let ctxT = 0, lastCtx = '';
  function pushContext() {
    clearTimeout(ctxT); ctxT = setTimeout(() => {
      if (!dc || dc.readyState !== 'open') return; const c = context(), key = c.screen + c.filters; if (key === lastCtx) return; lastCtx = key;
      sendEv({ type: 'session.update', session: { type: 'realtime', instructions: systemPrompt({ coverage: c.coverage, filters: c.filters, screen: c.screen }) + VOICE_STYLE } });
    }, 1500);
  }
  ctx.map.on('moveend', pushContext); ctx.onChange(pushContext); ctx.onCardRender(pushContext); ctx.onCardClose(pushContext); ctx.onViewChange(pushContext);
  const isNoise = t => !t || /[^\u0000-\u024f\u2000-\u206f\s]/.test(t) && !/[a-z]{3}/i.test(t) || t.replace(/[^a-z]/gi, '').length < 2;
  async function onEvent(e) {
    switch (e.type) {
      case 'input_audio_buffer.speech_started': setLive('Listening…', 'Pause when you’re done, or tap Send'); $('aiSendNow').hidden = false; break;
      case 'input_audio_buffer.speech_stopped': setLive('Thinking…', ''); $('aiSendNow').hidden = true; break;
      case 'conversation.item.input_audio_transcription.completed': {
        const t = (e.transcript || '').trim();
        // noise, other languages and background fragments: don't show them and stop any reply they started
        if (isNoise(t)) { sendEv({ type: 'response.cancel' }); if (e.item_id) sendEv({ type: 'conversation.item.delete', item_id: e.item_id }); setLive('Listening'); break; }
        bubble('user', esc(t)); history.push({ role: 'user', content: t }); break;
      }
      case 'response.output_audio_transcript.delta':
        if (!liveBubble) liveBubble = bubble('bot', ''); liveBubble.dataset.t = (liveBubble.dataset.t || '') + e.delta; liveBubble.innerHTML = ctx.richText(splitFollowups(liveBubble.dataset.t).text); scroll(); setLive('Speaking'); break;
      case 'response.output_audio_transcript.done': if (liveBubble) { history.push({ role: 'assistant', content: liveBubble.dataset.t || '' }); ctx.wireCites(log); } liveBubble = null; break;
      case 'response.function_call_arguments.done': {
        pendingCalls++; setLive(LABEL[e.name] || 'Working…');
        let args = {}; try { args = JSON.parse(e.arguments || '{}'); } catch (err) {}
        const result = await runTool(e.name, args);
        sendEv({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: e.call_id, output: JSON.stringify(result).slice(0, 11000) } });
        pendingCalls--;
        break;
      }
      case 'response.done': {
        const calls = (e.response?.output || []).filter(o => o.type === 'function_call');
        if (calls.length) { const waitTools = () => pendingCalls ? setTimeout(waitTools, 120) : sendEv({ type: 'response.create' }); waitTools(); }
        else setLive('Listening');
        break;
      }
      case 'error': console.error('realtime', e.error); if (e.error?.message) ctx.toast('Voice: ' + e.error.message); break;
    }
  }
  $('aiMic').onclick = startVoice; $('aiStop').onclick = () => stopVoice();
  // send now: end the turn without waiting for the pause detector
  $('aiSendNow').onclick = () => { sendEv({ type: 'input_audio_buffer.commit' }); sendEv({ type: 'response.create' }); $('aiSendNow').hidden = true; setLive('Thinking…', ''); };
  ctx.assistant = { open, close, ask, startVoice };
}
