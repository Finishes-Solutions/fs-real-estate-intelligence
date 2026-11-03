# Reference plan provenance

Where the layout engine's reference data comes from, how it was read, and how far to trust it.
Data: `data/reference/` (projects, index, templates). Scripts: `scripts/refs/` (see its README).
The source library (87 projects, 500 PDFs, ~5.5 GB) stays outside Git.

## What was reviewed (Nov 2026)

15 projects, 12 families. Every value carries its file, sha256, page, sheet, revision/date, method,
confidence, status and review flag.

| ID | Project | Forms (overlays) | Partition | Main sources |
|---|---|---|---|---|
| P01 | Artisan Village, Fort Worth TX | garden breezeway, detached garages | dev | civil site plan with building schedule (Oct 2019) |
| P06 | Landing at 2EightySeven, TX | garden breezeway, detached garages | dev | A0.5 site/unit ID plan (Oct 2020), L0.1 |
| P08 | 130-unit Ennis concept, TX | garden breezeway | dev | concept site plan (Jan 2024) |
| P17 | Pointe Grand Columbia Ph 2, SC | garden breezeway (36u) | dev | A0 building plan (raster), site/parking notes |
| P18 | Lake Shore / Beach Club, SC | townhome rows (4/5/6) | **holdout** | AF1.3–1.5 combined plans, C1.0 plat (2005) |
| P20 | Magnolia Village Ph 2, Salina KS | walk-up exterior entry, duplex, detached cottage, unit over garage | dev | C009 FDP (Dec 2025), Tessere permit set, MHK unit sets |
| P25 | Hawthorn Cottages, Dublin IE | podium, two buildings 7 and 11 storeys | dev | A002/A100/A300 (LRD Stage 3) |
| P27 | The Rise / Vallco, Cupertino CA | towers on podium, townhomes, mixed use (affordable) | dev | P-0101, P-0102, P-0800.06 (REV-6 Dec 2023) |
| P35 | Sierra Vista WB-30, Roseville CA | 4-story corridor + elevator (senior, affordable) | **holdout** | site plan Aug 2023, KTGY A1-01 |
| P36 | Sierra Vista WB-32, Roseville CA | same 64-plex prototype (senior, affordable) | **holdout** | site plan Aug 2023 |
| P28 | Creekview C-40, Roseville CA | 4-story corridor (affordable) | dev | A1.1 (Jun 2022), area summary text |
| P11 | Creekview C-43, Roseville CA | 4-story corridor (affordable) | dev | text only |
| P37 | Terracina at Fiddyment, Roseville CA | garden breezeway 24-plex, carports | dev | C2 preliminary site plan (Feb/Apr 2024) |
| E053 | Portland Road Townhomes, Salem OR | townhome with garage, retail pad | dev | C100 (May 2025), A2/A3 |
| E054 | Anderson Apartments, Redmond WA | podium 5-over-2, courtyard, mixed use | **holdout** | cover data (text), A0.23, A0.24 (Mar 2025) |

## Method

1. Map manifest documents to files by sha256 (all 500 resolved).
2. Search the text layer for site tables, unit schedules and dimension strings; print only matches.
3. Render the page (1,400–2,400 px) and crops, and **look** at them. Raster sets (P17, P18) were read only visually.
4. Scaled measurements: calibrate against the sheet's graphic scale bar, then check against a known
   dimension (e.g. a 9 ft stall pitch). P08 shows why: its printed "1"=80'" does not match its own
   scale bar (the sheet was reduced); the bar was used.
5. Reconcile totals (unit mix, units × buildings, GSF by level, parking components, density, coverage).
6. Templates are built only from fixture values; gaps are marked estimate or null.

## Partitions

Partitions are set per **family** so related revisions, phases and prototypes never straddle dev
and holdout. Grouped families: Sierra Vista (P34–P36), Roseville USA Properties / Bassenian Lagoni
(P11, P28, P37: same architect and developer), Porterville prototypes (P09–P10), Bellefield
(E012–E014). The other projects form their own families (80 families in all). Holdout: 21 of
80 families (26%, 26 projects). Reviewed holdout families: Lake Shore (townhomes), Sierra Vista
(mid-rise senior) and Anderson (podium courtyard, mixed use). Unreviewed families were split by a
stable hash. The holdout includes the Roseville sets P29, P31 and P32, whose architects weren't
checked; if they turn out to share an architect with a dev family, move them.

## Coverage by form

| Form | Visually reviewed | Text-only | Absent / only guessed from manifest |
|---|---|---|---|
| Garden walk-up, breezeway | P01, P06, P08, P17, P37 | — | |
| Garden walk-up, exterior entry | P20 | — | |
| Townhomes | P18, E053; P27 (counts only) | — | stacked townhomes absent |
| Duplex / small multiplex | P20 duplex | — | triplex/fourplex absent; P22 duplex blocks not reviewed |
| Cottage / detached BTR | P20 | — | |
| Courtyard building | E054 (U on podium) | — | garden courtyard absent |
| Mid-rise 4–5 story, corridor + elevator | P35 (elevators/stairs seen), P28 | P11, P36 (prototype) | |
| Tuck-under / unit over garage | E053 (garage in unit), P20 (unit over 3-car garage, legend only) | — | classic tuck-under walk-up absent |
| Podium | P25, E054, P27 | — | |
| Wrap (around garage) | — | — | **absent** |
| Tower on podium | P25, P27 (footprint estimate only) | — | |
| Senior overlay | P35, P36 | — | |
| Affordable overlay | P27, P28, P35, P36, P37 | P11 | |
| Adaptive reuse / rehab | — | — | 9 projects in corpus, not reviewed |

## Retail, industrial, flex and mixed-use evidence

- **Retail (reviewed):** E053 has a stand-alone 1-story retail building, 60 × 76 ft (4,560 sf), with
  3 suites, a 20 ft parapet and a drive-thru elevation. P27 has 226,386 gsf of retail and
  1,954,613 gsf of office (the only office program). E054 has 999 sf of ground-floor retail
  (text only).
- **Retail (unreviewed text leads):** P12 (1,500 sf retail massing), P23 (retail with goods lift and
  loading bay), P22 ("retail ancillary"), E051, E001/E025 (mixed use).
- **Industrial:** none confirmed. Keyword hits in 6 projects are unverified and probably appear in
  code or zoning text.
- **Flex:** none. The one hit (P38) is a "FLEX" circulation room label.
- The corpus is a multifamily library. It can't support general retail, industrial or flex
  templates.

## Accuracy notes

- 63 reconciliation checks: 50 consistent, 12 discrepancies (all recorded), 1 unknown.
- Agreement with printed totals where both sides were printed:
  - Unit mix and per-building sums matched exactly on P01, P20, P27, P28, P11, P37, P35, P36 and P25.
  - GSF/footprint sums matched exactly on P01 (522,871), P20 (190,368), P25 (10,529 m²), P28, P11 and E054 (303,800).
  - Parking component sums matched on P01, P20, P27, P28, P11 and P37.
- Recorded discrepancies:
  - P17: parking provided is below required. Coverage and impervious figures disagree, and the
    staff report gives a different acreage.
  - P20: Lot 2 footprint is 650 sf off, lot acreages fall 0.79 ac short of the site, and the code
    narrative has a stale plumbing count.
  - P35: printed density is 43.4 du/ac against 44.0 computed.
  - P36: printed lot coverage is 25.3% against 24.3% computed.
  - P27: the east and west site areas don't add up to the gross.
  - P01: printed building dimensions are larger than gross area per floor, because they include
    breezeways.
- Self-check: a first visual read of P27's tiny block totals misread 204 as 284 twice. The text
  layer caught and corrected it, so small table digits read only visually (raster sets) should be
  treated as medium confidence.
- Scaled values (P06, P08, P35, P37, P28, P27) carry ±3 ft to ±10% error and are marked
  medium/low. P27's tower footprints are estimates (the printed scale wasn't calibrated).
- Aerials were not used.

## Known gaps

- Unit sizes are missing for several garden projects, and P35/P36 have no per-type unit counts.
- Stair and elevator counts are mostly unknown outside P17, P35 and P27.
- E053's unit counts for types A.2, B and C, and its site area, are unknown.
- E054's unit mix is unknown, and most of its values are text-only.
- Tower storey counts for P27 are unknown.
- No wrap, stacked-townhome or classic tuck-under walk-up references.
- Not reviewed: Arlington VA mid/high-rise sets (E022–E029), Bellefield, Catalyst, Onyx and the
  Irish duplex blocks (P21–P24, E041).
