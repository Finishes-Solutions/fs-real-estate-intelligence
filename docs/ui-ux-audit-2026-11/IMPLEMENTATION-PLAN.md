# Implementation plan

From the Real Estate Intelligence UI/UX audit (11 Nov 2026, Branch test/ev-stations, commit fbd24fd). Full evidence for every ID is in UI-UX-Audit-Report.pdf / .md.

Grouped by the shared component or workflow an engineer would open, so related fixes ship together. Do the top five first (they appear in groups 1, 2, 4 and 5), then work down the groups in order. Each group lists its findings, the files most likely involved, what it depends on, and how to know it's done. The preview patches in preview-patches/ show one working version of most changes and can be used as a starting point; they are previews, not production code.

## Fix first

1. **UX-401**: Intake fields lose focus whenever the user pauses typing, and the next keystrokes are dropped. Typing in a new project's Intake form loses keystrokes whenever the user pauses. It happens at the start of every project and the fix is a small change in one function, so do it first.
2. **UX-103**: An address the geocoder can't match silently becomes the street, still labelled 'Address'. When search can't match a house number it quietly opens the property at the street's midpoint, still labelled 'Address'. Users can read the wrong owner and value with no warning, and search is the most common way into the app.
3. **UX-201**: County area reports quietly run on a single point or a 15-mile circle but are titled with the whole county. County reports are titled with the whole county but measure one unmarked point (Drive-Time) or a 15-mile circle (Air Traffic). Those figures can end up in client or investment documents.
4. **UX-603**: Popovers and panels handle keyboard focus four different ways; Layers and the KPI picker lose focus to the page on Esc. Keyboard focus is lost or misplaced across the app: Layers, Filters, the Metrics picker, Timeline cards, deletes, Data & help. One shared focus helper fixes all of them and clears a WCAG 2.4.3 failure.
5. **UX-402**: "Under review" says nothing about who reviews, what is pending, or what blocks the project. A project's status can't say who acts next, what's pending or what's blocking it, and there's no approved or hand-off state. That is the core question when work changes hands. It needs a product decision on statuses, so start that decision now, alongside items 1–4.

## 1. Project intake, status and sharing

- **Size:** Large
- **Depends on:** Product decisions: the list of project statuses and who owns each, and the single source of truth for team sharing (UX-402, UX-403)
- **Likely files / components:** `src/workspace.js`, `src/siteplan.js`, `src/team.js`, `lib/feasibility/pipeline.mjs`, `src/building.js`

Fix the Intake focus bug first (one function). Then give projects a status with an owner, a next action, a due date and a blocker, add approved and hand-off states, show one sharing state everywhere, add a saved signal and Undo to Feasibility edits, and stop a site plan starting before the parcel loads.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-401 | P1 | Intake fields lose focus whenever the user pauses typing, and the next keystrokes are dropped | On the Intake step at 1280x800, type " A", wait 1 s, type "BC" in Client / prepared for: the field reads "... ABC", document.activeElement is still that input, and Tab moves to Target use. | group-D.patch (8ca10d2) |
| UX-402 | P1 | "Under review" says nothing about who reviews, what is pending, or what blocks the project | On the sample project at 1440x900, without scrolling, the header shows who owns the next action and what it is (or "No next step set" with a way to set it), and each unfinished step in the stepper shows a visible state word. | group-D.patch (2ade750) |
| UX-403 | P1 | Projects page says "shared with the team" and "On this device only" at once | At 1440x900 on #v=projects, the subtitle, the team button and the Delete Project confirmation all name the same sharing state. | group-D.patch (6039e4a) |
| UX-404 | P2 | Feasibility edits give no "saved" signal and cannot be undone | After changing an assumption, within 3 s the header shows "Saved" (or "Synced with team") and "Updated just now by <name>". ⌘Z (with focus outside a text field) puts back the previous value and the numbers. | group-D.patch (efa265b) |
| UX-405 | P2 | Editing a scenario changes nothing on screen | With a scenario selected under Editing, changing an assumption changes the Levered IRR shown on the Pro Forma step within 1 s, and the scenario name can be edited inline. | group-D.patch (812a847 2fd1703) |
| UX-406 | P2 | Deleting a project is permanent for the whole team, behind a native confirm, with no undo | After deleting a project, a toast with Undo shows for at least 10 s and Undo restores the project with all its options. The confirmation is an in-app dialog that names where it is deleted (team or device), the same way as the team button. | group-D.patch (b17ce96 7a8fd66) |
| UX-408 | P2 | Starting from the map skips intake, yet Intake is ticked done; the editor and the project use different stage lists | For a project just created from a parcel, the Intake step shows a visible "Needs details" state (not a tick) until Client and Target use are filled, and the editor and the project page use the same names for the shared stages. | group-D.patch (a0c6097) |
| UX-409 | P3 | Site area shows 16.16 acres in the header and 15.97 acres in the summary, both labelled "acres" | On the sample project every acreage figure on screen carries a qualifier (parcels vs site), or all show the same value. | group-D.patch (d96abd6) |
| UX-410 | P3 | Project search doesn't match status | Typing "under review" on #v=projects shows every project with that status. | group-D.patch (93a2f4c) |
| UX-412 | P2 | Site plan can be started before the parcel loads; the project is saved as "Property details unavailable" / "Loading parcel…" with no outline | With /api/site answering 429, clicking a parcel then Site plan doesn't create a project. The card shows a plain failure message with Retry, and no project named "Property details unavailable" or "Loading parcel…" appears on #v=projects. | group-D.patch (01d78c6) |

**Group done when:**

- Typing 'ABC Holdings' with pauses into any Intake field keeps every character and keeps focus.
- Every project shows status, owner, next action and blocker in its header, and can move to approved and handed off.
- The Projects page, editor and delete dialog all show the same sharing state.
- A Feasibility edit shows 'Saved' within 2 seconds and can be undone with ⌘Z / Ctrl+Z.

## 2. Search and property card accuracy

- **Size:** Medium
- **Depends on:** Nothing
- **Likely files / components:** `src/mapsearch.js`, `src/building.js`

Never present a street match as an address: say the house number wasn't found and don't offer Property Card for a guessed point. Keep the clicked parcel visible beside the card, rank places above streets when the query names a place, add a no-results message, and explain blank values.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-103 | P1 | An address the geocoder can't match silently becomes the street, still labelled 'Address' | Searching '22003 Tomball Pkwy, Tomball' shows a list item and a result card that state the house number wasn't found; the card's main action is not 'Property Card' for an arbitrary parcel. | group-A.patch (5c357e4) |
| UX-104 | P2 | The property card covers the parcel you clicked, and the search card stays on top of the map | At 1440x900, clicking any lot at x>1025 opens the card and the lot's highlight ends fully visible left of the card; after Property Card from search, #placebar is hidden. | group-A.patch (bae0c44) |
| UX-109 | P3 | Search ranks street names above the county you typed and never says 'no results' | Typing 'Harris County' + Enter outlines Harris County; typing 'zzqxv nothing' shows a 'No matches' line. | group-A.patch (30e0324) |
| UX-110 | P3 | Appraised value shows '—' with no reason on Harris County parcels | On 221 W Main St, Tomball the Appraised value field shows a short reason text instead of a bare '—'. | group-A.patch (3aee26a) |

**Group done when:**

- Searching '22003 Tomball Pkwy' shows 'House number not found' and doesn't label the result 'Address'.
- Opening a card never covers the parcel that was clicked at 1440×900.
- A query with no matches shows a 'No results' row with a suggestion.

## 3. Area tools, filters and panel scope

- **Size:** Medium
- **Depends on:** Nothing
- **Likely files / components:** `src/app.js`, `src/layerfilters.js`, `src/index.html`, `src/building.js`

Make the panel say exactly what area its numbers cover, make filter chip counts match the results, turn 'Cancel' into 'Done' once an area is applied, fix the first-visit tip so the click it promises works, and show why Save search is unavailable without needing hover.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-106 | P2 | After a Radius or County area is applied, the chip still says 'Cancel', and Cancel keeps the area | After applying a 1 mi radius, #modeChip's button reads 'Done' (closing keeps the area) and the radius panel no longer overlaps the circle; before any area is applied it reads 'Cancel'. | group-A.patch (0147135) |
| UX-107 | P2 | County filter chips show counts that don't match the result, and behave differently from the Type chips | With the default 12-month period, the county chip counts sum to the 'filings region-wide' total, and clicking a lit county chip turns only that county off. | group-A.patch (f15fb5e) |
| UX-108 | P2 | First visit: the tip says 'click any parcel', but a click at the opening zoom does nothing | On a first visit at the opening zoom, clicking the map shows a visible hint or zooms in; the tip text names the zoom/search step. | group-A.patch (ad97d34) |
| UX-211 | P2 | With no area picked, the panel says 'Map view near Tomball' while Area at a Glance totals the whole visible region (6.6M people) | At the default map view with nothing picked, the area bar and the Glance card both state that the figures cover the whole visible map, with a size or county count, and the word 'near' doesn't appear. | group-C.patch (e6b2d8d) |
| UX-309 | P3 | ‘Save search’ and ‘Filing alerts’ are greyed in the area ⋯ menu, and the only reason given is a hover tooltip | With nothing picked, the ⋯ menu shows the text 'Pick an area or set a filter first' under Save search without hovering. | group-A.patch (a2e7012) |

**Group done when:**

- With no area picked, the area bar names the counties the numbers cover.
- Every county chip count equals the result count after choosing it.
- After a radius is applied the chip reads 'Done' and keeps the area; 'Clear' removes it.

## 4. Keyboard focus, Undo and accessibility (shared helpers)

- **Size:** Medium
- **Depends on:** Nothing; do before the mobile and visual groups so they reuse the helpers
- **Likely files / components:** `src/app.js (trapTab, toast)`, `src/mapsearch.js`, `src/index.html`, `src/assistant.js`, `src/app.css`

Add one popover helper on top of the existing trapTab (focus in, Tab stays inside, Esc closes, focus returns), use it for Layers, Filters, Metrics, menus and cards, restore focus after re-renders and deletes, pause Undo toasts on hover and focus and make Undo reachable, add skip links, expose the active search option, and fix the two axe violations.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-603 | P1 | Popovers and panels handle keyboard focus four different ways; Layers and the KPI picker lose focus to the page on Esc | At 1440x900, for each of #filterPop, #layers, #kpiPop and #ai: pressing Enter on the trigger moves document.activeElement inside the overlay. Pressing Esc from any focused element inside closes it and document.activeElement is the trigger. Tab never leaves an open role=dialog popover. | group-B.patch (5931faa) |
| UX-604 | P2 | No skip links: the map search is the 184th Tab stop and Layers the 190th | At 1440x900 on #v=map, the first Tab shows a visible 'Skip to map tools' link, and Enter on it focuses #msq. The map search is reachable in 3 Tab presses or fewer from page load, whatever state the filings section is in. | group-B.patch (5ebe7c4) |
| UX-606 | P2 | After a delete, focus is lost and the timed Undo toast can't be reached in time | On #v=saved at 1440x900, after Enter on Delete, document.activeElement is the next row's 'Show on map' button (or the h1 if the list is empty). The toast stays visible while hovered or focused. Undo is reachable in 2 Tab presses or fewer, or with ⌘Z. | group-B.patch (70e4f79) |
| UX-102 | P1 | Search suggestions: the highlighted option isn't exposed to assistive tech, and Esc drops focus | With 'Katy' typed and ArrowDown pressed, #msq has aria-activedescendant equal to the id of the option with aria-selected=true; after Esc, document.activeElement is #msq and #msq aria-expanded=false. | group-A.patch (75261fa) |
| UX-311 | P3 | Ask AI resize handle is a focusable separator with no value, so screen readers can't tell its width | axe on #ai with the drawer open reports no aria-required-attr violation, and aria-valuenow changes when ArrowLeft/ArrowRight is pressed on the grip. | group-A.patch (c109918) |
| UX-610 | P2 | Green up-deltas fail text contrast (4.06:1), plus a nameless tooltip and an unfocusable scroll region (axe) | axe WCAG 2.1 AA on #v=market at 1440x900 and 390x844 reports 0 color-contrast, aria-tooltip-name and scrollable-region-focusable violations. | group-B.patch (eed99f6) |

**Group done when:**

- Opening Layers, Filters or Metrics by keyboard moves focus into the panel; Esc returns it to the button that opened it.
- After deleting a saved search, focus is on Undo, and the toast stays while focused or hovered.
- The first Tab stop is 'Skip to map tools'.
- axe reports 0 violations on every route.

## 5. Area report engine

- **Size:** Large
- **Depends on:** Nothing
- **Likely files / components:** `src/reportkit.js`, `src/drivetime.js`, `src/airreport.js`, `src/fema.js`, `src/env.js`, `src/traffic.js`, `api/traffic.js`

Every report states the area it actually measured and draws it on the map, the map refits beside the card, long reports show progress per section with a cancel, every error offers Retry, road names replace raw IDs, county wording replaces parcel wording, and areas and populations use one formatter.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-201 | P1 | County area reports quietly run on a single point or a 15-mile circle but are titled with the whole county | With Harris County picked, the Drive-Time card subtitle names the start point, a start marker is visible on the map, and the Air Traffic card's first line names the radius and the centre ('within 15 mi of the middle of Harris County'). No point- or radius-based report shows the county name alone as its title. | group-C.patch (aa03426) |
| UX-202 | P2 | Area report cards cover most of the area they report on; the map does not refit beside the card | At 1440x900, after opening any area report for Harris County, the whole county outline is visible in the map area not covered by the card. | group-C.patch (a0829fd) |
| UX-203 | P2 | County-sized FEMA and Environmental reports show one static line for minutes, with no progress, estimate or cancel | During a Harris County FEMA run, within 5 s the card lists each part with its own state, finished parts render before the slowest one completes, and a Cancel link stops the request. | group-C.patch (a59b5b5) |
| UX-204 | P2 | Report errors are recoverable in some places and dead ends in others (no Retry on FEMA flood-zone section or Drive-Time) | Forcing /api/fema flood-zones to fail shows a Retry inside the Flood zones section that reloads only that section; forcing /api/isochrone to 429 shows a Retry in the Drive-Time card; FEMA year labels never overlap at 375px card width. | group-C.patch (0777d32) |
| UX-205 | P2 | Traffic report lists raw TxDOT IDs (TL0008-RG / -KG / -LG) as three separate 'busiest roads' with identical numbers | The Harris County Traffic report shows ten distinct, human-readable road names; no row label matches /^[A-Z]{2}\d{4}-[A-Z]{2}$/. | group-C.patch (da4fd29) |
| UX-206 | P2 | Environmental report on a county uses parcel wording ('on the site', Phase I distances) and shows a capped 1,000 as a count | For Harris County no tile or cell says 'on the site', the pipelines tile reads '1,000+' (or the true count), the records table is readable at 375px without any cell wrapping beyond 2 lines, and a run where any source returns partial data names that source on the card. | group-C.patch (dd11ebe) |
| UX-210 | P3 | The same county shows different numbers on different screens (area, population growth, rent) | For Harris County, every screen shows the same size string and growth figure, and the two rent tiles name their different sources. | group-C.patch (a820fd5) |
| UX-213 | P3 | Report-card charts have unreadable axis labels (9px SVG text rendered about 6px tall) and bare dashes for live stats | No text in report-card charts renders below 11px, and unavailable live tiles say why in words. | group-C.patch (a714900) |

**Group done when:**

- A Drive-Time report on Harris County is titled 'From <place>, Harris County' and its start point is marked on the map.
- Every report section that fails shows a Retry button.
- No report lists the same road twice.

## 6. Market, Compare and Reports page

- **Size:** Medium
- **Depends on:** Group 4 for contrast tokens
- **Likely files / components:** `src/compare.js`, `src/area.js`, `src/kpis.js`, `src/app.css`

Format each Compare row to one scale, stop the add button creating overlapping areas, make the Market Report label follow the map's pick, and fix the Metrics picker's order and locked items.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-207 | P2 | Compare table mixes full and abbreviated numbers in the same row (893,767 vs 4.8M) | In every Compare row all cells share one number format and unit, e.g. Population shows three full integers. | group-C.patch (e34f77e) |
| UX-208 | P2 | Compare's primary button adds an overlapping 'Together' area after the counties are already in Compare; 'Add Each' stays enabled and does nothing | With the three picked counties already in Compare, neither add button is a primary enabled action, and any 'Together' label names the counties. | group-C.patch (23483f2) |
| UX-209 | P2 | Reports › Market Report says 'Uses Houston region (7 counties)' while Harris County is picked, then exports a Harris County report | Opening Reports with Harris County picked on the Map (Market not yet visited) shows 'Uses Harris County' on the Market Report card within 3 s, and the PDF it makes is for the area the card names. | group-C.patch (a19e2f3) |
| UX-212 | P3 | '+ Metrics' popover: number badges out of order and unchecked metrics locked without saying why | With 9 metrics selected, clicking an unchecked metric gives visible feedback (swap or inline message) and focus starts inside the popover when it opens. | group-C.patch (c11b43a) |

**Group done when:**

- Every Compare row uses one number format.
- The Reports page Market Report label names the area the PDF will cover.

## 7. Filings and watchlist

- **Size:** Medium
- **Depends on:** Nothing
- **Likely files / components:** `src/views.js`, `src/field.js`, `lib/taxonomy.mjs`, `src/timeline.js`, `src/app.css`

Zoom the map to a chosen company's filings, merge ISD name variants, only alert on watched filings for changes after they were watched (and say what changed), tidy the Changes run picker, and give data tables sortable sticky headers in one style.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-304 | P2 | Opening a company from Filings › Companies doesn’t zoom the map to its filings | At 1440x900, clicking a company with 2+ filings fits the map so every one of its filings is inside the visible map and the map zoom is greater than the region default (7.7). | group-A.patch (af31950) |
| UX-306 | P3 | Companies lists the same organisation under two names (e.g. 'Aldine ISD' and 'Aldine Independent School District') | Searching 'aldine' on #v=who returns a single row that totals both names' projects (10). | group-A.patch (145c05a) |
| UX-307 | P2 | Watching a filing immediately raises an 'Updated' alert that doesn’t say what changed or when, and doesn’t clear when viewed | Watching a filing that changed earlier this week doesn't add a badge to My Work. A change found after watching shows the field, old → new value and date on the row, and the badge clears after the page is opened. | group-A.patch (9ff8689) |
| UX-308 | P3 | Changes ‘Found’ picker repeats the same date six times and lists a run with 0 changes | On #v=changes, no two options in #chRun have the same label, and no option reads '0 changes'. | group-A.patch (aa2584a) |
| UX-605 | P2 | Data tables can't be sorted, lose their header when scrolled, and use four different header styles | On #v=who at 1440x900, clicking 'Projects' sorts the rows by filing count descending and sets aria-sort='descending'. After scrolling the table 1500px, the header row is still visible at the top of the view. th computed styles are identical across table.who, .mk-tbl, .src-tbl and table.cmp. | group-B.patch (057cb2d) |

**Group done when:**

- Choosing a company fits the map to its filings.
- Watching a filing raises no alert until a later change, and the alert names the field that changed.
- Clicking any table header sorts by it and the header stays visible while scrolling.

## 8. Error and not-configured states

- **Size:** Small
- **Depends on:** Nothing
- **Likely files / components:** `api/feasibility.js`, `api/regrid.js`, `lib/assist-logic.mjs`, `src/assistant.js`, `src/regrid.js`, `src/app.js`

Replace server setting names with plain messages, don't offer actions that can't work (Retry when AI isn't set up, Get from Regrid without a key), and show an offline indicator.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-407 | P2 | Error and setup messages show server config variable names (SUPABASE_SECRET_KEY, ANTHROPIC_API_KEY) | No user-facing text on the project pages contains an all-caps environment variable name. When saving report sets is unavailable, the button is disabled or replaced, with a plain-language reason, before it is clicked. | group-D.patch (4644399 cb0b5f7) |
| UX-302 | P2 | Ask AI shows 'The assistant couldn’t answer. Try again.' with a Retry link when AI isn’t set up at all | With /api/chat answering 503 and a 'not configured' error, the drawer shows a message that names setup (not 'Try again') and shows no Retry link. A 502 still shows Retry. | group-A.patch (d731f87) |
| UX-609 | P3 | No offline indicator anywhere; failures show generic messages | With the context offline, a visible 'Offline' status (role=status) appears within 1 s on every route at 390x844 and 1440x900, and disappears when back online. The Ask AI error names the cause. | group-B.patch (35e76c5) |

**Group done when:**

- No user-facing message contains an environment variable name.
- With AI not configured, Ask AI says so once and shows no Retry.
- Going offline shows an 'Offline' chip within 1 second.

## 9. Phone and tablet layout

- **Size:** Medium
- **Depends on:** Group 4 (focus helpers) and group 3 (filter chips)
- **Likely files / components:** `src/app.css`, `src/mobile.js`, `src/workspace.css`, `src/app.js`

Show first-visit help on phones, open one card at a time, make the bottom sheet swipe to full and back in one motion, show filter chips on phones, fix the stepper overlap and the floating Back chip, raise touch targets to 44px, and end county picking when leaving the map.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-501 | P2 | First visit on a phone shows nothing that explains the app; the Getting started tip is hidden in the Explore tab | With fs-tip-intro unset at 390x844, the Getting started text (or a short version) is visible on the Map tab without any taps, and "Got it" hides it for good. | group-B.patch (5cf7d03) |
| UX-502 | P2 | Picking an address on a phone opens two cards at once; the place card's × floats loose on the map | At 390x844 after picking an address, only one card is visible, the picked parcel is visible above the sheet, and every close × is inside its own card and at least 44x44. | group-B.patch (2335a08) |
| UX-503 | P2 | Bottom-sheet swipe: a second swipe up scrolls the card instead of opening it to full height, and swiping down takes several swipes | At 390x844, two upward swipes on the card header take the sheet peek → half → full with card.scrollTop still 0. Two downward swipes go full → half → peek. | group-B.patch (1b2a55e (+ b7d0e9f)) |
| UX-504 | P2 | On phones the active filters are invisible: the chip row is hidden, so there is only a number badge and a clear-everything × | At 390x844 with County = Fort Bend set, a chip reading "Fort Bend" is visible on the Map tab, and tapping its × removes only that filter. | group-B.patch (f3b508f) |
| UX-505 | P2 | Project Feasibility stepper on a phone: the current step is drawn under steps 4 and 5 | At 390x844 on the Feasibility tab, no stepper buttons overlap (each button's box stays inside its li) and the current step's name is fully readable. | group-B.patch (8d5ac00) |
| UX-506 | P2 | Site plan on a phone: the "Back to Projects" chip sits in the middle of the plan | At 390x844 with the sample plan open, no floating chip overlaps the plan between the toolbar and the sheet, and a back control to the project is still reachable in one tap. | group-B.patch (358c68c) |
| UX-507 | P3 | Many touch controls are well under 44px on phones and tablets (plan tools, card section chips, page toggles, Retry links) | At 390x844 and 834x1112 (touch), every visible button, chip and link in the property card, site plan sheet, Filters sheet and page headers measures at least 44x44 CSS px (or has a 44px hit area). | group-B.patch (dca80d1) |
| UX-508 | P3 | After picking a county on a phone, county picking stays on behind the report, and its hint says "Click" | At 390x844, after picking a county and opening any area report, no mode chip or picking hint is shown, and tapping the map does not change the selected counties. | group-B.patch (d8adf22) |

**Group done when:**

- At 390×844 no control overlaps another and the stepper shows all six steps without overlap.
- Active filters show as removable chips at 390×844.
- One swipe moves the sheet between peek, half and full.

## 10. Navigation, naming and visual system

- **Size:** Medium
- **Depends on:** The brand colour decision (current green or Finishes Solutions #006527) for UX-601
- **Likely files / components:** `src/app.css`, `src/nav.js`, `src/views.js`, `src/siteplan.js`

Separate 'current page' and 'selected' styling from the main action button, give each page one name and one h1 from a shared header helper, make attention badges clear once seen, use one inline validation pattern for required fields, and lift the smallest grey labels to the type scale.

| ID | Priority | Finding | Acceptance criterion | Preview patch |
| --- | --- | --- | --- | --- |
| UX-601 | P2 | One black pill means five different things: current page, current sub-page, jump link, toggle value and main action | At 1440x900 on #v=market, #v=field and #v=saved, at most one filled primary button is visible per view. The current top-bar tab, current sub-tab, section chip and segmented value are each visually different from .btn.primary (checked by computed background colour). | group-B.patch (5f8f697) |
| UX-602 | P2 | Pages have three or four different names, and 'Projects' means both site plans and construction filings | For every route in nav.js NAV/UTIL, the eyebrow text equals pathOf(id), the h1 text starts with labelOf(id), and no top-level page title or table header uses 'Projects' to mean TDLR filings. | group-B.patch (bebb3a2) |
| UX-608 | P3 | Green 'needs attention' badges are always on, so they stop meaning anything; the phone Projects count sits on the icon | After opening #v=changes once, the Changes badge is no longer green until the next nightly run. On 390x844, the Projects count is a pill at least 16px high that doesn't overlap the icon stroke. | group-B.patch (829809f) |
| UX-607 | P3 | An empty required name is handled three different ways (silent refocus, inline error, silent revert) | On #v=projects at 1440x900, submitting the New project form empty shows a visible error under the field and sets aria-invalid='true' on #pjNm. The same applies to rename. | group-B.patch (ca372de) |
| UX-611 | P3 | Map panel labels are set at 9.5–10.5px in grey (KPI labels, date line, On map), below a comfortable reading size | On #v=map at 1440x900 with filings open, no visible text node renders below 11px. | group-B.patch (a5cb169) |

**Group done when:**

- Each screen has at most one filled primary button per task area, and current-tab styling differs from it.
- Every page title, tab label and browser title use the same name, and each page has one h1.
- Badges show only for items not yet seen.
