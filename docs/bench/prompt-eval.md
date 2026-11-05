# Request understanding: score on the corpus

How the site layout reads requests (vague, detailed, messy, spatial) and whether the best layout delivers them.
Corpus: `test/fixtures/prompt-corpus.mjs` (120 requests, written with their expected reading before the parser was
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
