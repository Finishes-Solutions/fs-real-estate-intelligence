# Request understanding: score on the corpus

How the site layout reads requests (vague, detailed, messy, spatial) and whether the best layout delivers them.
Corpus: `test/fixtures/prompt-corpus.mjs` (120 requests and, since round 4, 33 building-type requests, written with their expected reading before the parser was
tuned; 16 FRESH ones written after and scored once). Scorer: `node scripts/prompt-corpus.mjs` (words path, no AI) and
`node test/prompt-eval-live.mjs` (the real AI program step, by hand). LAYOUT-ENGINE.md item 26 describes the changes.

Columns: *reading checks* — uses, quantities and what they mean (exact / at least / range / as many as fit), floors,
parking rule, stormwater, setbacks, overlays, form, pond acres, "says what it assumed", and each place asked (read into
`program.placements` or a zone's place). *Outcome checks* — on the best layout, measured by the scorer's own geometry:
counts and sizes, pieces present, a piece in the region asked (middle third, toward the street, corner, compass side),
one use nearer the street than another, no building within N ft of a line, a way in off the side street, a truck court
facing a way, a corner kept clear. *Unmet place asks said* — of the place checks the layout missed, how many the plan's
notes state as asked and not met.

## Words path (no AI), base commit 13c001e → this branch

Before:

**Words path, before**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 56% | 95% | 8 / 25 | 0 / 1 |
| detailed | 35 | 93% | 84% | 25 / 35 | 0 / 2 |
| messy | 25 | 68% | 74% | 9 / 25 | — |
| spatial | 35 | 58% | 55% | 3 / 35 | 0 / 17 |
| all | 120 | 71% | 76% | 45 / 120 | 0 / 20 |

After:

**Words path, after**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 100% | 100% | 25 / 25 | — |
| detailed | 35 | 100% | 93% | 32 / 35 | — |
| messy | 25 | 100% | 100% | 25 / 25 | — |
| spatial | 35 | 100% | 86% | 30 / 35 | 6 / 6 |
| all | 120 | 100% | 94% | 112 / 120 | 6 / 6 |

Fresh requests (written after tuning, scored once, not tuned to): 15 of 16 fully right (reading 98%, outcome 100%); the
miss: "retial 25k + 1 pad" (a size written as "25k" with no unit or use word after it) was read as as-many-as-fit.

Still missed after (words path):

- D02 “240 units in 4-story mid-rise buildings with 1.5 spaces per unit”: units exact 240 (got 208)
- D05 “96 duplex units on a private street”: units exact 96 (got 64)
- D17 “200 apartments, 3 stories, surface parking, underground detention”: units exact 200 (got 192)
- S06 “300,000 sf warehouse at the rear with the truck court facing east”: in industrial back (got 661,590); facing truck court east (got 0,2)
- S13 “180 apartments, pond in the front as an amenity”: in pond front (got 802,399)
- S19 “homes around a central lake”: in pond middle (got 777,80)
- S26 “200 apartments, put the pond on the north end”: in pond north (got 360,393)
- S31 “garden apartments, as many as fit, parking in front of the buildings”: nearer parking buildings front (got 275 vs 264)

## AI path (live, gpt-6-luna through the app's program step; OpenAI, Nov 5)

The same 120 requests sent to the real model with the app's instructions and schema, its program laid out as the app
does. Before: the base commit's instructions (no placements field). After: this branch's instructions and schema,
before the last three instruction fixes below.

**AI path, before (base instructions)**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 95% | 97% | 22 / 25 | 0 / 1 |
| detailed | 35 | 99% | 88% | 30 / 35 | — |
| messy | 25 | 97% | 96% | 22 / 25 | — |
| spatial | 35 | 63% | 59% | 9 / 35 | 0 / 15 |
| all | 120 | 88% | 83% | 83 / 120 | 0 / 16 |

**AI path, after (placements in the schema and instructions)**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 98% | 97% | 24 / 25 | 0 / 1 |
| detailed | 35 | 98% | 91% | 30 / 35 | — |
| messy | 25 | 100% | 96% | 24 / 25 | — |
| spatial | 35 | 98% | 84% | 29 / 35 | 7 / 7 |
| all | 120 | 98% | 91% | 107 / 120 | 7 / 8 |

After that run, the worst live misreadings were fixed: "mixed use" answered as one use; "office along the highway
with the warehouse behind" answered as one use with both placed (the zones are now made from the placements, and the
instructions say two placed uses are two zones); a grocery with shops answered as two retail zones (instructions: one
retail use, gfa the total); a church's 600 seats sized at 25 sf a seat (instructions: about 33). Re-run on 15 of the
requests (those four and 11 spatial / vague ones): 13 of 15 fully right, then the two remaining ("mixed use",
"office … warehouse behind") right after the mapping fallbacks (2 more calls). About 260 calls in all at gpt-6-luna
prices (well under $3).

Still missed by the AI path (full run, after):

- V19 “mixed use”: uses (got retail); nearer retail multifamily front (got missing)
- D02 “240 units in 4-story mid-rise buildings with 1.5 spaces per unit”: units exact 240 (got 208)
- D05 “96 duplex units on a private street”: units exact 96 (got 66)
- D08 “grocery-anchored center: 50,000 sf grocery and 30,000 sf of shops”: quantity retail (got {"mode":"exact","value":50000,"unit":"sf"}); gfa retail exact 80000 (got 69215)
- D16 “church with a 600-seat sanctuary”: quantity church (got {"mode":"exact","value":15000,"unit":"sf"})
- D17 “200 apartments, 3 stories, surface parking, underground detention”: units exact 200 (got 192)
- M04 “200 units, 1.5 spaces/unit”: units exact 200 (got 192)
- S06 “300,000 sf warehouse at the rear with the truck court facing east”: in industrial back (got 1165,605); facing truck court east (got -272,0)
- S13 “180 apartments, pond in the front as an amenity”: in pond front (got 802,399)
- S16 “office along the highway with the warehouse behind”: uses (got office); place industrial behind office (got office along front; office front ); nearer office industrial front (got missing)
- S19 “homes around a central lake”: in pond middle (got 136,729)
- S26 “200 apartments, put the pond on the north end”: in pond north (got 360,393)
- S31 “garden apartments, as many as fit, parking in front of the buildings”: nearer parking buildings front (got 275 vs 264)

Before (for comparison):

- V15 “senior living”: uses (got other)
- V19 “mixed use”: uses (got retail); nearer retail multifamily front (got missing)
- V21 “cottage community”: form * (got sfr-subdivision)
- D02 “240 units in 4-story mid-rise buildings with 1.5 spaces per unit”: units exact 240 (got 208)
- D05 “96 duplex units on a private street”: units exact 96 (got 66)
- D10 “300,000 sf distribution warehouse, 36 ft clear, truck court with trailer parking”: uses (got industrial,sfr); has truck court (got 0)
- D17 “200 apartments, 3 stories, surface parking, underground detention”: units exact 200 (got 192)
- D34 “garden apartments, 3 stories, as many as fit, 1.75 spaces per unit, with a dog park and playground”: has dog park (got 0)
- M04 “200 units, 1.5 spaces/unit”: units exact 200 (got 192)
- M24 “3-4 story apartments, max density”: quantity multifamily (got {"mode":"range","min":3,"max":4,"unit":"units"})
- M25 “senoir apartmnets 4 storys 140 units”: overlays (got )
- S02 “200 garden apartments with the pool in the center”: place pool middle (got ); in pool middle (got 178,109)
- S04 “180 apartments, keep the trees on the north side”: place open space keep north (got )
- S05 “30,000 sf retail with the entrance off the side street”: place entrance edge side (got ); entrance side (got 1 ways in)
- S06 “300,000 sf warehouse at the rear with the truck court facing east”: place industrial back (got ); place truck court facing east (got ); in industrial back (got 1135,609); facing truck court east (got -275,0)
- S07 “200 apartments with the clubhouse at the entry”: place clubhouse near entrance (got )
- S08 “160 apartments, dog park in the corner”: place dog park corner (got ); has dog park (got 0); in dog park corner (got none)
- S09 “120 townhomes, buffer the single-family homes to the west”: uses (got sfr,townhomes); place buildings away west (got )
- S10 “200 apartments with the parking hidden behind the buildings”: place parking behind buildings (got )
- S12 “160 apartments with the detention pond at the back”: place pond back (got )
- S13 “180 apartments, pond in the front as an amenity”: place pond front (got ); in pond front (got 802,399)
- S14 “200 apartments, playground near the clubhouse”: place playground near clubhouse (got )
- S16 “office along the highway with the warehouse behind”: uses (got office); place office front (got ); place industrial behind office (got ); nearer office industrial front (got missing)
- S17 “180 apartments, keep 100 ft of open space along the east line”: place open space keep east (got ); away buildings east 99 (got 47)
- S18 “150 apartments, no buildings within 75 feet of the west property line”: place buildings away west (got )
- S19 “homes around a central lake”: place pond middle (got ); in pond middle (got 136,729)
- S21 “a gas station on the corner with shops behind”: uses (got fuel); place fuel corner (got ); place retail behind fuel (got ); nearer fuel retail front (got missing)
- S22 “200 apartments, the pool and clubhouse up front by the street”: place pool front (got ); place clubhouse front (got )
- S24 “200 apartments, dog park on the east side”: place dog park edge east (got ); has dog park (got 0); in dog park east (got none)
- S25 “160 apartments, put the playground on the west side away from the road”: place playground edge west (got ); has playground (got 0); in playground west (got none)
- S26 “200 apartments, put the pond on the north end”: place pond edge north (got )
- S27 “warehouse with docks facing away from the street”: place truck court facing back (got )
- S28 “200 apartments with a 50 ft landscape buffer along the north property line”: place open space keep north (got )
- S30 “200 apartments with a second entrance on the side street”: place entrance edge side (got ); entrance side (got 2 ways in)
- S31 “garden apartments, as many as fit, parking in front of the buildings”: place parking before buildings (got ); nearer parking buildings front (got 275 vs 264)
- S32 “160 apartments, clubhouse in the middle of the site”: place clubhouse middle (got )
- S34 “150 apartments, keep the southwest corner open for a future pad”: place open space keep southwest (got ); clear southwest 100 (got 0,0)

## Round 2: the places asked, honoured (words path, 5b39f65 → this branch; LAYOUT-ENGINE.md item 30)

The pond's, the parking's, the clubhouse's and the docks' place, a way in, and a single use's place are now steered:
the engine compares the layouts it draws on them and the generators draw the places asked (the pond along the street,
the clubhouse in the back row, warehouses at the back with their docks on the side asked).

**Words path, before (5b39f65)**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 100% | 100% | 25 / 25 | — |
| detailed | 35 | 100% | 93% | 32 / 35 | — |
| messy | 25 | 100% | 100% | 25 / 25 | — |
| spatial | 35 | 100% | 86% | 30 / 35 | 6 / 6 |
| all | 120 | 100% | 94% | 112 / 120 | 6 / 6 |

**Words path, after**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 100% | 100% | 25 / 25 | — |
| detailed | 35 | 100% | 93% | 32 / 35 | — |
| messy | 25 | 100% | 100% | 25 / 25 | — |
| spatial | 35 | 100% | 98% | 34 / 35 | 1 / 1 |
| all | 120 | 100% | 97% | 116 / 120 | 1 / 1 |

Newly right: S06 (the warehouse at the rear, its truck court facing east), S13 (the pond in front), S26 (the pond on
the north end), S31 (parking in front of the buildings, as many as fit: 204 homes, and the notes say the layout without
it holds 216). Still missed: D02, D05, D17 (exact counts the land can't hold, as before) and S19 “homes around a central
lake” (no longer a fallback: 46 homes, the lake holding the detention, but drawn as a band at the back; said).

Item 26's fresh 16: 15 → 16 (“retial 25k + 1 pad” now 25,000 sf and a pad).

Ten requests written after this round, never tuned to, scored once (`--fresh2`): 8 of 10 fully right (reading 100%,
outcome 82%). Missed: FP4 “200,000 sf distribution building at the back of the site, docks facing west” (at the back;
the docks of the top option face south: said as not met); FP10 “200 apartments, pond in the southeast corner” (the
pond in the right third, midway back: the engine's corner test passed it, the scorer's stricter one didn't, so it was
not said as unmet).

AI path, live, spatial category only (gpt-6-luna through the app's program step, 35 calls, Nov 5): reading 100%,
outcome 91%, fully right 32 / 35 (item 26's full run: 29 / 35), unmet place asks said 4 / 4. Missed: S06 (the
warehouse midway back, docks facing west), S19 (the lake not in the middle), S31 (parking behind the buildings): the
model's programs for S06 and S31 lay out differently from the words' (not traced yet).

## Round 3: filling the land (words path, 2dd7617 → this branch; LAYOUT-ENGINE.md item 32)

**Words path, after**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 100% | 100% | 25 / 25 | — |
| detailed | 35 | 100% | 98% | 34 / 35 | — |
| messy | 25 | 100% | 100% | 25 / 25 | — |
| spatial | 35 | 100% | 100% | 35 / 35 | — |
| all | 120 | 100% | 99% | 119 / 120 | — |

Newly right: D02 (240 mid-rise units, was 208), D17 (200 apartments, was 192), S19 (homes round a central lake: the
lake in the middle, 85 homes, was 46 with the lake at the back). Still missed: D05 “96 duplex units on a private
street”: the land holds about 78 (said in the notes as the most that fits; was 64). Fresh sets not re-scored.

## Round 4: building types on the live AI path (22d0519 → this branch; LAYOUT-ENGINE.md item 34)

33 building-type requests (category `types`, `TYPES` in the corpus) were written with their expected reading before
the AI's program step was given the presets: the preset read, and on the best layout a building of it, what it counts
(keys, beds, children, students, garage spaces, pads), its shape, its queue lanes. The full corpus is now 153
(`--full`). Live runs: gpt-6-luna through the app's program step at its own effort (high), OpenAI, Nov 5; usage not
recorded anywhere, the keys read into the eval process only.

**AI path, before (22d0519: no presets in the instructions or schema)**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 100% | 100% | 25 / 25 | — |
| detailed | 35 | 100% | 98% | 34 / 35 | — |
| messy | 25 | 100% | 100% | 25 / 25 | — |
| spatial | 35 | 100% | 95% | 34 / 35 | 2 / 2 |
| types | 33 | 45% | 29% | 1 / 33 | — |
| all | 153 | 89% | 75% | 119 / 153 | 2 / 2 |

**AI path, after (the presets table, buildingType and zones[].preset, mapped through the words' preset code; final full run)**

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 100% | 100% | 25 / 25 | — |
| detailed | 35 | 98% | 95% | 33 / 35 | — |
| messy | 25 | 100% | 100% | 25 / 25 | — |
| spatial | 35 | 100% | 93% | 33 / 35 | 3 / 3 |
| types | 33 | 100% | 93% | 28 / 33 | — |
| all | 153 | 99% | 96% | 144 / 153 | 3 / 3 |

The first full run after the change (before the fixes in item 34 (c)) scored 143 / 153: types 27 / 33, the 120 at 116
(D21 "between 200 and 240 apartments" read as exactly 220, D28 "courtyard building" given the U preset over its
courtyard form, both fixed and re-run right; TY28's 125,000 sf cut to 120,000 by the model, fixed). In the final run D09
(a coffee shop with a drive-thru answered as retail) and S02 (apartments answered with a commons zone for their pool)
missed by model variance; both fixed (instructions, mapping) and re-run right. Before, the AI path dropped every type
field (the program's normalising), so even types the words know came out as plain uses.

**Words path (no AI), after** (the words path was not tuned; the 120 are unchanged)

| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |
|---|---|---|---|---|---|
| vague | 25 | 100% | 100% | 25 / 25 | — |
| detailed | 35 | 100% | 98% | 34 / 35 | — |
| messy | 25 | 100% | 100% | 25 / 25 | — |
| spatial | 35 | 100% | 100% | 35 / 35 | — |
| types | 33 | 99% | 91% | 26 / 33 | — |
| all | 153 | 100% | 96% | 145 / 153 | — |

Ten type requests written after tuning, never tuned to, scored once (`--fresh3`): live 9 / 10 (reading 100%, outcome
95%), words 8 / 10 (reading 92%, outcome 86%). Live missed FT10 “a T-shaped mid-rise apartment building, 120 units”
(88 units drawn); the words also missed FT09 “a dorm with 400 beds and 20,000 sf of shops in front” (read as shops only).

Still missed, live (final run): D05 (as before), S06 (the warehouse midway back, as in round 2's live run), and in the
types: TY15 a data centre still drawn with a truck court on 40 ac, TY20 a 16-story point tower 189 of 220, TY22 "U-shaped
… round a central courtyard" drawn as the courtyard ring, TY28 a 125,000 sf big box fitting 109,802, TY30 a 500-car garage
on 2.3 ac holding 171: the engine's limits, missed by the words path too (which also misses TY19 "live-work units …, 20 of
them": no count read, and TY33's 200 apartments grown to 432 beside the hotel).

Calls: 153 before, 153 + 153 after (two full runs), 10 fresh, 5 re-runs of fixed cases, 1 smoke test: about 475, about
$0.87 at gpt-6-luna prices (tokens counted from the replies: about 5.4 M in, 0.65 M out).

## Edit requests (LAYOUT-ENGINE.md item 41)

The words typed after a plan exists, through the MCP's plan_edit (the same reading the app's Change With AI uses:
lib/editread.mjs). 81 edits on 7 base plans (test/fixtures/edit-corpus.mjs), scored by scripts/edit-corpus.mjs on the
edited plan's geometry; live by test/edit-eval-live.mjs (gpt-6-luna, the app's edit step). "Before" for the AI path is
with the MCP's edit mode fixed (before it, plan_edit never reached the AI: its live score was the words path's 17).

| Category | Edits | Words before | Words after | Live before | Live after |
|---|---|---|---|---|---|
| move | 10 | 4 | 6 | 6 | 6 |
| resize / count | 12 | 1 | 12 | 8 | 12 |
| swap / add / remove | 11 | 4 | 9 | 10 | 10 |
| parking | 8 | 1 | 5 | 1 | 5 |
| settings | 6 | 4 | 6 | 6 | 6 |
| vague | 10 | 0 | 9 | 2 | 9 |
| messy | 10 | 2 | 8 | 6 | 7 |
| multi | 7 | 0 | 4 | 3 | 4 |
| lock | 7 | 1 | 6 | 5 | 6 |
| all (fully right) | 81 | 17 | 65 | 47 | 65 |
| outcome checks met | | 40% | 88% | 69% | 88% |
| misses said in the reply | | 57 / 64 | 15 / 16 | 22 / 34 | 13 / 16 |

Fresh 15 (FRESH, written after tuning, scored once): words 12 / 15 (missed F02 a 30 ft shift held back by building
spacing, said; F09 diagonal parking on the retail layout, said; F13 "hotel to 140 rms"), live 13 / 15 (F02, F09).
Calls: 75 before, 81 after, 15 fresh, 2 smoke: about 175, about $0.37 (tokens from the replies: about 3.0 M in, 0.13 M out).
Still missed after: see LAYOUT-ENGINE.md item 41.
