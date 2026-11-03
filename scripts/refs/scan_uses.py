"""Scan page-1..N text of every manifest document for non-multifamily use keywords.

usage: python -I scan_uses.py [--lib LIB] [--pages 3] > hits.tsv
Prints project_id, keyword class, hit count, file. Text-only triage: a hit is a lead to review,
not evidence of a retail/industrial/flex program.
"""
import argparse
import os
import re
import sys
from collections import defaultdict

import pymupdf as fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refs_common import lib_root, resolve_documents  # noqa: E402

CLASSES = {
    "retail": r"\bRETAIL\b|\bCOMMERCIAL (SPACE|RETAIL|USE)\b",
    "industrial": r"\bINDUSTRIAL\b|\bWAREHOUSE\b|\bDISTRIBUTION CENTER\b|\bLOADING DOCK",
    "flex": r"\bFLEX\b(?! ?DUCT)|\bLIGHT INDUSTRIAL\b|\bSHOWROOM\b",
    "office": r"\bOFFICE (USE|BUILDING|SPACE|GSF|PARKING)\b",
    "mixed_use": r"\bMIXED[- ]USE\b",
}
ap = argparse.ArgumentParser()
ap.add_argument("--lib")
ap.add_argument("--pages", type=int, default=3)
a = ap.parse_args()
lib = lib_root(a.lib)
_, docs = resolve_documents(lib)
agg = defaultdict(int)
for d in docs:
    try:
        doc = fitz.open(os.path.join(lib, d["file"]))
    except Exception as e:  # malformed PDFs exist in the corpus
        print(f"{d['project_id']}\tERROR\t0\t{d['file']}\t{e}", file=sys.stderr)
        continue
    text = " ".join(doc[i].get_text() for i in range(min(a.pages, doc.page_count))).upper()
    for k, rx in CLASSES.items():
        n = len(re.findall(rx, text))
        if n:
            print(f"{d['project_id']}\t{k}\t{n}\t{d['file']}")
