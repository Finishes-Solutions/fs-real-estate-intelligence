// The project page's Files tab: reference files for the AI (a survey, existing floor plans, an earlier site plan).
// A file goes straight from the browser to the team's private storage on a one-time link (api/sitefiles.js), then the
// AI reads it into facts (lib/sitefiles.mjs), each with how sure it is and where it came from. Each fact is confirmed,
// corrected or dismissed here; only confirmed ones go to the AI with every site-plan call about this project (src/
// siteplan.js post). A confirmed floor plan with its width and depth can join the team's building library; a confirmed
// easement along a side of the lot can be drawn on an option as a no-build area. The list and the facts are kept with
// the project (p.files), so they sync with it; without storage set up on the site, the tab says so and nothing breaks.
import * as RF from './lib/sitefiles.mjs';

const CODE_KEY = 'fs-team-code', NAME_KEY = 'fs-team-name';
const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const KIND = { survey: 'Survey', floor_plan: 'Floor plans', site_plan: 'Site plan', plat: 'Plat', other: 'Document' };
const SIDE_OPTS = ['', ...RF.SIDES];
const NUMS = [['value', 'Value'], ['widthFt', 'Width (ft)'], ['depthFt', 'Depth (ft)'], ['beds', 'Beds'], ['baths', 'Baths'], ['stories', 'Stories']];
const fieldsFor = f => f.category === 'floor_plan' ? ['value', 'widthFt', 'depthFt', 'beds', 'baths', 'stories'] : f.category === 'easement' ? ['widthFt'] : ['value'];

// ctx: the app (toast, aiFor); esc: HTML escaping; project(pid): the project as it is now (a sync can replace the
// object); save(p): keep and share it; render(): draw the tab again; library: the team building library (save);
// optionsOf(p): the options an easement can be drawn on [{ id, name }]; addEasement(p, plid, points, fact, file) ->
// a message, or throws with what went wrong; when(iso): "2 days ago"
export function siteFiles({ ctx, esc, project, save, render, library, optionsOf, addEasement, when }) {
  const st = { setup: null, why: '', listed: new Set(), busy: new Map(), pct: new Map(), err: new Map(), editing: null, place: new Map() };
  const headers = () => ({ 'Content-Type': 'application/json', 'x-field-code': get(CODE_KEY) });
  async function call(pid, body, q) {
    const r = await fetch('api/sitefiles' + (body ? '' : '?pid=' + encodeURIComponent(pid) + (q || '')), body ? { method: 'POST', headers: headers(), body: JSON.stringify({ pid, ...body, ...(body.read ? ctx.aiFor?.('files') || {} : {}) }) } : { headers: headers() });
    const d = await r.json().catch(() => ({}));
    if (r.status === 503 && d.setup) { st.setup = d.setup; st.why = d.error || ''; }
    else if (r.status === 401) { st.setup = 'passcode'; st.why = d.error || 'Enter the team passcode under Settings.'; }
    else if (r.status === 404 || r.status === 405) { st.setup = 'none'; st.why = 'Reference files aren’t available on this copy of the site.'; }
    if (!r.ok) throw Object.assign(new Error(d.error || 'The file storage didn’t answer.'), { status: r.status, setup: d.setup });
    st.setup = null; st.why = ''; return d;
  }
  const P = pid => project(pid), F = (p, id) => (p?.files || []).find(f => f.id === id);
  const confirmed = p => (p?.files || []).reduce((n, f) => n + (f.facts || []).filter(x => x.status === 'ok').length, 0);

  // the storage's list once a visit per project: files the project doesn't know yet join it (unread); gone ones are marked
  async function list(pid) {
    if (st.listed.has(pid)) return; st.listed.add(pid);
    try { const d = await call(pid, null, ''), p = P(pid); if (!p) return; const was = JSON.stringify(p.files || []), next = RF.reconcile(p.files || [], d.files || []);
      if (JSON.stringify(next) !== was) { p.files = next; save(p); } else render(); }
    catch (e) { render(); }
  }

  async function upload(pid, files) {
    for (const file of files) {
      const t = RF.typeOf(file.name);
      if (!t) { ctx.toast(file.name + ': add a PDF, PNG, JPG, DXF or text file.'); continue; }
      if (file.size > RF.MAX_BYTES) { ctx.toast(file.name + ' is over 20 MB.'); continue; }
      if (!file.size) { ctx.toast(file.name + ' is empty.'); continue; }
      let slot; try { slot = await call(pid, { upload: { name: file.name, size: file.size } }); }
      catch (e) { ctx.toast(e.setup || e.status === 401 ? e.message : 'Couldn’t add ' + file.name + ': ' + e.message); render(); if (e.setup) return; continue; }
      let p = P(pid); if (!p) return;
      p.files = (p.files || []).concat([{ id: slot.id, path: slot.path, name: file.name.slice(0, 120), size: file.size, type: slot.type || t.mime, at: new Date().toISOString(), by: get(NAME_KEY), read: null, facts: [] }]);
      st.busy.set(slot.id, 'upload'); st.pct.set(slot.id, 0); save(p);
      try { await put(slot.url, file, slot.type || t.mime, n => { st.pct.set(slot.id, n); paintPct(slot.id); }); }
      catch (e) { st.busy.delete(slot.id); p = P(pid); if (p) { p.files = (p.files || []).filter(f => f.id !== slot.id); save(p); } ctx.toast('The upload of ' + file.name + ' didn’t finish: ' + e.message); continue; }
      st.busy.delete(slot.id); read(pid, slot.id);
    }
  }
  // the file on its one-time link, with progress (fetch can't report an upload's progress)
  const put = (url, file, type, onPct) => new Promise((ok, no) => {
    const x = new XMLHttpRequest(); x.open('PUT', url); x.setRequestHeader('Content-Type', type); x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = e => { if (e.lengthComputable) onPct(Math.round(e.loaded / e.total * 100)); };
    x.onload = () => x.status >= 200 && x.status < 300 ? ok() : no(new Error(x.status === 413 ? 'it’s too big' : 'storage said ' + x.status)); x.onerror = () => no(new Error('the connection dropped')); x.send(file);
  });
  const paintPct = id => { const el = document.querySelector('[data-fpct="' + CSS.escape(id) + '"]'); if (el) el.textContent = 'Uploading ' + (st.pct.get(id) || 0) + '%…'; };

  async function read(pid, id) {
    const f0 = F(P(pid), id); if (!f0) return; st.busy.set(id, 'read'); st.err.delete(id); render();
    try { const d = await call(pid, { read: { path: f0.path } }), p = P(pid), f = F(p, id); if (!f) return;
      f.read = { ...d.read, at: new Date().toISOString() }; f.facts = d.facts || []; delete f.readErr; save(p);
      ctx.toast(d.read?.readable === false ? 'The AI couldn’t read ' + f.name + '.' : f.name + ': ' + (d.facts?.length || 0) + ' facts to check.'); }
    catch (e) { const p = P(pid), f = F(p, id); if (f) { f.readErr = e.message; save(p); } }
    finally { st.busy.delete(id); render(); }
  }
  async function remove(pid, id) {
    const f = F(P(pid), id); if (!f) return; const n = (f.facts || []).filter(x => x.status === 'ok').length;
    if (!confirm('Delete ' + f.name + (n ? ' and its ' + n + ' confirmed fact' + (n === 1 ? '' : 's') : '') + '? This removes it for the team.')) return;
    st.busy.set(id, 'delete'); render();
    try { await call(pid, { remove: [f.path] }); } catch (e) { if (!e.setup && e.status !== 401) { st.busy.delete(id); render(); ctx.toast('Couldn’t delete ' + f.name + ': ' + e.message); return; } }
    st.busy.delete(id); const p = P(pid); if (p) { p.files = (p.files || []).filter(x => x.id !== id); save(p); } ctx.toast('Deleted ' + f.name + '.');
  }
  async function open(pid, id) {
    const f = F(P(pid), id); if (!f) return; const w = window.open('', '_blank'); // (opened now, while it's still the click: a pop-up blocker allows it)
    try { const d = await call(pid, null, '&open=' + encodeURIComponent(f.path)); if (w) w.location = d.url; else location.href = d.url; }
    catch (e) { w?.close(); ctx.toast('Couldn’t open ' + f.name + ': ' + e.message); }
  }
  function setFact(pid, id, fid, fn) { const p = P(pid), f = F(p, id), x = f?.facts?.find(q => q.id === fid); if (!x) return; fn(x, f, p); save(p); render(); }

  // ---------- the tab ----------
  function setupNote() {
    if (!st.setup) return '';
    const msg = st.setup === 'key' ? 'Reference files aren’t set up on this site: the team’s file storage isn’t connected. Facts already read stay here and still go to the AI.'
      : st.setup === 'bucket' ? 'Reference files aren’t set up on this site yet: the storage for them (the site-files bucket) hasn’t been created. Facts already read stay here and still go to the AI.'
      : st.why || 'Reference files aren’t available right now.';
    return '<p class="rnote pj-fsetup" role="status">' + esc(msg) + '</p>';
  }
  function factHtml(pid, fl, x) {
    const k = fl.id + ':' + x.id, editing = st.editing === k, s = x.status || 'new', libT = s === 'ok' && RF.floorPlanType(x, fl.name), place = s === 'ok' && RF.placeable(x), opts = place ? optionsOf(P(pid)) : [];
    if (editing) return '<li class="pj-fact editing" data-fk="' + esc(k) + '"><form class="pj-fedit" data-fform="' + esc(k) + '"><div class="pj-fg">' +
      '<label class="pj-fw">Name<input name="label" maxlength="100" value="' + esc(x.label || '') + '"></label><label class="pj-fw">What it says<textarea name="text" rows="2" maxlength="400">' + esc(x.text || '') + '</textarea></label>' +
      fieldsFor(x).map(n => '<label>' + (n === 'value' && x.category === 'floor_plan' ? 'Living area (sf)' : NUMS.find(q => q[0] === n)[1] + (n === 'value' && x.unit ? ' (' + esc(x.unit) + ')' : '')) +'<input name="' + n + '" inputmode="decimal" value="' + (x[n] ?? '') + '"></label>').join('') +
      (x.category === 'easement' || x.category === 'setback' || x.category === 'structure' ? '<label>Side of the lot<select name="side">' + SIDE_OPTS.map(o => '<option value="' + o + '"' + ((x.side || '') === o ? ' selected' : '') + '>' + (o || 'Not given') + '</option>').join('') + '</select></label>' : '') +
      '</div><div class="btnrow"><button class="btn sm primary">Save and Confirm</button><button type="button" class="btn sm ghost" data-fx="cancel" data-fk="' + esc(k) + '">Cancel</button></div></form></li>';
    const drawn = o => (x.placed || []).includes(o.id) && (!o.kos || o.kos.includes(String(x.label || 'Easement').slice(0, 60))), selO = opts.find(o => o.id === st.place.get(k)) || opts[0]; // (drawn there, and still on it)
    const act = (a, label, cls = '') => '<button type="button" class="btn sm' + cls + '" data-fx="' + a + '" data-fk="' + esc(k) + '">' + label + '</button>';
    const line = RF.factLine(x).replace(/^[^·]*· [^:]*: /, '');
    return '<li class="pj-fact s-' + s + '" data-fk="' + esc(k) + '"><div class="pj-ft"><span class="pj-fcat">' + esc(RF.CAT_LABEL[x.category] || 'Fact') + '</span><b>' + esc(x.label) + '</b>' +
      (x.confidence === 'unsure' ? '<i class="pj-conf" title="The AI wasn’t sure of this reading: check it against the file">unsure</i>' : '') + (x.edited ? '<i class="pj-conf ed">corrected</i>' : '') + '</div>' +
      '<p class="pj-fx">' + esc(line) + '</p>' + (x.source ? '<small class="pj-fsrc">From ' + esc(x.source) + '</small>' : '') +
      '<div class="pj-fact-a">' + (s === 'new' ? act('ok', 'Confirm', ' primary') + act('edit', 'Edit') + act('no', 'Dismiss', ' ghost')
        : s === 'ok' ? '<span class="pj-fst ok">Confirmed: goes to the AI</span>' + act('edit', 'Edit', ' ghost') + act('new', 'Undo', ' ghost') : '<span class="pj-fst">Dismissed</span>' + act('new', 'Undo', ' ghost')) +
        (libT ? (x.typeId && library.get?.(x.typeId) ? '<span class="pj-fst ok">In the building library</span>' : act('lib', 'Add to Building Library')) : '') +
        (place && opts.length ? '<span class="pj-fplace"><label class="sr" for="pjEo-' + esc(k) + '">Option</label><select id="pjEo-' + esc(k) + '" data-eo="' + esc(k) + '">' + opts.map(o => '<option value="' + esc(o.id) + '"' + (st.place.get(k) === o.id ? ' selected' : '') + '>' + esc(o.name) + (drawn(o) ? ' (drawn)' : '') + '</option>').join('') + '</select>' + (drawn(selO) ? '<span class="pj-fst ok">Drawn on this option</span>' : act('ease', 'Draw as No-Build Area')) + '</span>' : '') +
      '</div></li>';
  }
  function fileHtml(pid, fl) {
    const b = st.busy.get(fl.id), facts = fl.facts || [], shown = facts.filter(x => x.status !== 'no'), gone = facts.filter(x => x.status === 'no'), sure = facts.filter(x => x.status === 'new' && x.confidence === 'sure').length;
    const ext = RF.extOf(fl.name).toUpperCase() || 'FILE', r = fl.read;
    const status = b === 'upload' ? '<p class="rnote loading" data-fpct="' + esc(fl.id) + '">Uploading ' + (st.pct.get(fl.id) || 0) + '%…</p>' : b === 'read' ? '<p class="rnote loading" role="status">The AI is reading it (up to a couple of minutes for a long PDF)…</p>' : b === 'delete' ? '<p class="rnote loading">Deleting…</p>'
      : fl.missing ? '<p class="rnote err">This file is no longer in the team’s storage; its facts stay here.</p>' : fl.readErr ? '<p class="rnote err">' + esc(fl.readErr) + ' <button type="button" class="lnk" data-fread="' + esc(fl.id) + '">Try again</button></p>' : !r ? '<p class="rnote">Not read yet. <button type="button" class="lnk" data-fread="' + esc(fl.id) + '">Read it</button></p>' : '';
    return '<article class="pj-file" data-fid="' + esc(fl.id) + '"><div class="pj-fh"><span class="pj-fic" aria-hidden="true">' + esc(ext) + '</span><div class="pj-fm"><b title="' + esc(fl.name) + '">' + esc(fl.name) + '</b><span>' +
        [kb(fl.size || 0), r ? KIND[r.kind] || 'Document' : '', 'added ' + (when ? when(fl.at) : '') + (fl.by ? ' by ' + esc(fl.by) : '')].filter(Boolean).join(' · ') + '</span></div>' +
        '<span class="pj-fa">' + (fl.missing ? '' : '<button type="button" class="lnk" data-fopen="' + esc(fl.id) + '">Open</button>') + (r && !b && !fl.missing ? '<button type="button" class="lnk" data-fread="' + esc(fl.id) + '">Read Again</button>' : '') + '<button type="button" class="lnk pj-pdel" data-fdel="' + esc(fl.id) + '"' + (b ? ' disabled' : '') + '>Delete</button></span></div>' + status +
      (r ? '<p class="pj-fsum">' + esc(r.title ? r.title + ': ' : '') + esc(r.summary || '') + '</p>' + (r.readable === false || r.unreadable ? '<p class="rnote err">' + esc(r.readable === false ? 'The AI couldn’t read this file' + (r.unreadable ? ': ' + r.unreadable : '.') : 'Not all of it could be read: ' + r.unreadable) + '</p>' : '') : '') +
      (shown.length ? '<ul class="pj-facts">' + shown.map(x => factHtml(pid, fl, x)).join('') + '</ul>' : r && r.readable !== false && !facts.length ? '<p class="rnote">No facts found in it.</p>' : '') +
      (gone.length ? '<details class="pj-fgone"><summary>' + gone.length + ' dismissed</summary><ul class="pj-facts">' + gone.map(x => factHtml(pid, fl, x)).join('') + '</ul></details>' : '') +
      (sure > 1 ? '<div class="btnrow"><button type="button" class="btn sm" data-fsure="' + esc(fl.id) + '" title="Confirm every fact the AI read clearly; check the unsure ones one by one">Confirm the ' + sure + ' Sure Facts</button></div>' : '') + '</article>';
  }
  function html(p) {
    if (!st.listed.has(p.id)) setTimeout(() => list(p.id));
    const files = p.files || [], n = confirmed(p), off = st.setup === 'key' || st.setup === 'bucket' || st.setup === 'none';
    return '<section class="pj-box pj-files" id="pjFiles" aria-labelledby="pjFilesH"><h3 class="pj-h3" id="pjFilesH">Reference files' + (n ? '<span class="pj-tn">' + n + ' confirmed fact' + (n === 1 ? '' : 's') + ' go to the AI</span>' : '') + '</h3>' +
      '<p class="rnote">Add a survey, existing floor plans or an earlier site plan. The AI reads each file and lists what it found, how sure it is and where it saw it. Check each fact: confirm it, correct it or dismiss it. Only confirmed facts go to the AI when it plans, builds, reviews, changes or answers questions about this project’s options.</p>' + setupNote() +
      (off ? '' : '<div class="pj-drop" data-fdrop><input type="file" id="pjFileIn" class="sr" multiple accept="' + RF.ACCEPT + '"><span><b>Drop files here</b> or </span><button type="button" class="btn sm" data-fpick>Choose Files</button><small>PDF, PNG, JPG, DXF, TXT or CSV · up to 20 MB each</small></div>') +
      (files.length ? '<div class="pj-flist">' + files.slice().reverse().map(f => fileHtml(p.id, f)).join('') + '</div>' : '<p class="rnote pj-fnone">No reference files yet.</p>') + '</section>';
  }
  function wire(p, root) {
    const sec = root.querySelector('#pjFiles'); if (!sec) return; const pid = p.id;
    const inp = sec.querySelector('#pjFileIn'), drop = sec.querySelector('[data-fdrop]');
    sec.querySelector('[data-fpick]')?.addEventListener('click', () => inp?.click());
    if (inp) inp.onchange = () => { const fs = [...inp.files]; inp.value = ''; if (fs.length) upload(pid, fs); };
    if (drop) { drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) upload(pid, fs); }; }
    sec.querySelectorAll('[data-fopen]').forEach(b => b.onclick = () => open(pid, b.dataset.fopen));
    sec.querySelectorAll('[data-fread]').forEach(b => b.onclick = () => { const f = F(P(pid), b.dataset.fread), n = (f?.facts || []).filter(x => x.status === 'ok').length; if (n && !confirm('Read ' + f.name + ' again? Its facts are replaced, the ' + n + ' confirmed one' + (n === 1 ? '' : 's') + ' too.')) return; read(pid, b.dataset.fread); });
    sec.querySelectorAll('[data-fdel]').forEach(b => b.onclick = () => remove(pid, b.dataset.fdel));
    sec.querySelectorAll('[data-fsure]').forEach(b => b.onclick = () => { const p1 = P(pid), f = F(p1, b.dataset.fsure); if (!f) return; for (const x of f.facts || []) if (x.status === 'new' && x.confidence === 'sure') x.status = 'ok'; save(p1); render(); });
    sec.querySelectorAll('[data-eo]').forEach(s => s.onchange = () => { st.place.set(s.dataset.eo, s.value); render(); });
    sec.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => {
      const [id, fid] = b.dataset.fk.split(':'), a = b.dataset.fx;
      if (a === 'cancel') { st.editing = null; render(); return; }
      if (a === 'edit') { st.editing = b.dataset.fk; render(); root.querySelector('[data-fform="' + CSS.escape(b.dataset.fk) + '"] input')?.focus(); return; }
      if (a === 'ok' || a === 'no' || a === 'new') { setFact(pid, id, fid, x => { x.status = a; }); return; }
      if (a === 'lib') { setFact(pid, id, fid, (x, f) => { const t = library.save(RF.floorPlanType(x, f.name)); if (t) { x.typeId = t.id; ctx.toast(t.name + ' is in the building library (Team): add it from any option’s Add section.'); } }); return; }
      if (a === 'ease') { const p1 = P(pid), f = F(p1, id), x = f?.facts?.find(q => q.id === fid), sel = sec.querySelector('[data-eo="' + CSS.escape(b.dataset.fk) + '"]'), plid = sel?.value; if (!x || !plid) return;
        try { const msg = addEasement(p1, plid, x, f.name); x.placed = [...new Set([...(x.placed || []), plid])]; save(p1); render(); ctx.toast(msg); } catch (e) { ctx.toast(e.message); } }
    });
    sec.querySelectorAll('[data-fform]').forEach(fm => fm.onsubmit = e => { e.preventDefault(); const [id, fid] = fm.dataset.fform.split(':'), v = new FormData(fm);
      setFact(pid, id, fid, x => { const label = String(v.get('label') || '').trim(), text = String(v.get('text') || '').trim(); if (label) x.label = label.slice(0, 100); if (text) x.text = text.slice(0, 400);
        for (const n of fieldsFor(x)) { const s = String(v.get(n) ?? '').trim(), q = +s.replace(/,/g, ''); x[n] = s === '' ? null : Number.isFinite(q) && q >= 0 ? q : x[n]; }
        if (v.has('side')) x.side = RF.SIDES.includes(v.get('side')) ? v.get('side') : null; x.edited = true; x.status = 'ok'; st.editing = null; }); });
  }
  return { html, wire, confirmed, refs: p => RF.refsForAI(p?.files) };
}
