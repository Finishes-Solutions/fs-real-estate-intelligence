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

    def parking(self):
        pk = self.s.get('parking') or {}
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

    def detention(self):
        """required: the greater of the guardrail (1.00 ac-ft per developed acre by default) and the project's own;
        provided: each pond's area x its depth x 0.75 for 3:1 side slopes, unless the pond states its volume"""
        dev_ac = float(self.s.get('developed_acres') or self.acres)
        rate = float(self.s.get('detention_rate_acft_per_ac', 1.0))
        req = dev_ac * rate
        prov = 0
        rows = []
        for i, pd in enumerate(self.ponds):
            v = pd.get('volume_acft')
            depth = pd.get('depth_ft', 6)
            if v is None:
                v = G.area(pd['poly']) * depth * 0.75 / SQFT_ACRE
            prov += v
            rows.append([pd.get('name', 'Pond %d' % (i + 1)), '{:,.0f} sf'.format(G.area(pd['poly'])), '%s ft' % depth, '%.2f ac-ft' % v])
        return dict(dev_ac=dev_ac, rate=rate, req=req, prov=prov, rows=rows)
