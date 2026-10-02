// AI project brief: GET /api/brief?id=TABS...  -> { brief, built }
// Grounded in the filing, nearby activity, the same developer's other filings, tract demographics and change history.
// Responses are CDN-cached per id for a week (and invalidated by each data deploy), so repeat views cost nothing.
import { chatText, pickModel } from '../lib/openai.mjs';
import { entityKey } from '../lib/taxonomy.mjs';
import { miles } from '../lib/filter.mjs';
import { load } from './_lib/data.mjs';
import { rateLimit, needKey } from './_lib/guard.mjs';

let modelP = null;
const model = key => (modelP ||= pickModel(key, process.env.OPENAI_MODEL).catch(e => { modelP = null; throw e; }));

function inPoly(pt, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.some(rings => { let ins = false; const ring = rings[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) ins = !ins; }
    return ins; });
}
const brief = f => ({ id: f.id, name: f.name, city: f.city, type: f.type, use: f.use, cost: f.cost, sqft: f.sqft, reg: f.reg, start: f.ts, end: f.te, status: f.status });

export default async function handler(req, res) {
  const id = String(req.query.id || '').slice(0, 40);
  if (!/^[A-Za-z0-9-]+$/.test(id)) return res.status(400).json({ error: 'Bad id' });
  if (!rateLimit(req, res, { perMinute: 6, perDay: 40 })) return;
  const key = needKey(res); if (!key) return;
  try {
    const [data, market, changes] = await Promise.all([load('filings.json'), load('market.json').catch(() => null), load('changes.json').catch(() => null)]);
    const f = data.filings.find(x => x.id === id); if (!f) return res.status(404).json({ error: 'Not found' });
    const pt = [f.lon, f.lat];
    const near = data.filings.filter(x => x.id !== id && miles(pt, [x.lon, x.lat]) <= 2).sort((a, b) => b.cost - a.cost);
    const dk = entityKey(f.dev || f.owner), same = dk ? data.filings.filter(x => x.id !== id && entityKey(x.dev || x.owner) === dk).sort((a, b) => b.cost - a.cost) : [];
    const tract = market?.tracts?.find(t => inPoly(pt, t.geom));
    const hist = (changes?.runs || []).flatMap(r => r.items.filter(x => x.id === id).map(x => ({ date: r.built.slice(0, 10), ...x })));
    const facts = {
      filing: { ...f, lat: undefined, lon: undefined, _hay: undefined, inferredDates: { start: !!f.tsE, end: !!f.teE } },
      nearby2mi: { count: near.length, totalValue: near.reduce((s, x) => s + x.cost, 0), largest: near.slice(0, 8).map(brief) },
      sameDeveloper: { count: same.length, totalValue: same.reduce((s, x) => s + x.cost, 0), largest: same.slice(0, 6).map(brief) },
      tract: tract ? { acsYear: market.year, population: tract.pop, growthPctSince: market.baseYear, growthPct: tract.gr, medianHouseholdIncome: tract.inc, medianHomeValue: tract.val, medianRent: tract.rent, vacancyPct: tract.vacr, medianAge: tract.age } : null,
      changeHistory: hist
    };
    const system = `You write short project briefs for a fully integrated real estate developer and operator scouting the Houston-west market.
Use ONLY the facts provided (a Texas TDLR TABS accessibility registration plus derived context). Values and dates are filer estimates; inferred dates are our own estimates and must be called "estimated".
Format exactly these sections as plain text with the heading on its own line: What it is / Timing / Who's involved / Area context / Why it matters. 2-3 sentences each, under 220 words total. If a fact is missing, say so briefly rather than guessing. Cite related filings by id in square brackets.`;
    const text = await chatText({ key, model: await model(key), system, user: JSON.stringify(facts), maxTokens: 8000 });
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');
    return res.json({ brief: text, built: data.built });
  } catch (e) {
    console.error('brief failed', e);
    return res.status(502).json({ error: 'Couldn’t write the brief right now.' });
  }
}
