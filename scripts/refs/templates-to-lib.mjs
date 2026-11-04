// Turns the reviewed reference templates (data/reference/templates.json) into the engine's module templates
// (lib/reftemplates.mjs). Only templates whose evidence is all in the DEV partition are used to drive generation:
// holdout families (data/reference/index.json) stay for evaluation. Each module's numbers are derived here, in the
// open, from the printed or scaled values the template records.
//   node scripts/refs/templates-to-lib.mjs
import fs from 'node:fs';

const T = Object.fromEntries(JSON.parse(fs.readFileSync('data/reference/templates.json', 'utf8')).templates.map(t => [t.id, t]));
const idx = JSON.parse(fs.readFileSync('data/reference/index.json', 'utf8'));
const part = Object.fromEntries((idx.projects || idx).map(p => [p.id, p.partition]));
const devOnly = t => t.evidence.every(e => part[e.project] === 'dev');

const out = {};
// garden walk-up: one module = one open breezeway stair stack (the 24-unit bar is two stacks)
{
  const t = T['mf-garden-breezeway-3s-24u']; if (!devOnly(t)) throw new Error('garden template cites holdout evidence');
  const stacks = t.stairs || 2, w = t.footprint.w_ft / stacks, upf = t.units_per_floor / stacks;
  out['mf-garden-breezeway-3s'] = { id: 'mf-garden-breezeway-3s', form: 'mf-garden', label: 'Garden building (breezeway stacks, 3 floors)', floors: t.floors, floorsRange: [2, 3],
    module: { label: 'breezeway stack', w, d: t.footprint.d_ft, unitsPerFloor: upf }, minModules: 2, corridor: 'open breezeway', stairs: 'one a module', elevators: 0,
    grossSfPerUnit: Math.round(t.gross_sf / t.units), unitMix: t.unit_mix, efficiency: null, source: t.id, evidence: t.evidence.map(e => e.project), evidence_strength: t.evidence_strength,
    derivation: `module ${t.footprint.w_ft} ft bar ÷ ${stacks} stairs = ${w} ft; ${t.units_per_floor} units a floor ÷ ${stacks} = ${upf}; depth ${t.footprint.d_ft} ft (${t.notes.match(/Default[^.]*\./)?.[0] || 'template default'}); at least 2 stacks (the 24-, 30- and 36-unit references)` };
}
// studio / one-bedroom garden building: the same reviewed breezeway stack (75 x 60 ft) holding six smaller homes a floor
// instead of four. No studio-only building was reviewed in the library, so this is an ESTIMATE: 6 homes a floor puts
// about 750 gross sf a home at 3 floors, consistent with the reviewed 1-bed sizes (Creekview 1A 570 sf; P37 1-beds).
{
  const g = out['mf-garden-breezeway-3s'];
  out['mf-garden-studio-3s'] = { ...g, id: 'mf-garden-studio-3s', form: 'mf-garden-studio', label: 'Studio / 1-bed garden building (breezeway stacks, 3 floors)',
    module: { ...g.module, unitsPerFloor: 6 }, grossSfPerUnit: Math.round(g.module.w * g.module.d / 6), unitMix: { Studio: 4, '1BR': 2, source: 'estimate' },
    evidence_strength: 'estimate', derivation: g.derivation + '; 6 studio / 1-bed homes a floor a stack instead of 4 (estimate: no reviewed studio building)' };
}
// mid-rise: one module = a double-loaded corridor bay, two units each side of the corridor
{
  const t = T['mf-midrise-corridor-4s-110u']; if (!devOnly(t)) throw new Error('mid-rise template cites holdout evidence');
  const d = t.footprint.d_ft, perSide = t.units_per_floor / 2, unitW = t.footprint.area_sf / d / perSide, w = Math.round(2 * unitW);
  const mk = (floors, strength, extra) => ({ id: 'mf-midrise-corridor-' + floors + 's', form: 'mf-midrise', label: 'Mid-rise bar (double-loaded corridor, ' + floors + ' floors)', floors,
    module: { label: 'corridor bay', w, d, unitsPerFloor: 4 }, minModules: 4, corridor: 'double-loaded', stairs: null, elevators: null,
    grossSfPerUnit: Math.round(t.gross_sf / t.units), unitMix: t.unit_mix, efficiency: t.efficiency, source: t.id, evidence: t.evidence.map(e => e.project), evidence_strength: strength,
    derivation: `level 1 ${t.footprint.area_sf} sf ÷ ${d} ft deep ÷ ${perSide} units a side = ${unitW.toFixed(1)} ft a unit; bay of 2 a side = ${w} ft; stairs and elevators unknown in the evidence` + (extra || '') });
  out['mf-midrise-corridor-4s'] = mk(4, t.evidence_strength);
  out['mf-midrise-corridor-5s'] = mk(5, 'estimate', '; 5 floors is an extrapolation of the 4-floor evidence (no reviewed 5-floor dev reference)');
}
// tuck-under rows: one home a bay over its own 1-car garage, the garages facing an internal drive (E053 Portland Road
// Apartments, type A.1: an 80 x 42 ft row of four 2-story 3BR homes, each with an 11 x 22 ft tuck-in garage, the garages
// on a 22 ft internal drive, patios on the other side). One module = one home's bay.
{
  const t = T['th-tuck-garage-row-4u-2s']; if (!devOnly(t)) throw new Error('tuck-under template cites holdout evidence');
  const w = t.footprint.w_ft / t.units;
  out['mf-tuckunder-2s'] = { id: 'mf-tuckunder-2s', form: 'mf-tuck-under', label: 'Tuck-under row (a garage under each home, ' + t.floors + ' floors)', floors: t.floors, floorsRange: [2, 3],
    module: { label: 'home over its garage', w, d: t.footprint.d_ft, unitsPerFloor: 1 / t.floors }, minModules: 3, maxModules: 6, garagesPerModule: t.parking.stalls_in_building / t.units, garage: { w: 11, d: 22 }, driveFt: 22,
    corridor: t.corridor, stairs: 'in each home', elevators: 0, grossSfPerUnit: Math.round(t.gross_sf / t.units), unitMix: t.unit_mix, efficiency: null, source: t.id, evidence: t.evidence.map(e => e.project), evidence_strength: t.evidence_strength,
    derivation: `row ${t.footprint.w_ft} ft ÷ ${t.units} homes = ${w} ft a bay; ${t.footprint.d_ft} ft deep; one ${t.parking.type.replace(/ \+ apron/, '')} a home; the garages on a ${'22'} ft internal drive (E053 type A.1). A row of 3 to 6 bays (the reference row has 4; 6 is an estimate). 3 floors is an extrapolation (no reviewed 3-story tuck-under walk-up)` };
}
const ver = '2026-11-04.1';
const src = `// Building templates the layout engine uses (lib/bldgtemplates.mjs), from the reviewed reference plans. Generated by
// scripts/refs/templates-to-lib.mjs from data/reference/templates.json; edit that file and regenerate, not this one.
// Only templates whose evidence is in the dev partition drive generation; holdout families stay for evaluation.
// evidence_strength: 'multiple-projects' | 'single-project' | 'estimate'. See docs/REFERENCE-PROVENANCE.md.
export const REF_TEMPLATES_VERSION = '${ver}';
export const REF_TEMPLATES = ${JSON.stringify(out, null, 2)};
`;
fs.writeFileSync('lib/reftemplates.mjs', src);
console.log('lib/reftemplates.mjs', ver, Object.values(out).map(t => t.id + ' ' + t.module.w + '×' + t.module.d + ' ' + t.module.unitsPerFloor + 'u/fl').join('; '));
