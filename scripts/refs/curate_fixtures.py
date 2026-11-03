"""Hand-curated reference fixtures: every value below was read during review (rendered page or text
layer) and carries its source page, method, confidence and review status. Re-running rewrites
data/reference/projects/<ID>.json and looks sha256 up from the library inventory.
usage: python -I curate_fixtures.py REPO_DIR   (REI_REF_LIB set or default library path)
"""
import json, os, sys
sys.path.insert(0, os.path.join(sys.argv[1], "scripts", "refs"))
from refs_common import lib_root, resolve_documents

REPO = sys.argv[1]
LIB = lib_root()
_, DOCS = resolve_documents(LIB)
SHA = {d["file"]: d["sha256"] for d in DOCS}
O = "01_Original_Collection/plans/"
E = "02_Expanded_Collection/plans/"

VR, TO = "visually-reviewed", "text-only"


def V(v, units, f, p, sheet=None, m="printed-schedule", c="high", s="extracted", r=VR, note=None):
    o = {"v": v, "units": units, "src": {"file": f, "page": p, "sheet": sheet}, "method": m,
         "confidence": c, "status": s, "review": r}
    if s == "derived" and m == "printed-schedule":
        o["method"] = "derived"
    if note:
        o["note"] = note
    return o


def D(v, units, f, p, sheet=None, note=None, c="high", r=VR):
    return V(v, units, f, p, sheet, "derived", c, "derived", r, note)


def U(units=None, note=None):
    o = {"v": None, "units": units, "src": None, "method": None, "confidence": None, "status": "unknown", "review": None}
    if note:
        o["note"] = note
    return o


def doc(f, pages, sheets):
    return {"file": f, "sha256": SHA[f], "pages_used": pages,
            "sheets": [dict(zip(["page", "sheet", "title", "revision", "date"], s)) for s in sheets]}


def rule(r, v, u, note="project-specific, not universal"):
    return {"rule": r, "value": v, "units": u, "note": note}


def rec(check, values, result, note=""):
    return {"check": check, "values": values, "result": result, "note": note}


def bldg(type_id, label, count, floors, shape, w, d, area, upb, upf, mix, corridor, stairs, elev, parking, gsf, **kw):
    b = {"type_id": type_id, "label": label, "count": count, "floors": floors, "shape": shape,
         "footprint": {"w_ft": w, "d_ft": d, "area_sf": area}, "units_per_building": upb,
         "units_per_floor": upf, "unit_mix": mix, "corridor": corridor, "stairs": stairs,
         "elevators": elev, "parking": parking, "gsf": gsf}
    b.update(kw)
    return b


def ut(name, beds, baths, sf, count):
    return {"name": name, "beds": beds, "baths": baths, "sf": sf, "count": count}


P = {}

# ---------------------------------------------------------------- P01 Artisan Village
f = O + "P01_Artisan_Village/001_Artisan_Village.pdf"
S1 = "MFD-19-002 site plan"
P["P01"] = dict(
    name="Artisan Village", location="Fort Worth, TX", family="fw-artisan-village", partition="dev",
    forms=["garden-breezeway", "garage-detached"], overlays=[],
    documents=[doc(f, [1, 2], [(1, S1, "Site plan (Monterra by Hillwood Lot 3R Block 2)", "approved", "2019-10-15"),
                               (2, "A1-02", "Addressing plan (375 apartments)", "rev 2019-10-16", "2019-05-01")])],
    site={
        "area_ac": V(18.589, "ac", f, 1, S1), "area_sf": V(809739, "sf", f, 1, S1),
        "units": V(375, "units", f, 1, S1),
        "density_du_ac": V(20, "du/ac", f, 1, S1, note="printed 'units per acre actual'; 375/18.589 = 20.17"),
        "zoning": V("PD 710", None, f, 1, S1, m="text-search", r=TO),
        "max_units_pd": V(1026, "units", f, 1, S1, m="text-search", r=TO, note="max in PD boundary, not this lot"),
        "building_coverage_sf": V(213010, "sf", f, 1, S1, note="first-floor impervious, 26.3%"),
        "paving_sf": V(268072, "sf", f, 1, S1, note="33.1%"),
        "open_space_sf": V(254688, "sf", f, 1, S1, note="31.4% (20% required)"),
        "max_height_ft": V(45, "ft", f, 1, S1, note="slab to top plate; actual 30'-5\""),
        "total_gsf": V(522871, "sf", f, 1, S1),
        "buildings": V(17, "buildings", f, 1, S1, note="16 residential + leasing/clubhouse"),
    },
    buildings=[
        bldg("A", "Type A, L-shape 3-story", V(2, "bldg", f, 1, S1), V(3, "floors", f, 1, S1, c="medium", note="heights 30'-4 7/8\""),
             "L", V(222.38, "ft", f, 1, S1, m="printed-dimension", note="long leg; other leg 200.79"), V(88.67, "ft", f, 1, S1, m="printed-dimension"),
             U("sf", "dims include breezeways/balconies; see reconciliation"), V(50, "units", f, 1, S1), D(16.7, "units/floor", f, 1, S1, "50/3, uneven"),
             {"1BR": 25, "2BR": 25}, "breezeway (open stairs)", U(), U(), "surface + detached garages", V(70694, "sf", f, 1, S1)),
        bldg("B", "Type B bar 3-story", V(5, "bldg", f, 1, S1), V(3, "floors", f, 1, S1, c="medium"), "bar",
             V(187.54, "ft", f, 1, S1, m="printed-dimension"), V(79.08, "ft", f, 1, S1, m="printed-dimension"), U("sf"),
             V(30, "units", f, 1, S1), D(10, "units/floor", f, 1, S1), {"1BR": 24, "2BR": 6}, "breezeway (open stairs)", U(), U(),
             "surface", V(36580, "sf", f, 1, S1)),
        bldg("C", "Type C bar 3-story", V(2, "bldg", f, 1, S1), V(3, "floors", f, 1, S1, c="medium"), "bar",
             V(186.04, "ft", f, 1, S1, m="printed-dimension"), V(85.25, "ft", f, 1, S1, m="printed-dimension"), U("sf"),
             V(28, "units", f, 1, S1), U(), {"1BR": 20, "2BR": 8}, "breezeway (open stairs)", U(), U(), "surface", V(38316, "sf", f, 1, S1)),
        bldg("D", "Type D 2-story", V(4, "bldg", f, 1, S1), V(2, "floors", f, 1, S1, c="medium", note="height 19'-9\""), "bar",
             V(173.13, "ft", f, 1, S1, m="printed-dimension"), V(54.92, "ft", f, 1, S1, m="printed-dimension"), U("sf"),
             V(6, "units", f, 1, S1), U(), {"2BR": 4, "3BR": 2}, U(note="not determinable from site plan"), U(), U(),
             U(note="12,718 sf for 6 units suggests garages in building; unconfirmed"), V(12718, "sf", f, 1, S1)),
        bldg("E", "Type E 2-story", V(2, "bldg", f, 1, S1), V(2, "floors", f, 1, S1, c="medium"), "bar",
             V(173.13, "ft", f, 1, S1, m="printed-dimension"), V(54.92, "ft", f, 1, S1, m="printed-dimension"), U("sf"),
             V(6, "units", f, 1, S1), U(), {"2BR": 6}, U(), U(), U(), U(), V(12284, "sf", f, 1, S1)),
        bldg("F", "Type F 3-story", V(1, "bldg", f, 1, S1), V(3, "floors", f, 1, S1, c="medium"), "bar",
             V(186.04, "ft", f, 1, S1, m="printed-dimension"), V(85.25, "ft", f, 1, S1, m="printed-dimension"), U("sf"),
             V(33, "units", f, 1, S1), D(11, "units/floor", f, 1, S1), {"1BR": 24, "2BR": 9}, "breezeway (open stairs)", U(), U(), "surface", V(38316, "sf", f, 1, S1)),
        bldg("LEASING", "Leasing / clubhouse", V(1, "bldg", f, 1, S1), U(), "bar", V(155.79, "ft", f, 1, S1, m="printed-dimension"),
             V(64.92, "ft", f, 1, S1, m="printed-dimension"), U("sf"), V(0, "units", f, 1, S1), None, {}, None, None, None, None, V(8195, "sf", f, 1, S1)),
    ],
    unit_types=[ut("1BR", 1, None, None, V(234, "units", f, 1, S1)), ut("2BR", 2, None, None, V(133, "units", f, 1, S1)),
                ut("3BR", 3, None, None, V(8, "units", f, 1, S1))],
    parking={"provided": V(626, "stalls", f, 1, S1), "required": V(557, "stalls", f, 1, S1),
             "surface_regular": V(421, "stalls", f, 1, S1), "garage": V(188, "stalls", f, 1, S1),
             "ada": V(17, "stalls", f, 1, S1, note="13 standard + 4 garage"),
             "ratio_per_unit": D(1.67, "stalls/unit", f, 1, S1, "626/375"),
             "stall_w_ft": V(9, "ft", f, 1, S1, m="printed-dimension"), "stall_d_ft": V(18, "ft", f, 1, S1, m="printed-dimension"),
             "drive_aisle_ft": V(24, "ft", f, 1, S1, m="printed-dimension"), "type": "surface + detached garages + carports"},
    amenities=["pool (3,732 sf)", "leasing/clubhouse (8,195 sf indoor rec)", "dog parks", "carports"],
    access=["Monterra Blvd", "N Riverside Dr", "private drives (Tenon Dr, Batten Cir, Crafters Loop, Artera Dr)"],
    project_rules=[rule("building setback north/west", 10, "ft"), rule("max building setback Monterra Blvd", 20, "ft"),
                   rule("min building setback N Riverside Dr", 60, "ft"), rule("emergency access easement width", 26, "ft"),
                   rule("max height slab to top plate", 45, "ft"), rule("min open space", 20, "% of site")],
    reconciliation=[
        rec("unit mix sum vs total", "234+133+8=375 vs 375", "consistent"),
        rec("units by building type", "2x50+5x30+2x28+4x6+2x6+1x33=375", "consistent"),
        rec("GSF by type x count vs total", "sum=522,871 vs 522,871", "consistent"),
        rec("parking components", "421+188+17=626", "consistent"),
        rec("printed bar dims vs GSF/floor", "B: 187.54x79.08=14,831 sf vs 36,580/3=12,193 sf", "discrepancy",
            "printed outline dims likely include breezeways/balconies; do not use w x d as gross floor area"),
        rec("address plan count", "A1-02 title 375 apartments; address labels 374 noted in review", "discrepancy", "minor; unverified"),
    ],
    open_questions=["Type D/E function (garages below units?)", "stair counts per building", "unit sizes not on site plan"],
)

# ---------------------------------------------------------------- P06 Landing at 2EightySeven
f = O + "P06_Landing_at_2EightySeven/001_Landing_at_2EightySeven.pdf"
S3, S2 = "A0.5", "L0.1"
P["P06"] = dict(
    name="Landing at 2EightySeven", location="Fort Worth (Haslet area), TX", family="fw-landing-287", partition="dev",
    forms=["garden-breezeway", "garage-detached"], overlays=[],
    documents=[doc(f, [2, 3], [(3, S3, "Site layout & unit identification plan (MFD-20-010)", "approved 2021-01-04", "2020-10-14"),
                               (2, S2, "Phase II as-developed landscape / urban forestry plan", None, "2020-12-04")])],
    site={"area_gross_ac": V(26.3939, "ac", f, 2, S2, m="text-search", r=TO), "area_net_ac": V(25.7062, "ac", f, 2, S2, m="text-search", r=TO),
          "lot_label_ac": V(26.393, "ac", f, 2, S2, m="text-search", r=TO, note="'LOT 1, BLOCK 18 ±26.393 ACRES'"),
          "open_space_ac": V(8.997, "ac", f, 2, S2, m="text-search", r=TO), "parking_area_ac": V(8.35, "ac", f, 2, S2, m="text-search", r=TO),
          "units": D(432, "units", f, 3, S3, "18 numbered buildings x 24 unit ids (8/floor x 3); matches manifest '432-unit'", c="medium"),
          "density_du_ac": D(16.8, "du/ac", f, 3, S3, "432/25.7062 net", c="medium"),
          "buildings": V(18, "buildings", f, 3, S3, m="text-search", c="medium", note="residential, numbered")},
    buildings=[
        bldg("A", "Type A (bldg 10 measured), H-shape", U(), D(3, "floors", f, 3, S3, "unit ids 1xx-3xx", c="medium"), "H",
             V(146, "ft", f, 3, S3, m="scaled-measurement", c="medium", s="measured", note="printed 1\"=60' (0.833 ft/pt) checked vs 9 ft stall pitch; +/-3 ft"),
             V(95, "ft", f, 3, S3, m="scaled-measurement", c="medium", s="measured"), U("sf"), D(24, "units", f, 3, S3, c="medium"),
             D(8, "units/floor", f, 3, S3, c="medium"), {}, "breezeway (2 open stair slots + cross breezeway)", D(2, "stairs", f, 3, S3, c="low"), U(), "surface", U("sf")),
        bldg("B1", "Type B1 (bldg 14 measured)", U(), D(3, "floors", f, 3, S3, c="medium"), "bar",
             V(147, "ft", f, 3, S3, m="scaled-measurement", c="medium", s="measured"), V(85, "ft", f, 3, S3, m="scaled-measurement", c="medium", s="measured"),
             U("sf"), D(24, "units", f, 3, S3, c="medium"), D(8, "units/floor", f, 3, S3, c="medium"), {}, "breezeway", U(), U(), "surface", U("sf")),
    ],
    unit_types=[],
    parking={"type": "surface + detached 4- and 5-bay garages", "provided": U("stalls", "no parking table on reviewed sheets"), "required": U("stalls")},
    amenities=["clubhouse", "pool amenity area", "dog park"],
    access=["resident-only entry/exit", "US 287/81 frontage", "roundabout internal circle"],
    project_rules=[rule("open space minimum (zoning D)", 35, "% of site", "printed on landscape sheet; project-specific")],
    reconciliation=[rec("unit count", "18 bldg x 24 = 432 vs manifest 432", "consistent", "unit schedule not printed; derived from addressing ids"),
                    rec("lot area labels", "26.3939 gross vs 26.393 lot label vs 25.7062 net", "consistent", "net excludes ROW")],
    open_questions=["parking counts", "unit mix and sizes", "building type counts (A/B1/B2)"],
)

# ---------------------------------------------------------------- P08 Ennis concept
f = O + "P08_130_unit_Ennis_apartment_concept/001_130_unit_Ennis_apartment_concept.pdf"
S = "concept site plan"
P["P08"] = dict(
    name="130-unit Ennis apartment concept", location="Ennis, TX", family="ennis-concept", partition="dev",
    forms=["garden-breezeway"], overlays=[],
    documents=[doc(f, [1], [(1, S, "Concept site plan (Ikemire Architects)", None, "2024-01-16")])],
    site={"area_ac": V(5.95, "ac", f, 1, S), "units": V(130, "units", f, 1, S), "density_du_ac": V(22, "du/ac", f, 1, S),
          "coverage_pct": V(28.5, "%", f, 1, S), "buildings": V(6, "buildings", f, 1, S, note="(4) 3-story + (2) 2-story"),
          "inner_label_ac": V(4.473, "ac", f, 1, S, c="low", note="unexplained acreage label inside site")},
    buildings=[
        bldg("3S", "3-story breezeway building", V(4, "bldg", f, 1, S), V(3, "floors", f, 1, S), "bar",
             V(147.6, "ft", f, 1, S, m="scaled-measurement", c="medium", s="measured", note="graphic scale 0-160 ft = 131.9 pt (1.213 ft/pt); printed 1\"=80' does not match (sheet reduced); stall pitch check 9.06 ft; +/-3 ft"),
             V(66.4, "ft", f, 1, S, m="scaled-measurement", c="medium", s="measured", note="includes projections"), U("sf"),
             D(24, "units", f, 1, S, c="medium"), D(8, "units/floor", f, 1, S, "4 per side, double-loaded on 2 open breezeways", c="medium"), {},
             "breezeway (open stairs)", D(2, "stairs", f, 1, S, c="medium"), U(), "surface", U("sf")),
        bldg("2S", "2-story breezeway building", V(2, "bldg", f, 1, S), V(2, "floors", f, 1, S), "bar", U("ft"), U("ft"), U("sf"),
             D(17, "units", f, 1, S, "one bldg 16, one 18 (2 single-story end units); total 34", c="low"), D(8, "units/floor", f, 1, S, c="low"), {},
             "breezeway", U(), U(), "surface", U("sf")),
    ],
    unit_types=[ut("1BR", 1, None, None, V(86, "units", f, 1, S)), ut("2BR", 2, None, None, V(44, "units", f, 1, S))],
    parking={"required": V(217, "stalls", f, 1, S), "provided": V(232, "stalls", f, 1, S),
             "ratio_per_unit": D(1.78, "stalls/unit", f, 1, S, "232/130"), "type": "surface"},
    amenities=["clubhouse", "pool", "storage cubbies"], access=["2 drives on Physician's Blvd", "exit toward S.H. 34"],
    project_rules=[rule("building setback", 10, "ft")],
    reconciliation=[rec("unit mix", "86+44=130", "consistent"), rec("density", "130/5.95=21.8 vs printed 22", "consistent"),
                    rec("units by building", "4x24 + 16 + 18 = 130", "consistent", "2-story split estimated from plan")],
    open_questions=["meaning of 4.473 ac label", "unit sizes", "adjacent 2.1 ac 'future retail' is outside project"],
)

# ---------------------------------------------------------------- P17 Pointe Grand Columbia Ph 2
f = O + "P17_Pointe_Grand_Columbia_Phase_2/001_Pointe_Grand_Columbia_Phase_2.pdf"
SA, SP = "A0", "Site / Parking Plan"
P["P17"] = dict(
    name="Pointe Grand Columbia Phase 2", location="Columbia, SC", family="pointe-grand-columbia", partition="dev",
    forms=["garden-breezeway", "garage-detached"], overlays=[],
    documents=[doc(f, [1, 6, 7, 17, 23], [(1, None, "Planning Commission staff report", None, "2022-11-10"),
                                         (17, SA, "36 unit apartment building (raster)", None, "2020-04-24"),
                                         (23, SP, "Site / parking plan site notes (raster)", None, None)])],
    site={"tract_ac": V(26.58, "ac", f, 23, SP), "units_phase2": V(36, "units", f, 23, SP), "units_phase1_2": V(258, "units", f, 23, SP),
          "density_ph2_du_ac": V(1.35, "du/ac", f, 23, SP), "density_ph1_2_du_ac": V(9.70, "du/ac", f, 23, SP),
          "max_height_ft": V(45, "ft", f, 23, SP), "coverage_sf": V(28931.15, "sf", f, 23, SP, note="apartments 14,331.15 + garages 14,600; 2.48%"),
          "zoning": V("Employment Campus (from C1)", None, f, 23, SP)},
    buildings=[
        bldg("APT36", "36-unit 3-story garden building", V(1, "bldg", f, 23, SP), V(3, "floors", f, 23, SP), "bar",
             V(252.58, "ft", f, 17, SA, m="printed-dimension", note="252'-7\" = 84'-6\" + 83'-7\" + 84'-6\""),
             V(48.0, "ft", f, 17, SA, m="printed-dimension", note="body; patios/stairs add ~9'-9\""),
             V(14331, "sf", f, 23, SP, note="apartment building coverage"), V(36, "units", f, 7, None, m="text-search", r=TO),
             D(12, "units/floor", f, 17, SA), {"2BR": 36}, "breezeway (open stairs)", V(3, "stairs", f, 17, SA, m="printed-dimension", c="medium", note="counted on plan"),
             V(0, "elevators", f, 17, SA, c="medium", s="extracted", note="none shown"), "surface + 10 detached garages",
             D(41397, "sf", f, 17, SA, "13,799 sf/floor x 3", c="medium")),
    ],
    unit_types=[ut("2BR", 2, None, None, V(36, "units", f, 6, None, m="text-search", r=TO))],
    parking={"required": V(63, "stalls", f, 23, SP, note="1.75/unit"), "provided": V(59, "stalls", f, 23, SP, note="47 std + 2 accessible + 10 garages; 1.63/unit"),
             "garages": V(10, "stalls", f, 23, SP), "bike_required": V(11, "spaces", f, 23, SP), "type": "surface + detached garages"},
    amenities=["phase 1 clubhouse, fitness, pool (shared)"], access=["Research Drive (via phase 1)"],
    project_rules=[rule("max building height", 45, "ft"), rule("parking ratio required", 1.75, "stalls/unit")],
    reconciliation=[rec("parking", "47+2+10=59 vs 63 required", "discrepancy", "plan notes a reduction (note 3); provided < required"),
                    rec("density", "36/26.58=1.354; 258/26.58=9.71", "consistent"),
                    rec("coverage vs impervious", "garages coverage 14,600 vs garage impervious 7,000", "discrepancy", "printed values disagree"),
                    rec("footprint vs floor area", "coverage 14,331 vs 13,799 sf/floor", "consistent", "coverage includes stairs/patios"),
                    rec("tract acreage", "site notes 26.58 vs staff report ±28.58", "discrepancy", "staff report likely typo")],
    open_questions=["unit sf (not legible on raster)"],
)

# ---------------------------------------------------------------- P18 Lake Shore / Beach Club townhomes
f = O + "P18_Beach_Club_Townhomes/001_Beach_Club_Townhomes.pdf"
P["P18"] = dict(
    name="Lake Shore Town Homes / Beach Club", location="Tega Cay, York County, SC (from plat; manifest says 'to verify')",
    family="lake-shore-beach-club", partition="holdout", forms=["townhome"], overlays=[],
    documents=[doc(f, [1, 10, 11, 12, 77], [(1, "CS.1", "Cover / index", None, None),
                                           (10, "AF1.3", "4-unit combined foundation plan", None, None),
                                           (11, "AF1.4", "5-unit combined foundation plan", None, None),
                                           (12, "AF1.5", "6-unit combined foundation plan", None, None),
                                           (77, "C1.0", "Preliminary plat", "rev 2005-07-26 (approved for construction)", "2005-07-26")])],
    site={"area_ac": V(15.75, "ac", f, 77, "C1.0", note="parcel 1 6.15 + parcel 2 9.60"), "lots": V(82, "lots", f, 77, "C1.0"),
          "density_du_ac": D(5.2, "du/ac", f, 77, "C1.0", "82/15.75"), "zoning": V("R-6 PUD", None, f, 77, "C1.0"),
          "open_space_ac": V(9.60, "ac", f, 77, "C1.0", c="medium", note="MF commons open space"),
          "buffer_ac": V(3.50, "ac", f, 77, "C1.0", c="medium")},
    buildings=[
        bldg(f"TH{n}", f"{n}-unit townhome row", U("bldg", "count per type not determined"), V("2-4", "floors", f, 1, "CS.1", c="medium", note="cover lists 2, 3 and 4 story units"),
             "row", V(w, "ft", f, p, sh, m="printed-dimension"), V(55.0, "ft", f, p, sh, m="printed-dimension", note="55'-0\" foundation depth"),
             U("sf"), V(n, "units", f, p, sh), None, mix, "exterior entry (fee-simple row)", None, None, "front-load garages (approx 19'-2\" to 19'-8\" wide x 20'-23' deep)", U("sf"))
        for n, w, p, sh, mix in [(4, 117.875, 10, "AF1.3", "end+A+B+end"), (5, 146.17, 11, "AF1.4", "end+B+A+B+end"), (6, 171.46, 12, "AF1.5", "end+B+A+A+B+end")]
    ],
    unit_types=[ut("End unit (Type C/End)", None, None, None, U()), ut("Type A", None, None, None, U()), ut("Type B", None, None, None, U())],
    unit_widths={"end_ft": V(32.146, "ft", f, 10, "AF1.3", m="printed-dimension", note="32'-1 3/4\""),
                 "A_ft": V(25.292, "ft", f, 10, "AF1.3", m="printed-dimension", note="25'-3 1/2\""),
                 "B_ft": V(28.292, "ft", f, 10, "AF1.3", m="printed-dimension", note="28'-3 1/2\"")},
    parking={"min_per_unit": V(2, "stalls/unit", f, 77, "C1.0", c="medium", note="9'x17' spaces; may be met by garages (raster partly legible)"),
             "stall_w_ft": V(9, "ft", f, 77, "C1.0", c="medium"), "stall_d_ft": V(17, "ft", f, 77, "C1.0", c="medium"), "type": "attached front-load garage + driveway"},
    amenities=["common open space"], access=["24' private road ROW"],
    project_rules=[rule("min front setback", 25, "ft"), rule("min rear setback", 24, "ft"), rule("min side setback", 8, "ft"),
                   rule("private road ROW", 24, "ft"), rule("utility easement", 40, "ft")],
    reconciliation=[rec("4-unit width", "32.146+25.292+28.292+32.146=117.875 = 117'-10 1/2\"", "consistent"),
                    rec("5-unit width", "2x32.146+2x28.292+25.292=146.17 = 146'-2\"", "consistent"),
                    rec("6-unit width", "2x(32.146+28.292+25.292)=171.46 = 171'-5 1/2\"", "consistent")],
    open_questions=["number of 4/5/6-unit buildings", "unit sf", "max height note illegible"],
)

# ---------------------------------------------------------------- P20 Magnolia Village
d0 = O + "P20_Magnolia_Village/001_Final_PDD_Site_Development_Plan.pdf"
d6 = O + "P20_Magnolia_Village/006_Plans_Apartments_Part_1.pdf"
d10 = O + "P20_Magnolia_Village/010_Plans_SS_1BR_DUPLEX.pdf"
d11 = O + "P20_Magnolia_Village/011_Plans_SS_2BR.pdf"
d14 = O + "P20_Magnolia_Village/014_Plans_DS_2BR.pdf"
d16 = O + "P20_Magnolia_Village/016_Plans_MM_Unit_1.pdf"
C = "C009"
P["P20"] = dict(
    name="Magnolia Village PDD Phase 2", location="Salina, KS", family="magnolia-village", partition="dev",
    forms=["garden-exterior-entry", "duplex", "cottage-detached", "tuck-under"], overlays=[],
    documents=[doc(d0, [1], [(1, C, "Final Development Plan", None, "2025-12-02")]),
               doc(d6, [3, 4, 8], [(3, None, "Code narrative", "permit set", "2025-03-28"), (4, "G-102", "Code floor plans bldg A, B, C", "permit set", "2025-03-28"),
                                   (8, "S-100", "Slab plan 1A", "permit", "2025-03-28")]),
               doc(d10, [3], [(3, "A1", "Single story duplex floor plan", "permit set", "2024-12-13")]),
               doc(d11, [3], [(3, "A1", "Single story 2BR floor plan", "permit set", None)]),
               doc(d14, [3], [(3, "A1", "Double story 2BR plans", "permit set", None)]),
               doc(d16, [1], [(1, None, "MicroMansion unit 1", None, None)])],
    site={"area_ac": V(29.22, "ac", d0, 1, C), "units": V(250, "units", d0, 1, C), "total_footprint_sf": V(190368, "sf", d0, 1, C),
          "lot1_ac": V(1.388, "ac", d0, 1, C), "lot2_ac": V(22.230, "ac", d0, 1, C), "lot3_ac": V(4.814, "ac", d0, 1, C),
          "lot2_coverage_pct": V(16, "%", d0, 1, C), "lot3_coverage_pct": V(15, "%", d0, 1, C),
          "density_du_ac": D(8.6, "du/ac", d0, 1, C, "250/29.22 gross"), "zoning": V("PDD (from Agriculture)", None, d0, 1, C)},
    buildings=[
        bldg("APT", "3-story apartment (Bldg A, B, C)", V(3, "bldg", d6, 3, None, m="text-search", r=TO), V(3, "floors", d6, 3, None, m="text-search", r=TO), "bar with end wings",
             V(199.92, "ft", d6, 8, "S-100", m="printed-dimension", note="199'-11\" EOS"), V(59.67, "ft", d6, 8, "S-100", m="printed-dimension", note="59'-8\" body; 64'-10\" at end wing"),
             V(10822, "sf", d0, 1, C, note="interior per floor; +2,083 exterior (stairs/balconies)"), V("32-33", "units", d6, 4, "G-102", note="A 32 (L1 has clubhouse), B 33, C 33"),
             V(11, "units/floor", d6, 4, "G-102"), {"1BR": "2/floor (650 sf)", "2BR": "6/floor (865 sf)", "3BR": "3/floor (1,183-1,272 sf)"},
             "exterior entry: back-to-back units, exterior exit stairs + exit balconies", V(4, "stairs", d6, 4, "G-102", c="medium", note="two exterior exit stairs per half building"),
             U(note="none found in review"), "surface", V(38715, "sf", d6, 3, None, m="text-search", r=TO, note="10,822+2,083 per floor x 3")),
        bldg("DUPLEX", "Single-story 1BR duplex", V(13, "bldg", d0, 1, C), V(1, "floors", d10, 3, "A1"), "rect", V(46.0, "ft", d10, 3, "A1", m="printed-dimension"),
             V(44.0, "ft", d10, 3, "A1", m="printed-dimension"), V(1876, "sf", d0, 1, C), V(2, "units", d0, 1, C), None, {"1BR": 2}, "exterior entry (porch)", 0, 0, "surface", U("sf")),
        bldg("SS2", "Single-story detached 2BR", V(21, "units", d0, 1, C), V(1, "floors", d11, 3, "A1"), "L/rect", V(36.67, "ft", d11, 3, "A1", m="printed-dimension"),
             V(44.67, "ft", d11, 3, "A1", m="printed-dimension", note="44'-8\" incl porch; body 39'-4\""), V(1331, "sf", d0, 1, C), 1, None, {"2BR": 1}, "exterior entry", 0, 0, "surface", U("sf")),
        bldg("DS2", "Two-story detached 2BR (narrow)", V(30, "units", d0, 1, C), V(2, "floors", d14, 3, "A1"), "rect", V(17.33, "ft", d14, 3, "A1", m="printed-dimension"),
             V(45.0, "ft", d14, 3, "A1", m="printed-dimension"), V(830, "sf", d0, 1, C), 1, None, {"2BR": 1}, "exterior entry", 1, 0, "surface", U("sf")),
        bldg("SS3", "Single-story detached 3BR", V(9, "units", d0, 1, C), 1, U(), U("ft"), U("ft"), V(1646, "sf", d0, 1, C), 1, None, {"3BR": 1}, "exterior entry", 0, 0, "surface", U("sf")),
        bldg("DS3", "Two-story detached 3BR", V(31, "units", d0, 1, C), 2, U(), U("ft"), U("ft"), V(1193, "sf", d0, 1, C), 1, None, {"3BR": 1}, "exterior entry", 1, 0, "surface", U("sf")),
        bldg("GAR", "Unit over 3-car garage", V(9, "units", d0, 1, C), 2, U(), U("ft"), U("ft"), V(902, "sf", d0, 1, C), 1, None, {}, "exterior entry", None, 0, "tuck-under (3-car garage below unit)", U("sf")),
        bldg("MM", "MicroMansion 'The Bert'", V(26, "units", d0, 1, C), U(), U(), V(26.0, "ft", d16, 1, None, m="text-search", c="low", r=TO),
             V(20.5, "ft", d16, 1, None, m="text-search", c="low", r=TO), V(798, "sf", d0, 1, C), 1, None, {}, "exterior entry", None, 0, "surface", U("sf")),
    ],
    unit_types=[ut("Apt 1BR", 1, None, 650, V(17, "units", d0, 1, C)), ut("Apt 2BR", 2, None, 865, V(54, "units", d0, 1, C)),
                ut("Apt 3BR", 3, None, "1,183-1,272", V(27, "units", d0, 1, C))],
    parking={"horizontal_required": D(238, "stalls", d0, 1, C, "2/unit first 20 + 1.5/unit x 132"),
             "horizontal_provided": V(238, "stalls", d0, 1, C, note="27 garage + 204 surface + 7 ADA"),
             "apartment_required": D(157, "stalls", d0, 1, C, "2x20 + 1.5x78"), "apartment_provided": V(159, "stalls", d0, 1, C, note="153 + 6 ADA"),
             "provided": V(397, "stalls", d0, 1, C), "ratio_per_unit": D(1.59, "stalls/unit", d0, 1, C, "397/250"),
             "type": "surface + individual garages"},
    amenities=["mail building (152 boxes)", "phase 1 clubhouse", "walking trails", "apartment clubhouse room (583 sf)"],
    access=["Magnolia Road (north gate)", "Virginia Drive (+ future extension)", "gates at fencing/sidewalk crossings"],
    project_rules=[rule("front setback abutting street", 0, "ft"), rule("separation between buildings", 10, "ft"), rule("rear setback", 25, "ft"),
                   rule("parking: 2/unit first 20 units, then 1.5/unit", "2 / 1.5", "stalls/unit")],
    reconciliation=[rec("unit legend sum", "26+9+30+31+26+21+9+98=250", "consistent"),
                    rec("footprint legend sum", "157,902 horizontal + 3x10,822 = 190,368 vs printed 190,368", "consistent"),
                    rec("lot 3 footprint", "3 x 10,822 = 32,466 vs printed 32,466", "consistent"),
                    rec("lot 2 footprint", "157,902 vs printed 158,552", "discrepancy", "650 sf difference"),
                    rec("lot areas vs site", "1.388+22.230+4.814=28.432 vs 29.22 ac", "discrepancy", "0.79 ac unexplained (likely ROW)"),
                    rec("apartment units", "A 32 + B 33 + C 33 = 98; mix 17/54/27", "consistent"),
                    rec("parking", "238 + 159 = 397", "consistent"),
                    rec("plumbing count", "code narrative uses 180 D.U. vs 98 units", "discrepancy", "stale value in narrative")],
    open_questions=["dimensions of SS3, DS3, garage and MM types only partly text-extracted"],
)

# ---------------------------------------------------------------- P25 Hawthorn
H = O + "P25_Hawthorn/"
hs, h0, hsec, h24 = H + "015_PROPOSED_SITE_LAYOUT_PLAN_pdf_474_KB.pdf", H + "016_PROPOSED_SITE_PLAN_LEVEL_00_pdf_1051_KB.pdf", H + "014_PROPOSED_SECTIONS_pdf_674_KB.pdf", H + "009_PROPOSED_FLOOR_PLANS_LEVEL_02_04_pdf_549_KB.pdf"
P["P25"] = dict(
    name="Hawthorn Cottages", location="Dublin (Malahide Road), Ireland", family="hawthorn", partition="dev",
    forms=["podium", "tower-on-podium", "mid-rise-corridor-elevator"], overlays=[],
    documents=[doc(hs, [1], [(1, "HTC-06-00-DR-DA-AR-A002", "Site layout plan", "rev 5 (LRD Stage 3)", "2026-07-30")]),
               doc(h0, [1], [(1, "HTC-06-00-DR-DA-AR-A100", "Site plans - level 00", "rev 10", "2026-08-21")]),
               doc(hsec, [1], [(1, "HTC-06-XX-DR-DA-AR-A300", "Proposed sections", "rev 6", "2026-07-30")]),
               doc(h24, [1], [(1, None, "Floor plans level 02-04", None, None)])],
    site={"area_ha": V(0.42, "ha", hs, 1, "A002"), "area_ac": D(1.04, "ac", hs, 1, "A002", "0.42 ha x 2.471"),
          "units": V(126, "units", hs, 1, "A002"), "density_du_ac": D(121, "du/ac", hs, 1, "A002", "126/1.04"),
          "gia_m2": V(10529, "m2", hs, 1, "A002"), "footprint_L01_m2": V(1393.7, "m2", hs, 1, "A002"),
          "footprint_L00_m2": V(2636, "m2", h0, 1, "A100", note="incl. car parking spaces"),
          "communal_open_space_m2": V(1164, "m2", hs, 1, "A002", note="podium 914 + roof terrace 250"),
          "public_open_space_m2": V(1097, "m2", hs, 1, "A002", note="ground 922 + podium 175")},
    buildings=[
        bldg("A", "Building A (tallest)", 1, V(11, "residential storeys over podium", hsec, 1, "A300", m="printed-dimension", c="medium", note="L01-L11; roof L12 +58.600"),
             "irregular bar", U("ft"), U("ft"), V(802, "m2", h0, 1, "A100", note="L01 GIA; L02-04 797; L05-07 565; L08 565; L09-11 344"), U(), None, {},
             U(note="double-loaded core layout seen on plans; not verified"), U(), U(), "podium L00 below", U("m2")),
        bldg("B", "Building B", 1, V(7, "residential storeys over podium", hsec, 1, "A300", m="printed-dimension", c="medium", note="top +46.600"),
             "irregular bar", U("ft"), U("ft"), V(483, "m2", h0, 1, "A100", note="L01 GIA; L02-07 509"), U(), None, {}, U(), U(), U(), "podium L00 below", U("m2")),
    ],
    floor_to_floor={"podium_mm": V(4000, "mm", hsec, 1, "A300", m="printed-dimension"), "typical_mm": V(3000, "mm", hsec, 1, "A300", m="printed-dimension")},
    unit_types=[ut("1 Bed 2 Person", 1, None, "approx 45-50 m2", V(79, "units", h24, 1, None, m="text-search", c="medium", r=TO, note="summed across level schedules")),
                ut("2 Bed 4 Person", 2, None, "approx 73-81 m2", V(47, "units", h24, 1, None, m="text-search", c="medium", r=TO))],
    parking={"provided": V(75, "stalls", hs, 1, "A002", note="car share 2 + resident 69 + disabled 4"), "stall_mm": V("2400 x 4800", "mm", hs, 1, "A002"),
             "aisle_mm": V(6000, "mm", h0, 1, "A100", m="printed-dimension"), "motorbike": V(4, "spaces", hs, 1, "A002"),
             "cycle": V(237, "spaces", hs, 1, "A002", note="173 resident + 64 visitor"), "ratio_per_unit": D(0.60, "stalls/unit", hs, 1, "A002", "75/126"),
             "type": "podium (ground level under podium deck)"},
    amenities=["podium communal garden", "roof terrace", "bike stores", "public realm"], access=["Malahide Road (east) main entrance + car park entry"],
    project_rules=[rule("building separation A-B (printed)", 16000, "mm")],
    reconciliation=[rec("GIA by level sum", "507+1285+3x1306+3x1074+565+3x344 = 10,529", "consistent"),
                    rec("unit schedules sum", "10+51+14+14+14+8+5+10 = 126", "consistent", "text-extracted from level schedules")],
    open_questions=["building footprints in ft (not scaled)", "lift/stair counts", "revision dates printed as 2026 on sheets (as found)"],
)

# ---------------------------------------------------------------- P27 The Rise / Vallco
R27 = O + "P27_Cupertino/"
ri, rp, rt = R27 + "002_P_0101_PROJECT_INFORMATION_AND_DATA_TABLE_pdf.pdf", R27 + "003_P_0102_DRAWING_LIST_RESIDENTIAL_PROGRAM_TABLES_pdf.pdf", R27 + "016_P_0800_06_BUILDING_PLAN_TYPICAL_TOWER_pdf.pdf"
P["P27"] = dict(
    name="The Rise (Vallco Town Center)", location="Cupertino, CA", family="rise-vallco", partition="dev",
    forms=["tower-on-podium", "podium", "townhome", "mixed-use"], overlays=["affordable"],
    documents=[doc(ri, [1], [(1, "P-0101", "Project information and data table", "REV-6 SB-35 modification application", "2023-12-04")]),
               doc(rp, [1], [(1, "P-0102", "Drawing list & residential program tables", "REV-6", "2023-12-04")]),
               doc(rt, [1], [(1, "P-0800.06", "Building plan - typical tower", "REV-6", "2023-12-04")])],
    site={"area_ac": V(50.822, "ac", ri, 1, "P-0101", m="text-search", r=TO), "area_sf": V(2213821, "sf", ri, 1, "P-0101", m="text-search", r=TO),
          "units": V(2669, "units", rp, 1, "P-0102"), "base_density_units": V(1779, "units", rp, 1, "P-0102"),
          "density_bonus_units": V(890, "units", rp, 1, "P-0102"), "residential_gsf": V(4382226, "sf", ri, 1, "P-0101"),
          "retail_gsf": V(226386, "sf", ri, 1, "P-0101"), "office_gsf": V(1954613, "sf", ri, 1, "P-0101"),
          "lot_coverage_pct": V(54, "%", ri, 1, "P-0101", m="text-search", r=TO), "blocks": V(15, "blocks", ri, 1, "P-0101", m="text-search", r=TO),
          "density_du_ac": D(52.5, "du/ac", rp, 1, "P-0102", "2669/50.822 gross", c="medium")},
    buildings=[
        bldg("POINT_TOWER", "Typical residential point tower", U("bldg"), U("floors", "tower storeys not on reviewed sheets"), "rect",
             V(78, "ft", rt, 1, "P-0800.06", m="scaled-measurement", c="low", s="estimated", note="printed 1/64\"=1'-0\" not calibrated against a printed dimension; +/-10%"),
             V(134, "ft", rt, 1, "P-0800.06", m="scaled-measurement", c="low", s="estimated"), U("sf"), U(), V(7, "units/floor", rt, 1, "P-0800.06", m="printed-schedule", c="medium", note="unit labels counted"),
             {"1BR": 2, "2BR": 4, "3BR": 1}, "double-loaded corridor", V(2, "stairs", rt, 1, "P-0800.06", c="medium"), V(2, "elevators", rt, 1, "P-0800.06", c="medium"), "podium/below-grade", U("sf")),
        bldg("BAR_TOWER", "Typical residential bar tower (Street D)", U("bldg"), U("floors"), "bar",
             V(264, "ft", rt, 1, "P-0800.06", m="scaled-measurement", c="low", s="estimated"), V(83, "ft", rt, 1, "P-0800.06", m="scaled-measurement", c="low", s="estimated"),
             U("sf"), U(), V(10, "units/floor", rt, 1, "P-0800.06", c="medium"), {"1BR": 1, "2BR": 3, "2BR+": 3, "3BR": 2, "2BR+ (corner)": 1},
             "double-loaded corridor", V(2, "stairs", rt, 1, "P-0800.06", c="medium"), V(2, "elevators", rt, 1, "P-0800.06", c="low", note="2 cabs + possible service"), "podium", U("sf")),
        bldg("TH", "Block 6 townhomes", V(47, "units", rp, 1, "P-0102", m="text-search", r=TO), U(), U(), U("ft"), U("ft"), U("sf"), None, None, {"3BR": 32, "4BR": 15}, "exterior entry", None, None, U(), U("sf")),
    ],
    unit_types=[ut("Affordable studio", 0, None, 425, V(353, "units", rp, 1, "P-0102")), ut("Affordable 1BR", 1, None, 571, V(435, "units", rp, 1, "P-0102")),
                ut("Affordable 2BR", 2, None, 842, V(66, "units", rp, 1, "P-0102")), ut("Affordable 3BR", 3, None, 1113, V(36, "units", rp, 1, "P-0102")),
                ut("Market studio", 0, None, 602, V(134, "units", rp, 1, "P-0102")), ut("Market 1BR", 1, None, 748, V(834, "units", rp, 1, "P-0102")),
                ut("Market 2BR", 2, None, 1450, V(664, "units", rp, 1, "P-0102")), ut("Market 3BR", 3, None, 1797, V(90, "units", rp, 1, "P-0102")),
                ut("Market 4BR", 4, None, 2900, V(10, "units", rp, 1, "P-0102")), ut("Market townhome", None, None, 2720, V(47, "units", rp, 1, "P-0102"))],
    parking={"provided": V(9570, "stalls", ri, 1, "P-0101"), "residential": V(2623, "stalls", ri, 1, "P-0101"), "office": V(6050, "stalls", ri, 1, "P-0101"),
             "retail": V(798, "stalls", ri, 1, "P-0101"), "street": V(99, "stalls", ri, 1, "P-0101"), "required": V("not applicable per SB-35", None, ri, 1, "P-0101"),
             "residential_ratio": D(0.98, "stalls/unit", ri, 1, "P-0101", "2623/2669"), "type": "podium + below-grade structured"},
    amenities=["two town squares", "community parks", "amenity levels"], access=["N Wolfe Rd", "Stevens Creek Blvd", "Vallco Pkwy", "Perimeter Rd"],
    project_rules=[rule("building plane: 1:1 slope from curb of arterial (Wolfe, Stevens Creek)", "1:1", "slope")],
    reconciliation=[rec("affordable + market", "890 + 1,779 = 2,669", "consistent"),
                    rec("block distribution sum", "204+268+73+182+297+47+89+254+204+284+309+458 = 2,669", "consistent",
                        "text layer; my first visual read of tiny totals misread 204 as 284 (sum 2,819) and was corrected by text extraction"),
                    rec("affordable blocks", "B5 297 + B10 284 + B11 309 = 890", "consistent"),
                    rec("parking components", "2623+6050+798+99 = 9,570", "consistent"),
                    rec("site areas", "west 30.20 + east 17.62 = 47.82 vs 50.822 gross", "discrepancy", "remaining area unexplained in reviewed sheets")],
    open_questions=["tower heights/storeys", "calibrated tower footprints"],
)

# ---------------------------------------------------------------- Sierra Vista WB-30 / WB-32
for pid, fn, name, sh, date, units, permitted, bonus, ac, dens, n64, amen_sf, amen_lbl, total_sf, cov, h64, hA, preq, pprov, pnote, wp, part in [
    ("P35", "P35_Sierra_Vista_WB_30_Senior_Apartments/001_Sierra_Vista_WB_30_Senior_Apartments.pdf", "Sierra Vista WB-30 Senior Apartments (Westbrook)",
     "Sheet 1 of 4", "2023-08-19", 355, 237, 49.8, 8.06, 43.4, 5, 9950, "clubhouse", 95450, 27.2, 50, 50, 391, 404, "6 compact, 6 motorcycle, 28 accessible", 12, "holdout"),
    ("P36", "P36_Sierra_Vista_WB_32_Senior_Apartments/001_Sierra_Vista_WB_32_Senior_Apartments.pdf", "Sierra Vista WB-32 Senior Apartments (Westbrook)",
     "Sheet 1 of 5", "2023-08-21", 192, 128, 50.0, 5.11, 37.57, 3, 2714, "amenity", 54014, 25.3, 45, 25, 211, 217, "168 auto + 38 compact (18%) + 11 motorcycle (5%)", 9, "holdout")]:
    f = O + fn
    bl = [bldg("64PLEX", "KTGY 64-plex senior building", V(n64, "bldg", f, 1, sh), V(4, "floors", f, 1, sh, c="high", note="site plan labels '4 Stories 64 UNITS'"),
               "bar", V(241, "ft", f, wp, "A1-01" if pid == "P35" else None, m="scaled-measurement", c="medium", s="measured", note="graphic scale 0-4-8-16 ft (9.0 pt/ft); +/-3 ft") if pid == "P35" else U("ft", "same prototype as WB-30"),
               V(83, "ft", f, wp, "A1-01", m="scaled-measurement", c="medium", s="measured", note="incl. bays") if pid == "P35" else U("ft"),
               V(17100, "sf", f, 1, sh, note="'building floor area' per 64-plex; lot coverage math implies footprint"), V(64, "units", f, 1, sh),
               D(16, "units/floor", f, 1, sh, "64/4"), {"1BR/1BA (707 sf)": "?", "2BR/2BA (943 sf)": "?"},
               "double-loaded interior corridor (Hall 1 / Hall 2) with central lobby", V(2, "stairs", f, wp, "A1-01") if pid == "P35" else U(note="same KTGY prototype as WB-30 (P35); not checked here"), V(2, "elevators", f, wp, "A1-01") if pid == "P35" else U(note="see P35"), "surface", U("sf", "only footprint printed"))]
    if pid == "P35":
        bl.append(bldg("CLUB35", "Clubhouse building with 35 units", V(1, "bldg", f, 3, "Sheet 3 of 4"), V(4, "floors", f, 3, "Sheet 3 of 4"), "bar", U("ft"), U("ft"),
                       V(9950, "sf", f, 1, sh), V(35, "units", f, 3, "Sheet 3 of 4"), None, {}, U(), U(), U(), "surface", U("sf")))
    P[pid] = dict(
        name=name, location="Roseville, CA", family="sierra-vista-westbrook", partition=part,
        forms=["mid-rise-corridor-elevator"], overlays=["senior", "affordable"],
        documents=[doc(f, [1, 3, wp - 1, wp] if pid == "P35" else [1, wp], [(1, sh, "Preliminary site plan (Morton & Pitalo)", None, date),
                                                                             (wp, "A1-01", "Conceptual composite plans (KTGY)", "conceptual design", "2022-11-04" if pid == "P35" else None)])],
        site={"area_ac": V(ac, "ac", f, 1, sh), "units": V(units, "units", f, 1, sh), "permitted_units": V(permitted, "units", f, 1, sh),
              "density_bonus_pct": V(bonus, "%", f, 1, sh), "density_du_ac": V(dens, "du/ac", f, 1, sh), "zoning": V("HDR / R3", None, f, 1, sh),
              "building_floor_area_sf": V(total_sf, "sf", f, 1, sh), "lot_coverage_pct": V(cov, "%", f, 1, sh),
              "max_height_ft": V(h64, "ft", f, 1, sh, note=f"64-plex; {amen_lbl} {hA} ft")},
        buildings=bl,
        unit_types=[ut("1BR/1BA", 1, 1, 707, U("units", "count not printed")), ut("2BR/2BA", 2, 2, 943, U("units"))],
        parking={"required": V(preq, "stalls", f, 1, sh, note="1/unit + 10% guest"), "provided": V(pprov, "stalls", f, 1, sh, note=pnote),
                 "ratio_per_unit": D(round(pprov / units, 2), "stalls/unit", f, 1, sh), "type": "surface",
                 **({"stall_d_ft": V(16, "ft", f, 1, sh, m="printed-dimension", note="standard 16' w/ 2' overhang; compact 14'"),
                     "stall_w_ft": V(9, "ft", f, 1, sh, m="printed-dimension"),
                     "drive_aisle_ft": V(27, "ft", f, 3, "Sheet 3 of 4", m="printed-dimension", note="east boundary section: 16' parking + 27' aisle + 16' parking in 70' easement")} if pid == "P35" else {})},
        amenities=[amen_lbl + f" ({amen_sf:,} sf)"], access=["Santucci Blvd", "Pleasant Grove Blvd"] if pid == "P35" else ["Santucci Blvd", "Solaire Dr"],
        project_rules=[rule("max height 64-plex", h64, "ft"), rule("parking: 1/unit + 10% guest (senior)", 1.1, "stalls/unit")]
        + ([rule("min walk adjacent to parking stalls", 6, "ft"), rule("shared access & drainage easement with WB-31", 70, "ft")] if pid == "P35" else []),
        reconciliation=[rec("units vs buildings", f"{n64}x64 + {35 if pid == 'P35' else 0} = {n64 * 64 + (35 if pid == 'P35' else 0)} vs {units}", "consistent"),
                        rec("floor area", f"{n64}x17,100 + {amen_sf:,} = {n64 * 17100 + amen_sf:,} vs {total_sf:,}", "consistent"),
                        rec("density", f"{units}/{ac} = {units / ac:.2f} vs printed {dens}", "consistent" if abs(units / ac - dens) < 0.1 else "discrepancy"),
                        rec("lot coverage", f"{total_sf:,}/({ac} ac x 43,560) = {100 * total_sf / (ac * 43560):.1f}% vs printed {cov}%",
                            "consistent" if abs(100 * total_sf / (ac * 43560) - cov) < 0.3 else "discrepancy")]
        + ([rec("stall numbering", "site plan stalls numbered 1..404 consecutively vs 404 provided", "consistent", "text-layer check")] if pid == "P35" else []),
        open_questions=["unit mix counts per building", "scaled footprint 241x83 (20,000 sf) exceeds printed 17,100 sf; outline has notches/bays - use printed area"],
    )

# ---------------------------------------------------------------- Creekview C-40 / C-43 + Terracina (Bassenian Lagoni / USA Properties)
f = O + "P28_Creekview_C_40/001_Creekview_C_40.pdf"
P["P28"] = dict(
    name="Creekview C-40 Family Affordable Apartments", location="Roseville, CA", family="roseville-usa-properties-bassenian", partition="dev",
    forms=["mid-rise-corridor-elevator"], overlays=["affordable"],
    documents=[doc(f, [2, 7], [(2, None, "Project data / area summary", None, None), (7, "A1.1", "Conceptual site plan (approved by Roseville Planning)", None, "2022-06-13")])],
    site={"area_ac": V(5.27, "ac", f, 7, "A1.1"), "units": V(168, "units", f, 7, "A1.1"), "density_du_ac": V(31.9, "du/ac", f, 7, "A1.1"),
          "zoning": V("HDR / R3", None, f, 7, "A1.1"), "gfa_sf": V(170128, "sf", f, 2, None, m="text-search", r=TO), "far": V(0.74, None, f, 2, None, m="text-search", r=TO),
          "lot_coverage_sf": V(40966, "sf", f, 2, None, m="text-search", r=TO, note="22,708 + 18,258"),
          "height_4th_plate_ft": V(40.75, "ft", f, 2, None, m="text-search", r=TO, note="40'-9\"")},
    buildings=[
        bldg("A", "Building A 4-story L", 1, V(4, "floors", f, 7, "A1.1"), "L", V(260, "ft", f, 7, "A1.1", m="scaled-measurement", c="low", s="estimated", note="graphic scale 1\"=30'; long leg; +/-10 ft"),
             V(65, "ft", f, 7, "A1.1", m="scaled-measurement", c="low", s="estimated", note="bar depth"), V(22708, "sf", f, 2, None, m="text-search", r=TO),
             V(109, "units", f, 2, None, m="text-search", r=TO), None, {"1BR": 35, "2BR": 52, "3BR": D(22, "units", f, 8, None, "109-35-52", r=TO)},
             "double-loaded interior corridor", U(), U(), "surface", V(103018, "sf", f, 2, None, m="text-search", r=TO, note="floors 22,708/27,523/27,523/25,264")),
        bldg("B", "Building B 4-story with community center", 1, V(4, "floors", f, 7, "A1.1"), "bar", U("ft"), U("ft"), V(18258, "sf", f, 2, None, m="text-search", r=TO),
             V(59, "units", f, 2, None, m="text-search", r=TO), None, {"1BR": 22, "2BR": 17, "3BR": D(20, "units", f, 18, None, "59-22-17", r=TO)},
             "double-loaded interior corridor", U(), U(), "surface", V(67110, "sf", f, 2, None, m="text-search", r=TO, note="incl. recreation center 3,931")),
    ],
    unit_types=[ut("1A 1BR/1BA", 1, 1, "570 gross / 538 net", V(57, "units", f, 7, "A1.1")), ut("2BR/1BA", 2, 1, None, V(36, "units", f, 7, "A1.1")),
                ut("2BR/2BA", 2, 2, None, V(33, "units", f, 7, "A1.1")), ut("3BR/2BA", 3, 2, "1,029-1,102 gross", V(42, "units", f, 7, "A1.1"))],
    parking={"required": V(224, "stalls", f, 7, "A1.1", note="state density bonus 65915(p): 1/1BR, 1.5/2-3BR"), "provided": V(291, "stalls", f, 7, "A1.1", note="1.73:1"),
             "standard_9x18": V(204, "stalls", f, 7, "A1.1"), "compact_9x16": V(87, "stalls", f, 7, "A1.1"), "accessible": V(10, "stalls", f, 7, "A1.1"),
             "motorcycle": V(9, "stalls", f, 7, "A1.1"), "drive_aisle_ft": V("24 / 27", "ft", f, 7, "A1.1", m="printed-dimension"), "type": "surface"},
    amenities=["community center", "tot lot / common open space 10,115 sf", "dog relief area", "Dial-A-Ride covered waiting area"],
    access=["main entry Westbrook Blvd", "secondary entry Creekpark Dr", "gated EVA"],
    project_rules=[rule("building setback line", 20, "ft"), rule("parking setback from property line", 10, "ft"), rule("parking setback from street curb", 50, "ft"),
                   rule("landscape corridor (Westbrook Blvd)", 50, "ft"), rule("private outdoor open space", 40, "sf/unit")],
    reconciliation=[rec("unit mix", "57+36+33+42=168", "consistent"), rec("parking required", "57 + 103.5 + 63 = 224", "consistent"),
                    rec("stall types", "204+87=291", "consistent"), rec("density", "168/5.27=31.88", "consistent"),
                    rec("GFA", "103,018 + 67,110 = 170,128", "consistent"), rec("bldg A areas", "85,150+600+17,268=103,018", "consistent")],
    open_questions=["elevator count", "Building B footprint dims"],
)
f = O + "P11_Creekview_C_43/001_Creekview_C_43.pdf"
P["P11"] = dict(
    name="Creekview C-43 Family Affordable Apartments", location="Roseville, CA", family="roseville-usa-properties-bassenian", partition="dev",
    forms=["mid-rise-corridor-elevator"], overlays=["affordable"],
    documents=[doc(f, [2, 7], [(2, None, "Project data / area summary", None, None), (7, "A1.1", "Conceptual site plan", None, "2022-06-13")])],
    site={"area_ac": V(3.88, "ac", f, 7, "A1.1", m="text-search", r=TO), "units": V(116, "units", f, 7, "A1.1", m="text-search", r=TO),
          "density_du_ac": V(29.9, "du/ac", f, 7, "A1.1", m="text-search", r=TO), "gfa_sf": V(120481, "sf", f, 2, None, m="text-search", r=TO),
          "far": V(0.71, None, f, 2, None, m="text-search", r=TO), "lot_coverage_sf": V(33112, "sf", f, 2, None, m="text-search", r=TO)},
    buildings=[bldg("1", "Building 1 4-story", 1, V(4, "floors", f, 2, None, m="text-search", r=TO), U(), U("ft"), U("ft"), V(33112, "sf", f, 2, None, m="text-search", r=TO),
                    V(116, "units", f, 2, None, m="text-search", r=TO), None, {"1BR": 40, "2BR": 47, "3BR": 29}, U(), U(), U(), "surface",
                    V(120481, "sf", f, 2, None, m="text-search", r=TO, note="floors 33,112/31,633/31,633/24,103; res 92,306 + rec 3,494 + circ 23,175 + POS 1,506"))],
    unit_types=[ut("1BR/1BA", 1, 1, "570-582 gross", V(40, "units", f, 7, "A1.1", m="text-search", r=TO)), ut("2BR/1BA", 2, 1, None, V(20, "units", f, 7, "A1.1", m="text-search", r=TO)),
                ut("2BR/2BA", 2, 2, "945 gross (2E)", V(27, "units", f, 7, "A1.1", m="text-search", r=TO)), ut("3BR/2BA", 3, 2, "1,029-1,030 gross", V(29, "units", f, 7, "A1.1", m="text-search", r=TO))],
    parking={"required": V(154, "stalls", f, 7, "A1.1", m="text-search", r=TO), "provided": V(201, "stalls", f, 7, "A1.1", m="text-search", r=TO, note="148 std 9x18 + 53 compact 9x16"),
             "accessible": V(8, "stalls", f, 7, "A1.1", m="text-search", r=TO), "type": "surface"},
    amenities=["recreation center 3,494 sf", "common open space 6,839 sf"], access=["resident-only gated access"],
    project_rules=[rule("private outdoor open space", 40, "sf/unit")],
    reconciliation=[rec("unit mix", "40+20+27+29=116", "consistent"), rec("GFA", "92,306+1,506+3,494+23,175=120,481", "consistent"),
                    rec("floors", "33,112+2x31,633+24,103=120,481", "consistent"), rec("parking", "148+53=201", "consistent")],
    open_questions=["not visually reviewed (text-only); footprint dims"],
)
f = O + "P37_Terracina_at_Fiddyment/001_Terracina_at_Fiddyment.pdf"
C2 = "C2"
P["P37"] = dict(
    name="Terracina at Fiddyment", location="Roseville, CA", family="roseville-usa-properties-bassenian", partition="dev",
    forms=["garden-breezeway", "carport"], overlays=["affordable"],
    documents=[doc(f, [3, 9], [(3, C2, "Preliminary site plan", "2nd submittal 2024-02-09", "2024-04-01"), (9, "A.2", "Residential bldg plan floors 2-3", None, None)])],
    site={"area_gross_ac": V(10.882, "ac", f, 3, C2), "area_net_ac": V(9.848, "ac", f, 3, C2), "units": V(265, "units", f, 3, C2),
          "density_du_ac": V(26.9, "du/ac", f, 3, C2, note="net"), "zoning": V("R3 / HDR, West Roseville SP", None, f, 3, C2),
          "max_height_ft": V(45, "ft", f, 3, C2), "max_lot_coverage_pct": V(50, "%", f, 3, C2),
          "common_open_space_sf": V(14509, "sf", f, 3, C2, note="required 10,600")},
    buildings=[
        bldg("A24", "Type A 24-plex, 3-story", V(11, "bldg", f, 3, C2, note="bldgs 2-12"), V(3, "floors", f, 3, C2), "bar",
             V(154, "ft", f, 3, C2, m="scaled-measurement", c="low", s="measured", note="graphic scale 1\"=30' (0-60 ft = 144 pt); bldg 10; +/-5 ft"),
             V(54, "ft", f, 3, C2, m="scaled-measurement", c="low", s="measured"), U("sf"), V(24, "units", f, 3, C2),
             V(8, "units/floor", f, 9, "A.2", m="text-search", r=TO), {"1BR": 6, "2BR": 12, "3BR": 6}, "breezeway (2 open stair halls)",
             V(2, "stairs", f, 3, C2, c="medium", note="seen on site plan building outline"), U(), "surface + carports", V(22979, "sf", f, 3, C2)),
        bldg("CLUB", "Clubhouse 2-story with manager unit", 1, V(2, "floors", f, 3, C2), U(), U("ft"), U("ft"), U("sf"), V(1, "units", f, 3, C2), None, {"2BR": 1}, None, None, None, None,
             V(6981, "sf", f, 3, C2, note="5,542 club + 1,529 manager unit")),
    ],
    unit_types=[ut("1BR", 1, None, None, V(66, "units", f, 3, C2)), ut("2BR", 2, None, None, V(133, "units", f, 3, C2)), ut("3BR", 3, None, None, V(66, "units", f, 3, C2))],
    parking={"required": V(365, "stalls", f, 3, C2, note="density bonus 65915(p)(1): 1/1BR, 1.5/2-3BR"), "provided": V(436, "stalls", f, 3, C2),
             "carport": V(120, "stalls", f, 3, C2, note="0.45/unit"), "uncovered": V(316, "stalls", f, 3, C2), "accessible": V(23, "stalls", f, 3, C2),
             "stall_d_ft": V(18, "ft", f, 3, C2, m="printed-dimension", c="medium"), "drive_aisle_ft": V(26, "ft", f, 3, C2, m="printed-dimension", c="medium"),
             "type": "surface + carports"},
    amenities=["pool", "clubhouse", "laundry buildings", "common open spaces COS 1-5"], access=["Harvey Way driveways (35' and 43')", "Fiddyment Rd frontage (no driveway noted)"],
    project_rules=[rule("building setback front", 20, "ft"), rule("building setback side street", 20, "ft"), rule("building setback side interior", 5, "ft"),
                   rule("building setback rear", 20, "ft"), rule("landscape setback Harvey Way", 20, "ft"), rule("landscape setback Fiddyment Rd", 36, "ft"),
                   rule("common open space", 40, "sf/unit"), rule("max lot coverage", 50, "%")],
    reconciliation=[rec("units by building", "11 x 24 + 1 manager = 265", "consistent"), rec("mix", "11x6=66; 11x12+1=133; 11x6=66", "consistent"),
                    rec("parking required", "66 + 200 + 99 = 365", "consistent"), rec("parking provided", "120 + 316 = 436", "consistent"),
                    rec("density", "265/9.848 = 26.9", "consistent"),
                    rec("footprint vs gross", "154x54=8,316 sf vs 22,979/3=7,660 sf/floor", "consistent", "outline includes open stair halls")],
    open_questions=["unit sizes"],
)

# ---------------------------------------------------------------- E053 Portland Road
el, ef = E + "E053_Portland_Road_Apartments/002_Ex_A_Preliminary_Land_Use_Plans.pdf", E + "E053_Portland_Road_Apartments/001_Ex_B_Preliminary_Floor_Plans_and_Elevations.pdf"
P["E053"] = dict(
    name="Portland Road Townhomes", location="Salem, OR", family="portland-road-salem", partition="dev",
    forms=["townhome", "tuck-under", "retail-pad", "mixed-use"], overlays=[],
    documents=[doc(el, [7], [(7, "C100", "Preliminary site plan - overall (AKS)", None, "2025-05-16")]),
               doc(ef, [1, 3, 4], [(1, None, "Project information", "land use review", "2025-05-02"), (3, "A2", "Floor plan commercial retail", "land use review", "2025-05-02"),
                                   (4, "A3", "Floor plans building A.1", "land use review", "2025-05-02")])],
    site={"units": V(74, "units", ef, 1, None, m="text-search", r=TO, note="scope reads '74 TOWNHOME BUILDINGS'; manifest '74-unit'; site plan shows 19 townhome buildings"),
          "buildings": V(20, "buildings", el, 7, "C100", note="19 townhome buildings + 1 retail"), "zoning": V("MU-III", None, ef, 1, None, m="text-search", r=TO),
          "area_ac": U("ac", "not found on reviewed pages"), "common_open_space_sf": V(13229, "sf", el, 7, "C100", note="7,676 (playground) + 5,553")},
    buildings=[
        bldg("A.1", "Townhome row A.1 (4 units, 2-story, tuck-in garage)", V(6, "bldg", el, 7, "C100", note="bldgs 10-15"), V(2, "floors", ef, 4, "A3"), "row",
             V(80.0, "ft", ef, 4, "A3", m="printed-dimension", note="face of finish; 4 x 19'-11\""), V(42.0, "ft", ef, 4, "A3", m="printed-dimension"), D(3360, "sf", ef, 4, "A3", "80x42"),
             V(4, "units", ef, 4, "A3"), None, {"3BR": 4}, "exterior entry", None, 0, "1-car garage per unit (11'x22') at ground floor", D(6720, "sf", ef, 4, "A3", "3,360 x 2 floors", c="medium")),
        bldg("A.2", "Townhome row A.2", V(2, "bldg", el, 7, "C100"), U(), "row", V(80.0, "ft", ef, 7, None, m="text-search", r=TO), V(42.0, "ft", ef, 7, None, m="text-search", r=TO),
             U("sf"), U("units"), None, {}, "exterior entry", None, 0, "garage", U("sf")),
        bldg("B", "Townhome row B", V(9, "bldg", el, 7, "C100"), U(), "row", V(83.83, "ft", ef, 10, None, m="text-search", r=TO), V(46.0, "ft", ef, 10, None, m="text-search", c="low", r=TO),
             U("sf"), U("units"), None, {"2BR": "?", "3BR": "?"}, "exterior entry", None, 0, "garage", U("sf")),
        bldg("C", "Townhome row C", V(2, "bldg", el, 7, "C100"), U(), "row", V(75.0, "ft", ef, 13, None, m="text-search", r=TO), V(42.0, "ft", ef, 13, None, m="text-search", c="low", r=TO),
             U("sf"), U("units"), None, {}, "exterior entry", None, 0, "garage", U("sf")),
        bldg("RETAIL", "Stand-alone commercial retail (3 suites)", V(1, "bldg", el, 7, "C100"), V(1, "floors", ef, 3, "A2"), "rect",
             V(60.0, "ft", ef, 3, "A2", m="printed-dimension"), V(76.0, "ft", ef, 3, "A2", m="printed-dimension"), D(4560, "sf", ef, 3, "A2", "60x76; scope says ~4,500 sf"),
             0, None, {}, None, None, 0, "surface", D(4560, "sf", ef, 3, "A2", "1 story"), height_ft=V(20, "ft", ef, 3, "A2", m="printed-dimension", note="top of parapet"),
             suites=V(3, "suites", ef, 3, "A2"), note="drive-thru elevation shown"),
    ],
    unit_types=[ut("A.1 townhome 3BR", 3, None, None, V(24, "units", el, 7, "C100", note="6 bldgs x 4"))],
    parking={"type": "attached garages + surface (retail)", "provided": U("stalls"), "stall_d_ft": V(18, "ft", el, 7, "C100", m="printed-dimension", c="medium", note="driveway aprons 18-20'")},
    amenities=["common open space with playground (7,676 sf)", "gazebo/common open space (5,553 sf)", "mailbox", "trash enclosure"],
    access=["Portland Road NE (Pacific Hwy 99E): main drive + exit-only", "sliding gates on internal drives"],
    project_rules=[rule("drive aisle width (internal)", 22, "ft"), rule("perimeter setback (north/east)", 10, "ft"), rule("setback Portland Rd frontage (bldgs)", 20, "ft"),
                   rule("fence height in Portland Rd setback", 4, "ft")],
    reconciliation=[rec("units by type", "A.1 6x4=24; A.2 2x4=8 (assumed same 80' row); B 9 and C 2 bldgs must hold 42 units", "unknown",
                        "9x4 + 2x3 = 42 would close to 74 but B/C unit counts were not read; do not rely"),
                    rec("retail area", "60x76 = 4,560 vs '~4,500 sf'", "consistent")],
    open_questions=["site area", "unit counts for types A.2/B/C", "parking count"],
)

# ---------------------------------------------------------------- E054 Anderson Apartments
f = E + "E054_Anderson_Apartments/001_Architectural_plan_set.pdf"
P["E054"] = dict(
    name="Anderson Apartments", location="Redmond, WA", family="anderson-redmond", partition="holdout",
    forms=["podium", "courtyard", "mid-rise-corridor-elevator", "mixed-use"], overlays=[],
    documents=[doc(f, [1, 5, 6, 7, 11], [(1, None, "Cover / project data", "land use submittal", "2025-03-31"), (6, "A0.23", "Zoning diagrams (ground floor facade)", None, "2025-03-31"),
                                         (7, "A0.24", "Open space diagrams", None, "2025-03-31"), (11, None, "Building sections / heights", None, None)])],
    site={"area_sf": V(81352, "sf", f, 1, None, m="text-search", r=TO), "area_ac": V(1.87, "ac", f, 1, None, m="text-search", r=TO),
          "units": V(172, "units", f, 1, None, m="text-search", r=TO), "density_du_ac": D(92, "du/ac", f, 1, None, "172/1.87", r=TO),
          "zoning": V("Anderson Park (AP)", None, f, 1, None, m="text-search", r=TO), "gsf": V(303800, "sf", f, 1, None, m="text-search", r=TO),
          "retail_sf": V(999, "sf", f, 1, None, m="text-search", r=TO), "amenity_sf": V(11620, "sf", f, 1, None, m="text-search", r=TO),
          "common_open_space_sf": V(25394, "sf", f, 7, "A0.24", note="L1 courtyard 24,992 + 402; required 16,249 (20% of site)"),
          "building_code_height_ft": V(69, "ft", f, 11, None, m="text-search", r=TO)},
    buildings=[bldg("MAIN", "U-shaped courtyard building: 2 Type IA levels (P1 + L1) below 5 Type VA levels", 1,
                    V(7, "levels incl. P1", f, 1, None, m="text-search", r=TO), "U (courtyard at L1 podium)",
                    V(292.75, "ft", f, 6, "A0.23", m="printed-dimension", note="NE 79th St ground floor facade length 292'-9\""),
                    V(207.5, "ft", f, 6, "A0.23", m="printed-dimension", c="medium", note="168th Ave NE facade 207'-6\""),
                    V(38701, "sf", f, 1, None, m="text-search", r=TO, note="L2 GFA; L1 37,722; P1 71,083"), V(172, "units", f, 1, None, m="text-search", r=TO),
                    D(34, "units/floor", f, 1, None, "172 / 5 residential levels (L2-L6), approx; L1 also has some units", c="low", r=TO), {},
                    "double-loaded corridor (U plan)", U(), U(), "structured: P1 below-grade/podium level", V(303800, "sf", f, 1, None, m="text-search", r=TO))],
    unit_types=[],
    parking={"provided": V(210, "stalls", f, 1, None, m="text-search", r=TO), "ratio_per_unit": D(1.22, "stalls/unit", f, 1, None, "210/172", r=TO), "type": "podium / below-grade structured (P1)"},
    amenities=["L1 landscaped courtyard (24,992 sf)", "11,620 sf common amenity", "public plazas"], access=["NE 79th St", "168th Ave NE"],
    project_rules=[rule("common open space", 20, "% of site"), rule("ground-floor street facade transparency/landscape", 60, "% of facade length")],
    reconciliation=[rec("GFA by level", "71,083+37,722+38,701+39,414+39,104+39,104+38,672 = 303,800", "consistent"),
                    rec("open space required", "81,352 x 0.20 = 16,270 vs printed 16,249", "discrepancy", "minor (21 sf)")],
    open_questions=["unit mix", "elevator/stair count", "visual review limited to A0.23/A0.24"],
)

# ---------------------------------------------------------------- write
out = os.path.join(REPO, "data", "reference", "projects")
os.makedirs(out, exist_ok=True)
man = {p["id"]: p for p in json.load(open(os.path.join(LIB, "04_Codex_Starter", "reference_manifest.json")))["projects"]}
for pid, body in P.items():
    o = {"schema": "rei.ref.project/1", "id": pid}
    o.update(body)
    o["manifest_name"] = man[pid]["name"]
    with open(os.path.join(out, pid + ".json"), "w") as fh:
        json.dump(o, fh, indent=2)
        fh.write("\n")
print(len(P), "fixtures")
