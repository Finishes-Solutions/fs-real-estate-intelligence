"""Search a library PDF's text layer for regexes and print short context snippets.

usage: python -I search_text.py [--lib LIB] REL_PDF_PATH [-p PAGES] [-w WIDTH] PATTERN [PATTERN...]
  -p  comma list / ranges of 1-based pages (default all)
  Also prints, per page, the number of text characters (0 = scanned raster page).
"""
import argparse
import os
import re
import sys

import pymupdf as fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refs_common import lib_root  # noqa: E402


def parse_pages(spec, n):
    if not spec:
        return list(range(1, n + 1))
    out = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += list(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return [p for p in out if 1 <= p <= n]


ap = argparse.ArgumentParser()
ap.add_argument("--lib")
ap.add_argument("pdf")
ap.add_argument("-p", "--pages")
ap.add_argument("-w", "--width", type=int, default=70)
ap.add_argument("-m", "--max", type=int, default=6, help="max hits per pattern per page")
ap.add_argument("--chars", action="store_true", help="only print char counts + first line per page")
ap.add_argument("patterns", nargs="*")
a = ap.parse_args()
doc = fitz.open(os.path.join(lib_root(a.lib), a.pdf))
rx = [re.compile(p, re.I) for p in a.patterns]
for pno in parse_pages(a.pages, doc.page_count):
    t = doc[pno - 1].get_text()
    flat = re.sub(r"\s+", " ", t)
    if a.chars:
        r = doc[pno - 1].rect
        print(f"p{pno} chars={len(flat)} size={r.width:.0f}x{r.height:.0f}pt :: {flat[:a.width]}")
        continue
    for r in rx:
        for k, m in enumerate(r.finditer(flat)):
            if k >= a.max:
                break
            s = max(0, m.start() - a.width)
            print(f"p{pno} [{r.pattern}] ...{flat[s:m.end() + a.width]}...")
