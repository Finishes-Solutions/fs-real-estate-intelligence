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
  // total spending by characteristic for the demographic groups that exist (LB01 is the candidate for income ranges, LB11 for region)
  show('LB01 total 01-15', await api(Array.from({ length: 15 }, (_, i) => 'CXUTOTALEXPLB01' + ch(i + 1) + 'M')));
  show('LB11 total 01-08', await api(Array.from({ length: 8 }, (_, i) => 'CXUTOTALEXPLB11' + ch(i + 1) + 'M')));
  show('LB04/05/09/10 total 01-06', await api(['04', '05', '09', '10'].flatMap(d => Array.from({ length: 6 }, (_, i) => 'CXUTOTALEXPLB' + d + ch(i + 1) + 'M'))));
  // item codes (all consumer units)
  const items = ['FOODHOME', 'FOODAWAY', 'HOUSING', 'HHFURNSH', 'APPAREL', 'VEHPURCH', 'CARTKNEW', 'HEALTH', 'HEALTHCR', 'ENTRTAIN', 'ENTERTN'];
  show('items LB0101', await api(items.map(i => 'CXU' + i + 'LB0101M')));
} catch (e) { console.log('api | ERROR', e.message, e.cause?.code || ''); }
