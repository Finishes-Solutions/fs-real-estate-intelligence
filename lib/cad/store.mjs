// Reads of the appraisal-roll and tax-rate tables (supabase/migrations/20261112000000_cad_rolls.sql) for the MCP tools
// (lib/mcp/tax.mjs). Two stores with one shape: the platform's Supabase (PostgREST, secret key) and an in-memory one for
// tests and dry runs (rows parsed from real files by build/cad-rolls.mjs DRY=1 OUT_DIR=…). hooks.store swaps one in.
//   bundle(county, account) → { accounts[], units[], taxing_units[], rates[], runs[] }
//   countyUnits(county)      → taxing_units rows of the county
//   rates(keys)              → tax_rates rows for those unit keys (every year and source)
//   comps(f)                 → cad_accounts rows matching { county, tax_year, state_class (prefix), zip, city, bbox, year_built, units, sqft }
//   latestYear(county)       → the newest tax year loaded for the county
//   meta()                   → the last load of each source (cad_meta)

export const hooks = { store: null };
const enc = encodeURIComponent;

export function supaStore(db) {
  return {
    kind: 'supabase',
    bundle: (county, account) => db.rpc('cad_account_bundle', { p_county: county, p_account: account }),
    countyUnits: county => db.select('taxing_units', 'county=eq.' + enc(county) + '&limit=2000'),
    rates: keys => keys.length ? db.select('tax_rates', 'unit_key=in.(' + keys.map(k => '"' + String(k).replace(/"/g, '') + '"').join(',') + ')&limit=5000') : [],
    async comps(f) {
      const q = ['county=eq.' + enc(f.county), 'tax_year=eq.' + f.tax_year, 'market_value=gt.0'];
      if (f.state_class) q.push('state_class=like.' + enc(f.state_class + '*'));
      if (f.zip) q.push('situs_zip=eq.' + enc(f.zip));
      if (f.city) q.push('situs_city=ilike.' + enc(f.city));
      if (f.bbox) { const [w, s, e, n] = f.bbox; q.push('lon=gte.' + w, 'lon=lte.' + e, 'lat=gte.' + s, 'lat=lte.' + n); }
      if (f.year_built?.[0] != null) q.push('year_built=gte.' + f.year_built[0]); if (f.year_built?.[1] != null) q.push('year_built=lte.' + f.year_built[1]);
      if (f.units?.[0] != null) q.push('units=gte.' + f.units[0]); if (f.units?.[1] != null) q.push('units=lte.' + f.units[1]);
      if (f.sqft?.[0] != null) q.push('bldg_sqft=gte.' + f.sqft[0]); if (f.sqft?.[1] != null) q.push('bldg_sqft=lte.' + f.sqft[1]);
      return db.select('cad_accounts', q.join('&') + '&select=county,account_id,tax_year,roll,owner,situs,situs_city,situs_zip,state_class,acreage,land_value,improvement_value,market_value,appraised_value,year_built,bldg_sqft,units,stories,bldg_class,lon,lat&order=market_value.desc&limit=' + (f.limit || 2000));
    },
    async latestYear(county) { const r = await db.select('cad_accounts', 'county=eq.' + enc(county) + '&select=tax_year&order=tax_year.desc&limit=1'); return r?.[0]?.tax_year ?? null; },
    meta: () => db.rpc('cad_meta', {})
  };
}

// the same reads over arrays of rows (tests, dry runs)
export function memoryStore({ accounts = [], units = [], taxingUnits = [], rates = [], runs = [] } = {}) {
  const like = (v, p) => String(v || '').toUpperCase().startsWith(String(p).toUpperCase());
  const keysFor = (county, tu) => [county + ':' + tu.unit_code, ...(tu.comptroller_id ? [tu.comptroller_id] : [])];
  return {
    kind: 'memory',
    async bundle(county, account) {
      const a = accounts.filter(r => r.county === county && r.account_id === account), u = units.filter(r => r.county === county && r.account_id === account);
      const codes = new Set(u.flatMap(r => r.unit_codes)), tu = taxingUnits.filter(r => r.county === county && codes.has(r.unit_code));
      const keys = new Set(tu.flatMap(x => keysFor(county, x))), rr = rates.filter(r => keys.has(r.unit_key));
      const ids = new Set([...a, ...u, ...rr].map(r => r.source_run_id).filter(Boolean));
      return { accounts: a.sort((p, q) => q.tax_year - p.tax_year), units: u.sort((p, q) => q.tax_year - p.tax_year), taxing_units: tu, rates: rr, runs: runs.filter(r => ids.has(r.id)) };
    },
    countyUnits: async county => taxingUnits.filter(r => r.county === county),
    rates: async keys => rates.filter(r => keys.includes(r.unit_key)),
    async comps(f) {
      return accounts.filter(r => r.county === f.county && r.tax_year === f.tax_year && r.market_value > 0 && (!f.state_class || like(r.state_class, f.state_class)) && (!f.zip || r.situs_zip === f.zip)
        && (!f.city || String(r.situs_city || '').toLowerCase() === f.city.toLowerCase()) && (!f.bbox || (r.lon >= f.bbox[0] && r.lon <= f.bbox[2] && r.lat >= f.bbox[1] && r.lat <= f.bbox[3]))
        && (f.year_built?.[0] == null || r.year_built >= f.year_built[0]) && (f.year_built?.[1] == null || r.year_built <= f.year_built[1])
        && (f.units?.[0] == null || r.units >= f.units[0]) && (f.units?.[1] == null || r.units <= f.units[1])
        && (f.sqft?.[0] == null || r.bldg_sqft >= f.sqft[0]) && (f.sqft?.[1] == null || r.bldg_sqft <= f.sqft[1])).sort((a, b) => b.market_value - a.market_value).slice(0, f.limit || 2000);
    },
    latestYear: async county => accounts.filter(r => r.county === county).reduce((m, r) => Math.max(m, r.tax_year), 0) || null,
    meta: async () => Object.fromEntries(runs.filter(r => r.status === 'ok').map(r => [r.source + (r.county ? ':' + r.county : ''), { at: r.finished_at, tax_year: r.tax_year, roll: r.roll, rows: r.rows_written, url: r.url }]))
  };
}
