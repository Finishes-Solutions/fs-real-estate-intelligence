"""Rule-based schematic layouts (a basis of design, not engineering): code and rule-of-thumb placements the
engineering sheets draw on a building design. Every sheet that uses these says so."""
import math
from .geom import inside
from .design import is_res, room_area, exterior_span, SIDES, door_geometry, rooms_by_id, outline, foot_area

NO_COND = ['garage', 'porch', 'walk_in_cooler', 'warehouse', 'stair', 'mechanical', 'electrical', 'closet', 'storage']
NO_DIFF = ['closet', 'walk_in_closet', 'stair', 'garage', 'porch', 'walk_in_cooler', 'storage', 'mechanical', 'electrical', 'pantry', 'warehouse']


# ---------- electrical ----------
def receptacles(t, r):
    """NEC 210.52(A): dwellings no point on a wall more than 6 ft from one (so about every 12 ft; kitchens ~6 ft);
    commercial about every 20 ft, warehouse 40 ft. Party walls get none -> [(x, y)]"""
    if r['type'] in ('closet', 'stair', 'porch', 'walk_in_cooler', 'pantry', 'tenant'):  # shell bays: by the tenant
        return []
    step = 12 if is_res(t) else 20
    if r['type'] in ('kitchen', 'commercial_kitchen'):
        step = 6
    if r['type'] == 'warehouse':
        step = 40
    if r['type'] in ('bath', 'half_bath', 'restroom', 'laundry', 'janitor'):
        return [(r['x'] + min(2.5, r['w'] / 2), r['y'] + 0.3)]
    out = []
    for side in ('front', 'back', 'left', 'right'):
        if t.get('attached') and side in ('left', 'right') and exterior_span(t, r, side):
            continue
        horiz = side in ('front', 'back')
        L = r['w'] if horiz else r['d']
        n = max(1, int(L // step) + (1 if L > 4 else 0)) if L >= 2 else 0
        for i in range(n):
            s = L * (i + 0.5) / n
            if side == 'front':
                out.append((r['x'] + s, r['y'] + 0.3))
            elif side == 'back':
                out.append((r['x'] + s, r['y'] + r['d'] - 0.3))
            elif side == 'left':
                out.append((r['x'] + 0.3, r['y'] + s))
            else:
                out.append((r['x'] + r['w'] - 0.3, r['y'] + s))
    return out


def lights(t, r):
    """homes: one fixture a room, cans in kitchens and living areas; commercial 2x4 troffers ~8 x 10 ft grid;
    warehouse high-bays ~25 ft grid -> [(x, y, kind)]"""
    if r['type'] == 'warehouse':
        return [(x, y, 'highbay') for x, y in grid(r, 25, 25)]
    if is_res(t):
        if r['type'] in ('kitchen', 'living', 'family') and room_area(r) > 120:
            return [(x, y, 'can') for x, y in grid(r, 8, 8)]
        return [(r['x'] + r['w'] / 2, r['y'] + r['d'] / 2, 'ceiling')]
    if r['type'] == 'tenant':  # shell bays: lighting is the tenant's (a J-box and the tenant panel are shown instead)
        return []
    if room_area(r) < 60 or r['type'] in ('restroom', 'janitor', 'electrical', 'mechanical'):
        return [(r['x'] + r['w'] / 2, r['y'] + r['d'] / 2, 'ceiling')]
    if r['type'] in ('storage', 'corridor', 'hall'):  # strips about every 10 ft along the long side
        long_x = r['w'] >= r['d']
        n = max(1, round((r['w'] if long_x else r['d']) / 10))
        return [((r['x'] + r['w'] * (i + 0.5) / n, r['y'] + r['d'] / 2) if long_x else (r['x'] + r['w'] / 2, r['y'] + r['d'] * (i + 0.5) / n)) + ('strip',) for i in range(n)]
    return [(x, y, 'troffer') for x, y in grid(r, 8, 10)]


def grid(r, sx, sy):
    nx = max(1, math.ceil(r['w'] / sx))
    ny = max(1, math.ceil(r['d'] / sy))
    return [(r['x'] + r['w'] * (i + 0.5) / nx, r['y'] + r['d'] * (j + 0.5) / ny) for i in range(nx) for j in range(ny)]


def off_label(r):
    """a ceiling spot in the room clear of its centred name"""
    return (r['x'] + r['w'] * 0.5 + min(4, r['w'] * 0.25), r['y'] + r['d'] * 0.5 + min(4, r['d'] * 0.3))


def alarms(t, design):
    """IRC R314 smoke alarms in every sleeping room, outside each sleeping area, on every story; R315 CO outside
    sleeping areas when there is fuel-burning equipment or an attached garage -> [(floor, x, y, 'SA'|'CO'|'SD')]"""
    R = design['rooms']
    out = []
    gas = 'gas' in (design.get('systems', {}).get('water_heater', '') or '') or any(r['type'] == 'garage' for r in R)
    if is_res(t):
        for f in sorted({r['floor'] for r in R}):
            fl = [r for r in R if r['floor'] == f]
            beds = [r for r in fl if r['type'] in ('bedroom', 'primary_bedroom')]
            for b in beds:
                out.append((f,) + off_label(b) + ('SA',))
            halls = [r for r in fl if r['type'] in ('hall', 'entry', 'living', 'family')]
            for h in halls[:max(1, len(halls))][:2]:
                out.append((f,) + off_label(h) + ('SA',))
                if gas:
                    out.append((f, off_label(h)[0] + 1.5, off_label(h)[1], 'CO'))
        return out
    for r in R:
        if r['type'] in ('corridor', 'electrical', 'mechanical', 'lobby'):
            out.append((r['floor'],) + off_label(r) + ('SD',))
    return out


def panel_spot(t, design):
    """where the panel goes: a garage, an electrical or mechanical room, else the largest room on an outside wall"""
    R = [r for r in design['rooms'] if r['floor'] == 1]
    for kind in ('electrical', 'garage', 'mechanical', 'laundry', 'storage', 'janitor'):
        for r in R:
            if r['type'] == kind:
                return r
    return max(R, key=room_area)


def service_size(t, design):
    """a rough service size -> (amps, volts text, kVA)"""
    gsf = foot_area(t) * t['floors']
    if is_res(t):
        return (200 if gsf < 3500 else 400), '120/240 V, 1 phase', round(gsf * 3 / 1000 + 25, 1)
    va_sf = {'restaurant': 30, 'industrial': 6, 'retail': 14, 'fuel': 30, 'medical': 16, 'office': 14, 'church': 12}.get(t['use'], 14)
    kva = gsf * va_sf / 1000
    amps = kva * 1000 / (208 * 1.732)
    for s in (200, 400, 600, 800, 1200, 1600, 2000, 2500, 3000):
        if amps * 1.25 <= s:
            return s, '120/208 V, 3 phase, 4 wire', round(kva, 1)
    return 4000, '277/480 V, 3 phase, 4 wire', round(kva, 1)


# ---------- HVAC ----------
def sf_per_ton(t, r):
    if is_res(t):
        return 550
    if r['type'] in ('dining_room', 'commercial_kitchen'):
        return 200
    if r['type'] in ('sanctuary', 'classroom'):
        return 250
    return 350


def conditioned(r):
    return r['type'] not in NO_COND


def diffusers(t, r):
    if r['type'] in NO_DIFF or (not is_res(t) and r['type'] in ('restroom', 'janitor')):
        return []
    per = 150 if is_res(t) else 250
    n = max(1, round(room_area(r) / per))
    nx = max(1, round(math.sqrt(n * r['w'] / max(r['d'], 1))))
    ny = max(1, math.ceil(n / nx))
    return [(r['x'] + r['w'] * (i + 0.5) / nx, r['y'] + r['d'] * (j + 0.5) / ny) for i in range(nx) for j in range(ny)][:n]


def hvac_systems(t, design):
    """homes: split systems of at most 5 tons a floor group; commercial: rooftop units of at most ~25 tons and
    ~3,500 sf -> [{tag, kind, tons, area, floors}]"""
    R = design['rooms']
    out = []
    if is_res(t):
        for f in sorted({r['floor'] for r in R}):
            a = sum(room_area(r) for r in R if r['floor'] == f and conditioned(r))
            tons = sum(room_area(r) / sf_per_ton(t, r) for r in R if r['floor'] == f and conditioned(r))
            while tons > 0.1:
                tt = min(5, tons)
                out.append(dict(tag='AHU/CU-%d' % (len(out) + 1), kind='Split system heat pump', tons=max(1.5, math.ceil(tt * 2) / 2), area=round(a), floors=[f]))
                tons -= tt
        return out
    sizes = [3, 4, 5, 6, 7.5, 8.5, 10, 12.5, 15, 20, 25]
    tenants = [r for r in R if r['type'] == 'tenant']
    if len(tenants) >= 2:  # multi-tenant: each bay gets its own unit over it, metered with the tenant
        for r in tenants:
            tn = room_area(r) / sf_per_ton(t, r)
            out.append(dict(tag='RTU-%d' % (len(out) + 1), kind='Packaged rooftop unit, gas heat (tenant)', tons=next((s for s in sizes if s >= tn), 25),
                            area=round(room_area(r)), floors=[r['floor']], room=r['id']))
        common = [r for r in R if conditioned(r) and r['type'] != 'tenant' and r['type'] not in ('restroom', 'storage', 'janitor', 'electrical', 'mechanical')]
        ca = sum(room_area(r) for r in common)
        if ca > 400:
            big = max(common, key=room_area)
            out.append(dict(tag='RTU-%d' % (len(out) + 1), kind='Packaged rooftop unit (common areas)', tons=next((s for s in sizes if s >= ca / 350), 25),
                            area=round(ca), floors=[1], room=big['id']))
        return out
    cond = [r for r in R if conditioned(r)]
    a = sum(room_area(r) for r in cond)
    tons = sum(room_area(r) / sf_per_ton(t, r) for r in cond)
    n = max(1, math.ceil(max(a / 3500, tons / 25)))
    each = tons / n
    size = next((s for s in sizes if s >= each), 25)
    for i in range(n):
        out.append(dict(tag='RTU-%d' % (i + 1), kind='Packaged rooftop unit, gas heat', tons=size, area=round(a / n), floors=[1]))
    return out


# ---------- plumbing ----------
# supply fixture units (IPC Table E103.3(2), private / public) and drainage fixture units (Table 709.1)
FIX = {
    'WC': ('Water closet', 2.2, 5.0, 3, 4), 'LAV': ('Lavatory', 0.7, 1.5, 1, 1), 'TUB': ('Bathtub / shower', 1.4, 3.0, 2, 2),
    'SHR': ('Shower', 1.4, 3.0, 2, 2), 'KS': ('Kitchen sink', 1.4, 2.2, 2, 2), 'DW': ('Dishwasher', 1.4, 1.4, 2, 2),
    'CW': ('Clothes washer box', 1.4, 3.0, 2, 3), 'MS': ('Mop sink', 3.0, 3.0, 3, 3), 'TCS': ('Three-compartment sink', 4.0, 4.0, 3, 3),
    'HS': ('Hand sink', 0.7, 1.5, 1, 1), 'FD': ('Floor drain', 0, 0, 2, 2), 'UR': ('Urinal', 0, 4.0, 2, 4), 'DF': ('Drinking fountain', 0.25, 0.25, 0.5, 0.5),
    'BS': ('Bar / prep sink', 1.0, 2.0, 2, 2), 'HB': ('Hose bibb', 2.5, 2.5, 0, 0),
}


def fixtures_for(t, r):
    k = r['type']
    if k == 'bath':
        return ['WC', 'LAV', 'TUB'] if room_area(r) < 90 else ['WC', 'LAV', 'LAV', 'SHR', 'TUB']
    if k == 'half_bath':
        return ['WC', 'LAV']
    if k == 'kitchen':
        return ['KS', 'DW']
    if k == 'laundry':
        return ['CW']
    if k == 'restroom':
        n = 1 if room_area(r) < 90 else 2
        return ['WC'] * n + ['LAV'] * n + (['UR'] if n > 1 else []) + ['FD']
    if k == 'commercial_kitchen':
        return ['TCS', 'HS', 'HS', 'BS', 'FD', 'FD']
    if k == 'janitor':
        return ['MS']
    if k == 'break_room':
        return ['KS']
    if k == 'exam':
        return ['HS']
    if k == 'walk_in_cooler':
        return ['FD']
    return []


def fixture_spots(r, codes):
    """the fixtures along the room's back wall (or longest wall) -> [(code, x, y)]"""
    out = []
    n = len(codes)
    for i, c in enumerate(codes):
        if r['w'] >= r['d']:
            out.append((c, r['x'] + r['w'] * (i + 0.5) / n, r['y'] + r['d'] - 1.2))
        else:
            out.append((c, r['x'] + r['w'] - 1.2, r['y'] + r['d'] * (i + 0.5) / n))
    return out


def plumbing_totals(t, design):
    pub = not is_res(t)
    counts = {}
    for r in design['rooms']:
        for c in fixtures_for(t, r):
            counts[c] = counts.get(c, 0) + 1
    wsfu = sum(FIX[c][2 if pub else 1] * n for c, n in counts.items())
    dfu = sum(FIX[c][4 if pub else 3] * n for c, n in counts.items())
    wc = counts.get('WC', 0)
    service = '3/4"' if wsfu <= 20 else '1"' if wsfu <= 40 else '1-1/4"' if wsfu <= 75 else '1-1/2"' if wsfu <= 150 else '2"'
    sewer = '3"' if dfu <= 20 and wc <= 2 else '4"' if dfu <= 216 else '6"'
    return dict(counts=counts, wsfu=round(wsfu, 1), dfu=round(dfu, 1), service=service, sewer=sewer)


def required_fixtures(t, occupants):
    """IPC Table 2902.1, rough: water closets, lavatories, drinking fountains, service sink"""
    occ = t['occupancy']
    per = {'A-2': (75, 200), 'A-3': (125, 200), 'B': (25, 40), 'M': (500, 750), 'S-1': (100, 100)}.get(occ[:3], (50, 80))
    wc = max(2 if occupants > 15 else 1, math.ceil(occupants / per[0]))
    lav = max(1, math.ceil(occupants / per[1]))
    return dict(wc=wc, lav=lav, df=1 if occupants > 15 else 0, service_sink=1 if occupants > 15 else 0)


# ---------- fire and life safety ----------
LOAD = {'sales': 60, 'tenant': 60, 'dining_room': 15, 'commercial_kitchen': 200, 'office': 150, 'reception': 150, 'conference': 15,
        'exam': 150, 'warehouse': 500, 'storage': 300, 'sanctuary': 7, 'classroom': 20, 'lobby': 100, 'break_room': 15, 'restroom': 0,
        'corridor': 0, 'mechanical': 300, 'electrical': 300, 'janitor': 300, 'walk_in_cooler': 300}


def occupant_load(r):
    f = LOAD.get(r['type'], 100)
    return 0 if f == 0 else max(1, math.ceil(room_area(r) / f))


def hazard(t, r):
    if r['type'] in ('warehouse', 'storage') or t['use'] == 'industrial':
        return 'Ordinary hazard group 2', 130, 15
    if r['type'] in ('commercial_kitchen', 'sales', 'tenant', 'mechanical', 'walk_in_cooler') or t['use'] in ('retail', 'fuel'):
        return 'Ordinary hazard group 1', 130, 15
    return 'Light hazard', 225, 15


def sprinkler_heads(t, r):
    name, cover, s = hazard(t, r)
    side = min(s, math.sqrt(cover))
    return grid(r, side, side), name


def exits(t, design):
    rooms = rooms_by_id(design)
    out = []
    for d in design.get('doors') or []:
        if d.get('b') == 'outside' and d.get('kind') != 'overhead':
            g = door_geometry(t, rooms, d)
            if g:
                x, y = (g['c'], g['at']) if g['orient'] == 'h' else (g['at'], g['c'])
                out.append((x, y, g['side']))
    return out


def travel_limit(t):
    o = t['occupancy']
    if t.get('sprinklered'):
        return 300 if o.startswith('B') else 400 if o.startswith('S-2') else 250
    return 200


def travel_distance(t, design):
    ex = exits(t, design)
    if not ex:
        return None
    worst = 0
    for r in design['rooms']:
        if r['floor'] != 1:
            continue
        for p in [(r['x'] + 1, r['y'] + 1), (r['x'] + r['w'] - 1, r['y'] + 1), (r['x'] + 1, r['y'] + r['d'] - 1), (r['x'] + r['w'] - 1, r['y'] + r['d'] - 1)]:
            d = min(abs(p[0] - e[0]) + abs(p[1] - e[1]) for e in ex)
            worst = max(worst, d)
    return round(worst)


# ---------- allowable area (IBC Table 506.2, rough, non-sprinklered, per story) ----------
ALLOW = {('A-2', 'V-B'): 6000, ('A-2', 'II-B'): 9500, ('A-3', 'V-B'): 6000, ('A-3', 'II-B'): 9500, ('B', 'V-B'): 9000, ('B', 'II-B'): 23000,
         ('M', 'V-B'): 9000, ('M', 'II-B'): 12500, ('S-1', 'V-B'): 9000, ('S-1', 'II-B'): 17500, ('R-2', 'V-B'): 7000, ('R-2', 'II-B'): 16000}


def allowable_area(t):
    occ = t['occupancy'].split(' ')[0]
    con = 'II-B' if 'II-B' in t['construction'] else 'V-B'
    base = ALLOW.get((occ, con))
    if base is None:
        return None
    return base * (3 if t.get('sprinklered') and t['floors'] == 1 else 1)


# ---------- structural ----------
def grade_beams(t, spacing=18):
    """interior beams at most `spacing` ft apart both ways -> ([x lines], [y lines])"""
    nx = max(1, math.ceil(t['W'] / spacing))
    ny = max(1, math.ceil(t['D'] / spacing))
    return [t['W'] * i / nx for i in range(1, nx)], [t['D'] * j / ny for j in range(1, ny)]


def framing(t):
    if is_res(t):
        return dict(roof='Pre-engineered wood trusses at 24" o.c.', floor='Pre-engineered wood floor trusses at 19.2" o.c.' if t['floors'] > 1 else None,
                    walls='2x4 (interior) / 2x6 (exterior) wood studs at 16" o.c., 7/16" OSB sheathing', foundation='Post-tensioned slab on grade with perimeter and interior grade beams')
    if t['use'] == 'industrial':
        return dict(roof='Steel bar joists and joist girders on steel columns, metal deck', floor=None, walls='Concrete tilt-up panels or pre-engineered metal building',
                    foundation='Slab on grade with spread footings at columns, thickened at panels')
    return dict(roof='Steel bar joists at about 5 ft o.c. on steel beams, 1-1/2" metal roof deck', floor='Composite steel deck on beams' if t['floors'] > 1 else None,
                walls='Light-gauge metal studs with masonry or EIFS veneer; storefront at the front', foundation='Conventionally reinforced slab on grade with grade beams; spread footings at columns')


def inside_spots(t, n, margin=8.0, prefer_back=False):
    """n points well inside the building outline, spread apart (for rooftop units, roof drains, hatches)"""
    ol = outline(t)
    W, D = t['W'], t['D']
    step = max(4.0, min(W, D) / 12)
    cand = []
    y = margin
    while y <= D - margin + 1e-6:
        x = margin
        while x <= W - margin + 1e-6:
            if inside((x, y), ol) and all(inside(q, ol) for q in ((x - margin, y), (x + margin, y), (x, y - margin), (x, y + margin))):
                cand.append((x, y))
            x += step
        y += step
    if not cand:
        return [(W / 2, D / 2)] * n
    pick = [max(cand, key=lambda q: (q[1] if prefer_back else 0) + q[0] * 1e-3)] if prefer_back else [cand[len(cand) // 2]]
    while len(pick) < n:
        pick.append(max(cand, key=lambda q: min(math.hypot(q[0] - p[0], q[1] - p[1]) for p in pick)))  # spread out (one per wing of an L)
    return pick[:n]


def rtu_spots(t, design):
    """[(system, x, y)]: a tenant's unit over its own bay, the rest spread over the roof (shared by M-101 and the roof plan)"""
    systems = [s for s in hvac_systems(t, design) if not is_res(t)]
    rooms = {r['id']: r for r in design['rooms']}
    free = inside_spots(t, len(systems)) if systems else []
    out = []
    for i, s in enumerate(systems):
        r = rooms.get(s.get('room'))
        if r:
            out.append((s, r['x'] + r['w'] / 2, r['y'] + r['d'] * 0.76))  # clear of the room label
        else:
            out.append((s, free[i][0], free[i][1]))
    return out
