#!/usr/bin/env bash
# Offline end-to-end test of `node build.mjs`: two runs against mocked services. The second run must hit the caches.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/data"; cp data/regions.json "$T/data/"; node test/fixture.mjs >/dev/null
node -e "const fs=require('fs');const g=JSON.parse(fs.readFileSync('test/.data/geo.json'));const {createHash}=require('crypto');g._regions=createHash('sha1').update(JSON.stringify(JSON.parse(fs.readFileSync('data/regions.json')))+'2').digest('hex').slice(0,12);fs.writeFileSync('$T/data/geo.json',JSON.stringify(g))"
run() { MOCK_LOG="$T/calls$1.log" DATA_DIR="$T/data/" OPENAI_API_KEY=sk-test ONLY=Waller,Austin PERIOD_START=2026-06-01 PERIOD_END=2026-08-31 ${2:-} node --import ./test/mock-net.mjs build.mjs > "$T/out$1.log" 2>&1 || { cat "$T/out$1.log"; exit 1; }; }
run 1; run 2 "env BUMP=1"
n() { grep -c "$2" "$T/calls$1.log" || true; }
echo "run1: details $(n 1 'TABS\*') census $(n 1 census.gov/geocoder) openai $(n 1 chat/completions)"
echo "run2: details $(n 2 'TABS\*') census $(n 2 census.gov/geocoder) openai $(n 2 chat/completions)"
node -e "
const fs=require('fs'), d=JSON.parse(fs.readFileSync('$T/data/filings.json')), ch=JSON.parse(fs.readFileSync('$T/data/changes.json')), m=JSON.parse(fs.readFileSync('$T/data/market.json'));
const a=require('assert');
a.ok(d.filings.length>=15&&d.filings.length+d.unmapped===18,'18 filings, implausible geocodes dropped'); a.ok(d.filings.every(f=>f.use==='Medical'&&f.dev==='Acme Holdings'),'enriched');
const f0=d.filings.find(f=>f.id.endsWith('0')), f2=d.filings.find(f=>f.id.endsWith('2'));
a.ok(!f0.tsE&&!f0.teE,'filed dates kept'); a.ok(f2.tsE&&f2.teE&&f2.te>f2.ts,'inferred dates flagged');
a.ok(d.filings.some(f=>f.arch==='PGAL'),'design firm captured'); a.ok(d.filings.every(f=>f.owner==='Acme Holdings, L.L.C.'),'owner');
a.equal(ch.runs.length,2); a.equal(ch.runs[1].items.length,0,'first run has no diff'); a.equal(ch.runs[0].items.filter(x=>x.k==='cost').length,d.filings.filter(f=>f.id.endsWith('0')).length,'cost bumps detected');
a.ok(d.filings.some(f=>f.gp==='txaddr'),'address points used');
a.ok(m.tracts.length>=1&&m.year,'market built');
console.log('pipeline ok:',d.filings.length,'filings,',ch.runs[0].items.length,'changes, market',m.year,'vs',m.baseYear);
"
grep -E "geocode:|enrich:|tabs details" "$T/out2.log"
