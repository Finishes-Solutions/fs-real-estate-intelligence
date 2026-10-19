# Plan: a three.js massing scene built from the site plan

Status: proposal, October 19, 2026. Builds on `RENDERINGS-PLAN.md` (the renderings shipped Oct 18) and replaces its "proper massing" paragraph with a concrete design. Nothing here is built yet.

## Why

The renderings now hold their framing, but the picture the AI paints from is thin: flat colours, no sun, no shadows, no roof or facade detail, and the AI gets only that one flat picture. It guesses depth and invents detail. A real scene fixes three things at once:

1. **A better input picture** for the current GPT Image path (sun, shadows, materials, textured ground, trees, surroundings), so the AI has less to invent and keeps what is there.
2. **Depth and edge images** of the exact same view, which is what a depth-conditioned image model needs to keep every building where it is. That is the real fix for geometry drift.
3. **A 3D view people can use**: a toggle on the plan to see the option as a model on the real map, and later a fly-through.

The user flow does not change. Open an option, pick a view and materials, press Render. The scene replaces what the capture step photographs; the prompt, budget, storage, gallery, viewer and PDF pages stay as they are.

## What exists to build on

| Piece | Where | Reuse |
|---|---|---|
| Plan data: footprints in feet, rotation, floors, floor height per use, building form (bar, L, U, tower on podium), hand-drawn polygons, drive paths, parking rows, pond, pool, courts, lots, keep-outs | `lib/siteplan.mjs` | The scene is built straight from this; no new data entry |
| 3D features already derived from the plan: building parts (base, tower, parapet, floor lines), trees as trunk, crown and top rings with heights, paving union with curbs, stall stripes, walks, lot lines | `planFeatures` in `lib/siteplan.mjs`, drawn by MapLibre fill-extrusion in `src/siteplan.js` | Same geometry, now as meshes |
| Custom WebGL layers on the map with MapLibre's own projection maths (flat and globe) | `src/planes3d.js`, `src/flightpath3d.js` | The pattern for putting a scene into the map's camera |
| Camera presets, the parcel fit loop, the hero close-up, the capture and crop | `lib/render.mjs`, `captureView` and `fitSiteInFrame` in `src/siteplan.js` | Unchanged; they drive the scene's camera |
| Satellite imagery (MapTiler hybrid, Google, Esri, NAIP, Wayback) and a same-origin tile proxy | base maps in `src/app.js`, `api/imagery.js` | The ground under the model, and the surroundings |
| Building footprints of the neighbourhood from the map's vector tiles | `lib/footprint.mjs` and the building layers | Context massing around the site (drawn as-is, never selected by feature id) |
| Headless Chromium on the server | `api/pdf.js` | Server-side stills later (PDF, batch), not needed for phase 1 |
| Render endpoint, budget, usage, storage, gallery, viewer, PDF pages | `api/render.js`, `lib/aiusage.mjs`, `src/siteplan.js` | Unchanged apart from accepting extra images |

## Design decision: a three.js scene inside a MapLibre custom layer

Two ways to host the scene were weighed.

- **A separate three.js canvas** (its own camera, its own ground). Clean, but the ground, roads and neighbours have to be rebuilt from tiles, and the camera has to be re-derived from the presets.
- **A MapLibre custom layer** (`renderingMode: '3d'`) that renders a three.js scene in the map's own WebGL context, with the map's projection matrix. The satellite base map is the ground for free, the surroundings are already there, the existing camera presets and fit loop work untouched, and the existing canvas capture already photographs it.

The custom layer wins. It is exactly how the planes are drawn today, and three.js has a documented path for it (set the camera's projection matrix from the map's matrix each frame, keep the scene in Mercator metres, `renderer.resetState()` after drawing). The raw-WebGL route the planes use is right for a few hundred instanced aircraft; a lit scene with shadows, textures, several materials and offscreen depth passes is what three.js is for. It is one new dependency (about 650 KB, loaded only when the 3D view or a render is first used, from the same kind of CDN the map library already comes from).

Limits to accept up front: MapLibre's camera is capped at 70° pitch and zoom 19, so street-level eye height is not reachable through the map camera. The "Low, at the entry" view stays a low aerial. True eye-level shots are a phase 3 item (a detached camera for stills only).

## The scene, piece by piece

All geometry is generated from the plan at render time and cached per option until the plan's signature changes (the same `planSig` the renderings use).

**Ground.** The map's own basemap, with a transparent shadow-catching plane over the parcel so building and tree shadows fall on the real imagery. Inside the parcel, the plan's surfaces sit a few centimetres above the ground so they draw over the imagery: paving as one slab from the existing paving union with a curb lip, an asphalt texture and the stall stripes as a thin white mesh; walks in concrete; lawns in a grass texture; the pond as a reflective water material; pool, courts, plaza, patio and trash enclosure with their own simple materials; keep-outs left as ground.

**Buildings.** From each building's outline (the same `outline`, `towerOutline` and podium logic the map uses now):

- walls extruded to floor count × floor height for the use, with a parapet band and a cornice line, and a lighter roof slab with a few rooftop units placed on a grid;
- a window band per floor as a darker glazed strip, and for ground-floor retail, restaurant, medical and office a taller storefront band on the side that faces its parking (the plan knows which side faces the drive aisle);
- entry canopies at the storefront side for commercial uses; dock doors along the truck court side for industrial; balconies as shallow boxes for multifamily;
- pitched roofs for single-family homes, townhomes and duplexes (a simple hip at the use's pitch), flat roofs for everything else;
- Phase 2 buildings lighter and semi-transparent, as on the map today;
- materials by look: the five looks in `lib/render.mjs` map to wall, base and trim colours and roughness. These are massing materials, not photoreal textures. The AI still paints the final materials; the scene only has to make the form, the depth and the light unmistakable.

**Trees.** The plan already gives trunk and crown rings with heights. Draw each as a low-poly trunk and a crown (two or three stacked spheres with slight random scale and tilt from the tree's position, so rows do not look stamped). Live oaks by default; crepe myrtles at entries.

**Cars and people.** Not in phase 1. A few parked car boxes in stalls help the AI with scale and are cheap to add in phase 2; people never.

**Context.** Neighbouring building footprints from the map's building tiles, extruded to their tile height where there is one, otherwise 4 m, in a neutral grey, with the satellite ground under them. Drawn as given, never merged or selected by feature id (the Oct 4 lesson in CLAUDE.md).

**Sun and sky.** The sun's position computed from the site's latitude and longitude and the picked light (midday, late afternoon, dusk) for the current date, a directional light with a shadow map covering the parcel, a hemisphere light for the sky, and MapLibre's sky for the horizon on the low view. Dusk adds warm point lights at entries and parking lot poles.

## What the capture sends

The capture step gains two offscreen passes drawn with the same camera and size as the colour picture:

- **Depth**: linear depth normalised across the frame, near white and far black, as a PNG. Rendered from the three.js scene plus a ground plane, so the surroundings have depth too.
- **Edges**: building and paving outlines as thin black lines on white (edge geometry of the meshes, plus the parcel's paving edges), as a PNG.

The request to the render endpoint becomes `{ image, depth, edges, brief, view }`. The endpoint keeps working with `image` alone, so the two paths can run side by side.

## Which model paints

- **GPT Image 2.5 Sunburst** (today's path) takes the colour picture only. With the new scene it gets a much better picture, which should already cut drift. Keep it as the default until the comparison below says otherwise.
- **A depth-conditioned model** takes the colour picture plus depth or edges and holds the geometry. The candidates are Stability's control endpoints (structure and sketch) and Black Forest Labs' Flux depth and canny models, either direct or through a hosting API. Names and prices change quickly and I could not verify them from this environment; the endpoint gets a small adapter per provider (`lib/renderers/*.mjs`), picked by a setting, so a provider can be swapped without touching the rest. Each adapter reports its usage so the monthly budget keeps working (per-image pricing where the provider bills per image).
- **A/B run**: ten real options (shops with pads, garden apartments, a warehouse with a truck court, a subdivision, storage, a hotel), each rendered by both paths from the same capture, judged on building count, placement, heights and roof shapes against the massing. That decides the default.

## The 3D view for people

A **3D** button on the plan tool bar. On: the fill-extrusion layers hide and the scene draws in their place; the map keeps its tilt and turn; Edit Layout still works on the 2D pieces underneath, and the scene rebuilds when the plan's signature changes (debounced, so dragging stays smooth). Off: back to the drawing as it is today. The render capture turns the scene on by itself and restores the user's choice afterwards. Trees, Phase 2 and the development mix colouring keep working in 3D.

## Phases and effort

| Phase | What | Effort | Done when |
|---|---|---|---|
| 1. Scene | three.js custom layer, ground surfaces, buildings with roofs and bands, trees, sun and shadows, the 3D toggle, the capture using it | 2 to 3 weeks | A render of the Waller option from the new scene, side by side with today's, looks like a lit model and the AI keeps every building |
| 2. Depth path | Depth and edge passes, the endpoint accepting them, one provider adapter, the Settings switch, the A/B run | 1 to 2 weeks after phase 1 | The A/B run on ten options, with a written verdict and the default set |
| 3. Detail and motion | Parked cars, context facade hints, eye-level stills from a detached camera, server-side stills for the PDF, a fly-through along a camera path exported as video | 2 to 4 weeks, as asked for | Decided after phase 2 |

## Tests and checks

- Pure geometry (`lib/massing.mjs`, no DOM): outlines to wall, roof, parapet, band and canopy meshes; pitched roofs; podium towers; tree placement; sun position for a date, time and place. Tested in Node with the realistic fixtures the site plan tests already use (merged multi-building parcels, odd shapes, hand-drawn polygons).
- The map side (`src/massing3d.js`): checked in headless Chromium with the same probe used for the camera fit, now with the scene drawn, screenshots at the four presets and the close-up, before every push (CLAUDE.md asks for a real map look on map changes).
- The depth and edge images: a unit test that a known scene gives a monotonic depth ramp and that the edge image is white away from the buildings.
- Product doc and changelog with every push, as always.

## Risks, honestly

- **Performance on laptops and phones**: shadows and a few hundred trees are fine on a desktop GPU; on a phone the scene should drop shadows and tree detail. Decide by a frame-time check at start.
- **Two cameras must agree**: the depth image is only useful if it matches the colour picture pixel for pixel. Rendering both from the map's projection matrix in the same frame makes this exact; a detached camera (phase 3) must reproduce it, which is where bugs will hide.
- **Depth-conditioned models are less photoreal than GPT Image** in general. The A/B run may show that the better colour picture alone is enough, in which case phase 2 is small and the depth model stays an option for dense plans only.
- **Facade detail is a style choice**: too much modelled detail and the AI copies boxy windows; too little and it invents. Start with bands and canopies only and tune against renders, not against how the model looks in the 3D view.
- **Provider churn**: the image model landscape changes monthly. Keep every provider behind an adapter and never let a provider's name leak into the UI beyond the viewer caption.

## Open questions

1. Is a 3D view on the map for people worth the toggle, or should the scene stay a render-time tool only? The toggle is cheap once the scene exists, so I plan to ship it, but it is a product call.
2. Which second provider to try first for the depth path: Stability or Black Forest Labs. Whoever can bill per image to a company account is the practical answer; both need an account and key.
3. Do we want eye-level shots badly enough to justify the detached camera in phase 3?
