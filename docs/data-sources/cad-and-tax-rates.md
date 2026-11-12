# Appraisal rolls and tax rates for the seven home counties: data sources

Phase 1 (discovery) of the CAD roll and tax-rate pipeline. Checked 2026-11-12 from a cloud session by opening each
page or file below (HTTP 200 unless a note says otherwise). Nothing has been loaded yet. "Verified" means the page or
file was opened and read; "not verified" means it came from search results only.

## Build status (2026-11-12)

Phases 2–4 are built on `matthew/more-data-sources`: the schema (`supabase/migrations/20261112000000_cad_rolls.sql`,
not yet applied), the loader (`build/cad-rolls.mjs`, workflow "CAD rolls and tax rates") and the MCP tools
`tax_estimate`, `assessment_history`, `assessment_comps` (`docs/MCP_TOOLS.md`). Nothing has been written to Supabase yet:
every source below was run end to end against the real files in dry-run mode (parse, check, write JSON lines).

| Source | Dry run on the real files |
|---|---|
| Comptroller rates 2024–2025 (four kinds a year) | 4,800 units a year; county M&O = general fund + road & bridge + FMFC |
| Waller CAD 2025 rate table (PDF) | 57 units, 51 linked to Comptroller IDs (2024's PDF is a scan: skipped with a warning) |
| Fort Bend CAD rate workbook (2023 XLSX) | 269 codes, 267 with the Comptroller ID from the workbook itself |
| Montgomery tax office 2026 rates (PDF) | 68 units, 52 linked |
| Harris (HCAD bulk files, 2026 certified) | 1,628,388 accounts, 1,481,169 building sections, 1,082 jurisdictions with HCAD's own 2026 rates; 11 min, 5.3 GB peak memory |
| Fort Bend (2026 certified export + supplements 1–4) | 392,257 accounts certified, then 10,315 / 4,161 / 3,693 / 3,789 in the supplements; about $182B market value |
| Washington (2026 certified PACS export) | 25,278 accounts, 59,574 improvements; 100% of a sample found in the parcel layer |
| Grimes (2025 and 2026 printed rolls) | 29,113 and 28,966 accounts; 92% and 96% of samples found in the parcel layer |
| Waller and Austin parcel layers (2027 current) | 54,153 and 22,423 accounts with coordinates |

Waller account 265550 through `tax_estimate` on those rows: tax year 2027 (current roll), market $19,622,330; Waller
County 0.532596% + Waller County RFM (farm-to-market / flood fund) 0.023591% + City of Waller 0.4464% + Waller ISD
1.0626% = **2.065187%** (Waller CAD's 2025 table; the same as the Comptroller's 2025 county + city + ISD). The parcel layer
doesn't say whether the parcel is in Waller-Harris ESD 200 (0.1% in 2025); with it the total would be 2.165187%. The
2.065962% figure given at the start still matches neither year exactly; the 2024 combination with ESD 200 (2.065919%)
is the closest.

## The short version

- **Tax rates: one statewide source covers every unit.** The Comptroller publishes a yearly XLSX of every taxing unit
  (county, city, ISD, special districts including MUDs, ESDs, drainage, college) with M&O, I&S, total, no-new-revenue
  and voter-approval rates. 2021–2025 are posted; the 2026 file is due by Jan 1, 2027. There is no adoption date.
- **Rolls: three counties publish bulk exports, one publishes a printed report, three publish nothing usable.**
  - Harris, Fort Bend and Washington post full exports, with layouts, at no charge and with no login.
  - Grimes posts each certified roll as a printed report in text form: values and owners, but no improvement detail.
  - Waller, Austin and Montgomery post no roll export. Each needs a Public Information Act request (draft below).
- **Which units apply to a parcel** comes from the roll exports: per-account entity or jurisdiction records. Where there
  is no export, the BIS parcel layers give only three codes (county, city, school), which misses ESDs, MUDs and the like.
- **The BIS parcel layers (Waller, Austin, Washington) have already rolled to tax year 2027** working records, and Grimes
  shows 2026. They hold only the current year, so they can't supply history or the 2026 certified value.

## Sources table

| County | Dataset | URL | Format | Cadence | License / terms | Access | Gaps |
|---|---|---|---|---|---|---|---|
| Statewide | Tax rates and levies by taxing unit (school, city, county, special district, total) | https://comptroller.texas.gov/taxes/property-tax/rates/ (files: `/taxes/property-tax/docs/<year>-<kind>-rates-levies.xlsx`) | XLSX, one sheet per file | Yearly: special/city/county by Aug 31, full list by Jan 1 of the next year; "may publish subsequent updates" | Public state data; robots.txt allows `/taxes/` | Direct download | No adoption date. `*` = CAD didn't report rates (rate shows 0). Column order and unit-ID format change between years (2023: `237-104-03`; 2024+: `237-104-03-237-237`). Lags the current year by about a year |
| Statewide | Special Purpose District Public Information Database | https://spdpid.comptroller.texas.gov/ | Web lookup | Ongoing | Public | Portal only | Not verified (host not opened); per-district lookup, no bulk file seen |
| Statewide | Taxing unit directory (codes by county) | https://comptroller.texas.gov/taxes/property-tax/county-directory/ | HTML | Ongoing | Public | Page | Not opened. The rate files already carry the unit ID, so this isn't needed |
| Statewide | Statewide parcel layer (TxGIO StratMap) | Used today by `api/building.js` | ArcGIS service | Yearly | Public | API (identify) | Already in the app; geometry + `PROP_ID` for Fort Bend and Montgomery |
| Harris | Bulk appraisal data (real property): `Real_acct_owner.zip`, `Real_building_land.zip`, `Real_jur_exempt.zip`, `Code_description_real.zip`, `Hearing_files.zip` | https://download.hcad.org/data/CAMA/2026/ (page: https://hcad.org/pdata/pdata-property-downloads.html) | ZIP of tab-delimited TXT | Weekly (2026 files modified Nov 9, 2026); preliminary and certified values; years 2005–2026 | robots.txt: `Crawl-Delay: 3`. Page says data needs formatting and HCAD "does not offer technical assistance" | Direct download (no login) | Codebook PDF (`/assets/uploads/pdf/pdataCodebook.pdf`) not re-opened. Deeds have no prices (non-disclosure state) |
| Harris | ↳ contents verified by reading the zip directories | `real_acct.txt` (890 MB), `owners`, `deeds`, `permits`, `parcel_tieback`; `building_res`, `building_other`, `land`, `land_ag`, `extra_features*`, `structural_elem*`, `fixtures`, `exterior`; `jur_value`, `jur_exempt`, `jur_exempt_cd`, `jur_tax_dist_exempt_value_rate`; 26 code tables incl. `desc_r_12_real_jurisdictions` | | | | | Account → jurisdictions in `jur_value` / `jur_exempt`; rates per jurisdiction in `jur_tax_dist_exempt_value_rate` (name only so far: confirm contents in Phase 3) |
| Harris | Parcel geometry | https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0 (`HCAD_NUM`) | ArcGIS REST | Current | Public | API (already used) | Current year only |
| Harris | Tax office rates page | https://www.hctax.net/Property/JurisdictionTaxRates | HTML | Yearly | robots.txt allows | Page | Not needed if HCAD's rate file holds the rates; content not parsed |
| Fort Bend | Certified and supplement exports ("Orion"), with layout | https://www.fbcad.org/certified-and-supplements-reports/ e.g. `/wp-content/uploads/2026/08/2026_07_07_1746-Orion-2026-Certified-Export-Redacted.zip` (59 MB) | ZIP of TXT: `PropertyExport`, `OwnerExport`, `EntityExport`, `ExemptionExport`, `AgentExport`, `MobileHomeExport` + `Orion Appraisal Export Layout.xlsx` | Preliminary exports Mar–Jun, certified early July, supplements about monthly (2026: Sup 1–4 posted Jul–Oct). Certified exports for 2023–2025 re-posted Aug 2026 | "Redacted" (confidential owners withheld per Tax Code ch. 25); public access policy PDF linked. robots.txt allows | Direct download | Layout file is in the zip; not yet read |
| Fort Bend | Monthly property data export | same page, e.g. `/wp-content/uploads/2026/10/October2026-PropertyDataExport.zip` (163 MB) | ZIP of TXT: property, owner, land, improvement, **segments** (313 MB), **sales** (95 MB) | Monthly | Same | Direct download | No layout in this zip (use the Orion layout and check). Sales file contents (price or not) not checked |
| Fort Bend | Tax rates | https://www.fbcad.org/tax-rates/ (`2022TaxRates.xlsx`, `TaxRates2023-v2.xlsx`, `2024-TaxRate-Feb.xls`) | XLSX/XLS | Yearly | Public | Direct download | No 2025 file linked; the Comptroller file covers it |
| Fort Bend | Parcel geometry | https://fbcad-open-data-hub-fortbend.hub.arcgis.com/ ; https://gisweb.fortbendcountytx.gov/arcgis/rest/services/InteractiveMap/Parcels/MapServer | ArcGIS / hub download | Not verified | Not verified | Download / API | Account field name not checked; StratMap also covers Fort Bend |
| Montgomery | Appraisal roll | https://mcad-tx.org/ (True Prodigy portal) | — | — | No robots.txt (single-page app) | **Needs PIA request** | No public download found in the site or its app code. Montgomery's linked document library holds board documents only |
| Montgomery | Tax rates | https://cms2.revize.com/revize/montgomerytax/Document%20Center/Property/2026%20Rates-2026%20Exemptions.pdf (85 KB, Oct 2, 2026); history: https://mctotx.org/tax_rate_history/index.php | PDF / HTML | Yearly | Public | Direct download | PDF needs parsing; 2026 rates published here a year before the Comptroller file |
| Montgomery | Parcel geometry | StratMap (already used) | | | | | No district layer found |
| Waller | Certified totals, entity tax rates (by year) | https://waller-cad.org/certified-totals-exemptions/ (e.g. `/wp-content/uploads/2026/03/2025-tax-rates.pdf`, `/2026/08/2026-cert-totals.pdf`) | PDF (2025 rates: text; 2024 rates: scanned image) | Yearly | robots.txt allows | Direct download | **No roll export. Needs PIA request** for the appraisal export |
| Waller | Parcel layer (BIS) | https://services3.arcgis.com/KKhSlBnH1Rm0YK62/arcgis/rest/services/WallerCADWebService/FeatureServer/0 | ArcGIS REST (max 2,000 rows a page) | Current year only (now **2027**, 54,251 parcels) | Public | API (already used) | Fields: owner, situs, legal, acreage, land/impr/market value, deed date/volume/page, **school, city, county codes only**. No improvement detail, no exemptions, no ESD/MUD codes, no history |
| Waller | Property search | https://esearch.waller-cad.org/ | Web | — | **robots.txt disallows `/Property/` and `/Search/`** | Do not automate | Use only by hand |
| Austin | Truth-in-taxation data, rate worksheets per unit | https://austincad.org/tnt-data/ ; summary https://austincad.org/wp-content/uploads/2026/11/Truth-In-Taxation-Summary-2026-PDF.pdf | PDF | Yearly | robots.txt allows | Direct download | **No roll export. Needs PIA request** |
| Austin | Parcel layer (BIS) | https://services7.arcgis.com/rNakmFefTO1XjYg4/arcgis/rest/services/AustinCADWebService/FeatureServer/0 | ArcGIS REST | Current year only (now 2027, 22,648 parcels) | Public | API (already used) | Same gaps as Waller |
| Washington | Certified and preliminary appraisal rolls (PACS appraisal export, layout 8.0.33 included) | https://washingtoncad.org/downloads/ e.g. `/wp-content/uploads/2026/07/2026-Certified-Appraisal-Roll.zip` (27 MB) | ZIP of fixed-width TXT: `APPRAISAL_INFO`, `ENTITY_INFO`, `ENTITY`, `IMPROVEMENT_INFO`, `IMPROVEMENT_DETAIL(_ATTR)`, `LAND_DETAIL`, `STATE_CODE`, `ABSTRACT_SUBDV`, `MOBILE_HOME_INFO`, … + `Appraisal Export Layout - 8.0.33.xlsx` | Preliminary (Apr), certified (Jul); only the current year is linked | robots.txt allows | Direct download | Only current-year files linked: archive each year when posted. Code definitions PDF on the same page |
| Washington | Parcel shapefile and BIS layer | `/wp-content/uploads/2026/07/GIS-Mapping-Data.zip` (Parcels.shp); https://services3.arcgis.com/42lb4t0mpCcD1zg8/arcgis/rest/services/WashingtonCADMatixService/FeatureServer/0 | Shapefile / ArcGIS REST | Yearly / current (2027, 23,965 parcels) | Public | Direct download / API | Layer also carries `esdcode`, `entitycd`, `exemption`, `statecode`, `livarea` |
| Washington | Tax rates, taxing units, truth-in-taxation | https://washingtoncad.org/tax-rates/ , `/taxing-units/` , `/truth-in-taxation/` | HTML/PDF | Yearly | Public | Page | Not parsed |
| Grimes | Certified roll, 2006–2026 | https://grimescad.org/General-Information/Appraisal-Data/Appraisal-Roll (e.g. `/Portals/0/Documents/Appraisal Roll/2026 Certified Roll.txt`, 93 MB, Sep 10, 2026) | **Printed report as text** (page headers, owner/legal/exemption/value blocks) | Yearly at certification | robots.txt allows | Direct download | Parseable but brittle; no improvement detail (year built, sq ft, units) and no entity list per account. A structured export needs a PIA request |
| Grimes | Tax rates, taxing units, truth-in-taxation | https://grimescad.org/General-Information/Tax-Rates , `/Taxing-Units` , `/Truth-in-Taxation` | HTML | Yearly | Public | Page | Pages render their tables by script; content not read |
| Grimes | Parcel layer (BIS) | https://services8.arcgis.com/fpr21jaV02YtR7tv/arcgis/rest/services/GrimesCADWebService/FeatureServer/0 | ArcGIS REST | Current (2026, 27,316 parcels) | Public | API (already used) | Same gaps as Waller |

Truth-in-Taxation sites (Tax Code §26.17): every county's links from https://texas.gov/PropertyTaxes. Seen: Austin uses
https://texastaxtransparency.com/austin (not opened). These are per-parcel lookups with no bulk download seen, so the
plan doesn't depend on them.

## Formats, in short

| County | Vendor / format | Account key | Improvement detail | Account → units | Exemptions |
|---|---|---|---|---|---|
| Harris | HCAD's own tab-delimited files | `acct` (13 digits) = `HCAD_NUM` | Yes (`building_res`, `building_other`, `structural_elem*`) | Yes (`jur_value`) | Yes (`jur_exempt`) |
| Fort Bend | Orion export (layout in zip) | property ID (to confirm against StratMap `PROP_ID`) | Yes (segments, improvement files) | Yes (`EntityExport`) | Yes (`ExemptionExport`) |
| Washington | PACS appraisal export 8.0.33 | `prop_id` | Yes | Yes (`ENTITY_INFO`) | In `APPRAISAL_INFO` |
| Grimes | Printed report text | `PID` (e.g. R79106) + geo ID | No | No | Exemption codes per account |
| Waller, Austin | BIS (PACS-style); nothing published | `prop_id` | Via PIA | Via PIA | Via PIA |
| Montgomery | True Prodigy; nothing published | — | Via PIA | Via PIA | Via PIA |

## Parcel → taxing units → rates

1. The account's units come from the roll export (Harris `jur_value`, Fort Bend `EntityExport`, Washington `ENTITY_INFO`).
   Each CAD uses its own short codes (Waller: `GWA` county, `RFM` county farm-to-market/flood fund, `CWR` City of
   Waller, `SWR` Waller ISD, `ESD` Waller-Harris ESD 200, `WCM18` …).
2. Rates by year come from the Comptroller file, keyed on the Comptroller unit ID (`CCC-NNN-TT`), and from the CAD's
   own yearly rate table for the current year.
3. A **crosswalk** from CAD code to Comptroller unit ID is needed per county (e.g. Waller `CWR` → `237-104-03`). It can
   be built from names once and kept in the repo; about 60 units for Waller.
4. Counties are split into general fund, road & bridge and FMFC rates in the Comptroller's county file. Waller's
   `RFM` code is that FMFC fund (0.023591), which the CAD lists as its own entity code.

## Sources disagree: pick one per field

The Comptroller and Waller CAD 2025 tables differ for several units (Comptroller vs CAD): Harris-Waller MUD 2
0.68 vs 0.65; Katy West MUD 0.40 vs 0.80; Waller County MUD 9B 0.62525 vs 0.74. The county, city and ISD rates agree.
Proposal: the CAD's adopted table is primary for its own year, the Comptroller file is the statewide fallback and
history, and the loader records both with their source and flags any difference over 0.0001.

## Test case: Waller CAD account 265550 (Green Gardens)

Verified from the Waller parcel layer on 2026-11-12:

- Owner WALLER PENICK PROPERTIES LLC; 2414 Reinke Road, Waller 77484; 6.1774 acres; geo ID 859950-000-001-000.
- **Record year 2027** (`owner_tax_yr` 2027, next appraisal Jan 1, 2027). Market value $19,622,330 (land $1,062,360,
  improvements $18,559,970). This is the 2027 working record; whether it equals the 2026 certified value can't be told
  from the layer.
- Units on the layer: county `GWA`, city `CWR`, school `SWR`. ESD and other special units aren't in the layer.
- **2026 certified value: not publicly available in bulk.** Waller posts no roll export, and its property search
  forbids automated access. It comes with the PIA response, or by hand from the property search.

The combined rate you gave (2.065962%) doesn't match either year exactly:

| Year | County (incl. FMFC) | City of Waller | Waller ISD | Waller-Harris ESD 200 | County + city + ISD | + ESD 200 |
|---|---|---|---|---|---|---|
| 2023 | 0.490883 | 0.4904 | 1.1092 | 0.086301 | 2.090483 | 2.176784 |
| 2024 | 0.495978 | 0.3664 | 1.1069 | 0.096641 | 1.969278 | **2.065919** |
| 2025 | 0.556187 | 0.4464 | 1.0626 | 0.1 | **2.065187** | 2.165187 |

(Comptroller files; 2025 also matches Waller CAD's own 2025 table to the sixth decimal.) The closest are 2024 with ESD
200 (0.000043 off) and 2025 without it (0.000775 off). Which is right depends on whether the parcel is inside
Waller-Harris ESD 200, which needs the account's full entity list (PIA response or the property page by hand).

## Draft Public Information Act request (Waller, Austin, Montgomery; Grimes for a structured export)

> To: Officer for Public Information, [Waller County Appraisal District / Austin County Appraisal District /
> Montgomery Central Appraisal District / Grimes Central Appraisal District]
>
> Under the Texas Public Information Act, Government Code Chapter 552, I request copies of the following, in electronic
> form (the district's standard appraisal export, e.g. the PACS / True Prodigy appraisal export or tab-delimited text,
> with its file layout document):
>
> 1. The certified appraisal roll for tax years 2025 and 2026, and each supplement to date, for real property: property
>    and owner records, situs and legal description, state codes, land detail, improvement detail (year built, class,
>    square feet, stories, units and segments), market, appraised and taxable values, exemptions, and the taxing units
>    (entities) for each account.
> 2. The 2026 preliminary roll, if kept as a separate export.
> 3. The code tables needed to read the above (state codes, improvement classes, entity codes and names, exemption codes).
> 4. The district's GIS parcel layer with the account number, if not already published.
>
> Confidential information under Tax Code §25.025 and §22.27 may be redacted. If the cost will exceed $40, please send
> an estimate first (Gov't Code §552.2615). Electronic delivery by email or download link is preferred.
>
> [Name, organization, mailing address, email, phone]

Send one per district (each district has its own officer). Expect 10 business days, or a cost estimate.

## What was not verified

- Fort Bend's and Washington's layout files were listed but not read; HCAD's codebook not re-opened. Read them in Phase 3.
- Whether HCAD's `jur_tax_dist_exempt_value_rate.txt` and Fort Bend's sales file contain what their names suggest.
- Montgomery's True Prodigy API (`prod-container.trueprodigyapi.com`) and its "reports" page: not opened.
- Grimes, Washington and Fort Bend rate pages render by script; their tables weren't read (the Comptroller file covers
  them).
- Terms of use beyond robots.txt and the notes quoted above: none of the districts posts data-specific license terms;
  appraisal records are public information under Tax Code ch. 25 and Gov't Code ch. 552.
- Fort Bend's and Montgomery's district GIS account fields.

## Network hosts the loaders need

The loaders run in GitHub Actions (open network), like the existing county-data job. For cloud sessions that test
them, the session environment needs: comptroller.texas.gov, download.hcad.org, hcad.org, www.fbcad.org,
washingtoncad.org, grimescad.org, waller-cad.org, austincad.org, cms2.revize.com, mctotx.org, and the BIS ArcGIS hosts
(services3/7/8.arcgis.com).
