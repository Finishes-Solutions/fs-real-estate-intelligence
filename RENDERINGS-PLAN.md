# Plan: photorealistic 3D renderings from a site plan

Status: proposal, October 18, 2026. Phase A's capture and Phase B1's AI renderings shipped in a first form the same day (the **Render** section on an open plan); the rest of this document is the road ahead.

## What we have to build on

- A site plan is a list of rectangles in feet (building, parking, drive, pond, lawn, pool, trees, lot lines) with a use, floors, floor height and, for buildings, a shape (bar, L, courtyard, tower on a podium). Everything a 3D model needs is already in the data: footprint, height, use, roof type, paving and landscape.
- The map already draws the plan in 3D (MapLibre fill-extrusion: buildings with parapets and floor lines, podiums, 3D trees). It is a massing model, not a rendering: flat colours, no windows, no materials. Today the plan forces the camera to look straight down whenever a plan is open, so users never see this 3D view unless they tilt by hand.
- The plan is already turned into a picture for the AI: the SVG sheet drawing is rasterised to a JPEG and sent to the model with the numbers. The same path works for a 3D capture.
- Satellite imagery for the site (MapTiler hybrid, Google, Esri, dated NAIP and Wayback) is on hand, so a rendering can be placed in its real surroundings.
- Server: Vercel functions (up to 300 s on the site plan endpoint), headless Chromium for the PDF sheet, OpenAI through the Responses API with usage and cost recorded per feature. Projects sync through Supabase; local saves already hit the browser's storage limit, so images cannot live in the project record.

## What "photorealistic" can honestly mean here

There are three ways to get there. They are not the same product.

| Approach | What it gives | Geometric truth | Effort | Cost per view |
|---|---|---|---|---|
| A. Better massing view on the map | A clean 3D aerial of the plan with ground, trees and context | Exact | Small | None |
| B. AI image generation, conditioned on the massing | A photoreal-looking still per view, in the real surroundings | Approximate: counts, heights and placement mostly hold; windows, materials, cars and people are invented | Medium | Roughly $0.05 to $0.30 |
| C. Real-time 3D engine (three.js) with procedural facades and materials | A walkable, consistent model and fly-through video | Exact | Large (months) | None after build |

Recommendation: ship A, then B. B is what people mean by "photorealistic rendering" today, and it is weeks of work rather than months. C is only worth it if clients start asking for walkthroughs; AI stills will beat it on looks for a long time.

Be clear with users from day one: a B render is a **concept illustration**. Two renders of the same plan will differ. It must never be read as a design, and the sheet and the image itself should say so.

## Phase A: 3D view and aerial capture (1 to 2 weeks)

Goal: a "3D" button on an open plan that shows the plan as a massing model and saves a picture of it.

1. **3D view mode on the plan.** Allow pitch while a plan is open (the two places that force pitch to zero only fire when the user picks the plan view). Three camera presets: aerial from the street corner, bird's-eye from the back, street-level at the main entry. Each is computed from the site ring, the front edge and the tallest building, so the whole site is in frame.
2. **Richer massing.** Ground plane for the paving and lawn (already drawn), roof colour by use, a simple cornice band, trees (already there). Hide labels and the setback lines in 3D mode. Keep the satellite base map under it so the context is real.
3. **Capture.** The map canvas needs `preserveDrawingBuffer` or a redraw-then-read on the render event. Save a 2000 px PNG. Attach it to the option as a view, show it on the project page and add an "Aerial massing view" panel to the Site Plan PDF sheet.
4. **Storage.** Images go to a new Supabase Storage bucket, with only the URL in the project record. Device-only projects keep a small thumbnail locally and lose the full image, and say so.

Tests: the camera presets from a few real rings (the merged multi-parcel sites and odd shapes in the existing fixtures), and the sheet layout with and without a view. Look at a real site before pushing, as the repo rules require.

## Phase B: AI renderings (3 to 5 weeks after A)

Goal: **Render** on an open plan produces two to four photoreal views of the option, in context, in about a minute.

### How a render is made

1. The browser captures the massing view for each preset camera (Phase A) and, with the same camera, the satellite base map alone, so the model gets both the geometry and the surroundings.
2. The browser sends both pictures plus a structured brief to a new `api/render` endpoint: the program (uses, stories, unit counts), the building shape, a materials pick, the time of day, and the site facts the plan already gathers (Houston region, road names, what is nearby).
3. The server writes the prompt from the brief and calls the image model in edit mode with the massing capture as the input image and a fixed instruction set: keep every building where it is and at its height, keep the drives and parking, add materials, windows, landscaping, cars, sky; nothing new on the site.
4. The result is stored in the bucket, recorded in AI usage under a new "Renderings" feature with its cost, and returned with the massing capture alongside so the user can check it.

### Model choice

- OpenAI is the only provider wired in, and the latest image model is GPT Image 2, which supports editing from an input image through the Images API ([OpenRouter listing](https://openrouter.ai/openai/gpt-image-2)). Its per-image cost for edits is not published in a form I could verify, so budget from a test run before setting prices in Settings. The model picker already excludes image models, so the render model is chosen on the server, not by the user.
- Image-edit models follow the input picture loosely. Expect them to merge or add buildings on dense plans and to change stories on tall ones. The product has to show the massing capture next to the render so the user can reject a bad one, and offer **Render again**.
- If fidelity is not good enough, Phase B2 switches to a depth- or edge-conditioned model (ControlNet-style, offered by Stability and Black Forest Labs through hosted APIs). Depth maps are the standard way architects keep AI renders on the massing ([Studio Matrx guide](https://www.studiomatrx.org/students/ai-ml-for-architects/img2img-controlnet-architecture)). The map's 3D view cannot give a depth map, so B2 needs a small server-side three.js scene rendered in the headless Chromium we already run for PDFs. That scene is also the starting point for Phase C if we ever go there.

### Product

- **Render** button beside the Site Plan PDF export. Picks: views (the three presets, any combination), look (brick, stucco, metal panel, glass and brick, "let the AI choose"), time (day, dusk). Shows progress like a build, one at a time, with Cancel.
- Results land in a **Renderings** section of the option: thumbnails, the massing view on hover or tap, Download, Delete, Render again. The project page shows the latest one per option.
- The PDF sheet gets a second page with the renders, each captioned "AI concept illustration of Layout 2, not a design".
- Settings › AI model › Usage gets the Renderings row and a price field for the image model.
- Renders are kept per option; a change to the plan marks them "plan changed since this was rendered" rather than deleting them.

### Guardrails

- Rate limit per team per day and a cost cap in Settings, since one click can cost a dollar.
- No render for a plan that fails the checks (overlaps, outside the lot), since the picture would show something that cannot be built.
- Image inputs stay under the request size limit (the existing 600 KB cap on pictures sent to the AI).
- Vercel: the render endpoint needs a 300 s limit and should do one view per request, with the browser running the views in sequence.

### Tests and docs

- Unit tests for the prompt builder (program and facts in, prompt out) and the camera presets, with the realistic fixtures.
- An endpoint test with the OpenAI call stubbed, as the existing site plan tests do.
- Product doc: new "Renderings" part under Projects and site plans, in plain words, with the concept-illustration caveat. Changelog entry per push.

## Phase C: real-time 3D and fly-through (later, only on demand)

A three.js scene built from the plan: procedural facades by use (storefronts for retail, balconies for apartments, dock doors for industrial), materials, trees, cars, a sun. It gives a consistent walkthrough and, with the Remotion tooling already available, a fly-through video. Estimate two to three months for a result clients would show. Do not start it before B has been used for a while and people ask for motion or walkthroughs.

## Open questions for the team

1. Who is the audience for the renders: internal feasibility, or client-facing decks? Client-facing raises the bar on fidelity and pushes toward B2 sooner.
2. Is an OpenAI-only path acceptable for images, or should the render endpoint be built provider-neutral from the start (small extra effort, recommended)?
3. Budget: a cap per render and per month.
4. Which sheet sizes get the render page: 11 × 17 only, or 24 × 36 too?

## Order of work

1. Phase A: 3D view, presets, capture, bucket, sheet panel.
2. Phase B1: render endpoint with the image-edit model, UI, usage, PDF page, docs.
3. Evaluate fidelity on ten real plans (shops with pads, garden apartments, a warehouse, a subdivision).
4. Phase B2 only if step 3 shows buildings drifting: headless three.js depth pass and a conditioned model.
