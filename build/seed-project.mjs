// Seed a project into the team's Projects (Supabase site_projects, the table api/projects.js syncs) from a builder in
// build/projects/: `node build/seed-project.mjs op-0046 [--dry] [--offline] [--out file]`. Run by the "Seed project"
// workflow, which has the Supabase key; the builder makes the project document (parcels, the option's site and pieces).
//   The parcels come from the county appraisal district's own parcel layer (api/building.js CADS, the layer the property
//   card reads), by account number, so the outlines and values are the county's; --offline (or a layer that doesn't
//   answer) uses the builder's saved copies instead and says so.
//   --dry builds and reports but writes nothing. The document is also written to --out (default build/projects/<name>.out.json
//   when --out is given without a path) for a look.
// Last edit wins in site_projects, like the app's own sync: seeding again replaces the team's copy of this project.
import fs from 'node:fs';
import { supa } from '../lib/supa.mjs';
import { CADS, normalizeCad, apnWheres } from '../api/building.js';

const args = process.argv.slice(2), name = args.find(a => !a.startsWith('--')), flag = f => args.includes(f);
const outIdx = args.indexOf('--out'), out = outIdx >= 0 ? (args[outIdx + 1] && !args[outIdx + 1].startsWith('--') ? args[outIdx + 1] : 'build/projects/' + name + '.out.json') : null;
if (!name || !/^[\w-]+$/.test(name)) { console.error('usage: node build/seed-project.mjs <project> [--dry] [--offline] [--out file]'); process.exit(2); }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const M = await import('./projects/' + name + '.mjs');
const P = M.PROJECT;

// the county's record for an account, as the property card would read it
async function cadParcel(county, apn) {
  const cad = CADS.find(c => c.county === county); if (!cad) throw new Error('No appraisal district layer for ' + county + ' County');
  for (const where of apnWheres(cad, apn)) {
    const q = new URLSearchParams({ f: 'json', where, outFields: '*', returnGeometry: 'true', outSR: '4326', geometryPrecision: '7', resultRecordCount: '5' });
    try {
      const r = await fetch(cad.url + '/query?' + q, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'RealEstateIntelligence/1.0 (seed project)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json(); if (d.error) throw new Error(d.error.message || 'service error');
      const f = (d.features || []).find(x => x.geometry?.rings); if (f) return normalizeCad(cad, f.attributes, f.geometry);
    } catch (e) { log('  ' + cad.name + ' ' + where + ': ' + e.message); }
  }
  return null;
}

const parcels = [], notes = [];
for (const apn of P.apns) {
  const saved = M.FALLBACK_PARCELS.find(p => String(p.propId) === String(apn));
  let rec = null;
  if (!flag('--offline')) { rec = await cadParcel(P.county, apn).catch(e => { log('  ' + apn + ': ' + e.message); return null; }); }
  if (rec?.geometry) { log('account ' + apn + ': ' + rec.owner + ' · ' + (rec.area || '') + ' · market ' + (rec.marketValue || '—') + ' (county layer)'); parcels.push(rec); }
  else if (saved) { log('account ' + apn + ': saved copy (' + saved.owner + ')'); notes.push(apn + ' from the saved copy'); parcels.push(saved); }
  else throw new Error('No record for account ' + apn);
}

const doc = M.buildProject(parcels, { now: new Date().toISOString() });
const s = M.summary(doc), json = JSON.stringify(doc);
log('built ' + doc.name + ': ' + s.acres + ' acres, ' + s.buildings + ' buildings, ' + s.gfa.toLocaleString('en-US') + ' sf, ' + s.spaces + ' spaces (' + s.required + ' required), ponds ' + s.pondSf.toLocaleString('en-US') + ' sf, ' + s.elements + ' pieces, ' + (json.length / 1024).toFixed(0) + ' KB');
if (s.overlaps.length) log('overlapping pieces: ' + s.overlaps.join(', '));
if (s.outside.length) log('pieces outside the site: ' + s.outside.join(', '));
if (notes.length) log('note: ' + notes.join('; '));
if (json.length > 500000) throw new Error('The project document is over the 500 KB the sync accepts');
if (out) { fs.writeFileSync(out, JSON.stringify(doc, null, 1)); log('wrote ' + out); }
console.log(JSON.stringify(s));

if (flag('--dry')) { log('dry run: nothing written'); process.exit(0); }
const db = supa(); if (!db) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (or run in the Seed project workflow)');
await db.upsert('site_projects', [{ id: doc.id, name: doc.name.slice(0, 200), doc, deleted: false, updated_by: (doc.by || 'seed').slice(0, 80), updated_at: doc.updated }], 'id');
log('saved to site_projects as ' + doc.id + ' (' + db.via + '): it shows in Projects on the next sync');
