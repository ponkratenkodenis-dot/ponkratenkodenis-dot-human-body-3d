"""Keep the fitted skeleton inside the skin.

The bones come from one male donor (BodyParts3D) and are moved onto this body by joint-to-joint similarity
transforms, i.e. scaled by limb length only. A woman's long bones and joints are more gracile than a man's of the
same length, so at the places where bone lies right under the skin (ankle malleoli, wrist, foot, knuckles) the
scaled bones came out through the skin by 1-2 cm. Two steps fix that:

1. chain_fit: each limb is a chain of stations (rig joints: hip, knee, ankle, ball of the foot, toe tip; shoulder,
   elbow, wrist, knuckles, finger tip). At every station the bones get a cross-section factor for two directions
   (side-to-side and front-to-back); between stations it is interpolated along the bone. The bones are scaled
   toward the limb axis only, so the joint centres stay on the rig joints and both sides of a joint get the same
   factor (the articular surfaces still meet). Factors are found by minimising skin penetration plus a cost for
   any change; the first station of a chain (hip, shoulder) stays 1.
2. push_in: whatever is still closer to the skin than a margin is pushed in by a smooth displacement field over
   the part (Gaussian, a few mm wide), the same way the muscles are kept inside the skin.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


class SDF:
    """signed distance to the skin: + inside, - outside (sign from the nearest face normal, parity as a check)"""
    def __init__(self, verts, tris):
        self.bvh = BVHTree.FromPolygons([Vector(v) for v in verts], [tuple(map(int, t)) for t in tris])

    DIRS = [Vector(d).normalized() for d in ((1, .0013, .0007), (-.0011, 1, .0017), (.0019, -.0007, 1), (-1, -.0017, .0011), (.0013, -1, -.0019))]

    def inside(self, p):
        """ray parity, majority of five directions (robust in skin folds)"""
        votes = 0
        for dv in self.DIRS:
            n, o = 0, Vector(p)
            for _ in range(40):
                hit = self.bvh.ray_cast(o, dv)
                if hit[0] is None: break
                n += 1; o = hit[0] + dv * 1e-5
            votes += n % 2
        return votes >= 3

    def __call__(self, P):
        d = np.empty(len(P)); N = np.empty((len(P), 3))
        for i, p in enumerate(P):
            loc, nrm, _, dist = self.bvh.find_nearest(Vector(p))
            if loc is None: d[i] = 1.0; N[i] = 0; continue
            out = (Vector(p) - loc).dot(nrm) > 0
            if out or dist < .004: out = not self.inside(p)       # the face normal lies in folds: confirm by parity
            d[i] = -dist if out else dist
            # inward direction: outside -> toward the nearest skin point; inside -> against the face normal
            v = np.array(loc - Vector(p)); N[i] = -v / (np.linalg.norm(v) + 1e-12) if out else np.array(nrm)
        return d, N


def _frames(Q):
    """per segment: unit axis a, side direction x (body x made perpendicular), front-back y = a × x"""
    F = []
    for i in range(len(Q) - 1):
        a = Q[i + 1] - Q[i]; L = np.linalg.norm(a); a = a / L
        x = np.array([1.0, 0, 0]) - a * a[0]
        if np.linalg.norm(x) < .3: x = np.array([0, 0, 1.0]) - a * a[2]
        x /= np.linalg.norm(x); y = np.cross(a, x); F.append((Q[i], a, L, x, y))
    return F


def chain_apply(P, seg, Q, W):
    """scale points toward the chain axis. P (n,3); seg (n,) segment index per point; Q (k,3) stations;
    W (k,2) cross-section factors (side, front-back) at each station"""
    F = _frames(Q); out = P.copy()
    for s, (q0, a, L, x, y) in enumerate(F):
        m = seg == s
        if not m.any(): continue
        r = P[m] - q0; t = r @ a; u = np.clip(t / L, 0, 1)[:, None]
        w = W[s] * (1 - u) + W[s + 1] * u
        rx, ry = r @ x, r @ y
        rest = r - np.outer(rx, x) - np.outer(ry, y)                 # axial part (+ clamped beyond the ends)
        out[m] = q0 + rest + np.outer(rx * w[:, 0], x) + np.outer(ry * w[:, 1], y)
    return out


def chain_fit(P, seg, Q, sdf, margin=.003, lam=.6, fixed=(0,), lo=.82, log=print, name=""):
    """find W (k,2) so the points P sit at least `margin` inside the skin with the least change"""
    k = len(Q); W = np.ones((k, 2))
    def cost(W):
        d, _ = sdf(chain_apply(P, seg, Q, W)); v = np.maximum(0, margin - d)
        return float((v ** 2).sum() * 200 + lam * ((1 - W) ** 2).sum() + .3 * (np.diff(W, axis=0) ** 2).sum()), int((d < 0).sum()), float(-d.min() if d.min() < 0 else 0)
    c, nout, worst = cost(W); log(f"CONTAIN {name} before: {nout}/{len(P)} outside, worst {worst*1000:.0f} mm")
    step = .08
    while step > .004:
        moved = False
        for i in range(k):
            if i in fixed: continue
            for j in range(2):
                for sg in (-1, 1):
                    W2 = W.copy(); W2[i, j] = np.clip(W2[i, j] + sg * step, lo, 1.0)
                    if W2[i, j] == W[i, j]: continue
                    c2 = cost(W2)[0]
                    if c2 < c - 1e-9: W, c, moved = W2, c2, True
        if not moved: step /= 2
    c, nout, worst = cost(W)
    log(f"CONTAIN {name} after:  {nout}/{len(P)} outside, worst {worst*1000:.0f} mm, factors " + " ".join(f"{a:.2f}/{b:.2f}" for a, b in W))
    return W


class PushField:
    """smooth inward displacement for one part: offending sample points move inward along the skin normal,
    the move spreads to the rest of the part with a Gaussian of width sigma"""
    def __init__(self, S, sdf, margin=.0015, sigma=.008, iters=8):
        self.S0 = S.copy(); self.D = np.zeros_like(S); self.sigma = sigma
        for _ in range(iters):
            cur = S + self.D; d, N = sdf(cur); bad = d < margin
            if not bad.any(): break
            delta = np.zeros_like(S); delta[bad] = -N[bad] * (margin - d[bad])[:, None] * 1.15
            self.D += self._spread(S, delta, bad)
        self.n_bad = int((sdf(S + self.D)[0] < 0).sum())

    def _spread(self, S, delta, bad):
        src, dv = S[bad], delta[bad]
        out = np.zeros_like(S)
        for i0 in range(0, len(S), 2048):
            X = S[i0:i0 + 2048]; k = np.exp(-((X[:, None, :] - src[None]) ** 2).sum(-1) / (2 * self.sigma ** 2))
            # max-normalised: a point on top of an offender moves fully, its neighbourhood fades out
            wsum = k.sum(1, keepdims=True); out[i0:i0 + 2048] = (k @ dv) / np.maximum(wsum, 1.0)
        return out

    def __call__(self, P):
        if not np.any(self.D): return P
        out = np.empty_like(P); s2 = 2 * self.sigma ** 2
        for i0 in range(0, len(P), 2048):
            X = P[i0:i0 + 2048]; k = np.exp(-((X[:, None, :] - self.S0[None]) ** 2).sum(-1) / s2) + 1e-12
            out[i0:i0 + 2048] = X + (k @ self.D) / k.sum(1, keepdims=True)
        return out


def _rot(ax, ang):
    ax = np.asarray(ax, float); ax = ax / np.linalg.norm(ax); c, s = np.cos(ang), np.sin(ang); x, y, z = ax
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])


def rigid_fit(P, pivot, sdf, avoid, margin=.004, gap=.006, lim=20, log=print, name=""):
    """turn a part about a joint (vertical axis, then side-to-side axis) so it sits inside the skin without
    touching `avoid` (a BVHTree, e.g. the ribs) closer than `gap`. Returns a function on point arrays."""
    pivot = np.asarray(pivot, float)
    def R(a, b): return _rot((0, 0, 1), np.radians(a)) @ _rot((1, 0, 0), np.radians(b))
    def cost(a, b):
        Q = (P - pivot) @ R(a, b).T + pivot; d, _ = sdf(Q)
        g = np.array([avoid.find_nearest(Vector(q))[3] for q in Q])
        return float((np.maximum(0, margin - d) ** 2).sum() * 200 + (np.maximum(0, gap - g) ** 2).sum() * 200 + 1e-4 * (a * a + b * b)), int((d < 0).sum()), float(max(0, -d.min())), float(g.min())
    a = b = 0.0; c, n0, w0, g0 = cost(a, b); step = 4.0
    while step > .25:
        best = None
        for da, db in ((step, 0), (-step, 0), (0, step), (0, -step)):
            if abs(a + da) > lim or abs(b + db) > lim: continue
            c2 = cost(a + da, b + db)[0]
            if c2 < c - 1e-12 and (best is None or c2 < best[0]): best = (c2, a + da, b + db)
        if best: c, a, b = best
        else: step /= 2
    _, n1, w1, g1 = cost(a, b)
    log(f"CONTAIN {name} turned {a:.1f}° about vertical, {b:.1f}° about side axis: outside {n0} -> {n1}, worst {w0*1000:.0f} -> {w1*1000:.0f} mm, nearest rib {g0*1000:.0f} -> {g1*1000:.0f} mm")
    M = R(a, b)
    return lambda X: (np.asarray(X) - pivot) @ M.T + pivot
