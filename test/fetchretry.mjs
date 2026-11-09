// Offline tests for build/util.mjs fetchRetry (retries, timeouts, Retry-After, final 4xx, sanitized logs), the TABS
// guards in build/tabs.mjs (non-JSON answers, mass detail failures) and build/guard.mjs (shrink safeguards).
import assert from 'node:assert/strict';
import { fetchRetry, HttpError, backoff, retryAfterMs, safeUrl, transientStatus } from '../build/util.mjs';
import { parseSearch, details, DETAIL_RETRY, detailFailureLimit } from '../build/tabs.mjs';
import { shrinkProblems, checkShrink } from '../build/guard.mjs';
import { keyRefused } from '../build/geocode.mjs';

const realFetch = globalThis.fetch, realLog = console.log;
let calls, waits, lines;
const fast = extra => ({ tries: 4, baseDelay: 100, maxDelay: 1000, sleep: async ms => { waits.push(ms); }, ...extra });
// `script` answers each call in turn: a Response, a function returning one, or an Error to throw
function script(...answers) {
  calls = []; waits = []; lines = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; const v = typeof a === 'function' ? await a(url, init) : a; if (v instanceof Error) throw v; return v; };
  console.log = (...a) => lines.push(a.join(' '));
}
const done = () => { console.log = realLog; };
const res = (status, body = '', headers = {}) => new Response(body, { status, headers });
const KEYED = 'https://api.maptiler.com/geocoding/x.json?key=SECRET123&country=us';

try {
  // sanitizing: no query string, no credentials, webhook paths cut
  assert.equal(safeUrl(KEYED), 'https://api.maptiler.com/geocoding/x.json');
  assert.equal(safeUrl('https://hooks.zapier.com/hooks/catch/123/abc/'), 'https://hooks.zapier.com/…');
  assert.equal(safeUrl('https://u:p@x.test/a?b=1'), 'https://x.test/a');
  assert.equal(safeUrl('not a url?key=1'), 'not a url');

  // a transient 503 then success: one retry, a bounded jittered wait, the status in the log and not the key
  script(res(503, 'down'), res(200, 'ok'));
  assert.equal(await (await fetchRetry(KEYED, { label: 'maptiler test' }, fast())).text(), 'ok');
  assert.equal(calls.length, 2); assert.equal(waits.length, 1); assert.ok(waits[0] >= 0 && waits[0] <= 100, 'first wait within base delay: ' + waits[0]);
  assert.ok(lines.some(l => /attempt 1\/4: 503/.test(l) && /\(maptiler test\)/.test(l)), lines.join('\n'));
  assert.ok(lines.every(l => !l.includes('SECRET123')), 'the key never reaches the log');
  assert.ok(calls[0].init.headers['User-Agent'], 'UA header set'); assert.ok(calls[0].init.signal, 'a time limit on every attempt');

  // a 429 is tried again too; a network failure is tried again; the tries are bounded and the error says how many
  script(res(429), res(200, 'k')); await fetchRetry('https://a.test/x', {}, fast()); assert.equal(calls.length, 2);
  script(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
  await assert.rejects(fetchRetry('https://a.test/x?token=T', {}, fast({ tries: 3 })), e => e instanceof HttpError && e.retryable && e.attempts === 3 && e.status === 0 && /^failed https:\/\/a\.test\/x: network failure \(ECONNREFUSED\)$/.test(e.message));
  assert.equal(calls.length, 3); assert.equal(waits.length, 2); assert.ok(lines.every(l => !l.includes('token=T')));
  script(res(503)); await assert.rejects(fetchRetry('https://a.test/x', {}, fast({ tries: 2 })), e => e.status === 503 && e.attempts === 2 && e.message === 'failed https://a.test/x: 503');

  // a permanent 4xx is final on the first answer, with the status and no retry; the old message shape is kept for callers
  for (const st of [400, 401, 403, 404, 410, 422]) {
    script(res(st, 'nope'));
    await assert.rejects(fetchRetry(KEYED, {}, fast()), e => e instanceof HttpError && e.status === st && !e.retryable && e.attempts === 1 && e.message === 'https://api.maptiler.com/geocoding/x.json ' + st);
    assert.equal(calls.length, 1, st + ' asked once'); assert.equal(waits.length, 0);
  }
  script(res(401)); await assert.rejects(fetchRetry(KEYED, {}, fast()), e => keyRefused(e), 'geocode.mjs still recognises a refused MapTiler key');
  script(res(429)); await assert.rejects(fetchRetry(KEYED, {}, fast({ tries: 2 })), e => keyRefused(e), '…and a run of 429s');
  assert.ok(!transientStatus(404) && transientStatus(429) && transientStatus(503) && transientStatus(502) && transientStatus(408));

  // Retry-After: seconds and an HTTP date are honoured instead of the backoff; one longer than the cap ends the retries now
  script(res(503, '', { 'Retry-After': '2' }), res(200)); await fetchRetry('https://a.test/x', {}, fast({ maxDelay: 5000 })); assert.deepEqual(waits, [2000]);
  const soon = new Date(Date.now() + 3000).toUTCString();
  script(res(429, '', { 'Retry-After': soon }), res(200)); await fetchRetry('https://a.test/x', {}, fast({ maxDelay: 5000 })); assert.ok(waits[0] > 1500 && waits[0] <= 3000, 'date honoured: ' + waits[0]);
  script(res(503, 'maintenance', { 'Retry-After': '7200' }), res(200));
  await assert.rejects(fetchRetry('https://www.tdlr.texas.gov/TABS/Search/SearchProjects', { label: 'TABS list' }, fast({ maxDelay: 60000 })), e => e.status === 503 && e.retryAfter === 7200000 && /Retry-After 7200 s/.test(e.message));
  assert.equal(calls.length, 1, 'gave up at once'); assert.equal(waits.length, 0); assert.ok(lines.some(l => /asked to wait 7200 s, over the 60 s cap/.test(l)));
  assert.equal(retryAfterMs('120'), 120000); assert.equal(retryAfterMs(null), null); assert.equal(retryAfterMs('garbage'), null); assert.equal(retryAfterMs(new Date(1000).toUTCString(), 5000), 0);

  // the backoff: exponential, capped, fully jittered
  assert.deepEqual([0, 1, 2, 3, 4].map(i => backoff(i, { baseDelay: 1000, maxDelay: 5000, factor: 2, random: () => 1 })), [1000, 2000, 4000, 5000, 5000]);
  assert.equal(backoff(3, { random: () => 0 }), 0);

  // a timeout: each attempt is cut off and tried again; the error says so
  // (AbortSignal.timeout's timer does not keep the process alive on its own; a real request's socket does, this fake has none)
  const alive = setInterval(() => {}, 1000);
  script((url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))));
  const t0 = Date.now();
  await assert.rejects(fetchRetry('https://slow.test/x', { timeout: 40 }, fast({ tries: 3 })), e => e.status === 0 && e.retryable && e.attempts === 3 && /timed out after 40 ms/.test(e.message));
  assert.equal(calls.length, 3); assert.ok(Date.now() - t0 < 2000); assert.ok(lines.filter(l => /timed out after 40 ms/.test(l)).length === 3); clearInterval(alive);
  // the caller's own abort is not retried and comes back as it was
  const ac = new AbortController();
  script((url, init) => { ac.abort(); return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  await assert.rejects(fetchRetry('https://a.test/x', { signal: ac.signal }, fast()), e => e.name === 'AbortError'); assert.equal(calls.length, 1);
  // the old call shape (a number of tries) still works
  script(res(503), res(200, 'z')); assert.equal(await (await fetchRetry('https://a.test/x', {}, { ...fast(), tries: 2 })).text(), 'z');
  script(res(404)); await assert.rejects(fetchRetry('https://a.test/x', {}, 2), e => e.status === 404);
  done(); console.log('fetchRetry tests passed');

  // TABS: a maintenance page with a 200 is not "no filings"
  script(); done();
  await assert.rejects(parseSearch(new Response('<html><body>Scheduled maintenance</body></html>', { status: 200 }), 'Harris 11/2026'), /other than JSON \(maintenance page\?\)/);
  await assert.rejects(parseSearch(Response.json({ data: 'x' }), 'Harris'), /unexpected shape/);
  assert.deepEqual(await parseSearch(Response.json({ data: [], recordsFiltered: 0 }), 'Grimes'), { data: [], recordsFiltered: 0 });
  // TABS details: a few failed pages are tolerated (and tried again next run), a mass failure stops the run
  Object.assign(DETAIL_RETRY, { tries: 2, baseDelay: 1, maxDelay: 2, sleep: async () => {} });
  const page = n => `<html><dl><dt>Location Address:</dt><dd>${n} Main St</dd><dd>Waller, TX 77484</dd><dt>Owner Name:</dt><dd>Acme</dd></dl></html>`;
  const rows = Array.from({ length: 30 }, (_, i) => ({ ProjectNumber: 'TABS' + i, EstimatedCost: 1000 + i }));
  script(url => /TABS7$/.test(String(url)) ? res(404) : res(200, page(String(url).slice(-1))));
  const cache = {}; const r1 = await details(rows, cache, 4); done();
  assert.deepEqual(r1, { fetched: 29, failed: 1 }); assert.equal(rows[7].street, ''); assert.equal(rows[8].street, '8 Main St'); assert.equal(cache.TABS8.owner, 'Acme'); assert.ok(!cache.TABS7);
  assert.equal(detailFailureLimit(30), 20); assert.equal(detailFailureLimit(100), 50); assert.equal(detailFailureLimit(0), 20);
  script(res(503, 'maintenance'));
  await assert.rejects(details(rows.slice(0, 25), {}, 4), /TABS detail pages: 25 of 25 failed .*not publishing/); done();
  // a page that fails keeps its cached detail
  script(res(503)); const keep = { TABS0: { street: 'Old St', cost: 1 } }; await assert.rejects(details(rows.slice(0, 25), keep, 4)); done(); assert.equal(keep.TABS0.street, 'Old St');
  console.log('TABS guard tests passed');

  // shrink safeguards: the whole list, any one county, an empty answer
  const counties = [{ name: 'Harris' }, { name: 'Fort Bend' }, { name: 'Grimes' }];
  const prev = [...Array(8000).fill({ county: 'Harris' }), ...Array(1300).fill({ county: 'Fort Bend' }), ...Array(25).fill({ county: 'Grimes' }), ...Array(300).fill({ county: 'Waller' })];
  const got = (h, f, g) => [...Array(h).fill({ _county: 'Harris' }), ...Array(f).fill({ _county: 'Fort Bend' }), ...Array(g).fill({ _county: 'Grimes' })];
  assert.deepEqual(shrinkProblems(prev, got(8100, 1310, 30), counties), [], 'a normal night');
  assert.deepEqual(shrinkProblems(prev, got(8100, 0, 30), counties), ['Fort Bend: 0 filings vs 1300 last run'], 'one county collapsing is caught though the total is fine');
  assert.deepEqual(shrinkProblems(prev, got(8100, 1310, 0), counties), [], 'a small county has no history to judge by');
  assert.deepEqual(shrinkProblems(prev, got(3000, 1310, 30), counties), ['TABS returned 4340 filings vs 9325 last run', 'Harris: 3000 filings vs 8000 last run']);
  assert.deepEqual(shrinkProblems(prev, [], counties), ['TABS returned 0 filings vs 9325 last run']);
  assert.deepEqual(shrinkProblems([], [], counties), [], 'the first run ever');
  assert.deepEqual(shrinkProblems(prev, [], [{ name: 'Austin' }]), [], 'a county with no previous filings may be empty');
  assert.throws(() => checkShrink(prev, got(8100, 0, 30), counties, {}), /refusing to overwrite the last good filings: Fort Bend: 0 filings vs 1300 last run \(set ALLOW_SHRINK=1 to force\)/);
  assert.deepEqual(checkShrink(prev, got(8100, 0, 30), counties, { ALLOW_SHRINK: '1' }), ['Fort Bend: 0 filings vs 1300 last run']);
  console.log('shrink guard tests passed');
} finally { globalThis.fetch = realFetch; console.log = realLog; }
