// @ts-check
// The study's two registers, the way the report runner's document set had them (a Fact & Assumption Register and a
// Risk Analysis), but built from the engine's own numbers by fixed rules: nothing here is written by a model.
//  - facts(): every input and measured fact with its value, source, as-of date and confidence;
//  - risks(): what could sink the deal, each with a level, why, and what would settle it.
import { sourceText, SOURCE_KINDS, GROUP_LABELS } from './model.mjs';

const pct = v => v == null || !Number.isFinite(v) ? 'n/a' : (v * 100).toFixed(2) + '%';
const usd = v => v == null || !Number.isFinite(v) ? 'n/a' : '$' + Math.round(v).toLocaleString('en-US');

// the assumption register plus the site's measured facts, as rows
export function facts(study) {
  const rows = [];
  const s = study.site;
  const f = (group, label, value, source) => rows.push({ group, label, value, source: sourceText(source), kind: source?.kind || '', kindLabel: SOURCE_KINDS[source?.kind] || '', asOf: source?.asOf || '', confidence: source?.confidence || '' });
  if (s) {
    const plan = { kind: 'plan', label: 'Measured on the concept layout', confidence: 'medium' }, parcel = { kind: 'data', label: 'Parcel outlines from the appraisal district / provider (not a survey)', confidence: 'medium' };
    f('Site', 'Site area', s.acres.toFixed(2) + ' acres (' + Math.round(s.siteSf).toLocaleString('en-US') + ' sf)', parcel);
    if (s.envelope) f('Site', 'Buildable envelope at a ' + s.envelope.setbackFt + ' ft setback', Math.round(s.envelope.envelopeSf).toLocaleString('en-US') + ' sf (' + Math.round(s.envelope.ratio * 100) + '% of the site)', { kind: 'derived', label: 'Distance-transform envelope of the parcels (lib/feasibility/envelope.mjs)', confidence: 'medium' });
    f('Site', 'Building area', Math.round(s.gfa).toLocaleString('en-US') + ' gross sf', plan);
    if (s.units) f('Site', 'Units', s.units.toLocaleString('en-US'), plan);
    f('Site', 'Parking', s.spaces + ' spaces of ' + s.required + ' required', plan);
    f('Site', 'Coverage / FAR', pct(s.coverage) + ' / ' + (s.far ?? 0).toFixed(2), plan);
    if (s.detentionAcFt) f('Site', 'Detention', s.detentionAcFt.toFixed(2) + ' ac-ft', { kind: 'plan', label: 'Stormwater sizing rule on the developed acres (the rate is a typical value, not a drainage study)', confidence: 'low' });
    for (const [k, v] of Object.entries(s.jurisdiction || {})) f('Jurisdiction', k, v, { kind: 'data', label: 'Platform site lookup (flood, districts, place)', confidence: 'medium' });
  }
  for (const a of study.register) f(groupName(a.group), a.label, fmtVal(a), a.source);
  for (const e of [['Library rates (to date and forward)', study.budget.escalation.library], ['Parametric rates (forward)', study.budget.escalation.parametric]]) f('Cost', 'Escalation: ' + e[0], '× ' + e[1].factor.toFixed(4), { kind: 'derived', label: [e[1].toDate.note, e[1].forward.note].filter(Boolean).join('; '), confidence: 'medium' });
  return rows;
}
const groupName = g => GROUP_LABELS[g] || 'Other';
export function fmtVal(a) {
  const v = a.value;
  switch (a.unit) {
    case 'pct': return (+v).toFixed(2).replace(/\.00$/, '') + '%';
    case 'share': return Math.round(v * 100) + '%';
    case 'x': return (+v).toFixed(2) + '×';
    case 'psf': return '$' + (+v).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '/sf';
    case 'nnn': return '$' + (+v).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '/sf/yr NNN';
    case 'psfmo': return '$' + (+v).toFixed(2) + '/sf/mo';
    case 'mo': return '$' + Math.round(v).toLocaleString('en-US') + '/mo';
    case 'months': return v + ' months';
    case 'years': return v + ' years';
    case 'usd': return usd(v);
    default: return String(v) + (a.unit && a.unit !== 'usd' ? ' ' + a.unit : '');
  }
}

// the risks, by fixed rules on the study's numbers (level: high | medium | low)
export function risks(study) {
  const out = [], add = (category, level, title, detail, settle) => out.push({ category, level, title, detail, settle });
  const h = study.pf.headline, s = study.site, v = study.values, reg = study.register;
  // ---- returns ----
  if (!h.forSale) {
    const spread = h.yoc != null ? h.yoc - v.marketCap / 100 : null;
    if (spread != null && spread < 0.01) add('Returns', spread < 0 ? 'high' : 'medium', 'Thin development spread', 'Yield on cost ' + pct(h.yoc) + ' against a ' + v.marketCap + '% market cap rate: ' + pct(spread) + ' of spread (1.0–1.5% is the usual minimum to build rather than buy).', 'Firm up rents and costs; a lower land basis or a denser program.');
    if (h.levIrr == null || h.levIrr < 0.12) add('Returns', h.levIrr == null || h.levIrr < 0.05 ? 'high' : 'medium', 'Levered IRR below a typical 12–15% development hurdle', 'Levered IRR ' + pct(h.levIrr) + ' over ' + Math.round(h.months / 12 * 10) / 10 + ' years.', 'Test the scenarios: financing, unit mix and costs.');
    if (h.dscr != null && h.dscr < 1.25) add('Financing', h.dscr < 1.0 ? 'high' : 'medium', 'Permanent loan coverage under 1.25×', 'DSCR ' + h.dscr.toFixed(2) + '× on the first stabilized year: the loan is sized down and more equity stays in.', 'Lower rate or longer amortization; more NOI.');
  } else if (h.margin != null && h.margin < 0.15) add('Returns', h.margin < 0.05 ? 'high' : 'medium', 'Thin for-sale margin', 'Margin ' + pct(h.margin) + ' of sales (15–20% is the usual target for a builder).', 'Sale prices, lot yield, absorption.');
  if (h.npvLev != null && h.npvLev < 0) add('Returns', 'medium', 'Negative NPV at the discount rate', 'Levered NPV ' + usd(h.npvLev) + ' at ' + v.discountRate + '%.', 'Revisit the hurdle or the deal.');
  // ---- sensitivity ----
  const t = study.sensitivity?.tornado; if (t?.rows?.length) { const top = t.rows[0]; if (top.lo != null && top.lo < 0) add('Returns', 'high', 'Returns turn negative on a common miss', top.label + ' ' + top.loText + ' takes the levered IRR to ' + pct(top.lo) + '.', 'Price the biggest driver first (' + top.label.toLowerCase() + ').'); }
  // ---- site and entitlement ----
  if (s) {
    if (s.spaces < s.required) add('Site', 'medium', 'Parking short of the requirement', s.spaces + ' spaces against ' + s.required + ' required.', 'Add parking, a shared-parking study or a variance.');
    if (s.issues?.length) add('Site', 'medium', 'Layout checks to resolve', s.issues.slice(0, 4).join(' '), 'Fix in the site plan editor.');
    const fz = s.floodZone; if (fz && /^(A|V)/i.test(fz)) add('Site', 'high', 'In a FEMA special flood hazard area (zone ' + fz + ')', 'Fill, elevation certificates, flood insurance and detention all cost more; some lenders limit exposure.', 'Elevation survey and a drainage engineer.');
    else if (fz == null) add('Site', 'low', 'Flood zone not checked', 'The site’s FEMA zone wasn’t looked up for this study.', 'Open the project’s Overview to look up the site.');
    add('Site', 'medium', 'Parcel lines are not a survey', 'Areas come from appraisal-district or provider outlines.', 'A boundary survey (or enter its metes and bounds at intake).');
    if (s.detentionAcFt > 0) add('Site', 'medium', 'Detention sized by rule of thumb', 'Detention ' + s.detentionAcFt.toFixed(2) + ' ac-ft from a typical release rate, not the jurisdiction’s criteria.', 'A drainage study by a civil engineer.');
  }
  // ---- cost ----
  const loc = reg.find(a => a.key === 'locationFactor'); if (loc && loc.source.confidence === 'low' && !loc.edited) add('Cost', 'high', 'Outside the cost library’s region', 'The cost rates were priced for the Waller / Houston area and no location factor is entered.', 'Enter a location factor, or get a local estimate.');
  add('Cost', 'medium', 'Costs are parametric, not bids', 'Building lines come from one Waller County project workbook (medium-low confidence) and platform rates (low confidence); none is a contractor price.', 'A GC budget or a cost consultant’s estimate.');
  const land = reg.find(a => a.key === 'landPrice'); if (land && land.source.kind !== 'user') add('Cost', 'medium', 'Land basis is not a price', 'Land is ' + land.source.label.toLowerCase() + '.', 'Enter the asking or contract price at intake.');
  // ---- market ----
  for (const a of reg.filter(a => a.key.startsWith('rents.') && a.marketCheck)) { const m = /\$([\d,]+)\/mo/.exec(a.marketCheck); const z = m ? +m[1].replace(/,/g, '') : null; if (z && a.value > z * 1.35) add('Market', 'medium', a.label + ' well above the ZIP’s typical rent', a.label + ' $' + a.value + ' vs ' + a.marketCheck + '. New Class A usually leads the area, but by this much needs comps.', 'Rent comps from a licensed provider or a broker survey.'); }
  add('Market', 'low', 'No sale or lease comps', 'Cap rates and rents are platform assumptions; Texas does not disclose sale prices.', 'Broker opinion of value or a licensed comps provider.');
  for (const n of study.notes || []) add('Inputs', 'low', 'Input outside its usual range', n.text, 'Check the input.');
  for (const e of study.errors || []) add('Inputs', 'medium', 'Input to check', e, 'Fix it in the workspace (Intake or Pro Forma).');
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
