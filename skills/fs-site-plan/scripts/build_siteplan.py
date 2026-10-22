#!/usr/bin/env python3
"""Draw the one-sheet conceptual site layout (SP-1, 24 x 36 on the Finishes Solutions title block) from the layout
model, check it, and write the hand-off model for the fs-set-plans skill.

    python3 scripts/build_siteplan.py site-model.json --out out/            # PDF + checks + hand-off model
    python3 scripts/build_siteplan.py site-model.json --check-only          # just the measurements and checks
    python3 scripts/build_siteplan.py site-model.json --out out/ --half     # also an 11 x 17 copy (print only)

Writes out/<slug>-site-layout.pdf, out/<slug>-site-model.json (an fs-set-plans project.json) and
out/<slug>-checks.txt. Exit code 2 when a check fails: the sheet is then stamped DRAFT, CHECKS FAILING and must not be
handed off. Needs reportlab and pypdf."""
import argparse
import copy
import io
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from reportlab.pdfgen import canvas  # noqa: E402
from pypdf import PdfReader, PdfWriter, Transformation  # noqa: E402
from fsplans import kit as K  # noqa: E402
from fsplans import geom as G  # noqa: E402
from fsplans.sitemodel import Layout, band, SQFT_ACRE  # noqa: E402
from fsplans.kit import F, FB  # noqa: E402

BORDER = os.path.join(HERE, '..', 'assets', 'titleblock.pdf')
LABEL = ('AI-ASSISTED CONCEPTUAL SITE PLAN. FOR FEASIBILITY AND PLANNING ONLY. NOT FOR PERMIT OR CONSTRUCTION. FINAL DESIGN IS '
         'SUBJECT TO CURRENT SURVEY, TITLE, CIVIL ENGINEERING, ARCHITECTURAL/ENGINEERING REVIEW, FIRE AND ACCESSIBILITY REVIEW, '
         'UTILITY CONFIRMATION, FLOODPLAIN ANALYSIS AND APPROVAL BY THE AUTHORITY HAVING JURISDICTION.')
K.PRELIMINARY_TEXT = ('Conceptual site layout prepared by Finishes Solutions with AI assistance for feasibility and planning only. '
                      'Not prepared or sealed by a licensed architect, engineer or surveyor. Boundary, easements, utilities, drainage '
                      'and code requirements are not verified and must be confirmed by licensed professionals and the authority '
                      'having jurisdiction.')

USE_COL = {'sfr': (0.93, 0.80, 0.55), 'townhomes': (0.91, 0.72, 0.47), 'duplex': (0.92, 0.76, 0.5), 'multifamily': (0.90, 0.68, 0.45),
           'retail': (0.85, 0.45, 0.42), 'restaurant': (0.88, 0.55, 0.35), 'fuel': (0.90, 0.60, 0.60), 'office': (0.55, 0.65, 0.85),
           'medical': (0.55, 0.75, 0.85), 'industrial': (0.65, 0.62, 0.75), 'storage': (0.70, 0.70, 0.70), 'church': (0.75, 0.65, 0.85),
           'amenity': (0.60, 0.80, 0.60), 'hotel': (0.80, 0.60, 0.75), 'other': (0.80, 0.80, 0.80)}
USE_NAME = {'sfr': 'Single-family homes', 'townhomes': 'Townhomes', 'duplex': 'Duplexes', 'multifamily': 'Multifamily', 'retail': 'Retail',
            'restaurant': 'Restaurant', 'fuel': 'Fuel / convenience', 'office': 'Office', 'medical': 'Medical office', 'industrial': 'Industrial / flex',
            'storage': 'Self storage', 'church': 'Assembly', 'amenity': 'Amenity', 'hotel': 'Hotel', 'other': 'Other'}
GRASS = (0.91, 0.95, 0.88)
PAVE = (0.83, 0.83, 0.83)
WATER = (0.74, 0.86, 0.95)
AMBER = (0.80, 0.50, 0.05)
SIDE_COL = 330
GAP = 18
SIDE_W = SIDE_COL * 2 + GAP


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or 'site').lower()).strip('-')


class View:
    def __init__(self, L, x, y, w, h, pad=45):
        self.L = L
        self.c = G.centroid(L.boundary)
        x0, y0, x1, y1 = G.bbox([self.turn(q) for q in L.boundary])
        x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
        self.scale = K.eng_scale_for(x1 - x0, y1 - y0, w, h)
        self.k = 72.0 / self.scale
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        self.ox = x + w / 2 - cx * self.k
        self.oy = y + h / 2 - cy * self.k

    def turn(self, q):
        return G.rotate(q, self.L.rot, self.c)

    def P(self, q):
        t = self.turn(q)
        return (self.ox + t[0] * self.k, self.oy + t[1] * self.k)

    def Ps(self, pts):
        return [self.P(q) for q in pts]


def closed(c, pts, stroke=K.INK, fill=None, lw=0.8, dash=None):
    """a closed outline drawn with its first point repeated, so PDF readers (fs-set-plans' intake) see a closed shape"""
    if len(pts) < 3:
        return
    c.saveState()
    c.setLineWidth(lw)
    if stroke:
        c.setStrokeColorRGB(*stroke)
    if fill:
        c.setFillColorRGB(*fill)
    if dash:
        c.setDash(list(dash))
    p = c.beginPath()
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    p.lineTo(*pts[0])
    p.close()
    c.drawPath(p, stroke=1 if stroke else 0, fill=1 if fill else 0)
    c.restoreState()


def line(c, pts, color=K.INK, lw=0.6, dash=None):
    K.draw_poly(c, pts, stroke=color, lw=lw, dash=tuple(dash) if dash else None, close=False)


def angle_of(a, b):
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    if ang > 90:
        ang -= 180
    if ang < -90:
        ang += 180
    return ang


def draw_plan(c, v, L):
    s = L.s
    # streets
    for st in L.streets:
        pw = float(st.get('pavement_width', 28))
        if st.get('row_width'):
            for off in (st['row_width'] / 2, -st['row_width'] / 2):
                line(c, v.Ps(G.offset_line(st['pts'], off)), K.LIGHT, 0.6)
        K.draw_poly(c, v.Ps(band(st['pts'], pw)), stroke=None, fill=(0.88, 0.88, 0.88))
        line(c, v.Ps(st['pts']), K.LIGHT, 0.6, (12, 4, 2, 4))
        pts = st['pts']
        i = max(range(len(pts) - 1), key=lambda k: G.dist(pts[k], pts[k + 1]))
        a, b = v.P(pts[i]), v.P(pts[i + 1])
        txt = (st.get('name') or '').upper() + ((" (%g' ROW)" % st['row_width']) if st.get('row_width') else '')
        if st.get('authority'):
            txt += ' · ' + st['authority']
        if st.get('aadt'):
            txt += ' · ' + st['aadt']
        if txt.strip():
            K.label(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 3, txt, 9, FB, K.GREY, angle=angle_of(a, b))
    # the site as pervious ground, then everything on it
    closed(c, v.Ps(L.boundary), stroke=None, fill=GRASS)
    fz = s.get('flood_zone_poly')
    if fz:
        closed(c, v.Ps(fz), stroke=K.BLUE, fill=(0.85, 0.90, 0.98), lw=0.8, dash=(4, 2))
        x, y = v.P(G.centroid(fz))
        K.label(c, x, y, (s.get('flood_zone_label') or 'MAPPED FLOODPLAIN (APPROX.)').upper(), 7, FB, K.BLUE)
    fw = s.get('floodway_poly')
    if fw:
        closed(c, v.Ps(fw), stroke=K.BLUE, fill=(0.70, 0.80, 0.95), lw=1.0)
    for o in L.open:
        closed(c, v.Ps(o['poly']), stroke=K.GREEN, fill=(0.80, 0.90, 0.76), lw=0.5)
        if o.get('label'):
            x, y = v.P(G.centroid(o['poly']))
            K.label(c, x, y, o['label'].upper(), 6.5, FB, K.GREEN, halo=False)
    for lt in L.lots:
        closed(c, v.Ps(lt['poly']), stroke=K.GREY, fill=(0.98, 0.96, 0.90), lw=0.4)
        if lt.get('id') is not None:
            x, y = v.P(G.centroid(lt['poly']))
            K.label(c, x, y, str(lt['id']), 5.5, F, K.GREY, halo=False)
    for pv in L.paving:
        closed(c, v.Ps(pv['poly']), stroke=K.GREY, fill=PAVE if pv.get('kind') != 'walk' else (0.93, 0.93, 0.90), lw=0.5)
    for d in L.drives:
        closed(c, v.Ps(band(d['pts'], d.get('width', 24))), stroke=None, fill=PAVE)
    for r in L.rows:
        closed(c, v.Ps(r['rect']), stroke=None, fill=PAVE)
    # drives: centre line, fire lane edge
    for d in L.drives:
        w = d.get('width', 24)
        for off in (w / 2, -w / 2):
            line(c, v.Ps(G.offset_line(d['pts'], off)), K.ORANGE if d.get('fire_lane') else K.GREY, 0.8 if d.get('fire_lane') else 0.5,
                 (5, 3) if d.get('fire_lane') else None)
        pts = d['pts']
        i = max(range(len(pts) - 1), key=lambda k: G.dist(pts[k], pts[k + 1]))
        a, b = v.P(pts[i]), v.P(pts[i + 1])
        if G.dist(a, b) > 90 and 'aisle' not in (d.get('name') or '').lower():
            t = ("FIRE LANE %g'" % w) if d.get('fire_lane') else ("%g' DRIVE" % w)
            if d.get('name'):
                t = d['name'].upper() + ' · ' + t
            K.label(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 2.5, t, 5.5, FB, K.ORANGE if d.get('fire_lane') else K.GREY, angle=angle_of(a, b))
    # parking stalls
    for r in L.rows:
        for kind, P in r['stalls']:
            pp = v.Ps(P)
            if kind != 'std':
                closed(c, pp, stroke=K.BLUE, fill=(0.80, 0.86, 0.97), lw=0.4)
            else:
                line(c, [pp[0], pp[3]], K.INK, 0.35)
                line(c, [pp[1], pp[2]], K.INK, 0.35)
        if r['count'] >= 6:
            mid = r['stalls'][len(r['stalls']) // 2][1]
            a, b = v.P(r['a']), v.P(r['b'])
            x, y = v.P(G.centroid(mid))
            K.label(c, x, y - 2, '%d' % r['count'], 5.5, FB, K.GREY, angle=angle_of(a, b))
    # detention
    for pd, info in zip(L.ponds, L.detention()['rows']):
        closed(c, v.Ps(pd['poly']), stroke=(0.30, 0.50, 0.75), fill=WATER, lw=0.9)
        x, y = v.P(G.centroid(pd['poly']))
        K.label(c, x, y + 4, info['name'].upper(), 7, FB, K.BLUE, halo=False)
        K.label(c, x, y - 5, '%.2f AC-FT · %g\' DEEP' % (info['vol'], info['depth']), 6, F, K.BLUE, halo=False)
    # buildings
    for b in L.buildings:
        t = L.types.get(b.get('type')) or {}
        use = t.get('use', b.get('use', 'other'))
        closed(c, v.Ps(b['poly']), stroke=K.INK, fill=USE_COL.get(use, USE_COL['other']), lw=1.1)
        x, y = v.P(G.centroid(b['poly']))
        bb = G.bbox(v.Ps(b['poly']))
        if bb[2] - bb[0] > 26 and bb[3] - bb[1] > 12:
            big = bb[2] - bb[0] > 70 and bb[3] - bb[1] > 26
            floors = int(b.get('floors') or t.get('floors', 1))
            K.label(c, x, y + (4 if big else 0), (b.get('name') or use).upper(), 7.5 if big else 5.5, FB, halo=False)
            if big:
                units = L.units_of(b)
                K.label(c, x, y - 5, '{:,.0f} SF · {} STORY{}'.format(L.gfa_of(b), floors, 'S' if floors > 1 else '') + (' · %d UNITS' % units if units > 1 else ''), 6, F, halo=False)
    for dm in s.get('dumpsters', []):
        P = G.rect_poly(dm['x'], dm['y'], dm.get('w', 24), dm.get('d', 12), dm.get('rot', 0))
        closed(c, v.Ps(P), stroke=K.INK, fill=(0.6, 0.6, 0.6), lw=0.5)
    for sg in s.get('signs', []):
        x, y = v.P((sg['x'], sg['y']))
        c.setFillColorRGB(*K.INK)
        c.rect(x - 3, y - 1.5, 6, 3, stroke=0, fill=1)
    # easements, setback and buffer lines
    for e in L.easements:
        pts = v.Ps(e['pts'])
        if e['closed']:
            closed(c, pts, stroke=K.MAGENTA, fill=None, lw=0.8, dash=(6, 3))
        else:
            line(c, pts, K.MAGENTA, 0.8, (6, 3))
        if e.get('label'):
            x, y = v.P(e['pts'][0] if not e['closed'] else G.centroid(e['pts']))
            K.label(c, x, y, e['label'].upper(), 6, F, K.MAGENTA)
    env = L.envelope()
    closed(c, v.Ps(env), stroke=K.RED, fill=None, lw=0.6, dash=(10, 3, 2, 3))
    bl = L.buffer_line()
    if bl:
        closed(c, v.Ps(bl), stroke=K.GREEN, fill=None, lw=0.6, dash=(2, 2))
    # entrances
    for d in L.drives:
        if L._touches_frontage(d):
            best = min((d['pts'][0], d['pts'][-1]), key=lambda q: min(G.nearest_on_line(q, st['pts'])[1] for st in L.streets) if L.streets else 0)
            x, y = v.P(best)
            K.label(c, x, y, 'ENTRY', 6, FB, K.INK)
    # property line on top, with its lengths
    closed(c, v.Ps(L.boundary), stroke=K.INK, fill=None, lw=2.2, dash=(18, 4, 3, 4))
    B = L.boundary
    cx, cy = v.P(G.centroid(B))
    for i in range(len(B)):
        a, b = B[i], B[(i + 1) % len(B)]
        if G.dist(a, b) < 25:
            continue
        pa, pb = v.P(a), v.P(b)
        mx, my = (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2
        dx, dy = mx - cx, my - cy
        dl = math.hypot(dx, dy) or 1
        K.label(c, mx + dx / dl * 9, my + dy / dl * 9, "%.1f'" % G.dist(a, b), 6.5, F, K.INK, angle=angle_of(pa, pb))
    # dimensions the model asks for
    for dm in s.get('dims', []):
        a, b = v.P(dm['a']), v.P(dm['b'])
        line(c, [a, b], K.INK, 0.4)
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        for p_ in (a, b):
            tx, ty = math.cos(ang + math.pi / 4) * 3, math.sin(ang + math.pi / 4) * 3
            line(c, [(p_[0] - tx, p_[1] - ty), (p_[0] + tx, p_[1] + ty)], K.INK, 0.6)
        K.label(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2, dm.get('text') or "%.0f'" % G.dist(dm['a'], dm['b']), 6, F, K.INK, angle=angle_of(a, b))


def legend_items(L):
    items = []
    uses = []
    for b in L.buildings:
        u = (L.types.get(b.get('type')) or {}).get('use', b.get('use', 'other'))
        if u not in uses:
            uses.append(u)
    items += [('fill', USE_COL.get(u, USE_COL['other']), USE_NAME.get(u, u.title())) for u in uses]
    items.append(('fill', PAVE, 'Paving / parking'))
    if L.ponds:
        items.append(('fill', WATER, 'Detention'))
    items.append(('fill', GRASS, 'Landscape / pervious'))
    if any(r['ada_count'] for r in L.rows):
        items.append(('fill', (0.80, 0.86, 0.97), 'Accessible stall + aisle'))
    items += [('dash', K.INK, 'Property line'), ('dash', K.RED, 'Building setback')]
    if L.buffer_line():
        items.append(('dash', K.GREEN, 'Landscape buffer'))
    if L.fire_lanes():
        items.append(('dash', K.ORANGE, 'Fire lane edge'))
    if L.easements:
        items.append(('dash', K.MAGENTA, 'Easement'))
    if L.s.get('flood_zone_poly'):
        items.append(('dash', K.BLUE, 'Floodplain (approx.)'))
    return items


def fmt_sf(a):
    return '{:,.0f} sf'.format(a)


def side_content(L):
    p = L.p
    A = L.area_sf
    hbu = p.get('hbu') or {}
    col1, col2 = [], []
    # highest and best use
    txt = hbu.get('statement') or ''
    if hbu.get('selected'):
        txt = 'SELECTED: %s. %s' % (hbu['selected'], txt)
    col1.append(('text', 'Highest & best use', txt))
    rows = []
    for cnd in hbu.get('candidates', []):
        rows.append([('▶ ' if cnd.get('chosen') else '') + cnd.get('use', ''), cnd.get('legal', ''), cnd.get('physical', ''),
                     cnd.get('feasible', ''), cnd.get('yield', ''), str(cnd.get('rank', ''))])
    if rows:
        col1.append(('table', 'Uses tested (legal · physical · feasible · productive)', (['Use', 'Legal', 'Physical', 'Feasible', 'Yield', '#'], rows, [1.5, 1, 1, 1.2, 1.1, 0.3], ())))
    # site data
    s = L.s
    rows = [['Gross site', '{:,.0f} sf · {:.2f} ac'.format(A, L.acres)]]
    st = (s.get('stated') or {}).get('acres')
    if st:
        rows.append(['Stated acreage', '%.2f ac (%s)' % (st, s.get('stated_source', 'user / survey'))])
    for k, lab in (('address', 'Address'), ('parcels', 'Parcel(s)'), ('jurisdiction', 'Jurisdiction'), ('zoning', 'Zoning'),
                   ('flood_zone', 'FEMA flood zone'), ('firm_panel', 'FIRM panel'), ('utilities', 'Utilities'), ('boundary_source', 'Boundary source')):
        v = s.get(k) if k != 'address' else (p.get('project') or {}).get('address')
        if v:
            rows.append([lab, str(v)])
    col1.append(('table', 'Site data', (None, rows, [1, 2.2], ())))
    # land use
    rows = [[n, '{:,.0f}'.format(a), '%.2f' % (a / SQFT_ACRE), '%.1f%%' % (100 * a / A)] for n, a in L.land_use()]
    rows.append(['Gross site', '{:,.0f}'.format(A), '%.2f' % L.acres, '100%'])
    col1.append(('table', 'Land use (measured from the plan)', (['Use of land', 'sf', 'ac', '%'], rows, [2, 1.1, 0.7, 0.7], (1, 2, 3))))
    # program
    rows = []
    for t in p.get('types', []):
        bs = [b for b in L.buildings if b.get('type') == t['id']]
        if not bs:
            continue
        gfa = sum(L.gfa_of(b) for b in bs)
        units = sum(L.units_of(b) for b in bs)
        rows.append(['%s — %s' % (t['id'], t.get('label') or USE_NAME.get(t['use'], t['use'])), str(len(bs)),
                     "%g' × %g'" % (t.get('W', 0), t.get('D', 0)) if t.get('W') else '—', str(t.get('floors', 1)),
                     fmt_sf(gfa) + (' · %d u' % units if units > 1 else '')])
    if L.lots:
        rows.append(['Residential lots', str(len(L.lots)), '', '', '{:,.0f} sf min'.format(min(G.area(l['poly']) for l in L.lots))])
    tot = 'Total %s GFA · FAR %.2f · coverage %.1f%%' % (fmt_sf(L.gfa()), L.gfa() / A, 100 * L.footprint() / A)
    if L.units():
        tot += ' · %d units (%.1f/ac)' % (L.units(), L.units() / L.acres)
    rows.append([tot, '', '', '', ''])
    col1.append(('table', 'Development program', (['Type', 'No.', 'Footprint', 'Fl.', 'Area'], rows, [2, 0.4, 1, 0.35, 1.4], (1, 3, 4))))
    # code analysis
    m = L.measures()
    code = p.get('code') or {}
    rows = []
    for r in code.get('rules', []):
        prov = r.get('provided')
        status = ''
        if r.get('measure') in m:
            prov = m[r['measure']][1]
            if r.get('limit') is not None:
                vv = m[r['measure']][0]
                ok = vv <= r['limit'] + 1e-9 if r.get('kind') == 'max' else vv >= r['limit'] - 1e-9
                status = 'OK' if ok else 'NO'
        cls = r.get('cls', 'UNVERIFIED')
        tag = {'VERIFIED REQUIREMENT': 'VER', 'OWNER GUARDRAIL': 'OWN', 'ENGINEERING ASSUMPTION': 'ENG', 'UNVERIFIED': 'UNV'}.get(cls, cls[:3])
        rows.append([r.get('item', ''), r.get('req', ''), prov or '—', status or ('VERIFY' if cls == 'UNVERIFIED' else ''), tag])
    head = 'Code & zoning analysis'
    if code.get('jurisdiction') or code.get('code_set'):
        col2.append(('text', head, ' · '.join(x for x in [code.get('jurisdiction'), code.get('zoning'), code.get('code_set')] if x)))
        head = None
    if rows:
        col2.append(('table', head or 'Requirements', (['Item', 'Required', 'Provided', '', 'Class'], rows, [1.5, 1.3, 1.2, 0.5, 0.45], ())))
        col2.append(('small', None, 'Class: VER verified requirement · OWN owner guardrail · ENG engineering assumption · UNV unverified (not claimed).'
                     + (' Sources: ' + '; '.join(code.get('sources', [])) if code.get('sources') else '')))
    # parking
    pk = L.parking_summary()
    rows = [[r['label'], (fmt_sf(r['gfa']) if not r['units'] else '%d units' % r['units']), r['basis'], str(r['req'])] for r in pk['rows']]
    if pk['code']:
        rows.append(['Required', '', '', str(pk['code'])])
        if pk['factor']:
            rows.append(['Target (+%d%% owner reserve)' % round(pk['factor'] * 100), '', '', str(pk['target'])])
    rows.append(['Provided', '', '', str(pk['provided'])])
    rows.append(['Accessible req. / prov.', '', '2010 ADA 208.2', '%d (%d van) / %d (%d van)' % (pk['ada_req'], pk['van_req'], pk['ada_prov'], pk['van_prov'])])
    col2.append(('table', 'Parking', (['Use', 'Basis', 'Ratio', 'Spaces'], rows, [1.3, 0.9, 1.4, 1.1], (3,))))
    # detention
    det = L.detention()
    if det['req'] or det['rows']:
        rows = [['Required', '%.2f dev. ac × %.2f ac-ft/ac' % (det['dev_ac'], det['rate']), '%.2f ac-ft' % det['req']]]
        for r in det['rows']:
            rows.append([r['name'], '%s · %s' % ('{:,.0f} sf top'.format(r['area']), r['how']), '%.2f ac-ft' % r['vol']])
        rows.append(['Provided', '', '%.2f ac-ft' % det['prov']])
        col2.append(('table', 'Detention (%s)' % det['cls'].lower(), (None, rows, [0.9, 2.2, 0.9], (2,))))
    # risks and notes
    risks = [r if isinstance(r, str) else (r.get('text', '') + (' (STOP CONDITION)' if r.get('stop') else '')) for r in p.get('risks', [])]
    if risks:
        col2.append(('bullets', 'Unresolved risks', risks))
    notes = list(p.get('layout_notes') or []) + list(p.get('facts') or []) + \
        ['Accepted: %s' % a['why'] for a in p.get('accepted_warnings') or [] if a.get('why')]
    if notes:
        col2.append(('notes', 'Notes', notes))
    col2.append(('legend', 'Legend', legend_items(L)))
    return col1, col2


def draw_column(c, x, y, w, blocks, min_y):
    for kind, title, payload in blocks:
        if y < min_y + 30:
            break
        if title:
            y = K.heading(c, x, y, w, title, 8.5)
        if kind == 'text':
            y = K.text_block(c, x, y, w, payload, size=7.4, max_y=min_y)
        elif kind == 'small':
            y = K.text_block(c, x, y + 4, w, payload, size=6, color=K.GREY, max_y=min_y)
        elif kind == 'table':
            head, rows, cols, right = payload
            y = K.table(c, x, y, w, rows, head=head, cols=cols, right=right, size=6.8, min_y=min_y)
        elif kind == 'notes':
            y = K.numbered(c, x, y, w, payload, size=6.8, min_y=min_y)
        elif kind == 'bullets':
            y = K.numbered(c, x, y, w, payload, size=6.8, bullet=True, min_y=min_y)
        elif kind == 'legend':
            half = (len(payload) + 1) // 2
            y0 = y
            for i, (k_, col, txt) in enumerate(payload):
                cx = x + (w / 2 if i >= half else 0)
                cy = y0 - 12 - (i % half) * 13
                K.legend_row(c, cx, cy, k_, col, txt, size=7)
            y = y0 - half * 13 - 8
        y -= 9
    return y


def render(L, failing):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(K.PAGE_W, K.PAGE_H))
    p = L.p
    ax, ay, aw, ah = K.AREA
    dw = aw - SIDE_W - 30
    label_h = 46
    v = View(L, ax, ay + label_h + 30, dw, ah - label_h - 70)
    scale_txt = '1" = %d\'-0"' % v.scale
    c.saveState()
    clip = c.beginPath()
    clip.rect(ax, ay + label_h + 26, dw, ah - label_h - 26)
    c.clipPath(clip, stroke=0, fill=0)
    draw_plan(c, v, L)
    c.restoreState()
    K.north_arrow(c, ax + 45, ay + ah - 45, L.north - L.rot, 64)
    hbu = p.get('hbu') or {}
    K.view_title(c, ax, ay + label_h + 8, 1, 'Conceptual site layout' + (' — ' + hbu['selected'] if hbu.get('selected') else ''),
                 scale_txt + ' on 24" × 36"', v.scale)
    K.stamp_disclaimer(c, ax, ay + label_h, dw, LABEL)
    if failing:
        c.saveState()
        c.setFillColorRGB(*K.RED)
        c.setFont(FB, 40)
        c.drawString(ax + 130, ay + ah - 60, 'DRAFT — CHECKS FAILING, NOT FOR HAND-OFF')
        c.restoreState()
    # the right-hand columns
    x2 = ax + aw - SIDE_W
    col1, col2 = side_content(L)
    draw_column(c, x2, ay + ah, SIDE_COL, col1, ay)
    draw_column(c, x2 + SIDE_COL + GAP, ay + ah, SIDE_COL, col2, ay)
    pr = dict(p.get('project') or {})
    pr.setdefault('phase', 'Conceptual site layout')
    pr.setdefault('site_line', '%.2f ac · %s' % (L.acres, hbu.get('selected', '')))
    K.title_block(c, pr, dict(number='SP-1', title='Conceptual site layout', sub=hbu.get('selected', ''), scale=scale_txt))
    c.showPage()
    c.save()
    return buf.getvalue(), v.scale


def on_border(content, out_path, half=False):
    border = PdfReader(BORDER).pages[0]
    w = PdfWriter()
    for pg in PdfReader(io.BytesIO(content)).pages:
        page = w.add_blank_page(width=K.PAGE_W, height=K.PAGE_H)
        page.merge_page(border)
        page.merge_page(pg)
    with open(out_path, 'wb') as f:
        w.write(f)
    if not half:
        return None
    s = 17 * 72 / K.PAGE_W
    w2 = PdfWriter()
    for pg in PdfReader(out_path).pages:
        np_ = w2.add_blank_page(width=K.PAGE_W * s, height=K.PAGE_H * s)
        np_.merge_transformed_page(pg, Transformation().scale(s, s))
    hp = out_path.replace('.pdf', '-11x17-print-only.pdf')
    with open(hp, 'wb') as f:
        w2.write(f)
    return hp


def handoff(L, pdf_name):
    """the fs-set-plans project.json: the same model with the measured numbers filled in"""
    p = copy.deepcopy(L.p)
    s = p['site']
    pk = L.parking_summary()
    s['parking'] = dict(required=pk['target'] or pk['code'], provided=pk['provided'], ada=pk['ada_prov'],
                        basis='; '.join('%s: %s' % (r['label'], r['basis']) for r in pk['rows']) or 'see code analysis')
    st = s.setdefault('stated', {})
    st['building_sf'] = round(L.gfa())
    if L.units():
        st['units'] = L.units()
    pav = list(s.get('paving') or [])
    for r in L.rows:
        pav.append({'kind': 'parking', 'poly': [[round(q[0], 2), round(q[1], 2)] for q in r['rect']]})
    for d in L.drives:
        pav.append({'kind': 'drive', 'poly': [[round(q[0], 2), round(q[1], 2)] for q in band(d['pts'], d.get('width', 24))]})
    s['paving'] = pav
    det = L.detention()
    s.setdefault('developed_acres', round(det['dev_ac'], 3))
    s['detention_rate_acft_per_ac'] = det['rate']
    for pd, info in zip(s.get('ponds', []), det['rows']):
        pd['volume_acft'] = round(info['vol'], 3)  # the side-slope volume, so the set reports the same storage
    for t in p.get('types', []):
        n = sum(1 for b in L.buildings if b.get('type') == t['id'])
        if n:
            t['count'] = n
    facts = list(p.get('facts') or [])
    for r in (p.get('code') or {}).get('rules', []):
        facts.append('%s: %s %s%s' % (r.get('cls', 'UNVERIFIED'), r.get('item'), r.get('req'), (' (' + r['source'] + ')') if r.get('source') else ''))
    for r in p.get('risks', []):
        t = r if isinstance(r, str) else r.get('text', '')
        facts.append(t if t.upper().startswith(('UNVERIFIED', 'VERIFIED', 'OWNER', 'ENGINEERING')) else 'UNVERIFIED: ' + t)
    p['facts'] = facts
    notes = p.setdefault('notes', {})
    hbu = p.get('hbu') or {}
    if not notes.get('description') and hbu.get('selected'):
        notes['description'] = '%s on %.2f acres. %s' % (hbu['selected'], L.acres, hbu.get('statement', ''))
    p['source_layout'] = dict(pdf=pdf_name, sheet='SP-1', note='Geometry in feet in the reference frame of this file; the PDF is drawn turned by display_rotate_deg. Build the set from this file, not by tracing the PDF.')
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('model')
    ap.add_argument('--out', default='out')
    ap.add_argument('--check-only', action='store_true')
    ap.add_argument('--half', action='store_true')
    a = ap.parse_args()
    p = json.load(open(a.model))
    L = Layout(p)
    checks = L.checks()
    fails = [t for lv, t in checks if lv == 'fail']
    lines = ['%-4s %s' % ({'ok': 'OK', 'warn': 'WARN', 'fail': 'FAIL'}[lv], t) for lv, t in checks]
    m = L.measures()
    summary = ['', 'Site %.3f ac · GFA %s · FAR %.2f · coverage %.1f%% · impervious %s · units %d · parking %d' % (
        L.acres, fmt_sf(L.gfa()), L.gfa() / L.area_sf, 100 * L.footprint() / L.area_sf, m['impervious'][1], L.units(), L.stalls_provided()),
        'Leasable + sellable %s' % fmt_sf(L.leasable_sellable()), 'Land use: ' + '; '.join('%s %.2f ac' % (n, a_ / SQFT_ACRE) for n, a_ in L.land_use())]
    report = '\n'.join(lines + summary)
    print(report)
    if a.check_only:
        sys.exit(2 if fails else 0)
    os.makedirs(a.out, exist_ok=True)
    name = slug((p.get('project') or {}).get('name')) + ('-' + slug(p['project']['option']) if (p.get('project') or {}).get('option') else '')
    pdf = os.path.join(a.out, name + '-site-layout.pdf')
    content, scale = render(L, bool(fails))
    half = on_border(content, pdf, a.half)
    model_path = os.path.join(a.out, name + '-site-model.json')
    json.dump(handoff(L, os.path.basename(pdf)), open(model_path, 'w'), indent=1)
    open(os.path.join(a.out, name + '-checks.txt'), 'w').write(report + '\n')
    print('\nWrote %s (1" = %d\')%s, %s and %s-checks.txt' % (pdf, scale, (', ' + half) if half else '', model_path, name))
    if fails:
        print('%d check(s) FAILED: fix the model and rebuild. Do not hand this sheet off.' % len(fails))
        sys.exit(2)


if __name__ == '__main__':
    main()
