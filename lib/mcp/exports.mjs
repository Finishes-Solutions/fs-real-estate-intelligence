// MCP report files the website makes from the filters (Export › New report: Summary, Filing list, Area comparison,
// Activity report; src/export.js) and the Traffic report PDF (src/traffic.js), made here on the server from the same
// data the website's tools read (TDLR filings through lib/mcp/area.mjs queryFilings, TxDOT counts and TomTom through
// api/traffic.js trafficReport), laid out with the same report kit (src/reportkit.js) and printed by the same Chromium
// (lib/pdf.mjs). Each comes back as a PDF resource, and CSV when asked (the website's Excel is CSV here).
import { resolve, whereLine, areaOf, areaLabel, UserError } from './resolve.mjs';
import { queryFilings, filingFilters, tabsLink } from './area.mjs';
import { pdfThatFits, reportResult, csvText, TooBig } from './reports.mjs';
import { inTexas, today } from './site.mjs';
import { COVER } from './datasets.mjs';
import { doc, kv, n0, usdM, clip, notCovered } from './text.mjs';
import { entityKey } from '../taxonomy.mjs';
import { trafficReport } from '../../api/traffic.js';

export const FILING_REPORTS = { summary: 'Summary report', filing_list: 'Filing list', activity: 'Activity report', area_comparison: 'Area comparison' };
const TYPE_LABEL = { New: 'New', Reno: 'Renovation', Addition: 'Addition', Other: 'Other' };
const SOURCES = 'Texas Department of Licensing and Regulation (TDLR), TABS project registrations. Costs and dates are the filers’ estimates; uses, tenants and developers are AI-tagged from the filings.';
const sum = (l, k) => l.reduce((t, r) => t + (+r[k] || 0), 0);
const money = v => '$' + Math.round(+v || 0).toLocaleString('en-US');
const devOf = r => r.developer || r.dev || r.owner;
// the headline tiles (src/metrics.js DEFAULT_KPIS, worked out the same way)
function kpis(l) {
  const t = today();
  return [['Filings', n0(l.length)], ['Est. value', usdM(sum(l, 'cost'))], ['New builds', n0(l.filter(r => r.type === 'New').length)], ['Housing units', sum(l, 'units') ? n0(sum(l, 'units')) : '–'],
    ['Sq ft filed', sum(l, 'sqft') ? n0(sum(l, 'sqft')) : '–'], ['Under construction', n0(l.filter(r => r.ts && r.te && r.ts <= t && r.te >= t).length)], ['$5M+ projects', n0(l.filter(r => r.cost >= 5e6).length)], ['Developers', n0(new Set(l.map(r => entityKey(devOf(r))).filter(Boolean)).size)]];
}
// one breakdown table: filings, value, share and new builds by a key
function breakdown(K, l, key, label, n = 14) {
  const m = new Map(), tot = sum(l, 'cost') || 1;
  for (const r of l) { const k = key(r) || 'Unclassified', g = m.get(k) || [k, 0, 0, 0]; g[1]++; g[2] += +r.cost || 0; if (r.type === 'New') g[3]++; m.set(k, g); }
  return K.table(['Name', { t: 'Filings', r: 1 }, { t: 'Est. value', r: 1 }, { t: 'Share', r: 1 }, { t: 'New', r: 1 }].map((h, i) => i ? h : label), [...m.values()].sort((a, b) => b[2] - a[2]).slice(0, n).map(g => [K.esc(g[0]), n0(g[1]), usdM(g[2]), Math.round(g[2] / tot * 100) + '%', n0(g[3])]));
}
const project = (K, r) => '<a href="' + tabsLink(r.id) + '">' + K.esc(r.name || r.id) + '</a>';
function listTable(K, l, wide) {
  if (wide) return K.table(['#', 'Registered', 'Project', 'County', 'Type / use', { t: 'Est. value', r: 1 }, { t: 'Sq ft', r: 1 }, 'Owner / developer', 'Status', 'Schedule'], l.map((r, i) => [String(i + 1), K.esc(r.reg || ''),
    project(K, r) + '<div class="sc">' + K.esc(r.addr || r.city || '') + '</div>', K.esc(r.county || ''), K.esc(TYPE_LABEL[r.type] || r.type || '') + (r.use ? '<div class="sc">' + K.esc(r.use) + '</div>' : ''), money(r.cost), r.sqft ? n0(r.sqft) : '–',
    K.esc(r.owner || '–') + (devOf(r) && devOf(r) !== r.owner ? '<div class="sc">' + K.esc(devOf(r)) + '</div>' : ''), K.esc(r.status || '–'), K.esc((r.ts || '?') + ' → ' + (r.te || '?'))]));
  return K.table(['#', 'Project', { t: 'Est. value', r: 1 }, 'Owner / developer'], l.map((r, i) => [String(i + 1), project(K, r) + '<div class="sc">' + K.esc([r.city, r.county ? r.county + ' County' : '', TYPE_LABEL[r.type] + (r.use ? ' · ' + r.use : '')].filter(Boolean).join(' · ')) + '</div>', money(r.cost), K.esc(devOf(r) || '–')]));
}
// the Activity report: the most active developers and owners, architects and general contractors, names merged
export function activity(l) {
  return [['Developers & owners', devOf], ['Architects & designers', r => r.architect || r.arch], ['General contractors', r => r.gc]].map(([label, get]) => {
    const m = new Map();
    for (const r of l) { const raw = get(r), key = entityKey(raw); if (!key) continue; let g = m.get(key); if (!g) m.set(key, g = { names: {}, n: 0, v: 0, nw: 0, uses: {}, cos: {}, last: '' });
      g.names[raw] = (g.names[raw] || 0) + 1; g.n++; g.v += +r.cost || 0; if (r.type === 'New') g.nw++; const u = r.use || TYPE_LABEL[r.type] || ''; g.uses[u] = (g.uses[u] || 0) + (+r.cost || 0); g.cos[r.county] = (g.cos[r.county] || 0) + 1; if ((r.reg || '') > g.last) g.last = r.reg; }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    return { label, rows: [...m.values()].map(g => ({ label: top(g.names)[0][0], n: g.n, v: g.v, nw: g.nw, use: top(g.uses)[0]?.[0] || '', cos: top(g.cos).slice(0, 2).map(x => x[0]).join(', '), last: g.last })).sort((a, b) => b.v - a.v).slice(0, 200) };
  });
}
const csvRow = r => ({ ID: r.id, Registered: r.reg || '', Project: r.name || '', Address: r.addr || '', City: r.city || '', County: r.county || '', Type: TYPE_LABEL[r.type] || r.type || '', Use: r.use || '', Subtype: r.subtype || '', 'Est. value (USD)': +r.cost || 0, 'Sq ft': +r.sqft || '', Units: +r.units || '',
  Owner: r.owner || '', Developer: devOf(r) || '', Architect: r.architect || '', 'General contractor': r.gc || '', Status: r.status || '', Start: r.ts || '', End: r.te || '', Latitude: r.lat ?? '', Longitude: r.lon ?? '', Link: tabsLink(r.id) });
const filterText = f => Object.entries(f).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => k.replace(/_/g, ' ') + ' ' + (Array.isArray(v) ? v.join('/') : v)).join(', ');
const pointsOf = l => l.filter(r => r.lon != null && r.lat != null).slice(0, 400).map(r => ({ c: [+r.lon, +r.lat], r: Math.max(2, Math.min(9, Math.sqrt((+r.cost || 0) / 1e6) * 1.6)), color: r.type === 'New' ? '#0b7a5f' : '#6b7174' }));
const hasLoc = a => a.address || a.lat != null || a.apn || a.county || a.bbox || a.geojson;

export async function reportFilings(args = {}, ctx = {}) {
  const kind = args.kind || 'summary'; if (!FILING_REPORTS[kind]) throw new UserError('kind is one of ' + Object.keys(FILING_REPORTS).join(', ') + '.');
  const f = filingFilters(args), meta = ['TDLR TABS registrations', filterText(f) ? 'Filters: ' + filterText(f) : ''].filter(Boolean).join(' · ');
  const wrap = (K, title, body, landscape = false) => K.reportDoc({ kicker: 'Construction filings · ' + FILING_REPORTS[kind], title, meta: K.esc(meta), body, sources: SOURCES, landscape });
  if (kind === 'area_comparison') {
    const areas = (Array.isArray(args.areas) ? args.areas : []).filter(x => x && typeof x === 'object').slice(0, 6);
    if (areas.length < 2) throw new UserError('area_comparison needs areas: two to six locations, e.g. [{ "county": "Waller" }, { "address": "Katy, TX", "radius_mi": 3 }].');
    const locs = await Promise.all(areas.map(x => resolve(x))), out = locs.find(l => !(inTexas(l.center) || l.state === 'TX'));
    if (out) return { content: [{ type: 'text', text: doc('Area comparison', [whereLine(out), notCovered('TDLR filings', COVER.texas)]) }] };
    const qs = await Promise.all(locs.map(l => queryFilings(l, f))), labels = locs.map(l => areaLabel(l, 2)), title = labels.join(' vs. ');
    const rowsK = kpis([]).map(([k]) => k), table = rowsK.map((k, i) => [k, ...qs.map(q => kpis(q.rows)[i][1])]);
    const text = doc('Area comparison: ' + title, ['| Metric | ' + labels.join(' | ') + ' |', '|---|' + labels.map(() => '---|').join(''), ...table.map(r => '| ' + r.join(' | ') + ' |'), '', ...locs.map((l, i) => whereLine(l) + (qs[i].capped ? ' (the 10,000 largest filings)' : ''))],
      [{ name: 'TDLR TABS construction registrations', asOf: 'nightly', url: 'https://www.tdlr.texas.gov/TABS/Search', coverage: COVER.texas }], ['Filing numbers follow the filters given. For census figures of each area use demographics.']);
    const csv = args.include_csv ? csvText(table.map(r => Object.fromEntries([['Metric', r[0]], ...labels.map((x, i) => [x, r[i + 1]])]))) : null;
    try { const { pdf } = await pdfThatFits(async (K, t) => wrap(K, title, K.areaMap(locs.map((l, i) => ({ geometry: areaOf(l, 2), stroke: ['#0b7a5f', '#c2410c', '#2563eb', '#7c3aed', '#b45309', '#0e7490'][i], fill: 'rgba(0,0,0,.03)', width: 2 })), { W: 1000, H: 400 }) +
        '<h2>Side by side</h2>' + K.table(['Metric', ...labels.map(x => ({ t: x, r: 1 }))], table.map(r => r.map((c, i) => i ? c : K.esc(c)))) +
        '<h2>Largest filings in each area</h2><div style="display:grid;grid-template-columns:repeat(' + Math.min(3, locs.length) + ',1fr);gap:16px">' + qs.map((q, i) => '<div><h3>' + K.esc(labels[i]) + '</h3>' + K.table(['Project', { t: 'Est. value', r: 1 }], q.rows.slice(0, Math.min(12, t.rows)).map(r => [project(K, r) + '<div class="sc">' + K.esc(r.city || r.county || '') + '</div>', money(r.cost)])) + '</div>').join('') + '</div>', locs.length > 3),
      { extra: csv ? Buffer.byteLength(csv) : 0, ctx });
      return reportResult('area_comparison', title, text, pdf, csv); }
    catch (e) { if (e instanceof TooBig) return { content: [{ type: 'text', text: e.message }], isError: true }; throw e; }
  }
  if (!hasLoc(args) && !f.company && !f.owner && !f.developer && !f.architect && !f.contractor) throw new UserError('Give a location (an address with radius_mi, a county, a box or an outline), or a company / owner / developer / architect / contractor.');
  const loc = hasLoc(args) ? await resolve(args) : null;
  if (loc && !(inTexas(loc.center) || loc.state === 'TX')) return { content: [{ type: 'text', text: doc(FILING_REPORTS[kind], [whereLine(loc), notCovered('TDLR filings', COVER.texas)]) }] };
  const q = await queryFilings(loc, f), l = q.rows, label = loc ? areaLabel(loc, 2) : 'Texas' + (f.company ? ': ' + f.company : '');
  if (!l.length) return { content: [{ type: 'text', text: doc(FILING_REPORTS[kind] + ': ' + label, [loc ? whereLine(loc) : 'Statewide', 'No filings match these filters, so there is no report to make. Widen the dates or the area.']) }] };
  const K0 = kpis(l), groups = kind === 'activity' ? activity(l) : null;
  const text = doc(FILING_REPORTS[kind] + ': ' + label, [loc ? whereLine(loc) : 'Statewide', 'Filters: ' + (filterText(f) || 'none') + '.', ...kv(K0), ...(q.capped ? ['(The 10,000 largest filings that match; there are more.)'] : []),
    ...(groups ? groups.flatMap(g => g.rows.length ? ['', '## ' + g.label, ...g.rows.slice(0, 8).map((r, i) => (i + 1) + '. ' + clip(r.label, 60) + ': ' + n0(r.n) + ' filings, ' + usdM(r.v) + (r.use ? ', mostly ' + r.use : ''))] : []) : ['', 'Largest: ' + l.slice(0, 5).map(r => clip(r.name, 50) + ' (' + usdM(r.cost) + ')').join('; ')])],
    [{ name: 'TDLR TABS construction registrations, AI-tagged use and companies (' + (q.from === 'database' ? 'statewide table' : 'the app’s home-county file') + ')', asOf: 'nightly', url: 'https://www.tdlr.texas.gov/TABS/Search', coverage: q.from === 'database' ? COVER.texas : COVER.home }], loc?.notes || []);
  const csv = args.include_csv ? csvText(kind === 'activity' ? groups.flatMap(g => g.rows.map(r => ({ Role: g.label, Name: r.label, Projects: r.n, 'Est. value (USD)': Math.round(r.v), 'New builds': r.nw, Mostly: r.use, Counties: r.cos, 'Latest filing': r.last }))) : l.map(csvRow)) : null;
  const strip = K => K.kpiStrip(K0.map(([k, v]) => [v, k]));
  const body = (K, t) => {
    if (kind === 'summary') return strip(K) + (loc?.geometry || loc?.center ? '<div class="map">' + K.areaMap(loc ? [{ geometry: areaOf(loc, 2), stroke: '#0b7a5f', fill: 'rgba(11,122,95,.04)', width: 2 }] : [], { W: 1000, H: 420, points: pointsOf(l) }) + '</div>' : '') +
      '<div class="two"><div><h2>By county</h2>' + breakdown(K, l, r => r.county, 'County') + '<h2>By type</h2>' + breakdown(K, l, r => TYPE_LABEL[r.type] || r.type, 'Type') + '</div><div><h2>Largest filings</h2>' + listTable(K, l.slice(0, 12), false) + '</div></div>' +
      (l.some(r => r.use) ? '<h2>By use (AI-tagged)</h2>' + breakdown(K, l, r => r.use, 'Use') : '');
    if (kind === 'filing_list') return strip(K) + '<h2>Filings (' + n0(l.length) + ')</h2>' + (l.length > t.rows ? '<p class="rnote">The ' + n0(t.rows) + ' largest by estimated value are listed here; include_csv gives all ' + n0(l.length) + '.</p>' : '') + listTable(K, l.slice(0, t.rows), true);
    return strip(K) + groups.filter(g => g.rows.length).map(g => '<h2>' + K.esc(g.label) + '</h2>' + K.table(['#', 'Name', { t: 'Projects', r: 1 }, { t: 'Est. value', r: 1 }, { t: 'New', r: 1 }, 'Mostly', 'Where', 'Latest'], g.rows.slice(0, 40).map((r, j) => [String(j + 1), '<b>' + K.esc(r.label) + '</b>', n0(r.n), money(r.v), n0(r.nw), K.esc(r.use), K.esc(r.cos), K.esc(r.last)]))).join('');
  };
  try { const { pdf } = await pdfThatFits(async (K, t) => wrap(K, label, body(K, t), kind === 'filing_list'), { tries: [{ tiles: 24, rows: 600 }, { tiles: 6, rows: 150 }], extra: csv ? Buffer.byteLength(csv) : 0, ctx });
    return reportResult(kind, label, text, pdf, csv); }
  catch (e) { if (e instanceof TooBig) return { content: [{ type: 'text', text: e.message }], isError: true }; throw e; }
}

// ---------- the Traffic report (src/traffic.js exportReport): TxDOT counts, live speeds and incidents (TomTom) ----------
const STOPS = [[5000, '#22c55e'], [20000, '#eab308'], [60000, '#f97316'], [150000, '#dc2626'], [300000, '#7f1d1d']];
const colorOf = v => (STOPS.find(s => v < s[0]) || STOPS[STOPS.length - 1])[1];
const congestion = x => x.closed ? 'Closed' : x.congestion_pct == null ? '—' : x.congestion_pct + '% slower';
export const hooks = { traffic: null };
export async function reportTraffic(args = {}, ctx = {}) {
  const loc = await resolve(args);
  if (!inTexas(loc.center)) return { content: [{ type: 'text', text: doc('Traffic report: ' + loc.label, [whereLine(loc), notCovered('TxDOT traffic counts', COVER.texas)]) }] };
  const mi0 = loc.kind === 'point' || loc.kind === 'parcel' ? 1 : null, g = areaOf(loc, mi0), label = areaLabel(loc, mi0);
  const d = await (hooks.traffic || trafficReport)(g, { label }), c = d.counts || {}, roads = c.roads || [], live = Array.isArray(d.live) ? d.live : [], inc = Array.isArray(d.incidents) ? d.incidents : [];
  if (c.error) return { content: [{ type: 'text', text: doc('Traffic report: ' + label, [whereLine(loc), 'TxDOT’s traffic counts didn’t answer (' + clip(c.error, 120) + '); try again.']) }], isError: true };
  const text = doc('Traffic report: ' + label, [whereLine(loc), ...kv([['Busiest road', roads[0] ? roads[0].road + ', ' + n0(roads[0].aadt) + ' vehicles a day' : 'no counted roads'], ['Counted roads', n0(roads.length)],
    ['Live speeds', d.live?.error ? 'not available (' + clip(d.live.error, 80) + ')' : live.length ? live.filter(x => x.congestion_pct >= 25).length + ' of ' + live.length + ' busy roads slowed now' : 'no readings'], ['Incidents now', d.incidents?.error ? 'not available' : n0(inc.length)]]),
    '', ...roads.slice(0, 8).map((r, i) => (i + 1) + '. ' + r.road + ': ' + n0(r.aadt) + ' (' + r.type + ')')],
    [{ name: d.sources || 'TxDOT AADT', asOf: c.as_of ? 'TxDOT file of ' + String(c.as_of).slice(0, 10) + '; live parts read ' + today() : 'current TxDOT count year', url: 'https://gis-txdot.opendata.arcgis.com/', coverage: COVER.texas }], loc.notes || []);
  const csv = args.include_csv ? csvText([...(c.segments || []).map(s => ({ Table: 'Counted segment', Road: s.road, 'Road type': s.type, 'Vehicles a day (AADT)': s.aadt, 'Live mph': '', 'Free-flow mph': '', Detail: '' })), ...live.map(x => ({ Table: 'Live speed', Road: x.road, 'Road type': '', 'Vehicles a day (AADT)': x.aadt, 'Live mph': x.current_mph, 'Free-flow mph': x.free_flow_mph, Detail: congestion(x) })), ...inc.map(x => ({ Table: 'Incident', Road: x.road, 'Road type': x.kind, 'Vehicles a day (AADT)': '', 'Live mph': '', 'Free-flow mph': '', Detail: [x.what, x.delay_min ? x.delay_min + ' min delay' : ''].filter(Boolean).join(' · ') }))]) : null;
  const html = (K, t) => K.reportDoc({ kicker: 'Traffic report', title: label, meta: (d.area_sqmi ? d.area_sqmi + ' sq mi' : '') + (c.as_of ? ' · TxDOT file of ' + K.esc(String(c.as_of).slice(0, 10)) : ''),
    body: K.kpiStrip([[roads[0] ? n0(roads[0].aadt) : '—', roads[0] ? 'Busiest: ' + roads[0].road : 'No counted roads'], [n0(roads.length), 'Counted roads'], [live.length ? live.filter(x => x.congestion_pct >= 25).length + ' of ' + live.length : '—', 'Busy roads slowed'], [n0(inc.length), 'Incidents']]) +
      '<div class="map">' + K.areaMap([{ geometry: g, stroke: '#7c3aed', fill: 'rgba(124,58,237,.05)', dash: true }], { W: 1000, H: 420, fit: g, lines: (c.segments || []).slice(0, Math.min(400, t.rows)).reverse().map(sg => ({ coords: sg.path, stroke: colorOf(sg.aadt), width: 1.4 + Math.min(5, sg.aadt / 50000) })) }) + '</div>' +
      '<h2>Busiest roads</h2><div class="bars">' + K.bars(roads.slice(0, 12).map(r => ({ label: r.road.length > 10 ? r.road.slice(0, 9) + '…' : r.road, v: r.aadt, color: colorOf(r.aadt) }))) + '</div>' +
      K.table(['Road', 'Type', { t: 'Busiest segment', r: 1 }, { t: 'Average', r: 1 }, { t: 'Segments', r: 1 }], roads.slice(0, t.rows).map(r => [K.esc(r.road), K.esc(r.type), n0(r.aadt), n0(r.avg), n0(r.segments)])) +
      '<div class="two"><div><h2>By road type</h2>' + K.table(['Type', { t: 'Avg a day', r: 1 }, { t: 'Busiest', r: 1 }, { t: 'Segments', r: 1 }], (c.types || []).map(x => [K.esc(x.label), n0(x.avg), n0(x.max), n0(x.segments)])) + '</div>' +
      '<div><h2>Live speeds</h2>' + (live.length ? K.table(['Road', { t: 'Now', r: 1 }, { t: 'Free flow', r: 1 }, 'Condition'], live.map(x => [K.esc(x.road), n0(x.current_mph) + ' mph', n0(x.free_flow_mph) + ' mph', K.esc(congestion(x))])) : '<p class="meta">' + K.esc(d.live?.error ? 'Live speeds aren’t available here.' : 'No live readings.') + '</p>') + '</div></div>' +
      '<h2>Incidents at the time of the report</h2>' + (inc.length ? K.table(['Type', 'Road', 'What', { t: 'Delay', r: 1 }], inc.map(x => [K.esc(x.kind), K.esc(x.road), K.esc(x.what), x.delay_min ? x.delay_min + ' min' : ''])) : '<p class="meta">' + K.esc(d.incidents?.error ? 'Live incidents aren’t available here.' : 'None reported.') + '</p>'),
    sources: K.esc(d.sources || '') + ' Counts are annual averages for both directions and all vehicles; live speeds and incidents are a snapshot.' });
  try { const { pdf } = await pdfThatFits(async (K, t) => html(K, t), { tries: [{ tiles: 24, rows: 400 }, { tiles: 6, rows: 60 }], extra: csv ? Buffer.byteLength(csv) : 0, ctx });
    return reportResult('traffic', label, text, pdf, csv); }
  catch (e) { if (e instanceof TooBig) return { content: [{ type: 'text', text: e.message }], isError: true }; throw e; }
}
