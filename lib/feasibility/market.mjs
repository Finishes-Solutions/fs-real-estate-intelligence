// The market facts a feasibility study reads from the platform's own nightly data: interest rates (FRED, in
// data/area.json), construction-cost price indexes (BLS PPI via FRED, in data/markets.json) and ZIP-level rents
// (Zillow ZORI, in data/area.json). Pure: callers hand in the parsed JSON (the browser fetches /data/*.json, the API and
// scripts read data/), so a study made offline or in a test uses exactly the numbers it was given. Every fact carries
// its source and date; a missing file or series is null, never a guess.

const fx = v => Number.isFinite(+v) ? +v : null;

// area: data/area.json, markets: data/markets.json (either may be null)
export function marketContext({ area = null, markets = null } = {}) {
  const R = area?.rates?.series || {}, rate = k => R[k] && fx(R[k].value) != null ? { value: +R[k].value, date: R[k].date, label: R[k].label, source: 'FRED (data/area.json rates)' } : null;
  const ppiS = markets?.series?.wpusi012011 || null;
  const ppi = ppiS ? { id: 'WPUSI012011', label: 'PPI: construction materials (BLS, via FRED)', latest: { date: ppiS.date, value: +ppiS.value }, months: monthsOf(ppiS) } : null;
  return {
    built: area?.rates?.built || markets?.built || null,
    rates: { sofr: rate('sofr'), t10: rate('t10'), t5: rate('t5'), m30: rate('m30') },
    ppi,
    zori: area?.rents?.zips ? { latest: area.rents.latest, zips: area.rents.zips, source: 'Zillow Observed Rent Index (ZORI), all homes, smoothed (data/area.json rents)' } : null
  };
}
// a series' monthly points as { 'YYYY-MM': value }, from its long history (months) and its recent window
function monthsOf(s) {
  const out = {};
  const add = (t, v) => (t || []).forEach((d, i) => { if (fx(v[i]) != null) out[String(d).slice(0, 7)] = +v[i]; });
  if (s.months?.start && Array.isArray(s.months.v)) { // { start: 'YYYY-MM', v: [one a month] }
    let [y, m] = s.months.start.split('-').map(Number);
    for (const v of s.months.v) { if (fx(v) != null) out[y + '-' + String(m).padStart(2, '0')] = +v; if (++m > 12) { m = 1; y++; } }
  }
  if (s.recent?.t) add(s.recent.t, s.recent.v);
  return out;
}
// the index value for a month ('YYYY-MM'), or the nearest month before it that has one
export function indexAt(ppi, month) {
  if (!ppi?.months) return null;
  const ks = Object.keys(ppi.months).filter(k => k <= month).sort(); const k = ks[ks.length - 1];
  return k ? { month: k, value: ppi.months[k] } : null;
}
// the ZIP's typical rent (ZORI) with its month, or null
export function zoriFor(ctx, zip) {
  const z = zip && ctx?.zori?.zips?.[String(zip).slice(0, 5)];
  return z ? { zip: String(zip).slice(0, 5), rent: z.rent, yoy: z.yoy, month: z.month, city: z.city, metro: z.metro, source: ctx.zori.source } : null;
}
