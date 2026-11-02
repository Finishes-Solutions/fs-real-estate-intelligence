#!/usr/bin/env python3
"""Pull site geometry out of a reference drawing so the project model starts from the drawing's own coordinates.

    python3 scripts/extract_geometry.py site.dxf  --acres 7.71 --out intake/
    python3 scripts/extract_geometry.py site.dwg  --acres 7.71 --out intake/     (converted to DXF first)
    python3 scripts/extract_geometry.py plan.pdf  --acres 7.71 --out intake/ [--page 1] [--scale 60]
    python3 scripts/extract_geometry.py sketch.jpg --acres 7.71 --out intake/

Writes intake/geometry.json (layers, closed shapes with areas, text with positions, the boundary candidates ranked
against the acreage) and intake/preview.png (the drawing with the best boundary candidate in red and every closed
shape numbered). Images and scanned PDFs get intake/grid.png instead: the picture with a labelled pixel grid to trace
from, then scripts/fit_site.py scales the traced model to the acreage.

--acres is the total site acreage the user gave. It is the basis for checking (or, for sketches, setting) the scale.
Needs: ezdxf (DXF / DWG), pdfplumber (PDF), Pillow (images, previews)."""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys

SQFT_ACRE = 43560.0
# DXF $INSUNITS -> feet per drawing unit (0 = unitless: civil drawings are almost always feet; flagged)
INSUNITS_FT = {0: 1.0, 1: 1 / 12, 2: 1.0, 3: 5280.0, 4: 1 / 304.8, 5: 1 / 30.48, 6: 3.28084, 10: 3.0, 21: 1.0}
UNIT_NAME = {0: 'unitless (assumed feet)', 1: 'inches', 2: 'feet', 3: 'miles', 4: 'millimetres', 5: 'centimetres', 6: 'metres', 10: 'yards', 21: 'US survey feet'}
BOUNDARY_LAYER = re.compile(r'prop|bound|\bpl\b|p-line|pline|lot.?line|site|parcel|tract|row', re.I)


def area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2


def bbox(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return [min(xs), min(ys), max(xs), max(ys)]


def chain(segments, tol):
    """joins loose segments end to end -> (closed polygons, open polylines)"""
    segs = [list(s) for s in segments if len(s) >= 2]
    closed, opened = [], []
    key = lambda p: (round(p[0] / tol), round(p[1] / tol))
    while segs:
        cur = segs.pop()
        grown = True
        while grown:
            grown = False
            for i, s in enumerate(segs):
                if key(s[0]) == key(cur[-1]):
                    cur += s[1:]
                elif key(s[-1]) == key(cur[-1]):
                    cur += s[::-1][1:]
                elif key(s[-1]) == key(cur[0]):
                    cur = s + cur[1:]
                elif key(s[0]) == key(cur[0]):
                    cur = s[::-1] + cur[1:]
                else:
                    continue
                segs.pop(i)
                grown = True
                break
        if len(cur) >= 4 and key(cur[0]) == key(cur[-1]):
            closed.append(cur[:-1])
        else:
            opened.append(cur)
    return closed, opened


# ---------- DXF / DWG ----------
def dwg_to_dxf(path, out):
    dst = os.path.join(out, os.path.splitext(os.path.basename(path))[0] + '.dxf')
    if shutil.which('dwg2dxf'):
        subprocess.run(['dwg2dxf', '-y', '-o', dst, path], check=False, capture_output=True)
        if os.path.exists(dst):
            return dst
    oda = shutil.which('ODAFileConverter')
    if oda:
        src_dir = os.path.dirname(os.path.abspath(path))
        subprocess.run([oda, src_dir, out, 'ACAD2018', 'DXF', '0', '1', os.path.basename(path)], check=False, capture_output=True)
        if os.path.exists(dst):
            return dst
    try:
        from ezdxf.addons import odafc  # uses the ODA converter when installed
        odafc.convert(path, dst, version='R2018')
        if os.path.exists(dst):
            return dst
    except Exception:  # noqa: BLE001
        pass
    sys.exit('This DWG could not be converted here (no LibreDWG dwg2dxf or ODA File Converter installed). '
             'Ask for a DXF export (AutoCAD: SAVEAS > AutoCAD 2018 DXF) or a vector PDF of the site plan.')


def read_dxf(path):
    import ezdxf
    from ezdxf import recover
    try:
        doc = ezdxf.readfile(path)
    except Exception:  # noqa: BLE001 — damaged files
        doc, _ = recover.readfile(path)
    units = int(doc.header.get('$INSUNITS', 0) or 0)
    k = INSUNITS_FT.get(units, 1.0)
    layers, texts = {}, []

    def add(layer, kind, pts):
        L = layers.setdefault(layer, {'closed': [], 'open': [], 'segments': []})
        L[kind].append([(round(x * k, 3), round(y * k, 3)) for x, y in pts])

    def walk(entities, depth=0):
        for e in entities:
            t = e.dxftype()
            layer = e.dxf.get('layer', '0')
            try:
                if t == 'LWPOLYLINE':
                    pts = [(p[0], p[1]) for p in e.get_points('xy')]
                    add(layer, 'closed' if e.closed and len(pts) >= 3 else 'open', pts)
                elif t == 'POLYLINE' and not e.is_3d_polyline and not e.is_poly_face_mesh and not e.is_polygon_mesh:
                    pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
                    add(layer, 'closed' if e.is_closed and len(pts) >= 3 else 'open', pts)
                elif t == 'LINE':
                    add(layer, 'segments', [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)])
                elif t == 'ARC':
                    c, r, a0, a1 = e.dxf.center, e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle
                    a1 = a1 + 360 if a1 < a0 else a1
                    n = max(4, int((a1 - a0) / 10))
                    add(layer, 'segments', [(c.x + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), c.y + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)])
                elif t == 'CIRCLE' and e.dxf.radius * k > 3:
                    c, r = e.dxf.center, e.dxf.radius
                    add(layer, 'closed', [(c.x + r * math.cos(i * math.pi / 12), c.y + r * math.sin(i * math.pi / 12)) for i in range(24)])
                elif t in ('TEXT', 'MTEXT'):
                    s = e.plain_text() if t == 'MTEXT' else e.dxf.text
                    p = e.dxf.insert
                    if s and s.strip():
                        texts.append({'text': s.strip()[:200], 'x': round(p.x * k, 2), 'y': round(p.y * k, 2), 'layer': layer})
                elif t == 'INSERT' and depth < 3:
                    walk(list(e.virtual_entities()), depth + 1)
            except Exception:  # noqa: BLE001 — skip an odd entity, keep the rest
                continue

    walk(doc.modelspace())
    for L in layers.values():
        c, o = chain(L.pop('segments') + L['open'], 0.05)
        L['closed'] += c
        L['open'] = o
    return dict(source='dxf', units=UNIT_NAME.get(units, str(units)), feet_per_unit=k, unitless=units == 0, layers=layers, texts=texts)


# ---------- PDF ----------
def read_pdf(path, page_no, scale_ft_per_in):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        pg = pdf.pages[page_no - 1]
        H = pg.height
        segs, closed = [], []
        for ln in pg.lines:
            segs.append([(ln['x0'], H - ln['top']), (ln['x1'], H - ln['bottom'])] if ln.get('pts') is None else [(x, H - y) for x, y in ln['pts']])
        for r in pg.rects:
            if r['width'] > 2 and r['height'] > 2:
                closed.append([(r['x0'], H - r['bottom']), (r['x1'], H - r['bottom']), (r['x1'], H - r['top']), (r['x0'], H - r['top'])])
        for cv in pg.curves:
            pts = [(x, H - y) for x, y in cv['pts']]
            if len(pts) >= 3 and math.dist(pts[0], pts[-1]) < 0.5:
                closed.append(pts[:-1])
            else:
                segs.append(pts)
        words = pg.extract_words()
        text = ' '.join(w['text'] for w in words)
        vector = len(segs) + len(closed)
        c, o = chain(segs, 0.3)
        closed += c
    if scale_ft_per_in is None:
        m = re.search(r'1\s*(?:"|in(?:ch)?)\s*=\s*(\d+(?:\.\d+)?)\s*(?:\'|ft|feet)', text, re.I)
        scale_ft_per_in = float(m.group(1)) if m else None
    k = scale_ft_per_in / 72 if scale_ft_per_in else 1.0  # PDF points -> feet
    conv = lambda P: [(round(x * k, 3), round(y * k, 3)) for x, y in P]
    words_out = [{'text': w['text'], 'x': round(w['x0'] * k, 2), 'y': round((H - w['bottom']) * k, 2)} for w in words][:3000]
    return dict(source='pdf', vector_items=vector, scale_ft_per_in=scale_ft_per_in, feet_per_unit=k,
                units='feet (from the sheet scale)' if scale_ft_per_in else 'PDF points (no scale found: pass --scale or fit to acreage)',
                layers={'pdf': {'closed': [conv(P) for P in closed], 'open': [conv(P) for P in o]}}, texts=words_out)


# ---------- images ----------
def grid_image(src, out_png, max_px=2400):
    from PIL import Image, ImageDraw
    im = Image.open(src).convert('RGB')
    s = min(1.0, max_px / max(im.size))
    if s < 1:
        im = im.resize((int(im.width * s), int(im.height * s)))
    d = ImageDraw.Draw(im)
    for x in range(0, im.width, 50):
        d.line([(x, 0), (x, im.height)], fill=(255, 0, 0) if x % 100 == 0 else (255, 170, 170), width=1)
        if x % 100 == 0:
            d.text((x + 2, 2), str(x), fill=(200, 0, 0))
            d.text((x + 2, im.height - 12), str(x), fill=(200, 0, 0))
    for y in range(0, im.height, 50):
        d.line([(0, y), (im.width, y)], fill=(0, 0, 255) if y % 100 == 0 else (170, 170, 255), width=1)
        if y % 100 == 0:
            d.text((2, y + 2), str(y), fill=(0, 0, 200))
            d.text((im.width - 30, y + 2), str(y), fill=(0, 0, 200))
    im.save(out_png)
    return im.size, s


# ---------- ranking and preview ----------
def candidates(g, acres):
    out = []
    for name, L in g['layers'].items():
        for i, P in enumerate(L['closed']):
            a = area(P)
            if a <= 0:
                continue
            out.append({'layer': name, 'index': i, 'area_sf': round(a), 'acres': round(a / SQFT_ACRE, 3), 'vertices': len(P),
                        'off_by_pct': round(100 * (a / SQFT_ACRE - acres) / acres, 1) if acres else None, 'boundary_layer': bool(BOUNDARY_LAYER.search(name))})
    if acres:
        out.sort(key=lambda c: (abs(c['off_by_pct']), not c['boundary_layer']))
    else:
        out.sort(key=lambda c: -c['area_sf'])
    return out[:15]


def preview(g, best, out_png, px=2200):
    from PIL import Image, ImageDraw
    allp = [p for L in g['layers'].values() for P in L['closed'] + L['open'] for p in P]
    if not allp:
        return
    if best:
        bb = bbox(g['layers'][best['layer']]['closed'][best['index']])
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        bb = [bb[0] - w * 0.15, bb[1] - h * 0.15, bb[2] + w * 0.15, bb[3] + h * 0.15]
    else:
        bb = bbox(allp)
    s = px / max(bb[2] - bb[0], bb[3] - bb[1], 1e-6)
    W, H = int((bb[2] - bb[0]) * s) + 1, int((bb[3] - bb[1]) * s) + 1
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    T = lambda p: ((p[0] - bb[0]) * s, H - (p[1] - bb[1]) * s)
    n = 0
    for name, L in g['layers'].items():
        for P in L['open']:
            d.line([T(p) for p in P], fill=(170, 170, 170), width=1)
        for i, P in enumerate(L['closed']):
            d.polygon([T(p) for p in P], outline=(60, 60, 60))
    for c in candidates(g, None)[:0]:
        pass
    if best:
        P = g['layers'][best['layer']]['closed'][best['index']]
        d.polygon([T(p) for p in P], outline=(220, 0, 0), width=5)
    # number the larger closed shapes so they can be named in the model
    shapes = []
    for name, L in g['layers'].items():
        for i, P in enumerate(L['closed']):
            shapes.append((area(P), name, i, P))
    for a, name, i, P in sorted(shapes, reverse=True)[:200]:
        cx = sum(p[0] for p in P) / len(P)
        cy = sum(p[1] for p in P) / len(P)
        x, y = T((cx, cy))
        if 0 <= x < W and 0 <= y < H:
            d.text((x, y), '%s#%d' % (name[:10], i), fill=(0, 90, 200))
            n += 1
    im.save(out_png)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file')
    ap.add_argument('--acres', type=float, help='total site acreage the user gave (the basis for scale)')
    ap.add_argument('--out', default='intake')
    ap.add_argument('--page', type=int, default=1)
    ap.add_argument('--scale', type=float, help='PDF sheet scale, feet per inch (1" = 60\' -> 60)')
    a = ap.parse_args()
    if not a.acres:
        print('WARNING: no --acres given. Ask the user for the total site acreage: it is the basis for the scale.')
    os.makedirs(a.out, exist_ok=True)
    ext = os.path.splitext(a.file)[1].lower()
    path = a.file
    if ext == '.dwg':
        path = dwg_to_dxf(a.file, a.out)
        ext = '.dxf'
    if ext in ('.png', '.jpg', '.jpeg', '.tif', '.tiff', '.heic', '.bmp', '.gif', '.webp'):
        size, s = grid_image(path, os.path.join(a.out, 'grid.png'))
        info = {'source': 'image', 'grid': os.path.join(a.out, 'grid.png'), 'size_px': size, 'resized_by': s,
                'next': 'Trace the boundary and every site element in grid pixel coordinates (x right, y DOWN) into project.json, set site.coord_units = "pixels", then run scripts/fit_site.py project.json --acres %s' % a.acres}
        json.dump(info, open(os.path.join(a.out, 'geometry.json'), 'w'), indent=1)
        print(json.dumps(info, indent=1))
        return
    if ext == '.pdf':
        g = read_pdf(path, a.page, a.scale)
        if g['vector_items'] < 5:
            png = os.path.join(a.out, 'page')
            subprocess.run(['pdftoppm', '-r', '150', '-f', str(a.page), '-l', str(a.page), '-png', path, png], check=False)
            pages = sorted(f for f in os.listdir(a.out) if f.startswith('page') and f.endswith('.png'))
            if pages:
                size, s = grid_image(os.path.join(a.out, pages[0]), os.path.join(a.out, 'grid.png'))
                print('This PDF page is a scan (almost no vector linework). Treat it as an image: trace on %s, then fit_site.py.' % os.path.join(a.out, 'grid.png'))
                return
    elif ext == '.dxf':
        g = read_dxf(path)
    else:
        sys.exit('Unsupported file type %s (DXF, DWG, PDF or an image).' % ext)
    cands = candidates(g, a.acres)
    best = cands[0] if cands else None
    g['boundary_candidates'] = cands
    g['layer_summary'] = {k: {'closed': len(v['closed']), 'open': len(v['open'])} for k, v in g['layers'].items()}
    for L in g['layers'].values():  # keep the file readable: biggest shapes first, capped
        L['closed'] = sorted(L['closed'], key=area, reverse=True)[:400]
        L['open'] = L['open'][:400]
    g['boundary_candidates'] = candidates(g, a.acres)
    best = g['boundary_candidates'][0] if g['boundary_candidates'] else None
    json.dump(g, open(os.path.join(a.out, 'geometry.json'), 'w'))
    try:
        preview(g, best, os.path.join(a.out, 'preview.png'))
    except Exception as e:  # noqa: BLE001
        print('(preview not drawn: %s)' % e)
    print('Source: %s · units: %s' % (g['source'], g['units']))
    print('Layers: ' + ', '.join('%s (%d closed)' % (k, v['closed']) for k, v in sorted(g['layer_summary'].items(), key=lambda kv: -kv[1]['closed'])[:25]))
    print('Boundary candidates (closest to %s ac first):' % a.acres if a.acres else 'Largest closed shapes:')
    for c in g['boundary_candidates'][:8]:
        print('  %-24s #%-4d %10s sf  %7.3f ac  %s' % (c['layer'][:24], c['index'], '{:,}'.format(c['area_sf']), c['acres'], ('%+.1f%% vs stated' % c['off_by_pct']) if a.acres else ''))
    if a.acres and best and abs(best['off_by_pct']) > 2:
        print('NO closed shape is within 2 %% of %.2f ac. The scale or units are probably wrong (%s), the boundary is drawn as several pieces, '
              'or the stated acreage includes or excludes right-of-way. Check before modelling.' % (a.acres, g['units']))
    print('Wrote %s and %s' % (os.path.join(a.out, 'geometry.json'), os.path.join(a.out, 'preview.png')))


if __name__ == '__main__':
    main()
