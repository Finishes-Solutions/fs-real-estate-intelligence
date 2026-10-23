// Offline tests for a tiny / manufactured home community on a flag lot (lib/sitecommunity.mjs, lib/sitestem.mjs, the
// homeKind program in lib/siteplan.mjs and api/siteplan.js), on the real site: 31807 King Ln, Waller (Oct 23), drawn
// from its survey (Precision Surveyors, 9.3879 ac: a 60 ft strip about 250 ft long from Old Washington Rd, then about 9
// acres behind, in feet). The request "I want a tiny home/mobile home community laid out like the reference file has
// showing an RV park" (the reference: an RV park of 134 lots on loops of lanes) came back as self storage with a dozen
// RV / boat stalls, its entry on the neighbour's line instead of up the strip. Now: homes on lanes in loops, lots both
// sides, the entry a drive up the strip from the road.
import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_MODEL = 'gpt-test';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), ST = await import('../lib/sitestem.mjs'), B = await import('../lib/buildings.mjs'), RUN = await import('../lib/planruns.mjs');
const API = await import('../api/siteplan.js');

// ---- the site, from the survey's calls (S 15°39'38" W 250.80', S 05°06'35" W 1176.38', N 88°49'28" W 281.55', the west
// line, S 74°48'59" E 313.19', N 15°39'38" E 250.81', S 72°35'35" E 60.00' on Old Washington Rd), counter-clockwise ----
const raw = [[0, 0], [-67.7, -241.49], [-172.47, -1413.19], [-453.96, -1407.42], [-425.04, -141.52], [-122.78, -223.55], [-55.08, 17.95]];
const ring = raw.map(([x, y]) => [+(x + 240).toFixed(2), +(y + 700).toFixed(2)]).reverse();
const KING = { ring, origin: [-95.9209, 30.0525], front: 6, streets: [], setbacks: { ...S.SETBACKS }, params: {}, elements: [], streetNames: { 6: 'Old Washington Rd' } };
assert.ok(Math.abs(S.ringArea(ring) / 43560 - 9.36) < 0.05, 'the 9.36-acre tract');
const ASK = 'I want a tiny home/mobile home community laid out like the reference file has showing an RV park';

// ---- 1. the strip: the shoulder behind it faces the road but is the neighbour's line, not frontage ----
{ const roles = S.edgeRoles(ring, 6); assert.equal(roles[6], 'front'); assert.equal(roles.filter(r => r === 'front').length, 1, 'only the road is the front: ' + roles);
  assert.deepEqual(S.edgeRoles([[0, 0], [100, 0], [100, 40], [200, 40], [200, 200], [0, 200]], 0).slice(0, 3), ['front', 'side', 'front'], 'a 40 ft jog in the frontage is still front');
  const st = ST.stemOf(KING); assert.ok(st && !st.tooNarrow, 'a flag lot');
  assert.ok(Math.abs(st.len - 251) < 5 && Math.abs(st.wStem - 58) < 4, 'the strip: ' + st.len + ' ft long, ' + st.wStem + ' ft wide');
  assert.ok(st.w >= 24 && st.w <= 28, 'a ' + st.w + ' ft drive up it');
  assert.equal(ST.stemOf({ ...KING, ring: [[0, 0], [400, 0], [400, 600], [0, 600]], front: 0 }), null, 'a plain lot is no flag lot'); }

// ---- 2. the words ----
{ const g = S.guessProgram(ASK); assert.deepEqual([g.use, g.homeKind, g.zones], ['sfr', 'mixed', undefined], 'homes, both kinds, no commons for "park": ' + JSON.stringify(g));
  assert.equal(S.guessProgram('a mobile home park with 60 lots').homeKind, 'manufactured'); assert.equal(S.guessProgram('a mobile home park with 60 lots').units, 60);
  assert.equal(S.guessProgram('tiny home village').homeKind, 'tiny');
  assert.equal(S.guessProgram('self storage with rv and boat storage').use, 'storage', 'storage as before');
  assert.equal(S.guessProgram('50 homes of 1,800 to 2,600 sq ft').homeKind, undefined, 'a subdivision as before');
  const n = S.normalizeProgram(S.guessProgram(ASK)); assert.equal(n.lotD, 80, 'the community’s shallower lots');
  assert.equal(RUN.readAs(n, S.USES)[0], 'Tiny & manufactured home community'); assert.deepEqual(RUN.notUnderstood(ASK, n), []);
  assert.equal(S.useLabel('sfr', n), 'Tiny & manufactured home community'); assert.equal(S.useLabel('sfr', { use: 'sfr' }), 'Single-family homes');
  assert.ok(B.housePlansFor({ kind: 'manufactured' }).every(h => h.family === 'mhome' && h.kind === 'manufactured'));
  assert.ok(B.housePlansFor({ min: 1600, max: 2100, n: 3 }).every(h => h.family === 'house'), 'a subdivision never gets a single-wide'); }

// ---- 3. laid out: lanes in loops, lots both sides, the entry up the strip ----
const box = s => { const xs = s.map(p => p[0]), ys = s.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }, meet = (a, b, g = 2) => a[0] <= b[2] + g && b[0] <= a[2] + g && a[1] <= b[3] + g && b[1] <= a[3] + g;
function sound(o, what, minHomes, kind) {
  const els = o.elements, H = els.filter(e => e.kind === 'building' && e.use === 'sfr'), lots = els.filter(e => e.kind === 'lot'), D = els.filter(e => e.kind === 'drive');
  assert.ok(H.length >= minHomes, what + ': ' + H.length + ' homes'); assert.equal(lots.length, H.length, what + ': a lot for each home');
  assert.ok(H.every(h => B.homePlanById(h.type)?.family === 'mhome' && (kind === 'mixed' || B.homePlanById(h.type).kind === kind)), what + ': the community’s homes');
  const inset = e => { const q = S.shapeOf(e); return S.grow(S.signedArea(q) >= 0 ? q : q.slice().reverse(), -0.6); }, hit = (a, b) => S.rectsOverlap({ poly: inset(a) }, { poly: inset(b) }, 0);
  for (const e of [...lots, ...H]) assert.ok(S.shapeOf(e).every(p => S.inRing(p, ring)), what + ': inside the site');
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) assert.ok(!hit(lots[i], lots[j]), what + ': lots overlap');
  for (const h of H) { assert.equal(lots.filter(l => S.inRing([h.x, h.y], S.shapeOf(l))).length, 1, what + ': a home on one lot'); assert.ok(!D.some(d => hit(h, d)), what + ': a home on a lane'); }
  const main = D.find(d => d.name === 'Main entry'); assert.ok(main?.stem, what + ': the main entry is the strip’s drive');
  assert.ok(S.shapeOf(main).some(p => S.segDist(p, ring[6], ring[0]) < 1), what + ': it meets Old Washington Rd');
  // every lane reached from the entry, every home within reach of one
  const G = D.map(d => ({ d, b: box(S.shapeOf({ ...d, ...(d.poly ? { poly: S.grow(d.poly, 1.5) } : { w: d.w + 3, d: d.d + 3 }) })) })), seen = new Set([main]), st = [G.find(g => g.d === main)];
  while (st.length) { const g = st.pop(); for (const q of G) if (!seen.has(q.d) && meet(g.b, q.b, 0) && S.rectsOverlap({ poly: S.shapeOf(g.d) }, { poly: S.grow(S.shapeOf(q.d), 2) }, 0)) { seen.add(q.d); st.push(q); } }
  assert.equal(seen.size, D.length, what + ': every lane reached (' + seen.size + ' of ' + D.length + ')');
  for (const h of H) assert.ok(D.some(d => S.gapBetween(S.shapeOf(h), S.shapeOf(d)) <= 25), what + ': ' + h.name + ' fronts a lane');
  const ac = S.ringArea(ring) / 43560, need = S.stormNeed(ac, {}, S.normalizeProgram(o.program), ac).area, pond = els.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0);
  assert.ok(pond >= need * 0.9, what + ': detention ' + Math.round(pond) + ' of ' + Math.round(need) + ' sf');
  assert.deepEqual(S.check({ ...KING, elements: els, program: o.program }).filter(i => i.level === 'bad').map(i => i.text), [], what + ': the checks');
  return H.length;
}
const counts = {};
for (const [kind, min] of [['tiny', 80], ['manufactured', 40], ['mixed', 50]]) {
  const t0 = Date.now(), out = L.layoutOptions(KING, { use: 'sfr', homeKind: kind }, { count: 3 }); assert.ok(Date.now() - t0 < 8000, kind + ': in time');
  assert.ok(out.length >= 2, kind + ': options'); counts[kind] = sound(out[0], kind, min, kind);
  assert.ok(/lanes in loops/.test(out[0].name), kind + ': ' + out[0].name); assert.ok(out[0].notes.some(n => /only by its 58 ft strip/.test(n)), kind + ': the strip said');
}
// a count asked: that many
{ const o = L.layoutOptions(KING, { use: 'sfr', homeKind: 'tiny', units: 40 }, { count: 1 })[0]; assert.equal(o.elements.filter(e => e.use === 'sfr').length, 40, '40 homes asked'); assert.ok(o.notes.some(n => /^40 home lots/.test(n))); }
// an ordinary neighbourhood on the flag lot: its entry up the strip too
{ const o = L.layoutOptions(KING, { use: 'sfr' }, { count: 1 })[0], m = o.elements.find(e => e.name === 'Main entry'); assert.ok(m?.stem, 'a subdivision on a flag lot comes in up the strip'); assert.ok(o.elements.some(e => e.use === 'sfr'), 'with homes'); }

// ---- 4. the AI answered self storage with RV stalls (as it did): the words win, homes on lanes ----
let ip = 0; const call = async body => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; await API.default({ method: 'POST', body, headers: { 'x-forwarded-for': '10.78.' + Math.floor(++ip / 200) + '.' + (ip % 200) } }, r); return r; };
const nulls = sc => Object.fromEntries(Object.keys(sc.properties).map(k => [k, null]));
const STORAGE_ANSWER = { ...nulls(API.SCHEMA), use: 'storage', floors: 1, extras: [], zones: [], setbacks: { front: null, side: null, rear: null, paving: null }, storage: { climateSf: 0, driveSf: 0, rv: 23 },
  foodtrucks: { trucks: null, pavilionSf: null, bar: null, barSf: null, playground: null, perTruck: null }, custom: { name: null, pattern: null, buildings: [], outdoor: [], sites: { label: null, w: null, d: null, count: null }, parking: { per: null, rate: null, basis: null, label: null, plus1k: null }, figures: [] },
  summary: 'Self storage with RV and boat stalls.', assumptions: [] };
let sent = [];
globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models')) return Response.json({ id: 'gpt-test', data: [{ id: 'gpt-test' }] }); sent.push(JSON.parse(opts.body)); return Response.json({ choices: [{ message: { content: JSON.stringify(STORAGE_ANSWER) }, finish_reason: 'stop' }], usage: {} }); };
{ const r = await call({ prompt: ASK, site: { acres: 9.36 } }); assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.program.use, r.body.program.homeKind, r.body.program.storage], ['sfr', 'mixed', undefined], 'homes, not storage: ' + JSON.stringify(r.body.program));
  assert.match(sent[0].messages[0].content, /tiny home, manufactured home or mobile home community/, 'the prompt says how');
  assert.ok(API.SCHEMA.required.includes('homeKind') && API.SCHEMA.properties.zones.items.required.includes('homeKind'), 'homeKind in the schema');
  const o = L.layoutOptions(KING, r.body.program, { count: 1 })[0]; assert.ok(o.elements.filter(e => e.use === 'sfr').length >= 50, 'laid out as homes'); assert.ok(!o.elements.some(e => e.use === 'storage')); }

console.log('community ok: tiny ' + counts.tiny + ', manufactured ' + counts.manufactured + ', mixed ' + counts.mixed + ' homes on King Ln');
