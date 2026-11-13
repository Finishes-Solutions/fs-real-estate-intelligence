# Coverage

What the Real Estate Intelligence UI/UX audit tested (11 Nov 2026, Branch test/ev-stations, commit fbd24fd).

| Route / workflow | Roles | Viewports | States checked | Result | Gaps |
| --- | --- | --- | --- | --- | --- |
| Map: search and property card (#v=map) | Standard user | Desktop, laptop, phone | Suggestions, address found, address not matched, no results, card loading / populated / partial error | Partial: wrong-parcel risk (UX-103) | Some card sections rate-limited by the local server; Regrid and other paid data have no keys |
| Map: area tools, layers, filters, export | Standard user | Desktop, laptop, phone | Armed, drawing, cancelled, applied, cleared; layers on/off; 0 and 3 filters; Clear all; export fallback | Completed with friction | Real PDF output (no PDF service locally) |
| First visit | New user | Desktop, phone | Getting started tip shown / dismissed | Partial | None |
| Area reports: Crime, Drive-Time, Traffic, Air Traffic, FEMA, Environmental | Standard user | Desktop, laptop, phone (error states only) | Loading, populated, partial failure, error | Partial: county scope misleading (UX-201) | Crime populated state (no data key); radius selection not run; phone only saw error states |
| Reports page (#v=reports) | Standard user | Desktop, laptop, phone | No exports, recent exports, PDF fallback | Completed | Real PDF layout |
| Market and Compare (#v=market, #v=compare) | Standard user | Desktop, laptop, phone | Populated, three areas, one removed, export | Completed with friction | None |
| Filings: Timeline, Companies, Changes | Standard user | Desktop, laptop (screenshots + axe), phone | Filtered, card open, company to map, change acted on | Partial: keyboard focus lost | Timeline and Companies export files not opened |
| My Work: Notes & watchlist, Saved searches (#v=field, #v=saved) | Standard user without a team passcode | Desktop, laptop, phone | Empty, populated, saved, deleted + Undo | Completed | Team-passcode and 'shared' states need Supabase |
| Ask AI | Standard user | Desktop, phone | Empty, error (AI not configured) | Partial: error state only | Successful answers, voice (no AI keys) |
| Settings and Data & help (#v=sources) | Standard user | Desktop, laptop, phone | Open, changed, after reload | Completed | None |
| Projects list (#v=projects) | Standard user | Desktop, laptop, phone, tablet | Empty, populated, search no-match, new project, delete | Partial | None |
| Opportunity to project: parcel → site plan → project | Standard user | Desktop, laptop | Site plan, quick layouts, undo/redo, done | Partial: parcel can be saved before it loads (UX-412) | Multi-parcel 'Site Plan for All' not run |
| Project: Feasibility stages, status, export (#v=projects&pj=…) | Standard user | Desktop, laptop, phone, tablet | Intake edit, scenario edit, status change, report download, save failed | Failed: no way to tell who acts next or what blocks (UX-402) | Plan set to completion (about 17 min), renderings and AI builds (no keys); real file storage |
| Bottom tabs and More (phone) | Standard user | Phone | Every tab and every More row | Completed | Safe areas and the real iOS keyboard can't be emulated |
| Cross-cutting: navigation, tables, forms, overlays, status, a11y | Standard user, keyboard-only user | Desktop, phone | All routes; overlays open/closed; offline | Partial | No screen reader run; spinner vs skeleton not compared |

## Not tested, and why

- **Roles.** The app has no user roles. Everyone sees the same screens. The only gate is an optional shared team passcode for syncing notes and projects, and its 'passcode needed' and 'shared' states need a Supabase connection that isn't available locally.
- **AMP-style approval and hand-off workflow.** This isn't AMP, and the app has no task submission or approval flow to trace. The closest workflow (parcel → site plan → project → status → export) was traced end to end, and its missing next-step and hand-off states are reported as UX-402.
- **Anything that needs API keys.** Successful Ask AI answers, voice, AI site-plan builds, renderings, Regrid parcel data, the Crime data source and real PDF output. Their error and not-configured states were judged instead.
- **Real phone hardware.** Safe areas (notch, home indicator), the real iOS keyboard and geolocation can't be emulated in headless Chrome. The keyboard was simulated by shrinking the viewport.
- **Screen readers.** No VoiceOver or NVDA run. ARIA roles, names and focus were checked through the page structure and real key presses.
- **Speed.** Up to eight browsers shared one machine, so load times and report durations were inflated. The local server also rate-limits by IP, which made some lookups fail during the audit; that limit is a local artefact and isn't reported as a finding.
- **Long-running jobs.** A full plan set (about 17 minutes for 89 sheets) and multi-parcel 'Site Plan for All' weren't run to completion.
