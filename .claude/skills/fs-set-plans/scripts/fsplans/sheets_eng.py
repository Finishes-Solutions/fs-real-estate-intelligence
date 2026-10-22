"""Engineering sheets: structural, mechanical, plumbing, electrical, fire sprinkler / alarm, life safety and telecom.
RULE-BASED SCHEMATIC LAYOUTS (a basis of design for pricing and consultant kickoff, not engineering), placed on a
light floor plan of each building type. Every sheet says so."""
import math
from . import kit as K
from . import rules as RU
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
        c.setFont(FB, max(4, r * 0.95))
        c.setFillColorRGB(*(K.INK if not fill else (1, 1, 1)))
        c.drawCentredString(x, y - r * 0.35, text)


def sym_box(c, x, y, s, col, text=None, fill=False):
    c.setStrokeColorRGB(*col)
    c.setFillColorRGB(*col)
    c.setLineWidth(0.7)
    c.rect(x - s / 2, y - s / 2, s, s, stroke=1, fill=1 if fill else 0)
    if text:
        c.setFont(FB, max(4, s * 0.45))
        c.setFillColorRGB(*((1, 1, 1) if fill else K.INK))
        c.drawCentredString(x, y - s * 0.17, text)


def notes_sheet(c, ctx, sh, key, blocks):
    crit = disc_criteria(ctx, key)
    head = [('Basis of design', 'text', BASIS)]
    if crit:
        head.append(('Design criteria', 'table', (['Item', 'Value'], crit, [1, 1.6])))
    K.note_columns(c, head + blocks, 4)


def per_type(c, ctx, sh, overlay, legend, extra=None, notes=()):
    t, d = type_and_design(ctx, sh)
    lab, ft = plan_views(c, ctx, t, d, overlay=lambda c_, f, X, Y, k: overlay(c_, t, d, f, X, Y, k), light=True)
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

    def beam(c, x, y, w, h):
        s = min(w, h) / 160
        c.setFillColorRGB(0.8, 0.8, 0.8)
        K.draw_poly(c, [(x + 20 * s, y + 100 * s), (x + 140 * s, y + 100 * s), (x + 140 * s, y + 95 * s), (x + 50 * s, y + 95 * s), (x + 50 * s, y + 30 * s), (x + 20 * s, y + 30 * s)], stroke=K.INK, fill=(0.8, 0.8, 0.8))
        c.setFillColorRGB(*K.INK)
        for xx, yy in ((26, 36), (44, 36), (26, 90), (44, 90)):
            c.circle(x + xx * s, y + yy * s, 2, stroke=0, fill=1)
        c.setFont(F, 6.5)
        c.drawString(x + 60 * s, y + 60 * s, 'PERIMETER GRADE BEAM, (2) #5 T&B, #3 STIRRUPS @ 24"')
        c.drawString(x + 60 * s, y + 104 * s, 'SLAB ON VAPOR RETARDER')

    def footing(c, x, y, w, h):
        s = min(w, h) / 160
        c.setFillColorRGB(0.8, 0.8, 0.8)
        c.rect(x + 40 * s, y + 30 * s, 80 * s, 24 * s, stroke=1, fill=1)
        c.setFillColorRGB(0.5, 0.5, 0.55)
        c.rect(x + 74 * s, y + 54 * s, 12 * s, 80 * s, stroke=1, fill=1)
        c.setFont(F, 6.5)
        c.setFillColorRGB(*K.INK)
        c.drawString(x + 90 * s, y + 100 * s, 'STEEL COLUMN, BASE PLATE, (4) ANCHOR RODS')
        c.drawString(x + 40 * s, y + 18 * s, 'SPREAD FOOTING SIZED BY THE ENGINEER')

    details_sheet(c, ctx, sh, [('Grade beam', beam), ('Column footing', footing)], ['Typical details for pricing; the engineer of record details and seals the structure.'] + disc_notes(ctx, 'structural', [])[:4])


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
        for i, s in enumerate(systems):
            if is_res(t):
                spot = next((r for r in d['rooms'] if r['floor'] == f and r['type'] in ('mechanical', 'laundry', 'hall', 'closet')), d['rooms'][0])
                sym_box(c, X(spot['x'] + spot['w'] / 2), Y(spot['y'] + spot['d'] / 2), max(10, 3 * k), K.CYAN, 'AHU', True)
                sym_box(c, X(t['W']) + 14 + i * 16, Y(t['D'] * 0.7), max(10, 3 * k), K.CYAN, 'CU')
            else:
                x = t['W'] * (i + 0.5) / len(systems)
                sym_box(c, X(x), Y(t['D'] * 0.6), max(14, 5 * k), K.CYAN, 'RTU', True)

    ex = lambda t, d: [('table', 'Systems', (['Tag', 'Tons', 'SF'], [[s['tag'], str(s['tons']), '{:,}'.format(s['area'])] for s in RU.hvac_systems(t, d)], [1, 0.5, 0.6], (1, 2)))]
    per_type(c, ctx, sh, ov, [('sq', K.CYAN, 'Supply diffuser'), ('fill', K.CYAN, 'Air handler / rooftop unit'), ('sq', K.CYAN, 'Condensing unit (outside)')], ex)


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


def p_riser(c, ctx, sh):
    ax, ay, aw, ah = K.AREA
    types = list(ctx.types.values())
    cw = aw / max(1, min(4, len(types)))
    for i, t in enumerate(types[:4]):
        x = ax + i * cw + 40
        y = ay + 120
        pt = RU.plumbing_totals(t, t['design'])
        H = 120 * t['floors']
        c.setStrokeColorRGB(*K.GREEN)
        c.setLineWidth(2)
        c.line(x + 40, y, x + 40, y + H + 60)
        c.setStrokeColorRGB(*K.BLUE)
        c.line(x + 140, y, x + 140, y + H)
        for f in range(t['floors']):
            yy = y + 60 + f * 120
            c.setStrokeColorRGB(*K.GREEN)
            c.line(x + 40, yy, x + 110, yy)
            c.setStrokeColorRGB(*K.BLUE)
            c.line(x + 140, yy + 30, x + 210, yy + 30)
            c.setFont(F, 7)
            c.setFillColorRGB(*K.INK)
            c.drawString(x + 115, yy - 3, 'LEVEL %d FIXTURES' % (f + 1))
        c.setFont(FB, 7)
        c.drawString(x + 44, y + H + 64, 'VTR (VENT THROUGH ROOF)')
        c.drawString(x + 44, y - 14, '%s BUILDING SEWER' % pt['sewer'])
        c.drawString(x + 144, y - 14, '%s WATER SERVICE' % pt['service'])
        K.view_title(c, ax + i * cw + 10, ay + 30, i + 1, 'Riser — Type %s' % t['id'], 'N.T.S.', sub='%s WSFU · %s DFU' % (pt['wsfu'], pt['dfu']))
    K.text_block(c, ax, ay + ah, aw * 0.6, BASIS + ' Diagrams show one riser per building type; the engineer sizes the drainage, vent and supply systems.', size=9)


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
                else:
                    c.circle(X(x), Y(y), max(2, min((2.0 if kind == 'highbay' else 0.5) * k, 6 if kind == 'highbay' else 3.5)), stroke=1, fill=0)
        for fl, x, y, kind in RU.alarms(t, d):
            if fl == f:
                sym_circle(c, X(x) + 8, Y(y) + 8, 5, K.RED, text=kind)
        if f == 1:
            p = RU.panel_spot(t, d)
            sym_box(c, X(p['x'] + 1.5), Y(p['y'] + p['d'] / 2), max(9, 2 * k), EC, 'P', True)

    def ex(t, d):
        amps, volts, kva = RU.service_size(t, d)
        return [('table', 'Service', (None, [['Service', '%d A, %s' % (amps, volts)], ['Estimated load', '%s kVA' % kva], ['Panel', 'In %s' % RU.panel_spot(t, d)['name']]], [0.8, 2], ()))]

    per_type(c, ctx, sh, ov, [('dot', EC, 'Receptacle (about every 12 ft in dwellings)'), ('dot', EC, 'Light fixture'), ('dot', K.RED, 'Smoke / CO alarm'), ('fill', EC, 'Panelboard')], ex)


def e_oneline(c, ctx, sh):
    ax, ay, aw, ah = K.AREA
    types = list(ctx.types.values())
    n = len(types)
    cw = (aw - 200) / max(1, n)
    x0 = ax + 100
    ytop = ay + ah - 140
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(1.4)
    sym_box(c, ax + aw / 2, ytop + 70, 40, K.INK, 'XFMR')
    c.line(ax + aw / 2, ytop + 50, ax + aw / 2, ytop)
    c.line(x0 + cw / 2, ytop, x0 + (n - 0.5) * cw, ytop)
    K.label(c, ax + aw / 2 + 30, ytop + 70, 'UTILITY TRANSFORMER (BY PROVIDER)', 7, FB, center=False)
    for i, t in enumerate(types):
        x = x0 + (i + 0.5) * cw
        amps, volts, kva = RU.service_size(t, t['design'])
        c.line(x, ytop, x, ytop - 60)
        sym_circle(c, x, ytop - 72, 12, K.INK, text='M')
        c.line(x, ytop - 84, x, ytop - 130)
        sym_box(c, x, ytop - 150, 40, K.INK, '%dA' % amps)
        c.setFont(F, 7)
        c.setFillColorRGB(*K.INK)
        c.drawCentredString(x, ytop - 185, 'TYPE %s — %s' % (t['id'], t['label'].upper()[:28]))
        c.drawCentredString(x, ytop - 196, '%s · %s kVA est.' % (volts, kva))
        c.drawCentredString(x, ytop - 207, '× %d building%s' % (t['count'], 's' if t['count'] > 1 else ''))
    K.view_title(c, ax + 10, ay + 30, 1, 'Electrical one-line diagram', 'N.T.S.')
    K.text_block(c, ax, ay + 300, aw * 0.5, BASIS + ' Each building has its own metered service; fault current, feeder sizes and panel schedules by the engineer.', size=9)


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
