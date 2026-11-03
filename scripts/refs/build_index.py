"""Build data/reference/index.json from the library manifest plus the reviewed project fixtures.

usage: python -I build_index.py [--lib LIB] [--repo REPO] [--uses USES_TSV]
  --uses  optional output of scan_uses.py (keyword leads for retail/industrial/flex/mixed use)

Partitions are assigned per FAMILY. Families of reviewed fixtures take the partition written in the
fixture; other families get a stable hash-based split (~27% holdout). Grouped families are listed in
FAMILY_GROUPS below; ungrouped projects are their own family.
"""
import argparse
import glob
import hashlib
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refs_common import lib_root, load_manifest  # noqa: E402

FAMILY_GROUPS = {
    "sierra-vista-westbrook": ["P34", "P35", "P36"],
    "roseville-usa-properties-bassenian": ["P11", "P28", "P37"],
    "porterville-prototypes": ["P09", "P10"],
    "bellefield-hyde-park": ["E012", "E013", "E014"],
}
# Short review notes for projects (non-selected ones mainly record why / what a quick check found).
NOTES = {
    "P12": "text lead: 1,500 sf retail in 3-story massing (page 1-3 text); not reviewed",
    "P22": "text lead: 'retail ancillary' label on Moygaddy block plans; six duplex blocks per manifest; not reviewed",
    "P23": "text lead: retail line + goods lift + loading bay (Southgate); not reviewed",
    "P38": "keyword 'flex' is a FLEX circulation room label, not a flex-industrial use",
    "E001": "text lead: 'new mixed-use residential' (Reserves at Meadows); not reviewed",
    "E025": "text lead: mixed-use mentions (Clarendon Square); not reviewed",
    "E051": "text lead: retail/office mentions in East Park Ph II set; not reviewed",
    "P27": "reviewed: 226,386 gsf retail + 1,954,613 gsf office alongside 2,669 units (mixed-use master plan)",
    "E053": "reviewed: stand-alone ~4,500 sf commercial retail pad (3 suites, drive-thru elevation) with 19 townhome rows",
    "E054": "reviewed (partly text): 999 sf ground-floor retail in podium building",
    "P18": "79 raster pages; no text layer",
    "P17": "architectural/site sheets are raster; values read visually",
}

FORM_RULES = [
    ("townhome", r"town ?home|townhouse|terraced"),
    ("duplex", r"duplex"),
    ("garden-breezeway", r"garden"),
    ("podium", r"podium"),
    ("tower-on-podium", r"tower"),
    ("mixed-use", r"mixed[- ]use"),
    ("rehab-conversion", r"rehab|conversion|adaptive|historic|renovation|remodel|reuse"),
    ("senior", r"senior"),
]
FORMS_ORDER = ["garden-breezeway", "garden-exterior-entry", "townhome", "duplex", "cottage-detached", "courtyard",
               "mid-rise-corridor-elevator", "tuck-under", "podium", "wrap", "tower-on-podium", "garage-detached", "carport",
               "retail-pad", "mixed-use", "rehab-conversion"]
OVERLAYS = ["senior", "affordable"]


def stable_holdout(family, pct=22):
    return int(hashlib.sha256(family.encode()).hexdigest(), 16) % 100 < pct


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lib")
    ap.add_argument("--repo", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    ap.add_argument("--uses")
    a = ap.parse_args()
    lib = lib_root(a.lib)
    man = load_manifest(lib)
    refdir = os.path.join(a.repo, "data", "reference")
    fx = {}
    for p in sorted(glob.glob(os.path.join(refdir, "projects", "*.json"))):
        o = json.load(open(p))
        fx[o["id"]] = o
    fam_of = {pid: fam for fam, ids in FAMILY_GROUPS.items() for pid in ids}
    fam_part = {}
    for o in fx.values():
        fam_of[o["id"]] = o["family"]
        if fam_part.setdefault(o["family"], o["partition"]) != o["partition"]:
            sys.exit(f"family {o['family']} has mixed partitions")
    docs = defaultdict(lambda: [0, 0, []])
    for d in man["documents"]:
        r = docs[d["project_id"]]
        r[0] += 1
        r[1] += d.get("pages") or 0
        r[2].append(d["document_title"])
    uses = defaultdict(dict)
    if a.uses and os.path.exists(a.uses):
        for line in open(a.uses):
            pid, cls, n, _ = line.rstrip("\n").split("\t", 3)
            uses[pid][cls] = uses[pid].get(cls, 0) + int(n)
    rows = []
    for p in man["projects"]:
        pid = p["id"]
        fam = fam_of.get(pid, pid.lower())
        if fam not in fam_part:
            fam_part[fam] = "holdout" if stable_holdout(fam) else "dev"
        text = " ".join([p["name"], p["description"]] + docs[pid][2]).lower()
        guess = [f for f, rx in FORM_RULES if re.search(rx, text)]
        sel = pid in fx
        reviewed = sel and any('"visually-reviewed"' in json.dumps(v) for v in [fx[pid]])
        row = {"id": pid, "name": p["name"], "location": p["location"], "family": fam, "partition": fam_part[fam],
               "forms_guess": sorted(set((fx[pid]["forms"] + fx[pid].get("overlays", [])) if sel else guess)) or ["multifamily-unspecified"],
               "selected": sel, "visually_reviewed": reviewed, "docs": docs[pid][0], "pages": docs[pid][1],
               "notes": ""}
        if uses.get(pid):
            row["keyword_leads"] = uses[pid]
        rows.append(row)
    # coverage
    form_cov = {}
    for f in FORMS_ORDER + OVERLAYS:
        have = [r for r in rows if f in r["forms_guess"]]
        form_cov[f] = {"projects": len(have), "selected": sum(r["selected"] for r in have),
                       "visually_reviewed": sum(r["visually_reviewed"] for r in have)}
    use_fam = {"multifamily": lambda r: True,
               "retail": lambda r: "retail-pad" in r["forms_guess"] or "retail" in r.get("keyword_leads", {}),
               "industrial": lambda r: "industrial" in r.get("keyword_leads", {}),
               "flex": lambda r: "flex" in r.get("keyword_leads", {}),
               "mixed_use": lambda r: "mixed-use" in r["forms_guess"] or "mixed_use" in r.get("keyword_leads", {})}
    fam_cov = {k: {"projects_with_leads": sum(fn(r) for r in rows), "visually_reviewed": sum(fn(r) and r["visually_reviewed"] for r in rows)}
               for k, fn in use_fam.items()}
    out = {"schema": "rei.ref.index/1", "library_manifest": "04_Codex_Starter/reference_manifest.json",
           "projects": rows, "coverage": {"by_form": form_cov, "by_use_family": fam_cov,
                                          "families": len(set(r["family"] for r in rows)),
                                          "holdout_families": sorted({r["family"] for r in rows if r["partition"] == "holdout"})}}
    return out, refdir


if __name__ == "__main__":
    out, refdir = main()
    for r in out["projects"]:
        r["notes"] = NOTES.get(r["id"], r["notes"])
    with open(os.path.join(refdir, "index.json"), "w") as fh:
        json.dump(out, fh, indent=2)
        fh.write("\n")
    print("index:", len(out["projects"]), "projects")
