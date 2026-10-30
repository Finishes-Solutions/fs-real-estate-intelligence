"""Lot geometry from the vector lot map, in feet.

Reads source/MONTREVE_Lot_Map_vector.pdf (the October 2026 marketing lot poster, drawn from the 2007 plat), takes each
filled lot shape, matches it to its lot number and listed acreage, and scales the drawing to feet. The scale is the
median of listed acres / drawn area over all lots: most lots agree within 4%, so the drawing is to scale, but lots whose
drawn area is far below the listing (the poster clips them at the edge of the sheet) are flagged.

Writes data/lots.json: { scale_ft_per_pt, lots: { "1": { acres_listed, acres_drawn, ring: [[x, y] ft], use, ... } },
roads: [ring ft], site: ring ft }. x runs east, y north, assuming the poster is drawn north-up (not stated on it).

  python3 -I projects/montreve/scripts/lots.py
"""
import json, re, statistics, sys
from pathlib import Path
import pymupdf
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
SRC, OUT = ROOT / 'source' / 'MONTREVE_Lot_Map_vector.pdf', ROOT / 'data' / 'lots.json'
SQFT_PER_ACRE = 43560

# Program from Will Essner's Oct 22 2026 business plan (p. 5 "candidate resort program") plus the lot-sale strategy:
# the seven financed homes stay, lots 10-15 become the resort core, every other lot gets the standard cabin for sale.
EXISTING = {1, 3, 6, 18, 21, 28, 30}
AMENITY = {14: 'pavilion', 15: 'pavilion', 12: 'dining', 13: 'dining', 10: 'courts', 11: 'courts'}
# lots that front each internal road (the upper road is Amber Valley Way, the lower Creeksong Way; plan p. 4)
# The entrance road runs along the south edge of lots 1-3 with no lot on its far side, so closing the gaps between lots
# can't find it: its centreline is digitized from the poster (pixels of a 110 dpi render of the page).
ENTRY_ROAD_PX = [(55, 846), (100, 838), (230, 881), (385, 920), (490, 913), (580, 880), (660, 828), (720, 818)]
NOTES = {2: '0.77 ac of the 1.44 ac listing is the utility / sewage disposal easement (hatched); 0.67 ac usable (2024 appraisal).'}


def flatten(items):
    pts = []
    for it in items:
        if it[0] == 'l':
            pts += [(it[1].x, it[1].y), (it[2].x, it[2].y)]
        elif it[0] == 'c':
            p0, p1, p2, p3 = it[1:5]
            for i in range(9):
                t = i / 8; m = 1 - t
                pts.append((m**3 * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t**3 * p3.x,
                            m**3 * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t**3 * p3.y))
        elif it[0] == 're':
            r = it[1]; pts += [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
    out = []
    for p in pts:
        if not out or abs(out[-1][0] - p[0]) + abs(out[-1][1] - p[1]) > 0.01:
            out.append(p)
    return out


def main():
    page = pymupdf.open(SRC)[0]
    # lot fills are the light-to-mid blues; the dark navy fills are text, dots and outlines
    shapes = [Polygon(flatten(d['items'])).buffer(0) for d in page.get_drawings()
              if d['type'] == 'f' and d.get('fill') and d['fill'][2] > 0.8 and d['fill'][0] < 0.9]
    words = page.get_text('words')
    mid = lambda w: ((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)
    nums = [(mid(w), int(w[4])) for w in words if re.fullmatch(r'\d{1,2}', w[4])]
    acres = [(mid(w), float(w[4])) for w in words if re.fullmatch(r'\d\.\d\d', w[4])]
    lots = {}
    for (x, y), n in nums:
        hit = max((s for s in shapes if s.contains(Point(x, y))), key=lambda s: s.area, default=None)
        if hit is None:
            sys.exit(f'lot {n}: no shape under its label')
        listed = min(acres, key=lambda a: (a[0][0] - x) ** 2 + (a[0][1] - y) ** 2)[1]
        lots[n] = {'shape': hit, 'listed': listed, 'label': (x, y)}
    if len(lots) != 30:
        sys.exit(f'expected 30 lots, found {len(lots)}')

    ft2 = statistics.median(v['listed'] * SQFT_PER_ACRE / v['shape'].area for v in lots.values())
    k = ft2 ** 0.5  # feet per PDF point
    H = page.rect.height
    to_ft = lambda p: [round(p[0] * k, 2), round((H - p[1]) * k, 2)]  # PDF y runs down; plan y runs north
    ft_poly = lambda s: Polygon([to_ft(p) for p in s.exterior.coords])

    out_lots = {}
    for n in sorted(lots):
        v = lots[n]; P = ft_poly(v['shape']).simplify(0.3)
        drawn = P.area / SQFT_PER_ACRE
        use = 'existing' if n in EXISTING else AMENITY.get(n, 'cabin')
        rec = {'acres_listed': v['listed'], 'acres_drawn': round(drawn, 3), 'drawn_vs_listed': round(drawn / v['listed'], 3),
               'use': use, 'label': to_ft(v['label']), 'ring': [list(c) for c in P.exterior.coords]}
        if abs(drawn / v['listed'] - 1) > 0.08 and n != 2:
            rec['flag'] = 'drawn area differs from the listing by more than 8%: the poster likely clips this lot; confirm on the plat'
        if n in NOTES:
            rec['note'] = NOTES[n]
        out_lots[str(n)] = rec

    # the roads: close the 50-ft gaps between lots (grow 32 ft, shrink back), then take the lots away
    polys = [Polygon(r['ring']) for r in out_lots.values()]
    lotset = unary_union(polys)
    closed = lotset.buffer(32, join_style=2).buffer(-32, join_style=2)
    entry = LineString([to_ft((x * 72 / 110, y * 72 / 110)) for x, y in ENTRY_ROAD_PX]).buffer(25, cap_style=2)
    closed = closed.union(entry)
    roads = closed.difference(lotset.buffer(0.5))
    roads = [g for g in getattr(roads, 'geoms', [roads]) if g.area > 20000]
    site = closed.exterior

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        'source': 'source/MONTREVE_Lot_Map_vector.pdf (marketing lot poster, Oct 6 2026; layout follows the May 11 2007 plat)',
        'scale_ft_per_pt': round(k, 4), 'orientation': 'assumed north-up; the poster has no north arrow',
        'acres_listed_total': round(sum(v['listed'] for v in lots.values()), 2),
        'acres_drawn_total': round(lotset.area / SQFT_PER_ACRE, 2),
        'acres_inside_road_loop': round(Polygon(site.coords).area / SQFT_PER_ACRE, 2),
        'lots': out_lots,
        'roads': [[list(c) for c in g.exterior.coords] for g in roads],
        'site': [list(c) for c in site.coords],
    }, indent=1))
    print(f'{len(out_lots)} lots, {k:.3f} ft/pt (1 in = {k * 72:.0f} ft), listed {sum(v["listed"] for v in lots.values()):.2f} ac, '
          f'drawn {lotset.area / SQFT_PER_ACRE:.2f} ac, {len(roads)} road pieces -> {OUT}')
    for n, r in out_lots.items():
        if 'flag' in r:
            print(f'  lot {n}: listed {r["acres_listed"]} ac, drawn {r["acres_drawn"]:.2f} ac')


if __name__ == '__main__':
    main()
