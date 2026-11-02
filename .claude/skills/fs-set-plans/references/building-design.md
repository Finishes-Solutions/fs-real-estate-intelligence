# Designing a building type

You lay out one building type at a time as axis-aligned rectangles in feet. You never draw: the plans, elevations,
sections, schedules and every engineering sheet are generated from this JSON, and `build_set.py --validate-only`
checks it. Follow the rules exactly. Work like an experienced architect drawing schematic floor plans for a
schematic design set in southeast Texas.

## Coordinates

x runs from the left end of the footprint (0) to the right end (W) **as seen from the street**; y runs from the
front wall (0) to the back wall (D). Floor 1 is the ground floor. Snap every number to the half foot.

## Schema (`types[i].design`)

```json
{
  "summary": "One or two sentences: the layout in plain words.",
  "rooms":   [{"id": "kit", "name": "Kitchen", "type": "kitchen", "floor": 1, "x": 9, "y": 22, "w": 16, "d": 14}],
  "doors":   [{"a": "kit", "b": "din" | "outside", "width": 3, "kind": "swing|double|sliding|pocket|overhead|storefront|opening", "side": "front|back|left|right|any"}],
  "windows": [{"room": "b2", "side": "front|back|left|right", "count": 2, "width": 3, "height": 5}],
  "roof":    {"type": "gable|hip|flat|shed", "pitch": 6, "ridge": "along_front|front_to_back", "overhang": 1.5},
  "exterior":{"walls": "", "accent": "", "roofing": "", "windows": "", "doors": ""},
  "systems": {"structure": "", "foundation": "", "hvac": "split_system|rooftop_units|heat_pump|none",
              "water_heater": "tank_gas|tank_electric|tankless_gas|tankless_electric|none", "sprinklered": false, "fire_alarm": false}
}
```

Room types: living, family, dining, kitchen, bedroom, primary_bedroom, bath, half_bath, closet, walk_in_closet,
laundry, pantry, entry, hall, stair, garage, office, flex, mechanical, electrical, storage, porch, tenant, sales,
dining_room, commercial_kitchen, walk_in_cooler, restroom, janitor, break_room, conference, reception, exam, corridor,
lobby, warehouse, sanctuary, classroom, other. The type drives fixtures, outlets, lights, diffusers, sprinkler hazard,
occupant load and finishes, so pick it carefully (e.g. a restaurant's dining is `dining_room`, a shell bay is `tenant`).

## Rules (the validator enforces 1–6)

1. Every room is a rectangle inside the footprint (0 ≤ x, x + w ≤ W, 0 ≤ y, y + d ≤ D). With an `fp` outline (L, U,
   stepped), the building is that outline: no room reaches into a notch, and every wall on the outline is exterior.
   Rooms on the same floor never overlap.
2. Floor 1 is covered completely: rooms tile the whole footprint, no gaps (use halls, closets, storage or mechanical
   for leftovers). Upper floors may leave open-to-below areas but must be ≥ 40 % covered.
3. A stair is a room of type `stair` at the same x, y, w, d on every floor it serves (about 4 × 11 ft in a house,
   10 × 20 ft commercial). Multi-story designs need one on every floor.
4. A door joins two rooms on the same floor that share a wall at least the door's width + 0.5 ft long; or joins a
   floor 1 room to `"outside"` on a side that room touches (give that side). Every room must be reachable from outside
   through doors and stairs. A building needs at least one door to outside.
5. Windows only on exterior walls (the room must touch that side). Attached units have party walls left and right:
   no windows or doors there.
6. Sizes: bedrooms ≥ 70 sf and ≥ 7 ft each way, each with a window (IRC R304 / R310); other habitable rooms ≥ 7 ft
   wide; nothing under 2 ft. Commercial floors over 3,000 sf need two exit doors (not overhead). If `target_gsf` is
   given, conditioned area within 3 %.
7. Residential (IRC): a garage at the front where the program has one, with an overhead door to the front and a door
   into the house; kitchen, living and dining together with windows; a laundry; baths near bedrooms; a primary suite with
   its own bath and walk-in closet when the size allows. Bedroom count by size: < 1,500 sf → 2, < 2,200 → 3, < 3,200 → 4,
   else 5.
8. Commercial (IBC): accessible restrooms (TAS) sized for the use; storefront or entry at the front; rear service door;
   janitor or storage; a mechanical / electrical room in larger buildings. Retail shell: one bay per 25–35 ft of
   frontage, each with storefront, restroom and rear door. Restaurant: dining at the front, commercial kitchen,
   walk-in cooler, dry storage, office, two restrooms. Warehouse: office and restrooms at a front corner (5–10 % of
   the floor), warehouse behind, overhead dock doors at the back or a side. Office / medical: lobby, suites, restrooms,
   core with stair on every floor. Church: sanctuary, narthex, classrooms, office, restrooms, kitchen.
9. Realistic sizes: halls 3.5–4 ft (commercial corridors 6 ft), closets 2–3 ft deep, doors 3 ft (2.5 ft closets and
   baths in homes; 6 ft double or storefront commercial entries; 9–16 ft garage overhead doors; 10–12 ft docks).
10. Materials and systems that suit the use and southeast Texas (brick / fiber cement, hip or gable 6:12 for homes;
    masonry / EIFS and TPO flat roofs with parapets for commercial; split systems for homes, RTUs for commercial).

## Process

1. Sketch the layout as bands front-to-back (front band: garage / entry / front rooms; middle: kitchen, hall, baths;
   back: living, primary suite). Make each band's rooms add up to W exactly, and band depths add up to D.
2. Add every connecting door, then exterior doors, then windows.
3. `--validate-only`; fix exactly what it lists; repeat. Usually tiling gaps or doors whose rooms don't share enough
   wall are the problem — move a wall rather than shrinking a door below code.
4. When it passes, read your plan as an architect would and improve it, then validate again.

`assets/example-project.json` has three passing designs (a 3-bed house with a 2-car garage, a 3-bay retail shell,
a restaurant) to adapt.
