# The independent check (`rei.validate/1`)

Every option is measured by a validator that reads only the drawing and the brief. Each check: `pass` / `fail` /
`unknown` / `n/a`, **hard** (a fail makes the option infeasible) or a note (a warning), the rule and its basis
(`verified`, `assumption`, `brief`, `geometry`), measured and required values. Missing evidence is `unknown`, never pass.

| Check | Hard | What it measures |
|---|---|---|
| `geometry.valid` | yes | finite, non-degenerate shapes; the boundary doesn't cross itself |
| `site.containment` | yes | every built or paved piece inside the property line and out of holes |
| `site.setbacks.buildings` | yes | each building's distance from each edge by its role (front / street, side, rear) |
| `site.setbacks.paving` | no | the paving buffer from side and rear lines |
| `site.exclusions` | yes | nothing built or paved on an exclusion or keep-out |
| `overlap.level-aware` | yes | no two solid pieces at the same level (stacked uses, parking under a building pass) |
| `separation.buildings` | depends | least gap between buildings (unknown without a rule) |
| `access.entrance` | yes | a drive meeting an allowed street edge; none across a neighbour's line |
| `access.connectivity` | yes | one paved network from the legal entrance |
| `access.buildings` | yes | every building within the stated distance of connected circulation |
| `access.second` | yes | a second way in past 200 apartments or 30 homes (IFC Appendix D, where adopted: an assumption) |
| `access.remote` | no | the two ways in at least half the site's longest diagonal apart (a gated emergency lane counts, for the fire official to accept) |
| `access.fire-width` | yes | every two-way drive at least 20 ft clear |
| `access.dead-end` | yes | no fire-route dead end over 150 ft without a turnaround |
| `access.garage` | yes | a podium garage's entrance reached by a drive |
| `parking.count` | yes | required (brief rules, else use defaults) vs provided (stalls counted from the drawing, garages from their drawn plans, tucked garages, driveways); accessible count per 2010 ADA 208.2 (placement unchecked) |
| `parking.geometry` | yes | each drawn stall inside its row, the site, clear of buildings |
| `program.<use>` | yes | the measured quantity against what the brief's quantity means |
| `program.<use>.anchor`, `.crossdock`, `.trucks` | yes | anchor size; truck courts on both dock walls; truck routes clear of car parking |
| `program.buildings` | yes | units at least 400 gsf each; a templated building keeps its schedule and length |
| `program.template` | no | every apartment building drawn to a reviewed template (a user-chosen depth is an assumption) |
| `program.rowlength` | yes | attached homes in rows no longer than the cap (6 unless the brief says) |
| `locks` | yes | locked pieces unmoved |
| `site.trail` | no | a walking trail through a building or parking row |
| `eng.turning.car / .fire / .service / .truck` | no | each drive corner against the design vehicle's swept band (planning level, not swept-path software) |
| `eng.garage-ramp` | no | the ramp's length for its rise and slope fits the garage |
| `eng.garage-vent` | no | open parking garage (IBC 406.5.2: openings on 2+ sides, 20% of wall area, 40% of perimeter) or mechanical ventilation needed |
| `eng.detention` | no | the pond against an NRCS TR-55 estimate on NOAA Atlas 14 rainfall (offline: the regional figure); an estimate for the civil engineer |
| `eng.fire-route`, `eng.grading-utilities` | no | always unknown: not modelled |

Outcome of a run: `feasible` (some option passes every hard check; best found, not proven optimal), `needs-review`
(none fails, some unknown), `no-feasible-found` (the search didn't find one: a budget, not a proof),
`proven-infeasible` (the footprint at the most floors exceeds the land inside the setbacks), `unsupported`,
`missing-information`, `invalid-brief`.
