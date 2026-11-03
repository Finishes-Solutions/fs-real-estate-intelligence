"""List vector drawing paths whose bounding box lies inside a page region, for scaled measurement.

usage: python -I drawings_in.py [--lib LIB] REL_PDF -p PAGE --region x0,y0,x1,y1 [--min W]
  region is in fractions of the page (0-1). Prints each path's bbox in PDF points
  (x0,y0,x1,y1,width,height). Measure a graphic scale bar and a building outline in the
  same units, then feet = points * (scale_feet / scale_points).
"""
import argparse
import os
import sys

import pymupdf as fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refs_common import lib_root  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--lib")
ap.add_argument("pdf")
ap.add_argument("-p", "--page", type=int, required=True)
ap.add_argument("--region", required=True)
ap.add_argument("--min", type=float, default=5.0, help="min bbox width or height (pt)")
ap.add_argument("--limit", type=int, default=60)
a = ap.parse_args()
page = fitz.open(os.path.join(lib_root(a.lib), a.pdf))[a.page - 1]
R = page.rect
x0, y0, x1, y1 = (float(v) for v in a.region.split(","))
reg = fitz.Rect(R.x0 + x0 * R.width, R.y0 + y0 * R.height, R.x0 + x1 * R.width, R.y0 + y1 * R.height)
rows = []
for d in page.get_drawings():
    r = d["rect"]
    if reg.contains(r) and max(r.width, r.height) >= a.min:
        rows.append((round(r.width * r.height), r))
rows.sort(key=lambda t: -t[0])
print(f"region pt: {reg}")
for _, r in rows[: a.limit]:
    print(f"{r.x0:8.1f} {r.y0:8.1f} {r.x1:8.1f} {r.y1:8.1f}  w={r.width:7.1f} h={r.height:7.1f}")
