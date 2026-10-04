// Market series for the Market tab's Markets section and the correlation explorer: what moves Houston real estate.
// Shared by the nightly build (build/markets.mjs writes data/markets.json), the live quotes (api/markets.js) and the
// app (src/markets.js, the assistant's market tools).
//   src: 'yahoo'  daily closes from Yahoo Finance's chart data (unofficial, delayed; stocks, ETFs, indexes, crypto)
//        'fred'   FRED graph CSV (St. Louis Fed; commodities, producer prices, rates, Houston metro statistics)
//   live: 'coinbase:BTC-USD' crypto quotes from Coinbase's public ticker; stocks get Yahoo's latest price where it answers
//   freq: 'd' daily, 'm' monthly, 'q' quarterly. agg: how a month is summarized from daily values ('mean' or 'last')
export const GROUPS = [
  ['local', 'Houston economy', 'Houston metro statistics, monthly: the local side of a correlation.'],
  ['energy', 'Energy', 'Oil and natural gas: Houston’s job market and office demand follow them.'],
  ['houston', 'Houston companies', 'Public companies headquartered or with major campuses in the Houston area.'],
  ['housing', 'Housing & REITs', 'Homebuilders and real estate investment trusts: the market’s view of housing and property.'],
  ['costs', 'Construction costs', 'Producer price indexes for building materials (monthly, BLS via FRED).'],
  ['rates', 'Rates', 'What borrowing costs.'],
  ['indexes', 'Stock indexes', 'The broad market.'],
  ['crypto', 'Crypto', 'Traded around the clock; little proven link to Houston property.']
];

const Y = (id, label, group, extra = {}) => ({ id, src: 'yahoo', sym: id, label, group, freq: 'd', agg: 'mean', unit: '$', ...extra });
const F = (id, label, group, freq, unit, extra = {}) => ({ id: id.toLowerCase(), src: 'fred', sym: id, label, group, freq, agg: 'mean', unit, ...extra });

export const SERIES = [
  // Houston metro (FRED): monthly unless noted
  F('HOUS448BPPRIVSA', 'Houston housing permits (units, seasonally adj.)', 'local', 'm', 'units', { short: 'Housing permits' }),
  F('HOUS448UR', 'Houston unemployment rate', 'local', 'm', '%', { short: 'Unemployment', diff: true }),
  F('HOUS448NA', 'Houston jobs (nonfarm, thousands)', 'local', 'm', 'k jobs', { short: 'Jobs' }),
  F('MEDLISPRI26420', 'Houston median listing price (Realtor.com)', 'local', 'm', '$', { short: 'Listing price' }),
  F('ACTLISCOU26420', 'Houston homes for sale (Realtor.com)', 'local', 'm', 'listings', { short: 'Homes for sale' }),
  F('MEDDAYONMAR26420', 'Houston median days on market (Realtor.com)', 'local', 'm', 'days', { short: 'Days on market' }),
  F('ATNHPIUS26420Q', 'Houston house price index (FHFA, quarterly)', 'local', 'q', 'index', { short: 'House prices' }),
  // energy
  F('DCOILWTICO', 'WTI crude oil', 'energy', 'd', '$/bbl', { short: 'Oil (WTI)' }),
  F('DHHNGSP', 'Henry Hub natural gas', 'energy', 'd', '$/MMBtu', { short: 'Natural gas' }),
  Y('XLE', 'Energy stocks (XLE)', 'energy'),
  // Houston companies
  Y('XOM', 'ExxonMobil', 'houston'), Y('CVX', 'Chevron', 'houston'), Y('COP', 'ConocoPhillips', 'houston'), Y('OXY', 'Occidental', 'houston'),
  Y('SLB', 'SLB', 'houston'), Y('HAL', 'Halliburton', 'houston'), Y('BKR', 'Baker Hughes', 'houston'), Y('KMI', 'Kinder Morgan', 'houston'),
  Y('EPD', 'Enterprise Products', 'houston'), Y('PSX', 'Phillips 66', 'houston'), Y('CNP', 'CenterPoint Energy', 'houston'),
  Y('SYY', 'Sysco', 'houston'), Y('WM', 'Waste Management', 'houston'), Y('HPE', 'Hewlett Packard Enterprise', 'houston'),
  // housing and REITs
  Y('ITB', 'Homebuilders (ITB)', 'housing'), Y('XHB', 'Homebuilders & suppliers (XHB)', 'housing'), Y('VNQ', 'Real estate (VNQ)', 'housing'),
  Y('DHI', 'D.R. Horton', 'housing'), Y('LEN', 'Lennar', 'housing'), Y('CPT', 'Camden Property Trust (Houston)', 'housing'),
  Y('PLD', 'Prologis (industrial)', 'housing'), Y('WY', 'Weyerhaeuser (timber, lumber)', 'housing'),
  // construction costs (monthly producer price indexes)
  F('WPU081', 'Lumber and wood products (PPI)', 'costs', 'm', 'index', { short: 'Lumber' }),
  F('WPUSI012011', 'Construction materials (PPI)', 'costs', 'm', 'index', { short: 'Building materials' }),
  F('WPU101', 'Iron and steel (PPI)', 'costs', 'm', 'index', { short: 'Steel' }),
  F('PCU327320327320', 'Ready-mix concrete (PPI)', 'costs', 'm', 'index', { short: 'Concrete' }),
  F('PCOPPUSDM', 'Copper', 'costs', 'm', '$/t', { short: 'Copper' }),
  // rates
  F('MORTGAGE30US', '30-yr mortgage rate', 'rates', 'd', '%', { short: '30-yr mortgage', diff: true }),
  F('DGS10', '10-yr Treasury yield', 'rates', 'd', '%', { short: '10-yr Treasury', diff: true }),
  F('FEDFUNDS', 'Fed funds rate', 'rates', 'm', '%', { short: 'Fed funds', diff: true }),
  // indexes
  Y('^GSPC', 'S&P 500', 'indexes', { id: 'spx', unit: 'pts' }), Y('^IXIC', 'Nasdaq Composite', 'indexes', { id: 'nasdaq', unit: 'pts' }),
  Y('^DJI', 'Dow Jones Industrial', 'indexes', { id: 'dow', unit: 'pts' }), Y('^RUT', 'Russell 2000 (small companies)', 'indexes', { id: 'russell', unit: 'pts' }),
  Y('^VIX', 'VIX (expected volatility)', 'indexes', { id: 'vix', unit: 'pts', diff: true }),
  // crypto
  Y('BTC-USD', 'Bitcoin', 'crypto', { id: 'btc', live: 'coinbase:BTC-USD' }), Y('ETH-USD', 'Ethereum', 'crypto', { id: 'eth', live: 'coinbase:ETH-USD' }),
  Y('SOL-USD', 'Solana', 'crypto', { id: 'sol', live: 'coinbase:SOL-USD' }), Y('XRP-USD', 'XRP', 'crypto', { id: 'xrp', live: 'coinbase:XRP-USD' })
].map(s => ({ ...s, id: s.id.toLowerCase(), short: s.short || s.label.replace(/ \(.*\)$/, '') }));
export const BY_ID = new Map(SERIES.map(s => [s.id, s]));

export const yahooUrl = (sym, range = '10y') => 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=' + range + '&interval=1d';
export const fredUrl = (sym, since = '2015-01-01') => 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + encodeURIComponent(sym) + '&cosd=' + since;
export const coinbaseUrl = product => 'https://api.exchange.coinbase.com/products/' + product + '/ticker';

// Yahoo chart JSON -> [[YYYY-MM-DD, close], ...] (days without a close are skipped)
export function parseYahoo(json) {
  const r = json?.chart?.result?.[0]; if (!r?.timestamp) return [];
  const c = r.indicators?.quote?.[0]?.close || [], off = (r.meta?.gmtoffset || 0) * 1000;
  return r.timestamp.map((t, i) => [new Date(t * 1000 + off).toISOString().slice(0, 10), c[i]]).filter(p => Number.isFinite(p[1]));
}
export const yahooPrice = json => { const m = json?.chart?.result?.[0]?.meta; return m && Number.isFinite(m.regularMarketPrice) ? { price: m.regularMarketPrice, time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null, prev: m.chartPreviousClose ?? m.previousClose ?? null } : null; };
export function parseFred(csv) {
  const out = [];
  for (const l of String(csv).trim().split('\n').slice(1)) { const [d, v] = l.split(','); const n = parseFloat(v); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(n)) out.push([d, n]); }
  return out;
}

// points -> { months: { start: 'YYYY-MM', v: [...] } } (mean or last of each month; quarterly series keep their quarter's first month)
export function monthly(points, agg = 'mean') {
  const m = new Map();
  for (const [d, v] of points) { const k = d.slice(0, 7), g = m.get(k) || { s: 0, n: 0, last: v }; g.s += v; g.n++; g.last = v; m.set(k, g); }
  const keys = [...m.keys()].sort(); if (!keys.length) return null;
  const out = [], [y0, m0] = keys[0].split('-').map(Number), [y1, m1] = keys[keys.length - 1].split('-').map(Number);
  for (let y = y0, mo = m0; y < y1 || (y === y1 && mo <= m1); mo === 12 ? (y++, mo = 1) : mo++) {
    const g = m.get(y + '-' + String(mo).padStart(2, '0')); out.push(g ? +(agg === 'last' ? g.last : g.s / g.n).toPrecision(6) : null);
  }
  return { start: keys[0], v: out };
}

// one series' entry in markets.json: last value and changes, the last ~13 months of daily points, monthly history
export function summarize(s, points, now = Date.now()) {
  if (!points.length) return null;
  const last = points[points.length - 1], ago = days => { const cut = new Date(Date.parse(last[0]) - days * 864e5).toISOString().slice(0, 10); return [...points].reverse().find(p => p[0] <= cut)?.[1] ?? null; };
  const pct = (a, b) => a != null && b ? +((a - b) / Math.abs(b) * 100).toFixed(2) : null;
  const prev = points.length > 1 ? points[points.length - 2][1] : null, yr = ago(365);
  const cut = new Date(now - 400 * 864e5).toISOString().slice(0, 10), recent = s.freq === 'd' ? points.filter(p => p[0] >= cut) : points.slice(-40);
  return { id: s.id, date: last[0], value: last[1], prev, chg: pct(last[1], prev), yr, chgYr: pct(last[1], yr),
    recent: { t: recent.map(p => p[0]), v: recent.map(p => +p[1].toPrecision(6)) }, months: monthly(points, s.agg) };
}
