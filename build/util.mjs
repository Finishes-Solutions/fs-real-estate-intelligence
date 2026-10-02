// Shared helpers for the data pipeline.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions filings map build)' };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const log = (...a) => console.log('[build]', ...a);
export const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 12);

export async function fetchRetry(url, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } }); if (r.ok) return r; if (r.status < 500 && r.status !== 429) throw new Error(url + ' ' + r.status); }
    catch (e) { if (i === tries - 1) throw e; }
    await sleep(800 * (i + 1));
  }
  throw new Error('failed ' + url);
}
export async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

export async function readJSON(path, fallback) { try { return JSON.parse(await fs.readFile(path, 'utf8')); } catch (e) { return fallback; } }

// Caches and committed data are written one entry per line, sorted, so weekly git diffs stay small.
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
