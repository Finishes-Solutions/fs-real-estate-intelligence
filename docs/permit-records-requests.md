# Permit records requests: Waller County and the City of Waller

Neither Waller County (MGO Connect) nor the City of Waller (Bureau Veritas handles reviews) publishes a feed or list of
issued permits, so the app can't load them the way it loads Harris County's. The Texas Public Information Act lets anyone
ask for the records; a standing monthly export is the practical route. Two drafts to send, as email or through the
entity's public information request form. Once the first export arrives, the app's nightly loader gets a reader for its
columns (`build/county-data.mjs`, like `hcad-permits` and `oce-permits`).

## Waller County (unincorporated county: development, driveway and culvert, floodplain, septic / OSSF permits)

To: Waller County Engineer's office (permits) and the County's public information officer (County Judge's office /
County Attorney). Portal: MGO Connect, jurisdiction "Texas - Waller County".

> Subject: Public information request: permit records (Texas Government Code ch. 552)
>
> Under the Texas Public Information Act, I request an electronic copy of the county's permit records from the MGO
> Connect (My Government Online) system for permits applied for or issued from January 1, 2020 to the present,
> including: permit number, permit type and subtype, project description, status, application date, issued date,
> final / closed date, site address, legal description or appraisal district property ID (R number), applicant or
> contractor company name, and permit valuation where recorded. Please provide the data as a spreadsheet or CSV export
> rather than scanned documents; MGO Connect can export its permit list. I am not requesting phone numbers, email
> addresses or other personal contact details, which may be left out.
>
> If the county can provide this as a recurring monthly export (the same fields for the prior month), please let me
> know what arrangement works; otherwise I will submit a request each month.
>
> If any part of the request would exceed the cost thresholds in §552.2615, please send an itemized estimate before
> doing the work. Thank you.
>
> [Name, Finishes Solutions, address, phone, email]

## City of Waller (inside the city limits: building, trade, sign, demolition and occupancy permits)

To: City Secretary, City of Waller, 1218 Farr Street, Waller, TX 77484, with a copy to permits@wallertexas.gov
(936-372-3880). Plan review and inspections are by Bureau Veritas North America under a professional services
agreement; the records belong to the city.

> Subject: Public information request: building permit records (Texas Government Code ch. 552)
>
> Under the Texas Public Information Act, I request an electronic copy of the City of Waller's building permit records
> for permits applied for or issued from January 1, 2020 to the present: permit number, permit type (building,
> electrical, plumbing, mechanical, sign, demolition, certificate of occupancy, etc.), project description, status,
> application and issued dates, site address, applicant or contractor company name, and declared valuation where
> recorded. A spreadsheet or CSV export from the city's or Bureau Veritas's permit system is preferred over scanned
> applications. Phone numbers, email addresses and other personal contact details may be left out.
>
> If a monthly permit report is already produced for council or the building official, that report for each month since
> January 2020, and a copy each month going forward, would satisfy this request.
>
> If any part of the request would exceed the cost thresholds in §552.2615, please send an itemized estimate first.
> Thank you.
>
> [Name, Finishes Solutions, address, phone, email]

## When the files arrive

Save them under a private folder (not this repository: they may hold names), note the column headings, and the loader
reader is a half-day of work: one row per permit, `kind: 'permit'`, `source: 'waller-county-permits'` or
`'waller-city-permits'`, placed on the appraisal district parcel by R number (Waller CAD's layer already answers APN
lookups in `lib/mcp/resolve.mjs`) or geocoded by address.
