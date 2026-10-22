# What a full set contains

Sheet numbers follow the US National CAD Standard: discipline + sheet type + sequence (0 general, 1 plans,
2 elevations, 3 sections, 4 enlarged, 5 details, 6 schedules / diagrams, 9 3D views). Building sheets are drawn once
per **building type**, not per building; site sheets show every building. The generator (`scripts/fsplans/setdef.py`)
applies these rules; this page is so you can explain and sanity-check the list (`build_set.py --list`).

"How": **Plan** = drawn from the site geometry; **Rules** = placed by rule (a smoke alarm in every bedroom, a
receptacle every 12 ft…); **Design** = from your building design; **Words** = your notes; **Library** = standard detail.

| Sheet | Content | How | In the set when |
|---|---|---|---|
| G-001 | Cover: project, key plan, project data, program & parking, sheet index, team, description, notes, codes, next steps, site constraints | Plan + Words | always |
| G-002 | General notes, codes, building types, code summary, sprinkler basis, symbols, abbreviations, conventions | Library + Words | always |
| G-003 | Code analysis per commercial type: occupancy, construction, allowable area, occupant load, exits, travel, plumbing fixtures | Rules | any non-residential type |
| C-001 | Existing conditions: boundary courses (bearings / distances computed from the geometry), easements, flood, site data | Plan | civil |
| C-101 | Overall site plan in colour, legend, land use, program, parking, notes | Plan | civil |
| C-102 | Dimension & paving: closest building-to-property-line distances, drive widths, setbacks | Plan | civil |
| C-103 | Typical lot plot plans with setback envelopes | Plan | civil and lots exist |
| C-201 | Grading & drainage: assumed grades falling to the pond, flow arrows, FFEs, inlets, storm trunk | Plan + Rules | civil |
| C-202 | Detention summary: required vs provided, basis, typical section | Plan + Rules | civil |
| C-301 | Utilities: water main and hydrants, sanitary, services | Plan + Rules | civil |
| C-401 | Erosion & sediment control (TPDES CGP) | Rules | civil and site ≥ 1 acre |
| C-501 | Civil details: paving, curb, ramp, enclosure, silt fence, construction entrance | Library | civil |
| L-101 / L-501 | Landscape plan (street and buffer trees, shrubs, schedule) and details | Plan + Rules + Library | landscape |
| A-1xx | Floor plans of every level + roof plan, type data, plan notes | Design | arch, per type |
| A-2xx | Four exterior elevations, materials | Design | arch, per type |
| A-3xx | Transverse and longitudinal sections | Design | arch, per type |
| A-501 | Typical wall sections (wood frame / commercial) | Library | arch |
| A-6xx | Door, window and room finish schedules | Design | arch, per type |
| S-001, S-1xx, S-2xx, S-501 | Structural criteria and systems; foundation plan (grade beams, grid); framing plans; details | Rules + Library | structural |
| M-001, M-1xx | Equipment schedule and sizing basis; HVAC plans (diffusers, AHU / CU / RTU) | Rules | mechanical |
| P-001, P-1xx, P-601 | Fixture totals and units; plumbing plans with service sizes; riser diagrams | Rules | plumbing |
| E-001, E-101, E-2xx, E-601 | Service sizes and symbols; site lighting; power & lighting plans (receptacles, lights, alarms, panel); one-line | Rules | electrical |
| FP-101 | Fire access & hydrants: fire lanes, hydrants, 150 ft hose reach check | Plan + Rules | fire |
| FP-2xx / FA-2xx | Sprinkler heads by hazard; fire alarm devices | Rules | sprinklered types / non-residential sprinklered or A occupancy |
| LS-1xx | Life safety: occupant loads, exits, egress width, travel | Rules | fire, non-residential types |
| T-001, T-101, T-2xx | Telecom notes, site fiber backbone, structured cabling | Rules | only when telecom is asked for |
| A-9xx | Renderings supplied by the user, one a sheet | Images | renderings and renders given |

A use the generator can't design yet (apartments, hotels, self storage) still gets its site sheets; give its type no
`design` and say "building sheets by others" in the notes.

## The set checks (`out/set-check.txt`)

The set is not issued while any of these fail:

- every building design passes the design checks;
- sheet numbers are unique; every "see X-###" points to a sheet in the set;
- every building is inside the property line and names a defined type;
- the drawn acreage is within 2 % of the stated acreage; drawn building area within 3 % of the stated; home count
  equals the stated;
- parking provided ≥ required; detention provided ≥ required;
- every sheet drew without an error.

A failed parking or detention check can be a real finding about the site plan rather than a modelling mistake: then
report it to the user instead of "fixing" the numbers.
