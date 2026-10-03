// Diagnostic: FEMA sources for the flood layer and FEMA reports, from a cloud server (Actions). Run "Probe services" with script=fema.
const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence)' };
const short = (s, n = 900) => String(s).replace(/\s+/g, ' ').slice(0, n);
async function hit(name, url, show = d => short(JSON.stringify(d)), { ms = 40000 } = {}) {
  const t = Date.now();
  try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); const body = await r.json().catch(async () => ({ _text: short(await r.text(), 300) }));
    console.log('##', name, '|', r.status, '|', Date.now() - t, 'ms |', r.ok ? show(body) : short(JSON.stringify(body), 400)); return r.ok ? body : null;
  } catch (e) { console.log('##', name, '| ERROR', e.message, '|', Date.now() - t, 'ms'); }
}
const SEL = '$select=yearOfLoss,dateOfLoss,amountPaidOnBuildingClaim,amountPaidOnContentsClaim,occupancyType,ratedFloodZone,censusTract,reportedZipCode,countyCode';
for (const [v, e] of [['v3', 'NfipRedactedClaims'], ['v3', 'NfipClaims'], ['v3', 'FimaNfipClaims'], ['v4', 'NfipRedactedClaims'], ['v2', 'NfipRedactedClaims']])
  await hit('claims ' + v + '/' + e, 'https://www.fema.gov/api/open/' + v + '/' + e + '?$top=1&$inlinecount=allpages&$filter=' + encodeURIComponent("reportedZipCode eq '77096'"), d => short(JSON.stringify({ count: d.metadata?.count, dep: d.metadata?.DeprecationInformation?.depApiMessage?.slice(0, 80), keys: Object.keys(Object.values(d).find(Array.isArray)?.[0] || {}).join(',') }), 1500));
await hit('openfema datasets list', 'https://www.fema.gov/api/open/v1/DataSets?$select=name,version,title&$filter=' + encodeURIComponent("contains(name,'Nfip')"), d => short(JSON.stringify(d.DataSets?.map(x => x.name + ' v' + x.version + ': ' + x.title)), 2000));
// claims by census tract (Meyerland), paging speed
const t0 = Date.now(); let n = 0, paid = 0;
const tr = await hit('v2 claims by tract', 'https://www.fema.gov/api/open/v2/FimaNfipClaims?$top=10000&$inlinecount=allpages&' + SEL + '&$filter=' + encodeURIComponent("censusTract eq '48201432900' or censusTract eq '48201433000'"), d => { n = d.FimaNfipClaims?.length; paid = d.FimaNfipClaims?.reduce((s, x) => s + (+x.amountPaidOnBuildingClaim || 0) + (+x.amountPaidOnContentsClaim || 0), 0); return 'count ' + d.metadata?.count + ' rows ' + n + ' paid $' + Math.round(paid) + ' sample ' + JSON.stringify(d.FimaNfipClaims?.[0]); });
await hit('v2 claims zip 77096 all', 'https://www.fema.gov/api/open/v2/FimaNfipClaims?$top=10000&$inlinecount=allpages&' + SEL + '&$filter=' + encodeURIComponent("reportedZipCode eq '77096'"), d => 'count ' + d.metadata?.count + ' rows ' + d.FimaNfipClaims?.length + ' bytes ' + JSON.stringify(d).length, { ms: 60000 });
// NRI by point and fields
const NRI = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0';
await hit('nri fields', NRI + '?f=json', d => short((d.fields || []).map(f => f.name + ':' + (f.alias || '')).join(', '), 6000));
await hit('nri at point', NRI + '/query?geometry=-95.457,29.689&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json', d => short(JSON.stringify(d.features?.[0]?.attributes), 4000));
console.log('done');
