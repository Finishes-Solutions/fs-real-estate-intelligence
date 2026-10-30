"""The traced lots, roads and the lot 2 easement on the real parcel, in the app's plan feet.

data/lots.json holds the lots traced from the vector lot map (poster feet) and plan_fit: the scale, turn and shift that
lay them on the Regrid parcel outline (best overlap; it came out at a 0° turn, so the poster is drawn north-up, and 2.5%
larger). This writes data/plan_geometry.json for build/projects/montreve.mjs, in feet east / north of the project's
origin [-83.69085, 35.7248962]: the parcel ring, every lot, the roads (clipped to the parcel, named) and the easement.
Rings are counter-clockwise and open (the app's convention).

  python3 -I projects/montreve/scripts/georef.py
"""
import json
from pathlib import Path
from shapely.geometry import Polygon, mapping
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely import affinity

ROOT = Path(__file__).resolve().parents[1]
L = json.loads((ROOT / 'data' / 'lots.json').read_text())
F = L['plan_fit']
tf = lambda g: affinity.translate(affinity.rotate(affinity.scale(g, F['scale'], F['scale'], origin=tuple(F['about'])), F['rot'], origin=tuple(F['about'])), *F['shift'])
ring = lambda g: [[round(x, 2), round(y, 2)] for x, y in orient(g, 1.0).exterior.coords[:-1]]

parcel = orient(Polygon(L['parcel_ring']).buffer(0), 1.0)
lots = {int(n): tf(Polygon(v['ring'])).intersection(parcel) for n, v in L['lots'].items()}
lots = {n: max(getattr(g, 'geoms', [g]), key=lambda p: p.area).simplify(0.4) for n, g in lots.items()}
roads = unary_union([tf(Polygon(r)) for r in L['roads']]).intersection(parcel).difference(unary_union(list(lots.values())).buffer(0.3))
roads = [g.simplify(0.4) for g in getattr(roads, 'geoms', [roads]) if g.area > 2000]

# the upper road (Amber Valley Way) fronts lots 9-16, the lower (Creeksong Way) lots 26-32; the entrance road from
# Happy Hollow Road runs along lots 1-3 into Creeksong Way
def name_of(g):
    near = lambda ns: sum(g.distance(lots[n]) < 5 for n in ns)
    return 'Amber Valley Way' if near([9, 10, 11, 12, 13, 14, 15]) >= near([26, 27, 28, 29, 30, 31, 32]) else 'Creeksong Way'

# lot 2's utility / sewage disposal easement: the hatched gap between lots 1, 2 and 3 and the entrance road
near = unary_union([lots[1], lots[2], lots[3], unary_union(roads).intersection(unary_union([lots[1], lots[3]]).buffer(80))])
gap = near.buffer(120, join_style=2).buffer(-120, join_style=2).difference(unary_union([near, *lots.values()]).buffer(1)).intersection(parcel)
easement = max(getattr(gap, 'geoms', [gap]), key=lambda g: g.area if g.distance(lots[2]) < 5 else 0).intersection(parcel.buffer(-0.5)).simplify(0.5)

# the resort core's sites, lot pairs merged (lot lines between them dropped): courts 10-11, dining 12-13, pavilion 14-15
pairs = {k: unary_union([lots[a].buffer(0.6), lots[b].buffer(0.6)]).buffer(-0.6).simplify(0.4) for k, (a, b) in {'courts': (10, 11), 'dining': (12, 13), 'pavilion': (14, 15)}.items()}

out = {
    'origin': [-83.69085, 35.7248962], 'fit': F,
    'parcel': ring(parcel), 'parcel_acres': round(parcel.area / 43560, 3),
    'lots': {str(n): {'ring': ring(g), 'acres_listed': L['lots'][str(n)]['acres_listed'], 'acres': round(g.area / 43560, 3), 'use': L['lots'][str(n)]['use'],
                      **({'flag': L['lots'][str(n)]['flag']} if 'flag' in L['lots'][str(n)] else {})} for n, g in sorted(lots.items())},
    'roads': [{'name': name_of(g), 'ring': ring(g), 'acres': round(g.area / 43560, 3)} for g in roads],
    'easement': {'ring': ring(easement), 'acres': round(easement.area / 43560, 3)},
    'pairs': {k: ring(g) for k, g in pairs.items()},
}
(ROOT / 'data' / 'plan_geometry.json').write_text(json.dumps(out, indent=1))
print(f"parcel {out['parcel_acres']} ac, {len(out['lots'])} lots ({sum(v['acres'] for v in out['lots'].values()):.2f} ac on the parcel), "
      f"roads {[(r['name'], r['acres']) for r in out['roads']]}, easement {out['easement']['acres']} ac")
