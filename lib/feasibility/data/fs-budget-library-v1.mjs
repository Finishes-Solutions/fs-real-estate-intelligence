// @ts-check
// The Finishes Solutions Construction Budget Library v1 (workbook built 2026-11-09 from the Hart Homes purchasing
// archive: rate book, trade base, plan cost books, a 26-home bid book, a 9-home actual cost record and multifamily
// pricing studies). This is the workbook's COMPUTABLE layer only:
//   INPUTS (PROJECT_INPUTS)  →  drivers and condition flags (lib/feasibility/budgetlib.mjs, the DRIVERS tab)
//   →  LINES (BUDGET_TEMPLATE: 92 lines, a LOW / LIKELY / HIGH rate each)  →  BENCHMARKS (TOPDOWN_BENCHMARKS).
//
// What is deliberately NOT here: the workbook's evidence layer (the rate library with vendors, bid leveling, plan
// budgets, actual costs, the vendor list with contacts and payables, data flags) and each line's basis note and source
// file. This module is loaded by the browser, and the workbook marks vendor pricing and contacts confidential; they wait
// for a signed-in, role-limited place to live (docs/PROGRESS.md, "Infra I need to set up"). One line (T-043,
// insulation) had low and likely rates taken from a vendor whose agreement forbids disclosing its terms (the workbook's
// flag F-21): its rates here are the other three bids for the same house instead.
//
// Amounts are direct cost: no builder fee or markup. They are what Hart was quoted or paid, mostly 2025 and early 2026,
// around Houston (Dayton, City of Houston, Conroe, Waller, Alvin, Anahuac). The workbook warns that they are not
// Finishes' own current pricing, and that every townhome and apartment rate is a placeholder until bid (Hart has built
// neither).
//
// DOM-free and dependency-free: loaded by Node and by the browser.

export const source = {
  kind: 'library',
  label: 'Finishes budget library v1 (Hart Homes purchasing archive: bids, quotes and closed-home actuals, low / likely / high per line)',
  ref: 'Finishes_Budget_Library_v1.xlsx, BUDGET_TEMPLATE (built 2026-11-09)',
  asOf: '2025-12-01', // (the middle of the rates' dates: most are 2025 quotes and the Dec 2025 – Jan 2026 bid round; they escalate from here)
  region: 'Houston region, TX',
  confidence: 'medium',
  note: 'Direct cost, no fee. Hart\'s quoted and paid rates, not Finishes\' own; townhome and apartment rates are placeholders until bid.'
};

// the workbook's product types and the inputs a budget is made from, with its defaults (PROJECT_INPUTS)
export const PRODUCTS = ['SF_DETACHED', 'TOWNHOME', 'COTTAGE', 'APARTMENT', 'STORAGE'];
export const JURISDICTIONS = ['DAYTON', 'COH', 'CONROE', 'LIBERTY', 'WALLER', 'ANAHUAC', 'ALVIN', 'OTHER'];
export const INPUTS = {
  product_type: 'SF_DETACHED', units: 1, buildings: 1, living_sf_per_unit: 1402, stories: 1, garage: 'Y', baths_per_unit: 2, jurisdiction: 'DAYTON', elevated: 'N', sitework_by_hart: 'Y', masonry_pct: 0.25,
  windstorm: 'Y', lvt_share: 0.54, flatwork_sf_per_unit: 1200, approach_sf_per_unit: 0, sod_sy_per_unit: 500, fence_lf_per_unit: 150, gas: 'N', attached: 'N', takeover: 'N', contingency_pct: 0.05, builder_fee_per_unit: 0
};

// the takeoff constants the drivers use (TAKEOFF_CONSTANTS / DRIVERS)
export const K = {
  totalPerLiving: { oneStory: 1.34, multiStory: 1.29, noGarage: 1.086, apartment: 1.18 }, // total sf under roof (garage, porch) per living sf
  roofSqPerSlabSf: 0.0154, roofMultiStory: 1.12, livingSfPerWindow: 160, windowSfPerLivingSf: 0.094, livingSfPerIntDoor: 100,
  boardSfPerLivingSf: 5.3, boardFtPerLivingSf: { oneStory: 4.62, multiStory: 5.05 }, baseLfPerLivingSf: 0.36, topsSfPerLivingSf: 0.048, floorShare: 0.97,
  tonsPer1000Sf: 1.95, fixturesPerBath: 4, wallSfPerTotalSf: 0.93, attachedWallShare: 0.6
};

/**
 * @typedef {{ id: string, code: string, csi: string, group: 'hard'|'soft', phase: string, desc: string, cond: string, driver: string, factor: number, per: string,
 *   low: number|null, likely: number|null, high: number|null, confidence: 'high'|'med'|'low', mf: (number|null)[]|null }} LibLine
 */
/** @returns {LibLine} */
const L = (id, code, csi, group, phase, desc, cond, driver, factor, per, low, likely, high, confidence, mf = null) => /** @type {LibLine} */ ({ id, code, csi, group, phase, desc, cond, driver, factor, per, low, likely, high, confidence, mf });

// id, the workbook's cost code (Hart XX.XX manual), the platform's CSI section (assigned here: the workbook has no
// crosswalk), hard or soft, phase, item, condition, driver, quantity factor, the rate's unit, low / likely / high,
// confidence, and the multifamily low / likely / high that replace the rates for townhomes and apartments. A null rate
// is a line the workbook says must be bid: it is counted and shown, never priced at zero in silence.
export const LINES = [
  L('T-001', '03.00', 'SC-FS1', 'soft', 'Pre-construction', 'Engineering: foundation and frame packages, energy code certificate', 'ALWAYS', 'UNITS', 1, 'unit', 640, 966, 1925, 'med'),
  L('T-002', '03.00', 'SC-FS2', 'soft', 'Pre-construction', 'Soil report / geotech', 'ALWAYS', 'LOTS', 1, 'lot', 120, 120, 1150, 'med', [120, 1956, 1956]),
  L('T-003', '03.10', 'SC-FS3', 'soft', 'Pre-construction', 'Survey bundle (plot plan, stakeout, form, final)', 'ALWAYS', 'LOTS', 1, 'lot', 800, 800, 870, 'high'),
  L('T-004', '03.10', 'SC-FS3', 'soft', 'Pre-construction', 'City of Houston survey adder', 'COH', 'LOTS', 1, 'lot', 120, 120, 120, 'high'),
  L('T-005', '03.35', 'SC-FS4', 'soft', 'Pre-construction', 'Third-party quality and energy inspections, HERS rating', 'RESI', 'UNITS', 1, 'unit', 750, 750, 1288, 'high'),
  L('T-006', '01.05', 'SC-FS5', 'soft', 'Permits & taps', 'Building permit', 'ALWAYS', 'UNITS', 1, 'unit', 1250, 1500, 2500, 'med'),
  L('T-007', '01.05', 'SC-FS6', 'soft', 'Permits & taps', 'Impact fees', 'RESI', 'LOTS', 1, 'lot', 2500, 3800, 11474, 'low'),
  L('T-008', '07.05', 'SC-FS7', 'soft', 'Permits & taps', 'Water & sewer taps', 'RESI', 'UNITS', 1, 'unit', 750, 2500, 7000, 'low'),
  L('T-009', '01.20', '01 50 00', 'hard', 'Permits & taps', 'Temporary utilities, water deposit, temporary power pole', 'RESI', 'UNITS', 1, 'unit', 100, 245, 500, 'low'),
  L('T-010', '03.40', '31 25 00', 'hard', 'Site', 'Storm water protection: silt fence, curb cut', 'SITEWORK', 'UNITS', 1, 'unit', 175, 250, 250, 'med'),
  L('T-011', '19.05', '01 74 00', 'hard', 'Site', 'Trash, dumpsters, portable toilet', 'ALWAYS', 'UNITS', 1, 'unit', 400, 572, 800, 'low'),
  L('T-012', '03.05', '31 10 00', 'hard', 'Site', 'Lot clearing: trees and brush', 'SITEWORK', 'UNITS', 1, 'unit', 0, 3764, 3764, 'low'),
  L('T-013', '03.15', '31 20 00', 'hard', 'Site', 'Pad build, select fill and dirt', 'SITEWORK', 'UNITS', 1, 'unit', 5000, 8320, 8320, 'low'),
  L('T-014', '03.15', '33 40 00', 'hard', 'Site', 'Culvert', 'SITEWORK', 'UNITS', 1, 'unit', 0, 842, 842, 'low'),
  L('T-015', '03.05', '31 10 00', 'hard', 'Site', 'Scrape lot', 'RESI', 'UNITS', 1, 'unit', 125, 125, 150, 'high'),
  L('T-016', '03.15', '31 20 00', 'hard', 'Site', 'Rough grade', 'RESI', 'UNITS', 1, 'unit', 250, 250, 350, 'high'),
  L('T-017', '18.55', '31 20 00', 'hard', 'Site', 'Deliver dirt for driveway cut', 'SF_ONLY', 'UNITS', 1, 'unit', 150, 180, 180, 'high'),
  L('T-018', '18.40', '03 30 00', 'hard', 'Foundation', 'Slab turnkey (post-tensioned, 3,000 psi)', 'NOT_ELEVATED', 'SLAB_SF', 1, 'SF', 7.74, 7.79, 8.69, 'high'),
  L('T-019', '18.40', '03 30 00', 'hard', 'Foundation', 'Elevated / pier foundation in a floodplain (placeholder rate)', 'ELEVATED', 'SLAB_SF', 1, 'SF', 5.25, 8.69, 11.15, 'low'),
  L('T-020', '04.25', '03 30 00', 'hard', 'Foundation', 'Concrete pump', 'NOT_ELEVATED', 'LOTS', 1, 'slab', 750, 750, 900, 'high'),
  L('T-021', '04.00', '31 31 00', 'hard', 'Foundation', 'Termite pre-treatment', 'RESI', 'UNITS', 1, 'unit', 150, 189.44, 310, 'high'),
  L('T-022', '05.00', '06 10 00', 'hard', 'Foundation', 'Strap and clip turnkey (windstorm)', 'WINDSTORM', 'TOTAL_SF', 1, 'SF', 0.55, 0.55, 0.8, 'med'),
  L('T-023', '05.05', '06 10 00', 'hard', 'Frame & dry-in', 'Lumber package: framing, cornice, sheathing and wrap (trusses apart)', 'RESI', 'TOTAL_SF', 1, 'SF', 7.98, 8.33, 9.83, 'high'),
  L('T-024', '05.00', '06 10 00', 'hard', 'Frame & dry-in', 'Frame and cornice labor, one storey', 'STORIES1', 'TOTAL_SF', 1, 'SF', 3.4, 3.75, 3.96, 'high'),
  L('T-025', '05.00', '06 10 00', 'hard', 'Frame & dry-in', 'Frame and cornice labor, two storeys', 'STORIES2', 'TOTAL_SF', 1, 'SF', 4, 4, 4.4, 'high'),
  L('T-026', '05.00', '06 10 00', 'hard', 'Frame & dry-in', 'Frame labor, three to four storeys (with sheathing, firewall, wrap, cornice, windows, exterior doors)', 'STORIES3P', 'LIVING_SF', 1, 'SF', 7, 7, 8.5, 'med'),
  L('T-027', '13.00', '08 50 00', 'hard', 'Frame & dry-in', 'Windows (material)', 'RESI', 'WINDOWS', 1, 'ea', 136.43, 164.33, 221.33, 'high'),
  L('T-028', '13.10', '08 10 00', 'hard', 'Frame & dry-in', 'Exterior doors (material)', 'RESI', 'EXT_DOORS', 1, 'ea', 262.99, 283.99, 341.99, 'high'),
  L('T-029', '06.00', '07 30 00', 'hard', 'Frame & dry-in', 'Roof turnkey: decking, shingles, flashing', 'RESI', 'ROOF_SQ', 1, 'square', 184, 203, 275, 'high'),
  L('T-030', '06.00', '07 30 00', 'hard', 'Frame & dry-in', 'City of Houston roofing premium (6.6%)', 'COH', 'ROOF_SQ', 0.066, 'square', 184, 203, 275, 'med'),
  L('T-031', '06.25', '07 60 00', 'hard', 'Frame & dry-in', 'Gutters and downspouts', 'RESI', 'UNITS', 1, 'unit', 366, 970, 1156, 'high', [0, 0, 366]),
  L('T-032', '17.00', '04 20 00', 'hard', 'Masonry', 'Brick / stone material, mortar and sand', 'MASONRY', 'UNITS', 1, 'unit', 634.19, 1000, 1575, 'med'),
  L('T-033', '17.05', '04 20 00', 'hard', 'Masonry', 'Brick / stone labor', 'MASONRY', 'UNITS', 1, 'unit', 500, 800, 1000, 'high'),
  L('T-034', '05.10', '07 40 00', 'hard', 'Masonry', 'Siding / stucco, material and labor (placeholder; option)', 'OPTION', 'SIDING_SF', 1, 'SF', 3.85, 3.85, 10, 'low'),
  L('T-035', '07.25', '22 10 00', 'hard', 'Rough MEP', 'Plumbing turnkey: grounds, top-out, final (two-bath basis)', 'RESI', 'UNITS', 1, 'unit', 6555, 7455, 9115, 'high', [6718, 8550, 9395]),
  L('T-036', '07.25', '22 10 00', 'hard', 'Rough MEP', 'Plumbing adder for each bath above two', 'RESI', 'EXTRA_BATHS', 1, 'bath', 1225, 1225, 1225, 'med'),
  L('T-037', '09.05', '22 60 00', 'hard', 'Rough MEP', 'Gas rough-in and meter set', 'GAS', 'UNITS', 1, 'unit', 1200, 1200, 1200, 'low'),
  L('T-038', '08.00', '26 05 00', 'hard', 'Rough MEP', 'Electrical turnkey, with underground service', 'RESI', 'UNITS', 1, 'unit', 5954, 6000, 7816, 'high'),
  L('T-039', '08.00', '26 05 00', 'hard', 'Rough MEP', 'City of Houston electrical adder: underground, permit, lighting controls', 'COH', 'UNITS', 1, 'unit', 915, 915, 915, 'med'),
  L('T-040', '08.00', '26 05 00', 'hard', 'Rough MEP', 'Dayton electrical adder', 'DAYTON', 'UNITS', 1, 'unit', 600, 600, 600, 'high'),
  L('T-041', '08.00', '27 10 00', 'hard', 'Rough MEP', 'Low voltage: enclosure and drops', 'RESI', 'UNITS', 1, 'unit', 150, 150, 345, 'med'),
  L('T-042', '09.00', '23 05 00', 'hard', 'Rough MEP', 'HVAC turnkey (heat pump)', 'RESI', 'HVAC_TONS', 1, 'ton', 2136, 2385.6, 3312, 'high'),
  L('T-043', '10.00', '07 21 00', 'hard', 'Interior shell', 'Insulation turnkey: batts, blown attic, air seal', 'RESI', 'LIVING_SF', 1, 'SF', 1.65, 1.66, 1.88, 'high'),
  L('T-044', '10.10', '09 20 00', 'hard', 'Interior shell', 'Drywall board (material)', 'RESI', 'BOARD_SF', 1, 'SF', 0.322, 0.337, 0.425, 'high', [0.37, 0.37, 0.425]),
  L('T-045', '10.15', '09 20 00', 'hard', 'Interior shell', 'Drywall labor: hang, tape, float, texture', 'RESI', 'BOARD_FT', 1, 'BF', 0.46, 0.52, 0.78, 'high', [0.52, 0.78, 0.955]),
  L('T-046', '20.10', '09 20 00', 'hard', 'Interior shell', 'Rated assemblies adder: Type X board, resilient channel, firestopping (placeholder rate)', 'MF_ONLY', 'BOARD_SF', 1, 'SF', 0.1, 0.14, 0.25, 'low'),
  L('T-047', '13.30', '06 20 00', 'hard', 'Interior shell', 'Interior doors and trim material: doors, base, casing, closets, attic stairs', 'RESI', 'LIVING_SF', 1, 'SF', 1.82, 3.24, 4.58, 'med'),
  L('T-048', '12.10', '06 20 00', 'hard', 'Interior shell', 'Doors and trim install labor', 'RESI', 'LIVING_SF', 1, 'SF', 0.55, 0.55, 0.65, 'high'),
  L('T-049', '12.10', '06 20 00', 'hard', 'Interior shell', 'Doors and trim final punch', 'RESI', 'UNITS', 1, 'unit', 200, 200, 200, 'high'),
  L('T-050', '14.00', '09 90 00', 'hard', 'Interior shell', 'Paint, interior and exterior, turnkey', 'RESI', 'LIVING_SF', 1, 'SF', 1.45, 1.5, 1.81, 'high'),
  L('T-051', '12.05', '12 30 00', 'hard', 'Finish', 'Cabinets turnkey: kitchen and baths', 'RESI', 'UNITS', 1, 'unit', 2081, 3069, 3719, 'high', [2027, 2947, 3300]),
  L('T-052', '12.20', '12 30 00', 'hard', 'Finish', 'Cabinet pulls and hardware', 'RESI', 'UNITS', 1, 'unit', 0, 0, 450, 'med'),
  L('T-053', '08.05', '26 50 00', 'hard', 'Finish', 'Electrical fixtures (lighting package)', 'RESI', 'UNITS', 1, 'unit', 388.35, 422.72, 733, 'high'),
  L('T-054', '12.25', '12 36 00', 'hard', 'Finish', 'Countertops, granite, turnkey', 'RESI', 'TOPS_SF', 1, 'SF', 18, 23, 31, 'high'),
  L('T-055', '12.25', '22 40 00', 'hard', 'Finish', 'Sinks, kitchen and vanities', 'RESI', 'UNITS', 1, 'unit', 175, 255, 335, 'high'),
  L('T-056', '15.30', '09 30 00', 'hard', 'Finish', 'Kitchen backsplash', 'RESI', 'UNITS', 1, 'unit', 340, 340, 424, 'high'),
  L('T-057', '15.20', '09 30 00', 'hard', 'Finish', 'Tub / shower surround or tile, per bath', 'RESI', 'BATHS', 1, 'bath', 424, 450, 1487.65, 'low', [450, 900, 1487.65]),
  L('T-058', '11.05', '10 28 00', 'hard', 'Finish', 'Shower glass / door', 'RESI', 'UNITS', 1, 'unit', 0, 485, 850, 'high', [0, 0, 485]),
  L('T-059', '11.10', '10 28 00', 'hard', 'Finish', 'Mirrors', 'RESI', 'UNITS', 1, 'unit', 150, 295, 385, 'high'),
  L('T-060', '13.20', '08 70 00', 'hard', 'Finish', 'Door hardware, material', 'RESI', 'UNITS', 1, 'unit', 419.71, 553.12, 664.18, 'high'),
  L('T-061', '13.35', '08 70 00', 'hard', 'Finish', 'Hardware install', 'RESI', 'UNITS', 1, 'unit', 0, 175, 175, 'med'),
  L('T-062', '15.35', '09 60 00', 'hard', 'Finish', 'Vinyl plank flooring, installed', 'RESI', 'LVT_SF', 1, 'SF', 2.49, 2.49, 2.75, 'high'),
  L('T-063', '15.10', '09 60 00', 'hard', 'Finish', 'Carpet with pad, installed', 'RESI', 'CARPET_SF', 1, 'SF', 1.5, 1.75, 1.83, 'high'),
  L('T-064', '15.35', '09 60 00', 'hard', 'Finish', 'Floor prep', 'RESI', 'UNITS', 1, 'unit', 150, 250, 275, 'med'),
  L('T-065', '13.40', '12 21 00', 'hard', 'Finish', 'Window blinds', 'RESI', 'WINDOW_SF', 1, 'SF', 3.49, 3.79, 3.79, 'high'),
  L('T-066', '12.15', '06 40 00', 'hard', 'Finish', 'Interior stair treads and rail, per two-storey home', 'UNIT_STAIRS', 'UNITS', 1, 'unit', 5969.02, 5969.02, 5969.02, 'med'),
  L('T-067', '16.00', '11 31 00', 'hard', 'Finish', 'Appliances: range, dishwasher, microwave', 'RESI', 'UNITS', 1, 'unit', 1539.3, 1611.84, 2026, 'high'),
  L('T-068', '13.25', '08 30 00', 'hard', 'Finish', 'Garage door turnkey, with opener', 'GARAGE', 'UNITS', 1, 'unit', 930, 1295, 1295, 'high'),
  L('T-069', '20.15', '04 03 00', 'hard', 'Multifamily', 'Gypcrete / sound underlayment on upper floors (placeholder rate)', 'APARTMENT', 'ELEVATED_SF', 1, 'SF', 3.25, 3.25, 3.25, 'low'),
  L('T-070', '20.20', '06 10 00', 'hard', 'Multifamily', 'Upper floor system: trusses and subfloor', 'MF_MULTISTORY', 'ELEVATED_SF', 1, 'SF', 6.45, 6.45, 6.45, 'low'),
  L('T-071', '20.30', '26 20 00', 'hard', 'Multifamily', 'Meter bank / house electrical service', 'APARTMENT', 'BLDGS', 1, 'bldg', null, null, null, 'low'),
  L('T-072', '20.00', '21 10 00', 'hard', 'Multifamily', 'Fire sprinklers (NFPA 13R)', 'APARTMENT', 'LIVING_SF', 1, 'SF', null, null, null, 'low'),
  L('T-073', '20.05', '28 30 00', 'hard', 'Multifamily', 'Fire alarm', 'APARTMENT', 'BLDGS', 1, 'bldg', null, null, null, 'low'),
  L('T-074', '20.25', '05 10 00', 'hard', 'Multifamily', 'Exterior egress stairs and rails', 'APARTMENT', 'EXT_STAIR_FLIGHTS', 1, 'flight', 1555, 1555, 1555, 'low'),
  L('T-075', '20.10', '09 20 00', 'hard', 'Multifamily', 'Rated party wall between attached homes', 'ATTACHED', 'UNITS', 1, 'unit', 300, 1800, 1800, 'low'),
  L('T-076', '20.40', 'SC-FS8', 'soft', 'Multifamily', 'Accessibility registration and inspection (TAS / TDLR)', 'APARTMENT', 'PROJECT', 1, 'project', null, null, null, 'low'),
  L('T-077', '20.45', '01 70 00', 'hard', 'Multifamily', 'Takeover: condition survey, protection, accessibility blocking', 'TAKEOVER', 'UNITS', 1, 'unit', 650, 650, 650, 'med'),
  L('T-078', '18.00', '32 10 00', 'hard', 'Site finish', 'Flatwork: driveway, walks, porches', 'RESI', 'FLATWORK_SF', 1, 'SF', 4.65, 4.79, 5.05, 'high'),
  L('T-079', '18.00', '32 10 00', 'hard', 'Site finish', 'City of Houston driveway approach', 'COH', 'APPROACH_SF', 1, 'SF', 7.35, 7.35, 7.35, 'high'),
  L('T-080', '18.50', '32 90 00', 'hard', 'Site finish', 'Landscape package: plants, tree, mulch', 'RESI', 'UNITS', 1, 'unit', 532, 875, 1059.59, 'high'),
  L('T-081', '18.45', '32 90 00', 'hard', 'Site finish', 'Sod installed', 'RESI', 'SOD_SY', 1, 'SY', 3.3, 3.7, 3.7, 'high'),
  L('T-082', '18.10', '31 20 00', 'hard', 'Site finish', 'Final grade', 'RESI', 'UNITS', 1, 'unit', 315, 315, 350, 'high'),
  L('T-083', '18.25', '32 30 00', 'hard', 'Site finish', 'Fence turnkey', 'RESI', 'FENCE_LF', 1, 'LF', 14, 14, 14, 'med'),
  L('T-084', '18.25', '32 30 00', 'hard', 'Site finish', 'Fence gates', 'SF_ONLY', 'UNITS', 1, 'unit', 100, 100, 200, 'med'),
  L('T-085', '18.50', '32 80 00', 'hard', 'Site finish', 'Irrigation, six zones (option)', 'OPTION', 'UNITS', 1, 'unit', 2250, 2250, 2975, 'high'),
  L('T-086', '19.00', '01 74 00', 'hard', 'Close-out', 'Interior cleans: rough, final, touch-up', 'RESI', 'LIVING_SF', 1, 'SF', 0.2, 0.86, 1, 'low'),
  L('T-087', '19.00', '01 74 00', 'hard', 'Close-out', 'Exterior clean / power wash', 'RESI', 'UNITS', 1, 'unit', 100, 150, 200, 'med'),
  L('T-088', '19.00', '01 74 00', 'hard', 'Close-out', 'Street cleaning', 'RESI', 'UNITS', 1, 'unit', 0, 150, 150, 'low'),
  L('T-089', '02.40', 'SC-FS9', 'soft', 'Close-out', 'Home warranty (for-sale homes)', 'SF_ONLY', 'UNITS', 1, 'unit', 600, 895, 895, 'high'),
  L('T-090', '01.15', 'SC-FS10', 'soft', 'Carry', 'Builder’s risk insurance', 'ALWAYS', 'UNITS', 1, 'unit', 150, 1173.06, 1173.06, 'med'),
  L('T-091', '02.00', '01 01 00', 'hard', 'Carry', 'Supervision / construction management', 'ALWAYS', 'UNITS', 1, 'unit', 2671, 2671, 5688, 'med', [2671, 3792, 5688]),
  L('T-092', '02.05', '13 30 00', 'hard', 'Storage / commercial', 'Storage building turnkey, climate-controlled (benchmark only)', 'STORAGE', 'GSF', 1, 'SF', 60, 70, 100, 'low')

];

// The workbook's top-down checks (TOPDOWN_BENCHMARKS): direct cost per living (or net) sf, low / likely / high, by
// product. Its per-unit and per-total-sf rows, the finish-only takeover rows and the pro forma assumption it marks
// "understated, do not use" are left out.
export const BENCHMARKS = {
  SF_DETACHED: [
    { what: 'spec homes of 1,052–1,835 sf, direct build cost', low: 69.83, likely: 79.76, high: 92.6 },
    { what: 'fee-built homes on scattered lots, 2023–24 actuals before fee', low: 98.73, likely: 105.5, high: 108.61 },
    { what: 'a 26-home community bid in the City of Houston', low: 90.38, likely: 90.38, high: 99.63 }
  ],
  TOWNHOME: [
    { what: 'a two-storey townhome budget, not built', low: 98.69, likely: 98.69, high: 104.09 },
    { what: 'an attached duplex, built', low: 119.49, likely: 119.49, high: 132.33 }
  ],
  COTTAGE: [{ what: 'a cottage community priced as drawn and value-engineered', low: 71.35, likely: 76.86, high: 90.2 }],
  APARTMENT: [{ what: 'three-storey sprinklered apartments, full vertical, per net sf', low: 112.55, likely: 114.38, high: 130.93 }],
  STORAGE: [{ what: 'climate-controlled storage turnkey, per gross sf', low: 60, likely: 70, high: 100 }]
};
