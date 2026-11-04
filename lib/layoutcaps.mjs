// What the layout engine can do, form by form, and how sure we are. A brief asking for a form marked 'unsupported' gets
// an 'unsupported' outcome from lib/layoutrun.mjs instead of a different product drawn in its place.
//   implemented – the engine draws this form's own geometry
//   validated   – implemented, and runs on the benchmark sites pass the independent validator (test/layoutrun.mjs,
//                 scripts/layout-bench-v2.mjs); still concept-level, not engineering
//   partial     – drawn with a stated simplification (see note)
//   unsupported – not drawn; asking for it says so
// docs/LAYOUT-ENGINE.md shows this table; keep both in step.
export const CAPS_VERSION = '2026-11-03.1';

export const CAPS = {
  // multifamily
  'mf-garden': { family: 'multifamily', label: 'Garden apartments (breezeway, 3 floors)', status: 'implemented', engine: 'multifamily bars / garden buildings (lib/sitelayout.mjs, lib/sitegen.mjs)', template: 'mf-garden-*' },
  'mf-garden-studio': { family: 'multifamily', label: 'Studio / 1-bed garden buildings', status: 'partial', engine: 'garden geometry with the studio template', template: 'mf-garden-studio-3s', note: 'Six studio / 1-bed homes a floor in the reviewed breezeway stack: an estimate (no reviewed studio building in the library).' },
  'mf-walkup': { family: 'multifamily', label: 'Walk-up apartments', status: 'partial', engine: 'garden geometry', note: 'Drawn as garden buildings (same stair-served footprint); no separate walk-up schedule yet.' },
  'mf-courtyard': { family: 'multifamily', label: 'Courtyard buildings', status: 'implemented', engine: 'courtyard ring of wings round the pool (lib/sitegen.mjs courtyard)', note: 'Wings joined into one courtyard building in the run (shared corners counted once); a clubhouse in the court is reached through it. Unit counts are a floor-area estimate (no reviewed courtyard template).' },
  'mf-midrise': { family: 'multifamily', label: 'Mid-rise (4–5 floors, corridor and elevator)', status: 'partial', engine: 'double-loaded bars at 4–5 floors', note: 'Cores, elevators and corridors are counted from the template, not drawn.' },
  'mf-tuck-under': { family: 'multifamily', label: 'Tuck-under parking', status: 'unsupported', note: 'Garages under the first floor are not drawn; the validator understands raised floors (z0) when a layout has them.' },
  'mf-podium': { family: 'multifamily', label: 'Podium (residential over a parking podium)', status: 'partial', engine: 'tower-on-podium form with a 2-floor podium (lib/sitelayout.mjs form "tower"); 4+ floors of apartments park on the podium levels', note: 'Podium spaces are counted on a stall grid (60 ft double-loaded modules, a 12-stall ramp a level, 85% of the ground level), not a drawn garage plan: no ramps, columns or cores are laid out.' },
  'mf-wrap': { family: 'multifamily', label: 'Wrap (apartments round a garage)', status: 'partial', engine: 'lib/sitegen.mjs wrapOf: one double-loaded building (65 ft wings) on three sides of a parking garage, the pool in a courtyard between the street wing and the garage, the garage entered from a back drive', note: 'Garage spaces are counted on a stall grid (9 x 18 ft stalls, 24 ft aisles, a 12-stall ramp a level, 85% of the ground level), not a drawn garage plan; the garage is sized to the homes less the visitor rows. Units come from floor area at 85% efficiency (no reviewed wrap template); corridors, cores and the garage\'s structure are not drawn.' },
  'mf-tower-podium': { family: 'multifamily', label: 'Tower on podium', status: 'partial', engine: 'form "tower": a tower 60% of a 2-floor podium 128 ft deep; the fewest podium levels that park the tower are parking, the rest homes; surface rows for the remainder', note: 'Podium parking counted on a stall grid (an estimate of a garage layout); the 60% tower share is an estimate (no podium project in the reviewed library). No structure or cores.' },
  'mf-townhome': { family: 'multifamily', label: 'Townhomes', status: 'implemented', engine: 'townhome rows with garages (lib/sitelayout.mjs), rear-load lanes' },
  'mf-stacked-townhome': { family: 'multifamily', label: 'Stacked townhomes', status: 'unsupported', note: 'Two homes stacked in one row unit are not modelled.' },
  'mf-plex': { family: 'multifamily', label: 'Duplex / triplex / fourplex', status: 'partial', engine: 'duplex buildings', note: 'Duplexes are drawn; triplexes and fourplexes are drawn as duplex rows.' },
  'mf-cottage-btr': { family: 'multifamily', label: 'Cottage / detached build-to-rent', status: 'implemented', engine: 'home communities on lanes (lib/sitecommunity.mjs) and lots (lib/streetnet.mjs)' },
  'sfr-subdivision': { family: 'multifamily', label: 'Single-family lots (for sale)', status: 'implemented', engine: 'street network and lots (lib/streetnet.mjs)' },
  // retail
  'ret-inline': { family: 'retail', label: 'Inline / strip center', status: 'implemented', engine: 'shop rows facing parking (lib/siteparking.mjs, lib/sitelayout.mjs)' },
  'ret-inline-pads': { family: 'retail', label: 'Strip center with pad sites', status: 'implemented', engine: 'pads along the frontage' },
  'ret-anchored': { family: 'retail', label: 'Anchored / neighborhood center', status: 'partial', engine: 'lib/sitecenter.mjs anchoredCenter', note: 'With an exact total the engine can draw one big box instead of an anchor and shops (benchmark RE-anchored, 2026-11-03); the anchor split is not validated.' },
  'ret-freestanding': { family: 'retail', label: 'Freestanding building', status: 'implemented', engine: 'parking-field engine, one building' },
  'ret-restaurant': { family: 'retail', label: 'Restaurant pad', status: 'implemented', engine: 'lib/sitepad.mjs' },
  'ret-drive-through': { family: 'retail', label: 'Drive-through', status: 'partial', engine: 'drive-thru lanes (lib/sitepad.mjs)', note: 'Queue lanes are drawn; queue length against a stacking rule is not checked.' },
  // industrial
  'ind-warehouse': { family: 'industrial', label: 'Warehouse with truck court', status: 'implemented', engine: 'truck court on the dock side (lib/sitelayout.mjs)', note: 'Dock doors are not counted; no swept-path check.' },
  'ind-rear-load': { family: 'industrial', label: 'Rear-load warehouse', status: 'partial', engine: 'warehouse with the truck court behind', note: 'Dock side follows the frame; not set by the brief yet.' },
  'ind-front-load': { family: 'industrial', label: 'Front-load warehouse', status: 'partial', engine: 'warehouse with the truck court in front' },
  'ind-side-load': { family: 'industrial', label: 'Side-load warehouse', status: 'unsupported' },
  'ind-cross-dock': { family: 'industrial', label: 'Cross-dock', status: 'unsupported', note: 'Truck courts on two opposite sides are not drawn.' },
  'ind-park': { family: 'industrial', label: 'Multi-building industrial park', status: 'partial', engine: 'several warehouse buildings on one site' },
  // flex
  'flex-multi-tenant': { family: 'flex', label: 'Multi-tenant flex / small bay', status: 'partial', engine: 'shallow industrial buildings (prog.flex)', note: 'Bays and office share are not modelled as geometry.' },
  // mixed use
  'mx-horizontal': { family: 'mixed_use', label: 'Horizontal mixed use (zones / tracts)', status: 'implemented', engine: 'zones, pods and tracts (lib/sitecompose.mjs, lib/sitepods.mjs, lib/sitetract.mjs)' },
  'mx-vertical': { family: 'mixed_use', label: 'Vertical mixed use (retail under apartments)', status: 'unsupported', note: 'The generator does not stack uses; the validator does check stacked layouts by level.' }
};
// uses that aren't one of the forms above pass through as the engine's own use (offices, hotels, storage, fuel…)
export const FORMLESS_OK = ['office', 'medical', 'hotel', 'church', 'storage', 'fuel', 'foodtrucks', 'other', 'retail', 'restaurant', 'industrial', 'multifamily', 'townhomes', 'duplex', 'sfr'];
export const capOf = form => CAPS[form] || null;
export function capsTable() { return Object.entries(CAPS).map(([id, c]) => ({ id, ...c })); }
