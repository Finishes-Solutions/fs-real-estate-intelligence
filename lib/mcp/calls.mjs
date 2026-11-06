// Long MCP tool calls (lib/mcp/server.mjs callTool, lib/mcp/planset.mjs): an answer inside the caller's time limit.
// Many MCP clients give up on a call after 60 s (the MCP TypeScript SDK's default request timeout), while site_plan,
// site_renderings or a plan set stretch work for up to four or five minutes inside this function's 300 s (vercel.json).
// So a call answers within REPLY_MS: a tool done by then answers as always; one still working is handed to the
// background (waitUntil keeps the function alive until it ends) and the answer is a call_id. call_result then waits up to
// REPLY_MS for it and gives the tool's own answer, kept in storage (lib/mcp/store.mjs, calls/<id>.json), once it is done.
// Without storage on the deployment there is nowhere to keep the answer, so the call simply waits as before.
import { waitUntil } from '@vercel/functions';
import { store, putJSON, getJSON, newId, ID } from './store.mjs';
import { UserError } from './resolve.mjs';
import { doc } from './text.mjs';

export const REPLY_MS = 40000;        // well inside a 60 s client limit, with room for the network and a cold start
export const STALE_MS = 330000;       // past the function's 300 s: a call still "running" then was stopped
// tests: the reply window, the clock, the poll step and the background (a function given each handed-off promise)
export const hooks = { replyMs: null, now: null, stepMs: null, later: null };
const now = () => (hooks.now || Date.now)();
const sleep = ms => new Promise(res => setTimeout(res, ms));
const path = id => 'calls/' + id + '.json';

// the reply window: MCP_REPLY_SECONDS (5 to 280) when set, else 40 s
export function replyMs(env = process.env) {
  if (hooks.replyMs != null) return hooks.replyMs;
  const s = +env.MCP_REPLY_SECONDS;
  return Number.isFinite(s) && s > 0 ? Math.max(5, Math.min(280, s)) * 1000 : REPLY_MS;
}
// { v } when p settles within ms (real time), else null; p keeps running either way
export async function within(p, ms) {
  let tm; const t = new Promise(res => { tm = setTimeout(() => res(null), ms); });
  try { return await Promise.race([p.then(v => ({ v })), t]); } finally { clearTimeout(tm); }
}
// keep the function alive until p ends (on Vercel; elsewhere the process carries on with it anyway)
export function later(p) {
  const q = Promise.resolve(p).catch(e => console.error('mcp background:', e.message));
  if (hooks.later) { hooks.later(q); return q; }
  try { waitUntil(q); } catch (e) { /* not on Vercel */ }
  return q;
}

const working = (name, id, secs) => doc(name + ': still working', [
  name + ' is taking longer than one call can wait' + (secs ? ' (' + secs + ' s so far)' : '') + ', so it carries on on the server.',
  'Call call_result with call_id "' + id + '" to get its answer: each call waits up to about ' + Math.round(replyMs() / 1000) + ' s for it. Most finish within five minutes of the first call. Don’t start the same request again: that would run it twice.']);

// run a tool's promise: its answer when it's done within the reply window, else a call_id and the work in the background
export async function replyOrHandOff(name, p) {
  const s = store();
  if (!s) return p;
  const r = await within(p, replyMs());
  if (r) return r.v;
  const id = newId(), rec = { v: 1, id, tool: name, state: 'running', at: new Date(now()).toISOString() };
  const saved = putJSON(s, path(id), rec);
  later(p.then(async result => { await saved.catch(() => {}); await putJSON(s, path(id), { ...rec, state: 'done', doneAt: new Date(now()).toISOString(), result }); })
    .catch(async e => { console.error('mcp', name, 'background', e.message); await putJSON(s, path(id), { ...rec, state: 'failed', error: String(e.message || e).slice(0, 200) }).catch(() => {}); }));
  try { await saved; } catch (e) { console.error('mcp', name, 'hand-off not kept', e.message); return p; } // nowhere to keep it: wait after all
  return { content: [{ type: 'text', text: working(name, id) }] };
}

// call_result: wait for a handed-off call, then its answer
export async function callResultTool(a = {}) {
  const s = store(); if (!s) throw new UserError('call_result needs storage on this deployment (SUPABASE_SECRET_KEY): it isn’t set up.');
  const id = String(a.call_id || '').trim(); if (!ID.test(id)) throw new UserError('Give the call_id a still-working answer gave.');
  const t0 = now(), waitMs = Math.min(replyMs(), a.wait_seconds == null ? Infinity : Math.max(0, +a.wait_seconds || 0) * 1000), step = hooks.stepMs || 3000;
  let rec = await getJSON(s, path(id));
  if (!rec) throw new UserError('There is no call ' + id + ' (call_ids come from an answer that said it was still working).');
  while (rec.state === 'running' && now() - t0 < waitMs) { await sleep(Math.min(step, Math.max(1, waitMs - (now() - t0)))); rec = await getJSON(s, path(id)) || rec; }
  if (rec.state === 'done') return rec.result;
  const age = now() - Date.parse(rec.at);
  if (rec.state === 'failed') return { content: [{ type: 'text', text: rec.tool + ' failed on the server: ' + (rec.error || 'unknown') + '. Try it again.' }], isError: true };
  if (age > STALE_MS) return { content: [{ type: 'text', text: rec.tool + ' was stopped at the server’s five-minute limit before it finished. Try it again with less to do (site_plan: effort "low" or "medium"; site_renderings: fewer views or a smaller resolution).' }], isError: true };
  return { content: [{ type: 'text', text: working(rec.tool, id, Math.round(age / 1000)) }] };
}
