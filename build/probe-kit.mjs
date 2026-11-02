// Shared helpers for the county-data probes (probe-cad, probe-permits, probe-plats, probe-districts, probe-txdot,
// probe-tea). They only read and print: what a URL answers, which fields an ArcGIS layer has and how many rows fall in
// each of our counties, which datasets the open-data catalogs list for the region, and what is inside a zip.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export const REGION = JSON.parse(readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'));
export const COUNTIES = REGION.counties.map(c => c.name);
export const BBOX = REGION.bbox;
const UA = { 'user-agent': 'RealEstateIntelligence probe (github actions)' };
const short = (o, n = 1500) => (typeof o === 'string' ? o : JSON.stringify(o)).slice(0, n);
export const log = (...a) => console.log(...a);

export async function time(name, fn, n) {
  const t = Date.now();
  try { const r = await fn(); log('##', name, '|', Date.now() - t, 'ms |', short(r, n)); return r; }
  catch (e) { log('##', name, '| ERROR', e.message, '|', Date.now() - t, 'ms'); }
}

export async function get(url, opts = {}) {
  return fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(opts.timeout || 60000), ...opts, headers: { ...UA, ...(opts.headers || {}) } });
}
export async function json(url, opts) {
  const r = await get(url, opts); const t = await r.text();
  try { return JSON.parse(t); } catch { throw new Error('HTTP ' + r.status + ' not JSON: ' + t.slice(0, 200).replace(/\s+/g, ' ')); }
}

// Status, type, size and change headers; HEAD first, a 1-byte ranged GET when HEAD is refused.
export async function head(url) {
  let r = await get(url, { method: 'HEAD' }).catch(e => ({ error: e.message }));
  if (r.error || r.status >= 400) r = await get(url, { headers: { range: 'bytes=0-0' } }).catch(e => ({ error: e.message }));
  if (r.error) return { url, error: r.error };
  const h = k => r.headers.get(k);
  return { url: r.url, status: r.status, type: h('content-type'), bytes: h('content-length') || h('content-range'), etag: h('etag'), modified: h('last-modified'), ranges: h('accept-ranges') };
}

// Links on an HTML page whose href or text matches a pattern (download pages, agenda lists).
export async function links(url, re = /download|data|gis|export|\.zip|\.csv|\.txt|\.xlsx?|\.pdf|shape|parcel/i, max = 60) {
  const r = await get(url); const html = await r.text(); const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!re.test(m[1] + ' ' + text)) continue;
    let href; try { href = new URL(m[1], r.url).href; } catch { continue; }
    if (!out.some(o => o.href === href)) out.push({ href, text: text.slice(0, 80) });
    if (out.length >= max) break;
  }
  return { status: r.status, final: r.url, bytes: html.length, links: out };
}

// An ArcGIS layer: name, geometry, fields, paging support, total count and count inside the region box.
export async function arcLayer(url, { where = '1=1', sample = 2, countyField } = {}) {
  const meta = await json(url + '?f=json');
  if (meta.error) return { url, error: meta.error };
  if (meta.layers || meta.services || meta.folders) return { url, folders: meta.folders, services: (meta.services || []).map(s => s.name + ':' + s.type), layers: (meta.layers || []).map(l => l.id + ':' + l.name) };
  const q = p => json(url + '/query?' + new URLSearchParams({ f: 'json', ...p }));
  const env = { geometry: BBOX.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };
  const [all, inBox, rows] = await Promise.all([
    q({ where, returnCountOnly: 'true' }).catch(e => ({ error: e.message })),
    q({ where, returnCountOnly: 'true', ...env }).catch(e => ({ error: e.message })),
    q({ where, outFields: '*', returnGeometry: 'false', resultRecordCount: String(sample), ...env }).catch(e => ({ error: e.message }))
  ]);
  const out = { name: meta.name, geom: meta.geometryType, max: meta.maxRecordCount, paging: meta.advancedQueryCapabilities?.supportsPagination, edited: meta.editingInfo?.lastEditDate && new Date(meta.editingInfo.lastEditDate).toISOString(), fields: (meta.fields || []).map(f => f.name + ':' + String(f.type).replace('esriFieldType', '')).join(' '), total: all.count ?? all.error, inRegion: inBox.count ?? inBox.error, sample: rows.features?.map(f => f.attributes) ?? rows.error };
  if (countyField) {
    const by = await q({ where, groupByFieldsForStatistics: countyField, outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: countyField, outStatisticFieldName: 'n' }]), ...env }).catch(e => ({ error: e.message }));
    out.byCounty = by.features?.map(f => f.attributes[countyField] + '=' + f.attributes.n).join(', ') ?? by.error;
  }
  return out;
}

// ArcGIS Online search for public items (Feature Services, files) about a topic in the region.
export async function agol(q, { num = 25, types = '', inspect = 3, match } = {}) {
  const p = new URLSearchParams({ f: 'json', q: q + ' ' + (types || '(type:"Feature Service" OR type:"Map Service")') + ' access:public', bbox: BBOX.join(','), num: String(num), sortField: 'modified', sortOrder: 'desc' });
  const d = await json('https://www.arcgis.com/sharing/rest/search?' + p);
  const items = (d.results || []).map(i => ({ title: i.title, owner: i.owner, type: i.type, url: i.url, modified: new Date(i.modified).toISOString().slice(0, 10) }));
  // look inside the first few services that match, so one probe run shows their fields and counts too
  const want = items.filter(i => i.url && /FeatureServer|MapServer/.test(i.url) && (!match || match.test(i.title))).slice(0, inspect);
  for (const i of want) {
    const u = /\/\d+$/.test(i.url) ? i.url : i.url.replace(/\/$/, '') + '/0';
    i.layer = await arcLayer(u, { sample: 1 }).catch(e => ({ error: e.message }));
  }
  return { total: d.total, items };
}

// Socrata catalog (data.texas.gov, city portals) search.
export async function socrata(q, domain) {
  const p = new URLSearchParams({ q, limit: '25', ...(domain ? { domains: domain } : {}) });
  const d = await json('https://api.us.socrata.com/api/catalog/v1?' + p);
  return { total: d.resultSetSize, items: (d.results || []).map(r => ({ name: r.resource.name, id: r.resource.id, domain: r.metadata.domain, updated: r.resource.data_updated_at?.slice(0, 10), type: r.resource.type })) };
}

// CKAN (data.houstontx.gov) package search.
export async function ckan(base, q) {
  const d = await json(base + '/api/3/action/package_search?' + new URLSearchParams({ q, rows: '20' }));
  return { total: d.result?.count, items: (d.result?.results || []).map(p => ({ name: p.name, title: p.title, modified: p.metadata_modified?.slice(0, 10), resources: p.resources.map(r => r.format + ' ' + r.url).slice(0, 6) })) };
}

// List the entries of a remote zip and the first lines of its text files, reading only the end (central directory)
// and the start of each entry with range requests when the server allows it, else downloading up to maxMB.
export async function zipPeek(url, { maxMB = 400, lines = 3, entries = 12 } = {}) {
  const h = await head(url);
  const size = Number(String(h.bytes || '').split('/').pop());
  let buf, base = 0;
  const ranged = h.ranges === 'bytes' && size > 0;
  if (ranged) { base = Math.max(0, size - 4 * 1024 * 1024); buf = Buffer.from(await (await get(url, { headers: { range: `bytes=${base}-${size - 1}` }, timeout: 120000 })).arrayBuffer()); }
  else { if (size > maxMB * 1048576) return { ...h, note: 'too big to download without range support' }; buf = Buffer.from(await (await get(url, { timeout: 600000 })).arrayBuffer()); }
  let eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return { ...h, note: 'no zip directory found' };
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16) - base; const list = [];
  for (let i = 0; i < n && p >= 0 && p < buf.length; i++) {
    const comp = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    list.push({ name: buf.toString('utf8', p + 46, p + 46 + nl), comp, csize, usize, off }); p += 46 + nl + el + cl;
  }
  const out = { ...h, entries: list.length, files: [] };
  for (const e of list.slice(0, entries)) {
    const f = { name: e.name, mb: +(e.usize / 1048576).toFixed(1) };
    if (/\.(txt|csv|tsv|dat)$/i.test(e.name) && (e.comp === 8 || e.comp === 0)) {
      try {
        let raw;
        if (ranged) raw = Buffer.from(await (await get(url, { headers: { range: `bytes=${e.off}-${e.off + 30 + 400 + 65536}` } })).arrayBuffer());
        else raw = buf.subarray(e.off, e.off + 30 + 400 + 65536);
        const start = 30 + raw.readUInt16LE(26) + raw.readUInt16LE(28); const body = raw.subarray(start);
        let text; try { text = e.comp === 8 ? inflateRawSync(body, { finishFlush: 2 }).toString('latin1') : body.toString('latin1'); } catch (x) { text = 'inflate: ' + x.message; }
        f.head = text.split(/\r?\n/).slice(0, lines).map(l => l.slice(0, 600));
      } catch (x) { f.head = 'read: ' + x.message; }
    }
    out.files.push(f);
  }
  return out;
}

// Count the lines of a (possibly zipped, deflated) text file by streaming it, for row counts per file. Optional
// filter counts lines matching a pattern per key (column index) to see county or city splits.
export async function streamCount(url, { col, sep = '\t', maxMB = 2000 } = {}) {
  const r = await get(url, { timeout: 900000 });
  if (!r.ok) return { status: r.status };
  const dec = new TextDecoder('latin1'); let rest = '', n = 0, bytes = 0; const by = {};
  for await (const chunk of r.body) {
    bytes += chunk.length; if (bytes > maxMB * 1048576) break;
    const lines = (rest + dec.decode(chunk, { stream: true })).split(/\r?\n/); rest = lines.pop();
    n += lines.length;
    if (col != null) for (const l of lines) { const k = l.split(sep)[col]; by[k] = (by[k] || 0) + 1; }
  }
  return { lines: n, mb: +(bytes / 1048576).toFixed(1), top: col != null ? Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 15) : undefined };
}
