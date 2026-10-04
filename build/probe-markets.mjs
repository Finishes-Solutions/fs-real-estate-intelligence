// Diagnostic: free market-data sources for the Markets section (stock / ETF daily closes, crypto, commodities, construction
// costs). Run "Probe services" with script=markets. Prints status, timing and the first rows of each.
const H = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence; +https://fs-real-estate-intelligence.vercel.app)', Accept: '*/*' };
const j = async u => { const t = Date.now(); try { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(15000) }); const x = await r.text(); return { s: r.status, ms: Date.now() - t, x }; } catch (e) { return { s: 'ERR ' + e.message, ms: Date.now() - t, x: '' }; } };
const show = (name, r, f = x => x.slice(0, 160).replace(/\s+/g, ' ')) => console.log(name.padEnd(34), String(r.s).padEnd(4), String(r.ms).padStart(6) + 'ms', r.x.length + 'B |', f(r.x));
const lines = x => { const l = x.trim().split('\n'); return l.length + ' lines: ' + l.slice(0, 2).join(' / ') + ' … ' + l[l.length - 1]; };

// stocks and ETFs, daily history
for (const s of ['xom.us', 'itb.us', '^spx']) show('stooq ' + s, await j('https://stooq.com/q/d/l/?s=' + encodeURIComponent(s) + '&i=d'), lines);
for (const s of ['XOM', 'ITB', '^GSPC', 'BTC-USD']) show('yahoo chart ' + s, await j('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?range=10y&interval=1d'), x => { try { const d = JSON.parse(x).chart.result[0]; return d.timestamp.length + ' days, last close ' + d.indicators.quote[0].close.slice(-1)[0] + ', meta price ' + d.meta.regularMarketPrice; } catch (e) { return x.slice(0, 120); } });
show('yahoo quote XOM,ITB', await j('https://query1.finance.yahoo.com/v7/finance/quote?symbols=XOM,ITB'));
show('nasdaq api XOM', await j('https://api.nasdaq.com/api/quote/XOM/historical?assetclass=stocks&fromdate=2016-01-01&limit=9999'), x => x.slice(0, 200));
// crypto
show('coinbase candles BTC', await j('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400'), x => { try { const a = JSON.parse(x); return a.length + ' days, newest ' + JSON.stringify(a[0]); } catch (e) { return x.slice(0, 120); } });
show('coinbase ticker ETH', await j('https://api.exchange.coinbase.com/products/ETH-USD/ticker'));
show('coingecko simple', await j('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'));
show('coingecko history 365d', await j('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily'), x => x.slice(0, 120));
show('kraken OHLC', await j('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440'), x => x.slice(0, 120));
// commodities, construction costs, indexes (FRED graph CSV, no key)
for (const id of ['DCOILWTICO', 'DHHNGSP', 'WPU081', 'WPUSI012011', 'WPU101', 'PCU327320327320', 'PCOPPUSDM', 'SP500', 'NASDAQCOM', 'VIXCLS', 'CBBTCUSD'])
  show('fred ' + id, await j('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=2016-01-01'), lines);
