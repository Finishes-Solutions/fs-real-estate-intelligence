"""The sheet kit: the 36 x 24 page, the Finishes Solutions title block fields, the drawing frame, text, tables,
note columns, north arrows, scale bars and view titles. Everything in points (1/72 in); reportlab's origin is the
bottom left of the page. Title block positions were measured off the border (assets/titleblock.pdf) from the top left
and are converted here, so a new border only means new numbers in FIELDS / REV."""
import math
from reportlab.lib.utils import simpleSplit

PAGE_W, PAGE_H = 2592, 1728  # 36 x 24 in
# inside the heavy border line (from the top left): where every sheet's content goes
FRAME_TL = dict(x=111, y=41, w=2223, h=1650)
FX, FY, FW, FH = 111, PAGE_H - 41 - 1650, 2223, 1650  # bottom-left origin
PAD = 24
AREA = (FX + PAD, FY + PAD, FW - 2 * PAD, FH - 2 * PAD)  # x, y, w, h usable

FIELDS = {  # top-left coordinates on the border
    'open': dict(x=2382, y=512, w=168, h=540),
    'drawnBy': dict(x=2440, y=1411, w=112), 'checkedBy': dict(x=2450, y=1429, w=102),
    'projectNumber': dict(x=2382, y=1464, w=168, h=26),
    'sheetTitle': dict(x=2382, y=1517, w=168, h=64),
    'sheetNumber': dict(x=2382, y=1610, w=168, h=78),
}
REV = dict(x0=2400.8, pitch=13, rows=12, no=(1369.5, 1395), date=(1303.5, 1369.5), desc=(1070.8, 1303.5))

PRELIMINARY = 'PRELIMINARY — NOT FOR CONSTRUCTION, BIDDING OR PERMIT.'
PRELIMINARY_TEXT = ('Schematic design drawings prepared by Finishes Solutions from a conceptual site plan, with AI assistance, '
                    'for feasibility, pricing and coordination only. Not prepared or sealed by a licensed architect, engineer or '
                    'surveyor. Boundary, easements, utilities, drainage, structure and code compliance are not verified and must be '
                    'designed, verified and sealed by licensed professionals before construction or permitting.')

INK = (0.106, 0.118, 0.122)
GREY = (0.30, 0.33, 0.34)
LIGHT = (0.62, 0.64, 0.64)
FAINT = (0.85, 0.86, 0.85)
RED = (0.75, 0.22, 0.17)
BLUE = (0.13, 0.36, 0.66)
GREEN = (0.24, 0.50, 0.25)
CYAN = (0.0, 0.55, 0.65)
MAGENTA = (0.62, 0.18, 0.52)
ORANGE = (0.85, 0.45, 0.05)
BROWN = (0.45, 0.30, 0.18)

F, FB = 'Helvetica', 'Helvetica-Bold'

ENG_SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000]
ARCH_SCALES = [(2, '1/2" = 1\'-0"'), (8 / 3, '3/8" = 1\'-0"'), (4, '1/4" = 1\'-0"'), (16 / 3, '3/16" = 1\'-0"'),
               (8, '1/8" = 1\'-0"'), (32 / 3, '3/32" = 1\'-0"'), (16, '1/16" = 1\'-0"'), (32, '1/32" = 1\'-0"')]


def top(y):
    """top-left y -> reportlab y"""
    return PAGE_H - y


def esc_num(v, nd=0):
    return ('{:,.%df}' % nd).format(v)


# ---------- text ----------
def wrap(text, font, size, width):
    return simpleSplit(str(text), font, size, width)


def text_block(c, x, y, w, text, size=8.5, font=F, lead=1.3, color=INK, max_y=None):
    """draws wrapped text with its top at y; returns the y below it"""
    c.setFillColorRGB(*color)
    c.setFont(font, size)
    for line in wrap(text, font, size, w):
        y -= size * lead
        if max_y is not None and y < max_y:
            return y
        c.drawString(x, y + size * 0.25, line)
    return y


def heading(c, x, y, w, text, size=9.5):
    """a black bar with white capitals; returns the y below it"""
    h = size + 6
    c.setFillColorRGB(*INK)
    c.rect(x, y - h, w, h, stroke=0, fill=1)
    c.setFillColorRGB(1, 1, 1)
    c.setFont(FB, size)
    c.drawString(x + 6, y - h + 4.5, text.upper())
    c.setFillColorRGB(*INK)
    return y - h - 5


def numbered(c, x, y, w, items, size=8.5, start=1, bullet=False, min_y=None):
    for i, t in enumerate(items):
        lab = '•' if bullet else '%d.' % (start + i)
        c.setFont(F, size)
        c.setFillColorRGB(*INK)
        lines = wrap(t, F, size, w - 16)
        if min_y is not None and y - len(lines) * size * 1.3 < min_y:
            c.setFont(F, size - 1)
            c.drawString(x, y - size * 1.3, '(continued notes omitted for space)')
            return y - size * 1.3
        c.drawString(x, y - size * 1.05, lab)
        for ln in lines:
            y -= size * 1.3
            c.drawString(x + 16, y + size * 0.25, ln)
        y -= size * 0.35
    return y


def table(c, x, y, w, rows, head=None, cols=None, right=(), size=8.0, min_y=None):
    """rows: lists of cells. cols: relative widths. Returns the y below the table."""
    n = max(len(r) for r in ([head] if head else []) + rows) if rows or head else 1
    cols = cols or [1] * n
    tot = float(sum(cols))
    ws = [w * k / tot for k in cols]
    lead = size * 1.25

    def row(cells, font, sz, col):
        nonlocal y
        lines = [wrap(str(v if v is not None else ''), font, sz, ws[i] - 6) or [''] for i, v in enumerate(cells)]
        h = max(len(L) for L in lines) * lead + 4
        if min_y is not None and y - h < min_y:
            return False
        c.setFont(font, sz)
        c.setFillColorRGB(*col)
        cx = x
        for i, L in enumerate(lines):
            for k, ln in enumerate(L):
                ty = y - 3 - (k + 1) * lead + sz * 0.3
                if i in right:
                    c.drawRightString(cx + ws[i] - 3, ty, ln)
                else:
                    c.drawString(cx + 3, ty, ln)
            cx += ws[i]
        y -= h
        c.setStrokeColorRGB(0.79, 0.80, 0.79)
        c.setLineWidth(0.5)
        c.line(x, y, x + w, y)
        return True

    if head:
        row(head, FB, size - 0.8, GREY)
    for r in rows:
        if not row(r, F, size, INK):
            c.setFont(F, size - 1)
            c.drawString(x + 3, y - size * 1.3, '… more rows than fit; see the project data.')
            y -= size * 1.5
            break
    return y - 2


# ---------- the title block ----------
def title_block(c, meta, sheet):
    """meta: project dict; sheet: {number, title, sub, scale}"""
    o = FIELDS['open']
    x, w = o['x'], o['w']
    y = top(o['y'])
    lim = top(o['y'] + o['h'])

    def key(t):
        nonlocal y
        y -= 9
        c.setFont(F, 5.5)
        c.setFillColorRGB(*GREY)
        c.drawString(x, y, t.upper())

    def val(t, size=7.5, font=FB):
        nonlocal y
        for ln in wrap(t, font, size, w):
            y -= size * 1.25
            c.setFont(font, size)
            c.setFillColorRGB(*INK)
            c.drawString(x, y, ln)

    key('Project')
    val(meta.get('name', 'Untitled project').upper(), 11, FB)
    for ln in [meta.get('address'), meta.get('site_line')]:
        if ln:
            val(ln, 6.5, F)
    if meta.get('client'):
        key('Prepared for')
        val(meta['client'])
    key('Prepared by')
    val('Finishes Solutions')
    key('Phase')
    val(meta.get('phase', 'Schematic design'))
    key('Date')
    val(meta.get('date', ''))
    key('Scale')
    val(sheet.get('scale') or 'As noted')
    # the preliminary statement in a red box
    y -= 8
    lines = wrap(PRELIMINARY_TEXT, F, 5.6, w - 8)
    head_lines = wrap(PRELIMINARY, FB, 6.2, w - 8)
    h = len(head_lines) * 7.6 + len(lines) * 7.3 + 10
    c.setStrokeColorRGB(*RED)
    c.setLineWidth(1)
    c.rect(x, y - h, w, h, stroke=1, fill=0)
    yy = y - 4
    c.setFillColorRGB(*RED)
    c.setFont(FB, 6.2)
    for ln in head_lines:
        yy -= 7.6
        c.drawString(x + 4, yy, ln)
    c.setFillColorRGB(*INK)
    c.setFont(F, 5.6)
    for ln in lines:
        yy -= 7.3
        c.drawString(x + 4, yy, ln)

    def line(field, v):
        if v:
            f = FIELDS[field]
            c.setFont(FB, 7)
            c.setFillColorRGB(*INK)
            c.drawString(f['x'], top(f['y']) - 8, str(v))

    line('drawnBy', meta.get('drawn_by'))
    line('checkedBy', meta.get('checked_by'))
    pn = FIELDS['projectNumber']
    if meta.get('number'):
        c.setFont(FB, 9)
        c.drawString(pn['x'], top(pn['y']) - 16, str(meta['number']))
    st = FIELDS['sheetTitle']
    yy = top(st['y'])
    for ln in wrap(sheet.get('title', '').upper(), FB, 10.5, st['w'])[:3]:
        yy -= 12
        c.setFont(FB, 10.5)
        c.drawString(st['x'], yy, ln)
    for ln in wrap(sheet.get('sub', ''), F, 6.5, st['w'])[:2]:
        yy -= 8.5
        c.setFont(F, 6.5)
        c.drawString(st['x'], yy, ln)
    sn = FIELDS['sheetNumber']
    size = 40 if len(sheet['number']) <= 5 else 32
    c.setFont(FB, size)
    c.drawRightString(sn['x'] + sn['w'], top(sn['y'] + sn['h']) + 6, sheet['number'])
    # issue / revision rows, written sideways, oldest first
    revs = (meta.get('revisions') or [{'no': '0', 'date': meta.get('date', ''), 'desc': 'Schematic design issue'}])[-REV['rows']:]
    for i, r in enumerate(revs):
        cx = REV['x0'] + i * REV['pitch']
        for span, v in ((REV['no'], r.get('no')), (REV['date'], r.get('date')), (REV['desc'], r.get('desc'))):
            if v in (None, ''):
                continue
            c.saveState()
            c.translate(cx + REV['pitch'] - 3.5, top(span[1]) + 2)
            c.rotate(90)
            c.setFont(F, 6.5)
            s = str(v)
            while len(s) > 3 and c.stringWidth(s, F, 6.5) > span[1] - span[0] - 4:
                s = s[:-2]
            c.drawString(0, 0, s)
            c.restoreState()


# ---------- drawing pieces ----------
def north_arrow(c, x, y, deg, size=60):
    """deg: the direction true north points on the sheet, clockwise from straight up"""
    c.saveState()
    c.translate(x, y)
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(1)
    c.circle(0, 0, size / 2, stroke=1, fill=0)
    c.rotate(-deg)
    p = c.beginPath()
    p.moveTo(0, size * 0.42)
    p.lineTo(size * 0.14, -size * 0.3)
    p.lineTo(0, -size * 0.16)
    p.close()
    c.setFillColorRGB(*INK)
    c.drawPath(p, stroke=1, fill=1)
    p = c.beginPath()
    p.moveTo(0, size * 0.42)
    p.lineTo(-size * 0.14, -size * 0.3)
    p.lineTo(0, -size * 0.16)
    p.close()
    c.setFillColorRGB(1, 1, 1)
    c.drawPath(p, stroke=1, fill=1)
    c.setFillColorRGB(*INK)
    c.setFont(FB, size * 0.22)
    c.drawCentredString(0, size * 0.52, 'N')
    c.restoreState()


def scale_bar(c, x, y, ft_per_in, units=4):
    """a bar of `units` divisions, each a round number of feet"""
    raw = ft_per_in * 0.75
    nice = min([1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 100, 200, 250, 500, 1000], key=lambda v: abs(v - raw))
    seg = nice / ft_per_in * 72
    c.setLineWidth(0.6)
    c.setStrokeColorRGB(*INK)
    for i in range(units):
        c.setFillColorRGB(*(INK if i % 2 == 0 else (1, 1, 1)))
        c.rect(x + i * seg, y, seg, 5, stroke=1, fill=1)
    c.setFillColorRGB(*INK)
    c.setFont(F, 6.5)
    for i in range(units + 1):
        c.drawCentredString(x + i * seg, y + 8, str(int(nice * i)) + ("'" if i == units else ''))
    return units * seg


def view_title(c, x, y, num, title, scale_text=None, ft_per_in=None, sub=None):
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(1.2)
    c.circle(x + 11, y + 6, 11, stroke=1, fill=0)
    c.setFont(FB, 10)
    c.setFillColorRGB(*INK)
    c.drawCentredString(x + 11, y + 2.5, str(num))
    c.setFont(FB, 11)
    c.drawString(x + 30, y + 6, title.upper())
    w = c.stringWidth(title.upper(), FB, 11)
    c.setLineWidth(1.5)
    c.line(x + 30, y + 2, x + 30 + max(w, 120), y + 2)
    c.setFont(F, 8)
    line2 = ' · '.join(t for t in [('Scale: ' + scale_text) if scale_text else None, sub] if t)
    if line2:
        c.drawString(x + 30, y - 9, line2)
    if ft_per_in:
        scale_bar(c, x + 30 + max(w, 120) + 20, y + 1, ft_per_in)


def arch_scale_for(w_ft, h_ft, w_pt, h_pt):
    for ft, lab in ARCH_SCALES:
        if w_ft / ft * 72 <= w_pt and h_ft / ft * 72 <= h_pt:
            return ft, lab
    ft = math.ceil(max(w_ft / (w_pt / 72), h_ft / (h_pt / 72)))
    return ft, '1" = %d\'-0"' % ft


def eng_scale_for(w_ft, h_ft, w_pt, h_pt):
    for s in ENG_SCALES:
        if w_ft / s * 72 <= w_pt and h_ft / s * 72 <= h_pt:
            return s
    return math.ceil(max(w_ft / (w_pt / 72), h_ft / (h_pt / 72)) / 100) * 100


def poly_path(c, pts, close=True):
    p = c.beginPath()
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    if close:
        p.close()
    return p


def draw_poly(c, pts, stroke=INK, fill=None, lw=0.8, dash=None, close=True):
    if len(pts) < 2:
        return
    c.saveState()
    c.setLineWidth(lw)
    c.setStrokeColorRGB(*stroke) if stroke else None
    if fill:
        c.setFillColorRGB(*fill)
    if dash:
        c.setDash(list(dash)) if isinstance(dash, tuple) else c.setDash(dash)
    c.drawPath(poly_path(c, pts, close), stroke=1 if stroke else 0, fill=1 if fill else 0)
    c.restoreState()


def label(c, x, y, text, size=7, font=F, color=INK, center=True, halo=True, angle=0):
    c.saveState()
    c.translate(x, y)
    if angle:
        c.rotate(angle)
    w = c.stringWidth(text, font, size)
    if halo:
        c.setFillColorRGB(1, 1, 1)
        c.rect((-w / 2 if center else 0) - 1.5, -size * 0.3, w + 3, size * 1.15, stroke=0, fill=1)
    c.setFillColorRGB(*color)
    c.setFont(font, size)
    (c.drawCentredString if center else c.drawString)(0, 0, text)
    c.restoreState()


def legend_row(c, x, y, kind, color, text, size=8):
    """kind: 'fill' | 'line' | 'dash' | 'dot' | 'tri' | 'sq' """
    c.saveState()
    c.setStrokeColorRGB(*color)
    c.setFillColorRGB(*color)
    if kind == 'fill':
        c.setFillColorRGB(*color)
        c.rect(x, y, 20, 10, stroke=0, fill=1)
    elif kind in ('line', 'dash'):
        c.setLineWidth(1.6)
        if kind == 'dash':
            c.setDash([6, 3])
        c.line(x, y + 5, x + 20, y + 5)
    elif kind == 'dot':
        c.circle(x + 10, y + 5, 3.5, stroke=1, fill=1)
    elif kind == 'sq':
        c.rect(x + 6, y + 1, 8, 8, stroke=1, fill=0)
    elif kind == 'tri':
        c.drawPath(poly_path(c, [(x + 10, y + 10), (x + 4, y), (x + 16, y)]), stroke=1, fill=1)
    c.restoreState()
    c.setFont(F, size)
    c.setFillColorRGB(*INK)
    c.drawString(x + 27, y + 1.5, text)
    return y - 14


def note_columns(c, blocks, ncols=4, x0=None, y0=None, w=None, h=None, gap=20, size=None):
    """blocks: [(heading, kind, payload)] kind: 'list' | 'bullets' | 'table' (payload: (head, rows, cols)) | 'text'.
    Flows down columns. Without a size the text is set as large as fits (8.5 to 13 pt) so a short notes sheet
    reads at half-size prints instead of filling one corner."""
    x0 = AREA[0] if x0 is None else x0
    y0 = AREA[1] + AREA[3] if y0 is None else y0
    w = AREA[2] if w is None else w
    h = AREA[3] if h is None else h
    cw = (w - gap * (ncols - 1)) / ncols
    blocks = [b for b in blocks if b[2]]

    def est(kind, payload, sz):
        ld = sz * 1.3
        if kind in ('list', 'bullets'):
            return sum((len(wrap(t, F, sz, cw - 16)) * ld + sz * 0.35) for t in payload) + sz + 22
        if kind == 'table':
            hd, rows, cols = payload
            ws = cols or [1] * max(len(r) for r in rows)
            tot = float(sum(ws))
            return sum(max(len(wrap(str(v), F, sz - 0.5, cw * ws[i] / tot - 6) or ['']) for i, v in enumerate(r)) * (sz - 0.5) * 1.25 + 4
                       for r in rows + ([hd] if hd else [])) + sz + 22
        return len(wrap(payload, F, sz, cw)) * ld + sz + 22

    def fits(sz):
        # greedy fill of the columns at this size
        col, used = 0, 0
        for _, k_, p_ in blocks:
            need = est(k_, p_, sz) + 12
            if used and used + need > h * 0.94:
                col += 1
                used = 0
            used += need
            if col >= ncols or used > h * 0.94:
                return False
        return True

    if size is None:
        size = next((sz for sz in (13, 12, 11, 10.5, 10, 9.5, 9, 8.5) if fits(sz)), 8.5)
    col = 0
    y = y0
    bottom = y0 - h
    target = sum(est(k_, p_, size) for _, k_, p_ in blocks) / ncols
    for title, kind, payload in blocks:
        need = est(kind, payload, size)
        used = y0 - y
        if col < ncols - 1 and used > 40 and (y - need < bottom or used + need / 2 > target):
            col += 1
            y = y0
        x = x0 + col * (cw + gap)
        y = heading(c, x, y, cw, title, size=size + 1)
        if kind == 'list':
            y = numbered(c, x, y, cw, payload, size=size, min_y=bottom)
        elif kind == 'bullets':
            y = numbered(c, x, y, cw, payload, size=size, bullet=True, min_y=bottom)
        elif kind == 'table':
            hd, rows, cols = payload
            y = table(c, x, y, cw, rows, head=hd, cols=cols, size=size - 0.5, min_y=bottom)
        else:
            y = text_block(c, x, y, cw, payload, size=size, max_y=bottom)
        y -= 12
    return col


def stamp_disclaimer(c, x, y, w, text):
    c.setStrokeColorRGB(*RED)
    c.setLineWidth(0.8)
    lines = wrap(text, FB, 7.5, w - 10)
    h = len(lines) * 9.5 + 8
    c.rect(x, y - h, w, h, stroke=1, fill=0)
    c.setFillColorRGB(*RED)
    c.setFont(FB, 7.5)
    yy = y - 4
    for ln in lines:
        yy -= 9.5
        c.drawString(x + 5, yy + 2, ln)
    c.setFillColorRGB(*INK)
    return y - h - 6
