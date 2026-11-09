// Quick layouts: pick a development type (Multifamily, Retail, Industrial ...) and the site gets about five layouts of it
// at once, each from a fixed request the layout engine reads without the AI (lib/siteplan.mjs guessProgram), sized to
// this site's acreage and street frontage. No AI call, no open-ended prompt: the same type on the same site always gives
// the same requests, and the engine's runs are seeded, so the same layouts. Each request is one the engine is known to
// read as meant (test/quicklayouts.mjs reads every one and lays a set out on sample sites).
//
// quickTypes(acres, frontage) -> [{ id, label, tip, count, why? }]  the type buttons; count 0 = not for a site this size
// quickSet(id, acres, frontage) -> [{ key, label, ask }]             the requests for one type, at most QUICK_MAX

export const QUICK_MAX = 5;

const f0 = n => Math.round(n).toLocaleString('en-US');
// a size from the acreage, rounded to `step`, held between lo and hi
const size = (v, step, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v / step) * step));

// each type: a label, a line for its tooltip, and its variants. A variant has a key, a short label, the smallest site
// (acres) and street frontage (ft) it makes sense on, and the request (a function of the acres and frontage).
const TYPES = [
  { id: 'multifamily', label: 'Multifamily', tip: 'Apartments: garden, walk-up, mid-rise and courtyard buildings', variants: [
    { key: 'garden', label: 'Garden, 3 stories', min: 1.5, ask: () => 'Garden apartments, 3 stories, as many as fit' },
    { key: 'resort', label: 'Garden around a central pool', min: 3, ask: () => 'Garden apartments, resort-style with a central pool, as many as fit' },
    { key: 'walkup', label: 'Walk-up, 2 stories', min: 1.5, ask: () => 'Walk-up apartments, 2 stories, as many as fit' },
    { key: 'midrise', label: 'Mid-rise, 4 stories', min: 2, ask: () => 'Mid-rise apartments, 4 stories, as many as fit' },
    { key: 'courtyard', label: 'Courtyard building', min: 6, ask: a => 'Courtyard apartments, ' + size(a * 15, 10, 100, 240) + ' units' },
    { key: 'studio', label: 'Studio and 1-bed garden', min: 1.5, ask: () => 'Studio apartments, garden style, as many as fit' }
  ] },
  { id: 'townhomes', label: 'Townhomes & BTR', tip: 'For-rent and for-sale townhomes, duplexes and build-to-rent cottages', variants: [
    { key: 'th-rent', label: 'Townhomes, 2-car garages', min: 2, ask: () => 'Townhomes for rent, 2 car garages, as many as fit' },
    { key: 'th-amenity', label: 'Townhomes with amenity center', min: 10, ask: () => 'Townhomes with an amenity center, as many as fit' },
    { key: 'th-count', label: 'Townhomes, lower density', min: 3, ask: a => size(a * 7, 5, 15, 300) + ' townhomes, 3 stories' },
    { key: 'duplex', label: 'Duplexes', min: 2, ask: () => 'Duplexes, as many as fit' },
    { key: 'cottage', label: 'Build-to-rent cottages', min: 3, ask: () => 'Build-to-rent cottages, as many as fit' }
  ] },
  { id: 'sfr', label: 'Single-family', tip: 'Homes on lots along new streets: lot widths and home sizes', variants: [
    { key: 'lots50', label: '50 ft lots', min: 4, ask: () => 'Single family subdivision, 50 ft lots' },
    { key: 'lots40', label: '40 ft lots', min: 8, ask: () => 'Single family subdivision, 40 ft lots' },
    { key: 'lots60', label: '60 ft lots', min: 5, ask: () => 'Single family subdivision, 60 ft lots' },
    { key: 'one-story', label: 'Mostly 1-story homes', min: 4, ask: () => 'Single-family homes, mostly 1-story' },
    { key: 'two-story', label: 'Mostly 2-story homes', min: 4, ask: () => 'Single-family homes, mostly 2-story' }
  ] },
  { id: 'retail', label: 'Retail', tip: 'Strip centers, pad sites, restaurants and a gas station', variants: [
    { key: 'strip', label: 'Retail strip', min: 1.5, front: 120, ask: a => size(a * 8000, 1000, 6000, 60000) + ' sf retail strip' },
    { key: 'strip-pads', label: 'Strip with pad sites', min: 2.5, front: 300, ask: (a, fr) => size(a * 6000, 1000, 8000, 50000) + ' sf retail strip with ' + (fr >= 500 ? 2 : 1) + ' pad site' + (fr >= 500 ? 's' : '') },
    { key: 'anchored', label: 'Anchored center', min: 8, front: 400, ask: a => 'Anchored center: a ' + size(a * 2500, 5000, 30000, 60000) + ' sf anchor, ' + size(a * 5500, 5000, 60000, 160000) + ' sf total' },
    { key: 'qsr', label: 'Restaurant with drive-thru', min: 0.5, max: 4, ask: a => (a < 0.8 ? '2,500' : '3,500') + ' sf restaurant with a drive-thru' },
    { key: 'fuel', label: 'Gas station and c-store', min: 1, max: 6, front: 150, ask: a => 'Gas station with ' + (a >= 2 ? 12 : 8) + ' pumps and a ' + (a >= 2 ? '5,500' : '4,500') + ' sf store' },
    { key: 'two-bldgs', label: 'Retail in 2 buildings', min: 3, front: 250, ask: a => size(a * 4000, 1000, 12000, 60000) + ' sf retail in 2 buildings' },
    { key: 'plaza', label: 'Shops round a plaza', min: 3, front: 250, ask: a => size(a * 4000, 1000, 12000, 50000) + ' sf retail strip with a plaza' }
  ] },
  { id: 'office', label: 'Office & hotel', tip: 'Office, medical office and a limited-service hotel', variants: [
    { key: 'office2', label: 'Office, 2 stories', min: 1, ask: a => size(a * 9000, 1000, 8000, 150000) + ' sf office, 2 stories' },
    { key: 'office3', label: 'Office, 3 stories', min: 2, ask: a => size(a * 12000, 1000, 20000, 200000) + ' sf office, 3 stories' },
    { key: 'medical', label: 'Medical office, 1 story', min: 0.7, ask: a => size(a * 6000, 500, 4000, 60000) + ' sf medical office, 1 story' },
    { key: 'medical2', label: 'Medical office, 2 stories', min: 1.5, ask: a => size(a * 9000, 1000, 10000, 90000) + ' sf medical office, 2 stories' },
    { key: 'hotel', label: 'Hotel', min: 2, ask: a => 'Hotel with ' + size(a * 30, 10, 80, 150) + ' keys, 4 stories' }
  ] },
  { id: 'industrial', label: 'Industrial', tip: 'Warehouses with truck courts, flex and self storage', variants: [
    { key: 'warehouse', label: 'Warehouse, as big as fits', min: 3, ask: () => 'Warehouse with truck court, as big as fits' },
    { key: 'flex', label: 'Multi-tenant flex', min: 2, ask: () => 'Multi-tenant flex buildings, as many as fit' },
    { key: 'storage', label: 'Self storage', min: 2, ask: () => 'Self storage, 3 story climate controlled building plus drive-up units' },
    { key: 'two-whs', label: 'Two warehouses', min: 10, ask: () => 'Warehouses with truck courts in 2 buildings' },
    { key: 'cross-dock', label: 'Cross-dock', min: 25, ask: () => 'Cross-dock warehouse, as big as fits' },
    { key: 'rear-load', label: 'Rear-load warehouse', min: 5, ask: () => 'Rear-load warehouse, as big as fits' },
    { key: 'flex-mezz', label: 'Flex with mezzanine', min: 4, ask: () => 'Flex buildings 120 ft deep with mezzanine' },
    { key: 'cold', label: 'Cold storage', min: 8, ask: () => 'Cold storage warehouse, as big as fits' }
  ] },
  { id: 'mixed', label: 'Mixed use', tip: 'Shops on the street with homes behind', variants: [
    { key: 'retail-apts', label: 'Retail + apartments', min: 6, front: 250, ask: a => size(a * 1500, 1000, 8000, 40000) + ' sf retail along the street with ' + size(a * 14, 10, 60, 400) + ' apartments behind' },
    { key: 'retail-th', label: 'Retail + townhomes', min: 6, front: 250, ask: a => size(a * 1500, 1000, 8000, 40000) + ' sf retail along the street with ' + size(a * 5, 5, 20, 200) + ' townhomes behind' },
    { key: 'apts-th', label: 'Apartments + townhomes', min: 10, ask: a => 'Mixed use: ' + size(a * 10, 10, 80, 400) + ' apartments and ' + size(a * 3, 5, 20, 150) + ' townhomes' },
    { key: 'commons', label: 'Retail, commons and homes', min: 25, front: 300, ask: a => 'Mixed use: retail in front, a commons with a lake, ' + size(a * 4, 10, 100, 400) + ' apartments, ' + size(a * 0.8, 2, 12, 80) + ' townhomes' },
    { key: 'retail-office', label: 'Retail + office', min: 4, front: 200, ask: a => 'Mixed use: ' + size(a * 2500, 1000, 8000, 40000) + ' sf retail in front and ' + size(a * 4000, 1000, 10000, 80000) + ' sf office behind' }
  ] }
];

const fits = (v, acres, frontage) => acres >= v.min && (v.max == null || acres <= v.max) && (!v.front || !(frontage > 0) || frontage >= v.front);

// all: every request that fits (the spares replace a layout that comes out the same as another, or doesn't fit)
export function quickSet(id, acres, frontage = 0, { all = false } = {}) {
  const t = TYPES.find(x => x.id === id), a = +acres || 0; if (!t) return [];
  return t.variants.filter(v => fits(v, a, frontage)).slice(0, all ? undefined : QUICK_MAX).map(v => ({ key: t.id + ':' + v.key, label: v.label, ask: v.ask(a, frontage) }));
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
