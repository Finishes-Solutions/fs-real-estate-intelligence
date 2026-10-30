"""Conceptual site plan: Montreve resort and cabin lots.

Draws data/lots.json (true-scale lots from the vector lot map) with the program from Will's business plan:
pavilion on lots 14-15, dining on 12-13, tennis and pickleball on 10-11, the seven financed homes kept, and the
standard cabin (data/cabin_footprint.json) placed on every other lot, facing its road behind a 30 ft front setback.
Writes out/Montreve_Site_Plan.pdf (36 x 24 in, 1 in = 70 ft), out/site_plan.png (preview) and data/site_plan.json.

  python3 -I projects/montreve/scripts/site_plan.py
"""
import json, math, subprocess
from pathlib import Path
from shapely.geometry import Polygon, Point, LineString, box
from shapely.ops import unary_union, nearest_points
from shapely import affinity
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white, black

ROOT = Path(__file__).resolve().parents[1]
LOTS = json.loads((ROOT / 'data' / 'lots.json').read_text())
FP_FILE = ROOT / 'data' / 'cabin_footprint.json'
FP = json.loads(FP_FILE.read_text()) if FP_FILE.exists() else {'width_ft': 33.33, 'depth_ft': 40.58, 'deck_depth_ft': 9.0}
CAB_W, CAB_D = FP.get('width_ft', 33.33), FP.get('depth_ft', 40.58)
DECK_D = FP.get('deck_depth_ft', 9.0)

NAVY, INK, MUTED = HexColor('#0A3047'), HexColor('#1E2B33'), HexColor('#6B7A86')
FILL = {'cabin': HexColor('#DCE8F1'), 'existing': HexColor('#9FC3DD'), 'pavilion': HexColor('#F6D9A1'), 'dining': HexColor('#F3B9A6'),
        'courts': HexColor('#D9CCEE')}
ROAD, BLDG, GREEN, COURT = HexColor('#C9CDD1'), HexColor('#33444F'), HexColor('#BFD9B4'), HexColor('#5E8C6A')
SETBACK_FRONT, SETBACK_SIDE = 30, 10

lots = {int(n): Polygon(v['ring']) for n, v in LOTS['lots'].items()}
use = {int(n): v['use'] for n, v in LOTS['lots'].items()}
roads = unary_union([Polygon(r) for r in LOTS['roads']])


def frame(poly):
    """Origin on the lot's road frontage, u along the frontage, v into the lot (away from the road)."""
    edge = poly.exterior.intersection(roads.buffer(3))
    if edge.is_empty or edge.length < 20:  # a flag lot or one the road outline misses: face the nearest road
        q, m = nearest_points(roads, poly)
        n = (m.x - q.x, m.y - q.y); L = math.hypot(*n) or 1; n = (n[0] / L, n[1] / L)
        return (m.x, m.y), (-n[1], n[0]), n
    # the frontage chord: the two frontage points farthest apart (a curved or broken frontage still gives one direction)
    pts = [c for g in getattr(edge, 'geoms', [edge]) for c in g.coords]
    a, b = max(((p, q) for i, p in enumerate(pts) for q in pts[i + 1:]), key=lambda pq: math.dist(*pq))
    m = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); m = nearest_points(poly.exterior, m)[0]
    t = (b[0] - a[0], b[1] - a[1]); L = math.hypot(*t); t = (t[0] / L, t[1] / L)
    n = (-t[1], t[0])
    if not poly.contains(Point(m.x + n[0] * 5, m.y + n[1] * 5)):
        n = (-n[0], -n[1])
    return (m.x, m.y), t, n


def rect(o, t, n, u, v, w, d):
    """A w (along u) by d (along v) rectangle whose front-centre sits at (u, v) in the frame."""
    cx, cy = o[0] + t[0] * u + n[0] * v, o[1] + t[1] * u + n[1] * v
    pts = []
    for du, dv in ((-w / 2, 0), (w / 2, 0), (w / 2, d), (-w / 2, d)):
        pts.append((cx + t[0] * du + n[0] * dv, cy + t[1] * du + n[1] * dv))
    return Polygon(pts)


def place(poly, w, d, v0, u0=0, inset=SETBACK_SIDE, fr=None, avoid=()):
    """Nearest spot to (u0, v0) where the rectangle fits inside the lot (inset) and clear of `avoid`."""
    o, t, n = fr or frame(poly)
    ok = poly.buffer(-inset)
    tries = sorted(((du, dv) for du in range(-150, 151, 5) for dv in range(0, 200, 5)), key=lambda p: abs(p[0]) + 1.5 * p[1])
    for du, dv in tries:
        r = rect(o, t, n, u0 + du, v0 + dv, w, d)
        if ok.contains(r) and not any(r.intersects(a) for a in avoid):
            return r, (o, t, n), (u0 + du, v0 + dv)
    return None, (o, t, n), None


# ---------------------------------------------------------------- layout
cabins, drives, amen, notes = {}, [], [], []
for n, P in lots.items():
    if use[n] not in ('cabin', 'existing'):
        continue
    r, (o, t, nv), uv = place(P, CAB_W, CAB_D + DECK_D, SETBACK_FRONT)
    if r is None:  # a lot the poster clips (26): try a 20 ft front and 5 ft side yard before giving up
        r, (o, t, nv), uv = place(P, CAB_W, CAB_D + DECK_D, 20, inset=5)
        if r is None:
            notes.append(f'Lot {n}: the standard cabin did not fit inside the setbacks'); continue
        notes.append(f'Lot {n}: drawn clipped on the source (listed {LOTS["lots"][str(n)]["acres_listed"]} ac); cabin shown with a 20 ft front / 5 ft side yard')
    house = rect(o, t, nv, uv[0], uv[1], CAB_W, CAB_D)
    deck = rect(o, t, nv, uv[0], uv[1] + CAB_D, CAB_W, DECK_D)
    cabins[n] = {'house': house, 'deck': deck}
    front = (o[0] + t[0] * uv[0] + nv[0] * uv[1], o[1] + t[1] * uv[0] + nv[1] * uv[1])
    q = nearest_points(roads, Point(front))[0]
    drives.append(LineString([front, (q.x, q.y)]))

def frame_square(poly):
    """frame() turned to the nearest side of the site's minimum rectangle, so buildings line up with the lot lines."""
    o, t, n = frame(poly)
    c = list(poly.minimum_rotated_rectangle.exterior.coords)
    axes = [((c[1][0] - c[0][0]), (c[1][1] - c[0][1])), ((c[2][0] - c[1][0]), (c[2][1] - c[1][1]))]
    axes = [(a / math.hypot(a, b), b / math.hypot(a, b)) for a, b in axes]
    u = max(axes, key=lambda a: abs(a[0] * t[0] + a[1] * t[1]))
    if u[0] * t[0] + u[1] * t[1] < 0: u = (-u[0], -u[1])
    v = (-u[1], u[0])
    if v[0] * n[0] + v[1] * n[1] < 0: v = (-v[0], -v[1])
    return o, u, v


# resort core along Amber Valley Way: one frame per pair of lots
pair = lambda a, b: unary_union([lots[a], lots[b]]).buffer(0.5).buffer(-0.5)
courts_site, dining_site, pav_site = pair(10, 11), pair(12, 13), pair(14, 15)

# lots 10-11: one tennis court (60 x 120 fenced) and a pair of pickleball courts (64 x 60 fenced), long axis into the lot
taken = []
tennis, fr, _ = place(courts_site, 60, 120, 20, -45, inset=8, fr=frame_square(courts_site))
pick, _, _ = place(courts_site, 64, 60, 20, 45, inset=8, fr=fr, avoid=[tennis.buffer(6)] if tennis else [])
for g, kind, label in ((tennis, 'tennis', 'TENNIS'), (pick, 'pickle', 'PICKLEBALL (2)')):
    if g is None: notes.append(f'{label} did not fit on lots 10-11')
    else: amen.append({'kind': kind, 'geom': g, 'label': label})

# lots 12-13: 2,500 sf dining and catering (62 x 40) with a service yard; guest parking on the frontage
park1, fr, _ = place(dining_site, 150, 60, 0, 0, inset=4, fr=frame_square(dining_site))
dining, _, _ = place(dining_site, 62, 40, 80, -20, inset=12, fr=fr, avoid=[park1.buffer(8)] if park1 else [])
svc, _, _ = place(dining_site, 30, 24, 80, 40, inset=8, fr=fr, avoid=[g.buffer(6) for g in (park1, dining) if g])
for g, kind, label in ((park1, 'parking', 'PARKING'), (dining, 'bldg', 'DINING & CATERING\n2,500 SF'), (svc, 'service', 'SERVICE')):
    if g is None: notes.append(f'{label} did not fit on lots 12-13')
    else: amen.append({'kind': kind, 'geom': g, 'label': label})

# lots 14-15: 6,000 sf glass pavilion (100 x 60) facing the view side, arrival parking on lot 14, ceremony lawn beside it
fr = frame_square(pav_site)
pav, _, _ = place(pav_site, 100, 60, 60, 20, inset=10, fr=fr)
park2, _, _ = place(pav_site, 130, 60, 0, -60, inset=4, fr=fr, avoid=[pav.buffer(10)] if pav else [])
if park2 is None:
    park2, _, _ = place(pav_site, 90, 60, 0, -60, inset=4, fr=fr, avoid=[pav.buffer(10)] if pav else [])
lawn = None
if pav is not None:
    for u0 in (-235, -250, -215, 100):
        lawn, _, _ = place(pav_site, 70, 50, 40, u0, inset=8, fr=fr, avoid=[g.buffer(12) for g in (pav, park2) if g])
        if lawn is not None: break
for g, kind, label in ((park2, 'parking', 'PARKING'), (pav, 'bldg', 'GLASS PAVILION\n6,000 SF'), (lawn, 'lawn', 'CEREMONY\nLAWN')):
    if g is None: notes.append(f'{label} did not fit on lots 14-15')
    else: amen.append({'kind': kind, 'geom': g, 'label': label})


def stalls(g):
    """Double-loaded bay (2 x 18 ft stalls + 24 ft aisle) at 9 ft per stall."""
    c = list(g.exterior.coords); a = math.dist(c[0], c[1]); return int(a // 9) * 2

parking_total = sum(stalls(a['geom']) for a in amen if a['kind'] == 'parking')

# lot 2's utility / sewage disposal easement: the hatched gap the poster leaves between lots 1, 2 and 3 and the road
_near = unary_union([lots[1], lots[2], lots[3], roads.intersection(unary_union([lots[1], lots[3]]).buffer(80))])
gap = _near.buffer(120, join_style=2).buffer(-120, join_style=2).difference(unary_union([_near, *lots.values()]).buffer(1))
easement = max(getattr(gap, 'geoms', [gap]), key=lambda g: g.area if g.distance(lots[2]) < 5 else 0)

# trail: a loop just inside the site edge, joining the resort core
site = Polygon(LOTS['site'])
trail = site.buffer(-14).exterior.simplify(4)

# ---------------------------------------------------------------- drawing
W, H = 36 * 72, 24 * 72
SCALE = 72 / 70   # points per foot: 1 in = 70 ft
xs = [c[0] for c in site.exterior.coords]; ys = [c[1] for c in site.exterior.coords]
MAP_W = 26.6 * 72
ox = 0.7 * 72 + (MAP_W - (max(xs) - min(xs)) * SCALE) / 2 - min(xs) * SCALE
oy = 2.4 * 72 + (H - 3.2 * 72 - (max(ys) - min(ys)) * SCALE) / 2 - min(ys) * SCALE
X = lambda p: (ox + p[0] * SCALE, oy + p[1] * SCALE)


def path(c, geom, fill=None, stroke=None, width=0.6, dash=None):
    for g in getattr(geom, 'geoms', [geom]):
        coords = list(g.exterior.coords) if hasattr(g, 'exterior') else list(g.coords)
        p = c.beginPath(); x, y = X(coords[0]); p.moveTo(x, y)
        for q in coords[1:]: p.lineTo(*X(q))
        if hasattr(g, 'exterior'): p.close()
        c.setLineWidth(width); c.setDash(*(dash or ([], 0)) if isinstance(dash, tuple) else (dash or []))
        if fill is not None: c.setFillColor(fill)
        if stroke is not None: c.setStrokeColor(stroke)
        c.drawPath(p, fill=1 if fill is not None else 0, stroke=1 if stroke is not None else 0)
        c.setDash([])


def text(c, s, p, size=9, color=INK, bold=False, angle=0):
    c.saveState(); c.setFillColor(color); c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    x, y = X(p) if not isinstance(p, tuple) or len(p) != 3 else p[:2]
    c.translate(x, y); c.rotate(angle)
    lines = s.split('\n')
    for i, ln in enumerate(lines):
        c.drawCentredString(0, -size * 0.35 - (i - (len(lines) - 1) / 2) * size * 1.15, ln)
    c.restoreState()


def angle_of(g):
    c = list(g.exterior.coords); a = math.degrees(math.atan2(c[1][1] - c[0][1], c[1][0] - c[0][0]))
    return a + 180 if a < -90 else a - 180 if a > 90 else a


def draw():
    out = ROOT / 'out' / 'Montreve_Site_Plan.pdf'
    c = canvas.Canvas(str(out), pagesize=(W, H)); c.setTitle('Montreve conceptual site plan')
    c.setFillColor(HexColor('#F7F9F8')); c.rect(0, 0, W, H, fill=1, stroke=0)
    # site and roads
    path(c, site.buffer(30), fill=HexColor('#E3EDDF'))
    path(c, roads, fill=ROAD, stroke=HexColor('#A9AFB4'), width=0.5)
    # lots
    for n, P in lots.items():
        path(c, P, fill=FILL[use[n]], stroke=white, width=1.6)
        path(c, P, stroke=HexColor('#7F99AD'), width=0.5)
    path(c, easement, fill=HexColor('#EEF0EC'), stroke=HexColor('#7F99AD'), width=0.5)
    c.saveState(); p = c.beginPath(); co = list(easement.exterior.coords); p.moveTo(*X(co[0]))
    for q in co[1:]: p.lineTo(*X(q))
    p.close(); c.clipPath(p, stroke=0, fill=0); c.setStrokeColor(HexColor('#8C959C')); c.setLineWidth(0.5)
    bx = easement.bounds; x0, y0 = X((bx[0], bx[1])); x1, y1 = X((bx[2], bx[3]))
    for k in range(int(x0 - (y1 - y0)), int(x1), 6): c.line(k, y0, k + (y1 - y0), y1)
    c.restoreState()
    text(c, 'LOT 2 SEPTIC /\nUTILITY EASEMENT\n0.77 AC', easement.representative_point().coords[0], 6, HexColor('#3C474F'), True)
    path(c, trail, stroke=COURT, width=1.1, dash=([4, 3], 0))
    for d in drives: path(c, d, stroke=HexColor('#9AA3AA'), width=2.2)
    for n, g in cabins.items():
        path(c, g['deck'], fill=HexColor('#C9B79C'), stroke=BLDG, width=0.4)
        path(c, g['house'], fill=BLDG if use[n] == 'cabin' else NAVY, stroke=BLDG, width=0.4)
    for a in amen:  # 24 ft access drive from each parking bay to the road
        if a['kind'] == 'parking':
            q, m = nearest_points(roads, a['geom'])
            path(c, LineString([(q.x, q.y), (m.x, m.y)]).buffer(12, cap_style=2), fill=HexColor('#B8BEC3'))
    for a in amen:
        g, k = a['geom'], a['kind']
        if k == 'parking':
            path(c, g, fill=HexColor('#B8BEC3'), stroke=HexColor('#8C959C'), width=0.5)
            co = list(g.exterior.coords); L = math.dist(co[0], co[1])
            for i in range(1, int(L // 9)):
                f = i * 9 / L
                p0 = (co[0][0] + (co[1][0] - co[0][0]) * f, co[0][1] + (co[1][1] - co[0][1]) * f)
                p3 = (co[3][0] + (co[2][0] - co[3][0]) * f, co[3][1] + (co[2][1] - co[3][1]) * f)
                for frac in ((0, 18 / 60), (42 / 60, 1)):
                    a0 = (p0[0] + (p3[0] - p0[0]) * frac[0], p0[1] + (p3[1] - p0[1]) * frac[0]); a1 = (p0[0] + (p3[0] - p0[0]) * frac[1], p0[1] + (p3[1] - p0[1]) * frac[1])
                    path(c, LineString([a0, a1]), stroke=white, width=0.4)
            text(c, f'{stalls(g)} STALLS', g.centroid.coords[0], 6.5, INK, True, angle_of(g))
        elif k in ('tennis', 'pickle'):
            path(c, g, fill=COURT, stroke=white, width=1)
            inner = g.buffer(-10 if k == 'tennis' else -8, join_style=2)
            path(c, inner, fill=HexColor('#6FA1C8'), stroke=white, width=0.6)
            if k == 'pickle':
                co = list(g.exterior.coords)
                mid = ((co[0][0] + co[1][0]) / 2, (co[0][1] + co[1][1]) / 2), ((co[3][0] + co[2][0]) / 2, (co[3][1] + co[2][1]) / 2)
                path(c, LineString(mid), stroke=white, width=1.2)
            text(c, a['label'], g.centroid.coords[0], 6.5, white, True, angle_of(g) + (90 if k == 'tennis' else 0))
        elif k == 'lawn':
            path(c, g.buffer(8, join_style=1), fill=GREEN, stroke=COURT, width=0.4)
            text(c, a['label'], g.centroid.coords[0], 6.5, HexColor('#2F5A3A'), True, angle_of(g))
        elif k == 'service':
            path(c, g, fill=HexColor('#D0D4D7'), stroke=BLDG, width=0.4)
        else:
            path(c, g, fill=HexColor('#FFFFFF'), stroke=NAVY, width=1.4)
            path(c, g.buffer(-3, join_style=2), stroke=HexColor('#7FB2D6'), width=0.6)
            text(c, a['label'], g.centroid.coords[0], 7, NAVY, True, angle_of(g))
    # lot labels
    for n, P in lots.items():
        if use[n] not in ('cabin', 'existing'):
            continue
        lab = LOTS['lots'][str(n)]
        spot = P.representative_point() if n not in cabins else Point(lab['label'])
        if n in cabins and cabins[n]['house'].buffer(14).contains(spot):
            spot = max((P.buffer(-12).exterior.interpolate(i / 40, normalized=True) for i in range(40)), key=lambda p: p.distance(cabins[n]['house']))
        if any(a['geom'].buffer(10).contains(spot) for a in amen):
            continue  # amenity lots are labelled by the use; the number goes on the frontage
        x, y = X((spot.x, spot.y))
        c.setFillColor(white); c.setStrokeColor(NAVY); c.setLineWidth(0.8); c.circle(x, y + 3, 8, fill=1, stroke=1)
        c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 8.5); c.drawCentredString(x, y, str(n))
        c.setFont('Helvetica', 6.2); c.setFillColor(INK); c.drawCentredString(x, y - 12, f"{lab['acres_listed']:.2f} AC")
    for n in (10, 11, 12, 13, 14, 15):
        o, t, nv = frame(lots[n]); x, y = X((o[0] - nv[0] * 10, o[1] - nv[1] * 10))  # just out on the road edge
        c.setFillColor(white); c.setStrokeColor(NAVY); c.circle(x, y, 7, fill=1, stroke=1); c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 7.5); c.drawCentredString(x, y - 2.6, str(n))
    # road names along the longest piece of each road (upper = Amber Valley Way, lower = Creeksong Way)
    for name, near in (('AMBER VALLEY WAY', lots[12].union(lots[20])), ('CREEKSONG WAY', lots[29].union(lots[30]))):
        q = nearest_points(roads, near.centroid)[0]
        seg = max((LineString(r.exterior.coords) for r in getattr(roads, 'geoms', [roads])), key=lambda s: -s.distance(q))
        pr = seg.project(q); a0 = seg.interpolate(pr - 30); a1 = seg.interpolate(pr + 30)
        ang = math.degrees(math.atan2(a1.y - a0.y, a1.x - a0.x)); ang = ang + 180 if ang < -90 else ang - 180 if ang > 90 else ang
        text(c, name, (q.x, q.y), 8, HexColor('#3C474F'), True, ang)
    # entrance
    ent = min(site.exterior.coords, key=lambda p: p[0] + 0.2 * p[1])
    x, y = X(ent)
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 9); c.drawString(x - 30, y - 34, 'ENTRANCE / GATE')
    c.setFont('Helvetica', 7.5); c.drawString(x - 30, y - 45, 'to Happy Hollow Road (2481)')
    # title block, legend, tables
    sidebar(c)
    c.showPage(); c.save()
    return out


def sidebar(c):
    x0 = 27.6 * 72; w = W - x0 - 0.5 * 72
    c.setFillColor(white); c.setStrokeColor(HexColor('#C9D6E0')); c.rect(x0, 0.5 * 72, w, H - 72, fill=1, stroke=1)
    logo = ROOT / 'source' / 'logos' / 'MONTREVE_LOGO_DRAFT-01.svg'
    y = H - 1.0 * 72
    try:
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPDF
        dwg = svg2rlg(str(logo)); s = (w - 40) / dwg.width; dwg.scale(s, s); renderPDF.draw(dwg, c, x0 + 20, y - dwg.height * s); y -= dwg.height * s + 20
    except Exception:
        c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 28); c.drawString(x0 + 20, y - 24, 'MONTREVE'); y -= 50
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 15); c.drawString(x0 + 20, y, 'Conceptual Site Plan'); y -= 18
    c.setFont('Helvetica', 9); c.setFillColor(MUTED)
    for ln in ('Resort core and for-sale cabin lots', '2481 Happy Hollow Road, Sevierville, TN', 'Sevier County parcel 122 005.00 · 35.72487, -83.68966'):
        c.drawString(x0 + 20, y, ln); y -= 12
    y -= 10
    # legend
    c.setFont('Helvetica-Bold', 9.5); c.setFillColor(NAVY); c.drawString(x0 + 20, y, 'LEGEND'); y -= 16
    n_by = lambda u: sorted(k for k, v in use.items() if v == u)
    leg = [(FILL['existing'], f'Financed homes, kept and sold ({len(n_by("existing"))})', ', '.join(map(str, n_by('existing')))),
           (FILL['cabin'], f'New cabin lots for sale ({len(n_by("cabin"))})', ', '.join(map(str, n_by('cabin')))),
           (FILL['pavilion'], 'Glass wedding pavilion and lawn', 'Lots 14 and 15'),
           (FILL['dining'], 'Dining and catering building', 'Lots 12 and 13'),
           (FILL['courts'], 'Tennis and two pickleball courts', 'Lots 10 and 11')]
    for col, a, b in leg:
        c.setFillColor(col); c.setStrokeColor(HexColor('#7F99AD')); c.rect(x0 + 20, y - 4, 18, 11, fill=1, stroke=1)
        c.setFillColor(INK); c.setFont('Helvetica-Bold', 8.5); c.drawString(x0 + 46, y + 1, a)
        c.setFont('Helvetica', 7.5); c.setFillColor(MUTED); c.drawString(x0 + 46, y - 9, b); y -= 24
    for draw_sym, label in ((lambda yy: (c.setFillColor(BLDG), c.rect(x0 + 22, yy - 3, 14, 10, fill=1, stroke=0)), 'Standard cabin, 33\'-4" x 33\'-4" + 9\' deck'),
                            (lambda yy: (c.setStrokeColor(COURT), c.setDash([4, 3]), c.setLineWidth(1.1), c.line(x0 + 20, yy + 2, x0 + 38, yy + 2), c.setDash([])), 'Walking trail loop (desired, not an easement)'),
                            (lambda yy: (c.setFillColor(ROAD), c.rect(x0 + 20, yy - 3, 18, 10, fill=1, stroke=0)), '50 ft road right-of-way')):
        draw_sym(y); c.setFillColor(INK); c.setFont('Helvetica', 8.5); c.drawString(x0 + 46, y, label); y -= 18
    y -= 8
    # program table
    c.setFont('Helvetica-Bold', 9.5); c.setFillColor(NAVY); c.drawString(x0 + 20, y, 'SITE DATA'); y -= 14
    acres = lambda u: sum(LOTS['lots'][str(k)]['acres_listed'] for k in n_by(u))
    rows = [('Gross site (2024 appraisal)', '30.07 ac'), ('Platted lots (listed acres)', f"30 lots, {LOTS['acres_listed_total']:.2f} ac"),
            ('Cabins for sale', f"{len(cabins)} ({len(n_by('existing'))} existing + {len(n_by('cabin'))} new)"),
            ('   on', f"{acres('existing') + acres('cabin'):.2f} ac, avg {(acres('existing') + acres('cabin')) / len(cabins):.2f} ac/lot"),
            ('Resort core (lots 10-15)', f"{acres('pavilion') + acres('dining') + acres('courts'):.2f} ac"),
            ('Pavilion / dining', '6,000 sf / 2,500 sf'), ('Event parking shown', f'{parking_total} stalls'),
            ('Cabin', '2,444 sf, 3 bed, indoor pool'), ('Front / side setback used', f"{SETBACK_FRONT} ft / {SETBACK_SIDE} ft (assumed)")]
    for a, b in rows:
        c.setFont('Helvetica', 8.2); c.setFillColor(INK); c.drawString(x0 + 20, y, a); c.drawRightString(x0 + w - 20, y, b)
        c.setStrokeColor(HexColor('#E3E9EE')); c.setLineWidth(0.4); c.line(x0 + 20, y - 4, x0 + w - 20, y - 4); y -= 13
    y -= 10
    c.setFont('Helvetica-Bold', 9.5); c.setFillColor(NAVY); c.drawString(x0 + 20, y, 'NOTES'); y -= 13
    notes_txt = [
        'Lots traced from the Montreve vector lot map (Oct 2026), drawn from the recorded 2007 plat (LMB 9/90). '
        f"Scaled to feet from the listed acreages: 24 of 30 lots agree within 4%. Lots 18, 22, 26, 27, 28 and 33 draw smaller than listed; confirm on the plat.",
        'North is assumed up; the source has no north arrow. No topography is shown. All lots slope: building placement, courts and parking must follow a topographic survey and geotechnical report.',
        'Lot 2: 0.77 ac of its 1.44 ac is the utility / sewage disposal easement (hatched area excluded here). It is not amenity land.',
        'Existing homes are shown in a standard position, not as built. Event parking, fire access and the guest count need civil and fire review.',
        'Concept for discussion only. Not a survey, engineered plan or approval.'] + notes
    from reportlab.lib.utils import simpleSplit
    c.setFont('Helvetica', 7.4); c.setFillColor(MUTED)
    for t in notes_txt:
        for i, ln in enumerate(simpleSplit(t, 'Helvetica', 7.4, w - 52)):
            c.drawString(x0 + (20 if i == 0 else 28), y, ('•  ' if i == 0 else '') + ln); y -= 9.4
        y -= 3
    # scale bar and north
    yb = 0.5 * 72 + 64
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 8.5); c.drawString(x0 + 20, yb + 22, 'SCALE 1" = 70\'-0"  (36 x 24 sheet)')
    for i in range(4):
        c.setFillColor(NAVY if i % 2 == 0 else white); c.setStrokeColor(NAVY); c.rect(x0 + 20 + i * 50 * SCALE, yb, 50 * SCALE, 6, fill=1, stroke=1)
    c.setFont('Helvetica', 7); c.setFillColor(INK)
    for i in range(5): c.drawCentredString(x0 + 20 + i * 50 * SCALE, yb - 10, f"{i * 50}'")
    nx, ny = x0 + w - 50, yb + 4
    p = c.beginPath(); p.moveTo(nx, ny + 26); p.lineTo(nx - 9, ny - 6); p.lineTo(nx, ny); p.lineTo(nx + 9, ny - 6); p.close()
    c.setFillColor(NAVY); c.drawPath(p, fill=1, stroke=0); c.setFont('Helvetica-Bold', 9); c.drawCentredString(nx, ny + 30, 'N (assumed)')
    c.setFont('Helvetica', 7); c.setFillColor(MUTED); c.drawString(x0 + 20, 0.5 * 72 + 14, 'Prepared by Finishes Solutions · October 30, 2026 · Concept, not for construction')


def main():
    out = draw()
    png = ROOT / 'out' / 'site_plan'
    subprocess.run(['pdftoppm', '-r', '110', '-png', '-singlefile', str(out), str(png)], check=True)
    res = {'cabins': {n: {'house': [list(p) for p in g['house'].exterior.coords]} for n, g in cabins.items()},
           'amenities': [{'kind': a['kind'], 'label': a['label'], 'ring': [list(p) for p in a['geom'].exterior.coords]} for a in amen],
           'parking_stalls': parking_total, 'notes': notes}
    (ROOT / 'data' / 'site_plan.json').write_text(json.dumps(res, indent=1))
    print(f'{len(cabins)} cabins placed, {len(amen)} amenity pieces, {parking_total} stalls -> {out}')
    for n in notes: print(' ', n)


if __name__ == '__main__':
    main()
