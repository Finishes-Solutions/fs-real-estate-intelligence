"""Render library PDF pages (or a crop of one) to PNG for visual review.

usage: python -I render_pages.py [--lib LIB] REL_PDF_PATH -p PAGES -o OUTDIR [--width PX]
          [--crop x0,y0,x1,y1]   (fractions 0-1 of the page, e.g. 0.6,0,1,0.5 = top-right)
PNG output goes to OUTDIR (keep it outside the repo and outside the library).
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
ap.add_argument("-p", "--pages", required=True)
ap.add_argument("-o", "--out", required=True)
ap.add_argument("--width", type=int, default=2000)
ap.add_argument("--crop")
ap.add_argument("--tag", default="")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
doc = fitz.open(os.path.join(lib_root(a.lib), a.pdf))
pages = []
for part in a.pages.split(","):
    if "-" in part:
        x, y = part.split("-")
        pages += range(int(x), int(y) + 1)
    else:
        pages.append(int(part))
stem = a.tag or os.path.splitext(os.path.basename(a.pdf))[0][:40]
for p in pages:
    page = doc[p - 1]
    r = page.rect
    clip = r
    if a.crop:
        x0, y0, x1, y1 = (float(v) for v in a.crop.split(","))
        clip = fitz.Rect(r.x0 + x0 * r.width, r.y0 + y0 * r.height, r.x0 + x1 * r.width, r.y0 + y1 * r.height)
    zoom = a.width / clip.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
    suffix = "_crop" + a.crop.replace(",", "_") if a.crop else ""
    fn = os.path.join(a.out, f"{stem}_p{p}{suffix}.png")
    pix.save(fn)
    print(fn, f"{pix.width}x{pix.height}", f"page={r.width:.0f}x{r.height:.0f}pt")
