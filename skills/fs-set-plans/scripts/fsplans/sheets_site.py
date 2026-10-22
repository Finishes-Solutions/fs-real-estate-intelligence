"""Site, civil, landscape and site-wide electrical / fire / telecom sheets. Every plan sheet is drawn from the one site
model (site.py): street at the bottom, true north from the reference, the site in grey with the sheet's own layer in
colour, and a right-hand column of legend, tables and numbered notes. Grades, pipes, hydrants, lights and conduit are
SCHEMATIC: placed by rules of thumb and labelled as assumptions for the engineer to replace."""
import math
from . import geom as G
from . import kit as K
from . import draft as DR
from . import details as DT
from . import site as SM
from .kit import F, FB

SIDE_W = 560  # the right-hand column, pt
USE_COL = {'sfr': (0.93, 0.80, 0.55), 'townhomes': (0.91, 0.72, 0.47), 'duplex': (0.92, 0.76, 0.5), 'retail': (0.85, 0.45, 0.42),
           'restaurant': (0.88, 0.55, 0.35), 'office': (0.55, 0.65, 0.85), 'medical': (0.55, 0.75, 0.85), 'industrial': (0.65, 0.62, 0.75),
           'fuel': (0.9, 0.6, 0.6), 'church': (0.75, 0.65, 0.85), 'multifamily': (0.9, 0.68, 0.45), 'storage': (0.7, 0.7, 0.7), 'amenity': (0.6, 0.8, 0.6)}


class View:
    """feet -> pt for the turned site, fitted at the largest engineering scale into the drawing area"""

    def __init__(self, site, x, y, w, h, pad=60, scale=None):
        self.site = site
        x0, y0, x1, y1 = site.extent(pad)
        self.scale = scale or K.eng_scale_for(x1 - x0, y1 - y0, w, h)
        self.k = 72.0 / self.scale
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        self.ox = x + w / 2 - cx * self.k
        self.oy = y + h / 2 - cy * self.k

    def P(self, pt):
        q = self.site.turn(pt)
        return (self.ox + q[0] * self.k, self.oy + q[1] * self.k)

    def Ps(self, pts):
        return [self.P(q) for q in pts]


def drive_band(d):
    w = d.get('width', 24) / 2
    L = G.offset_line(d['pts'], w)
    R = G.offset_line(d['pts'], -w)
    return L + R[::-1]


CURB = (0.35, 0.35, 0.36)
ADA_BLUE = (0.16, 0.35, 0.70)


def stall_lines(c, v, s, mode):
    """parking stripes, accessible stalls with their aisles and symbol, and each row's stall count"""
    for r in s.rows:
        for kind, P in r['stalls']:
            pp = v.Ps(P)
            if kind != 'std':
                sw = 8.0
                a0 = P[0]
                ux, uy = r['u']
                acc = [P[0], (a0[0] + ux * sw, a0[1] + uy * sw), (P[3][0] + ux * sw, P[3][1] + uy * sw), P[3]]
                K.draw_poly(c, v.Ps(acc), stroke=None, fill=(0.80, 0.86, 0.96) if mode != 'grey' else (0.9, 0.92, 0.96))
                aisle = [(a0[0] + ux * sw, a0[1] + uy * sw), P[1], P[2], (P[3][0] + ux * sw, P[3][1] + uy * sw)]
                c.saveState()
                DR.clip_poly(c, v.Ps(aisle))
                c.setStrokeColorRGB(*ADA_BLUE)
                c.setLineWidth(0.4)
                q = v.Ps(aisle)
                xs, ys = [p_[0] for p_ in q], [p_[1] for p_ in q]
                step = max(2.5, 1.5 * v.k)
                dd = -max(ys) + min(ys)
                xx = min(xs) - (max(ys) - min(ys))
                while xx < max(xs):
                    c.line(xx, min(ys), xx + (max(ys) - min(ys)), max(ys))
                    xx += step
                c.restoreState()
                cx, cy = v.P(((P[0][0] + P[3][0]) / 2 + ux * sw / 2, (P[0][1] + P[3][1]) / 2 + uy * sw / 2))
                if v.k * 6 > 10:
                    K.label(c, cx, cy, 'VAN' if kind == 'van' else 'ADA', max(4, min(6, v.k * 1.6)), FB, ADA_BLUE, halo=False)
            c.setStrokeColorRGB(*(K.INK if mode != 'grey' else K.GREY))
            c.setLineWidth(0.35)
            c.line(pp[0][0], pp[0][1], pp[3][0], pp[3][1])
            c.line(pp[1][0], pp[1][1], pp[2][0], pp[2][1])
        if r['count'] >= 4 and mode != 'grey':
            mid = r['stalls'][len(r['stalls']) // 2][1]
            x, y = v.P(G.centroid(mid))
            a, b = v.P(r['a']), v.P(r['b'])
            ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
            if ang > 90 or ang < -90:
                ang += 180
            K.label(c, x, y, '%d' % r['count'], max(5, min(7, v.k * 2)), FB, K.INK, angle=ang + 90 if abs(r['n'][0]) < 0.5 else ang)


def aisle_arrows(c, v, d, color):
    """two-way traffic arrows along a drive"""
    pts = d['pts']
    for x, y, ux, uy in G.along(pts, 60, start=25):
        for sgn, off in ((1, d.get('width', 24) / 4), (-1, -d.get('width', 24) / 4)):
            px, py = x + -uy * off, y + ux * off
            a, b = v.P((px - ux * 5 * sgn, py - uy * 5 * sgn)), v.P((px + ux * 5 * sgn, py + uy * 5 * sgn))
            c.setStrokeColorRGB(*color)
            c.setLineWidth(0.6)
            c.line(a[0], a[1], b[0], b[1])
            th = math.atan2(b[1] - a[1], b[0] - a[0])
            for da in (2.6, -2.6):
                c.line(b[0], b[1], b[0] + 3.5 * math.cos(th + da), b[1] + 3.5 * math.sin(th + da))


def base(c, v, mode='grey', label_buildings=True, envelope=True):
    """the site: streets, lots, paving with curbs, stalls, ponds, open space, buildings, easements, setback and
    property lines"""
    s = v.site
    grey = mode == 'grey'
    pave = (0.92, 0.92, 0.92) if grey else (0.84, 0.84, 0.84)
    c.saveState()
    for st in s.streets:
        pw = float(st.get('pavement_width', 28 if not st.get('row_width') or st['row_width'] < 80 else 48))
        if st.get('row_width'):
            for off in (st['row_width'] / 2, -st['row_width'] / 2):
                K.draw_poly(c, v.Ps(G.offset_line(st['pts'], off)), stroke=K.LIGHT, lw=0.6, close=False)
        K.draw_poly(c, v.Ps(G.offset_line(st['pts'], pw / 2)) + v.Ps(G.offset_line(st['pts'], -pw / 2))[::-1], stroke=None, fill=(0.9, 0.9, 0.9))
        for off in (pw / 2, -pw / 2):
            K.draw_poly(c, v.Ps(G.offset_line(st['pts'], off)), stroke=K.GREY, lw=0.8, close=False)
        K.draw_poly(c, v.Ps(st['pts']), stroke=K.LIGHT, lw=0.6, dash=(12, 4, 2, 4), close=False)
        mid = st['pts'][len(st['pts']) // 2] if len(st['pts']) > 2 else ((st['pts'][0][0] + st['pts'][-1][0]) / 2, (st['pts'][0][1] + st['pts'][-1][1]) / 2)
        if st.get('name'):
            x, y = v.P(mid)
            K.label(c, x, y - 4, st['name'].upper() + (' (%s\' ROW)' % st['row_width'] if st.get('row_width') else ''), 9, FB, K.GREY)
        st['_pw'] = pw
    for o in s.open:
        K.draw_poly(c, v.Ps(o['poly']), stroke=None, fill=(0.88, 0.94, 0.86) if not grey else (0.95, 0.96, 0.95))
    for l in s.lots:
        K.draw_poly(c, v.Ps(l['poly']), stroke=K.LIGHT, lw=0.4, fill=(0.97, 0.95, 0.9) if not grey else None)
    # paving: drives (out to the street pavement, the curb cut), parking areas, walks; curbs round the paving
    for d in s.drives:
        pts = list(d['pts'])
        for st in s.streets:  # carry the end nearest a street out to its pavement edge
            for idx in (0, -1):
                e = pts[idx]
                q, dist_, _ = G.nearest_on_line(e, st['pts'])
                edge = dist_ - st.get('_pw', 28) / 2
                if 0 < edge < 120:
                    ux, uy = (q[0] - e[0]) / (dist_ or 1), (q[1] - e[1]) / (dist_ or 1)
                    ext = (e[0] + ux * edge, e[1] + uy * edge)
                    pts = [ext] + pts if idx == 0 else pts + [ext]
        d['_pts'] = pts
        K.draw_poly(c, v.Ps(drive_band(dict(d, pts=pts))), stroke=None, fill=pave)
    for r in s.rows:
        K.draw_poly(c, v.Ps(r['rect']), stroke=None, fill=pave)
    for p in s.paving:
        walk = p.get('kind') == 'walk'
        K.draw_poly(c, v.Ps(p['poly']), stroke=None, fill=((0.95, 0.95, 0.93) if walk else pave) if not grey else (0.95, 0.95, 0.95) if walk else pave)
    for p in s.paving:
        K.draw_poly(c, v.Ps(p['poly']), stroke=CURB if not grey else K.LIGHT, lw=0.9 if not grey else 0.5)
    for d in s.drives:
        for off in (d.get('width', 24) / 2, -d.get('width', 24) / 2):
            K.draw_poly(c, v.Ps(G.offset_line(d['_pts'], off)), stroke=CURB if not grey else K.LIGHT, lw=0.9 if not grey else 0.5, close=False)
    stall_lines(c, v, s, mode)
    if not grey:
        for d in s.drives:
            aisle_arrows(c, v, d, K.GREY)
    for pd in s.ponds:
        K.draw_poly(c, v.Ps(pd['poly']), stroke=(0.4, 0.6, 0.8), lw=0.8, fill=(0.75, 0.87, 0.95) if not grey else (0.9, 0.94, 0.97))
        x, y = v.P(G.centroid(pd['poly']))
        K.label(c, x, y, (pd.get('name') or 'DETENTION').upper(), 7, FB, K.BLUE if not grey else K.GREY, halo=False)
    for b in s.buildings:
        t = s.types.get(b.get('type'))
        col = USE_COL.get(t['use'] if t else b.get('use', ''), (0.8, 0.8, 0.8))
        K.draw_poly(c, v.Ps(b['poly']), stroke=K.INK, lw=1.2 if not grey else 0.6, fill=col if not grey else (0.80, 0.80, 0.80))
    if label_buildings:
        for b in s.buildings:
            x, y = v.P(G.label_point(b['poly']))
            bw = G.bbox(v.Ps(b['poly']))
            if bw[2] - bw[0] > 22 and bw[3] - bw[1] > 10:
                big = bw[2] - bw[0] > 70
                K.label(c, x, y + (3 if big else 0), (b.get('name') or ('TYPE ' + b.get('type', ''))).upper(), 7.5 if big else 6, FB, halo=False)
                if big:
                    t = s.types.get(b.get('type'))
                    fl = (t or {}).get('floors', 1)
                    K.label(c, x, y - 7, '{:,.0f} SF · {} STORY'.format(G.area(b['poly']) * fl, fl), 6, F, halo=False)
    for e in s.easements:
        K.draw_poly(c, v.Ps(e['pts']), stroke=K.MAGENTA, lw=0.8, dash=(6, 3), close=bool(e.get('poly')))
        if e.get('label'):
            x, y = v.P(e['pts'][0])
            K.label(c, x + 4, y + 4, e['label'], 6.5, F, K.MAGENTA, center=False)
    if envelope:
        env = SM.envelope(s)
        if env:
            K.draw_poly(c, v.Ps(env), stroke=K.RED, lw=0.6, dash=(10, 3, 2, 3))
    K.draw_poly(c, v.Ps(s.boundary), stroke=K.INK, lw=2.0, dash=(18, 4, 3, 4))
    c.restoreState()


def frame_sheet(c, ctx, sh, draw, side, mode='grey', title=None, label_buildings=True):
    """the plan sheet layout: drawing on the left, the column on the right"""
    s = ctx.site
    ax, ay, aw, ah = K.AREA
    dw = aw - SIDE_W - 24
    v = View(s, ax, ay + 50, dw, ah - 50)
    sh['scale'] = '1" = %d\'-0"' % v.scale
    c.saveState()
    clip = c.beginPath()
    clip.rect(ax, ay + 40, dw, ah - 40)
    c.clipPath(clip, stroke=0, fill=0)
    base(c, v, mode, label_buildings)
    if draw:
        draw(c, v)
    c.restoreState()
    K.north_arrow(c, ax + 40, ay + ah - 40, s.north_on_sheet(), 62)
    K.view_title(c, ax, ay + 12, 1, title or sh['title'], sh['scale'] + ' on 24" × 36"', v.scale)
    x = ax + aw - SIDE_W
    y = ay + ah
    for blk in side:
        y = side_block(c, x, y, SIDE_W, blk, ay)
    return v


def side_block(c, x, y, w, blk, min_y):
    kind, title, payload = blk
    if y < min_y + 40:
        return y
    y = K.heading(c, x, y, w, title)
    if kind == 'legend':
        col = 0
        y0 = y
        half = (len(payload) + 1) // 2
        for i, (k, colr, txt) in enumerate(payload):
            if i == half:
                col, y = 1, y0
            y = K.legend_row(c, x + col * w / 2, y - 10, k, colr, txt) + 10
        y = min(y, y0 - half * 14) - 6
    elif kind == 'table':
        head, rows, cols, right = payload
        y = K.table(c, x, y, w, rows, head=head, cols=cols, right=right, min_y=min_y)
    elif kind == 'notes':
        y = K.numbered(c, x, y, w, payload, min_y=min_y)
    elif kind == 'text':
        y = K.text_block(c, x, y, w, payload, max_y=min_y)
    return y - 10


def disc_notes(ctx, key, defaults):
    d = (ctx.p.get('disc') or {}).get(key) or {}
    return d.get('notes') or defaults


def disc_criteria(ctx, key):
    d = (ctx.p.get('disc') or {}).get(key) or {}
    return [[r['item'], r['value']] for r in d.get('criteria') or []]


SCHEMATIC = 'Schematic: placed by rule of thumb from the conceptual site plan. The engineer of record designs, sizes and seals the work.'


# ---------- C-001 existing conditions ----------
def c_existing(c, ctx, sh):
    s = ctx.site
    B = s.boundary

    def draw(c, v):
        for i in range(len(B)):
            a, b = B[i], B[(i + 1) % len(B)]
            # bearings in true-north terms: rotate the reference so north is +y
            ta, tb = G.rotate(a, s.north), G.rotate(b, s.north)
            pa, pb = v.P(a), v.P(b)
            ang = math.degrees(math.atan2(pb[1] - pa[1], pb[0] - pa[0]))
            if ang > 90 or ang < -90:
                ang += 180
            mx, my = (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2
            K.label(c, mx, my + 5, '%s  %.2f\'' % (G.bearing(ta, tb), G.dist(a, b)), 6.5, F, K.INK, angle=ang)
            c.setFillColorRGB(*K.INK)
            c.circle(pa[0], pa[1], 2.5, stroke=0, fill=1)
        fz = s.s.get('flood_zone_poly')
        if fz:
            K.draw_poly(c, v.Ps(fz), stroke=K.BLUE, lw=1, dash=(3, 2), fill=None)

    rows = [['Site area', '{:,.0f} sf ({:.2f} ac)'.format(s.area_sf, s.acres)]]
    for k, lab in (('flood_zone', 'FEMA flood zone'), ('firm_panel', 'FIRM panel'), ('jurisdiction', 'Jurisdiction'), ('parcels', 'Parcel(s)'),
                   ('zoning', 'Zoning'), ('utilities', 'Utility providers'), ('boundary_source', 'Boundary source')):
        if s.s.get(k):
            rows.append([lab, str(s.s[k])])
    side = [('legend', 'Legend', [('dash', K.INK, 'Property line'), ('dash', K.MAGENTA, 'Easement'), ('dash', K.LIGHT, 'Street centerline / ROW'), ('dash', K.BLUE, 'Flood zone limit (approx.)')]),
            ('table', 'Site data', (None, rows, [1, 1.6], ())),
            ('notes', 'Notes', ['Boundary courses are computed from the reference plan geometry; they are not survey calls. A boundary and topographic survey by a Texas RPLS is required.',
                                'Easements, pipelines and rights-of-way shown are from the reference documents only; a title commitment and survey must confirm them.',
                                'Flood zone from the FEMA map noted; confirm with the current effective FIRM and any pending revisions.'] + list(s.s.get('existing_notes') or []))]
    frame_sheet(c, ctx, sh, draw, side)


# ---------- C-101 overall site plan ----------
def siteplan(c, ctx, sh):
    s = ctx.site
    used = sorted({(s.types[b['type']]['use'] if b.get('type') in s.types else b.get('use', 'other')) for b in s.buildings})
    leg = [('fill', USE_COL.get(u, (0.8, 0.8, 0.8)), (s.types and next((t['label'] for t in s.types.values() if t['use'] == u), u)).capitalize()) for u in used]
    leg += [('fill', (0.84, 0.84, 0.84), 'Paving (curb shown heavy)'), ('fill', (0.80, 0.86, 0.96), 'Accessible stall'), ('fill', (0.75, 0.87, 0.95), 'Detention'),
            ('fill', (0.88, 0.94, 0.86), 'Open space'), ('dash', K.RED, 'Building setback line'), ('dash', K.INK, 'Property line')]
    side = [('legend', 'Legend', leg),
            ('table', 'Site data & land use', (None, s.land_use(), [2, 1.2, 0.8], (1, 2))),
            ('table', 'Program', (['Building type', 'Count · area', 'Floors'], s.program(), [2, 1.4, 0.6], (1, 2)))]
    if s.parking():
        side.append(('table', 'Parking', (None, s.parking(), [1, 2], ())))
    side.append(('notes', 'Notes', ['Boundary from %s; a boundary and topographic survey is required before design.' % (s.s.get('boundary_source') or 'the reference documents'),
                                     'Building sizes, unit and stall counts are measured from this plan.'] + list(ctx.p.get('facts') or [])[:8]))
    frame_sheet(c, ctx, sh, None, side, mode='color')


# ---------- C-102 dimension & paving ----------
def c_dims(c, ctx, sh):
    s = ctx.site
    sb = s.s.get('setbacks') or {}
    B, kinds = SM.edge_kinds(s)
    rows = []

    def draw(c, v):
        n = len(B)
        # property line lengths, outside the line
        cen = v.P(G.centroid(B))
        for i in range(n):
            a, b = B[i], B[(i + 1) % n]
            pa, pb = v.P(a), v.P(b)
            mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
            out = 1 if (mid[0] - cen[0]) * -(pb[1] - pa[1]) + (mid[1] - cen[1]) * (pb[0] - pa[0]) > 0 else -1
            DR.dim(c, pa, pb, 16 * out, text='%s  (%s)' % (DR.ftin(G.dist(a, b)), kinds[i].upper()), size=6.5)
        # every building to each kind of property line, and its own edge lengths
        for bd in s.buildings:
            P = SM.ccw(bd['poly'])
            for kind in ('front', 'side', 'rear'):
                best = None
                for i in range(n):
                    if kinds[i] != kind:
                        continue
                    for q in P:
                        p_, d_, _ = G.nearest_on_line(q, [B[i], B[(i + 1) % n]])
                        if best is None or d_ < best[2]:
                            best = (q, p_, d_)
                if best:
                    req = float(sb.get(kind, 0) or 0)
                    ok = best[2] >= req - 0.05
                    DR.dim(c, v.P(best[0]), v.P(best[1]), 0, text=DR.ftin(best[2]), size=6.5, color=K.INK if ok else K.RED)
                    rows.append([bd.get('name') or bd.get('type'), kind.capitalize(), DR.ftin(best[2]), DR.ftin(req) if req else '—', 'OK' if ok else 'CHECK'])
            for i in range(len(P)):
                a, b = P[i], P[(i + 1) % len(P)]
                if G.dist(a, b) > 15:
                    DR.dim(c, v.P(a), v.P(b), -12, text=DR.ftin(G.dist(a, b)), size=6)
        # drive widths and the parking module
        for d in s.drives:
            x, y, ux, uy = (G.along(d['pts'], max(20, G.length(d['pts']) / 3), start=max(10, G.length(d['pts']) / 3)) or [(d['pts'][0][0], d['pts'][0][1], 1, 0)])[0]
            w = d.get('width', 24)
            a, b = (x + uy * w / 2, y - ux * w / 2), (x - uy * w / 2, y + ux * w / 2)
            DR.dim(c, v.P(a), v.P(b), 0, text="%s %s" % (DR.ftin(w), 'FIRE LANE' if d.get('fire_lane') else 'DRIVE'), size=6.5, color=K.RED if d.get('fire_lane') else K.INK)
        if s.rows:
            r = s.rows[0]
            P0 = r['stalls'][min(len(r['stalls']) - 1, max(0, r['ada_count']))][1]
            DR.dim(c, v.P(P0[0]), v.P(P0[3]), 10, text=DR.ftin(r['d']), size=6.2)
            DR.dim(c, v.P(P0[3]), v.P(P0[2]), 8, text=DR.ftin(r['w']), size=6.2)
        # the setback line's distances
        env = SM.envelope(s)
        if env:
            for i in range(n):
                a, b = B[i], B[(i + 1) % n]
                if G.dist(a, b) < 40:
                    continue
                m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                q = G.nearest_on_line(m, env, closed=True)[0]
                mm = ((m[0] * 0.7 + q[0] * 0.3), (m[1] * 0.7 + q[1] * 0.3))
                x_, y_ = v.P(((m[0] + q[0]) / 2 + (b[0] - a[0]) * 0.2, (m[1] + q[1]) / 2 + (b[1] - a[1]) * 0.2))
                K.label(c, x_, y_, '%s %s SETBACK' % (DR.ftin(float(sb.get(kinds[i], sb.get('side', 0)))), kinds[i].upper()), 5.8, F, K.RED)

    frame_sheet(c, ctx, sh, draw, [])
    x = K.AREA[0] + K.AREA[2] - SIDE_W
    y = K.AREA[1] + K.AREA[3]
    n_, ada, van = s.stall_count()
    blocks = [('legend', 'Legend', [('line', K.INK, 'Dimension (building to property line)'), ('dash', K.RED, 'Building setback line'), ('fill', (0.84, 0.84, 0.84), 'Paving (curb shown heavy)'),
                                    ('fill', (0.80, 0.86, 0.96), 'Accessible stall / striped aisle'), ('dash', K.INK, 'Property line')]),
              ('table', 'Setbacks: required and provided', (['Building', 'Line', 'Provided', 'Required', ''], rows[:30], [1.4, 0.7, 0.8, 0.8, 0.5], (2, 3)))]
    if s.rows:
        r0 = s.rows[0]
        blocks.append(('table', 'Parking geometry', (None, [['Stall', '%s × %s, 90°' % (DR.ftin(r0['w']), DR.ftin(r0['d']))], ['Drive aisle', DR.ftin(min((d.get('width', 24) for d in s.drives), default=24))],
                                                            ['Stalls drawn', str(n_)], ['Accessible (incl.)', '%d (%d van)' % (ada, van)]], [1.2, 1], (1,))))
    blocks.append(('notes', 'Notes', ['Dimensions are computed from the plan geometry; verify against the boundary survey before design.',
                                      'Fire lanes at least 20 ft clear (26 ft where a hydrant is on the lane or the building is over 30 ft tall, IFC D103 / D105).',
                                      'Accessible stalls 8 ft with a 5 ft striped aisle (van: 8 ft aisle), on the shortest route to an entrance (TAS 502, 208).'] + disc_notes(ctx, 'civil', [])[:4]))
    for blk in blocks:
        y = side_block(c, x, y, SIDE_W, blk, K.AREA[1])


# ---------- C-103 typical lots ----------
def c_lots(c, ctx, sh):
    s = ctx.site
    sb = s.s.get('setbacks') or {'front': 25, 'rear': 10, 'side': 5}
    ax, ay, aw, ah = K.AREA
    lots = sorted(s.lots, key=lambda l: G.area(l['poly']))
    picks = []
    seen = set()
    for l in lots:
        bb = G.bbox(l['poly'])
        key = (round(bb[2] - bb[0]), round(bb[3] - bb[1]))
        if key not in seen:
            seen.add(key)
            picks.append(l)
    picks = picks[:4]
    sh['scale'] = 'As noted'
    cw = (aw - SIDE_W - 24) / max(1, len(picks))
    for i, l in enumerate(picks):
        x0, y0, x1, y1 = G.bbox(l['poly'])
        W, D = x1 - x0, y1 - y0
        ft, lab = K.arch_scale_for(W + 30, D + 30, cw - 40, ah - 160)
        k = 72 / ft
        ox = ax + i * cw + (cw - W * k) / 2
        oy = ay + 120 + (ah - 200 - D * k) / 2
        P = lambda q: (ox + (q[0] - x0) * k, oy + (q[1] - y0) * k)
        K.draw_poly(c, [P(q) for q in l['poly']], stroke=K.INK, lw=1.4, dash=(10, 3, 2, 3))
        f, r, sd = sb.get('front', 25), sb.get('rear', 10), sb.get('side', 5)
        env = [(x0 + sd, y0 + f), (x1 - sd, y0 + f), (x1 - sd, y1 - r), (x0 + sd, y1 - r)]
        K.draw_poly(c, [P(q) for q in env], stroke=K.RED, lw=0.7, dash=(4, 3))
        for b in s.buildings:
            if G.inside(G.centroid(b['poly']), l['poly']):
                K.draw_poly(c, [P(q) for q in b['poly']], stroke=K.INK, lw=1, fill=(0.85, 0.85, 0.85))
                break
        K.label(c, P(((x0 + x1) / 2, y0))[0], P((0, y0))[1] - 14, '%d\' FRONTAGE' % round(W), 7, FB)
        K.label(c, P(((x0 + x1) / 2, y0 + f / 2))[0], P((0, y0 + f / 2))[1], '%d\' FRONT SETBACK' % f, 6, F, K.RED)
        K.view_title(c, ax + i * cw + 10, ay + 30, i + 1, 'Typical lot %d\' × %d\'' % (round(W), round(D)), lab, ft)
    side = [('legend', 'Legend', [('dash', K.INK, 'Lot line'), ('dash', K.RED, 'Building setback line'), ('fill', (0.85, 0.85, 0.85), 'House footprint')]),
            ('table', 'Lots', (None, [['Lots in plan', str(len(s.lots))], ['Smallest', '{:,.0f} sf'.format(G.area(lots[0]['poly']))], ['Largest', '{:,.0f} sf'.format(G.area(lots[-1]['poly']))]] + [[k.capitalize() + ' setback', '%s ft' % v] for k, v in sb.items()], [1, 1], (1,))),
            ('notes', 'Notes', ['Setbacks per the published baseline; verify the controlling plat notes and deed restrictions.', 'Driveways at least 5 ft from side lot lines; each lot drains to the street or a rear swale per the grading plan.'])]
    x = ax + aw - SIDE_W
    y = ay + ah
    for blk in side:
        y = side_block(c, x, y, SIDE_W, blk, ay)


# ---------- C-201 grading & drainage ----------
def c_grading(c, ctx, sh):
    s = ctx.site
    rows = []

    def draw(c, v):
        tgt = G.centroid(s.ponds[0]['poly']) if s.ponds else None
        for b in s.buildings:
            cen = G.centroid(b['poly'])
            g = max(s.ground(q) for q in b['poly'])
            ffe = max(g + 1.0, float(s.s.get('bfe', -999)) + 2.0)
            x, y = v.P(cen)
            K.label(c, x, y - 12, 'FFE %.2f' % ffe, 6, FB, K.BROWN)
            rows.append([b.get('name') or b.get('type'), '%.2f' % ffe])
        for q in s.boundary:
            x, y = v.P(q)
            K.label(c, x, y + 6, '%.2f' % s.ground(q), 6, F, K.BROWN)
        # flow arrows on a grid
        x0, y0, x1, y1 = G.bbox(s.boundary)
        step = max(60, (x1 - x0) / 10)
        yy = y0 + step / 2
        while yy < y1:
            xx = x0 + step / 2
            while xx < x1:
                p = (xx, yy)
                if G.inside(p, s.boundary) and not any(G.inside(p, b['poly']) for b in s.buildings):
                    t = tgt or G.centroid(list(s.frontage()[0]))
                    dx, dy = t[0] - p[0], t[1] - p[1]
                    L = math.hypot(dx, dy) or 1
                    a, b2 = v.P(p), v.P((p[0] + dx / L * step * 0.35, p[1] + dy / L * step * 0.35))
                    c.setStrokeColorRGB(*K.BROWN)
                    c.setLineWidth(0.6)
                    c.line(a[0], a[1], b2[0], b2[1])
                    ang = math.atan2(b2[1] - a[1], b2[0] - a[0])
                    for da in (2.6, -2.6):
                        c.line(b2[0], b2[1], b2[0] + 5 * math.cos(ang + da), b2[1] + 5 * math.sin(ang + da))
                xx += step
            yy += step
        # storm: inlets along drives, piped along the drive to the pond
        for d in s.drives:
            K.draw_poly(c, v.Ps(d['pts']), stroke=K.GREEN, lw=1.2, close=False)
        for p in s.inlets():
            x, y = v.P(p)
            c.setFillColorRGB(*K.GREEN)
            c.rect(x - 3, y - 3, 6, 6, stroke=0, fill=1)
        if s.ponds and s.drives:
            end = min((q for d in s.drives for q in (d['pts'][0], d['pts'][-1])), key=lambda q: G.poly_dist(q, s.ponds[0]['poly']))
            edge = G.nearest_on_line(end, s.ponds[0]['poly'], closed=True)[0]
            a, b2 = v.P(end), v.P(edge)
            c.setStrokeColorRGB(*K.GREEN)
            c.setLineWidth(1.6)
            c.line(a[0], a[1], b2[0], b2[1])
            K.label(c, b2[0], b2[1] + 8, 'OUTFALL TO DETENTION', 6, FB, K.GREEN)

    frame_sheet(c, ctx, sh, draw, [])
    x = K.AREA[0] + K.AREA[2] - SIDE_W
    y = K.AREA[1] + K.AREA[3]
    for blk in [('legend', 'Legend', [('line', K.BROWN, 'Assumed flow direction'), ('sq', K.GREEN, 'Curb inlet (schematic)'), ('line', K.GREEN, 'Storm sewer (schematic)'), ('dash', K.INK, 'Property line')]),
                ('table', 'Finished floor elevations (assumed)', (['Building', 'FFE'], rows[:24], [2, 1], (1,))),
                ('notes', 'Notes', ['Elevations are on an ASSUMED datum of %.2f at the high corner falling 0.6 %% toward the detention outfall; they are not survey elevations.' % float(s.s.get('datum', 100)),
                                    'Finished floors at least 1 ft above adjacent grade and at least 2 ft above the base flood elevation where one applies (owner guardrail; verify the local floodplain ordinance).',
                                    'Inlets about every 275 ft along drives and at low points; pipe sizes by the Rational method at final design.',
                                    'Lots and pads drain away from buildings at 5 % for the first 10 ft (IRC R401.3).'] + disc_notes(ctx, 'civil', [])[:3])]:
        y = side_block(c, x, y, SIDE_W, blk, K.AREA[1])


# ---------- C-202 detention ----------
def c_detention(c, ctx, sh):
    s = ctx.site
    d = s.detention()
    imp = s.impervious()
    ax, ay, aw, ah = K.AREA
    W = (aw - 60) / 3
    x = ax
    y = ay + ah
    y = K.heading(c, x, y, W, 'Detention summary')
    y = K.table(c, x, y, W, [['Site area', '%.2f ac' % s.acres], ['Developed area used', '%.2f ac' % d['dev_ac']], ['Impervious (est.)', '{:,.0f} sf ({:.0f} %)'.format(imp, 100 * imp / s.area_sf)],
                              ['Detention rate', '%.2f ac-ft / developed ac' % d['rate']], ['Storage required', '%.2f ac-ft' % d['req']], ['Storage provided (est.)', '%.2f ac-ft' % d['prov']],
                              ['Result', 'PROVIDED ≥ REQUIRED' if d['prov'] >= d['req'] else 'SHORT BY %.2f ac-ft — enlarge or deepen detention' % (d['req'] - d['prov'])]], cols=[1.3, 1], right=(1,), size=9)
    y -= 16
    if d['rows']:
        y = K.heading(c, x, y, W, 'Detention facilities')
        y = K.table(c, x, y, W, d['rows'], head=['Facility', 'Area', 'Depth', 'Volume'], cols=[1.3, 1, 0.6, 1], right=(1, 2, 3), size=9)
    x2 = ax + W + 30
    y2 = K.heading(c, x2, ay + ah, W, 'Basis')
    y2 = K.numbered(c, x2, y2, W, ['Finishes Solutions guardrail: at least 1.00 acre-foot of storage per developed acre for Waller-area feasibility; use the higher of this and the jurisdiction\'s calculated need.',
                                   'Acre-feet are volume, not pond surface area. Provided volume is the stage-storage of each pond up to its freeboard, from its outline and side slopes, unless a volume is given.',
                                   'Detention land is not counted as buildable area.',
                                   'Outfall, tailwater, and any roadside-ditch or channel capacity must be confirmed by the civil engineer and the drainage authority.'] + disc_notes(ctx, 'civil', [])[:4])
    # each pond enlarged, with its top of bank, high water and bottom, and its stage-storage table
    if s.ponds:
        top = y - 30
        rh = top - ay - 20
        pw = (aw - 60) / 3 * 2 + 30
        per = pw / len(s.ponds[:2])
        for i, pd in enumerate(s.ponds[:2]):
            P = SM.ccw([tuple(q) for q in pd['poly']])
            x0b, y0b, x1b, y1b = G.bbox(P)
            z = float(pd.get('side_slope', 3))
            fb = float(pd.get('freeboard_ft', 1))
            depth = float(pd.get('depth_ft', 6))
            tw = per * 0.55
            sc = K.eng_scale_for(x1b - x0b + 40, y1b - y0b + 40, tw - 20, rh - 70)
            k = 72.0 / sc
            ox = ax + i * per + (tw - (x1b - x0b) * k) / 2 - x0b * k
            oy = ay + 60 + (rh - 70 - (y1b - y0b) * k) / 2 - y0b * k
            T = lambda q: (ox + q[0] * k, oy + q[1] * k)
            K.draw_poly(c, [T(q) for q in P], stroke=K.INK, lw=1.2, fill=(0.9, 0.95, 0.88))
            for off, col, dash, lab in ((z * fb, K.BLUE, (6, 3), 'HIGH WATER (%.1f FT)' % depth), (z * (fb + depth), K.INK, (2, 2), 'BOTTOM')):
                Q = SM.inset_edges(P, [off] * len(P))
                if SM.signed(Q) * SM.signed(P) > 0:
                    K.draw_poly(c, [T(q) for q in Q], stroke=col, lw=0.8, dash=dash, fill=(0.75, 0.87, 0.95) if lab == 'BOTTOM' else None)
                    K.label(c, *T(G.label_point(Q)), lab, 6, FB, col)
            for j in range(len(P)):
                a_, b_ = P[j], P[(j + 1) % len(P)]
                if G.dist(a_, b_) > 10:
                    DR.dim(c, T(a_), T(b_), -12, text=DR.ftin(G.dist(a_, b_)), size=6)
            K.label(c, *T(((x0b + x1b) / 2, y1b)), 'TOP OF BANK', 6, FB)
            K.view_title(c, ax + i * per + 10, ay + 16, i + 1, (pd.get('name') or 'Pond %d' % (i + 1)) + ' — plan', '1" = %d\'' % sc, sc)
            st = s.pond_stages(pd) if pd.get('volume_acft') is None else []
            if st:
                tx = ax + i * per + tw + 10
                yy = K.heading(c, tx, top + 10, per - tw - 20, 'Stage-storage (%s:1 slopes)' % fmt_n(z))
                K.table(c, tx, yy, per - tw - 20, [['%.1f' % a_, '{:,.0f}'.format(b_), '{:,.0f}'.format(v_), '%.2f' % (v_ / 43560)] for a_, b_, v_ in st],
                        head=['Stage ft', 'Area sf', 'Vol cf', 'ac-ft'], cols=[0.8, 1, 1, 0.8], right=(0, 1, 2, 3), size=7.2)
    x3 = ax + 2 * (W + 30)
    # a schematic pond section
    y3 = K.heading(c, x3, ay + ah, W, 'Typical detention section (N.T.S.)')
    bx, by = x3 + 30, y3 - 220
    pts = [(bx, by + 120), (bx + 60, by + 120), (bx + 150, by + 30), (bx + W - 210, by + 30), (bx + W - 120, by + 120), (bx + W - 60, by + 120)]
    K.draw_poly(c, pts, stroke=K.INK, lw=1.4, close=False)
    c.setStrokeColorRGB(*K.BLUE)
    c.setDash([5, 3])
    c.line(bx + 90, by + 90, bx + W - 150, by + 90)
    c.setDash()
    K.label(c, bx + W / 2 - 30, by + 95, 'HIGH WATER LEVEL', 7, FB, K.BLUE)
    K.label(c, bx + W / 2 - 30, by + 18, 'BOTTOM (1.0 % MIN. PILOT CHANNEL)', 7, F)
    K.label(c, bx + 100, by + 60, '3:1 MAX', 7, F, halo=False)
    K.label(c, bx + W - 160, by + 60, '3:1 MAX', 7, F, halo=False)
    K.label(c, bx + 30, by + 130, '1\' MIN. FREEBOARD', 7, F, center=False)


# ---------- C-301 utilities ----------
def c_utility(c, ctx, sh):
    s = ctx.site

    def draw(c, v):
        for m in s.mains():
            K.draw_poly(c, v.Ps(m), stroke=K.BLUE, lw=1.6, close=False)
        for m in s.sewers():
            K.draw_poly(c, v.Ps(m), stroke=K.GREEN, lw=1.6, dash=(8, 3), close=False)
        for h in s.hydrants():
            x, y = v.P(h)
            c.setFillColorRGB(*K.RED)
            c.circle(x, y, 4, stroke=0, fill=1)
        for b in s.buildings:
            cen = G.centroid(b['poly'])
            for line, col, dash in ((min(s.mains(), key=lambda m: G.nearest_on_line(cen, m)[1]), K.BLUE, None), (min(s.sewers(), key=lambda m: G.nearest_on_line(cen, m)[1]), K.GREEN, (4, 2))):
                q = G.nearest_on_line(cen, line)[0]
                wall = G.nearest_on_line(q, b['poly'], closed=True)[0]
                a, bb = v.P(wall), v.P(q)
                c.saveState()
                c.setStrokeColorRGB(*col)
                c.setLineWidth(0.7)
                if dash:
                    c.setDash(list(dash))
                c.line(a[0], a[1], bb[0], bb[1])
                c.restoreState()
        e = s.entry()
        x, y = v.P(e)
        K.label(c, x, y - 14, 'CONNECT TO EXISTING WATER / SEWER (PROVIDER TO CONFIRM)', 6.5, FB, K.BLUE)

    side = [('legend', 'Legend', [('line', K.BLUE, 'Water main / service'), ('dash', K.GREEN, 'Sanitary sewer / service'), ('dot', K.RED, 'Fire hydrant'), ('dash', K.INK, 'Property line')]),
            ('table', 'Utility summary', (None, [['Hydrants', str(len(s.hydrants()))], ['Water main (approx.)', '{:,.0f} lf'.format(sum(G.length(m) for m in s.mains()))],
                                                 ['Sanitary main (approx.)', '{:,.0f} lf'.format(sum(G.length(m) for m in s.sewers()))], ['Providers', s.s.get('utilities') or 'To be confirmed']], [1, 1.4], ())),
            ('notes', 'Notes', [SCHEMATIC, 'Water main shown 8 ft off the drive edge and sanitary sewer 6 ft off the other edge, at least 9 ft apart (TCEQ 30 TAC 290.44 / 217.53).',
                                'Hydrants about every 400 ft along mains and within 100 ft of each fire department connection; spacing and fire flow per the fire code official.',
                                'Obtain will-serve letters from the water, sewer, electric, gas and telecom providers before design development.'] + disc_notes(ctx, 'civil', [])[:3])]
    frame_sheet(c, ctx, sh, draw, side)


# ---------- C-401 erosion control ----------
def c_erosion(c, ctx, sh):
    s = ctx.site

    def draw(c, v):
        K.draw_poly(c, v.Ps(s.boundary), stroke=K.ORANGE, lw=1.4, dash=(2, 3))
        e = s.entry()
        x, y = v.P(e)
        c.setFillColorRGB(0.6, 0.6, 0.6)
        c.rect(x - 12, y - 6, 24, 50 * v.k if 50 * v.k > 12 else 12, stroke=1, fill=1)
        K.label(c, x, y + 30, 'STABILIZED CONSTRUCTION ENTRANCE', 6.5, FB)
        for p in s.inlets():
            x, y = v.P(p)
            c.setStrokeColorRGB(*K.ORANGE)
            c.rect(x - 5, y - 5, 10, 10, stroke=1, fill=0)
        if s.ponds:
            x, y = v.P(G.centroid(s.ponds[0]['poly']))
            K.label(c, x, y - 12, 'SEDIMENT BASIN DURING CONSTRUCTION', 6.5, FB, K.ORANGE)

    side = [('legend', 'Legend', [('dash', K.ORANGE, 'Silt fence'), ('sq', K.ORANGE, 'Inlet protection'), ('fill', (0.6, 0.6, 0.6), 'Construction entrance')]),
            ('notes', 'Notes', ['Disturbed area is about %.1f acres: coverage under the TPDES Construction General Permit TXR150000 is required; post the site notice and keep the SWPPP on site.' % s.acres,
                                'Install silt fence and the construction entrance before clearing; inspect weekly and after 0.5 in of rain.',
                                'Protect every inlet as it is built; stabilize disturbed areas within 14 days of the last work.',
                                'Locate the concrete washout and stockpiles away from inlets and the detention outfall.', SCHEMATIC])]
    frame_sheet(c, ctx, sh, draw, side)


# ---------- details (library drawings) ----------
def _detail_box(c, x, y, w, h, n, title, draw):
    c.setStrokeColorRGB(*K.FAINT)
    c.setLineWidth(0.5)
    c.rect(x, y, w, h, stroke=1, fill=0)
    draw(x + 20, y + 50, w - 40, h - 80)
    K.view_title(c, x + 10, y + 14, n, title, 'N.T.S.')


def _layers(c, x, y, w, layers):
    """a stacked section: [(thickness pt, fill grey, label)] from the top down"""
    yy = y
    for th, g, lab in layers:
        c.setFillColorRGB(g, g, g)
        c.setStrokeColorRGB(*K.INK)
        c.setLineWidth(0.6)
        c.rect(x, yy - th, w * 0.6, th, stroke=1, fill=1)
        c.line(x + w * 0.6, yy - th / 2, x + w * 0.66, yy - th / 2)
        c.setFillColorRGB(*K.INK)
        c.setFont(F, 7.5)
        c.drawString(x + w * 0.67, yy - th / 2 - 2.5, lab)
        yy -= th


def fmt_n(v):
    return ('%g' % v)


def details_sheet(c, ctx, sh, items, notes):
    """typical details laid out as large as the sheet allows, notes in the right-hand column"""
    ax, ay, aw, ah = K.AREA
    DT.details_grid(c, items[:8], (ax, ay, aw - SIDE_W - 24, ah))
    x = ax + aw - SIDE_W
    side_block(c, x, ay + ah, SIDE_W, ('notes', 'Notes', notes), ay)


def c_details(c, ctx, sh):
    details_sheet(c, ctx, sh, [('Concrete paving section', DT.paving), ('Curb and gutter', DT.curb), ('Curb ramp', DT.ramp), ('Accessible stall and sign', DT.ada_stall),
                               ('Dumpster enclosure', DT.enclosure), ('Light pole base', DT.light_base), ('Silt fence', DT.silt), ('Construction entrance', DT.entrance)],
                  ['Typical details for pricing; pavement sections, joints and reinforcing by the geotechnical and civil engineers.', 'Curb ramps, slopes and detectable warnings per TAS 405, 406 and 705.'] + disc_notes(ctx, 'civil', [])[:4])


# ---------- L-101 / L-501 landscape ----------
def tree_spots(s):
    """street trees about 30 ft apart along the frontage, buffer trees about 40 ft apart along the other lines; every
    tree at least 12 ft clear of buildings, paving, drives, parking rows and ponds"""
    def clear(p):
        if not G.inside(p, s.boundary):
            return False
        for b in s.buildings:
            if G.poly_dist(p, b['poly']) < 12:
                return False
        for pv in s.paving:
            if pv.get('kind') != 'walk' and G.poly_dist(p, pv['poly']) < 6:
                return False
        for d in s.drives:
            if G.nearest_on_line(p, d['pts'])[1] < d.get('width', 24) / 2 + 6:
                return False
        for r in s.rows:
            if G.poly_dist(p, r['rect']) < 6:
                return False
        for pd in s.ponds:
            if G.poly_dist(p, pd['poly']) < 12:
                return False
        return True
    pts = []
    for a, b in s.frontage():
        for x, y, ux, uy in G.along([a, b], 30, start=15):
            for off in (10, -10):
                p = (x + -uy * off, y + ux * off)
                if G.inside(p, s.boundary):
                    if clear(p):
                        pts.append(('street', p))
                    break
    B = s.boundary
    for x, y, ux, uy in G.along(B, 40, closed=True, start=20):
        p = (x + -uy * 8, y + ux * 8)
        if not G.inside(p, B):
            p = (x + uy * 8, y - ux * 8)
        if clear(p) and all(G.dist(p, q[1]) > 25 for q in pts):
            pts.append(('buffer', p))
    return pts


def l_plan(c, ctx, sh):
    s = ctx.site
    trees = tree_spots(s)
    stalls = (s.s.get('parking') or {}).get('provided') or 0

    def draw(c, v):
        for kind, p in trees:
            x, y = v.P(p)
            r = max(4, 15 * v.k)
            c.setStrokeColorRGB(*K.GREEN)
            c.setFillColorRGB(0.8, 0.9, 0.78)
            c.circle(x, y, r, stroke=1, fill=1)
            c.circle(x, y, 1, stroke=1, fill=0)
        for b in s.buildings:
            for x, y, ux, uy in G.along(b['poly'], 6, closed=True):
                q = (x + uy * 3, y - ux * 3)
                if not G.inside(q, b['poly']):
                    px, py = v.P(q)
                    c.setFillColorRGB(0.55, 0.75, 0.5)
                    c.circle(px, py, max(1.2, 1.5 * v.k), stroke=0, fill=1)

    st = sum(1 for k, _ in trees if k == 'street')
    bf = len(trees) - st
    side = [('legend', 'Legend', [('dot', K.GREEN, 'Shade tree, 3" cal. min.'), ('dot', (0.55, 0.75, 0.5), 'Shrubs, 5 gal. at 3\' o.c.'), ('fill', (0.88, 0.94, 0.86), 'Sod (Bermuda / St. Augustine)')]),
            ('table', 'Plant schedule', (['Item', 'Qty', 'Size'], [['Street trees (Live Oak / Cedar Elm)', str(st), '3" cal.'], ['Buffer trees (Cedar Elm / Bald Cypress)', str(bf), '3" cal.'],
                                                                      ['Parking lot trees (1 per 10 stalls)', str(math.ceil(stalls / 10)) if stalls else '—', '3" cal.'], ['Foundation shrubs (Dwarf Yaupon / Indian Hawthorn)', 'per plan', '5 gal.']], [2.4, 0.6, 0.6], (1,))),
            ('notes', 'Notes', ['Street trees about 30 ft apart along frontages; buffer trees about 40 ft apart along the other lines, clear of utilities and sight triangles.',
                                'Native and adapted species for southeast Texas; irrigation by a licensed irrigator (TCEQ 30 TAC 344).', 'Verify landscape and buffer requirements with the jurisdiction.'] + disc_notes(ctx, 'landscape', [])[:4])]
    frame_sheet(c, ctx, sh, draw, side)


def l_details(c, ctx, sh):
    details_sheet(c, ctx, sh, [('Tree planting', DT.tree), ('Shrub planting', DT.shrub)], ['Planting per ANSI Z60.1 nursery stock standards.'] + disc_notes(ctx, 'landscape', [])[:6])


# ---------- E-101 site lighting ----------
def e_site(c, ctx, sh):
    s = ctx.site
    poles = []
    for d in s.drives:
        for x, y, ux, uy in G.along(d['pts'], 100, start=40):
            poles.append((x + -uy * (d.get('width', 24) / 2 + 3), y + ux * (d.get('width', 24) / 2 + 3)))
    for pv in s.paving:
        if pv.get('kind') == 'parking':
            x0, y0, x1, y1 = G.bbox(pv['poly'])
            for gx in range(int(x0 + 45), int(x1), 90):
                for gy in range(int(y0 + 45), int(y1), 90):
                    if G.inside((gx, gy), pv['poly']):
                        poles.append((gx, gy))
    packs = []
    for b in s.buildings:
        t = s.types.get(b.get('type'))
        if t and t['use'] in ('sfr', 'townhomes', 'duplex'):
            continue
        packs += [(x, y) for x, y, _, _ in G.along(b['poly'], 50, closed=True)]

    def draw(c, v):
        for p in poles:
            x, y = v.P(p)
            c.setFillColorRGB(*K.ORANGE)
            c.circle(x, y, 3.5, stroke=0, fill=1)
            c.setStrokeColorRGB(*K.ORANGE)
            c.setLineWidth(0.3)
            c.circle(x, y, 50 * v.k, stroke=1, fill=0)
        for p in packs:
            x, y = v.P(p)
            c.setFillColorRGB(*K.ORANGE)
            c.rect(x - 2.5, y - 2.5, 5, 5, stroke=0, fill=1)

    side = [('legend', 'Legend', [('dot', K.ORANGE, 'Pole light, 25\' mount, LED type III / IV'), ('sq', K.ORANGE, 'Building wall pack, full cutoff'), ('line', K.ORANGE, '50 ft nominal light spread')]),
            ('table', 'Fixture schedule', (['Type', 'Qty', 'Description'], [['SA', str(len(poles)), 'Pole-mounted LED area light, 150 W, 4000 K, full cutoff'], ['WP', str(len(packs)), 'LED wall pack, 40 W, full cutoff']], [0.5, 0.5, 3], (1,))),
            ('notes', 'Notes', ['Target 1.0 fc average in parking (IES RP-8 / RP-20) with no more than 0.1 fc at the property line; photometric plan by the electrical engineer.', 'Full cutoff fixtures only; verify any local dark-sky or lighting ordinance.', SCHEMATIC])]
    frame_sheet(c, ctx, sh, draw, side)


# ---------- FP-101 fire access ----------
def fp_access(c, ctx, sh):
    s = ctx.site
    lanes = [d for d in s.drives if d.get('fire_lane') or d.get('width', 24) >= 20]
    rows = []
    for b in s.buildings:
        far = 0
        for q in b['poly']:
            far = max(far, min((G.nearest_on_line(q, d['pts'])[1] for d in lanes), default=9999))
        t = s.types.get(b.get('type'))
        ok = far <= 150 or (t and t.get('sprinklered') and far <= 200)
        rows.append([b.get('name') or b.get('type'), '%d ft' % far if far < 9999 else 'no lane', 'OK' if ok else 'CHECK'])

    def draw(c, v):
        for d in lanes:
            K.draw_poly(c, v.Ps(drive_band(d)), stroke=K.RED, lw=1.2, fill=None)
        for h in s.hydrants():
            x, y = v.P(h)
            c.setFillColorRGB(*K.RED)
            c.circle(x, y, 4.5, stroke=0, fill=1)
            c.setStrokeColorRGB(*K.RED)
            c.setLineWidth(0.3)
            c.setDash([2, 2])
            c.circle(x, y, 300 * v.k, stroke=1, fill=0)
            c.setDash()
        for b in s.buildings:
            t = s.types.get(b.get('type'))
            if t and t.get('sprinklered'):
                q = min(((x, y) for x, y, _, _ in G.along(b['poly'], 5, closed=True)), key=lambda p: min((G.nearest_on_line(p, d['pts'])[1] for d in lanes), default=0))
                x, y = v.P(q)
                K.label(c, x, y + 5, 'FDC', 6, FB, K.RED)

    side = [('legend', 'Legend', [('line', K.RED, 'Fire apparatus access road (20\' min.)'), ('dot', K.RED, 'Fire hydrant'), ('dash', K.RED, '300 ft hose reach (straight line)')]),
            ('table', 'Hose reach: farthest building corner from a fire lane', (['Building', 'Distance', 'IFC 503.1.1'], rows[:30], [1.6, 0.8, 0.8], (1,))),
            ('notes', 'Notes', ['Fire apparatus access within 150 ft of every point of the first-story exterior walls, measured along an approved route (IFC 503.1.1); distances here are straight-line and must be checked along the route.',
                                'Access roads 20 ft clear (26 ft at hydrants, IFC D103.1), 13\'-6" vertical clearance, 75,000 lb load; dead ends over 150 ft need an approved turnaround (IFC D103.4).',
                                'Two access points where required by IFC D104 / D106 / D107 (commercial buildings over 30 ft or 62,000 sf, more than 200 apartment units, more than 30 one- or two-family dwellings).',
                                'Hydrant spacing and fire flow per IFC Appendix B and C and the fire code official.'] + disc_notes(ctx, 'fire', [])[:3])]
    frame_sheet(c, ctx, sh, draw, side)


# ---------- T-101 site fiber ----------
def t_site(c, ctx, sh):
    s = ctx.site
    hh = []

    def draw(c, v):
        for d in s.drives:
            line = G.offset_line(d['pts'], d.get('width', 24) / 2 + 4)
            K.draw_poly(c, v.Ps(line), stroke=K.MAGENTA, lw=1.2, dash=(6, 2, 1, 2), close=False)
            for x, y, _, _ in G.along(line, 400, start=0):
                hh.append((x, y))
                px, py = v.P((x, y))
                c.setStrokeColorRGB(*K.MAGENTA)
                c.rect(px - 4, py - 4, 8, 8, stroke=1, fill=0)
        e = s.entry()
        x, y = v.P(e)
        K.label(c, x, y - 12, 'MPOE / PROVIDER HANDOFF', 6.5, FB, K.MAGENTA)

    side = [('legend', 'Legend', [('dash', K.MAGENTA, '2 × 2" HDPE conduit, fiber backbone'), ('sq', K.MAGENTA, 'Handhole (about every 400 ft and at turns)')]),
            ('notes', 'Notes', ['Provider, handoff point and conduit counts to be confirmed with the fiber provider.', 'Each building gets a 1-1/4" conduit drop from the nearest handhole to its demarc.', SCHEMATIC] + disc_notes(ctx, 'telecom', [])[:4])]
    frame_sheet(c, ctx, sh, draw, side)


RENDERERS = {'c-existing': c_existing, 'siteplan': siteplan, 'c-dims': c_dims, 'c-lots': c_lots, 'c-grading': c_grading, 'c-detention': c_detention,
             'c-utility': c_utility, 'c-erosion': c_erosion, 'c-details': c_details, 'l-plan': l_plan, 'l-details': l_details, 'e-site': e_site,
             'fp-access': fp_access, 't-site': t_site}
