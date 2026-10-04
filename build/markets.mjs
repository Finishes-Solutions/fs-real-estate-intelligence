// Markets for the Market tab and the correlation explorer -> data/markets.json (nightly, part of build.mjs).
// Every series in lib/markets.mjs: ten years of daily closes (Yahoo Finance chart data) or FRED observations, reduced to
// monthly values for correlation and the last ~13 months of daily points for the charts. A series that fails keeps the
// previous night's numbers (marked stale), so one blocked source never empties the section.
import { log } from './util.mjs';
import { SERIES, yahooUrl, fredUrl, parseYahoo, parseFred, summarize } from '../lib/markets.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence; data build)', Accept: '*/*' };
async function get(url, ms = 30000) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (r.ok) return r; if (r.status !== 429 && r.status < 500) throw new Error(r.status); throw new Error(r.status + ' (retry)'); }
    catch (e) { if (i >= 2 || !/retry|abort|timeout|fetch failed/i.test(e.message)) throw new Error(url.split('?')[0].replace(/^https:\/\//, '') + ': ' + e.message); await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}

export async function fetchPoints(s, fetchImpl = get) {
  if (s.src === 'yahoo') return parseYahoo(await (await fetchImpl(yahooUrl(s.sym))).json());
  if (s.src === 'fred') return parseFred(await (await fetchImpl(fredUrl(s.sym))).text());
  throw new Error('unknown source ' + s.src);
}

export async function buildMarkets(prev = {}, fetchImpl = get) {
  const out = { built: new Date().toISOString(), series: {}, errors: [] }, old = prev.series || {};
  let i = 0;
  const work = SERIES.slice(), next = async () => {
    while (i < work.length) {
      const s = work[i++];
      try { const pts = await fetchPoints(s, fetchImpl), sum = summarize(s, pts); if (!sum) throw new Error('no data'); out.series[s.id] = sum; }
      catch (e) { out.errors.push(s.id + ': ' + e.message); if (old[s.id]) out.series[s.id] = { ...old[s.id], stale: true }; }
      await new Promise(r => setTimeout(r, 150)); // gentle on both services
    }
  };
  await Promise.all([next(), next(), next(), next()]);
  log('markets:', Object.keys(out.series).length, 'of', SERIES.length, 'series', out.errors.length ? '| failed: ' + out.errors.join('; ') : '');
  return out;
}
