// AI usage for Settings › AI model › Usage: the tokens the app recorded (ai_usage, by day, model and feature; costs
// are worked out in the browser from lib/aiprices.mjs so price corrections apply at once), and, when the server has an
// OpenAI admin key (OPENAI_ADMIN_KEY, read-only is enough), what OpenAI billed for this app's own API key over the same
// days, by model (voice included). The organization has other keys and projects; only this app's key (or, if OpenAI
// won't split by key, its project) is ever counted.
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -> { from, to, tracking, rows: [{ day, model, feature, requests, input_tokens,
//        cached_tokens, output_tokens, reasoning_tokens }], billed: { scope: 'key' | 'project', project: { id, name, keys }, key: { id, name },
//        total, currency, byModel: [{ model, amount }], keyTokens? } | null, billedError }
import { supa } from '../lib/supa.mjs';
import { dayOf } from '../lib/aiusage.mjs';
import { rateLimit, sameOrigin } from './_lib/guard.mjs';

const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z'));
const ORG = 'https://api.openai.com/v1/organization';
async function adminGet(adminKey, path, fetchFn) {
  const r = await fetchFn(ORG + path, { headers: { Authorization: 'Bearer ' + adminKey }, signal: AbortSignal.timeout(12000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(r.status === 401 || r.status === 403 ? 'OpenAI refused the admin key (' + r.status + ').' : 'OpenAI: ' + (d.error?.message || r.status)), { status: r.status, detail: d.error?.message || '' });
  return d;
}
async function pages(adminKey, path, fetchFn, max = 20) {
  const out = []; let after = null;
  for (let i = 0; i < max; i++) { const d = await adminGet(adminKey, path + (path.includes('?') ? '&' : '?') + 'limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), fetchFn); out.push(...(d.data || [])); if (!d.has_more || !d.last_id) break; after = d.last_id; }
  return out;
}
// a key OpenAI shows redacted ("sk-proj-abc…wxyz", "sk-...wxyz") against the full key: the visible start and end must match
export function sameKey(redacted, key) {
  if (!redacted || !key) return false; const m = String(redacted).match(/^(.*?)(?:\*+|\.{3}|…)(.*)$/);
  if (!m) return redacted === key; const [, pre, suf] = m; return suf.length >= 4 && key.startsWith(pre) && key.endsWith(suf);
}
// which OpenAI project and key this app uses (OPENAI_API_KEY), found through the admin API; OPENAI_PROJECT_ID and
// OPENAI_API_KEY_ID set it outright. Kept an hour per server instance. null when it can't be found.
let found = null;
export async function findKey(adminKey, apiKey, env = process.env, fetchFn = fetch) {
  if (found && Date.now() - found.at < 36e5 && found.for === apiKey.slice(-6)) return found.v;
  let v = null;
  const projects = env.OPENAI_PROJECT_ID ? [{ id: env.OPENAI_PROJECT_ID, name: '' }] : (await pages(adminKey, '/projects', fetchFn)).filter(p => p.status !== 'archived');
  for (const p of projects) {
    let keys = []; try { keys = await pages(adminKey, '/projects/' + encodeURIComponent(p.id) + '/api_keys', fetchFn); } catch (e) { if (env.OPENAI_PROJECT_ID) throw e; continue; }
    const k = env.OPENAI_API_KEY_ID ? keys.find(x => x.id === env.OPENAI_API_KEY_ID) : keys.find(x => sameKey(x.redacted_value, apiKey));
    if (k || (env.OPENAI_PROJECT_ID && env.OPENAI_API_KEY_ID)) { v = { projectId: p.id, projectName: p.name || '', keyId: k?.id || env.OPENAI_API_KEY_ID, keyName: k?.name || '', projectKeys: keys.length }; break; }
  }
  found = { at: Date.now(), for: apiKey.slice(-6), v }; return v;
}
// what OpenAI billed for this app's key over the days asked (its Costs API by line item, "gpt-6-astra, input", summed by
// model). Asked for the key alone; when OpenAI won't split costs by key, the key's project, and then (when the project
// has other keys too) OpenAI's own token counts for the key alone come along to be priced. Never the whole organization.
export async function billed(adminKey, apiKey, from, to, env = process.env, fetchFn = fetch) {
  const k = await findKey(adminKey, apiKey, env, fetchFn);
  if (!k) throw new Error('This app’s OpenAI key wasn’t found in the organization’s projects, so nothing billed is shown (set OPENAI_API_KEY_ID and OPENAI_PROJECT_ID on the server to point at it).');
  const start = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000), end = Math.floor(Date.parse(to + 'T00:00:00Z') / 1000) + 86400;
  const costs = async filter => { const by = new Map(); let total = 0, currency = 'usd', page = null;
    for (let i = 0; i < 12; i++) {
      const q = new URLSearchParams({ start_time: String(start), end_time: String(end), bucket_width: '1d', group_by: 'line_item', limit: '180', ...filter, ...(page ? { page } : {}) });
      const d = await adminGet(adminKey, '/costs?' + q, fetchFn);
      for (const b of d.data || []) for (const x of b.results || []) {
        const v = +x.amount?.value || 0; if (!v) continue; total += v; currency = x.amount?.currency || currency;
        const model = String(x.line_item || 'Other').split(',')[0].trim().replace(/-\d{4}-\d{2}-\d{2}$/, '') || 'Other'; by.set(model, (by.get(model) || 0) + v);
      }
      if (!d.has_more || !d.next_page) break; page = d.next_page;
    }
    return { total, currency, byModel: [...by].map(([model, amount]) => ({ model, amount })).sort((a, b) => b.amount - a.amount) }; };
  const who = { project: { id: k.projectId, name: k.projectName, keys: k.projectKeys }, key: { id: k.keyId, name: k.keyName } };
  try { return { scope: 'key', ...who, ...(await costs({ project_ids: k.projectId, api_key_ids: k.keyId })) }; }
  catch (e) { if (e.status !== 400) throw e; } // OpenAI doesn't split costs by key: the project's, said as such
  const out = { scope: 'project', ...who, ...(await costs({ project_ids: k.projectId })) };
  if (k.projectKeys > 1) { // other keys share the project: this key's own tokens, from OpenAI, to price
    const rows = new Map(); let page = null;
    for (let i = 0; i < 12; i++) {
      const q = new URLSearchParams({ start_time: String(start), end_time: String(end), bucket_width: '1d', group_by: 'model', limit: '31', project_ids: k.projectId, api_key_ids: k.keyId, ...(page ? { page } : {}) });
      const d = await adminGet(adminKey, '/usage/completions?' + q, fetchFn);
      for (const b of d.data || []) for (const x of b.results || []) { const m = String(x.model || 'Other').replace(/-\d{4}-\d{2}-\d{2}$/, ''), o = rows.get(m) || { model: m, requests: 0, input: 0, cached: 0, output: 0 };
        o.requests += +x.num_model_requests || 0; o.input += +x.input_tokens || 0; o.cached += +x.input_cached_tokens || 0; o.output += +x.output_tokens || 0; rows.set(m, o); }
      if (!d.has_more || !d.next_page) break; page = d.next_page;
    }
    out.keyTokens = [...rows.values()];
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 20, perDay: 500 })) return;
  const today = dayOf(), q = req.query || {};
  const to = okDay(q.to) ? q.to : today, from = okDay(q.from) && q.from <= to ? q.from : today.slice(0, 8) + '01';
  res.setHeader('Cache-Control', 'no-store');
  const db = supa(); let rows = [], tracking = !!(db && db.via === 'key'), trackError = '';
  if (tracking) try { rows = await db.selectAll('ai_usage', 'select=day,model,feature,requests,input_tokens,cached_tokens,output_tokens,reasoning_tokens&day=gte.' + from + '&day=lte.' + to + '&order=day.asc'); }
    catch (e) { tracking = false; trackError = /ai_usage|relation|42P01|PGRST/.test(e.message) ? 'The usage table isn’t set up in the database yet.' : 'The usage numbers couldn’t be read just now.'; console.error('aiusage', e.message); }
  let bill = null, billedError = '';
  if (process.env.OPENAI_ADMIN_KEY && process.env.OPENAI_API_KEY) { try { bill = await billed(process.env.OPENAI_ADMIN_KEY, process.env.OPENAI_API_KEY, from, to); } catch (e) { billedError = e.message; console.error('aiusage billed', e.message); } }
  return res.json({ from, to, tracking, trackError, rows, billed: bill, billedError, admin: !!process.env.OPENAI_ADMIN_KEY });
}
