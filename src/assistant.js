// AI assistant: chat (text) and voice (OpenAI Realtime over WebRTC) that act on the map through tools.
// Tool calls from either channel run here, against the filings loaded in the browser (see lib/agent-tools.mjs).
import { makeMatcher, describe, miles } from './lib/filter.mjs';
import { entityKey } from './lib/taxonomy.mjs';

const SPARK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 1.5l1.6 3.9 3.9 1.6-3.9 1.6L8 12.5 6.4 8.6 2.5 7l3.9-1.6z"/><path d="M13 11.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg>';
const MIC = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="6.2" y="1.8" width="5.6" height="9.2" rx="2.8"/><path d="M3.5 8.6a5.5 5.5 0 0 0 11 0M9 14.1v2.4"/></svg>';
const SEND = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15V3M4 8l5-5 5 5"/></svg>';
const X = '<svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const SUGGEST = ['Show medical projects over $5M filed in the last year', 'Who are the most active developers right now?', 'What’s under construction within 5 miles of Katy?', 'Show a heatmap of new construction by value', 'Take me to downtown Houston and orbit around it', 'Find the biggest multifamily projects and highlight the top 5'];

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
      <button class="btn" id="aiStop" type="button">End</button>
    </div>
    <form class="ai-f" id="aiForm" autocomplete="off">
      <textarea id="aiQ" rows="1" maxlength="1500" placeholder="Ask, or tell the map what to show…" aria-label="Message the assistant" enterkeyhint="send"></textarea>
      <button class="ai-mic" id="aiMic" type="button" aria-label="Talk to the assistant" title="Talk (voice)">${MIC}</button>
      <button class="ai-send" id="aiSend" type="submit" aria-label="Send">${SEND}</button>
    </form>
  </aside>
  <button class="ai-fab" id="aiFab" type="button" aria-controls="ai">${SPARK}<span>Ask AI</span></button>`;
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
  $('aiFab').onclick = () => open(); $('aiClose').onclick = close; document.getElementById('askLaunch')?.addEventListener('click', () => open());
  $('aiNew').onclick = () => { history = []; thread = null; log.innerHTML = ''; renderEmpty(); ctx.clearHighlight(); };
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.target.closest('input,textarea,select,[contenteditable]')) { e.preventDefault(); open(); }
    if (e.key === 'Escape' && app.classList.contains('ai-open') && document.activeElement === q) close();
  });
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
  const context = () => ({ coverage: ctx.coverage(), filters: ctx.filterText() || 'none (default view)' });
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
    bubble('user', esc(text)); history.push({ role: 'user', content: text });
    const thinking = bubble('bot pending', '<span class="dots"><i></i><i></i><i></i></span>'); status('Thinking…');
    try {
      let input = [{ role: 'user', content: text }];
      for (let round = 0; round < 6; round++) {
        const m = await post(input);
        if (m.text) { thinking.before(bubble('bot', ctx.richText(m.text))); ctx.wireCites(log); history.push({ role: 'assistant', content: m.text }); }
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
    } catch (e) { bubble('bot err', esc(e.message)); }
    finally { thinking.remove(); status(''); busy = false; $('aiSend').disabled = false; history = history.slice(-40); }
  }
  const LABEL = { filter_map: 'Filtering the map…', query_filings: 'Looking through the filings…', highlight_filings: 'Highlighting…', open_filing: 'Opening the filing…', fly_to: 'Moving the map…', stop_orbit: 'Stopping…', set_map_options: 'Changing the map…', show_view: 'Switching view…', reset_map: 'Resetting…' };

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
  async function resolvePlace(name) {
    const n = name.toLowerCase().replace(/,?\s*(tx|texas)$/, '').trim();
    const town = (ctx.DATA.places || []).find(p => p[0].toLowerCase() === n);
    if (town) return { c: [town[1], town[2]], label: town[0] + ', TX' };
    const g = await ctx.geocode(name + (/texas|\btx\b/i.test(name) ? '' : ', Texas'));
    return g[0] ? { c: g[0].c, label: g[0].t } : null;
  }
  async function specFrom(a) {
    const base = a.keep_current ? ctx.curSpec() : { d: ctx.curSpec().d };
    const spec = { ...base }, notes = [];
    if (a.counties?.length) { const known = a.counties.filter(c => ctx.COUNTIES.includes(c)); if (known.length) spec.c = known; else notes.push('Counties not loaded: ' + a.counties.join(', ')); }
    if (a.types?.length) spec.t = a.types;
    if (a.uses?.length) spec.u = a.uses;
    if (a.min_value > 0) spec.min = Math.round(a.min_value);
    if (a.max_value > 0) spec.max = Math.round(a.max_value);
    if (a.keywords) spec.q = String(a.keywords).slice(0, 80);
    if (a.period) spec.d = ctx.periodSpec(a.period);
    if (a.date_field && (ym(a.date_from) || ym(a.date_to))) spec.d = { f: a.date_field, from: ym(a.date_from), to: ym(a.date_to) };
    if (a.changed) spec.chg = a.changed;
    if (a.developer) { const who = developerKey(a.developer, ctx.F); if (who) spec.who = who; else { spec.q = String(a.developer).slice(0, 80); notes.push('No developer key matched “' + a.developer + '”; searched the text instead.'); } }
    if (a.near_place) { const p = await resolvePlace(String(a.near_place)); if (p) spec.sel = { k: 'r', c: p.c, mi: Math.max(0.25, Math.min(60, a.radius_miles || 5)), label: p.label }; else notes.push('Couldn’t find “' + a.near_place + '” on the map.'); }
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
        if (ctx.view !== 'map') ctx.setView('map'); ctx.select(f, true); actionChip('Opened ' + f.name);
        return { opened: row(f), scope: f.scope || '', summary: f.sum || '', owner: f.owner, address: f.addr, architect: f.arch || null, gc: f.gc || null, approximate_location: !!f.approx };
      }
      if (name === 'fly_to') {
        let c = null, label = '';
        if (isFinite(a.lat) && isFinite(a.lon) && a.lat && a.lon) { c = [a.lon, a.lat]; label = a.lat.toFixed(4) + ', ' + a.lon.toFixed(4); }
        else if (a.place) { const p = await resolvePlace(String(a.place)); if (p) { c = p.c; label = p.label; } }
        if (!c) return { error: 'Couldn’t find that place.' };
        if (ctx.view !== 'map') ctx.setView('map');
        const zoom = Math.max(4, Math.min(18, a.zoom || (a.orbit ? 15.5 : 12)));
        if (a.orbit) ctx.orbitAt(c, zoom); else ctx.map.flyTo({ center: c, zoom, pitch: a.tilt ? 55 : ctx.map.getPitch(), duration: ctx.reduceMotion ? 0 : 1400 });
        actionChip((a.orbit ? 'Orbiting ' : 'Moved the map to ') + label); return { moved_to: label, orbiting: !!a.orbit };
      }
      if (name === 'stop_orbit') { ctx.stopOrbit(); return { stopped: true }; }
      if (name === 'set_map_options') { const done = ctx.setMapOptions(a); actionChip('Map: ' + done.join(', ')); return { changed: done }; }
      if (name === 'show_view') { ctx.setView(a.view); actionChip('Opened ' + ({ map: 'the map', timeline: 'the timeline', who: 'Activity', changes: 'Updates' }[a.view] || a.view)); return { view: a.view }; }
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
      dc.onopen = () => setLive('Listening', 'Talk naturally. I’ll show things on the map as we go.');
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
  async function onEvent(e) {
    switch (e.type) {
      case 'input_audio_buffer.speech_started': setLive('Listening…'); break;
      case 'input_audio_buffer.speech_stopped': setLive('Thinking…'); break;
      case 'conversation.item.input_audio_transcription.completed': if (e.transcript?.trim()) { bubble('user', esc(e.transcript.trim())); history.push({ role: 'user', content: e.transcript.trim() }); } break;
      case 'response.output_audio_transcript.delta':
        if (!liveBubble) liveBubble = bubble('bot', ''); liveBubble.dataset.t = (liveBubble.dataset.t || '') + e.delta; liveBubble.innerHTML = ctx.richText(liveBubble.dataset.t); scroll(); setLive('Speaking'); break;
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
  ctx.assistant = { open, close, ask, startVoice };
}
