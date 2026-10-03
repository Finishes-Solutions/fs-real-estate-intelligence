// Diagnostic: can a cloud server (Actions) reach the BLS Consumer Expenditure data? Run "Probe services" with script=bls.
// The Refresh data run got 403 from download.bls.gov (cx.item); this checks which request shapes BLS accepts from the runner.
const FILE = 'https://download.bls.gov/pub/time.series/cx/cx.item';
const UAS = [
  ['current', 'FinishesSolutions-RealEstateIntel/1.0 (+https://github.com/Finishes-Solutions/fs-real-estate-intelligence)'],
  ['with email', 'FinishesSolutions-RealEstateIntel/1.0 (contact: data@example.com)'],
  ['browser', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'],
  ['none', '']
];
for (const [name, ua] of UAS) {
  const t = Date.now();
  try {
    const r = await fetch(FILE, { headers: ua ? { 'User-Agent': ua, Accept: 'text/plain' } : {}, signal: AbortSignal.timeout(30000) });
    const body = await r.text();
    console.log('flat file |', name.padEnd(10), '|', r.status, '|', body.length, 'bytes |', Date.now() - t, 'ms |', body.slice(0, 80).replace(/\s+/g, ' '));
  } catch (e) { console.log('flat file |', name.padEnd(10), '| ERROR', e.message, e.cause?.code || ''); }
}
// the public API: one known series (mean total spending, all consumer units), then which demographic groups exist
async function api(ids) {
  const r = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UAS[0][1] },
    body: JSON.stringify({ seriesid: ids, startyear: '2023', endyear: '2024' }), signal: AbortSignal.timeout(30000) });
  return { status: r.status, d: await r.json().catch(() => ({})) };
}
try {
  const { status, d } = await api(['CXUTOTALEXPLB0101M']);
  console.log('api | known series |', status, '|', d.status, '|', JSON.stringify(d.Results?.series?.[0]?.data?.slice(0, 2) || d.message).slice(0, 200));
  // demographic groups LB01..LB16, characteristic 02, total spending: which ones return values
  const ids = Array.from({ length: 16 }, (_, i) => 'CXUTOTALEXPLB' + String(i + 1).padStart(2, '0') + '02M');
  const { d: g } = await api(ids);
  for (const s of g.Results?.series || []) console.log('api |', s.seriesID, '|', s.data?.length ? s.data[0].year + ' $' + s.data[0].value : 'no data');
  console.log('api | messages |', JSON.stringify(g.message || []).slice(0, 300));
} catch (e) { console.log('api | ERROR', e.message, e.cause?.code || ''); }
