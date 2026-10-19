// A project's own page (src/siteplan.js, Projects › a project): the logic with no DOM, so it can be tested in Node
// (test/project.mjs). The status list; the site's jurisdiction facts, gathered once from the app's own sources and kept
// on the project as p.site = { at, key, facts }, turned into the rows the Overview tab shows and the lines the AI reads;
// and the fact sheet the Ask tab sends with a question about the whole project (api/siteplan mode 'askProject').

// ---------- status and tabs ----------
// a project's status (p.status holds the id; a project without one is a Prospect)
export const STATUSES = [
  { id: 'prospect', label: 'Prospect' }, { id: 'review', label: 'Under review' }, { id: 'contract', label: 'Under contract' },
  { id: 'owned', label: 'Owned' }, { id: 'hold', label: 'On hold' }, { id: 'dead', label: 'Dead' }
];
export const statusOf = p => STATUSES.find(s => s.id === p?.status) || STATUSES[0];
// 'options' is labelled Sites (renamed Oct 19) but keeps its id, so addresses with pt=options still open it
export const TABS = [{ id: 'overview', label: 'Overview' }, { id: 'options', label: 'Sites' }, { id: 'renderings', label: 'Renderings' }, { id: 'plans', label: 'Plans' }, { id: 'ask', label: 'Ask' }];
export const tabOf = id => TABS.some(t => t.id === id) ? id : 'overview';

const txt = (s, n = 300) => s == null || s === '' ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n) || null;
const drop = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)));
const f0 = v => Math.round(v).toLocaleString('en-US');
const title = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

// ---------- jurisdiction facts ----------
// d: what /api/site returned for the middle of the site (flood, traffic, districts, environment, place), or { error };
// o: { county (name, no "County"), utilities (short lines from lib/utilities.mjs summaryLines), parcels (how many) }.
// Kept small: it is saved on the project and synced with the team. A missing key means "not known"; an empty list or
// null means "checked, none found".
export function siteFactsFrom(d, o = {}) {
  const f = {}, ok = x => x != null && typeof x === 'object' && !x.error, D = d && !d.error ? d : {}, ds = ok(D.districts) ? D.districts : {};
  if (o.county) f.county = txt(o.county, 60);
  if (D.place === null) f.place = null; else if (ok(D.place) && D.place.name) f.place = drop({ name: txt(D.place.name, 80), full: txt(D.place.full, 100) });
  if (ok(D.flood)) f.flood = D.flood.zone ? drop({ zone: txt(D.flood.zone, 12), subtype: txt(D.flood.subtype, 80), risk: txt(D.flood.risk, 20), bfe: Number.isFinite(D.flood.bfe) ? D.flood.bfe : null }) : { zone: null };
  if (Array.isArray(ds.water)) f.water = ds.water.slice(0, 4).map(w => drop({ name: txt(w.name, 80), type: txt(w.type, 60) })).filter(w => w.name);
  if (Array.isArray(ds.schools)) f.schools = ds.schools.slice(0, 3).map(s => txt(s, 100)).filter(Boolean);
  if (Array.isArray(ds.tirz)) f.tirz = ds.tirz.slice(0, 3).map(s => txt(s, 100)).filter(Boolean);
  if (typeof ds.opportunityZone === 'boolean') f.opportunityZone = ds.opportunityZone;
  if (ok(D.traffic) && Array.isArray(D.traffic.roads)) f.road = D.traffic.roads[0] ? { road: txt(D.traffic.roads[0].road, 60), aadt: Math.round(+D.traffic.roads[0].aadt || 0) } : null;
  if (ok(D.environment) && D.environment.total != null) f.epa = { total: +D.environment.total || 0, flagged: +D.environment.flaggedCount || 0 };
  if (Array.isArray(o.utilities)) f.utilities = o.utilities.slice(0, 6).map(s => txt(s, 220)).filter(Boolean);
  if (o.parcels > 1) f.parcels = o.parcels;
  const g = o.ground, num = v => Number.isFinite(v) ? v : null;
  if (g && [g.min, g.max, g.relief, g.slope].every(Number.isFinite)) f.ground = drop({ min: g.min, max: g.max, lo: num(g.lo), hi: num(g.hi), relief: g.relief, fall: num(g.fall), slope: g.slope, toward: txt(g.toward, 20), flat: !!g.flat, dip: num(g.dip), rough: !!g.rough, src: txt(g.src, 80), coarse: !!g.coarse });
  return f;
}
// what Regrid said about the land (kept on the parcels when someone fetched it on the property card), and the zoning an
// option was started with (also from Regrid): merged into the facts when shown, so a fetch counts straight away
export function regridFacts(parcels = [], plans = []) {
  const r = (parcels || []).find(x => x?.regrid), z = r?.regrid?.zoning || (plans || []).find(pl => pl?.zoning && Object.keys(pl.zoning).length)?.zoning || null;
  return drop({ regrid: r || z ? { city: txt(r?.regrid?.city, 60) } : null, zoning: z && Object.keys(z).length ? Object.fromEntries(Object.entries(z).slice(0, 8).map(([k, v]) => [k, typeof v === 'number' ? v : txt(v, 120)])) : null });
}

const FLOOD = {
  high: 'In the 100-year floodplain: expect fill or raised slabs, floodplain permits, and flood insurance for federally backed loans.',
  moderate: 'In the 500-year floodplain (moderate risk).',
  undetermined: 'Flood risk hasn’t been studied here.',
  minimal: 'Outside the mapped 100- and 500-year floodplains.'
};
// the rows the Jurisdiction & site card shows: { id, label, value, sub, src, list?, tone? } (tone: 'warn' or 'good');
// what isn't known is left out, except City and Zoning, which say how to find out
export function jurisdictionRows(f = {}) {
  const rows = [], add = (id, label, value, sub, src, more = {}) => rows.push({ id, label, value, sub: sub || '', src: src || '', ...more });
  if (f.county) add('county', 'County', f.county + ' County', '', 'US Census');
  const houston = /^houston$/i.test(f.place?.name || '');
  if (f.place) add('city', 'City', 'City of ' + f.place.name, 'Inside the city limits.' + (f.regrid?.city && title(f.regrid.city) !== f.place.name ? ' Regrid gives the address city as ' + title(f.regrid.city) + '.' : ''), 'US Census');
  else if (f.place === null) add('city', 'City', 'Unincorporated', 'Outside any city’s limits, so the county’s rules apply. A nearby city’s extraterritorial jurisdiction (ETJ) can still govern subdivision plats.', 'US Census');
  else if (f.regrid?.city) add('city', 'City', title(f.regrid.city), 'The city in the parcel’s address; check that the land is inside the city limits.', 'Regrid');
  else add('city', 'City', 'Not checked', 'Get Regrid Details on the parcel’s property card fills this in.', '', { tone: 'muted' });
  const z = f.zoning;
  if (z && (z.zoning || z.zoning_description)) {
    const lim = [z.max_building_height_ft && 'height ' + z.max_building_height_ft + ' ft', z.max_far && 'FAR ' + z.max_far, z.max_coverage_pct && 'coverage ' + z.max_coverage_pct + '%', z.max_density_du_per_acre && z.max_density_du_per_acre + ' units an acre'].filter(Boolean);
    add('zoning', 'Zoning', [z.zoning, z.zoning_description].filter(Boolean).join(' · '), lim.length ? 'Limits: ' + lim.join(', ') + '.' : 'Check the zoning code for setbacks, height and parking.', 'Regrid');
  } else if (houston) add('zoning', 'Zoning', 'No zoning', 'The City of Houston has no zoning; building lines, parking rules and deed restrictions still apply.', 'City of Houston');
  else if (f.place === null) add('zoning', 'Zoning', 'No zoning', 'Texas counties generally can’t zone land; check deed restrictions and the county’s development rules.', 'Texas law');
  else if (f.regrid) add('zoning', 'Zoning', 'None in Regrid’s record', 'Check the city’s zoning map.', 'Regrid', { tone: 'muted' });
  else add('zoning', 'Zoning', 'Not checked', 'Get Regrid Details on the parcel’s property card fills this in. Much of the Houston area has no zoning.', '', { tone: 'muted' });
  if (f.flood) {
    if (f.flood.zone) add('flood', 'Floodplain', 'FEMA zone ' + f.flood.zone, (FLOOD[f.flood.risk] || FLOOD.minimal) + (f.flood.bfe != null ? ' Base flood elevation ' + f.flood.bfe + ' ft.' : ''), 'FEMA', f.flood.risk === 'high' ? { tone: 'warn' } : {});
    else add('flood', 'Floodplain', 'No FEMA map here', 'There’s no flood map panel at the middle of the site.', 'FEMA');
  }
  const g = f.ground;
  if (g) { const bfe = f.flood?.bfe, ft = v => f0(v) + ' ft', dip = g.dip != null, base = dip && g.lo != null ? g.lo : g.min, below = bfe != null && base < bfe, fall = g.fall ?? g.relief;
    add('ground', 'Ground elevation', (dip && g.lo != null ? ft(g.lo) + ' to ' + ft(g.hi) : ft(g.min) + ' to ' + ft(g.max)) + ' · ' + (g.flat ? 'nearly flat' : 'falls about ' + fall + ' ft' + (g.toward ? ' to the ' + g.toward : '')),
      (g.flat ? 'Under 2 ft of fall: drainage will be graded in.' : 'About ' + g.slope + '% on average; put detention on the low side.') + (dip ? ' The lowest ground, ' + ft(g.dip) + ', is a low channel or pond: a creek, ditch or drainage way? Check for a floodway or drainage easement.' : '') + (g.rough ? ' Uneven in places: a ditch, ridge or pond on the site?' : '') +
      (bfe != null ? (below ? ' ' + (dip ? 'Much of the ground' : 'The lowest ground') + ' is about ' + f0(bfe - base) + ' ft below the base flood elevation (' + bfe + ' ft): expect fill.' : ' ' + (dip ? 'Most of it' : 'All of it') + ' is above the base flood elevation (' + bfe + ' ft).') : '') +
      ' Bare ground, NAVD 88' + (g.coarse ? ', approximate' : '') + '; not a survey.', g.src || 'USGS 3DEP', below ? { tone: 'warn' } : {}); }
  if (f.water) add('water', 'Water / utility district', f.water.length ? f.water.map(w => w.name).join(', ') : 'None found', f.water.length ? 'Confirm the district has capacity and whether the site is annexed into it.' : 'No MUD or WCID here: water and sewer service needs confirming with the city or a provider.', 'TCEQ', f.water.length ? {} : { tone: 'warn' });
  if (f.schools?.length) add('schools', 'School district', f.schools.join(', '), '', 'US Census');
  if (f.tirz) add('tirz', 'TIRZ', f.tirz.length ? f.tirz.join(', ') : 'None', f.tirz.length ? 'A tax increment reinvestment zone: public money for streets and utilities may be available.' : 'Only the City of Houston’s zones are checked.', 'City of Houston', f.tirz.length ? { tone: 'good' } : {});
  if (typeof f.opportunityZone === 'boolean') add('oz', 'Opportunity Zone', f.opportunityZone ? 'Yes' : 'No', f.opportunityZone ? 'A federal Opportunity Zone: tax benefits for qualified investment.' : '', 'US Treasury', f.opportunityZone ? { tone: 'good' } : {});
  if (f.road) add('road', 'Busiest road nearby', f.road.road + ' · ' + f0(f.road.aadt) + ' vehicles a day', 'Expect a driveway permit and possibly turn lanes.', 'TxDOT');
  else if (f.road === null) add('road', 'Busiest road nearby', 'No traffic count within about 1,000 ft', '', 'TxDOT');
  if (f.epa) add('epa', 'EPA-regulated facilities', f.epa.total ? f.epa.total + ' within ¼ mile' + (f.epa.flagged ? ', ' + f.epa.flagged + ' with violations or hazardous waste' : '') : 'None within ¼ mile', f.epa.total ? 'A Phase I environmental site assessment is recommended.' : '', 'EPA ECHO', f.epa.flagged ? { tone: 'warn' } : {});
  if (f.utilities?.length) add('utilities', 'Utilities', f.utilities[0], 'Confirm capacity and service with each provider.', 'OpenStreetMap, PUC Texas, City of Houston', { list: f.utilities });
  if (f.parcels > 1) add('replat', 'Parcels', f.parcels + ' parcels', 'A replat into one reserve or lot is likely needed.', '');
  return rows;
}
// the same facts as short lines for the AI: what's known, with its source; what wasn't checked says so
export function jurisdictionText(f = {}) {
  return jurisdictionRows(f).map(r => r.label + ': ' + (r.list ? r.list.join('; ') : r.value) + (r.sub && !r.list ? ' (' + r.sub.replace(/\.$/, '') + ')' : '') + (r.src ? ' [source: ' + r.src + ']' : ''));
}

// ---------- the fact sheet for a question about the project ----------
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
// one option, short: its numbers, uses, parking, stormwater, the pro forma's headline and how many renderings it has.
// F: lib/planask.mjs planFacts() for the option; o: { name, renderings, drawn }
export function optionBrief(F = {}, o = {}) {
  const pf = F.proForma, b = pf?.budget || {}, r = pf?.returns || {}, P = F.program || {}, pk = F.parking || {}, st = F.stormwater || {};
  return drop({
    option: txt(F.option || o.name, 60), layout: txt(F.layout, 120), editedByHand: F.editedByHand || null, outOfDate: txt(F.outOfDate, 160), request: txt(F.request, 300),
    siteAcres: F.site?.acres ?? null, zoningOnOption: F.site?.zoning && typeof F.site.zoning === 'object' ? F.site.zoning : null,
    program: drop({ use: P.use, floors: P.floors, buildings: P.buildings, stormwater: P.stormwater, zones: Array.isArray(P.zones) ? P.zones.slice(0, 6) : null }),
    totals: F.totals || null,
    parking: drop({ required: pk.required, provided: pk.provided, shortBy: pk.shortBy, surplus: pk.surplus, byUse: Array.isArray(pk.byUse) ? pk.byUse.slice(0, 6) : null }),
    stormwater: drop({ approach: st.approach, storageNeededAcreFt: st.storageNeededAcreFt, pondAcres: st.pondAcres, undergroundAcreFt: st.undergroundAcreFt }),
    checks: Array.isArray(F.checks) ? F.checks.slice(0, 6) : txt(F.checks, 200),
    proForma: pf ? drop({ method: /TestFit/.test(pf.method || '') ? 'one-page (annual)' : 'month by month', forSale: pf.forSale || null, totalCost: b.totalCost, land: b.land, noi: pf.stabilizedYear?.noi,
      yieldOnCostPct: r.yieldOnCostPct, stabilizedValue: r.stabilizedValue, leveredIrrPct: r.leveredIrrPct, profit: r.profit, marginPct: r.marginPct, note: 'typical Houston-area assumptions, not quotes' }) : null,
    aiReview: txt(F.lastBuild?.aiReviewSummary, 400),
    renderings: o.renderings || 0, siteDrawn: o.drawn === false ? false : null
  });
}
// p: the project; o: { acres, jurisdiction (facts, regrid merged in), checkedAt, options: [{ facts, name, renderings, drawn }] }
// Kept under max characters of JSON: option details are cut back first, then the last options, then the notes.
export function projectFacts(p = {}, o = {}, max = 40000) {
  const parcels = (p.parcels || []).slice(0, 20).map(x => drop({ address: txt(x.label, 160), owner: txt(x.owner, 120), acres: r2(x.acres), appraisedValue: x.marketValue || null, landValue: x.landValue || null }));
  const value = (p.parcels || []).reduce((s, x) => s + (x.marketValue || 0), 0);
  const s = drop({
    project: drop({ name: txt(p.name, 120), status: statusOf(p).label, client: txt(p.client, 120), targetUse: txt(p.use, 200), notes: txt(p.notes, 1500), siteAcres: r2(o.acres), parcelCount: (p.parcels || []).length,
      parcels, appraisedValueTotal: value || null, started: txt(p.created, 10), updated: txt(p.updated, 10) }),
    jurisdiction: o.jurisdiction ? jurisdictionText(o.jurisdiction) : 'not looked up yet',
    jurisdictionCheckedOn: txt(o.checkedAt, 10),
    options: (o.options || []).map(x => x.drawn === false ? drop({ option: txt(x.name, 60), siteDrawn: false }) : optionBrief(x.facts, x)),
    note: 'Site plans are concept test-fits from parcel outlines, not surveys or designs; parking ratios, stormwater and pro forma numbers are the tool’s typical starting assumptions.'
  });
  if (!s.options) s.options = [];
  return fitSheet(s, max);
}
export function fitSheet(s, max = 40000) {
  const size = () => JSON.stringify(s).length, opts = s.options || [];
  const steps = [o => { if (o.parking) delete o.parking.byUse; delete o.zoningOnOption; }, o => { if (Array.isArray(o.checks)) o.checks = o.checks.slice(0, 2); delete o.request; delete o.aiReview; },
    o => { delete o.program?.zones; delete o.stormwater; delete o.layout; if (o.totals) o.totals = drop({ floorAreaSf: o.totals.floorAreaSf, units: o.totals.units, coveragePct: o.totals.coveragePct, far: o.totals.far }); }];
  for (const step of steps) { if (size() <= max) break; opts.forEach(step); }
  let cut = 0; while (size() > max && opts.length > 1) { opts.pop(); cut++; }
  if (cut) s.optionsLeftOut = cut + ' more option' + (cut === 1 ? '' : 's') + ' not included (too many to send)';
  if (size() > max && s.project?.notes) s.project.notes = s.project.notes.slice(0, 300);
  if (size() > max && Array.isArray(s.project?.parcels)) s.project.parcels = s.project.parcels.slice(0, 3);
  return s;
}
// the questions offered under the Ask box before the first one
export const ASK_STARTERS = ['Which option fits this site best?', 'What approvals will this site need?', 'What should we check before going under contract?', 'Summarise this project for an email'];
