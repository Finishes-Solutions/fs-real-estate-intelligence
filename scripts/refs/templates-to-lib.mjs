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
// front-load townhome row (for-sale, each home on its own lot): E053 Portland Road A.1, an 80 x 42 ft row of four 2-story
// homes, each with a one-car garage (11 x 22 ft) facing the drive and an apron in front of it. Dev evidence; the apron
// depth is the project's printed 18-20 ft driveway apron (20 used: a car and the walk). Not a module of apartment bars.
{
  const t = T['th-tuck-garage-row-4u-2s']; if (!devOnly(t)) throw new Error('townhome template cites holdout evidence');
  const ap = JSON.parse(fs.readFileSync('data/reference/projects/E053.json', 'utf8')).parking?.stall_d_ft, apronNote = ap?.note || '';
  const apron = Math.max(+(ap?.v || 18), ...((apronNote.match(/\d+/g) || []).map(Number).filter(n => n >= 15 && n <= 30)));
  out['th-frontload-row-2s'] = { id: 'th-frontload-row-2s', form: 'townhome-frontload', label: 'Front-load townhome row (one-car garage and apron, 2 floors)', floors: t.floors,
    module: { label: 'townhome', w: +(t.footprint.w_ft / t.units).toFixed(2), d: t.footprint.d_ft, unitsPerFloor: 1 }, minModules: 3, maxModules: 6, garage: 1, apron,
    grossSfPerUnit: Math.round(t.gross_sf / t.units), unitMix: t.unit_mix, source: t.id, evidence: t.evidence.map(e => e.project), evidence_strength: t.evidence_strength,
    derivation: `row ${t.footprint.w_ft} ft ÷ ${t.units} homes = ${(t.footprint.w_ft / t.units).toFixed(2)} ft a home; ${t.footprint.d_ft} ft deep; ${t.floors} floors; one-car garage a home (${t.parking.type}); apron ${apron} ft (the project's driveway aprons, ${apronNote || ap?.v + ' ft'}); rows of 3 to 6 homes (the engine's row length)` };
}
// stacked townhomes (a "2-over-2"): one module = a 20 ft bay of the reviewed E053 Portland Road townhome row (dev: 80 x
// 42 ft, four 2-story homes, 20 ft a home), two such homes stacked: a 2-story home over a 2-story home, 4 floors, the
// lower home entered from one side and the upper from the other up its own stair. No reviewed stacked-townhome building
// is in the library: the stacking is an ESTIMATE on the reviewed bay. Rows of 6 to 10 bays (12 to 20 homes) are an
// estimate too (common for the type; a 10-bay row is 200 ft, about the engine's longest bar).
{
  const t = T['th-tuck-garage-row-4u-2s']; if (!devOnly(t)) throw new Error('stacked townhome template cites holdout evidence');
  const w = t.footprint.w_ft / t.units, d = t.footprint.d_ft;
  out['mf-stacked-2over2-4s'] = { id: 'mf-stacked-2over2-4s', form: 'mf-stacked-townhome', label: 'Stacked townhomes (2-over-2, 4 floors)', floors: 4, floorsRange: [4, 4],
    module: { label: 'stacked bay', w, d, unitsPerFloor: 0.5 }, minModules: 6, maxModules: 10, stacked: true, corridor: 'none: each home has its own entry, the lower one on one side, the upper one on the other', stairs: 'one a home', elevators: 0,
    grossSfPerUnit: Math.round(w * d * 2), unitMix: { '2BR': 1, '3BR': 1, source: 'estimate' }, efficiency: null, source: t.id, evidence: t.evidence.map(e => e.project), evidence_strength: 'estimate',
    derivation: `bay ${t.footprint.w_ft} ft ÷ ${t.units} homes = ${w} ft, ${d} ft deep, from the reviewed ${t.id} row; two 2-story homes stacked in each bay (4 floors, 2 homes a bay, ${Math.round(w * d * 2)} gross sf a home): an estimate, no reviewed stacked-townhome building; rows of 6 to 10 bays (an estimate)` };
}
// double-loaded corridor buildings: gross floor area a home and net / gross, the mean over the reviewed dev corridor
// buildings. The engine sizes the homes of the forms it draws from floor area (courtyard, wrap, podium and tower,
// vertical mixed use) with these, in place of the earlier 900 sf at 85% (an unsourced default).
const corridor = (() => {
  const a = T['mf-midrise-corridor-4s-110u'], b = T['mf-corridor-elev-3s-47u']; for (const t of [a, b]) if (!devOnly(t)) throw new Error(t.id + ' cites holdout evidence');
  // P28 and P11 are both in the first template's evidence; P11's own figures are in its notes (92,306 residential / 120,481 gross, 116 homes)
  const p11 = /(\d{2},\d{3})\/(\d{3},\d{3}) = 0\.7\d C-43/.exec(a.notes || ''), n = s => +String(s).replace(/,/g, '');
  const rows = [{ project: 'P28', gross: a.gross_sf, units: a.units, net: a.rentable_sf }, ...(p11 ? [{ project: 'P11', gross: n(p11[2]), units: 116, net: n(p11[1]) }] : []), { project: 'P33', gross: b.gross_sf, units: b.units, net: b.rentable_sf }];
  const gsf = rows.reduce((s, r) => s + r.gross / r.units, 0) / rows.length, eff = rows.reduce((s, r) => s + r.net / r.gross, 0) / rows.length;
  return { gsfPerUnit: Math.round(gsf), eff: +eff.toFixed(3), unitSf: Math.round(gsf * eff), evidence: rows.map(r => r.project), evidence_strength: rows.length > 1 ? 'multiple-projects' : 'single-project',
    derivation: rows.map(r => `${r.project} ${r.gross.toLocaleString('en-US')} gsf / ${r.units} homes = ${Math.round(r.gross / r.units)} gsf a home, net ${(r.net / r.gross).toFixed(3)}`).join('; ') + `; mean ${Math.round(gsf)} gsf a home at ${eff.toFixed(3)} net` };
})();
// a tower on its podium: the tower's floor plate as a share of the podium's, the mean over the reviewed dev projects;
// and whether a single podium level needs a ramp (P25: one level, entered from the road)
const podium = (() => {
  const a = T['podium-highrise-two-buildings-126u'], b = T['tower-corridor-14s-ground-retail']; for (const t of [a, b]) if (!devOnly(t)) throw new Error(t.id + ' cites holdout evidence');
  const rows = [{ project: 'P25', share: a.podium.tower_share, how: `L01 ${a.podium.footprint_L01_sf.toLocaleString('en-US')} sf over the podium's ${a.podium.footprint_L00_sf.toLocaleString('en-US')} sf` }, { project: 'E028', share: b.tower_share, how: `typical plate ${b.footprint.area_sf.toLocaleString('en-US')} sf over the ground floor's ${b.ground_floor_sf.toLocaleString('en-US')} sf` }];
  const share = rows.reduce((s, r) => s + r.share, 0) / rows.length;
  return { towerShare: +share.toFixed(3), singleLevelRamp: a.podium.ramp !== false, podiumF2f: a.podium.podium_f2f_ft, evidence: rows.map(r => r.project), evidence_strength: 'multiple-projects',
    derivation: rows.map(r => `${r.project} ${r.share} (${r.how})`).join('; ') + `; mean ${share.toFixed(3)}. A single podium level has no ramp (P25: ${a.podium.entry})` };
})();
const ver = '2026-11-04.3';
const src = `// Building templates the layout engine uses (lib/bldgtemplates.mjs), from the reviewed reference plans. Generated by
// scripts/refs/templates-to-lib.mjs from data/reference/templates.json; edit that file and regenerate, not this one.
// Only templates whose evidence is in the dev partition drive generation; holdout families stay for evaluation.
// evidence_strength: 'multiple-projects' | 'single-project' | 'estimate'. See docs/REFERENCE-PROVENANCE.md.
export const REF_TEMPLATES_VERSION = '${ver}';
export const REF_TEMPLATES = ${JSON.stringify(out, null, 2)};
// double-loaded corridor buildings (homes sized from floor area: courtyard, wrap, podium / tower, vertical mixed use)
export const REF_CORRIDOR = ${JSON.stringify(corridor, null, 2)};
// towers on podiums: the tower's plate as a share of the podium's; a single podium level is entered without a ramp
export const REF_PODIUM = ${JSON.stringify(podium, null, 2)};
`;
fs.writeFileSync('lib/reftemplates.mjs', src);
console.log('lib/reftemplates.mjs', ver, Object.values(out).map(t => t.id + ' ' + t.module.w + '×' + t.module.d + ' ' + t.module.unitsPerFloor + 'u/fl').join('; '));
