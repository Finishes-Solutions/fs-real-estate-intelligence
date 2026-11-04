// Planning-level detention estimate: the storage a site needs so its peak runoff after development doesn't exceed the
// peak before, by NRCS TR-55 (Urban Hydrology for Small Watersheds, 1986), chapter 6 "Storage volume for detention
// basins": the runoff volume after development (curve-number method, chapter 2) times the storage ratio Vs/Vr read from
// the ratio of the allowed outflow to the post-development peak (qo/qi), Figure 6-1 as its fitted cubic.
//   qo/qi is approximated here by the ratio of the rational-method runoff coefficients before and after (the same
//   rainfall intensity and time of concentration on both sides: the post-development peak is if anything higher, so the
//   storage reads a little low, and the note says it's an estimate).
// Rainfall: the design storm's 24-hour depth at the site, from NOAA Atlas 14 (the point precipitation-frequency
// estimates, fetched by api/rainfall.js and recorded on the plan, so a replay never refetches); where none was fetched, a
// regional figure from Atlas 14 Volume 11 (Texas, 2018) where the site falls in one of the regions below, else none
// (the rule of thumb stands, as before). A place's own minimum (the rule sheet's ac-ft an acre, or a region's district
// minimum) is kept as a floor. Never a drainage design: the civil engineer sizes the pond.

// TR-55 Table 2-2a curve numbers by hydrologic soil group: impervious (paved, roofs), open space in good condition
// (grass cover > 75%: lawn and landscape), and pasture / meadow in good condition (the land before development)
export const CN = { impervious: { A: 98, B: 98, C: 98, D: 98 }, open: { A: 39, B: 61, C: 74, D: 80 }, meadow: { A: 30, B: 58, C: 71, D: 78 } };
// rational-method runoff coefficients for flat ground (0-2%), the commonly tabulated planning values (ASCE / WEF Manual
// of Practice 37 ranges, the middle of each): impervious, lawn by soil group, pasture / meadow by soil group
export const RC = { impervious: 0.95, open: { A: 0.08, B: 0.13, C: 0.18, D: 0.23 }, meadow: { A: 0.10, B: 0.16, C: 0.20, D: 0.25 } };
// TR-55 Table 6-1 (the fitted Figure 6-1): Vs/Vr = C0 + C1 r + C2 r^2 + C3 r^3, r = qo/qi; rainfall distributions II and
// III (the Gulf Coast is type III), and I / IA
export const VS_VR = { 'II': [0.682, -1.43, 1.64, -0.804], 'III': [0.682, -1.43, 1.64, -0.804], 'I': [0.660, -1.76, 1.96, -0.730], 'IA': [0.660, -1.76, 1.96, -0.730] };
export const HYDRO = { rp: 100, hsg: 'C', type: 'III' }; // defaults: the 100-year storm (most Texas drainage criteria size detention for it), soil group C (an assumption: the soil survey decides), type III rainfall (Gulf Coast)

// NOAA Atlas 14 Volume 11 (Texas, 2018) 24-hour depths, inches, by return period, for the regions a site is likely to
// be in when no point estimate was fetched; each a rounded middle of the region's range, labelled as such
export const RAIN_REGIONS = [
  { id: 'tx-upper-coast', name: 'Upper Texas coast (Houston, Galveston)', box: [-96.2, 28.8, -93.8, 30.6], depth: { 2: 4.9, 10: 8.3, 25: 10.6, 100: 15.0 }, range: '13-17 in for the 100-year 24-hour',
    localMin: { rate: 0.55, source: 'Harris County Flood Control District criteria: about 0.55 ac-ft an acre as the usual minimum for small sites (an assumption until the county or district rules are read)' } },
  { id: 'tx-central-east', name: 'Central and east Texas (Austin, College Station, Dallas, Tyler)', box: [-98.5, 29.5, -93.5, 33.8], depth: { 2: 4.2, 10: 6.6, 25: 8.3, 100: 11.5 }, range: '9.5-13 in for the 100-year 24-hour' }
];
export function regionalRain(lonlat, rp = HYDRO.rp) {
  const [lon, lat] = lonlat || []; if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const r = RAIN_REGIONS.find(g => lon >= g.box[0] && lat >= g.box[1] && lon <= g.box[2] && lat <= g.box[3]); if (!r || !(r.depth[rp] > 0)) return null;
  return { p: r.depth[rp], rp, duration: '24-hr', source: 'NOAA Atlas 14 Vol. 11 (Texas, 2018), regional figure for the ' + r.name + ' (' + r.range + '); fetch the point estimate for the site', regional: r.id, ...(r.localMin ? { localMin: r.localMin } : {}) };
}

// runoff depth (in) from rainfall P (in) on curve number CN, the initial abstraction 0.2 S (TR-55 eq. 2-3, 2-4)
export function runoff(P, cn) { if (!(P > 0) || !(cn > 0)) return 0; const S = 1000 / Math.min(cn, 99.9) - 10, Ia = 0.2 * S; return P <= Ia ? 0 : (P - Ia) ** 2 / (P - Ia + S); }

// the storage a site needs, acre-feet: acres, imp (the impervious share, 0-1, roofs + paving + pools), P (the design
// storm's 24-hour depth, in), hsg, type. -> { volume, vr, ratio, qoqi, cnPost, cnPre, cPost, cPre, qPost, method }
export function detentionTR55({ acres, imp, P, hsg = HYDRO.hsg, type = HYDRO.type }) {
  const g = CN.open[hsg] ? hsg : HYDRO.hsg, i = Math.max(0, Math.min(1, +imp || 0)), A = Math.max(0, +acres || 0);
  const cnPost = i * CN.impervious[g] + (1 - i) * CN.open[g], cnPre = CN.meadow[g]; // (TR-55 composite CN for connected impervious area)
  const qPost = runoff(P, cnPost), vr = qPost / 12 * A, cPost = i * RC.impervious + (1 - i) * RC.open[g], cPre = RC.meadow[g];
  const qoqi = Math.max(0.1, Math.min(0.9, cPre / cPost)), k = VS_VR[type] || VS_VR.III, ratio = Math.max(0, k[0] + k[1] * qoqi + k[2] * qoqi ** 2 + k[3] * qoqi ** 3);
  const volume = +(vr * ratio).toFixed(3);
  return { volume, vr: +vr.toFixed(3), ratio: +ratio.toFixed(3), qoqi: +qoqi.toFixed(3), cnPost: +cnPost.toFixed(1), cnPre, cPost: +cPost.toFixed(2), cPre, qPost: +qPost.toFixed(2), imp: +i.toFixed(3), P, hsg: g, type,
    method: 'NRCS TR-55 ch. 6 storage (post-development runoff volume by curve number x Vs/Vr from qo/qi, type ' + type + ' rainfall), qo/qi from rational coefficients' };
}

// the impervious share a use typically draws, before the plan is drawn (roofs, paving and pools over the developed
// land): planning defaults, replaced by the drawn plan's own share once there is one
export const IMP_DEFAULT = { multifamily: 0.6, townhomes: 0.55, duplex: 0.45, sfr: 0.4, retail: 0.85, restaurant: 0.85, office: 0.8, medical: 0.8, hotel: 0.8, industrial: 0.85, flex: 0.85, storage: 0.85, fuel: 0.9, church: 0.7, other: 0.7 };
export const impOfUse = use => IMP_DEFAULT[use] ?? 0.7;
// the drawn plan's impervious share of the land it develops (buildings, garages, paving, plazas, pools over the land
// less the ponds and the land held for later)
const IMPERVIOUS = new Set(['building', 'garage', 'parking', 'drive', 'truck', 'plaza', 'pool', 'patio', 'court', 'trash', 'foodtruck', 'canopy', 'pad']);
export function impOfElements(els, siteSf, areaOf) {
  const fut = els.filter(e => e.kind === 'green' && e.future).reduce((s, e) => s + areaOf(e), 0), pond = els.filter(e => e.kind === 'pond').reduce((s, e) => s + areaOf(e), 0);
  const imp = els.filter(e => IMPERVIOUS.has(e.kind) && !e.future && !(e.kind === 'drive' && e.emergency)).reduce((s, e) => s + areaOf(e), 0); // (a gated emergency lane is grass pavers)
  const dev = Math.max(1, siteSf - fut - pond); return Math.max(0, Math.min(1, imp / dev));
}

// NOAA PFDS (hdsc.nws.noaa.gov cgi_readH5.py, type=pf, data=depth, series=pds) answers with JavaScript text holding
// `quantiles = [[...], ...]`: rows are durations (5, 10, 15, 30, 60 min; 2, 3, 6, 12, 24 h; 2, 3, 4, 7, 10, 20, 30, 45, 60
// days), columns return periods (1, 2, 5, 10, 25, 50, 100, 200, 500, 1000 years). -> { 24-hour depth by return period }
export const PFDS_RP = [1, 2, 5, 10, 25, 50, 100, 200, 500, 1000];
export function parsePFDS(text) {
  const m = /quantiles\s*=\s*(\[[\s\S]*?\]\s*\])\s*;/.exec(String(text || '')); if (!m) return null;
  let q; try { q = JSON.parse(m[1].replace(/'/g, '"')); } catch { return null; }
  const row = q[9]; if (!Array.isArray(row) || row.length < 7) return null;
  const out = {}; PFDS_RP.forEach((rp, i) => { const v = +row[i]; if (v > 0) out[rp] = v; }); return Object.keys(out).length ? out : null;
}
