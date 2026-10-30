// @ts-check
// Ported from fs-budgeting-suite test/pricing.json (origin/feature @ 4187c8c).
// The Real Estate Intelligence multifamily pricing library, version 2026.08-v2 (effective 2026-08-10): 103 lines, identical
// to the library the source suite seeds and publishes as its current version. Each line is a rate per quantity basis:
//   sf  = per residential SF, asf = per amenity SF, unit = per unit, ls = lump sum.
// Scopes: res = residential construction, amen = amenity / clubhouse, soft = soft costs (outside the contract sum).
// Line identity is scope + code + desc (the key stampCurrentPricing() in rollup.mjs matches on).
//
// These are ONE project's workbook rates, back-solved to $/SF, not a cost database. Treat them as a starting point to
// replace with a real estimate, never as a market benchmark.
//
// DOM-free and dependency-free: loaded by Node and by the browser.

export const source = {
  kind: 'library',
  label: 'the team's budget workbook (Budget For Projects 3.0), Waller County TX multifamily, back-solved $/SF',
  ref: 'fs-budgeting-suite pricing library 2026.08-v2 (origin/feature @ 4187c8c)',
  asOf: '2026-08-10',
  region: 'Waller County, TX',
  confidence: 'medium-low',
  note: 'Rates are one project\'s workbook back-solved to $/SF (residential 51,365 SF, amenity 1,200 SF, 58 units), not a cost database. '
    + 'Starting points to replace with a real estimate; they do not track market movement or other regions.'
};

const L = (code, grp, scope, desc, basis, unit) => ({ code, grp, scope, desc, basis, unit });

export const PRICING = {
  version: '2026.08-v2',
  effective: '2026-08-10',
  source,
  lines: [
    // res — General Conditions
    L('01 01 00', 'General Conditions', 'res', 'Project Management', 'sf', 7.5),
    L('01 02 00', 'General Conditions', 'res', 'Insurance', 'sf', 1.52),
    L('01 04 00', 'General Conditions', 'res', 'Equipment & Supplies', 'sf', 0.7),
    L('01 05 00', 'General Conditions', 'res', 'Security', 'sf', 0.18),
    L('01 50 00', 'General Conditions', 'res', 'Temporary Facilities (Toilets, Fencing, Power, Water)', 'sf', 1.2),
    L('01 70 00', 'General Conditions', 'res', 'Execution & Closeout', 'sf', 0.55),
    L('01 74 00', 'General Conditions', 'res', 'Construction Waste Management & Disposal', 'sf', 2.18),
    // res — Infrastructure
    L('01 06 00', 'Infrastructure', 'res', 'Testing & Surveying', 'sf', 0.4),
    L('01 07 00', 'Infrastructure', 'res', 'Inspections', 'sf', 0.65),
    L('31 10 00', 'Infrastructure', 'res', 'Site Clearing', 'sf', 0.75),
    L('31 20 00', 'Infrastructure', 'res', 'Earth Moving', 'sf', 0.33),
    L('31 23 00', 'Infrastructure', 'res', 'Excavation & Fill', 'sf', 3.85),
    L('32 10 00', 'Infrastructure', 'res', 'Bases, Ballasts & Paving', 'sf', 7),
    L('32 30 00', 'Infrastructure', 'res', 'Pavement Markings / Striping', 'sf', 0.35),
    L('33 10 00', 'Infrastructure', 'res', 'Water Utilities', 'sf', 1.52),
    L('33 30 00', 'Infrastructure', 'res', 'Sanitary Sewerage Utilities', 'sf', 1.12),
    L('33 40 00', 'Infrastructure', 'res', 'Storm Drainage Utilities', 'sf', 3.56),
    L('33 70 00', 'Infrastructure', 'res', 'Electrical Utilities', 'sf', 3.05),
    L('33 80 00', 'Infrastructure', 'res', 'Communications Utilities', 'sf', 0.5),
    L('33 90 00', 'Infrastructure', 'res', 'Misc Utilities', 'sf', 0.1),
    // res — Shell of Building
    L('03 30 00', 'Shell of Building', 'res', 'Foundation / Slab w/ Termite Treatment', 'sf', 5.25),
    L('04 40 00', 'Shell of Building', 'res', 'Stone Assemblies', 'sf', 0.83),
    L('05 10 00', 'Shell of Building', 'res', 'Structural Metal / Stairs / Handrails / Dumpster Doors', 'sf', 1.55),
    L('06 10 00', 'Shell of Building', 'res', 'Rough Carpentry / Framing / Roof Framing / Sheathing / Siding', 'sf', 20.55),
    L('07 21 00', 'Shell of Building', 'res', 'Insulation', 'sf', 1.39),
    L('07 40 00', 'Shell of Building', 'res', 'Roofing', 'sf', 1.28),
    L('07 60 00', 'Shell of Building', 'res', 'Gutters / Downspouts', 'sf', 0.33),
    L('08 10 00', 'Shell of Building', 'res', 'Doors & Frames (Exterior)', 'sf', 2.5),
    L('08 50 00', 'Shell of Building', 'res', 'Windows', 'sf', 1.21),
    L('08 70 00', 'Shell of Building', 'res', 'Door Hardware (Exterior)', 'sf', 0.1),
    L('09 90 00', 'Shell of Building', 'res', 'Exterior Painting & Coating', 'sf', 0.47),
    // res — Services (MEPS)
    L('21 10 00', 'Services (MEPS)', 'res', 'Water-Based Fire Suppression', 'sf', 1.4),
    L('22 05 00', 'Services (MEPS)', 'res', 'Plumbing', 'sf', 8.12),
    L('23 05 00', 'Services (MEPS)', 'res', 'HVAC', 'sf', 5.81),
    L('26 05 00', 'Services (MEPS)', 'res', 'Electrical', 'sf', 6.49),
    L('27 10 00', 'Services (MEPS)', 'res', 'Structured Cabling (Ethernet & Cameras)', 'sf', 0.81),
    L('28 46 00', 'Services (MEPS)', 'res', 'Fire Detection & Alarm', 'sf', 1.36),
    // res — Interiors
    L('06 20 00', 'Interiors', 'res', 'Finish Carpentry / Baseboards / Casing / Trim', 'sf', 2.13),
    L('08 11 00', 'Interiors', 'res', 'Interior Doors & Frames', 'sf', 1.31),
    L('08 71 00', 'Interiors', 'res', 'Interior Door Hardware', 'sf', 0.2),
    L('08 83 00', 'Interiors', 'res', 'Mirrors', 'sf', 0.29),
    L('09 20 00', 'Interiors', 'res', 'Plaster & Gypsum Board', 'sf', 4.72),
    L('09 30 00', 'Interiors', 'res', 'Tiling / Bathroom & Backsplash', 'sf', 0.96),
    L('09 60 00', 'Interiors', 'res', 'Flooring', 'sf', 1.79),
    L('09 91 00', 'Interiors', 'res', 'Interior Painting & Coating', 'sf', 2.18),
    L('10 14 00', 'Interiors', 'res', 'Signage / Unit & Building Numbers', 'sf', 0.1),
    L('10 28 00', 'Interiors', 'res', 'Toilet, Bath & Laundry Accessories', 'sf', 0.62),
    L('11 31 00', 'Interiors', 'res', 'Residential Appliances', 'sf', 3.48),
    L('12 21 00', 'Interiors', 'res', 'Window Blinds', 'sf', 0.33),
    L('12 30 00', 'Interiors', 'res', 'Casework / Stock Cabinets', 'sf', 2.01),
    L('12 36 00', 'Interiors', 'res', 'Countertops', 'sf', 1.13),
    // res — Site Finish
    L('10 55 00', 'Site Finish', 'res', 'Mailboxes', 'sf', 0.25),
    L('13 11 00', 'Site Finish', 'res', 'Swimming Pool w/ Pool Deck', 'sf', 3.22),
    L('28 10 00', 'Site Finish', 'res', 'Electronic Access Control & Intrusion Detection', 'sf', 1.14),
    L('32 31 00', 'Site Finish', 'res', 'Fences & Gates / Motors', 'sf', 1.3),
    L('32 33 00', 'Site Finish', 'res', 'Site Furnishings / Benches / Bike Racks', 'sf', 0.44),
    L('32 80 00', 'Site Finish', 'res', 'Irrigation', 'sf', 0.72),
    L('32 90 00', 'Site Finish', 'res', 'Planting / Landscaping', 'sf', 2.15),
    // amen — Amenity Shell & Openings
    L('08 10 00', 'Amenity Shell & Openings', 'amen', 'Doors & Frames', 'asf', 2.5),
    L('08 40 00', 'Amenity Shell & Openings', 'amen', 'Storefront / Glass Partitions', 'asf', 21.16),
    // amen — Amenity MEP & Low Voltage
    L('22 30 00', 'Amenity MEP & Low Voltage', 'amen', 'Plumbing Fixtures', 'asf', 4.15),
    L('26 50 00', 'Amenity MEP & Low Voltage', 'amen', 'Light Fixtures', 'asf', 4.12),
    L('27 10 00', 'Amenity MEP & Low Voltage', 'amen', 'Structured Cabling (Ethernet & Cameras)', 'asf', 9.44),
    L('27 11 00', 'Amenity MEP & Low Voltage', 'amen', 'Communications Equipment Room', 'asf', 6.83),
    L('28 10 00', 'Amenity MEP & Low Voltage', 'amen', 'Access Control / Intrusion Detection', 'asf', 11.83),
    L('28 20 00', 'Amenity MEP & Low Voltage', 'amen', 'Electronic Surveillance / Cameras', 'asf', 4),
    L('28 46 00', 'Amenity MEP & Low Voltage', 'amen', 'Fire Detection & Alarm', 'asf', 5),
    // amen — Amenity Interiors
    L('06 20 00', 'Amenity Interiors', 'amen', 'Finish Carpentry / Millwork / Trim', 'asf', 7.97),
    L('08 11 00', 'Amenity Interiors', 'amen', 'Interior Doors & Frames', 'asf', 4.36),
    L('08 71 00', 'Amenity Interiors', 'amen', 'Door Hardware', 'asf', 2.99),
    L('09 30 00', 'Amenity Interiors', 'amen', 'Tiling / Bathroom & Backsplash', 'asf', 8.21),
    L('09 60 00', 'Amenity Interiors', 'amen', 'Flooring', 'asf', 4.77),
    L('10 14 00', 'Amenity Interiors', 'amen', 'Signage', 'asf', 0.16),
    L('10 28 00', 'Amenity Interiors', 'amen', 'Toilet, Bath & Laundry Accessories', 'asf', 7.94),
    L('10 44 00', 'Amenity Interiors', 'amen', 'Fire Protection Specialties / Extinguishers', 'asf', 0.13),
    L('11 60 00', 'Amenity Interiors', 'amen', 'Entertainment Equipment / Game & Media Room', 'asf', 3),
    L('11 65 00', 'Amenity Interiors', 'amen', 'Athletic & Recreational / Fitness Equipment', 'asf', 5),
    L('12 30 00', 'Amenity Interiors', 'amen', 'Casework / Stock Cabinets', 'asf', 5.33),
    L('12 36 00', 'Amenity Interiors', 'amen', 'Countertops', 'asf', 4),
    L('12 50 00', 'Amenity Interiors', 'amen', 'Leasing Office / Clubhouse Furniture', 'asf', 1.74),
    L('12 60 00', 'Amenity Interiors', 'amen', 'Multiple / Amenity Seating', 'asf', 0.94),
    // soft — Soft Costs — Engineering & Design
    L('SC-01', 'Soft Costs — Engineering & Design', 'soft', 'Architect', 'sf', 2.65),
    L('SC-02', 'Soft Costs — Engineering & Design', 'soft', 'Civil Engineer', 'sf', 1.58),
    L('SC-03', 'Soft Costs — Engineering & Design', 'soft', 'Structural Engineer', 'sf', 1.17),
    L('SC-04', 'Soft Costs — Engineering & Design', 'soft', 'MEP Engineer', 'sf', 0.33),
    L('SC-05', 'Soft Costs — Engineering & Design', 'soft', 'Landscape Architect', 'sf', 0.15),
    L('SC-06', 'Soft Costs — Engineering & Design', 'soft', 'Geotechnical Engineer', 'sf', 0.18),
    L('SC-07', 'Soft Costs — Engineering & Design', 'soft', 'Environmental Study', 'sf', 0.04),
    L('SC-08', 'Soft Costs — Engineering & Design', 'soft', 'TxDOT Driveway Permitting', 'sf', 0.28),
    L('SC-09', 'Soft Costs — Engineering & Design', 'soft', 'Traffic Impact Analysis', 'sf', 0.36),
    L('SC-10', 'Soft Costs — Engineering & Design', 'soft', 'Flood Plain Mitigation', 'sf', 0.18),
    L('SC-11', 'Soft Costs — Engineering & Design', 'soft', 'Pad Elevation Certificates', 'sf', 0.22),
    L('SC-12', 'Soft Costs — Engineering & Design', 'soft', 'A/E Construction Administration', 'sf', 0.39),
    L('SC-13', 'Soft Costs — Engineering & Design', 'soft', 'Surveyor', 'sf', 0.13),
    L('SC-14', 'Soft Costs — Engineering & Design', 'soft', 'Renderings', 'sf', 0.1),
    L('SC-15', 'Soft Costs — Engineering & Design', 'soft', 'Reimbursables', 'sf', 0.18),
    L('SC-16', 'Soft Costs — Engineering & Design', 'soft', 'Plan Printing', 'sf', 0.06),
    L('SC-17', 'Soft Costs — Engineering & Design', 'soft', 'Precon Services (6 mo)', 'sf', 0.29),
    L('SC-18', 'Soft Costs — Engineering & Design', 'soft', 'Design Contingency (≈10%)', 'sf', 0.83),
    // soft — Soft Costs — Impact & Fees
    L('SC-20', 'Soft Costs — Impact & Fees', 'soft', 'Water & Sewer Impact & Tap Fees', 'sf', 7.5),
    L('SC-21', 'Soft Costs — Impact & Fees', 'soft', 'Permitting & Inspection Fees', 'sf', 0.45),
    L('SC-22', 'Soft Costs — Impact & Fees', 'soft', 'Plan Review Fees', 'sf', 0.15),
    L('SC-23', 'Soft Costs — Impact & Fees', 'soft', 'Fees Contingency (≈10%)', 'sf', 0.81),
  ]
};

export default PRICING;
