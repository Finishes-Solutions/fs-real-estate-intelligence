#!/usr/bin/env python3
"""Scale a traced site model to the site's real size.

    python3 scripts/fit_site.py project.json --acres 7.71                      # scale so the boundary is 7.71 ac
    python3 scripts/fit_site.py project.json --known 120,40,480,40=300         # or from a known dimension (ft)

For sketches and scans traced in pixels (site.coord_units = "pixels", y down): flips y so north-up drawings stay
north-up, scales every coordinate and drawing-unit length (boundary, poly, pts, x, y, w, d) so the boundary's area
equals the acreage, moves the boundary's lower-left corner to (0, 0) and sets coord_units to "feet". Real-feet
fields (drive width, row_width, depth_ft, setbacks) are left alone. With --known the scale comes from the dimension
and the acreage is only checked. Writes the file in place (a .bak copy is kept)."""
import argparse
import json
import math
import shutil

SQFT_ACRE = 43560.0
SCALED_LISTS = ('boundary', 'poly', 'pts', 'flood_zone_poly')
SCALED_NUMS = ('x', 'y', 'w', 'd')


def area(P):
    return abs(sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))) / 2


def transform(site, f):
    def walk(o):
        if isinstance(o, dict):
            for k, v in list(o.items()):
                if k in SCALED_LISTS and isinstance(v, list):
                    o[k] = [list(f(p)) for p in v]
                elif isinstance(v, (dict, list)):
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(site)
    for key in ('buildings',):
        for b in site.get(key, []):
            if 'x' in b and 'y' in b:
                b['x'], b['y'] = f((b['x'], b['y']))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project')
    ap.add_argument('--acres', type=float)
    ap.add_argument('--known', help='x1,y1,x2,y2=feet: two traced points and the real distance between them')
    a = ap.parse_args()
    p = json.load(open(a.project))
    s = p['site']
    acres = a.acres or (s.get('stated') or {}).get('acres')
    if not acres and not a.known:
        raise SystemExit('Give --acres (ask the user for the total site acreage) or --known.')
    B = s['boundary']
    flip = s.get('coord_units') == 'pixels'
    if flip:  # y down -> y up
        transform(s, lambda q: (q[0], -q[1]))
        for b in s.get('buildings', []):
            if 'rot' in b:
                b['rot'] = -b['rot']
        if 'north_deg' in s:
            pass  # a north arrow read off the image is already in sheet terms
    B = s['boundary']
    if a.known:
        pts, ft = a.known.split('=')
        x1, y1, x2, y2 = map(float, pts.split(','))
        if flip:
            y1, y2 = -y1, -y2
        k = float(ft) / math.dist((x1, y1), (x2, y2))
    else:
        k = math.sqrt(acres * SQFT_ACRE / area(B))
    x0 = min(q[0] for q in B)
    y0 = min(q[1] for q in B)
    transform(s, lambda q: ((q[0] - x0) * k, (q[1] - y0) * k))
    for b in s.get('buildings', []):
        for n in ('w', 'd'):
            if n in b:
                b[n] = round(b[n] * k, 2)
    for key in ('buildings', 'paving', 'drives', 'ponds', 'lots', 'easements', 'streets', 'open_space'):
        for item in s.get(key, []):
            for n in ('poly', 'pts'):
                if n in item:
                    item[n] = [[round(q[0], 2), round(q[1], 2)] for q in item[n]]
    s['boundary'] = [[round(q[0], 2), round(q[1], 2)] for q in s['boundary']]
    s['coord_units'] = 'feet'
    s.setdefault('stated', {})['acres'] = acres or s.get('stated', {}).get('acres')
    s['scale_basis'] = ('fitted to the stated %.2f ac' % acres) if not a.known else ('from a known %s ft dimension' % ft)
    got = area(s['boundary']) / SQFT_ACRE
    shutil.copy(a.project, a.project + '.bak')
    json.dump(p, open(a.project, 'w'), indent=1)
    print('Scale: %.4f ft per drawing unit. Boundary now %.3f ac%s. Wrote %s (backup .bak).' % (k, got, (' (stated %.2f ac, %+.1f%%)' % (acres, 100 * (got - acres) / acres)) if acres else '', a.project))


if __name__ == '__main__':
    main()
