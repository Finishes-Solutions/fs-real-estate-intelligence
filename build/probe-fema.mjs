// Diagnostic: FEMA sources for the flood layer and FEMA reports, from a cloud server (Actions). Run "Probe services" with script=fema.
const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence)' };
const short = (s, n = 900) => String(s).replace(/\s+/g, ' ').slice(0, n);
async function hit(name, url, show = d => short(JSON.stringify(d)), { type = 'json', ms = 30000 } = {}) {
  const t = Date.now();
  try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); const ct = r.headers.get('content-type'), cors = r.headers.get('access-control-allow-origin');
    const body = type === 'json' ? await r.json().catch(async () => ({ _text: short(await r.text(), 200) })) : type === 'bin' ? new Uint8Array(await r.arrayBuffer()) : await r.text();
    console.log('##', name, '|', r.status, ct, 'cors=' + cors, '|', Date.now() - t, 'ms |', r.ok ? show(body) : short(JSON.stringify(body), 300)); return r.ok ? body : null;
  } catch (e) { console.log('##', name, '| ERROR', e.message, '|', Date.now() - t, 'ms'); }
}
const NF = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
await hit('nfhl export tile (3857)', NF + '/export?bbox=-10620000,3470000,-10600000,3490000&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&layers=show:28&f=image', d => 'bytes ' + d.length + ' png=' + (d[1] === 80), { type: 'bin' });
await hit('nfhl layer 28 polygon query', NF + '/28/query?geometry=' + encodeURIComponent(JSON.stringify({ rings: [[[-95.40, 29.74], [-95.36, 29.74], [-95.36, 29.77], [-95.40, 29.77], [-95.40, 29.74]]], spatialReference: { wkid: 4326 } })) + '&geometryType=esriGeometryPolygon&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=true&maxAllowableOffset=0.0001&geometryPrecision=5&f=json',
  d => 'features ' + (d.features || []).length + ' zones ' + [...new Set((d.features || []).map(f => f.attributes.FLD_ZONE + '/' + f.attributes.ZONE_SUBTY))].join(', ') + ' bytes ' + JSON.stringify(d).length + (d.error ? JSON.stringify(d.error) : ''));
await hit('nfhl layers list', NF + '?f=json', d => short((d.layers || []).map(l => l.id + ':' + l.name).join(', '), 1500));
const OF = 'https://www.fema.gov/api/open/v2/';
await hit('openfema nfip claims zip 77096', OF + 'FimaNfipClaims?$filter=' + encodeURIComponent("reportedZipCode eq '77096'") + '&$top=2&$inlinecount=allpages&$select=yearOfLoss,dateOfLoss,amountPaidOnBuildingClaim,amountPaidOnContentsClaim,amountPaidOnIncreasedCostOfComplianceClaim,occupancyType,floodZoneCurrent,ratedFloodZone,causeOfDamage,countyCode,reportedZipCode,censusTract,latitude,longitude', d => short(JSON.stringify({ meta: d.metadata, rows: d.FimaNfipClaims }), 1500));
await hit('openfema nfip claims county agg', OF + 'FimaNfipClaims?$filter=' + encodeURIComponent("countyCode eq '48201' and yearOfLoss ge 2015") + '&$apply=' + encodeURIComponent('groupby((yearOfLoss),aggregate(amountPaidOnBuildingClaim with sum as building,$count as n))') + '&$top=50', d => short(JSON.stringify(d), 1500));
await hit('openfema nfip policies zip', OF + 'FimaNfipPolicies?$filter=' + encodeURIComponent("reportedZipCode eq '77096'") + '&$top=1&$inlinecount=allpages&$select=policyEffectiveDate,totalBuildingInsuranceCoverage,totalInsurancePremiumOfThePolicy,ratedFloodZone,occupancyType', d => short(JSON.stringify({ meta: d.metadata, rows: d.FimaNfipPolicies }), 1200), { ms: 60000 });
await hit('openfema declarations harris', OF + 'DisasterDeclarationsSummaries?$filter=' + encodeURIComponent("fipsStateCode eq '48' and fipsCountyCode eq '201'") + '&$orderby=declarationDate desc&$top=3&$inlinecount=allpages&$select=disasterNumber,declarationDate,incidentType,declarationTitle,declarationType,incidentBeginDate,ihProgramDeclared,paProgramDeclared,hmProgramDeclared', d => short(JSON.stringify({ meta: d.metadata, rows: d.DisasterDeclarationsSummaries }), 1500));
await hit('openfema housing assistance', OF + 'HousingAssistanceOwners?$filter=' + encodeURIComponent("zipCode eq '77096'") + '&$top=2', d => short(JSON.stringify(d), 800));
await hit('ago search nri', 'https://www.arcgis.com/sharing/rest/search?f=json&num=8&q=' + encodeURIComponent('National Risk Index Census Tracts FEMA'), d => short((d.results || []).map(r => r.title + ' [' + r.type + '] ' + r.url + ' owner=' + r.owner).join(' || '), 2000));
await hit('nri tracts service', 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0/query?where=TRACTFIPS%3D%2748201410500%27&outFields=*&returnGeometry=false&f=json', d => short(JSON.stringify(d.features?.[0]?.attributes || d), 2500));
await hit('nri csv zip page', 'https://hazards.fema.gov/nri/data-resources', d => short((d.match(/href="[^"]+\.(zip|csv)[^"]*"/gi) || []).slice(0, 10).join(' '), 1500), { type: 'text' });
console.log('done');
