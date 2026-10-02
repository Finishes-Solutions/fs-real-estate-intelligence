// AI assistant: chat (text) and voice (OpenAI Realtime over WebRTC) that act on the map through tools.
// Tool calls from either channel run here, against the filings loaded in the browser (see lib/agent-tools.mjs).
import { makeMatcher, describe, miles } from './lib/filter.mjs';
import { entityKey } from './lib/taxonomy.mjs';
import { SECTORS } from './lib/sectors.mjs';
import { systemPrompt, VOICE_STYLE } from './lib/agent-tools.mjs';
import { tractsFor, summarizeTracts, inGeom } from './lib/demographics.mjs';
import { cleanFilterArgs, pickPlace, placeCandidates, districtFor, isPromptEcho, fromNominatim, withTellMore, suggestQuestions, frame, ZOOM, splitFollowups, cameraMove } from './lib/assist-logic.mjs';

const SPARK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 1.5l1.6 3.9 3.9 1.6-3.9 1.6L8 12.5 6.4 8.6 2.5 7l3.9-1.6z"/><path d="M13 11.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg>';
const MIC = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="6.2" y="1.8" width="5.6" height="9.2" rx="2.8"/><path d="M3.5 8.6a5.5 5.5 0 0 0 11 0M9 14.1v2.4"/></svg>';
const SEND = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15V3M4 8l5-5 5 5"/></svg>';
// new chat: a speech bubble with a plus
const NEWCHAT = '<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 8.6c0 3.4-3 6-6.5 6-.9 0-1.8-.2-2.6-.5L3 15l.9-3A5.8 5.8 0 0 1 2.5 8.6c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6z"/><path d="M9 5.9v5.4M6.3 8.6h5.4"/></svg>';
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
      <button class="ai-ib" id="aiNew" type="button" title="New chat" aria-label="New chat">${NEWCHAT}</button>
      <button class="ai-ib" id="aiClose" type="button" aria-label="Close assistant">${X}</button>
    </header>
    <div class="ai-log" id="aiLog" aria-live="polite"></div>
    <div class="ai-live" id="aiLive" hidden>
      <div class="ai-orb" id="aiOrb" aria-hidden="true"><b class="ai-ring"></b><b class="ai-glow"></b><span class="ai-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
      <div class="ai-lt"><b id="aiLiveT">Connecting…</b><span id="aiLiveS" aria-live="polite">Voice conversation</span></div>
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
  <button class="ai-fab" id="aiFab" type="button" aria-controls="ai" aria-keyshortcuts="${MOD === '⌘' ? 'Meta+/' : 'Control+/'}">${SPARK}<span>Ask AI</span></button>`;
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

  // ---------- width: drag the drawer's left edge to widen it (never narrower than the default). Saved per browser. ----------
  { const grip = document.createElement('div'), KEY = 'fs-ai-w';
    grip.className = 'ai-resize'; grip.setAttribute('role', 'separator'); grip.setAttribute('aria-orientation', 'vertical'); grip.setAttribute('aria-label', 'Resize the assistant'); grip.tabIndex = 0; grip.title = 'Drag to resize · double-click to reset';
    el.prepend(grip);
    const base = () => innerWidth <= 1100 ? 400 : Math.min(460, innerWidth - 32);
    const maxW = () => Math.max(base(), Math.min(980, (document.querySelector('.stage')?.clientWidth || innerWidth) - 360));
    let want = null; try { want = +localStorage.getItem(KEY) || null; } catch (e) {}
    let raf = 0; const pad = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; ctx.mapPadding(); }); };
    const apply = () => { const w = want && innerWidth > 700 ? Math.min(maxW(), want) : 0;
      if (w > base() + 1) app.style.setProperty('--aiw', Math.round(w) + 'px'); else app.style.removeProperty('--aiw'); pad(); };
    const save = () => { try { want ? localStorage.setItem(KEY, String(Math.round(want))) : localStorage.removeItem(KEY); } catch (e) {} };
    apply(); addEventListener('resize', apply);
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; e.preventDefault(); grip.setPointerCapture(e.pointerId); app.classList.add('airesizing');
      const right = el.getBoundingClientRect().right;
      const move = ev => { want = Math.max(base(), Math.min(maxW(), right - ev.clientX)); apply(); };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); app.classList.remove('airesizing'); if (want <= base() + 1) want = null; save(); ctx.mapPadding(); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    grip.addEventListener('dblclick', () => { want = null; save(); apply(); });
    grip.addEventListener('keydown', e => {
      const d = e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0; if (!d) return; e.preventDefault();
      want = Math.max(base(), Math.min(maxW(), (want || el.getBoundingClientRect().width) + d)); if (want <= base() + 1) want = null; apply(); save();
    });
  }

  // ---------- suggested questions above the Ask AI button, from what is on screen ----------
  const sugBox = $('fabSugs'); let cardInfo = null, sugT = 0, lastSugs = '';
  function onScreen() {
    const m = ctx.map, z = m.getZoom(), c = m.getCenter(), b = m.getBounds(), cardOpen = document.getElementById('card').classList.contains('open');
    const card = !cardOpen || !cardInfo ? null : cardInfo.kind === 'filing' ? { kind: 'filing', name: cardInfo.f.name, dev: cardInfo.f.dev || cardInfo.f.owner, approx: !!cardInfo.f.approx }
      : cardInfo.kind === 'building' ? { kind: 'building', label: cardInfo.label?.() } : null;
    const inView = z >= 8 ? ctx.visible.reduce((n, f) => n + (b.contains([f.lon, f.lat]) ? 1 : 0), 0) : 0;
    const near = ctx.nearestPlace?.([c.lng, c.lat]) || null;
    return { card, near, far: near ? null : ctx.viewPlace?.() || null, zoom: z, inView, filtered: !!ctx.filterText(), selection: ctx.sel?.feature ? ctx.sel.label || null : null, changed: ctx.CHANGED.size };
  }
  function renderSugs() {
    const list = suggestQuestions(onScreen()), key = list.join('|'); if (key === lastSugs) return; lastSugs = key;
    // pills say "it" for the open card; the question sent names it, so the answer can't drift to something else
    const v = onScreen(), name = v.card?.kind === 'filing' ? v.card.name : v.card?.kind === 'building' && v.card.label ? v.card.label.split(',')[0] : null;
    sugBox.innerHTML = list.map(t => '<button type="button" data-q="' + esc(name ? t.replace(/\b(of|near|is) it\b|\bwill it\b/, m => m.replace(/\bit\b/, name)) : t) + '">' + esc(t) + '</button>').join('');
    sugBox.querySelectorAll('button').forEach(b => b.onclick = () => { if (busy) return; open(false); ask(b.dataset.q); });
    fitSugs();
  }
  // short windows: drop suggestions from the top of the stack rather than let them run into the map buttons
  function fitSugs() {
    const ctrls = document.querySelector('.ctrls'); if (!ctrls || !sugBox.children.length) return;
    sugBox.querySelectorAll('button[hidden]').forEach(b => { b.hidden = false; });
    const limit = ctrls.getBoundingClientRect().bottom + 10, bs = [...sugBox.children];
    for (const b of bs) { if (bs.filter(x => !x.hidden).length <= 1 || b.getBoundingClientRect().top >= limit) break;
      const c = ctrls.getBoundingClientRect(), r = sugBox.getBoundingClientRect(); if (r.left > c.right || r.right < c.left) break; b.hidden = true; }
  }
  addEventListener('resize', () => requestAnimationFrame(fitSugs));
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
  let turnSubject = null, turnChoices = null; // turnChoices: places to pick from when a name was ambiguous
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
    log.querySelectorAll('.ai-next').forEach(x => x.remove()); turnSubject = null; turnChoices = null;
    const mine = bubble('user', esc(text)); history.push({ role: 'user', content: text });
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
      next = turnChoices ? turnChoices.map(c => 'Take me to ' + c.label).slice(0, 5) : withTellMore(next, turnSubject); if (next.length) pills(next);
      // a tall answer with cards: start at the first card rather than the bottom, so its headline numbers are in view
      let c1 = mine.nextElementSibling; while (c1 && !c1.classList.contains('ccard')) c1 = c1.nextElementSibling;
      if (c1 && log.scrollHeight - (c1.offsetTop - log.offsetTop) > log.clientHeight) log.scrollTop = c1.offsetTop - log.offsetTop - 8;
    } catch (e) { bubble('bot err', esc(e.message)); }
    finally { thinking.remove(); status(''); busy = false; $('aiSend').disabled = false; history = history.slice(-40); }
  }
  const LABEL = { describe_view: 'Looking at the map…', move_camera: 'Moving the camera…', add_site_note: 'Saving the note…', watch: 'Updating the watchlist…', air_traffic: 'Checking the air traffic…', market_data: 'Reading the market numbers…', field_notes: 'Looking through field notes…', data_sources: 'Checking the data sources…', filter_map: 'Filtering the map…', query_filings: 'Looking through the filings…', highlight_filings: 'Highlighting…', open_filing: 'Opening the filing…', fly_to: 'Moving the map…', stop_orbit: 'Stopping…', set_map_options: 'Changing the map…', highlight_area: 'Outlining the area…', nearby_places: 'Looking up what’s nearby…', compare_areas: 'Setting up the comparison…', show_view: 'Switching view…', reset_map: 'Resetting…', distance_and_drive_time: 'Routing…', set_live_layers: 'Changing the map…', weather_at: 'Checking the weather…', project_news: 'Searching the news…', web_search: 'Searching the web…', site_imagery: 'Searching NASA imagery…', demographics: 'Looking up census data…', weather_forecast: 'Getting the forecast…', summarize_filings: 'Summarizing…', show_chart: 'Building the chart…', location_info: 'Looking up the location…' };

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
  async function nominatim(q, world = false) {
    const area = world ? '&addressdetails=1&limit=10' : '&limit=6&countrycodes=us&viewbox=-106.7,36.5,-93.5,25.8&bounded=1';
    try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2' + area + '&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
      return r.ok ? fromNominatim(await r.json()) : []; } catch (e) { return []; }
  }
  // the part after the first comma says where ("Lyon, France", "Paris, TX"); Texas, a Texas town or nothing keeps it local
  const elsewhere = name => { const c = name.split(',').slice(1).join(',').trim().toLowerCase(); if (!c) return false;
    return !/\b(tx|texas)\b/.test(c) && !TOWNS().some(t => t.toLowerCase() === c) && !/^(usa|us|united states)$/.test(c); };
  const LOCAL_FINE = new Set(['street', 'area']);
  const ambiguous = (name, cands) => ({ ambiguous: true, candidates: cands, error: '“' + name + '” could be ' + cands.map(c => c.label).join(' or ') + '. Ask the user which one (offer these as the follow-up options); don’t guess.' });
  // Every lookup must land on the place itself or fail: a wrong guess used to fly the map to e.g. "Houston Avenue, Pasadena"
  // before the model retried with the street address.
  async function resolvePlace(name) {
    for (const [re, to] of ALIAS) name = name.replace(re, to);
    const n = name.toLowerCase().replace(/,?\s*(tx|texas)$/, '').trim();
    const d = districtFor(name); if (d) return { c: d.c, label: d.name, kind: 'district', zoom: d.zoom };
    const town = (ctx.DATA.places || []).find(p => p[0].toLowerCase() === n);
    if (town) return { c: [town[1], town[2]], label: town[0] + ', TX', kind: 'town' };
    const towns = TOWNS();
    // somewhere else on Earth: the whole world, MapTiler first, OpenStreetMap for what it doesn't know
    if (elsewhere(name)) {
      const world = await nominatim(name, true), cands = placeCandidates(name, world, towns);
      if (cands) return ambiguous(name, cands);
      let w = pickPlace(name, await ctx.geocode(name, { world: true, limit: 8 }), towns);
      if (w.error) { const w2 = pickPlace(name, world, towns); if (!w2.error) w = w2; }
      return w;
    }
    const q = name + (/texas|\btx\b/i.test(name) ? '' : ', Texas');
    let p = pickPlace(name, await ctx.geocode(q, { exact: true }), towns);
    if (p.error) { const p2 = pickPlace(name, await ctx.geocode(q), towns); if (!p2.error) p = p2; }
    if (p.error) { const p3 = pickPlace(name, await nominatim(q), towns); if (!p3.error) p = p3; }
    if (p.error) { const head = name.split(',')[0].replace(/\s+(hotel|inn|suites)$/i, ''); if (head !== name.split(',')[0]) { const p4 = pickPlace(head, await nominatim(head + ', ' + (name.split(',').slice(1).join(',') || 'Texas')), towns); if (!p4.error) p = p4; } }
    // a landmark, street or address found in Texas is what a local user means; a bare town or region name may be
    // somewhere else ("Paris", "Georgia", "Lyon"): check the world, and ask when more than one place fits
    if (!p.error && ['poi', 'address', 'district'].includes(p.kind) || /texas|\btx\b/i.test(name)) return p;
    const world = await nominatim(name, true), cands = placeCandidates(name, world, towns);
    if (cands) return ambiguous(name, cands);
    // only a local street or neighbourhood shares the name of a well-known place elsewhere ("Lyon" → Lyon St, Houston)
    const famous = world.find(r => ['place', 'region', 'country'].includes(r.type) && r.imp >= 0.5 && r.name.toLowerCase() === name.split(',')[0].trim().toLowerCase());
    if (!p.error && LOCAL_FINE.has(p.kind) && famous && !famous.tx) return ambiguous(name, [{ label: famous.short || famous.t, full: famous.t, c: famous.c, kind: famous.type === 'place' ? 'town' : famous.type }, { label: p.label, full: p.label, c: p.c, kind: p.kind }]);
    if (p.error) { let w = pickPlace(name, world, towns); if (w.error) { const w2 = pickPlace(name, await ctx.geocode(name, { world: true, limit: 8 }), towns); if (!w2.error) w = w2; } return w.error ? p : w; }
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
    if (a.status?.length) spec.st = a.status;
    if (a.sqft_min > 0) spec.sqmin = Math.round(a.sqft_min);
    if (a.sqft_max > 0) spec.sqmax = Math.round(a.sqft_max);
    if (a.company) spec.co = String(a.company).slice(0, 80);
    if (a.exact_only) spec.exact = 1;
    if (a.min_units > 0) spec.umin = Math.round(a.min_units);
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
  const GROUP = { county: f => f.county, city: f => f.city, use: f => f.use, type: f => f.type, status: f => f.status, developer: f => f.dev || f.owner, month: f => (f.reg || '').slice(0, 7), year: f => (f.reg || '').slice(0, 4),
    quarter: f => f.reg ? f.reg.slice(0, 4) + '-Q' + (Math.floor((+f.reg.slice(5, 7) - 1) / 3) + 1) : '', start_month: f => (f.ts || '').slice(0, 7), finish_month: f => (f.te || '').slice(0, 7) };
  // only switch tabs when the user asked for the tab itself; otherwise the answer stays in the chat and a follow-up offers it
  const VIEW_ASK = /\b(tab|page)\b|\b(open|switch to|go to|take me to|pull up|bring up)\s+(the\s+)?(timeline|compare|comparison|activity|market|reports?|updates|field notes|sources)\b/i;
  const inBounds = () => { const b = ctx.map.getBounds(); return ctx.visible.filter(f => b.contains([f.lon, f.lat])); };
  // the point a lookup is about: a filing, coordinates, a named place, or what is open on screen
  async function pointFor(a) {
    const f = a.id && ctx.BY_ID.get(String(a.id).trim());
    if (f) return { c: [f.lon, f.lat], label: f.addr || f.name };
    if (isFinite(a.lat) && isFinite(a.lon) && a.lat && a.lon) return { c: [a.lon, a.lat], label: a.lat.toFixed(5) + ', ' + a.lon.toFixed(5) };
    if (a.place) { const p = await resolvePlace(String(a.place)); if (p.error) return { error: p.error }; return { c: p.c, label: p.label }; }
    if (ctx.state.sel) return { c: [ctx.state.sel.lon, ctx.state.sel.lat], label: ctx.state.sel.addr || ctx.state.sel.name };
    const b = ctx.currentBuilding?.(); if (b) return { c: b.center, label: b.title || 'this building' };
    const pl = ctx.currentPlace?.(); if (pl?.c) return { c: pl.c, label: pl.label };
    return { error: 'Say which address or place, or open a filing or building first.' };
  }
  let cardList = null; // the filings a tool worked on, for its chat card

  // every tool result can come with a card in the chat (src/chatcards.js), for typed and voice chat alike
  async function runTool(name, a) {
    cardList = null;
    const r = await runToolInner(name, a), card = ctx.chatCard?.(name, a, r, cardList);
    if (card) { const w = bubble('ccard', ''); w.appendChild(card); ctx.wireCites(w); scroll(); }
    return r;
  }
  async function runToolInner(name, a) {
    try {
      if (name === 'summarize_filings') {
        const sc = a.ids?.length ? 'ids' : a.scope || 'view';
        const list = sc === 'ids' ? a.ids.map(id => ctx.BY_ID.get(String(id).trim())).filter(Boolean) : sc === 'highlighted' ? ctx.highlighted().map(id => ctx.BY_ID.get(id)).filter(Boolean) : sc === 'filters' ? ctx.visible.slice() : inBounds();
        if (!list.length) return { error: sc === 'view' ? 'No filings are on the map in this view.' : sc === 'highlighted' ? 'Nothing is highlighted.' : 'No matching filings.' };
        cardList = list; const regs = list.map(f => f.reg).filter(Boolean).sort();
        const title = fmtN(list.length) + ' filing' + (list.length === 1 ? '' : 's') + ({ view: ' in view', filters: ' with the current filters', highlighted: ' highlighted', ids: '' }[sc]);
        return { title, scope_note: ctx.filterText() || '', ...summary(list), registered_from: regs[0], registered_to: regs[regs.length - 1], by_city: groups(list, f => f.city, 6), by_status: groups(list, f => f.status, 5),
          by_month: groups(list, GROUP.month, 36).sort((x, y) => x.name.localeCompare(y.name)), largest: list.slice().sort((x, y) => y.cost - x.cost).slice(0, 5).map(row), shown_as: 'a summary card in the chat' };
      }
      if (name === 'show_chart') {
        const { spec, notes } = await specFrom({ ...a, keep_current: a.keep_current ?? true }), list = matchList(spec), by = GROUP[a.group_by] ? a.group_by : 'county';
        const time = /month|quarter|year/.test(by), gs = groups(list, GROUP[by], time ? 60 : 12);
        const BYL = { start_month: 'estimated start month', finish_month: 'estimated finish month', month: 'month filed', quarter: 'quarter filed', year: 'year filed' };
        cardList = list;
        return { title: (a.metric === 'value' ? 'Est. value' : 'Filings') + ' by ' + (BYL[by] || by), group_by: by, metric: a.metric === 'value' ? 'value' : 'count', filters: describe(spec) || 'all', notes, filings: list.length, total_value: list.reduce((s, f) => s + f.cost, 0),
          groups: time ? gs.filter(g => g.name !== 'Unknown').sort((x, y) => x.name.localeCompare(y.name)) : gs, shown_as: 'a chart card in the chat' };
      }
      if (name === 'demographics') {
        const m = await ctx.loadMarket(); let sel = null, label = '', kind = 'address';
        const cn = String(a.county || (a.place && /county/i.test(a.place) ? a.place : '') || '').replace(/\s*county.*$/i, '').trim().toLowerCase();
        const co = cn && ctx.DATA.counties.find(x => x.name.toLowerCase() === cn);
        if (co) { sel = { geom: { type: 'MultiPolygon', coordinates: co.outline } }; label = co.name + ' County'; kind = 'county'; }
        else {
          let p; if (a.place) { p = await resolvePlace(String(a.place)); if (p.error) return p; kind = p.kind; } else { p = await pointFor(a); if (p.error) return p; }
          label = p.label; sel = { c: p.c, mi: a.radius_miles > 0 ? Math.min(25, a.radius_miles) : ({ town: 3, area: 1.5, county: 15 }[kind] ?? 1) };
        }
        const list = tractsFor(m.tracts, sel), s = summarizeTracts(list);
        if (!s) return { error: 'No census tract data there: it covers the counties loaded on the map.' };
        const home = sel.c ? m.tracts.find(t => t.geom && inGeom(sel.c, t.geom)) : null;
        turnSubject = label.split(',')[0];
        return { place: label, area: sel.geom ? 'all census tracts in the county' : 'census tracts within ' + sel.mi + ' mi', acs_year: m.year, growth_since: m.baseYear, ...s,
          ...(home ? { tract_at_point: { tract: home.g, population: home.pop, median_household_income: home.inc, median_home_value: home.val, median_gross_rent: home.rent, median_age: home.age } } : {}),
          note: 'Area medians are household-weighted averages of the tract medians, so they are approximate.', source: 'US Census ACS 5-year ' + m.year + ', by census tract' };
      }
      if (name === 'location_info') {
        const p = await pointFor(a); if (p.error) return p;
        const r = await fetch('api/building?' + new URLSearchParams({ lat: p.c[1].toFixed(6), lon: p.c[0].toFixed(6) })), d = await r.json().catch(() => ({}));
        if (!r.ok) return { error: d.error || 'Location lookup failed (' + r.status + ').' };
        const pc = d.parcel || {}, near = (x, y) => Math.hypot((x[0] - y[0]) * 0.87, x[1] - y[1]) < 0.0005;
        const filings = ctx.F.filter(f => near([f.lon, f.lat], p.c)).sort((x, y) => y.cost - x.cost).slice(0, 8);
        const lid = d.height?.source === '3dep-lidar' && d.height.height_m > 2 ? d.height.height_m : d.osm?.height_m || null;
        turnSubject = pc.situs || p.label;
        return { place: p.label, center: p.c, address: pc.situs || null, owner: pc.owner || null, market_value: pc.marketValue || null, year_built: pc.yearBuilt || null, land_area: pc.area || null, land_use: pc.landUse || null, county: pc.county || null,
          building_sqft: pc.buildingSqft || null, height_ft: lid ? Math.round(lid * 3.281) : null, floors: d.osm?.levels || pc.stories || null,
          businesses: (d.places || []).filter(x => near([x.lon, x.lat], p.c)).slice(0, 15).map(x => ({ name: x.name, kind: x.kind })), filings: filings.map(row),
          note: d.parcel ? undefined : 'No appraisal parcel record was found at this point.', source: 'Texas GIO parcels, OpenStreetMap, USGS lidar, TDLR TABS' };
      }
      if (name === 'filter_map') {
        const before = ctx.snapshot(), { spec, notes } = await specFrom(a);
        ctx.fromSpec(spec, { fly: true }); if (ctx.view !== 'map' && ctx.view !== 'timeline') ctx.setView('map');
        const list = ctx.visible; if (!spec.sel) ctx.fitToVisible(); cardList = list.slice();
        actionChip('Map: ' + (describe(spec, fmtM) || 'all filings') + ' · ' + fmtN(list.length) + ' filings · est. ' + fmtM(list.reduce((s, f) => s + f.cost, 0)), () => ctx.restore(before));
        return { applied: describe(spec) || 'all filings', notes, ...summary(list) };
      }
      if (name === 'query_filings') {
        const { spec, notes } = await specFrom({ ...a, keep_current: a.keep_current ?? false }), list = matchList(spec), lim = Math.max(1, Math.min(25, a.limit || 10)); cardList = list;
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
        else if (a.place) { const p = await resolvePlace(String(a.place));
          // several places fit: don't move; the model asks which one and the choices become tappable pills
          if (p.ambiguous) { turnChoices = p.candidates; return { ambiguous: true, question: 'Which one did you mean?', candidates: p.candidates.map(x => x.label), note: p.error }; }
          if (p.error) return { error: p.error }; c = p.c; label = p.label; kind = p.kind; if (p.zoom) zoom = p.zoom; }
        else if (ctx.state.sel) { const f = ctx.state.sel; c = [f.lon, f.lat]; label = f.name; kind = f.approx ? 'approx' : 'building'; }
        else if (ctx.currentBuilding?.()) { const b = ctx.currentBuilding(); c = b.center; label = b.title || 'this building'; kind = 'building'; }
        if (!c) return { error: 'Say a place, an address or which filings to go to.' };
        if (ctx.view !== 'map') ctx.setView('map');
        const def = zoom ?? ZOOM[kind] ?? 12;
        // a specific building/address/landmark stays close even if the model asks for a wide zoom
        // the model's zoom may nudge the default, never swap a neighbourhood view for a whole city
        // countries and states: whatever the model asks for (a whole continent is fine)
        zoom = a.zoom > 0 ? (['building', 'address', 'poi', 'area'].includes(kind) ? Math.max(a.zoom, def) : ['country', 'region'].includes(kind) ? a.zoom : Math.min(def + 2.5, Math.max(def - 0.75, a.zoom))) : def;
        if (kind === 'approx') zoom = Math.min(zoom, 14);
        zoom = Math.max(2, Math.min(19, zoom));
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
        ctx.clearPlace(); if (VIEW_ASK.test(lastUserText())) ctx.setView('compare');
        const base = ctx.filtered(), areas = ctx.compare.list().map(ar => { const l = base.filter(f => d3.geoContains(ar.geom, [f.lon, f.lat])); return { area: ar.label, filings: l.length, total_value: l.reduce((s, f) => s + f.cost, 0), new_builds: l.filter(f => f.type === 'New').length, largest: l.sort((x, y) => y.cost - x.cost).slice(0, 3).map(row) }; });
        actionChip('Comparing ' + done.join(', ')); return { compared: areas, ...(missed.length ? { not_found: missed } : {}) };
      }
      if (name === 'stop_orbit') { ctx.stopOrbit(); return { stopped: true }; }
      if (name === 'set_map_options') { const done = ctx.setMapOptions(a); actionChip('Map: ' + done.join(', ')); return { changed: done }; }
      if (name === 'distance_and_drive_time') { if (!ctx.live) return { error: 'Not available.' }; const d = await ctx.live.drive(a); return d; } // the chat card shows it, with Clear Route
      if (name === 'set_live_layers') { if (!ctx.live) return { error: 'Not available.' }; if (ctx.view !== 'map') ctx.setView('map'); const done = await ctx.live.set(a); actionChip('Map: ' + done.join(', ')); return { changed: done, now_on: Object.entries(ctx.live.state()).filter(([, v]) => v).map(([k]) => k) }; }
      if (name === 'weather_at') { if (!ctx.live) return { error: 'Not available.' }; return ctx.live.weather(a); }
      if (name === 'weather_forecast') { if (!ctx.live) return { error: 'Not available.' }; return ctx.live.forecast(a); }
      if (name === 'project_news') { if (!ctx.live) return { error: 'Not available.' }; return ctx.live.news(a); }
      if (name === 'site_imagery') { if (!ctx.live) return { error: 'Not available.' }; if (ctx.view !== 'map') ctx.setView('map'); const d = await ctx.live.imagery(a); if (d.showing) actionChip('NASA imagery on the map: ' + d.showing.name + ' ' + d.showing.day); else if (d.passes?.length) actionChip('Found ' + d.passes.length + ' NASA passes · previews in the card'); return d; }
      if (name === 'web_search') {
        const r = await fetch('api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: a.query, near: a.near || turnSubject || '', local: !!ctx.nearestPlace?.(ctx.map.getCenter().toArray()) }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) return { error: d.error || 'Web search failed.' };
        // one chip with the cited sites as links (the spoken / written answer comes from the model)
        bubble('act', '<span class="ai-ai">Searched the web' + (d.sources.length ? ': ' : '') + '</span>' + d.sources.slice(0, 5).map(x => '<a class="ai-src" href="' + esc(x.url) + '" target="_blank" rel="noopener" title="' + esc(x.title) + '">' + esc(x.site) + '</a>').join(' · '));
        return { answer: d.answer, sources: d.sources.map(s => ({ site: s.site, title: s.title })) };
      }
      if (name === 'show_view') {
        if (!VIEW_ASK.test(lastUserText())) return { not_switched: true, note: 'The user did not ask for that tab, so it was not opened. Answer in the chat and offer "Open the ' + ({ who: 'Activity', changes: 'Updates' }[a.view] || a.view[0].toUpperCase() + a.view.slice(1)) + ' tab" as a follow-up option.' };
        ctx.setView(a.view); actionChip('Opened ' + ({ map: 'the map', timeline: 'the timeline', compare: 'Compare', who: 'Activity', changes: 'Updates', market: 'Market', reports: 'Reports' }[a.view] || a.view)); return { view: a.view }; }
      if (name === 'air_traffic') {
        // the open card, a named place or filing, else the map center
        let p = await pointFor(a);
        if (p.error && !a.place && !a.id) { const c = ctx.map.getCenter(); p = { c: [c.lng, c.lat], label: ctx.viewPlace?.() || 'the map center' }; }
        if (p.error) return p;
        const miles = Math.min(25, Math.max(0.5, a.radius_miles || 3));
        const [live, hist] = await Promise.all([ctx.planesNear(p.c, miles).catch(e => ({ error: e.message })), a.history === false ? null : ctx.airHistory(p.c, 1)]);
        const ac = live.aircraft || [];
        return { place: p.label, radius_miles: miles,
          live: live.error ? { error: live.error } : { as_of: live.time, source: live.source, count: ac.length, low_count: ac.filter(x => !x.ground && x.alt != null && x.alt < 3000).length,
            aircraft: ac.slice(0, 12).map(x => ({ callsign: x.flight, type: x.type, registration: x.reg, altitude_ft: x.ground ? 0 : x.alt, on_ground: x.ground, speed_kt: x.gs, heading: x.track, miles_away: x.miles })) },
          history: !hist ? undefined : hist.history ? { window_days: hist.days, sampled_days: hist.sampled_days, low_sightings_per_day_within_1km: hist.low_per_day, lowest_ft: hist.lowest_ft,
            note: 'Aircraft below 3,000 ft seen in 5-minute snapshots within ~1 km; an exposure index (more = more low traffic), not a count of flights.' } : { available: false, note: hist.note } };
      }
      if (name === 'market_data') {
        const d = await ctx.marketData?.(a.county || ''); if (!d) return { error: 'The Market view isn’t loaded in this version.' }; if (d.error) return d;
        const t = a.topic || 'all', SEC = d.jobs?.sec ? d.jobs.sec.map((n, i) => [i, n]).sort((x, y) => y[1] - x[1]).slice(0, 5) : [];
        const out = { area: d.area, data_built: d.built };
        if (t === 'all' || t === 'population') out.population = d.pop || 'not available';
        if (t === 'all' || t === 'jobs') out.jobs = d.jobs ? { jobs: d.jobs.n, growth_pct: d.jobs.gr != null ? Math.round(d.jobs.gr * 10) / 10 : null, year: d.jobs.year, base_year: d.jobs.baseYear, top_industries: SEC.map(([i, n]) => ({ industry: SECTORS[i]?.[1] || i, jobs: n })) } : 'not built yet';
        if (t === 'all' || t === 'permits') out.housing_permits = d.permits ? { by_year: d.permits.map(r => ({ year: r.y, single_family_units: r.sf, multifamily_units: r.mf, value: r.value })), year_to_date: d.ytd || null } : 'not built yet';
        if (t === 'all' || t === 'businesses') out.new_businesses = d.biz ? { per_month: d.biz.slice(-24), newest: (d.latest || []).slice(0, 15).map(x => ({ name: x.name, owner: x.owner, address: x.addr, city: x.city, county: x.county, permit_date: x.date, industry: SECTORS[x.sec]?.[1] || null })) } : 'not built yet';
        if (t === 'all' || t === 'spending') out.consumer_spending_estimate = d.spend ? { per_year: d.spend.total, per_household: d.spend.perHH, by_category: d.spend.cats, ce_year: d.spend.year, note: 'Estimate: Census household incomes × BLS Consumer Expenditure Survey (South region).' } : 'not built yet';
        if (t === 'all' || t === 'sales_tax') out.city_sales_tax = d.tax ? { monthly_total: d.tax.slice(-24), cities_last_12_months: (d.taxCities || []).slice(0, 15).map(c => ({ city: c.city, county: c.county, last_12_months: c.last12, prior_12_months: c.prior12 })), note: 'Texas Comptroller allocations: the cities\' share of sales tax, about 2 months behind; a measure of taxable local spending.' } : 'not built yet';
        if (t === 'all' || t === 'news') out.news = d.news ? d.news.slice(0, 12).map(x => ({ title: x.title, source: x.domain, date: x.date, place: x.place, url: x.url })) : 'not built yet';
        return out;
      }
      if (name === 'field_notes') {
        const db = ctx.field?.db || { notes: [], watch: [] }, words = String(a.query || '').toLowerCase().split(/\s+/).filter(Boolean);
        let center = null; if (a.near) { const p = await resolvePlace(String(a.near)); if (p.error) return p; center = p.c; }
        const mi = (x, y) => miles(center, [x, y]), R = Math.min(50, Math.max(0.25, a.radius_miles || 3));
        const ok = (txt, x, y) => (!words.length || words.every(w => txt.toLowerCase().includes(w))) && (!center || mi(x, y) <= R);
        const kind = a.kind || 'both';
        const notes = kind === 'watchlist' ? [] : db.notes.filter(n => ok([n.title, n.text, n.tag].join(' '), n.lng, n.lat))
          .map(n => ({ title: n.title || 'Untitled', tag: n.tag, text: (n.text || '').slice(0, 300), photos: (n.photos || []).length, added: n.created?.slice(0, 10), by: n.by || n.created_by_email || null, lat: n.lat, lon: n.lng, ...(center ? { miles_away: Math.round(mi(n.lng, n.lat) * 10) / 10 } : {}) }));
        const watch = kind === 'notes' ? [] : db.watch.filter(w => ok([w.label, w.sub, w.kind].join(' '), w.lng, w.lat))
          .map(w => ({ kind: w.kind, label: w.label, detail: w.sub, filing_id: w.kind === 'filing' ? w.ref : undefined, added: w.added?.slice(0, 10) }));
        return { notes_total: db.notes.length, watchlist_total: db.watch.length, notes: notes.slice(0, 25), watchlist: watch.slice(0, 25), note: db.notes.length || db.watch.length ? undefined : 'No field notes or watched items yet.' };
      }
      if (name === 'data_sources') return ctx.sourcesList?.() || { error: 'The Sources tab isn’t loaded.' };
      if (name === 'describe_view') {
        const card = ctx.state.sel ? { kind: 'filing', ...row(ctx.state.sel) } : ctx.currentBuilding?.() ? { kind: 'building', ...ctx.currentBuilding() } : null;
        return { screen: ctx.screenContext(), open_card: card, labels: ctx.viewLabels?.() || null };
      }
      if (name === 'move_camera') {
        const m = ctx.map, b = m.getBounds(), cur = { center: m.getCenter().toArray(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch(), bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] };
        const t = cameraMove(cur, a); if (t.error) return { error: t.error };
        if (ctx.view !== 'map') ctx.setView('map');
        if (t.stop) ctx.stopOrbit();
        else if (t.orbit) ctx.orbitAt(cur.center, Math.max(cur.zoom, 13));
        else if (t.region) document.getElementById('home')?.click();
        else { ctx.stopOrbit(); m.easeTo({ ...(t.center ? { center: t.center } : {}), ...(t.zoom != null ? { zoom: t.zoom } : {}), ...(t.bearing != null ? { bearing: t.bearing } : {}), ...(t.pitch != null ? { pitch: t.pitch } : {}), duration: ctx.reduceMotion ? 0 : 700 }); }
        actionChip(t.label); if (t.orbit || t.stop || t.region) return { done: t.label }; return { done: t.label, zoom: +(t.zoom ?? cur.zoom).toFixed(1), pitch: Math.round(t.pitch ?? cur.pitch), bearing: Math.round(t.bearing ?? cur.bearing) };
      }
      if (name === 'add_site_note') {
        if (!ctx.addNote) return { error: 'Field notes are not available.' };
        const where = a.where || (a.place ? 'place' : ctx.state.sel || ctx.currentBuilding?.() ? 'selected' : 'center');
        let at = null, label = 'the map center';
        if (where === 'selected') { const f = ctx.state.sel, bd = ctx.currentBuilding?.(); if (f) { at = [f.lon, f.lat]; label = f.name; } else if (bd) { at = bd.center; label = bd.title || 'this building'; } else return { error: 'No card is open. Say where the note goes (here = map center, my location, or a place).' }; }
        else if (where === 'place') { const p = await resolvePlace(String(a.place || '')); if (p.error) return p; at = p.c; label = p.label; }
        else if (where === 'center') at = ctx.map.getCenter().toArray();
        if (ctx.view !== 'map') ctx.setView('map');
        const n = await ctx.addNote({ at, gps: where === 'me', title: a.title || '', text: a.text || '', tag: a.tag || 'Other' });
        if (where === 'me') label = 'your location';
        actionChip('Saved note' + (n?.title ? ' “' + n.title + '”' : '') + ' at ' + label);
        return { saved: true, title: n?.title || '', tag: n?.tag, at: label, shared: !!ctx.team?.summary?.(), note: 'The note card is open so photos can be added.' };
      }
      if (name === 'watch') {
        if (!ctx.field?.setWatch) return { error: 'The watchlist is not available.' };
        let info = null;
        if (a.filing_id) { const f = ctx.BY_ID.get(String(a.filing_id).trim()); if (!f) return { error: 'That filing isn’t loaded.' }; info = { kind: 'filing', f }; }
        else if (ctx.state.sel) info = { kind: 'filing', f: ctx.state.sel };
        else if (ctx.currentBuilding?.()) { const bd = ctx.currentBuilding(); info = { kind: 'building', center: bd.center, label: () => bd.title || 'Building', sub: () => '' }; }
        if (!info) return { error: 'Open a filing or building first, or name the filing.' };
        const on = ctx.field.setWatch(info, a.on !== false), what = info.kind === 'filing' ? info.f.name : info.label();
        actionChip((on ? 'Watching ' : 'Stopped watching ') + what); return { watching: on, item: what, watchlist_size: ctx.field.db.watch.length };
      }
      if (name === 'reset_map') { const before = ctx.snapshot(); ctx.resetAll(); actionChip('Reset the map', () => ctx.restore(before)); return { reset: true, filings: ctx.visible.length }; }
      return { error: 'Unknown tool ' + name };
    } catch (e) { console.error(e); return { error: e.message }; }
  }
  ctx.runAssistantTool = runTool;

  // ---------- voice (OpenAI Realtime over WebRTC) ----------
  let pc = null, dc = null, mic = null, audio = null, meter = null, voiceT = 0, liveBubble = null, pendingCalls = 0, vocab = '', turnT = 0;
  const live = $('aiLive'), liveT = $('aiLiveT'), liveS = $('aiLiveS'), orb = $('aiOrb');
  // the panel's look follows the conversation: listening (calm), hearing you (reacts to the mic), thinking (spinning ring),
  // speaking (reacts to the assistant's voice)
  const stateOf = t => /^Connect/.test(t) ? 'connecting' : /^Speaking/.test(t) ? 'speaking' : /^Listening…/.test(t) ? 'hearing' : /^Listening/.test(t) ? 'listening' : 'thinking';
  const setLive = (t, s) => { liveT.textContent = t; if (s != null) liveS.textContent = s; live.dataset.state = stateOf(t); };
  let heard = '';
  async function startVoice() {
    if (pc) { stopVoice(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) { ctx.toast('Voice needs a browser with microphone and WebRTC support.'); return; }
    open(false); live.hidden = false; el.classList.add('voice'); $('aiMic').classList.add('on'); setLive('Connecting…', 'Allow the microphone if asked');
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const r = await fetch('api/realtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context: context() }) });
      const s = await r.json().catch(() => ({})); if (!r.ok || !s.value) throw new Error(s.error || 'Voice isn’t available right now.'); vocab = s.vocab || '';
      pc = new RTCPeerConnection(); audio = new Audio(); audio.autoplay = true; audio.playsInline = true;
      pc.ontrack = e => { audio.srcObject = e.streams[0]; meter?.addRemote?.(e.streams[0]); };
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
    clearTimeout(voiceT); clearTimeout(turnT); cancelAnimationFrame(meter?.raf || 0); meter?.ac?.close?.().catch?.(() => {}); meter = null;
    try { dc?.close(); } catch (e) {} try { pc?.close(); } catch (e) {} mic?.getTracks().forEach(t => t.stop());
    if (audio) { audio.srcObject = null; audio = null; } pc = dc = mic = null; liveBubble = null;
    live.hidden = true; el.classList.remove('voice'); $('aiMic').classList.remove('on'); if (msg) ctx.toast(msg);
  }
  // levels for the orb: the mic while the user talks, the assistant's audio while it speaks
  function startMeter() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(), bars = orb.querySelectorAll('.ai-bars i');
      const tap = stream => { const an = ac.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = .75; ac.createMediaStreamSource(stream).connect(an); return { an, buf: new Uint8Array(an.frequencyBinCount) }; };
      const micA = tap(mic); let remA = null;
      meter = { ac, raf: 0, addRemote: s => { try { remA = tap(s); } catch (e) {} } };
      const SHAPE = [.55, .8, .95, 1, .95, .8, .55]; let lv = 0;
      const tick = () => {
        const st = live.dataset.state, src = st === 'speaking' ? remA : st === 'hearing' || st === 'listening' ? micA : null;
        let bandsV = SHAPE.map(() => 0);
        if (src) { src.an.getByteFrequencyData(src.buf); bandsV = SHAPE.map((s, i) => Math.min(1, src.buf[2 + i * 5] / 220) * s); }
        const now = bandsV.reduce((a, b) => a + b, 0) / bandsV.length; lv += (now - lv) * .25;
        orb.style.setProperty('--lv', lv.toFixed(3));
        bars.forEach((b, i) => { b.style.transform = st === 'thinking' || st === 'connecting' ? '' : 'scaleY(' + (0.22 + bandsV[i] * 1.5).toFixed(2) + ')'; });
        meter.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { /* the orb is decoration only */ }
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
      case 'input_audio_buffer.speech_started': heard = ''; setLive('Listening…', 'Pause when you’re done, or tap Send'); $('aiSendNow').hidden = false; break;
      case 'conversation.item.input_audio_transcription.delta': heard += e.delta || ''; if (heard.trim()) liveS.textContent = '“' + heard.trim().slice(-90) + '”'; break;
      case 'input_audio_buffer.speech_stopped': setLive('Thinking…'); $('aiSendNow').hidden = true; break;
      // a turn ended: the reply waits for its transcript (see below); if the transcriber never answers, reply anyway
      case 'input_audio_buffer.committed': clearTimeout(turnT); turnT = setTimeout(() => sendEv({ type: 'response.create' }), 6000); break;
      case 'conversation.item.input_audio_transcription.failed': clearTimeout(turnT); sendEv({ type: 'response.create' }); break;
      case 'conversation.item.input_audio_transcription.completed': {
        clearTimeout(turnT);
        const t = (e.transcript || '').trim();
        // noise, other languages, background fragments and the transcriber echoing its own hint list: drop the turn, don't answer it
        if (isNoise(t) || isPromptEcho(t, vocab)) { if (e.item_id) sendEv({ type: 'conversation.item.delete', item_id: e.item_id }); setLive('Listening', 'Talk naturally. I’ll answer when you pause.'); break; }
        bubble('user', esc(t)); history.push({ role: 'user', content: t }); setLive('Thinking…', '“' + t.slice(-90) + '”');
        sendEv({ type: 'response.create' }); break;
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
  $('aiSendNow').onclick = () => { sendEv({ type: 'input_audio_buffer.commit' }); $('aiSendNow').hidden = true; setLive('Thinking…', ''); }; // the transcript starts the reply
  ctx.assistant = { open, close, ask, startVoice };
}
