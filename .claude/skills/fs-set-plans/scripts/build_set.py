#!/usr/bin/env python3
"""Build a Finishes Solutions schematic design plan set from one project model.

    python3 scripts/build_set.py project.json --out out/            # validate, check, draw, assemble
    python3 scripts/build_set.py project.json --validate-only        # just the building-design checks
    python3 scripts/build_set.py project.json --list                 # print the sheet list
    python3 scripts/build_set.py project.json --out out/ --half      # also an 11 x 17 half-size copy

Writes <out>/<project>-plan-set.pdf (every sheet on the Finishes Solutions title block), <out>/sheet-index.csv and
<out>/set-check.txt. Exit code 2 when a design or a set check fails (the PDF is still written so it can be looked at,
but it must not be issued). Needs reportlab and pypdf."""
import argparse
import csv
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from reportlab.pdfgen import canvas  # noqa: E402
from pypdf import PdfReader, PdfWriter, Transformation  # noqa: E402
from fsplans import kit as K  # noqa: E402
from fsplans.design import normalize_type, validate, RESIDENTIAL  # noqa: E402
from fsplans.setdef import sheet_list  # noqa: E402
from fsplans.site import Site  # noqa: E402
from fsplans import sheets_general, sheets_site, sheets_arch, sheets_eng  # noqa: E402

RENDERERS = {**sheets_general.RENDERERS, **sheets_site.RENDERERS, **sheets_arch.RENDERERS, **sheets_eng.RENDERERS}
BORDER = os.path.join(HERE, '..', 'assets', 'titleblock.pdf')


class Ctx:
    pass


def load(path):
    with open(path) as f:
        p = json.load(f)
    base = os.path.dirname(os.path.abspath(path))
    for r in p.get('renders') or []:
        if r.get('file') and not os.path.isabs(r['file']):
            r['file'] = os.path.join(base, r['file'])
    return p


def prepare(p):
    types = [normalize_type(t) for t in p.get('types') or []]
    site = Site(p, types) if len((p.get('site') or {}).get('boundary') or []) >= 3 else None
    # count each type's buildings from the site plan when it shows them
    if site:
        for t in types:
            n = sum(1 for b in site.buildings if b.get('type') == t['id'])
            if n:
                t['count'] = n
                if t['use'] in RESIDENTIAL:
                    t['units'] = n * (t['units_per'] if t.get('attached') else 1)
        p['_acres'] = site.acres
    ctx = Ctx()
    ctx.p = p
    ctx.types = {t['id']: t for t in types if t.get('design')}  # building sheets are drawn for these
    ctx.others = [t for t in types if not t.get('design')]  # site sheets only: "building sheets by others"
    ctx.site = site
    ctx.uses = ' · '.join(sorted({t['label'] for t in types}))
    ctx.sheets = sheet_list(p, [t for t in types if t.get('design')])
    return ctx


def design_problems(ctx):
    out = {}
    for t in ctx.types.values():
        P = validate(t, t['design'])
        if P:
            out[t['id']] = P
    return out


def set_checks(ctx, drawn_text):
    """the set is not issued while any of these fail"""
    P = []
    nums = [s['number'] for s in ctx.sheets]
    if len(nums) != len(set(nums)):
        P.append('Duplicate sheet numbers: ' + ', '.join(sorted({n for n in nums if nums.count(n) > 1})))
    for num, text in drawn_text.items():
        for ref in set(re.findall(r'\b(?:SEE|see|See)\s+([A-Z]{1,2}-\d{3})', text)):
            if ref not in nums:
                P.append('%s refers to %s, which is not in the set.' % (num, ref))
    s = ctx.site
    if s:
        if s.area_sf <= 0:
            P.append('The site boundary has no area.')
        for b in s.buildings:
            if b.get('type') and b['type'] not in s.types:
                P.append('Building %s names type %s, which is not defined.' % (b.get('name') or '?', b['type']))
            from fsplans.geom import inside, centroid
            if not inside(centroid(b['poly']), s.boundary):
                P.append('Building %s is outside the property line.' % (b.get('name') or b.get('type')))
        from fsplans.geom import area as _area
        for b in s.buildings:
            t = s.types.get(b.get('type'))
            if t:
                drawn, typed = _area(b['poly']), t['W'] * t['D'] * (t['units_per'] if t.get('attached') else 1)
                if abs(drawn - typed) > 0.15 * typed:
                    P.append('Building %s is drawn at {:,.0f} sf but type %s is {:,.0f} sf (W x D): make the type match the drawing.'.format(drawn, typed) % (b.get('name') or '?', t['id']))
        pk = s.s.get('parking') or {}
        if pk.get('required') is not None and pk.get('provided') is not None and pk['provided'] < pk['required']:
            P.append('Parking provided (%s) is less than required (%s).' % (pk['provided'], pk['required']))
        det = s.detention()
        if s.ponds and det['prov'] < det['req']:
            P.append('Detention provided (%.2f ac-ft) is less than required (%.2f ac-ft): see C-202.' % (det['prov'], det['req']))
        stated = (ctx.p.get('site') or {}).get('stated') or {}
        if stated.get('acres') and abs(stated['acres'] - s.acres) > 0.02 * stated['acres']:
            P.append('The reference says %.2f acres; the drawn boundary is %.2f acres (over 2%% apart): fix the boundary or the scale.' % (stated['acres'], s.acres))
        if stated.get('building_sf'):
            gfa = s.gfa()
            if abs(stated['building_sf'] - gfa) > 0.03 * stated['building_sf']:
                P.append('The reference says {:,.0f} sf of building; the drawn buildings total {:,.0f} sf (over 3 % apart).'.format(stated['building_sf'], gfa))
        if stated.get('units'):
            units = sum(t.get('units', 0) for t in s.types.values())
            if units != stated['units']:
                P.append('The reference says %d homes; the set has %d.' % (stated['units'], units))
    return P


class TextSpy(canvas.Canvas):
    """records the text drawn on each page, for the cross-reference check"""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.texts = []
        self._cur = []

    def drawString(self, x, y, text, *a, **k):
        self._cur.append(str(text))
        return super().drawString(x, y, text, *a, **k)

    def drawCentredString(self, x, y, text, *a, **k):
        self._cur.append(str(text))
        return super().drawCentredString(x, y, text, *a, **k)

    def drawRightString(self, x, y, text, *a, **k):
        self._cur.append(str(text))
        return super().drawRightString(x, y, text, *a, **k)

    def showPage(self):
        self.texts.append(' '.join(self._cur))
        self._cur = []
        return super().showPage()


def draw(ctx, meta):
    buf = io.BytesIO()
    c = TextSpy(buf, pagesize=(K.PAGE_W, K.PAGE_H))
    c.setTitle(meta['name'] + ' — Schematic design set')
    c.setAuthor('Finishes Solutions')
    failed = []
    for sh in ctx.sheets:
        fn = RENDERERS.get(sh['kind'])
        try:
            if fn is None:
                raise ValueError('no renderer for ' + sh['kind'])
            fn(c, ctx, sh)
        except Exception as e:  # noqa: BLE001 — one bad sheet says so instead of failing the set
            import traceback
            traceback.print_exc()
            failed.append('%s: %s' % (sh['number'], e))
            c.setFillColorRGB(*K.RED)
            c.setFont(K.FB, 16)
            c.drawString(K.AREA[0], K.AREA[1] + K.AREA[3] - 30, 'This sheet could not be drawn: %s' % e)
        K.title_block(c, meta, sh)
        c.showPage()
    c.save()
    return buf.getvalue(), c.texts, failed


def on_border(content, out_path, half=False):
    border = PdfReader(BORDER).pages[0]
    src = PdfReader(io.BytesIO(content))
    w = PdfWriter()
    for pg in src.pages:
        page = w.add_blank_page(K.PAGE_W, K.PAGE_H)
        page.merge_page(border)
        page.merge_page(pg)
    w.add_metadata({'/Title': src.metadata.get('/Title', 'Plan set') if src.metadata else 'Plan set', '/Creator': 'Finishes Solutions', '/Producer': 'fs-set-plans'})
    w.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
    with open(out_path, 'wb') as f:
        w.write(f)
    if half:
        r = PdfReader(out_path)
        h = PdfWriter()
        s = 17 * 72 / K.PAGE_W
        for pg in r.pages:
            np_ = h.add_blank_page(17 * 72, 11 * 72)
            np_.merge_transformed_page(pg, Transformation().scale(s, s))
        hp = out_path.replace('.pdf', '-11x17.pdf')
        with open(hp, 'wb') as f:
            h.write(f)
        return hp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project')
    ap.add_argument('--out', default='out')
    ap.add_argument('--validate-only', action='store_true')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--half', action='store_true')
    a = ap.parse_args()
    p = load(a.project)
    ctx = prepare(p)
    if ctx.site and not ((p['site'].get('stated') or {}).get('acres')):
        sys.exit('site.stated.acres is missing: ask the user for the total site acreage before building the site. '
                 'It is the basis the drawn boundary (and, for sketches, the scale) is checked against.')
    if ctx.site and p['site'].get('coord_units') == 'pixels':
        sys.exit('The site is still in traced pixels: run scripts/fit_site.py project.json --acres <total acreage> first.')
    probs = design_problems(ctx)
    for t in ctx.others:
        print('Type %s (%s) has no design: site sheets only, "building sheets by others".' % (t['id'], t['label']))
    for tid, P in probs.items():
        print('Type %s design problems:' % tid)
        for x in P:
            print('  - ' + x)
    if a.validate_only:
        print('Designs: ' + ('ALL PASS' if not probs else '%d type(s) with problems' % len(probs)))
        sys.exit(2 if probs else 0)
    if a.list:
        for s in ctx.sheets:
            print('%-7s %-45s %s' % (s['number'], s['title'], s['sub']))
        print('%d sheets' % len(ctx.sheets))
        return
    pr = p['project']
    meta = dict(pr)
    meta['phase'] = 'Schematic design · ' + (pr.get('option') or 'Option')
    if ctx.site:
        meta['site_line'] = ' · '.join(v for v in [pr.get('county'), '%.2f acres' % ctx.site.acres] if v)
    os.makedirs(a.out, exist_ok=True)
    content, texts, failed = draw(ctx, meta)
    slug = re.sub(r'[^a-z0-9]+', '-', pr.get('name', 'project').lower()).strip('-')
    out_pdf = os.path.join(a.out, slug + '-plan-set.pdf')
    half = on_border(content, out_pdf, a.half)
    checks = set_checks(ctx, {s['number']: t for s, t in zip(ctx.sheets, texts)}) + ['Sheet ' + f for f in failed]
    with open(os.path.join(a.out, 'sheet-index.csv'), 'w', newline='') as f:
        wr = csv.writer(f)
        wr.writerow(['Sheet', 'Title', 'Subtitle', 'Section', 'Scale'])
        for s in ctx.sheets:
            wr.writerow([s['number'], s['title'], s['sub'], s['section'], s['scale']])
    with open(os.path.join(a.out, 'set-check.txt'), 'w') as f:
        f.write('Set: %s — %d sheets\n' % (pr.get('name'), len(ctx.sheets)))
        for tid, P in probs.items():
            f.write('\nType %s design:\n' % tid + ''.join('  - %s\n' % x for x in P))
        f.write('\nSet checks: ' + ('ALL PASS\n' if not checks else '\n' + ''.join('  - %s\n' % x for x in checks)))
    size = os.path.getsize(out_pdf) / 1048576
    print('Wrote %s (%d sheets, %.1f MB)%s' % (out_pdf, len(ctx.sheets), size, (' and ' + half) if half else ''))
    print('Set checks: ' + ('ALL PASS' if not checks else ''))
    for x in checks:
        print('  - ' + x)
    sys.exit(2 if (probs or checks) else 0)


if __name__ == '__main__':
    main()
