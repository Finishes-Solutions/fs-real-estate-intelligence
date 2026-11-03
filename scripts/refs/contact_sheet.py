"""Render many pages of a library PDF as one labelled contact-sheet PNG (for triage).

usage: python -I contact_sheet.py [--lib LIB] REL_PDF -p PAGES -o OUT.png [--cols 4] [--width 2400]
"""
import argparse
import math
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
ap.add_argument("--cols", type=int, default=4)
ap.add_argument("--width", type=int, default=2400)
a = ap.parse_args()
src = fitz.open(os.path.join(lib_root(a.lib), a.pdf))
pages = []
for part in a.pages.split(","):
    if "-" in part:
        x, y = part.split("-")
        pages += range(int(x), int(y) + 1)
    else:
        pages.append(int(part))
pages = [p for p in pages if 1 <= p <= src.page_count]
cw, ch = 600, 420
rows = math.ceil(len(pages) / a.cols)
out = fitz.open()
sheet = out.new_page(width=cw * a.cols, height=ch * rows)
for i, p in enumerate(pages):
    r, c = divmod(i, a.cols)
    cell = fitz.Rect(c * cw + 4, r * ch + 18, (c + 1) * cw - 4, (r + 1) * ch - 4)
    sheet.show_pdf_page(cell, src, p - 1)
    sheet.insert_text((c * cw + 6, r * ch + 14), f"p{p}", fontsize=14, color=(1, 0, 0))
    sheet.draw_rect(fitz.Rect(c * cw, r * ch, (c + 1) * cw, (r + 1) * ch), color=(0.6, 0.6, 0.6), width=0.5)
zoom = a.width / sheet.rect.width
sheet.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False).save(a.out)
print(a.out)
