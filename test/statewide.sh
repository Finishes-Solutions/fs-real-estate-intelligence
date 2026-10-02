#!/usr/bin/env bash
# Offline test of build/backfill.mjs against mocked TDLR / Census / OpenAI and an in-memory Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/data/cache"
echo '{"TABS_seed":{"street":"1 A St","cityLine":"Waller, TX 77484","owner":"x","scope":"","sqft":"","design":"","tenant":"","facility":"","cost":5,"at":"2026-01-01"}}' > "$T/data/cache/tabs.json"
run() { MOCK_LOG="$T/calls$1.log" MOCK_DB="$T/db.json" DATA_DIR="$T/data/" SUPABASE_URL=http://supa.test SUPABASE_SECRET_KEY=sb_secret_test OPENAI_API_KEY=sk-test GITHUB_OUTPUT="$T/out$1" \
  env "${@:2}" node --import ./test/mock-net.mjs --import ./test/mock-supa.mjs build/backfill.mjs > "$T/log$1" 2>&1 || { cat "$T/log$1"; exit 1; }; }
run 1 COUNTIES=Waller,Dallas PERIOD_START=2025-01-01 MODE=backfill; cp "$T/db.json" "$T/db1.json"
run 2 COUNTIES=Waller MODE=recent RECENT_MONTHS=3 BUMP=1
run 3 MODE=backfill PERIOD_START=2026-06-01 MAX_COUNTIES=2
n() { grep -c "$2" "$T/calls$1.log" || true; }
echo "run1: details $(n 1 'TABS\*') openai $(n 1 chat/completions) | run2: details $(n 2 'TABS\*') openai $(n 2 chat/completions)"
[ -n "${DEBUG:-}" ] && cat "$T/log1" "$T/log3"
node -e "
const a=require('assert'), fs=require('fs'), db=JSON.parse(fs.readFileSync('$T/db.json')), out=k=>fs.readFileSync('$T/out'+k,'utf8');
const db1=JSON.parse(fs.readFileSync('$T/db1.json')), c=n=>db.counties.find(x=>x.name===n), c1=n=>db1.counties.find(x=>x.name===n);
a.equal(db.counties.length,254,'254 counties seeded'); a.equal(c('Waller').status,'done'); a.equal(c('Waller').filings,66);
a.equal(c1('Dallas').status,'error','wrong-county guard'); a.match(c1('Dallas').error,/county id/);
a.ok(db.filings.filter(f=>f.fips==='48473').every(f=>f.use==='Medical'&&f.lat&&f.scope),'enriched + geocoded rows');
a.ok(!db1.filings.some(f=>f.fips==='48113'),'guarded county not stored');
a.ok(db.tabs_cache.some(r=>r.k==='TABS_seed'),'git caches imported');
const ch=db.changes||[]; a.equal(ch.filter(x=>x.kind==='cost').length,3,'nightly cost changes recorded'); a.equal(ch.filter(x=>x.kind==='new').length,0);
a.equal(out(1).trim(),'remaining=0'); a.match(out(3),/remaining=25[01]/,'backfill reports remaining counties');
a.equal(db.runs.length,3); a.ok(db.runs[0].tokens_in>0,'tokens logged');
console.log('statewide ok:', db.filings.length, 'filings,', ch.length, 'changes,', out(3).trim());
"
grep -E "AI tokens|done in|FAILED" "$T/log1" | head -4
