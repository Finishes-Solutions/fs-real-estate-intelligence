// Live market prices for the Market tab's Markets section: GET /api/markets?quotes=1 (or &ids=btc,xom)
//   crypto: Coinbase's public ticker (real time); stocks, ETFs and indexes: Yahoo Finance's latest chart price (delayed,
//   unofficial). History and the monthly values come from data/markets.json (nightly); this only adds the latest prints.
// Cached at the edge for a minute so a room full of viewers makes one round of requests.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { SERIES, BY_ID, yahooUrl, yahooPrice, coinbaseUrl } from '../lib/markets.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence)', Accept: 'application/json' };
const getJson = async (url, fetchImpl, ms = 6000) => { const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(r.status); return r.json(); };

export async function quotes(ids, fetchImpl = fetch) {
  const list = (ids?.length ? ids.map(i => BY_ID.get(i)).filter(Boolean) : SERIES).filter(s => s.live || s.src === 'yahoo');
  const out = {}, errors = [];
  let i = 0;
  const work = async () => {
    while (i < list.length) {
      const s = list[i++];
      try {
        if (s.live?.startsWith('coinbase:')) { const t = await getJson(coinbaseUrl(s.live.slice(9)), fetchImpl); const price = parseFloat(t.price); if (Number.isFinite(price)) { out[s.id] = { price, time: t.time || null, src: 'Coinbase' }; continue; } }
        const q = yahooPrice(await getJson(yahooUrl(s.sym, '5d'), fetchImpl)); if (q) out[s.id] = { ...q, src: 'Yahoo Finance (delayed)' };
      } catch (e) { errors.push(s.id + ': ' + e.message); }
    }
  };
  await Promise.all(Array.from({ length: 8 }, work));
  return { time: new Date().toISOString(), quotes: out, errors };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 30, perDay: 3000 })) return;
  const q = req.query || {};
  if (!q.quotes) return res.status(400).json({ error: 'quotes=1 [&ids=btc,xom]' });
  const ids = String(q.ids || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 60);
  try {
    const out = await quotes(ids);
    res.setHeader('Cache-Control', Object.keys(out.quotes).length ? 'public, max-age=30, s-maxage=60, stale-while-revalidate=120' : 'no-store');
    return res.json(out);
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: 'Market prices are unavailable right now.' }); }
}
