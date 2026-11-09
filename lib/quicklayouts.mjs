// Quick layouts: pick a development type (Multifamily, Retail, Industrial ...) and the site gets about five layouts of it
// at once, each from a fixed request the layout engine reads without the AI (lib/siteplan.mjs guessProgram). Every
// request asks for as much as fits, so the site is filled (none leaves land for later); choices that need more land
// or street frontage than the site has are left out. No AI call, no open-ended prompt: the same type on the same site always gives
// the same requests, and the engine's runs are seeded, so the same layouts. Each request is one the engine is known to
// read as meant (test/quicklayouts.mjs reads every one and lays a set out on sample sites).
//
// quickTypes(acres, frontage) -> [{ id, label, tip, count, why? }]  the type buttons; count 0 = not for a site this size
// quickSet(id, acres, frontage, { sf, buildings }) -> [{ key, label, ask, hotel? }]  the requests for one type, at most
//   QUICK_MAX, with the sizes someone gave in place of "as big as fits"; a hotel variant's parcels: splitSite

export const QUICK_MAX = 5;

const f0 = n => Math.round(n).toLocaleString('en-US');

// each type: a label, a line for its tooltip, and its variants. A variant has a key, a short label, the smallest site
// (acres) and street frontage (ft) it makes sense on, and the request (a function of the acres and frontage).
const TYPES = [
  { id: 'multifamily', label: 'Multifamily', tip: 'Apartments filling the site: garden, walk-up, mid-rise and studio buildings', variants: [
    { key: 'garden', label: 'Garden, 3 stories', min: 1.5, ask: () => 'Garden apartments, 3 stories, as many as fit' },
    { key: 'resort', label: 'Garden around a central pool', min: 3, ask: () => 'Garden apartments, resort-style with a central pool, as many as fit' },
    { key: 'walkup', label: 'Walk-up, 2 stories', min: 1.5, ask: () => 'Walk-up apartments, 2 stories, as many as fit' },
    { key: 'midrise', label: 'Mid-rise, 4 stories', min: 2, ask: () => 'Mid-rise apartments, 4 stories, as many as fit' },
    { key: 'studio', label: 'Studio and 1-bed garden', min: 1.5, ask: () => 'Studio apartments, garden style, as many as fit' },
    { key: 'midrise5', label: 'Mid-rise, 5 stories', min: 3, ask: () => 'Mid-rise apartments, 5 stories, as many as fit' }
  ] },
  { id: 'townhomes', label: 'Townhomes & BTR', tip: 'Townhomes, stacked townhomes, duplexes, fourplexes and build-to-rent cottages filling the site', variants: [
    { key: 'th-rent', label: 'Townhomes for rent, 2-car garages', min: 2, ask: () => 'Townhomes for rent, 2 car garages, as many as fit' },
    { key: 'th-sale', label: 'Townhomes for sale, driveways', min: 2, ask: () => 'Townhomes for sale with driveways, as many as fit' },
    { key: 'stacked', label: 'Stacked townhomes', min: 3, ask: () => 'Stacked townhomes, as many as fit' },
    { key: 'duplex', label: 'Duplexes', min: 2, ask: () => 'Duplexes, as many as fit' },
    { key: 'cottage', label: 'Build-to-rent cottages', min: 3, ask: () => 'Build-to-rent cottages, as many as fit' },
    { key: 'fourplex', label: 'Fourplexes', min: 2, ask: () => 'Fourplexes, as many as fit' },
    { key: 'tiny', label: 'Tiny home community', min: 3, ask: () => 'Tiny home community, as many as fit' },
    { key: 'th-amenity', label: 'Townhomes with amenity center', min: 10, ask: () => 'Townhomes with an amenity center, as many as fit' }
  ] },
  { id: 'sfr', label: 'Single-family', tip: 'Homes on lots along new streets, as many as fit: lot widths and home sizes', variants: [
    { key: 'lots50', label: '50 ft lots', min: 4, ask: () => 'Single family subdivision, 50 ft lots' },
    { key: 'lots40', label: '40 ft lots', min: 8, ask: () => 'Single family subdivision, 40 ft lots' },
    { key: 'lots60', label: '60 ft lots', min: 5, ask: () => 'Single family subdivision, 60 ft lots' },
    { key: 'one-story', label: 'Mostly 1-story homes', min: 4, ask: () => 'Single-family homes, mostly 1-story' },
    { key: 'two-story', label: 'Mostly 2-story homes', min: 4, ask: () => 'Single-family homes, mostly 2-story' }
  ] },
  { id: 'retail', label: 'Retail', tip: 'Shops filling the site: strip centers, pad sites, restaurant pads, a gas station', variants: [
    { key: 'strip', label: 'Retail strip', min: 0.8, front: 120, ask: () => 'Retail strip, as big as fits' },
    { key: 'strip-pads', label: 'Strip with pad sites', min: 2.5, front: 300, ask: (a, fr) => 'Retail strip with ' + (fr >= 500 ? 2 : 1) + ' pad site' + (fr >= 500 ? 's' : '') + ', as big as fits' },
    { key: 'anchored', label: 'Anchored center', min: 8, front: 400, ask: () => 'Anchored center, as big as fits' },
    { key: 'pads', label: 'Restaurant pads with drive-thrus', min: 0.5, ask: () => 'Restaurant pads with drive-thrus, as many as fit' },
    { key: 'fuel', label: 'Gas station and c-store', min: 1, max: 2, front: 150, ask: () => 'Gas station with 8 pumps and a 4,500 sf store' },
    { key: 'fuel-strip', label: 'Gas station plus retail', min: 2, front: 250, ask: () => 'Gas station with a c-store, plus a retail strip as big as fits' },
    { key: 'two-bldgs', label: 'Retail in 2 buildings', min: 3, front: 250, ask: () => 'Retail in 2 buildings, as big as fits' }
  ] },
  { id: 'office', label: 'Office & medical', tip: 'Office and medical office filling the site', variants: [
    { key: 'office2', label: 'Office, 2 stories', min: 1, ask: () => 'Office, 2 stories, as big as fits' },
    { key: 'office3', label: 'Office, 3 stories', min: 2, ask: () => 'Office, 3 stories, as big as fits' },
    { key: 'medical', label: 'Medical office, 1 story', min: 0.7, ask: () => 'Medical office, 1 story, as big as fits' },
    { key: 'medical2', label: 'Medical office, 2 stories', min: 1.5, ask: () => 'Medical office, 2 stories, as big as fits' },
    { key: 'office-pads', label: 'Office with pad sites', min: 3, front: 300, ask: () => 'Office, 2 stories, with 2 pad sites, as big as fits' }
  ] },
  // one hotel building on a parcel of its own at an end of the frontage, retail filling the rest (hotelSplit below)
  { id: 'hotel', label: 'Hotel + retail', tip: 'One hotel building, the rest of the site retail', variants: [
    { key: 'h4-start', label: 'Hotel, 4 stories, retail beside', min: 4, front: 300, hotel: { floors: 4, end: false }, retail: 'Retail strip, as big as fits' },
    { key: 'h4-end', label: 'Hotel at the other end, retail beside', min: 4, front: 300, hotel: { floors: 4, end: true }, retail: 'Retail strip, as big as fits' },
    { key: 'h5', label: 'Hotel, 5 stories, retail beside', min: 4, front: 300, hotel: { floors: 5, end: false }, retail: 'Retail strip, as big as fits' },
    { key: 'h4-pads', label: 'Hotel, retail with a pad site', min: 6, front: 450, hotel: { floors: 4, end: false }, retail: 'Retail strip with 1 pad site, as big as fits' },
    { key: 'h4-rest', label: 'Hotel, restaurant pads', min: 4, front: 300, hotel: { floors: 4, end: true }, retail: 'Restaurant pads with drive-thrus, as many as fit' }
  ] },
  { id: 'industrial', label: 'Industrial', tip: 'Warehouses, flex and self storage filling the site', variants: [
    { key: 'warehouse', label: 'Warehouse, as big as fits', min: 3, ask: () => 'Warehouse with truck court, as big as fits' },
    { key: 'flex', label: 'Multi-tenant flex', min: 2, ask: () => 'Multi-tenant flex buildings, as many as fit' },
    { key: 'storage', label: 'Self storage', min: 2, ask: () => 'Self storage, 3 story climate controlled building plus drive-up units' },
    { key: 'two-whs', label: 'Two warehouses', min: 10, ask: () => 'Warehouses with truck courts in 2 buildings, as big as fits' },
    { key: 'cross-dock', label: 'Cross-dock', min: 25, ask: () => 'Cross-dock warehouse, as big as fits' },
    { key: 'rear-load', label: 'Rear-load warehouse', min: 5, ask: () => 'Rear-load warehouse, as big as fits' },
    { key: 'flex-mezz', label: 'Flex with mezzanine', min: 4, ask: () => 'Flex buildings 120 ft deep with mezzanine' },
    { key: 'cold', label: 'Cold storage', min: 8, ask: () => 'Cold storage warehouse, as big as fits' }
  ] },
  { id: 'mixed', label: 'Mixed use', tip: 'Shops on the street with homes or offices behind, filling the site', variants: [
    { key: 'retail-apts', label: 'Retail + apartments', min: 6, front: 250, ask: () => 'Mixed use: retail along the street with apartments behind, as many as fit' },
    { key: 'retail-th', label: 'Retail + townhomes', min: 6, front: 250, ask: () => 'Mixed use: retail along the street with townhomes behind, as many as fit' },
    { key: 'apts-th', label: 'Apartments + townhomes', min: 10, ask: () => 'Mixed use: apartments and townhomes, as many as fit' },
    { key: 'commons', label: 'Retail, commons and homes', min: 25, front: 300, ask: () => 'Mixed use: retail in front, a commons with a lake, apartments and townhomes, as many as fit' },
    { key: 'retail-office', label: 'Retail + office', min: 4, front: 200, ask: () => 'Mixed use: retail in front and office behind, as big as fits' }
  ] }
];

const fits = (v, acres, frontage) => acres >= v.min && (v.max == null || acres <= v.max) && (!v.front || !(frontage > 0) || frontage >= v.front);

// The sizes someone may give (o.sf, o.buildings): the main use's floor area and its number of buildings, in place of
// "as big as fits". Square feet size the commercial uses and the hotel (homes are counted by how many fit); buildings
// count for every use drawn as buildings (not homes on lots). A hotel is one building unless a number is given.
const SF_TYPES = ['retail', 'office', 'industrial', 'hotel'], NO_BLDGS = /single[- ]family|cottages|tiny home|duplexes|fourplexes|self storage|mixed use|gas station/i;
export const sizeNote = id => SF_TYPES.includes(id) ? '' : id === 'mixed' ? 'Square feet don’t apply to mixed use' : 'Square feet apply to commercial types and hotels';
function sized(ask, id, o) {
  const sf = +o.sf > 0 ? Math.round(+o.sf) : 0, n = +o.buildings > 0 ? Math.round(+o.buildings) : 0; let q = ask;
  if (sf && SF_TYPES.includes(id) && /as big as fits/.test(q)) q = q.replace(/,? ?as big as fits/, ', ' + f0(sf) + ' sf');
  if (n && !NO_BLDGS.test(q)) q += ', in ' + n + ' building' + (n === 1 ? '' : 's');
  return q;
}
// all: every request that fits (the spares replace a layout that comes out the same as another, or doesn't fit).
// A hotel variant comes back with `hotel` ({ keys, floors, buildings, end, words }) and `ask` the retail's request:
// the page splits the site (splitSite) and lays the two parcels out together.
export function quickSet(id, acres, frontage = 0, { all = false, sf = 0, buildings = 0 } = {}) {
  const t = TYPES.find(x => x.id === id), a = +acres || 0; if (!t) return [];
  return t.variants.filter(v => fits(v, a, frontage)).slice(0, all ? undefined : QUICK_MAX).map(v => {
    if (!v.hotel) return { key: t.id + ':' + v.key, label: v.label, ask: sized(v.ask(a, frontage), id, { sf, buildings }) };
    const n = +buildings > 0 ? Math.round(+buildings) : 1, keys = hotelKeys(a, +sf || 0), fl = v.hotel.floors;
    const words = 'Hotel with ' + keys + ' keys, ' + fl + ' stories, in ' + n + ' building' + (n === 1 ? '' : 's');
    return { key: t.id + ':' + v.key, label: v.label, ask: v.retail, hotel: { keys, floors: fl, buildings: n, end: v.hotel.end, words, acres: +hotelAcres(keys, fl, n).toFixed(2), width: n === 1 ? hotelWidth(keys, fl) : 0 } };
  });
}

export function quickTypes(acres, frontage = 0) {
  const a = +acres || 0;
  return TYPES.map(t => {
    const n = quickSet(t.id, a, frontage).length, least = Math.min(...t.variants.map(v => v.min));
    return { id: t.id, label: t.label, tip: t.tip, count: n, ...(n ? {} : { why: t.label + ' needs a site of about ' + (least < 1 ? least.toFixed(1) : f0(least)) + ' acres or more' + (t.variants.some(v => v.front) ? ' with enough street frontage' : '') }) };
  });
}

// a layout from a quick set carries the variant's label as its arrangement name, so the list reads
// "Layout 2 · Mid-rise, 4 stories · Rows facing the street"
export const quickArr = (label, arr) => label + (arr ? ' · ' + arr : '');

// ---------- a hotel and retail: the site split into a hotel parcel and a retail parcel ----------
// The mixed-use engine sizes a commercial zone as if it were one story and stops short of filling the site, so a hotel
// with shops is laid out parcel by parcel (lib/siteparcels.mjs): a hotel parcel at one end of the frontage, about the
// land one hotel building needs, and the rest of the site for retail as big as fits. Both parcels front the street.

// the land a hotel needs, acres: its footprint, a space a key (~350 sf of lot with its share of the aisle) and 90% more
// for drives, buffers, the drop-off and its share of the detention (calibrated on sample sites: less leaves it short of keys)
export const HOTEL_SF_KEY = 550;
export function hotelAcres(keys, floors = 4, buildings = 1) {
  const gfa = keys * HOTEL_SF_KEY, foot = gfa / Math.max(1, floors);
  return (foot + keys * 350) * 1.9 / 43560 * (buildings > 1 ? 1.1 : 1);
}
// the street frontage one hotel building needs: its bar (65 ft deep, as lib/siteplan.mjs USES.hotel) and side drives
export const hotelWidth = (keys, floors = 4) => keys * HOTEL_SF_KEY / Math.max(1, floors) / 65 + 90;
// keys: from the square feet asked for (550 gross sf a key), else about 12 a site acre, 80 to 150 (one select-service building)
export const hotelKeys = (acres, sf = 0) => sf > 0 ? Math.max(20, Math.round(sf / HOTEL_SF_KEY)) : Math.max(80, Math.min(150, Math.round(acres * 12 / 10) * 10));

// the hotel's parcel: a block at the start of the front edge, about `acres`, `width` ft along the street when given (a
// hotel's bar and its side drives: a squarer block makes the engine cut the hotel in two) and as deep as the area needs
// (a full-depth strip on a deep lot is too narrow for a hotel and its parking), and the rest of the site round it.
// clip / diff: polyclip's intersection and difference (lib/vendor/polyclip.mjs), passed in so this file stays
// dependency-free; area: lib/siteplan.mjs ringArea.
export function splitSite(ring, front, acres, { clip, diff, area, width = 0, end = false }) {
  const n = ring.length, a = ring[end ? (front + 1) % n : front], b = ring[end ? front : (front + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!(L > 0) || n < 3) return null;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], c = ring.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  let v = [-u[1], u[0]]; if ((c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1] < 0) v = [-v[0], -v[1]]; // (into the site)
  const t = p => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1], w = p => (p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1];
  const t0 = Math.min(...ring.map(t)), t1 = Math.max(...ring.map(t)), D = Math.max(...ring.map(w)), at = (s, h) => [a[0] + u[0] * s + v[0] * h, a[1] + u[1] * s + v[1] * h];
  const want = acres * 43560, total = area(ring); if (want <= 0 || want >= total * 0.7) return null;
  const cl = r => r.concat([r[0]]), big = (pgs) => pgs.map(pg => pg[0].slice(0, -1)).filter(r => r.length >= 3).sort((x, y) => area(y) - area(x));
  // at most 60% of the frontage, so the retail keeps a street front: deeper (up to the whole depth) when that's too little
  const cap = t0 + (t1 - t0) * 0.6;
  let depth = Math.min(D, Math.max(220, width > 0 ? want / width : Math.sqrt(want * 1.25))); // (width: the frontage the building needs, so it stays one bar)
  const box = (s1, d) => [at(t0 - 50, -50), at(s1, -50), at(s1, d), at(t0 - 50, d)];
  const piece = (s1, d) => { try { return big(clip([cl(ring)], [cl(box(s1, d))]))[0] || null; } catch (e) { return null; } };
  const ar = (s1, d) => { const p = piece(s1, d); return p ? area(p) : 0; };
  while (ar(cap, depth) < want && depth < D) depth = Math.min(D, depth * 1.25);
  if (ar(cap, depth) < want) return null; // (no room for the hotel with retail beside it)
  let lo = t0, hi = cap;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ar(m, depth) < want) lo = m; else hi = m; }
  const first = piece(hi, depth); if (!first) return null;
  let rest; try { rest = big(diff([cl(ring)], [cl(first)]))[0] || null; } catch (e) { return null; }
  return rest && area(first) + area(rest) > total * 0.98 ? { first, rest } : null;
}
