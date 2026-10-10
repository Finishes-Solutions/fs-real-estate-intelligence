// The CRE report runner (Finishes' feasibility pipeline, a separate Vercel project) driven from the map: the request
// bodies api/runner.js sends it, and how its documents come back. Tested in test/runner.mjs.
//
// The runner was built for Monday.com: a form submission starts a chain of stages (research report -> best use ->
// site plan -> pro forma -> fact register -> risk -> opportunity screening) and every stage answers 202 at once, then
// POSTs each finished document to a callbackUrl. From the map we:
//   - skip its parcel-lookup stage and start at the research report with the parcels the map already has, written as
//     its own "Confirmed Parcel Record" block (lib/selection.mjs enrichmentBlock), so its research starts from the
//     county record and no parcel is paid for twice;
//   - set test_mode, which in the runner means "send every document to my callbackUrl and touch nothing else": no
//     Monday item, no Zapier hooks, no board columns. (Its run history then files these under TEST-, which is fine.)
//   - give it a callbackUrl back to api/runner.js, signed per run, where each document is saved.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { combineParcels, runnerFeatures, enrichmentBlock } from './selection.mjs';

// documents each kind of run produces, in reading order (doc_type is the runner's own name for each)
export const DOCS = {
  screening: 'Opportunity Screening Report',
  report: 'Initial Information Report',
  business: 'Development Business Plan',
  proforma: 'Pro Forma',
  preliminary_site: 'Preliminary Site Plan',
  site_map: 'Parcel Map',
  verify: 'Fact & Assumption Register',
  risk: 'Risk Analysis',
  images: 'Concept Renderings'
};
export const KINDS = {
  feasibility: { label: 'Feasibility Package', endpoint: '/api/run-report', docs: ['screening', 'report', 'business', 'proforma', 'preliminary_site', 'verify', 'risk'] },
  site_plan: { label: 'Preliminary Site Plan', endpoint: '/api/run-site-plan', docs: ['preliminary_site'] },
  parcel_map: { label: 'Parcel Map', endpoint: '/api/run-sitemap', docs: ['site_map'] }
};
// where each document's HTML rides in its drop
const HTML_FIELD = { report: 'report_html', business: 'business_html', proforma: 'proforma_html', verify: 'verify_html', risk: 'risk_html', screening: 'screening_html' };

export const sign = (id, key) => createHmac('sha256', String(key)).update('runner:' + id).digest('hex').slice(0, 40);
export function verify(id, sig, key) {
  if (!key || !sig || !id) return false;
  const a = Buffer.from(sign(id, key)), b = Buffer.from(String(sig));
  return a.length === b.length && timingSafeEqual(a, b);
}

const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const numOr = v => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : ''; };

// options from the dialog (or the assistant), cleaned: the program to plan for, what the operator knows, extras
export function cleanOptions(o = {}) {
  return {
    program: clip(o.program, 300), notes: clip(o.notes, 2000), purchase_price: numOr(o.purchase_price),
    floors: Math.min(60, Math.max(0, Math.round(+o.floors || 0))) || '', units: Math.min(5000, Math.max(0, Math.round(+o.units || 0))) || '',
    development_acres: numOr(o.development_acres), images: !!o.images
  };
}

// the operator-intake block the runner's research stage reads (its api/_intake.js format and precedence wording):
// what the person running the report said about the site. It is party-reported, never a verified fact.
export function intakeFor(opts) {
  const facts = { request_type: 'Feasibility', owner_best_use: opts.program || '', project_description: opts.notes || '',
    purchase_price: opts.purchase_price || '', purchase_price_known: opts.purchase_price ? 'Yes' : '', development_acres: opts.development_acres || '' };
  const rows = [['Category', 'Feasibility'], ['Owner Proposed Best Use', opts.program], ['Project Description', opts.notes],
    ['Purchase Price (If Owned)', opts.purchase_price ? '$' + Number(opts.purchase_price).toLocaleString('en-US') : ''], ['Development AC.', opts.development_acres]]
    .filter(([, v]) => v !== '' && v != null);
  const block = rows.length < 2 ? '' : '## Operator Intake — Submitted by Finishes Solutions Staff (Party-Reported)\n' +
    'The following was entered by the Finishes Solutions team member who ran this report from the Real Estate Intelligence map. ' +
    'Treat it with this precedence: **county/CAD records outrank it, and it outranks anything you find by web search.** It is a party-reported fact, not a Verified Fact and not third-party diligence.\n\n' +
    '| Intake Field | Answer (Party-Reported) |\n|---|---|\n' + rows.map(([k, v]) => '| ' + k + ' | ' + String(v).replace(/\|/g, '/').replace(/\n+/g, ' ') + ' |').join('\n') + '\n';
  return { block, facts };
}

// the site's street address for the runner (it needs one, or parcel id + county + state)
function addressOf(parcels) {
  const p = parcels.find(x => x.situs) || parcels[0] || {};
  return { address: [p.situs, p.city && !String(p.situs || '').toLowerCase().includes(String(p.city).toLowerCase()) ? p.city : '', 'TX', p.zip].filter(Boolean).join(', '),
    city: p.city || '', zip: p.zip || '' };
}

// The request bodies for one run. parcels: lib/selection.mjs selectedParcels().parcels (re-checked by the caller).
// Returns [{ endpoint, body }] (a feasibility run also asks for the parcel map, which isn't part of its chain).
export function requestsFor(kind, parcels, opts, { callbackUrl, secret }) {
  const k = KINDS[kind]; if (!k) throw new Error('Unknown report: ' + kind);
  if (!parcels?.length) throw new Error('Pick at least one parcel first.');
  const site = combineParcels(parcels), fc = runnerFeatures(parcels), where = addressOf(parcels);
  const ids = parcels.map(p => p.propId).filter(Boolean);
  const common = {
    ...where, county: site.counties[0] || '', state: 'TX', parcelId: ids.join(', '), callbackUrl, test_mode: true, ...(secret ? { secret } : {}),
    total_acres: site.totals.acres ?? '', total_sqft: site.totals.sqft ?? '', total_assessed_value: site.totals.marketValue ?? '',
    total_land_value: site.totals.landValue ?? '', total_improvement_value: site.totals.improvementValue ?? ''
  };
  const geo = site.withOutline ? fc : null;
  const intake = intakeFor(opts);
  if (kind === 'parcel_map') {
    if (!geo) throw new Error('A parcel map needs parcel outlines, and none of these parcels has one.');
    return [{ endpoint: k.endpoint, body: { ...common, parcels_geojson: geo } }];
  }
  if (kind === 'site_plan') {
    if (!geo && !site.totals.acres) throw new Error('A site plan needs the parcel outline or its acreage, and these parcels have neither.');
    return [{ endpoint: k.endpoint, body: { ...common, parcels_geojson: geo || '', selected_program: opts.program || '', floors: opts.floors, units: opts.units, intake_facts: intake.facts } }];
  }
  // feasibility: the research report starts the chain; the parcel map runs beside it
  const out = [{ endpoint: k.endpoint, body: { ...common, parcel_enrichment: enrichmentBlock(parcels, site), intake_block: intake.block, intake_facts: intake.facts,
    parcels_geojson: geo ? JSON.stringify(geo) : '', 'Owner Proposed Best Use': opts.program || '', 'Project Description': opts.notes || '' } }];
  if (geo) out.push({ endpoint: KINDS.parcel_map.endpoint, body: { ...common, parcels_geojson: geo } });
  return out;
}

// the documents a run should end with
export function expectedDocs(kind, parcels, opts) {
  const docs = KINDS[kind].docs.slice(), site = combineParcels(parcels);
  if (kind === 'feasibility' && site.withOutline) docs.push('site_map');
  if (kind === 'feasibility' && opts.images) docs.push('images');
  return docs;
}

// One POST from the runner -> what to save. Returns
//   { doc: { doc_type, ok, title, name, html, error, meta } }   a document (or a stage that failed)
//   { kickoff: body }                                             the risk stage asking for renderings
//   { note }                                                      something to log and ignore (parcel drops)
export function readDrop(b) {
  const t = String(b?.doc_type || '');
  if (t === 'images-kickoff') return { kickoff: b };
  if (t === 'parcel' || t === 'parcel-skipped') return { note: t };
  // stages 1 and 3 report a failure with no doc_type at all: { ok:false, stage, error }
  if (!t && b?.ok === false) return { doc: { doc_type: 'error', ok: false, title: 'Pipeline error', name: '', html: '', error: clip(b.error || 'The report runner stopped.', 2000), meta: { stage: clip(STAGE[b.stage] || b.stage, 120) } } };
  if (t === 'pipeline_error') return { doc: { doc_type: 'error', ok: false, title: 'Pipeline error', name: '', html: '', error: clip(b.error || 'The report runner stopped.', 2000), meta: { stage: clip(b.stage, 120) } } };
  if (!DOCS[t] && t !== 'images_sheet') return { note: 'unknown doc_type ' + t.slice(0, 40) };
  if (t === 'images_sheet') return { note: 'images_sheet' }; // its HTML is off by default; the images drop carries the pictures
  const ok = b.ok !== false && !b.error;
  const html = String(b[HTML_FIELD[t]] || b.pdf_html || '');
  const meta = {};
  for (const [k, v] of Object.entries(b)) if (/^(recommendation|viability_score|risk_score|risk_rating|best_use|program|program_key|gross_sf|net_developable_sf|footprint_sf|building_sf|units|stalls|total_project_cost|break_even|parcel_count|orientation|screening_html_url)$/.test(k) && v !== '' && v != null && typeof v !== 'object') meta[k] = typeof v === 'string' ? v.slice(0, 300) : v;
  if (t === 'images') meta.images = [1, 2, 3, 4, 5].map(i => b['image_' + i + '_url'] ? { url: String(b['image_' + i + '_url']).slice(0, 600), label: clip(b['image_' + i + '_label'] || b['image_' + i + '_name'], 120) } : null).filter(Boolean);
  return { doc: { doc_type: t, ok, title: DOCS[t], name: clip(b.pdf_name || '', 200), html: ok ? html : '', error: ok ? '' : clip(b.error || 'This document failed.', 2000), meta } };
}

const STAGE = { 1: 'Initial Information Report', 3: 'Best use and site planning', 4: 'Pro forma', 5: 'Fact & Assumption Register', 7: 'Risk Analysis', 9: 'Opportunity Screening' };
// side documents: one failing doesn't stop the main chain, which carries on and still delivers
const SIDE = new Set(['site_map', 'images', 'preliminary_site']);

// a run's state from its documents: running until every expected one has arrived or failed. A failure in the main
// chain (or a pipeline error) ends the run: the stages after it never start.
export function runStatus(expected, docs) {
  const got = new Set(docs.filter(d => d.ok).map(d => d.doc_type)), bad = docs.filter(d => !d.ok);
  const settled = expected.every(t => got.has(t) || bad.some(d => d.doc_type === t));
  const broken = bad.some(d => !SIDE.has(d.doc_type));
  if (!settled && !broken) return 'running';
  if (!bad.length) return 'done';
  return expected.some(t => got.has(t)) ? 'partial' : 'failed';
}
