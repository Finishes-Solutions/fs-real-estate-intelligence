# Plan: a full set of plans from a project's site plan

Status: Phases 1 to 4 built October 19, 2026 (Projects › a project › **Plans**). Phase 5 (apartments, self storage, hotels, batch mode, Claude for the other AI features) is the road ahead.

**As built**, compared with the plan below:

- **Storage:** sets and their pages are kept on the device that made them (IndexedDB), not in Supabase Storage. A long set is a job saved step by step (`job:<project>`, `jp:<job>:<sheet>`), so it survives a reload and resumes. Shared online storage is still to do.
- **Printing and merging:** one sheet is printed a request (`api/planset.js` mode `sheet`, three at a time), and the pages are merged in the browser with pdf-lib. A hundred-sheet set is about 20 to 40 MB.
- **The review gate:** not built. Claude's designs are checked by code (`lib/plandesign.mjs placeDesign`) and corrected up to twice, then fall back to the rule-based design. People don't approve designs one by one, and approved designs aren't saved to the team library yet.
- **Building types:** grouped by use, footprint and stories, at most eight a set. Townhomes and duplexes are designed as one unit and repeated.
- **Drawing modules:** the drawings are in `lib/sheets/site.mjs` (civil, landscape, site lighting, fire access, site fiber), `lib/sheets/arch.mjs` (plans, elevations, sections, schedules, details, life safety, code analysis) and `lib/sheets/eng.mjs` (structural, mechanical, plumbing, electrical, sprinkler, fire alarm, telecom), all rule-based on the plan and the designs. The shared kit is `lib/sheetkit.mjs`.

## The bar to clear: the Indican / Waller example

The 47-sheet *Schematic Design Set, Option B* that Claude produced in a chat (ReportLab, 24 × 36) shows what people expect: G-001 cover with sheet index and project data, G-002 notes, codes, symbols and abbreviations, C-101 to C-301, A-101 to A-501, S, M, P, E, FP/FA/LS and T series. It is a good start for feasibility, pricing and consultant kickoff. It also shows the failure modes the app has to avoid:

- **It was redrawn rather than derived.** Its north arrows point up on G-001 and C-101. On SP-1, the app's own sheet, north points left: FM 362 is the west frontage. A hand-traced copy drifts. The app has the real geometry, so every sheet has to be drawn from the plan, never retyped.
- **The numbers don't agree.** G-002 note 8 admits that unit areas total 467,739 sf against 441,500 sf on SP-1. A set made by one program from one data model can check its own totals before it is issued.
- **The building sheets are generic.** The elevations are brick boxes with a gable roof, and the MEP sheets are symbols scattered over a plan. That is fine at schematic level only if every sheet says so.
- **One chat, one shot.** Nothing could be regenerated, revised or reused on the next project.

## What "full set" means: the set definition

The set is defined in code (`lib/planset/setdef.mjs`) as rules that turn a plan into a sheet list. Sheet numbers follow the US National CAD Standard: discipline + sheet type + sequence. The sheet types are 0 general, 1 plans, 2 elevations, 3 sections, 4 enlarged views, 5 details, 6 schedules and diagrams, and 9 3D views. The discipline letters are the ones the example used, so the numbers look familiar.

**Level.** The app makes a **Schematic Design (SD) set** only. Design Development and Construction Documents need a licensed architect or engineer to design, calculate and seal them. Every sheet carries "PRELIMINARY — NOT FOR CONSTRUCTION" (see Licensure below).

"How" says where each sheet's content comes from:

- **Plan**: drawn by code from the site plan geometry.
- **Rules**: placed by code from rules, such as a smoke alarm in every bedroom or a receptacle every 12 ft.
- **Claude**: written or designed by the AI, then checked by code.
- **Library**: a standard sheet or detail kept in the repo.

| # | Sheet | How | When it is in the set |
|---|---|---|---|
| G-001 | Cover: sheet index, project data table, vicinity map, team, key plan | Plan + Claude (project data) | Always |
| G-002 | General notes, applicable codes, code summary per occupancy, symbol legend, line types, abbreviations | Library + Claude (code summary from the site facts) | Always |
| G-003 | Code analysis per commercial building: occupancy, construction type, allowable area, occupant load, egress | Rules + Claude | Any non-residential building |
| C-001 | Existing conditions: parcels, aerial, FEMA zone, easements and keep-outs, adjoining roads | Plan + site facts | Always |
| C-101 | Overall site plan (the current SP-1 on the new title block) | Plan | Always |
| C-102+ | Enlarged site plans: dimensions, parking counts, ADA, fire lanes | Plan, split automatically when C-101 is coarser than 1" = 60' | Large sites |
| C-103 | Typical block and lot plot plans, street section | Plan | Single-family, townhome or duplex lots |
| C-201 | Grading and storm drainage (schematic): assumed fall, inlets, trunks, detention | Plan + rules, Claude notes | Always |
| C-202 | Detention summary: storage required and provided | Plan (pond or vault from the plan) | Pond or underground storage |
| C-301 | Site utility plan: water, sanitary, storm and electric service routes | Rules on the plan, Claude notes | Always |
| C-401 | Erosion and sediment control (SWPPP layout) | Rules | Disturbed area ≥ 1 acre (TPDES construction general permit) |
| C-501 | Civil details: paving, curb, inlet, ADA ramp, dumpster enclosure | Library | Always |
| L-101 / L-501 | Landscape plan (trees, lawn, buffers from the plan) and details | Plan + Library | Always |
| A-1xx | Floor plans for each building type and floor, roof plan | Claude design, checked by code | One per distinct building type |
| A-2xx | Exterior elevations, four sides | Code from the floor plan, roof and materials | Each building type |
| A-3xx | Building sections | Code | Each building type |
| A-4xx | Enlarged plans: restrooms, restaurant kitchen | Library + Claude | Commercial |
| A-5xx | Wall sections and typical details | Library by construction type | Always |
| A-6xx | Door, window and room finish schedules | Code from the design | Each building type |
| A-9xx | Renderings: the option's saved AI renderings | Existing renders | When the option has renders |
| LS-101 | Life safety plan: occupant loads, exits, travel distance | Rules on the design | Commercial |
| S-001 | Structural general notes and design criteria (wind, seismic, soils assumption) | Library + Claude | Always |
| S-1xx / S-2xx | Foundation plans and floor and roof framing plans | Rules on the design | Each building type |
| S-5xx | Structural details | Library | Always |
| M-001 / M-1xx / M-2xx | Mechanical notes and schedules, HVAC plans, rooftop equipment | Rules + Claude (schedules) | Each building type |
| P-001 / P-1xx / P-6xx | Plumbing notes, plumbing plans, riser diagrams (grease interceptor for food service) | Rules + Claude | Each building type |
| E-001 / E-1xx / E-2xx / E-6xx | Electrical notes and legend, site lighting, power and lighting plans, one-line and panel schedules | Rules + Claude | Always |
| FP-101 | Fire access and hydrant plan (IFC Appendix D) | Plan + rules | Always |
| FP-2xx / FA-2xx | Sprinkler plans and fire alarm plans | Rules | Sprinklered or alarmed buildings |
| T-0xx–T-5xx | Telecom and fiber: backbone, lot drops, MPOE, risers | Rules | Only when **Telecom** is ticked; it is off by default (decided Oct 19) |

**Sections are picked before a set is made.** The rules above say which sheets *can* be in the set. The person making it ticks which **sections** they want (see Product), and only those are drawn, indexed and billed. General (G) is always in.

**Building types.** A plan's buildings are grouped into distinct types by use, footprint (rounded to 1 ft), floors and form. The Waller plan has 209 homes on three lot widths, three retail shells and one restaurant pad: three home types plus up to four commercial types. Building sheets are drawn once per type, not once per building. Site sheets show every building.

**Uses covered first:** single-family, townhomes and duplexes (IRC), retail and office shells, a restaurant pad and a warehouse shell. Apartments come later (corridors, stairs, elevators, IBC R-2), then self storage and food trucks. A gas station's c-store and car wash are building types like any other; its canopy, pumps and tanks have their own F sheets (F-001 notes, schedules and separation checks, F-101 fuel system plan, F-102 hazardous areas and canopy electrical, F-201 canopy plan and ceiling, F-301 elevations and section, F-401 foundation and framing, F-501 details: lib/sheets/fuel.mjs, added Oct 22). A use the set can't design yet still gets its site sheets and a "building sheets by others" line in the index.

## How a set is made

```
site plan option ──► set definition ──► sheet list (with reasons)
                         │
                         ├── site sheets (Plan / Rules) ─────────────┐
                         ├── per building type:                      │
                         │     Claude ▶ building design JSON         │
                         │     code   ▶ validate ─ fail ▶ Claude fix │   one Chromium page per sheet
                         │     person ▶ review, approve, save        ├─► (api/pdf render path)
                         │     code   ▶ plans, elevations, sections, │        │
                         │              MEP/S/FP symbols by rules    │        ▼
                         └── notes and schedules (Claude, cached) ───┘   pdf-lib: stamp the title
                                                                         block, merge, store, link
```

1. **Building design (Claude, structured output).** For each building type, Claude gets a brief: the footprint rectangle and its street side, floors, use, program (bedrooms, baths, tenants, seats), the jurisdiction facts and the house rules. It returns JSON that matches a strict schema (`output_config.format`):
   - rooms as rectangles in feet, each with a name and type;
   - walls (exterior or interior), doors with swing, windows with size and sill;
   - plumbing fixtures, kitchen equipment;
   - roof type and pitch, exterior materials;
   - structural system, HVAC system, water heater type.

   It never draws. Code draws.
2. **Validation (code, `lib/planset/design.mjs`).**
   - The plan fits the footprint on the site plan exactly.
   - Rooms don't overlap and leave no unassigned gaps.
   - Every room is reached through a door.
   - Bedrooms have an egress window and the IRC minimum size.
   - Halls and doors meet minimum widths.
   - Conditioned area falls within ±3% of the program.
   - Commercial buildings have restrooms sized to the occupant load and two exits where required.

   Failures go back to Claude with the list, at most two repair rounds. If it still fails, the person sees the problems rather than a quietly bad sheet.
3. **Review gate (person).** The Plans tab shows each building type's floor plan before the rest of the set is made. The choices are **Approve**, **Regenerate** (with a note: "bigger kitchen, 3-car garage") or **Use one from the library**. An approved design can be **saved to the team building library** (the `site_building_types` table from Oct 19). The next project with a 52 ft lot reuses it with no AI cost and the same quality. Over time this library of approved prototypes is worth more than any single generation.
4. **Drawing (code).** The sheet renderers build each sheet from the approved designs and the plan:
   - floor plans, elevations, sections and schedules;
   - structural and MEP plans, with symbols placed by rules on the design: receptacles per NEC spacing, smoke and CO alarms per IRC R314/R315, one supply diffuser per room sized by area, the panel by the garage, sprinkler heads on a grid.

   The output is SVG in HTML, rendered to PDF by the headless Chromium already used for `api/pdf`.
5. **Notes and schedules (Claude).** General notes, the code summary, design criteria, equipment schedules and sheet notes come from one call per discipline. Every call shares the cached project brief, so later calls read it at about a tenth of the input price.
6. **Set checks (code, `lib/planset/checks.mjs`).** The set is not issued while any of these fail:
   - the sheet index matches the sheets;
   - every "see C-301" points to a real sheet;
   - unit, area and parking totals agree with C-101;
   - every north arrow comes from the plan's rotation (the same `streetDown` / `turned` the SP-1 sheet uses);
   - every drawing fits its sheet at the scale it states.
7. **Assembly.** Each sheet is a separate PDF stored in Supabase Storage. `pdf-lib`, a new dependency in pure JavaScript, does three things:
   - draws the title block template under every page as vector artwork;
   - writes the sheet fields;
   - merges the pages, uploads the set and returns a signed link.

   This gets round Vercel's 4.5 MB response limit, and no step runs near the 300 s function limit.

The site sheets need no AI and can ship first.

## The title block

The template (`A-XREF-BORD-V01`, AutoCAD Architecture, 24 × 36 landscape) has:

- a drawing frame of about 31 × 23 in;
- a vertical strip about 2.5 in wide on the right, which holds:
  - the Finishes Solutions LLC logo, firm number F-23876, telephone 936-372-1670 and 1004 Priya Ln., Waller, TX 77484;
  - two unlabelled boxes under the logo;
  - an open area;
  - an issue / revision table (number, date, description);
  - Drawn by, Checked by, Project number, Sheet title, Sheet number;
- "Finishes Solutions LLC. All rights reserved" under the frame.

- **Use the PDF itself, not a redraw.** The template page is embedded as vector artwork under every sheet, so the logo, line weights and layout match the CAD original exactly. Only the field values are written by the app. Field positions live in one table (`lib/planset/titleblock.mjs`) measured from the template, so a new template version means updating one table.
- **The app removes the plot stamp (decided Oct 19).** The file has the red AutoCAD plot stamp (the `C:\Users\…` path and date) down the left margin, outside the drawing frame.
  - A one-time build script (`build/titleblock.mjs`) strips the plot stamp's drawing commands from the template page and saves the clean template in the repo.
  - If the stamp's commands can't be told apart from the rest, it falls back to a white mask over the left margin, which holds nothing else.
  - Either way the result is checked by rendering the clean template to an image before it's committed.
- **The firm number is off for now (decided Oct 19).** F-23876 is removed from the template the same way. One setting (`showFirmNumber`, off) brings it back later without a new template.
- **Where the fields come from.** These fields are new on the project:
  - client / owner;
  - project number;
  - the address the project already has;
  - default Drawn by initials (the person making the set);
  - Checked by: left blank for a person to initial.

  The revision table fills itself: issue 0 is the first set, and each re-issue adds a row with what changed.
- **Content on the open area of the strip:** the key plan, phase ("Schematic design — Option B"), date, scale and the not-for-construction box. The example set put these in its own title block.
- **Sizes.** 24 × 36 is native. **11 × 17 half-size** scales the sheet to fit and adds "Scales shown are for 24 × 36 sheets".

## Licensure: say it plainly on every sheet

The firm number comes off the sheets for now (decided Oct 19), which makes the sheets look less like engineering work. The statement below stays regardless. Under Texas rules, unsealed preliminary engineering documents must say they are for interim review and not for construction, bidding or permit. MEP and structural sheets made by an AI are exactly that.

- **Proposal:** every sheet carries a fixed box with this text: *"PRELIMINARY — NOT FOR CONSTRUCTION, BIDDING OR PERMIT. Schematic design generated from a conceptual site plan with AI assistance. Not prepared or sealed by a licensed architect or engineer."*
- There is a blank space for a seal that the app never fills.
- The wording has to be confirmed with Finishes Solutions' engineer of record before the first set leaves the building. It is in the open questions below.

## The Claude API key and model settings

- **Environment variables (Vercel → Settings → Environment Variables, Production and Preview):**

  | Variable | Default | What it does |
  |---|---|---|
  | `ANTHROPIC_API_KEY` | none, required | Type Sensitive. Without it, Plans says "Plan sets need the Claude key on the server" and the site-only sheets still work. |
  | `ANTHROPIC_MODEL` | `claude-opus-5-5` | The server's default model (decided Oct 19). |
  | `ANTHROPIC_EFFORT` | `medium` | Effort level (decided Oct 19). It is sent explicitly on every request rather than relying on the model's own default. |
  | `PLANSET_MONTHLY_CAP_USD` | $100 | Monthly budget (decided Oct 19), per US Central calendar month, like `RENDER_MONTHLY_CAP_USD`. A spent budget answers 402 before calling Claude; $0 turns plan sets off. |

  The README's setup table gets these rows.
- **Client.** `lib/anthropic.mjs` wraps the official `@anthropic-ai/sdk`. The OpenAI client in this repo is hand-rolled with `fetch`; the SDK gives streaming with `finalMessage()`, retries on 429/5xx and typed errors, all of which these long requests need.
  - Structured output uses `output_config.format`. Thinking is adaptive (on Opus 5.5 it can't be turned off; effort is the only control).
  - Requests stream: a building design can be tens of thousands of output tokens, and models allow up to 128K.
  - The project brief and the house rules come first in the request with `cache_control`, so the 10 to 40 calls in one set reuse them.
  - Use is recorded with `recordUsage` under a new **Plan sets** feature.
- **Which models (Settings › AI model).**
  - The Anthropic provider, listed today as "coming later", turns on when the server has the key.
  - A new **Plan sets** row has a model picker filled from Anthropic's `GET /v1/models` (Claude models only, newest first), with "Server default (claude-opus-5-5)" first, and an effort picker (low / **medium**, the default / high / xhigh). It also shows this month's spend against the $100 cap.
  - Medium effort trades some reliability for cost. The building-design validator and its repair rounds catch bad floor plans either way. If repairs become frequent, raise effort for design calls only, not for notes.
  - It is kept on the device and sent with each request, and the server uses it only if the key can, the same rules as the OpenAI pick (`lib/aimodels.mjs`, `api/models.js`).
  - The existing OpenAI model keeps serving site plans, Ask AI and briefs. Letting Claude answer those too is a separate, later step: they use OpenAI-specific calls.
- **Prices (`lib/aiprices.mjs`, USD per 1M tokens: input / cache read / output, list prices as of Oct 2026):**

  | Model | Input | Cache read | Output |
  |---|---|---|---|
  | `claude-opus-5-5` | 4 | 0.20 | 20 |
  | `claude-sonnet-5-5` | 2 | 0.20 | 10 |
  | `claude-haiku-5-5` | 0.10 | n/a | 0.50 |
  | `claude-fable-5-1` | 10 | 0.25 | 50 |

  Cache writes cost about 1.25× input, so usage needs a cache-write column. The Usage table gets the Plan sets row.
- **Cost per set, an estimate to replace with measured figures after the first ten sets:**
  - each building-type design: about 15K tokens in, 20K to 40K out with thinking, about $0.50 to $1 on Opus 5.5, more with repair rounds;
  - notes and schedules: about $2 to $4 for a 45-sheet set with the brief cached;
  - a Waller-sized project with about 7 types: **roughly $8 to $20 on Opus 5.5, about half on Sonnet 5.5**, likely towards the low end at medium effort;
  - with the $100 cap, that is about 5 to 12 large sets a month on Opus 5.5, and more for small sites or sets that reuse library designs;
  - designs taken from the library cost nothing.

  The set dialog shows the estimate before it starts. A **Batch** option (half price, results within hours) suits overnight sets later.
- **Safety refusals.** Opus 5.5 can stop with `stop_reason: "refusal"`. The client checks for it and turns on Anthropic's server-side fallback, so a false positive on, say, a "fire alarm" note doesn't fail the set.

## Product

- **Project page tabs:** Overview · **Sites** (today's Options, renamed; decided Oct 19) · Renderings · **Plans** (new) · Ask. Old links with `pt=options` still open the Sites tab.
- **Plans tab:** one row per issued set, showing:
  - the option, level, date, sheet count and who made it;
  - **Download PDF** and **Sheet list**;
  - "Plan changed since this set was made" when the option's plan hash differs, as the renders do.
- **Make plan set** (on the Plans tab and next to the option's Site Plan PDF). It asks for:
  - the option;
  - **the sections, as checkboxes** (decided Oct 19):

    | Section | Ticked at the start |
    |---|---|
    | General | Always in, can't be unticked |
    | Site & civil | Yes |
    | Landscape | Yes |
    | Architecture | Yes |
    | Structural | Yes |
    | Mechanical | Yes |
    | Plumbing | Yes |
    | Electrical | Yes |
    | Fire protection & life safety | Yes |
    | Renderings | Yes, when the option has any |
    | Telecom / fiber | **No**: only when asked for |

    Next to each box: how many sheets it adds for this option (for example "Architecture: 14 sheets, 7 building types"). The cost estimate and the sheet index update as boxes change. A section that doesn't apply (no buildings the set can design yet, say) is shown greyed out with the reason. Unticking Architecture also unticks Structural, MEP and Fire, since they are drawn on the building designs; the dialog says so.
  - the sheet size;
  - the title block fields;
  - the model and its estimate.

  It then works in order:
  1. Site sheets.
  2. Building designs, which stop for review.
  3. The remaining sheets, with progress sheet by sheet and Cancel.
  4. The set checks.
  5. Issue.
- **After issue:** **Regenerate** any one sheet, then **Re-issue** to add a revision row. Each sheet in the list says how it was made (plan, rules, AI or library) and when.
- **Storage:**
  - a `plan_sets` table: set, option, plan hash, sheet list, revisions, who and when; additive migration;
  - approved designs in the existing `site_building_types` table;
  - PDFs in a private `plan-sets` Storage bucket behind signed links;
  - device-only projects can make a set but keep only the link.

## Order of work

| Phase | What | Rough time |
|---|---|---|
| 1. Foundation | Key, client, Settings rows, prices, Plans tab, title block stamping and assembly, storage; first set = G-001 + C-101 + A-9xx renders | 1 to 1.5 weeks |
| 2. Site and civil | C-001, C-102, C-103, C-201, C-202, C-301, C-401, C-501, L-101, FP-101 and G-002, all from the plan, with Claude notes | 1.5 to 2 weeks |
| 3. Buildings | Design schema, Claude design, validator and repairs, review gate, library save; A-1xx to A-6xx for homes, retail shell, restaurant, warehouse | 3 to 4 weeks |
| 4. Engineering narratives | S, M, P, E, FP/FA, LS and T sheets by rules on the approved designs, with Claude notes and schedules; set checks | 2 to 3 weeks |
| 5. Later | Apartments, storage, food trucks (fuel done Oct 22); Batch mode; Claude as a provider for the other AI features | on demand |

That is about **8 to 10 weeks** to a set comparable to the Waller example, with each phase usable on its own. Phase 1 is worth shipping alone: it already turns "a site plan and some renders" into an issued, title-blocked set.

## Tests and docs

- **The set definition** against realistic plans:
  - a Waller-like subdivision with three lot widths, retail and a pad;
  - a mixed shops-and-apartments plan;
  - a merged multi-parcel site;
  - a gas station.

  It must pick the right sheets and building types.
- **The design validator** against bad designs: overlapping rooms, a bedroom without egress, a plan that doesn't match its footprint, an area off program.
- **Title block field positions and assembly:** page count, every sheet stamped, the half-size scaling.
- **The endpoint** with Claude stubbed, as the site plan tests stub OpenAI; plus one manual run against the real API before shipping, with its cost recorded.
- **Docs:**
  - a "Plans" part in the product doc;
  - the env rows in the README;
  - a changelog entry each push.

## Open questions

**Decided (Oct 19):**

- Options is renamed **Sites**.
- The app removes the plot stamp from the template.
- The firm number is off the sheets for now.
- Telecom is only in a set when ticked, and every section is a checkbox before a set is made.
- The default model is `claude-opus-5-5`, at medium effort.
- The budget is $100 a month.

**Still open:**

1. **Title block:**
   - What goes in the two unlabelled boxes under the logo: project name and address, client, or a seal?
   - What format does the project number take?
2. **Statement:** whose wording goes in the preliminary statement, and does anyone review sets before they go out?
3. **Approval:** can anyone approve a building design into the team library, or only certain people?
