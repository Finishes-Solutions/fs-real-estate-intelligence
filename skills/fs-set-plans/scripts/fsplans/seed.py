"""Rule-based seed designs: the app's fallbackDesign (lib/plandesign.mjs), in Python. A seed passes the design checks
as it stands; the agent's job is to improve it into a plan an architect would draw (the app gives Claude the same seed),
and the set falls back to it when a design keeps failing. Shells get one bay per ~30 ft of frontage with a restroom and
back of house each; restaurants, warehouses and homes their own arrangements; an L / U / stepped outline is laid out
wing by wing and joined."""
from collections import deque
from .design import is_res, outline, exterior_span, door_geometry, rooms_by_id, SIDES
from .geom import inside, shared_wall


def r2(v):
    return round(v * 2) / 2


def clamp(v, a, b):
    return max(a, min(b, v))


def fallback_design(t):
    if t.get('fp'):
        return fallback_pieces(t)
    W, D, F = float(t['W']), float(t['D']), int(t.get('floors', 1))
    rooms, doors, windows = [], [], []

    def room(id_, name, type_, floor, x, y, w, d):
        rooms.append(dict(id=id_, name=name, type=type_, floor=floor, x=r2(x), y=r2(y), w=r2(w), d=r2(d)))
        return id_

    def door(a, b, width=3, kind='swing', side='any'):
        doors.append(dict(a=a, b=b, width=width, kind=kind, side=side))

    def win(r, side, count=1, width=3, height=5):
        windows.append(dict(room=r, side=side, count=count, width=width, height=height))

    def get(id_):
        return next((r for r in rooms if r['id'] == id_), None)

    if is_res(t):
        lr = not t.get('attached')
        g = int(t.get('garage') or 0)
        gw0 = min(21, W - 6) if g >= 2 else min(12, W - 6) if g else 0
        gw = r2(gw0) if gw0 >= 10 else 0
        fb = 22 if gw else 12
        cw = r2(clamp(W * 0.3, 8, 12))
        if gw:
            room('garage', 'Garage', 'garage', 1, 0, 0, gw, fb)
            door('garage', 'outside', 16 if g >= 2 else 9, 'overhead', 'front')
        room('entry', 'Entry', 'entry', 1, gw, 0, W - gw, fb)
        door('entry', 'outside', 3, 'swing', 'front')
        win('entry', 'front', 1, 2)
        avail = D - fb
        st = min(11, avail) if F > 1 else 0
        left = avail - st
        ld = 7 if left >= 7 else left if left >= 5 else 0
        left -= ld
        pd = 5 if left >= 5 else 0
        left -= pd
        pan = left if left >= 4 else 0
        if not pan and left > 0 and st:
            st += left
        y, sy, col = fb, None, []
        if ld:
            col.append(room('laundry', 'Laundry', 'laundry', 1, 0, y, cw, ld))
            y += ld
        if pd:
            col.append(room('pwd', 'Powder', 'half_bath', 1, 0, y, cw, pd))
            y += pd
        if st:
            sy = y
            room('stair1', 'Stair', 'stair', 1, cw - 4, sy, 4, st)
            if cw - 4 >= 2:
                room('ustor', 'Storage', 'storage', 1, 0, sy, cw - 4, st)
            y += st
        if pan:
            col.append(room('pantry', 'Pantry', 'pantry', 1, 0, y, cw, pan))
            y += pan
        if not st and not pan and y < D and col:
            last = get(col[-1])
            last['d'] = r2(last['d'] + D - y)
        if D - fb >= 26:
            kd = r2((D - fb) * 0.45)
            room('kitchen', 'Kitchen / dining', 'kitchen', 1, cw, fb, W - cw, kd)
            room('living', 'Living', 'living', 1, cw, fb + kd, W - cw, D - fb - kd)
            door('entry', 'kitchen', 3, 'opening')
            door('kitchen', 'living', 6, 'opening')
            if lr:
                win('kitchen', 'right', 1, 4, 4)
        else:
            room('living', 'Living / kitchen', 'living', 1, cw, fb, W - cw, D - fb)
            door('entry', 'living', 3, 'opening')
        kit = get('kitchen')

        def hub(y0, y1):
            return 'kitchen' if kit and min(y1, kit['y'] + kit['d']) - max(y0, kit['y']) >= 3.5 else 'living'
        for id_ in col:
            r = get(id_)
            door(hub(r['y'], r['y'] + r['d']), id_, 2.5)
        if st:
            door(hub(sy, sy + st), 'stair1', 3)
            if get('ustor'):
                door('stair1', 'ustor', 2)
        if gw:
            door('garage', 'laundry' if ld else 'entry', 3)
        door('living', 'outside', 6, 'sliding', 'back')
        win('living', 'back', 2, 4, 6)
        for f in range(2, F + 1):
            s, hall = 'stair%d' % f, 'hall%d' % f
            room(s, 'Stair', 'stair', f, cw - 4, sy, 4, st)
            room(hall, 'Hall', 'hall', f, cw, 0, 4, D)
            door(hall, s, 3.5)
            if cw - 4 >= 2:
                room('lin%d' % f, 'Linen', 'closet', f, 0, sy, cw - 4, st)
                door(s, 'lin%d' % f, 2)
            back_bath = D - sy - st >= 5
            front_bath = min(7, sy) if (not back_bath or (F > 2 and f == F)) else 0
            if sy - front_bath >= 9 and cw >= 9:
                room('bd%dc' % f, 'Bedroom', 'bedroom', f, 0, 0, cw, sy - front_bath)
                door(hall, 'bd%dc' % f, 2.67)
                win('bd%dc' % f, 'front', 1)
            elif sy - front_bath > 2:
                room('cl%dc' % f, 'Closet', 'closet', f, 0, 0, cw, sy - front_bath)
                door(hall, 'cl%dc' % f, 2.5)
            if front_bath >= 5:
                room('bf%d' % f, 'Bath', 'bath', f, 0, sy - front_bath, cw, front_bath)
                door(hall, 'bf%d' % f, 2.5)
            elif front_bath > 0:
                c = get('bd%dc' % f) or get('cl%dc' % f)
                if c:
                    c['d'] = r2(c['d'] + front_bath)
            if D - sy - st > 2:
                big = D - sy - st >= 5
                room('ba%d' % f, 'Bath' if big else 'Linen', 'bath' if big else 'closet', f, 0, sy + st, cw, D - sy - st)
                door(hall, 'ba%d' % f, 2.5)
            rx = cw + 4
            rw = W - rx
            half = r2(D / 2)
            top = f == F
            room('bd%da' % f, 'Primary bedroom' if top else 'Bedroom', 'primary_bedroom' if top else 'bedroom', f, rx, half, rw, D - half)
            door(hall, 'bd%da' % f, 2.67)
            win('bd%da' % f, 'back', 2 if rw >= 14 else 1)
            room('bd%db' % f, 'Bedroom', 'bedroom', f, rx, 0, rw, half)
            door(hall, 'bd%db' % f, 2.67)
            win('bd%db' % f, 'front', 1)
        if F == 1:
            lv = get('living')
            if lv and lv['w'] >= 24 and lv['d'] >= 12:
                bw = r2(lv['w'] / 2)
                lv['w'] = bw
                rooms.append(dict(id='bd1', name='Bedroom', type='primary_bedroom', floor=1, x=lv['x'] + bw, y=lv['y'], w=W - lv['x'] - bw, d=lv['d']))
                door('living', 'bd1', 2.67)
                win('bd1', 'back', 1)
        return dict(summary='Rule-based %splan: %sliving at the back, bedrooms %s.' % ('%d-story ' % F if F > 1 else '', 'front garage, ' if gw else '',
                                                                                         'upstairs off a hall' if F > 1 else 'beside the living area'),
                    rooms=rooms, doors=doors, windows=windows, roof=dict(type='gable', pitch=6, ridge='along_front', overhang=1.5),
                    exterior=dict(walls='Brick veneer at the first floor, fiber cement lap siding above', accent='Painted trim', roofing='Architectural asphalt shingles',
                                  windows='White vinyl single-hung, low-E', doors='Fiberglass entry door, insulated steel garage door'),
                    systems=dict(structure='Wood frame, engineered roof trusses at 24 in', foundation='Post-tensioned slab on grade', hvac='split_system',
                                 water_heater='tankless_gas', sprinklered=bool(t.get('sprinklered')), fire_alarm=False))
    rs = r2(clamp(D * 0.22, 10, 16))
    flat = dict(type='flat', pitch=0, ridge='along_front', overhang=0)
    if t['use'] == 'restaurant':
        dd = r2(D * 0.5)
        mid = min(10, D - dd - 8)
        room('dining', 'Dining', 'dining_room', 1, 0, 0, W, dd)
        door('dining', 'outside', 6, 'storefront', 'front')
        win('dining', 'front', max(2, int(W // 10)), 6, 7)
        if W * D > 3000:
            door('dining', 'outside', 3, 'swing', 'left')
        room('rr1', 'Restroom', 'restroom', 1, 0, dd, 8, mid)
        room('rr2', 'Restroom', 'restroom', 1, 8, dd, 8, mid)
        door('dining', 'rr1', 3)
        door('dining', 'rr2', 3)
        room('stor', 'Dry storage', 'storage', 1, 0, dd + mid, 16, D - dd - mid)
        room('kitchen', 'Kitchen', 'commercial_kitchen', 1, 16, dd, W - 16, D - dd)
        door('dining', 'kitchen', 5, 'double')
        door('kitchen', 'stor', 3)
        door('kitchen', 'outside', 3, 'swing', 'back')
        return dict(summary='Rule-based restaurant: dining at the front, restrooms and storage on the left, kitchen behind.', rooms=rooms, doors=doors,
                    windows=windows, roof=flat,
                    exterior=dict(walls='Brick and stucco', accent='Metal canopy at the entry', roofing='TPO membrane behind parapets', windows='Aluminum storefront',
                                  doors='Aluminum storefront, hollow metal service door'),
                    systems=dict(structure='Load-bearing masonry and steel joists', foundation='Slab on grade with grade beams', hvac='rooftop_units',
                                 water_heater='tank_gas', sprinklered=bool(t.get('sprinklered')), fire_alarm=bool(t.get('sprinklered'))))
    if t['use'] == 'industrial':
        ow = r2(clamp(W * 0.25, 30, 60))
        od = min(40, D - 20)
        room('office', 'Office', 'office', 1, 0, 0, ow, od - 10)
        door('office', 'outside', 3, 'storefront', 'front')
        win('office', 'front', max(2, int(ow // 10)), 5, 6)
        room('rr1', 'Restroom', 'restroom', 1, 0, od - 10, ow / 2, 10)
        room('rr2', 'Restroom', 'restroom', 1, ow / 2, od - 10, ow / 2, 10)
        door('office', 'rr1', 3)
        door('office', 'rr2', 3)
        room('wh', 'Warehouse', 'warehouse', 1, ow, 0, W - ow, D)
        room('wh2', 'Warehouse', 'warehouse', 1, 0, od, ow, D - od)
        door('office', 'wh', 3)
        door('wh', 'wh2', min(20, ow - 2), 'opening')
        for _ in range(max(1, min(12, int((W - ow) // 40)))):
            door('wh', 'outside', 10, 'overhead', 'back')
        door('wh', 'outside', 3, 'swing', 'right')
        door('wh2', 'outside', 3, 'swing', 'left')
        return dict(summary='Rule-based warehouse: office and restrooms at the front left corner, warehouse with dock doors at the back.', rooms=rooms,
                    doors=doors, windows=windows, roof=flat,
                    exterior=dict(walls='Painted concrete tilt-wall panels', accent='Storefront glazing at the office', roofing='TPO membrane on steel deck',
                                  windows='Aluminum storefront and clerestory', doors='Insulated overhead dock doors'),
                    systems=dict(structure='Concrete tilt-wall with steel joists and girders on steel columns', foundation='Slab on grade with spread footings at the columns',
                                 hvac='rooftop_units', water_heater='tank_electric', sprinklered=bool(t.get('sprinklered')), fire_alarm=bool(t.get('sprinklered'))))
    # shells: bays across the front, each with its restroom and back of house; upper floors open with the stair
    use = t['use']
    n = clamp(round(W / 30), 1, 12) if use == 'retail' else clamp(round(W / 60), 1, 8) if use in ('office', 'medical', 'other') else 1
    bw = r2(W / n)
    label = {'retail': 'Tenant', 'office': 'Suite', 'medical': 'Suite', 'church': 'Sanctuary', 'fuel': 'Sales', 'amenity': 'Hall', 'other': 'Suite'}.get(use, 'Space')
    ty = {'retail': 'tenant', 'church': 'sanctuary', 'fuel': 'sales', 'amenity': 'other'}.get(use, 'tenant')
    store = use in ('retail', 'fuel')
    for i in range(n):
        x0 = r2(i * bw)
        w0 = W - x0 if i == n - 1 else bw
        sp, rr, bh = 'sp%d' % i, 'rr%d' % i, 'bh%d' % i
        room(sp, '%s %d' % (label, i + 1) if n > 1 else label, ty, 1, x0, 0, w0, D - rs)
        door(sp, 'outside', 6 if store else 3, 'storefront' if store else 'double', 'front')
        win(sp, 'front', max(1, int(w0 // 10)), 6, 7)
        rw = min(8, w0 - 2)
        stair_here = i == 0 and F > 1
        sw = min(12, w0 - rw - 1) if stair_here else 0
        room(rr, 'Restroom', 'restroom', 1, x0, D - rs, rw, rs)
        door(sp, rr, 3)
        if stair_here and sw >= 4:
            room('st1', 'Stair', 'stair', 1, x0 + rw, D - rs, sw, rs)
            door(sp, 'st1', 3)
        bx = x0 + rw + (sw if stair_here and sw >= 4 else 0)
        if x0 + w0 - bx >= 3:
            room(bh, 'Back of house', 'storage', 1, bx, D - rs, x0 + w0 - bx, rs)
            door(sp, bh, 3)
            door(bh, 'outside', 3, 'swing', 'back')
        elif W * D / n > 3000:
            door(sp, 'outside', 3, 'swing', 'left' if i == 0 else 'right')
    if W * D > 3000 and n == 1 and not any(d['b'] == 'outside' and d['side'] == 'back' for d in doors):
        door('sp0', 'outside', 3, 'swing', 'left')
    for f in range(2, F + 1):
        st = get('st1')
        if not st:
            break
        fl = 'fl%d' % f
        room('st%d' % f, 'Stair', 'stair', f, st['x'], st['y'], st['w'], st['d'])
        room(fl, '%ss, floor %d' % (label, f), ty, f, 0, 0, W, D - rs)
        door(fl, 'st%d' % f, 3)
        win(fl, 'front', max(1, int(W // 12)), 5, 6)
        win(fl, 'left', max(1, int((D - rs) // 15)), 5, 6)
        win(fl, 'right', max(1, int((D - rs) // 15)), 5, 6)
        room('rr%du' % f, 'Restroom', 'restroom', f, 0, D - rs, st['x'], rs)
        door(fl, 'rr%du' % f, 3)
        if W - st['x'] - st['w'] >= 3:
            room('mech%d' % f, 'Storage / mechanical', 'mechanical', f, st['x'] + st['w'], D - rs, W - st['x'] - st['w'], rs)
            door(fl, 'mech%d' % f, 3)
    return dict(summary='Rule-based shell: %d %s%s across the front, each with a restroom and back of house%s.' % (
        n, label.lower(), 's' if n > 1 else '', '; upper floors open with the stair' if F > 1 else ''), rooms=rooms, doors=doors, windows=windows, roof=flat,
        exterior=dict(walls='Brick veneer and metal panel' if use == 'fuel' else 'Brick, stone and EIFS', accent='Metal canopies over the storefronts',
                      roofing='TPO membrane behind parapets', windows='Aluminum storefront', doors='Aluminum storefront, hollow metal service doors'),
        systems=dict(structure='Masonry and steel, steel joists' if str(t.get('construction', '')).startswith('II') else 'Wood or light-gauge steel frame, open-web joists',
                     foundation='Slab on grade with grade beams', hvac='rooftop_units', water_heater='tank_electric', sprinklered=bool(t.get('sprinklered')),
                     fire_alarm=bool(t.get('sprinklered'))))


def notches_of(t):
    """the open ground inside an outline's bounding box (an L's notch, a U's courtyard) as rectangles"""
    if not t.get('fp'):
        return []
    P = outline(t)
    xs = sorted({0.0, float(t['W'])} | {float(p[0]) for p in P})
    ys = sorted({0.0, float(t['D'])} | {float(p[1]) for p in P})
    return [dict(x=xs[i], y=ys[j], w=xs[i + 1] - xs[i], d=ys[j + 1] - ys[j]) for i in range(len(xs) - 1) for j in range(len(ys) - 1)
            if not inside(((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2), P)]


def pieces_of(t):
    """the outline as rectangles (row strips merged down where they line up), largest first"""
    P = outline(t)
    xs = sorted({0.0, float(t['W'])} | {float(p[0]) for p in P})
    ys = sorted({0.0, float(t['D'])} | {float(p[1]) for p in P})
    rows = []
    for j in range(len(ys) - 1):
        row, run = [], None
        for i in range(len(xs) - 1):
            if inside(((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2), P):
                if run:
                    run['w'] += xs[i + 1] - xs[i]
                else:
                    run = dict(x=xs[i], y=ys[j], w=xs[i + 1] - xs[i], d=ys[j + 1] - ys[j])
                    row.append(run)
            else:
                run = None
        rows.append(row)
    out = []
    for row in rows:
        for r in row:
            up = next((o for o in out if o['x'] == r['x'] and o['w'] == r['w'] and abs(o['y'] + o['d'] - r['y']) < 0.01), None)
            if up:
                up['d'] += r['d']
            else:
                out.append(dict(r))
    return sorted(out, key=lambda q: -q['w'] * q['d'])


def unreachable(t, design):
    rooms = rooms_by_id(design)
    adj = {k: set() for k in rooms}
    start = set()
    for dr in design['doors']:
        a, b = rooms.get(dr['a']), rooms.get(dr['b'])
        if not a or not door_geometry(t, rooms, dr):
            continue
        if dr['b'] == 'outside':
            if a['floor'] == 1:
                start.add(a['id'])
        elif b and a['floor'] == b['floor']:
            adj[a['id']].add(b['id'])
            adj[b['id']].add(a['id'])
    stairs = [r for r in rooms.values() if r['type'] == 'stair']
    for s1 in stairs:
        for s2 in stairs:
            if s1 is not s2 and abs(s1['floor'] - s2['floor']) == 1 and abs(s1['x'] - s2['x']) < 0.5 and abs(s1['y'] - s2['y']) < 0.5:
                adj[s1['id']].add(s2['id'])
    seen, q = set(start), deque(start)
    while q:
        for n_ in adj[q.popleft()]:
            if n_ not in seen:
                seen.add(n_)
                q.append(n_)
    return [k for k in rooms if k not in seen]


def fallback_pieces(t):
    """an L / U / stepped outline: each rectangle laid out as a building of its own and put together; then the doors and
    windows that landed on inside walls are dropped and every room left without a way in is joined to a neighbour"""
    pieces = pieces_of(t)
    out = dict(rooms=[], doors=[], windows=[])
    first = None
    for i, pc in enumerate(pieces):
        pid = (lambda i_: lambda x: x if x == 'outside' else 'p%d_%s' % (i_, x))(i)
        if i and min(pc['w'], pc['d']) < 16:  # a sliver: one room, joined to its neighbour below
            for f in range(1, int(t.get('floors', 1)) + 1):
                kind = 'flex' if is_res(t) else 'sales' if t['use'] in ('retail', 'fuel') else 'storage'
                out['rooms'].append(dict(id=pid('s%d' % f), name='Flex' if is_res(t) else 'Display / entry' if kind == 'sales' else 'Storage', type=kind,
                                         floor=f, x=pc['x'], y=pc['y'], w=pc['w'], d=pc['d']))
            continue
        sub = fallback_design(dict(t, fp=None, W=pc['w'], D=pc['d']))
        first = first or sub
        for r in sub['rooms']:
            out['rooms'].append(dict(r, id=pid(r['id']), x=r2(r['x'] + pc['x']), y=r2(r['y'] + pc['y'])))
        for d in sub['doors']:
            out['doors'].append(dict(d, a=pid(d['a']), b=pid(d['b'])))
        for w in sub['windows']:
            out['windows'].append(dict(w, room=pid(w['room'])))
    out.update(summary='Rule-based plan for the %s outline: each of its %d wings laid out on its own and joined.' % (
        'L' if len(pieces) == 2 else 'shaped', len(pieces)), roof=first['roof'], exterior=first['exterior'], systems=first['systems'])
    for _ in range(5):
        rooms = rooms_by_id(out)
        keep = []
        for d in out['doors']:
            if d['b'] == 'outside':
                a = rooms.get(d['a'])
                sides = [d['side']] if d.get('side') in SIDES else SIDES
                ok = a and any((exterior_span(t, a, sd) or (0, 0))[1] - (exterior_span(t, a, sd) or (0, 0))[0] >= float(d.get('width', 3)) + 0.5 for sd in sides)
                if not ok and a:  # the side it was on is now inside: any outside wall long enough will do
                    alt = [sd for sd in SIDES if exterior_span(t, a, sd) and exterior_span(t, a, sd)[1] - exterior_span(t, a, sd)[0] >= float(d.get('width', 3)) + 0.5]
                    if alt:
                        d = dict(d, side=alt[0])
                        ok = True
                if not ok:
                    continue
            keep.append(d)
        out['doors'] = keep
        out['windows'] = [w for w in out['windows'] if rooms.get(w['room']) and exterior_span(t, rooms[w['room']], w['side'])]
        cut = unreachable(t, out)
        if not cut:
            break
        reach = [k for k in rooms if k not in cut]
        for id_ in cut:
            a = rooms[id_]
            best = None
            for k in reach:
                b = rooms[k]
                if b['floor'] != a['floor']:
                    continue
                sw = shared_wall(a, b)
                if sw and sw[3] - sw[2] >= 4 and (not best or sw[3] - sw[2] > best[1]):
                    best = (k, sw[3] - sw[2])
            if best:
                out['doors'].append(dict(a=best[0], b=id_, width=3, kind='swing', side='any'))
            elif a['floor'] == 1:
                ext = [sd for sd in SIDES if exterior_span(t, a, sd)]
                if ext:
                    out['doors'].append(dict(a=id_, b='outside', width=3, kind='swing', side=ext[0]))
    return out


SUPPORTED = ['sfr', 'townhomes', 'duplex', 'retail', 'restaurant', 'office', 'medical', 'church', 'industrial', 'fuel', 'amenity', 'other']


def design_brief(t, ctx=None):
    """the app's designBrief: what the type is, its footprint, its program and where it is"""
    ctx = ctx or {}
    res = is_res(t)
    ug = t.get('unit_gsf') or t['W'] * t['D']
    beds = (2 if ug < 1500 else 3 if ug < 2200 else 4 if ug < 3200 else 5) if res else 0
    use = t['use']
    prog = ('about %d bedrooms%s' % (beds, (', a %d-car garage at the front' % t['garage']) if t.get('garage') else '') if res else
            'a multi-tenant retail shell; about one tenant bay per 25 to 35 ft of frontage, each with its own storefront, restroom and rear service door' if use == 'retail' else
            'a full-service restaurant: dining, bar or counter, commercial kitchen, walk-in cooler, dry storage, office, two restrooms' if use == 'restaurant' else
            'a warehouse / distribution building with a front office (about 5 to 10% of the floor), restrooms, and overhead dock doors' if use == 'industrial' else
            'a convenience store: sales floor with cooler wall, checkout, food service counter, two restrooms, storage, office' if use == 'fuel' else
            ('medical office suites with exam rooms' if use == 'medical' else 'multi-tenant office suites') + ', lobby, restrooms, a core with stair' if use in ('office', 'medical') else
            'sanctuary, lobby / narthex, classrooms, office, restrooms, kitchen' if use == 'church' else 'as suits a ' + t.get('label', use).lower())
    lines = ['Building type %s: %s' % (t['id'], t.get('label', use)),
             'Footprint: W = %s ft (along the street) by D = %s ft (front to back), %d floor(s), floor to floor about %s ft.' % (t['W'], t['D'], t.get('floors', 1), t.get('floor_h')),
             'Shape: outline through %s; no rooms in the open ground of the notch.' % ' '.join('(%g, %g)' % tuple(q) for q in t['fp']) if t.get('fp') else '',
             'Program: %s.' % prog,
             'Occupancy %s, construction %s, sprinklers %s.' % (t.get('occupancy'), t.get('construction'), 'yes' if t.get('sprinklered') else 'no'),
             ('Location: ' + ctx['where']) if ctx.get('where') else '']
    return '\n'.join(x for x in lines if x)
