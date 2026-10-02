// NASA HLS (Harmonized Landsat Sentinel-2, 30 m) passes over a box, from the CMR granule catalog. Keyless, CORS-enabled,
// so the browser (src/live.js) and the nightly sync (build/live-sync.mjs) share it.
export const NASA = { S30: ['HLS_S30_Nadir_BRDF_Adjusted_Reflectance', 'C2021957295-LPCLOUD', 'Sentinel-2'], L30: ['HLS_L30_Nadir_BRDF_Adjusted_Reflectance', 'C2021957657-LPCLOUD', 'Landsat 8/9'] };

// -> [{ product, name, day, cloud }] newest first, one per product and day. cloud is the worst granule that day (% of a ~110 km scene).
export async function hlsPasses([w, s, e, n], days = 60, fetchImpl = globalThis.fetch) {
  const end = new Date(), start = new Date(Date.now() - days * 864e5), out = [];
  await Promise.all(Object.entries(NASA).map(async ([p, [, coll, name]]) => {
    const u = 'https://cmr.earthdata.nasa.gov/search/granules.umm_json?collection_concept_id=' + coll + '&bounding_box=' + [w, s, e, n].map(v => v.toFixed(4)).join(',') + '&temporal=' + start.toISOString() + ',' + end.toISOString() + '&sort_key=-start_date&page_size=100';
    const r = await fetchImpl(u); if (!r.ok) throw new Error('NASA CMR ' + r.status);
    for (const it of (await r.json()).items || []) {
      const t = it.umm?.TemporalExtent?.RangeDateTime?.BeginningDateTime; if (!t) continue;
      const cc = (it.umm.AdditionalAttributes || []).find(a => a.Name === 'CLOUD_COVERAGE')?.Values?.[0];
      out.push({ product: p, name, day: t.slice(0, 10), cloud: cc == null ? null : +cc });
    }
  }));
  const by = new Map(); for (const g of out) { const k = g.product + g.day, o = by.get(k); if (!o || (g.cloud ?? 100) > (o.cloud ?? 100)) by.set(k, g); }
  return [...by.values()].sort((a, b) => b.day.localeCompare(a.day) || (a.cloud ?? 100) - (b.cloud ?? 100));
}
