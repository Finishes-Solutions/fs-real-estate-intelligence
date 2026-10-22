"""Site, civil, landscape and site-wide electrical / fire / telecom sheets. Every plan sheet is drawn from the one site
model (site.py): street at the bottom, true north from the reference, the site in grey with the sheet's own layer in
colour, and a right-hand column of legend, tables and numbered notes. Grades, pipes, hydrants, lights and conduit are
SCHEMATIC: placed by rules of thumb and labelled as assumptions for the engineer to replace."""
import math
from . import geom as G
from . import kit as K
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


def base(c, v, mode='grey', label_buildings=True):
    """the site: streets, lots, paving, ponds, open space, buildings, easements, property line"""
    s = v.site
    grey = mode == 'grey'
    c.saveState()
    for st in s.streets:
        if st.get('row_width'):
            for off in (st['row_width'] / 2, -st['row_width'] / 2):
                K.draw_poly(c, v.Ps(G.offset_line(st['pts'], off)), stroke=K.LIGHT, lw=0.6, close=False)
            K.draw_poly(c, v.Ps(G.offset_line(st['pts'], 14)[:]) + v.Ps(G.offset_line(st['pts'], -14))[::-1], stroke=None, fill=(0.9, 0.9, 0.9))
        K.draw_poly(c, v.Ps(st['pts']), stroke=K.LIGHT, lw=0.6, dash=(12, 4, 2, 4), close=False)
        mid = st['pts'][len(st['pts']) // 2] if len(st['pts']) > 2 else ((st['pts'][0][0] + st['pts'][-1][0]) / 2, (st['pts'][0][1] + st['pts'][-1][1]) / 2)
        if st.get('name'):
            x, y = v.P(mid)
            K.label(c, x, y - 4, st['name'].upper() + (' (%s\' ROW)' % st['row_width'] if st.get('row_width') else ''), 9, FB, K.GREY)
    for o in s.open:
        K.draw_poly(c, v.Ps(o['poly']), stroke=None, fill=(0.88, 0.94, 0.86) if not grey else (0.95, 0.96, 0.95))
    for l in s.lots:
        K.draw_poly(c, v.Ps(l['poly']), stroke=K.LIGHT, lw=0.4, fill=(0.97, 0.95, 0.9) if not grey else None)
    for p in s.paving:
        K.draw_poly(c, v.Ps(p['poly']), stroke=K.GREY if not grey else K.LIGHT, lw=0.5, fill=(0.82, 0.82, 0.82) if not grey else (0.92, 0.92, 0.92))
    if not s.paving:
        for d in s.drives:
            K.draw_poly(c, v.Ps(drive_band(d)), stroke=K.LIGHT, lw=0.5, fill=(0.82, 0.82, 0.82) if not grey else (0.92, 0.92, 0.92))
    for pd in s.ponds:
        K.draw_poly(c, v.Ps(pd['poly']), stroke=(0.4, 0.6, 0.8), lw=0.8, fill=(0.75, 0.87, 0.95) if not grey else (0.9, 0.94, 0.97))
        x, y = v.P(G.centroid(pd['poly']))
        K.label(c, x, y, (pd.get('name') or 'DETENTION').upper(), 7, FB, K.BLUE if not grey else K.GREY, halo=False)
    for b in s.buildings:
        t = s.types.get(b.get('type'))
        col = USE_COL.get(t['use'] if t else b.get('use', ''), (0.8, 0.8, 0.8))
        K.draw_poly(c, v.Ps(b['poly']), stroke=K.INK, lw=0.9 if not grey else 0.6, fill=col if not grey else (0.80, 0.80, 0.80))
    if label_buildings:
        for b in s.buildings:
            x, y = v.P(G.centroid(b['poly']))
            bw = G.bbox(v.Ps(b['poly']))
            if bw[2] - bw[0] > 22 and bw[3] - bw[1] > 10:
                K.label(c, x, y - 2, b.get('name') or ('TYPE ' + b.get('type', '')), 6 if bw[2] - bw[0] < 60 else 7.5, FB, halo=False)
    for e in s.easements:
        K.draw_poly(c, v.Ps(e['pts']), stroke=K.MAGENTA, lw=0.8, dash=(6, 3), close=bool(e.get('poly')))
        if e.get('label'):
            x, y = v.P(e['pts'][0])
            K.label(c, x + 4, y + 4, e['label'], 6.5, F, K.MAGENTA, center=False)
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
    leg += [('fill', (0.82, 0.82, 0.82), 'Paving'), ('fill', (0.75, 0.87, 0.95), 'Detention'), ('fill', (0.88, 0.94, 0.86), 'Open space'), ('dash', K.INK, 'Property line')]
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
    rows = []

    def draw(c, v):
        for b in s.buildings:
            best = None
            for q in b['poly']:
                p, d, _ = G.nearest_on_line(q, s.boundary, closed=True)
                if best is None or d < best[2]:
                    best = (q, p, d)
            if best:
                a, bb = v.P(best[0]), v.P(best[1])
                c.setStrokeColorRGB(*K.RED)
                c.setLineWidth(0.6)
                c.line(a[0], a[1], bb[0], bb[1])
                K.label(c, (a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2, '%.1f\'' % best[2], 6.5, FB, K.RED)
                rows.append([b.get('name') or b.get('type'), '%.1f ft' % best[2]])
        for d in s.drives:
            m = d['pts'][len(d['pts']) // 2] if len(d['pts']) > 2 else ((d['pts'][0][0] + d['pts'][1][0]) / 2, (d['pts'][0][1] + d['pts'][1][1]) / 2)
            x, y = v.P(m)
            K.label(c, x, y, '%d\' %s' % (d.get('width', 24), 'FIRE LANE' if d.get('fire_lane') or d.get('width', 24) >= 20 else 'DRIVE'), 6.5, FB, K.RED if d.get('fire_lane') or d.get('width', 24) >= 20 else K.INK)

    sb = s.s.get('setbacks') or {}
    srows = [[k.capitalize(), '%s ft' % v] for k, v in sb.items()]
    frame_sheet(c, ctx, sh, draw, [])
    x = K.AREA[0] + K.AREA[2] - SIDE_W
    y = K.AREA[1] + K.AREA[3]
    blocks = [('legend', 'Legend', [('line', K.RED, 'Building to property line (closest)'), ('fill', (0.92, 0.92, 0.92), 'Paving'), ('dash', K.INK, 'Property line')])]
    if srows:
        blocks.append(('table', 'Setbacks (verify; guardrail +5 %)', (None, srows, [1, 1], (1,))))
    blocks.append(('table', 'Closest building to property line', (['Building', 'Distance'], rows[:30], [2, 1], (1,))))
    blocks.append(('notes', 'Notes', ['Dimensions are computed from the plan geometry and rounded; verify against the survey.', 'Fire lanes at least 20 ft clear (26 ft where a hydrant is on the lane or the building is over 30 ft tall, IFC D103 / D105).',
                                      'Accessible stalls, aisles and routes per TAS 502 and 402; striping and signage by the civil engineer.'] + disc_notes(ctx, 'civil', [])[:4]))
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
                                   'Acre-feet are volume, not pond surface area. Provided volume is estimated as area × depth × 0.75 for 3:1 side slopes unless a volume is given.',
                                   'Detention land is not counted as buildable area.',
                                   'Outfall, tailwater, and any roadside-ditch or channel capacity must be confirmed by the civil engineer and the drainage authority.'] + disc_notes(ctx, 'civil', [])[:4])
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


def details_sheet(c, ctx, sh, items, notes):
    ax, ay, aw, ah = K.AREA
    cols = 4
    nw = (aw - SIDE_W - 24)
    cw = nw / cols
    rh = ah / 2
    for i, (title, fn) in enumerate(items[:8]):
        cx = ax + (i % cols) * cw
        cy = ay + ah - (i // cols + 1) * rh
        _detail_box(c, cx + 4, cy + 4, cw - 8, rh - 8, i + 1, title, lambda x, y, w, h, fn=fn: fn(c, x, y, w, h))
    x = ax + aw - SIDE_W
    y = side_block(c, x, ay + ah, SIDE_W, ('notes', 'Notes', notes), ay)


def d_paving(c, x, y, w, h):
    _layers(c, x, y + h - 20, w, [(30, 0.75, '6" REINFORCED CONCRETE PAVING (3,500 PSI), #4 AT 18" O.C.'), (36, 0.9, '8" LIME- OR CEMENT-STABILIZED SUBGRADE (PER GEOTECH)'), (50, 0.97, 'COMPACTED SUBGRADE, 95 % STANDARD PROCTOR')])


def d_curb(c, x, y, w, h):
    s = min(w, h) / 160
    pts = [(x, y + 40 * s), (x + 60 * s, y + 40 * s), (x + 60 * s, y + 100 * s), (x + 66 * s, y + 106 * s), (x + 96 * s, y + 106 * s), (x + 96 * s, y + 40 * s), (x + 150 * s, y + 40 * s), (x + 150 * s, y + 10 * s), (x, y + 10 * s)]
    K.draw_poly(c, pts, stroke=K.INK, fill=(0.85, 0.85, 0.85), lw=1)
    K.label(c, x + 78 * s, y + 118 * s, '6" CURB', 7, FB)
    K.label(c, x + 30 * s, y + 50 * s, 'PAVING', 7, F, halo=False)
    K.label(c, x + 78 * s, y + 0, '6" × 24" CURB AND GUTTER, DOWELED TO PAVING', 7, F)


def d_ramp(c, x, y, w, h):
    s = min(w, h) / 140
    K.draw_poly(c, [(x + 20 * s, y + 20 * s), (x + 120 * s, y + 20 * s), (x + 120 * s, y + 100 * s), (x + 20 * s, y + 100 * s)], stroke=K.INK, lw=1)
    K.draw_poly(c, [(x + 45 * s, y + 20 * s), (x + 95 * s, y + 20 * s), (x + 95 * s, y + 70 * s), (x + 45 * s, y + 70 * s)], stroke=K.INK, fill=(0.88, 0.88, 0.88), lw=0.8)
    for i in range(6):
        c.circle(x + (52 + i * 8) * s, y + 28 * s, 1.5, stroke=1, fill=0)
    K.label(c, x + 70 * s, y + 80 * s, '1:12 MAX RAMP, 36" MIN WIDTH', 7, FB)
    K.label(c, x + 70 * s, y + 8 * s, 'DETECTABLE WARNING 24" DEEP (TAS 705)', 7, F)


def d_enclosure(c, x, y, w, h):
    s = min(w, h) / 140
    K.draw_poly(c, [(x + 20 * s, y + 30 * s), (x + 20 * s, y + 120 * s), (x + 120 * s, y + 120 * s), (x + 120 * s, y + 30 * s)], stroke=K.INK, lw=3, close=False)
    c.setDash([3, 2])
    c.line(x + 20 * s, y + 30 * s, x + 120 * s, y + 30 * s)
    c.setDash()
    K.label(c, x + 70 * s, y + 75 * s, '12\' × 12\' CLEAR PER CONTAINER', 7, FB, halo=False)
    K.label(c, x + 70 * s, y + 15 * s, '6\' MASONRY SCREEN WALL, STEEL GATES, 8" PAD', 7, F)


def d_silt(c, x, y, w, h):
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(1)
    c.line(x, y + 40, x + w * 0.7, y + 40)
    c.setLineWidth(2)
    c.line(x + w * 0.35, y + 20, x + w * 0.35, y + 120)
    c.setStrokeColorRGB(*K.ORANGE)
    c.line(x + w * 0.33, y + 30, x + w * 0.33, y + 110)
    K.label(c, x + w * 0.35, y + 128, 'STEEL T-POST 8\' O.C. MAX, GEOTEXTILE FABRIC', 7, F)
    K.label(c, x + w * 0.35, y + 8, 'TOE FABRIC 6" INTO TRENCH, BACKFILL AND COMPACT', 7, F)


def d_entrance(c, x, y, w, h):
    _layers(c, x, y + h - 20, w, [(30, 0.6, '8" OF 3"–5" CRUSHED STONE, 50\' MIN LENGTH'), (8, 0.3, 'GEOTEXTILE FABRIC'), (40, 0.95, 'SUBGRADE')])


def c_details(c, ctx, sh):
    details_sheet(c, ctx, sh, [('Concrete paving section', d_paving), ('Curb and gutter', d_curb), ('Curb ramp', d_ramp), ('Dumpster enclosure', d_enclosure),
                               ('Silt fence', d_silt), ('Construction entrance', d_entrance)],
                  ['Typical details for pricing; pavement sections, joints and reinforcing by the geotechnical and civil engineers.', 'Curb ramps, slopes and detectable warnings per TAS 405, 406 and 705.'] + disc_notes(ctx, 'civil', [])[:4])


# ---------- L-101 / L-501 landscape ----------
def tree_spots(s):
    pts = []
    for a, b in s.frontage():
        for x, y, ux, uy in G.along([a, b], 30, start=15):
            p = (x + -uy * 10, y + ux * 10)
            if G.inside(p, s.boundary):
                pts.append(('street', p))
    B = s.boundary
    for x, y, ux, uy in G.along(B, 40, closed=True, start=20):
        p = (x + -uy * 8, y + ux * 8)
        if not G.inside(p, B):
            p = (x + uy * 8, y - ux * 8)
        if G.inside(p, B) and all(G.dist(p, q[1]) > 25 for q in pts) and not any(G.inside(p, b['poly']) for b in s.buildings) \
                and not any(G.inside(p, pv['poly']) for pv in s.paving) and not any(G.inside(p, pd['poly']) for pd in s.ponds):
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


def d_tree(c, x, y, w, h):
    s = min(w, h) / 160
    c.setStrokeColorRGB(*K.GREEN)
    c.setLineWidth(1.4)
    c.line(x + 80 * s, y + 40 * s, x + 80 * s, y + 140 * s)
    c.circle(x + 80 * s, y + 140 * s, 30 * s, stroke=1, fill=0)
    c.setStrokeColorRGB(*K.INK)
    K.draw_poly(c, [(x + 40 * s, y + 40 * s), (x + 50 * s, y + 20 * s), (x + 110 * s, y + 20 * s), (x + 120 * s, y + 40 * s)], stroke=K.INK, close=False)
    K.label(c, x + 80 * s, y + 6 * s, 'PIT 2× ROOT BALL WIDTH; ROOT FLARE AT GRADE; 3" MULCH', 7, F)


def d_shrub(c, x, y, w, h):
    s = min(w, h) / 160
    for i in range(3):
        c.setStrokeColorRGB(*K.GREEN)
        c.circle(x + (40 + i * 40) * s, y + 70 * s, 16 * s, stroke=1, fill=0)
    K.label(c, x + 80 * s, y + 30 * s, '5 GAL. AT 3\'-0" O.C., TRIANGULAR SPACING', 7, F)


def l_details(c, ctx, sh):
    details_sheet(c, ctx, sh, [('Tree planting', d_tree), ('Shrub planting', d_shrub)], ['Planting per ANSI Z60.1 nursery stock standards.'] + disc_notes(ctx, 'landscape', [])[:6])


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
