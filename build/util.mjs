// Shared helpers for the data pipeline.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const UA = { 'User-Agent': 'Mozilla/5.0 (RealEstateIntelligence filings map build)' };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const log = (...a) => console.log('[build]', ...a);
export const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 12);

// A URL safe to put in a log line or an error message: no query string (API keys ride there), no user:password, and
// webhook paths (which are the secret) cut to the host.
const WEBHOOK_HOSTS = /(^|\.)(hooks\.zapier\.com|hooks\.slack\.com|discord(app)?\.com)$/i;
export function safeUrl(url) {
  try { const u = new URL(String(url)); return u.origin + (WEBHOOK_HOSTS.test(u.hostname) ? '/…' : u.pathname); }
  catch { return String(url).replace(/[?#].*$/, '').replace(/\/\/[^/@]+@/, '//'); }
}

// An HTTP answer the pipeline could not use. `status` is the code (0 for a network failure or a timeout), `retryable`
// says whether more tries would have made sense, `attempts` how many were made. The message never carries secrets.
export class HttpError extends Error {
  constructor(message, { url, status = 0, retryable = false, attempts = 1, retryAfter, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'HttpError'; this.url = safeUrl(url); this.status = status; this.retryable = retryable; this.attempts = attempts;
    if (retryAfter != null) this.retryAfter = retryAfter;
  }
}

// What fetchRetry tries again: too many requests, a server that is down or timing out, and a network failure
// (a maintenance page is a 503, a connection refused is a TypeError from fetch). Any other 4xx is final.
export const transientStatus = s => s === 408 || s === 425 || s === 429 || (s >= 500 && s <= 599);
// Retry-After as milliseconds: seconds, or an HTTP date; null when absent or unreadable.
export function retryAfterMs(h, now = Date.now()) {
  if (h == null || h === '') return null;
  const s = String(h).trim(); if (/^\d+$/.test(s)) return +s * 1000;
  const t = Date.parse(s); return Number.isNaN(t) ? null : Math.max(0, t - now);
}

export const RETRY_DEFAULTS = { tries: 4, timeout: +(process.env.FETCH_TIMEOUT_MS || 60000), baseDelay: 1000, maxDelay: 30000, factor: 2 };

// fetch with bounded retries. `retry` is the number of tries (as before) or { tries, timeout, baseDelay, maxDelay, factor, sleep }.
//   - every attempt gets its own time limit (`opts.timeout` or retry.timeout, ms); the caller's own `opts.signal` still aborts
//   - 429 and 5xx (and network failures / timeouts) are tried again after an exponential backoff with full jitter, capped at
//     maxDelay; a Retry-After header is honoured instead of the backoff, and one longer than maxDelay stops the retries at
//     once (the server has said it is down for a while; waiting is pointless and hammering it is rude)
//   - any other 4xx is final on the first answer (a missing page or a refused key does not get better by asking again)
//   - every failed attempt is logged with the sanitized URL, the status and the context label (`opts.label`), never the body
// Errors are HttpError (status, retryable, attempts). The message keeps the old shape callers match on: "<url> <status>"
// for a final 4xx and "failed <url>" when the tries run out.
export async function fetchRetry(url, opts = {}, retry = RETRY_DEFAULTS.tries) {
  const cfg = { ...RETRY_DEFAULTS, ...(typeof retry === 'number' ? { tries: retry } : retry || {}) };
  const { timeout = cfg.timeout, label, ...init } = opts;
  const tries = Math.max(1, cfg.tries | 0), zzz = cfg.sleep || sleep, where = safeUrl(url), ctx = label ? ` (${label})` : '';
  const fail = (reason, extra) => new HttpError(`failed ${where}: ${reason}`, { url, retryable: true, ...extra });
  let last;
  for (let i = 0; i < tries; i++) {
    const timer = timeout > 0 ? AbortSignal.timeout(timeout) : null;
    const signal = timer && init.signal ? AbortSignal.any([init.signal, timer]) : timer || init.signal;
    let r, wait = null;
    try { r = await fetch(url, { ...init, signal, headers: { ...UA, ...(init.headers || {}) } }); }
    catch (e) {
      if (init.signal?.aborted) throw e; // the caller gave up: not ours to retry
      const reason = timer?.aborted || e?.name === 'TimeoutError' ? `timed out after ${timeout} ms` : 'network failure (' + (e?.cause?.code || e?.code || e?.message || 'unknown') + ')';
      last = fail(reason, { attempts: i + 1, cause: e });
      log(`http: ${where}${ctx} attempt ${i + 1}/${tries}: ${reason}`);
    }
    if (r) {
      if (r.ok) return r;
      if (!transientStatus(r.status)) {
        log(`http: ${where}${ctx} answered ${r.status}: not retrying`);
        throw new HttpError(`${where} ${r.status}`, { url, status: r.status, attempts: i + 1 });
      }
      wait = retryAfterMs(r.headers.get('retry-after'));
      last = fail(String(r.status) + (wait != null ? ` (Retry-After ${Math.round(wait / 1000)} s)` : ''), { status: r.status, attempts: i + 1, retryAfter: wait });
      log(`http: ${where}${ctx} attempt ${i + 1}/${tries}: ${r.status}${wait != null ? ', Retry-After ' + Math.round(wait / 1000) + ' s' : ''}`);
      if (wait != null && wait > cfg.maxDelay) { log(`http: ${where}${ctx}: asked to wait ${Math.round(wait / 1000)} s, over the ${Math.round(cfg.maxDelay / 1000)} s cap; giving up`); throw last; }
    }
    if (i < tries - 1) await zzz(wait != null ? wait : backoff(i, cfg));
  }
  last.attempts = tries; throw last;
}
// exponential backoff with full jitter: a random wait up to base × factor^i, capped
export const backoff = (i, { baseDelay = RETRY_DEFAULTS.baseDelay, maxDelay = RETRY_DEFAULTS.maxDelay, factor = RETRY_DEFAULTS.factor, random = Math.random } = {}) =>
  Math.round(random() * Math.min(maxDelay, baseDelay * Math.pow(factor, i)));

export async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

export async function readJSON(path, fallback) { try { return JSON.parse(await fs.readFile(path, 'utf8')); } catch (e) { return fallback; } }

// Caches and committed data are written one entry per line, sorted, so nightly git diffs stay small.
export async function writeMap(path, obj) {
  const keys = Object.keys(obj).sort();
  await fs.writeFile(path, '{\n' + keys.map(k => JSON.stringify(k) + ':' + JSON.stringify(obj[k])).join(',\n') + '\n}\n');
}
export async function writeRows(path, head, key, rows) {
  const { [key]: _, ...rest } = head;
  const top = JSON.stringify(rest).slice(1, -1);
  await fs.writeFile(path, '{' + top + (top ? ',' : '') + JSON.stringify(key) + ':[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]}\n');
}

export function mdY(d) { return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear(); }
export const iso = d => d.toISOString().slice(0, 10);
