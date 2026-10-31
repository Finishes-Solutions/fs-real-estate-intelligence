// Diagnostic: every public building-permit dataset and every state business-entity (LLC / corporation) registry the
// open-data catalogs list nationwide, with what a loader needs: endpoint, row count, last update, fields and a sample
// row. Read-only. Run "Probe services" with script=us; each finding is one line starting "@@ " (JSON) so the log can be
// parsed back into a table.
//   Socrata:  the national catalog (api.us.socrata.com) across every Socrata portal
//   ArcGIS:   ArcGIS Online public Feature Services
//   CKAN:     catalog.data.gov (federates many city and state portals) and a few city CKAN portals
//   Known:    state business-entity bulk files that live outside the catalogs
import { json, head, get } from './probe-kit.mjs';

const out = (kind, o) => console.log('@@ ' + JSON.stringify({ kind, ...o }));
const clip = v => v == null ? v : String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 80);
const pool = async (items, n, fn) => { const q = [...items]; await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const x = q.shift(); try { await fn(x); } catch (e) { /* reported by fn */ } } })); };
const PERMIT = /permit|construction|building (activity|inspection)|certificate of occupancy/i;
const NOT_PERMIT = /parking|film|event|food|alcohol|liquor|cafe|vendor|taxi|tow|dog|tree|banner|encroach|right[- ]of[- ]way|street use|sidewalk|excavat|oversize|hauling|noise|fire ?works|special|row permit|utility cut|dumpster|block party|tattoo|massage|cannabis|marijuana|pool inspect|restaurant|health|elevator|boiler|parks? |picnic|wastewater discharge|air permit|stormwater|npdes|well permit|fishing|hunting|burn/i;
const ENTITY = /business entit|corporation|registered business|business registr|business filing|active business|llc|limited liability|secretary of state|business licen[cs]e master|entity (search|list)/i;

// ---------- Socrata: the national catalog ----------
async function socrataCatalog(q, max = 1000) {
  const rows = [];
  for (let off = 0; off < max; off += 100) {
    const d = await json('https://api.us.socrata.com/api/catalog/v1?' + new URLSearchParams({ q, only: 'dataset', limit: '100', offset: String(off) }), { timeout: 60000 });
    rows.push(...(d.results || [])); if ((d.results || []).length < 100) break;
  }
  return rows;
}
const seenSoc = new Set(), soc = [];
for (const q of ['building permits', 'permits issued', 'construction permits', 'building permit applications', 'issued permits', 'certificate of occupancy', 'residential permits', 'commercial permits'])
  for (const r of await socrataCatalog(q).catch(e => { out('error', { where: 'socrata ' + q, msg: e.message }); return []; })) {
    const k = r.metadata.domain + '/' + r.resource.id; if (seenSoc.has(k)) continue; seenSoc.add(k);
    if (PERMIT.test(r.resource.name) && !NOT_PERMIT.test(r.resource.name)) soc.push({ ...r, want: 'permit' });
  }
for (const q of ['business entities', 'active corporations', 'business registry', 'registered businesses', 'limited liability company', 'secretary of state business', 'corporations database', 'business entity'])
  for (const r of await socrataCatalog(q, 500).catch(e => { out('error', { where: 'socrata ' + q, msg: e.message }); return []; })) {
    const k = r.metadata.domain + '/' + r.resource.id; if (seenSoc.has(k)) continue; seenSoc.add(k);
    if (ENTITY.test(r.resource.name + ' ' + (r.resource.description || '').slice(0, 300))) soc.push({ ...r, want: 'entity' });
  }
console.log('socrata candidates', soc.length);
await pool(soc, 12, async r => {
  const base = 'https://' + r.metadata.domain + '/resource/' + r.resource.id + '.json';
  const [cnt, sample] = await Promise.all([
    json(base + '?$select=count(*) as n', { timeout: 30000 }).catch(e => ({ error: e.message })),
    json(base + '?$limit=1', { timeout: 30000 }).catch(e => ({ error: e.message }))]);
  const s = Array.isArray(sample) ? sample[0] || {} : {};
  out(r.want, { via: 'socrata', domain: r.metadata.domain, id: r.resource.id, name: r.resource.name, attribution: r.resource.attribution, updated: (r.resource.data_updated_at || '').slice(0, 10),
    rows: Array.isArray(cnt) ? +cnt[0]?.n : null, err: cnt.error || sample.error, views: r.resource.page_views?.page_views_total,
    fields: (r.resource.columns_field_name || []).map((f, i) => f + ':' + (r.resource.columns_datatype?.[i] || '')).slice(0, 80),
    sample: Object.fromEntries(Object.entries(s).slice(0, 60).map(([k, v]) => [k, clip(v)])) });
});

// ---------- ArcGIS Online: public feature services ----------
const seenArc = new Set(), arc = [];
for (const [q, want] of [['building permits', 'permit'], ['permits issued', 'permit'], ['building permit', 'permit'], ['construction permits', 'permit'], ['business entities', 'entity'], ['registered businesses', 'entity']])
  for (let start = 1; start < 1000; start += 100) {
    const d = await json('https://www.arcgis.com/sharing/rest/search?' + new URLSearchParams({ f: 'json', q: q + ' type:"Feature Service" access:public', num: '100', start: String(start) }), { timeout: 60000 }).catch(e => ({ error: e.message }));
    if (d.error) { out('error', { where: 'agol ' + q, msg: d.error }); break; }
    for (const i of d.results || []) {
      if (!i.url || seenArc.has(i.url)) continue; seenArc.add(i.url);
      const t = i.title + ' ' + (i.snippet || '');
      if (want === 'permit' ? PERMIT.test(t) && !NOT_PERMIT.test(i.title) : ENTITY.test(t)) arc.push({ ...i, want });
    }
    if (!d.nextStart || d.nextStart < 0) break;
  }
console.log('arcgis candidates', arc.length);
await pool(arc, 10, async i => {
  let url = i.url.replace(/\/$/, '');
  if (!/\/\d+$/.test(url)) { const m = await json(url + '?f=json', { timeout: 20000 }).catch(() => null); const l = m?.layers?.[0] ?? m?.tables?.[0]; if (!l) return out(i.want, { via: 'arcgis', url, name: i.title, owner: i.owner, err: 'no layers' }); url += '/' + l.id; }
  const meta = await json(url + '?f=json', { timeout: 20000 }).catch(e => ({ error: e.message }));
  if (meta.error) return out(i.want, { via: 'arcgis', url, name: i.title, owner: i.owner, err: clip(meta.error.message || meta.error) });
  const [cnt, s] = await Promise.all([
    json(url + '/query?f=json&where=1%3D1&returnCountOnly=true', { timeout: 30000 }).catch(e => ({ error: e.message })),
    json(url + '/query?f=json&where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=1', { timeout: 30000 }).catch(e => ({ error: e.message }))]);
  const f = s.features?.[0];
  out(i.want, { via: 'arcgis', url, name: i.title, owner: i.owner, org: i.orgId, updated: meta.editingInfo?.lastEditDate ? new Date(meta.editingInfo.lastEditDate).toISOString().slice(0, 10) : new Date(i.modified).toISOString().slice(0, 10),
    rows: cnt.count ?? null, err: cnt.error || cnt.error?.message, geom: meta.geometryType, paging: meta.advancedQueryCapabilities?.supportsPagination, max: meta.maxRecordCount,
    fields: (meta.fields || []).map(x => x.name + ':' + String(x.type).replace('esriFieldType', '')).slice(0, 80),
    sample: f ? Object.fromEntries(Object.entries(f.attributes || {}).slice(0, 60).map(([k, v]) => [k, clip(v)])) : null, point: f?.geometry ? [f.geometry.x, f.geometry.y] : null });
});

// ---------- CKAN: catalog.data.gov and city CKAN portals ----------
for (const [base, q, want] of [['https://catalog.data.gov', 'building permits', 'permit'], ['https://catalog.data.gov', 'permits issued', 'permit'], ['https://catalog.data.gov', 'business entities corporations', 'entity'],
  ['https://data.boston.gov', 'building permits', 'permit'], ['https://data.wprdc.org', 'permits', 'permit'], ['https://data.sanantonio.gov', 'permits', 'permit'], ['https://data.ok.gov', 'business', 'entity'], ['https://data.virginia.gov', 'business entities', 'entity']]) {
  const d = await json(base + '/api/3/action/package_search?' + new URLSearchParams({ q, rows: '1000' }), { timeout: 90000 }).catch(e => ({ error: e.message }));
  if (d.error) { out('error', { where: 'ckan ' + base + ' ' + q, msg: d.error }); continue; }
  for (const p of d.result?.results || []) {
    const t = p.title + ' ' + (p.notes || '').slice(0, 300);
    if (want === 'permit' ? !(PERMIT.test(p.title) && !NOT_PERMIT.test(p.title)) : !ENTITY.test(t)) continue;
    const res = (p.resources || []).filter(r => /csv|json|api|zip|geojson|arcgis|esri/i.test(r.format + ' ' + r.url)).slice(0, 4).map(r => r.format + ' ' + r.url);
    if (/data\.cityof|socrata|\/resource\/|arcgis\.com|FeatureServer/i.test(res.join(' '))) continue; // already found through Socrata / ArcGIS
    out(want, { via: 'ckan', portal: base, name: p.title, org: p.organization?.title, updated: (p.metadata_modified || '').slice(0, 10), res });
  }
}

// ---------- state business-entity bulk files outside the catalogs ----------
for (const [state, url, note] of [
  ['FL', 'https://dos.fl.gov/sunbiz/other-services/data-downloads/', 'Sunbiz quarterly and daily corporate files (public SFTP)'],
  ['TX', 'https://data.texas.gov/resource/9cir-efmm.json?$select=count(*)', 'Comptroller active franchise tax permit holders'],
  ['CA', 'https://bizfileonline.sos.ca.gov/', 'bizfile bulk data (paid order)'],
  ['NY', 'https://data.ny.gov/resource/n9v6-gdp6.json?$select=count(*)', 'Active Corporations: Beginning 1800'],
  ['CO', 'https://data.colorado.gov/resource/4ykn-tg5h.json?$select=count(*)', 'Business Entities in Colorado'],
  ['OR', 'https://data.oregon.gov/resource/tckn-sxa6.json?$select=count(*)', 'Active Businesses - ALL'],
  ['IA', 'https://data.iowa.gov/resource/ez5t-3qay.json?$select=count(*)', 'Active Iowa Business Entities'],
  ['CT', 'https://data.ct.gov/resource/n7gp-d28j.json?$select=count(*)', 'Connecticut Business Registry - Business Master'],
  ['WA', 'https://ccfs.sos.wa.gov/', 'Corporations and Charities Filing System (data download)'],
  ['OH', 'https://www.ohiosos.gov/businesses/business-reports/', 'Ohio business reports'],
  ['PA', 'https://www.pa.gov/agencies/dos/programs/business', 'PA business entity data'],
  ['MI', 'https://www.michigan.gov/lara/bureau-list/cscl/corps', 'Michigan corporations'],
  ['VT', 'https://bizfilings.vermont.gov/', 'Vermont business filings'],
  ['DE', 'https://icis.corp.delaware.gov/', 'Delaware (no bulk; paid status lookups)']])
  out('entity-known', { state, note, check: await head(url).catch(e => ({ error: e.message })), count: url.includes('count(*)') ? await json(url, { timeout: 30000 }).catch(e => ({ error: e.message })) : undefined });

console.log('done');
void get;
