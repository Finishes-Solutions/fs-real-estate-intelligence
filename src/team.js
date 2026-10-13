// Team sync for field notes, through /api/field (Supabase behind it, no sign-in). The device copy in field.js stays the
// working store, so everything works offline; this pushes local changes, queues deletes, and pulls the team's notes,
// photos and watchlist. Last edit wins. Optional shared passcode when the site sets FIELD_ACCESS_CODE.
const QKEY = 'fs-team-queue-v1', NAME_KEY = 'fs-team-name', CODE_KEY = 'fs-team-code';
const t = s => Date.parse(s || 0) || 0;
const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });

export function initTeam(ctx) {
  const { esc } = ctx;
  let configured = null, needCode = false, msg = '', lastSync = null, syncing = null, again = null, timer = 0, failedPhotos = 0;
  let queue = []; try { queue = JSON.parse(get(QKEY) || '[]'); } catch (e) {}
  const saveQueue = () => put(QKEY, JSON.stringify(queue));
  const name = () => get(NAME_KEY).trim();

  async function api(opts = {}, query = '') {
    const r = await fetch('api/field' + query, { ...opts, headers: { 'Content-Type': 'application/json', 'x-field-code': get(CODE_KEY), ...(opts.headers || {}) } });
    if (r.status === 401) { needCode = true; configured = true; throw Object.assign(new Error('passcode'), { quiet: true }); }
    if (r.status === 503 || r.status === 404) { configured = false; throw Object.assign(new Error('off'), { quiet: true }); }
    configured = true; needCode = false;
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error ' + r.status);
    return r;
  }

  function schedule(ms = 1500) { clearTimeout(timer); timer = setTimeout(() => sync().catch(() => {}), ms); }
  function sync() {
    if (!navigator.onLine || !ctx.field) return Promise.resolve();
    if (syncing) return (again ||= syncing.then(() => { again = null; return sync(); })); // one more full pass after the running one
    syncing = (async () => {
      const F = ctx.field, db = F.db;
      // 1. photos taken on this device -> shared/<note>/<photo>.jpg
      failedPhotos = 0;
      for (const n of db.notes) {
        if (n.synced && t(n.updated) <= t(n.synced)) continue;
        const out = [];
        for (const key of n.photos) {
          if (String(key).includes('/')) { out.push(key); continue; }
          const blob = await F.localPhoto(key).catch(() => null); if (!blob) continue;
          const path = 'shared/' + n.id + '/' + key + '.jpg';
          try { await api({ method: 'POST', body: JSON.stringify({ photo: { path, data: await b64(blob) } }) }); await F.putPhoto(path, blob).catch(() => {}); await F.delPhoto(key).catch(() => {}); out.push(path); }
          catch (e) { if (e.quiet) throw e; failedPhotos++; out.push(key); }
        }
        n.photos = out;
      }
      // 2. changed notes, new stars and deletes
      const dirty = db.notes.filter(n => !n.synced || t(n.updated) > t(n.synced)), stars = db.watch.filter(w => !w.synced), sent = queue.slice();
      if (dirty.length || stars.length || sent.length) {
        await api({ method: 'POST', body: JSON.stringify({ notes: dirty, watch: stars, deletes: sent, name: name() }) });
        queue = queue.filter(q => !sent.includes(q)); saveQueue();
        for (const n of dirty) { if (n.photos.every(p => String(p).includes('/'))) n.synced = n.updated; if (!n.by && name()) n.by = name(); }
        stars.forEach(w => { w.synced = true; });
      }
      // 3. the team's notes and watchlist
      const remote = await (await api()).json(), cur = F.db, byId = new Map(cur.notes.map(n => [n.id, n])), seen = new Set();
      for (const r of remote.notes) {
        seen.add(r.id);
        const l = byId.get(r.id), dirtyHere = l && (!l.synced || t(l.updated) > t(l.synced));
        if (dirtyHere && t(l.updated) >= t(r.updated)) continue; // my newer edit goes up next time
        const n = { ...r, synced: r.updated };
        if (l) Object.assign(l, n); else cur.notes.push(n);
      }
      cur.notes = cur.notes.filter(n => seen.has(n.id) || !n.synced || t(n.updated) > t(n.synced)); // removed by a teammate
      const rw = new Map(remote.watch.map(w => [w.kind + '|' + w.ref, w])), pendingDel = new Set(queue.filter(q => q.kind === 'watch').map(q => q.wkind + '|' + q.ref));
      const keep = cur.watch.filter(w => !w.synced && !rw.has(w.kind + '|' + w.ref)); // starred here since the push
      cur.watch = remote.watch.filter(w => !pendingDel.has(w.kind + '|' + w.ref)).map(w => ({ ...(cur.watch.find(x => x.kind === w.kind && x.ref === w.ref) || {}), ...w, synced: true })).concat(keep);
      F.replace(cur);
      lastSync = new Date(); msg = failedPhotos ? failedPhotos + ' photo' + (failedPhotos > 1 ? 's' : '') + ' couldn’t upload; they stay on this device and will retry.' : '';
    })().catch(e => { if (!e.quiet) msg = 'Sync failed: ' + e.message + ' Changes are kept on this device.'; });
    return syncing.finally(() => { syncing = null; paint(); });
  }
  setTimeout(() => schedule(0), 800);
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 120e3);
  addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!lastSync || Date.now() - lastSync > 30e3)) schedule(0); });

  // ---------- UI ----------
  // Two kinds of slot share one paint(): the full form in Settings › You & your team, and a one-line chip in the
  // Notes & watchlist and Projects headers that opens it. Slots that have left the page are dropped; painting never syncs.
  const slots = new Map(); // element -> 'form' | 'chip'
  let editCode = false;
  const ago = d => { const s = Math.round((Date.now() - d) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  const OFF = 'Team sharing isn’t set up on this site yet, so notes stay on this device.', OFF_TIP = 'Turned on by whoever runs this site, in its server settings.';
  const waiting = () => queue.length + (configured ? (ctx.field?.db?.notes || []).filter(n => !n.synced || t(n.updated) > t(n.synced)).length : 0);
  const PEOPLE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="5.5" r="2.3"/><path d="M1.8 13.5c.5-2.4 2.2-3.7 4.2-3.7s3.7 1.3 4.2 3.7"/><path d="M10.6 3.4a2.2 2.2 0 0 1 0 4.3M12.2 9.9c1 .5 1.7 1.7 2 3.6"/></svg>';
  function chipHtml() {
    const who = name(), state = configured === false ? 'On this device only' : needCode ? 'Team passcode needed' : configured ? 'Shared with the team' : 'Connecting…';
    return '<button type="button" class="team-chip' + (needCode ? ' warn' : '') + '" data-open-team title="Your name, team sharing and sync: Settings">' + PEOPLE + '<span>' + esc(state) + (who ? ' · ' + esc(who) : '') + '</span></button>';
  }
  function formHtml() {
    const code = get(CODE_KEY), n = waiting();
    let status;
    if (configured === false) status = '<div class="set-note" title="' + OFF_TIP + '">' + OFF + '</div>';
    else if (needCode) status = '<div class="set-note warn">Enter the team passcode to share notes and projects with the team.</div>';
    else status = '<div class="team-on"><span><i class="dot' + (configured ? ' on' : '') + '"></i>' + (configured ? 'Shared with the team · ' + (syncing ? 'syncing…' : lastSync ? 'synced ' + ago(lastSync) : 'not synced yet') : 'Connecting…') +
      (n ? ' · ' + n + ' change' + (n > 1 ? 's' : '') + ' waiting' : '') + '</span><button class="btn sm" type="button" id="tSync">Sync now</button></div>';
    const showCode = needCode || editCode || !code;
    return status +
      '<label class="set-field"><span class="set-l">Your name</span><input id="tName" maxlength="60" autocomplete="name" placeholder="e.g. Matthew" value="' + esc(name()) + '"><span class="set-hint">Shown on notes and site plans you add or edit.</span></label>' +
      (showCode ? '<form class="set-field" id="tForm"><label class="set-l" for="tCode">Team passcode</label><span class="set-inline"><input id="tCode" type="password" autocomplete="current-password" placeholder="Team passcode"><button class="btn primary sm">' + (needCode ? 'Unlock' : 'Save') + '</button>' +
          (editCode ? '<button class="btn sm" type="button" id="tCodeCancel">Cancel</button>' : '') + '</span><span class="set-hint">Only needed if your team uses one. Ask a teammate for it.</span></form>'
        : '<div class="set-field"><span class="set-l">Team passcode</span><span class="set-inline"><span class="set-mask" aria-label="Passcode saved">••••••••</span><button class="btn sm" type="button" id="tCodeEdit">Change</button></span></div>') +
      (msg ? '<div class="set-note' + (/fail|couldn/i.test(msg) ? ' err' : '') + '">' + esc(msg) + '</div>' : '');
  }
  function paint(chipsOnly = false) {
    for (const [el, kind] of slots) {
      if (!el.isConnected) { slots.delete(el); continue; }
      if (kind !== 'chip' && chipsOnly) continue;
      if (kind === 'chip') { el.innerHTML = chipHtml(); el.querySelector('[data-open-team]').onclick = () => ctx.openSettings?.('team'); continue; }
      // the form: never redraw under someone typing in it
      if (el.contains(document.activeElement) && /^(INPUT)$/.test(document.activeElement.tagName)) { const s = el.querySelector('.team-on span'); if (s) { const tmp = document.createElement('div'); tmp.innerHTML = formHtml(); const ns = tmp.querySelector('.team-on span'); if (ns) s.innerHTML = ns.innerHTML; } continue; }
      el.innerHTML = '<div class="team">' + formHtml() + '</div>';
      el.querySelector('#tSync')?.addEventListener('click', () => { schedule(0); ctx.sitePlan?.sync?.(); });
      // typing a name saves it and updates the header chips; the form itself isn't redrawn (focus may be moving on)
      el.querySelector('#tName')?.addEventListener('input', e => { put(NAME_KEY, e.target.value.trim()); paint(true); });
      el.querySelector('#tCodeEdit')?.addEventListener('click', () => { editCode = true; paint(); el.querySelector('#tCode')?.focus(); });
      el.querySelector('#tCodeCancel')?.addEventListener('click', () => { editCode = false; paint(); });
      const f = el.querySelector('#tForm');
      if (f) f.onsubmit = e => { e.preventDefault(); const v = el.querySelector('#tCode').value.trim(); if (!v && !needCode) { editCode = false; paint(); return; } put(CODE_KEY, v); needCode = false; editCode = false; document.activeElement?.blur?.(); paint(); schedule(0); ctx.sitePlan?.sync?.(); };
    }
  }

  ctx.team = {
    // the Notes & watchlist header: a one-line chip that opens Settings › You & your team
    mount(el) { if (!el) return; slots.set(el, 'chip'); paint(); },
    chip(el) { if (!el) return; slots.set(el, 'chip'); paint(); },
    mountSettings(el) { if (!el) return; slots.set(el, 'form'); paint(); },
    name, refresh: () => paint(),
    summary: () => configured ? 'shared with the team' : null,
    changed: () => schedule(),
    removed(item) { if (item.kind === 'photo' && !String(item.path).includes('/')) return; queue.push(item); saveQueue(); schedule(); },
    canDelete: () => true,
    async download(path) { try { const r = await api({}, '?photo=' + encodeURIComponent(path)); return await r.blob(); } catch (e) { return null; } },
    sync: () => sync()
  };
}
