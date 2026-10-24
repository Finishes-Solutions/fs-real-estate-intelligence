// Ported from fs-budgeting-suite app/index.html (origin/feature @ 4187c8c).
// The CSI MasterFormat catalog (CSI, CSI_DIV, csiDivOf) and the CSI schedule of values (csiDivKey, csiSchedule), with
// the line flags it prints (isEdited, isDerived, lineFlag). In the source these close over the page's global budget
// document; here they are pure functions of the document (and, optionally, its already-computed parts()).
//
// The schedule groups the construction contract by MasterFormat division, then adds the markups — profit by company
// (99 01 00) and construction contingency (99 03 00) — so divisions + markups reconcile to the contract sum. Soft costs
// are reported separately, because they are not part of the contract sum; their percentages use total soft costs as
// the denominator. Known exceptions the source documents (its D9): a negative company percentage, or a line whose scope
// is not res/amen/soft (pass a document whose lines carry a scope; the source's loader defaults a missing one to 'res').
//
// DOM-free and dependency-free apart from ./rollup.mjs: loaded by Node and by the browser.
import { nz, parts as rollupParts, lineQty, scopeActive } from './rollup.mjs';

/* ============ CSI MASTERFORMAT CATALOG ============
   All divisions (00–48; 15–20, 24, 29–30, 36–39, 47, 49 reserved) with Level-2
   sections, plus Level-3 codes in active use in the Finishes budget model.  */
export const CSI = [
['00','Procurement and Contracting Requirements',[['00 10 00','Solicitation'],['00 20 00','Instructions for Procurement'],['00 30 00','Available Information'],['00 40 00','Procurement Forms and Supplements'],['00 50 00','Contracting Forms and Supplements'],['00 60 00','Project Forms'],['00 70 00','Conditions of the Contract'],['00 80 00','Supplementary Conditions'],['00 90 00','Revisions, Clarifications, and Modifications']]],
['01','General Requirements',[['01 01 00','Project Management'],['01 02 00','Insurance'],['01 04 00','Equipment & Supplies'],['01 05 00','Security'],['01 06 00','Testing & Surveying'],['01 07 00','Inspections'],['01 10 00','Summary'],['01 20 00','Price and Payment Procedures'],['01 30 00','Administrative Requirements'],['01 40 00','Quality Requirements'],['01 50 00','Temporary Facilities and Controls'],['01 60 00','Product Requirements'],['01 70 00','Execution and Closeout Requirements'],['01 74 00','Construction Waste Management and Disposal'],['01 80 00','Performance Requirements'],['01 90 00','Life Cycle Activities']]],
['02','Existing Conditions',[['02 20 00','Assessment'],['02 30 00','Subsurface Investigation'],['02 40 00','Demolition and Structure Moving'],['02 50 00','Site Remediation'],['02 60 00','Contaminated Site Material Removal'],['02 70 00','Water Remediation'],['02 80 00','Facility Remediation']]],
['03','Concrete',[['03 05 00','Common Work Results for Concrete'],['03 10 00','Concrete Forming and Accessories'],['03 20 00','Concrete Reinforcing'],['03 30 00','Cast-in-Place Concrete / Foundation / Slab'],['03 40 00','Precast Concrete'],['03 50 00','Cast Decks and Underlayment'],['03 60 00','Grouting'],['03 70 00','Mass Concrete'],['03 80 00','Concrete Cutting and Boring']]],
['04','Masonry',[['04 03 00','Gypcrete Fill / Lightweight Concrete'],['04 05 00','Common Work Results for Masonry'],['04 20 00','Unit Masonry'],['04 30 00','Stone Masonry'],['04 40 00','Stone Assemblies'],['04 50 00','Refractory Masonry'],['04 60 00','Corrosion-Resistant Masonry'],['04 70 00','Manufactured Masonry']]],
['05','Metals',[['05 05 00','Common Work Results for Metals'],['05 10 00','Structural Metal Framing / Stairs / Handrails'],['05 20 00','Metal Joists'],['05 30 00','Metal Decking'],['05 40 00','Cold-Formed Metal Framing'],['05 50 00','Metal Fabrications'],['05 70 00','Decorative Metal']]],
['06','Wood, Plastics, and Composites',[['06 05 00','Common Work Results'],['06 10 00','Rough Carpentry / Framing / Sheathing'],['06 20 00','Finish Carpentry / Trim'],['06 40 00','Architectural Woodwork / Millwork'],['06 50 00','Structural Plastics'],['06 60 00','Plastic Fabrications'],['06 70 00','Structural Composites'],['06 80 00','Composite Fabrications']]],
['07','Thermal and Moisture Protection',[['07 05 00','Common Work Results'],['07 10 00','Dampproofing and Waterproofing'],['07 20 00','Thermal Protection'],['07 21 00','Insulation'],['07 25 00','Weather Barriers'],['07 30 00','Steep Slope Roofing'],['07 40 00','Roofing and Siding Panels'],['07 50 00','Membrane Roofing'],['07 60 00','Flashing and Sheet Metal / Gutters / Downspouts'],['07 70 00','Roof and Wall Specialties and Accessories'],['07 80 00','Fire and Smoke Protection'],['07 90 00','Joint Protection / Sealants']]],
['08','Openings',[['08 05 00','Common Work Results'],['08 10 00','Doors and Frames'],['08 11 00','Interior Doors and Frames'],['08 30 00','Specialty Doors and Frames'],['08 40 00','Entrances, Storefronts, and Curtain Walls'],['08 50 00','Windows'],['08 60 00','Roof Windows and Skylights'],['08 70 00','Hardware'],['08 71 00','Door Hardware'],['08 80 00','Glazing'],['08 83 00','Mirrors'],['08 90 00','Louvers and Vents']]],
['09','Finishes',[['09 05 00','Common Work Results'],['09 20 00','Plaster and Gypsum Board'],['09 30 00','Tiling'],['09 40 00','Terrazzo'],['09 50 00','Ceilings'],['09 60 00','Flooring'],['09 70 00','Wall Finishes'],['09 80 00','Acoustic Treatment'],['09 90 00','Painting and Coating'],['09 91 00','Interior Painting and Coating']]],
['10','Specialties',[['10 10 00','Information Specialties'],['10 14 00','Signage / Unit & Building Numbers'],['10 20 00','Interior Specialties'],['10 28 00','Toilet, Bath, and Laundry Accessories'],['10 30 00','Fireplaces and Stoves'],['10 40 00','Safety Specialties'],['10 44 00','Fire Protection Specialties / Extinguishers'],['10 50 00','Storage Specialties'],['10 55 00','Postal Specialties / Mailboxes / Package Lockers'],['10 70 00','Exterior Specialties'],['10 80 00','Other Specialties']]],
['11','Equipment',[['11 10 00','Vehicle and Pedestrian Equipment'],['11 15 00','Security, Detention, and Banking Equipment'],['11 20 00','Commercial Equipment'],['11 30 00','Residential Equipment'],['11 31 00','Residential Appliances'],['11 40 00','Foodservice Equipment / Amenity Kitchen'],['11 50 00','Educational and Scientific Equipment'],['11 60 00','Entertainment Equipment / Game & Media Room'],['11 65 00','Athletic and Recreational / Fitness Equipment'],['11 70 00','Healthcare Equipment'],['11 80 00','Collection and Disposal Equipment'],['11 90 00','Other Equipment']]],
['12','Furnishings',[['12 05 00','Common Work Results'],['12 10 00','Art'],['12 20 00','Window Treatments'],['12 21 00','Window Blinds'],['12 30 00','Casework / Stock Cabinets'],['12 36 00','Countertops'],['12 40 00','Furnishings and Accessories'],['12 50 00','Furniture'],['12 60 00','Multiple Seating'],['12 90 00','Other Furnishings']]],
['13','Special Construction',[['13 10 00','Special Facility Components'],['13 11 00','Swimming Pools'],['13 20 00','Special Purpose Rooms'],['13 30 00','Special Structures'],['13 40 00','Integrated Construction'],['13 50 00','Special Instrumentation'],['13 70 00','Security Access and Surveillance'],['13 80 00','Building Automation and Control']]],
['14','Conveying Equipment',[['14 10 00','Dumbwaiters'],['14 20 00','Elevators'],['14 30 00','Escalators and Moving Walks'],['14 40 00','Lifts'],['14 70 00','Turntables'],['14 80 00','Scaffolding'],['14 90 00','Other Conveying Equipment']]],
['21','Fire Suppression',[['21 05 00','Common Work Results'],['21 10 00','Water-Based Fire-Suppression Systems'],['21 20 00','Fire-Extinguishing Systems'],['21 30 00','Fire Pumps'],['21 40 00','Fire-Suppression Water Storage']]],
['22','Plumbing',[['22 05 00','Common Work Results for Plumbing'],['22 10 00','Plumbing Piping'],['22 30 00','Plumbing Equipment'],['22 40 00','Plumbing Fixtures'],['22 50 00','Pool and Fountain Plumbing Systems'],['22 60 00','Gas and Vacuum Systems']]],
['23','Heating, Ventilating, and Air Conditioning (HVAC)',[['23 05 00','Common Work Results for HVAC'],['23 10 00','Facility Fuel Systems'],['23 20 00','HVAC Piping and Pumps'],['23 30 00','HVAC Air Distribution'],['23 40 00','HVAC Air Cleaning Devices'],['23 50 00','Central Heating Equipment'],['23 60 00','Central Cooling Equipment'],['23 70 00','Central HVAC Equipment'],['23 80 00','Decentralized HVAC Equipment']]],
['25','Integrated Automation',[['25 05 00','Common Work Results'],['25 10 00','Integrated Automation Network Equipment'],['25 30 00','Instrumentation and Terminal Devices'],['25 50 00','Integrated Automation Facility Controls'],['25 90 00','Integrated Automation Control Sequences']]],
['26','Electrical',[['26 05 00','Common Work Results for Electrical'],['26 10 00','Medium-Voltage Electrical Distribution'],['26 20 00','Low-Voltage Electrical Transmission'],['26 30 00','Facility Electrical Power Generating and Storing Equipment'],['26 40 00','Electrical and Cathodic Protection'],['26 50 00','Lighting'],['26 56 00','Exterior / Site Lighting']]],
['27','Communications',[['27 05 00','Common Work Results'],['27 10 00','Structured Cabling'],['27 11 00','Communications Equipment Room Fittings'],['27 15 00','Communications Horizontal Cabling'],['27 20 00','Data Communications'],['27 30 00','Voice Communications'],['27 40 00','Audio-Video Communications'],['27 50 00','Distributed Communications and Monitoring Systems']]],
['28','Electronic Safety and Security',[['28 05 00','Common Work Results'],['28 10 00','Access Control / Intrusion Detection'],['28 20 00','Video Surveillance / Cameras'],['28 30 00','Security Detection, Alarm, and Monitoring'],['28 46 00','Fire Detection and Alarm']]],
['31','Earthwork',[['31 05 00','Common Work Results for Earthwork'],['31 10 00','Site Clearing'],['31 20 00','Earth Moving'],['31 23 00','Excavation and Fill'],['31 30 00','Earthwork Methods'],['31 32 00','Soil Stabilization'],['31 40 00','Shoring and Underpinning'],['31 50 00','Excavation Support and Protection'],['31 60 00','Special Foundations and Load-Bearing Elements'],['31 70 00','Tunneling and Mining']]],
['32','Exterior Improvements',[['32 05 00','Common Work Results'],['32 10 00','Bases, Ballasts, and Paving'],['32 13 00','Rigid Paving / Concrete Paving'],['32 30 00','Site Improvements'],['32 31 00','Fences and Gates'],['32 33 00','Site Furnishings / Benches / Bike Racks'],['32 70 00','Wetlands'],['32 80 00','Irrigation'],['32 90 00','Planting / Landscaping']]],
['33','Utilities',[['33 05 00','Common Work Results for Utilities'],['33 10 00','Water Utilities'],['33 30 00','Sanitary Sewerage Utilities'],['33 40 00','Storm Drainage Utilities'],['33 50 00','Fuel Distribution Utilities'],['33 70 00','Electrical Utilities'],['33 80 00','Communications Utilities'],['33 90 00','Miscellaneous Utilities']]],
['34','Transportation',[['34 05 00','Common Work Results'],['34 10 00','Guideways / Railways'],['34 20 00','Traction Power'],['34 40 00','Transportation Signaling and Control Equipment'],['34 70 00','Transportation Construction and Equipment']]],
['35','Waterway and Marine Construction',[['35 10 00','Waterway and Marine Signaling and Control'],['35 20 00','Waterway and Marine Construction and Equipment'],['35 30 00','Coastal Construction'],['35 40 00','Waterway Construction'],['35 50 00','Marine Construction']]],
['40','Process Interconnections',[['40 05 00','Common Work Results for Process Interconnections'],['40 10 00','Gas and Vapor Process Piping'],['40 20 00','Liquids Process Piping'],['40 90 00','Instrumentation and Control for Process Systems']]],
['41','Material Processing and Handling Equipment',[['41 10 00','Bulk Material Processing Equipment'],['41 20 00','Piece Material Handling Equipment'],['41 60 00','Mobile Plant Equipment']]],
['42','Process Heating, Cooling, and Drying Equipment',[['42 10 00','Process Heating Equipment'],['42 20 00','Process Cooling Equipment'],['42 30 00','Process Drying Equipment']]],
['43','Process Gas and Liquid Handling, Purification, and Storage Equipment',[['43 10 00','Gas Handling Equipment'],['43 20 00','Liquid Handling Equipment'],['43 40 00','Gas and Liquid Storage']]],
['44','Pollution and Waste Control Equipment',[['44 10 00','Air Pollution Control'],['44 40 00','Water Treatment Equipment'],['44 60 00','Solid Waste Control']]],
['45','Industry-Specific Manufacturing Equipment',[['45 10 00','Industry-Specific Manufacturing Equipment']]],
['46','Water and Wastewater Equipment',[['46 10 00','Water and Wastewater Preliminary Treatment'],['46 30 00','Water and Wastewater Chemical Feed'],['46 50 00','Water and Wastewater Secondary Treatment']]],
['48','Electrical Power Generation',[['48 10 00','Electrical Power Generation Equipment'],['48 70 00','Electrical Power Generation Testing']]],
];
export const CSI_DIV = Object.fromEntries(CSI.map(([n, t]) => [n, 'Division ' + n + ' — ' + t]));
export function csiDivOf(code) { const n = String(code || '').slice(0, 2); return CSI_DIV[n] || 'Custom'; }

// The division key of a line's code: its first two characters when they are two digits naming a known division,
// else null (the line goes to "Uncoded / Custom Scope").
export function csiDivKey(code) {
  const n = String(code || '').slice(0, 2);
  return /^\d{2}$/.test(n) && CSI_DIV[n] ? n : null;
}

// ---- line flags ----

// A line counts as manually touched when it was added by hand, its quantity was overridden off auto, its rate differs
// from the library baseline, or its description or basis was changed.
export function isEdited(it) {
  return it.custom === true
      || (it.auto === false && it.basis !== 'ls')
      || (+it.unit) !== (+it.baseUnit)
      || it.edited === true;
}
// A line whose amount comes from the impact-fee calculation (derived: 'impactFees'). isEdited() is true for it by
// construction, but it is derived, not a manual edit.
export function isDerived(it) { return !!(it && it.derived); }
// 'derived', 'edited' or ''. Derived wins.
export function lineFlag(it) { return isDerived(it) ? 'derived' : isEdited(it) ? 'edited' : ''; }

// ---- CSI schedule of values ----

// csiSchedule(doc, p = parts(doc)) ->
//   { divisions: [{ key, title, rows, total }], markups: [{ code, desc, total }], soft: rows, softGroups: [{ grp, rows,
//     total }], softTotal, markupsTotal, hard, contract, project }
// Only lines in an active scope are included (amenity is off when amenSF <= 0). Divisions sort by number, rows within
// a division by code; uncoded construction lines collect last under key '--'.
export function csiSchedule(doc, p) {
  p = p || rollupParts(doc);
  const divs = new Map(), soft = [], orphans = [];
  (doc.lines || []).filter(l => scopeActive(doc, l.scope)).forEach(l => {
    const qty = lineQty(doc, l), rate = nz(l.unit);
    const row = { code: l.code, desc: l.desc, scope: l.scope, grp: l.grp, basis: l.basis,
                  qty, rate, total: qty * rate,
                  edited: lineFlag(l) === 'edited', derived: isDerived(l) };
    if (l.scope === 'soft') { soft.push(row); return; }
    const k = csiDivKey(l.code);
    if (!k) { orphans.push(row); return; }
    if (!divs.has(k)) divs.set(k, []);
    divs.get(k).push(row);
  });
  const byCode = (a, z) => String(a.code).localeCompare(String(z.code));
  const divisions = [...divs.keys()].sort().map(k => {
    const rows = divs.get(k).sort(byCode);
    return { key: k, title: CSI_DIV[k], rows, total: rows.reduce((s, r) => s + r.total, 0) };
  });
  if (orphans.length) divisions.push({ key: '--', title: 'Uncoded / Custom Scope',
    rows: orphans.sort(byCode), total: orphans.reduce((s, r) => s + r.total, 0) });
  const markups = [];
  (doc.companies || []).forEach(c => {
    if (nz(c.pct) > 0) markups.push({ code: '99 01 00', desc: 'Profit — ' + c.name, total: p.hard * nz(c.pct) / 100 });
  });
  if (p.cont > 0) markups.push({ code: '99 03 00', desc: 'Construction contingency', total: p.cont });
  soft.sort(byCode);
  // Soft costs are grouped by their own heading, and their percentages use total soft costs as the denominator — NOT
  // the contract sum, which excludes them.
  const softTotal = soft.reduce((s, r) => s + r.total, 0);
  const sg = new Map();
  soft.forEach(r => { const k = r.grp || 'Soft Costs'; if (!sg.has(k)) sg.set(k, []); sg.get(k).push(r); });
  const softGroups = [...sg.keys()].map(k => ({ grp: k, rows: sg.get(k),
    total: sg.get(k).reduce((s, r) => s + r.total, 0) }));
  return { divisions, markups, soft, softGroups, softTotal,
           markupsTotal: markups.reduce((s, m) => s + m.total, 0),
           hard: p.hard, contract: p.contract, project: p.project };
}

// Percent columns: divisions and markups are a share of the contract sum, soft rows a share of total soft costs.
// null when the denominator is zero (the source prints "—").
export function csiPct(v, denom) { return denom ? v / denom : null; }
