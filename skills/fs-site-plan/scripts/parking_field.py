#!/usr/bin/env python3
"""Fill a rectangle with 90-degree parking: double-loaded bays (stall + aisle + stall), a single-loaded bay in the
remainder when it fits, and cross aisles at the ends so every aisle connects.

    python3 scripts/parking_field.py --rect 300,120,400,180,0                    # centre x,y, length, depth, rotation
    python3 scripts/parking_field.py --rect 300,120,400,180,0 --ends left --into site-model.json --name P1
    python3 scripts/parking_field.py --rect ... --stall 9x18 --aisle 24 --ada 4 --van 1 --fire-lane

--rect: centre x, y (ft, model frame), length along the aisles, depth across them, rotation degrees CCW.
--ends: which ends get a cross aisle (both, left, right, none): none when the ends already meet a drive.
--into: append the rows, aisles and paving to the model's site (a .bak copy is kept); otherwise prints the JSON.
Accessible stalls (--ada, of which --van are van) go at the start of the first row: put that row nearest the entrance."""
import argparse
import json
import math
import shutil


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rect', required=True)
    ap.add_argument('--stall', default='9x18')
    ap.add_argument('--aisle', type=float, default=24)
    ap.add_argument('--ends', default='both', choices=['both', 'left', 'right', 'none'])
    ap.add_argument('--ada', type=int, default=0)
    ap.add_argument('--van', type=int, default=0)
    ap.add_argument('--fire-lane', action='store_true', help='mark the aisles as fire lanes (widen --aisle to 26 for buildings over 30 ft)')
    ap.add_argument('--name', default='P')
    ap.add_argument('--into')
    a = ap.parse_args()
    cx, cy, W, D, rot = map(float, a.rect.split(','))
    sw, sd = map(float, a.stall.lower().split('x'))
    ai = a.aisle
    r = math.radians(rot)
    co, si = math.cos(r), math.sin(r)

    def X(u, v):  # local (u along, v across, from the lower-left corner) -> model frame
        lu, lv = u - W / 2, v - D / 2
        return [round(cx + lu * co - lv * si, 2), round(cy + lu * si + lv * co, 2)]

    u0 = ai if a.ends in ('both', 'left') else 0.0
    u1 = W - ai if a.ends in ('both', 'right') else W
    rows, drives = [], []
    v, k = 0.0, 0
    mod = 2 * sd + ai
    while D - v >= sd + ai - 0.01:
        double = D - v >= mod - 0.01
        lo, hi = v + sd, v + sd + ai  # the aisle's edges
        rows.append(dict(name='%s-%d' % (a.name, len(rows) + 1), a=X(u0, lo), b=X(u1, lo), side='right', stall_w=sw, stall_d=sd))
        drives.append(dict(name='%s aisle %d' % (a.name, k + 1), pts=[X(0, (lo + hi) / 2), X(W, (lo + hi) / 2)], width=ai, fire_lane=a.fire_lane))
        if double:
            rows.append(dict(name='%s-%d' % (a.name, len(rows) + 1), a=X(u0, hi), b=X(u1, hi), side='left', stall_w=sw, stall_d=sd))
            v += mod
        else:
            v += sd + ai
        k += 1
    if not rows:
        raise SystemExit('The rectangle is %.0f ft deep: a bay needs at least %.0f ft (stall %.0f + aisle %.0f).' % (D, sd + ai, sd, ai))
    used = v
    if a.ends in ('both', 'left'):
        drives.append(dict(name='%s end aisle W' % a.name, pts=[X(ai / 2, 0), X(ai / 2, used)], width=ai, fire_lane=a.fire_lane))
    if a.ends in ('both', 'right'):
        drives.append(dict(name='%s end aisle E' % a.name, pts=[X(W - ai / 2, 0), X(W - ai / 2, used)], width=ai, fire_lane=a.fire_lane))
    if a.ada:
        rows[0]['ada'] = a.ada
        rows[0]['van'] = min(a.van or math.ceil(a.ada / 6), a.ada)
    per_row = []
    for rw in rows:
        L = math.dist(rw['a'], rw['b'])
        n_ada = rw.get('ada', 0)
        van = rw.get('van', 0)
        rest = L - van * 16 - (n_ada - van) * 13
        per_row.append(n_ada + int(rest // sw + 1e-6))
    paving = [dict(kind='parking', name=a.name, poly=[X(0, 0), X(W, 0), X(W, used), X(0, used)])]
    out = dict(parking_rows=rows, drives=drives, paving=paving)
    left = D - used
    msg = '%s: %d stalls in %d rows (%s), %.0f ft of the %.0f ft depth used%s.' % (
        a.name, sum(per_row), len(rows), ', '.join(map(str, per_row)), used, D,
        ('; %.0f ft left over: landscape it or make the rectangle shallower' % left) if left > 1 else '')
    if a.into:
        m = json.load(open(a.into))
        s = m['site']
        for key in ('parking_rows', 'drives', 'paving'):
            s.setdefault(key, []).extend(out[key])
        shutil.copy(a.into, a.into + '.bak')
        json.dump(m, open(a.into, 'w'), indent=1)
        print(msg + ' Added to %s (backup .bak).' % a.into)
    else:
        print(json.dumps(out, indent=1))
        print(msg)


if __name__ == '__main__':
    main()
