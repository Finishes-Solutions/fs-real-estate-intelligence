"""General sheets: G-001 cover, G-002 general notes, G-003 code analysis, A-9xx renderings and custom sheets."""
from . import kit as K
from . import rules as RU
from .kit import F, FB
from .setdef import SECTION_LABEL
from .design import is_res

GENERAL_NOTES = [
    'These drawings are a schematic design set for feasibility, pricing and consultant coordination. They are not construction documents and are not for construction, bidding or permit.',
    'Site geometry (boundary, buildings, drives, parking, detention) is from the conceptual site plan in this set. A boundary and topographic survey by a Texas RPLS is required before design.',
    'Building layouts are schematic and were generated with AI assistance, then checked by rule for fit, access, room sizes and egress. Final design is by the architect and engineers of record.',
    'Structural, mechanical, plumbing, electrical, fire protection and telecom sheets show a rule-based basis of design. Systems, sizes, loads and calculations must be designed and sealed by the engineer of record for each discipline.',
    'All dimensions are nominal, to face of stud or face of panel unless noted. Do not scale the drawings.',
    'A geotechnical investigation is required. Expansive clay soils are typical in southeast Texas; foundations shown assume a post-tensioned or conventionally reinforced slab on grade.',
    'Utilities, capacities and providers are unconfirmed: obtain service letters from the water, sewer, power, gas and telecom providers.',
    'Accessibility per the Texas Accessibility Standards (TAS 2012) and the 2010 ADA Standards; a TDLR registered accessibility specialist review is required for public buildings over $50,000.',
]
CODES = ['International Building Code 2021, as adopted by the authority having jurisdiction', 'International Residential Code 2021 (one- and two-family dwellings, townhouses)',
         'International Fire Code 2021 and local amendments', 'International Mechanical, Plumbing and Fuel Gas Codes 2021', 'National Electrical Code (NFPA 70), edition adopted locally',
         'International Energy Conservation Code 2021 (climate zone 2A)', 'NFPA 13 / 13D, NFPA 72', 'ASCE 7-22 Minimum Design Loads', 'Texas Accessibility Standards (TAS 2012)',
         'County / drainage district criteria manuals and floodplain regulations', 'TxDOT access management (driveways on state roads)']
ABBREV = ['A/C air conditioning', 'ADA Americans with Disabilities Act', 'AFF above finished floor', 'AHU air handling unit', 'BOC back of curb', 'CL centerline', 'CLG ceiling',
          'CMU concrete masonry unit', 'CO cleanout / carbon monoxide', 'CU condensing unit', 'DN down', 'EL elevation', 'EOR engineer of record', 'EXT exterior', 'FACP fire alarm control panel',
          'FDC fire department connection', 'FF finished floor', 'FFE finished floor elevation', 'GB grade beam', 'GFCI ground-fault circuit interrupter', 'GWB gypsum wallboard', 'HB hose bibb',
          'HH handhole', 'HWL high water level', 'INV invert', 'MH manhole', 'MPOE minimum point of entry', 'NIC not in contract', 'NTS not to scale', 'OC on center', 'OL occupant load',
          'PIV post indicator valve', 'PT post-tensioned', 'RCP reinforced concrete pipe', 'ROW right-of-way', 'RTU rooftop unit', 'SD storm drain / smoke detector', 'SS sanitary sewer',
          'TAS Texas Accessibility Standards', 'TYP typical', 'UE underground electric', 'UNO unless noted otherwise', 'W water', 'WC water closet', 'WH water heater', 'WP weatherproof']


def cover(c, ctx, sh):
    p = ctx.p
    pr = p['project']
    N = p.get('notes') or {}
    ax, ay, aw, ah = K.AREA
    colA, colB = aw * 0.42, aw * 0.27
    colC = aw - colA - colB - 40
    x = ax
    y = ay + ah
    c.setFillColorRGB(*K.INK)
    c.setFont(FB, 40)
    for ln in K.wrap(pr.get('name', 'Untitled project').upper(), FB, 40, colA)[:2]:
        y -= 42
        c.drawString(x, y, ln)
    y -= 22
    c.setFont(FB, 15)
    c.drawString(x, y, ('Schematic design set — ' + (pr.get('option') or 'Option')).upper())
    y -= 16
    sub = ' · '.join(v for v in [ctx.uses, pr.get('address'), pr.get('county'), ('%.2f acres' % ctx.site.acres) if ctx.site else None] if v)
    y = K.text_block(c, x, y, colA, sub, size=10, color=K.GREY)
    # key plan
    if ctx.site:
        from .sheets_site import View, base
        kh = y - (ay + 230)
        v = View(ctx.site, x, ay + 230, colA, kh - 20, pad=40)
        base(c, v, 'color', label_buildings=False)
        K.north_arrow(c, x + colA - 40, y - 40, ctx.site.north_on_sheet(), 56)
        c.setFont(FB, 9.5)
        c.drawString(x, ay + 214, 'SITE KEY PLAN')
        c.setFont(F, 8.5)
        c.drawString(x + 80, ay + 214, '· not to scale · see C-101')
    team = [['Owner / client', pr.get('client') or 'To be confirmed'], ['Development consultant', 'Finishes Solutions']] + \
           [[k, v] for k, v in (p.get('team') or {}).items()] + \
           [[k, 'To be engaged'] for k in ['Architect of record', 'Civil engineer', 'Structural engineer', 'MEP engineer', 'Surveyor', 'Geotechnical engineer'] if k not in (p.get('team') or {})]
    yt = K.heading(c, x, ay + 200, colA, 'Project team')
    K.table(c, x, yt, colA, team, cols=[1, 1.4], min_y=ay)
    # column B: data and the sheet index
    xb = ax + colA + 20
    yb = ay + ah
    if ctx.site:
        yb = K.heading(c, xb, yb, colB, 'Project data')
        yb = K.table(c, xb, yb, colB, ctx.site.land_use(), cols=[2, 1.2, 0.8], right=(1, 2))
        yb -= 10
        yb = K.heading(c, xb, yb, colB, 'Program & parking')
        yb = K.table(c, xb, yb, colB, ctx.site.program() + [[a, b, ''] for a, b in ctx.site.parking()], head=['Use', 'Size', 'Floors'], cols=[2, 1.4, 0.5], right=(1, 2))
        yb -= 10
    yb = K.heading(c, xb, yb, colB, 'Sheet index')
    sheets = ctx.sheets
    big = len(sheets) > 40
    groups = []
    for s in sheets:
        if s['section'] not in groups:
            groups.append(s['section'])
    if not big:
        for g in groups:
            c.setFillColorRGB(0.93, 0.94, 0.93)
            c.rect(xb, yb - 12, colB, 12, stroke=0, fill=1)
            c.setFillColorRGB(*K.INK)
            c.setFont(FB, 7.5)
            c.drawString(xb + 3, yb - 9, SECTION_LABEL.get(g, g).upper())
            yb -= 13
            for s in [s for s in sheets if s['section'] == g]:
                c.setFont(FB, 8)
                c.drawString(xb + 3, yb - 9, s['number'])
                c.setFont(F, 8)
                c.drawString(xb + 50, yb - 9, (s['title'] + (' — ' + s['sub'] if s['kind'] == 'render' else ''))[:70])
                yb -= 11
    else:
        lines = []
        for g in groups:
            lines.append(('h', SECTION_LABEL.get(g, g).upper()))
            lines += [('s', s) for s in sheets if s['section'] == g]
        half = (len(lines) + 1) // 2
        for col in range(2):
            yy = yb
            xx = xb + col * colB / 2
            for kind, v in lines[col * half:(col + 1) * half]:
                if kind == 'h':
                    c.setFont(FB, 6.5)
                    c.drawString(xx, yy - 8, v)
                else:
                    c.setFont(FB, 6.5)
                    c.drawString(xx, yy - 8, v['number'])
                    c.setFont(F, 6.5)
                    c.drawString(xx + 34, yy - 8, v['title'][:34])
                yy -= 8.6
    # column C: notes
    xc = ax + colA + colB + 40
    blocks = []
    if N.get('description'):
        blocks.append(('Project description', 'text', N['description']))
    blocks.append(('General notes', 'list', N.get('general_notes') or GENERAL_NOTES[:6]))
    blocks.append(('Applicable codes (basis of design)', 'bullets', N.get('codes') or CODES[:8]))
    if N.get('next_steps'):
        blocks.append(('Next steps', 'bullets', N['next_steps']))
    facts = list(p.get('facts') or [])[:10]
    if facts:
        blocks.append(('Site constraints & due diligence', 'bullets', facts))
    K.note_columns(c, blocks, 1, xc, ay + ah, colC, ah)


def g_notes(c, ctx, sh):
    N = ctx.p.get('notes') or {}
    gen = (N.get('general_notes') + GENERAL_NOTES[3:5]) if N.get('general_notes') else GENERAL_NOTES
    types = list(ctx.types.values())
    blocks = [('General notes', 'list', gen), ('Applicable codes (basis of design)', 'bullets', N.get('codes') or CODES)]
    if types:
        blocks.append(('Building types in this set', 'table', (['Type', 'Use', 'Size', 'No.'], [[t['id'], t['label'], "%s' × %s' · %d fl" % (t['W'], t['D'], t['floors']), str(t['count'])] for t in types], [0.4, 1.5, 1.3, 0.4])))
        blocks.append(('Code summary', 'table', (['Type', 'Occupancy', 'Construction', 'Sprinklers'], [[t['id'], t['occupancy'], t['construction'], 'Yes' if t['sprinklered'] else 'No'] for t in types], [0.4, 1, 1.4, 0.6])))
        if getattr(ctx, 'others', None):
            blocks.append(('Building sheets by others', 'bullets', ['Type %s — %s (%s\' × %s\', %d floors): site sheets only; building drawings by the architect of record.' % (t['id'], t['label'], t['W'], t['D'], t['floors']) for t in ctx.others]))
        blocks.append(('Sprinkler basis', 'bullets', sorted({t['id'] + ': ' + t['sprinkler_why'] for t in types})))
    blocks.append(('Symbols', 'bullets', ['North arrow: true north from the reference site plan', 'Circled number: view number on the sheet', 'Dash-dot heavy line: property line',
                                          'Dashed magenta: easement', 'Red: fire lanes, hydrants and fire protection', 'Blue: water; green: sanitary and storm; orange: electrical; cyan: HVAC',
                                          'Plumbing fixtures by code (WC, LAV, TUB, KS…) per P-001']))
    blocks.append(('Abbreviations', 'bullets', ABBREV))
    blocks.append(('Drawing conventions', 'bullets', ['Site plans: the street at the bottom; north as shown by each north arrow.', 'Building plans: the front (street side) at the bottom; left and right as seen from the street.',
                                                      'Sheet numbers follow the US National CAD Standard: discipline, sheet type, sequence.']))
    K.note_columns(c, blocks, 4)


def g_code(c, ctx, sh):
    blocks = []
    for t in [t for t in ctx.types.values() if not is_res(t)]:
        d = t['design']
        occ = sum(RU.occupant_load(r) for r in d['rooms'])
        allow = RU.allowable_area(t)
        req = RU.required_fixtures(t, occ)
        blocks.append(('Type %s — %s' % (t['id'], t['label']), 'table', (['Item', 'Value'], [
            ['Occupancy', t['occupancy']], ['Construction type', t['construction']], ['Stories / height', '%d / about %d ft' % (t['floors'], t['floors'] * t['floor_h'] + 4)],
            ['Building area', '{:,} sf'.format(t['building_gsf'])], ['Allowable area (IBC 506, approx.)', '{:,} sf'.format(allow) if allow else 'Verify'],
            ['Area check', ('OK' if allow and t['building_gsf'] <= allow else 'CHECK — exceeds tabular area; frontage increase, sprinklers or fire walls') if allow else 'Verify'],
            ['Sprinklers', ('Yes — ' if t['sprinklered'] else 'No — ') + t['sprinkler_why']], ['Occupant load (IBC 1004.5)', str(occ)],
            ['Exits required', str(1 if occ <= 49 else 2 if occ <= 500 else 3)], ['Max. travel distance', '%d ft' % RU.travel_limit(t)],
            ['Plumbing fixtures required', '%d WC, %d LAV, %d DF, %d service sink' % (req['wc'], req['lav'], req['df'], req['service_sink'])]], [1.1, 1.6])))
    blocks.append(('Notes', 'list', ['Values are a preliminary code analysis from the schematic design; the architect of record prepares the code analysis for permit.',
                                     'Allowable areas are IBC Table 506.2 values for the occupancy and construction type shown; frontage and sprinkler increases are not applied unless noted.']))
    K.note_columns(c, blocks, 3)


def render(c, ctx, sh):
    r = (ctx.p.get('renders') or [])[sh['render']]
    ax, ay, aw, ah = K.AREA
    try:
        from reportlab.lib.utils import ImageReader
        img = ImageReader(r['file'])
        iw, ih = img.getSize()
        bw, bh = aw, ah - 70
        s = min(bw / iw, bh / ih)
        c.setFillColorRGB(0.07, 0.07, 0.07)
        c.rect(ax, ay + 60, aw, ah - 60, stroke=0, fill=1)
        c.drawImage(img, ax + (aw - iw * s) / 2, ay + 60 + (bh - ih * s) / 2 + 5, iw * s, ih * s)
    except Exception as e:  # noqa: BLE001
        K.text_block(c, ax, ay + ah, aw, 'The rendering %s could not be read (%s).' % (r.get('file'), e), 12)
    K.view_title(c, ax, ay + 24, 1, 'Conceptual rendering' + (' — ' + r['caption'] if r.get('caption') else ''), sub='AI concept illustration: placement, shapes and heights follow the plan; materials, landscaping and surroundings are illustrative. Not a design.')


def custom(c, ctx, sh):
    x = sh['custom']
    K.note_columns(c, [(b['heading'], b.get('kind', 'list'), b['items'] if b.get('kind', 'list') != 'table' else (b.get('head'), b['rows'], b.get('cols'))) for b in x.get('blocks', [])], x.get('columns', 4))


RENDERERS = {'cover': cover, 'g-notes': g_notes, 'g-code': g_code, 'render': render, 'custom': custom}
