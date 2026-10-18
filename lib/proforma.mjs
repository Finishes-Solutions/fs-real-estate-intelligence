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
// Default numbers are typical Houston-area 2025-26 starting points, not quotes. Everything is editable.
import * as S from './siteplan.mjs';

const RES = ['multifamily', 'townhomes', 'duplex', 'sfr'], COMM = ['retail', 'restaurant', 'office', 'medical', 'hotel', 'industrial', 'storage', 'other'];
export const HARD = { multifamily: 118, townhomes: 115, duplex: 110, sfr: 95, retail: 110, restaurant: 185, office: 180, medical: 230, hotel: 175, church: 160, industrial: 68, storage: 70, amenity: 200, other: 115 }; // (storage: a blend of a climate-controlled building, ~$85, and drive-up rows, ~$45) // $ per gross sf (garden walk-up, wood frame)
export const RENT_COMM = { retail: 24, restaurant: 30, office: 27, medical: 30, hotel: 26, industrial: 8.5, storage: 15, other: 20 }; // $ per net sf per year, triple net (a hotel: as if leased to its operator; self storage: gross street rent, about $1.25/sf a month, the owner paying the operating costs)
export const TI = { retail: 40, restaurant: 60, office: 55, medical: 85, hotel: 0, industrial: 5, storage: 0, other: 35 }; // $ per net sf
export const RENT_HOME = { townhomes: 2350, duplex: 1850, sfr: { 1: 2150, 2: 2450, 3: 2600 } }; // $ per month, build-to-rent
export const SALE_PSF = { townhomes: 185, duplex: 175, sfr: 165 }; // $ per living sf, for sale
export const RENT_UNIT = { Studio: 1150, '1 BR': 1375, '2 BR': 1725, '3 BR': 2075 }; // $ per month
export const CAP = { multifamily: 5.75, townhomes: 5.75, duplex: 6.0, sfr: 5.75, retail: 6.75, restaurant: 6.5, office: 7.75, medical: 6.75, hotel: 8.0, church: 7.5, industrial: 6.0, storage: 5.75, other: 7.0 };

// what the plan holds, by use: gross and net sf, units by type, homes by stories, surface stalls
export function programOf(plan) {
  const m = S.metrics(plan), prog = S.normalizeProgram(plan.program), out = { site: m.siteSf, acres: m.acres, stalls: m.stalls, uses: {}, mix: m.mix, units: m.units || 0, gsf: m.gfa, nrsf: m.nrsf };
  const NET = { retail: 0.95, restaurant: 0.95, office: 0.87, medical: 0.87, hotel: 0.9, church: 0.9, industrial: 1, other: 0.9 };
  for (const e of (plan.elements || []).filter(e => e.kind === 'building')) {
    const use = S.USES[e.use] ? e.use : prog.use, u = out.uses[use] ||= { gsf: 0, nrsf: 0, units: 0, homes: {} }, g = S.gfaOf(e);
    u.gsf += g;
    if (use === 'multifamily') u.units += e.units ?? 0;
    else if (S.USES[use].garage) { u.units += e.units ?? 1; u.nrsf += g; if (use === 'sfr') u.homes[e.floors || 2] = (u.homes[e.floors || 2] || 0) + 1; }
    else if (use === 'storage') u.nrsf += S.storageOf([{ ...e, use }], prog).nrsf; // rentable: the climate building's halls and office and the drive-up walls out
    else if (use !== 'amenity') u.nrsf += g * (NET[use] ?? 0.9);
  }
  if (out.uses.multifamily) { out.uses.multifamily.units = m.mix.reduce((s, t) => s + t.n, 0) || out.uses.multifamily.units; out.uses.multifamily.nrsf = m.mix.reduce((s, t) => s + t.n * t.sf, 0); }
  return out;
}

// months for each phase, from the size of the job
export function scheduleFor(P) {
  const u = P.uses, mf = u.multifamily?.units || 0, homes = (u.townhomes?.units || 0) + (u.duplex?.units || 0) + (u.sfr?.units || 0);
  const comm = COMM.reduce((s, k) => s + (u[k]?.gsf || 0), 0), ind = u.industrial?.gsf || 0;
  const pre = mf || homes ? 9 : 6;
  const build = Math.round(Math.max(mf ? Math.min(26, 12 + mf / 30) : 0, homes ? Math.min(30, 8 + homes / 6) : 0, comm - ind > 0 ? Math.min(16, 8 + (comm - ind) / 15000) : 0, ind ? Math.min(14, 7 + ind / 80000) : 0, 6));
  const lease = Math.round(Math.max(mf ? Math.max(6, mf / 20) : 0, homes ? Math.max(4, homes / 12) : 0, comm - ind > 0 ? 12 : 0, ind ? 9 : 0, u.storage?.gsf ? 30 : 0, 3)); // self storage fills over two to three years
  return { pre, build, lease };
}

// starting assumptions for a plan (land: the parcels' appraised value when known)
export function defaults(plan, land = null) {
  const P = programOf(plan), uses = Object.keys(P.uses), main = uses.filter(u => u !== 'amenity').sort((a, b) => P.uses[b].gsf - P.uses[a].gsf)[0] || 'multifamily';
  const noiW = k => k === 'multifamily' ? (P.uses[k].units || 0) * 14000 : RES.includes(k) ? (P.uses[k].units || 0) * 17000 : (P.uses[k].nrsf || 0) * (RENT_COMM[k] || 20);
  const capW = uses.filter(k => k !== 'amenity'), totW = capW.reduce((s, k) => s + noiW(k), 0) || 1, cap = capW.reduce((s, k) => s + (CAP[k] || 6.5) * noiW(k), 0) / totW || 6.25;
  return {
    method: 'schedule', forSale: false,
    landPrice: land ?? Math.round(P.acres * 175000 / 1000) * 1000, landClosingPct: 1.5,
    hard: Object.fromEntries(uses.map(k => [k, HARD[k] ?? 120])), siteWorkPsf: 7, lotCost: 55000, stallCost: 3500, vaultPerAcFt: 420000, ti: Object.fromEntries(uses.filter(k => COMM.includes(k)).map(k => [k, TI[k]])),
    softPct: 12, contPct: 5, feePct: 4,
    rents: Object.fromEntries((P.mix || []).map(t => [t.name, RENT_UNIT[t.name] ?? Math.round(t.sf * 1.8 / 5) * 5])), otherPerUnit: 75,
    homeRent: { townhomes: RENT_HOME.townhomes, duplex: RENT_HOME.duplex, sfr1: RENT_HOME.sfr[1], sfr2: RENT_HOME.sfr[2], sfr3: RENT_HOME.sfr[3] }, salePsf: { ...SALE_PSF }, absorption: 4, commissionPct: 6,
    commRent: Object.fromEntries(uses.filter(k => COMM.includes(k)).map(k => [k, RENT_COMM[k]])), recoveryPct: 90,
    vacancyPct: main === 'industrial' ? 5 : main === 'storage' ? 10 : COMM.includes(main) ? 7 : 6, creditPct: 1,
    opexPerUnit: 4200, opexPsf: { retail: 7, restaurant: 7, office: 9.5, medical: 10, hotel: 9, industrial: 2.2, storage: 3.25, other: 7 }, taxPct: 2.2, taxBasisPct: 65, mgmtPct: 3, reservesPerUnit: 250,
    ltc: 65, rate: 7.75, loanFeePct: 1, refi: true, permRate: 6.0, amort: 30, ltv: 65, dscr: 1.25,
    exitCap: +(cap + 0.25).toFixed(2), marketCap: +cap.toFixed(2), dispPct: 2, rentGrowth: main === 'multifamily' || RES.includes(main) ? 3 : 2.5, expGrowth: 3, hold: 5,
    sched: scheduleFor(P)
  };
}

const pmt = (r, n, pv) => r ? pv * r / (1 - (1 + r) ** -n) : pv / n;
const irr = cf => { let lo = -0.9999, hi = 10; const npv = r => cf.reduce((s, c, t) => s + c / (1 + r) ** t, 0); if (npv(lo) * npv(hi) > 0) return null; for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (npv(m) > 0) lo = m; else hi = m; } return (lo + hi) / 2; };

// the stabilized year: revenue and expenses at today's rents, full occupancy less vacancy
function stabilized(P, A) {
  const lines = [], add = (k, v, kind) => lines.push({ k, v, kind });
  let units = 0, nrsfComm = 0, recoverable = 0;
  if (P.uses.multifamily) for (const t of P.mix || []) { add(t.n + ' × ' + t.name + ' @ $' + (A.rents[t.name] ?? 0).toLocaleString('en-US') + '/mo', t.n * (A.rents[t.name] ?? 0) * 12, 'rent'); units += t.n; }
  for (const k of ['townhomes', 'duplex']) if (P.uses[k]?.units) { add(P.uses[k].units + ' ' + S.USES[k].label.toLowerCase() + ' @ $' + A.homeRent[k].toLocaleString('en-US') + '/mo', P.uses[k].units * A.homeRent[k] * 12, 'rent'); units += P.uses[k].units; }
  if (P.uses.sfr) for (const [st, n] of Object.entries(P.uses.sfr.homes)) { add(n + ' × ' + st + '-story homes @ $' + A.homeRent['sfr' + st].toLocaleString('en-US') + '/mo', n * A.homeRent['sfr' + st] * 12, 'rent'); units += n; }
  let storeOpex = 0;
  for (const k of COMM) if (P.uses[k]?.nrsf) { const opx = P.uses[k].nrsf * (A.opexPsf[k] ?? 7);
    if (k === 'storage') { add(Math.round(P.uses[k].nrsf).toLocaleString('en-US') + ' sf self storage @ $' + A.commRent[k] + '/sf a year (gross rent)', P.uses[k].nrsf * A.commRent[k], 'rent'); nrsfComm += P.uses[k].nrsf; storeOpex += opx; continue; } // the owner runs it: costs not billed back
    add(Math.round(P.uses[k].nrsf).toLocaleString('en-US') + ' sf ' + S.USES[k].label.toLowerCase() + ' @ $' + A.commRent[k] + '/sf NNN', P.uses[k].nrsf * A.commRent[k], 'rent'); nrsfComm += P.uses[k].nrsf; recoverable += opx; }
  if (units) add('Other income (fees, parking, utilities billed back)', units * A.otherPerUnit * 12, 'other');
  if (recoverable) add('Expense recoveries (' + A.recoveryPct + '% of commercial operating costs)', recoverable * A.recoveryPct / 100, 'rec');
  const gpr = lines.reduce((s, l) => s + l.v, 0), loss = gpr * (A.vacancyPct + A.creditPct) / 100, egi = gpr - loss;
  return { lines, gpr, loss, egi, units, nrsfComm, recoverable, storeOpex };
}

export function run(plan, A0) {
  const P = programOf(plan), A = { ...defaults(plan), ...A0 }, sch = { ...scheduleFor(P), ...(A0?.sched || {}) };
  // ---- budget ----
  const hard = Object.entries(P.uses).reduce((s, [k, u]) => s + u.gsf * (A.hard[k] ?? HARD[k] ?? 120), 0);
  const lots = (P.uses.sfr?.units || 0) + (P.uses.duplex?.units || 0) / 2 + (P.uses.townhomes?.units || 0) * 0.6; // homes: a finished lot (streets, utilities, detention) costs per lot
  // underground stormwater vaults (chosen, or the storage the pond can't hold): about $10 per cubic foot stored
  const sw = plan.elements?.length ? S.stormOf(plan) : { vault: 0 }, storm = (sw.vault || 0) * (A.vaultPerAcFt ?? 420000);
  const site = lots * A.lotCost + Math.max(0, P.site - lots * 7000) * A.siteWorkPsf * (lots ? 0.5 : 1) + P.stalls * A.stallCost + storm, ti = Object.entries(P.uses).reduce((s, [k, u]) => s + (COMM.includes(k) ? u.nrsf * (A.ti[k] ?? 0) : 0), 0);
  const land = A.landPrice * (1 + A.landClosingPct / 100), soft = (hard + site) * A.softPct / 100, cont = (hard + site) * A.contPct / 100;
  const pre = land + hard + site + ti + soft + cont, fee = pre * A.feePct / 100, budget = pre + fee;
  const homes = (P.uses.townhomes?.units || 0) + (P.uses.duplex?.units || 0) + (P.uses.sfr?.units || 0), forSale = A.forSale && homes && !P.uses.multifamily && !COMM.some(k => P.uses[k]);
  // ---- operations ----
  const st = stabilized(P, A), tax = A.taxPct / 100 * budget * A.taxBasisPct / 100;
  const opexRes = st.units * A.opexPerUnit + st.units * A.reservesPerUnit, opexComm = st.recoverable + (st.storeOpex || 0), mgmt = st.egi * A.mgmtPct / 100;
  const opex = opexRes + opexComm + tax + mgmt, noi = st.egi - opex;
  // ---- the schedule, month by month ----
  const T0 = sch.pre, T1 = sch.pre + sch.build, T2 = T1 + sch.lease, T = forSale ? T1 + Math.ceil(homes / Math.max(1, A.absorption)) + 1 : T2 + Math.round(A.hold * 12);
  const cost = new Float64Array(T + 1), noiM = new Float64Array(T + 1), sales = new Float64Array(T + 1);
  cost[0] += land; const spread = (amt, a, b, curve) => { const n = Math.max(1, b - a), w = Array.from({ length: n }, (_, k) => curve ? Math.sin(Math.PI * (k + 0.5) / n) ** 2 : 1), ws = w.reduce((s, v) => s + v, 0); w.forEach((v, k) => { cost[Math.min(T, a + 1 + k)] += amt * v / ws; }); };
  spread(soft * 0.35, 0, Math.max(1, T0)); spread(soft * 0.65, T0, T1); spread(hard + site + cont, T0, T1, true); spread(ti, T1 - 2, T2); cost[T0] += fee / 2; cost[Math.min(T, T1)] += fee / 2;
  const g = t => (1 + A.rentGrowth / 100) ** Math.floor(Math.max(0, t - T1) / 12), ge = t => (1 + A.expGrowth / 100) ** Math.floor(Math.max(0, t - T1) / 12);
  if (forSale) { // homes close at the absorption pace once the first ones are built (about 5 months into construction)
    const price = [...Object.entries(P.uses.sfr?.homes || {}).flatMap(([s2, n]) => Array(n).fill(S.HOME_TYPES[s2].sf * A.salePsf.sfr)), ...Array(P.uses.townhomes?.units || 0).fill(1800 * A.salePsf.townhomes), ...Array(P.uses.duplex?.units || 0).fill(1300 * A.salePsf.duplex)];
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
      perm = A.refi ? Math.min(byLtv, byDscr) : loan; permPmt = pmt(A.permRate / 1200, A.amort * 12, perm); refiOut = perm - loan; cash += refiOut; loan = perm;
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
  const sum = forSale ? null : { yoc: noi / totalCost, spread: noi / totalCost - A.marketCap / 100, value: noi / (A.marketCap / 100), dscr: permPmt ? noi / (permPmt * 12) : null, coc: permPmt ? (noi - permPmt * 12) / Math.max(1, contrib) : null };
  return { A, P, sched: { ...sch, toStabilize: T2, total: T, sale: T }, budget: { land, hard, site, storm, vaultAcFt: sw.vault || 0, ti, soft, cont, fee, budget, interest, loanFees, total: totalCost },
    sources: { equity: contrib, loanPeak: peakLoan, ltc: peakLoan / totalCost }, ops: { ...st, tax, opexRes, opexComm, mgmt, opex, noi },
    exit: { price, dispNet, payoff, perm, refiOut, sales: Array.from(sales).reduce((s, v) => s + v, 0) }, returns: { ...sum, unlevIrr: uIrr, levIrr: lIrr, multiple: contrib ? distrib / contrib : null, profit: distrib - contrib, peakEquity: contrib, margin: forSale ? (Array.from(sales).reduce((s, v) => s + v, 0) - totalCost) / Math.max(1, Array.from(sales).reduce((s, v) => s + v, 0)) : null },
    forSale, annual, monthly: { cost: Array.from(cost), noi: Array.from(noiM), levered: Array.from(lev), unlevered: Array.from(unlev) }, simple: simple(simpleInputs(P, A, budget, { land, hard: hard + site, ti, soft, cont, fee }, st, opex)) };
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
// the same plan through the TestFit method: rent per net sf from the plan's own rents
function simpleInputs(P, A, budget, b, st, opex) {
  const nrsf = Math.max(1, P.nrsf || P.gsf), rentNet = st.lines.filter(l => l.kind === 'rent').reduce((s, l) => s + l.v, 0), other = st.lines.filter(l => l.kind === 'other').reduce((s, l) => s + l.v, 0);
  return { nrsf, gsf: P.gsf, land: b.land, hard: b.hard, ti: b.ti, soft: b.soft, contPct: A.contPct, finFee: b.fee, rentPsf: rentNet / nrsf, recoveryPct: st.recoverable ? A.recoveryPct * st.recoverable / Math.max(1, opex) : 0, otherPsf: other / nrsf,
    vacancyPct: A.vacancyPct + A.creditPct, opexPsf: opex / nrsf, ltc: A.ltc, rate: A.permRate, amort: Math.min(A.amort, 25), exitCap: A.exitCap, marketCap: A.marketCap, dispPct: A.dispPct, rentGrowth: A.rentGrowth, expGrowth: A.expGrowth, hold: A.hold };
}

// ---------- the workbook: assumptions, the one-page method with live formulas, and the schedule model ----------
// Sheets as arrays of rows; a cell is a value or { f: 'formula' } (SheetJS reads both). The one-page sheet is formula-
// driven so it can be changed in Excel; the schedule sheet holds this app's monthly figures with an IRR formula.
export function workbook(R, title = 'Site plan') {
  const I = R.simple.I, A = R.A, col = n => String.fromCharCode(65 + n);
  const assumptions = [['PRO FORMA ASSUMPTIONS — ' + title], [], ['Input', 'Value', 'Unit'],
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
  const budget = [['BUDGET'], ['Land (with closing)', Math.round(R.budget.land)], ['Hard costs', Math.round(R.budget.hard)], ['Site work and parking', Math.round(R.budget.site)], ['Tenant improvements', Math.round(R.budget.ti)], ['Soft costs', Math.round(R.budget.soft)], ['Contingency', Math.round(R.budget.cont)], ['Developer fee', Math.round(R.budget.fee)], ['Construction interest', Math.round(R.budget.interest)], ['Loan fees', Math.round(R.budget.loanFees)], ['Total', { f: 'SUM(B2:B10)' }]];
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
