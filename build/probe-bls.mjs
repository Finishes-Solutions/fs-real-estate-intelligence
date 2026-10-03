// Diagnostic: BLS Consumer Expenditure series from a cloud server (Actions). Run "Probe services" with script=bls.
// Findings 2026-10-03: download.bls.gov (flat-file catalog) answers 403 to the runner whatever the User-Agent; the public API works.
// This maps the series codes the build needs without the catalog: income ranges, regions and item codes.
const UA = 'FinishesSolutions-RealEstateIntel/1.0 (+https://github.com/Finishes-Solutions/fs-real-estate-intelligence)';
async function api(ids) {
  const r = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ seriesid: ids, startyear: '2024', endyear: '2024' }), signal: AbortSignal.timeout(30000) });
  const d = await r.json().catch(() => ({}));
  if (d.status !== 'REQUEST_SUCCEEDED') throw new Error(r.status + ' ' + JSON.stringify(d.message).slice(0, 200));
  return Object.fromEntries((d.Results?.series || []).map(s => [s.seriesID, s.data?.[0]?.value ?? '-']));
}
const show = (label, o) => console.log(label.padEnd(26), '|', Object.entries(o).map(([k, v]) => k.replace(/^CXU|M$/g, '') + '=' + v).join('  '));
const ch = n => String(n).padStart(2, '0');
try {
  // run 2: LB01 = income quintiles (02-06), LB11 = region (04 = South); item codes FOODHOME FOODAWAY HOUSING HHFURNSH APPAREL VEHPURCH HEALTH ENTRTAIN.
  // run 3: look for the income-range table (dollar brackets) among the groups that had no char 02, and the quintiles' mean income
  for (const d of ['02', '03', '08', '13', '16']) show('LB' + d + ' total 01-12', await api(Array.from({ length: 12 }, (_, i) => 'CXUTOTALEXPLB' + d + ch(i + 1) + 'M')));
  show('LB01 income 01-06', await api(['INCBEFTX', 'INCAFTTX', 'INCBFTAX'].flatMap(it => Array.from({ length: 6 }, (_, i) => 'CXU' + it + 'LB01' + ch(i + 1) + 'M'))));
} catch (e) { console.log('api | ERROR', e.message, e.cause?.code || ''); }
