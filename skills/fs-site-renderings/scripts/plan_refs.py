#!/usr/bin/env python3
"""Cut the exterior elevations out of the fs-set-plans drawing set, as reference images for the renderings.

    python3 scripts/plan_refs.py set/<slug>-plan-set.pdf --out refs/ [--index set/sheet-index.csv] [--max 6]

Finds the "Exterior elevations — Type X" sheets (A-2xx) from the set's sheet index (or by their text), then each
view's label (FRONT / RIGHT / LEFT / BACK ELEVATION) and crops just that drawing at high resolution. Front elevations
of every type come first, then a side of each, up to --max images (the API call takes them all, so fewer is faster).
Writes refs/<sheet>-<view>.png and refs/refs.json [{file, caption, type, sheet, view}]. Needs pdfplumber and pdftoppm."""
import argparse
import csv
import io
import json
import os
import re
import subprocess

ORDER = ['FRONT', 'RIGHT', 'LEFT', 'BACK']


def elevation_pages(pdf, index):
    out = []
    rows = None
    if index and os.path.exists(index):
        rows = list(csv.DictReader(open(index)))
    else:  # fs-set-plans embeds its sheet index in the set
        try:
            from pypdf import PdfReader
            att = PdfReader(pdf).attachments.get('sheet-index.csv')
            if att:
                rows = list(csv.DictReader(io.StringIO(att[0].decode())))
        except Exception:
            rows = None
    if rows is not None:
        for i, r in enumerate(rows):
            if r['Sheet'].startswith('A-2') and 'elevation' in r['Title'].lower():
                m = re.search(r'Type\s+(\w+)', r['Title'])
                out.append(dict(page=i + 1, sheet=r['Sheet'], type=m.group(1) if m else '?', sub=r.get('Subtitle', '')))
        return out
    import pdfplumber
    with pdfplumber.open(pdf) as P:
        for i, pg in enumerate(P.pages):
            t = pg.extract_text() or ''
            if 'EXTERIOR ELEVATIONS' in t.upper():
                m = re.search(r'TYPE\s+(\w+)', t.upper())
                s = re.findall(r'\bA-2\d\d\b', t)
                out.append(dict(page=i + 1, sheet=s[-1] if s else 'A-2xx', type=m.group(1) if m else '?', sub=''))
    return out


def crops(pdf, page):
    """{view: (x0, top, x1, bottom)} in PDF points for each labelled elevation on the page"""
    import pdfplumber
    with pdfplumber.open(pdf) as P:
        pg = P.pages[page - 1]
        words = pg.extract_words()
        labels = []
        for i, w in enumerate(words[:-1]):
            if w['text'].upper() in ORDER and words[i + 1]['text'].upper().startswith('ELEVATION'):
                labels.append((w['text'].upper(), w))
        graphics = [o for o in pg.lines + pg.rects + pg.curves]
        res = {}
        for view, w in labels:
            # the drawing sits just above its label, between it and the next label to the right
            right = min([lw['x0'] for _, lw in labels if lw['x0'] > w['x0'] + 20 and abs(lw['top'] - w['top']) < 40] + [pg.width * 0.88])
            objs = [o for o in graphics if o['bottom'] <= w['top'] - 2 and o['top'] >= w['top'] - 420
                    and o['x0'] >= w['x0'] - 30 and o['x1'] <= right - 5 and (o['x1'] - o['x0']) < pg.width * 0.8]
            if not objs:
                continue
            x0 = min(o['x0'] for o in objs) - 6
            x1 = max(o['x1'] for o in objs) + 6
            top = min(o['top'] for o in objs) - 6
            bot = max(o['bottom'] for o in objs) + 6
            res[view] = (x0, top, x1, bot)
        return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--out', default='refs')
    ap.add_argument('--index', help='the set\'s sheet-index.csv (default: next to the PDF)')
    ap.add_argument('--max', type=int, default=6)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    index = a.index or os.path.join(os.path.dirname(os.path.abspath(a.pdf)), 'sheet-index.csv')
    pages = elevation_pages(a.pdf, index)
    if not pages:
        raise SystemExit('No exterior elevation sheets found in %s. Render without --refs, or point at the right set.' % a.pdf)
    found = []
    for pg in pages:
        for view, box in crops(a.pdf, pg['page']).items():
            found.append(dict(pg, view=view, box=box))
    found.sort(key=lambda f: (ORDER.index(f['view']) if f['view'] != 'FRONT' else -1, f['type']))
    # every type's front first, then one side each, then the rest
    pick, seen_side = [], set()
    for f in found:
        if f['view'] == 'FRONT':
            pick.append(f)
    for f in found:
        if f['view'] in ('RIGHT', 'LEFT') and f['type'] not in seen_side:
            pick.append(f)
            seen_side.add(f['type'])
    pick = pick[:a.max]
    refs = []
    for f in pick:
        x0, top, x1, bot = f['box']
        dpi = max(150, min(600, int(1800 / ((x1 - x0) / 72))))  # about 1,800 px across
        k = dpi / 72
        name = '%s-%s' % (f['sheet'], f['view'].lower())
        subprocess.run(['pdftoppm', '-png', '-singlefile', '-r', str(dpi), '-f', str(f['page']), '-l', str(f['page']),
                        '-x', str(int(x0 * k)), '-y', str(int(top * k)), '-W', str(int((x1 - x0) * k)), '-H', str(int((bot - top) * k)),
                        a.pdf, os.path.join(a.out, name)], check=True)
        cap = '%s elevation of type %s%s (sheet %s)' % (f['view'].lower(), f['type'], (', ' + f['sub']) if f['sub'] else '', f['sheet'])
        refs.append(dict(file=name + '.png', caption=cap, type=f['type'], sheet=f['sheet'], view=f['view']))
        print('%-24s %s' % (name + '.png', cap))
    json.dump(refs, open(os.path.join(a.out, 'refs.json'), 'w'), indent=1)
    print('Wrote %d reference(s) and %s. Look at each before using it.' % (len(refs), os.path.join(a.out, 'refs.json')))


if __name__ == '__main__':
    main()
