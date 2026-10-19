"""Female pelvis and rib cage: smooth deformation fields applied to the fitted (male, BodyParts3D) bones in body space.

Pelvis: textbook female/male ratios (obstetric pelvimetry) applied to the model's own measurements:
  true conjugate x1.08, inlet transverse x1.08, interspinous x1.22, intertuberous x1.30, pelvic height x0.93,
  subpubic angle to ~88 deg, bi-iliac breadth ~26.5 cm limited by >= 2 cm of tissue over the iliac crest.
  Field: x scaled by a height-dependent factor (outlet widened most), pubis lengthened forward (longer female
  pubic bodies -> larger AP inlet), height compressed about the sacral promontory so L5 stays seated.
Rib cage: sternal body shortened to 1.85 x manubrium (Hyrtl), ribs inclined 4 deg more, lower aperture narrowed
  until the lower ribs have ~1.8 cm of lateral tissue. Rib heads at the spine do not move.
All fields are continuous in space, so joints (sacroiliac, symphysis, costal cartilages, sternum) stay closed."""
import numpy as np
import pelvimetry as PM

RATIO = {"true_conjugate": 1.08, "inlet_transverse": 1.08, "interspinous": 1.22, "intertuberous": 1.30}


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- skin cross-sections
class Skin:
    def __init__(self, verts, tris): self.v, self.t = np.asarray(verts), np.asarray(tris)
    def slice(self, z):
        P = self.v[self.t]; out = []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            za, zb = P[:, a, 2], P[:, b, 2]; m = (za - z) * (zb - z) < 0
            t = ((z - za[m]) / (zb[m] - za[m]))[:, None]; out.append(P[m, a] + (P[m, b] - P[m, a]) * t)
        s = np.vstack(out); return s[np.abs(s[:, 0]) < .3]                    # torso only (arms hang further out)
    def lateral(self, z, y0, y1):
        s = self.slice(z); s = s[(s[:, 1] > y0) & (s[:, 1] < y1)]; return np.abs(s[:, 0]).max() if len(s) else np.nan
    def front(self, z, x0=.02):
        s = self.slice(z); s = s[np.abs(s[:, 0]) < x0]; return s[:, 1].min() if len(s) else np.nan


def lateral_clearance(pts, skin, n=24):
    """median and min lateral tissue over the outermost bone points (by height bands)"""
    out = []
    zs = np.linspace(pts[:, 2].min() + .004, pts[:, 2].max() - .004, n)
    for z in zs:
        b = pts[np.abs(pts[:, 2] - z) < .004]
        if len(b) < 3: continue
        for sgn in (1, -1):
            bb = b[b[:, 0] * sgn > 0]
            if not len(bb): continue
            p = bb[np.argmax(np.abs(bb[:, 0]))]; sx = skin.lateral(z, p[1] - .02, p[1] + .02)
            if not np.isnan(sx): out.append(sx - abs(p[0]))
    out = np.array(out); return (float(np.median(out)), float(out.min())) if len(out) else (np.nan, np.nan)


# ---------------------------------------------------------------- pelvis
def pelvis_field(P, prm, ref):
    P = np.asarray(P, float).copy(); x, y, z = P[:, 0].copy(), P[:, 1].copy(), P[:, 2].copy()
    za, zt, zc = ref["za"], ref["zt"], ref["zc"]
    S = (prm["s_mid"] + prm["g_low"] * sstep(za, zt, z) + prm["bump"] * np.exp(-((z - za - .035) / .025) ** 2)
         + prm["g_top"] * sstep(za + .035, zc, z))                               # widest at the outlet, a soft bulge at the brim
    w = 1 - sstep(ref["za"] + .01, ref["za"] + .05, z)                          # pubic region only
    P[:, 1] = y - prm["B"] * np.maximum(0, ref["ya"] - y) * w
    P[:, 0] = x * S
    zp = ref["zp"]; P[:, 2] = np.where(z < zp, zp - (zp - z) * prm["hz"], zp + (z - zp) * (1 - (1 - prm["hz"]) * .5))
    return P


def fit_pelvis(hl, hr, sac, fhl, fhr, skin, base_scale_x, log=print):
    """hl/hr/sac: fitted bone vertices; fhl/fhr: femoral head centres; base_scale_x: x-scale already applied to the
    male pelvis (to recover its own proportions for the female ratios)."""
    m0, L = PM.measure(hl, hr, sac, fhl, fhr)
    # the male proportions before the skin fit squeezed x
    unx = lambda a: a * np.array([1 / base_scale_x, 1, 1])
    mm, _ = PM.measure(unx(hl), unx(hr), unx(sac), unx(fhl), unx(fhr))
    tgt = {k: mm[k] * RATIO[k] for k in RATIO}
    tgt["subpubic_angle"] = 88.0; tgt["bi_iliac"] = .265; tgt["pelvis_height"] = m0["pelvis_height"] * .93
    za, ya = L["acet"][2], L["acet"][1]; zt = min(hl[:, 2].min(), hr[:, 2].min()); zc = max(hl[:, 2].max(), hr[:, 2].max())
    ref = dict(za=za, ya=ya, zp=L["prom"][2], zt=zt, zc=zc)
    prm = dict(s_mid=1.05, g_low=.2, bump=.03, g_top=0., B=.15, hz=.95)
    H = np.vstack([hl, hr])

    def evaluate(p):
        f = lambda a: pelvis_field(a, p, ref)
        m, _ = PM.measure(f(hl), f(hr), f(sac), f(fhl[None])[0], f(fhr[None])[0])
        e = 0
        for k, t in tgt.items():
            sc = 30.0 if k == "subpubic_angle" else t
            e += ((m[k] - t) / sc) ** 2 * (.6 if k == "bi_iliac" else 1)
        FH = f(H); pub = FH[(np.abs(FH[:, 0]) < .02)]; pz = pub[np.argmin(pub[:, 1])]
        sf = skin.front(pz[2], .03)
        if not np.isnan(sf) and pz[1] - sf < .02: e += ((.02 - (pz[1] - sf)) / .005) ** 2   # >= 2 cm in front of the pubis
        crest = FH[FH[:, 2] > FH[:, 2].max() - .025]
        med, mn = lateral_clearance(crest, skin, 6)
        if not np.isnan(mn) and mn < .02: e += ((.02 - mn) / .005) ** 2           # keep >= 2 cm over the iliac crest
        return e, m
    grids = {"s_mid": np.arange(.95, 1.31, .01), "g_low": np.arange(0, .61, .02), "bump": np.arange(0, .151, .01),
             "g_top": np.arange(-.15, .21, .01), "B": np.arange(0, .51, .02), "hz": np.arange(.9, 1.001, .01)}
    best = evaluate(prm)[0]
    for it in range(4):
        for key, g in grids.items():
            vals = []
            for v in g:
                q = dict(prm); q[key] = float(v); vals.append(evaluate(q)[0])
            i = int(np.argmin(vals))
            if vals[i] < best: best, prm[key] = vals[i], float(g[i])
    e, m1 = evaluate(prm)
    log("FEM pelvis male-proportion", {k: round(v * (1 if k == "subpubic_angle" else 100), 1) for k, v in mm.items()})
    log("FEM pelvis before", {k: round(v * (1 if k == "subpubic_angle" else 100), 1) for k, v in m0.items()})
    log("FEM pelvis target", {k: round(v * (1 if k == "subpubic_angle" else 100), 1) for k, v in tgt.items()})
    log("FEM pelvis after ", {k: round(v * (1 if k == "subpubic_angle" else 100), 1) for k, v in m1.items()})
    log("FEM pelvis params", {k: round(v, 3) for k, v in prm.items()})
    return (lambda a: pelvis_field(a, prm, ref)), dict(before=m0, after=m1, target=tgt, params=prm)


# ---------------------------------------------------------------- rib cage
def thorax_field(P, prm, ref):
    P = np.asarray(P, float).copy(); x, y, z = P[:, 0].copy(), P[:, 1].copy(), P[:, 2].copy()
    # 1) shorter sternal body: anterior structures below the sternal angle move up toward it
    wa = sstep(-ref["y_cut"], -ref["y_front"], -y)                              # 0 behind y_cut .. 1 at the front of the sternum
    zb = ref["z_angle"]; below = z < zb
    z1 = np.where(below, zb - (zb - z) * (1 - (1 - prm["sternum"]) * wa), z)
    # 2) more inclined ribs: the further forward of the rib heads, the lower
    z1 = z1 - np.tan(np.radians(prm["incl"])) * np.maximum(0, ref["y_heads"] - y) * ref["w_rib"](z)
    # 3) narrower lower aperture
    sx = 1 - (1 - prm["low"]) * sstep(ref["z_xiph"], ref["z_low"], z)
    P[:, 0] = x * sx; P[:, 2] = z1
    return P


def fit_thorax(ribs, sternum_body, manubrium, spine_y, skin, log=print):
    st, mn = sternum_body, manubrium
    ref = dict(z_angle=st[:, 2].max(), y_front=st[:, 1].min(), y_cut=st[:, 1].min() + .07, y_heads=spine_y,
               z_xiph=st[:, 2].min(), z_low=ribs[:, 2].min(), w_rib=lambda z: np.ones_like(z))
    body_len, man_len = np.ptp(st[:, 2]), np.ptp(mn[:, 2])
    prm = dict(sternum=float(np.clip(1.85 * man_len / body_len, .8, 1.0)), incl=4.0, low=1.0)
    low_r = ribs[ribs[:, 2] < ref["z_xiph"]]
    best = None
    for c in np.arange(1.0, .85, -.01):                                          # narrow until ~1.8 cm of tissue
        q = dict(prm, low=float(c)); med, mnc = lateral_clearance(thorax_field(low_r, q, ref), skin, 10)
        best = c
        if med >= .018: break
    prm["low"] = float(best)
    med0, mn0 = lateral_clearance(low_r, skin, 10); med1, mn1 = lateral_clearance(thorax_field(low_r, prm, ref), skin, 10)
    log("FEM thorax sternal body", round(body_len * 100, 1), "->", round(body_len * prm["sternum"] * 100, 1), "cm (manubrium", round(man_len * 100, 1), ")")
    log("FEM thorax lower-rib lateral tissue cm", round(med0 * 100, 1), "->", round(med1 * 100, 1), "min", round(mn0 * 100, 1), "->", round(mn1 * 100, 1))
    log("FEM thorax params", {k: round(v, 3) for k, v in prm.items()})
    return (lambda a: thorax_field(a, prm, ref)), dict(params=prm, lateral_before=med0, lateral_after=med1)
