#!/usr/bin/env python3
"""Montreve cabin: vector redraw of the owner-supplied floor plans.

Geometry is in FEET. Origin = front-left exterior corner of the house,
x to the right, y toward the rear (deck). Walls are given as an exterior
envelope polygon (wall band = polygon minus its inward offset) plus
interior wall rectangles; openings cut the walls and draw their symbol.

Outputs:
  out/Montreve_Cabin_Plans.pdf      (A-000 cover, A-100..A-103 plans; 24x36, 1/4" = 1'-0")
  data/cabin_footprint.json         (house + deck outline for site planning)
"""
import json
import math
import os
import random

from reportlab.lib.colors import Color, black, white
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import FILL_EVEN_ODD, Canvas
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_PDF = os.path.join(ROOT, "out", "Montreve_Cabin_Plans.pdf")
OUT_JSON = os.path.join(ROOT, "data", "cabin_footprint.json")

W, D, DECK = 33 + 4 / 12, 33 + 4 / 12, 9.0      # house width, depth, deck depth
TE, TI, TF = 7 / 12, 4.5 / 12, 9 / 12          # exterior, interior, foundation wall
REAR = D
DATE = "2026-10-30"

# ----------------------------------------------------------------- helpers
def R(x0, y0, x1, y1):
    return (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))


def hwin(y0, y1, xa, xb, tag=None, mull=0):
    return dict(k="win", cut=R(xa, y0, xb, y1), ax="h", t=(y0, y1), s=(xa, xb), tag=tag, mull=mull)


def vwin(x0, x1, ya, yb, tag=None, mull=0):
    return dict(k="win", cut=R(x0, ya, x1, yb), ax="v", t=(x0, x1), s=(ya, yb), tag=tag, mull=mull)


def hdoor(y0, y1, xa, xb, hinge, side, tag=None, cut=True):
    hx, lx = (xa, xb) if hinge == "a" else (xb, xa)
    fy = y1 if side > 0 else y0
    return dict(k="door", cut=R(xa, y0, xb, y1) if cut else None, hinge=(hx, fy), latch=(lx, fy), n=(0, side), tag=tag)


def vdoor(x0, x1, ya, yb, hinge, side, tag=None, cut=True):
    hy, ly = (ya, yb) if hinge == "a" else (yb, ya)
    fx = x1 if side > 0 else x0
    return dict(k="door", cut=R(x0, ya, x1, yb) if cut else None, hinge=(fx, hy), latch=(fx, ly), n=(side, 0), tag=tag)


def hpair(y0, y1, xa, xb, side, tag=None):
    m = (xa + xb) / 2
    return [hdoor(y0, y1, xa, m, "a", side, tag), hdoor(y0, y1, m, xb, "b", side)]


def vpair(x0, x1, ya, yb, side, tag=None):
    m = (ya + yb) / 2
    return [vdoor(x0, x1, ya, m, "a", side, tag), vdoor(x0, x1, m, yb, "b", side)]


def hslide(y0, y1, xa, xb, tag=None):
    return dict(k="slide", cut=R(xa, y0, xb, y1), ax="h", t=(y0, y1), s=(xa, xb), tag=tag)


def vslide(x0, x1, ya, yb, tag=None):
    return dict(k="slide", cut=R(x0, ya, x1, yb), ax="v", t=(x0, x1), s=(ya, yb), tag=tag)


def hbifold(y0, y1, xa, xb, side, tag=None):
    return dict(k="bifold", cut=R(xa, y0, xb, y1), ax="h", t=(y0, y1), s=(xa, xb), side=side, tag=tag)


def vbifold(x0, x1, ya, yb, side, tag=None):
    return dict(k="bifold", cut=R(x0, ya, x1, yb), ax="v", t=(x0, x1), s=(ya, yb), side=side, tag=tag)


def panel(x0, y0, x1, y1, tag=None):
    """Surface sliding (barn / pocket) door panel, drawn as a thin bar."""
    return dict(k="panel", cut=None, r=R(x0, y0, x1, y1), tag=tag)


def cut(x0, y0, x1, y1):
    return dict(k="cut", cut=R(x0, y0, x1, y1))


def ftin(v):
    inches = round(abs(v) * 12)
    return "%d'-%d\"" % (inches // 12, inches % 12)


# ----------------------------------------------------------------- shared pieces
WING1, WING2 = 13 + 7 / 12, 13.75     # left wing outer width, 1st / 2nd floor
FOY_F, FOY_R = 4 + 10 / 12, 21.0      # foyer front face y, foyer right face x
GR_F = REAR - 17.75                   # great-room front face (17'-9" from rear)
BAL_F = GR_F - (5 + 8 / 12)           # balcony outer edge (5'-8")
FP = (32 + 1 / 3, 23 + 11 / 24, 34 + 1 / 12, 28 + 1 / 3)   # chimney / fireplace box


def envelope(wing, foyer_r=FOY_R):
    return Polygon([(0, 0), (wing, 0), (wing, FOY_F), (foyer_r, FOY_F), (foyer_r, GR_F),
                    (W, GR_F), (W, D), (0, D)])


def ext_stair(landing="dash"):
    return [("stair_ext", -3.0, D, 0.0, D + DECK, landing)]


def deck(x0, x1, posts=True, boards=True):
    return [("deck", x0, D, x1, D + DECK, posts, boards)]


# Right wall windows / fireplace (same on 1st and 2nd floor)
RIGHT_WINS = [vwin(W - TE, W, REAR - 2.75 - 1.25, REAR - 2.75 + 1.25, "SH 3060"),
              vwin(W - TE, W, REAR - 12.0 - 1.25, REAR - 12.0 + 1.25, "SH 3060")]

# ======================================================================= FIRST FLOOR
Y_BATH_T = REAR - TE - 13 - 7 / 12          # 19'-2": underside of kitchen run (3'-0"+7'-7"+3'-0")
Y_PART = Y_BATH_T - 2 * TI - (6 + 1 / 12)   # partition bottom face; m.bath clear 6'-1"
X_PWR = TE + 12 + 10 / 12                   # 12'-10" to powder room outer face
X_STAIR = X_PWR + 5 + 2 / 12                # 5'-2" hall to stair

F1 = dict(
    key="first", title="FIRST FLOOR PLAN", sheet="A-101", area="880 SF",
    env=envelope(WING1), te=TE, wall="frame",
    walls=[
        R(TE, Y_BATH_T - TI, X_PWR, Y_BATH_T),                 # m.bath / powder top wall
        R(TE, Y_PART, X_PWR, Y_PART + TI),                     # bath / bedroom partition
        R(9 + 1 / 6, Y_PART + TI, 9 + 1 / 6 + TI, Y_BATH_T - TI),   # m.bath / powder
        R(X_PWR - TI, Y_PART, X_PWR, Y_BATH_T),                # powder right wall
        R(10 + 7 / 12, 8.6, 10 + 7 / 12 + TI, Y_PART),         # closet 1
        R(10 + 7 / 12, 8.6, X_PWR, 8.6 + TI),
        R(X_PWR - TI, 8.6, X_PWR, 9.3), R(X_PWR - TI, 11.9, X_PWR, Y_PART),
        R(10 + 7 / 12, 5 + 1 / 12, WING1, 5 + 1 / 12 + TI),    # closet 2
        R(10 + 7 / 12, TE, 10 + 7 / 12 + TI, 1.0), R(10 + 7 / 12, 4.7, 10 + 7 / 12 + TI, 5.1),
        R(X_STAIR, Y_BATH_T - TI, 23.7, Y_BATH_T),             # stair top wall
    ],
    openings=[
        # rear wall
        *hpair(REAR - TE, REAR, 3 + 5 / 6, 8 + 5 / 6, +1, "(2)3082"),
        hwin(REAR - TE, REAR, 13.5, 19.5),
        *hpair(REAR - TE, REAR, 20.0, 26.0, +1, "(2)3682"),
        hwin(REAR - TE, REAR, 26.5, 32.5),
        # left wall (window centres from the 17'-1" / 5'-6" / 9'-0" string)
        vwin(0, TE, REAR - 17 - 1 / 12 - 1.5, REAR - 17 - 1 / 12 + 1.5, "SH 3618"),
        vwin(0, TE, 9.75, 11.75, "SH 2460"),
        vwin(0, TE, 0.75, 2.75, "SH 2484"),
        hwin(0, TE, TE, 6 + 7 / 12, "(3) SH 3082", mull=2),
        *RIGHT_WINS,
        hwin(GR_F, GR_F + TE, 30 + 1 / 3 - 7 / 6, 30 + 1 / 3 + 7 / 6),
        # foyer front: sidelight / entry door / sidelight
        hwin(FOY_F, FOY_F + TE, 13.9, 15.4),
        hdoor(FOY_F, FOY_F + TE, 15.4, 18.75, "a", +1, "TYPE A"),
        hwin(FOY_F, FOY_F + TE, 18.75, 20.2),
        # interior
        hslide(Y_PART, Y_PART + TI, 3.125, 5.8, "TYPE D"),
        cut(X_PWR - TI, 14.375, X_PWR, 17.375), panel(X_PWR, 13.6, X_PWR + 0.12, 16.6, "TYPE D"),
        vdoor(X_PWR - TI, X_PWR, 9.3, 11.9, "a", +1, "3282"),
        vbifold(10 + 7 / 12, 10 + 7 / 12 + TI, 1.0, 4.7, -1, "(2)2482"),
        vdoor(WING1 - TI, WING1, 5 + 1 / 12 + TI, 8.6, "a", -1, "3282", cut=False),
        vdoor(X_STAIR - 0.01, X_STAIR, GR_F + TE, Y_BATH_T - TI, "b", -1, "3082", cut=False),
    ],
    fixtures=[
        ("counter", 0.583, Y_BATH_T + 2.83, 2 + 2 / 3, REAR - TE),
        ("range", 0.583, 24.75, 2 + 2 / 3, 27.25),
        ("box", 0.583, Y_BATH_T, 2.833, 22.0, "REF"),
        ("counter", 6 + 1 / 6, 22 + 1 / 6, 9 + 1 / 6, REAR - TE - 3.0),
        ("sinkbox", 6.42, 27.75, 7.92, 29.4),
        ("dashbox", 6.3, 23.8, 8.2, 25.9, "DW"),
        ("stool", 10.0, 28.4), ("stool", 10.0, 25.85), ("stool", 10.0, 23.3),
        ("counter", TE, Y_PART + TI + 0.3, 2.6, Y_BATH_T - TI - 0.25),
        ("lav", 1.6, 17.0, (1, 0)), ("lav", 1.6, 14.2, (1, 0)),
        ("shower", 6 + 1 / 6, Y_BATH_T - TI - 3.0, 9 + 1 / 6, Y_BATH_T - TI),
        ("wc", 9 + 1 / 6, 13.75, (-1, 0)),
        ("wc", 11.25, Y_BATH_T - TI, (0, -1)),
        ("counter", 10.0, Y_PART + TI, 12.75, Y_PART + TI + 1.6),
        ("lav", 11.375, Y_PART + TI + 0.75, (0, 1)),
        ("fireplace",) + FP,
        ("dash", 12.12, 8.6 + TI, 12.12, Y_PART),
        ("dash", 12.12, TE, 12.12, 5 + 1 / 12),
        ("dash", 13.5, Y_BATH_T, 13.5, REAR - TE),
        ("xbox", 20.05, 9.83, 20.4, 10.18),
        ("stair", X_STAIR + 0.42, GR_F + TE, 29.5, Y_BATH_T - TI, "DN", "break"),
        ("landing", 29.5, GR_F + TE, W - TE, Y_BATH_T - TI),
        ("rail", 23.7, Y_BATH_T - 0.22, 29.5, Y_BATH_T - 0.22),
        ("slab", 13.583, 0, 21.0, FOY_F, [0.833, 1.667]),
        ("dashrect", 21.0, BAL_F, W - 0.2, GR_F, "BALCONY ABOVE"),
    ] + deck(0, W) + ext_stair("dash"),
    rooms=[
        ("KITCHEN", 4.5, 28.6, ["F1", "W-1", "CL-1"], None),
        ("DINING AREA", 16.6, 27.0, ["F1", "W-1"], None),
        ("LIVING ROOM / GREAT ROOM", 25.6, 28.6, ["F1", "W-1"], None),
        ("M. BATH", 4.3, 16.6, ["F3", "W-2"], [R(TE, Y_PART + TI, 9.167, Y_BATH_T - TI)]),
        ("POWDER", 11.3, 15.7, ["F3", "W-2"], [R(9.542, Y_PART + TI, X_PWR - TI, Y_BATH_T - TI)]),
        ("MASTER BEDROOM", 5.4, 7.2, ["F1", "W-1"], [R(TE, TE, 10.583, Y_PART), R(10.583, 5.458, WING1 - TE, 8.6)]),
        ("CL.", 11.9, 10.4, [], None),
        ("CL.", 11.6, 3.0, [], None),
        ("FOYER", 17.4, 10.4, ["F1", "W-1"], [R(WING1, FOY_F + TE, FOY_R - TE, GR_F + TE)]),
        ("ENTRY", 17.3, 2.9, ["F5"], None),
        ("DECK AREA", 16.6, 38.6, ["F6"], None),
        ("FP", 31.6, 26.0, [], None),
    ],
    notes_at=[(20.6, 21.8, ["INTERIOR WOOD STAIR", "15 RISERS / 14 TREADS",
                             "RISERS: 8-1/4\" MAX RISER", "TREADS: 9\" + 1\" NOSING"])],
    dims=[
        ("h", D + DECK + 3.6, [0, W], D + DECK),
        ("h", D + DECK + 1.6, [0, 6 + 1 / 3, 16.5, 23.0, 29.5, W], D + DECK),
        ("h", -2.6, [0, 3 + 7 / 12, WING1, FOY_R], 0),
        ("h", GR_F - 2.0, [FOY_R, 30 + 1 / 3, W], GR_F),
        ("h", REAR - TE - 2.4, [TE, 2 + 2 / 3, 6 + 1 / 6, 9 + 1 / 6], None),
        ("h", REAR - TE - 3.6, [9 + 1 / 6, W - TE], None),
        ("h", Y_BATH_T + 0.45, [TE, X_PWR, X_STAIR, W - TE], None),
        ("h", 2.1, [TE, 13.0], None),
        ("v", 5.4, [Y_BATH_T, Y_BATH_T + 3, REAR - TE - 3, REAR - TE], None),
        ("v", 8.6, [Y_PART + TI, Y_BATH_T - TI], None),
        ("v", 7.8, [TE, Y_PART], None),
        ("v", 31.2, [GR_F + TE, Y_BATH_T], None),
        ("v", -5.0, [1.75, 10.75, REAR - 17 - 1 / 12, D, D + DECK], 0),
        ("v", -7.0, [1.75, D + DECK], 0),
        ("v", W + 2.6, [FOY_F, BAL_F, GR_F, REAR - 12, REAR - 2.75, D, D + DECK], W),
        ("v", W + 4.6, [0, D, D + DECK], W),
    ],
)

# ======================================================================= SECOND FLOOR
Y_B2T = 12 + 17 / 24                 # bedroom-2 top wall (bath bottom)
Y_BTH = Y_B2T + TI + 5.0             # bath 5'-0"
Y_CLT = REAR - TE - 11.25            # bedroom 3 is 11'-3" deep
X_B3R = TE + 12 + 7 / 12             # bedroom 3 is 12'-7" wide
X_FOYL = FOY_R - TE - (6 + 10 / 12)  # 2nd-floor foyer is 6'-10" clear
F2 = dict(
    key="second", title="SECOND FLOOR PLAN", sheet="A-102", area="880 SF",
    env=envelope(WING2), te=TE, wall="frame",
    walls=[
        R(TE, Y_B2T, 10.25, Y_B2T + TI), R(12.917, Y_B2T, X_FOYL, Y_B2T + TI),
        R(9.417, Y_B2T + TI, 9.833, 15.4),
        R(TE, Y_BTH, 10.417, Y_BTH + 1 / 3),
        R(5.417, Y_BTH, 5.833, Y_CLT),
        R(5.417, Y_CLT - TI, 10.417, Y_CLT), R(TE, Y_CLT - TI, 0.958, Y_CLT),
        R(10.042, Y_BTH, 10.417, Y_BTH + 0.35), R(10.042, Y_CLT - 0.6, 10.417, Y_CLT),
        R(12.917, Y_CLT - TI, X_FOYL, Y_CLT),
        R(X_B3R, 18.79, X_FOYL, REAR - TE),
        R(X_B3R, FOY_F, X_FOYL, Y_B2T + TI),
        R(10.75, 9.333, X_B3R, 9.708), R(10.75, 8.05, 11.125, 9.708), R(10.75, TE, 11.125, 1.8),
    ],
    openings=[
        hwin(REAR - TE, REAR, 3 + 1 / 3, 4 + 5 / 12),
        *hpair(REAR - TE, REAR, 4 + 5 / 12, 9 + 5 / 12, +1, "(2)3082"),
        hwin(REAR - TE, REAR, 9 + 5 / 12, 10.5),
        hwin(REAR - TE, REAR, 13.833, 19.5), hwin(REAR - TE, REAR, 20.0, 26.0), hwin(REAR - TE, REAR, 26.5, 32.5),
        vwin(0, TE, 31 + 1 / 6 - 1.25, 31 + 1 / 6 + 1.25, "SH 3060"),
        vwin(0, TE, 23.25 - 1.25, 23.25 + 1.25, "SH 3060"),
        vwin(0, TE, 16 + 1 / 6 - 1.5, 16 + 1 / 6 + 1.5, "SH 3618"),
        vwin(0, TE, 11 + 2 / 3 - 1, 11 + 2 / 3 + 1, "SH 2460"),
        vwin(0, TE, 1 + 7 / 12 - 1, 1 + 7 / 12 + 1, "SH 2484"),
        hwin(0, TE, TE, 6 + 7 / 12, "(3) SH 3082", mull=2),
        hwin(FOY_F, FOY_F + TE, 14.5, 19.6),
        *RIGHT_WINS,
        hdoor(GR_F, GR_F + TE, 21.917, 24.417, "a", -1, "3282"),
        vdoor(9.417, 9.833, 15.4, Y_BTH, "b", -1, "3082", cut=False),
        hdoor(Y_B2T, Y_B2T + TI, 10.25, 12.917, "b", -1, "3282", cut=False),
        hdoor(Y_CLT - TI, Y_CLT, 10.417, 12.917, "b", +1, "3282", cut=False),
        vbifold(10.042, 10.417, Y_BTH + 0.35, Y_CLT - 0.6, +1, "TYPE F"),
        panel(1.0, Y_CLT - 0.25, 3.3, Y_CLT - 0.17, "5482"), panel(3.1, Y_CLT - 0.15, 5.4, Y_CLT - 0.07),
        panel(10.85, 1.8, 10.93, 5.0, "7282"), panel(10.95, 4.8, 11.03, 8.05),
    ],
    fixtures=[
        ("tub", TE, Y_B2T + TI, 3.083, Y_BTH),
        ("wc", 4.55, Y_B2T + TI, (0, 1)),
        ("counter", 6.75, Y_B2T + TI, 9.417, Y_B2T + TI + 1.6),
        ("lav", 8.05, Y_B2T + TI + 0.75, (0, 1)),
        ("box", 6.2, Y_BTH + 0.55, 9.3, Y_CLT - TI - 0.15, None),
        ("dash", TE, 20.0, 5.417, 20.0),
        ("dash", 12.2, TE, 12.2, 9.333),
        ("fireplace",) + FP,
        ("xvoid", X_FOYL, 19.083, W - TE, REAR - TE),
        ("xvoid", X_FOYL, FOY_F + TE, FOY_R - TE, 12.583),
        ("rail", X_FOYL, 12.62, FOY_R - TE, 12.62),
        ("rail", X_FOYL, 19.0, 29.5, 19.0),
        ("rail", 18.583, GR_F + TE - 0.08, FOY_R - TE, GR_F + TE - 0.08),
        ("stair", 18.75, GR_F + TE, 29.5, 18.94, "DN", None),
        ("landing", 29.5, GR_F + TE, W - TE, 18.94),
        ("balcony", FOY_R, BAL_F, 32.75, GR_F),
        ("lowerdeck", 13.333, D, W, D + DECK),
    ] + deck(0, 13.333, posts=False) + ext_stair("solid"),
    rooms=[
        ("BEDROOM 3", 5.6, 27.6, ["F1"], [R(TE, Y_CLT, X_B3R, REAR - TE)]),
        ("BEDROOM 2", 5.4, 7.0, ["F1"], [R(TE, TE, 10.75, Y_B2T), R(10.75, 9.708, X_B3R, Y_B2T)]),
        ("BATH", 5.6, 16.6, ["F3"], [R(TE, Y_B2T + TI, 9.417, Y_BTH)]),
        ("CL. / H.W.", 2.9, 19.3, [], None),
        ("CL.", 7.75, 20.15, [], None),
        ("CL.", 12.15, 4.0, [], None),
        ("HALL", 16.4, 14.9, ["F1"], None),
        ("FOYER", 17.0, 10.0, ["OPEN TO BELOW"], None),
        ("DINING AREA", 18.5, 27.4, ["OPEN TO BELOW"], None),
        ("LIVING ROOM / GREAT ROOM", 26.0, 25.4, ["OPEN TO BELOW"], None),
        ("BALCONY", 27.0, 12.6, ["F6"], None),
        ("DECK AREA", 6.9, 38.4, ["F6"], None),
        ("LOWER DECK BELOW", 23.3, 38.0, ["TREX DECKING OVER 2x8 JOISTS,", "SLOPED 1/4\" PER FT"], None),
    ],
    notes_at=[(21.5, 22.4, ["INTERIOR WOOD STAIR", "15 RISERS / 14 TREADS",
                             "RISERS: 8-1/4\" MAX RISER", "TREADS: 9\" + 1\" NOSING"])],
    dims=[
        ("h", D + DECK + 4.4, [0, W], D + DECK),
        ("h", REAR + 1.4, [0, 6 + 11 / 12, 16 + 2 / 3, 23 + 1 / 6, 29 + 2 / 3, W], D),
        ("h", -2.6, [0, WING2, FOY_R, W], 0),
        ("h", REAR - TE - 2.0, [TE, X_B3R], None),
        ("h", REAR - TE - 2.0, [X_FOYL, W - TE], None),
        ("h", 9.2, [TE, X_B3R], None),
        ("h", 6.6, [X_FOYL, FOY_R - TE], None),
        ("h", BAL_F - 0.9, [FOY_R, W], None),
        ("h", Y_B2T - 1.3, [TE, 9.417], None),
        ("h", Y_B2T - 1.3, [9.833, X_B3R], None),
        ("v", 9.0, [Y_B2T + TI, Y_BTH], None),
        ("v", 10.7, [Y_CLT, REAR - TE], None),
        ("v", W - TE - 1.0, [19.083, FP[1], FP[3], REAR - TE], None),
        ("v", -4.6, [0, 1 + 7 / 12, 11 + 2 / 3, 16 + 1 / 6, 23.25, 31 + 1 / 6, D], 0),
        ("v", -6.6, [0, D, D + DECK], 0),
        ("v", W + 2.6, [BAL_F, GR_F, REAR - 12, REAR - 2.75, D, D + DECK], W),
    ],
)

# ======================================================================= BASEMENT
B_POOLF = REAR - (24 + 7 / 12)       # pool room front wall outer face (24'-7")
B_POOLR = 13.25                      # pool room right foundation wall inner face
B_PART = (B_POOLR, B_POOLR + TI)     # pool / rec partition
X_BATHR = B_PART[1] + 4 + 7 / 12     # bath 4'-7"
X_MECHR = B_PART[1] + 8.5            # mechanical 8'-6"
Y_IN = GR_F + TF                     # inside face of the basement front wall
PIERS = [1 / 3, 11 + 1 / 3, 21 + 11 / 12, 32 + 11 / 12]
PIER_Y = REAR + 4 + 2 / 12 + 4 + 5 / 12
FB = dict(
    key="basement", title="BASEMENT / FOUNDATION PLAN", sheet="A-100", area="684 SF",
    env=Polygon([(0, 0), (13 + 5 / 6, 0), (13 + 5 / 6, FOY_F), (21 + 1 / 12, FOY_F), (21 + 1 / 12, GR_F),
                 (W, GR_F), (W, D), (0, D)]),
    te=TF, wall="found",
    found=[R(0, B_POOLF, B_POOLR + TF, B_POOLF + TF), R(B_POOLR, B_POOLF, B_POOLR + TF, Y_IN),
           R(B_POOLR, GR_F, 21 + 1 / 12, Y_IN)],
    walls=[
        R(*B_PART[:1], 16.333, B_PART[1], 20 + 1 / 6), R(B_PART[0], 24 + 1 / 6, B_PART[1], 30.15),
        R(B_PART[0], 32.4, B_PART[1], REAR - TF),
        R(X_BATHR, 25.375, X_BATHR + TI, REAR - TF),
        R(B_PART[1], 25.375, X_BATHR + TI, 25.75), R(17.625, 25.75, X_BATHR, 28.25),
        R(B_PART[1], 18.833, 16.75, 19.208), R(21.708, 18.833, X_MECHR + TI, 19.208),
        R(X_MECHR, Y_IN, X_MECHR + TI, 19.208),
    ],
    openings=[
        hslide(REAR - TF, REAR, 4.875, 10.792, "7282 TYPE E"),
        hslide(REAR - TF, REAR, 21.125, 27.042, "7282 TYPE E"),
        *vpair(B_PART[0], B_PART[1], 20 + 1 / 6, 24 + 1 / 6, +1, "(2)2482"),
        vdoor(B_PART[0], B_PART[1], 30.15, 32.4, "b", +1, "2882", cut=False),
        hbifold(18.833, 19.208, 16.75, 21.708, +1, "(2)3082"),
    ],
    fixtures=[
        ("pool", 1 + 11 / 12, 10.5, 10 + 5 / 12, 28.5),
        ("dashrect", 1.667, 10.25, 12.6, 31.75, None),
        ("shower", B_PART[1], 25.75, 17.625, 28.25),
        ("wc", X_BATHR, 29.9, (-1, 0)),
        ("counter", 16.75, 31.0, X_BATHR, REAR - TF),
        ("lav", 17.45, 31.8, (-1, 0)),
        ("box", 18.25, Y_IN, 21.708, 18.5, "HVAC"),
        ("wh", 13.75, 16.6, 14.5, 18.35),
        ("stair", 22.9, Y_IN, 29.5, 19.25, "UP", "break_l"),
        ("landing", 29.5, Y_IN, W - TF, 19.25),
        ("rail", X_MECHR + TI, 19.27, W - TF - 0.6, 19.27),
        ("crawl", [(TF, TF), (13 + 5 / 6 - TF, TF), (13 + 5 / 6 - TF, FOY_F + TF), (21 + 1 / 12 - TF, FOY_F + TF),
                   (21 + 1 / 12 - TF, GR_F), (B_POOLR + TF, GR_F), (B_POOLR + TF, B_POOLF), (TF, B_POOLF)]),
        ("footing", 11 / 12),
        ("slabdeck", 0, D, W, D + DECK),
    ] + [("pier", x, PIER_Y) for x in PIERS],
    rooms=[
        ("POOL ROOM", 6.2, 20.4, ["F4", "CL-2", "W-2", "ANTI SKID TILE FINISH"], [R(TF, B_POOLF + TF, B_POOLR, REAR - TF)]),
        ("REC ROOM", 25.6, 26.0, ["F2", "CL-1", "W-1", "F2 - W.P. VINYL FINISH"],
         [R(X_BATHR + TI, Y_IN, W - TF, REAR - TF), R(B_PART[1], 19.208, X_BATHR + TI, 25.375)]),
        ("BATH", 15.2, 31.6, ["F3", "CL-2", "W-2", "W-3"], [R(B_PART[1], 25.75, X_BATHR, REAR - TF)]),
        ("MECH. CL.", 16.35, 17.3, [], None),
        ("CRAWL SPACE", 6.8, 4.6, [], None),
        ("POOL", 6.2, 26.0, ["DESIGNED BY OTHERS"], None),
        ("DECK AREA", 16.6, 39.4, ["F5", "4\" CONC. SLAB OVER COMPACTED GRAVEL"], None),
    ],
    notes_at=[],
    dims=[
        ("h", D + DECK + 3.6, [0, W], D + DECK),
        ("h", D + DECK + 1.6, PIERS, None),
        ("h", REAR + 1.4, [0, 7 + 5 / 6, 24 + 1 / 12, W], D),
        ("h", -2.6, [TF, B_POOLR], 0),
        ("h", -2.6, [13 + 5 / 6, 21 + 1 / 12], 0),
        ("h", REAR - TF - 2.2, [TF, B_POOLR], None),
        ("h", REAR - TF - 2.2, [X_BATHR + TI, W - TF], None),
        ("h", 28.65, [B_PART[1], X_BATHR], None),
        ("h", 12.2, [TF, 1 + 11 / 12, 10 + 5 / 12, B_POOLR], None),
        ("h", 21.4, [B_PART[1], X_MECHR], None),
        ("v", 12.6, [B_POOLF + TF, REAR - TF], None),
        ("v", 31.0, [Y_IN, REAR - TF], None),
        ("v", -3.0, [0, B_POOLF, D], 0),
        ("v", W + 2.6, [GR_F, D, D + DECK], W),
        ("v", W + 4.6, [D, PIER_Y], None),
    ],
)

# ======================================================================= ROOF
RW = 13 + 10 / 12
ROOF = dict(
    key="roof", title="ROOF PLAN", sheet="A-103", area=None,
    dims=[
        ("h", D + DECK + 1.8, [0, W], D + DECK),
        ("h", -2.6, [-1, 0, RW, RW + 1], None),
        ("h", -4.4, [0, RW, RW + 7.25, RW + 7.25 + 11.5], None),
        ("v", -4.4, [0, D, D + DECK], 0),
    ],
)

LEVELS = [FB, F1, F2]


# ======================================================================= rendering
class View:
    def __init__(self, c, ox, oy, k):
        self.c, self.ox, self.oy, self.k = c, ox, oy, k

    def P(self, x, y):
        return self.ox + x * self.k, self.oy + y * self.k

    def path(self, pts, close=True):
        p = self.c.beginPath()
        for i, (x, y) in enumerate(pts):
            X, Y = self.P(x, y)
            (p.moveTo if i == 0 else p.lineTo)(X, Y)
        if close:
            p.close()
        return p

    def geom_path(self, g):
        p = self.c.beginPath()
        polys = g.geoms if isinstance(g, MultiPolygon) else [g]
        for pg in polys:
            for ring in [pg.exterior] + list(pg.interiors):
                pts = list(ring.coords)
                for i, (x, y) in enumerate(pts):
                    X, Y = self.P(x, y)
                    (p.moveTo if i == 0 else p.lineTo)(X, Y)
                p.close()
        return p

    def line(self, x0, y0, x1, y1, w=0.5, col=black, dash=None):
        c = self.c
        c.setLineWidth(w)
        c.setStrokeColor(col)
        c.setDash(*dash) if dash else c.setDash()
        c.line(*self.P(x0, y0), *self.P(x1, y1))
        c.setDash()

    def poly(self, pts, w=0.5, col=black, fill=None, dash=None, close=True):
        c = self.c
        c.setLineWidth(w)
        c.setStrokeColor(col)
        if fill is not None:
            c.setFillColor(fill)
        c.setDash(*dash) if dash else c.setDash()
        c.drawPath(self.path(pts, close), stroke=1 if w else 0, fill=1 if fill is not None else 0)
        c.setDash()

    def rect(self, x0, y0, x1, y1, **kw):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], **kw)

    def circle(self, x, y, r, w=0.5, col=black, fill=None):
        c = self.c
        c.setLineWidth(w)
        c.setStrokeColor(col)
        if fill is not None:
            c.setFillColor(fill)
        c.circle(*self.P(x, y), r * self.k, stroke=1, fill=1 if fill is not None else 0)

    def arc(self, cx, cy, r, a0, ext, w=0.35, col=black, dash=None):
        c = self.c
        c.setLineWidth(w)
        c.setStrokeColor(col)
        c.setDash(*dash) if dash else c.setDash()
        X, Y = self.P(cx, cy)
        rr = r * self.k
        p = c.beginPath()
        p.arc(X - rr, Y - rr, X + rr, Y + rr, a0, ext)
        c.drawPath(p, stroke=1, fill=0)
        c.setDash()

    def text(self, x, y, s, size=7, font="Helvetica", align="c", rot=0, col=black, bg=False):
        c = self.c
        X, Y = self.P(x, y)
        c.saveState()
        c.translate(X, Y)
        c.rotate(rot)
        tw = stringWidth(s, font, size)
        dx = {"c": -tw / 2, "l": 0, "r": -tw}[align]
        if bg:
            c.setFillColor(white)
            c.rect(dx - 1.5, -1.5, tw + 3, size + 1, stroke=0, fill=1)
        c.setFillColor(col)
        c.setFont(font, size)
        c.drawString(dx, 0, s)
        c.restoreState()


GREY = Color(0.55, 0.55, 0.55)
LIGHT = Color(0.8, 0.8, 0.8)
POCHE = Color(0.13, 0.13, 0.13)
POCHE_I = Color(0.38, 0.38, 0.38)
FOUND_FILL = Color(0.86, 0.86, 0.86)


def ellipse_pts(cx, cy, rx, ry, n=36):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def wall_geometry(lv):
    t = lv["te"]
    env = lv["env"]
    ext = env.difference(env.buffer(-t, join_style=2))
    if lv["wall"] == "found":
        ext = unary_union([ext] + [box(*r) for r in lv.get("found", [])])
    inner = unary_union([box(*r) for r in lv["walls"]]) if lv["walls"] else Polygon()
    inner = inner.difference(ext)
    cuts = unary_union([box(*o["cut"]) for o in lv["openings"] if o.get("cut")]) if lv["openings"] else Polygon()
    return ext.difference(cuts), inner.difference(cuts)


def draw_walls(v, lv, detail=True):
    ext, inner = wall_geometry(lv)
    c = v.c
    if lv["wall"] == "found":
        c.setFillColor(FOUND_FILL)
        c.setStrokeColor(black)
        c.setLineWidth(0.9 if detail else 0.5)
        c.drawPath(v.geom_path(ext), stroke=0, fill=1, fillMode=FILL_EVEN_ODD)
        if detail:   # CMU cross-hatch clipped to the wall
            c.saveState()
            c.clipPath(v.geom_path(ext), stroke=0, fill=0, fillMode=FILL_EVEN_ODD)
            c.setStrokeColor(GREY)
            c.setLineWidth(0.25)
            minx, miny, maxx, maxy = ext.bounds
            s = 0.33
            n = int((maxx - minx + maxy - miny) / s) + 2
            for i in range(n):
                a = minx - (maxy - miny) + i * s
                c.line(*v.P(a, miny), *v.P(a + (maxy - miny), maxy))
                c.line(*v.P(a, maxy), *v.P(a + (maxy - miny), miny))
            c.restoreState()
        c.setLineWidth(0.9 if detail else 0.5)
        c.drawPath(v.geom_path(ext), stroke=1, fill=0)
        fill_i = POCHE_I
    else:
        c.setFillColor(POCHE)
        c.setStrokeColor(black)
        c.setLineWidth(0.6)
        c.drawPath(v.geom_path(ext), stroke=1, fill=1, fillMode=FILL_EVEN_ODD)
        fill_i = POCHE_I
    if not inner.is_empty:
        c.setFillColor(fill_i)
        c.setStrokeColor(black)
        c.setLineWidth(0.5)
        c.drawPath(v.geom_path(inner), stroke=1, fill=1, fillMode=FILL_EVEN_ODD)


def draw_opening(v, o, detail=True):
    k = o["k"]
    if k == "win" or k == "slide":
        (t0, t1), (s0, s1) = o["t"], o["s"]
        h = o["ax"] == "h"
        L = (lambda a, b, aa, bb: v.line(a, b, aa, bb, 0.35)) if h else (lambda a, b, aa, bb: v.line(b, a, bb, aa, 0.35))
        L(s0, t0, s0, t1)
        L(s1, t0, s1, t1)
        if k == "win":
            for t in (t0, (t0 + t1) / 2, t1):
                L(s0, t, s1, t)
            for i in range(1, o.get("mull", 0) + 1):
                m = s0 + (s1 - s0) * i / (o["mull"] + 1)
                L(m, t0, m, t1)
        else:
            L(s0, t0, s1, t0)
            L(s0, t1, s1, t1)
            m, tm, d = (s0 + s1) / 2, (t0 + t1) / 2, (t1 - t0) / 5
            for a, b, tt in ((s0, m + 0.2, tm - d), (m - 0.2, s1, tm + d)):
                L(a, tt - 0.04, b, tt - 0.04)
                L(a, tt + 0.04, b, tt + 0.04)
    elif k == "door":
        (hx, hy), (lx, ly), (nx, ny) = o["hinge"], o["latch"], o["n"]
        wdt = math.hypot(lx - hx, ly - hy)
        ex, ey = hx + nx * wdt, hy + ny * wdt
        ux, uy = (lx - hx) / wdt, (ly - hy) / wdt
        th = 0.13
        v.poly([(hx, hy), (ex, ey), (ex + ux * th, ey + uy * th), (hx + ux * th, hy + uy * th)], w=0.45, fill=white)
        a0 = math.degrees(math.atan2(uy, ux))
        ext = 90 if (ux * ny - uy * nx) > 0 else -90
        v.arc(hx, hy, wdt, a0, ext, w=0.3, col=GREY)
    elif k == "bifold":
        (t0, t1), (s0, s1), sd = o["t"], o["s"], o["side"]
        face = t1 if sd > 0 else t0
        h = o["ax"] == "h"
        P = (lambda s, t: (s, t)) if h else (lambda s, t: (t, s))
        q = (s1 - s0) / 4
        dep = q * 0.75 * sd
        pts = [P(s0, face), P(s0 + q, face + dep), P(s0 + 2 * q, face), P(s0 + 3 * q, face + dep), P(s1, face)]
        v.poly(pts, w=0.45, close=False)
        v.line(*P(s0, t0), *P(s0, t1), 0.35)
        v.line(*P(s1, t0), *P(s1, t1), 0.35)
    elif k == "panel":
        v.rect(*o["r"], w=0.45, fill=white)


def draw_fixture(v, f, detail=True):
    k = f[0]
    if k == "counter":
        v.rect(*f[1:5], w=0.4, col=GREY)
    elif k == "box":
        v.rect(*f[1:5], w=0.45)
        if f[5]:
            v.text((f[1] + f[3]) / 2, (f[2] + f[4]) / 2 - 0.15, f[5], 6)
    elif k == "dashbox":
        v.rect(*f[1:5], w=0.35, col=GREY, dash=([2, 2],))
        v.text((f[1] + f[3]) / 2, (f[2] + f[4]) / 2 - 0.15, f[5], 6.5)
    elif k == "range":
        x0, y0, x1, y1 = f[1:5]
        v.rect(x0, y0, x1, y1, w=0.5, fill=white)
        for cx in (x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7):
            for cy in (y0 + (y1 - y0) * 0.27, y0 + (y1 - y0) * 0.73):
                v.circle(cx, cy, 0.3, w=0.4)
    elif k == "sinkbox":
        x0, y0, x1, y1 = f[1:5]
        v.rect(x0, y0, x1, y1, w=0.45)
        v.rect(x0 + 0.15, y0 + 0.15, x1 - 0.15, y1 - 0.15, w=0.35)
        v.circle((x0 + x1) / 2, (y0 + y1) / 2, 0.07, w=0.35)
    elif k == "stool":
        x, y = f[1], f[2]
        pts = [(x - 0.75, y - 0.75)] + [(x + 0.1 + 0.75 * math.sin(math.pi * i / 16), y - 0.75 * math.cos(math.pi * i / 16))
                                        for i in range(17)] + [(x - 0.75, y + 0.75)]
        v.poly(pts, w=0.45)
        v.poly([(x - 0.6, y - 0.6)] + [(x + 0.1 + 0.6 * math.sin(math.pi * i / 16), y - 0.6 * math.cos(math.pi * i / 16))
                                       for i in range(17)] + [(x - 0.6, y + 0.6)], w=0.3)
    elif k == "lav":
        x, y, (dx, dy) = f[1], f[2], f[3]
        rx, ry = (0.55, 0.75) if dx else (0.75, 0.55)
        v.poly(ellipse_pts(x, y, rx, ry), w=0.45, fill=white)
        v.circle(x, y, 0.06, w=0.35)
    elif k == "wc":
        x, y, u = f[1], f[2], f[3]
        tang = (-u[1], u[0])
        tank = [(x + a * tang[0] + b * u[0], y + a * tang[1] + b * u[1]) for a, b in [(-0.9, 0), (0.9, 0), (0.9, 0.7), (-0.9, 0.7)]]
        v.poly(tank, w=0.45, fill=white)
        bowl = [(x + a * tang[0] + b * u[0], y + a * tang[1] + b * u[1])
                for a, b in [(0.62 * math.cos(t), 1.45 + 0.85 * math.sin(t)) for t in [2 * math.pi * i / 36 for i in range(36)]]]
        v.poly(bowl, w=0.45, fill=white)
    elif k == "tub":
        x0, y0, x1, y1 = f[1:5]
        v.rect(x0, y0, x1, y1, w=0.5)
        m = 0.25
        v.poly(ellipse_pts((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - m, (y1 - y0) / 2 - m, 48), w=0.4)
        v.circle((x0 + x1) / 2, y1 - 0.9, 0.08, w=0.35)
    elif k == "shower":
        x0, y0, x1, y1 = f[1:5]
        v.rect(x0, y0, x1, y1, w=0.5)
        v.line(x0, y0, x1, y1, 0.25, GREY)
        v.line(x0, y1, x1, y0, 0.25, GREY)
        v.circle((x0 + x1) / 2, (y0 + y1) / 2, 0.12, w=0.4, fill=white)
    elif k == "fireplace":
        x0, y0, x1, y1 = f[1:5]
        v.rect(x0, y0, x1, y1, w=0.8, fill=white)
        v.rect(x0, y0 + 0.9, x0 + 0.7, y1 - 0.9, w=0.4)
        for i in range(1, 6):
            yy = y0 + (y1 - y0) * i / 6
            v.line(x0 + 0.7, yy, x1, yy, 0.2, GREY)
    elif k == "dash":
        v.line(*f[1:5], 0.4, GREY, dash=([4, 3],))
    elif k == "xbox":
        x0, y0, x1, y1 = f[1:5]
        v.rect(x0, y0, x1, y1, w=0.4)
        v.line(x0, y0, x1, y1, 0.3)
        v.line(x0, y1, x1, y0, 0.3)
    elif k == "xvoid":
        x0, y0, x1, y1 = f[1:5]
        v.line(x0, y0, x1, y1, 0.35, GREY, dash=([6, 4],))
        v.line(x0, y1, x1, y0, 0.35, GREY, dash=([6, 4],))
    elif k == "rail":
        x0, y0, x1, y1 = f[1:5]
        if y0 == y1:
            v.line(x0, y0 - 0.05, x1, y1 - 0.05, 0.35)
            v.line(x0, y0 + 0.05, x1, y1 + 0.05, 0.35)
        else:
            v.line(x0 - 0.05, y0, x1 - 0.05, y1, 0.35)
            v.line(x0 + 0.05, y0, x1 + 0.05, y1, 0.35)
    elif k == "stair":
        x0, y0, x1, y1, lab, brk = f[1:7]
        n = round((x1 - x0) / 0.75)
        tr = (x1 - x0) / n
        for i in range(n + 1):
            xx = x0 + i * tr
            v.line(xx, y0, xx, y1, 0.35)
        ym = (y0 + y1) / 2
        if brk == "break":
            bx = x0 + 5.0
            for off in (0, 0.35):
                v.line(bx + off - 0.8, y0 - 0.2, bx + off + 0.8, y1 + 0.2, 0.7)
            v.line(x0 + 0.3, ym, bx - 0.3, ym, 0.4)
            v.poly([(bx - 0.3, ym), (bx - 0.75, ym + 0.2), (bx - 0.75, ym - 0.2)], w=0.4, fill=black)
            v.text(x0 - 0.15, ym - 0.2, lab, 7.5, "Helvetica-Bold", "r", bg=True)
        elif brk == "break_l":
            bx = x0 + 1.0
            pts = [(bx - 0.3, y1 + 0.3), (bx + 0.1, ym + 0.4), (bx - 0.25, ym + 0.1), (bx + 0.6, y0 - 0.3)]
            v.poly(pts, w=0.7, close=False)
            v.line(x1 + 1.8, ym, bx + 0.9, ym, 0.4)
            v.poly([(bx + 0.9, ym), (bx + 1.35, ym + 0.2), (bx + 1.35, ym - 0.2)], w=0.4, fill=black)
            v.text(x1 + 2.0, y1 + 0.35, lab, 7.5, "Helvetica-Bold", "c", bg=True)
        else:
            v.line(x0 + 0.3, ym, x0 + 6.0, ym, 0.4)
            v.poly([(x0 + 6.0, ym), (x0 + 5.55, ym + 0.2), (x0 + 5.55, ym - 0.2)], w=0.4, fill=black)
            v.text(x0 - 0.3, ym - 0.2, lab, 7.5, "Helvetica-Bold", "r", bg=True)
    elif k == "landing":
        x0, y0, x1, y1 = f[1:5]
        v.line(x0, y1, x1, y0, 0.3, GREY)
    elif k == "slab":
        x0, y0, x1, y1, steps = f[1:6]
        v.rect(x0, y0, x1, y1, w=0.4, col=GREY)
        for s in steps:
            v.line(x0, y0 + s, x1, y0 + s, 0.35, GREY)
    elif k == "dashrect":
        v.rect(*f[1:5], w=0.45, col=GREY, dash=([6, 4],))
        if f[5]:
            v.text((f[1] + f[3]) / 2, (f[2] + f[4]) / 2 - 0.2, f[5], 6.5, col=GREY)
    elif k == "deck":
        x0, y0, x1, y1, posts, boards = f[1:7]
        if boards and detail:
            xx = x0 + 0.5
            while xx < x1 - 0.1:
                v.line(xx, y0, xx, y1 - 0.2, 0.2, LIGHT)
                xx += 0.5
        v.rect(x0, y0, x1, y1, w=0.6)
        v.rect(x0 + 0.2, y0, x1 - 0.2, y1 - 0.2, w=0.3)
        if posts:
            for px in PIERS:
                v.rect(px - 0.25, PIER_Y - 0.25, px + 0.25, PIER_Y + 0.25, w=0.6, fill=white)
    elif k == "lowerdeck":
        v.rect(*f[1:5], w=0.4, col=GREY)
        v.rect(f[1], f[2], f[3] - 0.2, f[4] - 0.2, w=0.25, col=GREY)
    elif k == "balcony":
        x0, y0, x1, y1 = f[1:5]
        if detail:
            xx = x0 + 0.5
            while xx < x1 - 0.1:
                v.line(xx, y0 + 0.2, xx, y1, 0.2, LIGHT)
                xx += 0.5
        v.poly([(x0, y1), (x0, y0), (x1, y0), (x1, y1)], w=0.6, close=False)
        v.poly([(x0 + 0.2, y1), (x0 + 0.2, y0 + 0.2), (x1 - 0.2, y0 + 0.2), (x1 - 0.2, y1)], w=0.3, close=False)
    elif k == "stair_ext":
        x0, y0, x1, y1, landing = f[1:6]
        v.rect(x0, y0, x1, y1, w=0.5)
        yy = y0 + 0.83
        while yy < y1 - 0.1:
            v.line(x0, yy, x1, yy, 0.3)
            yy += 0.83
        v.rect(x1 - 0.2, y0 + 2.7, x1, y1, w=0.35)
        lk = dict(w=0.45, col=GREY, dash=([6, 4],)) if landing == "dash" else dict(w=0.5)
        v.rect(x0, y1, 6 + 1 / 3, D + 11.67, **lk)
        if detail:
            v.text((x0 + x1) / 2, y0 + 4.5, "EXT. STAIR", 6, rot=90, bg=True)
            v.text(1.7, y1 + 0.95, "LANDING" + (" ABOVE" if landing == "dash" else ""), 6,
                   col=GREY if landing == "dash" else black)
    elif k == "pool":
        x0, y0, x1, y1 = f[1:5]
        v.rect(x0, y0, x1, y1, w=0.8, fill=Color(0.93, 0.95, 0.97))
        v.rect(x0 + 0.4, y0 + 0.4, x1 - 0.4, y1 - 0.4, w=0.35)
    elif k == "wh":
        x0, y0, x1, y1 = f[1:5]
        v.rect(x0, y0, x1, y1, w=0.45)
        v.circle((x0 + x1) / 2, (y0 + y1) / 2, 0.3, w=0.4)
    elif k == "crawl":
        pts = f[1]
        v.poly(pts, w=0, fill=Color(0.95, 0.95, 0.95))
        if detail:
            pg = Polygon(pts)
            rnd = random.Random(7)
            minx, miny, maxx, maxy = pg.bounds
            c = v.c
            c.setFillColor(GREY)
            for _ in range(900):
                x, y = rnd.uniform(minx, maxx), rnd.uniform(miny, maxy)
                if pg.contains(Polygon([(x, y), (x + 0.01, y), (x, y + 0.01)])):
                    c.circle(*v.P(x, y), 0.45, stroke=0, fill=1)
    elif k == "footing":
        off = f[1]
        env = FB["env"]
        for g in (env.buffer(off, join_style=2), env.buffer(-TF - off + 0.25, join_style=2)):
            v.poly(list(g.exterior.coords), w=0.45, col=GREY, dash=([6, 4],))
    elif k == "slabdeck":
        v.rect(*f[1:5], w=0.5, col=GREY)
    elif k == "pier":
        x, y = f[1], f[2]
        v.rect(x - 1.0, y - 1.0, x + 1.0, y + 1.0, w=0.5, dash=([4, 3],))
        v.rect(x - 0.3, y - 0.3, x + 0.3, y + 0.3, w=0.6)


def room_area(rects):
    return unary_union([box(*r) for r in rects]).area


def draw_rooms(v, lv, detail=True):
    for name, x, y, tags, rects in lv["rooms"]:
        if detail:
            v.text(x, y, name, 9.5, "Helvetica-Bold", bg=True)
            v.line(x - stringWidth(name, "Helvetica-Bold", 9.5) / 2 / v.k, y - 0.17,
                   x + stringWidth(name, "Helvetica-Bold", 9.5) / 2 / v.k, y - 0.17, 0.4)
            yy = y - 0.85
            if rects:
                v.text(x, yy, "≈ %d SF" % round(room_area(rects)), 7, bg=True)
                yy -= 0.65
            short = [t for t in tags if len(t) <= 5]
            longt = [t for t in tags if len(t) > 5]
            if short:
                v.text(x, yy, "  ".join(short), 6.5, col=GREY, bg=True)
                yy -= 0.6
            for t in longt:
                v.text(x, yy, t, 6.5, col=GREY, bg=True)
                yy -= 0.6
        elif name not in ("CL.", "FP", "POOL"):
            v.text(x, y, name, 5.5, "Helvetica-Bold", bg=True)


def draw_dims(v, dims):
    for ax, at, pts, ext in dims:
        for i, p in enumerate(pts):
            if ax == "h":
                if ext is not None:
                    a, b = (ext + 0.25, at + 0.6) if at > ext else (ext - 0.25, at - 0.6)
                    v.line(p, a, p, b, 0.25)
                v.line(p - 0.3, at - 0.3, p + 0.3, at + 0.3, 0.8)
            else:
                if ext is not None:
                    a, b = (ext + 0.25, at + 0.6) if at > ext else (ext - 0.25, at - 0.6)
                    v.line(a, p, b, p, 0.25)
                v.line(at - 0.3, p - 0.3, at + 0.3, p + 0.3, 0.8)
        lo, hi = min(pts), max(pts)
        if ax == "h":
            v.line(lo - 0.4, at, hi + 0.4, at, 0.3)
        else:
            v.line(at, lo - 0.4, at, hi + 0.4, 0.3)
        for a, b in zip(pts, pts[1:]):
            m = (a + b) / 2
            s = ftin(b - a)
            if ax == "h":
                v.text(m, at + 0.18, s, 7.5, bg=True)
            else:
                v.text(at - 0.18, m, s, 7.5, rot=90, bg=True)


def draw_tags(v, lv):
    for o in lv["openings"]:
        tag = o.get("tag")
        if not tag:
            continue
        if o["k"] in ("win", "slide"):
            (t0, t1), (s0, s1) = o["t"], o["s"]
            if o["ax"] == "h":
                inside = t0 - 0.75 if t1 >= D - 0.01 else t1 + 0.45
                v.text((s0 + s1) / 2, inside, tag, 6, col=GREY, bg=True)
            else:
                xx = t1 + 0.55 if t0 < 1 else t0 - 0.35
                v.text(xx, (s0 + s1) / 2, tag, 6, rot=90, col=GREY, bg=True)
        elif o["k"] == "door":
            (hx, hy), (lx, ly), (nx, ny) = o["hinge"], o["latch"], o["n"]
            mx, my = (hx + lx) / 2 + nx * 1.0, (hy + ly) / 2 + ny * 1.0 - 0.15
            v.text(mx, my, tag, 6, col=GREY, bg=True)
        elif o["k"] == "bifold":
            (t0, t1), (s0, s1), sd = o["t"], o["s"], o["side"]
            face = (t1 + 1.2) if sd > 0 else (t0 - 1.2)
            if o["ax"] == "h":
                v.text((s0 + s1) / 2, face, tag, 6, col=GREY, bg=True)
            else:
                v.text(face, (s0 + s1) / 2, tag, 6, rot=90, col=GREY, bg=True)
        elif o["k"] == "panel":
            x0, y0, x1, y1 = o["r"]
            if (x1 - x0) > (y1 - y0):
                v.text((x0 + x1) / 2, y0 - 0.55, tag, 6, col=GREY, bg=True)
            else:
                v.text(x1 + 0.4, (y0 + y1) / 2, tag, 6, rot=90, col=GREY, bg=True)


def draw_level(v, lv, detail=True):
    for f in lv["fixtures"]:
        if f[0] == "fireplace":
            continue
        if detail or f[0] in ("deck", "stair_ext", "balcony", "pool", "crawl", "slabdeck", "lowerdeck", "xvoid"):
            draw_fixture(v, f, detail)
    draw_walls(v, lv, detail)
    for f in lv["fixtures"]:
        if f[0] == "fireplace":
            draw_fixture(v, f, detail)
    for o in lv["openings"]:
        draw_opening(v, o, detail)
    draw_rooms(v, lv, detail)
    if detail:
        draw_tags(v, lv)
        for x, y, lines in lv.get("notes_at", []):
            for i, s in enumerate(lines):
                v.text(x, y - i * 0.55, s, 6.5, align="l", bg=True)
        draw_dims(v, lv["dims"])


def draw_roof(v, detail=True):
    k = dict(w=1.6 if detail else 0.8)
    left = R(-1, -1, RW + 1, D + 1)
    main = R(RW + 1, GR_F - 1, W + 1, D + 1)
    low = R(RW + 1, FOY_F, RW + 7.25, GR_F - 1)
    v.rect(0, D, W, D + DECK, w=0.4, col=GREY)
    v.rect(0.2, D, W - 0.2, D + DECK - 0.2, w=0.25, col=GREY)
    v.poly([(left[2], main[3]), (main[2], main[3]), (main[2], main[1]), (left[2], main[1])], w=0.9, close=False)
    v.rect(*low, w=0.9)
    v.rect(*left, **k)
    # line of exterior walls below
    v.poly(list(envelope(WING2).exterior.coords), w=0.45, col=GREY, dash=([6, 4],))
    v.poly([(FOY_R, BAL_F), (32.583, BAL_F), (32.583, GR_F - 1)], w=0.6, close=False)
    if detail:
        xx = FOY_R + 0.5
        while xx < 32.4:
            v.line(xx, BAL_F + 0.2, xx, GR_F - 1, 0.2, LIGHT)
            xx += 0.5
    # canopy with tie rods
    v.rect(RW + 1, FOY_F - 2.25, RW + 7.25, FOY_F, w=0.6)
    for x in (15.75, 18.85):
        v.line(x, FOY_F, x, FOY_F - 2.25, 0.35)
        v.rect(x - 0.12, FOY_F - 2.37, x + 0.12, FOY_F - 2.13, w=0.35)
    # gutters
    v.line(-1.35, 0, -1.35, D, 0.6)
    v.line(RW + 7.4, FOY_F, RW + 7.4, GR_F - 1, 0.6)
    v.line(W + 1.35, GR_F - 1, W + 1.35, D, 0.6)
    if not detail:
        return

    def arrow(x0, y0, x1, y1):
        v.line(x0, y0, x1, y1, 0.5)
        ang = math.atan2(y1 - y0, x1 - x0)
        a = [(x1, y1), (x1 - 0.5 * math.cos(ang - 0.35), y1 - 0.5 * math.sin(ang - 0.35)),
             (x1 - 0.5 * math.cos(ang + 0.35), y1 - 0.5 * math.sin(ang + 0.35))]
        v.poly(a, w=0.4, fill=black)

    arrow(10.0, 23.0, 3.0, 23.0); v.text(6.5, 22.2, "SLOPE", 8, "Helvetica-Bold")
    arrow(26.0, 24.5, 31.5, 24.5); v.text(28.7, 23.7, "SLOPE", 8, "Helvetica-Bold")
    arrow(15.6, 10.0, 20.0, 10.0); v.text(17.8, 9.2, "1/4\" / FT SLOPE", 7, "Helvetica-Bold")
    v.text(6.5, 9.0, "SLOPE", 8, "Helvetica-Bold", rot=90)
    for x, y in ((6.5, 28.8), (25.5, 20.2)):
        for i, s in enumerate(["EPDM ROOFING OVER RIGID INSUL.", "PITCHED TO ROOF DRAINS"]):
            v.text(x, y - i * 0.6, s, 7, bg=True)
    v.text(27.6, D + 1.45, "METAL COPING @ PARAPET", 7, bg=True)
    v.text(17.8, FOY_F - 1.4, "METAL CANOPY W/ STEEL TIE RODS", 6.5, bg=True)
    v.text(26.8, 12.4, "BALCONY", 9.5, "Helvetica-Bold", bg=True)
    v.text(16.6, D + 4.8, "LOWER DECK OUTLINE (9'-0\")", 7, col=GREY, bg=True)
    v.text(-1.9, 12.0, "4\" GUTTER DOWN TO GROUND LEVEL", 6.5, rot=90, bg=True)
    v.text(RW + 8.0, 9.8, "4\" GUTTER DOWN", 6.5, rot=90, bg=True)
    v.text(W + 1.9, 18.0, "4\" GUTTER DOWN TO GROUND", 6.5, rot=90, bg=True)
    v.text(6.5, 2.0, "ICE & WATER SHIELD 3'-0\" FROM EXT. WALL", 6.5, bg=True)
    v.text(6.5, D - 2.0, "ICE & WATER SHIELD 3'-0\" FROM EXT. WALL", 6.5, bg=True)
    v.text(25.0, D - 2.0, "DASHED = LINE OF EXTERIOR WALL BELOW", 6.5, col=GREY, bg=True)
    v.line(0, 3.0, RW, 3.0, 0.3, GREY, dash=([2, 3],))
    v.line(0, D - 3.0, W, D - 3.0, 0.3, GREY, dash=([2, 3],))
    draw_dims(v, ROOF["dims"])


# ----------------------------------------------------------------- sheet furniture
PW, PH = 36 * 72, 24 * 72
M = 36
TB_W = 300
K = 18.0   # 1/4" = 1'-0"  ->  0.25 in * 72 pt per foot

DISCLAIMER = ("Redrawn from owner-supplied plans for presentation; verify all dimensions with the "
              "architect of record before construction. Not for construction.")

SHEETS = [("A-000", "COVER SHEET / PROJECT SUMMARY"), ("A-100", "BASEMENT / FOUNDATION PLAN"),
          ("A-101", "FIRST FLOOR PLAN"), ("A-102", "SECOND FLOOR PLAN"), ("A-103", "ROOF PLAN")]


def wrap(s, font, size, width):
    out, cur = [], ""
    for wd in s.split():
        t = (cur + " " + wd).strip()
        if stringWidth(t, font, size) > width and cur:
            out.append(cur)
            cur = wd
        else:
            cur = t
    if cur:
        out.append(cur)
    return out


def frame(c, num, title, scale_txt):
    c.setStrokeColor(black)
    c.setLineWidth(1.6)
    c.rect(M, M, PW - 2 * M, PH - 2 * M)
    x0 = PW - M - TB_W
    c.setLineWidth(1.0)
    c.line(x0, M, x0, PH - M)
    pad = 16
    tx = x0 + pad
    tw = TB_W - 2 * pad
    y = PH - M - 40
    c.setFont("Helvetica-Bold", 26)
    c.drawString(tx, y, "MONTREVE")
    y -= 22
    c.setFont("Helvetica", 13)
    c.drawString(tx, y, "— Cabin Plan")
    y -= 18
    c.setFont("Helvetica", 8)
    c.setFillColor(GREY)
    c.drawString(tx, y, "Presentation drawing set")
    c.setFillColor(black)
    y -= 16
    c.setLineWidth(0.6)
    c.line(x0, y, PW - M, y)
    y -= 22
    c.setFont("Helvetica-Bold", 9)
    c.drawString(tx, y, "SHEET INDEX")
    y -= 14
    for n, t in SHEETS:
        c.setFont("Helvetica-Bold" if n == num else "Helvetica", 8)
        c.drawString(tx, y, n)
        c.drawString(tx + 44, y, t)
        y -= 12
    y -= 8
    c.line(x0, y, PW - M, y)
    # disclaimer box
    y -= 24
    c.setFont("Helvetica-Bold", 9)
    c.drawString(tx, y, "NOT FOR CONSTRUCTION")
    y -= 14
    c.setFont("Helvetica", 8)
    for ln in wrap(DISCLAIMER, "Helvetica", 8, tw):
        c.drawString(tx, y, ln)
        y -= 11
    y -= 8
    c.line(x0, y, PW - M, y)
    # bottom block
    yb = M + 190
    c.line(x0, yb, PW - M, yb)
    rows = [("SCALE", scale_txt), ("DATE", DATE), ("SOURCE", "Owner-supplied CAD screenshots (4 sheets)"),
            ("DRAWN", "Vector redraw, dimensions reconciled to source strings")]
    yy = yb - 18
    for a, b in rows:
        c.setFont("Helvetica-Bold", 7)
        c.drawString(tx, yy, a)
        c.setFont("Helvetica", 8)
        for i, ln in enumerate(wrap(b, "Helvetica", 8, tw - 52)):
            c.drawString(tx + 52, yy - i * 10, ln)
        yy -= 12 + 10 * (len(wrap(b, "Helvetica", 8, tw - 52)) - 1)
    c.line(x0, M + 92, PW - M, M + 92)
    c.setFont("Helvetica", 9)
    for i, ln in enumerate(wrap(title, "Helvetica-Bold", 11, tw)):
        c.setFont("Helvetica-Bold", 11)
        c.drawString(tx, M + 72 - i * 13, ln)
    c.setFont("Helvetica-Bold", 34)
    c.drawRightString(PW - M - pad, M + 16, num)
    c.setFont("Helvetica", 7)
    c.drawString(tx, M + 20, "SHEET")


def scale_bar(c, x, y, k=K, label="1/4\" = 1'-0\""):
    segs = [0, 1, 2, 3, 4, 8, 16]
    for i, (a, b) in enumerate(zip(segs, segs[1:])):
        c.setFillColor(black if i % 2 == 0 else white)
        c.setStrokeColor(black)
        c.setLineWidth(0.6)
        c.rect(x + a * k, y, (b - a) * k, 5, stroke=1, fill=1)
    c.setFillColor(black)
    c.setFont("Helvetica", 7)
    for s in (0, 2, 4, 8, 16):
        c.drawCentredString(x + s * k, y + 9, "%d'" % s)
    c.drawString(x + 16 * k + 8, y, "GRAPHIC SCALE  " + label)


def drawing_title(c, x, y, n, title, sub):
    c.setFillColor(black)
    c.setStrokeColor(black)
    c.setLineWidth(1)
    c.circle(x + 14, y + 6, 14)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(x + 14, y + 2, str(n))
    c.setFont("Helvetica-Bold", 16)
    c.drawString(x + 38, y + 8, title)
    c.setLineWidth(1.4)
    c.line(x + 38, y + 3, x + 38 + max(stringWidth(title, "Helvetica-Bold", 16), 220), y + 3)
    c.setFont("Helvetica", 9)
    c.drawString(x + 38, y - 10, sub)


def notes_panel(c, x, y, w, blocks):
    for head, lines in blocks:
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(black)
        c.drawString(x, y, head)
        c.setLineWidth(0.5)
        c.line(x, y - 4, x + w, y - 4)
        y -= 18
        for ln in lines:
            if isinstance(ln, tuple):       # legend swatch
                kind, txt = ln
                legend_swatch(c, x, y, kind)
                c.setFont("Helvetica", 8.5)
                c.drawString(x + 46, y, txt)
                y -= 16
                continue
            for i, part in enumerate(wrap(ln, "Helvetica", 8.5, w - 12)):
                c.setFont("Helvetica", 8.5)
                c.drawString(x + (12 if i else 0), y, ("" if i else "• ") + part if not i else part)
                y -= 11.5
            y -= 2
        y -= 14
    return y


def legend_swatch(c, x, y, kind):
    c.setLineWidth(0.5)
    c.setStrokeColor(black)
    if kind == "ext":
        c.setFillColor(POCHE); c.rect(x, y - 1, 36, 8, stroke=1, fill=1)
    elif kind == "int":
        c.setFillColor(POCHE_I); c.rect(x, y, 36, 6, stroke=1, fill=1)
    elif kind == "found":
        c.setFillColor(FOUND_FILL); c.rect(x, y - 2, 36, 10, stroke=1, fill=1)
        c.setStrokeColor(GREY)
        for i in range(0, 40, 4):
            c.line(x + i, y - 2, x + min(i + 10, 36), y + 8 if i + 10 <= 36 else y - 2 + (36 - i))
    elif kind == "win":
        for dy in (0, 3, 6):
            c.line(x, y + dy, x + 36, y + dy)
        c.line(x, y, x, y + 6); c.line(x + 36, y, x + 36, y + 6)
    elif kind == "door":
        c.line(x, y, x, y + 14 * 0.7)
        c.setStrokeColor(GREY)
        p = c.beginPath(); p.arc(x - 10, y - 10, x + 10, y + 10, 0, 90); c.drawPath(p, stroke=1, fill=0)
    elif kind == "dash":
        c.setStrokeColor(GREY); c.setDash(6, 4); c.line(x, y + 3, x + 36, y + 3); c.setDash()
    c.setFillColor(black)
    c.setStrokeColor(black)


LEGEND = ("LEGEND", [("ext", "Exterior wall, 2x6 framed (approx. 7\")"), ("int", "Interior partition (4-1/2\")"),
                     ("found", "Foundation wall, 8\" CMU filled solid (drawn 9\" incl. finish)"),
                     ("win", "Window (tag = source callout, e.g. SH 3060)"), ("door", "Door swing"),
                     ("dash", "Above / below / hidden / footing")])

GENERAL = ("GENERAL NOTES", [
    "Redrawn at true scale from four owner-supplied CAD screenshots. Dimension strings on the source were "
    "treated as authoritative; geometry not covered by a string was taken from the drawing at its 1/4\" scale.",
    "Window and door tags (e.g. SH 3060, 3282, TYPE B) repeat the source callouts. Opening widths are drawn as "
    "they appear on the source sheets; confirm rough openings against the window/door schedule.",
    "Floor areas are the source's labeled areas. Room areas marked ≈ are net interior areas measured on this redraw.",
    "Finish tags (F1, W-1, CL-1 ...) refer to the source finish schedule (not included).",
])


def plan_sheet(c, lv_or_roof, n, notes):
    title = lv_or_roof["title"]
    sheet = lv_or_roof["sheet"]
    frame(c, sheet, title, "1/4\" = 1'-0\" (24x36 sheet)")
    ox, oy = 360, 520
    v = View(c, ox, oy, K)
    if lv_or_roof is ROOF:
        draw_roof(v)
    else:
        draw_level(v, lv_or_roof)
    area = lv_or_roof.get("area")
    sub = "SCALE: 1/4\" = 1'-0\"" + ("     " + area + " (as labeled on source)" if area else "")
    drawing_title(c, ox - 120, oy - 8 * K - 60, n, title, sub)
    scale_bar(c, ox - 82, oy - 8 * K - 110)
    c.setFillColor(black)
    notes_panel(c, 1180, PH - M - 60, 560, notes)
    c.showPage()


def cover(c):
    frame(c, "A-000", "COVER SHEET / PROJECT SUMMARY", "As noted (key plans 1/8\" = 1'-0\")")
    x = M + 60
    c.setFont("Helvetica-Bold", 44)
    c.drawString(x, PH - M - 110, "MONTREVE")
    c.setFont("Helvetica", 22)
    c.drawString(x, PH - M - 145, "Cabin Plan — presentation drawing set")
    c.setFont("Helvetica", 11)
    c.setFillColor(GREY)
    c.drawString(x, PH - M - 168, "Three-level cabin with walk-out basement pool room, 33'-4\" x 33'-4\" footprint plus 9'-0\" rear deck")
    c.setFillColor(black)

    # area table
    ty = PH - M - 230
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, ty, "AREA SUMMARY")
    rows = [("Basement (pool room, rec room, bath, mechanical)", "684 SF"),
            ("First floor", "880 SF"),
            ("Second floor", "880 SF"),
            ("TOTAL CONDITIONED", "2,444 SF")]
    yy = ty - 22
    c.setLineWidth(0.5)
    for i, (a, b) in enumerate(rows):
        bold = i == len(rows) - 1
        if bold:
            c.setLineWidth(1)
            c.line(x, yy + 13, x + 420, yy + 13)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
        c.drawString(x, yy, a)
        c.drawRightString(x + 420, yy, b)
        yy -= 17
    c.setFont("Helvetica", 8)
    c.setFillColor(GREY)
    c.drawString(x, yy - 2, "Conditioned areas are the source sheets' labeled areas (684 / 880 / 880 SQFT).")
    c.setFillColor(black)
    yy -= 30
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, yy, "OUTDOOR / UNCONDITIONED (measured on this redraw)")
    yy -= 22
    bal_w = 32.75 - FOY_R
    outdoor = [("First-floor rear deck, 33'-4\" x 9'-0\"", "%d SF" % round(W * DECK)),
               ("Second-floor deck, 13'-4\" x 9'-0\"", "%d SF" % round(13.333 * DECK)),
               ("Second-floor balcony, %s x 5'-8\"" % ftin(bal_w), "%d SF" % round(bal_w * (GR_F - BAL_F))),
               ("Basement deck slab (under deck), 33'-4\" x 9'-0\"", "%d SF" % round(W * DECK)),
               ("Covered entry with metal canopy", "—"),
               ("Crawl space under master wing and foyer", "—")]
    for a, b in outdoor:
        c.setFont("Helvetica", 10)
        c.drawString(x, yy, a)
        c.drawRightString(x + 420, yy, b)
        yy -= 17

    # key plans at 1/8"
    k = 9.0
    gx = x + 40
    gy = M + 330
    labels = [("BASEMENT", "684 SF"), ("FIRST FLOOR", "880 SF"), ("SECOND FLOOR", "880 SF")]
    for i, lv in enumerate(LEVELS):
        ox = gx + 3 * k + i * 470
        v = View(c, ox, gy, k)
        draw_level(v, lv, detail=False)
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(ox, gy - 30, labels[i][0])
        c.setFont("Helvetica", 9)
        c.drawString(ox, gy - 43, labels[i][1] + "  •  1/8\" = 1'-0\"")
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x, gy + 47 * k + 20, "KEY PLANS")
    scale_bar(c, x + 980, gy - 70, k=9.0, label="1/8\" = 1'-0\"")
    notes_panel(c, 1380, PH - M - 230, 480, [
        ("PROJECT", ["Cabin of three levels stacked on a 33'-4\" x 33'-4\" footprint: walk-out basement with "
                     "indoor pool room, rec room, bath and mechanical; first floor with open kitchen / dining / "
                     "great room (two-storey, fireplace), master suite, powder room, foyer and covered entry; "
                     "second floor with two bedrooms, bath, laundry closet, balcony and deck.",
                     "Footprint for site planning: house 33'-4\" wide x 33'-4\" deep (front entry wing set back "
                     "4'-10\" right of the master wing), rear deck 9'-0\" deep across the full width, exterior "
                     "deck stair 3'-0\" wide on the left side."]),
        GENERAL, LEGEND])
    c.showPage()


B_NOTES = [
    ("BASEMENT NOTES (FROM SOURCE)", [
        "8\" CMU foundation filled solid w/ horizontal reinforcement metal truss (typ.).",
        "Continuous spread footing over 6\" min. compacted gravel: 30\"W x 16\"D w/ (3) #5 cont. rebar along bottom "
        "of footing; #5 anchor bolts @ 32\" o.c.; 3,500 psi min. concrete.",
        "Rec room: 4\" conc. slab w/ 4x4 WWM over 8 mil poly vapor barrier & 6\" compacted crushed gravel.",
        "Deck area: 4\" conc. slab over compacted gravel. Pre-cast lintels over both rear sliding doors.",
        "Pool area designed by others. Anti-skid tile finish in pool room.",
        "All pool doors: out-swing, self-close, self-latch w/ knob at 54\". Install a UL2017 pool alarm system with "
        "a single-button bypass on each side.",
        "Reinforcement wall at front of rec room / stair (see source).",
    ]),
    LEGEND, GENERAL]
F1_NOTES = [
    ("FIRST FLOOR NOTES (FROM SOURCE)", [
        "Interior wood stair: 15 risers / 14 treads; risers 8-1/4\" max; treads 9\" + 1\" nosing (see source detail 1/A-400). "
        "Basement flight descends from the hall door; the flight to the second floor rises from the landing at the right.",
        "5-1/4\" LVL headers over rear openings and the front window group.",
        "Left-side dimension string (9'-0\" / 17'-1\" / 5'-6\" / 9'-0\", 40'-7\" overall) is to window centerlines, as on the source; "
        "overall house depth is 33'-4\".",
        "Dashed line in the kitchen marks the edge of the second floor above; the great room and dining area are open to the roof.",
    ]),
    LEGEND, GENERAL]
F2_NOTES = [
    ("SECOND FLOOR NOTES (FROM SOURCE)", [
        "Great room, dining area and foyer are open to below (dashed X); guards at open edges.",
        "Lower deck area: Trex decking over 2x8 joists sloped 1/4\" per foot.",
        "Left-side dimension string is to window centerlines; it sums to the 33'-4\" house depth.",
        "Exterior wall at the hall between the foyer and the balcony door is not drawn on the source; it is shown here "
        "to close the envelope (verify).",
    ]),
    LEGEND, GENERAL]
R_NOTES = [
    ("ROOF NOTES (FROM SOURCE)", [
        "Low-slope roofs: EPDM roofing over rigid insulation, pitched to roof drains.",
        "Metal coping at parapet. Ice & water shield 3'-0\" from exterior walls.",
        "4\" gutters with downspouts to ground level at the left wing, the foyer roof and the right side.",
        "Metal canopy with steel tie rods over the entry.",
        "Roof overhangs 1'-0\" past the exterior walls (13'-10\" wing + 1'-0\" each side, per source).",
        "The source roof sheet's 31'-7\" side string runs from the rear wall to the front window centerline; the house depth is 33'-4\".",
    ]),
    ("LEGEND", [("dash", "Line of exterior walls below"), ("win", "Deck / balcony edge (double line)")]),
    GENERAL]


def footprint_json():
    house = unary_union([envelope(WING1), envelope(WING2), box(*FP)])
    coords = [[round(x, 3), round(y, 3)] for x, y in list(house.exterior.coords)[:-1]]
    data = {
        "house": coords,
        "deck": [[0, round(D, 3)], [round(W, 3), round(D, 3)], [round(W, 3), round(D + DECK, 3)], [0, round(D + DECK, 3)]],
        "ext_stair": [[-3.0, round(D, 3)], [0, round(D, 3)], [0, round(D + DECK, 3)], [-3.0, round(D + DECK, 3)]],
        "width_ft": round(W, 3),
        "depth_ft": round(D, 3),
        "depth_with_deck_ft": round(D + DECK, 3),
        "notes": ("Feet. Origin = front-left exterior corner of the house; +x to the right (house width), +y toward the "
                  "rear deck. 'house' is the outer face of exterior walls, union of first and second floors (master wing "
                  "13'-7\" first / 13'-9\" second floor; entry/foyer bump to x=21'-0\" stepped back 4'-10\"; great room "
                  "front at y=15'-7\"), plus the 9\" chimney projection on the right wall. 'deck' is the 9'-0\" first-floor "
                  "rear deck across the full width; 'ext_stair' is the 3'-0\" exterior deck stair outside the left wall. "
                  "Roof overhangs (~1'-0\") and the front entry canopy are not included. Redrawn from owner-supplied plans; "
                  "verify with the architect of record."),
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w") as fh:
        json.dump(data, fh, indent=2)
    return house


def main():
    os.makedirs(os.path.dirname(OUT_PDF), exist_ok=True)
    c = Canvas(OUT_PDF, pagesize=(PW, PH))
    c.setTitle("MONTREVE — Cabin Plan")
    c.setAuthor("Redrawn from owner-supplied plans")
    c.setSubject(DISCLAIMER)
    cover(c)
    plan_sheet(c, FB, 1, B_NOTES)
    plan_sheet(c, F1, 2, F1_NOTES)
    plan_sheet(c, F2, 3, F2_NOTES)
    plan_sheet(c, ROOF, 4, R_NOTES)
    c.save()
    house = footprint_json()
    print("wrote", OUT_PDF)
    print("wrote", OUT_JSON, "house bounds", [round(b, 2) for b in house.bounds], "area %.0f sf" % house.area)


if __name__ == "__main__":
    main()
