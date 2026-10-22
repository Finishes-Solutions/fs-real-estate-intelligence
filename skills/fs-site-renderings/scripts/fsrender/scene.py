"""The 3D massing scene, built from the hand-off model (an fs-set-plans project.json): buildings at their exact
footprints and heights with their roofs, window / door openings and wall colours from each type's `design`, paving,
striped stalls, drives, ponds, lawns, streets and trees on a ground texture, and midday sun shadows.

Geometry in feet in the model's own frame (x right, y up), z up. Nothing here is invented beyond what the model gives,
except trees (placed by rule in open space and front buffers) and rooftop units on flat commercial roofs; both are
stated in the scene report."""
import math
import numpy as np
from PIL import Image, ImageDraw
from . import geom as G

RES_USES = ('sfr', 'townhomes', 'duplex', 'multifamily')
WALL_TONES = [  # first keyword found in the design's exterior.walls wins
    ('tilt', (0.80, 0.80, 0.77)), ('concrete', (0.80, 0.80, 0.77)), ('metal panel', (0.47, 0.50, 0.52)),
    ('stucco', (0.87, 0.83, 0.73)), ('eifs', (0.87, 0.83, 0.73)), ('split-face', (0.72, 0.68, 0.62)), ('cmu', (0.72, 0.68, 0.62)),
    ('stone', (0.76, 0.70, 0.60)), ('tan brick', (0.77, 0.64, 0.48)), ('buff', (0.77, 0.64, 0.48)), ('brick', (0.60, 0.35, 0.27)),
    ('fiber-cement', (0.84, 0.82, 0.76)), ('siding', (0.84, 0.82, 0.76)), ('wood', (0.55, 0.40, 0.28))]
USE_WALL = {'retail': (0.80, 0.72, 0.60), 'restaurant': (0.66, 0.42, 0.32), 'office': (0.70, 0.66, 0.60), 'medical': (0.82, 0.78, 0.70),
            'industrial': (0.80, 0.80, 0.77), 'storage': (0.84, 0.82, 0.76), 'multifamily': (0.84, 0.80, 0.72), 'sfr': (0.70, 0.48, 0.38),
            'townhomes': (0.74, 0.55, 0.42), 'duplex': (0.82, 0.78, 0.70), 'fuel': (0.80, 0.76, 0.68)}
GLASS = (0.15, 0.21, 0.26)
STOREFRONT_DOOR = (0.09, 0.12, 0.15)
OVERHEAD = (0.83, 0.83, 0.81)
DOOR = (0.32, 0.30, 0.28)
COPING = (0.86, 0.85, 0.82)
MEMBRANE = (0.90, 0.90, 0.88)
SHINGLE = (0.36, 0.34, 0.33)
METAL_ROOF = (0.56, 0.58, 0.59)
CANOPY = (0.30, 0.31, 0.33)
TREE = (0.24, 0.38, 0.17)
TRUNK = (0.33, 0.26, 0.19)
C_FIELD = (0.55, 0.60, 0.42)
C_LAWN = (0.42, 0.57, 0.29)
C_ROW = (0.50, 0.58, 0.38)
C_ASPHALT = (0.31, 0.32, 0.33)
C_CONC = (0.80, 0.79, 0.75)
C_WATER = (0.23, 0.33, 0.35)
C_BANK = (0.48, 0.58, 0.34)
C_STRIPE = (0.95, 0.95, 0.92)
C_ADA = (0.20, 0.38, 0.72)
C_CURB = (0.74, 0.74, 0.71)


def wall_colour(t):
    ext = ((t.get('design') or {}).get('exterior') or {})
    w = (ext.get('walls') or '').lower()
    hits = [(w.find(k), -len(k), c) for k, c in WALL_TONES if k in w]  # the material named first in the text
    if hits:
        return min(hits)[2]
    return USE_WALL.get(t.get('use'), (0.80, 0.76, 0.68))


def ccw(P):
    a = sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
    return list(P) if a > 0 else list(P)[::-1]


def inset(P, d):
    """a counter-clockwise polygon moved in by d on every edge"""
    n = len(P)
    lines = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        L = G.dist(a, b) or 1
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


def band(pts, width):
    w = width / 2
    return G.offset_line(pts, w) + G.offset_line(pts, -w)[::-1]


def sun_vector(north_deg, azimuth=190.0, elevation=62.0):
    """unit vector toward the sun in the model frame. azimuth: degrees clockwise from true north (180 = due south);
    north_deg: where true north points on the reference, clockwise from +y"""
    nd = math.radians(north_deg)
    N = (math.sin(nd), math.cos(nd))
    E = (math.cos(nd), -math.sin(nd))
    a, e = math.radians(azimuth), math.radians(elevation)
    h = (N[0] * math.cos(a) + E[0] * math.sin(a), N[1] * math.cos(a) + E[1] * math.sin(a))
    return np.array([h[0] * math.cos(e), h[1] * math.cos(e), math.sin(e)])


class Scene:
    def __init__(self, p, sun_az=190.0, sun_el=62.0, trees=True):
        self.p = p
        s = p['site']
        self.s = s
        self.types = {t['id']: t for t in p.get('types', [])}
        self.boundary = ccw([tuple(q) for q in s['boundary']])
        self.sun = sun_vector(float(s.get('north_deg', 0)), sun_az, sun_el)
        self.faces = []      # dict(pts=[(x,y,z)], col=(r,g,b), obj=int)
        self.objects = {0: 'ground'}
        self.notes = []
        self.footprints = []  # (poly, height) for shadows and the tree rules
        self.buildings = []
        self.front_n, self.front_mid = self._front()
        for i, b in enumerate(s.get('buildings', [])):
            self._building(b, 1 + i)
        oid = 1000
        for dm in s.get('dumpsters', []):
            P = G.rect_poly(dm['x'], dm['y'], dm.get('w', 24), dm.get('d', 12), dm.get('rot', 0))
            self._prism(ccw(P), 0, 6, (0.66, 0.64, 0.60), oid, top=(0.55, 0.55, 0.54))
            self.objects[oid] = 'dumpster enclosure'
            oid += 1
        for sg in s.get('signs', []):
            P = G.rect_poly(sg['x'], sg['y'], 10, 2, sg.get('rot', 0))
            self._prism(ccw(P), 0, 7, (0.70, 0.66, 0.58), oid)
            self.objects[oid] = 'monument sign'
            oid += 1
        self.trees = self._tree_points() if trees else []
        for k, (x, y, r) in enumerate(self.trees):
            self._tree(x, y, r, 5000 + k)
        self._ground()

    # ---------- the street side ----------
    def _front(self):
        B, n = self.boundary, len(self.boundary)
        e = (self.s.get('edges') or {}).get('front')
        if e:
            i = e[0]
        else:
            best = None
            for i_ in range(n):
                a, b = B[i_], B[(i_ + 1) % n]
                m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                d = min([G.nearest_on_line(m, st['pts'])[1] for st in self.s.get('streets', [])] or [1e9])
                score = (d, -G.dist(a, b)) if d < 150 else (1e9, -G.dist(a, b))
                if best is None or score < best[0]:
                    best = (score, i_)
            i = best[1]
        a, b = B[i], B[(i + 1) % n]
        L = G.dist(a, b) or 1
        nrm = ((b[1] - a[1]) / L, -(b[0] - a[0]) / L)  # right of a->b = outside for a CCW ring
        self.front_len = L
        return np.array(nrm), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    # ---------- solids ----------
    def _quad(self, a, b, z0, z1, col, obj):
        self.faces.append(dict(pts=[(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], col=col, obj=obj))

    def _prism(self, P, z0, z1, col, obj, top=None):
        for i in range(len(P)):
            self._quad(P[i], P[(i + 1) % len(P)], z0, z1, col, obj)
        self.faces.append(dict(pts=[(q[0], q[1], z1) for q in P], col=top or col, obj=obj))

    def _building(self, b, obj):
        t = self.types.get(b.get('type')) or {}
        use = t.get('use', b.get('use', 'other'))
        des = t.get('design') or {}
        floors = int(b.get('floors') or t.get('floors', 1))
        fh = float(t.get('floor_h', 10 if use in RES_USES else 14))
        H = float(b.get('height_ft') or floors * fh)
        roof = des.get('roof') or {'type': 'hip' if use in RES_USES else 'flat', 'pitch': 6, 'ridge': 'along_front', 'overhang': 1.5}
        rect = not b.get('poly') and 'w' in b
        if rect:
            P = G.rect_poly(b['x'], b['y'], b['w'], b['d'], b.get('rot', 0))
        else:
            P = [tuple(q) for q in b['poly']]
        P = ccw(P)
        name = b.get('name') or ('Type ' + str(b.get('type', '')))
        self.objects[obj] = name
        wc = wall_colour(t)
        flat = roof.get('type', 'flat') == 'flat' or not rect
        if not flat and not rect:
            self.notes.append('%s: pitched roof drawn flat (not a rectangle).' % name)
        par = 3.0 if flat and use not in RES_USES else 0.0
        top = H + par
        for i in range(len(P)):
            self._quad(P[i], P[(i + 1) % len(P)], 0, top, wc, obj)
        info = dict(name=name, use=use, type=b.get('type'), floors=floors, height=round(top, 1), poly=P, obj=obj,
                    footprint=round(G.area(P)), facades='generic')
        if flat:
            self.faces.append(dict(pts=[(q[0], q[1], top) for q in P], col=COPING, obj=obj))
            if par:
                self.faces.append(dict(pts=[(q[0], q[1], top + 0.03) for q in inset(P, 1.2)], col=MEMBRANE, obj=obj))
                if rect:
                    self._rtus(b, top, obj)
            self.footprints.append((P, top))
        else:
            ridge_h = self._pitched(b, H, roof, wc, obj)
            self.footprints.append((P, ridge_h))
            info['height'] = round(ridge_h, 1)
        if rect:
            info['facades'] = self._openings(b, t, des, fh, obj, use)
        self.buildings.append(info)

    def _local(self, b, lx, ly, z):
        q = G.rotate((lx, ly), b.get('rot', 0))
        return (b['x'] + q[0], b['y'] + q[1], z)

    def _rtus(self, b, z, obj):
        n = max(1, min(12, int(b['w'] * b['d'] / 5000)))
        for k in range(n):
            lx = -b['w'] / 2 + (k + 0.5) * b['w'] / n
            P = [self._local(b, lx + dx, dy, 0)[:2] for dx, dy in ((-4, -3), (4, -3), (4, 3), (-4, 3))]
            self._prism(ccw(P), z, z + 4, (0.72, 0.72, 0.70), obj)

    def _pitched(self, b, H, roof, wc, obj):
        w, d = b['w'], b['d']
        o = float(roof.get('overhang', 1.5))
        pitch = float(roof.get('pitch', 6)) / 12
        along = roof.get('ridge', 'along_front') != 'front_to_back'
        kind = roof.get('type', 'hip')
        col = METAL_ROOF if 'metal' in (((self.types.get(b.get('type')) or {}).get('design') or {}).get('exterior') or {}).get('roofing', '').lower() else SHINGLE
        # in a frame where the ridge runs along X: half-length A, half-span S
        A, S = (w / 2, d / 2) if along else (d / 2, w / 2)
        rise = (S + o) * pitch

        def L(X, Y, z):  # ridge frame -> building local -> world
            lx, ly = (X, Y) if along else (Y, X)
            return self._local(b, lx, ly, z)

        Ao, So = A + o, S + o
        if kind == 'gable':
            for sgn in (-1, 1):
                self.faces.append(dict(pts=[L(-Ao, sgn * So, H), L(Ao, sgn * So, H), L(Ao, 0, H + rise), L(-Ao, 0, H + rise)], col=col, obj=obj))
            r_wall = S * pitch + o * pitch
            for sx in (-1, 1):
                self.faces.append(dict(pts=[L(sx * A, -S, H), L(sx * A, S, H), L(sx * A, 0, H + r_wall)], col=wc, obj=obj))
        else:  # hip
            k = max(0.0, Ao - So)
            for sgn in (-1, 1):
                self.faces.append(dict(pts=[L(-Ao, sgn * So, H), L(Ao, sgn * So, H), L(k, 0, H + rise), L(-k, 0, H + rise)], col=col, obj=obj))
            for sx in (-1, 1):
                self.faces.append(dict(pts=[L(sx * Ao, -So, H), L(sx * Ao, So, H), L(sx * k, 0, H + rise)], col=col, obj=obj))
        return H + rise

    def _openings(self, b, t, des, fh, obj, use):
        """windows and exterior doors from the design, on the real facade; with no design, a generic pattern (said so)"""
        W, D = float(t.get('W') or b['w']), float(t.get('D') or b['d'])
        units = max(1, int(round(b['w'] / W))) if t.get('attached') else 1
        kx, ky = b['w'] / (W * units), b['d'] / D
        eps = 0.18
        tops = [9.5]

        def place(side, u0, u1, z0, z1, col, unit=0):
            u0, u1 = u0 + unit * W, u1 + unit * W
            if side in ('front', 'back'):
                ly = (-b['d'] / 2 - eps) if side == 'front' else (b['d'] / 2 + eps)
                a, c = (u0 * kx - b['w'] / 2, ly), (u1 * kx - b['w'] / 2, ly)
            else:
                lx = (-b['w'] / 2 - eps) if side == 'left' else (b['w'] / 2 + eps)
                a, c = (lx, u0 * ky - b['d'] / 2), (lx, u1 * ky - b['d'] / 2)
            pa, pc = self._local(b, a[0], a[1], 0), self._local(b, c[0], c[1], 0)
            self._quad(pa[:2], pc[:2], z0, z1, col, obj)
            if side == 'front' and z0 < fh:
                tops.append(z1)

        rooms = {r['id']: r for r in des.get('rooms', [])}
        if not rooms:
            if use in RES_USES:
                for side in ('front', 'back'):
                    n = max(2, int(b['w'] / 14))
                    for f in range(int(t.get('floors', 1))):
                        for k in range(n):
                            c = (k + 0.5) * W / n
                            place(side, c - 1.5, c + 1.5, f * fh + 3, f * fh + 8, GLASS)
            else:
                n = max(1, int(b['w'] / 30))
                for k in range(n):
                    c = (k + 0.5) * W / n
                    place('front', c - 10, c + 10, 0.5, 9.5, GLASS)
            self.notes.append('%s: no design in the model, so a generic facade pattern was drawn.' % (b.get('name') or 'building'))
            return 'generic'
        ext = des.get('exterior') or {}
        canopy = any(k in ((ext.get('accent') or '') + ' ' + (ext.get('walls') or '')).lower() for k in ('canop', 'awning'))
        ol = [tuple(q) for q in t['fp']] if t.get('fp') else [(0, 0), (W, 0), (W, D), (0, D)]

        def ext_span(r, side):
            """fs-set-plans' exterior_span: the longest run of the room's side that is an outside wall"""
            if t.get('attached') and side in ('left', 'right'):
                return None
            ox, oy = {'front': (0, -1), 'back': (0, 1), 'left': (-1, 0), 'right': (1, 0)}[side]
            horiz = side in ('front', 'back')
            if horiz:
                a0, a1, fixed = r['x'], r['x'] + r['w'], (r['y'] if side == 'front' else r['y'] + r['d'])
            else:
                a0, a1, fixed = r['y'], r['y'] + r['d'], (r['x'] if side == 'left' else r['x'] + r['w'])
            runs, cur, q = [], None, a0 + 0.25
            while q < a1:
                pt = (q + ox * 0.4, fixed + oy * 0.4) if horiz else (fixed + ox * 0.4, q + oy * 0.4)
                pi = (q - ox * 0.4, fixed - oy * 0.4) if horiz else (fixed - ox * 0.4, q - oy * 0.4)
                if (not G.inside(pt, ol)) and G.inside(pi, ol):
                    cur = [q - 0.25, q + 0.25] if cur is None else [cur[0], q + 0.25]
                elif cur:
                    runs.append(cur)
                    cur = None
                q += 0.5
            if cur:
                runs.append(cur)
            if not runs:
                return None
            best = max(runs, key=lambda x: x[1] - x[0])
            return (max(a0, best[0]), min(a1, best[1]))

        res = use in RES_USES

        def door_span(dr):
            """(side, centre, width) of an outside door: centred on the room's outside-wall run (door_geometry)"""
            r = rooms.get(dr['a'])
            if not r:
                return None
            wd = float(dr.get('width') or 3)
            sides = [dr['side']] if dr.get('side') in ('front', 'back', 'left', 'right') else ['front', 'back', 'left', 'right']
            for side in sides:
                sp = ext_span(r, side)
                if sp and sp[1] - sp[0] >= wd + 0.5:
                    return side, (sp[0] + sp[1]) / 2, wd
            return None

        def window_spots(r, wdw):
            """window_positions in fs-set-plans: clear of the room's outside doors on that wall by 1 ft, shared out over
            the free stretches by length, evenly within each"""
            side = wdw.get('side', 'front')
            sp = ext_span(r, side)
            if not sp:
                return []
            w = float(wdw.get('width', 3))
            free = [list(sp)]
            for dr in des.get('doors', []):
                if dr.get('b') != 'outside' or dr.get('a') != r['id']:
                    continue
                g = door_span(dr)
                if not g or g[0] != side:
                    continue
                lo, hi = g[1] - g[2] / 2 - 1, g[1] + g[2] / 2 + 1
                nxt = []
                for a_, b_ in free:
                    if hi <= a_ or lo >= b_:
                        nxt.append([a_, b_])
                        continue
                    if lo - a_ >= w + 1:
                        nxt.append([a_, lo])
                    if b_ - hi >= w + 1:
                        nxt.append([hi, b_])
                free = nxt
            free = [f_ for f_ in free if f_[1] - f_[0] >= w + 1]
            if not free:
                return []
            cap = [int((b_ - a_) // (w + 1)) for a_, b_ in free]
            n = max(1, min(max(1, int(wdw.get('count', 1))), sum(cap)))
            share = [0] * len(free)
            for _ in range(n):
                i = max((j for j in range(len(free)) if share[j] < cap[j]), key=lambda j: (free[j][1] - free[j][0]) / (share[j] + 1))
                share[i] += 1
            out = []
            for (a_, b_), k_ in zip(free, share):
                out += [a_ + (b_ - a_) * (i + 1) / (k_ + 1) for i in range(k_)]
            return out

        for unit in range(units):
            for wdw in des.get('windows', []):  # placed exactly as the elevation sheets draw them (window_positions)
                r = rooms.get(wdw.get('room'))
                if not r:
                    continue
                side = wdw.get('side', 'front')
                ww, hh = float(wdw.get('width', 3)), float(wdw.get('height', 4))
                base = (int(r.get('floor', 1)) - 1) * fh
                sill = 1.0 if hh >= 7 and not res else 3.0  # storefront glass sits on a 1 ft curb
                hh = min(hh, fh - sill - 0.5)
                for c in window_spots(r, wdw):
                    place(side, c - ww / 2, c + ww / 2, base + sill, base + sill + hh, GLASS, unit)
            for dr in des.get('doors', []):  # door_geometry: centred on the room's outside-wall run
                if dr.get('b') != 'outside':
                    continue
                g = door_span(dr)
                if not g:
                    continue
                side, c, wd = g
                kind = dr.get('kind', 'swing')
                if kind == 'opening':
                    continue
                h = 8.0 if kind == 'overhead' else (7.0 if res else 8.0)
                if kind == 'overhead' and wd >= 10 and not res:
                    h = 12.0
                col = OVERHEAD if kind == 'overhead' else (DOOR if res else STOREFRONT_DOOR)
                place(side, c - wd / 2, c + wd / 2, 0.05, h, col, unit)
        if canopy and use not in RES_USES:
            z = max(tops) + 1.0  # just above the tallest ground-floor opening on the front
            P = [self._local(b, lx, ly, 0)[:2] for lx, ly in ((-b['w'] / 2, -b['d'] / 2 - 6), (b['w'] / 2, -b['d'] / 2 - 6), (b['w'] / 2, -b['d'] / 2), (-b['w'] / 2, -b['d'] / 2))]
            self._prism(ccw(P), z, z + 1.2, CANOPY, obj)
        return 'from the design'

    # ---------- trees ----------
    def _blocked(self, x, y, pad=6):
        for P, _ in self.footprints:
            if G.poly_dist((x, y), P) < pad + 4:
                return True
        s = self.s
        for pv in s.get('paving', []):
            if G.inside((x, y), pv['poly']):
                return True
        for d in s.get('drives', []):
            if G.nearest_on_line((x, y), d['pts'])[1] < d.get('width', 24) / 2 + 4:
                return True
        for pd in s.get('ponds', []):
            if G.poly_dist((x, y), pd['poly']) < 10:
                return True
        for r in s.get('parking_rows', []):
            if G.nearest_on_seg((x, y), r['a'], r['b'])[0] and G.dist((x, y), G.nearest_on_seg((x, y), r['a'], r['b'])[0]) < r.get('stall_d', 18) + 3:
                return True
        return not G.inside((x, y), self.boundary)

    def _tree_points(self):
        pts = []
        h = lambda x, y: (math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
        for o in self.s.get('open_space', []):
            P = o['poly']
            x0, y0, x1, y1 = G.bbox(P)
            gx = x0 + 16
            while gx < x1 - 8:
                gy = y0 + 16
                while gy < y1 - 8:
                    if G.inside((gx, gy), P) and G.poly_dist((gx, gy), P) > 7 and not self._blocked(gx, gy, 0):
                        pts.append((gx, gy, 9 + 4 * h(gx, gy)))
                    gy += 34
                gx += 34
        # a row along the street side, inside the property line
        B, n = self.boundary, len(self.boundary)
        buf = float((self.s.get('buffers') or {}).get('front', 10)) / 2 + 3
        for i in range(n):
            a, b = B[i], B[(i + 1) % n]
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if G.dist(np.array(m), np.array(self.front_mid)) > 1 and not self._street_edge(a, b):
                continue
            L = G.dist(a, b)
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            nx, ny = -uy, ux
            s_ = 20.0
            while s_ < L - 20:
                x, y = a[0] + ux * s_ + nx * buf, a[1] + uy * s_ + ny * buf
                if not self._blocked(x, y, 2):
                    pts.append((x, y, 10 + 3 * h(x, y)))
                s_ += 42
        return pts

    def _street_edge(self, a, b):
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        return any(G.nearest_on_line(m, st['pts'])[1] < 120 for st in self.s.get('streets', []))

    def _tree(self, x, y, r, obj):
        self.objects[obj] = 'tree'
        P = [(x - 0.7, y - 0.7), (x + 0.7, y - 0.7), (x + 0.7, y + 0.7), (x - 0.7, y + 0.7)]
        for i in range(4):
            self._quad(P[i], P[(i + 1) % 4], 0, 8, TRUNK, obj)
        cz = 8 + r * 0.85
        t = (1 + 5 ** 0.5) / 2
        V = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
        F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
             (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
        k = r / math.sqrt(1 + t * t)
        for f in F:
            pts = [(x + V[i][0] * k, y + V[i][1] * k, cz + V[i][2] * k * 0.8) for i in f]
            self.faces.append(dict(pts=pts, col=TREE, obj=obj))
        self.footprints.append(([(x - r, y - r), (x + r, y - r), (x + r, y + r), (x - r, y + r)], -(cz + r * 0.8)))  # negative: a tree

    # ---------- the ground ----------
    def _ground(self):
        s = self.s
        pts = list(self.boundary)
        for st in s.get('streets', []):
            pts += [q for q in st['pts'] if G.poly_dist(q, self.boundary) < 400]
        x0, y0, x1, y1 = G.bbox(pts)
        span = max(x1 - x0, y1 - y0)
        M = max(350.0, 0.8 * span)
        x0, y0, x1, y1 = x0 - M, y0 - M, x1 + M, y1 + M
        r = min(3.0, 5200.0 / max(x1 - x0, y1 - y0))
        Wt, Ht = int((x1 - x0) * r) + 1, int((y1 - y0) * r) + 1
        self.tex_box = (x0, y0, x1, y1, r)
        img = Image.new('RGB', (Wt, Ht), tuple(int(c * 255) for c in C_FIELD))
        dr = ImageDraw.Draw(img)

        def T(q):
            return ((q[0] - x0) * r, (y1 - q[1]) * r)

        def poly(P, col, outline=None, w=1):
            if len(P) >= 3:
                dr.polygon([T(q) for q in P], fill=tuple(int(c * 255) for c in col), outline=tuple(int(c * 255) for c in outline) if outline else None)
                if outline and w > 1:
                    dr.line([T(q) for q in list(P) + [P[0]]], fill=tuple(int(c * 255) for c in outline), width=w)

        def line(P, col, wft):
            dr.line([T(q) for q in P], fill=tuple(int(c * 255) for c in col), width=max(1, int(round(wft * r))))

        for st in s.get('streets', []):
            if st.get('row_width'):
                poly(band(st['pts'], st['row_width']), C_ROW)
            pw = float(st.get('pavement_width', 28))
            poly(band(st['pts'], pw), C_ASPHALT)
            for off in (pw / 2 - 1, -pw / 2 + 1):
                line(G.offset_line(st['pts'], off), C_STRIPE, 0.35)
            if pw >= 22:
                for off in (0.4, -0.4):
                    line(G.offset_line(st['pts'], off), (0.90, 0.75, 0.20), 0.35)
            if pw >= 44:
                for off in (pw / 4, -pw / 4):
                    for x, y, ux, uy in G.along(G.offset_line(st['pts'], off)[:2], 40):
                        line([(x - ux * 5, y - uy * 5), (x + ux * 5, y + uy * 5)], C_STRIPE, 0.35)
        poly(self.boundary, C_LAWN)
        for o in s.get('open_space', []):
            poly(o['poly'], (0.40, 0.56, 0.28))
        for l in s.get('lots', []):
            poly(l['poly'], (0.44, 0.59, 0.31), outline=(0.38, 0.50, 0.27))
        for pd in s.get('ponds', []):
            P = ccw([tuple(q) for q in pd['poly']])
            poly(P, C_BANK)
            wet = inset(P, float(pd.get('side_slope', 4)) * (float(pd.get('freeboard_ft', 1)) + 1.0))
            poly(wet, C_WATER)
        for pv in s.get('paving', []):
            poly(pv['poly'], C_CONC if pv.get('kind') == 'walk' else C_ASPHALT, outline=C_CURB, w=max(1, int(0.6 * r)))
        for d in s.get('drives', []):
            poly(band(d['pts'], d.get('width', 24)), C_ASPHALT)
        for row in s.get('parking_rows', []):
            self._stripes(row, poly, line)
        # walks round every building
        for P, h in self.footprints:
            if h > 0:
                poly(inset(P, -5), C_CONC)
        # midday shadows
        mask = Image.new('L', (Wt, Ht), 0)
        md = ImageDraw.Draw(mask)
        sx, sy, sz = self.sun
        for P, h in self.footprints:
            tree = h < 0
            h = abs(h)
            off = (-sx / sz * h, -sy / sz * h)
            if tree:
                c = G.centroid(P)
                rr = (P[1][0] - P[0][0]) / 2 * 0.9
                cx, cy = c[0] + off[0] * 0.85, c[1] + off[1] * 0.85
                md.ellipse([T((cx - rr, cy + rr)), T((cx + rr, cy - rr))], fill=150)
            else:
                hull = convex_hull(list(P) + [(q[0] + off[0], q[1] + off[1]) for q in P])
                md.polygon([T(q) for q in hull], fill=150)
        a = np.asarray(img).astype(np.float32) / 255.0
        m = np.asarray(mask).astype(np.float32)[..., None] / 255.0
        rng = np.random.default_rng(7)
        a = a * (1 + rng.normal(0, 0.025, a.shape[:2])[..., None])
        a = a * (1 - 0.55 * m)
        self.tex = np.clip(a, 0, 1)

    def _stripes(self, row, poly, line):
        a, b = tuple(row['a']), tuple(row['b'])
        L = G.dist(a, b) or 1
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        sgn = 1 if row.get('side', 'left') == 'left' else -1
        nx, ny = -uy * sgn, ux * sgn
        w, d = float(row.get('stall_w', 9)), float(row.get('stall_d', 18))
        ada, van = int(row.get('ada', 0)), int(row.get('van', 0))
        s_, k = 0.0, 0
        P = lambda s0, dd: (a[0] + ux * s0 + nx * dd, a[1] + uy * s0 + ny * dd)
        while True:
            sw = (16 if k < van else 13) if k < ada else w
            if s_ + sw > L + 0.01:
                break
            if k < ada:
                poly([P(s_, 0), P(s_ + 8, 0), P(s_ + 8, d), P(s_, d)], C_ADA)
            line([P(s_, 0), P(s_, d)], C_STRIPE, 0.35)
            s_ += sw
            k += 1
        line([P(s_, 0), P(s_, d)], C_STRIPE, 0.35)

    # ---------- for the cameras ----------
    def extent_points(self):
        pts = [(q[0], q[1], 0.0) for q in self.boundary]
        for P, h in self.footprints:
            if h > 0:
                pts += [(q[0], q[1], h) for q in P]
        return np.array(pts)

    def main_building(self):
        if not self.buildings:
            return None
        return max(self.buildings, key=lambda b: b['footprint'] * b['floors'])

    def report(self):
        lines = ['Scene: %d buildings, %d trees (placed by rule), sun %s.' % (len(self.buildings), len(self.trees), 'midday')]
        for b in self.buildings:
            lines.append('  %s (type %s, %s): %s sf footprint, %d floor(s), %.0f ft to the top, facades %s' % (
                b['name'], b['type'], b['use'], '{:,}'.format(b['footprint']), b['floors'], b['height'], b['facades']))
        return '\n'.join(lines + ['  NOTE: ' + n for n in self.notes])


def convex_hull(P):
    P = sorted(set((round(x, 3), round(y, 3)) for x, y in P))
    if len(P) < 3:
        return P

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]
