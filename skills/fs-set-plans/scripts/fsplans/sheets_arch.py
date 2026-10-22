"""Architecture sheets per building type, drawn from the type's design: floor and roof plans, elevations, sections,
schedules, and the typical wall section. Plans are drawn with the front (street side) at the bottom. The shared
`plan_views` draws the light floor plan the engineering sheets put their layers on."""
import math
from . import kit as K
from . import draft as DR
from . import geom as G
from . import rules as RU
from .geom import inside
from .kit import F, FB
from .design import (is_res, outline, exterior_span, door_geometry, window_positions, rooms_by_id, floors_of, room_area, fmt, foot_area)

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


def type_number(ctx, t):
    """the type's sheet sequence: type A -> 1 (A-101, A-201, A-301)"""
    return list(ctx.types).index(t['id']) + 1


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
        for side, cpos, ww in window_positions(t, r, wn, d):
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


def wall_thick(t):
    """exterior wall thickness in feet: masonry commercial about 1'-0", wood frame with veneer about 0'-9\""""
    return 0.75 if is_res(t) else 1.0


def partition(t):
    return 0.375


def draw_plan(c, t, d, f, X, Y, k, tags=True):
    """the floor plan as an architect draws it: solid exterior walls, partitions, openings cut through the walls,
    door swings, glazing, room names and areas that fit their rooms, door and window tags.
    Returns [(number, room)] for rooms too small to label (listed beside the plan)."""
    rooms = [r for r in d['rooms'] if r['floor'] == f]
    R = rooms_by_id(d)
    ol = outline(t)
    tw, pw = wall_thick(t) * k, max(1.2, partition(t) * k)
    c.saveState()
    # the open ground in an L / U outline's notches: hatched and named, so it never reads as an empty room
    if t.get('fp'):
        from .seed import notches_of
        for n_ in notches_of(t):
            P = [(X(n_['x']), Y(n_['y'])), (X(n_['x'] + n_['w']), Y(n_['y'])), (X(n_['x'] + n_['w']), Y(n_['y'] + n_['d'])), (X(n_['x']), Y(n_['y'] + n_['d']))]
            c.setFillColorRGB(0.96, 0.97, 0.95)
            c.rect(P[0][0], P[0][1], n_['w'] * k, n_['d'] * k, stroke=0, fill=1)
            DR.hatch(c, P, 'diag', k, color=(0.78, 0.80, 0.76))
            if n_['w'] * k > 60 and n_['d'] * k > 30:
                K.label(c, (P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2, 'OPEN — OUTSIDE THE BUILDING', max(6, min(10, k * 0.9)), F, K.GREY)
    # slab-tone fill for garages / warehouses / porches
    for r in rooms:
        if r['type'] in ('garage', 'porch', 'warehouse'):
            c.setFillColorRGB(0.95, 0.95, 0.95)
            c.rect(X(r['x']), Y(r['y']), r['w'] * k, r['d'] * k, stroke=0, fill=1)
    # partitions: every room edge, as a solid band
    c.setStrokeColorRGB(*DR.WALL_FILL)
    c.setLineWidth(pw)
    for r in rooms:
        x0, y0, x1, y1 = X(r['x']), Y(r['y']), X(r['x'] + r['w']), Y(r['y'] + r['d'])
        for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            c.line(a[0], a[1], b[0], b[1])
    # the exterior wall
    DR.wall_ring(c, [(X(p[0]), Y(p[1])) for p in ol], tw)
    if t.get('attached'):
        c.setLineWidth(tw)
        c.line(X(0), Y(0), X(0), Y(t['D']))
        c.line(X(t['W']), Y(0), X(t['W']), Y(t['D']))
    # windows: a gap in the wall with two glass lines and jambs
    wtags = {}
    for wn in d.get('windows') or []:
        r = R.get(wn.get('room'))
        if not r or r['floor'] != f:
            continue
        key = (float(wn.get('width', 3)), float(wn.get('height', 4)))
        mark = wtags.setdefault(key, 'W%d' % (len(wtags) + 1))
        for side, cpos, ww in window_positions(t, r, wn, d):
            horiz = side in ('front', 'back')
            at = (r['y'] if side == 'front' else r['y'] + r['d']) if horiz else (r['x'] if side == 'left' else r['x'] + r['w'])
            inward = 1 if side in ('front', 'left') else -1
            if horiz:
                x1_, x2_ = X(cpos - ww / 2), X(cpos + ww / 2)
                y0 = Y(at)
                c.setFillColorRGB(1, 1, 1)
                c.rect(x1_, min(y0, y0 + inward * tw), x2_ - x1_, tw, stroke=0, fill=1)
                c.setStrokeColorRGB(*K.INK)
                c.setLineWidth(0.4)
                for frac in (0.4, 0.6):
                    c.line(x1_, y0 + inward * tw * frac, x2_, y0 + inward * tw * frac)
                c.setLineWidth(0.6)
                c.line(x1_, y0, x1_, y0 + inward * tw)
                c.line(x2_, y0, x2_, y0 + inward * tw)
                if tags and ww * k > 14:
                    DR.tag(c, (x1_ + x2_) / 2, y0 - inward * 9, mark, 'diamond', 4.6)
            else:
                y1_, y2_ = Y(cpos - ww / 2), Y(cpos + ww / 2)
                x0 = X(at)
                c.setFillColorRGB(1, 1, 1)
                c.rect(min(x0, x0 + inward * tw), y1_, tw, y2_ - y1_, stroke=0, fill=1)
                c.setStrokeColorRGB(*K.INK)
                c.setLineWidth(0.4)
                for frac in (0.4, 0.6):
                    c.line(x0 + inward * tw * frac, y1_, x0 + inward * tw * frac, y2_)
                c.setLineWidth(0.6)
                c.line(x0, y1_, x0 + inward * tw, y1_)
                c.line(x0, y2_, x0 + inward * tw, y2_)
                if tags and ww * k > 14:
                    DR.tag(c, x0 - inward * 9, (y1_ + y2_) / 2, mark, 'diamond', 4.6)
    # doors: the opening, the leaf and its swing, and a tag matching the door schedule
    for i, dr in enumerate(d.get('doors') or []):
        a = R.get(dr.get('a'))
        if not a or a['floor'] != f:
            continue
        g = door_geometry(t, R, dr)
        if not g:
            continue
        w = g['width']
        th = tw if g['exterior'] else pw
        horiz = g['orient'] == 'h'
        # which way is "into the room a": exterior doors open in; interior doors swing into room a
        if g['exterior']:
            into = 1 if g['side'] in ('front', 'left') else -1
        else:
            if horiz:
                into = 1 if a['y'] >= g['at'] - 0.3 else -1
            else:
                into = 1 if a['x'] >= g['at'] - 0.3 else -1
        c.setFillColorRGB(1, 1, 1)
        if horiz:
            x1_, x2_, y0 = X(g['c'] - w / 2), X(g['c'] + w / 2), Y(g['at'])
            off = 0 if g['exterior'] else -th / 2 * into
            c.rect(x1_, min(y0 + off, y0 + off + into * th) - 0.2, x2_ - x1_, th + 0.4, stroke=0, fill=1)
        else:
            y1_, y2_, x0 = Y(g['c'] - w / 2), Y(g['c'] + w / 2), X(g['at'])
            off = 0 if g['exterior'] else -th / 2 * into
            c.rect(min(x0 + off, x0 + off + into * th) - 0.2, y1_, th + 0.4, y2_ - y1_, stroke=0, fill=1)
        c.setStrokeColorRGB(*K.INK)
        c.setLineWidth(0.5)
        kind = g['kind']
        if kind == 'overhead':
            c.setDash([3, 2])
            if horiz:
                c.line(x1_, y0 + into * (th + 1.5 * k), x2_, y0 + into * (th + 1.5 * k))
            else:
                c.line(x0 + into * (th + 1.5 * k), y1_, x0 + into * (th + 1.5 * k), y2_)
            c.setDash()
        elif kind in ('storefront', 'sliding', 'opening'):
            if kind != 'opening':
                for frac in (0.35, 0.65):
                    if horiz:
                        c.line(x1_, y0 + into * th * frac, x2_, y0 + into * th * frac)
                    else:
                        c.line(x0 + into * th * frac, y1_, x0 + into * th * frac, y2_)
        if kind in ('swing', 'double', 'storefront'):
            leaves = 1 if kind == 'swing' else 2
            lw_ = w / leaves * k
            face = (y0 + into * th) if horiz else (x0 + into * th)
            for j in range(leaves):
                sgn = 1 if j == 0 else -1  # the first leaf hinges at the low end, the second at the high end
                if horiz:
                    hinge = (x1_ if j == 0 else x2_, face)
                    leaf, along = (0, into), (sgn, 0)
                else:
                    hinge = (face, y1_ if j == 0 else y2_)
                    leaf, along = (into, 0), (0, sgn)
                c.setLineWidth(0.7)
                c.line(hinge[0], hinge[1], hinge[0] + leaf[0] * lw_, hinge[1] + leaf[1] * lw_)
                c.setLineWidth(0.3)
                a1 = math.degrees(math.atan2(leaf[1], leaf[0]))
                ext = 90 if (leaf[0] * along[1] - leaf[1] * along[0]) > 0 else -90
                c.arc(hinge[0] - lw_, hinge[1] - lw_, hinge[0] + lw_, hinge[1] + lw_, a1, ext)
        if tags and k > 3:
            cx = (x1_ + x2_) / 2 if horiz else x0 + into * (th + 7)
            cy = y0 + into * (th + 7) if horiz else (y1_ + y2_) / 2
            if horiz and kind in ('swing',):
                cx = x2_ + 7
            if not horiz and kind in ('swing',):
                cy = y2_ + 7
            DR.tag(c, cx, cy, '%02d' % (i + 1), 'hex', 4.3)
    # room names: fitted to the room, else numbered and listed
    unlabeled = []
    for r in rooms:
        bw, bh = r['w'] * k - pw - 2, r['d'] * k - pw - 2
        cx, cy = X(r['x'] + r['w'] / 2), Y(r['y'] + r['d'] / 2)
        sub = '{:,} SF'.format(int(room_area(r))) if bh > 20 else None
        if not DR.fit_text(c, cx, cy, bw, bh, [r['name'].upper()], max_size=min(9, max(5, k * 0.9)), min_size=4.6, sub=sub):
            n = len(unlabeled) + 1
            DR.tag(c, cx, cy, str(n), 'circle', 4.6)
            unlabeled.append((n, r))
    c.restoreState()
    return unlabeled


def plan_dims(c, t, d, f, X, Y, k):
    """dimension chains on all four sides (outline corners and the walls that meet each face) and overall dims"""
    ol = outline(t)
    W, D = t['W'], t['D']
    R = [r for r in d['rooms'] if r['floor'] == f]
    gap = 22

    def stops(axis, side):
        vals = {0.0, W if axis == 'x' else D}
        for p in ol:
            vals.add(round(p[0] if axis == 'x' else p[1], 2))
        for r in R:
            if exterior_span(t, r, side):
                if axis == 'x':
                    vals |= {round(r['x'], 2), round(r['x'] + r['w'], 2)}
                else:
                    vals |= {round(r['y'], 2), round(r['y'] + r['d'], 2)}
        return sorted(vals)
    xs_f, xs_b = stops('x', 'front'), stops('x', 'back')
    ys_l, ys_r = stops('y', 'left'), stops('y', 'right')
    DR.chain(c, [(X(x), Y(0)) for x in xs_f], -gap, k)
    DR.dim(c, (X(0), Y(0)), (X(W), Y(0)), -gap - 18, k=k)
    DR.chain(c, [(X(x), Y(D)) for x in xs_b][::-1], -gap, k)
    DR.chain(c, [(X(0), Y(y)) for y in ys_l][::-1], -gap, k)
    DR.dim(c, (X(0), Y(D)), (X(0), Y(0)), -gap - 18, k=k)
    DR.chain(c, [(X(W), Y(y)) for y in ys_r], -gap, k)


def section_lines(t, d):
    """the two cuts the sections take and the plan marks: (transverse y, longitudinal x), each through as much of the
    building (and as many rooms) as possible"""
    ol = outline(t)
    W, D = t['W'], t['D']

    def run(axis, v):
        n = 400
        tot = 0
        span = W if axis == 'y' else D
        for i in range(n):
            u = span * (i + 0.5) / n
            q = (u, v) if axis == 'y' else (v, u)
            tot += inside(q, ol)
        return tot

    ys = sorted({r['y'] + r['d'] / 2 for r in d['rooms']} | {D / 2})
    xs = sorted({r['x'] + r['w'] / 2 for r in d['rooms']} | {W / 2})
    ty = max(ys, key=lambda y: (run('y', y), -abs(y - D / 2)))
    lx = max(xs, key=lambda x: (run('x', x), -abs(x - W / 2)))
    return ty, lx


def cut_intervals(t, axis, v):
    """the stretches of a cut line (along x at y = v, or along y at x = v) that are inside the building"""
    ol = outline(t)
    span = t['W'] if axis == 'x' else t['D']
    n = max(8, int(span * 2))
    out, cur = [], None
    for i in range(n):
        u = span * (i + 0.5) / n
        q = (u, v) if axis == 'x' else (v, u)
        if inside(q, ol):
            if cur is None:
                cur = [span * i / n, span * (i + 1) / n]
            else:
                cur[1] = span * (i + 1) / n
        elif cur is not None:
            out.append(cur)
            cur = None
    if cur:
        out.append(cur)
    return [(round(a * 2) / 2, round(b * 2) / 2) for a, b in out if b - a > 0.5]


def draw_roof_plan(c, t, d, X, Y, k):
    """flat roofs: parapet, drains with overflow scuppers, slope arrows, rooftop units over their bays, roof hatch;
    pitched roofs: ridges, hips, eaves and downspouts"""
    ol = outline(t)
    W, D = t['W'], t['D']
    rf = d.get('roof') or {}
    typ = rf.get('type', 'gable')
    P = [(X(p[0]), Y(p[1])) for p in ol]
    if typ == 'flat':
        K.draw_poly(c, P, stroke=K.INK, lw=1.4)
        K.draw_poly(c, DR.inset(DR.ccw(P), 0.67 * k), stroke=K.INK, lw=0.6)  # parapet inner face
        area = foot_area(t)
        n = max(2, math.ceil(area / 4000))  # about one drain per 4,000 sf keeps each drainage run under ~60 ft
        drains = RU.inside_spots(t, n, margin=10, prefer_back=True)
        for (x, y) in drains:
            c.setStrokeColorRGB(*K.INK)
            c.setLineWidth(0.6)
            c.circle(X(x), Y(y), max(3, 0.9 * k), stroke=1, fill=0)
            c.circle(X(x), Y(y), max(1.2, 0.35 * k), stroke=1, fill=0)
            K.label(c, X(x), Y(y) - max(3, 0.9 * k) - 7, 'RD', 5.5, FB, halo=False)
            # four slope arrows toward the drain, each from about 16 ft out to 5 ft from it
            for ang in (0, 90, 180, 270):
                a = math.radians(ang)
                sx, sy = x + math.cos(a) * 16, y + math.sin(a) * 16
                if inside((sx, sy), ol):
                    ex, ey = x + math.cos(a) * 5, y + math.sin(a) * 5
                    c.setLineWidth(0.5)
                    c.line(X(sx), Y(sy), X(ex), Y(ey))
                    th_ = math.atan2(Y(ey) - Y(sy), X(ex) - X(sx))
                    for da in (2.6, -2.6):
                        c.line(X(ex), Y(ey), X(ex) + 5 * math.cos(th_ + da), Y(ey) + 5 * math.sin(th_ + da))
            # overflow scupper at the nearest wall
            q, dist_, _ = G.nearest_on_line((x, y), ol, closed=True)
            c.setFillColorRGB(*K.INK)
            c.rect(X(q[0]) - 3, Y(q[1]) - 3, 6, 6, stroke=0, fill=1)
            K.label(c, X(q[0]), Y(q[1]) + 8, 'OF SCUPPER', 4.8, F, halo=True)
        K.label(c, X(drains[0][0]) + 20, Y(drains[0][1]) + 14, '1/4"/FT MIN.', 5.5, F)
        for s_, x, y in RU.rtu_spots(t, d):
            sw, sd = 8 * k, 5 * k
            c.setFillColorRGB(0.85, 0.85, 0.85)
            c.setStrokeColorRGB(*K.INK)
            c.setLineWidth(0.7)
            c.rect(X(x) - sw / 2, Y(y) - sd / 2, sw, sd, stroke=1, fill=1)
            c.line(X(x) - sw / 2, Y(y) - sd / 2, X(x) + sw / 2, Y(y) + sd / 2)
            K.label(c, X(x), Y(y) + sd / 2 + 6, '%s (%s T)' % (s_['tag'], fmt(s_['tons'])), 5.2, FB)
        rh = next((r for r in d['rooms'] if r['type'] in ('janitor', 'storage', 'mechanical', 'electrical', 'corridor')), None)
        if rh:
            hx, hy = rh['x'] + min(rh['w'], 4) / 2 + 0.5, rh['y'] + min(rh['d'], 4) / 2 + 0.5
            c.rect(X(hx) - 1.5 * k, Y(hy) - 1.5 * k, 3 * k, 3 * k, stroke=1, fill=0)
            c.line(X(hx) - 1.5 * k, Y(hy) - 1.5 * k, X(hx) + 1.5 * k, Y(hy) + 1.5 * k)
            K.label(c, X(hx), Y(hy) - 1.5 * k - 6, 'ROOF HATCH', 4.8, F)
        busy = [(x_, y_) for _, x_, y_ in RU.rtu_spots(t, d)] + list(drains)
        clear = [q for q in RU.inside_spots(t, 12, margin=10) if min(math.hypot(q[0] - b_[0], q[1] - b_[1]) for b_ in busy) > 14]
        if clear:
            K.label(c, X(clear[0][0]), Y(clear[0][1]), 'TPO ROOFING ON TAPERED INSULATION', 5.5, FB)
        return
    # pitched
    ov = float(rf.get('overhang', 1.5))
    K.draw_poly(c, P, stroke=K.INK, lw=0.5, dash=(3, 2))  # walls below
    E = [(X(-ov), Y(-ov)), (X(W + ov), Y(-ov)), (X(W + ov), Y(D + ov)), (X(-ov), Y(D + ov))]
    K.draw_poly(c, E, stroke=K.INK, lw=1.4)
    c.setLineWidth(0.8)
    c.setStrokeColorRGB(*K.INK)
    if typ == 'gable':
        if rf.get('ridge', 'along_front') == 'along_front':
            c.line(X(-ov), Y(D / 2), X(W + ov), Y(D / 2))
        else:
            c.line(X(W / 2), Y(-ov), X(W / 2), Y(D + ov))
    elif typ == 'hip':
        s_ = min(W, D) / 2
        if W >= D:
            c.line(X(s_), Y(D / 2), X(W - s_), Y(D / 2))
            for a, b in ((-ov, -ov), (-ov, D + ov), (W + ov, -ov), (W + ov, D + ov)):
                c.line(X(a), Y(b), X(s_ if a < W / 2 else W - s_), Y(D / 2))
        else:
            c.line(X(W / 2), Y(s_), X(W / 2), Y(D - s_))
            for a, b in ((-ov, -ov), (-ov, D + ov), (W + ov, -ov), (W + ov, D + ov)):
                c.line(X(a), Y(b), X(W / 2), Y(s_ if b < D / 2 else D - s_))
    for a, b in ((-ov, -ov), (W + ov, -ov), (W + ov, D + ov), (-ov, D + ov)):
        c.setFillColorRGB(*K.INK)
        c.rect(X(a) - 2, Y(b) - 2, 4, 4, stroke=0, fill=1)
    K.label(c, X(W / 2), Y(D / 2) + 8, '%s ROOF %s:12, %s OVERHANG' % (typ.upper(), fmt(rf.get('pitch', 6)), DR.ftin(ov)), 6, FB)
    K.label(c, X(W / 2), Y(D / 2) - 4, 'GUTTERS AND DOWNSPOUTS AT CORNERS (■)', 5.5, F)


def plan_views(c, ctx, t, d, overlay=None, light=False, roof=False, region=None, title='Floor plan', marks=True):
    """lays out every floor (and the roof) at one scale; overlay(c, f, X, Y, k) adds a discipline's layer.
    Returns (scale label, ft per in, unlabeled rooms)."""
    ax, ay, aw, ah = region or (K.AREA[0], K.AREA[1], K.AREA[2] - SIDE_W - 30, K.AREA[3])
    views = [(f, False) for f in floors_of(d)] + ([(None, True)] if roof else [])
    ft, lab, cols, rows, cw, ch = layout(len(views), t['W'], t['D'], ax, ay, aw, ah, margin_ft=12 if light else 30)
    k = 72.0 / ft
    unl = []
    ty, lx = section_lines(t, d)
    for i, (f, is_roof) in enumerate(views):
        cx = ax + (i % cols) * cw
        cy = ay + ah - (i // cols + 1) * ch
        ox = cx + (cw - t['W'] * k) / 2
        oy = cy + 50 + (ch - 50 - t['D'] * k) / 2
        X, Y = (lambda v, ox=ox: ox + v * k), (lambda v, oy=oy: oy + v * k)
        if is_roof:
            draw_roof_plan(c, t, d, X, Y, k)
        elif light:
            draw_floor(c, t, d, f, ox, oy, k, light=True)
        else:
            unl += [(n + len(unl), r) for n, r in draw_plan(c, t, d, f, X, Y, k)]
            plan_dims(c, t, d, f, X, Y, k)
            if marks and f == 1:
                ext = 14
                DR.section_cut(c, (X(0) - ext - 18, Y(ty)), (X(t['W']) + ext + 18, Y(ty)), 1, 'A-3%02d' % type_number(ctx, t))
                DR.section_cut(c, (X(lx), Y(t['D']) + ext + 18), (X(lx), Y(0) - ext - 18), 2, 'A-3%02d' % type_number(ctx, t))
        if overlay and not is_roof:
            overlay(c, f, X, Y, k)
        K.view_title(c, cx + 10, cy + 12, i + 1, ('Roof plan' if is_roof else (title if len(views) == 1 or f is None else '%s — %s' % (title, 'level %d' % f))), lab, ft)
        if not is_roof:
            K.label(c, ox + t['W'] * k / 2, oy - (64 if not light else 30), 'FRONT (STREET SIDE)', 6, F, K.GREY, halo=False)
    return lab, ft, unl


def side_column(c, blocks):
    x = K.AREA[0] + K.AREA[2] - SIDE_W
    y = K.AREA[1] + K.AREA[3]
    from .sheets_site import side_block
    for b in blocks:
        y = side_block(c, x, y, SIDE_W, b, K.AREA[1])


def type_table(t, d):
    R = d['rooms']
    cond = sum(room_area(r) for r in R if r['type'] not in ('garage', 'porch'))
    rows = [['Use', t['label']], ['Footprint', ('%s\' × %s\' overall, ' % (fmt(t['W']), fmt(t['D'])) if t.get('fp') else '%s\' × %s\', ' % (fmt(t['W']), fmt(t['D']))) + '{:,.0f} sf'.format(foot_area(t))],
            ['Floors', str(t['floors'])], ['Conditioned / enclosed', '{:,} sf'.format(int(cond))],
            ['Gross (per building)', '{:,} sf'.format(t['building_gsf'])], ['Buildings of this type', str(t['count'])], ['Occupancy', t['occupancy']], ['Construction', t['construction']],
            ['Sprinklers', ('Yes — ' if t['sprinklered'] else 'No — ') + t['sprinkler_why']]]
    garage = sum(room_area(r) for r in R if r['type'] == 'garage')
    if garage:
        rows.insert(4, ['Garage', '{:,} sf'.format(int(garage))])
    return rows


def roof_separate(t, d):
    """True when the floor plan alone gets a larger scale than floor plan + roof plan together: then the roof plan
    gets its own sheet"""
    ax, ay, aw, ah = K.AREA[0], K.AREA[1], K.AREA[2] - SIDE_W - 30, K.AREA[3]
    n = len(floors_of(d))
    one = layout(n, t['W'], t['D'], ax, ay, aw, ah, margin_ft=30)[0]
    two = layout(n + 1, t['W'], t['D'], ax, ay, aw, ah, margin_ft=30)[0]
    return two > one


def a_roof(c, ctx, sh):
    t, d = type_and_design(ctx, sh)
    ax, ay, aw, ah = K.AREA[0], K.AREA[1], K.AREA[2] - SIDE_W - 30, K.AREA[3]
    ft, lab, cols, rows, cw, ch = layout(1, t['W'], t['D'], ax, ay, aw, ah, margin_ft=30)
    k = 72.0 / ft
    ox, oy = ax + (aw - t['W'] * k) / 2, ay + 50 + (ah - 50 - t['D'] * k) / 2
    draw_roof_plan(c, t, d, lambda v: ox + v * k, lambda v: oy + v * k, k)
    K.view_title(c, ax + 10, ay + 12, 1, 'Roof plan', lab, ft)
    sh['scale'] = lab
    systems = RU.hvac_systems(t, d)
    rows_ = [[s_['tag'], s_['kind'], '%s T' % fmt(s_['tons'])] for s_ in systems if not is_res(t)]
    side_column(c, ([('table', 'Rooftop equipment', (['Tag', 'Unit', 'Size'], rows_, [0.6, 2, 0.5], (2,)))] if rows_ else []) +
                [('notes', 'Roof notes', ['Roofing: ' + ((d.get('exterior') or {}).get('roofing') or 'per the architect') + '.',
                                          'Roof drains (RD) with overflow scuppers (OF) through the parapet at each drain; size per IPC 1106 and the 100-year rainfall.',
                                          'Tapered insulation at 1/4" per foot minimum to the drains, with crickets at the parapets.',
                                          'Rooftop units on curbs over their tenant bays; equipment screening per the jurisdiction.' if not is_res(t) else 'Ventilation, flashing and underlayment per IRC R806 / R905.'])])


def a_plans(c, ctx, sh):
    t, d = type_and_design(ctx, sh)
    lab, ft, unl = plan_views(c, ctx, t, d, roof=not roof_separate(t, d))
    sh['scale'] = lab
    blocks = [('table', 'Type %s data' % t['id'], (None, type_table(t, d), [1, 1.5], ()))]
    if unl:
        blocks.append(('table', 'Room key (rooms too small to name on the plan)', (None, [[str(n), r['name']] for n, r in unl], [0.3, 2], ())))
    blocks += [('legend', 'Symbols', [('fill', DR.WALL_FILL, 'Exterior / masonry wall'), ('line', DR.WALL_FILL, 'Interior partition'),
                                      ('sq', K.INK, '01  Door mark (A-6xx schedule)'), ('sq', K.INK, 'W1  Window mark')]),
               ('text', 'Design summary', d.get('summary') or ''),
               ('notes', 'Plan notes', ['Dimensions to face of masonry / face of stud; do not scale the drawings.',
                                        'Exterior walls drawn %s thick; partitions 4-1/2".' % DR.ftin(wall_thick(t)),
                                        'Room sizes are schematic and checked by rule for fit, access, minimum sizes and egress.',
                                        'Bedroom windows meet emergency escape (IRC R310): 5.7 sf net clear opening, 44" max sill.' if is_res(t) else 'Accessible routes, restrooms and entries per TAS; door hardware per TAS 404.',
                                        'Attached units: 2-hour fire-resistance-rated common wall (IRC R302.2) from foundation to roof deck.' if t.get('attached') else 'Sections 1 and 2 are cut where marked; see A-3xx.']
                                        + ((ctx.p.get('disc') or {}).get('arch') or {}).get('notes', [])[:4])]
    side_column(c, blocks)


# ---------- elevations ----------
def visible_faces(t, side):
    """the outline's faces seen from `side`: [(u0, u1, depth)] in the view's own left-to-right u (feet), nearest first,
    each trimmed to what nearer faces leave visible"""
    ol = outline(t)
    W, D = t['W'], t['D']
    faces = []
    n = len(ol)
    for i in range(n):
        a, b = ol[i], ol[(i + 1) % n]
        if abs(a[1] - b[1]) < 1e-6 and side in ('front', 'back'):
            y = a[1]
            lo, hi = sorted((a[0], b[0]))
            mid = ((lo + hi) / 2, y + (-0.1 if side == 'front' else 0.1))
            if not inside(mid, ol):  # the outside is toward the viewer
                if side == 'front':
                    faces.append((lo, hi, y))
                else:
                    faces.append((W - hi, W - lo, D - y))
        elif abs(a[0] - b[0]) < 1e-6 and side in ('left', 'right'):
            x = a[0]
            lo, hi = sorted((a[1], b[1]))
            mid = (x + (-0.1 if side == 'left' else 0.1), (lo + hi) / 2)
            if not inside(mid, ol):
                if side == 'left':
                    faces.append((D - hi, D - lo, x))
                else:
                    faces.append((lo, hi, W - x))
    faces.sort(key=lambda f_: f_[2])
    out, covered = [], []
    for u0, u1, dep in faces:
        segs = [(u0, u1)]
        for c0, c1 in covered:
            nxt = []
            for s0, s1 in segs:
                if c1 <= s0 or c0 >= s1:
                    nxt.append((s0, s1))
                    continue
                if c0 > s0:
                    nxt.append((s0, c0))
                if c1 < s1:
                    nxt.append((c1, s1))
            segs = nxt
        out += [(s0, s1, dep) for s0, s1 in segs if s1 - s0 > 0.2]
        covered.append((u0, u1))
    return out


def to_u(t, side, v):
    """a coordinate along the side's wall (x for front / back, y for left / right) -> the view's u"""
    span = t['W'] if side in ('front', 'back') else t['D']
    return span - v if side in ('back', 'left') else v


def wall_depth(t, side, at):
    """a wall's coordinate (y for front / back, x for left / right) -> its depth from the viewer"""
    if side == 'front':
        return at
    if side == 'back':
        return t['D'] - at
    if side == 'left':
        return at
    return t['W'] - at


def elevation(c, t, d, side, x, y, k, notes):
    """one exterior elevation, ground line at y, the building's left end at x; materials hatched, openings drawn,
    keynotes collected in `notes` ({text: number}). Returns the drawing's height in pt."""
    W, D = t['W'], t['D']
    span = W if side in ('front', 'back') else D
    H = t['floors'] * t['floor_h']
    typ, pitch, ov, ridge_along, rise = roof_geom(t, d)
    ex = d.get('exterior') or {}
    walls = (ex.get('walls') or '').lower()
    flat = typ == 'flat'
    par = 3.0 if flat else 0.0
    U = lambda u: x + u * k
    V = lambda h: y + h * k

    def kn(text):
        if text not in notes:
            notes[text] = len(notes) + 1
        return notes[text]

    faces = visible_faces(t, side)
    depths = sorted({f_[2] for f_ in faces})
    prim = DR.material_of(walls) or ('siding' if is_res(t) else 'stucco')
    base = 'stone' if 'stone base' in walls or 'stone' in walls and prim != 'stone' else None
    band = 'stucco' if ('upper band' in walls or 'band' in walls) and ('eifs' in walls or 'stucco' in walls) and prim != 'stucco' else None
    key_pts = []
    for u0, u1, dep in faces:
        far = depths.index(dep)
        fillg = 1.0 - 0.05 * far
        top = H + par
        c.setFillColorRGB(fillg, fillg, fillg)
        c.setStrokeColorRGB(*K.INK)
        c.setLineWidth(1.1 if far == 0 else 0.7)
        c.rect(U(u0), V(0), (u1 - u0) * k, top * k, stroke=0, fill=1)
        # materials, bottom to top
        z0 = 0
        if base:
            DR.hatch(c, [(U(u0), V(0)), (U(u1), V(0)), (U(u1), V(3)), (U(u0), V(3))], base, k)
            z0 = 3
        z1 = H - (4 if band else 0)
        DR.hatch(c, [(U(u0), V(z0)), (U(u1), V(z0)), (U(u1), V(z1)), (U(u0), V(z1))], prim, k)
        if band:
            DR.hatch(c, [(U(u0), V(z1)), (U(u1), V(z1)), (U(u1), V(top)), (U(u0), V(top))], band, k)
        if par:
            c.setFillColorRGB(0.35, 0.35, 0.37)
            c.rect(U(u0), V(top) - 0.5 * k, (u1 - u0) * k, 0.5 * k, stroke=0, fill=1)  # metal coping
        c.setLineWidth(1.1 if far == 0 else 0.7)
        c.rect(U(u0), V(0), (u1 - u0) * k, top * k, stroke=1, fill=0)
        key_pts.append((u0, u1, dep))
    # pitched roofs over the walls
    if not flat:
        top_y = V(H)
        across = D if ridge_along else W
        faces_gable = (side in ('left', 'right')) == ridge_along if typ == 'gable' else False
        end_on = (side in ('left', 'right')) == ridge_along
        if typ == 'shed':
            pts = [(U(-ov), top_y), (U(span + ov), top_y), (U(span + ov), top_y + rise * k), (U(-ov), top_y + rise * k)]
        elif faces_gable or (typ == 'hip' and end_on):
            pts = [(U(-ov), top_y), (U(span + ov), top_y), (U(span / 2), top_y + rise * k)]
        elif typ == 'hip':
            ins = min(span / 2, across / 2)
            pts = [(U(-ov), top_y), (U(span + ov), top_y), (U(span - ins), top_y + rise * k), (U(ins), top_y + rise * k)]
        else:
            pts = [(U(-ov), top_y), (U(span + ov), top_y), (U(span + ov), top_y + rise * k), (U(-ov), top_y + rise * k)]
        K.draw_poly(c, pts, stroke=K.INK, fill=(0.66, 0.66, 0.68), lw=1)
        c.saveState()
        DR.clip_poly(c, pts)
        c.setStrokeColorRGB(0.5, 0.5, 0.52)
        c.setLineWidth(0.25)
        yy = top_y + max(2.2, 0.9 * k)
        while yy < top_y + rise * k:
            c.line(U(-ov), yy, U(span + ov), yy)
            yy += max(2.2, 0.9 * k)
        c.restoreState()
        key_pts.append(('roof', (U(span / 2), top_y + rise * k * 0.45)))
    # openings, only where their wall is the visible face at that point
    R = rooms_by_id(d)

    def visible_at(u, dep):
        for u0, u1, dd in faces:
            if u0 - 0.1 <= u <= u1 + 0.1:
                return abs(dd - dep) < 0.6
        return False
    store_spans = {}
    for wn in d.get('windows') or []:
        r = R.get(wn.get('room'))
        if not r or wn.get('side') != side:
            continue
        at = (r['y'] if side == 'front' else r['y'] + r['d']) if side in ('front', 'back') else (r['x'] if side == 'left' else r['x'] + r['w'])
        dep = wall_depth(t, side, at)
        for _, cpos, ww in window_positions(t, r, wn, d):
            u = to_u(t, side, cpos)
            if not visible_at(u, dep):
                continue
            hh = float(wn.get('height', 4))
            sill = (r['floor'] - 1) * t['floor_h'] + (1.0 if hh >= 7 and not is_res(t) else 3.0)
            hh = min(hh, t['floor_h'] - (sill - (r['floor'] - 1) * t['floor_h']) - 0.5)
            gx, gy, gw, gh = U(u - ww / 2), V(sill), ww * k, hh * k
            c.setFillColorRGB(0.80, 0.87, 0.93)
            c.setStrokeColorRGB(*K.INK)
            c.setLineWidth(0.8)
            c.rect(gx, gy, gw, gh, stroke=1, fill=1)
            c.setLineWidth(0.4)
            if hh >= 7 and not is_res(t):  # storefront: mullions about 5 ft, a transom at 8 ft
                nm = max(1, round(ww / 5))
                for j in range(1, nm):
                    c.line(gx + gw * j / nm, gy, gx + gw * j / nm, gy + gh)
                if hh > 8.5:
                    c.line(gx, V(sill + 7.5), gx + gw, V(sill + 7.5))
                store_spans.setdefault((r['id'], dep), []).append((u - ww / 2, u + ww / 2, sill + hh))
                kn('Storefront: ' + (ex.get('windows') or 'aluminum storefront system'))
            else:
                c.line(gx, gy + gh / 2, gx + gw, gy + gh / 2)
                kn('Windows: ' + (ex.get('windows') or 'insulated windows'))
    for dr in d.get('doors') or []:
        if dr.get('b') != 'outside':
            continue
        g = door_geometry(t, R, dr)
        if not g or g['side'] != side:
            continue
        u = to_u(t, side, g['c'])
        dep = wall_depth(t, side, g['at'])
        if not visible_at(u, dep):
            continue
        kind = g['kind']
        hh = 8 if kind == 'overhead' else 7 if is_res(t) else 8
        if kind == 'overhead' and g['width'] >= 10 and not is_res(t):
            hh = 12
        gx, gw = U(u - g['width'] / 2), g['width'] * k
        c.setStrokeColorRGB(*K.INK)
        c.setLineWidth(0.8)
        if kind == 'overhead':
            c.setFillColorRGB(0.86, 0.86, 0.86)
            c.rect(gx, V(0), gw, hh * k, stroke=1, fill=1)
            c.setLineWidth(0.3)
            for i in range(1, 5):
                c.line(gx, V(hh * i / 5), gx + gw, V(hh * i / 5))
            kn('Overhead door, insulated steel')
        elif kind in ('storefront', 'double', 'sliding') and not is_res(t):
            c.setFillColorRGB(0.80, 0.87, 0.93)
            c.rect(gx, V(0), gw, hh * k, stroke=1, fill=1)
            c.setLineWidth(0.4)
            c.line(gx + gw / 2, V(0), gx + gw / 2, V(hh))
            c.line(gx, V(hh) + 0.0, gx + gw, V(hh))
            store_spans.setdefault((g['a']['id'], dep), []).append((u - g['width'] / 2, u + g['width'] / 2, hh))
            kn('Entry doors: ' + (ex.get('doors') or 'aluminum storefront entries'))
        else:
            c.setFillColorRGB(*((0.55, 0.42, 0.32) if is_res(t) else (0.70, 0.71, 0.73)))
            c.rect(gx, V(0), gw, hh * k, stroke=1, fill=1)
            c.setFillColorRGB(*K.INK)
            c.circle(gx + gw * 0.82, V(3.4), 0.9, stroke=0, fill=1)
            kn('Service doors: hollow metal, painted' if not is_res(t) else 'Entry door: ' + (ex.get('doors') or 'insulated door'))
    # canopies over the storefronts, when the exterior notes call for them
    canopy = (not is_res(t)) and any(w_ in ((ex.get('accent') or '') + ' ' + walls).lower() for w_ in ('canop', 'awning'))
    if canopy:
        for (rid, dep), sp in store_spans.items():
            lo, hi = min(a for a, _, _ in sp) - 1.5, max(b for _, b, _ in sp) + 1.5
            z = max(h_ for _, _, h_ in sp) + 1.0
            c.setFillColorRGB(0.22, 0.22, 0.24)
            c.rect(U(lo), V(z), (hi - lo) * k, 1.0 * k, stroke=0, fill=1)
            c.setStrokeColorRGB(*K.INK)
            c.setLineWidth(0.3)
            for tie in (lo + 1, hi - 1):
                c.line(U(tie), V(z + 1), U(tie + 2), V(z + 4))
        kn('Canopy: ' + (ex.get('accent') or 'metal canopy'))
    # keynotes for the wall materials, with leaders to the nearest face
    if key_pts:
        u0, u1, dep = next(f_ for f_ in key_pts if not isinstance(f_[0], str))
        mats = [(('Walls: ' + ex['walls']) if ex.get('walls') else None, (u0 + (u1 - u0) * 0.15, (3 + H) / 2))]
        if base:
            mats.append(('Base: cast stone / stone veneer', (u0 + (u1 - u0) * 0.08, 1.5)))
        if band:
            mats.append(('Upper band: EIFS / stucco, smooth finish', (u0 + (u1 - u0) * 0.3, H - 2)))
        if par:
            mats.append(('Parapet with prefinished metal coping', (u0 + (u1 - u0) * 0.5, H + par - 0.25)))
        mats = [m_ for m_ in mats if m_[0]]
        for i, (text, (_, h)) in enumerate(mats):  # tags in a row above the wall, leaders down to each material
            u = u0 + min(u1 - u0, 60) * (0.08 + 0.84 * i / max(1, len(mats)))
            n_ = kn(text)
            DR.keynote(c, (U(u), V(h)), (U(u) + 10, V(H + par) + 18), n_)
        if not flat:
            n_ = kn('Roofing: ' + (ex.get('roofing') or 'roofing'))
            pt = next(p_ for p_ in key_pts if isinstance(p_[0], str))[1]
            DR.keynote(c, pt, (pt[0] + 20, pt[1] + 26), n_)
    # ground, levels and the overall dimension
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(1.8)
    c.line(U(-6), y, U(span + 6), y)
    lx = U(span) + 10
    DR.level(c, lx, V(0), 'Finish floor', "0'-0\"", 40)
    for f in range(1, t['floors']):
        DR.level(c, lx, V(f * t['floor_h']), 'Level %d' % (f + 1), DR.ftin(f * t['floor_h']), 40)
    DR.level(c, lx, V(H), 'Top of wall / plate' if not flat else 'Roof bearing', DR.ftin(H), 40)
    if flat:
        DR.level(c, lx, V(H + par), 'Top of parapet', DR.ftin(H + par), 40)
    else:
        DR.level(c, lx, V(H + rise), 'Ridge', DR.ftin(H + rise), 40)
    DR.dim(c, (U(0), y), (U(span), y), -16, k=k)
    return (H + max(par, rise)) * k


def elev_layout(t, d, aw, ah):
    """the arrangement of the four elevations that gives the largest scale -> (scale ft per in, label, rows)"""
    H = t['floors'] * t['floor_h'] + max(3, roof_geom(t, d)[4]) + 2
    W, D = t['W'], t['D']
    opts = [[['front'], ['back'], ['left', 'right']], [['front', 'right'], ['back', 'left']], [['front'], ['right'], ['back'], ['left']]]
    best = None
    for rows in opts:
        rh = ah / len(rows)
        for ft, lab in ARCH_SCALES_ELEV:
            k = 72.0 / ft
            ok = all(sum((W if s in ('front', 'back') else D) * k + 150 for s in row) <= aw and (H + 4) * k + 95 <= rh for row in rows)
            if ok:
                if best is None or ft < best[0]:
                    best = (ft, lab, rows)
                break
    return best or (64, '3/16" = 1\'-0"', opts[2])


ARCH_SCALES_ELEV = [(2, '1/2" = 1\'-0"'), (8 / 3, '3/8" = 1\'-0"'), (4, '1/4" = 1\'-0"'), (16 / 3, '3/16" = 1\'-0"'), (8, '1/8" = 1\'-0"'),
                    (32 / 3, '3/32" = 1\'-0"'), (16, '1/16" = 1\'-0"'), (32, '1/32" = 1\'-0"'), (64, '1/64" = 1\'-0"')]


def a_elev(c, ctx, sh):
    t, d = type_and_design(ctx, sh)
    ax, ay, aw, ah = K.AREA
    aw2 = aw - SIDE_W - 30
    ft, lab, rows = elev_layout(t, d, aw2, ah)
    k = 72.0 / ft
    sh['scale'] = lab
    notes = {}
    n = 0
    rh = ah / len(rows)
    for ri, row in enumerate(rows):
        cy = ay + ah - (ri + 1) * rh
        widths = [(t['W'] if s in ('front', 'back') else t['D']) * k for s in row]
        free = aw2 - sum(widths) - 150 * len(row)
        x = ax + 40 + free / (len(row) + 1)
        for s_, w_ in zip(row, widths):
            n += 1
            elevation(c, t, d, s_, x, cy + 70, k, notes)
            K.view_title(c, x, cy + 16, n, '%s elevation' % s_.capitalize(), lab, ft)
            x += w_ + 150 + free / (len(row) + 1)
    ex = d.get('exterior') or {}
    side_column(c, [('table', 'Keynotes', (None, [[str(v), k_] for k_, v in sorted(notes.items(), key=lambda kv: kv[1])], [0.25, 3], ())),
                    ('table', 'Exterior materials', (None, [['Walls', ex.get('walls', '—')], ['Accent', ex.get('accent', '—')], ['Roofing', ex.get('roofing', '—')],
                                                            ['Windows', ex.get('windows', '—')], ['Doors', ex.get('doors', '—')]], [1, 2.2], ())),
                    ('notes', 'Elevation notes', ['Elevations are generated from the floor plan, roof and materials; openings are placed as on the plans.',
                                                  'Left and right are as seen from the street; the back elevation is drawn as seen from behind. Farther wall planes are shaded lighter.',
                                                  'Floor to floor %s; verify heights, parapets and signage bands with the architect and the sign ordinance.' % DR.ftin(t['floor_h'])])])


# ---------- sections ----------
def section_view(c, t, d, axis, v, x, y, k, label_rooms=True):
    """one building section along `axis` ('x': cut along x at y = v, looking to the back; 'y': cut along y at x = v,
    looking to the right). Draws only where the cut is inside the building; returns the drawing height in pt."""
    H = t['floors'] * t['floor_h']
    typ, pitch, ov, r_along, r_rise = roof_geom(t, d)
    flat = typ == 'flat'
    span = t['W'] if axis == 'x' else t['D']
    U = lambda u: x + u * k
    V = lambda h: y + h * k
    wt = wall_thick(t)
    ivals = cut_intervals(t, axis, v)
    # what lies beyond the cut, in light line: the building's full extent
    c.setStrokeColorRGB(*K.LIGHT)
    c.setLineWidth(0.5)
    c.rect(U(0), V(0), span * k, (H + (3 if flat else 0)) * k, stroke=1, fill=0)
    # grade
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(1.6)
    c.line(U(-8), V(-0.5), U(span + 8), V(-0.5))
    DR.hatch(c, [(U(-8), V(-0.5)), (U(span + 8), V(-0.5)), (U(span + 8), V(-3.5)), (U(-8), V(-3.5))], 'earth', k, (0.65, 0.6, 0.55))
    for a, b in ivals:
        # slab and grade beams
        slab = [(U(a), V(0)), (U(b), V(0)), (U(b), V(-0.42)), (U(a), V(-0.42))]
        c.setFillColorRGB(1, 1, 1)
        K.draw_poly(c, slab, stroke=K.INK, fill=(0.88, 0.88, 0.88), lw=0.6)
        DR.hatch(c, slab, 'concrete', k)
        for e in (a, b - 1):
            gb = [(U(e), V(-0.42)), (U(e + 1), V(-0.42)), (U(e + 1), V(-2.5)), (U(e), V(-2.5))]
            K.draw_poly(c, gb, stroke=K.INK, fill=(0.88, 0.88, 0.88), lw=0.6)
            DR.hatch(c, gb, 'concrete', k)
        # exterior walls cut, parapets above flat roofs
        for e, s_ in ((a, 1), (b, -1)):
            x0_ = e if s_ > 0 else e - wt
            wall = [(U(x0_), V(0)), (U(x0_ + wt), V(0)), (U(x0_ + wt), V(H + (3 if flat else 0))), (U(x0_), V(H + (3 if flat else 0)))]
            K.draw_poly(c, wall, stroke=K.INK, fill=DR.WALL_FILL, lw=0.8)
            if flat:
                c.setFillColorRGB(0.35, 0.35, 0.37)
                c.rect(U(x0_) - 0.2 * k, V(H + 3), (wt + 0.4) * k, 0.3 * k, stroke=0, fill=1)
        # floors and roof structure
        for f in range(1, t['floors']):
            fl = [(U(a), V(f * t['floor_h'])), (U(b), V(f * t['floor_h'])), (U(b), V(f * t['floor_h'] - 1.2)), (U(a), V(f * t['floor_h'] - 1.2))]
            K.draw_poly(c, fl, stroke=K.INK, fill=(0.9, 0.9, 0.9), lw=0.6)
        if flat:
            deck = [(U(a + wt), V(H)), (U(b - wt), V(H)), (U(b - wt), V(H + 0.6)), (U(a + wt), V(H + 0.6))]
            K.draw_poly(c, deck, stroke=K.INK, fill=(0.95, 0.95, 0.95), lw=0.6)
            DR.hatch(c, deck, 'insulation', k)
            c.setStrokeColorRGB(*K.INK)
            c.setLineWidth(0.5)
            jd = 2.0  # bar joists about 24" deep, drawn as a chord pair with webs
            c.line(U(a + wt), V(H), U(b - wt), V(H))
            c.line(U(a + wt), V(H - jd), U(b - wt), V(H - jd))
            c.setLineWidth(0.3)
            step = max(2.0, 2.0) * k
            xx = U(a + wt)
            up = False
            while xx < U(b - wt) - step:
                c.line(xx, V(H - jd) if not up else V(H), xx + step, V(H) if not up else V(H - jd))
                xx += step
                up = not up
        else:
            ridge_across = r_along == (axis == 'y')
            if ridge_across:
                K.draw_poly(c, [(U(a - ov), V(H - ov * pitch / 12)), (U((a + b) / 2), V(H + r_rise)), (U(b + ov), V(H - ov * pitch / 12))], stroke=K.INK, lw=1.4, close=False)
                c.setLineWidth(0.5)
                c.line(U(a), V(H), U(b), V(H))
                for j in range(1, 8):
                    xx = a + (b - a) * j / 8
                    c.line(U(xx), V(H), U(xx), V(H + r_rise * (1 - abs(j / 8 - 0.5) * 2)))
            else:
                # cut along the ridge: a gable shows its full height to the ends, a hip slopes down to them
                run = min((b - a) / 2, r_rise * 12 / max(pitch, 1)) if typ == 'hip' else 0
                c.setFillColorRGB(0.9, 0.9, 0.9)
                c.setStrokeColorRGB(*K.INK)
                K.draw_poly(c, [(U(a - ov), V(H)), (U(a + run), V(H + r_rise)), (U(b - run), V(H + r_rise)), (U(b + ov), V(H))],
                            stroke=K.INK, fill=(0.9, 0.9, 0.9), lw=1.0)
                K.label(c, U((a + b) / 2), V(H + r_rise / 2), 'ROOF BEYOND', 6, F, halo=False)
    # partitions and rooms cut by the line
    for f in floors_of(d):
        base = (f - 1) * t['floor_h']
        for r in d['rooms']:
            if r['floor'] != f:
                continue
            if axis == 'x' and r['y'] < v < r['y'] + r['d']:
                a0, a1 = r['x'], r['x'] + r['w']
            elif axis == 'y' and r['x'] < v < r['x'] + r['w']:
                a0, a1 = r['y'], r['y'] + r['d']
            else:
                continue
            open_ = r['type'] in ('tenant', 'warehouse', 'sanctuary') and not is_res(t)
            ceil = t['floor_h'] - (1.2 if t['floors'] > 1 and f < t['floors'] else (2.5 if flat else 0)) if open_ else min(10 if not is_res(t) else 9, t['floor_h'] - 1)
            for e in (a0, a1):
                if any(abs(e - q) < 0.6 for iv in ivals for q in iv):
                    continue
                c.setFillColorRGB(*DR.WALL_FILL)
                c.rect(U(e) - 0.19 * k, V(base), 0.375 * k, ceil * k, stroke=0, fill=1)
            if not open_:
                c.setStrokeColorRGB(*K.GREY)
                c.setLineWidth(0.5)
                c.setDash([4, 2])
                c.line(U(a0), V(base + ceil), U(a1), V(base + ceil))
                c.setDash()
            if label_rooms and (a1 - a0) * k > 26:
                DR.fit_text(c, U((a0 + a1) / 2), V(base + min(ceil, 8) / 2 + 0.5), (a1 - a0) * k - 4, min(ceil, 8) * k, [r['name'].upper()],
                            max_size=7.5, min_size=4.6, sub=('OPEN TO STRUCTURE' if open_ else 'CLG. %s' % DR.ftin(ceil)))
    lx = U(span) + 14
    DR.level(c, lx, V(0), 'Finish floor', "0'-0\"", 40)
    DR.level(c, lx, V(H), 'Roof bearing' if flat else 'Top of plate', DR.ftin(H), 40)
    if flat:
        DR.level(c, lx, V(H + 3), 'Top of parapet', DR.ftin(H + 3), 40)
    DR.dim(c, (U(0), V(0)), (U(0), V(H)), 14, k=k)
    return (H + 3) * k


def a_section(c, ctx, sh):
    t, d = type_and_design(ctx, sh)
    ax, ay, aw, ah = K.AREA
    aw2 = aw - SIDE_W - 30
    H = t['floors'] * t['floor_h'] + max(3, roof_geom(t, d)[4]) + 6
    ch = ah / 2
    best = None
    for ft, lab in ARCH_SCALES_ELEV:
        k = 72.0 / ft
        if max(t['W'], t['D']) * k + 190 <= aw2 and H * k + 110 <= ch:
            best = (ft, lab)
            break
    ft, lab = best or (64, '1/64" = 1\'-0"')
    k = 72.0 / ft
    sh['scale'] = lab
    ty, lx = section_lines(t, d)
    for i, (name, axis, v) in enumerate((('Section 1 — transverse', 'x', ty), ('Section 2 — longitudinal', 'y', lx))):
        span = t['W'] if axis == 'x' else t['D']
        cx = ax + 30 + (aw2 - 160 - span * k) / 2
        cy = ay + ah - (i + 1) * ch + 80
        section_view(c, t, d, axis, v, cx, cy, k)
        K.view_title(c, ax + 10, ay + ah - (i + 1) * ch + 16, i + 1, name, lab, ft, sub='cut at %s = %s (see A-1xx)' % ('y' if axis == 'x' else 'x', DR.ftin(v)))
    sysd = d.get('systems') or {}
    side_column(c, [('table', 'Section basis', (None, [['Structure', sysd.get('structure', '—')], ['Foundation', sysd.get('foundation', '—')], ['Floor to floor', DR.ftin(t['floor_h'])],
                                                       ['Roof', '%s, %s:12' % ((d.get('roof') or {}).get('type', '—'), fmt((d.get('roof') or {}).get('pitch', 0)))]], [1, 2], ())),
                    ('notes', 'Notes', ['Sections are cut where marked on the floor plan; the light outline is the building beyond the cut.',
                                        'Bar joists about 24" deep shown schematically; sizes by the structural engineer.' if roof_geom(t, d)[0] == 'flat' else 'Trusses / rafters shown schematically; sizes by the truss engineer.',
                                        'Insulation per IECC 2021 climate zone 2A: R-13 + R-5 ci walls or R-20 cavity, R-38 ceilings (residential); R-30 ci roofs (commercial).'])])


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

    from . import details as DT
    items = ([('Typical wall section — wood frame', DT.wall_wood)] if res else []) + ([('Typical wall section — masonry / steel', DT.wall_commercial)] if com else [])
    details_sheet(c, ctx, sh, items, ['Assemblies are typical for pricing; the architect of record selects and details the final assemblies.', 'Energy: IECC 2021 climate zone 2A.',
                                      'Fire-resistance-rated assemblies (party walls, separation walls) per a listed design (UL / GA).'])


RENDERERS = {'a-plans': a_plans, 'a-roof': a_roof, 'a-elev': a_elev, 'a-section': a_section, 'a-sched': a_sched, 'a-details': a_details}
