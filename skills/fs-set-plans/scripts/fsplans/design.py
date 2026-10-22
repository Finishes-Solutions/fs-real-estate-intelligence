"""Building types and their designs: code facts per use, the checks a design must pass, and the geometry the sheets
share (exterior walls, door and window positions). A type's own coordinates, in feet: x from the left end (0) to the
right end (W) as seen from the street, y from the front wall (0) to the back wall (D). Rooms are axis-aligned
rectangles {id, name, type, floor, x, y, w, d}. See references/building-design.md for the schema."""
from collections import deque
from .geom import inside, rects_overlap, shared_wall, area as poly_area

RESIDENTIAL = ['sfr', 'townhomes', 'duplex']
USE_LABEL = {'sfr': 'Single-family home', 'townhomes': 'Townhome', 'duplex': 'Duplex', 'retail': 'Retail shell', 'restaurant': 'Restaurant',
             'office': 'Office', 'medical': 'Medical office', 'church': 'Church', 'industrial': 'Warehouse', 'fuel': 'Convenience store / fuel',
             'amenity': 'Amenity building', 'multifamily': 'Apartment building', 'storage': 'Self storage', 'hotel': 'Hotel', 'other': 'Building'}
OCC = {'sfr': 'R-3 (IRC)', 'townhomes': 'R-3 townhouse (IRC)', 'duplex': 'R-3 (IRC)', 'retail': 'M', 'restaurant': 'A-2', 'office': 'B',
       'medical': 'B', 'church': 'A-3', 'industrial': 'S-1', 'fuel': 'M', 'amenity': 'A-3', 'multifamily': 'R-2', 'storage': 'S-1', 'hotel': 'R-1', 'other': 'B'}
BEDS = ['bedroom', 'primary_bedroom']
HABITABLE = ['living', 'family', 'dining', 'kitchen', 'bedroom', 'primary_bedroom', 'office', 'flex']
ROOM_TYPES = ['living', 'family', 'dining', 'kitchen', 'bedroom', 'primary_bedroom', 'bath', 'half_bath', 'closet', 'walk_in_closet', 'laundry', 'pantry',
              'entry', 'hall', 'stair', 'garage', 'office', 'flex', 'mechanical', 'electrical', 'storage', 'porch', 'tenant', 'sales', 'dining_room',
              'commercial_kitchen', 'walk_in_cooler', 'restroom', 'janitor', 'break_room', 'conference', 'reception', 'exam', 'corridor', 'lobby',
              'warehouse', 'sanctuary', 'classroom', 'other']


def is_res(t):
    return t['use'] in RESIDENTIAL


def sprinkler_rule(use, gsf, floors):
    if use in RESIDENTIAL:
        return (False, 'IRC R313 calls for townhouse sprinklers unless the jurisdiction amends it out, as many in Texas do; confirm'
                if use == 'townhomes' else 'Not required for one- and two-family dwellings (NFPA 13D optional)')
    o = OCC.get(use, 'B')
    if o.startswith('A'):
        return (True, 'A occupancy over 5,000 sf (IBC 903.2.1)') if gsf > 5000 else (False, 'A occupancy under 5,000 sf and under 100 occupants (IBC 903.2.1)')
    if o in ('M', 'S-1'):
        return (True, o + ' fire area over 12,000 sf (IBC 903.2.7 / 903.2.9)') if gsf > 12000 else (False, o + ' fire area under 12,000 sf')
    if o.startswith('R'):
        return (True, 'R-1 / R-2 occupancy (IBC 903.2.8)')
    return (True, 'More than three stories') if floors > 3 else (False, 'B occupancy, three stories or fewer')


def outline(t):
    return [tuple(p) for p in t['fp']] if t.get('fp') else [(0, 0), (t['W'], 0), (t['W'], t['D']), (0, t['D'])]


def foot_area(t):
    return poly_area(outline(t))


def normalize_type(t):
    """fills the code facts a type doesn't give"""
    t = dict(t)
    t.setdefault('label', USE_LABEL.get(t['use'], 'Building') + (' unit' if t.get('attached') else ''))
    t.setdefault('floors', 1)
    t.setdefault('floor_h', 10 if is_res(t) else 14 if t['use'] not in ('industrial', 'storage') else 28)
    t.setdefault('count', 1)
    t.setdefault('units_per', 1)
    t.setdefault('attached', t['use'] in ('townhomes', 'duplex') and t.get('units_per', 1) > 1)
    gsf_unit = foot_area(t) * t['floors']
    t['unit_gsf'] = round(gsf_unit)
    t['building_gsf'] = round(gsf_unit * (t['units_per'] if t['attached'] else 1))
    t.setdefault('occupancy', OCC.get(t['use'], 'B'))
    t.setdefault('construction', 'V-B (wood frame, IRC)' if is_res(t) else 'II-B (non-combustible)' if t['building_gsf'] > 25000 or t['use'] == 'industrial' else 'V-B (combustible)')
    on, why = sprinkler_rule(t['use'], t['building_gsf'], t['floors'])
    t.setdefault('sprinklered', on)
    t.setdefault('sprinkler_why', why)
    t['units'] = t['count'] * (t['units_per'] if is_res(t) else 0) if is_res(t) else 0
    return t


def type_name(t):
    return 'Type %s — %s (%s\' × %s\', %d %s)' % (t['id'], t['label'], fmt(t['W']), fmt(t['D']), t['floors'], 'stories' if t['floors'] > 1 else 'story')


def fmt(v):
    return str(int(v)) if float(v).is_integer() else str(v)


# ---------- geometry the sheets share ----------
SIDES = {'front': (0, -1), 'back': (0, 1), 'left': (-1, 0), 'right': (1, 0)}


def room_side(r, side):
    """the side's segment ((x1, y1), (x2, y2))"""
    x, y, w, d = r['x'], r['y'], r['w'], r['d']
    return {'front': ((x, y), (x + w, y)), 'back': ((x, y + d), (x + w, y + d)),
            'left': ((x, y), (x, y + d)), 'right': ((x + w, y), (x + w, y + d))}[side]


def exterior_span(t, r, side):
    """the longest run of the room's side that is an outside wall -> (a, b) along the side (x for front/back, y for
    left/right) or None. Party walls (attached units' left and right) are never outside walls."""
    if t.get('attached') and side in ('left', 'right'):
        return None
    ol = outline(t)
    (x1, y1), (x2, y2) = room_side(r, side)
    ox, oy = SIDES[side]
    horiz = side in ('front', 'back')
    a0, a1 = (x1, x2) if horiz else (y1, y2)
    runs, cur = [], None
    s = a0 + 0.25
    while s < a1:
        p = (s + ox * 0.4, y1 + oy * 0.4) if horiz else (x1 + ox * 0.4, s + oy * 0.4)
        q = (s - ox * 0.4, y1 - oy * 0.4) if horiz else (x1 - ox * 0.4, s - oy * 0.4)
        ext = (not inside(p, ol)) and inside(q, ol)
        if ext:
            cur = [s - 0.25, s + 0.25] if cur is None else [cur[0], s + 0.25]
        elif cur:
            runs.append(cur)
            cur = None
        s += 0.5
    if cur:
        runs.append(cur)
    if not runs:
        return None
    best = max(runs, key=lambda r_: r_[1] - r_[0])
    return (max(a0, best[0]), min(a1, best[1]))


def door_geometry(t, rooms, door):
    """-> dict(orient 'h'|'v', at, c (centre along the wall), width, a, b, exterior, side) or None"""
    a = rooms.get(door['a'])
    if not a:
        return None
    width = float(door.get('width') or 3)
    if door.get('b') == 'outside':
        sides = [door['side']] if door.get('side') in SIDES else list(SIDES)
        for side in sides:
            sp = exterior_span(t, a, side)
            if sp and sp[1] - sp[0] >= width + 0.5:
                (x1, y1), _ = room_side(a, side)
                horiz = side in ('front', 'back')
                return dict(orient='h' if horiz else 'v', at=y1 if horiz else x1, c=(sp[0] + sp[1]) / 2, width=width, a=a, b=None,
                            exterior=True, side=side, kind=door.get('kind', 'swing'))
        return None
    b = rooms.get(door.get('b'))
    if not b or a['floor'] != b['floor']:
        return None
    sw = shared_wall(a, b)
    if not sw or sw[3] - sw[2] < width + 0.5:
        return None
    return dict(orient=sw[0], at=sw[1], c=(sw[2] + sw[3]) / 2, width=width, a=a, b=b, exterior=False, side=None, kind=door.get('kind', 'swing'))


def window_positions(t, r, win, design=None):
    """-> [(side, centre along the wall, width)]. With the design, windows stay clear of the room's exterior doors on
    that wall (1 ft each side): they are shared out over the free stretches, evenly within each."""
    sp = exterior_span(t, r, win['side'])
    if not sp:
        return []
    n = max(1, int(win.get('count', 1)))
    w = float(win.get('width', 3))
    free = [list(sp)]
    if design:
        rooms = rooms_by_id(design)
        for dr in design.get('doors') or []:
            if dr.get('b') != 'outside' or dr.get('a') != r['id']:
                continue
            g = door_geometry(t, rooms, dr)
            if not g or g['side'] != win['side']:
                continue
            lo, hi = g['c'] - g['width'] / 2 - 1, g['c'] + g['width'] / 2 + 1
            nxt = []
            for a, b in free:
                if hi <= a or lo >= b:
                    nxt.append([a, b])
                    continue
                if lo - a >= w + 1:
                    nxt.append([a, lo])
                if b - hi >= w + 1:
                    nxt.append([hi, b])
            free = nxt
    free = [s_ for s_ in free if s_[1] - s_[0] >= w + 1]
    if not free:
        return []
    cap = [int((b - a) // (w + 1)) for a, b in free]
    n = max(1, min(n, sum(cap)))
    # share the windows out by length, never more than a stretch holds
    share = [0] * len(free)
    for _ in range(n):
        i = max((j for j in range(len(free)) if share[j] < cap[j]), key=lambda j: (free[j][1] - free[j][0]) / (share[j] + 1))
        share[i] += 1
    out = []
    for (a, b), k in zip(free, share):
        out += [(win['side'], a + (b - a) * (i + 1) / (k + 1), w) for i in range(k)]
    return out


def rooms_by_id(design):
    return {r['id']: r for r in design.get('rooms', [])}


def floors_of(design):
    return sorted({r['floor'] for r in design.get('rooms', [])}) or [1]


def room_area(r):
    return r['w'] * r['d']


# ---------- the checks ----------
def validate(t, design):
    """-> list of problems (empty: the design passes). Mirrors the app's placeDesign checks."""
    P = []
    W, D = t['W'], t['D']
    ol = outline(t)
    R = design.get('rooms') or []
    if not R:
        return ['The design has no rooms.']
    ids = set()
    for r in R:
        for k in ('id', 'name', 'type', 'floor', 'x', 'y', 'w', 'd'):
            if k not in r:
                P.append('Room %s is missing "%s".' % (r.get('id', '?'), k))
        if r.get('id') in ids:
            P.append('Room id "%s" is used twice.' % r.get('id'))
        ids.add(r.get('id'))
        if r.get('type') not in ROOM_TYPES:
            P.append('Room "%s" has an unknown type "%s".' % (r.get('name'), r.get('type')))
    if P:
        return P
    for r in R:
        if r['w'] <= 0 or r['d'] <= 0:
            P.append('Room "%s" has no size.' % r['name'])
            continue
        if r['x'] < -0.5 or r['y'] < -0.5 or r['x'] + r['w'] > W + 0.5 or r['y'] + r['d'] > D + 0.5:
            P.append('Room "%s" (floor %d) runs outside the %s x %s ft footprint.' % (r['name'], r['floor'], fmt(W), fmt(D)))
        elif t.get('fp'):
            pts = [(r['x'] + r['w'] * i / 4, r['y'] + r['d'] * j / 4) for i in range(1, 4) for j in range(1, 4)]
            if any(not inside(p, ol) for p in pts):
                P.append('Room "%s" (floor %d) runs into the open ground outside the building outline.' % (r['name'], r['floor']))
        if min(r['w'], r['d']) < 2:
            P.append('Room "%s" is under 2 ft wide.' % r['name'])
        if r['type'] in BEDS and (room_area(r) < 70 or min(r['w'], r['d']) < 7):
            P.append('Bedroom "%s" is %d sf, %s ft wide: at least 70 sf and 7 ft each way (IRC R304).' % (r['name'], room_area(r), fmt(min(r['w'], r['d']))))
        elif r['type'] in HABITABLE and r['type'] not in BEDS and min(r['w'], r['d']) < 7:
            P.append('"%s" is under 7 ft wide (IRC R304.2).' % r['name'])
    floors = sorted({r['floor'] for r in R})
    if floors[0] != 1:
        P.append('There is no floor 1.')
    nfl = max(floors)
    if nfl != t['floors']:
        P.append('The design has %d floors; the type has %d.' % (nfl, t['floors']))
    # overlap and coverage
    cells = [(x + 0.5, y + 0.5) for x in range(int(W)) for y in range(int(D)) if inside((x + 0.5, y + 0.5), ol)]
    for f in floors:
        fl = [r for r in R if r['floor'] == f]
        for i in range(len(fl)):
            for j in range(i + 1, len(fl)):
                a = rects_overlap(fl[i], fl[j])
                if a > 1:
                    P.append('Rooms "%s" and "%s" overlap on floor %d (%d sf).' % (fl[i]['name'], fl[j]['name'], f, a))
        cov = sum(1 for p in cells if any(r['x'] <= p[0] <= r['x'] + r['w'] and r['y'] <= p[1] <= r['y'] + r['d'] for r in fl)) / max(1, len(cells))
        if f == 1 and cov < 0.9:
            P.append('Floor 1 leaves about %d sf of the footprint without a room: tile the whole footprint.' % round((1 - cov) * len(cells)))
        if f > 1 and cov < 0.4:
            P.append('Floor %d has rooms over only %d%% of the footprint.' % (f, cov * 100))
        if nfl > 1 and not any(r['type'] == 'stair' for r in fl):
            P.append('Floor %d has no stair.' % f)
    # doors and reachability
    rooms = rooms_by_id(design)
    adj = {r['id']: set() for r in R}
    start = set()
    for dr in design.get('doors') or []:
        a = rooms.get(dr.get('a'))
        if not a:
            P.append('A door names a room that isn\'t in the design (%s / %s).' % (dr.get('a'), dr.get('b')))
            continue
        if dr.get('b') == 'outside':
            if a['floor'] != 1:
                P.append('Door to outside from "%s" is on floor %d: exterior doors only on floor 1.' % (a['name'], a['floor']))
                continue
            if not door_geometry(t, rooms, dr):
                P.append('"%s" has a door to outside but no exterior wall long enough%s.' % (a['name'], ' (not on a party wall)' if t.get('attached') else ''))
                continue
            start.add(a['id'])
            continue
        b = rooms.get(dr.get('b'))
        if not b:
            P.append('A door from "%s" names a room that isn\'t in the design (%s).' % (a['name'], dr.get('b')))
            continue
        if a['floor'] != b['floor']:
            P.append('Door between "%s" and "%s": they are on different floors.' % (a['name'], b['name']))
            continue
        if not door_geometry(t, rooms, dr):
            P.append('Door between "%s" and "%s": they don\'t share a wall %s ft long.' % (a['name'], b['name'], fmt(float(dr.get('width', 3)) + 1)))
            continue
        adj[a['id']].add(b['id'])
        adj[b['id']].add(a['id'])
    stairs = [r for r in R if r['type'] == 'stair']
    for s1 in stairs:
        for s2 in stairs:
            if s1 is not s2 and abs(s1['floor'] - s2['floor']) == 1 and rects_overlap(s1, s2) > 0.5 * room_area(s1):
                adj[s1['id']].add(s2['id'])
    seen = set(start)
    q = deque(start)
    while q:
        k = q.popleft()
        for n in adj[k]:
            if n not in seen:
                seen.add(n)
                q.append(n)
    cut = [r for r in R if r['id'] not in seen]
    if cut:
        P.append('No way in to: ' + ', '.join('"%s" (floor %d)' % (r['name'], r['floor']) for r in cut[:10]) + '. Add doors.')
    if not start:
        P.append('The building has no door to outside.')
    # windows
    wins = design.get('windows') or []
    for w in wins:
        r = rooms.get(w.get('room'))
        if not r:
            P.append('A window names a room that isn\'t in the design (%s).' % w.get('room'))
            continue
        if t.get('attached') and w.get('side') in ('left', 'right'):
            P.append('Window in "%s" is on a party wall (%s).' % (r['name'], w['side']))
            continue
        if not exterior_span(t, r, w.get('side', '')) if w.get('side') in SIDES else True:
            P.append('Window in "%s" is on the %s, but the room doesn\'t touch that side.' % (r['name'], w.get('side')))
    for r in R:
        if r['type'] in BEDS and not any(w.get('room') == r['id'] for w in wins):
            P.append('Bedroom "%s" has no window (emergency escape, IRC R310).' % r['name'])
    if not is_res(t):
        ext = [d for d in design.get('doors') or [] if d.get('b') == 'outside' and d.get('kind') != 'overhead']
        if foot_area(t) > 3000 and len(ext) < 2:
            P.append('Floor 1 is over 3,000 sf with fewer than two exit doors (IBC 1006).')
    # area against the program
    if t.get('target_gsf'):
        got = sum(room_area(r) for r in R if r['type'] not in ('garage', 'porch'))
        if abs(got - t['target_gsf']) > 0.03 * t['target_gsf'] and abs(got - t['target_gsf']) > 60:
            P.append('Conditioned area is %d sf against the program\'s %d sf (keep within 3%%).' % (got, t['target_gsf']))
    return P
