// Who is behind a company that owns property: the Texas Comptroller's public franchise-tax record (free, no key).
//   GET ?name=PROLOGIS-A4 TX LP   -> { query, match: { name, status, formed, state, sos_file, agent, mailing, officers[], report_year }, candidates[] }
// Officers, directors, managers and members come from the entity's latest Public Information Report; the registered
// agent and status from the Secretary of State. People's names (an owner that isn't a company) are not looked up.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';

const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (owner lookup)' };
const BASE = 'https://comptroller.texas.gov/data-search/franchise-tax';
export const SEARCH_PAGE = 'https://comptroller.texas.gov/taxes/franchise/account-status/search';
export const SOURCE = 'Texas Comptroller of Public Accounts, franchise tax account status and Public Information Reports (officers); registered agent and status from the Texas Secretary of State.';

const ENTITY = /\b(L\.?\s?L\.?\s?C|L\.?\s?P|L\.?\s?L\.?\s?P|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|TRUST|TRUSTEES?|PARTNERS(HIP)?|HOLDINGS?|PROPERTIES|PROPERTY|INVESTMENTS?|INVESTORS|GROUP|FUND|REIT|BANK|ASSOCIATION|ASSN|CHURCH|MINISTRIES|DISTRICT|AUTHORITY|ENTERPRISES?|VENTURES?|CAPITAL|REALTY|DEVELOPMENT|MANAGEMENT|PLLC|PC|PA|FOUNDATION|SOCIETY|UNIVERSITY|COLLEGE|HOSPITAL|COUNTY|CITY OF|STATE OF|ISD|MUD|LLLP)\b\.?/i;
// "SMITH JOHN & MARY" is a person; "SMITH FAMILY TRUST" is a trust (looked up: some are registered entities)
export const isEntity = name => ENTITY.test(String(name || ''));
const PUBLIC = /\b(CITY OF|COUNTY OF|STATE OF|\w+ COUNTY$|INDEPENDENT SCHOOL DISTRICT|ISD|SCHOOL DISTRICT|MUNICIPAL UTILITY DISTRICT|MUD|UTILITY DISTRICT|DRAINAGE DISTRICT|WATER CONTROL|NAVIGATION DISTRICT|FLOOD CONTROL|HOSPITAL DISTRICT|COLLEGE DISTRICT|AUTHORITY|UNITED STATES|USA)\b/i;
// the owner field often carries care-of and attention lines after the name
export function cleanOwner(name) {
  return String(name || '').replace(/\s+(C\/O|%|ATTN:?|ATTENTION)\s.*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
const SUFFIX = [[/\bL\.?\s?L\.?\s?C\.?/g, 'LLC'], [/\bL\.?\s?P\.?(?=\s|$)/g, 'LP'], [/\bLIMITED PARTNERSHIP\b/g, 'LP'], [/\bLIMITED LIABILITY COMPANY\b/g, 'LLC'], [/\bINCORPORATED\b/g, 'INC'], [/\bCORPORATION\b/g, 'CORP'], [/\bCOMPANY\b/g, 'CO'], [/\bLIMITED\b/g, 'LTD'], [/\bASSOCIATION\b/g, 'ASSN']];
export function normEntity(s) {
  let t = ' ' + String(s || '').toUpperCase().replace(/&/g, ' AND ') + ' ';
  for (const [re, v] of SUFFIX) t = t.replace(re, v);
  return t.replace(/[^A-Z0-9]+/g, ' ').replace(/\bTHE\b/g, ' ').replace(/\s+/g, ' ').trim();
}
// best match among the search results: the same name (Comptroller names are cut at 50 characters, so compare the
// first 40), else nothing (the candidates are listed for the person to pick)
export function bestMatch(query, list) {
  const q = normEntity(query), L = (list || []).map(x => ({ x, n: normEntity(x.name) }));
  const exact = L.find(o => o.n === q); if (exact) return exact.x;
  if (q.length < 15) return null;
  // one of the two was cut short: the appraisal roll and the Comptroller both truncate long names (at different lengths)
  const cut = L.find(o => (o.n.startsWith(q) && o.n.length - q.length <= 4) || (q.startsWith(o.n) && o.n.length >= 30));
  return cut ? cut.x : null;
}
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(Llc|Lp|Inc|Ltd|Ii|Iii|Iv|Pc|Pllc|Usa|Us)\b/g, m => m.toUpperCase());
const addr = (street, city, state, zip) => [street, [city, [String(state || '').trim(), zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ').replace(/_/g, ' ');
const TITLES = { 'VICE PRESI': 'Vice President', 'SENIOR VIC': 'Senior Vice President', 'ASSISTANT': 'Assistant', 'PRESIDENT': 'President', 'DIRECTOR': 'Director', 'SECRETARY': 'Secretary', 'TREASURER': 'Treasurer', 'MANAGER': 'Manager', 'MEMBER': 'Member', 'MANAGING M': 'Managing Member', 'GENERAL PA': 'General Partner', 'CEO': 'CEO', 'CFO': 'CFO' };
export function shapeDetail(x) {
  if (!x) return null;
  const yr = String(x.reportYear || ''), people = new Map();
  for (const o of x.officerInfo || []) {
    if (yr && o.AGNT_ACTV_YR && String(o.AGNT_ACTV_YR) !== yr) continue;
    const name = titleCase(o.AGNT_NM), t = TITLES[String(o.AGNT_TITL_TX || '').trim().toUpperCase()] || titleCase(o.AGNT_TITL_TX);
    if (!name) continue;
    const p = people.get(name) || { name, titles: [], address: addr(o.AD_STR_POB_TX, titleCase(o.CITY_NM), o.ST_CD, o.AD_ZP) };
    if (t && !p.titles.includes(t)) p.titles.push(t); people.set(name, p);
  }
  return { taxpayer_id: x.taxpayerId, name: x.name, dba: x.dbaName || undefined, status: titleCase(x.rightToTransactTX || x.sosRegistrationStatus || ''), sos_status: titleCase(x.sosRegistrationStatus || ''),
    formed: x.effectiveSosRegistrationDate || undefined, state: String(x.stateOfFormation || '').trim() || undefined, sos_file: x.sosFileNumber || undefined,
    agent: x.registeredAgentName ? { name: x.registeredAgentName, address: addr(x.registeredOfficeAddressStreet, x.registeredOfficeAddressCity, x.registeredOfficeAddressState, x.registeredOfficeAddressZip) } : undefined,
    mailing: addr(x.mailingAddressStreet, x.mailingAddressCity, x.mailingAddressState, x.mailingAddressZip) || undefined,
    officers: [...people.values()].slice(0, 40), officers_total: people.size, report_year: yr || undefined };
}

async function get(url, fetchImpl = fetch) {
  const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('Texas Comptroller ' + r.status);
  const d = await r.json(); if (d?.success === false) throw new Error('Texas Comptroller: ' + (d.message || 'lookup failed')); return d;
}
export async function lookupEntity(name, fetchImpl = fetch) {
  const q = cleanOwner(name);
  if (!isEntity(q)) return { query: q, individual: true };
  // cities, counties, school and utility districts and the state aren't franchise taxpayers
  if (PUBLIC.test(q)) return { query: q, public: true };
  // the search wants the name without punctuation it can't match on ("PROLOGIS-A4" works, "L.L.C." doesn't)
  // (the name as written, minus punctuation and the legal ending: the Comptroller may spell the ending differently)
  const raw = q.toUpperCase().replace(/[^A-Z0-9&'-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const term = raw.replace(/(\s+(L\s?L\s?C|L\s?P|L\s?L\s?P|LLLP|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LIMITED PARTNERSHIP|PLLC|PC))+$/, '').trim().slice(0, 50) || raw.slice(0, 50);
  let s; try { s = await get(BASE + '?name=' + encodeURIComponent(term), fetchImpl); } catch (e) { if (/ 400$/.test(e.message)) return { query: q, match: null, candidates: [], total: 0 }; throw e; }
  const list = (s.data || []).slice(0, 50);
  const m = bestMatch(q, list);
  const candidates = list.filter(x => x !== m).slice(0, 6).map(x => ({ name: x.name, taxpayer_id: x.taxpayerId, zip: x.mailingAddressZip || undefined }));
  if (!m) return { query: q, match: null, candidates, total: s.count ?? list.length };
  const d = await get(BASE + '/' + encodeURIComponent(m.taxpayerId), fetchImpl);
  return { query: q, match: shapeDetail(d.data), candidates, total: s.count ?? list.length };
}
export async function entityById(id, fetchImpl = fetch) { const d = await get(BASE + '/' + encodeURIComponent(id), fetchImpl); return { match: shapeDetail(d.data) }; }

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 20, perDay: 600 })) return;
  const q = req.query || {};
  try {
    let d;
    if (q.id) { if (!/^\d{11}$/.test(String(q.id))) return res.status(400).json({ error: 'id is an 11-digit Texas taxpayer number' }); d = await entityById(String(q.id)); }
    else { const name = String(q.name || '').trim(); if (name.length < 3) return res.status(400).json({ error: 'name= the owner or company name' }); d = await lookupEntity(name); }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=604800');
    return res.json({ ...d, source: SOURCE, search_page: SEARCH_PAGE });
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: e.message }); }
}
