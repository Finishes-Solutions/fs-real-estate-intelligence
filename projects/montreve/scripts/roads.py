"""Road centrelines for the Montreve layout.

The platted roads are 50 ft rights-of-way: the strips left between the lots (data/plan_geometry.json roads). Drawn as
those strips they come out ragged (every lot corner a notch, blobs at the ends). This finds each road's centreline:
the strips merged and smoothed, rasterised at 2 ft, thinned to a one-pixel skeleton, traced into lines between their
ends and junctions, short spurs (the notches) pruned, then smoothed and simplified. Adds `centerlines` to
data/plan_geometry.json: [{ name, path: [[x, y] ft…], ends: [start kind, end kind] }] (kind 'end' or 'junction').

  python3 -I projects/montreve/scripts/roads.py
"""
import json
from collections import defaultdict
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from skimage.draw import polygon as fill
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[1]
G = json.loads((ROOT / 'data' / 'plan_geometry.json').read_text())
CELL, SPUR = 2.0, 45.0

parcel = Polygon(G['parcel'])
road = unary_union([Polygon(r['ring']) for r in G['roads']]).buffer(6, join_style=1).buffer(-6, join_style=1).buffer(-3).buffer(3)
road = road.intersection(parcel.buffer(30))  # (the entrance runs out to Happy Hollow Road)
x0, y0, x1, y1 = road.bounds
nx, ny = int((x1 - x0) / CELL) + 3, int((y1 - y0) / CELL) + 3
img = np.zeros((ny, nx), bool)
for g in getattr(road, 'geoms', [road]):
    xs = [(x - x0) / CELL + 1 for x, _ in g.exterior.coords]; ys = [(y - y0) / CELL + 1 for _, y in g.exterior.coords]
    rr, cc = fill(ys, xs, img.shape); img[rr, cc] = True
sk = skeletonize(img)
pix = set(zip(*np.nonzero(sk)))
nb = lambda p: [(p[0] + a, p[1] + b) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a or b) and (p[0] + a, p[1] + b) in pix]


def trace():
    deg = {p: len(nb(p)) for p in pix}
    nodes = {p for p, d in deg.items() if d != 2}
    seen, edges = set(), []
    for n in nodes:
        for q in nb(n):
            if (n, q) in seen: continue
            line, prev, cur = [n], n, q
            while True:
                line.append(cur); seen.add((prev, cur)); seen.add((cur, prev))
                if cur in nodes: break
                nxt = [r for r in nb(cur) if r != prev and (cur, r) not in seen]
                if not nxt: break
                prev, cur = cur, nxt[0]
            edges.append(line)
    return deg, nodes, edges


# prune spurs: an edge from an end (degree 1) to a junction shorter than SPUR ft, until none are left
for _ in range(10):
    deg, nodes, edges = trace()
    cut = [e for e in edges if len(e) * CELL < SPUR and (deg[e[0]] == 1) != (deg[e[-1]] == 1) and max(deg[e[0]], deg[e[-1]]) >= 3]
    if not cut: break
    for e in cut:
        for p in (e if deg[e[0]] == 1 else e[::-1])[:-1]: pix.discard(p)
deg, nodes, edges = trace()
# merge edges through junctions that only joined two (after pruning a node can be degree 2 again)
to_ft = lambda p: ((p[1] - 1) * CELL + x0, (p[0] - 1) * CELL + y0)
lines = []
for e in edges:
    if len(e) * CELL < 20: continue
    pts = np.array([to_ft(p) for p in e])
    k = 9; sm = pts.copy()  # moving average, ends held
    for i in range(len(pts)): a, b = max(0, i - k), min(len(pts), i + k + 1); sm[i] = pts[a:b].mean(0)
    sm[0], sm[-1] = pts[0], pts[-1]
    ln = LineString(sm).simplify(1.5)
    lines.append({'line': ln, 'ends': ['end' if deg[e[0]] == 1 else 'junction', 'end' if deg[e[-1]] == 1 else 'junction']})

lots = {int(n): Polygon(v['ring']) for n, v in G['lots'].items()}
def name_of(ln):
    near = lambda ns: sum(ln.distance(lots[n]) < 30 for n in ns)
    return 'Amber Valley Way' if near([3, 6, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21]) >= near([1, 26, 27, 28, 29, 30, 31, 32]) else 'Creeksong Way'

G['centerlines'] = [{'name': name_of(l['line']), 'path': [[round(x, 1), round(y, 1)] for x, y in l['line'].coords], 'ends': l['ends'], 'length': round(l['line'].length)} for l in lines]
(ROOT / 'data' / 'plan_geometry.json').write_text(json.dumps(G, indent=1))
for c in G['centerlines']: print(c['name'], c['length'], 'ft', c['ends'], len(c['path']), 'pts')

# The platted network, from the pieces above (their ends checked): Creeksong Way from Happy Hollow Road along the bottom
# to the east junction; Amber Valley Way from Creeksong at the ravine, up the hairpin round lot 8, along the ridge past
# the resort core and down beside lot 16 to the east junction; Creeksong's stub on south between lots 32 and 33. The
# gaps the lot map leaves at the ravine crossing, the junction bulb and the cul-de-sac by lot 16 are joined straight
# (the app rounds the corners). Short spurs (the bulb's notch) are dropped.
C = G['centerlines']
def piece(i, start):  # piece i, turned to start at its end nearest `start`
    p = C[i]['path']; return p if np.hypot(p[0][0] - start[0], p[0][1] - start[1]) <= np.hypot(p[-1][0] - start[0], p[-1][1] - start[1]) else p[::-1]
def chain(ids, start):
    out = []
    for i in ids:
        p = piece(i, out[-1] if out else start); out += p if not out else (p[1:] if np.hypot(p[0][0] - out[-1][0], p[0][1] - out[-1][1]) < 3 else p)
    return out
ends = lambda i: (C[i]['path'][0], C[i]['path'][-1])
assert all(np.hypot(*np.subtract(a, b)) < 60 for a, b in [(ends(3)[1], (-1058, -419)), (ends(1)[1], (516, 155)), (ends(9)[1], (664, -295))]), 'the pieces moved: check the chain below'
creek = chain([3, 8, 2, 10, 5], (-1100, -419))
amber = chain([6, 4, 1, 7], (-156, -363))
d0 = np.subtract(amber[0], amber[1]); d0 = d0 / np.hypot(*d0); ahead = np.add(amber[0], d0 * 60)  # carry on along its own heading
dense = [list(LineString(creek).interpolate(t, normalized=False).coords[0]) for t in range(0, int(LineString(creek).length), 5)]
clip = lambda q: sum(LineString([q, amber[0]]).buffer(12.5, cap_style=2).intersection(g).area for g in lots.values())
cands = [q for q in dense if np.hypot(q[0] - ahead[0], q[1] - ahead[1]) < 140]
amber = [min(cands, key=lambda q: (round(clip(q) / 50), np.hypot(q[0] - ahead[0], q[1] - ahead[1])))] + amber  # tee in near there, the joining stretch clear of the lots
east = min(creek[-6:], key=lambda q: np.hypot(q[0] - 620, q[1] + 40)); amber.append(east)
stub = [east] + piece(9, east)[1:]
# keep the 24 ft paving off the lots: every point (every 10 ft) at least 12.5 ft from any lot, nudged away from the
# nearest one where it's closer (a few passes; the ends stay put where they tee into another road)
def relax(path, keep=(0, -1)):
    ln = LineString(path); n = max(2, int(ln.length / 10)); pts = [list(ln.interpolate(i / n, normalized=True).coords[0]) for i in range(n + 1)]
    for _ in range(12):
        moved = False
        for i, q in enumerate(pts):
            if i in (0, len(pts) - 1): continue
            P = Point(q); near = min(lots.values(), key=lambda g: g.distance(P)); d = near.distance(P)
            if d >= 14.5: continue
            b = near.exterior.interpolate(near.exterior.project(P)); v = np.subtract(q, b.coords[0]); L = np.hypot(*v)
            if near.contains(P): v = -v
            if L < 1e-6: continue
            q2 = list(np.add(q, v / L * (14.6 - (d if not near.contains(P) else -d)) * 0.5))
            if min(g.distance(Point(q2)) for g in lots.values()) > d: pts[i] = q2; moved = True
        sm = [pts[0]] + [list(np.mean(pts[i - 1:i + 2], 0)) for i in range(1, len(pts) - 1)] + [pts[-1]]  # and keep it smooth
        pts = [sm[i] if min(g.distance(Point(sm[i])) for g in lots.values()) >= min(14.5, min(g.distance(Point(pts[i])) for g in lots.values())) else pts[i] for i in range(len(pts))]
        if not moved: break
    return [[round(x, 1), round(y, 1)] for x, y in LineString(pts).simplify(1.0).coords]
creek, amber, stub = relax(creek), relax(amber), relax(stub)
G['network'] = [{'name': 'Creeksong Way', 'path': creek}, {'name': 'Amber Valley Way', 'path': amber}, {'name': 'Creeksong Way', 'path': stub}]
paved = unary_union([LineString(r['path']).buffer(12, cap_style=2, join_style=1) for r in G['network']])
# the lot 2 easement stops at the road's right-of-way (its trace took in the verge along lot 1's front)
row = unary_union([LineString(r['path']).buffer(26, cap_style=2, join_style=1) for r in G['network']])
ease = Polygon(G['easement']['ring']).difference(row); ease = max(getattr(ease, 'geoms', [ease]), key=lambda g: g.area).buffer(-8).buffer(8); ease = max(getattr(ease, 'geoms', [ease]), key=lambda g: g.area).simplify(0.5)  # (no slivers along the road)
from shapely.geometry.polygon import orient
G['easement'] = {'ring': [[round(x, 2), round(y, 2)] for x, y in orient(ease, 1.0).exterior.coords[:-1]], 'acres': round(ease.area / 43560, 3)}
over = {n: round(paved.intersection(p).area) for n, p in lots.items() if paved.intersection(p).area > 50}
(ROOT / 'data' / 'plan_geometry.json').write_text(json.dumps(G, indent=1))
print('network:', [(r['name'], round(LineString(r['path']).length)) for r in G['network']], '24 ft paving over lots (sf):', over)
