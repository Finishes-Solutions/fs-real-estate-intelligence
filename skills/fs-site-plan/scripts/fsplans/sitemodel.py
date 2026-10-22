"""The site layout model, worked out once so the sheet, the checks and the hand-off file agree.

Geometry is in feet, x right and y up, in the reference's own frame (the same frame fs-set-plans uses). Everything the
sheet reports is measured here from the geometry: nothing is typed in twice. No third-party dependencies."""
import math
from . import geom as G

SQFT_ACRE = 43560.0
RES = ('sfr', 'townhomes', 'duplex', 'multifamily')
PROHIBITED = ('permit ready', 'permit-ready', 'construction ready', 'construction-ready', 'code compliant', 'code-compliant',
              'approved', 'engineered', 'guaranteed', 'capacity confirmed')


def building_poly(b):
    if b.get('poly'):
        return [tuple(p) for p in b['poly']]
    return G.rect_poly(b['x'], b['y'], b['w'], b['d'], b.get('rot', 0))


def signed_area(P):
    return sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P))) / 2


def ccw(P):
    return list(P) if signed_area(P) > 0 else list(P)[::-1]


def seg_dist(p, a, b):
    return G.dist(p, G.nearest_on_seg(p, a, b)[0])


def poly_seg_dist(P, a, b):
    """shortest distance between a polygon's outline and a segment (0 if they cross)"""
    d = min(seg_dist(q, a, b) for q in P)
    d = min(d, min(seg_dist(a, P[i], P[(i + 1) % len(P)]) for i in range(len(P))))
    d = min(d, min(seg_dist(b, P[i], P[(i + 1) % len(P)]) for i in range(len(P))))
    return d


def inset(P, dists):
    """P (counter-clockwise) moved inward by dists[i] on edge i; consecutive offset edges meet at their intersection"""
    n = len(P)
    lines = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        L = G.dist(a, b) or 1
        nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L  # left of a->b = inside for CCW
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


def band(pts, width):
    """a centreline widened to a polygon"""
    w = width / 2
    return G.offset_line(pts, w) + G.offset_line(pts, -w)[::-1]


def ada_required(total):
    """2010 ADA Standards 208.2 (accessible spaces for a parking facility of `total` spaces)"""
    if total <= 0:
        return 0
    for top, n in ((25, 1), (50, 2), (75, 3), (100, 4), (150, 5), (200, 6), (300, 7), (400, 8), (500, 9)):
        if total <= top:
            return n
    if total <= 1000:
        return math.ceil(total * 0.02)
    return 20 + math.ceil((total - 1000) / 100)


def frustum_volume(top_area, perim, depth, freeboard, slope):
    """storage below the freeboard of a pond whose top of bank has top_area / perim, with `slope`:1 side slopes.
    Inset area of a roughly rectangular shape: A - P t + 4 t^2."""
    def at(t):
        return max(0.0, top_area - perim * t + 4 * t * t)
    a1 = at(slope * freeboard)
    a2 = at(slope * (freeboard + depth))
    return depth * (a1 + a2 + math.sqrt(a1 * a2)) / 3


class Layout:
    def __init__(self, p):
        self.p = p
        s = p['site']
        self.s = s
        self.types = {t['id']: t for t in p.get('types', [])}
        self.boundary = ccw([tuple(q) for q in s['boundary']])
        self.rot = float(s.get('display_rotate_deg', 0))
        self.north = float(s.get('north_deg', 0))
        self.buildings = [dict(b, poly=building_poly(b)) for b in s.get('buildings', [])]
        self.paving = [dict(x, poly=[tuple(q) for q in x['poly']]) for x in s.get('paving', [])]
        self.drives = [dict(x, pts=[tuple(q) for q in x['pts']]) for x in s.get('drives', [])]
        self.ponds = [dict(x, poly=[tuple(q) for q in x['poly']]) for x in s.get('ponds', [])]
        self.lots = [dict(x, poly=[tuple(q) for q in x['poly']]) for x in s.get('lots', [])]
        self.open = [dict(x, poly=[tuple(q) for q in x['poly']]) for x in s.get('open_space', [])]
        self.streets = [dict(x, pts=[tuple(q) for q in x['pts']]) for x in s.get('streets', [])]
        self.easements = [dict(x, pts=[tuple(q) for q in (x.get('poly') or x.get('pts'))], closed=bool(x.get('poly'))) for x in s.get('easements', [])]
        self.rows = [self._row(r) for r in s.get('parking_rows', [])]
        self.area_sf = G.area(self.boundary)
        self.acres = self.area_sf / SQFT_ACRE
        self.edge_kind = self._classify_edges()
        self._raster = None

    # ---------- edges and setbacks ----------
    def _classify_edges(self):
        B, n = self.boundary, len(self.boundary)
        e = self.s.get('edges') or {}
        front = list(e.get('front') or [])
        street = list(e.get('street_side') or [])
        if not front:
            near = []
            for i in range(n):
                a, b = B[i], B[(i + 1) % n]
                m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                d = min([G.nearest_on_line(m, st['pts'])[1] for st in self.streets] or [1e9])
                if d < 150:
                    near.append(i)
            if near:
                front = [max(near, key=lambda i: G.dist(B[i], B[(i + 1) % n]))]
                street = street or [i for i in near if i not in front]
            else:
                front = [max(range(n), key=lambda i: G.dist(B[i], B[(i + 1) % n]))]
        kinds = []
        fa, fb = B[front[0]], B[(front[0] + 1) % n]
        fx, fy = fb[0] - fa[0], fb[1] - fa[1]
        fl = math.hypot(fx, fy) or 1
        for i in range(n):
            if i in front:
                kinds.append('front')
            elif i in street:
                kinds.append('street_side')
            else:
                a, b = B[i], B[(i + 1) % n]
                ex, ey = b[0] - a[0], b[1] - a[1]
                el = math.hypot(ex, ey) or 1
                kinds.append('rear' if (fx * ex + fy * ey) / (fl * el) < -0.7 else 'side')
        return kinds

    def setback_of(self, kind):
        sb = self.s.get('setbacks') or {}
        if kind == 'street_side':
            return float(sb.get('street_side', sb.get('front', 0)))
        return float(sb.get(kind, 0))

    def buffer_of(self, kind):
        bf = self.s.get('buffers') or {}
        if kind == 'street_side':
            return float(bf.get('street_side', bf.get('front', 0)))
        return float(bf.get(kind, 0))

    def envelope(self):
        return inset(self.boundary, [self.setback_of(k) for k in self.edge_kind])

    def buffer_line(self):
        d = [self.buffer_of(k) for k in self.edge_kind]
        return inset(self.boundary, d) if any(d) else None

    def min_setbacks(self):
        """smallest building distance to each kind of edge -> {kind: (distance, building name)}"""
        out = {}
        B, n = self.boundary, len(self.boundary)
        for b in self.buildings:
            for i in range(n):
                d = poly_seg_dist(b['poly'], B[i], B[(i + 1) % n])
                k = self.edge_kind[i]
                if k not in out or d < out[k][0]:
                    out[k] = (d, b.get('name', 'building'))
        return out

    # ---------- parking ----------
    def _row(self, r):
        a, b = tuple(r['a']), tuple(r['b'])
        L = G.dist(a, b) or 1
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        sgn = 1 if r.get('side', 'left') == 'left' else -1
        nx, ny = -uy * sgn, ux * sgn
        w, d = float(r.get('stall_w', 9)), float(r.get('stall_d', 18))
        ada, van = int(r.get('ada', 0)), int(r.get('van', 0))
        stalls, s = [], 0.0
        for k in range(ada):
            isvan = k < van
            sw = 16 if isvan else 13  # 8 ft stall + 8 ft (van) or 5 ft access aisle
            if s + sw > L + 0.01:
                break
            stalls.append(('van' if isvan else 'ada', s, s + sw))
            s += sw
        while s + w <= L + 0.01:
            stalls.append(('std', s, s + w))
            s += w
        polys = []
        for kind, s0, s1 in stalls:
            p0 = (a[0] + ux * s0, a[1] + uy * s0)
            p1 = (a[0] + ux * s1, a[1] + uy * s1)
            polys.append((kind, [p0, p1, (p1[0] + nx * d, p1[1] + ny * d), (p0[0] + nx * d, p0[1] + ny * d)]))
        used = stalls[-1][2] if stalls else 0
        e0, e1 = a, (a[0] + ux * used, a[1] + uy * used)
        rect = [e0, e1, (e1[0] + nx * d, e1[1] + ny * d), (e0[0] + nx * d, e0[1] + ny * d)]
        return dict(r, stalls=polys, rect=rect, count=len(stalls), ada_count=sum(1 for k, _ in polys if k != 'std'),
                    van_count=sum(1 for k, _ in polys if k == 'van'), a=a, b=b, n=(nx, ny), u=(ux, uy))

    def stalls_provided(self):
        extra = int((self.s.get('parking_extra') or {}).get('count', 0))  # stalls not drawn as rows (garages etc.)
        return sum(r['count'] for r in self.rows) + extra

    def ada_provided(self):
        return sum(r['ada_count'] for r in self.rows), sum(r['van_count'] for r in self.rows)

    def gfa_of(self, b):
        t = self.types.get(b.get('type')) or {}
        return G.area(b['poly']) * float(b.get('floors') or t.get('floors', 1))

    def units_of(self, b):
        t = self.types.get(b.get('type')) or {}
        if b.get('units') is not None:
            return int(b['units'])
        if t.get('use') in ('sfr',):
            return 1
        if t.get('use') in ('townhomes', 'duplex'):
            return int(t.get('units_per', 1))
        if t.get('use') == 'multifamily' and t.get('units_per_bldg'):
            return int(t['units_per_bldg'])
        return 0

    def parking_required(self):
        """per type: (label, count, required spaces, basis, class) from the type's `parking` ratio"""
        rows = []
        for t in self.types.values():
            pk = t.get('parking')
            bs = [b for b in self.buildings if b.get('type') == t['id']]
            if not pk or not bs:
                continue
            gfa = sum(self.gfa_of(b) for b in bs)
            units = sum(self.units_of(b) for b in bs)
            if pk.get('per_sf'):
                req = pk['spaces'] * gfa / pk['per_sf']
            elif pk.get('per_unit'):
                req = pk['spaces'] * units / pk['per_unit']
            else:
                req = float(pk.get('fixed', 0))
            req += float(pk.get('plus', 0))
            rows.append(dict(type=t['id'], label=t.get('label') or t['use'], gfa=gfa, units=units, req=math.ceil(req - 1e-9),
                             basis=pk.get('basis', ''), cls=pk.get('cls', 'UNVERIFIED')))
        return rows

    def parking_summary(self):
        req_rows = self.parking_required()
        code = sum(r['req'] for r in req_rows)
        g = self.p.get('guardrails') or {}
        factor = float(g.get('count_factor', 0.05 if g.get('on') else 0))
        target = math.ceil(code * (1 + factor) - 1e-9)
        prov = self.stalls_provided()
        ada_p, van_p = self.ada_provided()
        ada_r = ada_required(prov)
        return dict(rows=req_rows, code=code, factor=factor, target=target, provided=prov, ada_req=ada_r,
                    van_req=math.ceil(ada_r / 6) if ada_r else 0, ada_prov=ada_p, van_prov=van_p)

    # ---------- detention ----------
    def detention(self):
        dev = float(self.s.get('developed_acres') or self.acres)
        rate = float(self.s.get('detention_rate_acft_per_ac', 1.0))
        req = dev * rate
        rows, prov = [], 0.0
        for i, pd in enumerate(self.ponds):
            A = G.area(pd['poly'])
            P = G.length(pd['poly'], closed=True)
            depth = float(pd.get('depth_ft', 4))
            fb = float(pd.get('freeboard_ft', 1))
            z = float(pd.get('side_slope', 4))
            if pd.get('volume_acft') is not None:
                v, how = float(pd['volume_acft']), 'stated'
            else:
                v, how = frustum_volume(A, P, depth, fb, z) / SQFT_ACRE, '%g ft storage, %g ft freeboard, %g:1 slopes' % (depth, fb, z)
            prov += v
            rows.append(dict(name=pd.get('name', 'Pond %d' % (i + 1)), area=A, depth=depth, vol=v, how=how))
        return dict(dev_ac=dev, rate=rate, req=req, prov=prov, rows=rows,
                    cls=self.s.get('detention_cls', 'OWNER GUARDRAIL'), source=self.s.get('detention_source', ''))

    # ---------- fire access ----------
    def fire_lanes(self):
        return [d for d in self.drives if d.get('fire_lane')]

    def fire_reach(self):
        """the farthest any point of a building's outline is from a fire lane edge or a street (straight line: the code
        measures along the access route, so this is a lower bound)"""
        lines = []
        for d in self.fire_lanes():
            w = d.get('width', 26) / 2
            lines += [G.offset_line(d['pts'], w), G.offset_line(d['pts'], -w)]
        for st in self.streets:
            if st.get('fire_access', True):
                lines.append(st['pts'])
        if not lines:
            return None, None
        worst = (0, None)
        for b in self.buildings:
            P = b['poly']
            pts = []
            for i in range(len(P)):
                a, c = P[i], P[(i + 1) % len(P)]
                n = max(1, int(G.dist(a, c) // 10))
                pts += [(a[0] + (c[0] - a[0]) * k / n, a[1] + (c[1] - a[1]) * k / n) for k in range(n)]
            far = max(min(G.nearest_on_line(q, L)[1] for L in lines) for q in pts)
            if far > worst[0]:
                worst = (far, b.get('name', 'building'))
        return worst

    def max_height(self):
        best = (0, None)
        for b in self.buildings:
            t = self.types.get(b.get('type')) or {}
            h = float(b.get('height_ft') or t.get('height_ft') or float(t.get('floors', 1)) * float(t.get('floor_h', 14)))
            if h > best[0]:
                best = (h, b.get('name'))
        return best

    # ---------- land use, measured on a grid so nothing is counted twice ----------
    def raster(self):
        if self._raster is not None:
            return self._raster
        x0, y0, x1, y1 = G.bbox(self.boundary)
        cell = max(2.0, math.sqrt(self.area_sf / 70000.0))
        layers = []  # (category, poly), first match wins
        for b in self.buildings:
            layers.append(('building', b['poly']))
        for pd in self.ponds:
            layers.append(('detention', pd['poly']))
        for r in self.rows:
            layers.append(('paving', r['rect']))
        for pv in self.paving:
            layers.append(('paving' if pv.get('kind') != 'walk' else 'walk', pv['poly']))
        for d in self.drives:
            layers.append(('paving', band(d['pts'], d.get('width', 24))))
        for l in self.lots:
            layers.append(('lots', l['poly']))
        for o in self.open:
            layers.append(('open space', o['poly']))
        for e in self.easements:
            if e['closed']:
                layers.append(('easement', e['pts']))
        env = self.envelope()
        boxes = [(cat, P, G.bbox(P)) for cat, P in layers]
        counts = {}
        nx, ny = int((x1 - x0) / cell) + 1, int((y1 - y0) / cell) + 1
        for i in range(nx):
            x = x0 + (i + 0.5) * cell
            for j in range(ny):
                y = y0 + (j + 0.5) * cell
                if not G.inside((x, y), self.boundary):
                    continue
                cat = None
                for c_, P, bb in boxes:
                    if bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3] and G.inside((x, y), P):
                        cat = c_
                        break
                if cat is None:
                    cat = 'unassigned (buildable)' if G.inside((x, y), env) else 'setback / buffer landscape'
                counts[cat] = counts.get(cat, 0) + 1
        tot = sum(counts.values()) or 1
        self._raster = {k: v / tot * self.area_sf for k, v in counts.items()}
        return self._raster

    def land_use(self):
        r = self.raster()
        order = ['building', 'paving', 'walk', 'detention', 'lots', 'easement', 'open space', 'setback / buffer landscape', 'unassigned (buildable)']
        names = {'building': 'Building footprints', 'paving': 'Paving (drives, parking)', 'walk': 'Walks / plazas', 'detention': 'Detention',
                 'lots': 'Residential lots', 'easement': 'Easements (not built on)', 'open space': 'Open space / amenity',
                 'setback / buffer landscape': 'Setback & buffer landscape', 'unassigned (buildable)': 'Unassigned buildable land'}
        return [(names[k], r[k]) for k in order if r.get(k, 0) > 0.5]

    def impervious(self):
        r = self.raster()
        lot_imp = float(self.s.get('lot_impervious', 0.45))
        return r.get('building', 0) + r.get('paving', 0) + r.get('walk', 0) + r.get('lots', 0) * lot_imp

    def pervious(self):
        return self.area_sf - self.impervious() - self.raster().get('detention', 0)

    # ---------- totals ----------
    def footprint(self):
        return sum(G.area(b['poly']) for b in self.buildings)

    def gfa(self):
        return sum(self.gfa_of(b) for b in self.buildings)

    def units(self):
        """dwelling units: from the buildings, or one a lot when the homes on the lots aren't drawn"""
        n = sum(self.units_of(b) for b in self.buildings)
        if self.lots and not any((self.types.get(b.get('type')) or {}).get('use') == 'sfr' for b in self.buildings):
            n += len(self.lots)
        return n

    def leasable_sellable(self):
        tot = 0
        for b in self.buildings:
            t = self.types.get(b.get('type')) or {}
            eff = float(t.get('efficiency', 0.85 if t.get('use') == 'multifamily' else 1.0))
            tot += self.gfa_of(b) * eff
        return tot

    def measures(self):
        """the values the code table can compare against, by key"""
        A = self.area_sf
        sb = self.min_setbacks()
        pk = self.parking_summary()
        det = self.detention()
        reach = self.fire_reach()
        h = self.max_height()
        lanes = self.fire_lanes()
        m = {
            'coverage': (self.footprint() / A, '{:.1%}'.format(self.footprint() / A)),
            'far': (self.gfa() / A, '{:.2f}'.format(self.gfa() / A)),
            'impervious': (self.impervious() / A, '{:.1%}'.format(self.impervious() / A)),
            'pervious': (self.pervious() / A, '{:.1%}'.format(self.pervious() / A)),
            'height': (h[0], "%.0f ft (%s)" % h if h[1] else '—'),
            'parking': (pk['provided'], '%d spaces' % pk['provided']),
            'ada': (pk['ada_prov'], '%d (%d van)' % (pk['ada_prov'], pk['van_prov'])),
            'detention': (det['prov'], '%.2f ac-ft' % det['prov']),
            'density': (self.units() / self.acres if self.acres else 0, '%.1f units/ac' % (self.units() / self.acres if self.acres else 0)),
        }
        for k in ('front', 'side', 'rear', 'street_side'):
            if k in sb:
                m['setback_' + k] = (sb[k][0], "%.1f ft" % sb[k][0])
        if reach[1]:
            m['fire_reach'] = (reach[0], "%.0f ft (%s)" % reach)
        if lanes:
            w = min(float(d.get('width', 0)) for d in lanes)
            m['fire_lane_width'] = (w, "%g ft" % w)
        if self.lots:
            areas = [G.area(l['poly']) for l in self.lots]
            m['lot_area'] = (min(areas), '{:,.0f} sf min'.format(min(areas)))
        return m

    # ---------- checks ----------
    def checks(self):
        out = []

        def add(level, text):
            out.append((level, text))

        st = (self.s.get('stated') or {}).get('acres')
        if not st:
            add('fail', 'site.stated.acres is missing: get the total site acreage from the user (or a survey they confirm).')
        else:
            off = (self.acres - st) / st
            add('fail' if abs(off) > 0.02 else 'ok', 'Boundary %.3f ac vs stated %.2f ac (%+.1f%%; limit 2%%).' % (self.acres, st, 100 * off))
        if not self.buildings and not self.lots:
            add('fail', 'No buildings or lots: the layout is empty.')
        env = self.envelope()
        for b in self.buildings:
            nm = b.get('name', 'building')
            if not all(G.inside(q, self.boundary) for q in b['poly']):
                add('fail', '%s is outside the property line.' % nm)
            elif not b.get('setback_exempt') and not all(G.inside(q, env) or self._on_envelope(q, env) for q in b['poly']):
                add('fail', '%s crosses the building setback line.' % nm)
            t = self.types.get(b.get('type'))
            if b.get('type') and not t:
                add('fail', '%s names type %s, which is not in `types`.' % (nm, b.get('type')))
            elif t and t.get('W') and t.get('D') and not t.get('attached') and not b.get('poly'):
                ratio = (b.get('w', 0) * b.get('d', 0)) / (t['W'] * t['D'])
                if abs(ratio - 1) > 0.15:
                    add('warn', '%s is %.0f%% off its type %s footprint (fs-set-plans flags more than 15%%).' % (nm, 100 * (ratio - 1), t['id']))
            for e in self.easements:
                if e['closed'] and e.get('no_build', True) and any(G.inside(q, e['pts']) for q in b['poly']):
                    add('fail', '%s sits on the %s.' % (nm, e.get('label', 'easement')))
            fz = self.s.get('floodway_poly')
            if fz and any(G.inside(q, fz) for q in b['poly']):
                add('fail', '%s is in the regulatory floodway (prohibited).' % nm)
            fp = self.s.get('flood_zone_poly')
            if fp and any(G.inside(q, fp) for q in b['poly']):
                add('warn', '%s is in the mapped floodplain: finished floor above BFE, fill mitigation and the authority\'s floodplain rules apply.' % nm)
            for pd in self.ponds:
                if any(G.inside(q, pd['poly']) for q in b['poly']) or any(G.inside(q, b['poly']) for q in pd['poly']):
                    add('fail', '%s overlaps %s.' % (nm, pd.get('name', 'the pond')))
        for i, a in enumerate(self.buildings):
            for b in self.buildings[i + 1:]:
                if any(G.inside(q, b['poly']) for q in a['poly']) or any(G.inside(q, a['poly']) for q in b['poly']):
                    add('fail', '%s and %s overlap.' % (a.get('name'), b.get('name')))
        for r in self.rows:
            bad = [b.get('name') for b in self.buildings if any(G.inside(q, b['poly']) for _, P in r['stalls'] for q in [G.centroid(P)])]
            if bad:
                add('fail', 'Parking row %s runs under %s.' % (r.get('name', ''), ', '.join(sorted(set(bad)))))
            if not all(G.inside(q, self.boundary) for q in r['rect']):
                add('fail', 'Parking row %s leaves the property.' % r.get('name', ''))
        # the code table
        m = self.measures()
        for rule in (self.p.get('code') or {}).get('rules', []):
            key, lim = rule.get('measure'), rule.get('limit')
            if key and lim is not None:
                if key not in m:
                    add('warn', 'Code item "%s": nothing to measure for "%s".' % (rule.get('item'), key))
                    continue
                v = m[key][0]
                ok = v <= lim + 1e-9 if rule.get('kind') == 'max' else v >= lim - 1e-9
                add('ok' if ok else 'fail', '%s: %s vs %s %s (%s).' % (rule.get('item'), m[key][1], 'max' if rule.get('kind') == 'max' else 'min',
                                                                      rule.get('req'), rule.get('cls', 'UNVERIFIED')))
        pk = self.parking_summary()
        if pk['code']:
            add('ok' if pk['provided'] >= pk['target'] else ('warn' if pk['provided'] >= pk['code'] else 'fail'),
                'Parking %d provided vs %d required%s.' % (pk['provided'], pk['code'], (' (%d with the %d%% owner reserve)' % (pk['target'], round(pk['factor'] * 100))) if pk['factor'] else ''))
            extra = pk['provided'] - pk['target']
            if pk['target'] and extra > max(10, 0.15 * pk['target']):
                add('warn', 'Over-parked by %d stalls (about %.2f ac of paving): unless a tenant needs them, give the land to building or a pad.' % (extra, extra * 350 / SQFT_ACRE))
        if pk['provided']:
            add('ok' if pk['ada_prov'] >= pk['ada_req'] and pk['van_prov'] >= pk['van_req'] else 'fail',
                'Accessible stalls %d (%d van) vs %d (%d van) required (2010 ADA 208.2).' % (pk['ada_prov'], pk['van_prov'], pk['ada_req'], pk['van_req']))
        det = self.detention()
        if det['req'] > 0:
            add('ok' if det['prov'] >= det['req'] - 1e-6 else 'fail', 'Detention %.2f ac-ft provided vs %.2f ac-ft required (%.2f dev. ac x %.2f).' % (det['prov'], det['req'], det['dev_ac'], det['rate']))
            if det['prov'] > det['req'] * 1.2 and det['req'] > 0:
                add('warn', 'Detention %.0f%% over the requirement: shrink the pond and use the land, or say why (e.g. a drainage study pending).' % (100 * (det['prov'] / det['req'] - 1)))
        reach = self.fire_reach()
        lim = float((self.p.get('fire') or {}).get('hose_reach_ft', 150))
        if self.buildings and reach[1]:
            add('ok' if reach[0] <= lim else 'fail', 'Fire access: farthest building point %.0f ft from a fire lane or street (%s); limit %g ft (straight line, check the route).' % (reach[0], reach[1], lim))
        elif self.buildings and not self.lots:
            add('fail', 'No fire lane (drives with fire_lane: true) and no street to measure fire access from.')
        h = self.max_height()[0]
        for d in self.fire_lanes():
            need = 26 if h > 30 else 20
            if float(d.get('width', 0)) < need:
                add('fail', 'Fire lane %s is %g ft; %d ft needed%s (IFC 503 / App. D).' % (d.get('name', ''), d.get('width', 0), need, ' for buildings over 30 ft' if need == 26 else ''))
        if self.drives and not any(self._touches_frontage(d) for d in self.drives):
            add('fail', 'No drive reaches a street frontage: the site has no way in.')
        un = self.raster().get('unassigned (buildable)', 0)
        if un / self.area_sf > 0.05:
            add('warn', 'Unassigned buildable land: %.2f ac (%.0f%% of the site). Fill it, or label it open space / future pad and say why.' % (un / SQFT_ACRE, 100 * un / self.area_sf))
        # words the plan may not use
        blob = repr({k: self.p.get(k) for k in ('notes', 'hbu', 'facts', 'risks', 'code')}).lower()
        for w in PROHIBITED:
            if w in blob:
                add('fail', 'Text uses "%s": a concept layout may never claim that (guardrails).' % w)
        if not (self.p.get('hbu') or {}).get('candidates'):
            add('fail', 'No highest-and-best-use candidates: the use was not tested against alternatives.')
        for rule in (self.p.get('code') or {}).get('rules', []):
            if not rule.get('cls'):
                add('warn', 'Code item "%s" has no classification.' % rule.get('item'))
        # a warning may be accepted, never silently: the reason goes on the sheet
        acc = self.p.get('accepted_warnings') or []
        for i, (lv, t) in enumerate(out):
            for a in acc:
                if lv == 'warn' and a.get('check', '').lower() in t.lower() and a.get('why'):
                    out[i] = ('ok', t + ' ACCEPTED: ' + a['why'])
        return out

    def _on_envelope(self, q, env, tol=0.5):
        return G.nearest_on_line(q, env, closed=True)[1] < tol

    def _touches_frontage(self, d):
        B, n = self.boundary, len(self.boundary)
        fr = [i for i, k in enumerate(self.edge_kind) if k in ('front', 'street_side')]
        for e in (d['pts'][0], d['pts'][-1]):
            for i in fr:
                if seg_dist(e, B[i], B[(i + 1) % n]) < max(15, d.get('width', 24)):
                    return True
        return False
