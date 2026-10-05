// Correlation explorer maths (shared by the Market tab, the assistant's market tools and the tests).
// Honest by construction:
//   - series are compared as changes (year over year by default; month over month optional), never raw levels, which
//     would make anything that trends up "correlate" with anything else that does
//   - one series can lead the other by up to 12 months; every lag tried counts as a test (Bonferroni)
//   - year-over-year changes overlap month to month, so the effective number of independent points is far below the
//     number of months (Bartlett: n_eff = n·(1 − ρa·ρb)/(1 + ρa·ρb) from each series' lag-1 autocorrelation)
//   - the relationship has to hold in both halves of the period to count as stable
//   - rank (Spearman) correlation, so one extreme month (spring 2020) can't make two series look related on its own
//   - the overlap correction uses each series' own step-to-step autocorrelation over the months actually compared, so
//     quarterly series (house prices) are corrected too
//   - a best fit at the longest lag tried is capped at "weak": it usually means a slow shared trend, not a lead
// Correlation is not causation, and the verdicts say so.

// ---------- monthly maps ----------
const ym = (y, m) => y + '-' + String(m).padStart(2, '0');
export const addMonths = (k, n) => { const [y, m] = k.split('-').map(Number), t = y * 12 + (m - 1) + n; return ym(Math.floor(t / 12), (t % 12) + 1); };
// { start: 'YYYY-MM', v: [...] } (markets.json) -> Map(ym -> value)
export function fromMonths(mo) { const out = new Map(); if (!mo?.v) return out; mo.v.forEach((v, i) => { if (Number.isFinite(v)) out.set(addMonths(mo.start, i), v); }); return out; }
// { 'YYYY-MM': value } -> Map
export const fromObject = o => new Map(Object.entries(o || {}).filter(([k, v]) => /^\d{4}-\d\d$/.test(k) && Number.isFinite(+v)).map(([k, v]) => [k, +v]).sort((a, b) => a[0] < b[0] ? -1 : 1));

// change over `step` months: percent, or the plain difference for rates and other percentages (diff: true)
export function transform(map, how = 'yoy', { diff = false } = {}) {
  if (how === 'level') return new Map(map);
  const step = how === 'mom' ? 1 : 12, out = new Map();
  for (const [k, v] of map) { const p = map.get(addMonths(k, -step)); if (p == null) continue; if (diff) out.set(k, v - p); else if (p !== 0) out.set(k, (v - p) / Math.abs(p) * 100); }
  return out;
}

// ---------- statistics ----------
export function pearson(x, y) {
  const n = x.length; if (n < 3) return NaN;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
// ranks (ties share their average rank), for the rank correlation
export function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), out = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) out[idx[k][1]] = r; i = j + 1; }
  return out; }
export const spearman = (x, y) => pearson(ranks(x), ranks(y));
// lag-1 autocorrelation of a sequence (successive values as compared, whatever their spacing)
const auto1 = v => { const r = pearson(v.slice(0, -1), v.slice(1)); return Number.isFinite(r) ? Math.max(0, r) : 0; };
export function lag1(map) { const ks = [...map.keys()].sort(), a = [], b = []; for (let i = 1; i < ks.length; i++) if (addMonths(ks[i - 1], 1) === ks[i]) { a.push(map.get(ks[i - 1])); b.push(map.get(ks[i])); } const r = pearson(a, b); return Number.isFinite(r) ? r : 0; }
// regularized incomplete beta (Numerical Recipes continued fraction), for the Student t distribution
function betacf(a, b, x) {
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function lgamma(z) { const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z); z -= 1; let x = p[0]; for (let i = 1; i < g + 2; i++) x += p[i] / (z + i); const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
export function ibeta(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
// two-sided p-value of a correlation r with df = n − 2
export function pValue(r, n) { const df = n - 2; if (!(df > 0) || !Number.isFinite(r)) return 1; if (Math.abs(r) >= 1) return 0; const t2 = r * r * df / (1 - r * r); return ibeta(df / (df + t2), df / 2, 0.5); }

// ---------- the scan ----------
// pairs of A(t) with B(t − lag): a positive lag means B moves first, by `lag` months
function pairs(A, B, lag) { const x = [], y = [], keys = []; for (const [k, a] of A) { const b = B.get(addMonths(k, -lag)); if (b != null) { x.push(a); y.push(b); keys.push(k); } } return { x, y, keys }; }

// A, B: Map(ym -> value) of raw values. opts: how ('yoy'|'mom'), diffA/diffB (rates: point change), maxLag, minN
export function correlate(A, B, { how = 'yoy', diffA = false, diffB = false, maxLag = 12, minN = 18, tests = null } = {}) {
  const a = transform(A, how, { diff: diffA }), b = transform(B, how, { diff: diffB }), lags = [];
  for (let L = -maxLag; L <= maxLag; L++) { const p = pairs(a, b, L); lags.push({ lag: L, n: p.x.length, r: p.x.length >= minN ? spearman(p.x, p.y) : NaN }); }
  const ok = lags.filter(l => Number.isFinite(l.r)), k = tests || ok.length || 1;
  if (!ok.length) return { lags, n: Math.max(0, ...lags.map(l => l.n)), verdict: 'not enough overlap', strength: 0, sentence: 'The two series overlap for too few months (fewer than ' + minN + ') to say anything.' };
  const best = ok.reduce((m, l) => Math.abs(l.r) > Math.abs(m.r) ? l : m), p = pairs(a, b, best.lag);
  const ra = auto1(p.x), rb = auto1(p.y), neff = Math.max(3, Math.min(best.n, best.n * (1 - ra * rb) / (1 + ra * rb)));
  const pRaw = pValue(best.r, neff), pAdj = Math.min(1, pRaw * k);
  const h = Math.floor(p.x.length / 2), r1 = spearman(p.x.slice(0, h), p.y.slice(0, h)), r2 = spearman(p.x.slice(h), p.y.slice(h));
  const stable = Number.isFinite(r1) && Number.isFinite(r2) && Math.sign(r1) === Math.sign(best.r) && Math.sign(r2) === Math.sign(best.r) && Math.abs(r1) > .2 && Math.abs(r2) > .2;
  const ar = Math.abs(best.r);
  const edge = Math.abs(best.lag) === maxLag;
  let verdict = pAdj < .01 && ar >= .5 && stable ? 'strong' : pAdj < .05 && ar >= .3 ? 'moderate' : pAdj < .1 && ar >= .25 ? 'weak' : 'no reliable relationship';
  if (edge && (verdict === 'strong' || verdict === 'moderate')) verdict = 'weak';
  return { lag: best.lag, edge, r: round(best.r), n: best.n, neff: Math.round(neff), p: pRaw, pAdj, tests: k, stable, halves: [round(r1), round(r2)], verdict,
    strength: verdict === 'strong' ? 3 : verdict === 'moderate' ? 2 : verdict === 'weak' ? 1 : 0, from: p.keys[0], to: p.keys[p.keys.length - 1], lags, how,
    series: { a: [...a], b: [...b] } };
}
const round = v => Number.isFinite(v) ? Math.round(v * 100) / 100 : null;

// plain-language summary of a result. names: { a, b } labels
export function describe(res, names) {
  if (!res || res.verdict === 'not enough overlap') return res?.sentence || '';
  const ch = res.how === 'mom' ? 'month-over-month' : 'year-over-year', dir = res.r > 0 ? 'move together' : 'move in opposite directions';
  const lead = res.lag === 0 ? 'in the same month' : res.lag > 0 ? names.b + ' leading by ' + res.lag + ' month' + (res.lag === 1 ? '' : 's') : names.a + ' leading by ' + -res.lag + ' month' + (res.lag === -1 ? '' : 's');
  const base = 'Comparing ' + ch + ' changes from ' + res.from + ' to ' + res.to + ', the closest fit is ' + lead + ' (r = ' + res.r.toFixed(2) + ', ' + res.n + ' months, about ' + res.neff + ' independent).';
  const edge = res.edge ? ' The best fit sits at the longest lag tried, which is often a sign of a slow shared trend rather than a real lead, so it is rated weak at most.' : '';
  if (res.verdict === 'no reliable relationship') return base + ' After allowing for the ' + res.tests + ' comparisons tried, that is within what chance produces: no reliable relationship.' + edge;
  return base + ' They tend to ' + dir + '; ' + (res.verdict === 'strong' ? 'the link is strong and holds in both halves of the period.' : res.verdict === 'moderate' ? 'the link is moderate' + (res.stable ? ' and holds in both halves.' : ', but it is not steady across the period.') : 'the link is weak.') +
    edge + (res.how === 'mom' ? ' Month-over-month changes include seasonal swings (most local series aren’t seasonally adjusted), so year over year is the safer comparison.' : '') + ' Correlation alone doesn’t show that one causes the other.';
}

// one local series against many: best result per candidate, corrected for every test run (lags × candidates)
export function scan(A, candidates, opts = {}) {
  const per = 2 * (opts.maxLag ?? 12) + 1, total = per * candidates.length;
  const out = candidates.map(c => ({ id: c.id, res: correlate(A, c.map, { ...opts, diffB: !!c.diff, tests: total }) })).filter(x => x.res.r != null);
  out.sort((x, y) => y.res.strength - x.res.strength || Math.abs(y.res.r) - Math.abs(x.res.r));
  return { tests: total, results: out, reliable: out.filter(x => x.res.strength > 0).length };
}
