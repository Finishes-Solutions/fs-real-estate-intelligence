"""Engineering sheets: structural, mechanical, plumbing, electrical, fire sprinkler / alarm, life safety and telecom.
RULE-BASED SCHEMATIC LAYOUTS (a basis of design for pricing and consultant kickoff, not engineering), placed on a
light floor plan of each building type. Every sheet says so."""
import math
from . import kit as K
from . import rules as RU
from . import draft as DR
from .kit import F, FB
from .design import is_res, room_area, floors_of, outline
from .sheets_arch import plan_views, side_column, type_and_design
from .sheets_site import disc_notes, disc_criteria

BASIS = 'RULE-BASED SCHEMATIC LAYOUT — basis of design for pricing and coordination only. Systems, sizes and loads must be designed, calculated and sealed by the engineer of record.'


def sym_circle(c, x, y, r, col, fill=False, text=None):
    c.setStrokeColorRGB(*col)
    c.setFillColorRGB(*col)
    c.setLineWidth(0.7)
    c.circle(x, y, r, stroke=1, fill=1 if fill else 0)
    if text:
        fs = min(r * 0.95, max(3.5, r * 0.95 * (1.6 * r) / max(1e-6, c.stringWidth(text, FB, r * 0.95))))
        c.setFont(FB, fs)
        c.setFillColorRGB(*(K.INK if not fill else (1, 1, 1)))
        c.drawCentredString(x, y - r * 0.35, text)


def sym_box(c, x, y, s, col, text=None, fill=False):
    c.setStrokeColorRGB(*col)
    c.setFillColorRGB(*col)
    c.setLineWidth(0.7)
    c.rect(x - s / 2, y - s / 2, s, s, stroke=1, fill=1 if fill else 0)
    if text:
        fs = min(s * 0.45, max(3.5, s * 0.45 * (s - 5) / max(1e-6, c.stringWidth(text, FB, s * 0.45))))
        c.setFont(FB, fs)
        c.setFillColorRGB(*((1, 1, 1) if fill else K.INK))
        c.drawCentredString(x, y - fs * 0.36, text)


def notes_sheet(c, ctx, sh, key, blocks):
    crit = disc_criteria(ctx, key)
    head = [('Basis of design', 'text', BASIS)]
    if crit:
        head.append(('Design criteria', 'table', (['Item', 'Value'], crit, [1, 1.6])))
    from .notes_lib import blocks_for
    K.note_columns(c, head + blocks + blocks_for(key, list(ctx.types.values())), 4)


def per_type(c, ctx, sh, overlay, legend, extra=None, notes=()):
    t, d = type_and_design(ctx, sh)
    lab, ft, _ = plan_views(c, ctx, t, d, overlay=lambda c_, f, X, Y, k: overlay(c_, t, d, f, X, Y, k), light=True)
    sh['scale'] = lab
    blocks = [('legend', 'Legend', legend)] + (extra(t, d) if extra else []) + [('notes', 'Notes', [BASIS] + list(notes))]
    side_column(c, blocks)


# ---------- structural ----------
def s_notes(c, ctx, sh):
    rows = []
    for t in ctx.types.values():
        fr = RU.framing(t)
        rows.append(['Type ' + t['id'], fr['foundation'] + '; ' + fr['roof'] + '; ' + fr['walls']])
    notes_sheet(c, ctx, sh, 'structural', [
        ('Design criteria (assumed)', 'table', (['Item', 'Value'], [['Building code', 'IBC / IRC 2021 as adopted'], ['Risk category', 'II'], ['Wind', 'ASCE 7-22, about 130–140 mph ultimate, exposure C (verify)'],
                                                                    ['Seismic', 'Site class D assumed; SDC A typical in southeast Texas'], ['Roof live load', '20 psf'], ['Floor live load', '40 psf residential, 100 psf corridors / assembly, 125 psf storage'],
                                                                    ['Soils', 'Expansive clays assumed; PVR per the geotechnical report']], [1, 1.6])),
        ('Systems by type', 'table', (['Type', 'Structural system'], rows, [0.5, 2.5])),
        ('General notes', 'list', disc_notes(ctx, 'structural', ['A geotechnical investigation is required before foundation design.', 'Concrete 3,000 psi minimum (4,000 psi for PT slabs), reinforcing ASTM A615 Gr 60.',
                                                                 'Wood framing No. 2 SYP or better; engineered trusses by a Texas-licensed truss engineer.', 'Structural steel ASTM A992 (W shapes), A500 (HSS); joists per SJI.']))])


def s_found(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        if f != 1:
            return
        ol = outline(t)
        K.draw_poly(c, [(X(p[0]), Y(p[1])) for p in ol], stroke=K.BLUE, lw=2.2)
        xs, ys = RU.grade_beams(t, 18 if is_res(t) else 20)
        c.setStrokeColorRGB(*K.BLUE)
        c.setLineWidth(1.0)
        c.setDash([6, 3])
        for x in xs:
            c.line(X(x), Y(0), X(x), Y(t['D']))
        for y in ys:
            c.line(X(0), Y(y), X(t['W']), Y(y))
        c.setDash()
        for i, x in enumerate([0] + xs + [t['W']]):
            sym_circle(c, X(x), Y(t['D']) + 16, 7, K.INK, text=str(i + 1))
        for j, y in enumerate([0] + ys + [t['D']]):
            sym_circle(c, X(0) - 16, Y(y), 7, K.INK, text=chr(65 + j))
        for r in d['rooms']:
            if r['floor'] == 1 and r['type'] == 'garage':
                K.label(c, X(r['x'] + r['w'] / 2), Y(r['y'] + 2), 'GARAGE SLAB DROPPED 4", SLOPE TO DOOR', 5.5, F, K.BLUE)

    fr = lambda t, d: [('table', 'Foundation', (None, [['System', RU.framing(t)['foundation']], ['Beams', '12" × 30" perimeter, 12" × 24" interior (assumed)'], ['Slab', '5" PT or 4" reinforced on vapor retarder']], [0.7, 2], ()))]
    per_type(c, ctx, sh, ov, [('line', K.BLUE, 'Slab edge / perimeter grade beam'), ('dash', K.BLUE, 'Interior grade beam (about 18–20 ft o.c.)')], fr,
             ['Beam sizes and spacing to be set by the engineer from the geotechnical report (PVR and bearing).'])


def s_frame(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        span_y = t['D'] <= t['W'] or t.get('attached')
        c.setStrokeColorRGB(*K.BROWN)
        c.setLineWidth(0.3)
        step = 2 if is_res(t) else 5
        if span_y:
            for i in range(1, int(t['W'] / step)):
                c.line(X(i * step), Y(0), X(i * step), Y(t['D']))
        else:
            for i in range(1, int(t['D'] / step)):
                c.line(X(0), Y(i * step), X(t['W']), Y(i * step))
        mx, my = X(t['W'] / 2), Y(t['D'] / 2)
        c.setLineWidth(1.4)
        if span_y:
            c.line(mx, Y(2), mx, Y(t['D'] - 2))
        else:
            c.line(X(2), my, X(t['W'] - 2), my)
        K.label(c, mx, my, ('ROOF TRUSSES @ 24" O.C.' if f == max(floors_of(d)) else 'FLOOR TRUSSES @ 19.2" O.C.') if is_res(t) else 'STEEL JOISTS @ ±5\'-0" O.C.', 6, FB, K.BROWN)
        if t.get('attached'):
            K.label(c, X(0) + 4, Y(t['D'] / 2), '2-HR PARTY WALL', 5, FB, K.RED, angle=90)

    fr = lambda t, d: [('table', 'Framing', (None, [[k_.capitalize(), v] for k_, v in RU.framing(t).items() if v], [0.6, 2], ()))]
    per_type(c, ctx, sh, ov, [('line', K.BROWN, 'Trusses / joists (direction and spacing)')], fr, ['Headers, beams, bracing and hold-downs per the engineer and the truss / joist supplier.'])


def s_details(c, ctx, sh):
    from .sheets_site import details_sheet
    from . import details as DT

    details_sheet(c, ctx, sh, [('Grade beam and slab edge', DT.grade_beam), ('Column footing', DT.footing)], ['Typical details for pricing; the engineer of record details and seals the structure.'] + disc_notes(ctx, 'structural', [])[:4])


# ---------- mechanical ----------
def m_notes(c, ctx, sh):
    rows = []
    for t in ctx.types.values():
        for s in RU.hvac_systems(t, t['design']):
            rows.append(['%s / %s' % (t['id'], s['tag']), s['kind'], '%s' % s['tons'], '{:,}'.format(s['area']), '%d' % round(s['tons'] * 400)])
    notes_sheet(c, ctx, sh, 'mechanical', [
        ('Equipment schedule (rule of thumb)', 'table', (['Type / tag', 'Unit', 'Tons', 'SF', 'CFM'], rows, [0.9, 1.6, 0.4, 0.5, 0.5])),
        ('Sizing basis', 'bullets', ['Cooling about 550 sf per ton for homes, 350 sf per ton for retail and office, 200 sf per ton for dining and kitchens; a Manual J (homes) or ASHRAE load calculation governs.',
                                     '400 cfm per ton; one supply diffuser per about 150 sf (homes) or 250 sf (commercial).', 'Outdoor air per IMC 403; kitchen hoods per IMC 507; restroom exhaust 50–70 cfm per fixture.',
                                     'Outdoor design conditions (Houston area): 96 °F DB / 77 °F WB summer, 32 °F winter.']),
        ('General notes', 'list', disc_notes(ctx, 'mechanical', ['Equipment efficiency at least the IECC 2021 / DOE minimum for climate zone 2A.', 'Ducts sealed and tested per IECC R403.3; insulated R-8 in unconditioned attics.',
                                                                 'Condensate to an approved location; secondary drain pans in attics.', 'Commercial: economizers where required by IECC C403.5.']))])


def duct_run(c, x, y, pts, X, Y, k):
    """supply trunk from a unit along the long spread of its diffusers, single-line branches to each (schematic)"""
    if not pts:
        return
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    horiz = (max(xs) - min(xs)) >= (max(ys) - min(ys))
    c.setStrokeColorRGB(*K.CYAN)
    w = 1.6 * k  # ~20" trunk
    if horiz:
        a, b = min(xs + [x]), max(xs + [x])
        c.setLineWidth(0.5)
        c.line(X(a), Y(y) - w / 2, X(b), Y(y) - w / 2)
        c.line(X(a), Y(y) + w / 2, X(b), Y(y) + w / 2)
        c.setLineWidth(0.6)
        for px, py in pts:
            c.line(X(px), Y(y) + (w / 2 if py > y else -w / 2), X(px), Y(py))
    else:
        a, b = min(ys + [y]), max(ys + [y])
        c.setLineWidth(0.5)
        c.line(X(x) - w / 2, Y(a), X(x) - w / 2, Y(b))
        c.line(X(x) + w / 2, Y(a), X(x) + w / 2, Y(b))
        c.setLineWidth(0.6)
        for px, py in pts:
            c.line(X(x) + (w / 2 if px > x else -w / 2), Y(py), X(px), Y(py))


def m_hvac(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        for r in d['rooms']:
            if r['floor'] != f:
                continue
            for x, y in RU.diffusers(t, r):
                c.setStrokeColorRGB(*K.CYAN)
                c.setLineWidth(0.7)
                s = max(4, 1.6 * k)
                c.rect(X(x) - s / 2, Y(y) - s / 2, s, s, stroke=1, fill=0)
                c.line(X(x) - s / 2, Y(y) - s / 2, X(x) + s / 2, Y(y) + s / 2)
                c.line(X(x) - s / 2, Y(y) + s / 2, X(x) + s / 2, Y(y) - s / 2)
        systems = [s for s in RU.hvac_systems(t, d) if f in s['floors']]
        for i, s in enumerate(systems if is_res(t) else []):
            if is_res(t):
                spot = next((r for r in d['rooms'] if r['floor'] == f and r['type'] in ('mechanical', 'laundry', 'hall', 'closet')), d['rooms'][0])
                sym_box(c, X(spot['x'] + spot['w'] / 2), Y(spot['y'] + spot['d'] / 2), max(10, 3 * k), K.CYAN, 'AHU', True)
                sym_box(c, X(t['W']) + 14 + i * 16, Y(t['D'] * 0.7), max(10, 3 * k), K.CYAN, 'CU')
        if not is_res(t):
            rooms = {r['id']: r for r in d['rooms']}
            for s_, x, y in RU.rtu_spots(t, d):
                if not (f in s_['floors'] or f == max(floors_of(d))):
                    continue
                served = [rooms[s_['room']]] if s_.get('room') in rooms else [r for r in d['rooms'] if r['floor'] == f and RU.diffusers(t, r)]
                duct_run(c, x, y, [p for r in served for p in RU.diffusers(t, r)], X, Y, k)
                # unit on the roof above: dashed footprint about 4.5 x 7.5 ft (larger units grow), tag beside it
                uw, ud = (4.5, 7.5) if s_['tons'] <= 6 else (7.5, 12)
                c.setStrokeColorRGB(*K.CYAN)
                c.setFillColorRGB(1, 1, 1)
                c.setLineWidth(0.9)
                c.setDash(3, 2)
                c.rect(X(x - ud / 2), Y(y - uw / 2), ud * k, uw * k, stroke=1, fill=1)
                c.setDash()
                c.setFillColorRGB(*K.CYAN)
                c.rect(X(x) - 2.2, Y(y) - 2.2, 4.4, 4.4, stroke=0, fill=1)
                DR.tag(c, X(x + ud / 2) + 9, Y(y + uw / 2) + 7, s_['tag'], shape='square', size=5.5, color=K.CYAN)
                c.setFont(F, 4.5)
                c.setFillColorRGB(*K.CYAN)
                c.drawString(X(x + ud / 2) + 2, Y(y - uw / 2) - 5, '%s T ABOVE ON CURB' % s_['tons'])

    ex = lambda t, d: [('table', 'Systems', (['Tag', 'Tons', 'SF'], [[s['tag'], str(s['tons']), '{:,}'.format(s['area'])] for s in RU.hvac_systems(t, d)], [1, 0.5, 0.6], (1, 2)))]
    per_type(c, ctx, sh, ov, [('sq', K.CYAN, 'Supply diffuser'), ('fill', K.CYAN, 'Air handler / rooftop unit'), ('sq', K.CYAN, 'Condensing unit (outside)'),
                                 ('line', K.CYAN, 'Supply duct (schematic)')], ex,
             notes=['Rooftop units sit on factory curbs on the roof above; dashed outline is the unit footprint. Return through a ceiling plenum grille at each unit.',
                    'Tenant ductwork beyond the main trunk by tenant unless noted.'] if not is_res(type_and_design(ctx, sh)[0]) else ())


# ---------- plumbing ----------
FIX_COL = K.GREEN


def p_notes(c, ctx, sh):
    rows = []
    for code, (name, sp, spub, dp, dpub) in RU.FIX.items():
        rows.append([code, name, '%s / %s' % (sp, spub), '%s / %s' % (dp, dpub)])
    tot = []
    for t in ctx.types.values():
        pt = RU.plumbing_totals(t, t['design'])
        tot.append(['Type ' + t['id'], ', '.join('%d %s' % (n, k_) for k_, n in sorted(pt['counts'].items())), '%s' % pt['wsfu'], '%s' % pt['dfu'], pt['service'], pt['sewer']])
    notes_sheet(c, ctx, sh, 'plumbing', [
        ('Fixture totals by type', 'table', (['Type', 'Fixtures', 'WSFU', 'DFU', 'Water', 'Sewer'], tot, [0.5, 2, 0.5, 0.5, 0.5, 0.5])),
        ('Fixture units (private / public)', 'table', (['Code', 'Fixture', 'WSFU', 'DFU'], rows, [0.5, 1.6, 0.8, 0.8])),
        ('General notes', 'list', disc_notes(ctx, 'plumbing', ['Plumbing per the IPC 2021 (commercial) or IRC Part VII (dwellings) as adopted.', 'Water: PEX or Type L copper; waste and vent: PVC DWV Schedule 40.',
                                                              'Water heaters: T&P relief to an approved location; gas units vented per IFGC.', 'Food service: grease interceptor sized per IPC 1003 and the local pretreatment program.',
                                                              'Backflow prevention on the domestic, irrigation and fire services as the water provider requires.']))])


def p_plan(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        for r in d['rooms']:
            if r['floor'] != f:
                continue
            spots = RU.fixture_spots(r, RU.fixtures_for(t, r))
            for code, x, y in spots:
                sym_circle(c, X(x), Y(y), max(3.5, min(0.9 * k, 6)), FIX_COL, text=code[:2])
            if spots:
                c.setStrokeColorRGB(*FIX_COL)
                c.setLineWidth(0.6)
                c.setDash([3, 2])
                x0, y0 = spots[0][1], spots[0][2]
                c.line(X(x0), Y(y0), X(x0), Y(-3) if f == 1 else Y(y0))
                c.setDash()
        if f == 1:
            wh = (d.get('systems') or {}).get('water_heater', 'tank_gas')
            spot = next((r for r in d['rooms'] if r['floor'] == 1 and r['type'] in ('garage', 'mechanical', 'laundry', 'janitor', 'storage')), d['rooms'][0])
            sym_box(c, X(spot['x'] + 2), Y(spot['y'] + spot['d'] - 2), max(10, 2.6 * k), FIX_COL, 'WH', True)
            K.label(c, X(t['W'] / 2), Y(-6), 'BUILDING SEWER AND WATER SERVICE TO SITE UTILITIES (SEE C-301)', 5.5, FB, FIX_COL, halo=False)

    def ex(t, d):
        pt = RU.plumbing_totals(t, d)
        rows = [[k_, RU.FIX[k_][0], str(n)] for k_, n in sorted(pt['counts'].items())]
        out = [('table', 'Fixtures', (['Code', 'Fixture', 'Qty'], rows, [0.5, 2, 0.4], (2,))),
               ('table', 'Services', (None, [['Supply fixture units', str(pt['wsfu'])], ['Drainage fixture units', str(pt['dfu'])], ['Water service', pt['service']], ['Building sewer', pt['sewer']],
                                             ['Water heater', ((d.get('systems') or {}).get('water_heater') or 'tank_gas').replace('_', ' ')]], [1.4, 1], (1,)))]
        if not is_res(t):
            occ = sum(RU.occupant_load(r) for r in d['rooms'])
            req = RU.required_fixtures(t, occ)
            out.append(('table', 'Required fixtures (IPC 2902.1, occupant load %d)' % occ, (None, [['Water closets', str(req['wc'])], ['Lavatories', str(req['lav'])], ['Drinking fountains', str(req['df'])], ['Service sink', str(req['service_sink'])]], [1.4, 1], (1,))))
        return out

    per_type(c, ctx, sh, ov, [('dot', FIX_COL, 'Plumbing fixture (code per P-001)'), ('fill', FIX_COL, 'Water heater'), ('dash', FIX_COL, 'Waste line to building sewer')], ex)


HOT = ('LAV', 'KS', 'DW', 'CW', 'MS', 'TCS', 'HS', 'BS', 'SHR', 'TUB')


def p_riser(c, ctx, sh):
    """one waste-and-vent riser with its water riser per building type (at most three), each restroom / fixture
    group a branch; fixture schedule and pipe-size basis in the side column"""
    from .sheets_arch import SIDE_W
    ax, ay, aw, ah = K.AREA
    types = list(ctx.types.values())[:3]
    nbr = sum(len([r for r in t['design']['rooms'] if RU.fixtures_for(t, r)]) for t in types)
    band = min(820, (ah - 110 - 12 * nbr) / max(1, len(types)))
    dw = aw - SIDE_W - 50
    sched = {}
    branch_rows = []
    for ti, t in enumerate(types):
        d = t['design']
        pub = not is_res(t)
        pt = RU.plumbing_totals(t, d)
        for code, n in pt['counts'].items():
            row = sched.setdefault(code, [0, RU.FIX[code][2 if pub else 1], RU.FIX[code][4 if pub else 3]])
            row[0] += n * t.get('count', 1)
        groups = [(r, RU.fixtures_for(t, r)) for r in d['rooms'] if RU.fixtures_for(t, r)]
        top_y = ay + ah - 20 - ti * band
        y0 = top_y - band + 90          # building drain
        hgt = band - 130                 # drain to roof line
        x0, x1 = ax + 50, ax + dw
        n = max(1, len(groups))
        step = min(260, (x1 - x0 - 150) / n)
        wy = y0 + hgt * 0.50             # cold water main
        hy = wy + 16                     # hot water main
        roof = y0 + hgt
        # roof line
        c.setStrokeColorRGB(*K.GREY)
        c.setLineWidth(0.5)
        c.setDash([6, 3])
        c.line(x0, roof, x0 + 150 + n * step, roof)
        c.setDash()
        K.label(c, x0 + 2, roof + 4, 'ROOF', 5.5, F, K.GREY, center=False)
        # building drain and water service
        c.setStrokeColorRGB(*K.GREEN)
        c.setLineWidth(2.4)
        c.line(x0, y0, x0 + 110 + n * step, y0)
        c.setStrokeColorRGB(*K.BLUE)
        c.setLineWidth(1.6)
        c.line(x0 + 26, wy, x0 + 110 + n * step, wy)
        K.label(c, x0, y0 - 14, '%s BUILDING SEWER TO SITE (C-301)' % pt['sewer'], 6.5, FB, K.GREEN, center=False)
        K.label(c, x0 + 26, wy - 12, '%s WATER SERVICE' % pt['service'], 6.5, FB, K.BLUE, center=False)
        DR.tag(c, x0 + 12, wy, 'BFP', 'square', 5.5, K.BLUE)
        DR.tag(c, x0 + 4, y0, 'CO', 'circle', 5, K.GREEN)
        wh = (d.get('systems') or {}).get('water_heater', 'tank_gas')
        hot = wh != 'none' and any(code in HOT for _, fx in groups for code in fx)
        if hot:
            hx = x0 + 70
            c.setStrokeColorRGB(*K.RED)
            c.setFillColorRGB(1, 1, 1)
            c.setLineWidth(0.8)
            c.rect(hx - 13, wy + 24, 26, 30, stroke=1, fill=1)
            K.label(c, hx, wy + 36, 'WH', 6.5, FB, K.RED, halo=False)
            K.label(c, hx, wy + 58, wh.replace('_', ' ').upper(), 5, F, K.RED)
            c.setStrokeColorRGB(*K.BLUE)
            c.line(hx - 6, wy, hx - 6, wy + 24)
            c.setStrokeColorRGB(*K.RED)
            c.setDash([3, 2])
            c.line(hx + 6, wy + 24, hx + 6, hy)
            c.line(hx + 6, hy, x0 + 110 + n * step, hy)
            c.setDash()
        for gi, (r, fx) in enumerate(groups):
            gx = x0 + 130 + gi * step
            fx = fx[:6]
            fys = [y0 + 14 + (wy - 8 - y0 - 14) * (j + 0.5) / len(fx) for j in range(len(fx))] if fx else []
            ftop = max(fys) if fys else y0 + 20
            c.setStrokeColorRGB(*K.GREEN)
            c.setLineWidth(1.4)
            c.line(gx, y0, gx, ftop)        # waste stack
            c.setLineWidth(0.9)
            c.setDash([4, 2])
            c.line(gx, ftop, gx, roof + 14)  # vent through the roof
            c.setDash()
            K.label(c, gx, roof + 20, 'VTR', 5.5, FB, K.GREEN)
            arm = min(54, step * 0.5)
            for j, code in enumerate(fx):
                fy = fys[j]
                c.setStrokeColorRGB(*K.GREEN)
                c.setLineWidth(0.8)
                c.line(gx, fy, gx + arm, fy)
                DR.tag(c, gx + arm + 9, fy, code, 'circle', 5, K.GREEN)
                c.setStrokeColorRGB(*K.BLUE)
                c.setLineWidth(0.6)
                c.line(gx + arm + 3, wy, gx + arm + 3, fy + 5)
                if hot and code in HOT:
                    c.setStrokeColorRGB(*K.RED)
                    c.setDash([2, 1.5])
                    c.line(gx + arm + 15, hy, gx + arm + 15, fy + 5)
                    c.setDash()
            K.label(c, gx + arm / 2, y0 - 26, r['name'].upper(), 6, FB)
            branch_rows.append(['Type ' + t['id'], r['name']] + branch_sizes(fx, pub, hot))
            DR.tag(c, gx - 9, y0 + 7, 'CO', 'circle', 4.4, K.GREEN)
        K.view_title(c, ax + 10, y0 - 52, ti + 1, 'Waste, vent and water riser — Type %s' % t['id'], 'N.T.S.',
                     sub='%s WSFU · %s DFU · %s' % (pt['wsfu'], pt['dfu'], t['label']))
    if branch_rows:
        ty = ay + ah - 20 - len(types) * band - 30
        K.heading(c, ax + 10, ty, dw - 10, 'BRANCH PIPE SIZES (BASIS OF DESIGN)')
        K.table(c, ax + 10, ty - 16, dw - 10, branch_rows, head=['Type', 'Room', 'Fixtures', 'DFU', 'Waste', 'Vent', 'Cold', 'Hot'],
                cols=[0.6, 1.4, 1.8, 0.5, 0.6, 0.6, 0.6, 0.6], size=7.5, min_y=ay + 10)
    rows = [[code, RU.FIX[code][0], str(v[0]), fmt_u(v[1]), fmt_u(v[2])] for code, v in sorted(sched.items())]
    blocks = [('table', 'Fixture schedule (all buildings)', (['Tag', 'Fixture', 'No.', 'WSFU', 'DFU'], rows, [0.45, 1.6, 0.4, 0.5, 0.5], (2, 3, 4))),
              ('legend', 'Legend', [('line', K.GREEN, 'Waste (solid) / vent (dashed)'), ('line', K.BLUE, 'Cold water'), ('dash', K.RED, 'Hot water'),
                                    ('dot', K.GREEN, 'CO cleanout · VTR vent through roof · BFP backflow preventer')]),
              ('notes', 'Notes', [BASIS, 'One branch per restroom or fixture group; cleanouts at the base of each stack and at the building exit.',
                                  'Fixture units: IPC Table E103.3(2) supply, Table 709.1 drainage. Pipe sizes by the engineer from the fixture units.',
                                  'Backflow preventer as the water provider requires; water heater relief valve piped to an approved location.'])]
    side_column(c, blocks)


def branch_sizes(fx, pub, hot):
    """[fixtures, DFU, waste, vent, cold, hot] for one branch: IPC Table 710.1(2) horizontal branches (3" minimum
    with a water closet), vent half the drain but at least 1-1/2", supply by fixture units"""
    dfu = sum(RU.FIX[f][4 if pub else 3] for f in fx)
    wsfu = sum(RU.FIX[f][2 if pub else 1] for f in fx)
    hfu = sum(RU.FIX[f][2 if pub else 1] * 0.75 for f in fx if f in HOT)
    waste = '1-1/2"' if dfu <= 3 else '2"' if dfu <= 6 else '2-1/2"' if dfu <= 12 else '3"' if dfu <= 20 else '4"'
    if 'WC' in fx and waste in ('1-1/2"', '2"', '2-1/2"'):
        waste = '3"'
    vent = '1-1/2"' if dfu <= 8 else '2"' if dfu <= 24 else '3"'
    sup = lambda u: '1/2"' if u <= 3 else '3/4"' if u <= 6 else '1"' if u <= 14 else '1-1/4"'
    counts = {}
    for f in fx:
        counts[f] = counts.get(f, 0) + 1
    names = ', '.join(('%d %s' % (n, f)) if n > 1 else f for f, n in counts.items())
    return [names, fmt_u(dfu), waste, vent, sup(wsfu), sup(hfu) if hot and hfu else '—']


def fmt_u(v):
    return ('%g' % v) if v else '—'


# ---------- electrical ----------
EC = K.ORANGE


def e_notes(c, ctx, sh):
    rows = []
    for t in ctx.types.values():
        amps, volts, kva = RU.service_size(t, t['design'])
        rows.append(['Type ' + t['id'], '%d A' % amps, volts, '%s kVA' % kva])
    notes_sheet(c, ctx, sh, 'electrical', [
        ('Service sizes (estimated)', 'table', (['Type', 'Service', 'Voltage', 'Est. load'], rows, [0.6, 0.6, 1.4, 0.7])),
        ('Symbols', 'bullets', ['Ø  duplex receptacle (GFCI where required)', '○  ceiling light / can / troffer', 'SA  smoke alarm (IRC R314) · CO  carbon monoxide alarm (IRC R315)', '▮  panelboard', 'SD  smoke detector (commercial)']),
        ('General notes', 'list', disc_notes(ctx, 'electrical', ['Work per the NEC (NFPA 70) as adopted and the utility\'s service rules.', 'GFCI and AFCI protection per NEC 210.8 and 210.12.',
                                                                'Lighting power and controls per IECC 2021.', 'Service location and transformer by the electric provider; coordinate early.']))])


def e_plan(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        for r in d['rooms']:
            if r['floor'] != f:
                continue
            for x, y in RU.receptacles(t, r):
                c.setStrokeColorRGB(*EC)
                c.setLineWidth(0.6)
                rr = max(2, min(0.45 * k, 3))
                c.circle(X(x), Y(y), rr, stroke=1, fill=0)
                c.line(X(x) - rr, Y(y), X(x) + rr, Y(y))
            for x, y, kind in RU.lights(t, r):
                c.setStrokeColorRGB(*EC)
                if kind == 'troffer':
                    c.rect(X(x) - 1 * k, Y(y) - 2 * k, 2 * k, 4 * k, stroke=1, fill=0)
                elif kind == 'strip':
                    c.rect(X(x) - 2 * k, Y(y) - 0.25 * k, 4 * k, 0.5 * k, stroke=1, fill=0)
                else:
                    c.circle(X(x), Y(y), max(2, min((2.0 if kind == 'highbay' else 0.5) * k, 6 if kind == 'highbay' else 3.5)), stroke=1, fill=0)
            if r['type'] == 'restroom':
                sym_box(c, X(r['x'] + r['w'] - 1.5), Y(r['y'] + r['d'] - 1.5), max(7, 1.4 * k), EC, 'EF')
            if r['type'] == 'tenant':  # a shell bay: the tenant's panel and a J-box; lighting by the tenant
                sym_box(c, X(r['x'] + 2), Y(r['y'] + r['d'] - 2), max(9, 2 * k), EC, 'TP', True)
                sym_circle(c, X(r['x'] + r['w'] / 2), Y(r['y'] + r['d'] / 2), max(4, 0.9 * k), EC, text='J')
                K.label(c, X(r['x'] + r['w'] / 2), Y(r['y'] + r['d'] / 2) - max(4, 0.9 * k) - 7, 'TENANT LIGHTING AND POWER BY TENANT', max(4.5, min(6, k * 0.7)), F, EC, halo=False)
        for fl, x, y, kind in RU.alarms(t, d):
            if fl == f:
                sym_circle(c, X(x), Y(y), 5, K.RED, text=kind)
        if f == 1:
            p = RU.panel_spot(t, d)
            tenants = [r for r in d['rooms'] if r['type'] == 'tenant']
            if len(tenants) >= 2:
                # in a corner of the room, clear of its name; the one-line (E-601) has the meters and panels
                s_ = max(12, 2.6 * k)
                sym_box(c, X(p['x'] + p['w']) - s_ / 2 - 3, Y(p['y']) + s_ / 2 + 3, s_, EC, 'MC', True)
            else:
                sym_box(c, X(p['x'] + 1.5), Y(p['y'] + p['d'] / 2), max(9, 2 * k), EC, 'P', True)
            if not is_res(t):  # exit signs and emergency lights at the exits, wall packs outside them
                for x, y, side in RU.exits(t, d):
                    ox, oy = {'front': (0, 2), 'back': (0, -2), 'left': (2, 0), 'right': (-2, 0)}[side]
                    sym_box(c, X(x + ox), Y(y + oy), max(7, 1.5 * k), K.RED, 'EX')
                    wx, wy = {'front': (0, -1.2), 'back': (0, 1.2), 'left': (-1.2, 0), 'right': (1.2, 0)}[side]
                    c.setFillColorRGB(*EC)
                    c.rect(X(x + wx) - 2.5, Y(y + wy) - 2.5, 5, 5, stroke=0, fill=1)

    def ex(t, d):
        amps, volts, kva = RU.service_size(t, d)
        return [('table', 'Service', (None, [['Service', '%d A, %s' % (amps, volts)], ['Estimated load', '%s kVA' % kva], ['Panel', 'In %s' % RU.panel_spot(t, d)['name']]], [0.8, 2], ()))]

    per_type(c, ctx, sh, ov, [('dot', EC, 'Receptacle (about every 12 ft in dwellings)'), ('dot', EC, 'Light fixture / strip / troffer'), ('dot', K.RED, 'Smoke / CO alarm'),
                              ('fill', EC, 'P panel · TP tenant panel · MC meter center'), ('sq', EC, 'EF exhaust fan · J junction box'), ('sq', K.RED, 'EX exit sign with emergency lights'),
                              ('fill', EC, 'Wall pack over each exterior door')], ex,
             ['Shell bays get a tenant panel, a J-box and a meter; lighting, receptacles and controls are designed with each tenant\'s build-out.'] if any(r['type'] == 'tenant' for r in ctx.types[sh['type']]['design']['rooms']) else [])


def e_oneline(c, ctx, sh):
    """the service one-line: utility transformer, main disconnect, meters (a meter center for multi-tenant
    buildings) and each panel with its estimated size"""
    from .sheets_arch import SIDE_W
    ax, ay, aw, ah = K.AREA
    types = list(ctx.types.values())
    rows = []
    dw = aw - SIDE_W - 60
    sc = max(1.0, min(1.7, ah * 0.55 / 370))   # the diagram is laid out at a base size, then enlarged to fill the sheet
    X0, Y0 = ax + 20, ay + ah - 20
    c.saveState()
    c.translate(X0, Y0)
    c.scale(sc, sc)
    c.translate(-X0, -Y0)
    dwl = dw / sc
    cx = ax + 20 + dwl * 0.5
    yT = ay + ah - 70
    sym_box(c, cx, yT, 54, K.INK, 'XFMR')
    K.label(c, cx + 40, yT, 'UTILITY PAD-MOUNT TRANSFORMER (BY THE ELECTRIC PROVIDER)', 7.5, FB, center=False)
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(1.6)
    n = len(types)
    colw = (dwl - 40) / max(1, n)
    for i, t in enumerate(types):
        amps, volts, kva = RU.service_size(t, t['design'])
        tenants = [r for r in t['design']['rooms'] if r['type'] == 'tenant']
        x = ax + 40 + colw * (i + 0.5)
        c.line(cx, yT - 27, cx, yT - 60)
        c.line(cx, yT - 60, x, yT - 60)
        c.line(x, yT - 60, x, yT - 100)
        sym_box(c, x, yT - 118, 36, K.INK, '%dA' % amps)
        K.label(c, x + 24, yT - 118, 'MAIN DISCONNECT / CT CABINET, %s' % volts, 6.5, F, center=False)
        c.line(x, yT - 136, x, yT - 170)
        if len(tenants) >= 2:
            mw = min(colw - 40, 60 + 46 * (len(tenants) + 1))
            c.setLineWidth(1.0)
            c.rect(x - mw / 2, yT - 230, mw, 60, stroke=1, fill=0)
            K.label(c, x, yT - 182, 'METER CENTER: %d TENANT + 1 HOUSE METER' % len(tenants), 7, FB)
            # house panel: non-tenant rooms at ~3 VA/sf, site lighting ~4 kVA, fire alarm ~1 kVA, common rooftop units ~1.5 kVA/ton
            common_tons = sum(s_['tons'] for s_ in RU.hvac_systems(t, t['design']) if not s_.get('room') or s_['room'] not in {r['id'] for r in tenants})
            hva = 3 * sum(room_area(r) for r in t['design']['rooms'] if r['type'] != 'tenant') + 5000 + 1500 * common_tons
            ha = hva / 208 / 1.732 * 1.25
            panels = [('HP', 'House panel', 'Site / exterior lighting, fire alarm, common areas (about %.0f kVA)' % (hva / 1000),
                       next(s_ for s_ in (60, 100, 125, 150, 200, 225, 400) if s_ >= ha))]
            for j, r in enumerate(tenants):
                va = room_area(r) * 14  # about 14 VA/sf for retail shells, finished by the tenant
                a_ = va / 208 / 1.732 * 1.25
                size = next(s_ for s_ in (100, 125, 150, 200, 225, 400, 600) if s_ >= a_)
                panels.append(('TP-%d' % (j + 1), r['name'], '%s sf · about %.0f kVA' % ('{:,}'.format(int(room_area(r))), va / 1000), size))
            for j, (tag_, name, what, size) in enumerate(panels):
                px = x - mw / 2 + 30 + j * (mw - 60) / max(1, len(panels) - 1)
                sym_circle(c, px, yT - 210, 9, K.INK, text='M')
                c.setLineWidth(1.0)
                c.line(px, yT - 219, px, yT - 280)
                sym_box(c, px, yT - 298, 30, K.INK, tag_)
                c.setFont(F, 6)
                c.setFillColorRGB(*K.INK)
                c.drawCentredString(px, yT - 324, '%dA' % size)
                rows.append(['Type %s' % t['id'], tag_, name, what, '%dA, 120/208 V 3 ph' % size])
        else:
            sym_circle(c, x, yT - 182, 12, K.INK, text='M')
            c.line(x, yT - 194, x, yT - 240)
            sym_box(c, x, yT - 260, 40, K.INK, 'P')
            rows.append(['Type %s' % t['id'], 'P', t['label'], '%s kVA est.' % kva, '%dA, %s' % (amps, volts)])
        K.label(c, x, yT - 350, 'TYPE %s — %s × %d' % (t['id'], t['label'].upper()[:36], t['count']), 7, FB)
    c.restoreState()
    c.setLineWidth(1.0)
    yb = Y0 - 400 * sc
    K.view_title(c, ax + 10, yb, 1, 'Electrical one-line diagram', 'N.T.S.')
    y = K.heading(c, ax + 10, yb - 50, dw, 'Panel and feeder summary (estimated)')
    K.table(c, ax + 10, y, dw, rows[:24], head=['Building', 'Panel', 'Serves', 'Basis', 'Size'], cols=[0.6, 0.5, 1.4, 2.4, 1.2], size=8, min_y=ay)
    side_column(c, [('notes', 'Notes', [BASIS, 'Each tenant is separately metered with its own panel; the house panel serves site lighting, the fire alarm and common areas.',
                                        'Tenant panels sized at about 14 VA/sf of shell with 25 % margin; the tenant\'s engineer confirms with the build-out.',
                                        'Fault current, feeder and conduit sizes, grounding and panel schedules by the engineer of record.',
                                        'Transformer location, clearances and metering per the electric provider\'s standards.'])])


# ---------- fire ----------
def fp_sprinkler(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        for r in d['rooms']:
            if r['floor'] != f:
                continue
            pts, _ = RU.sprinkler_heads(t, r)
            for x, y in pts:
                sym_circle(c, X(x), Y(y), max(2.2, 0.5 * k), K.RED, fill=True)
        if f == 1:
            K.label(c, X(1), Y(-5), 'FIRE RISER / FDC (SEE FP-101)', 6, FB, K.RED, center=False, halo=False)

    def ex(t, d):
        hz = {}
        for r in d['rooms']:
            pts, name = RU.sprinkler_heads(t, r)
            hz[name] = hz.get(name, 0) + len(pts)
        return [('table', 'Heads by hazard', (['Hazard (NFPA 13)', 'Heads'], [[k_, str(v)] for k_, v in hz.items()], [2, 0.6], (1,)))]

    per_type(c, ctx, sh, ov, [('dot', K.RED, 'Sprinkler head (grid by hazard)')], ex, ['NFPA 13 (commercial) / 13R / 13D as applicable; hydraulic calculations and shop drawings by a licensed fire sprinkler contractor (Texas RME).'])


def fa_plan(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        for fl, x, y, kind in RU.alarms(t, d):
            if fl == f:
                sym_circle(c, X(x), Y(y), 5, K.RED, text=kind)
        for r in d['rooms']:
            if r['floor'] == f and room_area(r) > 150 or r['type'] == 'restroom':
                if r['floor'] == f:
                    sym_box(c, X(r['x'] + 1.2), Y(r['y'] + r['d'] / 2), 8, K.RED, 'HS')
        for x, y, side in RU.exits(t, d):
            sym_box(c, X(x) + 8, Y(y) + 8, 8, K.RED, 'F', True)
        if f == 1:
            p = RU.panel_spot(t, d)
            sym_box(c, X(p['x'] + 3), Y(p['y'] + 2), 12, K.RED, 'FACP', True)

    per_type(c, ctx, sh, ov, [('sq', K.RED, 'HS horn / strobe'), ('fill', K.RED, 'F manual pull station at each exit'), ('dot', K.RED, 'SD smoke detector'), ('fill', K.RED, 'FACP fire alarm control panel')], None,
             ['NFPA 72 and IFC 907; device layout, candela ratings and battery calcs by a licensed fire alarm contractor.'])


def ls_plan(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        for r in d['rooms']:
            if r['floor'] != f:
                continue
            ol_ = RU.occupant_load(r)
            if ol_:
                K.label(c, X(r['x'] + r['w'] / 2), Y(r['y'] + 1.5), 'OL %d' % ol_, max(5, min(7, k)), FB, K.MAGENTA)
        for x, y, side in RU.exits(t, d):
            c.setFillColorRGB(*K.GREEN)
            c.setStrokeColorRGB(*K.GREEN)
            K.draw_poly(c, [(X(x) - 6, Y(y) + 2), (X(x) + 6, Y(y) + 2), (X(x), Y(y) - 8)], stroke=K.GREEN, fill=K.GREEN)
            K.label(c, X(x), Y(y) - 16, 'EXIT', 6, FB, K.GREEN)

    def ex(t, d):
        occ = sum(RU.occupant_load(r) for r in d['rooms'])
        exits = len(RU.exits(t, d))
        need = 1 if occ <= 49 else 2 if occ <= 500 else 3 if occ <= 1000 else 4
        td = RU.travel_distance(t, d)
        lim = RU.travel_limit(t)
        return [('table', 'Egress summary', (None, [['Occupant load', str(occ)], ['Exits required (IBC 1006 / 1006.3)', str(need)], ['Exits provided', str(exits) + ('' if exits >= need else '  — ADD EXITS')],
                                                    ['Egress width required (0.2 in / occupant)', '%.0f in' % (occ * 0.2)], ['Longest travel (rectilinear, approx.)', '%s ft (limit %d ft)' % (td, lim)]], [1.8, 1], (1,)))]

    per_type(c, ctx, sh, ov, [('tri', K.GREEN, 'Exit'), ('fill', K.MAGENTA, 'OL occupant load (IBC Table 1004.5)')], ex, ['Occupant loads use IBC Table 1004.5 factors; final egress design by the architect.'])


# ---------- telecom ----------
def t_notes(c, ctx, sh):
    notes_sheet(c, ctx, sh, 'telecom', [('General notes', 'list', disc_notes(ctx, 'telecom', ['Fiber-to-the-home / premises by the selected provider; confirm the handoff and pathway standards.',
                                                                                              'Structured cabling to TIA-568 and TIA-569; Cat 6 to each outlet, home runs to the demarc / MDF.', 'Bond and ground per TIA-607 and NEC 800.']))])


def t_bldg(c, ctx, sh):
    def ov(c, t, d, f, X, Y, k):
        for r in d['rooms']:
            if r['floor'] == f and r['type'] in ('living', 'family', 'bedroom', 'primary_bedroom', 'office', 'flex', 'tenant', 'sales', 'reception', 'conference', 'break_room', 'exam', 'lobby'):
                K.draw_poly(c, [(X(r['x'] + 1) - 3, Y(r['y'] + 1)), (X(r['x'] + 1) + 3, Y(r['y'] + 1)), (X(r['x'] + 1), Y(r['y'] + 1) + 5)], stroke=K.MAGENTA, fill=K.MAGENTA)
        if f == 1:
            p = RU.panel_spot(t, d)
            sym_box(c, X(p['x'] + p['w'] - 2), Y(p['y'] + p['d'] / 2), 10, K.MAGENTA, 'D', True)

    per_type(c, ctx, sh, ov, [('tri', K.MAGENTA, 'Data outlet, (2) Cat 6'), ('fill', K.MAGENTA, 'D demarc / ONT / MDF')], None)


RENDERERS = {'s-notes': s_notes, 's-found': s_found, 's-frame': s_frame, 's-details': s_details, 'm-notes': m_notes, 'm-hvac': m_hvac, 'p-notes': p_notes, 'p-plan': p_plan,
             'p-riser': p_riser, 'e-notes': e_notes, 'e-plan': e_plan, 'e-oneline': e_oneline, 'fp-sprinkler': fp_sprinkler, 'fa-plan': fa_plan, 'ls-plan': ls_plan,
             't-notes': t_notes, 't-bldg': t_bldg}
