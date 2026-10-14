// Reports page and the one friendly error path: filter wording (describe, tidyFilterText), getJSON's error mapping, coverage checks.
import assert from 'node:assert/strict';
import { describe, describeDate, tidyFilterText, periodStart } from '../lib/filter.mjs';
const { getJSON, unavailable, friendly, inTexas, inHouston, nearHouston, middleOf, viewLabel, fileBase } = await import('../src/reportkit.js');

// ---------- filter wording: the chip words, never the raw months ----------
const now = new Date('2026-10-14T12:00:00Z');
assert.equal(periodStart(12, now), '2025-11');
assert.equal(describe({ d: { f: 'reg', from: '2025-11', to: '' } }, undefined, { now }), 'Filed in the last 12 months');
assert.equal(describe({ d: { f: 'reg', from: '2026-08', to: '' } }, undefined, { now }), 'Filed in the last 3 months');
assert.equal(describe({ d: { f: 'reg', from: '2024-11', to: '' } }, undefined, { now }), 'Filed in the last 2 years');
assert.equal(describe({ d: { f: 'reg', from: '2021-11', to: '' } }, undefined, { now }), 'Filed in the last 5 years');
assert.equal(describe({ d: { f: 'reg', from: '2025-09', to: '' } }, undefined, { now }), 'Filed since Sep 2025', 'a start that is no preset');
assert.equal(describe({ d: { f: 'active', from: '2026-07', to: '2027-08' } }, undefined, { now }), 'Under construction Jul 2026 – Aug 2027');
assert.equal(describe({ d: { f: 'active', from: '2028-10', to: '2028-10' } }, undefined, { now }), 'Under construction Oct 2028', 'a single month');
assert.equal(describe({ d: { f: 'start', from: '2027-01', to: '2027-03' } }, undefined, { now }), 'Starting Jan 2027 – Mar 2027');
assert.equal(describe({ d: { f: 'reg', from: '2024-01', to: '2024-03' } }, undefined, { now }), 'Filed Jan 2024 – Mar 2024');
assert.equal(describe({ d: { f: 'all', from: '', to: '' } }, undefined, { now }), '');
assert.equal(describe({ c: ['Harris'], d: { f: 'reg', from: '2025-11', to: '' }, min: 5e6 }, v => '$' + v / 1e6 + 'M', { now }), 'Harris · $5M+ · Filed in the last 12 months');
for (const raw of [{ f: 'reg', from: '2025-11', to: '' }, { f: 'active', from: '2026-07', to: '2027-08' }, { f: 'start', from: '2027-01', to: '' }, { f: 'reg', from: '2020-01', to: '2021-02' }])
  assert.ok(!/\d{4}-\d\d|\bto\b|Active|Registered/.test(describe({ d: raw }, undefined, { now })), 'no raw months or "Active … to": ' + describe({ d: raw }, undefined, { now }));
assert.equal(describeDate(null), '');
// older saved text is put in the same words
assert.equal(tidyFilterText('Harris · Filed since 2025-11 · Active 2026-07 to 2027-08'), 'Harris · Filed since Nov 2025 · Under construction Jul 2026 – Aug 2027');
assert.equal(tidyFilterText('Active 2028-10 to 2028-10'), 'Under construction Oct 2028');
assert.equal(tidyFilterText('Registered 2024-01 to …'), 'Filed since Jan 2024');
assert.equal(tidyFilterText('Filed in the last 12 months · Waller'), 'Filed in the last 12 months · Waller', 'already in chip wording');
assert.equal(tidyFilterText(null), '');

// ---------- getJSON: one friendly sentence for every failure ----------
const reply = (body, { status = 200, type = 'application/json' } = {}) => { globalThis.fetch = async () => new Response(body, { status, headers: type ? { 'content-type': type } : {} }); };
const FRIENDLY = "Flood data isn’t available right now. Try again in a minute.";
const BAD = /Unexpected token|DOCTYPE|HTTP \d|Error \d|Failed to (fetch|execute)|<html|\(50\d\)|\(404\)/i;
async function fails(what, expect, check) { try { await what(); } catch (e) { check?.(e); assert.ok(e instanceof Error); return e; } assert.fail('should have thrown: ' + expect); }

// the API route is missing: an HTML 404 page
reply('<!DOCTYPE html><html><body>404 Not Found</body></html>', { status: 404, type: 'text/html' });
let e = await fails(() => getJSON('api/fema', { what: 'Flood data' }), 'html 404');
assert.equal(e.message, FRIENDLY); assert.equal(e.status, 404); assert.match(e.detail, /DOCTYPE/); assert.equal(e.friendly, true); assert.ok(!BAD.test(e.message));
// an HTML 501 (the sandbox's POST answer)
reply('<html>Unsupported method (POST)</html>', { status: 501, type: 'text/html' });
e = await fails(() => getJSON('api/traffic', { what: 'Flood data', method: 'POST' }), 'html 501'); assert.equal(e.message, FRIENDLY); assert.equal(e.status, 501);
// 200 but a web page (a proxy login, a rewrite to index.html)
reply('<!DOCTYPE html><html></html>', { status: 200, type: 'text/html; charset=utf-8' });
e = await fails(() => getJSON('api/x', { what: 'Flood data' }), 'html 200'); assert.equal(e.message, FRIENDLY); assert.equal(e.status, 200);
// JSON content type but a broken body
reply('{"claims": [', { status: 200 }); e = await fails(() => getJSON('api/x', { what: 'Flood data' }), 'broken json'); assert.equal(e.message, FRIENDLY); assert.ok(!BAD.test(e.message));
// a server error with its own technical text: the text is kept for the console only
reply(JSON.stringify({ error: 'relation "air_cells" does not exist' }), { status: 502 });
e = await fails(() => getJSON('api/x', { what: 'Flood data' }), '502'); assert.equal(e.message, FRIENDLY); assert.match(e.detail, /air_cells/);
// a refusal in words (a 4xx with an { error } sentence) is kept: that is the server explaining
reply(JSON.stringify({ error: 'That area is too large for a crime report (over 1,500 square miles).' }), { status: 400 });
e = await fails(() => getJSON('api/crime', { what: 'Crime data' }), '400'); assert.equal(e.message, 'That area is too large for a crime report (over 1,500 square miles).'); assert.equal(e.status, 400);
reply(JSON.stringify({ error: 'Crime by city and county covers the United States only.' }), { status: 404 });
e = await fails(() => getJSON('api/crimeus', { what: 'FBI crime data' }), 'json 404'); assert.match(e.message, /United States only/);
// a big area that ran out of time, an outline too big to send, too many requests: the specific sentence (lib/http.mjs wording)
{ const { httpMessage } = await import('../lib/http.mjs'), { SPECIFIC } = await import('../src/reportkit.js');
  assert.equal(SPECIFIC.timeout, httpMessage(504)); assert.equal(SPECIFIC.tooBig, httpMessage(413)); assert.equal(SPECIFIC.busy, httpMessage(429));
  reply('An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT\n\niad1::abc', { status: 504, type: 'text/plain' });
  e = await fails(() => getJSON('api/env', { what: 'Environmental data', method: 'POST' }), '504'); assert.equal(e.message, httpMessage(504)); assert.equal(e.status, 504); assert.ok(!BAD.test(e.message));
  reply('FUNCTION_PAYLOAD_TOO_LARGE', { status: 413, type: 'text/plain' });
  e = await fails(() => getJSON('api/crime', { what: 'Crime data', method: 'POST' }), '413'); assert.equal(e.message, httpMessage(413));
  reply('slow down', { status: 429, type: 'text/plain' }); e = await fails(() => getJSON('api/x', { what: 'Flood data' }), '429'); assert.equal(e.message, httpMessage(429));
  // our own database time limit (a 503 whose { error } says it took too long) keeps that sentence; other 5xx text stays hidden
  reply(JSON.stringify({ error: 'The crime database took too long on this area. Try again in a moment (a second run is usually faster).' }), { status: 503 });
  e = await fails(() => getJSON('api/crime', { what: 'Crime data' }), '503 timeout'); assert.match(e.message, /crime database took too long/);
  reply(JSON.stringify({ error: 'Crime data needs the database (SUPABASE_URL and SUPABASE_SECRET_KEY on the server).' }), { status: 503 });
  e = await fails(() => getJSON('api/crime', { what: 'Crime data' }), '503 setup'); assert.equal(e.message, 'Crime data isn’t available right now. Try again in a minute.'); }
// no network at all
globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
e = await fails(() => getJSON('api/x', { what: 'Flood data' }), 'network'); assert.equal(e.message, FRIENDLY); assert.equal(e.status, 0); assert.match(e.detail, /Failed to fetch/);
// an aborted request is not an error to show
globalThis.fetch = async () => { const x = new Error('aborted'); x.name = 'AbortError'; throw x; };
e = await fails(() => getJSON('api/x', { what: 'Flood data' }), 'abort'); assert.equal(e.name, 'AbortError'); assert.ok(!e.friendly);
// the happy path, and the options pass through to fetch
let seen; globalThis.fetch = async (u, o) => { seen = [u, o]; return new Response('{"ok":1}', { status: 200, headers: { 'content-type': 'application/json' } }); };
assert.deepEqual(await getJSON('api/z', { what: 'Z', method: 'POST', body: '{}' }), { ok: 1 }); assert.equal(seen[1].method, 'POST'); assert.equal(seen[1].what, undefined);
// no content-type header at all is read as JSON when it parses
globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => '' }, text: async () => '{"a":2}' }); assert.deepEqual(await getJSON('api/z'), { a: 2 });
reply('{"a":2}', { type: 'text/plain' }); await fails(() => getJSON('api/z', { what: 'Z' }), 'plain text is not json');
assert.equal(unavailable('crime data'), 'Crime data isn’t available right now. Try again in a minute.');
assert.equal(unavailable(), 'This isn’t available right now. Try again in a minute.');
assert.equal(friendly(new TypeError("Cannot read properties of undefined (reading 'x')"), 'Site data'), 'Site data isn’t available right now. Try again in a minute.', 'a code error never reaches the page');
assert.equal(friendly(Object.assign(new Error('Share your location to use this.'), { friendly: true }), 'X'), 'Share your location to use this.');

// ---------- where each report has data ----------
assert.ok(inTexas([-95.37, 29.76]) && inTexas([-101.85, 35.2]) && !inTexas([-98.5, 39.8]) && !inTexas([-90, 30]));
assert.ok(inHouston([-95.37, 29.76]) && !inHouston([-96.8, 32.78]) && !inHouston(null));
assert.ok(nearHouston([-95.37, 29.76]) && nearHouston([-96.35, 30.63]) /* College Station ~ 85 mi */ && !nearHouston([-96.8, 32.78]) && !nearHouston([-98.5, 29.4]) && !nearHouston(null));
assert.deepEqual(middleOf({ type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]] }), [2, 1]);
assert.deepEqual(middleOf({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] }), [3, 3]);
assert.equal(middleOf(null), null);

// ---------- labels and file names ----------
assert.equal(viewLabel({ viewPlace: () => 'Katy' }), 'Map view near Katy');
assert.equal(viewLabel({ viewPlace: () => null }), 'Map view', 'no guessed town');
assert.equal(viewLabel({}), 'Map view');
assert.equal(fileBase('crime', 'Map view near Katy', '2026-10-14'), 'fs-crime-map-view-near-katy-2026-10-14');
assert.equal(fileBase('compare', 'Harris vs Waller', '2026-10-14'), 'fs-compare-harris-vs-waller-2026-10-14');
assert.equal(fileBase('airtraffic', '', '2026-10-14'), 'fs-airtraffic-area-2026-10-14');
console.log('reportsux ok');
