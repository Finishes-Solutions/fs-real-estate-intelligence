// State business-entity registries (LLCs, corporations, partnerships) -> Supabase entities (build/entities.mjs; sources
// in data/entity-sources.json). Every registry names its fields its own way, so each source maps them explicitly; this
// module turns one record into one row and normalizes names the same way the owner lookup does (api/entity.js), so a
// deed owner "PROLOGIS-A4 TX L.P." finds "PROLOGIS-A4 TX LP".
import { normEntity } from '../api/entity.js';

const s = v => v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
export { normEntity };
// the kind of entity from the registry's type text
export function kindOf(t) {
  const x = s(t).toUpperCase();
  if (/LIMITED LIABILITY (COMPANY|CO)|\bLLC\b|\bL\.L\.C|\bFLAL\b|\bFORL\b|\b[DF]LLC\b|\bPLLC\b/.test(x)) return 'LLC';
  if (/LIMITED LIABILITY PARTNERSHIP|\b[DF]?LLP\b/.test(x)) return 'LLP';
  if (/LIMITED PARTNERSHIP|\b[DF]?LP\b|\bLTD\b|\b[DF]?LLLP\b/.test(x)) return 'LP';
  if (/NON.?PROFIT|NOT.?FOR.?PROFIT|\bNFP\b|NONSTOCK|NON-STOCK|CHARIT|RELIGIOUS|COOPERATIVE|\bDOMNP\b|\bFORNP\b|\b[DF]NC\b/.test(x)) return 'Nonprofit';
  if (/TRUST/.test(x)) return 'Trust';
  if (/CORP|INCORPORATED|\bINC\b|STOCK|\bBUSINESS CORPORATION\b|\bDOMP\b|\bFORP\b|PROFESSIONAL ASSOC|\bPA\b|\b[DF]?PC\b/.test(x)) return 'Corporation';
  if (/PARTNERSHIP|\bGP\b/.test(x)) return 'Partnership';
  if (/ASSUMED|TRADE ?NAME|FICTITIOUS|\bDBA\b/.test(x)) return 'Trade name';
  return x ? 'Other' : null;
}
const ACTIVE = /^(A|ACT|ACTIVE|GOOD STANDING|IN GOOD STANDING|EXISTING|EXISTS|CURRENT|ACTIVE.*|REINSTATED)$/i;
const INACTIVE = /INACTIVE|DISSOLV|REVOK|FORFEIT|CANCEL|WITHDRAW|MERGED|EXPIRED|TERMINAT|DELINQUENT|ADMIN|SUSPEND|NOT IN GOOD|^I$|INVOLUNT|CONVERTED|CONSOLIDAT|VOLUNTAR/i;
export const activeOf = st => { const t = s(st); if (!t) return null; if (ACTIVE.test(t) && !INACTIVE.test(t)) return true; if (INACTIVE.test(t)) return false; return null; };
export function dayOf(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 1e11 || v < -1e11 ? new Date(v).toISOString().slice(0, 10) : null;
  const t = s(v); let m;
  if ((m = t.match(/^(\d{4})-(\d\d)-(\d\d)/))) return m[0];
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  if ((m = t.match(/^(\d\d)(\d\d)(\d{4})$/))) return m[3] + '-' + m[1] + '-' + m[2];   // MMDDYYYY (Florida)
  if ((m = t.match(/^(\d{4})(\d\d)(\d\d)$/))) return m[1] + '-' + m[2] + '-' + m[3];
  const d = Date.parse(t); return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
}
const plausible = d => d && d >= '1700-01-01' && d <= new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const join = (...a) => a.map(s).filter(Boolean).join(', ');
// a field value, where a map entry may be a field name, a list of names joined with spaces, or a function of the record
const pick = (rec, f) => typeof f === 'function' ? f(rec) : Array.isArray(f) ? f.map(k => s(rec[k])).filter(Boolean).join(' ') : f && typeof f === 'object' ? f.const : f ? rec[f] : undefined;

// src: { slug, state, map: { number, name, kind, status, formed, juris, agent, agent_addr, addr, city, zip, extra: [fields kept in attrs] } }
export function entityRow(src, rec) {
  const m = src.map, number = s(pick(rec, m.number)), name = s(pick(rec, m.name)).slice(0, 250);
  if (!number || !name) return null;
  const status = s(pick(rec, m.status)).slice(0, 60) || null, formed = dayOf(pick(rec, m.formed));
  const attrs = {}; for (const k of m.extra || []) { const v = s(rec[k]); if (v && !/phone|email|ssn|fax/i.test(k)) attrs[k] = v.slice(0, 200); }
  return { id: src.state + ':' + number.slice(0, 40), state: src.state, number: number.slice(0, 40), name, name_norm: normEntity(name), kind: kindOf(pick(rec, m.kind) || name), status,
    active: m.active ? !!pick(rec, m.active) : activeOf(status), formed: plausible(formed) ? formed : null, juris: s(pick(rec, m.juris)).slice(0, 60) || null,
    agent: s(pick(rec, m.agent)).slice(0, 200) || null, agent_addr: s(pick(rec, m.agent_addr)).slice(0, 250) || null, addr: s(pick(rec, m.addr)).slice(0, 250) || null,
    city: s(pick(rec, m.city)).slice(0, 80) || null, zip: s(pick(rec, m.zip)).slice(0, 10) || null, attrs, source: src.slug };
}
export { join };

// Florida Division of Corporations "Corporate Data File" (quarterly and daily files on its public SFTP), fixed width
const FL = { number: [0, 12], name: [12, 204], status: [204, 205], type: [205, 220], addr1: [220, 262], addr2: [262, 304], city: [304, 332], st: [332, 334], zip: [334, 344],
  filed: [472, 480], fei: [480, 494], juris: [503, 505], agent: [544, 586], agentType: [586, 587], agentAddr: [587, 629], agentCity: [629, 657], agentSt: [657, 659], agentZip: [659, 668] };
export const sunbizCut = l => Object.fromEntries(Object.entries(FL).map(([k, [a, b]]) => [k, l.slice(a, b).trim()]));
export function sunbizRow(src, l) {
  if (!l || l.length < 500) return null;
  const c = sunbizCut(l); if (!c.number || !c.name) return null;
  return { id: 'FL:' + c.number, state: 'FL', number: c.number, name: c.name, name_norm: normEntity(c.name), kind: kindOf(c.type) || kindOf(c.name), status: c.status === 'A' ? 'Active' : c.status === 'I' ? 'Inactive' : c.status || null,
    active: c.status === 'A' ? true : c.status === 'I' ? false : null, formed: plausible(dayOf(c.filed)) ? dayOf(c.filed) : null, juris: c.juris || null, agent: c.agent || null,
    agent_addr: join(c.agentAddr, c.agentCity, (c.agentSt + ' ' + c.agentZip).trim()) || null, addr: join(c.addr1, c.addr2) || null, city: c.city || null, zip: c.zip.slice(0, 10) || null,
    attrs: c.type ? { filingType: c.type } : {}, source: src.slug };
}
