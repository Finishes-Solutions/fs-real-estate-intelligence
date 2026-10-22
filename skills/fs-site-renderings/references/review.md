# Reviewing a rendering

Every painted view gets a `<view>-compare.png`: **massing | rendering | overlay**. In the overlay, the massing's building
outlines are drawn over the rendering, **cyan** where the rendering has a matching edge and **red** where it has none. The
run prints a fidelity score per view, and flags any building whose outline mostly has no match (`<< LOOK CLOSELY: Pad 2 18%`).

The score is a heuristic: it measures edges, not meaning. Use it to point your eye, and judge every picture yourself.

## Checklist (every view)

1. **Count:** the same number of buildings as the massing. Nothing extra (no second storey, tower, parking deck or
   neighbouring building inside the property line).
2. **Place and size:** each building where the massing has it, with the same length, depth, storeys and roof form. Red
   along one building's outline means it moved, shrank or vanished.
3. **Openings:** the storefront / window / door rhythm on the visible fronts follows the massing (the same bays and the
   same door positions). Small differences in mullions are fine.
4. **Site:** drives, parking rows, the pond and lawns in the same places. Cars in stalls are fine; cars on the lawn are not.
5. **Camera:** the same viewpoint and framing (a shifted horizon or a zoom shows as red everywhere).
6. **Light:** midday, with short shadows falling away from the sun the massing shows.
7. **Text:** no readable signs, brand names, watermarks or labels.
8. **Realism:** no melted geometry, doubled windows or bent straight edges.

## Scores in practice

| What you see | Usual cause | Action |
|---|---|---|
| All buildings 85–100% | Faithful | Keep it |
| One building low, the others high | That building was moved, removed or restyled | Re-paint the view |
| Everything 60–75%, outlines offset | The camera or framing drifted | Re-paint the view |
| Scores fine, but something looks wrong by eye | Added content, wrong storeys, text | Re-paint, and name the problem |
| Low scores on a dense, textured photo that looks right | Edges hidden by trees or shadow | Keep it, and note why |

Re-paint with `python3 <skill>/scripts/render_views.py project.json --out renders/ --refs refs/refs.json --views <id> --yes`.
Each try is a new paid call: do at most two per view, then ask the user. When a view keeps failing the same way (say, it
always adds a second storey), the cause is usually the massing or the references. Check `scene.txt` and the reference
images before trying again.
