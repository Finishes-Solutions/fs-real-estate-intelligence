# Render one page of a reference PDF to a PNG (for the holdout evaluation sheet; the library stays outside Git).
#   python -I scripts/refs/render-page.py <pdf> <page (1-based)> <out.png> [width_px]
import sys
import fitz  # PyMuPDF

pdf, page, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
width = int(sys.argv[4]) if len(sys.argv) > 4 else 1400
doc = fitz.open(pdf)
p = doc[page - 1]
zoom = width / p.rect.width
p.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False).save(out)
print(out, p.rect.width, p.rect.height)
