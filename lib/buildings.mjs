// The building library: typical building types a site plan is drawn with, as a builder or architect would pick them
// from a product sheet. Each type is a footprint (w along the front, d deep, feet), floors, the use it counts as, and
// for homes the units it holds. The list is generated from a few dozen families and their usual sizes, so there are
// several hundred types, each with a plain name. Shared by the browser (Draw, the Selected box) and the layout engine.

const T = [];
const add = (family, group, use, name, w, d, floors, extra = {}) => T.push({ id: (family + '-' + name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''), family, group, use, name, w, d, floors, ...extra });

// ---------- apartments ----------
// garden walk-ups round open breezeways: 8 units a floor per 120 ft of a 60 ft deep bar (two 30 ft units each side of
// a stair); corridor buildings are deeper with units both sides of an inside hall; podiums wrap parking.
for (const [fam, D, fls, per, label] of [['garden', 60, [2, 3], 120 / 8, 'Garden walk-up'], ['breezeway', 66, [3], 132 / 8, 'Breezeway'], ['corridor', 70, [3, 4], 30, 'Corridor'], ['senior', 72, [3], 32, 'Senior living']])
  for (const fl of fls) for (const L of [120, 150, 180, 210, 240, 270, 300]) {
    if (fam === 'garden' && L > 240) continue;
    const units = (fam === 'corridor' || fam === 'senior' ? Math.round(L / per) * 2 : Math.max(2, Math.round(L / per))) * fl; // corridor buildings: units both sides of the hall
    add(fam, 'Apartments', 'multifamily', label + ' · ' + fl + '-story · ' + L + ' ft · ' + units + ' units', L, D, fl, { units, note: label + ' · ' + units + ' units' });
  }
for (const L of [160, 200, 240]) for (const fl of [3, 4]) { const wing = 65, units = Math.round((L + L * 0.6) * 2 / 30) * fl; add('l-shape', 'Apartments', 'multifamily', 'L-shaped · ' + fl + '-story · ' + L + ' ft · ' + units + ' units', L, Math.round(L * 0.6), fl, { units, form: 'L', wing, note: 'L-shaped · ' + units + ' units' }); }
for (const L of [200, 260, 320]) for (const fl of [3, 4]) { const units = Math.round(L * 2.2 / 30) * fl; add('courtyard', 'Apartments', 'multifamily', 'Courtyard (U) · ' + fl + '-story · ' + L + ' ft · ' + units + ' units', L, Math.round(L * 0.65), fl, { units, form: 'U', wing: 65, note: 'Courtyard · ' + units + ' units' }); }
for (const L of [240, 300, 360]) for (const fl of [4, 5]) { const units = Math.round(L * 3.4 / 30) * (fl - 1); add('podium', 'Apartments', 'multifamily', 'Podium wrap · ' + fl + '-story · ' + L + ' ft · ' + units + ' units', L, 200, fl, { units, form: 'U', wing: 65, note: 'Wrap round a garage · ' + units + ' units' }); }
for (const fl of [6, 8, 12, 16]) for (const L of [120, 160]) { const units = (fl - 2) * Math.round(L * 60 / 900); add('tower', 'Apartments', 'multifamily', 'Tower on podium · ' + fl + ' floors · ' + L + ' ft · ' + units + ' units', L, 120, fl, { units, form: 'tower', podium: 2, note: 'Tower on a 2-floor podium · ' + units + ' units' }); }
add('clubhouse', 'Apartments', 'amenity', 'Clubhouse · 4,500 sf', 90, 50, 1, { note: 'Leasing · fitness · lounge' });
add('clubhouse', 'Apartments', 'amenity', 'Clubhouse · 7,500 sf', 110, 68, 1, { note: 'Leasing · fitness · lounge · work rooms' });

// ---------- townhomes and duplexes ----------
for (const uw of [18, 20, 22, 24, 28]) for (const n of [3, 4, 5, 6, 8]) for (const fl of [2, 3]) {
  const D = uw <= 20 ? 36 : uw <= 24 ? 40 : 44, sf = uw * D * fl - (fl === 3 ? 400 : 0);
  add('townhome', 'Townhomes', 'townhomes', n + '-unit row · ' + uw + ' ft units · ' + fl + '-story · ' + sf.toLocaleString('en-US') + ' sf each', n * uw, D, fl, { units: n, unitW: uw, note: n + ' units · ' + uw + ' ft wide · ' + fl + '-story' });
}
for (const [w, d, fl, sf, label] of [[40, 32, 2, 1280, 'Compact'], [44, 40, 2, 1760, 'Standard'], [50, 44, 2, 2200, 'Large'], [56, 40, 1, 1120, 'Single-story'], [64, 44, 1, 1400, 'Single-story large'], [40, 36, 2, 1440, 'Rear-load'], [36, 48, 2, 1700, 'Narrow lot'], [60, 36, 1, 1080, 'Cottage pair']])
  add('duplex', 'Duplexes', 'duplex', label + ' duplex · ' + fl + '-story · ' + sf.toLocaleString('en-US') + ' sf each', w, d, fl, { units: 2, note: label + ' duplex · 2 units' });

// ---------- single-family house plans ----------
// footprints include the garage; lot width is what the plan needs with 5 ft side yards (plus a little for eaves)
const PLANS = [['Bluebonnet', 1, 1450, 44, 52], ['Cypress', 1, 1650, 48, 54], ['Pecan', 1, 1850, 52, 56], ['Magnolia', 1, 2100, 56, 60], ['Live Oak', 1, 2400, 62, 64], ['Mesquite', 1, 1300, 40, 50],
  ['Brazos', 2, 2000, 36, 42], ['Guadalupe', 2, 2300, 38, 44], ['Trinity', 2, 2600, 42, 46], ['Sabine', 2, 2900, 46, 48], ['Neches', 2, 3200, 50, 50], ['Pedernales', 2, 3600, 54, 52], ['Frio', 2, 1800, 32, 40], ['Llano', 2, 2100, 34, 44],
  ['San Jacinto', 3, 2700, 28, 40], ['Colorado', 3, 3100, 30, 42], ['Nueces', 3, 3400, 32, 44], ['Rio Grande', 3, 2400, 26, 38],
  ['Laredo (side-load)', 1, 2200, 66, 54], ['Waco (side-load)', 2, 3000, 52, 48], ['Tyler (courtyard)', 1, 2600, 70, 58], ['Abilene (rear-load)', 2, 2200, 30, 52], ['Odessa (rear-load)', 2, 1900, 28, 50], ['Midland (rear-load)', 3, 2500, 24, 44]];
for (const [n, fl, sf, w, d] of PLANS) add('house', 'Single-family homes', 'sfr', n + ' · ' + fl + '-story · ' + sf.toLocaleString('en-US') + ' sf', w, d, fl, { units: 1, sf, lotW: Math.ceil((w + 10) / 5) * 5, note: n + ' plan · ' + fl + '-story · ' + sf.toLocaleString('en-US') + ' sf' });

// ---------- manufactured and tiny homes (a home community: homes on rented or sold lots along private lanes) ----------
// w is the end that faces the lane, d its length; lotW the lot with the 10 ft between homes and a parking pad beside it.
// kind: which community they're for (lib/siteplan.mjs HOME_KINDS); a "mixed" community takes the tiny homes and the
// shorter single-wides.
const COMMUNITY = [['Single-wide 16 × 56', 'manufactured', 896, 16, 56, 40], ['Single-wide 16 × 76', 'manufactured', 1216, 16, 76, 40], ['Double-wide 28 × 52', 'manufactured', 1456, 28, 52, 50], ['Double-wide 28 × 64', 'manufactured', 1792, 28, 64, 50],
  ['Tiny home 12 × 32', 'tiny', 384, 12, 32, 30], ['Park model 14 × 40', 'tiny', 560, 14, 40, 32], ['Cottage 20 × 40', 'tiny', 800, 20, 40, 36]];
for (const [n, kind, sf, w, d, lotW] of COMMUNITY) add('mhome', kind === 'tiny' ? 'Tiny homes' : 'Manufactured homes', 'sfr', n + ' · ' + sf.toLocaleString('en-US') + ' sf', w, d, 1, { units: 1, sf, lotW, kind, ...(kind === 'tiny' ? { tiny: true } : {}), note: n + ' · ' + sf.toLocaleString('en-US') + ' sf' });

// ---------- tiny homes ----------
// one-story homes of 400–800 sf for a tiny-home (or RV-style) community: 16 ft wide on a 25 ft lot with a parking pad
// beside the home, or 20 ft wide on a 30 ft lot. They count as homes (use 'sfr') and are marked tiny, so the pro forma
// and the renderings treat them as the small homes they are; never picked for an ordinary neighbourhood's house mix.
for (const [sf, w, d, lotW] of [[400, 16, 25, 25], [480, 16, 30, 25], [550, 16, 34.375, 25], [650, 20, 32.5, 30], [800, 20, 40, 30]])
  add('tiny', 'Tiny homes', 'sfr', 'Tiny home · 1-story · ' + sf + ' sf', w, d, 1, { units: 1, sf, lotW, tiny: true, note: 'Tiny home · 1-story · ' + sf + ' sf' });

// ---------- shops, restaurants, offices and the rest ----------
for (const [name, w, d, note] of [['Coffee drive-thru · 900 sf', 36, 25, 'Drive-thru only'], ['Quick-service with drive-thru · 2,500 sf', 50, 50, 'QSR · drive-thru'], ['Quick-service with drive-thru · 3,500 sf', 58, 60, 'QSR · drive-thru'], ['Fast casual · 2,800 sf', 40, 70, 'Fast casual'],
  ['Sit-down restaurant · 5,000 sf', 70, 72, 'Full service'], ['Sit-down restaurant · 7,500 sf', 90, 84, 'Full service · bar'], ['Brewpub · 10,000 sf', 100, 100, 'Restaurant · brewery']]) add('restaurant', 'Restaurants', 'restaurant', name, w, d, 1, { note });
for (const bays of [3, 4, 5, 6, 8, 10, 12, 16, 20]) for (const D of [70, 80]) { const w = bays * 25, sf = w * D; add('strip', 'Shops', 'retail', 'Retail strip · ' + bays + ' bays · ' + sf.toLocaleString('en-US') + ' sf', w, D, 1, { note: bays + ' shop bays · 25 ft wide' }); }
for (const [name, w, d] of [['Convenience store · 4,500 sf', 75, 60], ['Pharmacy · 14,500 sf', 145, 100], ['Junior anchor · 25,000 sf', 200, 125], ['Grocery · 45,000 sf', 300, 150], ['Grocery · 60,000 sf', 330, 182], ['Big box · 100,000 sf', 400, 250], ['Bank with drive-thru · 3,500 sf', 60, 58], ['Auto parts · 7,000 sf', 100, 70], ['Daycare · 10,000 sf', 125, 80], ['Fitness · 20,000 sf', 160, 125]]) add('retail', 'Shops', 'retail', name, w, d, 1);
for (const [fam, use, D, label] of [['medical', 'medical', 100, 'Medical office'], ['office', 'office', 110, 'Office']]) for (const fl of [1, 2, 3, 4]) for (const L of [100, 140, 180, 240]) { if (use === 'medical' && fl > 3) continue; const sf = L * D * fl; add(fam, label === 'Office' ? 'Offices' : 'Medical', use, label + ' · ' + fl + '-story · ' + sf.toLocaleString('en-US') + ' sf', L, D, fl); }
for (const [name, w, d, note] of [['Urgent care · 5,000 sf', 70, 72, 'Walk-in clinic'], ['Freestanding ER · 10,000 sf', 110, 92, 'Emergency'], ['Surgery center · 18,000 sf', 160, 112, 'Outpatient surgery'], ['Dental office · 3,500 sf', 58, 60, 'Dental']]) add('clinic', 'Medical', 'medical', name, w, d, 1, { note });
for (const [name, w, d, note] of [['Flex · 20,000 sf', 200, 100, 'Office/warehouse bays'], ['Flex · 40,000 sf', 320, 125, 'Office/warehouse bays'], ['Rear-load warehouse · 80,000 sf', 400, 200, 'Docks one side'], ['Rear-load warehouse · 150,000 sf', 600, 250, 'Docks one side'],
  ['Cross-dock · 250,000 sf', 800, 312, 'Docks both sides'], ['Cross-dock · 500,000 sf', 1100, 455, 'Docks both sides']]) add('industrial', 'Industrial', 'industrial', name, w, d, name.includes('3-story') ? 3 : 1, { note });
// ---------- self storage ----------
// climate-controlled buildings (inside halls, elevators, the leasing office on the ground floor), drive-up rows (doors
// straight onto the drive aisle: 30 ft deep single-loaded, 40 ft back to back with 10×20s) and a stand-alone office
for (const [fl, L] of [[1, 200], [2, 200], [3, 200], [3, 250], [3, 300], [4, 300]]) add('storage-climate', 'Self storage', 'storage', 'Climate-controlled · ' + fl + '-story · ' + (L * 100 * fl).toLocaleString('en-US') + ' sf', L, 100, fl, { storage: 'climate', note: fl + '-story climate-controlled · office' });
for (const D of [30, 40]) for (const L of [100, 150, 200, 250]) add('storage-drive', 'Self storage', 'storage', 'Drive-up row · ' + D + ' ft deep · ' + L + ' ft · ' + (L * D).toLocaleString('en-US') + ' sf', L, D, 1, { storage: 'drive', note: 'Drive-up units · ' + (D === 40 ? 'back to back' : 'one side') });
add('storage-office', 'Self storage', 'storage', 'Leasing office · 1,200 sf', 40, 30, 1, { storage: 'office', note: 'Leasing office' });
// ---------- food truck parks ----------
// an open-sided pavilion over picnic tables (about 15 sf a seat), restrooms, a bar or beer garden building
for (const [w, d] of [[50, 30], [60, 40], [75, 40], [80, 50], [100, 60]]) add('ft-pavilion', 'Food trucks', 'foodtrucks', 'Pavilion · ' + (w * d).toLocaleString('en-US') + ' sf · ~' + Math.floor(w * d / 15) + ' seats', w, d, 1, { ft: 'pavilion', note: 'Covered · picnic seating' });
for (const [w, d] of [[30, 20], [40, 20], [45, 22]]) add('ft-restroom', 'Food trucks', 'foodtrucks', 'Restrooms · ' + (w * d).toLocaleString('en-US') + ' sf', w, d, 1, { ft: 'restroom', note: 'Men’s · women’s · family' });
for (const [w, d] of [[40, 38], [50, 40], [75, 40]]) add('ft-bar', 'Food trucks', 'foodtrucks', 'Bar · ' + (w * d).toLocaleString('en-US') + ' sf', w, d, 1, { ft: 'bar', note: 'Bar · beer garden' });
// ---------- gas stations ----------
// the convenience store (the canopy and the pumps are a piece of their own: Add, or a gas station layout) and car washes
for (const [sf, w, d] of [[3000, 60, 50], [4000, 70, 57], [4500, 75, 60], [5500, 92, 60], [6000, 100, 60]]) add('fuel-store', 'Gas station', 'fuel', 'Convenience store · ' + sf.toLocaleString('en-US') + ' sf', w, d, 1, { fuel: 'store', note: 'Convenience store' });
for (const [name, L] of [['Car wash · express tunnel · 110 ft', 110], ['Car wash · short tunnel · 80 ft', 80], ['Car wash · in-bay · 50 ft', 50]]) add('fuel-wash', 'Gas station', 'fuel', name, 22, L, 1, { fuel: 'wash', note: name });

for (const [name, w, d, fl, note] of [['Hotel · 4-story · 100 keys', 260, 66, 4, 'Select service'], ['Hotel · 5-story · 140 keys', 300, 70, 5, 'Select service'], ['Church · 12,000 sf', 140, 86, 1, 'Sanctuary · classrooms'], ['Event hall · 8,000 sf', 100, 80, 1, 'Venue'],
  ['Community center · 7,700 sf', 110, 70, 1, 'Event hall · fitness · offices'], ['Pavilion · 4,000 sf', 80, 50, 1, 'Open-air · covered'], ['Gas station canopy + c-store · 5,000 sf', 80, 62, 1, 'Fuel · 8 pumps']]) add('other', 'Other', name.startsWith('Community') || name.startsWith('Pavilion') ? 'amenity' : 'other', name, w, d, fl, { note });

export const BUILDING_TYPES = T;
export const BUILDING_GROUPS = [...new Set(T.map(t => t.group))];
export const typeById = id => T.find(t => t.id === id) || null;
// a piece for the plan from a type: centred on [x, y], turned rot degrees
export function fromType(t, [x, y], rot = 0) {
  const e = { kind: 'building', x: +x.toFixed(2), y: +y.toFixed(2), w: t.w, d: t.d, rot, use: t.use, floors: t.floors, type: t.id, name: '', note: t.note || t.name };
  for (const k of ['units', 'form', 'wing', 'podium', 'unitW', 'sf', 'storage', 'ft', 'fuel', 'tiny']) if (t[k] != null) e[k] = t[k];
  return e;
}
// house plans by stories, for varying the homes along a street
export const HOUSE_PLANS = T.filter(t => t.family === 'house');
// the plans a neighbourhood is built from when the program gives a home size ("1,600–2,100 sf homes") and a number of
// floor plans ("3 floorplans"): that many different front-load plans, spread across the range (one near each end and
// the rest between, the narrower lot where two are as close), so the homes along a street cycle through them. A range
// with fewer plans in it than asked takes the nearest ones outside it. min/max (sf, either may be missing), n (plans;
// missing: every plan in the range, at most 6; a number of plans with no size: from the middle of the market, 1,800–2,800
// sf). [] when nothing is asked (the stories mix decides, as before).
export const COMMUNITY_PLANS = T.filter(t => t.family === 'mhome');
// a home community's plans (kind: manufactured, tiny or mixed), smallest first
export const communityPlans = kind => COMMUNITY_PLANS.filter(h => kind === 'mixed' ? h.kind === 'tiny' || h.d <= 56 : h.kind === kind);
// a community home sized to order (w across the end facing the lane × d long, ft): to fill a pad, or to the size asked.
// Its id carries its size (mhome-fit-tiny-15x32), so a saved plan reads it back.
export function fitPlan({ kind = 'tiny', w, d }) {
  const k = kind === 'manufactured' ? 'manufactured' : 'tiny', W = Math.round(Math.max(8, Math.min(40, +w || 14))), D = Math.round(Math.max(16, Math.min(90, +d || 40))), sf = W * D, name = (k === 'tiny' ? 'Tiny home ' : W >= 24 ? 'Double-wide ' : 'Single-wide ') + W + ' × ' + D;
  return { id: 'mhome-fit-' + k + '-' + W + 'x' + D, family: 'mhome', group: k === 'tiny' ? 'Tiny homes' : 'Manufactured homes', use: 'sfr', name: name + ' · ' + sf.toLocaleString('en-US') + ' sf', w: W, d: D, floors: 1, units: 1, sf, lotW: W + 10, kind: k, ...(k === 'tiny' ? { tiny: true } : {}), fit: true, note: name + ' · ' + sf.toLocaleString('en-US') + ' sf' };
}
// any home plan by its id (a house plan, a community's, or one sized to order)
export const homePlanById = id => HOUSE_PLANS.find(h => h.id === id) || COMMUNITY_PLANS.find(h => h.id === id) || (m => m ? fitPlan({ kind: m[1], w: +m[2], d: +m[3] }) : null)(/^mhome-fit-(tiny|manufactured)-(\d+)x(\d+)$/.exec(id || '')) || null;
// kind (a home community: manufactured, tiny or mixed): its own plans, every one of them unless a size or a number of
// plans is asked, never the builder's houses.
export function housePlansFor({ min = null, max = null, n = null, kind = null } = {}) {
  const own = kind ? communityPlans(kind) : null; if (own?.length && !(+min > 0) && !(+max > 0) && !(+n > 0)) return own.slice().sort((p, q) => p.sf - q.sf || p.lotW - q.lotW);
  let lo = +min > 0 ? +min : +max > 0 ? +max : null, hi = +max > 0 ? +max : lo; if (lo == null && !(+n > 0)) return []; if (lo == null) { lo = own?.length ? Math.min(...own.map(h => h.sf)) : 1800; hi = own?.length ? Math.max(...own.map(h => h.sf)) : 2800; }
  const all = own?.length ? own : HOUSE_PLANS.filter(h => !/rear-load|side-load|courtyard/.test(h.id)), a = Math.min(lo ?? 0, hi ?? Infinity), b = Math.max(lo ?? 0, hi ?? 0) || Infinity;
  const inR = all.filter(h => h.sf >= a && h.sf <= b), want = Math.max(1, Math.min(8, Math.round(+n > 0 ? +n : Math.min(6, inR.length || 3))));
  const off = h => h.sf < a ? a - h.sf : h.sf > b ? h.sf - b : 0, pool = inR.length >= want ? inR : all.slice().sort((p, q) => off(p) - off(q) || p.lotW - q.lotW).slice(0, Math.max(want, inR.length));
  const span = [Math.min(...pool.map(h => h.sf)), Math.max(...pool.map(h => h.sf))], tA = Number.isFinite(a) && a > 0 ? Math.max(a, span[0]) : span[0], tB = Number.isFinite(b) ? Math.min(b, span[1]) : span[1], out = [];
  for (let k = 0; k < want; k++) { const t = want === 1 ? (tA + tB) / 2 : tA + (tB - tA) * k / (want - 1), left = pool.filter(h => !out.includes(h)); if (!left.length) break;
    out.push(left.sort((p, q) => Math.abs(p.sf - t) - Math.abs(q.sf - t) || p.lotW - q.lotW)[0]); }
  return out.sort((p, q) => p.sf - q.sf || p.lotW - q.lotW);
}
