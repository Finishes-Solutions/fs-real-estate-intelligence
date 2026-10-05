#!/usr/bin/env bash
# Offline test of build/crime-library.mjs: a fake FBI (test/mock-fbi.mjs) and the in-memory Supabase (test/mock-supa.mjs).
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
run() { : > "$T/calls"; MOCK_DB="$T/db.json" MOCK_LOG="$T/calls" SUPABASE_URL=http://supa.test SUPABASE_SECRET_KEY=sb_secret_test STATES=TX,LA \
  env "$@" node --import ./test/mock-fbi.mjs --import ./test/mock-supa.mjs build/crime-library.mjs > "$T/log" 2>&1 || { cat "$T/log"; exit 1; }; }
echo '{"crime_agencies":[]}' > "$T/db.json"   # the migration has run
run
node -e "
const a=require('assert'), db=JSON.parse(require('fs').readFileSync('$T/db.json')), calls=require('fs').readFileSync('$T/calls','utf8').trim().split('\n');
a.equal(db.crime_agencies.length,6,'every agency type is listed'); a.equal(db.crime_agencies.find(x=>x.ori==='TX2370900').loaded_at,undefined,'campus police are not read');
a.ok(db.crime_agencies.find(x=>x.ori==='TX2370100').loaded_at); a.equal(db.crime_agencies.find(x=>x.ori==='TX2370100').data_through,'09/2026');
a.ok(!db.crime_agencies.find(x=>x.ori==='TX2370700').loaded_at,'a failed department stays due');
a.ok(db.crime_agencies.find(x=>x.ori==='TX2379999').loaded_at,'a department with nothing reported is marked read');
const y=db.crime_agency_years; a.ok(!y.some(r=>r.ori==='TX2379999')); a.equal(y.filter(r=>r.ori==='TX2370100').length,2);
const b=y.find(r=>r.ori==='TX2370100'&&r.year===2025); a.equal(b.v,48); a.equal(b.v_months,12); a.equal(b.pop,6000); a.equal(b.larceny,48); a.equal(b.v_cleared,12);
a.deepEqual(y.filter(r=>r.ori==='LANPD0000').map(r=>r.year),[2024],'a year with nothing reported is left out');
const ar=db.crime_area_years; a.equal(ar.find(r=>r.area==='TX'&&r.year===2025).v_rate,360); a.equal(ar.find(r=>r.area==='LA'&&r.year===2025).p_rate,360); a.equal(ar.filter(r=>r.area==='US').length,2,'US rates once per year');
a.equal(calls.filter(c=>c.includes('/summarized/')).length,5*10,'ten calls per city or county department (Hempstead\'s all fail)');
"
run   # again: everything fresh, only the failed one is retried
node -e "const a=require('assert'), calls=require('fs').readFileSync('$T/calls','utf8').trim().split('\n'); a.equal(calls.filter(c=>c.includes('/summarized/')).length,10,'only the failed department is asked again');"
run REFRESH_DAYS=0
node -e "
const a=require('assert'), db=JSON.parse(require('fs').readFileSync('$T/db.json')), calls=require('fs').readFileSync('$T/calls','utf8').trim().split('\n');
a.equal(calls.filter(c=>c.includes('/summarized/')).length,50,'refresh_days=0 rereads every city and county department');
a.equal(new Set(db.crime_agency_years.map(r=>r.ori+r.year)).size,db.crime_agency_years.length,'no duplicate years'); a.equal(db.crime_agencies.length,6,'no duplicate agencies');
console.log('crime library ok:',db.crime_agencies.length,'agencies,',db.crime_agency_years.length,'department-years,',db.crime_area_years.length,'area-years');
"
