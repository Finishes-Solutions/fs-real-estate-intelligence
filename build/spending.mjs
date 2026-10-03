// BLS Consumer Expenditure Survey coefficients for the modeled tract spending (lib/spending.mjs).
// Values from the BLS public API (v2 with BLS_KEY, else v1: 25 series per request, 25 requests a day, plenty for a yearly refresh).
// The series ids are pinned in lib/spending.mjs: the flat-file catalog on download.bls.gov answers 403 to GitHub Actions.
// Cached in data/cache/ce.json; the CE publishes once a year (September), so this only re-asks every 30 days.
import { log } from './util.mjs';
import { seriesIds, ceFrom } from '../lib/spending.mjs';

// a descriptive agent with a contact, as BLS asks of scripted clients
const HEAD = { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0 (+https://github.com/Finishes-Solutions/fs-real-estate-intelligence)', Accept: 'text/plain,application/json' };

async function values(ids, env, fetchImpl) {
  const key = env.BLS_KEY, url = 'https://api.bls.gov/publicAPI/' + (key ? 'v2' : 'v1') + '/timeseries/data/', per = key ? 50 : 25, now = new Date().getUTCFullYear();
  const out = {}; let year = null;
  for (let i = 0; i < ids.length; i += per) {
    const body = { seriesid: ids.slice(i, i + per), startyear: String(now - 3), endyear: String(now), ...(key ? { registrationkey: key } : {}) };
    const r = await fetchImpl(url, { method: 'POST', headers: { ...HEAD, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const d = await r.json().catch(() => ({}));
    if (d.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS API: ' + ((d.message || []).join(' ').slice(0, 200) || 'HTTP ' + r.status));
    for (const s of d.Results?.series || []) for (const p of s.data || []) { const y = +p.year, v = +String(p.value).replace(/,/g, ''); if (!Number.isFinite(v)) continue; (out[y] ||= {})[s.seriesID] = v; }
  }
  // the newest year that has most of the series
  for (const y of Object.keys(out).map(Number).sort((a, b) => b - a)) if (Object.keys(out[y]).length >= ids.length * 0.8) { year = y; break; }
  if (!year) throw new Error('BLS API: no year with enough values');
  return { year, values: out[year] };
}

// -> ce coefficients ({ year, inc, means, south, at }) or the cached ones when nothing new is needed / reachable
export async function buildCE(prev, env = process.env, fetchImpl = globalThis.fetch) {
  if (prev?.inc && prev?.at && Date.now() - Date.parse(prev.at) < 30 * 864e5 && !env.REBUILD_SPENDING) { log('spending: CE', prev.year, 'cached'); return prev; }
  try {
    const ids = seriesIds(), v = await values(ids, env, fetchImpl), ce = ceFrom(v.values, v.year);
    if (!ce) throw new Error('CE values incomplete or not rising with income');
    log('spending: CE', ce.year, '| income quintiles', ce.inc.map(x => '$' + Math.round(x / 1000) + 'K').join(' '), '|', Object.keys(ce.means).length, 'categories | South factor', ce.south.total ?? 'n/a');
    return { ...ce, at: new Date().toISOString() };
  } catch (e) {
    log('spending: CE refresh failed (' + e.message.slice(0, 160) + ')' + (prev?.inc ? ', keeping ' + prev.year : ''));
    if (prev?.inc) return prev; throw e;
  }
}
