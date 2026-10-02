// Businesses registered at an address: Texas Comptroller active sales-tax permit holders (data.texas.gov, free, no key).
// Every business that sells taxable goods or services in Texas holds a permit for each location ("outlet"), so this lists
// retail, restaurant and service tenants at a street address, with the legal owner and the date the location's permit was issued.
// Offices, medical and other non-taxable tenants mostly don't appear. Only active permits are listed (closed locations drop out).
// GET ?addr=1234 Main St&zip=77494[&city=Katy]  -> { query, tenants: [{ name, owner, addr, suite, naics, sector, opened, first_sale }] }
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { SECTORS, sectorOf } from '../lib/sectors.mjs';

const SOCRATA = 'https://data.texas.gov/resource/jrea-zgmq.json';
const DIR = /^(N|S|E|W|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST)$/;
const TYPE = /^(ST|STREET|RD|ROAD|DR|DRIVE|AVE|AV|AVENUE|BLVD|BOULEVARD|LN|LANE|PKWY|PARKWAY|FWY|FREEWAY|HWY|HIGHWAY|CT|COURT|CIR|CIRCLE|WAY|TRL|TRAIL|PL|PLACE|LOOP|SQ|PLZ|PLAZA|TER|STE|SUITE|UNIT|BLDG|FM|RM|SH|US|IH|TX|STATE|COUNTY|CR)$/;
// "1234 W. Grand Pkwy S Ste 100" -> { num: '1234', word: 'GRAND' }: the house number plus the most distinctive street word,
// so "W GRAND PKWY S", "WEST GRAND PARKWAY SOUTH" and "1234 GRAND PKWY S STE 100" all match
export function addressKey(addr) {
  const t = String(addr || '').toUpperCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean);
  const num = (t[0] || '').match(/^\d{1,6}[A-Z]?$/) ? t[0].replace(/[A-Z]$/, '') : null; if (!num) return null;
  const words = t.slice(1).filter(w => !DIR.test(w) && !TYPE.test(w) && !/^\d/.test(w) && w.length > 1).filter(w => /^[A-Z'-]+$/.test(w));
  const numbered = t.slice(1).find(w => /^\d{1,4}$/.test(w)); // "FM 1093", "HWY 290": the route number is the street
  const word = words.sort((a, b) => b.length - a.length)[0] || numbered || null;
  return word ? { num, word: word.replace(/'/g, '') } : null;
}
export function tenantQuery(addr, zip, city) {
  const k = addressKey(addr); if (!k) return null;
  const where = ["upper(outlet_address) like '" + k.num + " %" + k.word + "%'"];
  if (/^\d{5}/.test(zip || '')) where.push("outlet_zip_code like '" + zip.slice(0, 5) + "%'");
  else if (city) where.push("upper(outlet_city) = '" + String(city).toUpperCase().replace(/[^A-Z .'-]/g, '').replace(/'/g, "''") + "'");
  else return null;
  return { key: k, where: where.join(' AND ') };
}
const SUITE = /\b(?:STE|SUITE|UNIT|BLDG|#)\s*([\w-]+)/i;
export function shapeTenants(rows) {
  const seen = new Set(), out = [];
  for (const r of rows || []) {
    const name = String(r.outlet_name || r.taxpayer_name || '').trim(); if (!name) continue;
    const k = name.toUpperCase() + '|' + (r.outlet_address || '').toUpperCase(); if (seen.has(k)) continue; seen.add(k);
    const s = sectorOf(r.outlet_naics_code);
    out.push({ name: name.slice(0, 100), owner: r.taxpayer_name && r.taxpayer_name.trim() !== name ? String(r.taxpayer_name).trim().slice(0, 100) : undefined,
      addr: String(r.outlet_address || '').slice(0, 120), suite: (String(r.outlet_address || '').match(SUITE) || [])[1], naics: r.outlet_naics_code || undefined, sector: s == null ? undefined : SECTORS[s][1],
      opened: String(r.outlet_permit_issue_date || '').slice(0, 10) || undefined, first_sale: String(r.outlet_first_sales_date || '').slice(0, 10) || undefined });
  }
  return out.sort((a, b) => String(b.opened || '').localeCompare(String(a.opened || '')));
}

export async function tenants(addr, zip, city) {
  const q = tenantQuery(addr, zip, city); if (!q) return { query: null, tenants: [], note: 'Needs a street address with a house number, and a ZIP or city.' };
  const p = new URLSearchParams({ $select: 'outlet_name, taxpayer_name, outlet_address, outlet_city, outlet_zip_code, outlet_naics_code, outlet_permit_issue_date, outlet_first_sales_date', $where: q.where, $limit: '200' });
  const get = async params => {
    const r = await fetch(SOCRATA + '?' + params, { signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0', ...(process.env.SOCRATA_APP_TOKEN ? { 'X-App-Token': process.env.SOCRATA_APP_TOKEN } : {}) } });
    const t = await r.text(); if (!r.ok) { const e = new Error('Comptroller data ' + r.status + (t ? ': ' + t.slice(0, 120) : '')); e.status = r.status; throw e; }
    return JSON.parse(t);
  };
  let rows;
  try { rows = await get(p); }
  catch (e) { // a query the dataset rejects (e.g. the ZIP column's type): match the street alone and filter the ZIP / city here
    if (e.status !== 400) throw e;
    p.set('$where', q.where.split(' AND ')[0]); p.set('$limit', '1000');
    const z = String(zip || '').slice(0, 5), c = String(city || '').toUpperCase();
    rows = (await get(p)).filter(r => z ? String(r.outlet_zip_code || '').startsWith(z) : String(r.outlet_city || '').toUpperCase() === c);
  }
  return { query: q.key.num + ' … ' + q.key.word, tenants: shapeTenants(rows) };
}

// businesses by name in the given cities (map search): "STARBUCKS" in Katy, Fulshear, Brookshire …
export function nameQuery(name, cities) {
  const n = String(name || '').toUpperCase().replace(/[^A-Z0-9 &'-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/'/g, "''");
  const cs = (cities || []).map(c => String(c).toUpperCase().replace(/[^A-Z .'-]/g, '').replace(/'/g, "''").trim()).filter(Boolean).slice(0, 40);
  if (n.length < 3 || !cs.length) return null;
  return "(upper(outlet_name) like '%" + n + "%' OR upper(taxpayer_name) like '%" + n + "%') AND upper(outlet_city) in (" + cs.map(c => "'" + c + "'").join(', ') + ')';
}
export async function businessesNamed(name, cities, limit = 12) {
  const where = nameQuery(name, cities); if (!where) return { tenants: [] };
  const p = new URLSearchParams({ $select: 'outlet_name, taxpayer_name, outlet_address, outlet_city, outlet_zip_code, outlet_naics_code, outlet_permit_issue_date, outlet_first_sales_date', $where: where, $order: 'outlet_permit_issue_date DESC', $limit: String(limit * 3) });
  const r = await fetch(SOCRATA + '?' + p, { signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0', ...(process.env.SOCRATA_APP_TOKEN ? { 'X-App-Token': process.env.SOCRATA_APP_TOKEN } : {}) } });
  const t = await r.text(); if (!r.ok) throw new Error('Comptroller data ' + r.status + (t ? ': ' + t.slice(0, 120) : ''));
  const rows = JSON.parse(t);
  return { tenants: shapeTenants(rows).map((x, i) => ({ ...x, city: titleCase(rows.find(r2 => String(r2.outlet_address || '').slice(0, 120) === x.addr)?.outlet_city), zip: String(rows.find(r2 => String(r2.outlet_address || '').slice(0, 120) === x.addr)?.outlet_zip_code || '').slice(0, 5) || undefined })).slice(0, limit) };
}
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) || undefined;

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 30, perDay: 600 })) return;
  if (req.query?.name) { // map search: GET ?name=Starbucks&cities=Katy,Fulshear
    try {
      const d = await businessesNamed(clip(req.query.name, 60), String(req.query.cities || '').split(',').map(s => s.trim()).filter(Boolean));
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
      return res.json({ ...d, source: 'Texas Comptroller, active sales tax permits' });
    } catch (e) { console.error('tenants name', e.message); res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'Couldn’t reach the Texas Comptroller data just now.' }); }
  }
  const addr = clip(req.query?.addr, 120), zip = clip(req.query?.zip, 10), city = clip(req.query?.city, 40);
  if (!addr) return res.status(400).json({ error: 'addr is required' });
  try {
    const d = await tenants(addr, zip, city);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    return res.json({ ...d, source: 'Texas Comptroller, active sales tax permits' });
  } catch (e) {
    console.error('tenants', e.message); res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Couldn’t reach the Texas Comptroller data just now. Try again shortly.' });
  }
}
