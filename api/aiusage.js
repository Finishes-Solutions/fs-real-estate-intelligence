// AI usage for Settings › AI model › Usage: the tokens the app recorded (ai_usage, by day, model and feature; costs
// are worked out in the browser from lib/aiprices.mjs so price corrections apply at once), and, when the server has an
// OpenAI admin key (OPENAI_ADMIN_KEY), what OpenAI actually billed over the same days, by model (its Costs API; that
// covers everything on the OpenAI organization, voice included).
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -> { from, to, tracking, rows: [{ day, model, feature, requests, input_tokens,
//        cached_tokens, output_tokens, reasoning_tokens }], billed: { total, currency, byModel: [{ model, amount }] } | null, billedError }
import { supa } from '../lib/supa.mjs';
import { dayOf } from '../lib/aiusage.mjs';
import { rateLimit, sameOrigin } from './_lib/guard.mjs';

const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z'));
// OpenAI's costs by line item ("gpt-6-astra, input"), summed by model over the days asked for
export async function billed(adminKey, from, to, fetchFn = fetch) {
  const start = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000), end = Math.floor(Date.parse(to + 'T00:00:00Z') / 1000) + 86400;
  const by = new Map(); let total = 0, currency = 'usd', page = null;
  for (let i = 0; i < 12; i++) {
    const q = new URLSearchParams({ start_time: String(start), end_time: String(end), bucket_width: '1d', group_by: 'line_item', limit: '180', ...(page ? { page } : {}) });
    const r = await fetchFn('https://api.openai.com/v1/organization/costs?' + q, { headers: { Authorization: 'Bearer ' + adminKey }, signal: AbortSignal.timeout(12000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'OpenAI refused the admin key (' + r.status + ').' : 'OpenAI costs: ' + (d.error?.message || r.status));
    for (const b of d.data || []) for (const x of b.results || []) {
      const v = +x.amount?.value || 0; if (!v) continue; total += v; currency = x.amount?.currency || currency;
      const model = String(x.line_item || 'Other').split(',')[0].trim().replace(/-\d{4}-\d{2}-\d{2}$/, '') || 'Other'; by.set(model, (by.get(model) || 0) + v);
    }
    if (!d.has_more || !d.next_page) break; page = d.next_page;
  }
  return { total, currency, byModel: [...by].map(([model, amount]) => ({ model, amount })).sort((a, b) => b.amount - a.amount) };
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
  if (process.env.OPENAI_ADMIN_KEY) { try { bill = await billed(process.env.OPENAI_ADMIN_KEY, from, to); } catch (e) { billedError = e.message; } }
  return res.json({ from, to, tracking, trackError, rows, billed: bill, billedError, admin: !!process.env.OPENAI_ADMIN_KEY });
}
