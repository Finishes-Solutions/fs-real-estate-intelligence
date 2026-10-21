BASE: b1b1f11ff8f7be5695fab97c3112355bf0d6c7e9

# Phase 5 spec: split detention, the low side, trails and sidewalks

Plan sections: NEIGHBORHOOD-PLAN.md "Detention, trails and sidewalks (phase 5)", "Change With AI keeps up", "Tests and
checks", Decided 2 (sidewalks one or both sides, both by default) and 5 (low side by hand until elevation data). Repo rules
(CLAUDE.md): CHANGELOG entry at the top (US Central time, title, hashes, plain bullets), PRODUCTDOC section + "Recently
added", `npm test`, realistic-data tests, a look at a real map (render the PDF sheet / planSVG with puppeteer as in
scratchpad/build/render.mjs). Code style: dense one-line functions, terse British-flavoured comments, no new dependencies.

Four work packages. Suggested order: **A first** (shared core in lib/siteplan.mjs and lib/rulesheet.mjs: everything else
reads it), then **B** (engines) and **C** (edits, AI, editor, pro forma, sheet) in parallel, **D** (tests, numbers, docs)
last. B and C both touch lib/sitelayout.mjs (C only the `refit` relink and the post-pass call sites), merge with care.

Ground rule for "today's layouts must not get worse": **with no low-side hint and default settings, every engine places
its ponds exactly where it does today** (same reserve bands, same pieces, same order). What changes without a hint:
neighbourhood ponds default to natural curves (straight-street layouts only: the subdivision and pod ponds are curved
already), ponds get a trail round them on single-family plans too, a shortfall is topped up with more ponds in open space,
sidewalks are drawn and counted, a note says the low side wasn't given. Homes / units / floor area / parking must not move
on any fixture (pond acres may only go up). Compare before/after (section D2).

---------------------------------------------------------------------------------------------------------------------

## 0. What exists (read before building)

- **Storm sizing** (lib/siteplan.mjs ~2394–2421): `STORM = { mode, rate: WALLER.values.detention.v (0.55), depth: 5 }`.
  `stormNeed(acres, params, prog, siteAc)` merges `params.code.storm` (the rule sheet's rate: lib/rulesheet.mjs
  `codeParams` → `storm: { rate }`, the "local rate" with Waller's as fallback), `params.storm`, `prog.storm`; returns
  `{ mode, volume (ac-ft), area (sf of pond: volume·43560/depth·1.2) }`. `stormOf(plan)` adds `{ acres, pond, vault }`
  (vault = ac-ft short, priced by the pro forma at `vaultPerAcFt`). A pond's storage is therefore
  `area / 1.2 · depth / 43560` ac-ft.
- **Where ponds come from today:**
  - Straight layouts (lib/sitelayout.mjs): `layoutCore` (~1430) loops `pondAt of ['back','front','end']` (~1462);
    `attempt` (~832) calls `reserveBand(F, o.pond*1.2, o.pondAt, o.winX)` (~821: a band at the back, front, or the "end"
    = the high side of the other axis); `finishLand` (~673) carves at most **two** ponds from `openLand` pieces (pieces in
    the reserve first, then by area), shape by `PAR.style.ponds` (default `'square'`, PARAMS ~34); a trail ring only when
    `spec.trail` (`attempt` ~870: multifamily, townhomes or mixed: **never sfr/duplex**), `width: 6`.
  - Subdivisions (lib/streetnet.mjs): `context()` (~167) `need`; `skeletons()` (~204) uses `reserveBack(F, need·1.02)`
    (~178: a band across the back, frame y) for ring/spine/courts; `coreSkel` (~259) a lake in the middle (`res: []`,
    whole site `back0`); `finishNet` (~855–866) makes `pondOf(r)` ponds on `net.res` and the core lake, each with a
    6 ft ring trail (`grow(q, 9)` / `grow(q, 14)`), then `landOf` (finishLand) for the leftover need; note "Detention
    holds about N% … plan on underground storage for the rest" (~888); score part `detention` (~908).
  - Pods (lib/sitepods.mjs): `allocate` (~276–317) gives the commons lake the whole `need`, or a pond pod "at the back"
    (`fy(b) - fy(a)`, ~314); `pondPod` (~371) pond + 6 ft ring; `finishPods` (~437–441) tops a shortfall up with
    `pondIn(g, els)` (~449: a rounded blob in an 'Open space' green, 12 ft in, 20 ft clear of solids) + ring; greenbelts
    with 8 ft trails down them (~139–149, `belt: true`).
- **Sidewalks today:** only words. `codeParams` gives `code.sidewalk = { sides, w }` (Waller: both, 5 ft, unsure).
  `codeRules` (streetnet ~1086) warns when a right-of-way can't hold pavement + walks. src/siteplan.js `walkLine` (~2470)
  prints "Not drawn or counted in paved area yet."
- **Streets in a plan:** `netOfPlan` (streetnet ~1010): drives with `e.net` or a note `Street · ` / `Collector · ` along a
  path; bulbs (`e.bulb`), roundabouts (`isRing`), entrances (`isEntrance` + `routeOf`). Straight sfr streets are
  **rectangles** with note `Street · 28 ft` (sitelayout ~184) and connectors `NN ft drive` (`e.con`); lots start
  `sfrRules().park = max(11, (row-pave)/2)` ft off the pavement (~453). Subdivision lots start at `row/2` from the centre
  line (`marchLots` `h = s.row/2`); the drive element stores only `width` (pavement); `row` = width + (R.row − R.pave)
  of its type (as `codeRules` `rowOf`). Pods collectors: note `Collector · 36 ft`, `skel`, `coll`.
- **Derived drawing:** `details(plan)` (siteplan ~2593, memoised by `lastOf` = JSON of the plan) gives building walks,
  trees, islands; `planFeatures` (~2684) draws them (`k: 'walk'`); sitesheet `planSVG` (~30) and `toDXF` read `details`.
- **Numbers:** src/siteplan.js ~2492 (tiles; Detention tile ~2502; `walkLine`); sheet `sheetData` (sitesheet ~161).
- **Edits:** lib/siteedit.mjs `describePlan` (~26: skips trails), `applyEdits` (~116: returns extra fields the caller
  applies, e.g. `streetNames`, `recipe`, `zones`), `guessEdits` (~436). api/siteplan.js `EDIT_SCHEMA` (~349, strict:
  every property in `required`, tested in test/siteplan.mjs ~207), `EDIT_SYSTEM` (~380). src `aiChange` (~2990).
- **Editor:** Site section `siteHtml` (~1931, grid of `b(id, icon, label, tip, pressed)` buttons, modes set in
  `ed.mode`, map click dispatch ~1010), `paramsHtml` (~1955: Look › "Ponds and pools" default from PARAMS), `stormHtml`
  (~2123), map layers (~589–630: `fs-sp-fill`, `fs-sp-walk`…), worker gets the whole plan (`laid('options', {...pl})`).
- **Pro forma** (lib/proforma.mjs ~117–124): `site = lots·lotCost + … + stalls·stallCost + storm`; defaults ~70.

---------------------------------------------------------------------------------------------------------------------

## 1. Data model

```
plan.low = {                       // the low side: where the site drains (a site fact, like plan.front / plan.streets)
  hand: { at: [x, y], how: 'map' | 'words', words: 'south-east corner' | null, t: iso } | null,
  elev: { at: [x, y], src: string, t: iso } | null      // filled later from elevation data; never overwrites hand
}
program.low = 'south-east' | 'north' | … | 'front' | 'back' | 'left' | 'right' | null   // said in Build's words
plan.params.walks = { local: 'both'|'one'|'none', collector: 'both'|'one'|'none', w: 3..10 }   // unset: rule sheet, else both/both/5
plan.params.trails = { w: 6..10 }                                                             // unset: 8
drive element: walks?: 'both'|'one'|'none'          // a street's own override (set on every drive of its chain)
pond element: low?: true (the pond at the low side), linear?: true (aspect > 3), share is never stored (computed)
trail element: of?: pond id (its ring), link?: true (a link made by the trail pass), belt?: true (down a greenbelt)
```

`lowOf(plan)` precedence: `plan.low.hand.at` → `program.low` words resolved on the ring → `plan.low.elev.at` → null.
Words in Build go to `program.low` and the editor also writes `plan.low.hand = { how: 'words', words, at }` when a layout
is built from them (so the Site section shows it and a later click replaces it). Nothing else stores derived geometry:
sidewalks, outfalls and shares are worked out from the pieces every time (as `details`).

---------------------------------------------------------------------------------------------------------------------

## A. Core (lib/rulesheet.mjs, lib/siteplan.mjs)

### A1. Street rules move to lib/rulesheet.mjs (no behaviour change)
Move `STREET_RULES`, `num`, `street0`, `streetRules` from lib/streetnet.mjs (lines 23–29) into lib/rulesheet.mjs (still
pure, no imports) and re-export from streetnet: `export { STREET_RULES, streetRules } from './rulesheet.mjs';` (keep the
local names inside streetnet via import). Needed so siteplan.mjs can read right-of-way margins without importing
streetnet (siteplan ← streetnet would be a cycle). Run test/streetnet.mjs + test/rulesheet.mjs unchanged.

### A2. The low side (siteplan.mjs, new section "---------- the low side ----------" near storm)
- `export const LOW_WORDS = ['north','south','east','west','north-east','north-west','south-east','south-west','front','back','left','right']`.
- `export function lowWords(t)`: the direction in words → one of LOW_WORDS or null. Accepts "south-east", "southeast",
  "SE", "the back", "the rear" (→ back), "the street side" (→ front). Used by guessProgram, guessEdits and the API.
- `export function lowAt(plan, w)`: a point on the ring for a direction: compass d (plan feet: x east, y north; diagonals
  normalised); front/back = −/+ the front edge's inward normal (`outwardOf(ring, front)`); left/right as seen from the
  street (sheet frame). The ring point(s) of greatest `dot(p, d)`: for a diagonal, the vertex; for a side, the midpoint of
  the run of ring within 2% of the greatest projection (so "the south side" of a square is its middle, not a corner).
- `export function lowOf(plan)` → `{ at, from: 'hand'|'words'|'elev', words }` or null (precedence §1). Pure, cheap.
- `export const lowName = (plan, lo) =>` "the south-east corner" / "the back" / "the point set on the map" (for notes).

### A3. Ponds' shares and outfalls (siteplan.mjs)
- `export function pondsOf(plan)` → `[{ id, name, sf, acft, share, low, linear }]`, ponds sorted nearest the low side
  first (else biggest first). `acft = sf / 1.2 · depth / 43560` with `depth` from `stormNeed`'s merged storm settings
  (expose `stormSettings(params, prog)` returning the merged `st` so both use one place); `share = acft / need volume`
  (0 when none needed). Retention mode: the same formula (the live storage above the pool).
- `stormOf(plan)` gains `held` (Σ acft), `ponds: pondsOf(plan)`, `short` (ac-ft short, ≥ 0), `low: lowOf(plan)`.
- `export function outfalls(plan)`: only with `lowOf(plan)`. Chain the ponds toward the low point: each pond's outfall
  runs from its outline point nearest the next pond that is nearer the low point (or the low point itself for the
  nearest pond) to that pond's nearest outline point / the low point. `[{ from: id, to: id | null, line: [[x,y],[x,y]] }]`.
  Straight segments (a sketch: pipes or swales). Add to `detailsOf`: `outfalls`, and `low: lowOf(plan)?.at`.

### A4. Sidewalks (siteplan.mjs, new section "---------- sidewalks ----------"; derived, nothing stored)
- `export function walkRules(plan)` → `{ local, collector, w }`: `plan.params.walks` over the rule sheet
  (`params.code.sidewalk`: `sides` for local, `w`) over `{ local: 'both', collector: 'both', w: 5 }`. Collector defaults
  to 'both' even when the sheet says one (the decided default: "local streets one side, collectors both" is the usual
  one-side setting).
- `streetsForWalks(plan)` → `[{ id, path, closed, pave, m (the strip between pavement and lot line: (row−pave)/2), type:
  'local'|'collector', walks (the drive's own override) }]` from:
  1. drives along paths that are streets (`e.net` or note `^(Street|Collector) · `), not bulbs, not `isRing`, not
     `isLoop`, not `closed`: path `fillet(e.path, e.r ?? 0)` densified; type collector when `e.coll` or note
     `Collector`; `m` from `streetRules(plan)` (`(R.local.row − R.local.pave)/2`, collector likewise);
  2. straight-street rectangles with note `^Street · `: the long axis through the rectangle (`corners` → mid-points of
     the short sides), `m = max(11, (R.local.row − R.local.pave)/2)` (sitelayout `sfrRules().park`);
  3. connectors in a homes plan (note `^\d+ ft drive$`, width ≥ 24, both ends within 3 ft of a `Street · ` rectangle,
     and the plan has sfr/duplex/townhome buildings): as 1, type local, `m = 11`;
  4. bulbs (`e.bulb`): a closed circle path at the bulb's radius, `m = R.bulbRow − R.bulbR`, type local;
  5. entrances in a plan that has any of 1–4 (`isEntrance`, `routeOf(e, ring)`): type collector, `m = 10`, both sides,
     stopping 15 ft short of the lot line (the walk along the public street isn't ours).
  Parking aisles, private lanes, service drives, drive-thrus, truck courts: never.
- `export const sidewalks = lastOfEls(walksOf)`: memo keyed by the `plan.elements` array identity plus
  `JSON.stringify([plan.params?.walks, plan.params?.code?.sidewalk, plan.params?.streetRules, plan.ring?.length])` in a
  WeakMap (metrics runs often; JSON of a 1,000-home plan each time is too slow). `walksOf(plan)` →
  `{ strips: [{ id, side, path, w, poly }], ft, sf, tight: [ids], none: bool }`:
  - for each street and each side wanted (`walks` override → its type's setting; 'one' = the side with more lot
    frontage: count samples whose point `o + w + 15` ft out falls inside a lot; tie → left of its way), the centre
    offset `o = pave/2 + max(1, m − 1 − w) + w/2` (the walk's back 1 ft inside the right-of-way line; `m < w + 2`: right
    behind the curb `o = pave/2 + 0.5 + w/2`, street id into `tight`);
  - the offset path (move streetnet's `offsetPath` (~70) into siteplan as `export function offsetPath`; streetnet
    re-exports it: `export { offsetPath } from './siteplan.mjs'`, same results) sampled every 4 ft; a sample is kept when it's inside the
    site ring ≥ 1 ft from the lot line and not within `w/2 + 0.5` ft of a blocker: lots (`kind 'lot'`, their polygons),
    buildings, garages, ponds, pools, courts, play, parking, truck, canopy, tanks, foodtruck, keepout, signs and **any
    other drive's pavement** (so walks stop at the curb of a cross street: the crosswalk). Driveways (`plaza` note
    `Driveway`) and the walk's own street are not blockers (a walk crosses driveways). Blockers through one
    `gridIndex` (cell 150) built once per call;
  - runs of kept samples ≥ 20 ft become strips: `poly = outline({ kind: 'trail', path: run, width: w, r: 0 })`.
  - `ft` = Σ run lengths, `sf = ft · w`.
- `metrics(plan, o = {})`: unless `o.walks === false`, `const W = sidewalks(plan)`; return `walkFt: W.ft, walkSf: W.sf`,
  `trailFt` (Σ trail path lengths, closed ones round), `trailSf` (Σ trail `elArea`); `paved += walkSf` (so impervious
  and open space count it). Engine calls in hot loops (sitelayout `score`/`enough`/`wider`/`withEntrances` `val`,
  sitepods `planScore`, `podsOptions` ~656, `relayPods` ~521) pass `{ walks: false }` (walk area never decides a
  layout). Proforma, Numbers, sheet, describePlan use the default.
- `planFeatures`: after `d.walks`, `for (const s of sidewalks(plan).strips) feats.push({ properties: { k: 'swalk' }, … })`;
  for outfalls `k: 'outfall'` LineStrings; the low point `k: 'low'` Point (with `t: 'Low side'`).
- `toDXF`: strips on layer `WALK`; outfalls on a new layer `['OUTFALL', 5]`; a `TEXT` "LOW SIDE" at the low point.
- `check` (`checkPlan`): two warnings (level `warn`, id of the trail): "A trail crosses Lot 12" / "… crosses Apt Bldg 3"
  when a trail's outline (`grow(outline, −0.5)`) overlaps a lot, building, pond, pool, court or parking (grid index; a
  ring trail round a pond overlapping *that* pond is a bug, not exempt). Detention: no new check (notes and Numbers say it).

### A5. Pond style default (siteplan.mjs)
`export const pondStyle = (params, prog) => params?.style?.ponds || (usesOf(prog).some(u => ['sfr', 'duplex', 'townhomes'].includes(u)) ? 'organic' : 'square')`. The editor's Look › "Ponds and pools" shows `pondStyle(pl.params, prog)` as its value; setting it stores `params.style.ponds` as today.

---------------------------------------------------------------------------------------------------------------------

## B. Engines (lib/sitelayout.mjs, lib/streetnet.mjs, lib/sitepods.mjs, new lib/detention.mjs, new lib/trails.mjs)

New modules import `./siteplan.mjs` (and `./vendor/polyclip.mjs` when needed), are pure, and go in build.mjs's lib list
(line 39) and src/sw.js FILES (line 6).

### B1. lib/detention.mjs: carving ponds into open land
- Move `pondIn` and `hull` from sitepods (~449–464) here, exported, with a size cap: `pondIn(g, els, want = Infinity)`
  (stop growing the blob/rectangle once its area reaches `want · 1.05`; the existing ladder of rectangles already gives a
  size order). sitepods imports it from here (same behaviour when `want` is omitted).
- `export function detain(plan, els, o = {})` → `{ els, notes, added }`: the shortfall top-up, used by the post-pass
  (B5) and by edits:
  - `need = stormNeed(...)` as `stormOf` sizes it (developed acres: reuse `stormOf({ ...plan, elements: els })`).
    Nothing when `need.area ≤ 0`, mode underground / none, or ponds hold ≥ 95%.
  - candidates: greens not pinned, not future (`e.future`), not parks with amenities, not medians, not islands: named
    'Open space', unnamed lawns ≥ 0.5 ac, greenbelts (`belt`), 'Community park' only when nothing else. Ordered nearest
    the low point first (`lowOf`), else biggest first (today's sitepods order).
  - for each: `q = pondIn(g, els, still)`; skip when null; the pond `{ kind: 'pond', poly: q, name, note: 'Wet
    detention' (sfr / mixed) or 'Dry basin', linear: aspect(q) > 3 || undefined, low: … }` and its ring trail (B4 `ringOf`);
    the green keeps its land but loses its name when the pond takes most of it (as sitepods does now). At most 6 ponds in
    the plan.
  - names: "Detention 1…n" in order nearest the low side (or biggest) once there are 2+ ponds, except named ones
    ("Amenity lake", a name given by hand); "Linear pond n" for `linear`.
  - notes: short → "Ponds hold N of the M acre-feet needed (P%); the rest, K acre-feet, goes in underground storage."
    (one line, replaces the engines' own "Detention holds about …" / "Ponds hold about …" lines: drop those in
    streetnet ~888 and sitepods ~661 so a plan never says it twice; keep their score parts).
- `export function splitPond(plan, id, n = 2, o = {})` → `{ els, done, skipped }` (Change With AI "split the pond in
  three"): the pond's storage V; take the pond (and its ring trail `of: id`) out; its ground (outline grown by 12 ft,
  minus solids) becomes a temporary open-space green; carve n ponds of V/n each (`pondIn(g, els, V/n·1.2·43560/depth)`)
  in that ground and the other candidates, nearest the low side first; each with its ring; say what was split and any
  shortfall ("Split Detention into 3 ponds of 1.4 ac-ft each" / "only 2 fit; 0.6 ac-ft short").
- `export function moveToLow(plan, els)`: not built (out of scope: moving finished ponds after the fact re-lays homes;
  the low side acts at layout time, B2/B3).

### B2. Low side at layout time (no hint = today, byte for byte)
Read `const lo = S.lowOf(plan)` once per layout. Everything below only runs when `lo` is set.

- **Straight layouts** (sitelayout):
  - `reserveBand(F, area, at, win)`: accept `at === 'start'` (the low side of the other axis: the mirror of 'end').
  - `layoutCore` (~1462): `pondAts = pond ? (lo ? lowBands(F, lo) : ['back', 'front', 'end']) : ['none']` where
    `lowBands(F, lo)` turns the low point into the frame (`rot(lo.at, -F.psi)`, through `F.bw` on a wave frame) and
    returns the one band of back / front / end / start whose band region (the box `reserveBand` would make for half the
    pond area, clipped to the site) has its centroid nearest the low point; a second only when within 15% of the first.
    When those yield no usable layout, run the old list and add the note "No layout fits the pond at the low side; it's at
    the back. Plan an outfall to the low side." (the outfall still draws from the plan's `low`).
  - `finishLand` (~673): new `spec.low` (frame point): pieces ordered `inRes` first, then nearest `spec.low` (instead of
    biggest); the organic `blob(to, …)` and `rectNear(to, …)` aim at `spec.low` instead of the buildings' centre; with a
    low point the two-pond cap stays (B5 adds more if short). `attempt` passes `low` (frame) in the finishLand spec.
  - `attempt` (~870): `trail:` also true for `sfr` and `duplex` (rings round every pond); ring `width: S.trailW(PAR)`
    (`trailW = p => clamp(p?.trails?.w, 6, 10, 8)` in siteplan).
  - `useParams` callers: after `useParams(plan)` in `layoutCore` (and `refitRecipe`, `commonsPod`, `foodTruckCore` keep
    theirs) set `PAR.style.ponds = S.pondStyle(plan.params, prog)` (A5).
- **Subdivisions** (streetnet):
  - `reserveBack(F, A)` → `reserveAt(ctx, A, lo)`: no `lo` → today's band. With `lo` (frame point `F.toF(lo.at)`): when
    it sits in the back quarter of the frame and the middle 60% across, today's back band; else a **low corner**: the site
    clipped to a disc round the low point, its radius found by bisection (as `reserveBack`) so `area(pondOf(piece)) ≈ A`,
    `dev` = the rest (largest piece). Returns `{ dev, res, y: null, low: true }`.
  - `context()`: `ctx.low = lo && F.toF(lo.at)`; `mouths` drop any within `r_low + 200` ft of the low point when another
    stays (the entry doesn't cross the pond's land); none left → `reserveAt` falls back to the back band and the note
    "The low side is at the entry; the pond is at the back: plan an outfall pipe to the low side."
  - `skeletons()`: pass the reserve to ring/spine/courts as now (they take `back.dev`, any shape). `coreSkel` with `lo`:
    **split** — the lake gets `need · 0.6` (`A` uses `ctx.need·0.6·1.25`), a low-corner reserve holds `need · 0.4`
    (`reserveAt(ctx, ctx.need·0.4·1.02, lo)`), pods cut from its `dev` instead of `back0(ctx).dev`, `res` = that reserve.
    Without `lo`, unchanged (the lake holds it all).
  - `finishNet` (~855): the reserve pond gets `low: true` when `net.sk.lowRes`; ring trails use `S.trailW(plan.params)`
    and carry `of: pond id`; the core lake's `want` uses the lake share when split. `recipe.net.low = !!lo` (re-fits know).
  - The score part `detention` unchanged (it reads total pond area).
- **Pods** (sitepods `allocate`):
  - the pond pod when there's no commons lake (~314): with `lo`, the pool cell nearest the low point (its centroid)
    instead of the back-most; without, unchanged.
  - with a commons lake **and** `lo` and site ≥ 40 ac: the commons lake gets `need · 0.6`, and a pond pod at the low
    side (as above, sized `need · 0.4 · 1.3`) when one carves without breaking `ok(res)`; else the lake keeps it all.
  - `finishPods` (~437) shortfall: call `detain` (B1) instead of the inline loop (same candidates: 'Open space' first);
    ring trails width `trailW`.

### B3. Notes about the low side (all engines, via the post-pass B5)
- no hint, detention > 0: "The low side wasn't given, so the ponds sit where land was free. Set it with Site › Low Side
  or say where the site drains (“drains to the south-east corner”)."
- with a hint: "Drains to " + lowName + " (" + (from === 'hand' ? 'set by hand' : from === 'words' ? 'from your words' :
  'from elevation data') + "): " + n + " pond(s) holding N of M acre-feet, the outfall drawn to it."

### B4. lib/trails.mjs: rings, greenbelts and links
- `export const trailW = …` lives in siteplan (A/B2); trails.mjs imports it.
- `export function ringOf(plan, pond, els, W)`: the ring path `tidyRing(grow(outline(pond), 6 + W/2), 1)`; sample every
  5 ft; keep samples clear (as the sidewalk test) of lots, buildings, other ponds, drives, parking, amenities and the lot
  line (≥ 2 ft); all kept → one closed trail; else the runs ≥ 60 ft as open trails (`partial: true`), or none when under
  half the perimeter clears. `{ kind: 'trail', path, width: W, r: 0, closed, name: '', note: 'Walking trail', of: id }`.
- `export function beltOf(plan, g, els, W)`: a trail down a greenbelt green (`belt` or note `^Greenbelt`) lacking one:
  its long axis (`mainAngle`) clipped to the green inset by `W/2 + 2`, ≥ 150 ft. (sitepods makes these already; this is
  for belts left without one after edits.)
- `export function linkTrails(plan, els, o = {})` → `{ els, links, unreached: [trail ids], took: [home ids] }`: joins
  every trail (and ring) to the walking network:
  - **targets**: sidewalk strips (`S.sidewalks({ ...plan, elements: els }).strips`) when the plan has any, else street
    pavement (`streetsForWalks` paths at `pave/2`), and the walk round the community centre / clubhouse.
  - grid of 6 ft cells over the site's box; free cells: inside the ring ≥ 2 ft from the lot line, not within `W/2 + 1` ft
    of lots, buildings, garages, ponds, pools, courts, play, parking, truck, signs, keepout, fences, driveway plazas and
    drives (drives are targets: a trail stops at the curb, never runs along a street). Rasterise blockers by their boxes
    (as `openLand`).
  - components: trails touching each other (within 2 ft) are one; a component touching a target (within `W/2 + 3` ft) is
    reached. Then, Prim-like: one multi-source BFS (8-neighbour, typed arrays) from every reached cell; the unreached
    component with the smallest distance gets a link (backtrack, `tidyRing`-style simplify to 2 ft, `smooth(…, 2)`), the
    link's cells become sources; repeat until all are reached or the rest are farther than `o.max` (1,500 ft).
  - links: `{ kind: 'trail', path, width: W, r: 0, name: '', note: 'Trail link', link: true }`.
  - `o.take` (the "connect the trails" edit only): lot cells passable at cost 40 (Dijkstra instead of BFS; buildings
    still blocked); each lot the link crosses loses its home and driveway (the lot becomes a green "Trail access" piece:
    `{ kind: 'green', poly: lot polygon, name: '', note: 'Trail access', trees: true }`); `took` lists the homes.
  - never runs across a street; two trails each side of a street are joined through the sidewalks, not across.
- `export function trailsFor(plan, els, o = {})` → `{ els, notes }` (the post-pass's trails step): a ring for every pond
  without one (`of` or a closed trail whose path encloses the pond's centroid) on homes / apartments / mixed plans;
  belts' trails; then `linkTrails` (no take). Note when some don't reach: "The trail round Detention 2 doesn't reach a
  sidewalk without crossing lots: “connect the trails” opens a path between two homes." (one line, counts them).

### B5. The post-pass (sitelayout `layoutOptions`)
In `layoutOptions` after `withEntrances(...)` and `openDeadEnds`, before `sheetNotes`: `.map(o => waterWalks(plan0, o,
opts))`:
```
function waterWalks(plan, o, opts) // detention topped up, trails round the ponds and linked, the low side said
  skip when !o.elements?.length, opts.pinned?.length (a re-fit: B6), opts.pod, or the program is a custom type
  const p = { ...plan, program: o.program, elements: o.elements }
  1. detain(p, els) (B1)      2. trailsFor(p, els) only for homes / apartments / townhomes / duplexes / mixed programs
  3. notes: B1's shortfall line, B3's low line (replace earlier engine lines matching /^(Detention holds|Ponds hold) /)
  return { ...o, elements, notes }
```
Idempotent (a second pass adds nothing). Time: one `detain` + one BFS per option; budget ≤ 300 ms on the 246-acre Waller
plan (measure; the grid is ~300k cells).

### B6. Re-fits keep it
- `refit` / `refitRecipe` / `refitNet` / `refitPods`: ponds and trails are kept as today. After a re-fit, drop unpinned
  `link: true` trails and run `linkTrails` again (no take) on the result (streets or lots may have moved under them);
  rings (`of`) whose pond moved or went are made again by `ringOf` (pond moved) or dropped (pond gone).
- Detention isn't topped up on a re-fit (the user's ponds stand); the shortfall note is refreshed by `stormOf` in
  Numbers.
- `refitNet` with `recipe.net.low` keeps `net.res` (the reserve) as laid.

---------------------------------------------------------------------------------------------------------------------

## C. Edits, AI, editor, pro forma, sheet

### C1. Program words (siteplan `normalizeProgram`, `guessProgram`)
- `normalizeProgram`: `low: S.LOW_WORDS.includes(p.low) ? p.low : null`.
- `guessProgram` (~1658): `/\b(?:drains?|slopes?|runs?\s+off|falls?)\s+(?:to(?:wards?)?|toward)\s+(?:the\s+)?([a-z -]+?)\s*(?:corner|side|end|edge)?\b|\blow\s+(?:point|side|corner)\s+(?:is\s+)?(?:at|in|on|to)?\s*(?:the\s+)?([a-z -]+?)\s*(?:corner|side|end)?\b/` → `lowWords(m[1] || m[2])`.
- api/siteplan.js PROGRAM schema (~65–110): `low: { type: ['string','null'], enum: [...LOW_WORDS, null], description:
  'Where the site drains, when the request says ("drains to the south-east corner" = south-east; "the back"), else null.' }`
  (add to `required`). Its system prompt: one line on it.

### C2. Change With AI (lib/siteedit.mjs, api/siteplan.js)
New ops (actions), all also produced by `guessEdits`:

| action | fields | does |
|---|---|---|
| `trail` | `target` pond / green id, or null; `with` (link target piece id, optional); `w` width | a ring round that pond ("add a trail round the lake": the pond named or the only lake / 'Amenity lake'), a trail down that green, or with no target rings round every pond lacking one; then links it (no take). `with`: a link from target to that piece (e.g. "a trail from the pond to the clubhouse") |
| `connect` | — | `linkTrails(take: true)`: every trail joined to the sidewalks; says how many homes made way ("Connected 4 trails; 2 homes made way for trail access between lots.") |
| `split` | `target` pond id, `count` | `splitPond` (B1) |
| `low` | `toward` (LOW_WORDS) or `x, y` (sheet feet) | sets `plan.low.hand` (returned as `low` for the caller); says "Set the low side to the south-east corner. New Layouts puts the ponds there." (no re-layout by itself) |
| `sidewalks` | `sides` (both/one/none), `streetKind` (local/collector/null = both), `target` (a street id from plan.streets: that street only), `w` | returns a `params` patch `{ walks: {...} }` (or sets `walks` on that street's drives); "Sidewalks on one side of the local streets." |

- api `EDIT_SCHEMA` (~349): `action` enum + `'trail','connect','split','low','sidewalks'`; new op properties (each nullable
  and in `required`): `count` (integer: split into how many ponds), `toward` (enum LOW_WORDS + null), `sides` (enum both,
  one, none, null), `streetKind` (enum local, collector, null). `kind` enum gains `'trail'` (add kind trail = action
  trail). Description lines for each.
- `EDIT_SYSTEM`: a bullet "Detention, trails and sidewalks:" — plan.storm lists the ponds (id, name, acres, ac-ft, share)
  and the low side; "add a trail round the lake" = trail on the lake's id; "trails round the ponds" = trail, no target;
  "connect the trails" / "link the trails to the clubhouse" = connect (or trail with with); "split the pond into three" =
  split, count 3; "it drains to the south-east corner" = low with toward south-east (x, y only when they point at a
  place on the drawing); "sidewalks on one side of the local streets" = sidewalks sides one, streetKind local; "no
  sidewalk on this street" = sidewalks on the selected street, sides none; "6 ft sidewalks" = sidewalks with w 6. Never
  move ponds to "the low side" by hand: say New Layouts puts them there.
- `describePlan`: add `storm: { needAcFt, heldAcFt, shortAcFt, ponds: [{ id, name, acres, acFt, sharePct, at }], low:
  { words, from } | null, outfalls: n }`, `walks: walkRules(plan)` + `walkFt`, `trails: [{ id, name/note, of, lengthFt,
  link }]` (≤ 40). Trails stay out of `pieces` (as today) but are addressable by id in `trails`.
- `applyEdits`: handlers before the generic `t = byId(op.target)` path; return `low` and `params` alongside `elements`
  (`...(low ? { low } : {})`, `...(params ? { params } : {})`). The api `edit()` passes new describe fields through
  (`storm`, `walks`, `trails` sanitised like `nst`).
- `guessEdits` (before the generic patterns; plain words, no AI):
  - `/\b(?:add|put|build|run|make)\b.*\btrails?\b.*\b(?:round|around|circling)\s+(?:the\s+)?(.+)$/` → trail on
    `find(m[1])` (a pond), else trail with no target; "trails round the ponds" → trail, no target.
  - `/\b(?:connect|link|join)\s+(?:up\s+)?(?:all\s+)?(?:the\s+)?(?:trails?|paths?|walks?)\b(?:.*\bto\s+(?:the\s+)?(.+))?/`
    → `connect` (with `to` X: trail with `with`).
  - `/\bsplit\s+(.+?)\s+(?:in|into)\s+(\d)\b/` → split (`find(m[1])` a pond; "the detention", "the pond").
  - `/\b(?:drains?|slopes?|falls?|low (?:side|point|corner))\b.*?\b(?:to|toward|towards|is|at)\s+(?:the\s+)?([a-z -]+?)(?:\s+(?:corner|side|end|edge))?$/` → low with `toward: lowWords(m[1])`.
  - `/\bsidewalks?\b/` with `one side|both sides|no sidewalks?|none` and `local|collector|main` and `(\d+)\s*(?:ft|feet)` → sidewalks; "on this street" with a selected street → target.
- `src/siteplan.js aiChange` (~3000): after `applyEdits`, `if (r.low) x.low = { ...(x.low || {}), hand: r.low }`;
  `if (r.params) x.params = { ...(x.params || {}), ...r.params }` (walks merged per key). Neither forces a re-fit.

### C3. Editor (src/siteplan.js)
- **Site section** (`siteHtml` ~1931): a button `b('spLow', 'low', 'Low Side', 'Where the site drains: click the map
  at the low corner or side. New Layouts puts the ponds there and draws the outfall to it', ed.mode === 'low')` (new
  `SI.low` icon: a droplet with a down arrow, same 24-box stroke style). A line under the grid: "Drains to the
  south-east corner (set by hand) · Clear" / "Low side: not given" (only when the plan has or needs detention); Clear
  removes `pl.low.hand`. Click dispatch (~1010): `if (ed.mode === 'low') { const p = ftAt(pl, e.lngLat); change(x => { x.low = { ...(x.low || {}), hand: { at: p.map(v => +v.toFixed(1)), how: 'map', words: null, t: new Date().toISOString() } }; }); ed.mode = null; panel(); ctx.toast('Low side set. New Layouts puts the ponds there.'); return true; }`. Hint
  chip text for the mode (~401 table): `low: 'Low side', 'Click where the site drains to'`. The point need not be on
  the lot line (snap to the ring when within 30 ft).
- **Build from words**: when the program has `low` and the plan has no `low.hand`, set `pl.low.hand = { how: 'words',
  words: prog.low, at: SP.lowAt(pl, prog.low) }` before laying out.
- **Map** (~589–630): a fill layer `fs-sp-swalk` (`kind('swalk')`, colour `Ln.walk` lightened, opacity .9) **above**
  lawns/greens and **below** drives; `fs-sp-outfall` line (blue `#3a7dc1`, width 2, `line-dasharray [2, 1.5]`); `fs-sp-low`
  a circle (r 6, white stroke) + text "Low side". sitetools `LAYERS`: `paving.also` += `'swalk'`; `storm.also` +=
  `'outfall', 'low'`.
- **Numbers** (~2492): replace `walkLine` with real numbers:
  - Detention tile sub-line: `N ponds · held X of Y ac-ft` (red "· Z ac-ft short" when short, or "· vaults Z ac-ft").
  - a pond table under the tiles when there are 2+ ponds or a shortfall: Pond | Acres | Holds (ac-ft) | Share of the
    need; an "Underground" row for the vault; caption "Low side: the south-east corner (set by hand)" / "Low side not
    given".
  - tiles `Sidewalks` (`f0(walkFt) + ' ft'`, sub `w + ' ft · ' + sidesWord`) and `Trails` (`f0(trailFt) + ' ft'`, sub
    `trailW + ' ft wide · ' + rings + ' round ponds'`) when non-zero.
- **Settings** (`paramsHtml` / `stormHtml`): under Stormwater, the line it has plus "Ponds: N, nearest the low side
  first" when split. A new group **Walks & trails** (only when the plan has streets or homes): `Sidewalks on local
  streets` select (Both sides / One side / None), `Sidewalks on collectors and entries` select, `Sidewalk width` (ft,
  3–10, placeholder from the rule sheet, hint "rule sheet" / "typical"), `Trail width` (6–10 ft). These are drawing
  settings: they don't re-lay out (sidewalks are derived; trail width applies to the next layout or "add a trail").
  Look › Ponds and pools shows `SP.pondStyle(...)`.
- **Selected street box** (phase 4b's street panel): "Sidewalks: Both sides / One side / None / As the settings" sets
  `walks` on every drive of the chain (`chainsOf` ids); no re-fit.
- **Selected pond**: its share line ("Holds 4.2 ac-ft · 38% of the detention"), and a "Split" button (prompts 2–4) →
  `splitPond` through `change()`.

### C4. Pro forma (lib/proforma.mjs, src pro forma inputs)
- defaults (~70): `walkPsf: 8` ($ / sf of concrete walk and trail).
- `run` (~123): `const mm = S.metrics(plan), walks = ((mm.walkSf || 0) + (mm.trailSf || 0)) * (A.walkPsf ?? 8)`; `site
  += walks`; `budget.walks = walks`, `budget.walkSf`.
- src budget table: a row "· incl. sidewalks and trails (N sf)" under Site work when > 0; an input "Walks and trails
  ($ / sf)" beside Site work.

### C5. PDF sheet and DXF (lib/sitesheet.mjs)
- `planSVG`: sidewalks after greens/trails and before the paving curb pass (`fill="#ebe8e1" stroke="#cfcbc1"`
  `stroke-width lw(0.4)`); outfalls after ponds (`stroke="#3a7dc1" stroke-dasharray="6 4"`, an arrowhead at the low
  end); the low point a small triangle with "LOW" (font `fs(7)`).
- `sheetData` land rows: each pond when 2+ (`'  · ' + name, ac, share%`), "Sidewalks (both sides, 5 ft)" sf, "Trails"
  ft; the notes/facts the caller collects get the low-side line.

---------------------------------------------------------------------------------------------------------------------

## D. Tests, numbers, docs

### D1. Acceptance tests (realistic data). New file **test/sitewater.mjs** (add to `npm test` after test/streetnet.mjs).
Fixtures: copy the site builders from test/streetnet.mjs (Waller 246 ac clipped corner, irregular 144 ac turned 17°,
narrow 50 ac, pentagon 110 ac alone and with a commons) and test/sitelayout.mjs / scratchpad numbers.mjs (101 ac mixed
with retail + 250 homes + lake commons; sfr 1400×1000 with Settings › streets 'straight'). Lay each out once (count 1,
`netBudgetMs` as test/streetnet uses) and share the results across assertions (keep the file under ~4 min).

1. **Detention met across split ponds**
   - Pentagon + commons, `plan.low.hand` at the south-east vertex: ≥ 2 ponds (the amenity lake and a pond at the low
     corner); `stormOf(plan).held ≥ 0.95 · volume` or a note `/^Ponds hold .* goes in underground storage/` whose
     numbers match `stormOf` to 0.1 ac-ft; `pondsOf` shares sum to `held / volume` ± 0.01; every pond ≥ 8,000 sf.
   - 101-ac mixed with the low hint: the lake + a low pond pod; same totals assertion.
   - `splitPond` on Waller's reserve pond into 3: 3 ponds, Σ storage within 5% of the original (or the shortfall said),
     none overlapping a lot, home, street or another pond.
   - A shortfall case (the narrow 50-ac site with storage 1.2 ac-ft/ac): `detain` adds ponds in open space nearest the
     low side; still short → the note says by how much and `stormOf(plan).vault` equals it.
2. **Ponds nearest the low side**
   - Waller, hint at the south-east corner (the clipped corner's other side: pick `lowAt(plan, 'south-east')`): the
     nearest pond's outline is within 20% of the site's diagonal of the low point, and nearer than the same layout
     without the hint; `outfalls(plan)` is non-empty, its last line ends at the low point, every pond is in the chain.
   - Straight sfr 1400×1000, hint at the front-left: the pond is in the band nearest it (centroid nearer the low point
     than any other band's would be), homes within 3% of the no-hint count.
   - **No hint:** every fixture's ponds have the same centroids (± 1 ft) and areas (± 1%) as at BASE, except ponds
     added by `detain` and the straight sfr's organic shape (area ± 5%, centroid ± 40 ft); notes include "The low side
     wasn't given".
3. **Trails connected and not crossing buildings or lots**
   - Every pond on every fixture (pure single-family included: the straight sfr and Waller) has a ring trail (`of` its
     id) closed or covering ≥ 50% of its perimeter.
   - No trail's outline (grown −0.5 ft) overlaps a lot, home, building, pond, parking row or drive pavement (`gridIndex`
     as `lotIssues`); `check(plan)` has no "A trail crosses" warning.
   - Connectivity: build a graph of trails + sidewalk strips + street pavement (touching within 2 ft); every trail
     component reaches a sidewalk or street, or is named in the "doesn't reach" note. With `applyEdits(plan,
     [{ action: 'connect' }])` on Waller: all reached, `took` homes ≤ number of unreached components, each took home's
     lot is now a 'Trail access' green, and no lot left overlaps a trail.
   - "add a trail round the lake" (guessEdits → trail on the 'Amenity lake' id) on the pentagon + commons adds one
     ring (when it had none: remove it first) and its link.
4. **Sidewalks along every street, not over lots or homes**
   - Waller (subdivision), straight sfr, 101-ac mixed (pods collectors): for each street from `streetsForWalks`, strips
     on both sides covering ≥ 75% of its length each (junction gaps and driveways aside) unless the street is in `tight`
     or shorter than 60 ft; no strip polygon (grown −0.25 ft) overlaps a lot, home, building, pond or another street's
     pavement; strips are within the site.
   - Settings: `walks: { local: 'one' }` → local walk ft between 45% and 55% of 'both'; `'none'` → 0 on locals and
     collectors unchanged; `w: 6` → `sf = 6 · ft`; a rule sheet with `sidewalk: { sides: 'one', w: 4 }` and no plan
     setting → locals one side at 4 ft, collectors both.
   - `metrics`: `walkSf > 0`, `paved` grew by exactly `walkSf`, `metrics(plan, { walks: false }).paved` equals BASE's;
     pro forma `budget.walks === (walkSf + trailSf) · 8`.
   - planFeatures has `swalk` features (count = strips) and the sheet SVG has the walk fill.
5. **Words and schema** (test/siteplan.mjs, fast): `lowWords` table ("SE", "southeast", "the back", "rear", "street
   side"); `lowAt` on a square and on the Waller ring (a side's middle, a corner's vertex); `guessProgram('… drains to
   the south-east corner')` → `low: 'south-east'`; `guessEdits` for each new phrase in C2; `EDIT_SCHEMA` strict
   (existing asserts cover new fields); PROGRAM schema strict.
6. **Re-fits**: Waller + hint: Re-fit Plan unchanged keeps ponds, rings and links (ids may differ for links), no trail
   over a lot after a street bend (`bend` op) + re-fit.

Existing suites must pass unchanged: test/sitelayout.mjs, test/streetnet.mjs, test/sitepods.mjs, test/siteplan.mjs,
test/sitetools.mjs, test/proforma.mjs (its numbers will move by the walks line: update expected values with the
reason in a comment), test/planmap.mjs (LAYERS).

### D2. Numbers before/after
Run scratchpad/build/numbers.mjs (straight + mixed fixtures) and a net harness on the test/streetnet sites (Waller,
winding Waller, irregular, pentagon ± commons, narrow) against BASE (`git worktree add …/vbase BASE`) and after, with no
hint: homes / units / gfa / spaces / drives / bad must be identical (or explained); pond acres equal or larger; time
within +10% (the post-pass). Then with a hint on Waller, pentagon+commons, 101 mixed, straight sfr: homes within −3%.
Put the table in scratchpad/build/p5/numbers-table.txt and the summary in the changelog notes.

### D3. Look at a real map
Render planSVG (puppeteer, as render.mjs) for: Waller with the south-east hint (ponds, outfall chain, rings, links,
sidewalks), pentagon + commons (lake + low pond), straight sfr (organic pond + ring + sidewalks on rectangle streets),
101 mixed (pods collectors with walks, belts' trails). Check by eye: walks never over lots/homes, stop at cross streets,
go round bulbs; outfall arrows end at the low point; trails don't run along streets.

### D4. Docs
- PRODUCTDOC: "Projects and site plans" › stormwater bullet (~497): several ponds, the low side (Site › Low Side, or
  words), the outfall, the shortfall line; the subdivision bullet (~532): ponds at the low side, the lake + low pond
  split; Settings (~800): Walks & trails group, sidewalks per street type, width from the rule sheet; Numbers (~840):
  the pond table, Sidewalks and Trails tiles; Change With AI phrases; Selected street sidewalks; pro forma walks line;
  DXF layers. "Recently added" entry. No file names, APIs or env vars.
- NEIGHBORHOOD-PLAN.md status line: phase 5 built (date), with what's out of scope (moving finished ponds, elevation
  data, widened greenbelts with linear ponds in pods).
- CHANGELOG.md entry per the repo rule.

---------------------------------------------------------------------------------------------------------------------

## Out of scope (say so in the docs)
- Elevation data (only the `plan.low.elev` slot and precedence).
- Moving finished ponds to the low side without New Layouts.
- Widening pods' 30 ft greenbelts to hold linear ponds (linear ponds come from long open-space pieces only).
- Grading, pipe sizes, outfall structures: the outfall is a sketch line.

## Risks
- **Regression in today's layouts:** the low hint, the 'start' band and splits are behind `lowOf`; the only no-hint
  changes are organic ponds on straight homes layouts, rings on sfr, `detain` top-ups and walks in `paved`. Mitigate with
  D2 and keep `{ walks: false }` in engine metrics.
- **Speed:** `sidewalks()` on a 1,000-home plan (~60k ft of street × 2 sides / 4 ft) and the trail BFS (~300k cells)
  must each stay under ~150 ms; the WeakMap memo avoids recomputing per redraw. Measure on Waller in the browser too
  (Numbers + map + checks call it).
- **Low corner reserve vs the entry and skeletons:** a disc reserve can leave `dev` in two pieces or squeeze the loop
  road (`loopIn` returns null); fall back to the back band with the note rather than failing the skeleton. Test the
  irregular parcel with a hint at each corner (loop: 4 hints, assert layouts come back and notes are honest).
- **Sidewalk geometry at tight spots** (straight-layout connectors, cul-de-sac bulbs where lots start at the bulb's
  right-of-way, knuckles): clipping against lots keeps them off lots by construction; coverage may dip — the test
  threshold (75%) and `tight` list cover it.
- **Trails in the landscape buffer:** links may run along the buffer next to the lot line; allowed (≥ 2 ft in). If the
  buffer is narrower than the trail plus 2 ft, the link can't pass and the note says so.
- **"connect the trails" takes homes:** only on that explicit edit, always said with the count, one Undo restores.
- **Pro forma numbers move** (walks and trails priced): intended; changelog says so.
- **Shared rules move (A1)** touches every streetnet import: re-export keeps the API; run test/streetnet.mjs first.
