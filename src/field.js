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
    else { const w = db.watch.find(x => x.id === hit.properties.id); if (w) ctx.openBuildingAt([w.lng, w.lat]); }
    return true;
  });

  function syncBadges() {
    const n = db.notes.length + db.watch.length, alerts = db.watch.filter(w => w.kind === 'filing' && CHANGED.has(w.ref)).length;
    document.getElementById('fieldBadge').textContent = alerts ? alerts + ' updated' : (n ? fmtN(n) : '');
    document.getElementById('mFieldN').textContent = alerts ? fmtN(alerts) : (n ? fmtN(n) : '');
  }

  // ---- watch star on filing and building cards (and the assistant's watch tool) ----
  const watchKey = info => info.kind === 'filing' ? info.f.id : info.center.map(v => v.toFixed(5)).join(',');
  const findWatch = info => db.watch.find(w => w.kind === info.kind && w.ref === watchKey(info));
  function setWatch(info, on) {
    const w = findWatch(info);
    if (!on && w) { db.watch = db.watch.filter(x => x !== w); ctx.team?.removed({ kind: 'watch', wkind: w.kind, ref: w.ref }); }
    else if (on && !w && info.kind === 'filing') db.watch.unshift({ id: uid(), kind: 'filing', ref: watchKey(info), label: info.f.name, sub: (info.f.city || info.f.county) + ' · ' + fmtM(info.f.cost), lng: info.f.lon, lat: info.f.lat, added: new Date().toISOString() });
    else if (on && !w) db.watch.unshift({ id: uid(), kind: 'building', ref: watchKey(info), label: info.label(), sub: info.sub(), lng: info.center[0], lat: info.center[1], added: new Date().toISOString() });
    else return !!w;
    save(); card.querySelector('.top .star')?._paint?.(); return on;
  }
  ctx.onCardRender(info => {
    const top = card.querySelector('.top'), x = top?.querySelector('.x'); if (!x) return;
    top.querySelector('.star')?.remove();
    const b = document.createElement('button'); b.className = 'x star'; b.setAttribute('aria-label', 'Add to watchlist');
    const paint = b._paint = () => { const on = !!findWatch(info); b.setAttribute('aria-pressed', on); b.title = on ? 'On your watchlist' : 'Add to watchlist'; b.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="' + (on ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>'; };
    b.onclick = () => { const on = setWatch(info, !findWatch(info)); paint(); ctx.toast(on ? 'Added to your watchlist (Field notes).' : 'Removed from your watchlist.'); };
    paint(); x.before(b);
  });

  // ---- site notes ----
  ctx.addNote = async ({ gps = false, at = null, title = '', text = '', tag = '' } = {}) => {
    let c = at || map.getCenter().toArray();
    if (gps && ctx.locate) { try { c = await ctx.locate(); } catch (e) { ctx.toast(e.message + ' Placed the note at the map center instead.'); } }
    const n = { id: uid(), lng: +c[0].toFixed(6), lat: +c[1].toFixed(6), title: String(title).slice(0, 120), text: String(text).slice(0, 4000), tag: TAGS.includes(tag) ? tag : TAGS[0], photos: [], created: new Date().toISOString(), updated: new Date().toISOString() };
    db.notes.unshift(n); save(); map.easeTo({ center: c, zoom: Math.max(map.getZoom(), 15), duration: ctx.reduceMotion ? 0 : 600 }); openNote(n, !title);
    return n;
  };

  async function openNote(n, isNew) {
    if (!n) return; ctx.closeCard(); curNote = n;
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
      '<div class="rnote bsrc">Saved on this device only. Use Field notes → Export to back up or move to another device.</div>';
    card.classList.add('open');
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelectorAll('.chitem').forEach(x => x.onclick = () => ctx.select(BY_ID.get(x.dataset.id), false));
    const form = card.querySelector('#nForm');
    form.onsubmit = e => { e.preventDefault(); const fd = new FormData(form); Object.assign(n, { title: String(fd.get('title')).trim(), tag: fd.get('tag'), text: String(fd.get('text')), updated: new Date().toISOString() }); save(); card.querySelector('h2').textContent = n.title || 'Untitled site'; ctx.toast('Note saved on this device.'); };
    card.querySelector('#nDel') && (card.querySelector('#nDel').onclick = async () => { if (!confirm('Delete this site note and its photos?')) return; for (const p of n.photos) { await delPhoto(p).catch(() => {}); ctx.team?.removed({ kind: 'photo', path: p }); } ctx.team?.removed({ kind: 'note', id: n.id }); db.notes = db.notes.filter(x => x !== n); save(); ctx.closeCard(); });
    card.querySelector('#nGps').onclick = async () => { try { const c = await ctx.locate(); n.lng = +c[0].toFixed(6); n.lat = +c[1].toFixed(6); save(); map.easeTo({ center: c }); openNote(n); } catch (e) { ctx.toast(e.message); } };
    card.querySelector('#nShare')?.addEventListener('click', () => navigator.share({ title: n.title || 'Site note', text: [n.title, n.tag, n.text].filter(Boolean).join('\n'), url: 'https://www.google.com/maps/search/?api=1&query=' + n.lat + ',' + n.lng }).catch(() => {}));
    card.querySelector('#nFile').onchange = async e => {
      for (const file of [...e.target.files].slice(0, 12)) { const id = 'p' + uid(); try { await putPhoto(id, await shrink(file)); n.photos.push(id); } catch (err) { ctx.toast('Couldn’t store that photo on this device.'); } }
      n.updated = new Date().toISOString(); save(); renderPhotos(n);
    };
    renderPhotos(n);
    if (isNew) setTimeout(() => form.querySelector('input[name=title]').focus(), 50);
  }
  async function renderPhotos(n) {
    const el = card.querySelector('#nPhotos'); if (!el) return; el.innerHTML = '';
    for (const id of n.photos) {
      const blob = await getPhoto(id).catch(() => null); if (!blob || curNote !== n) continue;
      const url = URL.createObjectURL(blob), d = document.createElement('div'); d.className = 'nph';
      d.innerHTML = '<a href="' + url + '" target="_blank" rel="noopener"><img src="' + url + '" alt="Site photo"></a><button type="button" aria-label="Remove photo">×</button>';
      d.querySelector('button').onclick = async () => { await delPhoto(id).catch(() => {}); ctx.team?.removed({ kind: 'photo', path: id }); n.photos = n.photos.filter(x => x !== id); n.updated = new Date().toISOString(); save(); renderPhotos(n); };
      el.appendChild(d);
    }
  }
  ctx.onCardClose(() => { curNote = null; });

  // ---- Field view ----
  const dist = (a, b) => { const r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos((a[1] + b[1]) / 2 * r), y = (b[1] - a[1]) * r; return Math.sqrt(x * x + y * y) * 3958.8; };
  function render() {
    const ctr = map.getCenter().toArray();
    const notes = db.notes.slice().sort((a, b) => b.updated.localeCompare(a.updated));
    const watch = db.watch.map(w => ({ ...w, f: w.kind === 'filing' ? BY_ID.get(w.ref) : null }));
    root.innerHTML = '<div class="vhead"><div><div class="kicker">Field notes</div><h2>Your sites &amp; watchlist</h2><div class="vsub">' + fmtN(notes.length) + ' site notes · ' + fmtN(watch.length) + ' watched · ' + (ctx.team?.summary() || 'stored on this device') + '</div><div id="fTeam"></div></div>' +
      '<div class="vctl"><button class="btn primary" id="fAdd">+ Site note here</button><button class="btn" id="fGeo">Export GeoJSON</button><button class="btn" id="fCsv">CSV</button><button class="btn" id="fKml">KML</button>' +
      '<label class="btn">Import<input type="file" accept=".geojson,.json,application/geo+json,application/json" hidden id="fImp"></label>' +
      '<label class="tg2"><input type="checkbox" id="fPh" checked><span>Include photos in GeoJSON</span></label></div></div>' +
      '<div class="fcols"><section><h3>Site notes</h3>' + (notes.length ? notes.map(n => '<button class="chitem" data-n="' + n.id + '"><span><b>' + esc(n.title || 'Untitled site') + '</b><em>' + esc(n.tag) + ' · ' + esc(new Date(n.updated).toLocaleDateString()) + (n.photos.length ? ' · ' + n.photos.length + ' photo' + (n.photos.length > 1 ? 's' : '') : '') + (n.text ? ' · ' + esc(n.text.slice(0, 60)) : '') + '</em></span><span class="m">' + dist(ctr, [n.lng, n.lat]).toFixed(1) + ' mi</span></button>').join('')
        : '<div class="empty">No site notes yet. Tap the pin button on the map (or “+ Site note here”) while you’re on site to save a location with notes and photos.</div>') + '</section>' +
      '<section><h3>Watchlist</h3>' + (watch.length ? watch.map(w => '<div class="witem"><button class="chitem" data-w="' + w.id + '"><span><b>' + (w.f && CHANGED.has(w.ref) ? '<span class="bdg new">' + (CHANGED.get(w.ref) === 'new' ? 'New' : 'Updated') + '</span>' : '') + esc(w.f ? w.f.name : w.label) + '</b><em>' + (w.kind === 'filing' ? (w.f ? esc((w.f.city || w.f.county) + ' · ' + (w.f.status || '') + ' · ' + w.f.ts + ' → ' + w.f.te) : 'No longer in the current data') : 'Building · ' + esc(w.sub || '')) + '</em></span><span class="m">' + (w.f ? fmtM(w.f.cost) : '') + '</span></button><button class="x" data-unw="' + w.id + '" aria-label="Remove">×</button></div>').join('')
        : '<div class="empty">Tap the star on any filing or building to watch it. Watched filings are flagged here when the nightly refresh sees a status, value or date change.</div>') + '</section></div>';
    root.querySelector('#fAdd').onclick = () => { ctx.setView('map'); ctx.addNote({ gps: true }); };
    root.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { const n = db.notes.find(x => x.id === b.dataset.n); ctx.setView('map'); map.easeTo({ center: [n.lng, n.lat], zoom: Math.max(map.getZoom(), 15) }); openNote(n); });
    root.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const w = db.watch.find(x => x.id === b.dataset.w); ctx.setView('map'); if (w.kind === 'filing' && BY_ID.get(w.ref)) ctx.select(BY_ID.get(w.ref), true); else { map.easeTo({ center: [w.lng, w.lat], zoom: Math.max(map.getZoom(), 16.5) }); ctx.openBuildingAt([w.lng, w.lat]); } });
    root.querySelectorAll('[data-unw]').forEach(b => b.onclick = () => { const w = db.watch.find(x => x.id === b.dataset.unw); db.watch = db.watch.filter(x => x !== w); if (w) ctx.team?.removed({ kind: 'watch', wkind: w.kind, ref: w.ref }); save(); });
    root.querySelector('#fGeo').onclick = () => exportGeo(root.querySelector('#fPh').checked);
    root.querySelector('#fCsv').onclick = exportCsv; root.querySelector('#fKml').onclick = exportKml;
    root.querySelector('#fImp').onchange = e => importGeo(e.target.files[0]);
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
      const d = JSON.parse(await file.text()); let added = 0;
      for (const f of d.features || []) {
        const p = f.properties || {}, c = f.geometry?.coordinates; if (!Array.isArray(c) || c.length < 2 || !isFinite(c[0]) || !isFinite(c[1])) continue;
        if (p.type === 'site-note') {
          if (db.notes.some(n => n.id === p.id)) continue;
          const n = { id: p.id || uid(), lng: +c[0], lat: +c[1], title: String(p.title || '').slice(0, 120), text: String(p.notes || '').slice(0, 4000), tag: TAGS.includes(p.tag) ? p.tag : 'Other', photos: [], created: p.created || new Date().toISOString(), updated: p.updated || new Date().toISOString() };
          for (const du of (p.photos || []).slice(0, 12)) { if (!/^data:image\//.test(du)) continue; const id = 'p' + uid(); try { await putPhoto(id, await (await fetch(du)).blob()); n.photos.push(id); } catch (e) {} }
          db.notes.push(n); added++;
        } else if (/^watch-(filing|building)$/.test(p.type) && !db.watch.some(w => w.id === p.id)) {
          db.watch.push({ id: p.id || uid(), kind: p.type.slice(6), ref: String(p.ref), label: String(p.label || ''), sub: String(p.sub || ''), lng: +c[0], lat: +c[1], added: p.added || new Date().toISOString() }); added++;
        }
      }
      save(); ctx.toast('Imported ' + added + ' item' + (added === 1 ? '' : 's') + '.');
    } catch (e) { ctx.toast('That file isn’t a field-notes GeoJSON export.'); }
  }
  syncBadges();
}
