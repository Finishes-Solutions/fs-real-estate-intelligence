// Development pro forma for a site plan: budget, sources, stabilized operations, schedule, cash flows and returns.
//
// Two methods:
//  - 'schedule' (the default): month by month. Land at closing, soft costs through pre-development and construction,
//    hard costs on an S-curve through construction, a construction loan funded after the equity (interest capitalised),
//    lease-up from 0 to stabilized occupancy, refinance into a permanent loan at stabilization, sale at the end of the
//    hold on forward NOI. For-sale homes close at an absorption pace instead of leasing.
//  - 'simple': the one-page method in TestFit's custom pro forma (reverse-engineered: it reproduces that sheet to the
//    dollar). Annual, rent per net rentable sq ft with expense recoveries, all equity in at year 0, a fully amortising
//    loan from day 1, and NOI from year 1 at stabilized levels: no construction period, interest or lease-up, which is
//    why its IRRs run high. Kept for comparison.
//
// The pro forma is a pure function of a plan's metrics (metricsOf): building sf by use, the units and unit mix, the
// parking, paving, detention volume and acreage. proFormaOf(metrics, use, overrides) runs any set of metrics (a drawn
// plan's, or a scenario's compact { buildingSf, leasableSf, units, parking, detentionAcFt, acres }), and
// proFormaSummary(R) gives the few numbers to set scenarios side by side.
//
// Area basis: rent is charged on leasable area, never gross. Retail and restaurants lease about 97% of the building
// (NNN); office and medical lease rentable sf = usable sf × a load factor (the share of lobbies, corridors and
// restrooms each tenant pays for); apartments the units' net sf from the unit mix; self storage the net rentable sf
// of its units; a hotel by keys. The efficiencies are editable.
//
// Every default is a 2026 Houston / Katy / Waller suburban starting point with its basis noted beside it: a market
// assumption, not verified, and not a quote, an appraisal or a promise of any yield. Everything is editable, and
// numbers outside the usual range for the area get a calm note (checks).
import * as S from './siteplan.mjs';

const RES = ['multifamily', 'townhomes', 'duplex', 'sfr'], COMM = ['retail', 'restaurant', 'office', 'medical', 'hotel', 'church', 'industrial', 'storage', 'fuel', 'other'];
const NNN = ['retail', 'restaurant', 'office', 'medical', 'church', 'industrial', 'other']; // leased triple net: tenants pay their share of taxes, insurance and common-area costs
const HOMES = ['townhomes', 'duplex', 'sfr'];

// ---------- the classification every number carries ----------
// Plain labels the UI shows (and another tool can map onto its own tags): the pro forma's market numbers are
// assumptions, the plan's quantities come from a concept layout, and nothing here is a verified requirement.
export const BASIS = {
  market: { tag: 'UNVERIFIED', label: 'Market assumption, not verified' },
  user: { tag: 'UNVERIFIED', label: 'Your number, not verified' },
  plan: { tag: 'ENGINEERING ASSUMPTION', label: 'From the concept plan, not a survey' }
};
export const DISCLAIMER = 'A planning estimate from market assumptions, not verified: not an appraisal, a quote or a promise of any yield or return.';

// ---------- defaults, 2026 Houston / Katy / Waller suburban, with their basis ----------
// hard cost, $ per gross building sf (the building only: site work, TI, FF&E and soft costs are their own lines)
export const HARD = {
  multifamily: 120, // 3-story garden walk-up, wood frame on slab, surface parked: $110–135
  townhomes: 115, // for-rent 2–3 story townhomes, gross includes the 2-car garage (~$125 living, ~$55 garage)
  duplex: 110, // 1–2 story duplex / cottage, wood frame, 1-car garage
  sfr: 100, // production single-family (sticks and bricks, living sf): $90–115
  retail: 115, // single-story strip / inline shell (tilt-wall or CMU, storefront, canopy): $100–130
  restaurant: 170, // freestanding or end-cap restaurant shell with grease trap, hood rough-ins and patio: $150–200
  office: 175, // 2–3 story suburban steel-frame shell and core: $160–200
  medical: 210, // medical office shell (heavier MEP, plumbing to every suite): $190–240
  hotel: 180, // select-service 4-story wood or podium, ~550 gross sf a key (~$100k a key): $165–200
  church: 170, // worship building (tall sanctuary, assembly occupancy): $150–220
  industrial: 65, // tilt-wall bulk / rear-load warehouse shell, 32–36 ft clear: $55–75
  storage: 68, // multi-story climate-controlled self storage (HVAC, elevators, interior halls): $60–80
  foodtrucks: 175, // a blend of an open pavilion (~$90), restrooms (~$350) and a bar shell (~$250)
  fuel: 275, // c-store built by the owner (coolers, MEP, food service): $250–325
  amenity: 200, // apartment clubhouse / leasing center with finishes: $180–275
  other: 150 // specialty commercial with no use of its own (daycare, club, school): $120–220
};
export const HARD_STORAGE = { climate: 68, drive: 38, office: 150 }; // climate-controlled as above; drive-up rows: single-story metal buildings, $32–48; the leasing office like a small retail shell
export const HARD_PAVILION = 90; // an AI-crafted type's open-sided pavilion or shade structure: $70–120
// site work: what the site costs to build on, by what is built, not by the size of the lot
export const SITE = {
  sitePrepPsf: 3.0, // $ / developed sf (what's built, paved and dug plus a third for its buffers and slopes; the rest of the lot stays as it is): clearing, mass grading and lime-stabilized pads, erosion control, on-site water, sewer and storm lines, landscaping and irrigation, lighting: $2–4
  pavingPsf: 7.5, // $ / sf of drives, fire lanes and plazas outside the parking lots: 6–7 in reinforced concrete on stabilized subgrade (Houston's clay): $6.50–9 (truck courts at 1.25×: 8 in)
  stallCost: 2750, // $ / surface space: its ~270 sf of the lot (stall and half the aisle) paved, striped, lit, with islands: $2,200–3,500
  deckPerSpace: 27500, // $ / space in a parking garage (precast, 4–5 levels): $24,000–32,000
  pondPerAcFt: 30000, // $ / acre-foot a detention pond holds: ~1,600 cy dug at ~$12, the outfall structure, slopes and seeding: $20,000–45,000
  vaultPerAcFt: 420000, // $ / acre-foot in underground vaults or chambers: ~$9.60 a cubic foot installed: $300,000–600,000
  lotCost: 55000, // $ / single-family lot developed (streets, utilities, detention, entry; the raw land is the land line): $45,000–65,000
  amenityPsf: { court: 20, pool: 110, play: 30 } // courts (post-tensioned slab, fence, lights ~$35k a court), pools (shell, deck, equipment), playgrounds (equipment and surfacing)
};
export const RENT_COMM = { // $ per leasable sf per year, triple net (tenants pay their share of taxes, insurance and common-area costs)
  retail: 26, // new inline / strip shop space: Katy $24–32, Waller $18–24
  restaurant: 36, // new restaurant end-cap or pad with patio: $30–45
  office: 22, // suburban Class A, NNN-equivalent (quoted ~$32–34 full-service gross less ~$11 of operating costs)
  medical: 32, // new medical office building, Katy / Cypress: $28–38
  industrial: 7.75, // Katy / Brookshire / US-290 bulk and rear-load warehouse: $6.50–8.50 (small bay $10–13)
  church: 0, // a church is usually built for its own congregation (no rent): set a rent to model a lease
  other: 22, // a specialty user leasing the whole building (daycare, club, school): $16–30
  hotel: 0, storage: 0 // (a hotel runs on its rooms, self storage on its own monthly rents)
};
export const STORAGE_PF = { climate: 1.35, drive: 0.95, rv: 125, rvOpex: 120 }; // street rents: climate-controlled $ / sf a month (Houston $1.15–1.55, small units dearer), drive-up $0.80–1.10, an uncovered RV / boat space $ a month ($90–175) and its costs $ a year
// a tiny / manufactured home community the owner rents out (lib/sitecommunity.mjs): the home and its pad rented together,
// $ a month, Waller / Katy / Brookshire 2026 (a 1-bed tiny home or park model $900–1,250; a 2–3 bed single-wide $1,150–1,450,
// a double-wide $1,400–1,750); the home bought, delivered and set (piers, tie-downs, skirting, steps, hookups), $ a sf (a
// tiny home or park model $130–180; HUD-code manufactured homes $65–95); a finished pad (utilities to the pad, its
// parking, its share of the lanes and the pond) per home: $22,000–40,000; operating costs a home a year before taxes
// and management (water and sewer often master-metered, repairs, turnover, insurance): $1,800–3,200; the cap rate of a
// community that owns and rents its homes (6.25–7.25; lot-rent-only communities trade lower, 5.25–6.25)
export const COMMUNITY_PF = { rent: { tiny: 1050, manufactured: 1300 }, hard: { tiny: 150, manufactured: 80 }, lotCost: 30000, opexPerHome: 2400, cap: 6.75, vacancy: 6, mgmt: 6 };
export const RV_PARK = { rv: 550, rvOpex: 2400 }; // an AI-crafted RV park (not storage): a monthly site with hookups $450–650, its utilities, staff and upkeep ~$200 a site a month
const isPark = name => /\b(park|resort|camp)/i.test(name || '');
export const HOTEL_PF = { adr: 135, occ: 68, otherPct: 6, opexPct: 57, mgmtPct: 3, ffePct: 4, ffeKey: 18000 }; // select-service, Katy / west Houston: ADR $120–150, occupancy 62–72%, other revenue (market, meeting, parking) % of rooms, departmental + undistributed costs with franchise fees and insurance % of revenue (GOP ~43%; select-service runs 40–48%), base management fee, FF&E reserve, FF&E and OS&E at opening $15–22k a key
export const TI = { retail: 35, restaurant: 70, office: 65, medical: 90, hotel: 0, church: 0, industrial: 4, storage: 0, fuel: 0, other: 30 }; // $ per leasable sf: new-shell allowances (retail $25–45, restaurant $50–100, office $55–80, medical $75–110, industrial the office build-out spread over the building $3–6)
export const LEASE_TERM = { retail: 10, restaurant: 10, office: 7, medical: 10, church: 15, industrial: 7, other: 10 }; // years, the first lease's term
export const LC_PCT = 4.5; // leasing commissions, % of the first lease's base rent over its term (the usual 6% on years 1–5 and 3% after, landlord and tenant brokers)
// efficiencies: the share of the gross building that is leased (rent is charged on this, never on gross)
export const EFF = {
  retail: 0.97, restaurant: 0.97, // NNN shop space: leasable ≈ gross less the shared electrical and riser rooms (95–100%)
  office: 0.85, medical: 0.84, // usable sf / gross sf: lobbies, cores, corridors and restrooms out (office 82–88%, medical 80–86%)
  industrial: 1.0, church: 1.0, other: 0.95, fuel: 0.97, // single-tenant buildings lease the whole box
  townhomes: 0.85, duplex: 0.9, sfr: 1.0 // living area of a home's gross (the garage left out); homes rent whole
};
export const LOAD = { office: 1.12, medical: 1.15 }; // load factor, rentable / usable: each tenant's share of the common areas (office 1.10–1.15, medical 1.12–1.20)
// a gas station, two ways: ground-leased to a fuel retailer who builds and runs it (NNN ground rent, the usual for a
// developer), or built and run by the owner (fuel and inside-sales margins, a car wash, less the store's costs). Typical
// numbers to start with: ground rent about $22,500 a pump a year ($150–250k for 6–10 pumps, ~7–8% of a hard corner's value); ~160,000 gallons a pump a
// year at 30¢; inside sales ~$450 a store sf at a 32% margin; the store's costs about 55% of its gross profit; canopy,
// pumps and tanks priced apart.
export const FUEL_PF = { mode: 'lease', rentPerPump: 22500, gallons: 160000, cents: 30, insidePsf: 450, insideMargin: 32, washPerYear: 250000, opexPct: 55, canopyPsf: 60, pumpCost: 45000, tankCost: 350000 };
export const RENT_HOME = { townhomes: 2550, duplex: 2100, sfr: { 1: 2200, 2: 2650, 3: 2850 } }; // $ per month, build-to-rent, Katy / Fulshear / Waller: a 3-bed townhome $2,300–2,900 (the default follows the plan's home size: $1,000 + $0.78 a living sf), a duplex half $1,700–2,400 (also by size), 1,900–3,000 sf houses $2,000–3,100
export const townhomeRent = livingSf => Math.round((1000 + 0.78 * livingSf) / 25) * 25; // Katy BTR townhomes and duplexes: ~$2,325 at 1,700 sf, ~$2,900 at 2,450
export const SALE_PSF = { townhomes: 185, duplex: 175, sfr: 165 }; // $ per living sf, for sale: new homes in Katy / Fulshear $150–185, Waller $135–155
export const RENT_UNIT = { Studio: 1175, '1 BR': 1425, '2 BR': 1795, '3 BR': 2150 }; // $ per month, new Class A garden in Katy / west Houston (~$1.75 a sf; Waller ~10–15% less), net of typical concessions
// a food truck park: stall rent a truck a month; the bar leased triple net ($ / sf a year) or run by the owner (sales a sf
// a year at a net margin); the park's own costs (utilities, cleaning, trash and grease, security, events): a stall a year
// and a fixed amount (a manager, insurance, landscaping); a stall's pad, pedestal and hookups
export const FT_PF = { stallRent: 1200, barMode: 'owner', barRent: 30, barSales: 700, barMargin: 18, opexStall: 2400, opexFixed: 40000, stallCost: 18000 };
export const CAP = { // going-in (market) cap rates, Houston suburban 2026; the exit cap is 0.25 above
  multifamily: 5.5, // Class A garden: 5.25–5.75
  townhomes: 5.5, sfr: 5.5, // build-to-rent communities: 5.25–5.75
  duplex: 6.0,
  retail: 6.75, // unanchored strip: 6.5–7.5
  restaurant: 6.25, // single-tenant restaurant NNN: 5.5–6.75
  office: 8.25, // suburban office: 7.75–9
  medical: 6.75, // medical office: 6.5–7.25
  hotel: 8.5, // select-service: 8–9
  church: 8.0, // special-purpose, sale-leaseback: 7.5–9
  industrial: 6.0, // bulk / rear-load: 5.75–6.5
  storage: 5.75, // Class A self storage: 5.5–6.25
  foodtrucks: 8.0, // an operating business
  fuel: 5.5, // a c-store ground lease to a credit tenant: 5–6 (run by the owner, about 8)
  other: 7.5 // special-purpose / operating businesses: 7–8.5
};
// land, $ per acre, when the parcels have no appraised value: residential and industrial acreage, commercial frontage
export const LAND_AC = { multifamily: 200000, townhomes: 175000, duplex: 175000, sfr: 150000, industrial: 195000, storage: 260000, church: 175000, fuel: 650000, retail: 350000, restaurant: 350000, office: 350000, medical: 350000, hotel: 350000, foodtrucks: 350000, other: 300000 }; // ~$3.50–4.50 a sf for acreage, $8 for commercial frontage (Katy $12–25, Waller $4–10), $15 for a hard corner a fuel retailer wants
export const VACANCY = { multifamily: 7, townhomes: 6, duplex: 6, sfr: 5, retail: 5, restaurant: 5, office: 10, medical: 7, church: 5, industrial: 5, storage: 11, foodtrucks: 10, fuel: 0, other: 7, hotel: 0 }; // stabilized vacancy %: apartments with concessions in an oversupplied Houston; suburban office ~20% vacant overall, 10% for new; storage economic (with discounts); a hotel's occupancy is in its own numbers
export const OPEX_PSF = { retail: 4.75, restaurant: 4.75, office: 9.0, medical: 9.5, church: 4.0, industrial: 1.25, storage: 2.75, other: 5.0 }; // $ / leasable sf a year before taxes: NNN uses common-area costs and insurance (recovered from tenants; Houston insurance ~$1.25–2 a sf after the storms), self storage the owner's own (payroll, utilities, insurance, marketing, repairs)

// ---------- the plan's metrics: everything the pro forma reads from a plan ----------
const elA = e => S.elArea(e);
export function metricsOf(plan) {
  const m = S.metrics(plan), prog = S.normalizeProgram(plan.program), els = plan.elements || [];
  const uses = {}, sum = f => els.filter(f).reduce((s, e) => s + elA(e), 0);
  for (const e of els.filter(e => e.kind === 'building')) {
    const use = S.USES[e.use] ? e.use : prog.use, u = uses[use] ||= { gsf: 0, units: 0 }, g = S.gfaOf(e);
    u.gsf += g;
    if (use === 'multifamily') u.units += e.units ?? 0;
    else if (use === 'sfr' && e.padSpaces != null) { u.units += e.units ?? 1; const k = /^mhome-(?:tiny|park|cottage)/.test(e.type || '') ? 'tiny' : 'manufactured'; u.community ||= { tiny: 0, manufactured: 0, tinySf: 0, manufacturedSf: 0 }; u.community[k] += e.units ?? 1; u.community[k + 'Sf'] += g; } // a community's home, rented with its pad
    else if (S.USES[use].garage) { u.units += e.units ?? 1; if (use === 'sfr') { u.homes ||= {}; u.homes[e.floors || 2] = (u.homes[e.floors || 2] || 0) + 1; } }
    else if (use === 'storage') { const k = S.storageKind(e); u[k + 'Gsf'] = (u[k + 'Gsf'] || 0) + g; }
    else if (use === 'foodtrucks') { if (S.ftKind(e) === 'bar') u.barSf = (u.barSf || 0) + g; }
    else if (use === 'amenity' && e.custom) u.pavilionSf = (u.pavilionSf || 0) + g; // an AI-crafted type's pavilion: an open structure, not a clubhouse
  }
  if (uses.multifamily) uses.multifamily.units = m.mix.reduce((s, t) => s + t.n, 0) || uses.multifamily.units;
  if (uses.hotel) uses.hotel.keys = Math.max(1, Math.round(uses.hotel.gsf / (S.USES.hotel.roomSf || 550)));
  if (m.storage) { const st = uses.storage ||= { gsf: 0, units: 0 }, sp = { ...S.STORAGE, ...(prog.use === 'storage' ? prog.storage || {} : {}) }; st.rv = m.storage.rv || 0; st.eff = { climate: sp.climateEff, drive: sp.driveEff }; }
  const fut = sum(e => e.kind === 'green' && e.future), parkingSf = sum(e => e.kind === 'parking'), truckSf = sum(e => e.kind === 'truck');
  const improved = (m.footprint || 0) + m.paved + sum(e => ['court', 'pool', 'play', 'patio', 'trash', 'garage'].includes(e.kind)) + (m.pond || 0); // what's built, paved and dug
  const sw = els.length ? S.stormOf(plan) : { volume: 0, vault: 0 }, custom = !!(prog.custom && prog.custom.name);
  const amen = { court: sum(e => e.kind === 'court'), pool: sum(e => e.kind === 'pool'), play: sum(e => e.kind === 'play') };
  return { // devSf, what site prep covers: the improvements plus a third for their buffers, slopes and swales
    acres: m.acres, siteSf: m.siteSf, devSf: Math.min(Math.max(0, m.siteSf - fut - (m.keepout || 0)), improved * 4 / 3), uses, mix: (m.mix || []).map(t => ({ name: t.name, sf: t.sf, n: t.n })),
    stalls: m.stalls, deck: m.deck || 0, parkingSf, truckSf, pavedSf: Math.max(0, m.paved - parkingSf - truckSf), // (paving outside the lots and truck courts: drives, plazas, the canopy's lanes)
    detentionAcFt: sw.volume || 0, vaultAcFt: sw.vault || 0, amenities: amen,
    outdoorRentSf: custom ? sum(e => (e.kind === 'court' || e.kind === 'pool') && e.custom) : 0, // an AI-crafted type's courts or pool: what its operator pays for
    fuel: m.fuel || null, trucks: m.foodtrucks?.trucks || 0, custom: custom ? prog.custom.name : null
  };
}
// a scenario's compact numbers as metrics: one use, its building and leasable sf, units, parking, detention, acres.
// What a compact set doesn't say is estimated: ~300 sf of lot a space, drives a third of the lots, all of it detention
// in a pond unless vaultAcFt says otherwise, apartments split by the usual unit mix.
export function compactMetrics(c, use) {
  const u = S.USES[use] ? use : 'other', gsf = +c.buildingSf || +c.gsf || 0, units = +c.units || 0, acres = +c.acres || (+c.siteSf || 0) / 43560, stalls = Math.round(+c.parking || +c.stalls || 0);
  const U = { gsf, units: RES.includes(u) ? units : 0 };
  if (+c.leasableSf > 0) U.leasable = Math.min(gsf || Infinity, +c.leasableSf);
  if (u === 'hotel') U.keys = units || Math.max(1, Math.round(gsf / (S.USES.hotel.roomSf || 550)));
  if (u === 'storage') { const cl = c.climateSf ?? gsf * 2 / 3; U.climateGsf = cl; U.driveGsf = Math.max(0, gsf - cl); U.rv = +c.rv || 0; U.eff = { climate: S.STORAGE.climateEff, drive: S.STORAGE.driveEff }; }
  if (u === 'sfr') U.homes = { 2: units };
  const mix = u === 'multifamily' && units ? S.splitMix(units, c.mix || S.UNIT_MIX).map(t => ({ name: t.name, sf: t.sf, n: t.n })) : [];
  if (u === 'multifamily' && !U.leasable && mix.length) U.leasable = Math.min(gsf || Infinity, mix.reduce((s, t) => s + t.n * t.sf, 0));
  const parkingSf = stalls * 300, truckSf = u === 'industrial' ? gsf * 0.6 : 0, pavedSf = parkingSf / 3, det = c.detentionAcFt != null ? +c.detentionAcFt : acres * S.STORM.rate, vault = Math.min(det, +c.vaultAcFt || 0);
  const foot = gsf / Math.max(1, +c.floors || S.USES[u].floors || 1), pond = (det - vault) * 43560 / S.STORM.depth * 1.2, improved = foot + parkingSf + truckSf + pavedSf + pond; // (as metricsOf: what's built, paved and dug, and a third more)
  return { acres, siteSf: acres * 43560, devSf: Math.min(acres * 43560, improved * 4 / 3), uses: { [u]: U }, mix, stalls, deck: Math.round(+c.deck || 0), parkingSf, truckSf, pavedSf,
    detentionAcFt: det, vaultAcFt: vault, amenities: { court: 0, pool: 0, play: 0 }, outdoorRentSf: 0,
    fuel: u === 'fuel' ? { mpds: +c.pumps || 8, storeSf: gsf, canopySf: (+c.pumps || 8) * 600 } : null, trucks: +c.trucks || 0, custom: null };
}

// what the plan leases, by use, with the efficiencies in A: gross, usable, leasable (rentable) sf, units, keys. A
// scenario's own leasable sf (metrics.uses[k].leasable) holds unless `user` (the numbers someone set) sets an efficiency.
export function areaOf(M, A = {}, user = A) {
  const eff = { ...EFF, ...(A.eff || {}) }, load = { ...LOAD, ...(A.load || {}) }, ue = user?.eff || {}, out = { site: M.siteSf, acres: M.acres, devSf: M.devSf, stalls: M.stalls, uses: {}, mix: M.mix || [], units: 0, gsf: 0, nrsf: 0, keys: 0, fuel: M.fuel, trucks: M.trucks || 0 };
  for (const [k, u0] of Object.entries(M.uses || {})) {
    const u = out.uses[k] = { ...u0, gsf: u0.gsf || 0, units: u0.units || 0, nrsf: 0 }, g = u.gsf, e = Math.max(0, Math.min(1, +eff[k] || 0));
    if (k === 'multifamily') { const net = (M.mix || []).reduce((s, t) => s + t.n * t.sf, 0); u.nrsf = Math.min(g || Infinity, net || u0.leasable || g * 0.85); u.basis = 'units’ net sf (the unit mix)'; }
    else if (HOMES.includes(k)) { u.nrsf = g * (eff[k] ?? 1); u.basis = 'living area; homes rent whole'; }
    else if (k === 'storage') { const ce = Math.min(1, +(A.eff?.storageClimate ?? u0.eff?.climate ?? S.STORAGE.climateEff)), de = Math.min(1, +(A.eff?.storageDrive ?? u0.eff?.drive ?? S.STORAGE.driveEff));
      u.climateNrsf = (u0.climateGsf || 0) * ce; u.driveNrsf = (u0.driveGsf || 0) * de; u.nrsf = u.climateNrsf + u.driveNrsf; u.eff = { climate: ce, drive: de }; u.basis = 'net rentable sf of the units'; }
    else if (k === 'hotel') { u.keys = u0.keys || Math.max(1, Math.round(g / 550)); u.nrsf = 0; u.basis = u.keys + ' keys'; out.keys += u.keys; }
    else if (k === 'foodtrucks') { u.nrsf = u0.barSf || 0; u.basis = 'the bar (the pavilion and restrooms serve the park)'; }
    else if (k === 'amenity') { u.nrsf = 0; u.basis = 'not leased'; }
    else if (k === 'office' || k === 'medical') { const L = Math.max(1, +load[k] || 1); u.usable = g * e; u.nrsf = Math.min(g, u.usable * L); u.load = L; u.basis = Math.round(e * 100) + '% usable × ' + L.toFixed(2) + ' load factor'; }
    else { u.nrsf = g * e; u.basis = Math.round(e * 100) + '% of gross' + (NNN.includes(k) ? ', NNN' : ''); }
    if (u0.leasable != null && !['multifamily', 'storage', 'hotel'].includes(k) && ue[k] == null && ue.load == null) { u.nrsf = Math.min(g, u0.leasable); u.basis = 'the scenario’s leasable sf'; } // a scenario's own leasable figure, unless an efficiency was set
    if (u0.leasable != null && k === 'storage' && ue.storageClimate == null && ue.storageDrive == null && u.nrsf > 0) { const f = Math.min(g, u0.leasable) / u.nrsf; u.climateNrsf *= f; u.driveNrsf *= f; u.nrsf *= f; u.basis = 'the scenario’s rentable sf'; }
    u.nrsf = Math.max(0, Math.min(g, u.nrsf)); // leasable never exceeds gross
    u.eff = k === 'storage' ? u.eff : g ? u.nrsf / g : 0;
    out.gsf += g; out.nrsf += k === 'amenity' ? 0 : u.nrsf; out.units += RES.includes(k) ? u.units : 0;
  }
  return out;
}
// the plan as the pro forma reads it (kept for callers that pass a plan): areaOf(metricsOf(plan))
export function programOf(plan, A) { return areaOf(metricsOf(plan), A || {}); }

// months for each phase, from the size of the job
export function scheduleFor(P) {
  const u = P.uses, mf = u.multifamily?.units || 0, homes = (u.townhomes?.units || 0) + (u.duplex?.units || 0) + (u.sfr?.units || 0);
  const comm = COMM.reduce((s, k) => s + (k === 'fuel' ? 0 : u[k]?.gsf || 0), 0), ind = u.industrial?.gsf || 0, fuel = u.fuel?.gsf || 0; // (a gas station: about 8 months to build, open in a few)
  const pre = mf || homes ? 9 : 6;
  const build = Math.round(Math.max(mf ? Math.min(26, 12 + mf / 30) : 0, homes ? Math.min(30, 8 + homes / 6) : 0, comm - ind > 0 ? Math.min(16, 8 + (comm - ind) / 15000) : 0, ind ? Math.min(14, 7 + ind / 80000) : 0, fuel ? 8 : 0, 6));
  const lease = Math.round(Math.max(mf ? Math.max(6, mf / 20) : 0, homes ? Math.max(4, homes / 12) : 0, comm - ind > 0 ? 12 : 0, ind ? 9 : 0, u.storage?.gsf ? 30 : 0, P.trucks ? 6 : 0, fuel ? 4 : 0, 3)); // self storage fills over two to three years; a food truck park's stalls in about six months
  return { pre, build, lease };
}

// the main use: the biggest by floor area (amenities aside)
const mainOf = P => Object.keys(P.uses).filter(u => u !== 'amenity').sort((a, b) => P.uses[b].gsf - P.uses[a].gsf)[0] || 'multifamily';
// starting assumptions for a plan (land: the parcels' appraised value when known). over: the plan's own pf (a gas
// station's mode decides its cap rate)
export function defaults(plan, land = null) { return defaultsFor(metricsOf(plan), land, plan.pf); }
export function defaultsFor(M, land = null, over = {}) {
  const P = areaOf(M), uses = Object.keys(P.uses), main = mainOf(P);
  const cm = P.uses.sfr?.community, own = over?.fuel?.mode === 'owner', capOf = k => k === 'fuel' && own ? 8 : k === 'sfr' && cm ? COMMUNITY_PF.cap : CAP[k] || 6.5; // (a gas station run by the owner is an operating business: a higher cap than a ground lease)
  const noiW = k => k === 'multifamily' ? (P.uses[k].units || 0) * 11000 : RES.includes(k) ? (P.uses[k].units || 0) * 15000 : k === 'hotel' ? (P.uses[k].keys || 0) * 9000 : k === 'fuel' ? 200000 : k === 'storage' ? P.uses[k].nrsf * 9 : (P.uses[k].nrsf || 0) * (RENT_COMM[k] || 20);
  const capW = uses.filter(k => k !== 'amenity'), totW = capW.reduce((s, k) => s + noiW(k), 0) || 1, cap = capW.reduce((s, k) => s + capOf(k) * noiW(k), 0) / totW || 6.25;
  const vac = capW.reduce((s, k) => s + (k === 'sfr' && cm ? COMMUNITY_PF.vacancy : VACANCY[k] ?? 7) * noiW(k), 0) / totW;
  const cmHard = cm ? (cm.tinySf * COMMUNITY_PF.hard.tiny + cm.manufacturedSf * COMMUNITY_PF.hard.manufactured) / Math.max(1, cm.tinySf + cm.manufacturedSf) : null; // (a community's homes: factory-built, by the sf of each kind)
  const leased = uses.filter(k => NNN.includes(k));
  return {
    method: 'schedule', forSale: false,
    landPrice: land ?? Math.round(P.acres * (LAND_AC[main] ?? 175000) / 1000) * 1000, landPerAc: LAND_AC[main] ?? 175000, landClosingPct: 1.5, // closing: title, survey, legal, ~1–2%
    hard: Object.fromEntries(uses.filter(k => k !== 'storage').map(k => [k, k === 'sfr' && cm ? Math.round(cmHard) : HARD[k] ?? 150])), ...(P.uses.storage ? { storageHard: { ...HARD_STORAGE } } : {}),
    ...SITE, ...(cm ? { lotCost: COMMUNITY_PF.lotCost } : {}), amenityPsf: { ...SITE.amenityPsf },
    ti: Object.fromEntries(uses.filter(k => COMM.includes(k)).map(k => [k, TI[k]])), lcPct: LC_PCT,
    eff: Object.fromEntries(uses.filter(k => EFF[k] != null).map(k => [k, EFF[k]]).concat(P.uses.storage ? [['storageClimate', P.uses.storage.eff.climate], ['storageDrive', P.uses.storage.eff.drive]] : [])),
    load: Object.fromEntries(uses.filter(k => LOAD[k]).map(k => [k, LOAD[k]])),
    softPct: main === 'industrial' ? 8 : main === 'storage' ? 9 : 12, contPct: 5, feePct: 4, // soft costs % of hard + site (design and engineering ~6%, permits and impact fees, legal, insurance, taxes in construction, marketing: 10–15%; warehouses and storage, simpler buildings, 7–10%); contingency % of hard + site (5% at concept, 3–10%); developer fee % of costs before land and financing (3–5%)
    rents: Object.fromEntries((P.mix || []).map(t => [t.name, RENT_UNIT[t.name] ?? Math.round(t.sf * 1.75 / 5) * 5])), otherPerUnit: 75, // fees, pet rent, parking, utilities billed back: $50–100 a unit a month
    homeRent: { townhomes: P.uses.townhomes?.units ? townhomeRent(P.uses.townhomes.nrsf / P.uses.townhomes.units) : RENT_HOME.townhomes, duplex: P.uses.duplex?.units ? townhomeRent(P.uses.duplex.nrsf / P.uses.duplex.units) : RENT_HOME.duplex, sfr1: RENT_HOME.sfr[1], sfr2: RENT_HOME.sfr[2], sfr3: RENT_HOME.sfr[3], ...(cm ? { tiny: COMMUNITY_PF.rent.tiny, manufactured: COMMUNITY_PF.rent.manufactured } : {}) }, salePsf: { ...SALE_PSF }, absorption: 4, commissionPct: 6,
    commRent: Object.fromEntries(leased.map(k => [k, RENT_COMM[k]])), recoveryPct: 95, // the share of taxes, insurance and common-area costs NNN tenants pay back (the rest: caps, gross-ups, admin)
    ...(P.uses.storage ? { storageRent: { ...STORAGE_PF, ...(isPark(M.custom) ? RV_PARK : {}) } } : {}), ...(P.uses.hotel ? { hotel: { ...HOTEL_PF } } : {}), ...(M.outdoorRentSf ? { outdoorRent: 4 } : {}), // an AI-crafted type's courts or pool: ~$7,000 a court a year paid by the operator ($2–6 a sf)
    ...(P.uses.fuel ? { fuel: { ...FUEL_PF, groundRent: Math.max(100000, FUEL_PF.rentPerPump * (P.fuel?.mpds || 8)) } } : {}),
    ...(P.uses.foodtrucks || P.trucks ? { ft: { ...FT_PF } } : {}),
    vacancyPct: +vac.toFixed(1), creditPct: main === 'fuel' ? 0 : 1, // credit loss: bad debt, 0.5–1.5%
    opexPerUnit: 4600, opexPerHome: cm ? COMMUNITY_PF.opexPerHome : 3200, opexPsf: Object.fromEntries(uses.filter(k => OPEX_PSF[k] != null).map(k => [k, OPEX_PSF[k]])), // apartments $ a unit a year before taxes and management (payroll, repairs, turnover, utilities, insurance ~$900, admin, marketing: $4,200–5,500); a rented home (insurance, repairs, turnover, HOA: $2,600–4,000)
    reservesPerUnit: 250, reservesPsf: 0.2, // replacement reserves: $250–300 a unit, $0.15–0.30 a commercial sf
    taxPct: 2.5, taxBasisPct: 70, // property tax: county, city, school and a MUD ~2.3–3.0% in Harris / Fort Bend, ~2.0–2.5% in Waller; appraised at ~70% of the all-in cost
    mgmtPct: main === 'storage' ? 6 : main === 'sfr' && cm ? COMMUNITY_PF.mgmt : HOMES.includes(main) ? 5 : 3, // management fee % of collections: apartments and commercial 2.5–3.5, self storage 5–6, rented homes 5–8
    ltc: 60, rate: 7.0, loanFeePct: 1, refi: true, permRate: 6.0, amort: 30, ltv: 65, dscr: 1.25, // construction loan 55–65% of cost at SOFR + 3–3.5% (~7%); permanent loan ~6% (10-year Treasury + 1.75), 30-year amortization, the smaller of 65% of value and 1.25× coverage
    exitCap: +(cap + 0.25).toFixed(2), marketCap: +cap.toFixed(2), dispPct: 2, rentGrowth: main === 'multifamily' || RES.includes(main) ? 3 : 2.5, expGrowth: 3, hold: 5,
    sched: scheduleFor(P)
  };
}

const pmt = (r, n, pv) => r ? pv * r / (1 - (1 + r) ** -n) : pv / n;
const irr = cf => { let lo = -0.9999, hi = 10; const npv = r => cf.reduce((s, c, t) => s + c / (1 + r) ** t, 0); if (npv(lo) * npv(hi) > 0) return null; for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (npv(m) > 0) lo = m; else hi = m; } return (lo + hi) / 2; };
const f0 = v => Math.round(v).toLocaleString('en-US'), $2 = v => (+v).toLocaleString('en-US', { maximumFractionDigits: 2 });

// the stabilized year: revenue and expenses at today's rents, full occupancy less vacancy. tax: the year's property
// tax, and taxNNN the share of it on buildings leased triple net (billed back to their tenants)
function stabilized(P, A, tax, taxNNN) {
  const lines = [], add = (k, v, kind, use) => lines.push({ k, v, kind, use });
  let units = 0, homes = 0, nrsfComm = 0, recoverable = 0, storeOpex = 0, reserves = 0, hotelOpex = 0;
  if (P.uses.multifamily) for (const t of P.mix || []) { add(t.n + ' × ' + t.name + ' @ $' + f0(A.rents[t.name] ?? 0) + '/mo', t.n * (A.rents[t.name] ?? 0) * 12, 'rent', 'multifamily'); units += t.n; }
  for (const k of ['townhomes', 'duplex']) if (P.uses[k]?.units) { add(P.uses[k].units + ' ' + S.USES[k].label.toLowerCase() + ' @ $' + f0(A.homeRent[k]) + '/mo', P.uses[k].units * A.homeRent[k] * 12, 'rent', k); homes += P.uses[k].units; }
  if (P.uses.sfr?.community) for (const k of ['tiny', 'manufactured']) { const n = P.uses.sfr.community[k], r = A.homeRent?.[k] ?? COMMUNITY_PF.rent[k]; if (n) { add(n + ' × ' + (k === 'tiny' ? 'tiny homes' : 'manufactured homes') + ', home and pad @ $' + f0(r) + '/mo', n * r * 12, 'rent', 'sfr'); homes += n; } }
  if (P.uses.sfr) for (const [st, n] of Object.entries(P.uses.sfr.homes || {})) { add(n + ' × ' + st + '-story homes @ $' + f0(A.homeRent['sfr' + st]) + '/mo', n * A.homeRent['sfr' + st] * 12, 'rent', 'sfr'); homes += n; }
  for (const k of COMM) { const u = P.uses[k]; if (!u || !(u.nrsf || (k === 'hotel' && u.keys) || (k === 'storage' && u.rv))) continue;
    if (k === 'fuel') { const F = { ...FUEL_PF, ...(A.fuel || {}) }, fu = P.fuel || {}; nrsfComm += u.nrsf; // a gas station: ground rent, or the owner's margins less the store's costs
      if (F.mode !== 'owner') { add('Ground lease to a fuel retailer, NNN (' + (fu.mpds || 0) + ' pumps)', F.groundRent ?? Math.max(100000, F.rentPerPump * (fu.mpds || 8)), 'rent', k); continue; }
      const g = [[(fu.mpds || 0) + ' pumps × ' + f0(F.gallons) + ' gal a year @ ' + F.cents + '¢ a gallon', (fu.mpds || 0) * F.gallons * F.cents / 100], ['Inside sales ' + f0(fu.storeSf || 0) + ' sf × $' + F.insidePsf + ' @ ' + F.insideMargin + '% margin', (fu.storeSf || 0) * F.insidePsf * F.insideMargin / 100], ...(fu.washSf ? [['Car wash', F.washPerYear]] : [])];
      for (const [t, v] of g) add(t, v, 'rent', k); storeOpex += g.reduce((s, [, v]) => s + v, 0) * F.opexPct / 100; continue; }
    if (k === 'storage') { const R2 = { ...STORAGE_PF, ...(A.storageRent || {}) }; // the owner runs it: gross monthly rents, costs not billed back
      if (u.climateNrsf) add(f0(u.climateNrsf) + ' sf climate-controlled self storage @ $' + $2(R2.climate) + '/sf a month', u.climateNrsf * R2.climate * 12, 'rent', k);
      if (u.driveNrsf) add(f0(u.driveNrsf) + ' sf drive-up self storage @ $' + $2(R2.drive) + '/sf a month', u.driveNrsf * R2.drive * 12, 'rent', k);
      if (u.rv) add(u.rv + ' RV / boat spaces @ $' + f0(R2.rv) + '/mo', u.rv * R2.rv * 12, 'rent', k);
      nrsfComm += u.nrsf; storeOpex += u.nrsf * (A.opexPsf?.storage ?? OPEX_PSF.storage) + (u.rv || 0) * (R2.rvOpex ?? STORAGE_PF.rvOpex); reserves += u.nrsf * (A.reservesPsf ?? 0.2) * 0.75; continue; }
    if (k === 'hotel') { const H = { ...HOTEL_PF, ...(A.hotel || {}) }, rooms = u.keys * H.adr * H.occ / 100 * 365, rev = rooms * (1 + H.otherPct / 100); // the hotel's own operations: rooms and other revenue, its costs, fees and reserve
      add(u.keys + ' keys × $' + f0(H.adr) + ' ADR × ' + H.occ + '% occupied', rooms, 'hotel', k); if (H.otherPct) add('Other hotel revenue (' + H.otherPct + '% of rooms)', rooms * H.otherPct / 100, 'hotel', k);
      hotelOpex += rev * (H.opexPct + H.mgmtPct + H.ffePct) / 100; continue; }
    const rent = A.commRent?.[k] ?? RENT_COMM[k] ?? 0; if (!(rent > 0)) continue; // (a church built for its congregation: no rent, no operations)
    add(f0(u.nrsf) + ' sf ' + S.USES[k].label.toLowerCase() + ' @ $' + $2(rent) + '/sf NNN', u.nrsf * rent, 'rent', k); nrsfComm += u.nrsf;
    recoverable += u.nrsf * (A.opexPsf?.[k] ?? OPEX_PSF[k] ?? 5); reserves += u.nrsf * (A.reservesPsf ?? 0.2); }
  if (P.outdoorRentSf && A.outdoorRent && P.uses.other) add(f0(P.outdoorRentSf) + ' sf of courts / pool leased with the building @ $' + $2(A.outdoorRent) + '/sf', P.outdoorRentSf * A.outdoorRent, 'rent', 'other');
  let ftOpex = 0;
  if (P.trucks || P.uses.foodtrucks) { const ft = { ...FT_PF, ...(A.ft || {}) }, bar = P.uses.foodtrucks?.nrsf || 0; // a food truck park: stall rent, the bar, the park's own costs
    if (P.trucks) add(P.trucks + ' food truck stalls @ $' + f0(ft.stallRent) + '/mo', P.trucks * ft.stallRent * 12, 'rent', 'foodtrucks');
    if (bar) { if (ft.barMode === 'owner') add('Bar run by the owner: $' + ft.barSales + '/sf sales × ' + ft.barMargin + '% net', bar * ft.barSales * ft.barMargin / 100, 'other', 'foodtrucks'); else add(f0(bar) + ' sf bar leased @ $' + ft.barRent + '/sf NNN', bar * ft.barRent, 'rent', 'foodtrucks'); }
    ftOpex = P.trucks * ft.opexStall + ft.opexFixed; }
  if (units) add('Other income (fees, parking, utilities billed back)', units * A.otherPerUnit * 12, 'other', 'multifamily');
  const recTax = recoverable ? taxNNN : 0, rec = (recoverable + recTax) * A.recoveryPct / 100;
  if (rec) add('Expense recoveries (' + A.recoveryPct + '% of NNN taxes, insurance and common-area costs)', rec, 'rec');
  // vacancy and credit loss on everything but a hotel's revenue (its occupancy is in its own numbers)
  const gpr = lines.reduce((s, l) => s + l.v, 0), atRisk = lines.filter(l => l.kind !== 'hotel').reduce((s, l) => s + l.v, 0), loss = atRisk * (A.vacancyPct + A.creditPct) / 100, egi = gpr - loss;
  return { lines, gpr, loss, egi, units: units + homes, aptUnits: units, homes, nrsfComm, recoverable, recTax, storeOpex, ftOpex, reserves, hotelOpex };
}

// a deep-enough merge: nested objects (hard, rents, ti…) take the overrides' keys over the defaults'
const merge = (d, o) => { const out = { ...d }; for (const [k, v] of Object.entries(o || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && d[k] && typeof d[k] === 'object' ? { ...d[k], ...v } : v; return out; };

export function run(plan, A0) { return runM(metricsOf(plan), A0, plan.pf || {}); }

// the pro forma of any metrics: a drawn plan's (metricsOf) or a scenario's compact numbers (compactMetrics). use: the
// use a compact set is (ignored for full metrics); overrides: assumptions to change (anything defaultsFor returns)
export function proFormaOf(metrics, use, overrides = {}) {
  const M = metrics && metrics.uses ? metrics : compactMetrics(metrics || {}, use);
  return runM(M, overrides, overrides);
}

// A0: the assumptions (the defaults with any changes merged in, or only the changes); user: the numbers someone set
// (a plan's own pf), which the notes call theirs
function runM(M, A0, user) {
  const D = defaultsFor(M, null, { ...(user || {}), ...(A0 || {}) }), A = merge(D, A0), P = areaOf(M, A, user || {}), sch = { ...scheduleFor(P), ...(A0?.sched || {}) };
  if (A0?.commRent?.storage != null && !A0?.storageRent) A.storageRent = { ...STORAGE_PF, climate: A0.commRent.storage / 12, drive: A0.commRent.storage / 12 * 0.75 }; // (older plans: storage rent a sf a year)
  const own = P.uses.fuel && A.fuel?.mode === 'owner', ground = P.uses.fuel && !own && Object.keys(P.uses).every(k => k === 'fuel' || k === 'amenity'); // a gas station run by the owner, or a ground lease (the retailer builds, parks and pays the taxes)
  if (own && A0?.marketCap == null && A0?.exitCap == null && !Object.keys(P.uses).some(k => k !== 'fuel' && k !== 'amenity')) { A.marketCap = 8; A.exitCap = 8.25; } // (an operating business trades at a higher cap than a ground lease)
  // ---- budget ----
  const F = { ...FUEL_PF, ...(A.fuel || {}) }, equip = own && P.fuel ? (P.fuel.canopySf || 0) * F.canopyPsf + (P.fuel.mpds || 0) * F.pumpCost + (P.fuel.mpds ? F.tankCost : 0) : 0; // the owner's canopy, pumps and tanks
  const SH = { ...HARD_STORAGE, ...(A.storageHard || {}) };
  const hardOf = {}; for (const [k, u] of Object.entries(P.uses)) {
    if (k === 'fuel' && !own) { hardOf[k] = 0; continue; }
    if (k === 'storage') { hardOf[k] = A0?.hard?.storage != null ? u.gsf * A0.hard.storage : (u.climateGsf || 0) * SH.climate + (u.driveGsf || 0) * SH.drive + (u.officeGsf || 0) * SH.office; continue; } // (older plans: one blended storage rate)
    if (k === 'amenity' && u.pavilionSf) { hardOf[k] = (u.gsf - u.pavilionSf) * (A.hard[k] ?? HARD[k]) + u.pavilionSf * HARD_PAVILION; continue; }
    hardOf[k] = u.gsf * (A.hard[k] ?? HARD[k] ?? 150); }
  const hard = Object.values(hardOf).reduce((s, v) => s + v, 0) + equip, ffe = (P.uses.hotel?.keys || 0) * ({ ...HOTEL_PF, ...(A.hotel || {}) }).ffeKey; // a hotel's furniture, fixtures and equipment at opening
  const lots = (P.uses.sfr?.units || 0) + (P.uses.duplex?.units || 0) / 2 + (P.uses.townhomes?.units || 0) * 0.6; // homes: a finished lot (streets, utilities, detention) costs per lot
  const homeShare = P.gsf ? HOMES.reduce((s, k) => s + (P.uses[k]?.gsf || 0), 0) / P.gsf : 0, notHome = lots ? 1 - homeShare : 1; // (a finished lot's price holds its street and its share of the pond)
  const ftS = (P.trucks || 0) * ({ ...FT_PF, ...(A.ft || {}) }).stallCost, am = { ...SITE.amenityPsf, ...(A.amenityPsf || {}) }, amen = M.amenities || {};
  const site0 = { lots: lots * A.lotCost, prep: Math.max(0, (M.devSf ?? P.site) - lots * 7000) * A.sitePrepPsf * (lots ? 0.5 : 1) * (ground ? 0.5 : 1), // (a ground lease: the pad delivered graded with utilities; the retailer builds the rest)
    paving: ground ? 0 : ((M.pavedSf || 0) + (M.truckSf || 0) * 1.25) * A.pavingPsf * notHome, stalls: ground ? 0 : P.stalls * A.stallCost, deck: (M.deck || 0) * A.deckPerSpace,
    pond: Math.max(0, (M.detentionAcFt || 0) - (M.vaultAcFt || 0)) * A.pondPerAcFt * notHome, vault: (M.vaultAcFt || 0) * A.vaultPerAcFt, amenities: (amen.court || 0) * am.court + (amen.pool || 0) * am.pool + (amen.play || 0) * am.play, trucks: ftS };
  const site = Object.values(site0).reduce((s, v) => s + v, 0);
  const tiOf = k => COMM.includes(k) ? P.uses[k].nrsf * (A.ti[k] ?? 0) : 0, ti = Object.keys(P.uses).reduce((s, k) => s + tiOf(k), 0);
  const lc = Object.keys(P.uses).filter(k => NNN.includes(k)).reduce((s, k) => s + P.uses[k].nrsf * (A.commRent?.[k] ?? 0) * (LEASE_TERM[k] || 7), 0) * A.lcPct / 100; // leasing commissions on the first leases
  const land = A.landPrice * (1 + A.landClosingPct / 100), soft = (hard + ffe + site) * A.softPct / 100, cont = (hard + ffe + site) * A.contPct / 100;
  const pre = land + hard + ffe + site + ti + lc + soft + cont, fee = (pre - land) * A.feePct / 100, budget = pre + fee; // (the developer's fee on what's built, not on the land)
  const homes = (P.uses.townhomes?.units || 0) + (P.uses.duplex?.units || 0) + (P.uses.sfr?.units || 0), forSale = A.forSale && homes && !P.uses.multifamily && !COMM.some(k => P.uses[k]);
  // ---- operations ----
  const exempt = P.uses.church && !(A.commRent?.church > 0) ? (hardOf.church || 0) / Math.max(1, hard) : 0; // a church on its own land pays no property tax
  const tax = ground ? 0 : A.taxPct / 100 * budget * A.taxBasisPct / 100 * (1 - exempt); // (a ground lease is net: the tenant pays the taxes)
  const nnnHard = Object.keys(P.uses).filter(k => NNN.includes(k) && (A.commRent?.[k] ?? 0) > 0).reduce((s, k) => s + (hardOf[k] || 0), 0), taxNNN = tax * (hard ? nnnHard / hard : 0);
  const st = stabilized({ ...P, outdoorRentSf: M.outdoorRentSf || 0 }, A, tax, taxNNN);
  const opexRes = (st.aptUnits || 0) * (A.opexPerUnit + A.reservesPerUnit) + (st.homes || 0) * (A.opexPerHome + A.reservesPerUnit), opexComm = st.recoverable + (st.storeOpex || 0) + (st.ftOpex || 0) + (st.reserves || 0) + (st.hotelOpex || 0);
  const mgmt = st.lines.filter(l => l.kind !== 'hotel').reduce((s, l) => s + l.v, 0) * (1 - (A.vacancyPct + A.creditPct) / 100) * A.mgmtPct / 100; // (a hotel pays its own manager, in its costs)
  const opex = opexRes + opexComm + tax + mgmt, noi = st.egi - opex;
  // ---- the schedule, month by month ----
  const T0 = sch.pre, T1 = sch.pre + sch.build, T2 = T1 + sch.lease, T = forSale ? T1 + Math.ceil(homes / Math.max(1, A.absorption)) + 1 : T2 + Math.round(A.hold * 12);
  const cost = new Float64Array(T + 1), noiM = new Float64Array(T + 1), sales = new Float64Array(T + 1);
  cost[0] += land; const spread = (amt, a, b, curve) => { const n = Math.max(1, b - a), w = Array.from({ length: n }, (_, k) => curve ? Math.sin(Math.PI * (k + 0.5) / n) ** 2 : 1), ws = w.reduce((s, v) => s + v, 0); w.forEach((v, k) => { cost[Math.min(T, a + 1 + k)] += amt * v / ws; }); };
  spread(soft * 0.35, 0, Math.max(1, T0)); spread(soft * 0.65, T0, T1); spread(hard + site + cont, T0, T1, true); spread(ffe, T1 - 2, T1); spread(ti + lc, T1 - 2, T2); cost[T0] += fee / 2; cost[Math.min(T, T1)] += fee / 2;
  const g = t => (1 + A.rentGrowth / 100) ** Math.floor(Math.max(0, t - T1) / 12), ge = t => (1 + A.expGrowth / 100) ** Math.floor(Math.max(0, t - T1) / 12);
  if (forSale) { // homes close at the absorption pace once the first ones are built (about 5 months into construction)
    const liv = k => P.uses[k]?.units ? P.uses[k].nrsf / P.uses[k].units : 0; // each home's living area, from the plan (not a fixed size)
    const price = [...Object.entries(P.uses.sfr?.homes || {}).flatMap(([s2, n]) => Array(n).fill(S.HOME_TYPES[s2].sf * A.salePsf.sfr)), ...Array(P.uses.townhomes?.units || 0).fill(liv('townhomes') * A.salePsf.townhomes), ...Array(P.uses.duplex?.units || 0).fill(liv('duplex') * A.salePsf.duplex)];
    price.forEach((p, i) => { const t = Math.min(T, T0 + 5 + Math.floor(i / Math.max(1, A.absorption))); sales[t] += p * (1 - A.commissionPct / 100); });
  } else for (let t = T1 + 1; t <= T; t++) { const occ = Math.min(1, (t - T1) / Math.max(1, sch.lease)); noiM[t] = (st.egi * occ * g(t) - (opex - mgmt) * ge(t) - mgmt * occ * g(t)) / 12; }
  // funding: equity first, then the construction loan (interest added to it); refinance at stabilization; sale at the end
  const ltc = A.ltc / 100, eqNeed = budget * (1 - ltc), r = A.rate / 1200, eq = new Float64Array(T + 1), lev = new Float64Array(T + 1), unlev = new Float64Array(T + 1);
  let eqIn = 0, loan = 0, interest = 0, loanFees = 0, peakLoan = 0, perm = 0, permPmt = 0, refiOut = 0, debtService = 0;
  for (let t = 0; t <= T; t++) {
    if (loan > 0 && (forSale || t <= T2) && !perm) { const i = loan * r; interest += i; loan += i; }
    let need = cost[t] - (t > T1 && !perm ? noiM[t] : 0), cash = 0; // lease-up: income pays what's due, a shortfall is funded like a cost
    if (need > 0) { const e = Math.min(need, Math.max(0, eqNeed - eqIn)); eqIn += e; eq[t] += e; need -= e; if (need > 0) { if (!loan) { loanFees = budget * ltc * A.loanFeePct / 100; need += loanFees; } loan += need; } }
    else cash -= need;
    if (forSale && sales[t]) { const pay = Math.min(loan, sales[t]); loan -= pay; cash += sales[t] - pay; }
    if (!forSale && t === T2) { // permanent loan: the smaller of the value test and the coverage test
      const fwd = noi * g(T2 + 1), byLtv = fwd / (A.marketCap / 100) * A.ltv / 100, byDscr = (fwd / A.dscr) / (12 * pmt(A.permRate / 1200, A.amort * 12, 1));
      perm = A.refi ? Math.max(0, Math.min(byLtv, byDscr)) : loan; permPmt = pmt(A.permRate / 1200, A.amort * 12, perm); refiOut = perm - loan; cash += refiOut; loan = perm;
    }
    if (perm && t > T2) { const intr = loan * A.permRate / 1200; loan -= permPmt - intr; debtService += permPmt; cash += noiM[t] - permPmt; }
    peakLoan = Math.max(peakLoan, loan);
    unlev[t] = -cost[t] + noiM[t] + sales[t];
    lev[t] = cash - eq[t];
  }
  let price = 0, dispNet = 0, payoff = 0;
  if (!forSale) { const fwd = noi * g(T + 12), val = fwd / (A.exitCap / 100); price = val; dispNet = val * (1 - A.dispPct / 100); payoff = loan; unlev[T] += dispNet; lev[T] += dispNet - payoff; }
  else { payoff = loan; lev[T] -= loan; }
  const toAnnual = m => m == null ? null : (1 + m) ** 12 - 1, uIrr = toAnnual(irr(Array.from(unlev))), lIrr = toAnnual(irr(Array.from(lev)));
  const totalCost = budget + interest + loanFees, distrib = Array.from(lev).reduce((s, v) => s + Math.max(0, v), 0), contrib = Array.from(lev).reduce((s, v) => s + Math.max(0, -v), 0);
  const annual = []; for (let y = 0; y * 12 <= T; y++) { const a = y * 12, b = Math.min(T, a + 11); let c = 0, n = 0, l = 0; for (let t = a; t <= b; t++) { c += cost[t]; n += noiM[t] + sales[t]; l += lev[t]; } annual.push({ year: y + 1, cost: c, noi: n, levered: l }); }
  // (coverage on the first year after stabilizing: the NOI the permanent loan is sized on)
  const income = st.gpr > 0, sum = forSale ? null : { yoc: income ? noi / totalCost : null, spread: income ? noi / totalCost - A.marketCap / 100 : null, value: income ? noi / (A.marketCap / 100) : null, dscr: permPmt ? noi * g(T2 + 1) / (permPmt * 12) : null, coc: permPmt ? (noi - permPmt * 12) / Math.max(1, contrib) : null };
  const area = { gross: P.gsf, leasable: P.nrsf, units: P.units, keys: P.keys, byUse: Object.fromEntries(Object.entries(P.uses).map(([k, u]) => [k, { gross: u.gsf, leasable: u.nrsf, usable: u.usable ?? null, load: u.load ?? null, eff: u.eff, units: u.units || 0, keys: u.keys || 0, basis: u.basis }])) };
  const R = { A, P, M, area, sched: { ...sch, toStabilize: T2, total: T, sale: T }, budget: { land, hard, ffe, site, siteParts: site0, storm: site0.vault, vaultAcFt: M.vaultAcFt || 0, pondAcFt: Math.max(0, (M.detentionAcFt || 0) - (M.vaultAcFt || 0)), deck: site0.deck, ti, lc, soft, cont, fee, budget, interest, loanFees, total: totalCost },
    sources: { equity: contrib, loanPeak: peakLoan, ltc: peakLoan / totalCost }, ops: { ...st, tax, taxNNN: st.recTax, opexRes, opexComm, mgmt, opex, noi },
    exit: { price, dispNet, payoff, perm, refiOut, sales: Array.from(sales).reduce((s, v) => s + v, 0) }, returns: { ...sum, unlevIrr: uIrr, levIrr: lIrr, multiple: contrib ? distrib / contrib : null, profit: distrib - contrib, peakEquity: contrib, margin: forSale ? (Array.from(sales).reduce((s, v) => s + v, 0) - totalCost) / Math.max(1, Array.from(sales).reduce((s, v) => s + v, 0)) : null },
    forSale, annual, monthly: { cost: Array.from(cost), noi: Array.from(noiM), levered: Array.from(lev), unlevered: Array.from(unlev) }, simple: simple(simpleInputs(P, A, budget, { land, hard: hard + ffe + site, ti: ti + lc, soft, cont, fee }, st, opex)),
    basis: { label: BASIS.market.label, tag: BASIS.market.tag, disclaimer: DISCLAIMER, inputs: basisOf(A, user), plan: BASIS.plan.label } };
  R.warnings = checks(R);
  return R;
}

// ---------- the TestFit method (annual, no schedule) ----------
// inputs: { nrsf, gsf, land, hard, ti, soft, contPct (of hard), finFee, rentPsf, recoveryPct, otherPsf, vacancyPct, opexPsf, ltc,
// rate, amort, exitCap, marketCap, dispPct, rentGrowth, expGrowth, hold }
export function simple(I) {
  const cont = I.hard * I.contPct / 100, cost = I.land + I.hard + I.ti + I.soft + cont + I.finFee, debt = cost * I.ltc / 100, equity = cost - debt;
  const opex = I.nrsf * I.opexPsf, base = I.nrsf * I.rentPsf, rec = opex * I.recoveryPct / 100, other = I.nrsf * I.otherPsf, gpr = base + rec + other, vac = gpr * I.vacancyPct / 100, egi = gpr - vac, noi = egi - opex;
  const ds = pmt(I.rate / 100, I.amort, debt), years = [];
  for (let y = 1; y <= I.hold; y++) { const b = base * (1 + I.rentGrowth / 100) ** y, r = rec * (1 + I.expGrowth / 100) ** y, o = other * (1 + I.rentGrowth / 100) ** y, g2 = b + r + o, v = g2 * I.vacancyPct / 100, x = opex * (1 + I.expGrowth / 100) ** y; years.push({ year: y, base: b, rec: r, other: o, gpr: g2, vac: v, egi: g2 - v, opex: x, noi: g2 - v - x, ds, cf: g2 - v - x - ds }); }
  const last = years[years.length - 1], fwd = last.noi * (1 + I.rentGrowth / 100), sale = fwd / (I.exitCap / 100), disp = sale * I.dispPct / 100, net = sale - disp;
  const r = I.rate / 100, bal = I.amort > I.hold ? ds * (1 - (1 + r) ** -(I.amort - I.hold)) / r : 0, toEq = net - bal, ops = years.reduce((s, y) => s + y.cf, 0);
  const unlev = [-cost, ...years.map((y, i) => y.noi + (i === years.length - 1 ? net : 0))], lev = [-equity, ...years.map((y, i) => y.cf + (i === years.length - 1 ? toEq : 0))];
  return { I, cost, debt, equity, cont, gpr, rec, base, other, vac, egi, opex, noi, ds, years, fwd, sale, disp, net, bal, toEq, ops, profit: ops + toEq - equity, multiple: (ops + toEq) / equity,
    yoc: noi / cost, spread: noi / cost - I.marketCap / 100, value: noi / (I.marketCap / 100), dscr: noi / ds, coc: (noi - ds) / equity, unlevIrr: irr(unlev), levIrr: irr(lev) };
}
// the same plan through the TestFit method: rent per leasable sf from the plan's own rents (a hotel's rooms count as rent)
function simpleInputs(P, A, budget, b, st, opex) {
  const nrsf = Math.max(1, P.nrsf || P.gsf), rentNet = st.lines.filter(l => l.kind === 'rent' || l.kind === 'hotel').reduce((s, l) => s + l.v, 0), other = st.lines.filter(l => l.kind === 'other').reduce((s, l) => s + l.v, 0);
  const recBase = st.recoverable + (st.recTax || 0);
  return { nrsf, gsf: P.gsf, land: b.land, hard: b.hard, ti: b.ti, soft: b.soft, contPct: A.contPct, finFee: b.fee, rentPsf: rentNet / nrsf, recoveryPct: recBase ? A.recoveryPct * recBase / Math.max(1, opex) : 0, otherPsf: other / nrsf,
    vacancyPct: A.vacancyPct + A.creditPct, opexPsf: opex / nrsf, ltc: A.ltc, rate: A.permRate, amort: Math.min(A.amort, 25), exitCap: A.exitCap, marketCap: A.marketCap, dispPct: A.dispPct, rentGrowth: A.rentGrowth, expGrowth: A.expGrowth, hold: A.hold };
}

// ---------- sanity ranges and notes ----------
// The usual range of each input here, by use where it differs: a number outside it is allowed (it may be right for
// this site) but gets a calm note. Units say how to write the number: psf ($ / sf), nnn ($ / sf NNN), mo ($ / month),
// pct (%), usd ($), psfmo ($ / sf a month), x (a ratio).
export const RANGES = {
  'hard.multifamily': [100, 150, 'psf'], 'hard.townhomes': [95, 150, 'psf'], 'hard.duplex': [90, 145, 'psf'], 'hard.sfr': [80, 135, 'psf'], 'hard.retail': [90, 150, 'psf'], 'hard.restaurant': [140, 250, 'psf'], 'hard.office': [140, 240, 'psf'],
  'hard.medical': [170, 290, 'psf'], 'hard.hotel': [140, 240, 'psf'], 'hard.church': [120, 260, 'psf'], 'hard.industrial': [50, 95, 'psf'], 'hard.foodtrucks': [90, 260, 'psf'], 'hard.fuel': [200, 375, 'psf'], 'hard.amenity': [120, 325, 'psf'], 'hard.other': [90, 260, 'psf'],
  'storageHard.climate': [55, 100, 'psf'], 'storageHard.drive': [28, 60, 'psf'],
  'commRent.retail': [18, 35, 'nnn'], 'commRent.restaurant': [25, 50, 'nnn'], 'commRent.office': [16, 30, 'nnn'], 'commRent.medical': [24, 42, 'nnn'], 'commRent.industrial': [5.5, 13, 'nnn'], 'commRent.church': [0, 22, 'nnn'], 'commRent.other': [12, 35, 'nnn'],
  'storageRent.climate': [0.85, 1.75, 'psfmo'], 'storageRent.drive': [0.6, 1.3, 'psfmo'], 'storageRent.rv': [75, 200, 'mo'],
  'rents.Studio': [900, 1500, 'mo'], 'rents.1 BR': [1050, 1800, 'mo'], 'rents.2 BR': [1350, 2300, 'mo'], 'rents.3 BR': [1650, 2800, 'mo'],
  'homeRent.townhomes': [1900, 3400, 'mo'], 'homeRent.duplex': [1400, 2600, 'mo'], 'homeRent.sfr1': [1600, 2900, 'mo'], 'homeRent.sfr2': [1800, 3200, 'mo'], 'homeRent.sfr3': [1900, 3600, 'mo'], 'homeRent.tiny': [700, 1600, 'mo'], 'homeRent.manufactured': [900, 1900, 'mo'], 'salePsf.sfr': [125, 220, 'psf'],
  'hotel.adr': [95, 200, 'usd'], 'hotel.occ': [55, 80, 'pct'], 'hotel.opexPct': [52, 70, 'pct'], 'fuel.groundRent': [100000, 300000, 'usd'],
  'eff.retail': [0.92, 1, 'share'], 'eff.restaurant': [0.92, 1, 'share'], 'eff.office': [0.78, 0.9, 'share'], 'eff.medical': [0.78, 0.9, 'share'], 'eff.storageClimate': [0.65, 0.82, 'share'], 'eff.storageDrive': [0.85, 0.97, 'share'], 'eff.other': [0.85, 1, 'share'], 'eff.industrial': [0.95, 1, 'share'],
  'load.office': [1.08, 1.2, 'x'], 'load.medical': [1.1, 1.22, 'x'],
  'ti.retail': [15, 60, 'psf'], 'ti.restaurant': [30, 120, 'psf'], 'ti.office': [35, 100, 'psf'], 'ti.medical': [50, 140, 'psf'], 'ti.industrial': [2, 10, 'psf'],
  sitePrepPsf: [1.5, 5, 'psf'], pavingPsf: [5.5, 10, 'psf'], stallCost: [1800, 4500, 'usd'], deckPerSpace: [18000, 40000, 'usd'], pondPerAcFt: [15000, 60000, 'usd'], vaultPerAcFt: [250000, 650000, 'usd'], lotCost: [40000, 90000, 'usd'],
  softPct: [8, 20, 'pct'], contPct: [3, 10, 'pct'], feePct: [2, 6, 'pct'], lcPct: [3, 7, 'pct'], vacancyPct: [3, 15, 'pct'], creditPct: [0, 3, 'pct'], opexPerUnit: [3800, 6500, 'usd'], opexPerHome: [2200, 4500, 'usd'], taxPct: [1.8, 3.2, 'pct'], taxBasisPct: [55, 100, 'pct'], mgmtPct: [2, 8, 'pct'], recoveryPct: [80, 100, 'pct'],
  ltc: [45, 75, 'pct'], rate: [5.5, 10, 'pct'], permRate: [4.5, 8, 'pct'], marketCap: [4.5, 9, 'pct'], exitCap: [4.5, 9.5, 'pct'], rentGrowth: [0, 5, 'pct'], expGrowth: [1, 5, 'pct'], landPerAc: [40000, 1500000, 'usd']
};
const NAMES = { sitePrepPsf: 'Site prep', pavingPsf: 'Paving', stallCost: 'Parking a space', deckPerSpace: 'Garage parking a space', pondPerAcFt: 'Detention pond', vaultPerAcFt: 'Underground storage', lotCost: 'Finished lot', softPct: 'Soft costs', contPct: 'Contingency', feePct: 'Developer fee', lcPct: 'Leasing commissions',
  vacancyPct: 'Vacancy', creditPct: 'Credit loss', opexPerUnit: 'Apartment operating costs', opexPerHome: 'Home operating costs', taxPct: 'Property tax rate', taxBasisPct: 'Taxable share of cost', mgmtPct: 'Management fee', recoveryPct: 'Expense recoveries', ltc: 'Loan to cost', rate: 'Construction rate', permRate: 'Permanent rate',
  marketCap: 'Market cap rate', exitCap: 'Exit cap rate', rentGrowth: 'Rent growth', expGrowth: 'Expense growth', landPerAc: 'Land' };
const useName = k => S.USES[k]?.label || k;
export function nameOf(key) {
  const [a, b] = key.split('.');
  if (!b) return NAMES[a] || a;
  if (a === 'hard') return useName(b) + ' hard cost'; if (a === 'commRent') return useName(b) + ' rent'; if (a === 'ti') return useName(b) + ' TI'; if (a === 'rents') return b + ' rent'; if (a === 'load') return useName(b) + ' load factor';
  if (a === 'eff') return b === 'storageClimate' ? 'Climate-controlled rentable share' : b === 'storageDrive' ? 'Drive-up rentable share' : useName(b) + (b === 'office' || b === 'medical' ? ' usable share' : ' leasable share');
  if (a === 'storageHard') return (b === 'climate' ? 'Climate-controlled' : 'Drive-up') + ' hard cost'; if (a === 'storageRent') return b === 'rv' ? 'RV / boat space rent' : (b === 'climate' ? 'Climate-controlled' : 'Drive-up') + ' rent';
  if (a === 'homeRent') return b === 'townhomes' ? 'Townhome rent' : b === 'duplex' ? 'Duplex rent' : b === 'tiny' ? 'Tiny home rent (home and pad)' : b === 'manufactured' ? 'Manufactured home rent (home and pad)' : b.slice(3) + '-story home rent'; if (a === 'salePsf') return 'Home price';
  if (a === 'hotel') return { adr: 'Hotel ADR', occ: 'Hotel occupancy', opexPct: 'Hotel operating costs' }[b] || 'Hotel ' + b; if (a === 'fuel') return b === 'groundRent' ? 'Ground rent' : 'Fuel ' + b;
  return key;
}
const fmtV = (v, u) => u === 'pct' ? $2(v) + '%' : u === 'share' ? Math.round(v * 100) + '%' : u === 'x' ? (+v).toFixed(2) : u === 'nnn' ? '$' + $2(v) + '/sf NNN' : u === 'psf' ? '$' + $2(v) + '/sf' : u === 'psfmo' ? '$' + (+v).toFixed(2) + '/sf a month' : u === 'mo' ? '$' + f0(v) + '/mo' : '$' + f0(v);
const fmtR = (lo, hi, u) => u === 'pct' ? $2(lo) + '–' + $2(hi) + '%' : u === 'share' ? Math.round(lo * 100) + '–' + Math.round(hi * 100) + '%' : u === 'x' ? lo.toFixed(2) + '–' + hi.toFixed(2) : u === 'psfmo' ? '$' + lo.toFixed(2) + '–' + hi.toFixed(2) : '$' + (u === 'nnn' || u === 'psf' ? $2(lo) + '–' + $2(hi) : f0(lo) + '–' + f0(hi));
const get = (A, key) => { const [a, b] = key.split('.'); return b == null ? A[a] : A[a]?.[b]; };
// one input against its usual range: null when it's inside (or not one we keep a range for)
export function checkInput(key, v) { return checkRange(key, v, RANGES[key]); }
function checkRange(key, v, r) {
  if (!r || v == null || v === '' || !isFinite(+v)) return null; const [lo, hi, u] = r; v = +v;
  if (key === 'commRent.church' && v === 0) return null; // (no rent: a church built for its congregation)
  if (v >= lo && v <= hi) return null;
  return { key, level: 'note', value: v, range: [lo, hi], text: nameOf(key) + ' ' + fmtV(v, u) + ' is ' + (v > hi ? 'above' : 'below') + ' the usual ' + fmtR(lo, hi, u) + ' here; check it.' };
}
// every note for a run: inputs outside their usual range, and outputs that need a second look
export function checks(R) {
  const A = R.A, out = [], uses = Object.keys(R.P.uses), keys = Object.keys(RANGES).filter(k => { const [a, b] = k.split('.'); if (!b) return true; if (['hard', 'commRent', 'ti', 'eff', 'load'].includes(a)) return uses.includes(b) || (a === 'eff' && /^storage/.test(b) && uses.includes('storage')); if (a === 'rents') return A.rents?.[b] != null; if (a === 'storageHard' || a === 'storageRent') return uses.includes('storage') && !(b === 'rv' && !R.P.uses.storage?.rv); if (a === 'homeRent') return b === 'townhomes' ? uses.includes('townhomes') : b === 'duplex' ? uses.includes('duplex') : b === 'tiny' || b === 'manufactured' ? !!R.P.uses.sfr?.community?.[b] : !!R.P.uses.sfr?.homes?.[b.slice(3)]; if (a === 'salePsf') return R.forSale; if (a === 'hotel') return uses.includes('hotel'); if (a === 'fuel') return uses.includes('fuel') && A.fuel?.mode !== 'owner'; return true; });
  for (const k of keys) { if (k === 'landPerAc') continue; if (k === 'lotCost' && !uses.some(u => HOMES.includes(u))) continue; if (k === 'deckPerSpace' && !R.M?.deck) continue; if ((k === 'vaultPerAcFt') && !R.M?.vaultAcFt) continue; if (k === 'pondPerAcFt' && !(R.budget.pondAcFt > 0)) continue;
    if (['opexPerUnit'].includes(k) && !uses.includes('multifamily')) continue; if (k === 'opexPerHome' && !uses.some(u => HOMES.includes(u))) continue; if ((k === 'lcPct' || k === 'recoveryPct') && !uses.some(u => NNN.includes(u))) continue; if ((k === 'vacancyPct' || k === 'creditPct') && uses.every(u => ['fuel', 'hotel', 'amenity'].includes(u))) continue; // (a ground lease to one tenant, or a hotel's own occupancy)
    const n = k === 'storageRent.rv' && isPark(R.M?.custom) ? checkRange(k, get(A, k), [350, 800, 'mo']) : checkInput(k, get(A, k)); if (n) out.push(n); }
  if (R.P.acres > 0 && A.landPrice > 0) { const n = checkInput('landPerAc', A.landPrice / R.P.acres); if (n) out.push({ ...n, key: 'landPrice', text: 'Land at ' + fmtV(n.value, 'usd') + ' an acre is ' + (n.value > n.range[1] ? 'above' : 'below') + ' the usual ' + fmtR(...n.range, 'usd') + ' here; check it.' }); }
  if (!R.forSale) {
    const y = R.returns?.yoc, pc = v => (v * 100).toFixed(2) + '%';
    if (y != null && isFinite(y) && y < 0.05) out.push({ key: 'yoc', level: 'flag', value: y, text: 'Yield on cost ' + pc(y) + ' is under 5%: thin for new building here; check the rents and costs.' });
    if (y != null && isFinite(y) && y > 0.12) out.push({ key: 'yoc', level: 'flag', value: y, text: 'Yield on cost ' + pc(y) + ' is over 12%: unusually high for new building; check the rents, costs and land price.' });
    for (const k of ['marketCap', 'exitCap']) if (A[k] < 4.5 || A[k] > 9) out.push({ key: k, level: 'flag', value: A[k], text: nameOf(k) + ' ' + $2(A[k]) + '% is outside the usual 4.5–9% here; check it.' });
    const sp = R.returns?.spread; if (sp != null && isFinite(sp) && sp < 0) out.push({ key: 'spread', level: 'flag', value: sp, text: 'Negative development spread: the ' + pc(y) + ' yield on cost is under the ' + $2(A.marketCap) + '% market cap rate, so on these numbers it would be worth less than it costs to build.' });
    const d = R.returns?.dscr; if (d != null && isFinite(d) && d < 1.2) out.push({ key: 'dscr', level: 'flag', value: d, text: 'Debt coverage ' + d.toFixed(2) + '× is under 1.2×: a lender would size the permanent loan down or want more equity.' });
  }
  return out;
}
// where each assumption comes from: the market defaults, or a number someone set (user: a plan's pf, a scenario's
// overrides). 'market' and 'user' are keys of BASIS.
function basisOf(A, user) {
  const out = {}; for (const [k, v] of Object.entries(A)) { if (k === 'sched' || k === 'method') continue; if (v && typeof v === 'object' && !Array.isArray(v)) { for (const b of Object.keys(v)) out[k + '.' + b] = user?.[k]?.[b] != null ? 'user' : 'market'; } else out[k] = user?.[k] != null ? 'user' : 'market'; }
  return out;
}

// the few numbers to set scenarios side by side: total cost, NOI, yield on cost, value, profit (value less cost), the
// area basis and the notes; every one a market assumption, not verified
export function proFormaSummary(R) {
  if (!R) return null;
  const r = R.returns || {}, cost = R.budget?.total ?? 0, value = R.forSale ? R.exit?.sales ?? null : r.value ?? null;
  return { totalCost: Math.round(cost), noi: R.forSale ? null : Math.round(R.ops?.noi ?? 0), yieldOnCost: R.forSale ? null : r.yoc ?? null, value: value == null ? null : Math.round(value), profit: value == null ? null : Math.round(value - cost),
    marketCap: R.A?.marketCap ?? null, spread: r.spread ?? null, levIrr: r.levIrr ?? null, grossSf: Math.round(R.area?.gross || 0), leasableSf: Math.round(R.area?.leasable || 0), units: R.area?.units || 0, keys: R.area?.keys || 0, forSale: !!R.forSale,
    warnings: (R.warnings || []).map(w => w.text), basis: BASIS.market.label, tag: BASIS.market.tag, disclaimer: DISCLAIMER };
}

// ---------- the workbook: assumptions, the one-page method with live formulas, and the schedule model ----------
// Sheets as arrays of rows; a cell is a value or { f: 'formula' } (SheetJS reads both). The one-page sheet is formula-
// driven so it can be changed in Excel; the schedule sheet holds this app's monthly figures with an IRR formula.
export function workbook(R, title = 'Site plan') {
  const I = R.simple.I, A = R.A, col = n => String.fromCharCode(65 + n);
  const assumptions = [['PRO FORMA ASSUMPTIONS — ' + title], [BASIS.market.label + '. ' + DISCLAIMER], ['Input', 'Value', 'Unit'],
    ['Net rentable sf (NRSF)', Math.round(I.nrsf), 'sf'], ['Gross sf (GSF)', Math.round(I.gsf), 'sf'], ['Land (with closing)', Math.round(I.land), '$'], ['Hard costs (with site work)', Math.round(I.hard), '$'], ['Tenant improvements', Math.round(I.ti), '$'],
    ['Soft costs', Math.round(I.soft), '$'], ['Hard cost contingency', I.contPct / 100, '% of hard'], ['Developer fee', Math.round(I.finFee), '$'], ['Base rent', +I.rentPsf.toFixed(2), '$/NRSF/yr'], ['Expense recoveries', I.recoveryPct / 100, '% of opex'],
    ['Other income', +I.otherPsf.toFixed(2), '$/NRSF/yr'], ['Vacancy & credit loss', I.vacancyPct / 100, '% of GPR'], ['Operating expenses', +I.opexPsf.toFixed(2), '$/NRSF/yr'], ['Loan-to-cost', I.ltc / 100, ''], ['Loan rate', I.rate / 100, ''],
    ['Amortization', I.amort, 'years'], ['Exit cap rate', I.exitCap / 100, ''], ['Market cap rate', I.marketCap / 100, ''], ['Disposition costs', I.dispPct / 100, ''], ['Rent growth', I.rentGrowth / 100, '/yr'], ['Expense growth', I.expGrowth / 100, '/yr'], ['Hold', I.hold, 'years']];
  const a = name => { const i = assumptions.findIndex(r => r[0] === name); return 'Assumptions!$B$' + (i + 1); };
  const yc = y => col(1 + y); // B = stabilized, C.. = years
  const one = [['DEVELOPMENT PRO FORMA — ONE PAGE (TestFit method: annual, no construction period)'], [],
    ['Total project cost', { f: a('Land (with closing)') + '+' + a('Hard costs (with site work)') + '+' + a('Tenant improvements') + '+' + a('Soft costs') + '+' + a('Hard costs (with site work)') + '*' + a('Hard cost contingency') + '+' + a('Developer fee') }],
    ['Senior debt', { f: 'B3*' + a('Loan-to-cost') }], ['Equity', { f: 'B3-B4' }], ['Annual debt service', { f: '-PMT(' + a('Loan rate') + ',' + a('Amortization') + ',B4)' }], [],
    ['', 'Stabilized', ...Array.from({ length: I.hold }, (_, i) => 'Year ' + (i + 1))],
    ['Base rent', { f: a('Net rentable sf (NRSF)') + '*' + a('Base rent') }, ...Array.from({ length: I.hold }, (_, i) => ({ f: '$B$9*(1+' + a('Rent growth') + ')^' + (i + 1) }))],
    ['Operating expenses', { f: a('Net rentable sf (NRSF)') + '*' + a('Operating expenses') }, ...Array.from({ length: I.hold }, (_, i) => ({ f: '$B$10*(1+' + a('Expense growth') + ')^' + (i + 1) }))],
    ['Expense recoveries', ...Array.from({ length: I.hold + 1 }, (_, i) => ({ f: yc(i) + '10*' + a('Expense recoveries') }))],
    ['Other income', { f: a('Net rentable sf (NRSF)') + '*' + a('Other income') }, ...Array.from({ length: I.hold }, (_, i) => ({ f: '$B$12*(1+' + a('Rent growth') + ')^' + (i + 1) }))],
    ['Gross potential revenue', ...Array.from({ length: I.hold + 1 }, (_, i) => ({ f: yc(i) + '9+' + yc(i) + '11+' + yc(i) + '12' }))],
    ['Vacancy & credit loss', ...Array.from({ length: I.hold + 1 }, (_, i) => ({ f: '-' + yc(i) + '13*' + a('Vacancy & credit loss') }))],
    ['Effective gross income', ...Array.from({ length: I.hold + 1 }, (_, i) => ({ f: yc(i) + '13+' + yc(i) + '14' }))],
    ['Net operating income', ...Array.from({ length: I.hold + 1 }, (_, i) => ({ f: yc(i) + '15-' + yc(i) + '10' }))],
    ['Debt service', ...Array.from({ length: I.hold + 1 }, () => ({ f: '-$B$6' }))],
    ['Cash flow before tax', ...Array.from({ length: I.hold + 1 }, (_, i) => ({ f: yc(i) + '16+' + yc(i) + '17' }))], [],
    ['Forward NOI (year ' + (I.hold + 1) + ')', { f: yc(I.hold) + '16*(1+' + a('Rent growth') + ')' }], ['Gross sale price', { f: 'B20/' + a('Exit cap rate') }], ['Disposition costs', { f: '-B21*' + a('Disposition costs') }],
    ['Loan payoff', { f: '-PV(' + a('Loan rate') + ',' + a('Amortization') + '-' + a('Hold') + ',-B6)' }], ['Net proceeds to equity', { f: 'B21+B22+B23' }], [],
    ['Yield on cost', { f: 'B16/B3' }], ['Development spread', { f: 'B26-' + a('Market cap rate') }], ['Stabilized value', { f: 'B16/' + a('Market cap rate') }], ['DSCR', { f: 'B16/B6' }], ['Cash-on-cash', { f: 'B18/B5' }],
    ['Unlevered cash flows', { f: '-B3' }, ...Array.from({ length: I.hold }, (_, i) => ({ f: yc(i + 1) + '16' + (i === I.hold - 1 ? '+B21+B22' : '') }))],
    ['Levered cash flows', { f: '-B5' }, ...Array.from({ length: I.hold }, (_, i) => ({ f: yc(i + 1) + '18' + (i === I.hold - 1 ? '+B24' : '') }))],
    ['Unlevered IRR', { f: 'IRR(B31:' + yc(I.hold) + '31)' }], ['Levered IRR', { f: 'IRR(B32:' + yc(I.hold) + '32)' }], ['Equity multiple', { f: 'SUM(C32:' + yc(I.hold) + '32)/B5' }]];
  const sched = [['SCHEDULE MODEL (this app: month by month)'], ['Pre-development', R.sched.pre, 'months'], ['Construction', R.sched.build, 'months'], ['Lease-up / sales', R.sched.lease, 'months'], ['Months to stabilization', R.sched.toStabilize], ['Sale', R.sched.total, 'month'], [],
    ['Month', 'Costs', 'NOI / sales', 'Unlevered', 'Levered'], ...R.monthly.cost.map((c, t) => [t, Math.round(c), Math.round(R.monthly.noi[t]), Math.round(R.monthly.unlevered[t]), Math.round(R.monthly.levered[t])])];
  const first = 11, last = sched.length + 2; // two IRR rows go in above the table
  sched.splice(6, 0, ['Unlevered IRR (annual)', { f: '(1+IRR(D' + first + ':D' + last + '))^12-1' }], ['Levered IRR (annual)', { f: '(1+IRR(E' + first + ':E' + last + '))^12-1' }]);
  const budget = [['BUDGET'], ['Land (with closing)', Math.round(R.budget.land)], ['Hard costs', Math.round(R.budget.hard + (R.budget.ffe || 0))], ['Site work and parking', Math.round(R.budget.site)], ['Tenant improvements and leasing commissions', Math.round(R.budget.ti + (R.budget.lc || 0))], ['Soft costs', Math.round(R.budget.soft)], ['Contingency', Math.round(R.budget.cont)], ['Developer fee', Math.round(R.budget.fee)], ['Construction interest', Math.round(R.budget.interest)], ['Loan fees', Math.round(R.budget.loanFees)], ['Total', { f: 'SUM(B2:B10)' }],
    [], ['AREA'], ['Gross building sf', Math.round(R.area.gross)], ['Leasable / rentable sf', Math.round(R.area.leasable)], ...(R.area.keys ? [['Hotel keys', R.area.keys]] : []), ...(R.area.units ? [['Units', R.area.units]] : [])];
  return { Assumptions: assumptions, 'One page (TestFit method)': one, 'Schedule model': sched, Budget: budget };
}

// a quick read of what a layout is worth with the default assumptions (land at its default unless given): what it
// costs to build, what it's worth stabilized (NOI at the cap rate) and the profit between them. null when there's
// nothing to price. Used to rank layouts and housing types against each other, not as an underwriting.
export function quick(plan, land = null) {
  if (!(plan.elements || []).some(e => e.kind === 'building' && e.use !== 'amenity')) return null;
  try { const R = run(plan, defaults(plan, land)), r = R.returns || {}, cost = R.budget?.total || 0;
    const value = r.value ?? R.exit?.price ?? null; if (!(cost > 0) || value == null) return null;
    return { cost: Math.round(cost), value: Math.round(value), profit: Math.round(value - cost), yoc: r.yoc ?? null };
  } catch (e) { return null; }
}
