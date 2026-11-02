#!/usr/bin/env python3
"""Turn a site outline in longitude / latitude (GeoJSON) into the layout model's boundary in feet.

    python3 scripts/geojson_to_site.py plan.geojson --into site-model.json
    python3 scripts/geojson_to_site.py parcel.geojson --print

Reads the Real Estate Intelligence app's "Map File (GeoJSON)" export (the site is the feature with k = "lot" and
site = 1; its "front" and "street" lines mark the street sides), or any parcel GeoJSON (Regrid, county appraisal
district): the largest polygon is the site. Projects to feet around the site's centre (north up, so north_deg = 0),
puts the lower-left corner at (0, 0), and sets site.edges.front / street_side from the app's street lines. Existing
plan elements from the app are listed in site.reference_elements for reading only, never adopted as the layout.
Also prints the centre point, so the jurisdiction and flood map can be looked up."""
import argparse
import json
import math
import shutil

SQFT_ACRE = 43560.0
FT = 3.280839895


def area(P):
    return abs(sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))) / 2


def rings(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates'][0]]
    if geom['type'] == 'MultiPolygon':
        return [p[0] for p in geom['coordinates']]
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('geojson')
    ap.add_argument('--into')
    ap.add_argument('--print', action='store_true')
    a = ap.parse_args()
    g = json.load(open(a.geojson))
    feats = g['features'] if g.get('type') == 'FeatureCollection' else [g]
    site = [f for f in feats if (f.get('properties') or {}).get('k') == 'lot' and (f.get('properties') or {}).get('site')]
    cands = []
    for f in (site or feats):
        for r in rings(f.get('geometry') or {}):
            cands.append((r, f))
    if not cands:
        raise SystemExit('No polygon in %s.' % a.geojson)
    lat0 = sum(q[1] for r, _ in cands for q in r) / sum(len(r) for r, _ in cands)
    lon0 = sum(q[0] for r, _ in cands for q in r) / sum(len(r) for r, _ in cands)
    phi = math.radians(lat0)
    m_lat = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    m_lon = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)

    def P(q):
        return ((q[0] - lon0) * m_lon * FT, (q[1] - lat0) * m_lat * FT)

    ringpts = []
    for r, f in cands:
        pts = [P(q) for q in r]
        if pts[0] == pts[-1] or math.dist(pts[0], pts[-1]) < 0.01:
            pts = pts[:-1]
        ringpts.append((area(pts), pts, f))
    ringpts.sort(key=lambda t: -t[0])
    if len(ringpts) > 1:
        print('NOTE: %d polygons; using the largest (%.2f ac). Others: %s' % (len(ringpts), ringpts[0][0] / SQFT_ACRE,
              ', '.join('%.2f ac' % (t[0] / SQFT_ACRE) for t in ringpts[1:6])))
    B = ringpts[0][1]
    x0, y0 = min(q[0] for q in B), min(q[1] for q in B)
    B = [[round(q[0] - x0, 2), round(q[1] - y0, 2)] for q in B]

    def local(q):
        p = P(q)
        return (p[0] - x0, p[1] - y0)

    def edge_of(line):
        """the boundary edge a two-point line lies on"""
        m = local(((line[0][0] + line[-1][0]) / 2, (line[0][1] + line[-1][1]) / 2))
        best = None
        for i in range(len(B)):
            a_, b_ = B[i], B[(i + 1) % len(B)]
            dx, dy = b_[0] - a_[0], b_[1] - a_[1]
            L2 = dx * dx + dy * dy or 1
            t = max(0, min(1, ((m[0] - a_[0]) * dx + (m[1] - a_[1]) * dy) / L2))
            d = math.dist(m, (a_[0] + t * dx, a_[1] + t * dy))
            if best is None or d < best[1]:
                best = (i, d)
        return best[0] if best and best[1] < 5 else None

    front, street, ref = [], [], []
    for f in feats:
        pr = f.get('properties') or {}
        geo = f.get('geometry') or {}
        if pr.get('k') in ('front', 'street') and geo.get('type') == 'LineString':
            e = edge_of(geo['coordinates'])
            if e is not None:
                (front if pr['k'] == 'front' else street).append(e)
        elif pr.get('k') in ('building', 'parking', 'pond', 'drive', 'setback') and geo.get('type') == 'Polygon':
            ref.append({'kind': pr['k'], 'use': pr.get('use'), 'poly': [[round(c, 2) for c in local(q)] for q in geo['coordinates'][0][:-1]]})
    acres = area(B) / SQFT_ACRE
    props = g.get('properties') or {}
    info = {'boundary': B, 'north_deg': 0, 'display_rotate_deg': 0, 'boundary_source': 'GeoJSON %s (projected to feet, not a survey)' % a.geojson.split('/')[-1],
            'centre_lonlat': [round(lon0, 6), round(lat0, 6)]}
    if front or street:
        info['edges'] = {'front': front, 'street_side': street}
    if ref:
        info['reference_elements'] = ref
    print('Site %.3f ac (%s sf), %d corners, centre %.6f, %.6f%s' % (acres, '{:,.0f}'.format(area(B)), len(B), lat0, lon0,
          (' · front edge %s, street sides %s' % (front, street)) if front or street else ''))
    if props.get('project'):
        print('App export: project %s, plan %s' % (props.get('project'), props.get('plan')))
    print('Confirm the acreage with the user before using it (it is from map data, not a survey).')
    if a.into:
        m = json.load(open(a.into))
        m.setdefault('site', {}).update(info)
        shutil.copy(a.into, a.into + '.bak')
        json.dump(m, open(a.into, 'w'), indent=1)
        print('Updated %s (backup .bak).' % a.into)
    if a.print or not a.into:
        print(json.dumps(info, indent=1))


if __name__ == '__main__':
    main()
