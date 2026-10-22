#!/usr/bin/env python3
"""Put the five renderings on one 24 x 36 sheet (R-1, Finishes Solutions title block) with a key plan of the camera
positions and notes on how they were made, and (with --update) add them to the project's `renders` so fs-set-plans
draws them as A-901 to A-905 the next time the set is built.

    python3 scripts/render_sheet.py project.json renders/ [--update]

Reads renders/renders.json (written by render_views.py). Writes renders/<slug>-renderings.pdf. Needs reportlab, pypdf."""
import argparse
import io
import json
import math
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from reportlab.pdfgen import canvas  # noqa: E402
from reportlab.lib.utils import ImageReader  # noqa: E402
from pypdf import PdfReader, PdfWriter  # noqa: E402
from fsrender import kit as K  # noqa: E402
from fsrender import geom as G  # noqa: E402
from fsrender.kit import F, FB  # noqa: E402

BORDER = os.path.join(HERE, '..', 'assets', 'titleblock.pdf')
K.PRELIMINARY_TEXT = ('Conceptual renderings: AI concept illustrations painted over a 3D massing model built from the site layout and the '
                      'schematic design set. Building placement, size and openings follow the drawings; materials, landscaping, cars, '
                      'people and surroundings are illustrative. Not a representation of the final design.')


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or 'site').lower()).strip('-')


def key_plan(c, p, views, x, y, w, h):
    s = p['site']
    B = [tuple(q) for q in s['boundary']]
    rot = float(s.get('display_rotate_deg', 0))
    cen = G.centroid(B)
    T = lambda q: G.rotate(q, rot, cen)
    pts = [T(q) for q in B]
    x0, y0, x1, y1 = G.bbox(pts)
    k = min((w - 70) / (x1 - x0), (h - 60) / (y1 - y0))
    ox, oy = x + w / 2 - (x0 + x1) / 2 * k, y + h / 2 - (y0 + y1) / 2 * k + 6

    def P(q):
        t = T(q)
        return (ox + t[0] * k, oy + t[1] * k)

    def poly(Q, fill=None, stroke=K.INK, lw=0.5):
        K.draw_poly(c, [P(q) for q in Q], stroke=stroke, fill=fill, lw=lw)

    for pv in s.get('paving', []):
        poly(pv['poly'], fill=(0.85, 0.85, 0.85), stroke=None)
    for pd in s.get('ponds', []):
        poly(pd['poly'], fill=(0.75, 0.87, 0.95), stroke=None)
    for b in s.get('buildings', []):
        Q = b.get('poly') or G.rect_poly(b['x'], b['y'], b['w'], b['d'], b.get('rot', 0))
        poly(Q, fill=(0.55, 0.55, 0.55), lw=0.6)
    poly(B, lw=1.4)
    cx, cy = x + w / 2, y + h / 2
    for i, v in enumerate(views):
        cam = v.get('camera')
        if not cam:
            continue
        a, t = P(cam['pos'][:2]), P(cam['target'][:2])
        # cameras far outside the plan sit on its edge, pointing in
        dx, dy = a[0] - cx, a[1] - cy
        lim = min((w / 2 - 14) / abs(dx) if dx else 1e9, (h / 2 - 14) / abs(dy) if dy else 1e9, 1.0)
        a = (cx + dx * lim, cy + dy * lim)
        ang = math.atan2(t[1] - a[1], t[0] - a[0])
        c.setStrokeColorRGB(*K.RED)
        c.setLineWidth(1)
        c.line(a[0], a[1], a[0] + math.cos(ang) * 26, a[1] + math.sin(ang) * 26)
        c.setFillColorRGB(*K.RED)
        c.circle(a[0], a[1], 8, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1)
        c.setFont(FB, 8)
        c.drawCentredString(a[0], a[1] - 3, str(i + 1))
    K.north_arrow(c, x + w - 24, y + h - 26, float(s.get('north_deg', 0)) - rot, 30)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project')
    ap.add_argument('renders')
    ap.add_argument('--update', action='store_true', help="add the renderings to the project's renders (a .bak copy is kept)")
    a = ap.parse_args()
    p = json.load(open(a.project))
    man = json.load(open(os.path.join(a.renders, 'renders.json')))
    views = [v for v in man['views'] if v.get('file')]
    if not views:
        raise SystemExit('No renderings in renders.json yet.')
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(K.PAGE_W, K.PAGE_H))
    ax, ay, aw, ah = K.AREA
    gap, cap = 16, 30
    imgs = [ImageReader(os.path.join(a.renders, v['file'])) for v in views]
    asp = imgs[0].getSize()[1] / imgs[0].getSize()[0]
    rows = [views[:2], views[2:5]] if len(views) > 2 else [views]
    yy = ay + ah
    n = 0
    for row in rows:
        wi = (aw - gap * (len(row) - 1)) / len(row)
        hi = wi * asp
        for j, v in enumerate(row):
            xx = ax + j * (wi + gap)
            c.drawImage(imgs[n], xx, yy - hi, wi, hi)
            c.setStrokeColorRGB(*K.INK)
            c.setLineWidth(0.6)
            c.rect(xx, yy - hi, wi, hi, stroke=1, fill=0)
            K.view_title(c, xx, yy - hi - 22, n + 1, v['label'], None, None, 'AI concept illustration · %s · %s' % (v.get('model', ''), v.get('made', '')[:10]))
            n += 1
        yy -= hi + cap + gap
    band = yy - ay
    if band > 120:
        kw = min(560, aw * 0.3)
        y = K.heading(c, ax, yy, kw, 'Key plan: camera positions')
        key_plan(c, p, views, ax, ay, kw, y - ay - 4)
        x2 = ax + kw + 30
        notes = [
            'Each picture was painted by the image model (%s, high quality) over a 3D massing model built directly from the site '
            'layout and the drawing set: building footprints, heights, roofs, storefront / window / door openings, paving, parking, '
            'ponds and trees are placed from the drawings.' % (views[0].get('model') or 'GPT Image'),
            'Materials follow the exterior notes of the drawing set%s. Cars, people, plantings, light poles, signage and the '
            'surroundings beyond the property line are illustrative.' % (' and its elevation sheets' if man.get('refs') else ''),
            'Midday light (sun high from the south). Each picture was checked against its massing; outline agreement: %s.' % '; '.join(
                '%d %s%s' % (i + 1, ('%.0f%%' % (100 * v['fidelity'])) if v.get('fidelity') is not None else 'n/a', ' (reviewed)' if v.get('flagged') else '')
                for i, v in enumerate(views)),
            'Concept illustrations for marketing and coordination, not a representation of the final design. The design is subject to change '
            'and to review by licensed professionals and the authority having jurisdiction.']
        y = K.heading(c, x2, yy, aw - kw - 30, 'Notes')
        K.numbered(c, x2, y, aw - kw - 30, notes, size=8.5, min_y=ay)
    pr = dict(p.get('project') or {})
    pr.setdefault('phase', 'Schematic design')
    K.title_block(c, pr, dict(number='R-1', title='Conceptual renderings', sub='%d views · midday' % len(views), scale='N.T.S.'))
    c.showPage()
    c.save()
    border = PdfReader(BORDER).pages[0]
    w = PdfWriter()
    page = w.add_blank_page(width=K.PAGE_W, height=K.PAGE_H)
    page.merge_page(border)
    page.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
    out = os.path.join(a.renders, slug(pr.get('name')) + '-renderings.pdf')
    with open(out, 'wb') as f:
        w.write(f)
    print('Wrote %s (%d views).' % (out, len(views)))
    if a.update:
        base = os.path.dirname(os.path.abspath(a.project))
        p['renders'] = [dict(file=os.path.relpath(os.path.join(os.path.abspath(a.renders), v['file']), base),
                             caption='%s. AI concept illustration over a massing model of the drawings; materials and surroundings illustrative.' % v['label'])
                        for v in views]
        shutil.copy(a.project, a.project + '.bak')
        json.dump(p, open(a.project, 'w'), indent=1)
        print('Added %d renderings to %s (backup .bak): rebuild the set with fs-set-plans to get sheets A-901 to A-9%02d.' % (len(views), a.project, len(views)))


if __name__ == '__main__':
    main()
