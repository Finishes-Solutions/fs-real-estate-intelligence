"""The site model, worked out once per set so every sheet agrees: geometry in feet (x right, y up as on the reference
site plan), the turn that puts the street at the bottom, true north, metrics, and the shared schematic placements
(water main, hydrants, storm inlets, grading) that more than one sheet shows."""
import math
from . import geom as G

SQFT_ACRE = 43560.0


def building_poly(b):
    if b.get('poly'):
        return [tuple(p) for p in b['poly']]
    return G.rect_poly(b['x'], b['y'], b['w'], b['d'], b.get('rot', 0))


def stall_row(r):
    """a row of 90-degree stalls along a->b on its left or right side (the fs-site-plan hand-off format):
    accessible stalls first (8 ft + a 5 ft aisle, van 8 + 8 ft), then standard stalls"""
    a, b = tuple(r['a']), tuple(r['b'])
    L = G.dist(a, b) or 1
    ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    sgn = 1 if r.get('side', 'left') == 'left' else -1
    nx, ny = -uy * sgn, ux * sgn
    w, d = float(r.get('stall_w', 9)), float(r.get('stall_d', 18))
    ada, van = int(r.get('ada', 0)), int(r.get('van', 0))
    out, s = [], 0.0
    for k in range(ada):
        sw = 16 if k < van else 13
        if s + sw > L + 0.01:
            break
        out.append(('van' if k < van else 'ada', s, s + sw))
        s += sw
    while s + w <= L + 0.01:
        out.append(('std', s, s + w))
        s += w
    polys = []
    for kind, s0, s1 in out:
        p0 = (a[0] + ux * s0, a[1] + uy * s0)
        p1 = (a[0] + ux * s1, a[1] + uy * s1)
        polys.append((kind, [p0, p1, (p1[0] + nx * d, p1[1] + ny * d), (p0[0] + nx * d, p0[1] + ny * d)]))
    used = out[-1][2] if out else 0
    e1 = (a[0] + ux * used, a[1] + uy * used)
    rect = [a, e1, (e1[0] + nx * d, e1[1] + ny * d), (a[0] + nx * d, a[1] + ny * d)]
    return dict(r, a=a, b=b, u=(ux, uy), n=(nx, ny), w=w, d=d, stalls=polys, rect=rect, count=len(out),
                ada_count=sum(1 for k_, _ in polys if k_ != 'std'), van_count=sum(1 for k_, _ in polys if k_ == 'van'))


def drop_under_buildings(rows, bpolys):
    """a stall a building sits on can't be parked in (reference layouts sometimes overlap them): drop it, keep the
    count honest -> [(row name, stalls dropped)]"""
    out = []
    for r in rows:
        keep = []
        for kind, P in r['stalls']:
            cx, cy = sum(q[0] for q in P) / 4, sum(q[1] for q in P) / 4
            probe = [(cx, cy)] + [(q[0] + (cx - q[0]) * 0.1, q[1] + (cy - q[1]) * 0.1) for q in P]
            if any(G.inside(pt, bp) for bp in bpolys for pt in probe):
                continue
            keep.append((kind, P))
        if len(keep) < len(r['stalls']):
            out.append((r.get('name', 'row'), len(r['stalls']) - len(keep)))
            r['stalls'] = keep
            r['count'] = len(keep)
            r['ada_count'] = sum(1 for k_, _ in keep if k_ != 'std')
            r['van_count'] = sum(1 for k_, _ in keep if k_ == 'van')
    return out


class Site:
    def __init__(self, p, types):
        s = p['site']
        self.p = p
        self.s = s
        self.types = {t['id']: t for t in types}
        self.boundary = [tuple(q) for q in s['boundary']]
        self.rot = float(s.get('display_rotate_deg', 0))  # turns the drawing so the street is at the bottom
        self.north = float(s.get('north_deg', 0))  # true north on the reference, clockwise from up
        self.buildings = [dict(b, poly=building_poly(b)) for b in s.get('buildings', [])]
        self.paving = [dict(x, poly=[tuple(q) for q in x['poly']]) for x in s.get('paving', [])]
        self.drives = [dict(x, pts=[tuple(q) for q in x['pts']]) for x in s.get('drives', [])]
        self.ponds = [dict(x, poly=[tuple(q) for q in x['poly']]) for x in s.get('ponds', [])]
        self.lots = [dict(x, poly=[tuple(q) for q in x['poly']]) for x in s.get('lots', [])]
        self.easements = [dict(x, pts=[tuple(q) for q in (x.get('poly') or x.get('pts'))]) for x in s.get('easements', [])]
        self.streets = [dict(x, pts=[tuple(q) for q in x['pts']]) for x in s.get('streets', [])]
        self.open = [dict(x, poly=[tuple(q) for q in x['poly']]) for x in s.get('open_space', [])]
        self.rows = [stall_row(r) for r in s.get('parking_rows', [])]
        self.dropped_stalls = drop_under_buildings(self.rows, [b['poly'] for b in self.buildings])
        self.area_sf = G.area(self.boundary)
        self.acres = self.area_sf / SQFT_ACRE
        self._hyd = self._inl = None

    # ---------- display ----------
    def turn(self, pt):
        c = G.centroid(self.boundary)
        return G.rotate(pt, self.rot, c)

    def north_on_sheet(self):
        # rotating the drawing counter-clockwise by rot turns north clockwise by -rot
        return self.north - self.rot

    def extent(self, pad=60):
        pts = [self.turn(q) for q in self.boundary]
        for st in self.streets:
            pts += [self.turn(q) for q in st['pts']]
        x0, y0, x1, y1 = G.bbox([self.turn(q) for q in self.boundary])
        return x0 - pad, y0 - pad, x1 + pad, y1 + pad

    # ---------- metrics ----------
    def building_area(self):
        return sum(G.area(b['poly']) for b in self.buildings)

    def paved_area(self):
        return sum(G.area(x['poly']) for x in self.paving)

    def pond_area(self):
        return sum(G.area(x['poly']) for x in self.ponds)

    def impervious(self):
        lots_imp = sum(G.area(l['poly']) * 0.45 for l in self.lots)  # lots counted at 45 % impervious
        return self.building_area() + self.paved_area() + (lots_imp if self.lots else 0)

    def gfa(self):
        tot = 0
        for b in self.buildings:
            t = self.types.get(b.get('type'))
            floors = t['floors'] if t else b.get('floors', 1)
            tot += G.area(b['poly']) * floors
        return tot

    def land_use(self):
        A = self.area_sf
        rows = []
        for label, a in (('Buildings (footprint)', self.building_area()), ('Paving (drives, parking, walks)', self.paved_area()),
                         ('Detention', self.pond_area()), ('Lots', sum(G.area(l['poly']) for l in self.lots))):
            if a > 0:
                rows.append([label, '{:,.0f} sf'.format(a), '{:.1f}%'.format(100 * a / A)])
        op = A - sum(G.area(b['poly']) for b in self.buildings) - self.paved_area() - self.pond_area() - sum(G.area(l['poly']) for l in self.lots)
        rows.append(['Open space / landscape', '{:,.0f} sf'.format(max(0, op)), '{:.1f}%'.format(100 * max(0, op) / A)])
        return [['Site area', '{:,.0f} sf'.format(A), '{:.2f} ac'.format(self.acres)]] + rows

    def program(self):
        rows = []
        for t in self.types.values():
            n = sum(1 for b in self.buildings if b.get('type') == t['id'])
            if n == 0:
                n = t.get('count', 1)
            gsf = t['building_gsf'] * n
            rows.append(['Type %s — %s' % (t['id'], t['label']), '%d bldg · {:,.0f} sf'.format(gsf) % n, str(t['floors'])])
        return rows

    def stall_count(self):
        return sum(r['count'] for r in self.rows), sum(r['ada_count'] for r in self.rows), sum(r['van_count'] for r in self.rows)

    def parking(self):
        pk = dict(self.s.get('parking') or {})
        if self.rows:  # counted from the drawn rows, never typed in
            n, ada, van = self.stall_count()
            pk['provided'], pk['ada'] = n, '%d (%d van)' % (ada, van)
        rows = []
        if pk.get('required') is not None:
            rows.append(['Required', str(pk['required'])])
        if pk.get('provided') is not None:
            rows.append(['Provided', str(pk['provided'])])
        if pk.get('ada') is not None:
            rows.append(['Accessible (incl.)', str(pk['ada'])])
        if pk.get('basis'):
            rows.append(['Basis', pk['basis']])
        return rows

    # ---------- shared placements ----------
    def frontage(self):
        """the boundary edges along a street (within 100 ft of one), or the longest edge"""
        edges = []
        B = self.boundary
        for i in range(len(B)):
            a, b = B[i], B[(i + 1) % len(B)]
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if any(G.nearest_on_line(m, st['pts'])[1] < 100 for st in self.streets):
                edges.append((a, b))
        if not edges:
            i = max(range(len(B)), key=lambda k: G.dist(B[k], B[(k + 1) % len(B)]))
            edges = [(B[i], B[(i + 1) % len(B)])]
        return edges

    def entry(self):
        """where the site meets the street: the drive end nearest a frontage edge"""
        fr = self.frontage()
        best = None
        for d in self.drives:
            for e in (d['pts'][0], d['pts'][-1]):
                dd = min(G.dist(e, G.nearest_on_seg(e, a, b)[0]) for a, b in fr)
                if best is None or dd < best[1]:
                    best = (e, dd)
        if best:
            return best[0]
        a, b = fr[0]
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    def mains(self):
        """the water main: along every drive, offset 8 ft; with no drives, along the frontage inside the boundary"""
        if self.drives:
            return [G.offset_line(d['pts'], (d.get('width', 24) / 2 + 8)) for d in self.drives]
        a, b = self.frontage()[0]
        return [G.offset_line([a, b], 15)]

    def sewers(self):
        if self.drives:
            return [G.offset_line(d['pts'], -(d.get('width', 24) / 2 + 6)) for d in self.drives]
        a, b = self.frontage()[0]
        return [G.offset_line([a, b], 25)]

    def hydrants(self):
        """one within 100 ft of every sprinklered building's FDC, then every 400 ft along the main, then any building
        corner more than 400 ft (300 ft commercial) away gets one at the nearest main point"""
        if self._hyd is not None:
            return self._hyd
        H = []
        mains = self.mains()
        for m in mains:
            for x, y, _, _ in G.along(m, 400, start=20):
                H.append((x, y))
        for b in self.buildings:
            t = self.types.get(b.get('type')) or {}
            lim = 300 if t and t['use'] not in ('sfr', 'townhomes', 'duplex') else 400
            if t.get('sprinklered'):
                lim = 100
            for corner in b['poly']:
                if not H or min(G.dist(corner, h) for h in H) > lim:
                    q = min((G.nearest_on_line(corner, m) for m in mains), key=lambda r: r[1])[0]
                    if q:
                        H.append(q)
        self._hyd = H
        return H

    def ground(self, pt):
        """an assumed ground surface: 100.00 at the far corner, falling 0.6 % toward the pond (or the frontage)"""
        tgt = G.centroid(self.ponds[0]['poly']) if self.ponds else G.centroid([self.frontage()[0][0], self.frontage()[0][1]])
        far = max(G.dist(q, tgt) for q in self.boundary)
        base = float(self.s.get('datum', 100.0))
        return base - 0.006 * (far - G.dist(pt, tgt))

    def inlets(self):
        if self._inl is not None:
            return self._inl
        I = []
        for d in self.drives:
            for x, y, ux, uy in G.along(d['pts'], 275, start=60):
                I.append((x + -uy * d.get('width', 24) / 2, y + ux * d.get('width', 24) / 2))
        self._inl = I
        return I

    def pond_stages(self, pd):
        """stage-storage from the pond's own shape: the top of bank inset by side slope x height for each foot of
        depth below the freeboard -> [(stage ft above the bottom, area sf, cumulative storage cf)]"""
        z = float(pd.get('side_slope', 3))
        fb = float(pd.get('freeboard_ft', 1))
        depth = float(pd.get('depth_ft', 6))
        P = ccw([tuple(q) for q in pd['poly']])
        steps = max(1, int(math.ceil(depth)))
        out, vol, prev = [], 0.0, None
        for i in range(steps + 1):
            stage = min(depth, float(i))
            Q = inset_edges(P, [z * (fb + depth - stage)] * len(P))
            a = G.area(Q) if signed(Q) * signed(P) > 0 else 0.0  # an inset that turned inside out has no area
            if prev is not None:
                vol += (a + prev[1]) / 2 * (stage - prev[0])
            out.append((stage, a, vol))
            prev = (stage, a)
        return out

    def detention(self):
        """required: the greater of the guardrail (1.00 ac-ft per developed acre by default) and the project's own;
        provided: each pond's stage-storage volume up to the freeboard (side slopes from the model, 3:1 unless given),
        unless the pond states its volume"""
        dev_ac = float(self.s.get('developed_acres') or self.acres)
        rate = float(self.s.get('detention_rate_acft_per_ac', 1.0))
        req = dev_ac * rate
        prov = 0
        rows = []
        for i, pd in enumerate(self.ponds):
            v = pd.get('volume_acft')
            depth = pd.get('depth_ft', 6)
            if v is None:
                v = self.pond_stages(pd)[-1][2] / SQFT_ACRE
            prov += v
            rows.append([pd.get('name', 'Pond %d' % (i + 1)), '{:,.0f} sf'.format(G.area(pd['poly'])), '%s ft' % depth, '%.2f ac-ft' % v])
        return dict(dev_ac=dev_ac, rate=rate, req=req, prov=prov, rows=rows)


def signed(P):
    return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P))) / 2


def ccw(P):
    a = sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
    return list(P) if a > 0 else list(P)[::-1]


def inset_edges(P, dists):
    """a counter-clockwise polygon moved in by dists[i] on edge i"""
    n = len(P)
    lines = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        L = G.dist(a, b) or 1
        nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
        d = dists[i]
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


def edge_kinds(site):
    """'front' for boundary edges along a street, 'rear' for those facing away from the front, the rest 'side'
    -> (ccw boundary, kinds)"""
    B = ccw(site.boundary)
    fr = site.frontage()
    def is_front(a, b):
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        return any(G.dist(m, ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) < 1 for p, q in fr)
    kinds = ['front' if is_front(B[i], B[(i + 1) % len(B)]) else None for i in range(len(B))]
    fronts = [i for i, k in enumerate(kinds) if k]
    if fronts:
        a, b = B[fronts[0]], B[(fronts[0] + 1) % len(B)]
        fx, fy = b[0] - a[0], b[1] - a[1]
        fl = math.hypot(fx, fy) or 1
    for i in range(len(B)):
        if kinds[i]:
            continue
        a, b = B[i], B[(i + 1) % len(B)]
        ex, ey = b[0] - a[0], b[1] - a[1]
        el = math.hypot(ex, ey) or 1
        kinds[i] = 'rear' if fronts and (fx * ex + fy * ey) / (fl * el) < -0.7 else 'side'
    return B, kinds


def envelope(site):
    """the building setback line, from site.setbacks by edge kind (None without setbacks)"""
    sb = site.s.get('setbacks') or {}
    if not sb:
        return None
    B, kinds = edge_kinds(site)
    return inset_edges(B, [float(sb.get(k_, sb.get('side', 0))) for k_ in kinds])
