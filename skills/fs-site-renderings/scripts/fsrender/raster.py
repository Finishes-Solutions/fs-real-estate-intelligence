"""A small software renderer: perspective camera, z-buffer, two-sided Lambert shading under the sun, the ground as a
textured plane (ray cast per pixel), sky, light haze, and darkened silhouette edges. Returns the picture and an object-id
buffer (which building every pixel shows), used for the fidelity check. numpy + Pillow only."""
import math
import numpy as np
from PIL import Image

SKY_TOP = np.array([0.40, 0.60, 0.86])
SKY_HOR = np.array([0.80, 0.86, 0.92])
FAR_GROUND = np.array([0.55, 0.60, 0.42])


class Camera:
    def __init__(self, pos, target, fov_h, width, height):
        self.pos = np.asarray(pos, float)
        self.target = np.asarray(target, float)
        self.fov_h = fov_h
        self.W, self.H = width, height
        f = self.target - self.pos
        self.fwd = f / np.linalg.norm(f)
        up = np.array([0.0, 0.0, 1.0])
        r = np.cross(self.fwd, up)
        if np.linalg.norm(r) < 1e-6:
            r = np.array([1.0, 0.0, 0.0])
        self.right = r / np.linalg.norm(r)
        self.up = np.cross(self.right, self.fwd)
        self.tx = math.tan(math.radians(fov_h) / 2)
        self.ty = self.tx * height / width

    def ndc(self, pts):
        rel = np.asarray(pts, float) - self.pos
        z = rel @ self.fwd
        return np.stack([(rel @ self.right) / z / self.tx, (rel @ self.up) / z / self.ty], -1), z

    def as_dict(self):
        return dict(pos=self.pos.round(2).tolist(), target=self.target.round(2).tolist(), fov_h=self.fov_h, size=[self.W, self.H])


def triangulate(P):
    """ear clipping for a planar polygon given in 3D (projected to its best 2D plane)"""
    n = len(P)
    if n == 3:
        return [(0, 1, 2)]
    A = np.asarray(P, float)
    nrm = np.cross(A[1] - A[0], A[2] - A[0])
    for i in range(n):
        c = np.cross(A[(i + 1) % n] - A[i], A[(i + 2) % n] - A[i])
        if np.linalg.norm(c) > np.linalg.norm(nrm):
            nrm = c
    ax = int(np.argmax(np.abs(nrm)))
    Q = np.delete(A, ax, axis=1)
    area = sum(Q[i][0] * Q[(i + 1) % n][1] - Q[(i + 1) % n][0] * Q[i][1] for i in range(n))
    idx = list(range(n)) if area > 0 else list(range(n))[::-1]
    tris = []

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def inside(p, a, b, c):
        return cross(a, b, p) >= -1e-9 and cross(b, c, p) >= -1e-9 and cross(c, a, p) >= -1e-9
    guard = 0
    while len(idx) > 3 and guard < 10 * n:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            if cross(Q[i0], Q[i1], Q[i2]) <= 1e-12:
                continue
            if any(inside(Q[j], Q[i0], Q[i1], Q[i2]) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((i0, i1, i2))
            idx.pop(k)
            break
        else:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    elif len(idx) > 3:  # degenerate: fan the rest
        tris += [(idx[0], idx[k], idx[k + 1]) for k in range(1, len(idx) - 1)]
    return tris


def render(scene, cam, ss=2, outline=True):
    W, H = cam.W * ss, cam.H * ss
    sun = scene.sun / np.linalg.norm(scene.sun)
    # ---- sky and ground, per pixel ----
    xs = ((np.arange(W) + 0.5) / W * 2 - 1) * cam.tx
    ys = (1 - (np.arange(H) + 0.5) / H * 2) * cam.ty
    X, Y = np.meshgrid(xs, ys)
    D = cam.fwd[None, None, :] + X[..., None] * cam.right[None, None, :] + Y[..., None] * cam.up[None, None, :]
    dz = D[..., 2]
    img = np.empty((H, W, 3), np.float32)
    zbuf = np.zeros((H, W), np.float32)
    ids = np.zeros((H, W), np.int32)
    elev = np.clip(dz / np.linalg.norm(D, axis=-1), -1, 1)
    sky = SKY_HOR[None, None, :] + (SKY_TOP - SKY_HOR)[None, None, :] * np.clip(elev, 0, 1)[..., None] ** 0.6
    ground = dz < -1e-6
    t = np.where(ground, -cam.pos[2] / np.where(ground, dz, -1), 0)
    gx = cam.pos[0] + t * D[..., 0]
    gy = cam.pos[1] + t * D[..., 1]
    x0, y0, x1, y1, r = scene.tex_box
    th, tw = scene.tex.shape[:2]
    u = (gx - x0) * r
    v = (y1 - gy) * r
    inb = ground & (u >= 0) & (u < tw - 1) & (v >= 0) & (v < th - 1)
    gcol = np.broadcast_to(FAR_GROUND, (H, W, 3)).astype(np.float32).copy()
    ui, vi = np.clip(u, 0, tw - 2), np.clip(v, 0, th - 2)
    u0, v0 = ui.astype(np.int32), vi.astype(np.int32)
    fu, fv = (ui - u0)[..., None], (vi - v0)[..., None]
    T = scene.tex
    samp = (T[v0, u0] * (1 - fu) * (1 - fv) + T[v0, u0 + 1] * fu * (1 - fv) + T[v0 + 1, u0] * (1 - fu) * fv + T[v0 + 1, u0 + 1] * fu * fv)
    gcol[inb] = samp[inb]
    gcol *= (0.80 + 0.22 * sun[2])
    haze = (1 - np.exp(-t / 9000.0))[..., None]
    gcol = gcol * (1 - haze) + SKY_HOR[None, None, :] * haze
    img[:] = np.where(ground[..., None], gcol, sky)
    zbuf[ground] = 1.0 / np.maximum(t[ground], 1e-3)
    # ---- triangles ----
    tri_v, tri_c, tri_o = [], [], []
    skip = getattr(cam, 'skip_trees_within', 0)
    for f in scene.faces:
        P = f['pts']
        if skip and f['obj'] >= 5000 and np.linalg.norm(np.asarray(P[0])[:2] - cam.pos[:2]) < skip:
            continue
        for a, b, c in triangulate(P):
            tri_v.append((P[a], P[b], P[c]))
            tri_c.append(f['col'])
            tri_o.append(f['obj'])
    if tri_v:
        V = np.asarray(tri_v, np.float64)
        Cc = np.asarray(tri_c, np.float32)
        O = np.asarray(tri_o, np.int32)
        nrm = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0])
        ln = np.linalg.norm(nrm, axis=1)
        keep = ln > 1e-9
        V, Cc, O, nrm = V[keep], Cc[keep], O[keep], nrm[keep] / ln[keep][:, None]
        view = V.mean(axis=1) - cam.pos
        flip = np.sum(nrm * view, axis=1) > 0
        nrm[flip] *= -1  # two-sided: the normal faces the camera
        lam = np.clip(nrm @ sun, 0, 1)
        sky_fill = 0.12 * np.clip(nrm[:, 2], 0, 1)
        shade = (0.50 + 0.52 * lam + sky_fill)[:, None]
        C = np.clip(Cc * shade, 0, 1)
        rel = V - cam.pos
        zc = rel @ cam.fwd
        xc = rel @ cam.right
        yc = rel @ cam.up
        vis = np.all(zc > 0.5, axis=1)
        sx = (xc / np.where(zc > 0.5, zc, 1) / cam.tx * 0.5 + 0.5) * W
        sy = (0.5 - yc / np.where(zc > 0.5, zc, 1) / cam.ty * 0.5) * H
        iz = 1.0 / np.where(zc > 0.5, zc, 1)
        for k in np.nonzero(vis)[0]:
            px, py, pz = sx[k], sy[k], iz[k]
            xa, xb = max(int(math.floor(px.min())), 0), min(int(math.ceil(px.max())), W - 1)
            ya, yb = max(int(math.floor(py.min())), 0), min(int(math.ceil(py.max())), H - 1)
            if xa > xb or ya > yb:
                continue
            area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0])
            if abs(area) < 1e-9:
                continue
            gxs = np.arange(xa, xb + 1) + 0.5
            gys = np.arange(ya, yb + 1) + 0.5
            GX, GY = np.meshgrid(gxs, gys)
            w0 = ((px[1] - GX) * (py[2] - GY) - (px[2] - GX) * (py[1] - GY)) / area
            w1 = ((px[2] - GX) * (py[0] - GY) - (px[0] - GX) * (py[2] - GY)) / area
            w2 = 1 - w0 - w1
            m = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            if not m.any():
                continue
            z = w0 * pz[0] + w1 * pz[1] + w2 * pz[2]
            sub = zbuf[ya:yb + 1, xa:xb + 1]
            m &= z * (1 - 1e-5) > sub  # small bias so openings drawn on a wall win against it
            if not m.any():
                continue
            sub[m] = z[m]
            img[ya:yb + 1, xa:xb + 1][m] = C[k]
            ids[ya:yb + 1, xa:xb + 1][m] = O[k]
    # ---- silhouette and crease lines, the way a massing model reads ----
    if outline:
        e = np.zeros((H, W), bool)
        e[:, 1:] |= ids[:, 1:] != ids[:, :-1]
        e[1:, :] |= ids[1:, :] != ids[:-1, :]
        e &= (ids > 0) | np.roll(ids > 0, 1, 0) | np.roll(ids > 0, 1, 1)
        img[e] *= 0.62
    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    if ss > 1:
        out = out.resize((cam.W, cam.H), Image.LANCZOS)
        ids = ids[ss // 2::ss, ss // 2::ss][:cam.H, :cam.W]
    return out, ids
