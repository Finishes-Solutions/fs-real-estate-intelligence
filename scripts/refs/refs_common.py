"""Shared helpers for the reference-library extraction scripts.

The library root comes from --lib or the REI_REF_LIB environment variable.
PDFs are read in place and never copied into the repo.
"""
import csv
import json
import os
import sys

DEFAULT_LIB_HINT = (
    "~/Finishes Marketing Dropbox/Matthew Sinitiere/NEW MK/MATTHEW/REAL ESTATE INTELLIGENCE/"
    "MULTIFAMILY DATA/REI_Complete_Reference_Library"
)


def lib_root(cli_value=None):
    root = cli_value or os.environ.get("REI_REF_LIB") or os.path.expanduser(DEFAULT_LIB_HINT)
    if not os.path.isdir(root):
        sys.exit(f"reference library not found: {root} (set REI_REF_LIB or pass --lib)")
    return root


def load_manifest(lib):
    with open(os.path.join(lib, "04_Codex_Starter", "reference_manifest.json")) as f:
        return json.load(f)


def load_inventory(lib):
    by_sha = {}
    with open(os.path.join(lib, "ARCHIVE_FILE_INVENTORY.csv"), newline="") as f:
        for row in csv.DictReader(f):
            by_sha.setdefault(row["sha256"], []).append(row["path"])
    return by_sha


def resolve_documents(lib):
    """Return manifest documents with a 'file' key (path relative to lib) matched by sha256."""
    man = load_manifest(lib)
    inv = load_inventory(lib)
    out = []
    for d in man["documents"]:
        paths = [p for p in inv.get(d["sha256"], []) if p.lower().endswith(".pdf")]
        rec = dict(d)
        rec["file"] = paths[0] if paths else None
        out.append(rec)
    return man, out
