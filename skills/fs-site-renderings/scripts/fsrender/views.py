"""The five camera views, placed relative to the site's street side and fitted to the site."""
import math
import numpy as np
from .raster import Camera
from . import geom as G

# az: degrees from the street-side direction (negative = toward the left as seen from the street); el: degrees above
# the horizon for aerials. Override any of them with --views views.json (same keys).
VIEWS = [
    dict(id='corner_left', label='Aerial from the front-left corner', kind='aerial', az=-42, el=30, fov=45,
         words='a wide drone aerial from over the street at the front-left corner, the fronts and the left side of the buildings showing and the whole site in the frame'),
    dict(id='corner_right', label='Aerial from the front-right corner', kind='aerial', az=42, el=30, fov=45,
         words='a wide drone aerial from over the street at the front-right corner, the fronts and the right side of the buildings showing and the whole site in the frame'),
    dict(id='street', label='Street level from across the road', kind='street', fov=62,
         words='an eye-level photograph from the far sidewalk across the road, looking diagonally into the site at the main building, as a passer-by sees it'),
    dict(id='entry', label='Arriving at the main entrance', kind='entry', fov=58,
         words='a low drone shot from just above the main entrance drive, looking up the drive toward the main building, as a visitor arriving by car approaches'),
    dict(id='rear', label='High aerial from the rear corner', kind='aerial', az=180 + 38, el=42, fov=45,
         words='a high drone aerial from behind the site at the rear corner, looking back toward the road, the service side, detention and the whole layout in view'),
]


def rot2(v, deg):
    a = math.radians(deg)
    return np.array([v[0] * math.cos(a) - v[1] * math.sin(a), v[0] * math.sin(a) + v[1] * math.cos(a)])


def fit_aerial(scene, V, W, H):
    pts = scene.extent_points()
    d2 = rot2(scene.front_n, V['az'])
    el = math.radians(V['el'])
    target = np.array([*((pts[:, :2].min(0) + pts[:, :2].max(0)) / 2), 0.0])
    dist = 1000.0
    for _ in range(4):
        lo, hi = 50.0, 50000.0
        for _ in range(40):
            dist = (lo + hi) / 2
            pos = target + dist * np.array([d2[0] * math.cos(el), d2[1] * math.cos(el), math.sin(el)])
            cam = Camera(pos, target, V['fov'], W, H)
            nd, z = cam.ndc(pts)
            ok = (z > 1).all() and np.abs(nd[:, 0]).max() <= 0.90 and np.abs(nd[:, 1]).max() <= 0.84
            hi, lo = (dist, lo) if ok else (hi, dist)
        dist = hi
        pos = target + dist * np.array([d2[0] * math.cos(el), d2[1] * math.cos(el), math.sin(el)])
        cam = Camera(pos, target, V['fov'], W, H)
        nd, _ = cam.ndc(pts)
        cx, cy = (nd[:, 0].min() + nd[:, 0].max()) / 2, (nd[:, 1].min() + nd[:, 1].max()) / 2
        target = target + (cam.right * cx * cam.tx + cam.up * cy * cam.ty) * dist  # re-centre the site in the frame
    return Camera(pos, target, V['fov'], W, H)


def street_view(scene, V, W, H):
    s = scene.s
    mb = scene.main_building()
    look = np.array([*G.centroid(mb['poly']), mb['height'] * 0.45]) if mb else np.array([*G.centroid(scene.boundary), 10.0])
    n = scene.front_n
    m = np.array(scene.front_mid)
    off = 70.0
    for st in s.get('streets', []):
        d = G.nearest_on_line(tuple(m), st['pts'])[1]
        off = d + float(st.get('pavement_width', 28)) / 2 + 12  # the far sidewalk, across the road
        break
    right = np.array([n[1], -n[0]])  # to the right as seen from the street
    pos2 = m + right * 0.32 * scene.front_len + n * off  # toward the right end, so it looks across the site, not up the entry
    pos = np.array([pos2[0], pos2[1], 5.5])
    h = look[:2] - pos2
    dh = np.linalg.norm(h)
    ty = math.tan(math.radians(V['fov']) / 2) * H / W
    tgt = np.array([look[0], look[1], 5.5 + dh * math.tan(math.atan(0.16 * ty))])  # horizon a little below the middle
    cam = Camera(pos, tgt, V['fov'], W, H)
    cam.skip_trees_within = 45.0  # no tree crown filling the lens
    return cam


def entry_view(scene, V, W, H):
    s = scene.s
    n = scene.front_n
    best = None
    for d in s.get('drives', []):
        for e in (d['pts'][0], d['pts'][-1]):
            dd = G.poly_dist(tuple(e), scene.boundary) if not G.inside(tuple(e), scene.boundary) else G.nearest_on_line(tuple(e), scene.boundary, closed=True)[1]
            sd = min([G.nearest_on_line(tuple(e), st['pts'])[1] for st in s.get('streets', [])] or [dd])
            if best is None or sd < best[0]:
                best = (sd, np.array(e, float))
    start = best[1] if best else np.array(scene.front_mid)
    mb = scene.main_building()
    look = np.array([*G.centroid(mb['poly']), 8.0]) if mb else np.array([*G.centroid(scene.boundary), 8.0])
    pos = np.array([*(start + n * 25), 32.0])
    cam = Camera(pos, look, V['fov'], W, H)
    cam.skip_trees_within = 45.0
    return cam


def camera_for(scene, V, W, H):
    if V['kind'] == 'aerial':
        return fit_aerial(scene, V, W, H)
    if V['kind'] == 'street':
        return street_view(scene, V, W, H)
    return entry_view(scene, V, W, H)
