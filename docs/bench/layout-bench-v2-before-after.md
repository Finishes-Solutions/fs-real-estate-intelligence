| Case | Family | Outcome | Top option | Fails | Unknown | Replay | Before (same validator) |
|---|---|---|---|---|---|---|---|
| MF-garden-exact | multifamily | feasible | pass · 120 units · parking 284/192 | — | 4 | identical | fail (program.u1); fail (program.u1); fail (program.u1) |
| MF-garden-max | multifamily | feasible | pass · 168 units · parking 286/269 | — | 4 | identical | pass; pass; pass |
| MF-garden-rot | multifamily | feasible | pass · 360 units · parking 610/576 | — | 4 | identical | pass; pass; pass |
| MF-courtyard | multifamily | no-feasible-found | fail · 132 units · parking 277/212 | overlap.level-aware, access.buildings, program.u1 | 4 | identical | fail (program.u1); fail (program.u1); fail (program.u1) |
| MF-midrise | multifamily | feasible | pass · 128 units · parking 455/205 | — | 4 | identical | pass; pass; pass |
| MF-townhomes | multifamily | feasible | pass · 57 units · parking 132/129 | — | 4 | identical | pass; fail (overlap.level-aware); pass |
| MF-duplex | multifamily | feasible | pass · 44 units · parking 88/88 | — | 4 | identical | pass; pass; fail (overlap.level-aware) |
| MF-tower | multifamily | no-feasible-found | fail · 199 units · parking 486/319 | program.u1 | 4 | identical | fail (program.u1); fail (program.u1); fail (program.u1) |
| MF-wrap | multifamily | unsupported | Wrap (apartments round a garage): No wrap geometry: a garage zone besi | — | — | identical | fail (program.u1); fail (program.u1); fail (program.u1) |
| RE-strip | retail | feasible | pass · 28,000 sf · parking 122/112 | — | 4 | identical | fail (program.u1); fail (program.u1); fail (program.u1) |
| RE-anchored | retail | feasible | pass · 80,000 sf · parking 343/320 | — | 4 | identical | fail (program.u1); fail (program.u1); fail (program.u1); fail (program.u1) |
| RE-pad | retail | feasible | pass · 2,500 sf · parking 32/25 | — | 4 | identical | pass; pass; pass |
| IN-warehouse | industrial | feasible | pass · 250,001 sf · parking 163/150 | — | 4 | identical | fail (program.u1); fail (program.u1); fail (program.u1) |
| FL-flex | flex | feasible | pass · 60,000 sf · parking 39/36 | — | 4 | identical | fail (access.connectivity); fail (access.connectivity); fail (access.connectivity) |
| MX-horizontal | mixed_use | no-feasible-found | fail · 296 units · parking 661/606 | program.u2 | 4 | identical | fail (program.u2, program.u3); fail (program.u2, program.u3); fail (program.u2, program.u3) |
