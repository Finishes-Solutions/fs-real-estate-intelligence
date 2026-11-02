"""Drafting conventions shared by the drawing sheets: architectural dimension strings, tags and keynotes, level
markers, section cuts, wall poché, material hatches clipped to a shape, and labels that fit the space they are in.
All coordinates in points on the page."""
import math
from reportlab.lib.utils import simpleSplit
from . import kit as K
from .kit import F, FB

WALL_FILL = (0.25, 0.25, 0.26)


def ftin(v):
    """feet -> 12'-6\" (to the nearest inch)"""
    neg = v < 0
    v = abs(v)
    ft = int(v)
    inch = int(round((v - ft) * 12))
    if inch == 12:
        ft, inch = ft + 1, 0
    return ('-' if neg else '') + "%d'-%d\"" % (ft, inch)


# ---------- dimensions ----------
def dim(c, p1, p2, off, text=None, k=None, size=6.5, color=K.INK):
    """an architectural dimension between p1 and p2, drawn `off` pt to the left of p1->p2 (negative: right), with
    extension lines and 45° ticks. text: the label (default: the length in ft-in, needs k = pt per ft)"""
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    L = math.hypot(dx, dy)
    if L < 1:
        return
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    a = (p1[0] + nx * off, p1[1] + ny * off)
    b = (p2[0] + nx * off, p2[1] + ny * off)
    c.saveState()
    c.setStrokeColorRGB(*color)
    c.setLineWidth(0.35)
    sgn = 1 if off >= 0 else -1
    for p, q in ((p1, a), (p2, b)):
        c.line(p[0] + nx * 3 * sgn, p[1] + ny * 3 * sgn, q[0] + nx * 3 * sgn, q[1] + ny * 3 * sgn)
    c.line(a[0] - ux * 3, a[1] - uy * 3, b[0] + ux * 3, b[1] + uy * 3)
    c.setLineWidth(0.9)
    for q in (a, b):  # 45-degree ticks
        tx, ty = (ux + nx) * 2.6, (uy + ny) * 2.6
        c.line(q[0] - tx, q[1] - ty, q[0] + tx, q[1] + ty)
    if text is None:
        text = ftin(L / k) if k else ''
    ang = math.degrees(math.atan2(dy, dx))
    if ang > 90.1 or ang < -89.9:
        ang += 180
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    tw = c.stringWidth(text, F, size)
    c.translate(mx, my)
    c.rotate(ang)
    if tw + 6 > L:  # too tight: put the text beside the string
        c.translate(0, 0)
    c.setFillColorRGB(*color)
    c.setFont(F, size)
    c.drawCentredString(0, 1.6, text)
    c.restoreState()


def chain(c, pts, off, k, size=6.2):
    """a chain of dimensions along consecutive points"""
    for p, q in zip(pts, pts[1:]):
        if math.hypot(q[0] - p[0], q[1] - p[1]) > 3:
            dim(c, p, q, off, k=k, size=size)


# ---------- tags, keynotes, leaders ----------
def tag(c, x, y, text, shape='circle', size=6, color=K.INK, fill=(1, 1, 1)):
    r = max(5.0, c.stringWidth(text, FB, size) / 2 + 2.4)
    c.saveState()
    c.setStrokeColorRGB(*color)
    c.setFillColorRGB(*fill)
    c.setLineWidth(0.6)
    if shape == 'circle':
        c.circle(x, y, r, stroke=1, fill=1)
    elif shape == 'hex':
        p = c.beginPath()
        for i in range(6):
            a = math.radians(60 * i)
            (p.moveTo if i == 0 else p.lineTo)(x + r * 1.1 * math.cos(a), y + r * 1.1 * math.sin(a))
        p.close()
        c.drawPath(p, stroke=1, fill=1)
    elif shape == 'diamond':
        p = c.beginPath()
        p.moveTo(x, y + r * 1.25)
        p.lineTo(x + r * 1.25, y)
        p.lineTo(x, y - r * 1.25)
        p.lineTo(x - r * 1.25, y)
        p.close()
        c.drawPath(p, stroke=1, fill=1)
    else:
        c.rect(x - r, y - r * 0.8, 2 * r, 1.6 * r, stroke=1, fill=1)
    c.setFillColorRGB(*color)
    c.setFont(FB, size)
    c.drawCentredString(x, y - size * 0.35, text)
    c.restoreState()


def leader(c, frm, to, color=K.INK):
    c.saveState()
    c.setStrokeColorRGB(*color)
    c.setLineWidth(0.4)
    c.line(frm[0], frm[1], to[0], to[1])
    c.setFillColorRGB(*color)
    c.circle(to[0], to[1], 1.1, stroke=0, fill=1)
    c.restoreState()


def keynote(c, at, tag_at, n):
    leader(c, tag_at, at)
    tag(c, tag_at[0], tag_at[1], str(n), 'square', 6.5)


# ---------- levels and section cuts ----------
def level(c, x, y, name, value, length=60, right=True, size=6.3):
    """a level line ending in a target symbol with the level's name and elevation"""
    c.saveState()
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(0.4)
    c.setDash([4, 2])
    x2 = x + length if right else x - length
    c.line(x, y, x2, y)
    c.setDash()
    r = 3.6
    c.circle(x2, y, r, stroke=1, fill=0)
    c.setFillColorRGB(*K.INK)
    p = c.beginPath()
    p.moveTo(x2, y)
    p.lineTo(x2 + r, y)
    p.arcTo(x2 - r, y - r, x2 + r, y + r, 0, 90)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    p = c.beginPath()
    p.moveTo(x2, y)
    p.lineTo(x2 - r, y)
    p.arcTo(x2 - r, y - r, x2 + r, y + r, 180, 90)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    tx = x2 + 6 if right else x2 - 6
    c.setFont(FB, size)
    (c.drawString if right else c.drawRightString)(tx, y + 1.5, name.upper())
    c.setFont(F, size - 0.5)
    (c.drawString if right else c.drawRightString)(tx, y - size, value)
    c.restoreState()


def section_cut(c, a, b, num, sheet, flip=False):
    """a section cut line from a to b with bubbles at both ends naming the view and its sheet; the arrow looks to the
    left of a->b (or the right with flip)"""
    c.saveState()
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(1.0)
    c.setDash([10, 3, 2, 3])
    c.line(a[0], a[1], b[0], b[1])
    c.setDash()
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L
    nx, ny = (-uy, ux) if not flip else (uy, -ux)
    for p, s in ((a, -1), (b, 1)):
        q = (p[0] + ux * 12 * s, p[1] + uy * 12 * s)
        c.line(p[0], p[1], q[0], q[1])
        r = 9
        c.setFillColorRGB(1, 1, 1)
        c.circle(q[0] + ux * r * s, q[1] + uy * r * s, r, stroke=1, fill=1)
        cx, cy = q[0] + ux * r * s, q[1] + uy * r * s
        c.setFillColorRGB(*K.INK)
        tri = c.beginPath()
        tri.moveTo(cx + nx * r * 1.7, cy + ny * r * 1.7)
        tri.lineTo(cx + ux * r * 0.7, cy + uy * r * 0.7)
        tri.lineTo(cx - ux * r * 0.7, cy - uy * r * 0.7)
        tri.close()
        c.drawPath(tri, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1)
        c.circle(cx, cy, r, stroke=1, fill=1)
        c.setStrokeColorRGB(*K.INK)
        c.line(cx - r, cy, cx + r, cy)
        c.setFillColorRGB(*K.INK)
        c.setFont(FB, 6)
        c.drawCentredString(cx, cy + 1.5, str(num))
        c.setFont(F, 4.8)
        c.drawCentredString(cx, cy - 5.5, sheet)
    c.restoreState()


def grid_bubble(c, x, y, text, r=8):
    c.saveState()
    c.setStrokeColorRGB(*K.INK)
    c.setFillColorRGB(1, 1, 1)
    c.setLineWidth(0.7)
    c.circle(x, y, r, stroke=1, fill=1)
    c.setFillColorRGB(*K.INK)
    c.setFont(FB, r * 0.95)
    c.drawCentredString(x, y - r * 0.33, text)
    c.restoreState()


# ---------- walls ----------
def inset(P, d):
    """a counter-clockwise polygon moved in by d (pt) on every edge"""
    n = len(P)
    lines = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
        lines.append(((a[0] + nx * d, a[1] + ny * d), (b[0] + nx * d, b[1] + ny * d)))
    out = []
    for i in range(n):
        (p1, p2), (p3, p4) = lines[i - 1], lines[i]
        den = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0])
        if abs(den) < 1e-9:
            out.append(p3)
            continue
        t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / den
        out.append((p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])))
    return out


def ccw(P):
    a = sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
    return list(P) if a > 0 else list(P)[::-1]


def wall_ring(c, P, thick, fill=WALL_FILL):
    """the exterior wall as a solid band `thick` pt wide inside the outline P"""
    P = ccw(P)
    Q = inset(P, thick)
    p = c.beginPath()
    p.moveTo(*P[0])
    for q in P[1:]:
        p.lineTo(*q)
    p.close()
    p.moveTo(*Q[-1])
    for q in Q[::-1][1:]:
        p.lineTo(*q)
    p.close()
    c.saveState()
    c.setFillColorRGB(*fill)
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(0.6)
    c.drawPath(p, stroke=1, fill=1, fillMode=0)  # even-odd: the ring only
    c.restoreState()


# ---------- hatches ----------
def clip_poly(c, pts):
    p = c.beginPath()
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    p.close()
    c.clipPath(p, stroke=0, fill=0)


def hatch(c, pts, pattern, k, color=(0.45, 0.45, 0.47)):
    """fill the polygon with a material pattern at real-world spacing (k: pt per ft), never denser than ~2.2 pt"""
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    c.saveState()
    clip_poly(c, pts)
    c.setStrokeColorRGB(*color)
    c.setLineWidth(0.25)

    def rows(step):
        y = y0 + step
        while y < y1:
            yield y
            y += step
    if pattern == 'brick':
        step = max(2.2, k * 0.667)  # 8" coursing
        for i, y in enumerate(rows(step)):
            c.line(x0, y, x1, y)
            if step > 4:  # head joints only when they read
                w = step * 3
                x = x0 + (w / 2 if i % 2 else 0)
                while x < x1:
                    c.line(x, y, x, y - step)
                    x += w
    elif pattern == 'stone':
        step = max(3.0, k * 1.33)
        for i, y in enumerate(rows(step)):
            c.line(x0, y, x1, y)
            w = step * 2.4
            x = x0 + (w * 0.45 if i % 2 else w * 0.1)
            while x < x1:
                c.line(x, y, x, y - step)
                x += w * (0.8 + 0.4 * ((int(x) * 7) % 5) / 5)
    elif pattern == 'cmu':
        step = max(2.4, k * 0.667)
        for i, y in enumerate(rows(step)):
            c.line(x0, y, x1, y)
            w = step * 2
            x = x0 + (w / 2 if i % 2 else 0)
            while x < x1:
                c.line(x, y, x, y - step)
                x += w
    elif pattern == 'siding':
        for y in rows(max(2.2, k * 0.6)):
            c.line(x0, y, x1, y)
    elif pattern == 'panel':
        x = x0
        step = max(3, k * 2)
        while x < x1:
            c.line(x, y0, x, y1)
            x += step
    elif pattern == 'stucco':
        c.setFillColorRGB(*color)
        step = max(5, k * 1.5)
        n = 0
        y = y0 + step / 2
        while y < y1:
            x = x0 + (step / 2 if n % 2 else 0)
            while x < x1:
                c.circle(x, y, 0.3, stroke=0, fill=1)
                x += step
            y += step / 1.6
            n += 1
    elif pattern == 'diag':
        step = max(3, k * 1.0)
        d = (x1 - x0) + (y1 - y0)
        s = -d
        while s < d:
            c.line(x0 + s, y0, x0 + s + (y1 - y0), y1)
            s += step
    elif pattern == 'concrete':
        c.setFillColorRGB(*color)
        step = max(4, k * 0.8)
        y = y0
        n = 0
        while y < y1:
            x = x0 + (n * 1.7 % step)
            while x < x1:
                c.circle(x, y, 0.35, stroke=0, fill=1)
                x += step
            y += step * 0.7
            n += 1
    elif pattern == 'earth':
        step = max(4, k * 1.2)
        d = (x1 - x0) + (y1 - y0)
        s = -d
        while s < d:
            c.line(x0 + s, y0, x0 + s + (y1 - y0), y1)
            c.line(x0 + s + (y1 - y0), y0, x0 + s, y1)
            s += step * 1.5
    elif pattern == 'insulation':
        step = max(4, k * 0.5)
        x = x0
        up = True
        p = c.beginPath()
        p.moveTo(x0, y0)
        while x < x1:
            x += step / 2
            p.lineTo(x, y1 if up else y0)
            up = not up
        c.drawPath(p, stroke=1, fill=0)
    c.restoreState()


def material_of(text):
    """the hatch for a wall material named in the design's exterior notes"""
    t = (text or '').lower()
    for key, pat in (('brick', 'brick'), ('stone', 'stone'), ('cmu', 'cmu'), ('block', 'cmu'), ('split-face', 'cmu'), ('siding', 'siding'),
                     ('fiber-cement', 'siding'), ('metal panel', 'panel'), ('panel', 'panel'), ('stucco', 'stucco'), ('eifs', 'stucco'), ('tilt', 'panel')):
        if key in t:
            return pat
    return None


# ---------- labels that fit ----------
def fit_text(c, cx, cy, w, h, lines, max_size=8, min_size=4.6, font=FB, sub=None, color=K.INK):
    """centre `lines` (and an optional smaller sub-line) in a w x h box: shrink, then wrap, until it fits.
    Returns False when it can't fit (the caller should tag the room instead)."""
    size = max_size
    while size >= min_size:
        wrapped = []
        for ln in lines:
            wrapped += simpleSplit(ln, font, size, w - 4)
        subs = simpleSplit(sub, F, size - 1, w - 4) if sub else []
        hh = len(wrapped) * size * 1.15 + len(subs) * (size - 1) * 1.15
        if hh <= h - 3 and all(c.stringWidth(x, font, size) <= w - 3 for x in wrapped):
            y = cy + hh / 2 - size * 0.9
            c.setFillColorRGB(*color)
            for ln in wrapped:
                c.setFont(font, size)
                c.drawCentredString(cx, y, ln)
                y -= size * 1.15
            for ln in subs:
                c.setFont(F, size - 1)
                c.drawCentredString(cx, y, ln)
                y -= (size - 1) * 1.15
            return True
        size -= 0.4
    return False
