// Team sync for field notes: Supabase Auth (6-digit email code, @finishessolutions.com only) plus the field_notes,
// watchlist and field-photos tables (supabase/migrations/20261005000000_field_notes.sql). The device copy in field.js
// stays the working store, so everything works offline; this pushes local changes and pulls the team's.
// Notes are shared with the team (anyone can edit, only the author deletes); the watchlist is per person.
const SB_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const DOMAIN = 'finishessolutions.com';
const QKEY = 'fs-team-queue-v1';
const BUCKET = 'field-photos';
const t = s => Date.parse(s || 0) || 0;

export function initTeam(ctx) {
  const { esc, toast } = ctx;
  let sb = null, user = null, ready = null, configured = null, step = 'idle', email = '', busy = false, msg = '', lastSync = null, syncing = null, again = null, timer = 0;
  let queue = []; try { queue = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) {}
  const saveQueue = () => { try { localStorage.setItem(QKEY, JSON.stringify(queue)); } catch (e) {} };
  const isTeam = () => !!user && String(user.email || '').toLowerCase().endsWith('@' + DOMAIN);

  // ---------- client ----------
  async function connect() {
    if (sb) return sb;
    const cfg = await fetch('config.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    configured = !!cfg.supabase?.url && !!cfg.supabase?.key; if (!configured) { paint(); return null; }
    const { createClient } = await import(SB_JS);
    sb = createClient(cfg.supabase.url, cfg.supabase.key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'fs-team-auth' } });
    sb.auth.onAuthStateChange((ev, s) => { const was = user?.id; user = s?.user || null; if (user?.id !== was) { paint(); if (isTeam()) schedule(0); } });
    const { data } = await sb.auth.getSession(); user = data.session?.user || null;
    // a sign-in link lands with ?code=…; supabase-js has exchanged it by now, so tidy the address bar (filters live in the hash)
    if (/[?&]code=/.test(location.search)) { const u = new URL(location.href); u.searchParams.delete('code'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
    paint(); if (isTeam()) schedule(0);
    return sb;
  }
  ready = connect().catch(e => { console.error('team sync', e); configured = configured ?? false; msg = 'Team sync couldn’t load (' + e.message + ').'; paint(); });

  // ---------- sign in ----------
  async function sendCode(addr) {
    addr = String(addr || '').trim().toLowerCase();
    if (!new RegExp('^[^@\\s]+@' + DOMAIN.replace('.', '\\.') + '$').test(addr)) { msg = 'Use your @' + DOMAIN + ' email.'; paint(); return; }
    busy = true; msg = ''; paint();
    const { error } = await sb.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
    busy = false;
    if (error) msg = 'Couldn’t send the code: ' + error.message; else { email = addr; step = 'code'; msg = 'Check your email for a 6-digit code (or tap the link in it on this device).'; }
    paint();
  }
  async function verify(code) {
    code = String(code || '').replace(/\D/g, ''); if (code.length < 6) { msg = 'Enter the code from the email.'; paint(); return; }
    busy = true; msg = ''; paint();
    const { data, error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
    busy = false;
    if (error) { msg = /expired|invalid/i.test(error.message) ? 'That code is wrong or expired. Send a new one.' : error.message; paint(); return; }
    user = data.user || data.session?.user || null; step = 'idle'; msg = ''; paint();
    toast('Signed in. Syncing your field notes with the team…'); schedule(0);
  }
  async function signOut() {
    if (!confirm('Sign out? Notes stay on this device; changes made while signed out sync when you sign back in.')) return;
    await sb.auth.signOut().catch(() => {}); user = null; lastSync = null; paint();
  }

  // ---------- sync ----------
  function schedule(ms = 1500) { clearTimeout(timer); timer = setTimeout(() => sync().catch(e => { msg = 'Sync failed: ' + e.message; paint(); }), ms); }
  async function sync() {
    if (!sb || !isTeam() || !navigator.onLine) return;
    if (syncing) return (again ||= syncing.then(() => { again = null; return sync(); })); // one more full pass after the running one
    syncing = (async () => {
      const F = ctx.field, uid = user.id;
      // 1. deletions made on this device
      for (const q of queue.slice()) {
        let r;
        if (q.kind === 'note') r = await sb.from('field_notes').delete().eq('client_id', q.id);
        else if (q.kind === 'watch') r = await sb.from('watchlist').delete().eq('user_id', uid).eq('kind', q.wkind).eq('ref', q.ref);
        else if (q.kind === 'photo') r = String(q.path).startsWith(uid + '/') ? await sb.storage.from(BUCKET).remove([q.path]) : { error: null };
        if (!r?.error) queue = queue.filter(x => x !== q);
      }
      saveQueue();
      // 2. photos and notes changed here
      const db = F.db;
      for (const n of db.notes) {
        if (n.synced && t(n.updated) <= t(n.synced)) continue;
        const photos = [];
        for (const key of n.photos) {
          if (String(key).includes('/')) { photos.push(key); continue; }
          const blob = await F.localPhoto(key).catch(() => null); if (!blob) continue;
          const path = uid + '/' + n.id + '/' + key + '.jpg';
          const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
          if (error) { photos.push(key); continue; } // retried next sync
          await F.putPhoto(path, blob).catch(() => {}); await F.delPhoto(key).catch(() => {}); photos.push(path);
        }
        n.photos = photos;
        const { error } = await sb.from('field_notes').upsert({ client_id: n.id, lng: n.lng, lat: n.lat, title: n.title || '', body: n.text || '', tag: n.tag || 'Other', photos: photos.filter(p => p.includes('/')), created_at: n.created, updated_at: n.updated }, { onConflict: 'client_id' });
        if (error) throw new Error(error.message);
        if (photos.every(p => p.includes('/'))) n.synced = n.updated;
        if (!n.by) { n.by = user.email; n.owner = uid; }
      }
      if (db.watch.length) {
        const { error } = await sb.from('watchlist').upsert(db.watch.map(w => ({ user_id: uid, client_id: w.id, kind: w.kind, ref: w.ref, label: w.label, sub: w.sub, lng: w.lng, lat: w.lat, added_at: w.added })), { onConflict: 'user_id,kind,ref' });
        if (error) throw new Error(error.message);
      }
      // 3. the team's notes and my watchlist
      const [notes, watch] = await Promise.all([sb.from('field_notes').select('*').order('updated_at', { ascending: false }).limit(5000), sb.from('watchlist').select('*').eq('user_id', uid)]);
      if (notes.error) throw new Error(notes.error.message); if (watch.error) throw new Error(watch.error.message);
      const cur = F.db, byId = new Map(cur.notes.map(n => [n.id, n])), seen = new Set();
      for (const r of notes.data) {
        seen.add(r.client_id);
        const l = byId.get(r.client_id), dirty = l && (!l.synced || t(l.updated) > t(l.synced));
        if (l && dirty && t(l.updated) >= t(r.updated_at)) continue; // my newer edit goes up next time
        const n = { id: r.client_id, lng: r.lng, lat: r.lat, title: r.title, text: r.body, tag: r.tag, photos: r.photos || [], created: new Date(r.created_at).toISOString(), updated: new Date(r.updated_at).toISOString(),
          synced: new Date(r.updated_at).toISOString(), by: r.created_by_email, editedBy: r.updated_by_email, owner: r.created_by };
        if (l) Object.assign(l, n); else cur.notes.push(n);
      }
      // gone from the server and unchanged here: deleted by its author
      cur.notes = cur.notes.filter(n => seen.has(n.id) || !n.synced || t(n.updated) > t(n.synced));
      const local = new Map(cur.watch.map(w => [w.kind + '|' + w.ref, w]));
      cur.watch = watch.data.map(r => ({ id: local.get(r.kind + '|' + r.ref)?.id || r.client_id, kind: r.kind, ref: r.ref, label: r.label || '', sub: r.sub || '', lng: r.lng, lat: r.lat, added: new Date(r.added_at).toISOString() }))
        .concat(cur.watch.filter(w => !watch.data.some(r => r.kind === w.kind && r.ref === w.ref) && !queue.some(q => q.kind === 'watch' && q.ref === w.ref)));
      F.replace(cur);
      lastSync = new Date(); msg = '';
    })();
    try { await syncing; } finally { syncing = null; paint(); }
  }
  setInterval(() => { if (isTeam() && document.visibilityState === 'visible') schedule(0); }, 120e3);
  addEventListener('online', () => isTeam() && schedule(0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && isTeam() && (!lastSync || Date.now() - lastSync > 30e3)) schedule(0); });

  // ---------- UI (inside the Field notes view) ----------
  let slot = null;
  const ago = d => { const s = Math.round((Date.now() - d) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  function paint() {
    if (!slot || !slot.isConnected) return;
    let h;
    if (configured === false) h = '<div class="rnote">Team sync isn’t switched on for this site yet (it needs the Supabase publishable key on Vercel).</div>';
    else if (configured == null) h = '<div class="rnote">Connecting to team sync…</div>';
    else if (user && !isTeam()) h = '<div class="rnote">' + esc(user.email) + ' isn’t a Finishes Solutions address, so nothing is shared. <button class="lnk" id="tOut">Sign out</button></div>';
    else if (user) h = '<div class="team-on"><span>Shared with the team as <b>' + esc(user.email) + '</b> · ' + (syncing ? 'syncing…' : lastSync ? 'synced ' + ago(lastSync) : 'not synced yet') + (queue.length ? ' · ' + queue.length + ' change' + (queue.length > 1 ? 's' : '') + ' waiting' : '') + '</span>' +
      '<button class="btn" id="tSync">Sync now</button><button class="lnk" id="tOut">Sign out</button></div>';
    else if (step === 'code') h = '<form class="team-f" id="tForm"><span>Code sent to <b>' + esc(email) + '</b></span><input id="tCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-digit code" aria-label="Sign-in code">' +
      '<button class="btn primary" ' + (busy ? 'disabled' : '') + '>Sign in</button><button class="lnk" type="button" id="tBack">Use a different email</button></form>';
    else h = '<form class="team-f" id="tForm"><span>Sign in to share notes, photos and your watchlist with the team.</span><input id="tEmail" type="email" autocomplete="email" placeholder="you@' + DOMAIN + '" aria-label="Work email" value="' + esc(email) + '">' +
      '<button class="btn primary" ' + (busy ? 'disabled' : '') + '>Email me a code</button></form>';
    slot.innerHTML = '<div class="team">' + h + (msg ? '<div class="rnote' + (/fail|couldn|wrong|use your|isn/i.test(msg) ? ' err' : '') + '">' + esc(msg) + '</div>' : '') + '</div>';
    slot.querySelector('#tOut')?.addEventListener('click', signOut);
    slot.querySelector('#tSync')?.addEventListener('click', () => schedule(0));
    slot.querySelector('#tBack')?.addEventListener('click', () => { step = 'idle'; msg = ''; paint(); });
    const f = slot.querySelector('#tForm');
    if (f) f.onsubmit = e => { e.preventDefault(); if (busy) return; step === 'code' ? verify(slot.querySelector('#tCode').value) : sendCode(slot.querySelector('#tEmail').value); };
  }

  ctx.team = {
    mount(el) { slot = el; paint(); },
    summary: () => isTeam() ? 'shared with the team' : null,
    changed: () => { if (isTeam()) schedule(); },
    removed(item) { if (item.kind === 'photo' && !String(item.path).includes('/')) return; queue.push(item); saveQueue(); if (isTeam()) schedule(); },
    canDelete: n => !n.owner || !user || n.owner === user.id,
    async download(path) { await ready; if (!sb || !isTeam()) return null; const { data } = await sb.storage.from(BUCKET).download(path); return data || null; },
    sync: () => sync(), get user() { return user; }
  };
}
