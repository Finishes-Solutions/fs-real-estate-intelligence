# the owner — AI Site-Planning Guardrails

**City of Waller / Harris County Basis · Conceptual Planning Standard**

Residential | Multifamily | Commercial | Retail | Industrial | Storage | Mixed Use

| | |
|---|---|
| Document owner | the owner |
| Version | 1.0 |
| Effective date | October 18, 2026 |
| Status | For feasibility and AI-assisted conceptual planning only. This standard does not replace a current survey, title report, civil engineering, architecture, fire review, accessibility review, flood study, utility confirmation, permit review, or approval by the authority having jurisdiction. |

> Reference copy, converted from the owner's Word document ("the owner — AI Site-Planning Guardrails, City of Waller / Harris County Basis, v1.0, Oct 18 2026"). The app applies it through `lib/guardrails.mjs` to sites inside the City of Waller's limits or within its extraterritorial jurisdiction (taken as 0.5 mile past the limits, unverified). The wording below is the document's.

## 01 Purpose, scope and core rule

This guideline establishes conservative instructions for AI software that generates preliminary site maps and site plans for the owner projects in and around the City of Waller, Texas. It is designed to protect feasibility decisions from false precision, stale requirements and density-first layouts.

**Primary rule.** The AI must design in this order: jurisdictional compliance; flood and drainage protection; fire and life safety; access and circulation; utility feasibility; setbacks and buffers; parking and loading; constructability; marketable configuration; then density and economic yield.

### Applicable project types

- Single-family residential and townhomes
- Multifamily residential
- Commercial, office and mixed-use
- Retail and convenience/fuel uses
- Industrial, flex and warehouse
- Self-storage and related storage buildings
- Other uses only after use-specific requirements are verified

### Non-negotiable operating rules

- Never maximize density before resolving drainage, fire access, roads, utilities and title constraints.
- Never treat an AI layout as permit-ready, construction-ready, engineered, approved or code-compliant.
- Never carry requirements from one site to another without confirming jurisdiction, roadway authority, drainage outfall and applicable agreements.
- When two requirements conflict, apply the more restrictive one until the conflict is resolved in writing.

## 02 Source hierarchy and data classification

### Pre-design jurisdiction checklist

- City limits, extraterritorial jurisdiction or unincorporated area
- Governing municipality and county
- Roadway authority for each frontage and driveway
- Drainage authority and receiving system
- Current FEMA flood designation
- Water, sanitary sewer and electric providers
- Recorded easements, pipelines and right-of-way
- Development agreement, planned-development approval or deed restrictions
- Current adopted building, fire and accessibility standards

### Required classification on every input and output

| Classification | Meaning |
|---|---|
| VERIFIED REQUIREMENT | Supported by a current ordinance, adopted criterion, written agency direction or project-specific approval. |
| OWNER GUARDRAIL | A the owner risk-control requirement that is more conservative than the verified minimum. |
| ENGINEERING ASSUMPTION | A preliminary design assumption requiring validation by the responsible licensed professional. |
| UNVERIFIED | Unknown, incomplete, conflicting or awaiting confirmation. The AI must not claim compliance. |

**Truth control.** The AI must separate facts from assumptions. Any unresolved item that can materially change yield, cost, access, drainage or approval must appear in the unresolved-risk list.

## 03 Risk-adjustment logic

The requested 3% to 5% safety allowance must be directional. Adding 5% to a minimum clearance can be conservative. Adding 5% to a maximum discharge, maximum height or maximum impervious cover can create noncompliance.

| Criterion type | AI treatment | Example | Result |
|---|---|---|---|
| Minimum | Multiply by 1.05 and round upward where practical. | 25-ft setback | 26.25-ft target |
| Maximum | Target 3%-5% below the verified maximum. | Maximum impervious cover | Do not exceed; hold reserve below cap |
| Count | Multiply minimum count by 1.03-1.05 and round up. | 100 required stalls | 103-105 target stalls |
| Prohibition | No safety-factor math. Preserve the prohibition. | No building in floodway | No building shown |
| Calculated value | Use project-specific calculation and add contingency only when professionally appropriate. | Detention storage | Use higher of guardrail or calculated need |

**Default Finishes factor.** Use 5% above verified minimum dimensions and minimum counts unless the owner approves a lower factor for feasibility testing. Also display the legal-minimum scenario separately so decision-makers can see the cost of the risk reserve.

## 04 Detention and drainage guardrails

**Finishes default.** Reserve detention storage at not less than 1.00 acre-foot per developed acre for initial Waller-area feasibility. Never reduce this default without documented civil-engineer and jurisdictional confirmation.

### Verified project basis currently on file

- Internal Waller due diligence states 0.75 acre-foot per acre when outfall is to a public underground storm system and 1.0 acre-foot per acre when outfall is to a roadside ditch system.
- The FS002 drainage report applies 1.0 acre-foot per acre for a Harris County roadside-ditch outfall.

### AI calculation rules

- Treat acre-foot as storage volume, not pond surface acreage.
- Calculate pond footprint from the proposed stage-storage relationship, average storage depth, side slopes, freeboard, maintenance access, outfall structure, emergency overflow and grading limits.
- Use the greater of: Finishes default, authority requirement, project drainage study, floodplain requirement or development agreement.
- Identify the receiving system: underground storm sewer, roadside ditch, channel, detention system or other approved facility.
- If outfall capacity is unknown, label it UNVERIFIED and do not assume discharge capacity.
- Never count required detention land simultaneously as buildable area unless the configuration is specifically designed and approved for dual use.

**Required output.** Show developed acreage, required storage volume, assumed average storage depth, estimated pond footprint, side-slope/freeboard reserve, outfall direction, allowable-release status and source classification.

## 05 Floodplain, floodway and topography

- Identify the effective FEMA flood designation before accepting a yield.
- Separate mapped floodplain, regulatory floodway and other drainage constraints.
- Reserve affected land until current topography, flood study, compensating storage and jurisdictional requirements are established.
- Do not place a building in a regulatory floodway to preserve density.
- Do not assume elevation alone resolves floodway, access, compensating-storage or drainage impacts.
- Maintain an all-weather emergency access concept that remains viable under the governing flood criteria.

**Stop condition.** If floodplain or floodway data is missing, conflicting or appears stale, the AI must produce only a preliminary constraint map and conservative range. It must not certify the affected land as developable.

## 06 Residential and multifamily controls

### Published City of Waller single-family baseline

| Item | Published baseline | Finishes target | Classification |
|---|---|---|---|
| Lot width | 57 ft | 59 ft where practical | Baseline verified; target owner guardrail |
| Lot depth | 114 ft | 118 ft where practical | Baseline verified; target owner guardrail |
| Calculated lot area | 6,498 sq ft | 6,962 sq ft at 59 x 118 | Calculated from dimensions |
| Front setback | 25 ft | 26.25 ft | Baseline published; target owner guardrail |
| Rear setback | 10 ft | 10.5 ft | Baseline published; target owner guardrail |
| Interior side | 5 ft | 5.25 ft | Baseline published; target owner guardrail |
| Corner side | 15 ft | 15.75 ft | Baseline published; target owner guardrail |

### Multifamily requirements

- Carry at least two off-street spaces per dwelling unit as the published Waller baseline, then verify current project-specific requirements.
- Allocate buildings, parking, accessible routes, fire lanes, emergency access, sidewalks, refuse, mail/package facilities, utilities, detention, drainage, setbacks, buffers and amenity/open space before accepting unit count.
- Do not report theoretical building density as achievable unit count. The unit count is accepted only after all site systems fit simultaneously.
- Do not automatically apply single-family setbacks to multifamily. Verify the controlling requirement.

## 07 Access, circulation, parking and fire

### Roadway and driveway controls

- Identify City of Waller, Harris County, TxDOT or other authority for every proposed connection.
- Verify driveway width, spacing, intersection separation, median restrictions, sight distance, deceleration needs and permit path.
- Use the actual design vehicle for turning analysis.
- Separate passenger, emergency, delivery, refuse and heavy-truck movements where practicable.
- Do not count existing or proposed public right-of-way as buildable property.

### Parking logic

- Calculate the verified legal minimum for the actual use.
- Apply a 3%-5% Finishes stall-count reserve and round up.
- Never reduce required accessible parking or accessible-route requirements.
- For retail, office, industrial, self-storage and mixed-use, mark the parking ratio UNVERIFIED until the controlling ratio is confirmed.
- Do not assume shared parking unless specifically permitted and supported.

### Fire and emergency access

- Reserve fire apparatus access, fire lanes, hydrants, emergency turning and building access before maximizing footprint.
- Do not rely on parking spaces being empty for emergency maneuvering.
- Use the current City-adopted fire/building codes and current fire-review direction.

## 08 Utilities, easements and right-of-way

### Utility validation

| System | AI must identify | Stop condition |
|---|---|---|
| Water | Provider, line location/size, point of connection, capacity and fire flow. | Existing line does not prove available capacity. |
| Sanitary | Provider, line location/size, point of connection, capacity and lift/pump need. | No density certification without capacity confirmation. |
| Electric/gas/data | Provider, corridor, easements, transformers/meters and conflicts. | Do not place buildings over unknown corridors. |
| Storm/outfall | Receiving facility, elevation, capacity, release and easement. | Unknown outfall means conservative reserve and UNVERIFIED status. |

### Title and survey constraints

- Protect recorded utility, drainage, access and pipeline easements.
- Show existing and proposed right-of-way, including future thoroughfare dedication.
- Protect visibility triangles and access restrictions.
- Do not place permanent buildings in constrained areas unless expressly allowed.
- Treat missing current survey or title information as an unresolved material risk.

## 09 Use-specific planning modules

- **Commercial / retail.** Required checks: Customer and employee parking; Accessible parking and route; Loading/delivery and dumpster areas; Fire access and pedestrian conflict control; Signage/visibility zone; Landscape/buffer, utilities and detention.
- **Industrial / flex / warehouse.** Required checks: Employee/visitor parking; Truck courts and loading docks; Trailer storage where applicable; Truck turning independent of parked cars; Emergency access and refuse; Expansion area where requested.
- **Self-storage.** Required checks: Fire access and emergency turning; Gate stacking and access control; Customer parking/loading; Drainage, utilities and detention; Setbacks, landscaping and buffering; Do not double-count drive aisles as parking or detention.
- **Mixed-use.** Required checks: Analyze each use independently first; Test shared access and pedestrian conflicts; Verify parking rather than assuming sharing; Coordinate loading, fire access and utilities; Size detention for ultimate development where infrastructure serves all phases; Protect future construction access and phasing.

## 10 Required AI plan content

Every concept must show or report the following. Missing items must be labeled as unresolved, not silently omitted.

- [ ] Property boundary and gross acreage
- [ ] Road frontage and roadway authority
- [ ] Existing and proposed right-of-way
- [ ] Easements, pipelines and other title constraints
- [ ] Floodplain and floodway
- [ ] Proposed buildings and use labels
- [ ] Setbacks and buffers
- [ ] Parking count and accessible parking
- [ ] Internal vehicle and pedestrian circulation
- [ ] Fire and emergency access
- [ ] Truck/loading movement where applicable
- [ ] Dumpster and service areas
- [ ] Detention location, volume assumption and estimated footprint
- [ ] Drainage direction and outfall status
- [ ] Utility corridors and capacity status
- [ ] Landscape/open-space areas
- [ ] Net developable area
- [ ] Source and classification for each material design assumption

**Graphic label.** REAL ESTATE INTELLIGENCE - AI-ASSISTED CONCEPTUAL SITE PLAN - FOR FEASIBILITY AND PLANNING ONLY - NOT FOR PERMIT OR CONSTRUCTION.

## 11 Yield scenarios and decision report

### Produce three scenarios

- **A. Maximum code envelope:** Uses verified minimum requirements without owner safety factors.
- **B. Base case:** Uses the Finishes detention baseline and 3%-5% directional risk factors.
- **C. Conservative case:** Adds reserves for unresolved drainage, ROW, utilities, easements, flood risk and access.

### Required land-use reconciliation

| Metric | Acres / quantity | Basis / status |
|---|---|---|
| Gross site | | |
| Less existing/proposed ROW | | |
| Less flood/floodway reserve | | |
| Less detention/drainage | | |
| Less easements/pipelines | | |
| Less buffers/setbacks/landscape | | |
| Less road/circulation | | |
| Less parking/loading | | |
| Net usable land | | |
| Residential lots / multifamily units | | |
| Building square feet | | |
| Impervious cover | | |
| Detention volume and footprint | | |

**Decision rule.** The AI must report a range when material inputs are unresolved. It must not collapse uncertainty into one precise yield number.

## 12 Stop conditions and machine rules

### Prohibited AI conclusions

- Permit Ready
- Construction Ready
- Code Compliant
- Approved
- Engineered
- Guaranteed yield
- Utility capacity confirmed, unless written confirmation exists

### Mandatory escalation conditions

- Jurisdiction or roadway authority cannot be determined.
- Current survey, title or easement information is missing.
- Floodplain/floodway data affects the concept.
- Outfall or allowable release is unknown.
- Utility capacity is not documented.
- Fire access or design-vehicle turning fails.
- Two applicable requirements conflict.
- The concept depends on a variance, waiver or unapproved shared facility.

### Required disclaimer

Use this exact concept label:

> AI-ASSISTED CONCEPTUAL SITE PLAN. FOR FEASIBILITY AND PLANNING ONLY. NOT FOR PERMIT OR CONSTRUCTION. FINAL DESIGN IS SUBJECT TO CURRENT SURVEY, TITLE, CIVIL ENGINEERING, ARCHITECTURAL/ENGINEERING REVIEW, FIRE AND ACCESSIBILITY REVIEW, UTILITY CONFIRMATION, FLOODPLAIN ANALYSIS AND APPROVAL BY THE AUTHORITY HAVING JURISDICTION.

## 13 Appendix A — Copy-and-paste AI system instruction

> Use the Waller Site-Planning Guardrails as mandatory constraints. First determine jurisdiction, roadway authority, drainage authority, FEMA flood status, utility providers, title/easement constraints, applicable development agreement and current adopted standards. Classify every material input as VERIFIED REQUIREMENT, OWNER GUARDRAIL, ENGINEERING ASSUMPTION or UNVERIFIED. Apply a 5% upward reserve to minimum dimensions and minimum counts where practical; maintain a 3%-5% buffer below maximum limits; never alter prohibitions. For initial Waller-area feasibility, reserve detention storage at not less than 1.00 acre-foot per developed acre and increase it when project-specific criteria require more. Treat acre-foot as volume, not pond surface area. Do not certify floodplain/floodway land, outfall capacity, utility capacity or title constraints without supporting data. Generate Maximum Code Envelope, Base Case and Conservative Case scenarios. Reconcile gross acreage through ROW, flood reserve, detention, easements, buffers, roads, parking and net usable land. Show buildings, setbacks, parking, accessible routes, circulation, fire access, truck/loading paths, refuse, drainage, outfall, utilities and landscape/open space. Report unresolved risks and do not label any output permit-ready, engineered, approved, construction-ready or code-compliant.

### Recommended software fields

- Project name, address, parcel ID and acreage
- Jurisdiction fields with source date
- Use type and program requirements
- Roadway and access authority
- Flood and drainage inputs
- Utility providers and capacity status
- Owner guardrail factor: default 5%
- Detention baseline: default 1.00 ac-ft/developed acre
- Scenario selector and unresolved-risk register
- Revision log and reviewer approval fields

## 14 Appendix B — Source basis and review controls

This standard incorporates the findings used to prepare the underlying guardrails. Before it is used on a new project, the project team must confirm that later ordinances, development agreements, agency criteria or site-specific conditions have not changed the controlling requirements.

| Source | What it supports | Control note |
|---|---|---|
| City of Waller Ordinance No. 424 | 57 ft x 114 ft published lot dimensions; two off-street spaces per multifamily dwelling unit. | Verify amendments and project-specific applicability. |
| City of Waller Additional Requirements / setback ordinance materials | Published residential front, rear, interior-side and corner-side setbacks. | Do not automatically apply residential values to other uses. |
| City of Waller Permits & Inspections page | Current published adopted building and fire-code information. | Confirm the effective code set at submission. |
| 98 Acres Final DDR Summary / 98 Acres DDR email | Waller project due diligence, drainage distinctions, access, ROW, utilities and permitting risks. | Project-specific report; use as precedent, not universal law. |
| FS002 Drainage Report, Rev. 01 | 1.0 ac-ft/ac roadside-ditch detention basis used for a Waller project. | Final storage remains subject to project calculations and approval. |

### Review cadence

- Project setup: verify jurisdictional and source inputs.
- 30% concept: civil, architectural and fire-access review.
- Before investment approval: reconcile yield, drainage, ROW, utilities and unresolved risks.
- Before permit submission: replace assumptions with current professional design and verified criteria.
- After any ordinance, agency-criteria or development-agreement change: update this controlled guideline.

**Document-control note.** This guide is an owner standard for AI-assisted feasibility. It is intentionally conservative and must be updated when verified requirements change.
