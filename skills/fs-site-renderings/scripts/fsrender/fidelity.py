"""How closely a rendering kept the massing: the buildings' outlines from the massing (object ids) laid over the
rendering, and a score: the share of those outline pixels that have an edge in the rendering within a few pixels.
A heuristic, not proof: a low score means look closely (a moved, missing or extra building, a changed camera)."""
import numpy as np
from PIL import Image, ImageFilter


def silhouette(ids):
    b = (ids > 0) & (ids < 1000)  # buildings only (dumpsters, signs, trees are 1000+)
    e = np.zeros_like(b)
    e[:, 1:] |= b[:, 1:] != b[:, :-1]
    e[1:, :] |= b[1:, :] != b[:-1, :]
    # also the lines between two buildings
    e[:, 1:] |= (ids[:, 1:] != ids[:, :-1]) & (b[:, 1:] & b[:, :-1])
    return e


def check(massing_png, ids, render_path, out_png, radius=3):
    m = Image.open(massing_png).convert('RGB')
    r = Image.open(render_path).convert('RGB').resize(m.size, Image.LANCZOS)
    sil = silhouette(ids)
    g = np.asarray(r.convert('L').filter(ImageFilter.FIND_EDGES)).astype(np.float32)
    thr = np.percentile(g, 92)
    edges = Image.fromarray(((g > thr) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * radius + 1))
    near = np.asarray(edges) > 0
    score = float(near[sil].mean()) if sil.any() else None
    # each building on its own, so one missing or moved building isn't averaged away by the big ones
    per = {}
    for oid in np.unique(ids[(ids > 0) & (ids < 1000)]):
        mb = ids == oid
        e = np.zeros_like(mb)
        e[:, 1:] |= mb[:, 1:] != mb[:, :-1]
        e[1:, :] |= mb[1:, :] != mb[:-1, :]
        if e.sum() >= 40:  # too small to judge below that
            per[int(oid)] = float(near[e].mean())
    ov = np.asarray(r).copy()
    thick = np.asarray(Image.fromarray((sil * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    ov[thick] = (0, 230, 255)
    ov[thick & ~near] = (255, 40, 40)  # outline with nothing under it in the rendering
    W, H = m.size
    k = 1 / 3
    tw, th = int(W * k), int(H * k)
    sheet = Image.new('RGB', (tw * 3 + 20, th), (255, 255, 255))
    for i, im in enumerate((m, r, Image.fromarray(ov))):
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (i * (tw + 10), 0))
    sheet.save(out_png)
    Image.fromarray(ov).save(out_png.replace('-compare.png', '-overlay.jpg'), quality=88)
    return score, per
