// Ported from fs-budgeting-suite test/fee-schedules.json (origin/feature @ 4187c8c).
// The City of Waller, TX water & sewer impact and tap fee schedule, as provided by the city on 2025-10-15 — the
// schedule the source suite seeds as tx-waller v1. Priced by evaluate() in ../impactfees.mjs.
//
// THE MODEL. water impact = EDU x $3,689.91 and sewer impact = EDU x $7,619.03, but the PUBLISHED per-row amounts below
// are authoritative and are never recomputed: the city's true water rate is ~$3,689.9104, so deriving the 330-EDU row
// from the rounded rate lands 12 cents under what the city bills. eduRates is carried for display only.
// Impact fees are single-valued; the low/high spread applies only to the four adders (meter, vault, water tap work,
// sewer tap work). A meter with no vault range (3 inch and under) is the workbook's "NA" and contributes nothing.
// Meter rows are keyed by rowId, never by size: 2 inch appears at both 80 and 100 gpm, and gpm sets the EDU.
//
// DOM-free and dependency-free: loaded by Node and by the browser.

export const source = {
  kind: 'data',
  label: 'City of Waller impact fee schedule, provided 2025-10-15',
  ref: 'fs-budgeting-suite fee schedule tx-waller v1 (origin/feature @ 4187c8c)',
  asOf: '2025-10-15',
  region: 'City of Waller, Waller County, TX',
  confidence: 'medium',
  note: 'The city\'s published per-meter amounts as provided on 2025-10-15. Fee schedules change by ordinance; confirm the current '
    + 'schedule with the city before relying on it. The low/high adder ranges (meter, vault, taps) are the city\'s estimate spread.'
};

// One row per meter: size (inches), gpm, EDU multiplier, the two impact fees, and the adder ranges.
const M = (rowId, size, gpm, edu, waterImpact, sewerImpact, meter, vault, waterTap, sewerTap) =>
  vault ? { rowId, size, gpm, edu, waterImpact, sewerImpact, meter, vault, waterTap, sewerTap }
        : { rowId, size, gpm, edu, waterImpact, sewerImpact, meter, waterTap, sewerTap };

export const TX_WALLER = {
  scheduleKey: 'tx-waller',
  name: 'City of Waller, TX',
  jurisdiction: 'City of Waller',
  state: 'TX',
  effective: '2025-10-15',
  version: 1,
  source,
  eduRates: { water: 3689.91, sewer: 7619.03 },
  // Generic non-meter fees (roadway, park, drainage…): Waller publishes none.
  fees: [],
  meters: [
    M('m-58-34-10', '5/8 or 3/4', 10, 1, 3689.91, 7619.03, { low: 464, high: 580 }, null, { low: 1850, high: 2350 }, { low: 1850, high: 2350 }),
    M('m-34-15', '3/4', 15, 1.5, 5534.87, 11428.54, { low: 493, high: 616.25 }, null, { low: 1850, high: 2350 }, { low: 1850, high: 2350 }),
    M('m-1-25', '1', 25, 2.5, 9224.78, 19047.57, { low: 623.5, high: 779.38 }, null, { low: 2100, high: 3400 }, { low: 2100, high: 3400 }),
    M('m-1p5-50', '1.5', 50, 5, 18449.55, 38095.13, { low: 1986.5, high: 2483.13 }, null, { low: 2700, high: 3700 }, { low: 2700, high: 3700 }),
    M('m-2-80', '2', 80, 8, 29519.28, 60952.22, { low: 1986.5, high: 2483.13 }, null, { low: 3000, high: 3700 }, { low: 3000, high: 3700 }),
    M('m-2-100', '2', 100, 10, 36899.1, 76190.27, { low: 1986.5, high: 2483.13 }, null, { low: 3000, high: 3700 }, { low: 3000, high: 3700 }),
    M('m-3-160', '3', 160, 16, 59038.57, 121904.43, { low: 2755, high: 3443.75 }, null, { low: 3250, high: 4500 }, { low: 3250, high: 4500 }),
    M('m-3-240', '3', 240, 24, 88557.85, 182856.65, { low: 2755, high: 3443.75 }, null, { low: 3250, high: 4500 }, { low: 3250, high: 4500 }),
    M('m-4-250', '4', 250, 25, 92247.76, 190475.67, { low: 3799, high: 4748.75 }, { low: 14500, high: 21000 }, { low: 3900, high: 5250 }, { low: 3900, high: 5250 }),
    M('m-4-420', '4', 420, 42, 154976.24, 319999.13, { low: 3799, high: 4748.75 }, { low: 14500, high: 21000 }, { low: 3900, high: 5250 }, { low: 3900, high: 5250 }),
    M('m-6-500', '6', 500, 50, 184495.52, 380951.35, { low: 6264, high: 7830 }, { low: 22000, high: 30000 }, { low: 4600, high: 6500 }, { low: 4600, high: 6500 }),
    M('m-6-920', '6', 920, 92, 339471.75, 700950.48, { low: 6264, high: 7830 }, { low: 22000, high: 30000 }, { low: 4600, high: 6500 }, { low: 4600, high: 6500 }),
    M('m-8-800', '8', 800, 80, 295192.83, 609522.16, { low: 7482, high: 9352.5 }, { low: 35000, high: 46000 }, { low: 5300, high: 7900 }, { low: 5300, high: 7900 }),
    M('m-8-1600', '8', 1600, 160, 590385.66, 1219044.32, { low: 7482, high: 9352.5 }, { low: 35000, high: 46000 }, { low: 5300, high: 7900 }, { low: 5300, high: 7900 }),
    M('m-10-1150', '10', 1150, 115, 424339.69, 876188.1, { low: 13920, high: 17400 }, { low: 46000, high: 58000 }, { low: 6250, high: 9000 }, { low: 6250, high: 9000 }),
    M('m-10-2500', '10', 2500, 250, 922477.59, 1904756.74, { low: 13920, high: 17400 }, { low: 46000, high: 58000 }, { low: 6250, high: 9000 }, { low: 6250, high: 9000 }),
    M('m-12-3300', '12', 3300, 330, 1217670.42, 2514278.9, { low: 17870.58, high: 22338.23 }, { low: 59000, high: 75000 }, { low: 7800, high: 11500 }, { low: 7800, high: 11500 }),
  ]
};

export default TX_WALLER;
