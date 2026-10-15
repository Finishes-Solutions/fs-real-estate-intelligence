#!/usr/bin/env bash
# Offline test of build/county-data.mjs: mocked county sources (test/mock-county.mjs), in-memory Supabase.
#   a first night loads every source; a rerun writes nothing; a later night writes only what changed, removes what left
#   and dates the new undated subdivision today; a source that breaks keeps last night's rows and the others carry on.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
# HCAD's Real_acct_owner.zip with a permits.txt like the real one
printf 'acct\tid\tagency_id\tstatus\tdscr\tdor_cd\tpermit_type\tpermit_tp_descr\tproperty_tp\tissue_date\tyr\tsite_num\tsite_pfx\tsite_str\tsite_tp\tsite_sfx\tsite_apt\r\n' > "$T/permits.txt"
d1=$(date -u -d '-40 days' +%m/%d/%Y); d2=$(date -u -d '-400 days' +%m/%d/%Y); d3=$(date -u -d '-1000 days' +%m/%d/%Y)
printf '0010180000001\t1\t061 \tC\tCOMMERCIAL REMODEL\tX1\t3\tAddtns, Remodels, Lease Space\t \t%s\t2026\t750\t \tCONGRESS\tST\t \t \r\n' "$d1" >> "$T/permits.txt"
printf '1234567890123\t9\t040 \tC\tNEW SFR\tA1\t1\tNew Dwelling - permit\t \t%s\t2025\t21\t \tOAK GLEN\tDR\t \t \r\n' "$d2" >> "$T/permits.txt"
printf '1234567890123\t8\t040 \tC\tOLD\tA1\t1\tNew Dwelling - permit\t \t%s\t2023\t21\t \tOAK GLEN\tDR\t \t \r\n' "$d3" >> "$T/permits.txt"
printf '0010020000013\t1\t000 \tC\tFIRELOSS\tX1\t84\tFire Reports\t \t%s\t2026\t98\t \tMAIN\t \tST\t \r\n' "$d1" >> "$T/permits.txt"
(cd "$T" && zip -q acct.zip permits.txt)
echo '{"dev_items":[]}' > "$T/db.json"   # the migration has run
run() { MOCK_DB="$T/db.json" MOCK_LOG="$T/net" DATA_DIR=test/.data/ SUPABASE_URL=http://supa.test SUPABASE_SECRET_KEY=sb_secret_test HCAD_ZIP="$T/acct.zip" COUNTY_MIN_ROWS=1 \
  env "$@" node --import ./test/mock-net.mjs --import ./test/mock-county.mjs --import ./test/mock-supa.mjs build/county-data.mjs > "$T/log" 2>&1 || { cat "$T/log"; exit 1; }; }
run
node -e "
const a=require('assert'), db=JSON.parse(require('fs').readFileSync('$T/db.json')), R=db.dev_items, by=k=>R.filter(r=>r.kind===k);
a.equal(by('permit').length,2,'permits: two building permits in 24 months, the fire report and the old one left out');
a.ok(by('permit').every(r=>r.county==='Harris'&&r.lon<-95&&r.lat>29),'permits placed on their parcels');
a.deepEqual(by('plat').map(r=>r.source).sort(),['austin-subdivisions','coh-plats','coh-plats','fbc-subdivisions','mcad-subdivisions','waller-subdivisions','washington-subdivisions']);
a.ok(!R.some(r=>r.name==='In Brazoria'),'Houston plats outside the seven counties are left out');
a.equal(R.find(r=>r.id==='plat:coh:82210').county,'Montgomery','Houston ETJ plats get their county from the outline');
a.ok(R.filter(r=>/(mcad|waller|austin|washington)-subdivisions/.test(r.source)).every(r=>r.first_seen==='2000-01-01'&&r.day===null),'undated subdivisions on the first night are backdated');
a.equal(R.find(r=>r.source==='coh-plats').first_seen,'today');
a.equal(by('txdot').length,1,'cancelled TxDOT projects are left out'); a.equal(by('txdot')[0].shape_json.type,'LineString');
const w=R.find(r=>r.id==='district:8344284'), h=R.find(r=>r.id==='district:101');
a.equal(w.day,'2025-03-02'); a.equal(w.shape_json.type,'Polygon'); a.equal(h.shape_json.type,'Polygon','outline matched by name when the number differs');
a.equal(h.amount,9000000); a.equal(h.attrs.taxRate,0.95); a.ok(!JSON.stringify(R).includes('JIM'),'no district contacts');
a.equal(by('school').length,1); a.equal(by('school')[0].units,950); a.equal(by('school')[0].county,'Waller');
a.equal(db.county_loads.length,10); a.ok(db.county_loads.every(l=>l.status==='ok'));
console.log('county data first night ok:',R.length,'rows');
"
n=$(wc -l < "$T/net"); run
grep -q '"written":0' "$T/log" || { cat "$T/log"; exit 1; }
! grep -q '"written":[1-9]' "$T/log" || { cat "$T/log"; echo "a rerun should write nothing"; exit 1; }
node -e "a=require('assert'); n=(require('fs').readFileSync('$T/net','utf8').match(/arcweb.hcad.org/g)||[]).length; a.equal(n,1,'permit parcels already placed are not looked up again')"
echo "county data rerun ok"
# a later night: a plat changed status, TxDOT re-estimated, a new Montgomery subdivision, Waller's permits file lost a row
run MOCK_COUNTY_V=2
node -e "
const a=require('assert'), db=JSON.parse(require('fs').readFileSync('$T/db.json')), R=db.dev_items;
a.equal(R.find(r=>r.id==='plat:coh:93620').status,'Approved'); a.equal(R.find(r=>r.id==='txdot:140001033').amount,400000);
const nw=R.find(r=>r.id==='plat:mcad-subdivisions:600001'); a.equal(nw.first_seen,'today','a subdivision that appears later counts as new');
a.equal(R.find(r=>r.id==='plat:mcad-subdivisions:521114').first_seen,'2000-01-01','first_seen is kept on update');
"
grep -q '"source":"coh-plats","rows":2,"written":1' "$T/log" || { cat "$T/log"; exit 1; }
echo "county data changes ok"
# a source that breaks (too few rows) keeps its rows; the other sources still load; a load under half the rows is refused
( run COUNTY_MIN_ROWS=5 ONLY=txdot ) || true; grep -q 'txdot FAILED txdot: only 1 rows parsed' "$T/log" || { cat "$T/log"; exit 1; }
node -e "a=require('assert'),db=JSON.parse(require('fs').readFileSync('$T/db.json'));a.equal(db.dev_items.filter(r=>r.kind==='txdot').length,1,'kept');a.equal(db.county_loads.find(l=>l.source==='txdot').status,'failed')"
printf 'acct\tid\tagency_id\tstatus\tdscr\tdor_cd\tpermit_type\tpermit_tp_descr\tproperty_tp\tissue_date\tyr\tsite_num\tsite_pfx\tsite_str\tsite_tp\tsite_sfx\tsite_apt\r\n' > "$T/permits.txt"
printf '9999999999999\t1\t061 \tC\tNEW\tF1\t5\tNew Building\t \t%s\t2026\t1\t \tMAIN\tST\t \t \r\n' "$d1" >> "$T/permits.txt"
for i in 1 2 3 4; do printf '88888888888%02d\t1\t061 \tC\tNEW\tF1\t5\tNew Building\t \t%s\t2026\t1\t \tMAIN\tST\t \t \r\n' $i "$d1" >> "$T/permits.txt"; done
(cd "$T" && rm acct.zip && zip -q acct.zip permits.txt); run ONLY=permits
node -e "a=require('assert'),db=JSON.parse(require('fs').readFileSync('$T/db.json'));a.equal(db.dev_items.filter(r=>r.kind==='permit').length,5,'a bigger file replaces the old rows')"
(cd "$T" && head -2 permits.txt > p2 && mv p2 permits.txt && rm acct.zip && zip -q acct.zip permits.txt); ( run ONLY=permits ) || true
grep -q 'old rows kept' "$T/log" || { cat "$T/log"; exit 1; }
node -e "a=require('assert'),db=JSON.parse(require('fs').readFileSync('$T/db.json'));a.equal(db.dev_items.filter(r=>r.kind==='permit').length,5,'a load under half is refused: nothing removed')"
echo "county data guards ok"
