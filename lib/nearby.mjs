// "What's the nearest …": categories mapped to OpenStreetMap tags, the Overpass query, and result parsing.
// Shared by api/nearby.js and the tests.
export const CATEGORIES = {
  airport: { label: 'Airport', q: ['nwr["aeroway"="aerodrome"]'], radius: [25000, 80000, 160000] },
  restaurant: { label: 'Restaurant', q: ['nwr["amenity"~"^(restaurant|fast_food|food_court)$"]'] },
  coffee: { label: 'Coffee shop', q: ['nwr["amenity"="cafe"]'] },
  bar: { label: 'Bar', q: ['nwr["amenity"~"^(bar|pub|biergarten)$"]'] },
  gas: { label: 'Gas station', q: ['nwr["amenity"="fuel"]'] },
  ev: { label: 'EV charging', q: ['nwr["amenity"="charging_station"]'] },
  grocery: { label: 'Grocery store', q: ['nwr["shop"~"^(supermarket|grocery|wholesale)$"]'] },
  hospital: { label: 'Hospital', q: ['nwr["amenity"="hospital"]', 'nwr["healthcare"="hospital"]'], radius: [5000, 20000, 60000] },
  clinic: { label: 'Clinic / urgent care', q: ['nwr["amenity"~"^(clinic|doctors)$"]', 'nwr["healthcare"~"^(clinic|doctor|urgent_care)$"]'] },
  pharmacy: { label: 'Pharmacy', q: ['nwr["amenity"="pharmacy"]'] },
  school: { label: 'School', q: ['nwr["amenity"="school"]'] },
  college: { label: 'College / university', q: ['nwr["amenity"~"^(college|university)$"]'], radius: [10000, 40000, 100000] },
  hotel: { label: 'Hotel', q: ['nwr["tourism"~"^(hotel|motel)$"]'] },
  bank: { label: 'Bank', q: ['nwr["amenity"="bank"]'] },
  atm: { label: 'ATM', q: ['nwr["amenity"="atm"]'] },
  park: { label: 'Park', q: ['nwr["leisure"="park"]'] },
  gym: { label: 'Gym', q: ['nwr["leisure"="fitness_centre"]'] },
  hardware: { label: 'Hardware / home improvement', q: ['nwr["shop"~"^(doityourself|hardware|trade)$"]'] },
  mall: { label: 'Shopping center', q: ['nwr["shop"="mall"]', 'nwr["landuse"="retail"]["name"]'] },
  police: { label: 'Police', q: ['nwr["amenity"="police"]'] },
  fire: { label: 'Fire station', q: ['nwr["amenity"="fire_station"]'] },
  library: { label: 'Library', q: ['nwr["amenity"="library"]'] },
  post: { label: 'Post office', q: ['nwr["amenity"="post_office"]'] },
  church: { label: 'Place of worship', q: ['nwr["amenity"="place_of_worship"]'] },
  transit: { label: 'Transit station', q: ['nwr["public_transport"="station"]', 'nwr["railway"~"^(station|halt)$"]', 'nwr["amenity"="bus_station"]'] },
  highway: { label: 'Highway entrance', q: ['node["highway"="motorway_junction"]'] },
  rail: { label: 'Rail line', q: ['way["railway"="rail"]["usage"~"^(main|branch|industrial)$"]'], radius: [3000, 10000, 30000] },
  water: { label: 'Water / sewer plant', q: ['nwr["man_made"~"^(wastewater_plant|water_works)$"]'], radius: [5000, 20000, 60000] },
  substation: { label: 'Electric substation', q: ['nwr["power"="substation"]'] },
  childcare: { label: 'Daycare', q: ['nwr["amenity"~"^(childcare|kindergarten)$"]'] },
  storage: { label: 'Self-storage', q: ['nwr["shop"="storage_rental"]'] },
  car_wash: { label: 'Car wash', q: ['nwr["amenity"="car_wash"]'] },
  auto: { label: 'Auto repair / dealer', q: ['nwr["shop"~"^(car|car_repair|tyres)$"]'] }
};
const ALIASES = [
  [/airport|airfield|aerodrome|runway/, 'airport'], [/restaurant|food|eat|dining|lunch|dinner|fast food/, 'restaurant'], [/coffee|cafe|starbucks/, 'coffee'],
  [/\bbar\b|pub|brewery/, 'bar'], [/gas|fuel|petrol|convenience/, 'gas'], [/\bev\b|charg/, 'ev'], [/grocer|supermarket|h-?e-?b|kroger|walmart|costco/, 'grocery'],
  [/hospital|emergency room|\ber\b/, 'hospital'], [/urgent|clinic|doctor/, 'clinic'], [/pharmac|drug ?store|cvs|walgreens/, 'pharmacy'],
  [/college|universit/, 'college'], [/school/, 'school'], [/hotel|motel|lodging/, 'hotel'], [/\batm\b/, 'atm'], [/bank/, 'bank'], [/park\b|playground/, 'park'],
  [/gym|fitness/, 'gym'], [/hardware|home depot|lowe|home improvement|lumber/, 'hardware'], [/mall|shopping (center|centre)/, 'mall'], [/police|sheriff/, 'police'],
  [/fire/, 'fire'], [/library/, 'library'], [/post office|usps/, 'post'], [/church|worship|mosque|temple/, 'church'],
  [/transit|train station|bus station|metro|rail station/, 'transit'], [/highway|freeway|interstate|on-?ramp|exit/, 'highway'], [/rail(road)?\b|rail line|freight/, 'rail'],
  [/wastewater|sewer|water (plant|treatment)/, 'water'], [/substation|power/, 'substation'], [/daycare|childcare|day care/, 'childcare'], [/storage/, 'storage'],
  [/car wash/, 'car_wash'], [/auto|car (dealer|repair)|mechanic|tire/, 'auto']
];
export function categoryOf(what) {
  const w = String(what || '').toLowerCase().trim();
  if (CATEGORIES[w]) return w;
  for (const [re, k] of ALIASES) if (re.test(w)) return k;
  return null;
}
const esc = s => String(s).replace(/["\\]/g, '').slice(0, 60);
// a brand or name ("Buc-ee's", "Chick-fil-A") when the request isn't a category
export function overpassQuery(cat, what, lat, lon, radius, limit) {
  const parts = cat ? CATEGORIES[cat].q : ['nwr["name"~"' + esc(what) + '",i]', 'nwr["brand"~"' + esc(what) + '",i]'];
  return '[out:json][timeout:20];(' + parts.map(p => p + '(around:' + Math.round(radius) + ',' + lat + ',' + lon + ');').join('') + ');out tags center ' + Math.max(40, limit * 8) + ';';
}
// businesses by name for the map search: only shops, restaurants, offices, services and the like (not roads or towns
// that happen to share the name)
export function businessQuery(name, lat, lon, radius, limit) {
  const n = esc(name).replace(/[.*+?^${}()|[\]]/g, '.'), around = '(around:' + Math.round(radius) + ',' + lat + ',' + lon + ')';
  const kinds = '[~"^(shop|amenity|office|healthcare|craft|leisure|tourism|club)$"~"."]';
  return '[out:json][timeout:20];(nwr["name"~"' + n + '",i]' + kinds + around + ';nwr["brand"~"' + n + '",i]' + kinds + around + ';);out tags center ' + Math.max(40, limit * 6) + ';';
}
// map-search business results from OpenStreetMap (with coordinates) and the Texas Comptroller (addresses only):
// one entry per business location, OpenStreetMap first when both have it
const normName = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/\b(llc|inc|ltd|lp|co|corp|the|store|#?\d+)\b/g, ' ').replace(/\s+/g, ' ').trim();
const streetKey = a => { const m = String(a || '').toUpperCase().match(/^(\d{1,6})\s+(.+?)(?:\s+(?:STE|SUITE|UNIT|#).*)?$/); return m ? m[1] + ' ' + m[2].split(/\s+/).filter(w => w.length > 2).slice(0, 1).join('') : ''; };
export function mergeBusinesses(osm = [], comp = [], limit = 10) {
  const out = [], seen = new Set();
  const key = (name, addr) => normName(name).split(' ').slice(0, 2).join(' ') + '|' + streetKey(addr);
  for (const p of osm) { const k = key(p.name, p.address); if (seen.has(k)) continue; seen.add(k); out.push({ src: 'osm', name: p.name, kind: p.kind || '', address: p.address || '', lat: p.lat, lon: p.lon, miles: p.miles }); }
  for (const t of comp) {
    const k = key(t.name, t.addr); if (seen.has(k) || (streetKey(t.addr) && out.some(o => o.src === 'osm' && normName(o.name).startsWith(normName(t.name).split(' ')[0]) && streetKey(o.address) === streetKey(t.addr)))) continue;
    seen.add(k); out.push({ src: 'comptroller', name: t.name, kind: t.sector || '', address: [t.addr, t.city].filter(Boolean).join(', '), city: t.city, zip: t.zip, owner: t.owner, opened: t.opened });
  }
  return out.slice(0, limit);
}
const R = 3958.8, rad = x => x * Math.PI / 180;
export const miles = (a, b) => { const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
export function parsePlaces(elements, origin, cat, limit) {
  const seen = new Set(), out = [];
  for (const e of elements || []) {
    const t = e.tags || {}, c = e.center || e; if (c.lat == null) continue;
    if (cat === 'airport' && /^(private|military)$/.test(t['aerodrome:type'] || t.access || '') && !t.iata) continue;
    const name = t.name || t.brand || t.operator || (cat ? CATEGORIES[cat].label : 'Unnamed'), key = name.toLowerCase() + '|' + c.lat.toFixed(3) + c.lon.toFixed(3);
    if (seen.has(key)) continue; seen.add(key);
    const addr = [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');
    out.push({ name: String(name).slice(0, 100), kind: cat ? CATEGORIES[cat].label : (t.amenity || t.shop || t.tourism || t.leisure || '').replace(/_/g, ' '), brand: t.brand || undefined,
      address: addr || undefined, lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6), miles: +miles(origin, [c.lat, c.lon]).toFixed(2),
      ...(cat === 'airport' ? { code: t.iata || t.icao || t['faa'] || t.ref || undefined, airport_type: t['aerodrome:type'] || (t.iata ? 'commercial' : 'general aviation') } : {}),
      ...(t.opening_hours ? { hours: t.opening_hours.slice(0, 80) } : {}), ...(t.website ? { website: t.website.slice(0, 120) } : {}) });
  }
  // commercial airports first when someone asks for "the nearest airport"
  return out.sort((a, b) => a.miles - b.miles).slice(0, limit);
}
