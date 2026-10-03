#!/usr/bin/env bash
# Offline test of build/live-sync.mjs: fixture filings + mocked GDELT / NASA / Open-Meteo / NHC, in-memory Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
run() { MOCK_DB="$T/db.json" DATA_DIR=test/.data/ SUPABASE_URL=http://supa.test SUPABASE_SECRET_KEY=sb_secret_test NEWS_GAP_MS=0 NEWS_MAX=40 \
  env "$@" node --import ./test/mock-net.mjs --import ./test/mock-live.mjs --import ./test/mock-supa.mjs build/live-sync.mjs > "$T/log" 2>&1 || { cat "$T/log"; exit 1; }; }
echo '{"news_articles":[]}' > "$T/db.json"   # the migration has run
run; run   # twice: upserts must not duplicate
node -e "
const a=require('assert'), db=JSON.parse(require('fs').readFileSync('$T/db.json')), F=require('./test/.data/filings.json').filings;
a.equal(db.storm_advisories.length,1); a.equal(db.storm_advisories[0].wind_mph,115);
const counties=require('./test/.data/geo.json').counties.length; a.equal(db.weather_daily.length,counties*4,'4 days per county, no duplicates'); a.ok(db.weather_daily.some(r=>r.is_forecast)&&db.weather_daily.some(r=>!r.is_forecast));
a.equal(db.tracts.length,require('./test/.data/market.json').tracts.length); a.ok(db.tracts[0].geom_json.type);
a.ok(db.imagery_passes.length>0); a.ok(db.imagery_passes.every(p=>F.find(f=>f.id===p.filing_id)&&['S30','L30'].includes(p.product)));
a.equal(new Set(db.imagery_passes.map(p=>p.filing_id+p.product+p.day)).size,db.imagery_passes.length,'no duplicate passes');
a.ok(db.news_articles.length>0); a.ok(db.filing_news.every(l=>db.news_articles.some(n=>n.url===l.url)),'links point at stored articles');
const years=new Set(db.crime_incidents.map(r=>r.id.slice(1,5))); a.ok(years.size>=2,'crime: every year in the 25-month window'); a.equal(db.crime_incidents.length,years.size*2,'crime: ungeocoded rows dropped, reruns do not duplicate');
a.ok(db.crime_incidents.every(r=>['v','p','o'].includes(r.cat)&&r.lon<-95&&r.day));
console.log('live-sync ok:', db.storm_advisories.length,'storm,',db.weather_daily.length,'weather rows,',db.tracts.length,'tracts,',db.imagery_passes.length,'passes,',db.news_articles.length,'articles,',db.filing_news.length,'links,',db.crime_incidents.length,'crime rows');
"
# no tables yet -> clear instructions, non-zero exit
rm "$T/db.json"; cat > "$T/m.mjs" <<'M'
const inner = globalThis.fetch; globalThis.fetch = (u, o) => String(u).includes('/rest/v1/news_articles') ? Promise.resolve(new Response(JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }), { status: 404 })) : inner(u, o);
M
if MOCK_DB="$T/db.json" DATA_DIR=test/.data/ SUPABASE_URL=http://supa.test SUPABASE_SECRET_KEY=sb_secret_test node --import ./test/mock-net.mjs --import ./test/mock-supa.mjs --import "$T/m.mjs" build/live-sync.mjs > "$T/log2" 2>&1; then echo "expected failure"; exit 1; fi
grep -q "20261004000000_live_data.sql" "$T/log2" && echo "live-sync missing-table message ok"
