// Photoreal renderings of a site plan: the camera for each view, the brief the browser builds from the plan, the prompt
// the server writes from it, and which GPT Image model to use. No DOM, no network: shared by src/siteplan.js, api/render.js
// and test/render.mjs.
//
// How a rendering is made: the browser points the map's 3D massing (buildings at their heights, paving, pond, trees) at
// the site from a preset camera, takes a picture of it, and sends it with the brief. The server asks the image model to
// edit that picture into a photograph: keep every building, drive and parking row where it is, add materials, windows,
// landscaping, cars and sky. The picture is a concept illustration: placement and heights follow the plan, details are
// invented, and two renders of one plan differ.
import { USES, outwardOf, longestEdge, centroid, shapeOf, segDist } from './siteplan.mjs';

const RAD = Math.PI / 180;
export const SIZE = { w: 1920, h: 1080 }; // what's asked for; a model that can't do 1080p gets the nearest it offers (SIZES)
export const SIZES = ['1920x1080', '1536x1024', '1024x1024']; // tried in this order when the model refuses a size

// the camera presets: where the picture is taken from, relative to the street side of the site
export const VIEWS = [
  { id: 'corner', label: 'From the corner', tip: 'A marketing aerial from over the street corner, so the fronts and one side of the buildings show and the whole site is in the frame', turn: -35, pitch: 50, back: 0.55 },
  { id: 'front', label: 'From the street', tip: 'An aerial from over the street, looking squarely into the site', turn: 0, pitch: 48, back: 0.55 },
  { id: 'low', label: 'Low, at the entry', tip: 'A lower view from over the entry drive, closer to what a visitor arriving by car sees', turn: 10, pitch: 64, back: 0.4 },
  { id: 'rear', label: 'From the back', tip: 'An aerial from behind the site, looking toward the street', turn: 180 + 25, pitch: 48, back: 0.55 },
  // one building, close: the selected one, else the one nearest the street (heroTarget); not part of "All site views"
  { id: 'hero', label: 'Building close-up', tip: 'A closer aerial of one building from the street corner, with the parking and landscape around it; select a building on the plan first to choose which', turn: -35, pitch: 45, back: 0.5, hero: true }
];
export const SITE_VIEWS = VIEWS.filter(v => !v.hero).map(v => v.id); // "All site views": the four that frame the whole parcel
export const HERO_PAD = 45; // feet of parking and landscape kept round the building in a close-up
export const LOOKS = [
  { id: 'auto', label: 'Materials to suit the use', text: null },
  { id: 'brick', label: 'Brick and stone', text: 'red and tan brick with cast stone bands and sills, standing-seam metal awnings' },
  { id: 'stucco', label: 'Stucco and stone', text: 'warm stucco in two tones with stone veneer bases and bronze storefront' },
  { id: 'modern', label: 'Modern: glass, metal panel, wood', text: 'dark metal panel, large glass storefront, warm wood-look soffits and accents' },
  { id: 'tiltwall', label: 'Tilt-wall concrete', text: 'painted tilt-wall concrete panels with reveal joints, clerestory glazing and blue-grey accent bands' }
];
export const TIMES = [
  { id: 'day', label: 'Midday', text: 'clear late-morning sun, crisp shadows, blue sky with a few clouds' },
  { id: 'golden', label: 'Late afternoon', text: 'warm late-afternoon light, long soft shadows, a slightly hazy Gulf Coast sky' },
  { id: 'dusk', label: 'Dusk', text: 'dusk, a deep blue sky, interior and site lighting on, parking lot lights glowing' }
];
export const byId = (list, id, dflt = list[0]) => list.find(x => x.id === id) || dflt;

// how a use looks when no look is picked (Houston-area commercial construction)
const USE_LOOK = {
  retail: 'a modern retail strip: brick and stucco in warm tones, tall glass storefronts, metal canopies and parapet signs',
  restaurant: 'a freestanding restaurant: brick and stone, patio seating, a drive-thru lane with a canopy where the plan shows one',
  office: 'a suburban office building: brick and stone base, ribbon windows, a glass entry element',
  medical: 'a medical office building: brick and stone, large punched windows, a covered drop-off canopy',
  hotel: 'a select-service hotel: EIFS and stone in two colours, a porte-cochère, regular rows of guest-room windows',
  church: 'a worship building: brick, a tall glazed gathering space, a simple tower element',
  industrial: 'a tilt-wall warehouse: painted concrete panels with reveal joints, clerestory glazing at the office corner, dock doors on the truck court',
  fuel: 'a gas station: a convenience store in brick and metal panel with a glass storefront facing the pumps, a flat white fuel canopy on slim columns with a lit fascia band over the pump islands, and a car wash tunnel where the plan shows one',
  storage: 'self storage: a multi-storey climate-controlled building in metal panel and stucco with a glassy corner leasing office and a covered loading bay, single-storey metal drive-up buildings with rows of coloured roll-up doors facing the drive aisles, and a black steel fence with a keypad gate',
  multifamily: 'garden-style apartments: fibre-cement siding and brick, pitched shingle roofs, balconies, breezeway stairs',
  townhomes: 'two- and three-storey townhomes: brick fronts with siding, pitched roofs, front-loaded garages where the plan shows them',
  duplex: 'cottage-style duplexes: siding and stone, pitched roofs, covered porches',
  sfr: 'single-family homes: brick and siding, pitched shingle roofs, driveways and front lawns',
  foodtrucks: 'a food truck park: colourful food trucks parked side by side on concrete pads with their serving windows and awnings facing the seating, string lights overhead, an open-sided timber pavilion with a metal roof over picnic tables, a small bar with roll-up glass doors and a beer garden of picnic tables under umbrellas, lawn games on the grass and a playground',
  amenity: 'a clubhouse: stone and siding, a pitched roof and a covered porch; the pool with lounge chairs and umbrellas where the plan shows one',
  other: 'a commercial building: brick and stucco, storefront glass'
};

// the compass bearing (degrees clockwise from north, as the map takes it) that looks from the street into the site
export function streetBearing(plan) {
  const r = plan.ring || []; if (r.length < 3) return 0;
  const n = outwardOf(r, plan.front != null && plan.front < r.length ? plan.front : longestEdge(r)); // outward normal of the street side, in plan feet (x east, y north)
  return ((Math.atan2(-n[0], -n[1]) / RAD) + 360) % 360;
}
// The building a close-up frames: the one selected on the plan when it is a building, else the building nearest the
// street front (the least distance from any of its corners to the front edge of the parcel). Null when there is none.
export function heroTarget(plan, selectedId = null) {
  const B = (plan.elements || []).filter(e => e.kind === 'building'); if (!B.length) return null;
  const sel = selectedId != null && B.find(e => e.id === selectedId); if (sel) return sel;
  const r = plan.ring || []; if (r.length < 3) return B[0];
  const f = plan.front != null && plan.front < r.length ? plan.front : longestEdge(r), a = r[f], b = r[(f + 1) % r.length];
  const dist = e => Math.min(...shapeOf(e).map(p => segDist(p, a, b)));
  return B.reduce((best, e) => dist(e) < dist(best) ? e : best);
}
// what a close-up keeps in the frame: the building's outline boxed along its own axes and grown by `pad` feet each side
// (a rotated rectangle, four corners in plan feet)
export function heroPoints(e, pad = HERO_PAD) {
  const t = (e.rot || 0) * RAD, c = Math.cos(t), s = Math.sin(t), loc = shapeOf(e).map(([x, y]) => [(x - e.x) * c + (y - e.y) * s, -(x - e.x) * s + (y - e.y) * c]);
  const x0 = Math.min(...loc.map(p => p[0])) - pad, x1 = Math.max(...loc.map(p => p[0])) + pad, y0 = Math.min(...loc.map(p => p[1])) - pad, y1 = Math.max(...loc.map(p => p[1])) + pad;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [e.x + x * c - y * s, e.y + x * s + y * c]);
}
const heightOf = e => (e.floors || 1) * (USES[e.use]?.floorH || 12);
// a building's name as the renderings show it
export const buildingName = e => String(e?.name || '').trim().slice(0, 40) || 'Building';
// a rendering's title: the view, and for a close-up the building it frames ("Building close-up · Building A")
export const renderLabel = (view, target = null) => { const V = byId(VIEWS, view); return V.label + (V.hero ? ' · ' + buildingName(target) : ''); };
// the site's extent (feet) across and along a bearing
function extentAlong(ring, bearing) {
  const a = bearing * RAD, ux = Math.sin(a), uy = Math.cos(a); // the look direction, in plan feet
  let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
  for (const [x, y] of ring) { const d = x * ux + y * uy, s = x * uy - y * ux; lo = Math.min(lo, d); hi = Math.max(hi, d); lo2 = Math.min(lo2, s); hi2 = Math.max(hi2, s); }
  return { depth: hi - lo, width: hi2 - lo2, near: lo, far: hi };
}
// A camera for a view: center (plan feet), zoom, pitch and bearing, for a canvas `px` wide at latitude `lat`. The site
// sits in the lower two thirds of the frame with its surroundings behind it; the tallest building is kept in frame.
// zoom = log2(earth circumference / (metres per pixel * 256)); metres per pixel chosen so the site's width (across the
// look direction, with room either side) spans a little over half the canvas at the picture's middle (a pitched view
// shows more ground toward the top). Zoom is capped at 19, the map's limit.
// The close-up ('hero') frames one building instead: `target` (an element, or its id), else heroTarget's pick; the box
// it fits is the building grown by HERO_PAD (heroPoints) and only that building's height counts. No building: the site.
export function cameraFor(view, plan, { px = 1600, lat = 29.8, target = null } = {}) {
  const V = byId(VIEWS, view), b = (streetBearing(plan) + V.turn + 360) % 360, B = (plan.elements || []).filter(x => x.kind === 'building');
  const T = V.hero ? (target && typeof target === 'object' ? target : heroTarget(plan, target)) : null;
  const ring = T ? heroPoints(T) : plan.ring || [], c = centroid(ring);
  const e = extentAlong(ring, b), tall = Math.max(20, ...(T ? [T] : B).map(heightOf));
  const span = Math.max(e.width * 1.25, e.depth * 0.9 + tall * 2, T ? 120 : 250); // feet across the frame at the site
  const mpp = span * 0.3048 / (px * 0.55), zoom = Math.max(14.5, Math.min(19, Math.log2(40075016.686 * Math.cos(lat * RAD) / (mpp * 256))));
  const a = b * RAD, ux = Math.sin(a), uy = Math.cos(a), k = (V.back - 0.5) * e.depth; // the camera's target: toward the back of the site for a pitched view
  return { view: V.id, center: [c[0] + ux * k, c[1] + uy * k], zoom: +zoom.toFixed(2), pitch: V.pitch, bearing: +b.toFixed(1), ...(T ? { target: { id: T.id, name: buildingName(T) } } : {}) };
}

// what the browser tells the server about the plan: the program in words, so the prompt can describe the buildings
// the picture shows. Small and plain: counts, floors, uses, what else is on the site. `focus` (an element) is the building
// a close-up frames: its name, use and storeys.
export function briefOf(plan, { metrics = null, address = '', facts = [], look = 'auto', time = 'day', basemap = 'map', focus = null } = {}) {
  const els = plan.elements || [], B = els.filter(e => e.kind === 'building');
  const byUse = new Map();
  for (const e of B) { const u = USES[e.use] ? e.use : 'other', o = byUse.get(u) || { use: u, count: 0, floors: new Set(), forms: new Set(), units: 0 }; o.count++; o.floors.add(e.floors || USES[u].floors || 1); if (e.form) o.forms.add(e.form); o.units += e.units || 0; byUse.set(u, o); }
  const uses = [...byUse.values()].map(o => ({ use: o.use, label: USES[o.use].label, count: o.count, floors: [...o.floors].sort((a, b) => a - b), forms: [...o.forms], units: o.units || undefined }));
  const has = k => els.some(e => e.kind === k), n = k => els.filter(e => e.kind === k).length;
  return {
    address: String(address || '').slice(0, 120), acres: metrics?.acres != null ? +(+metrics.acres).toFixed(2) : undefined, uses,
    buildings: B.length, parking: metrics?.spaces != null ? Math.round(metrics.spaces) : undefined, phase2: B.some(e => e.phase === 2) || undefined,
    pond: has('pond') || undefined, pool: has('pool') || undefined, canopy: els.filter(e => e.kind === 'canopy').reduce((s, e) => s + (e.pumps || 0), 0) || undefined, truckCourt: has('truck') || undefined, foodTrucks: n('foodtruck') || undefined, garage: has('garage') || undefined, homes: n('lot') || undefined,
    trees: plan.params?.trees !== false, look, time, basemap: basemap === 'sat' ? 'satellite' : 'map',
    facts: (facts || []).slice(0, 6).map(s => String(s).slice(0, 200)),
    focus: focus ? (u => ({ name: buildingName(focus), use: u, floors: focus.floors || USES[u].floors || 1, label: USES[u].label }))(USES[focus.use] ? focus.use : 'other') : undefined
  };
}

const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const plural = (n, s, p = s + 's') => n + ' ' + (n === 1 ? s : p);
// the instruction to the image model: what the picture is, what must not change, and what to add
export function renderPrompt(brief = {}, view = 'front') {
  const V = byId(VIEWS, view), L = byId(LOOKS, brief.look), T = byId(TIMES, brief.time), uses = Array.isArray(brief.uses) ? brief.uses : [];
  const bld = uses.map(u => { const fl = (u.floors || []).map(f => f + (f === 1 ? '-storey' : '-storey')).join(' and '), form = (u.forms || []).includes('tower') ? ' (towers on a parking podium)' : (u.forms || []).includes('U') ? ' (courtyard buildings)' : (u.forms || []).includes('L') ? ' (L-shaped)' : '';
    return plural(u.count || 1, (fl ? fl + ' ' : '') + (u.label || 'building').toLowerCase() + ' building') + form + (u.units ? ', ' + u.units + ' units in all' : ''); });
  const F = V.hero && brief.focus && typeof brief.focus === 'object' ? brief.focus : V.hero ? { name: 'Building' } : null;
  const fDesc = F ? (F.floors ? F.floors + '-storey ' : '') + String(F.label || 'commercial').toLowerCase() + ' building' : '';
  const look = L.text ? 'Materials: ' + L.text + ', applied to every building.' : F && F.use ? 'Materials for ' + F.name + ': ' + (Object.hasOwn(USE_LOOK, F.use) ? USE_LOOK[F.use] : USE_LOOK.other) + '. The other buildings to suit their uses: ' + list(uses.map(u => USE_LOOK[u.use] || USE_LOOK.other)) + '.' : 'Materials by building type: ' + list(uses.map(u => USE_LOOK[u.use] || USE_LOOK.other)) + '.';
  const site = [brief.canopy ? 'a fuel canopy over ' + brief.canopy + ' pump islands with cars fueling' : '', brief.pond ? 'a detention pond with mown banks' : '', brief.pool ? 'a swimming pool' : '', brief.truckCourt ? 'a concrete truck court with trailers at the docks' : '', brief.foodTrucks ? plural(brief.foodTrucks, 'food truck') + ' parked on concrete pads along a service lane, serving windows toward the seating' : '', brief.garage ? 'a parking garage' : '', brief.homes ? plural(brief.homes, 'home lot') + ' along the streets' : ''].filter(Boolean);
  return [
    F ? 'Turn this 3D massing model of a proposed development into a photorealistic architectural hero photograph of one building: a close-up aerial of ' + F.name + ', the ' + fDesc + ' in the middle of the picture, seen from the street corner with its entrance side and one flank showing. The whole of ' + F.name + ' stays in the frame with its parking, walks and landscaping around it; the rest of the site continues around it and neighbouring buildings may run out of the frame. A level horizon, composed like the lead photograph of an architect\'s portfolio rather than a snapshot; ' + F.name + ' carries the most detail.'
      : 'Turn this 3D massing model of a proposed development into a photorealistic professional architectural marketing photograph' + (V.id === 'low' ? ', a low aerial from over the entry drive' : ', a wide drone aerial') + ': the whole site in the frame with its surroundings around it, a level horizon, nothing cropped at the edges, composed like a brochure cover rather than a snapshot.',
    'The geometry is the design and must not change: keep every building exactly where it stands, with the same footprint, shape, number of floors and height; keep every drive, parking row, pond, lawn and tree where it is; add nothing to the site that is not in the model and remove nothing from it. Keep the camera position, angle and framing exactly as in the model.',
    'The site: ' + (brief.acres ? brief.acres + ' acres' : 'a parcel') + (brief.address ? ' at ' + brief.address : '') + ' in the Houston, Texas region, ' + (bld.length ? 'with ' + list(bld) : 'with the buildings shown') + (brief.parking ? ' and about ' + brief.parking + ' parking spaces' : '') + (site.length ? ', plus ' + list(site) : '') + '.',
    look,
    'Make it indistinguishable from a real photograph: true materials with texture and weathering, windows with reflections and visible interiors, parapet caps, rooftop units, downspouts, signage bands, striped asphalt parking with curbs, concrete walks, mature live oaks and crepe myrtles where the model shows trees, irrigated lawn and shrub beds, parked cars and a few people. Physically correct lighting and shadows: ' + T.text + '.',
    brief.basemap === 'satellite' ? 'The ground around the site is real aerial imagery: keep the surrounding roads, lots and buildings as they are and render them photographically from this viewpoint.' : 'Beyond the site, replace the flat map graphics with believable suburban Houston surroundings seen from this viewpoint: the road along the front, neighbouring lots, trees and a flat horizon.',
    brief.facts?.length ? 'Context: ' + brief.facts.join(' ') : '',
    'No text, labels, watermarks, drawing lines or legend. No distortion of straight building edges; no fisheye or tilt.'
  ].filter(Boolean).join('\n');
}

// The GPT Image model to paint with: the preferred one (OPENAI_IMAGE_MODEL, else gpt-image-2.5-sunburst, the newest)
// when the key lists it; otherwise the newest GPT Image model the key lists, by version number (a named edition such
// as "-sunburst" counts, a mini or nano never does); and when the list can't be read, the preferred one anyway.
export const PREFERRED_IMAGE_MODEL = 'gpt-image-2.5-sunburst';
export function pickImageModel(models = [], preferred = '') {
  const want = preferred || PREFERRED_IMAGE_MODEL, ids = models.map(m => typeof m === 'string' ? m : m?.id).filter(Boolean);
  if (preferred || !ids.length || ids.includes(want)) return want;
  const ver = id => { const m = /^gpt-image-(\d+(?:\.\d+)?)(?:-(?!mini|nano)[a-z]+)?$/.exec(id); return m ? parseFloat(m[1]) + (/-[a-z]+$/.test(id) ? 0.01 : 0) : null; }; // a named edition edges out the plain one of its version
  const best = ids.filter(id => ver(id) != null).sort((a, b) => ver(b) - ver(a))[0];
  return best || want;
}
