// Businesses and places from two free, open datasets: Overture Maps Places (Meta, Microsoft, BrightQuery and others,
// CDLA-Permissive 2.0) and Foursquare Open Source Places (Apache 2.0). Shared by build/places.mjs (load into Supabase),
// api/places.js and the browser (map layer colors). Pure functions, no network.
//   GROUPS        the map's place groups: label and color
//   groupOf(text) a place's group from its category path ("services_and_business > financial_service > bank" or
//                 "Business and Professional Services > Financial Service > Bank")
//   overtureRow / fsqRow   one source record -> our row, or null when it is closed, unnamed or too doubtful to map
//   dedupe(rows)  Overture and Foursquare often list the same business; merge records with the same name a few steps apart

export const GROUPS = {
  food: { label: 'Food & drink', color: '#e8590c' },
  shop: { label: 'Retail', color: '#d6336c' },
  health: { label: 'Health care', color: '#e03131' },
  auto: { label: 'Auto & transport', color: '#5c7cfa' },
  finance: { label: 'Banks & insurance', color: '#2f9e44' },
  realestate: { label: 'Real estate', color: '#0ca678' },
  office: { label: 'Offices & professional', color: '#1971c2' },
  trades: { label: 'Construction & home services', color: '#f08c00' },
  industrial: { label: 'Industrial, wholesale & farms', color: '#6741d9' },
  personal: { label: 'Personal services', color: '#ae3ec9' },
  lodging: { label: 'Hotels & lodging', color: '#1098ad' },
  education: { label: 'Schools & child care', color: '#e6a700' },
  recreation: { label: 'Parks, sports & entertainment', color: '#74b816' },
  community: { label: 'Government, worship & community', color: '#868e96' },
  other: { label: 'Other', color: '#adb5bd' }
};

// The source's own top level decides first; business services (and anything unknown) are sorted by keywords, first match
// wins, specific groups before broad ones ("dry cleaning" is a personal service although it sits under business services).
const RULES = [
  ['community', /post office|postal service|town hall|city hall|courthouse/],
  ['lodging', /\blodging\b|\bhotels?\b|\bmotels?\b|bed and breakfast|\binn\b|campground|rv park|\bresorts?\b/],
  ['food', /food and drink|dining and drinking|restaurant|\bbars?\b|\bpub\b|brewery|winery|\bcafe|coffee|tea house|bakery|eatery|food truck|donut|dessert|ice cream|juice bar|caterer|catering|beverage venue/],
  ['health', /health care|health and medicine|hospital|clinic|dentist|dental|doctor|physician|pharmacy|medical|urgent care|chiropract|optometr|veterinar|therapy|therapist|hospice|nursing home|outpatient/],
  ['education', /education|\bschools?\b|college|university|place of learning|child care|day care|daycare|preschool|tutor/],
  ['auto', /vehicle|automotive|\bauto\b|car dealer|car wash|gas station|fueling|\bparking|\btires?\b|transportation|airport|bus station|train station|\brail|trucking|towing|motorcycle|\bboats?\b/],
  ['finance', /financial|\bbanks?\b|banking|credit union|insurance|accountant|accounting|tax prep|tax service|\batm\b|mortgage|investment|\bloans?\b/],
  ['realestate', /real estate|property management|apartment|housing or property|condominium|realtor|home builder|land surveying/],
  ['trades', /home service|construction|contractor|plumb|electrician|roofing|hvac|heating|landscap|home improvement|remodel|\bpainters?\b|painting contractor|flooring|pest control|\bpools?\b|handyman|locksmith|cleaning service|home cleaning|\bfenc|concrete|welding|masonry|carpent|cabinet|countertop|garage door|appliance repair|septic/],
  ['industrial', /b2b|manufactur|supplier|distribut|wholesale|warehouse|storage|shipping|delivery|industrial|agricultur|logistics|factory|oil and gas|chemical|machine shop|heavy equipment|metal fabricat|recycling|waste/],
  ['personal', /lifestyle services|beauty|salon|barber|\bspa\b|\bnails?\b|wellness|laundry|dry clean|\bpets?\b|animal|tattoo|massage|tailor|funeral|wedding|photograph/],
  ['recreation', /sports and recreation|arts and entertainment|landmarks and outdoors|\bevents?\b|\bparks?\b|\bgym|fitness|golf|theater|theatre|cinema|museum|entertainment|stadium|arena|bowling|playground|\btrails?\b|marina|\bzoo\b/],
  ['shop', /shopping|retail|\bstores?\b|\bshops?\b|market|boutique|\bmall\b|outlet|pawn|florist|jewel/],
  ['community', /community and government|government|place of worship|church|mosque|synagogue|temple|religious|civic|post office|library|fire station|police|utility|cultural and historic|historic|cemetery|social service|non ?profit|charity|association|organization/],
  ['office', /services and business|business and professional|professional|legal|attorney|lawyer|law firm|office|consult|media|design|marketing|advertising|technical|printing|rental|employment|staffing|engineer|architect|software|it service|computer|telecom/]
];
const TOP = {
  food_and_drink: 'food', 'dining and drinking': 'food', health_care: 'health', 'health and medicine': 'health', lodging: 'lodging', education: 'education',
  lifestyle_services: 'personal', sports_and_recreation: 'recreation', arts_and_entertainment: 'recreation', 'arts and entertainment': 'recreation',
  'sports and recreation': 'recreation', 'landmarks and outdoors': 'recreation', event: 'recreation', community_and_government: 'community',
  cultural_and_historic: 'community', geographic_entities: 'other'
};
const byRules = (t, only) => { for (const [g, re] of RULES) if ((!only || only.includes(g)) && re.test(t)) return g; return null; };
const norm = s => String(s || '').toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
// one category path, either "services_and_business > financial_service > bank" (Overture) or
// "Business and Professional Services > Financial Service > Bank" (Foursquare); several Foursquare labels joined by " | "
export function groupOf(text) {
  const paths = String(text || '').split('|').map(p => p.split('>').map(x => x.trim()).filter(Boolean)).filter(p => p.length);
  for (const p of paths) {
    const top = p[0].toLowerCase(), rest = norm(p.slice(1).join(' ')), all = norm(p.join(' '));
    if (TOP[top]) return TOP[top] === 'community' && /education|school|college|university/.test(rest) ? 'education' : TOP[top];
    if (top === 'shopping' || top === 'retail') return byRules(rest, ['auto', 'food']) === 'auto' ? 'auto' : 'shop';
    if (top === 'travel_and_transportation' || top === 'travel and transportation') return /lodging|hotel|motel/.test(rest) ? 'lodging' : 'auto';
    if (top === 'community and government') return /education|school|college|university|child care/.test(rest) ? 'education' : 'community';
    if (top === 'services_and_business' || top === 'business and professional services') return byRules(rest || all) || 'office';
  }
  return byRules(norm(String(text || '').replace(/[>|]/g, ' '))) || 'other';
}
const nice = s => String(s || '').replace(/_/g, ' ').replace(/\b(and|or|of)\b/g, m => m).replace(/^\w/, c => c.toUpperCase());

// "Bank of Texas, N.A." and "Bank Of Texas" -> "bank of texas"; legal suffixes and "the" don't count
export function normName(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|llc|l l c|inc|incorporated|co|corp|corporation|ltd|lp|llp|pllc|pc|na|n a)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
const clip = (s, n) => { s = String(s ?? '').trim(); return s ? s.slice(0, n) : null; };
const r6 = v => Math.round(v * 1e6) / 1e6;
const cleanWeb = u => { u = clip(u, 300); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href.replace(/\/$/, '') : null; } catch { return null; } };
export function cleanPhone(p) {
  const d = String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : clip(p, 24);
}
const zip5 = z => (String(z || '').match(/\d{5}/) || [null])[0];
const title = s => s && s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;

// Overture place (columns selected by build/places.mjs) -> row. Places without a street number are often businesses
// that serve an area from home and are pinned to the town center, so they need a higher confidence to be shown.
export function overtureRow(o) {
  const name = clip(o.name, 160); if (!name || !Number.isFinite(o.lon) || !Number.isFinite(o.lat)) return null;
  if (/closed/i.test(o.status || '')) return null;
  const conf = +o.conf || 0, addr = clip(o.addr, 160), hasNum = /^\d/.test(addr || '');
  if (conf < (hasNum ? 0.4 : 0.75)) return null;
  const path = (o.hier || []).filter(Boolean), srcs = [...new Set((o.srcs || []).filter(s => s && !/^overture/i.test(s)).map(s => s.toLowerCase()))];
  if (!path.length && conf < 0.9) return null;
  if (path[0] === 'geographic_entities') return null; // rivers and lakes: the base map already names them
  return { id: 'ov:' + o.id, name, grp: groupOf(path.join(' > ') || name), cat: clip(nice(o.cat || path[path.length - 1] || ''), 80), brand: clip(o.brand, 120),
    addr, city: clip(title(o.city), 60), zip: zip5(o.zip), phone: cleanPhone(o.phone), web: cleanWeb(o.web), lon: r6(o.lon), lat: r6(o.lat),
    src: ['overture', ...srcs], conf: Math.round(conf * 100) / 100 };
}
// Foursquare OS Places record -> row. Foursquare keeps places it hasn't confirmed in years, so stale ones are left out.
export function fsqRow(f, { since = '2023-01-01' } = {}) {
  const name = clip(f.name, 160), lon = +f.longitude, lat = +f.latitude; if (!name || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (f.date_closed) return null;
  if (f.date_refreshed && String(f.date_refreshed) < since) return null;
  const labels = (f.fsq_category_labels || []).filter(Boolean), first = labels[0] || '';
  return { id: 'fsq:' + f.fsq_place_id, name, grp: groupOf(labels.join(' | ') || name), cat: clip(first.split('>').pop().trim(), 80), brand: null,
    addr: clip(f.address, 160), city: clip(title(f.locality), 60), zip: zip5(f.postcode), phone: cleanPhone(f.tel), web: cleanWeb(f.website), lon: r6(lon), lat: r6(lat),
    src: ['foursquare'], conf: null };
}

const M_PER_DEG = 111320;
const dist = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180), a.lat - b.lat) * M_PER_DEG;
// Same business: same name within 50 m, or one name starting with the other (at least 5 letters) within 40 m.
// The first record keeps its id; empty fields are filled from the duplicate and the sources are combined.
export function dedupe(rows, { far = 50, near = 40 } = {}) {
  const cell = 0.001, grid = new Map(), out = [];
  const key = (x, y) => x + ',' + y;
  for (const r of rows) {
    const n = normName(r.name); if (!n) continue;
    const gx = Math.floor(r.lon / cell), gy = Math.floor(r.lat / cell);
    let hit = null;
    for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) {
      for (const o of grid.get(key(gx + dx, gy + dy)) || []) {
        const d = dist(r, o); if (d > far) continue;
        if (o._n === n || (d <= near && Math.min(n.length, o._n.length) >= 5 && (n.startsWith(o._n) || o._n.startsWith(n)))) { hit = o; break; }
      }
    }
    if (hit) {
      for (const k of ['cat', 'brand', 'addr', 'city', 'zip', 'phone', 'web']) if (!hit[k] && r[k]) hit[k] = r[k];
      if (hit.grp === 'other' && r.grp !== 'other') hit.grp = r.grp;
      hit.src = [...new Set([...hit.src, ...r.src])];
      continue;
    }
    const x = { ...r, _n: n }; out.push(x);
    const k = key(gx, gy); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(x);
  }
  return out.map(({ _n, ...r }) => r);
}

// even-odd point in polygon over GeoJSON-style polygon coordinates ([[ring], …] or MultiPolygon [[[ring]], …])
export function inOutline(p, outline) {
  const polys = typeof outline?.[0]?.[0]?.[0] === 'number' ? [outline] : outline || [];
  for (const poly of polys) {
    let c = false;
    for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    if (c) return true;
  }
  return false;
}

// compact rows for the map layer, from the places_in_box RPC: [id, name, grp, lon, lat]
export const BOX_FIELDS = ['id', 'name', 'grp', 'lon', 'lat'];
export const SOURCE_LABEL = { overture: 'Overture Maps', foursquare: 'Foursquare', meta: 'Meta', microsoft: 'Microsoft', brightquery: 'BrightQuery' };
export const sourceText = src => [...new Set((src || []).map(s => SOURCE_LABEL[s] || s))].join(', ');
