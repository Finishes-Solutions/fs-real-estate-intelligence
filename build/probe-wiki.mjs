// Diagnostic: the start of Wikipedia's "Airlines and destinations" wikitext for a few airports (parser check).
// Run "Probe services" with script=wiki.
for (const page of ['William_P._Hobby_Airport', 'Dallas_Fort_Worth_International_Airport', 'Austin–Bergstrom_International_Airport', 'Sugar_Land_Regional_Airport', 'Heathrow_Airport']) {
  const api = 'https://en.wikipedia.org/w/api.php?format=json&action=parse&page=' + encodeURIComponent(page);
  const secs = (await (await fetch(api + '&prop=sections', { headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0 (probe)' } })).json()).parse?.sections || [];
  console.log('\n== ' + page + ': ' + secs.map(s => s.index + ':' + s.line).join(' | '));
  const sec = secs.find(s => /^Passenger/i.test(s.line)) || secs.find(s => /Airlines and destinations/i.test(s.line));
  if (!sec) continue;
  const w = (await (await fetch(api + '&prop=wikitext&section=' + sec.index, { headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0 (probe)' } })).json()).parse.wikitext['*'];
  console.log(w.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').slice(0, 900));
}
