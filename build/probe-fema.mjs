// Diagnostic: OpenFEMA NFIP claims (v3) filters by census tract, from a cloud server (Actions). Run "Probe services" with script=fema.
const UA = { 'User-Agent': 'Mozilla/5.0 (FinishesSolutions RE intelligence)' };
const short = (s, n = 1200) => String(s).replace(/\s+/g, ' ').slice(0, n);
async function hit(name, url, show) {
  const t = Date.now();
  try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(50000) }); const txt = await r.text(); let d; try { d = JSON.parse(txt); } catch (e) { d = { _text: txt.slice(0, 300) }; }
    console.log('##', name, '|', r.status, '|', Date.now() - t, 'ms |', r.ok ? show(d) : short(JSON.stringify(d), 400)); return d; } catch (e) { console.log('##', name, '| ERROR', e.message); }
}
const C = 'https://www.fema.gov/api/open/v3/NfipClaims';
const SEL = '$select=yearOfLoss,dateOfLoss,amountPaidOnBuildingClaim,amountPaidOnContentsClaim,amountPaidOnIncreasedCostOfComplianceClaim,occupancyType,ratedFloodZone,floodZoneCurrent,censusGeoid,reportedZipCode,floodEvent,causeOfDamage,buildingDamageAmount,latitude,longitude';
const s = await hit('zip sample geoids', C + '?$top=5&' + SEL + '&$filter=' + encodeURIComponent("reportedZipCode eq '77096'"), d => short(JSON.stringify(d.NfipClaims)));
const g = s?.NfipClaims?.[0]?.censusGeoid; console.log('geoid sample', g, String(g).length);
const tract = String(g || '48201432900').slice(0, 11);
await hit('startswith tract', C + '?$top=3&$inlinecount=allpages&' + SEL + '&$filter=' + encodeURIComponent("startswith(censusGeoid,'" + tract + "')"), d => 'count ' + d.metadata?.count + ' ' + short(JSON.stringify(d.NfipClaims?.[0])));
await hit('eq geoid', C + '?$top=3&$inlinecount=allpages&$select=censusGeoid&$filter=' + encodeURIComponent("censusGeoid eq '" + g + "'"), d => 'count ' + d.metadata?.count);
await hit('in list', C + '?$top=3&$inlinecount=allpages&$select=censusGeoid&$filter=' + encodeURIComponent("censusGeoid in ('" + g + "','48201412901')"), d => 'count ' + d.metadata?.count);
await hit('lat lon box', C + '?$top=3&$inlinecount=allpages&$select=latitude,longitude&$filter=' + encodeURIComponent("latitude ge 29.6 and latitude le 29.8 and longitude ge -95.5 and longitude le -95.3"), d => 'count ' + d.metadata?.count + ' ' + short(JSON.stringify(d.NfipClaims)));
await hit('multiple loss', 'https://www.fema.gov/api/open/v1/NfipMultipleLossProperties?$top=2&$inlinecount=allpages&$filter=' + encodeURIComponent("zipCode eq '77096'"), d => 'count ' + d.metadata?.count + ' ' + short(JSON.stringify(d.NfipMultipleLossProperties?.[0])));
await hit('policies v3 zip count', 'https://www.fema.gov/api/open/v3/NfipPolicies?$top=1&$inlinecount=allpages&$select=censusGeoid,ratedFloodZone&$filter=' + encodeURIComponent("reportedZipCode eq '77096'"), d => 'count ' + d.metadata?.count + ' ' + short(JSON.stringify(d.NfipPolicies?.[0])));
console.log('done');
