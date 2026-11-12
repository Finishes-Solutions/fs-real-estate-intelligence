// Parsers for the appraisal-roll and tax-rate sources of the seven home counties (docs/data-sources/cad-and-tax-rates.md).
// Pure functions of a file's rows or lines, so the loader (build/cad-rolls.mjs) and the tests share them. Each turns one
// source's records into the shapes of supabase/migrations/20261112000000_cad_rolls.sql:
//   account  { county, account_id, tax_year, roll, geo_id, owner, mailing, situs, situs_city, situs_zip, legal, state_class,
//              land_use, acreage, land_value, improvement_value, ag_value, market_value, appraised_value, exemptions[],
//              year_built, bldg_sqft, units, stories, bldg_class, neighborhood, lon, lat }
//   units    { county, account_id, tax_year, unit_codes[], taxable{}, exemptions{}, partial }
//   imp      { county, account_id, tax_year, imp_id, imp_type, bldg_class, year_built, eff_year, sqft, units, stories, value, segments }
//   rate     { unit_key, tax_year, source, county, name, unit_type, mo_rate, is_rate, total_rate, nnr_rate, var_rate, proposed_rate, status }
//   unit     { county, unit_code, name, unit_type, comptroller_id, match }
// DOM-free and dependency-free.

const t = v => v == null ? '' : String(v).replace(/\u0000/g, '').trim();
const num = v => { if (v == null) return null; const s = String(v).replace(/[$,\s]/g, ''); if (s === '' || s === '-' || /^[*.]+$/.test(s)) return null; const n = +s; return Number.isFinite(n) ? n : null; };
const int = v => { const n = num(v); return n == null ? null : Math.round(n); };
const caseName = v => t(v).toLowerCase().replace(/\s+/g, ' ').replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Llc|Lp|Ltd|Inc|Tx|Us|Fm|Sh|Ih|Cr|Ii|Iii|Iv|Isd|Mud|Esd|Wcid)\b/g, w => w.toUpperCase());
const year = v => { const n = int(v); return n && n > 1800 && n < 2100 ? n : null; };
export const zip5 = v => (t(v).match(/\d{5}/) || [null])[0];

// ---------- taxing units: types, Comptroller IDs, names ----------
// the Comptroller's unit ID is CCC-NNN-TT; TT says what kind of unit it is
const TYPE_BY_TT = { '00': 'county', '02': 'isd', '03': 'city', '04': 'mud', '05': 'wcid', '06': 'fwsd', '07': 'levee', '08': 'drainage', '09': 'other', '10': 'road', '11': 'navigation',
  '12': 'hospital', '13': 'hospital', '14': 'college', '15': 'college', '19': 'wcid', '25': 'water', '40': 'esd', '41': 'esd', '42': 'esd', '48': 'management' };
export function cid(v) { // '07920348', '079-203-48', '079-203-48-079-079' → '079-203-48'
  const d = t(v).replace(/\D/g, ''); return d.length >= 8 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6, 8) : null;
}
export const typeOfCid = id => id ? TYPE_BY_TT[id.slice(-2)] || 'other' : null;
export function typeOfName(name) {
  const n = t(name).toLowerCase();
  if (/\bcounty\b$|\bcounty (general|road|fmfc|rfm)|^\w+ co(unty)?$/.test(n) && !/mud|wcid|esd|drain|district|isd|road dist/.test(n)) return 'county';
  if (/\bisd\b|school/.test(n)) return 'isd';
  if (/\bcity\b|^city of|\btown of\b|village/.test(n)) return 'city';
  if (/\bmud\b|municipal utility/.test(n)) return 'mud';
  if (/\bwcid\b|water cont(ro)?l/.test(n)) return 'wcid';
  if (/\besd\b|emergency serv|fire/.test(n)) return 'esd';
  if (/drain|levee|flood/.test(n)) return 'drainage';
  if (/hospital|health/.test(n)) return 'hospital';
  if (/college|\bccd\b|\bjc\b/.test(n)) return 'college';
  if (/road/.test(n)) return 'road';
  if (/management|\bmd\b|improvement dist/.test(n)) return 'management';
  return 'other';
}
// a name reduced to what matters for matching: "Harris Waller Co MUD #2" and "Harris-Waller Counties MUD #2" agree
export function normName(name) {
  return t(name).toLowerCase().replace(/\bfb\b/g, 'fort bend').replace(/\*+/g, ' ').replace(/&/g, ' and ').replace(/[#.,()'’/-]/g, ' ')
    .replace(/\bcounties\b|\bcnty\b|\bco\b/g, 'county').replace(/\bmunicipal utility district\b/g, 'mud').replace(/\bwater cont(ro)?l (and |& )?(improvement|imp|impr) dist(rict)?\b/g, 'wcid')
    .replace(/\bemergency services district\b/g, 'esd').replace(/\bindependent school district\b/g, 'isd').replace(/\bmanagement district\b|\bmgmt dist\b|\bmd\b/g, 'md')
    .replace(/\broad (improvement|impr?) (district|dist)\b|\broad (improvement|impr?)\b|\broad district\b/g, 'rd').replace(/\bimprovement dist(rict)?\b|\bimpr? dist\b/g, 'id').replace(/\bdrainage district\b|\bdrainage dist\b/g, 'dd').replace(/\bft\b/g, 'fort').replace(/\bno\b/g, ' ')
    .replace(/\bthe\b|\bof\b|\bcity\b|\btown\b/g, ' ').replace(/\s+/g, ' ').trim();
}
const nums = s => (s.match(/\d+[a-z]?/g) || []).join(' ');
// the Comptroller unit for a district's unit name, among the Comptroller units of that county; null if not one clear match
export function matchUnit(name, candidates, { type = null } = {}) {
  const n = normName(name), want = nums(n), ty = type || typeOfName(name);
  const big = ['county', 'city', 'isd'], pool = candidates.filter(c => !ty || !c.unit_type || c.unit_type === ty || (ty === 'other' && !big.includes(c.unit_type)) || (['mud', 'wcid', 'management', 'other', 'water', 'fwsd'].includes(ty) && ['mud', 'wcid', 'management', 'other', 'water', 'fwsd'].includes(c.unit_type)));
  const exact = pool.filter(c => normName(c.name) === n); if (exact.length === 1) return exact[0];
  const words = s => new Set(s.split(' ').filter(w => w.length > 1 && !/^\d/.test(w)));
  const nw = words(n);
  const scored = pool.map(c => { const cn = normName(c.name); if (nums(cn) !== want) return null; const cw = words(cn); let hit = 0; for (const w of nw) if (cw.has(w)) hit++; const s = hit / Math.max(nw.size, cw.size, 1); return s >= (want ? 0.67 : 0.99) ? { c, s } : null; }).filter(Boolean).sort((a, b) => b.s - a.s);
  if (scored.length && (scored.length === 1 || scored[0].s > scored[1].s)) return scored[0].c;
  return null;
}

// Link a district's units to the Comptroller's: units that already carry a Comptroller ID keep it ('id'); the rest are
// matched by name among the Comptroller units reported by that county's appraisal district ('name'). comp: Comptroller
// rate rows (any year) with their _cads lists. Returns the units with comptroller_id / match filled where found.
export function crosswalk(units, comp, county) {
  const pool = new Map();
  for (const r of comp) if ((r._cads || [r.county]).includes(county) && !pool.has(r.unit_key)) pool.set(r.unit_key, { unit_key: r.unit_key, name: r.name, unit_type: r.unit_type });
  const cands = [...pool.values()];
  return units.map(u => {
    if (u.comptroller_id) return { ...u, match: u.match || 'id' };
    const m = matchUnit(u.name, cands, { type: u.unit_type });
    return m ? { ...u, comptroller_id: m.unit_key, match: 'name' } : { ...u, comptroller_id: null, match: null };
  });
}

// ---------- the Comptroller's rates and levies files (one XLSX a kind and year) ----------
// rows: arrays of cell values (sheet 1); kind: 'county' | 'city' | 'school-district' | 'special-district'. The header row
// and the column order move between years, so columns are found by their names.
export function parseComptrollerRates(rows, { year: yr, kind }) {
  const hi = rows.findIndex(r => (r || []).some(c => /taxing unit id/i.test(t(c)))); if (hi < 0) throw new Error('no header row with "Taxing Unit ID"');
  const H = rows[hi].map(c => t(c).toUpperCase().replace(/\s+/g, ' '));
  const col = (...res) => { for (const re of res) { const i = H.findIndex(h => re.test(h)); if (i >= 0) return i; } return -1; };
  const iId = col(/^TAXING UNIT ID$/), iName = col(/^(TAXING UNIT NAME|TU NAME)$/), iCounty = col(/^COUNTY NAME$/), iCad = col(/^CAD NAME$/), iCadId = col(/^CAD ID$/);
  const iNnr = col(/^NO-NEW-REVENUE[- ]RATE$/), iVar = col(/^VOTER-APPROVAL RATE$/), iTot = col(/^TOTAL( COUNTY)? TAX RATE$/, /^TOTAL TAX RATE$/);
  const iMo = col(/^M&O RATE$/), iIs = col(/^I&S RATE$/);
  const cMo = ['GF M&O TAX RATE', 'R&B M&O TAX RATE', 'FMFC M&O RATE'].map(h => H.indexOf(h)).filter(i => i >= 0), cIs = ['GF I&S TAX RATE', 'R&B I&S TAX RATE', 'FMFC I&S RATE'].map(h => H.indexOf(h)).filter(i => i >= 0);
  const out = new Map();
  for (const r of rows.slice(hi + 1)) {
    const id = cid(r[iId]); if (!id) continue;
    const cad = t(iCad >= 0 ? r[iCad] : r[iCounty]), home = iCadId >= 0 && String(r[iCadId]).padStart(3, '0') === id.slice(0, 3);
    if (out.has(id)) { const o = out.get(id); if (cad && !o._cads.includes(cad)) o._cads.push(cad); if (home && cad) o.county = cad; continue; } // (a unit split across appraisal districts is listed once per district: the rates are the same)
    let name = t(iName >= 0 ? r[iName] : '') || (kind === 'county' ? t(r[iCounty]) + ' County' : ''), star = /\*/.test(name.replace(/\*\*\s*$/, ''));
    name = name.replace(/\s*\*+\s*$/, '').replace(/\s+/g, ' ');
    const mo = iMo >= 0 ? num(r[iMo]) : cMo.length ? round6(cMo.reduce((s, i) => s + (num(r[i]) || 0), 0)) : null;
    const is = iIs >= 0 ? num(r[iIs]) : cIs.length ? round6(cIs.reduce((s, i) => s + (num(r[i]) || 0), 0)) : null;
    const total = iTot >= 0 ? num(r[iTot]) : mo != null || is != null ? round6((mo || 0) + (is || 0)) : null;
    out.set(id, { unit_key: id, tax_year: yr, source: 'comptroller', county: cad || null, _cads: cad ? [cad] : [], name, unit_type: typeOfCid(id),
      mo_rate: star ? null : mo, is_rate: star ? null : is, total_rate: star ? null : total, nnr_rate: iNnr >= 0 ? num(r[iNnr]) : null, var_rate: iVar >= 0 ? num(r[iVar]) : null,
      proposed_rate: null, status: star ? 'not reported' : 'adopted' });
  }
  return [...out.values()];
}
const round6 = v => Math.round(v * 1e6) / 1e6;
// the statewide total file's own layout (2023: County ID, County Name, Taxing Unit ID, Name, Split, Total; 2025: Name, ID, Total)
export function parseComptrollerTotals(rows, { year: yr }) {
  const hi = rows.findIndex(r => (r || []).some(c => /taxing unit id/i.test(t(c)))); if (hi < 0) throw new Error('no header row');
  const H = rows[hi].map(c => t(c).toLowerCase()), iId = H.findIndex(h => h === 'taxing unit id'), iName = H.findIndex(h => h === 'taxing unit name'), iTot = H.findIndex(h => h === 'total tax rate');
  const out = new Map();
  for (const r of rows.slice(hi + 1)) { const id = cid(r[iId]); if (!id || out.has(id)) continue; const raw = t(r[iName]); const star = /\*\s*$/.test(raw.replace(/\*\*\s*$/, '')) && !/\*\*\s*$/.test(raw);
    out.set(id, { unit_key: id, tax_year: yr, source: 'comptroller', county: null, name: raw.replace(/\s*\*+\s*$/, ''), unit_type: typeOfCid(id), total_rate: star ? null : num(r[iTot]), status: star ? 'not reported' : 'adopted' }); }
  return [...out.values()];
}

// ---------- tab-delimited and CSV text ----------
export function splitTsv(line) { return line.split('\t').map(x => x.replace(/\r$/, '')); }
// one CSV line (quotes, doubled quotes inside quotes); a record that spans lines is the caller's to join (Orion has none)
export function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else if (c !== '\r') cur += c;
  }
  out.push(cur); return out;
}
// a header line → a row-to-object function (BOM and a stray "?" before the first name stripped)
export function headerOf(line, split) { const h = split(line).map(x => x.replace(/^﻿/, '').replace(/^\?/, '').trim()); return cells => Object.fromEntries(h.map((k, i) => [k, cells[i]])); }

// ---------- Harris (HCAD bulk files, tab-delimited with a header) ----------
export const HCAD_COUNTY = 'Harris';
export function hcadAccount(r, { roll }) {
  const site = [t(r.site_addr_1), caseName(r.site_addr_2)].filter(Boolean).join(', ');
  return { county: HCAD_COUNTY, account_id: t(r.acct), tax_year: year(r.yr), roll, geo_id: null, owner: t(r.mailto) || null,
    mailing: [t(r.mail_addr_1), t(r.mail_addr_2), [t(r.mail_city), t(r.mail_state), t(r.mail_zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
    situs: /^0 /.test(t(r.site_addr_1)) && !t(r.str) ? null : site || null, situs_city: caseName(r.site_addr_2) || null, situs_zip: zip5(r.site_addr_3),
    legal: [r.lgl_1, r.lgl_2, r.lgl_3, r.lgl_4].map(t).filter(Boolean).join(' ') || null, state_class: t(r.state_class) || null, land_use: null,
    acreage: num(r.acreage), land_value: num(r.land_val), improvement_value: (num(r.bld_val) || 0) + (num(r.x_features_val) || 0) || null, ag_value: num(r.ag_val) || null,
    market_value: num(r.tot_mkt_val), appraised_value: num(r.tot_appr_val), exemptions: [], year_built: year(r.yr_impr), bldg_sqft: num(r.bld_ar) || null, units: null, stories: null, bldg_class: t(r.econ_bld_class) || null,
    neighborhood: t(r.Neighborhood_Code) || null, lon: null, lat: null,
    _jurs: t(r.jurs).split(/\s+/).filter(Boolean) };
}
export function hcadBuilding(r, { taxYear, kind }) {
  return { county: HCAD_COUNTY, account_id: t(r.acct), tax_year: taxYear, imp_id: t(r.bld_num) || '1', imp_type: [t(r.impr_tp), t(r.structure_dscr)].filter(Boolean).join(' ') || kind, bldg_class: [t(r.qa_cd), t(r.dscr)].filter(Boolean).join(' ') || null,
    year_built: year(r.date_erected), eff_year: year(r.eff), sqft: num(r.im_sq_ft) || num(r.heat_ar) || num(r.base_ar) || null, units: int(r.units) || null, stories: null, value: num(r.dpr_val) ?? num(r.Depr_Val) ?? num(r.noticed_Depr_Val), segments: null };
}
// jur_tax_dist_exempt_value_rate.txt: one row per jurisdiction and exemption; the rate columns are the same on each.
// prop / curr: HCAD's proposed and current (adopted) rates per $100.
export function hcadRates(rows, { taxYear }) {
  const out = new Map();
  for (const r of rows) {
    const code = t(r.tax_dist); if (!code || out.has(code)) continue;
    const curr = num(r.curr), prop = num(r.prop);
    out.set(code, { unit: { county: HCAD_COUNTY, unit_code: code, name: caseName(r.name), unit_type: typeOfName(r.name), comptroller_id: null, match: null },
      rate: { unit_key: HCAD_COUNTY + ':' + code, tax_year: taxYear, source: 'hcad', county: HCAD_COUNTY, name: caseName(r.name), unit_type: typeOfName(r.name), total_rate: curr || null, proposed_rate: prop || null, status: curr ? 'adopted' : prop ? 'proposed' : 'not reported' } });
  }
  return [...out.values()];
}

// ---------- Fort Bend (Orion export: CSV with a header; RecordType 1 property, 2 owner, 3 exemption, 4 entity) ----------
export const FBCAD_COUNTY = 'Fort Bend';
const ROLL_OF = s => /CERT/i.test(s) ? 'certified' : /PRE/i.test(s) ? 'preliminary' : /^\d+$/.test(t(s)) && +s > 0 ? 'supplement ' + +s : t(s).toLowerCase() || null;
export function orionProperty(r) {
  return { county: FBCAD_COUNTY, account_id: t(r.PropertyQuickRefID), tax_year: year(r.TaxYear), roll: ROLL_OF(r.SupplementNumber) || 'certified', geo_id: t(r.PropertyNumber) || null,
    situs: [t(r.SitusStreetAddress), t(r.SitusCity)].filter(Boolean).join(', ') || null, situs_city: caseName(r.SitusCity) || null, situs_zip: zip5(r.SitusZip), legal: t(r.LegalDesc) || null,
    state_class: t(r.StateCodeImp) || t(r.StateCodeLand) || null, land_use: t(r.StateCodeLand) || null, acreage: num(r.Acres), _type: t(r.PropertyTypeCode), _entities: t(r.Entities).split(',').map(t).filter(Boolean) };
}
// the owner record carries the value parts (homestead and non-homestead land and improvements, ag)
export function orionOwner(r) {
  const land = (num(r.LandHSValue) || 0) + (num(r.LandNHSValue) || 0), imp = (num(r.ImpHSValue) || 0) + (num(r.ImpNHSValue) || 0);
  return { account_id: t(r.PropertyQuickRefID), owner_ref: t(r.OwnerQuickRefID), owner: t(r.OwnerName) || null, pct: num(r.OwnershipPercentage),
    mailing: [t(r.OwnerAddress1), t(r.OwnerAddress2), t(r.OwnerAddress3), [t(r.OwnerCity), t(r.OwnerState), t(r.OwnerPostalCode)].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
    land_value: land, improvement_value: imp, ag_market: num(r.AgMktValue) || 0, ag_use: num(r.AgUseValue) || 0, cap: num(r.HSCapAdj) || 0 };
}
export const orionEntity = r => ({ owner_ref: t(r.OwnerQuickRefID), code: t(r.EntityCode), market: num(r.MarketValue), assessed: num(r.AssessedValue), taxable: num(r.TaxableValue) });
export const orionExemption = r => ({ owner_ref: t(r.OwnerQuickRefID), code: t(r.ExemptionCode) });
// Fort Bend's tax rate workbook: Code, Description, Contact, State Number (the Comptroller ID without dashes), rates
export function fbcadRateRows(rows, { taxYear }) {
  const hi = rows.findIndex(r => (r || []).some(c => /^state number$/i.test(t(c)))); if (hi < 0) throw new Error('no header with "State Number"');
  const H = rows[hi].map(c => t(c).toLowerCase()), ix = re => H.findIndex(h => re.test(h));
  const iCode = ix(/^code$/), iName = ix(/^description$/), iSt = ix(/^state number$/), iMo = ix(/m&o/), iIs = ix(/i&s/), iTot = ix(/^total rate$/);
  return rows.slice(hi + 1).filter(r => t(r[iCode])).map(r => { const c = cid(r[iSt]), name = t(r[iName]), tot = num(r[iTot]);
    return { unit: { county: FBCAD_COUNTY, unit_code: t(r[iCode]), name, unit_type: c ? typeOfCid(c) : typeOfName(name), comptroller_id: c, match: c ? 'id' : null },
      rate: { unit_key: c || FBCAD_COUNTY + ':' + t(r[iCode]), tax_year: taxYear, source: 'fbcad', county: FBCAD_COUNTY, name, unit_type: c ? typeOfCid(c) : typeOfName(name), mo_rate: num(r[iMo]), is_rate: num(r[iIs]), total_rate: tot, status: tot == null ? 'not reported' : 'adopted' } }; });
}

// ---------- PACS appraisal export (fixed width, layout 8.0.x: Washington today; Waller / Austin when a request is answered) ----------
const F = (s, e) => [s - 1, e]; // the layout's 1-based start and end
export const PACS = {
  info: { prop_id: F(1, 12), prop_type_cd: F(13, 17), prop_val_yr: F(18, 22), sup_num: F(23, 34), geo_id: F(547, 596), py_owner_name: F(609, 678), py_addr_line1: F(694, 753), py_addr_line2: F(754, 813), py_addr_line3: F(814, 873),
    py_addr_city: F(874, 923), py_addr_state: F(924, 973), py_addr_zip: F(979, 983), situs_street_prefx: F(1040, 1049), situs_street: F(1050, 1099), situs_street_suffix: F(1100, 1109), situs_city: F(1110, 1139), situs_zip: F(1140, 1149),
    legal_desc: F(1150, 1404), legal_desc2: F(1405, 1659), legal_acreage: F(1660, 1675), hood_cd: F(1686, 1695), land_hstd_val: F(1796, 1810), land_non_hstd_val: F(1811, 1825), imprv_hstd_val: F(1826, 1840), imprv_non_hstd_val: F(1841, 1855),
    ag_use_val: F(1856, 1870), ag_market: F(1871, 1885), timber_use: F(1886, 1900), timber_market: F(1901, 1915), appraised_val: F(1916, 1930), assessed_val: F(1946, 1960),
    hs_exempt: F(2609, 2609), ov65_exempt: F(2610, 2610), ov65s_exempt: F(2661, 2661), dp_exempt: F(2662, 2662), dv1_exempt: F(2663, 2663), dv2_exempt: F(2665, 2665), dv3_exempt: F(2667, 2667), dv4_exempt: F(2669, 2669), ex_exempt: F(2671, 2671),
    imprv_state_cd: F(2732, 2741), land_state_cd: F(2742, 2751), market_value: F(4214, 4227), situs_num: F(4460, 4474), situs_unit: F(4475, 4479), entities: F(5202, 5341) },
  entity: { prop_id: F(1, 12), prop_val_yr: F(13, 17), sup_num: F(18, 29), owner_id: F(30, 41), entity_cd: F(54, 63), entity_name: F(64, 113), assessed_val: F(149, 163), taxable_val: F(164, 178), hs_amt: F(299, 313), ov65_amt: F(314, 328), dp_amt: F(329, 343), dv_amt: F(344, 358), ex_amt: F(359, 373), market_value: F(389, 403) },
  imp: { prop_id: F(1, 12), prop_val_yr: F(13, 16), imprv_id: F(17, 28), imprv_type_cd: F(29, 38), imprv_type_desc: F(39, 63), imprv_state_cd: F(64, 68), imprv_val: F(70, 83) },
  det: { prop_id: F(1, 12), prop_val_yr: F(13, 16), imprv_id: F(17, 28), imprv_det_id: F(29, 40), type_cd: F(41, 50), type_desc: F(51, 75), class_cd: F(76, 85), yr_built: F(86, 89), area: F(94, 108), value: F(109, 122) },
  attr: { prop_id: F(1, 12), prop_val_yr: F(13, 16), imprv_id: F(17, 28), imprv_det_id: F(29, 40), desc: F(53, 77), code: F(78, 87) }
};
export function fixed(line, spec) { const o = {}; for (const [k, [s, e]] of Object.entries(spec)) o[k] = line.slice(s, e).trim(); return o; }
const PACS_EX = { hs_exempt: 'HS', ov65_exempt: 'OV65', ov65s_exempt: 'OV65S', dp_exempt: 'DP', dv1_exempt: 'DV1', dv2_exempt: 'DV2', dv3_exempt: 'DV3', dv4_exempt: 'DV4', ex_exempt: 'EX' };
export function pacsAccount(r, { county, roll }) {
  const land = (num(r.land_hstd_val) || 0) + (num(r.land_non_hstd_val) || 0), imp = (num(r.imprv_hstd_val) || 0) + (num(r.imprv_non_hstd_val) || 0);
  const street = [r.situs_num, r.situs_street_prefx, r.situs_street, r.situs_street_suffix].map(t).filter(Boolean).join(' '), sup = int(r.sup_num) || 0;
  return { county, account_id: String(int(r.prop_id)), tax_year: year(r.prop_val_yr), roll: sup ? 'supplement ' + sup : roll, geo_id: t(r.geo_id) || null, owner: t(r.py_owner_name) || null,
    mailing: [r.py_addr_line1, r.py_addr_line2, r.py_addr_line3].map(t).filter(Boolean).concat([[t(r.py_addr_city), t(r.py_addr_state), t(r.py_addr_zip)].filter(Boolean).join(' ')]).filter(Boolean).join(', ') || null,
    situs: street ? caseName(street) + (t(r.situs_city) ? ', ' + caseName(r.situs_city) : '') : null, situs_city: caseName(r.situs_city) || null, situs_zip: zip5(r.situs_zip),
    legal: [t(r.legal_desc), t(r.legal_desc2)].filter(Boolean).join(' ') || null, state_class: t(r.imprv_state_cd) || t(r.land_state_cd) || null, land_use: t(r.land_state_cd) || null,
    acreage: num(r.legal_acreage) != null ? num(r.legal_acreage) / 10000 : null, land_value: land, improvement_value: imp, ag_value: (num(r.ag_use_val) || 0) + (num(r.timber_use) || 0) || null,
    market_value: num(r.market_value), appraised_value: num(r.appraised_val), exemptions: Object.entries(PACS_EX).filter(([k]) => r[k] === 'T').map(([, v]) => v),
    year_built: null, bldg_sqft: null, units: null, stories: null, bldg_class: null, neighborhood: t(r.hood_cd) || null, lon: null, lat: null, _type: t(r.prop_type_cd), _entities: t(r.entities).split(',').map(t).filter(Boolean) };
}

// ---------- Grimes (the certified roll as a printed report) ----------
// Each account is a block from "PID:" to a dashed line: owner and address down the left (cols 1–30), description in the
// middle (31–82), values on the right ("LANDHS $ 0", "ASSESSED $ 31,280 GGR - GRIMES COUNTY", "TAXABLE $ 31,280").
export const GCAD_COUNTY = 'Grimes';
export function* grimesBlocks(lines) {
  let cur = null;
  for (const raw of lines) {
    const l = raw.replace(/\r$/, '');
    if (/^PID:/.test(l)) { if (cur) yield cur; cur = [l]; continue; }
    if (!cur) continue;
    if (/^-{20,}/.test(l)) { yield cur; cur = null; continue; }
    if (/^GRIMESCAD\s|CERTIFIED ROLL\s+PAGE|OWNER NAME AND ADDRESS/.test(l)) continue;
    cur.push(l);
  }
  if (cur) yield cur;
}
export function grimesAccount(block, { taxYear, roll = 'certified' }) {
  const head = /^PID:\s*([A-Z]?)(\d+)\s*\(([^)]*)\)/.exec(block[0]); if (!head) return null;
  const left = block.map(l => l.slice(0, 31).trim()), mid = block.map(l => l.slice(31, 66).replace(/\s+$/, '')), exCol = block.map(l => l.slice(66, 83).trim()), right = block.map(l => l.slice(83));
  const val = {}, units = [], taxable = {}; let pending = null;
  for (const r of right) {
    const m = /^([A-Z]+)\s*\$\s*([\d,]+)\s*(.*)$/.exec(r.trim()); if (!m) continue;
    const k = m[1], v = num(m[2]), rest = m[3].trim();
    if (k === 'ASSESSED') { const u = /^(\w+)\s+-\s+(.+)$/.exec(rest); if (u) { pending = u[1]; units.push({ code: u[1], name: u[2].trim() }); } continue; }
    if (k === 'TAXABLE' && pending) { taxable[pending] = v; pending = null; continue; }
    val[k] = v;
  }
  const ents = (mid.find(x => /ENTS:/.test(x)) || '').replace(/.*ENTS:\s*/, '').split(',').map(t).filter(Boolean);
  const sptb = (mid.find(x => /SPTB:/.test(x)) || ''), land = /LAND SPTB:\s*([\w]+)/.exec(sptb)?.[1] || null, imp = /IMP SPTB:\s*([\w]+)/.exec(sptb)?.[1] || null;
  const situsLine = mid.findIndex(x => /SITUS:/.test(x)), situs = situsLine >= 0 ? mid[situsLine].replace(/.*SITUS:\s*/, '').trim() : '';
  const cityLine = situsLine >= 0 ? (block[situsLine + 1] || '').slice(31, 66).trim() : '', city = /^([A-Z .'-]+),\s*TX\s*(\d{5})?/.exec(cityLine);
  const legalLines = mid.slice(0, situsLine >= 0 ? situsLine : 3).map(x => x.trim()).filter(x => x && !/^(ENTS|LAND SPTB|IMP SPTB)/.test(x));
  const acres = /ACRES\s+([\d.]+)/.exec(legalLines.join(' '))?.[1];
  const exLine = exCol.filter(x => /^[A-Z0-9]{2,6}\s+\$/.test(x));
  const landV = (val.LANDHS || 0) + (val.LANDNHS || 0), impV = (val.IMPHS || 0) + (val.IMPNHS || 0), agMkt = (val.AGMKT || 0) + (val.TIMMKT || 0), agUse = (val.AGUSE || 0) + (val.TIMUSE || 0);
  const market = landV + impV + agMkt + (val.MINERAL || 0) + (val.PERSONAL || 0);
  const owner = left[3] || null, mailing = left.slice(4, 6).filter(Boolean).join(', ') || null;
  return { account: { county: GCAD_COUNTY, account_id: head[2], tax_year: taxYear, roll, geo_id: left[1] || null, owner, mailing,
      situs: situs ? caseName(situs) + (city ? ', ' + caseName(city[1]) : '') : null, situs_city: city ? caseName(city[1]) : null, situs_zip: city?.[2] || null,
      legal: legalLines.join(' ').replace(/\s+/g, ' ') || null, state_class: imp || land, land_use: land, acreage: acres ? +acres : null, land_value: landV, improvement_value: impV, ag_value: agUse || null,
      market_value: market, appraised_value: market - agMkt + agUse - (val.HSCAPADJ || 0) - (val.CBLCAPADJ || 0), exemptions: [...new Set(exLine.map(x => x.split(/\s+/)[0]))].slice(0, 8),
      year_built: null, bldg_sqft: null, units: null, stories: null, bldg_class: null, neighborhood: null, lon: null, lat: null, _prefix: head[1] },
    units: { county: GCAD_COUNTY, account_id: head[2], tax_year: taxYear, unit_codes: ents.length ? ents : units.map(u => u.code), taxable, exemptions: {}, partial: false },
    unitNames: units };
}

// ---------- the BIS parcel layers (Waller, Austin, Washington, Grimes): the current year only ----------
// Gives values, owner and the county / city / school codes; no improvement detail and no special districts.
export function bisAccount(a, { county, centroid = null }) {
  const street = [t(a.situs_num), t(a.situs_street_prefx), t(a.situs_street), t(a.situs_street_sufix)].filter(Boolean).join(' '), city = caseName(a.situs_city);
  const id = t(a.prop_id_text || a.propidtxt || a.prop_id), yr = year(a.owner_tax_yr);
  const codes = [a.county ?? a.County, a.city ?? a.City, a.school ?? a.School, a.esdcode].map(t).filter(Boolean);
  const extra = t(a.entitycd).split(/[,\s]+/).map(t).filter(Boolean);
  const all = [...new Set([...codes, ...extra])].filter(c => c !== 'CAD');
  return { account: { county, account_id: id, tax_year: yr, roll: 'current', geo_id: t(a.geo_id) || null, owner: t(a.file_as_name) || null,
      mailing: [t(a.addr_line1), t(a.addr_line2), t(a.addr_line3), [t(a.addr_city), t(a.addr_state), t(a.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
      situs: street ? caseName(street) + (city ? ', ' + city : '') : null, situs_city: city || null, situs_zip: zip5(a.situs_zip),
      legal: [t(a.legal_desc), t(a.legal_desc2), t(a.legal_desc3)].filter(Boolean).join(' ') || null, state_class: t(a.statecode).split(',')[0] || null, land_use: null,
      acreage: num(a.legal_acreage), land_value: num(a.land_val), improvement_value: num(a.imprv_val), ag_value: null, market_value: num(a.market), appraised_value: null,
      exemptions: t(a.exemption).split(/[,\s]+/).filter(Boolean), year_built: null, bldg_sqft: num(a.livarea) || null, units: null, stories: null, bldg_class: null, neighborhood: t(a.hood_cd) || null,
      lon: centroid ? Math.round(centroid[0] * 1e6) / 1e6 : null, lat: centroid ? Math.round(centroid[1] * 1e6) / 1e6 : null },
    units: { county, account_id: id, tax_year: yr, unit_codes: all, taxable: {}, exemptions: {}, partial: !extra.length } };
}
// the centre of an Esri polygon (the average of its first ring's points: fine for a parcel)
export function ringCentroid(g) { const r = g?.rings?.[0]; if (!r?.length) return null; let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; }

// ---------- appraisal district rate tables printed as PDFs (text from pdftotext -layout) ----------
// Waller: "CWR  City of Waller  0.328  0.1184  0.4464  Waller ISD" (code, name, M&O, I&S, total, collector); the county's
// general fund and its farm-to-market / flood fund are two codes (GWA, RFM).
export function wallerRateText(text, { taxYear }) {
  const out = [];
  for (const l of text.split('\n')) {
    const m = /^\s*([A-Z][A-Z0-9]{1,6})\s{2,}(.+?)\s{2,}(NO LEVY IN \d{4}|WILL NOT EVER LEVY|[\d.]+)(?:\s+([\d.]+))?(?:\s+([\d.]+))?/.exec(l); if (!m || /^ENTITY$/.test(m[1])) continue;
    const name = m[2].trim(), none = /LEVY/.test(m[3]), a = none ? null : num(m[3]), b = num(m[4]), c = num(m[5]);
    const [mo, is, tot] = c != null ? [a, b, c] : b != null ? [a, null, b] : [a, null, a];
    out.push({ unit: { county: 'Waller', unit_code: m[1], name, unit_type: typeOfName(name) }, rate: { unit_key: 'Waller:' + m[1], tax_year: taxYear, source: 'wcad', county: 'Waller', name, unit_type: typeOfName(name), mo_rate: none ? 0 : mo, is_rate: none ? 0 : is ?? (tot != null && mo != null ? round6(tot - mo) : null), total_rate: none ? 0 : tot, status: none ? 'no levy' : 'adopted' } });
  }
  return out;
}
// Montgomery tax office: "SCO 201  Conroe ISD  0.9471 0.6671 0.2800 140,000 ..." (code, TU ID, name, total, M&O, I&S, exemptions)
export function montgomeryRateText(text, { taxYear }) {
  const out = [];
  for (const l of text.split('\n')) {
    const m = /^\s*([A-Z][A-Z0-9]{1,5})\s+(\d{1,4})\s+(.+?)\s{2,}([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(l); if (!m) continue;
    const name = m[3].trim().replace(/\s+/g, ' ');
    out.push({ unit: { county: 'Montgomery', unit_code: m[1], name, unit_type: typeOfName(name) }, rate: { unit_key: 'Montgomery:' + m[1], tax_year: taxYear, source: 'mctotx', county: 'Montgomery', name, unit_type: typeOfName(name), total_rate: num(m[4]), mo_rate: num(m[5]), is_rate: num(m[6]), status: 'adopted' } });
  }
  return out;
}

// ---------- shared ----------
// a stable hash of a row's values (FNV-1a over sorted JSON): a re-run of the same file finds nothing changed
export function rowHash(o) {
  const s = JSON.stringify(Object.keys(o).filter(k => !k.startsWith('_') && k !== 'h' && k !== 'source_run_id' && k !== 'updated_at').sort().map(k => [k, o[k]]));
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0');
}
export const stripPrivate = o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
