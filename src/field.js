// Field data gathering: site notes (pin + text + tag + phone photos) and a watchlist of filings and buildings.
// Stored on this device (localStorage for records, IndexedDB for photos) and synced with the team through /api/field
// (Supabase) by src/team.js: notes, photos and the watchlist are shared. Export/import as GeoJSON (with photos), CSV or KML.
const KEY = 'fs-field-v1';
const TAGS = ['Opportunity', 'Competitor project', 'Under construction', 'Vacant land', 'For sale / lease', 'Follow up', 'Other'];

export function initField(ctx) {
  const { map, esc, fmtM, fmtN, F, BY_ID, CHANGED } = ctx, card = ctx.card, root = document.getElementById('view-field');
  let db = load(), photoDB = null, curNote = null;
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return { notes: d.notes || [], watch: d.watch || [] }; } catch (e) { return { notes: [], watch: [] }; } }
  function save(fromSync) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { ctx.toast('This browser won’t let the page save field data.'); } syncMap(); syncBadges(); if (ctx.view === 'field') render(); if (!fromSync) ctx.team?.changed(); }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---- photos in IndexedDB ----
  function idb() {
    if (photoDB) return photoDB;
    return photoDB = new Promise((res, rej) => { const r = indexedDB.open('fs-field', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  const tx = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('photos', mode), st = t.objectStore('photos'), out = fn(st); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
  const putPhoto = (id, blob) => tx('readwrite', st => st.put(blob, id));
  const localPhoto = id => tx('readonly', st => st.get(id));
  async function getPhoto(id) {
    const b = await localPhoto(id).catch(() => null); // a miss comes back as the IDBRequest, not undefined
    if (b instanceof Blob) return b; if (!String(id).includes('/') || !ctx.team) return null;
    const r = await ctx.team.download(id); if (r) await putPhoto(id, r).catch(() => {}); return r;
  }
  const delPhoto = id => tx('readwrite', st => st.delete(id));
  async function shrink(file) { // phone photos are 3-12 MB; store ~1600px JPEGs
    const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) return file;
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.82));
  }

  // ---- map layer for notes and watched buildings ----
  function fc() {
    return { type: 'FeatureCollection', features: [
      ...db.notes.map(n => ({ type: 'Feature', properties: { k: 'n', id: n.id }, geometry: { type: 'Point', coordinates: [n.lng, n.lat] } })),
      ...db.watch.filter(w => w.kind === 'building').map(w => ({ type: 'Feature', properties: { k: 'w', id: w.id }, geometry: { type: 'Point', coordinates: [w.lng, w.lat] } }))] };
  }
  function addLayers() {
    if (!map.getSource('fs-field')) map.addSource('fs-field', { type: 'geojson', data: fc() });
    if (!map.getLayer('fs-field')) map.addLayer({ id: 'fs-field', type: 'circle', source: 'fs-field', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 14, 9], 'circle-color': ['case', ['==', ['get', 'k'], 'n'], '#b7791f', '#4a3aa7'],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
  }
  function syncMap() { const s = map.getSource && map.getSource('fs-field'); if (s) s.setData(fc()); }
  ctx.onOverlays(addLayers);
  ctx.mapClickHandlers.unshift(e => {
    if (!map.getLayer('fs-field')) return false;
    const hit = map.queryRenderedFeatures(e.point, { layers: ['fs-field'] })[0]; if (!hit) return false;
    if (hit.properties.k === 'n') openNote(db.notes.find(n => n.id === hit.properties.id));
    else { const w = db.watch.find(x => x.id === hit.properties.id); if (w) { ctx.tabs?.arm(e); ctx.openBuildingAt([w.lng, w.lat]); } }
    return true;
  });

  function syncBadges() {
    const n = db.notes.length + db.watch.length, alerts = db.watch.filter(w => w.kind === 'filing' && CHANGED.has(w.ref)).length;
    // only watched filings that changed need attention (a badge that rolls up to My Work / More); otherwise a muted count
    if (alerts) ctx.setBadge?.('field', alerts, { alert: true, text: fmtN(alerts) + ' updated', title: 'Watched filings that changed in the latest nightly check' });
    else ctx.setBadge?.('field', n);
  }

  // ---- watch star on filing and building cards (and the assistant's watch tool) ----
  const watchKey = info => info.kind === 'filing' ? info.f.id : info.center.map(v => v.toFixed(5)).join(',');
  const findWatch = info => db.watch.find(w => w.kind === info.kind && w.ref === watchKey(info));
  // take an item off the watchlist; the toast's Undo puts it back where it was (and up to the team again as a new star)
  function unwatch(w) {
    const i = db.watch.indexOf(w); if (i < 0) return;
    db.watch.splice(i, 1); ctx.team?.removed({ kind: 'watch', wkind: w.kind, ref: w.ref }); save(); card.querySelector('.star')?._paint?.();
    ctx.toast('Removed from your watchlist.', { action: { label: 'Undo', run: () => {
      if (db.watch.some(x => x.kind === w.kind && x.ref === w.ref)) return;
      delete w.synced; db.watch.splice(Math.min(i, db.watch.length), 0, w); save(); card.querySelector('.star')?._paint?.(); } } });
  }
  function setWatch(info, on) {
    const w = findWatch(info);
    if (!on && w) { db.watch = db.watch.filter(x => x !== w); ctx.team?.removed({ kind: 'watch', wkind: w.kind, ref: w.ref }); }
    else if (on && !w && info.kind === 'filing') db.watch.unshift({ id: uid(), kind: 'filing', ref: watchKey(info), label: info.f.name, sub: (info.f.city || info.f.county) + ' · ' + fmtM(info.f.cost), lng: info.f.lon, lat: info.f.lat, added: new Date().toISOString() });
    else if (on && !w) db.watch.unshift({ id: uid(), kind: 'building', ref: watchKey(info), label: info.label(), sub: info.sub(), lng: info.center[0], lat: info.center[1], added: new Date().toISOString() });
    else return !!w;
    save(); card.querySelector('.star')?._paint?.(); return on;
  }
  // "☆ Watch" in the card's action row (src/app.js cardActs); cards without one get the star icon by the close button
  ctx.onCardRender(info => {
    const top = card.querySelector('.top'), x = top?.querySelector('.x'), slot = card.querySelector('.cact-w'); if (!x && !slot) return;
    card.querySelectorAll('.star').forEach(s => s.remove());
    const b = document.createElement('button'); b.type = 'button'; b.className = slot ? 'btn sm star' : 'x star'; b.setAttribute('aria-label', 'Add to watchlist');
    const icon = on => '<svg width="' + (slot ? 14 : 16) + '" height="' + (slot ? 14 : 16) + '" viewBox="0 0 16 16" fill="' + (on ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>';
    const paint = b._paint = () => { const on = !!findWatch(info); b.setAttribute('aria-pressed', on); b.title = on ? 'On your watchlist (My Work › Notes & watchlist). Click to remove.' : 'Add to your watchlist: you’ll see when it changes';
      b.innerHTML = icon(on) + (slot ? (on ? 'Watching' : 'Watch') : ''); if (slot) b.removeAttribute('aria-label'); };
    b.onclick = () => { const w = findWatch(info); if (w) { unwatch(w); paint(); return; } setWatch(info, true); paint(); ctx.toast('Added to My Work › Watchlist.'); };
    paint(); if (slot) slot.replaceWith(b); else x.before(b);
  });

  // ---- site notes ----
  // A new note is a draft held in memory: it joins the saved notes (and the map, and My Work) when something is typed or added to it,
  // or on Save. One closed while still empty leaves nothing behind. What is typed is saved as you go (see keep() below), photos too.
  const seeds = new WeakMap(); // the title a note was opened with (the parcel's address): not something the person typed
  const blank = n => !n.text.trim() && !n.photos.length && (!n.title.trim() || n.title === seeds.get(n));
  function persist(n, force) {
    const saved = db.notes.includes(n); if (!saved && !force && blank(n)) return false;
    n.updated = new Date().toISOString(); if (!saved) db.notes.unshift(n); save(); return true;
  }
  let pend = null, pendT = 0;
  const flushNote = () => { clearTimeout(pendT); const f = pend; pend = null; f?.(); };
  addEventListener('pagehide', flushNote);
  const shared = () => !!ctx.team?.summary?.();
  const where = () => shared() ? 'Shared with the team and saved on this device.' : 'Saved on this device only.';

  ctx.addNote = async ({ gps = false, at = null, title = '', text = '', tag = '', label = '', commit = false } = {}) => {
    let c = at || map.getCenter().toArray();
    if (gps && ctx.locate) { try { c = await ctx.locate(); } catch (e) { ctx.toast(e.message + ' Placed the note at the map center instead.'); } }
    const n = { id: uid(), lng: +c[0].toFixed(6), lat: +c[1].toFixed(6), title: String(title || label).slice(0, 120), text: String(text).slice(0, 4000), tag: TAGS.includes(tag) ? tag : TAGS[0], photos: [], created: new Date().toISOString(), updated: new Date().toISOString() };
    if (!title) seeds.set(n, n.title);
    if (commit || title || text) persist(n, true); // the assistant (or a caller with the words in hand) saves at once
    map.easeTo({ center: c, zoom: Math.max(map.getZoom(), 15), duration: ctx.reduceMotion ? 0 : 600 }); openNote(n, !title);
    return n;
  };

  async function openNote(n, isNew) {
    if (!n) return; flushNote(); ctx.closeCard(); curNote = n;
    const near = F.filter(f => Math.hypot((f.lon - n.lng) * 0.87, f.lat - n.lat) < 0.003).sort((a, b) => b.cost - a.cost).slice(0, 5);
    card.innerHTML = '<div class="top"><div><div class="kicker">Site note · ' + esc(new Date(n.created).toLocaleDateString()) + '</div><h2>' + esc(n.title || 'Untitled site') + '</h2><div class="bsub">' + n.lat.toFixed(5) + ', ' + n.lng.toFixed(5) + '</div></div>' +
      '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' +
      '<form class="nform" id="nForm"><label>Title<input name="title" maxlength="120" value="' + esc(n.title) + '" placeholder="e.g. NE corner FM 359 & US 290"></label>' +
      '<label>Tag<select name="tag">' + TAGS.map(t => '<option' + (t === n.tag ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>' +
      '<label>Notes<textarea name="text" rows="4" maxlength="4000" placeholder="What you saw, who to call, signage, asking price…">' + esc(n.text) + '</textarea></label>' +
      '<div class="nphotos" id="nPhotos"></div>' +
      '<label class="btn nadd">Add photos<input type="file" accept="image/*" capture="environment" multiple hidden id="nFile"></label>' +
      '<div class="btnrow"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="nGps">Move to My Location</button>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + n.lat + ',' + n.lng + '">Directions ↗</a>' +
      (navigator.share ? '<button class="btn" type="button" id="nShare">Share</button>' : '') + (ctx.team?.canDelete(n) === false ? '' : '<button class="btn" type="button" id="nDel">Delete</button>') + '</div></form>' + (n.by ? '<div class="rnote">Added by ' + esc(n.by) + (n.editedBy && n.editedBy !== n.by ? ' · last edited by ' + esc(n.editedBy) : '') + '</div>' : '') +
      (near.length ? '<div class="bsec"><div class="lt">Filings within ~300 m</div>' + near.map(f => '<button class="chitem" data-id="' + esc(f.id) + '"><span><b>' + esc(f.name) + '</b><em>' + esc(f.reg) + '</em></span><span class="m">' + fmtM(f.cost) + '</span></button>').join('') + '</div>' : '') +
      '<div class="rnote bsrc">' + where() + ' What you type is kept as you go. Use My Work › Notes &amp; watchlist → Export to back up or move to another device.</div>';
    card.classList.add('open');
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelectorAll('.chitem').forEach(x => x.onclick = () => ctx.select(BY_ID.get(x.dataset.id), false));
    const form = card.querySelector('#nForm');
    const read = () => { const fd = new FormData(form); Object.assign(n, { title: String(fd.get('title')).trim(), tag: fd.get('tag'), text: String(fd.get('text')) }); };
    // typing is saved a moment after it stops (and when the card closes), so closing without Save loses nothing
    const keep = () => { clearTimeout(pendT); pend = () => { read(); if (persist(n) && form.isConnected) card.querySelector('h2').textContent = n.title || 'Untitled site'; }; pendT = setTimeout(flushNote, 500); };
    form.addEventListener('input', keep); form.addEventListener('change', keep);
    form.onsubmit = e => { e.preventDefault(); clearTimeout(pendT); pend = null; read(); persist(n, true); card.querySelector('h2').textContent = n.title || 'Untitled site'; ctx.toast(shared() ? 'Note saved and shared with the team.' : 'Note saved on this device.'); };
    card.querySelector('#nDel') && (card.querySelector('#nDel').onclick = async () => {
      if (!confirm('Delete this site note and its photos?')) return;
      clearTimeout(pendT); pend = null;
      for (const p of n.photos) { await delPhoto(p).catch(() => {}); ctx.team?.removed({ kind: 'photo', path: p }); }
      if (db.notes.includes(n)) { ctx.team?.removed({ kind: 'note', id: n.id }); db.notes = db.notes.filter(x => x !== n); save(); }
      if (!ctx.cardBack?.()) ctx.closeCard(); // opened from a property or filing card: back to it
      ctx.toast('Note deleted.');
    });
    card.querySelector('#nGps').onclick = async () => { try { const c = await ctx.locate(); read(); n.lng = +c[0].toFixed(6); n.lat = +c[1].toFixed(6); persist(n); map.easeTo({ center: c }); openNote(n); } catch (e) { ctx.toast(e.message); } };
    card.querySelector('#nShare')?.addEventListener('click', () => navigator.share({ title: n.title || 'Site note', text: [n.title, n.tag, n.text].filter(Boolean).join('\n'), url: 'https://www.google.com/maps/search/?api=1&query=' + n.lat + ',' + n.lng }).catch(() => {}));
    card.querySelector('#nFile').onchange = async e => {
      for (const file of [...e.target.files].slice(0, 12)) { const id = 'p' + uid(); try { await putPhoto(id, await shrink(file)); n.photos.push(id); } catch (err) { ctx.toast('Couldn’t store that photo on this device.'); } }
      read(); persist(n); renderPhotos(n);
    };
    renderPhotos(n);
    if (isNew) setTimeout(() => form.querySelector(seeds.get(n) ? 'textarea[name=text]' : 'input[name=title]').focus(), 50); // an address already fills the title: start on the notes
  }
  async function renderPhotos(n) {
    const el = card.querySelector('#nPhotos'); if (!el) return; el.innerHTML = '';
    for (const id of n.photos) {
      const blob = await getPhoto(id).catch(() => null); if (!blob || curNote !== n) continue;
      const url = URL.createObjectURL(blob), d = document.createElement('div'); d.className = 'nph';
      d.innerHTML = '<a href="' + url + '" target="_blank" rel="noopener"><img src="' + url + '" alt="Site photo"></a><button type="button" aria-label="Remove photo">×</button>';
      d.querySelector('button').onclick = async () => { await delPhoto(id).catch(() => {}); ctx.team?.removed({ kind: 'photo', path: id }); n.photos = n.photos.filter(x => x !== id); persist(n); renderPhotos(n); };
      el.appendChild(d);
    }
  }
  ctx.onCardClose(() => { flushNote(); curNote = null; });

  // ---- Field view ----
  const dist = (a, b) => { const r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos((a[1] + b[1]) / 2 * r), y = (b[1] - a[1]) * r; return Math.sqrt(x * x + y * y) * 3958.8; };
  const WATCH_HOW = 'Tap the star on any filing or building to watch it. Watched filings are flagged here when the nightly refresh sees a status, value or date change.';
  function render() {
    const ctr = map.getCenter().toArray();
    const notes = db.notes.slice().sort((a, b) => b.updated.localeCompare(a.updated));
    const watch = db.watch.map(w => ({ ...w, f: w.kind === 'filing' ? BY_ID.get(w.ref) : null }));
    const watchSec = '<section><h3>Watchlist</h3>' + (watch.length ? watch.map(w => '<div class="witem"><button class="chitem" data-w="' + w.id + '"><span><b>' + (w.f && CHANGED.has(w.ref) ? '<span class="bdg new">' + (CHANGED.get(w.ref) === 'new' ? 'New' : 'Updated') + '</span>' : '') + esc(w.f ? w.f.name : w.label) + '</b><em>' + (w.kind === 'filing' ? (w.f ? esc((w.f.city || w.f.county) + ' · ' + (w.f.status || '') + ' · ' + w.f.ts + ' → ' + w.f.te) : 'No longer in the current data') : 'Building · ' + esc(w.sub || '')) + '</em></span><span class="m">' + (w.f ? fmtM(w.f.cost) : '') + '</span></button><button class="x" data-unw="' + w.id + '" aria-label="Remove">×</button></div>').join('')
        : '<div class="empty">' + WATCH_HOW + '</div>') + '</section>';
    const notesSec = '<section><h3>Site notes</h3>' + (notes.length ? notes.map(n => '<button class="chitem" data-n="' + n.id + '"><span><b>' + esc(n.title || 'Untitled site') + '</b><em>' + esc(n.tag) + ' · ' + esc(new Date(n.updated).toLocaleDateString()) + (n.photos.length ? ' · ' + n.photos.length + ' photo' + (n.photos.length > 1 ? 's' : '') : '') + (n.text ? ' · ' + esc(n.text.slice(0, 60)) : '') + '</em></span><span class="m">' + dist(ctr, [n.lng, n.lat]).toFixed(1) + ' mi</span></button>').join('')
        : '<div class="empty">No site notes yet. Tap the pin button on the map (or “+ Site note”) while you’re on site to save a location with notes and photos.</div>') + '</section>';
    const none = !notes.length && !watch.length;
    // header: + Site note, one Export ▾ menu (Import… is a real file picker inside it), and the team chip
    const menu = '<details class="vmenu"><summary class="btn">Export <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 3.5 3 3 3-3"/></svg></summary><div class="vm-pop" role="menu">' +
      '<button type="button" role="menuitem" id="fGeo">GeoJSON<em>Notes and watchlist, for GIS or another device</em></button><button type="button" role="menuitem" id="fGeoPh">GeoJSON with photos<em>Larger file; photos travel with the notes</em></button>' +
      '<button type="button" role="menuitem" id="fCsv">CSV<em>For a spreadsheet</em></button><button type="button" role="menuitem" id="fKml">KML<em>For Google Earth</em></button><hr>' +
      '<label role="menuitem" tabindex="0" class="vm-imp">Import…<em>A GeoJSON file exported from here</em><input type="file" accept=".geojson,.json,application/geo+json,application/json" hidden id="fImp"></label></div></details>';
    root.innerHTML = '<div class="vhead"><div><div class="kicker">Notes &amp; watchlist</div><h2>Your sites &amp; watchlist</h2><div class="vsub">' + fmtN(notes.length) + ' site note' + (notes.length === 1 ? '' : 's') + ' · ' + fmtN(watch.length) + ' watched</div></div>' +
      '<div class="vctl"><button class="btn primary" id="fAdd">+ Site note</button>' + menu + '<div class="team-slot" id="fTeam"></div></div></div>' +
      (none ? (ctx.vempty ? ctx.vempty({ icon: 'pin', title: 'No site notes or watched filings yet', text: 'Pin a note with photos while you’re on site, or star a filing or building to watch it.', extra: '<p class="ve-more" id="fHow" hidden>' + WATCH_HOW + '</p>', actions: [{ label: '+ Site note at map center', id: 'fAddC', primary: true }, { label: 'How the watchlist works', id: 'fHowBtn' }] }) : '')
        : '<div class="fcols">' + watchSec + notesSec + '</div>');
    root.querySelector('#fAddC')?.addEventListener('click', () => { ctx.setView('map'); ctx.addNote({}); });
    root.querySelector('#fHowBtn')?.addEventListener('click', e => { const h = root.querySelector('#fHow'); h.hidden = !h.hidden; e.currentTarget.setAttribute('aria-expanded', String(!h.hidden)); });
    root.querySelector('.vm-imp').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); root.querySelector('#fImp').click(); } });
    // on a phone (on site) the note goes where you stand; on a desktop it goes at the map center, like the button below (the note card has Move to My Location)
    root.querySelector('#fAdd').onclick = () => { ctx.setView('map'); ctx.addNote({ gps: matchMedia('(pointer: coarse)').matches }); };
    root.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { const n = db.notes.find(x => x.id === b.dataset.n); ctx.setView('map'); map.easeTo({ center: [n.lng, n.lat], zoom: Math.max(map.getZoom(), 15) }); openNote(n); });
    root.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const w = db.watch.find(x => x.id === b.dataset.w); ctx.setView('map'); if (w.kind === 'filing' && BY_ID.get(w.ref)) ctx.select(BY_ID.get(w.ref), true); else { map.easeTo({ center: [w.lng, w.lat], zoom: Math.max(map.getZoom(), 16.5) }); ctx.openBuildingAt([w.lng, w.lat]); } });
    root.querySelectorAll('[data-unw]').forEach(b => b.onclick = () => { const w = db.watch.find(x => x.id === b.dataset.unw); if (w) unwatch(w); });
    root.querySelector('#fGeo').onclick = () => exportGeo(false); root.querySelector('#fGeoPh').onclick = () => exportGeo(true);
    root.querySelector('#fCsv').onclick = exportCsv; root.querySelector('#fKml').onclick = exportKml;
    root.querySelector('#fImp').onchange = e => { const f = e.target.files[0]; e.target.value = ''; importGeo(f); }; // (cleared, so the same file can be chosen again)
    ctx.team?.mount(root.querySelector('#fTeam'));
  }
  ctx.onView('field', render);
  // team sync (src/team.js) reads and replaces the store through this
  ctx.field = { get db() { return db; }, setWatch, isWatched: info => !!findWatch(info), replace(next) { db = next; save(true); }, getPhoto, localPhoto: id => localPhoto(id).then(b => b instanceof Blob ? b : null), putPhoto, delPhoto, TAGS, render: () => { if (ctx.view === 'field') render(); } };

  // ---- export / import ----
  const stamp = () => new Date().toISOString().slice(0, 10);
  const blobToData = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  async function exportGeo(withPhotos) {
    const feats = [];
    for (const n of db.notes) {
      const props = { type: 'site-note', id: n.id, title: n.title, tag: n.tag, notes: n.text, created: n.created, updated: n.updated, photoCount: n.photos.length };
      if (withPhotos) { props.photos = []; for (const id of n.photos) { const b = await getPhoto(id).catch(() => null); if (b) props.photos.push(await blobToData(b)); } }
      feats.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [n.lng, n.lat] } });
    }
    for (const w of db.watch) feats.push({ type: 'Feature', properties: { type: 'watch-' + w.kind, id: w.id, ref: w.ref, label: w.label, sub: w.sub, added: w.added, tabsLink: w.kind === 'filing' ? 'https://www.tdlr.texas.gov/TABS/Projects/' + w.ref : undefined }, geometry: { type: 'Point', coordinates: [w.lng, w.lat] } });
    ctx.saveFile('field-notes-' + stamp() + '.geojson', JSON.stringify({ type: 'FeatureCollection', features: feats }), 'application/geo+json');
  }
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function exportCsv() {
    const rows = [['Type', 'Title', 'Tag', 'Notes', 'Latitude', 'Longitude', 'Created', 'Updated', 'Photos', 'Link']];
    db.notes.forEach(n => rows.push(['Site note', n.title, n.tag, n.text, n.lat, n.lng, n.created, n.updated, n.photos.length, 'https://www.google.com/maps/search/?api=1&query=' + n.lat + ',' + n.lng]));
    db.watch.forEach(w => rows.push(['Watch: ' + w.kind, w.label, '', w.sub, w.lat, w.lng, w.added, '', '', w.kind === 'filing' ? 'https://www.tdlr.texas.gov/TABS/Projects/' + w.ref : '']));
    ctx.saveFile('field-notes-' + stamp() + '.csv', '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv');
  }
  function exportKml() {
    const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const pm = (name, desc, lng, lat) => '<Placemark><name>' + x(name) + '</name><description>' + x(desc) + '</description><Point><coordinates>' + lng + ',' + lat + ',0</coordinates></Point></Placemark>';
    const kml = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Field notes ' + stamp() + '</name>' +
      db.notes.map(n => pm(n.title || 'Site note', [n.tag, n.text].filter(Boolean).join('\n'), n.lng, n.lat)).join('') + db.watch.map(w => pm(w.label, w.sub, w.lng, w.lat)).join('') + '</Document></kml>';
    ctx.saveFile('field-notes-' + stamp() + '.kml', kml, 'application/vnd.google-earth.kml+xml');
  }
  async function importGeo(file) {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text()); let added = 0, had = 0, skipped = 0, mine = 0;
      for (const f of d.features || []) {
        const p = f?.properties || {}, c = f?.geometry?.coordinates, isNote = p.type === 'site-note', isWatch = /^watch-(filing|building)$/.test(p.type);
        if (!isNote && !isWatch) { skipped++; continue; }
        mine++; if (!Array.isArray(c) || c.length < 2 || !isFinite(c[0]) || !isFinite(c[1])) { skipped++; continue; }
        if (isNote) {
          if (p.id && db.notes.some(n => n.id === p.id)) { had++; continue; }
          const n = { id: p.id || uid(), lng: +c[0], lat: +c[1], title: String(p.title || '').slice(0, 120), text: String(p.notes || '').slice(0, 4000), tag: TAGS.includes(p.tag) ? p.tag : 'Other', photos: [], created: p.created || new Date().toISOString(), updated: p.updated || new Date().toISOString() };
          for (const du of (p.photos || []).slice(0, 12)) { if (!/^data:image\//.test(du)) continue; const id = 'p' + uid(); try { await putPhoto(id, await (await fetch(du)).blob()); n.photos.push(id); } catch (e) {} }
          db.notes.push(n); added++;
        } else {
          if (db.watch.some(w => (p.id && w.id === p.id) || (w.kind === p.type.slice(6) && w.ref === String(p.ref)))) { had++; continue; }
          db.watch.push({ id: p.id || uid(), kind: p.type.slice(6), ref: String(p.ref), label: String(p.label || ''), sub: String(p.sub || ''), lng: +c[0], lat: +c[1], added: p.added || new Date().toISOString() }); added++;
        }
      }
      if (!mine) { ctx.toast('No notes or watchlist items in that file. Import a GeoJSON exported from here.'); return; }
      save(); ctx.toast('Added ' + added + (had ? ', ' + had + ' already here' : '') + (skipped ? ', ' + skipped + ' skipped' : '') + '.');
    } catch (e) { ctx.toast('That file isn’t a field-notes GeoJSON export.'); }
  }
  syncBadges();
}
