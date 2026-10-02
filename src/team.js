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

  // ---------- UI (inside the Field notes view) ----------
  let slot = null;
  const ago = d => { const s = Math.round((Date.now() - d) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  function paint() {
    if (!slot || !slot.isConnected) return;
    let h;
    if (configured === false) h = '<div class="rnote">Team sync is off on this site (it needs SUPABASE_SECRET_KEY on Vercel). Notes stay on this device.</div>';
    else if (needCode) h = '<form class="team-f" id="tForm"><span>Enter the team passcode to share notes.</span><input id="tCode" type="password" autocomplete="current-password" placeholder="Team passcode" aria-label="Team passcode"><button class="btn primary">Unlock</button></form>';
    else h = '<div class="team-on"><span>' + (configured ? 'Shared with the team · ' + (syncing ? 'syncing…' : lastSync ? 'synced ' + ago(lastSync) : 'not synced yet') : 'Connecting…') +
      (queue.length ? ' · ' + queue.length + ' change' + (queue.length > 1 ? 's' : '') + ' waiting' : '') + '</span><button class="btn" id="tSync">Sync now</button></div>' +
      '<label class="team-f"><span>Your name (shown on notes you add or edit)</span><input id="tName" maxlength="60" autocomplete="name" placeholder="e.g. Matthew" value="' + esc(name()) + '"></label>';
    slot.innerHTML = '<div class="team">' + h + (msg ? '<div class="rnote' + (/fail|couldn/i.test(msg) ? ' err' : '') + '">' + esc(msg) + '</div>' : '') + '</div>';
    slot.querySelector('#tSync')?.addEventListener('click', () => schedule(0));
    slot.querySelector('#tName')?.addEventListener('change', e => put(NAME_KEY, e.target.value.trim()));
    const f = slot.querySelector('#tForm'); if (f) f.onsubmit = e => { e.preventDefault(); put(CODE_KEY, slot.querySelector('#tCode').value.trim()); needCode = false; paint(); schedule(0); };
  }

  ctx.team = {
    mount(el) { slot = el; paint(); },
    summary: () => configured ? 'shared with the team' : null,
    changed: () => schedule(),
    removed(item) { if (item.kind === 'photo' && !String(item.path).includes('/')) return; queue.push(item); saveQueue(); schedule(); },
    canDelete: () => true,
    async download(path) { try { const r = await api({}, '?photo=' + encodeURIComponent(path)); return await r.blob(); } catch (e) { return null; } },
    sync: () => sync()
  };
}
