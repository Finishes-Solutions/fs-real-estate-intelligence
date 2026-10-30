// The Site Environmental report for the selected parcel or parcels: what the environmental, flood and hazard records say
// about the site and around it, as a desktop screen ahead of a Phase I. It reads the same data as the Environmental and
// FEMA reports (api/env.js, api/fema.js) and the soils under the site, and lays it out in the plain look
// (lib/reports/plain.mjs): unbranded. Pure.
//   siteEnvReport({ title, area, date, env, fema, flood?, parcelLabel? }) -> HTML
// env: api/env.js's report (kinds: { [kind]: { label, search_mi, count, onsite, nearest: [{ name, addr, city, mi, dir }],
// error? } }, soils), fema: api/fema.js's report, flood: the zone at the parcel (api/site.js).
import { C, esc, n0, n1, usd, usdM, pct, doc, pageOf, card, tiles, table, bars } from './plain.mjs';

// the groups the records fall into, worst first; each kind is a key of env.kinds
export const GROUPS = [
  ['Cleanup & contamination', ['npl', 'superfund', 'ihwca', 'vcp', 'brownfield', 'epa_bf', 'drycleaner', 'lpst', 'landfill', 'msd']],
  ['Regulated operations', ['pst', 'rcra', 'tri', 'air', 'water']],
  ['Oil, gas & pipelines', ['wells', 'orphan', 'pipelines']],
  ['Natural features', ['wetlands']],
];
const CLEANUP = GROUPS[0][1];
const DIRS = { N: 90, NE: 45, E: 0, SE: -45, S: -90, SW: -135, W: 180, NW: 135 };
// the finding for the whole screen: 'clear', 'review' (records nearby) or 'flag' (on the site, or a cleanup case within ¼ mile)
export function verdict(env) {
  const k = env.kinds || {}, on = CLEANUP.concat(['pst', 'rcra', 'wells', 'orphan', 'pipelines']).some(x => k[x]?.onsite > 0), close = CLEANUP.some(x => (k[x]?.nearest || []).some(r => r.mi <= 0.25));
  const near = Object.values(k).some(v => v?.count > 0);
  return on || close ? 'flag' : near ? 'review' : 'clear';
}
const TONE = { flag: [C.red, 'Records on or next to the site'], review: [C.amber, 'Records nearby, none on the site'], clear: [C.green, 'Nothing found in the search distances'] };
const where = r => (r.mi === 0 ? 'On site' : r.mi < 0.1 ? n0(r.mi * 5280) + ' ft' : n1(r.mi) + ' mi') + (r.mi > 0 && r.dir ? ' ' + r.dir : '');

// rings at the search distances with each record placed by its distance and compass direction (to the nearest 45°)
function radar(env, { W = 290, H = 290 } = {}) {
  const k = env.kinds || {}, cx = W / 2, cy = H / 2, R = W / 2 - 18, rings = [0.25, 0.5, 1], Rm = 1.05, s = R / Rm, o = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'];
  for (const r of rings) o.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * s).toFixed(1) + '" fill="none" stroke="' + C.line + '"/><text x="' + (cx + 3) + '" y="' + (cy - r * s - 3).toFixed(1) + '" font-family="IBM Plex Mono" font-size="6.5" fill="' + C.mute + '">' + (r === 0.25 ? '¼' : r === 0.5 ? '½' : '1') + ' MI</text>');
  o.push('<line x1="' + cx + '" y1="' + (cy - R) + '" x2="' + cx + '" y2="' + (cy + R) + '" stroke="' + C.grid + '"/><line x1="' + (cx - R) + '" y1="' + cy + '" x2="' + (cx + R) + '" y2="' + cy + '" stroke="' + C.grid + '"/>');
  for (const [d, a] of [['N', 90], ['E', 0], ['S', -90], ['W', 180]]) o.push('<text x="' + (cx + Math.cos(a * Math.PI / 180) * (R + 9)).toFixed(1) + '" y="' + (cy - Math.sin(a * Math.PI / 180) * (R + 9) + 2.5).toFixed(1) + '" font-family="IBM Plex Mono" font-size="7" font-weight="600" fill="' + C.sub + '" text-anchor="middle">' + d + '</text>');
  const placed = new Map(), dots = [];
  GROUPS.forEach(([, kinds], gi) => kinds.forEach(x => (k[x]?.nearest || []).forEach(r => { if (r.mi > Rm) return; const a = (DIRS[r.dir] ?? 90) * Math.PI / 180, key = r.dir + Math.round(r.mi * 20), n = placed.get(key) || 0; placed.set(key, n + 1);
    const jit = n * 0.13, rr = r.mi * s; dots.push('<circle cx="' + (cx + Math.cos(a + jit) * rr).toFixed(1) + '" cy="' + (cy - Math.sin(a + jit) * rr).toFixed(1) + '" r="3.4" fill="' + [C.red, C.amber, '#5f6368', C.green][gi] + '" stroke="#fff" stroke-width=".8"/>'); })));
  o.push(...dots, '<rect x="' + (cx - 5) + '" y="' + (cy - 5) + '" width="10" height="10" fill="' + C.accent + '"/></svg>');
  return o.join('');
}

export function siteEnvReport({ title, area = '', date = '', env = {}, fema = {}, flood = null, parcelLabel = '' }) {
  const k = env.kinds || {}, v = verdict(env), [vc, vt] = TONE[v], cnt = ks => ks.reduce((s, x) => s + (k[x]?.count || 0), 0), on = ks => ks.reduce((s, x) => s + (k[x]?.onsite || 0), 0);
  const failed = Object.values(k).filter(x => x?.error), head = { kicker: 'Site environmental', title, rightSub: area, right: vt };
  const foot = 'Desktop screen of public records (' + esc(env.sources ? 'TCEQ, US EPA, Railroad Commission of Texas, US Fish & Wildlife Service, USDA NRCS, FEMA' : 'public records') + ') · distances from the site\'s edge · not a Phase I environmental site assessment' + (date ? ' · ' + esc(date) : '');
  const fz = fema.flood_zones, high = fz?.shares?.high || 0;
  const pages = [];
  // 1. the finding, the records around the site, and what was searched
  const tl = tiles([[n0(cnt(CLEANUP)), 'Cleanup records', cnt(CLEANUP) ? C.amber : ''], [n0(on(CLEANUP)), 'On the site', on(CLEANUP) ? C.red : ''], [n0(k.lpst?.count || 0), 'Leaking tanks ½ mi'], [n0((k.wells?.count || 0) + (k.pipelines?.count || 0)), 'Wells & pipelines ¼ mi'],
    [flood?.zone || fz?.zones?.[0]?.zone || '—', 'Flood zone', high > 1 ? C.amber : ''], [k.wetlands?.error ? 'n/a' : k.wetlands?.onsite ? 'Yes' : 'No', 'Wetlands on site']]);
  const searched = table([['Database'], ['Search', 'n'], ['Found', 'n'], ['On site', 'n'], ['Nearest']], GROUPS.flatMap(([g, kinds]) => [['<b>' + esc(g) + '</b>', '', '', '', '']].concat(kinds.filter(x => k[x]).map(x => { const s = k[x];
    return ['&nbsp;&nbsp;' + esc(s.label), (s.search_mi ?? '—') + ' mi', s.error ? '<span style="color:' + C.amber + '">n/a</span>' : n0(s.count), s.error ? '—' : s.onsite ? '<b style="color:' + C.red + '">' + n0(s.onsite) + '</b>' : '0', s.error ? 'Source didn\'t answer: re-run' : s.nearest?.[0] ? esc(s.nearest[0].name) + ' · ' + where(s.nearest[0]) : '—']; }))));
  pages.push(pageOf({ ...head, sub: parcelLabel || 'Records within the standard search distances of the site' },
    '<div class="card" style="border-color:' + vc + ';margin-bottom:9px"><span class="k" style="color:' + vc + '">Finding</span><p class="para"><b>' + esc(vt) + '.</b> ' + esc(summaryLine(env, fema, flood)) + '</p></div>' + tl +
    '<div class="row" style="margin-top:10px"><div style="width:290px"><div class="k" style="margin-bottom:2px">Records around the site</div>' + radar(env) +
    '<div class="note">Placed by distance and compass direction (to the nearest 45°). <span class="dot" style="background:' + C.red + '"></span>Cleanup <span class="dot" style="background:' + C.amber + '"></span>Regulated <span class="dot" style="background:#5f6368"></span>Oil & gas</div></div>' +
    '<div class="col">' + searched + '</div></div>', foot));
  // 2. the records themselves, nearest first
  const rows = GROUPS.flatMap(([g, kinds]) => kinds.flatMap(x => (k[x]?.nearest || []).map(r => ({ ...r, g, label: k[x].label })))).sort((a, b) => a.mi - b.mi);
  const recTable = rows.length ? table([['Distance', 'n'], ['Record'], ['Database'], ['Address'], ['ID']], rows.slice(0, 40).map(r => [where(r), '<b>' + esc(r.name) + '</b>', esc(r.label), esc([r.addr, r.city].filter(Boolean).join(', ') || '—'), '<span class="mono">' + esc(r.id || '—') + '</span>'])) : '<p class="para">No records within the search distances.</p>';
  const soils = env.soils?.list || [], soilT = soils.length ? table([['Soil'], ['Drainage'], ['Hydro group'], ['Flooding'], ['Water table', 'n'], ['Small commercial'], ['Homes, no basement']],
    soils.map(s => ['<b>' + esc(s.name) + '</b>' + (s.share != null ? ' <span class="sub">' + pct(s.share, 0) + '</span>' : ''), esc(s.drainage || '—'), esc(s.hydrologic_group || '—'), esc(s.flooding || '—'), s.water_table_cm != null ? n1(s.water_table_cm / 30.48) + ' ft' : '—', lim(s.small_commercial), lim(s.dwellings_without_basements)])) : '<p class="para">No soil survey data returned.</p>';
  pages.push(pageOf({ ...head, kicker: 'Site environmental · records & soils', sub: rows.length + ' record' + (rows.length === 1 ? '' : 's') + ' within the search distances, nearest first' },
    '<div class="k" style="margin-bottom:3px">Records</div>' + recTable + '<div style="height:12px"></div><div class="k" style="margin-bottom:3px">Soils under the site (USDA NRCS soil survey)</div>' + soilT +
    '<p class="note" style="margin-top:5px">Hydrologic group D (and C/D) soils shed most rain: plan for more detention. "Very limited" means the soil itself makes that use costly (shrink-swell, wetness or low strength), usually solved with engineered fill or deeper foundations.</p>' +
    (failed.length ? '<div class="card" style="border-color:' + C.amber + ';margin-top:9px"><span class="k" style="color:' + C.amber + '">Not searched this time</span><p class="para">' + esc(failed.map(x => x.label).join(', ')) + ' didn\'t answer. Re-run the report to include ' + (failed.length === 1 ? 'it' : 'them') + '; until then, don\'t read a blank as "none".</p></div>' : ''), foot));
  // 3. flood and natural hazards
  const nf = fema.nfip_claims, ri = fema.risk_index, dz = fema.disasters, tr = ri?.by_tract?.[0];
  const shares = fz?.shares ? Object.entries(fz.shares).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).map(([key, x]) => [({ high: '1% annual chance (100-yr)', moderate: '0.2% annual chance (500-yr)', minimal: 'Minimal hazard', unmapped: 'Not mapped', water: 'Open water', undetermined: 'Undetermined' })[key] || key, x, key === 'high' ? C.red : key === 'moderate' ? C.amber : '#9aa0a6']) : [];
  const haz = (ri?.hazards || []).slice(0, 8).map(h => [h.hazard, h.eal, /Very High/.test(h.rating) ? C.red : /High/.test(h.rating) ? C.amber : '#9aa0a6']);
  const dis = (dz?.list || []).filter(d => /Major/.test(d.kind)).slice(0, 10);
  pages.push(pageOf({ ...head, kicker: 'Site environmental · flood & hazards', sub: 'FEMA flood map, flood insurance claims, disaster declarations and the National Risk Index' },
    '<div class="row"><div class="col">' + card('Flood zone at the site', [['FEMA zone', flood ? flood.zone + (flood.subtype ? ' · ' + flood.subtype.toLowerCase() : '') : fz?.zones?.map(z => z.zone + ' ' + pct(z.pct, 1)).join(', ')], ['Base flood elevation', flood?.bfe || fz?.bfe ? (flood?.bfe || fz.bfe) + ' ft' : 'Not set'], ['Floodway on the site', fz?.floodway ? 'Yes' : 'No'],
      ['Area in the 100-year floodplain', pct(high, 1)], ['Flood insurance', high > 0.5 ? 'Required with a federally backed loan for buildings in it' : 'Not required by the map (recommended near a mapped floodplain)']]) +
    '<div class="card"><span class="k">Share of the area by flood risk</span>' + (shares.length ? bars(shares, { W: 330, labelW: 140, fmt: v => pct(v, 1) }) : '<p class="para">No flood map data.</p>') + '</div>' +
    card('Flood insurance claims (census tract' + ((nf?.tracts_searched || 1) > 1 ? 's' : '') + ')', nf ? [['Claims on record', n0(nf.claims)], ['Total paid', usd(nf.paid)], ['In the last 10 years', n0(nf.last_10_years)], ['Most recent loss', nf.latest_loss], ['Biggest event', nf.top_events?.[0] ? nf.top_events[0].event + ' (' + nf.top_events[0].claims + ' claims, ' + usdM(nf.top_events[0].paid) + ')' : '—']] : []) + '</div>' +
    '<div class="col">' + card('National Risk Index (census tract)', ri ? [['Tract', tr?.tract || '—'], ['Risk rating', tr?.risk_rating || ri.risk_rating], ['Risk score (national percentile)', n1(tr?.risk_score ?? ri.risk_score)], ['Expected annual loss', usd(tr?.eal ?? ri.expected_annual_loss)], ['Social vulnerability', ri.social_vulnerability?.rating], ['Community resilience', ri.community_resilience?.rating]] : []) +
    '<div class="card"><span class="k">Expected annual loss by hazard</span>' + (haz.length ? bars(haz, { W: 330, labelW: 80, fmt: usdM }) : '<p class="para">No risk index data.</p>') + '</div>' +
    '<div class="card"><span class="k">Major disaster declarations, county, since ' + esc(dz?.since || '2000') + ' (' + n0(dz?.major) + ')</span>' + dis.map(d => '<div class="kv"><span>' + esc(d.date) + '</span><span>' + esc(titleCase(d.title)) + '</span></div>').join('') + '</div></div></div>', foot));
  return doc('Site environmental · ' + title, pages);
}
const lim = v => !v ? '—' : /Very/.test(v) ? '<span style="color:' + C.red + '">' + esc(v) + '</span>' : /Somewhat/.test(v) ? '<span style="color:' + C.amber + '">' + esc(v) + '</span>' : esc(v);
const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s,(-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bTx\b/g, 'TX');
// one sentence on what stands out
function summaryLine(env, fema, flood) {
  const k = env.kinds || {}, rows = CLEANUP.flatMap(x => (k[x]?.nearest || []).map(r => ({ ...r, label: k[x].label }))).sort((a, b) => a.mi - b.mi), out = [];
  if (rows[0]) out.push('Nearest cleanup record: ' + rows[0].name + ' (' + rows[0].label.replace(/\s*\(.*\)$/, '') + '), ' + where(rows[0]) + '.');
  const lp = k.lpst?.count || 0; if (lp) out.push(lp + ' leaking petroleum tank case' + (lp === 1 ? '' : 's') + ' within ½ mile, the closest ' + where(k.lpst.nearest[0]) + ': ask about groundwater in the Phase I.');
  if (!(k.wells?.count) && !(k.pipelines?.count)) out.push('No oil or gas wells or pipelines within ¼ mile.');
  const z = flood?.zone; if (z) out.push('Flood zone ' + z + (/^X/.test(z) ? ', outside the mapped 100- and 500-year floodplains' : '') + '.');
  if (k.wetlands?.error) out.push('The wetlands map didn\'t answer this time; re-run before relying on it.');
  return out.join(' ');
}
