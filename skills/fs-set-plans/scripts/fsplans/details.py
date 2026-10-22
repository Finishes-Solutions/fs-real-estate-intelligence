"""The typical detail library. Each detail is drawn in its own unit frame (about 100 x 70 units) scaled to fill the
box it is given, with notes on leaders to the right, so a detail is as large as its sheet allows. Schematic typical
details for pricing and coordination; the engineer / architect of record details the work."""
import math
from . import kit as K
from . import draft as DR
from .kit import F, FB

CONC = (0.86, 0.86, 0.86)
BASE = (0.93, 0.92, 0.88)
EARTH = (0.80, 0.74, 0.66)


class Frame:
    """maps detail units (u right, v up; uw x uh) into a box, centred, leaving room on the right for notes"""

    def __init__(self, c, x, y, w, h, uw=100, uh=70, notes_w=0.38):
        self.c = c
        self.nw = w * notes_w
        dw = w - self.nw
        self.s = min(dw / uw, h / uh) * 0.92
        self.ox = x + (dw - uw * self.s) / 2
        self.oy = y + (h - uh * self.s) / 2
        self.tx = x + dw + 4
        self.top = y + h
        self.notes = []

    def P(self, u, v):
        return (self.ox + u * self.s, self.oy + v * self.s)

    def L(self, u):
        return u * self.s

    def poly(self, pts, fill=None, stroke=K.INK, lw=0.8, pattern=None, close=True):
        q = [self.P(*p) for p in pts]
        K.draw_poly(self.c, q, stroke=stroke, fill=fill, lw=lw, close=close)
        if pattern:
            DR.hatch(self.c, q, pattern, self.s * 6, (0.4, 0.4, 0.42))

    def line(self, a, b, lw=0.8, color=K.INK, dash=None):
        c = self.c
        c.saveState()
        c.setStrokeColorRGB(*color)
        c.setLineWidth(lw)
        if dash:
            c.setDash(dash)
        p, q = self.P(*a), self.P(*b)
        c.line(p[0], p[1], q[0], q[1])
        c.restoreState()

    def note(self, at, text):
        """a note on the right with a leader to `at`; notes stack top-down in the order given"""
        self.notes.append((at, text))

    def finish(self, size=6.6):
        """notes level with what they point at (short, near-horizontal leaders), nudged apart so none overlap"""
        c = self.c
        if not self.notes:
            return
        items = []
        for at, text in self.notes:
            lines = K.wrap(text.upper(), F, size, self.nw - 12)[:3]
            items.append([self.P(*at), lines, self.P(*at)[1] + size * 0.3])
        items.sort(key=lambda it: -it[2])
        bottom = self.oy - 6
        prev = self.top - 6
        for it in items:  # top down: never above the one before
            h = len(it[1]) * size * 1.15
            it[2] = min(it[2] + h / 2, prev)
            prev = it[2] - h - size * 0.9
        over = bottom - (items[-1][2] - len(items[-1][1]) * size * 1.15)
        if over > 0:  # ran off the bottom: lift the stack
            for it in items:
                it[2] += over
        for p, lines, y in items:
            DR.leader(c, (self.tx - 2, y - size * 0.25), p)
            c.setFont(F, size)
            c.setFillColorRGB(*K.INK)
            for j, ln in enumerate(lines):
                c.drawString(self.tx, y - size * 0.6 - j * size * 1.15, ln)

    def dim(self, a, b, off, text, size=6.2):
        DR.dim(self.c, self.P(*a), self.P(*b), off, text=text, size=size)


def _rebar(f, u, v, r=0.9):
    c = f.c
    p = f.P(u, v)
    c.setFillColorRGB(*K.INK)
    c.circle(p[0], p[1], max(1.0, f.L(r)), stroke=0, fill=1)


# ---------- civil ----------
def paving(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 60)
    f.poly([(0, 18), (100, 18), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(0, 34), (100, 34), (100, 18), (0, 18)], fill=BASE, pattern='concrete')
    f.poly([(0, 46), (100, 46), (100, 34), (0, 34)], fill=CONC, pattern='concrete')
    for u in range(8, 100, 14):
        _rebar(f, u, 40)
    f.line((50, 46), (50, 42), lw=1.2)
    f.dim((100, 34), (100, 46), -10, '6"')
    f.dim((100, 18), (100, 34), -10, '8"')
    f.note((30, 43), '6" reinforced concrete paving, 3,500 psi (5" in parking stalls)')
    f.note((22, 40), '#4 bars at 18" o.c. each way, on chairs')
    f.note((50, 44), 'Sawcut control joints 1/4 slab depth at 15\' o.c. max.')
    f.note((60, 26), '8" lime- or cement-stabilized subgrade per the geotechnical report')
    f.note((70, 9), 'Compacted subgrade, 95 % standard Proctor, moisture conditioned')
    f.finish()


def curb(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 60)
    f.poly([(0, 14), (100, 14), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    prof = [(0, 30), (40, 30), (40, 28), (62, 30), (64, 44), (66, 46), (78, 46), (78, 14), (0, 14)]
    f.poly(prof, fill=CONC, pattern='concrete', lw=1.0)
    f.poly([(78, 40), (100, 40), (100, 14), (78, 14)], fill=(0.95, 0.95, 0.9))
    _rebar(f, 70, 22)
    _rebar(f, 70, 38)
    f.line((40, 22), (52, 22), lw=1.0)
    f.dim((40, 30), (62, 30), 14, '24" gutter')
    f.dim((62, 30), (62, 46), -24, '6"')
    f.note((66, 45), '6" curb, 1/2" radius; integral with the gutter')
    f.note((70, 38), '(2) #4 continuous')
    f.note((46, 22), '#4 dowels x 24" at 24" o.c. into the paving')
    f.note((50, 29), 'Gutter slopes 1" in 24" toward the curb face')
    f.note((90, 30), 'Backfill with topsoil behind the curb')
    f.finish()


def ramp(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 70)
    f.poly([(10, 10), (90, 10), (90, 60), (10, 60)], fill=(0.97, 0.97, 0.97))  # walk
    f.poly([(30, 10), (70, 10), (70, 44), (30, 44)], fill=CONC)  # ramp run
    f.poly([(10, 10), (30, 10), (30, 44)], fill=(0.9, 0.9, 0.9))  # flares
    f.poly([(70, 10), (90, 10), (70, 44)], fill=(0.9, 0.9, 0.9))
    c.setFillColorRGB(0.85, 0.65, 0.2)
    for i in range(8):
        for j in range(3):
            p = f.P(33 + i * 4.6, 12.5 + j * 3.5)
            c.circle(p[0], p[1], max(0.8, f.L(0.9)), stroke=0, fill=1)
    f.line((5, 10), (95, 10), lw=1.6)
    for u in (50,):
        f.line((u, 40), (u, 24), lw=0.6)
        a, b = f.P(u, 24), f.P(u, 40)
        for da in (2.6, -2.6):
            c.line(a[0], a[1], a[0] + 5 * math.cos(math.pi / 2 + da), a[1] + 5 * math.sin(math.pi / 2 + da))
    K.label(c, *f.P(56, 32), '1:12 MAX', 6.5, FB, halo=False)
    K.label(c, *f.P(20, 18), '1:10', 6, F, halo=False)
    K.label(c, *f.P(80, 18), '1:10', 6, F, halo=False)
    f.dim((30, 44), (70, 44), 12, "4'-0\" min. clear")
    f.note((40, 14), 'Detectable warning surface, 24" deep, full width (TAS 705)')
    f.note((50, 34), 'Ramp run 1:12 max., cross slope 1:48 max. (TAS 405)')
    f.note((20, 20), 'Flared sides 1:10 max. where pedestrians cross (TAS 406)')
    f.note((60, 52), "Landing 4'-0\" x 4'-0\" min. at the top")
    f.note((80, 10), 'Flush transition to the gutter; no lip')
    f.finish()


def enclosure(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 80)
    f.poly([(14, 8), (86, 8), (86, 74), (14, 74)], fill=(0.95, 0.95, 0.95))  # pad
    t = 3
    f.poly([(20, 70), (80, 70), (80, 70 - t), (20, 70 - t)], fill=DR.WALL_FILL)
    f.poly([(20, 22), (20 + t, 22), (20 + t, 70), (20, 70)], fill=DR.WALL_FILL)
    f.poly([(80 - t, 22), (80, 22), (80, 70), (80 - t, 70)], fill=DR.WALL_FILL)
    for u, sgn in ((20 + t, 1), (80 - t, -1)):
        hinge = f.P(u, 22)
        L = f.L(27)
        c.setLineWidth(0.8)
        c.line(hinge[0], hinge[1], hinge[0] + sgn * L, hinge[1])
        c.setLineWidth(0.3)
        c.arc(hinge[0] - L, hinge[1] - L, hinge[0] + L, hinge[1] + L, 270 if sgn > 0 else 180, 90)
    for u in (18, 82):
        p = f.P(u, 16)
        c.setFillColorRGB(*K.INK)
        c.circle(p[0], p[1], max(1.5, f.L(1.6)), stroke=1, fill=0)
    K.label(c, *f.P(50, 46), 'TRASH / RECYCLING CONTAINERS', 6.5, FB, halo=False)
    f.dim((20, 70), (80, 70), 10, "24'-0\"")
    f.dim((20, 22), (20, 70), 10, "12'-0\"")
    f.note((50, 69), '6\'-0" masonry screen walls to match the building')
    f.note((60, 22), 'Steel gates on welded hinges, cane bolts, full-height screen')
    f.note((82, 16), 'Steel bollards, 6" pipe, concrete filled, painted')
    f.note((40, 12), '8" reinforced concrete pad and apron, 1 % slope to drain')
    f.finish()


def silt(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 70)
    f.poly([(0, 20), (100, 20), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(46, 20), (54, 20), (54, 10), (46, 10)], fill=(0.9, 0.86, 0.8))  # trench
    f.line((52, 8), (52, 56), lw=2.4)  # post
    f.line((49, 12), (49, 50), lw=1.4, color=K.ORANGE)  # fabric
    f.line((49, 12), (58, 12), lw=1.4, color=K.ORANGE)
    f.line((10, 30), (36, 24), lw=0.6)
    a = f.P(36, 24)
    c.line(a[0], a[1], a[0] - 5, a[1] + 3)
    c.line(a[0], a[1], a[0] - 5, a[1] - 2)
    K.label(c, *f.P(18, 33), 'FLOW', 6.5, FB, halo=False)
    f.dim((52, 20), (52, 50), -16, "24\"-30\"")
    f.note((52, 52), 'Steel T-post, 8\'-0" o.c. max., driven 24" min.')
    f.note((49, 42), 'Geotextile filter fabric on the upslope side of the posts')
    f.note((50, 14), 'Toe fabric 6" into a trench; backfill and compact')
    f.note((80, 18), 'Inspect weekly and after 0.5" of rain; remove sediment at 1/3 height')
    f.finish()


def entrance(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 60)
    f.poly([(0, 16), (100, 16), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(0, 18), (100, 18), (100, 16), (0, 16)], fill=(0.3, 0.3, 0.3))
    f.poly([(0, 34), (100, 34), (100, 18), (0, 18)], fill=(0.82, 0.82, 0.8))
    c.setStrokeColorRGB(0.4, 0.4, 0.4)
    for i in range(40):
        p = f.P(2 + (i * 37) % 96, 20 + (i * 13) % 12)
        c.circle(p[0], p[1], max(1.2, f.L(1.4)), stroke=1, fill=0)
    f.dim((100, 18), (100, 34), -10, '8"')
    f.note((30, 30), "3\"-5\" crushed stone, 8\" thick, 50'-0\" long x full drive width (min. 20')")
    f.note((50, 17), 'Geotextile fabric under the stone')
    f.note((70, 8), 'Graded subgrade')
    f.note((90, 34), 'Top-dress with clean stone as it fills with sediment; no tracking onto streets')
    f.finish()


def ada_stall(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 70)
    f.poly([(10, 10), (34, 10), (34, 64), (10, 64)], fill=(0.88, 0.92, 0.98))
    f.poly([(34, 10), (49, 10), (49, 64), (34, 64)], fill=(0.97, 0.97, 0.97))
    c.saveState()
    DR.clip_poly(c, [f.P(34, 10), f.P(49, 10), f.P(49, 64), f.P(34, 64)])
    c.setStrokeColorRGB(0.16, 0.35, 0.7)
    c.setLineWidth(0.6)
    for i in range(-10, 30):
        a, b = f.P(34, 10 + i * 3.2), f.P(49, 25 + i * 3.2)
        c.line(a[0], a[1], b[0], b[1])
    c.restoreState()
    K.label(c, *f.P(22, 36), 'ACCESSIBLE', 6.5, FB, (0.16, 0.35, 0.7), halo=False)
    for u in (10, 34, 49):
        f.line((u, 10), (u, 64), lw=1.0)
    f.dim((10, 64), (34, 64), 10, "8'-0\"")
    f.dim((34, 64), (49, 64), 10, "5'-0\" (8'-0\" van)")
    f.dim((10, 10), (10, 64), 10, "18'-0\"")
    # sign
    f.line((78, 10), (78, 56), lw=2.0)
    f.poly([(70, 44), (86, 44), (86, 62), (70, 62)], fill=(0.16, 0.35, 0.7))
    K.label(c, *f.P(78, 53), 'RESERVED', 5.5, FB, (1, 1, 1), halo=False)
    f.dim((78, 10), (78, 44), -10, "60\" min.")
    f.note((22, 30), 'International symbol of accessibility painted in the stall')
    f.note((41, 40), 'Access aisle striped at 45° in blue, 4" lines, 2\'-0" o.c.')
    f.note((78, 58), 'Sign per TAS 502.6 and Texas Transportation Code 681.009 ("van accessible" where required)')
    f.note((30, 12), 'Max. slope 1:48 in every direction in the stall and the aisle')
    f.finish()


def light_base(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 80)
    f.poly([(0, 30), (100, 30), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(40, 44), (60, 44), (60, 4), (40, 4)], fill=CONC, pattern='concrete')
    f.poly([(46, 76), (54, 76), (54, 48), (46, 48)], fill=(0.6, 0.6, 0.62))
    f.poly([(43, 48), (57, 48), (57, 44), (43, 44)], fill=(0.35, 0.35, 0.37))
    for u in (44, 56):
        f.line((u, 48), (u, 22), lw=1.0)
    f.dim((40, 4), (60, 4), -10, '24" dia.')
    f.dim((60, 30), (60, 44), -10, '30" above paving')
    f.note((50, 70), 'Square steel pole, 25\' mounting height (verify), wind rated per ASCE 7')
    f.note((44, 30), '(4) anchor bolts with template, projection per the pole maker')
    f.note((52, 40), 'Concrete pier, 3,000 psi, (6) #5 vert. with #3 ties at 12"; depth per the engineer')
    f.note((70, 20), '1" conduit sweep to the handhole; ground rod at the pier')
    f.finish()


# ---------- landscape ----------
def tree(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 90)
    f.poly([(0, 26), (100, 26), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(30, 26), (70, 26), (66, 10), (34, 10)], fill=(0.88, 0.82, 0.72))  # pit
    f.poly([(38, 26), (62, 26), (60, 12), (40, 12)], fill=(0.62, 0.5, 0.38))  # root ball
    f.line((50, 26), (50, 70), lw=2.4, color=(0.4, 0.3, 0.2))
    c.setStrokeColorRGB(*K.GREEN)
    c.setLineWidth(1.2)
    p = f.P(50, 76)
    c.circle(p[0], p[1], f.L(14), stroke=1, fill=0)
    f.line((28, 28), (28, 60), lw=1.2)
    f.line((72, 28), (72, 60), lw=1.2)
    f.line((28, 52), (50, 50), lw=0.4)
    f.line((72, 52), (50, 50), lw=0.4)
    f.poly([(30, 26), (70, 26), (70, 28.5), (30, 28.5)], fill=(0.55, 0.4, 0.25))
    f.dim((30, 10), (70, 10), -10, '2x root ball width')
    f.note((50, 40), '3" caliper min., ANSI Z60.1; root flare at or 1" above grade')
    f.note((60, 27.5), '3" shredded hardwood mulch, kept 3" off the trunk')
    f.note((72, 56), 'Stakes and flexible ties for one year, then remove')
    f.note((62, 18), 'Remove burlap and wire from the top 1/3 of the root ball')
    f.note((66, 12), 'Backfill with native soil; water in; no amendments unless the soils report calls for them')
    f.finish()


def shrub(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 60)
    f.poly([(0, 20), (100, 20), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(0, 22), (100, 22), (100, 20), (0, 20)], fill=(0.55, 0.4, 0.25))
    c.setStrokeColorRGB(*K.GREEN)
    c.setLineWidth(1.0)
    for u in (22, 50, 78):
        p = f.P(u, 32)
        c.circle(p[0], p[1], f.L(10), stroke=1, fill=0)
        f.poly([(u - 6, 20), (u + 6, 20), (u + 5, 10), (u - 5, 10)], fill=(0.62, 0.5, 0.38))
    f.dim((22, 46), (50, 46), 10, "3'-0\" o.c. triangular")
    f.note((50, 40), '5-gallon shrubs (Dwarf Yaupon / Indian Hawthorn or approved native)')
    f.note((70, 21), '3" mulch over the whole bed; steel edging at lawn')
    f.note((78, 12), 'Bed soil mix 6" deep, tilled into the subgrade')
    f.finish()


# ---------- structural ----------
def grade_beam(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 70)
    f.poly([(0, 40), (100, 40), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(20, 52), (100, 52), (100, 46), (44, 46), (44, 14), (20, 14)], fill=CONC, pattern='concrete', lw=1.0)
    f.poly([(14, 70), (24, 70), (24, 52), (14, 52)], fill=DR.WALL_FILL)
    for u, v in ((25, 19), (39, 19), (25, 44), (39, 44)):
        _rebar(f, u, v, 1.1)
    f.poly([(23, 17), (41, 17), (41, 46), (23, 46)], stroke=K.INK, lw=0.5)
    for u in range(50, 100, 12):
        _rebar(f, u, 49, 0.7)
    f.dim((20, 14), (44, 14), -10, '12"')
    f.dim((20, 14), (20, 52), 10, '30"')
    f.note((32, 44), '(2) #5 top and bottom, continuous; lap 30 bar dia.')
    f.note((41, 30), '#3 stirrups at 24" o.c.')
    f.note((70, 49), '4"–5" slab, #3 at 18" o.c. or PT tendons per the engineer, on 10-mil vapor retarder')
    f.note((19, 60), 'Exterior wall above (see A-501)')
    f.note((80, 20), 'Select fill / moisture-conditioned subgrade per the geotechnical report (PVR)')
    f.finish()


def footing(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 80)
    f.poly([(0, 46), (100, 46), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(26, 24), (74, 24), (74, 8), (26, 8)], fill=CONC, pattern='concrete')
    f.poly([(0, 52), (100, 52), (100, 46), (0, 46)], fill=CONC, pattern='concrete')
    f.poly([(46, 80), (54, 80), (54, 52), (46, 52)], fill=(0.55, 0.55, 0.6))
    f.poly([(40, 54), (60, 54), (60, 52), (40, 52)], fill=(0.3, 0.3, 0.32))
    for u in (43, 57):
        f.line((u, 52), (u, 30), lw=1.0)
    for u in range(30, 72, 6):
        _rebar(f, u, 11, 0.8)
    f.dim((26, 8), (74, 8), -10, 'Size per the engineer')
    f.note((50, 72), 'Steel column (HSS / W shape) per the structural drawings')
    f.note((60, 53), 'Base plate on non-shrink grout')
    f.note((43, 38), '(4) anchor rods with nuts and plate washers')
    f.note((60, 16), 'Spread footing, bottom bars each way, 3" clear')
    f.note((90, 49), 'Slab with isolation joint round the column')
    f.finish()


# ---------- architectural wall sections ----------
def wall_commercial(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 130, notes_w=0.45)
    f.poly([(0, 14), (100, 14), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(26, 24), (100, 24), (100, 18), (50, 18), (50, 2), (26, 2)], fill=CONC, pattern='concrete')
    f.poly([(26, 104), (34, 104), (34, 24), (26, 24)], fill=(0.75, 0.75, 0.75), pattern='cmu')  # CMU
    f.poly([(16, 104), (23, 104), (23, 18), (16, 18)], fill=(0.8, 0.55, 0.45), pattern='brick')  # brick
    f.poly([(16, 30), (23, 30), (23, 18), (16, 18)], fill=(0.82, 0.8, 0.74), pattern='stone')  # stone base
    f.poly([(23.5, 104), (25.5, 104), (25.5, 24), (23.5, 24)], fill=(0.98, 0.9, 0.5))  # insulation
    f.poly([(34, 104), (36, 104), (36, 26), (34, 26)], fill=(0.96, 0.96, 0.96))  # furring / gyp
    f.poly([(26, 118), (34, 118), (34, 104), (26, 104)], fill=(0.75, 0.75, 0.75), pattern='cmu')  # parapet
    f.poly([(16, 118), (23, 118), (23, 104), (16, 104)], fill=(0.9, 0.9, 0.86), pattern='stucco')  # EIFS band
    f.poly([(14, 121), (36, 121), (36, 118), (14, 118)], fill=(0.35, 0.35, 0.37))  # coping
    f.poly([(34, 104), (100, 104), (100, 100), (34, 100)], fill=(0.9, 0.9, 0.9))  # deck + insulation
    f.poly([(34, 108), (100, 106), (100, 104), (34, 104)], fill=(0.98, 0.9, 0.5), pattern='insulation')
    f.line((34, 108.3), (100, 106.3), lw=1.4)
    c.setStrokeColorRGB(*K.INK)
    c.setLineWidth(0.5)
    f.line((36, 100), (100, 100), lw=0.6)
    f.line((36, 88), (100, 88), lw=0.6)
    for i in range(10):
        u = 36 + i * 6.4
        f.line((u, 88 if i % 2 == 0 else 100), (u + 6.4, 100 if i % 2 == 0 else 88), lw=0.4)
    f.line((36, 30), (100, 30), lw=0.3, dash=[3, 2])
    f.note((20, 122), 'Prefinished metal coping on a sloped wood nailer')
    f.note((60, 107), 'TPO membrane on tapered polyiso (R-30 c.i. min.) on 1-1/2" metal deck')
    f.note((70, 94), 'Steel bar joists, bearing on the CMU with a bond beam')
    f.note((19, 110), 'EIFS upper band on sheathing')
    f.note((19, 70), 'Brick veneer, 2" air space, ties at 16" o.c. vert. / 24" horiz.')
    f.note((24.5, 60), 'Rigid insulation (R-7.5 c.i.) and air / water barrier')
    f.note((30, 50), '8" CMU, grouted and reinforced per the structural drawings')
    f.note((35, 40), 'Furring and gypsum board (by tenant in shell bays)')
    f.note((19, 24), 'Cast stone base; through-wall flashing and weeps at the base')
    f.note((70, 21), '4"–5" slab on vapor retarder; grade beam per the S-series')
    f.dim((26, 24), (26, 104), 14, 'Floor to roof bearing')
    f.finish(6.2)


def wall_wood(c, x, y, w, h):
    f = Frame(c, x, y, w, h, 100, 120, notes_w=0.45)
    f.poly([(0, 14), (100, 14), (100, 0), (0, 0)], fill=EARTH, pattern='earth')
    f.poly([(22, 22), (100, 22), (100, 17), (40, 17), (40, 2), (22, 2)], fill=CONC, pattern='concrete')
    f.poly([(26, 96), (32, 96), (32, 22), (26, 22)], fill=(0.98, 0.9, 0.5), pattern='insulation')  # stud cavity
    f.poly([(18, 92), (24, 92), (24, 18), (18, 18)], fill=(0.8, 0.55, 0.45), pattern='brick')
    f.poly([(32, 96), (33.5, 96), (33.5, 22), (32, 22)], fill=(0.96, 0.96, 0.96))
    K.draw_poly(c, [f.P(10, 92), f.P(60, 118), f.P(100, 118)], stroke=K.INK, lw=1.4, close=False)
    f.line((26, 96), (100, 96), lw=0.6)
    f.poly([(33, 102), (100, 102), (100, 96), (33, 96)], fill=(0.98, 0.9, 0.5), pattern='insulation')
    f.note((40, 112), 'Architectural shingles, synthetic underlayment, 7/16" OSB on trusses at 24" o.c.')
    f.note((70, 99), 'R-38 blown insulation; baffles at the eave')
    f.note((21, 60), 'Brick veneer (or fiber-cement siding) with ties and weeps')
    f.note((29, 50), '2x6 studs at 16" o.c., R-20 batts, 7/16" OSB, WRB')
    f.note((33, 40), '1/2" gypsum board, painted')
    f.note((60, 20), 'Post-tensioned slab on vapor retarder; beam per S-series')
    f.finish(6.2)


# ---------- sheet layout ----------
def details_grid(c, items, region, start=1):
    """lays out [(title, fn)] in a grid that gives each detail as much room as the region allows"""
    ax, ay, aw, ah = region
    n = max(1, len(items))
    best = None
    for cols in range(1, n + 1):
        rows = math.ceil(n / cols)
        cw, ch = aw / cols, ah / rows
        size = min(cw / 1.7, ch)  # details read best a little wider than tall
        if best is None or size > best[0]:
            best = (size, cols, rows, cw, ch)
    _, cols, rows, cw, ch = best
    for i, (title, fn) in enumerate(items):
        cx = ax + (i % cols) * cw
        cy = ay + ah - (i // cols + 1) * ch
        c.setStrokeColorRGB(*K.FAINT)
        c.setLineWidth(0.5)
        c.rect(cx + 4, cy + 4, cw - 8, ch - 8, stroke=1, fill=0)
        fn(c, cx + 16, cy + 44, cw - 32, ch - 60)
        K.view_title(c, cx + 12, cy + 16, start + i, title, 'N.T.S.')
