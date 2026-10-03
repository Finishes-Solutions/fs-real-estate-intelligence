// Diagnostic: run the FEMA report (api/fema.js) against the live FEMA services from a cloud server (Actions). Run "Probe services" with script=fema.
import { femaReport } from '../api/fema.js';
import { circle } from '../api/crime.js';
for (const [name, g] of [['Meyerland 1/4 mi', circle(-95.457, 29.689, 0.25)], ['Katy 1/2 mi', circle(-95.8244, 29.7858, 0.5)], ['Kingwood box', { type: 'Polygon', coordinates: [[[-95.22, 30.03], [-95.17, 30.03], [-95.17, 30.07], [-95.22, 30.07], [-95.22, 30.03]]] }]]) {
  const t = Date.now();
  try { const d = await femaReport(g, { label: name }); const c = d.nfip_claims;
    console.log('##', name, Date.now() - t + 'ms', JSON.stringify({ sqmi: d.area_sqmi, zones: d.flood_zones, claims: c.error || { n: c.claims, paid: c.paid, tracts: c.tracts_searched, events: c.top_events?.slice(0, 3) }, disasters: d.disasters.error || { n: d.disasters.count, major: d.disasters.major, first: d.disasters.list?.[0] }, nri: d.risk_index?.error || { rating: d.risk_index?.risk_rating, eal: d.risk_index?.expected_annual_loss, top: d.risk_index?.hazards?.slice(0, 3) } }).slice(0, 2000)); }
  catch (e) { console.log('##', name, 'ERROR', e.message); }
}
console.log('done');
