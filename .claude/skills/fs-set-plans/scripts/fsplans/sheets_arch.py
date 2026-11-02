"""Architecture sheets per building type, drawn from the type's design: floor and roof plans, elevations, sections,
schedules, and the typical wall section. Plans are drawn with the front (street side) at the bottom. The shared
`plan_views` draws the light floor plan the engineering sheets put their layers on."""
import math
from . import kit as K
from .kit import F, FB
from .design import (is_res, outline, exterior_span, door_geometry, window_positions, rooms_by_id, floors_of, room_area, fmt)

SIDE_W = 470

FINISH = {'garage': ('Sealed concrete', '—', 'Gyp. bd., painted (5/8" Type X at house wall)', 'Gyp. bd., painted'),
          'bath': ('Ceramic tile', 'Tile', 'Moisture-resistant gyp. bd., painted', 'Gyp. bd., painted'),
          'half_bath': ('Ceramic tile', 'Tile', 'Gyp. bd., painted', 'Gyp. bd., painted'),
          'restroom': ('Porcelain tile', 'Tile cove', 'FRP to 4\', paint above', 'Lay-in ACT'),
          'commercial_kitchen': ('Quarry tile', 'Quarry cove', 'FRP full height', 'Washable vinyl-faced ACT'),
          'walk_in_cooler': ('Manufacturer\'s floor', '—', 'Insulated panel', 'Insulated panel'),
          'warehouse': ('Sealed concrete', 'Rubber', 'Exposed / painted', 'Exposed structure'),
          'tenant': ('Sealed concrete (by tenant)', '—', 'Gyp. bd., taped (by tenant)', 'Open (by tenant)'),
          'porch': ('Broom-finish concrete', '—', 'Exterior finish', 'Fiber-cement soffit'),
          'mechanical': ('Sealed concrete', 'Rubber', 'Gyp. bd., painted', 'Exposed'), 'electrical': ('Sealed concrete', 'Rubber', 'Gyp. bd., painted', 'Exposed')}
FINISH_RES = ('LVP', 'Painted wood', 'Gyp. bd., painted', 'Gyp. bd., painted')
FINISH_COM = ('LVT / carpet tile', 'Rubber', 'Gyp. bd., painted', 'Lay-in ACT')


def roof_geom(t, d):
    """-> (type, pitch, overhang, ridge runs along the front?, rise ft). A hip's ridge runs along the longer side."""
    rf = d.get('roof') or {}
    typ, pitch, ov = rf.get('type', 'gable'), float(rf.get('pitch', 6)), float(rf.get('overhang', 1.5))
    along = t['W'] >= t['D'] if typ == 'hip' else rf.get('ridge', 'along_front') == 'along_front'
    across = t['D'] if along else t['W']
    rise = 0 if typ == 'flat' else pitch / 12 * (across if typ == 'shed' else across / 2)
    return typ, pitch, ov, along, rise


def type_and_design(ctx, sh):
    t = ctx.types[sh['type']]
    return t, t['design']


# ---------- the floor plan ----------
def layout(n_views, W, D, x, y, w, h, margin_ft=12):
    """the largest architectural scale and grid that fits n views of W x D -> (ft per in, label, cols, rows, cell w, cell h)"""
    best = None
    for cols in range(1, n_views + 1):
        rows = math.ceil(n_views / cols)
        cw, ch = w / cols, (h - 30 * rows) / rows
        ft, lab = K.arch_scale_for(W + margin_ft, D + margin_ft, cw - 20, ch - 50)
        if best is None or ft < best[0]:
            best = (ft, lab, cols, rows, cw, ch + 30)
    return best


def draw_floor(c, t, d, f, ox, oy, k, light=False, labels=True, roof=False):
    """draws floor f of the design with (0, 0) (front left) at (ox, oy); k: pt per ft"""
    X = lambda v: ox + v * k
    Y = lambda v: oy + v * k
    rooms = [r for r in d['rooms'] if r['floor'] == f]
    ol = outline(t)
    if roof:
        K.draw_poly(c, [(X(p[0]), Y(p[1])) for p in ol], stroke=K.INK, lw=1.6)
        rf = d.get('roof') or {}
        typ = rf.get('type', 'gable')
        c.setLineWidth(0.8)
        c.setStrokeColorRGB(*K.INK)
        W, D = t['W'], t['D']
        if typ == 'gable':
            if rf.get('ridge', 'along_front') == 'along_front':
                c.line(X(0), Y(D / 2), X(W), Y(D / 2))
            else:
                c.line(X(W / 2), Y(0), X(W / 2), Y(D))
        elif typ == 'hip':
            s = min(W, D) / 2
            if W >= D:
                c.line(X(s), Y(D / 2), X(W - s), Y(D / 2))
                for a, b in ((0, 0), (0, D), (W, 0), (W, D)):
                    c.line(X(a), Y(b), X(s if a == 0 else W - s), Y(D / 2))
            else:
                c.line(X(W / 2), Y(s), X(W / 2), Y(D - s))
                for a, b in ((0, 0), (0, D), (W, 0), (W, D)):
                    c.line(X(a), Y(b), X(W / 2), Y(s if b == 0 else D - s))
        elif typ == 'shed':
            K.label(c, X(W / 2), Y(D / 2), 'SHED ROOF, SLOPE TO BACK', 7, FB)
        else:
            K.label(c, X(W / 2), Y(D / 2), 'FLAT ROOF — TPO MEMBRANE, TAPERED INSULATION, ROOF DRAINS / SCUPPERS', 6.5, FB)
        if typ != 'flat':
            K.label(c, X(W / 2), Y(-4), '%s ROOF, %s:12, %s\' OVERHANG' % (typ.upper(), fmt(rf.get('pitch', 6)), fmt(rf.get('overhang', 1.5))), 6.5, FB)
        return
    # rooms
    for r in rooms:
        c.setLineWidth(0.4 if light else 1.0)
        c.setStrokeColorRGB(*(K.LIGHT if light else K.INK))
        fill = (0.93, 0.93, 0.93) if r['type'] in ('garage', 'porch', 'warehouse') and not light else None
        if fill:
            c.setFillColorRGB(*fill)
        c.rect(X(r['x']), Y(r['y']), r['w'] * k, r['d'] * k, stroke=1, fill=1 if fill else 0)
    # exterior wall
    K.draw_poly(c, [(X(p[0]), Y(p[1])) for p in ol], stroke=K.GREY if light else K.INK, lw=1.0 if light else 2.6)
    if t.get('attached'):
        c.setLineWidth(1.4 if light else 3.4)
        c.setStrokeColorRGB(*(K.GREY if light else K.INK))
        c.line(X(0), Y(0), X(0), Y(t['D']))
        c.line(X(t['W']), Y(0), X(t['W']), Y(t['D']))
    R = rooms_by_id(d)
    # doors
    for dr in d.get('doors') or []:
        a = R.get(dr.get('a'))
        if not a or a['floor'] != f:
            continue
        g = door_geometry(t, R, dr)
        if not g:
            continue
        w = g['width']
        if g['orient'] == 'h':
            x1, x2, y0 = X(g['c'] - w / 2), X(g['c'] + w / 2), Y(g['at'])
            c.setStrokeColorRGB(1, 1, 1)
            c.setLineWidth(3.4 if not light else 1.6)
            c.line(x1, y0, x2, y0)
            c.setStrokeColorRGB(*(K.GREY if light else K.INK))
            c.setLineWidth(0.5)
            if g['kind'] == 'overhead':
                c.setDash([3, 2])
                c.line(x1, y0 + 1.5 * k, x2, y0 + 1.5 * k)
                c.setDash()
            elif g['kind'] in ('swing', 'double') and not light:
                into = 1 if (g['exterior'] and g['side'] == 'front') or (not g['exterior'] and g['b'] and g['b']['y'] >= g['a']['y'] + g['a']['d'] - 0.3) else -1
                if g['exterior'] and g['side'] == 'back':
                    into = -1
                leaves = [(x1, 1)] if g['kind'] == 'swing' else [(x1, 1), (x2, -1)]
                lw_ = w if g['kind'] == 'swing' else w / 2
                for hx, sgn in leaves:
                    c.line(hx, y0, hx, y0 + into * lw_ * k)
                    c.arc(hx - lw_ * k, y0 - lw_ * k, hx + lw_ * k, y0 + lw_ * k, (0 if sgn > 0 else 90) if into > 0 else (270 if sgn > 0 else 180), 90)
            elif g['kind'] == 'storefront':
                c.line(x1, y0 - 0.25 * k, x2, y0 - 0.25 * k)
                c.line(x1, y0 + 0.25 * k, x2, y0 + 0.25 * k)
        else:
            y1, y2, x0 = Y(g['c'] - w / 2), Y(g['c'] + w / 2), X(g['at'])
            c.setStrokeColorRGB(1, 1, 1)
            c.setLineWidth(3.4 if not light else 1.6)
            c.line(x0, y1, x0, y2)
            c.setStrokeColorRGB(*(K.GREY if light else K.INK))
            c.setLineWidth(0.5)
            if g['kind'] == 'overhead':
                c.setDash([3, 2])
                c.line(x0 + 1.5 * k, y1, x0 + 1.5 * k, y2)
                c.setDash()
            elif g['kind'] in ('swing', 'double') and not light:
                into = 1 if (g['exterior'] and g['side'] == 'left') or (not g['exterior'] and g['b'] and g['b']['x'] >= g['a']['x'] + g['a']['w'] - 0.3) else -1
                if g['exterior'] and g['side'] == 'right':
                    into = -1
                c.line(x0, y1, x0 + into * w * k, y1)
                c.arc(x0 - w * k, y1 - w * k, x0 + w * k, y1 + w * k, 0 if into > 0 else 90, 90)
    # windows
    for wn in d.get('windows') or []:
        r = R.get(wn.get('room'))
        if not r or r['floor'] != f:
            continue
        for side, cpos, ww in window_positions(t, r, wn):
            c.setLineWidth(0.5)
            if side in ('front', 'back'):
                y0 = Y(r['y'] if side == 'front' else r['y'] + r['d'])
                c.setStrokeColorRGB(1, 1, 1)
                c.setLineWidth(3.4 if not light else 1.6)
                c.line(X(cpos - ww / 2), y0, X(cpos + ww / 2), y0)
                c.setStrokeColorRGB(*(K.GREY if light else K.INK))
                c.setLineWidth(0.4)
                for off in (-0.25, 0, 0.25):
                    c.line(X(cpos - ww / 2), y0 + off * k, X(cpos + ww / 2), y0 + off * k)
            else:
                x0 = X(r['x'] if side == 'left' else r['x'] + r['w'])
                c.setStrokeColorRGB(1, 1, 1)
                c.setLineWidth(3.4 if not light else 1.6)
                c.line(x0, Y(cpos - ww / 2), x0, Y(cpos + ww / 2))
                c.setStrokeColorRGB(*(K.GREY if light else K.INK))
                c.setLineWidth(0.4)
                for off in (-0.25, 0, 0.25):
                    c.line(x0 + off * k, Y(cpos - ww / 2), x0 + off * k, Y(cpos + ww / 2))
    # stair treads
    for r in rooms:
        if r['type'] == 'stair':
            c.setStrokeColorRGB(*K.LIGHT)
            c.setLineWidth(0.3)
            long_y = r['d'] >= r['w']
            n = int((r['d'] if long_y else r['w']) / 0.92)
            for i in range(1, n):
                if long_y:
                    c.line(X(r['x']), Y(r['y'] + i * 0.92), X(r['x'] + r['w']), Y(r['y'] + i * 0.92))
                else:
                    c.line(X(r['x'] + i * 0.92), Y(r['y']), X(r['x'] + i * 0.92), Y(r['y'] + r['d']))
    if labels:
        for r in rooms:
            fs = max(4.5, min(8, k * 0.9))
            if r['w'] * k > 24 and r['d'] * k > 12:
                cx, cy = X(r['x'] + r['w'] / 2), Y(r['y'] + r['d'] / 2)
                col = K.GREY if light else K.INK
                K.label(c, cx, cy + (1 if light else 2), r['name'].upper(), fs, FB, col, halo=False)
                if not light and r['d'] * k > 22:
                    K.label(c, cx, cy - fs - 1, '%s\' × %s\' · %d SF' % (fmt(r['w']), fmt(r['d']), room_area(r)), fs - 1, F, col, halo=False)


def dim(c, x1, y1, x2, y2, text, off=14):
    c.setStrokeColorRGB(*K.GREY)
    c.setLineWidth(0.4)
    if abs(y1 - y2) < 0.01:
        c.line(x1, y1 - off, x2, y2 - off)
        for x in (x1, x2):
            c.line(x, y1 - off - 4, x, y1 - off + 4)
        K.label(c, (x1 + x2) / 2, y1 - off + 2, text, 7, F)
    else:
        c.line(x1 - off, y1, x2 - off, y2)
        for y in (y1, y2):
            c.line(x1 - off - 4, y, x1 - off + 4, y)
        K.label(c, x1 - off - 4, (y1 + y2) / 2, text, 7, F, angle=90)


def plan_views(c, ctx, t, d, overlay=None, light=False, roof=False, region=None, title='Floor plan'):
    """lays out every floor (and the roof) at one scale; overlay(c, f, X, Y, k) adds a discipline's layer.
    Returns (scale label, ft per in)."""
    ax, ay, aw, ah = region or (K.AREA[0], K.AREA[1], K.AREA[2] - SIDE_W - 30, K.AREA[3])
    views = [(f, False) for f in floors_of(d)] + ([(None, True)] if roof else [])
    ft, lab, cols, rows, cw, ch = layout(len(views), t['W'], t['D'], ax, ay, aw, ah)
    k = 72.0 / ft
    for i, (f, is_roof) in enumerate(views):
        cx = ax + (i % cols) * cw
        cy = ay + ah - (i // cols + 1) * ch
        ox = cx + (cw - t['W'] * k) / 2
        oy = cy + 50 + (ch - 50 - t['D'] * k) / 2
        draw_floor(c, t, d, f if f else 1, ox, oy, k, light=light, roof=is_roof)
        if overlay and not is_roof:
            overlay(c, f, lambda v: ox + v * k, lambda v: oy + v * k, k)
        if not light and not is_roof:
            dim(c, ox, oy, ox + t['W'] * k, oy, '%s\'-0"' % fmt(t['W']), 16)
            dim(c, ox, oy, ox, oy + t['D'] * k, '%s\'-0"' % fmt(t['D']), 16)
        K.view_title(c, cx + 10, cy + 12, i + 1, ('Roof plan' if is_roof else (title if len(views) == 1 or f is None else '%s — %s' % (title, 'level %d' % f))), lab, ft)
        K.label(c, ox + t['W'] * k / 2, oy - 30, 'FRONT (STREET SIDE)', 6, F, K.GREY, halo=False)
    return lab, ft


def side_column(c, blocks):
    x = K.AREA[0] + K.AREA[2] - SIDE_W
    y = K.AREA[1] + K.AREA[3]
    from .sheets_site import side_block
    for b in blocks:
        y = side_block(c, x, y, SIDE_W, b, K.AREA[1])


def type_table(t, d):
    R = d['rooms']
    cond = sum(room_area(r) for r in R if r['type'] not in ('garage', 'porch'))
    rows = [['Use', t['label']], ['Footprint', '%s\' × %s\'' % (fmt(t['W']), fmt(t['D']))], ['Floors', str(t['floors'])], ['Conditioned / enclosed', '{:,} sf'.format(int(cond))],
            ['Gross (per building)', '{:,} sf'.format(t['building_gsf'])], ['Buildings of this type', str(t['count'])], ['Occupancy', t['occupancy']], ['Construction', t['construction']],
            ['Sprinklers', ('Yes — ' if t['sprinklered'] else 'No — ') + t['sprinkler_why']]]
    garage = sum(room_area(r) for r in R if r['type'] == 'garage')
    if garage:
        rows.insert(4, ['Garage', '{:,} sf'.format(int(garage))])
    return rows


def a_plans(c, ctx, sh):
    t, d = type_and_design(ctx, sh)
    lab, ft = plan_views(c, ctx, t, d, roof=True)
    sh['scale'] = lab
    side_column(c, [('table', 'Type %s data' % t['id'], (None, type_table(t, d), [1, 1.5], ())),
                    ('text', 'Design summary', d.get('summary') or ''),
                    ('notes', 'Plan notes', ['Dimensions to face of stud / face of panel; do not scale.', 'Room sizes are schematic and checked by rule for fit, access, minimum sizes and egress.',
                                             'Bedroom windows meet emergency escape (IRC R310): 5.7 sf net clear opening, 44" max sill.' if is_res(t) else 'Accessible routes, restrooms and entries per TAS; door hardware per TAS 404.',
                                             'Attached units: 2-hour fire-resistance-rated common wall (IRC R302.2) from foundation to roof deck.' if t.get('attached') else 'See G-002 for symbols and abbreviations.']
                                             + ((ctx.p.get('disc') or {}).get('arch') or {}).get('notes', [])[:4])])


# ---------- elevations ----------
def elevation(c, t, d, side, x, y, k):
    """one exterior elevation, ground line at y, its left end at x"""
    W, D = t['W'], t['D']
    span = W if side in ('front', 'back') else D
    H = t['floors'] * t['floor_h']
    typ, pitch, ov, ridge_along, rise = roof_geom(t, d)
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(1.6)
    c.line(x - 20, y, x + span * k + 20, y)
    c.setLineWidth(1.0)
    c.setFillColorRGB(0.97, 0.96, 0.94)
    c.rect(x, y, span * k, H * k, stroke=1, fill=1)
    top_y = y + H * k
    if typ == 'flat':
        c.rect(x, top_y, span * k, 3 * k, stroke=1, fill=0)
        roof_h = 3
    else:
        across = D if ridge_along else W  # the span the roof rises over
        roof_h = rise
        faces_gable = (side in ('left', 'right')) == ridge_along if typ == 'gable' else False
        end_on = (side in ('left', 'right')) == ridge_along  # looking at the ridge's end
        c.setFillColorRGB(0.55, 0.55, 0.57)
        if typ == 'shed':
            pts = [(x - ov * k, top_y), (x + (span + ov) * k, top_y), (x + (span + ov) * k, top_y + rise * k), (x - ov * k, top_y + rise * k)]
        elif faces_gable:
            pts = [(x - ov * k, top_y), (x + (span + ov) * k, top_y), (x + span * k / 2, top_y + rise * k)]
        elif typ == 'hip' and end_on:
            pts = [(x - ov * k, top_y), (x + (span + ov) * k, top_y), (x + span * k / 2, top_y + rise * k)]
        elif typ == 'hip':
            inset = min(span / 2, across / 2)
            pts = [(x - ov * k, top_y), (x + (span + ov) * k, top_y), (x + (span - inset) * k, top_y + rise * k), (x + inset * k, top_y + rise * k)]
        else:
            pts = [(x - ov * k, top_y), (x + (span + ov) * k, top_y), (x + (span + ov) * k, top_y + rise * k), (x - ov * k, top_y + rise * k)]
        K.draw_poly(c, pts, stroke=K.INK, fill=(0.62, 0.62, 0.64), lw=1)
    # openings on this side, mapped to the elevation's own left-to-right
    R = rooms_by_id(d)
    mirror = side in ('back', 'left')

    def pos(v):
        return x + ((span - v) if mirror else v) * k

    for wn in d.get('windows') or []:
        r = R.get(wn.get('room'))
        if not r or wn.get('side') != side:
            continue
        for _, cpos, ww in window_positions(t, r, wn):
            base_y = y + ((r['floor'] - 1) * t['floor_h'] + 3) * k
            hh = float(wn.get('height', 4))
            c.setFillColorRGB(0.78, 0.86, 0.92)
            c.rect(pos(cpos) - ww / 2 * k, base_y, ww * k, hh * k, stroke=1, fill=1)
            c.line(pos(cpos), base_y, pos(cpos), base_y + hh * k)
    for dr in d.get('doors') or []:
        if dr.get('b') != 'outside':
            continue
        g = door_geometry(t, R, dr)
        if not g or g['side'] != side:
            continue
        hh = 8 if g['kind'] in ('overhead',) else 7 if is_res(t) else 8
        if g['kind'] == 'overhead' and g['width'] >= 10 and not is_res(t):
            hh = 12
        c.setFillColorRGB(0.85, 0.85, 0.85) if g['kind'] == 'overhead' else c.setFillColorRGB(0.45, 0.33, 0.25) if is_res(t) else c.setFillColorRGB(0.7, 0.82, 0.9)
        c.rect(pos(g['c']) - g['width'] / 2 * k, y, g['width'] * k, hh * k, stroke=1, fill=1)
        if g['kind'] == 'overhead':
            for i in range(1, 4):
                c.line(pos(g['c']) - g['width'] / 2 * k, y + hh * k * i / 4, pos(g['c']) + g['width'] / 2 * k, y + hh * k * i / 4)
    # level marks
    c.setFont(F, 6.5)
    c.setFillColorRGB(*K.INK)
    for f in range(t['floors'] + 1):
        yy = y + f * t['floor_h'] * k
        c.setDash([2, 2])
        c.line(x + span * k + 6, yy, x + span * k + 40, yy)
        c.setDash()
        c.drawString(x + span * k + 42, yy - 2, ('T.O. PLATE' if f == t['floors'] else 'LEVEL %d' % (f + 1) if f else 'F.F. 0\'-0"') + ('' if f == 0 else ' +%s\'' % fmt(f * t['floor_h'])))
    return (H + roof_h) * k


def a_elev(c, ctx, sh):
    t, d = type_and_design(ctx, sh)
    ax, ay, aw, ah = K.AREA
    aw2 = aw - SIDE_W - 30
    H = t['floors'] * t['floor_h'] + roof_geom(t, d)[4] + 4
    cw, ch = aw2 / 2, ah / 2
    ft, lab = K.arch_scale_for(max(t['W'], t['D']) + 16, H + 6, cw - 80, ch - 70)
    k = 72.0 / ft
    sh['scale'] = lab
    for i, side in enumerate(('front', 'right', 'back', 'left')):
        cx = ax + (i % 2) * cw
        cy = ay + ah - (i // 2 + 1) * ch
        span = t['W'] if side in ('front', 'back') else t['D']
        elevation(c, t, d, side, cx + (cw - span * k) / 2 - 20, cy + 60, k)
        K.view_title(c, cx + 10, cy + 14, i + 1, '%s elevation' % side.capitalize(), lab, ft)
    ex = d.get('exterior') or {}
    side_column(c, [('table', 'Exterior materials', (None, [['Walls', ex.get('walls', '—')], ['Accent', ex.get('accent', '—')], ['Roofing', ex.get('roofing', '—')],
                                                            ['Windows', ex.get('windows', '—')], ['Doors', ex.get('doors', '—')]], [1, 2.2], ())),
                    ('notes', 'Elevation notes', ['Elevations are generated from the floor plan, roof and materials; massing and openings are schematic.',
                                                  'Left and right are as seen from the street; the back elevation is drawn as seen from behind.',
                                                  'Plate heights %s\' a floor; verify with the architect.' % fmt(t['floor_h'])])])


# ---------- sections ----------
def a_section(c, ctx, sh):
    t, d = type_and_design(ctx, sh)
    ax, ay, aw, ah = K.AREA
    aw2 = aw - SIDE_W - 30
    rf = d.get('roof') or {}
    H = t['floors'] * t['floor_h'] + roof_geom(t, d)[4] + 6
    ch = ah / 2
    ft, lab = K.arch_scale_for(max(t['W'], t['D']) + 16, H + 8, aw2 - 100, ch - 80)
    k = 72.0 / ft
    sh['scale'] = lab
    for i, (name, along, at) in enumerate((('Transverse section', 'x', t['D'] / 2), ('Longitudinal section', 'y', t['W'] / 2))):
        span = t['W'] if along == 'x' else t['D']
        cx = ax + (aw2 - span * k) / 2
        cy = ay + ah - (i + 1) * ch + 70
        # slab and grade
        c.setFillColorRGB(0.75, 0.75, 0.75)
        c.rect(cx, cy - 0.33 * k, span * k, 0.33 * k, stroke=1, fill=1)
        c.rect(cx, cy - 2.5 * k, 1 * k, 2.2 * k, stroke=1, fill=1)
        c.rect(cx + (span - 1) * k, cy - 2.5 * k, 1 * k, 2.2 * k, stroke=1, fill=1)
        c.setLineWidth(1.4)
        c.line(cx - 30, cy - 0.5 * k, cx + span * k + 30, cy - 0.5 * k)
        # rooms cut by the line, per floor
        for f in floors_of(d):
            base = cy + (f - 1) * t['floor_h'] * k
            for r in d['rooms']:
                if r['floor'] != f:
                    continue
                if along == 'x' and r['y'] <= at <= r['y'] + r['d']:
                    a0, a1 = r['x'], r['x'] + r['w']
                elif along == 'y' and r['x'] <= at <= r['x'] + r['w']:
                    a0, a1 = r['y'], r['y'] + r['d']
                else:
                    continue
                c.setLineWidth(0.6)
                c.setStrokeColorRGB(*K.INK)
                ceil = t['floor_h'] - (1.0 if t['floors'] > 1 else 1.0)
                c.rect(cx + a0 * k, base, (a1 - a0) * k, ceil * k, stroke=1, fill=0)
                if (a1 - a0) * k > 30:
                    K.label(c, cx + (a0 + a1) / 2 * k, base + ceil * k / 2, r['name'].upper(), max(5, min(7, k)), FB, halo=False)
            if f > 1:
                c.setFillColorRGB(0.85, 0.85, 0.85)
                c.rect(cx, base - 1.0 * k, span * k, 1.0 * k, stroke=1, fill=1)
        topy = cy + t['floors'] * t['floor_h'] * k
        typ, pitch, ov, r_along, r_rise = roof_geom(t, d)
        if typ == 'flat':
            c.setFillColorRGB(0.85, 0.85, 0.85)
            c.rect(cx, topy - 1.5 * k, span * k, 1.5 * k, stroke=1, fill=1)
            c.rect(cx, topy, 0.7 * k, 3 * k, stroke=1, fill=1)
            c.rect(cx + (span - 0.7) * k, topy, 0.7 * k, 3 * k, stroke=1, fill=1)
        else:
            ridge_across = r_along == (along == 'y')
            rise = r_rise
            if ridge_across:
                K.draw_poly(c, [(cx - ov * k, topy - ov * pitch / 12 * k), (cx + span * k / 2, topy + rise * k), (cx + (span + ov) * k, topy - ov * pitch / 12 * k)], stroke=K.INK, lw=1.4, close=False)
                c.setLineWidth(0.6)
                c.line(cx, topy, cx + span * k, topy)
                for j in range(1, 6):
                    xx = cx + span * k * j / 6
                    yy = topy + (rise * k) * (1 - abs(j / 6 - 0.5) * 2)
                    c.line(xx, topy, xx, yy)
            else:
                rise2 = r_rise
                c.setFillColorRGB(0.9, 0.9, 0.9)
                if typ == 'hip':
                    inset = min(t['W'], t['D']) / 2
                    K.draw_poly(c, [(cx - ov * k, topy), (cx + (span + ov) * k, topy), (cx + (span - inset) * k, topy + rise2 * k), (cx + inset * k, topy + rise2 * k)], stroke=K.INK, fill=(0.9, 0.9, 0.9), lw=1)
                else:
                    c.rect(cx - ov * k, topy, (span + 2 * ov) * k, rise2 * k, stroke=1, fill=1)
                K.label(c, cx + span * k / 2, topy + rise2 * k / 2, 'ROOF BEYOND', 6.5, F, halo=False)
        c.setFont(F, 6.5)
        for f in range(t['floors'] + 1):
            yy = cy + f * t['floor_h'] * k
            c.drawString(cx + span * k + 40, yy - 2, 'F.F. 0\'-0"' if f == 0 else ('T.O. PLATE +%s\'' if f == t['floors'] else 'LEVEL %d +%s\'' % (f + 1, '%s')) % fmt(f * t['floor_h']))
        K.view_title(c, ax + 10, ay + ah - (i + 1) * ch + 14, i + 1, name, lab, ft, sub='cut at %s = %s\'' % ('y' if along == 'x' else 'x', fmt(at)))
    sysd = d.get('systems') or {}
    side_column(c, [('table', 'Section basis', (None, [['Structure', sysd.get('structure', '—')], ['Foundation', sysd.get('foundation', '—')], ['Floor to floor', '%s\'' % fmt(t['floor_h'])],
                                                       ['Roof', '%s, %s:12' % ((d.get('roof') or {}).get('type', '—'), fmt((d.get('roof') or {}).get('pitch', 0)))]], [1, 2], ())),
                    ('notes', 'Notes', ['Sections are cut through the middle of the building; rooms shown are those the cut line crosses.', 'Insulation per IECC 2021 climate zone 2A: R-13 + R-5 ci walls or R-20 cavity, R-38 ceilings (residential).'])])


# ---------- schedules ----------
def a_sched(c, ctx, sh):
    t, d = type_and_design(ctx, sh)
    R = rooms_by_id(d)
    ax, ay, aw, ah = K.AREA
    W3 = (aw - 60) / 3
    drows = []
    for i, dr in enumerate(d.get('doors') or []):
        a = R.get(dr.get('a'))
        b = 'Exterior' if dr.get('b') == 'outside' else (R.get(dr.get('b')) or {}).get('name', '?')
        w = float(dr.get('width', 3))
        kind = dr.get('kind', 'swing')
        hh = 8 if kind == 'overhead' else 7 if is_res(t) else 8
        mat = 'Insulated steel' if kind == 'overhead' else 'Alum. storefront' if kind == 'storefront' else ('Fiberglass, insulated' if dr.get('b') == 'outside' else 'Solid core wood') if is_res(t) else 'Hollow metal'
        drows.append(['D%02d' % (i + 1), '%s / %s' % (a['name'] if a else '?', b), "%s'-%d\"" % (int(w), round((w % 1) * 12)) + ' × %d\'-0"' % hh, kind, mat])
    y = K.heading(c, ax, ay + ah, W3 * 1.3, 'Door schedule')
    K.table(c, ax, y, W3 * 1.3, drows, head=['Mark', 'Location', 'Size', 'Type', 'Material'], cols=[0.5, 2, 1, 0.8, 1.2], size=7.5, min_y=ay)
    groups = {}
    for wn in d.get('windows') or []:
        key = (float(wn.get('width', 3)), float(wn.get('height', 4)))
        r = R.get(wn.get('room'))
        g = groups.setdefault(key, [0, set()])
        g[0] += int(wn.get('count', 1))
        if r:
            g[1].add(r['name'])
    wrows = [['W%d' % (i + 1), "%s' × %s'" % (fmt(k_[0]), fmt(k_[1])), str(v[0]), ', '.join(sorted(v[1]))[:80], 'Single hung, low-E, vinyl' if is_res(t) else 'Aluminum, thermally broken, low-E']
             for i, (k_, v) in enumerate(sorted(groups.items()))]
    x2 = ax + W3 * 1.3 + 30
    y = K.heading(c, x2, ay + ah, W3 * 0.85, 'Window schedule')
    K.table(c, x2, y, W3 * 0.85, wrows, head=['Mark', 'Size', 'Qty', 'Rooms', 'Type'], cols=[0.5, 0.8, 0.4, 2, 1.4], size=7.5, min_y=ay)
    frows = []
    for r in d['rooms']:
        fin = FINISH.get(r['type'], FINISH_RES if is_res(t) else FINISH_COM)
        frows.append([r['id'], r['name'], str(r['floor']), '%d' % room_area(r), fin[0], fin[1], fin[2], fin[3]])
    x3 = x2 + W3 * 0.85 + 30
    w3 = ax + aw - x3
    y = K.heading(c, x3, ay + ah, w3, 'Room finish schedule')
    K.table(c, x3, y, w3, frows, head=['No.', 'Room', 'Fl', 'SF', 'Floor', 'Base', 'Walls', 'Ceiling'], cols=[0.4, 1.3, 0.3, 0.45, 1, 0.7, 1.4, 1], right=(2, 3), size=7, min_y=ay)


# ---------- A-501 typical wall section ----------
def a_details(c, ctx, sh):
    from .sheets_site import details_sheet
    res = any(is_res(t) for t in ctx.types.values())
    com = any(not is_res(t) for t in ctx.types.values())

    def wall_res(c, x, y, w, h):
        s = min(w, h) / 200
        c.setFillColorRGB(0.75, 0.75, 0.75)
        c.rect(x + 40 * s, y, 70 * s, 10 * s, stroke=1, fill=1)
        c.rect(x + 40 * s, y - 25 * s, 14 * s, 25 * s, stroke=1, fill=1)
        c.setFillColorRGB(0.95, 0.9, 0.8)
        c.rect(x + 40 * s, y + 10 * s, 7 * s, 130 * s, stroke=1, fill=1)
        c.setFillColorRGB(0.8, 0.5, 0.4)
        c.rect(x + 33 * s, y + 10 * s, 6 * s, 130 * s, stroke=1, fill=1)
        K.draw_poly(c, [(x + 20 * s, y + 140 * s), (x + 120 * s, y + 190 * s)], stroke=K.INK, lw=1.4, close=False)
        for lab_, yy in (('ARCH. SHINGLES ON 7/16" OSB, SYNTH. UNDERLAYMENT', 180), ('WOOD TRUSSES 24" O.C., R-38 BLOWN INSUL.', 150), ('2×6 STUDS 16" O.C., R-20, 7/16" OSB, WRB', 90),
                         ('BRICK VENEER / FIBER CEMENT SIDING', 60), ('PT SLAB ON GRADE, VAPOR RETARDER', 12), ('GRADE BEAM PER S-SERIES', -15)):
            c.setFont(F, 6.5)
            c.drawString(x + 125 * s, y + yy * s, lab_)

    def wall_com(c, x, y, w, h):
        s = min(w, h) / 200
        c.setFillColorRGB(0.75, 0.75, 0.75)
        c.rect(x + 40 * s, y, 70 * s, 10 * s, stroke=1, fill=1)
        c.rect(x + 40 * s, y - 30 * s, 18 * s, 30 * s, stroke=1, fill=1)
        c.setFillColorRGB(0.85, 0.85, 0.9)
        c.rect(x + 40 * s, y + 10 * s, 8 * s, 150 * s, stroke=1, fill=1)
        c.setFillColorRGB(0.7, 0.7, 0.7)
        c.rect(x + 30 * s, y + 10 * s, 9 * s, 160 * s, stroke=1, fill=1)
        c.line(x + 40 * s, y + 160 * s, x + 130 * s, y + 160 * s)
        for lab_, yy in (('TPO ON TAPERED POLYISO ON METAL DECK', 165), ('STEEL BAR JOISTS PER STRUCTURAL', 150), ('6" METAL STUDS, R-13 + R-7.5 CI, GYP. BD.', 100),
                         ('CMU / STONE VENEER OR EIFS', 70), ('4"–5" SLAB ON GRADE, VAPOR RETARDER', 12), ('GRADE BEAM / FOOTING PER S-SERIES', -20)):
            c.setFont(F, 6.5)
            c.drawString(x + 125 * s, y + yy * s, lab_)

    items = ([('Typical wall section — wood frame', wall_res)] if res else []) + ([('Typical wall section — commercial', wall_com)] if com else [])
    details_sheet(c, ctx, sh, items, ['Assemblies are typical for pricing; the architect of record selects and details the final assemblies.', 'Energy: IECC 2021 climate zone 2A.',
                                      'Fire-resistance-rated assemblies (party walls, separation walls) per a listed design (UL / GA).'])


RENDERERS = {'a-plans': a_plans, 'a-elev': a_elev, 'a-section': a_section, 'a-sched': a_sched, 'a-details': a_details}
