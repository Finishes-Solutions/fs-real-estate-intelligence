// @ts-check
// The sample project the sample run (scripts/sample-run.mjs) and the screenshots (scripts/screenshots.mjs) use: three
// real, anonymized appraisal-district parcel outlines near Waller, TX (16.16 acres; test/fixtures/fz/site/parcels-3.geojson),
// laid out as garden apartments by the platform's layout engine, with three scenarios. The asking price is a sample
// input, labelled as such. Built offline: nothing here reads the network.
import { readFile } from 'node:fs/promises';
import * as P from '../lib/feasibility/pipeline.mjs';
import * as M0 from '../lib/feasibility/model.mjs';

// market: marketContext() (the Rates +1% scenario is one point over the rates the study derives from it)
export async function sampleProject({ root = new URL('..', import.meta.url), market = null } = {}) {
  const fc = JSON.parse(await readFile(new URL('test/fixtures/fz/site/parcels-3.geojson', root), 'utf8'));
  const parcels = fc.features.map((f, i) => M0.parcelFrom({ key: 'sample-' + (i + 1), label: f.properties.name, acres: +(+f.properties.acres).toFixed(3), owner: 'Sample owner', city: 'Waller', zip: '77484', county: 'Waller', geometry: f.geometry },
    M0.src('data', 'Appraisal-district parcel outline (anonymized sample fixture)', { confidence: 'medium' })));
  const site = P.siteFromParcels(parcels, { name: 'Option A', id: 'sample-opt-a' }), laid = P.autoLayout(site, { use: 'multifamily' });
  if (!laid) throw new Error('the layout engine found no layout for the sample site');
  const plan = { ...laid, id: 'sample-opt-a', name: 'Option A', created: '2026-10-24T12:00:00.000Z', updated: '2026-10-24T12:00:00.000Z' };
  const project = {
    id: 'sample-waller-apartments', name: 'Sample: Waller garden apartments', client: 'Finishes Solutions (sample)', status: 'review', use: 'Garden apartments',
    parcels, plans: [plan], created: '2026-10-24T12:00:00.000Z', updated: '2026-10-24T12:00:00.000Z', by: 'Sample run',
    fz: { ...M0.newFeasibility(), optionId: plan.id,
      intake: { state: 'TX', address: 'Sample site (anonymized), Waller', city: 'Waller', county: 'Waller', zip: '77484', jurisdiction: 'Waller County', targetUse: 'Garden apartments', landBasis: 'asking', landPrice: 2600000 },
      scenarios: [
        { id: 'rates-up', name: 'Rates +1%', overrides: { rate: +((market?.rates?.sofr?.value ?? 4) + 3 + 1).toFixed(2), permRate: +((market?.rates?.t10?.value ?? 4.25) + 1.75 + 1).toFixed(2) } },
        { id: 'more-1br', name: 'More one-bedrooms', overrides: {}, mix: [{ name: 'Studio', sf: 550, pct: 10 }, { name: '1 BR', sf: 760, pct: 60 }, { name: '2 BR', sf: 1100, pct: 25 }, { name: '3 BR', sf: 1350, pct: 5 }] },
        { id: 'cost-up', name: 'Costs +10%', overrides: { locationFactor: 1.1 } }
      ] }
  };
  return project;
}
