"""Small plane geometry in feet. No third-party dependencies."""
import math


def area(poly):
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def centroid(poly):
    a = cx = cy = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        k = x1 * y2 - x2 * y1
        a += k
        cx += (x1 + x2) * k
        cy += (y1 + y2) * k
    if abs(a) < 1e-9:
        return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))
    return (cx / (3 * a), cy / (3 * a))


def bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def inside(pt, poly):
    x, y = pt
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            c = not c
        j = i
    return c


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def nearest_on_seg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return (a[0] + t * dx, a[1] + t * dy), t


def nearest_on_line(p, pts, closed=False):
    """-> (point, distance, segment index)"""
    best = (None, float('inf'), -1)
    n = len(pts) if closed else len(pts) - 1
    for i in range(n):
        q, _ = nearest_on_seg(p, pts[i], pts[(i + 1) % len(pts)])
        d = dist(p, q)
        if d < best[1]:
            best = (q, d, i)
    return best


def length(pts, closed=False):
    n = len(pts) if closed else len(pts) - 1
    return sum(dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(n))


def along(pts, step, closed=False, start=None):
    """points every `step` ft along a polyline -> [(x, y, ux, uy)] (u: unit direction)"""
    out = []
    n = len(pts) if closed else len(pts) - 1
    carry = step / 2 if start is None else start
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        L = dist(a, b)
        if L == 0:
            continue
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        s = carry
        while s <= L:
            out.append((a[0] + ux * s, a[1] + uy * s, ux, uy))
            s += step
        carry = s - L
    return out


def offset_line(pts, d):
    """each segment moved d ft to its left (simple: no mitre), joined end to end"""
    out = []
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        L = dist(a, b) or 1
        nx, ny = -(b[1] - a[1]) / L * d, (b[0] - a[0]) / L * d
        out.append((a[0] + nx, a[1] + ny))
        out.append((b[0] + nx, b[1] + ny))
    return out


def rect_poly(x, y, w, d, rot=0.0):
    """a rectangle centred on (x, y), w along its own x, d along its own y, turned rot degrees counter-clockwise"""
    a = math.radians(rot)
    c, s = math.cos(a), math.sin(a)
    out = []
    for lx, ly in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)):
        out.append((x + lx * c - ly * s, y + lx * s + ly * c))
    return out


def rotate(p, deg, about=(0, 0)):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    x, y = p[0] - about[0], p[1] - about[1]
    return (about[0] + x * c - y * s, about[1] + x * s + y * c)


def poly_dist(p, poly):
    if inside(p, poly):
        return 0.0
    return nearest_on_line(p, poly, closed=True)[1]


def bearing(a, b):
    """quadrant bearing from a to b where +y is true north and +x east, e.g. N 12°34'56" E"""
    dx, dy = b[0] - a[0], b[1] - a[1]
    az = (math.degrees(math.atan2(dx, dy)) + 360) % 360
    if az <= 90:
        ns, ew, ang = 'N', 'E', az
    elif az <= 180:
        ns, ew, ang = 'S', 'E', 180 - az
    elif az <= 270:
        ns, ew, ang = 'S', 'W', az - 180
    else:
        ns, ew, ang = 'N', 'W', 360 - az
    d = int(ang)
    m = int((ang - d) * 60)
    s = int(round(((ang - d) * 60 - m) * 60))
    if s == 60:
        s, m = 0, m + 1
    if m == 60:
        m, d = 0, d + 1
    return '%s %02d°%02d\'%02d" %s' % (ns, d, m, s, ew)


def rects_overlap(a, b):
    w = min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x'])
    d = min(a['y'] + a['d'], b['y'] + b['d']) - max(a['y'], b['y'])
    return max(0, w) * max(0, d)


def shared_wall(a, b, tol=0.26):
    """the wall two rooms (rects x, y, w, d) share -> (orient 'v'|'h', at, from, to) or None"""
    if abs(a['x'] + a['w'] - b['x']) < tol or abs(b['x'] + b['w'] - a['x']) < tol:
        at = a['x'] + a['w'] if abs(a['x'] + a['w'] - b['x']) < tol else a['x']
        lo, hi = max(a['y'], b['y']), min(a['y'] + a['d'], b['y'] + b['d'])
        if hi - lo > 0.01:
            return ('v', at, lo, hi)
    if abs(a['y'] + a['d'] - b['y']) < tol or abs(b['y'] + b['d'] - a['y']) < tol:
        at = a['y'] + a['d'] if abs(a['y'] + a['d'] - b['y']) < tol else a['y']
        lo, hi = max(a['x'], b['x']), min(a['x'] + a['w'], b['x'] + b['w'])
        if hi - lo > 0.01:
            return ('h', at, lo, hi)
    return None
